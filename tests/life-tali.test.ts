/**
 * Tali under Augustus's rules and the bets on the games (docs/design/world-life.md §4.5, §5.4 D1):
 * scoring, face frequencies, the bank, the watch rule on the real runtime (with a stand-in game),
 * and the bookmaker's slips (settle, void, collect).
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/Rng';
import type { Game } from '../src/core/Game';
import { collectOwed, owedNow } from '../src/life/wager/bets';
import { canLay, exposure, owed, settle, stagedPair, voidStale, type Bet } from '../src/life/wager/betRules';
import { installLifeTali } from '../src/life/wager/tali';
import { bankSpent, dogsAndSixes, FACE_NAMES, isVenus, playRound, throwFour, throwOne, throwText, type Dicer, type Face } from '../src/life/wager/taliRules';

/** An rng that returns these faces in turn (1 → 0.05, 3 → 0.3, 4 → 0.7, 6 → 0.95). */
function rigged(faces: Face[]) {
  const at: Record<Face, number> = { 1: 0.05, 3: 0.3, 4: 0.7, 6: 0.95 };
  let i = 0;
  return { next: () => at[faces[i++ % faces.length]] };
}

describe('tali scoring', () => {
  it('Venus is four different faces; a dog or a six puts a stake in', () => {
    expect(isVenus([1, 3, 4, 6])).toBe(true);
    expect(isVenus([6, 4, 3, 1])).toBe(true);
    expect(isVenus([1, 1, 3, 4])).toBe(false);
    expect(isVenus([3, 3, 4, 4])).toBe(false);
    expect(dogsAndSixes([1, 3, 4, 6])).toBe(2);
    expect(dogsAndSixes([1, 1, 6, 6])).toBe(4);
    expect(dogsAndSixes([3, 3, 4, 4])).toBe(0);
    expect(dogsAndSixes([1, 3, 3, 6])).toBe(2);
  });

  it('names the faces the way the dicers call them', () => {
    expect(FACE_NAMES[1]).toBe('canis');
    expect(FACE_NAMES[6]).toBe('senio');
    expect(throwText([6, 4, 3, 1])).toBe('canis, 3, 4, senio');
  });

  it('faces come up 10 : 40 : 40 : 10 over 10,000 throws, within one percentage point', () => {
    const rng = new Rng('tali:frequency');
    const n: Record<number, number> = { 1: 0, 3: 0, 4: 0, 6: 0 };
    const throws = 10_000;
    for (let i = 0; i < throws; i++) for (const f of throwFour(rng)) n[f]++;
    const total = throws * 4;
    expect(Math.abs(n[1] / total - 0.1)).toBeLessThan(0.01);
    expect(Math.abs(n[3] / total - 0.4)).toBeLessThan(0.01);
    expect(Math.abs(n[4] / total - 0.4)).toBeLessThan(0.01);
    expect(Math.abs(n[6] / total - 0.1)).toBeLessThan(0.01);
    // And a single talus never lands outside the four faces.
    for (let i = 0; i < 1000; i++) expect([1, 3, 4, 6]).toContain(throwOne(rng));
  });

  it('Venus (about 3.84% of throws) is rare enough that a pot grows', () => {
    const rng = new Rng('tali:venus');
    let v = 0;
    const throws = 50_000;
    for (let i = 0; i < throws; i++) if (isVenus(throwFour(rng))) v++;
    expect(Math.abs(v / throws - 0.0384)).toBeLessThan(0.004);
  });
});

describe('a round of tali', () => {
  const ring: Dicer[] = [{ name: 'You', you: true }, { name: 'Phrixus' }, { name: 'Lysias' }];

  it('puts a stake in for each dog and six and gives the pot to Venus', () => {
    // You: Venus (1 3 4 6: two stakes); Phrixus 1 1 6 6 (four stakes); Lysias 3 3 4 4 (none).
    const r = playRound(ring, 0, 0.25, rigged([1, 3, 4, 6, 1, 1, 6, 6, 3, 3, 4, 4]));
    expect(r.turns[0].venus).toBe(true);
    expect(r.paid).toBe(0.5);
    // You took the pot at your own throw: your two stakes, and not Phrixus's (he throws after you).
    expect(r.won).toBe(0.5);
    expect(r.pot).toBe(1);
    expect(r.turns[1].venus).toBe(false);
  });

  it('carries the pot over until somebody throws Venus', () => {
    const quiet = rigged([1, 1, 3, 4, 6, 6, 3, 4, 1, 3, 3, 3]);
    let pot = 0;
    for (let i = 0; i < 3; i++) pot = playRound(ring, pot, 0.0625, quiet).pot;
    expect(pot).toBeGreaterThan(0);
    const venus = playRound([{ name: 'Lysias' }, { name: 'You', you: true }], pot, 0.0625, rigged([3, 3, 4, 4, 1, 3, 4, 6]));
    expect(venus.won).toBeGreaterThan(0);
    expect(venus.pot).toBe(0);
  });

  it('the bank stops play when it is spent, and never pays a pot past it', () => {
    const bank = 3;
    const stake = 0.25;
    // You always throw Venus, the others throw dogs and sixes (a fat pot every round).
    const faces: Face[] = [1, 3, 4, 6, 1, 1, 6, 6, 1, 1, 6, 6];
    const rng = rigged(faces);
    let net = 0;
    let pot = 0;
    let rounds = 0;
    while (!bankSpent(net, bank) && rounds < 50) {
      const r = playRound(ring, pot, stake, rng, bank - net);
      pot = r.pot;
      net += r.won - r.paid;
      rounds++;
      expect(net).toBeLessThanOrEqual(bank + 1e-9);
    }
    expect(bankSpent(net, bank)).toBe(true);
    expect(rounds).toBeLessThan(10);
    expect(net).toBeCloseTo(bank, 6);
  });

  it('with ordinary luck the table never loses more than its bank in a day', () => {
    const rng = new Rng('tali:bank');
    for (let day = 0; day < 400; day++) {
      let net = 0;
      let pot = 0;
      let rounds = 0;
      while (!bankSpent(net, 3) && rounds++ < 300) {
        const r = playRound(ring, pot, 0.25, rng, 3 - net);
        pot = r.pot;
        net += r.won - r.paid;
      }
      expect(net).toBeLessThanOrEqual(3 + 1e-9);
    }
  });
});

// ------------------------------------------------------------------ the watch, on the real runtime

describe('the watch rule', () => {
  /** A stand-in game: a keeper's table, a purse, and a population we can put guards in. */
  function table(guards: { x: number; z: number }[]) {
    const store = new Map<string, number>();
    const spent: number[] = [];
    let denarii = 50;
    const keeperPos = { x: 100, y: 0, z: 100 };
    const game = {
      rng: undefined,
      events: { emit() {}, on() {} },
      dialogue: { register() {}, start: () => ({}) },
      life: {
        keeper: () => ({ id: 'keeper-test-aleator', name: 'Phrixus', wager: 'wgr.tali.test' }),
        data: { wagers: [{ id: 'wgr.tali.test', game: 'tali', stakes: [0.0625, 0.125, 0.1875, 0.25], bank: 3, watchRadius: 18, period: '[G]' }] },
        store: {
          today: (k: string) => store.get(k) ?? 0,
          addToday: (k: string, n = 1) => store.set(k, (store.get(k) ?? 0) + n).get(k)!,
        },
      },
      player: {
        position: { x: 100, y: 0, z: 104 },
        inventory: {
          get denarii() {
            return denarii;
          },
          spendDenarii: (n: number) => ((denarii -= n), spent.push(n), true),
          addDenarii: (n: number) => void (denarii += n),
        },
      },
      population: {
        get: () => ({ position: keeperPos }),
        isGuard: () => true,
        near: (p: { x: number; z: number }, r: number) => guards.filter((g) => Math.hypot(g.x - p.x, g.z - p.z) <= r).map((g) => ({ ...g, dead: false })),
      },
    } as unknown as Game;
    installLifeTali(game);
    return { game, spent };
  }

  it('refuses a game with a guard within 18 m, and plays without one', () => {
    const near = table([{ x: 110, z: 100 }]);
    expect(near.game.lifeTali.watchNear('keeper-test-aleator')).toBe(true);
    const refused = near.game.lifeTali.round('keeper-test-aleator', 0);
    expect(refused.ok).toBe(false);
    expect(refused.text).toBe('Not with the watch looking.');
    expect(near.spent).toEqual([]);

    const far = table([{ x: 140, z: 100 }]);
    expect(far.game.lifeTali.watchNear('keeper-test-aleator')).toBe(false);
    const played = far.game.lifeTali.round('keeper-test-aleator', 0);
    expect(played.ok).toBe(true);
    expect(played.text).toMatch(/throw/);
  });

  it('a vigil walking up at 17 m ends the play, one at 19 m does not', () => {
    const t = table([]);
    expect(t.game.lifeTali.round('keeper-test-aleator', 1).ok).toBe(true);
    const at17 = table([{ x: 117, z: 100 }]);
    expect(at17.game.lifeTali.watchNear('keeper-test-aleator')).toBe(true);
    const at19 = table([{ x: 119, z: 100 }]);
    expect(at19.game.lifeTali.watchNear('keeper-test-aleator')).toBe(false);
  });

  it('stops for the day when the bank is spent', () => {
    const t = table([]);
    // Force a win of the whole bank into today's net, then ask for a round.
    t.game.life.store.addToday('net:wgr.tali.test', 3);
    const r = t.game.lifeTali.round('keeper-test-aleator', 0);
    expect(r.ok).toBe(false);
    expect(r.text).toBe('Enough of your luck for one day.');
  });
});

// ------------------------------------------------------------------ the bookmaker's slips

describe('bets on the games', () => {
  const slip = (patch: Partial<Bet> = {}): Bet => ({ owner: 'keeper-colos-sponsor', wager: 'wgr.munus.colos', day: 4, fighter: 'Tetraites', other: 'Celadus', stake: 1, state: 'open', pay: 0, ...patch });
  const bout = (winner: string | null, loser: string | null, lusio = false) => ({ winner, loser, verdict: winner ? 'mitte' : 'stantes', lusio });

  it('reads the pair on the sand from the director’s status line', () => {
    expect(stagedPair('munus (by Caesar’s gift) · pairs · pos 8.10 · house 96% (1000/1000) · Tetraites v Celadus [fight]')).toEqual(['Tetraites', 'Celadus']);
    expect(stagedPair('no games today · closed · pos 4.00 · house 0% (0/0) · sand empty')).toBeNull();
  });

  it('a win pays 1.8× (to the as), a loss nothing, a draw returns the stake', () => {
    const win = slip();
    const lose = slip({ fighter: 'Celadus', other: 'Tetraites' });
    const draw = slip({ stake: 0.5 });
    settle([win, lose], ['Tetraites', 'Celadus'], bout('Tetraites', 'Celadus'), 1.8);
    expect(win).toMatchObject({ state: 'won', pay: 1.8125 });
    expect(lose).toMatchObject({ state: 'lost', pay: 0 });
    settle([draw], ['Tetraites', 'Celadus'], bout(null, null), 1.8);
    expect(draw).toMatchObject({ state: 'void', pay: 0.5 });
  });

  it('settles only the pair that fought, and never a practice bout', () => {
    const b = slip();
    settle([b], ['Pugnax', 'Spiculus'], bout('Pugnax', 'Spiculus'), 1.8);
    expect(b.state).toBe('open');
    settle([b], ['Tetraites', 'Celadus'], bout('Tetraites', 'Celadus', true), 1.8);
    expect(b.state).toBe('open');
    settle([b], null, bout('Tetraites', 'Celadus'), 1.8);
    expect(b.state).toBe('open');
  });

  it('a bet whose pair never fought comes back the next day', () => {
    const b = slip({ day: 4 });
    expect(voidStale([b], 4)).toEqual([]);
    expect(voidStale([b], 5)).toEqual([b]);
    expect(b).toMatchObject({ state: 'void', pay: 1 });
    expect(owed([b])).toEqual({ total: 1, slips: 1 });
  });

  it('the bookmaker’s bank limits what he lays in a day', () => {
    const open = [slip({ stake: 4 }), slip({ stake: 4 }), slip({ stake: 4 })];
    expect(exposure(open, 1.8)).toBeCloseTo(9.5625, 6);
    // 3 bets of 4 d. put 9.56 d. at risk; a fourth (3.19 more) would pass his bank of 10.
    expect(canLay(open, 4, 4, 1.8, 10)).toBe(false);
    expect(canLay(open.slice(0, 2), 4, 4, 1.8, 10)).toBe(true);
    expect(canLay([], 4, 4, 1.8, 10)).toBe(true);
  });

  it('the player collects a win from the bookmaker once, and the purse goes up', () => {
    let denarii = 2;
    const kv = new Map<string, unknown>([['munus-bets', [slip({ state: 'won', pay: 1.8125 }), slip({ state: 'lost' }), slip({ state: 'void', pay: 0.5 })]]]);
    const game = {
      time: { dayIndex: 4 },
      life: { store: { get: (k: string) => kv.get(k), set: (k: string, v: unknown) => (v === undefined ? kv.delete(k) : kv.set(k, v)) } },
      player: { inventory: { addDenarii: (n: number) => void (denarii += n) } },
    } as unknown as Game;
    expect(owedNow(game)).toBeCloseTo(2.3125, 6);
    expect(collectOwed(game, 'keeper-colos-sponsor')).toMatch(/won/);
    expect(denarii).toBeCloseTo(4.3125, 6);
    expect(owedNow(game)).toBe(0);
    expect(collectOwed(game, 'keeper-colos-sponsor')).toMatch(/Nothing owed/);
    expect(denarii).toBeCloseTo(4.3125, 6);
  });
});
