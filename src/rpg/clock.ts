/**
 * Skipping game time (GDD §14.10). Every jump of the clock — sleep or wait, the baths, the Carcer,
 * the calendar's "Wait until…" — goes through skipTime(): the clock moves, then 'time:skipped'
 * lets every timer advance by the same span as if you had waited. installRpg runs the sheet's
 * timed effects (counted in real seconds) forward on it; game-hour timers follow the clock itself.
 */
import type { EventBus, GameEvents } from '../core/Events';
import './events';

export interface SkippableClock {
  advanceHours(h: number): void;
}

/** Jump the clock by `hours` and announce it. Ignores non-positive or non-finite spans. */
export function skipTime(time: SkippableClock | undefined, events: EventBus<GameEvents> | undefined, hours: number) {
  if (!(hours > 0) || !Number.isFinite(hours)) return;
  time?.advanceHours(hours);
  events?.emit('time:skipped', { hours });
}

/** Real seconds that `hours` of game time take at a time scale (game seconds per real second). */
export function skippedSeconds(hours: number, timeScale: number | undefined): number {
  const scale = timeScale && timeScale > 0 ? timeScale : 20;
  return (hours * 3600) / scale;
}
