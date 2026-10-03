import { describe, expect, it } from 'vitest';
import { EventBus, type GameEvents } from '../src/core/Events';
import { CARRY } from '../src/rpg/data/balance';
import { CONDITIONS } from '../src/rpg/data/conditions';
import { ENEMY_TIERS, NATURAL_WEAPONS } from '../src/rpg/data/enemies';
import { FACTIONS } from '../src/rpg/data/factions';
import { ITEMS } from '../src/rpg/data/items';
import { LOOT_TABLES } from '../src/rpg/data/loot';
import { BACKGROUNDS, PERKS, SKILLS } from '../src/rpg/data/skills';
import { InventoryImpl } from '../src/rpg/inventory';
import { ItemDb, slotOf } from '../src/rpg/items';
import { CharacterSheetImpl } from '../src/rpg/sheet';
import { record } from './rpg-fakes';

function setup() {
  const events = new EventBus<GameEvents>();
  const sheet = new CharacterSheetImpl({ events });
  const inv = new InventoryImpl(new ItemDb(ITEMS), { events, sheet });
  return { events, sheet, inv };
}

describe('item catalogue', () => {
  it('has a solid catalogue with unique ids and sane fields', () => {
    expect(ITEMS.length).toBeGreaterThanOrEqual(80);
    const ids = new Set<string>();
    for (const d of ITEMS) {
      expect(ids.has(d.id), d.id).toBe(false);
      ids.add(d.id);
      expect(d.name.length, d.id).toBeGreaterThan(0);
      expect(d.description.length, d.id).toBeGreaterThan(10);
      expect(d.weight, d.id).toBeGreaterThanOrEqual(0);
      expect(d.value, d.id).toBeGreaterThanOrEqual(0);
      if (d.type === 'weapon') expect(d.weapon && slotOf(d), d.id).toBeTruthy();
      if (d.type === 'armor' || d.type === 'clothing') expect(d.armor && d.slot, d.id).toBeTruthy();
      if (d.type === 'shield') expect(d.shield?.blockMitigation, d.id).toBeGreaterThan(0);
      if (d.type === 'book') expect(d.text, d.id).toBeTruthy();
      if (d.weapon) expect(SKILLS.some((s) => s.id === d.weapon!.skill), d.id).toBe(true);
      if (d.teaches) expect(SKILLS.some((s) => s.id === d.teaches), d.id).toBe(true);
    }
    const types = new Set(ITEMS.map((d) => d.type));
    for (const t of ['weapon', 'shield', 'armor', 'clothing', 'ammo', 'consumable', 'ingredient', 'book', 'key', 'tool', 'misc']) expect(types.has(t as never), t).toBe(true);
    // Every category the brief asks for is represented.
    for (const tag of ['wine', 'medicine', 'curse']) expect(ITEMS.some((d) => d.tags?.includes(tag)), tag).toBe(true);
    expect(ITEMS.some((d) => d.id === 'garum') && ITEMS.some((d) => d.id === 'posca') && ITEMS.some((d) => d.id === 'panis')).toBe(true);
    expect(ITEMS.filter((d) => d.slot === 'neck' || d.slot === 'finger').length).toBeGreaterThanOrEqual(4);
  });

  it('every data reference resolves (perks, backgrounds, loot, enemies, conditions)', () => {
    const items = new Set(ITEMS.map((d) => d.id));
    const skills = new Set(SKILLS.map((s) => s.id));
    const perks = new Set(PERKS.map((p) => p.id));
    expect(perks.size).toBe(PERKS.length);
    for (const p of PERKS) {
      expect(skills.has(p.skill), p.id).toBe(true);
      if (p.requiresPerk) expect(perks.has(p.requiresPerk), p.id).toBe(true);
    }
    for (const s of SKILLS) expect(PERKS.some((p) => p.skill === s.id), s.id).toBe(true);
    for (const b of BACKGROUNDS) {
      for (const k of b.kit) expect(items.has(k.id), `${b.id}:${k.id}`).toBe(true);
      for (const id of Object.keys(b.skills)) expect(skills.has(id), `${b.id}:${id}`).toBe(true);
    }
    const tables = new Set(LOOT_TABLES.map((t) => t.id));
    for (const t of LOOT_TABLES)
      for (const e of t.entries) {
        if (e.item) expect(items.has(e.item), `${t.id}:${e.item}`).toBe(true);
        if (e.table) expect(tables.has(e.table), `${t.id}:${e.table}`).toBe(true);
      }
    for (const t of ENEMY_TIERS) {
      if (t.loot) expect(tables.has(t.loot), t.tier).toBe(true);
      for (const w of t.weapons) {
        expect(items.has(w.weapon) || w.weapon in NATURAL_WEAPONS, `${t.tier}:${w.weapon}`).toBe(true);
        if (w.shield) expect(items.has(w.shield), `${t.tier}:${w.shield}`).toBe(true);
      }
    }
    for (const c of CONDITIONS) expect(c.effects.length, c.id).toBeGreaterThan(0);
    for (const f of FACTIONS) for (const e of f.enemies ?? []) expect(e === 'player' || FACTIONS.some((x) => x.id === e), `${f.id}:${e}`).toBe(true);
  });
});

describe('inventory stacks', () => {
  it('stacks by item and stolen owner; removes clean goods first', () => {
    const { inv, events } = setup();
    const log = record(events, ['item:added', 'item:removed']);
    inv.add('panis', 2);
    inv.add('panis', 1);
    inv.add('panis', 2, { stolenFrom: 'baker' });
    expect(inv.stacks.length).toBe(2);
    expect(inv.count('panis')).toBe(5);
    expect(inv.count('panis', { stolen: true })).toBe(2);
    expect(inv.remove('panis', 4)).toBe(true);
    expect(inv.count('panis', { stolen: false })).toBe(0);
    expect(inv.count('panis', { stolen: true })).toBe(1);
    expect(inv.remove('panis', 5)).toBe(false);
    expect(inv.count('panis')).toBe(1);
    expect(log[0]).toEqual({ type: 'item:added', e: { itemId: 'panis', count: 2, source: undefined, silent: undefined, stolen: false } });
    expect(log.at(-1)).toEqual({ type: 'item:removed', e: { itemId: 'panis', count: 4, reason: undefined } });
  });

  it('ignores unknown items and non-positive counts', () => {
    const { inv } = setup();
    inv.add('no_such_thing');
    inv.add('panis', 0);
    expect(inv.stacks.length).toBe(0);
  });

  it('confiscation removes only stolen stacks; launder makes them clean', () => {
    const { inv } = setup();
    inv.add('calix_argenteus', 1, { stolenFrom: 'domus' });
    inv.add('aureus', 2, { stolenFrom: 'domus' });
    inv.add('aureus', 1);
    inv.launder('calix_argenteus');
    const taken = inv.removeAllStolen();
    expect(taken).toEqual([{ itemId: 'aureus', count: 2, stolenFrom: 'domus' }]);
    expect(inv.count('aureus')).toBe(1);
    expect(inv.count('calix_argenteus', { stolen: false })).toBe(1);
    expect(inv.hasStolen()).toBe(false);
  });

  it('keeps denarii to the nearest as and refuses overspending', () => {
    const { inv, events } = setup();
    const log = record(events, ['denarii:changed']);
    inv.addDenarii(1 / 3);
    expect(inv.denarii).toBe(5 / 16);
    expect(inv.spendDenarii(1)).toBe(false);
    expect(inv.spendDenarii(0.25)).toBe(true);
    expect(inv.denarii).toBe(1 / 16);
    expect(log.length).toBe(2);
  });
});

describe('weight and encumbrance', () => {
  it('sums weights; capacity grows with stamina picks and Marius’ Mule', () => {
    const { inv, sheet } = setup();
    inv.add('lorica_hamata'); // 11 kg
    inv.add('scutum'); // 8 kg
    expect(inv.weight).toBeCloseTo(19);
    expect(inv.maxWeight).toBe(CARRY.base);
    sheet.addXp(100);
    sheet.chooseLevelUp('stamina');
    expect(inv.maxWeight).toBe(CARRY.base + CARRY.perStaminaPick);
    sheet.grantPerk('merc.mule');
    expect(inv.maxWeight).toBe(CARRY.base + CARRY.perStaminaPick + 20);
    inv.add('malleus', 20); // 120 kg
    expect(inv.overEncumbered).toBe(true);
    expect(inv.speedMultiplier()).toBe(CARRY.overSpeed);
  });

  it('worn heavy armor is weightless with Twenty Miles a Day', () => {
    const { inv, sheet } = setup();
    inv.add('lorica_segmentata');
    inv.equip('lorica_segmentata');
    expect(inv.weight).toBeCloseTo(9);
    sheet.grantPerk('heavy.conditioning');
    expect(inv.weight).toBeCloseTo(0);
    inv.unequip('body');
    expect(inv.weight).toBeCloseTo(9);
  });
});

describe('equipment', () => {
  it('equips into slots and emits events', () => {
    const { inv, events } = setup();
    const log = record(events, ['item:equipped', 'item:unequipped']);
    inv.add('gladius');
    inv.add('gladius_noric');
    inv.add('scutum');
    expect(inv.equip('gladius')).toBe(true);
    expect(inv.equip('scutum')).toBe(true);
    expect(inv.equip('gladius_noric')).toBe(true);
    expect(inv.equipment).toEqual({ mainHand: 'gladius_noric', offHand: 'scutum' });
    expect(log.map((l) => l.type)).toEqual(['item:equipped', 'item:equipped', 'item:unequipped', 'item:equipped']);
    expect(inv.equip('panis')).toBe(false);
    expect(inv.equip('pilum')).toBe(false); // not owned
  });

  it('two-handed weapons clear the off hand, and a shield clears a two-handed weapon', () => {
    const { inv } = setup();
    for (const id of ['gladius', 'scutum', 'falx', 'arcus', 'fax']) inv.add(id);
    inv.equip('gladius');
    inv.equip('scutum');
    inv.equip('falx');
    expect(inv.equipped('mainHand')).toBe('falx');
    expect(inv.equipped('offHand')).toBeUndefined();
    inv.equip('scutum');
    expect(inv.equipped('mainHand')).toBeUndefined();
    expect(inv.equipped('offHand')).toBe('scutum');
    inv.equip('arcus');
    expect(inv.equipped('offHand')).toBeUndefined();
    inv.equip('fax'); // torch goes to the off hand
    expect(inv.equipped('offHand')).toBe('fax');
    expect(inv.equipped('mainHand')).toBeUndefined();
  });

  it('unequips when the last copy leaves; ammo slot; amulet modifiers follow equipment', () => {
    const { inv, sheet } = setup();
    inv.add('sagitta', 2);
    inv.equip('sagitta');
    inv.remove('sagitta', 1);
    expect(inv.equipped('ammo')).toBe('sagitta');
    inv.remove('sagitta', 1);
    expect(inv.equipped('ammo')).toBeUndefined();
    inv.add('torques');
    inv.equip('torques');
    expect(sheet.vitals.health.max).toBe(110);
    inv.remove('torques');
    expect(sheet.vitals.health.max).toBe(100);
  });

  it('activate toggles equipment and uses consumables', () => {
    const { inv } = setup();
    inv.add('gladius');
    inv.add('panis');
    expect(inv.activate('gladius')).toBe(true);
    expect(inv.isEquipped('gladius')).toBe(true);
    expect(inv.activate('gladius')).toBe(true);
    expect(inv.isEquipped('gladius')).toBe(false);
    expect(inv.activate('panis')).toBe(true);
    expect(inv.count('panis')).toBe(0);
  });
});

describe('use and read', () => {
  it('food restores and is consumed; remedies scale with potion.strength', () => {
    const { inv, sheet, events } = setup();
    const log = record(events, ['item:used', 'item:removed']);
    sheet.vitals.damage(80);
    inv.add('lucanica');
    expect(inv.use('lucanica')).toBe(true);
    expect(sheet.vitals.health.current).toBe(32);
    expect(inv.count('lucanica')).toBe(0);
    expect(log.map((l) => l.type)).toEqual(['item:removed', 'item:used']);
    sheet.grantPerk('med.physician1');
    inv.add('potio_minor');
    inv.use('potio_minor');
    expect(sheet.vitals.health.current).toBe(32 + 25 * 1.2);
    expect(inv.use('potio_minor')).toBe(false);
  });

  it('skill books teach once; letters can be read; misc items do nothing without a handler', () => {
    const { inv, sheet, events } = setup();
    const log = record(events, ['book:read']);
    inv.add('liber_institutio');
    expect(inv.use('liber_institutio')).toBe(true);
    expect(inv.use('liber_institutio')).toBe(true);
    expect(sheet.skillLevel('rhetoric')).toBe(16);
    expect(inv.count('liber_institutio')).toBe(1);
    expect(log.map((l) => l.e)).toEqual([
      { itemId: 'liber_institutio', first: true, skill: 'rhetoric' },
      { itemId: 'liber_institutio', first: false, skill: undefined },
    ]);
    inv.add('defixio_prasina');
    expect(inv.use('defixio_prasina')).toBe(true);
    inv.add('tali');
    expect(inv.use('tali')).toBe(false);
    let thrown = 0;
    inv.registerUseHandler('tali', () => (thrown++, true));
    expect(inv.use('tali')).toBe(true);
    expect(thrown).toBe(1);
  });
});

describe('inventory persistence', () => {
  it('round-trips stacks, money, equipment and read books', () => {
    const { inv, sheet } = setup();
    inv.add('gladius');
    inv.add('scutum');
    inv.add('torques');
    inv.add('aureus', 3, { stolenFrom: 'domus' });
    inv.addDenarii(12.25);
    inv.equip('gladius');
    inv.equip('scutum');
    inv.equip('torques');
    inv.add('liber_cato');
    inv.use('liber_cato');
    const data = JSON.parse(JSON.stringify(inv.serialize()));
    const s2 = new CharacterSheetImpl();
    const inv2 = new InventoryImpl(new ItemDb(ITEMS), { sheet: s2 });
    inv2.restore(data);
    expect(inv2.serialize()).toEqual(inv.serialize());
    expect(inv2.hasRead('liber_cato')).toBe(true);
    expect(s2.vitals.health.max).toBe(110);
    expect(sheet.vitals.health.max).toBe(110);
  });

  it('is robust to junk: unknown items, bad counts, impossible equipment', () => {
    const { inv } = setup();
    inv.restore({ stacks: [{ itemId: 'gladius', count: 1 }, { itemId: 'nope', count: 3 }, { itemId: 'panis', count: -2 }, null], denarii: 'lots', equipment: { mainHand: 'scutum', offHand: 'nope', body: 'gladius' } });
    expect(inv.stacks).toEqual([{ itemId: 'gladius', count: 1 }]);
    expect(inv.denarii).toBe(0);
    expect(inv.equipment).toEqual({});
    inv.restore(undefined);
    expect(inv.stacks).toEqual([]);
  });
});
