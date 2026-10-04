/**
 * The atlas stairways (Scalae Caci, Centum Gradus, Gradus Monetae) and the parked carts: every
 * stairway climbs at a walkable grade from the street at its foot to the ground at its top, and the
 * REAL Actor walks it both ways through Rapier, on the terrain's heightfield, with every street
 * piece and prop of the cells around it. No parked cart stands on steps, roads or a slope.
 */
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics } from '../src/core/Physics';
import { MeshBuilder } from '../src/gfx/MeshBuilder';
import { polylineLen, scaleBounds } from '../src/world/city/plan';
import { K } from '../src/world/city/raster';
import { STAIR_MAX_GRADE, cartGround, nearestOnPolyline, stairProfile, streetWork } from '../src/world/city/roads';
import { Actor } from '../src/actors/Actor';
import { Layer } from '../src/core/Physics';
import { addColliders, makeWorld, type TestWorld } from './arch.walker';
import { cityFixture } from './city.fixture';
import * as atlas from '../src/data/atlas';

const { hm, plan } = cityFixture();
const H = (x: number, z: number) => hm.heightAt(x, z);
const stairs = plan.roads.filter((r) => r.style === 'stairs');

beforeAll(async () => {
  await initPhysics();
});

/** A physics world with the terrain heightfield and the city's street cells around a box. */
function worldAround(b: { minX: number; minZ: number; maxX: number; maxZ: number }): TestWorld {
  const world = makeWorld(false);
  const sp = hm.spacing;
  const ix0 = Math.max(0, Math.floor((b.minX - hm.minX) / sp)), ix1 = Math.min(hm.nx - 1, Math.ceil((b.maxX - hm.minX) / sp));
  const iz0 = Math.max(0, Math.floor((b.minZ - hm.minZ) / sp)), iz1 = Math.min(hm.nz - 1, Math.ceil((b.maxZ - hm.minZ) / sp));
  const sx = ix1 - ix0 + 1, sz = iz1 - iz0 + 1;
  const h = new Float32Array(sx * sz);
  for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) h[z * sx + x] = hm.heights[(iz0 + z) * hm.nx + ix0 + x];
  world.physics.addHeightfield(hm.minX + ix0 * sp, hm.minZ + iz0 * sp, (sx - 1) * sp, (sz - 1) * sp, sx - 1, sz - 1, h);
  const work = streetWork(plan, H, scaleBounds(atlas.CORE_BOUNDS, 150), 128);
  const mb = new MeshBuilder();
  for (const c of work.cells.values()) {
    if (c.cx + 64 < b.minX || c.cx - 64 > b.maxX || c.cz + 64 < b.minZ || c.cz - 64 > b.maxZ) continue;
    for (const item of [...c.items, ...c.detail]) item(mb);
  }
  addColliders(world.physics, mb);
  return world;
}

describe('atlas stairways', () => {
  it('has the three stairways of the core', () => {
    expect(stairs.map((r) => r.id).sort()).toEqual(['centum-gradus', 'gradus-monetae', 'scalae-caci']);
  });

  it('climbs at a walkable grade, on or above the ground, from ground to ground', () => {
    for (const r of stairs) {
      const sp = stairProfile(r.points, H);
      for (let i = 1; i < sp.s.length; i++) {
        const grade = Math.abs(sp.y[i] - sp.y[i - 1]) / (sp.s[i] - sp.s[i - 1]);
        expect(grade, r.id).toBeLessThanOrEqual(STAIR_MAX_GRADE + 1e-6);
      }
      // Both ends meet the ground (no step up from the street below, none onto the hill above).
      const p0 = sp.path[0], p1 = sp.path[sp.path.length - 1];
      expect(Math.abs(sp.y[0] - (H(p0[0], p0[1]) + 0.05)), r.id).toBeLessThan(0.1);
      expect(Math.abs(sp.y[sp.y.length - 1] - (H(p1[0], p1[1]) + 0.05)), r.id).toBeLessThan(0.1);
    }
  });

  for (const r of stairs) {
    it(`the Actor walks the ${r.name} up and down`, () => {
      const sp = stairProfile(r.points, H);
      const path = sp.path;
      const n = path.length;
      const d0 = dir(path[1], path[0]), d1 = dir(path[n - 2], path[n - 1]);
      // From 3 m beyond each end (on the street / hill) to 3 m beyond the other.
      const a: [number, number] = [path[0][0] + d0[0] * 3, path[0][1] + d0[1] * 3];
      const b: [number, number] = [path[n - 1][0] + d1[0] * 3, path[n - 1][1] + d1[1] * 3];
      let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
      for (const p of [a, b, ...path]) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]); }
      const world = worldAround({ minX: minX - 20, minZ: minZ - 20, maxX: maxX + 20, maxZ: maxZ + 20 });
      for (const [from, to, route] of [[a, b, path], [b, a, [...path].reverse()]] as const) {
        const start = new THREE.Vector3(from[0], H(from[0], from[1]) + 0.3, from[1]);
        const legs = [...route.map((p) => ({ to: [p[0], p[1]] as [number, number], seconds: 12, reach: 0.7 })), { to: [to[0], to[1]] as [number, number], seconds: 8, reach: 0.5 }];
        const track: THREE.Vector3[] = [];
        const res = walkTracked(world, start, legs, track);
        world.physics.removeCharacter(res.actor.body);
        const label = `${r.id} ${from === a ? 'up' : 'down'}`;
        expect(Math.hypot(res.x - to[0], res.z - to[1]), label).toBeLessThan(0.8);
        // On the steps all the way: never a climb or drop steeper than a flight (a scramble up the
        // cliff beside the stairs, or a fall off them, would show here).
        const on = track.filter((q) => {
          const n = nearestOnPolyline([q.x, q.z], path);
          return n.d < r.carriage && n.s > 0.3 && n.s < polylineLen(path) - 0.3;
        });
        expect(on.length, label).toBeGreaterThan(20);
        expect(steepest(on), label).toBeLessThan(STAIR_MAX_GRADE + 0.15);
      }
    }, 60_000);
  }
});

describe('parked carts', () => {
  it('stand only on open, level ground', () => {
    // On a stairway band and on a steep slope a cart is refused.
    const cg = stairs.find((r) => r.id === 'gradus-monetae')!;
    const mid = cg.points[1];
    const t: [number, number] = dir(cg.points[0], cg.points[1]);
    expect(cartGround(plan, H, mid[0], mid[1], t)).toBe(false);
    // Every cart the street work places passes the test, and none is near a stairway.
    const work = streetWork(plan, H, scaleBounds(atlas.CORE_BOUNDS, 150), 128);
    expect(work.carts.length).toBeGreaterThan(4);
    for (const c of work.carts) {
      expect(cartGround(plan, H, c.x, c.z, [Math.sin(c.heading), Math.cos(c.heading)])).toBe(true);
      for (const r of stairs) {
        const sp = stairProfile(r.points, H);
        for (const p of sp.path) expect(Math.hypot(p[0] - c.x, p[1] - c.z)).toBeGreaterThan(3);
        expect(plan.grid.at(c.x, c.z)).not.toBe(K.ROAD);
      }
    }
    void K;
  });
});

/** arch.walker's walk, recording the Actor's feet every step. */
function walkTracked(world: TestWorld, start: THREE.Vector3Like, legs: { to: [number, number]; seconds: number; reach: number }[], track: THREE.Vector3[]) {
  const actor = new Actor(world.game, { id: 'walker', position: start, layer: Layer.Player });
  world.physics.step(1 / 60);
  const wish = new THREE.Vector3();
  for (const leg of legs) {
    for (let i = 0; i < leg.seconds * 60; i++) {
      const p = actor.position;
      wish.set(leg.to[0] - p.x, 0, leg.to[1] - p.z);
      if (wish.length() < leg.reach) break;
      wish.normalize().multiplyScalar(4.4);
      actor.heading = Math.atan2(wish.x, wish.z);
      actor.locomote(wish, 1 / 60);
      world.physics.step(1 / 60);
      track.push(actor.position.clone());
    }
  }
  return { x: actor.position.x, z: actor.position.z, actor };
}

/** Steepest grade between track points ≥ 1 m apart horizontally (over ≤ 1.5 m). */
function steepest(track: THREE.Vector3[]): number {
  let worst = 0;
  for (let i = 0, j = 0; i < track.length; i++) {
    while (j < track.length && Math.hypot(track[j].x - track[i].x, track[j].z - track[i].z) < 1) j++;
    if (j >= track.length) break;
    const dh = Math.hypot(track[j].x - track[i].x, track[j].z - track[i].z);
    if (dh <= 1.5) {
      const g = Math.abs(track[j].y - track[i].y) / dh;
      if (g > worst && process.env.DEBUGSTAIRS) console.log('steep', g.toFixed(2), track[i].toArray().map((v) => v.toFixed(2)), track[j].toArray().map((v) => v.toFixed(2)));
      worst = Math.max(worst, g);
    }
  }
  return worst;
}

function dir(from: readonly number[], to: readonly number[]): [number, number] {
  const x = to[0] - from[0], z = to[1] - from[1];
  const l = Math.hypot(x, z) || 1;
  return [x / l, z / l];
}
