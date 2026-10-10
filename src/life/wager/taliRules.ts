/**
 * Tali under Augustus's rules (Suetonius, Augustus 71; docs/design/world-life.md §4.5), pure.
 *
 * A talus has four faces that can land: 1 (canis, the dog), 3, 4 and 6 (senio), in the ratio
 * 1 : 4 : 4 : 1 [P, modern throws of sheep's knucklebones]. Each round every player throws four
 * tali. For each die showing 1 or 6 the thrower puts one stake into the pot. Whoever throws Venus
 * (four different faces: a 1, a 3, a 4 and a 6) takes the pot. The throwers go in turn, so a Venus
 * takes what is in the pot at that moment, his own stake included, and the next thrower starts a
 * new one.
 */

export type Face = 1 | 3 | 4 | 6;
export type Throw = readonly [Face, Face, Face, Face];

export const FACES: readonly Face[] = [1, 3, 4, 6];

/** Probability of each face, in FACES order: 1 : 4 : 4 : 1. */
export const FACE_WEIGHTS: readonly number[] = [0.1, 0.4, 0.4, 0.1];

export const FACE_NAMES: Record<Face, string> = { 1: 'canis', 3: 'ternio', 4: 'quaternio', 6: 'senio' };

interface Dice {
  next(): number;
}

/** One talus. */
export function throwOne(rng: Dice): Face {
  let r = rng.next();
  for (let i = 0; i < FACES.length; i++) {
    r -= FACE_WEIGHTS[i];
    if (r < 0) return FACES[i];
  }
  return 4;
}

/** Four tali. */
export function throwFour(rng: Dice): Throw {
  return [throwOne(rng), throwOne(rng), throwOne(rng), throwOne(rng)];
}

/** Dice showing a 1 or a 6: each puts a stake into the pot. */
export function dogsAndSixes(t: Throw): number {
  let n = 0;
  for (const f of t) if (f === 1 || f === 6) n++;
  return n;
}

/** Venus: four different faces. */
export function isVenus(t: Throw): boolean {
  return new Set(t).size === 4;
}

/** "canis, 3, 4, senio": the faces as the dicers call them. */
export function throwText(t: Throw): string {
  return [...t].sort((a, b) => a - b).map((f) => (f === 1 || f === 6 ? FACE_NAMES[f] : String(f))).join(', ');
}

export interface Dicer {
  name: string;
  /** The player. */
  you?: boolean;
}

export interface Turn {
  who: string;
  you: boolean;
  throw: Throw;
  /** Dice that put a stake in. */
  stakes: number;
  venus: boolean;
  /** What a Venus took (the pot at that moment, less anything the bank held back). */
  took: number;
}

export interface RoundResult {
  turns: Turn[];
  /** The pot left in the middle after the round. */
  pot: number;
  /** What the player put in and took out this round (denarii). */
  paid: number;
  won: number;
  /** The bank held back part of the player's pot. */
  capped: boolean;
}

/**
 * One round: every dicer throws in turn. `stake` is per die (denarii); `pot` the pot carried in;
 * `room` how much more the table will let the player win today (bank minus the player's net so far
 * today, before this round): the player's net after the round never passes it.
 */
export function playRound(dicers: readonly Dicer[], pot: number, stake: number, rng: Dice, room = Infinity): RoundResult {
  const turns: Turn[] = [];
  let paid = 0;
  let won = 0;
  let capped = false;
  for (const d of dicers) {
    const t = throwFour(rng);
    const n = dogsAndSixes(t);
    pot += n * stake;
    if (d.you) paid += n * stake;
    const venus = isVenus(t);
    let took = 0;
    if (venus) {
      took = pot;
      if (d.you) {
        // The most the player may end the round up by is `room`; the rest stays with the dicers.
        const most = Math.max(0, room + paid);
        if (took > most) {
          took = most;
          capped = true;
        }
        won += took;
      }
      pot = 0;
    }
    turns.push({ who: d.name, you: !!d.you, throw: t, stakes: n, venus, took });
  }
  return { turns, pot, paid, won, capped };
}

/** The table's bank is spent: the player is up by as much as it will lose in a game day. */
export function bankSpent(net: number, bank: number): boolean {
  return net + 1e-9 >= bank;
}
