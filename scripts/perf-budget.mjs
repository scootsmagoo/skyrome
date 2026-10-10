#!/usr/bin/env node
/**
 * Performance budget gate: boots fixed views and FAILS (exit code 1) when a frame-cost number goes
 * over its budget in scripts/perf-budget.json. Run it before you hand in work that touches what the
 * game draws or does every frame; the budgets are the October 2026 audit's numbers plus headroom
 * (docs/research/perf-audit-2026-10.md).
 *
 *   node scripts/perf-budget.mjs [--views forum,colosseum] [--graphics high|medium] [--repeat 2]
 *                                [--budget scripts/perf-budget.json] [--json out.json] [--no-idle]
 *                                [--write-budget] [--headroom 1.3]
 *
 * Per view (same viewpoints as perf.mjs, 1280×720, the frame cap lifted with ?fps=0):
 *   cpuMean, cpuP95     frame CPU ms (game.stats.cpuMs) over 180 frames looking four ways
 *   renderSubmit        the render call's CPU ms (game.profile '(render submit)', smoothed)
 *   draws, triangles    the most in any of the four directions (renderer.info, all passes)
 *   slowFrames          frames over 33 ms (two missed vsyncs at 60 Hz) during a 90° snap per
 *                       direction and a smooth 360° turn (streaming and LOD builds included)
 *   bootMs              page load to ready
 * And once (first view): idle checks, from game.drawStats and the frame counter:
 *   pausedDrawShare     share of paused (menu) frames that still drew (should be near 0)
 *   titleFps            frames per second on the title (capped at 30)
 *
 * Timings vary with what else the machine is doing (agents share one GPU): `--repeat n` measures
 * n times and keeps each number's best (lowest), counts are exact. A budget of null is not
 * checked. `--write-budget` writes new budgets from the measured numbers (timings × `--headroom`,
 * default 1.3; draws and triangles × 1.15; slow frames twice the count, at least 6), after a change
 * that is meant to cost more or less: say so in your report. Measure with `--repeat 2` first.
 */
import { createServer as createNetServer } from 'node:net';
import { loadavg, cpus } from 'node:os';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const budgetPath = resolve(root, args.budget ?? 'scripts/perf-budget.json');
const graphics = args.graphics ?? 'high';
const repeat = Math.max(1, Number(args.repeat ?? 1));
const headroom = Number(args.headroom ?? 1.3);
const VIEWS = {
  spawn: '',
  forum: '&at=rostra',
  circus: '&at=circus-maximus',
  colosseum: '&at=colosseum',
  pantheon: '&at=pantheon',
};
const budgetFile = existsSync(budgetPath) ? JSON.parse(readFileSync(budgetPath, 'utf8')) : { tiers: {} };
const tierBudget = budgetFile.tiers?.[graphics] ?? { views: {}, idle: {} };
const views = (args.views ? String(args.views).split(',') : Object.keys(tierBudget.views ?? {}).length ? Object.keys(tierBudget.views) : ['forum', 'colosseum']).filter((v) => v in VIEWS);
/** Lower is better for every metric but titleFps' cap (checked as an upper bound too). */
const METRICS = ['cpuMean', 'cpuP95', 'renderSubmit', 'draws', 'triangles', 'slowFrames', 'bootMs'];
const TIMED = new Set(['cpuMean', 'cpuP95', 'renderSubmit', 'slowFrames', 'bootMs']);

let server = null;
let baseUrl = args.url;
if (!baseUrl) {
  const { createServer } = await import('vite');
  const port = await freePort();
  server = await createServer({ root, logLevel: 'error', server: { port, strictPort: true, host: '127.0.0.1', hmr: false } });
  await server.listen();
  baseUrl = `http://127.0.0.1:${port}/`;
}
const pw = await import('playwright');
const browser = await pw.chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--js-flags=--expose-gc'] });
const measured = { graphics, views: {}, idle: null };
try {
  for (const view of views) {
    for (let r = 0; r < repeat; r++) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));
      const url = `${baseUrl}?scene=rome&quick=1&hour=10&fps=0&graphics=${graphics}${VIEWS[view]}`;
      const t0 = Date.now();
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__skyrome?.ready || window.__skyrome?.error, null, { timeout: 180000, polling: 100 });
      const bootMs = Date.now() - t0;
      await page.waitForTimeout(Number(args.settle ?? 6000));
      const m = await page.evaluate(measureView);
      m.bootMs = bootMs;
      if (errors.length) m.errors = errors.slice(0, 3);
      const prev = measured.views[view];
      // Best of the repeats for timings (interference only ever adds), the latest for counts.
      measured.views[view] = prev ? Object.fromEntries(Object.entries(m).map(([k, v]) => [k, TIMED.has(k) && typeof v === 'number' ? Math.min(v, prev[k]) : v])) : m;
      await page.close();
    }
  }
  if (args['no-idle'] === undefined) {
    // The idle checks run with the game's own frame cap (the views above lift it with ?fps=0).
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`${baseUrl}?scene=rome&quick=1&hour=10&graphics=${graphics}&at=rostra`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__skyrome?.ready || window.__skyrome?.error, null, { timeout: 180000, polling: 100 });
    await page.waitForTimeout(3000);
    measured.idle = await page.evaluate(measureIdle);
    await page.close();
  }
} finally {
  await browser.close();
  if (server) await server.close();
}

// Compare.
let failed = 0;
const rows = [];
for (const view of views) {
  const m = measured.views[view];
  const b = tierBudget.views?.[view] ?? {};
  for (const k of METRICS) {
    const v = m[k];
    const lim = b[k];
    const ok = lim === undefined || lim === null || v <= lim;
    if (!ok) failed++;
    rows.push([view, k, fmt(k, v), lim === undefined || lim === null ? '-' : fmt(k, lim), ok ? 'ok' : 'OVER']);
  }
  if (m.errors) {
    failed++;
    rows.push([view, 'page errors', m.errors.join(' | ').slice(0, 60), '0', 'FAIL']);
  }
}
if (measured.idle) {
  const b = tierBudget.idle ?? {};
  for (const [k, v] of Object.entries(measured.idle)) {
    const lim = b[k];
    const ok = lim === undefined || lim === null || v <= lim;
    if (!ok) failed++;
    rows.push(['idle', k, String(v), lim === undefined || lim === null ? '-' : String(lim), ok ? 'ok' : 'OVER']);
  }
}
console.log(`\nperf budget (${graphics}, ${repeat > 1 ? `best of ${repeat}` : 'one run'}; budgets from ${budgetPath.replace(root + '/', '')})`);
const w = [10, 16, 12, 12, 5];
console.log(['view', 'metric', 'measured', 'budget', ''].map((s, i) => s.padEnd(w[i])).join(' '));
for (const r of rows) console.log(r.map((s, i) => String(s).padEnd(w[i])).join(' '));
if (args.json) writeFileSync(resolve(root, args.json), JSON.stringify(measured, null, 2));
if (args['write-budget'] !== undefined) {
  const out = budgetFile.tiers ? budgetFile : { tiers: {} };
  out.note = out.note ?? 'Budgets for scripts/perf-budget.mjs: the audit measurements × headroom. Regenerate with --write-budget (and say why in your report).';
  out.tiers[graphics] = { views: {}, idle: { pausedDrawShare: 0.15, titleFps: 32 } };
  for (const view of views) {
    const m = measured.views[view];
    const b = {};
    // Timings × headroom, counts × 1.15 (they are exact), slow frames at least 6.
    for (const k of METRICS) b[k] = k === 'slowFrames' ? Math.max(6, Math.ceil(m[k] * 2)) : k === 'draws' ? Math.ceil((m[k] * 1.15) / 10) * 10 : k === 'triangles' ? Math.ceil((m[k] * 1.15) / 1e4) * 1e4 : k === 'bootMs' ? Math.round(m[k] * headroom) : +(m[k] * headroom).toFixed(1);
    out.tiers[graphics].views[view] = b;
  }
  writeFileSync(budgetPath, JSON.stringify(out, null, 2) + '\n');
  console.log(`\nwrote ${budgetPath.replace(root + '/', '')} (${graphics}, ×${headroom})`);
}
// Timings mean little on a machine that is busy with other work (other agents' browsers, a build).
const load = loadavg()[0];
const cores = cpus().length;
if (load > cores * 0.75) console.log(`\nwarning: the machine is busy (load ${load.toFixed(1)} on ${cores} cores): timings and slow frames run high. Re-run with --repeat 2, or when it is quieter; draws and triangles are exact either way.`);
console.log(failed ? `\nFAIL: ${failed} over budget` : '\nPASS');
process.exit(failed && args['write-budget'] === undefined ? 1 : 0);

function fmt(k, v) {
  if (typeof v !== 'number') return String(v);
  if (k === 'triangles') return `${(v / 1e6).toFixed(2)}M`;
  if (k === 'bootMs') return `${(v / 1000).toFixed(1)} s`;
  if (k === 'draws' || k === 'slowFrames') return String(v);
  return `${v.toFixed(1)} ms`;
}

/** In the page: the frame-cost numbers of one view. */
async function measureView() {
  const game = window.__skyrome.game;
  const p = game.player;
  const frames = (n) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  globalThis.gc?.();
  game.profiling = true;
  game.profile.clear();
  const yaw0 = p.yaw;
  const cpu = [];
  let draws = 0, tris = 0, slow = 0, submit = 0, submitN = 0;
  // Four directions: a snap (streaming reacts), then 45 frames measured.
  for (let d = 0; d < 4; d++) {
    p.yaw = yaw0 + (d * Math.PI) / 2;
    for (let i = 0; i < 15; i++) {
      await frames(1);
      if (game.stats.cpuMs > 33) slow++;
    }
    for (let i = 0; i < 45; i++) {
      await frames(1);
      cpu.push(game.stats.cpuMs);
      if (game.stats.cpuMs > 33) slow++;
      draws = Math.max(draws, game.stats.drawCalls);
      tris = Math.max(tris, game.stats.triangles);
      const s = game.lastTick.get('(render submit)');
      if (s !== undefined) { submit += s; submitN++; }
    }
  }
  // A smooth turn (a full circle in 6 s), as a player looks around.
  for (let f = 0; f < 360; f++) {
    p.yaw = yaw0 + (f / 360) * Math.PI * 2;
    await frames(1);
    if (game.stats.cpuMs > 33) slow++;
  }
  p.yaw = yaw0;
  game.profiling = false;
  cpu.sort((a, b) => a - b);
  return {
    cpuMean: +(cpu.reduce((s, v) => s + v, 0) / cpu.length).toFixed(2),
    cpuP95: +cpu[Math.floor(cpu.length * 0.95)].toFixed(2),
    renderSubmit: +(submit / Math.max(1, submitN)).toFixed(2),
    draws,
    triangles: tris,
    slowFrames: slow,
  };
}

/** In the page: the idle behaviour (menus and the title draw little). */
async function measureIdle() {
  const game = window.__skyrome.game;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const ds = game.drawStats;
  if (!ds) return { pausedDrawShare: 1, titleFps: 999 };
  game.paused = true;
  await wait(500);
  const a = { ...ds };
  await wait(3000);
  const drawn = ds.drawn - a.drawn, skipped = ds.skipped - a.skipped;
  game.paused = false;
  await wait(300);
  game.events.emit('flow:state', { state: 'title' });
  await wait(500);
  const b = ds.drawn;
  await wait(3000);
  const titleFps = (ds.drawn - b) / 3;
  game.events.emit('flow:state', { state: 'playing' });
  return { pausedDrawShare: +(drawn / Math.max(1, drawn + skipped)).toFixed(3), titleFps: +titleFps.toFixed(1) };
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) o[k] = true;
    else { o[k] = next; i++; }
  }
  return o;
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
