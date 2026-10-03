/** Character tab: level and progress, resources, armor, active effects, factions, statistics. */
import { toRoman } from '../../core/GameTime';
import type { UIManager } from '../UIManager';
import { h, setChildren } from '../dom';
import { formatMoney, formatRemaining } from '../format';
import type { CharacterView } from '../types';
import { emptyState, sectionTitle, type Hint, type MenuTab } from './MenuShell';

export class CharacterTab implements MenuTab {
  readonly id = 'character' as const;
  readonly label = 'Character';
  readonly el = h('div', { class: 'tab-character' });
  private ui!: UIManager;
  private ch: CharacterView | null = null;

  show(ui: UIManager) {
    this.ui = ui;
    this.ch = ui.sources.character?.() ?? null;
    this.render();
  }

  hints(): Hint[] {
    return this.ch?.perkPoints ? [{ key: 'K', label: 'Spend perk points', run: () => this.ui.openMenu('skills') }] : [];
  }

  onKey(e: KeyboardEvent) {
    if (e.code === 'Enter' && this.ch?.perkPoints) {
      this.ui.openMenu('skills');
      return true;
    }
    return false;
  }

  private render() {
    const ch = this.ch;
    if (!ch) {
      setChildren(this.el, emptyState('No character yet', 'The character sheet appears once a game is running.'));
      return;
    }
    const res = (id: 'health' | 'stamina' | 'pietas', name: string, latin: string) => {
      const r = ch.vitals[id];
      const frac = r.max > 0 ? r.current / r.max : 0;
      return h(
        'div',
        { class: `char-res ${id}` },
        h('div', { class: 'row' }, h('span', { class: 'name' }, name, h('span', { class: 'la' }, latin)), h('span', { class: 'val sr-num' }, `${Math.round(r.current)} / ${Math.round(r.max)}`)),
        h('div', { class: 'sr-meter' }, h('i', { style: `width:${(frac * 100).toFixed(1)}%` })),
      );
    };
    const persona = h(
      'section',
      { class: 'char-card sr-panel' },
      h('div', { class: 'char-name' }, ch.name),
      ch.title ? h('div', { class: 'char-title' }, ch.title) : null,
      h(
        'div',
        { class: 'char-level' },
        h('div', { class: 'num' }, h('span', { class: 'big' }, String(ch.level)), h('span', { class: 'roman' }, `Gradus ${toRoman(ch.level)}`)),
        h('div', { class: 'prog' }, h('div', { class: 'lbl' }, h('span', null, 'Next level'), h('span', { class: 'sr-num' }, `${Math.round(ch.levelProgress * 100)}%`)), h('div', { class: 'sr-meter' }, h('i', { style: `width:${(ch.levelProgress * 100).toFixed(1)}%` }))),
      ),
      ch.perkPoints
        ? h('div', { class: 'char-perkpts', on: { click: () => this.ui.openMenu('skills') } }, h('b', null, String(ch.perkPoints)), ` perk ${ch.perkPoints === 1 ? 'point' : 'points'} to spend`)
        : null,
      h('hr', { class: 'sr-rule' }),
      res('health', 'Health', 'Valetudo'),
      res('stamina', 'Stamina', 'Vires'),
      res('pietas', 'Pietas', 'Pietas'),
      ch.armorRating ? h('div', { class: 'char-armor' }, h('span', null, 'Armor rating'), h('b', { class: 'sr-num' }, String(Math.round(ch.armorRating())))) : null,
    );

    const effects = ch.effects();
    const factions = ch.factions();
    const bounties = ch.bounties?.() ?? [];
    const middle = h(
      'section',
      { class: 'char-col sr-panel' },
      sectionTitle('Active effects', 'Effectus'),
      effects.length
        ? h('ul', { class: 'char-effects' }, effects.map((e) => h('li', { class: e.kind }, h('div', { class: 'top' }, h('span', { class: 'src' }, e.source), e.remaining !== undefined ? h('span', { class: 'time sr-num' }, formatRemaining(e.remaining)) : h('span', { class: 'time' }, 'Lasting')), h('div', { class: 'desc' }, e.description))))
        : h('p', { class: 'char-none' }, 'No blessings, draughts or afflictions.'),
      sectionTitle('Allegiances', 'Factiones'),
      factions.length
        ? h('ul', { class: 'char-factions' }, factions.map((f) => h('li', null, h('div', { class: 'top' }, h('span', { class: 'name' }, f.name), f.rank ? h('span', { class: 'rank' }, f.rank) : null), f.latin ? h('div', { class: 'la' }, f.latin) : null, f.progress !== undefined ? h('div', { class: 'sr-meter thin' }, h('i', { style: `width:${(f.progress * 100).toFixed(0)}%` })) : null)))
        : h('p', { class: 'char-none' }, 'You belong to no collegium, faction or familia yet.'),
      bounties.length
        ? h('div', { class: 'char-bounties' }, sectionTitle('Bounties', 'Multae'), bounties.map((b) => h('div', { class: 'bounty' }, h('span', null, b.authority), h('b', { class: 'sr-num' }, formatMoney(b.amount, true)))))
        : null,
    );

    const stats = ch.stats?.() ?? [];
    const right = h(
      'section',
      { class: 'char-col sr-panel' },
      sectionTitle('Deeds', 'Res gestae'),
      stats.length
        ? h('dl', { class: 'char-stats' }, stats.map((s) => [h('dt', null, s.label), h('dd', { class: 'sr-num' }, s.value)]))
        : h('p', { class: 'char-none' }, 'Nothing recorded yet.'),
    );
    setChildren(this.el, persona, middle, right);
  }
}
