/**
 * Phase 4b FABRIC: buildings, massing, walls and props meet the ground (docs/design/solid-ground.md §4).
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { bayFloor, foundationLevel, outlineMin, rectMax, runMin } from '../src/arch/fabric/foundation';
import { insula } from '../src/arch/fabric/insula';
import { domus } from '../src/arch/fabric/domus';
import { groundProp } from '../src/arch/props/ground';
import { edgeGround, massBase } from '../src/world/city/massing';

// A hillside with a dip between the corners: the old seven-sample foundation missed it.
const dip = (x: number, z: number) => -0.05 * (x + 10) - (Math.abs(x - 4) < 1 && z < -4 ? 1.2 : 0);

describe('foundation sampling', () => {
  it('finds the dip between the corners along the outline', () => {
    const seven = Math.min(0, ...[[-10, -7], [10, -7], [10, 7], [-10, 7], [0, 0], [0, -7], [0, 7]].map(([x, z]) => dip(x, z)));
    expect(outlineMin(dip, 20, 14)).toBeLessThan(seven - 0.8);
    expect(foundationLevel(dip, 20, 14)).toBeLessThanOrEqual(outlineMin(dip, 20, 14) - 0.5);
  });

  it('samples the outline just outside the wall too', () => {
    const ring = (x: number, z: number) => (Math.abs(x) > 10.2 || Math.abs(z) > 7.2 ? -2 : 0);
    expect(outlineMin(ring, 20, 14)).toBe(-2);
  });

  it('bay floor: the highest of the jambs and the room, open only within a step', () => {
    const flat = bayFloor(() => 0, -1.5, 1.5, -7, 3, -3, 1);
    expect(flat.y).toBe(0);
    expect(flat.open).toBe(true);
    // The pavement rises 0.25 m across the opening: the floor takes the high jamb, the step is small.
    const rising = bayFloor((x) => 0.25 * ((x + 1.5) / 3) - 0.25, -1.5, 1.5, -7, 3, -3, 1);
    expect(rising.y).toBeCloseTo(0, 2);
    expect(rising.low).toBeCloseTo(-0.25, 2);
    expect(rising.open).toBe(true);
    // The hill is 0.8 m up inside the room: the floor rises to it and the shop closes.
    const hill = bayFloor((_x, z) => (z > -7 ? 0.8 : 0), -1.5, 1.5, -7, 3, -3, 1);
    expect(hill.y).toBeCloseTo(0.8, 2);
    expect(hill.open).toBe(false);
    // A pavement falling a metre along the opening: closed.
    const falling = bayFloor((x) => -1 * ((x + 1.5) / 3), -1.5, 1.5, -7, 3, -3, 1);
    expect(falling.open).toBe(false);
  });

  it('rect and run helpers see every sample', () => {
    expect(rectMax((x, z) => x + z, 0, 2, 0, 3)).toBe(5);
    const r = runMin((x, z) => x - z, 0, 0, 4, 0, 1);
    expect(r.min).toBe(-1);
    expect(r.max).toBe(5);
  });
});

describe('generators on a dipping hillside', () => {
  const lowest = (g: THREE.Group) => new THREE.Box3().setFromObject(g).min.y;
  it('insula and domus foundations reach under the dip', () => {
    const i = insula({ width: 20, depth: 14, seed: 7, groundAt: dip });
    expect(lowest(i.builder.build('i'))).toBeLessThan(outlineMin(dip, 20, 14) - 0.4);
    const d = domus({ width: 18, depth: 30, seed: 3, groundAt: dip });
    expect(lowest(d.builder.build('d'))).toBeLessThan(outlineMin(dip, 18, 30) - 0.4);
  });

  it('every open shop door stands within a step of the pavement at its jambs', () => {
    const slope = (x: number, z: number) => 0.09 * (x + 10) * (z < -6.9 ? 1 : 1) - 1.8;
    const a = insula({ width: 20, depth: 14, seed: 11, openShopChance: 1, groundAt: slope });
    const doors = a.spots.filter((s) => s.kind === 'shopDoor');
    expect(doors.length).toBeGreaterThan(0);
    for (const s of doors) {
      // The spot is 0.6 m out at the floor level; the opening is ≤ 3.5 m wide, the pavement at both ends within 0.3 m below.
      for (const dx of [-1.75, 1.75]) expect(s.position.y - slope(s.position.x + dx, s.position.z)).toBeLessThanOrEqual(0.3 + 0.09 * 0.6 + 1e-6);
    }
  });

  it('levels agree on the bays (the same floors and closures at full, mid and low)', () => {
    const o = { width: 20, depth: 14, seed: 13, groundAt: dip } as const;
    const sig = (d: 'full' | 'mid' | 'low') => insula({ ...o, detail: d }).spots.map((s) => `${s.kind}:${s.tag}:${s.position.x.toFixed(2)}:${s.position.y.toFixed(2)}`);
    expect(sig('mid')).toEqual(sig('full'));
    expect(sig('low')).toEqual(sig('full'));
  });
});

describe('far massing base', () => {
  it('sits under the lowest edge sample by the margin plus the relief', () => {
    const obb = { c: [0, 0] as [number, number], u: [1, 0] as [number, number], v: [0, 1] as [number, number], hu: 8, hv: 6 };
    const H = (x: number, z: number) => 0.2 * x + (Math.abs(z) < 1 && x > 7.5 ? -0.9 : 0);
    const g = edgeGround(obb, H);
    expect(g.min).toBeLessThan(-1.6); // the notch on the right edge, 0.35 m out as well
    expect(massBase(g)).toBeLessThanOrEqual(g.min - 0.72);
  });
});

describe('props on steps', () => {
  it('report the fall across the footprint', () => {
    const g = groundProp((x) => (x > 0.2 ? 0.5 : 0), 0, 0, 0, { minX: -0.4, maxX: 0.4, minZ: -0.4, maxZ: 0.4 });
    expect(g.range).toBeCloseTo(0.5, 6);
    expect(groundProp(() => 1, 0, 0, 0, { minX: -0.4, maxX: 0.4, minZ: -0.4, maxZ: 0.4 }).range).toBe(0);
  });
});
