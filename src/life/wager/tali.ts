/**
 * Dice at the two tables (docs/design/world-life.md §4.5): "Deal me in" opens a card in the
 * conversation panel. The rules are Augustus's own (taliRules.ts); one choice is one round, and the
 * dicers throw by themselves. The stake is 1 to 4 asses a die (the wager's stakes, choices 1 to 4).
 *
 *  - The table's bank (wager.bank, denarii a game day) caps WINNINGS only: once the player is up by that
 *    much today the table says "Enough of your luck for one day", and a pot is paid only as far as the
 *    bank allows. Losses are not capped; the player can always walk away (and a throw needs the coin
 *    to cover four stakes, so a sitting never leaves the purse below zero).
 *  - The watch: no game with a guard or a vigil within `watchRadius` of the table (18 m in the Subura, 9 m on the Forum steps), and the
 *    bones go up a sleeve if one walks up mid-game. Gambling was illegal and tolerated (Martial 4.14).
 *  - No cheating in phase 2.
 *
 *   game.lifeTali.open(owner)           sit down (false: refused, with the reason said in the card)
 *   game.lifeTali.round(owner, stakeIx) one round now (tests and the console); returns the text
 *   game.lifeTali.watchNear(owner)      is the watch about?
 */
import { Rng } from '../../core/Rng';
import type { Game } from '../../core/Game';
import type { DialogueChoice, DialogueDef, DialogueNode } from '../../dialogue/types';
import { priceText } from '../effects';
import { registerWager } from '../talk';
import type { WagerDef } from '../types';
import { bankSpent, playRound, throwText, type Dicer } from './taliRules';

declare module '../../core/Game' {
  interface Game {
    lifeTali: LifeTali;
  }
}

export interface LifeTali {
  open(owner: string): boolean;
  round(owner: string, stakeIx: number): { ok: boolean; text: string };
  watchNear(owner: string): boolean;
  /** The player's net today at a table (denarii; negative: down). */
  netToday(wagerId: string): number;
}

const DIALOGUE = 'life:tali';
const DEFAULT_WATCH = 18;

/** The other dicers at each table (a sitting is the player and two). */
const NAMES = ['Lysias', 'Crito', 'Gaius the Cobbler', 'Eros', 'Damas', 'a muleteer', 'a sailor off the Tiber boats', 'Hylas'];

interface Sitting {
  dicers: Dicer[];
  pot: number;
  rounds: number;
  /** The last round, told. */
  told: string;
}

const sittings = new Map<string, Sitting>();

const hashOf = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

export function installLifeTali(game: Game) {
  // A new Game starts with no sittings (the module-level map would outlive it).
  sittings.clear();
  const rng = game.rng ? game.rng.fork('tali') : new Rng('tali');
  const wagerOf = (owner: string): WagerDef | undefined => {
    const id = game.life?.keeper(owner)?.wager;
    return game.life?.data.wagers.find((w) => w.id === id && w.game === 'tali');
  };
  const netToday = (wagerId: string) => game.life?.store.today(`net:${wagerId}`) ?? 0;

  const watchNear = (owner: string): boolean => {
    const pop = game.population;
    const w = wagerOf(owner);
    const at = pop?.get(owner)?.position ?? game.player?.position;
    if (!pop || !at) return false;
    return pop.near(at, w?.watchRadius ?? DEFAULT_WATCH, (n) => pop.isGuard(n) && !n.dead).length > 0;
  };

  /** A new sitting: the player, the keeper and one more dicer (the same one at a table, by its id). */
  const sit = (owner: string): Sitting => {
    const keeperName = game.life?.keeper(owner)?.name ?? 'The dicer';
    const third = NAMES[hashOf(owner) % NAMES.length];
    const s: Sitting = { dicers: [{ name: 'You', you: true }, { name: keeperName }, { name: third }], pot: 0, rounds: 0, told: '' };
    sittings.set(owner, s);
    return s;
  };

  /** Why the player cannot throw now, or null. */
  const why = (owner: string, w: WagerDef, stake: number): string | null => {
    if (watchNear(owner)) return 'Not with the watch looking.';
    if (bankSpent(netToday(w.id), w.bank)) return 'Enough of your luck for one day.';
    if ((game.player?.inventory?.denarii ?? 0) + 1e-9 < 4 * stake) return 'You haven’t the coin to cover a bad throw.';
    return null;
  };

  const round = (owner: string, stakeIx: number): { ok: boolean; text: string } => {
    const w = wagerOf(owner);
    const s = sittings.get(owner) ?? sit(owner);
    if (!w) return { ok: false, text: 'He does not play.' };
    const stake = w.stakes[stakeIx];
    if (stake === undefined) return { ok: false, text: 'Not a stake.' };
    const no = why(owner, w, stake);
    if (no) {
      s.told = no;
      return { ok: false, text: no };
    }
    // The throwers go round the ring; the first changes each round.
    const k = s.rounds % s.dicers.length;
    const order = [...s.dicers.slice(k), ...s.dicers.slice(0, k)];
    const r = playRound(order, s.pot, stake, rng, w.bank - netToday(w.id));
    s.rounds++;
    s.pot = r.pot;
    const inv = game.player?.inventory;
    if (r.paid > 0) inv?.spendDenarii(r.paid);
    if (r.won > 0) inv?.addDenarii(r.won);
    game.life?.store.addToday(`net:${w.id}`, r.won - r.paid);
    game.events.emit('life:wager', { wager: w.id, staked: r.paid, won: r.won });
    const lines = r.turns.map((t) => {
      const who = t.you ? 'You throw' : `${t.who} throws`;
      if (t.venus) {
        if (t.you) return `${who} VENUS: ${throwText(t.throw)}. The pot is yours: ${priceText(t.took)}${r.capped ? ' (the table will not pay more than its bank; the rest stays with the dicers)' : ''}.`;
        return `${who} VENUS: ${throwText(t.throw)}, and sweeps the pot.`;
      }
      const n = t.stakes;
      return `${who} ${throwText(t.throw)}${n ? ` — ${n === 1 ? 'one' : n === 2 ? 'two' : n === 3 ? 'three' : 'four'} in the pot` : ''}.`;
    });
    s.told = lines.map((l) => l[0].toUpperCase() + l.slice(1)).join('\n');
    return { ok: true, text: s.told };
  };

  game.lifeTali = {
    open: (owner) => {
      const w = wagerOf(owner);
      if (!w) return false;
      const s = sit(owner);
      s.told = '';
      return !!game.dialogue?.start(`tali:${owner}`, { name: game.life?.keeper(owner)?.name ?? 'Dicer', dialogueId: DIALOGUE });
    },
    round,
    watchNear,
    netToday,
  };

  registerWager('tali', (g, _w, owner) => g.lifeTali.open(owner));
  game.dialogue?.register(taliCard(wagerOf, why, round, netToday, watchNear));
}

// ------------------------------------------------------------------ the card

function taliCard(
  wagerOf: (owner: string) => WagerDef | undefined,
  why: (owner: string, w: WagerDef, stake: number) => string | null,
  round: (owner: string, stakeIx: number) => { ok: boolean; text: string },
  netToday: (wagerId: string) => number,
  watchNear: (owner: string) => boolean,
): DialogueDef {
  const owner = (c: { npcId: string }) => c.npcId.replace(/^tali:/, '');

  const throwChoices: DialogueChoice[] = [0, 1, 2, 3].map((i) => ({
    text: (c) => {
      const w = wagerOf(owner(c));
      const s = w?.stakes[i];
      if (!w || s === undefined) return '…';
      const label = `Throw: ${priceText(s)} a die`;
      const no = why(owner(c), w, s);
      return no ? `${label} — ${no}` : label;
    },
    if: (c) => wagerOf(owner(c))?.stakes[i] !== undefined,
    enabled: (c) => {
      const w = wagerOf(owner(c));
      const s = w?.stakes[i];
      return !!w && s !== undefined && !why(owner(c), w, s);
    },
    effects: (c) => void round(owner(c), i),
    goto: 'table',
  }));

  const nodes: Record<string, DialogueNode> = {
    table: {
      text: (c) => {
        const o = owner(c);
        // The watch about: the bones are gone up a sleeve, and nothing else is said.
        if (watchNear(o)) return '“Not with the watch looking,” hisses the dicer, and the bones vanish up a sleeve. The others look at the sky.';
        const s = sittings.get(o);
        const w = wagerOf(o);
        const net = w ? netToday(w.id) : 0;
        const pot = s && s.pot > 0 ? `The pot: ${priceText(s.pot)}.` : 'The pot is empty.';
        const day = net > 0 ? ` You are ${priceText(net)} up today.` : net < 0 ? ` You are ${priceText(-net)} down today.` : '';
        const told = s?.told ? `${s.told}\n\n` : '';
        const intro = s && s.rounds === 0 && !s.told ? 'Four bones each, in turn. A dog or a six puts your stake in the pot; four different faces, Venus, takes it. ' : '';
        return `${told}${intro}${pot}${day}`;
      },
      choices: [...throwChoices, { text: 'Gather my money and leave the game.', end: true }],
    },
  };
  return { id: DIALOGUE, npcs: [], start: () => 'table', nodes };
}
