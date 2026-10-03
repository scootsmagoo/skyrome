/**
 * Walkability of the Colosseum valley heroes with the real character controller (Rapier KCC):
 * the routes the player needs (plaza → arena sand, passages → boxes, vomitorium → first
 * balteus, Ludus court ↔ practice arena, the Ludus stands' stairs) and the walls that must stop
 * a fighter leaving the sand. Mirrors Actor.locomote's movement rules (see arch.stairs.test.ts).
 */
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { Physics, initPhysics } from '../src/core/Physics';
import type { ColliderSpec } from '../src/gfx/MeshBuilder';
import { builders as colosseum, COLOS, colosseumLayout } from '../src/world/landmarks/builders/colos-colosseum';
import { builders as ludus, LUDUS_ARENA, ludusReach, ludusTop } from '../src/world/landmarks/builders/colos-ludus';
import type { LandmarkContext } from '../src/world/landmarks/types';
import { MeshBuilder } from '../src/gfx/MeshBuilder';
import { Rng } from '../src/core/Rng';
import * as atlas from '../src/data/atlas';

function flatCtx(id: string): LandmarkContext {
  return {
    game: undefined as never,
    lm: atlas.LANDMARK_BY_ID[id] as never,
    S: 0.6,
    rng: new Rng(id),
    detail: 'high',
    builder: () => new MeshBuilder(),
    groundAt: () => 0,
  };
}

function world(colliders: ColliderSpec[]): Physics {
  const p = new Physics();
  p.addBox({ x: 0, y: -0.5, z: 0 }, { x: 200, y: 0.5, z: 200 });
  for (const c of colliders) {
    if (c.kind === 'box') p.addOrientedBox(c.center, c.half, c.rotation ?? new THREE.Quaternion());
    else if (c.kind === 'cylinder') p.addCylinder(c.center, c.halfHeight, c.radius);
    else p.addTrimesh(c.geometry, c.matrix);
  }
  p.step(1 / 60);
  return p;
}

/** Walk along `dir` with Actor.locomote's rules; optional jump every `jumpEvery` s. */
function walk(p: Physics, start: THREE.Vector3, speed: number, seconds: number, dir: THREE.Vector3, jumpEvery = 0) {
  const ch = p.createCharacter(start);
  const dt = 1 / 60;
  const v = new THREE.Vector3();
  const d = dir.clone().normalize();
  let grounded = false;
  const k = 1 - Math.exp(-14 * dt);
  let maxY = -Infinity;
  for (let i = 0; i < seconds * 60; i++) {
    const accel = grounded ? k : 1 - Math.exp(-2.5 * dt);
    v.x += (speed * d.x - v.x) * accel;
    v.z += (speed * d.z - v.z) * accel;
    if (grounded) v.y = jumpEvery && i % Math.round(jumpEvery * 60) === 0 ? 5.6 : -2;
    else v.y = Math.max(v.y - 20 * dt, -55);
    ch.controller.computeColliderMovement(ch.collider, { x: v.x * dt, y: v.y * dt, z: v.z * dt });
    const mv = ch.controller.computedMovement();
    grounded = ch.controller.computedGrounded();
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
  p.removeCharacter(ch);
  return { x: t.x, y: t.y - ch.halfHeight - ch.radius, z: t.z, maxY };
}

describe('Colosseum is walkable where it should be', () => {
  let p: Physics;
  beforeAll(async () => {
    await initPhysics();
    const out = colosseum[0].build(flatCtx('colosseum'));
    p = world(out.colliders);
  });

  it('Porta Triumphalis: from the west plaza along the long axis onto the arena sand', () => {
    const x0 = -(COLOS.arenaA + COLOS.xF + 8);
    const r = walk(p, new THREE.Vector3(x0, 0.05, 0), 4.4, 14, new THREE.Vector3(1, 0, 0));
    expect(r.x).toBeGreaterThan(-COLOS.arenaA + 2);
    expect(r.y).toBeLessThan(0.5);
  });

  it('Porta Libitinensis: from the arena out to the east plaza', () => {
    const r = walk(p, new THREE.Vector3(0, 0.05, 0), 4.4, 14, new THREE.Vector3(1, 0, 0));
    expect(r.x).toBeGreaterThan(COLOS.arenaA + COLOS.xF + 2);
  });

  it('the south passage and stair lead up into the imperial box on the podium', () => {
    const z0 = COLOS.arenaB + COLOS.xF + 6;
    const r = walk(p, new THREE.Vector3(0, 0.05, z0), 3.5, 16, new THREE.Vector3(0, 0, -1));
    expect(r.y).toBeGreaterThan(COLOS.podium - 0.2);
    expect(r.z).toBeLessThan(COLOS.arenaB + 6);
  });

  it('a vomitorium stair climbs from the inner ambulatory to the first balteus', () => {
    const L = colosseumLayout();
    const t = L.centres[10];
    const [nx, nz] = L.oval.normal(t);
    const [sx, sz] = L.oval.point(t, 23.4);
    const r = walk(p, new THREE.Vector3(sx, 0.05, sz), 3, 14, new THREE.Vector3(-nx, 0, -nz));
    const w1 = L.section.walks[1];
    expect(r.maxY).toBeGreaterThan(w1.y - 0.2);
  });

  it('the podium wall cannot be climbed from the sand (even jumping)', () => {
    const L = colosseumLayout();
    for (const t of [0.4, 1.2, 2.3, 4.0, 5.4]) {
      const [nx, nz] = L.oval.normal(t);
      const [sx, sz] = L.oval.point(t, -3);
      const r = walk(p, new THREE.Vector3(sx, 0.05, sz), 4.4, 4, new THREE.Vector3(nx, 0, nz), 0.7);
      expect(r.maxY, `t=${t}`).toBeLessThan(1.3);
    }
  });
});

describe('Ludus Magnus practice arena', () => {
  let p: Physics;
  let y0 = 0;
  beforeAll(async () => {
    await initPhysics();
    const out = ludus[0].build(flatCtx('ludus-magnus'));
    p = world(out.colliders);
    y0 = out.spots!.find((s) => s.id === 'ludus-arena-center')!.position.y - 0.06;
  });

  it('the front gate leads from the sand out into the court and back', () => {
    const A = LUDUS_ARENA;
    const out = walk(p, new THREE.Vector3(0, y0 + 0.05, 0), 4.4, 8, new THREE.Vector3(0, 0, -1));
    expect(out.z).toBeLessThan(-(A.b + ludusReach()) - 0.5);
    const back = walk(p, new THREE.Vector3(0, y0 + 0.05, -(A.b + ludusReach()) - 1.5), 4.4, 8, new THREE.Vector3(0, 0, 1));
    expect(back.z).toBeGreaterThan(-A.b + 1);
  });

  it('the arena wall stops a fighter everywhere else (walking and jumping)', () => {
    // (directions clear of the two gates on the long axis at ±π/2)
    for (const a of [0, 0.3, 0.9, 2.2, 3.0, Math.PI, 3.9, 5.5]) {
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const r = walk(p, new THREE.Vector3(0, y0 + 0.05, 0), 4.4, 7, dir, 0.6);
      const ex = r.x / LUDUS_ARENA.a;
      const ez = r.z / LUDUS_ARENA.b;
      expect(Math.hypot(ex, ez), `a=${a}`).toBeLessThan(1.02);
      expect(r.maxY - y0, `a=${a}`).toBeLessThan(1.3);
    }
  });

  it('external stairs reach the top walk of the stands', () => {
    // Find a stair by probing: walk inward from outside the stands at a diagonal until on top.
    const top = ludusTop();
    let best = -Infinity;
    for (const a of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
      const A = LUDUS_ARENA;
      const R = ludusReach();
      // Outer-ring point at parameter a and the tangent; try both climbing directions.
      const nx0 = Math.cos(a) / (A.a);
      const nz0 = Math.sin(a) / (A.b);
      const nl = Math.hypot(nx0, nz0);
      const nx = nx0 / nl;
      const nz = nz0 / nl;
      const px = A.a * Math.cos(a) + nx * (R + 0.75);
      const pz = A.b * Math.sin(a) + nz * (R + 0.75);
      for (const dir of [1, -1]) {
        const ux = -nz * dir;
        const uz = nx * dir;
        const start = new THREE.Vector3(px - ux * 10, y0 + 0.05, pz - uz * 10);
        const r = walk(p, start, 3.2, 8, new THREE.Vector3(ux, 0, uz));
        best = Math.max(best, r.maxY - y0);
      }
    }
    expect(best).toBeGreaterThan(top - 0.25);
  });
});
