/**
 * Palatine / Circus Maximus / Porta Capena (palcirc crew) on the REAL terrain: the atlas
 * heightmap's heightfield and every palcirc landmark's colliders in one physics world, so the
 * checks see the slopes, pad ramps and drops the flat-ground tests in palcirc.test.ts cannot.
 *  - every spot (NPC, vendor, seat, door, inscription, vista…) stands on a surface and is clear
 *    of masonry;
 *  - every inscription spot has a text to read and every text a spot;
 *  - the real Actor walks the Augustana's gallery over the Circus, climbs the temples' great
 *    stairs from the ground, walks in through the Porta Capena, into the Lupercal's niche and up
 *    into the Adonaea's garden.
 */
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import * as atlas from '../src/data/atlas';
import { Rng } from '../src/core/Rng';
import { RAPIER, initPhysics } from '../src/core/Physics';
import type { Game } from '../src/core/Game';
import { MeshBuilder, registerColliders, transformCollider } from '../src/gfx/MeshBuilder';
import { WORLD_SCALE, toGame } from '../src/world/coords';
import { bearingToRotationY } from '../src/core/math';
import { buildHeightmap, type Heightmap } from '../src/world/terrain/heightmap';
import { landmarkPads } from '../src/world/rome/buildRome';
import type { LandmarkBuild, LandmarkBuilder, LandmarkContext, LandmarkData, Spot } from '../src/world/landmarks/types';
import { builders as circusBuilders } from '../src/world/landmarks/builders/palcirc-circus';
import { builders as capenaBuilders } from '../src/world/landmarks/builders/palcirc-capena';
import { builders as palaceBuilders, AUG } from '../src/world/landmarks/builders/palcirc-palace';
import { builders as germalusBuilders } from '../src/world/landmarks/builders/palcirc-germalus';
import { augFacadePlan } from '../src/world/landmarks/builders/palcirc/augFacade';
import { PALCIRC_INSCRIPTIONS, PALCIRC_SHRINES, PALCIRC_VISTAS } from '../src/world/landmarks/builders/palcirc/texts';
import { spotInteraction } from '../src/world/landmarks/builders/palcirc/life';
import { makeWorld, walk as walkRaw, type Leg, type TestWorld } from './arch.walker';

const ALL: LandmarkBuilder[] = [...circusBuilders, ...capenaBuilders, ...palaceBuilders, ...germalusBuilders];
const IDS = ALL.flatMap((b) => b.handles);

let hm: Heightmap;
let world: TestWorld;
const built = new Map<string, { lm: LandmarkData; build: LandmarkBuild; matrix: THREE.Matrix4 }>();

function ctxFor(lm: LandmarkData, detail: 'high' | 'low'): LandmarkContext {
  const [gx, gz] = toGame(lm.center[0], lm.center[1]);
  const baseY = hm.heightAt(gx, gz);
  const rotY = bearingToRotationY(lm.rotation);
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const game = { heightmap: hm, physics: world.physics, scene: { add() {} }, addSystem() {}, removeSystem() {}, camera: { position: new THREE.Vector3() } };
  return {
    game: game as never,
    lm,
    S: WORLD_SCALE,
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

/** World position of a point in a landmark's local frame. */
function at(id: string, x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, y, z).applyMatrix4(built.get(id)!.matrix);
}

/** Local position (in landmark `id`'s frame) of a world point. */
function local(id: string, p: THREE.Vector3Like): THREE.Vector3 {
  return new THREE.Vector3(p.x, p.y, p.z).applyMatrix4(built.get(id)!.matrix.clone().invert());
}

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

/** The shared walker, removing its capsule afterwards (a leftover would stand in the next walker's way). */
function walk(w: TestWorld, start: THREE.Vector3Like, legs: Leg[]) {
  const r = walkRaw(w, start, legs);
  w.physics.removeCharacter(r.actor.body);
  return r;
}

/** Walks from local `a` toward local `b` (y ignored) in landmark `id`'s frame; returns the end in local coordinates. */
function walkLocal(id: string, a: [number, number, number], legs: [number, number][], seconds = 12, speed = 3.5) {
  const start = at(id, a[0], a[1], a[2]);
  const r = walk(
    world,
    start,
    legs.map(([x, z]) => {
      const p = at(id, x, 0, z);
      return { to: [p.x, p.z] as [number, number], seconds, speed, reach: 0.3 };
    }),
  );
  return { end: local(id, r), maxY: r.maxY, world: r };
}

beforeAll(async () => {
  await initPhysics();
  const bounds = { minX: -420, maxX: 720, minZ: 60, maxZ: 1260 };
  hm = buildHeightmap({ ...atlas, bounds } as never, { spacing: 2, pads: landmarkPads(atlas.CITY_BOUNDS) });
  world = makeWorld(false);
  const game = world.game as Game & { heightmap: Heightmap };
  game.heightmap = hm;
  // Terrain heightfields in chunks, as Terrain does.
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
  for (const b of ALL) {
    for (const id of b.handles) {
      const lm = atlas.LANDMARK_BY_ID[id] as unknown as LandmarkData;
      const build = b.build(ctxFor(lm, 'high'));
      const matrix = matrixFor(lm);
      built.set(id, { lm, build, matrix });
      registerColliders(game, build.colliders, matrix, id);
    }
  }
  world.physics.step(1 / 60);
}, 180_000);

describe('palcirc spots on the real terrain', () => {
  it('every spot stands on a surface (within 0.3 m) and a person there is clear of every collider', () => {
    const bad: string[] = [];
    let n = 0;
    for (const id of IDS) {
      for (const s of worldSpots(id)) {
        n++;
        const p = s.position;
        const sit = s.kind === 'sit';
        const feet = world.physics.overlapSphere({ x: p.x, y: p.y + (sit ? 0.5 : 0.45), z: p.z }, sit ? 0.2 : 0.28).length;
        const head = sit ? 0 : world.physics.overlapSphere({ x: p.x, y: p.y + 1.5, z: p.z }, 0.28).length;
        const g = world.physics.groundHeight(p.x, p.z, p.y + 0.6, 60) ?? -Infinity;
        const float = p.y - g;
        if (feet || head || float > (sit ? 0.1 : 0.3) || float < -0.15) bad.push(`${id}/${s.id} feet=${feet} head=${head} float=${float.toFixed(2)}`);
      }
    }
    expect(n).toBeGreaterThan(150);
    expect(bad).toEqual([]);
  });

  it('every inscription spot has a text to read, and every text a spot', () => {
    const ids = new Set(IDS.flatMap((id) => worldSpots(id).filter((s) => s.kind === 'inscription').map((s) => s.id)));
    expect([...ids].filter((id) => !PALCIRC_INSCRIPTIONS[id])).toEqual([]);
    expect(Object.keys(PALCIRC_INSCRIPTIONS).filter((id) => !ids.has(id))).toEqual([]);
  });

  it('every inscription, vista and shrine spot is something the player can do (Read, Look out, Pray, Drink)', () => {
    const inert: string[] = [];
    const verbs = new Set<string>();
    for (const id of IDS) {
      for (const s of worldSpots(id)) {
        if (!['inscription', 'vista', 'shrine'].includes(s.kind)) continue;
        const it = spotInteraction(s);
        if (!it) inert.push(`${id}/${s.id}`);
        else verbs.add(it.verb());
      }
      // Every vendor sells something over the counter (the customs booth excepted).
      for (const s of worldSpots(id)) if (s.kind === 'vendor' && !/customs/.test(s.id) && !spotInteraction(s)) inert.push(`${id}/${s.id}`);
    }
    expect(inert).toEqual([]);
    expect([...verbs].sort()).toEqual(['Drink', 'Look out', 'Pray', 'Read']);
    // Every vista and shrine text belongs to a spot.
    const all = new Set(IDS.flatMap((id) => worldSpots(id).map((s) => s.id)));
    expect([...Object.keys(PALCIRC_VISTAS), ...Object.keys(PALCIRC_SHRINES)].filter((k) => !all.has(k))).toEqual([]);
  });

  it('the quest spots at the spawn are in the open: in the passage or before the arch, on the road', () => {
    for (const sid of ['spawn-capena', 'courier-ambush', 'capena-grassator-a', 'capena-grassator-b', 'night-cart']) {
      const s = spotOf('porta-capena', sid);
      const l = local('porta-capena', s.position);
      expect(Math.abs(l.x), sid).toBeLessThan(8);
    }
    const b = local('porta-capena', spotOf('porta-capena', 'capena-grassator-b').position);
    expect(Math.abs(b.x)).toBeLessThan(1.5);
  });
});

/** Landmarks built into another's colliders on purpose (nested in the circus's spina and stands). */
const NESTED = new Set(['circus-maximus|obelisk-circus-maximus', 'circus-maximus|pulvinar', 'circus-maximus|temple-sol-circus']);

describe('palcirc landmarks do not interpenetrate', () => {
  it('no collider of one palcirc landmark cuts into another\'s (beyond 0.1 m)', () => {
    const pairs = new Map<string, { n: number; at: THREE.Vector3 }>();
    for (const id of IDS) {
      for (const c0 of built.get(id)!.build.colliders) {
        if (c0.kind === 'trimesh') continue;
        const c = transformCollider(c0, built.get(id)!.matrix);
        if (c.kind === 'trimesh') continue;
        const shape = c.kind === 'box'
          ? new RAPIER.Cuboid(Math.max(0.01, c.half.x - 0.1), Math.max(0.01, c.half.y - 0.1), Math.max(0.01, c.half.z - 0.1))
          : new RAPIER.Cylinder(Math.max(0.01, c.halfHeight - 0.1), Math.max(0.01, c.radius - 0.1));
        const rot = c.kind === 'box' ? c.rotation ?? new THREE.Quaternion() : new THREE.Quaternion();
        world.physics.world.intersectionsWithShape(c.center, { x: rot.x, y: rot.y, z: rot.z, w: rot.w }, shape, (hit) => {
          const other = world.physics.ownerOf(hit) as string | undefined;
          if (!other || other === id) return true;
          const key = [id, other].sort().join('|');
          if (NESTED.has(key)) return true;
          const e = pairs.get(key);
          if (e) e.n++;
          else pairs.set(key, { n: 1, at: c.center.clone() });
          return true;
        });
      }
    }
    const out = [...pairs].map(([k, v]) => `${k} ×${v.n} near (${v.at.x.toFixed(0)}, ${v.at.y.toFixed(0)}, ${v.at.z.toFixed(0)})`);
    expect(out).toEqual([]);
  });
});

describe('walking the palcirc landmarks on the real terrain', () => {
  it('Domus Augustana: down the corridor onto the gallery over the Circus and along its axis, without falling through', () => {
    const plan = augFacadePlan(AUG.front, AUG.hw);
    // Straight down the corridor's axis (x = 0, where the bay seams were), to the colonnade.
    const r = walkLocal('domus-augustana', [0, AUG.low + 0.3, -50], [[0, plan.zc + plan.R + 2.2]], 10);
    expect(r.end.z).toBeLessThan(plan.zc + plan.Rb - 1);
    expect(Math.abs(r.end.y - AUG.low)).toBeLessThan(0.3);
    // ...then along the gallery across every bay seam, both ways.
    for (const sx of [-1, 1]) {
      const a = plan.a0 + 0.12, b2 = plan.a1 - 0.12;
      const rr = plan.R + 2.4;
      const pts: [number, number][] = [];
      for (let k = 0; k <= 8; k++) {
        const t = sx > 0 ? a + ((b2 - a) * k) / 8 : b2 - ((b2 - a) * k) / 8;
        pts.push([Math.cos(t) * rr, plan.zc + Math.sin(t) * rr]);
      }
      const g = walkLocal('domus-augustana', [pts[0][0], AUG.low + 0.3, pts[0][1]], pts.slice(1), 6);
      expect(Math.abs(g.end.y - AUG.low), `side ${sx}`).toBeLessThan(0.3);
    }
  });

  it('Domus Augustana: a person put down at the gallery vista and seat stays there', () => {
    for (const sid of ['augustana-vista-circus', 'augustana-exedra-seat']) {
      const s = spotOf('domus-augustana', sid);
      const r = walk(world, { x: s.position.x, y: s.position.y + 0.3, z: s.position.z }, [{ dir: [0, 1], seconds: 2, speed: 0 }]);
      expect(Math.abs(r.y - s.position.y), sid).toBeLessThan(0.35);
    }
  });

  it('Domus Augustana: from the forecourt into a taberna under the curved facade', () => {
    const shops = worldSpots('domus-augustana').filter((s) => /augustana-taberna-/.test(s.id));
    expect(shops.length).toBeGreaterThanOrEqual(2);
    for (const sp of shops) {
      const l = local('domus-augustana', sp.position);
      // Start 6 m out on the forecourt, straight in front of the shop (the spot faces the street).
      const h = (sp.heading ?? 0) - bearingToRotationY(built.get('domus-augustana')!.lm.rotation);
      const sx = l.x + Math.sin(h) * 6, sz = l.z + Math.cos(h) * 6;
      const start = at('domus-augustana', sx, 0, sz);
      start.y = (world.physics.groundHeight(start.x, start.z, start.y + 40, 80) ?? start.y) + 0.2;
      const r = walk(world, start, [{ to: [sp.position.x, sp.position.z], seconds: 6, speed: 2.5, reach: 0.3 }]);
      expect(Math.hypot(r.x - sp.position.x, r.z - sp.position.z), sp.id).toBeLessThan(0.6);
      expect(Math.abs(r.y - sp.position.y), sp.id).toBeLessThan(0.3);
    }
  });

  it('Domus Augustana: up the entrance stair from the Area Palatina side', () => {
    const s = spotOf('domus-augustana', 'augustana-entrance');
    const l = local('domus-augustana', s.position);
    const r = walkLocal('domus-augustana', [l.x, l.y + 0.2, l.z], [[0, 60.6]], 14);
    expect(r.end.y).toBeGreaterThan(AUG.up - 0.3);
  });

  // Temple stairs, from the ground before them (past the altar) up to the cella door. Each route
  // starts from a spot the builder places relative to the stair's foot.
  const temples: [string, string, (p: THREE.Vector3) => [number, number][]][] = [
    // Inscription spot 4 m before the stair's foot (on the axis; the altar stands aside).
    ['temple-magna-mater', 'magna-mater-inscription', (p) => [[0, p.z + 4.6]]],
    // Victory's altar is on the axis, 2 m before the stair: go round it.
    ['temple-victoria', 'victoria-altar', (p) => [[1.7, p.z], [1.7, p.z + 2.8], [0, p.z + 3.8]]],
    // Apollo's priest stands between the altar and the stair.
    ['temple-apollo-palatinus', 'apollo-altar', (p) => [[0, p.z + 0.6]]],
  ];
  for (const [id, sid, route] of temples) {
    it(`${id}: up the great stair from the ground in front to the cella door`, () => {
      const door = local(id, (built.get(id)!.build.spots ?? []).find((s) => s.kind === 'door' && /door/.test(s.id))!.position.clone().applyMatrix4(built.get(id)!.matrix));
      const s = local(id, spotOf(id, sid).position);
      const r = walkLocal(id, [s.x, s.y + 0.2, s.z], [...route(s), [0, door.z]], 14);
      expect(r.end.y, id).toBeGreaterThan(door.y - 0.3);
    });
  }

  it('Porta Capena: from the spawn through the gate into the square', () => {
    const s = spotOf('porta-capena', 'spawn-capena');
    const l = local('porta-capena', s.position);
    const r = walkLocal('porta-capena', [l.x, l.y + 0.2, l.z], [[-0.8, 0], [-0.8, 9]], 12);
    expect(r.end.z).toBeGreaterThan(8);
  });

  it('Lupercal: from the inscription into the cave niche to the shrine', () => {
    const a = local('lupercal', spotOf('lupercal', 'lupercal-inscription').position);
    const b = local('lupercal', spotOf('lupercal', 'lupercal-shrine').position);
    const r = walkLocal('lupercal', [a.x, a.y + 0.2, a.z], [[b.x, b.z]], 12, 2.5);
    expect(Math.hypot(r.end.x - b.x, r.end.z - b.z)).toBeLessThan(0.6);
  });

  it('Adonaea: from the street up into the garden', () => {
    const s = local('adonaea', spotOf('adonaea', 'adonaea-entrance').position);
    const g = local('adonaea', spotOf('adonaea', 'adonaea-bench').position);
    // Straight up the steps and through the gateway onto the garden's walk, then along it.
    const r = walkLocal('adonaea', [s.x, s.y + 0.2, s.z], [[s.x, g.z], [g.x + 1.5, g.z]], 20, 3);
    expect(r.end.y).toBeGreaterThan(g.y - 0.6);
    expect(Math.hypot(r.end.x - g.x, r.end.z - g.z)).toBeLessThan(3);
  });
});
