/**
 * Makes boot failures visible. Imported first by main.ts, as a side effect, so it is armed before
 * any other module runs:
 *
 *  - an error or an unhandled rejection before the game is ready (a module that fails to load, a
 *    WASM or worker that throws) shows its text in a banner at the bottom instead of leaving a blank page;
 *    on a phone the first few after that show too, for 15 s (no console to read there);
 *  - a lost WebGL context (the GPU process killed, usually for memory) shows a full-screen notice
 *    with a Reload button; the game cannot restore its released geometry and textures, so a reload
 *    is the only way back;
 *  - a breadcrumb in sessionStorage: if the previous load of this tab never reached 20 s of play
 *    (iOS Safari kills a tab that uses too much memory and reloads it by itself), the banner says so,
 *    and where it got to: the loading step on screen, or how long after the world appeared.
 *    `window.__skyrome_prevCrash` is true for the rest of the page.
 */

declare global {
  interface Window {
    __skyrome_prevCrash?: boolean;
  }
}

const KEY = 'skyrome.boot';
const STABLE_MS = 20000;

function store<T>(f: () => T): T | undefined {
  try {
    return f();
  } catch {
    return undefined;
  }
}

function ready(): boolean {
  return !!(window as unknown as { __skyrome?: { ready?: boolean } }).__skyrome?.ready;
}

let banner: HTMLPreElement | null = null;

function showBanner(text: string) {
  if (typeof document === 'undefined' || !document.body) return;
  if (!banner) {
    banner = document.createElement('pre');
    banner.className = 'boot-banner';
    banner.style.cssText =
      'position:fixed;left:0;right:0;bottom:0;z-index:99999;margin:0;padding:10px 14px;max-height:40vh;overflow:auto;' +
      'font:12px/1.4 ui-monospace,Menlo,monospace;white-space:pre-wrap;background:rgba(18,12,9,.94);color:#f3d9c9;pointer-events:none;';
    document.body.appendChild(banner);
  }
  banner.textContent = (banner.textContent ? banner.textContent + '\n\n' : '') + text;
}

function showLost() {
  if (typeof document === 'undefined' || !document.body || document.querySelector('.boot-lost')) return;
  const el = document.createElement('div');
  el.className = 'boot-lost';
  el.style.cssText =
    'position:fixed;inset:0;z-index:100000;display:grid;place-content:center;gap:16px;padding:24px;text-align:center;' +
    'font:16px/1.5 system-ui,sans-serif;background:#120c09;color:#f3d9c9;';
  const msg = document.createElement('div');
  msg.textContent = 'The graphics context was lost. The browser most likely ran out of memory. Reload to continue.';
  const btn = document.createElement('button');
  btn.textContent = 'Reload';
  btn.style.cssText = 'font:inherit;padding:10px 24px;border-radius:8px;border:1px solid #e8c25a;background:#7a1f1a;color:#f3d9c9;justify-self:center;';
  btn.onclick = () => location.reload();
  el.append(msg, btn);
  document.body.appendChild(el);
}

if (typeof window !== 'undefined') {
  const ua = navigator.userAgent || '';
  const phone = !navigator.webdriver && (/iPhone|iPad|iPod|Android/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1));
  // After the game is ready errors go to the console only, except on a phone, where there is no
  // console to look at: the first few distinct ones show for a while (they explain a broken view).
  const seen = new Set<string>();
  const report = (text: string) => {
    if (!ready()) return showBanner(text);
    if (!phone || seen.size >= 3 || seen.has(text)) return;
    seen.add(text);
    showBanner(text);
    setTimeout(() => {
      banner?.remove();
      banner = null;
    }, 15000);
  };
  window.addEventListener('error', (e) => {
    if (/ResizeObserver/.test(e.message || '')) return;
    report(`Error: ${e.message || 'unknown'}${e.filename ? `\n${e.filename}:${e.lineno}:${e.colno}` : ''}${e.error?.stack ? `\n${e.error.stack}` : ''}`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    report(`Unhandled rejection: ${r?.stack ?? r?.message ?? String(r)}`);
  });
  // webglcontextlost does not bubble; the capture phase on window sees every canvas.
  window.addEventListener(
    'webglcontextlost',
    (e) => {
      e.preventDefault();
      console.error('WebGL context lost');
      showLost();
    },
    true,
  );

  // Breadcrumb for a tab the browser killed and reloaded (phones only: on a desktop a plain F5 would trip it).
  const prev = phone ? store(() => sessionStorage.getItem(KEY)) : null;
  if (prev) {
    window.__skyrome_prevCrash = true;
    // Older breadcrumbs were a bare start time.
    const crumb = (store(() => JSON.parse(prev)) ?? { start: Number(prev) }) as { start: number; step?: string; playS?: number };
    const sinceMin = Math.round((Date.now() - crumb.start) / 60000);
    const where = crumb.playS !== undefined ? `${crumb.playS} s after the world appeared` : crumb.step ? `while loading: “${crumb.step}”` : 'while loading';
    const note = `The previous load of this page ended before it was stable (${sinceMin} min ago, ${where}): the browser probably ran out of memory and restarted it.`;
    console.warn(note);
    const show = () => showBanner(note);
    if (document.body) show();
    else document.addEventListener('DOMContentLoaded', show);
    setTimeout(() => banner?.remove(), 20000);
  }
  const crumb: { start: number; step?: string; playS?: number } = { start: Date.now() };
  const save = () => {
    if (phone) store(() => sessionStorage.setItem(KEY, JSON.stringify(crumb)));
  };
  save();
  // Each second: where the load is (the loading screen's step, then seconds of play). Stable once
  // the game has been ready for STABLE_MS: clear the breadcrumb.
  let readyAt = 0;
  const timer = !phone ? 0 : setInterval(() => {
    if (!ready()) {
      const step = document.querySelector('.ld-label')?.textContent?.trim();
      if (step && step !== crumb.step) {
        crumb.step = step;
        save();
      }
      return;
    }
    readyAt ||= Date.now();
    crumb.playS = Math.round((Date.now() - readyAt) / 1000);
    save();
    if (Date.now() - readyAt >= STABLE_MS) {
      store(() => sessionStorage.removeItem(KEY));
      clearInterval(timer);
    }
  }, 1000);
}

export {};
