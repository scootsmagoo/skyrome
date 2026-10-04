/**
 * Keyboard / mouse / trackpad input mapped to named actions.
 *
 * - Gameplay code asks about actions, never raw keys: `input.down('attack')`, `input.pressed('jump')`.
 * - Edge queries (`pressed`/`released`) are valid for exactly one rendered frame; read them from
 *   `update()` (per frame), not from fixed-step code.
 * - Every mouse-button action also has a keyboard binding, because the owner plays on a Mac trackpad.
 * - Mouse look uses Pointer Lock (click the canvas). Arrow keys also turn the camera, with a short
 *   ease-in (GDD §4.3). The click that captures the pointer is swallowed: it never attacks (§4.1).
 * - The wheel steps the zoom through an accumulator with a threshold and a quiet-gap debounce, so
 *   a trackpad's momentum scrolling fires one step, not a burst (§4.2). Pinch (Chrome: ctrl+wheel,
 *   Safari: gesture events) zooms the camera and never the page.
 * - Caps Lock may be bound as an alternate toggle: macOS fires keydown when it turns on and keyup
 *   when it turns off, so either edge counts as one press (see `capsLockToggled`).
 * - Cmd+key (and Ctrl+key unless Ctrl is bound) is left to the browser: never an action, never
 *   prevented. Releasing Cmd releases every key, since macOS drops keyups while Cmd is down.
 */

export type Action =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'jump'
  | 'sprint'
  | 'walkToggle'
  | 'sneak'
  | 'attack'
  | 'block'
  | 'dodge'
  | 'parry'
  | 'lockOn'
  | 'yield'
  | 'readyWeapon'
  | 'interact'
  | 'invoke'
  | 'quickWheel'
  | 'hotbar1'
  | 'hotbar2'
  | 'hotbar3'
  | 'hotbar4'
  | 'hotbar5'
  | 'hotbar6'
  | 'hotbar7'
  | 'hotbar8'
  | 'wait'
  | 'toggleView'
  | 'shoulderSwap'
  | 'lookLeft'
  | 'lookRight'
  | 'lookUp'
  | 'lookDown'
  | 'zoomIn'
  | 'zoomOut'
  | 'menu'
  | 'inventory'
  | 'journal'
  | 'map'
  | 'skills'
  | 'pause'
  | 'quickSave'
  | 'quickLoad'
  | 'debug';

/** Binding codes are `KeyboardEvent.code` values plus `Mouse0..4`, `WheelUp`, `WheelDown`. */
export type Bindings = Record<Action, string[]>;

/** GDD §4.2 default bindings (keyboard + mouse). */
export const DEFAULT_BINDINGS: Bindings = {
  forward: ['KeyW'],
  back: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  // N, not Caps Lock (macOS reports Caps Lock as a latch); Caps Lock may be added as an alternate.
  walkToggle: ['KeyN'],
  sneak: ['KeyC'],
  attack: ['Mouse0', 'KeyF'],
  block: ['Mouse2', 'KeyQ'],
  // Combat (GDD §4.2): Option always dodges (Space dodges only in combat with a weapon drawn);
  // a separate parry key is optional and unbound; X locks on; hold Y yields.
  dodge: ['AltLeft'],
  parry: [],
  lockOn: ['KeyX'],
  yield: ['KeyY'],
  readyWeapon: ['KeyR'],
  interact: ['KeyE'],
  invoke: ['KeyZ'],
  quickWheel: ['KeyG'],
  hotbar1: ['Digit1'],
  hotbar2: ['Digit2'],
  hotbar3: ['Digit3'],
  hotbar4: ['Digit4'],
  hotbar5: ['Digit5'],
  hotbar6: ['Digit6'],
  hotbar7: ['Digit7'],
  hotbar8: ['Digit8'],
  wait: ['KeyT'],
  toggleView: ['KeyV'],
  shoulderSwap: ['KeyH'],
  lookLeft: ['ArrowLeft'],
  lookRight: ['ArrowRight'],
  lookUp: ['ArrowUp'],
  lookDown: ['ArrowDown'],
  zoomIn: ['WheelUp', 'Equal'],
  zoomOut: ['WheelDown', 'Minus'],
  menu: ['Tab'],
  inventory: ['KeyI'],
  journal: ['KeyJ'],
  map: ['KeyM'],
  skills: ['KeyK'],
  pause: ['Escape'],
  // P and L because Apple keyboards send media keys on F5/F9 unless fn is held.
  quickSave: ['F5', 'KeyP'],
  quickLoad: ['F9', 'KeyL'],
  debug: ['Backquote'],
};

/**
 * Actions the game can't be played without. A saved or edited binding set may never leave one of
 * these keyless (see `sanitizeBindings` and the Controls screen): a stray rebind once left
 * "Strafe right" without D, and since bindings persist, the key stayed dead.
 */
export const ESSENTIAL_ACTIONS: readonly Action[] = [
  'forward', 'back', 'left', 'right', 'jump', 'interact', 'attack', 'block', 'readyWeapon', 'toggleView', 'pause', 'menu',
];

export interface BindingRepair {
  action: Action;
  codes: string[];
}

/**
 * Repairs a saved binding set (player overrides merged over the defaults). Pure.
 * - Unknown actions and non-string or empty codes are dropped; duplicates within an action removed.
 * - An essential action left without keys gets its default keys back. A restored key is taken back
 *   from any NON-essential action that holds it; a key another essential action holds is not
 *   restored (unless nothing else is left, because a duplicate beats an unplayable game).
 * Returns the full binding set and what was repaired (empty when the input was healthy).
 */
export function sanitizeBindings(saved?: Partial<Record<string, unknown>> | null): { bindings: Bindings; repaired: BindingRepair[] } {
  const out = Object.fromEntries(Object.entries(DEFAULT_BINDINGS).map(([a, c]) => [a, [...c]])) as Bindings;
  for (const [a, v] of Object.entries(saved ?? {})) {
    if (!(a in DEFAULT_BINDINGS) || !Array.isArray(v)) continue;
    out[a as Action] = [...new Set(v.filter((c): c is string => typeof c === 'string' && c.length > 0))];
  }
  const essential = new Set<Action>(ESSENTIAL_ACTIONS);
  const repaired: BindingRepair[] = [];
  for (const action of ESSENTIAL_ACTIONS) {
    if (out[action].length > 0) continue;
    const heldByEssential = (code: string) => ESSENTIAL_ACTIONS.some((e) => e !== action && out[e].includes(code));
    let codes = DEFAULT_BINDINGS[action].filter((c) => !heldByEssential(c));
    if (codes.length === 0) codes = [...DEFAULT_BINDINGS[action]];
    for (const code of codes) {
      for (const a of Object.keys(out) as Action[]) {
        if (a !== action && !essential.has(a)) out[a] = out[a].filter((c) => c !== code);
      }
    }
    out[action] = codes;
    repaired.push({ action, codes });
  }
  return { bindings: out, repaired };
}

/** The hotbar actions in slot order (1–8). */
export const HOTBAR_ACTIONS = ['hotbar1', 'hotbar2', 'hotbar3', 'hotbar4', 'hotbar5', 'hotbar6', 'hotbar7', 'hotbar8'] as const satisfies readonly Action[];

/** Human-readable label for a binding code (for HUD prompts and the controls screen). */
export function codeLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = {
    Mouse0: 'Left click',
    Mouse1: 'Middle click',
    Mouse2: 'Right click',
    WheelUp: 'Scroll up',
    WheelDown: 'Scroll down',
    Space: 'Space',
    ShiftLeft: 'Shift',
    ShiftRight: 'Shift',
    ControlLeft: 'Ctrl',
    AltLeft: 'Option',
    AltRight: 'Option',
    CapsLock: 'Caps Lock',
    Escape: 'Esc',
    Backquote: '`',
    Equal: '=',
    Minus: '-',
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
  };
  return map[code] ?? code;
}

// ------------------------------------------------------------------ pure helpers (unit-tested)

/** Wheel delta in CSS pixels whatever the event's deltaMode (0 px, 1 lines, 2 pages). */
export function wheelPixels(deltaY: number, deltaMode = 0): number {
  return deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
}

/**
 * Turns a stream of wheel deltas into discrete zoom steps (GDD §4.2).
 *
 * - Deltas are summed; a step fires once the sum passes `threshold` (px), then the sum restarts.
 * - After a step the stream is locked: nothing more fires until the wheel has been quiet for
 *   `quietMs`. A trackpad flick (a ramp-up while the fingers move, then a long decaying momentum
 *   tail) is one stream, so it fires once.
 * - A deliberate, continued scroll re-arms the lock `quietMs` after the step when a delta is as
 *   strong as the stream's strongest so far (`rearmRatio` of the peak) *and* looks like a new
 *   push: a discrete notch (line/page deltas, or an event at least `notchGapMs` after the last
 *   one, as a mouse wheel sends them) or a delta rising again (a second flick). Momentum arrives
 *   every frame and only decays away from its peak, so it never re-arms; a mouse wheel rolled on
 *   keeps stepping, at most every `quietMs`.
 * - A reversal of direction starts a fresh sum; tiny jitter below `deadzone` is ignored.
 *
 * `push` returns -1 (scroll up = zoom in), +1 (scroll down = zoom out) or 0.
 */
export class WheelAccumulator {
  threshold = 60;
  quietMs = 250;
  deadzone = 0.5;
  /** A continued scroll re-arms when |delta| ≥ this fraction of the stream's peak |delta|. */
  rearmRatio = 0.8;
  /** Events this far apart are separate notches (trackpads send one per frame, ~16 ms). */
  notchGapMs = 50;
  private sum = 0;
  private prevMag = 0;
  private last = -Infinity;
  private lockedAt = -Infinity;
  private locked = false;
  private lockSign = 0;
  /** Largest |delta| of the current accumulation (before a step) or since the step (locked). */
  private peak = 0;

  /** `discrete`: the event came in lines or pages (a mouse wheel notch). */
  push(delta: number, timeMs: number, discrete = false): -1 | 0 | 1 {
    const gap = timeMs - this.last;
    this.last = timeMs;
    if (gap > this.quietMs) {
      this.locked = false;
      this.sum = 0;
      this.peak = 0;
      this.prevMag = 0;
    }
    if (!Number.isFinite(delta) || Math.abs(delta) < this.deadzone) return 0;
    const mag = Math.abs(delta);
    const prevMag = this.prevMag;
    this.prevMag = mag;
    if (this.locked) {
      const same = Math.sign(delta) === this.lockSign;
      const push = discrete || gap >= this.notchGapMs || mag > prevMag * 1.04;
      if (same && push && timeMs - this.lockedAt >= this.quietMs && mag >= this.rearmRatio * this.peak) {
        this.locked = false;
        this.sum = 0;
        this.peak = 0;
      } else {
        if (same) this.peak = Math.max(this.peak, mag);
        return 0;
      }
    }
    if (this.sum !== 0 && Math.sign(delta) !== Math.sign(this.sum)) {
      this.sum = 0;
      this.peak = 0;
    }
    this.sum += delta;
    this.peak = Math.max(this.peak, mag);
    if (Math.abs(this.sum) < this.threshold) return 0;
    const dir = this.sum < 0 ? -1 : 1;
    this.sum = 0;
    this.locked = true;
    this.lockedAt = timeMs;
    this.lockSign = dir;
    return dir;
  }

  reset() {
    this.sum = 0;
    this.peak = 0;
    this.prevMag = 0;
    this.locked = false;
    this.last = -Infinity;
  }
}

/**
 * Whether a Caps Lock key event toggles (GDD §4.2). macOS sends keydown when the lock turns on and
 * keyup when it turns off; Windows and Linux send both per press. Comparing the lock state before
 * and after makes either platform toggle exactly once per physical press. `next` is
 * `getModifierState('CapsLock')` (null when the browser can't tell: then only keydown counts).
 */
export function capsLockToggled(prev: boolean | null, next: boolean | null, type: 'keydown' | 'keyup'): boolean {
  if (next === null) return type === 'keydown';
  if (prev === null) return type === 'keydown';
  return prev !== next;
}

/** Arrow-key look ease-in: 0.15 at the first frame, smoothly to 1 after `easeIn` seconds. */
export function keyLookEase(heldS: number, easeIn: number): number {
  if (easeIn <= 0) return 1;
  const t = Math.min(1, Math.max(0, heldS / easeIn));
  return 0.15 + 0.85 * t * t * (3 - 2 * t);
}

const DEG = Math.PI / 180;
/** Modifier keys: they send their own keyup and never form a shortcut by themselves. */
const MODIFIER_CODES: ReadonlySet<string> = new Set([
  'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'OSLeft', 'OSRight', 'CapsLock', 'Fn',
]);
/** Pinch deltas are small (a few px per event); scale them up to wheel pixels. */
const PINCH_GAIN = 6;

export class Input {
  bindings: Bindings;
  /** Mouse look sensitivity (radians per pixel of pointer movement). */
  sensitivity = 0.0022;
  invertY = false;
  /** When false, gameplay actions read as idle (menus/dialogue own the input). */
  enabled = true;
  /** Codes that never register as presses (e.g. clicks in the Trackpad preset, GDD §4.3). */
  readonly ignoredCodes = new Set<string>();
  /** Arrow-key look (GDD §4.3 keyboard preset): yaw and pitch rates (rad/s) and ease-in (s). */
  keyLook = { yaw: 150 * DEG, pitch: 90 * DEG, easeIn: 0.25 };
  /** Pointer-look smoothing time constant in seconds (0 = raw; the Trackpad preset uses 0.08). */
  lookSmoothing = 0;
  /** Wheel → zoom steps. */
  readonly wheel = new WheelAccumulator();
  /** True if the pointer or the look keys turned the camera this frame (auto-recenter waits on it). */
  lookActive = false;

  private held = new Set<string>();
  private pressedCodes = new Set<string>();
  private releasedCodes = new Set<string>();
  /** Codes held for one frame only (wheel steps, Caps Lock edges). */
  private momentary = new Set<string>();
  private codeToActions = new Map<string, Action[]>();
  private lookX = 0;
  private lookY = 0;
  private velX = 0;
  private velY = 0;
  private keyLookHeld = 0;
  private locked = false;
  private capsOn: boolean | null = null;
  private gestureScale = 1;
  private lastGestureAt = -Infinity;
  private listeners: Array<() => void> = [];

  constructor(
    private readonly target: HTMLElement,
    bindings: Partial<Bindings> = {},
  ) {
    this.bindings = { ...DEFAULT_BINDINGS, ...bindings };
    this.rebuildIndex();
    this.attach();
  }

  setBindings(bindings: Partial<Bindings>) {
    this.bindings = { ...this.bindings, ...bindings };
    this.rebuildIndex();
  }

  /** True while any key/button bound to the action is held. */
  down(action: Action): boolean {
    if (!this.enabled && isGameplay(action)) return false;
    for (const c of this.bindings[action] ?? []) if (this.held.has(c)) return true;
    return false;
  }

  /** True on the frame the action was pressed. */
  pressed(action: Action): boolean {
    if (!this.enabled && isGameplay(action)) return false;
    for (const c of this.bindings[action] ?? []) if (this.pressedCodes.has(c)) return true;
    return false;
  }

  /** True on the frame the action was released. */
  released(action: Action): boolean {
    for (const c of this.bindings[action] ?? []) if (this.releasedCodes.has(c)) return true;
    return false;
  }

  /** True while a raw code is held (input lab, rebinding UI). */
  isHeld(code: string): boolean {
    return this.held.has(code);
  }

  /** -1..1 movement axes from WASD. */
  moveAxes(): { x: number; z: number } {
    const x = (this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0);
    const z = (this.down('back') ? 1 : 0) - (this.down('forward') ? 1 : 0);
    return { x, z };
  }

  /** Consume accumulated look delta (radians) since last call. Includes arrow-key turning. */
  consumeLook(dt: number): { yaw: number; pitch: number } {
    let mx = this.lookX;
    let my = this.lookY;
    this.lookX = this.lookY = 0;
    if (this.lookSmoothing > 0 && dt > 0) {
      // Low-pass the pointer velocity: trackpad jitter becomes smooth turning, and because the
      // filter has unity gain the total turn is unchanged (it only lags by ~lookSmoothing).
      const k = 1 - Math.exp(-dt / this.lookSmoothing);
      this.velX += (mx / dt - this.velX) * k;
      this.velY += (my / dt - this.velY) * k;
      mx = this.velX * dt;
      my = this.velY * dt;
      if (Math.abs(this.velX) < 0.5) this.velX = 0;
      if (Math.abs(this.velY) < 0.5) this.velY = 0;
    }
    let yaw = -mx * this.sensitivity;
    let pitch = -my * this.sensitivity * (this.invertY ? -1 : 1);
    if (this.enabled) {
      const l = this.down('lookLeft');
      const r = this.down('lookRight');
      const u = this.down('lookUp');
      const d = this.down('lookDown');
      this.keyLookHeld = l || r || u || d ? this.keyLookHeld + dt : 0;
      const ease = keyLookEase(this.keyLookHeld, this.keyLook.easeIn);
      if (l) yaw += this.keyLook.yaw * ease * dt;
      if (r) yaw -= this.keyLook.yaw * ease * dt;
      if (u) pitch += this.keyLook.pitch * ease * dt;
      if (d) pitch -= this.keyLook.pitch * ease * dt;
    } else {
      yaw = pitch = 0;
      this.velX = this.velY = 0;
      this.keyLookHeld = 0;
    }
    this.lookActive = Math.abs(yaw) > 1e-5 || Math.abs(pitch) > 1e-5;
    return { yaw, pitch };
  }

  get pointerLocked() {
    return this.locked;
  }

  requestPointerLock() {
    if (document.pointerLockElement === this.target) return;
    try {
      const p = (this.target as any).requestPointerLock?.({ unadjustedMovement: false });
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      /* Safari throws synchronously outside a user gesture */
    }
  }

  exitPointerLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Call once at the end of every rendered frame. */
  endFrame() {
    this.pressedCodes.clear();
    this.releasedCodes.clear();
    // Wheel "keys" and toggle edges are momentary.
    for (const c of this.momentary) this.held.delete(c);
    this.momentary.clear();
  }

  /** Simulate input (tests, automation, on-screen buttons). */
  simulate(code: string, isDown: boolean) {
    if (isDown) this.press(code);
    else this.release(code);
  }

  /** A one-frame press of a code (wheel steps, toggles) — also for automation. */
  pulse(code: string) {
    if (this.ignoredCodes.has(code)) return;
    this.pressedCodes.add(code);
    this.held.add(code);
    this.momentary.add(code);
  }

  dispose() {
    for (const off of this.listeners) off();
    this.listeners = [];
  }

  private rebuildIndex() {
    this.codeToActions.clear();
    for (const [action, codes] of Object.entries(this.bindings) as [Action, string[]][]) {
      for (const c of codes ?? []) {
        const list = this.codeToActions.get(c) ?? [];
        list.push(action);
        this.codeToActions.set(c, list);
      }
    }
  }

  private press(code: string) {
    if (this.ignoredCodes.has(code)) return;
    if (!this.held.has(code)) this.pressedCodes.add(code);
    this.held.add(code);
  }

  private release(code: string) {
    if (this.held.has(code)) this.releasedCodes.add(code);
    this.held.delete(code);
  }

  private zoomStep(delta: number, timeMs: number, discrete = false) {
    const step = this.wheel.push(delta, timeMs, discrete);
    if (step) this.pulse(step < 0 ? 'WheelUp' : 'WheelDown');
  }

  /** A browser/OS shortcut: Cmd+key, or Ctrl+key unless Ctrl is bound to an action. */
  private isShortcut(e: KeyboardEvent): boolean {
    if (MODIFIER_CODES.has(e.code)) return false;
    if (e.metaKey) return true;
    return e.ctrlKey && !this.codeToActions.has('ControlLeft') && !this.codeToActions.has('ControlRight');
  }

  private capsEdge(e: KeyboardEvent) {
    const next = typeof e.getModifierState === 'function' ? e.getModifierState('CapsLock') : null;
    if (capsLockToggled(this.capsOn, next, e.type === 'keyup' ? 'keyup' : 'keydown')) this.pulse('CapsLock');
    this.capsOn = next;
  }

  private attach() {
    const on = <K extends keyof WindowEventMap | 'pointerlockchange' | 'gesturestart' | 'gesturechange' | 'gestureend'>(
      el: Window | Document | HTMLElement,
      type: K,
      fn: (e: K extends keyof WindowEventMap ? WindowEventMap[K] : Event) => void,
      opts?: AddEventListenerOptions,
    ) => {
      el.addEventListener(type, fn as EventListener, opts);
      this.listeners.push(() => el.removeEventListener(type, fn as EventListener, opts));
    };

    on(window, 'keydown', (e) => {
      if (isTypingTarget(e.target)) return;
      // Cmd shortcuts (Cmd+R, Cmd+L, Cmd+F…) belong to the browser and are never game actions.
      if (this.isShortcut(e)) return;
      if (this.codeToActions.has(e.code)) {
        // Keep Tab/Space/arrows/F5 etc. from scrolling or reloading the page.
        e.preventDefault();
      }
      if (e.code === 'CapsLock') return this.capsEdge(e);
      if (typeof e.getModifierState === 'function') this.capsOn = e.getModifierState('CapsLock');
      if (e.repeat) return;
      this.press(e.code);
    });
    on(window, 'keyup', (e) => {
      if (e.code === 'CapsLock') return this.capsEdge(e);
      this.release(e.code);
      // macOS sends no keyup for a key released while Cmd is down, so letting go of Cmd lets go
      // of every key (a Cmd+D must not leave the character walking right).
      if (e.code === 'MetaLeft' || e.code === 'MetaRight' || e.key === 'Meta') {
        for (const c of [...this.held]) if (!c.startsWith('Mouse') && !MODIFIER_CODES.has(c)) this.release(c);
      }
    });
    on(window, 'blur', () => {
      for (const c of [...this.held]) this.release(c);
    });

    on(this.target, 'mousedown', (e) => {
      if (!this.locked) {
        // This click captures the mouse; it never attacks or blocks (GDD §4.1, AC-24).
        if (this.enabled) this.requestPointerLock();
        return;
      }
      this.press(`Mouse${e.button}`);
    });
    on(window, 'mouseup', (e) => this.release(`Mouse${e.button}`));
    on(this.target, 'contextmenu', (e) => e.preventDefault());
    on(window, 'mousemove', (e) => {
      if (!this.locked) return;
      // Clamp absurd spikes Chrome sometimes reports right after locking.
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.lookX += e.movementX;
      this.lookY += e.movementY;
    });
    on(
      this.target,
      'wheel',
      (e) => {
        e.preventDefault();
        const t = e.timeStamp || performance.now();
        // Safari reports a pinch as gesture events (handled below) and may echo it as ctrl+wheel.
        if (e.ctrlKey && t - this.lastGestureAt < 80) return;
        const px = wheelPixels(e.deltaY, e.deltaMode);
        this.zoomStep(e.ctrlKey ? px * PINCH_GAIN : px, t, e.deltaMode !== 0);
      },
      { passive: false },
    );
    // A pinch anywhere (menus included) must never zoom the page: Chrome sends ctrl+wheel...
    on(
      window,
      'wheel',
      (e) => {
        if (e.ctrlKey) e.preventDefault();
      },
      { passive: false },
    );
    // ...and Safari sends gesture events. Inside the view, the pinch zooms the camera instead.
    on(document, 'gesturestart', (e) => {
      e.preventDefault();
      this.gestureScale = 1;
      this.lastGestureAt = e.timeStamp || performance.now();
    });
    on(document, 'gesturechange', (e) => {
      e.preventDefault();
      const scale = (e as Event & { scale?: number }).scale ?? 1;
      const t = e.timeStamp || performance.now();
      this.lastGestureAt = t;
      if (e.target !== this.target || !(scale > 0)) return;
      // Spreading the fingers (scale up) zooms in, like scrolling up.
      const d = -Math.log(scale / this.gestureScale) * 400;
      this.gestureScale = scale;
      this.zoomStep(d, t);
    });
    on(document, 'gestureend', (e) => e.preventDefault());
    on(document, 'pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.target;
    });
  }
}

const NON_GAMEPLAY: ReadonlySet<Action> = new Set<Action>([
  'menu',
  'inventory',
  'journal',
  'map',
  'skills',
  'pause',
  'quickSave',
  'quickLoad',
  'debug',
]);

function isGameplay(action: Action) {
  return !NON_GAMEPLAY.has(action);
}

function isTypingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}
