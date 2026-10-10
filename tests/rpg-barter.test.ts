import { describe, expect, it } from 'vitest';
import { EventBus, type GameEvents } from '../src/core/Events';
import { Rng } from '../src/core/Rng';
import type { NpcDef } from '../src/npc/types';
import { NpcRegistry } from '../src/npc/registry';
import { BarterSystem, buyFactor, buyPrice, repairCost, roundPrice, sellFactor, sellPrice, tradeXp, type PriceContext } from '../src/rpg/barter';
import { VENDORS } from '../src/rpg/data/vendors';
import { VENDORS_LIFE } from '../src/rpg/data/vendors-life';
import { ITEMS } from '../src/rpg/data/items';
import { LOOT_TABLES } from '../src/rpg/data/loot';
import { FactionSystem } from '../src/rpg/factions';
import { InventoryImpl } from '../src/rpg/inventory';
import { ItemDb } from '../src/rpg/items';
import { rollLoot } from '../src/rpg/loot';
import { formatDenarii, splitDenarii } from '../src/rpg/money';
import { CharacterSheetImpl } from '../src/rpg/sheet';

const db = new ItemDb(ITEMS);
/** A new character: Trade 10, no disposition. */
const novice: PriceContext = { mercatura: 10 };
const appearance: NpcDef['appearance'] = { sex: 'female', age: 'adult', build: 'average', height: 1.58, skin: '#c69c7a', hair: { style: 'bun', color: '#3b2a1e' }, garments: [{ kind: 'tunica-long', color: '#8a6a4a' }] };
const AS = 1 / 16;

describe('prices (GDD §7.2)', () => {
  it('base values follow the price table', () => {
    const table: Record<string, number> = {
      stola: 20, 'stola-fina': 60, palla: 8, 'palla-fina': 30,
      vinum: AS, 'vinum-melius': 2 * AS, 'vinum-falernum': 4 * AS, posca: AS, panis: AS, puls: AS, botulus: 2 * AS, caseus: 2 * AS, olivae: 3 * AS, ficus: 2 * AS, mel: 6 * AS, patina: 8 * AS, libum: AS, cena: 3,
      tunica: 4, toga: 25, 'toga-fina': 80, paenula: 8, calcei: 4, caligae: 5, soleae: 1,
      pugio: 6, sica: 18, gladius: 22, spatha: 35, 'gladius-noric': 55, 'gladius-bilbilis': 132, hasta: 12, pilum: 10, fustis: 1, arcus: 45, sagitta: 0.2, funda: 1, 'glans-plumbea': 0.1,
      scutum: 45, parma: 25, subarmalis: 20, 'thorax-coriaceus': 35, 'lorica-hamata': 190, 'lorica-squamata': 220, 'lorica-segmentata': 260, 'galea-gallica': 60, 'manica-linea': 15, ocreae: 40,
      fascia: 2 * AS, emplastrum: 4 * AS, theriaca: 15, 'tabula-cerata': 3 * AS, lucerna: AS, fax: 2 * AS, hamulus: 1, fascinum: 2, bulla: 25, piper: 4, 'piper-album': 7, 'piper-longum': 15,
      defixio: 2 * AS, clavus: AS, tus: AS, 'tessera-frumentaria': 25,
    };
    for (const [id, v] of Object.entries(table)) expect(db.require(id).value, id).toBeCloseTo(v, 6);
  });
});

describe('barter formulas (GDD §7.4)', () => {
  it('a new character pays 1.55× and gets 0.385× (Trade 10)', () => {
    expect(buyFactor(novice)).toBeCloseTo(1.55);
    expect(sellFactor(novice)).toBeCloseTo(0.385);
    expect(buyPrice(20, novice)).toBe(31);
    expect(sellPrice(db.require('gladius'), novice)).toBe(542 / 64);
  });

  it('Trade, disposition and price.buy/sell move toward the floor (1.05) and the cap (0.90)', () => {
    expect(buyFactor({ mercatura: 100 })).toBeCloseTo(1.1);
    expect(buyFactor({ mercatura: 100, disposition: 20, buyMod: 0.05 })).toBe(1.05);
    expect(sellFactor({ mercatura: 100, disposition: 20, sellMod: 0.05 })).toBeCloseTo(0.85);
    expect(sellFactor({ mercatura: 100, disposition: 20, sellMod: 0.2 })).toBe(0.9);
    expect(buyFactor({ mercatura: 10, disposition: 999 })).toBeCloseTo(1.45); // clamped at +20
    expect(buyFactor({ mercatura: 10, disposition: -20 })).toBeCloseTo(1.65);
  });

  it('market days, haggling and traits go inside the clamps (Σbuy, Σsell), never multiply after them', () => {
    expect(buyFactor({ ...novice, buyDiscount: 0.1 })).toBeCloseTo(1.45);
    expect(sellFactor({ ...novice, sellBonus: 0.1 })).toBeCloseTo(0.485);
    expect(buyFactor({ mercatura: 100, disposition: 20, buyDiscount: 0.4 })).toBe(1.05);
  });

  it('property: for random skills, dispositions and modifier sets, sell ≤ buy × 0.86 (and never above buy at any price)', () => {
    const rng = new Rng(86);
    for (let i = 0; i < 3000; i++) {
      const ctx: PriceContext = {
        mercatura: rng.range(0, 100),
        disposition: rng.range(-30, 30),
        buyMod: rng.range(-0.2, 1),
        sellMod: rng.range(-0.2, 1),
        buyDiscount: rng.range(-0.05, 1),
        sellBonus: rng.range(-0.05, 1),
      };
      expect(sellFactor(ctx)).toBeLessThanOrEqual(buyFactor(ctx) * 0.86);
      const d = ITEMS[rng.int(0, ITEMS.length - 1)];
      const sp = sellPrice(d, ctx);
      if (sp !== null) expect(sp, d.id).toBeLessThanOrEqual(buyPrice(d.value, ctx));
    }
  });

  it('prices are quantized to the quadrans (1/64 den.), at least one for anything with value', () => {
    expect(roundPrice(0.01)).toBe(1 / 64);
    expect(roundPrice(0)).toBe(0);
    expect(roundPrice(1.04)).toBe(67 / 64);
    expect(buyPrice(db.require('panis').value, novice)).toBe(6 / 64);
  });

  it('refuses quest items, worthless items and types the vendor ignores; stolen goods go only to fences (×0.5, Receptator ×0.7)', () => {
    const quest = { ...db.require('panis'), id: 'quest-tabella', questItem: true };
    expect(sellPrice(quest, novice)).toBeNull();
    expect(sellPrice(db.require('aqua'), novice)).toBeNull();
    const silver = db.require('argentum');
    expect(sellPrice(silver, novice, { stolen: true })).toBeNull();
    expect(sellPrice(silver, { ...novice, fence: true }, { stolen: true })).toBe(roundPrice(40 * 0.385 * 0.5));
    expect(sellPrice(silver, { ...novice, fence: true, fencePerk: true }, { stolen: true })).toBe(roundPrice(40 * 0.385 * 0.7));
    expect(sellPrice(silver, novice, { buys: ['consumable'] })).toBeNull();
    expect(sellPrice(silver, { ...novice, fence: true }, { buys: ['consumable'] })).not.toBeNull();
  });

  it('Trade XP per transaction worth ≥ 1 den.: 1 + value/10 (max 50), fencing ×1.5, same-day repeats halve', () => {
    expect(tradeXp(20)).toBe(3);
    expect(tradeXp(2000)).toBe(50);
    expect(tradeXp(20, true)).toBe(4.5);
    expect(tradeXp(0.5)).toBe(0);
    expect(tradeXp(20, false, 1)).toBe(1.5);
    expect(tradeXp(20, false, 2)).toBe(0.75);
  });

  it('repairs cost 10% of the value per 25% of condition restored', () => {
    expect(repairCost(22, 0.5)).toBe(roundPrice(22 * 0.1 * 2));
    expect(repairCost(45, 0.4)).toBe(roundPrice(45 * 0.1 * 2.4));
    expect(repairCost(22, 1)).toBe(0);
  });

  it('the vendor kinds of §7.3', () => {
    expect(VENDORS['armorum-negotiator']).toMatchObject({ purse: 500, repairs: true, grade: 'shop' });
    expect(VENDORS.argentarius).toMatchObject({ purse: 3000, grade: 'banker' });
    expect(VENDORS.receptator).toMatchObject({ purse: 400, fence: true });
    expect(VENDORS.popina).toMatchObject({ purse: 40, stall: true, plebeian: true });
    // The 19 kinds of the GDD, plus the ones phase 2 adds (vendors-life.ts).
    expect(VENDORS_LIFE.length).toBe(4); // margaritarius, vinarius, figulus, pannarius
    expect(Object.keys(VENDORS).length).toBe(19 + 4);
  });
});

describe('BarterSystem', () => {
  function setup(opts: { rng?: number } = {}) {
    const events = new EventBus<GameEvents>();
    const sheet = new CharacterSheetImpl({ events });
    const inventory = new InventoryImpl(db, { events, sheet });
    const npcs = new NpcRegistry([
      { id: 'pistrix', name: 'Fabia the Baker', appearance, faction: 'plebs', tags: ['vendor:pistor'], services: ['vendor'], vendor: { stock: [{ id: 'panis', count: 10 }, { id: 'patina', count: 2 }], denarii: 20, buys: ['consumable'] } },
      { id: 'armorum', name: 'Lucius the Arms Dealer', appearance, tags: ['vendor:armorum-negotiator', 'baetican'], services: ['vendor'], vendor: { stock: [{ id: 'gladius', count: 2 }, { id: 'gladius-bilbilis', count: 1 }], denarii: 50, buys: ['weapon', 'armor', 'shield', 'ammo'] } },
      { id: 'receptator', name: 'Lurco', appearance, tags: ['vendor:receptator'], services: ['vendor', 'fence'], vendor: { stock: [], denarii: 400 } },
      { id: 'sextus', name: 'Sextus the Banker', appearance, tags: ['vendor:argentarius'], services: ['vendor', 'banker'], vendor: { stock: [], denarii: 3000 } },
    ]);
    const factions = new FactionSystem(undefined, events);
    let hours = 0;
    const barter = new BarterSystem({ items: db, inventory, sheet, npcs, factions, events, hours: () => hours, rng: { next: () => opts.rng ?? 0.5 } });
    return { sheet, inventory, barter, factions, setHours: (h: number) => (hours = h) };
  }

  it('buys from stock, pays the vendor, trains Trade', () => {
    const { inventory, barter, sheet } = setup();
    inventory.addDenarii(2);
    const r = barter.buy('pistrix', 'panis', 4);
    expect(r).toEqual({ ok: true, price: 24 / 64 });
    expect(inventory.count('panis')).toBe(4);
    expect(inventory.denarii).toBe(2 - 24 / 64);
    expect(barter.merchant('pistrix')!.stock.find((s) => s.itemId === 'panis')!.count).toBe(6);
    expect(barter.merchant('pistrix')!.denarii).toBe(20 + 24 / 64);
    expect(sheet.skillXp('mercatura')).toBe(0); // under 1 den.: no Trade XP
    expect(barter.buy('pistrix', 'panis', 7).reason).toBe('no-stock');
    expect(barter.buy('armorum', 'gladius').reason).toBe('no-money');
    expect(barter.buy('nobody', 'panis').reason).toBe('not-merchant');
  });

  it('sells to vendors who deal in the type and can pay; stolen goods only to the fence; purses restock every 2 days', () => {
    const { inventory, barter, setHours } = setup();
    inventory.add('lorica-hamata');
    inventory.add('gladius');
    inventory.add('argentum', 1, { stolenFrom: 'domus' });
    expect(barter.sell('pistrix', 'gladius').reason).toBe('refused');
    expect(barter.sell('armorum', 'lorica-hamata')).toMatchObject({ ok: false, reason: 'merchant-poor' });
    expect(barter.sell('armorum', 'gladius')).toEqual({ ok: true, price: 542 / 64 });
    expect(barter.sell('armorum', 'argentum', 1, 'domus').reason).toBe('refused');
    const f = barter.sell('receptator', 'argentum', 1, 'domus');
    expect(f).toEqual({ ok: true, price: roundPrice(40 * 0.385 * 0.5) });
    expect(inventory.hasStolen()).toBe(false);
    expect(barter.merchant('receptator')!.stock).toEqual([{ itemId: 'argentum', count: 1 }]);
    setHours(48);
    expect(barter.merchant('armorum')!.denarii).toBe(50);
    expect(barter.merchant('receptator')!.stock).toEqual([]);
  });

  it('selling stolen goods takes exactly that owner’s copies: no pay, no restock, no duplicate when they are not there', () => {
    const { inventory, barter } = setup();
    inventory.add('gladius', 1, { stolenFrom: 'npc-a' });
    const purse = barter.merchant('receptator')!.denarii;
    // The wrong owner: nothing is sold, however often it is tried.
    for (let i = 0; i < 5; i++) expect(barter.sell('receptator', 'gladius', 1, 'npc-b')).toMatchObject({ ok: false, reason: 'not-owned' });
    expect(inventory.denarii).toBe(0);
    expect(inventory.count('gladius', { stolenFrom: 'npc-a' })).toBe(1);
    expect(barter.merchant('receptator')!.denarii).toBe(purse);
    expect(barter.merchant('receptator')!.stock).toEqual([]);
    // Two owners' copies don't add up to two of one owner's.
    inventory.add('gladius', 1, { stolenFrom: 'npc-b' });
    expect(barter.sell('receptator', 'gladius', 2, 'npc-a').reason).toBe('not-owned');
    expect(inventory.count('gladius')).toBe(2);
    // A clean sale never takes stolen copies.
    expect(barter.sell('armorum', 'gladius').reason).toBe('not-owned');
    expect(barter.sell('receptator', 'gladius', 0, 'npc-a').ok).toBe(false);
    // The right owner sells one, and only that copy leaves.
    const r = barter.sell('receptator', 'gladius', 1, 'npc-a');
    expect(r.ok).toBe(true);
    expect(inventory.denarii).toBe(r.price);
    expect(inventory.count('gladius', { stolenFrom: 'npc-a' })).toBe(0);
    expect(inventory.count('gladius', { stolenFrom: 'npc-b' })).toBe(1);
    expect(barter.merchant('receptator')!.stock).toEqual([{ itemId: 'gladius', count: 1 }]);
  });

  it('disposition: Fama with the vendor’s faction / 10, origin traits and what happened in dialogue (±20); street-wise is a price term', () => {
    const { barter, factions, sheet } = setup();
    expect(barter.disposition('pistrix')).toBe(0);
    factions.addReputation('plebs', 100);
    expect(barter.disposition('pistrix')).toBe(10);
    sheet.setFlagSource('origin', ['trait-street-wise']);
    expect(barter.disposition('pistrix')).toBe(10);
    // Σbuy: street-wise 0.05 at a plebeian vendor: 1.60 − 0.05 − 10/200 − 0.05 = 1.45.
    expect(barter.buyPrice('pistrix', 'patina')).toBe(roundPrice(0.5 * 1.45));
    expect(barter.buyPrice('armorum', 'gladius')).toBe(roundPrice(22 * 1.55));
    barter.extraDisposition = () => 15;
    expect(barter.disposition('pistrix')).toBe(20); // clamped
    expect(barter.disposition('armorum')).toBe(15);
  });

  it('Caesar’s countryman: +10 disposition with Baetican vendors and Bilbilis steel 0.20 off inside the clamp', () => {
    const { barter, sheet } = setup();
    const plain = barter.buyPrice('armorum', 'gladius-bilbilis')!;
    sheet.setFlagSource('origin', ['trait-caesars-countryman']);
    expect(barter.disposition('armorum')).toBe(10);
    expect(barter.buyPrice('armorum', 'gladius-bilbilis')).toBe(roundPrice(132 * (1.55 - 0.05 - 0.2)));
    expect(barter.buyPrice('armorum', 'gladius-bilbilis')!).toBeLessThan(plain);
  });

  it('market days (every 8th day): 0.10 off at stalls, and 0.10 more at every vendor with the Nundinae perk; festival discounts add', () => {
    const { barter, sheet, setHours } = setup();
    expect(barter.isMarketDay()).toBe(false);
    setHours(7 * 24 + 9);
    expect(barter.isMarketDay()).toBe(true);
    expect(barter.buyPrice('pistrix', 'patina')).toBe(roundPrice(0.5 * 1.45));
    expect(barter.buyPrice('armorum', 'gladius')).toBe(roundPrice(22 * 1.55));
    sheet.grantPerk('perk-mercatura-nundinae');
    expect(barter.buyPrice('armorum', 'gladius')).toBe(roundPrice(22 * 1.45));
    expect(barter.buyPrice('pistrix', 'patina')).toBe(roundPrice(0.5 * 1.35));
    const fest = setup();
    (fest.barter as unknown as { deps: { festivalDiscount: () => number } }).deps.festivalDiscount = () => 0.1; // the Mercuralia
    expect(fest.barter.buyPrice('armorum', 'gladius')).toBe(roundPrice(22 * 1.45));
  });

  it('haggling: one Rhetoric check per vendor per day at its grade (stall 10, shop 25, banker 40); success Σbuy and Σsell +0.10, failure Σbuy −0.05 and −5 disposition', () => {
    const won = setup({ rng: 0 });
    expect(won.barter.haggle('pistrix')).toEqual({ ok: true, pass: true, chance: 0.5 });
    expect(won.barter.buyPrice('pistrix', 'patina')).toBe(roundPrice(0.5 * 1.45));
    expect(won.barter.haggle('pistrix').ok).toBe(false);
    expect(won.sheet.skillXp('rhetoric')).toBe(10);
    won.inventory.add('patina');
    expect(won.barter.sellPrice('pistrix', 'patina')).toBe(roundPrice(0.5 * 0.485));
    const lost = setup({ rng: 0.99 });
    expect(lost.barter.haggle('armorum')).toMatchObject({ ok: true, pass: false, chance: 0.35 });
    expect(lost.barter.disposition('armorum')).toBe(-5);
    expect(lost.barter.buyPrice('armorum', 'gladius')).toBe(roundPrice(22 * (1.6 - 0.05 + 5 / 200 + 0.05)));
    expect(lost.barter.haggle('sextus')).toMatchObject({ ok: true, chance: 0.2 }); // banker
  });

  it('the arms dealer repairs at the smith’s price; the baker doesn’t', () => {
    const { barter, inventory } = setup();
    inventory.add('gladius', 1, { condition: 0.5 });
    inventory.equip('gladius');
    expect(barter.repairPrice('mainHand')).toBe(repairCost(22, 0.5));
    expect(barter.repair('pistrix', 'mainHand').reason).toBe('no-repair');
    expect(barter.repair('armorum', 'mainHand').reason).toBe('no-money');
    inventory.addDenarii(10);
    expect(barter.repair('armorum', 'mainHand')).toEqual({ ok: true, price: repairCost(22, 0.5) });
    expect(inventory.conditionOf('mainHand')).toBe(1);
    expect(barter.repair('armorum', 'mainHand').reason).toBe('nothing-to-repair');
  });

  it('Faenus Nauticum: stake ≤ 20% of the banker’s purse, outcome rolled when you invest, +40% after 30 days', () => {
    const { barter, sheet, inventory, setHours } = setup({ rng: 0.5 });
    inventory.addDenarii(1000);
    expect(barter.invest('sextus', 100).reason).toBe('no-perk');
    sheet.grantPerk('perk-mercatura-nauticum');
    expect(barter.invest('armorum', 100).reason).toBe('not-merchant');
    expect(barter.maxStake('sextus')).toBe(600);
    expect(barter.invest('sextus', 601).reason).toBe('too-much');
    expect(barter.invest('sextus', 100)).toMatchObject({ ok: true, investment: { stake: 100, outcome: 'gain', dueAt: 720 } });
    expect(barter.invest('sextus', 50, { next: () => 0.9 })).toMatchObject({ ok: true, investment: { outcome: 'loss' } });
    expect(barter.pendingInvestments().map((i) => i.stake)).toEqual([100, 50]);
    expect(barter.collectInvestments()).toBe(0);
    setHours(720);
    expect(barter.collectInvestments()).toBe(140);
    expect(inventory.denarii).toBe(1000 - 150 + 140);
    expect(barter.pendingInvestments()).toEqual([]);
  });

  it('Argentarius doubles vendor purses; Receptator pays 70%; Trade XP halves on same-day repeats; state round-trips (old format too)', () => {
    const { barter, sheet, inventory, setHours } = setup();
    sheet.grantPerk('perk-mercatura-argentarius');
    expect(barter.merchant('armorum')!.denarii).toBe(100);
    sheet.grantPerk('perk-mercatura-fence');
    expect(barter.sellPrice('receptator', 'argentum', true)).toBe(roundPrice(40 * 0.385 * 0.7));
    inventory.add('gladius', 2);
    barter.sell('armorum', 'gladius');
    const once = sheet.skillXp('mercatura');
    expect(once).toBeCloseTo(tradeXp(22));
    barter.sell('armorum', 'gladius');
    expect(sheet.skillXp('mercatura') - once).toBeCloseTo(tradeXp(22) / 2);
    setHours(5);
    const saved = JSON.parse(JSON.stringify(barter.serialize()));
    const other = setup().barter;
    other.restore(saved);
    expect(other.serialize()).toEqual(barter.serialize());
    other.restore({ armorum: { stock: [{ itemId: 'gladius', count: 1 }], denarii: 7, restockAt: 99, dispositionDelta: -5 } });
    expect(other.merchant('armorum')!.denarii).toBe(7);
  });
});

describe('money', () => {
  it('splits and formats denarii / sestertii / asses / quadrantes, and in sesterces (HS)', () => {
    expect(splitDenarii(12.6875)).toEqual({ denarii: 12, sestertii: 2, asses: 3, quadrantes: 0 });
    expect(splitDenarii(1 / 64)).toEqual({ denarii: 0, sestertii: 0, asses: 0, quadrantes: 1 });
    expect(formatDenarii(12.6875)).toBe('12 d 2 s 3 a');
    expect(formatDenarii(1 / 16, 'long')).toBe('1 as');
    expect(formatDenarii(1 / 64, 'long')).toBe('1 quadrans');
    expect(formatDenarii(1.25, 'long')).toBe('1 denarius, 1 sestertius');
    expect(formatDenarii(0)).toBe('0 d');
    expect(formatDenarii(12.6875, 'hs')).toBe('50 HS 3 a');
    expect(formatDenarii(25000, 'hs')).toBe('100,000 HS');
    expect(formatDenarii(0, 'hs')).toBe('0 HS');
  });
});

describe('loot (GDD §6.14)', () => {
  const share = (table: string, pred: (r: ReturnType<typeof rollLoot>) => boolean, n = 4000) => {
    const rng = new Rng(9);
    let k = 0;
    for (let i = 0; i < n; i++) if (pred(rollLoot(table, 1, rng))) k++;
    return k / n;
  };
  const has = (id: string) => (r: ReturnType<typeof rollLoot>) => r.items.some((x) => x.id === id);

  it('is deterministic for a seed', () => {
    expect(rollLoot('veteran', 5, new Rng(7))).toEqual(rollLoot('veteran', 5, new Rng(7)));
  });

  it('thugs: 0.2–3 den. (to the as), fustis or pugio 25% each, bread 30%, dice 15%, a trinket 10%', () => {
    expect(share('thug', has('fustis'))).toBeCloseTo(0.25, 1);
    expect(share('thug', has('pugio'))).toBeCloseTo(0.25, 1);
    expect(share('thug', has('panis'))).toBeCloseTo(0.3, 1);
    expect(share('thug', has('tali'))).toBeCloseTo(0.15, 1);
    expect(share('thug', has('nugae'))).toBeCloseTo(0.1, 1);
    const rng = new Rng(4);
    for (let i = 0; i < 300; i++) {
      const d = rollLoot('thug', 1, rng).denarii;
      expect(d).toBeGreaterThanOrEqual(0.25);
      expect(d).toBeLessThanOrEqual(3);
      expect(d * 16).toBe(Math.round(d * 16));
    }
  });

  it('veterans: a Noric-steel weapon 40%, a gladiator armor piece 30%, Bilbilis steel 10%', () => {
    const noric = new Set(LOOT_TABLES.find((t) => t.id === 'weapon.noric')!.entries.map((e) => e.item));
    const bilbilis = new Set(LOOT_TABLES.find((t) => t.id === 'weapon.bilbilis')!.entries.map((e) => e.item));
    expect(share('veteran', (r) => r.items.some((x) => noric.has(x.id)))).toBeCloseTo(0.4, 1);
    expect(share('veteran', (r) => r.items.some((x) => bilbilis.has(x.id)))).toBeCloseTo(0.1, 1);
  });

  it('nests tables, merges duplicates and only names real items', () => {
    const rng = new Rng(11);
    for (let i = 0; i < 200; i++) {
      for (const t of ['chest.rich', 'strongbox', 'boss', 'elite', 'tomb']) {
        const r = rollLoot(t, 10, rng);
        expect(new Set(r.items.map((x) => x.id)).size).toBe(r.items.length);
        for (const it of r.items) expect(db.has(it.id), it.id).toBe(true);
      }
    }
    expect(share('boss', (r) => r.items.length > 0 && r.denarii >= 50, 200)).toBe(1);
  });

  it('yields nothing for unknown tables', () => {
    expect(rollLoot('nope', 1, new Rng(1))).toEqual({ items: [], denarii: 0 });
  });
});
