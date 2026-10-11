/**
 * Builds the terrain height grid from atlas data (hills, lowlands, river, islands), then levels
 * roads crosswise and flattens building pads. Pure math, no Three.js scene objects, so it can run
 * in tests or a worker.
 *
 * Inputs are REAL meters / m ASL (atlas frame); the output grid is in GAME meters
 * (WORLD_SCALE applied horizontally and vertically).
 */
import { WORLD_SCALE } from '../coords';
import { chain, footOn, indexSegments, nearSegments, quayInfluence, resolveQuays, TIBER_QUAYS, type TerrainQuay } from './riverbanks';
import { terrainProfile, type TerrainProfile } from './profile';
import { regrade } from './regrade';

export type { TerrainQuay } from './riverbanks';

export type P2 = readonly [number, number];

export interface TerrainHill {
  id: string;
  outline: readonly P2[];
  summit: number;
  plateau: number;
  slope: number;
  cliffs?: readonly { a: P2; b: P2 }[];
}
export interface TerrainLowland {
  id: string;
  polygon: readonly P2[];
  elevation: number;
}
export interface TerrainRiver {
  id: string;
  centerline: readonly P2[];
  width: readonly number[];
  waterLevel: number;
  bankHeight: number;
  /** 'canal': a narrow masonry-sided channel cut into the ground (no natural banks). */
  kind?: 'river' | 'canal';
}
export interface TerrainIsland {
  id: string;
  outline: readonly P2[];
  elevation: number;
}
export interface TerrainRoad {
  id: string;
  points: readonly P2[];
  width: number;
  /** Surface (atlas Road.paving); default 'basalt'. Only used for texturing. */
  paving?: 'basalt' | 'gravel' | 'dirt' | 'steps';
}
export interface TerrainPad {
  id: string;
  /** Footprint polygon in REAL meters. */
  polygon: readonly P2[];
  /** Fixed elevation (m ASL); omitted = average of the natural ground under the footprint. */
  elevation?: number;
  /**
   * Blend distance (real m) outside the footprint. Under v2 it is only the least: a pad blends
   * over max(margin, 1 + 2.6·|dh|) m, capped at 60, dh its height over the natural ground.
   */
  margin?: number;
  /**
   * How far (real m) `polygon` was grown past the landmark's own footprint (v2): inside it (signed
   * distance ≤ −grow) the pad wins over the roads. Omitted: the roads win everywhere (a forecourt).
   */
  grow?: number;
  /** v2's elevation when it differs from `elevation` (m ASL; 'mean': unpinned, the mean natural ground). */
  elevationV2?: number | 'mean';
}
/** A bridge (atlas BRIDGES, real m): v2 flattens the Tiber Island's edge inside its corridor. */
export interface TerrainBridge {
  id: string;
  a: P2;
  b: P2;
  width: number;
}
export interface TerrainSource {
  BASE_ELEVATION: number;
  HILLS: readonly TerrainHill[];
  LOWLANDS: readonly TerrainLowland[];
  RIVERS: readonly TerrainRiver[];
  ISLANDS: readonly TerrainIsland[];
  ROADS?: readonly TerrainRoad[];
  BRIDGES?: readonly TerrainBridge[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export interface HeightmapOptions {
  /** Grid spacing in GAME meters. */
  spacing?: number;
  pads?: readonly TerrainPad[];
  /** Amplitude (real m) of the fine noise added on hills / flats. */
  noise?: number;
  seed?: number;
  /** Stone quays along rivers (default: the Tiber quays of AD 113; they only apply to a river with a matching id). */
  quays?: readonly TerrainQuay[];
  /** Terrain profile (profile.ts); default `terrainProfile()` (the URL, the environment, else v2). */
  profile?: TerrainProfile;
}

/** Signed distance from p to a closed polygon (negative inside). */
export function signedDistance(px: number, pz: number, poly: readonly P2[]): number {
  let inside = false;
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
    const d = segDist2(px, pz, xj, zj, xi, zi);
    if (d < best) best = d;
  }
  const d = Math.sqrt(best);
  return inside ? -d : d;
}

/** Squared distance from p to segment ab. */
export function segDist2(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = ax + dx * t - px;
  const ez = az + dz * t - pz;
  return ex * ex + ez * ez;
}

/** Distance to a polyline plus the interpolated parameter (index + fraction) of the nearest point. */
export function polylineNearest(px: number, pz: number, pts: readonly P2[]): { d: number; i: number; t: number } {
  let best = Infinity;
  let bi = 0;
  let bt = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = ax + dx * t - px;
    const ez = az + dz * t - pz;
    const d2 = ex * ex + ez * ez;
    if (d2 < best) {
      best = d2;
      bi = i;
      bt = t;
    }
  }
  return { d: Math.sqrt(best), i: bi, t: bt };
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

interface Bounded<T> {
  item: T;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function bbox<T>(item: T, pts: readonly P2[], pad: number): Bounded<T> {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { item, minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
}

const inBox = (b: Bounded<unknown>, x: number, z: number) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;

/**
 * Signed distance to a polygon sampled on a regular grid over a box, read back bilinearly. Exact
 * along straight edges (the field is linear there), slightly rounded at corners; ~20× cheaper than
 * `signedDistance` per query, which matters for the 2.3 M heightmap samples.
 */
interface SdfGrid {
  x0: number;
  z0: number;
  cell: number;
  nx: number;
  nz: number;
  d: Float32Array;
}

function sdfGrid(poly: readonly P2[], b: { minX: number; maxX: number; minZ: number; maxZ: number }, cell: number): SdfGrid {
  const nx = Math.max(2, Math.ceil((b.maxX - b.minX) / cell) + 1);
  const nz = Math.max(2, Math.ceil((b.maxZ - b.minZ) / cell) + 1);
  const d = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) d[j * nx + i] = signedDistance(b.minX + i * cell, b.minZ + j * cell, poly);
  return { x0: b.minX, z0: b.minZ, cell, nx, nz, d };
}

function sampleSdf(g: SdfGrid, x: number, z: number): number {
  const fx = Math.min(Math.max((x - g.x0) / g.cell, 0), g.nx - 1.0001);
  const fz = Math.min(Math.max((z - g.z0) / g.cell, 0), g.nz - 1.0001);
  const ix = fx | 0, iz = fz | 0;
  const tx = fx - ix, tz = fz - iz;
  const k = iz * g.nx + ix;
  const d = g.d;
  const a = d[k] + (d[k + 1] - d[k]) * tx;
  const c = d[k + g.nx] + (d[k + g.nx + 1] - d[k + g.nx]) * tx;
  return a + (c - a) * tz;
}

/** Intersect a box with the terrain bounds (plus a margin); null when they don't overlap. */
function clipBox<T extends { minX: number; maxX: number; minZ: number; maxZ: number }>(b: T, bounds: TerrainSource['bounds'] | undefined, m = 40): T | null {
  if (!bounds) return b;
  const out = { ...b, minX: Math.max(b.minX, bounds.minX - m), maxX: Math.min(b.maxX, bounds.maxX + m), minZ: Math.max(b.minZ, bounds.minZ - m), maxZ: Math.min(b.maxZ, bounds.maxZ + m) };
  return out.minX < out.maxX && out.minZ < out.maxZ ? out : null;
}

/** Horizontal run (real m) of a cliff face from plateau edge to foot. */
const CLIFF_RUN = 13;

/** Grid cell (real m) of the polygon distance fields. */
const SDF_CELL = 6;

/** Cheap deterministic value noise (real-meter input). */
function valueNoise(x: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const h = (a: number, b: number) => {
    let n = (a * 374761393 + b * 668265263 + seed * 2246822519) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = h(xi, zi), b = h(xi + 1, zi), c = h(xi, zi + 1), d = h(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, z: number, seed: number): number {
  let s = 0;
  let amp = 0.5;
  let f = 1 / 90;
  for (let o = 0; o < 4; o++) {
    s += (valueNoise(x * f, z * f, seed + o * 17) - 0.5) * amp;
    amp *= 0.5;
    f *= 2.1;
  }
  return s * 2; // ~[-1, 1]
}

/** Width (real m) of the gentle flood-plain rise behind a natural bank top. */
export const RIVER_PLAIN = 120;
/** Grade of the river's influence beyond the flood plain: steep, so hills keep their shape. */
const RIVER_OUTER_GRADE = 0.35;
/** Highest ground (m ASL) the river profile has to clear before it stops mattering. */
const RIVER_MAX_GROUND = 100;

/**
 * Cross-section of a natural river bank (real m ASL) at distance `d` from the centerline, for a
 * channel of half width `half`: bed 4 m below the water, a shelving underwater slope (wading is
 * possible only in the last few metres), a gravel/mud beach just above the water, then a cut bank
 * (about 1:3) up to `bankHeight`, then a gentle 2 % flood-plain rise for RIVER_PLAIN m. Beyond that
 * the profile climbs steeply, so the valley never shaves the foot of a hill (the Janiculum).
 * The terrain takes min(natural, profile).
 */
export function riverBankProfile(r: { waterLevel: number; bankHeight: number }, d: number, half: number): number {
  const wl = r.waterLevel;
  const bed = wl - 4;
  if (d < half - 10) return bed;
  if (d < half) return bed + (wl + 0.3 - bed) * smooth(half - 10, half, d);
  if (d < half + 5) return wl + 0.3 + 0.12 * (d - half);
  const inland = Math.max(0, d - half - 16);
  return wl + 0.9 + Math.max(0, r.bankHeight - wl - 0.9) * smooth(half + 5, half + 16, d) + Math.min(inland, RIVER_PLAIN) * 0.02 + Math.max(0, inland - RIVER_PLAIN) * RIVER_OUTER_GRADE;
}

/**
 * The channel as a cut through anything standing in it (hill slopes): the natural bank profile up
 * to the bank top, then a 45° face. Applied after the hills, so a hill that reaches the river
 * ends in a river cliff instead of filling the channel.
 */
export function channelProfile(r: { waterLevel: number; bankHeight: number }, d: number, half: number): number {
  if (d < half + 16) return riverBankProfile(r, d, half);
  return Math.max(r.waterLevel + 0.9, r.bankHeight) + (d - half - 16);
}

/**
 * A canal's masonry (real m): water `depth` deep between walls `wall` thick whose tops (the kerb)
 * stand `kerb` above the water, then a flat bank `bank` wide at kerb height and a `ramp` down to
 * the natural ground. The water module builds the walls; the terrain carries the rest.
 */
export const CANAL = { depth: 1.6, kerb: 0.5, wall: 2.4, bank: 3, ramp: 7 };

/** Distance beyond the channel half width (real m) past which a river can't change the ground. */
export function riverReach(r: { bankHeight: number; kind?: 'river' | 'canal' }): number {
  if (r.kind === 'canal') return CANAL.wall + CANAL.bank + CANAL.ramp + 1;
  return 16 + RIVER_PLAIN + Math.max(0, RIVER_MAX_GROUND - r.bankHeight - RIVER_PLAIN * 0.02) / RIVER_OUTER_GRADE + 10;
}

/**
 * Cross-section of a canal cut (real m ASL): a flat bed `CANAL.depth` below the water that runs
 * on under the inner half of the masonry walls (so the coarse grid never pokes up inside the
 * channel), rising to the kerb at the walls' back; beyond them the cut changes nothing.
 */
export function canalProfile(r: { waterLevel: number }, d: number, half: number): number {
  const bed = r.waterLevel - CANAL.depth;
  const trench = half + CANAL.wall * 0.5;
  if (d < trench) return bed;
  if (d < half + CANAL.wall) return bed + (r.waterLevel + CANAL.kerb - bed) * smooth(trench, half + CANAL.wall, d);
  return Infinity;
}

/**
 * Effective distance from a canal's centerline for its cross-section: beyond either end of the
 * line the channel stops square at the end wall (the water module builds it `CANAL.wall` thick)
 * instead of rounding off, so `max(lateral, half + distance past the end)`. Pure.
 */
export function canalDistance(pts: readonly P2[], f: { d: number; i: number; t: number; tx: number; tz: number }, x: number, z: number, half: number): number {
  const last = pts.length - 2;
  const atStart = f.i === 0 && f.t <= 0, atEnd = f.i === last && f.t >= 1;
  if (!atStart && !atEnd) return f.d;
  const [ex, ez] = atStart ? pts[0] : pts[pts.length - 1];
  const vx = x - ex, vz = z - ez;
  const along = Math.abs(vx * f.tx + vz * f.tz);
  const lateral = Math.abs(vx * f.tz - vz * f.tx);
  return Math.max(lateral, half + along);
}

/**
 * Ground at distance `d` from a canal's centerline, given the natural ground `g` (real m ASL):
 * the cut, then a bank at kerb height where the land lies lower (Agrippa's Euripus, fed by the
 * Aqua Virgo, ran a little above the Campus), ramping down to `g`. Pure.
 */
export function canalBank(r: { waterLevel: number }, d: number, half: number, g: number): number {
  const kerb = r.waterLevel + CANAL.kerb;
  const top = half + CANAL.wall + CANAL.bank;
  if (d < half + CANAL.wall) return canalProfile(r, d, half);
  if (d < top) return Math.max(g, kerb);
  if (d < top + CANAL.ramp) return g + Math.max(0, kerb - g) * (1 - smooth(top, top + CANAL.ramp, d));
  return g;
}

/**
 * Cross-section at a stone quay: deep water right at the face (barges moor there), a flat quay top
 * `width` m wide at `top`, then a blend back to the natural ground over 25 m.
 */
export function quayProfile(r: { waterLevel: number }, d: number, half: number, top: number, width: number, ground: number): number {
  const bed = r.waterLevel - 4;
  // The rise sits wholly behind the masonry face (water/quays.ts puts it at half - 3.2).
  if (d < half - 3.4) return bed;
  if (d < half - 1.4) return bed + (top - bed) * smooth(half - 3.4, half - 1.4, d);
  return top + (ground - top) * smooth(half + width, half + width + 25, d);
}

/**
 * v2 (phase 4b §3 item 4): designed hill flanks steeper than 30° get a longer run (real m) than
 * the atlas gives them. The plateau and the foot stay where they are; only the face spreads.
 */
export const V2_FLANK_RUN: Readonly<Record<string, number>> = { capitolium: 71, arx: 64, 'palatine-t34': 53 };

/** v2: a cliff segment ends this far (real m) short of an atlas road's band (the road's half width). */
export const CLIFF_ROAD_CLEAR = 15;

/**
 * v2 flank shape: eased-linear from 0 (plateau edge) to 1 (foot) over t in [0, 1]. The grade
 * ramps up over the first `EASE` of the run, holds, and eases out over the last `EASE`, so the
 * top grade is 1 / (1 − EASE) = 1.25 × the mean, against 1.5 × for v1's smoothstep. Pure.
 */
export const FLANK_EASE = 0.2;
export function easedLinear(t: number, e = FLANK_EASE): number {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const k = 2 * e * (1 - e);
  if (t < e) return (t * t) / k;
  if (t > 1 - e) {
    const u = 1 - t;
    return 1 - (u * u) / k;
  }
  return (t - e / 2) / (1 - e);
}

/** Top grade of a flank shape relative to its mean grade: 1.5 (v1 smoothstep) or 1.25 (v2). */
export function flankTopFactor(profile: TerrainProfile): number {
  return profile === 'v1' ? 1.5 : 1 / (1 - FLANK_EASE);
}

/** The run (real m) a hill's designed flank has under a profile. */
export function flankRun(hill: { id: string; slope: number }, profile: TerrainProfile): number {
  return profile === 'v1' ? hill.slope : (V2_FLANK_RUN[hill.id] ?? hill.slope);
}

/**
 * v2: the parts of a cliff segment that stay a cliff: the segment minus every stretch within
 * `CLIFF_ROAD_CLEAR` m of a road's band (flights of steps are left out: they are made to climb
 * cliffs). Pieces shorter than 2 m are dropped. Pure (real m).
 */
export function clipCliff(c: { a: P2; b: P2 }, roads: readonly TerrainRoad[], clear = CLIFF_ROAD_CLEAR): { a: P2; b: P2 }[] {
  const [ax, az] = c.a, [bx, bz] = c.b;
  const L = Math.hypot(bx - ax, bz - az);
  const near = roads.filter((r) => r.paving !== 'steps' && r.points.length >= 2);
  if (!near.length || L < 1e-6) return [c];
  const n = Math.max(2, Math.ceil(L));
  const blocked = (t: number) => {
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    for (const r of near) {
      const lim = r.width / 2 + clear;
      for (let i = 0; i + 1 < r.points.length; i++) {
        const p = r.points[i], q = r.points[i + 1];
        if (segDist2(x, z, p[0], p[1], q[0], q[1]) < lim * lim) return true;
      }
    }
    return false;
  };
  const out: { a: P2; b: P2 }[] = [];
  let start = -1;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const free = !blocked(t);
    if (free && start < 0) start = t;
    if ((!free || i === n) && start >= 0) {
      const end = free ? t : (i - 1) / n;
      if ((end - start) * L >= 2) out.push({ a: [ax + (bx - ax) * start, az + (bz - az) * start], b: [ax + (bx - ax) * end, az + (bz - az) * end] });
      start = -1;
    }
  }
  return out;
}

/**
 * v2: real m beyond the island outline the island's flat top runs on inside a bridge's corridor.
 * Off (0): the bridges fit their arcade to the wet channel, so a landing filled the Pons Cestius's
 * first arch; the walk onto the island is the bridge's own ramps (docs/modules/terrain.md).
 */
export const ISLAND_LANDING = 0;

/**
 * v2: how far (0..1) a point lies inside a bridge corridor (the deck's width plus 2 m each side,
 * fading out over 4 m), for the Tiber Island's landings. Pure (real m).
 */
function bridgeCorridor(bridges: readonly TerrainBridge[], x: number, z: number): number {
  let w = 0;
  for (const br of bridges) {
    const d = Math.sqrt(segDist2(x, z, br.a[0], br.a[1], br.b[0], br.b[1]));
    const half = br.width / 2;
    w = Math.max(w, 1 - smooth(half + 2, half + 6, d));
  }
  return w;
}

/**
 * The natural (pre-road, pre-pad) elevation function in real meters. After each call, `band`
 * holds how far (0..1) that point lies in a river's channel and banks, a quay or a canal: the
 * water bands the v2 pads and road earthworks leave alone (they keep v1's ground there); and
 * `cliff` (v2) how far it lies within reach of an atlas cliff's face, where pads keep their
 * given blend.
 */
export function makeNaturalElevation(
  src: TerrainSource,
  opts: { noise?: number; seed?: number; quays?: readonly TerrainQuay[]; sdfCell?: number; profile?: TerrainProfile } = {},
): ((x: number, z: number) => number) & { band: number; cliff: number } {
  const noiseAmp = opts.noise ?? 0.6;
  const seed = opts.seed ?? 113;
  const quays = opts.quays ?? TIBER_QUAYS;
  const v2 = (opts.profile ?? terrainProfile()) !== 'v1';
  const lowlands = src.LOWLANDS.flatMap((l) => {
    const b = clipBox(bbox(l, l.polygon, 60), src.bounds);
    return b ? [{ ...b, sdf: sdfGrid(l.polygon, b, opts.sdfCell ?? SDF_CELL) }] : [];
  });
  const hills = src.HILLS.flatMap((h) => {
    const run = v2 ? flankRun(h, 'v2') : h.slope;
    const b = clipBox(bbox(h, h.outline, run + 10), src.bounds);
    if (!b) return [];
    // Inner radius ~ sqrt(area/π) so the summit dome reaches the summit near the middle.
    let area = 0;
    const o = h.outline;
    for (let i = 0, j = o.length - 1; i < o.length; j = i++) area += (o[j][0] + o[i][0]) * (o[j][1] - o[i][1]);
    const rIn = Math.max(20, Math.sqrt(Math.abs(area / 2) / Math.PI));
    const cliffs = v2 && h.cliffs ? h.cliffs.flatMap((c) => clipCliff(c, src.ROADS ?? [])) : h.cliffs;
    return [{ ...b, rIn, run, cliffs, sdf: sdfGrid(h.outline, b, opts.sdfCell ?? SDF_CELL) }];
  });
  const islands = src.ISLANDS.map((i) => bbox(i, i.outline, 15));
  const bridges = v2 ? (src.BRIDGES ?? []) : [];
  const rivers = src.RIVERS.map((r) => {
    const line = chain(r.centerline);
    const reach = Math.max(...r.width) / 2 + riverReach(r);
    return { ...bbox(r, r.centerline, reach), line, index: indexSegments(r.centerline, reach, 100), quays: resolveQuays(quays, r.id, line) };
  });

  /** Ground ignoring hills (base + lowlands). */
  const ground = (x: number, z: number): number => {
    let g = src.BASE_ELEVATION;
    for (const b of lowlands) {
      if (!inBox(b, x, z)) continue;
      const sd = sampleSdf(b.sdf, x, z);
      const w = 1 - smooth(-15, 45, sd);
      if (w > 0) g += (b.item.elevation - g) * w;
    }
    return g;
  };

  // Per-sample river feet, reused by the ground carve, the channel cut and the quays.
  const feet: ({ f: ReturnType<typeof footOn>; half: number } | null)[] = rivers.map(() => null);

  /** A canal yields where it reaches a river's channel or beach (its outfall). */
  const canalYields = (ri: number) => {
    for (let k = 0; k < rivers.length; k++) {
      const ft = feet[k];
      if (k !== ri && ft && rivers[k].item.kind !== 'canal' && ft.f.d < ft.half + 16) return true;
    }
    return false;
  };

  const fn = (x: number, z: number): number => {
    // 1. Ground (base + lowlands), with the river valley carved into it: channel, banks and the
    //    gentle flood plain. Hills are raised on top of this, so the valley never shaves them.
    let g = ground(x, z);
    let smoothK = 1;
    let band = 0;
    for (let ri = 0; ri < rivers.length; ri++) {
      const b = rivers[ri];
      feet[ri] = null;
      if (!inBox(b, x, z)) continue;
      const segs = nearSegments(b.index, x, z);
      if (!segs) continue;
      const r = b.item;
      const f = footOn(b.line, x, z, segs);
      const w0 = r.width[f.i] ?? r.width[r.width.length - 1];
      const w1 = r.width[f.i + 1] ?? w0;
      const half = (w0 + (w1 - w0) * f.t) / 2;
      feet[ri] = { f, half };
      if (r.kind === 'canal') continue;
      // The channel, its beach and its cut bank (to the bank top 16 m out), and any quay.
      band = Math.max(band, 1 - smooth(half + 16, half + 26, f.d));
      const profile = riverBankProfile(r, f.d, half);
      if (profile < g) g = profile;
    }
    // Canals after the rivers: their banks may raise the ground, except at their outfall.
    for (let ri = 0; ri < rivers.length; ri++) {
      const ft = feet[ri];
      const r = rivers[ri].item;
      if (!ft || r.kind !== 'canal') continue;
      if (canalYields(ri)) {
        feet[ri] = null;
        continue;
      }
      const d = canalDistance(rivers[ri].line.pts, ft.f, x, z, ft.half);
      g = canalBank(r, d, ft.half, g);
      const reach = ft.half + CANAL.wall + CANAL.bank + CANAL.ramp;
      if (d < reach) smoothK = 0;
      band = Math.max(band, 1 - smooth(reach, reach + 6, d));
    }
    let h = g;
    let hillFactor = 0;
    let cliff = 0;
    for (const b of hills) {
      if (!inBox(b, x, z)) continue;
      const hill = b.item;
      const sd = sampleSdf(b.sdf, x, z);
      let slope = b.run;
      if (b.cliffs) {
        for (const c of b.cliffs) {
          const dc = Math.sqrt(segDist2(x, z, c.a[0], c.a[1], c.b[0], c.b[1]));
          // Near-vertical tufa faces, but no steeper than the 2 m grid can draw without a
          // sawtooth where the cliff runs diagonally to it.
          const k = smooth(0, 70, dc);
          slope = Math.min(slope, CLIFF_RUN + (b.run - CLIFF_RUN) * k);
          // Within reach of the face (its top 20 m in, its foot and 20 m beyond): a barrier.
          if (v2 && sd > -20 && sd < CLIFF_RUN + 20) cliff = Math.max(cliff, 1 - smooth(10, 40, dc));
        }
      }
      let hh: number;
      if (sd <= 0) {
        hh = hill.plateau + (hill.summit - hill.plateau) * smooth(0, b.rIn, -sd);
      } else {
        const t = v2 ? easedLinear(sd / slope) : smooth(0, slope, sd);
        hh = hill.plateau + (g - hill.plateau) * t;
      }
      if (hh > h) h = hh;
      hillFactor = Math.max(hillFactor, 1 - smooth(0, slope, Math.max(0, sd)));
    }
    // Islands rise out of the river. Tiber Island was faced in travertine like a ship (the water
    // module builds the facing just outside the outline), so it stands on near-vertical sides.
    // v2: inside a bridge's corridor the flat top runs on ISLAND_LANDING m under the landing.
    let islandH = -Infinity;
    for (const b of islands) {
      if (!inBox(b, x, z)) continue;
      const sd = signedDistance(x, z, b.item.outline);
      const shift = bridges.length && sd > 0 && sd < 4.5 + ISLAND_LANDING ? ISLAND_LANDING * bridgeCorridor(bridges, x, z) : 0;
      if (sd < 4.5 + shift) islandH = Math.max(islandH, b.item.elevation - smooth(1.2 + shift, 4.5 + shift, sd) * 9);
    }
    // 2. The channel itself always wins over hill slopes: where a hill reaches the river the
    //    water cuts a steep bank into it (the Aventine's river cliff). Then the stone quays.
    const natural = h;
    for (let ri = 0; ri < rivers.length; ri++) {
      const ft = feet[ri];
      if (!ft) continue;
      const b = rivers[ri];
      const r = b.item;
      const { f, half } = ft;
      const cut = r.kind === 'canal' ? canalProfile(r, canalDistance(b.line.pts, f, x, z, half), half) : channelProfile(r, f.d, half);
      if (cut < h) h = cut;
      for (const q of b.quays) {
        const k = quayInfluence(q, f.s, f.side);
        if (k <= 0) continue;
        h += (quayProfile(r, f.d, half, q.quay.top, q.quay.width ?? 12, natural) - h) * k;
        // Built quays are flat: no ground noise on them.
        if (f.d < half + (q.quay.width ?? 12) + 25) smoothK = Math.min(smoothK, 1 - k);
        band = Math.max(band, k * (1 - smooth(half + (q.quay.width ?? 12), half + (q.quay.width ?? 12) + 10, f.d)));
      }
    }
    if (islandH > h) h = islandH;
    // Fine noise: a little on flats, more on hill slopes.
    if (noiseAmp > 0 && smoothK > 0) h += fbm(x, z, seed) * noiseAmp * (0.4 + hillFactor * 1.2) * smoothK;
    fn.band = band;
    fn.cliff = cliff;
    return h;
  };
  fn.band = 0;
  fn.cliff = 0;
  return fn as typeof fn & { band: number; cliff: number };
}

/**
 * A stretch of road edge (v2) where the ground within 8 real m of the road's band is steeper than
 * 38°: the STREETS crew builds a retaining wall along it. Unlike the other features it is in GAME
 * meters (it is read off the finished grid).
 */
export interface RetainingRun {
  /** Atlas road id. */
  road: string;
  /** Which side of the road, looking along its points: 1 = right (east of a road running north), −1 = left. */
  side: 1 | -1;
  /**
   * Points along the band's edge, about every 1.2 game m (2 real m): position (game x, z), the
   * road's surface at the edge (`y`, game), the ground 8 real m out (`ground`, game: above `y` a
   * cut, the wall holds back the slope; below it a fill, the wall holds up the road), and the
   * steepest grade (rise / run) met between them.
   */
  points: { x: number; z: number; y: number; ground: number; grade: number }[];
}

export interface HeightmapFeatures {
  roads: readonly TerrainRoad[];
  pads: readonly TerrainPad[];
  rivers: readonly TerrainRiver[];
  islands: readonly TerrainIsland[];
  quays: readonly TerrainQuay[];
  /** v2: road edges that need a retaining wall (empty under v1). */
  retaining: readonly RetainingRun[];
}

export class Heightmap {
  /** Game-space origin of the grid (x, z of sample [0,0]). */
  readonly minX: number;
  readonly minZ: number;
  readonly spacing: number;
  readonly nx: number;
  readonly nz: number;
  /** Game y values, row-major by z: heights[iz * nx + ix]. */
  readonly heights: Float32Array;
  /**
   * Road mask 0..1 per sample (1 = on a road surface) — for texturing. Read while the world is
   * built (the terrain's data textures, the reeds); `releaseBuildMasks` drops both masks after.
   */
  roadMask: Float32Array;
  /** Pad mask 0..1 per sample (1 = flattened building pad). */
  padMask: Float32Array;
  /** Water level in game y of the main river (for water rendering). */
  waterLevelY = 0;
  /**
   * The vector features the grid was built from (REAL meters, atlas frame), kept for the terrain
   * renderer (crisp road / pad edges, surfaces) and the water module. Null for hand-made grids.
   */
  features: HeightmapFeatures | null = null;
  /** The terrain profile this ground was built for (profile.ts); the drawn mesh reads it too. */
  readonly profile: TerrainProfile;
  /** v2: `heightAt` interpolates on the b–c triangles (the physics' and the drawn mesh's). */
  private readonly bc: boolean;

  constructor(minX: number, minZ: number, spacing: number, nx: number, nz: number, profile: TerrainProfile = terrainProfile()) {
    this.minX = minX;
    this.minZ = minZ;
    this.spacing = spacing;
    this.nx = nx;
    this.nz = nz;
    this.profile = profile;
    this.bc = profile !== 'v1';
    this.heights = new Float32Array(nx * nz);
    this.roadMask = new Float32Array(nx * nz);
    this.padMask = new Float32Array(nx * nz);
  }

  get maxX() {
    return this.minX + (this.nx - 1) * this.spacing;
  }
  get maxZ() {
    return this.minZ + (this.nz - 1) * this.spacing;
  }

  /**
   * Ground height at game (x, z), clamped at the edges. v2: on the triangles the player stands on
   * and sees, each cell split along b–c (from (x+1, z) to (x, z+1)) as Rapier's heightfield splits
   * it and the drawn patch is indexed (`patchGeometry`). v1: bilinear, between the two.
   */
  heightAt(x: number, z: number): number {
    const fx = Math.min(Math.max((x - this.minX) / this.spacing, 0), this.nx - 1.0001);
    const fz = Math.min(Math.max((z - this.minZ) / this.spacing, 0), this.nz - 1.0001);
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const i = iz * this.nx + ix;
    const h = this.heights;
    if (this.bc) {
      // Triangle (a, b, c) holds the corner (x, z); (b, d, c) the corner (x+1, z+1).
      if (tx + tz <= 1) return h[i] + (h[i + 1] - h[i]) * tx + (h[i + this.nx] - h[i]) * tz;
      const d = h[i + this.nx + 1];
      return d + (h[i + this.nx] - d) * (1 - tx) + (h[i + 1] - d) * (1 - tz);
    }
    const a = h[i] + (h[i + 1] - h[i]) * tx;
    const b = h[i + this.nx] + (h[i + this.nx + 1] - h[i + this.nx]) * tx;
    return a + (b - a) * tz;
  }

  /** Surface normal at game (x, z) via central differences. */
  normalAt(x: number, z: number, out: { x: number; y: number; z: number } = { x: 0, y: 1, z: 0 }) {
    const e = this.spacing;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    const nx = -hx;
    const ny = 2 * e;
    const nz = -hz;
    const l = Math.hypot(nx, ny, nz);
    out.x = nx / l;
    out.y = ny / l;
    out.z = nz / l;
    return out;
  }

  /** Slope in degrees at game (x, z). */
  slopeAt(x: number, z: number): number {
    const n = this.normalAt(x, z);
    return (Math.acos(Math.min(1, n.y)) * 180) / Math.PI;
  }

  sampleMask(mask: Float32Array, x: number, z: number): number {
    const ix = Math.round((x - this.minX) / this.spacing);
    const iz = Math.round((z - this.minZ) / this.spacing);
    if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz || !mask.length) return 0;
    return mask[iz * this.nx + ix];
  }

  /**
   * The world is built: the road and pad masks have gone into the terrain's data textures and the
   * reed placement, and nothing reads them after (17 MB at the city's grid, memory audit phase 3).
   * `sampleMask` answers 0 from then on.
   */
  releaseBuildMasks() {
    this.roadMask = new Float32Array(0);
    this.padMask = new Float32Array(0);
  }
}

/** The grid the stamping passes write: real meters in, samples (real m ASL) out. */
interface StampGrid {
  S: number;
  minX: number;
  minZ: number;
  spacing: number;
  nx: number;
  nz: number;
}

/** Bilinear read (real m in, real m ASL out) of a grid of real-metre heights. */
function sampleGrid(c: StampGrid, grid: Float32Array, x: number, z: number): number {
  const { S, minX, minZ, spacing, nx } = c;
  const fx = Math.min(Math.max((x * S - minX) / spacing, 0), nx - 1.0001);
  const fz = Math.min(Math.max((z * S - minZ) / spacing, 0), c.nz - 1.0001);
  const ix = Math.floor(fx), iz = Math.floor(fz);
  const tx = fx - ix, tz = fz - iz;
  const i = iz * nx + ix;
  const a = grid[i] + (grid[i + 1] - grid[i]) * tx;
  const cc = grid[i + nx] + (grid[i + nx + 1] - grid[i + nx]) * tx;
  return a + (cc - a) * tz;
}

/** Sample index range [i0, i1] × [j0, j1] covering a real-metre box; null when it misses the grid. */
function sampleBox(c: StampGrid, b: { minX: number; maxX: number; minZ: number; maxZ: number }) {
  const ix0 = Math.max(0, Math.floor((b.minX * c.S - c.minX) / c.spacing));
  const ix1 = Math.min(c.nx - 1, Math.ceil((b.maxX * c.S - c.minX) / c.spacing));
  const iz0 = Math.max(0, Math.floor((b.minZ * c.S - c.minZ) / c.spacing));
  const iz1 = Math.min(c.nz - 1, Math.ceil((b.maxZ * c.S - c.minZ) / c.spacing));
  return ix0 > ix1 || iz0 > iz1 ? null : { ix0, ix1, iz0, iz1 };
}

/** A road's centreline resampled every ~`step` m (real m), with the ground under each point. */
function roadPoints(road: TerrainRoad, ground: (x: number, z: number) => number, step = 6): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (let i = 0; i < road.points.length - 1; i++) {
    const [ax, az] = road.points[i];
    const [bx, bz] = road.points[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(L / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      pts.push([x, z, ground(x, z)]);
    }
  }
  const last = road.points[road.points.length - 1];
  pts.push([last[0], last[1], ground(last[0], last[1])]);
  return pts;
}

/** The profile as a moving average over 2·win + 1 points (v1: 7 points 6 m apart, ~40 m). */
function smoothProfile(pts: readonly [number, number, number][], win = 3): number[] {
  return pts.map((_, i) => {
    let s = 0, c = 0;
    for (let k = -win; k <= win; k++) {
      const p = pts[Math.min(pts.length - 1, Math.max(0, i + k))];
      s += p[2];
      c++;
    }
    return s / c;
  });
}

/** Average natural ground over a pad's footprint (vertices + twice the centroid): its height when not pinned. */
function padMeanGround(pad: TerrainPad, ground: (x: number, z: number) => number): number {
  let s = 0, c = 0, cx = 0, cz = 0;
  for (const [x, z] of pad.polygon) {
    s += ground(x, z);
    c++;
    cx += x;
    cz += z;
  }
  cx /= pad.polygon.length;
  cz /= pad.polygon.length;
  s += ground(cx, cz) * 2;
  c += 2;
  return s / c;
}

/**
 * v1 (the ground before phase 4b, kept byte-identical): roads leveled crosswise to a smoothed
 * profile of the natural ground, then the pads stamped over them with a fixed blend. `roadMask` /
 * `padMask` null: heights only (v2's reference ground in the water bands).
 */
function stampV1(c: StampGrid, real: Float32Array, out: Float32Array, roads: readonly TerrainRoad[], pads: readonly TerrainPad[], roadMask: Float32Array | null, padMask: Float32Array | null) {
  const { S, minX, minZ, spacing, nx } = c;
  const sampleReal = (x: number, z: number) => sampleGrid(c, real, x, z);
  // Roads: level crosswise to a smoothed centerline profile.
  for (const road of roads) {
    // Resample the centerline every ~6 m and smooth its profile over ~40 m.
    const pts = roadPoints(road, sampleReal);
    const prof = smoothProfile(pts);
    const half = road.width / 2;
    const reach = half + 6;
    // Stamp segment by segment (nearest segment wins), then blend: much cheaper than a nearest-
    // point search over the whole polyline for every sample in the road's bounding box.
    const box = sampleBox(c, bbox(null, pts.map((p) => [p[0], p[1]] as const), reach));
    if (!box) continue;
    const { ix0, ix1, iz0, iz1 } = box;
    const bw = ix1 - ix0 + 1;
    const bestD = new Float32Array(bw * (iz1 - iz0 + 1)).fill(Infinity);
    const bestT = new Float32Array(bestD.length);
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const dx = bx - ax, dz = bz - az;
      const l2 = dx * dx + dz * dz;
      const jx0 = Math.max(ix0, Math.floor(((Math.min(ax, bx) - reach) * S - minX) / spacing));
      const jx1 = Math.min(ix1, Math.ceil(((Math.max(ax, bx) + reach) * S - minX) / spacing));
      const jz0 = Math.max(iz0, Math.floor(((Math.min(az, bz) - reach) * S - minZ) / spacing));
      const jz1 = Math.min(iz1, Math.ceil(((Math.max(az, bz) + reach) * S - minZ) / spacing));
      for (let iz = jz0; iz <= jz1; iz++) {
        const z = (minZ + iz * spacing) / S;
        for (let ix = jx0; ix <= jx1; ix++) {
          const x = (minX + ix * spacing) / S;
          let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = ax + dx * t - x, ez = az + dz * t - z;
          const d = Math.sqrt(ex * ex + ez * ez);
          const q = (iz - iz0) * bw + (ix - ix0);
          if (d < bestD[q]) {
            bestD[q] = d;
            bestT[q] = prof[i] + (prof[i + 1] - prof[i]) * t;
          }
        }
      }
    }
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const q = (iz - iz0) * bw + (ix - ix0);
        const d = bestD[q];
        if (d > reach) continue;
        const w = 1 - smooth(half, reach, d);
        const k = iz * nx + ix;
        out[k] = out[k] + (bestT[q] - out[k]) * w;
        if (roadMask) {
          const m = 1 - smooth(half - 0.5, half + 1.5, d);
          if (m > roadMask[k]) roadMask[k] = m;
        }
      }
    }
  }

  // Building pads.
  for (const pad of pads) {
    if (pad.polygon.length < 3) continue;
    const elev = pad.elevation ?? padMeanGround(pad, sampleReal);
    const margin = pad.margin ?? 12;
    const box = sampleBox(c, bbox(null, pad.polygon, margin));
    if (!box) continue;
    for (let iz = box.iz0; iz <= box.iz1; iz++) {
      const z = (minZ + iz * spacing) / S;
      for (let ix = box.ix0; ix <= box.ix1; ix++) {
        const x = (minX + ix * spacing) / S;
        const sd = signedDistance(x, z, pad.polygon);
        if (sd > margin) continue;
        const w = 1 - smooth(1, margin, sd);
        const k = iz * nx + ix;
        out[k] = out[k] + (elev - out[k]) * w;
        if (padMask) {
          const m = sd <= 0 ? 1 : 1 - smooth(0, 2, sd);
          if (m > padMask[k]) padMask[k] = m;
        }
      }
    }
  }
}

/** v2 (§3 item 3): an atlas road's steepest 4 m stays at or under this grade (rise / run). */
export const ROAD_GRADE_CAP = 0.25;
/**
 * The grade v2 regrades a road's profile to: a little under the cap, so the grid's interpolation
 * (3.3 real m cells) and the road's crossings stay inside it.
 */
export const ROAD_GRADE_TARGET = 0.21;
/** v2: bank run per metre of cut or fill (real m). Eased-linear banks: 1.25 / 2.2 ≈ 30°. */
export const ROAD_BANK_PER_M = 2.2;
/** v2: the crosswise-level core of a road is at least this half width (real m), so the grid samples next to a narrow road's centreline sit on its profile. */
const ROAD_CORE_MIN = 3.4;

/** v2 (§3 item 2): a pad blends over max(given, 1 + 2.6·|dh|) real m, at most 60: banks of 30° or less. */
export function padMarginV2(given: number, dh: number): number {
  return Math.min(60, Math.max(given, 1 + 2.6 * Math.abs(dh)));
}

/**
 * How far a pad stands off the natural ground: the largest |elevation − ground| at its corners
 * and 7 and 14 m out from them (real m). What its blend has to make up.
 */
function padRise(pad: TerrainPad, elev: number, ground: (x: number, z: number) => number): number {
  let cx = 0, cz = 0;
  for (const [x, z] of pad.polygon) {
    cx += x;
    cz += z;
  }
  cx /= pad.polygon.length;
  cz /= pad.polygon.length;
  let dh = 0;
  for (const [x, z] of pad.polygon) {
    const L = Math.hypot(x - cx, z - cz) || 1;
    for (const m of [0, 7, 14]) dh = Math.max(dh, Math.abs(elev - ground(x + ((x - cx) / L) * m, z + ((z - cz) / L) * m)));
  }
  return dh;
}

/**
 * v2: natural ground → pads → roads. Pads blend by their height (`padMarginV2`), and where blends
 * overlap the nearer pad leads: each sample takes the pads' elevations weighted by their blend
 * over their distance squared, at the strength of all the blends together, so a high pad's long
 * embankment never buries a neighbour at another level (the bank between them stays where they
 * meet) and the result does not depend on the order of the pads. Inside a footprint (to 1 m out)
 * the pad is flat at its own level, the later one in atlas order where two overlap, as in v1.
 * Then the roads, each levelled crosswise to the profile of the natural ground under it (as v1),
 * smoothed and regraded to `ROAD_GRADE_TARGET` by the least cut and fill, with banks into the
 * padded ground as long as the earthwork needs. Inside a landmark's own footprint
 * (`TerrainPad.grow`) the pad still wins, and the road ramps to it: a road pinned where it runs
 * through a footprint or an earlier road's core, pulled toward the level of one its band grazes
 * (as far as the cap allows), and where two footprints on its line are farther apart in height
 * than the cap joins (`relaxPins`) or a graze is out of reach, its level core paves over the
 * footprint's edge. A road's banks leave an earlier road's core and shoulder alone. A pad blend
 * stays its given margin inside an atlas cliff's reach (`cliff`, 0..1 per sample): cliffs stay
 * barriers. Flights of steps keep their own climb and v1's 6 m banks.
 */
function stampV2(c: StampGrid, real: Float32Array, out: Float32Array, roads: readonly TerrainRoad[], pads: readonly TerrainPad[], roadMask: Float32Array, padMask: Float32Array, cliff: Float32Array) {
  const { S, minX, minZ, spacing, nx } = c;
  const sampleReal = (x: number, z: number) => sampleGrid(c, real, x, z);
  const core = new Uint8Array(out.length);

  // 1. Pads. Per sample: Σ π (π = blend / sd²), Σ π·elevation, Π (1 − blend), and the footprint's pad.
  const n = out.length;
  const sumP = new Float32Array(n);
  const sumPE = new Float32Array(n);
  const keep = new Float32Array(n).fill(1);
  const flat = new Float32Array(n).fill(NaN);
  const list = pads.filter((p) => p.polygon.length >= 3);
  for (const pad of list) {
    const pinned = pad.elevationV2 === 'mean' ? undefined : (pad.elevationV2 ?? pad.elevation);
    const elev = pinned ?? padMeanGround(pad, sampleReal);
    const given = pad.margin ?? 12;
    const margin = padMarginV2(given, padRise(pad, elev, sampleReal));
    const box = sampleBox(c, bbox(null, pad.polygon, margin));
    if (!box) continue;
    const grow = pad.grow;
    for (let iz = box.iz0; iz <= box.iz1; iz++) {
      const z = (minZ + iz * spacing) / S;
      for (let ix = box.ix0; ix <= box.ix1; ix++) {
        const x = (minX + ix * spacing) / S;
        const sd = signedDistance(x, z, pad.polygon);
        if (sd > margin) continue;
        const k = iz * nx + ix;
        const m = sd <= 0 ? 1 : 1 - smooth(0, 2, sd);
        if (m > padMask[k]) padMask[k] = m;
        if (grow !== undefined && sd <= -grow) core[k] = 1;
        if (sd <= 1) {
          flat[k] = elev;
          continue;
        }
        // By height, except where an atlas cliff stands: there the given blend.
        const mk = margin - (margin - given) * cliff[k];
        if (sd > mk) continue;
        const w = 1 - easedLinear((sd - 1) / (mk - 1));
        if (w <= 0) continue;
        const p = w / (sd * sd);
        sumP[k] += p;
        sumPE[k] += p * elev;
        keep[k] *= 1 - w;
      }
    }
  }
  for (let k = 0; k < n; k++) {
    if (!Number.isNaN(flat[k])) out[k] = flat[k];
    else if (sumP[k] > 0) out[k] = out[k] + (sumPE[k] / sumP[k] - out[k]) * (1 - keep[k]);
  }

  // 2. Roads over the padded ground, on their own (natural) profile: the vias and streets in
  //    atlas order, flights of steps last. A road keeps the level of what was there before it
  //    where its band meets an earlier road's core or a landmark's own footprint (its profile is
  //    pinned there and held to the grade cap on the way in), and does not stamp over them.
  const sampleOut = (x: number, z: number) => sampleGrid(c, out, x, z);
  const taken = new Uint8Array(out.length);
  const guard = new Uint8Array(out.length);
  /**
   * The level of the nearest held sample (a landmark's footprint, an earlier road's core) within
   * `r` real m of a point, and whether the point's own nearest sample is held (the road runs
   * through it, not past it); NaN when there is none.
   */
  const heldNear = (x: number, z: number, r: number): { v: number; through: boolean; road: boolean } => {
    const fx = (x * S - minX) / spacing, fz = (z * S - minZ) / spacing;
    const rc = (r * S) / spacing;
    const jx0 = Math.max(0, Math.ceil(fx - rc)), jx1 = Math.min(nx - 1, Math.floor(fx + rc));
    const jz0 = Math.max(0, Math.ceil(fz - rc)), jz1 = Math.min(c.nz - 1, Math.floor(fz + rc));
    let best = rc * rc, v = NaN, road = false;
    for (let iz = jz0; iz <= jz1; iz++) {
      for (let ix = jx0; ix <= jx1; ix++) {
        const k = iz * nx + ix;
        if (!core[k] && !taken[k]) continue;
        const d2 = (ix - fx) * (ix - fx) + (iz - fz) * (iz - fz);
        if (d2 <= best) {
          best = d2;
          v = out[k];
          road = taken[k] === 1;
        }
      }
    }
    const ix = Math.round(fx), iz = Math.round(fz);
    const k = ix >= 0 && iz >= 0 && ix < nx && iz < c.nz ? iz * nx + ix : -1;
    return { v, through: k >= 0 && (core[k] === 1 || taken[k] === 1), road };
  };
  const cellReal = spacing / S;
  const ordered = [...roads.filter((r) => r.paving !== 'steps'), ...roads.filter((r) => r.paving === 'steps')];
  for (const road of ordered) {
    const steps = road.paving === 'steps';
    // Every ~3 m (about a grid sample), smoothed over the same ~40 m as v1.
    const pts = roadPoints(road, sampleReal, 3);
    const prof = smoothProfile(pts, 6);
    const s = new Float64Array(pts.length);
    for (let i = 1; i < pts.length; i++) s[i] = s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    // Held points: where the road runs through a footprint or an earlier road (`through`), and
    // where its band only grazes one (within its half width, at least a grid cell: the samples
    // the centreline's ground is read from). A graze is held only while the cap allows it.
    const through = new Float64Array(pts.length).fill(NaN);
    const onRoad = new Uint8Array(pts.length);
    const graze = new Float64Array(pts.length).fill(NaN);
    let anyThrough = false, anyGraze = false;
    const r = Math.max(road.width / 2, ROAD_CORE_MIN) + cellReal;
    for (let i = 0; i < pts.length; i++) {
      const h = heldNear(pts[i][0], pts[i][1], r);
      if (Number.isNaN(h.v)) continue;
      if (h.through) {
        through[i] = h.v;
        onRoad[i] = h.road ? 1 : 0;
        anyThrough = true;
      } else {
        graze[i] = h.v;
        anyGraze = true;
      }
    }
    // Flights of steps keep their climb (the city builds the stairs); every other road is capped.
    const cap = steps ? Infinity : ROAD_GRADE_TARGET;
    const base = steps ? Float64Array.from(prof) : regrade(s, prof, ROAD_GRADE_TARGET).y;
    // Two footprints on the line at levels the cap cannot join: the road ramps inside their edges.
    if (anyThrough && !steps) relaxPins(s, through, onRoad, base, cap);
    let level = anyThrough ? holdToFixed(s, base, through, cap) : base;
    if (anyGraze && !steps) {
      // A graze pulls the road toward the level beside it: the least change to the profile that
      // meets every graze within the cap (Chebyshev, as the regrade), then the points it runs
      // through. Where the cap cannot reach a graze's level the band paves over the footprint's
      // edge (below).
      const want = Float64Array.from(base, (v, i) => (Number.isNaN(graze[i]) ? v : graze[i]));
      const fit = regrade(s, want, cap).y;
      level = anyThrough ? holdToFixed(s, fit, through, cap) : fit;
    }
    const half = road.width / 2;
    const coreW = Math.max(half, ROAD_CORE_MIN);
    // Bank run from the cut or fill (against the padded ground): ≥ 6 m, at most 60. Read at the
    // centreline, then again where the bank would end on either side until the run covers what it
    // meets there: a road cut into the foot of a rising pad blend or flank banks as long as the
    // ground it meets is high, not as long as the cut at its centre.
    const bankRun = (i: number, y: number) => {
      const [px, pz] = pts[i];
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const nx2 = -(b[1] - a[1]) / L, nz2 = (b[0] - a[0]) / L;
      let r = Math.min(60, Math.max(6, ROAD_BANK_PER_M * Math.abs(y - sampleOut(px, pz))));
      for (let it = 0; it < 4; it++) {
        const d = coreW + r;
        const need = Math.max(r, ROAD_BANK_PER_M * Math.abs(y - sampleOut(px + nx2 * d, pz + nz2 * d)), ROAD_BANK_PER_M * Math.abs(y - sampleOut(px - nx2 * d, pz - nz2 * d)));
        const nr = Math.min(60, need);
        if (nr <= r + 0.5) break;
        r = nr;
      }
      return r;
    };
    // Flights of steps keep v1's 6 m: they climb cliffs, which stay barriers beside them.
    const runs = Float64Array.from(level, (y, i) => (steps ? 6 : bankRun(i, y)));
    let maxRun = 6;
    for (const r of runs) maxRun = Math.max(maxRun, r);
    const reach = coreW + maxRun;
    const box = sampleBox(c, bbox(null, pts.map((p) => [p[0], p[1]] as const), reach));
    if (!box) continue;
    const { ix0, ix1, iz0, iz1 } = box;
    const bw = ix1 - ix0 + 1;
    const bestD = new Float32Array(bw * (iz1 - iz0 + 1)).fill(Infinity);
    const bestT = new Float32Array(bestD.length);
    const bestR = new Float32Array(bestD.length);
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const dx = bx - ax, dz = bz - az;
      const l2 = dx * dx + dz * dz;
      const jx0 = Math.max(ix0, Math.floor(((Math.min(ax, bx) - reach) * S - minX) / spacing));
      const jx1 = Math.min(ix1, Math.ceil(((Math.max(ax, bx) + reach) * S - minX) / spacing));
      const jz0 = Math.max(iz0, Math.floor(((Math.min(az, bz) - reach) * S - minZ) / spacing));
      const jz1 = Math.min(iz1, Math.ceil(((Math.max(az, bz) + reach) * S - minZ) / spacing));
      for (let iz = jz0; iz <= jz1; iz++) {
        const z = (minZ + iz * spacing) / S;
        for (let ix = jx0; ix <= jx1; ix++) {
          const x = (minX + ix * spacing) / S;
          let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = ax + dx * t - x, ez = az + dz * t - z;
          const d = Math.sqrt(ex * ex + ez * ez);
          const q = (iz - iz0) * bw + (ix - ix0);
          if (d < bestD[q]) {
            bestD[q] = d;
            bestT[q] = level[i] + (level[i + 1] - level[i]) * t;
            bestR[q] = runs[i] + (runs[i + 1] - runs[i]) * t;
          }
        }
      }
    }
    const mine: number[] = [];
    const shoulder: number[] = [];
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const q = (iz - iz0) * bw + (ix - ix0);
        const d = bestD[q];
        if (d > coreW + bestR[q]) continue;
        const k = iz * nx + ix;
        const m = 1 - smooth(half - 0.5, half + 1.5, d);
        if (m > roadMask[k]) roadMask[k] = m;
        // An earlier road's core stays; a footprint stays except under this road's own level core,
        // where a road that could not reach its level (a graze the cap cannot meet, a point it runs
        // through dropped by relaxPins) paves over it.
        if (taken[k] || (core[k] && (d > coreW || Math.abs(bestT[q] - out[k]) < 0.05))) continue;
        // Its banks leave an earlier road's shoulder (a grid cell past its core: the samples that
        // road's centreline is read from) alone.
        if (guard[k] && d > coreW) continue;
        const w = d <= coreW ? 1 : 1 - easedLinear((d - coreW) / bestR[q]);
        out[k] = out[k] + (bestT[q] - out[k]) * w;
        if (!steps && d <= coreW) mine.push(k);
        if (!steps && d <= coreW + cellReal) shoulder.push(k);
      }
    }
    for (const k of mine) taken[k] = 1;
    for (const k of shoulder) guard[k] = 1;
  }
}

/**
 * Drops held points (`pins`, NaN where free; in place) until every two neighbours can be joined at
 * grade `g`: of a pair too far apart in height, the one that is not on an earlier road (`fixedRoad`
 * 1: a crossing keeps its level), and of two such the one farther from the free profile `y`. So a
 * road that runs through two footprints at levels the cap cannot join ramps inside their edges. Pure.
 */
export function relaxPins(s: ArrayLike<number>, pins: Float64Array, fixedRoad: ArrayLike<number>, y: ArrayLike<number>, g: number) {
  const lim = g * 1.0001;
  for (let guard = 0; guard < pins.length; guard++) {
    let a = -1, drop = -1;
    for (let i = 0; i < pins.length && drop < 0; i++) {
      if (Number.isNaN(pins[i])) continue;
      if (a >= 0 && s[i] > s[a] && Math.abs(pins[i] - pins[a]) / (s[i] - s[a]) > lim) {
        const softA = !fixedRoad[a], softB = !fixedRoad[i];
        if (softA && softB) drop = Math.abs(pins[a] - y[a]) >= Math.abs(pins[i] - y[i]) ? a : i;
        else if (softA) drop = a;
        else if (softB) drop = i;
      }
      a = i;
    }
    if (drop < 0) return;
    pins[drop] = NaN;
  }
}

/**
 * A profile held to points that may not move (`fixed`, NaN where free): every free point is
 * clamped into the cones of grade `g` from all the fixed ones (max over j of v_j − g·|s − s_j|,
 * min of v_j + g·|s − s_j|), so a G-Lipschitz profile stays G-Lipschitz where the fixed points
 * allow it. Between two fixed points farther apart in height than `g` allows, the cone there is
 * the least grade that joins them (the profile ramps rather than steps); nowhere else. Pure.
 */
export function holdToFixed(s: ArrayLike<number>, y: ArrayLike<number>, fixed: ArrayLike<number>, g: number): Float64Array {
  const n = y.length;
  // The grade allowed on each step (i − 1 → i): `g`, or between two fixed points farther apart in
  // height than `g` allows (a landmark on the road's line above its climb), the least grade that
  // joins them, so the road ramps into them instead of stepping; only inside that gap.
  const gs = new Float64Array(n).fill(g);
  if (Number.isFinite(g)) {
    let last = -1;
    for (let i = 0; i < n; i++) {
      if (Number.isNaN(fixed[i])) continue;
      if (last >= 0 && s[i] > s[last]) {
        const need = (Math.abs(fixed[i] - fixed[last]) / (s[i] - s[last])) * 1.0001;
        if (need > g) for (let k = last + 1; k <= i; k++) gs[k] = need;
      }
      last = i;
    }
  }
  const lo = new Float64Array(n).fill(-Infinity), hi = new Float64Array(n).fill(Infinity);
  let l = -Infinity, h = Infinity;
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const d = (s[i] - s[i - 1]) * gs[i];
      l -= d;
      h += d;
    }
    if (!Number.isNaN(fixed[i])) {
      l = Math.max(l, fixed[i]);
      h = Math.min(h, fixed[i]);
    }
    lo[i] = l;
    hi[i] = h;
  }
  l = -Infinity;
  h = Infinity;
  for (let i = n - 1; i >= 0; i--) {
    if (i < n - 1) {
      const d = (s[i + 1] - s[i]) * gs[i + 1];
      l -= d;
      h += d;
    }
    if (!Number.isNaN(fixed[i])) {
      l = Math.max(l, fixed[i]);
      h = Math.min(h, fixed[i]);
    }
    lo[i] = Math.max(lo[i], l);
    hi[i] = Math.min(hi[i], h);
  }
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = Number.isNaN(fixed[i]) ? Math.min(Math.max(y[i], lo[i]), hi[i]) : fixed[i];
  return out;
}

/** v2: a road edge needs a retaining wall where the ground within this many real m is steeper than RETAIN_DEG. */
export const RETAIN_REACH = 8;
export const RETAIN_DEG = 38;

/**
 * v2 (§3 item 5): every stretch of road edge (atlas roads, flights of steps left out) where the
 * ground within RETAIN_REACH real m of the band is steeper than RETAIN_DEG, read off the finished
 * grid every 2 real m along the road, both sides. Drops into the river (a quay's own wall) are
 * left out. Runs of fewer than two points are dropped.
 */
export function retainingRuns(hm: Heightmap, roads: readonly TerrainRoad[]): RetainingRun[] {
  const S = WORLD_SCALE;
  const lim = Math.tan((RETAIN_DEG * Math.PI) / 180);
  const out: RetainingRun[] = [];
  const inGrid = (x: number, z: number) => x >= hm.minX && x <= hm.maxX && z >= hm.minZ && z <= hm.maxZ;
  for (const road of roads) {
    if (road.paving === 'steps' || road.points.length < 2) continue;
    const half = road.width / 2;
    const runs: Record<number, RetainingRun | null> = { 1: null, [-1]: null };
    const flush = (side: 1 | -1) => {
      const r = runs[side];
      if (r && r.points.length >= 2) out.push(r);
      runs[side] = null;
    };
    for (let i = 0; i + 1 < road.points.length; i++) {
      const [ax, az] = road.points[i];
      const [bx, bz] = road.points[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 1e-6) continue;
      const tx = (bx - ax) / L, tz = (bz - az) / L;
      // Right of the direction of travel: (−tz, tx) with +x east, +z south.
      const rx = -tz, rz = tx;
      const n = Math.max(1, Math.round(L / 2));
      for (let k = i === 0 ? 0 : 1; k <= n; k++) {
        const px = ax + (bx - ax) * (k / n), pz = az + (bz - az) * (k / n);
        for (const side of [1, -1] as const) {
          const ex = px + rx * side * half, ez = pz + rz * side * half;
          if (!inGrid(ex * S, ez * S)) {
            flush(side);
            continue;
          }
          const y = hm.heightAt(ex * S, ez * S);
          let prev = y, grade = 0;
          for (let m = 1; m <= RETAIN_REACH; m++) {
            const h = hm.heightAt((ex + rx * side * m) * S, (ez + rz * side * m) * S);
            grade = Math.max(grade, Math.abs(h - prev) / S);
            prev = h;
          }
          const ground = prev;
          if (grade > lim && Math.min(ground, y) > hm.waterLevelY + 0.3) {
            if (!runs[side]) runs[side] = { road: road.id, side, points: [] };
            runs[side]!.points.push({ x: ex * S, z: ez * S, y, ground, grade });
          } else flush(side);
        }
      }
    }
    flush(1);
    flush(-1);
  }
  return out;
}

/**
 * Build the full heightmap. v1: natural terrain → road leveling → building pads. v2: natural
 * terrain (eased flanks, cliffs short of the roads, the island's landings) → pads by height →
 * roads with capped grades; inside the water bands (the river's channel and banks, the quays, the
 * canal) the ground stays v1's, so the water's edge does not move.
 */
export function buildHeightmap(src: TerrainSource, opts: HeightmapOptions = {}): Heightmap {
  const S = WORLD_SCALE;
  const spacing = opts.spacing ?? 2;
  const b = src.bounds;
  const minX = b.minX * S;
  const minZ = b.minZ * S;
  const nx = Math.floor((b.maxX - b.minX) * S / spacing) + 1;
  const nz = Math.floor((b.maxZ - b.minZ) * S / spacing) + 1;
  const profile = opts.profile ?? terrainProfile();
  const hm = new Heightmap(minX, minZ, spacing, nx, nz, profile);
  const quays = opts.quays ?? TIBER_QUAYS;
  const natural = makeNaturalElevation(src, { noise: opts.noise, seed: opts.seed, quays, profile });
  const v2 = profile !== 'v1';

  // 1. Natural terrain (real meters), and how far each sample lies in a water band (v2).
  const real = new Float32Array(nx * nz);
  const band = v2 ? new Float32Array(nx * nz) : null;
  const cliff = v2 ? new Float32Array(nx * nz) : null;
  let anyBand = false;
  for (let iz = 0; iz < nz; iz++) {
    const z = (minZ + iz * spacing) / S;
    for (let ix = 0; ix < nx; ix++) {
      const x = (minX + ix * spacing) / S;
      const k = iz * nx + ix;
      real[k] = natural(x, z);
      if (band && natural.band > 0) {
        band[k] = natural.band;
        anyBand = true;
      }
      if (cliff) cliff[k] = natural.cliff;
    }
  }

  // 2–3. Roads and pads.
  const roads = (src.ROADS ?? []).filter((r) => r.points.length >= 2);
  const pads = opts.pads ?? [];
  const grid: StampGrid = { S, minX, minZ, spacing, nx, nz };
  const out = new Float32Array(real);
  if (!v2) stampV1(grid, real, out, roads, pads, hm.roadMask, hm.padMask);
  else {
    stampV2(grid, real, out, roads, pads, hm.roadMask, hm.padMask, cliff!);
    if (band && anyBand) {
      // The water bands keep v1's roads and pads: the channel, the quays and the canal stay put.
      // Only the roads and pads that reach a band sample change one (v1 stamps each from the
      // natural ground alone, so leaving the others out changes nothing there).
      const wet = (b: { minX: number; maxX: number; minZ: number; maxZ: number }) => {
        const box = sampleBox(grid, b);
        if (!box) return false;
        for (let iz = box.iz0; iz <= box.iz1; iz++) for (let ix = box.ix0; ix <= box.ix1; ix++) if (band[iz * nx + ix] > 0) return true;
        return false;
      };
      const ref = new Float32Array(real);
      stampV1(grid, real, ref, roads.filter((r) => wet(bbox(null, r.points, r.width / 2 + 6))), pads.filter((p) => p.polygon.length >= 3 && wet(bbox(null, p.polygon, p.margin ?? 12))), null, null);
      for (let k = 0; k < out.length; k++) if (band[k] > 0) out[k] += (ref[k] - out[k]) * band[k];
    }
  }

  for (let k = 0; k < out.length; k++) hm.heights[k] = out[k] * S;
  const river = src.RIVERS[0];
  hm.waterLevelY = river ? river.waterLevel * S : -Infinity;
  hm.features = {
    roads,
    pads: pads.filter((p) => p.polygon.length >= 3),
    rivers: src.RIVERS,
    islands: src.ISLANDS,
    quays: quays.filter((q) => src.RIVERS.some((r) => r.id === q.river)),
    retaining: v2 ? retainingRuns(hm, roads) : [],
  };
  return hm;
}

/** Footprint polygon (real meters) for an atlas-style landmark footprint. */
export function footprintPolygon(
  center: P2,
  rotationDeg: number,
  fp: { kind: 'rect'; w: number; d: number } | { kind: 'ellipse'; rx: number; rz: number } | { kind: 'circle'; r: number } | { kind: 'poly'; points: readonly P2[] },
  grow = 0,
): P2[] {
  if (fp.kind === 'poly') return fp.points.map((p) => [p[0], p[1]] as const);
  const th = (rotationDeg * Math.PI) / 180;
  // Local frame: facade faces -z; rotate clockwise by `rotation` seen from above (+x east, +z south).
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  const tr = (lx: number, lz: number): P2 => [center[0] + lx * cos - lz * sin, center[1] + lx * sin + lz * cos];
  if (fp.kind === 'rect') {
    const hw = fp.w / 2 + grow;
    const hd = fp.d / 2 + grow;
    return [tr(-hw, -hd), tr(hw, -hd), tr(hw, hd), tr(-hw, hd)];
  }
  const rx = (fp.kind === 'circle' ? fp.r : fp.rx) + grow;
  const rz = (fp.kind === 'circle' ? fp.r : fp.rz) + grow;
  const out: P2[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    out.push(tr(Math.cos(a) * rx, Math.sin(a) * rz));
  }
  return out;
}
