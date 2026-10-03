import { describe, expect, it } from 'vitest';
import { ORDERS, ORDER_PROPORTIONS, axialSpacing, columnDims, diameterForHeight, entablatureDims, entasisRadius, pedimentRise } from '../src/arch/classical/orders';

describe('orders (Vitruvius / Vignola proportions)', () => {
  it('column heights in lower diameters follow the canon', () => {
    expect(ORDER_PROPORTIONS.tuscan.heightD).toBe(7);
    expect(ORDER_PROPORTIONS.doric.heightD).toBe(8);
    expect(ORDER_PROPORTIONS.ionic.heightD).toBe(9);
    // Corinthian/Composite: 8–10 D in Roman practice (Pantheon 9.5, Mars Ultor 10)
    for (const o of ['corinthian', 'composite'] as const) {
      expect(ORDER_PROPORTIONS[o].heightD).toBeGreaterThanOrEqual(8);
      expect(ORDER_PROPORTIONS[o].heightD).toBeLessThanOrEqual(10);
    }
  });

  it('entablatures are 1/5–1/4 of the column height and their parts sum to 1', () => {
    for (const o of ORDERS) {
      const p = ORDER_PROPORTIONS[o];
      expect(p.entablatureRatio).toBeGreaterThanOrEqual(0.2);
      expect(p.entablatureRatio).toBeLessThanOrEqual(0.25);
      expect(p.parts.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
      const e = entablatureDims(o, 10);
      expect(e.architrave + e.frieze + e.cornice).toBeCloseTo(e.total, 6);
      expect(e.projection).toBeGreaterThan(0);
    }
  });

  it('column parts add up to the height; the shaft absorbs overrides', () => {
    for (const o of ORDERS) {
      const D = 1.1;
      const c = columnDims(o, D);
      expect(c.base + c.shaft + c.capital).toBeCloseTo(c.height, 6);
      expect(c.height).toBeCloseTo(ORDER_PROPORTIONS[o].heightD * D, 6);
      const c2 = columnDims(o, D, 12);
      expect(c2.height).toBe(12);
      expect(c2.base + c2.shaft + c2.capital).toBeCloseTo(12, 6);
      expect(c.d).toBeLessThan(D);
      expect(diameterForHeight(o, c.height)).toBeCloseTo(D, 6);
    }
    // Corinthian capital ≈ 1 1/6 D (Roman), Ionic about a third of D
    expect(columnDims('corinthian', 1).capital).toBeCloseTo(1.167, 2);
    expect(columnDims('ionic', 1).capital).toBeLessThan(0.5);
  });

  it('entasis: straight lower third, convex taper to the upper diameter', () => {
    const D = 1;
    const top = 0.85;
    expect(entasisRadius(D, top, 0)).toBeCloseTo(0.5);
    expect(entasisRadius(D, top, 0.3)).toBeCloseTo(0.5);
    expect(entasisRadius(D, top, 1)).toBeCloseTo(0.425);
    let prev = 1;
    for (let t = 0; t <= 1; t += 0.05) {
      const r = entasisRadius(D, top, t);
      expect(r).toBeLessThanOrEqual(prev + 1e-12);
      prev = r;
    }
    // convex: the midpoint lies above the straight chord between t = 1/3 and t = 1
    const mid = entasisRadius(D, top, 2 / 3);
    expect(mid).toBeGreaterThan((0.5 + 0.425) / 2);
  });

  it('intercolumniation and pediment pitch', () => {
    expect(axialSpacing(1, 'systyle')).toBeCloseTo(3);
    expect(axialSpacing(1, 'pycnostyle')).toBeCloseTo(2.5);
    expect(axialSpacing(2, 2.25)).toBeCloseTo(6.5);
    // Vitruvius: tympanum height = 1/9 of the cornice length → ≈ 12.5°; we default to 14°
    expect(pedimentRise(18, 12.53)).toBeCloseTo(2, 1);
    expect(pedimentRise(18)).toBeCloseTo(9 * Math.tan((14 * Math.PI) / 180), 6);
  });
});
