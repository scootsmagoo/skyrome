#!/usr/bin/env node
/**
 * Allocation churn: how often the garbage collector runs while playing, and who allocates.
 *
 *   node scripts/perf-gc.mjs [--view forum] [--seconds 20] [--walk] [--top 30] [--query 'a=1'] [--callers <fn>]
 *
 * Boots a view, settles, then for `--seconds` turns the view slowly (or with --walk holds W, the
 * player running through the streets) while it records:
 *  - a trace of V8's GC events (minor = scavenges of the young generation, major = mark-compact),
 *    reported per minute with their total pause;
 *  - a sampling heap profile that keeps objects the GC already collected (CDP HeapProfiler with
 *    includeObjectsCollectedByMinorGC/MajorGC): bytes allocated per function, the churn's sources.
 * Chromium only (CDP).
 */
import { createServer as createNetServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const seconds = Number(args.seconds ?? 20);
const top = Number(args.top ?? 30);
const VIEWS = { spawn: '', forum: '&at=rostra', circus: '&at=circus-maximus', colosseum: '&at=colosseum', pantheon: '&at=pantheon' };
const view = args.view ?? 'forum';

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
const browser = await pw.chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const url = `${baseUrl}?scene=rome&quick=1&hour=10${VIEWS[view] ?? ''}${args.query ? `&${args.query}` : ''}`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__skyrome?.ready || window.__skyrome?.error, null, { timeout: 180000, polling: 100 });
  await page.waitForTimeout(Number(args.settle ?? 6000));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: 16384, includeObjectsCollectedByMinorGC: true, includeObjectsCollectedByMajorGC: true });
  await browser.startTracing(page, { categories: ['v8', 'disabled-by-default-v8.gc', 'devtools.timeline'] });
  const t0 = Date.now();
  const frames = await page.evaluate(async ({ ms, walk }) => {
    const game = window.__skyrome.game;
    const p = game.player;
    const yaw0 = p.yaw;
    const t0 = performance.now();
    let n = 0;
    if (walk) game.input.simulate('KeyW', true);
    while (performance.now() - t0 < ms) {
      if (!walk) p.yaw = yaw0 + ((performance.now() - t0) / 12000) * Math.PI * 2;
      else if (n % 240 === 120) p.yaw += 0.6; // turn now and then: down another street
      await new Promise((r) => requestAnimationFrame(r));
      n++;
    }
    if (walk) game.input.simulate('KeyW', false);
    return n;
  }, { ms: seconds * 1000, walk: !!args.walk });
  const elapsedMin = (Date.now() - t0) / 60000;
  const trace = JSON.parse((await browser.stopTracing()).toString('utf8'));
  const { profile } = await cdp.send('HeapProfiler.stopSampling');

  // GC events: scavenges (minor) and mark-compacts (major), with their pause on the main thread.
  const events = trace.traceEvents ?? trace;
  const gc = { minor: 0, major: 0, minorMs: 0, majorMs: 0 };
  for (const e of events) {
    if (e.ph !== 'X' && e.ph !== 'B') continue;
    const name = e.name;
    const dur = (e.dur ?? 0) / 1000;
    if (name === 'MinorGC' || name === 'V8.GC_SCAVENGER' || name === 'Scavenge' || name === 'MinorMS') { gc.minor++; gc.minorMs += dur; }
    else if (name === 'MajorGC' || name === 'V8.GC_MARK_COMPACTOR' || name === 'MarkCompact') { gc.major++; gc.majorMs += dur; }
  }
  console.log(`\n== ${view}${args.walk ? ' (walking)' : ' (turning)'}: ${frames} frames in ${(elapsedMin * 60).toFixed(1)} s`);
  console.log(`  minor GCs ${(gc.minor / elapsedMin).toFixed(0)}/min (${gc.minorMs.toFixed(0)} ms in total, ${(gc.minor ? gc.minorMs / gc.minor : 0).toFixed(2)} ms each)` +
    ` · major GCs ${(gc.major / elapsedMin).toFixed(1)}/min (${gc.majorMs.toFixed(0)} ms)`);

  // Bytes allocated per function (self), over the window.
  const self = new Map();
  let total = 0;
  const walkNode = (n) => {
    const cf = n.callFrame;
    const key = `${cf.functionName || '(anon)'}  ${(cf.url || '').replace(/^.*\/(src|node_modules)\//, '$1/').replace(/\?.*$/, '')}:${cf.lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + n.selfSize);
    total += n.selfSize;
    for (const c of n.children ?? []) walkNode(c);
  };
  walkNode(profile.head);
  const perMin = (b) => b / elapsedMin / 1048576;
  console.log(`  allocated ${perMin(total).toFixed(0)} MB/min (sampled), by function:`);
  for (const [k, b] of [...self].sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(`  ${perMin(b).toFixed(1).padStart(7)} MB/min  ${k}`);
  if (args.callers) {
    // Who calls the named allocator (builtins like Math.hypot or Array.push have no source line).
    const by = new Map();
    const label = (n) => `${n.callFrame.functionName || '(anon)'}  ${(n.callFrame.url || '').replace(/^.*\/(src|node_modules)\//, '$1/').replace(/\?.*$/, '')}:${n.callFrame.lineNumber + 1}`;
    const visit = (n, parents) => {
      if (n.callFrame.functionName === args.callers && n.selfSize) {
        const k = parents.slice(-2).map(label).reverse().join(' < ');
        by.set(k, (by.get(k) ?? 0) + n.selfSize);
      }
      for (const c of n.children ?? []) visit(c, [...parents, n]);
    };
    visit(profile.head, []);
    console.log(`\n  callers of ${args.callers}:`);
    for (const [k, b] of [...by].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${perMin(b).toFixed(1).padStart(7)} MB/min  ${k}`);
  }
} finally {
  await browser.close();
  if (server) await server.close();
}
process.exit(0);

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
