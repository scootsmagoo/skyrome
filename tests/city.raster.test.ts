import { describe, expect, it } from 'vitest';
import { Grid, K, components, signedArea, simplifyRing, splitCells, traceLoops, type Pt } from '../src/world/city/raster';
import { findJunctions, sliceLine } from '../src/world/city/roads';
import { roadDims, simplifyOpen } from '../src/world/city/plan';
import type { PlanRoad } from '../src/world/city/plan';

describe('city raster', () => {
  it('fills polygons and traces a square with a hole (outer positive, hole negative)', () => {
    const g = Grid.over({ minX: 0, minZ: 0, maxX: 40, maxZ: 40 }, 1);
    g.cls.fill(K.OUTSIDE);
    g.fillPolygon([[5, 5], [35, 5], [35, 35], [5, 35]], K.FREE);
    g.fillPolygon([[15, 15], [25, 15], [25, 25], [15, 25]], K.LANDMARK);
    expect(g.count(K.FREE)).toBe(30 * 30 - 10 * 10);
    const { comps } = components(g, (i) => g.cls[i] === K.FREE);
    expect(comps.length).toBe(1);
    const loops = traceLoops(g, comps[0], (i) => g.cls[i] === K.FREE);
    const areas = loops.map(signedArea).sort((a, b) => a - b);
    expect(areas).toEqual([-100, 900]);
  });

  it('splits a component cut by a band into two pieces', () => {
    const g = Grid.over({ minX: 0, minZ: 0, maxX: 50, maxZ: 20 }, 1);
    g.cls.fill(K.FREE);
    const { comps } = components(g, (i) => g.cls[i] === K.FREE);
    g.fillBand([[25, -5], [25, 25]], 1.5, K.STREET);
    const pieces = splitCells(g, comps[0], (i) => g.cls[i] === K.FREE, new Int32Array(g.nx * g.nz), 1);
    expect(pieces.length).toBe(2);
    // Cell centres within 1.5 m of x = 25: four columns.
    expect(pieces[0].length + pieces[1].length).toBe(50 * 20 - 4 * 20);
  });

  it('simplifies a staircase to a straight diagonal', () => {
    const ring: Pt[] = [];
    for (let i = 0; i < 20; i++) ring.push([i, i], [i + 1, i]);
    ring.push([20, 0]);
    const s = simplifyRing(ring, 1.0);
    expect(s.length).toBeLessThan(6);
    expect(simplifyOpen([[0, 0], [5, 0.1], [10, 0]], 0.5)).toEqual([[0, 0], [10, 0]]);
  });
});

describe('city roads', () => {
  const road = (id: string, points: Pt[], width = 6): PlanRoad => {
    const d = roadDims({ kind: 'via', width, paving: 'basalt' });
    return { id, index: 0, name: id, kind: 'via', style: d.style, points, carriage: d.carriage, sidewalk: d.sidewalk, half: d.carriage / 2 + d.sidewalk };
  };

  it('finds one junction square where two roads cross and one where a road ends on another', () => {
    const a = road('a', [[-50, 0], [50, 0]]);
    const b = road('b', [[0, -50], [0, 50]]);
    const c = road('c', [[30, 2], [30, 60]]);
    const js = findJunctions([a, b, c]);
    expect(js.length).toBe(2);
    for (const j of js) expect(j.r).toBeGreaterThan(a.half);
  });

  it('keeps human-scale street widths and sidewalks only on paved urban roads', () => {
    expect(roadDims({ kind: 'via', width: 10, paving: 'basalt' }).sidewalk).toBeGreaterThan(1);
    expect(roadDims({ kind: 'street', width: 5, paving: 'gravel' }).sidewalk).toBe(0);
    const st = roadDims({ kind: 'stairs', width: 3, paving: 'steps' });
    expect(st.style).toBe('stairs');
    expect(st.carriage).toBeGreaterThanOrEqual(2.6);
  });

  it('slices a polyline by arc length', () => {
    const s = sliceLine([[0, 0], [10, 0], [10, 10]], 5, 15);
    expect(s[0]).toEqual([5, 0]);
    expect(s[s.length - 1]).toEqual([10, 5]);
  });
});
