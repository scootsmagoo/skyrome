/**
 * Combat core (src/combat/CombatCore.ts): the §6.2 damage examples through real swings, stamina
 * economy, parries and ripostes, dodges, poise anti-loop rules, knockouts, yields and the
 * inCombat predicate. Bodies are points (tests/combat-fakes.ts); no scene, physics or avatars.
 */
import { describe, expect, it } from 'vitest';
import type { Action } from '../src/combat/Combatant';
import { TIMING } from '../src/combat/timing';
import { combatProfileFor, archetypeProfile } from '../src/rpg/enemies';
import { addNpc, addPlayer, deaths, fakeEnv, items, makeCore, run } from './combat-fakes';

const light = (chain = 1): Action => ({ kind: 'light', start: 0, end: 1, resolved: true, chain });
const near = (x: number, y: number, d = 0.05) => Math.abs(x - y) <= d;

describe('§6.2 damage through the core', () => {
  it('an iron gladius at Blades 25 thrusts for 14.6 into a thug in a tunic: 4 thrusts kill', () => {
    const core = makeCore();
    const p = addPlayer(core, { skill: 25 });
    const thug = addNpc(core, 'thug', combatProfileFor('thug', { kit: 0 }));
    core.engage(thug, p); // aware: no sneak bonus
    const before = thug.vitals.health.current;
    core.applyHit(p, thug, light(1));
    expect(before - thug.vitals.health.current).toBeCloseTo(14.625, 3);
    expect(Math.ceil(45 / 14.625)).toBe(4);
  });

  it('the third hit of the chain is ×1.25 (a thrust again)', () => {
    const core = makeCore();
    const p = addPlayer(core);
    const thug = addNpc(core, 'thug', { ...combatProfileFor('thug', { kit: 0 }), health: 500, yieldAt: 0 });
    core.engage(thug, p);
    core.applyHit(p, thug, light(3));
    expect(500 - thug.vitals.health.current).toBeCloseTo(14.625 * 1.25, 3);
  });

  it('an urban soldier (segmentata, AR 50): 10 thrusts, and 9 clava blows at Brawling 25', () => {
    const core = makeCore();
    const p = addPlayer(core);
    const miles = addNpc(core, 'miles', { ...combatProfileFor('miles', { kit: 0 }), health: 1000, yieldAt: 0, fleeAt: 0 });
    core.engage(miles, p);
    core.applyHit(p, miles, light(1));
    const thrust = 1000 - miles.vitals.health.current;
    expect(thrust).toBeCloseTo(14.625 * 0.75 * (1 - 50 / 170), 3);
    expect(Math.ceil(70 / thrust)).toBe(10);
    const club = addPlayer(makeCore(), { weapon: 'clava' });
    const core2 = makeCore();
    core2.add(club);
    const m2 = addNpc(core2, 'miles', { ...combatProfileFor('miles', { kit: 0 }), health: 1000, yieldAt: 0, fleeAt: 0 });
    core2.engage(m2, club);
    core2.applyHit(club, m2, light(1));
    const blow = 1000 - m2.vitals.health.current;
    expect(Math.ceil(70 / blow)).toBe(9);
  });

  it('a sicarius (sica, skill 50, tier 1.15) on Normal: 23.7 a hit, 5 to drop a player in a tunic, 10 in mail and helmet', () => {
    const core = makeCore();
    const p = addPlayer(core, { health: 1000 });
    const sic = addNpc(core, 'sicarius', combatProfileFor('veteran', { kit: 'sica' }));
    core.applyHit(sic, p, light(1));
    const hit = 1000 - p.vitals.health.current;
    expect(hit).toBeCloseTo(23.72, 1);
    expect(Math.ceil(100 / hit)).toBe(5);
    p.armor = 42;
    p.family = 'mail';
    const before = p.vitals.health.current;
    core.applyHit(sic, p, light(1));
    expect(Math.ceil(100 / (before - p.vitals.health.current))).toBe(10);
  });

  it('difficulty multiplies only blows on the player (taken) and by the player (dealt)', () => {
    const core = makeCore();
    core.difficulty = 'tiro';
    const p = addPlayer(core, { health: 1000 });
    const thug = addNpc(core, 'thug', { ...combatProfileFor('thug', { kit: 0 }), health: 1000, yieldAt: 0, fleeAt: 0 });
    core.engage(thug, p);
    core.applyHit(p, thug, light(1));
    expect(1000 - thug.vitals.health.current).toBeCloseTo(14.625 * 1.5, 3);
    core.applyHit(thug, p, light(1));
    const npcHit = 10 * (1 + 15 / 200) * 0.9; // fustis, skill 15, dmgMult 0.9
    expect(1000 - p.vitals.health.current).toBeCloseTo(npcHit * 0.5, 3);
  });

  it('an unaware enemy takes ×3 (sneak attack, §6.7)', () => {
    const core = makeCore();
    const p = addPlayer(core);
    const thug = addNpc(core, 'thug', { ...combatProfileFor('thug', { kit: 0 }), health: 500, yieldAt: 0 });
    core.setHostile('hostile', 'player'); // an enemy who hasn't noticed you
    core.applyHit(p, thug, light(1));
    expect(500 - thug.vitals.health.current).toBeCloseTo(14.625 * 3, 3);
  });

  it('a bystander struck by the player gets no sneak bonus (unless the player sneaks) and gives no XP', () => {
    const env = fakeEnv();
    const core = makeCore(env);
    const p = addPlayer(core);
    const xp: number[] = [];
    (p as unknown as { sheet: { useSkill: (s: string, n: number) => void } }).sheet = { useSkill: (_s, n) => void xp.push(n) };
    const civ = addNpc(core, 'baker', { ...combatProfileFor('civilian', { kit: 0 }), health: 500, yieldAt: 0, fleeAt: 0 }, { team: 'npc:baker' });
    core.applyHit(p, civ, light(1));
    expect(500 - civ.vitals.health.current).toBeLessThan(14.625 * 1.5);
    expect(xp).toEqual([]);
    expect(env.of('combat:assault').length).toBe(1);
    // Sneaking up on purpose is a sneak attack.
    const civ2 = addNpc(core, 'cobbler', { ...combatProfileFor('civilian', { kit: 0 }), health: 500, yieldAt: 0, fleeAt: 0 }, { team: 'npc:cobbler' });
    p.sneaking = true;
    core.applyHit(p, civ2, light(1));
    expect(500 - civ2.vitals.health.current).toBeGreaterThan(14.625 * 2);
  });
});

describe('real swings: timeline, reach, hit frame', () => {
  it('a light attack resolves at its wind-up (0.25 s ÷ speed) on a target in reach, not on one out of reach', () => {
    const core = makeCore();
    const p = addPlayer(core);
    const near1 = addNpc(core, 'a', { ...combatProfileFor('thug', { kit: 0 }), health: 500, yieldAt: 0 }, { z: 1.4 });
    const far = addNpc(core, 'b', { ...combatProfileFor('thug', { kit: 0 }), health: 500, yieldAt: 0 }, { x: 3, z: 3 });
    core.engage(near1, p);
    expect(core.startAttack(p, 'light')).toBe(true);
    run(core, 0.2);
    expect(near1.vitals.health.current).toBe(500);
    run(core, 0.1);
    expect(near1.vitals.health.current).toBeLessThan(500);
    expect(far.vitals.health.current).toBe(500);
  });

  it('a swing behind the attacker misses (hits come from the weapon, not the camera)', () => {
    const core = makeCore();
    const p = addPlayer(core, { heading: Math.PI }); // facing −z
    const t = addNpc(core, 't', { ...combatProfileFor('thug', { kit: 0 }), health: 500, yieldAt: 0 }, { z: 1.4 });
    core.engage(t, p);
    core.startAttack(p, 'light');
    run(core, 0.5);
    expect(t.vitals.health.current).toBe(500);
  });

  it('NPC wind-ups are stretched to the 0.35 s telegraph', () => {
    const core = makeCore();
    const p = addPlayer(core, { health: 500 });
    const t = addNpc(core, 't', combatProfileFor('thug', { kit: 0 }), { z: 1.3 });
    core.engage(t, p);
    core.startAttack(t, 'light');
    expect(t.action!.hitAt! - t.action!.start).toBeCloseTo(TIMING.npcMinWindup.light, 5);
    run(core, 0.3);
    expect(p.vitals.health.current).toBe(500);
    run(core, 0.1);
    expect(p.vitals.health.current).toBeLessThan(500);
  });

  it('the light chain advances 1 → 2 → 3 → 1 when attacks follow within the gap', () => {
    const core = makeCore();
    const p = addPlayer(core);
    const chains: number[] = [];
    for (let i = 0; i < 4; i++) {
      core.startAttack(p, 'light');
      chains.push(p.action!.chain!);
      run(core, 0.7);
    }
    expect(chains).toEqual([1, 2, 3, 1]);
  });
});

describe("the player's blows land on anyone (§14.1 assault); NPCs strike only their enemies", () => {
  const civilian = () => ({ ...combatProfileFor('civilian', { kit: 0 }), health: 500, yieldAt: 0, fleeAt: 0 });

  it('an ordinary blow lands on a passer-by, and it is an assault', () => {
    const env = fakeEnv();
    const core = makeCore(env);
    const p = addPlayer(core);
    const civ = addNpc(core, 'baker', civilian(), { z: 1.2, team: 'npc:baker' });
    core.startAttack(p, 'light');
    run(core, 0.8);
    expect(civ.vitals.health.current).toBeLessThan(500);
    expect(env.of('combat:assault').length).toBe(1);
    expect(p.aggressor).toBe(true);
  });

  it('with an enemy in the swing, the enemy is struck, not the passer-by beside him', () => {
    const core = makeCore();
    const p = addPlayer(core);
    const civ = addNpc(core, 'baker', civilian(), { x: 0.35, z: 1.2, team: 'npc:baker' });
    const thug = addNpc(core, 'thug', { ...combatProfileFor('thug', { kit: 0 }), health: 500, yieldAt: 0 }, { x: -0.35, z: 1.2 });
    core.engage(thug, p);
    core.startAttack(p, 'light');
    run(core, 0.8);
    expect(thug.vitals.health.current).toBeLessThan(500);
    expect(civ.vitals.health.current).toBe(500);
  });

  it('named and essential people can be struck; an essential one is knocked out, never killed', () => {
    const core = makeCore();
    const p = addPlayer(core);
    const courier = addNpc(core, 'npc-festus', { ...civilian(), health: 4 }, { z: 1.0, team: 'npc:festus' });
    courier.named = true;
    courier.essential = true;
    core.startAttack(p, 'light');
    run(core, 0.8);
    expect(courier.vitals.health.current).toBeLessThan(4);
    expect(courier.status).not.toBe('dead');
  });

  it("an NPC's blow never lands on someone who isn't its enemy", () => {
    const core = makeCore();
    const p = addPlayer(core);
    // The thug faces the player (+z) with a passer-by right in front of him.
    const thug = addNpc(core, 'thug', { ...combatProfileFor('thug', { kit: 0 }), health: 500, yieldAt: 0 }, { z: -3, heading: 0 });
    const civ = addNpc(core, 'baker', civilian(), { z: -2, team: 'npc:baker' });
    core.engage(thug, p);
    core.startAttack(thug, 'light');
    run(core, 1.2);
    expect(civ.vitals.health.current).toBe(500);
  });
});

describe('stamina economy (§6.1, §6.4, §6.6)', () => {
  it('light 5 + 2 × kg (gladius 7.4), power 3 × light (min 20), bash 18', () => {
    const core = makeCore();
    const p = addPlayer(core);
    core.startAttack(p, 'light');
    expect(100 - p.vitals.stamina.current).toBeCloseTo(7.4, 5);
    run(core, 0.8);
    p.vitals.set('stamina', 100);
    core.beginCharge(p);
    run(core, 0.5);
    core.releaseCharge(p);
    expect(100 - p.vitals.stamina.current).toBeCloseTo(22.2, 5);
    run(core, 1);
    p.vitals.set('stamina', 100);
    core.startAttack(p, 'bash');
    expect(100 - p.vitals.stamina.current).toBeCloseTo(18, 5);
  });

  it('dodges cost 15, and the third within 1 s costs double', () => {
    const core = makeCore();
    const p = addPlayer(core);
    const costs: number[] = [];
    for (let i = 0; i < 3; i++) {
      const before = p.vitals.stamina.current;
      expect(core.dodge(p, 1, 0)).toBe(true);
      costs.push(before - p.vitals.stamina.current);
      run(core, 0.32);
    }
    expect(costs.map((c) => Math.round(c))).toEqual([15, 15, 30]);
  });

  it('at 0 stamina you cannot attack or dodge until 15 has regenerated', () => {
    const env = fakeEnv();
    const core = makeCore(env);
    const p = addPlayer(core);
    p.vitals.drain('stamina', 100);
    run(core, 1 / 60);
    expect(core.startAttack(p, 'light')).toBe(false);
    expect(core.dodge(p, 1, 0)).toBe(false);
    expect(env.cues).toContain('stamina');
    run(core, 0.8 + 0.5); // delay, then 20/s → 10
    expect(core.startAttack(p, 'light')).toBe(false);
    run(core, 0.4); // → 18
    expect(core.startAttack(p, 'light')).toBe(true);
  });

  it('absorbing a blow costs max(4, 0.6 × raw × (1 − Shield/200)); at 0 the guard breaks (1.2 s)', () => {
    const core = makeCore();
    const p = addPlayer(core, { shield: 'scutum', skill: 25 });
    const thug = addNpc(core, 'thug', combatProfileFor('thug', { kit: 0 }));
    core.engage(thug, p);
    p.guardWanted = true;
    run(core, 0.2);
    expect(p.guardActive).toBe(true);
    const before = p.vitals.stamina.current;
    core.applyHit(thug, p, light(1));
    const raw = 10 * (1 + 15 / 200) * 0.9 * 1.5; // fustis × taken
    expect(before - p.vitals.stamina.current).toBeCloseTo(Math.max(4, 0.6 * raw * (1 - 25 / 200)), 3);
    p.vitals.set('stamina', 2);
    core.applyHit(thug, p, light(1));
    expect(p.stun?.kind).toBe('guardBreak');
    expect(p.stun!.until - core.now).toBeCloseTo(TIMING.guardBreak, 5);
  });
});

describe('parry and riposte (§6.4, §4.2 window)', () => {
  function setup(difficulty: 'normalis' | 'tiro' = 'normalis') {
    const env = fakeEnv();
    const core = makeCore(env);
    core.difficulty = difficulty;
    const p = addPlayer(core, { shield: 'scutum' });
    const thug = addNpc(core, 'thug', { ...combatProfileFor('thug', { kit: 0 }), health: 500, yieldAt: 0, fleeAt: 0 }, { z: 1.3 });
    core.engage(thug, p);
    return { env, core, p, thug };
  }

  it('a press 0.19 s before impact parries on Normal (0.20 s): no damage, attacker staggers 1 s, riposte window', () => {
    const { env, core, p, thug } = setup();
    core.startAttack(thug, 'light'); // hits at +0.35
    run(core, 0.35 - 0.19);
    core.pressParry(p);
    run(core, 0.25);
    expect(p.vitals.health.current).toBe(100);
    expect(env.of('combat:parry')).toHaveLength(1);
    expect(thug.stun?.kind).toBe('stagger');
    expect(thug.riposteUntil).toBeGreaterThan(core.now);
    // The riposte: ×2 and a guaranteed stagger that opens no new window.
    const hp = thug.vitals.health.current;
    core.applyHit(p, thug, light(1));
    expect(hp - thug.vitals.health.current).toBeCloseTo(14.625 * 2, 3);
    expect(thug.riposteUntil).toBe(-Infinity);
  });

  it('a press 0.22 s before impact is too early on Normal but parries on Tiro (0.40 s)', () => {
    const a = setup();
    a.core.startAttack(a.thug, 'light');
    run(a.core, 0.35 - 0.22);
    a.core.pressParry(a.p);
    run(a.core, 0.3);
    expect(a.env.of('combat:parry')).toHaveLength(0);
    const b = setup('tiro');
    b.core.startAttack(b.thug, 'light');
    run(b.core, 0.35 - 0.22);
    b.core.pressParry(b.p);
    run(b.core, 0.3);
    expect(b.env.of('combat:parry')).toHaveLength(1);
  });

  it('a weapon-only parry of a power attack counts as a normal block', () => {
    const { env, core, p, thug } = setup();
    p.shield = undefined;
    core.startAttack(thug, 'power'); // 0.7 s wind-up
    run(core, 0.6);
    core.pressParry(p);
    run(core, 0.2);
    expect(env.of('combat:parry')).toHaveLength(0);
    const hit = env.of('combat:hit')[0] as { blocked: boolean };
    expect(hit.blocked).toBe(true);
  });

  it('unblockable attacks (the net, the sand) cannot be parried', () => {
    const { env, core, p, thug } = setup();
    const a: Action = { kind: 'sandKick', start: 0, end: 1, resolved: true, unblockable: true };
    core.pressParry(p);
    core.applyHit(thug, p, a);
    expect(env.of('combat:parry')).toHaveLength(0);
  });
});

describe('dodge i-frames (§6.1)', () => {
  it('a blow inside the first 0.12 s of a dodge misses; after them it lands', () => {
    const core = makeCore();
    const p = addPlayer(core, { health: 500 });
    const thug = addNpc(core, 'thug', combatProfileFor('thug', { kit: 0 }));
    core.engage(thug, p);
    core.dodge(p, 1, 0);
    run(core, 0.05);
    core.applyHit(thug, p, light(1));
    expect(p.vitals.health.current).toBe(500);
    run(core, 0.1);
    core.applyHit(thug, p, light(1));
    expect(p.vitals.health.current).toBeLessThan(500);
  });

  it('a dodge moves 2.5 m over 0.3 s (a backstep with no direction)', () => {
    const core = makeCore();
    const p = addPlayer(core, { heading: 0 });
    core.dodge(p, 0, 0);
    let z = 0;
    for (let i = 0; i < 30; i++) {
      const m = core.motionFor(p);
      if (m) z += m.z / 60;
      core.fixedStep(1 / 60);
    }
    expect(z).toBeCloseTo(-2.5, 1);
  });
});

describe('poise and stagger (§6.5)', () => {
  it('two attackers cannot flinch-lock the player: 0.4 s of flinch immunity', () => {
    const core = makeCore();
    const p = addPlayer(core, { health: 1000 });
    const a = addNpc(core, 'a', combatProfileFor('thug', { kit: 0 }));
    const b = addNpc(core, 'b', combatProfileFor('thug', { kit: 0 }), { x: 0.5 });
    core.startAttack(p, 'light');
    core.applyHit(a, p, light(1)); // fustis stagger 20 ≥ 35 % of 50: a flinch
    expect(p.action).toBeNull();
    run(core, 0.3);
    core.startAttack(p, 'light');
    run(core, 0.05);
    core.applyHit(b, p, light(1)); // within 0.4 s of the first flinch
    expect(p.action?.kind).toBe('light');
  });

  it('a flinch never interrupts a block or a recovery', () => {
    const core = makeCore();
    const p = addPlayer(core, { health: 1000 });
    const a = addNpc(core, 'a', combatProfileFor('thug', { kit: 0 }));
    core.startAttack(p, 'light');
    run(core, 0.45); // past the hit: recovery
    core.applyHit(a, p, light(1));
    expect(p.action?.kind).toBe('light');
  });

  it('at most 2 staggers on one target within 4 s; poise immunity for 1.5 s after each', () => {
    const core = makeCore();
    const p = addPlayer(core);
    const t = addNpc(core, 't', { ...combatProfileFor('thug', { kit: 0 }), health: 5000, yieldAt: 0, fleeAt: 0 });
    core.engage(t, p);
    const power: Action = { kind: 'power', start: 0, end: 1, resolved: true, charge: 0.8, direction: 'none' };
    let staggers = 0;
    let last = 'none';
    for (let i = 0; i < 12; i++) {
      core.applyHit(p, t, power);
      if (t.stun?.kind === 'stagger' && last !== `${t.stun.until}`) {
        staggers++;
        last = `${t.stun.until}`;
      }
      run(core, 0.3);
    }
    // 3.6 s of power blows: never more than two staggers.
    expect(staggers).toBeLessThanOrEqual(2);
    expect(staggers).toBeGreaterThanOrEqual(1);
  });
});

describe('knockouts, yields and flight (§6.9)', () => {
  it('fists knock a human out at 0 instead of killing', () => {
    const env = fakeEnv();
    const core = makeCore(env);
    const p = addPlayer(core, { weapon: 'caestus' });
    const t = addNpc(core, 't', { ...combatProfileFor('civilian', { kit: 0 }), yieldAt: 0, fleeAt: 0 });
    core.engage(t, p);
    for (let i = 0; i < 10 && t.status === 'active'; i++) core.applyHit(p, t, light(1));
    expect(t.status).toBe('ko');
    expect(deaths(env)).toHaveLength(0);
    expect(env.of('combat:knockout')).toHaveLength(1);
  });

  it('a fustis knocks out up to a miles but kills a veteran', () => {
    const core = makeCore();
    const p = addPlayer(core, { weapon: 'fustis' });
    const miles = addNpc(core, 'm', { ...combatProfileFor('miles', { kit: 0 }), yieldAt: 0, fleeAt: 0 });
    const vet = addNpc(core, 'v', { ...combatProfileFor('veteran', { kit: 0 }), yieldAt: 0, fleeAt: 0 }, { x: 5 });
    expect(core.nonLethal(p, miles)).toBe(true);
    expect(core.nonLethal(p, vet)).toBe(false);
  });

  it('practice arms (rudis) never kill: 0 health is a knockout', () => {
    const core = makeCore();
    const p = addPlayer(core, { weapon: 'rudis' });
    const vet = addNpc(core, 'v', { ...combatProfileFor('veteran', { kit: 0 }), yieldAt: 0, fleeAt: 0 });
    expect(core.nonLethal(p, vet)).toBe(true);
  });

  it('a thug yields at 25 %: the crossing blow stops at the threshold', () => {
    const env = fakeEnv();
    const core = makeCore(env);
    const p = addPlayer(core);
    const t = addNpc(core, 't', combatProfileFor('thug', { kit: 0 }));
    core.engage(t, p);
    for (let i = 0; i < 4 && t.status === 'active'; i++) core.applyHit(p, t, light(1));
    expect(t.status).toBe('yielded');
    expect(t.healthFrac()).toBeCloseTo(0.25, 5);
    expect(env.of('actor:yielded')).toHaveLength(1);
  });

  it("a yield caused by the very first blow says who caused it (the decision prompt needs it)", () => {
    const env = fakeEnv();
    const core = makeCore(env);
    const p = addPlayer(core);
    const civ = addNpc(core, 'baker', { ...combatProfileFor('civilian', { kit: 0 }), yieldAt: 0.5, fleeAt: 0 }, { team: 'npc:baker' });
    let lastHitByAtEvent: string | null = null;
    const emit = env.emit;
    env.emit = (type, payload) => {
      if (type === 'actor:yielded') lastHitByAtEvent = civ.lastHitBy;
      emit(type, payload);
    };
    core.applyHit(p, civ, { kind: 'power', start: 0, end: 1, resolved: true, charge: 0.8, direction: 'none' });
    expect(civ.status).toBe('yielded');
    expect(env.of('actor:yielded')).toEqual([{ actorId: 'baker', byId: 'player' }]);
    expect(lastHitByAtEvent).toBe('player');
    expect(civ.yieldedAt).toBe(core.now);
    // Nobody decides: he gets up and leaves the fight, with no choice event.
    core.releaseYielded(civ);
    expect([civ.status, civ.driven, core.hostile(p, civ)]).toEqual(['active', false, false]);
    expect(env.of('combat:yieldChoice')).toEqual([]);
  });

  it('a grassator runs instead of kneeling', () => {
    const core = makeCore();
    const p = addPlayer(core);
    const g = addNpc(core, 'g', archetypeProfile('grassator', items), { ai: true, brain: { prefersFlee: true } });
    core.engage(g, p);
    for (let i = 0; i < 3; i++) core.applyHit(p, g, light(1));
    expect(g.status).toBe('active');
    expect(g.brain!.state).toBe('flee');
  });

  it('a lusio knocks the player out: the bout is lost, the doctor stops it', () => {
    const env = fakeEnv();
    const core = makeCore(env);
    const p = addPlayer(core, { health: 20 });
    const t = addNpc(core, 't', combatProfileFor('veteran', { kit: 0 }));
    core.startBout({ lusio: true, foes: ['t'] });
    for (let i = 0; i < 5 && p.status === 'active'; i++) core.applyHit(t, p, light(1));
    expect(p.status).toBe('ko');
    expect(env.of('combat:playerDefeated')).toEqual([{ outcome: 'saniarium-no-purse', byId: 't', lusio: true, foes: [] }]);
    // Quests hear it as the player going down, not dying.
    expect(env.of('actor:killed')).toEqual([{ victimId: 'player', killerId: 't', tags: ['ko'] }]);
  });

  it('the player yields in a brawl: the fight stops and costs a tenth of the purse (no inventory here)', () => {
    const env = fakeEnv();
    const core = makeCore(env);
    const p = addPlayer(core);
    const d = addNpc(core, 'drunk', archetypeProfile('ebrius-rixator', items), { ai: true });
    d.brawl = true;
    core.engage(d, p);
    const r = core.playerYield();
    expect(r.context).toBe('brawl');
    expect(d.target).toBeNull();
  });
});

describe('brawls (§6.9, AC-09)', () => {
  it('a rixa ends in a yield or a knockout, never a death; losing it is a knockout', () => {
    const env = fakeEnv();
    const core = makeCore(env);
    const p = addPlayer(core, { weapon: 'caestus', health: 30 });
    p.weaponItem = undefined;
    p.weapon = { class: 'unarmed', skill: 'brawling', damage: 4, damageType: 'blunt', speed: 1.4, reach: 0.5, stagger: 8 };
    const d = addNpc(core, 'drunk', archetypeProfile('ebrius-rixator', items));
    p.brawl = d.brawl = true;
    core.engage(d, p);
    for (let i = 0; i < 30 && d.status === 'active'; i++) core.applyHit(p, d, light(1));
    expect(d.status).toBe('yielded');
    const d2 = addNpc(core, 'drunk2', archetypeProfile('ebrius-rixator', items), { x: 1 });
    d2.brawl = true;
    for (let i = 0; i < 40 && p.status === 'active'; i++) core.applyHit(d2, p, light(1));
    expect(p.status).toBe('ko');
    expect(deaths(env)).toHaveLength(0);
    expect((env.of('combat:playerDefeated')[0] as { outcome: string }).outcome).toBe('brawl-lost');
  });

  it('drawing a blade in a brawl makes it an assault', () => {
    const env = fakeEnv();
    const core = makeCore(env);
    const p = addPlayer(core);
    const d = addNpc(core, 'drunk', archetypeProfile('ebrius-rixator', items));
    p.brawl = d.brawl = true;
    p.drawn = false;
    core.setDrawn(p, true);
    expect(env.of('combat:brawlEscalated')).toEqual([{ by: 'player' }]);
    expect(d.brawl).toBe(false);
  });
});

describe('the inCombat predicate (§6)', () => {
  it('true while a hostile fights the player within 40 m, and for 8 s after', () => {
    const env = fakeEnv();
    const core = makeCore(env);
    const p = addPlayer(core);
    const t = addNpc(core, 't', combatProfileFor('thug', { kit: 0 }), { z: 10, ai: true });
    core.engage(t, p);
    run(core, 0.5);
    expect(core.playerInCombat).toBe(true);
    expect(env.of('combat:started')).toHaveLength(1);
    core.remove(t);
    run(core, 7.5);
    expect(core.playerInCombat).toBe(true);
    run(core, 1);
    expect(core.playerInCombat).toBe(false);
    expect(env.of('combat:ended')).toHaveLength(1);
  });
});

describe('hit-stop and shake feedback (§6.5)', () => {
  it('light, power and riposte blows involving the player ask for light / power / heavy feedback', () => {
    const env = fakeEnv();
    const core = makeCore(env);
    const p = addPlayer(core);
    const t = addNpc(core, 't', { ...combatProfileFor('thug', { kit: 0 }), health: 1000, yieldAt: 0, fleeAt: 0, poise: 1000 });
    core.engage(t, p);
    core.applyHit(p, t, light(1));
    core.applyHit(p, t, { kind: 'power', start: 0, end: 1, resolved: true, charge: 0.8, direction: 'none' });
    t.riposteUntil = core.now + 1;
    core.applyHit(p, t, light(1));
    expect(env.feedbacks).toEqual(['light', 'power', 'heavy']);
    expect(near(TIMING.hitStop.heavy, 0.12)).toBe(true);
  });
});
