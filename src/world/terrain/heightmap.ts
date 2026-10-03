/**
 * Builds the terrain height grid from atlas data (hills, lowlands, river, islands), then levels
 * roads crosswise and flattens building pads. Pure math, no Three.js scene objects, so it can run
 * in tests or a worker.
 *
 * Inputs are REAL meters / m ASL (atlas frame); the output grid is in GAME meters
 * (WORLD_SCALE applied horizontally and vertically).
 */
import { WORLD_SCALE } from '../coords';

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

/** The natural (pre-road, pre-pad) elevation function in real meters. */
export function makeNaturalElevation(src: TerrainSource, opts: { noise?: number; seed?: number } = {}) {
  const noiseAmp = opts.noise ?? 0.6;
  const seed = opts.seed ?? 113;
  const lowlands = src.LOWLANDS.map((l) => bbox(l, l.polygon, 60));
  const hills = src.HILLS.map((h) => {
    const b = bbox(h, h.outline, h.slope + 10);
    // Inner radius ~ sqrt(area/π) so the summit dome reaches the summit near the middle.
    let area = 0;
    const o = h.outline;
    for (let i = 0, j = o.length - 1; i < o.length; j = i++) area += (o[j][0] + o[i][0]) * (o[j][1] - o[i][1]);
    const rIn = Math.max(20, Math.sqrt(Math.abs(area / 2) / Math.PI));
    return { ...b, rIn };
  });
  const islands = src.ISLANDS.map((i) => bbox(i, i.outline, 15));
  const rivers = src.RIVERS.map((r) => bbox(r, r.centerline, Math.max(...r.width) / 2 + 60));

  /** Ground ignoring hills (base + lowlands). */
  const ground = (x: number, z: number): number => {
    let g = src.BASE_ELEVATION;
    for (const b of lowlands) {
      if (!inBox(b, x, z)) continue;
      const sd = signedDistance(x, z, b.item.polygon);
      const w = 1 - smooth(-15, 45, sd);
      if (w > 0) g += (b.item.elevation - g) * w;
    }
    return g;
  };

  return (x: number, z: number): number => {
    const g = ground(x, z);
    let h = g;
    let hillFactor = 0;
    for (const b of hills) {
      if (!inBox(b, x, z)) continue;
      const hill = b.item;
      const sd = signedDistance(x, z, hill.outline);
      let slope = hill.slope;
      if (hill.cliffs) {
        for (const c of hill.cliffs) {
          const dc = Math.sqrt(segDist2(x, z, c.a[0], c.a[1], c.b[0], c.b[1]));
          const k = smooth(0, 70, dc);
          slope = Math.min(slope, 9 + (hill.slope - 9) * k);
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
    // River channel carves down.
    for (const b of rivers) {
      if (!inBox(b, x, z)) continue;
      const r = b.item;
      const n = polylineNearest(x, z, r.centerline);
      const w0 = r.width[n.i] ?? r.width[r.width.length - 1];
      const w1 = r.width[n.i + 1] ?? w0;
      const half = (w0 + (w1 - w0) * n.t) / 2;
      const bed = r.waterLevel - 4;
      let profile: number;
      if (n.d < half - 8) profile = bed;
      else if (n.d < half) profile = bed + (r.waterLevel + 0.4 - bed) * smooth(half - 8, half, n.d);
      else profile = r.waterLevel + 0.4 + Math.max(0, r.bankHeight - r.waterLevel - 0.4) * smooth(half, half + 30, n.d) + (n.d - half) * 0.02;
      if (profile < h) h = profile;
    }
    if (islandH > h) h = islandH;
    // Fine noise: a little on flats, more on hill slopes.
    if (noiseAmp > 0) h += fbm(x, z, seed) * noiseAmp * (0.4 + hillFactor * 1.2);
    return h;
  };
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
  const natural = makeNaturalElevation(src, { noise: opts.noise, seed: opts.seed });

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
    const line: P2[] = pts.map((p) => [p[0], p[1]] as const);
    const half = road.width / 2;
    const reach = half + 6;
    const rb = bbox(null, line, reach);
    const ix0 = Math.max(0, Math.floor((rb.minX * S - minX) / spacing));
    const ix1 = Math.min(nx - 1, Math.ceil((rb.maxX * S - minX) / spacing));
    const iz0 = Math.max(0, Math.floor((rb.minZ * S - minZ) / spacing));
    const iz1 = Math.min(nz - 1, Math.ceil((rb.maxZ * S - minZ) / spacing));
    for (let iz = iz0; iz <= iz1; iz++) {
      const z = (minZ + iz * spacing) / S;
      for (let ix = ix0; ix <= ix1; ix++) {
        const x = (minX + ix * spacing) / S;
        const n = polylineNearest(x, z, line);
        if (n.d > reach) continue;
        const target = prof[n.i] + ((prof[n.i + 1] ?? prof[n.i]) - prof[n.i]) * n.t;
        const w = 1 - smooth(half, reach, n.d);
        const k = iz * nx + ix;
        // Don't raise roads out of the river: only level where the ground is above water.
        out[k] = out[k] + (target - out[k]) * w;
        const m = 1 - smooth(half - 0.5, half + 1.5, n.d);
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
