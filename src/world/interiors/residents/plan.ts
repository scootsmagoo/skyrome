/**
 * Who is at home in a generic cell (docs/modules/interiors.md, "Residents"): pure rules, no game.
 *
 * A kit lists the people its rooms could hold (`ResidentSpot`: a tenant, a doorkeeper, the master of
 * the house) with the places they would be at: a bed, a seat, a post. `whoIsHome` says who is there at
 * an hour and doing what: the same door, seed and hour always give the same people. Each person has
 * a number of their own (`unit`) that is compared with the chance for the hour, so someone who is at
 * home by day is also at home in the evening and at night (the chance only rises), and the household
 * does not change from one hour to the next except by people coming and going at the edges.
 *
 * `wakeChance` is the rule for waking sleepers: noises (a pick, a snapped pick, a forced door, a
 * blow on a door, rummaging, a fight) wake the ones near enough, less so when the player sneaks.
 */
import { Rng, hashString } from '../../../core/Rng';
import type { Vec3 } from '../types';

/** The most people a cell holds at once (avatars cost: phones). */
export const RESIDENT_CAP = 3;

export type Person = 'tenant' | 'mate' | 'ianitor' | 'dominus' | 'domina';
export type Posture = 'sleep' | 'sit' | 'stand';

/** A place a person can be at: a point of the cell (local, on the surface they stand, sit or lie on) and a heading. */
export interface Placement {
  position: Vec3;
  /** Local heading (0 faces +z). For a sleeper, the way the body faces: the head lies behind it. */
  heading: number;
}

export interface ResidentSpot {
  /** Stable within the kit: part of the resident's id. */
  id: string;
  person: Person;
  /** Chance (0..1) that the household has this person at all; decided once by the seed. */
  exists: number;
  bed?: Placement;
  seat?: Placement;
  post?: Placement;
  /** Which place they take when up and about, when it is not the usual (evenings and the small hours: the seat; otherwise: the post). */
  prefer?: { day?: 'seat' | 'post'; evening?: 'seat' | 'post' };
  /** Where a sleeper stands once woken (beside the bed). */
  bedside?: Placement;
}

export interface Home {
  spot: ResidentSpot;
  posture: Posture;
  place: Placement;
}

/** A number in [0, 1) from a seed and a key (stable, independent for each key). */
export function unit(seed: number, key: string): number {
  return new Rng((seed ^ hashString(key)) >>> 0).next();
}

export type DayPart = 'night' | 'dawn' | 'day' | 'evening';

/** Night 22:00 to 05:00, dawn to 07:30, day to 17:00, evening to 22:00. */
export function dayPart(hour: number): DayPart {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 22 || h < 5) return 'night';
  if (h < 7.5) return 'dawn';
  if (h < 17) return 'day';
  return 'evening';
}

type Profile = Record<DayPart, number>;

/** Chance of being at home, by part of the day. A tenant is mostly out at work by day; a doorkeeper is at his door. */
export const PROFILES: Record<Person, Profile> = {
  tenant: { night: 0.93, dawn: 0.75, day: 0.2, evening: 0.78 },
  mate: { night: 0.12, dawn: 0.6, day: 0.5, evening: 0.65 },
  ianitor: { night: 0.55, dawn: 0.6, day: 0.92, evening: 0.8 },
  dominus: { night: 0.95, dawn: 0.7, day: 0.4, evening: 0.85 },
  domina: { night: 0.95, dawn: 0.8, day: 0.7, evening: 0.85 },
};

/** Is this person in bed at this hour? Bedtime from 21:30 to 23:00 and waking from 04:30 to 06:30 are each person's own. */
export function inBed(seed: number, spot: ResidentSpot, hour: number): boolean {
  const h = ((hour % 24) + 24) % 24;
  const bedtime = 21.5 + 1.5 * unit(seed, `${spot.id}:bedtime`);
  const rise = 4.5 + 2 * unit(seed, `${spot.id}:rise`);
  return h >= bedtime || h < rise;
}

/** Everyone at home at this hour (at most RESIDENT_CAP, the household's first people first). */
export function whoIsHome(spots: readonly ResidentSpot[], seed: number, hour: number): Home[] {
  const out: Home[] = [];
  const part = dayPart(hour);
  for (const spot of spots) {
    if (out.length >= RESIDENT_CAP) break;
    if (unit(seed, `${spot.id}:exists`) >= spot.exists) continue;
    // In bed, home or not: a sleeper is home. Otherwise the chance of the hour decides.
    const sleeping = !!spot.bed && inBed(seed, spot, hour);
    if (sleeping) {
      if (unit(seed, `${spot.id}:home`) >= Math.max(PROFILES[spot.person].night, PROFILES[spot.person][part])) continue;
      out.push({ spot, posture: 'sleep', place: spot.bed! });
      continue;
    }
    if (unit(seed, `${spot.id}:home`) >= PROFILES[spot.person][part]) continue;
    // Evenings and the small hours: sitting at the table; by day: up and about.
    const eve = part === 'evening' || part === 'night';
    const want = eve ? (spot.prefer?.evening ?? 'seat') : (spot.prefer?.day ?? 'post');
    const place = spot[want] ?? spot.seat ?? spot.post;
    if (!place) continue;
    out.push({ spot, posture: place === spot.seat ? 'sit' : 'stand', place });
  }
  return out;
}

// ------------------------------------------------------------------ waking

export type Noise = 'pick' | 'snap' | 'force' | 'bash' | 'rummage' | 'fight' | 'shout';

/** How loud each noise is (the chance at point-blank) and how far it carries (m). */
export const NOISES: Record<Noise, { base: number; range: number }> = {
  /** The pick scraping in a lock. */
  pick: { base: 0.14, range: 9 },
  /** A pick snapping: it rings. */
  snap: { base: 0.5, range: 14 },
  /** A bolt giving way under blows. */
  force: { base: 0.9, range: 20 },
  /** A blow on a door that holds. */
  bash: { base: 0.35, range: 16 },
  /** Hands in a chest. */
  rummage: { base: 0.1, range: 4 },
  /** Steel and shouting: everyone wakes. */
  fight: { base: 1, range: 24 },
  /** Someone awake cries out. */
  shout: { base: 0.95, range: 20 },
};

/**
 * The chance a sleeper wakes at a noise `dist` metres away. It falls off with distance to nothing at the noise's
 * range. `light` is the sleeper's own number (0.6 a heavy sleeper … 1.4 a light one); sneaking halves it.
 */
export function wakeChance(noise: Noise, dist: number, opts: { sneaking?: boolean; light?: number } = {}): number {
  const n = NOISES[noise];
  if (dist >= n.range) return 0;
  const fall = 1 - Math.max(0, dist) / n.range;
  const p = n.base * fall * (opts.light ?? 1) * (opts.sneaking ? 0.5 : 1);
  return Math.max(0, Math.min(1, p));
}

/** A sleeper's own light-sleeping number, 0.6 … 1.4. */
export function lightness(seed: number, id: string): number {
  return 0.6 + 0.8 * unit(seed, `${id}:light`);
}

/** Does the sleeper wake? `roll` is a number in [0, 1). */
export function wakes(noise: Noise, dist: number, roll: number, opts: { sneaking?: boolean; light?: number } = {}): boolean {
  return roll < wakeChance(noise, dist, opts);
}

// ------------------------------------------------------------------ people and their words

/** The avatar role of a person, by the household's wealth. */
export function avatarRoleFor(person: Person, seed: number, wealth: number): 'plebeian-man' | 'plebeian-woman' | 'freedman' | 'elderly' | 'slave' | 'patrician-man' | 'merchant' | 'matron' | 'child' {
  const u = unit(seed, `${person}:look`);
  switch (person) {
    case 'tenant':
      return u < 0.4 ? 'plebeian-man' : u < 0.7 ? 'plebeian-woman' : u < 0.85 ? 'freedman' : 'elderly';
    case 'mate':
      return u < 0.55 ? 'plebeian-woman' : u < 0.8 ? 'plebeian-man' : 'child';
    case 'ianitor':
      return 'slave';
    case 'dominus':
      return wealth > 0.55 ? 'patrician-man' : 'merchant';
    case 'domina':
      return 'matron';
  }
}

/** What the prompt calls them. */
export const NAMES: Record<Person, string> = {
  tenant: 'Tenant',
  mate: 'Resident',
  ianitor: 'Doorkeeper',
  dominus: 'Master of the house',
  domina: 'Lady of the house',
};

export type LineKind = 'greet' | 'trespass' | 'woken' | 'caught' | 'talk' | 'roused';

type Lines = Record<LineKind, readonly string[]>;

const FOLK: Lines = {
  greet: ['Salve. Whose door was that you came through?', 'Salve. If it is the rent, the landlord’s man comes on the Kalends.', 'Yes? Do I know you?'],
  trespass: ['What are you doing in my house?!', 'Who’s there? Out! Out, before I call the vigiles!', 'This is my home! Get out!'],
  woken: ['Mmh… who’s there? What do you want at this hour?', 'Eh? What was that? Who’s there?', 'Thief! Is that a thief?'],
  caught: ['Thief! Thief in my rooms! Vigiles!', 'Stop! That’s mine! Help! Fur!', 'You! Put that back! Thief!'],
  talk: ['Not now, friend. The work does not do itself.', 'The stairs get longer every year.', 'Have you business here, or are you lost?'],
  roused: ['Mmm… go away. It is the middle of the night.', 'Gods… what? Who are you?', 'Let a man sleep!'],
};

const DOORKEEPER: Lines = {
  greet: ['Salve. Whom do you wish to see? The master is not receiving.', 'Wait here, please. Names first.'],
  trespass: ['Halt! Nobody comes into the master’s house at this hour!', 'Who let you in? Out!'],
  woken: ['Eh? Who goes there?', 'Master? Is it you? No… who are you?'],
  caught: ['Thief! Master! Thief in the house!', 'Seize him! Thief! Thief!'],
  talk: ['The master receives clients at dawn. Come back then.', 'I only keep the door, domine. Don’t ask me more.'],
  roused: ['Mm? The door is shut. Go and knock like a Roman.', 'What… who…? Let me sleep, domine.'],
};

const MASTER: Lines = {
  greet: ['Salve. You have walked into my house unannounced.', 'Ah. A caller. You are not expected.'],
  trespass: ['What is the meaning of this? Out of my house!', 'By Hercules, who are you? Slaves! Slaves!'],
  woken: ['What? Who is there? Slaves!', 'Who’s that? Light! Bring a light!'],
  caught: ['Thief! Slaves! Seize him!', 'In my own tablinum! Thief!'],
  talk: ['My steward handles callers. What is your business?', 'I have accounts to see to. Be brief.'],
  roused: ['Hmph. What hour is this? Go away.', 'Not at this hour, whoever you are.'],
};

const MISTRESS: Lines = {
  greet: ['Salve. Are you expected?', 'Salve. My husband sees petitioners in the tablinum.'],
  trespass: ['Who let you in? Get out!', 'Help! There is a stranger in the house!'],
  woken: ['Who’s there? Who is it?', 'Ecastor! What was that noise?'],
  caught: ['Thief! Help! Thief in the house!', 'Guards! Somebody! Fur!'],
  talk: ['I do not receive strangers in the atrium.', 'Mind the impluvium, please.'],
  roused: ['Mm… not now.', 'Ecastor, what hour is it?'],
};

const LINES: Record<Person, Lines> = { tenant: FOLK, mate: FOLK, ianitor: DOORKEEPER, dominus: MASTER, domina: MISTRESS };

/** A line for the situation; `roll` is in [0, 1). */
export function lineFor(person: Person, kind: LineKind, roll: number): string {
  const lines = LINES[person][kind];
  return lines[Math.min(lines.length - 1, Math.floor(roll * lines.length))];
}

/** Does an awake resident treat the visit as a trespass (small hours) or a call (daylight and evening)? */
export function isTrespass(hour: number): boolean {
  return dayPart(hour) === 'night' || dayPart(hour) === 'dawn';
}
