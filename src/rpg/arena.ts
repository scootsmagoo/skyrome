/**
 * Arena rules as pure functions — docs/GDD.md §6.10 (crowd favor and missio), §3.7 (the
 * gladiatrix) and §6.9. The arena system calls these; the numbers live in ARENA.
 *
 *   favor 0–100, starts 30 (+10 with Fama > 30 among the plebs); gains × (1 + arena.favor)
 *   missio when you yield: spared at favor ≥ 50, 50% at 30–49, 10% below (Nemesis +15 points); Tiro always
 *   purse = base × (1 + favor/100)
 *   lusio (practice arms): nobody dies — 0 health is a knockout; a refused missio means the Saniarium
 */
import { clamp } from '../core/math';
import type { WeaponStats } from './types';

export const ARENA = {
  start: 30,
  plebsFamaBonus: { above: 30, favor: 10 },
  /** Favor changes per event (§6.10). */
  events: {
    parry: 6,
    riposte: 8,
    finisher: 8,
    'power-hit': 3,
    'armatura-move': 4,
    'dodge-unblockable': 4,
    salute: 5,
    'spare-right': 10,
    'no-attack-6s': -5,
    'strike-yielded': -20,
    'dirty-trick': -8,
    'against-crowd': -15,
    'with-crowd': 15,
  },
  /** Retreating for more than 3 s costs 2 a second. */
  retreatPerSecond: -2,
  /** Full favor: hold E toward the crowd for gifts; favor resets to 60. */
  fullFavorReset: 60,
  gifts: { coins: [5, 50] as [number, number], wineStamina: 40, weaponChance: 0.2 },
  /** Saluting needs favor ≥ 50, once per bout. */
  saluteMin: 50,
  missio: { spared: 50, coinFlip: 30, coinFlipChance: 0.5, lowChance: 0.1 },
  /** Stans missus: both below 30% health and favor ≥ 70. */
  stansMissus: { health: 0.3, favor: 70 },
  /** §3.7: a gladiatrix gains crowd favor 25% faster and Infamia 50% faster. */
  gladiatrix: { favor: 0.25, infamia: 0.5 },
};

export type FavorEvent = keyof typeof ARENA.events;

/** Crowd favor at the start of a bout. */
export function startingFavor(plebsFama = 0): number {
  return ARENA.start + (plebsFama > ARENA.plebsFamaBonus.above ? ARENA.plebsFamaBonus.favor : 0);
}

/**
 * Favor after an event. Gains are scaled by `gainMult` (1 + arena.favor: Nemesis' blessing +25%,
 * as patron +15%, a gladiatrix +25%); losses are not.
 */
export function addFavor(favor: number, event: FavorEvent | number, gainMult = 1): number {
  const d = typeof event === 'number' ? event : ARENA.events[event];
  return clamp(favor + (d > 0 ? d * gainMult : d), 0, 100);
}

/**
 * Chance the crowd spares you when you yield: favor ≥ 50 always, 30–49 half the time, below 30 one
 * in ten; `bonus` points (Nemesis as patron: 15) count as favor; Tiro difficulty always spares.
 */
export function missioChance(favor: number, o: { bonus?: number; tiro?: boolean } = {}): number {
  if (o.tiro) return 1;
  const f = favor + (o.bonus ?? 0);
  const M = ARENA.missio;
  return f >= M.spared ? 1 : f >= M.coinFlip ? M.coinFlipChance : M.lowChance;
}

/** Both fighters left standing: a draw. */
export function stansMissusPossible(o: { playerHealth: number; foeHealth: number; favor: number }): boolean {
  const S = ARENA.stansMissus;
  return o.playerHealth < S.health && o.foeHealth < S.health && o.favor >= S.favor;
}

/** Purse = base × (1 + favor/100). */
export function arenaPurse(base: number, favor: number): number {
  return base * (1 + clamp(favor, 0, 100) / 100);
}

/** Practice arms (rudis, practice trident) never kill: 0 health is a knockout. */
export function isPracticeWeapon(w: WeaponStats | undefined): boolean {
  return !!w?.practice;
}

/**
 * What happens when a bout ends with the player yielding (§6.10): spared → wake in the Saniarium
 * `injured`; not spared → death and a reload, except in a lusio (practice bout), where the doctor
 * stops it: `injured` and the purse lost.
 */
export function yieldOutcome(spared: boolean, lusio: boolean): 'saniarium' | 'saniarium-no-purse' | 'death' {
  if (spared) return 'saniarium';
  return lusio ? 'saniarium-no-purse' : 'death';
}
