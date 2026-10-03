import { describe, expect, it } from 'vitest';
import { buildHeightmap, footprintPolygon, signedDistance, type TerrainSource } from '../src/world/terrain/heightmap';
import { WORLD_SCALE } from '../src/world/coords';

const square = (cx: number, cz: number, r: number) => [[cx - r, cz - r], [cx + r, cz - r], [cx + r, cz + r], [cx - r, cz + r]] as const;

const src: TerrainSource = {
  BASE_ELEVATION: 15,
  HILLS: [{ id: 'h', outline: square(0, 0, 100), summit: 50, plateau: 45, slope: 60 }],
  LOWLANDS: [{ id: 'l', polygon: square(400, 0, 80), elevation: 10 }],
  RIVERS: [{ id: 'r', centerline: [[-400, -500], [-400, 500]], width: [100, 100], waterLevel: 6, bankHeight: 12 }],
  ISLANDS: [],
  ROADS: [{ id: 'road', points: [[150, -200], [150, 200]], width: 8 }],
  bounds: { minX: -500, maxX: 600, minZ: -300, maxZ: 300 },
};

describe('heightmap', () => {
  it('signed distance is negative inside', () => {
    expect(signedDistance(0, 0, square(0, 0, 10))).toBeCloseTo(-10);
    expect(signedDistance(20, 0, square(0, 0, 10))).toBeCloseTo(10);
  });
  it('builds hills, lowlands, river and leveled roads', () => {
    const hm = buildHeightmap(src, { spacing: 4, noise: 0, pads: [{ id: 'p', polygon: square(300, 150, 20), elevation: 20 }] });
    const S = WORLD_SCALE;
    const y = (x: number, z: number) => hm.heightAt(x * S, z * S) / S; // back to m ASL
    expect(y(0, 0)).toBeGreaterThan(48); // summit
    expect(y(-90, 0)).toBeGreaterThan(44); // plateau edge
    expect(y(250, -250)).toBeCloseTo(15, 0); // base
    expect(y(400, 0)).toBeCloseTo(10, 0); // lowland
    expect(y(-400, 0)).toBeLessThan(3); // river bed
    expect(y(300, 150)).toBeCloseTo(20, 1); // pad
    // Road leveled crosswise: both edges of the road roughly equal.
    expect(Math.abs(y(147, 100) - y(153, 100))).toBeLessThan(0.3);
    expect(hm.waterLevelY).toBeCloseTo(6 * S);
  });
  it('footprint rotation follows compass bearings', () => {
    // A rect 10 wide (x) by 40 deep (z) facing east (90°) should become long in x.
    const p = footprintPolygon([0, 0], 90, { kind: 'rect', w: 10, d: 40 });
    const xs = p.map((q) => q[0]);
    const zs = p.map((q) => q[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(40);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(10);
  });
});
