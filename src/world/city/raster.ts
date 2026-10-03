/**
 * Raster toolkit for city planning (pure, no Three.js): a class grid over the ground plane in game
 * meters, polygon / band / disc stamping with predicates, 4-connected labelling, boundary tracing
 * into polygons (with holes) and Douglas–Peucker simplification.
 *
 * Cell (ix, iz) covers x ∈ [x0 + ix·cell, x0 + (ix+1)·cell), z likewise; its centre is used for
 * every point test. Polygons traced from a cell set have positive signed area (the inward normal
 * of edge a→b is (−dz, dx)), matching `src/arch/fabric/polygon.ts`.
 */

export type Pt = [number, number];

/** Ground classes of the plan raster. */
export const K = {
  FREE: 0, // buildable (becomes city blocks)
  ROAD: 1, // atlas road corridor (carriageway + sidewalks)
  STREET: 2, // minor street (vicus / angiportus / stairs)
  LANDMARK: 3, // landmark footprint
  MARGIN: 4, // walkable ground around a landmark
  PLAZA: 5, // open square / market / precinct
  GARDEN: 6, // horti and groves (vegetation instead of buildings)
  WATER: 7, // river channel and banks
  STEEP: 8, // slopes too steep to build on (wild / scrub)
  WALL: 9, // Servian wall band
  AQUEDUCT: 10, // aqueduct pier line
  PIAZZA: 11, // small crossroads square (compitum, lacus)
  OUTSIDE: 12, // outside the planned area / outside the city
  SCRAP: 13, // slivers left by the street cuts (open ground)
} as const;
export type Klass = (typeof K)[keyof typeof K];

export class Grid {
  readonly cls: Uint8Array;
  /** Owner id per cell (landmark / plaza / street index), −1 = none. */
  readonly owner: Int32Array;

  constructor(
    readonly x0: number,
    readonly z0: number,
    readonly cell: number,
    readonly nx: number,
    readonly nz: number,
  ) {
    this.cls = new Uint8Array(nx * nz);
    this.owner = new Int32Array(nx * nz).fill(-1);
  }

  static over(b: { minX: number; minZ: number; maxX: number; maxZ: number }, cell: number): Grid {
    const nx = Math.max(1, Math.ceil((b.maxX - b.minX) / cell));
    const nz = Math.max(1, Math.ceil((b.maxZ - b.minZ) / cell));
    return new Grid(b.minX, b.minZ, cell, nx, nz);
  }

  get maxX() {
    return this.x0 + this.nx * this.cell;
  }
  get maxZ() {
    return this.z0 + this.nz * this.cell;
  }

  ix(x: number) {
    return Math.floor((x - this.x0) / this.cell);
  }
  iz(z: number) {
    return Math.floor((z - this.z0) / this.cell);
  }
  cx(ix: number) {
    return this.x0 + (ix + 0.5) * this.cell;
  }
  cz(iz: number) {
    return this.z0 + (iz + 0.5) * this.cell;
  }
  inside(ix: number, iz: number) {
    return ix >= 0 && iz >= 0 && ix < this.nx && iz < this.nz;
  }
  /** Cell index at a point, or −1 outside the grid. */
  index(x: number, z: number): number {
    const ix = this.ix(x), iz = this.iz(z);
    return this.inside(ix, iz) ? iz * this.nx + ix : -1;
  }
  /** Class at a point (OUTSIDE beyond the grid). */
  at(x: number, z: number): number {
    const i = this.index(x, z);
    return i < 0 ? K.OUTSIDE : this.cls[i];
  }
  ownerAt(x: number, z: number): number {
    const i = this.index(x, z);
    return i < 0 ? -1 : this.owner[i];
  }

  /** Visit the cells whose centres lie inside `poly` (scanline, even–odd). */
  scanPolygon(poly: readonly Pt[], visit: (i: number) => void) {
    if (poly.length < 3) return;
    let minZ = Infinity, maxZ = -Infinity;
    for (const p of poly) {
      if (p[1] < minZ) minZ = p[1];
      if (p[1] > maxZ) maxZ = p[1];
    }
    const iz0 = Math.max(0, this.iz(minZ) - 1), iz1 = Math.min(this.nz - 1, this.iz(maxZ) + 1);
    const xs: number[] = [];
    for (let iz = iz0; iz <= iz1; iz++) {
      const z = this.cz(iz);
      xs.length = 0;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[j], b = poly[i];
        if ((a[1] <= z && b[1] > z) || (b[1] <= z && a[1] > z)) xs.push(a[0] + ((z - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
      if (xs.length < 2) continue;
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        // Cells whose centre x lies in [xs[k], xs[k+1]).
        const ia = Math.max(0, Math.ceil((xs[k] - this.x0) / this.cell - 0.5));
        const ib = Math.min(this.nx - 1, Math.ceil((xs[k + 1] - this.x0) / this.cell - 0.5) - 1);
        const row = iz * this.nx;
        for (let ix = ia; ix <= ib; ix++) visit(row + ix);
      }
    }
  }

  /** Visit cells whose centres lie within `r` of the segment a–b. */
  scanSegment(a: Pt, b: Pt, r: number, visit: (i: number, t: number) => void) {
    const ix0 = Math.max(0, this.ix(Math.min(a[0], b[0]) - r)), ix1 = Math.min(this.nx - 1, this.ix(Math.max(a[0], b[0]) + r));
    const iz0 = Math.max(0, this.iz(Math.min(a[1], b[1]) - r)), iz1 = Math.min(this.nz - 1, this.iz(Math.max(a[1], b[1]) + r));
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const l2 = dx * dx + dz * dz;
    const r2 = r * r;
    for (let iz = iz0; iz <= iz1; iz++) {
      const z = this.cz(iz);
      for (let ix = ix0; ix <= ix1; ix++) {
        const x = this.cx(ix);
        let t = l2 > 0 ? ((x - a[0]) * dx + (z - a[1]) * dz) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = a[0] + dx * t - x, ez = a[1] + dz * t - z;
        if (ex * ex + ez * ez <= r2) visit(iz * this.nx + ix, t);
      }
    }
  }

  /** Visit cells within `r` of a polyline. */
  scanPolyline(pts: readonly Pt[], r: number, visit: (i: number) => void) {
    for (let k = 0; k + 1 < pts.length; k++) this.scanSegment(pts[k], pts[k + 1], r, visit);
    if (pts.length === 1) this.scanSegment(pts[0], pts[0], r, visit);
  }

  /** Stamp `value` into cells inside `poly` where `pred(old)` holds (default: always). */
  fillPolygon(poly: readonly Pt[], value: number, pred?: (old: number) => boolean, owner = -1) {
    this.scanPolygon(poly, (i) => {
      if (pred && !pred(this.cls[i])) return;
      this.cls[i] = value;
      if (owner >= 0) this.owner[i] = owner;
    });
  }

  fillBand(pts: readonly Pt[], halfWidth: number, value: number, pred?: (old: number) => boolean, owner = -1) {
    this.scanPolyline(pts, halfWidth, (i) => {
      if (pred && !pred(this.cls[i])) return;
      this.cls[i] = value;
      if (owner >= 0) this.owner[i] = owner;
    });
  }

  /** Fraction of the cells inside `poly` whose class satisfies `pred`. */
  fraction(poly: readonly Pt[], pred: (c: number) => boolean): number {
    let n = 0, k = 0;
    this.scanPolygon(poly, (i) => {
      n++;
      if (pred(this.cls[i])) k++;
    });
    return n ? k / n : 0;
  }

  count(value: number): number {
    let n = 0;
    for (let i = 0; i < this.cls.length; i++) if (this.cls[i] === value) n++;
    return n;
  }
}

// ---------------------------------------------------------------- labelling

/**
 * 4-connected components of the cells for which `member(i)` holds. Returns the label grid
 * (−1 = not a member) and the cell lists per component.
 */
export function components(g: Grid, member: (i: number) => boolean, labels = new Int32Array(g.nx * g.nz)): { labels: Int32Array; comps: Int32Array[] } {
  labels.fill(-1);
  const comps: Int32Array[] = [];
  const stack = new Int32Array(g.nx * g.nz);
  const buf: number[] = [];
  const { nx, nz } = g;
  for (let s = 0; s < labels.length; s++) {
    if (labels[s] !== -1 || !member(s)) continue;
    const id = comps.length;
    let sp = 0;
    stack[sp++] = s;
    labels[s] = id;
    buf.length = 0;
    while (sp) {
      const i = stack[--sp];
      buf.push(i);
      const ix = i % nx, iz = (i - ix) / nx;
      if (ix > 0 && labels[i - 1] === -1 && member(i - 1)) { labels[i - 1] = id; stack[sp++] = i - 1; }
      if (ix < nx - 1 && labels[i + 1] === -1 && member(i + 1)) { labels[i + 1] = id; stack[sp++] = i + 1; }
      if (iz > 0 && labels[i - nx] === -1 && member(i - nx)) { labels[i - nx] = id; stack[sp++] = i - nx; }
      if (iz < nz - 1 && labels[i + nx] === -1 && member(i + nx)) { labels[i + nx] = id; stack[sp++] = i + nx; }
    }
    comps.push(Int32Array.from(buf));
  }
  return { labels, comps };
}

/** Split a cell set into 4-connected pieces (cells not in `alive` are ignored). */
export function splitCells(g: Grid, cells: Int32Array, alive: (i: number) => boolean, mark: Int32Array, stamp: number): Int32Array[] {
  // `mark` is a scratch grid (same size as g); cells of this set get `stamp`, visited ones stamp+1.
  for (const i of cells) if (alive(i)) mark[i] = stamp;
  const out: Int32Array[] = [];
  const stack: number[] = [];
  const nx = g.nx;
  for (const s of cells) {
    if (mark[s] !== stamp) continue;
    const buf: number[] = [];
    mark[s] = stamp + 1;
    stack.push(s);
    while (stack.length) {
      const i = stack.pop()!;
      buf.push(i);
      const ix = i % nx;
      if (ix > 0 && mark[i - 1] === stamp) { mark[i - 1] = stamp + 1; stack.push(i - 1); }
      if (ix < nx - 1 && mark[i + 1] === stamp) { mark[i + 1] = stamp + 1; stack.push(i + 1); }
      if (i - nx >= 0 && mark[i - nx] === stamp) { mark[i - nx] = stamp + 1; stack.push(i - nx); }
      if (i + nx < mark.length && mark[i + nx] === stamp) { mark[i + nx] = stamp + 1; stack.push(i + nx); }
    }
    out.push(Int32Array.from(buf));
  }
  return out;
}

// ---------------------------------------------------------------- tracing

/**
 * Boundary loops of a cell set (cells with `inSet(i)`), as polygons in world coordinates.
 * Outer boundaries have positive signed area, holes negative. Diagonal pinch points are split
 * (each loop keeps hugging its own cells), so every loop is simple.
 */
export function traceLoops(g: Grid, cells: Int32Array, inSet: (i: number) => boolean): Pt[][] {
  const { nx, nz } = g;
  const W = nx + 1;
  // Directed boundary edges keyed by start vertex (vi = iz * W + ix). Up to 2 per vertex.
  const next = new Map<number, number[]>();
  const add = (a: number, b: number) => {
    const l = next.get(a);
    if (l) l.push(b);
    else next.set(a, [b]);
  };
  const isIn = (ix: number, iz: number) => ix >= 0 && iz >= 0 && ix < nx && iz < nz && inSet(iz * nx + ix);
  for (const i of cells) {
    const ix = i % nx, iz = (i - ix) / nx;
    const v00 = iz * W + ix, v10 = v00 + 1, v01 = v00 + W, v11 = v01 + 1;
    if (!isIn(ix, iz - 1)) add(v00, v10);
    if (!isIn(ix + 1, iz)) add(v10, v11);
    if (!isIn(ix, iz + 1)) add(v11, v01);
    if (!isIn(ix - 1, iz)) add(v01, v00);
  }
  const loops: Pt[][] = [];
  const vx = (v: number) => g.x0 + (v % W) * g.cell;
  const vz = (v: number) => g.z0 + Math.floor(v / W) * g.cell;
  for (const [start, outs] of next) {
    while (outs.length) {
      const loopV: number[] = [start];
      let prev = start;
      let cur = outs.pop()!;
      let guard = 0;
      while (cur !== start && guard++ < 4_000_000) {
        loopV.push(cur);
        const cand = next.get(cur);
        if (!cand || !cand.length) break;
        let pick = 0;
        if (cand.length > 1) {
          // Pinch: prefer the left turn (stay with the cell we are walking around).
          const dx0 = vx(cur) - vx(prev), dz0 = vz(cur) - vz(prev);
          let best = -Infinity;
          for (let k = 0; k < cand.length; k++) {
            const dx1 = vx(cand[k]) - vx(cur), dz1 = vz(cand[k]) - vz(cur);
            const cross = dx0 * dz1 - dz0 * dx1; // > 0: left turn in (x, z) with positive orientation
            if (cross > best) { best = cross; pick = k; }
          }
        }
        prev = cur;
        cur = cand.splice(pick, 1)[0];
      }
      // Collapse collinear runs.
      const pts: Pt[] = [];
      const n = loopV.length;
      for (let k = 0; k < n; k++) {
        const a = loopV[(k + n - 1) % n], b = loopV[k], c = loopV[(k + 1) % n];
        const d1x = vx(b) - vx(a), d1z = vz(b) - vz(a), d2x = vx(c) - vx(b), d2z = vz(c) - vz(b);
        if (d1x * d2z - d1z * d2x !== 0) pts.push([vx(b), vz(b)]);
      }
      if (pts.length >= 3) loops.push(pts);
    }
  }
  return loops;
}

export function signedArea(poly: readonly Pt[]): number {
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** Douglas–Peucker on a closed ring (keeps at least 3 points). */
export function simplifyRing(ring: readonly Pt[], tol: number): Pt[] {
  const n = ring.length;
  if (n <= 4) return ring.slice() as Pt[];
  // Split at the two mutually farthest-ish points: vertex 0 and the vertex farthest from it.
  let far = 0, fd = -1;
  for (let i = 1; i < n; i++) {
    const d = (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2;
    if (d > fd) { fd = d; far = i; }
  }
  const a = dpOpen(ring.slice(0, far + 1), tol);
  const b = dpOpen([...ring.slice(far), ring[0]], tol);
  const out = [...a.slice(0, -1), ...b.slice(0, -1)];
  return out.length >= 3 ? out : (ring.slice() as Pt[]);
}

function dpOpen(pts: readonly Pt[], tol: number): Pt[] {
  if (pts.length <= 2) return pts.slice() as Pt[];
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop()!;
    const a = pts[i0], b = pts[i1];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    let best = -1, bi = -1;
    for (let i = i0 + 1; i < i1; i++) {
      const d = Math.abs((pts[i][0] - a[0]) * dz - (pts[i][1] - a[1]) * dx) / l;
      if (d > best) { best = d; bi = i; }
    }
    if (best > tol && bi > 0) {
      keep[bi] = 1;
      stack.push([i0, bi], [bi, i1]);
    }
  }
  return pts.filter((_, i) => keep[i]) as Pt[];
}

/** Remove near-duplicate and collinear vertices (in place semantics, returns a copy). */
export function cleanRing(ring: readonly Pt[], eps = 0.05): Pt[] {
  let out = ring.slice() as Pt[];
  for (let pass = 0; pass < 3; pass++) {
    const n = out.length;
    if (n < 4) break;
    const res: Pt[] = [];
    for (let i = 0; i < n; i++) {
      const a = out[(i + n - 1) % n], b = out[i], c = out[(i + 1) % n];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < eps) continue;
      const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      const l = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
      if (Math.abs(cr) / l < eps * 0.5) continue;
      res.push(b);
    }
    if (res.length === out.length || res.length < 3) {
      if (res.length >= 3) out = res;
      break;
    }
    out = res;
  }
  return out;
}

/** Morphological opening of a cell set inside the grid (erode then dilate by one cell, 4-neighbourhood). */
export function openCells(g: Grid, cells: Int32Array, inSet: Uint8Array): Int32Array {
  const nx = g.nx;
  const eroded: number[] = [];
  for (const i of cells) {
    const ix = i % nx;
    if (ix > 0 && ix < nx - 1 && inSet[i - 1] && inSet[i + 1] && inSet[i - nx] && inSet[i + nx]) eroded.push(i);
  }
  const er = new Set(eroded);
  const out: number[] = [];
  for (const i of cells) {
    const ix = i % nx;
    if (er.has(i) || (ix > 0 && er.has(i - 1)) || (ix < nx - 1 && er.has(i + 1)) || er.has(i - nx) || er.has(i + nx)) out.push(i);
  }
  return Int32Array.from(out);
}

export function pointInPoly(x: number, z: number, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function distToSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(ax + dx * t - px, az + dz * t - pz);
}

export function distToPoly(px: number, pz: number, poly: readonly Pt[]): number {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, distToSeg(px, pz, poly[j][0], poly[j][1], poly[i][0], poly[i][1]));
  return d;
}

/** Signed distance to a polygon (negative inside). */
export function signedDistPoly(px: number, pz: number, poly: readonly Pt[]): number {
  const d = distToPoly(px, pz, poly);
  return pointInPoly(px, pz, poly) ? -d : d;
}

export function polyBounds(poly: readonly Pt[]) {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const [x, z] of poly) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, minZ, maxX, maxZ };
}

export function polyCentroid(poly: readonly Pt[]): Pt {
  let cx = 0, cz = 0, a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const f = p[0] * q[1] - q[0] * p[1];
    cx += (p[0] + q[0]) * f;
    cz += (p[1] + q[1]) * f;
    a += f;
  }
  if (Math.abs(a) < 1e-9) return [poly[0][0], poly[0][1]];
  return [cx / (3 * a), cz / (3 * a)];
}

/** Offset a polygon outward by d (positive-area polygons; d < 0 insets). Mitred, fine for mild concavity. */
export function offsetPoly(poly: readonly Pt[], d: number): Pt[] {
  const p = signedArea(poly) < 0 ? poly.slice().reverse() : poly.slice();
  const n = p.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = p[(i + n - 1) % n], b = p[i], c = p[(i + 1) % n];
    const n1 = norm(b[1] - a[1], -(b[0] - a[0])), n2 = norm(c[1] - b[1], -(c[0] - b[0]));
    let mx = n1[0] + n2[0], mz = n1[1] + n2[1];
    const ml = Math.hypot(mx, mz) || 1;
    mx /= ml; mz /= ml;
    const cos = Math.max(0.35, mx * n1[0] + mz * n1[1]);
    out.push([b[0] + (mx * d) / cos, b[1] + (mz * d) / cos]);
  }
  return out;
}

function norm(x: number, z: number): Pt {
  const l = Math.hypot(x, z) || 1;
  return [x / l, z / l];
}
