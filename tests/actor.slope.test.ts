/**
 * Standing still on a hill: an actor on a slope it can walk up stays where it is (no creep, no
 * slide after a run uphill), and only a cliff slides. Drives the real Actor (tests/arch.walker.ts).
 */
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { SLOPE_WALK_MAX_DEG } from '../src/core/traversal';
import { initPhysics } from '../src/core/Physics';
import { makeWorld, walk } from './arch.walker';

/** A big ramp rising toward -z at `deg`, its top surface passing through the origin. */
function rampWorld(deg: number) {
  const w = makeWorld(false);
  const a = (deg * Math.PI) / 180;
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a);
  // Box top face normal (0,1,0) rotated; put the centre half a thickness below the surface.
  const n = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const c = n.clone().multiplyScalar(-0.5);
  w.physics.addOrientedBox({ x: c.x, y: c.y, z: c.z }, { x: 30, y: 0.5, z: 60 }, q);
  return w;
}

/** Run up the slope for `up` seconds, let go, and measure how far the actor drifts in the next 3 s. */
function driftAfterStop(deg: number): number {
  const w = rampWorld(deg);
  const r = walk(w, { x: 0, y: 0.1, z: 0 }, [{ dir: [0, -1], seconds: 1.5 }]);
  // Stand: locomote with no wish. The first second is the run coasting to a halt; measure the next 3.
  const wish = new THREE.Vector3();
  let a = r.actor.position.clone();
  for (let i = 0; i < 240; i++) {
    if (i === 60) a = r.actor.position.clone();
    r.actor.locomote(wish, 1 / 60);
    w.physics.step(1 / 60);
  }
  return r.actor.position.distanceTo(a);
}

describe('standing on a hill', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  for (const deg of [10, 25, 35, 45]) {
    it(`stays planted on a ${deg} degree slope after running up it`, () => {
      expect(deg).toBeLessThan(SLOPE_WALK_MAX_DEG);
      expect(driftAfterStop(deg)).toBeLessThan(0.05);
    });
  }

  it('slides on a cliff (steeper than the walkable limit)', () => {
    expect(driftAfterStop(62)).toBeGreaterThan(0.3);
  });
});
