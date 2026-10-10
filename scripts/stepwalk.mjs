#!/usr/bin/env node
/**
 * Step-over survey: a scripted walker crosses many kerbs, road edges, paving lips and plaza edges
 * with the REAL player controller (simulated W key, walk and run) and records every stall.
 *
 *   node scripts/stepwalk.mjs [--n 40] [--seed 1] [--modes walk,run] [--area x,z,r] [--json out.json]
 *                             [--query "at=rostra&hour=10"] [--minrise 0.06] [--maxrise 0.46]
 *
 * How: it picks random street-graph edges (game.streets, inside the area: default the whole
 * map), teleports there so the city builds around it, and scans lines across the street (and
 * 45 degrees to it) with ray casts every 0.25 m. A candidate line is a stretch at least 3 m long
 * where the ground is continuous (no jump over --maxrise, which is a climb, no wall, no steep
 * surface, 0.4 m clear either side) and that has at least one ledge of --minrise or more. The
 * walker starts at one end, faces the other, holds W (walk mode, or run; both ways) and counts a
 * STALL when it makes under 0.15 m of progress in 1.2 s while the key is down, or does not get
 * there in twice the time.
 *
 * Prints the stall rate by mode and by ledge height, and each stall with its position, so the
 * geometry or the controller can be fixed at the spot. Exit code is always 0 (it is a survey).
 */
import { createServer as createNetServer } from 'node:net';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] === undefined || all[i + 1].startsWith('--') ? true : all[i + 1]]] : a), []));
const opts = {
  n: Number(args.n ?? 40),
  seed: Number(args.seed ?? 1),
  modes: String(args.modes ?? 'walk,run').split(','),
  area: args.area ? String(args.area).split(',').map(Number) : null,
  minRise: Number(args.minrise ?? 0.06),
  maxRise: Number(args.maxrise ?? 0.46),
  // Replay: "sx,sz,dx,dz,len;..." (the start and direction a STALL line prints) instead of random street samples.
  lines: args.lines ? String(args.lines).split(';').map((l) => l.split(',').map(Number)) : null,
  verbose: !!args.verbose,
};

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

const report = await page.evaluate(async (o) => {
  const game = window.__skyrome.game;
  const p = game.player;
  const ph = game.physics;
  const inp = game.input;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let seed = o.seed * 7919 + 13;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const DOWN = { x: 0, y: -1, z: 0 };
  const WORLD = 1; // Layer.World (core/Physics.ts)
  try {
    game.console?.exec?.('tgm on');
  } catch {
    /* god mode is a convenience */
  }

  const st = game.streets;
  const nodes = st.nodes;
  const node = (i) => (nodes.get ? nodes.get(i) : nodes[i]);
  const edges = st.edges.filter((e) => {
    const a = node(e[0]);
    const b = node(e[1]);
    if (!a || !b) return false;
    if (o.area) return Math.hypot((a.x + b.x) / 2 - o.area[0], (a.z + b.z) / 2 - o.area[1]) < o.area[2];
    return true;
  });

  /** Ground at a point: the surface a walker stands on, from a ray cast down from `top`. */
  function ground(x, z, top) {
    const h = ph.raycast({ x, y: top, z }, DOWN, 4.2, WORLD);
    if (!h || h.distance < 0.02) return null;
    return { y: h.point.y, ny: h.normal.y };
  }
  function wallBetween(x0, z0, x1, z1, y) {
    const d = Math.hypot(x1 - x0, z1 - z0);
    if (d < 1e-6) return false;
    // y is the foot level: test at knee, waist and head so a rail or a low wall counts.
    for (const up of [0.25, 0.7, 1.4]) if (ph.raycast({ x: x0, y: y - 0.6 + up, z: z0 }, { x: (x1 - x0) / d, y: 0, z: (z1 - z0) / d }, d + 0.35, WORLD)) return true;
    return false;
  }

  /** Scan a line from (x0,z0) along (dx,dz) for `len` m: walkable stretches with ledges in them. */
  function scan(x0, z0, dx, dz, len, top) {
    const step = 0.25;
    const pts = [];
    for (let s = 0; s <= len; s += step) {
      const x = x0 + dx * s;
      const z = z0 + dz * s;
      const g = ground(x, z, top);
      pts.push({ s, x, z, g });
    }
    const runs = [];
    let cur = null;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const ok = a.g && a.g.ny > 0.7 && !wallBetween(a.x, a.z, a.x - dz * 0.4, a.z + dx * 0.4, a.g.y + 0.6) && !wallBetween(a.x, a.z, a.x + dz * 0.4, a.z - dx * 0.4, a.g.y + 0.6) && !wallBetween(a.x, a.z, a.x, a.z, a.g.y + 1.2);
      let joined = false;
      if (ok && cur) {
        const prev = pts[i - 1];
        const dh = a.g.y - prev.g.y;
        if (prev.g && Math.abs(dh) <= o.maxRise && !wallBetween(prev.x, prev.z, a.x, a.z, Math.min(a.g.y, prev.g.y) + 0.6)) {
          cur.end = i;
          if (Math.abs(dh) >= o.minRise) cur.ledges.push({ s: a.s, dh });
          joined = true;
        }
      }
      if (!joined) {
        if (cur) runs.push(cur);
        cur = ok ? { start: i, end: i, ledges: [] } : null;
      }
    }
    if (cur) runs.push(cur);
    return runs
      .filter((r) => (r.end - r.start) * step >= 3 && r.ledges.length)
      .map((r) => ({ a: pts[r.start], b: pts[r.end], ledges: r.ledges, len: (r.end - r.start) * step }));
  }

  const tests = [];
  const result = { lines: 0, walks: 0, stalls: [], byMode: {}, byRise: {}, edgesTried: 0 };
  const speeds = { walk: 1.9, run: 4.4, sprint: 7.4 };

  async function walkLine(c, mode, back) {
    const A = back ? c.b : c.a;
    const B = back ? c.a : c.b;
    const dx = (B.x - A.x) / c.len;
    const dz = (B.z - A.z) / c.len;
    p.teleport({ x: A.x, y: A.g.y + 0.04, z: A.z });
    p.yaw = Math.atan2(-dx, -dz);
    p.walkMode = mode === 'walk';
    p.sneaking = false;
    // Let the city build colliders at the start and the body settle; a walker that did not land
    // where it was put (fell, or was pushed) is a harness miss, not a stall.
    await wait(450);
    if (Math.abs(p.position.y - A.g.y) > 0.3 || Math.hypot(p.position.x - A.x, p.position.z - A.z) > 0.5) {
      result.setupMisses = (result.setupMisses ?? 0) + 1;
      return;
    }
    const key = 'KeyW';
    inp.simulate('KeyW', true);
    if (mode === 'sprint') inp.simulate('ShiftLeft', true);
    const t0 = performance.now();
    const limit = (c.len / speeds[mode]) * 2000 + 2500;
    let lastP = { x: p.position.x, z: p.position.z, t: t0 };
    let outcome = 'ok';
    let progress = 0;
    for (;;) {
      await wait(40);
      const now = performance.now();
      progress = (p.position.x - A.x) * dx + (p.position.z - A.z) * dz;
      if (progress >= c.len - 0.6) break;
      // Knocked off the line (a wall's slide)? Still a stall if it makes no headway.
      if (now - lastP.t > 1200) {
        if (Math.hypot(p.position.x - lastP.x, p.position.z - lastP.z) < 0.15) {
          outcome = 'stall';
          break;
        }
        lastP = { x: p.position.x, z: p.position.z, t: now };
      }
      if (now - t0 > limit) {
        outcome = 'slow';
        break;
      }
    }
    // What is in front of the feet at the stall (distance to a hit, 1.2 m max, at four heights).
    const front = [0.05, 0.2, 0.4, 0.8].map((hh) => {
      const r = ph.raycast({ x: p.position.x, y: p.position.y + hh, z: p.position.z }, { x: dx, y: 0, z: dz }, 1.2, WORLD);
      return r ? +r.distance.toFixed(2) : null;
    });
    const diag = { grounded: p.grounded, v: [+p.velocity.x.toFixed(2), +p.velocity.y.toFixed(2), +p.velocity.z.toFixed(2)], ahead: front };
    inp.simulate(key, false);
    if (mode === 'sprint') inp.simulate('ShiftLeft', false);
    result.walks++;
    const m = (result.byMode[mode + (back ? ':back' : '')] ??= { n: 0, stalls: 0 });
    m.n++;
    // The ledge the walker was nearest to when it stopped (the one it failed on).
    const ahead = (back ? [...c.ledges].reverse() : c.ledges).map((l) => ({ s: back ? c.len - l.s : l.s, dh: back ? -l.dh : l.dh })).find((l) => l.s >= progress - 0.5) ?? null;
    const rises = c.ledges.map((l) => Math.abs(l.dh));
    const maxUp = Math.max(...(back ? c.ledges.map((l) => -l.dh) : c.ledges.map((l) => l.dh)), 0);
    const bucket = maxUp < 0.0001 ? 'down only' : maxUp < 0.09 ? '0.00-0.09' : maxUp < 0.15 ? '0.09-0.15' : maxUp < 0.3 ? '0.15-0.30' : '0.30-0.46';
    const rb = (result.byRise[bucket] ??= { n: 0, stalls: 0 });
    rb.n++;
    if (outcome !== 'ok') {
      m.stalls++;
      rb.stalls++;
      result.stalls.push({ diag, mode, back, outcome, at: [+p.position.x.toFixed(1), +p.position.y.toFixed(2), +p.position.z.toFixed(1)], progress: +progress.toFixed(2), len: c.len, ledge: ahead, rises: rises.map((r) => +r.toFixed(2)), start: [+A.x.toFixed(2), +A.z.toFixed(2)], dir: [+dx.toFixed(3), +dz.toFixed(3)] });
    }
    await wait(120);
  }

  if (o.lines) {
    for (const [sx, sz, dx, dz, len] of o.lines) {
      p.teleport({ x: sx, y: game.heightmap.heightAt(sx, sz) + 1.2, z: sz });
      await wait(900);
      const top = p.position.y + 1.5;
      const found = scan(sx, sz, dx, dz, len, top);
      if (o.verbose) result.scans = (result.scans ?? []).concat([found.length]);
      for (const c of found) {
        tests.push(c);
        for (const mode of o.modes) {
          await walkLine(c, mode, false);
          await walkLine(c, mode, true);
        }
      }
    }
    result.tests = tests.length;
    return result;
  }
  for (let k = 0; k < o.n * 6 && tests.length < o.n; k++) {
    const e = edges[Math.floor(rnd() * edges.length)];
    const a = node(e[0]);
    const b = node(e[1]);
    const t = 0.2 + rnd() * 0.6;
    const mx = a.x + (b.x - a.x) * t;
    const mz = a.z + (b.z - a.z) * t;
    const el = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const ex = (b.x - a.x) / el;
    const ez = (b.z - a.z) / el;
    result.edgesTried++;
    const g0 = game.heightmap.heightAt(mx, mz);
    p.teleport({ x: mx, y: g0 + 1.2, z: mz });
    await wait(700);
    const here = ground(mx, mz, p.position.y + 1.5);
    const top = (here ? here.y : g0) + 1.5;
    // across (perpendicular) and 45 degrees
    const found = [];
    for (const ang of [Math.PI / 2, Math.PI / 4, -Math.PI / 4]) {
      const cs = Math.cos(ang);
      const sn = Math.sin(ang);
      const dx = ex * cs - ez * sn;
      const dz = ex * sn + ez * cs;
      found.push(...scan(mx - dx * 9, mz - dz * 9, dx, dz, 18, top));
    }
    result.lines++;
    if (!found.length) continue;
    // the one with the most ledges
    found.sort((u, v) => v.ledges.length - u.ledges.length);
    const c = found[0];
    tests.push(c);
    for (const mode of o.modes) {
      await walkLine(c, mode, false);
      await walkLine(c, mode, true);
    }
  }
  result.tests = tests.length;
  return result;
}, opts);

await browser.close();
await server.close();

const pct = (x) => (x.n ? `${x.stalls}/${x.n} (${((100 * x.stalls) / x.n).toFixed(0)}%)` : '0/0');
console.log(`stepwalk: ${report.tests} crossings from ${report.lines} street samples, ${report.walks} walks (${report.setupMisses ?? 0} start misses skipped)`);
for (const [k, v] of Object.entries(report.byMode)) console.log(`  mode ${k.padEnd(9)} stalls ${pct(v)}`);
for (const [k, v] of Object.entries(report.byRise).sort()) console.log(`  highest rise ${k.padEnd(10)} stalls ${pct(v)}`);
for (const s of report.stalls) console.log(`  STALL ${s.mode}${s.back ? ' back' : ''} ${s.outcome} at ${s.at.join(',')} progress ${s.progress}/${s.len} ledge ${JSON.stringify(s.ledge)} diag ${JSON.stringify(s.diag)} line ${s.start[0]},${s.start[1]},${s.dir[0]},${s.dir[1]},${s.len} rises ${s.rises.slice(0, 6).join('/')}`);
if (errors.length) console.log('page errors:', errors.slice(0, 5));
if (args.json) writeFileSync(resolve(root, String(args.json)), JSON.stringify(report, null, 1));
