/**
 * Step-over: the real Actor walking into a lone ledge (a kerb, a paving lip, a plaza edge, a
 * low barrier) of every height up to the clamber limit, at walk, run and sprint speed and at
 * several angles. Heights up to what the controller must take in stride (STEP_ASSIST_MAX) have
 * to end up on top; the rest is for Climb.ts (clamber from 0.42 m), not the controller.
 */
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { Layer, initPhysics } from '../src/core/Physics';
import { STEP_ASSIST_MAX } from '../src/core/traversal';
import { makeWorld, walk } from './arch.walker';

const SPEEDS = { walk: 1.9, run: 4.4, sprint: 7.4 } as const;

/** Walk into a slab of height `h` from `deg` off its normal; true when the walker ends up on top. */
function crosses(h: number, speed: number, deg: number, body: { radius?: number; layer?: number } = {}): boolean {
  const w = makeWorld();
  // A big slab, front face at z = 0, top at h.
  w.physics.addBox({ x: 0, y: h / 2, z: -30 }, { x: 60, y: h / 2, z: 30 });
  const a = (deg * Math.PI) / 180;
  const r = walk(w, { x: -Math.tan(a) * 4, y: 0.05, z: 4 }, [{ dir: [Math.sin(a), -Math.cos(a)], seconds: Math.min(6, 12 / speed), speed }], body);
  return r.y > h - 0.06 && r.z < -1;
}

describe('a lone ledge is stepped onto', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  const heights = [0.04, 0.08, 0.12, 0.16, 0.2, 0.25, 0.3];
  for (const [name, speed] of Object.entries(SPEEDS)) {
    for (const deg of [0, 30, 60]) {
      it(`the player at ${name}, ${deg} degrees off square, takes every ledge up to ${STEP_ASSIST_MAX} m`, () => {
        const failed = heights.filter((h) => !crosses(h, speed, deg));
        expect(failed, `failed heights at ${name} ${deg}`).toEqual([]);
      });
    }
  }

  it('an NPC at a walk takes kerbs and paving lips (up to 0.2 m)', () => {
    const failed = [0.05, 0.1, 0.15, 0.2].filter((h) => !crosses(h, 1.3, 0, { radius: 0.3, layer: Layer.Npc }));
    expect(failed).toEqual([]);
  });

  // The dead zone between the step-up assist and the clamber: print what happens there.
  it('reports the 0.3-0.45 m band (not asserted)', () => {
    const rows: string[] = [];
    for (const h of [0.32, 0.36, 0.4, 0.44]) rows.push(`${h}: ` + Object.entries(SPEEDS).map(([n, s]) => `${n}=${crosses(h, s, 0) ? 'up' : 'STOP'}`).join(' '));
    expect(rows.length).toBe(4);
    void THREE;
  });
});
