/**
 * Barter: your goods (left) and the merchant's wares (right). Items go into a pending deal
 * (E/Enter adds one, Shift adds all, X takes one back); the deal tray shows totals and both purses
 * after the trade; C (or the button) confirms, Backspace clears.
 */
import { BaseModal } from '../Modal';
import type { UIManager } from '../UIManager';
import { h, keycap, setChildren } from '../dom';
import { formatMoney, formatWeight } from '../format';
import { itemIconSvg } from '../icons';
import { adjustDeal, dealCount, emptyDeal, summarizeDeal } from '../models';
import { NavList } from '../nav';
import type { BarterView, Deal, TradeItem } from '../types';
import './dialogue.css';

type Side = 'sell' | 'buy';

export class BarterScreen extends BaseModal {
  readonly id = 'barter';
  private deal: Deal = emptyDeal();
  private side: Side = 'buy';
  private goods: Record<Side, TradeItem[]> = { sell: [], buy: [] };
  private lists: Record<Side, NavList>;
  private listEls: Record<Side, HTMLElement> = { sell: h('div', { class: 'bt-rows sr-scroll' }), buy: h('div', { class: 'bt-rows sr-scroll' }) };
  private colEls: Record<Side, HTMLElement>;
  private purseEls: Record<Side, HTMLElement> = { sell: h('div', { class: 'bt-purse' }), buy: h('div', { class: 'bt-purse' }) };
  private trayEl = h('div', { class: 'bt-tray sr-panel' });
  private off: (() => void) | null = null;

  constructor(private readonly view: BarterView) {
    super('barter-screen');
    const mk = (s: Side) =>
      new NavList({
        onActivate: (_i, e) => this.add(s, (e as KeyboardEvent | MouseEvent | undefined)?.shiftKey ? 9999 : 1),
        onSelect: () => this.focusSide(s, false),
      });
    this.lists = { sell: mk('sell'), buy: mk('buy') };
    this.colEls = {
      sell: h('section', { class: 'bt-col sr-panel' }, h('div', { class: 'bt-colhead' }, h('div', { class: 'who' }, 'Your goods', h('span', { class: 'la' }, 'Bona tua')), this.purseEls.sell), h('div', { class: 'bt-cols' }, h('span', null, 'Item'), h('span', null, 'Wt'), h('span', null, 'Price')), this.listEls.sell),
      buy: h('section', { class: 'bt-col sr-panel' }, h('div', { class: 'bt-colhead' }, h('div', { class: 'who' }, `${view.merchantName}'s wares`, h('span', { class: 'la' }, 'Merces')), this.purseEls.buy), h('div', { class: 'bt-cols' }, h('span', null, 'Item'), h('span', null, 'Wt'), h('span', null, 'Price')), this.listEls.buy),
    };
  }

  override onOpen(ui: UIManager) {
    super.onOpen(ui);
    this.el.replaceChildren(
      h('div', { class: 'sr-backdrop' }),
      h(
        'div',
        { class: 'barter-frame' },
        h('div', { class: 'bt-title' }, h('div', { class: 'name' }, this.view.merchantName), this.view.merchantTitle ? h('div', { class: 'sub' }, this.view.merchantTitle) : null),
        h('div', { class: 'bt-columns' }, this.colEls.sell, this.colEls.buy),
        this.trayEl,
        h(
          'div',
          { class: 'sr-hints' },
          h('span', { class: 'sr-hint' }, keycap('←→'), 'Side'),
          h('span', { class: 'sr-hint', on: { click: () => this.add(this.side, 1) } }, keycap('E'), 'Add'),
          h('span', { class: 'sr-hint', on: { click: () => this.add(this.side, -1) } }, keycap('X'), 'Remove'),
          h('span', { class: 'sr-hint', on: { click: () => this.confirm() } }, keycap('C'), 'Confirm'),
          h('span', { class: 'sr-hint', on: { click: () => this.clear() } }, keycap('⌫'), 'Clear'),
          h('span', { class: 'sr-hint', on: { click: () => this.close() } }, keycap('Esc'), 'Leave'),
        ),
      ),
    );
    this.off = this.view.onChange?.(() => this.reload()) ?? null;
    this.reload();
    this.focusSide('buy', true);
  }

  onClose() {
    this.off?.();
  }

  private reload() {
    this.goods = { sell: this.view.playerGoods(), buy: this.view.merchantGoods() };
    // Drop deal lines for goods that vanished.
    this.deal = {
      buy: this.deal.buy.filter((l) => this.goods.buy.some((t) => t.itemId === l.itemId)),
      sell: this.deal.sell.filter((l) => this.goods.sell.some((t) => t.itemId === l.itemId)),
    };
    this.render();
  }

  private render() {
    for (const s of ['sell', 'buy'] as Side[]) {
      const rows = this.goods[s].map((t) => {
        const ic = h('span', { class: 'ic' });
        ic.innerHTML = itemIconSvg(t.def);
        const inDeal = dealCount(this.deal[s], t.itemId);
        const left = t.count - inDeal;
        return h(
          'div',
          { class: `sr-row bt-row${t.refuse && s === 'sell' ? ' refused' : ''}${inDeal ? ' in-deal' : ''}${left <= 0 ? ' all-in' : ''}`, dataset: { id: t.itemId } },
          ic,
          h('span', { class: 'name' }, h('span', { class: 'n' }, t.def.name), t.count > 1 ? h('span', { class: 'cnt sr-num' }, ` (${left})`) : null, t.equipped ? h('i', { class: 'eq' }) : null, t.stolen ? h('span', { class: 'stolen-tag' }, 'stolen') : null, inDeal ? h('span', { class: 'deal-n sr-num' }, `×${inDeal}`) : null),
          h('span', { class: 'wt sr-num' }, formatWeight(t.def.weight)),
          h('span', { class: 'price sr-num' }, formatMoney(t.price)),
        );
      });
      setChildren(this.listEls[s], rows.length ? rows : h('div', { class: 'bt-none' }, s === 'sell' ? 'You have nothing they want.' : 'Sold out.'));
      const keep = this.lists[s].index;
      this.lists[s].index = keep;
      this.lists[s].set(rows);
      if (s !== this.side) this.lists[s].blur();
    }
    this.renderTray();
  }

  private renderTray() {
    const v = this.view;
    const sum = summarizeDeal(this.deal, this.goods.sell, this.goods.buy, v.playerDenarii(), v.merchantDenarii());
    const purse = (n: number) => [h('i', { class: 'coin-dot' }), h('span', { class: 'sr-num' }, formatMoney(n)), Number.isInteger(n) ? h('span', { class: 'unit' }, 'denarii') : null];
    setChildren(this.purseEls.sell, purse(v.playerDenarii()));
    setChildren(this.purseEls.buy, purse(v.merchantDenarii()));
    const line = (s: Side) =>
      this.deal[s].map((l) => {
        const t = this.goods[s].find((x) => x.itemId === l.itemId)!;
        return h('span', { class: 'chip', on: { click: () => this.adjust(s, l.itemId, -1) } }, `${t.def.name}${l.count > 1 ? ` ×${l.count}` : ''}`);
      });
    const empty = !this.deal.buy.length && !this.deal.sell.length;
    const net = sum.net;
    const load = v.playerLoad?.();
    setChildren(
      this.trayEl,
      h(
        'div',
        { class: 'bt-deal' },
        h('div', { class: 'side' }, h('div', { class: 'lbl' }, 'You give'), h('div', { class: 'chips' }, this.deal.sell.length ? line('sell') : h('span', { class: 'none' }, '—'))),
        h('div', { class: 'side' }, h('div', { class: 'lbl' }, 'You receive'), h('div', { class: 'chips' }, this.deal.buy.length ? line('buy') : h('span', { class: 'none' }, '—'))),
      ),
      h(
        'div',
        { class: 'bt-sum' },
        h('div', { class: `net ${net < 0 ? 'pay' : net > 0 ? 'gain' : ''}` }, empty ? 'Choose goods to trade' : net < 0 ? `You pay ${formatMoney(-net, true)}` : net > 0 ? `You receive ${formatMoney(net, true)}` : 'An even exchange'),
        h('div', { class: 'after sr-num' }, `Purse after: ${formatMoney(Math.max(0, sum.playerAfter))}`, load ? ` · Load ${formatWeight(load.weight + sum.weightDelta)} / ${formatWeight(load.max)}` : ''),
        sum.reason && !empty ? h('div', { class: 'reason' }, sum.reason) : null,
      ),
      h('button', { class: `sr-btn sr-btn-primary bt-confirm${sum.ok ? '' : ' is-disabled'}`, on: { click: () => this.confirm() } }, keycap('C', 'sr-key-sm'), 'Confirm'),
    );
  }

  private focusSide(s: Side, select: boolean) {
    if (this.side === s && !select) return;
    this.side = s;
    this.colEls.sell.classList.toggle('is-active', s === 'sell');
    this.colEls.buy.classList.toggle('is-active', s === 'buy');
    const other = s === 'sell' ? 'buy' : 'sell';
    this.lists[other].blur();
    if (select) this.lists[s].focus();
  }

  private add(s: Side, n: number) {
    const row = this.lists[s].selected;
    if (row) this.adjust(s, row.dataset.id!, n);
  }

  private adjust(s: Side, itemId: string, n: number) {
    const t = this.goods[s].find((x) => x.itemId === itemId);
    if (!t) return;
    if (s === 'sell' && t.refuse && n > 0) {
      this.ui.flash(t.refuse);
      return;
    }
    this.deal = adjustDeal(this.deal, s, itemId, n, t.count);
    this.render();
  }

  private clear() {
    this.deal = emptyDeal();
    this.render();
  }

  private confirm() {
    const v = this.view;
    const sum = summarizeDeal(this.deal, this.goods.sell, this.goods.buy, v.playerDenarii(), v.merchantDenarii());
    if (!sum.ok) {
      if (sum.reason) this.ui.flash(sum.reason);
      return;
    }
    const res = v.commit(this.deal);
    if (!res.ok) {
      this.ui.flash(res.reason);
      return;
    }
    this.ui.flash(sum.net < 0 ? `Paid ${formatMoney(-sum.net, true)}` : sum.net > 0 ? `Received ${formatMoney(sum.net, true)}` : 'Trade complete');
    this.deal = emptyDeal();
    if (!v.onChange) this.reload();
    else this.render();
  }

  onKey(e: KeyboardEvent): boolean {
    switch (e.code) {
      case 'ArrowLeft': this.focusSide('sell', true); return true;
      case 'ArrowRight': this.focusSide('buy', true); return true;
      case 'KeyX': this.add(this.side, e.shiftKey ? -9999 : -1); return true;
      case 'KeyC': if (!e.repeat) this.confirm(); return true;
      case 'Backspace': case 'Delete': this.clear(); return true;
    }
    return this.lists[this.side].handleKey(e);
  }
}
