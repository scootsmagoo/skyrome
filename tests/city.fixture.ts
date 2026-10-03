/** Shared fixture for the city tests: heightmap + plan over the core of Rome (built once). */
import * as atlas from '../src/data/atlas';
import { buildHeightmap, type Heightmap } from '../src/world/terrain/heightmap';
import { landmarkPads } from '../src/world/rome/buildRome';
import { planCity, scaleBounds, type CityPlan } from '../src/world/city/plan';

/** Real-meter area: the core plus a ring (hills, river, Subura, Caelian, Aventine). */
export const AREA = { minX: -800, maxX: 1300, minZ: -800, maxZ: 1300 };

let cache: { hm: Heightmap; plan: CityPlan } | null = null;

export function cityFixture() {
  if (cache) return cache;
  const hm = buildHeightmap({ ...atlas, bounds: AREA } as never, { spacing: 2, pads: landmarkPads(atlas.CITY_BOUNDS) });
  const plan = planCity(atlas, hm, { bounds: scaleBounds(AREA), detailBounds: scaleBounds(atlas.CORE_BOUNDS, 150) });
  cache = { hm, plan };
  return cache;
}
