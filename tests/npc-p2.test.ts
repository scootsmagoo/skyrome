/**
 * Physics follow-ups (P2): which falls break an amphora, what a stumble shakes loose, the load
 * budget per graphics tier, and the sounds a breakage plays.
 */
import { describe, expect, it } from 'vitest';
import { LOAD_BUDGET, MAX_LOADS, MAX_PIECES, SLIP_CHANCE, breaks } from '../src/npc/loads';
import { SOUNDS } from '../src/audio/bank';

describe('amphora breakage', () => {
  it('a fall from the head onto stone breaks it (most of the time)', () => {
    // About 5 m/s on landing, bouncing back at ~1.
    expect(breaks(5.2, 1, 0.1)).toBe(true);
    expect(breaks(5.2, 1, 0.7)).toBe(true);
    expect(breaks(5.2, 1, 0.95)).toBe(false);
  });

  it('a gentle landing or a slide does not break it', () => {
    expect(breaks(3, 0.2, 0)).toBe(false); // too slow to break
    expect(breaks(6, 5, 0)).toBe(false); // hardly slowed: a skid, not a landing
  });
});

describe('what a stumble shakes loose', () => {
  it('has a chance for every kind of load, below certainty', () => {
    for (const c of Object.values(SLIP_CHANCE)) {
      expect(c).toBeGreaterThan(0);
      expect(c).toBeLessThan(1);
    }
  });

  it('a tall load slips more readily than a sack on the back', () => {
    expect(SLIP_CHANCE.tray).toBeGreaterThan(SLIP_CHANCE.sack);
    expect(SLIP_CHANCE.basket).toBeGreaterThan(SLIP_CHANCE.sack);
  });
});

describe('load budget per tier', () => {
  it('shrinks with the tier and High is the full budget', () => {
    expect(LOAD_BUDGET.high.loads).toBe(MAX_LOADS);
    expect(LOAD_BUDGET.high.pieces).toBe(MAX_PIECES);
    for (const k of ['loads', 'pieces', 'stains'] as const) {
      expect(LOAD_BUDGET.low[k]).toBeLessThan(LOAD_BUDGET.medium[k]);
      expect(LOAD_BUDGET.medium[k]).toBeLessThan(LOAD_BUDGET.high[k]);
    }
  });
});

describe('the breakage sounds', () => {
  it('are in the bank', () => {
    for (const id of ['pot.break', 'wine.splash']) expect(SOUNDS.has(id)).toBe(true);
  });
});
