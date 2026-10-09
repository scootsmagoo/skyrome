/**
 * Roman hours for 11 May 113 (docs/CONTENT.md §0.3, GDD §14.7): schedules are authored in Roman
 * hours and compiled to clock hours. h1…h12 start the twelve daylight hours (sunrise 04:54, one
 * hora = 71 min); v1…v4 start the four night watches (v1 = sunset 19:06, v3 = midnight).
 */
import type { IdleLoop } from '../actors/Actor';
import type { ScheduleEntry } from '../npc/types';

export const ROMAN_HOURS = {
  h1: 4.9, h2: 6.08, h3: 7.27, h4: 8.45, h5: 9.63, h6: 10.82, h7: 12.0, h8: 13.18, h9: 14.37, h10: 15.55, h11: 16.73, h12: 17.92,
  v1: 19.1, v2: 21.55, v3: 0, v4: 2.45,
} as const;

export type RomanHour = keyof typeof ROMAN_HOURS;

/** Clock hour of a Roman-hour mark, optionally `half` an hour later ('h1+0.5'). */
export function at(mark: RomanHour, plus = 0): number {
  return +(((ROMAN_HOURS[mark] + plus) % 24 + 24) % 24).toFixed(2);
}

/** True from mark `from` until mark `to` (wrapping past midnight). */
export function between(hour: number, from: RomanHour, to: RomanHour): boolean {
  const a = ROMAN_HOURS[from];
  const b = ROMAN_HOURS[to];
  return a <= b ? hour >= a && hour < b : hour >= a || hour < b;
}


/**
 * A working day at one place: `activity` from mark `from` until mark `to`, asleep (off the streets:
 * the population module doesn't spawn a sleeper) the rest of the day. `plus` shifts the start
 * (hours after the mark).
 */
export function shift(place: string, activity: IdleLoop | 'wander', from: RomanHour, to: RomanHour, plus = 0): ScheduleEntry[] {
  const a = at(from, plus);
  const b = at(to);
  const out: ScheduleEntry[] = a < b ? [{ from: a, at: place, activity }, { from: b, at: place, activity: 'sleep' }] : [{ from: b, at: place, activity: 'sleep' }, { from: a, at: place, activity }];
  return out;
}

/** The schedule entry in force at a clock hour (the last entry wraps past midnight to the first), or undefined. */
export function entryAt(schedule: readonly ScheduleEntry[] | undefined, hour: number): ScheduleEntry | undefined {
  if (!schedule?.length) return undefined;
  const sorted = [...schedule].sort((a, b) => a.from - b.from);
  let cur = sorted[sorted.length - 1];
  for (const e of sorted) if (e.from <= hour) cur = e;
  return cur;
}

/** Hours forward from clock hour `now` to clock hour `target`, wrapping past midnight: 0 ≤ result < 24. */
export function hoursUntil(target: number, now: number): number {
  return (((target - now) % 24) + 24) % 24;
}
