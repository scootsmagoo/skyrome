/**
 * Vertex-cluster decimation for the far LOD (pure maths).
 *
 * Vertices fall into cells of a 3D grid, separately per dominant bone (so an arm hanging against the
 * torso stays an arm); each cell becomes one vertex at the mean position, with the summed bone
 * weights (top four, renormalised) and the mean normal. Triangles that collapse are dropped. The cell
 * size is bisected until the triangle count is just under the target.
 *
 * `cellScale` shrinks the cells of some bones: a head clustered like the trunk becomes a wedge, the
 * silhouette that reads first at a distance; with half-size cells it keeps a skull, a face and a chin.
 */
import type { BodyArrays } from './morph';

/** Cell scale of the head for the realistic bodies' LOD 3 (RealBody). */
export const REAL_HEAD_CELL = 0.45;

export interface Decimated extends BodyArrays {
  index: Uint16Array;
  skinIndex: Uint8Array;
  skinWeight: Float32Array;
}

export function clusterDecimate(src: BodyArrays, index: ArrayLike<number>, target: number, cellScale?: ArrayLike<number>): Decimated {
  let lo = 0.004;
  let hi = 1;
  let best: Decimated | null = null;
  for (let it = 0; it < 18; it++) {
    const cs = (lo + hi) / 2;
    const r = cluster(src, index, cs, cellScale);
    if (r.index.length / 3 > target) lo = cs;
    else {
      best = r;
      hi = cs;
    }
  }
  return best ?? cluster(src, index, hi, cellScale);
}

function cluster(src: BodyArrays, index: ArrayLike<number>, cs0: number, cellScale?: ArrayLike<number>): Decimated {
  const n = src.position.length / 3;
  const ids = new Int32Array(n);
  const map = new Map<string, number>();
  for (let v = 0; v < n; v++) {
    let bone = 0;
    let bw = -1;
    for (let k = 0; k < 4; k++) {
      const w = src.skinWeight[v * 4 + k];
      if (w > bw) {
        bw = w;
        bone = src.skinIndex[v * 4 + k];
      }
    }
    const cs = cs0 * (cellScale?.[bone] ?? 1);
    const key = `${Math.floor(src.position[v * 3] / cs)},${Math.floor(src.position[v * 3 + 1] / cs)},${Math.floor(src.position[v * 3 + 2] / cs)},${bone}`;
    let id = map.get(key);
    if (id === undefined) {
      id = map.size;
      map.set(key, id);
    }
    ids[v] = id;
  }
  const m = map.size;
  const BONES = 25;
  const pos = new Float32Array(m * 3);
  const nor = new Float32Array(m * 3);
  const cnt = new Float32Array(m);
  const wts = new Float32Array(m * BONES);
  for (let v = 0; v < n; v++) {
    const c = ids[v];
    cnt[c]++;
    for (let k = 0; k < 3; k++) {
      pos[c * 3 + k] += src.position[v * 3 + k];
      nor[c * 3 + k] += src.normal[v * 3 + k];
    }
    for (let k = 0; k < 4; k++) wts[c * BONES + src.skinIndex[v * 4 + k]] += src.skinWeight[v * 4 + k];
  }
  const si = new Uint8Array(m * 4);
  const sw = new Float32Array(m * 4);
  for (let c = 0; c < m; c++) {
    for (let k = 0; k < 3; k++) pos[c * 3 + k] /= cnt[c];
    const nl = Math.hypot(nor[c * 3], nor[c * 3 + 1], nor[c * 3 + 2]) || 1;
    for (let k = 0; k < 3; k++) nor[c * 3 + k] /= nl;
    const top: [number, number][] = [];
    for (let b = 0; b < BONES; b++) if (wts[c * BONES + b] > 0) top.push([b, wts[c * BONES + b]]);
    top.sort((a, b) => b[1] - a[1]);
    top.length = Math.min(4, top.length);
    let sum = 0;
    for (const t of top) sum += t[1];
    for (let k = 0; k < top.length; k++) {
      si[c * 4 + k] = top[k][0];
      sw[c * 4 + k] = top[k][1] / sum;
    }
  }
  const seen = new Set<string>();
  const out: number[] = [];
  for (let i = 0; i < index.length; i += 3) {
    const a = ids[index[i]], b = ids[index[i + 1]], c = ids[index[i + 2]];
    if (a === b || b === c || a === c) continue;
    // The same triangle from two sources (either winding) is kept once.
    const k = [a, b, c].sort((x, y) => x - y).join(',');
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(a, b, c);
  }
  return { position: pos, normal: nor, skinIndex: si, skinWeight: sw, index: Uint16Array.from(out) };
}
