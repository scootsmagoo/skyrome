/**
 * Journal tab: a parchment book. Left page lists quests (Active / Completed) or Notes; right page
 * shows the selected quest's journal entries and objectives. T toggles compass tracking,
 * M shows the quest on the map, ←→ switch Active / Completed / Notes.
 */
import type { QuestCategory } from '../../quests/types';
import type { UIManager } from '../UIManager';
import { h, keycap, richText, setChildren } from '../dom';
import { paragraphs } from '../format';
import { NavList } from '../nav';
import type { NoteView, QuestLogView, QuestView } from '../types';
import { emptyState, type Hint, type MenuTab } from './MenuShell';

type Page = 'active' | 'completed' | 'notes';
const PAGES: { id: Page; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Completed' },
  { id: 'notes', label: 'Notes' },
];

const CATEGORY: Record<QuestCategory, string> = {
  main: 'The Main Road',
  faction: 'Factions & Collegia',
  arena: 'The Arena',
  misc: 'Miscellaneous',
  radiant: 'Odd Jobs',
};
const CATEGORY_ORDER: QuestCategory[] = ['main', 'faction', 'arena', 'misc', 'radiant'];

export class JournalTab implements MenuTab {
  readonly id = 'journal' as const;
  readonly label = 'Journal';
  readonly el = h('div', { class: 'tab-journal' });
  private ui!: UIManager;
  private log: QuestLogView | null = null;
  private page: Page = 'active';
  private quests: QuestView[] = [];
  private notes: NoteView[] = [];
  private list = new NavList({ onSelect: () => this.renderRight(), onActivate: () => this.activate() });
  private pageTabs = h('div', { class: 'jr-pages' });
  private listEl = h('div', { class: 'jr-list sr-scroll' });
  private rightEl = h('div', { class: 'jr-right sr-scroll' });
  private book: HTMLElement;
  private selectedKey: string | null = null;
  private off: (() => void) | null = null;

  constructor() {
    this.book = h(
      'div',
      { class: 'jr-book sr-parchment' },
      h('div', { class: 'jr-page left' }, h('div', { class: 'jr-heading' }, 'Commentarii'), this.pageTabs, this.listEl),
      h('div', { class: 'jr-fold' }),
      h('div', { class: 'jr-page right' }, this.rightEl),
    );
    this.el.append(this.book);
  }

  show(ui: UIManager) {
    this.ui = ui;
    this.log = ui.sources.quests?.() ?? null;
    this.off?.();
    this.off = this.log?.onChange?.(() => this.render()) ?? null;
    this.render();
  }

  hide() {
    this.off?.();
    this.off = null;
  }

  hints(): Hint[] {
    const hints: Hint[] = [{ key: '←→', label: 'Pages' }];
    const q = this.currentQuest();
    if (q && q.state === 'active') hints.push({ key: 'T', label: q.tracked ? 'Untrack' : 'Track', run: () => this.toggleTrack() });
    if (q && q.state === 'active') hints.push({ key: 'M', label: 'Show on map', run: () => this.showOnMap() });
    if (this.page === 'notes' && this.notes.length) hints.push({ key: 'E', label: 'Read', run: () => this.activate() });
    return hints;
  }

  onKey(e: KeyboardEvent): boolean {
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      const i = PAGES.findIndex((p) => p.id === this.page);
      const next = PAGES[(i + (e.code === 'ArrowLeft' ? -1 : 1) + PAGES.length) % PAGES.length].id;
      this.setPage(next);
      return true;
    }
    if (e.code === 'KeyT' && !e.repeat) return this.toggleTrack(), true;
    if (e.code === 'KeyM' && !e.repeat && this.currentQuest()?.state === 'active') return this.showOnMap(), true;
    return this.list.handleKey(e);
  }

  private setPage(p: Page) {
    this.page = p;
    this.selectedKey = null;
    this.list.index = 0;
    this.render();
  }

  private currentQuest(): QuestView | undefined {
    if (this.page === 'notes') return undefined;
    const id = this.list.selected?.dataset.id;
    return this.quests.find((q) => q.id === id);
  }

  private render() {
    const log = this.log;
    if (!log) {
      setChildren(this.el, emptyState('The journal is blank', 'No quest log is connected.'));
      return;
    }
    if (!this.el.contains(this.book)) this.el.replaceChildren(this.book);
    setChildren(
      this.pageTabs,
      PAGES.map((p) => h('span', { class: `jr-pagetab${p.id === this.page ? ' is-active' : ''}`, on: { click: () => this.setPage(p.id) } }, p.label)),
    );
    const rows: HTMLElement[] = [];
    const children: HTMLElement[] = [];
    if (this.page === 'notes') {
      this.notes = log.notes();
      for (const n of this.notes) {
        const row = h('div', { class: 'sr-row jr-row note', dataset: { id: n.id } }, h('span', { class: 'title' }, n.title), n.meta ? h('span', { class: 'meta' }, n.meta) : null);
        rows.push(row);
        children.push(row);
      }
    } else {
      const want = this.page === 'active' ? ['active'] : ['completed', 'failed'];
      this.quests = log.quests().filter((q) => want.includes(q.state));
      for (const cat of CATEGORY_ORDER) {
        const qs = this.quests.filter((q) => q.category === cat);
        if (!qs.length) continue;
        children.push(h('div', { class: 'jr-cat' }, CATEGORY[cat]));
        for (const q of qs) {
          const row = h(
            'div',
            { class: `sr-row jr-row${q.tracked ? ' tracked' : ''}${q.state === 'failed' ? ' failed' : ''}`, dataset: { id: q.id } },
            h('i', { class: 'mark' }),
            h('span', { class: 'title' }, q.title),
            q.state === 'failed' ? h('span', { class: 'meta' }, 'failed') : null,
          );
          rows.push(row);
          children.push(row);
        }
      }
    }
    setChildren(this.listEl, children.length ? children : h('div', { class: 'jr-none' }, this.page === 'notes' ? 'No letters or books read yet.' : this.page === 'active' ? 'No quests in progress.' : 'Nothing completed yet.'));
    const keep = this.selectedKey ? rows.findIndex((r) => r.dataset.id === this.selectedKey) : -1;
    if (keep >= 0) this.list.index = keep;
    this.list.set(rows);
    if (!rows.length) this.renderRight();
    (this.ui.top as { renderFooter?: () => void } | undefined)?.renderFooter?.();
  }

  private renderRight() {
    const id = this.list.selected?.dataset.id ?? null;
    this.selectedKey = id;
    if (this.page === 'notes') {
      const n = this.notes.find((x) => x.id === id);
      if (!n) return setChildren(this.rightEl, h('div', { class: 'jr-blank' }, 'Letters and books you read are kept here.'));
      const book = n.open();
      const paras = paragraphs(book.text).slice(0, 3);
      setChildren(
        this.rightEl,
        h('div', { class: 'jr-title' }, book.title),
        book.author ? h('div', { class: 'jr-latin' }, book.author) : null,
        h('div', { class: 'jr-ornament' }),
        h('div', { class: 'jr-excerpt' }, paras.map((p) => h('p', null, richText(p)))),
        h('button', { class: 'sr-btn jr-btn', on: { click: () => this.activate() } }, keycap('E', 'sr-key-sm'), 'Read in full'),
      );
      return;
    }
    const q = this.quests.find((x) => x.id === id);
    if (!q) return setChildren(this.rightEl, h('div', { class: 'jr-blank' }, 'Select a quest.'));
    const entries = q.entries.map((t, i) => h('p', { class: `jr-entry${i === q.entries.length - 1 && q.state === 'active' ? ' current' : ''}` }, richText(t)));
    const objectives = q.objectives.map((o) =>
      h(
        'li',
        { class: `jr-obj${o.done ? ' done' : ''}${o.optional ? ' optional' : ''}` },
        h('i', { class: 'box' }),
        h('span', { class: 'text' }, o.text, o.count && o.count > 1 ? h('span', { class: 'cnt sr-num' }, ` (${o.progress ?? 0}/${o.count})`) : null, o.optional ? h('span', { class: 'opt' }, ' — optional') : null),
      ),
    );
    setChildren(
      this.rightEl,
      h('div', { class: 'jr-title' }, q.title),
      q.latin ? h('div', { class: 'jr-latin' }, q.latin) : null,
      h('div', { class: 'jr-meta' }, [q.giver ? `Given by ${q.giver}` : null, q.location].filter(Boolean).join(' · ')),
      h('div', { class: 'jr-ornament' }),
      h('div', { class: 'jr-entries' }, entries),
      objectives.length ? h('div', { class: 'jr-objhead' }, 'Objectives') : null,
      objectives.length ? h('ul', { class: 'jr-objs' }, objectives) : null,
      q.state === 'active'
        ? h(
            'div',
            { class: 'jr-actions' },
            h('button', { class: `sr-btn jr-btn${q.tracked ? ' is-on' : ''}`, on: { click: () => this.toggleTrack() } }, keycap('T', 'sr-key-sm'), q.tracked ? 'Tracked' : 'Track'),
            h('button', { class: 'sr-btn jr-btn', on: { click: () => this.showOnMap() } }, keycap('M', 'sr-key-sm'), 'Show on map'),
          )
        : h('div', { class: `jr-stamp ${q.state}` }, q.state === 'completed' ? 'Peractum' : 'Irritum'),
    );
    (this.ui.top as { renderFooter?: () => void } | undefined)?.renderFooter?.();
  }

  private activate() {
    if (this.page === 'notes') {
      const n = this.notes.find((x) => x.id === this.list.selected?.dataset.id);
      if (n) this.ui.openBook(n.open());
    } else this.toggleTrack();
  }

  private toggleTrack() {
    const q = this.currentQuest();
    if (!q || q.state !== 'active' || !this.log) return;
    this.log.setTracked(q.id, !q.tracked);
    if (!this.log.onChange) this.render();
  }

  private showOnMap() {
    const q = this.currentQuest();
    if (!q) return;
    this.ui.openMenu('journal').focusQuest(q.id);
  }
}
