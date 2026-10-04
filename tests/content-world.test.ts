/**
 * The content in the REAL world geometry: the terrain's heightfield, the Tiber's quay walls and
 * every landmark of the content's area built by its builder (fallback blocks, river district) with
 * its colliders, in one physics world. Then installContent places everything, as in the game.
 *
 *  - every prompt (shrine, text, landmark thing, container) can be focused by a player standing
 *    somewhere around it, with the same rules as src/interaction/Interactions.ts (reach, the 30°
 *    cone, line of sight, the best-scoring target wins), aiming at it in first person;
 *  - no prompt or lamp is inside a building or under a roof;
 *  - every place an NPC schedule, a patrol route or a quest objective uses as a position is at
 *    street level (not on a podium, a roof or the top of the Porta Capena);
 *  - the opening (spawn, cart, ambush) stands on open ground in front of the player.
 */
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as atlas from '../src/data/atlas';
import type { Game } from '../src/core/Game';
import { Layer, initPhysics } from '../src/core/Physics';
import { registerColliders } from '../src/gfx/MeshBuilder';
import type { Interactable } from '../src/interaction/Interactions';
import { buildLandmarks } from '../src/world/landmarks/buildLandmarks';
import { landmarkPads } from '../src/world/rome/buildRome';
import { buildHeightmap, type Heightmap } from '../src/world/terrain/heightmap';
import { chain, resolveQuays } from '../src/world/terrain/riverbanks';
import { buildQuay } from '../src/world/water/quays';
import { WORLD_SCALE } from '../src/world/coords';
import { installContent, type ContentService } from '../src/content/install';
import { CONTENT_LOCATIONS, OPENING_SPOTS } from '../src/content/places';
import { isSolidLandmark } from '../src/content/ground';
import { loadNpcContent } from '../src/npc/registry';
import { loadQuestContent } from '../src/quests/QuestSystem';
import { installRpg } from '../src/rpg/install';
import { MemoryStorage } from '../src/save/storage';
import { makeWorld, type TestWorld } from './arch.walker';
import { fakeGame } from './rpg-fakes';

let hm: Heightmap;
let world: TestWorld;
let game: Game;
let content: ContentService;
const items: Interactable[] = [];
const lights: THREE.Vector3[] = [];

/** The content's area (real metres): the Porta Capena to the Forum of Trajan, the island to the Ludus. */
const BOUNDS = { minX: -650, maxX: 1000, minZ: -480, maxZ: 1060 };

beforeAll(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  await initPhysics();
  hm = buildHeightmap({ ...atlas, bounds: BOUNDS } as never, { spacing: 2, pads: landmarkPads(atlas.CITY_BOUNDS) });
  world = makeWorld(false);
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
  const fg = fakeGame();
  game = fg.game;
  const g = game as unknown as Record<string, unknown>;
  g.physics = world.physics;
  g.heightmap = hm;
  g.scene = new THREE.Scene();
  g.world = { add: (_id: string, o: THREE.Object3D) => (g.scene as THREE.Scene).add(o), remove: () => {}, refreshAll: () => {} };
  for (const river of hm.features!.rivers) {
    for (const rq of resolveQuays(hm.features!.quays, river.id, chain(river.centerline))) {
      const q = buildQuay(river, rq, (x, z) => hm.heightAt(x, z), WORLD_SCALE);
      registerColliders(game, q.colliders);
    }
  }
  await buildLandmarks(game, atlas.LANDMARKS, hm, { bounds: BOUNDS, highDetailPriority: 2 });
  installRpg(game, { storage: new MemoryStorage(), background: 'civis-suburanus' });
  g.interactions = { add: (i: Interactable) => (items.push(i), () => items.splice(items.indexOf(i), 1)), remove: () => {} };
  g.lights = { request: (r: { position: THREE.Vector3Like }) => (lights.push(new THREE.Vector3().copy(r.position)), { remove: () => {} }) };
  content = installContent(game);
  // Let the queries see the stand-ins' colliders too (they block sight lines like any wall).
  world.physics.step(1 / 60);
}, 240_000);

afterAll(() => vi.restoreAllMocks());

/** Street level under (x, z) from above (null: nothing). */
function top(x: number, z: number): number | null {
  return world.physics.groundHeight(x, z, hm.heightAt(x, z) + 30, 60);
}

/** Can a player standing at (x, z), aiming at `target` in first person, focus it? (Interactions.lateUpdate, first person.) */
function focusFrom(x: number, z: number, target: Interactable): boolean {
  const ground = top(x, z);
  if (ground === null || ground - hm.heightAt(x, z) > 0.9) return false; // not a place to stand
  if (world.physics.overlapSphere({ x, y: ground + 0.95, z }, 0.3, Layer.World).length) return false;
  const feet = new THREE.Vector3(x, ground, z);
  const eye = new THREE.Vector3(x, ground + 1.6, z);
  const look = target.position().clone().sub(eye).normalize();
  let best: Interactable | null = null;
  let bestScore = Infinity;
  const to = new THREE.Vector3();
  for (const it of items) {
    if (it.enabled && !it.enabled()) continue;
    const p = it.position();
    const reach = it.reach ?? 3;
    to.subVectors(p, eye);
    const dist = to.length();
    if (dist > reach + 1.5) continue;
    if (p.distanceTo(feet) > reach + 1.2) continue;
    to.divideScalar(dist || 1);
    const cos = to.dot(look);
    if (cos < 0.86) continue;
    const score = (1 - cos) * 10 + dist * 0.15;
    if (score < bestScore) {
      const hit = world.physics.raycast(eye, to, Math.max(0, dist - 0.4), Layer.World);
      if (hit) continue;
      best = it;
      bestScore = score;
    }
  }
  return best === target;
}

describe('content in the built world', () => {
  it('places everything and gives it something to see', () => {
    // The world is really there: the landmarks of the area with their colliders.
    expect(game.landmarks.size).toBeGreaterThan(80);
    expect(game.landmarks.has('temple-castor-pollux') && game.landmarks.has('porta-capena') && game.landmarks.has('forum-boarium')).toBe(true);
    expect(world.physics.groundHeight(304.2, 573, 60, 80)! - hm.heightAt(304.2, 573)).toBeGreaterThan(4); // the gate's block
    expect(content.shrines).toBeGreaterThanOrEqual(13);
    expect(content.texts).toBeGreaterThanOrEqual(40);
    expect(content.things).toBeGreaterThanOrEqual(54);
    expect(content.containers).toBeGreaterThanOrEqual(40);
    expect(content.props).toBeGreaterThanOrEqual(150);
    // Street lamps are hung on walls where there are walls; the rest of the lamps stand on posts or altars.
    expect(content.lamps).toBeGreaterThanOrEqual(45);
  });

  it('every prompt can be focused from somewhere around it (rings at 1.6 and 2.3 m, aiming at it)', () => {
    const bad: string[] = [];
    for (const it of items) {
      if (it.enabled && !it.enabled()) continue;
      const p = it.position();
      let ok = false;
      for (const r of [1.3, 1.6, 2.0, 2.3]) {
        for (let k = 0; k < 16 && !ok; k++) {
          const a = (k / 16) * Math.PI * 2;
          ok = focusFrom(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, it);
        }
        if (ok) break;
      }
      if (!ok) bad.push(`${it.id} at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`);
    }
    expect(bad).toEqual([]);
  });

  it('no prompt or lamp is inside a building or under a roof', () => {
    const bad: string[] = [];
    for (const it of items) {
      const p = it.position();
      if (world.physics.overlapSphere(p, 0.08, Layer.World).length) bad.push(`${it.id}: inside a collider`);
      const roof = world.physics.raycast({ x: p.x, y: p.y + 0.3, z: p.z }, { x: 0, y: 1, z: 0 }, 6, Layer.World);
      if (roof) bad.push(`${it.id}: roof ${roof.distance.toFixed(1)} m above`);
    }
    for (const l of lights) {
      if (world.physics.overlapSphere(l, 0.05, Layer.World).length) bad.push(`lamp (${l.x.toFixed(1)}, ${l.z.toFixed(1)}): inside a collider`);
      const g = top(l.x, l.z);
      if (g !== null && l.y - g > 3.2) bad.push(`lamp (${l.x.toFixed(1)}, ${l.z.toFixed(1)}): ${(l.y - g).toFixed(1)} m up in the air`);
    }
    expect(bad).toEqual([]);
  });

  it('every place a schedule, a patrol or a quest uses as a position is at street level', () => {
    const used = new Set<string>();
    for (const d of loadNpcContent()) {
      if (d.home) used.add(d.home);
      for (const e of d.schedule ?? []) {
        used.add(e.at);
        for (const r of e.route ?? []) used.add(r);
      }
    }
    const bad: string[] = [];
    for (const id of used) {
      const lm = atlas.LANDMARK_BY_ID[id];
      if (lm) {
        if (isSolidLandmark(lm)) bad.push(`${id}: a solid building (use ${id}:front)`);
        continue;
      }
      if (id === 'night-cart') continue; // the cart itself stands there
      const l = CONTENT_LOCATIONS.find((x) => x.id === id);
      if (!l) continue; // conditional places (mus-latebra) and the world's own
      const g = top(l.position.x, l.position.z);
      const lift = g === null ? 0 : g - hm.heightAt(l.position.x, l.position.z);
      if (lift > 0.9) bad.push(`${id}: ${lift.toFixed(1)} m above the street`);
    }
    // The quests' spawn and staging points too.
    for (const q of loadQuestContent()) {
      for (const st of Object.values(q.stages)) {
        for (const o of st.objectives ?? []) {
          const t = o.target;
          if (t?.kind !== 'location') continue;
          const l = CONTENT_LOCATIONS.find((x) => x.id === t.id && !atlas.LANDMARK_BY_ID[x.id]);
          if (!l || l.radius > 25) continue;
          const g = top(l.position.x, l.position.z);
          const lift = g === null ? 0 : g - hm.heightAt(l.position.x, l.position.z);
          if (lift > 0.9) bad.push(`${q.id} → ${t.id}: ${lift.toFixed(1)} m above the street`);
        }
      }
    }
    expect([...new Set(bad)]).toEqual([]);
  });

  it('stages the opening on open ground: the spawn, the cart, Festus, Dromo and the ambush are at street level', () => {
    for (const s of OPENING_SPOTS) {
      const g = top(s.position.x, s.position.z)!;
      expect(g - hm.heightAt(s.position.x, s.position.z), s.id).toBeLessThan(0.9);
      expect(world.physics.overlapSphere({ x: s.position.x, y: g + 0.95, z: s.position.z }, 0.3, Layer.World).length, s.id).toBe(0);
    }
  });
});


