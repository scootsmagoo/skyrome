/**
 * Mesh simplification by vertex clustering (Rossignac-Borrel) on an anisotropic grid, for distance
 * LODs of static scenery. Vertices that fall in one grid cell merge into one at the mean of their
 * positions, normals and UVs; triangles that collapse (two corners in one cell) or duplicate
 * another are dropped. It needs no adjacency, never opens cracks inside one mesh, and keeps flat
 * faces flat (a cluster of coplanar points averages to a point on the plane).
 *
 * Input: position + optional normal + optional uv (indexed or not). Output: indexed, same
 * attributes (normal as floats; the caller may pack it), or null when the result is not worth
 * having (more than `maxRatio` of the input's triangles).
 */
import * as THREE from 'three';

export interface SimplifyOptions {
  /** Return null unless the result has at most this fraction of the input's triangles. Default 0.6. */
  maxRatio?: number;
  /**
   * Put each cluster on its grid point instead of at the mean of its vertices. Pieces simplified
   * apart (chunks, other materials) then still meet along their shared edges; the shape moves by
   * up to half a cell. Default false.
   */
  snap?: boolean;
}

/** Grid offset for the numeric cell key: 13 bits an axis (±4096 cells). */
const OFF = 4096;
const SPAN = 8192;

export function simplifyByGrid(src: THREE.BufferGeometry, cell: readonly [number, number, number], opts: SimplifyOptions = {}): THREE.BufferGeometry | null {
  const pos = src.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!pos || !(pos.array as ArrayLike<number> | null)) return null;
  const nor = src.getAttribute('normal') as THREE.BufferAttribute | undefined;
  const uv = src.getAttribute('uv') as THREE.BufferAttribute | undefined;
  const hasN = !!nor && !!(nor.array as ArrayLike<number> | null);
  const hasUV = !!uv && !!(uv.array as ArrayLike<number> | null);
  const index = src.index?.array as ArrayLike<number> | null | undefined;
  const triCount = (index ? index.length : pos.count) / 3;
  if (triCount < 8) return null;

  const [cx, cy, cz] = cell;
  const keyOf = new Map<number, number>();
  const remap = new Uint32Array(pos.count);
  // Per-cluster sums: x y z, nx ny nz, u v, count.
  let sums = new Float64Array(1024 * 9);
  let n = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const key = ((Math.round(x / cx) + OFF) * SPAN + (Math.round(y / cy) + OFF)) * SPAN + (Math.round(z / cz) + OFF);
    let k = keyOf.get(key);
    if (k === undefined) {
      k = n++;
      keyOf.set(key, k);
      if (n * 9 > sums.length) {
        const bigger = new Float64Array(sums.length * 2);
        bigger.set(sums);
        sums = bigger;
      }
    }
    remap[i] = k;
    const o = k * 9;
    sums[o] += x;
    sums[o + 1] += y;
    sums[o + 2] += z;
    if (hasN) {
      sums[o + 3] += nor!.getX(i);
      sums[o + 4] += nor!.getY(i);
      sums[o + 5] += nor!.getZ(i);
    }
    if (hasUV) {
      sums[o + 6] += uv!.getX(i);
      sums[o + 7] += uv!.getY(i);
    }
    sums[o + 8]++;
  }

  const idx: number[] = [];
  const seen = new Set<number>();
  const at = (t: number) => (index ? index[t] : t);
  for (let t = 0; t < triCount; t++) {
    const a = remap[at(t * 3)];
    const b = remap[at(t * 3 + 1)];
    const c = remap[at(t * 3 + 2)];
    if (a === b || b === c || a === c) continue;
    // The same triangle twice (two faces collapsed onto each other): keep the first.
    const lo = Math.min(a, b, c);
    const hi = Math.max(a, b, c);
    const mid = a + b + c - lo - hi;
    const s = (lo * n + mid) * n + hi;
    if (seen.has(s)) continue;
    seen.add(s);
    idx.push(a, b, c);
  }
  if (idx.length / 3 > triCount * (opts.maxRatio ?? 0.6) || idx.length === 0) return null;

  // Keep only the clusters a surviving triangle uses.
  const compact = new Int32Array(n).fill(-1);
  let m = 0;
  for (let i = 0; i < idx.length; i++) if (compact[idx[i]] < 0) compact[idx[i]] = m++;
  const P = new Float32Array(m * 3);
  const N = hasN ? new Float32Array(m * 3) : null;
  const U = hasUV ? new Float32Array(m * 2) : null;
  for (let k = 0; k < n; k++) {
    const j = compact[k];
    if (j < 0) continue;
    const o = k * 9;
    const w = 1 / sums[o + 8];
    if (opts.snap) {
      // The cell's grid point (every vertex of the cluster rounds to it).
      P[j * 3] = Math.round((sums[o] * w) / cx) * cx;
      P[j * 3 + 1] = Math.round((sums[o + 1] * w) / cy) * cy;
      P[j * 3 + 2] = Math.round((sums[o + 2] * w) / cz) * cz;
    } else {
      P[j * 3] = sums[o] * w;
      P[j * 3 + 1] = sums[o + 1] * w;
      P[j * 3 + 2] = sums[o + 2] * w;
    }
    if (N) {
      const l = Math.hypot(sums[o + 3], sums[o + 4], sums[o + 5]) || 1;
      N[j * 3] = sums[o + 3] / l;
      N[j * 3 + 1] = sums[o + 4] / l;
      N[j * 3 + 2] = sums[o + 5] / l;
    }
    if (U) {
      U[j * 2] = sums[o + 6] * w;
      U[j * 2 + 1] = sums[o + 7] * w;
    }
  }
  const I = m > 65535 ? new Uint32Array(idx.length) : new Uint16Array(idx.length);
  for (let i = 0; i < idx.length; i++) I[i] = compact[idx[i]];
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  if (N) out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  if (U) out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  out.setIndex(new THREE.BufferAttribute(I, 1));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

/**
 * Grid cell for an object of the given bounding box: `perAxis` cells across each axis, but never
 * finer than `min` metres (so a thin column keeps a round-ish section and a tall one few rings).
 */
export function cellForBox(box: THREE.Box3, perAxis: readonly [number, number, number], min: readonly [number, number, number]): [number, number, number] {
  const s = box.getSize(new THREE.Vector3());
  return [Math.max(s.x / perAxis[0], min[0]), Math.max(s.y / perAxis[1], min[1]), Math.max(s.z / perAxis[2], min[2])];
}
