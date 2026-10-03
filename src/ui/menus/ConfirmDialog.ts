/** Small yes/no dialog. Y/Enter confirms, N/Esc cancels, ←→ move between the buttons. */
import { BaseModal } from '../Modal';
import type { UIManager } from '../UIManager';
import { h, keycap } from '../dom';
import { NavList } from '../nav';

export interface ConfirmOptions {
  title: string;
  text: string;
  yes?: string;
  no?: string;
  /** Red confirm button for destructive actions. */
  danger?: boolean;
}

export class ConfirmDialog extends BaseModal {
  readonly id = 'confirm';
  readonly overlay = true;
  private nav = new NavList({ axis: 'horizontal', onActivate: (i) => this.finish(i === 0) });
  private done = false;

  constructor(
    private readonly opts: ConfirmOptions,
    private readonly resolve: (ok: boolean) => void,
  ) {
    super('confirm-dialog');
  }

  override onOpen(ui: UIManager) {
    super.onOpen(ui);
    const yes = h('button', { class: `sr-btn${this.opts.danger ? ' danger' : ' sr-btn-primary'}` }, keycap('Y', 'sr-key-sm'), this.opts.yes ?? 'Yes');
    const no = h('button', { class: 'sr-btn' }, keycap('N', 'sr-key-sm'), this.opts.no ?? 'No');
    this.el.replaceChildren(
      h('div', { class: 'confirm-shade' }),
      h('div', { class: 'confirm-box sr-panel' }, h('div', { class: 'confirm-title' }, this.opts.title), h('p', { class: 'confirm-text' }, this.opts.text), h('div', { class: 'confirm-btns' }, yes, no)),
    );
    this.nav.set([yes, no], false);
    this.nav.select(this.opts.danger ? 1 : 0, false);
  }

  onKey(e: KeyboardEvent) {
    if (e.code === 'KeyY') return this.finish(true), true;
    if (e.code === 'KeyN') return this.finish(false), true;
    if (e.code === 'Tab') return true;
    return this.nav.handleKey(e);
  }

  onEscape() {
    this.finish(false);
    return false;
  }

  onClose() {
    if (!this.done) {
      this.done = true;
      this.resolve(false);
    }
  }

  private finish(ok: boolean) {
    if (this.done) return;
    this.done = true;
    this.close();
    this.resolve(ok);
  }
}
