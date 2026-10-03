import { describe, expect, it } from 'vitest';
import { flicker, lampLevel, lightScore, seed01, selectLights, type Candidate } from '../src/world/lights/logic';

const cand = (d: number, priority = 1, assigned = false, active = true): Candidate => ({ d2: d * d, priority, assigned, active });

describe('light pool logic', () => {
  it('flicker stays in [1 - 0.6·amount, 1] and is deterministic', () => {
    for (let i = 0; i < 2000; i++) {
      const t = i * 0.013;
      const f = flicker(t, 3.7, 0.5);
      expect(f).toBeLessThanOrEqual(1 + 1e-12);
      expect(f).toBeGreaterThanOrEqual(1 - 0.3 - 1e-12);
      expect(flicker(t, 3.7, 0.5)).toBe(f);
    }
    expect(flicker(1.2, 9, 0)).toBe(1);
  });

  it('lamps light up one by one at dusk and are all lit at night', () => {
    const seeds = Array.from({ length: 50 }, (_, i) => seed01(i + 1));
    for (const s of seeds) {
      expect(lampLevel(0, s)).toBe(0);
      expect(lampLevel(1, s)).toBe(1);
      let prev = 0;
      for (let f = 0; f <= 1.0001; f += 0.05) {
        const l = lampLevel(f, s);
        expect(l).toBeGreaterThanOrEqual(prev - 1e-12);
        prev = l;
      }
    }
    // Halfway through dusk some lamps are lit and some are not.
    const half = seeds.map((s) => lampLevel(0.4, s));
    expect(half.some((l) => l > 0.99)).toBe(true);
    expect(half.some((l) => l < 0.01)).toBe(true);
  });

  it('seed01 is spread over [0,1)', () => {
    const v = Array.from({ length: 1000 }, (_, i) => seed01(i));
    expect(Math.min(...v)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...v)).toBeLessThan(1);
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });

  it('selects the nearest active lights', () => {
    const cs = [cand(50), cand(3), cand(10), cand(1, 1, false, false), cand(7), cand(30)];
    const sel = selectLights(cs, 3).sort((a, b) => a - b);
    expect(sel).toEqual([1, 2, 4]);
    expect(selectLights(cs, 10).length).toBe(5);
  });

  it('priority extends reach and incumbents resist small changes (hysteresis)', () => {
    expect(lightScore(cand(20, 2))).toBeLessThan(lightScore(cand(15, 1)));
    // An assigned light at 10.5 m keeps its slot against a newcomer at 10 m.
    const cs = [cand(10.5, 1, true), cand(10, 1, false)];
    expect(selectLights(cs, 1)).toEqual([0]);
    // …but not against one that is much closer.
    const cs2 = [cand(10.5, 1, true), cand(5, 1, false)];
    expect(selectLights(cs2, 1)).toEqual([1]);
  });
});
