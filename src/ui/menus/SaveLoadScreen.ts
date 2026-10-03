/** Save / Load slot list. Enter saves or loads, Delete removes (with confirmation). */
import { BaseModal } from '../Modal';
import type { UIManager } from '../UIManager';
import { h, keycap, setChildren } from '../dom';
import { formatDuration, formatSavedAt } from '../format';
import { NavList } from '../nav';
import type { SaveSlot, SaveSlotsView } from '../types';

export class SaveLoadScreen extends BaseModal {
  readonly id: string;
  private nav = new NavList({ onActivate: (i) => this.activate(i), onSelect: () => this.renderPreview() });
  private slots: SaveSlot[] = [];
  private listEl = h('div', { class: 'saves-list sr-scroll' });
  private previewEl = h('div', { class: 'saves-preview' });
  private view: SaveSlotsView | null = null;

  constructor(private readonly mode: 'save' | 'load') {
    super('saves-screen');
    this.id = mode === 'save' ? 'save' : 'load';
  }

  override onOpen(ui: UIManager) {
    super.onOpen(ui);
    this.view = ui.sources.saves?.() ?? null;
    this.el.replaceChildren(
      h('div', { class: 'sr-backdrop' }),
      h(
        'div',
        { class: 'screen-panel sr-panel saves-panel' },
        h('div', { class: 'screen-title' }, h('span', { class: 'en' }, this.mode === 'save' ? 'Save game' : 'Load game'), h('span', { class: 'la' }, this.mode === 'save' ? 'Serva' : 'Repete')),
        h('div', { class: 'saves-body' }, this.listEl, this.previewEl),
        h(
          'div',
          { class: 'sr-hints screen-hints' },
          h('span', { class: 'sr-hint', on: { click: () => this.nav.activate() } }, keycap('Enter'), this.mode === 'save' ? 'Save' : 'Load'),
          h('span', { class: 'sr-hint', on: { click: () => this.remove() } }, keycap('Del'), 'Delete'),
          h('span', { class: 'sr-hint', on: { click: () => this.close() } }, keycap('Esc'), 'Back'),
        ),
      ),
    );
    void this.reload();
  }

  private async reload() {
    this.slots = this.view ? [...(await this.view.list())].sort((a, b) => b.savedAt - a.savedAt) : [];
    const rows: HTMLElement[] = [];
    if (this.mode === 'save') rows.push(h('div', { class: 'sr-row save-row new' }, h('div', { class: 'thumb plus' }, '+'), h('div', { class: 'info' }, h('div', { class: 'name' }, 'New save'), h('div', { class: 'meta' }, 'Create a new slot'))));
    for (const s of this.slots) {
      const thumb = h('div', { class: 'thumb' });
      if (s.thumbnail) thumb.style.backgroundImage = `url("${s.thumbnail}")`;
      rows.push(
        h(
          'div',
          { class: 'sr-row save-row' },
          thumb,
          h(
            'div',
            { class: 'info' },
            h('div', { class: 'name' }, `${s.name}`, h('span', { class: 'lvl' }, ` · Level ${s.level}`), s.kind && s.kind !== 'manual' ? h('span', { class: 'kind' }, s.kind === 'quick' ? 'Quick' : 'Auto') : null),
            h('div', { class: 'meta' }, s.location),
            h('div', { class: 'meta dim' }, `${s.gameDate} · ${formatSavedAt(s.savedAt)}`),
          ),
        ),
      );
    }
    if (!rows.length) rows.push(h('div', { class: 'sr-row save-row is-disabled' }, h('div', { class: 'info' }, h('div', { class: 'name' }, 'No saved games'), h('div', { class: 'meta' }, 'Your saves will appear here.'))));
    setChildren(this.listEl, rows);
    this.nav.set(rows);
    this.renderPreview();
  }

  private slotAt(i: number): SaveSlot | null {
    const k = this.mode === 'save' ? i - 1 : i;
    return this.slots[k] ?? null;
  }

  private renderPreview() {
    const s = this.slotAt(this.nav.index);
    if (!s) {
      setChildren(this.previewEl, h('div', { class: 'pv-empty' }, this.mode === 'save' ? 'A new record of your deeds.' : ''));
      return;
    }
    const img = h('div', { class: 'pv-img' });
    if (s.thumbnail) img.style.backgroundImage = `url("${s.thumbnail}")`;
    setChildren(
      this.previewEl,
      img,
      h('div', { class: 'pv-name' }, s.name),
      h(
        'dl',
        { class: 'pv-stats' },
        h('dt', null, 'Level'), h('dd', null, String(s.level)),
        h('dt', null, 'Location'), h('dd', null, s.location),
        h('dt', null, 'In Rome'), h('dd', null, s.gameDate),
        h('dt', null, 'Played'), h('dd', null, formatDuration(s.playTime)),
        h('dt', null, 'Saved'), h('dd', null, formatSavedAt(s.savedAt)),
      ),
    );
  }

  private async activate(i: number) {
    const v = this.view;
    if (!v) return;
    const s = this.slotAt(i);
    if (this.mode === 'save') {
      if (s && !(await this.ui.confirm({ title: 'Overwrite save', text: `Overwrite “${s.name} · ${s.location}”?`, yes: 'Overwrite', no: 'Cancel' }))) return;
      await v.save(s?.id);
      this.ui.flash('Game saved');
      await this.reload();
    } else if (s) {
      if (!(await this.ui.confirm({ title: 'Load game', text: `Load “${s.name} · ${s.location}”? Unsaved progress will be lost.`, yes: 'Load', no: 'Cancel' }))) return;
      this.ui.closeAll();
      await v.load(s.id);
    }
  }

  private async remove() {
    const s = this.slotAt(this.nav.index);
    if (!s || !this.view) return;
    if (!(await this.ui.confirm({ title: 'Delete save', text: `Delete “${s.name} · ${s.location}”? This cannot be undone.`, yes: 'Delete', no: 'Keep', danger: true }))) return;
    await this.view.remove(s.id);
    await this.reload();
  }

  onKey(e: KeyboardEvent) {
    if (e.code === 'Delete' || e.code === 'Backspace' || e.code === 'KeyX') {
      if (!e.repeat) void this.remove();
      return true;
    }
    return this.nav.handleKey(e);
  }
}
