/**
 * Book / letter reader on parchment. Books open as a two-page spread paginated with CSS columns;
 * letters and notes as a single sheet with a wax seal. ←→ (or clicking a page) turns pages,
 * E takes a book lying in the world, Esc closes.
 */
import { BaseModal } from '../Modal';
import type { UIManager } from '../UIManager';
import { h, keycap, richText, setText } from '../dom';
import { pageNumeral, paragraphs } from '../format';
import { laurelRule } from '../motifs';
import type { BookView } from '../types';
import './dialogue.css';

export class BookReader extends BaseModal {
  readonly id = 'book';
  private flow = h('div', { class: 'bk-flow' });
  private viewport = h('div', { class: 'bk-viewport' }, this.flow);
  private numL = h('div', { class: 'bk-num left' });
  private numR = h('div', { class: 'bk-num right' });
  private prevBtn: HTMLElement;
  private nextBtn: HTMLElement;
  private spread = 0;
  private spreads = 1;
  private perSpread: number;
  private ro: ResizeObserver | null = null;

  constructor(private readonly book: BookView) {
    super(`book-reader ${book.kind === 'book' || book.kind === 'scroll' ? 'is-book' : 'is-letter'}`);
    this.perSpread = book.kind === 'book' || book.kind === 'scroll' ? 2 : 1;
    this.prevBtn = h('div', { class: 'bk-turn prev', on: { click: () => this.turn(-1) } }, '‹');
    this.nextBtn = h('div', { class: 'bk-turn next', on: { click: () => this.turn(1) } }, '›');
  }

  override onOpen(ui: UIManager) {
    super.onOpen(ui);
    const b = this.book;
    const rule = h('div', { class: 'bk-rule' });
    rule.innerHTML = laurelRule(220, 28);
    const paras = paragraphs(b.text).map((p, i) => h('p', { class: i === 0 ? 'first' : '' }, richText(p)));
    this.flow.replaceChildren(
      h('header', { class: 'bk-head' }, h('div', { class: 'bk-title' }, b.title), b.author ? h('div', { class: 'bk-author' }, b.author) : null, rule),
      ...paras,
      this.perSpread === 1 ? h('div', { class: 'bk-seal' }) : h('div', { class: 'bk-finis' }, 'FINIS'),
    );
    this.el.replaceChildren(
      h('div', { class: 'sr-backdrop' }),
      h(
        'div',
        { class: 'bk-wrap' },
        h('div', { class: 'bk-page sr-parchment' }, this.perSpread === 2 ? h('div', { class: 'bk-fold' }) : null, this.viewport, this.numL, this.numR),
        this.prevBtn,
        this.nextBtn,
      ),
      h(
        'div',
        { class: 'sr-hints bk-hints' },
        h('span', { class: 'sr-hint', on: { click: () => this.turn(-1) } }, keycap('←'), 'Previous'),
        h('span', { class: 'sr-hint', on: { click: () => this.turn(1) } }, keycap('→'), 'Next'),
        b.onTake ? h('span', { class: 'sr-hint', on: { click: () => this.take() } }, keycap('E'), 'Take') : null,
        h('span', { class: 'sr-hint', on: { click: () => this.close() } }, keycap('Esc'), 'Close'),
      ),
    );
    this.viewport.addEventListener('click', (e) => {
      const r = this.viewport.getBoundingClientRect();
      this.turn(e.clientX < r.left + r.width / 2 ? -1 : 1);
    });
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.viewport);
    requestAnimationFrame(() => this.layout());
    void document.fonts?.ready.then(() => this.layout());
  }

  onClose() {
    this.ro?.disconnect();
  }

  private layout() {
    const w = this.viewport.clientWidth;
    if (!w) return;
    const gap = this.perSpread === 2 ? parseFloat(getComputedStyle(this.viewport).getPropertyValue('--bk-gap')) || 64 : 0;
    const col = (w - gap * (this.perSpread - 1)) / this.perSpread;
    this.flow.style.columnWidth = `${col}px`;
    this.flow.style.columnGap = `${gap}px`;
    this.flow.style.width = `${w}px`;
    // Columns overflow horizontally; count them from the scroll width.
    const pages = Math.max(1, Math.round((this.flow.scrollWidth + gap) / (col + gap)));
    this.spreads = Math.max(1, Math.ceil(pages / this.perSpread));
    this.spread = Math.min(this.spread, this.spreads - 1);
    this.apply(w + gap);
  }

  private apply(stride = this.viewport.clientWidth + (this.perSpread === 2 ? parseFloat(this.flow.style.columnGap) || 0 : 0)) {
    this.flow.style.transform = `translateX(${-this.spread * stride}px)`;
    const first = this.spread * this.perSpread + 1;
    setText(this.numL, pageNumeral(first));
    setText(this.numR, this.perSpread === 2 ? pageNumeral(first + 1) : '');
    this.prevBtn.classList.toggle('is-hidden', this.spread === 0);
    this.nextBtn.classList.toggle('is-hidden', this.spread >= this.spreads - 1);
  }

  private turn(d: number) {
    const next = Math.max(0, Math.min(this.spreads - 1, this.spread + d));
    if (next === this.spread) return;
    this.spread = next;
    this.flow.classList.remove('bk-turning');
    void this.flow.offsetWidth;
    this.flow.classList.add('bk-turning');
    this.apply();
  }

  private take() {
    this.book.onTake?.();
    this.ui.flash(`${this.book.title} taken`);
    this.close();
  }

  onKey(e: KeyboardEvent): boolean {
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA': this.turn(-1); return true;
      case 'ArrowRight': case 'KeyD': case 'Space': this.turn(1); return true;
      case 'KeyE': if (this.book.onTake && !e.repeat) this.take(); return true;
    }
    return false;
  }
}
