import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, Layer, Physics } from '../src/core/Physics';

/**
 * Physics.step drives rapier's pipeline directly (skipping World.step's per-step walk over every
 * collider). Colliders and bodies made or removed between steps must still behave.
 */
describe('Physics.step fast path', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('uses the direct pipeline step on this rapier version', () => {
    const w = new Physics().world as unknown as Record<string, unknown>;
    expect(typeof (w.physicsPipeline as { step?: unknown })?.step).toBe('function');
    expect('softBodies' in w).toBe(true);
  });

  it('sees colliders added and removed between steps, with their owners', () => {
    const physics = new Physics();
    physics.step(1 / 60);
    const owner = { id: 'wall' };
    const box = physics.addBox({ x: 0, y: 1, z: -5 }, { x: 2, y: 1, z: 0.5 }, 0, { owner });
    physics.step(1 / 60);
    const hit = physics.raycast({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, 20, Layer.World);
    expect(hit?.owner).toBe(owner);
    expect(hit?.distance).toBeCloseTo(4.5, 3);
    physics.removeCollider(box);
    physics.step(1 / 60);
    expect(physics.raycast({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, 20, Layer.World)).toBeNull();
  });

  it('moves a kinematic character and removes it cleanly', () => {
    const physics = new Physics();
    physics.addBox({ x: 0, y: -0.5, z: 0 }, { x: 20, y: 0.5, z: 20 });
    const c = physics.createCharacter({ x: 0, y: 0, z: 0 }, { layer: Layer.Npc, owner: 'npc' });
    physics.step(1 / 60);
    c.body.setNextKinematicTranslation({ x: 3, y: c.halfHeight + c.radius, z: 0 });
    physics.step(1 / 60);
    expect(c.body.translation().x).toBeCloseTo(3, 4);
    const hit = physics.raycast({ x: 3, y: 5, z: 0 }, { x: 0, y: -1, z: 0 }, 10, Layer.Npc);
    expect(hit?.owner).toBe('npc');
    physics.removeCharacter(c);
    physics.step(1 / 60);
    expect(physics.raycast({ x: 3, y: 5, z: 0 }, { x: 0, y: -1, z: 0 }, 10, Layer.Npc)).toBeNull();
  });
});
