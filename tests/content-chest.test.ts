/**
 * The storage chest by the rented pallet (ContainerSpec.store, docs/design/world-life.md §4.5): it
 * takes only whole, honestly-owned goods that aren't worn, takes exactly the stacks it checked, and
 * gives them back in the condition they went in.
 */
import { Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTAINERS } from '../src/content/containers';
import { ContainerRuntime } from '../src/content/install';
import { installRpg } from '../src/rpg/install';
import { MemoryStorage } from '../src/save/storage';
import { fakeGame } from './rpg-fakes';

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

function chest() {
  const fg = fakeGame();
  const rpg = installRpg(fg.game, { storage: new MemoryStorage(), background: 'civis-suburanus' });
  const spec = CONTAINERS.find((c) => c.id === 'ctn-cista-pergulae')!;
  const rt = new ContainerRuntime(fg.game, spec, new Vector3());
  const inv = rpg.inventory;
  // Start from an empty sword belt (the background's kit may carry one).
  for (const e of inv.list((d) => d.id === 'gladius')) if (e.equipped) inv.unequip('mainHand');
  inv.remove('gladius', inv.count('gladius'));
  const blades = () => inv.list((d) => d.id === 'gladius').map((e) => ({ count: e.stack.count, condition: e.stack.condition ?? 1 })).sort((a, b) => a.condition - b.condition);
  return { rt, inv, blades, spec };
}

describe('the pallet chest', () => {
  it('is a storage chest locked with the pallet key', () => {
    const { spec, rt, inv } = chest();
    expect(spec.store).toBe(true);
    expect(spec.key).toBe('clavis-pergulae');
    expect(rt.locked).toBe(true);
    expect(rt.unlock()).toBe(false);
    inv.add('clavis-pergulae');
    expect(rt.unlock()).toBe(true);
  });

  it('stores the whole blade it checked, never the worn one, and gives it back whole', () => {
    const { rt, inv, blades } = chest();
    inv.add('gladius', 1, { condition: 0.5 });
    inv.add('gladius', 1);
    expect(blades()).toEqual([{ count: 1, condition: 0.5 }, { count: 1, condition: 1 }]);
    expect(rt.store('gladius', 1)).toBe(1);
    // The worn one is still in the pack; the chest holds the whole one.
    expect(blades()).toEqual([{ count: 1, condition: 0.5 }]);
    expect(rt.contents().find((c) => c.id === 'gladius')?.count).toBe(1);
    // A worn blade alone is not taken (it would need its wear kept in the chest's row).
    expect(rt.store('gladius', 1)).toBe(0);
    expect(blades()).toEqual([{ count: 1, condition: 0.5 }]);
    expect(rt.take('gladius', 1)).toBe(1);
    expect(blades()).toEqual([{ count: 1, condition: 0.5 }, { count: 1, condition: 1 }]);
  });

  it('never takes a worn copy, a stolen one or the one being worn', () => {
    const { rt, inv } = chest();
    inv.add('gladius', 1);
    inv.equip('gladius');
    expect(rt.store('gladius', 1)).toBe(0);
    expect(inv.isEquipped('gladius')).toBe(true);
    inv.add('panis', 2, { stolenFrom: 'npc-chreste' });
    const clean = inv.count('panis', { stolenFrom: null });
    expect(rt.store('panis', clean + 2)).toBe(clean);
    expect(inv.count('panis', { stolenFrom: 'npc-chreste' })).toBe(2);
  });

  it('keeps a stored blade’s wear when a row carries it', () => {
    const { rt, inv, blades } = chest();
    // A row with wear (from an older chest or another path) comes back worn, not new.
    const s = (rt as unknown as { read(): { items: { id: string; count: number; condition?: number }[]; coins: number }; write(x: unknown): void });
    const st = s.read();
    st.items.push({ id: 'gladius', count: 1, condition: 0.75 });
    s.write(st);
    expect(rt.take('gladius', 1)).toBe(1);
    expect(blades()).toEqual([{ count: 1, condition: 0.75 }]);
    expect(inv.count('gladius')).toBe(1);
  });
});
