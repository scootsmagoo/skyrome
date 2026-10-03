import type { Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installRpg } from '../src/rpg/install';
import { SAVE_VERSION, SaveSystem } from '../src/save/SaveSystem';
import { HybridStorage, IDB_POINTER, MemoryStorage } from '../src/save/storage';
import type { SaveStorage } from '../src/save/types';
import { fakeGame, record } from './rpg-fakes';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

function world(storage: SaveStorage = new MemoryStorage()) {
  const fg = fakeGame({ controller: true });
  const rpg = installRpg(fg.game, { examples: true, storage, background: 'veteran' });
  return { ...fg, rpg, storage };
}

/** Change a bit of everything the RPG saves. */
function playABit(w: ReturnType<typeof world>) {
  const { rpg, game, events, step } = w;
  rpg.sheet.useSkill('blades', 40);
  rpg.sheet.grantPerkPoints(1);
  rpg.sheet.takePerk('blades.arm1');
  rpg.sheet.applyCondition('febris');
  rpg.sheet.applyCondition('mars');
  rpg.sheet.vitals.damage(17);
  rpg.inventory.add('torques');
  rpg.inventory.equip('torques');
  rpg.inventory.add('calix_argenteus', 1, { stolenFrom: 'domus_x' });
  rpg.inventory.addDenarii(3.5);
  rpg.factions.join('vigiles');
  rpg.factions.addReputation('vigiles', 130);
  rpg.crime.commit('theft', { witnessed: true, value: 40 });
  rpg.dialogue.start('ex_pudens');
  rpg.dialogue.choose(0);
  rpg.dialogue.choose(0); // accept → quest starts
  rpg.dialogue.end();
  rpg.quests.flags.set('met_pudens', 1);
  rpg.inventory.add('ficus', 2);
  game.time.advanceHours(30);
  (game.player.position as Vector3).set(16, 0, -15);
  game.player.heading = 1.25;
  step(20); // enters & discovers the basilica
  events.emit('actor:killed', { victimId: 'nobody' });
}

describe('save → load round trip', () => {
  it('restores every saved section exactly', async () => {
    const w = world();
    playABit(w);
    const before = JSON.parse(JSON.stringify(w.rpg.save.snapshot().data));
    expect(Object.keys(before).sort()).toEqual(['barter', 'crime', 'dialogue', 'factions', 'inventory', 'locations', 'player', 'quests', 'sheet', 'time'].sort());
    const r = await w.rpg.save.save('manual-1', { name: 'Before the Subura' });
    expect(r.ok).toBe(true);
    expect(r.meta).toMatchObject({ slot: 'manual-1', kind: 'manual', name: 'Before the Subura', level: 1, location: 'Basilica Aemilia', version: SAVE_VERSION });
    expect(r.meta!.gameDate).toBe(w.game.time.formatRoman());

    // Wreck the state.
    w.rpg.sheet.restore(undefined);
    w.rpg.inventory.restore(undefined);
    w.rpg.quests.newGame();
    w.rpg.crime.restore(undefined);
    w.game.time.advanceHours(500);
    (w.game.player.position as Vector3).set(0, 0, 0);

    const l = await w.rpg.save.load('manual-1');
    expect(l).toMatchObject({ ok: true, warnings: [] });
    const after = JSON.parse(JSON.stringify(w.rpg.save.snapshot().data));
    expect(after).toEqual(before);
    expect(w.rpg.sheet.hasCondition('febris')).toBe(true);
    expect(w.rpg.inventory.isEquipped('torques')).toBe(true);
    expect(w.rpg.sheet.vitals.health.max).toBe(100 - 15 + 10);
    expect(w.rpg.quests.status('ex_letter')!.running).toBe(true);
    expect(w.rpg.quests.objectives('ex_letter').find((o) => o.id === 'go')!.done).toBe(true);
    expect(w.game.player.position.toArray()).toEqual([16, 0, -15]);
    expect(w.game.player.heading).toBe(1.25);
  });

  it('loads into a fresh session (new page load) and quest handlers keep working', async () => {
    const storage = new MemoryStorage();
    const a = world(storage);
    playABit(a);
    await a.rpg.save.save('manual-1');
    const b = world(storage);
    expect(b.rpg.quests.status('ex_letter')!.running).toBe(false);
    expect((await b.rpg.save.load('manual-1')).ok).toBe(true);
    expect(JSON.parse(JSON.stringify(b.rpg.save.snapshot().data))).toEqual(JSON.parse(JSON.stringify(a.rpg.save.snapshot().data)));
    b.rpg.inventory.add('ficus', 1); // the hidden figs objective keeps counting after the load
    expect(b.rpg.quests.objectives('ex_letter')).toBeTruthy();
    expect(b.rpg.quests.state('ex_letter')!.objectives.figs.count).toBe(3);
    // Loading doesn't re-fire 'location:entered' for where the player already stands.
    const log = record(b.events, ['location:entered']);
    b.step(30);
    expect(log).toEqual([]);
  });
});

describe('robustness', () => {
  it('refuses corrupt, foreign and newer-version files without throwing', async () => {
    const w = world();
    const errors = record(w.events, ['save:error']);
    await w.storage.write('skyrome.save.slot:bad', '{not json');
    expect(await w.rpg.save.load('bad')).toMatchObject({ ok: false, error: 'corrupt save (not valid JSON)' });
    await w.storage.write('skyrome.save.slot:foreign', JSON.stringify({ hello: 1 }));
    expect((await w.rpg.save.load('foreign')).error).toBe('not a Skyrome save');
    await w.storage.write('skyrome.save.slot:future', JSON.stringify({ format: 'skyrome-save', version: SAVE_VERSION + 1, meta: {}, data: {} }));
    expect((await w.rpg.save.load('future')).error).toMatch(/newer version/);
    expect((await w.rpg.save.load('missing')).error).toBe('no such save');
    expect(errors.length).toBe(4);
  });

  it('runs migrations from older versions', async () => {
    const w = world();
    const file = w.rpg.save.snapshot({ slot: 'old' });
    const old = { ...file, version: 0, data: { ...file.data, inventory: { ...(file.data.inventory as object), denarii: 1 } } };
    await w.storage.write('skyrome.save.slot:old', JSON.stringify(old));
    w.rpg.save.registerMigration(0, (f) => ({ ...f, data: { ...f.data, inventory: { ...(f.data.inventory as object), denarii: 99 } } }));
    expect((await w.rpg.save.load('old')).ok).toBe(true);
    expect(w.rpg.inventory.denarii).toBe(99);
  });

  it('resets sections missing from the file and skips sections that fail', async () => {
    const w = world();
    const resets: string[] = [];
    w.rpg.save.register('extra', { save: () => 1, load: () => {}, reset: () => resets.push('extra') });
    w.rpg.save.register('fragile', { save: () => 1, load: () => { throw new Error('nope'); } });
    const file = w.rpg.save.snapshot();
    delete file.data.extra;
    w.rpg.inventory.addDenarii(40);
    const denarii = w.rpg.inventory.denarii;
    w.rpg.inventory.addDenarii(5);
    const res = w.rpg.save.apply({ ...file, data: { ...file.data, inventory: { ...(file.data.inventory as object) } } });
    expect(res.warnings).toEqual(['fragile']);
    expect(resets).toEqual(['extra']);
    expect(w.rpg.inventory.denarii).toBe(denarii - 40);
  });

  it('rebuilds a corrupt slot index from the slot files', async () => {
    const w = world();
    await w.rpg.save.save('manual-1');
    await w.rpg.save.saveNew('second');
    await w.storage.write('skyrome.save.index', 'garbage');
    const list = await w.rpg.save.list();
    expect(list.map((m) => m.slot).sort()).toEqual(['manual-1', 'manual-2']);
    expect((await w.rpg.save.saveNew()).meta!.slot).toBe('manual-3');
  });

  it('will not save mid-conversation unless forced', async () => {
    const w = world();
    w.rpg.dialogue.start('ex_pudens');
    expect((await w.rpg.save.save('quick')).error).toBe('cannot save right now');
    expect((await w.rpg.save.save('quick', { force: true })).ok).toBe(true);
  });
});

describe('slots', () => {
  it('autosaves rotate through three slots and are rate-limited', async () => {
    const w = world();
    for (let i = 0; i < 4; i++) {
      w.game.time.advanceHours(1);
      expect((await w.rpg.save.autosave({ force: true })).ok).toBe(true);
    }
    expect((await w.rpg.save.autosave()).error).toBe('too soon');
    const list = await w.rpg.save.list();
    expect(list.map((m) => m.slot).sort()).toEqual(['auto1', 'auto2', 'auto3']);
    expect(list.every((m) => m.kind === 'auto')).toBe(true);
    expect((await w.rpg.save.latest())!.slot).toBe('auto1');
    await w.rpg.save.delete('auto2');
    expect((await w.rpg.save.list()).length).toBe(2);
  });

  it('F5 quicksaves and F9 quickloads through input actions; play time accumulates', async () => {
    const w = world();
    w.step(60);
    expect(w.rpg.save.playTime).toBeCloseTo(1, 1);
    w.pressed.add('quickSave');
    w.step(1);
    await w.rpg.save.idle();
    expect((await w.rpg.save.list()).map((m) => m.slot)).toEqual(['quick']);
    w.rpg.inventory.addDenarii(100);
    w.pressed.add('quickLoad');
    w.step(1);
    await w.rpg.save.idle();
    expect(w.rpg.inventory.denarii).toBe(25);
  });
});

describe('storage', () => {
  class FullStorage extends MemoryStorage {
    override async write(key: string, value: string) {
      if (value.length > 20 && value !== IDB_POINTER) throw new Error('QuotaExceededError');
      return super.write(key, value);
    }
  }

  it('sends saves over the size guard to the big store, leaving a pointer', async () => {
    const local = new MemoryStorage();
    const big = new MemoryStorage();
    const h = new HybridStorage(local, big, 10);
    await h.write('k', 'x'.repeat(50));
    expect(local.map.get('k')).toBe(IDB_POINTER);
    expect(await h.read('k')).toBe('x'.repeat(50));
    await h.write('k', 'small');
    expect(local.map.get('k')).toBe('small');
    expect(await h.read('k')).toBe('small');
    expect(await h.keys('k')).toEqual(['k']);
    await h.remove('k');
    expect(await h.read('k')).toBeNull();
  });

  it('falls back to the big store when localStorage is full; fails cleanly without one', async () => {
    const h = new HybridStorage(new FullStorage(), new MemoryStorage(), 1_000_000);
    await h.write('k', 'y'.repeat(100));
    expect(await h.read('k')).toBe('y'.repeat(100));
    const noBig = new HybridStorage(new FullStorage(), null);
    await expect(noBig.write('k', 'y'.repeat(100))).rejects.toThrow('QuotaExceededError');
    const fg = fakeGame();
    const save = new SaveSystem(fg.game, { storage: noBig });
    const r = await save.save('manual-1');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/storage error/);
  });
});
