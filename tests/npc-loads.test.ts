/**
 * Fallen loads (src/npc/loads.ts): the recover task's state machine, and the melee knockdown rule
 * (src/combat/knockdown.ts).
 */
import { describe, expect, it } from 'vitest';
import { floorsTarget, type KnockdownCase } from '../src/combat/knockdown';
import { isDetachable, newRecover, PICKUP_AT, PICKUP_TIME, REACH, RECOVER_TIMEOUT, recoverStep, type RecoverEvent } from '../src/npc/loads';

const DT = 1 / 60;

/** Run the task with the carrier at `dist` m (it closes at 1.4 m/s) until it ends; returns events and time. */
function run(opts: { dist: number; presentUntil?: number; stalledAt?: number; limit?: number }) {
  const s = newRecover();
  let dist = opts.dist;
  const events: [number, RecoverEvent][] = [];
  let t = 0;
  while (s.phase !== 'done' && s.phase !== 'giveup' && t < (opts.limit ?? 120)) {
    const stalled = opts.stalledAt !== undefined && t >= opts.stalledAt;
    if (s.phase === 'walk' && !stalled) dist = Math.max(0, dist - 1.4 * DT);
    const ev = recoverStep(s, DT, { dist, present: t < (opts.presentUntil ?? Infinity), stalled });
    if (ev !== 'none') events.push([t, ev]);
    t += DT;
  }
  return { s, events, t, dist };
}

describe('recover task', () => {
  it('walks to the load, crouches, grabs it once, and is done', () => {
    const { s, events, t } = run({ dist: 5 });
    expect(s.phase).toBe('done');
    expect(events.map((e) => e[1])).toEqual(['crouch', 'grab']);
    // Grab comes PICKUP_AT after the crouch begins, and the whole thing ends PICKUP_TIME after.
    const [crouchT] = events[0];
    expect(events[1][0] - crouchT).toBeGreaterThanOrEqual(PICKUP_AT - 0.03);
    expect(events[1][0] - crouchT).toBeLessThan(PICKUP_AT + 0.05);
    expect(t - crouchT).toBeGreaterThanOrEqual(PICKUP_TIME - 0.03);
  });

  it('crouches at once when the load is within reach', () => {
    const { events } = run({ dist: REACH * 0.5 });
    expect(events[0]).toEqual([0, 'crouch']);
  });

  it('gives up when the load is gone (budget, break, taken) before the grab', () => {
    const { s, events } = run({ dist: 6, presentUntil: 1 });
    expect(s.phase).toBe('giveup');
    expect(events.length).toBe(0);
    const late = run({ dist: 0.2, presentUntil: 0.4 });
    expect(late.s.phase).toBe('giveup');
    expect(late.s.grabbed).toBe(false);
  });

  it('finishes the grab even if the load is removed by the pickup itself', () => {
    const { s, events } = run({ dist: 0.2, presentUntil: PICKUP_AT + 0.01 });
    expect(events.map((e) => e[1])).toEqual(['crouch', 'grab']);
    expect(s.phase).toBe('done');
  });

  it('gives up when the way is blocked well short of it, but reaches from nearly there', () => {
    expect(run({ dist: 9, stalledAt: 1 }).s.phase).toBe('giveup');
    const near = run({ dist: REACH * 1.5, stalledAt: 0 });
    expect(near.events.map((e) => e[1])).toEqual(['crouch', 'grab']);
  });

  it('gives up after the timeout', () => {
    // A walker that never arrives.
    const s = newRecover();
    let t = 0;
    while (s.phase === 'walk' && t < RECOVER_TIMEOUT + 5) {
      recoverStep(s, DT, { dist: 30, present: true, stalled: false });
      t += DT;
    }
    expect(s.phase).toBe('giveup');
    expect(t).toBeGreaterThan(RECOVER_TIMEOUT - 0.1);
    expect(t).toBeLessThan(RECOVER_TIMEOUT + 0.1);
  });
});

describe('which loads fall', () => {
  it('head, back and chest loads fall; things in the hand do not', () => {
    for (const k of ['basket', 'amphora', 'sack', 'tray'] as const) expect(isDetachable(k)).toBe(true);
    for (const k of ['lantern', 'torch', 'scroll'] as const) expect(isDetachable(k)).toBe(false);
    expect(isDetachable(undefined)).toBe(false);
  });
});

describe('melee knockdown', () => {
  const blow = (o: Partial<KnockdownCase>): KnockdownCase => ({ heavy: true, blocked: false, poiseDamage: 45, poiseMax: 30, braced: false, boss: false, isPlayer: false, ...o });

  it('a heavy blow floors a thug or citizen, a light one never does', () => {
    expect(floorsTarget(blow({ poiseMax: 30 }))).toBe(true);
    expect(floorsTarget(blow({ poiseMax: 20, poiseDamage: 30 }))).toBe(true);
    expect(floorsTarget(blow({ heavy: false }))).toBe(false);
  });

  it('poise by tier: a gladius overhead (45) floors a thug but not a bruiser, soldier or champion', () => {
    expect(floorsTarget(blow({ poiseMax: 30 }))).toBe(true);
    expect(floorsTarget(blow({ poiseMax: 55 }))).toBe(false);
    expect(floorsTarget(blow({ poiseMax: 55, poiseDamage: 60 }))).toBe(true);
    expect(floorsTarget(blow({ poiseMax: 60 }))).toBe(false);
    expect(floorsTarget(blow({ poiseMax: 90 }))).toBe(false);
    // A maul does more.
    expect(floorsTarget(blow({ poiseMax: 70, poiseDamage: 75 }))).toBe(true);
  });

  it('not when blocked, braced, a boss or the player', () => {
    expect(floorsTarget(blow({ blocked: true }))).toBe(false);
    expect(floorsTarget(blow({ braced: true }))).toBe(false);
    expect(floorsTarget(blow({ boss: true }))).toBe(false);
    expect(floorsTarget(blow({ isPlayer: true }))).toBe(false);
  });
});
