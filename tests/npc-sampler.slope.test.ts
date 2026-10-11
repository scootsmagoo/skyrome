/**
 * Steep terrain is no floor for the NPC planner (physicsSampler, NAV_MAX_SLOPE_DEG): the Palatine's bank above the
 * Via Nova (45 to 60 degrees) read as cells with the rises a flight of steps has, and paths ran along and up its foot.
 * Real Rapier: a heightfield with a gentle stretch and a bank, and a steep ramp collider (not terrain) beside it.
 */
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { PhysicsCellSampler } from '../src/ai/life/physicsSampler';
import type { CellSample } from '../src/ai/life/navgrid';
import { initPhysics, Physics } from '../src/core/Physics';

/**
 * Ground height: level to x = 0, then 0.3 m per m (17 degrees) to x = 10, then 1 m per m (45 degrees: a person still fits
 * standing there, so only the slope rule refuses it) to x = 16.
 */
const ground = (x: number) => (x < 0 ? 0 : x < 10 ? 0.3 * x : x < 16 ? 3 + (x - 10) : 9);

describe('the planner\'s floor on terrain', () => {
  let physics: Physics;
  beforeAll(async () => {
    await initPhysics();
    physics = new Physics();
    // Terrain from x -20..30, z 0..20 (0.5 m spacing, so the heightfield follows `ground` exactly at the knots).
    const segX = 100, segZ = 40;
    const h: number[] = [];
    for (let iz = 0; iz <= segZ; iz++) for (let ix = 0; ix <= segX; ix++) h.push(ground(-20 + ix * 0.5));
    physics.addHeightfield(-20, 0, 50, 20, segX, segZ, h);
    // A ramp of the same steepness that is not terrain (a stair's collider): x -10..-4, z 2..6, on level ground.
    const a = Math.atan(1);
    const len = 6 / Math.cos(a);
    physics.addOrientedBox({ x: -7, y: 3 - 0.1, z: 4 }, { x: len / 2, y: 0.1, z: 2 }, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, a)));
    physics.step(1 / 60);
  });

  const sampleAt = (s: PhysicsCellSampler, x: number, z: number) => {
    const out: CellSample = { h: NaN, walkable: false };
    s.sample(x, z, out);
    return out;
  };

  it('takes gentle terrain, refuses a bank steeper than the controller slides on, and leaves a steep collider to the clearance test', () => {
    const s = new PhysicsCellSampler(physics, { refHeight: (x) => ground(x) });
    expect(sampleAt(s, 5.5, 10.5).walkable).toBe(true);
    expect(sampleAt(s, 12.5, 10.5).walkable).toBe(false);
    expect(sampleAt(s, 12.5, 10.5).h).toBeCloseTo(ground(12.5), 1);
    expect(sampleAt(s, 25.5, 10.5).walkable).toBe(true);
    // The ramp's floor is its own collider, well above the reference ground: not judged as terrain.
    const r = sampleAt(s, -7.5, 4.5);
    expect(r.h).toBeGreaterThan(1);
    expect(r.walkable).toBe(true);
  });

  it('without reference heights (no terrain known) nothing is judged steep: the same bank cell is walkable', () => {
    const s = new PhysicsCellSampler(physics, { fallbackY: 3 });
    expect(sampleAt(s, 12.5, 10.5).walkable).toBe(true);
  });
});
