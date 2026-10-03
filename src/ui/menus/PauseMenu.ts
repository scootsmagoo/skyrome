/** Pause menu (Esc): Resume · Save · Load · Settings · Controls · Credits · Quit to Title. */
import { BaseModal } from '../Modal';
import type { UIManager } from '../UIManager';
import { h, keycap } from '../dom';
import { formatClock, romanHour } from '../format';
import { spqrCrest } from '../motifs';
import { NavList } from '../nav';
import './menus.css';

interface Item {
  label: string;
  latin: string;
  run: () => void;
  enabled?: () => boolean;
}

export class PauseMenu extends BaseModal {
  readonly id = 'pause';
  private nav = new NavList({ onActivate: (i) => this.items[i].run(), wrap: true });
  private items: Item[] = [];

  constructor() {
    super('pause-menu');
  }

  override onOpen(ui: UIManager) {
    super.onOpen(ui);
    const saves = () => !!ui.sources.saves;
    // GDD: save anywhere except in combat or a conversation (the pause menu can open over one).
    const canSave = () => saves() && !ui.isOpen('dialogue') && !ui.sources.inCombat?.();
    this.items = [
      { label: 'Resume', latin: 'Perge', run: () => this.close() },
      { label: 'Save', latin: 'Serva', run: () => ui.openSaves('save'), enabled: canSave },
      { label: 'Load', latin: 'Repete', run: () => ui.openSaves('load'), enabled: saves },
      { label: 'Settings', latin: 'Optiones', run: () => ui.openSettings() },
      { label: 'Controls', latin: 'Moderamina', run: () => ui.openControls() },
      { label: 'Credits', latin: 'Gratiae', run: () => ui.openCredits() },
      { label: 'Quit to Title', latin: 'Exi', run: () => this.quit() },
    ];
    const rows = this.items.map((it) =>
      h('div', { class: `pause-item${it.enabled && !it.enabled() ? ' is-disabled' : ''}` }, h('span', { class: 'en' }, it.label), h('span', { class: 'la' }, it.latin)),
    );
    const crest = h('div', { class: 'pause-crest' });
    crest.innerHTML = spqrCrest(150);
    const { game } = ui;
    const loc = ui.sources.currentLocation?.();
    this.el.replaceChildren(
      h('div', { class: 'sr-backdrop pause-backdrop' }),
      h(
        'div',
        { class: 'pause-col' },
        crest,
        h('div', { class: 'pause-logo' }, 'SKYROME'),
        h('div', { class: 'pause-sub' }, 'Ludus intermissus'),
        h('nav', { class: 'pause-items' }, rows),
      ),
      h(
        'div',
        { class: 'pause-info' },
        h('div', { class: 'hour' }, `${romanHour(game.time.hour).latin} · ${formatClock(game.time.hour)}`),
        h('div', { class: 'date' }, game.time.formatRoman()),
        loc ? h('div', { class: 'place' }, loc) : null,
      ),
      h(
        'div',
        { class: 'sr-hints pause-hints' },
        h('span', { class: 'sr-hint' }, keycap('↑↓'), 'Select'),
        h('span', { class: 'sr-hint' }, keycap('Enter'), 'Choose'),
        h('span', { class: 'sr-hint', on: { click: () => this.close() } }, keycap('Esc'), 'Resume'),
      ),
    );
    this.nav.set(rows, false);
  }

  onKey(e: KeyboardEvent) {
    return this.nav.handleKey(e);
  }

  private quit() {
    void this.ui
      .confirm({ title: 'Quit to title', text: 'Return to the title screen? Progress since your last save will be lost.', yes: 'Quit', no: 'Stay' })
      .then((ok) => {
        if (!ok) return;
        const q = this.ui.sources.quitToTitle;
        this.ui.closeAll();
        if (q) q();
        else location.reload();
      });
  }
}
