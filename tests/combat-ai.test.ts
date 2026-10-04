/**
 * Combat AI (src/ai/combat): attack tokens and the §6.13 state machine against a fake world,
 * then a 1-vs-4 fight through the core (AC-07: at most 2 attackers on Normal).
 */
import { describe, expect, it } from 'vitest';
import { AI_SPEEDS, CIRCLE, CombatBrain } from '../src/ai/combat/CombatBrain';
import { NereusScript, NEREUS } from '../src/ai/combat/nereus';
import { AttackTokens } from '../src/ai/combat/tokens';
import { brainProfileFrom, type BrainProfile, type BrainServices, type Perception } from '../src/ai/combat/types';
import { nereusProfile } from '../src/combat/archetypes';
import { combatProfileFor } from '../src/rpg/enemies';
import { addNpc, addPlayer, makeCore, run } from './combat-fakes';

describe('attack tokens (§6.12)', () => {
  it('two on Normal: of four askers, two attack and the rest wait', () => {
    const t = new AttackTokens(() => 2);
    const got = ['a', 'b', 'c', 'd'].map((id) => t.request(id, 'player', 1, 0));
    expect(got).toEqual([true, true, false, false]);
    expect(t.used('player')).toBe(2);
  });

  it('a freed token goes to whoever has waited longest', () => {
    const t = new AttackTokens(() => 2);
    t.request('a', 'p', 1, 0);
    t.request('b', 'p', 1, 0);
    t.request('c', 'p', 1, 0.1);
    t.request('d', 'p', 1, 0.2);
    t.release('a');
    expect(t.request('d', 'p', 1, 0.3)).toBe(false);
    expect(t.request('c', 'p', 1, 0.3)).toBe(true);
  });

  it('a boss spends two; on Tiro (one token) a lone boss may still attack', () => {
    const normal = new AttackTokens(() => 2);
    expect(normal.request('boss', 'p', 2, 0)).toBe(true);
    expect(normal.request('add', 'p', 1, 0)).toBe(false);
    const tiro = new AttackTokens(() => 1);
    expect(tiro.request('boss', 'p', 2, 0)).toBe(true);
    const busy = new AttackTokens(() => 1);
    busy.request('thug', 'p', 1, 0);
    expect(busy.request('boss', 'p', 2, 0)).toBe(false);
  });

  it('a holder must give its token back after maxHold', () => {
    const t = new AttackTokens(() => 2);
    t.request('a', 'p', 1, 0);
    expect(t.overdue('a', 4)).toBe(false);
    expect(t.overdue('a', t.maxHold + 0.1)).toBe(true);
  });
});

// ---------------------------------------------------------------- the brain on a fake world

interface World {
  now: number;
  self: Perception['self'];
  target: NonNullable<Perception['target']> | null;
  tokens: AttackTokens;
}

function world(o: { d?: number; stamina?: number; health?: number; reach?: number; capacity?: number } = {}): World {
  return {
    now: 0,
    self: { x: 0, z: 0, heading: 0, health: o.health ?? 1, stamina: o.stamina ?? 1, busy: false, canAct: true, reach: o.reach ?? 1.65, guardable: true },
    target: { id: 'player', x: 0, z: o.d ?? 10, heading: Math.PI, visible: true, reach: 1.65, attacking: false, power: false, impactIn: Infinity, facingMe: true },
    tokens: new AttackTokens(() => o.capacity ?? 2),
  };
}

function svc(w: World, id = 'npc', rng: () => number = () => 0.5): BrainServices {
  return {
    requestToken: (cost) => w.tokens.request(id, 'player', cost, w.now),
    releaseToken: () => w.tokens.release(id),
    holdsToken: () => w.tokens.holds(id, 'player'),
    tokenOverdue: () => w.tokens.overdue(id, w.now),
    rng,
  };
}

const miles = (extra: Partial<BrainProfile> = {}) => brainProfileFrom(combatProfileFor('miles', { kit: 0 }), extra);
const thug = (extra: Partial<BrainProfile> = {}) => brainProfileFrom(combatProfileFor('thug', { kit: 0 }), extra);

/** Step the brain on the fake world; the NPC moves by its intent. */
function step(b: CombatBrain, w: World, seconds: number, s: BrainServices = svc(w), onStep?: (i: ReturnType<CombatBrain['tick']>) => void) {
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    w.now += dt;
    const I = b.tick({ now: w.now, self: w.self, target: w.target, allies: [] }, s, dt);
    w.self.x += I.move.x * dt;
    w.self.z += I.move.z * dt;
    onStep?.(I);
  }
}

describe('the brain (§6.13)', () => {
  it('approach: out of reach it runs at the target and stops at reach + 0.3 m', () => {
    const w = world({ d: 12, capacity: 0 });
    const b = new CombatBrain(thug(), () => 0.5);
    step(b, w, 0.15);
    expect(b.state).toBe('approach');
    expect(b.intent.move.z).toBeCloseTo(AI_SPEEDS.run, 3);
  });

  it('engage: with a token it closes in and attacks at the §6.13 interval', () => {
    const w = world({ d: 1.4 });
    const b = new CombatBrain(thug(), () => 0.5);
    const attacks: number[] = [];
    step(b, w, 8, svc(w), (I) => {
      if (I.attack) attacks.push(w.now);
    });
    expect(b.state === 'engage' || b.state === 'circle').toBe(true);
    expect(attacks.length).toBeGreaterThanOrEqual(2);
    // lerp(2.5, 0.9, 0.55) = 1.62 s (± jitter)
    const gaps = attacks.slice(1).map((t, i) => t - attacks[i]).filter((g) => g < 3);
    for (const g of gaps) expect(g).toBeGreaterThan(1.62 * 0.84);
  });

  it('circle: without a token it strafes 3–5 m from the target', () => {
    const w = world({ d: 4, capacity: 0 });
    const b = new CombatBrain(thug(), () => 0.5);
    step(b, w, 3);
    expect(b.state).toBe('circle');
    const d = Math.hypot(w.target!.x - w.self.x, w.target!.z - w.self.z);
    expect(d).toBeGreaterThanOrEqual(CIRCLE.min - 0.2);
    expect(d).toBeLessThanOrEqual(CIRCLE.max + 0.2);
  });

  it('retreat: under 25 % stamina it backs off, and returns at 60 %', () => {
    const w = world({ d: 1.5, stamina: 0.2 });
    const b = new CombatBrain(miles(), () => 0.5);
    step(b, w, 0.2);
    expect(b.state).toBe('retreat');
    const d0 = Math.hypot(w.self.x, w.self.z - 1.5);
    step(b, w, 0.5);
    expect(Math.hypot(w.self.x - w.target!.x, w.self.z - w.target!.z)).toBeGreaterThan(1.5 - d0);
    w.self.stamina = 0.65;
    step(b, w, 0.2);
    expect(b.state).not.toBe('retreat');
  });

  it('yield at yieldAt and flee at fleeAt; a grassator runs at its yield threshold', () => {
    const w = world({ d: 2, health: 0.2 });
    const b = new CombatBrain(thug(), () => 0.5);
    let yielded = false;
    step(b, w, 0.2, svc(w), (I) => (yielded ||= I.yield));
    expect(yielded).toBe(true);
    expect(b.state).toBe('yield');
    const w2 = world({ d: 2, health: 0.1 });
    const b2 = new CombatBrain(thug({ yieldAt: 0 }), () => 0.5);
    step(b2, w2, 0.2);
    expect(b2.state).toBe('flee');
    expect(b2.intent.move.z).toBeLessThan(0); // away from the target at +z
    const w3 = world({ d: 2, health: 0.22 });
    const b3 = new CombatBrain(thug({ prefersFlee: true }), () => 0.5);
    step(b3, w3, 0.2);
    expect(b3.state).toBe('flee');
  });

  it('calls for help at combat start and again at 50 % health', () => {
    const w = world({ d: 3 });
    const b = new CombatBrain(thug(), () => 0.5);
    let shouts = 0;
    step(b, w, 0.5, svc(w), (I) => (shouts += I.shout ? 1 : 0));
    expect(shouts).toBe(1);
    w.self.health = 0.45;
    step(b, w, 0.5, svc(w), (I) => (shouts += I.shout ? 1 : 0));
    expect(shouts).toBe(2);
  });

  it('search: after 2 s without sight it goes to the last known position, then gives up after 20 s', () => {
    const w = world({ d: 6, capacity: 0 });
    const b = new CombatBrain(thug(), () => 0.5);
    step(b, w, 0.5);
    w.target!.visible = false;
    step(b, w, 2.5);
    expect(b.state).toBe('search');
    step(b, w, 21);
    expect(b.state).toBe('idle');
  });

  it('reactive guard: the target entering reach facing it raises the guard after the reaction time (chance blockSkill)', () => {
    const w = world({ d: 6, capacity: 0 });
    const b = new CombatBrain(miles(), () => 0.3); // 0.3 < blockSkill 0.55 → the roll succeeds
    step(b, w, 0.5);
    // The target steps into reach and stays there (following the circling NPC).
    const follow = () => {
      w.target!.x = w.self.x;
      w.target!.z = w.self.z + 1.6;
    };
    follow();
    let first = -1;
    const t0 = w.now;
    step(b, w, 1, svc(w), (I) => {
      follow();
      if (I.guard && first < 0) first = w.now - t0;
    });
    expect(first).toBeGreaterThan(0.34);
    expect(first).toBeLessThan(0.5);
    const w2 = world({ d: 6, capacity: 0 });
    const b2 = new CombatBrain(thug({ blockSkill: 0.15 }), () => 0.3); // 0.3 > 0.15 → no reactive guard
    step(b2, w2, 0.5);
    w2.target!.z = w2.self.z + 1.6;
    let guarded = false;
    // Brains start with the guard down for a spell-gap, so only reactions could raise it here.
    step(b2, w2, 0.6, svc(w2), (I) => {
      w2.target!.x = w2.self.x;
      w2.target!.z = w2.self.z + 1.6;
      guarded ||= I.guard;
    });
    expect(guarded).toBe(false);
  });

  it('a power wind-up can be read and guarded against', () => {
    const w = world({ d: 4, capacity: 0 });
    const b = new CombatBrain(miles(), () => 0.3);
    step(b, w, 0.5);
    w.target!.power = true;
    w.target!.facingMe = false; // not a reach reaction: only the wind-up
    let guard = false;
    step(b, w, 0.5, svc(w), (I) => (guard ||= I.guard));
    expect(guard).toBe(true);
  });

  it('elites, champions and bosses may parry (blockSkill × 0.4); thugs never', () => {
    const w = world({ d: 1.5 });
    const elite = new CombatBrain(brainProfileFrom(combatProfileFor('elite', { kit: 0 })), () => 0.1);
    w.target!.attacking = true;
    w.target!.impactIn = 0.1;
    let parried = false;
    step(elite, w, 0.05, svc(w), (I) => (parried ||= I.parry));
    expect(parried).toBe(true);
    expect(thug().canParry).toBe(false);
  });
});

describe('Nereus (§13.2)', () => {
  it('phases at 75 % and 45 %, losing the net in phase 3; a net cast every 12 s in range', () => {
    const w = world({ d: 4 });
    const b = new CombatBrain(brainProfileFrom(nereusProfile()), () => 0.5);
    const s = new NereusScript();
    let lost = false;
    s.onNetLost = () => (lost = true);
    b.script = s;
    const nets: number[] = [];
    const phases: number[] = [];
    step(b, w, 30, svc(w), (I) => {
      if (I.special === 'net') nets.push(w.now);
      if (I.phase) phases.push(I.phase);
      // keep him at casting range
      w.self.x = 0;
      w.self.z = 0;
    });
    expect(nets.length).toBeGreaterThanOrEqual(2);
    expect(nets[1] - nets[0]).toBeGreaterThanOrEqual(NEREUS.netEvery - 0.2);
    w.self.health = 0.7;
    step(b, w, 0.2);
    w.self.health = 0.4;
    step(b, w, 0.2);
    expect(s.phase).toBe(3);
    expect(lost).toBe(true);
    expect(b.attackInterval).toBe(NEREUS.interval[2]);
  });

  it('a netted target gets a telegraphed power poke first (wind-up ≥ 0.8 s)', () => {
    const w = world({ d: 1.5 });
    const b = new CombatBrain(brainProfileFrom(nereusProfile()), () => 0.5);
    b.script = new NereusScript();
    step(b, w, 0.3);
    w.target!.entangled = true;
    let poke: { kind: string | null; min?: number } | null = null;
    step(b, w, 2, svc(w), (I) => {
      if (I.attack && !poke) poke = { kind: I.attack, min: I.minWindup };
    });
    expect(poke).toEqual({ kind: 'power', min: 0.8 });
  });
});

describe('1-vs-4 through the core (AC-07)', () => {
  function fight(difficulty: 'normalis' | 'tiro', seconds = 25) {
    const core = makeCore();
    core.difficulty = difficulty;
    const p = addPlayer(core, { health: 1e6 });
    p.vitals.setMax('health', 1e6);
    let seed = 7;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const foes = [0, 1, 2, 3].map((i) => addNpc(core, `g${i}`, { ...combatProfileFor('thug', { kit: 0 }), health: 1e5, yieldAt: 0, fleeAt: 0 }, { x: (i - 1.5) * 2.5, z: 8, ai: true, rng }));
    for (const f of foes) core.engage(f, p);
    let maxTokens = 0;
    let maxAttacking = 0;
    let circling = 0;
    run(core, seconds, () => {
      maxTokens = Math.max(maxTokens, core.tokens.holders(p.id).length);
      maxAttacking = Math.max(maxAttacking, foes.filter((f) => f.attacking()).length);
      if (foes.some((f) => f.brain!.state === 'circle')) circling++;
    });
    return { maxTokens, maxAttacking, circling };
  }

  it('Normal: never more than two attack at once; the others circle', () => {
    const r = fight('normalis');
    expect(r.maxTokens).toBe(2);
    expect(r.maxAttacking).toBeLessThanOrEqual(2);
    expect(r.circling).toBeGreaterThan(60);
  });

  it('Tiro: one at a time', () => {
    const r = fight('tiro');
    expect(r.maxTokens).toBe(1);
    expect(r.maxAttacking).toBeLessThanOrEqual(1);
  });
});
