/**
 * Bets on the games (docs/design/world-life.md §4.5): "I'd like to place a bet" at the bookmaker's
 * opens a card in the conversation panel. Pick a fighter of the next pair, pick a stake (¼ to 4
 * denarii), and the slip is kept in the life save. The bout's end ('munus:bout') settles it: a win
 * pays the odds (1.8×), a draw (both sent off standing) returns the stake. Collect by talking to the
 * bookmaker. The bank caps what he will lay in a day. Bets go on only between the practice and the
 * pairs (the pair on the card depends on how many bouts the director has called).
 *
 *   game.lifeBets.open(owner)                       the card (false: nothing to bet on now)
 *   game.lifeBets.place(owner, fighter, stakeIndex) lay a bet on the next pair's a/b side
 *   game.lifeBets.next()                            the pair a bet would be laid on
 */
import type { Pair } from '../../arena/munus';
import type { Game } from '../../core/Game';
import type { DialogueChoice, DialogueDef, DialogueNode } from '../../dialogue/types';
import { priceText } from '../effects';
import { registerWager } from '../talk';
import type { WagerDef } from '../types';
import { betsOf, collectOwed, lastCollectText, owedNow, saveBets } from './bets';
import { canLay, settle, stagedPair, type BoutEnd } from './betRules';
import { gamesPhase, gamesToday, upcoming } from './programme';

declare module '../../core/Game' {
  interface Game {
    lifeBets: LifeBets;
  }
}

export interface LifeBets {
  open(owner: string): boolean;
  /** Lay a bet on the next pair: side 0 backs the first man, 1 the second; `stake` indexes the wager's stakes. */
  place(owner: string, side: 0 | 1, stake: number): { ok: boolean; text: string };
  /** The pair a bet would be laid on now (null: no show, or too early/late for bets). */
  next(): Pair | null;
  /** Why no bets can be laid now, or null. */
  closedWhy(): string | null;
}

const DIALOGUE = 'life:bet';
const DEFAULT_ODDS = 1.8;

/** The wager an owner (the bookmaker's keeper id) runs. */
function wagerOf(game: Game, owner: string): WagerDef | undefined {
  const id = game.life?.keeper(owner)?.wager ?? game.life?.data.keepers.find((k) => k.id === owner)?.wager;
  return game.life?.data.wagers.find((w) => w.id === id && w.game === 'munus');
}

const oddsOf = (game: Game, wagerId: string) => game.life?.data.wagers.find((w) => w.id === wagerId)?.odds ?? DEFAULT_ODDS;

/** The state of the card a player is on: who they back. */
const pending = new Map<string, 0 | 1>();
/** The last thing said by the bookmaker after a bet. */
let said = '';

export function installLifeBets(game: Game) {
  // A new Game starts with no half-made bet (the module-level state would outlive it).
  pending.clear();
  said = '';
  const closedWhy = (): string | null => {
    if (!gamesToday(game)) return 'No games today: the arena rests, and so does my tablet.';
    const phase = gamesPhase(game);
    if (phase === 'gates' || phase === 'prolusio') return 'Come back at the midday interval. The morning is for novices with wooden swords, and nobody bets on those.';
    if (phase === 'closed' || phase === 'exit') return 'The pairs are done for today. Come back on the next games day.';
    return null;
  };

  const next = (): Pair | null => (closedWhy() ? null : upcoming(game, 1));

  /** The bank check: net he has paid today, plus what the open bets could cost, plus this one. */
  const bankWhy = (w: WagerDef, stake: number): string | null => {
    if (!canLay(betsOf(game), game.time.dayIndex, stake, w.odds ?? DEFAULT_ODDS, w.bank)) return 'He taps the tablet. “I have laid enough for one day. Fortuna is not a bank.”';
    return null;
  };

  const place = (owner: string, side: 0 | 1, stakeIx: number): { ok: boolean; text: string } => {
    const fail = (text: string) => ({ ok: false, text: (said = text) });
    const w = wagerOf(game, owner);
    const why = closedWhy();
    if (!w) return fail('He does not lay bets.');
    if (why) return fail(why);
    const pair = upcoming(game, 1);
    const stake = w.stakes[stakeIx];
    if (!pair || stake === undefined) return fail('Nothing to bet on yet.');
    const full = bankWhy(w, stake);
    if (full) return fail(full);
    if (!game.player?.inventory?.spendDenarii(stake)) return fail('You haven’t the money.');
    const mine = side === 0 ? pair.a : pair.b;
    const other = side === 0 ? pair.b : pair.a;
    const bets = betsOf(game);
    bets.push({ owner, wager: w.id, day: game.time.dayIndex, fighter: mine.name, other: other.name, stake, state: 'open', pay: 0 });
    saveBets(game, bets);
    const text = `(He scratches it on his tablet and hands you a tally-stick.) ${priceText(stake)} on ${mine.name}, then. If he wins I pay ${w.odds ?? DEFAULT_ODDS} to one. The trumpet will tell us.`;
    said = text;
    return { ok: true, text };
  };

  game.lifeBets = {
    open: (owner) => {
      const w = wagerOf(game, owner);
      return !!w && !!game.dialogue?.start(`bet:${owner}`, { name: game.life?.keeper(owner)?.name ?? 'Bookmaker', dialogueId: DIALOGUE });
    },
    place,
    next,
    closedWhy,
  };

  registerWager('munus', (g, _w, owner) => g.lifeBets.open(owner));
  game.dialogue?.register(betCard(game, closedWhy, bankWhy, place));

  // A bout ends: settle the slips on the pair that was on the sand.
  game.events.on('munus:bout', (e) => {
    const bets = betsOf(game);
    if (!bets.some((b) => b.state === 'open')) return;
    const end: BoutEnd = { winner: e.winner, loser: e.loser, verdict: e.verdict, lusio: e.lusio };
    const done = settle(bets, stagedPair(game.munus?.status() ?? ''), end, (b) => oddsOf(game, b.wager));
    if (!done.length) return;
    saveBets(game, bets);
    for (const b of done) {
      const text =
        b.state === 'won'
          ? `${b.fighter} has won. Your bet pays ${priceText(b.pay)}: collect it from the bookmaker.`
          : b.state === 'void'
            ? `${b.fighter} and ${b.other} were sent off standing. Your stake comes back from the bookmaker.`
            : `${b.fighter} has lost. The bookmaker thanks you.`;
      game.events.emit('rpg:notify', { text, kind: 'info' });
    }
  });
}

// ------------------------------------------------------------------ the card

function betCard(game: Game, closedWhy: () => string | null, bankWhy: (w: WagerDef, stake: number) => string | null, place: (owner: string, side: 0 | 1, stakeIx: number) => { ok: boolean; text: string }): DialogueDef {
  const owner = (c: { npcId: string }) => c.npcId.replace(/^bet:/, '');
  const wager = (c: { npcId: string }) => wagerOf(game, owner(c));
  const pair = () => (closedWhy() ? null : upcoming(game, 1));
  const name = (side: 0 | 1) => {
    const p = pair();
    return p ? (side === 0 ? p.a.name : p.b.name) : '…';
  };

  const back = (side: 0 | 1): DialogueChoice => ({
    text: () => {
      const p = pair();
      const g = p ? (side === 0 ? p.a : p.b) : null;
      return g ? `Back ${g.name} (${g.armatura}, ${g.fights} fights, ${g.wins} palm${g.wins === 1 ? '' : 's'})` : '…';
    },
    if: () => !!pair(),
    effects: (c) => void pending.set(owner(c), side),
    goto: 'stake',
  });

  const stakeChoices: DialogueChoice[] = [0, 1, 2, 3].map((i) => ({
    text: (c) => {
      const w = wager(c);
      const s = w?.stakes[i];
      if (s === undefined) return '…';
      const label = `${priceText(s)} on ${name(pending.get(owner(c)) ?? 0)}`;
      const why = (c.game.player?.inventory?.denarii ?? 0) + 1e-9 < s ? 'You haven’t the money.' : w ? bankWhy(w, s) : null;
      return why ? `${label} — ${why.replace(/^He taps the tablet\. “|”$/g, '').replace(/\.$/, '')}` : label;
    },
    if: (c) => wager(c)?.stakes[i] !== undefined,
    enabled: (c) => {
      const w = wager(c);
      const s = w?.stakes[i];
      return s !== undefined && (c.game.player?.inventory?.denarii ?? 0) + 1e-9 >= s && !bankWhy(w!, s);
    },
    effects: (c) => void place(owner(c), pending.get(owner(c)) ?? 0, i),
    goto: 'placed',
  }));

  const nodes: Record<string, DialogueNode> = {
    none: { text: () => closedWhy() ?? 'Nothing to bet on yet.', choices: [{ text: 'Collect my winnings.', if: (c) => owedNow(c.game) > 0, effects: (c) => void collectOwed(c.game, owner(c)), goto: 'collected' }, { text: 'Never mind.', end: true }] },
    card: {
      text: (c) => {
        const p = pair();
        const w = wager(c);
        const odds = w?.odds ?? DEFAULT_ODDS;
        const open = betsOf(c.game).filter((b) => b.state === 'open');
        const slips = open.length ? ` On your tally: ${open.map((b) => `${priceText(b.stake)} on ${b.fighter}`).join('; ')}.` : '';
        if (!p) return closedWhy() ?? 'Nothing to bet on yet.';
        return `The next pair: ${p.a.name} the ${p.a.armatura} against ${p.b.name} the ${p.b.armatura}. I pay ${odds} to one on the winner; a draw returns your stake.${slips}`;
      },
      choices: [
        back(0),
        back(1),
        { text: (c) => `Collect my winnings. (${priceText(owedNow(c.game))})`, if: (c) => owedNow(c.game) > 0, effects: (c) => void collectOwed(c.game, owner(c)), goto: 'collected' },
        { text: 'Not now.', end: true },
      ],
    },
    placed: { text: () => said, next: 'card' },
    collected: { text: () => lastCollectText(), next: 'card' },
  };
  // The stake node names whoever was picked.
  nodes.stake = {
    text: (c) => `How much on ${name(pending.get(owner(c)) ?? 0)}?`,
    choices: [...stakeChoices, { text: 'Back.', goto: 'card' }],
  };
  return { id: DIALOGUE, npcs: [], start: () => (closedWhy() ? 'none' : 'card'), nodes };
}
