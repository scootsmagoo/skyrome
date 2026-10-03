/**
 * Skills tab: skills grouped by governing resource (left), the selected skill's description and
 * perk ladder (right). ← → move between the two lists; Enter on an available perk takes it.
 */
import type { ResourceId } from '../../rpg/types';
import type { UIManager } from '../UIManager';
import { h, setChildren } from '../dom';
import { UI_ICONS, iconSvg } from '../icons';
import { NavList } from '../nav';
import type { CharacterView, PerkView, SkillView } from '../types';
import { emptyState, sectionTitle, type Hint, type MenuTab } from './MenuShell';

const GROUPS: { attr: ResourceId; title: string; latin: string }[] = [
  { attr: 'health', title: 'Martial', latin: 'Virtus' },
  { attr: 'stamina', title: 'Craft & Stealth', latin: 'Calliditas' },
  { attr: 'pietas', title: 'Civic & Sacred', latin: 'Pietas' },
];

export class SkillsTab implements MenuTab {
  readonly id = 'skills' as const;
  readonly label = 'Skills';
  readonly el = h('div', { class: 'tab-skills' });
  private ui!: UIManager;
  private ch: CharacterView | null = null;
  private skills: SkillView[] = [];
  private perks: PerkView[] = [];
  private zone: 'skills' | 'perks' = 'skills';
  private skillList = new NavList({ onSelect: () => this.renderDetail(), onActivate: () => this.focusPerks() });
  private perkList = new NavList({ onActivate: (i) => this.take(i), hoverSelects: true });
  private listEl = h('div', { class: 'skills-list sr-scroll' });
  private detailEl = h('div', { class: 'skills-detail sr-panel' });
  private selectedId: string | null = null;

  constructor() {
    this.el.append(h('section', { class: 'skills-left sr-panel' }, this.listEl), this.detailEl);
  }

  show(ui: UIManager) {
    this.ui = ui;
    this.ch = ui.sources.character?.() ?? null;
    this.zone = 'skills';
    this.renderList();
  }

  hints(): Hint[] {
    return [
      { key: '↑↓', label: 'Select' },
      { key: '←→', label: this.zone === 'skills' ? 'Perks' : 'Skills', run: () => (this.zone === 'skills' ? this.focusPerks() : this.focusSkills()) },
      ...(this.zone === 'perks' ? [{ key: 'E', label: 'Take perk', run: () => this.perkList.activate() }] : []),
    ];
  }

  onKey(e: KeyboardEvent): boolean {
    if (e.code === 'ArrowRight' && this.zone === 'skills') return this.focusPerks(), true;
    if (e.code === 'ArrowLeft' && this.zone === 'perks') return this.focusSkills(), true;
    return (this.zone === 'skills' ? this.skillList : this.perkList).handleKey(e);
  }

  private focusPerks() {
    if (!this.perkList.items.length) return;
    this.zone = 'perks';
    this.skillList.items[this.skillList.index]?.classList.add('is-anchored');
    this.perkList.focus();
    this.el.classList.add('zone-perks');
    this.refreshHints();
  }

  private focusSkills() {
    this.zone = 'skills';
    this.perkList.blur();
    this.el.classList.remove('zone-perks');
    this.refreshHints();
  }

  private refreshHints() {
    const shell = this.ui.top as { renderFooter?: () => void } | undefined;
    shell?.renderFooter?.();
  }

  private renderList() {
    const ch = this.ch;
    if (!ch) {
      setChildren(this.el, emptyState('No skills to show', 'Skills appear once a character exists.'));
      return;
    }
    if (!this.el.contains(this.listEl)) this.el.replaceChildren(h('section', { class: 'skills-left sr-panel' }, this.listEl), this.detailEl);
    this.skills = ch.skills();
    const rows: HTMLElement[] = [];
    const children: HTMLElement[] = [];
    for (const g of GROUPS) {
      const inGroup = this.skills.filter((s) => s.def.attribute === g.attr);
      if (!inGroup.length) continue;
      children.push(sectionTitle(g.title, g.latin));
      for (const s of inGroup) {
        const perkAvail = ch.perks(s.def.id).some((p) => p.available);
        const row = h(
          'div',
          { class: `sr-row skill-row ${g.attr}`, dataset: { id: s.def.id } },
          h('div', { class: 'names' }, h('span', { class: 'name' }, s.def.name), h('span', { class: 'la' }, s.def.latin)),
          perkAvail ? h('span', { class: 'perk-dot', title: 'Perk available' }) : null,
          h('div', { class: 'lvl' }, h('span', { class: 'n sr-num' }, String(s.level)), h('div', { class: 'sr-meter thin' }, h('i', { style: `width:${(s.progress * 100).toFixed(1)}%` }))),
        );
        rows.push(row);
        children.push(row);
      }
    }
    setChildren(this.listEl, children);
    const keepIdx = this.selectedId ? rows.findIndex((r) => r.dataset.id === this.selectedId) : 0;
    this.skillList.index = Math.max(0, keepIdx);
    this.skillList.set(rows);
    this.renderDetail();
  }

  private renderDetail() {
    const ch = this.ch;
    const row = this.skillList.selected;
    for (const r of this.skillList.items) r.classList.remove('is-anchored');
    if (!ch || !row) return;
    const s = this.skills.find((x) => x.def.id === row.dataset.id);
    if (!s) return;
    this.selectedId = s.def.id;
    this.perks = ch.perks(s.def.id).sort((a, b) => a.def.requiresLevel - b.def.requiresLevel);
    const perkEls = this.perks.map((p) => {
      const state = p.taken ? 'taken' : p.available ? 'available' : 'locked';
      const req = h('span', { class: 'req' }, `${s.def.name} ${p.def.requiresLevel}`);
      const badge = h('span', { class: 'badge' });
      badge.innerHTML = iconSvg(p.taken ? UI_ICONS.check : p.available ? UI_ICONS.leaf : UI_ICONS.lock);
      return h(
        'div',
        { class: `perk ${state}` },
        badge,
        h('div', { class: 'body' }, h('div', { class: 'top' }, h('span', { class: 'name' }, p.def.name), req), h('div', { class: 'desc' }, p.def.description), p.available ? h('div', { class: 'cta' }, 'Take this perk') : null),
      );
    });
    setChildren(
      this.detailEl,
      h('div', { class: 'skill-head' }, h('div', { class: 'titles' }, h('div', { class: 'name' }, s.def.name), h('div', { class: 'la' }, s.def.latin)), h('div', { class: 'big sr-num' }, String(s.level))),
      h('div', { class: 'sr-meter skill-prog' }, h('i', { style: `width:${(s.progress * 100).toFixed(1)}%` })),
      h('p', { class: 'skill-desc' }, s.def.description),
      h('p', { class: 'skill-train' }, h('b', null, 'To improve: '), s.def.howToTrain),
      sectionTitle('Perks', ch.perkPoints ? `${ch.perkPoints} ${ch.perkPoints === 1 ? 'point' : 'points'} available` : 'No points available'),
      perkEls.length ? h('div', { class: 'perk-ladder sr-scroll' }, perkEls) : h('p', { class: 'char-none' }, 'This skill has no perks yet.'),
    );
    // Every perk is selectable (to read it); only available ones can be taken.
    this.perkList.set(perkEls, false);
    if (this.zone !== 'perks') this.perkList.blur();
  }

  private take(i: number) {
    const p = this.perks[i];
    if (!p || !this.ch) return;
    if (!p.available) {
      this.ui.flash(p.taken ? 'You already know this perk.' : this.ch.perkPoints ? 'Requirements not met.' : 'No perk points to spend.');
      return;
    }
    if (this.ch.takePerk(p.def.id)) {
      this.ui.flash(`Perk learned: ${p.def.name}`);
      const keep = this.perkList.index;
      this.renderList();
      if (this.zone === 'perks') {
        this.perkList.index = keep;
        this.focusPerks();
        this.perkList.select(keep);
      }
    }
  }
}
