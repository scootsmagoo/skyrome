/**
 * A locked strongbox without its key is picked in the minigame (src/content/install.ts +
 * src/game/lockpick): opening unlocks it for good, picking an owned one is effractio once per box,
 * and the system must be on for the player to try.
 */
import { Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTAINERS } from '../src/content/containers';
import { ContainerRuntime } from '../src/content/install';
import type { LockpickResult } from '../src/game/lockpick';
import { installRpg } from '../src/rpg/install';
import { MemoryStorage } from '../src/save/storage';
import { fakeGame } from './rpg-fakes';

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

function box(id: string, result: LockpickResult = 'opened', picks = 1, patch: Partial<(typeof CONTAINERS)[number]> = {}) {
  const fg = fakeGame();
  const rpg = installRpg(fg.game, { storage: new MemoryStorage(), background: 'civis-suburanus', systems: ['lockpicking'] });
  const start = vi.fn(async () => result);
  fg.game.lockpick = { picks, start } as unknown as NonNullable<typeof fg.game.lockpick>;
  const commit = vi.spyOn(fg.game.crime, 'commit');
  const spec = { ...CONTAINERS.find((c) => c.id === id)!, ...patch };
  const rt = new ContainerRuntime(fg.game, spec, new Vector3());
  return { fg, rpg, rt, start, commit, spec };
}

describe('a locked strongbox without a key', () => {
  it('is shut, has no key to try, and can be picked', () => {
    const { rt, spec } = box('ctn-arca-armorum');
    expect(spec.locked).toBe('mediocris');
    expect(spec.key).toBeUndefined();
    expect(rt.locked).toBe(true);
    expect(rt.unlock()).toBe(false);
    expect(rt.pickable).toBe(true);
  });

  it('opens for good when the minigame says opened', async () => {
    const { rt, start } = box('ctn-arca-armorum');
    expect(await rt.pick()).toBe('opened');
    expect(start).toHaveBeenCalledWith({ tier: 'mediocris', label: expect.any(String) });
    expect(rt.locked).toBe(false);
    expect(rt.unlock()).toBe(true);
  });

  it('stays shut after a snapped pick or a walk away', async () => {
    for (const r of ['broken', 'cancelled', 'nopick'] as const) {
      const { rt } = box('ctn-arca-armorum', r);
      expect(await rt.pick()).toBe(r);
      expect(rt.locked).toBe(true);
    }
  });

  it('is effractio when someone sees, booked once per container and not before a pick is in hand', async () => {
    const { rt, commit } = box('ctn-arca-armorum', 'cancelled');
    await rt.pick();
    await rt.pick();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith('effractio', expect.objectContaining({ victimId: 'npc-euhodus' }));
    const none = box('ctn-arca-porci', 'nopick', 0);
    await none.rt.pick();
    expect(none.commit).not.toHaveBeenCalled();
  });

  it('cannot be picked while the lockpicking system is off', () => {
    const { rt, rpg } = box('ctn-arca-armorum');
    rpg.sheet.shippedSystems = new Set(['bleeding']);
    expect(rt.pickable).toBe(false);
  });
});

describe('a box with a key and a lock', () => {
  // (a made-up box: the Mouse's strongbox in the game is key-only, so its quest step can't be skipped)
  const lock = { locked: 'simplex' as const };

  it('opens with the key without the minigame, or with the pick', async () => {
    const { rt, rpg, start } = box('ctn-cista-muris', 'opened', 1, lock);
    expect(rt.locked).toBe(true);
    rpg.inventory.add('clavis-cellae-muris');
    expect(rt.unlock()).toBe(true);
    expect(start).not.toHaveBeenCalled();
    const second = box('ctn-cista-muris', 'opened', 1, lock);
    expect(await second.rt.pick()).toBe('opened');
    expect(second.rt.locked).toBe(false);
  });

  it('an unowned lock is no crime', async () => {
    const { rt, commit } = box('ctn-cista-muris', 'opened', 1, lock);
    await rt.pick();
    expect(commit).not.toHaveBeenCalled();
  });

  it("the Mouse's strongbox opens with its key only", () => {
    const { rt } = box('ctn-cista-muris');
    expect(rt.locked).toBe(true);
    expect(rt.pickable).toBe(false);
  });
});
