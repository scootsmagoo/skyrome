#!/usr/bin/env node
/**
 * Boot-time probe: what the 20 s before the first frame are spent on.
 *
 *   node scripts/perf-boot.mjs [--query 'at=rostra&hour=10'] [--runs 1] [--profile] [--top 30]
 *                              [--graphics high|medium|low] [--browser webkit]
 *
 * Prints the loading screen's labels with the time each one appeared (the boot's phases), the
 * game's own timings (window.__skyrome.readyMs, the city's and the landmarks' console reports),
 * and with --profile a sampling CPU profile of the whole boot: self time by function and the
 * inclusive time of the game's own functions (where the time goes). Each run starts a fresh page.
 */
import { createServer as createNetServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const browserName = args.browser ?? 'chromium';
const runs = Number(args.runs ?? 1);
const top = Number(args.top ?? 30);

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
const launchArgs = browserName === 'chromium' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : [];
const browser = await pw[browserName].launch({ headless: true, args: launchArgs });
try {
  for (let r = 0; r < runs; r++) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const logs = [];
    const t0 = Date.now();
    page.on('console', (m) => {
      const t = m.text();
      if (/^\[(city|landmarks|boot|perf)\]/.test(t)) logs.push(`${((Date.now() - t0) / 1000).toFixed(1).padStart(5)} s  ${t.slice(0, 220)}`);
    });
    // The loading screen's label changes, timestamped in the page.
    await page.addInitScript(() => {
      const seen = [];
      window.__bootPhases = seen;
      const t0 = performance.now();
      const obs = new MutationObserver(() => {
        const el = document.querySelector('.ld-label');
        const txt = el?.textContent?.trim();
        if (txt && seen[seen.length - 1]?.label !== txt) seen.push({ label: txt, ms: Math.round(performance.now() - t0) });
      });
      document.addEventListener('DOMContentLoaded', () => obs.observe(document.body, { subtree: true, childList: true, characterData: true }));
    });
    let cdp = null;
    if (args.profile) {
      await page.goto('about:blank');
      cdp = await page.context().newCDPSession(page);
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
      await cdp.send('Profiler.start');
    }
    const gfx = args.graphics ? `&graphics=${args.graphics}` : '';
    const url = `${baseUrl}?scene=rome&${args.query ?? 'at=rostra&hour=10'}${gfx}`;
    await page.goto(url, { waitUntil: 'load' });
    const loadMs = Date.now() - t0;
    await page.waitForFunction(() => window.__skyrome?.ready || window.__skyrome?.error, null, { timeout: 180000, polling: 50 });
    const readyMs = Date.now() - t0;
    // The first frames after ready (shader compiles and uploads land here).
    const firstFrames = await page.evaluate(async () => {
      const out = [];
      let last = performance.now();
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        const now = performance.now();
        out.push(Math.round(now - last));
        last = now;
      }
      return out;
    });
    const info = await page.evaluate(async () => {
      // The procedural textures' worker prefetch: sets that arrived before they were needed.
      let prefetch = null;
      try { prefetch = (await import('/src/gfx/textures/procedural.ts')).procPrefetch; } catch {}
      return { phases: window.__bootPhases ?? [], readyMs: window.__skyrome?.readyMs, bootMs: window.__skyrome?.game?.flow?.timings?.bootMs, programs: window.__skyrome?.game?.renderer.info.programs?.length, prefetch };
    });
    console.log(`\n== run ${r + 1}: page load ${(loadMs / 1000).toFixed(1)} s · ready ${(readyMs / 1000).toFixed(1)} s (in-page ${((info.readyMs ?? 0) / 1000).toFixed(1)} s, startRome ${((info.bootMs ?? 0) / 1000).toFixed(1)} s) · programs ${info.programs}`);
    let prev = 0;
    for (const p of info.phases) {
      console.log(`  ${(p.ms / 1000).toFixed(1).padStart(5)} s (+${((p.ms - prev) / 1000).toFixed(1)})  ${p.label}`);
      prev = p.ms;
    }
    console.log(`  first frames after ready (ms): ${firstFrames.join(' ')}`);
    if (info.prefetch) console.log(`  procedural textures from the worker: ${info.prefetch.arrived} in time, ${info.prefetch.late} late, of ${info.prefetch.requested}`);
    if (logs.length) console.log('  console:\n    ' + logs.join('\n    '));
    if (cdp) {
      const { profile } = await cdp.send('Profiler.stop');
      const { self, incl } = summarize(profile);
      console.log('\n  self time (ms), hottest first:');
      for (const [k, v] of self.slice(0, top)) console.log(`  ${v.toFixed(0).padStart(7)}  ${k}`);
      console.log('\n  inclusive time of the game\'s functions (ms):');
      for (const [k, v] of incl.slice(0, top)) console.log(`  ${v.toFixed(0).padStart(7)}  ${k}`);
    }
    await page.close();
  }
} finally {
  await browser.close();
  if (server) await server.close();
}
process.exit(0);

function summarize(profile) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const key = (n) => `${n.callFrame.functionName || '(anon)'}  ${(n.callFrame.url || '').replace(/^.*\/(src|node_modules)\//, '$1/').replace(/\?.*$/, '')}:${n.callFrame.lineNumber + 1}`;
  const self = new Map();
  const incl = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    const dt = (profile.timeDeltas[i] ?? 0) / 1000;
    const n = byId.get(profile.samples[i]);
    self.set(key(n), (self.get(key(n)) ?? 0) + dt);
    const seen = new Set();
    for (let id = profile.samples[i]; id !== undefined; id = parent.get(id)) {
      const k = key(byId.get(id));
      if (seen.has(k) || !k.includes(' src/')) continue;
      seen.add(k);
      incl.set(k, (incl.get(k) ?? 0) + dt);
    }
  }
  const sort = (m) => [...m].sort((a, b) => b[1] - a[1]);
  return { self: sort(self), incl: sort(incl) };
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
