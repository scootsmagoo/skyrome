/**
 * The tabbed in-game menu: Character · Skills · Inventory · Journal · Map. Opened by Tab/K/I/J/M
 * (pressing the same key again closes it), switched with [ and ] or by clicking a tab.
 */
import type { Action } from '../../core/Input';
import { BaseModal } from '../Modal';
import type { UIManager } from '../UIManager';
import { h, keycap, setChildren, setText, type Child } from '../dom';
import { formatClock, romanHour } from '../format';
import { CharacterTab } from './CharacterTab';
import { SkillsTab } from './SkillsTab';
import { InventoryTab } from './InventoryTab';
import { JournalTab } from './JournalTab';
import { MapTab } from './MapTab';
import './menus.css';

export type MenuTabId = 'character' | 'skills' | 'inventory' | 'journal' | 'map';

export interface Hint {
  key: string;
  label: string;
  run?: () => void;
}

export interface MenuTab {
  readonly id: MenuTabId;
  readonly label: string;
  readonly el: HTMLElement;
  /** Rebuild from the UI sources and show. */
  show(ui: UIManager): void;
  hide?(): void;
  onKey?(e: KeyboardEvent): boolean;
  /** Key releases (tabs that track held keys, like the map's panning). */
  onKeyUp?(e: KeyboardEvent): void;
  hints(): Hint[];
  /** Footer status line (denarii, weight). */
  status?(): Child;
  update?(dt: number): void;
}

const ORDER: MenuTabId[] = ['character', 'skills', 'inventory', 'journal', 'map'];
const ACTION_TAB: Partial<Record<Action, MenuTabId>> = {
  skills: 'skills',
  inventory: 'inventory',
  journal: 'journal',
  map: 'map',
};

export class MenuShell extends BaseModal {
  readonly id = 'menu';
  private tabs = new Map<MenuTabId, MenuTab>();
  private current: MenuTabId;
  private tabBar: HTMLElement;
  private tabEls = new Map<MenuTabId, HTMLElement>();
  private content: HTMLElement;
  private hintsEl: HTMLElement;
  private statusEl: HTMLElement;
  private who: HTMLElement;
  private whoSub: HTMLElement;
  private when: HTMLElement;
  private whenSub: HTMLElement;
  private clockTimer = 0;

  constructor(initial: MenuTabId) {
    super('menu-shell');
    this.current = initial;
    this.tabBar = h('nav', { class: 'sr-tabs menu-tabs' });
    for (const [i, id] of ORDER.entries()) {
      if (i > 0) this.tabBar.appendChild(h('i', { class: 'menu-tab-sep' }));
      const el = h('div', { class: 'sr-tab', on: { click: () => this.show(id) } }, labelOf(id));
      this.tabEls.set(id, el);
      this.tabBar.appendChild(el);
    }
    this.who = h('div', { class: 'who' });
    this.whoSub = h('div', { class: 'sub' });
    this.when = h('div', { class: 'when' });
    this.whenSub = h('div', { class: 'sub' });
    this.content = h('div', { class: 'menu-content' });
    this.hintsEl = h('div', { class: 'sr-hints menu-hints' });
    this.statusEl = h('div', { class: 'menu-status' });
    this.el.append(
      h('div', { class: 'sr-backdrop' }),
      h(
        'div',
        { class: 'menu-frame' },
        h(
          'header',
          { class: 'menu-header' },
          h('div', { class: 'menu-who' }, this.who, this.whoSub),
          h('div', { class: 'menu-tabwrap' }, h('span', { class: 'menu-tabkey' }, keycap('['), ''), this.tabBar, h('span', { class: 'menu-tabkey' }, keycap(']'))),
          h('div', { class: 'menu-when' }, this.when, this.whenSub),
        ),
        this.content,
        h('footer', { class: 'menu-footer' }, h('div', { class: 'menu-footer-l' }), this.hintsEl, this.statusEl),
      ),
    );
    // Clicking the [ ] key caps also switches.
    const keys = this.el.querySelectorAll('.menu-tabkey');
    keys[0].addEventListener('click', () => this.step(-1));
    keys[1].addEventListener('click', () => this.step(1));
  }

  override onOpen(ui: UIManager) {
    super.onOpen(ui);
    this.updateHeader();
    this.show(this.current, true);
  }

  onClose() {
    this.tabs.get(this.current)?.hide?.();
  }

  get tab(): MenuTabId {
    return this.current;
  }

  private getTab(id: MenuTabId): MenuTab {
    let t = this.tabs.get(id);
    if (!t) {
      t = id === 'character' ? new CharacterTab() : id === 'skills' ? new SkillsTab() : id === 'inventory' ? new InventoryTab() : id === 'journal' ? new JournalTab() : new MapTab();
      this.tabs.set(id, t);
    }
    return t;
  }

  show(id: MenuTabId, force = false) {
    if (!this.ui) {
      this.current = id;
      return;
    }
    if (id === this.current && !force && this.content.firstChild) return;
    this.tabs.get(this.current)?.hide?.();
    this.current = id;
    for (const [tid, el] of this.tabEls) el.classList.toggle('is-active', tid === id);
    const t = this.getTab(id);
    this.el.dataset.tab = id;
    setChildren(this.content, t.el);
    t.show(this.ui);
    this.renderFooter();
  }

  /** Switch to the map centered on a quest's marker (journal → 'Show on map'). */
  focusQuest(questId: string) {
    this.show('map');
    const map = this.getTab('map') as MapTab;
    map.focusQuest(questId);
  }

  /** Re-pull data for the visible tab (sources changed). */
  refresh() {
    if (this.ui) this.show(this.current, true);
  }

  step(d: number) {
    const i = ORDER.indexOf(this.current);
    this.show(ORDER[(i + d + ORDER.length) % ORDER.length]);
  }

  renderFooter() {
    const t = this.getTab(this.current);
    const hints: Hint[] = [...t.hints(), { key: 'Esc', label: 'Close', run: () => this.close() }];
    setChildren(
      this.hintsEl,
      hints.map((hn) => h('span', { class: 'sr-hint', on: { click: () => hn.run?.() } }, keycap(hn.key), hn.label)),
    );
    setChildren(this.statusEl, t.status?.() ?? null);
  }

  onKey(e: KeyboardEvent): boolean {
    if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
      this.step(e.code === 'BracketLeft' ? -1 : 1);
      return true;
    }
    return this.getTab(this.current).onKey?.(e) ?? false;
  }

  onKeyUp(e: KeyboardEvent) {
    this.tabs.get(this.current)?.onKeyUp?.(e);
  }

  onAction(action: Action): boolean {
    if (action === 'menu') {
      this.close();
      return true;
    }
    const tab = ACTION_TAB[action];
    if (!tab) return false;
    if (tab === this.current) this.close();
    else this.show(tab);
    return true;
  }

  update(dt: number) {
    this.clockTimer -= dt;
    if (this.clockTimer <= 0) {
      this.clockTimer = 1;
      this.updateHeader();
    }
    this.tabs.get(this.current)?.update?.(dt);
  }

  private updateHeader() {
    const { game, sources } = this.ui;
    const ch = sources.character?.();
    setText(this.who, ch?.name ?? this.ui.playerName);
    setText(this.whoSub, ch ? `Level ${ch.level}${ch.perkPoints ? ` · ${ch.perkPoints} perk ${ch.perkPoints === 1 ? 'point' : 'points'}` : ''}` : sources.currentLocation?.() ?? '');
    const hr = game.time.hour;
    setText(this.when, `${romanHour(hr).latin} · ${formatClock(hr)}`);
    setText(this.whenSub, game.time.formatRoman());
  }
}

function labelOf(id: MenuTabId) {
  return { character: 'Character', skills: 'Skills', inventory: 'Inventory', journal: 'Journal', map: 'Map' }[id];
}

/** Section heading with a Latin subtitle, used by several tabs. */
export function sectionTitle(title: string, latin?: string): HTMLElement {
  return h('div', { class: 'menu-section-title' }, h('span', { class: 'en' }, title), latin ? h('span', { class: 'la' }, latin) : null);
}

/** Placeholder for an absent data source. */
export function emptyState(text: string, sub?: string): HTMLElement {
  return h('div', { class: 'menu-empty' }, h('div', { class: 'big' }, text), sub ? h('div', { class: 'small' }, sub) : null);
}
