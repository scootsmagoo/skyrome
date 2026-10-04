/**
 * The combat module in the world: how spawn requests from quest content and the NPC module turn
 * into fighters (src/combat/spawnSpec.ts), the mq-01 tutorial openers, what 'actor:killed' tells
 * quests (dead / ko / fled), lootable bodies (§6.14), the player's knockout, and the night
 * muggers of §13.3 (src/combat/danger.ts).
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/Rng';
import { bodyContents } from '../src/combat/bodies';
import { DANGER_SITES, isNight, muggerPrice, roadPoint, siteReady } from '../src/combat/danger';
import { adoptProfile, resolveSpawn } from '../src/combat/spawnSpec';
import { ROADS } from '../src/data/atlas';
import { TIMING } from '../src/combat/timing';
import { combatSettings } from '../src/combat/settings';
import { DEFAULT_SETTINGS } from '../src/core/Settings';
import { archetypeProfile, combatProfileFor } from '../src/rpg/enemies';
import { addNpc, addPlayer, deaths, fakeEnv, items, makeCore, run } from './combat-fakes';

describe('spawn requests in content words (src/content/director.ts)', () => {
  it('practice means practice arms; a gladiator archetype the combat module never authored still spawns', () => {
    const r = resolveSpawn({ archetype: 'murmillo', practice: true, quest: 'lud-01-sacramentum', tags: ['lusio'] }, items);
    expect(r.spec.id).toBe('murmillo');
    expect(r.lusio).toBe(true);
    expect(r.profile.weapon).toBe('rudis');
    expect(r.team).toBe('ludus');
    expect(r.tags).toEqual(['lusio', 'lud-01-sacramentum']);
  });

  it('a boss id wins over the archetype: retiarius + boss-nereus is Nereus with his net', () => {
    const r = resolveSpawn({ archetype: 'retiarius', boss: 'boss-nereus', practice: true }, items);
    expect(r.spec.id).toBe('boss-nereus');
    expect(r.nereus).toBe(true);
    expect(r.profile.health).toBe(300);
    expect(r.profile.yieldAt).toBe(0.15);
    expect(r.spec.boss?.phases).toEqual([0.75, 0.45]);
  });

  it("a named NPC's stat block replaces the archetype's numbers, and its name and look come along", () => {
    const npc = { id: 'npc-pullus', name: 'Pullus', title: 'Tiro', combat: { ...combatProfileFor('thug'), health: 45, skill: 15, weapon: 'gladius', shield: 'scutum', blockSkill: 0.25 } };
    const r = resolveSpawn({ archetype: 'murmillo', practice: true, npc }, items);
    expect(r.name).toBe('Pullus');
    expect(r.title).toBe('Tiro');
    expect(r.profile.blockSkill).toBe(0.25);
    expect(r.profile.weapon).toBe('rudis'); // a lusio still swaps steel for wood
  });

  it('brawl, yieldAt and hostile pass through; unknown archetypes fall back to a knife thug', () => {
    const r = resolveSpawn({ archetype: 'ebrius-rixator', brawl: true, yieldAt: 0.4 }, items);
    expect(r.brawl).toBe(true);
    expect(r.profile.yieldAt).toBe(0.4);
    const u = resolveSpawn({ archetype: 'lemur-nocturnus', hostile: true }, items);
    expect(u.spec.role).toBe('plebeian-man');
    expect(u.hostile).toBe(true);
    expect(u.profile.archetype).toBe('grassator');
  });

  it("content's own stat block (opts.profile) replaces the archetype's numbers; practice arms and yieldAt still apply", () => {
    const profile = { ...archetypeProfile('grassator', items, { kit: 1 }), name: 'Grassator with a cudgel', skill: 15, blockSkill: 0.15, yieldAt: 0.25, fleeAt: 0.15, health: 52 };
    const r = resolveSpawn({ archetype: 'grassator', quest: 'mq-01-madida-capena', profile }, items, 1);
    expect([r.profile.health, r.profile.blockSkill, r.profile.fleeAt, r.profile.weapon]).toEqual([52, 0.15, 0.15, 'fustis']);
    expect(r.opener).toBe('delayed-power');
    const named = resolveSpawn({ archetype: 'thraex', practice: true, profile: { ...archetypeProfile('thraex', items), weapon: 'sica', health: 70 }, yieldAt: 0.3 }, items);
    expect([named.profile.health, named.profile.weapon, named.profile.yieldAt]).toEqual([70, 'rudis', 0.3]);
  });

  it("mq-01's two grassatores get the tutorial openers: A (knife) chains, B (cudgel) waits and powers", () => {
    const a = resolveSpawn({ archetype: 'grassator', quest: 'mq-01-madida-capena' }, items, 0);
    const b = resolveSpawn({ archetype: 'grassator', quest: 'mq-01-madida-capena' }, items, 1);
    expect([a.opener, a.profile.weapon]).toEqual(['chain', 'pugio']);
    expect([b.opener, b.profile.weapon]).toEqual(['delayed-power', 'fustis']);
    expect(resolveSpawn({ archetype: 'grassator' }, items).opener).toBeNull();
  });
});

describe('adopting actors the NPC module placed', () => {
  it('uses the definition, else the faction (watch, soldiers), else a civilian who defends himself', () => {
    const def = { name: 'Crispus', combat: { ...combatProfileFor('bruiser'), name: 'Crispus' } };
    expect(adoptProfile('npc-crispus', items, { npc: def }).profile.tier).toBe('bruiser');
    const v = adoptProfile('vigil-3', items, { faction: 'vigiles' });
    expect([v.profile.archetype, v.lawful, v.team]).toEqual(['vigil', true, 'law']);
    const c = adoptProfile('baker', items, {});
    expect([c.profile.tier, c.team, c.lawful]).toEqual(['civilian', 'npc:baker', false]);
    expect(adoptProfile('thug', items, { hostile: true }).profile.archetype).toBe('grassator');
  });
});

describe("what 'actor:killed' tells quests (kill:<tag> counts kills, knockouts and flights)", () => {
  it('a death carries the quest tags, the archetype and "dead"', () => {
    const env = fakeEnv();
    const core = makeCore(env);
    const p = addPlayer(core);
    const t = addNpc(core, 't', { ...combatProfileFor('thug', { kit: 1 }), archetype: 'grassator', yieldAt: 0, fleeAt: 0 });
    t.tags = ['mq-01-madida-capena'];
    core.engage(t, p);
    core.kill(t, p);
    expect(env.of('actor:killed')).toEqual([{ victimId: 't', killerId: 'player', tags: ['mq-01-madida-capena', 'grassator', 'dead'] }]);
    expect(t.vitals.dead).toBe(true);
  });

  it('a flight is reported once the runner is 30 m away (or after 15 s)', () => {
    const env = fakeEnv();
    const core = makeCore(env);
    const p = addPlayer(core);
    const t = addNpc(core, 't', { ...combatProfileFor('thug', { kit: 1 }), archetype: 'grassator' }, { ai: true, brain: { prefersFlee: true } });
    core.engage(t, p);
    t.vitals.set('health', 4);
    run(core, 8);
    expect(t.status).toBe('fled');
    expect(env.of('actor:killed')).toEqual([{ victimId: 't', killerId: 'player', tags: ['grassator', 'fled'] }]);
    expect(deaths(env)).toHaveLength(0);
  });

  it('the player knocked out in the street is out a few seconds, and the event names who was fighting', () => {
    const env = fakeEnv();
    const core = makeCore(env);
    const p = addPlayer(core, { health: 10 });
    const t = addNpc(core, 't', combatProfileFor('thug', { kit: 0 }), { ai: true });
    core.engage(t, p);
    core.knockout(p, t);
    const e = env.of('combat:playerDefeated')[0] as { outcome: string; foes: string[] };
    expect(e.outcome).toBe('knocked-out');
    expect(e.foes).toEqual(['t']);
    run(core, TIMING.playerKnockout + 0.1);
    expect(p.status).toBe('active');
    expect(p.vitals.health.current).toBeGreaterThanOrEqual(p.vitals.health.max * 0.25);
  });

  it('the player yielding is heard as a yield (lud-01 stops the bout on it)', () => {
    const env = fakeEnv();
    const core = makeCore(env);
    const p = addPlayer(core);
    const t = addNpc(core, 't', combatProfileFor('thug', { kit: 0 }), { ai: true });
    core.startBout({ lusio: true, foes: ['t'] });
    core.engage(t, p);
    core.playerYield();
    expect(env.of('actor:yielded')).toEqual([{ actorId: 'player', byId: 't' }]);
  });
});

describe('scripted openers (the mq-01 tutorial pair)', () => {
  it("'chain' takes the first turn with three light attacks in a row", () => {
    const core = makeCore();
    const p = addPlayer(core, { z: 0 });
    const a = addNpc(core, 'a', combatProfileFor('thug', { kit: 1 }), { ai: true, z: 1.2 });
    a.brain!.opener = 'chain';
    core.engage(a, p);
    const kinds: { kind: string; chain?: number }[] = [];
    let last: unknown = null;
    run(core, 5, () => {
      if (a.action && a.action !== last && a.action.kind === 'light') kinds.push({ kind: a.action.kind, chain: a.action.chain });
      last = a.action;
    });
    expect(kinds.slice(0, 3).map((k) => k.chain)).toEqual([1, 2, 3]);
  });

  it("'delayed-power' waits 3 s, then opens with a power attack wound up for a full second", () => {
    const core = makeCore();
    const p = addPlayer(core, { z: 0 });
    const b = addNpc(core, 'b', combatProfileFor('thug', { kit: 0 }), { ai: true, z: 1.3 });
    b.brain!.opener = 'delayed-power';
    core.engage(b, p);
    let first: { at: number; kind: string; windup: number } | null = null;
    run(core, 6, () => {
      const a = b.action;
      if (!first && a && a.phases) first = { at: core.now, kind: a.kind, windup: a.phases.windup };
    });
    expect(first).not.toBeNull();
    expect(first!.at).toBeGreaterThanOrEqual(3);
    expect(first!.kind).toBe('power');
    expect(first!.windup).toBeGreaterThanOrEqual(1);
  });
});

describe('lootable bodies (§6.14)', () => {
  it('a body holds its weapon, some of its clothes and its tier roll, never practice arms', () => {
    const c = bodyContents({ loot: 'thug', worn: ['tunica', 'cucullus'], weapon: 'pugio' }, items, new Rng(7));
    expect(c.items.some((i) => i.id === 'pugio')).toBe(true);
    expect(c.denarii).toBeGreaterThanOrEqual(0);
    for (const i of c.items) expect(items.has(i.id)).toBe(true);
    const lusio = bodyContents({ worn: [], weapon: 'rudis', shield: 'scutum' }, items, new Rng(1));
    expect(lusio.items.map((i) => i.id)).toEqual(['scutum']);
  });
});

describe('night muggers (§13.3)', () => {
  it('night is the band from 19:30 to first light (06:10, §17.2)', () => {
    expect([isNight(4.5), isNight(5.6), isNight(6.1), isNight(6.2), isNight(12), isNight(19.6), isNight(23)]).toEqual([true, true, true, false, false, true, true]);
  });

  it('every site lies on its street, in game metres', () => {
    for (const s of DANGER_SITES) {
      const road = ROADS.find((r) => r.id === s.road)!;
      expect(road, s.road).toBeTruthy();
      const p = roadPoint(road.points, s.t);
      const xs = road.points.map(([x]) => x * 0.6);
      expect(p.x).toBeGreaterThanOrEqual(Math.min(...xs) - 1e-6);
      expect(p.x).toBeLessThanOrEqual(Math.max(...xs) + 1e-6);
      expect(Math.hypot(p.dx, p.dz)).toBeCloseTo(1, 5);
    }
    const ends = roadPoint([[0, 0], [100, 0]], 1);
    expect([ends.x, ends.z]).toEqual([60, 0]);
  });

  it('they ask a quarter of the purse, at least 3, never more than you have', () => {
    expect([muggerPrice(0), muggerPrice(2), muggerPrice(8), muggerPrice(60)]).toEqual([0, 2, 3, 15]);
  });

  it('a site comes alive only at night, ahead of you, out of sight, at a distance, once a night, when nothing else is going on', () => {
    const base = { night: true, dist: 100, ahead: 0.9, facing: 0.9, usedTonight: false, busy: false };
    expect(siteReady(base)).toBe(true); // far off in the dark, on your way
    expect(siteReady({ ...base, night: false })).toBe(false);
    expect(siteReady({ ...base, usedTonight: true })).toBe(false);
    expect(siteReady({ ...base, cooling: true })).toBe(false);
    expect(siteReady({ ...base, busy: true })).toBe(false);
    expect(siteReady({ ...base, dist: 30 })).toBe(false);
    expect(siteReady({ ...base, dist: 200 })).toBe(false);
    expect(siteReady({ ...base, dist: 60, facing: 0.95 })).toBe(false); // right in front of you
    expect(siteReady({ ...base, dist: 60, ahead: 0.7, facing: 0.5 })).toBe(true); // ahead, off to the side of the view
    expect(siteReady({ ...base, ahead: -0.6, facing: -0.6 })).toBe(false); // behind you: you would never meet them
    expect(siteReady({ ...base, ahead: 0.2 })).toBe(false); // off your way
  });
});

describe('shield fighters under a rain of blows (AC-07 [design])', () => {
  it('a miles pressed by light-attack spam answers with shield bashes and blocks most of it', () => {
    const env = fakeEnv(mulberry(5));
    const core = makeCore(env);
    const p = addPlayer(core, { z: 0, heading: 0 });
    const m = addNpc(core, 'm', archetypeProfile('miles-urbanus', items), { ai: true, z: 1.3, rng: mulberry(9) });
    core.engage(m, p);
    const kinds = new Set<string>();
    let last: unknown = null;
    let blocked = 0;
    let landed = 0;
    run(core, 40, () => {
      p.body.heading = Math.atan2(m.position.x - p.position.x, m.position.z - p.position.z);
      p.vitals.set('health', p.vitals.health.max);
      p.vitals.set('stamina', p.vitals.stamina.max);
      m.vitals.set('health', m.vitals.health.max);
      if (core.free(p)) core.startAttack(p, 'light');
      if (m.action && m.action !== last) kinds.add(m.action.kind);
      last = m.action;
    });
    for (const e of env.of('combat:hit') as { attackerId: string; blocked: boolean; parried: boolean; kind: string }[]) {
      if (e.attackerId !== 'player') continue;
      if (e.blocked || e.parried) blocked++;
      else landed++;
    }
    expect(kinds.has('bash')).toBe(true);
    expect(blocked / (blocked + landed)).toBeGreaterThanOrEqual(0.4);
  });
});

describe('settings', () => {
  it("follow the game flow's difficulty, power hold and lock-on over the older combat keys", () => {
    const s = combatSettings({ ...DEFAULT_SETTINGS, difficulty: 'difficilis', combatDifficulty: 'tiro', powerHoldS: 0.5, lockOnMode: 'auto' } as never);
    expect([s.difficulty, s.powerHold, s.lockOn, s.streetDanger]).toEqual(['difficilis', 0.5, 'auto', true]);
    expect(combatSettings({ ...DEFAULT_SETTINGS, combatDifficulty: 'tiro', combatStreetDanger: false } as never)).toMatchObject({ difficulty: 'tiro', streetDanger: false });
  });

  it('standing up after a load keeps the pools the save restored', () => {
    const core = makeCore();
    const p = addPlayer(core);
    core.knockout(p, null);
    p.vitals.set('stamina', 12);
    p.vitals.set('health', 40);
    core.standUp(p);
    expect([p.status, p.vitals.health.current, p.vitals.stamina.current]).toEqual(['active', 40, 12]);
  });
});

/** A small seeded random source for the long duels. */
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
