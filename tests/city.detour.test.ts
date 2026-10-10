/** Roads bent round solid footprints (detour.ts): pure geometry. */
import { describe, expect, it } from 'vitest';
import { convexHull, detourRoad, around, blockerGap, DETOUR_GAP, MAX_GAP } from '../src/world/city/detour';
import { pointInPoly, type Pt } from '../src/world/city/raster';

const rect = (x0: number, z0: number, x1: number, z1: number): Pt[] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const sample = (pts: Pt[], f: (p: Pt) => void) => {
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1];
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.25);
    for (let i = 0; i <= n; i++) f([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
  }
};

describe('detourRoad', () => {
  const box = { id: 'b', poly: rect(0, 0, 30, 20), gap: 0 };

  it('leaves a road that misses the footprint alone', () => {
    const r = detourRoad([[-40, 40], [70, 40]], [box], 5);
    expect(r.detours).toHaveLength(0);
    expect(r.points).toEqual([[-40, 40], [70, 40]]);
  });

  it('ignores a graze of a corner', () => {
    const r = detourRoad([[-5, 5], [5, -5]], [box], 3);
    expect(r.detours).toHaveLength(0);
  });

  it('takes a road that crosses the building round it, on the shorter side, with the clearance kept', () => {
    // Crossing near the north edge: the northern way round is shorter.
    const orig: Pt[] = [[-40, 4], [70, 4]];
    const r = detourRoad(orig, [box], 5);
    expect(r.detours).toHaveLength(1);
    expect(r.detours[0].kind).toBe('around');
    let inside = 0, minD = Infinity;
    sample(r.points, (p) => {
      if (pointInPoly(p[0], p[1], box.poly)) inside++;
      minD = Math.min(minD, Math.max(-p[0], p[0] - 30, -p[1], p[1] - 20));
    });
    expect(inside).toBe(0);
    expect(minD).toBeGreaterThan(4.9);
    // The ends are kept, the way round goes via the near (z < 0) side.
    expect(r.points[0]).toEqual([-40, 4]);
    expect(r.points[r.points.length - 1]).toEqual([70, 4]);
    expect(r.points.some((p) => p[1] < -4)).toBe(true);
  });

  it('leaves a road that ends inside the building (at its door) alone', () => {
    const r = detourRoad([[-40, 10], [15, 10]], [box], 4);
    expect(r.detours).toHaveLength(0);
    expect(r.points[r.points.length - 1]).toEqual([15, 10]);
  });

  it('cuts a road that ends inside the building at its outline when asked', () => {
    const r = detourRoad([[-40, 10], [15, 10]], [box], 4, [], true);
    expect(r.detours[0].kind).toBe('end');
    const last = r.points[r.points.length - 1];
    expect(last[0]).toBeLessThan(-3.5);
    expect(last[0]).toBeGreaterThan(-4.5);
  });

  it('cuts a road that starts inside the building', () => {
    const r = detourRoad([[15, 10], [60, 10]], [box], 4, [], true);
    expect(r.detours[0].kind).toBe('start');
    expect(r.points[0][0]).toBeGreaterThan(33.5);
  });

  it('handles two buildings in a row', () => {
    const two = [box, { id: 'c', poly: rect(50, 0, 80, 20) }];
    const r = detourRoad([[-40, 10], [120, 10]], two, 4);
    let inside = 0;
    sample(r.points, (p) => { if (two.some((b) => pointInPoly(p[0], p[1], b.poly))) inside++; });
    expect(inside).toBe(0);
    expect(r.detours.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps a road whose detour would be absurdly long', () => {
    // A building so wide the way round is longer than the allowance.
    const wall = { id: 'w', poly: rect(0, -2000, 10, 2000) };
    const r = detourRoad([[-20, 0], [30, 0]], [wall], 4);
    expect(r.points).toEqual([[-20, 0], [30, 0]]);
  });
});

describe('blockerGap', () => {
  const poly = rect(0, 0, 30, 20);
  it('keeps the base gap on level ground', () => {
    expect(blockerGap(poly, () => 0.02)).toBe(DETOUR_GAP);
  });
  it('widens the gap past the bank of a raised pad', () => {
    // A pad whose bank (steep ground) reaches 11 m out of the footprint's box.
    const bank = (x: number, z: number) => (Math.max(-x, x - 30, -z, z - 20) < 11 ? 0.5 : 0.02);
    const g = blockerGap(poly, bank);
    expect(g).toBeGreaterThan(DETOUR_GAP);
    expect(g).toBeLessThan(MAX_GAP + 1);
    expect(g + 4.4).toBeGreaterThanOrEqual(11);
  });
  it('gives up at MAX_GAP on a cliff', () => {
    expect(blockerGap(poly, () => 1)).toBe(MAX_GAP);
  });
});

describe('convexHull and around', () => {
  it('hulls a concave L', () => {
    const h = convexHull([[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]]);
    expect(h).toHaveLength(5);
  });
  it('walks the shorter way round a ring', () => {
    const ring = rect(0, 0, 10, 10);
    const w = around(ring, [5, 0], [10, 5]);
    expect(w).toEqual([[5, 0], [10, 0], [10, 5]]);
  });
});
