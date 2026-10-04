import { describe, expect, it } from 'vitest';
import { WORLD_SCALE } from '../src/world/coords';
import { buildHeightmap, type TerrainSource } from '../src/world/terrain/heightmap';
import { chain, resolveQuays, type TerrainQuay } from '../src/world/terrain/riverbanks';
import { bodyAt, currentOf, makeWaterBodies } from '../src/world/water/bodies';
import { buildQuay, QUAY } from '../src/world/water/quays';
import { placeReeds } from '../src/world/water/reeds';
import { buildWaterSurface } from '../src/world/water/surfaceMesh';
import { floatVelocity, pushBackSpeed, SWIM_DEFAULTS } from '../src/world/water/swim';

const S = WORLD_SCALE;
// A river flowing south (+z), 100 m wide, with an island in it and a quay on its left (east) bank.
const river = { id: 'r', name: 'R', centerline: [[0, -600], [0, 600]] as [number, number][], width: [100, 100], waterLevel: 6, bankHeight: 10.5 };
const quay: TerrainQuay = { id: 'quay-test', name: 'Q', river: 'r', bank: 'left', from: [50, -100], to: [50, 100], top: 11, width: 12, gaps: [{ at: [50, 60], width: 8 }], confidence: 'high' };
const src: TerrainSource = {
  BASE_ELEVATION: 14,
  HILLS: [],
  LOWLANDS: [],
  RIVERS: [river],
  ISLANDS: [{ id: 'i', outline: [[-15, 250], [15, 250], [15, 330], [-15, 330]], elevation: 11 }],
  bounds: { minX: -300, maxX: 300, minZ: -500, maxZ: 500 },
};

describe('water', () => {
  const hm = buildHeightmap(src, { spacing: 2, noise: 0, quays: [quay] });
  const bodies = makeWaterBodies([river]);
  const b = bodies[0];

  it('bodies are in game space with a downstream current, fastest mid-channel', () => {
    expect(b.level).toBeCloseTo(6 * S);
    expect(b.width[0]).toBeCloseTo(100 * S);
    const mid = bodyAt(bodies, 0, 0)!;
    expect(mid).not.toBeNull();
    const c = currentOf(mid);
    expect(c.z).toBeGreaterThan(0.9); // flows south
    expect(Math.abs(c.x)).toBeLessThan(1e-6);
    const edge = currentOf(bodyAt(bodies, 29, 0)!);
    expect(edge.z).toBeLessThan(c.z * 0.2);
    expect(bodyAt(bodies, 60, 0)).toBeNull();
  });

  it('the surface covers the channel but not the island or dry land', () => {
    const data = buildWaterSurface(bodies, (x, z) => hm.heightAt(x, z), { minX: hm.minX, maxX: hm.maxX, minZ: hm.minZ, maxZ: hm.maxZ }, 4);
    expect(data.cells.r).toBeGreaterThan(200);
    const has = (x: number, z: number) => {
      for (let i = 0; i < data.index.length; i += 6) {
        const a = data.index[i] * 3, d = data.index[i + 2] * 3;
        const x0 = Math.min(data.positions[a], data.positions[d]), x1 = Math.max(data.positions[a], data.positions[d]);
        const z0 = Math.min(data.positions[a + 2], data.positions[d + 2]), z1 = Math.max(data.positions[a + 2], data.positions[d + 2]);
        if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return true;
      }
      return false;
    };
    expect(has(0, 0)).toBe(true);
    expect(has(0, 290 * S)).toBe(false); // island
    expect(has(80 * S, 0)).toBe(false); // dry bank
    for (let i = 1; i < data.positions.length; i += 3) expect(data.positions[i]).toBeCloseTo(6 * S);
  });

  it('quays: walkable stairs, colliders, an opening at the gap', () => {
    const rq = resolveQuays([quay], 'r', chain(river.centerline))[0];
    const q = buildQuay(river, rq, (x, z) => hm.heightAt(x, z), S);
    const rise = 11 * S + QUAY.coping - (6 * S + 0.25);
    const riser = rise / Math.ceil(rise / QUAY.riser);
    expect(riser).toBeLessThanOrEqual(0.22);
    expect(QUAY.tread).toBeGreaterThanOrEqual(0.3);
    expect(q.landings.length).toBeGreaterThanOrEqual(1);
    for (const l of q.landings) {
      expect(l.y).toBeCloseTo(6 * S + 0.25);
      expect(l.x).toBeGreaterThan(0); // on the east (left) bank
    }
    expect(q.colliders.length).toBeGreaterThan(50);
    const group = q.builder.build('q');
    const names = group.children.map((c) => c.name);
    expect(names.some((n) => n.includes('reticulatum'))).toBe(true);
    expect(names.some((n) => n.includes('black'))).toBe(true); // the outfall's dark mouth
  });

  it('reeds grow on the natural margin, never on the quay', () => {
    const spots = placeReeds(bodies, hm, { skip: [{ body: 'r', side: 1, s0: 500 * S, s1: 700 * S }], step: 2 });
    expect(spots.length).toBeGreaterThan(20);
    for (const s of spots) {
      const hw = hm.heightAt(s.x, s.z) - b.level;
      expect(hw).toBeGreaterThan(-0.4);
      expect(hw).toBeLessThan(0.95);
      const onQuayBank = s.x > 0 && s.z > -100 * S && s.z < 100 * S;
      expect(onQuayBank).toBe(false);
    }
  });

  it('swimming: float velocity and the mid-channel push back', () => {
    const t = SWIM_DEFAULTS;
    expect(pushBackSpeed(30, 30, t)).toBe(0); // at the bank
    expect(pushBackSpeed(0, 30, t)).toBeCloseTo(t.pushBack); // mid-channel
    expect(pushBackSpeed(0, 30, { ...t, crossable: true })).toBe(0);
    expect(pushBackSpeed(0, 30, t)).toBeGreaterThan(t.swimSprint); // can't cross, even sprinting
    // Below the float line → rise; above → sink (after gravity compensation).
    expect(floatVelocity(1, 2, 1 / 60) - 20 / 60).toBeGreaterThan(0);
    expect(floatVelocity(3, 2, 1 / 60) - 20 / 60).toBeLessThan(0);
  });
});
