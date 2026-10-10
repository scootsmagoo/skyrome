#!/usr/bin/env node
/**
 * Probe for leaks.mjs findings: runs laps of teleports and prints how the scene's objects and
 * geometries change per lap, grouped by top-level group and nearest named ancestor (so growth
 * has a name).
 *   node scripts/leaks-probe.mjs [--track] [--snapshot file.heapsnapshot [--snap-lap 2]] [--laps 3] [--places 12] [--query "at=rostra&hour=10"]
 */
import { createServer as createNetServer } from 'node:net';
import { createWriteStream } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2);
const opt = (k, d) => (a.includes('--' + k) ? a[a.indexOf('--' + k) + 1] : d);
const laps = Number(opt('laps', 3));
const places = Number(opt('places', 12));
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
await page.goto(`http://127.0.0.1:${port}/?scene=rome&${opt('query', 'at=rostra&hour=10')}`);
await page.waitForFunction(() => window.__skyrome?.ready, null, { timeout: 180000, polling: 200 });
await page.waitForTimeout(6000);
// Track every geometry the renderer uploads (it registers a 'dispose' listener on first draw) and
// forget it when disposed: what is left and not in the scene is an orphan nobody freed.
if (a.includes('--track')) await page.evaluate(() => {
  const g = window.__skyrome.game;
  const ED = Object.getPrototypeOf(Object.getPrototypeOf(Object.getPrototypeOf(g.scene)));
  const tracked = (window.__tracked = new Set());
  // Remember where each geometry was first given an attribute (its builder), to name orphans.
  const BG = g.scene.children.find((o) => o.geometry)?.geometry.constructor ?? null;
  const sa = BG.prototype.setAttribute;
  BG.prototype.setAttribute = function (n, a) {
    if (!this.__where) this.__where = (new Error().stack || '').split('\n').slice(2).filter((l) => /\/src\//.test(l)).slice(0, 3).map((l) => l.replace(/^.*\/src\//, '').replace(/\?t=\d+/, '').replace(/\)$/, '')).join(' < ');
    return sa.call(this, n, a);
  };
  const add = ED.addEventListener;
  const rem = ED.removeEventListener;
  ED.addEventListener = function (t, f) {
    if (t === 'dispose' && this.isBufferGeometry) tracked.add(this);
    return add.apply(this, arguments);
  };
  ED.removeEventListener = function (t, f) {
    if (t === 'dispose' && this.isBufferGeometry) tracked.delete(this);
    return rem.apply(this, arguments);
  };
});
const snap = async (file) => {
  const cdp = await page.context().newCDPSession(page);
  const ws = createWriteStream(file);
  cdp.on('HeapProfiler.addHeapSnapshotChunk', (e) => ws.write(e.chunk));
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  await new Promise((r) => ws.end(r));
  await cdp.detach();
  console.log('snapshot written to ' + file);
};
const tp = (i) =>
  page.evaluate(async (i) => {
    const g = window.__skyrome.game;
    const ids = [...g.landmarks.keys()];
    await g.flow.spawnAt(g.flow.spawnPoint(ids[(i * 7 + 3) % ids.length]));
  }, i);
const lap = async () => {
  for (let i = 0; i < places; i++) {
    await tp(i);
    await page.waitForTimeout(1200);
  }
  await tp(0);
  await page.waitForTimeout(3000);
};
const census = async () => {
  const cached = await page.evaluate(async () => {
    const rb = await import('/src/actors/avatar/real/RealBody.ts');
    const hd = await import('/src/actors/avatar/real/head/index.ts');
    window.__cachedUuids = new Set([...rb.realCacheGeometries(), ...hd.headCacheGeometries()].map((g) => g.uuid));
    return window.__cachedUuids.size;
  });
  return page.evaluate(() => {
    const g = window.__skyrome.game;
    const by = {};
    const geos = new Set();
    g.scene.traverse((o) => {
      let n = o;
      while (n && !n.name) n = n.parent;
      let top = o;
      while (top.parent && top.parent !== g.scene) top = top.parent;
      const key = (top.name || top.type).replace(/\d+/g, '#') + ' > ' + (n?.name ?? '?').replace(/\d+/g, '#') + ' [' + o.type + ']';
      const e = (by[key] ??= { objs: 0, geos: 0 });
      e.objs++;
      if (o.geometry && !geos.has(o.geometry.uuid)) {
        geos.add(o.geometry.uuid);
        e.geos++;
      }
    });
    const orphans = {};
    for (const geo of window.__tracked ?? []) {
      if (geos.has(geo.uuid) || window.__cachedUuids.has(geo.uuid)) continue;
      const a = Object.keys(geo.attributes).join(',');
      const k = `${geo.__where ?? '?'} [${a}]`;
      orphans[k] = (orphans[k] ?? 0) + 1;
    }
    let orphanTotal = 0;
    for (const v of Object.values(orphans)) orphanTotal += v;
    const cls = {};
    for (const [k, v] of Object.entries(orphans)) {
      const c = k.includes('strand') ? 'hair/beard' : k.includes('cloth') ? 'clothed body' : k.includes('surf') ? 'body' : 'other';
      cls[c] = (cls[c] ?? 0) + v;
    }
    return { cls, orphanTotal, orphans, by, scene: geos.size, geo: g.renderer.info.memory.geometries, tex: g.renderer.info.memory.textures };
  });
};
await lap();
const base = await census();
for (let l = 1; l <= laps; l++) {
  await lap();
  if (opt('snapshot', '') && l === Number(opt('snap-lap', 0))) await snap(opt('snapshot', '') + '.A');
  const c = await census();
  c.caches = await page.evaluate(async () => {
    const rb = await import('/src/actors/avatar/real/RealBody.ts');
    const ba = await import('/src/actors/avatar/buildAvatar.ts');
    const hd = await import('/src/actors/avatar/real/head/index.ts');
    return { real: rb.realCacheStats(), avatar: ba.avatarCacheStats(), head: hd.headCacheStats() };
  }).catch((e) => String(e));
  console.log(`lap ${l}: orphans ${c.orphanTotal} (base ${base.orphanTotal}) ${JSON.stringify(c.cls)} caches ${JSON.stringify(c.caches)}; renderer geometries ${base.geo} -> ${c.geo} (in scene ${base.scene} -> ${c.scene}), textures ${base.tex} -> ${c.tex}`);
  const rows = Object.entries(c.by)
    .map(([k, v]) => [k, v.objs - (base.by[k]?.objs ?? 0), v.geos - (base.by[k]?.geos ?? 0)])
    .filter((r) => r[1] || r[2])
    .sort((x, y) => y[1] + y[2] - x[1] - x[2])
    .slice(0, 15);
  console.log('  orphans (uploaded, not in scene, never disposed):', JSON.stringify(Object.entries(c.orphans).sort((x, y) => y[1] - x[1]).slice(0, 12)));
  for (const r of rows) console.log(`   ${r[1] >= 0 ? '+' : ''}${r[1]} objs ${r[2] >= 0 ? '+' : ''}${r[2]} geos  ${r[0]}`);
}
if (opt('snapshot', '')) await snap(opt('snapshot', ''));
await browser.close();
await server.close();
process.exit(0);
