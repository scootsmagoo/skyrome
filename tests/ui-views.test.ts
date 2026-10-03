import { describe, expect, it } from 'vitest';
import { bribeTag, characterViewFrom, inventoryViewFrom, questMarkersFrom, skillCheckTag } from '../src/ui/adapters';
import { MockBarter, MockContainer, MockDialogue, MockInventory, MockQuestLog, MOCK_ITEMS, MOCK_PERKS, MOCK_SKILLS } from '../src/ui/mock';
import { MockMap, mockElevation } from '../src/ui/mockMap';
import type { CharacterSheet, EquipSlot, Inventory, ItemDef, ItemStack, Resource, Vitals } from '../src/rpg/types';

// ------------------------------------------------------------------ fakes of the engine contracts

function fakeVitals(): Vitals {
  const r = (current: number, max: number): Resource => ({ current, max });
  return {
    health: r(50, 100), stamina: r(80, 80), pietas: r(10, 40), dead: false,
    damage: () => 0, restore: () => {}, spend: () => true, drain: () => 0, delayRegen: () => {}, setMax: () => {}, tick: () => {}, revive: () => {},
  };
}

function fakeSheet(): CharacterSheet & { taken: Set<string> } {
  const taken = new Set<string>(['blades-1']);
  return {
    level: 3, levelProgress: 0.5, vitals: fakeVitals(), perkPoints: 1, perks: taken, taken,
    skillLevel: (id) => (id === 'blades' ? 25 : 10),
    skillProgress: () => 0.25,
    useSkill: () => {},
    canTakePerk: (id) => id === 'blades-2' && !taken.has(id),
    takePerk(id) { if (id !== 'blades-2') return false; taken.add(id); return true; },
    modifier: () => 0,
    hasFlag: () => false,
    activeEffects: [{ source: 'Posca', effect: { kind: 'restore', target: 'stamina', amount: 25 }, remaining: 3 }],
    applyEffects: () => {},
  };
}

function fakeInventory(): Inventory & { used: string[] } {
  let stacks: ItemStack[] = [
    { itemId: 'gladius', count: 1 }, { itemId: 'panis', count: 3 }, { itemId: 'tali', count: 1, stolenFrom: 'decimus' },
    { itemId: 'pugio', count: 1 }, { itemId: 'sica', count: 1 }, { itemId: 'book-column', count: 1 }, { itemId: 'libellus', count: 1 },
  ];
  const equipment: Partial<Record<EquipSlot, string>> = { mainHand: 'gladius', offHand: 'pugio' };
  const fns = new Set<() => void>();
  const emit = () => fns.forEach((f) => f());
  const used: string[] = [];
  return {
    used,
    denarii: 10, get stacks() { return stacks; }, weight: 2, maxWeight: 100,
    add: () => {}, count: (id) => stacks.find((s) => s.itemId === id)?.count ?? 0,
    remove(id, n = 1) {
      const s = stacks.find((x) => x.itemId === id);
      if (!s || s.count < n) return false;
      s.count -= n;
      stacks = stacks.filter((x) => x.count > 0);
      emit();
      return true;
    },
    addDenarii: () => {}, spendDenarii: () => true,
    // Like the real Inventory: it picks the slot itself and refuses what can't be worn.
    equip(id) {
      const def = itemDef(id);
      const slot = def?.slot ?? (def?.weapon ? 'mainHand' : null);
      if (!slot) return false;
      equipment[slot] = id;
      emit();
      return true;
    },
    unequip(slot) { delete equipment[slot]; emit(); },
    equipped: (slot) => equipment[slot],
    get equipment() { return equipment; },
    use(id) { used.push(id); return true; },
    onChange(fn) { fns.add(fn); return () => fns.delete(fn); },
  };
}

// The mock catalogue plus two contract edge cases: a weapon def without `slot` and a book with text.
const EXTRA_ITEMS: ItemDef[] = [
  { id: 'sica', name: 'Sica', type: 'weapon', weight: 1, value: 20, description: 'A curved Thracian blade.', weapon: { class: 'blade', damage: 7, speed: 1.1, reach: 0.9, stagger: 0.3, skill: 'blades' } },
  { id: 'libellus', name: 'On Wrestling', type: 'book', weight: 0.3, value: 10, description: 'A small handbook.', text: 'Grip low.\n\nThrow high.', teaches: 'unarmed' },
];
const itemDef = (id: string) => MOCK_ITEMS.find((i) => i.id === id) ?? EXTRA_ITEMS.find((i) => i.id === id);

// ------------------------------------------------------------------ adapters

describe('UI adapters', () => {
  it('builds a character view from a CharacterSheet', () => {
    const sheet = fakeSheet();
    const view = characterViewFrom(sheet, { name: 'Felix', skills: MOCK_SKILLS, perks: MOCK_PERKS });
    expect(view.level).toBe(3);
    expect(view.skills().find((s) => s.def.id === 'blades')?.level).toBe(25);
    const bladePerks = view.perks('blades');
    expect(bladePerks.find((p) => p.def.id === 'blades-1')?.taken).toBe(true);
    expect(bladePerks.find((p) => p.def.id === 'blades-2')?.available).toBe(true);
    expect(view.takePerk('blades-2')).toBe(true);
    expect(view.perks('blades').find((p) => p.def.id === 'blades-2')?.taken).toBe(true);
    expect(view.effects()[0].source).toBe('Posca');
  });

  it('builds an inventory view: equipped slots, stolen flags, toggling and dropping', () => {
    const inv = fakeInventory();
    const dropped: string[] = [];
    const view = inventoryViewFrom(inv, itemDef, { onDrop: (id, n) => dropped.push(`${id}×${n}`) });
    const entries = view.entries();
    expect(entries.find((e) => e.itemId === 'gladius')?.equipped).toBe('mainHand');
    expect(entries.find((e) => e.itemId === 'tali')?.stolen).toBe(true);
    let changes = 0;
    view.onChange!(() => changes++);
    expect(view.toggleEquip('gladius')).toBe(true); // unequip
    expect(inv.equipped('mainHand')).toBeUndefined();
    expect(view.toggleEquip('gladius')).toBe(true); // equip again
    expect(inv.equipped('mainHand')).toBe('gladius');
    expect(view.toggleEquip('panis')).toBe(false); // the inventory refuses: not wearable
    expect(view.drop('panis', 2)).toBe(true);
    expect(dropped).toEqual(['panis×2']);
    expect(changes).toBe(3);
  });

  it('unequips an item from whatever slot holds it', () => {
    const inv = fakeInventory();
    const view = inventoryViewFrom(inv, itemDef);
    // The pugio's def says mainHand, but it is worn in the off hand: toggling takes it off there.
    expect(itemDef('pugio')?.slot).toBe('mainHand');
    expect(view.toggleEquip('pugio')).toBe(true);
    expect(inv.equipped('offHand')).toBeUndefined();
    expect(inv.equipped('mainHand')).toBe('gladius');
    expect(view.entries().find((e) => e.itemId === 'pugio')?.equipped).toBeUndefined();
  });

  it('lets the inventory pick the slot for wearables without one in their def', () => {
    const inv = fakeInventory();
    const view = inventoryViewFrom(inv, itemDef);
    expect(itemDef('sica')?.slot).toBeUndefined();
    expect(view.toggleEquip('sica')).toBe(true);
    expect(inv.equipped('mainHand')).toBe('sica');
    expect(view.toggleEquip('sica')).toBe(true); // and off again
    expect(inv.equipped('mainHand')).toBeUndefined();
  });

  it('reads books through Inventory.use so skill books train and get marked read', () => {
    const inv = fakeInventory();
    const view = inventoryViewFrom(inv, itemDef, { book: (id) => (id === 'book-column' ? { title: 'On the New Column', kind: 'book', text: 'It rises.' } : null) });
    expect(view.read?.('book-column')?.title).toBe('On the New Column');
    // No reader text from the option: falls back to the item's own text.
    const own = view.read?.('libellus');
    expect(own?.text).toContain('Grip low');
    expect(inv.used).toEqual(['book-column', 'libellus']);
    // Not a book: nothing to read, nothing used.
    expect(view.read?.('panis')).toBeNull();
    expect(inv.used).toHaveLength(2);
  });

  it('makes dialogue tags with odds from the skill check rule', () => {
    const t = skillCheckTag({ skill: 'rhetoric', difficulty: 40, label: 'Persuade', pass: 'a', fail: 'b' }, 30, 'Rhetoric');
    expect(t.label).toBe('Persuade · Rhetoric 40');
    expect(t.chance).toBeCloseTo(0.6);
    expect(bribeTag(25).label).toBe('25 denarii');
    expect(bribeTag(1).label).toBe('1 denarius');
  });

  it('turns tracked quest objectives into map markers', () => {
    const log = new MockQuestLog();
    const map = new MockMap();
    const markers = questMarkersFrom(log, (t) => {
      if (t.kind !== 'location') return null;
      const l = map.locations().find((x) => x.id === t.id);
      return l ? { x: l.x, z: l.z } : null;
    });
    const main = markers.find((m) => m.questId === 'mq-column');
    expect(main?.tracked).toBe(true);
    const tab = map.locations().find((l) => l.id === 'tabularium')!;
    expect(main?.x).toBeCloseTo(tab.x);
    expect(markers.some((m) => m.questId === 'misc-room')).toBe(false); // completed
  });
});

// ------------------------------------------------------------------ mock views behave like real ones

describe('UI mocks', () => {
  it('barter commits a deal atomically and refuses what the player cannot afford', () => {
    const inv = new MockInventory();
    const b = new MockBarter(inv);
    const panis = b.merchantGoods().find((t) => t.itemId === 'panis')!;
    const before = inv.denarii;
    expect(b.commit({ buy: [{ itemId: 'panis', count: 2 }], sell: [] })).toEqual({ ok: true });
    expect(inv.denarii).toBeCloseTo(before - panis.price * 2);
    expect(inv.count('panis')).toBe(6);
    inv.denarii = 1;
    const falernum = inv.count('falernum');
    expect(b.commit({ buy: [{ itemId: 'falernum', count: 1 }], sell: [] })).toEqual({ ok: false, reason: 'You cannot afford this.' });
    expect(inv.count('falernum')).toBe(falernum); // nothing changed hands
    expect(inv.denarii).toBe(1);
    expect(b.playerGoods().find((t) => t.itemId === 'tali')?.refuse).toBeTruthy();
  });

  it('containers move items and mark owned loot as stolen', () => {
    const inv = new MockInventory();
    const c = new MockContainer(inv);
    c.take('tessera', 1);
    expect(inv.count('tessera')).toBe(3);
    expect(inv.stolen.has('tessera')).toBe(true);
    c.takeAll();
    expect(c.items()).toEqual([]);
  });

  it('dialogue walks nodes, continues and ends', () => {
    const d = new MockDialogue(41, () => 100);
    let changes = 0;
    d.onChange(() => changes++);
    expect(d.choices.length).toBe(6);
    d.choose(0); // grain tokens
    expect(d.line.text).toMatch(/aediles/);
    d.choose(0); // who handles the tokens?
    expect(d.choices.length).toBe(0); // a line that continues
    d.advance();
    expect(d.line.text).toMatch(/^Ave/);
    expect(d.choices[0].seen).toBe(true);
    d.choose(4); // disabled: nothing happens
    expect(d.line.text).toMatch(/^Ave/);
    d.choose(5); // goodbye
    expect(d.ended).toBe(true);
    expect(changes).toBe(4);
  });

  it('mock terrain puts the hills above the plain and the Tiber below it', () => {
    expect(mockElevation(230, 420)).toBeGreaterThan(45); // Palatine
    expect(mockElevation(-250, 100)).toBeGreaterThan(40); // Capitoline
    expect(mockElevation(-840, 14)).toBeLessThan(10); // the river
    expect(mockElevation(-800, -1000)).toBeLessThan(20); // Campus Martius
  });
});
