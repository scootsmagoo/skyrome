/** The terrain grades audit's pure helpers (src/dev/audit/grades.ts). */
import { describe, expect, it } from 'vitest';
import { bottleneck, cellGrades, components, profile, regrade, relax, scaleAbout, shortestWay, toDeg, toGrade, WALK, walkClasses, wayTo, type HeightGrid } from '../src/dev/audit/grades';

function grid(nx: number, nz: number, f: (x: number, z: number) => number, spacing = 2): HeightGrid {
  const heights = new Float32Array(nx * nz);
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) heights[iz * nx + ix] = f(ix * spacing, iz * spacing);
  return { minX: 0, minZ: 0, spacing, nx, nz, heights };
}

describe('terrain grades audit', () => {
  it('reads the grade of a plane in every cell, both triangles', () => {
    const g = grid(6, 5, (x, z) => 0.3 * x + 0.4 * z);
    const gr = cellGrades(g);
    expect(gr.length).toBe(5 * 4);
    for (const v of gr) expect(v).toBeCloseTo(0.5, 5);
    expect(toDeg(toGrade(37))).toBeCloseTo(37, 6);
  });

  it('takes the steeper triangle of a folded cell', () => {
    // One corner raised: the triangle holding it is steep, the other flat.
    const g: HeightGrid = { minX: 0, minZ: 0, spacing: 2, nx: 2, nz: 2, heights: new Float32Array([0, 2, 0, 0]) };
    expect(cellGrades(g)[0]).toBeCloseTo(Math.hypot(2, 2) / 2, 5);
  });

  it('finds the easiest way up a hill (minimax), and the zig-zag is gentler than the fall line', () => {
    // A cone 20 m high over a 40 m radius (grade 0.5) with a cliff ring cut on all sides but the south.
    const g = grid(61, 61, (x, z) => {
      const r = Math.hypot(x - 60, z - 60);
      const cone = Math.max(0, 20 - r * 0.5);
      const cliff = r > 18 && r < 22 && z < 75 ? 8 : 0;
      return cone + cliff;
    });
    const gr = cellGrades(g);
    const n = 60;
    const src = (k: number) => {
      const ix = k % n, iz = (k / n) | 0;
      return Math.hypot(ix * 2 + 1 - 60, iz * 2 + 1 - 60) > 50;
    };
    const top = (n / 2) * n + n / 2;
    const surf = bottleneck(g, gr, src, () => true, { mode: 'surface' });
    expect(surf[top]).toBeLessThan(0.75);
    expect(surf[top]).toBeGreaterThan(0.45);
    const zig = bottleneck(g, gr, src, () => true, { mode: 'uphill', wall: 5 });
    expect(zig[top]).toBeLessThanOrEqual(surf[top] + 1e-6);
    // Walled off: nothing passable reaches it.
    const none = bottleneck(g, gr, src, (k) => k !== top && Math.hypot((k % n) * 2 + 1 - 60, ((k / n) | 0) * 2 + 1 - 60) > 6, {});
    expect(none[top]).toBe(Infinity);
  });

  it('finds the shortest way that stays under a grade', () => {
    // Flat 20 × 20 cells with a wall across the middle (x = 20 m) open only at the far end (z > 32 m).
    const g = grid(21, 21, (x, z) => (x >= 18 && x <= 22 && z < 32 ? 9 : 0));
    const gr = cellGrades(g);
    const cx = 20;
    const prev = new Int32Array(gr.length);
    const src = (k: number) => k === 0;
    const dist = shortestWay(g, src, (k) => gr[k] < 0.3, prev);
    const goal = cx - 1; // (19, 0): across the wall
    expect(Number.isFinite(dist[goal])).toBe(true);
    const way = wayTo(prev, goal);
    expect(way[0]).toBe(0);
    expect(way[way.length - 1]).toBe(goal);
    // It goes round by the gap: some cell of the way lies past z = 32 m.
    expect(way.some((k) => ((k / cx) | 0) * 2 >= 32)).toBe(true);
    for (const k of way) expect(gr[k]).toBeLessThan(0.3);
  });

  it('groups steep cells into patches', () => {
    const g = grid(20, 20, (x) => (x > 18 && x < 24 ? (x - 18) * 2 : x >= 24 ? 12 : 0));
    const gr = cellGrades(g);
    const cls = new Uint8Array(gr.length).fill(WALK.OPEN);
    const c = components(g, gr, cls, (k) => gr[k] > 1, 3);
    expect(c.length).toBe(1);
    expect(c[0].max).toBeCloseTo(2, 3);
    expect(c[0].byClass[WALK.OPEN]).toBe(c[0].cells);
  });

  it('profiles a line and finds the least cut and fill for a grade limit', () => {
    const p = profile((x) => (x < 10 ? 0 : x < 12 ? (x - 10) * 2.5 : 5), [[0, 0], [30, 0]], 1, 2);
    expect(Math.max(...p.grade)).toBeCloseTo(2.5, 3);
    const r = regrade(p.s, p.y, 0.25);
    for (let i = 1; i < r.y.length; i++) expect(Math.abs(r.y[i] - r.y[i - 1]) / (p.s[i] - p.s[i - 1])).toBeLessThanOrEqual(0.25 + 1e-4);
    // 5 m over 2 m at 25 %: the ramp needs 20 m, about 9 m of it on each side of the step: about 2.25 m of cut and fill.
    expect(r.cut).toBeGreaterThan(1.5);
    expect(r.cut).toBeLessThan(2.6);
    expect(r.fill).toBeGreaterThan(1.5);
  });

  it('scales the land above a datum and relaxes steep ground', () => {
    const h = scaleAbout(new Float32Array([5, 10, 20]), 0.5, 10);
    expect([...h]).toEqual([5, 10, 15]);
    const g = grid(30, 3, (x) => (x > 28 ? 12 : 0));
    const before = Math.max(...cellGrades(g));
    const after = Math.max(...cellGrades({ ...g, heights: relax(g, 0.6, 400) }));
    expect(before).toBeGreaterThan(3);
    expect(after).toBeLessThan(0.75);
  });

  it('classes cells from the city plan raster', () => {
    const g = grid(4, 3, () => 5);
    const cls = new Uint8Array(3 * 2);
    cls[0] = 1; // ROAD
    cls[1] = 0; // FREE: a built block
    cls[2] = 8; // STEEP
    const owner = new Int32Array(6).fill(-1);
    owner[0] = 1_000_000 + 3;
    const w = walkClasses(g, { grid: { x0: 0, z0: 0, cell: 2, nx: 3, nz: 2, cls, owner }, roads: [{ index: 3, style: 'stairs' }] }, 0);
    expect(w[0]).toBe(WALK.STAIRS);
    expect(w[1]).toBe(WALK.NONE);
    expect(w[2]).toBe(WALK.OPEN);
    expect(walkClasses(g, null, 10)[0]).toBe(WALK.WATER);
  });
});
