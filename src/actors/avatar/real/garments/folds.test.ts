import { describe, expect, it } from 'vitest';
import { foldDepth, foldPhase, ridge, vnoise } from './folds';
import { smoothNormals, weldGroups } from './assemble';

describe('cloth folds', () => {
  it('ridge is a rounded crest between creases, period PI', () => {
    expect(ridge(Math.PI / 2)).toBeCloseTo(1, 5);
    expect(ridge(0)).toBeCloseTo(0, 5);
    expect(ridge(Math.PI)).toBeCloseTo(0, 5);
    for (let k = 0; k < 50; k++) {
      const v = ridge(k * 0.37);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
  it('fold depth grows toward the hem and stays bounded', () => {
    for (const th of [0, 1, 2, 3, 4, 5]) {
      expect(foldDepth(th, 1, 3)).toBeGreaterThan(foldDepth(th, 0, 3));
      expect(foldDepth(th, 0.5, 3)).toBeLessThan(1.5);
    }
  });
  it('fold phase is continuous round the body and noise is bounded', () => {
    let prev = foldPhase(0, 0.5, 8, 2);
    for (let k = 1; k <= 200; k++) {
      const p = foldPhase((k / 200) * Math.PI * 2, 0.5, 8, 2);
      expect(Math.abs(p - prev)).toBeLessThan(0.5);
      prev = p;
    }
    for (let k = 0; k < 100; k++) expect(Math.abs(vnoise(k * 0.31, 1))).toBeLessThanOrEqual(1);
  });
});

describe('smoothNormals', () => {
  it('welded vertices share one normal and the result is unit length', () => {
    // Two triangles sharing an edge; vertices 3 and 4 duplicate vertices 0 and 2 (a UV seam).
    const position = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0];
    const normal = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0.2, 1, 0.2, 0, 1, 0, 0, 1];
    const index = [0, 1, 2, 3, 5, 4];
    const w = weldGroups(position, 6);
    expect(w.count).toBe(4);
    const out = smoothNormals(w, normal, index, 6);
    for (let c = 0; c < 3; c++) {
      expect(out[3 * 3 + c]).toBeCloseTo(out[0 * 3 + c], 6);
      expect(out[4 * 3 + c]).toBeCloseTo(out[2 * 3 + c], 6);
    }
    for (let v = 0; v < 6; v++) expect(Math.hypot(out[v * 3], out[v * 3 + 1], out[v * 3 + 2])).toBeCloseTo(1, 5);
  });
});
