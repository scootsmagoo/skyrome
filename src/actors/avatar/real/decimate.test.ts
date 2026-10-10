import { describe, expect, it } from 'vitest';
import { clusterDecimate, REAL_HEAD_CELL } from './decimate';
import { B } from '../rig';
import { loadBody, loadIndex } from './head/testBody';

/** A UV sphere of the given resolution, all weighted to bone 3 (or bone 4 on the upper half). */
function sphere(nu: number, nv: number) {
  const pos: number[] = [];
  const nor: number[] = [];
  const si: number[] = [];
  const sw: number[] = [];
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i < nu; i++) {
      const th = (i / nu) * Math.PI * 2;
      const ph = (j / nv) * Math.PI;
      const x = Math.sin(ph) * Math.cos(th);
      const y = Math.cos(ph);
      const z = Math.sin(ph) * Math.sin(th);
      pos.push(x, y, z);
      nor.push(x, y, z);
      si.push(y > 0 ? 4 : 3, 0, 0, 0);
      sw.push(1, 0, 0, 0);
    }
  const index: number[] = [];
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const a = j * nu + i, b = j * nu + ((i + 1) % nu), c = (j + 1) * nu + i, d = (j + 1) * nu + ((i + 1) % nu);
      index.push(a, c, b, b, c, d);
    }
  return { position: Float32Array.from(pos), normal: Float32Array.from(nor), skinIndex: Uint8Array.from(si), skinWeight: Float32Array.from(sw), index };
}

describe('clusterDecimate', () => {
  it('reaches the triangle target, keeps valid indices and normalised weights', () => {
    const s = sphere(48, 32);
    const full = s.index.length / 3;
    const d = clusterDecimate(s, s.index, 120);
    const tris = d.index.length / 3;
    expect(tris).toBeLessThanOrEqual(120);
    expect(tris).toBeGreaterThan(40);
    expect(tris).toBeLessThan(full);
    const n = d.position.length / 3;
    for (const i of d.index) expect(i).toBeLessThan(n);
    for (let v = 0; v < n; v++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += d.skinWeight[v * 4 + k];
      expect(sum).toBeCloseTo(1, 5);
      expect(Math.hypot(d.normal[v * 3], d.normal[v * 3 + 1], d.normal[v * 3 + 2])).toBeCloseTo(1, 4);
    }
  });

  it('keeps vertices of different bones apart', () => {
    const s = sphere(24, 16);
    const d = clusterDecimate(s, s.index, 40);
    const bones = new Set<number>();
    for (let v = 0; v < d.position.length / 3; v++) bones.add(d.skinIndex[v * 4]);
    expect(bones.has(3)).toBe(true);
    expect(bones.has(4)).toBe(true);
  });
});

describe('clusterDecimate on the real body (LOD 3 from LOD 2)', () => {
  /** Width, height and depth of the head-dominant vertices, and the triangles that are wholly the head's. */
  function headShape(d: { position: ArrayLike<number>; skinIndex: ArrayLike<number>; skinWeight: ArrayLike<number> }, index: ArrayLike<number>) {
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    const head = new Uint8Array(d.position.length / 3);
    for (let v = 0; v < head.length; v++) {
      let w = 0;
      for (let k = 0; k < 4; k++) if (d.skinIndex[v * 4 + k] === B.head) w += d.skinWeight[v * 4 + k];
      if (w < 0.5) continue;
      head[v] = 1;
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k], d.position[v * 3 + k]);
        hi[k] = Math.max(hi[k], d.position[v * 3 + k]);
      }
    }
    let tris = 0;
    for (let i = 0; i < index.length; i += 3) if (head[index[i]] && head[index[i + 1]] && head[index[i + 2]]) tris++;
    return { size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]], tris };
  }
  it('keeps the head a head (not a wedge) with finer cells, within the triangle target', () => {
    for (const sex of ['male', 'female'] as const) {
      const src = loadBody(sex, 2);
      const index = loadIndex(sex, 2);
      const ref = headShape(src, index);
      const scale = new Array(25).fill(1);
      scale[B.head] = REAL_HEAD_CELL;
      const fine = clusterDecimate(src, index, 300, scale);
      const plain = clusterDecimate(src, index, 300);
      const a = headShape(fine, fine.index);
      const b = headShape(plain, plain.index);
      if (process.env.LOG_LOD3) console.log(sex, 'ref', JSON.stringify(ref), 'fine', JSON.stringify(a), 'plain', JSON.stringify(b), 'tris', fine.index.length / 3, plain.index.length / 3);
      expect(fine.index.length / 3).toBeLessThanOrEqual(300);
      expect(a.tris).toBeGreaterThan(b.tris);
      // The skull keeps most of its width and depth.
      expect(a.size[0]).toBeGreaterThan(ref.size[0] * 0.8);
      expect(a.size[2]).toBeGreaterThan(ref.size[2] * 0.8);
    }
  });
});
