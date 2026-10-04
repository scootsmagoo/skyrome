/**
 * Fighters and walls (src/ai/combat/pathing.ts, the core's acquire): a quest's ambushers notice the
 * player through a solid gate block and walk round it; an engaged fighter who loses sight finds the
 * way; a 1-vs-4 fight among walls leaves nobody stuck for more than 3 s (AC-22).
 */
import { describe, expect, it } from 'vitest';
import { NAV, PathFollower } from '../src/ai/combat/pathing';
import type { Combatant } from '../src/combat/Combatant';
import { combatProfileFor } from '../src/rpg/enemies';
import { addNpc, addPlayer, boxProbe, fakeEnv, makeCore, segmentHitsBox, wall, type Box } from './combat-fakes';

/** An env whose sight lines and steering probes see the boxes. */
function walledEnv(boxes: Box[]) {
  const env = fakeEnv();
  env.lineOfSight = (a, b) => !boxes.some((x) => segmentHitsBox(a.position.x, a.position.z, b.position.x, b.position.z, x, 0));
  env.nav = boxProbe(boxes);
  return env;
}

const thug = () => ({ ...combatProfileFor('thug', { kit: 0 }), health: 1000, yieldAt: 0, fleeAt: 0 });
const dist = (a: Combatant, b: Combatant) => Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);

/** Longest spell (s) a fighter spent trying to move without 0.35 m of progress, sampled every step. */
function stuckMeter() {
  const anchor = new Map<string, { x: number; z: number; at: number }>();
  let worst = 0;
  return {
    sample(now: number, cs: Combatant[], target: Combatant) {
      for (const c of cs) {
        const a = anchor.get(c.id);
        const p = c.position;
        // Standing within reach (or busy fighting) isn't being stuck.
        const content = dist(c, target) < 2.4 || !!c.action;
        if (!a || content || Math.hypot(p.x - a.x, p.z - a.z) >= NAV.progress) anchor.set(c.id, { x: p.x, z: p.z, at: now });
        else worst = Math.max(worst, now - a.at);
      }
    },
    get worst() {
      return worst;
    },
  };
}

describe('getting round walls (§6.13 approach, AC-22)', () => {
  it("a quest's ambusher behind a solid gate block notices the player and walks round it", () => {
    // The Porta Capena placeholder: a 6 m block between the fighters.
    const boxes: Box[] = [{ x0: -3, x1: 3, z0: 2.5, z1: 4 }];
    const core = makeCore(walledEnv(boxes));
    const p = addPlayer(core, { x: 0, z: 0 });
    const a = addNpc(core, 'grassator-a', thug(), { x: 0.5, z: 7, ai: true });
    wall(a, boxes);
    a.driven = true;
    core.setHostile('hostile', 'player');
    core.aggro.set(a.id, 18);
    core.hearing.set(a.id, 18);
    const meter = stuckMeter();
    let reachedAt = -1;
    for (let i = 0; i < 60 * 12 && reachedAt < 0; i++) {
      core.fixedStep(1 / 60);
      meter.sample(core.now, [a], p);
      if (dist(a, p) <= 2.2) reachedAt = core.now;
    }
    expect(a.target).toBe(p);
    expect(reachedAt, 'never reached the player').toBeGreaterThan(0);
    expect(reachedAt).toBeLessThan(8);
    expect(meter.worst).toBeLessThan(3);
  });

  it('without a hearing radius a fighter 7 m behind the block does not see the player (sight is honest)', () => {
    const boxes: Box[] = [{ x0: -3, x1: 3, z0: 2.5, z1: 4 }];
    const core = makeCore(walledEnv(boxes));
    addPlayer(core, { x: 0, z: 0 });
    const a = addNpc(core, 'thug', thug(), { x: 0.5, z: 7, ai: true });
    core.setHostile('hostile', 'player');
    core.aggro.set(a.id, 18);
    for (let i = 0; i < 60; i++) core.fixedStep(1 / 60);
    expect(a.target).toBeNull();
  });

  it('an engaged fighter who has lost sight of the player goes round the wall to find him', () => {
    const boxes: Box[] = [{ x0: -5, x1: 4, z0: 4, z1: 5 }];
    const core = makeCore(walledEnv(boxes));
    const p = addPlayer(core, { x: 5, z: -5 });
    const a = addNpc(core, 'thug', thug(), { x: 0, z: 10, ai: true });
    wall(a, boxes);
    core.engage(a, p);
    const meter = stuckMeter();
    let reached = false;
    for (let i = 0; i < 60 * 20 && !reached; i++) {
      core.fixedStep(1 / 60);
      meter.sample(core.now, [a], p);
      reached = dist(a, p) <= 2.2;
    }
    expect(reached).toBe(true);
    expect(meter.worst).toBeLessThan(3);
  });

  it('1 vs 4 among walls and a cart: everyone finds a way and nobody is stuck for more than 3 s (AC-22)', () => {
    // An L of walls and a cart round the player; three of the four start square behind one.
    const boxes: Box[] = [
      { x0: -4, x1: 4, z0: 3, z1: 4 },
      { x0: 3, x1: 4, z0: -4, z1: 3 },
      { x0: -1.2, x1: 1.2, z0: -4, z1: -3 },
    ];
    const env = walledEnv(boxes);
    const core = makeCore(env);
    const p = addPlayer(core, { x: 0, z: 0, health: 1e6 });
    const foes = [
      [0, 9],
      [8, 0],
      [0, -8],
      [-7, -1],
    ].map(([x, z], i) => {
      const c = addNpc(core, `g${i}`, thug(), { x, z, ai: true, rng: mulberry(i + 1) });
      wall(c, boxes);
      core.engage(c, p);
      return c;
    });
    const meter = stuckMeter();
    const seen = new Set<string>();
    for (let i = 0; i < 60 * 25; i++) {
      core.fixedStep(1 / 60);
      meter.sample(core.now, foes, p);
      if (core.now > 20) for (const f of foes) if (env.lineOfSight(f, p) && dist(f, p) < 6) seen.add(f.id);
    }
    expect(meter.worst).toBeLessThan(3);
    // Everyone came out from behind the walls into the fight (attacking or circling in the 3–5 m band).
    expect([...seen].sort()).toEqual(['g0', 'g1', 'g2', 'g3']);
    expect(core.worstStuck()?.seconds ?? 0).toBeLessThan(3);
  });

  it('the follower: a clear line leaves the wish alone; a wall turns it; being stuck sidesteps', () => {
    const boxes: Box[] = [{ x0: -2, x1: 2, z0: 1, z1: 2 }];
    const f = new PathFollower(boxProbe(boxes));
    const wish = { x: 0, z: 3 };
    f.steer({ now: 0, x: 5, y: 0, z: 0, radius: 0.35, goal: { x: 5, z: 6 }, wish, free: true });
    expect(wish).toEqual({ x: 0, z: 3 });
    expect(f.mode).toBe('clear');
    const w2 = { x: 0, z: 3 };
    f.steer({ now: 1, x: 0, y: 0, z: 0, radius: 0.35, goal: { x: 0, z: 6 }, wish: w2, free: true });
    expect(f.mode).toBe('follow');
    expect(Math.abs(w2.x)).toBeGreaterThan(0.5); // turned along the wall
    expect(Math.hypot(w2.x, w2.z)).toBeCloseTo(3, 5); // same speed
    // Pushing at the same spot for 1.5 s: stuck, then a sidestep.
    for (let t = 1; t < 3; t += 1 / 60) f.steer({ now: t, x: 0, y: 0, z: 0, radius: 0.35, goal: { x: 0, z: 6 }, wish: { x: 0, z: 3 }, free: true });
    expect(f.stuckCount).toBeGreaterThanOrEqual(1);
  });

  it('with a path service it follows the waypoints round the block', () => {
    const boxes: Box[] = [{ x0: -2, x1: 2, z0: 1, z1: 2 }];
    const f = new PathFollower({ ...boxProbe(boxes), findPath: () => [{ x: 3, z: 1.5 }, { x: 0, z: 6 }] });
    const wish = { x: 0, z: 2 };
    f.steer({ now: 0, x: 0, y: 0, z: 0, radius: 0.35, goal: { x: 0, z: 6 }, wish, free: true });
    expect(f.mode).toBe('path');
    expect(wish.x).toBeGreaterThan(1); // toward (3, 1.5)
  });
});

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
