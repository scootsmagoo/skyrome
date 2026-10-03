import { describe, expect, it } from 'vitest';
import { fillBlock, planLots } from '../src/arch/fabric/blockFiller';
import { MAX_BUILDING_HEIGHT } from '../src/arch/fabric/insula';
import { obbCorners, obbOverlap, pointInPolygon, polygonContainsOBB } from '../src/arch/fabric/polygon';
import type { Polygon } from '../src/arch/fabric/types';

const block: Polygon = [[0, 0], [70, 0], [70, 45], [0, 45]];
const slope = (x: number, z: number) => 0.05 * x - 0.03 * z + Math.sin(x / 9) * 0.4;

describe('planLots', () => {
  it('is deterministic per seed and varies with the seed', () => {
    const a = planLots(block, { seed: 3, wealth: 0.4, density: 0.7 });
    const b = planLots(block, { seed: 3, wealth: 0.4, density: 0.7 });
    const c = planLots(block, { seed: 4, wealth: 0.4, density: 0.7 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
    expect(a.length).toBeGreaterThan(4);
  });

  it('keeps lots inside the block and apart from each other', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const wealth of [0.1, 0.5, 0.9]) {
        const lots = planLots(block, { seed, wealth, density: 0.8, allowHorrea: true }).filter((l) => l.kind !== 'alley');
        for (const l of lots) expect(polygonContainsOBB(block, l.obb)).toBe(true);
        for (let i = 0; i < lots.length; i++)
          for (let j = i + 1; j < lots.length; j++) expect(obbOverlap(lots[i].obb, lots[j].obb, 0.05)).toBe(false);
      }
    }
  });

  it('only fronts the requested edges, also for clockwise input', () => {
    const cw: Polygon = [...block].reverse(); // edges now: (0,45)->(70,45) is index 0 … caller's order
    // Caller's edge 2 of the clockwise polygon runs (70,0) -> (0,0): the z = 0 side.
    const lots = planLots(cw, { seed: 2, frontEdges: [2] }).filter((l) => l.kind !== 'alley');
    expect(lots.length).toBeGreaterThan(1);
    for (const l of lots) {
      const zs = obbCorners(l.obb).map((p) => p[1]);
      expect(Math.min(...zs)).toBeCloseTo(0, 5);
    }
  });

  it('respects avoid polygons', () => {
    const avoid: Polygon = [[20, -1], [50, -1], [50, 20], [20, 20]];
    const lots = planLots(block, { seed: 7, avoid: [avoid], density: 1 });
    for (const l of lots) for (const p of obbCorners(l.obb)) expect(pointInPolygon(p, avoid) && l.kind !== 'alley').toBe(false);
  });

  it('marks party walls between adjacent lots', () => {
    const lots = planLots(block, { seed: 5, density: 1, wealth: 0.2 }).filter((l) => l.kind === 'insula');
    expect(lots.some((l) => l.party.left || l.party.right)).toBe(true);
  });
});

describe('fillBlock on sloping ground', () => {
  const r = fillBlock(block, { heightAt: slope, seed: 9, wealth: 0.5, density: 0.8, sidewalkHeight: 0.3, id: 'T:' });

  it('puts every floor at or above the sidewalk along its frontage', () => {
    for (const l of r.lots) {
      if (l.kind === 'alley' || l.kind === 'piazza') continue;
      const [a, b] = [obbCorners(l.obb)[0], obbCorners(l.obb)[1]]; // front corners (−v side)
      for (let t = 0; t <= 1; t += 0.25) {
        const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
        // The filler samples 0.4 m outside the lot; allow for the terrain gradient over that distance.
        expect(l.floorY).toBeGreaterThanOrEqual(slope(x, z) + 0.3 - 0.05);
      }
    }
  });

  it('respects the 60-foot height limit', () => {
    for (const l of r.lots) expect(l.height).toBeLessThanOrEqual(MAX_BUILDING_HEIGHT + 1e-6);
  });

  it('returns uniquely named spots of several kinds', () => {
    const ids = new Set(r.spots.map((s) => s.id));
    expect(ids.size).toBe(r.spots.length);
    for (const s of r.spots) expect(s.id.startsWith('T:')).toBe(true);
    const kinds = new Set(r.spots.map((s) => s.kind));
    expect(kinds.has('shopDoor')).toBe(true);
    expect(kinds.has('houseDoor')).toBe(true);
    for (const s of r.spots) expect(Number.isFinite(s.position.y) && Number.isFinite(s.facing)).toBe(true);
  });

  it('builds geometry and colliders', () => {
    const g = r.builder.build('t');
    expect(g.children.length).toBeGreaterThan(8);
    expect(r.builder.colliders.length).toBeGreaterThan(20);
  });
});
