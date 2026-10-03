import { describe, expect, it } from 'vitest';
import { EventBus, type GameEvents } from '../src/core/Events';
import { Rng } from '../src/core/Rng';
import type { NpcDef } from '../src/npc/types';
import { NpcRegistry } from '../src/npc/registry';
import { BarterSystem, buyFactor, buyPrice, roundPrice, sellFactor, sellPrice, type PriceContext } from '../src/rpg/barter';
import { ITEMS } from '../src/rpg/data/items';
import { FactionSystem } from '../src/rpg/factions';
import { InventoryImpl } from '../src/rpg/inventory';
import { ItemDb } from '../src/rpg/items';
import { rollLoot } from '../src/rpg/loot';
import { formatDenarii, splitDenarii } from '../src/rpg/money';
import { CharacterSheetImpl } from '../src/rpg/sheet';

const db = new ItemDb(ITEMS);
const novice: PriceContext = { mercatura: 15, rhetoric: 15 };
const appearance: NpcDef['appearance'] = { sex: 'female', age: 'adult', build: 'average', height: 1.58, skin: '#c69c7a', hair: { style: 'bun', color: '#3b2a1e' }, garments: [{ kind: 'tunica-long', color: '#8a6a4a' }] };

describe('prices', () => {
  it('a novice pays ~1.43× retail and gets ~0.35× when selling', () => {
    expect(buyFactor(novice)).toBeCloseTo(1.4325);
    expect(sellFactor(novice)).toBeCloseTo(0.3525);
    expect(buyPrice(20, novice)).toBe(28.625);
    expect(sellPrice(db.require('gladius'), novice)).toBe(7.0625);
  });

  it('a master trader with all perks buys at the floor and sells near the cap', () => {
    const ctx: PriceContext = { mercatura: 100, rhetoric: 100, buyMod: 0.35, sellMod: 0.35 };
    expect(buyFactor(ctx)).toBe(0.9);
    expect(sellFactor(ctx)).toBeCloseTo(0.81);
    expect(buyPrice(20, ctx)).toBe(18);
  });

  it('rhetoric helps a little, faction discounts a little more', () => {
    expect(buyFactor({ mercatura: 15, rhetoric: 100 })).toBeLessThan(buyFactor(novice));
    expect(buyFactor({ ...novice, discount: 0.09 })).toBeCloseTo(buyFactor(novice) * 0.91);
  });

  it('never allows buy-low/sell-high arbitrage', () => {
    for (let m = 0; m <= 100; m += 10)
      for (const mod of [0, 0.1, 0.3, 0.5])
        for (const discount of [0, 0.15]) {
          const ctx: PriceContext = { mercatura: m, rhetoric: m, buyMod: mod, sellMod: mod, discount };
          for (const d of ITEMS) {
            const s = sellPrice(d, ctx);
            if (s !== null) expect(s, `${d.id} m${m} mod${mod}`).toBeLessThanOrEqual(buyPrice(d.value, ctx));
          }
        }
  });

  it('rounds to the nearest as with a one-as minimum', () => {
    expect(roundPrice(0.01)).toBe(1 / 16);
    expect(roundPrice(0)).toBe(0);
    expect(roundPrice(1.04)).toBe(1.0625);
    expect(buyPrice(db.require('panis').value, novice)).toBe(3 / 16);
  });

  it('refuses quest items, worthless items, stolen goods (non-fences) and types the merchant ignores', () => {
    const quest = { ...db.require('panis'), id: 'q', questItem: true };
    expect(sellPrice(quest, novice)).toBeNull();
    expect(sellPrice(db.require('lapis'), novice)).toBeNull();
    const cup = db.require('calix_argenteus');
    expect(sellPrice(cup, novice, { stolen: true })).toBeNull();
    const clean = sellPrice(cup, { ...novice, fence: true })!;
    const fenced = roundPrice(cup.value * sellFactor(novice) * 0.6);
    expect(sellPrice(cup, { ...novice, fence: true }, { stolen: true })).toBe(fenced);
    expect(sellPrice(cup, { ...novice, flags: new Set(['barter.fence']) }, { stolen: true })).toBe(fenced);
    expect(sellPrice(cup, { ...novice, fence: true, flags: new Set(['barter.fenceFull']) }, { stolen: true })).toBe(clean);
    expect(sellPrice(cup, novice, { buys: ['consumable'] })).toBeNull();
    expect(sellPrice(cup, { ...novice, fence: true }, { buys: ['consumable'] })).not.toBeNull();
  });
});

describe('BarterSystem', () => {
  function setup() {
    const events = new EventBus<GameEvents>();
    const sheet = new CharacterSheetImpl({ events });
    const inventory = new InventoryImpl(db, { events, sheet });
    const npcs = new NpcRegistry([
      { id: 'pistrix', name: 'Fabia the Baker', appearance, faction: 'mercatores', services: ['vendor'], vendor: { stock: [{ id: 'panis', count: 10 }, { id: 'garum', count: 2 }], denarii: 5, buys: ['consumable'] } },
      { id: 'fence', name: 'Lurco', appearance, services: ['vendor', 'fence'], vendor: { stock: [], denarii: 500 } },
    ]);
    const factions = new FactionSystem(undefined, events);
    let hours = 0;
    const barter = new BarterSystem({ items: db, inventory, sheet, npcs, factions, events, hours: () => hours });
    return { sheet, inventory, barter, factions, setHours: (h: number) => (hours = h) };
  }

  it('buys from stock, pays the merchant, trains Trade', () => {
    const { inventory, barter, sheet } = setup();
    inventory.addDenarii(2);
    const r = barter.buy('pistrix', 'panis', 4);
    expect(r.ok).toBe(true);
    expect(r.price).toBe(0.75);
    expect(inventory.count('panis')).toBe(4);
    expect(inventory.denarii).toBe(1.25);
    expect(barter.merchant('pistrix')!.stock.find((s) => s.itemId === 'panis')!.count).toBe(6);
    expect(barter.merchant('pistrix')!.denarii).toBe(5.75);
    expect(sheet.skillXp('mercatura')).toBeGreaterThan(0);
    expect(barter.buy('pistrix', 'panis', 7).reason).toBe('no-stock');
    expect(barter.buy('pistrix', 'garum', 2).reason).toBe('no-money');
    expect(barter.buy('nobody', 'panis').reason).toBe('not-merchant');
  });

  it('sells to merchants with money, routes stolen goods to fences, and restocks', () => {
    const { inventory, barter, setHours } = setup();
    inventory.add('garum_sociorum', 2);
    inventory.add('calix_argenteus', 1, { stolenFrom: 'domus' });
    const r = barter.sell('pistrix', 'garum_sociorum', 2);
    expect(r).toMatchObject({ ok: false, reason: 'merchant-poor' });
    expect(barter.sell('pistrix', 'garum_sociorum', 1).ok).toBe(true);
    expect(barter.sell('pistrix', 'calix_argenteus', 1, 'domus').reason).toBe('refused');
    const f = barter.sell('fence', 'calix_argenteus', 1, 'domus');
    expect(f.ok).toBe(true);
    expect(inventory.hasStolen()).toBe(false);
    expect(barter.merchant('fence')!.stock).toEqual([{ itemId: 'calix_argenteus', count: 1 }]);
    setHours(49);
    expect(barter.merchant('pistrix')!.denarii).toBe(5);
    expect(barter.merchant('fence')!.stock).toEqual([]);
  });

  it('guild members get a discount from guild merchants; state round-trips', () => {
    const { barter, factions, inventory } = setup();
    const before = barter.buyPrice('pistrix', 'garum_sociorum')!;
    factions.join('mercatores');
    expect(barter.buyPrice('pistrix', 'garum_sociorum')!).toBeCloseTo(roundPrice(12 * buyFactor(novice) * 0.97), 5);
    expect(barter.buyPrice('pistrix', 'garum_sociorum')!).toBeLessThan(before);
    inventory.addDenarii(10);
    barter.buy('pistrix', 'panis', 1);
    const saved = JSON.parse(JSON.stringify(barter.serialize()));
    const other = setup().barter;
    other.restore(saved);
    expect(other.serialize()).toEqual(barter.serialize());
  });
});

describe('money', () => {
  it('splits and formats denarii / sestertii / asses', () => {
    expect(splitDenarii(12.6875)).toEqual({ denarii: 12, sestertii: 2, asses: 3 });
    expect(formatDenarii(12.6875)).toBe('12 d 2 s 3 a');
    expect(formatDenarii(1 / 16, 'long')).toBe('1 as');
    expect(formatDenarii(1.25, 'long')).toBe('1 denarius, 1 sestertius');
    expect(formatDenarii(0)).toBe('0 d');
  });
});

describe('loot', () => {
  it('is deterministic for a seed and respects level gates', () => {
    const a = rollLoot('brigand', 5, new Rng(7));
    const b = rollLoot('brigand', 5, new Rng(7));
    expect(a).toEqual(b);
    let noricLow = 0;
    let noricHigh = 0;
    const rng = new Rng(1);
    for (let i = 0; i < 400; i++) {
      if (rollLoot('weapons.common', 5, rng).items.some((x) => x.id === 'gladius_noric')) noricLow++;
      if (rollLoot('weapons.common', 25, rng).items.some((x) => x.id === 'gladius_noric')) noricHigh++;
    }
    expect(noricLow).toBe(0);
    expect(noricHigh).toBeGreaterThan(0);
  });

  it('nests tables, scales coins with level and merges duplicates', () => {
    const rng = new Rng(3);
    let lo = 0;
    let hi = 0;
    for (let i = 0; i < 200; i++) {
      lo += rollLoot('boss', 1, rng).denarii;
      hi += rollLoot('boss', 30, rng).denarii;
    }
    expect(hi / lo).toBeGreaterThan(2.5);
    const r = rollLoot('boss', 10, new Rng(11));
    expect(new Set(r.items.map((x) => x.id)).size).toBe(r.items.length);
    for (const it of r.items) expect(db.has(it.id)).toBe(true);
    expect(r.denarii * 16).toBe(Math.round(r.denarii * 16));
  });

  it('yields nothing for unknown tables', () => {
    expect(rollLoot('nope', 1, new Rng(1))).toEqual({ items: [], denarii: 0 });
  });
});
