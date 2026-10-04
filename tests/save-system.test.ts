import type { Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installRpg, startNewGame } from '../src/rpg/install';
import { proceduralId } from '../src/save/deltas';
import { GENERATOR_VERSION, MANUAL_SLOTS, migrateV1toV2, SAVE_VERSION, SaveSystem } from '../src/save/SaveSystem';
import { createDefaultStorage, FallbackStorage, HybridStorage, IDB_POINTER, IdbSaveStorage, MemoryStorage } from '../src/save/storage';
import type { SaveStorage } from '../src/save/types';
import { fakeGame, record } from './rpg-fakes';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

function world(storage: SaveStorage = new MemoryStorage()) {
  const fg = fakeGame({ controller: true });
  const rpg = installRpg(fg.game, { examples: true, storage, background: 'veteranus' });
  return { ...fg, rpg, storage };
}

/** Change a bit of everything the RPG saves. */
function playABit(w: ReturnType<typeof world>) {
  const { rpg, game, events, step } = w;
  rpg.sheet.setSkill('blades', 20);
  rpg.sheet.useSkill('blades', 40);
  rpg.sheet.grantPerkPoints(1);
  rpg.sheet.takePerk('perk-blades-punctim');
  rpg.sheet.applyCondition('febris');
  rpg.sheet.applyCondition('cruentus');
  rpg.sheet.vitals.damage(17);
  rpg.inventory.add('fascinum');
  rpg.inventory.equip('fascinum');
  rpg.inventory.add('argentum', 1, { stolenFrom: 'domus-x' });
  rpg.inventory.addDenarii(3.5);
  rpg.factions.join('vigiles');
  rpg.factions.addReputation('vigiles', 13);
  rpg.devotion.choosePatron('patronus-mars');
  rpg.devotion.prayAtCompitum('compitum-test');
  rpg.devotion.prayAtTemple('temple-mars-ultor', { denarii: 1 });
  rpg.devotion.vow('ex-letter', 10);
  rpg.standing.addInfamia(5);
  rpg.standing.addFame('subura', 12);
  rpg.crime.commit('furtum', { witnessed: true, value: 40 });
  rpg.dialogue.start('ex-scriba');
  rpg.dialogue.choose(0);
  rpg.dialogue.choose(0); // accept → quest starts
  rpg.dialogue.end();
  rpg.quests.flags.set('met-eutychus', 1);
  rpg.inventory.add('ficus', 2);
  game.time.advanceHours(30);
  rpg.crime.commit('trespass', { witnessed: true, identified: false, district: 'velabrum' });
  (game.player.position as Vector3).set(16, 0, -15);
  game.player.heading = 1.25;
  step(20); // enters & discovers the basilica
  events.emit('actor:killed', { victimId: 'npc-nobody' });
  game.deltas.markLooted(proceduralId('urbs', 3, -2, 'insula-chest', 0));
}

describe('save → load round trip', () => {
  it('writes the GDD §14.13 header and restores every saved section exactly', async () => {
    const w = world();
    playABit(w);
    const snap = w.rpg.save.snapshot();
    expect(snap).toMatchObject({ format: 'skyrome-save', saveVersion: SAVE_VERSION, generatorVersion: GENERATOR_VERSION, worldSeed: 0 });
    expect(snap.gameTime).toMatchObject({ totalHours: w.game.time.totalHours, elapsedDays: Math.floor(w.game.time.totalHours / 24), clamp: null });
    expect(snap.gameTime.date).toEqual(w.game.time.date());
    const before = JSON.parse(JSON.stringify(snap.data));
    expect(Object.keys(before).sort()).toEqual(['barter', 'crime', 'devotion', 'dialogue', 'entityDeltas', 'factions', 'inventory', 'locations', 'player', 'quests', 'sheet', 'standing', 'time'].sort());
    const r = await w.rpg.save.save('manual-1', { name: 'Before the Subura' });
    expect(r.ok).toBe(true);
    expect(r.meta).toMatchObject({ slot: 'manual-1', kind: 'manual', name: 'Before the Subura', level: 1, location: 'Basilica Aemilia', version: SAVE_VERSION });
    expect(r.meta!.gameDate).toBe(w.game.time.formatRoman());

    // Wreck the state.
    w.rpg.sheet.restore(undefined);
    w.rpg.inventory.restore(undefined);
    w.rpg.devotion.restore(undefined);
    w.rpg.standing.restore(undefined);
    w.rpg.sheet.setFlagSource('origin', null);
    w.rpg.quests.newGame();
    w.rpg.crime.restore(undefined);
    w.game.deltas.restore(undefined);
    w.game.time.advanceHours(500);
    (w.game.player.position as Vector3).set(0, 0, 0);

    const l = await w.rpg.save.load('manual-1');
    expect(l).toMatchObject({ ok: true, warnings: [] });
    const after = JSON.parse(JSON.stringify(w.rpg.save.snapshot().data));
    expect(after).toEqual(before);
    expect(w.rpg.sheet.hasCondition('febris')).toBe(true);
    expect(w.rpg.sheet.hasCondition('benedictio-mars')).toBe(true);
    expect(w.rpg.inventory.isEquipped('fascinum')).toBe(true);
    expect(w.rpg.sheet.hasFlag('amulet')).toBe(true);
    expect(w.rpg.devotion.patron!.id).toBe('patronus-mars');
    expect(w.rpg.devotion.vows()[0]).toMatchObject({ questId: 'ex-letter', state: 'active' });
    expect(w.rpg.sheet.hasFlag('trait-old-wound')).toBe(true);
    expect(w.rpg.sheet.vitals.stamina.max).toBeCloseTo(85);
    expect(w.rpg.crime.bounty()).toBe(80);
    expect(w.rpg.crime.alert('velabrum')).toBe(1);
    expect(w.game.deltas.isDead('npc-nobody')).toBe(true);
    expect(w.game.deltas.isLooted('urbs:3,-2:insula-chest:0')).toBe(true);
    expect(w.rpg.quests.status('ex-letter')!.running).toBe(true);
    expect(w.rpg.quests.objectives('ex-letter').find((o) => o.id === 'go')!.done).toBe(true);
    expect(w.game.player.position.toArray()).toEqual([16, 0, -15]);
    expect(w.game.player.heading).toBe(1.25);
  });

  it('loads into a fresh session (new page load) and quest handlers keep working', async () => {
    const storage = new MemoryStorage();
    const a = world(storage);
    playABit(a);
    await a.rpg.save.save('manual-1');
    const b = world(storage);
    expect(b.rpg.quests.status('ex-letter')!.running).toBe(false);
    expect((await b.rpg.save.load('manual-1')).ok).toBe(true);
    expect(JSON.parse(JSON.stringify(b.rpg.save.snapshot().data))).toEqual(JSON.parse(JSON.stringify(a.rpg.save.snapshot().data)));
    b.rpg.inventory.add('ficus', 1); // the hidden figs objective keeps counting after the load
    expect(b.rpg.quests.state('ex-letter')!.objectives.figs.count).toBe(3);
    // Loading doesn't re-fire 'location:entered' for where the player already stands.
    const log = record(b.events, ['location:entered']);
    b.step(30);
    expect(log).toEqual([]);
  });
});

describe('versions and migrations (pure functions with fixtures)', () => {
  /** A v1 file as the first build wrote it. */
  const V1 = {
    format: 'skyrome-save',
    version: 1,
    meta: { slot: 'manual-1', kind: 'manual', savedAt: '2026-10-01T10:00:00.000Z', gameDate: 'a.d. III Id. Mai.', playTime: 61, version: 1 },
    data: { time: { totalHours: 56, timeScale: 20 }, inventory: { stacks: [{ itemId: 'panis', count: 2 }], denarii: 7 } },
  };

  it('v1 → v2 adds the header and an empty delta store', () => {
    expect(migrateV1toV2(structuredClone(V1))).toEqual({
      format: 'skyrome-save',
      saveVersion: 2,
      generatorVersion: 0,
      worldSeed: 0,
      gameTime: { totalHours: 56, elapsedDays: 2, clamp: null },
      meta: V1.meta,
      data: { entityDeltas: {}, ...V1.data },
    });
  });

  it('loads a v1 file through the migrations; custom migrations chain before them', async () => {
    const w = world();
    await w.storage.write('skyrome.save.slot:old', JSON.stringify(V1));
    expect((await w.rpg.save.load('old')).ok).toBe(true);
    expect(w.rpg.inventory.denarii).toBe(7);
    expect(w.rpg.inventory.count('panis')).toBe(2);
    expect(w.game.time.totalHours).toBe(56);
    await w.storage.write('skyrome.save.slot:older', JSON.stringify({ ...V1, version: 0 }));
    w.rpg.save.registerMigration(0, (f) => ({ ...f, data: { ...(f.data as object), inventory: { stacks: [], denarii: 99 } } }));
    expect((await w.rpg.save.load('older')).ok).toBe(true);
    expect(w.rpg.inventory.denarii).toBe(99);
  });

  it('refuses corrupt, foreign and newer-version files without throwing', async () => {
    const w = world();
    const errors = record(w.events, ['save:error']);
    await w.storage.write('skyrome.save.slot:bad', '{not json');
    expect(await w.rpg.save.load('bad')).toMatchObject({ ok: false, error: 'corrupt save (not valid JSON)' });
    await w.storage.write('skyrome.save.slot:foreign', JSON.stringify({ hello: 1 }));
    expect((await w.rpg.save.load('foreign')).error).toBe('not a Skyrome save');
    await w.storage.write('skyrome.save.slot:future', JSON.stringify({ format: 'skyrome-save', saveVersion: SAVE_VERSION + 1, meta: {}, data: {} }));
    expect((await w.rpg.save.load('future')).error).toMatch(/newer version/);
    expect((await w.rpg.save.load('missing')).error).toBe('no such save');
    w.rpg.save.registerMigration(1, () => {
      throw new Error('broken');
    });
    await w.storage.write('skyrome.save.slot:old', JSON.stringify(V1));
    expect((await w.rpg.save.load('old')).error).toMatch(/migration failed/);
    expect(errors.length).toBe(5);
  });

  it('resets sections missing from the file and skips sections that fail', () => {
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
});

describe('slots and blockers', () => {
  it('ten manual slots: saveNew fills the first empty one; a corrupt index is rebuilt', async () => {
    const w = world();
    await w.rpg.save.save('manual-1');
    expect((await w.rpg.save.saveNew('second')).meta!.slot).toBe('manual-2');
    await w.storage.write('skyrome.save.index', 'garbage');
    expect((await w.rpg.save.list()).map((m) => m.slot).sort()).toEqual(['manual-1', 'manual-2']);
    await w.rpg.save.delete('manual-1');
    expect((await w.rpg.save.saveNew()).meta!.slot).toBe('manual-1');
    for (let i = 3; i <= MANUAL_SLOTS; i++) expect((await w.rpg.save.saveNew()).ok).toBe(true);
    const slots = await w.rpg.save.manualSlots();
    expect(slots.length).toBe(10);
    expect(slots.every((s) => s.meta)).toBe(true);
    expect((await w.rpg.save.saveNew()).error).toMatch(/all 10 manual slots are used/);
    expect((await w.rpg.save.save('manual-4', { name: 'overwrite' })).ok).toBe(true);
  });

  it('no saving in dialogue, in combat or while falling (unless forced); more blockers can be added', async () => {
    const w = world();
    w.rpg.dialogue.start('ex-scriba');
    expect((await w.rpg.save.save('quick')).error).toBe('You cannot save during a conversation');
    expect((await w.rpg.save.save('quick', { force: true })).ok).toBe(true);
    w.rpg.dialogue.end();
    w.rpg.sheet.vitals.inCombat = true;
    expect(w.rpg.save.whyNot()).toBe('You cannot save in combat');
    w.rpg.sheet.vitals.inCombat = false;
    Object.assign(w.game.player, { grounded: false, velocity: { y: -9 } });
    expect(w.rpg.save.whyNot()).toBe('You cannot save while falling');
    Object.assign(w.game.player, { grounded: true });
    const remove = w.rpg.save.addBlocker(() => 'The Carcer has no writing tablets');
    expect((await w.rpg.save.quicksave()).error).toBe('The Carcer has no writing tablets');
    remove();
    expect(w.rpg.save.whyNot()).toBeNull();
  });

  it('autosaves rotate through three slots; quest-stage autosaves come at most every 120 s', async () => {
    const w = world();
    for (let i = 0; i < 4; i++) {
      w.game.time.advanceHours(1);
      expect((await w.rpg.save.autosave({ force: true })).ok).toBe(true);
    }
    expect((await w.rpg.save.autosave({ reason: 'quest' })).ok).toBe(true);
    expect((await w.rpg.save.autosave({ reason: 'quest' })).error).toBe('too soon');
    const list = await w.rpg.save.list();
    expect(list.map((m) => m.slot).sort()).toEqual(['auto1', 'auto2', 'auto3']);
    expect(list.every((m) => m.kind === 'auto')).toBe(true);
    await w.rpg.save.delete('auto2');
    expect((await w.rpg.save.list()).length).toBe(2);
  });

  it('a save made while an autosave finishes loses neither the rotation counter nor its own index entry', async () => {
    /** Storage whose every access takes a little while, so operations would interleave. */
    class Slow extends MemoryStorage {
      override async read(key: string) {
        await new Promise((r) => setTimeout(r, 2));
        return super.read(key);
      }
      override async write(key: string, value: string) {
        await new Promise((r) => setTimeout(r, 2));
        return super.write(key, value);
      }
    }
    const storage = new Slow();
    const w = world(storage);
    let fired = false;
    w.events.on('save:saved', (e) => {
      if (e.slot === 'auto1' && !fired) {
        fired = true;
        void w.rpg.save.quicksave(); // F5 as the autosave lands
      }
    });
    expect((await w.rpg.save.autosave({ force: true })).ok).toBe(true);
    await w.rpg.save.idle();
    const index = JSON.parse((await storage.read('skyrome.save.index'))!);
    expect(Object.keys(index.slots).sort()).toEqual(['auto1', 'quick']);
    expect(index.autoCounter).toBe(1);
    // The next autosave goes to the next slot.
    expect((await w.rpg.save.autosave({ force: true })).meta!.slot).toBe('auto2');
    // Autosaves fired back to back still rotate.
    await Promise.all([w.rpg.save.autosave({ force: true }), w.rpg.save.autosave({ force: true })]);
    const list = await w.rpg.save.list();
    expect(list.map((m) => m.slot).sort()).toEqual(['auto1', 'auto2', 'auto3', 'quick']);
  });

  it('autosave triggers: quest stages (after the conversation ends), save:request (sleep, interiors) and every 10 minutes', async () => {
    const w = world();
    const saved = record(w.events, ['save:saved']);
    w.rpg.dialogue.start('ex-scriba');
    w.rpg.dialogue.choose(0);
    w.rpg.dialogue.choose(0); // accept: the quest starts → stage 'start'
    w.step(2);
    await w.rpg.save.idle();
    expect(saved.length).toBe(0); // still talking
    w.rpg.dialogue.end();
    w.step(1);
    await w.rpg.save.idle();
    expect(saved.length).toBe(1);
    w.events.emit('quest:stage', { questId: 'ex-letter', stage: 'reply' });
    w.step(1);
    await w.rpg.save.idle();
    expect(saved.length).toBe(1); // within 120 s of the last quest autosave
    w.events.emit('save:request', { reason: 'sleep' });
    w.step(1);
    await w.rpg.save.idle();
    expect(saved.length).toBe(2);
    w.rpg.save.playTime += 601;
    w.step(1);
    await w.rpg.save.idle();
    expect(saved.length).toBe(3);
    expect((saved.at(-1)!.e as { meta: { kind: string } }).meta.kind).toBe('auto');
  });

  it('F5 quicksaves and F9 quickloads through input actions; play time accumulates', async () => {
    const w = world();
    w.step(60);
    expect(w.rpg.save.playTime).toBeCloseTo(1, 1);
    w.pressed.add('quickSave');
    w.step(1);
    await w.rpg.save.idle();
    // (The new game's main quest may already have made an autosave.)
    expect((await w.rpg.save.list()).map((m) => m.slot).filter((s) => !s.startsWith('auto'))).toEqual(['quick']);
    w.rpg.inventory.addDenarii(100);
    w.pressed.add('quickLoad');
    w.step(1);
    await w.rpg.save.idle();
    expect(w.rpg.inventory.denarii).toBe(60);
  });
});

describe('new game', () => {
  it('starts from the beginning: the clock, play time, discovered places, world deltas and pending autosaves too', async () => {
    const w = world();
    const start = w.game.time.totalHours;
    const scale = w.game.time.timeScale;
    playABit(w);
    await w.rpg.save.idle(); // the quest autosave playABit set off
    w.game.time.advanceHours(240);
    w.game.time.timeScale = 60;
    w.rpg.save.playTime = 5000;
    expect(w.rpg.locations.isDiscovered('ex-basilica')).toBe(true);
    w.events.emit('save:request', { reason: 'sleep' });
    // Another module's saveable is reset too.
    let other = 'played';
    w.rpg.save.register('calendar', { save: () => other, load: (d) => (other = String(d)), reset: () => (other = 'fresh') });

    startNewGame(w.rpg, { background: 'veteranus' });
    expect(w.game.time.totalHours).toBe(start);
    expect(w.game.time.timeScale).toBe(scale);
    expect(w.rpg.save.playTime).toBe(0);
    expect(w.rpg.locations.isDiscovered('ex-basilica')).toBe(false);
    expect(w.game.deltas.isDead('npc-nobody')).toBe(false);
    expect(w.game.deltas.isLooted('urbs:3,-2:insula-chest:0')).toBe(false);
    expect(other).toBe('fresh');
    expect(w.rpg.crime.bounty()).toBe(0);
    expect(w.rpg.quests.status('ex-letter')!.running).toBe(false);
    expect(w.rpg.sheet.hasFlag('trait-old-wound')).toBe(true);
    // The sleep autosave asked for before New Game doesn't fire into the new game.
    const saved = record(w.events, ['save:saved']);
    w.step(1);
    await w.rpg.save.idle();
    expect(saved).toEqual([]);
    // Saves of the new game carry its own play time.
    w.step(60);
    const r = await w.rpg.save.save('manual-2');
    expect(r.meta!.playTime).toBe(1);
  });
});

describe('export and import (GDD §14.13)', () => {
  it('exports a slot as JSON and imports it into the first empty manual slot; old files are migrated on import', async () => {
    const w = world();
    playABit(w);
    await w.rpg.save.save('manual-1', { name: 'Exported' });
    const text = await w.rpg.save.exportSave('manual-1');
    expect(text).toBeTruthy();
    expect(await w.rpg.save.exportSave('nope')).toBeNull();
    const other = world();
    const r = await other.rpg.save.importSave(text!);
    expect(r).toMatchObject({ ok: true, meta: { slot: 'manual-1', kind: 'manual', name: 'Exported' } });
    expect((await other.rpg.save.load('manual-1')).ok).toBe(true);
    expect(other.rpg.devotion.patron!.id).toBe('patronus-mars');
    expect((await other.rpg.save.importSave('{"hello":1}')).error).toBe('not a Skyrome save');
    const v1 = { format: 'skyrome-save', version: 1, meta: { slot: 'x', kind: 'manual', savedAt: '', gameDate: '', playTime: 0, version: 1 }, data: { inventory: { stacks: [], denarii: 3 } } };
    const imp = await other.rpg.save.importSave(JSON.stringify(v1), 'manual-7');
    expect(imp.meta!.slot).toBe('manual-7');
    expect(JSON.parse((await other.storage.read('skyrome.save.slot:manual-7'))!).saveVersion).toBe(SAVE_VERSION);
    expect(await other.rpg.save.importFile(new Blob([text!]), 'manual-9')).toMatchObject({ ok: true });
  });
});

describe('entity deltas', () => {
  it('records killed actors and looted containers by stable id', () => {
    const w = world();
    w.events.emit('actor:killed', { victimId: 'npc-felix' });
    expect(w.game.deltas.isDead('npc-felix')).toBe(true);
    const chest = proceduralId('urbs', 12, -4, 'taberna-chest', 2);
    expect(chest).toBe('urbs:12,-4:taberna-chest:2');
    w.game.deltas.markLooted(chest);
    w.game.deltas.merge(chest, { stack: 3 });
    expect(w.game.deltas.get(chest)).toEqual({ looted: true, stack: 3 });
    expect(w.game.deltas.entries('urbs:12').length).toBe(1);
    w.game.deltas.remove(chest);
    expect(w.game.deltas.has(chest)).toBe(false);
    w.game.deltas.restore({ a: { dead: true }, b: 'junk', c: [1] });
    expect(w.game.deltas.size).toBe(1);
  });
});

describe('storage', () => {
  class FullStorage extends MemoryStorage {
    override async write(key: string, value: string) {
      if (value.length > 20 && value !== IDB_POINTER) throw new Error('QuotaExceededError');
      return super.write(key, value);
    }
  }
  class BrokenStorage extends MemoryStorage {
    override async read(): Promise<string | null> {
      throw new Error('IDB gone');
    }
    override async write(): Promise<void> {
      throw new Error('IDB gone');
    }
    override async keys(): Promise<string[]> {
      throw new Error('IDB gone');
    }
  }

  it('the default is IndexedDB with a localStorage fallback (memory where neither exists, as in node)', () => {
    expect(createDefaultStorage()).toBeInstanceOf(MemoryStorage);
  });

  it('FallbackStorage uses the fallback when the primary throws or has nothing', async () => {
    const fb = new MemoryStorage();
    const s = new FallbackStorage(new BrokenStorage(), fb);
    await s.write('k', 'v');
    expect(fb.map.get('k')).toBe('v');
    expect(await s.read('k')).toBe('v');
    expect(await s.keys('k')).toEqual(['k']);
    const prim = new MemoryStorage();
    const ok = new FallbackStorage(prim, fb);
    expect(await ok.read('k')).toBe('v'); // only the fallback has it
    await ok.write('k', 'w');
    expect(prim.map.get('k')).toBe('w');
    await Promise.resolve();
    expect(fb.map.has('k')).toBe(false); // the stale copy is cleaned up
    expect(await ok.read('k')).toBe('w');
    await ok.remove('k');
    expect(await ok.read('k')).toBeNull();
  });

  it('FallbackStorage reads the newest copy: a save that fell back is not shadowed by an older primary copy', async () => {
    let failWrites = false;
    class Flaky extends MemoryStorage {
      override async write(key: string, value: string) {
        if (failWrites) throw new Error('QuotaExceededError');
        return super.write(key, value);
      }
      override async remove(key: string) {
        if (failWrites) throw new Error('IDB gone');
        return super.remove(key);
      }
    }
    const prim = new Flaky();
    const fb = new MemoryStorage();
    const s = new FallbackStorage(prim, fb);
    await s.write('slot:quick', 'OLD');
    await s.write('index', '{"v":1}');
    failWrites = true;
    await s.write('slot:quick', 'NEW');
    await s.write('index', '{"v":2}');
    expect(prim.map.get('slot:quick')).toBe('OLD'); // couldn't be removed
    expect(await s.read('slot:quick')).toBe('NEW');
    expect(await s.read('index')).toBe('{"v":2}');
    // The primary recovers: its write takes over and the fallback copy goes.
    failWrites = false;
    await s.write('slot:quick', 'NEWER');
    expect(fb.map.has('slot:quick')).toBe(false);
    expect(await s.read('slot:quick')).toBe('NEWER');
    // When the primary can drop its old copy on a fallback write, it does.
    failWrites = true;
    prim.remove = MemoryStorage.prototype.remove;
    await s.write('slot:quick', 'LATEST');
    await Promise.resolve();
    expect(prim.map.has('slot:quick')).toBe(false);
    expect(await s.read('slot:quick')).toBe('LATEST');
  });

  it('IdbSaveStorage settles on the transaction: an abort on commit (quota) rejects, and FallbackStorage falls back', async () => {
    const idb = fakeIdb();
    const store = new IdbSaveStorage('test', 'saves', idb.factory);
    await store.write('k', 'one');
    expect(await store.read('k')).toBe('one');
    expect(await store.keys('')).toEqual(['k']);
    idb.abortNextCommit = true;
    await expect(store.write('k', 'two')).rejects.toThrow('QuotaExceededError');
    expect(await store.read('k')).toBe('one');
    // Through FallbackStorage: the aborted write lands in localStorage and reads back.
    const fb = new MemoryStorage();
    await fb.write('k', 'stale-fallback');
    const s = new FallbackStorage(store, fb);
    await s.write('k', 'three'); // succeeds in IDB: the stale fallback copy goes
    expect(fb.map.has('k')).toBe(false);
    idb.abortNextCommit = true;
    await s.write('k', 'four');
    expect(fb.map.get('k')).toBe('four');
    expect(await s.read('k')).toBe('four');
    // A connection closed by the browser is reopened.
    idb.closeAll();
    await store.write('k2', 'x');
    expect(idb.opens).toBe(2);
  });

  it('HybridStorage sends saves over the size guard to the big store, leaving a pointer', async () => {
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

  it('HybridStorage falls back to the big store when localStorage is full; a save fails cleanly without one', async () => {
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

/**
 * A tiny IndexedDB stand-in: requests succeed asynchronously, then the transaction completes — or,
 * with `abortNextCommit`, aborts with a QuotaExceededError after the request has succeeded (what
 * browsers do when the commit runs out of quota).
 */
function fakeIdb() {
  const data = new Map<string, unknown>();
  const conns: { closed: boolean; onclose: (() => void) | null }[] = [];
  const ctl = {
    abortNextCommit: false,
    opens: 0,
    closeAll() {
      for (const c of conns) {
        c.closed = true;
        c.onclose?.();
      }
    },
    factory: null as unknown as IDBFactory,
  };
  const later = (fn: () => void) => setTimeout(fn, 0);
  function makeDb() {
    const conn = {
      closed: false,
      onclose: null as (() => void) | null,
      onversionchange: null as (() => void) | null,
      close() {
        conn.closed = true;
      },
      transaction(_store: string, mode: string) {
        if (conn.closed) throw new Error('InvalidStateError');
        const abort = mode === 'readwrite' && ctl.abortNextCommit;
        if (abort) ctl.abortNextCommit = false;
        const staged = new Map(data);
        const t = { error: null as Error | null, oncomplete: null as (() => void) | null, onabort: null as (() => void) | null, onerror: null as (() => void) | null };
        const request = (op: () => unknown) => {
          const req = { result: undefined as unknown, error: null, onsuccess: null as (() => void) | null, onerror: null as (() => void) | null };
          later(() => {
            req.result = op();
            req.onsuccess?.();
            later(() => {
              if (abort) {
                t.error = new Error('QuotaExceededError');
                t.onabort?.();
              } else {
                if (mode === 'readwrite') {
                  data.clear();
                  for (const [k, v] of staged) data.set(k, v);
                }
                t.oncomplete?.();
              }
            });
          });
          return req;
        };
        const objectStore = () => ({
          get: (k: string) => request(() => staged.get(k)),
          put: (v: unknown, k: string) => request(() => (staged.set(k, v), k)),
          delete: (k: string) => request(() => (staged.delete(k), undefined)),
          getAllKeys: () => request(() => [...staged.keys()]),
        });
        return Object.assign(t, { objectStore });
      },
    };
    conns.push(conn);
    return conn;
  }
  ctl.factory = {
    open() {
      ctl.opens++;
      const req = { result: null as unknown, error: null, onsuccess: null as (() => void) | null, onerror: null as (() => void) | null, onupgradeneeded: null as (() => void) | null };
      later(() => {
        req.result = makeDb();
        req.onsuccess?.();
      });
      return req;
    },
  } as unknown as IDBFactory;
  return ctl;
}
