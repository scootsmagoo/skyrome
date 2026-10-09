import { describe, expect, it } from 'vitest';
import type { Game } from '../src/core/Game';
import { Calendar, ordinalOf } from '../src/game/calendar';
import { todaysFestivals, templesShut } from '../src/content/director';
import { hoursUntil } from '../src/content/hours';

const MAY11 = ordinalOf(4, 11);

/** A game with a real calendar (and optionally the clock's own date, as without one). */
function gameWith(cal?: Calendar, clockDate = { month: 4, day: 11 }): Game {
  return { calendar: cal, time: { date: () => clockDate } } as unknown as Game;
}

describe('festivals read the calendar (mq-04 §3.10)', () => {
  it('on the third elapsed day, held on 11 May: the Lemuria is not shut, the eve is on', () => {
    const cal = new Calendar(113, MAY11, () => false, 0);
    cal.sync(2);
    expect(cal.clamp).toBe('mq-04-columna');
    expect(cal.date()).toEqual({ year: 113, month: 4, day: 11 });
    const game = gameWith(cal);
    expect(todaysFestivals(game)).toEqual(['fest-columna-eve']);
    expect(templesShut(game)).toBe(false);
  });

  it('on the first elapsed day, held on 11 May: the Lemuria shuts the temples and the eve is on', () => {
    const cal = new Calendar(113, MAY11, () => false, 0);
    const game = gameWith(cal);
    expect(todaysFestivals(game)).toEqual(['fest-lemuria', 'fest-columna-eve']);
    expect(templesShut(game)).toBe(true);
  });

  it('after stepToAnchor it is 12 May: the Column festival is active on that first day, not the eve', () => {
    const cal = new Calendar(113, MAY11, () => false, 0);
    expect(cal.stepToAnchor()).toBe(true);
    expect(cal.date()).toEqual({ year: 113, month: 4, day: 12 });
    const game = gameWith(cal);
    expect(cal.clamp).toBeNull();
    expect(todaysFestivals(game)).toEqual(['fest-columna']);
    expect(templesShut(game)).toBe(false);
    // The next elapsed day the calendar moves on to 13 May (the Lemuria), with no eve.
    cal.sync(1);
    expect(cal.date()).toEqual({ year: 113, month: 4, day: 13 });
    expect(todaysFestivals(game)).toEqual(['fest-lemuria']);
    expect(templesShut(game)).toBe(true);
  });

  it('without a calendar, falls back to the clock date (11 May: both ids; 12 May: none)', () => {
    expect(todaysFestivals(gameWith(undefined, { month: 4, day: 11 }))).toEqual(['fest-lemuria', 'fest-columna-eve']);
    expect(todaysFestivals(gameWith(undefined, { month: 4, day: 12 }))).toEqual([]);
    expect(templesShut(gameWith(undefined, { month: 4, day: 11 }))).toBe(true);
    expect(templesShut(gameWith(undefined, { month: 4, day: 12 }))).toBe(false);
  });
});

describe('hoursUntil', () => {
  it('counts forward from now to target', () => {
    expect(hoursUntil(18, 6)).toBe(12);
    expect(hoursUntil(5.5, 4.5)).toBeCloseTo(1, 10);
  });

  it('wraps past midnight', () => {
    expect(hoursUntil(2, 22)).toBe(4);
    expect(hoursUntil(0, 23.5)).toBeCloseTo(0.5, 10);
  });

  it('is 0 for the same hour and stays under 24', () => {
    expect(hoursUntil(7, 7)).toBe(0);
    expect(hoursUntil(7, 7.01)).toBeCloseTo(23.99, 10);
    for (const [t, n] of [[0, 0], [23.9, 0.1], [12, 13], [-1, 5]]) {
      const r = hoursUntil(t, n);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(24);
    }
  });
});
