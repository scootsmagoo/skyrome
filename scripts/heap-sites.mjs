#!/usr/bin/env node
/**
 * Where the JS heap comes from. Starts V8's sampling heap profiler before the game boots, forces
 * a GC at the end and prints the memory still alive by allocation site (the sampling profile
 * keeps only live objects after a GC). Cheap, unlike a full heap snapshot (the heap is ~1 GB).
 *
 *   node scripts/heap-sites.mjs [--query "at=rostra&hour=10"] [--wait 10] [--top 30] [--interval 16384]
 *                               [--snapshot file.heapsnapshot]  also write a full snapshot (see heap-summary.mjs)
 *                               [--after "teleport:24"]   run N teleports before stopping
 *
 * Groups: by the innermost frame inside src/ (file:line, function) and by file.
 */
import { createServer as createNetServer } from 'node:net';
import { createWriteStream } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2);
const opt = (k, d) => (a.includes('--' + k) ? a[a.indexOf('--' + k) + 1] : d);
const top = Number(opt('top', 30));
const { createServer } = await import('vite');
const port = await new Promise((r) => {
  const s = createNetServer();
  s.listen(0, '127.0.0.1', () => {
    const p = s.address().port;
    s.close(() => r(p));
  });
});
const server = await createServer({ root, logLevel: 'error', server: { port, strictPort: true, host: '127.0.0.1', hmr: false } });
await server.listen();
const { chromium } = await import('playwright');
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--js-flags=--expose-gc'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const cdp = await page.context().newCDPSession(page);
await cdp.send('HeapProfiler.enable');
await cdp.send('HeapProfiler.startSampling', { samplingInterval: Number(opt('interval', 16384)), includeObjectsCollectedByMajorGC: false, includeObjectsCollectedByMinorGC: false });
await page.goto(`http://127.0.0.1:${port}/?scene=rome&${opt('query', 'at=rostra&hour=10')}`);
await page.waitForFunction(() => window.__skyrome?.ready, null, { timeout: 180000, polling: 200 });
await page.waitForTimeout(Number(opt('wait', 10)) * 1000);
const after = opt('after', '');
if (after.startsWith('teleport:')) {
  const n = Number(after.split(':')[1]);
  for (let i = 0; i < n; i++) {
    await page.evaluate(async (i) => {
      const g = window.__skyrome.game;
      const ids = [...g.landmarks.keys()];
      await g.flow.spawnAt(g.flow.spawnPoint(ids[((i % 12) * 7 + 3) % ids.length]));
    }, i);
    await page.waitForTimeout(1200);
  }
}
await cdp.send('HeapProfiler.collectGarbage');
await page.waitForTimeout(500);
await cdp.send('HeapProfiler.collectGarbage');
const heap = await page.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1048576));
const snap = opt('snapshot', '');
if (snap) {
  // Full snapshot for scripts/heap-summary.mjs (about 1 GB of JSON for this game).
  const ws = createWriteStream(snap);
  cdp.on('HeapProfiler.addHeapSnapshotChunk', (e) => ws.write(e.chunk));
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  await new Promise((r) => ws.end(r));
  console.log('snapshot written to ' + snap);
}
const { profile } = await cdp.send('HeapProfiler.getSamplingProfile');
const sites = new Map();
const files = new Map();
let total = 0;
const walk = (node, stack) => {
  const cf = node.callFrame;
  const here = [...stack, cf];
  if (node.selfSize) {
    total += node.selfSize;
    // Innermost frame in the game's own source (not three.js or node_modules).
    let f = null;
    for (let i = here.length - 1; i >= 0; i--) {
      if (/\/src\//.test(here[i].url) && !/node_modules/.test(here[i].url)) {
        f = here[i];
        break;
      }
    }
    f ??= cf;
    const file = (f.url.split('/src/')[1] ?? f.url.split('/').slice(-2).join('/')) || '(native)';
    const key = `${file}:${f.lineNumber + 1} ${f.functionName || '(anon)'}`;
    sites.set(key, (sites.get(key) ?? 0) + node.selfSize);
    files.set(file, (files.get(file) ?? 0) + node.selfSize);
  }
  for (const c of node.children) walk(c, here);
};
walk(profile.head, []);
const mb = (n) => (n / 1048576).toFixed(1).padStart(7);
console.log(`heap after GC ${heap} MB; sampled live ${(total / 1048576).toFixed(0)} MB`);
console.log('\nBy file:');
for (const [k, v] of [...files].sort((x, y) => y[1] - x[1]).slice(0, top)) console.log(`${mb(v)} MB  ${k}`);
console.log('\nBy site:');
for (const [k, v] of [...sites].sort((x, y) => y[1] - x[1]).slice(0, top)) console.log(`${mb(v)} MB  ${k}`);
await browser.close();
await server.close();
process.exit(0);
