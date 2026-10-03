import { describe, expect, it } from 'vitest';
import {
  distToSegment, ensurePositive, insetPolygon, obbOverlap, pointInPolygon, polygonCentroid, polygonContainsOBB, rayToPolygon, resamplePolyline, signedArea, subtractPolygons,
  type OBB,
} from '../src/arch/fabric/polygon';
import { openingOutline, validOpenings } from '../src/arch/fabric/wall';
import type { Polygon } from '../src/arch/fabric/types';

const square: Polygon = [[0, 0], [10, 0], [10, 10], [0, 10]];
const L: Polygon = [[0, 0], [20, 0], [20, 10], [10, 10], [10, 20], [0, 20]];

describe('polygon math', () => {
  it('orientation and area', () => {
    expect(signedArea(square)).toBeCloseTo(100);
    expect(signedArea([...square].reverse())).toBeCloseTo(-100);
    expect(signedArea(ensurePositive([...square].reverse()))).toBeCloseTo(100);
  });

  it('point in a concave polygon', () => {
    expect(pointInPolygon([5, 5], L)).toBe(true);
    expect(pointInPolygon([15, 5], L)).toBe(true);
    expect(pointInPolygon([15, 15], L)).toBe(false);
    expect(pointInPolygon([-1, 5], L)).toBe(false);
  });

  it('insets a square evenly', () => {
    const r = insetPolygon(square, 2);
    expect(Math.abs(signedArea(r))).toBeCloseTo(36);
    for (const [x, z] of r) {
      expect(x).toBeGreaterThanOrEqual(2 - 1e-9);
      expect(z).toBeLessThanOrEqual(8 + 1e-9);
    }
  });

  it('oriented boxes: touching is not overlapping, rotation is handled', () => {
    const a: OBB = { c: [0, 0], u: [1, 0], v: [0, 1], hu: 2, hv: 1 };
    const b: OBB = { c: [4, 0], u: [1, 0], v: [0, 1], hu: 2, hv: 1 };
    expect(obbOverlap(a, b)).toBe(false);
    expect(obbOverlap(a, { ...b, c: [3.5, 0] })).toBe(true);
    const s = Math.SQRT1_2;
    const rot: OBB = { c: [3.2, 0], u: [s, s], v: [-s, s], hu: 1, hv: 1 };
    expect(obbOverlap(a, rot)).toBe(true);
    expect(obbOverlap(a, { ...rot, c: [4.5, 0] })).toBe(false);
  });

  it('rectangle containment respects concave notches', () => {
    expect(polygonContainsOBB(L, { c: [5, 5], u: [1, 0], v: [0, 1], hu: 4, hv: 4 })).toBe(true);
    // Straddles the notch corner (10, 10): corners inside but an edge crosses the boundary.
    expect(polygonContainsOBB(L, { c: [12, 12], u: [1, 0], v: [0, 1], hu: 3, hv: 3 })).toBe(false);
    expect(polygonContainsOBB(L, { c: [15, 15], u: [1, 0], v: [0, 1], hu: 1, hv: 1 })).toBe(false);
  });

  it('ray to boundary and segment distance', () => {
    expect(rayToPolygon([1, 5], [1, 0], square)).toBeCloseTo(9);
    expect(rayToPolygon([5, 2], [0, 1], L)).toBeCloseTo(18);
    expect(distToSegment([5, 3], [0, 0], [10, 0])).toBeCloseTo(3);
  });

  it('resamples polylines keeping the end points', () => {
    const pts = resamplePolyline([[0, 0], [10, 0], [10, 5]], 2);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[pts.length - 1]).toEqual([10, 5]);
    for (let i = 1; i < pts.length; i++) expect(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])).toBeLessThanOrEqual(2 + 1e-9);
  });
});

describe('wall openings', () => {
  it('drops openings that leave the wall or overlap', () => {
    const ok = validOpenings(0, 10, 0, 5, [
      { x0: 1, x1: 2, y0: 1, y1: 2 },
      { x0: 1.5, x1: 2.5, y0: 1.5, y1: 2.5 }, // overlaps the first
      { x0: 9.5, x1: 10.5, y0: 1, y1: 2 }, // outside
      { x0: 4, x1: 5, y0: 1, y1: 3 },
    ]);
    expect(ok.length).toBe(2);
  });

  it('arched outlines stay inside the opening box and reach its top', () => {
    const o = { x0: -1, x1: 1, y0: 0, y1: 3, arch: 1 };
    const pts = openingOutline(o);
    expect(pts.length).toBeGreaterThan(6);
    let top = -Infinity;
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(-1 - 1e-6);
      expect(p.x).toBeLessThanOrEqual(1 + 1e-6);
      top = Math.max(top, p.y);
    }
    expect(top).toBeCloseTo(3, 1);
  });
});

describe('polygon difference', () => {
  const area = (ps: Polygon[]) => ps.reduce((a, p) => a + Math.abs(signedArea(p)), 0);

  it('subtracts a convex hole exactly', () => {
    const sq: Polygon = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const hole: Polygon = [[2, 2], [6, 2], [6, 5], [2, 5]];
    const pieces = subtractPolygons(sq, [hole]);
    expect(area(pieces)).toBeCloseTo(100 - 12, 6);
    for (const p of pieces) {
      const c = polygonCentroid(p);
      expect(pointInPolygon(c, hole)).toBe(false);
    }
  });

  it('subtracts a concave (L-shaped) hole, also when it only overlaps partly', () => {
    const cell: Polygon = [[0, 0], [3, 0], [3, 3], [0, 3]];
    const L: Polygon = [[1, 1], [5, 1], [5, 2], [2, 2], [2, 5], [1, 5]];
    const pieces = subtractPolygons(cell, [L]);
    // Overlap of the L with the cell: [1,3]x[1,2] plus [1,2]x[2,3] = 2 + 1.
    expect(area(pieces)).toBeCloseTo(9 - 3, 6);
    for (const p of pieces) expect(pointInPolygon(polygonCentroid(p), L)).toBe(false);
  });

  it('keeps disjoint subjects untouched and removes covered ones', () => {
    const a: Polygon = [[0, 0], [1, 0], [1, 1], [0, 1]];
    expect(subtractPolygons(a, [[[5, 5], [6, 5], [6, 6]]])).toEqual([a]);
    expect(area(subtractPolygons(a, [[[-1, -1], [2, -1], [2, 2], [-1, 2]]]))).toBeCloseTo(0, 9);
  });
});
