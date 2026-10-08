/**
 * The games in the Flavian Amphitheatre (pure logic: dates, the day's programme, the card of pairs,
 * the crowd's verdict). MunusDirector stages it.
 *
 * History (docs/research/arena.md):
 *  - Trajan's munera were enormous: the Fasti Ostienses record 4,941 pairs over 117 days in
 *    108–109, and another long munus was given in 113, the year of the Column. In the game window
 *    (May–October 113) a munus is on, by Caesar's gift, with a rest day every fourth day.
 *  - A day's programme: the hunts in the morning, an interval at midday (meridiani, executions
 *    and comic turns; the crowd goes for lunch), then the pompa and the gladiators, pair after
 *    pair, in the afternoon. We have no animals yet, so the morning has the prolusio instead:
 *    bouts with wooden arms (arma lusoria) that warm the crowd up and kill nobody.
 *  - Classic pairings (armaturae): murmillo v thraex, murmillo v hoplomachus, secutor v
 *    retiarius, provocator v provocator. A summa rudis referees.
 *  - A beaten man raises a finger (ad digitum) and the editor decides with the crowd: "Mitte!"
 *    (let him go) or "Iugula!" (cut his throat). Most were spared: a trained gladiator was
 *    expensive, and since Augustus fights sine missione were banned. A long, even fight could end
 *    with both sent away standing (stantes missi), as Martial's Priscus and Verus were.
 *  - Stage names come from the arena record: Celadus and Crescens of the Pompeii graffiti,
 *    Astyanax and Kalendio of the Madrid mosaic, Tetraites and Prudes, Priscus and Verus, Flamma.
 */
import { Rng } from '../core/Rng';

/** Phases of a games day (Roman day positions: 0 = sunrise … 12 = sunset). */
export type MunusPhase = 'closed' | 'gates' | 'prolusio' | 'meridies' | 'pompa' | 'pairs' | 'exit';

export const PROGRAMME: readonly { phase: MunusPhase; from: number }[] = [
  { phase: 'gates', from: 0 },
  { phase: 'prolusio', from: 1.2 },
  { phase: 'meridies', from: 5.6 },
  { phase: 'pompa', from: 6.8 },
  { phase: 'pairs', from: 7.2 },
  { phase: 'exit', from: 11.2 },
  { phase: 'closed', from: 12.2 },
];

/** The phase at a Roman day position (0..12 day, 12..16 night). */
export function munusPhase(pos: number): MunusPhase {
  if (pos < 0 || pos >= 12.2) return 'closed';
  let out: MunusPhase = 'closed';
  for (const p of PROGRAMME) if (pos >= p.from) out = p.phase;
  return out;
}

/** Bouts are fought in these phases (with practice arms in the prolusio). */
export function boutsIn(phase: MunusPhase): 'lusio' | 'ferrum' | null {
  return phase === 'prolusio' ? 'lusio' : phase === 'pairs' ? 'ferrum' : null;
}

/** Fraction of seats taken at a Roman day position (piecewise linear). */
const ATTENDANCE: readonly [number, number][] = [
  [-0.6, 0],
  [0, 0.08],
  [1.2, 0.55],
  [3, 0.72],
  [5.6, 0.78],
  [6, 0.6],
  [6.8, 0.82],
  [7.4, 0.96],
  [10.8, 0.96],
  [11.2, 0.8],
  [12.2, 0],
];

export function attendance(pos: number): number {
  if (pos <= ATTENDANCE[0][0] || pos >= ATTENDANCE[ATTENDANCE.length - 1][0]) return 0;
  for (let i = 1; i < ATTENDANCE.length; i++) {
    const [p1, v1] = ATTENDANCE[i];
    const [p0, v0] = ATTENDANCE[i - 1];
    if (pos <= p1) return v0 + ((v1 - v0) * (pos - p0)) / (p1 - p0);
  }
  return 0;
}

// ---------------------------------------------------------------- the calendar of games

export interface MunusDay {
  /** Who gives the games (shown on the notices and announced by the herald). */
  editor: string;
  /** A great day: Caesar in the pulvinar, more pairs, a fuller house. */
  grand: boolean;
  /** Why ("for the dedication of the Column"). */
  occasion: string;
}

/** Great days of the munus of 113 (month 0-based, day). */
const GRAND: readonly { month: number; day: number; occasion: string }[] = [
  { month: 4, day: 12, occasion: 'for the dedication of the Column' },
  { month: 4, day: 13, occasion: 'for the dedication of the Column' },
  { month: 8, day: 18, occasion: 'for Caesar’s sixtieth birthday' },
  { month: 9, day: 1, occasion: 'for the Kalends of October' },
];

/** First and last day of the munus (the window of the game: 1 May to Trajan’s departure). */
export const MUNUS_SPAN = { from: { month: 4, day: 1 }, to: { month: 9, day: 18 } };

const before = (a: { month: number; day: number }, b: { month: number; day: number }) => a.month < b.month || (a.month === b.month && a.day < b.day);

/**
 * Is there a show today? `elapsedDay` (GameTime.dayIndex) sets the rest days: every fourth day
 * the arena is shut (the calendar date can stand still on the eve of a quest's set piece, but the
 * days still pass, and so do the rest days). Great days never rest.
 */
export function munusOn(date: { month: number; day: number }, elapsedDay: number): MunusDay | null {
  if (before(date, MUNUS_SPAN.from) || before(MUNUS_SPAN.to, date)) return null;
  const g = GRAND.find((x) => x.month === date.month && x.day === date.day);
  if (g) return { editor: 'Imperator Caesar Nerva Traianus Augustus', grand: true, occasion: g.occasion };
  if (((elapsedDay % 4) + 4) % 4 === 3) return null;
  return { editor: 'Caesar, by the hand of the praetor', grand: false, occasion: 'by Caesar’s gift' };
}

// ---------------------------------------------------------------- the card

export type Armatura = 'murmillo' | 'thraex' | 'hoplomachus' | 'secutor' | 'retiarius' | 'provocator';

/** Classic pairs and how often they're on the card. */
export const PAIRINGS: readonly { a: Armatura; b: Armatura; w: number }[] = [
  { a: 'murmillo', b: 'thraex', w: 4 },
  { a: 'murmillo', b: 'hoplomachus', w: 2 },
  { a: 'secutor', b: 'retiarius', w: 3 },
  { a: 'provocator', b: 'provocator', w: 2 },
  { a: 'thraex', b: 'hoplomachus', w: 1 },
];

/** Stage names by armatura (from the arena record; reused by many men). */
export const NAMES: Record<Armatura, readonly string[]> = {
  murmillo: ['Tetraites', 'Spiculus', 'Columbus', 'Crescens', 'Marcianus', 'Hilarus', 'Pugnax'],
  thraex: ['Celadus', 'Prudes', 'Pinnas', 'Rusticus', 'Oceanus', 'Tigris', 'Severus'],
  hoplomachus: ['Priscus', 'Ingenuus', 'Myrtilus', 'Cycnus', 'Faustus'],
  secutor: ['Astyanax', 'Flamma', 'Felix', 'Urbicus', 'Aquilo'],
  retiarius: ['Kalendio', 'Pacuvius', 'Nereus', 'Glaucus', 'Hermes', 'Triton'],
  provocator: ['Verus', 'Victor', 'Fortis', 'Ursus', 'Leander', 'Bato'],
};

export const ARMATURA_LATIN: Record<Armatura, string> = {
  murmillo: 'the murmillo',
  thraex: 'the thraex',
  hoplomachus: 'the hoplomachus',
  secutor: 'the secutor',
  retiarius: 'the retiarius',
  provocator: 'the provocator',
};

export interface Gladiator {
  name: string;
  armatura: Armatura;
  /** Fights fought and victories (the herald calls them out). */
  fights: number;
  wins: number;
  /** Combat tier: 'thug' (tiro), 'veteran', 'champion'. */
  tier: 'thug' | 'veteran' | 'champion';
}

export interface Pair {
  a: Gladiator;
  b: Gladiator;
  lusio: boolean;
}

/** Names the herald calls ("Celadus the thraex, eleven fights, nine palms"). */
export function introduce(g: Gladiator): string {
  if (g.fights === 0) return `${g.name} ${ARMATURA_LATIN[g.armatura]}, a tiro on the sand for the first time`;
  return `${g.name} ${ARMATURA_LATIN[g.armatura]}, ${g.fights} fights, ${g.wins} palm${g.wins === 1 ? '' : 's'}`;
}

function weighted<T extends { w: number }>(rng: Rng, list: readonly T[]): T {
  let sum = 0;
  for (const x of list) sum += x.w;
  let r = rng.next() * sum;
  for (const x of list) if ((r -= x.w) < 0) return x;
  return list[list.length - 1];
}

function fighter(rng: Rng, armatura: Armatura, used: Set<string>, lusio: boolean, star: boolean): Gladiator {
  const pool = NAMES[armatura].filter((n) => !used.has(n));
  const name = pool.length ? rng.pick(pool) : rng.pick(NAMES[armatura]);
  used.add(name);
  // Practice bouts are for the novices; the afternoon's last pairs are the stars.
  const fights = lusio ? rng.int(0, 2) : star ? rng.int(14, 34) : rng.int(2, 13);
  const wins = Math.min(fights, Math.round(fights * (0.55 + rng.next() * 0.35)));
  return { name, armatura, fights, wins, tier: lusio ? 'thug' : star ? 'champion' : 'veteran' };
}

/**
 * The n-th pair of a day's card (deterministic per day). `star` marks the top of the bill (the
 * last pairs of the afternoon).
 */
export function pairOf(dayKey: string, n: number, lusio: boolean, star = false): Pair {
  const rng = new Rng(`munus:${dayKey}:${lusio ? 'l' : 'f'}:${n}`);
  const p = weighted(rng, PAIRINGS);
  const used = new Set<string>();
  const a = fighter(rng, p.a, used, lusio, star);
  const b = fighter(rng, p.b, used, lusio, star);
  return { a, b, lusio };
}

// ---------------------------------------------------------------- the verdict

export type Verdict = 'mitte' | 'iugula' | 'stantes';

/**
 * The crowd's wish (and the editor's verdict) over a beaten man. Practice bouts always end with
 * him spared. A man who fought well is let go nine times in ten; one who didn't, about two in
 * three. `roll` is a uniform random number.
 */
export function verdictFor(o: { lusio: boolean; foughtWell: boolean; grand: boolean }, roll: number): Verdict {
  if (o.lusio) return 'mitte';
  const spare = o.foughtWell ? 0.9 : o.grand ? 0.6 : 0.68;
  return roll < spare ? 'mitte' : 'iugula';
}

/** Bouts that run this long (s) end with both sent off standing. */
export const STANTES_AFTER = { lusio: 75, ferrum: 150 };
