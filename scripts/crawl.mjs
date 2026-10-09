#!/usr/bin/env node
/**
 * Geometry crawl: boots the game with the geometry audit on (`?audit`, src/dev/audit/geomAudit.ts),
 * walks the player to every landmark of the city (and along the opening's route), lets the city
 * stream in, and audits the ground around each stop for stacked surfaces of different materials,
 * terrain showing through paving, paving lips standing off the terrain, 3-12 cm ledges between walkable surfaces, dead-end flights of steps
 * and floating or buried props. Prints a ranked report by cause (what built it) and screenshots
 * the worst examples of each kind.
 *
 *   node scripts/crawl.mjs [--only porta-capena,ludus-magnus] [--max 400] [--radius 36]
 *                          [--shots 6] [--json crawl.json]
 *
 * Output: .shots/crawl/<kind>-<n>.png and (with --json) the full findings.
 */
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const outDir = resolve(root, '.shots/crawl');
mkdirSync(outDir, { recursive: true });
const radius = Number(args.radius ?? 36);
const maxStops = Number(args.max ?? 400);
const shotsPer = Number(args.shots ?? 6);

const { createServer } = await import('vite');
const port = await freePort();
const server = await createServer({ root, logLevel: 'error', server: { port, strictPort: true, host: '127.0.0.1', hmr: false } });
await server.listen();
const url = `http://127.0.0.1:${port}/?scene=rome&quick=1&hour=11&audit=1`;

const pw = await import('playwright');
const browser = await pw.chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));

let code = 0;
try {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__skyrome?.ready || window.__skyrome?.error, null, { timeout: 120000, polling: 200 });
  await page.waitForTimeout(2000);
  // Stops: every landmark location (a walkable point next to it), the opening's route in between.
  const stops = await page.evaluate(({ only }) => {
    const g = window.__skyrome.game;
    const nav = g.population?.nav;
    const out = [];
    const seen = [];
    const push = (id, x, z) => {
      const s = nav ? nav.snap(x, z, 30) : { x, z };
      if (seen.some((p) => Math.hypot(p.x - s.x, p.z - s.z) < 25)) return;
      seen.push(s);
      out.push({ id, x: s.x, z: s.z });
    };
    const route = ['porta-capena', 'circus-maximus', 'miliarium-aureum', 'temple-castor-pollux', 'ludus-magnus', 'meta-sudans', 'colosseum'];
    for (let i = 0; i + 1 < route.length; i++) {
      const a = g.locations.get(route[i])?.position, b = g.locations.get(route[i + 1])?.position;
      if (!a || !b) continue;
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      for (let s = 0; s < L; s += 45) push(`route:${route[i]}+${Math.round(s)}`, a.x + ((b.x - a.x) * s) / L, a.z + ((b.z - a.z) * s) / L);
    }
    for (const l of g.locations.all()) {
      if (only && !only.includes(l.id)) continue;
      if (!l.position) continue;
      push(l.id, l.position.x, l.position.z);
    }
    return only ? out.filter((s) => only.some((o) => s.id.startsWith(o))) : out;
  }, { only: args.only ? String(args.only).split(',') : null });
  console.log(`${stops.length} stops`);
  const all = [];
  let n = 0;
  for (const s of stops.slice(0, maxStops)) {
    n++;
    await page.evaluate(({ x, z }) => {
      const g = window.__skyrome.game;
      g.player.teleport({ x, y: g.heightmap.heightAt(x, z) + 0.4, z }, 0);
    }, s);
    await page.waitForTimeout(2600);
    const f = await page.evaluate(({ x, z, r }) => window.__audit.analyzeArea(x, z, r, (a, b) => window.__skyrome.game.heightmap.heightAt(a, b)), { x: s.x, z: s.z, r: radius });
    for (const it of f) all.push({ ...it, stop: s.id });
    if (n % 10 === 0) console.log(`  ${n}/${Math.min(stops.length, maxStops)} stops, ${all.length} findings`);
  }
  // Merge duplicates (stops overlap): same kind, key and position.
  const uniq = new Map();
  for (const f of all) {
    const k = `${f.kind}|${f.key}|${Math.round(f.at[0])},${Math.round(f.at[2])}`;
    const e = uniq.get(k);
    if (!e || e.cells < f.cells) uniq.set(k, f);
  }
  const finds = [...uniq.values()];
  // Report: per kind, the causes ranked by affected cells (0.5 m) / count.
  const kinds = ['stacked', 'through', 'lip', 'ledge', 'deadend', 'floating', 'buried'];
  const cause = (key) => key.replace(/:[0-9a-f-]{6,}|\b\d+(\.\d+)?\b/g, '#');
  for (const kind of kinds) {
    const list = finds.filter((f) => f.kind === kind);
    if (!list.length) continue;
    const by = new Map();
    for (const f of list) {
      const c = kind === 'stacked' ? f.key.split(' | ').map(cause).sort().join(' | ') : cause(f.key);
      const e = by.get(c) ?? { cells: 0, n: 0, ex: f, max: 0 };
      e.cells += f.cells;
      e.max = Math.max(e.max, f.depth ?? 0);
      e.n++;
      if (f.cells > e.ex.cells) e.ex = f;
      by.set(c, e);
    }
    const rows = [...by.entries()].sort((a, b) => b[1].cells - a[1].cells);
    const total = rows.reduce((s, [, e]) => s + e.cells, 0);
    console.log(`\n== ${kind}: ${list.length} places, ${total} cells (0.5 m) — by cause`);
    for (const [c, e] of rows.slice(0, 25)) console.log(`  ${String(e.cells).padStart(6)}  ×${String(e.n).padEnd(4)} ${c}   max ${e.max.toFixed(2)} m  e.g. @${e.ex.at.join(',')} (${e.ex.stop})`);
  }
  if (args.json) writeFileSync(resolve(root, args.json), JSON.stringify(finds, null, 1));
  // Screenshots of the worst examples per kind.
  await page.evaluate(() => {
    const g = window.__skyrome.game;
    document.querySelectorAll('.ui-root').forEach((e) => (e.style.display = 'none'));
    window.__pin = null;
    g.addSystem({ name: 'crawlCam', priority: 150, lateUpdate() { const c = window.__pin; if (c) { g.camera.position.set(c[0], c[1], c[2]); g.camera.lookAt(c[3], c[4], c[5]); } } });
  });
  for (const kind of kinds) {
    const list = finds.filter((f) => f.kind === kind).sort((a, b) => b.cells - a.cells).slice(0, shotsPer);
    let i = 0;
    for (const f of list) {
      const [x, y, z] = f.at;
      await page.evaluate(({ x, y, z }) => {
        const g = window.__skyrome.game;
        g.player.teleport({ x: x + 3, y: g.heightmap.heightAt(x + 3, z + 3) + 0.4, z: z + 3 }, 0);
        // Look down at the spot from 3 m aside and 7 m up (clear of walls).
        window.__pin = [x + 2.5, y + 7, z + 3, x, y, z];
        g.player.avatar && (g.player.avatar.root.visible = false);
      }, { x, y, z });
      await page.waitForTimeout(2200);
      const p = join(outDir, `${kind}-${++i}.png`);
      await page.screenshot({ path: p });
      console.log(`shot ${p}  ${f.key} @${f.at.join(',')}`);
    }
  }
} catch (e) {
  code = 1;
  console.error('FAILED:', e.message);
} finally {
  if (errors.length) console.log('page errors:\n  ' + errors.slice(0, 10).join('\n  '));
  await browser.close();
  await server.close();
  process.exit(code);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[a.slice(2)] = true;
    else { out[a.slice(2)] = next; i++; }
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
