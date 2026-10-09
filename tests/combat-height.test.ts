/**
 * Height in combat (mq-04, src/combat/CombatCore.ts): fighters on different floors — the turns of
 * the Column's spiral stair, a cell under the street — neither strike nor chase each other. A
 * target more than 1.6 m above or below is out of melee reach; one more than 2.5 m away vertically
 * is neither acquired nor tracked for melee. Bodies are points (tests/combat-fakes.ts) with a y.
 */
import { describe, expect, it } from 'vitest';
import type { Action } from '../src/combat/Combatant';
import { HEIGHT } from '../src/combat/geometry';
import { combatProfileFor } from '../src/rpg/enemies';
import { addNpc, addPlayer, makeCore, run } from './combat-fakes';

const light = (chain = 1): Action => ({ kind: 'light', start: 0, end: 1, resolved: true, chain });
const sturdy = () => ({ ...combatProfileFor('thug', { kit: 0 }), health: 500, yieldAt: 0, fleeAt: 0 });

describe('melee reach is level-bound', () => {
  it('the rule: 1.6 m for blows, 2.5 m for noticing', () => {
    expect(HEIGHT.melee).toBe(1.6);
    expect(HEIGHT.aware).toBe(2.5);
  });

  it("no melee hit at Δy 2.5 (above or below); the player's swing still lands a step up", () => {
    for (const y of [2.5, -2.5]) {
      const core = makeCore();
      const p = addPlayer(core);
      const t = addNpc(core, 'thug', sturdy(), { z: 1.2 });
      t.position.y = y;
      core.engage(t, p);
      expect(core.startAttack(p, 'light')).toBe(true);
      run(core, 0.6);
      expect(t.vitals.health.current).toBe(500);
      expect(core.sweepTargets(p, light(), p.weapon)).toEqual([]);
    }
    const core = makeCore();
    const p = addPlayer(core);
    const t = addNpc(core, 'thug', sturdy(), { z: 1.2 });
    t.position.y = 0.6; // three steps up
    core.engage(t, p);
    core.startAttack(p, 'light');
    run(core, 0.6);
    expect(t.vitals.health.current).toBeLessThan(500);
  });

  it('1.8 m up is out of reach though the blade could graze the feet (the height rule, not the sweep band)', () => {
    const core = makeCore();
    const p = addPlayer(core);
    const t = addNpc(core, 'thug', sturdy(), { z: 1.2 });
    t.position.y = 1.8;
    core.engage(t, p);
    expect(core.sweepTargets(p, light(), p.weapon)).toEqual([]);
    core.applyHit(p, t, light());
    expect(t.vitals.health.current).toBe(500);
  });

  it("an NPC's blow does not reach the player on the floor below (applyHit refuses across floors)", () => {
    const core = makeCore();
    const p = addPlayer(core, { health: 100 });
    const t = addNpc(core, 'thug', sturdy(), { z: 1.2 });
    t.position.y = 2.5;
    core.applyHit(t, p, light());
    expect(p.vitals.health.current).toBe(100);
    t.position.y = 0;
    core.applyHit(t, p, light());
    expect(p.vitals.health.current).toBeLessThan(100);
  });
});

describe('no acquiring or chasing across floors', () => {
  it('an aggressive NPC does not acquire a hostile 2.6 m below, but does within 2.5 m', () => {
    const core = makeCore();
    core.setHostile('hostile', 'player');
    const p = addPlayer(core);
    const t = addNpc(core, 'thug', sturdy(), { z: 3, ai: true });
    t.keepDriven = true; // a spawned enemy: driven even while idle
    core.aggro.set(t.id, 18);
    t.position.y = 2.6;
    run(core, 1);
    expect(t.target).toBeNull();
    t.position.y = 2.4;
    run(core, 0.2);
    expect(t.target).toBe(p);
  });

  it('perception: a foe more than 2.5 m above is not visible for melee (it searches instead of attacking)', () => {
    const core = makeCore();
    const p = addPlayer(core, { health: 100 });
    const t = addNpc(core, 'thug', sturdy(), { z: 1.4, ai: true });
    core.engage(t, p);
    p.position.y = 3;
    const seen = core.perceive(t).target!;
    expect(seen.visible).toBe(false);
    expect(seen.dy).toBeCloseTo(3, 6);
    // Melee fighters get no line-of-sight flag (only archers ask for one).
    expect(seen.los).toBeUndefined();
    run(core, 4);
    expect(t.brain!.state).toBe('search');
    expect(p.vitals.health.current).toBe(100);
    p.position.y = 2;
    expect(core.perceive(t).target!.visible).toBe(true);
  });
});
