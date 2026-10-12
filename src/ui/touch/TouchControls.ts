/**
 * On-screen controls for phones and tablets: a floating thumbstick on the left half of the screen
 * (it appears under the thumb), drag anywhere else to look, and buttons on the right for the
 * actions. An `InputSource` (core/Input.ts): the stick and the drags feed the analog move and look,
 * the buttons hold their actions directly (`holdAction`) or, for the ones the interface opens from
 * a key (pause, menu, map), send that key.
 *
 * Shown while the player is on a touch device (`input.device`, set by the first touch, or by a
 * coarse pointer at startup) and gameplay input is on; menus, dialogue and the title are plain DOM
 * and take taps as clicks. The layer sits between the 3D view and the interface (whose empty parts
 * let touches through), and swallows its touches: no compatibility mouse events reach the canvas.
 */
import type { Game } from '../../core/Game';
import type { Action, Input, InputSource } from '../../core/Input';
import { sendKey } from '../../core/gamepad';
import { ITEM_ICONS, iconSvg } from '../icons';
import { TOUCH_NAMES } from '../prompts';
import { h, setClass } from '../dom';
import './touch.css';

declare module '../../core/Game' {
  interface Game {
    touch?: TouchControls;
  }
}

/** Thumbstick radius (CSS px) and the push below which it reads as centred. */
const STICK_R = 56;
const STICK_DEAD = 0.12;
/** Camera turn per CSS px of drag (radians; its own: the look sensitivity setting is tuned per pointer preset). */
const LOOK_PER_PX = 0.0062;

interface ButtonDef {
  id: string;
  label: string;
  /** Held directly while touched. */
  action?: Action;
  /** Opened by the interface from a key: send the key of the action's first keyboard binding. */
  keyAction?: Action;
  icon?: string;
}

const MAIN: ButtonDef[] = [
  { id: 'attack', label: TOUCH_NAMES.attack!, action: 'attack', icon: iconSvg(ITEM_ICONS.blade, 'touch-icon') },
  { id: 'block', label: TOUCH_NAMES.block!, action: 'block', icon: iconSvg(ITEM_ICONS.shield, 'touch-icon') },
  { id: 'jump', label: TOUCH_NAMES.jump!, action: 'jump' },
  { id: 'dodge', label: TOUCH_NAMES.dodge!, action: 'dodge' },
  { id: 'interact', label: TOUCH_NAMES.interact!, action: 'interact' },
];

const SIDE: ButtonDef[] = [
  { id: 'ready', label: TOUCH_NAMES.readyWeapon!, action: 'readyWeapon' },
  { id: 'sprint', label: TOUCH_NAMES.sprint!, action: 'sprint' },
  { id: 'sneak', label: TOUCH_NAMES.sneak!, action: 'sneak' },
  { id: 'view', label: TOUCH_NAMES.toggleView!, action: 'toggleView' },
  { id: 'lock', label: TOUCH_NAMES.lockOn!, action: 'lockOn' },
];

const TOP: ButtonDef[] = [
  { id: 'pause', label: 'II', keyAction: 'pause' },
  { id: 'menu', label: '☰', keyAction: 'menu' },
  { id: 'map', label: TOUCH_NAMES.map!, keyAction: 'map' },
];

/** Keep a finger's moves and release coming to `el` (refused for a pointer the browser no longer tracks). */
function capture(el: Element, pointerId: number) {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    /* not an active pointer: its events still arrive while over the element */
  }
}

/** True when the device's main pointer is a finger (phones, tablets without a mouse). */
export function coarsePointer(): boolean {
  if (typeof matchMedia !== 'function') return false;
  return matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
}

/**
 * Thumbstick output for a finger `dx`, `dy` (CSS px) from the stick's centre: -1..1 each, with a
 * small dead zone and the length capped at 1 (+x right, +z down the screen = back). Pure.
 */
export function stickAxes(dx: number, dy: number, radius = STICK_R, dead = STICK_DEAD): { x: number; z: number } {
  const m = Math.hypot(dx, dy) / radius;
  if (m <= dead) return { x: 0, z: 0 };
  const k = Math.min(1, (m - dead) / (1 - dead)) / m / radius;
  return { x: dx * k, z: dy * k };
}

export class TouchControls implements InputSource {
  readonly root: HTMLDivElement;
  private stickBase: HTMLDivElement;
  private stickKnob: HTMLDivElement;
  private buttons = new Map<string, HTMLElement>();
  private stickId = -1;
  private stickX = 0;
  private stickY = 0;
  private lookId = -1;
  private lookX = 0;
  private lookY = 0;
  /** Pointer id → the button it holds. */
  private held = new Map<number, { def: ButtonDef; code?: string }>();
  private visible = false;
  private offs: Array<() => void> = [];

  constructor(private readonly game: Game) {
    const mk = (d: ButtonDef, cls: string) => {
      const el = h('div', { class: `touch-btn ${cls} touch-${d.id}`, 'aria-label': d.label, role: 'button' });
      if (d.icon) el.innerHTML = d.icon;
      el.appendChild(h('span', { class: 'touch-label' }, d.label));
      el.addEventListener('pointerdown', (e) => this.onButtonDown(e, d, el));
      el.addEventListener('pointerup', (e) => this.onButtonUp(e));
      el.addEventListener('pointercancel', (e) => this.onButtonUp(e));
      el.addEventListener('lostpointercapture', (e) => this.onButtonUp(e));
      this.buttons.set(d.id, el);
      return el;
    };
    this.stickKnob = h('div', { class: 'touch-knob' });
    this.stickBase = h('div', { class: 'touch-stick' }, this.stickKnob);
    this.root = h(
      'div',
      { class: 'touch-root is-hidden' },
      this.stickBase,
      h('div', { class: 'touch-main' }, ...MAIN.map((d) => mk(d, 'touch-big'))),
      h('div', { class: 'touch-side' }, ...SIDE.map((d) => mk(d, 'touch-small'))),
      h('div', { class: 'touch-top' }, ...TOP.map((d) => mk(d, 'touch-small'))),
    );
    // Touches on the open area: the left part moves, the rest looks.
    this.root.addEventListener('pointerdown', (e) => this.onAreaDown(e));
    this.root.addEventListener('pointermove', (e) => this.onAreaMove(e));
    this.root.addEventListener('pointerup', (e) => this.onAreaUp(e));
    this.root.addEventListener('pointercancel', (e) => this.onAreaUp(e));
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    // Above the 3D view, below the interface.
    game.canvas.insertAdjacentElement('afterend', this.root);

    // Any touch makes this a touch device; a mouse or keys make it something else again (Input).
    const onAnyDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') game.input.setDevice('touch');
    };
    window.addEventListener('pointerdown', onAnyDown, { capture: true, passive: true });
    this.offs.push(() => window.removeEventListener('pointerdown', onAnyDown, { capture: true }));
    const onResize = () => {
      if (this.visible && this.stickId < 0) this.restStick();
    };
    window.addEventListener('resize', onResize);
    this.offs.push(() => window.removeEventListener('resize', onResize));
    if (coarsePointer()) game.input.setDevice('touch');
    this.offs.push(game.input.addSource(this));
  }

  poll(input: Input) {
    const show = input.device === 'touch' && input.enabled;
    if (show !== this.visible) {
      this.visible = show;
      setClass(this.root, 'is-hidden', !show);
      if (!show) this.releaseAll();
      else this.restStick(); // measured while shown (a hidden layer has no size)
    }
    if (!show) return;
    // The Use button lights up when there is something to use.
    const focus = (this.game as Game & { interactions?: { focus: unknown } }).interactions?.focus;
    setClass(this.buttons.get('interact')!, 'is-ready', !!focus);
    setClass(this.buttons.get('sneak')!, 'is-on', !!this.game.player?.sneaking);
    setClass(this.buttons.get('sprint')!, 'is-on', !!this.game.player?.sprinting);
  }

  dispose() {
    this.releaseAll();
    for (const off of this.offs) off();
    this.root.remove();
  }

  // ------------------------------------------------------------------ the open area

  private onAreaDown(e: PointerEvent) {
    if (e.target !== this.root) return; // a button's own handler has it
    e.preventDefault();
    const r = this.root.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (this.stickId < 0 && x < r.width * 0.45 && y > r.height * 0.25) {
      this.stickId = e.pointerId;
      // The stick comes to the thumb (kept clear of the edges).
      this.stickX = Math.min(Math.max(x, STICK_R + 8), r.width - STICK_R - 8);
      this.stickY = Math.min(Math.max(y, STICK_R + 8), r.height - STICK_R - 8);
      this.placeStick(true);
      this.moveStick(x, y);
    } else if (this.lookId < 0) {
      this.lookId = e.pointerId;
      this.lookX = e.clientX;
      this.lookY = e.clientY;
    } else return;
    capture(this.root, e.pointerId);
  }

  private onAreaMove(e: PointerEvent) {
    if (e.pointerId === this.stickId) {
      const r = this.root.getBoundingClientRect();
      this.moveStick(e.clientX - r.left, e.clientY - r.top);
    } else if (e.pointerId === this.lookId) {
      const dx = e.clientX - this.lookX;
      const dy = e.clientY - this.lookY;
      this.lookX = e.clientX;
      this.lookY = e.clientY;
      this.game.input.addLook(-dx * LOOK_PER_PX, -dy * LOOK_PER_PX);
    }
  }

  private onAreaUp(e: PointerEvent) {
    if (e.pointerId === this.stickId) {
      this.stickId = -1;
      this.game.input.setAnalogMove('touch', 0, 0);
      this.restStick();
    } else if (e.pointerId === this.lookId) this.lookId = -1;
  }

  private moveStick(x: number, y: number) {
    let dx = x - this.stickX;
    let dy = y - this.stickY;
    const m = Math.hypot(dx, dy);
    if (m > STICK_R) {
      dx *= STICK_R / m;
      dy *= STICK_R / m;
    }
    this.stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    const a = stickAxes(dx, dy);
    this.game.input.setAnalogMove('touch', a.x, a.z);
  }

  private placeStick(active: boolean) {
    this.stickBase.style.left = `${this.stickX - STICK_R}px`;
    this.stickBase.style.top = `${this.stickY - STICK_R}px`;
    setClass(this.stickBase, 'is-active', active);
  }

  /** The stick's resting place: bottom left, faint, to show where to put a thumb. */
  private restStick() {
    const r = this.root.getBoundingClientRect();
    // Right of the minimap (bottom left).
    this.stickX = Math.max(STICK_R + 150, r.width * 0.24);
    this.stickY = r.height - STICK_R - 48;
    this.stickKnob.style.transform = '';
    this.placeStick(false);
  }

  // ------------------------------------------------------------------ buttons

  private onButtonDown(e: PointerEvent, d: ButtonDef, el: HTMLElement) {
    e.preventDefault();
    e.stopPropagation();
    if (this.held.has(e.pointerId)) return;
    capture(el, e.pointerId);
    setClass(el, 'is-down', true);
    if (d.action) {
      this.game.input.holdAction(d.action, true);
      this.held.set(e.pointerId, { def: d });
    } else if (d.keyAction) {
      const code = this.game.input.bindings[d.keyAction]?.find((c) => !c.startsWith('Mouse') && !c.startsWith('Wheel'));
      if (code) sendKey('keydown', code);
      this.held.set(e.pointerId, { def: d, code });
    }
  }

  private onButtonUp(e: PointerEvent) {
    const held = this.held.get(e.pointerId);
    if (!held) return;
    this.held.delete(e.pointerId);
    this.releaseButton(held);
  }

  private releaseButton(held: { def: ButtonDef; code?: string }) {
    setClass(this.buttons.get(held.def.id)!, 'is-down', false);
    if (held.def.action) this.game.input.holdAction(held.def.action, false);
    else if (held.code) sendKey('keyup', held.code);
  }

  private releaseAll() {
    for (const held of this.held.values()) this.releaseButton(held);
    this.held.clear();
    if (this.stickId >= 0) {
      this.stickId = -1;
      this.restStick();
    }
    this.lookId = -1;
    this.game.input.setAnalogMove('touch', 0, 0);
  }
}
