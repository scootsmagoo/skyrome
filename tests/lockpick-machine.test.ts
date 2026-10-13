/**
 * The lockpicking minigame's rules (src/game/lockpick/machine.ts, GDD §14.3) with a fake clock: the
 * tests advance time by hand, so no frame rate is involved.
 */
import { describe, expect, it } from 'vitest';
import { LockMachine, meterAt, MIN_LIFT_S, type LockEvent } from '../src/game/lockpick/machine';
import { LOCK_TIERS, LOCKS, lockZoneWidth } from '../src/rpg/thievery';

const DT = 1 / 60;

/** Advance the fake clock by `s` seconds, collecting events. */
function wait(m: LockMachine, s: number): LockEvent[] {
  const out: LockEvent[] = [];
  for (let t = 0; t < s - 1e-9; t += DT) out.push(...m.advance(DT));
  return out;
}

/** Hold until the meter is inside the current zone, then let go. */
function liftIntoZone(m: LockMachine): LockEvent[] {
  m.press();
  for (let i = 0; i < 600 && !m.inZone; i++) m.advance(DT);
  expect(m.inZone).toBe(true);
  return m.release();
}

/** Hold briefly (past a tap), outside the zone, and let go. The zone must be near the top. */
function liftOutside(m: LockMachine): LockEvent[] {
  m.press();
  wait(m, MIN_LIFT_S + 0.05);
  expect(m.inZone).toBe(false);
  return m.release();
}

/** A lock whose zones sit at the top of the meter, away from where a short lift ends. */
const high = (o: Partial<ConstructorParameters<typeof LockMachine>[0]> = {}) =>
  new LockMachine({ tumblers: 3, zoneWidth: 0.2, picks: 1, rng: () => 1, ...o });

describe('the lift meter', () => {
  it('is a triangle wave from the bottom: up, then down, and again', () => {
    expect(meterAt(0)).toBe(0);
    expect(meterAt(0.25)).toBeCloseTo(0.5);
    expect(meterAt(0.5)).toBe(1);
    expect(meterAt(0.75)).toBeCloseTo(0.5);
    expect(meterAt(1)).toBeCloseTo(0);
    expect(meterAt(1.25)).toBeCloseTo(0.5);
  });

  it('oscillates at LOCKS.meterHz and rests at zero when nothing lifts', () => {
    const m = high();
    expect(m.meter).toBe(0);
    m.press();
    wait(m, 0.5 / LOCKS.meterHz);
    expect(m.meter).toBeCloseTo(1, 1);
    wait(m, 0.5 / LOCKS.meterHz);
    expect(m.meter).toBeCloseTo(0, 1);
    m.abortLift();
    expect(m.meter).toBe(0);
  });
});

describe('the zones', () => {
  it('place a zone for each tumbler inside the meter, off the very bottom', () => {
    for (const r of [0, 0.3, 0.999]) {
      const m = new LockMachine({ tumblers: 5, zoneWidth: 0.2, picks: 1, rng: () => r });
      expect(m.zones).toHaveLength(5);
      for (const [lo, hi] of m.zones.map((z) => [z, z + 0.2])) {
        expect(lo).toBeGreaterThanOrEqual(0.12 - 1e-9);
        expect(hi).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it('follow the tier: tumblers and the width from the rules', () => {
    const luck = { skillLevel: () => 0, modifier: () => 0 };
    for (const tier of Object.keys(LOCK_TIERS) as (keyof typeof LOCK_TIERS)[]) {
      const m = new LockMachine({ tumblers: LOCK_TIERS[tier].tumblers, zoneWidth: lockZoneWidth(tier, luck), picks: 1 });
      expect(m.tumblers).toBe(LOCK_TIERS[tier].tumblers);
      expect(m.zoneWidth).toBeCloseTo(LOCKS.zone * LOCK_TIERS[tier].factor);
    }
  });

  it('keep a very wide zone on the meter', () => {
    const m = new LockMachine({ tumblers: 2, zoneWidth: 0.9, picks: 1, rng: () => 1 });
    const z = m.zone()!;
    expect(z[1]).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe('setting tumblers', () => {
  it('a release inside the zone sets the tumbler and moves on to the next', () => {
    const m = high();
    expect(m.current).toBe(0);
    const ev = liftIntoZone(m);
    expect(ev).toEqual([{ type: 'set', index: 0 }]);
    expect(m.set).toEqual([true, false, false]);
    expect(m.current).toBe(1);
    expect(m.strain).toBe(0);
  });

  it('reports the moment the meter enters the zone, once per pass', () => {
    const m = high();
    m.press();
    const enters = wait(m, 0.5 / LOCKS.meterHz).filter((e) => e.type === 'enterZone');
    expect(enters).toHaveLength(1);
  });

  it('a release outside the zone adds strain and sets nothing', () => {
    const m = high();
    expect(liftOutside(m)).toEqual([{ type: 'strain', strain: 1 }]);
    expect(m.setCount).toBe(0);
    expect(m.phase).toBe('picking');
  });

  it('a tap shorter than a lift costs nothing', () => {
    const m = high();
    m.press();
    wait(m, MIN_LIFT_S / 2);
    expect(m.release()).toEqual([]);
    expect(m.strain).toBe(0);
  });

  it('a release with nothing lifting does nothing, and so does a second press', () => {
    const m = high();
    expect(m.release()).toEqual([]);
    expect(m.press()).toBe(true);
    expect(m.press()).toBe(false);
  });

  it('an aborted lift (focus lost) neither sets nor strains', () => {
    const m = high();
    m.press();
    wait(m, 0.3);
    m.abortLift();
    expect(m.release()).toEqual([]);
    expect(m.strain).toBe(0);
    expect(m.setCount).toBe(0);
  });
});

describe('the bolt', () => {
  it('cannot slide until every tumbler is set', () => {
    const m = high({ tumblers: 2 });
    expect(m.slide()).toEqual([]);
    liftIntoZone(m);
    expect(m.slide()).toEqual([]);
    expect(m.phase).toBe('picking');
  });

  it('slides when all are set, and that opens the lock', () => {
    const m = high({ tumblers: 2 });
    liftIntoZone(m);
    const last = liftIntoZone(m);
    expect(last).toEqual([{ type: 'set', index: 1 }, { type: 'bolt' }]);
    expect(m.phase).toBe('bolt');
    expect(m.press()).toBe(false); // no more lifting
    expect(m.slide()).toEqual([{ type: 'opened' }]);
    expect(m.result).toBe('opened');
    expect(m.done).toBe(true);
  });
});

describe('strain and the pick', () => {
  it('three strain snaps the pick; with a spare the player may go on, tumblers set stay set', () => {
    const m = high({ picks: 2 });
    liftIntoZone(m);
    liftOutside(m);
    liftOutside(m);
    expect(m.strain).toBe(2);
    expect(liftOutside(m)).toEqual([{ type: 'strain', strain: 3 }, { type: 'snap', picksLeft: 1 }]);
    expect(m.phase).toBe('snapped');
    expect(m.picks).toBe(1);
    expect(m.press()).toBe(false); // nothing lifts with a broken pick
    expect(m.newPick()).toEqual([{ type: 'newpick', picksLeft: 1 }]);
    expect(m.phase).toBe('picking');
    expect(m.strain).toBe(0);
    expect(m.set).toEqual([true, false, false]);
    expect(m.current).toBe(1);
    expect(m.result).toBeNull();
  });

  it('the last pick snapping ends it as broken', () => {
    const m = high({ picks: 1 });
    liftOutside(m);
    liftOutside(m);
    const ev = liftOutside(m);
    expect(ev).toEqual([{ type: 'strain', strain: 3 }, { type: 'snap', picksLeft: 0 }, { type: 'broken' }]);
    expect(m.result).toBe('broken');
    expect(m.newPick()).toEqual([]);
  });

  it('strain does not carry over from a snapped pick but a lock can be opened with the second', () => {
    const m = high({ tumblers: 1, picks: 2 });
    liftOutside(m);
    liftOutside(m);
    liftOutside(m);
    m.newPick();
    liftIntoZone(m);
    expect(m.slide()).toEqual([{ type: 'opened' }]);
  });
});

describe('leaving', () => {
  it('cancel ends it as cancelled from any live state, once', () => {
    const m = high();
    m.press();
    expect(m.cancel()).toEqual([{ type: 'cancelled' }]);
    expect(m.result).toBe('cancelled');
    expect(m.cancel()).toEqual([]);
    expect(m.press()).toBe(false);
  });

  it('cannot cancel an opened lock into something else', () => {
    const m = high({ tumblers: 1 });
    liftIntoZone(m);
    m.slide();
    expect(m.cancel()).toEqual([]);
    expect(m.result).toBe('opened');
  });
});
