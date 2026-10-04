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

export function landmarkPads(bounds: { minX: number; maxX: number; minZ: number; maxZ: number }): TerrainPad[] {
  const pads: TerrainPad[] = [];
  for (const lm of atlas.LANDMARKS) {
    if (!PAD_CATEGORIES.has(lm.category)) continue;
    if (lm.priority > 2) continue;
    const [x, z] = lm.center;
    if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) continue;
    // Very large complexes on slopes (e.g. terraced markets) keep their natural ground unless pinned.
    if (footprintRadius(lm) > 260 && lm.baseElevation === undefined) continue;
    pads.push({
      id: lm.id,
      polygon: footprintPolygon(lm.center, lm.rotation, lm.footprint as any, 3),
      elevation: lm.baseElevation,
      margin: 14,
    });
  }
  return pads;
}

export async function buildRome(game: Game, opts: BuildRomeOptions = {}) {
  const report = opts.onProgress ?? (() => {});
  const extent = opts.extent ?? 'core';
  // Terrain always covers the whole city (cheap) so distant hills frame the view.
  const bounds = atlas.CITY_BOUNDS;
  const landmarkBounds = extent === 'core' ? expand(atlas.CORE_BOUNDS, 350) : atlas.CITY_BOUNDS;

  report(0.02, 'Surveying the seven hills');
  await tick();
  const hm = buildHeightmap(
    {
      BASE_ELEVATION: atlas.BASE_ELEVATION,
      HILLS: atlas.HILLS,
      LOWLANDS: atlas.LOWLANDS,
      RIVERS: atlas.RIVERS,
      ISLANDS: atlas.ISLANDS,
      ROADS: atlas.ROADS,
      bounds,
    },
    { spacing: opts.spacing ?? 2, pads: landmarkPads(landmarkBounds) },
  );
  game.heightmap = hm;

  report(0.2, 'Laying the ground');
  await tick();
  game.terrain = new Terrain(game, hm);

  const extraWeight = (opts.steps ?? []).reduce((s, x) => s + x.weight, 0);
  const lmShare = 0.55 / (1 + extraWeight);
  report(0.3, 'Raising the monuments');
  await buildLandmarks(game, atlas.LANDMARKS, hm, {
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
  const ground = game.physics.groundHeight(x, z, y + 80, 200);
  return { position: new THREE.Vector3(x, (ground ?? y) + 0.05, z), heading: Math.atan2(gx - x, gz - z) };
}

function expand(b: { minX: number; maxX: number; minZ: number; maxZ: number }, m: number) {
  return { minX: b.minX - m, maxX: b.maxX + m, minZ: b.minZ - m, maxZ: b.maxZ + m };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
