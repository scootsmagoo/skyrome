import { describe, expect, it } from 'vitest';
import { ESSENTIAL_ACTIONS } from './Input';
import { KeyRepeat, PAD, PAD_ACTIONS, PAD_MENU_KEYS, padButtonFor, padButtonLabel, padFamily, shapeStick } from './gamepad';

describe('gamepad helpers', () => {
  it('tells controller families from their ids', () => {
    expect(padFamily('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)')).toBe('playstation');
    expect(padFamily('054c-09cc-Wireless Controller')).toBe('playstation');
    expect(padFamily('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)')).toBe('xbox');
    expect(padFamily('Generic USB Joystick')).toBe('generic');
    expect(padButtonLabel(PAD.A, 'playstation')).toBe('✕');
    expect(padButtonLabel(PAD.RT, 'xbox')).toBe('RT');
  });

  it('shapes sticks: dead zone, rescale, keeps direction', () => {
    const o = { x: 0, y: 0 };
    expect(shapeStick(0.1, 0.05, 0.16, 1, o)).toEqual({ x: 0, y: 0 });
    shapeStick(1, 0, 0.16, 1, o);
    expect(o.x).toBeCloseTo(1);
    shapeStick(0, -0.58, 0.16, 1, o);
    expect(o.y).toBeCloseTo(-0.5);
    expect(o.x).toBe(0);
    // A curve gives finer control near the centre and still reaches 1.
    shapeStick(0.58, 0, 0.16, 2, o);
    expect(o.x).toBeCloseTo(0.25);
    shapeStick(0.7071, 0.7071, 0.12, 2, o);
    expect(Math.hypot(o.x, o.y)).toBeCloseTo(1, 3);
  });

  it('repeats a held direction after a delay', () => {
    const r = new KeyRepeat(0.4, 0.1);
    const fired: number[] = [];
    let t = 0;
    for (let i = 0; i < 60; i++) {
      if (r.step(true, 1 / 60)) fired.push(+t.toFixed(3));
      t += 1 / 60;
    }
    // The press, then about every 0.1 s from 0.4 s on.
    expect(fired[0]).toBe(0);
    expect(fired.length).toBe(1 + 6);
    expect(r.step(false, 1 / 60)).toBe(false);
    expect(r.step(true, 1 / 60)).toBe(true);
  });

  it('leaves no essential action without a button, and menus can confirm and go back', () => {
    const onPad = new Set(Object.values(PAD_ACTIONS));
    for (const a of ESSENTIAL_ACTIONS) {
      // Movement comes from the stick.
      if (a === 'forward' || a === 'back' || a === 'left' || a === 'right') continue;
      expect(onPad.has(a), a).toBe(true);
    }
    expect(PAD_MENU_KEYS[PAD.A]).toBe('Enter');
    expect(PAD_MENU_KEYS[PAD.B]).toBe('Escape');
    expect(padButtonFor('attack')).toBe(PAD.RT);
  });
});
