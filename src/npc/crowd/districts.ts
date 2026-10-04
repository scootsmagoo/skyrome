/**
 * Where am I, and who lives here? District crowd mixes (GDD §12.1 "Fabric and life") and points of
 * interest for idle activities, derived from the atlas so they line up with the landmarks wherever
 * the city crew puts its streets.
 *
 * All positions here are GAME metres.
 */
import * as atlas from '../../data/atlas';
import { toGame, toReal } from '../../world/coords';
import type { CrowdRoleId } from './roles';

export interface District {
  id: string;
  name: string;
  /** Crowd density 0..1.4 (1 = a busy quarter; the Forum is 1.25). */
  density: number;
  /** Day mix: relative weights per role. */
  weights: Partial<Record<CrowdRoleId, number>>;
}

interface DistrictDef extends District {
  /** Atlas lowland polygons (real metres) that define it. */
  lowlands: readonly string[];
}

const DISTRICTS: readonly DistrictDef[] = [
  {
    id: 'dist-forum-romanum',
    name: 'Forum Romanum',
    lowlands: ['forum-romanum'],
    // The busiest place in Rome: ~85 people around the player at hours 2–6 (GDD §14.7: ≥ 60 on screen is the Should).
    density: 1.4,
    weights: { citizen: 10, 'citizen-woman': 6, senator: 3, matron: 3, porter: 6, merchant: 4, artisan: 2, soldier: 3, priest: 2, idler: 4, beggar: 1, child: 2, elder: 2, foreigner: 3 },
  },
  {
    id: 'dist-fora-imperialia',
    name: 'Imperial Fora',
    lowlands: ['trajan-forum', 'argiletum-valley'],
    density: 0.85,
    weights: { citizen: 8, 'citizen-woman': 3, senator: 3, matron: 2, porter: 5, merchant: 3, artisan: 5, soldier: 3, priest: 1, idler: 2, child: 1, foreigner: 3 },
  },
  {
    id: 'dist-velia',
    name: 'Velia',
    lowlands: ['velia-north-slope'],
    density: 0.75,
    weights: { citizen: 8, 'citizen-woman': 5, senator: 1, matron: 3, porter: 6, merchant: 6, soldier: 1, child: 2, elder: 1, foreigner: 3 },
  },
  {
    id: 'dist-vallis-colossei',
    name: 'Colosseum valley',
    lowlands: ['colosseum-valley', 'labicana-valley-west'],
    density: 0.85,
    weights: { citizen: 10, 'citizen-woman': 4, porter: 3, merchant: 4, artisan: 2, soldier: 2, idler: 3, beggar: 1, child: 3, elder: 1, foreigner: 3 },
  },
  {
    id: 'dist-subura',
    name: 'Subura',
    lowlands: ['subura', 'subura-upper'],
    density: 0.9,
    weights: { citizen: 10, 'citizen-woman': 7, porter: 5, merchant: 3, artisan: 6, idler: 3, beggar: 2, child: 4, elder: 2, foreigner: 2 },
  },
  {
    id: 'dist-velabrum-boarium',
    name: 'Velabrum and Forum Boarium',
    lowlands: ['velabrum', 'forum-boarium', 'forum-holitorium'],
    density: 0.75,
    weights: { citizen: 9, 'citizen-woman': 5, porter: 8, merchant: 6, artisan: 4, soldier: 1, child: 2, elder: 1, foreigner: 3 },
  },
  {
    id: 'dist-circus-maximus',
    name: 'Circus Maximus',
    lowlands: ['vallis-murcia', 'valley-palatine-caelian'],
    density: 0.7,
    weights: { citizen: 9, 'citizen-woman': 5, porter: 4, merchant: 5, idler: 3, soldier: 1, child: 2, foreigner: 4 },
  },
];

/** Small districts around a point (real metres), checked before the lowlands. */
const RADIAL: readonly (District & { center: readonly [number, number]; r: number })[] = [
  {
    // The Porta Capena, where the Via Appia enters the city (the new-game spawn, GDD §2.1):
    // travellers, farmers bringing produce in at dawn, porters and muleteers.
    id: 'dist-porta-capena',
    name: 'Porta Capena',
    center: [490, 930],
    r: 140,
    density: 0.6,
    weights: { traveller: 7, farmer: 4, porter: 5, citizen: 4, 'citizen-woman': 2, merchant: 3, artisan: 2, soldier: 1, beggar: 1, foreigner: 2 },
  },
];

/** Generic mix for wherever no named district applies, scaled by the region's wealth. */
function genericDistrict(wealth: number, density: number, name: string): District {
  return {
    id: 'generic',
    name,
    density: Math.max(0.35, Math.min(0.8, density)),
    weights: {
      citizen: 10,
      'citizen-woman': 6,
      senator: 3 * wealth,
      matron: 4 * wealth,
      porter: 4 + 3 * wealth,
      merchant: 3,
      artisan: 5 * (1 - wealth) + 1,
      soldier: 1,
      beggar: 2 * (1 - wealth),
      child: 3,
      elder: 2,
      foreigner: 2,
      traveller: 1,
    },
  };
}

function inPoly(x: number, z: number, poly: readonly (readonly [number, number])[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

const lowlandById = new Map(atlas.LOWLANDS.map((l) => [l.id, l]));

/** The district at a game-space point. */
export function districtAt(x: number, z: number): District {
  const [rx, rz] = toReal(x, z);
  for (const d of RADIAL) if (Math.hypot(rx - d.center[0], rz - d.center[1]) <= d.r) return d;
  for (const d of DISTRICTS) {
    for (const id of d.lowlands) {
      const l = lowlandById.get(id);
      if (l && inPoly(rx, rz, l.polygon)) return d;
    }
  }
  for (const r of atlas.REGIONS) if (inPoly(rx, rz, r.polygon)) return genericDistrict(r.wealth, r.density, r.latin);
  return genericDistrict(0.4, 0.4, 'Roma');
}

// ---------------------------------------------------------------- points of interest

export type PoiKind = 'temple' | 'shrine' | 'steps' | 'fountain' | 'rostra' | 'curia' | 'market' | 'arch' | 'monument' | 'baths' | 'forum' | 'vesta';

export interface Poi {
  id: string;
  kind: PoiKind;
  /** Game metres, on the forecourt in front of the facade (not on the building). */
  x: number;
  z: number;
  /** Heading (Actor convention) from the poi toward the building: a worshipper faces this way. */
  face: number;
  /** Rough radius of the forecourt (m) for scattering people around it. */
  radius: number;
  landmarkId: string;
  name: string;
}

const KIND_BY_CATEGORY: Partial<Record<atlas.LandmarkCategory, PoiKind>> = {
  temple: 'temple',
  shrine: 'shrine',
  basilica: 'steps',
  fountain: 'fountain',
  curia: 'curia',
  market: 'market',
  arch: 'arch',
  monument: 'monument',
  column: 'monument',
  baths: 'baths',
  forum: 'forum',
  portico: 'steps',
  library: 'steps',
};

let pois: Poi[] | null = null;

/** Every point of interest in the atlas (computed once). */
export function allPois(): readonly Poi[] {
  if (pois) return pois;
  pois = [];
  for (const lm of atlas.LANDMARKS) {
    let kind = KIND_BY_CATEGORY[lm.category];
    if (lm.id === 'rostra') kind = 'rostra';
    if (lm.id === 'temple-vesta' || lm.id === 'atrium-vestae') kind = 'vesta';
    if (!kind) continue;
    if (lm.siting === 'underground') continue;
    const [gx, gz] = toGame(lm.center[0], lm.center[1]);
    // Depth of the footprint along the facade normal (real metres).
    const fp = lm.footprint;
    const depth = fp.kind === 'rect' ? fp.d : fp.kind === 'circle' ? fp.r * 2 : fp.kind === 'ellipse' ? fp.rz * 2 : 20;
    const width = fp.kind === 'rect' ? fp.w : fp.kind === 'circle' ? fp.r * 2 : fp.kind === 'ellipse' ? fp.rx * 2 : 20;
    const th = (lm.rotation * Math.PI) / 180;
    // Facade normal for compass bearing th: (sin th, -cos th) in x/z.
    const nx = Math.sin(th);
    const nz = -Math.cos(th);
    const big = kind === 'forum' || kind === 'market' || kind === 'baths';
    // Fora are open squares: their POI is the centre. Others: a few metres in front of the facade.
    const off = big ? 0 : (depth / 2) * 0.6 + 3.5;
    const x = gx + nx * off;
    const z = gz + nz * off;
    pois.push({
      id: `poi:${lm.id}`,
      kind,
      x,
      z,
      face: Math.atan2(gx - x, gz - z) || Math.atan2(-nx, -nz),
      radius: big ? Math.min(40, (Math.min(width, depth) / 2) * 0.6) : Math.min(14, Math.max(4, width * 0.6 * 0.35)),
      landmarkId: lm.id,
      name: lm.name,
    });
  }
  return pois;
}

/** Points of interest within `r` of a game point, nearest first. */
export function poisNear(x: number, z: number, r: number, kind?: PoiKind | readonly PoiKind[]): Poi[] {
  const kinds = kind === undefined ? null : Array.isArray(kind) ? kind : [kind];
  return allPois()
    .filter((p) => (!kinds || kinds.includes(p.kind)) && Math.hypot(p.x - x, p.z - z) <= r)
    .sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
}

/** Role multipliers near particular places (priests at temples, Vestals by the Atrium Vestae…). */
export function poiBoosts(x: number, z: number): Partial<Record<CrowdRoleId, number>> {
  const out: Partial<Record<CrowdRoleId, number>> = {};
  for (const p of poisNear(x, z, 70)) {
    if (p.kind === 'vesta') out.vestal = Math.max(out.vestal ?? 0, 3);
    if (p.kind === 'temple' || p.kind === 'shrine') out.priest = Math.max(out.priest ?? 1, 2);
    if (p.kind === 'curia') out.senator = Math.max(out.senator ?? 1, 2);
    if (p.kind === 'market') out.merchant = Math.max(out.merchant ?? 1, 2);
  }
  return out;
}
