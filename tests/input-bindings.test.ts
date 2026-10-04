import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS, ESSENTIAL_ACTIONS, sanitizeBindings } from '../src/core/Input';
import { hotbarItems, hotbarRank } from '../src/game/quickActions';
import type { ItemDef } from '../src/rpg/types';

describe('sanitizeBindings', () => {
  it('leaves healthy bindings alone', () => {
    expect(sanitizeBindings(undefined).repaired).toEqual([]);
    expect(sanitizeBindings({ jump: ['Space', 'KeyB'] }).bindings.jump).toEqual(['Space', 'KeyB']);
  });

  it('restores an essential action left without keys (the dead-D bug)', () => {
    const { bindings, repaired } = sanitizeBindings({ right: [] });
    expect(bindings.right).toEqual(['KeyD']);
    expect(repaired).toEqual([{ action: 'right', codes: ['KeyD'] }]);
  });

  it('takes the restored key back from a non-essential action', () => {
    const { bindings } = sanitizeBindings({ right: [], shoulderSwap: ['KeyD'] });
    expect(bindings.right).toEqual(['KeyD']);
    expect(bindings.shoulderSwap).toEqual([]);
  });

  it('does not steal from another essential action unless nothing else is left', () => {
    // D went to Jump; Strafe right lost it. Jump keeps D, and right still gets D (a duplicate beats
    // an unplayable game) because D is its only default.
    const { bindings } = sanitizeBindings({ right: [], jump: ['KeyD'] });
    expect(bindings.jump).toEqual(['KeyD']);
    expect(bindings.right).toEqual(['KeyD']);
  });

  it('drops unknown actions, non-string and empty codes, and duplicates', () => {
    const { bindings } = sanitizeBindings({ teleport: ['KeyT'], attack: ['KeyF', 7, '', 'KeyF'] } as never);
    expect('teleport' in bindings).toBe(false);
    expect(bindings.attack).toEqual(['KeyF']);
  });

  it('every essential action has a default key', () => {
    for (const a of ESSENTIAL_ACTIONS) expect(DEFAULT_BINDINGS[a].length, a).toBeGreaterThan(0);
  });
});

describe('hotbar', () => {
  const item = (id: string, extra: Partial<ItemDef>): ItemDef => ({ id, name: id, type: 'consumable', description: '', weight: 0.1, value: 1, ...extra });
  const bandage = item('bandage', { tags: ['bandage'], effects: [{ kind: 'regen', target: 'health', amount: 2, duration: 10 }] });
  const remedy = item('remedy', { tags: ['medicine'], effects: [{ kind: 'restore', target: 'health', amount: 20 }] });
  const posca = item('posca', { tags: ['drink'], effects: [{ kind: 'restore', target: 'stamina', amount: 20 }] });
  const bread = item('bread', { tags: ['food'], effects: [{ kind: 'regen', target: 'health', amount: 1, duration: 20 }] });

  it('ranks healing first, then stamina, then food', () => {
    expect(hotbarRank(bandage)).toBeLessThan(hotbarRank(remedy));
    expect(hotbarRank(remedy)).toBeLessThan(hotbarRank(posca));
  });

  it('lists carried consumables in hotbar order, skipping empty stacks', () => {
    const stacks = [
      { def: bread, stack: { count: 2 } },
      { def: posca, stack: { count: 1 } },
      { def: bandage, stack: { count: 0 } },
      { def: remedy, stack: { count: 3 } },
    ];
    const inv = { list: (f?: (d: ItemDef) => boolean) => stacks.filter((s) => !f || f(s.def)), use: () => true, count: () => 1 };
    expect(hotbarItems(inv).map((d) => d.id)).toEqual(['remedy', 'bread', 'posca']);
  });
});
