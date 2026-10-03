/**
 * Locks, seals and pickpocketing as pure rules — docs/GDD.md §14.3–14.4 and the XP of §5.4. The
 * minigames and the purse UI live elsewhere; they ask these functions for widths, odds and XP.
 *
 *   lock set zone = 22% of the meter × (1 + locks/100) × tier factor × (1 + lockpick.ease + luck)
 *   lift chance   = clamp(0.05, 0.95, 0.40 + pickpocket/150 + 0.15·crowd + 0.15·unaware
 *                   − 0.04 × kg − value/400 − 0.30·alert) + pickpocket.chance + luck
 */
import { clamp } from '../core/math';
import { XP } from './data/tuning';

/** Roman lift-and-slide tumbler locks (§14.3). */
export const LOCK_TIERS = {
  simplex: { tumblers: 2, factor: 1, xp: XP.locks.tiers[0] },
  mediocris: { tumblers: 3, factor: 0.8, xp: XP.locks.tiers[1] },
  difficilis: { tumblers: 4, factor: 0.6, xp: XP.locks.tiers[2] },
  firma: { tumblers: 5, factor: 0.45, xp: XP.locks.tiers[3] },
} as const;
export type LockTier = keyof typeof LOCK_TIERS;

export const LOCKS = {
  /** Base set-zone width as a fraction of the lift meter. */
  zone: 0.22,
  /** The lift meter oscillates at this many cycles a second. */
  meterHz: 0.9,
  /** Releases outside the zone add strain; this much breaks the pick. */
  strainToBreak: 3,
};

/** Modifiers the formulas read (a CharacterSheet satisfies this). */
export interface LuckStats {
  skillLevel(id: string): number;
  modifier(id: 'lockpick.ease' | 'pickpocket.chance' | 'luck'): number;
}

/** Width of a lock's set zone as a fraction of the meter (§14.3): Light Touch, Portunus and luck widen it. */
export function lockZoneWidth(tier: LockTier, s: LuckStats): number {
  const t = LOCK_TIERS[tier];
  return clamp(LOCKS.zone * (1 + s.skillLevel('locks-seals') / 100) * t.factor * Math.max(0.1, 1 + s.modifier('lockpick.ease') + s.modifier('luck')), 0.02, 0.9);
}

/** XP for opening a lock (8 / 15 / 25 / 40 by tier). */
export function lockXp(tier: LockTier): number {
  return LOCK_TIERS[tier].xp;
}

export interface LiftContext {
  /** Weight of the item (kg). */
  weight: number;
  /** Value of the item (den.). */
  value: number;
  /** ≥ 3 NPCs within 4 m. */
  crowd?: boolean;
  /** The target's suspicion is below 35. */
  unaware?: boolean;
  /** The district is on alert. */
  alert?: boolean;
}

/** Chance to lift an item (§14.4), shown before each lift. Equipped items can't be lifted (the caller checks). */
export function pickpocketChance(s: LuckStats, c: LiftContext): number {
  const p =
    0.4 +
    s.skillLevel('pickpocket') / 150 +
    (c.crowd ? 0.15 : 0) +
    (c.unaware ? 0.15 : 0) -
    0.04 * Math.max(0, c.weight) -
    Math.max(0, c.value) / 400 -
    (c.alert ? 0.3 : 0) +
    s.modifier('pickpocket.chance') +
    s.modifier('luck');
  return clamp(p, 0.05, 0.95);
}

/** XP for a successful lift: 10 + value/5 (max 60); failure gives none. */
export function pickpocketXp(value: number): number {
  const P = XP.pickpocket;
  return Math.min(P.max, P.base + Math.max(0, value) / P.valueDiv);
}
