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

/**
 * Trodden tracks (REAL m) the atlas has no road for. The game starts on the Via Appia outside the
 * Porta Capena, whose road stops at the gate: a worn track carries on round the gate and down to
 * the head of the triumphal road below the Palatine, so the first walk has a way to follow.
 */
export function desirePaths(): { points: P2[]; width: number }[] {
  const out: { points: P2[]; width: number }[] = [];
  const gate = atlas.LANDMARK_BY_ID['porta-capena'];
  const road = atlas.ROADS.find((r) => r.id === 'road-between-palatine-and-caelian');
  if (gate && road) {
    const [gx, gz] = gate.center;
    const th = (gate.rotation * Math.PI) / 180;
    const ox = Math.sin(th), oz = -Math.cos(th); // out through the facade
    const ax = Math.cos(th), az = Math.sin(th); // along it
    const [ex, ez] = road.points[0];
    // Round the side of the gate that faces the road's head.
    const sg = (ex - gx) * ax + (ez - gz) * az < 0 ? -1 : 1;
    const at = (o: number, a: number): P2 => [gx + ox * o + ax * a * sg, gz + oz * o + az * a * sg];
    const p2 = at(-12, 12);
    out.push({ points: [at(30, 0), at(12, 12), p2, [(p2[0] + ex) / 2 - 8, (p2[1] + ez) / 2 + 4], [ex, ez]], width: 3.5 });
  }
  return out;
}

export function romeTerrainInputs(): TerrainDataInputs {
  const cat = new Map(atlas.LANDMARKS.map((l) => [l.id, l.category]));
  return {
    regions: atlas.REGIONS.map((r) => ({ polygon: r.polygon, density: r.density })),
    gardens: gardenPolygons(),
    padKind: (id) => padKindFor(cat.get(id) ?? ''),
    paths: desirePaths(),
  };
}
