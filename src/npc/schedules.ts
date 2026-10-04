/**
 * NPC schedules (GDD §14.7). Archetype templates are authored in **Roman hours**: daylight is cut
 * into 12 horae from sunrise to sunset and the night into 4 watches (vigiliae), so a hora is about
 * 72 minutes in mid-May. `compileSchedule` turns a template into clock hours for a date; the
 * resolution helpers answer "what is this archetype doing at 14:20?".
 *
 * Named NPCs (NpcDef.schedule) are already in clock hours; `scheduleFor()` lets content authors
 * build one from an archetype plus their own location ids.
 */
import type { IdleLoop } from '../actors/Actor';
import { julianDayForGame, solarDeclination, sunriseSunset } from '../world/sky/astronomy';
import type { ScheduleEntry } from './types';

/** A time of day the Roman way: the start of day-hour n (1..12), of watch n (1..4), or a clock hour. */
export type RomanTime = { hora: number } | { vigilia: number } | { clock: number };

/** What an archetype does in a slot. 'home' means off the streets (not spawned). */
export type LifeActivity =
  | 'home'
  | 'work' // at its work place, in its work idle loop
  | 'wander' // strolls between nearby points of interest, chats, browses
  | 'patrol' // walks a beat
  | 'visit' // goes to a place kind (temple, baths, forum…) and lingers there
  | 'follow' // escorts a leader (clients, a matron's slave)
  | 'idle'; // stays put in `loop`

/** Kinds of places an archetype can be sent to (resolved against spots/POIs near the player). */
export type PlaceKind = 'shop' | 'stall' | 'workshop' | 'temple' | 'shrine' | 'forum' | 'steps' | 'fountain' | 'baths' | 'tavern' | 'door' | 'rostra' | 'curia' | 'open';

export interface ArchetypeSlot {
  at: RomanTime;
  activity: LifeActivity;
  place?: PlaceKind;
  loop?: IdleLoop;
}

export type ArchetypeId =
  | 'tabernarius'
  | 'faber'
  | 'patronus'
  | 'cliens'
  | 'matrona'
  | 'servus-baiulus'
  | 'miles-urbanus'
  | 'vigil'
  | 'sacerdos'
  | 'vestalis'
  | 'otiosus'
  | 'mendicus'
  | 'plaustrarius'
  | 'puer'
  | 'gladiator'
  | 'grassator'
  | 'civis'
  | 'rusticus'
  | 'viator'
  | 'comissator';

const h = (n: number): RomanTime => ({ hora: n });
const w = (n: number): RomanTime => ({ vigilia: n });

/**
 * Archetype templates (§14.7 table + society.md §3.1, Martial 4.8). Slots run until the next one;
 * the last slot wraps past midnight to the first.
 */
export const ARCHETYPES: Record<ArchetypeId, readonly ArchetypeSlot[]> = {
  // Shopkeeper: opens at dawn, prandium at the 6th hour, shuts toward evening.
  tabernarius: [
    { at: w(4), activity: 'home' },
    { at: h(1), activity: 'work', place: 'shop', loop: 'sweep' },
    { at: h(2), activity: 'work', place: 'shop', loop: 'stand' },
    { at: h(6), activity: 'idle', place: 'shop', loop: 'sit' },
    { at: h(7), activity: 'work', place: 'shop', loop: 'talk' },
    { at: h(11), activity: 'wander', place: 'tavern' },
    { at: w(1), activity: 'home' },
  ],
  // Artisan / mason: work hours 1–6 and 7–9, then the baths.
  faber: [
    { at: w(4), activity: 'home' },
    { at: h(1), activity: 'work', place: 'workshop', loop: 'work' },
    { at: h(6), activity: 'idle', place: 'steps', loop: 'sitGround' },
    { at: h(7), activity: 'work', place: 'workshop', loop: 'work' },
    { at: h(9), activity: 'visit', place: 'baths' },
    { at: h(11), activity: 'wander', place: 'tavern' },
    { at: w(1), activity: 'home' },
  ],
  // Senator: salutatio at home, then the Forum and the courts, the baths at the 8th hour, cena.
  patronus: [
    { at: w(4), activity: 'home' },
    { at: h(2), activity: 'visit', place: 'forum' },
    { at: h(4), activity: 'visit', place: 'curia' },
    { at: h(6), activity: 'home' },
    { at: h(8), activity: 'visit', place: 'baths' },
    { at: h(9), activity: 'home' },
  ],
  // Client: at the patron's door before dawn (salutatio), escorts him to the Forum, then free.
  cliens: [
    { at: w(4), activity: 'idle', place: 'door', loop: 'stand' },
    { at: h(2), activity: 'follow', place: 'forum' },
    { at: h(5), activity: 'wander', place: 'forum' },
    { at: h(9), activity: 'visit', place: 'baths' },
    { at: h(11), activity: 'home' },
  ],
  matrona: [
    { at: w(4), activity: 'home' },
    { at: h(3), activity: 'visit', place: 'temple' },
    { at: h(4), activity: 'wander', place: 'shop' },
    { at: h(6), activity: 'home' },
    { at: h(8), activity: 'visit', place: 'baths' },
    { at: h(10), activity: 'home' },
  ],
  // Porter slave: errands all day, carrying loads; runs late errands into the first watch.
  'servus-baiulus': [
    { at: w(4), activity: 'wander', place: 'door' },
    { at: h(1), activity: 'wander', place: 'shop' },
    { at: h(6), activity: 'idle', place: 'fountain', loop: 'stand' },
    { at: h(7), activity: 'wander', place: 'shop' },
    { at: w(3), activity: 'home' },
  ],
  // Urban cohort soldier: posts and patrols by day; fewer at night (the vigiles take over).
  'miles-urbanus': [
    { at: w(1), activity: 'patrol', place: 'forum' },
    { at: w(3), activity: 'home' },
    { at: h(1), activity: 'idle', place: 'curia', loop: 'guard' },
    { at: h(3), activity: 'patrol', place: 'forum' },
    { at: h(7), activity: 'idle', place: 'rostra', loop: 'guard' },
    { at: h(9), activity: 'patrol', place: 'forum' },
  ],
  // Vigil: sleeps by day, patrols with a lantern at night.
  vigil: [
    { at: w(1), activity: 'patrol', place: 'open' },
    { at: h(1), activity: 'home' },
    { at: h(12), activity: 'patrol', place: 'open' },
  ],
  // Priest: the temple opens at dawn and shuts at dusk.
  sacerdos: [
    { at: w(4), activity: 'home' },
    { at: h(1), activity: 'work', place: 'temple', loop: 'pray' },
    { at: h(6), activity: 'wander', place: 'temple' },
    { at: h(7), activity: 'work', place: 'temple', loop: 'pray' },
    { at: h(12), activity: 'home' },
  ],
  // Vestal: tends the fire; seen around the Atrium and the Temple of Vesta by day.
  vestalis: [
    { at: w(4), activity: 'home' },
    { at: h(2), activity: 'work', place: 'temple', loop: 'pray' },
    { at: h(5), activity: 'wander', place: 'temple' },
    { at: h(7), activity: 'home' },
    { at: h(9), activity: 'work', place: 'temple', loop: 'pray' },
    { at: h(11), activity: 'home' },
  ],
  // Idler at the gaming boards on the Basilica Julia steps.
  otiosus: [
    { at: w(4), activity: 'home' },
    { at: h(2), activity: 'idle', place: 'steps', loop: 'sitGround' },
    { at: h(5), activity: 'wander', place: 'forum' },
    { at: h(7), activity: 'idle', place: 'steps', loop: 'talk' },
    { at: h(9), activity: 'visit', place: 'baths' },
    { at: h(11), activity: 'wander', place: 'tavern' },
    { at: w(2), activity: 'home' },
  ],
  mendicus: [
    { at: w(4), activity: 'idle', place: 'steps', loop: 'sitGround' },
    { at: h(9), activity: 'idle', place: 'temple', loop: 'sitGround' },
    { at: w(2), activity: 'idle', place: 'door', loop: 'sleep' },
  ],
  // Night carter: Caesar's law keeps wheels off the streets from sunrise to the 10th hour.
  plaustrarius: [
    { at: w(1), activity: 'patrol', place: 'open' },
    { at: h(1), activity: 'home' },
    { at: h(10), activity: 'patrol', place: 'open' },
  ],
  puer: [
    { at: w(4), activity: 'home' },
    { at: h(1), activity: 'wander', place: 'forum' },
    { at: h(7), activity: 'home' },
    { at: h(8), activity: 'wander', place: 'fountain' },
    { at: h(11), activity: 'home' },
  ],
  // Gladiators drill hours 1–6 and 8–10 inside the ludus; a few walk out with escorts.
  gladiator: [
    { at: w(4), activity: 'home' },
    { at: h(6), activity: 'wander', place: 'open' },
    { at: h(8), activity: 'home' },
  ],
  // Street thug: night only.
  grassator: [
    { at: w(1), activity: 'wander', place: 'open' },
    { at: w(4), activity: 'home' },
    { at: h(12), activity: 'idle', place: 'door', loop: 'lean' },
  ],
  // Farmer from the Campagna: walks in before dawn with produce, sells at the markets, gone by noon.
  rusticus: [
    { at: w(4), activity: 'wander', place: 'forum' },
    { at: h(1), activity: 'wander', place: 'stall' },
    { at: h(3), activity: 'idle', place: 'stall', loop: 'stand' },
    { at: h(6), activity: 'wander', place: 'tavern' },
    { at: h(8), activity: 'home' },
  ],
  // Traveller: on the road from the last watch to dusk, then an inn.
  viator: [
    { at: w(4), activity: 'wander', place: 'open' },
    { at: h(6), activity: 'wander', place: 'tavern' },
    { at: h(8), activity: 'wander', place: 'open' },
    { at: h(12), activity: 'wander', place: 'tavern' },
    { at: w(2), activity: 'home' },
  ],
  // Reveler: out from dusk between the taverns until the night is over, home by sunrise.
  comissator: [
    { at: w(1), activity: 'wander', place: 'tavern' },
    { at: h(1), activity: 'home' },
  ],
  // Ordinary citizen of either sex: errands, the Forum, the baths, home after dusk.
  civis: [
    { at: w(4), activity: 'home' },
    { at: h(1), activity: 'wander', place: 'shop' },
    { at: h(3), activity: 'wander', place: 'forum' },
    { at: h(6), activity: 'wander', place: 'tavern' },
    { at: h(8), activity: 'visit', place: 'baths' },
    { at: h(10), activity: 'wander', place: 'forum' },
    { at: w(1), activity: 'wander', place: 'tavern' },
    { at: w(3), activity: 'home' },
  ],
};

// ---------------------------------------------------------------- time

export interface SunTimes {
  /** Sunrise, local apparent solar hours. */
  rise: number;
  set: number;
}

/** Sunrise and sunset for a date (Julian calendar; `month` 0-based). */
export function sunTimes(date: { year: number; month: number; day: number }): SunTimes {
  const dec = solarDeclination(julianDayForGame(date.year, date.month, date.day, 12));
  const s = sunriseSunset(dec);
  return s ? { rise: s.rise, set: s.set } : { rise: 6, set: 18 };
}

/** 13 May AD 113, the default when there is no game clock. */
export const DEFAULT_SUN: SunTimes = sunTimes({ year: 113, month: 4, day: 13 });

const wrap24 = (x: number) => ((x % 24) + 24) % 24;

/** Clock hour (0..24) at which a Roman time starts. */
export function romanToClock(t: RomanTime, sun: SunTimes): number {
  if ('clock' in t) return wrap24(t.clock);
  const day = sun.set - sun.rise;
  if ('hora' in t) return wrap24(sun.rise + ((t.hora - 1) * day) / 12);
  const night = 24 - day;
  return wrap24(sun.set + ((t.vigilia - 1) * night) / 4);
}

/** The Roman hour at a clock hour: day hora 1..12 or night watch 1..4 (fractional part = progress). */
export function romanHourOf(hour: number, sun: SunTimes): { kind: 'hora' | 'vigilia'; n: number; frac: number } {
  const hr = wrap24(hour);
  const day = sun.set - sun.rise;
  if (hr >= sun.rise && hr < sun.set) {
    const x = ((hr - sun.rise) / day) * 12;
    return { kind: 'hora', n: Math.floor(x) + 1, frac: x % 1 };
  }
  const night = 24 - day;
  const since = wrap24(hr - sun.set);
  const x = (since / night) * 4;
  return { kind: 'vigilia', n: Math.min(4, Math.floor(x) + 1), frac: x % 1 };
}

/** Continuous "Roman day position": 0..12 across daylight (hora n starts at n-1), 12..16 across the night. */
export function romanPosition(hour: number, sun: SunTimes): number {
  const r = romanHourOf(hour, sun);
  return r.kind === 'hora' ? r.n - 1 + r.frac : 12 + r.n - 1 + r.frac;
}

export interface CompiledSlot<T = ArchetypeSlot> {
  /** Clock hour this slot starts (0..24). */
  from: number;
  slot: T;
}

/** Turn Roman-time slots into clock-hour slots sorted by start. */
export function compileSchedule<T extends { at: RomanTime }>(slots: readonly T[], sun: SunTimes = DEFAULT_SUN): CompiledSlot<T>[] {
  return slots.map((slot) => ({ from: romanToClock(slot.at, sun), slot })).sort((a, b) => a.from - b.from);
}

/** Index of the entry active at `hour` in a list sorted by `from` (wrapping past midnight). */
export function activeIndex(list: readonly { from: number }[], hour: number): number {
  if (!list.length) return -1;
  const hr = wrap24(hour);
  let idx = list.length - 1; // before the first entry → the last one (yesterday's) is still running
  for (let i = 0; i < list.length; i++) {
    if (list[i].from <= hr) idx = i;
    else break;
  }
  return idx;
}

/** Hours until the entry after the active one starts. */
export function hoursUntilNext(list: readonly { from: number }[], hour: number): number {
  if (list.length < 2) return 24;
  const i = activeIndex(list, hour);
  const next = list[(i + 1) % list.length].from;
  return wrap24(next - wrap24(hour)) || 24;
}

/** The slot an archetype is in at a clock hour. */
export function archetypeSlot(id: ArchetypeId, hour: number, sun: SunTimes = DEFAULT_SUN): ArchetypeSlot {
  const c = compiled(id, sun);
  return c[activeIndex(c, hour)].slot;
}

/** Is an archetype out in the streets at this hour? */
export function isOut(id: ArchetypeId, hour: number, sun: SunTimes = DEFAULT_SUN): boolean {
  return archetypeSlot(id, hour, sun).activity !== 'home';
}

const cache = new Map<string, CompiledSlot[]>();
function compiled(id: ArchetypeId, sun: SunTimes) {
  const k = `${id}:${sun.rise.toFixed(3)}:${sun.set.toFixed(3)}`;
  let c = cache.get(k);
  if (!c) {
    if (cache.size > 256) cache.clear();
    cache.set(k, (c = compileSchedule(ARCHETYPES[id], sun)));
  }
  return c;
}

/** Active entry of a named NPC's clock-hour schedule (sorted copy is cached per array). */
const sortedCache = new WeakMap<readonly ScheduleEntry[], ScheduleEntry[]>();
export function activeScheduleEntry(schedule: readonly ScheduleEntry[] | undefined, hour: number): ScheduleEntry | null {
  if (!schedule?.length) return null;
  let s = sortedCache.get(schedule);
  if (!s) sortedCache.set(schedule, (s = [...schedule].sort((a, b) => a.from - b.from)));
  return s[activeIndex(s, hour)];
}

/**
 * Build a named NPC's schedule (clock hours) from an archetype template and the NPC's own places.
 * Slots whose place kind isn't mapped stay at `places.work` (or are dropped for 'home').
 *
 *   schedule: scheduleFor('tabernarius', { work: 'popina-vicus-tuscus', home: 'insula-tuscus-3' })
 */
export function scheduleFor(
  id: ArchetypeId,
  places: Partial<Record<PlaceKind | 'work' | 'home', string>>,
  sun: SunTimes = DEFAULT_SUN,
): ScheduleEntry[] {
  const out: ScheduleEntry[] = [];
  for (const { from, slot } of compileSchedule(ARCHETYPES[id], sun)) {
    const at =
      slot.activity === 'home'
        ? places.home
        : slot.activity === 'work'
          ? places.work ?? (slot.place ? places[slot.place] : undefined)
          : (slot.place ? places[slot.place] : undefined) ?? places.work;
    if (!at) continue;
    const activity: ScheduleEntry['activity'] =
      slot.activity === 'home' ? 'sleep' : slot.activity === 'patrol' ? 'patrol' : slot.activity === 'work' || slot.activity === 'idle' ? (slot.loop ?? 'stand') : 'wander';
    out.push({ from: +from.toFixed(2), at, activity });
  }
  return out;
}
