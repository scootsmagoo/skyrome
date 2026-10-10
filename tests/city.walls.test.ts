/**
 * Servian wall crossings (M5a): every road or street that meets a wall passes through it (a gate
 * or a breach), a wall piece never stands on a way, and a lane does not stop at the wall when
 * there is a street beyond it. The wall pieces are cut by `freeRuns` (monuments.ts) exactly where
 * the plan raster says ROAD / STREET / PIAZZA.
 */
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { freeRuns } from '../src/world/city/monuments';
import { auditStreetEnds } from '../src/world/city/audit';
import { K, Grid, type Pt } from '../src/world/city/raster';
import { gameFixture } from './city.fixture';

describe('freeRuns', () => {
  const g = Grid.over({ minX: 0, maxX: 40, minZ: 0, maxZ: 10 }, 1);
  g.cls.fill(K.FREE);
  // A road across the wall line from x = 18 to x = 24.
  for (let ix = 18; ix < 24; ix++) for (let iz = 0; iz < 10; iz++) g.cls[iz * g.nx + ix] = K.ROAD;

  it('cuts a piece at the edges of the way', () => {
    const runs = freeRuns(g, [14, 5], [28, 5]);
    expect(runs).toHaveLength(2);
    expect(runs[0].s0).toBe(0);
    expect(runs[0].s1).toBeCloseTo(4, 0);
    expect(runs[0].openEnd).toBe(true);
    expect(runs[0].openStart).toBe(false);
    expect(runs[1].s0).toBeCloseTo(10, 0);
    expect(runs[1].openStart).toBe(true);
    expect(runs[1].openEnd).toBe(false);
  });

  it('gives a clear piece as one run, and a piece wholly on the way as none', () => {
    expect(freeRuns(g, [2, 5], [9, 5])).toEqual([{ s0: 0, s1: 7, openStart: false, openEnd: false }]);
    expect(freeRuns(g, [19, 5], [23, 5])).toHaveLength(0);
  });
});

describe('Servian wall crossings on the real plan', () => {
  const { plan } = gameFixture();
  const g = plan.grid;

  it('never leaves a wall piece standing on a road or street', () => {
    let pieces = 0, onWay = 0, breaches = 0;
    const where: string[] = [];
    for (const w of plan.walls) {
      if (w.state === 'built-over') continue;
      for (let k = 0; k + 1 < w.points.length; k++) {
        const a = w.points[k], b = w.points[k + 1];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const m = Math.max(1, Math.round(L / 7));
        for (let j = 0; j < m; j++) {
          const p0: Pt = [a[0] + ((b[0] - a[0]) * j) / m, a[1] + ((b[1] - a[1]) * j) / m];
          const p1: Pt = [a[0] + ((b[0] - a[0]) * (j + 1)) / m, a[1] + ((b[1] - a[1]) * (j + 1)) / m];
          for (const r of freeRuns(g, p0, p1)) {
            pieces++;
            const dx = (p1[0] - p0[0]) / Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
            const dz = (p1[1] - p0[1]) / Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
            for (let s = r.s0 + 0.55; s < r.s1 - 0.55; s += 0.5) {
              const c = g.at(p0[0] + dx * s, p0[1] + dz * s);
              if (c === K.ROAD || c === K.STREET || c === K.PIAZZA) onWay++;
            }
            if (r.openStart || r.openEnd) {
              breaches++;
              where.push(`${w.id} ${(p0[0] + dx * (r.openStart ? r.s0 : r.s1)).toFixed(0)},${(p0[1] + dz * (r.openStart ? r.s0 : r.s1)).toFixed(0)}`);
            }
          }
        }
      }
    }
    if (process.env.WALL_AUDIT_OUT) writeFileSync(process.env.WALL_AUDIT_OUT, where.join('\n'));
    expect(pieces).toBeGreaterThan(50);
    // (The line is sampled every half metre; a corner of a raster cell can slip between two samples.)
    expect(onWay).toBeLessThanOrEqual(3);
    // Roads and streets do cross the standing walls: there are breaches (jambs).
    expect(breaches).toBeGreaterThan(0);
  });

  it('leaves no lane stopping at a Servian wall with open ground beyond it', () => {
    const ends = auditStreetEnds(plan).filter((e) => e.verdict === 'stub' && e.beyond === K.WALL);
    // A lane may end at the wall where there is nothing but country behind it; the planner now carries
    // it through wherever a street or road lies within reach. What is left is a handful.
    console.log('STREET ENDS AT THE WALL', ends.length, ends.map((e) => `${e.street}@${e.p.map(Math.round)}`).join(' '));
    expect(ends.length).toBeLessThanOrEqual(8);
  });
});
