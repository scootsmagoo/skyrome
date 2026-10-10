/**
 * Gates (docs/design/world-life.md §3.2): when a thing exists, an option shows, a rumour is told.
 * `passes(gate, game)` is the only reader of a Gate. Every field given must hold; a service the
 * game lacks (no calendar, no inventory) fails the fields that need it.
 */
import { between, type RomanHour } from '../content/hours';
import type { Game } from '../core/Game';
import { ordinalOf } from '../game/calendar';
import type { Gate, Hours } from './types';

const list = (v: string | readonly string[] | undefined): readonly string[] => (v === undefined ? [] : typeof v === 'string' ? [v] : v);

/** A quest is finished: completed or failed. */
export function questDone(game: Game, id: string): boolean {
  return !!game.quests?.status(id)?.done;
}

/** A quest has never been started (it is neither running nor finished). */
export function questNotStarted(game: Game, id: string): boolean {
  const s = game.quests?.status(id);
  return !s || (!s.running && !s.done);
}

/** Within any of the windows (Roman hour marks, wrapping past midnight). */
export function inHours(hours: readonly Hours[], hour: number): boolean {
  for (const h of hours) if (between(hour, h.from as RomanHour, h.to as RomanHour)) return true;
  return false;
}

/** The calendar date (the flow's calendar, else the clock's). */
export function today(game: Game): { month: number; day: number } {
  return game.calendar?.date() ?? game.time.date();
}

/** Does the gate hold now? An absent gate always does. */
export function passes(gate: Gate | undefined, game: Game): boolean {
  if (!gate) return true;
  for (const q of list(gate.questDone)) if (!questDone(game, q)) return false;
  for (const q of list(gate.questCompleted)) if (!game.quests?.status(q)?.completed) return false;
  for (const q of list(gate.questNotStarted)) if (!questNotStarted(game, q)) return false;
  if (gate.questRunning !== undefined && !game.quests?.status(gate.questRunning)?.running) return false;
  if (gate.flag !== undefined && !game.quests?.flags.get(gate.flag)) return false;
  if (gate.notFlag !== undefined && game.quests?.flags.get(gate.notFlag)) return false;
  if (gate.festival !== undefined && !festivalToday(game, gate.festival)) return false;
  if (gate.marketDay !== undefined && !!game.barter?.isMarketDay() !== gate.marketDay) return false;
  if (gate.hours && !inHours(gate.hours, game.time.hour)) return false;
  if (gate.dates) {
    const d = today(game);
    const t = ordinalOf(d.month, d.day);
    const a = ordinalOf(gate.dates.from[0], gate.dates.from[1]);
    const b = ordinalOf(gate.dates.to[0], gate.dates.to[1]);
    if (a <= b ? t < a || t > b : t < a && t > b) return false;
  }
  const inv = game.player?.inventory;
  if (gate.wearing && !gate.wearing.some((id) => !!inv?.isEquipped(id))) return false;
  if (gate.has && (inv?.count(gate.has.item) ?? 0) < (gate.has.count ?? 1)) return false;
  if (gate.skill && (game.player?.sheet?.skillLevel(gate.skill.id) ?? 0) < gate.skill.min) return false;
  if (gate.fama && (game.factions?.reputation(gate.fama.faction) ?? 0) < gate.fama.min) return false;
  if (gate.sordidus !== undefined && (game.standing?.cleanliness === 'sordidus') !== gate.sordidus) return false;
  if (gate.if) {
    try {
      if (!gate.if(game)) return false;
    } catch (err) {
      console.error('[life] a gate’s if() threw', err);
      return false;
    }
  }
  return true;
}

/** Today is this festival (game/calendar.ts FESTIVALS id), by the calendar's own rule. */
function festivalToday(game: Game, id: string): boolean {
  return !!game.calendar?.isFestival(id);
}
