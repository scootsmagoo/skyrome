/**
 * Assembles Rome from the atlas: heightmap → terrain → landmarks → city fabric → locations.
 * Each step lives in its own module so it can be upgraded independently; this file only
 * orchestrates and reports progress for the loading screen.
 */
import * as THREE from 'three';
import type { Game } from '../../core/Game';
import * as atlas from '../../data/atlas';
import { toGame } from '../coords';
import { buildBridges } from '../bridges';
import { buildCity } from '../city';
import { buildLandmarks } from '../landmarks/buildLandmarks';
import { buildWater } from '../water';
import { footprintRadius } from '../landmarks/footprint';
import { dressTerrain } from '../terrain/dress';
import { Terrain } from '../terrain/Terrain';
import { buildHeightmap, footprintPolygon, type Heightmap, type TerrainPad } from '../terrain/heightmap';
import { terrainProfile, type TerrainProfile } from '../terrain/profile';
import { releaseBuildCaches } from '../../gfx/release';

declare module '../../core/Game' {
  interface Game {
    heightmap: Heightmap;
  }
}

export type RomeExtent = 'core' | 'city';

export interface BuildRomeOptions {
  extent?: RomeExtent;
  /** Heightmap spacing in game meters (default 2). */
  spacing?: number;
  onProgress?: (fraction: number, label: string) => void;
  /** Optional extra build steps (city fabric, water, vegetation…) run after landmarks. */
  steps?: { label: string; weight: number; run: (game: Game, hm: Heightmap) => Promise<void> | void }[];
}

/** Categories whose footprints should be flattened into building pads. */
const PAD_CATEGORIES = new Set([
  'temple', 'forum', 'basilica', 'arch', 'column', 'amphitheatre', 'circus', 'theatre', 'odeum', 'stadium', 'baths',
  'palace', 'market', 'camp', 'monument', 'fountain', 'portico', 'prison', 'warehouse', 'library', 'curia', 'gate', 'tomb', 'shrine',
]);

/**
 * Flat ground a builder lays OUTSIDE the atlas footprint (real m): a plaza, an approach, a porch.
 * `grow` widens the whole pad; `front` adds a forecourt that deep in front of the facade (rect
 * footprints), as wide as the building, blending out over `frontMargin`; `margin` replaces the 14 m
 * blend of the main pad to the natural ground.
 */
const PAD_EXTRA: Record<string, { grow?: number; margin?: number; front?: number; frontMargin?: number; core?: number }> = {
  // The Colosseum's paved plaza out to its ring of cippi (builder: colos-colosseum.ts), cut into
  // the foot of the Velia and the Oppian.
  // `core`: how far inside the pad's edge (v2) the pad wins over the roads: the plaza's outer ring
  // runs beside the Via Labicana, which dipped it 0.3 m with the default 3 m.
  colosseum: { grow: 20, margin: 22, core: 0 },
  // The porch and approach on the north side, on the brow of the Oppian (colos-baths.ts).
  'baths-titus': { front: 26, frontMargin: 20 },
  // The entrance porch and its inscription stand on the lip of the Oppian (colos-baths.ts).
  'baths-trajan': { front: 22, frontMargin: 14 },
};

/** Circuses, stadia, theatres and amphitheatres: built level on their pad (generic-common NO_LIFT_CATEGORIES). */
const BOWLS = new Set(['amphitheatre', 'circus', 'theatre', 'odeum', 'stadium']);

/**
 * v2 changes to atlas landmark records, applied before both their pads and their buildings are
 * made (docs/design/solid-ground.md §3 item 5; atlas.ts keeps the historical values). The
 * Porticus Margaritaria is unpinned: its pad at 19 m ASL stood 14 m under the Velia's slope and
 * threw a 60° bank across the Clivus Palatinus and the Via Nova; it now takes the mean ground.
 */
const V2_LANDMARK_OVERRIDES: Record<string, (lm: atlas.Landmark) => atlas.Landmark> = {
  'porticus-margaritaria': (lm) => ({ ...lm, baseElevation: undefined }),
};

/** The atlas landmarks as the terrain profile builds them (v1: the atlas records unchanged). */
export function terrainLandmarks(profile: TerrainProfile = terrainProfile()): atlas.Landmark[] {
  if (profile === 'v1') return atlas.LANDMARKS;
  return atlas.LANDMARKS.map((lm) => V2_LANDMARK_OVERRIDES[lm.id]?.(lm) ?? lm);
}

/**
 * The landmarks' terrain pads. The list is the same under both profiles (a heightmap built for
 * either can take it): a pad that v2 moves carries its v2 height in `elevationV2`.
 */
export function landmarkPads(bounds: { minX: number; maxX: number; minZ: number; maxZ: number }): TerrainPad[] {
  const pads: TerrainPad[] = [];
  const v2 = new Map(terrainLandmarks('v2').map((lm) => [lm.id, lm]));
  for (const lm of atlas.LANDMARKS) {
    if (!PAD_CATEGORIES.has(lm.category)) continue;
    // Seating bowls are never raised by their builders, so they get their pad at any priority.
    if (lm.priority > 2 && !BOWLS.has(lm.category)) continue;
    // Buried structures (the Domus Aurea under the Baths of Trajan) must not flatten the surface.
    if (lm.siting === 'underground') continue;
    const [x, z] = lm.center;
    if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) continue;
    // Very large complexes on slopes (e.g. terraced markets) keep their natural ground unless pinned.
    if (footprintRadius(lm) > 260 && lm.baseElevation === undefined) continue;
    const extra = PAD_EXTRA[lm.id];
    pads.push({
      id: lm.id,
      polygon: footprintPolygon(lm.center, lm.rotation, lm.footprint as any, 3 + (extra?.grow ?? 0)),
      elevation: lm.baseElevation,
      margin: extra?.margin ?? 14,
      // v2: inside the landmark's own footprint (with any plaza it lays: PAD_EXTRA grow) the pad
      // wins over the roads; a poly footprint is not grown.
      grow: lm.footprint.kind === 'poly' ? 0 : (extra?.core ?? 3),
      ...v2Elevation(lm, v2.get(lm.id)),
    });
    if (extra?.front && lm.footprint.kind === 'rect') {
      // Forecourt: the strip in front of the facade (local −z), same height and ground kind, joined to the main pad.
      const { w, d } = lm.footprint;
      const th = (lm.rotation * Math.PI) / 180;
      const cos = Math.cos(th), sin = Math.sin(th);
      const tr = (lx: number, lz: number): [number, number] => [lm.center[0] + lx * cos - lz * sin, lm.center[1] + lx * sin + lz * cos];
      const hw = w / 2 + 3, z0 = -d / 2 - extra.front, z1 = -d / 2 + 6;
      pads.push({ id: lm.id, polygon: [tr(-hw, z0), tr(hw, z0), tr(hw, z1), tr(-hw, z1)], elevation: lm.baseElevation, margin: extra.frontMargin ?? 14, grow: 0, ...v2Elevation(lm, v2.get(lm.id)) });
    }
  }
  return pads;
}

/** `elevationV2` for a pad whose landmark v2 re-sites ('mean': unpinned), else nothing. */
function v2Elevation(lm: atlas.Landmark, v2: atlas.Landmark | undefined): Pick<TerrainPad, 'elevationV2'> {
  if (!v2 || v2.baseElevation === lm.baseElevation) return {};
  return { elevationV2: v2.baseElevation ?? 'mean' };
}

export async function buildRome(game: Game, opts: BuildRomeOptions = {}) {
  const report = opts.onProgress ?? (() => {});
  const extent = opts.extent ?? 'core';
  // Terrain always covers the whole city (cheap) so distant hills frame the view.
  const bounds = atlas.CITY_BOUNDS;
  // The core (+350 m) and the regions built to its detail (atlas.DETAIL_REGIONS).
  const landmarkBounds = extent === 'core' ? union([expand(atlas.CORE_BOUNDS, 350), ...atlas.DETAIL_REGIONS.map((r) => expand(r, 100))]) : atlas.CITY_BOUNDS;

  report(0.02, 'Surveying the seven hills');
  await tick();
  const hmProfile = terrainProfile();
  const hm = buildHeightmap(
    {
      BASE_ELEVATION: atlas.BASE_ELEVATION,
      HILLS: atlas.HILLS,
      LOWLANDS: atlas.LOWLANDS,
      RIVERS: atlas.RIVERS,
      ISLANDS: atlas.ISLANDS,
      ROADS: atlas.ROADS,
      BRIDGES: atlas.BRIDGES,
      bounds,
    },
    { spacing: opts.spacing ?? 2, pads: landmarkPads(landmarkBounds), profile: hmProfile },
  );
  game.heightmap = hm;

  report(0.2, 'Laying the ground');
  await tick();
  // Full resolution (2 m cells) to 150 m, not 205: the terrain was 10 % of the Forum's triangles (perf).
  game.terrain = new Terrain(game, hm, { lod: { leafFactor: 2.4 } });

  const extraWeight = (opts.steps ?? []).reduce((s, x) => s + x.weight, 0);
  const lmShare = 0.55 / (1 + extraWeight);
  report(0.3, 'Raising the monuments');
  await buildLandmarks(game, terrainLandmarks(hm.profile), hm, {
    bounds: landmarkBounds,
    highDetailPriority: extent === 'core' ? 2 : 1,
    onProgress: (d, t, name) => report(0.3 + lmShare * (d / t), name),
  });

  let f = 0.3 + lmShare;
  report(f, 'Filling the river');
  await buildWater(game, atlas, hm);
  await buildBridges(game, atlas, hm);
  report(f + 0.02, 'Building the insulae');
  await buildCity(game, atlas, hm, { extent, onProgress: (x, label) => report(f + 0.02 + 0.08 * x, label) });
  // Grass, trees, stones and kerbs on the open ground, after everything built on it.
  dressTerrain(game);
  f += 0.1;
  for (const step of opts.steps ?? []) {
    report(f, step.label);
    await tick();
    await step.run(game, hm);
    f += (0.65 * step.weight) / (1 + extraWeight);
  }
  // Rome stands: the builders' memo caches (column parts, instance shapes, kit pieces) and the
  // heightmap's road and pad masks (read into the terrain's textures) can go.
  releaseBuildCaches();
  hm.releaseBuildMasks();
  report(1, 'Rome awaits');
  return hm;
}

/** Game-space position on the ground at an atlas landmark (offset in game meters along its facade normal). */
export function spawnAtLandmark(game: Game, id: string, forward = 0, side = 0): { position: THREE.Vector3; heading: number } | null {
  const lm = atlas.LANDMARK_BY_ID[id];
  if (!lm) return null;
  const [gx, gz] = toGame(lm.center[0], lm.center[1]);
  const th = (lm.rotation * Math.PI) / 180;
  // Facade normal (compass bearing th): (sin th, -cos th) in x/z.
  const x = gx + Math.sin(th) * forward + Math.cos(th) * side;
  const z = gz - Math.cos(th) * forward + Math.sin(th) * side;
  const y = game.heightmap ? game.heightmap.heightAt(x, z) : 0;
  // Ray casts only see colliders added before the last physics step: right after the world is
  // built the ray would miss every raised floor and podium and drop the player under them.
  game.physics.step(1 / 60);
  const ground = game.physics.groundHeight(x, z, y + 80, 200);
  return { position: new THREE.Vector3(x, (ground ?? y) + 0.05, z), heading: Math.atan2(gx - x, gz - z) };
}

function union(bs: { minX: number; maxX: number; minZ: number; maxZ: number }[]) {
  return { minX: Math.min(...bs.map((b) => b.minX)), maxX: Math.max(...bs.map((b) => b.maxX)), minZ: Math.min(...bs.map((b) => b.minZ)), maxZ: Math.max(...bs.map((b) => b.maxZ)) };
}

function expand(b: { minX: number; maxX: number; minZ: number; maxZ: number }, m: number) {
  return { minX: b.minX - m, maxX: b.maxX + m, minZ: b.minZ - m, maxZ: b.maxZ + m };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
