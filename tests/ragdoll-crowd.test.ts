/**
 * Ragdolls among standing people (src/physics/ragdoll): the hand-made contact with their
 * capsules, and the stumble (a body held on its feet, tethered to the walking capsule).
 */
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { Physics, initPhysics } from '../src/core/Physics';
import { createHumanoid } from '../src/actors/avatar/HumanoidAvatar';
import { randomAppearance } from '../src/actors/avatar/variants';
import { Rng } from '../src/core/Rng';
import { Ragdoll } from '../src/physics/ragdoll/Ragdoll';

function setup(strength: number, push?: THREE.Vector3, magnitude = 40) {
  const p = new Physics();
  p.world.integrationParameters.numSolverIterations = 8;
  p.addBox({ x: 0, y: -0.5, z: 0 }, { x: 20, y: 0.5, z: 20 });
  const av = createHumanoid(randomAppearance(new Rng(3), 'plebeian-man'));
  av.root.position.set(0, 0, 0);
  av.root.updateMatrixWorld(true);
  const rag = new Ragdoll(p, av, { x: 0, y: 0, z: 0 });
  rag.strength = strength;
  rag.readTargets();
  if (push) rag.impulse(rag.pelvis().add(new THREE.Vector3(0, 0.5, 0)), push, magnitude);
  return { p, av, rag };
}

/** The fixed step as the system runs it: sample, the caller's forces, drive, step. */
function run(p: Physics, rag: Ragdoll, seconds: number, step: () => void) {
  for (let i = 0; i < seconds * 60; i++) {
    rag.sample();
    step();
    rag.drive(1 / 60);
    p.step(1 / 60);
  }
  rag.sample();
}

describe('ragdoll among people', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('a body thrown at a standing person is stopped by them: never inside, never exploding', () => {
    const out = new THREE.Vector3();
    const measure = (person: boolean) => {
      const { p, rag } = setup(0, new THREE.Vector3(1, 0.1, 0), 120);
      let fastest = 0;
      let deepest = 0;
      run(p, rag, 3, () => {
        if (person) rag.collideCapsule(1.0, 0, 0, 1.75, 0.32, 0, 0, out);
        for (const s of rag.segs) {
          const v = s.body.linvel();
          fastest = Math.max(fastest, Math.hypot(v.x, v.y, v.z));
          if (s.currP.y < 1.7) deepest = Math.max(deepest, 0.32 - Math.hypot(s.currP.x - 1.0, s.currP.z));
        }
      });
      return { rag, fastest, deepest };
    };
    const free = measure(false);
    const { rag, fastest, deepest } = measure(true);
    // The throw alone makes the limbs fast; meeting a person adds nothing to that.
    expect(fastest).toBeLessThan(free.fastest * 1.15 + 1);
    expect(free.deepest).toBeGreaterThan(0.15);
    expect(deepest).toBeLessThan(0.3);
    for (const s of rag.segs) expect(Number.isFinite(s.currP.x) && Number.isFinite(s.currP.y)).toBe(true);
  });

  it('the person hit feels the body against them (shoved on along the throw)', () => {
    const { p, rag } = setup(0, new THREE.Vector3(1, 0.1, 0), 120);
    const back = new THREE.Vector3();
    run(p, rag, 1.5, () => {
      rag.collideCapsule(1.0, 0, 0, 1.75, 0.32, 0, 0, back);
    });
    expect(back.x).toBeGreaterThan(0);
  });

  it('a body far from anyone is left alone', () => {
    const { p, rag } = setup(0, new THREE.Vector3(1, 0.1, 0));
    const back = new THREE.Vector3();
    let hit = false;
    run(p, rag, 1, () => {
      hit = rag.collideCapsule(9, 9, 0, 1.75, 0.32, 0, 0, back) || hit;
    });
    expect(hit).toBe(false);
    expect(back.lengthSq()).toBe(0);
  });

  it('a stumble stays on its feet: held up, tethered to the walking capsule', () => {
    const { p, rag } = setup(0.9, new THREE.Vector3(0, 0, 1), 40);
    rag.unload = 0.9;
    const start = rag.pelvis();
    // The capsule walks on at 1 m/s along +z while the shove lands.
    let z = 0;
    run(p, rag, 0.8, () => {
      z += 1 / 60;
      rag.tether(0, z, 0, 1, 0.35);
    });
    const at = rag.pelvis();
    expect(at.y).toBeGreaterThan(start.y - 0.35);
    expect(Math.hypot(at.x, at.z - z)).toBeLessThan(0.45);
  });
});
