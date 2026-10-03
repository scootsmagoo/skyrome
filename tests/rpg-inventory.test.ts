import { describe, expect, it } from 'vitest';
import { EventBus, type GameEvents } from '../src/core/Events';
import { CARRY } from '../src/rpg/data/balance';
import { CONDITIONS } from '../src/rpg/data/conditions';
import { DEITIES } from '../src/rpg/data/deities';
import { ENEMY_TIERS, NATURAL_WEAPONS } from '../src/rpg/data/enemies';
import { FACTIONS } from '../src/rpg/data/factions';
import { ITEMS } from '../src/rpg/data/items';
import { LOOT_TABLES } from '../src/rpg/data/loot';
import { BACKGROUNDS, COMMON_KIT, PERKS, SKILLS } from '../src/rpg/data/skills';
import { InventoryImpl } from '../src/rpg/inventory';
import { ItemDb, slotOf } from '../src/rpg/items';
import { CharacterSheetImpl, skillXpToNext } from '../src/rpg/sheet';
import { record } from './rpg-fakes';

function setup() {
  const events = new EventBus<GameEvents>();
  const sheet = new CharacterSheetImpl({ events });
  const db = new ItemDb(ITEMS);
  const inv = new InventoryImpl(db, { events, sheet });
  return { events, sheet, inv, db };
}

describe('item catalogue (GDD §8)', () => {
  it('has a solid catalogue with unique kebab-case ids and sane fields', () => {
    expect(ITEMS.length).toBeGreaterThanOrEqual(80);
    const ids = new Set<string>();
    for (const d of ITEMS) {
      expect(ids.has(d.id), d.id).toBe(false);
      ids.add(d.id);
      expect(d.id, d.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
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
      if (d.weapon && d.type === 'weapon') expect(['cut', 'thrust', 'blunt'], d.id).toContain(d.weapon.damageType);
    }
    const types = new Set(ITEMS.map((d) => d.type));
    for (const t of ['weapon', 'shield', 'armor', 'clothing', 'ammo', 'consumable', 'ingredient', 'book', 'tool', 'misc']) expect(types.has(t as never), t).toBe(true);
    for (const tag of ['wine', 'drink', 'medicine', 'curse', 'coin', 'bandage']) expect(ITEMS.some((d) => d.tags?.includes(tag)), tag).toBe(true);
    for (const id of ['panis', 'posca', 'patina', 'gladius', 'gladius-noric', 'gladius-bilbilis', 'lorica-segmentata', 'galea-gallica', 'toga', 'theriaca', 'liber-celsus']) expect(ids.has(id), id).toBe(true);
    expect(ITEMS.filter((d) => d.slot === 'neck' || d.slot === 'finger').length).toBeGreaterThanOrEqual(4);
  });

  it('weapon quality variants follow GDD §8.2 (Noric ×1.15, Bilbilis ×1.3)', () => {
    const db = new ItemDb(ITEMS);
    expect(db.require('gladius-noric').weapon!.damage).toBeCloseTo(13 * 1.15);
    expect(db.require('gladius-bilbilis').weapon!.damage).toBeCloseTo(13 * 1.3);
    expect(db.require('gladius-silvered').equipFlags).toContain('dress.silvered');
  });

  it('every data reference resolves (perks, origins, loot, enemies, factions, deities)', () => {
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
    for (const k of COMMON_KIT) if (!k.id.startsWith('quest-')) expect(items.has(k.id), k.id).toBe(true);
    const tables = new Set(LOOT_TABLES.map((t) => t.id));
    for (const t of LOOT_TABLES)
      for (const e of [...t.entries, ...(t.extras ?? [])]) {
        if (e.item) expect(items.has(e.item), `${t.id}:${e.item}`).toBe(true);
        if (e.table) expect(tables.has(e.table), `${t.id}:${e.table}`).toBe(true);
      }
    for (const t of ENEMY_TIERS) {
      if (t.loot) expect(tables.has(t.loot), t.tier).toBe(true);
      expect(t.kits.length, t.tier).toBeGreaterThan(0);
      for (const k of t.kits) {
        expect(items.has(k.weapon) || k.weapon in NATURAL_WEAPONS, `${t.tier}:${k.weapon}`).toBe(true);
        if (k.shield) expect(items.has(k.shield), `${t.tier}:${k.shield}`).toBe(true);
      }
    }
    for (const c of CONDITIONS) expect(c.effects.length, c.id).toBeGreaterThan(0);
    for (const f of FACTIONS) for (const e of f.enemies ?? []) expect(e === 'player' || FACTIONS.some((x) => x.id === e), `${f.id}:${e}`).toBe(true);
    for (const f of FACTIONS)
      for (const r of f.ranks)
        for (const g of r.requires ?? []) for (const sk of [g.skill].flat()) expect(skills.has(sk), `${f.id}:${r.id}:${sk}`).toBe(true);
    for (const d of DEITIES) {
      if (d.blessing) expect(CONDITIONS.some((c) => c.id === d.blessing && c.kind === 'blessing'), d.id).toBe(true);
      expect(d.invocation.cost, d.id).toBeGreaterThan(0);
    }
    for (const id of ['vigiles', 'ludus-magnus', 'cohortes-urbanae', 'cultores-lavernae', 'sodales-invicti', 'clientela', 'factio-prasina', 'factio-veneta', 'praetoriani']) expect(FACTIONS.some((f) => f.id === id), id).toBe(true);
    expect(BACKGROUNDS.length).toBe(10);
    expect(DEITIES.length).toBe(12);
  });
});

describe('inventory stacks', () => {
  it('stacks by item and stolen owner; removes clean goods first', () => {
    const { inv, events } = setup();
    const log = record(events, ['item:added', 'item:removed']);
    inv.add('panis', 2);
    inv.add('panis', 1);
    inv.add('panis', 2, { stolenFrom: 'pistor' });
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
    inv.add('no-such-thing');
    inv.add('panis', 0);
    expect(inv.stacks.length).toBe(0);
  });

  it('coins become denarii when picked up (an aureus is 25)', () => {
    const { inv, events } = setup();
    const log = record(events, ['item:added']);
    inv.add('aureus', 2);
    expect(inv.denarii).toBe(50);
    expect(inv.count('aureus')).toBe(0);
    expect(log.length).toBe(1);
  });

  it('confiscation removes only stolen stacks; launder makes them clean', () => {
    const { inv } = setup();
    inv.add('argentum', 1, { stolenFrom: 'domus' });
    inv.add('vasa-arretina', 2, { stolenFrom: 'domus' });
    inv.add('vasa-arretina', 1);
    inv.launder('argentum');
    const taken = inv.removeAllStolen();
    expect(taken).toEqual([{ itemId: 'vasa-arretina', count: 2, stolenFrom: 'domus' }]);
    expect(inv.count('vasa-arretina')).toBe(1);
    expect(inv.count('argentum', { stolen: false })).toBe(1);
    expect(inv.hasStolen()).toBe(false);
  });

  it('keeps denarii to the nearest quadrans and refuses overspending', () => {
    const { inv, events } = setup();
    const log = record(events, ['denarii:changed']);
    inv.addDenarii(1 / 3);
    expect(inv.denarii).toBe(21 / 64);
    expect(inv.spendDenarii(1)).toBe(false);
    expect(inv.spendDenarii(0.25)).toBe(true);
    expect(inv.denarii).toBe(5 / 64);
    expect(inv.spendDenarii(1 / 64)).toBe(true); // the bath fee
    expect(inv.denarii).toBe(1 / 16);
    expect(log.length).toBe(3);
  });

  it('quest items weigh nothing and cannot be dropped (GDD §8.6)', () => {
    const { inv, db } = setup();
    db.register({ id: 'quest-tabella', name: 'Sealed Tablet', type: 'quest', weight: 0.3, value: 0, description: 'A courier’s tablet under seal.' });
    inv.add('quest-tabella');
    inv.add('panis', 3);
    expect(inv.weight).toBeCloseTo(0.99);
    expect(inv.drop('quest-tabella')).toBe(false);
    expect(inv.drop('panis')).toBe(true);
    expect(inv.count('panis')).toBe(2);
  });
});

describe('weight and encumbrance (GDD §3.3)', () => {
  it('sums weights; capacity is 50 kg + 5 per stamina level-up and blessings; over it you walk', () => {
    const { inv, sheet } = setup();
    inv.add('lorica-hamata'); // 9 kg
    inv.add('scutum'); // 7.5 kg
    expect(inv.weight).toBeCloseTo(16.5);
    expect(inv.maxWeight).toBe(CARRY.base);
    sheet.addXp(75);
    sheet.chooseLevelUp('stamina');
    expect(inv.maxWeight).toBe(55);
    sheet.applyCondition('benedictio-hercules');
    expect(inv.maxWeight).toBe(75);
    inv.add('malleus', 12); // 60 kg
    expect(inv.overEncumbered).toBe(true);
    expect(inv.speedMultiplier()).toBeCloseTo(1.9 / 4.4);
  });

  it('worn light armor is weightless with Unburdened', () => {
    const { inv, sheet } = setup();
    inv.add('thorax-coriaceus');
    inv.equip('thorax-coriaceus');
    expect(inv.weight).toBeCloseTo(5);
    sheet.grantPerk('perk-light-armor-unburdened');
    expect(inv.weight).toBeCloseTo(0);
    inv.unequip('body');
    expect(inv.weight).toBeCloseTo(5);
  });
});

describe('equipment', () => {
  it('equips into slots and emits events', () => {
    const { inv, events } = setup();
    const log = record(events, ['item:equipped', 'item:unequipped']);
    inv.add('gladius');
    inv.add('gladius-noric');
    inv.add('scutum');
    expect(inv.equip('gladius')).toBe(true);
    expect(inv.equip('scutum')).toBe(true);
    expect(inv.equip('gladius-noric')).toBe(true);
    expect(inv.equipment).toEqual({ mainHand: 'gladius-noric', offHand: 'scutum' });
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
    inv.equip('fax'); // a torch goes to the off hand
    expect(inv.equipped('offHand')).toBe('fax');
    expect(inv.equipped('mainHand')).toBeUndefined();
  });

  it('unequips when the last copy leaves; ammo slot; equip modifiers and flags follow equipment', () => {
    const { inv, sheet } = setup();
    inv.add('sagitta', 2);
    inv.equip('sagitta');
    inv.remove('sagitta', 1);
    expect(inv.equipped('ammo')).toBe('sagitta');
    inv.remove('sagitta', 1);
    expect(inv.equipped('ammo')).toBeUndefined();
    inv.add('toga');
    inv.equip('toga');
    expect(sheet.hasFlag('dress.toga')).toBe(true);
    expect(sheet.modifier('stamina.sprintCost')).toBeCloseTo(-0.5);
    inv.add('fascinum');
    inv.equip('fascinum');
    expect(sheet.hasFlag('amulet')).toBe(true);
    inv.remove('toga');
    expect(sheet.hasFlag('dress.toga')).toBe(false);
    expect(sheet.modifier('stamina.sprintCost')).toBe(0);
    expect(inv.equipped('neck')).toBe('fascinum');
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

describe('condition (GDD §6.3)', () => {
  it('copies of different condition stack separately; equip picks the best unless asked', () => {
    const { inv } = setup();
    inv.add('gladius', 1, { condition: 0.7 });
    inv.add('gladius');
    expect(inv.stacks).toEqual([{ itemId: 'gladius', count: 1, condition: 0.7 }, { itemId: 'gladius', count: 1 }]);
    inv.equip('gladius');
    expect(inv.conditionOf('mainHand')).toBe(1);
    inv.equip('gladius', { condition: 0.7 });
    expect(inv.conditionOf('mainHand')).toBe(0.7);
    expect(inv.worn()).toEqual([{ slot: 'mainHand', def: inv.items.get('gladius'), condition: 0.7 }]);
  });

  it('wear costs 1% per 10 damage; repair restores; removing spares the worn copy', () => {
    const { inv } = setup();
    inv.add('gladius', 1, { condition: 0.7 });
    inv.add('gladius', 1, { condition: 0.5 });
    inv.equip('gladius');
    expect(inv.wear('mainHand', 100)).toBeCloseTo(0.6);
    expect(inv.repair('mainHand', 0.5)).toBe(1);
    expect(inv.stacks.find((s) => s.condition === undefined)?.count).toBe(1);
    inv.remove('gladius', 1);
    expect(inv.equipped('mainHand')).toBe('gladius');
    expect(inv.conditionOf('mainHand')).toBe(1);
    expect(inv.count('gladius')).toBe(1);
    expect(inv.wear('body', 50)).toBeUndefined();
  });

  it('non-wearables ignore condition', () => {
    const { inv } = setup();
    inv.add('panis', 1, { condition: 0.3 });
    inv.add('panis', 1);
    expect(inv.stacks).toEqual([{ itemId: 'panis', count: 2 }]);
  });
});

describe('use and read', () => {
  it('Ceres’ blessing makes food 50% stronger', () => {
    const { inv, sheet } = setup();
    sheet.vitals.inCombat = true;
    sheet.vitals.damage(50);
    sheet.applyCondition('benedictio-ceres');
    inv.add('botulus');
    inv.use('botulus');
    sheet.tick(10);
    expect(sheet.vitals.health.current).toBeCloseTo(50 + 22.5);
  });

  it('food heals over time and is consumed; remedies scale with potion.strength', () => {
    const { inv, sheet, events } = setup();
    const log = record(events, ['item:used', 'item:removed']);
    sheet.vitals.inCombat = true; // no natural regen
    sheet.vitals.damage(80);
    inv.add('botulus');
    expect(inv.use('botulus')).toBe(true);
    sheet.tick(10);
    expect(sheet.vitals.health.current).toBeCloseTo(35);
    expect(inv.count('botulus')).toBe(0);
    expect(log.map((l) => l.type)).toEqual(['item:removed', 'item:used']);
    sheet.setModifierSource('test', { 'potion.strength': 0.2 });
    inv.add('emplastrum');
    inv.use('emplastrum');
    sheet.tick(10);
    expect(sheet.vitals.health.current).toBeCloseTo(35 + 48);
    expect(inv.use('emplastrum')).toBe(false);
  });

  it('a bandage stops bleeding (not an injury), half again as strong with Celsus’ Method; theriac with the perk grants immunity', () => {
    const { inv, sheet } = setup();
    sheet.vitals.inCombat = true;
    sheet.applyCondition('cruentus');
    sheet.applyCondition('injured');
    sheet.vitals.damage(40);
    sheet.grantPerk('perk-medicina-celsus');
    inv.add('fascia', 2);
    inv.use('fascia');
    expect(sheet.hasCondition('cruentus')).toBe(false);
    expect(sheet.hasCondition('injured')).toBe(true);
    sheet.tick(5);
    expect(sheet.vitals.health.current).toBeCloseTo(40 + 37.5);
    // Aesculapius as patron: +25% bandage healing on top.
    sheet.setModifierSource('patron', { 'bandage.strength': 0.25 });
    sheet.vitals.damage(50);
    const before = sheet.vitals.health.current;
    inv.use('fascia');
    sheet.tick(5);
    expect(sheet.vitals.health.current - before).toBeCloseTo(25 * 1.5 * 1.25);
    sheet.grantPerk('perk-medicina-theriaca');
    sheet.applyCondition('taxus');
    inv.add('theriaca');
    inv.use('theriaca');
    expect(sheet.hasCondition('taxus')).toBe(false);
    expect(sheet.applyCondition('aconitum')).toBe(false);
  });

  it('drinks apply conditions and skill fortification (Falernian: tipsy, +5 Rhetoric)', () => {
    const { inv, sheet } = setup();
    inv.add('vinum-falernum');
    inv.use('vinum-falernum');
    expect(sheet.hasCondition('ebrius')).toBe(true);
    expect(sheet.skillLevel('rhetoric')).toBe(15);
  });

  it('skill books teach once; Greek books give Alexandrians half a level more; letters can be read; misc needs a handler', () => {
    const { inv, sheet, events } = setup();
    const log = record(events, ['book:read']);
    inv.add('liber-quintiliani');
    expect(inv.use('liber-quintiliani')).toBe(true);
    expect(inv.use('liber-quintiliani')).toBe(true);
    expect(sheet.skillLevel('rhetoric')).toBe(11);
    expect(inv.count('liber-quintiliani')).toBe(1);
    expect(log.map((l) => l.e)).toEqual([
      { itemId: 'liber-quintiliani', first: true, skill: 'rhetoric' },
      { itemId: 'liber-quintiliani', first: false, skill: undefined },
    ]);
    sheet.setFlagSource('origin', ['trait-alexandrian-learning']);
    inv.add('liber-onasander');
    inv.use('liber-onasander');
    expect(sheet.skillLevel('blades')).toBe(11);
    expect(sheet.skillXp('blades')).toBeCloseTo(skillXpToNext(11) / 2);
    inv.add('defixio-prasina');
    expect(inv.use('defixio-prasina')).toBe(true);
    inv.add('tali');
    expect(inv.use('tali')).toBe(false);
    let thrown = 0;
    inv.registerUseHandler('tali', () => (thrown++, true));
    expect(inv.use('tali')).toBe(true);
    expect(thrown).toBe(1);
  });
});

describe('inventory persistence', () => {
  it('round-trips stacks, condition, money, equipment and read books', () => {
    const { inv, sheet } = setup();
    inv.add('gladius', 1, { condition: 0.7 });
    inv.add('scutum', 1, { condition: 0.6 });
    inv.add('toga');
    inv.add('argentum', 3, { stolenFrom: 'domus' });
    inv.addDenarii(12.25);
    inv.equip('gladius');
    inv.equip('scutum');
    inv.equip('toga');
    inv.add('liber-plinii-epistulae');
    inv.use('liber-plinii-epistulae');
    const data = JSON.parse(JSON.stringify(inv.serialize()));
    const s2 = new CharacterSheetImpl();
    const inv2 = new InventoryImpl(new ItemDb(ITEMS), { sheet: s2 });
    inv2.restore(data);
    expect(inv2.serialize()).toEqual(inv.serialize());
    expect(inv2.hasRead('liber-plinii-epistulae')).toBe(true);
    expect(inv2.conditionOf('offHand')).toBe(0.6);
    expect(s2.hasFlag('dress.toga')).toBe(true);
    expect(sheet.hasFlag('dress.toga')).toBe(true);
  });

  it('reads the older slot → id equipment format', () => {
    const { inv } = setup();
    inv.restore({ stacks: [{ itemId: 'gladius', count: 1, condition: 0.7 }], denarii: 3, equipment: { mainHand: 'gladius' } });
    expect(inv.equipped('mainHand')).toBe('gladius');
    expect(inv.conditionOf('mainHand')).toBe(0.7);
  });

  it('is robust to junk: unknown items, bad counts, impossible equipment', () => {
    const { inv } = setup();
    inv.restore({ stacks: [{ itemId: 'gladius', count: 1 }, { itemId: 'nope', count: 3 }, { itemId: 'panis', count: -2 }, null], denarii: 'lots', equipped: { mainHand: { itemId: 'scutum' }, offHand: { itemId: 'nope' }, body: { itemId: 'gladius' } } });
    expect(inv.stacks).toEqual([{ itemId: 'gladius', count: 1 }]);
    expect(inv.denarii).toBe(0);
    expect(inv.equipment).toEqual({});
    inv.restore(undefined);
    expect(inv.stacks).toEqual([]);
  });
});
