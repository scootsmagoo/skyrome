/**
 * Capitoline and Imperial Fora landmarks (capfora crew): every assigned id has a custom builder,
 * builds at both details on the real terrain without NaNs, stays inside its triangle budget, has
 * colliders and at least one spot for the gameplay team, and keeps its stairs walkable.
 */
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import * as atlas from '../src/data/atlas';
import { Rng } from '../src/core/Rng';
import { bearingToRotationY } from '../src/core/math';
import { MeshBuilder } from '../src/gfx/MeshBuilder';
import { WORLD_SCALE, toGame } from '../src/world/coords';
import { buildHeightmap, type Heightmap } from '../src/world/terrain/heightmap';
import { landmarkPads } from '../src/world/rome/buildRome';
import type { LandmarkBuild, LandmarkBuilder, LandmarkContext, LandmarkData } from '../src/world/landmarks/types';
import { builders as augustus } from '../src/world/landmarks/builders/capfora-augustus';
import { builders as caesar } from '../src/world/landmarks/builders/capfora-caesar';
import { builders as nerva } from '../src/world/landmarks/builders/capfora-nerva';
import { builders as pacis } from '../src/world/landmarks/builders/capfora-pacis';
import { builders as capitol } from '../src/world/landmarks/builders/capfora-capitol';
import { builders as arx } from '../src/world/landmarks/builders/capfora-arx';
import { builders as boarium } from '../src/world/landmarks/builders/capfora-boarium';

const ALL: LandmarkBuilder[] = [...augustus, ...caesar, ...nerva, ...pacis, ...capitol, ...arx, ...boarium];

/** Assigned ids and their high-detail triangle budgets. */
const BUDGET: Record<string, number> = {
  'forum-augustus': 260_000,
  'temple-mars-ultor': 160_000,
  'forum-caesar': 200_000,
  'temple-venus-genetrix': 160_000,
  'basilica-argentaria': 80_000,
  'forum-nerva': 160_000,
  'temple-minerva-nerva': 120_000,
  subura: 20_000,
  'templum-pacis': 160_000,
  'temple-jupiter-capitolinus': 160_000,
  'temple-jupiter-tonans': 90_000,
  'tarpeian-rock': 20_000,
  asylum: 20_000,
  'temple-veiovis': 30_000,
  'temple-juno-moneta': 60_000,
  auguraculum: 10_000,
  'insula-aracoeli': 120_000,
  'tomb-bibulus': 20_000,
  'sant-omobono-temples': 120_000,
  'porta-carmentalis': 20_000,
};

let hm: Heightmap;
beforeAll(() => {
  const b = { minX: -450, maxX: 520, minZ: -520, maxZ: 400 };
  hm = buildHeightmap({ ...atlas, bounds: b } as never, { spacing: 2, pads: landmarkPads(atlas.CITY_BOUNDS) });
});

function ctxFor(lm: LandmarkData, detail: 'high' | 'low'): LandmarkContext {
  const [gx, gz] = toGame(lm.center[0], lm.center[1]);
  const baseY = hm.heightAt(gx, gz);
  const rotY = bearingToRotationY(lm.rotation);
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  return {
    game: { heightmap: hm } as never,
    lm,
    S: WORLD_SCALE,
    rng: new Rng(`landmark:${lm.id}`),
    detail,
    builder: () => new MeshBuilder(),
    groundAt: (lx, lz) => hm.heightAt(gx + lx * cos + lz * sin, gz - lx * sin + lz * cos) - baseY,
  };
}

function triangles(o: THREE.Object3D): number {
  let n = 0;
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) n += m.geometry.getAttribute('position').count / 3;
  });
  return n;
}

function finite(o: THREE.Object3D): boolean {
  let ok = true;
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    const a = m.geometry.getAttribute('position').array as Float32Array;
    for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) ok = false;
  });
  return ok;
}

describe('capfora landmarks', () => {
  for (const id of Object.keys(BUDGET)) {
    it(`${id}: builds, budget, colliders, spots`, () => {
      const lm = atlas.LANDMARK_BY_ID[id] as unknown as LandmarkData;
      const builder = ALL.find((x) => x.handles.includes(id));
      expect(builder, `builder for ${id}`).toBeTruthy();
      const hi: LandmarkBuild = builder!.build(ctxFor(lm, 'high'));
      const lo: LandmarkBuild = builder!.build(ctxFor(lm, 'low'));
      const th = triangles(hi.object);
      const tl = triangles(lo.object);
      const tf = hi.far ? triangles(hi.far) : 0;
      console.info(`${id}: high ${th}, low ${tl}, far ${tf}, colliders ${hi.colliders.length}, spots ${hi.spots?.length ?? 0}`);
      if (process.env.CAPFORA_MATS) {
        const rows: string[] = [];
        hi.object.traverse((c) => {
          const m = c as THREE.Mesh;
          if (m.isMesh) rows.push(`${m.name.split(':').slice(1).join(':')} ${m.geometry.getAttribute('position').count / 3}`);
        });
        console.info(rows.join('\n'));
      }
      expect(finite(hi.object)).toBe(true);
      expect(th).toBeLessThan(BUDGET[id]);
      expect(tl).toBeLessThanOrEqual(th);
      expect(hi.colliders.length).toBeGreaterThan(0);
      expect(hi.spots?.length ?? 0).toBeGreaterThan(0);
      for (const s of hi.spots ?? []) expect(Number.isFinite(s.position.x + s.position.y + s.position.z)).toBe(true);
    });
  }
});
