/**
 * Container / loot: the container's contents (left) and, when storing is allowed, your goods
 * (right). E/Enter takes (or stores) the selected item, R takes everything. Taking from an owned
 * container is stealing and is shown in red.
 */
import { BaseModal } from '../Modal';
import type { UIManager } from '../UIManager';
import { h, keycap, setChildren } from '../dom';
import { formatMoney, formatWeight } from '../format';
import { itemIconSvg } from '../icons';
import { NavList } from '../nav';
import type { ContainerItem, ContainerView } from '../types';
import './dialogue.css';

type Side = 'box' | 'mine';

export class ContainerScreen extends BaseModal {
  readonly id = 'container';
  private side: Side = 'box';
  private items: Record<Side, ContainerItem[]> = { box: [], mine: [] };
  private lists: Record<Side, NavList>;
  private listEls: Record<Side, HTMLElement> = { box: h('div', { class: 'ct-rows sr-scroll' }), mine: h('div', { class: 'ct-rows sr-scroll' }) };
  private colEls: Partial<Record<Side, HTMLElement>> = {};
  private off: (() => void) | null = null;

  constructor(private readonly view: ContainerView) {
    super('container-screen');
    this.lists = {
      box: new NavList({ onActivate: (_i, e) => this.move('box', (e as KeyboardEvent | undefined)?.shiftKey), onSelect: () => this.focus('box', false) }),
      mine: new NavList({ onActivate: (_i, e) => this.move('mine', (e as KeyboardEvent | undefined)?.shiftKey), onSelect: () => this.focus('mine', false) }),
    };
  }

  override onOpen(ui: UIManager) {
    super.onOpen(ui);
    const v = this.view;
    const verb = v.owned ? 'Steal' : 'Take';
    this.colEls.box = h(
      'section',
      { class: `ct-col sr-panel${v.owned ? ' owned' : ''}` },
      h('div', { class: 'ct-head' }, h('div', { class: 'title' }, v.title), v.owner ? h('div', { class: `owner${v.owned ? ' red' : ''}` }, v.owned ? `Owned by ${v.owner}` : v.owner) : null),
      this.listEls.box,
    );
    const cols = [this.colEls.box];
    if (v.playerItems && v.store) {
      this.colEls.mine = h('section', { class: 'ct-col sr-panel' }, h('div', { class: 'ct-head' }, h('div', { class: 'title' }, 'Your goods'), h('div', { class: 'owner' }, 'Bona tua')), this.listEls.mine);
      cols.unshift(this.colEls.mine);
    }
    this.el.replaceChildren(
      h('div', { class: 'sr-backdrop' }),
      h(
        'div',
        { class: `container-frame${cols.length === 1 ? ' single' : ''}` },
        h('div', { class: 'ct-columns' }, cols),
        h(
          'div',
          { class: 'sr-hints' },
          h('span', { class: `sr-hint${v.owned ? ' red' : ''}`, on: { click: () => this.move(this.side) } }, keycap('E'), this.side === 'box' ? verb : 'Store'),
          h('span', { class: `sr-hint${v.owned ? ' red' : ''}`, on: { click: () => this.takeAll() } }, keycap('R'), `${verb} all`),
          cols.length > 1 ? h('span', { class: 'sr-hint' }, keycap('←→'), 'Side') : null,
          h('span', { class: 'sr-hint', on: { click: () => this.close() } }, keycap('Esc'), 'Close'),
        ),
      ),
    );
    this.off = v.onChange?.(() => this.reload()) ?? null;
    this.reload();
    this.focus('box', true);
  }

  onClose() {
    this.off?.();
  }

  private reload() {
    this.items = { box: this.view.items(), mine: this.view.playerItems?.() ?? [] };
    for (const s of ['box', 'mine'] as Side[]) {
      const rows = this.items[s].map((it) => {
        const ic = h('span', { class: 'ic' });
        ic.innerHTML = itemIconSvg(it.def);
        return h(
          'div',
          { class: 'sr-row ct-row', dataset: { id: it.itemId } },
          ic,
          h('span', { class: 'name' }, it.def.name, it.count > 1 ? h('span', { class: 'cnt sr-num' }, ` (${it.count})`) : null),
          h('span', { class: 'wt sr-num' }, formatWeight(it.def.weight)),
          h('span', { class: 'val sr-num' }, formatMoney(it.def.value)),
        );
      });
      setChildren(this.listEls[s], rows.length ? rows : h('div', { class: 'ct-none' }, s === 'box' ? 'Empty.' : 'You carry nothing.'));
      this.lists[s].set(rows);
      if (s !== this.side) this.lists[s].blur();
    }
  }

  private focus(s: Side, select: boolean) {
    if (s === 'mine' && !this.colEls.mine) return;
    this.side = s;
    this.colEls.box?.classList.toggle('is-active', s === 'box');
    this.colEls.mine?.classList.toggle('is-active', s === 'mine');
    this.lists[s === 'box' ? 'mine' : 'box'].blur();
    if (select) this.lists[s].focus();
  }

  private move(s: Side, all = false) {
    const id = this.lists[s].selected?.dataset.id;
    const it = this.items[s].find((x) => x.itemId === id);
    if (!it) return;
    const n = all ? it.count : 1;
    if (s === 'box') this.view.take(it.itemId, n);
    else this.view.store?.(it.itemId, n);
    if (!this.view.onChange) this.reload();
  }

  private takeAll() {
    this.view.takeAll();
    if (!this.view.onChange) this.reload();
    if (!this.view.items().length) this.close();
  }

  onKey(e: KeyboardEvent): boolean {
    switch (e.code) {
      case 'KeyR': if (!e.repeat) this.takeAll(); return true;
      case 'ArrowLeft': this.focus(this.colEls.mine ? 'mine' : 'box', true); return true;
      case 'ArrowRight': this.focus('box', true); return true;
    }
    return this.lists[this.side].handleKey(e);
  }
}
