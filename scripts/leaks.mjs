#!/usr/bin/env node
/**
 * Leak harness. Boots the game in Chromium, then runs cycles of one activity at a time. After
 * every cycle it forces a full GC (CDP HeapProfiler.collectGarbage) and samples:
 *   JS heap, renderer.info.memory (geometries, textures), programs, materials (scene walk),
 *   scene objects, Rapier bodies/colliders, actors, AudioNodes + buffers created (counted by a
 *   hook: created, not live, so look at the per-cycle rate), DOM nodes + event listeners
 *   (CDP Memory.getDOMCounters), active intervals and pending timeouts (hooked).
 * `audioLive` is the number of AudioNodes alive (DevTools WebAudio events); `aud` at the end of a line is
 * how many were created in all (churn), buffers and their MB.
 * A phase PASSES when, after its warm-up cycle, the second half of its samples does not keep
 * growing: heap slope below --heap-slope MB per cycle and every counter flat (counts compared
 * exactly, with a small allowance for streaming phases).
 *
 *   node scripts/leaks.mjs [--phases teleport,interior,saveload,menus,fights,daynight,munus,soak]
 *                          [--scale 1]          multiply every cycle count (0.2 for a quick run)
 *                          [--soak 30]          minutes for the soak phase (not run unless named)
 *                          [--heap-slope 1.5]   MB a cycle the heap may grow before it is flagged
 *                          [--orphans]          also count geometries uploaded to the GPU, no longer in the scene, in no cache and never
 *                                               disposed (a leak three.js cannot see), and print where they were built
 *                          [--snapshot <phase>] write .shots/leaks/<phase>-{before,after}.heapsnapshot
 *                          [--out .shots/leaks] [--json file] [--query "at=rostra&hour=10"]
 *
 * Default cycles: teleport 48 (four laps of 12 places), interior 20, saveload 20, menus 50, fights 20, daynight 24, munus 6.
 * Exit code 1 when a phase flags growth, a page error occurs or the page crashes.
 */
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, writeFileSync, createWriteStream } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const scale = Number(args.scale ?? 1);
const slope = Number(args['heap-slope'] ?? 1.5);
const outDir = resolve(root, args.out ?? '.shots/leaks');
mkdirSync(outDir, { recursive: true });
const ALL = ['teleport', 'interior', 'saveload', 'menus', 'fights', 'daynight', 'munus'];
const phases = String(args.phases ?? ALL.join(',')).split(',').filter(Boolean);
const N = { teleport: 48, interior: 20, saveload: 20, menus: 50, fights: 20, daynight: 24, munus: 6 };
const cycles = (p) => Math.max(EVERY[p] ?? 4, Math.round((N[p] * scale) / (EVERY[p] ?? 1)) * (EVERY[p] ?? 1));

const { createServer } = await import('vite');
const port = await freePort();
const server = await createServer({ root, logLevel: 'error', server: { port, strictPort: true, host: '127.0.0.1', hmr: false } });
await server.listen();
const { chromium } = await import('playwright');
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
let crashed = false;
page.on('pageerror', (e) => errors.push(`[pageerror] ${String(e?.message ?? e)}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`[console] ${m.text()}`));
page.on('crash', () => (crashed = true));
const cdp = await page.context().newCDPSession(page);
await cdp.send('Memory.getDOMCounters').catch(() => {});
// Live AudioNodes and contexts from DevTools' own accounting (created minus willBeDestroyed; a node
// is destroyed when it is garbage collected, so sample after a forced GC).
let audioLive = 0;
let audioContexts = 0;
cdp.on('WebAudio.audioNodeCreated', () => audioLive++);
cdp.on('WebAudio.audioNodeWillBeDestroyed', () => audioLive--);
cdp.on('WebAudio.contextCreated', () => audioContexts++);
cdp.on('WebAudio.contextWillBeDestroyed', () => audioContexts--);
await cdp.send('WebAudio.enable').catch(() => {});

// Hooks installed before the game boots: audio creation counts and timer bookkeeping.
await page.addInitScript(() => {
  const h = (window.__leakHooks = { nodes: 0, buffers: 0, bufferBytes: 0, intervals: new Set(), timeouts: new Set() });
  // create* live on BaseAudioContext, shared by AudioContext and OfflineAudioContext.
  const AC = window.BaseAudioContext || window.AudioContext;
  if (AC) {
    for (const k of Object.getOwnPropertyNames(AC.prototype)) {
      if (!k.startsWith('create')) continue;
      const orig = AC.prototype[k];
      AC.prototype[k] = function (...a) {
        if (k === 'createBuffer') {
          h.buffers++;
          h.bufferBytes += (a[0] || 1) * (a[1] || 1) * 4;
        } else h.nodes++;
        return orig.apply(this, a);
      };
    }
  }
  const si = window.setInterval.bind(window);
  const ci = window.clearInterval.bind(window);
  const st = window.setTimeout.bind(window);
  const ct = window.clearTimeout.bind(window);
  window.setInterval = (f, t, ...r) => { const id = si(f, t, ...r); h.intervals.add(id); return id; };
  window.clearInterval = (id) => { h.intervals.delete(id); return ci(id); };
  window.setTimeout = (f, t, ...r) => {
    const id = st((...x) => { h.timeouts.delete(id); return typeof f === 'function' ? f(...x) : undefined; }, t, ...r);
    h.timeouts.add(id);
    return id;
  };
  window.clearTimeout = (id) => { h.timeouts.delete(id); return ct(id); };
});

const t0 = Date.now();
await page.goto(`http://127.0.0.1:${port}/?scene=rome&${args.query ?? 'at=rostra&hour=10'}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__skyrome?.ready, null, { timeout: 180000, polling: 200 });
console.log(`booted in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
await page.waitForTimeout(3000);
if (args.orphans) {
  await page.evaluate(() => {
    const g = window.__skyrome.game;
    const ED = Object.getPrototypeOf(Object.getPrototypeOf(Object.getPrototypeOf(g.scene)));
    const tracked = (window.__tracked = new Set());
    const BG = g.scene.children.find((o) => o.geometry)?.geometry.constructor;
    const sa = BG.prototype.setAttribute;
    BG.prototype.setAttribute = function (n, a) {
      if (!this.__where) this.__where = (new Error().stack || '').split('\n').slice(2).filter((l) => /\/src\//.test(l)).slice(0, 3).map((l) => l.replace(/^.*\/src\//, '').replace(/\?t=\d+/, '').replace(/\)$/, '')).join(' < ');
      return sa.call(this, n, a);
    };
    const add = ED.addEventListener;
    const rem = ED.removeEventListener;
    ED.addEventListener = function (t) {
      if (t === 'dispose' && this.isBufferGeometry) tracked.add(this);
      return add.apply(this, arguments);
    };
    ED.removeEventListener = function (t) {
      if (t === 'dispose' && this.isBufferGeometry) tracked.delete(this);
      return rem.apply(this, arguments);
    };
  });
}
// Web Audio starts on the first gesture: give it one, so the audio counters mean something.
await page.keyboard.press('ShiftLeft');
await page.waitForTimeout(5000);

async function sample() {
  // The console's own log (400 rows kept by design) is DOM that is not attached until it is opened: empty it first.
  await page.evaluate(() => window.__skyrome.game.console.exec('clear'));
  await cdp.send('HeapProfiler.collectGarbage');
  await page.waitForTimeout(150);
  await cdp.send('HeapProfiler.collectGarbage');
  if (args.orphans) {
    await page.evaluate(async () => {
      const rb = await import('/src/actors/avatar/real/RealBody.ts');
      const hd = await import('/src/actors/avatar/real/head/index.ts');
      window.__cachedUuids = new Set([...rb.realCacheGeometries(), ...hd.headCacheGeometries()].map((x) => x.uuid));
    });
  }
  const dom = await cdp.send('Memory.getDOMCounters').catch(() => ({}));
  const s = await page.evaluate(() => {
    const g = window.__skyrome.game;
    const info = g.renderer.info;
    const mats = new Set();
    const geos = new Set();
    let objects = 0;
    g.scene.traverse((o) => {
      objects++;
      if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.add(m.uuid);
      if (o.geometry) geos.add(o.geometry.uuid);
    });
    let orphanGeos = 0;
    if (window.__tracked) {
      const cached = window.__cachedUuids ?? new Set();
      for (const geo of window.__tracked) if (!geos.has(geo.uuid) && !cached.has(geo.uuid)) orphanGeos++;
    }
    const w = g.physics.world;
    const h = window.__leakHooks;
    return {
      heap: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1),
      geo: info.memory.geometries,
      tex: info.memory.textures,
      prog: info.programs?.length ?? 0,
      mat: mats.size,
      objects,
      orphanGeos,
      bodies: w.bodies.len(),
      colliders: w.colliders.len(),
      actors: g.combat?.core.list.length ?? 0,
      npcs: g.population?.npcs?.length ?? g.population?.list?.length ?? 0,
      audioNodes: h.nodes,
      audioBufs: h.buffers,
      audioMB: +(h.bufferBytes / 1048576).toFixed(1),
      domAttached: (() => { let n = 0; const w = document.createTreeWalker(document, NodeFilter.SHOW_ALL); while (w.nextNode()) n++; return n; })(),
      intervals: h.intervals.size,
      timeouts: h.timeouts.size,
    };
  });
  s.audioLive = audioLive;
  s.audioCtx = audioContexts;
  s.domNodes = dom.nodes ?? 0;
  s.listeners = dom.jsEventListeners ?? 0;
  s.docs = dom.documents ?? 0;
  return s;
}

const KEYS = ['heap', 'geo', 'tex', 'prog', 'mat', 'objects', 'orphanGeos', 'bodies', 'colliders', 'actors', 'npcs', 'audioLive', 'domNodes', 'domAttached', 'listeners', 'docs', 'intervals', 'timeouts'];
const results = [];
// Teleports sample once a lap (12 places), always standing at the same place: what streams in
// depends on where you are, so only same-place samples compare.
const WARM = { teleport: 12 };
const EVERY = { teleport: 12 };

const ACTIVITIES = {
  async teleport(i) {
    const r = await page.evaluate(async (i) => {
      const g = window.__skyrome.game;
      const ids = [...g.landmarks.keys()];
      // A fixed lap of 12 places: the first lap builds and caches them, later laps must be flat.
      const id = ids[((i % 12) * 7 + 3) % ids.length];
      await g.flow.spawnAt(g.flow.spawnPoint(id));
      return id;
    }, i);
    await page.waitForTimeout(1200);
    return r;
  },
  async interior(i) {
    await page.evaluate(async () => {
      const g = window.__skyrome.game;
      await g.flow.spawnAt(g.flow.spawnPoint('trajans-column'));
    });
    await page.waitForTimeout(600);
    const ok = await page.evaluate(async () => {
      const g = window.__skyrome.game;
      const p = g.player.position;
      window.__leakBack = { x: p.x, y: p.y, z: p.z, h: g.player.heading ?? 0 };
      await g.interiors.enter('dun-columna', { x: 0, y: 0, z: -3.1 }, 0);
      return g.interiors.current();
    });
    await page.waitForTimeout(1200);
    await page.evaluate(async () => {
      const g = window.__skyrome.game;
      const b = window.__leakBack;
      await g.interiors.leave({ x: b.x, y: b.y, z: b.z }, b.h);
    });
    await page.waitForTimeout(800);
    return ok;
  },
  async saveload(i) {
    const ok = await page.evaluate(async () => {
      const g = window.__skyrome.game;
      await g.rpg.save.quicksave();
      return await g.flow.loadSlot('quick');
    });
    await page.waitForTimeout(2500);
    return ok;
  },
  async menus(i) {
    await page.evaluate(async () => {
      const g = window.__skyrome.game;
      const ui = g.ui;
      const tick = () => new Promise((r) => setTimeout(r, 120));
      for (const tab of ['inventory', 'map', 'journal', 'skills', 'character']) {
        ui.openMenu(tab);
        await tick();
        ui.closeAll();
        await tick();
      }
      ui.openPause();
      await tick();
      ui.closeAll();
      ui.openSaves('load');
      await tick();
      ui.closeAll();
      // Dialogue with the nearest NPC that has one.
      const ids = g.npcs?.ids?.() ?? [];
      for (const id of ids) {
        try {
          if (g.dialogue.start(id)) break;
        } catch {}
      }
      await tick();
      g.dialogue.end?.();
      ui.closeAll();
      await tick();
    });
  },
  async fights(i) {
    await page.evaluate(async () => {
      const g = window.__skyrome.game;
      const tick = (ms) => new Promise((r) => setTimeout(r, ms));
      await g.console.exec('tgm on');
      await g.console.exec('spawn grassator 3');
      await tick(2500);
      // Arrows and gore: the player shoots when a bow is ready; killall spawns ragdolls and pieces.
      await g.console.exec('killall');
      await tick(1500);
      await g.console.exec('knock');
      await tick(1000);
    });
  },
  async daynight(i) {
    await page.evaluate(async (i) => {
      const g = window.__skyrome.game;
      await g.console.exec(`sethour ${(i * 5 + 3) % 24}`);
      await new Promise((r) => setTimeout(r, 1500));
    }, i);
  },
  async munus(i) {
    await page.evaluate(async () => {
      const g = window.__skyrome.game;
      await g.console.exec('tgm on');
      await g.console.exec('coc colosseum');
      await new Promise((r) => setTimeout(r, 1500));
      await g.console.exec('munus next');
      await new Promise((r) => setTimeout(r, 6000));
      await g.console.exec('munus lusio');
      await new Promise((r) => setTimeout(r, 6000));
    });
  },
};

async function orphanSites() {
  return page.evaluate(() => {
    const g = window.__skyrome.game;
    const geos = new Set();
    g.scene.traverse((o) => o.geometry && geos.add(o.geometry.uuid));
    const cached = window.__cachedUuids ?? new Set();
    const by = {};
    for (const geo of window.__tracked ?? []) if (!geos.has(geo.uuid) && !cached.has(geo.uuid)) by[geo.__where ?? '?'] = (by[geo.__where ?? '?'] ?? 0) + 1;
    return Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 6);
  });
}

async function snapshot(name) {
  const file = resolve(outDir, `${name}.heapsnapshot`);
  const ws = createWriteStream(file);
  const onChunk = (e) => ws.write(e.chunk);
  cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
  await new Promise((r) => ws.end(r));
  console.log(`  heap snapshot: ${file}`);
}

for (const phase of phases) {
  if (phase === 'soak') continue;
  const act = ACTIVITIES[phase];
  if (!act) {
    console.log(`unknown phase ${phase}`);
    continue;
  }
  const n = cycles(phase);
  console.log(`\n== ${phase}: ${n} cycles`);
  // Two warm-up cycles: first-use caches (interior build, menu DOM, shaders) are not leaks.
  for (let i = 0; i < (WARM[phase] ?? 2) && !crashed; i++) await act(i).catch((e) => errors.push(`[${phase} warm] ${e.message}`));
  const base = crashed ? null : await sample();
  if (args.snapshot === phase) await snapshot(`${phase}-before`);
  const rows = [base];
  for (let i = 0; i < n && !crashed; i++) {
    try {
      await act(i + (WARM[phase] ?? 2));
    } catch (e) {
      errors.push(`[${phase} cycle ${i}] ${e.message}`);
    }
    if ((i + 1) % (EVERY[phase] ?? Math.max(1, Math.floor(n / 10))) === 0 || (!EVERY[phase] && i === n - 1)) {
      const s = await sample().catch(() => null);
      if (!s) break;
      rows.push(s);
      console.log(`  cycle ${String(i + 1).padStart(3)}: ` + KEYS.map((k) => `${k} ${s[k]}`).join(' · ') + ` · aud ${s.audioNodes}n/${s.audioBufs}b/${s.audioMB}MB`);
    }
  }
  if (args.snapshot === phase) await snapshot(`${phase}-after`);
  // Lap-sampled phases compare same-place samples only: the warm-up lap itself still streams in.
  const first = EVERY[phase] && rows.length > 2 ? rows[1] : rows[0];
  const last = rows[rows.length - 1];
  const half = rows[Math.floor(rows.length / 2)];
  const grew = [];
  if (first && last) {
    const hs = (last.heap - first.heap) / (EVERY[phase] && rows.length > 2 ? n - EVERY[phase] : n);
    if (hs > slope && last.heap > half.heap) grew.push(`heap +${(last.heap - first.heap).toFixed(0)} MB (${hs.toFixed(2)} MB/cycle)`);
    for (const k of KEYS.slice(1)) {
      // Growth that continues in the second half is a leak; a step that then holds is a cache.
      const d1 = last[k] - first[k];
      const d2 = last[k] - half[k];
      // The world is alive (NPCs come and go, the day moves), so counters drift a little: flag more than 5 %
      // (25 at least), and only when the second half kept growing. audioLive and listeners swing with GC
      // timing and open UI: wider bands.
      const tol = k === 'audioLive' ? Math.max(150, first[k]) : k === 'listeners' ? Math.max(30, first[k] * 0.3) : Math.max(25, first[k] * 0.05);
      if (d2 > 0 && d1 > tol) grew.push(`${k} +${d1}`);
    }
    // Buffers made per cycle are real memory (a synthesized sound cached per hit would show here).
    if ((last.audioMB - first.audioMB) / n > 0.05) grew.push(`audio buffers +${(last.audioMB - first.audioMB).toFixed(1)} MB`);
  }
  if (args.orphans) console.log('  orphan geometries by builder:', JSON.stringify(await orphanSites()));
  results.push({ phase, cycles: n, first, last, grew });
  console.log(`  ${grew.length ? 'GROWTH: ' + grew.join(', ') : 'flat'}`);
}

if (phases.includes('soak') && !crashed) {
  const minutes = Number(args.soak ?? 30);
  console.log(`\n== soak: ${minutes} min of mixed cycles`);
  const mix = ['teleport', 'menus', 'fights', 'daynight', 'saveload', 'interior'];
  const rows = [await sample()];
  const end = Date.now() + minutes * 60000;
  let i = 0;
  let nextSample = Date.now() + 60000;
  while (Date.now() < end && !crashed) {
    await ACTIVITIES[mix[i % mix.length]](i).catch((e) => errors.push(`[soak] ${e.message}`));
    i++;
    if (Date.now() >= nextSample) {
      nextSample += 60000;
      const s = await sample().catch(() => null);
      if (!s) break;
      rows.push(s);
      console.log(`  minute ${rows.length - 1}: ` + KEYS.map((k) => `${k} ${s[k]}`).join(' · '));
    }
  }
  const first = rows[Math.min(5, rows.length - 1)];
  const last = rows[rows.length - 1];
  const grew = [];
  if (last.heap - first.heap > 100) grew.push(`heap +${(last.heap - first.heap).toFixed(0)} MB after warm-up`);
  for (const k of ['geo', 'tex', 'bodies', 'listeners', 'intervals', 'timeouts']) if (last[k] - first[k] > Math.max(5, first[k] * 0.05)) grew.push(`${k} +${last[k] - first[k]}`);
  results.push({ phase: 'soak', cycles: i, first, last, grew });
  console.log(`  ${grew.length ? 'GROWTH: ' + grew.join(', ') : 'flat'}`);
}

if (args.json) writeFileSync(resolve(root, String(args.json)), JSON.stringify(results, null, 1));
console.log('\nSummary (first sample after warm-up -> last):');
for (const r of results) {
  const a = r.first;
  const b = r.last;
  console.log(`  ${r.phase.padEnd(9)} heap ${a?.heap} -> ${b?.heap} MB · geo ${a?.geo} -> ${b?.geo} · tex ${a?.tex} -> ${b?.tex} · mat ${a?.mat} -> ${b?.mat} · colliders ${a?.colliders} -> ${b?.colliders} · listeners ${a?.listeners} -> ${b?.listeners} · ${r.grew.length ? 'GROWTH ' + r.grew.join(', ') : 'flat'}`);
}
const pageErrors = [...new Set(errors)];
if (pageErrors.length) console.log(`errors (${pageErrors.length}):\n  ${pageErrors.slice(0, 12).join('\n  ')}`);
await browser.close();
await server.close();
const bad = crashed || pageErrors.some((e) => e.startsWith('[pageerror]')) || results.some((r) => r.grew.length);
console.log(bad ? 'FAIL' : 'PASS');
process.exit(bad ? 1 : 0);

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
