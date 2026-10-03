/**
 * Conversation panel driven by a DialogueView. The NPC line reveals quickly (Space/Enter/click
 * completes it); choices are picked with 1–9, ↑↓ + Enter/E, or a click. Skill checks render as
 * '[Rhetoric 40]' tags colored by the odds, bribes as '[25 denarii]'.
 *
 * The world pauses while you talk (see UIManager). Esc opens the pause menu over the conversation
 * (GDD §4.5: pause at any time, including in dialogue); Tab or Backspace leaves, like 'Goodbye'.
 */
import { codeLabel, type Action } from '../../core/Input';
import { BaseModal } from '../Modal';
import type { UIManager } from '../UIManager';
import { h, keycap, richText, setChildren, setText } from '../dom';
import { smartQuotes } from '../format';
import { NavList } from '../nav';
import type { DialogueChoiceView, DialogueView } from '../types';
import './dialogue.css';

const REVEAL_CPS = 90; // characters per second

export class DialoguePanel extends BaseModal {
  readonly id = 'dialogue';
  private off: (() => void) | null = null;
  private nameEl = h('div', { class: 'dlg-name' });
  private titleEl = h('div', { class: 'dlg-title' });
  private lineEl = h('div', { class: 'dlg-line' });
  private shownEl = h('span', { class: 'shown' });
  private hiddenEl = h('span', { class: 'hidden' });
  private choicesEl = h('div', { class: 'dlg-choices' });
  private continueEl: HTMLElement;
  private hintsEl = h('div', { class: 'dlg-hints sr-hints' });
  private nav = new NavList({ onActivate: (i) => this.choose(i) });
  private text = '';
  private shown = 0;
  private revealed = true;
  private lastLineKey = '';
  private closing = false;

  constructor(readonly view: DialogueView) {
    super('dialogue-panel');
    this.continueEl = h('div', { class: 'dlg-continue', on: { click: (e: MouseEvent) => { e.stopPropagation(); this.advance(); } } }, 'Continue', keycap('Space', 'sr-key-sm'));
    this.lineEl.append(this.shownEl, this.hiddenEl);
    this.el.append(
      h('div', { class: 'dlg-shade' }),
      h(
        'div',
        { class: 'dlg-box' },
        h('div', { class: 'dlg-head' }, this.nameEl, this.titleEl),
        this.lineEl,
        this.choicesEl,
        this.continueEl,
        this.hintsEl,
      ),
    );
    // Clicking anywhere (outside a choice) completes the line / continues.
    this.el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.dlg-choice')) return;
      this.advance();
    });
  }

  override onOpen(ui: UIManager) {
    super.onOpen(ui);
    const b = ui.game.input.bindings;
    setChildren(
      this.hintsEl,
      h('span', { class: 'sr-hint', on: { click: (e: MouseEvent) => { e.stopPropagation(); this.leave(); } } }, keycap(codeLabel(b.menu[0] ?? 'Tab'), 'sr-key-sm'), 'Leave'),
      h('span', { class: 'sr-hint', on: { click: (e: MouseEvent) => { e.stopPropagation(); ui.openPause(); } } }, keycap(codeLabel(b.pause[0] ?? 'Escape'), 'sr-key-sm'), 'Pause'),
    );
    this.off = this.view.onChange(() => this.render());
    this.render();
  }

  onClose() {
    this.off?.();
    this.off = null;
    if (!this.view.ended) this.view.end();
  }

  private render() {
    const v = this.view;
    if (v.ended) {
      if (!this.closing) {
        this.closing = true;
        this.close();
      }
      return;
    }
    const line = v.line;
    const isPlayer = line.speaker === 'player';
    setText(this.nameEl, isPlayer ? 'You' : line.name ?? v.npcName);
    setText(this.titleEl, isPlayer ? '' : line.name ? '' : v.npcTitle ?? '');
    this.el.classList.toggle('speaker-player', isPlayer);
    this.el.classList.toggle('speaker-narrator', line.speaker === 'narrator');

    const key = `${line.speaker}|${line.name ?? ''}|${line.text}`;
    if (key !== this.lastLineKey) {
      this.lastLineKey = key;
      this.text = line.text;
      this.shown = 0;
      this.revealed = this.text.length === 0;
      this.applyReveal();
    }
    this.renderChoices(v.choices);
  }

  private renderChoices(choices: readonly DialogueChoiceView[]) {
    const rows = choices.map((c, i) => {
      // Quest-related choices get a gold lozenge (like Skyrim's quest arrow); others a [bracket] tag.
      const tag = !c.tag
        ? null
        : c.tag.kind === 'quest'
          ? h('i', { class: 'dlg-quest', title: c.tag.label })
          : h('span', { class: `dlg-tag ${c.tag.kind} ${tagClass(c.tag.chance)}` }, `[${c.tag.label}]`);
      return h(
        'div',
        { class: `dlg-choice${c.disabled ? ' is-disabled' : ''}${c.seen ? ' seen' : ''}${c.exit ? ' exit' : ''}` },
        h('span', { class: 'num' }, String(i + 1)),
        h('span', { class: 'body' }, tag, tag ? ' ' : null, richText(c.text), c.disabled && c.disabledReason ? h('span', { class: 'why' }, ` — ${c.disabledReason}`) : null),
      );
    });
    setChildren(this.choicesEl, rows);
    this.nav.index = 0;
    this.nav.set(rows, false);
    this.updateVisibility();
  }

  private updateVisibility() {
    const hasChoices = this.view.choices.length > 0;
    this.choicesEl.classList.toggle('is-visible', this.revealed && hasChoices);
    this.continueEl.classList.toggle('is-visible', this.revealed && !hasChoices);
  }

  private applyReveal() {
    const n = Math.floor(this.shown);
    // The hidden remainder keeps its space so the panel never reflows while revealing.
    this.shownEl.replaceChildren(...richText(this.text.slice(0, n)).map((c) => (typeof c === 'string' ? document.createTextNode(c) : (c as Node))));
    this.hiddenEl.textContent = smartQuotes(this.text.slice(n).replace(/\*/g, ''));
    if (n >= this.text.length && !this.revealed) this.revealed = true;
    this.updateVisibility();
  }

  update(dt: number) {
    if (this.revealed) return;
    this.shown = Math.min(this.text.length, this.shown + dt * REVEAL_CPS);
    this.applyReveal();
  }

  private completeReveal() {
    this.shown = this.text.length;
    this.revealed = true;
    this.applyReveal();
  }

  private advance() {
    if (!this.revealed) return this.completeReveal();
    if (this.view.choices.length === 0) this.view.advance();
  }

  private choose(i: number) {
    if (!this.revealed) return this.completeReveal();
    const c = this.view.choices[i];
    if (!c) return;
    if (c.disabled) {
      this.ui.flash(c.disabledReason ?? 'Not available.');
      return;
    }
    this.view.choose(i);
  }

  /** End the conversation (Tab, Backspace, the Leave hint). */
  private leave() {
    if (!this.view.ended) this.view.end();
    if (!this.closing) {
      this.closing = true;
      this.close();
    }
  }

  onKey(e: KeyboardEvent): boolean {
    if (e.code === 'Backspace') {
      if (!e.repeat) this.leave();
      return true;
    }
    if (/^Digit[1-9]$/.test(e.code) || /^Numpad[1-9]$/.test(e.code)) {
      if (!e.repeat) this.choose(Number(e.code.slice(-1)) - 1);
      return true;
    }
    if (!this.revealed && ['Space', 'Enter', 'KeyE', 'NumpadEnter'].includes(e.code)) {
      if (!e.repeat) this.completeReveal();
      return true;
    }
    if (this.view.choices.length === 0 && ['Space', 'Enter', 'KeyE', 'NumpadEnter'].includes(e.code)) {
      if (!e.repeat) this.advance();
      return true;
    }
    return this.nav.handleKey(e);
  }

  /** Esc pauses (the conversation stays open underneath). */
  onEscape() {
    this.ui.openPause();
    return false;
  }

  onAction(a: Action) {
    // Tab (the 'menu' key) leaves, like Skyrim; the other menus stay closed while talking.
    if (a === 'menu') this.leave();
    return true;
  }
}

function tagClass(chance?: number): string {
  if (chance === undefined) return '';
  if (chance >= 0.999) return 'odds-sure';
  if (chance >= 0.5) return 'odds-fair';
  return 'odds-poor';
}
