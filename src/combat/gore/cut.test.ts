import { describe, expect, it } from 'vitest';
import { capFan, cutMesh } from './cut';

/** A tube of `rings` rings x `seg` segments along +y (ring r at y = r), triangulated, outward winding. */
function tube(rings: number, seg: number) {
  const index: number[] = [];
  for (let r = 0; r + 1 < rings; r++) {
    for (let s = 0; s < seg; s++) {
      const a = r * seg + s;
      const b = r * seg + ((s + 1) % seg);
      const c = (r + 1) * seg + s;
      const d = (r + 1) * seg + ((s + 1) % seg);
      index.push(a, c, b, b, c, d);
    }
  }
  return index;
}

describe('cutMesh', () => {
  it('leaves everything on one side alone', () => {
    const idx = tube(4, 6);
    const r = cutMesh(idx, new Array(24).fill(-1));
    expect(r.piece.length).toBe(0);
    expect(r.body.length).toBe(idx.length);
    expect(r.rim.length).toBe(0);
    expect(r.extra.length).toBe(0);
  });

  it('cuts a tube between two rings: one closed rim loop, shared new vertices, no triangle lost', () => {
    const rings = 5;
    const seg = 8;
    const idx = tube(rings, seg);
    // plane at y = 1.4: rings 2.. go with the piece
    const g = Array.from({ length: rings * seg }, (_, i) => Math.floor(i / seg) - 1.4);
    const r = cutMesh(idx, g);
    expect(r.rim.length).toBe(1);
    expect(r.rim[0].length).toBe(seg * 2); // vertical and diagonal edges both cross
    expect(r.extra.length).toBe(seg * 2);
    for (const e of r.extra) {
      expect(e.t).toBeGreaterThan(0);
      expect(e.t).toBeLessThan(1);
      expect(g[e.a]).toBeGreaterThan(0);
      expect(g[e.b]).toBeLessThanOrEqual(0);
    }
    // the cut ring lies between ring 1 and ring 2: t = g_a / (g_a - g_b) = 0.6 / (0.6 + 0.4)
    expect(r.extra[0].t).toBeCloseTo(0.6, 6);
    // Each of the 2*seg straddling triangles becomes 3.
    const whole = idx.length / 3;
    const straddle = seg * 2;
    expect((r.body.length + r.piece.length) / 3).toBe(whole - straddle + straddle * 3);
    // loop vertices are all distinct new vertices
    expect(new Set(r.rim[0]).size).toBe(seg * 2);
    for (const id of r.rim[0]) expect(id).toBeGreaterThanOrEqual(rings * seg);
  });

  it('chains the rim through a UV seam (duplicated vertices at one place)', () => {
    // The tube again, but the seam column is duplicated: vertices 0..rings-1 columns use ids >= rings*seg.
    const rings = 4;
    const seg = 6;
    const idx = tube(rings, seg);
    const n0 = rings * seg;
    const pos: number[] = [];
    for (let r = 0; r < rings; r++) for (let s = 0; s < seg; s++) pos.push(Math.cos((s / seg) * 6.28318), r, Math.sin((s / seg) * 6.28318));
    // duplicate column 0 for the wrap-around triangles (the ones using (s + 1) % seg = 0 from s = seg - 1)
    for (let r = 0; r < rings; r++) pos.push(1, r, 0);
    const dup = (r: number) => n0 + r;
    const wrapped = idx.slice();
    for (let r = 0; r + 1 < rings; r++) {
      const s = seg - 1;
      const base = (r * seg + s) * 6;
      for (let k = 0; k < 6; k++) {
        const v = wrapped[base + k];
        if (v === r * seg) wrapped[base + k] = dup(r);
        else if (v === (r + 1) * seg) wrapped[base + k] = dup(r + 1);
      }
    }
    const g = Array.from({ length: n0 + rings }, (_, i) => (i < n0 ? Math.floor(i / seg) : i - n0) - 1.5);
    const withSeam = cutMesh(wrapped, g, pos);
    const noWeld = cutMesh(wrapped, g);
    expect(noWeld.rim.length === 1 && noWeld.rim[0].length === seg * 2).toBe(false); // broken at the seam
    expect(withSeam.rim.length).toBe(1);
    expect(withSeam.rim[0].length).toBe(seg * 2);
  });

  it('caps a loop with a fan', () => {
    expect(capFan([10, 11, 12], 99, false)).toEqual([99, 10, 11, 99, 11, 12, 99, 12, 10]);
    expect(capFan([10, 11, 12], 99, true)).toEqual([99, 11, 10, 99, 12, 11, 99, 10, 12]);
  });
});
