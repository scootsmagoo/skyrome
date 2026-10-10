/**
 * The bookmaker's slips in the life save (docs/design/world-life.md §4.5): bets laid, settled by
 * `munus:bout` (munus.ts), collected by talking to the bookmaker. Kept in game.life.store under
 * 'munus-bets' (a few small records; the slips of an earlier day are dropped once paid).
 */
import type { Game } from '../../core/Game';
import { priceText } from '../effects';
import { owed, voidStale, type Bet } from './betRules';

const KEY = 'munus-bets';

let last = 'Nothing is owed.';

/** The slips (a copy to read; call saveBets after changing them). */
export function betsOf(game: Game): Bet[] {
  const v = game.life?.store.get<Bet[]>(KEY);
  return Array.isArray(v) ? v : [];
}

export function saveBets(game: Game, bets: Bet[]) {
  game.life?.store.set(KEY, bets.length ? bets : undefined);
}

/** What the bookmaker owes the player now (wins and returned stakes), in denarii. */
export function owedNow(game: Game): number {
  const bets = betsOf(game);
  if (voidStale(bets, game.time.dayIndex).length) saveBets(game, bets);
  return owed(bets).total;
}

/** Pay out every slip that is owed. Returns what the bookmaker said. */
export function collectOwed(game: Game, owner: string): string {
  const bets = betsOf(game);
  voidStale(bets, game.time.dayIndex);
  let won = 0;
  let back = 0;
  for (const b of bets) {
    if (b.paid || b.owner !== owner) continue;
    if (b.state === 'won') {
      won += b.pay;
      b.paid = true;
    } else if (b.state === 'void') {
      back += b.pay;
      b.paid = true;
    }
  }
  const total = won + back;
  if (total > 0) game.player?.inventory?.addDenarii(total);
  // Slips of an earlier day that are paid or lost are done with.
  const keep = bets.filter((b) => b.day >= game.time.dayIndex || b.state === 'open' || ((b.state === 'won' || b.state === 'void') && !b.paid));
  saveBets(game, keep);
  if (total <= 0) {
    last = 'He runs a finger down his tablet. “Nothing owed to you, citizen. Not yet.”';
    return last;
  }
  const parts: string[] = [];
  if (won > 0) parts.push(`Your man won, and that is ${priceText(won)}.`);
  if (back > 0) parts.push(`Your stake comes back: ${priceText(back)}.`);
  last = `(He runs a finger down his tablet, nods, and counts coin into your palm.) Quite right. ${parts.join(' ')} Always a pleasure to lose to an honest man.`;
  return last;
}

/** What the bookmaker said at the last collection. */
export function lastCollectText(): string {
  return last;
}
