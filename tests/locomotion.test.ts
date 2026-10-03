import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { Actor } from '../src/actors/Actor';
import { initPhysics, Layer, Physics } from '../src/core/Physics';

/** Walk an actor north for `frames` fixed steps and report where it got to. */
function walk(build: (p: Physics) => void, frames = 300) {
  const physics = new Physics();
  physics.addBox({ x: 0, y: -0.5, z: 0 }, { x: 50, y: 0.5, z: 50 });
  build(physics);
  const game = { physics, scene: new THREE.Scene() } as any;
  const a = new Actor(game, { id: 'p', position: { x: 0, y: 0.05, z: 0 }, layer: Layer.Player });
  physics.step(1 / 60);
  let maxY = 0;
  for (let i = 0; i < frames; i++) {
    a.locomote({ x: 0, y: 0, z: -4.4 }, 1 / 60);
    physics.step(1 / 60);
    maxY = Math.max(maxY, a.position.y);
  }
  return { z: a.position.z, maxY };
}

describe('locomotion', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('climbs stairs with 0.2 m risers without jumping', () => {
    const r = walk((p) => {
      for (let i = 0; i < 10; i++) {
        const h = 0.2 * (i + 1);
        p.addBox({ x: 0, y: h / 2, z: -2 - i * 0.35 - 0.175 }, { x: 1.5, y: h / 2, z: 0.175 });
      }
    });
    expect(r.maxY).toBeGreaterThan(1.95);
  });

  it('walks onto a ramp that starts with a small lip', () => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.28, 0, 0));
    const r = walk((p) => p.addOrientedBox({ x: 0, y: 1.6, z: -12 }, { x: 2, y: 0.15, z: 6 }, q));
    expect(r.maxY).toBeGreaterThan(3);
  });

  it('is stopped by a wall', () => {
    const r = walk((p) => p.addBox({ x: 0, y: 2, z: -5 }, { x: 5, y: 2, z: 0.5 }));
    expect(r.z).toBeGreaterThan(-4.6);
  });
});
