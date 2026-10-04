import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS, HOTBAR_ACTIONS, WheelAccumulator, capsLockToggled, keyLookEase, wheelPixels, type Action } from '../src/core/Input';
import { controlState, guessPreset, presetValues } from '../src/game/settings';
import { recenterYaw } from '../src/player/PlayerController';
import { wrapAngle } from '../src/core/math';

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
    for (const a of ['forward', 'back', 'left', 'right', 'jump', 'sprint', 'sneak', 'attack', 'block', 'readyWeapon', 'interact', 'toggleView', 'zoomIn', 'zoomOut', 'menu', 'pause', 'debug'] as Action[]) expect(b[a].length).toBeGreaterThan(0);
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

describe('third-person auto-recenter', () => {
  it('swings the camera behind the character, no faster than the max rate', () => {
    let yaw = 0;
    const heading = 1.2; // the camera belongs at heading + π
    const dt = 1 / 60;
    let maxStep = 0;
    for (let i = 0; i < 600; i++) {
      const next = recenterYaw(yaw, heading, dt, 1);
      maxStep = Math.max(maxStep, Math.abs(next - yaw));
      yaw = next;
    }
    expect(Math.abs(wrapAngle(yaw - (heading + Math.PI)))).toBeLessThan(1e-3);
    expect(maxStep).toBeLessThanOrEqual(1 * dt + 1e-9);
  });
});
