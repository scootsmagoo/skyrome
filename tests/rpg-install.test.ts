import type { Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus, type GameEvents } from '../src/core/Events';
import { NpcRegistry } from '../src/npc/registry';
import type { NpcDef } from '../src/npc/types';
import { installRpg } from '../src/rpg/install';
import { canArrest, resolveYield } from '../src/rpg/yield';
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
    for (const k of ['items', 'npcs', 'locations', 'factions', 'standing', 'devotion', 'crime', 'barter', 'quests', 'dialogue', 'save', 'rpg'] as const) expect(fg.game[k], k).toBeTruthy();
    expect(rpg.items.size).toBeGreaterThanOrEqual(80);
    expect(rpg.dialogue.start('anyone')).toBeNull();
    expect(rpg.quests.markers()).toEqual([]);
    expect(() => fg.step(30)).not.toThrow();
    expect(fg.systems.map((s) => s.name).sort()).toEqual(['locations', 'rpg', 'save']);
  });

  it('attaches the sheet and inventory to the player and starts a new game with an origin', () => {
    const fg = fakeGame();
    const rpg = installRpg(fg.game, { storage: new MemoryStorage(), background: 'veteranus' });
    expect(fg.game.player.sheet).toBe(rpg.sheet);
    expect(fg.game.player.inventory).toBe(rpg.inventory);
    // GDD §3.2: skills 10, shield +10, blades +5, heavy armor +5, athletics −5 (old wound).
    expect(rpg.sheet.skillLevel('shield')).toBe(20);
    expect(rpg.sheet.skillLevel('blades')).toBe(15);
    expect(rpg.sheet.skillLevel('heavy-armor')).toBe(15);
    expect(rpg.sheet.skillLevel('athletics')).toBe(5);
    expect(rpg.sheet.skillLevel('rhetoric')).toBe(10);
    expect(rpg.sheet.hasFlag('trait-old-wound')).toBe(true);
    expect(rpg.inventory.equipment).toEqual({ mainHand: 'gladius', offHand: 'scutum', body: 'tunica', cloak: 'sagum', feet: 'caligae', head: 'galea-gallica' });
    // The signature weapon starts at 70%; the worn scutum at 60%.
    expect(rpg.inventory.conditionOf('mainHand')).toBe(0.7);
    expect(rpg.inventory.conditionOf('offHand')).toBe(0.6);
    expect(rpg.inventory.count('diploma')).toBe(1);
    // §3.5 common kit: 2 bandages, a loaf, a wax tablet (the courier's tablet comes with mq-01).
    expect(rpg.inventory.count('fascia')).toBe(2);
    expect(rpg.inventory.count('panis')).toBe(1);
    expect(rpg.inventory.count('tabula-cerata')).toBe(1);
    expect(rpg.inventory.denarii).toBe(120);
    expect(rpg.standing.origin).toBe('veteranus');
    expect(rpg.standing.legal).toBe('civis');
    expect(rpg.sheet.vitals.pietas.current).toBe(25);
    const dacus = installRpg(fakeGame().game, { storage: new MemoryStorage(), background: 'dacus' });
    expect(dacus.standing.isCitizen).toBe(false);
    expect(dacus.standing.legal).toBe('latinus-iunianus');
    expect(dacus.standing.dignitas).toBe('peregrinus');
    expect(dacus.inventory.equipped('mainHand')).toBe('sica');
    const eques = installRpg(fakeGame().game, { storage: new MemoryStorage(), background: 'eques-lapsus' });
    expect(eques.standing.debt).toBe(2000);
    expect(eques.inventory.denarii).toBe(20);
    expect(eques.inventory.conditionOf('cloak')).toBe(0.5);
    const plain = installRpg(fakeGame().game, { storage: new MemoryStorage() });
    expect(plain.inventory.equipment).toEqual({ body: 'tunica', feet: 'soleae' });
    expect(plain.inventory.denarii).toBe(10);
  });

  it('sprinting drains 8 stamina/s (heavy armor +25%); exhausted until 15 is back; over-encumbered you walk', () => {
    const fg = fakeGame({ controller: true });
    const pc = fg.game.getSystem<{ name: string; canSprint: () => boolean; speedMultiplier: () => number }>('playerController')!;
    const rpg = installRpg(fg.game, { storage: new MemoryStorage() });
    expect(pc.canSprint()).toBe(true);
    fg.game.player.sprinting = true;
    fg.step(60);
    expect(rpg.sheet.vitals.stamina.current).toBeCloseTo(100 - 8, 1);
    fg.step(60 * 12);
    expect(rpg.sheet.vitals.stamina.current).toBe(0);
    expect(pc.canSprint()).toBe(false);
    fg.game.player.sprinting = false;
    fg.step(30);
    expect(pc.canSprint()).toBe(false); // exhausted until 15 has regenerated (§6.6)
    fg.step(90);
    expect(pc.canSprint()).toBe(true);
    expect(pc.speedMultiplier()).toBe(1);
    rpg.inventory.add('lorica-hamata');
    rpg.inventory.equip('lorica-hamata');
    const before = rpg.sheet.vitals.stamina.current;
    fg.game.player.sprinting = true;
    fg.step(60);
    expect(before - rpg.sheet.vitals.stamina.current).toBeCloseTo(10, 0); // one frame of regeneration before the drain starts
    fg.game.player.sprinting = false;
    rpg.inventory.add('malleus', 20);
    expect(pc.speedMultiplier()).toBeCloseTo(1.9 / 4.4);
    expect(pc.canSprint()).toBe(false);
  });

  it('heavy body armor: −15% stamina regeneration, +25% sprint cost, louder steps — each removed by its perk', () => {
    const fg = fakeGame();
    const rpg = installRpg(fg.game, { storage: new MemoryStorage() });
    rpg.inventory.add('lorica-segmentata');
    rpg.inventory.equip('lorica-segmentata');
    expect(rpg.sheet.modifier('stamina.regen')).toBeCloseTo(-0.15);
    expect(rpg.sheet.modifier('stamina.sprintCost')).toBeCloseTo(-0.25);
    expect(rpg.sheet.hasFlag('heavy-armor.noisy')).toBe(true);
    rpg.sheet.grantPerkPoints(3);
    rpg.sheet.setSkill('heavy-armor', 50);
    rpg.sheet.setSkill('stealth', 40);
    rpg.sheet.takePerk('perk-heavy-armor-well-fitted');
    rpg.sheet.takePerk('perk-heavy-armor-cingulum');
    rpg.sheet.takePerk('perk-stealth-silent-hobnails');
    expect(rpg.sheet.modifier('stamina.regen')).toBe(0);
    expect(rpg.sheet.modifier('stamina.sprintCost')).toBe(0);
    expect(rpg.sheet.hasFlag('heavy-armor.noisy')).toBe(false);
    rpg.inventory.unequip('body');
    rpg.sheet.restore(undefined);
    expect(rpg.sheet.modifier('stamina.regen')).toBe(0);
  });

  it('wires the hourly checks (lapsed bounties, overdue vows), vows to quest outcomes, and cleanliness to its condition', () => {
    const fg = fakeGame();
    const rpg = installRpg(fg.game, { storage: new MemoryStorage(), examples: true });
    rpg.crime.commit('trespass', { witnessed: true });
    rpg.devotion.vow('ex-letter', 10);
    rpg.quests.start('ex-letter');
    rpg.quests.complete('ex-letter');
    expect(rpg.devotion.vows()[0].state).toBe('owed');
    fg.game.time.advanceHours(8 * 24);
    expect(rpg.crime.bounty()).toBe(0);
    expect(rpg.devotion.vows()).toEqual([]);
    expect(rpg.sheet.hasCondition('infaustus')).toBe(true);
    rpg.standing.setCleanliness('lautus');
    expect(rpg.sheet.hasCondition('lautus')).toBe(true);
    expect(rpg.sheet.modifier('stamina.regen')).toBeCloseTo(0.1);
    rpg.standing.setCleanliness('sordidus');
    expect(rpg.sheet.hasCondition('lautus')).toBe(false);
    expect(rpg.sheet.hasCondition('sordidus')).toBe(true);
    rpg.standing.setCleanliness('normal');
    expect(rpg.sheet.hasCondition('sordidus')).toBe(false);
  });

  it('yield choices (§6.9): spare +5 pietas and Fama; rob; arrest needs a mandate; kill −15 pietas and a crime if seen', () => {
    const fg = fakeGame();
    const rpg = installRpg(fg.game, { storage: new MemoryStorage() });
    const deps = { ...rpg, night: () => fg.game.time.isNight };
    expect(resolveYield(deps, 'spare', { npcId: 'grassator-1', district: 'velabrum' })).toBe(true);
    expect(rpg.sheet.vitals.pietas.current).toBe(30);
    expect(rpg.standing.fame('velabrum')).toBe(2);
    resolveYield(deps, 'rob', { npcId: 'grassator-2', purse: 3, witnessed: true });
    expect(rpg.inventory.denarii).toBe(13);
    expect(rpg.crime.bounty()).toBe(6);
    expect(canArrest(deps)).toBe(false);
    expect(resolveYield(deps, 'arrest', { npcId: 'grassator-3', bounty: 20 })).toBe(false);
    expect(resolveYield(deps, 'arrest', { npcId: 'grassator-3', bounty: 20, contract: true })).toBe(true);
    expect(rpg.inventory.denarii).toBe(33);
    rpg.factions.join('vigiles');
    expect(canArrest(deps)).toBe(false); // a vigil needs the rank of sebaciarius
    rpg.factions.addReputation('vigiles', 10);
    fg.game.time.advanceHours(14); // 22:00
    expect(canArrest(deps)).toBe(true);
    resolveYield(deps, 'kill', { npcId: 'grassator-4', witnessed: true });
    expect(rpg.sheet.vitals.pietas.current).toBe(15);
    expect(rpg.crime.bounty()).toBe(1006);
    expect(rpg.crime.sentence()).toBe('ad-ludum');
  });

  it('ticks timed effects in fixed steps', () => {
    const fg = fakeGame();
    const rpg = installRpg(fg.game, { storage: new MemoryStorage() });
    rpg.sheet.applyCondition('benedictio-mars');
    expect(rpg.sheet.modifier('damage.blades')).toBeCloseTo(0.1);
    fg.step(4300, 1); // a game day is 4320 real seconds
    expect(rpg.sheet.modifier('damage.blades')).toBeCloseTo(0.1);
    fg.step(30, 1);
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
    expect(rpg.locations.current()?.id).toBe('ex-rostra');
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
