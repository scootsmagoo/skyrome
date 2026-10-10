/**
 * Shared boot for the audit scripts: starts its own Vite server on a free port (so parallel agents
 * never collide), launches headless Chromium on the real GPU, opens the game with `query` and waits
 * until it is ready. Returns { page, errors, close, bootMs }.
 */
import { createServer as createNetServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export async function boot(query, { size = '1100x720', timeout = 180000, browser: bname = 'chromium' } = {}) {
  const { createServer } = await import('vite');
  const port = await freePort();
  const server = await createServer({ root, logLevel: 'error', server: { port, strictPort: true, host: '127.0.0.1', hmr: false } });
  await server.listen();
  const pw = await import('playwright');
  const browser = await pw[bname].launch({ headless: true, args: bname === 'chromium' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : [] });
  const [w, h] = size.split('x').map(Number);
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e?.stack ?? e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('[console] ' + m.text());
  });
  const url = `http://127.0.0.1:${port}/?${query}`;
  const t0 = Date.now();
  const close = async () => {
    try {
      await browser.close();
    } catch {
      /* already closed */
    }
    try {
      await server.close();
    } catch {
      /* already closed */
    }
  };
  try {
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__skyrome?.ready || window.__skyrome?.error, null, { timeout, polling: 200 });
    const err = await page.evaluate(() => window.__skyrome?.error);
    if (err) throw new Error('boot error: ' + err);
  } catch (e) {
    await close();
    throw e;
  }
  return { page, errors, close, url, bootMs: Date.now() - t0, port };
}

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[a.slice(2)] = true;
    else {
      out[a.slice(2)] = next;
      i++;
    }
  }
  return out;
}

function freePort() {
  return new Promise((res, rej) => {
    const s = createNetServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
    s.on('error', rej);
  });
}
