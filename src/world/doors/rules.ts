/**
 * Door rules, pure: when a lock holds, how much forcing a door takes, and what the prompt says.
 * The service (DoorSystem.ts) asks these; tests/doors.test.ts pins them.
 *
 * A Roman house door was barred or locked at night and stood open (or on the latch) by day: a lock
 * with `openHours` is undone between those hours. A key opens any lock; a picked or forced door
 * stays open for good (saved). A bar is drawn on the inside: no pick or blow undoes it.
 */
import { LOCK_TIERS, type LockTier } from '../../rpg/thievery';

export interface DoorLock {
  tier: LockTier;
  /** A key item that opens it. */
  key?: string;
  /** Undone between these hours (`[6, 20]`: 06:00 to 20:00). Locked at all hours when absent. */
  openHours?: readonly [number, number];
  /** Barred from the inside: no key, pick or blow opens it from this side. */
  barred?: boolean;
}

/** What a door remembers in the save (only doors whose state changed are stored). */
export interface DoorState {
  /** Unlocked for good (a key turned, a pick, a quest). */
  unlocked?: boolean;
  /** Forced: the bolt is broken, it no longer locks. */
  broken?: boolean;
  /** Damage taken towards forcing it. */
  damage?: number;
  /** effractio has been booked for this door (once). */
  booked?: boolean;
}

/** Hours wrap past midnight: `[20, 4]` is 20:00 to 04:00. */
export function withinHours(hour: number, [a, b]: readonly [number, number]): boolean {
  const h = ((hour % 24) + 24) % 24;
  return a <= b ? h >= a && h < b : h >= a || h < b;
}

/** Does the lock hold right now? */
export function isLocked(lock: DoorLock | undefined, state: DoorState | undefined, hour: number): boolean {
  if (!lock) return false;
  if (lock.barred) return true;
  if (state?.unlocked || state?.broken) return false;
  if (lock.openHours && withinHours(hour, lock.openHours)) return false;
  return true;
}

/** Blows a door takes before its bolt gives (more tumblers, a heavier door). */
export const DOOR_HP: Record<LockTier, number> = { simplex: 40, mediocris: 65, difficilis: 100, firma: 150 };

/** Damage of one blow: a power attack does far more, and a strong arm adds to it. */
export function bashDamage(power: boolean, strength = 0): number {
  return (power ? 26 : 9) * (1 + Math.max(0, strength) / 100);
}

/** A blow on a door is loud (GDD §14.2 noise events): a clash of arms. */
export const BASH_NOISE = { loudness: 1, range: 25 } as const;

/** The prompt line under a locked door's name: "Locked (Mediocris)", "Barred". */
export function lockDetail(lock: DoorLock | undefined, locked: boolean): string | null {
  if (!lock || !locked) return null;
  if (lock.barred) return 'Barred';
  const t = lock.tier;
  return `Locked (${t[0].toUpperCase()}${t.slice(1)}, ${LOCK_TIERS[t].tumblers} tumblers)`;
}

/** What the player can do at a locked door, best first. */
export type LockedAction = 'key' | 'pick' | 'none';
export function lockedAction(lock: DoorLock, has: { key: boolean; picks: number; canPick: boolean }): LockedAction {
  if (lock.barred) return 'none';
  if (lock.key && has.key) return 'key';
  if (has.canPick && has.picks > 0) return 'pick';
  return 'none';
}
