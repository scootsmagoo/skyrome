/**
 * Keyboard + pointer selection for a list of elements (menus can't rely on DOM focus because Tab
 * is a game key). Arrow keys move, Home/End jump, Enter/Space/E activate; moving the pointer over
 * a row selects it and clicking activates, so every action works with a trackpad or keys alone.
 *
 * Hover only selects after the pointer really moves. Browsers fire pointer events at a resting
 * cursor when the rows under it are rebuilt (sorting, buying, a re-render), and those must not
 * steal the selection the player made with the keyboard.
 */
import { firstEnabled, stepIndex } from './models';

/**
 * Tells real pointer movement from the synthetic events a browser fires when content changes under
 * a resting cursor: those repeat the last position. `moves` counts real moves.
 */
export class PointerGate {
  private x = NaN;
  private y = NaN;
  moves = 0;

  /** Record a pointer position; returns true when it is a real move. */
  move(x: number, y: number): boolean {
    if (x === this.x && y === this.y) return false;
    const first = Number.isNaN(this.x);
    this.x = x;
    this.y = y;
    // The first event only tells us where the cursor rests.
    if (!first) this.moves++;
    return !first;
  }
}

/** Shared by every list: one capture listener sees each move before any row handler does. */
export const pointerGate = new PointerGate();
if (typeof window !== 'undefined') {
  window.addEventListener('pointermove', (e) => pointerGate.move(e.clientX, e.clientY), { capture: true, passive: true });
}

export interface NavListOptions {
  onSelect?(index: number): void;
  onActivate?(index: number, e?: Event): void;
  wrap?: boolean;
  /** Keys that move the selection (default ArrowUp/ArrowDown). */
  axis?: 'vertical' | 'horizontal';
  /** Select on hover (default true). */
  hoverSelects?: boolean;
  /** Activation keys (default Enter, Space, E). */
  activateKeys?: string[];
}

/** The element surface NavList needs (lets tests use plain objects). */
export interface NavItem {
  classList: { add(c: string): void; remove(c: string): void; contains(c: string): boolean };
  hasAttribute(name: string): boolean;
  scrollIntoView(opts?: ScrollIntoViewOptions): void;
  onpointermove: ((e: PointerEvent) => void) | null;
  onclick: ((e: PointerEvent) => void) | null;
}

export class NavList<T extends NavItem = HTMLElement> {
  items: T[] = [];
  index = -1;
  /** `pointerGate.moves` when the keyboard (or a rebuild) last placed the selection. */
  private keyboardAt = -1;
  constructor(
    private readonly opts: NavListOptions = {},
    private readonly gate: PointerGate = pointerGate,
  ) {}

  get selected(): T | undefined {
    return this.items[this.index];
  }

  isEnabled(i: number): boolean {
    const el = this.items[i];
    return !!el && !el.classList.contains('is-disabled') && !el.hasAttribute('disabled');
  }

  /** Replace the items (re-binds pointer handlers) and keep the index if possible. */
  set(items: T[], keep = true) {
    this.items = items;
    // Rows rebuilt under a resting cursor must not take the selection.
    this.keyboardAt = this.gate.moves;
    items.forEach((el, i) => {
      el.onpointermove = () => {
        if (this.opts.hoverSelects === false || this.gate.moves === this.keyboardAt) return;
        if (this.index !== i && this.isEnabled(i)) this.select(i, false);
      };
      el.onclick = (e) => {
        if (!this.isEnabled(i)) return;
        this.select(i, false);
        this.opts.onActivate?.(i, e);
      };
    });
    const start = keep ? Math.min(Math.max(this.index, 0), items.length - 1) : 0;
    this.index = -1;
    const i = firstEnabled(items.length, (k) => this.isEnabled(k), start);
    if (i >= 0) this.select(i, false);
  }

  select(i: number, scroll = true) {
    if (i < 0 || i >= this.items.length) return;
    if (this.index === i && this.items[i].classList.contains('is-selected')) return;
    this.items[this.index]?.classList.remove('is-selected');
    this.index = i;
    const el = this.items[i];
    el.classList.add('is-selected');
    if (scroll) el.scrollIntoView({ block: 'nearest' });
    this.opts.onSelect?.(i);
  }

  move(delta: number) {
    this.keyboardAt = this.gate.moves;
    const i = stepIndex(this.index, delta, this.items.length, (k) => this.isEnabled(k), this.opts.wrap ?? false);
    if (i >= 0) this.select(i);
  }

  activate(e?: Event) {
    if (this.index >= 0 && this.isEnabled(this.index)) this.opts.onActivate?.(this.index, e);
  }

  /** Clear the visible selection (when another list takes over). */
  blur() {
    this.items[this.index]?.classList.remove('is-selected');
  }

  focus() {
    this.keyboardAt = this.gate.moves;
    if (this.index >= 0) this.items[this.index]?.classList.add('is-selected');
    else this.set(this.items, false);
  }

  handleKey(e: KeyboardEvent): boolean {
    const vertical = (this.opts.axis ?? 'vertical') === 'vertical';
    const prev = vertical ? 'ArrowUp' : 'ArrowLeft';
    const next = vertical ? 'ArrowDown' : 'ArrowRight';
    const keys = this.opts.activateKeys ?? ['Enter', 'Space', 'KeyE', 'NumpadEnter'];
    switch (e.code) {
      case prev: this.move(-1); return true;
      case next: this.move(1); return true;
      case 'Home': this.move(-this.items.length); return true;
      case 'End': this.move(this.items.length); return true;
      case 'PageUp': this.move(-8); return true;
      case 'PageDown': this.move(8); return true;
    }
    if (keys.includes(e.code)) {
      // Acting on the keyboard selection also makes it the keyboard's.
      this.keyboardAt = this.gate.moves;
      if (!e.repeat) this.activate(e);
      return true;
    }
    return false;
  }
}
