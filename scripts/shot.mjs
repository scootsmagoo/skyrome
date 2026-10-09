#!/usr/bin/env node
/**
 * Headless screenshot / smoke-test driver (for humans and agents).
 *
 *   node scripts/shot.mjs [options]
 *
 * Options:
 *   --scene <name>        scene to boot (?scene=); default: game default
 *   --query "<a=1&b=2>"   extra URL query (default: at=rostra&hour=10; `plain` = the story's
 *                         opening at the Porta Capena, i.e. ?story=1)
 *   --url <url>           use an already-running server instead of starting Vite
 *   --out <dir>           output dir for screenshots (default .shots)
 *   --name <file>         name of the final screenshot (default shot.png)
 *   --size 1280x720       viewport
 *   --browser chromium|webkit
 *   --wait <ms>           wait after ready before steps (default 1500)
 *   --steps '<json>'      JSON array of steps, or @file.json
 *   --timeout <ms>        max time to wait for ready (default 60000)
 *   --port <n>            port for the Vite server (default: random free port)
 *
 * Steps (run in order; `game` is window.__skyrome.game inside eval):
 *   {"wait": 500}
 *   {"hold": "KeyW", "ms": 1500}          hold an input code (KeyboardEvent.code / Mouse0 / Mouse2)
 *   {"press": "KeyV"}                     tap an input code
 *   {"eval": "game.player.yaw += 1"}      run JS (may return JSON-able value; printed)
 *   {"shot": "name.png"}                  screenshot
 *   {"frames": 60}                        wait N animation frames
 *
 * Prints console errors, page errors and frame stats. Exit code 1 if the game failed to boot
 * or a page error occurred.
 */
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const outDir = resolve(root, args.out ?? '.shots');
mkdirSync(outDir, { recursive: true });
const [vw, vh] = (args.size ?? '1280x720').split('x').map(Number);
const browserName = args.browser ?? 'chromium';
const steps = args.steps
  ? JSON.parse(args.steps.startsWith('@') ? readFileSync(args.steps.slice(1), 'utf8') : args.steps)
  : [];

let server = null;
let baseUrl = args.url;
if (!baseUrl) {
  const { createServer } = await import('vite');
  const port = args.port ? Number(args.port) : await freePort();
  server = await createServer({
    root,
    logLevel: 'error',
    server: { port, strictPort: true, host: '127.0.0.1', hmr: false },
  });
  await server.listen();
  baseUrl = `http://127.0.0.1:${port}/`;
}

// No boot option given: the Forum at mid-morning (what every shot has used). `--query plain` boots
// the story's opening at the Porta Capena instead (?story=1, docs/STORY.md).
const plainLink = args.query === 'plain';
const q = new URLSearchParams(plainLink ? 'story=1' : (args.query ?? ''));
if (args.scene) q.set('scene', args.scene);
if (!plainLink && !['at', 'quick', 'menu', 'part', 'fight'].some((k) => q.has(k)) && (q.get('scene') ?? 'rome') === 'rome') {
  q.set('at', 'rostra');
  if (!q.has('hour')) q.set('hour', '10');
}
const url = baseUrl + (baseUrl.includes('?') ? '&' : '?') + q.toString();

const pw = await import('playwright');
const launchArgs =
  browserName === 'chromium'
    ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu']
    : [];
const browser = await pw[browserName].launch({ headless: true, args: launchArgs });
const page = await browser.newPage({ viewport: { width: vw, height: vh } });
const errors = [];
const logs = [];
page.on('console', (m) => {
  const t = m.type();
  if (t === 'error' || t === 'warning') logs.push(`[${t}] ${m.text()}`);
  else if (args.verbose) logs.push(`[${t}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(String(e?.stack ?? e)));

let exitCode = 0;
try {
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__skyrome?.ready || window.__skyrome?.error, null, {
    timeout: Number(args.timeout ?? 60000),
    polling: 100,
  });
  const bootErr = await page.evaluate(() => window.__skyrome?.error);
  if (bootErr) throw new Error('Boot error: ' + bootErr);
  console.log(`ready in ${Date.now() - t0} ms  (${url})`);
  await page.waitForTimeout(Number(args.wait ?? 1500));

  for (const step of steps) {
    if (step.wait) await page.waitForTimeout(step.wait);
    if (step.frames) await page.evaluate((n) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), step.frames);
    if (step.hold) {
      await page.evaluate((c) => window.__skyrome.game.input.simulate(c, true), step.hold);
      await page.waitForTimeout(step.ms ?? 1000);
      await page.evaluate((c) => window.__skyrome.game.input.simulate(c, false), step.hold);
    }
    if (step.press) {
      await page.evaluate((c) => window.__skyrome.game.input.simulate(c, true), step.press);
      await page.waitForTimeout(60);
      await page.evaluate((c) => window.__skyrome.game.input.simulate(c, false), step.press);
      await page.waitForTimeout(60);
    }
    if (step.eval) {
      const r = await page.evaluate((code) => {
        const game = window.__skyrome.game;
        // eslint-disable-next-line no-new-func
        return Promise.resolve(new Function('game', code)(game)).then((v) => {
          try { return JSON.stringify(v); } catch { return String(v); }
        });
      }, step.eval.includes('return') ? step.eval : `return (${step.eval})`);
      if (r !== undefined) console.log(`eval → ${r}`);
    }
    if (step.shot) {
      const p = join(outDir, step.shot);
      await page.screenshot({ path: p });
      console.log(`screenshot: ${p}`);
    }
  }

  const finalPath = join(outDir, args.name ?? 'shot.png');
  await page.screenshot({ path: finalPath });
  console.log(`screenshot: ${finalPath}`);
  const stats = await page.evaluate(() => {
    const g = window.__skyrome.game;
    const gl = g.renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      ...g.stats,
      gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown',
      player: g.player ? g.player.position.toArray().map((v) => +v.toFixed(2)) : null,
    };
  });
  console.log('stats:', JSON.stringify(stats));
} catch (e) {
  exitCode = 1;
  console.error('FAILED:', e.message);
  try { await page.screenshot({ path: join(outDir, 'failure.png') }); } catch {}
} finally {
  if (logs.length) console.log('console:\n  ' + logs.slice(0, 40).join('\n  '));
  if (errors.length) {
    exitCode = 1;
    console.log('page errors:\n  ' + errors.slice(0, 20).join('\n  '));
  }
  await browser.close();
  if (server) await server.close();
  process.exit(exitCode);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i++; }
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
