import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS, HOTBAR_ACTIONS, WheelAccumulator, capsLockToggled, keyLookEase, wheelPixels, type Action } from '../src/core/Input';
import { controlState, guessPreset, presetValues, settingsFixups } from '../src/game/settings';
import { DEFAULT_SETTINGS } from '../src/core/Settings';

/** Feed a stream of [timeMs, delta] and count the steps. */
function run(acc: WheelAccumulator, events: [number, number][]) {
  const steps: { t: number; dir: number }[] = [];
  for (const [t, d] of events) {
    const s = acc.push(d, t);
    if (s) steps.push({ t, dir: s });
  }
  return steps;
}

describe('wheel zoom accumulator (GDD §4.2)', () => {
  it('turns a trackpad flick with its momentum tail into one step', () => {
    // Fingers lift after ~120 ms; momentum decays over a second and a half, an event every 16 ms.
    const events: [number, number][] = [];
    for (let t = 0; t < 1600; t += 16) events.push([t, 45 * Math.exp(-t / 380)]);
    const steps = run(new WheelAccumulator(), events);
    expect(steps).toHaveLength(1);
    expect(steps[0].dir).toBe(1); // positive deltaY = scroll down = zoom out
  });

  /** A real trackpad flick: the deltas ramp up while the fingers move, hold, then momentum decays. */
  function flick(peak: number, opts: { rampMs?: number; holdMs?: number; decayMs?: number; tau?: number; t0?: number; sign?: number } = {}) {
    const { rampMs = 160, holdMs = 0, decayMs = 1500, tau = 380, t0 = 0, sign = 1 } = opts;
    const out: [number, number][] = [];
    let t = 0;
    for (; t < rampMs; t += 16) out.push([t0 + t, sign * peak * (0.1 + 0.9 * (t / rampMs))]);
    for (const end = t + holdMs; t < end; t += 16) out.push([t0 + t, sign * peak]);
    for (const start = t; t < start + decayMs; t += 16) out.push([t0 + t, sign * peak * Math.exp(-(t - start) / tau)]);
    return out;
  }

  it('a ramp-up-then-decay flick is exactly one step, gentle or hard (AC-24)', () => {
    for (const peak of [12, 20, 45, 80, 160]) {
      for (const holdMs of [0, 60, 120]) {
        for (const tau of [250, 380, 600]) {
          const steps = run(new WheelAccumulator(), flick(peak, { holdMs, tau }));
          expect(steps, `peak ${peak} hold ${holdMs} tau ${tau}`).toHaveLength(1);
        }
      }
    }
  });

  it('two separate flicks are two steps, even while the first one is still coasting', () => {
    const events = [...flick(45, { decayMs: 600 }), ...flick(45, { t0: 900 })].sort((a, b) => a[0] - b[0]);
    expect(run(new WheelAccumulator(), events)).toHaveLength(2);
    // The second flick lands on the first one's momentum tail.
    const overlapping = [...flick(45, { decayMs: 1200 }), ...flick(60, { t0: 500, decayMs: 600 })].sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const e of overlapping) {
      const prev = merged[merged.length - 1];
      if (prev && prev[0] === e[0]) prev[1] += e[1];
      else merged.push([e[0], e[1]]);
    }
    expect(run(new WheelAccumulator(), merged)).toHaveLength(2);
  });

  it('a mouse wheel with accelerating notches keeps stepping, debounced', () => {
    const events: [number, number][] = [];
    [4, 8, 16, 40, 80, 120, 120, 120, 120, 120].forEach((d, i) => events.push([i * 80, -d]));
    const steps = run(new WheelAccumulator(), events);
    expect(steps.length).toBeGreaterThanOrEqual(2);
    expect(steps.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < steps.length; i++) expect(steps[i].t - steps[i - 1].t).toBeGreaterThanOrEqual(250);
  });

  it('keeps stepping (at most every 250 ms) while a mouse wheel is rolled on', () => {
    const events: [number, number][] = [];
    for (let t = 0; t <= 1000; t += 50) events.push([t, -100]);
    const steps = run(new WheelAccumulator(), events);
    expect(steps.length).toBeGreaterThanOrEqual(3);
    expect(steps.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < steps.length; i++) expect(steps[i].t - steps[i - 1].t).toBeGreaterThanOrEqual(250);
    expect(steps.every((s) => s.dir === -1)).toBe(true);
  });

  it('steps again after a quiet gap, ignores jitter and restarts on reversal', () => {
    const acc = new WheelAccumulator();
    expect(acc.push(-100, 0)).toBe(-1);
    expect(acc.push(-100, 100)).toBe(0); // locked
    expect(acc.push(-100, 500)).toBe(-1); // quiet for 400 ms: a new gesture
    expect(acc.push(0.3, 1000)).toBe(0); // jitter
    expect(acc.push(40, 2000)).toBe(0);
    expect(acc.push(-40, 2010)).toBe(0); // reversal: the sum restarts
    expect(acc.push(-30, 2020)).toBe(-1);
  });

  it('a single small notch does not zoom, two of them do', () => {
    const acc = new WheelAccumulator();
    expect(acc.push(40, 0)).toBe(0);
    expect(acc.push(40, 30)).toBe(1);
  });

  it('normalizes line and page deltas to pixels', () => {
    expect(wheelPixels(3, 1)).toBe(48);
    expect(wheelPixels(1, 2)).toBe(400);
    expect(wheelPixels(-120, 0)).toBe(-120);
  });
});

describe('Caps Lock as a toggle (GDD §4.2)', () => {
  it('macOS: keydown turns it on, keyup turns it off — one toggle per press', () => {
    let state: boolean | null = null;
    let toggles = 0;
    const ev = (type: 'keydown' | 'keyup', next: boolean) => {
      if (capsLockToggled(state, next, type)) toggles++;
      state = next;
    };
    ev('keydown', true); // press 1 (on)
    expect(toggles).toBe(1);
    ev('keyup', false); // press 2 (off): macOS only reports the release
    expect(toggles).toBe(2);
  });

  it('Windows/Linux: keydown and keyup per press still toggle once', () => {
    let state: boolean | null = false;
    let toggles = 0;
    const ev = (type: 'keydown' | 'keyup', next: boolean) => {
      if (capsLockToggled(state, next, type)) toggles++;
      state = next;
    };
    ev('keydown', true);
    ev('keyup', true);
    expect(toggles).toBe(1);
    ev('keydown', false);
    ev('keyup', false);
    expect(toggles).toBe(2);
  });

  it('unknown modifier state: only keydown counts', () => {
    expect(capsLockToggled(null, null, 'keydown')).toBe(true);
    expect(capsLockToggled(true, null, 'keyup')).toBe(false);
  });
});

describe('default bindings (GDD §4.2)', () => {
  const b = DEFAULT_BINDINGS;
  it('has the added actions on their keys', () => {
    expect(b.walkToggle).toEqual(['KeyN']);
    expect(b.dodge).toContain('AltLeft');
    expect(b.lockOn).toEqual(['KeyX']);
    expect(b.invoke).toEqual(['KeyZ']);
    expect(b.quickWheel).toEqual(['KeyG']);
    expect(b.yield).toEqual(['KeyY']);
    expect(b.wait).toEqual(['KeyT']);
    expect(b.shoulderSwap).toEqual(['KeyH']);
    expect(b.quickSave).toEqual(['F5', 'KeyP']);
    expect(b.quickLoad).toEqual(['F9', 'KeyL']);
    HOTBAR_ACTIONS.forEach((a, i) => expect(b[a]).toEqual([`Digit${i + 1}`]));
  });

  it('keeps the existing ids and never binds Cmd', () => {
    for (const a of ['forward', 'back', 'left', 'right', 'jump', 'sprint', 'sneak', 'attack', 'block', 'readyWeapon', 'interact', 'toggleView', 'zoomIn', 'zoomOut', 'menu', 'pause', 'console'] as Action[]) expect(b[a].length).toBeGreaterThan(0);
    for (const codes of Object.values(b)) for (const c of codes) expect(c).not.toMatch(/^Meta|^OS/);
  });

  it('every mouse action also has a key', () => {
    for (const [a, codes] of Object.entries(b)) {
      if (codes.some((c) => c.startsWith('Mouse') || c.startsWith('Wheel'))) expect(codes.some((c) => !c.startsWith('Mouse') && !c.startsWith('Wheel')), a).toBe(true);
    }
  });

  it('no key drives two actions', () => {
    const seen = new Map<string, string>();
    for (const [a, codes] of Object.entries(b)) {
      for (const c of codes) {
        expect(seen.get(c), `${c} is bound to ${seen.get(c)} and ${a}`).toBeUndefined();
        seen.set(c, a);
      }
    }
  });
});

describe('arrow-key look ease-in (GDD §4.3)', () => {
  it('starts slow and reaches full speed after the ease-in time', () => {
    expect(keyLookEase(0, 0.25)).toBeCloseTo(0.15);
    expect(keyLookEase(0.125, 0.25)).toBeGreaterThan(0.15);
    expect(keyLookEase(0.125, 0.25)).toBeLessThan(1);
    expect(keyLookEase(0.25, 0.25)).toBe(1);
    expect(keyLookEase(3, 0.25)).toBe(1);
    expect(keyLookEase(0, 0)).toBe(1);
    let prev = 0;
    for (let t = 0; t <= 0.3; t += 0.01) {
      const v = keyLookEase(t, 0.25);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('control presets (GDD §4.3)', () => {
  it('Trackpad: F/Q only, toggles, ×1.6 look with smoothing, recenter, no scroll-to-first-person', () => {
    const s = controlState(presetValues('trackpad'));
    expect(s.ignoredCodes).toEqual(['Mouse0', 'Mouse2']);
    expect(s.sprintMode).toBe('toggle');
    expect(s.lookSmoothing).toBeCloseTo(0.08);
    expect(s.autoRecenterDelay).toBe(1.5);
    expect(s.zoomToFirstPerson).toBe(false);
    const v = presetValues('trackpad');
    expect(v.lookSensitivity).toBe(1.6);
    expect(v.blockToggle).toBe(true);
    expect(v.lockOnMode).toBe('suggest');
    expect(v.aimAssist).toBe('light');
  });

  it('Mouse: clicks attack, holds, scroll fully in for first person', () => {
    const s = controlState(presetValues('mouse'));
    expect(s.ignoredCodes).toEqual([]);
    expect(s.sprintMode).toBe('hold');
    expect(s.zoomToFirstPerson).toBe(true);
    expect(s.autoRecenterDelay).toBe(0);
    expect(presetValues('mouse').blockToggle).toBe(false);
  });

  it('Keyboard only: toggles, auto lock-on, strong aim assist', () => {
    const v = presetValues('keyboard');
    expect(v.lockOnMode).toBe('auto');
    expect(v.aimAssist).toBe('strong');
    expect(controlState(v).sprintMode).toBe('toggle');
  });

  it('a click opt-in in the Trackpad preset re-enables click attacks', () => {
    expect(controlState({ ...presetValues('trackpad'), clickAttacks: true }).ignoredCodes).toEqual([]);
  });

  it('guesses Trackpad on a Mac', () => {
    expect(guessPreset({ platform: 'MacIntel' })).toBe('trackpad');
    expect(guessPreset({ platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0)' })).toBe('mouse');
  });
});

describe('settings stay honest (AC-21)', () => {
  it('a first launch on a Mac writes the whole Trackpad preset over the core defaults, and Normalis', () => {
    const w = settingsFixups({ ...DEFAULT_SETTINGS }, 'trackpad');
    expect(w.lookSensitivity).toBe(1.6);
    expect(w.blockToggle).toBe(true);
    expect(w.controlPreset).toBe('trackpad');
    expect(w.presetApplied).toBe('trackpad');
    expect(w.difficulty).toBe('normalis');
    expect(w.gore).toBe('ultra');
  });

  it('once applied, the player\'s own changes stay', () => {
    const d = { ...DEFAULT_SETTINGS, ...presetValues('trackpad'), presetApplied: 'trackpad' as const, difficulty: 'tiro' as const, gore: 'normal' as const, lookSensitivity: 2.2 };
    expect(settingsFixups(d, 'trackpad')).toEqual({});
  });

  it('choosing another preset in the row rewrites the rows it owns', () => {
    const d = { ...DEFAULT_SETTINGS, ...presetValues('trackpad'), presetApplied: 'trackpad' as const, difficulty: 'normalis' as const, controlPreset: 'mouse' as const };
    const w = settingsFixups(d, 'trackpad');
    expect(w.presetApplied).toBe('mouse');
    expect(w.blockToggle).toBe(false);
    expect(w.clickAttacks).toBe(true);
    expect(w.lookSensitivity).toBe(1);
  });

  it('"Defaults" (the preset unset) goes back to the guessed preset', () => {
    const d = { ...DEFAULT_SETTINGS, presetApplied: 'trackpad' as const, difficulty: 'normalis' as const };
    const w = settingsFixups(d, 'trackpad');
    expect(w.controlPreset).toBe('trackpad');
    expect(w.lookSensitivity).toBe(1.6);
  });

  it('keeps the rows of players who picked a preset before this existed', () => {
    const d = { ...DEFAULT_SETTINGS, ...presetValues('trackpad'), presetPicked: true, lookSensitivity: 2.5, difficulty: 'difficilis' as const, gore: 'off' as const };
    expect(settingsFixups(d, 'mouse')).toEqual({ presetApplied: 'trackpad' });
  });

  it('a row reset to unset takes the preset value', () => {
    const d = { ...DEFAULT_SETTINGS, ...presetValues('keyboard'), presetApplied: 'keyboard' as const, difficulty: undefined, lockOnMode: undefined };
    expect(settingsFixups(d, 'mouse')).toEqual({ lockOnMode: 'auto', difficulty: 'normalis', gore: 'ultra' });
  });
});
