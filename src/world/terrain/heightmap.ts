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
  /** Blend distance (real m) outside the footprint. */
  margin?: number;
}
export interface TerrainSource {
  BASE_ELEVATION: number;
  HILLS: readonly TerrainHill[];
  LOWLANDS: readonly TerrainLowland[];
  RIVERS: readonly TerrainRiver[];
  ISLANDS: readonly TerrainIsland[];
  ROADS?: readonly TerrainRoad[];
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

/** Distance beyond the channel half width (real m) past which a river can't lower the ground. */
export function riverReach(r: { bankHeight: number; kind?: 'river' | 'canal' }): number {
  if (r.kind === 'canal') return 2;
  return 16 + RIVER_PLAIN + Math.max(0, RIVER_MAX_GROUND - r.bankHeight - RIVER_PLAIN * 0.02) / RIVER_OUTER_GRADE + 10;
}

/**
 * Cross-section of a canal (real m ASL): a flat bed 1.6 m below the water and near-vertical
 * masonry sides up to 0.5 m above it; the ground beyond is untouched.
 */
export function canalProfile(r: { waterLevel: number }, d: number, half: number): number {
  const bed = r.waterLevel - 1.6;
  if (d < half) return bed;
  if (d < half + 0.8) return bed + (r.waterLevel + 0.5 - bed) * smooth(half, half + 0.8, d);
  return Infinity;
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

/** The natural (pre-road, pre-pad) elevation function in real meters. */
export function makeNaturalElevation(src: TerrainSource, opts: { noise?: number; seed?: number; quays?: readonly TerrainQuay[] } = {}) {
  const noiseAmp = opts.noise ?? 0.6;
  const seed = opts.seed ?? 113;
  const quays = opts.quays ?? TIBER_QUAYS;
  const lowlands = src.LOWLANDS.flatMap((l) => {
    const b = clipBox(bbox(l, l.polygon, 60), src.bounds);
    return b ? [{ ...b, sdf: sdfGrid(l.polygon, b, SDF_CELL) }] : [];
  });
  const hills = src.HILLS.flatMap((h) => {
    const b = clipBox(bbox(h, h.outline, h.slope + 10), src.bounds);
    if (!b) return [];
    // Inner radius ~ sqrt(area/π) so the summit dome reaches the summit near the middle.
    let area = 0;
    const o = h.outline;
    for (let i = 0, j = o.length - 1; i < o.length; j = i++) area += (o[j][0] + o[i][0]) * (o[j][1] - o[i][1]);
    const rIn = Math.max(20, Math.sqrt(Math.abs(area / 2) / Math.PI));
    return [{ ...b, rIn, sdf: sdfGrid(h.outline, b, SDF_CELL) }];
  });
  const islands = src.ISLANDS.map((i) => bbox(i, i.outline, 15));
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

  return (x: number, z: number): number => {
    // 1. Ground (base + lowlands), with the river valley carved into it: channel, banks and the
    //    gentle flood plain. Hills are raised on top of this, so the valley never shaves them.
    let g = ground(x, z);
    let smoothK = 1;
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
      const profile = r.kind === 'canal' ? canalProfile(r, f.d, half) : riverBankProfile(r, f.d, half);
      if (profile < g) g = profile;
      if (r.kind === 'canal' && f.d < half + 1.5) smoothK = 0;
    }
    let h = g;
    let hillFactor = 0;
    for (const b of hills) {
      if (!inBox(b, x, z)) continue;
      const hill = b.item;
      const sd = sampleSdf(b.sdf, x, z);
      let slope = hill.slope;
      if (hill.cliffs) {
        for (const c of hill.cliffs) {
          const dc = Math.sqrt(segDist2(x, z, c.a[0], c.a[1], c.b[0], c.b[1]));
          // Near-vertical tufa faces, but no steeper than the 2 m grid can draw without a
          // sawtooth where the cliff runs diagonally to it.
          const k = smooth(0, 70, dc);
          slope = Math.min(slope, CLIFF_RUN + (hill.slope - CLIFF_RUN) * k);
        }
      }
      let hh: number;
      if (sd <= 0) {
        hh = hill.plateau + (hill.summit - hill.plateau) * smooth(0, b.rIn, -sd);
      } else {
        const t = smooth(0, slope, sd);
        hh = hill.plateau + (g - hill.plateau) * t;
      }
      if (hh > h) h = hh;
      hillFactor = Math.max(hillFactor, 1 - smooth(0, slope, Math.max(0, sd)));
    }
    // Islands rise out of the river.
    let islandH = -Infinity;
    for (const b of islands) {
      if (!inBox(b, x, z)) continue;
      const sd = signedDistance(x, z, b.item.outline);
      if (sd < 12) islandH = Math.max(islandH, b.item.elevation - smooth(-6, 12, sd) * 6);
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
      const cut = r.kind === 'canal' ? canalProfile(r, f.d, half) : channelProfile(r, f.d, half);
      if (cut < h) h = cut;
      for (const q of b.quays) {
        const k = quayInfluence(q, f.s, f.side);
        if (k <= 0) continue;
        h += (quayProfile(r, f.d, half, q.quay.top, q.quay.width ?? 12, natural) - h) * k;
        // Built quays are flat: no ground noise on them.
        if (f.d < half + (q.quay.width ?? 12) + 25) smoothK = Math.min(smoothK, 1 - k);
      }
    }
    if (islandH > h) h = islandH;
    // Fine noise: a little on flats, more on hill slopes.
    if (noiseAmp > 0 && smoothK > 0) h += fbm(x, z, seed) * noiseAmp * (0.4 + hillFactor * 1.2) * smoothK;
    return h;
  };
}

export interface HeightmapFeatures {
  roads: readonly TerrainRoad[];
  pads: readonly TerrainPad[];
  rivers: readonly TerrainRiver[];
  islands: readonly TerrainIsland[];
  quays: readonly TerrainQuay[];
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
  /** Road mask 0..1 per sample (1 = on a road surface) — for texturing. */
  readonly roadMask: Float32Array;
  /** Pad mask 0..1 per sample (1 = flattened building pad). */
  readonly padMask: Float32Array;
  /** Water level in game y of the main river (for water rendering). */
  waterLevelY = 0;
  /**
   * The vector features the grid was built from (REAL meters, atlas frame), kept for the terrain
   * renderer (crisp road / pad edges, surfaces) and the water module. Null for hand-made grids.
   */
  features: HeightmapFeatures | null = null;

  constructor(minX: number, minZ: number, spacing: number, nx: number, nz: number) {
    this.minX = minX;
    this.minZ = minZ;
    this.spacing = spacing;
    this.nx = nx;
    this.nz = nz;
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

  /** Bilinear height at game (x, z). Clamped at the edges. */
  heightAt(x: number, z: number): number {
    const fx = Math.min(Math.max((x - this.minX) / this.spacing, 0), this.nx - 1.0001);
    const fz = Math.min(Math.max((z - this.minZ) / this.spacing, 0), this.nz - 1.0001);
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const i = iz * this.nx + ix;
    const h = this.heights;
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
    if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) return 0;
    return mask[iz * this.nx + ix];
  }
}

/**
 * Build the full heightmap: natural terrain → road leveling → building pads.
 */
export function buildHeightmap(src: TerrainSource, opts: HeightmapOptions = {}): Heightmap {
  const S = WORLD_SCALE;
  const spacing = opts.spacing ?? 2;
  const b = src.bounds;
  const minX = b.minX * S;
  const minZ = b.minZ * S;
  const nx = Math.floor((b.maxX - b.minX) * S / spacing) + 1;
  const nz = Math.floor((b.maxZ - b.minZ) * S / spacing) + 1;
  const hm = new Heightmap(minX, minZ, spacing, nx, nz);
  const quays = opts.quays ?? TIBER_QUAYS;
  const natural = makeNaturalElevation(src, { noise: opts.noise, seed: opts.seed, quays });

  // 1. Natural terrain (real meters).
  const real = new Float32Array(nx * nz);
  for (let iz = 0; iz < nz; iz++) {
    const z = (minZ + iz * spacing) / S;
    for (let ix = 0; ix < nx; ix++) {
      const x = (minX + ix * spacing) / S;
      real[iz * nx + ix] = natural(x, z);
    }
  }
  const sampleReal = (x: number, z: number) => {
    const fx = Math.min(Math.max((x * S - minX) / spacing, 0), nx - 1.0001);
    const fz = Math.min(Math.max((z * S - minZ) / spacing, 0), nz - 1.0001);
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const tx = fx - ix, tz = fz - iz;
    const i = iz * nx + ix;
    const a = real[i] + (real[i + 1] - real[i]) * tx;
    const c = real[i + nx] + (real[i + nx + 1] - real[i + nx]) * tx;
    return a + (c - a) * tz;
  };

  // 2. Roads: level crosswise to a smoothed centerline profile.
  const roads = (src.ROADS ?? []).filter((r) => r.points.length >= 2);
  const out = new Float32Array(real);
  for (const road of roads) {
    // Resample the centerline every ~6 m and smooth its profile over ~40 m.
    const pts: [number, number, number][] = [];
    for (let i = 0; i < road.points.length - 1; i++) {
      const [ax, az] = road.points[i];
      const [bx, bz] = road.points[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.ceil(L / 6));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        pts.push([x, z, sampleReal(x, z)]);
      }
    }
    const last = road.points[road.points.length - 1];
    pts.push([last[0], last[1], sampleReal(last[0], last[1])]);
    const win = 3;
    const prof = pts.map((_, i) => {
      let s = 0, c = 0;
      for (let k = -win; k <= win; k++) {
        const p = pts[Math.min(pts.length - 1, Math.max(0, i + k))];
        s += p[2];
        c++;
      }
      return s / c;
    });
    const half = road.width / 2;
    const reach = half + 6;
    // Stamp segment by segment (nearest segment wins), then blend: much cheaper than a nearest-
    // point search over the whole polyline for every sample in the road's bounding box.
    const rb = bbox(null, pts.map((p) => [p[0], p[1]] as const), reach);
    const ix0 = Math.max(0, Math.floor((rb.minX * S - minX) / spacing));
    const ix1 = Math.min(nx - 1, Math.ceil((rb.maxX * S - minX) / spacing));
    const iz0 = Math.max(0, Math.floor((rb.minZ * S - minZ) / spacing));
    const iz1 = Math.min(nz - 1, Math.ceil((rb.maxZ * S - minZ) / spacing));
    if (ix0 > ix1 || iz0 > iz1) continue;
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
        const m = 1 - smooth(half - 0.5, half + 1.5, d);
        if (m > hm.roadMask[k]) hm.roadMask[k] = m;
      }
    }
  }

  // 3. Building pads.
  for (const pad of opts.pads ?? []) {
    if (pad.polygon.length < 3) continue;
    let elev = pad.elevation;
    if (elev === undefined) {
      // Average natural ground over the footprint (vertices + centroid).
      let s = 0, c = 0, cx = 0, cz = 0;
      for (const [x, z] of pad.polygon) {
        s += sampleReal(x, z);
        c++;
        cx += x;
        cz += z;
      }
      cx /= pad.polygon.length;
      cz /= pad.polygon.length;
      s += sampleReal(cx, cz) * 2;
      c += 2;
      elev = s / c;
    }
    const margin = pad.margin ?? 12;
    const pb = bbox(null, pad.polygon, margin);
    const ix0 = Math.max(0, Math.floor((pb.minX * S - minX) / spacing));
    const ix1 = Math.min(nx - 1, Math.ceil((pb.maxX * S - minX) / spacing));
    const iz0 = Math.max(0, Math.floor((pb.minZ * S - minZ) / spacing));
    const iz1 = Math.min(nz - 1, Math.ceil((pb.maxZ * S - minZ) / spacing));
    for (let iz = iz0; iz <= iz1; iz++) {
      const z = (minZ + iz * spacing) / S;
      for (let ix = ix0; ix <= ix1; ix++) {
        const x = (minX + ix * spacing) / S;
        const sd = signedDistance(x, z, pad.polygon);
        if (sd > margin) continue;
        const w = 1 - smooth(1, margin, sd);
        const k = iz * nx + ix;
        out[k] = out[k] + (elev - out[k]) * w;
        const m = sd <= 0 ? 1 : 1 - smooth(0, 2, sd);
        if (m > hm.padMask[k]) hm.padMask[k] = m;
      }
    }
  }

  for (let k = 0; k < out.length; k++) hm.heights[k] = out[k] * S;
  const river = src.RIVERS[0];
  hm.waterLevelY = river ? river.waterLevel * S : -Infinity;
  hm.features = {
    roads,
    pads: (opts.pads ?? []).filter((p) => p.polygon.length >= 3),
    rivers: src.RIVERS,
    islands: src.ISLANDS,
    quays: quays.filter((q) => src.RIVERS.some((r) => r.id === q.river)),
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
