import type { Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus, type GameEvents } from '../src/core/Events';
import { NpcRegistry } from '../src/npc/registry';
import type { NpcDef } from '../src/npc/types';
import { installRpg } from '../src/rpg/install';
import { MemoryStorage } from '../src/save/storage';
import { LocationRegistry } from '../src/world/locations';
import { fakeGame, record } from './rpg-fakes';

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('installRpg', () => {
  it('works in a dev scene with no player and no NPCs', () => {
    const fg = fakeGame({ player: false });
    const rpg = installRpg(fg.game, { storage: new MemoryStorage() });
    for (const k of ['items', 'npcs', 'locations', 'factions', 'crime', 'barter', 'quests', 'dialogue', 'save', 'rpg'] as const) expect(fg.game[k], k).toBeTruthy();
    expect(rpg.items.size).toBeGreaterThanOrEqual(80);
    expect(rpg.dialogue.start('anyone')).toBeNull();
    expect(rpg.quests.markers()).toEqual([]);
    expect(() => fg.step(30)).not.toThrow();
    expect(fg.systems.map((s) => s.name).sort()).toEqual(['locations', 'rpg', 'save']);
  });

  it('attaches the sheet and inventory to the player and starts a new game with a background', () => {
    const fg = fakeGame();
    const rpg = installRpg(fg.game, { storage: new MemoryStorage(), background: 'veteran' });
    expect(fg.game.player.sheet).toBe(rpg.sheet);
    expect(fg.game.player.inventory).toBe(rpg.inventory);
    expect(rpg.sheet.skillLevel('blades')).toBe(25);
    expect(rpg.inventory.equipment).toMatchObject({ mainHand: 'gladius', body: 'tunica', feet: 'caligae', cloak: 'sagum' });
    expect(rpg.inventory.denarii).toBe(25);
    const plain = installRpg(fakeGame().game, { storage: new MemoryStorage() });
    expect(plain.inventory.equipment).toEqual({ body: 'tunica', feet: 'soleae' });
    expect(plain.inventory.denarii).toBe(10);
  });

  it('drains stamina while sprinting and gates sprint/speed through the PlayerController hooks', () => {
    const fg = fakeGame({ controller: true });
    const pc = fg.game.getSystem<{ name: string; canSprint: () => boolean; speedMultiplier: () => number }>('playerController')!;
    const rpg = installRpg(fg.game, { storage: new MemoryStorage() });
    expect(pc.canSprint()).toBe(true);
    fg.game.player.sprinting = true;
    fg.step(60);
    expect(rpg.sheet.vitals.stamina.current).toBeCloseTo(100 - 8, 0);
    fg.step(60 * 12);
    expect(rpg.sheet.vitals.stamina.current).toBe(0);
    expect(pc.canSprint()).toBe(false);
    fg.game.player.sprinting = false;
    fg.step(60 * 2);
    expect(pc.canSprint()).toBe(false); // winded until 15%
    fg.step(60 * 3);
    expect(pc.canSprint()).toBe(true);
    expect(pc.speedMultiplier()).toBe(1);
    rpg.inventory.add('malleus', 20);
    expect(pc.speedMultiplier()).toBe(0.5);
    expect(pc.canSprint()).toBe(false);
  });

  it('ticks timed effects in fixed steps', () => {
    const fg = fakeGame();
    const rpg = installRpg(fg.game, { storage: new MemoryStorage() });
    rpg.sheet.applyCondition('mars');
    expect(rpg.sheet.modifier('damage.blades')).toBeCloseTo(0.1);
    fg.step(60 * 8 * 60 + 5);
    expect(rpg.sheet.modifier('damage.blades')).toBe(0);
  });
});

describe('LocationRegistry', () => {
  function setup() {
    const events = new EventBus<GameEvents>();
    const pos = { x: 0, z: 0 };
    const loc = new LocationRegistry({ events, position: () => pos });
    loc.add([
      { id: 'forum', name: 'Forum Romanum', position: { x: 0, z: 0 }, radius: 50, mapMarker: 'forum', discoverable: true },
      { id: 'rostra', name: 'Rostra', position: { x: 5, z: 0 }, radius: 4, parent: 'forum' },
      { id: 'curia', name: 'Curia Iulia', position: { x: 30, z: -20 }, radius: 8, discoverable: true, parent: 'forum' },
      { id: 'colosseum', name: 'Flavian Amphitheatre', position: { x: 400, z: 100 }, radius: 60, discoverable: true },
    ]);
    const log = record(events, ['location:entered', 'location:exited', 'location:discovered']);
    return { loc, pos, log, short: () => log.map((l) => `${l.type.split(':')[1]}:${(l.e as { locationId: string }).locationId}`) };
  }

  it('checks about four times a second and emits entered/discovered once per entry, outermost first', () => {
    const { loc, pos, short } = setup();
    pos.x = 5;
    loc.update(0.1);
    expect(short()).toEqual([]);
    loc.update(0.2);
    expect(short()).toEqual(['entered:forum', 'discovered:forum', 'entered:rostra']);
    loc.update(0.3);
    expect(short().length).toBe(3);
    expect(loc.current()!.id).toBe('rostra');
  });

  it('exits with a margin, re-enters, but discovers only once', () => {
    const { loc, pos, short, log } = setup();
    loc.check({ x: 30, z: -20 });
    expect(short()).toEqual(['entered:forum', 'discovered:forum', 'entered:curia', 'discovered:curia']);
    log.length = 0;
    loc.check({ x: 38.5, z: -20 }); // just past the 8 m radius, inside the 1 m margin
    expect(short()).toEqual([]);
    loc.check({ x: 40, z: -20 });
    expect(short()).toEqual(['exited:curia']);
    loc.check({ x: 30, z: -20 });
    expect(short()).toEqual(['exited:curia', 'entered:curia']);
    expect(loc.isDiscovered('curia')).toBe(true);
    expect(loc.hasVisited('curia')).toBe(true);
    void pos;
  });

  it('nearest / containing / discover / persistence (silent after load)', () => {
    const { loc, short, log } = setup();
    expect(loc.nearest({ x: 350, z: 90 })!.def.id).toBe('colosseum');
    expect(loc.nearest({ x: 350, z: 90 }, (d) => d.mapMarker === 'forum')!.def.id).toBe('forum');
    expect(loc.containing({ x: 5, z: 0 }).map((d) => d.id)).toEqual(['rostra', 'forum']);
    expect(loc.children('forum').map((d) => d.id)).toEqual(['rostra', 'curia']);
    expect(loc.discover('colosseum')).toBe(true);
    expect(loc.discover('colosseum')).toBe(false);
    expect(short()).toEqual(['discovered:colosseum']);
    const saved = JSON.parse(JSON.stringify(loc.serialize()));
    log.length = 0;
    loc.restore(saved);
    loc.check({ x: 0, z: 0 });
    expect(short()).toEqual([]);
    expect(loc.current()!.id).toBe('forum');
    expect(loc.discoveredList().map((d) => d.id)).toEqual(['colosseum', 'forum']);
  });

  it('does nothing without a position', () => {
    const events = new EventBus<GameEvents>();
    const loc = new LocationRegistry({ events });
    loc.add({ id: 'a', name: 'A', position: { x: 0, z: 0 }, radius: 10 });
    expect(() => loc.update(1)).not.toThrow();
    expect(loc.current()).toBeUndefined();
  });

  it('wired by installRpg to the player position', () => {
    const fg = fakeGame();
    const rpg = installRpg(fg.game, { storage: new MemoryStorage(), examples: true });
    (fg.game.player.position as Vector3).set(-6, 0, 2);
    fg.step(20);
    expect(rpg.locations.current()?.id).toBe('ex_rostra');
  });
});

describe('NpcRegistry', () => {
  const appearance: NpcDef['appearance'] = { sex: 'female', age: 'adult', build: 'slight', height: 1.6, skin: '#c69c7a', hair: { style: 'veiled', color: '#2a2018' }, garments: [{ kind: 'stola', color: '#7d5a7a' }] };
  const defs: NpcDef[] = [
    { id: 'a', name: 'Aelia', appearance, faction: 'isiaci', tags: ['priest'], services: ['priest', 'healer'], home: 'iseum' },
    { id: 'b', name: 'Bassus', appearance, faction: 'vigiles', schedule: [{ from: 6, at: 'statio', activity: 'guard' }, { from: 20, at: 'iseum', activity: 'patrol' }] },
    { id: 'c', name: 'Clodia', appearance, tags: ['priest'] },
  ];

  it('looks up by id, faction, tag, service and location', () => {
    const r = new NpcRegistry(defs);
    expect(r.size).toBe(3);
    expect(r.get('b')!.name).toBe('Bassus');
    expect(r.name('c')).toBe('Clodia');
    expect(r.name('zz')).toBeUndefined();
    expect(r.byFaction('vigiles').map((d) => d.id)).toEqual(['b']);
    expect(r.byTag('priest').map((d) => d.id)).toEqual(['a', 'c']);
    expect(r.withService('healer').map((d) => d.id)).toEqual(['a']);
    expect(r.at('iseum').map((d) => d.id)).toEqual(['a', 'b']);
    r.add({ ...defs[2], name: 'Clodia Secunda' });
    expect(r.name('c')).toBe('Clodia Secunda');
  });
});
