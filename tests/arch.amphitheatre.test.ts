import { describe, expect, it } from 'vitest';
import { caveaSection, ellipseAt, ellipseNormal, ellipsePerimeter, equalArcParams, offsetEllipse } from '../src/arch/classical/amphitheatre';
import { colosseumStoreys } from '../src/arch/classical/arch';

describe('ellipse arithmetic', () => {
  it('perimeter of a circle and of the Colosseum ellipse', () => {
    expect(ellipsePerimeter(1, 1)).toBeCloseTo(Math.PI * 2, 4);
    // Ramanujan's approximation for 94 × 78 m semi-axes
    const a = 94;
    const b = 78;
    const h = (a - b) ** 2 / (a + b) ** 2;
    const ram = Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
    expect(ellipsePerimeter(a, b)).toBeCloseTo(ram, 1);
  });

  it('splits the ellipse into equal arcs (equal arch widths)', () => {
    const rx = 56;
    const rz = 46;
    const ts = equalArcParams(rx, rz, 80);
    expect(ts.length).toBe(80);
    const chords = ts.map((t, i) => {
      const [x0, z0] = ellipseAt(rx, rz, t);
      const [x1, z1] = ellipseAt(rx, rz, ts[(i + 1) % ts.length] + (i === ts.length - 1 ? Math.PI * 2 : 0));
      return Math.hypot(x1 - x0, z1 - z0);
    });
    const mean = chords.reduce((a, c) => a + c, 0) / chords.length;
    for (const c of chords) expect(Math.abs(c - mean) / mean).toBeLessThan(0.003);
    expect(mean * 80).toBeCloseTo(ellipsePerimeter(rx, rz), -1);
  });

  it('normals are unit length and point outward', () => {
    for (const t of [0, 0.7, 1.9, 3.3, 5.5]) {
      const [nx, nz] = ellipseNormal(50, 30, t);
      expect(Math.hypot(nx, nz)).toBeCloseTo(1, 9);
      const [x, z] = ellipseAt(50, 30, t);
      expect(nx * x + nz * z).toBeGreaterThan(0);
    }
  });

  it('offset curves keep a constant distance from a circle', () => {
    for (const [x, z] of offsetEllipse(10, 10, 3, 32)) expect(Math.hypot(x, z)).toBeCloseTo(13, 6);
  });
});

describe('cavea section', () => {
  it('rows step up and out with climbable risers', () => {
    const s = caveaSection({ arenaRx: 26, arenaRz: 16, podium: 2.4, tiers: [{ rows: 8 }, { rows: 10, wall: 1.4 }] });
    expect(s.rows.length).toBe(18);
    for (let i = 1; i < s.profile.length; i++) {
      const [x0, y0] = s.profile[i - 1];
      const [x1] = s.profile[i];
      expect(x1).toBeGreaterThanOrEqual(x0 - 1e-9);
      void y0;
    }
    for (const r of s.rows) expect(r.y - (r.prevY ?? 0)).toBeLessThanOrEqual(0.42);
    expect(s.height).toBeCloseTo(2.4 + 18 * 0.38 + 1.4, 6);
    expect(s.reach).toBeGreaterThan(18 * 0.72);
  });

  it('Colosseum storeys at WORLD_SCALE stay 48.15 m × 0.6 tall', () => {
    const h = colosseumStoreys(0.6).reduce((a, s) => a + s.height, 0);
    expect(h).toBeCloseTo((10.5 + 11.85 + 11.6 + 14.2) * 0.6, 6);
  });
});
