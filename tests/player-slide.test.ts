/**
 * A body pushed into a wall at an angle slides along it (Actor.locomote): the per-axis bleed of the
 * blocked velocity used to zero the component that ran against the slide and stop the player dead
 * on any wall that was not axis-aligned.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics } from '../src/core/Physics';
import { makeWorld, walk } from './arch.walker';

describe('sliding along oblique walls', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  // A long wall turned `wall` radians about y; the walker pushes at `ang` from its normal, at a jog.
  function slide(wall: number, ang: number) {
    const w = makeWorld();
    w.physics.addBox({ x: 0, y: 2, z: 6 }, { x: 40, y: 2, z: 0.4 }, wall);
    // The wall's normal (its local z) and tangent (local x) in the world.
    const n = { x: Math.sin(wall), z: Math.cos(wall) };
    const t = { x: Math.cos(wall), z: -Math.sin(wall) };
    const dir = [n.x * Math.cos(ang) + t.x * Math.sin(ang), n.z * Math.cos(ang) + t.z * Math.sin(ang)] as [number, number];
    const r = walk(w, { x: -n.x * 3 - 0.2, y: 0.05, z: 6 - n.z * 3 }, [{ dir, seconds: 3 }]);
    return { speed: r.speed, tangential: Math.abs(r.actor.velocity.x * t.x + r.actor.velocity.z * t.z) };
  }

  it('keeps the slide on walls at 20, 35 and 50 degrees (23 degrees off the normal)', () => {
    for (const wall of [0.35, 0.6, 0.87]) {
      const r = slide(wall, 0.4);
      // Ideal slide: 4.4 sin(0.4) = 1.71 m/s along the wall.
      expect(r.tangential, `wall ${wall}`).toBeGreaterThan(1.2);
    }
  });

  it('a straight push into a wall still comes to rest', () => {
    expect(slide(0.6, 0).speed).toBeLessThan(0.6);
  });
});
