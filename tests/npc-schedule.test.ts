import { describe, expect, it } from 'vitest';
import {
  ARCHETYPES,
  activeIndex,
  activeScheduleEntry,
  archetypeSlot,
  compileSchedule,
  DEFAULT_SUN,
  hoursUntilNext,
  isOut,
  romanHourOf,
  romanToClock,
  scheduleFor,
  sunTimes,
  type ArchetypeId,
} from '../src/npc/schedules';
import type { ScheduleEntry } from '../src/npc/types';

const sun = sunTimes({ year: 113, month: 4, day: 13 });

describe('Roman time', () => {
  it('13 May AD 113: sunrise ≈ 04:47, sunset ≈ 19:13 (sky.md)', () => {
    expect(sun.rise).toBeCloseTo(4 + 47 / 60, 1);
    expect(sun.set).toBeCloseTo(19 + 13 / 60, 1);
    expect(DEFAULT_SUN.rise).toBeCloseTo(sun.rise, 6);
  });

  it('hora 1 starts at sunrise, hora 7 at solar noon; vigilia 1 at sunset, vigilia 3 at midnight', () => {
    expect(romanToClock({ hora: 1 }, sun)).toBeCloseTo(sun.rise, 6);
    expect(romanToClock({ hora: 7 }, sun)).toBeCloseTo(12, 6);
    expect(romanToClock({ vigilia: 1 }, sun)).toBeCloseTo(sun.set, 6);
    const midnight = romanToClock({ vigilia: 3 }, sun);
    expect(Math.min(midnight, 24 - midnight)).toBeCloseTo(0, 6);
    expect(romanToClock({ clock: 25 }, sun)).toBe(1);
  });

  it('a May hora lasts about 72 minutes', () => {
    const h1 = romanToClock({ hora: 1 }, sun);
    const h2 = romanToClock({ hora: 2 }, sun);
    expect((h2 - h1) * 60).toBeGreaterThan(70);
    expect((h2 - h1) * 60).toBeLessThan(74);
  });

  it('romanHourOf inverts romanToClock', () => {
    for (const n of [1, 3, 6, 7, 12]) {
      const r = romanHourOf(romanToClock({ hora: n }, sun) + 0.01, sun);
      expect(r).toMatchObject({ kind: 'hora', n });
    }
    expect(romanHourOf(23, sun)).toMatchObject({ kind: 'vigilia', n: 2 });
    expect(romanHourOf(3, sun)).toMatchObject({ kind: 'vigilia', n: 4 });
  });
});

describe('schedule resolution', () => {
  const list = [{ from: 6 }, { from: 12 }, { from: 20 }];

  it('picks the last entry that started, wrapping past midnight', () => {
    expect(activeIndex(list, 7)).toBe(0);
    expect(activeIndex(list, 12)).toBe(1);
    expect(activeIndex(list, 23.5)).toBe(2);
    expect(activeIndex(list, 3)).toBe(2); // yesterday's 20:00 entry is still running
    expect(activeIndex(list, 27)).toBe(2); // hours wrap
    expect(activeIndex([], 3)).toBe(-1);
  });

  it('hoursUntilNext wraps too', () => {
    expect(hoursUntilNext(list, 7)).toBe(5);
    expect(hoursUntilNext(list, 22)).toBe(8);
  });

  it('compiles archetype templates to sorted clock hours', () => {
    for (const id of Object.keys(ARCHETYPES) as ArchetypeId[]) {
      const c = compileSchedule(ARCHETYPES[id], sun);
      expect(c.length).toBe(ARCHETYPES[id].length);
      for (let i = 1; i < c.length; i++) expect(c[i].from).toBeGreaterThanOrEqual(c[i - 1].from);
      for (const e of c) expect(e.from >= 0 && e.from < 24).toBe(true);
    }
  });

  it('six core archetypes do what §14.7 says at 9:00, 14:00 and 23:00', () => {
    const at = (id: ArchetypeId, h: number) => archetypeSlot(id, h, sun);
    // Shopkeeper: open in the morning, at the shop after prandium, home at night.
    expect(at('tabernarius', 9)).toMatchObject({ activity: 'work', place: 'shop' });
    expect(at('tabernarius', 14)).toMatchObject({ activity: 'work', place: 'shop' });
    expect(at('tabernarius', 23).activity).toBe('home');
    // Worker.
    expect(at('faber', 9)).toMatchObject({ activity: 'work', loop: 'work' });
    expect(at('faber', 23).activity).toBe('home');
    // Patrician: the Forum in the morning, home for the midday rest, baths at hora 8.
    expect(at('patronus', 7)).toMatchObject({ activity: 'visit', place: 'forum' });
    expect(at('patronus', 9)).toMatchObject({ activity: 'visit', place: 'curia' }); // the Senate sits
    expect(at('patronus', 13).activity).toBe('home');
    expect(at('patronus', 23).activity).toBe('home');
    // Slave porter: errands by day, home late at night.
    expect(at('servus-baiulus', 9).activity).toBe('wander');
    expect(at('servus-baiulus', 2).activity).toBe('home');
    // Soldier: posts and patrols by day, first-watch patrol at night.
    expect(['idle', 'patrol']).toContain(at('miles-urbanus', 9).activity);
    expect(at('miles-urbanus', 21).activity).toBe('patrol');
    // Priest: temple at dawn, home after dusk.
    expect(at('sacerdos', 9)).toMatchObject({ activity: 'work', place: 'temple', loop: 'pray' });
    expect(at('sacerdos', 23).activity).toBe('home');
    // Vigiles sleep by day; carts keep off the streets by day.
    expect(isOut('vigil', 11, sun)).toBe(false);
    expect(isOut('vigil', 23, sun)).toBe(true);
    expect(isOut('plaustrarius', 9, sun)).toBe(false);
    expect(isOut('plaustrarius', 23, sun)).toBe(true);
  });

  it('scheduleFor builds a named NPC schedule from an archetype and location ids', () => {
    const s = scheduleFor('tabernarius', { work: 'popina-tusci', home: 'insula-tusci', tavern: 'popina-tusci' }, sun);
    expect(s.length).toBeGreaterThan(3);
    expect(s.every((e) => e.at === 'popina-tusci' || e.at === 'insula-tusci')).toBe(true);
    expect(activeScheduleEntry(s, 9)?.at).toBe('popina-tusci');
    expect(activeScheduleEntry(s, 23)).toMatchObject({ at: 'insula-tusci', activity: 'sleep' });
  });

  it('activeScheduleEntry tolerates unsorted content schedules', () => {
    const s: ScheduleEntry[] = [
      { from: 20, at: 'home', activity: 'sleep' },
      { from: 6, at: 'shop', activity: 'work' },
    ];
    expect(activeScheduleEntry(s, 10)?.at).toBe('shop');
    expect(activeScheduleEntry(s, 2)?.at).toBe('home');
    expect(activeScheduleEntry(undefined, 2)).toBeNull();
  });
});
