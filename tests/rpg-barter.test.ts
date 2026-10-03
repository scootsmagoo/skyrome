import { describe, expect, it } from 'vitest';
import { EventBus, type GameEvents } from '../src/core/Events';
import { Rng } from '../src/core/Rng';
import type { NpcDef } from '../src/npc/types';
import { NpcRegistry } from '../src/npc/registry';
import { BarterSystem, buyFactor, buyPrice, roundPrice, sellFactor, sellPrice, tradeXp, type PriceContext } from '../src/rpg/barter';
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

  it('market days, haggling and traits are fractional discounts on top', () => {
    expect(buyFactor({ ...novice, buyDiscount: 0.1 })).toBeCloseTo(1.55 * 0.9);
    expect(sellFactor({ ...novice, sellBonus: 0.1 })).toBeCloseTo(0.385 * 1.1);
  });

  it('never allows buy-low/sell-high arbitrage', () => {
    for (let m = 0; m <= 100; m += 10)
      for (const disp of [-20, 0, 20])
        for (const mod of [0, 0.1, 0.3, 0.5])
          for (const disc of [0, 0.3]) {
            const ctx: PriceContext = { mercatura: m, disposition: disp, buyMod: mod, sellMod: mod, buyDiscount: disc, sellBonus: disc };
            for (const d of ITEMS) {
              const s = sellPrice(d, ctx);
              if (s !== null) expect(s, `${d.id} m${m} d${disp} mod${mod}`).toBeLessThanOrEqual(buyPrice(d.value, ctx));
            }
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

  it('Trade XP per transaction: 1 + value/10 (max 50), fencing ×1.5', () => {
    expect(tradeXp(20)).toBe(3);
    expect(tradeXp(2000)).toBe(50);
    expect(tradeXp(20, true)).toBe(4.5);
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
    expect(sheet.skillXp('mercatura')).toBeCloseTo(tradeXp(0.25));
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

  it('disposition: Fama with the vendor’s faction / 10, origin traits, dialogue; street-wise −5% at plebeian vendors', () => {
    const { barter, factions, sheet } = setup();
    expect(barter.disposition('pistrix')).toBe(0);
    factions.addReputation('plebs', 100);
    expect(barter.disposition('pistrix')).toBe(10);
    sheet.setFlagSource('origin', ['trait-street-wise']);
    expect(barter.disposition('pistrix')).toBe(20);
    expect(barter.buyPrice('pistrix', 'patina')).toBe(roundPrice(0.5 * 1.45));
    barter.extraDisposition = () => 15;
    expect(barter.disposition('pistrix')).toBe(20); // clamped
    expect(barter.disposition('armorum')).toBe(15);
  });

  it('Caesar’s countryman: +10 with Baetican vendors and Bilbilis steel 20% cheaper', () => {
    const { barter, sheet } = setup();
    const plain = barter.buyPrice('armorum', 'gladius-bilbilis')!;
    sheet.setFlagSource('origin', ['trait-caesars-countryman']);
    expect(barter.disposition('armorum')).toBe(10);
    expect(barter.buyPrice('armorum', 'gladius-bilbilis')).toBe(roundPrice(132 * 1.5 * 0.8));
    expect(barter.buyPrice('armorum', 'gladius-bilbilis')!).toBeLessThan(plain);
  });

  it('market days (every 8th day): −10% at stalls, and at every vendor with the Nundinae perk', () => {
    const { barter, sheet, setHours } = setup();
    expect(barter.isMarketDay()).toBe(false);
    setHours(7 * 24 + 9);
    expect(barter.isMarketDay()).toBe(true);
    expect(barter.buyPrice('pistrix', 'patina')).toBe(roundPrice(0.5 * 1.55 * 0.9));
    expect(barter.buyPrice('armorum', 'gladius')).toBe(roundPrice(22 * 1.55));
    sheet.grantPerk('perk-mercatura-nundinae');
    expect(barter.buyPrice('armorum', 'gladius')).toBe(roundPrice(22 * 1.55 * 0.9));
  });

  it('haggling: one Rhetoric check per vendor per day (stall 10, shop 25, banker 40); success −10%/+10%, failure +5% and −5 disposition', () => {
    const won = setup({ rng: 0 });
    expect(won.barter.haggle('pistrix', 'stall')).toEqual({ ok: true, pass: true, chance: 0.5 });
    expect(won.barter.buyPrice('pistrix', 'patina')).toBe(roundPrice(0.5 * 1.55 * 0.9));
    expect(won.barter.haggle('pistrix', 'stall').ok).toBe(false);
    expect(won.sheet.skillXp('rhetoric')).toBe(5);
    const lost = setup({ rng: 0.99 });
    expect(lost.barter.haggle('armorum', 'shop')).toMatchObject({ ok: true, pass: false });
    expect(lost.barter.disposition('armorum')).toBe(-5);
    expect(lost.barter.buyPrice('armorum', 'gladius')).toBe(roundPrice(22 * 1.575 * 1.05));
    lost.setHours(24);
    expect(lost.barter.haggle('armorum', 'banker')).toMatchObject({ ok: true, chance: 0.2 });
  });

  it('Argentarius doubles vendor purses; Receptator pays the full fence rate; state round-trips', () => {
    const { barter, sheet, inventory, setHours } = setup();
    sheet.grantPerk('perk-mercatura-argentarius');
    expect(barter.merchant('armorum')!.denarii).toBe(100);
    sheet.grantPerk('perk-mercatura-fence');
    expect(barter.sellPrice('receptator', 'argentum', true)).toBe(roundPrice(40 * 0.385 * 0.7));
    inventory.addDenarii(10);
    barter.buy('pistrix', 'panis', 1);
    setHours(5);
    const saved = JSON.parse(JSON.stringify(barter.serialize()));
    const other = setup().barter;
    other.restore(saved);
    expect(other.serialize()).toEqual(barter.serialize());
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
