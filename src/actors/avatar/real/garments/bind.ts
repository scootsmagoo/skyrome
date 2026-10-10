/**
 * Binding baked garments to a body surface, and fitting them to another body (pure maths, no three.js).
 *
 * A baked garment (tools/characters/garments.py) was simulated on the reference body of its sex. Every garment
 * vertex is bound once to that body's surface: the nearest point on it (a triangle and barycentric coordinates),
 * the distance out along the body's smooth normal there, and the small tangential rest. Fitting re-evaluates
 * the binding on a morphed body with the same triangles (any person's proportions): the anchor moves with the
 * skin, the offset turns with the skin's normal, so cloth that lay 2 cm off a belly lies 2 cm off a heavier one.
 * Cloth that hangs far from the body (hems, the toga's sinus, cloak tails) would inherit the jitter of
 * neighbouring anchors on different limbs, so its displacement is smoothed over the garment mesh, the more the
 * farther it hangs.
 *
 * Also here: skin weights transferred from the body (`transferWeights`) and the mask of body vertices the cloth
 * covers (`coverMask`), both computed once per garment on the reference body.
 */

export interface SurfaceMesh {
  position: Float32Array;
  normal: Float32Array;
  index: ArrayLike<number>;
}

// ------------------------------------------------------------------------------------------------ triangle grid

/** Uniform grid over a triangle mesh's bounding boxes: nearest points and ray casts. */
export class TriGrid {
  readonly cell: number;
  private readonly min = [0, 0, 0];
  private readonly dim = [1, 1, 1];
  private readonly start: Int32Array;
  private readonly items: Int32Array;
  private readonly stamp: Int32Array;
  private tick = 0;

  constructor(
    readonly pos: Float32Array,
    readonly index: ArrayLike<number>,
    cell = 0.04,
  ) {
    this.cell = cell;
    const nt = index.length / 3;
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3)
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k], pos[i + k]);
        hi[k] = Math.max(hi[k], pos[i + k]);
      }
    for (let k = 0; k < 3; k++) {
      this.min[k] = lo[k] - cell * 0.5;
      this.dim[k] = Math.max(1, Math.ceil((hi[k] - lo[k] + cell) / cell));
    }
    const ncell = this.dim[0] * this.dim[1] * this.dim[2];
    const count = new Int32Array(ncell + 1);
    const box = new Int32Array(nt * 6);
    for (let t = 0; t < nt; t++) {
      for (let k = 0; k < 3; k++) {
        let a = Infinity;
        let b = -Infinity;
        for (let c = 0; c < 3; c++) {
          const v = pos[index[t * 3 + c] * 3 + k];
          a = Math.min(a, v);
          b = Math.max(b, v);
        }
        box[t * 6 + k] = this.clampCell(k, a);
        box[t * 6 + 3 + k] = this.clampCell(k, b);
      }
      this.eachCell(box, t, (c) => count[c + 1]++);
    }
    for (let c = 0; c < ncell; c++) count[c + 1] += count[c];
    this.start = count;
    this.items = new Int32Array(count[ncell]);
    const fill = count.slice(0, ncell);
    for (let t = 0; t < nt; t++) this.eachCell(box, t, (c) => (this.items[fill[c]++] = t));
    this.stamp = new Int32Array(nt);
  }

  private clampCell(k: number, v: number) {
    return Math.min(this.dim[k] - 1, Math.max(0, Math.floor((v - this.min[k]) / this.cell)));
  }

  private eachCell(box: Int32Array, t: number, fn: (c: number) => void) {
    const [dx, dy] = this.dim;
    for (let z = box[t * 6 + 2]; z <= box[t * 6 + 5]; z++)
      for (let y = box[t * 6 + 1]; y <= box[t * 6 + 4]; y++)
        for (let x = box[t * 6]; x <= box[t * 6 + 3]; x++) fn(x + dx * (y + dy * z));
  }

  /**
   * Nearest point of the mesh to p within `maxR` (filter: optional triangle predicate). Writes triangle, the
   * barycentric weights of its 2nd and 3rd corners and the squared distance into `out`; false if none.
   */
  nearest(px: number, py: number, pz: number, maxR: number, out: NearestHit, filter?: (t: number) => boolean): boolean {
    const c = this.cell;
    const cx = Math.floor((px - this.min[0]) / c);
    const cy = Math.floor((py - this.min[1]) / c);
    const cz = Math.floor((pz - this.min[2]) / c);
    const [dx, dy, dz] = this.dim;
    out.tri = -1;
    out.d2 = maxR * maxR;
    this.tick++;
    const rings = Math.ceil(maxR / c);
    for (let r = 0; r <= rings; r++) {
      // Every cell of shell r can only hold points at least (r - 1) cells away.
      if (r > 1 && ((r - 1) * c) ** 2 > out.d2) break;
      for (let z = cz - r; z <= cz + r; z++) {
        if (z < 0 || z >= dz) continue;
        for (let y = cy - r; y <= cy + r; y++) {
          if (y < 0 || y >= dy) continue;
          const shellYZ = Math.abs(z - cz) === r || Math.abs(y - cy) === r;
          for (let x = cx - r; x <= cx + r; x += shellYZ ? 1 : 2 * r || 1) {
            if (x < 0 || x >= dx) continue;
            const cell = x + dx * (y + dy * z);
            for (let k = this.start[cell]; k < this.start[cell + 1]; k++) {
              const t = this.items[k];
              if (this.stamp[t] === this.tick) continue;
              this.stamp[t] = this.tick;
              if (filter && !filter(t)) continue;
              closestOnTri(this.pos, this.index, t, px, py, pz, tmpHit);
              if (tmpHit.d2 < out.d2) {
                out.d2 = tmpHit.d2;
                out.tri = t;
                out.u = tmpHit.u;
                out.v = tmpHit.v;
              }
            }
            if (r === 0) break;
          }
        }
      }
    }
    return out.tri >= 0;
  }

  /** Distance along the (unit) ray to the first triangle within maxT, or -1. */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): number {
    // March the cells along the ray in half-cell steps (the triangles are small next to the distances asked).
    const c = this.cell;
    const steps = Math.ceil(maxT / (c * 0.5));
    let best = -1;
    this.tick++;
    const [nx, ny, nz] = this.dim;
    for (let s = 0; s <= steps; s++) {
      const t = Math.min(maxT, s * c * 0.5);
      if (best >= 0 && t > best + c) break;
      const x = Math.floor((ox + dx * t - this.min[0]) / c);
      const y = Math.floor((oy + dy * t - this.min[1]) / c);
      const z = Math.floor((oz + dz * t - this.min[2]) / c);
      if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) continue;
      const cell = x + nx * (y + ny * z);
      for (let k = this.start[cell]; k < this.start[cell + 1]; k++) {
        const tri = this.items[k];
        if (this.stamp[tri] === this.tick) continue;
        this.stamp[tri] = this.tick;
        const h = rayTri(this.pos, this.index, tri, ox, oy, oz, dx, dy, dz);
        if (h >= 0 && h <= maxT && (best < 0 || h < best)) best = h;
      }
    }
    return best;
  }
}

export interface NearestHit {
  tri: number;
  u: number;
  v: number;
  d2: number;
}

const tmpHit: NearestHit = { tri: 0, u: 0, v: 0, d2: 0 };

/** Closest point on triangle t to p (Ericson, Real-Time Collision Detection 5.1.5): barycentrics u (B), v (C). */
export function closestOnTri(pos: Float32Array, index: ArrayLike<number>, t: number, px: number, py: number, pz: number, out: NearestHit) {
  const a = index[t * 3] * 3;
  const b = index[t * 3 + 1] * 3;
  const cc = index[t * 3 + 2] * 3;
  const abx = pos[b] - pos[a], aby = pos[b + 1] - pos[a + 1], abz = pos[b + 2] - pos[a + 2];
  const acx = pos[cc] - pos[a], acy = pos[cc + 1] - pos[a + 1], acz = pos[cc + 2] - pos[a + 2];
  const apx = px - pos[a], apy = py - pos[a + 1], apz = pz - pos[a + 2];
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  let u = 0;
  let v = 0;
  if (d1 <= 0 && d2 <= 0) {
    u = 0;
    v = 0;
  } else {
    const bpx = px - pos[b], bpy = py - pos[b + 1], bpz = pz - pos[b + 2];
    const d3 = abx * bpx + aby * bpy + abz * bpz;
    const d4 = acx * bpx + acy * bpy + acz * bpz;
    const cpx = px - pos[cc], cpy = py - pos[cc + 1], cpz = pz - pos[cc + 2];
    const d5 = abx * cpx + aby * cpy + abz * cpz;
    const d6 = acx * cpx + acy * cpy + acz * cpz;
    const vc = d1 * d4 - d3 * d2;
    const vb = d5 * d2 - d1 * d6;
    const va = d3 * d6 - d5 * d4;
    if (d3 >= 0 && d4 <= d3) {
      u = 1;
      v = 0;
    } else if (vc <= 0 && d1 >= 0 && d3 <= 0) {
      u = d1 / (d1 - d3);
      v = 0;
    } else if (d6 >= 0 && d5 <= d6) {
      u = 0;
      v = 1;
    } else if (vb <= 0 && d2 >= 0 && d6 <= 0) {
      u = 0;
      v = d2 / (d2 - d6);
    } else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
      v = (d4 - d3) / (d4 - d3 + (d5 - d6));
      u = 1 - v;
    } else {
      const den = 1 / (va + vb + vc);
      u = vb * den;
      v = vc * den;
    }
  }
  const qx = pos[a] + abx * u + acx * v;
  const qy = pos[a + 1] + aby * u + acy * v;
  const qz = pos[a + 2] + abz * u + acz * v;
  out.u = u;
  out.v = v;
  out.d2 = (px - qx) ** 2 + (py - qy) ** 2 + (pz - qz) ** 2;
}

/** Ray-triangle (Moller-Trumbore, both faces): distance or -1. */
function rayTri(pos: Float32Array, index: ArrayLike<number>, t: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): number {
  const a = index[t * 3] * 3;
  const b = index[t * 3 + 1] * 3;
  const c = index[t * 3 + 2] * 3;
  const e1x = pos[b] - pos[a], e1y = pos[b + 1] - pos[a + 1], e1z = pos[b + 2] - pos[a + 2];
  const e2x = pos[c] - pos[a], e2y = pos[c + 1] - pos[a + 1], e2z = pos[c + 2] - pos[a + 2];
  const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) return -1;
  const inv = 1 / det;
  const tx = ox - pos[a], ty = oy - pos[a + 1], tz = oz - pos[a + 2];
  const u = (tx * px + ty * py + tz * pz) * inv;
  // A little slack: a ray through an edge or a corner must not slip between two triangles.
  if (u < -1e-5 || u > 1 + 1e-5) return -1;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < -1e-5 || u + v > 1 + 1e-5) return -1;
  const h = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return h >= 0 ? h : -1;
}

// ------------------------------------------------------------------------------------------------ binding

export interface Binding {
  /** Garment vertex count. */
  n: number;
  tri: Int32Array;
  /** Barycentric weights of the anchor triangle's 2nd and 3rd corners. */
  bu: Float32Array;
  bv: Float32Array;
  /** The body's interpolated (smooth) normal at the anchor, at bind time. */
  n0: Float32Array;
  /** Distance out along that normal. */
  off: Float32Array;
  /** The rest of the offset (tangential, small). */
  tan: Float32Array;
  /** The garment's rest position and normal. */
  rest: Float32Array;
  nrm: Float32Array;
  /** How much the displacement is smoothed (0 close to the body .. 1 far from it). */
  soft: Float32Array;
  /** Vertices sharing a position (split at UV seams) map to one representative; adjacency between representatives. */
  weld: Int32Array;
  adjStart: Int32Array;
  adjList: Int32Array;
}

/** Interpolated smooth normal of the body at (tri, u, v) into out[o..o+2] (normalised). */
function lerpNormal(nrm: Float32Array, index: ArrayLike<number>, t: number, u: number, v: number, out: Float32Array, o: number) {
  const a = index[t * 3] * 3;
  const b = index[t * 3 + 1] * 3;
  const c = index[t * 3 + 2] * 3;
  const w = 1 - u - v;
  let x = nrm[a] * w + nrm[b] * u + nrm[c] * v;
  let y = nrm[a + 1] * w + nrm[b + 1] * u + nrm[c + 1] * v;
  let z = nrm[a + 2] * w + nrm[b + 2] * u + nrm[c + 2] * v;
  const l = Math.hypot(x, y, z) || 1;
  x /= l;
  y /= l;
  z /= l;
  out[o] = x;
  out[o + 1] = y;
  out[o + 2] = z;
}

/** Vertices at the same position (exporters split them at UV seams): representative per vertex. */
export function weldMap(pos: Float32Array, eps = 1e-5): Int32Array {
  const n = pos.length / 3;
  const rep = new Int32Array(n);
  const map = new Map<string, number>();
  const q = 1 / eps;
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(pos[i * 3] * q)},${Math.round(pos[i * 3 + 1] * q)},${Math.round(pos[i * 3 + 2] * q)}`;
    const r = map.get(key);
    if (r === undefined) {
      map.set(key, i);
      rep[i] = i;
    } else rep[i] = r;
  }
  return rep;
}

/** Adjacency (CSR) between welded representatives. */
export function adjacency(index: ArrayLike<number>, weld: Int32Array): { start: Int32Array; list: Int32Array } {
  const n = weld.length;
  const sets: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  for (let t = 0; t < index.length; t += 3)
    for (let k = 0; k < 3; k++) {
      const a = weld[index[t + k]];
      const b = weld[index[t + ((k + 1) % 3)]];
      if (a === b) continue;
      sets[a].add(b);
      sets[b].add(a);
    }
  const start = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) start[i + 1] = start[i] + sets[i].size;
  const list = new Int32Array(start[n]);
  for (let i = 0; i < n; i++) {
    let k = start[i];
    for (const j of sets[i]) list[k++] = j;
  }
  return { start, list };
}

export interface BindOptions {
  /** Search radius for the nearest body point (m). */
  maxR?: number;
  /** Distance range over which the displacement smoothing fades in (m). */
  softFrom?: number;
  softTo?: number;
  /** Body triangles the garment may bind to (e.g. not the hands). */
  filter?: (tri: number) => boolean;
}

/** Bind a garment (reference pose) to the reference body it was simulated on. */
export function bindGarment(garment: SurfaceMesh, body: SurfaceMesh, grid: TriGrid, opt: BindOptions = {}): Binding {
  const n = garment.position.length / 3;
  const maxR = opt.maxR ?? 0.6;
  const s0 = opt.softFrom ?? 0.03;
  const s1 = opt.softTo ?? 0.16;
  const tri = new Int32Array(n);
  const bu = new Float32Array(n);
  const bv = new Float32Array(n);
  const n0 = new Float32Array(n * 3);
  const off = new Float32Array(n);
  const tan = new Float32Array(n * 3);
  const soft = new Float32Array(n);
  const hit: NearestHit = { tri: 0, u: 0, v: 0, d2: 0 };
  const bp = body.position;
  const bi = body.index;
  for (let i = 0; i < n; i++) {
    const px = garment.position[i * 3];
    const py = garment.position[i * 3 + 1];
    const pz = garment.position[i * 3 + 2];
    if (!grid.nearest(px, py, pz, maxR, hit, opt.filter)) grid.nearest(px, py, pz, 4, hit, opt.filter);
    const t = Math.max(0, hit.tri);
    tri[i] = t;
    bu[i] = hit.u;
    bv[i] = hit.v;
    lerpNormal(body.normal, bi, t, hit.u, hit.v, n0, i * 3);
    const a = bi[t * 3] * 3;
    const b = bi[t * 3 + 1] * 3;
    const c = bi[t * 3 + 2] * 3;
    const w = 1 - hit.u - hit.v;
    const dx = px - (bp[a] * w + bp[b] * hit.u + bp[c] * hit.v);
    const dy = py - (bp[a + 1] * w + bp[b + 1] * hit.u + bp[c + 1] * hit.v);
    const dz = pz - (bp[a + 2] * w + bp[b + 2] * hit.u + bp[c + 2] * hit.v);
    const o = dx * n0[i * 3] + dy * n0[i * 3 + 1] + dz * n0[i * 3 + 2];
    off[i] = o;
    tan[i * 3] = dx - o * n0[i * 3];
    tan[i * 3 + 1] = dy - o * n0[i * 3 + 1];
    tan[i * 3 + 2] = dz - o * n0[i * 3 + 2];
    const d = Math.hypot(dx, dy, dz);
    soft[i] = smoothstep(s0, s1, d);
  }
  const weld = weldMap(garment.position);
  const adj = adjacency(garment.index, weld);
  return {
    n,
    tri,
    bu,
    bv,
    n0,
    off,
    tan,
    rest: garment.position,
    nrm: garment.normal,
    soft,
    weld,
    adjStart: adj.start,
    adjList: adj.list,
  };
}

function smoothstep(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * Rotate (x, y, z) by the shortest rotation taking unit a to unit b (Rodrigues), into out[o..].
 */
function rotateBetween(ax: number, ay: number, az: number, bx: number, by: number, bz: number, x: number, y: number, z: number, out: Float32Array, o: number) {
  const cx = ay * bz - az * by;
  const cy = az * bx - ax * bz;
  const cz = ax * by - ay * bx;
  const c = ax * bx + ay * by + az * bz;
  if (c < -0.9999) {
    out[o] = -x;
    out[o + 1] = -y;
    out[o + 2] = -z;
    return;
  }
  // v' = v + k x v + k x (k x v) / (1 + c), with k = a x b.
  const kx = cy * z - cz * y;
  const ky = cz * x - cx * z;
  const kz = cx * y - cy * x;
  const f = 1 / (1 + c);
  out[o] = x + kx + (cy * kz - cz * ky) * f;
  out[o + 1] = y + ky + (cz * kx - cx * kz) * f;
  out[o + 2] = z + kz + (cx * ky - cy * kx) * f;
}

/** Smoothing passes for the displacement of cloth far from the body. */
const SOFT_PASSES = 8;

/**
 * Evaluate a binding on a body with the same triangles (morphed): fitted positions and normals.
 * `scratch` (3n floats) avoids an allocation per fit.
 */
export function fitGarment(
  b: Binding,
  body: { position: Float32Array; normal: Float32Array },
  index: ArrayLike<number>,
  out: { position: Float32Array; normal: Float32Array },
  scratch = new Float32Array(b.n * 3),
) {
  const bp = body.position;
  const nn = new Float32Array(3);
  const disp = scratch;
  for (let i = 0; i < b.n; i++) {
    const t = b.tri[i];
    const u = b.bu[i];
    const v = b.bv[i];
    const w = 1 - u - v;
    const a = index[t * 3] * 3;
    const bb = index[t * 3 + 1] * 3;
    const c = index[t * 3 + 2] * 3;
    lerpNormal(body.normal, index, t, u, v, nn, 0);
    const n0x = b.n0[i * 3], n0y = b.n0[i * 3 + 1], n0z = b.n0[i * 3 + 2];
    rotateBetween(n0x, n0y, n0z, nn[0], nn[1], nn[2], b.tan[i * 3], b.tan[i * 3 + 1], b.tan[i * 3 + 2], out.position, i * 3);
    const o = b.off[i];
    const x = bp[a] * w + bp[bb] * u + bp[c] * v + nn[0] * o + out.position[i * 3];
    const y = bp[a + 1] * w + bp[bb + 1] * u + bp[c + 1] * v + nn[1] * o + out.position[i * 3 + 1];
    const z = bp[a + 2] * w + bp[bb + 2] * u + bp[c + 2] * v + nn[2] * o + out.position[i * 3 + 2];
    disp[i * 3] = x - b.rest[i * 3];
    disp[i * 3 + 1] = y - b.rest[i * 3 + 1];
    disp[i * 3 + 2] = z - b.rest[i * 3 + 2];
    rotateBetween(n0x, n0y, n0z, nn[0], nn[1], nn[2], b.nrm[i * 3], b.nrm[i * 3 + 1], b.nrm[i * 3 + 2], out.normal, i * 3);
  }
  // Far cloth: relax its displacement toward its neighbours' (on welded representatives).
  const { weld, adjStart, adjList, soft } = b;
  for (let pass = 0; pass < SOFT_PASSES; pass++) {
    for (let i = 0; i < b.n; i++) {
      if (weld[i] !== i || soft[i] <= 0) continue;
      const s = adjStart[i];
      const e = adjStart[i + 1];
      if (e === s) continue;
      let sx = 0, sy = 0, sz = 0;
      for (let k = s; k < e; k++) {
        const j = adjList[k];
        sx += disp[j * 3];
        sy += disp[j * 3 + 1];
        sz += disp[j * 3 + 2];
      }
      const f = soft[i] * 0.85;
      const inv = 1 / (e - s);
      disp[i * 3] += (sx * inv - disp[i * 3]) * f;
      disp[i * 3 + 1] += (sy * inv - disp[i * 3 + 1]) * f;
      disp[i * 3 + 2] += (sz * inv - disp[i * 3 + 2]) * f;
    }
  }
  for (let i = 0; i < b.n; i++) {
    const r = weld[i];
    out.position[i * 3] = b.rest[i * 3] + disp[r * 3];
    out.position[i * 3 + 1] = b.rest[i * 3 + 1] + disp[r * 3 + 1];
    out.position[i * 3 + 2] = b.rest[i * 3 + 2] + disp[r * 3 + 2];
    const l = Math.hypot(out.normal[i * 3], out.normal[i * 3 + 1], out.normal[i * 3 + 2]) || 1;
    out.normal[i * 3] /= l;
    out.normal[i * 3 + 1] /= l;
    out.normal[i * 3 + 2] /= l;
  }
}

// ------------------------------------------------------------------------------------------------ weights

export interface WeightPolicy {
  /** Bones the garment may follow (others hand their weight up the parent chain to the first allowed one). */
  allowed: (bone: number) => boolean;
  parent: readonly number[];
  /** Smoothing passes over the garment (more for loose cloth). */
  passes: number;
  /**
   * Final say per vertex (e.g. the skirt rule below the hips): given the rest position and the transferred
   * weights (25 floats), may rewrite them in place.
   */
  adjust?: (i: number, x: number, y: number, z: number, w: Float32Array) => void;
}

/**
 * Skin weights for a bound garment: the body's weights at each anchor (barycentric blend of the triangle's
 * corners), remapped to the allowed bones, smoothed over the garment mesh, adjusted, top four normalised.
 */
export function transferWeights(
  b: Binding,
  body: { skinIndex: ArrayLike<number>; skinWeight: ArrayLike<number> },
  index: ArrayLike<number>,
  boneCount: number,
  policy: WeightPolicy,
): { skinIndex: Uint8Array; skinWeight: Float32Array } {
  const n = b.n;
  const W = new Float32Array(n * boneCount);
  const remap = new Int32Array(boneCount);
  for (let bone = 0; bone < boneCount; bone++) {
    let r = bone;
    while (r >= 0 && !policy.allowed(r)) r = policy.parent[r];
    remap[bone] = r < 0 ? 0 : r;
  }
  for (let i = 0; i < n; i++) {
    const t = b.tri[i];
    const bar = [1 - b.bu[i] - b.bv[i], b.bu[i], b.bv[i]];
    for (let c = 0; c < 3; c++) {
      const v = index[t * 3 + c];
      for (let k = 0; k < 4; k++) {
        const wt = body.skinWeight[v * 4 + k] * bar[c];
        if (wt > 0) W[i * boneCount + remap[body.skinIndex[v * 4 + k]]] += wt;
      }
    }
  }
  // Smooth (on welded representatives).
  const tmp = new Float32Array(boneCount);
  for (let pass = 0; pass < policy.passes; pass++) {
    for (let i = 0; i < n; i++) {
      if (b.weld[i] !== i) continue;
      const s = b.adjStart[i];
      const e = b.adjStart[i + 1];
      if (e === s) continue;
      tmp.fill(0);
      for (let k = s; k < e; k++) {
        const j = b.adjList[k];
        for (let bone = 0; bone < boneCount; bone++) tmp[bone] += W[j * boneCount + bone];
      }
      const inv = 1 / (e - s);
      for (let bone = 0; bone < boneCount; bone++) W[i * boneCount + bone] = W[i * boneCount + bone] * 0.5 + tmp[bone] * inv * 0.5;
    }
  }
  const skinIndex = new Uint8Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  const row = new Float32Array(boneCount);
  for (let i = 0; i < n; i++) {
    const r = b.weld[i];
    for (let bone = 0; bone < boneCount; bone++) row[bone] = W[r * boneCount + bone];
    policy.adjust?.(i, b.rest[i * 3], b.rest[i * 3 + 1], b.rest[i * 3 + 2], row);
    topFour(row, skinIndex, skinWeight, i);
  }
  return { skinIndex, skinWeight };
}

/** The four largest weights of `row`, normalised, into slot i. */
export function topFour(row: Float32Array, skinIndex: Uint8Array, skinWeight: Float32Array, i: number) {
  let total = 0;
  for (let k = 0; k < 4; k++) {
    let best = -1;
    let bw = 0;
    for (let bone = 0; bone < row.length; bone++) {
      if (row[bone] <= bw) continue;
      let used = false;
      for (let q = 0; q < k; q++) if (skinIndex[i * 4 + q] === bone && skinWeight[i * 4 + q] > 0) used = true;
      if (used) continue;
      best = bone;
      bw = row[bone];
    }
    skinIndex[i * 4 + k] = best < 0 ? 0 : best;
    skinWeight[i * 4 + k] = best < 0 ? 0 : bw;
    total += best < 0 ? 0 : bw;
  }
  if (total <= 0) {
    skinWeight[i * 4] = 1;
    return;
  }
  for (let k = 0; k < 4; k++) skinWeight[i * 4 + k] /= total;
}

// ------------------------------------------------------------------------------------------------ cover mask

export interface CoverOptions {
  /** Farthest the cloth may be from the skin it covers (m). */
  maxDist: number;
  /** Whether body vertex v may be hidden at all (its bones are ones the garment follows closely). */
  eligible: (v: number) => boolean;
  /** Tilt of the extra probe rays from the normal (radians); all must hit for the vertex to count as covered. */
  tilt?: number;
}

/**
 * Body vertices well under the cloth: a ray out along the normal, and four tilted ones around it, all hit the
 * garment within maxDist. Vertices near a hem or neckline fail one of the tilted probes and stay visible.
 */
export function coverMask(body: SurfaceMesh, garmentGrid: TriGrid, opt: CoverOptions): Uint8Array {
  const n = body.position.length / 3;
  const out = new Uint8Array(n);
  const tilt = opt.tilt ?? 0.45;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  for (let v = 0; v < n; v++) {
    if (!opt.eligible(v)) continue;
    const px = body.position[v * 3];
    const py = body.position[v * 3 + 1];
    const pz = body.position[v * 3 + 2];
    const nx = body.normal[v * 3];
    const ny = body.normal[v * 3 + 1];
    const nz = body.normal[v * 3 + 2];
    // A tangent frame around the normal.
    let tx = -nz, ty = 0, tz = nx;
    if (Math.abs(ny) > 0.9) {
      tx = 1;
      ty = 0;
      tz = 0;
    }
    let l = Math.hypot(tx, ty, tz) || 1;
    tx /= l;
    ty /= l;
    tz /= l;
    const bx = ny * tz - nz * ty;
    const by = nz * tx - nx * tz;
    const bz = nx * ty - ny * tx;
    let ok = garmentGrid.raycast(px, py, pz, nx, ny, nz, opt.maxDist) >= 0;
    for (let k = 0; ok && k < 4; k++) {
      const a = (k * Math.PI) / 2;
      const ca = Math.cos(a) * st;
      const sa = Math.sin(a) * st;
      let dx = nx * ct + tx * ca + bx * sa;
      let dy = ny * ct + ty * ca + by * sa;
      let dz = nz * ct + tz * ca + bz * sa;
      l = Math.hypot(dx, dy, dz);
      dx /= l;
      dy /= l;
      dz /= l;
      ok = garmentGrid.raycast(px, py, pz, dx, dy, dz, opt.maxDist / ct) >= 0;
    }
    if (ok) out[v] = 1;
  }
  return out;
}
