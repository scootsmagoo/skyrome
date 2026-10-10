#!/usr/bin/env node
/**
 * Collision-against-visuals audit: where the player walks, does Rapier stop them where three.js
 * draws? Boots the game with `?audit` (src/dev/audit/collisionAudit.ts keeps the drawn triangles'
 * CPU copies and installs `window.__collision`), teleports the player to every stop (the story's
 * places, every landmark, then the street graph clustered to cover the detail area), lets the city
 * build its colliders there, and at each stop:
 *
 *   columns  vertical probes every 1.25 m: the collider the player stands on against the drawn
 *            ground → float (invisible ledge, collider taller than drawn), sink (drawn kerb,
 *            plinth or counter with no collider, collider lower than drawn), ramp-steps (a smooth
 *            ramp collider under drawn treads), fallthrough (nothing to stand on under a drawn floor)
 *   stands   the player's capsule on that ground: colliders intruding at body (embedded) or head
 *            (headroom) height
 *   walls    horizontal rays along every street edge at knee and chest height, across and along the
 *            street: invisible (a collider in front of what is drawn) and ghost (drawn, passable)
 *   terrain  on bare ground, the heightfield against the drawn triangulation (which diagonal?)
 *
 * Then it confirms the worst cases with the real player controller (W held: how far from the drawn
 * wall the body stops; how far the feet stand from the drawn ground) and screenshots them.
 *
 *   node scripts/audit/collision.mjs [--max 900] [--minutes 45] [--radius 26] [--spacing 1.0]
 *        [--cluster 45] [--only porta-capena,forum-romanum] [--walks 24] [--shots 6] [--no-walls]
 *        [--list] [--out scripts/audit/out]
 *
 * Output: <out>/collision.json (findings, bounded), <out>/collision-summary.md, and
 * .shots/audit/collision-*.png. Exit code 0 (it is a survey); 1 on a boot failure.
 */
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = parseArgs(process.argv.slice(2));
const outDir = resolve(root, args.out ?? 'scripts/audit/out');
const shotDir = resolve(root, '.shots/audit');
mkdirSync(outDir, { recursive: true });
mkdirSync(shotDir, { recursive: true });
const maxStops = Number(args.max ?? 900);
const minutes = Number(args.minutes ?? 45);
const radius = Number(args.radius ?? 26);
const spacing = Number(args.spacing ?? 1.0);
const cluster = Number(args.cluster ?? 45);
const walks = Number(args.walks ?? 24);
const shotsPer = Number(args.shots ?? 6);
const only = args.only ? String(args.only).split(',') : null;
const started = Date.now();
const deadline = started + minutes * 60_000;

/** The story's places first (docs/STORY.md, docs/design/solid-ground.md). */
const STORY = ['porta-capena', 'vallis-murcia', 'circus-maximus', 'forum-romanum', 'rostra', 'miliarium-aureum', 'velabrum', 'vicus-tuscus', 'subura', 'argiletum', 'ludus-magnus', 'colosseum', 'colosseum-valley', 'meta-sudans', 'trajan-forum', 'forum-trajan', 'basilica-ulpia', 'forum-boarium', 'emporium', 'insula-tiberina', 'pons-aemilius', 'campus-martius', 'castra-peregrina'];

const { createServer } = await import('vite');
const port = await freePort();
const server = await createServer({ root, logLevel: 'error', server: { port, strictPort: true, host: '127.0.0.1', hmr: false } });
await server.listen();
const url = `http://127.0.0.1:${port}/?scene=rome&quick=1&hour=11&audit=1&tgm=1`;

const pw = await import('playwright');
const browser = await pw.chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));

let code = 0;
try {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__skyrome?.ready || window.__skyrome?.error, null, { timeout: 150000, polling: 200 });
  const bootErr = await page.evaluate(() => window.__skyrome?.error);
  if (bootErr) throw new Error('boot: ' + bootErr);
  await page.waitForFunction(() => !!window.__collision, null, { timeout: 20000, polling: 200 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    try { window.__skyrome.game.console?.exec?.('tgm on'); } catch { /* optional */ }
  });

  // ---- stops
  const stops = await page.evaluate(({ story, cluster, only }) => {
    const g = window.__skyrome.game;
    const out = [];
    const seen = [];
    const push = (id, x, z, why) => {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      if (seen.some((p) => Math.hypot(p.x - x, p.z - z) < 30)) return;
      seen.push({ x, z });
      out.push({ id, x: +x.toFixed(1), z: +z.toFixed(1), why });
    };
    const near = (x, z) => {
      const st = g.streets;
      if (!st) return { x, z };
      const i = st.nearest(x, z, 40);
      return i >= 0 ? { x: st.nodes[i].x, z: st.nodes[i].z } : { x, z };
    };
    const posOf = (l) => {
      if (l.position && Number.isFinite(l.position.x)) return l.position;
      if (l.area?.length) return { x: l.area.reduce((s, p) => s + p[0], 0) / l.area.length, z: l.area.reduce((s, p) => s + p[1], 0) / l.area.length };
      return null;
    };
    for (const id of story) {
      const l = g.locations.get(id);
      const lp = l && posOf(l);
      if (!lp) continue;
      const p = near(lp.x, lp.z);
      push(id, p.x, p.z, 'story');
    }
    for (const l of g.locations.all()) {
      const lp = posOf(l);
      if (!lp) continue;
      // Hills, roads, walls and aqueducts are lines and areas; the landmarks are the places.
      if (!l.mapMarker && !/forum|temple|basilica|circus|theat|baths|market|porticus|ludus|colosseum|column|arch|gate|porta|pons|insula|castra|horrea|curia|rostra|regia|atrium|house|domus|tabular|carcer|lacus|meta/.test(l.id)) continue;
      const p = near(lp.x, lp.z);
      push(l.id, p.x, p.z, 'landmark');
    }
    // The streets: cluster the graph's nodes so every detailed street is within a probe radius of a stop.
    const st = g.streets;
    if (st) {
      const inDetail = (x, z) => (g.city?.classAt ? g.city.classAt(x, z) !== 12 : true);
      const nodes = st.nodes.filter((n) => inDetail(n.x, n.z));
      // Deterministic order (by x then z) so runs are comparable.
      nodes.sort((a, b) => a.x - b.x || a.z - b.z);
      const centres = [];
      for (const n of nodes) {
        if (centres.some((c) => Math.hypot(c.x - n.x, c.z - n.z) < cluster)) continue;
        centres.push(n);
      }
      for (const c of centres) push(`street:${c.id}`, c.x, c.z, 'street');
    }
    return only ? out.filter((s) => only.some((o) => s.id.startsWith(o))) : out;
  }, { story: STORY, cluster, only });
  console.log(`${stops.length} stops (${stops.filter((s) => s.why === 'story').length} story, ${stops.filter((s) => s.why === 'landmark').length} landmarks, ${stops.filter((s) => s.why === 'street').length} street clusters); probing ${Math.min(stops.length, maxStops)} within ${minutes} min`);
  if (args.list) {
    for (const s of stops) console.log(`  ${s.why.padEnd(8)} ${s.id.padEnd(32)} ${s.x}, ${s.z}`);
    throw new Error('listed');
  }

  // ---- sweep
  const all = { columns: [], stands: [], walls: [] };
  const terrain = { samples: 0, sumAbs: 0, maxAbs: 0, drawnMatches: 0, otherMatches: 0, neither: 0, worst: null };
  const counts = { probes: 0, walkable: 0, indoor: 0, edges: 0, rays: 0, stops: 0, triangles: 0, released: 0, ms: 0 };
  const perStop = [];
  for (const s of stops.slice(0, maxStops)) {
    if (Date.now() > deadline) {
      console.log(`time is up after ${counts.stops} stops`);
      break;
    }
    const r = await page.evaluate(async ({ x, z, radius, spacing, noWalls }) => {
      const g = window.__skyrome.game;
      const y = g.heightmap.heightAt(x, z);
      g.player.teleport({ x, y: y + 0.5, z }, 0);
      // The teleport primes the city; give the batches and the physics two frames to settle.
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      await new Promise((res) => setTimeout(res, 350));
      return window.__collision.sweep(x, z, { radius, spacing, noWalls });
    }, { x: s.x, z: s.z, radius, spacing, noWalls: !!args['no-walls'] });
    counts.stops++;
    for (const k of ['columns', 'stands', 'walls']) for (const f of r[k]) all[k].push({ ...f, stop: s.id });
    for (const k of ['probes', 'walkable', 'indoor', 'edges', 'rays']) counts[k] += r.counts[k];
    counts.triangles += r.index.triangles;
    counts.released += r.index.released;
    counts.ms += r.ms;
    terrain.samples += r.terrain.samples;
    terrain.sumAbs += r.terrain.meanAbs * r.terrain.samples;
    terrain.drawnMatches += r.terrain.drawnMatches;
    terrain.otherMatches += r.terrain.otherMatches;
    terrain.neither += r.terrain.neither;
    if (r.terrain.maxAbs > terrain.maxAbs) {
      terrain.maxAbs = r.terrain.maxAbs;
      terrain.worst = [...(r.terrain.worst ?? []), s.id];
    }
    perStop.push({ id: s.id, x: s.x, z: s.z, columns: r.columns.length, stands: r.stands.length, walls: r.walls.length, ms: r.ms, triangles: r.index.triangles, released: r.index.released });
    if (counts.stops % 10 === 0) console.log(`  ${counts.stops}/${Math.min(stops.length, maxStops)} stops  ${all.columns.length} columns, ${all.stands.length} stands, ${all.walls.length} walls  (${Math.round((Date.now() - started) / 1000)} s, last ${r.ms} ms, ${r.index.triangles} tris)`);
  }

  // ---- merge duplicates (stops overlap): same kind and cause within 1 m
  const uniq = (list, keyOf) => {
    const m = new Map();
    for (const f of list) {
      const k = `${keyOf(f)}|${Math.round(f.x)},${Math.round(f.z)}`;
      const e = m.get(k);
      if (!e || Math.abs(f.delta ?? f.gap ?? 0) > Math.abs(e.delta ?? e.gap ?? 0)) m.set(k, f);
    }
    return [...m.values()];
  };
  const columns = uniq(all.columns, (f) => `${f.kind}|${f.phys}|${f.vis}`);
  const stands = uniq(all.stands, (f) => `${f.kind}|${f.phys}`);
  const walls = uniq(all.walls, (f) => `${f.kind}|${f.phys}|${f.vis}`);

  // ---- report by cause
  const cause = (s) => String(s).replace(/:[0-9a-f-]{6,}|\b\d+(\.\d+)?\b/g, '#');
  const lines = [];
  const say = (s) => { lines.push(s); console.log(s); };
  say(`\n# Collision against visuals: ${counts.stops} stops, ${counts.probes} columns (${counts.walkable} standable, ${counts.indoor} inside solids), ${counts.edges} street edges, ${counts.rays} rays, ${counts.triangles} drawn triangles indexed (${counts.released} released pieces skipped), ${Math.round(counts.ms / 1000)} s probing`);
  const byCause = (list, keyOf, sizeOf) => {
    const by = new Map();
    for (const f of list) {
      const c = keyOf(f);
      const e = by.get(c) ?? { n: 0, max: 0, ex: f };
      e.n++;
      const sz = Math.abs(sizeOf(f));
      if (sz > e.max) { e.max = sz; e.ex = f; }
      by.set(c, e);
    }
    return [...by.entries()].sort((a, b) => b[1].n - a[1].n);
  };
  for (const kind of ['fallthrough', 'float', 'sink', 'ramp-steps']) {
    const list = columns.filter((f) => f.kind === kind);
    say(`\n## ${kind}: ${list.length} places`);
    for (const [c, e] of byCause(list, (f) => `${cause(f.phys)} vs ${cause(f.vis)}`, (f) => f.delta).slice(0, 20)) say(`  ×${String(e.n).padEnd(4)} ${c}   max ${e.max.toFixed(2)} m  e.g. @${e.ex.x},${e.ex.y},${e.ex.z} (${e.ex.stop})`);
  }
  for (const kind of ['embedded', 'headroom']) {
    const list = stands.filter((f) => f.kind === kind);
    say(`\n## ${kind}: ${list.length} standing spots`);
    for (const [c, e] of byCause(list, (f) => cause(f.phys), () => 1).slice(0, 15)) say(`  ×${String(e.n).padEnd(4)} ${c}   e.g. @${e.ex.x},${e.ex.y},${e.ex.z} (${e.ex.stop})`);
  }
  for (const kind of ['invisible', 'ghost']) {
    const list = walls.filter((f) => f.kind === kind);
    say(`\n## ${kind} walls: ${list.length} rays`);
    for (const [c, e] of byCause(list, (f) => `${cause(f.phys)} vs ${cause(f.vis)}`, (f) => f.gap).slice(0, 20)) say(`  ×${String(e.n).padEnd(4)} ${c}   max gap ${e.max.toFixed(2)} m  e.g. @${e.ex.x},${e.ex.y},${e.ex.z} h${e.ex.h} (${e.ex.stop})`);
  }
  say(`\n## terrain: ${terrain.samples} bare-ground probes, |physics − drawn| mean ${(terrain.sumAbs / Math.max(1, terrain.samples)).toFixed(4)} m, max ${terrain.maxAbs.toFixed(3)} m at ${JSON.stringify(terrain.worst)}; twisted cells: physics matches the drawn diagonal ${terrain.drawnMatches}×, the other diagonal ${terrain.otherMatches}×, neither ${terrain.neither}×`);

  // ---- confirm the worst with the real player, and screenshot
  await page.evaluate(() => {
    const g = window.__skyrome.game;
    document.querySelectorAll('.ui-root').forEach((e) => (e.style.visibility = 'hidden'));
    window.__pin = null;
    g.addSystem({ name: 'auditCam', priority: 150, lateUpdate() { const c = window.__pin; if (c) { g.camera.position.set(c[0], c[1], c[2]); g.camera.lookAt(c[3], c[4], c[5]); } } });
  });
  const shots = [];
  const confirmed = [];
  let shotN = 0;
  const shoot = async (name, cam) => {
    await page.evaluate((c) => { window.__pin = c; }, cam);
    await page.waitForTimeout(700);
    const p = join(shotDir, name);
    await page.screenshot({ path: p });
    await page.evaluate(() => { window.__pin = null; });
    shots.push(p);
    return p;
  };
  // Invisible walls: the biggest gaps at chest height first, one per cause and place.
  const wallPicks = walls.filter((f) => f.kind === 'invisible' && f.physDist !== null && f.physDist > 0.4).sort((a, b) => b.gap - a.gap);
  const picked = [];
  for (const f of wallPicks) {
    if (picked.length >= walks) break;
    if (picked.some((p) => Math.hypot(p.x - f.x, p.z - f.z) < 6)) continue;
    picked.push(f);
  }
  for (const f of picked) {
    if (Date.now() > deadline + 10 * 60_000) break;
    const r = await page.evaluate(async ({ f }) => {
      const g = window.__skyrome.game;
      g.player.teleport({ x: f.x, y: g.heightmap.heightAt(f.x, f.z) + 0.5, z: f.z }, 0);
      await new Promise((res) => setTimeout(res, 400));
      return window.__collision.walkInto(f.x, f.z, f.dx, f.dz, f.reach, f.visDist);
    }, { f });
    const rec = { ...f, walk: r };
    confirmed.push(rec);
    const realGap = r.standoff;
    console.log(`walk → invisible wall @${f.x},${f.z} dir ${f.dx},${f.dz}: body stopped after ${r.progress} m, ${realGap === null ? 'no drawn wall' : realGap + ' m short of the drawn wall'}, against ${r.against} (${f.phys} vs ${f.vis})`);
    if (shotN < shotsPer * 2 && (realGap === null || realGap > 0.2)) {
      // Over the player's shoulder, looking along the push at the wall.
      const [px, py, pz] = r.at;
      await shoot(`collision-invisible-${++shotN}.png`, [px - f.dx * 2.2 - f.dz * 1.0, py + 1.9, pz - f.dz * 2.2 + f.dx * 1.0, px + f.dx * 1.5, py + 0.9, pz + f.dz * 1.5]);
    }
  }
  // Floats and sinks: the biggest, one per place, walked over so the feet can be seen.
  const colPicks = columns.filter((f) => (f.kind === 'float' || f.kind === 'sink' || f.kind === 'fallthrough') && Math.abs(f.delta) >= 0.08).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const picked2 = [];
  for (const f of colPicks) {
    if (picked2.length >= walks) break;
    if (picked2.some((p) => Math.hypot(p.x - f.x, p.z - f.z) < 5)) continue;
    picked2.push(f);
  }
  let colShots = 0;
  for (const f of picked2) {
    if (Date.now() > deadline + 15 * 60_000) break;
    const r = await page.evaluate(async ({ f }) => {
      const g = window.__skyrome.game;
      g.player.teleport({ x: f.x, y: g.heightmap.heightAt(f.x, f.z) + 0.5, z: f.z }, 0);
      await new Promise((res) => setTimeout(res, 400));
      const dir = window.__collision.openApproach(f.x, f.z, f.physY, 2.5);
      if (!dir) return { approach: null };
      const w = await window.__collision.walkOver(f.x, f.z, dir[0], dir[1], 2.5, f.visY);
      return { approach: dir, ...w };
    }, { f });
    const rec = { ...f, walk: r };
    confirmed.push(rec);
    console.log(`walk → ${f.kind} @${f.x},${f.z} (Δ ${f.delta} m, ${f.phys} vs ${f.vis}): ${r.approach ? (r.reached ? `feet ${r.feetAboveDrawn} m ${r.feetAboveDrawn > 0 ? 'above' : 'below'} the drawn ground` : `never got within ${r.nearest} m`) : 'no open approach'}`);
    if (colShots < shotsPer && r.approach && r.reached) {
      const [px, py, pz] = r.at;
      const [dx, dz] = r.approach;
      // Low and aside, at the feet.
      await shoot(`collision-${f.kind}-${++colShots}.png`, [px - dz * 2.6 + dx * 0.4, py + 1.0, pz + dx * 2.6 + dz * 0.4, px, py + 0.3, pz]);
    }
  }
  // Embedded standing spots: a few, from above.
  let standShots = 0;
  for (const f of stands.filter((s) => s.kind === 'embedded').slice(0, shotsPer)) {
    await page.evaluate(({ f }) => {
      const g = window.__skyrome.game;
      g.player.teleport({ x: f.x + 1.5, y: g.heightmap.heightAt(f.x + 1.5, f.z + 1.5) + 0.5, z: f.z + 1.5 }, 0);
    }, { f });
    await page.waitForTimeout(500);
    await shoot(`collision-embedded-${++standShots}.png`, [f.x + 2.5, f.y + 2.4, f.z + 2.5, f.x, f.y + 0.5, f.z]);
  }

  // ---- write
  const trim = (list, n) => list.slice(0, n);
  const out = {
    date: new Date().toISOString(),
    args: { maxStops, minutes, radius, spacing, cluster, only },
    counts,
    terrain: { ...terrain, meanAbs: terrain.samples ? +(terrain.sumAbs / terrain.samples).toFixed(4) : 0 },
    stops: perStop,
    confirmed,
    columns: trim(columns.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)), 4000),
    stands: trim(stands, 2000),
    walls: trim(walls.sort((a, b) => b.gap - a.gap), 4000),
    shots,
    errors: errors.slice(0, 20),
  };
  writeFileSync(join(outDir, 'collision.json'), JSON.stringify(out));
  writeFileSync(join(outDir, 'collision-summary.md'), lines.join('\n') + '\n\n## confirmed by walking\n' + confirmed.map((c) => `- ${c.kind} @${c.x},${c.y},${c.z} (${c.stop}) ${c.phys} vs ${c.vis}: ${JSON.stringify(c.walk)}`).join('\n') + '\n\n## screenshots\n' + shots.map((s) => `- ${s}`).join('\n') + '\n');
  console.log(`\nwrote ${join(outDir, 'collision.json')} and collision-summary.md; ${shots.length} screenshots in ${shotDir}; ${Math.round((Date.now() - started) / 60000)} min`);
} catch (e) {
  code = 1;
  console.error('FAILED:', e.stack ?? e.message);
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
