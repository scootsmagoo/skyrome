/**
 * "How do you play?" — the control preset picker shown at first launch (GDD §4.3). Three big
 * cards: Mouse, Trackpad (preselected on a Mac, recommended for MacBooks) and Keyboard only.
 * ←→ or 1–3 choose, Enter confirms; a click picks directly. Settings → Controls changes it later.
 */
import { BaseModal } from '../ui/Modal';
import type { UIManager } from '../ui/UIManager';
import { h, keycap, setChildren } from '../ui/dom';
import { PRESETS, type ControlPreset } from './settings';
import './creation.css';

export class PresetPicker extends BaseModal {
  readonly id = 'preset-picker';
  override pauses = false;
  private index: number;
  private cards: HTMLElement[] = [];
  private cardsEl = h('div', { class: 'pp-cards' });

  constructor(
    initial: ControlPreset,
    private readonly onPick: (p: ControlPreset) => void,
  ) {
    super('preset-screen');
    this.index = Math.max(0, PRESETS.findIndex((p) => p.id === initial));
  }

  override onOpen(ui: UIManager) {
    super.onOpen(ui);
    this.cards = PRESETS.map((p, i) =>
      h(
        'div',
        { class: 'pp-card', on: { click: () => this.pick(i), pointermove: () => this.select(i) } },
        p.id === 'trackpad' ? h('span', { class: 'rec' }, 'Mac laptops') : null,
        h('div', { class: 'nm' }, `${i + 1} · ${p.label}`),
        h('div', { class: 'la' }, p.latin),
        h('div', { class: 'blurb' }, p.blurb),
        h('ul', null, p.points.map((t) => h('li', null, t))),
      ),
    );
    setChildren(this.cardsEl, this.cards);
    this.el.replaceChildren(
      h('div', { class: 'sr-backdrop' }),
      h(
        'div',
        { class: 'pp-panel sr-panel' },
        h('div', { class: 'pp-title' }, 'How do you play?'),
        h('div', { class: 'pp-sub' }, 'Quo modo ludis? — every action also has a key, whichever you choose.'),
        this.cardsEl,
        h(
          'div',
          { class: 'pp-foot' },
          h('div', { class: 'note' }, 'You can change this, the sensitivity and every key any time in Settings → Controls. Walking is N, not Caps Lock: on a Mac Caps Lock latches.'),
          h('div', { class: 'sr-hints' }, h('span', { class: 'sr-hint' }, keycap('←→'), 'Choose'), h('span', { class: 'sr-hint', on: { click: () => this.pick(this.index) } }, keycap('Enter'), 'Confirm')),
        ),
      ),
    );
    this.select(this.index);
  }

  private select(i: number) {
    this.index = (i + PRESETS.length) % PRESETS.length;
    this.cards.forEach((c, k) => c.classList.toggle('is-selected', k === this.index));
  }

  private pick(i: number) {
    this.select(i);
    this.close();
    this.onPick(PRESETS[this.index].id);
  }

  onKey(e: KeyboardEvent) {
    if (e.repeat) return true;
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.select(this.index - 1);
        return true;
      case 'ArrowRight':
      case 'KeyD':
        this.select(this.index + 1);
        return true;
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
        this.pick(Number(e.code.slice(5)) - 1);
        return true;
      case 'Enter':
      case 'NumpadEnter':
      case 'Space':
      case 'KeyE':
        this.pick(this.index);
        return true;
    }
    return true;
  }

  onEscape() {
    this.pick(this.index);
    return false;
  }

  onAction() {
    return true;
  }
}
