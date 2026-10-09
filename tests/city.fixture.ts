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

const box = (b: { minX: number; maxX: number; minZ: number; maxZ: number }, m = 0) => ({ minX: b.minX - m, maxX: b.maxX + m, minZ: b.minZ - m, maxZ: b.maxZ + m });
let gameHm: Heightmap | null = null;
const gamePlans = new Map<boolean, CityPlan>();

/**
 * The plan exactly as the game builds it (buildRome + buildCity, core extent): the whole
 * CITY_BOUNDS raster. Heavy, built lazily; `closeStubs: false` is the plan before the M3 rework.
 */
export function gameFixture(closeStubs = true) {
  if (!gameHm) {
    const lb = [box(atlas.CORE_BOUNDS, 350), ...atlas.DETAIL_REGIONS.map((r) => box(r, 100))];
    const landmarkBounds = {
      minX: Math.min(...lb.map((b) => b.minX)), maxX: Math.max(...lb.map((b) => b.maxX)),
      minZ: Math.min(...lb.map((b) => b.minZ)), maxZ: Math.max(...lb.map((b) => b.maxZ)),
    };
    gameHm = buildHeightmap({ ...atlas, bounds: atlas.CITY_BOUNDS } as never, { spacing: 2, pads: landmarkPads(landmarkBounds) });
  }
  let plan = gamePlans.get(closeStubs);
  if (!plan) {
    plan = planCity(atlas, gameHm, { detailBounds: scaleBounds(atlas.CORE_BOUNDS, 150), corridorDetail: 150, closeStubs });
    gamePlans.set(closeStubs, plan);
  }
  return { hm: gameHm, plan };
}
