/**
 * The economy rule of crafting and games (docs/design/world-life.md §4.6, §5.4 D1): crafting and
 * dice are not a way to get rich. Crafting a remedy and selling it back recovers its inputs plus a
 * modest margin at most (never more than 2× at the best prices anyone ever gets); a 30-day
 * simulation of best play stays inside the daily caps (the dice banks, the bookmaker's bank, and
 * what the shops' stock and a working day let a crafter make).
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/Rng';
import { craftXp, inputCostBest, SELL_BACK_MAX, sellBackBest } from '../src/life/craft/rules';
import pendingFascia from '../src/life/data/recipes/_pending-fascia';
import { LIFE } from '../src/life/registry';
import { canLay, settle, type Bet } from '../src/life/wager/betRules';
import { bankSpent, playRound, type Dicer } from '../src/life/wager/taliRules';
import { loadNpcContent } from '../src/npc/registry';
import { buyPrice, sellPrice, type PriceContext } from '../src/rpg/barter';
import { BARTER } from '../src/rpg/data/tuning';
import { ITEMS } from '../src/rpg/data/items';
import type { ItemDef } from '../src/rpg/types';
import type { Recipe } from '../src/life/types';

const DEF = new Map<string, ItemDef>(ITEMS.map((d) => [d.id, d]));
const value = (id: string) => DEF.get(id)?.value ?? 0;
// The held-out fascia recipe is checked too, with a plausible price for its linen (the item comes later).
const LINTEUM = 2 / 16;
const valueOf = (id: string) => (id === 'linteum' ? LINTEUM : value(id));
const RECIPES: Recipe[] = [...LIFE.recipes, ...(pendingFascia.recipes ?? [])];

// The best any player ever does: Mercatura 100, disposition +20, market day, haggled.
const BEST: PriceContext = { mercatura: 100, disposition: 20, buyDiscount: 0.5, sellBonus: 0.5 };
const WORST: PriceContext = { mercatura: 0, disposition: 0 };

describe('the mortar economy', () => {
  it('has the recipes the design lists (the fascia waits for its linen)', () => {
    expect(LIFE.recipes.map((r) => r.id).sort()).toEqual(
      ['rec.mortar.collyrium', 'rec.mortar.emplastrum', 'rec.mortar.febrifugum', 'rec.mortar.posca', 'rec.mortar.soporificum', 'rec.mortar.theriaca'].sort(),
    );
    expect(pendingFascia.recipes?.[0].id).toBe('rec.mortar.fascia');
  });

  it('no recipe sells back for more than 2× its inputs at the best prices', () => {
    for (const r of RECIPES) {
      const cost = inputCostBest(r, valueOf, BARTER.buyFloor);
      const back = sellBackBest(r, valueOf, BARTER.sellCap);
      expect(back, `${r.id}: back ${back.toFixed(3)} d against inputs ${cost.toFixed(3)} d`).toBeLessThanOrEqual(cost * SELL_BACK_MAX + 1e-9);
    }
  });

  it('a new crafter loses money: the same sale at ordinary prices gives back less than the inputs', () => {
    for (const r of RECIPES) {
      const cost = r.inputs.reduce((s, i) => s + buyPrice(valueOf(i.item), WORST) * i.count, 0);
      const out = DEF.get(r.output.item);
      const each = out ? (sellPrice(out, WORST) ?? 0) : 0;
      // Posca is the one that can break even (its water is free); nothing may profit.
      expect(each * r.output.count, r.id).toBeLessThanOrEqual(cost + 1e-9);
    }
  });

  it('recipes follow the XP rule (10 + 5 per effect) and have a medicina ladder', () => {
    const effects = (id: string) => DEF.get(id)?.effects?.length ?? 0;
    for (const r of RECIPES) expect(r.xp, r.id).toBe(craftXp(effects(r.output.item)));
    const levels = RECIPES.map((r) => r.minLevel).sort((a, b) => a - b);
    expect(levels[0]).toBe(0);
    expect(levels[levels.length - 1]).toBe(55);
  });
});

// ------------------------------------------------------------------ 30 days of best play

/** Counts of each ingredient the city sells per two-day restock (vendors' stock in the NPC data). */
function supplyPerCycle(): Map<string, number> {
  const out = new Map<string, number>();
  for (const n of loadNpcContent()) for (const s of n.vendor?.stock ?? []) out.set(s.id, (out.get(s.id) ?? 0) + s.count);
  for (const k of LIFE.keepers) for (const s of k.shop?.stock ?? []) out.set(s.id, (out.get(s.id) ?? 0) + s.count);
  return out;
}

describe('30 simulated days of best play', () => {
  const DAYS = 30;

  it('dice stay inside the banks of the two tables', () => {
    const wagers = LIFE.wagers.filter((w) => w.game === 'tali');
    expect(wagers.length).toBe(2);
    const dicers: Dicer[] = [{ name: 'You', you: true }, { name: 'A' }, { name: 'B' }];
    const rng = new Rng('economy:dice');
    let total = 0;
    let cap = 0;
    for (let day = 0; day < DAYS; day++) {
      for (const w of wagers) {
        // Best play: the biggest stake, until the bank says stop or luck runs out (a purse of 40 d).
        let net = 0;
        let pot = 0;
        let purse = 40;
        let rounds = 0;
        while (!bankSpent(net, w.bank) && purse >= 4 * w.stakes[3] && rounds++ < 400) {
          const k = rounds % dicers.length;
          const r = playRound([...dicers.slice(k), ...dicers.slice(0, k)], pot, w.stakes[3], rng, w.bank - net);
          pot = r.pot;
          net += r.won - r.paid;
          purse += r.won - r.paid;
        }
        // The most a day can give: the bank, and not a quadrans over.
        expect(net, `${w.id} day ${day}`).toBeLessThanOrEqual(w.bank + 1e-9);
        total += Math.max(0, net);
        cap += w.bank;
      }
    }
    expect(total).toBeLessThanOrEqual(cap + 1e-9);
    expect(cap).toBe(DAYS * 2 * 3);
  });

  it('the bookmaker lays no more than his bank in a day', () => {
    const w = LIFE.wagers.find((x) => x.game === 'munus')!;
    const odds = w.odds ?? 1.8;
    const rng = new Rng('economy:bets');
    let worstDay = 0;
    for (let day = 0; day < DAYS; day++) {
      const bets: Bet[] = [];
      // The punter lays the biggest stake he is allowed, every pair, and wins every time (the worst day).
      for (let pair = 0; pair < 8; pair++) {
        const stake = w.stakes[w.stakes.length - 1];
        if (!canLay(bets, day, stake, odds, w.bank)) continue;
        const b: Bet = { owner: 'k', wager: w.id, day, fighter: `A${pair}`, other: `B${pair}`, stake, state: 'open', pay: 0 };
        bets.push(b);
        // He wins every pair when the dice say so; here always (the bookmaker's worst day).
        settle(bets, [b.fighter, b.other], { winner: b.fighter, loser: b.other, verdict: 'mitte', lusio: false }, odds);
        void rng;
      }
      const net = bets.reduce((s, b) => s + (b.state === 'won' ? b.pay - b.stake : 0), 0);
      worstDay = Math.max(worstDay, net);
      expect(net, `day ${day}`).toBeLessThanOrEqual(w.bank + 1e-9);
    }
    expect(worstDay).toBeLessThanOrEqual(w.bank);
  });

  it('crafting for money stays inside the stock of the shops and a working day', () => {
    // Prices at the best a player gets. Each two-day cycle the shops hold SUPPLY of each herb; a
    // working day has 12 hours at the bench. Greedy: always make the most profitable batch left.
    const supply = supplyPerCycle();
    const hoursPerDay = 12;
    let profit = 0;
    for (let cycle = 0; cycle < DAYS / 2; cycle++) {
      const left = new Map(supply);
      let hours = hoursPerDay * 2;
      for (;;) {
        let best: { r: Recipe; gain: number } | null = null;
        for (const r of LIFE.recipes) {
          if (r.hours > hours) continue;
          if (!r.inputs.every((i) => i.item === 'aqua' || (left.get(i.item) ?? 0) >= i.count)) continue;
          const cost = r.inputs.reduce((s, i) => s + buyPrice(value(i.item), BEST) * i.count, 0);
          const out = DEF.get(r.output.item)!;
          const gain = (sellPrice(out, BEST) ?? 0) * r.output.count - cost;
          if (gain > 0 && (!best || gain / r.hours > best.gain / best.r.hours)) best = { r, gain };
        }
        if (!best) break;
        for (const i of best.r.inputs) if (i.item !== 'aqua') left.set(i.item, (left.get(i.item) ?? 0) - i.count);
        hours -= best.r.hours;
        profit += best.gain;
      }
    }
    // The cap: about what a good day's honest work pays (a porter makes 24 as = 1.5 d. a day).
    const perDay = profit / DAYS;
    expect(perDay, `crafting for profit: ${perDay.toFixed(2)} d. a day`).toBeLessThanOrEqual(CRAFT_CAP_PER_DAY);
  });
});

/** The most a crafter may clear in a game day at the very best prices (denarii). */
const CRAFT_CAP_PER_DAY = 2.5;
