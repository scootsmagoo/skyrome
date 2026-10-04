/**
 * Walkability of the capfora landmarks on the REAL terrain: the real Actor (tests/arch.walker.ts)
 * walks the routes a visitor takes, against the landmark colliders placed exactly as
 * buildLandmarks() places them, plus a heightfield of the game terrain around them.
 *
 *  - The Capitol: from the head of the Clivus Capitolinus up the forecourt steps, through the
 *    Arch of Scipio onto the Area Capitolina, round the great altar, up the temple steps and into
 *    Jupiter's cella.
 *  - The Arx: up the front stair onto the citadel terrace and up to Juno Moneta's porch.
 *  - The Forum of Augustus: in through the entrance, across the square and up the steps of Mars
 *    Ultor into the cella.
 */
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import * as atlas from '../src/data/atlas';
import { Rng } from '../src/core/Rng';
import { initPhysics } from '../src/core/Physics';
import { MeshBuilder, type ColliderSpec } from '../src/gfx/MeshBuilder';
import { WORLD_SCALE } from '../src/world/coords';
import { buildHeightmap, type Heightmap } from '../src/world/terrain/heightmap';
import { landmarkPads } from '../src/world/rome/buildRome';
import type { LandmarkBuild, LandmarkBuilder, LandmarkContext, LandmarkData, Spot } from '../src/world/landmarks/types';
import { frameOf } from '../src/world/landmarks/builders/capfora/frame';
import { builders as augustus } from '../src/world/landmarks/builders/capfora-augustus';
import { builders as capitol } from '../src/world/landmarks/builders/capfora-capitol';
import { builders as arx } from '../src/world/landmarks/builders/capfora-arx';
import { makeWorld, walk, type Leg, type TestWorld } from './arch.walker';

const ALL: LandmarkBuilder[] = [...augustus, ...capitol, ...arx];

let hm: Heightmap;
beforeAll(async () => {
  await initPhysics();
  const b = { minX: -400, maxX: 400, minZ: -400, maxZ: 300 };
  hm = buildHeightmap({ ...atlas, bounds: b } as never, { spacing: 2, pads: landmarkPads(atlas.CITY_BOUNDS) });
});

interface Placed {
  world: TestWorld;
  /** World-space spots by landmark id and spot id. */
  spot(id: string, spotId: string): THREE.Vector3;
  /** A landmark-local point in world space (y from the terrain if omitted). */
  local(id: string, x: number, z: number, y?: number): THREE.Vector3;
}

/** Build landmarks at 'high' detail and drop their colliders, plus the terrain, into one world. */
function place(ids: string[], terrainHalf = 110): Placed {
  const world = makeWorld(false);
  const game = { heightmap: hm } as never;
  const frames = new Map<string, ReturnType<typeof frameOf>>();
  const spots = new Map<string, Spot[]>();
  for (const id of ids) {
    const lm = atlas.LANDMARK_BY_ID[id] as unknown as LandmarkData;
    const fr = frameOf(game, lm);
    frames.set(id, fr);
    const ctx: LandmarkContext = {
      game,
      lm,
      S: WORLD_SCALE,
      rng: new Rng(`landmark:${id}`),
      detail: 'high',
      builder: () => new MeshBuilder(),
      groundAt: (lx, lz) => {
        const p = new THREE.Vector3(lx, 0, lz).applyMatrix4(fr.matrix);
        return hm.heightAt(p.x, p.z) - fr.y;
      },
    };
    const builder = ALL.find((b) => b.handles.includes(id))!;
    const built: LandmarkBuild = builder.build(ctx);
    for (const c of built.colliders) addWorldCollider(world, c, fr.matrix);
    spots.set(id, built.spots ?? []);
  }
  // Terrain heightfield (2 m cells) round the first landmark.
  const f0 = frames.get(ids[0])!;
  const seg = Math.round((2 * terrainHalf) / 2);
  const minX = f0.gx - terrainHalf;
  const minZ = f0.gz - terrainHalf;
  const heights = new Float32Array((seg + 1) * (seg + 1));
  for (let iz = 0; iz <= seg; iz++) for (let ix = 0; ix <= seg; ix++) heights[iz * (seg + 1) + ix] = hm.heightAt(minX + (ix * 2 * terrainHalf) / seg, minZ + (iz * 2 * terrainHalf) / seg);
  world.physics.addHeightfield(minX, minZ, 2 * terrainHalf, 2 * terrainHalf, seg, seg, heights);
  return {
    world,
    spot: (id, spotId) => {
      const s = spots.get(id)!.find((x) => x.id === spotId);
      if (!s) throw new Error(`no spot ${id}:${spotId}`);
      return s.position.clone().applyMatrix4(frames.get(id)!.matrix);
    },
    local: (id, x, z, y) => {
      const fr = frames.get(id)!;
      const p = new THREE.Vector3(x, 0, z).applyMatrix4(fr.matrix);
      p.y = y !== undefined ? fr.y + y : hm.heightAt(p.x, p.z);
      return p;
    },
  };
}

function addWorldCollider(world: TestWorld, c: ColliderSpec, m: THREE.Matrix4) {
  const p = world.physics;
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  if (c.kind === 'box') {
    const r = (c.rotation ?? new THREE.Quaternion()).clone().premultiply(q);
    p.addOrientedBox(c.center.clone().applyMatrix4(m), c.half, r);
  } else if (c.kind === 'cylinder') p.addCylinder(c.center.clone().applyMatrix4(m), c.halfHeight, c.radius);
  else p.addTrimesh(c.geometry, c.matrix ? m.clone().multiply(c.matrix) : m);
}

const to = (v: THREE.Vector3, seconds = 20, reach = 0.6): Leg => ({ to: [v.x, v.z], seconds, reach });

describe('capfora walkability', () => {
  it('Capitol: Clivus → forecourt → Arch of Scipio → Area Capitolina → temple steps → cella', () => {
    const P = place(['temple-jupiter-capitolinus', 'temple-jupiter-tonans']);
    const id = 'temple-jupiter-capitolinus';
    const clivus = P.spot(id, 'clivus-top');
    const fornix = P.spot(id, 'fornix-scipionis');
    const altar = P.spot(id, 'altar');
    const stepsTop = P.spot(id, 'steps-top');
    const cella = P.spot(id, 'cella-iovis');
    const padY = P.local(id, 0, 0, 0).y;
    // Start on the Clivus Capitolinus well below the forecourt steps.
    const start = P.local(id, -50, -44);
    const r = walk(P.world, start.clone().setY(start.y + 0.3), [
      to(clivus),
      to(fornix),
      // Through the arch (east → west in the local frame) onto the area, then to the altar's side.
      to(P.local(id, -6, -39.5, 0)),
      to(altar.clone().add(new THREE.Vector3(3.2, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), -(158 * Math.PI) / 180))),
      to(P.local(id, 0, -17.6, 0)),
      to(stepsTop, 20, 0.5),
      to(cella, 20, 0.8),
    ]);
    const [eClivus, eFornix, eArea, , , eTop, eCella] = r.ends;
    if (process.env.CAPFORA_DEBUG) console.info('start', start.toArray(), 'ends', r.ends.map((e) => e.toArray().map((v) => v.toFixed(2)).join(',')), 'clivus', clivus.toArray(), 'hm at end', hm.heightAt(r.ends[0].x, r.ends[0].z));
    expect(eClivus.distanceTo(clivus)).toBeLessThan(1.2);
    expect(eFornix.distanceTo(fornix)).toBeLessThan(1.2);
    expect(Math.abs(eArea.y - padY)).toBeLessThan(0.4);
    expect(eTop.y - padY).toBeGreaterThan(2.7);
    expect(new THREE.Vector2(eCella.x - cella.x, eCella.z - cella.z).length()).toBeLessThan(1.5);
  });

  it('Arx: front stair onto the citadel terrace and up to the porch of Juno Moneta', () => {
    const P = place(['temple-juno-moneta']);
    const id = 'temple-juno-moneta';
    const altar = P.spot(id, 'altar');
    const start = P.local(id, 0, -24);
    // Up the front stair, to the altar, then round it and straight up the temple's steps (+z local).
    const fwd = P.local(id, 0, 1, 0).sub(P.local(id, 0, 0, 0)).normalize();
    const side = altar.clone().add(new THREE.Vector3(fwd.z, 0, -fwd.x).multiplyScalar(1.8));
    const r = walk(P.world, start.clone().setY(start.y + 0.3), [to(P.local(id, 0, -16, 0)), to(altar), to(side), to(side.clone().addScaledVector(fwd, 2.5)), { dir: [fwd.x, fwd.z], seconds: 4 }]);
    const padY = P.local(id, 0, 0, 0).y;
    expect(Math.abs(r.ends[0].y - padY)).toBeLessThan(0.3);
    expect(r.ends[1].distanceTo(altar)).toBeLessThan(1.2);
    // On the temple's stair or podium (the podium is 1.56 m).
    expect(r.ends[4].y - padY).toBeGreaterThan(1.3);
  });

  it('Forum of Augustus: entrance → square → steps of Mars Ultor → cella', () => {
    const P = place(['forum-augustus', 'temple-mars-ultor']);
    const entrance = P.spot('forum-augustus', 'entrance');
    const quad = P.spot('forum-augustus', 'quadriga-inscription');
    const marsTop = P.spot('temple-mars-ultor', 'steps-top');
    const door = P.spot('temple-mars-ultor', 'cella-door');
    const priest = P.spot('temple-mars-ultor', 'priest');
    const r = walk(P.world, entrance.clone().setY(entrance.y + 0.3), [to(quad), to(priest), to(marsTop, 25, 0.5), to(door, 20, 0.6), to(P.spot('temple-mars-ultor', 'signa-parthica'), 20, 0.8)]);
    const padY = P.local('forum-augustus', 0, 0, 0).y;
    expect(r.ends[0].distanceTo(quad)).toBeLessThan(1.2);
    expect(r.ends[2].y - padY).toBeGreaterThan(2.0);
    expect(r.ends[4].distanceTo(P.spot('temple-mars-ultor', 'signa-parthica'))).toBeLessThan(1.5);
  });
});
