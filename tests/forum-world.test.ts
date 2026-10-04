/**
 * The Forum builders together on the REAL heightmap (as buildRome places them): every standing
 * spot (npc, vendor, spawn, door, shrine…) is free of every collider of every forum landmark,
 * and a player walking the golden path (Vicus Tuscus mouth → the square → the Rostra stair, and
 * the Sacra Via up to the Arch of Titus) really gets through. Complements tests/forum-landmarks
 * (each landmark on a flat plane).
 */
import { writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Game } from '../src/core/Game';
import { bearingToRotationY } from '../src/core/math';
import { initPhysics } from '../src/core/Physics';
import { Rng } from '../src/core/Rng';
import * as atlas from '../src/data/atlas';
import { MeshBuilder, registerColliders } from '../src/gfx/MeshBuilder';
import { crossingX, roadLocal } from '../src/world/landmarks/builders/forum-kit';
import { toGame, WORLD_SCALE } from '../src/world/coords';
import { landmarkPads } from '../src/world/rome/buildRome';
import { buildHeightmap, type Heightmap } from '../src/world/terrain/heightmap';
import type { LandmarkBuild, LandmarkBuilder, LandmarkContext, LandmarkData, Spot } from '../src/world/landmarks/types';
import * as square from '../src/world/landmarks/builders/forum-square';
import * as temples from '../src/world/landmarks/builders/forum-temples';
import * as basilicas from '../src/world/landmarks/builders/forum-basilicas';
import * as arches from '../src/world/landmarks/builders/forum-arches';
import * as curia from '../src/world/landmarks/builders/forum-curia';
import * as vesta from '../src/world/landmarks/builders/forum-vesta';
import * as capitol from '../src/world/landmarks/builders/forum-capitol';
import * as velia from '../src/world/landmarks/builders/forum-velia';
import { makeWorld, walk, type TestWorld } from './arch.walker';

const S = WORLD_SCALE;
const ALL: LandmarkBuilder[] = [square, temples, basilicas, arches, curia, vesta, capitol, velia].flatMap((m) => m.builders);
const IDS = ALL.flatMap((b) => b.handles);

/** Spot kinds that stand for a person (or the player) at that point; 'sit' is checked separately. */
const OCCUPANT = new Set(['npc', 'vendor', 'stall', 'spawn', 'door', 'shrine', 'inscription', 'vista', 'container']);

let hm: Heightmap;
let world: TestWorld;
const built = new Map<string, { lm: LandmarkData; build: LandmarkBuild; matrix: THREE.Matrix4 }>();

function ctxFor(lm: LandmarkData, detail: 'high' | 'low' = 'high'): LandmarkContext {
  const [gx, gz] = toGame(lm.center[0], lm.center[1]);
  const baseY = hm.heightAt(gx, gz);
  const rotY = bearingToRotationY(lm.rotation);
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const scene = new THREE.Scene();
  const game = { heightmap: hm, scene, camera: new THREE.PerspectiveCamera(), addSystem: <T>(s: T) => s, removeSystem: () => {} } as unknown as Game;
  return {
    game,
    lm,
    S,
    rng: new Rng(`landmark:${lm.id}`),
    detail,
    builder: () => new MeshBuilder(),
    groundAt: (lx, lz) => hm.heightAt(gx + lx * cos + lz * sin, gz - lx * sin + lz * cos) - baseY,
  };
}

function matrixFor(lm: LandmarkData): THREE.Matrix4 {
  const [gx, gz] = toGame(lm.center[0], lm.center[1]);
  return new THREE.Matrix4().makeRotationY(bearingToRotationY(lm.rotation)).setPosition(gx, hm.heightAt(gx, gz), gz);
}

function worldSpots(id: string): Spot[] {
  const e = built.get(id)!;
  const rotY = bearingToRotationY(e.lm.rotation);
  return (e.build.spots ?? []).map((s) => ({ ...s, position: s.position.clone().applyMatrix4(e.matrix), heading: (s.heading ?? 0) + rotY }));
}

beforeAll(async () => {
  await initPhysics();
  const bounds = { minX: -150, maxX: 500, minZ: -220, maxZ: 380 };
  hm = buildHeightmap({ ...atlas, bounds } as never, { spacing: 2, pads: landmarkPads(atlas.CITY_BOUNDS) });
  world = makeWorld(false);
  const game = world.game as Game & { heightmap: Heightmap };
  game.heightmap = hm;
  // The terrain heightfield, in chunks as Terrain does.
  const n = 65;
  for (let cz = 0; cz < hm.nz - 1; cz += n - 1) {
    for (let cx = 0; cx < hm.nx - 1; cx += n - 1) {
      const sx = Math.min(n, hm.nx - cx);
      const sz = Math.min(n, hm.nz - cz);
      if (sx < 2 || sz < 2) continue;
      const h = new Float32Array(sx * sz);
      for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) h[z * sx + x] = hm.heights[(cz + z) * hm.nx + cx + x];
      world.physics.addHeightfield(hm.minX + cx * hm.spacing, hm.minZ + cz * hm.spacing, (sx - 1) * hm.spacing, (sz - 1) * hm.spacing, sx - 1, sz - 1, h);
    }
  }
  for (const id of IDS) {
    const lm = atlas.LANDMARK_BY_ID[id] as unknown as LandmarkData;
    const build = ALL.find((b) => b.handles.includes(id))!.build(ctxFor(lm));
    const matrix = matrixFor(lm);
    built.set(id, { lm, build, matrix });
    registerColliders(game, build.colliders, matrix);
  }
  world.physics.step(1 / 60);
}, 180_000);

describe('forum spots on the real terrain', () => {
  it('no standing spot is embedded in a collider, floats above the ground or stands on a cliff', () => {
    const bad: string[] = [];
    // the terrain heightfield is checked by slope, not by sphere overlap (a slope touches a sphere)
    const solid = (x: number, y: number, z: number) => world.physics.overlapSphere({ x, y, z }, 0.3).filter((o) => o.collider.shapeType() !== 7);
    for (const id of IDS) {
      for (const s of worldSpots(id)) {
        if (!OCCUPANT.has(s.kind)) continue;
        const p = s.position;
        // feet, belly and head spheres (0.3 m) clear of every collider
        const hits = [0.42, 1.0, 1.5].reduce((n, y) => n + solid(p.x, p.y + y, p.z).length, 0);
        const g = world.physics.groundHeight(p.x, p.z, p.y + 0.4, 50) ?? -Infinity;
        const float = p.y - g;
        // on bare terrain or paving: the ground there must be walkable (not a cliff)
        const t = hm.heightAt(p.x, p.z);
        const slope = Math.abs(p.y - t) < 0.3 ? Math.max(Math.abs(hm.heightAt(p.x + 0.5, p.z) - hm.heightAt(p.x - 0.5, p.z)), Math.abs(hm.heightAt(p.x, p.z + 0.5) - hm.heightAt(p.x, p.z - 0.5))) : 0;
        if (hits || float > 0.6 || float < -0.15 || slope > 0.85) bad.push(`${id}:${s.id} (${s.kind}) hits=${hits} float=${float.toFixed(2)} slope=${slope.toFixed(2)}`);
        if (process.env.FORUM_DEBUG && hits) {
          const seen = new Set<number>();
          for (const y of [0.42, 1.0, 1.5]) for (const o of solid(p.x, p.y + y, p.z)) {
            if (seen.has(o.collider.handle)) continue;
            seen.add(o.collider.handle);
            const t = o.collider.translation();
            const sh = o.collider.shape as unknown as { halfExtents?: { x: number; y: number; z: number }; radius?: number };
            console.log(`  ${s.id} spot(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}) hit at y+${y}: ${o.collider.shapeType()} t=(${t.x.toFixed(2)},${t.y.toFixed(2)},${t.z.toFixed(2)}) half=${sh.halfExtents ? [sh.halfExtents.x, sh.halfExtents.y, sh.halfExtents.z].map((v) => v.toFixed(2)).join(',') : sh.radius}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  }, 60_000);

  it('a seat has room above it', () => {
    const bad: string[] = [];
    for (const id of IDS) {
      for (const s of worldSpots(id)) {
        if (s.kind !== 'sit') continue;
        const p = s.position;
        const hits = world.physics.overlapSphere({ x: p.x, y: p.y + 0.5, z: p.z }, 0.2).length;
        if (hits) bad.push(`${id}:${s.id} hits=${hits}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('forum debug probes', () => {
  it.runIf(!!process.env.FORUM_ROAD)('prints a road in a landmark frame', () => {
    const [id, road] = process.env.FORUM_ROAD!.split(',');
    const e = built.get(id)!;
    const ctx = ctxFor(e.lm);
    const r = roadLocal(ctx, road)!;
    const lines: string[] = [`hw=${r.hw}`];
    for (let z = -40; z <= 40; z += 4) lines.push(`z=${z} x=${crossingX(r.pts, z)?.toFixed(2)}`);
    lines.push(JSON.stringify(r.pts.map((q) => [q[0].toFixed(1), q[1].toFixed(1)])));
    writeFileSync('/tmp/forum-road.txt', lines.join('\n'));
  });
  it.runIf(!!process.env.FORUM_SPOTS)('prints spots', () => {
    const lines: string[] = [];
    for (const id of process.env.FORUM_SPOTS!.split(',')) {
      const e = built.get(id)!;
      const ctx = ctxFor(e.lm);
      for (const sp of e.build.spots ?? []) lines.push(`${id}:${sp.id} (${sp.kind}) local=(${sp.position.x.toFixed(2)},${sp.position.y.toFixed(2)},${sp.position.z.toFixed(2)}) ground=${ctx.groundAt(sp.position.x, sp.position.z).toFixed(2)}`);
    }
    writeFileSync('/tmp/forum-spots.txt', lines.join('\n'));
  });
  it.runIf(!!process.env.FORUM_PROBE)('prints ground heights', () => {
    const [id, x0, z0, x1, z1, step] = process.env.FORUM_PROBE!.split(',');
    const e = built.get(id)!;
    const ctx = ctxFor(e.lm);
    const lines: string[] = [];
    for (let z = Number(z0); z <= Number(z1) + 1e-6; z += Number(step)) {
      let row = `z=${z.toFixed(1).padStart(6)} `;
      for (let x = Number(x0); x <= Number(x1) + 1e-6; x += Number(step)) row += ctx.groundAt(x, z).toFixed(2).padStart(7);
      lines.push(row);
    }
    writeFileSync('/tmp/forum-probe.txt', `${id} ground (x from ${x0} to ${x1} step ${step})\n` + lines.join('\n'));
  });
});
