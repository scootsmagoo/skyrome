/**
 * Terrain texturing inputs derived from the atlas: how built-up each place is (trodden earth
 * between houses), where the gardens are (lush grass), and what the open apron of each building
 * pad is made of (travertine paving for fora and sanctuaries, gravel for camps and circuses,
 * beaten earth elsewhere). Pure data; used by `Terrain` when the caller passes nothing else.
 */
import * as atlas from '../../data/atlas';
import { footprintPolygon, type P2 } from './heightmap';
import type { PadKind, TerrainDataInputs } from './terrainData';

/** Landmark categories whose open ground is paved in travertine. */
const TRAVERTINE = new Set(['forum', 'market', 'temple', 'basilica', 'arch', 'column', 'monument', 'curia', 'library', 'portico', 'fountain', 'shrine', 'palace', 'theatre', 'odeum', 'amphitheatre', 'baths', 'gate', 'tomb']);
/** Categories with gravel / sand yards. */
const GRAVEL = new Set(['camp', 'circus', 'stadium', 'warehouse', 'harbor']);

export function padKindFor(category: string): PadKind {
  if (TRAVERTINE.has(category)) return 'travertine';
  if (GRAVEL.has(category)) return 'gravel';
  return 'earth';
}

/** Garden and grove footprints (REAL m). */
export function gardenPolygons(): P2[][] {
  const out: P2[][] = [];
  for (const lm of atlas.LANDMARKS) {
    if (lm.category !== 'garden') continue;
    out.push(footprintPolygon(lm.center, lm.rotation, lm.footprint as Parameters<typeof footprintPolygon>[2]));
  }
  return out;
}

export function romeTerrainInputs(): TerrainDataInputs {
  const cat = new Map(atlas.LANDMARKS.map((l) => [l.id, l.category]));
  return {
    regions: atlas.REGIONS.map((r) => ({ polygon: r.polygon, density: r.density })),
    gardens: gardenPolygons(),
    padKind: (id) => padKindFor(cat.get(id) ?? ''),
  };
}
