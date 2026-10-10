#!/usr/bin/env node
/**
 * NPCs walking into walls: counts, per zone, the fixed steps in which a walking full-sim NPC pushed
 * into a static collider and barely moved (NpcManager.wallCount), and the episodes (6+ steps in a
 * row, 0.1 s), per minute, with a breakdown by what the NPC was doing and where the goal was.
 *
 *   node scripts/npcwalls.mjs [--zones forum,subura,velabrum] [--seconds 60] [--query "wall=0"] [--json out.json]
 *
 * Zones: forum (the boot point), subura (the Argiletum / Subura street), velabrum, or x,z pairs
 * written as name@x,z. Each zone is visited by teleport, given 12 s to fill with people, then
 * measured. Prints episodes/min, blocked steps as a share of walking steps, the breakdown, and
 * the 8 worst places (episodes within 3 m of each other are one place).
 */
import { createServer as createNetServer } from 'node:net';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] === undefined || all[i + 1].startsWith('--') ? true : all[i + 1]]] : a), []));
const ZONES = { forum: null, subura: [248, -104], velabrum: [-30, 200], tuscus: [60, 90], argiletum: [150, -75] };
const zones = String(args.zones ?? 'forum,subura,velabrum').split(',').map((z) => {
  const [name, at] = z.split('@');
  return { name, at: at ? at.split(',').map(Number) : ZONES[name] };
});
const seconds = Number(args.seconds ?? 60);

const { createServer } = await import('vite');
const port = await new Promise((res) => {
  const s = createNetServer();
  s.listen(0, '127.0.0.1', () => {
    const p = s.address().port;
    s.close(() => res(p));
  });
});
const server = await createServer({ root, logLevel: 'error', server: { port, strictPort: true, host: '127.0.0.1', hmr: false } });
await server.listen();
const { chromium } = await import('playwright');
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));
await page.goto(`http://127.0.0.1:${port}/?scene=rome&${args.query ?? 'at=rostra&hour=10'}&tgm=1`);
await page.waitForFunction(() => window.__skyrome?.ready, null, { timeout: 120000, polling: 200 });
await page.waitForTimeout(2000);

const out = {};
for (const z of zones) {
  const r = await page.evaluate(async ({ z, seconds }) => {
    const game = window.__skyrome.game;
    const pop = game.population;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    if (z.at) game.player.teleport({ x: z.at[0], y: game.heightmap.heightAt(z.at[0], z.at[1]) + 0.5, z: z.at[1] });
    await wait(12000);
    pop.wallCount = true;
    const w = pop.wall;
    w.walking = w.blocked = w.episodes = 0;
    w.log.length = 0;
    const t0 = performance.now();
    await wait(seconds * 1000);
    const mins = (performance.now() - t0) / 60000;
    pop.wallCount = false;
    return { mins, full: pop.stats.full, walking: w.walking, blocked: w.blocked, episodes: w.episodes, log: w.log.slice() };
  }, { z, seconds });
  // Breakdown by what they were doing and how far from the goal.
  const by = { task: {}, goal: { 'within 2 m': 0, 'further': 0 }, corner: { walled: 0, clear: 0 } };
  const places = [];
  for (const l of r.log) {
    const task = l.why.split(' ').pop();
    by.task[task] = (by.task[task] ?? 0) + 1;
    const dg = Number(/dg:([\d.]+)/.exec(l.why)?.[1] ?? 99);
    by.goal[dg <= 2 ? 'within 2 m' : 'further']++;
    by.corner[l.why.includes('WALLED') ? 'walled' : 'clear']++;
    const p = places.find((q) => Math.hypot(q.x - l.x, q.z - l.z) < 3);
    if (p) p.n++;
    else places.push({ x: l.x, z: l.z, n: 1, ids: l.id, why: l.why, goal: l.goal });
  }
  places.sort((a, b) => b.n - a.n);
  out[z.name] = { episodesPerMin: +(r.episodes / r.mins).toFixed(1), blockedShare: +((100 * r.blocked) / Math.max(1, r.walking)).toFixed(2), blockedSteps: r.blocked, walkingSteps: r.walking, npcsFull: r.full, logged: r.log.length, by, worst: places.slice(0, 8) };
  console.log(`${z.name}: ${out[z.name].episodesPerMin} episodes/min, ${out[z.name].blockedShare}% of walking steps blocked (${r.blocked}/${r.walking}), ${r.full} full-sim NPCs`);
  console.log(`  by task ${JSON.stringify(by.task)}; goal ${JSON.stringify(by.goal)}; next corner ${JSON.stringify(by.corner)}`);
  for (const p of places.slice(0, 8)) console.log(`  x${p.n} at ${p.x},${p.z} (${p.ids}) -> ${p.goal}: ${p.why}`);
}
await browser.close();
await server.close();
if (errors.length) console.log('page errors:', errors.slice(0, 5));
if (args.json) writeFileSync(resolve(root, String(args.json)), JSON.stringify(out, null, 1));
