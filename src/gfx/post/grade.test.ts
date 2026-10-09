import { describe, expect, it } from 'vitest';
import { buildGradeLut, gradeColor, LUT_SIZE, linearToSrgb, srgbToLinear, type GradeLutParams } from './grade';

const NEUTRAL: GradeLutParams = { saturation: 1, shadowDesat: 0, contrast: 0, toe: 0, shadowTint: [1, 1, 1], highlightTint: [1, 1, 1] };
const GRADE: GradeLutParams = { saturation: 1.1, shadowDesat: 0.3, contrast: 0.22, toe: 0.012, shadowTint: [0.93, 0.99, 1.07], highlightTint: [1.07, 1, 0.9] };

describe('grade LUT', () => {
  it('sRGB transfer functions invert each other', () => {
    for (const v of [0, 0.002, 0.04, 0.2, 0.5, 0.9, 1]) expect(linearToSrgb(srgbToLinear(v))).toBeCloseTo(v, 5);
  });

  it('a neutral grade is the identity', () => {
    for (const c of [[0, 0, 0], [1, 1, 1], [0.5, 0.5, 0.5], [0.8, 0.3, 0.1], [0.1, 0.6, 0.9]]) {
      const o = gradeColor(c[0], c[1], c[2], NEUTRAL);
      for (let i = 0; i < 3; i++) expect(o[i]).toBeCloseTo(c[i], 4);
    }
  });

  it('the warm grade pushes highlights toward amber and shadows toward blue', () => {
    const hi = gradeColor(0.85, 0.85, 0.85, GRADE);
    expect(hi[0]).toBeGreaterThan(hi[2]);
    const lo = gradeColor(0.08, 0.08, 0.08, GRADE);
    expect(lo[2]).toBeGreaterThan(lo[0]);
  });

  it('stays in range', () => {
    for (const c of [[0, 0, 0], [1, 1, 1], [1, 0, 0], [0, 1, 0], [0, 0, 1]]) for (const v of gradeColor(c[0], c[1], c[2], GRADE)) expect(v >= 0 && v <= 1).toBe(true);
  });

  it('is monotonic in grey', () => {
    let prev = -1;
    for (let i = 0; i <= 64; i++) {
      const v = gradeColor(i / 64, i / 64, i / 64, GRADE)[1];
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('fills the table in r-fastest order', () => {
    const d = buildGradeLut(NEUTRAL, 4);
    expect(d.length).toBe(4 * 4 * 4 * 4);
    // texel (r=3, g=0, b=0) is texel 3; (0,1,0) is texel 4
    expect(d[3 * 4]).toBe(255);
    expect(d[3 * 4 + 1]).toBe(0);
    expect(d[4 * 4 + 1]).toBe(85);
    expect(LUT_SIZE).toBe(32);
  });
});
