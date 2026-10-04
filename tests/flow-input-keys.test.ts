import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Input } from '../src/core/Input';

// Input listens on window, document and its target; Node's EventTarget stands in for all three.
const g = globalThis as unknown as Record<string, unknown>;
let saved: Record<string, unknown>;
let target: EventTarget;

beforeEach(() => {
  saved = { window: g.window, document: g.document };
  g.window = new EventTarget();
  g.document = new EventTarget();
  target = new EventTarget();
});
afterEach(() => {
  g.window = saved.window;
  g.document = saved.document;
});

function key(type: 'keydown' | 'keyup', code: string, mods: { metaKey?: boolean; ctrlKey?: boolean } = {}) {
  const e = new Event(type, { cancelable: true });
  Object.assign(e, { code, key: code.startsWith('Meta') ? 'Meta' : code, repeat: false, metaKey: !!mods.metaKey, ctrlKey: !!mods.ctrlKey, getModifierState: () => false });
  (g.window as EventTarget).dispatchEvent(e);
  return e;
}

describe('Cmd shortcuts on macOS', () => {
  it('Cmd+R, Cmd+P, Cmd+L and Cmd+F reach the browser and are not game actions', () => {
    const input = new Input(target as unknown as HTMLElement);
    for (const code of ['KeyR', 'KeyP', 'KeyL', 'KeyF', 'KeyI', 'F5']) {
      const e = key('keydown', code, { metaKey: true });
      expect(e.defaultPrevented, code).toBe(false);
      expect(input.isHeld(code), code).toBe(false);
    }
    expect(input.pressed('quickSave')).toBe(false);
    expect(input.pressed('attack')).toBe(false);
    input.dispose();
  });

  it('plain keys still work and are kept from the page', () => {
    const input = new Input(target as unknown as HTMLElement);
    const e = key('keydown', 'KeyP');
    expect(e.defaultPrevented).toBe(true);
    expect(input.pressed('quickSave')).toBe(true);
    input.dispose();
  });

  it('letting go of Cmd releases keys whose keyup macOS swallowed', () => {
    const input = new Input(target as unknown as HTMLElement);
    key('keydown', 'KeyD'); // walking right…
    key('keydown', 'MetaLeft', { metaKey: true }); // …Cmd goes down, D is released (no keyup)…
    expect(input.down('right')).toBe(true);
    key('keyup', 'MetaLeft'); // …Cmd comes up
    expect(input.down('right')).toBe(false);
    input.dispose();
  });

  it('Ctrl+key is a shortcut unless Ctrl is bound (then Ctrl+W still walks)', () => {
    const input = new Input(target as unknown as HTMLElement);
    key('keydown', 'KeyW', { ctrlKey: true });
    expect(input.down('forward')).toBe(false);
    input.setBindings({ sneak: ['ControlLeft'] });
    key('keydown', 'ControlLeft', { ctrlKey: true });
    key('keydown', 'KeyW', { ctrlKey: true });
    expect(input.down('sneak')).toBe(true);
    expect(input.down('forward')).toBe(true);
    input.dispose();
  });
});
