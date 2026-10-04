/**
 * Key bindings. Lists core actions (game.input.bindings) and UI actions; click a key chip (or
 * Enter) and press a key / mouse button to rebind. Bindings are written back with
 * input.setBindings and persisted in settings. A key taken from another action is unbound there.
 */
import { DEFAULT_BINDINGS, codeLabel, type Action } from '../../core/Input';
import { BaseModal } from '../Modal';
import type { UIManager } from '../UIManager';
import { h, keycap, setChildren } from '../dom';
import { NavList } from '../nav';
import { setActionBindings, setUiActionBindings, uiBindings, type UiAction } from '../settings';

type AnyAction = Action | UiAction;

const LABELS: Record<AnyAction, string> = {
  forward: 'Move forward', back: 'Move back', left: 'Strafe left', right: 'Strafe right',
  jump: 'Jump', sprint: 'Sprint (hold)', walkToggle: 'Walk / run', sneak: 'Sneak',
  attack: 'Attack', block: 'Block', readyWeapon: 'Ready weapon', interact: 'Interact',
  dodge: 'Dodge', parry: 'Parry (optional)', lockOn: 'Lock on (tap) · release (hold)', yield: 'Yield (hold)',
  invoke: 'Invoke your patron god', quickWheel: 'Quick items',
  hotbar1: 'Hotbar 1', hotbar2: 'Hotbar 2', hotbar3: 'Hotbar 3', hotbar4: 'Hotbar 4',
  hotbar5: 'Hotbar 5', hotbar6: 'Hotbar 6', hotbar7: 'Hotbar 7', hotbar8: 'Hotbar 8',
  shoulderSwap: 'Swap camera shoulder',
  toggleView: 'First / third person', lookLeft: 'Turn left', lookRight: 'Turn right', lookUp: 'Look up', lookDown: 'Look down',
  zoomIn: 'Camera closer', zoomOut: 'Camera farther', menu: 'Character menu', inventory: 'Inventory',
  journal: 'Journal', map: 'Map', skills: 'Skills', pause: 'Pause menu', quickSave: 'Quick save', quickLoad: 'Quick load',
  debug: 'Debug overlay', wait: 'Wait', clock: 'Show the time (hold)',
};

const GROUPS: { title: string; latin: string; actions: AnyAction[] }[] = [
  { title: 'Movement', latin: 'Iter', actions: ['forward', 'back', 'left', 'right', 'jump', 'sprint', 'walkToggle', 'sneak'] },
  { title: 'Combat', latin: 'Pugna', actions: ['attack', 'block', 'dodge', 'parry', 'lockOn', 'readyWeapon', 'yield', 'invoke'] },
  { title: 'Camera', latin: 'Conspectus', actions: ['lookLeft', 'lookRight', 'lookUp', 'lookDown', 'zoomIn', 'zoomOut', 'toggleView', 'shoulderSwap'] },
  { title: 'Actions & menus', latin: 'Res', actions: ['interact', 'quickWheel', 'menu', 'inventory', 'journal', 'map', 'skills', 'wait', 'clock', 'quickSave', 'quickLoad', 'pause', 'debug'] },
  { title: 'Hotbar', latin: 'Promptuarium', actions: ['hotbar1', 'hotbar2', 'hotbar3', 'hotbar4', 'hotbar5', 'hotbar6', 'hotbar7', 'hotbar8'] },
];

const LOCKED = new Set<AnyAction>(['pause']);
const isUi = (a: AnyAction): a is UiAction => a === 'wait' || a === 'clock';

export class ControlsScreen extends BaseModal {
  readonly id = 'controls';
  private nav = new NavList({ onActivate: (i, e) => this.onRowActivate(i, e) });
  private col = 0;
  private actions: AnyAction[] = [];
  private listEl = h('div', { class: 'controls-list sr-scroll' });
  private capture: { action: AnyAction; slot: number } | null = null;
  private captureEl = h('div', { class: 'controls-capture' });
  private onMouse = (e: MouseEvent) => this.captureMouse(e);
  private onWheel = (e: WheelEvent) => this.captureWheel(e);

  constructor() {
    super('controls-screen');
  }

  override onOpen(ui: UIManager) {
    super.onOpen(ui);
    this.el.replaceChildren(
      h('div', { class: 'sr-backdrop' }),
      h(
        'div',
        { class: 'screen-panel sr-panel controls-panel' },
        h('div', { class: 'screen-title' }, h('span', { class: 'en' }, 'Controls'), h('span', { class: 'la' }, 'Moderamina')),
        h('div', { class: 'controls-head' }, h('span', null, 'Action'), h('span', null, 'Primary'), h('span', null, 'Secondary')),
        this.listEl,
        h(
          'div',
          { class: 'sr-hints screen-hints' },
          h('span', { class: 'sr-hint' }, keycap('↑↓'), 'Select'),
          h('span', { class: 'sr-hint' }, keycap('←→'), 'Slot'),
          h('span', { class: 'sr-hint', on: { click: () => this.nav.activate() } }, keycap('Enter'), 'Rebind'),
          h('span', { class: 'sr-hint', on: { click: () => this.clear() } }, keycap('Del'), 'Clear'),
          h('span', { class: 'sr-hint', on: { click: () => void this.resetAll() } }, keycap('R'), 'Defaults'),
          h('span', { class: 'sr-hint', on: { click: () => this.close() } }, keycap('Esc'), 'Back'),
        ),
      ),
      this.captureEl,
    );
    this.render();
  }

  onClose() {
    this.stopCapture();
  }

  private codes(a: AnyAction): string[] {
    return isUi(a) ? uiBindings(this.ui.game.settings.data)[a] : this.ui.game.input.bindings[a];
  }

  private render() {
    const rows: HTMLElement[] = [];
    const children: HTMLElement[] = [];
    this.actions = [];
    for (const g of GROUPS) {
      children.push(h('div', { class: 'menu-section-title' }, h('span', { class: 'en' }, g.title), h('span', { class: 'la' }, g.latin)));
      for (const a of g.actions) {
        const codes = this.codes(a);
        const chip = (slot: number) => {
          const c = codes[slot];
          return h(
            'span',
            { class: `bind-chip${c ? '' : ' empty'}${LOCKED.has(a) ? ' locked' : ''}`, dataset: { slot: String(slot) } },
            c ? codeLabel(c) : '—',
          );
        };
        const row = h(
          'div',
          { class: `sr-row ctl-row${codes.length === 0 ? ' unbound' : ''}`, dataset: { action: a } },
          h('span', { class: 'ctl-name' }, LABELS[a], codes.length === 0 ? h('span', { class: 'ctl-warn' }, 'unbound') : null),
          chip(0),
          chip(1),
        );
        rows.push(row);
        children.push(row);
        this.actions.push(a);
      }
    }
    const keep = this.nav.index;
    setChildren(this.listEl, children);
    this.nav.index = keep;
    this.nav.set(rows);
    this.markColumn();
  }

  private markColumn() {
    this.nav.items.forEach((r) => r.querySelectorAll('.bind-chip').forEach((c, k) => c.classList.toggle('is-col', k === this.col)));
  }

  private onRowActivate(i: number, e?: Event) {
    const a = this.actions[i];
    if (!a || LOCKED.has(a)) {
      if (a) this.ui.flash('Esc always opens the pause menu.');
      return;
    }
    // Clicking a chip picks that slot.
    const chip = (e?.target as HTMLElement | null)?.closest?.('.bind-chip') as HTMLElement | null;
    if (chip) this.col = Number(chip.dataset.slot);
    this.markColumn();
    this.startCapture(a, this.col);
  }

  private startCapture(action: AnyAction, slot: number) {
    this.capture = { action, slot };
    setChildren(
      this.captureEl,
      h(
        'div',
        { class: 'capture-box sr-panel' },
        h('div', { class: 'capture-title' }, LABELS[action]),
        h('div', { class: 'capture-text' }, 'Press a key or mouse button…'),
        h('div', { class: 'capture-hint' }, keycap('Esc'), ' cancel'),
      ),
    );
    this.captureEl.classList.add('is-visible');
    // Defer so the click that started capture isn't captured itself.
    setTimeout(() => {
      if (!this.capture) return;
      window.addEventListener('mousedown', this.onMouse, true);
      window.addEventListener('wheel', this.onWheel, { capture: true, passive: false });
    }, 0);
  }

  private stopCapture() {
    this.capture = null;
    this.captureEl.classList.remove('is-visible');
    window.removeEventListener('mousedown', this.onMouse, true);
    window.removeEventListener('wheel', this.onWheel, true);
  }

  private captureMouse(e: MouseEvent) {
    if (!this.capture) return;
    e.preventDefault();
    e.stopPropagation();
    this.assign(`Mouse${e.button}`);
  }

  private captureWheel(e: WheelEvent) {
    if (!this.capture || Math.abs(e.deltaY) < 2) return;
    e.preventDefault();
    e.stopPropagation();
    this.assign(e.deltaY < 0 ? 'WheelUp' : 'WheelDown');
  }

  private assign(code: string) {
    const cap = this.capture;
    if (!cap) return;
    this.stopCapture();
    // Steal the code from any other action.
    const stolenFrom: AnyAction[] = [];
    for (const g of GROUPS) {
      for (const a of g.actions) {
        if (a === cap.action) continue;
        const codes = this.codes(a);
        if (codes.includes(code)) {
          this.write(a, codes.filter((c) => c !== code));
          stolenFrom.push(a);
        }
      }
    }
    const codes = [...this.codes(cap.action)];
    const others = codes.filter((c, i) => i !== cap.slot && c !== code);
    const next = cap.slot === 0 ? [code, ...others.slice(0, 1)] : [others[0], code].filter(Boolean);
    this.write(cap.action, next as string[]);
    if (stolenFrom.length) this.ui.flash(`${codeLabel(code)} removed from ${stolenFrom.map((a) => LABELS[a]).join(', ')}`);
    this.render();
  }

  private write(a: AnyAction, codes: string[]) {
    if (isUi(a)) setUiActionBindings(this.ui.game, a, codes);
    else setActionBindings(this.ui.game, a, codes);
  }

  private clear() {
    const a = this.actions[this.nav.index];
    if (!a || LOCKED.has(a)) return;
    const codes = this.codes(a).filter((_, i) => i !== this.col);
    this.write(a, codes);
    this.render();
  }

  private async resetAll() {
    if (!(await this.ui.confirm({ title: 'Restore defaults', text: 'Reset every key binding to its default?', yes: 'Reset', no: 'Cancel' }))) return;
    this.ui.game.settings.set('bindings', {});
    this.ui.game.settings.set('uiBindings', {});
    this.ui.game.input.setBindings({ ...DEFAULT_BINDINGS });
    this.render();
  }

  onKey(e: KeyboardEvent): boolean {
    if (this.capture) {
      if (e.code === 'Escape') this.stopCapture();
      else if (!e.repeat) this.assign(e.code);
      return true;
    }
    switch (e.code) {
      case 'ArrowLeft': this.col = 0; this.markColumn(); return true;
      case 'ArrowRight': this.col = 1; this.markColumn(); return true;
      case 'Delete': case 'Backspace': this.clear(); return true;
      case 'KeyR': if (!e.repeat) void this.resetAll(); return true;
    }
    return this.nav.handleKey(e);
  }

  onEscape() {
    if (this.capture) {
      this.stopCapture();
      return false;
    }
    return true;
  }
}
