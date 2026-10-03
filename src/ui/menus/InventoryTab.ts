/**
 * Inventory tab: categories (left), sortable item list (middle), item details (right).
 * Keys: ↑↓ items, ←→ categories, E/Enter equip/use/read, X drop, S cycle sort.
 */
import type { ItemDef } from '../../rpg/types';
import type { UIManager } from '../UIManager';
import { h, keycap, setChildren } from '../dom';
import { formatMoney, formatWeight } from '../format';
import { UI_ICONS, iconSvg, itemIconSvg } from '../icons';
import {
  INVENTORY_CATEGORIES,
  SORT_KEYS,
  filterEntries,
  primaryAction,
  primaryStat,
  sortEntries,
  type InventoryCategory,
  type SortKey,
} from '../models';
import { NavList } from '../nav';
import type { InventoryEntry, InventoryView } from '../types';
import { emptyState, type Hint, type MenuTab } from './MenuShell';

export class InventoryTab implements MenuTab {
  readonly id = 'inventory' as const;
  readonly label = 'Inventory';
  readonly el = h('div', { class: 'tab-inventory' });
  private ui!: UIManager;
  private inv: InventoryView | null = null;
  private cat: InventoryCategory = 'all';
  private sort: SortKey = 'name';
  private entries: InventoryEntry[] = [];
  private catEls: HTMLElement[] = [];
  private catList = new NavList({ onSelect: (i) => this.setCategory(INVENTORY_CATEGORIES[i].id), hoverSelects: false });
  private list = new NavList({ onSelect: () => this.renderDetail(), onActivate: () => this.primary() });
  private listEl = h('div', { class: 'inv-rows sr-scroll' });
  private headEl = h('div', { class: 'inv-head' });
  private detailEl = h('section', { class: 'inv-detail sr-panel' });
  private catEl = h('nav', { class: 'inv-cats sr-panel' });
  private selectedId: string | null = null;
  private off: (() => void) | null = null;

  constructor() {
    this.catEls = INVENTORY_CATEGORIES.map((c) =>
      h('div', { class: 'sr-row inv-cat' }, h('span', { class: 'en' }, c.label), h('span', { class: 'la' }, c.latin)),
    );
    this.catEl.append(...this.catEls);
    this.catList.set(this.catEls);
    this.el.append(this.catEl, h('section', { class: 'inv-list sr-panel' }, this.headEl, this.listEl), this.detailEl);
  }

  show(ui: UIManager) {
    this.ui = ui;
    this.inv = ui.sources.inventory?.() ?? null;
    this.off?.();
    this.off = this.inv?.onChange?.(() => this.rebuild()) ?? null;
    this.rebuild();
  }

  hide() {
    this.off?.();
    this.off = null;
  }

  status() {
    const inv = this.inv;
    if (!inv) return null;
    const over = inv.weight > inv.maxWeight;
    const w = h('span', { class: `stat${over ? ' over' : ''}` });
    w.innerHTML = iconSvg(UI_ICONS.weight);
    w.append(h('span', { class: 'sr-num' }, `${formatWeight(inv.weight)} / ${formatWeight(inv.maxWeight)}`));
    const whole = Number.isInteger(inv.denarii);
    const c = h('span', { class: 'stat coin' }, h('i', { class: 'coin-dot' }), h('span', { class: 'sr-num' }, formatMoney(inv.denarii)), whole ? h('span', { class: 'unit' }, 'denarii') : null);
    return [w, c];
  }

  hints(): Hint[] {
    const e = this.current();
    const act = e ? primaryAction(e.def) : null;
    const label = act === 'equip' ? (e?.equipped ? 'Unequip' : 'Equip') : act === 'use' ? 'Use' : act === 'read' ? 'Read' : null;
    const hints: Hint[] = [{ key: '←→', label: 'Category' }];
    if (label) hints.push({ key: 'E', label, run: () => this.primary() });
    if (e && !e.def.questItem) hints.push({ key: 'X', label: 'Drop', run: () => this.drop() });
    hints.push({ key: 'S', label: `Sort: ${SORT_KEYS.find((k) => k.id === this.sort)!.label}`, run: () => this.cycleSort() });
    return hints;
  }

  onKey(e: KeyboardEvent): boolean {
    switch (e.code) {
      case 'ArrowLeft': this.catList.move(-1); return true;
      case 'ArrowRight': this.catList.move(1); return true;
      case 'KeyX': case 'Delete': case 'Backspace': if (!e.repeat) this.drop(e.shiftKey); return true;
      case 'KeyS': if (!e.repeat) this.cycleSort(); return true;
      case 'KeyR': if (!e.repeat && this.current()?.def.type === 'book') this.primary(); return true;
    }
    return this.list.handleKey(e);
  }

  private current(): InventoryEntry | undefined {
    const row = this.list.selected;
    return row ? this.entries.find((x) => x.itemId === row.dataset.id) : undefined;
  }

  private setCategory(c: InventoryCategory) {
    if (c === this.cat) return;
    this.cat = c;
    this.selectedId = null;
    this.list.index = 0;
    this.renderList();
  }

  private cycleSort() {
    const i = SORT_KEYS.findIndex((k) => k.id === this.sort);
    this.sort = SORT_KEYS[(i + 1) % SORT_KEYS.length].id;
    this.renderList();
  }

  private rebuild() {
    if (!this.inv) {
      setChildren(this.el, emptyState('Your satchel is empty', 'No inventory is connected.'));
      return;
    }
    if (!this.el.contains(this.detailEl)) this.el.replaceChildren(this.catEl, h('section', { class: 'inv-list sr-panel' }, this.headEl, this.listEl), this.detailEl);
    this.renderList();
  }

  private renderList() {
    const inv = this.inv;
    if (!inv) return;
    const all = inv.entries();
    // Counts per category on the category list.
    INVENTORY_CATEGORIES.forEach((c, i) => {
      const n = filterEntries(all, c.id).length;
      this.catEls[i].classList.toggle('is-empty', n === 0);
      this.catEls[i].classList.toggle('is-active', c.id === this.cat);
    });
    this.entries = sortEntries(filterEntries(all, this.cat), this.sort);

    setChildren(
      this.headEl,
      SORT_KEYS.map((k) =>
        h('span', { class: `col ${k.id}${k.id === this.sort ? ' is-sorted' : ''}`, on: { click: () => { this.sort = k.id; this.renderList(); } } }, k.id === 'stat' ? 'Dmg·Arm' : k.id === 'weight' ? 'Wt' : k.id === 'value' ? 'Val' : 'Item'),
      ),
    );
    const rows = this.entries.map((e) => {
      const icon = h('span', { class: 'ic' });
      icon.innerHTML = itemIconSvg(e.def);
      const stat = primaryStat(e.def);
      return h(
        'div',
        { class: `sr-row inv-row${e.equipped ? ' equipped' : ''}${e.stolen ? ' stolen' : ''}`, dataset: { id: e.itemId } },
        icon,
        h('span', { class: 'col name' }, h('span', { class: 'n' }, e.def.name), e.count > 1 ? h('span', { class: 'cnt sr-num' }, `(${e.count})`) : null, e.equipped ? h('i', { class: 'eq', title: 'Equipped' }) : null, e.stolen ? h('span', { class: 'stolen-tag' }, 'stolen') : null),
        h('span', { class: 'col stat sr-num' }, stat === null ? '—' : String(stat)),
        h('span', { class: 'col weight sr-num' }, formatWeight(e.def.weight)),
        h('span', { class: 'col value sr-num' }, formatMoney(e.def.value)),
      );
    });
    setChildren(this.listEl, rows.length ? rows : h('div', { class: 'inv-none' }, 'Nothing of this kind.'));
    const keep = this.selectedId ? rows.findIndex((r) => r.dataset.id === this.selectedId) : -1;
    if (keep >= 0) this.list.index = keep;
    this.list.set(rows);
    if (!rows.length) this.renderDetail();
    this.renderFooter();
  }

  private renderFooter() {
    (this.ui.top as { renderFooter?: () => void } | undefined)?.renderFooter?.();
  }

  private renderDetail() {
    const e = this.current();
    this.selectedId = e?.itemId ?? null;
    if (!e) {
      setChildren(this.detailEl, h('div', { class: 'inv-detail-empty' }, 'Select an item'));
      this.renderFooter();
      return;
    }
    const d = e.def;
    const medal = h('div', { class: 'medal' });
    medal.innerHTML = itemIconSvg(d);
    const stats: [string, string][] = [];
    if (d.weapon) {
      stats.push(['Damage', String(d.weapon.damage)], ['Speed', d.weapon.speed.toFixed(1)], ['Reach', `${d.weapon.reach.toFixed(1)} m`]);
      if (d.weapon.twoHanded) stats.push(['Grip', 'Two hands']);
    }
    if (d.armor) stats.push(['Armor', String(d.armor.rating)], ['Class', d.armor.weightClass === 'heavy' ? 'Heavy' : d.armor.weightClass === 'light' ? 'Light' : 'Clothing']);
    if (d.shield) stats.push(['Armor', String(d.shield.rating)], ['Blocks', `${Math.round(d.shield.blockMitigation * 100)}%`]);
    stats.push(['Weight', formatWeight(d.weight)], ['Value', formatMoney(d.value)]);
    const effects = (d.effects ?? []).map((ef) => h('li', null, describeEffect(ef)));
    const act = primaryAction(d);
    const actLabel = act === 'equip' ? (e.equipped ? 'Unequip' : 'Equip') : act === 'use' ? 'Use' : act === 'read' ? 'Read' : null;
    setChildren(
      this.detailEl,
      medal,
      h('div', { class: 'title' }, d.name),
      d.latin ? h('div', { class: 'la' }, d.latin) : null,
      h('div', { class: 'kind' }, kindLine(d), e.equipped ? h('span', { class: 'eqtag' }, ' · Equipped') : null),
      h('dl', { class: 'inv-stats' }, stats.map(([k, v]) => h('div', null, h('dt', null, k), h('dd', { class: 'sr-num' }, v)))),
      effects.length ? h('ul', { class: 'inv-effects' }, effects) : null,
      h('p', { class: 'desc' }, d.description),
      d.teaches ? h('p', { class: 'teaches' }, 'Reading this will improve a skill.') : null,
      e.stolen ? h('p', { class: 'warn' }, 'Stolen — honest merchants will not buy it.') : null,
      h(
        'div',
        { class: 'actions' },
        actLabel ? h('button', { class: 'sr-btn sr-btn-primary', on: { click: () => this.primary() } }, keycap('E', 'sr-key-sm'), actLabel) : null,
        !d.questItem ? h('button', { class: 'sr-btn', on: { click: () => this.drop() } }, keycap('X', 'sr-key-sm'), 'Drop') : null,
      ),
    );
    this.renderFooter();
  }

  private primary() {
    const e = this.current();
    const inv = this.inv;
    if (!e || !inv) return;
    const act = primaryAction(e.def);
    if (act === 'equip') {
      if (!inv.toggleEquip(e.itemId)) this.ui.flash('You cannot equip that.');
    } else if (act === 'use') {
      if (inv.use(e.itemId)) this.ui.flash(`${e.def.name} used`);
    } else if (act === 'read') {
      const book = inv.read?.(e.itemId);
      if (book) this.ui.openBook(book);
    }
    if (!inv.onChange) this.renderList();
  }

  private drop(all = false) {
    const e = this.current();
    const inv = this.inv;
    if (!e || !inv || e.def.questItem) {
      if (e?.def.questItem) this.ui.flash('You cannot drop a quest item.');
      return;
    }
    if (inv.drop(e.itemId, all ? e.count : 1)) this.ui.flash(`${e.def.name}${all && e.count > 1 ? ` (${e.count})` : ''} dropped`);
    if (!inv.onChange) this.renderList();
  }
}

function kindLine(d: ItemDef): string {
  if (d.weapon) {
    const cls = { blade: 'Blade', spear: 'Spear', blunt: 'Club', bow: 'Bow', sling: 'Sling', thrown: 'Thrown', unarmed: 'Fist weapon' }[d.weapon.class];
    return `${d.weapon.twoHanded ? 'Two-handed' : 'One-handed'} ${cls.toLowerCase()}`;
  }
  if (d.shield) return 'Shield';
  if (d.armor) return `${d.armor.weightClass === 'heavy' ? 'Heavy' : d.armor.weightClass === 'light' ? 'Light' : ''} armor${d.slot ? ` · ${slotName(d.slot)}` : ''}`.trim();
  const names: Record<string, string> = { clothing: 'Clothing', consumable: 'Food & drink', ingredient: 'Ingredient', book: d.tags?.includes('letter') ? 'Letter' : 'Book', key: 'Key', tool: 'Tool', misc: 'Miscellany', quest: 'Quest item', ammo: 'Ammunition' };
  return `${names[d.type] ?? d.type}${d.slot && d.type === 'clothing' ? ` · ${slotName(d.slot)}` : ''}`;
}

function slotName(s: string) {
  return { mainHand: 'Main hand', offHand: 'Off hand', head: 'Head', body: 'Body', hands: 'Hands', legs: 'Legs', feet: 'Feet', cloak: 'Cloak', neck: 'Neck', finger: 'Finger', ammo: 'Ammunition' }[s] ?? s;
}

function describeEffect(ef: NonNullable<ItemDef['effects']>[number]): string {
  const target = { health: 'Health', stamina: 'Stamina', pietas: 'Pietas' }[ef.target] ?? ef.target;
  const dur = ef.duration ? ` for ${ef.duration} s` : '';
  switch (ef.kind) {
    case 'restore': return `Restores ${ef.amount} ${target}`;
    case 'regen': return `+${ef.amount} ${target} per second${dur}`;
    case 'fortify': return `Fortifies ${target} by ${ef.amount}${dur}`;
    case 'damage': return `Harms ${target} by ${ef.amount}${dur}`;
    case 'cure': return `Cures ${ef.target}`;
    case 'modifier': return `${ef.target} ${ef.amount > 0 ? '+' : ''}${Math.round(ef.amount * 100)}%${dur}`;
    default: return `${ef.kind} ${target} ${ef.amount}${dur}`;
  }
}
