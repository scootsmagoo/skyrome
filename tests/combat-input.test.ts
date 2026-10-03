/**
 * The block key's hold and toggle modes and the parry rule (docs/GDD.md §4.2), the power-attack
 * direction latch mapping (§6.1), and the parry window as the core applies it.
 */
import { describe, expect, it } from 'vitest';
import { GuardInput } from '../src/combat/guardInput';
import { axesDir } from '../src/combat/PlayerCombat';
import { combatSettings } from '../src/combat/settings';
import { DEFAULT_SETTINGS } from '../src/core/Settings';
import { combatProfileFor } from '../src/rpg/enemies';
import { addNpc, addPlayer, fakeEnv, makeCore, run } from './combat-fakes';

describe('hold mode', () => {
  it('the guard is up while the key is held', () => {
    const g = new GuardInput(false);
    g.press(0);
    expect(g.guard).toBe(true);
    g.release(0.05);
    expect(g.guard).toBe(false);
    g.press(1);
    g.release(3);
    expect(g.guard).toBe(false);
  });
});

describe('toggle mode (§4.2)', () => {
  it('a press raises the guard at once', () => {
    const g = new GuardInput(true);
    g.press(0);
    expect(g.guard).toBe(true);
  });

  it('a tap (< 0.18 s) is a parry attempt only: the guard returns to its earlier state', () => {
    const down = new GuardInput(true);
    down.press(0);
    down.release(0.17);
    expect(down.guard).toBe(false);
    const up = new GuardInput(true);
    up.press(0);
    up.release(0.5); // ≥ 0.18: toggled up
    expect(up.guard).toBe(true);
    up.press(1);
    up.release(1.1); // a tap while guarding: the guard stays up
    expect(up.guard).toBe(true);
  });

  it('a press of 0.18 s or more toggles the guard', () => {
    const g = new GuardInput(true);
    g.press(0);
    g.release(0.18);
    expect(g.guard).toBe(true);
    g.press(2);
    g.release(2.4);
    expect(g.guard).toBe(false);
  });

  it('a parry that lands never changes the guard state', () => {
    const g = new GuardInput(true);
    g.press(0);
    g.parried();
    g.release(0.6); // long, but a parry landed: back to down
    expect(g.guard).toBe(false);
    const h = new GuardInput(true);
    h.press(0);
    h.release(0.3);
    h.press(1);
    h.parried();
    h.release(1.5);
    expect(h.guard).toBe(true);
  });

  it('switching back to hold mode drops a toggled guard', () => {
    const g = new GuardInput(true);
    g.press(0);
    g.release(0.4);
    g.setToggle(false);
    expect(g.guard).toBe(false);
  });
});

describe('the parry window as the core applies it', () => {
  it('a toggle-mode tap parries on Normal without changing the guard', () => {
    const env = fakeEnv();
    const core = makeCore(env);
    const p = addPlayer(core, { shield: 'scutum' });
    const t = addNpc(core, 't', { ...combatProfileFor('thug', { kit: 0 }), health: 300, yieldAt: 0, fleeAt: 0 }, { z: 1.3 });
    core.engage(t, p);
    const g = new GuardInput(true);
    core.startAttack(t, 'light'); // lands at +0.35
    run(core, 0.25);
    g.press(core.now);
    core.pressParry(p);
    core.setGuard(p, g.guard);
    run(core, 0.12);
    if ((env.of('combat:parry') as unknown[]).length) g.parried();
    g.release(core.now);
    expect(env.of('combat:parry')).toHaveLength(1);
    expect(g.guard).toBe(false);
    expect(p.vitals.health.current).toBe(100);
  });

  it('the accessibility override widens the window', () => {
    const env = fakeEnv();
    env.parryWindowOverride = () => 0.5;
    const core = makeCore(env);
    const p = addPlayer(core);
    expect(core.parryWindow(p)).toBe(0.5);
  });
});

describe('settings', () => {
  it('defaults: Normal, power hold 0.35 s (clamped to 0.2–0.6), shake in third person only, lock-on suggests', () => {
    const s = combatSettings(DEFAULT_SETTINGS);
    expect(s.difficulty).toBe('normalis');
    expect(s.powerHold).toBe(0.35);
    expect(s.shake).toBe('third');
    expect(s.lockOn).toBe('suggest');
    expect(combatSettings({ ...DEFAULT_SETTINGS, combatPowerHold: 2 }).powerHold).toBe(0.6);
  });
});

describe('power-attack direction from camera-relative axes (§6.1)', () => {
  it('forward, back, sideways, none', () => {
    expect(axesDir(0, -1)).toBe('forward');
    expect(axesDir(0, 1)).toBe('back');
    expect(axesDir(1, 0)).toBe('sideways');
    expect(axesDir(-1, -1)).toBe('forward');
    expect(axesDir(0, 0)).toBe('none');
  });
});
