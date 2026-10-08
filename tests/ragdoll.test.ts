import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { Physics, initPhysics } from '../src/core/Physics';
import { createHumanoid } from '../src/actors/avatar/HumanoidAvatar';
import { randomAppearance } from '../src/actors/avatar/variants';
import { Rng } from '../src/core/Rng';
import { Ragdoll } from '../src/physics/ragdoll/Ragdoll';

function setup(strength: number, push?: THREE.Vector3) {
  const p = new Physics();
  p.world.integrationParameters.numSolverIterations = 8;
  p.addBox({ x: 0, y: -0.5, z: 0 }, { x: 20, y: 0.5, z: 20 });
  const av = createHumanoid(randomAppearance(new Rng(3), 'plebeian-man'));
  av.root.position.set(0, 0, 0);
  av.root.updateMatrixWorld(true);
  const rag = new Ragdoll(p, av, { x: 0, y: 0, z: 0 });
  rag.strength = strength;
  rag.readTargets();
  if (push) rag.impulse(rag.pelvis().add(new THREE.Vector3(0, 0.5, 0)), push, 40);
  return { p, av, rag };
}

function run(p: Physics, rag: Ragdoll, seconds: number) {
  for (let i = 0; i < seconds * 60; i++) {
    rag.sample();
    rag.drive(1 / 60);
    p.step(1 / 60);
  }
  rag.sample();
}

describe('ragdoll', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('a limp body falls, lands on the ground and stays in one piece', () => {
    const { p, rag } = setup(0, new THREE.Vector3(0, 0, 1));
    run(p, rag, 3);
    const pelvis = rag.pelvis();
    expect(pelvis.y).toBeGreaterThan(0.03);
    expect(pelvis.y).toBeLessThan(0.45);
    for (const s of rag.segs) {
      expect(Number.isFinite(s.currP.x) && Number.isFinite(s.currP.y)).toBe(true);
      expect(s.currP.y).toBeGreaterThan(-0.05);
    }
    // Joints hold: every body is still near its parent (no limb flew off).
    for (const s of rag.segs) {
      if (s.parent < 0) continue;
      expect(s.currP.distanceTo(rag.segs[s.parent].currP)).toBeLessThan(0.75);
    }
    expect(rag.motion()).toBeLessThan(0.2);
  });

  it('knees and elbows only bend the way they bend', () => {
    const { p, rag } = setup(0, new THREE.Vector3(0, 0, -1));
    run(p, rag, 3);
    const rel = (child: number, parent: number) => {
      const q = rag.segs[parent].currQ.clone().invert().multiply(rag.segs[child].currQ);
      return new THREE.Euler().setFromQuaternion(q, 'XYZ').x;
    };
    // Segment indices: 9/11 shins (parents 8/10 thighs), 5/7 forearms (parents 4/6 upper arms).
    for (const [c, pa] of [[9, 8], [11, 10]]) expect(rel(c, pa)).toBeGreaterThan(-0.15);
    for (const [c, pa] of [[5, 4], [7, 6]]) expect(rel(c, pa)).toBeLessThan(0.15);
  });

  it('firm muscles hold the pose against gravity better than limp ones', () => {
    const limp = setup(0);
    const firm = setup(1);
    // Hold the pelvis still so only the joints matter.
    for (const r of [limp, firm]) r.rag.segs[0].body.setBodyType(2, true);
    run(limp.p, limp.rag, 1);
    run(firm.p, firm.rag, 1);
    const err = (r: typeof limp) => r.rag.segs.reduce((s, x) => s + 2 * Math.acos(Math.min(1, Math.abs(x.currQ.dot(x.target)))), 0);
    expect(err(firm)).toBeLessThan(err(limp) * 0.6);
  });
});
