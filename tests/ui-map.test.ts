import { describe, expect, it } from 'vitest';
import { clampView, fitScale, niceScaleBar, panBy, rotateLocal, screenToWorld, worldToScreen, zoomAt } from '../src/ui/map/view';
import { contourSegments, hillshade, sampleHeights } from '../src/ui/map/terrain';

describe('map view', () => {
  const v = { cx: 100, cz: -50, scale: 2 };
  it('round-trips world and screen coordinates', () => {
    const [sx, sy] = worldToScreen(v, 800, 600, 130, -20);
    expect([sx, sy]).toEqual([460, 360]);
    const [x, z] = screenToWorld(v, 800, 600, sx, sy);
    expect(x).toBeCloseTo(130);
    expect(z).toBeCloseTo(-20);
  });
  it('zooms around the cursor', () => {
    const z = zoomAt(v, 2, 600, 100, 800, 600, 0.1, 10);
    expect(z.scale).toBe(4);
    const before = screenToWorld(v, 800, 600, 600, 100);
    const after = screenToWorld(z, 800, 600, 600, 100);
    expect(after[0]).toBeCloseTo(before[0]);
    expect(after[1]).toBeCloseTo(before[1]);
    expect(zoomAt(v, 100, 0, 0, 800, 600, 0.1, 10).scale).toBe(10);
  });
  it('pans opposite to the drag in world units', () => {
    const p = panBy(v, 20, -10);
    expect(p.cx).toBe(90);
    expect(p.cz).toBe(-45);
  });
  it('clamps the view inside the map, centering small maps', () => {
    const b = { minX: 0, maxX: 1000, minZ: 0, maxZ: 1000 };
    const c = clampView({ cx: -500, cz: 2000, scale: 1 }, b, 400, 400);
    expect(c.cx).toBe(200);
    expect(c.cz).toBe(800);
    const small = clampView({ cx: 0, cz: 0, scale: 0.1 }, b, 400, 400);
    expect(small.cx).toBe(500);
    expect(fitScale(b, 400, 200)).toBeCloseTo(0.2);
  });
  it('chooses nice scale bar lengths', () => {
    const s = niceScaleBar(0.5, 120);
    expect(s.length).toBe(200);
    expect(s.px).toBe(100);
  });
  it('rotates local points by compass bearing like the atlas', () => {
    // A facade facing north (local -z) rotated to bearing 90 faces east (+x).
    const [x, z] = rotateLocal(0, -1, 90);
    expect(x).toBeCloseTo(1);
    expect(z).toBeCloseTo(0);
  });
});

describe('map terrain', () => {
  const cone = (x: number, z: number) => Math.max(0, 10 - Math.hypot(x, z));
  const g = sampleHeights(cone, -10, -10, 21, 21, 1);

  it('samples a grid', () => {
    expect(g.data[10 * 21 + 10]).toBe(10);
    expect(g.data[0]).toBe(0);
  });
  it('produces a closed ring of contour segments around a cone', () => {
    const segs = contourSegments(g, 5);
    expect(segs.length % 4).toBe(0);
    expect(segs.length / 4).toBeGreaterThan(20);
    for (let i = 0; i < segs.length; i += 2) {
      const r = Math.hypot(segs[i], segs[i + 1]);
      expect(r).toBeGreaterThan(4.2);
      expect(r).toBeLessThan(5.8);
    }
  });
  it('lights north-west slopes brighter than south-east ones', () => {
    const s = hillshade(g, 315, 40, 1);
    const nw = s[5 * 21 + 5];
    const se = s[15 * 21 + 15];
    expect(nw).toBeGreaterThan(se);
  });
});
