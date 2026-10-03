import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, Physics, Layer } from '../src/core/Physics';

describe('Physics wrapper', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('heightfield follows heights[iz*(segX+1)+ix] layout', () => {
    const p = new Physics();
    // 2x2 cells over [0,20]x[0,10]; slope rises along +x only on the far-z row.
    const segX = 2, segZ = 2;
    const h = new Float32Array((segX + 1) * (segZ + 1));
    // height = x * 0.5 + z * 0 except row iz=2 adds 10
    for (let iz = 0; iz <= segZ; iz++)
      for (let ix = 0; ix <= segX; ix++) h[iz * (segX + 1) + ix] = ix * 5 + (iz === 2 ? 10 : 0);
    p.addHeightfield(0, 0, 20, 10, segX, segZ, h);
    p.step(1 / 60);
    // At grid vertex x=20 (ix=2), z=0 (iz=0): 10. At x=0,z=10 (iz=2): 10. At x=20,z=10: 20. At x=10,z=5: 5+5=10.
    expect(p.groundHeight(19.99, 0.01)).toBeCloseTo(10, 0);
    expect(p.groundHeight(0.01, 9.99)).toBeCloseTo(10, 0);
    expect(p.groundHeight(19.99, 9.99)).toBeCloseTo(20, 0);
    expect(p.groundHeight(0.01, 0.01)).toBeCloseTo(0, 0);
  });

  it('character controller walks over flat box and is grounded', () => {
    const p = new Physics();
    p.addBox({ x: 0, y: -0.5, z: 0 }, { x: 50, y: 0.5, z: 50 });
    const c = p.createCharacter({ x: 0, y: 0.2, z: 0 });
    p.step(1 / 60);
    let grounded = false;
    for (let i = 0; i < 30; i++) {
      c.controller.computeColliderMovement(c.collider, { x: 0.05, y: -0.2, z: 0 });
      const mv = c.controller.computedMovement();
      grounded = c.controller.computedGrounded();
      const t = c.body.translation();
      c.body.setNextKinematicTranslation({ x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z });
      p.step(1 / 60);
    }
    const t = c.body.translation();
    expect(grounded).toBe(true);
    expect(t.x).toBeGreaterThan(1.3);
    expect(t.y).toBeCloseTo(0.9, 1);
  });

  it('raycast reports owner and overlapSphere finds colliders', () => {
    const p = new Physics();
    const owner = { name: 'wall' };
    p.addBox({ x: 5, y: 1, z: 0 }, { x: 0.5, y: 1, z: 2 }, 0, { owner });
    p.step(1 / 60);
    const hit = p.raycast({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, 20, Layer.World);
    expect(hit?.owner).toBe(owner);
    expect(hit?.distance).toBeCloseTo(4.5, 2);
    expect(p.overlapSphere({ x: 4.2, y: 1, z: 0 }, 0.5).length).toBe(1);
  });
});
