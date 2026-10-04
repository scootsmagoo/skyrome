/**
 * Shared set-up for the Colosseum-valley tests: the ids, and a landmark context on the REAL
 * heightmap with the real building pads (the same terrain the game builds), so builders see the
 * slopes they meet in play. The heightmap is built once per worker, on first use.
 */
import { Rng } from '../src/core/Rng';
import { bearingToRotationY } from '../src/core/math';
import * as atlas from '../src/data/atlas';
import { MeshBuilder } from '../src/gfx/MeshBuilder';
import { WORLD_SCALE, toGame } from '../src/world/coords';
import { landmarkPads } from '../src/world/rome/buildRome';
import { buildHeightmap, type Heightmap } from '../src/world/terrain/heightmap';
import type { LandmarkContext, LandmarkData } from '../src/world/landmarks/types';

export const COLOS_IDS = [
  'colosseum', 'ludus-magnus', 'ludus-dacicus', 'ludus-matutinus', 'ludus-gallicus', 'castra-misenatium', 'moneta', 'meta-sudans',
  'baths-titus', 'baths-trajan', 'domus-aurea-buried', 'sette-sale', 'porticus-liviae', 'lacus-orphei', 'domus-plinii',
  'temple-divus-claudius', 'arch-dolabella', 'castra-peregrina', 'macellum-magnum', 'statio-vigiles-v', 'curiae-veteres',
];

let hm: Heightmap | null = null;

export function heightmap(): Heightmap {
  if (!hm) {
    const bounds = { minX: 200, maxX: 1500, minZ: -500, maxZ: 1050 };
    hm = buildHeightmap({ ...atlas, bounds } as never, { spacing: 2, pads: landmarkPads(atlas.CITY_BOUNDS) });
  }
  return hm;
}

export function ctxFor(id: string, detail: 'high' | 'low' = 'high'): LandmarkContext {
  const h = heightmap();
  const lm = atlas.LANDMARK_BY_ID[id] as unknown as LandmarkData;
  const [gx, gz] = toGame(lm.center[0], lm.center[1]);
  const baseY = h.heightAt(gx, gz);
  const r = bearingToRotationY(lm.rotation);
  return {
    game: undefined as never,
    lm,
    S: WORLD_SCALE,
    rng: new Rng(`landmark:${id}`),
    detail,
    builder: () => new MeshBuilder(),
    groundAt: (lx, lz) => h.heightAt(gx + lx * Math.cos(r) + lz * Math.sin(r), gz - lx * Math.sin(r) + lz * Math.cos(r)) - baseY,
  };
}
