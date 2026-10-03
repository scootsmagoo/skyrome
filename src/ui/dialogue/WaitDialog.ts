/**
 * Wait / rest (T). Choose 1–24 hours with ←→ or the slider; Enter waits. The screen dims while
 * time passes, then game.time advances (or `sources.wait` does it, e.g. to also heal or rest; it
 * may refuse by returning a reason). Esc or closing during the dim cancels: no time passes.
 * UIManager refuses to open it in combat.
 */
import { BaseModal } from '../Modal';
import type { UIManager } from '../UIManager';
import { h, keycap, setText } from '../dom';
import { formatClock, romanHour } from '../format';

export class WaitDialog extends BaseModal {
  readonly id = 'wait';
  private hours = 1;
  private valEl = h('div', { class: 'wt-val sr-num' });
  private untilEl = h('div', { class: 'wt-until' });
  private fill = h('div', { class: 'fill' });
  private thumb = h('div', { class: 'thumb' });
  private slider = h('div', { class: 'sr-slider wt-slider' }, h('div', { class: 'track' }), this.fill, this.thumb);
  private busy = false;
  private timer = 0;
  private veil: HTMLElement | null = null;

  constructor() {
    super('wait-dialog');
  }

  override onOpen(ui: UIManager) {
    super.onOpen(ui);
    const t = ui.game.time;
    const rh = romanHour(t.hour);
    this.el.replaceChildren(
      h('div', { class: 'sr-backdrop' }),
      h(
        'div',
        { class: 'screen-panel sr-panel wait-panel' },
        h('div', { class: 'screen-title' }, h('span', { class: 'en' }, 'Wait'), h('span', { class: 'la' }, 'Exspecta')),
        h('div', { class: 'wt-now' }, h('div', { class: 'hour' }, `${rh.latin} · ${formatClock(t.hour)}`), h('div', { class: 'date' }, t.formatRoman())),
        this.valEl,
        h('div', { class: 'wt-row' }, h('span', { class: 'wt-end' }, '1'), this.slider, h('span', { class: 'wt-end' }, '24')),
        this.untilEl,
        h(
          'div',
          { class: 'wt-btns' },
          h('button', { class: 'sr-btn sr-btn-primary', on: { click: () => this.wait() } }, keycap('Enter', 'sr-key-sm'), 'Wait'),
          h('button', { class: 'sr-btn', on: { click: () => this.close() } }, keycap('Esc', 'sr-key-sm'), 'Cancel'),
        ),
      ),
    );
    const setFromX = (x: number) => {
      const r = this.slider.getBoundingClientRect();
      this.set(1 + Math.round(Math.max(0, Math.min(1, (x - r.left) / r.width)) * 23));
    };
    this.slider.addEventListener('pointerdown', (e) => {
      this.slider.setPointerCapture(e.pointerId);
      setFromX(e.clientX);
    });
    this.slider.addEventListener('pointermove', (e) => {
      if (this.slider.hasPointerCapture(e.pointerId)) setFromX(e.clientX);
    });
    this.set(this.hours);
  }

  private set(hours: number) {
    this.hours = Math.max(1, Math.min(24, hours));
    const t = (this.hours - 1) / 23;
    this.fill.style.width = `${t * 100}%`;
    this.thumb.style.left = `${t * 100}%`;
    setText(this.valEl, `${this.hours} ${this.hours === 1 ? 'hour' : 'hours'}`);
    const end = this.ui.game.time.hour + this.hours;
    const rh = romanHour(end);
    setText(this.untilEl, `Until ${rh.latin.toLowerCase()} · ${formatClock(end)}${end >= 24 ? ' tomorrow' : ''}`);
  }

  private wait() {
    if (this.busy) return;
    this.busy = true;
    this.veil = h('div', { class: 'wt-veil' });
    this.ui.overlayLayer.appendChild(this.veil);
    this.timer = window.setTimeout(() => {
      this.timer = 0;
      const { ui, hours } = this;
      const fn = ui.sources.wait;
      const result = fn ? fn(hours) : ui.game.time.advanceHours(hours);
      this.close();
      if (typeof result === 'string' || result === false) ui.flash(typeof result === 'string' ? result : 'You cannot wait now.');
      else ui.notify(`You waited ${hours} ${hours === 1 ? 'hour' : 'hours'}.`);
    }, 650);
  }

  onClose() {
    // Closed before the dim finished (Esc): cancel, so no time passes.
    if (this.timer) clearTimeout(this.timer);
    this.timer = 0;
    this.busy = false;
    const veil = this.veil;
    this.veil = null;
    if (veil) {
      veil.classList.add('is-out');
      setTimeout(() => veil.remove(), 700);
    }
  }

  onKey(e: KeyboardEvent): boolean {
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA': this.set(this.hours - (e.shiftKey ? 6 : 1)); return true;
      case 'ArrowRight': case 'KeyD': this.set(this.hours + (e.shiftKey ? 6 : 1)); return true;
      case 'ArrowUp': this.set(this.hours + 6); return true;
      case 'ArrowDown': this.set(this.hours - 6); return true;
      case 'Enter': case 'Space': case 'KeyE': if (!e.repeat) this.wait(); return true;
    }
    if (/^Digit[1-9]$/.test(e.code)) return this.set(Number(e.code.slice(5))), true;
    return false;
  }
}
