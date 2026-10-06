/**
 * The developer console, as in Bethesda's games: ` (the key left of 1) opens it over the paused
 * game, you type `tgm` or `coc ludus` and press Enter, ` or Esc closes it. ↑/↓ recall earlier
 * lines (kept across sessions), Tab completes a command name. Commands: ./commands.ts.
 *
 * Cheats last for the session only (a reload clears them), like `tgm` in Skyrim; they are
 * re-applied every frame so a load or a new character keeps them.
 */
import type { Game, System } from '../../core/Game';
import type { Modal } from '../../ui/Modal';
import type { UIManager } from '../../ui/UIManager';
import { h } from '../../ui/dom';
import { builtinCommands, type Cheats, type ConsoleCtx } from './commands';
import { parseLine } from './parse';

declare module '../../core/Game' {
  interface Game {
    console?: ConsoleSystem;
  }
}

const HISTORY_KEY = 'skyrome.console.history';
const MAX_LINES = 400;

class ConsoleView implements Modal {
  readonly id = 'console';
  readonly el: HTMLElement;
  readonly pauses = true;
  readonly hidesHud = false;
  private readonly log: HTMLElement;
  private readonly input: HTMLInputElement;
  private ui: UIManager | null = null;
  private history: string[] = loadHistory();
  private at = -1;

  constructor(private readonly run: (line: string) => Promise<unknown>, private readonly complete: (prefix: string) => string[]) {
    injectStyle();
    this.log = h('div', { class: 'console-log' });
    this.input = h('input', { class: 'console-input', type: 'text', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Console command' }) as HTMLInputElement;
    this.el = h('div', { class: 'console-panel' }, this.log, h('div', { class: 'console-line' }, h('span', { class: 'console-caret' }, '>'), this.input));
    this.input.addEventListener('keydown', (e) => this.onInputKey(e));
    this.el.addEventListener('mousedown', (e) => {
      if (e.target !== this.input) {
        e.preventDefault();
        this.input.focus();
      }
    });
  }

  onOpen(ui: UIManager) {
    this.ui = ui;
    this.at = -1;
    this.input.value = '';
    // After the opening key's own events have finished.
    setTimeout(() => this.input.focus({ preventScroll: true }), 0);
  }

  onClose() {
    this.input.blur();
  }

  print(text: string, kind: 'out' | 'cmd' | 'err' = 'out') {
    for (const line of text.split('\n')) this.log.appendChild(h('div', { class: `console-row is-${kind}` }, line));
    while (this.log.childElementCount > MAX_LINES) this.log.firstElementChild?.remove();
    this.log.scrollTop = this.log.scrollHeight;
  }

  clear() {
    this.log.textContent = '';
  }

  private onInputKey(e: KeyboardEvent) {
    e.stopPropagation();
    const close = e.code === 'Escape' || e.code === 'Backquote' || e.code === 'IntlBackslash';
    if (close) {
      e.preventDefault();
      this.ui?.close(this);
      return;
    }
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      const line = this.input.value.trim();
      this.input.value = '';
      this.at = -1;
      if (!line) return;
      if (this.history[this.history.length - 1] !== line) this.history.push(line);
      if (this.history.length > 50) this.history.shift();
      saveHistory(this.history);
      void this.run(line);
      return;
    }
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      e.preventDefault();
      if (!this.history.length) return;
      if (e.code === 'ArrowUp') this.at = this.at < 0 ? this.history.length - 1 : Math.max(0, this.at - 1);
      else this.at = this.at < 0 ? -1 : this.at + 1 >= this.history.length ? -1 : this.at + 1;
      this.input.value = this.at < 0 ? '' : this.history[this.at];
      return;
    }
    if (e.code === 'Tab') {
      e.preventDefault();
      const v = this.input.value;
      if (v.includes(' ')) return;
      const hits = this.complete(v);
      if (hits.length === 1) this.input.value = hits[0] + ' ';
      else if (hits.length > 1) this.print(hits.join('  '));
    }
  }
}

export class ConsoleSystem implements System {
  readonly name = 'console';
  readonly priority = 950;
  readonly cheats: Cheats = { god: false };
  private readonly view: ConsoleView;
  private readonly ctx: ConsoleCtx;

  constructor(private readonly game: Game, private readonly ui: UIManager) {
    const table = builtinCommands();
    this.ctx = { game, cheats: this.cheats, table, clear: () => this.view.clear() };
    this.view = new ConsoleView((line) => this.exec(line), (p) => table.complete(p));
    this.view.print('Skyrome console. Type help for the commands.');
    game.console = this;
  }

  get isOpen(): boolean {
    return this.ui.isOpen('console');
  }

  open() {
    if (!this.isOpen) this.ui.open(this.view);
  }

  close() {
    this.ui.close(this.view);
  }

  /** Run one console line (also for scripts and tests); resolves with what it printed. */
  async exec(line: string): Promise<string[]> {
    const out: string[] = [];
    const print = (s: string, kind?: 'out' | 'cmd' | 'err') => {
      out.push(s);
      this.view.print(s, kind);
    };
    print(line, 'cmd');
    const parsed = parseLine(line);
    if (!parsed) return out;
    const cmd = this.ctx.table.get(parsed.name);
    if (!cmd) {
      print(`Unknown command "${parsed.name}". Type help.`, 'err');
      return out;
    }
    try {
      const r = await cmd.run(parsed.args, this.ctx);
      for (const s of Array.isArray(r) ? r : r ? [r] : []) print(s);
    } catch (err) {
      console.error('[console]', err);
      print(`Error: ${err instanceof Error ? err.message : String(err)}`, 'err');
    }
    this.apply();
    return out;
  }

  update() {
    // Opens from play only (not over a menu, the title or a loading screen).
    if (this.game.input.pressed('console') && !this.ui.top && !this.ui.blocked) this.open();
    this.apply();
  }

  /** Re-apply the cheats (a load or a new character brings fresh vitals). */
  private apply() {
    const v = this.game.player?.sheet?.vitals;
    if (v && v.invulnerable !== this.cheats.god) v.invulnerable = this.cheats.god;
  }
}

export function installConsole(game: Game, ui: UIManager): ConsoleSystem {
  return game.addSystem(new ConsoleSystem(game, ui));
}

function loadHistory(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((s) => typeof s === 'string').slice(-50) : [];
  } catch {
    return [];
  }
}

function saveHistory(h: string[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
  } catch {
    /* private window */
  }
}

let styled = false;
function injectStyle() {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const css = `
.console-panel { position: fixed; left: 0; right: 0; top: 0; height: 44vh; z-index: 80; display: flex; flex-direction: column;
  background: rgba(10, 9, 8, 0.86); border-bottom: 1px solid rgba(214, 180, 106, 0.45); pointer-events: auto;
  font: 14px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #e9e2d0; }
.console-log { flex: 1; overflow-y: auto; padding: 0.6rem 0.9rem 0.3rem; white-space: pre-wrap; word-break: break-word; }
.console-row.is-cmd { color: #d6b46a; }
.console-row.is-cmd::before { content: '> '; opacity: 0.7; }
.console-row.is-err { color: #ff8f7a; }
.console-line { display: flex; align-items: center; gap: 0.5rem; padding: 0.45rem 0.9rem 0.6rem; border-top: 1px solid rgba(255, 255, 255, 0.08); }
.console-caret { color: #d6b46a; }
.console-input { flex: 1; background: transparent; border: 0; outline: 0; color: inherit; font: inherit; caret-color: #d6b46a; }
`;
  document.head.appendChild(h('style', {}, css));
}
