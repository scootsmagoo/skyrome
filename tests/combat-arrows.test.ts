/**
 * Arrows and the archer (mq-04, src/combat/CombatCore.ts and src/ai/combat/CombatBrain.ts): an
 * arrow flies under gravity and strikes the first body in its path through the normal damage
 * formula (thrust, the bow's stats); a guard facing it stops it, a dodge's i-frames let it pass, a
 * miss sticks in the world. The archer (profile.shoot, BITUS_PROFILE) plants and shoots in range,
 * fights with the sica up close, and is out of arrows after six.
 */
import { describe, expect, it } from 'vitest';
import type { Combatant } from '../src/combat/Combatant';
import { FALLBACK_BOW, type Projectile } from '../src/combat/CombatCore';
import { segmentCapsule } from '../src/combat/geometry';
import { TIMING } from '../src/combat/timing';
import { BITUS_PROFILE, DACIAN_KNIFE_PROFILE } from '../src/content/profiles';
import { computeAttack, difficultyMult, resolveHit } from '../src/rpg/combat-math';
import { combatProfileFor } from '../src/rpg/enemies';
import type { CombatProfile } from '../src/rpg/types';
import { addNpc, addPlayer, fakeEnv, items, makeCore, run, type RecordingEnv } from './combat-fakes';

/** An env that counts arrows loosed (projectileVisual on). */
function arrowEnv(o: { worldHit?: RecordingEnv['worldHit'] } = {}) {
  const env = fakeEnv();
  const loosed: Projectile[] = [];
  env.projectileVisual = (p, on) => {
    if (on && p.kind === 'arrow') loosed.push(p);
  };
  if (o.worldHit) env.worldHit = o.worldHit;
  return { env, loosed };
}

/** An archer as CombatSystem.register makes one: the profile, its bow item, its AI. */
function addArcher(core: ReturnType<typeof makeCore>, profile: CombatProfile = BITUS_PROFILE, o: { z?: number; ai?: boolean } = {}): Combatant {
  const c = addNpc(core, 'npc-bitus', profile, { z: o.z ?? 10, ai: o.ai ?? true });
  c.rangedItem = items.get('arcus');
  c.ranged = c.rangedItem?.weapon;
  c.keepDriven = true;
  return c;
}

const arrowHits = (env: RecordingEnv) => (env.of('combat:hit') as { kind: string; damage: number; blocked: boolean; attackerId: string }[]).filter((h) => h.kind === 'arrow');

describe('the profiles (docs/CONTENT.md §5.2)', () => {
  it('Bitus: 45 HP, 70 stamina, AR 6 cloth, skill 40, the sica and the arcus, six arrows, yields at 25 %', () => {
    const b = BITUS_PROFILE;
    expect([b.health, b.stamina, b.armor, b.armorFamily, b.skill]).toEqual([45, 70, 6, 'cloth', 40]);
    expect([b.weapon, b.ranged, b.loot]).toEqual(['sica', 'arcus', 'body.npc-bitus']);
    expect(b.shoot).toEqual({ ammo: 6, interval: [1.6, 2.4], range: [3, 18], drawS: 0.9 });
    expect([b.reactionS, b.blockSkill, b.aggression, b.yieldAt]).toEqual([0.4, 0.1, 0.5, 0.25]);
  });

  it('the Dacian knife-man: a thug with a sica, 40 HP, who never yields', () => {
    const k = DACIAN_KNIFE_PROFILE;
    expect([k.tier, k.weapon, k.health, k.yieldAt, k.name]).toEqual(['thug', 'sica', 40, 0, 'Dacian knife-man']);
    expect(k.shoot).toBeUndefined();
  });
});

describe('swept capsule test (no tunnelling at 55 m/s)', () => {
  const body = { x: 0, z: 0, y0: 0, y1: 1.8, r: 0.35 };
  it('a step that jumps clean over the body in plan still hits it', () => {
    // 0.92 m in one step, from 0.5 m in front to 0.42 m behind, at chest height.
    const t = segmentCapsule(0, 1.3, 0.5, 0, 1.3, -0.42, body);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeCloseTo((0.5 - 0.35) / 0.92, 3);
  });

  it('misses beside, over the head and under the feet; enters through the top when falling', () => {
    expect(segmentCapsule(0.5, 1.3, 1, 0.5, 1.3, -1, body)).toBe(-1);
    expect(segmentCapsule(0, 2.2, 1, 0, 2.0, -1, body)).toBe(-1);
    expect(segmentCapsule(0, -0.2, 1, 0, -0.3, -1, body)).toBe(-1);
    // Dropping steeply into the top of the head.
    const t = segmentCapsule(0, 2.4, 0.2, 0, 1.4, -0.1, body);
    expect(t).toBeCloseTo((2.4 - 1.8) / 1.0, 3);
  });
});

describe('arrows in flight', () => {
  it('an arrow damages an unblocking player through the normal formula (thrust, arcus stats, difficulty)', () => {
    const { env, loosed } = arrowEnv();
    const core = makeCore(env);
    const p = addPlayer(core, { health: 100 });
    const b = addArcher(core, BITUS_PROFILE, { ai: false });
    core.engage(b, p);
    core.loose(b, p);
    expect(loosed.length).toBe(1);
    const a = loosed[0];
    // The arcus's 55 m/s (horizontally, toward the chest), raised for the drop.
    expect(Math.hypot(a.vx, a.vz)).toBeGreaterThan(50);
    expect(a.vy).toBeGreaterThan(0);
    // Health as the arrow lands (the pools regenerate afterwards).
    let at = -1;
    run(core, 0.5, () => {
      if (at < 0 && arrowHits(env).length) at = p.vitals.health.current;
    });
    const hit = arrowHits(env);
    expect(hit.length).toBe(1);
    expect(hit[0].blocked).toBe(false);
    const atk = computeAttack(b.stats, items.get('arcus')!.weapon!, { critRoll: 0.5, item: items.get('arcus') });
    expect(atk.damageType).toBe('thrust');
    const want = resolveHit({ attack: atk, armor: 0, family: 'cloth', defender: p.stats, mult: difficultyMult('normalis', false, true) }).damage;
    expect(100 - at).toBeCloseTo(want, 3);
    expect(core.projectiles.length).toBe(0);
    // The player's feedback: the hit indicator (toward the archer) and the blow's feel.
    expect(env.of('ui:hit')).toEqual([{ x: b.position.x, z: b.position.z }]);
    expect(env.feedbacks.length).toBe(1);
  });

  it('gravity bends the flight; without a bow item the arrow flies at 40 m/s', () => {
    const { env, loosed } = arrowEnv();
    const core = makeCore(env);
    const p = addPlayer(core);
    const b = addNpc(core, 'archer', BITUS_PROFILE, { z: 12 });
    core.engage(b, p);
    core.loose(b, p);
    const a = loosed[0];
    // Chest to chest on level ground: the flight is (all but) horizontal.
    expect(Math.hypot(a.vx, a.vz)).toBeCloseTo(40, 0);
    expect(a.weapon).toBe(FALLBACK_BOW);
    expect(TIMING.arrow.gravity).toBe(9.8);
    const vy0 = a.vy;
    run(core, 0.1);
    expect(a.vy).toBeLessThan(vy0);
  });

  it('a guard facing the arrow stops it: no damage, the stamina of a light blow; turned away (> 70°) it does not', () => {
    const { env } = arrowEnv();
    const core = makeCore(env);
    const p = addPlayer(core, { health: 100, shield: 'parmula' });
    const b = addArcher(core, BITUS_PROFILE, { ai: false });
    core.engage(b, p);
    core.setGuard(p, true);
    run(core, 0.1);
    expect(p.guardActive).toBe(true);
    core.loose(b, p);
    run(core, 0.4);
    const [h] = arrowHits(env);
    expect(h.blocked).toBe(true);
    expect(h.damage).toBe(0);
    expect(p.vitals.health.current).toBe(100);
    expect(p.vitals.stamina.current).toBeLessThan(100);
    expect(core.projectiles.length).toBe(0);
    // Facing 80° off the arrow's line, the guard is no use.
    p.body.heading = 80 * (Math.PI / 180);
    core.loose(b, p);
    run(core, 0.4);
    expect(arrowHits(env)[1].blocked).toBe(false);
    expect(p.vitals.health.current).toBeLessThan(100);
  });

  it('a block with only a weapon stops it too (the spec: shield or weapon)', () => {
    const { env } = arrowEnv();
    const core = makeCore(env);
    const p = addPlayer(core, { health: 100 });
    const b = addArcher(core, BITUS_PROFILE, { ai: false });
    core.engage(b, p);
    core.setGuard(p, true);
    run(core, 0.1);
    core.loose(b, p);
    run(core, 0.4);
    expect(arrowHits(env)[0].blocked).toBe(true);
    expect(p.vitals.health.current).toBe(100);
  });

  it("a dodge's i-frames let it pass; it flies on and is gone after 2 s", () => {
    const { env } = arrowEnv();
    const core = makeCore(env);
    const p = addPlayer(core, { health: 100 });
    const b = addArcher(core, BITUS_PROFILE, { ai: false });
    core.engage(b, p);
    const a = core.loose(b, p);
    // Backstep (the fake body stays put, so only the i-frames save the player) as it closes in.
    run(core, 0.08);
    expect(core.dodge(p, 0, 0)).toBe(true);
    run(core, 0.3);
    expect(a.dodged.has(p.id)).toBe(true);
    expect(arrowHits(env)).toEqual([]);
    expect(p.vitals.health.current).toBe(100);
    expect(core.projectiles).toContain(a);
    run(core, 2);
    expect(core.projectiles.length).toBe(0);
  });

  it('a miss strikes the world and sticks there for 4 s', () => {
    // A wall across z = -3 behind the player.
    const worldHit = (_ax: number, _ay: number, az: number, _bx: number, _by: number, bz: number) => (az > -3 && bz <= -3 ? (az + 3) / (az - bz) : null);
    const { env } = arrowEnv({ worldHit });
    const core = makeCore(env);
    const p = addPlayer(core, { health: 100 });
    const b = addArcher(core, BITUS_PROFILE, { ai: false });
    core.engage(b, p);
    const a = core.loose(b, p);
    p.position.x = 3; // stepped aside: a clean miss
    run(core, 0.5);
    expect(a.stuck).toBe(true);
    expect(a.z).toBeCloseTo(-3, 3);
    run(core, 3);
    expect(core.projectiles).toContain(a);
    run(core, 1.1);
    expect(core.projectiles.length).toBe(0);
  });

  it('it strikes only enemies, but a scripted shot strikes whom it is loosed at', () => {
    const { env } = arrowEnv();
    const core = makeCore(env);
    const p = addPlayer(core, { z: -30 });
    const b = addArcher(core, BITUS_PROFILE, { ai: false });
    core.engage(b, p);
    const gratus = addNpc(core, 'npc-gratus', { ...combatProfileFor('veteran'), health: 300 }, { z: 0, team: 'npc:gratus' });
    core.shootNow(b, gratus);
    run(core, 0.5);
    expect(gratus.vitals.health.current).toBeLessThan(300);
    expect(b.ammo).toBe(6); // scripted: no arrow spent
    expect(b.bowOut).toBe(true);
  });
});

describe('the archer (profile.shoot)', () => {
  it('plants and shoots in range: a 0.9 s draw (the telegraph), the arrow, then a 1.6–2.4 s wait', () => {
    const { env, loosed } = arrowEnv();
    const core = makeCore(env);
    const p = addPlayer(core, { health: 1000 });
    const b = addArcher(core);
    core.engage(b, p);
    const at = b.position.clone();
    let drew = -1;
    const looseTimes: number[] = [];
    run(core, 8, () => {
      if (drew < 0 && b.action?.kind === 'shoot') drew = core.now;
      if (loosed.length > looseTimes.length) looseTimes.push(core.now);
    });
    expect(b.brain!.state).toBe('shoot');
    expect(b.position.distanceTo(at)).toBeLessThan(1e-6);
    // First draw after its reaction time; released at the end of the draw.
    expect(drew).toBeGreaterThanOrEqual(BITUS_PROFILE.reactionS!);
    expect(looseTimes[0] - drew).toBeCloseTo(0.9, 1);
    // rng 0.5: the middle of the interval, plus the next draw (decisions come at 10 Hz).
    expect(looseTimes.length).toBe(3);
    for (const gap of [looseTimes[1] - looseTimes[0], looseTimes[2] - looseTimes[1]]) {
      expect(gap).toBeGreaterThanOrEqual(0.9 + 2.0 - 0.02);
      expect(gap).toBeLessThanOrEqual(0.9 + 2.0 + 0.12);
    }
    expect(b.ammo).toBe(3);
    expect(b.bowOut).toBe(true);
    expect(arrowHits(env).length).toBe(3);
  });

  it('switches to melee at 2 m: no arrows, the sica', () => {
    const { env, loosed } = arrowEnv();
    const core = makeCore(env);
    const p = addPlayer(core, { health: 1000 });
    const b = addArcher(core, BITUS_PROFILE, { z: 2 });
    core.engage(b, p);
    const kinds = new Set<string>();
    run(core, 4, () => {
      if (b.action) kinds.add(b.action.kind);
    });
    expect(loosed.length).toBe(0);
    expect(b.ammo).toBe(6);
    expect(b.brain!.state).not.toBe('shoot');
    expect(kinds.has('shoot')).toBe(false);
    expect(kinds.has('light') || kinds.has('power') || kinds.has('feint')).toBe(true);
    const melee = (env.of('combat:hit') as { kind: string; attackerId: string }[]).filter((h) => h.attackerId === b.id);
    expect(melee.length).toBeGreaterThan(0);
    expect(melee.every((h) => h.kind !== 'arrow')).toBe(true);
  });

  it('takes up the sica again when the target closes in, and the bow when it backs off', () => {
    const { env, loosed } = arrowEnv();
    const core = makeCore(env);
    const p = addPlayer(core, { health: 1000 });
    const b = addArcher(core);
    core.engage(b, p);
    run(core, 2);
    expect(loosed.length).toBe(1);
    expect(b.bowOut).toBe(true);
    p.position.z = b.position.z - 2;
    run(core, 1.5);
    expect(b.brain!.state).not.toBe('shoot');
    expect(b.bowOut).toBe(false);
    p.position.z = b.position.z - 12;
    run(core, 1);
    expect(b.brain!.state).toBe('shoot');
    void env;
  });

  it('ammo runs out after 6, then it fights hand to hand', () => {
    const { env, loosed } = arrowEnv();
    const core = makeCore(env);
    const p = addPlayer(core, { health: 1000 });
    const b = addArcher(core);
    core.engage(b, p);
    run(core, 20);
    expect(loosed.length).toBe(6);
    expect(b.ammo).toBe(0);
    expect(arrowHits(env).length).toBe(6);
    expect(b.brain!.state).not.toBe('shoot');
    // Coming for the player with the sica.
    expect(b.position.z).toBeLessThan(10);
  });

  it('no shooting without a line of sight; it shoots down at a target on another floor that it can see', () => {
    const blind = arrowEnv();
    blind.env.lineOfSight = () => false;
    const core = makeCore(blind.env);
    const p = addPlayer(core, { health: 1000 });
    const b = addArcher(core);
    core.engage(b, p);
    run(core, 3);
    expect(blind.loosed.length).toBe(0);

    const seen = arrowEnv();
    const core2 = makeCore(seen.env);
    const p2 = addPlayer(core2, { health: 1000 });
    const b2 = addArcher(core2);
    b2.position.y = 6; // on a roof
    core2.engage(b2, p2);
    run(core2, 3);
    expect(seen.loosed.length).toBe(1);
    expect(p2.vitals.health.current).toBeLessThan(1000);
  });

  it('a stagger in the draw spoils the shot (no arrow, none spent)', () => {
    const { env, loosed } = arrowEnv();
    const core = makeCore(env);
    const p = addPlayer(core, { health: 1000 });
    const b = addArcher(core, BITUS_PROFILE, { ai: false });
    core.engage(b, p);
    expect(core.startShot(b)).toBe(true);
    expect(b.action?.kind).toBe('shoot');
    expect(b.inWindup(core.now)).toBe(true);
    run(core, 0.4);
    core.stagger(b, 1, p);
    run(core, 1);
    expect(loosed.length).toBe(0);
    expect(b.ammo).toBe(6);
    void env;
  });

  it('an archer without a shoot profile never shoots (opt-in)', () => {
    const { env, loosed } = arrowEnv();
    const core = makeCore(env);
    const p = addPlayer(core, { health: 1000 });
    const { shoot: _none, ...plain } = BITUS_PROFILE;
    const b = addArcher(core, plain);
    core.engage(b, p);
    run(core, 3);
    expect(loosed.length).toBe(0);
    expect(b.ammo).toBe(0);
    void env;
  });
});
