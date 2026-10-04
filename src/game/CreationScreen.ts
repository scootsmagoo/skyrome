/**
 * Character creation (GDD §3.1, ≤ 3 minutes): origin (four playable, six shown locked), sex with
 * its period dress, name with a Roman naming helper, three appearance presets per sex, and the
 * creation extra. The panel sits on the left; the avatar turns on the right in the live city
 * (see CreationStage). Keyboard first: ↑↓ section, ←→ choose, Enter on the name types it,
 * R suggests a name, Enter on "Enter Rome" starts; every chip also takes a click.
 */
import { ITEMS } from '../rpg/data/items';
import { SKILLS } from '../rpg/data/skills';
import { BaseModal } from '../ui/Modal';
import type { UIManager } from '../ui/UIManager';
import { h, keycap, setChildren } from '../ui/dom';
import { formatMoney } from '../ui/format';
import { originChoices, looksFor, romanName, cleanName, defaultName, type CharacterSpec, type OriginChoice, type Sex } from './character';
import './creation.css';

type RowId = 'origin' | 'sex' | 'name' | 'look' | 'extra' | 'start';

export interface CreationOptions {
  initial: CharacterSpec;
  /** Live preview: the avatar on the turntable redresses. */
  onChange(spec: CharacterSpec): void;
  onDone(spec: CharacterSpec): void;
  onCancel(): void;
}

const itemName = (id: string) => ITEMS.find((i) => i.id === id)?.name ?? id;
const skillName = (id: string) => SKILLS.find((s) => s.id === id)?.name ?? id;

export class CreationScreen extends BaseModal {
  readonly id = 'creation';
  override pauses = false;
  private spec: CharacterSpec;
  private origins: OriginChoice[] = originChoices();
  private row: RowId = 'origin';
  private rowEls = new Map<RowId, HTMLElement>();
  private nameInput: HTMLInputElement;
  private detailEl = h('div', { class: 'cc-detail' });
  private originGrid = h('div', { class: 'cc-origins' });
  private sexRow = h('div', { class: 'cc-chips' });
  private sexNote = h('div', { class: 'cc-note' });
  private lookRow = h('div', { class: 'cc-chips' });
  private extraRow = h('div', { class: 'cc-chips' });
  private extraSection: HTMLElement;
  private startBtn: HTMLElement;
  private flashEl = h('div', { class: 'cc-flash' });
  private panelEl: HTMLElement | null = null;
  private nameSeed = 1;
  private done = false;

  constructor(private readonly opts: CreationOptions) {
    super('creation-screen');
    this.spec = { ...opts.initial };
    this.nameInput = h('input', { class: 'cc-name-input', type: 'text', maxlength: '40', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Name' }) as HTMLInputElement;
    this.extraSection = h('div');
    this.startBtn = h('button', { class: 'sr-btn sr-btn-primary cc-start', on: { click: () => this.start() } }, keycap('Enter', 'sr-key-sm'), 'Enter Rome', h('span', { class: 'la' }, 'Intra Urbem'));
  }

  override onOpen(ui: UIManager) {
    super.onOpen(ui);
    const section = (id: RowId, title: string, latin: string, ...body: HTMLElement[]) => {
      const el = h('section', { class: 'cc-section', on: { pointerdown: () => this.select(id) } }, h('div', { class: 'cc-label' }, h('span', { class: 'la' }, latin), h('span', { class: 'en' }, title)), ...body);
      this.rowEls.set(id, el);
      return el;
    };
    const randomBtn = h('button', { class: 'sr-btn cc-random', on: { click: () => this.randomName() } }, keycap('R', 'sr-key-sm'), 'Suggest');
    this.nameInput.value = this.spec.name;
    this.nameInput.addEventListener('keydown', (e) => this.onNameKey(e));
    this.nameInput.addEventListener('input', () => {
      this.spec.name = this.nameInput.value;
    });
    this.nameInput.addEventListener('focus', () => this.select('name'));
    this.nameInput.addEventListener('blur', () => this.commitName());
    this.extraSection = section('extra', 'Something extra', 'Donum', this.extraRow);
    this.el.replaceChildren(
      h('div', { class: 'cc-shade' }),
      (this.panelEl = h(
        'div',
        { class: 'cc-panel sr-panel' },
        h('div', { class: 'cc-title' }, h('span', { class: 'la' }, 'Quis es?'), h('span', { class: 'en' }, 'Who are you?')),
        h(
          'div',
          { class: 'cc-body sr-scroll' },
          h('div', { class: 'cc-col' }, section('origin', 'Origin', 'Origo', this.originGrid, this.detailEl)),
          h(
            'div',
            { class: 'cc-col' },
            section('sex', 'Sex', 'Sexus', this.sexRow, this.sexNote),
            section('name', 'Name', 'Nomen', h('div', { class: 'cc-name' }, this.nameInput, randomBtn)),
            section('look', 'Appearance', 'Forma', this.lookRow),
            this.extraSection,
            (() => {
              const el = h('div', { class: 'cc-section cc-start-row' }, this.startBtn);
              this.rowEls.set('start', el);
              return el;
            })(),
          ),
        ),
        h(
          'div',
          { class: 'sr-hints cc-hints' },
          h('span', { class: 'sr-hint' }, keycap('↑↓'), 'Section'),
          h('span', { class: 'sr-hint' }, keycap('←→'), 'Choose'),
          h('span', { class: 'sr-hint' }, keycap('Enter'), 'Type name / start'),
          h('span', { class: 'sr-hint', on: { click: () => this.opts.onCancel() } }, keycap('Esc'), 'Title'),
        ),
      )),
      h('div', { class: 'cc-turntable-note' }, 'The Porta Capena, a.d. V Id. Mai. — your character'),
      this.flashEl,
    );
    this.render();
    this.select('origin');
  }

  /** Right edge of the panel as a fraction of the window (the stage frames the avatar beyond it). */
  panelRight(): number {
    const r = this.panelEl?.getBoundingClientRect();
    return r && window.innerWidth > 0 ? Math.min(0.8, r.right / window.innerWidth) : 0.45;
  }

  // ------------------------------------------------------------------ state

  private rows(): RowId[] {
    return this.hasExtra() ? ['origin', 'sex', 'name', 'look', 'extra', 'start'] : ['origin', 'sex', 'name', 'look', 'start'];
  }

  private hasExtra() {
    return this.current().def.creationExtra !== false;
  }

  private current(): OriginChoice {
    return this.origins.find((o) => o.def.id === this.spec.origin) ?? this.origins[0];
  }

  private set(patch: Partial<CharacterSpec>) {
    const prevOrigin = this.spec.origin;
    const prevSex = this.spec.sex;
    // A name the player hasn't touched follows the origin and sex (Daizus for the Dacian…).
    const untouched = this.spec.name === defaultName(prevOrigin, prevSex);
    Object.assign(this.spec, patch);
    if (patch.sex && patch.sex !== prevSex) this.spec.look = looksFor(patch.sex)[0].id;
    if (untouched && (this.spec.origin !== prevOrigin || this.spec.sex !== prevSex)) this.spec.name = defaultName(this.spec.origin, this.spec.sex);
    if (!this.hasExtra()) this.spec.extra = undefined;
    else if (!this.spec.extra) this.spec.extra = 'denarii';
    this.render();
    this.opts.onChange({ ...this.spec });
  }

  private select(row: RowId) {
    if (!this.rows().includes(row)) row = 'start';
    this.row = row;
    for (const [id, el] of this.rowEls) el.classList.toggle('is-selected', id === row);
    this.rowEls.get(row)?.scrollIntoView?.({ block: 'nearest' });
  }

  private move(dir: number) {
    const rows = this.rows();
    const i = rows.indexOf(this.row);
    this.select(rows[Math.max(0, Math.min(rows.length - 1, i + dir))]);
  }

  /** ←→ on the selected section. */
  private change(dir: number) {
    switch (this.row) {
      case 'origin': {
        const playable = this.origins.filter((o) => o.playable);
        const i = playable.findIndex((o) => o.def.id === this.spec.origin);
        this.set({ origin: playable[(i + dir + playable.length) % playable.length].def.id });
        break;
      }
      case 'sex':
        this.set({ sex: this.spec.sex === 'male' ? 'female' : 'male' });
        break;
      case 'look': {
        const looks = looksFor(this.spec.sex);
        const i = looks.findIndex((l) => l.id === this.spec.look);
        this.set({ look: looks[(i + dir + looks.length) % looks.length].id });
        break;
      }
      case 'extra':
        this.set({ extra: this.spec.extra === 'parmula' ? 'denarii' : 'parmula' });
        break;
      default:
        break;
    }
  }

  private randomName() {
    const seed = this.nameSeed++ * 7919 + Math.floor(performance.now());
    let s = seed;
    const pick = <T>(list: readonly T[]): T => {
      s = (s * 16807 + 11) % 2147483647;
      return list[s % list.length];
    };
    this.spec.name = romanName(this.spec.origin, this.spec.sex, pick);
    this.nameInput.value = this.spec.name;
    this.opts.onChange({ ...this.spec });
  }

  private commitName() {
    this.spec.name = cleanName(this.nameInput.value, this.spec.origin, this.spec.sex);
    this.nameInput.value = this.spec.name;
  }

  private start() {
    if (this.done) return;
    this.commitName();
    this.done = true;
    this.opts.onDone({ ...this.spec });
  }

  private flash(text: string) {
    this.flashEl.textContent = text;
    this.flashEl.classList.remove('is-on');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('is-on');
  }

  // ------------------------------------------------------------------ render

  private render() {
    const cur = this.current();
    setChildren(
      this.originGrid,
      this.origins.map((o) =>
        h(
          'div',
          {
            class: `cc-origin${o.def.id === this.spec.origin ? ' is-on' : ''}${o.playable ? '' : ' is-locked'}`,
            title: o.locked ?? o.def.name,
            on: { click: () => (o.playable ? this.set({ origin: o.def.id }) : this.flash(`${o.def.name}: ${o.locked}`)) },
          },
          h('span', { class: 'nm' }, o.def.name),
          h('span', { class: 'la' }, o.playable ? o.def.latin ?? '' : `${o.def.latin ?? ''} · ${o.locked?.replace('Arrives in ', '') ?? ''}`),
        ),
      ),
    );
    const d = cur.def;
    const skills = Object.entries(d.skills)
      .filter(([, v]) => (v ?? 0) !== 0)
      .map(([k, v]) => `${(v ?? 0) > 0 ? '+' : '−'}${Math.abs(v ?? 0)} ${skillName(k)}`)
      .join(' · ');
    const kit = d.kit.map((k) => (k.count && k.count > 1 ? `${itemName(k.id)} ×${k.count}` : itemName(k.id))).join(', ');
    const pack = d.pack?.[this.spec.sex]?.map((k) => itemName(k.id)).join(' and ');
    setChildren(
      this.detailEl,
      h('p', { class: 'cc-desc' }, d.description),
      h('div', { class: 'cc-facts' }, h('div', null, h('b', null, 'Skills '), skills), h('div', null, h('b', null, 'Trait '), d.trait ?? '—'), h('div', null, h('b', null, 'Kit '), kit, pack ? `; in the pack: ${pack}` : ''), h('div', null, h('b', null, 'Purse '), `${formatMoney(d.denarii)} denarii`)),
    );

    const sexes: [Sex, string, string][] = [
      ['male', 'Man', 'Vir'],
      ['female', 'Woman', 'Femina'],
    ];
    setChildren(
      this.sexRow,
      sexes.map(([s, en, la]) => h('div', { class: `cc-chip${this.spec.sex === s ? ' is-on' : ''}`, on: { click: () => this.set({ sex: s }) } }, h('span', null, en), h('span', { class: 'la' }, la))),
    );
    const dress = this.spec.sex === 'male' ? 'the toga' : 'the stola with the palla';
    this.sexNote.textContent = `Formal dress: ${dress}${pack ? ', waiting in your pack' : ''}. It never limits what you can do.`;

    setChildren(
      this.lookRow,
      looksFor(this.spec.sex).map((l) =>
        h('div', { class: `cc-chip cc-look${this.spec.look === l.id ? ' is-on' : ''}`, on: { click: () => this.set({ look: l.id }) } }, h('i', { class: 'sw', style: `background:${l.skin};box-shadow: inset -0.55rem 0 0 ${l.hair.color}` }), h('span', null, l.label), h('span', { class: 'la' }, l.note)),
      ),
    );

    this.extraSection.style.display = this.hasExtra() ? '' : 'none';
    setChildren(
      this.extraRow,
      h('div', { class: `cc-chip${this.spec.extra === 'parmula' ? ' is-on' : ''}`, on: { click: () => this.set({ extra: 'parmula' }) } }, h('span', null, 'A used parmula'), h('span', { class: 'la' }, 'small shield, 60%')),
      h('div', { class: `cc-chip${this.spec.extra !== 'parmula' ? ' is-on' : ''}`, on: { click: () => this.set({ extra: 'denarii' }) } }, h('span', null, '+40 denarii'), h('span', { class: 'la' }, 'coin in the purse')),
    );
    if (this.nameInput.value !== this.spec.name && document.activeElement !== this.nameInput) this.nameInput.value = this.spec.name;
  }

  // ------------------------------------------------------------------ keys

  private onNameKey(e: KeyboardEvent) {
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Escape' || e.code === 'ArrowDown' || e.code === 'ArrowUp' || e.code === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      this.nameInput.blur();
      if (e.code === 'ArrowUp') this.move(-1);
      else if (e.code !== 'Escape') this.move(1);
    }
  }

  onKey(e: KeyboardEvent) {
    switch (e.code) {
      case 'ArrowUp':
      case 'KeyW':
        this.move(-1);
        return true;
      case 'ArrowDown':
      case 'KeyS':
        this.move(1);
        return true;
      case 'ArrowLeft':
      case 'KeyA':
        this.change(-1);
        return true;
      case 'ArrowRight':
      case 'KeyD':
        this.change(1);
        return true;
      case 'KeyR':
        if (!e.repeat) this.randomName();
        return true;
      case 'Enter':
      case 'NumpadEnter':
      case 'Space':
      case 'KeyE':
        if (e.repeat) return true;
        if (this.row === 'name') {
          this.nameInput.focus();
          this.nameInput.select();
        } else if (this.row === 'start') this.start();
        else this.move(1);
        return true;
      case 'Tab':
        return true;
    }
    return false;
  }

  onEscape() {
    this.opts.onCancel();
    return false;
  }

  onAction() {
    // Menu hotkeys (I, J, M…) do nothing here.
    return true;
  }
}
