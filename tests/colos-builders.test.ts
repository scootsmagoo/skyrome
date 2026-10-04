/**
 * Colosseum-valley landmark builders (src/world/landmarks/builders/colos-*.ts): every assigned
 * atlas id has a custom builder, builds on the real terrain without throwing, yields valid
 * colliders and spots, and stays inside its triangle budget.
 */
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import * as atlas from '../src/data/atlas';
import { Rng } from '../src/core/Rng';
import { bearingToRotationY } from '../src/core/math';
import { MeshBuilder, type ColliderSpec } from '../src/gfx/MeshBuilder';
import { WORLD_SCALE, toGame } from '../src/world/coords';
import { landmarkPads } from '../src/world/rome/buildRome';
import { buildHeightmap, type Heightmap } from '../src/world/terrain/heightmap';
import type { LandmarkBuild, LandmarkBuilder, LandmarkContext, LandmarkData } from '../src/world/landmarks/types';
import { countTriangles } from '../src/world/landmarks/builders/colos-kit';
import { builders as colosseum } from '../src/world/landmarks/builders/colos-colosseum';
import { builders as ludus } from '../src/world/landmarks/builders/colos-ludus';
import { builders as fountains } from '../src/world/landmarks/builders/colos-fountains';
import { builders as baths } from '../src/world/landmarks/builders/colos-baths';
import { builders as caelian } from '../src/world/landmarks/builders/colos-caelian';
import { builders as quarter } from '../src/world/landmarks/builders/colos-quarter';

export const COLOS_IDS = [
  'colosseum', 'ludus-magnus', 'ludus-dacicus', 'ludus-matutinus', 'ludus-gallicus', 'castra-misenatium', 'moneta', 'meta-sudans',
  'baths-titus', 'baths-trajan', 'domus-aurea-buried', 'sette-sale', 'porticus-liviae', 'lacus-orphei', 'domus-plinii',
  'temple-divus-claudius', 'arch-dolabella', 'castra-peregrina', 'macellum-magnum', 'statio-vigiles-v', 'curiae-veteres',
];

const ALL: LandmarkBuilder[] = [...colosseum, ...ludus, ...fountains, ...baths, ...caelian, ...quarter];

let hm: Heightmap;
beforeAll(() => {
  const bounds = { minX: 200, maxX: 1500, minZ: -500, maxZ: 1050 };
  hm = buildHeightmap({ ...atlas, bounds } as never, { spacing: 2, pads: landmarkPads(atlas.CITY_BOUNDS) });
});

export function ctxFor(id: string, detail: 'high' | 'low' = 'high'): LandmarkContext {
  const lm = atlas.LANDMARK_BY_ID[id] as unknown as LandmarkData;
  const [gx, gz] = toGame(lm.center[0], lm.center[1]);
  const baseY = hm.heightAt(gx, gz);
  const r = bearingToRotationY(lm.rotation);
  return {
    game: undefined as never,
    lm,
    S: WORLD_SCALE,
    rng: new Rng(`landmark:${id}`),
    detail,
    builder: () => new MeshBuilder(),
    groundAt: (lx, lz) => hm.heightAt(gx + lx * Math.cos(r) + lz * Math.sin(r), gz - lx * Math.sin(r) + lz * Math.cos(r)) - baseY,
  };
}

function validCollider(c: ColliderSpec): boolean {
  const fin = (v: THREE.Vector3) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
  if (c.kind === 'box') return fin(c.center) && fin(c.half) && c.half.x > 0 && c.half.y > 0 && c.half.z > 0 && (!c.rotation || Number.isFinite(c.rotation.w));
  if (c.kind === 'cylinder') return fin(c.center) && c.halfHeight > 0 && c.radius > 0;
  const p = c.geometry.getAttribute('position');
  if (!p || p.count < 3 || p.count % 3 !== 0) return false;
  for (let i = 0; i < p.array.length; i++) if (!Number.isFinite(p.array[i])) return false;
  return true;
}

function find(id: string) {
  return ALL.find((b) => b.handles.includes(id));
}

describe('colos builders', () => {
  it('covers every assigned id exactly once', () => {
    for (const id of COLOS_IDS) expect(ALL.filter((b) => b.handles.includes(id)).length, id).toBe(1);
    const extra = ALL.flatMap((b) => b.handles).filter((h) => !COLOS_IDS.includes(h));
    expect(extra).toEqual([]);
  });
  const built = new Map<string, LandmarkBuild>();
  const ids = COLOS_IDS.filter((id) => find(id));
  it.each(ids)('%s builds with valid colliders and spots', (id) => {
    const b = find(id)!;
    const out = b.build(ctxFor(id));
    built.set(id, out);
    const bad = out.colliders.filter((c) => !validCollider(c));
    expect(bad.length, `${bad.length} invalid colliders, first: ${bad[0]?.kind}`).toBe(0);
    for (const s of out.spots ?? []) {
      expect(Number.isFinite(s.position.x + s.position.y + s.position.z), s.id).toBe(true);
    }
    const ids2 = (out.spots ?? []).map((s) => s.id);
    expect(new Set(ids2).size).toBe(ids2.length);
  });

  // Triangles drawn with the camera far away (instanced bays at their far level): heroes stay
  // under ~160k, the others far less; the near levels only swap in round the camera.
  const HEROES = ['colosseum', 'ludus-magnus', 'meta-sudans', 'baths-trajan'];
  it.each(ids)('%s stays inside its triangle budget', (id) => {
    const out = built.get(id) ?? find(id)!.build(ctxFor(id));
    const n = countTriangles(out.object);
    expect(n, `${id}: ${n} triangles`).toBeLessThan(HEROES.includes(id) ? 160_000 : 80_000);
    if (out.far) expect(countTriangles(out.far)).toBeLessThan(8_000);
  });

  it('exposes the spots the gameplay team relies on', () => {
    const need: Record<string, string[]> = {
      'colosseum': ['colos-arena-center', 'colos-porta-triumphalis', 'colos-porta-libitinensis', 'colos-pulvinar', 'colos-inscription', 'colos-nemeseum', 'colos-vendor-1', 'colos-sailor-1', 'colos-vista-summa'],
      'ludus-magnus': ['ludus-arena-center', 'ludus-gate', 'lanista', 'armory', 'medicus', 'spectator-1', 'ludus-editor', 'ludus-graffiti', 'ludus-gate-inscription', 'ludus-trajan-base'],
      'meta-sudans': ['meta-sudans-fountain', 'meta-sudans-playbill', 'lacus-metae', 'meta-sudans-stand-1', 'meta-sudans-latebra'],
      'baths-trajan': ['trajan-inscription', 'trajan-frigidarium'],
      'baths-titus': ['titus-inscription', 'titus-stairs-foot'],
      'arch-dolabella': ['dolabella-inscription'],
    };
    for (const [id, spots] of Object.entries(need)) {
      const out = built.get(id) ?? find(id)!.build(ctxFor(id));
      const have = new Set((out.spots ?? []).map((s) => s.id));
      for (const s of spots) expect(have.has(s), `${id} lacks spot ${s}`).toBe(true);
    }
  });

  it('every tier-1 landmark has a "thing" (GDD §12.3): an inscription, vista, shrine, door or container spot', () => {
    for (const id of ids) {
      const lm = atlas.LANDMARK_BY_ID[id];
      if (lm.priority !== 1) continue;
      const out = built.get(id) ?? find(id)!.build(ctxFor(id));
      const kinds = new Set((out.spots ?? []).map((s) => s.kind));
      expect(['inscription', 'vista', 'shrine', 'door', 'container'].some((k) => kinds.has(k)), id).toBe(true);
    }
  });
});

export { countTriangles };
