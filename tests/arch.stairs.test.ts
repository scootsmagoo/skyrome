/**
 * The character controller must be able to walk up the kit's stairs (temple podia, cavea
 * aisles). Mirrors Actor.locomote: horizontal wish speed, −2 m/s while grounded, gravity in air.
 */
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { cavea } from '../src/arch/classical/amphitheatre';
import { stairs } from '../src/arch/common/stairs';
import { Physics, initPhysics } from '../src/core/Physics';
import { MeshBuilder } from '../src/gfx/MeshBuilder';

function addColliders(p: Physics, b: MeshBuilder) {
  for (const c of b.colliders) {
    if (c.kind === 'box') p.addOrientedBox(c.center, c.half, c.rotation ?? new THREE.Quaternion());
    else if (c.kind === 'cylinder') p.addCylinder(c.center, c.halfHeight, c.radius);
  }
}

/** Walk along `dir` (default +z) with Actor.locomote's rules (acceleration, airborne wall bleed, ground press). */
function walk(p: Physics, start: THREE.Vector3, speed: number, seconds: number, dir = new THREE.Vector3(0, 0, 1)) {
  const ch = p.createCharacter(start);
  const dt = 1 / 60;
  const v = new THREE.Vector3();
  let grounded = false;
  const k = 1 - Math.exp(-14 * dt);
  let maxY = -Infinity;
  for (let i = 0; i < seconds * 60; i++) {
    const accel = grounded ? k : 1 - Math.exp(-2.5 * dt);
    v.z += (speed * dir.z - v.z) * accel;
    v.x += (speed * dir.x - v.x) * accel;
    if (grounded) v.y = -2;
    else v.y = Math.max(v.y - 20 * dt, -55);
    const desired = { x: v.x * dt, y: v.y * dt, z: v.z * dt };
    ch.controller.computeColliderMovement(ch.collider, desired);
    const mv = ch.controller.computedMovement();
    grounded = ch.controller.computedGrounded();
    // Actor only bleeds blocked velocity while airborne (grounded bleeding stalls autostep).
    if (!grounded) {
      const ax = mv.x / dt;
      const az = mv.z / dt;
      if (Math.abs(ax) < Math.abs(v.x) * 0.5) v.x = ax;
      if (Math.abs(az) < Math.abs(v.z) * 0.5) v.z = az;
    }
    const t = ch.body.translation();
    ch.body.setNextKinematicTranslation({ x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z });
    p.step(dt);
    maxY = Math.max(maxY, t.y + mv.y - ch.halfHeight - ch.radius);
  }
  const t = ch.body.translation();
  return { y: t.y - ch.halfHeight - ch.radius, z: t.z, x: t.x, maxY };
}

describe('stairs are walkable', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  for (const mode of ['steps', 'ramp'] as const) {
    it(`climbs a 13-step temple flight (${mode} colliders)`, () => {
      const p = new Physics();
      p.addBox({ x: 0, y: -0.5, z: 0 }, { x: 50, y: 0.5, z: 50 });
      const b = new MeshBuilder();
      const s = stairs(b, { width: 6, rise: 0.228, run: 0.34, count: 13, collider: mode });
      // landing on top
      b.box('travertine', 6, s.height, 30, new THREE.Matrix4().makeTranslation(0, s.height / 2, s.depth + 15), { collide: true });
      addColliders(p, b);
      p.step(1 / 60);
      const r = walk(p, new THREE.Vector3(0, 0.05, -2), 4.4, 4);
      expect(r.z).toBeGreaterThan(s.depth + 0.5);
      expect(r.y).toBeCloseTo(s.height, 1);
    });
  }

  it('climbs the cavea by its aisles (half-height steps), not over the 0.4 m seat rows', () => {
    const p = new Physics();
    p.addBox({ x: 0, y: -0.5, z: 0 }, { x: 80, y: 0.5, z: 80 });
    const b = new MeshBuilder();
    const c = cavea(b, { arenaRx: 20, arenaRz: 14, podium: 2.4, tiers: [{ rows: 6, rise: 0.4, depth: 0.7 }, { rows: 4, rise: 0.4, depth: 0.7, wall: 1.2 }], segments: 64, aisles: 8, topWalk: 3 });
    addColliders(p, b);
    p.step(1 / 60);
    // t = 0 is an aisle (equal-arc split starts there): walk radially outward along +x
    const up = walk(p, new THREE.Vector3(20 + 1.2, 2.45, 0), 3, 16, new THREE.Vector3(1, 0, 0));
    expect(up.maxY).toBeCloseTo(c.height, 0);
    // away from the aisles the rows are a wall for the character (it stays on the walkway)
    const rx = 20 * Math.cos(0.2);
    const blocked = walk(p, new THREE.Vector3(rx + 1.2 * Math.cos(0.2), 2.45, 14 * Math.sin(0.2) + 1.2 * Math.sin(0.2)), 3, 3, new THREE.Vector3(Math.cos(0.2), 0, Math.sin(0.2)).normalize());
    expect(blocked.maxY).toBeLessThan(2.6);
  });
});
