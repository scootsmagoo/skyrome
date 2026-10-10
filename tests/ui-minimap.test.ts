/**
 * Minimap geometry (src/ui/hud/minimap/minimapMath.ts) and the map fabric from the city plan.
 */
import { describe, expect, it } from 'vitest';
import { fabricFromPlan } from '../src/game/mapSource';
import { angleDelta, clampToRim, discTransform, miniView, setMiniView, tileRange, toDisc } from '../src/ui/hud/minimap/minimapMath';

const R = 88;

function at(heading: number, northUp = false) {
  return setMiniView(miniView(), 100, 200, heading, northUp, R / 80, R, R, R);
}

describe('minimap view', () => {
  it('north up: east is right, south is down', () => {
    const v = at(123, true);
    const p = toDisc(v, 110, 200, { x: 0, y: 0 });
    expect(p.x).toBeCloseTo(R + 10 * (R / 80));
    expect(p.y).toBeCloseTo(R);
    toDisc(v, 100, 210, p);
    expect(p.y).toBeCloseTo(R + 10 * (R / 80));
  });

  it('turning with the view puts the heading straight up', () => {
    for (const h of [0, 45, 90, 180, 270, 333]) {
      const v = at(h);
      // A point 40 m along the bearing h (x east = sin, z south = −cos).
      const b = (h * Math.PI) / 180;
      const p = toDisc(v, 100 + Math.sin(b) * 40, 200 - Math.cos(b) * 40, { x: 0, y: 0 });
      expect(p.x).toBeCloseTo(R, 4);
      expect(p.y).toBeCloseTo(R - 40 * (R / 80), 4);
    }
  });

  it('a point to the right of the view is right on the disc', () => {
    // Looking east (90°): south is to the right.
    const p = toDisc(at(90), 100, 230, { x: 0, y: 0 });
    expect(p.x).toBeGreaterThan(R);
    expect(p.y).toBeCloseTo(R, 4);
  });

  it('the canvas transform agrees with toDisc', () => {
    const v = at(37);
    const m = discTransform(v, 2, [0, 0, 0, 0, 0, 0]);
    const x = 143;
    const z = 171;
    const p = toDisc(v, x, z, { x: 0, y: 0 });
    expect(m[0] * x + m[2] * z + m[4]).toBeCloseTo(p.x * 2, 4);
    expect(m[1] * x + m[3] * z + m[5]).toBeCloseTo(p.y * 2, 4);
  });

  it('pins far points to the rim along their direction', () => {
    const v = at(0, true);
    const p = toDisc(v, 100 + 300, 200, { x: 0, y: 0 });
    expect(clampToRim(v, p, R - 9)).toBe(true);
    expect(p.x).toBeCloseTo(R + R - 9);
    expect(p.y).toBeCloseTo(R);
    const q = toDisc(v, 105, 200, { x: 0, y: 0 });
    expect(clampToRim(v, q, R - 9)).toBe(false);
  });

  it('covers the disc with tiles and wraps angles', () => {
    expect(tileRange(100, 200, 80, 128, [0, 0, 0, 0])).toEqual([0, 1, 0, 2]);
    expect(tileRange(-10, -10, 5, 128, [0, 0, 0, 0])).toEqual([-1, -1, -1, -1]);
    expect(angleDelta(10, 350)).toBe(20);
    expect(angleDelta(350, 10)).toBe(-20);
    expect(angleDelta(180, 0)).toBe(180);
  });
});

describe('map fabric from the city plan', () => {
  it('flattens blocks, streets (roads at full width) and squares', () => {
    const f = fabricFromPlan({
      blocks: [
        { outline: [[0, 0], [10, 0], [10, 10]], kind: 'built' },
        { outline: [[20, 0], [30, 0], [30, 10]], kind: 'garden' },
      ],
      streets: [{ points: [[0, 0], [5, 5]], width: 3 }],
      roads: [{ points: [[0, 0], [100, 0]], half: 4 }],
      plazas: [{ polygon: [[0, 0], [1, 0], [1, 1]] }],
    });
    expect(f.blocks.map((b) => b.garden)).toEqual([false, true]);
    expect([...f.blocks[0].pts]).toEqual([0, 0, 10, 0, 10, 10]);
    expect(f.streets.map((s) => s.width)).toEqual([8, 3]);
    expect(f.plazas[0].pts.length).toBe(6);
  });
});
