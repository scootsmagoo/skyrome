#!/usr/bin/env node
/**
 * AC-20 soak: the game runs for N minutes (default 30) with a bot playing it — wandering to
 * random reachable places, fighting a mugger every few minutes, quicksaving and loading — and
 * must not crash, log errors, or keep growing its memory (< 100 MB after a 5-minute warm-up).
 *
 *   node scripts/soak.mjs [--minutes 30] [--warmup 5] [--home 90]
 *
 * --home R keeps the bot's goals within R m of where it started (separates leaks from the city
 * streaming in new districts).
 *
 * Chromium only (performance.memory). Prints a memory sample every minute and a verdict.
 */
import { createServer as createNetServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const minutes = Number(args.minutes ?? 30);
const warmup = Number(args.warmup ?? 5);
const home = Number(args.home ?? 0);

const { createServer } = await import('vite');
const port = await freePort();
const server = await createServer({ root, logLevel: 'error', server: { port, strictPort: true, host: '127.0.0.1', hmr: false } });
await server.listen();
const { chromium } = await import('playwright');
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${String(e?.message ?? e)}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`[console] ${m.text()}`));
const cdp = await page.context().newCDPSession(page);
let crashed = false;
page.on('crash', () => (crashed = true));

const t0 = Date.now();
await page.goto(`http://127.0.0.1:${port}/?scene=rome`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__skyrome?.ready, null, { timeout: 120000, polling: 200 });
console.log(`booted in ${((Date.now() - t0) / 1000).toFixed(0)} s`);

// The bot, in the page.
await page.evaluate((home) => {
  const game = window.__skyrome.game;
  const p = game.player;
  const s = (window.__soak = { trips: 0, fights: 0, saves: 0, loads: 0, minFps: 99, stuckTrips: 0 });
  let goal = null;
  let since = performance.now();
  let lastFight = performance.now();
  let lastSave = performance.now();
  let lastPos = p.position.clone();
  let still = 0;
  const start = p.position.clone();
  const pick = () => {
    const g = game.population?.nav?.grid;
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 25 + Math.random() * 60;
      const o = home ? start : p.position;
      const x = o.x + Math.cos(a) * (home ? Math.random() * home : r);
      const z = o.z + Math.sin(a) * (home ? Math.random() * home : r);
      const c = g?.nearestWalkable(x, z, 6, { x: 0, z: 0 }, true);
      if (c) return c;
    }
    return { x: p.position.x + 20, z: p.position.z };
  };
  game.input.simulate('KeyW', true);
  setInterval(() => {
    const now = performance.now();
    s.minFps = Math.min(s.minFps, game.stats.fps || 99);
    // A fight every ~3 minutes: a mugger right ahead, fought with F until it drops.
    const foe = game.combat?.core.get('soak-foe');
    if (foe && foe.active) {
      p.yaw = Math.atan2(-(foe.position.x - p.position.x), -(foe.position.z - p.position.z));
      game.input.simulate('KeyF', true);
      setTimeout(() => game.input.simulate('KeyF', false), 60);
      return;
    }
    if (now - lastFight > 180000 && game.combat) {
      lastFight = now;
      s.fights++;
      const f = { x: p.position.x + Math.sin(p.heading) * 3, y: p.position.y, z: p.position.z + Math.cos(p.heading) * 3 };
      game.combat.spawnEnemy('grassator', f, { id: 'soak-foe', engage: true });
      return;
    }
    // Quicksave now and then, and load it back once in a while.
    if (now - lastSave > 240000) {
      lastSave = now;
      s.saves++;
      void game.rpg.save.quicksave();
      if (s.saves % 2 === 0) setTimeout(() => game.flow.loadSlot('quick').then((ok) => ok && s.loads++), 3000);
    }
    // Wander: a new reachable goal when there, after 40 s, or when going nowhere.
    const moved = Math.hypot(p.position.x - lastPos.x, p.position.z - lastPos.z);
    lastPos = p.position.clone();
    still = moved < 0.05 ? still + 1 : 0;
    if (!goal || Math.hypot(goal.x - p.position.x, goal.z - p.position.z) < 3 || now - since > 40000 || still > 40) {
      if (goal && still > 40) s.stuckTrips++;
      goal = pick();
      since = now;
      still = 0;
      s.trips++;
    }
    const path = game.population?.nav?.findPath(p.position.x, p.position.z, goal.x, goal.z);
    const c = Array.isArray(path) ? (path.find((q) => Math.hypot(q.x - p.position.x, q.z - p.position.z) > 1.2) ?? goal) : goal;
    p.yaw = Math.atan2(-(c.x - p.position.x), -(c.z - p.position.z));
  }, 100);
}, home);

const samples = [];
const sample = async () => {
  if (crashed) return null;
  try {
    // A full collection first, through DevTools: otherwise the heap swings ±50 MB with garbage.
    await cdp.send('HeapProfiler.collectGarbage');
    return await page.evaluate(() => {
      const g = window.__skyrome.game;
      const info = g.renderer.info.memory;
      let objects = 0;
      g.scene.traverse(() => objects++);
      const count = { geo: info.geometries, tex: info.textures, objects, colliders: g.physics.world.colliders.len(), actors: g.combat?.core.list.length ?? null };
      return { count, heap: Math.round(performance.memory.usedJSHeapSize / 1048576), fps: Math.round(g.stats.fps), soak: { ...window.__soak }, pos: g.player.position.toArray().map(Math.round), hp: Math.round(g.player.sheet.vitals.health.current) };
    });
  } catch {
    return null;
  }
};
for (let m = 1; m <= minutes; m++) {
  await page.waitForTimeout(60000);
  const s = await sample();
  if (!s) {
    console.log(`minute ${m}: the page is gone (crashed: ${crashed})`);
    break;
  }
  samples.push({ m, ...s });
  console.log(`minute ${String(m).padStart(2)}: heap ${s.heap} MB · ${s.fps} fps · trips ${s.soak.trips} (stuck ${s.soak.stuckTrips}) · fights ${s.soak.fights} · saves ${s.soak.saves} loads ${s.soak.loads} · at ${s.pos.join(',')} · hp ${s.hp} · ${JSON.stringify(s.count)}`);
}
await browser.close();
await server.close();

// Median of three minutes at each end: one sample can catch a burst of streaming.
const median3 = (at) => {
  const i = Math.max(0, Math.min(samples.length - 3, at));
  const h = samples.slice(i, i + 3).map((s) => s.heap).sort((a, b) => a - b);
  return { m: samples[i]?.m, heap: h[Math.floor(h.length / 2)] };
};
const warm = samples.length ? median3(samples.findIndex((s) => s.m === warmup)) : null;
const last = samples.length ? median3(samples.length - 3) : null;
const growth = warm && last ? last.heap - warm.heap : NaN;
const ok = !crashed && samples.length === minutes && growth < 100 && errors.length === 0;
console.log(`\n${ok ? 'PASS' : 'FAIL'}  ${minutes} min · crashed ${crashed} · median heap ${warm?.heap} MB from minute ${warm?.m} → ${last?.heap} MB from minute ${last?.m} (growth ${growth} MB, limit 100) · errors ${errors.length}`);
if (errors.length) console.log(`  first errors:\n  ${[...new Set(errors)].slice(0, 8).join('\n  ')}`);
process.exit(ok ? 0 : 1);

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
