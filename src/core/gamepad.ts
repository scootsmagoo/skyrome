/**
 * Gamepads: Xbox, PlayStation and other controllers the browser reports with the "standard"
 * mapping (Chrome, Safari including iOS, Firefox). Polled at the start of every frame as an
 * `InputSource` (core/Input.ts).
 *
 * - In play the left stick moves (pushed part way it walks), the right stick turns the camera, and
 *   each button holds an action directly (`PAD_ACTIONS`), so rebinding the keyboard never breaks
 *   the pad. The actions the interface opens from key events (pause, menu, wait) are sent as the
 *   key event of their first keyboard binding instead.
 * - In menus (gameplay input off: a menu, dialogue, the title) the pad sends ordinary key events
 *   (`PAD_MENU_KEYS`): the D-pad or left stick are the arrow keys, with key repeat; A confirms
 *   (Enter), B goes back (Escape), the bumpers switch tabs ([ and ]). Every screen that works with
 *   the keyboard works with the pad.
 * - A button sends its release to whatever its press went to, even when the mode changed between.
 * - Buttons are labelled for the controller in hand (`padFamily`: ✕ ○ □ △ on a PlayStation pad).
 */
import type { Action, Input, InputSource } from './Input';

declare module './Game' {
  interface Game {
    gamepad?: GamepadSource;
  }
}

/** Standard-mapping button indices (w3c.github.io/gamepad/#remapping). */
export const PAD = {
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
} as const;

/** In play: the action each button holds. */
export const PAD_ACTIONS: Readonly<Partial<Record<number, Action>>> = {
  [PAD.A]: 'interact',
  [PAD.B]: 'dodge',
  [PAD.X]: 'readyWeapon',
  [PAD.Y]: 'jump',
  [PAD.LB]: 'quickWheel',
  [PAD.RB]: 'invoke',
  [PAD.LT]: 'block',
  [PAD.RT]: 'attack',
  [PAD.VIEW]: 'menu',
  [PAD.MENU]: 'pause',
  [PAD.L3]: 'sprint',
  [PAD.R3]: 'toggleView',
  [PAD.UP]: 'lockOn',
  [PAD.DOWN]: 'sneak',
  [PAD.LEFT]: 'yield',
  [PAD.RIGHT]: 'wait',
};

/** In menus: the key each button sends. */
export const PAD_MENU_KEYS: Readonly<Partial<Record<number, string>>> = {
  [PAD.A]: 'Enter',
  [PAD.B]: 'Escape',
  [PAD.X]: 'KeyR', // take all, read, reset
  [PAD.Y]: 'KeyX', // drop, delete
  [PAD.LB]: 'BracketLeft',
  [PAD.RB]: 'BracketRight',
  [PAD.VIEW]: 'Tab',
  [PAD.MENU]: 'Escape',
  [PAD.UP]: 'ArrowUp',
  [PAD.DOWN]: 'ArrowDown',
  [PAD.LEFT]: 'ArrowLeft',
  [PAD.RIGHT]: 'ArrowRight',
};

/** Actions the interface opens from key events (UIManager), so the pad sends their key. */
const KEY_ACTIONS: ReadonlySet<Action> = new Set<Action>(['menu', 'pause', 'wait', 'inventory', 'journal', 'map', 'skills', 'quickSave', 'quickLoad']);

/** Stick tuning: radial dead zone, response exponent, full-tilt camera rates (rad/s). */
export const STICK = { moveDead: 0.16, lookDead: 0.12, lookCurve: 2, yawRate: 3.2, pitchRate: 2.0 };
/** Trigger thresholds with hysteresis (analog 0..1). */
const TRIGGER_ON = 0.35;
const TRIGGER_OFF = 0.2;
/** Menu key repeat while a direction is held: first repeat after `delay`, then every `every` (s). */
const REPEAT = { delay: 0.38, every: 0.11 };

export type PadFamily = 'xbox' | 'playstation' | 'generic';

// ------------------------------------------------------------------ pure helpers (unit-tested)

/** Which kind of controller a Gamepad.id names (Sony's vendor id is 054c, Microsoft's 045e). */
export function padFamily(id: string): PadFamily {
  // Xbox first: its pads are also called "Wireless Controller", which is all a PS4 pad says on some systems.
  if (/045e|xbox|xinput/i.test(id)) return 'xbox';
  if (/054c|dualsense|dualshock|playstation|wireless controller/i.test(id)) return 'playstation';
  return 'generic';
}

const XBOX_LABELS = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS', 'D-pad ↑', 'D-pad ↓', 'D-pad ←', 'D-pad →'];
const PS_LABELS = ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Create', 'Options', 'L3', 'R3', 'D-pad ↑', 'D-pad ↓', 'D-pad ←', 'D-pad →'];

/** The name printed on a button of this kind of controller. */
export function padButtonLabel(button: number, family: PadFamily): string {
  return (family === 'playstation' ? PS_LABELS : XBOX_LABELS)[button] ?? `Button ${button}`;
}

/** The button that does an action in play (undefined when no button does). */
export function padButtonFor(action: Action): number | undefined {
  for (const [b, a] of Object.entries(PAD_ACTIONS)) if (a === action) return Number(b);
  return undefined;
}

/**
 * Stick shaping: a radial dead zone (the stick's rest wobble reads as 0), the rest rescaled to
 * 0..1 so the first movement past the dead zone is small, raised to `curve` for fine control near
 * the centre. The direction is kept. Writes into `out`.
 */
export function shapeStick(x: number, y: number, dead: number, curve: number, out: { x: number; y: number }) {
  const m = Math.hypot(x, y);
  if (!(m > dead)) {
    out.x = out.y = 0;
    return out;
  }
  const t = Math.min(1, (m - dead) / (1 - dead));
  const k = Math.pow(t, curve) / m;
  out.x = x * k;
  out.y = y * k;
  return out;
}

/**
 * Menu repeat for a held direction: `step(held, dt)` returns true on the press and then after
 * `delay` s, every `every` s, while held. Pure.
 */
export class KeyRepeat {
  private t = -1;
  constructor(
    private readonly delay = REPEAT.delay,
    private readonly every = REPEAT.every,
  ) {}

  /** True when a key event is due (the first one is the press, later ones repeats). */
  step(held: boolean, dt: number): boolean {
    if (!held) {
      this.t = -1;
      return false;
    }
    if (this.t < 0) {
      this.t = 0;
      return true;
    }
    const before = this.t;
    this.t += dt;
    if (this.t < this.delay) return false;
    if (before < this.delay) return true;
    return Math.floor((this.t - this.delay) / this.every) > Math.floor((before - this.delay) / this.every);
  }
}

// ------------------------------------------------------------------ the source

/** What a held button's press went to, so its release goes to the same place. */
type Sent = { kind: 'action'; action: Action } | { kind: 'key'; code: string } | null;

const KEY_NAMES: Record<string, string> = {
  Enter: 'Enter', Escape: 'Escape', Tab: 'Tab', BracketLeft: '[', BracketRight: ']',
  ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', Backquote: '`',
};

function keyName(code: string): string {
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3).toLowerCase();
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

/** Send a key event as if the keyboard had (menus and the interface listen on window). */
export function sendKey(type: 'keydown' | 'keyup', code: string, repeat = false) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new KeyboardEvent(type, { code, key: keyName(code), repeat, bubbles: true, cancelable: true }));
}

const BUTTONS = 16;
const DIRS = [PAD.UP, PAD.DOWN, PAD.LEFT, PAD.RIGHT] as const;

export class GamepadSource implements InputSource {
  /** Camera speed multiplier for the right stick (settings may change it). */
  lookSpeed = 1;
  /** The controller in hand (labels). */
  family: PadFamily = 'generic';
  /** True while some controller is connected. */
  connected = false;
  private prev = new Array<boolean>(BUTTONS).fill(false);
  private sent: Sent[] = new Array<Sent>(BUTTONS).fill(null);
  private now = new Array<boolean>(BUTTONS).fill(false);
  private repeats = DIRS.map(() => new KeyRepeat());
  /** Menu directions held last frame (their key is down). */
  private dirHeld = DIRS.map(() => false);
  /** Directions held when the menus opened: ignored until let go. */
  private stale = DIRS.map(() => false);
  private wasMenus = false;
  private stick = { x: 0, y: 0 };
  private look = { x: 0, y: 0 };

  poll(input: Input, dt: number) {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const now = this.now;
    now.fill(false);
    let lx = 0, ly = 0, rx = 0, ry = 0, any = false;
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      if (!any) this.family = padFamily(gp.id);
      any = true;
      for (let b = 0; b < BUTTONS && b < gp.buttons.length; b++) {
        const btn = gp.buttons[b];
        if (b === PAD.LT || b === PAD.RT) now[b] ||= btn.value > (this.prev[b] ? TRIGGER_OFF : TRIGGER_ON) || (btn.pressed && btn.value === 0);
        else now[b] ||= btn.pressed;
      }
      // Several pads: the stick pushed furthest wins.
      const ax = gp.axes;
      if (ax.length >= 2 && Math.hypot(ax[0], ax[1]) > Math.hypot(lx, ly)) { lx = ax[0]; ly = ax[1]; }
      if (ax.length >= 4 && Math.hypot(ax[2], ax[3]) > Math.hypot(rx, ry)) { rx = ax[2]; ry = ax[3]; }
    }
    this.connected = any;
    if (!any) {
      this.releaseAll(input);
      return;
    }
    shapeStick(lx, ly, STICK.moveDead, 1, this.stick);
    shapeStick(rx, ry, STICK.lookDead, STICK.lookCurve, this.look);
    let active = this.stick.x !== 0 || this.stick.y !== 0 || this.look.x !== 0 || this.look.y !== 0;
    for (let b = 0; b < BUTTONS; b++) if (now[b] !== this.prev[b]) active = true;
    if (active) input.setDevice('gamepad');

    const menus = !input.enabled;
    // Buttons: presses go to the current mode, releases to wherever the press went.
    for (let b = 0; b < BUTTONS; b++) {
      const down = now[b];
      if (down === this.prev[b]) continue;
      this.prev[b] = down;
      if (!down) {
        this.release(input, b);
        continue;
      }
      if (menus && (DIRS as readonly number[]).includes(b)) continue; // the repeat below sends it
      this.press(input, b, menus);
    }

    if (menus) {
      input.setAnalogMove('pad', 0, 0);
      // D-pad or left stick (dominant axis, well past the dead zone): arrow keys with repeat.
      const sx = Math.abs(lx) > 0.55 && Math.abs(lx) > Math.abs(ly) ? Math.sign(lx) : 0;
      const sy = Math.abs(ly) > 0.55 && Math.abs(ly) >= Math.abs(lx) ? Math.sign(ly) : 0;
      const held = [now[PAD.UP] || sy < 0, now[PAD.DOWN] || sy > 0, now[PAD.LEFT] || sx < 0, now[PAD.RIGHT] || sx > 0];
      // A direction still held from play (walking into a conversation) counts once let go.
      for (let i = 0; i < DIRS.length; i++) {
        if (!this.wasMenus) this.stale[i] = held[i];
        else if (!held[i]) this.stale[i] = false;
        if (this.stale[i]) held[i] = false;
      }
      this.wasMenus = true;
      for (let i = 0; i < DIRS.length; i++) {
        const code = PAD_MENU_KEYS[DIRS[i]]!;
        const was = this.dirHeld[i];
        if (this.repeats[i].step(held[i], dt)) sendKey('keydown', code, was);
        if (was && !held[i]) sendKey('keyup', code);
        this.dirHeld[i] = held[i];
      }
      return;
    }
    this.wasMenus = false;
    this.releaseDirs(dt);
    // Play: left stick moves (+y is down on the stick = back), right stick turns the camera.
    input.setAnalogMove('pad', this.stick.x, this.stick.y);
    if (this.look.x || this.look.y) {
      // Its own speed: the look sensitivity setting is tuned per pointer preset (the trackpad's is 1.6x).
      const k = this.lookSpeed * dt;
      input.addLook(-this.look.x * STICK.yawRate * k, -this.look.y * STICK.pitchRate * k);
    }
  }

  private press(input: Input, b: number, menus: boolean) {
    if (menus) {
      const code = PAD_MENU_KEYS[b];
      if (!code) return;
      sendKey('keydown', code);
      this.sent[b] = { kind: 'key', code };
      return;
    }
    const action = PAD_ACTIONS[b];
    if (!action) return;
    if (KEY_ACTIONS.has(action)) {
      const code = input.bindings[action]?.find((c) => !c.startsWith('Mouse') && !c.startsWith('Wheel'));
      if (!code) return;
      sendKey('keydown', code);
      this.sent[b] = { kind: 'key', code };
      return;
    }
    input.holdAction(action, true);
    this.sent[b] = { kind: 'action', action };
  }

  private release(input: Input, b: number) {
    const s = this.sent[b];
    this.sent[b] = null;
    if (!s) return;
    if (s.kind === 'key') sendKey('keyup', s.code);
    else input.holdAction(s.action, false);
  }

  /** Let go of the menu arrow keys (leaving the menus, or the pad went away). */
  private releaseDirs(dt: number) {
    for (let i = 0; i < DIRS.length; i++) {
      this.repeats[i].step(false, dt);
      if (this.dirHeld[i]) sendKey('keyup', PAD_MENU_KEYS[DIRS[i]]!);
      this.dirHeld[i] = false;
    }
  }

  private releaseAll(input: Input) {
    for (let b = 0; b < BUTTONS; b++) {
      if (this.prev[b]) this.release(input, b);
      this.prev[b] = false;
    }
    this.releaseDirs(0);
    input.setAnalogMove('pad', 0, 0);
  }
}
