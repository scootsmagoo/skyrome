/**
 * Keyboard + pointer selection for a list of elements (menus can't rely on DOM focus because Tab
 * is a game key). Arrow keys move, Home/End jump, Enter/Space/E activate; hovering selects and
 * clicking activates, so every action works with a trackpad or keys alone.
 */
import { firstEnabled, stepIndex } from './models';

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

export class NavList {
  items: HTMLElement[] = [];
  index = -1;
  constructor(private readonly opts: NavListOptions = {}) {}

  get selected(): HTMLElement | undefined {
    return this.items[this.index];
  }

  isEnabled(i: number): boolean {
    const el = this.items[i];
    return !!el && !el.classList.contains('is-disabled') && !el.hasAttribute('disabled');
  }

  /** Replace the items (re-binds pointer handlers) and keep the index if possible. */
  set(items: HTMLElement[], keep = true) {
    this.items = items;
    items.forEach((el, i) => {
      el.onpointerenter = () => {
        if (this.opts.hoverSelects !== false && this.isEnabled(i)) this.select(i, false);
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
      if (!e.repeat) this.activate(e);
      return true;
    }
    return false;
  }
}
