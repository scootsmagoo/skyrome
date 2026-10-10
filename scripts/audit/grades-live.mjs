#!/usr/bin/env node
/**
 * Terrain grades audit, in the game: boots Rome headless on the real GPU, and at the story's places
 * and the worst spots of the offline audit (scripts/audit/grades.mjs) it measures the ground the
 * player really walks on (physics: terrain, streets, kerbs, flights, landmark floors) and runs the
 * real player up the steep ways with real input (W held, steered by the yaw like a player).
 *
 *   node scripts/audit/grades-live.mjs [--from scripts/audit/out/terrain-grades.json]
 *                                      [--json scripts/audit/out/terrain-grades-live.json]
 *                                      [--only stopId,stopId] [--no-routes] [--no-climb] [--no-shots] [--radius 45]
 *                                      [--minutes 14]
 *   node scripts/audit/grades-live.mjs --at "via-sacra@300,160;forum-trajan@105,-288"   (only screenshots:
 *                                      a side view across the slope and a view up it, at each point)
 *
 * 1. Street-graph survey: at every stop, the city streams in round the player, then every street
 *    graph edge within `--radius` m is sampled every 0.5 m with rays (from head height above the
 *    terrain): the surface's own slope (its normal), the grade over 2 m along the edge (steps over
 *    0.3 m in 0.5 m count as a flight, not a slope), and rays that start inside something.
 * 1b. The story's walks as the minimap routes them (QuestRoute's StreetRouter over game.streets), in
 *    50 m hops (the city streams in round each hop) with the same rays: metres over 20/30/35/40 degrees.
 * 2. Climbs: the real player (PlayerController, Rapier, the city's colliders) runs up each steep road
 *    or face from its low end, steered through its points; time against the flat time, stalls (under
 *    0.3 m in a second, with the slope there) and slides back.
 * 3. Screenshots: a side view of the steepest stretch of every climb that stalled or crawled, and of
 *    the steepest street edges (HUD hidden), in .shots/audit/grades/.
 *
 * Bounded: one browser, one page; every wait has a limit; `--minutes` caps the whole run.
 */
import { createServer as createNetServer } from 'node:net';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = parseArgs(process.argv.slice(2));
const fromPath = resolve(root, args.from ?? 'scripts/audit/out/terrain-grades.json');
const jsonOut = resolve(root, args.json ?? 'scripts/audit/out/terrain-grades-live.json');
const shotDir = resolve(root, '.shots/audit/grades');
mkdirSync(shotDir, { recursive: true });
const RADIUS = Number(args.radius ?? 45);
const DEADLINE = Date.now() + Number(args.minutes ?? 14) * 60000;
const T0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s]`, ...a);
const offline = existsSync(fromPath) ? JSON.parse(readFileSync(fromPath, 'utf8')) : null;
if (!offline) console.log(`(no offline audit at ${fromPath}: only the story places are surveyed)`);

// ------------------------------------------------------------------ what to visit
/** Story places (docs/STORY.md, the owner's list): landmark ids or atlas lowland/road ids resolved in the page. */
const STORY = [
  ['porta-capena', 'Porta Capena'], ['circus-maximus', 'Circus valley'], ['rostra', 'Forum'], ['area-velabrum', 'Velabrum'],
  ['road:vicus-tuscus', 'Vicus Tuscus'], ['subura', 'Subura'], ['ludus-magnus', 'Ludus Magnus'], ['colosseum', 'Colosseum valley'],
  ['meta-sudans', 'Meta Sudans'], ['forum-trajan', 'Forum of Trajan'], ['column-trajan', 'Trajan\'s Column'], ['portus-tiberinus', 'river district'],
  ['forum-boarium', 'Forum Boarium'], ['island:insula-tiberina', 'Tiber Island'], ['pantheon', 'Campus Martius'],
  ['road:clivus-suburanus', 'Clivus Suburanus'], ['road:clivus-scauri', 'Clivus Scauri'],
];
/** The story's walks as the minimap routes them (street graph, StreetRouter), surveyed in hops along the line. */
const ROUTES = [
  ['porta-capena', 'circus-maximus'], ['circus-maximus', 'rostra'], ['rostra', 'temple-castor-pollux'], ['temple-castor-pollux', 'ludus-magnus'],
  ['ludus-magnus', 'meta-sudans'], ['meta-sudans', 'colosseum'], ['rostra', 'forum-trajan'], ['forum-trajan', 'column-trajan'],
  ['rostra', 'subura'], ['rostra', 'forum-boarium'], ['forum-boarium', 'portus-tiberinus'], ['forum-boarium', 'island:insula-tiberina'], ['rostra', 'pantheon'],
];
/** Climbs: the steep atlas roads of the offline audit (low end first), then its blocked walkable hill faces. */
const climbs = [];
if (offline) {
  for (const r of offline.roads) {
    if (r.rise < 3 || r.max4m.pct < 25) continue;
    climbs.push({ id: `road:${r.id}`, kind: 'road', road: r.id, maxPct: r.max4m.pct, at: r.max4m.at });
  }
  for (const h of offline.hills) {
    // The hardest open face of each hill: walkable for most of its line, and slow or not climbed offline.
    const faces = (h.faces ?? []).filter((f) => f.run && f.walkableShare >= 0.6 && (!f.run.reached || f.run.meanSpeed < 2.5)).sort((a, b) => b.steepest4m.deg - a.steepest4m.deg);
    for (const f of faces.slice(0, 1)) climbs.push({ id: `face:${h.group}@${f.bearing}`, kind: 'face', foot: f.foot, summit: h.summit, from: f.run.from, to: f.run.to, maxDeg: f.steepest4m.deg, at: f.steepest4m.at, offlineReached: f.run.reached });
  }
}
/** Extra stops: the biggest steep patches of walkable ground on streets and squares (offline). */
const spotStops = offline ? offline.spots.over35.top.filter((s) => (s.classes.road ?? 0) + (s.classes.street ?? 0) + (s.classes.precinct ?? 0) > 0).slice(0, 12).map((s, i) => ({ id: `spot${i + 1}`, name: s.place, x: s.at[0], z: s.at[2], offline: s })) : [];

// ------------------------------------------------------------------ boot
const { createServer } = await import('vite');
const port = await freePort();
const server = await createServer({ root, logLevel: 'error', server: { port, strictPort: true, host: '127.0.0.1', hmr: false } });
await server.listen();
const url = `http://127.0.0.1:${port}/?scene=rome&quick=1&hour=11`;
const pw = await import('playwright');
const browser = await pw.chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));
const out = { generated: new Date().toISOString(), tool: 'scripts/audit/grades-live.mjs', stops: [], routes: [], climbs: [], errors };
let code = 0;
try {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__skyrome?.ready || window.__skyrome?.error, null, { timeout: 150000, polling: 250 });
  const bootErr = await page.evaluate(() => window.__skyrome?.error);
  if (bootErr) throw new Error('boot: ' + bootErr);
  await page.waitForTimeout(1500);
  await page.evaluate(install);
  log('booted');

  // -------------------------------------------------------------- 0. screenshots of given points only
  if (args.at) {
    await page.evaluate(() => window.__grades.camMode(true));
    const pts = String(args.at).split(';').filter(Boolean).map((t, i) => {
      const [name, xz] = t.includes('@') ? t.split('@') : [`at${i + 1}`, t];
      const [x, z] = xz.split(',').map(Number);
      return { name, x, z };
    });
    out.shots = [];
    for (const t of pts) {
      if (Date.now() > DEADLINE) break;
      for (const view of ['side', 'up']) {
        const info = await page.evaluate(({ x, z, view }) => window.__grades.viewAt(x, z, view), { ...t, view });
        await waitStream(2200);
        const p = join(shotDir, `${t.name}-${view}.png`);
        await page.screenshot({ path: p });
        out.shots.push({ ...t, view, shot: p, ...info });
        log(`shot ${p}  ground ${info.y} m, slope ${info.deg}° (terrain ${info.terrainDeg}°)`);
      }
    }
    throw Object.assign(new Error('done'), { done: true });
  }

  // -------------------------------------------------------------- 1. street-graph survey
  const stops = await page.evaluate((list) => window.__grades.resolve(list), STORY);
  const only = args.only ? String(args.only).split(',') : null;
  const allStops = [...stops, ...spotStops].filter((s) => !only || only.some((o) => s.id.includes(o)));
  for (const s of allStops) {
    if (Date.now() > DEADLINE) break;
    if (s.x == null) {
      out.stops.push({ ...s, error: 'not found' });
      continue;
    }
    await page.evaluate(({ x, z }) => window.__grades.go(x, z), s);
    await waitStream();
    const r = await page.evaluate(({ x, z, R }) => window.__grades.surveyEdges(x, z, R), { x: s.x, z: s.z, R: RADIUS });
    out.stops.push({ id: s.id, name: s.name, at: [s.x, r.y, s.z], ...r });
    log(`${s.id.padEnd(26)} ${String(r.edges).padStart(3)} edges, ${String(r.metres).padStart(5)} m: >20° ${r.over20} m, >30° ${r.over30} m, >35° ${r.over35} m, >40° ${r.over40} m; steepest ${r.worst[0] ? `${r.worst[0].deg}° @${r.worst[0].at.join(',')}` : '-'}`);
  }

  // -------------------------------------------------------------- 1b. the story's routes
  out.routes = [];
  if (!args['no-routes']) {
    for (const [a, b] of ROUTES) {
      if (Date.now() > DEADLINE) break;
      if (only && !only.some((o) => a.includes(o) || b.includes(o))) continue;
      const [A, B] = await page.evaluate((list) => window.__grades.resolve(list), [[a, a], [b, b]]);
      const line = await page.evaluate(({ A, B }) => window.__grades.routeLine(A.x, A.z, B.x, B.z), { A, B });
      if (!line) {
        out.routes.push({ from: a, to: b, error: 'no route' });
        continue;
      }
      const L = await page.evaluate((line) => window.__grades.lineLength(line), line);
      const acc = { from: a, to: b, metres: Math.round(L), over20: 0, over30: 0, over35: 0, over40: 0, grade2mOver30pct: 0, inside: 0, worst: [] };
      for (let s0 = 0; s0 < L; s0 += 50) {
        if (Date.now() > DEADLINE) break;
        const at = await page.evaluate(({ line, s0 }) => window.__grades.pointAlong(line, s0 + 25), { line, s0 });
        await page.evaluate(([x, z]) => window.__grades.go(x, z), at);
        await page.waitForTimeout(1200);
        const r = await page.evaluate(({ line, s0 }) => window.__grades.surveyLine(line, s0, s0 + 50), { line, s0 });
        for (const k of ['over20', 'over30', 'over35', 'over40', 'grade2mOver30pct', 'inside']) acc[k] += r[k];
        acc.worst.push(...r.worst);
      }
      acc.worst = acc.worst.sort((p, q) => q.deg - p.deg).slice(0, 6);
      for (const k of ['over20', 'over30', 'over35', 'over40', 'grade2mOver30pct', 'inside']) acc[k] = Math.round(acc[k]);
      out.routes.push(acc);
      log(`route ${a} → ${b}: ${acc.metres} m; surface >30° ${acc.over30} m, >35° ${acc.over35} m, >40° ${acc.over40} m; 2 m grade >30 % ${acc.grade2mOver30pct} m; steepest ${acc.worst[0] ? `${acc.worst[0].deg}° @${acc.worst[0].at.join(',')}` : '-'}`);
    }
  }

  // -------------------------------------------------------------- 2. climbs with real input
  if (!args['no-climb']) {
    await page.evaluate(() => window.__skyrome.game.console?.exec?.('tgm on'));
    for (const c of climbs) {
      if (Date.now() > DEADLINE) break;
      if (only && !only.some((o) => c.id.includes(o))) continue;
      const wps = await page.evaluate((c) => window.__grades.waypoints(c), c);
      if (!wps || wps.length < 2) continue;
      await page.evaluate(([x, z]) => window.__grades.go(x, z), wps[0]);
      await waitStream();
      const flat = wps.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - wps[i - 1][0], p[1] - wps[i - 1][1]) : 0), 0) / 4.4;
      const limit = Math.min(90, flat * 3 + 15);
      await page.evaluate(({ wps, limit }) => window.__grades.startWalk(wps, limit), { wps, limit });
      await page.evaluate(() => window.__skyrome.game.input.simulate('KeyW', true));
      const t1 = Date.now();
      let res = null;
      while (Date.now() - t1 < (limit + 10) * 1000) {
        await page.waitForTimeout(500);
        res = await page.evaluate(() => window.__grades.walkResult());
        if (res.done) break;
      }
      await page.evaluate(() => window.__skyrome.game.input.simulate('KeyW', false));
      await page.evaluate(() => window.__grades.stopWalk());
      const entry = { ...c, waypoints: wps.length, flatSecs: Math.round(flat), ...res };
      delete entry.trace;
      entry.trace = (res?.trace ?? []).filter((_, i) => i % 4 === 0);
      out.climbs.push(entry);
      log(`climb ${c.id.padEnd(34)} ${res?.reached ? 'up' : 'NOT UP'} in ${res?.secs}s (flat ${Math.round(flat)}s), stalls ${res?.stalls?.length ?? 0}, slid ${res?.slid ?? 0}s, max surface ${res?.maxDeg}°`);
    }
  }

  // -------------------------------------------------------------- 3. screenshots
  if (!args['no-shots']) {
    await page.evaluate(() => window.__grades.camMode(true));
    const targets = [];
    for (const c of out.climbs) {
      const bad = !c.reached || (c.secs && c.flatSecs && c.secs > c.flatSecs * 1.6) || (c.stalls?.length ?? 0) > 0;
      if (!bad) continue;
      const st = c.stalls?.[0];
      targets.push({ name: `climb-${c.id.replace(/[^a-z0-9]+/gi, '-')}`, at: st ? st.at : c.at, dir: c.dirAt ?? null });
    }
    const worstEdges = out.stops.flatMap((s) => (s.worst ?? []).slice(0, 1).map((w) => ({ ...w, stop: s.id }))).filter((w) => w.deg > 30).sort((a, b) => b.deg - a.deg).slice(0, 10);
    for (const w of worstEdges) targets.push({ name: `edge-${w.stop}-${Math.round(w.deg)}deg`, at: w.at, dir: w.dir });
    for (const r of out.routes ?? []) {
      const w = r.worst?.[0];
      if (w && w.deg > 30) targets.push({ name: `route-${r.from}-${r.to}-${Math.round(w.deg)}deg`, at: w.at, dir: w.dir });
    }
    for (const t of targets) {
      if (Date.now() > DEADLINE + 120000) break;
      if (!t.at) continue;
      await page.evaluate(({ at, dir }) => window.__grades.sideView(at, dir), t);
      await waitStream(1800);
      const p = join(shotDir, `${t.name}.png`);
      await page.screenshot({ path: p });
      t.shot = p;
      log(`shot ${p}`);
    }
    out.shots = targets;
    await page.evaluate(() => window.__grades.camMode(false));
  }
} catch (e) {
  if (!e.done) {
    code = 1;
    console.error('FAILED:', e.message);
  }
  try { await page.screenshot({ path: join(shotDir, 'failure.png') }); } catch {}
} finally {
  out.minutes = Math.round((Date.now() - T0) / 6000) / 10;
  mkdirSync(dirname(jsonOut), { recursive: true });
  writeFileSync(jsonOut, JSON.stringify(out, null, 1));
  console.log(`\nwrote ${jsonOut} (${out.stops.length} stops, ${out.climbs.length} climbs) in ${out.minutes} min`);
  if (errors.length) console.log('page errors:\n  ' + errors.slice(0, 10).join('\n  '));
  await browser.close();
  await server.close();
  process.exit(code);
}

async function waitStream(ms = 2200) {
  // The city primes at a teleport; give its colliders a step and the streamer a moment (bounded).
  await page.waitForTimeout(ms);
}

// ------------------------------------------------------------------ in the page
function install() {
  const g = window.__skyrome.game;
  const DOWN = { x: 0, y: -1, z: 0 };
  const WORLD = 1;
  const hm = g.heightmap;
  const r1 = (v) => Math.round(v * 10) / 10;
  const deg = (ny) => (Math.acos(Math.min(1, Math.max(-1, ny))) * 180) / Math.PI;
  const ownerName = (o) => {
    if (!o) return 'terrain?';
    if (o === g.terrain) return 'terrain';
    return o.constructor?.name ?? typeof o;
  };
  const api = {
    /** Story places → points (landmark location, area-<lowland>, road:<id> midpoint, island:<id> centroid). */
    resolve(list) {
      const S = 0.6;
      return list.map(([id, name]) => {
        let x = null, z = null;
        if (id.startsWith('road:')) {
          const pr = g.city?.plan?.roads?.find((r) => r.id === id.slice(5));
          if (pr) {
            const m = pr.points[Math.floor(pr.points.length / 2)];
            [x, z] = m;
          }
        } else if (id.startsWith('island:')) {
          const p = g.population?.nav ? null : null;
          const l = g.locations.get(id.slice(7)) ?? g.locations.get(`area-${id.slice(7)}`);
          if (l?.position) ({ x, z } = l.position);
          else { x = -268 * S; z = 260 * S; }
        } else {
          const l = g.locations.get(id);
          if (l?.position) ({ x, z } = l.position);
        }
        if (x != null) {
          const nav = g.population?.nav;
          const s = nav?.snap ? nav.snap(x, z, 30) : null;
          if (s) ({ x, z } = s);
        }
        return { id, name, x, z };
      });
    },
    /** Teleport to street level at (x, z): the first surface below head height over the terrain (not a roof). */
    go(x, z) {
      const t = hm.heightAt(x, z);
      g.player.teleport({ x, y: t + 0.3, z }, 0);
      g.physics.step(1 / 60);
      const hit = g.physics.raycast({ x, y: t + 2.5, z }, DOWN, 6, WORLD);
      const y = hit && hit.distance > 0.02 ? hit.point.y : t;
      g.player.teleport({ x, y: y + 0.3, z }, 0);
      g.physics.step(1 / 60);
    },
    /** One ray down from head height above the terrain (below roofs and arches). */
    ground(x, z, top) {
      const hit = g.physics.raycast({ x, y: top, z }, DOWN, 8, WORLD);
      return hit ? { y: hit.point.y, ny: hit.normal.y, d: hit.distance, owner: ownerName(hit.owner) } : null;
    },
    /** Sample a segment; returns per-sample { s, x, z, y, ny, inside }. */
    sampleSeg(ax, az, bx, bz, step) {
      const L = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.ceil(L / step));
      const out = [];
      let lastY = null;
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const base = Math.max(hm.heightAt(x, z), lastY ?? -1e9);
        const h = this.ground(x, z, base + 2.2);
        if (!h) {
          out.push({ s: L * t, x, z, y: null, ny: 1, inside: false, owner: null });
          continue;
        }
        const inside = h.d < 0.02;
        out.push({ s: L * t, x, z, y: h.y, ny: h.ny, inside, owner: h.owner });
        if (!inside) lastY = h.y;
      }
      return { L, out };
    },
    /** The minimap's street route between two points (QuestRoute's own StreetRouter). */
    routeLine(ax, az, bx, bz) {
      const R = g.questRoute?.streets?.();
      if (!R) return null;
      const nodes = R.routeBetween(ax, az, bx, bz);
      if (!nodes) return null;
      return [[ax, az], ...nodes.map((k) => [R.x[k], R.z[k]]), [bx, bz]];
    },
    lineLength(line) {
      let L = 0;
      for (let i = 1; i < line.length; i++) L += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
      return L;
    },
    pointAlong(line, s) {
      let acc = 0;
      for (let i = 1; i < line.length; i++) {
        const l = Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
        if (acc + l >= s) {
          const t = (s - acc) / (l || 1);
          return [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t];
        }
        acc += l;
      }
      return line[line.length - 1];
    },
    /** Survey the part of a polyline between s0 and s1 (m along it). */
    surveyLine(line, s0, s1) {
      g.physics.step(1 / 60);
      const res = { over20: 0, over30: 0, over35: 0, over40: 0, grade2mOver30pct: 0, inside: 0, worst: [] };
      let acc = 0;
      for (let i = 1; i < line.length; i++) {
        const [ax, az] = line[i - 1], [bx, bz] = line[i];
        const l = Math.hypot(bx - ax, bz - az);
        const a = Math.max(s0, acc), b = Math.min(s1, acc + l);
        if (b > a && l > 0) {
          const t0 = (a - acc) / l, t1 = (b - acc) / l;
          const { out } = this.sampleSeg(ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1, 0.5);
          for (let k = 0; k < out.length; k++) {
            const p = out[k];
            if (p.inside) res.inside += 0.5;
            if (p.y == null || p.inside) continue;
            const d = p.ny > 0.25 ? deg(p.ny) : 0;
            if (d > 20) res.over20 += 0.5;
            if (d > 30) res.over30 += 0.5;
            if (d > 35) res.over35 += 0.5;
            if (d > 40) res.over40 += 0.5;
            const q = out[k + 4];
            if (q && q.y != null && !q.inside) {
              let step = false;
              for (let m = k; m < k + 4; m++) if (out[m].y != null && out[m + 1].y != null && Math.abs(out[m + 1].y - out[m].y) > 0.3) step = true;
              if (!step && Math.abs(q.y - p.y) / Math.max(0.1, q.s - p.s) > 0.3) res.grade2mOver30pct += 0.5;
            }
            if (d > 25) res.worst.push({ deg: r1(d), at: [r1(p.x), r1(p.y), r1(p.z)], dir: [bx - ax, bz - az], owner: p.owner });
          }
        }
        acc += l;
      }
      res.worst = res.worst.sort((p, q) => q.deg - p.deg).slice(0, 4);
      return res;
    },
    /** Every street-graph edge within R of (x, z): surface slope and grade along it. */
    surveyEdges(x, z, R) {
      g.physics.step(1 / 60);
      const S = g.streets;
      const nodes = S.nodes;
      const edges = S.edges.filter(([a, b]) => Math.hypot(nodes[a].x - x, nodes[a].z - z) < R && Math.hypot(nodes[b].x - x, nodes[b].z - z) < R);
      let metres = 0, o20 = 0, o30 = 0, o35 = 0, o40 = 0, inside = 0, flights = 0;
      const worst = [];
      for (const [a, b] of edges) {
        const A = nodes[a], B = nodes[b];
        const { L, out } = this.sampleSeg(A.x, A.z, B.x, B.z, 0.5);
        if (L < 0.5) continue;
        metres += L;
        let maxD = 0, maxAt = null, maxG = 0, stepRun = 0;
        for (let i = 0; i < out.length; i++) {
          const p = out[i];
          if (p.inside) inside += 0.5;
          if (p.y == null || p.inside) continue;
          // Surface slope under the foot (a wall face hit from above has ny ~ 0: skip it).
          const d = p.ny > 0.25 ? deg(p.ny) : 0;
          if (d > 20) o20 += 0.5;
          if (d > 30) o30 += 0.5;
          if (d > 35) o35 += 0.5;
          if (d > 40) o40 += 0.5;
          if (d > maxD) {
            maxD = d;
            maxAt = [r1(p.x), r1(p.y), r1(p.z)];
          }
          // Grade over 2 m (4 samples), unless a step (> 0.3 m in 0.5 m) is inside the window.
          const j = i + 4;
          if (j < out.length && out[j].y != null && !out[j].inside) {
            let step = false;
            for (let k = i; k < j; k++) if (out[k].y != null && out[k + 1].y != null && Math.abs(out[k + 1].y - out[k].y) > 0.3) step = true;
            if (step) stepRun++;
            else {
              const gr = Math.abs(out[j].y - p.y) / Math.max(0.1, out[j].s - p.s);
              if (gr > maxG) maxG = gr;
            }
          }
        }
        if (stepRun > 2) flights++;
        if (maxAt) worst.push({ edge: [a, b], kinds: [A.kind, B.kind], deg: r1(maxD), grade2m: Math.round(maxG * 100), at: maxAt, dir: [B.x - A.x, B.z - A.z], len: r1(L) });
      }
      worst.sort((p, q) => q.deg - p.deg);
      return { y: r1(hm.heightAt(x, z)), edges: edges.length, metres: Math.round(metres), over20: Math.round(o20), over30: Math.round(o30), over35: Math.round(o35), over40: Math.round(o40), insideMetres: Math.round(inside), flightEdges: flights, worst: worst.slice(0, 6) };
    },
    /** Waypoints for a climb: a road's plan polyline from its low end, or foot → summit for a face. */
    waypoints(c) {
      if (c.kind === 'road') {
        const r = g.city?.plan?.roads?.find((x) => x.id === c.road);
        if (!r) return null;
        let pts = r.points.map((p) => [p[0], p[1]]);
        if (hm.heightAt(pts[0][0], pts[0][1]) > hm.heightAt(pts[pts.length - 1][0], pts[pts.length - 1][1])) pts = pts.reverse();
        // Densify to 2 m, keep 60 m below the steepest stretch to 40 m above it, steer every 12 m.
        const dense = [pts[0]];
        for (let i = 1; i < pts.length; i++) {
          const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
          const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 2);
          for (let k = 1; k <= n; k++) dense.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
        }
        let mi = 0, md = Infinity;
        for (let i = 0; i < dense.length; i++) {
          const d = Math.hypot(dense[i][0] - c.at[0], dense[i][1] - c.at[2]);
          if (d < md) {
            md = d;
            mi = i;
          }
        }
        const cut = dense.slice(Math.max(0, mi - 30), Math.min(dense.length, mi + 21));
        return cut.filter((_, i) => i % 6 === 0 || i === cut.length - 1);
      }
      const [fx, fz] = c.from ?? [c.foot[0], c.foot[2]], [sx, sz] = c.to ?? [c.summit[0], c.summit[2]];
      const L = Math.hypot(sx - fx, sz - fz), n = Math.max(2, Math.ceil(L / 12));
      return Array.from({ length: n + 1 }, (_, k) => [fx + ((sx - fx) * k) / n, fz + ((sz - fz) * k) / n]);
    },
    /** A system that steers the camera yaw (and so the run) through the waypoints while W is held. */
    startWalk(wps, limit) {
      const st = { wps, i: 1, t: 0, limit, trace: [], stalls: [], slid: 0, done: false, reached: false, lastSec: null, maxDeg: 0, dirAt: null, best: Infinity, bestT: 0 };
      api.walk = st;
      const p = g.player;
      st.lastSec = p.position.clone();
      const sys = {
        name: 'gradeWalker',
        priority: -50,
        update(dt) {
          if (st.done) return;
          st.t += dt;
          const pos = p.position;
          let [tx, tz] = st.wps[st.i];
          while (Math.hypot(tx - pos.x, tz - pos.z) < (st.i === st.wps.length - 1 ? 1.5 : 3)) {
            st.i++;
            if (st.i >= st.wps.length) {
              st.done = st.reached = true;
              return;
            }
            [tx, tz] = st.wps[st.i];
          }
          p.yaw = Math.atan2(-(tx - pos.x), -(tz - pos.z));
          p.pitch = -0.15;
          if (Math.floor(st.t * 4) !== Math.floor((st.t - dt) * 4)) {
            const h = g.physics.raycast({ x: pos.x, y: pos.y + 0.5, z: pos.z }, DOWN, 1.5, WORLD);
            const d = h && h.normal.y > 0.25 ? deg(h.normal.y) : 0;
            if (d > st.maxDeg) {
              st.maxDeg = d;
              st.dirAt = [tx - pos.x, tz - pos.z];
            }
            st.trace.push([r1(st.t), r1(pos.x), r1(pos.y), r1(pos.z), r1(d)]);
          }
          if (Math.floor(st.t) !== Math.floor(st.t - dt)) {
            const moved = Math.hypot(pos.x - st.lastSec.x, pos.z - st.lastSec.z);
            if (moved < 0.3) {
              const h = g.physics.raycast({ x: pos.x, y: pos.y + 0.5, z: pos.z }, DOWN, 1.5, WORLD);
              st.stalls.push({ t: Math.round(st.t), at: [r1(pos.x), r1(pos.y), r1(pos.z)], deg: h ? r1(deg(h.normal.y)) : null });
            }
            if (pos.y < st.lastSec.y - 0.3) st.slid++;
            st.lastSec.copy(pos);
            const n = st.stalls.length;
            if (n >= 5 && st.stalls[n - 1].t - st.stalls[n - 5].t === 4) st.done = true;
            // No nearer along the waypoints for 8 s (sliding back and forth on a slope it can't climb): give up.
            const score = Math.hypot(tx - pos.x, tz - pos.z) - st.i * 1e5;
            if (score < st.best - 0.5) {
              st.best = score;
              st.bestT = st.t;
            } else if (st.t - st.bestT > 8) {
              st.stalls.push({ t: Math.round(st.t), at: [r1(pos.x), r1(pos.y), r1(pos.z)], deg: null, noProgress: true });
              st.done = true;
            }
          }
          if (st.t > st.limit) st.done = true;
        },
      };
      api.walkSys = g.addSystem(sys) ?? sys;
    },
    walkResult() {
      const st = api.walk;
      if (!st) return { done: true };
      return { done: st.done, reached: st.reached, secs: Math.round(st.t), stalls: st.stalls.slice(0, 6), slid: st.slid, maxDeg: r1(st.maxDeg), dirAt: st.dirAt, trace: st.trace, progress: `${st.i}/${st.wps.length}`, end: st.trace[st.trace.length - 1] ?? null };
    },
    stopWalk() {
      if (api.walkSys) g.removeSystem(api.walkSys);
      api.walkSys = null;
    },
    /** Hide the HUD and pin the camera for side views. */
    camMode(on) {
      const ui = document.querySelector('.ui-root');
      if (ui) ui.style.visibility = on ? 'hidden' : '';
      if (on && !api.camSys) {
        api.pin = null;
        // After the camera rig (100) and before the terrain picks its patches for this frame's camera (101).
        api.camSys = { name: 'gradeCam', priority: 100.5, lateUpdate() { const c = api.pin; if (c) { g.camera.position.set(c[0], c[1], c[2]); g.camera.lookAt(c[3], c[4], c[5]); } } };
        g.addSystem(api.camSys);
      }
      if (!on && api.camSys) {
        g.removeSystem(api.camSys);
        api.camSys = null;
      }
    },
    /**
     * Pin the camera at (x, z): 'side' looks across the slope (perpendicular to the way up) from the
     * more open side, 'up' looks up it from 16 m downhill at head height + 2 m. The player stands at the spot.
     */
    viewAt(x, z, view) {
      const n = hm.normalAt(x, z);
      let ux = -n.x, uz = -n.z; // uphill
      const L = Math.hypot(ux, uz);
      if (L < 1e-4) {
        ux = 1;
        uz = 0;
      } else {
        ux /= L;
        uz /= L;
      }
      this.go(x, z);
      const y = g.player.position.y;
      g.physics.step(1 / 60);
      const under = g.physics.raycast({ x, y: y + 1, z }, DOWN, 3, WORLD);
      const info = { y: r1(y), deg: under ? r1(deg(under.normal.y)) : null, terrainDeg: r1((Math.acos(n.y) * 180) / Math.PI), uphill: [r1(ux), r1(uz)] };
      if (view === 'side') {
        this.sideView([x, y, z], [ux, uz]);
        if (g.player.avatar) g.player.avatar.root.visible = true;
        g.player.teleport({ x, y: y + 0.2, z }, 0);
      } else {
        // From downhill, as far back as is clear (up to 16 m), 3.6 m over the ground there.
        const back = g.physics.raycast({ x, y: y + 2.2, z }, { x: -ux, y: 0, z: -uz }, 16, WORLD);
        const D = Math.max(4, (back ? back.distance : 16) - 0.6);
        const cx = x - ux * D, cz = z - uz * D;
        const cy = Math.max(hm.heightAt(cx, cz), y - D * 0.5) + 3.2;
        api.pin = [cx, cy, cz, x + ux * 6, y + 1.5, z + uz * 6];
      }
      return info;
    },
    /** Look across a slope from the side (perpendicular to `dir`, the way up) from 14 m away and 3 m up. */
    sideView(at, dir) {
      const [x, y, z] = at;
      let dx = dir ? dir[0] : 1, dz = dir ? dir[1] : 0;
      const L = Math.hypot(dx, dz) || 1;
      dx /= L;
      dz /= L;
      // Perpendicular: the side that is more open (probe two sides, keep the one with the longer clear ray).
      const sides = [[-dz, dx], [dz, -dx]];
      let best = sides[0], bestD = -1;
      for (const [sx, sz] of sides) {
        const hit = g.physics.raycast({ x, y: y + 2.5, z }, { x: sx, y: 0, z: sz }, 16, WORLD);
        const d = hit ? hit.distance : 16;
        if (d > bestD) {
          bestD = d;
          best = [sx, sz];
        }
      }
      const D = Math.max(6, Math.min(14, bestD - 0.5));
      const cx = x + best[0] * D, cz = z + best[1] * D;
      g.player.teleport({ x: cx, y: Math.max(hm.heightAt(cx, cz), y) + 0.3, z: cz }, 0);
      if (g.player.avatar) g.player.avatar.root.visible = false;
      api.pin = [cx, y + 3, cz, x, y + 0.5, z];
    },
  };
  window.__grades = api;
  return true;
}

// ------------------------------------------------------------------ helpers
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[a.slice(2)] = true;
    else {
      out[a.slice(2)] = next;
      i++;
    }
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
