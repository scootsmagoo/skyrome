import { describe, expect, it } from 'vitest';
import { latinize, layoutLines } from '../src/arch/common/inscription';
import { HeightField, friezeBand, hieroglyphFace } from '../src/arch/common/relief';

describe('inscriptions', () => {
  it('writes Latin in Roman capitals with interpuncts', () => {
    expect(latinize('Senatus Populusque Romanus')).toBe('SENATVS · POPVLVSQVE · ROMANVS');
    expect(latinize('Julius  Augustus', true)).toBe('IVLIVS · AVGVSTVS');
    expect(latinize('taberna vinaria', false)).toBe('TABERNA VINARIA');
  });

  it('lays out lines top to bottom inside the margins, first line largest', () => {
    const L = layoutLines(4);
    expect(L.length).toBe(4);
    expect(L[0].size).toBeGreaterThan(L[1].size);
    for (let i = 1; i < L.length; i++) expect(L[i].baseline).toBeGreaterThan(L[i - 1].baseline);
    expect(L[0].baseline - L[0].size).toBeGreaterThanOrEqual(0.12 - 1e-9);
    expect(L[3].baseline).toBeLessThanOrEqual(1 - 0.12 + 1e-9);
    const one = layoutLines(1, [1], 0.1);
    expect(one[0].size).toBeCloseTo(0.8, 6);
  });
});

describe('relief height fields', () => {
  it('rasterises primitives and wraps friezes seamlessly', () => {
    const f = new HeightField(32, 16, true);
    f.ellipse(31, 8, 3, 3, 1);
    // wrapped onto the left edge
    expect(f.data[8 * 32 + 1]).toBeGreaterThan(0);
    const band = friezeBand(256, 32, 1);
    expect(Math.max(...band.data)).toBeGreaterThan(0.3);
    // the spiral divider fillet runs along the bottom rows
    expect(band.data[1 * 256 + 100]).toBeGreaterThan(0.2);
  });

  it('carves hieroglyphs (negative heights)', () => {
    const g = hieroglyphFace(64, 256, 3);
    expect(Math.min(...g.data)).toBeLessThan(-0.3);
    expect(Math.max(...g.data)).toBeLessThanOrEqual(0);
  });
});
