/**
 * Where Rome's trees grow (pure placement from the plan raster):
 * - horti and groves (GARDEN): umbrella pines and cypresses dominating, plane trees, laurels,
 *   oleanders, figs, in clumps with open lawns between;
 * - hill flanks too steep to build on (STEEP): pines, holm-oak-like laurels, olives, wild figs;
 * - the riverbanks: giant reeds at the water's edge, a few plane trees;
 * - the countryside outside the regions: scattered pines, olive groves, cypresses;
 * - leftover scraps of ground in the city: the odd fig or laurel.
 * Yard trees of the blocks come from the block layouts (massing.ts).
 */
import { Rng, hash2 } from '../../core/Rng';
import { fbm2 } from '../../arch/vegetation/geom';
import type { TreeSpecies } from '../../arch/vegetation/species';
import type { CityPlan } from './plan';
import { K } from './raster';

export interface TreeSpot {
  species: TreeSpecies;
  x: number;
  z: number;
  scale: number;
}

type Mix = readonly (readonly [TreeSpecies, number])[];

const GARDEN: Mix = [['umbrella_pine', 3.2], ['cypress', 2.2], ['plane', 1.4], ['laurel', 1.4], ['oleander', 1.0], ['olive', 0.6], ['fig', 0.4]];
const STEEP: Mix = [['umbrella_pine', 1.6], ['laurel', 2.2], ['olive', 1.2], ['cypress', 0.8], ['fig', 0.6], ['oleander', 0.4]];
const RURAL: Mix = [['umbrella_pine', 2.5], ['olive', 2.0], ['cypress', 1.2], ['laurel', 0.6]];
const SCRAP: Mix = [['fig', 1], ['laurel', 1.2], ['cypress', 0.5], ['oleander', 0.5]];

/**
 * Tree spots over the plan inside `area` (game m). `step` is the sampling grid; each sample plants
 * at most one tree with a probability from the ground class and a clumping noise.
 */
export function placeTrees(plan: CityPlan, area: { minX: number; minZ: number; maxX: number; maxZ: number }, waterY: number, seed = 31): TreeSpot[] {
  const g = plan.grid;
  const out: TreeSpot[] = [];
  const rng = new Rng(seed);
  const step = 7;
  for (let z = area.minZ; z < area.maxZ; z += step) {
    for (let x = area.minX; x < area.maxX; x += step) {
      const jx = x + rng.range(0, step), jz = z + rng.range(0, step);
      const i = g.index(jx, jz);
      if (i < 0) continue;
      const c = g.cls[i];
      const clump = fbm2(jx * 0.018, jz * 0.018, 9);
      let p = 0;
      let mix: Mix | null = null;
      if (c === K.GARDEN) {
        p = clump > 0.42 ? 0.75 : 0.12;
        mix = GARDEN;
      } else if (c === K.STEEP) {
        p = clump > 0.45 ? 0.5 : 0.15;
        mix = STEEP;
      } else if (c === K.OUTSIDE) {
        p = clump > 0.58 ? 0.35 : 0.025;
        mix = RURAL;
      } else if (c === K.SCRAP) {
        p = 0.12;
        mix = SCRAP;
      }
      // Riverbank: giant reeds on the shore (the water band between the water line and the bank).
      if (c === K.WATER) {
        const y = plan.hy[i];
        if (y > waterY - 0.15 && y < waterY + 1.6 && rng.chance(clump > 0.4 ? 0.6 : 0.25)) out.push({ species: 'reeds', x: jx, z: jz, scale: rng.range(0.8, 1.25) });
        else if (y > waterY + 1.6 && rng.chance(0.08)) out.push({ species: 'plane', x: jx, z: jz, scale: rng.range(0.8, 1.05) });
        continue;
      }
      if (!mix || !rng.chance(p)) continue;
      const species = rng.weighted(mix);
      // Keep big crowns off the cell edges of narrow strips: need the same class around.
      const r = species === 'umbrella_pine' || species === 'plane' ? 3 : 1.5;
      if (g.at(jx + r, jz) !== c || g.at(jx - r, jz) !== c || g.at(jx, jz + r) !== c || g.at(jx, jz - r) !== c) continue;
      out.push({ species, x: jx, z: jz, scale: rng.range(0.8, 1.15) * (species === 'umbrella_pine' ? 1.05 : 1) });
    }
  }
  return out;
}

/** Deterministic per-position helper (for scattering that must not depend on iteration order). */
export function hashChance(x: number, z: number, seed: number, p: number): boolean {
  return hash2(Math.round(x * 4), Math.round(z * 4), seed) / 4294967296 < p;
}
