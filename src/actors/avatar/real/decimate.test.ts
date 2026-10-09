import { describe, expect, it } from 'vitest';
import { clusterDecimate } from './decimate';

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
