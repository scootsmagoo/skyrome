/**
 * Shopkeepers and teachers: 'dialogue:service' opens the barter panel over game.barter, trains a
 * lesson, repairs arms, treats wounds, rents a room. Prices and purses are BarterSystem's (GDD §7.4).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { barterViewFor, installServices } from '../src/content/services';
import type { Game } from '../src/core/Game';
import { installRpg } from '../src/rpg/install';
import { MemoryStorage } from '../src/save/storage';
import type { BarterView } from '../src/ui/types';
import { fakeGame, record } from './rpg-fakes';

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

function world() {
  const fg = fakeGame();
  const opened: BarterView[] = [];
  Object.assign(fg.game, { ui: { openBarter: (v: BarterView) => opened.push(v) } });
  const rpg = installRpg(fg.game, { storage: new MemoryStorage(), background: 'civis-suburanus' });
  rpg.quests.restore({});
  installServices(fg.game);
  const notes = record(fg.events, ['rpg:notify']);
  const text = () => notes.map((n) => String((n.e as { text: string }).text));
  return { ...fg, rpg, opened, notes, text, game: fg.game as Game };
}

describe('barter', () => {
  it('"Show me your wares" opens the arms dealer’s panel with his stock at §7.2 prices', async () => {
    const w = world();
    const v = w.rpg.dialogue.start('npc-euhodus');
    w.rpg.dialogue.choose(v!.choices.findIndex((c) => c.text.includes('wares')));
    await Promise.resolve();
    expect(w.opened).toHaveLength(1);
    const view = w.opened[0];
    expect(view.merchantName).toBe('Tiberius Claudius Euhodus');
    expect(view.merchantDenarii()).toBe(500);
    const goods = view.merchantGoods();
    expect(goods.map((g) => g.itemId)).toEqual(expect.arrayContaining(['gladius', 'pugio', 'scutum', 'fascia']));
    const gladius = goods.find((g) => g.itemId === 'gladius')!;
    expect(gladius.count).toBe(3);
    expect(gladius.price).toBeGreaterThanOrEqual(22); // never below the base value with a Trade 10 buyer
  });

  it('buys and sells in one deal; refuses stolen goods and quest items; checks funds first', () => {
    const w = world();
    const view = barterViewFor(w.game, 'npc-euhodus')!;
    const inv = w.rpg.inventory;
    inv.addDenarii(100);
    const before = inv.denarii;
    const price = view.merchantGoods().find((g) => g.itemId === 'pugio')!.price;
    expect(view.commit({ buy: [{ itemId: 'pugio', count: 1 }], sell: [] })).toEqual({ ok: true });
    expect(inv.count('pugio')).toBe(1);
    expect(inv.denarii).toBeCloseTo(before - price, 3);
    expect(view.merchantDenarii()).toBeGreaterThan(500);

    // The player's list: no quest items; a stolen stack is marked and refused by an honest dealer.
    inv.add('quest-tabella-signata');
    inv.add('gladius', 1, { stolenFrom: 'someone' });
    const goods = view.playerGoods();
    expect(goods.some((g) => g.itemId === 'quest-tabella-signata')).toBe(false);
    const hot = goods.find((g) => g.itemId === 'gladius')!;
    expect(hot.stolen).toBe(true);
    expect(hot.refuse).toBe('Stolen goods');
    expect(view.commit({ buy: [], sell: [{ itemId: 'gladius', count: 1 }] })).toMatchObject({ ok: false });
    expect(inv.count('gladius', { stolen: true })).toBe(1);

    // Too poor, and a merchant who has run out.
    expect(view.commit({ buy: [{ itemId: 'gladius-noric', count: 1 }, { itemId: 'lorica-hamata', count: 1 }, { itemId: 'galea-italica', count: 1 }], sell: [] })).toMatchObject({ ok: false });
    expect(view.commit({ buy: [{ itemId: 'gladius', count: 9 }], sell: [] })).toMatchObject({ ok: false, reason: expect.stringContaining('not have') });
    expect(inv.count('gladius-noric')).toBe(0); // nothing changed hands
  });

  it('a sale never beats the buying price (no arbitrage) and the sold item joins the merchant’s stock', () => {
    const w = world();
    const view = barterViewFor(w.game, 'npc-euhodus')!;
    const inv = w.rpg.inventory;
    inv.addDenarii(200);
    const buy = view.merchantGoods().find((g) => g.itemId === 'fustis')!.price;
    view.commit({ buy: [{ itemId: 'fustis', count: 1 }], sell: [] });
    const spare = view.playerGoods().find((g) => g.itemId === 'fustis' && !g.equipped);
    if (spare) {
      const m0 = view.merchantGoods().find((g) => g.itemId === 'fustis')!.count;
      expect(spare.price).toBeLessThan(buy);
      expect(view.commit({ buy: [], sell: [{ itemId: 'fustis', count: spare.count }] })).toEqual({ ok: true });
      expect(view.merchantGoods().find((g) => g.itemId === 'fustis')!.count).toBeGreaterThanOrEqual(m0);
    }
  });

  it('the popina buys food and sells wine; the aedituus sells cakes and incense', () => {
    const w = world();
    const popina = barterViewFor(w.game, 'npc-chreste')!;
    expect(popina.merchantGoods().map((g) => g.itemId)).toEqual(expect.arrayContaining(['vinum', 'panis', 'lupini', 'cicer']));
    const castor = barterViewFor(w.game, 'npc-philetus')!;
    expect(castor.merchantGoods().map((g) => g.itemId)).toEqual(expect.arrayContaining(['libum', 'tus', 'lucerna']));
    expect(barterViewFor(w.game, 'npc-festus')).toBeNull(); // not a merchant
  });
});

describe('other services', () => {
  it('train: a lesson costs §5.1 gold and raises the skill; the cap stops it', () => {
    const w = world();
    w.rpg.inventory.addDenarii(500);
    const cost = w.rpg.sheet.trainingCost('blades');
    const level = w.rpg.sheet.baseSkillLevel('blades');
    const before = w.rpg.inventory.denarii;
    w.events.emit('dialogue:service', { npcId: 'npc-glaucus', service: 'train' });
    expect(w.rpg.sheet.baseSkillLevel('blades')).toBe(level + 1);
    expect(w.rpg.inventory.denarii).toBe(before - cost);
    expect(w.text().some((t) => t.includes('teaches you Blades'))).toBe(true);
    w.rpg.sheet.setSkill('blades', 70);
    w.events.emit('dialogue:service', { npcId: 'npc-glaucus', service: 'train' });
    expect(w.text().some((t) => t.includes('all he can'))).toBe(true);
    w.events.emit('dialogue:service', { npcId: 'npc-festus', service: 'train' });
    expect(w.text().some((t) => t.includes('cannot teach'))).toBe(true);
  });

  it('repair: the arms dealer mends what is worn at the smith’s price', () => {
    const w = world();
    const inv = w.rpg.inventory;
    inv.addDenarii(200);
    inv.add('gladius');
    inv.equip('gladius');
    inv.adjustCondition('mainHand', -0.5);
    const before = inv.denarii;
    w.events.emit('dialogue:service', { npcId: 'npc-euhodus', service: 'repair' });
    expect(inv.conditionOf('mainHand')).toBe(1);
    expect(inv.denarii).toBeLessThan(before);
    w.events.emit('dialogue:service', { npcId: 'npc-chreste', service: 'repair' });
    expect(w.text().some((t) => t.includes('Nobody here mends arms'))).toBe(true);
  });

  it('heal: two denarii treat the wounds; rent: four asses buy a night in a bed', () => {
    const w = world();
    const inv = w.rpg.inventory;
    inv.addDenarii(20);
    w.rpg.sheet.vitals.drain('health', 60);
    w.rpg.sheet.applyCondition('injured');
    const before = inv.denarii;
    w.events.emit('dialogue:service', { npcId: 'npc-demetrius', service: 'heal' });
    expect(inv.denarii).toBe(before - 2);
    expect(w.rpg.sheet.vitals.get('health').current).toBe(w.rpg.sheet.vitals.get('health').max);
    expect(w.rpg.sheet.hasCondition('injured')).toBe(false);

    const hour = w.game.time.hour;
    const total = w.game.time.totalHours;
    w.events.emit('dialogue:service', { npcId: 'npc-dama', service: 'rent' });
    expect(inv.denarii).toBeCloseTo(before - 2.25, 3);
    expect(w.game.time.totalHours).toBeGreaterThan(total);
    expect(w.game.time.hour).toBeCloseTo(6, 0);
    expect(hour).not.toBeCloseTo(6, 0);
  });
});
