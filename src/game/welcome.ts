/**
 * The welcome card of the shareable test build: what this is, the keys that matter, where the
 * settings are. Shown once per browser (localStorage, best effort) over the first view (the cart
 * at the Porta Capena); any key or a click closes it. Never shown to automation unless `?welcome=1`.
 */
import type { Game } from '../core/Game';
import { h, keycap } from '../ui/dom';

const SEEN_KEY = 'skyrome.welcomed';

const KEYS: [string[], string][] = [
  [['Click'], 'look around with the mouse (Esc lets go)'],
  [['W', 'A', 'S', 'D'], 'walk · Shift sprints'],
  [['F'], 'attack · hold for a power attack'],
  [['Q'], 'block · tap just before a blow lands to parry'],
  [['R'], 'draw or sheathe your sword'],
  [['E'], 'talk, open, take'],
  [['V'], 'first or third person'],
  [['Esc'], 'pause, settings (Gore, Difficulty, Frame rate)'],
];

export function shouldWelcome(search: string): boolean {
  if (new URLSearchParams(search).get('welcome') === '1') return true;
  if (typeof navigator !== 'undefined' && navigator.webdriver) return false;
  try {
    return localStorage.getItem(SEEN_KEY) !== '1';
  } catch {
    return true;
  }
}

/** Show the card over `parent`; resolves when it is closed. */
export function showWelcome(game: Game, parent: HTMLElement): Promise<void> {
  injectStyle();
  return new Promise((resolve) => {
    const close = () => {
      window.removeEventListener('keydown', onKey, true);
      card.classList.add('is-closing');
      setTimeout(() => card.remove(), 220);
      try {
        localStorage.setItem(SEEN_KEY, '1');
      } catch {
        /* private window: show it again next time */
      }
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      e.stopPropagation();
      close();
    };
    const begin = h('button', { class: 'sr-btn sr-btn-primary welcome-begin' }, 'Begin');
    begin.addEventListener('click', close);
    const card = h(
      'div',
      { class: 'welcome-shade' },
      h(
        'div',
        { class: 'welcome-card sr-panel' },
        h('div', { class: 'welcome-kicker' }, 'Roma · a.d. V Id. Mai. · AD 113'),
        h('h1', { class: 'welcome-title' }, 'Salve!'),
        h(
          'p',
          { class: 'welcome-text' },
          'An early test build of Skyrome. Rome, 11 May AD 113, an hour before dawn: you arrive on the last wine cart at the Porta Capena, beside a courier who keeps looking back down the road. Talk to anyone; the gold marker always shows your next step.',
        ),
        h(
          'div',
          { class: 'welcome-keys' },
          ...KEYS.map(([keys, what]) => h('div', { class: 'welcome-row' }, h('span', { class: 'welcome-caps' }, ...keys.map((k) => keycap(k, 'sr-key-sm'))), h('span', {}, what))),
        ),
        h('div', { class: 'welcome-foot' }, begin, h('span', { class: 'welcome-hint' }, 'or press any key')),
      ),
    );
    card.addEventListener('click', (e) => {
      if (e.target === card) close();
    });
    parent.appendChild(card);
    // A key already held from the page load shouldn't dismiss it at once.
    setTimeout(() => window.addEventListener('keydown', onKey, true), 250);
    void game;
  });
}

let styled = false;
function injectStyle() {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const css = `
.welcome-shade { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center;
  background: radial-gradient(ellipse at center, rgba(8, 6, 4, 0.35), rgba(8, 6, 4, 0.7)); pointer-events: auto;
  animation: welcome-in 0.3s var(--sr-ease, ease) both; }
.welcome-shade.is-closing { animation: welcome-out 0.22s ease both; }
.welcome-card { position: relative; max-width: min(34rem, calc(100vw - 2rem)); padding: 1.8rem 2rem 1.5rem; }
.welcome-kicker { font-family: var(--sr-display); font-size: 0.72rem; letter-spacing: 0.22em; text-transform: uppercase; color: var(--sr-gold); opacity: 0.85; }
.welcome-title { font-family: var(--sr-display); font-size: 2.2rem; margin: 0.2rem 0 0.6rem; color: var(--sr-ink, #f3e9d2); letter-spacing: 0.06em; }
.welcome-text { font-family: var(--sr-body); font-size: 1.05rem; line-height: 1.45; margin: 0 0 1rem; }
.welcome-keys { display: grid; gap: 0.38rem; margin-bottom: 1.2rem; font-family: var(--sr-body); font-size: 0.98rem; }
.welcome-row { display: grid; grid-template-columns: 8.2rem 1fr; align-items: center; gap: 0.6rem; }
.welcome-caps { display: flex; gap: 0.2rem; flex-wrap: wrap; }
.welcome-foot { display: flex; align-items: center; gap: 1rem; }
.welcome-hint { font-family: var(--sr-body); font-style: italic; opacity: 0.7; }
@keyframes welcome-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes welcome-out { from { opacity: 1; } to { opacity: 0; } }
`;
  document.head.appendChild(h('style', {}, css));
}
