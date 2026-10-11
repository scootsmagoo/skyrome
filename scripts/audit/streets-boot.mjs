/**
 * STREETS crew (phase 4b): G0's `boot.mjs` for `streets-fit.mjs`, with two additions G0's street-fit
 * run cannot take (scripts/audit/street-fit.mjs boots one fixed URL):
 *
 *  - `STREETS_QUERY` (environment): extra game URL parameters, e.g. `terrain=v1`;
 *  - the drawn terrain on the profile's own diagonal: `streetFit.ts` (`visibleTerrain`) splits every
 *    2 m cell along a–d, the drawn mesh of terrain v1; under v2 (G1a, the default) the mesh is drawn on
 *    b–c, so the unpatched tool measures every street against the wrong ground on twisted cells (up to
 *    1.19 m). A Vite transform makes the tool read `hm.profile` (v1: a–d as before, v2: b–c), in this
 *    run only; `STREETS_KEEP_DIAGONAL=1` turns the patch off (the tool exactly as G0 wrote it).
 */
import { parseArgs, root } from './boot.mjs';
import { createServer as createNetServer } from 'node:net';

export { parseArgs, root };

const ORIG = 'return tz >= tx ? A + (D - C) * tx + (C - A) * tz : A + (B - A) * tx + (D - B) * tz;';
const PATCHED =
  "if ((hm as unknown as { profile?: string }).profile === 'v1') return tz >= tx ? A + (D - C) * tx + (C - A) * tz : A + (B - A) * tx + (D - B) * tz;\n" +
  '    return tx + tz <= 1 ? A + (B - A) * tx + (C - A) * tz : D + (C - D) * (1 - tx) + (B - D) * (1 - tz);';

const diagonalPlugin = {
  name: 'streets-fit-diagonal',
  enforce: 'pre',
  transform(code, id) {
    if (process.env.STREETS_KEEP_DIAGONAL || !/\/src\/dev\/audit\/streetFit\.ts$/.test(id.split('?')[0])) return null;
    if (!code.includes(ORIG)) throw new Error('streets-boot: the visibleTerrain line of streetFit.ts changed; update the patch');
    return code.replace(ORIG, PATCHED);
  },
};

export async function boot(query, { size = '1100x720', timeout = 180000, browser: bname = 'chromium' } = {}) {
  const extra = process.env.STREETS_QUERY;
  if (extra) query = `${query}&${extra}`;
  const { createServer } = await import('vite');
  const port = await freePort();
  const server = await createServer({ root, logLevel: 'error', server: { port, strictPort: true, host: '127.0.0.1', hmr: false }, plugins: [diagonalPlugin] });
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
  console.log(`[streets-boot] ${url}${process.env.STREETS_KEEP_DIAGONAL ? ' (tool unpatched)' : ' (drawn terrain on the profile diagonal)'}`);
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
