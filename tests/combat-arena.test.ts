/**
 * The arena (§6.10) and Nereus (§13.2, AC-08): crowd favor, missio, the lusio, the net and the
 * struggle, a shield raised while netted, and his yield at 15 %.
 */
import { describe, expect, it } from 'vitest';
import { ArenaBout } from '../src/combat/ArenaBout';
import { nereusProfile } from '../src/combat/archetypes';
import { NereusScript } from '../src/ai/combat/nereus';
import type { Action } from '../src/combat/Combatant';
import { TIMING } from '../src/combat/timing';
import { combatProfileFor } from '../src/rpg/enemies';
import { addNpc, addPlayer, deaths, fakeEnv, makeCore, run } from './combat-fakes';

describe('crowd favor (§6.10)', () => {
  it('starts at 30 (+10 with plebs Fama > 30) and moves by the table', () => {
    expect(new ArenaBout({ lusio: true, foes: [] }).favor).toBe(30);
    const b = new ArenaBout({ lusio: true, foes: ['x'], plebsFama: 40 });
    expect(b.favor).toBe(40);
    b.event('parry');
    b.event('riposte');
    b.event('power-hit');
    b.event('dodge-unblockable');
    expect(b.favor).toBe(40 + 6 + 8 + 3 + 4);
    b.event('strike-yielded');
    expect(b.favor).toBe(41);
  });

  it('retreating more than 3 s drains 2 a second; 6 s without an attack costs 5', () => {
    const b = new ArenaBout({ lusio: true, foes: [] });
    for (let i = 0; i < 300; i++) b.tick(1 / 60, true); // 5 s retreating
    expect(b.favor).toBeCloseTo(30 - 2 * 2 - 0, 0);
    const c = new ArenaBout({ lusio: true, foes: [] });
    for (let i = 0; i < 6 * 60 + 1; i++) c.tick(1 / 60, false);
    expect(c.favor).toBe(25);
    c.attacked();
    for (let i = 0; i < 5 * 60; i++) c.tick(1 / 60, false);
    expect(c.favor).toBe(25);
  });

  it('salute once at ≥ 50; gifts at 100 reset favor to 60', () => {
    const b = new ArenaBout({ lusio: false, foes: [] });
    expect(b.salute()).toBe(false);
    b.favor = 55;
    expect(b.salute()).toBe(true);
    expect(b.favor).toBe(60);
    expect(b.salute()).toBe(false);
    b.favor = 100;
    const g = b.takeGifts(() => 0.1)!;
    expect(g.denarii).toBeGreaterThanOrEqual(5);
    expect(g.wineStamina).toBe(40);
    expect(g.weapon).toBe(true);
    expect(b.favor).toBe(60);
  });

  it('missio both ways: spared at ≥ 50; below 30 one in ten; a refused lusio sends you to the Saniarium', () => {
    const high = new ArenaBout({ lusio: false, foes: [] });
    high.favor = 50;
    expect(high.playerYields(() => 0.99)).toEqual({ spared: true, outcome: 'saniarium' });
    const low = new ArenaBout({ lusio: false, foes: [] });
    low.favor = 20;
    expect(low.playerYields(() => 0.5)).toEqual({ spared: false, outcome: 'death' });
    const lusio = new ArenaBout({ lusio: true, foes: [] });
    lusio.favor = 20;
    expect(lusio.playerYields(() => 0.5)).toEqual({ spared: false, outcome: 'saniarium-no-purse' });
    const tiro = new ArenaBout({ lusio: false, foes: [], tiro: true });
    tiro.favor = 0;
    expect(tiro.playerYields(() => 0.99).spared).toBe(true);
  });

  it('a yielded foe: going with the chant +15 (and +10 for sparing rightly), against it −15', () => {
    const b = new ArenaBout({ lusio: true, foes: ['f'] });
    expect(b.foeYielded({ foeFoughtWell: false })).toBe('mitte'); // a lusio always asks mercy
    b.decide(true);
    expect(b.favor).toBe(30 + 15 + 10);
    const c = new ArenaBout({ lusio: false, foes: ['f'] });
    c.favor = 50;
    expect(c.foeYielded({ foeFoughtWell: false })).toBe('iugula');
    c.decide(true);
    expect(c.favor).toBe(35);
  });
});

describe('the bout through the core', () => {
  it('parry, riposte and power hits raise favor; striking the yielded foe costs 20', () => {
    const env = fakeEnv();
    const core = makeCore(env);
    const p = addPlayer(core, { shield: 'scutum', weapon: 'rudis' });
    const f = addNpc(core, 'f', { ...combatProfileFor('thug', { kit: 0 }), health: 400, poise: 1000 }, { z: 1.3 });
    const bout = core.startBout({ lusio: true, foes: ['f'] });
    core.engage(f, p);
    core.startAttack(f, 'light');
    run(core, 0.25);
    core.pressParry(p);
    run(core, 0.15);
    expect(bout.favor).toBe(36);
    core.applyHit(p, f, { kind: 'light', start: 0, end: 1, resolved: true, chain: 1 }); // riposte
    expect(bout.favor).toBe(44);
    core.applyHit(p, f, { kind: 'power', start: 0, end: 1, resolved: true, charge: 0.6, direction: 'none' });
    expect(bout.favor).toBe(47);
  });

  it('a lusio foe at 0 is knocked out and the player wins the bout', () => {
    const env = fakeEnv();
    const core = makeCore(env);
    const p = addPlayer(core, { weapon: 'rudis' });
    const f = addNpc(core, 'f', { ...combatProfileFor('thug', { kit: 0 }), health: 10, yieldAt: 0, fleeAt: 0 });
    const bout = core.startBout({ lusio: true, foes: ['f'] });
    core.engage(f, p);
    for (let i = 0; i < 3 && f.status === 'active'; i++) core.applyHit(p, f, { kind: 'light', start: 0, end: 1, resolved: true, chain: 1 });
    expect(f.status).toBe('ko');
    expect(bout.winner).toBe('player');
    expect(deaths(env)).toHaveLength(0);
  });
});

describe('the end of a bout is announced once (the purse is paid once)', () => {
  it('a yielded lusio foe struck down: one end event, the player wins', () => {
    const env = fakeEnv();
    const core = makeCore(env);
    const p = addPlayer(core, { weapon: 'rudis' });
    const f = addNpc(core, 'f', { ...combatProfileFor('thug', { kit: 0 }), health: 40 });
    core.startBout({ lusio: true, foes: ['f'], purse: 10 });
    core.engage(f, p);
    for (let i = 0; i < 5 && f.status === 'active'; i++) core.applyHit(p, f, { kind: 'light', start: 0, end: 1, resolved: true, chain: 1 });
    expect(f.status).toBe('yielded');
    core.applyHit(p, f, { kind: 'power', start: 0, end: 1, resolved: true, charge: 0.8, direction: 'none' });
    expect(f.status).toBe('ko');
    const ends = (env.of('combat:bout') as { phase: string; winner?: string }[]).filter((e) => e.phase === 'end');
    expect(ends).toHaveLength(1);
    expect(ends[0].winner).toBe('player');
    expect(env.of('combat:yieldChoice')).toEqual([{ actorId: 'f', choice: 'kill' }]);
  });

  it('missio granted: one end event with the purse', () => {
    const env = fakeEnv();
    const core = makeCore(env);
    const p = addPlayer(core, { weapon: 'rudis' });
    const f = addNpc(core, 'f', { ...combatProfileFor('thug', { kit: 0 }), health: 40 });
    core.startBout({ lusio: true, foes: ['f'], purse: 10 });
    core.engage(f, p);
    for (let i = 0; i < 5 && f.status === 'active'; i++) core.applyHit(p, f, { kind: 'light', start: 0, end: 1, resolved: true, chain: 1 });
    core.decideYielded(f, 'spare');
    const ends = (env.of('combat:bout') as { phase: string; purse?: number }[]).filter((e) => e.phase === 'end');
    expect(ends).toHaveLength(1);
    expect(ends[0].purse).toBeGreaterThan(10);
    expect(f.status).toBe('active');
    expect(core.hostile(p, f)).toBe(false);
    // lud-01's missio objective hears the decision made in combat's prompt.
    expect(env.of('content:missio')).toEqual([{ spared: true }]);
  });

  it("a yielded foe struck down with the sword is the missio refused (content:missio, spared false)", () => {
    const env = fakeEnv();
    const core = makeCore(env);
    const p = addPlayer(core, { weapon: 'rudis' });
    const f = addNpc(core, 'f', { ...combatProfileFor('thug', { kit: 0 }), health: 40 });
    core.startBout({ lusio: true, foes: ['f'], purse: 10 });
    core.engage(f, p);
    for (let i = 0; i < 5 && f.status === 'active'; i++) core.applyHit(p, f, { kind: 'light', start: 0, end: 1, resolved: true, chain: 1 });
    expect(f.status).toBe('yielded');
    for (let i = 0; i < 6 && f.status === 'yielded'; i++) core.applyHit(p, f, { kind: 'power', start: 0, end: 1, resolved: true, charge: 0.8, direction: 'none' });
    expect(env.of('content:missio')).toEqual([{ spared: false }]);
  });
});

describe('Nereus (§13.2, AC-08)', () => {
  function setup() {
    const env = fakeEnv();
    const core = makeCore(env);
    const p = addPlayer(core, { shield: 'scutum', weapon: 'rudis', health: 5000 });
    const n = addNpc(core, 'nereus', nereusProfile(), { z: 4.5, ai: true });
    const s = new NereusScript();
    s.onNetLost = () => (n.hasNet = false);
    n.script = s;
    n.brain!.script = s;
    n.hasNet = true;
    core.startBout({ lusio: true, foes: ['nereus'] });
    core.engage(n, p);
    return { env, core, p, n, s };
  }

  it('the net (unblockable, 0.8 s twirl) entangles for 3 s; each struggle press takes 0.4 s off', () => {
    const { env, core, p } = setup();
    p.guardWanted = true; // a raised shield does not stop a net
    let caught = -1;
    for (let i = 0; i < 60 * 12 && caught < 0; i++) {
      core.fixedStep(1 / 60);
      if (p.entangled(core.now)) caught = core.now;
    }
    expect(caught).toBeGreaterThan(0);
    expect(env.cues).toContain('unblockable');
    expect(p.entangledUntil - caught).toBeCloseTo(TIMING.net.entangle, 1);
    expect(core.startAttack(p, 'light')).toBe(false);
    expect(core.dodge(p, 1, 0)).toBe(false);
    core.struggle(p);
    core.struggle(p);
    expect(p.entangledUntil - caught).toBeCloseTo(TIMING.net.entangle - 0.8, 1);
  });

  it('while netted the shield still blocks, but no parry', () => {
    const { env, core, p, n } = setup();
    core.entangle(p, 3, n);
    p.guardWanted = true;
    run(core, 0.2);
    expect(p.guardActive).toBe(true);
    core.pressParry(p);
    const poke: Action = { kind: 'light', start: core.now, end: core.now + 1, resolved: true, chain: 1 };
    core.applyHit(n, p, poke);
    expect(env.of('combat:parry')).toHaveLength(0);
    const hit = env.of('combat:hit').at(-1) as { blocked: boolean };
    expect(hit.blocked).toBe(true);
  });

  it('a dodge through the net earns +4 favor and leaves you free', () => {
    const { core, p, n } = setup();
    const bout = core.bout!;
    // Cast now from 4.5 m; dodge just before it arrives (~0.25 s of flight after the 0.8 s twirl).
    core.startAttack(n, 'net');
    run(core, 0.8 + 0.2);
    core.dodge(p, 1, 0);
    run(core, 0.5);
    expect(p.entangled(core.now)).toBe(false);
    expect(bout.favor).toBeGreaterThanOrEqual(34);
  });

  it('phases at 75 % and 45 % and a yield at 15 % (never skipped by a big blow)', () => {
    const { env, core, p, n, s } = setup();
    const power: Action = { kind: 'power', start: 0, end: 1, resolved: true, charge: 0.8, direction: 'none' };
    for (let i = 0; i < 200 && n.status === 'active'; i++) {
      core.applyHit(p, n, power);
      run(core, 0.25);
    }
    expect(n.status).toBe('yielded');
    expect(n.healthFrac()).toBeCloseTo(0.15, 3);
    const phases = (env.of('combat:phase') as { phase: number }[]).map((e) => e.phase);
    expect(phases).toEqual([2, 3]);
    expect(s.hasNet).toBe(false);
    expect(core.bout!.chant).toBe('mitte');
  });
});
