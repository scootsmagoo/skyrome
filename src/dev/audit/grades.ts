/**
 * Terrain grades audit (dev tool, pure): how steep the ground is where a player walks, and what
 * the ways up the hills ask of them. No Three.js, no scene: it reads a height grid (the terrain's
 * `Heightmap`, or any grid with the same layout) and, optionally, the city plan's class raster.
 *
 * - `cellGrades`: the steepest of the two triangles Rapier's heightfield (and the CDLOD mesh) draws
 *   in each 2 m cell, as rise / run. That is the slope the character controller meets.
 * - `walkClasses`: what a cell is underfoot (atlas road, minor street, flight of steps, open
 *   ground, a landmark's margin or square, water, or nothing walkable: a building, a block).
 * - `components`: connected patches of walkable cells over a grade (the steep spots, ranked).
 * - `bottleneck`: the easiest way up: for every cell, the least "steepest grade on the way" from
 *   the low ground (minimax Dijkstra), by surface slope or by the uphill grade of the move
 *   itself (a walker who zig-zags).
 * - `profile` / `regrade`: grade along a polyline (a road), and the smallest cut and fill that
 *   would keep it under a grade (the Lipschitz envelopes of its profile).
 * - `scaleAbout` / `relax`: what-if transforms for softening the hills.
 *
 * `scripts/audit/grades.mjs` runs it over the whole city (offline, with the real controller on the
 * real terrain colliders) and `scripts/audit/grades-live.mjs` checks the worst places in the game.
 */

export interface HeightGrid {
  minX: number;
  minZ: number;
  spacing: number;
  nx: number;
  nz: number;
  heights: Float32Array;
}

export const toDeg = (grade: number) => (Math.atan(grade) * 180) / Math.PI;
export const toGrade = (deg: number) => Math.tan((deg * Math.PI) / 180);

/**
 * Per cell ((nx − 1) × (nz − 1), row-major by z): the steeper of the cell's two triangles, split
 * along (ix, iz)–(ix + 1, iz + 1) as Rapier's heightfield and the terrain patch both split it.
 */
export function cellGrades(g: HeightGrid, h: Float32Array = g.heights): Float32Array {
  const cx = g.nx - 1, cz = g.nz - 1, s = g.spacing;
  const out = new Float32Array(cx * cz);
  for (let iz = 0; iz < cz; iz++) {
    for (let ix = 0; ix < cx; ix++) {
      const k = iz * g.nx + ix;
      const h00 = h[k], h10 = h[k + 1], h01 = h[k + g.nx], h11 = h[k + g.nx + 1];
      // (p00, p10, p11): d/dx = h10 − h00, d/dz = h11 − h10.  (p00, p11, p01): d/dx = h11 − h01, d/dz = h01 − h00.
      const a = Math.hypot(h10 - h00, h11 - h10) / s;
      const b = Math.hypot(h11 - h01, h01 - h00) / s;
      out[iz * cx + ix] = a > b ? a : b;
    }
  }
  return out;
}

/** What a cell is underfoot. */
export const WALK = { NONE: 0, ROAD: 1, STREET: 2, STAIRS: 3, OPEN: 4, PRECINCT: 5, WATER: 6 } as const;
export const WALK_NAMES = ['none', 'road', 'street', 'stairs', 'open', 'precinct', 'water'] as const;
/** Walkable on (or just above) the terrain: the grade of the terrain is the grade underfoot. */
export const onTerrain = (w: number) => w === WALK.ROAD || w === WALK.STREET || w === WALK.OPEN || w === WALK.PRECINCT;

/** The city plan's raster classes (src/world/city/raster.ts K), duplicated so this file stays import-free. */
const K = { FREE: 0, ROAD: 1, STREET: 2, LANDMARK: 3, MARGIN: 4, PLAZA: 5, GARDEN: 6, WATER: 7, STEEP: 8, WALL: 9, AQUEDUCT: 10, PIAZZA: 11, OUTSIDE: 12, SCRAP: 13 };

export interface PlanLike {
  grid: { x0: number; z0: number; cell: number; nx: number; nz: number; cls: Uint8Array; owner: Int32Array };
  roads: { index: number; style: string }[];
}

/**
 * Walk class per height-grid cell, read from the city plan at the cell's centre. After planning a
 * FREE cell is a built block (garden blocks were turned into GARDEN), so FREE, LANDMARK and WALL
 * are not ground anyone walks on; WATER is the river's channel and banks, split by the water level.
 */
export function walkClasses(g: HeightGrid, plan: PlanLike | null, waterY: number): Uint8Array {
  const cx = g.nx - 1, cz = g.nz - 1;
  const out = new Uint8Array(cx * cz);
  const roadStyle = new Map<number, string>();
  if (plan) for (const r of plan.roads) roadStyle.set(r.index, r.style);
  const pg = plan?.grid;
  for (let iz = 0; iz < cz; iz++) {
    for (let ix = 0; ix < cx; ix++) {
      const x = g.minX + (ix + 0.5) * g.spacing, z = g.minZ + (iz + 0.5) * g.spacing;
      const k = iz * g.nx + ix;
      const hc = (g.heights[k] + g.heights[k + 1] + g.heights[k + g.nx] + g.heights[k + g.nx + 1]) * 0.25;
      let w: number = WALK.OPEN;
      if (pg) {
        const px = Math.floor((x - pg.x0) / pg.cell), pz = Math.floor((z - pg.z0) / pg.cell);
        const pi = px >= 0 && pz >= 0 && px < pg.nx && pz < pg.nz ? pz * pg.nx + px : -1;
        const c = pi < 0 ? K.OUTSIDE : pg.cls[pi];
        if (c === K.ROAD) w = roadStyle.get(pg.owner[pi] - 1_000_000) === 'stairs' ? WALK.STAIRS : WALK.ROAD;
        else if (c === K.STREET) w = WALK.STREET;
        else if (c === K.MARGIN || c === K.PLAZA || c === K.PIAZZA) w = WALK.PRECINCT;
        else if (c === K.FREE || c === K.LANDMARK || c === K.WALL) w = WALK.NONE;
        else w = WALK.OPEN;
      }
      if (hc < waterY + 0.2 && w !== WALK.NONE) w = WALK.WATER;
      out[iz * cx + ix] = w;
    }
  }
  return out;
}

export interface Component {
  cells: number;
  /** Area in m² (cells × spacing²). */
  area: number;
  /** Centroid (game x, z) and the cell of the steepest grade. */
  cx: number;
  cz: number;
  max: number;
  maxAt: [number, number];
  mean: number;
  /** Cells per walk class. */
  byClass: number[];
  bbox: [number, number, number, number];
}

/**
 * Connected (8-neighbour) patches of cells where `mask(k)` holds, with their grade stats. Small
 * patches (under `minCells`) are dropped. Sorted by area, largest first.
 */
export function components(g: HeightGrid, grade: Float32Array, cls: Uint8Array, mask: (k: number) => boolean, minCells = 3): Component[] {
  const cx = g.nx - 1, cz = g.nz - 1;
  const seen = new Uint8Array(cx * cz);
  const stack = new Int32Array(cx * cz);
  const out: Component[] = [];
  for (let s = 0; s < cx * cz; s++) {
    if (seen[s] || !mask(s)) continue;
    let n = 0, sp = 0, sx = 0, sz = 0, max = -1, maxK = s, sum = 0;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    const byClass = [0, 0, 0, 0, 0, 0, 0];
    stack[sp++] = s;
    seen[s] = 1;
    while (sp) {
      const k = stack[--sp];
      const ix = k % cx, iz = (k / cx) | 0;
      n++;
      sx += ix;
      sz += iz;
      sum += grade[k];
      byClass[cls[k]]++;
      if (grade[k] > max) {
        max = grade[k];
        maxK = k;
      }
      if (ix < x0) x0 = ix;
      if (ix > x1) x1 = ix;
      if (iz < z0) z0 = iz;
      if (iz > z1) z1 = iz;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const jx = ix + dx, jz = iz + dz;
          if (jx < 0 || jz < 0 || jx >= cx || jz >= cz) continue;
          const j = jz * cx + jx;
          if (seen[j] || !mask(j)) continue;
          seen[j] = 1;
          stack[sp++] = j;
        }
      }
    }
    if (n < minCells) continue;
    const at = (ix: number, iz: number): [number, number] => [g.minX + (ix + 0.5) * g.spacing, g.minZ + (iz + 0.5) * g.spacing];
    const c = at(sx / n, sz / n);
    out.push({
      cells: n,
      area: n * g.spacing * g.spacing,
      cx: c[0],
      cz: c[1],
      max,
      maxAt: at(maxK % cx, (maxK / cx) | 0),
      mean: sum / n,
      byClass,
      bbox: [...at(x0, z0), ...at(x1, z1)] as [number, number, number, number],
    });
  }
  return out.sort((a, b) => b.area - a.area);
}

/** Binary min-heap of (key, value) over typed arrays, with lazy deletion by the caller. */
class Heap {
  private keys: Float64Array;
  private vals: Int32Array;
  size = 0;
  constructor(cap: number) {
    this.keys = new Float64Array(cap);
    this.vals = new Int32Array(cap);
  }
  push(key: number, val: number) {
    if (this.size === this.keys.length) {
      const k = new Float64Array(this.size * 2), v = new Int32Array(this.size * 2);
      k.set(this.keys);
      v.set(this.vals);
      this.keys = k;
      this.vals = v;
    }
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= key) break;
      this.keys[i] = this.keys[p];
      this.vals[i] = this.vals[p];
      i = p;
    }
    this.keys[i] = key;
    this.vals[i] = val;
  }
  /** Pops the smallest; returns its value, its key in `topKey`. */
  topKey = 0;
  pop(): number {
    const v = this.vals[0];
    this.topKey = this.keys[0];
    const key = this.keys[--this.size], val = this.vals[this.size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && this.keys[c + 1] < this.keys[c]) c++;
      if (this.keys[c] >= key) break;
      this.keys[i] = this.keys[c];
      this.vals[i] = this.vals[c];
      i = c;
    }
    this.keys[i] = key;
    this.vals[i] = val;
    return v;
  }
}

/**
 * The easiest way up (minimax Dijkstra over cells, 8 neighbours): for every cell, the smallest
 * possible "steepest grade met on the way" from any source cell, walking only cells where
 * `passable(k)` holds. `mode: 'surface'` charges each cell's own (steepest) grade: what the
 * controller's slope limit sees. `mode: 'uphill'` charges the rise of each move over its run
 * (downhill is free): a walker who zig-zags, as long as no cell steeper than `wall` is entered.
 * Returns Infinity where nothing reaches; `prev` (optional) gets the predecessor of each cell.
 */
export function bottleneck(
  g: HeightGrid,
  grade: Float32Array,
  sources: (k: number) => boolean,
  passable: (k: number) => boolean,
  opts: { mode?: 'surface' | 'uphill'; wall?: number; prev?: Int32Array } = {},
): Float32Array {
  const cx = g.nx - 1, cz = g.nz - 1;
  const n = cx * cz;
  const best = new Float32Array(n).fill(Infinity);
  const done = new Uint8Array(n);
  const prev = opts.prev;
  if (prev) prev.fill(-1);
  const uphill = opts.mode === 'uphill';
  const wall = opts.wall ?? Infinity;
  // Cell-centre heights for the uphill mode.
  let hc: Float32Array | null = null;
  if (uphill) {
    hc = new Float32Array(n);
    const h = g.heights;
    for (let iz = 0; iz < cz; iz++) for (let ix = 0; ix < cx; ix++) {
      const k = iz * g.nx + ix;
      hc[iz * cx + ix] = (h[k] + h[k + 1] + h[k + g.nx] + h[k + g.nx + 1]) * 0.25;
    }
  }
  const heap = new Heap(1 << 16);
  for (let k = 0; k < n; k++) {
    if (!sources(k) || !passable(k)) continue;
    const c = uphill ? 0 : grade[k];
    best[k] = c;
    heap.push(c, k);
  }
  const s = g.spacing, diag = Math.SQRT2 * s;
  while (heap.size) {
    const k = heap.pop();
    if (done[k]) continue;
    done[k] = 1;
    const bk = best[k];
    const ix = k % cx, iz = (k / cx) | 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const jx = ix + dx, jz = iz + dz;
        if (jx < 0 || jz < 0 || jx >= cx || jz >= cz) continue;
        const j = jz * cx + jx;
        if (done[j] || !passable(j)) continue;
        let c: number;
        if (uphill) {
          if (grade[j] > wall) continue;
          const rise = hc![j] - hc![k];
          c = rise > 0 ? rise / (dx && dz ? diag : s) : 0;
        } else c = grade[j];
        const v = c > bk ? c : bk;
        if (v < best[j]) {
          best[j] = v;
          if (prev) prev[j] = k;
          heap.push(v, j);
        }
      }
    }
  }
  return best;
}

export interface Profile {
  /** Distance along the line (m), position and ground height per sample. */
  s: Float32Array;
  x: Float32Array;
  z: Float32Array;
  y: Float32Array;
  /** Signed grade over a centred window (rise / run along the line). */
  grade: Float32Array;
  length: number;
}

/** Ground profile along a polyline (game m), sampled every `step` m, grades over `window` m. */
export function profile(heightAt: (x: number, z: number) => number, pts: readonly (readonly [number, number])[], step = 1, window = 4): Profile {
  const xs: number[] = [], zs: number[] = [], ss: number[] = [];
  let acc = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    const m = Math.max(1, Math.ceil(L / step));
    for (let k = 0; k < m; k++) {
      const t = k / m;
      xs.push(ax + (bx - ax) * t);
      zs.push(az + (bz - az) * t);
      ss.push(acc + L * t);
    }
    acc += L;
  }
  if (pts.length) {
    const l = pts[pts.length - 1];
    xs.push(l[0]);
    zs.push(l[1]);
    ss.push(acc);
  }
  const n = xs.length;
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) y[i] = heightAt(xs[i], zs[i]);
  const grade = new Float32Array(n);
  const half = window / 2;
  let a = 0, b = 0;
  for (let i = 0; i < n; i++) {
    while (a < i && ss[i] - ss[a] > half) a++;
    while (b + 1 < n && ss[b + 1] - ss[i] <= half) b++;
    const run = ss[b] - ss[a];
    grade[i] = run > 1e-6 ? (y[b] - y[a]) / run : 0;
  }
  return { s: Float32Array.from(ss), x: Float32Array.from(xs), z: Float32Array.from(zs), y, grade, length: acc };
}

/**
 * The smallest change to a profile that keeps every grade under `maxGrade` (Chebyshev-optimal):
 * the mean of its largest G-Lipschitz minorant and smallest G-Lipschitz majorant. Returns the new
 * heights and the deepest cut / highest fill (m).
 */
export function regrade(s: Float32Array, y: Float32Array, maxGrade: number): { y: Float32Array; cut: number; fill: number } {
  const n = y.length;
  const lo = new Float32Array(y), hi = new Float32Array(y);
  for (let i = 1; i < n; i++) {
    const d = (s[i] - s[i - 1]) * maxGrade;
    lo[i] = Math.min(lo[i], lo[i - 1] + d);
    hi[i] = Math.max(hi[i], hi[i - 1] - d);
  }
  for (let i = n - 2; i >= 0; i--) {
    const d = (s[i + 1] - s[i]) * maxGrade;
    lo[i] = Math.min(lo[i], lo[i + 1] + d);
    hi[i] = Math.max(hi[i], hi[i + 1] - d);
  }
  const out = new Float32Array(n);
  let cut = 0, fill = 0;
  for (let i = 0; i < n; i++) {
    out[i] = (lo[i] + hi[i]) / 2;
    const d = out[i] - y[i];
    if (-d > cut) cut = -d;
    if (d > fill) fill = d;
  }
  return { y: out, cut, fill };
}

/** Heights scaled about a datum: y' = datum + (y − datum)·k (a lower vertical scale for the land above it). */
export function scaleAbout(h: Float32Array, k: number, datum: number): Float32Array {
  const out = new Float32Array(h.length);
  for (let i = 0; i < h.length; i++) out[i] = h[i] > datum ? datum + (h[i] - datum) * k : h[i];
  return out;
}

/**
 * Slope-limited relaxation (thermal erosion): wherever two neighbouring samples differ by more
 * than `maxGrade` × their distance and `movable` allows both, half the excess moves from the high
 * one to the low one (mass is kept: ridges come down, feet come up). `iterations` sweeps.
 */
export function relax(g: HeightGrid, maxGrade: number, iterations: number, movable: (i: number) => boolean = () => true): Float32Array {
  const h = new Float32Array(g.heights);
  const nx = g.nx, nz = g.nz, s = g.spacing;
  const lim = maxGrade * s, limD = maxGrade * s * Math.SQRT2;
  const mov = new Uint8Array(nx * nz);
  for (let i = 0; i < mov.length; i++) mov[i] = movable(i) ? 1 : 0;
  const pairs: [number, number, number][] = [[1, 0, lim], [0, 1, lim], [1, 1, limD], [-1, 1, limD]];
  for (let it = 0; it < iterations; it++) {
    let moved = 0;
    for (const [dx, dz, L] of pairs) {
      for (let iz = 0; iz < nz; iz++) {
        const jz = iz + dz;
        if (jz < 0 || jz >= nz) continue;
        for (let ix = 0; ix < nx; ix++) {
          const jx = ix + dx;
          if (jx < 0 || jx >= nx) continue;
          const a = iz * nx + ix, b = jz * nx + jx;
          const d = h[a] - h[b];
          const ex = Math.abs(d) - L;
          if (ex <= 0) continue;
          const ma = mov[a], mb = mov[b];
          if (!ma && !mb) continue;
          const sign = d > 0 ? 1 : -1;
          if (ma && mb) {
            h[a] -= (sign * ex) / 2;
            h[b] += (sign * ex) / 2;
          } else if (ma) h[a] -= sign * ex;
          else h[b] += sign * ex;
          moved++;
        }
      }
    }
    if (!moved) break;
  }
  return h;
}

/** Quantiles of the values where `mask` holds (sorted copy; q in 0..1). */
export function quantiles(v: Float32Array, mask: (k: number) => boolean, qs: readonly number[]): number[] {
  const sel: number[] = [];
  for (let k = 0; k < v.length; k++) if (mask(k)) sel.push(v[k]);
  if (!sel.length) return qs.map(() => NaN);
  const a = Float32Array.from(sel).sort();
  return qs.map((q) => a[Math.min(a.length - 1, Math.max(0, Math.round(q * (a.length - 1))))]);
}
