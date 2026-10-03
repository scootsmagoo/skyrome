/**
 * Keyboard / mouse / trackpad input mapped to named actions.
 *
 * - Gameplay code asks about actions, never raw keys: `input.down('attack')`, `input.pressed('jump')`.
 * - Edge queries (`pressed`/`released`) are valid for exactly one rendered frame; read them from
 *   `update()` (per frame), not from fixed-step code.
 * - Every mouse-button action also has a keyboard binding, because the owner plays on a Mac trackpad.
 * - Mouse look uses Pointer Lock (click the canvas). Arrow keys also turn the camera.
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
  | 'toggleView'
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

export const DEFAULT_BINDINGS: Bindings = {
  forward: ['KeyW'],
  back: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  walkToggle: ['CapsLock'],
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
  toggleView: ['KeyV'],
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
  quickSave: ['F5'],
  quickLoad: ['F9'],
  debug: ['Backquote'],
};

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

export class Input {
  bindings: Bindings;
  /** Mouse look sensitivity (radians per pixel of pointer movement). */
  sensitivity = 0.0022;
  invertY = false;
  /** When false, gameplay actions read as idle (menus/dialogue own the input). */
  enabled = true;

  private held = new Set<string>();
  private pressedCodes = new Set<string>();
  private releasedCodes = new Set<string>();
  private codeToActions = new Map<string, Action[]>();
  private lookX = 0;
  private lookY = 0;
  private locked = false;
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
    for (const c of this.bindings[action]) if (this.held.has(c)) return true;
    return false;
  }

  /** True on the frame the action was pressed. */
  pressed(action: Action): boolean {
    if (!this.enabled && isGameplay(action)) return false;
    for (const c of this.bindings[action]) if (this.pressedCodes.has(c)) return true;
    return false;
  }

  /** True on the frame the action was released. */
  released(action: Action): boolean {
    for (const c of this.bindings[action]) if (this.releasedCodes.has(c)) return true;
    return false;
  }

  /** -1..1 movement axes from WASD. */
  moveAxes(): { x: number; z: number } {
    const x = (this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0);
    const z = (this.down('back') ? 1 : 0) - (this.down('forward') ? 1 : 0);
    return { x, z };
  }

  /** Consume accumulated look delta (radians) since last call. Includes arrow-key turning. */
  consumeLook(dt: number): { yaw: number; pitch: number } {
    let yaw = -this.lookX * this.sensitivity;
    let pitch = -this.lookY * this.sensitivity * (this.invertY ? -1 : 1);
    this.lookX = this.lookY = 0;
    if (this.enabled) {
      const keyTurn = 2.2 * dt; // rad/s for arrow keys
      if (this.down('lookLeft')) yaw += keyTurn;
      if (this.down('lookRight')) yaw -= keyTurn;
      if (this.down('lookUp')) pitch += keyTurn * 0.7;
      if (this.down('lookDown')) pitch -= keyTurn * 0.7;
    } else {
      yaw = pitch = 0;
    }
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
    // Wheel "keys" are momentary.
    this.held.delete('WheelUp');
    this.held.delete('WheelDown');
  }

  /** Simulate input (tests, automation, on-screen buttons). */
  simulate(code: string, isDown: boolean) {
    if (isDown) this.press(code);
    else this.release(code);
  }

  dispose() {
    for (const off of this.listeners) off();
    this.listeners = [];
  }

  private rebuildIndex() {
    this.codeToActions.clear();
    for (const [action, codes] of Object.entries(this.bindings) as [Action, string[]][]) {
      for (const c of codes) {
        const list = this.codeToActions.get(c) ?? [];
        list.push(action);
        this.codeToActions.set(c, list);
      }
    }
  }

  private press(code: string) {
    if (!this.held.has(code)) this.pressedCodes.add(code);
    this.held.add(code);
  }

  private release(code: string) {
    if (this.held.has(code)) this.releasedCodes.add(code);
    this.held.delete(code);
  }

  private attach() {
    const on = <K extends keyof WindowEventMap | 'pointerlockchange'>(
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
      if (this.codeToActions.has(e.code)) {
        // Keep Tab/Space/arrows/F5 etc. from scrolling or reloading the page.
        e.preventDefault();
      }
      if (e.repeat) return;
      this.press(e.code);
    });
    on(window, 'keyup', (e) => this.release(e.code));
    on(window, 'blur', () => {
      for (const c of [...this.held]) this.release(c);
    });

    on(this.target, 'mousedown', (e) => {
      this.press(`Mouse${e.button}`);
      if (!this.locked && this.enabled) this.requestPointerLock();
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
        if (Math.abs(e.deltaY) < 2) return;
        this.press(e.deltaY < 0 ? 'WheelUp' : 'WheelDown');
      },
      { passive: false },
    );
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
