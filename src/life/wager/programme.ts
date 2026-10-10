/**
 * The day's programme at the Flavian Amphitheatre (docs/design/world-life.md §4.5): is there a
 * show today, what is on the card and who fights next. The card is made from the director's own
 * rules (arena/munus.ts: munusOn, phases, pairOf), so what the programme-seller prints is what the
 * bookmaker lays odds on and what the sand then shows.
 *
 * The pairs of a day come from pairOf(dayKey, n, …) where n counts every bout the director has
 * called today, so the next pair is n = boutNo + 1. MunusDirector keeps `boutNo` and `dayKey`
 * private; the two are read here through a narrow view and rebuilt when it isn't there (the
 * request in the CRAFT and GAMES report: a public `nextPair()`).
 */
import { introduce, munusOn, munusPhase, pairOf, type MunusDay, type MunusPhase, type Pair } from '../../arena/munus';
import type { Game } from '../../core/Game';
import { romanPosition, sunTimes } from '../../npc/schedules';

/** The parts of MunusDirector this reads. */
interface DirectorView {
  boutNo?: number;
  dayKey?: string;
}

/** Today's show, or null (a rest day, or out of season). */
export function gamesToday(game: Game): MunusDay | null {
  const t = game.time;
  return munusOn(game.calendar?.date() ?? t.date(), t.dayIndex);
}

/** The Roman day position now (0 = sunrise … 12 = sunset). */
export function dayPos(game: Game): number {
  const t = game.time;
  return romanPosition(t.hour, sunTimes(game.calendar?.date() ?? t.date()));
}

/** The phase of today's show (closed on a rest day). */
export function gamesPhase(game: Game): MunusPhase {
  return gamesToday(game) ? munusPhase(dayPos(game)) : 'closed';
}

/** The director's key for today's card (arena/MunusDirector.readClock). */
function dayKey(game: Game): string {
  const t = game.time;
  const date = game.calendar?.date() ?? t.date();
  return `${date.month}-${date.day}-${t.dayIndex}`;
}

/** The n-th upcoming pair (1 = the next one to be called), or null when there is no show. */
export function upcoming(game: Game, n = 1): Pair | null {
  if (!gamesToday(game)) return null;
  const view = game.munus as unknown as DirectorView | undefined;
  const key = view?.dayKey || dayKey(game);
  const bouts = typeof view?.boutNo === 'number' ? view.boutNo : 0;
  const pos = dayPos(game);
  // The last pairs of the afternoon are the stars of the bill (MunusDirector.startBout).
  return pairOf(key, bouts + n, false, pos > 9.6);
}

const pairLine = (p: Pair) => `${introduce(p.a)}, against ${introduce(p.b)}`;

/** The printed programme: who gives the games, the order of the day, and the next pairs. */
export function programmeText(game: Game): string {
  const day = gamesToday(game);
  if (!day) return 'The programme-seller has none today: the arena rests.';
  const phase = munusPhase(dayPos(game));
  const head = day.grand
    ? `Games ${day.occasion}: a great day, more pairs and a fuller house, awnings against the sun (VELA ERUNT). The editor: ${day.editor}.`
    : `Games ${day.occasion}: pairs of gladiators, awnings against the sun (VELA ERUNT). The editor: ${day.editor}.`;
  const order = 'In the morning the novices practise with wooden arms; after the midday interval comes the procession, and then the pairs, with iron.';
  if (phase === 'closed' || phase === 'exit') return `${head} ${order} The day’s fighting is over; the house is emptying.`;
  const a = upcoming(game, 1);
  const b = upcoming(game, 2);
  const next = a ? ` Next on the sand: ${pairLine(a)}.` : '';
  const then = b ? ` Then: ${pairLine(b)}.` : '';
  return `${head} ${order}${next}${then}`;
}
