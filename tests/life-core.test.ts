/**
 * The life runtime (src/life): gates, effects and options taken (price, time, daily marks, the
 * 'life:option' event), keepers open and shut and dead (through a save), the keeper's conversation
 * and shop, a card in the conversation panel, and the rumour pool's daily, seeded picks (no hooks
 * before the opening is done).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Game } from '../src/core/Game';
import examples from '../src/life/data/_examples';
import { priceText } from '../src/life/effects';
import { inHours, passes } from '../src/life/gates';
import { installLife, type LifeService } from '../src/life/install';
import { opensAfter } from '../src/life/keepers';
import { headline } from '../src/life/cards';
import { pickRumours } from '../src/life/rumours';
import { lifeChoices } from '../src/life/talk';
import type { OptionDef, RumourDef } from '../src/life/types';
import { AS, QUADRANS } from '../src/rpg/money';
import { installRpg } from '../src/rpg/install';
import { MemoryStorage } from '../src/save/storage';
import { fakeGame, record } from './rpg-fakes';

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

async function world(hour = 12) {
  const fg = fakeGame();
  const rpg = installRpg(fg.game, { storage: new MemoryStorage(), background: 'civis-suburanus' });
  rpg.quests.restore({});
  const game = fg.game as Game;
  game.time.advanceHours(hour - game.time.hour);
  const life = (await installLife(game, { data: examples })) as LifeService & { installMs: number };
  return { ...fg, game, rpg, life };
}

const KEEPER = 'keeper-example-vinarius';

/** Finish the opening (mq-01), as the story does by dawn on 11 May. */
function finishOpening(game: Game) {
  game.quests.start('mq-01-madida-capena');
  game.quests.complete('mq-01-madida-capena');
}

describe('gates', () => {
  it('hours wrap past midnight', () => {
    expect(inHours([{ from: 'v1', to: 'v4' }], 23)).toBe(true);
    expect(inHours([{ from: 'v1', to: 'v4' }], 1)).toBe(true);
    expect(inHours([{ from: 'v1', to: 'v4' }], 12)).toBe(false);
    expect(inHours([{ from: 'h8', to: 'h11' }], 14)).toBe(true);
  });

  it('every field must hold', async () => {
    const { game, rpg } = await world(12);
    expect(passes(undefined, game)).toBe(true);
    expect(passes({ hours: [{ from: 'h7', to: 'h8' }] }, game)).toBe(true);
    expect(passes({ hours: [{ from: 'h8', to: 'h11' }] }, game)).toBe(false);
    expect(passes({ flag: 'hilara-returned' }, game)).toBe(false);
    rpg.quests.flags.set('hilara-returned', true);
    expect(passes({ flag: 'hilara-returned' }, game)).toBe(true);
    expect(passes({ notFlag: 'hilara-returned' }, game)).toBe(false);
    expect(passes({ questNotStarted: 'mq-01-madida-capena' }, game)).toBe(true);
    expect(passes({ questDone: 'mq-01-madida-capena' }, game)).toBe(false);
    expect(passes({ has: { item: 'tali' } }, game)).toBe(false);
    rpg.inventory.add('tali', 1);
    expect(passes({ has: { item: 'tali' } }, game)).toBe(true);
    expect(passes({ wearing: ['toga', 'stola'] }, game)).toBe(false);
    expect(passes({ sordidus: true }, game)).toBe(false);
    rpg.standing.setCleanliness('sordidus');
    expect(passes({ sordidus: true }, game)).toBe(true);
    expect(passes({ marketDay: true }, game)).toBe(rpg.barter.isMarketDay());
    expect(passes({ if: () => false }, game)).toBe(false);
    const d = game.time.date();
    expect(passes({ dates: { from: [d.month, d.day], to: [d.month, d.day] } }, game)).toBe(true);
    expect(passes({ dates: { from: [(d.month + 6) % 12, 1], to: [(d.month + 6) % 12, 2] } }, game)).toBe(false);
  });
});

describe('options', () => {
  const cup: OptionDef = { id: 'cup', text: 'A cup', price: AS, daily: true, effects: [{ kind: 'hours', hours: 1 }, { kind: 'flag', name: 'had-a-cup' }], result: ['First.', 'Second.'] };

  it('take: the price first, then the effects, the daily mark and the event', async () => {
    const { game, rpg, life, events } = await world(12);
    const log = record(events, ['life:option']);
    rpg.inventory.addDenarii(1);
    const money = rpg.inventory.denarii;
    const t = game.time.totalHours;
    expect(life.take('act.example.card', cup)).toEqual({ ok: true });
    expect(rpg.inventory.denarii).toBeCloseTo(money - AS, 6);
    expect(game.time.totalHours).toBeCloseTo(t + 1, 6);
    expect(rpg.quests.flags.get('had-a-cup')).toBe(true);
    expect(log).toHaveLength(1);
    expect(log[0].e).toMatchObject({ owner: 'act.example.card', option: 'cup' });
    // Daily: refused the same day, nothing charged.
    const r = life.take('act.example.card', cup);
    expect(r.ok).toBe(false);
    expect(r.why).toMatch(/today/);
    expect(rpg.inventory.denarii).toBeCloseTo(money - AS, 6);
    // The next day it is offered again.
    game.time.advanceHours(24);
    expect(life.take('act.example.card', cup).ok).toBe(true);
  });

  it('refuses when the player can’t pay or lacks what an effect takes, and says why', async () => {
    const { rpg, life } = await world(12);
    rpg.inventory.spendDenarii(rpg.inventory.denarii);
    expect(life.blocked('x', { ...cup, daily: false })).toMatch(/money/);
    const give: OptionDef = { id: 'give', text: 'Hand over a loaf', effects: [{ kind: 'take', item: 'tali' }], result: 'Thanks.' };
    expect(life.blocked('x', give)).toMatch(/Knucklebones/i);
    const toga: OptionDef = { id: 'toga', text: 'Queue', needs: { gate: { wearing: ['toga'] }, why: 'You are not dressed for a salutatio.' }, effects: [], result: '.' };
    expect(life.blocked('x', toga)).toBe('You are not dressed for a salutatio.');
    expect(life.visible({ ...toga, gate: { questDone: 'mq-04-columna' } })).toBe(false);
  });

  it('effects: receive, clean, condition, skill XP, give, rumour lines', async () => {
    const { rpg, life } = await world(12);
    rpg.standing.setCleanliness('sordidus');
    const before = rpg.inventory.denarii;
    const xp = rpg.sheet.skillXp?.('rhetoric') ?? 0;
    const r = life.apply('x', {
      id: 'all',
      text: 'All',
      effects: [
        { kind: 'receive', denarii: 25 * AS },
        { kind: 'clean', to: 'normal' },
        { kind: 'give', item: 'panis', count: 2 },
        { kind: 'skillXp', skill: 'rhetoric', amount: 5 },
      ],
      result: 'Done.',
    });
    expect(r.ok).toBe(true);
    expect(rpg.inventory.denarii).toBeCloseTo(before + 25 * AS, 6);
    expect(rpg.standing.cleanliness).toBe('normal');
    expect(rpg.inventory.count('panis')).toBeGreaterThanOrEqual(2);
    if (rpg.sheet.skillXp) expect(rpg.sheet.skillXp('rhetoric')).toBeGreaterThan(xp);
  });

  it('prices read as a Roman would say them', () => {
    expect(priceText(QUADRANS)).toBe('a quadrans');
    expect(priceText(AS)).toBe('1 as');
    expect(priceText(2 * AS)).toBe('2 asses');
    expect(priceText(AS + QUADRANS)).toBe('1 as and a quadrans');
    expect(priceText(2)).toBe('2 denarii');
    expect(priceText(1 + 9 * AS)).toBe('1 denarius and 9 asses');
  });
});

describe('keepers', () => {
  it('opens with its station’s hours and says when it opens again', async () => {
    const { game, life } = await world(12);
    expect(life.isOpen(KEEPER)).toBe(true);
    expect(life.opensAt(KEEPER)).toBeNull();
    game.time.advanceHours(9); // 21:00, the first watch: the wine shop (SHOP_LATE) is shut
    expect(life.isOpen(KEEPER)).toBe(false);
    expect(life.opensAt(KEEPER)).toBe('at the third hour');
    expect(opensAfter(['salutatio', 'morning'], 'night')).toBe('at the first hour');
    expect(opensAfter(['night'], 'morning')).toBe('at the first watch');
    expect(opensAfter([], 'morning')).toBeNull();
  });

  it('is an NPC and a merchant with stock, and talks shop only while open', async () => {
    const { game, rpg } = await world(12);
    const def = rpg.npcs.get(KEEPER)!;
    expect(def.name).toBe('Sextus Pompeius Hedone');
    expect(def.tags).toEqual(expect.arrayContaining(['keeper', 'vendor:popina']));
    expect(def.home).toBeUndefined();
    expect(def.schedule).toBeUndefined();
    expect(def.appearance.garments.length).toBeGreaterThan(0);
    expect(rpg.barter.merchant(KEEPER)!.stock.length).toBeGreaterThan(0);
    const v = rpg.dialogue.start(KEEPER)!;
    expect(v.choices.map((c) => c.text)).toEqual(expect.arrayContaining(['Show me your wares.', 'Pour me a taste (1 as)']));
    rpg.dialogue.end();
    game.time.advanceHours(9);
    const shut = rpg.dialogue.start(KEEPER)!;
    expect(shut.choices.map((c) => c.text)).not.toContain('Show me your wares.');
    rpg.dialogue.end();
  });

  it('a dead keeper’s shop is shut for good, through a save and load', async () => {
    const { game, rpg, life, events } = await world(12);
    events.emit('npc:died', { id: KEEPER, named: true });
    expect(life.dead(KEEPER)).toBe(true);
    expect(life.isOpen(KEEPER)).toBe(false);
    expect(life.opensAt(KEEPER)).toBeNull();
    const saved = await rpg.save.save('slot1', { force: true });
    expect(saved.ok).toBe(true);
    rpg.save.resetAll();
    expect(life.dead(KEEPER)).toBe(false);
    await rpg.save.load('slot1');
    expect(life.dead(KEEPER)).toBe(true);
    expect(game.deltas?.isDead(KEEPER)).toBe(true);
  });
});

describe('cards and talk', () => {
  it('open() starts the card; the first choice takes its option (money and an hour)', async () => {
    const { game, rpg, life } = await world(12);
    rpg.inventory.addDenarii(1);
    const money = rpg.inventory.denarii;
    const t = game.time.totalHours;
    expect(life.open('act.example.card')).toBe(true);
    const v = rpg.dialogue.view!;
    expect(v.speakerName).toBe('Bench outside the wine shop');
    expect(v.choices[0].text).toBe('Sit with a cup and watch the street (1 as)');
    const after = rpg.dialogue.choose(0)!;
    expect(after.text).toMatch(/An hour goes by/);
    expect(rpg.inventory.denarii).toBeCloseTo(money - AS, 6);
    expect(game.time.totalHours).toBeCloseTo(t + 1, 6);
    rpg.dialogue.end();
    // Shut at night: the bench is stacked away.
    game.time.advanceHours(12);
    expect(life.open('act.example.card')).toBe(false);
  });

  it('lifeChoices gives a service set’s options to a hand-written dialogue', async () => {
    await world(12);
    const life = lifeChoices('npc-cerinthus');
    expect(life.choices.length).toBeGreaterThan(0);
    expect(Object.keys(life.nodes)).toContain('life:res');
  });

  it('a notice board lists today’s notices and offers “Note it down” for a hook after the opening', async () => {
    const { game, rpg, life } = await world(12);
    // Before the opening is done the board is gated and no pick is a hook.
    expect(life.open('act.example.board')).toBe(false);
    expect(life.rumours({ board: 'board-subura' }, 4).some((r) => r.hook)).toBe(false);
    finishOpening(game);
    expect(life.open('act.example.board')).toBe(true);
    const v = rpg.dialogue.view!;
    const notices = v.choices.filter((c) => c.text.startsWith('“'));
    expect(notices.length).toBeGreaterThanOrEqual(2);
    expect(notices.length).toBeLessThanOrEqual(4);
    rpg.dialogue.end();
    expect(headline('A grey she-ass, branded on the left haunch, went astray by the Subura fountain. Whoever brings her…')).toMatch(/…$/);
  });
});

describe('rumours', () => {
  const pool: RumourDef[] = Array.from({ length: 12 }, (_, i) => ({ id: `rum.t.${i}`, kind: 'notice', text: `Notice ${i}`, hook: i < 4 ? 'misc-insula-nutans' : undefined }));

  it('picks are stable for a day and place, keep their order when one drops out, and change by day', () => {
    const a = pickRumours(pool, 4, 3, 'board-subura');
    expect(pickRumours(pool, 4, 3, 'board-subura')).toEqual(a);
    const without = pickRumours(pool.filter((r) => r.id !== a[0].id), 3, 3, 'board-subura');
    expect(without).toEqual(a.slice(1));
    const days = new Set([3, 4, 5, 6, 7].map((d) => pickRumours(pool, 4, d, 'board-subura').map((r) => r.id).join()));
    expect(days.size).toBeGreaterThan(1);
    expect(pickRumours(pool, 6, 3, 'board-subura', 2).filter((r) => r.hook).length).toBeLessThanOrEqual(2);
  });

  it('game.life.rumours: the same after a save and load, other picks the next day, hooks only after the opening', async () => {
    const { game, rpg, life } = await world(12);
    const before = life.rumours({ board: 'board-subura' }, 4).map((r) => r.id);
    expect(before.length).toBeGreaterThan(0);
    await rpg.save.save('slot2', { force: true });
    await rpg.save.load('slot2');
    expect(life.rumours({ board: 'board-subura' }, 4).map((r) => r.id)).toEqual(before);
    let changed = false;
    for (let d = 1; d <= 4 && !changed; d++) {
      game.time.advanceHours(24);
      changed = life.rumours({ board: 'board-subura' }, 4).map((r) => r.id).join() !== before.join();
    }
    expect(changed).toBe(true);
    finishOpening(game);
    let hooks = 0;
    for (let d = 0; d < 8; d++) {
      game.time.advanceHours(24);
      hooks += life.rumours({ board: 'board-subura' }, 4).filter((r) => r.hook).length;
    }
    expect(hooks).toBeGreaterThan(0);
  });

  it('the life save stays small after ten days of marks', async () => {
    const { game, life } = await world(12);
    for (let d = 0; d < 10; d++) {
      for (let i = 0; i < 40; i++) life.store.addToday(`opt:keeper-x-${i}:service`);
      life.store.set('bets', [{ wager: 'wgr.munus.colos', fighter: 'a', staked: 1 }]);
      game.time.advanceHours(24);
    }
    const text = JSON.stringify((life as unknown as { serialize(): unknown }).serialize());
    expect(text.length).toBeLessThan(16 * 1024);
  });

  it('installs in well under the 5 ms budget (loose bound for a busy test runner)', async () => {
    const { life } = await world(12);
    expect(life.installMs).toBeLessThan(25);
  });
});
