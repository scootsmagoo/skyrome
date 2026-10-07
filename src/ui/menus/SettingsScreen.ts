/**
 * Settings, bound live to game.settings (every change applies and persists immediately).
 * ↑↓ rows, ←→ adjust (Shift for big steps), Enter toggles, [ ] switch sections.
 */
import { DEFAULT_SETTINGS, type SettingsData } from '../../core/Settings';
import { BaseModal } from '../Modal';
import type { UIManager } from '../UIManager';
import { h, keycap, setChildren } from '../dom';
import { NavList } from '../nav';

type Key = keyof SettingsData;

export type SettingsRow = Row;
type Row =
  | { kind: 'slider'; key: Key; label: string; min: number; max: number; step: number; format: (v: number) => string; note?: string; live?: (ui: UIManager) => string }
  | { kind: 'toggle'; key: Key; label: string; note?: string; invert?: boolean }
  | { kind: 'choice'; key: Key; label: string; options: { value: unknown; label: string }[]; note?: string }
  | { kind: 'button'; label: string; note?: string; run: (ui: UIManager) => void };

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** The sections and rows; other modules may add a section or rows before the screen opens. */
export const SETTINGS_SECTIONS: { id: string; label: string; latin: string; rows: Row[] }[] = [
  {
    id: 'display',
    label: 'Display',
    latin: 'Species',
    rows: [
      {
        kind: 'choice', key: 'graphics', label: 'Graphics quality',
        options: [{ value: 'auto', label: 'Auto' }, { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }],
        note: 'Sets the rows below. Auto picks for this computer and steps down if the game stutters',
      },
      { kind: 'slider', key: 'fov', label: 'Field of view', min: 55, max: 100, step: 1, format: (v) => `${v}°` },
      {
        kind: 'choice', key: 'maxFps', label: 'Frame rate limit',
        options: [{ value: 30, label: '30 fps' }, { value: 60, label: '60 fps' }, { value: 0, label: 'Unlimited' }],
        note: '30 runs cooler and quieter; Unlimited runs hot on 120 Hz screens',
      },
      { kind: 'slider', key: 'renderScale', label: 'Render scale', min: 0.5, max: 1, step: 0.05, format: pct, note: 'Lower is faster' },
      { kind: 'slider', key: 'maxPixelRatio', label: 'Sharpness (pixel ratio cap)', min: 1, max: 2, step: 0.25, format: (v) => `${v.toFixed(2)}×` },
      { kind: 'choice', key: 'shadows', label: 'Shadows', options: [{ value: 'off', label: 'Off' }, { value: 'low', label: 'Low' }, { value: 'high', label: 'High' }] },
      { kind: 'slider', key: 'viewDistance', label: 'View distance', min: 300, max: 1500, step: 50, format: (v) => `${v} m` },
      { kind: 'toggle', key: 'bloom', label: 'Glow (bloom)', invert: true, note: 'Sunlight and lamps bleed softly' },
      { kind: 'toggle', key: 'antialias', label: 'Antialiasing', note: 'Applies after restarting' },
    ],
  },
  {
    id: 'audio',
    label: 'Audio',
    latin: 'Soni',
    rows: [
      { kind: 'slider', key: 'masterVolume', label: 'Master volume', min: 0, max: 1, step: 0.05, format: pct },
      { kind: 'slider', key: 'musicVolume', label: 'Music', min: 0, max: 1, step: 0.05, format: pct },
      { kind: 'slider', key: 'sfxVolume', label: 'Effects', min: 0, max: 1, step: 0.05, format: pct },
    ],
  },
  {
    id: 'controls',
    label: 'Controls',
    latin: 'Moderamina',
    rows: [
      { kind: 'slider', key: 'lookSensitivity', label: 'Look sensitivity', min: 0.2, max: 3, step: 0.05, format: (v) => `${v.toFixed(2)}×` },
      { kind: 'toggle', key: 'invertY', label: 'Invert vertical look' },
      { kind: 'choice', key: 'blockToggle', label: 'Blocking', options: [{ value: false, label: 'Hold' }, { value: true, label: 'Toggle' }], note: 'Toggle is easier on a trackpad' },
      { kind: 'button', label: 'Key bindings…', run: (ui) => ui.openControls() },
    ],
  },
  {
    id: 'interface',
    label: 'Interface',
    latin: 'Facies',
    rows: [
      {
        kind: 'slider', key: 'uiScale', label: 'Interface size', min: 0.8, max: 1.4, step: 0.05, format: pct,
        // The size is limited to what fits the window; say so instead of silently ignoring it.
        live: (ui) => (ui.effectiveUiScale < ui.game.settings.data.uiScale - 0.005 ? `${pct(ui.effectiveUiScale)} fits this window; enlarge it for more` : ''),
      },
      { kind: 'toggle', key: 'latinNames', label: 'Show Latin names' },
      { kind: 'toggle', key: 'compassLatin', label: 'Latin compass (SEP · ORI · MER · OCC)' },
      { kind: 'toggle', key: 'subtitles', label: 'Subtitles', invert: true },
      { kind: 'choice', key: 'hudBars', label: 'Health bars', options: [{ value: 'auto', label: 'Auto' }, { value: 'always', label: 'Always' }] },
      { kind: 'toggle', key: 'crosshair', label: 'Crosshair', invert: true },
      { kind: 'toggle', key: 'objectiveTracker', label: 'Objective tracker', invert: true, note: 'The current quest step in the top right corner' },
      { kind: 'toggle', key: 'showFps', label: 'Show frame rate' },
    ],
  },
];

/** Toggles stored as `undefined = on` (optional UI settings default to enabled). */
function readToggle(data: SettingsData, row: Extract<Row, { kind: 'toggle' }>): boolean {
  const v = data[row.key];
  return row.invert ? v !== false : !!v;
}

export class SettingsScreen extends BaseModal {
  readonly id = 'settings';
  private section = 0;
  private nav = new NavList({
    onActivate: (i, e) => {
      // Clicks on sliders/segmented controls are handled by the controls themselves.
      const kind = this.rows[i]?.kind;
      if (e instanceof MouseEvent && (kind === 'slider' || kind === 'choice')) return;
      this.activate(i);
    },
  });
  private rows: Row[] = [];
  private bodyEl = h('div', { class: 'settings-rows sr-scroll' });
  private tabsEl = h('nav', { class: 'sr-tabs settings-tabs' });
  private noteEl = h('div', { class: 'settings-note' });
  private off: (() => void) | null = null;

  constructor() {
    super('settings-screen');
  }

  override onOpen(ui: UIManager) {
    super.onOpen(ui);
    this.el.replaceChildren(
      h('div', { class: 'sr-backdrop' }),
      h(
        'div',
        { class: 'screen-panel sr-panel settings-panel' },
        h('div', { class: 'screen-title' }, h('span', { class: 'en' }, 'Settings'), h('span', { class: 'la' }, 'Optiones')),
        h('div', { class: 'settings-tabbar' }, keycap('['), this.tabsEl, keycap(']')),
        this.bodyEl,
        this.noteEl,
        h(
          'div',
          { class: 'sr-hints screen-hints' },
          h('span', { class: 'sr-hint' }, keycap('↑↓'), 'Select'),
          h('span', { class: 'sr-hint' }, keycap('←→'), 'Adjust'),
          h('span', { class: 'sr-hint', on: { click: () => this.resetSection() } }, keycap('R'), 'Defaults'),
          h('span', { class: 'sr-hint', on: { click: () => this.close() } }, keycap('Esc'), 'Back'),
        ),
      ),
    );
    const keys = this.el.querySelectorAll('.settings-tabbar > .sr-key');
    keys[0].addEventListener('click', () => this.setSection(this.section - 1));
    keys[1].addEventListener('click', () => this.setSection(this.section + 1));
    this.off = ui.game.settings.onChange(() => this.refreshValues());
    this.setSection(0);
  }

  onClose() {
    this.off?.();
  }

  private setSection(i: number) {
    this.section = (i + SETTINGS_SECTIONS.length) % SETTINGS_SECTIONS.length;
    setChildren(
      this.tabsEl,
      SETTINGS_SECTIONS.map((s, k) => h('div', { class: `sr-tab${k === this.section ? ' is-active' : ''}`, on: { click: () => this.setSection(k) } }, s.label)),
    );
    this.rows = SETTINGS_SECTIONS[this.section].rows;
    const els = this.rows.map((r) => this.buildRow(r));
    setChildren(this.bodyEl, els);
    this.nav.index = 0;
    this.nav.set(els, false);
    this.refreshValues();
  }

  private buildRow(r: Row): HTMLElement {
    const label = h(
      'div',
      { class: 'set-label' },
      r.label,
      r.note ? h('span', { class: 'set-note' }, r.note) : null,
      r.kind === 'slider' && r.live ? h('span', { class: 'set-note set-live' }) : null,
    );
    let control: HTMLElement;
    if (r.kind === 'slider') {
      const fill = h('div', { class: 'fill' });
      const thumb = h('div', { class: 'thumb' });
      control = h('div', { class: 'set-ctl' }, h('div', { class: 'sr-slider' }, h('div', { class: 'track' }), fill, thumb), h('span', { class: 'set-val sr-num' }));
      const slider = control.firstElementChild as HTMLElement;
      const setFromX = (clientX: number) => {
        const rect = slider.getBoundingClientRect();
        const t = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        this.setValue(r, r.min + t * (r.max - r.min));
      };
      slider.addEventListener('pointerdown', (e) => {
        slider.setPointerCapture(e.pointerId);
        setFromX(e.clientX);
      });
      slider.addEventListener('pointermove', (e) => {
        if (slider.hasPointerCapture(e.pointerId)) setFromX(e.clientX);
      });
    } else if (r.kind === 'toggle') {
      control = h('div', { class: 'set-ctl' }, h('div', { class: 'sr-toggle' }));
    } else if (r.kind === 'choice') {
      control = h(
        'div',
        { class: 'set-ctl' },
        h('div', { class: 'sr-seg' }, r.options.map((o) => h('span', { on: { click: (e: MouseEvent) => { e.stopPropagation(); this.ui.game.settings.set(r.key, o.value as never); } } }, o.label))),
      );
    } else {
      control = h('div', { class: 'set-ctl' }, h('span', { class: 'set-go' }, 'Open ›'));
    }
    return h('div', { class: `sr-row set-row ${r.kind}` }, label, control);
  }

  private refreshValues() {
    const data = this.ui.game.settings.data;
    this.rows.forEach((r, i) => {
      const el = this.nav.items[i];
      if (!el) return;
      if (r.kind === 'slider') {
        const v = Number(data[r.key] ?? DEFAULT_SETTINGS[r.key as keyof typeof DEFAULT_SETTINGS]);
        const t = (v - r.min) / (r.max - r.min);
        (el.querySelector('.fill') as HTMLElement).style.width = `${(t * 100).toFixed(1)}%`;
        (el.querySelector('.thumb') as HTMLElement).style.left = `${(t * 100).toFixed(1)}%`;
        el.querySelector('.set-val')!.textContent = r.format(Math.round(v / r.step) * r.step);
        const live = el.querySelector('.set-live');
        if (live && r.live) live.textContent = r.live(this.ui);
      } else if (r.kind === 'toggle') {
        el.querySelector('.sr-toggle')!.classList.toggle('is-on', readToggle(data, r));
      } else if (r.kind === 'choice') {
        const cur = data[r.key] ?? r.options[0].value;
        el.querySelectorAll('.sr-seg > span').forEach((s, k) => s.classList.toggle('is-on', r.options[k].value === cur));
      }
    });
  }

  private setValue(r: Extract<Row, { kind: 'slider' }>, v: number) {
    const snapped = Math.min(r.max, Math.max(r.min, Math.round(v / r.step) * r.step));
    const fixed = Number(snapped.toFixed(4));
    if (this.ui.game.settings.data[r.key] !== fixed) this.ui.game.settings.set(r.key, fixed as never);
  }

  private adjust(i: number, dir: number, big: boolean) {
    const r = this.rows[i];
    const s = this.ui.game.settings;
    if (!r) return;
    if (r.kind === 'slider') this.setValue(r, Number(s.data[r.key]) + dir * r.step * (big ? 5 : 1));
    else if (r.kind === 'toggle') this.activate(i);
    else if (r.kind === 'choice') {
      const cur = r.options.findIndex((o) => o.value === (s.data[r.key] ?? r.options[0].value));
      const next = Math.max(0, Math.min(r.options.length - 1, cur + dir));
      s.set(r.key, r.options[next].value as never);
    }
  }

  private activate(i: number) {
    const r = this.rows[i];
    const s = this.ui.game.settings;
    if (!r) return;
    if (r.kind === 'toggle') {
      const on = readToggle(s.data, r);
      s.set(r.key, !on as never);
    } else if (r.kind === 'choice') {
      const cur = r.options.findIndex((o) => o.value === (s.data[r.key] ?? r.options[0].value));
      s.set(r.key, r.options[(cur + 1) % r.options.length].value as never);
    } else if (r.kind === 'button') r.run(this.ui);
  }

  private resetSection() {
    const s = this.ui.game.settings;
    for (const r of this.rows) {
      if (r.kind === 'button') continue;
      const def = (DEFAULT_SETTINGS as Partial<SettingsData>)[r.key];
      s.set(r.key, def as never);
    }
    this.ui.flash(`${SETTINGS_SECTIONS[this.section].label} reset to defaults`);
  }

  onKey(e: KeyboardEvent) {
    switch (e.code) {
      case 'BracketLeft': this.setSection(this.section - 1); return true;
      case 'BracketRight': this.setSection(this.section + 1); return true;
      case 'ArrowLeft': this.adjust(this.nav.index, -1, e.shiftKey); return true;
      case 'ArrowRight': this.adjust(this.nav.index, 1, e.shiftKey); return true;
      case 'KeyR': if (!e.repeat) this.resetSection(); return true;
    }
    return this.nav.handleKey(e);
  }
}
