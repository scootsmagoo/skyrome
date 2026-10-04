/**
 * River-district landmarks (river- crew) on the REAL terrain, with the terrain's heightfield, the
 * water module's quay walls and every landmark's colliders in one physics world:
 *  - every assigned id builds at both details without NaNs and inside its triangle budget;
 *  - no NPC / vendor / seat / door spot is embedded in a collider or floats above the ground;
 *  - the Portus Tiberinus dresses the terrain's quay (cranes, cargo, storerooms on the quay top,
 *    boats against the wall, the landings at the water module's stairs);
 *  - the real Actor can walk into the Temple of Hercules Victor to its cella door, down from the
 *    quay to the Cloaca Maxima's grating, and up all six aisles of the Theatre of Marcellus.
 */
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import * as atlas from '../src/data/atlas';
import { Rng } from '../src/core/Rng';
import { Layer, initPhysics } from '../src/core/Physics';
import type { Game } from '../src/core/Game';
import { MeshBuilder, registerColliders } from '../src/gfx/MeshBuilder';
import { WORLD_SCALE, toGame } from '../src/world/coords';
import { bearingToRotationY } from '../src/core/math';
import { buildHeightmap, type Heightmap } from '../src/world/terrain/heightmap';
import { chain, resolveQuays } from '../src/world/terrain/riverbanks';
import { buildQuay } from '../src/world/water/quays';
import { landmarkPads } from '../src/world/rome/buildRome';
import type { LandmarkBuild, LandmarkBuilder, LandmarkContext, LandmarkData, Spot } from '../src/world/landmarks/types';
import { builders as boarium } from '../src/world/landmarks/builders/river-boarium';
import { builders as port } from '../src/world/landmarks/builders/river-port';
import { builders as holitorium } from '../src/world/landmarks/builders/river-holitorium';
import { builders as marcellus, theatreLayout } from '../src/world/landmarks/builders/river-marcellus';
import { builders as campus } from '../src/world/landmarks/builders/river-campus';
import { builders as island } from '../src/world/landmarks/builders/river-island';
import { quayEdge, riverEnv } from '../src/world/landmarks/builders/river-kit';
import { makeWorld, walk, type TestWorld } from './arch.walker';

const S = WORLD_SCALE;
const ALL: LandmarkBuilder[] = [...boarium, ...port, ...holitorium, ...marcellus, ...campus, ...island];

/** Assigned ids and their high-detail triangle budgets. */
const BUDGET: Record<string, number> = {
  'forum-boarium': 200_000,
  'portus-tiberinus': 120_000,
  'temple-portunus': 120_000,
  'temple-hercules-victor': 175_000,
  'ara-maxima': 30_000,
  'cloaca-maxima-outlet': 20_000,
  'forum-holitorium': 90_000,
  'temple-janus-holitorium': 30_000,
  'temple-juno-sospita': 30_000,
  'temple-spes': 30_000,
  'columna-lactaria': 5_000,
  'theatre-marcellus': 170_000,
  'temple-apollo-sosianus': 40_000,
  'temple-bellona': 30_000,
  'columna-bellica': 5_000,
  'porticus-octaviae': 160_000,
  'circus-flaminius': 60_000,
  'temple-aesculapius': 40_000,
  'island-prow': 10_000,
  'island-obelisk': 5_000,
};

/** Spot kinds that stand for a person (or the player) at that point. */
const OCCUPANT = new Set(['npc', 'vendor', 'stall', 'sit', 'spawn', 'door', 'shrine', 'inscription', 'vista', 'container']);

let hm: Heightmap;
let world: TestWorld;
const built = new Map<string, { lm: LandmarkData; ctx: LandmarkContext; build: LandmarkBuild; matrix: THREE.Matrix4 }>();

function ctxFor(lm: LandmarkData, detail: 'high' | 'low'): LandmarkContext {
  const [gx, gz] = toGame(lm.center[0], lm.center[1]);
  const baseY = hm.heightAt(gx, gz);
  const rotY = bearingToRotationY(lm.rotation);
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  return {
    game: { heightmap: hm } as never,
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

function builderOf(id: string): LandmarkBuilder {
  const b = ALL.find((x) => x.handles.includes(id));
  if (!b) throw new Error(`no builder for ${id}`);
  return b;
}

function triangles(o: THREE.Object3D): number {
  let n = 0;
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    const inst = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1;
    n += ((m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3) * inst;
  });
  return n;
}

/** World-space spots of a built landmark (same transform as buildLandmarks). */
function worldSpots(id: string): Spot[] {
  const e = built.get(id)!;
  const rotY = bearingToRotationY(e.lm.rotation);
  return (e.build.spots ?? []).map((s) => ({ ...s, position: s.position.clone().applyMatrix4(e.matrix), heading: (s.heading ?? 0) + rotY }));
}

function spotOf(id: string, spotId: string): Spot {
  const s = worldSpots(id).find((x) => x.id === spotId);
  if (!s) throw new Error(`no spot ${spotId}`);
  return s;
}

beforeAll(async () => {
  await initPhysics();
  const bounds = { minX: -900, maxX: -100, minZ: -260, maxZ: 660 };
  hm = buildHeightmap({ ...atlas, bounds } as never, { spacing: 2, pads: landmarkPads(atlas.CITY_BOUNDS) });
  world = makeWorld(false);
  const game = world.game as Game & { heightmap: Heightmap };
  game.heightmap = hm;
  // Terrain heightfields (as Terrain does, in chunks).
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
  // The water module's quay walls, stairs and the outfall gap.
  for (const river of hm.features!.rivers) {
    for (const rq of resolveQuays(hm.features!.quays, river.id, chain(river.centerline))) {
      const q = buildQuay(river, rq, (x, z) => hm.heightAt(x, z), S);
      registerColliders(game, q.colliders);
    }
  }
  // Every river landmark at the detail the game uses (all priority ≤ 2 in the core → high).
  for (const id of Object.keys(BUDGET)) {
    const lm = atlas.LANDMARK_BY_ID[id] as unknown as LandmarkData;
    const ctx = ctxFor(lm, 'high');
    const build = builderOf(id).build(ctx);
    const matrix = matrixFor(lm);
    built.set(id, { lm, ctx, build, matrix });
    registerColliders(game, build.colliders, matrix);
  }
  world.physics.step(1 / 60);
}, 120_000);

describe('river landmarks build', () => {
  for (const [id, budget] of Object.entries(BUDGET)) {
    it(`${id}: builds at both details, finite, inside ${Math.round(budget / 1000)}k triangles, with colliders and spots`, () => {
      const e = built.get(id)!;
      const tris = triangles(e.build.object);
      if (process.env.RIVER_TRIS) console.log(`${id}: ${Math.round(tris / 100) / 10}k high, ${Math.round(triangles(builderOf(id).build(ctxFor(e.lm, 'low')).object) / 100) / 10}k low`);
      expect(tris).toBeLessThan(budget);
      expect(e.build.colliders.length).toBeGreaterThan(0);
      expect((e.build.spots ?? []).length).toBeGreaterThan(0);
      e.build.object.traverse((c) => {
        const m = c as THREE.Mesh;
        if (!m.isMesh) return;
        const p = m.geometry.getAttribute('position').array as Float32Array;
        for (let i = 0; i < p.length; i += 97) expect(Number.isFinite(p[i])).toBe(true);
      });
      for (const s of e.build.spots ?? []) expect(Number.isFinite(s.position.x + s.position.y + s.position.z)).toBe(true);
      const low = builderOf(id).build(ctxFor(e.lm, 'low'));
      expect(triangles(low.object)).toBeLessThanOrEqual(tris * 1.05 + 1000);
    });
  }
});

describe('river landmark spots', () => {
  it('no person spot is embedded in a collider or floats above the ground', () => {
    const bad: string[] = [];
    const waterY = hm.waterLevelY;
    for (const id of Object.keys(BUDGET)) {
      for (const s of worldSpots(id)) {
        if (!OCCUPANT.has(s.kind)) continue;
        const p = s.position;
        // A standing person: feet and head spheres (0.3 m) clear of every collider (terrain
        // included). A seated one: the body (0.2 m sphere half a metre over the seat) clear.
        const sit = s.kind === 'sit';
        const feet = world.physics.overlapSphere({ x: p.x, y: p.y + (sit ? 0.5 : 0.45), z: p.z }, sit ? 0.2 : 0.3).length;
        const head = sit ? 0 : world.physics.overlapSphere({ x: p.x, y: p.y + 1.5, z: p.z }, 0.3).length;
        // Something to stand (or sit) on within 0.6 m below (water counts for the boatmen), and
        // not buried under the walking surface (the KCC snaps feet within ~0.15 m).
        const g = Math.max(world.physics.groundHeight(p.x, p.z, p.y + 0.3, 50) ?? -Infinity, s.id.includes(':boat-') ? waterY : -Infinity);
        const float = p.y - g;
        if (feet || head || float > (sit ? 0.08 : 0.6) || float < -0.15) bad.push(`${s.id} feet=${feet} head=${head} float=${float.toFixed(2)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('every inscription spot has a text for the reader', async () => {
    const { RIVER_TEXTS } = await import('../src/world/landmarks/builders/river-life');
    const missing: string[] = [];
    for (const id of Object.keys(BUDGET)) for (const s of worldSpots(id)) if (s.kind === 'inscription' && !RIVER_TEXTS[s.id]) missing.push(s.id);
    expect(missing).toEqual([]);
  });
});

describe('Portus Tiberinus on the terrain quay', () => {
  it('dresses the real quay: cranes, cargo, storerooms and the office on its top, landings at its stairs, boats against its wall', () => {
    const e = built.get('portus-tiberinus')!;
    const env = riverEnv(e.ctx);
    const q = quayEdge(e.ctx, env)!;
    expect(q).not.toBeNull();
    const top = q.top + env.baseY;
    const spots = worldSpots('portus-tiberinus');
    const onTop = spots.filter((s) => /:(crane|cargo|cella|statio|notice|quay|horrea)/.test(s.id));
    expect(onTop.length).toBeGreaterThan(8);
    for (const s of onTop) {
      const g = world.physics.groundHeight(s.position.x, s.position.z, s.position.y + 0.3, 20)!;
      expect(Math.abs(s.position.y - top), s.id).toBeLessThan(0.3);
      expect(Math.abs(g - s.position.y), s.id).toBeLessThan(0.3);
    }
    const landings = spots.filter((s) => s.id.includes(':landing-'));
    expect(landings.length).toBeGreaterThan(0);
    for (const s of landings) {
      const g = world.physics.groundHeight(s.position.x, s.position.z, s.position.y + 0.3, 20)!;
      expect(Math.abs(g - (hm.waterLevelY + 0.25)), s.id).toBeLessThan(0.3);
    }
    // Boats: in deep water, their hull centre 1–3 m out from the wall face.
    const boats = spots.filter((s) => s.id.includes(':boat-'));
    expect(boats.length).toBeGreaterThan(1);
    const inv = e.matrix.clone().invert();
    for (const s of boats) {
      const l = s.position.clone().applyMatrix4(inv);
      const pr = q.project(l.x, l.z);
      expect(pr.inland, s.id).toBeLessThan(-0.9);
      expect(pr.inland, s.id).toBeGreaterThan(-3.4);
      expect(hm.heightAt(s.position.x, s.position.z), s.id).toBeLessThan(hm.waterLevelY - 1);
    }
  });
});

describe('walking in', () => {
  it('Hercules Victor: through the door bay of the colonnade to the cella door', () => {
    const door = spotOf('temple-hercules-victor', 'temple-hercules-victor:door');
    const m = built.get('temple-hercules-victor')!.matrix;
    // Start out on the square beside the altar (it stands on the door axis), then straight in.
    const start = new THREE.Vector3(2.6, 0, -11).applyMatrix4(m);
    start.y += 0.2;
    const mid = new THREE.Vector3(0, 0, -7).applyMatrix4(m);
    const r = walk(world, start, [
      { to: [mid.x, mid.z], seconds: 6, reach: 0.3 },
      { to: [door.position.x, door.position.z], seconds: 10, reach: 0.25 },
    ]);
    expect(Math.hypot(r.x - door.position.x, r.z - door.position.z)).toBeLessThan(0.5);
    expect(Math.abs(r.y - door.position.y)).toBeLessThan(0.3);
  });

  it('Cloaca Maxima: from the quay down the flight, along the landing and the ledge to the grating', () => {
    const grate = spotOf('cloaca-maxima-outlet', 'cloaca-maxima-outlet:grate');
    const landing = spotOf('cloaca-maxima-outlet', 'cloaca-maxima-outlet:landing');
    // The grating spot faces inland, into the quay.
    const n = new THREE.Vector3(Math.sin(grate.heading!), 0, Math.cos(grate.heading!));
    const start = landing.position.clone().addScaledVector(n, 7.5);
    start.y = hm.heightAt(start.x, start.z) + 0.3;
    const front = grate.position.clone().addScaledVector(n, -4.1);
    const r = walk(world, start, [
      { to: [landing.position.x, landing.position.z], seconds: 10, reach: 0.3 },
      { to: [front.x, front.z], seconds: 8, reach: 0.3 },
      { to: [grate.position.x, grate.position.z], seconds: 8, reach: 0.25 },
    ]);
    expect(Math.abs(r.ends[0].y - landing.position.y)).toBeLessThan(0.3);
    expect(Math.hypot(r.x - grate.position.x, r.z - grate.position.z)).toBeLessThan(0.5);
    expect(Math.abs(r.y - grate.position.y)).toBeLessThan(0.3);
    // Headroom over the ledge at the grating: nothing within 2.1 m above the spot.
    const up = world.physics.raycast({ x: grate.position.x, y: grate.position.y + 0.2, z: grate.position.z }, { x: 0, y: 1, z: 0 }, 1.9, Layer.World);
    expect(up ? `hit at +${up.distance.toFixed(2)} m` : null).toBeNull();
  });

  it('Theatre of Marcellus: all six aisles climb from the orchestra to the top walk, even off their centre line', () => {
    const e = built.get('theatre-marcellus')!;
    const lay = theatreLayout(e.ctx);
    const topY = e.matrix.elements[13] + lay.caveaTop;
    const stuck: string[] = [];
    for (const [k, a] of lay.aisleAngles.entries()) {
      for (const off of [0, 0.4, -0.4]) {
        const tx = -Math.sin(a) * off, tz = Math.cos(a) * off; // sideways across the aisle
        const p0 = new THREE.Vector3(Math.cos(a) * (lay.ro - 1.5) + tx, 0.2, lay.z0 + Math.sin(a) * (lay.ro - 1.5) + tz).applyMatrix4(e.matrix);
        const p1 = new THREE.Vector3(Math.cos(a) * (lay.rb - 1.0) + tx, 0, lay.z0 + Math.sin(a) * (lay.rb - 1.0) + tz).applyMatrix4(e.matrix);
        const r = walk(world, p0, [{ to: [p1.x, p1.z], seconds: 16, reach: 0.4 }]);
        if (r.maxY < topY - 0.3) stuck.push(`aisle ${k} off ${off}: maxY ${r.maxY.toFixed(2)} < ${topY.toFixed(2)}`);
      }
    }
    expect(stuck).toEqual([]);
  }, 240_000);
});
