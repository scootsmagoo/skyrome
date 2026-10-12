#!/usr/bin/env node
/**
 * Collision-against-visuals audit: where the player walks, does Rapier stop them where three.js
 * draws? Boots the game with `?audit` (src/dev/audit/collisionAudit.ts keeps the drawn triangles'
 * CPU copies and installs `window.__collision`), teleports the player to every stop, lets the city
 * build its colliders there, and at each stop (src/dev/audit/collisionAudit.ts `sweep`):
 *
 *   columns  vertical probes every 1 m out to --radius: the collider the player stands on against
 *            the drawn ground (overhead slabs such as gallery floors and lintels left out) →
 *            float (feet hover, < 0.32 m), ledge (an invisible block or shelf, > 0.32 m),
 *            sink (feet sink into a drawn kerb, step, paving; < 0.32 m), ghost (a drawn solid the
 *            body passes through, > 0.32 m), low-overhead (a drawn slab at head height: the head
 *            clips it), ramp-steps, fallthrough (re-checked with a capsule: a drop over 1.5 m)
 *   stands   the player's capsule on that ground: colliders intruding at body (embedded) or head
 *            (headroom) height with nothing drawn there
 *   walls    horizontal rays along every street edge at knee and chest height, across and along the
 *            street: invisible (a collider in front of what is drawn) and ghost (drawn, passable)
 *   seams    lines along and across every street, sampled every 0.1 m at the level a walker
 *            follows: lip (a collider step where the picture is smooth), crack (a gap between
 *            collider pieces), drawn-step (a drawn riser over a smooth collider)
 *   terrain  on bare ground, the heightfield against the drawn triangulation (which diagonal?)
 *
 * Stops: the story's places (docs/STORY.md), every landmark in the core and the Campus Martius,
 * then a 40 m grid over the detail area of the core and the golden-path corridors wherever a street
 * runs (coarse cells first, so a run cut short by --minutes is still spread evenly).
 *
 * The probes of one defect are grouped (same kind, same collider or drawn piece, within 2.5 m), each
 * defect gets the nearest named place, a severity and a score (what a player would notice), and the
 * worst are confirmed in the game: the player is stood on the collider (or walked into or over it)
 * and screenshotted with the HUD hidden.
 *
 *   node scripts/audit/collision.mjs [--minutes 45] [--max 2000] [--radius 28.5] [--spacing 1.0]
 *        [--grid 40] [--only porta-capena,colosseum] [--confirm 24] [--shots 14] [--regions]
 *        [--no-walls] [--no-seams] [--list] [--out scripts/audit/out]
 *   node scripts/audit/collision.mjs --from scripts/audit/out/collision.json [--confirm 28 --shots 28]
 *        (no sweep: confirm and screenshot the worst defects of an earlier run again, rewriting
 *        its JSON and the summary's last section; about 8 minutes)
 *
 * Output: <out>/collision.json (defects, bounded under 2 MB), <out>/collision-summary.md, and
 * .shots/audit/collision-*.png. Exit code 0 (it is a survey); 1 on a boot failure.
 * About 3–4 s a stop on a busy M-series Mac (the teleport's city build and a few frames dominate).
 */
import { createServer as createNetServer } from 'node:net';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STORY } from './story.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = parseArgs(process.argv.slice(2));
const outDir = resolve(root, args.out ?? 'scripts/audit/out');
const shotDir = resolve(root, '.shots/audit');
mkdirSync(outDir, { recursive: true });
mkdirSync(shotDir, { recursive: true });
const maxStops = Number(args.max ?? 2000);
const minutes = Number(args.minutes ?? 45);
const radius = Number(args.radius ?? 28.5);
const spacing = Number(args.spacing ?? 1.0);
const grid = Number(args.grid ?? 40);
const nConfirm = Number(args.confirm ?? 24);
const nShots = Number(args.shots ?? 14);
const only = args.only ? String(args.only).split(',') : null;
const started = Date.now();
const deadline = started + minutes * 60_000;

/** The detail area of the core and the golden-path corridors (game m, from plan.detailRects). */
const CORE_RECTS = [[-522, -378, 666, 678], [172, 441, 552, 843], [-243, 104, 439, 708], [-216, 258, 409, 720]];
/** The Campus Martius's landmarks stand outside the core's detail area: their own rectangle. */
const CAMPUS = [-620, -960, -200, -378];
/** Transtiberim and the Vatican plain (detail, but off the story): only with --regions. */
const REGIONS = [[-1146, -180, -150, 906], [-1740, -1122, -738, 0]];

const { createServer } = await import('vite');
const port = await freePort();
const server = await createServer({ root, logLevel: 'error', server: { port, strictPort: true, host: '127.0.0.1', hmr: false } });
await server.listen();
const url = `http://127.0.0.1:${port}/?scene=rome&quick=1&hour=11&audit=1&tgm=1`;

const pw = await import('playwright');
const browser = await pw.chromium.launch({ headless: true, args: [...(process.platform === 'darwin' ? ['--use-angle=metal'] : ['--use-angle=vulkan', '--enable-features=Vulkan']), '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 620 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));

let code = 0;
try {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__skyrome?.ready || window.__skyrome?.error, null, { timeout: 240000, polling: 300 });
  const bootErr = await page.evaluate(() => window.__skyrome?.error);
  if (bootErr) throw new Error('boot: ' + bootErr);
  await page.waitForFunction(() => !!window.__collision, null, { timeout: 30000, polling: 200 });
  await page.evaluate(() => window.__collision.frames(30, 5000));

  // ---- places (for naming) and stops
  const places = await page.evaluate(() => {
    const g = window.__skyrome.game;
    const out = [];
    for (const l of g.locations.all()) {
      let p = l.position && Number.isFinite(l.position.x) ? l.position : null;
      if (!p && l.area?.length) p = { x: l.area.reduce((s, q) => s + q[0], 0) / l.area.length, z: l.area.reduce((s, q) => s + q[1], 0) / l.area.length };
      if (!p) continue;
      out.push({ id: l.id, name: l.name ?? l.id, x: +p.x.toFixed(1), z: +p.z.toFixed(1), r: l.radius ?? 0, marker: !!l.mapMarker });
    }
    return out;
  });
  const kinds = ['fallthrough', 'ledge', 'ghost', 'invisible', 'embedded', 'float', 'sink', 'lip', 'crack', 'ghost-wall', 'low-overhead', 'ramp-steps', 'drawn-step', 'headroom'];
  const lines = [];
  const say = (s) => { lines.push(s); console.log(s); };
  let defects, counts, terrain, perStop, sweepMin, todo, stops, defectsTotal, byKind, gateNumbers;
  const fromFile = args.from ? resolve(root, String(args.from)) : null;
  if (fromFile) {
    // Confirm again from an earlier sweep (its defects, counts and summary), without sweeping.
    const j = JSON.parse(readFileSync(fromFile, 'utf8'));
    defects = j.defects.map((d) => ({ ...d, confirm: undefined, screenshot: undefined }));
    ({ counts, terrain, defectsTotal, byKind } = j);
    gateNumbers = j.gate;
    perStop = j.stops;
    sweepMin = j.sweepMinutes;
    todo = stops = j.stops;
    const md = join(dirname(fromFile), 'collision-summary.md');
    if (existsSync(md)) {
      const old = readFileSync(md, 'utf8');
      const cut = old.indexOf('\n## The worst defects');
      for (const l of (cut >= 0 ? old.slice(0, cut) : old).split('\n')) lines.push(l);
    }
    console.log(`confirming again from ${fromFile}: ${defects.length} defects`);
  } else {
    const placeById = new Map(places.map((p) => [p.id, p]));
    stops = await page.evaluate(({ story, places, coreRects, campus, regions, grid, withRegions }) => {
      const g = window.__skyrome.game;
      const st = g.streets;
      const out = [];
      const inRect = (r, x, z) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3];
      const inCore = (x, z) => coreRects.some((r) => inRect(r, x, z)) || inRect(campus, x, z);
      const near = (x, z) => {
        const i = st ? st.nearest(x, z, 30) : -1;
        return i >= 0 ? { x: st.nodes[i].x, z: st.nodes[i].z } : { x, z };
      };
      const taken = (x, z, d) => out.some((s) => Math.hypot(s.x - x, s.z - z) < d);
      const push = (id, x, z, why, d) => {
        if (!Number.isFinite(x) || !Number.isFinite(z) || taken(x, z, d)) return;
        out.push({ id, x: +x.toFixed(1), z: +z.toFixed(1), why });
      };
      const byId = new Map(places.map((p) => [p.id, p]));
      for (const id of story) {
        const p = byId.get(id);
        if (p) push(id, p.x, p.z, 'story', 18);
      }
      for (const p of places) {
        if (!p.marker || !inCore(p.x, p.z)) continue;
        const q = near(p.x, p.z);
        push(p.id, Math.hypot(q.x - p.x, q.z - p.z) < 25 ? q.x : p.x, Math.hypot(q.x - p.x, q.z - p.z) < 25 ? q.z : p.z, 'landmark', 24);
      }
      // The grid: cells with a street node near them, coarse cells first.
      const cellHas = new Set();
      for (const n of st?.nodes ?? []) cellHas.add(`${Math.round(n.x / 20)},${Math.round(n.z / 20)}`);
      const streetNear = (x, z) => {
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (cellHas.has(`${Math.round(x / 20) + dx},${Math.round(z / 20) + dz}`)) return true;
        return false;
      };
      const rects = withRegions ? [...coreRects, ...regions] : coreRects;
      const cells = [];
      const seen = new Set();
      for (const r of rects) {
        for (let i = Math.floor(r[0] / grid); i * grid <= r[2]; i++) {
          for (let j = Math.floor(r[1] / grid); j * grid <= r[3]; j++) {
            const x = i * grid, z = j * grid;
            if (!inRect(r, x, z) || seen.has(`${i},${j}`)) continue;
            seen.add(`${i},${j}`);
            const cls = g.city?.classAt ? g.city.classAt(x, z) : 0;
            if (cls === 12 || !streetNear(x, z)) continue;
            const order = (i % 2 === 0 && j % 2 === 0 ? 0 : i % 2 === 1 && j % 2 === 1 ? 1 : 2) + (regions.some((q) => inRect(q, x, z)) && !coreRects.some((q) => inRect(q, x, z)) ? 3 : 0);
            cells.push({ i, j, x, z, order });
          }
        }
      }
      cells.sort((a, b) => a.order - b.order || a.i - b.i || a.j - b.j);
      for (const c of cells) push(`grid:${c.x},${c.z}`, c.x, c.z, 'grid', 20);
      return out;
    }, { story: STORY, places, coreRects: CORE_RECTS, campus: CAMPUS, regions: REGIONS, grid, withRegions: !!args.regions });
    todo = (only ? stops.filter((s) => only.some((o) => s.id.startsWith(o))) : stops).slice(0, maxStops);
    console.log(`${stops.length} stops (${stops.filter((s) => s.why === 'story').length} story, ${stops.filter((s) => s.why === 'landmark').length} landmarks, ${stops.filter((s) => s.why === 'grid').length} grid cells); probing ${todo.length} within ${minutes} min, radius ${radius} m`);
    if (args.list) {
      for (const s of todo) console.log(`  ${s.why.padEnd(8)} ${s.id.padEnd(32)} ${s.x}, ${s.z}`);
      throw new Error('listed');
    }

    // ---- sweep
    const raw = { columns: [], stands: [], walls: [], seams: [] };
    const colliders = {};
    terrain = { over4: 0, samples: 0, sumAbs: 0, maxAbs: 0, drawnMatches: 0, otherMatches: 0, neither: 0, worst: null };
    counts = { stops: 0, probes: 0, walkable: 0, indoor: 0, edges: 0, rays: 0, pinholes: 0, seamSamples: 0, triangles: 0, released: 0, farPieces: 0, ms: 0 };
    perStop = [];
    for (const s of todo) {
      if (Date.now() > deadline) {
        console.log(`time is up after ${counts.stops} of ${todo.length} stops`);
        break;
      }
      let r;
      try {
        r = await page.evaluate(async ({ x, z, radius, spacing, noWalls, noSeams }) => {
          const g = window.__skyrome.game;
          // A story scene or a guard's talk met on the way pauses the game (and its LOD switches).
          window.__collision.unblock();
          const y = g.heightmap.heightAt(x, z);
          g.player.teleport({ x, y: y + 0.5, z }, 0);
          // The teleport primes the city; a few frames switch the stand-ins and LOD levels to near.
          const settle = await window.__collision.settleView(x, z, radius, 4, 12000);
          const r = window.__collision.sweep(x, z, { radius, spacing, noWalls, noSeams });
          r.settle = settle;
          return r;
        }, { x: s.x, z: s.z, radius, spacing, noWalls: !!args['no-walls'], noSeams: !!args['no-seams'] });
      } catch (e) {
        console.log(`  stop ${s.id} failed: ${String(e.message ?? e).slice(0, 200)}`);
        continue;
      }
      counts.stops++;
      for (const k of ['columns', 'stands', 'walls', 'seams']) for (const f of r[k]) raw[k].push(f);
      Object.assign(colliders, r.colliders);
      for (const k of ['probes', 'walkable', 'indoor', 'edges', 'rays', 'pinholes', 'seamSamples']) counts[k] += r.counts[k];
      counts.triangles += r.index.triangles;
      counts.released += r.index.released;
      counts.farPieces += r.index.far;
      counts.ms += r.ms;
      terrain.samples += r.terrain.samples;
      terrain.over4 += r.terrain.over4 ?? 0;
      terrain.sumAbs += r.terrain.meanAbs * r.terrain.samples;
      terrain.drawnMatches += r.terrain.drawnMatches;
      terrain.otherMatches += r.terrain.otherMatches;
      terrain.neither += r.terrain.neither;
      if (r.terrain.maxAbs > terrain.maxAbs) {
        terrain.maxAbs = r.terrain.maxAbs;
        terrain.worst = [...(r.terrain.worst ?? []), s.id];
      }
      if (!r.settle.settled) counts.unsettled = (counts.unsettled ?? 0) + 1;
      perStop.push([s.id, s.x, s.z, r.columns.length, r.stands.length, r.walls.length, r.seams.length, r.ms, r.index.far, r.settle.frames, r.settle.ms]);
      if (counts.stops % 25 === 0) console.log(`  ${counts.stops}/${todo.length} stops  ${raw.columns.length} columns, ${raw.stands.length} stands, ${raw.walls.length} walls, ${raw.seams.length} seams  (${Math.round((Date.now() - started) / 1000)} s)`);
    }
    sweepMin = (Date.now() - started) / 60000;

    // ---- dedupe overlapping stops, then group the probes of one defect
    const dedupe = (list, keyOf) => {
      const m = new Map();
      for (const f of list) {
        const k = `${keyOf(f)}|${Math.round(f.x)},${Math.round(f.z)}`;
        const e = m.get(k);
        if (!e || Math.abs(f.delta ?? f.gap ?? f.dPhys ?? 0) > Math.abs(e.delta ?? e.gap ?? e.dPhys ?? 0)) m.set(k, f);
      }
      return [...m.values()];
    };
    const groupKey = (f) => {
      switch (f.kind) {
        case 'float': case 'ledge': case 'embedded': case 'headroom': case 'invisible': case 'lip': case 'crack':
          return f.physKey || f.phys;
        default:
          return f.visKey || f.vis;
      }
    };
    const all = [
      ...dedupe(raw.columns, (f) => `${f.kind}|${f.physKey}|${f.visKey}`).map((f) => ({ ...f, family: 'column', size: f.delta })),
      ...dedupe(raw.stands, (f) => `${f.kind}|${f.physKey}`).map((f) => ({ ...f, family: 'stand', size: 1 })),
      ...dedupe(raw.walls, (f) => `${f.kind}|${f.physKey}|${f.visKey}|${f.h}`).map((f) => ({ ...f, kind: f.kind === 'ghost' ? 'ghost-wall' : f.kind, family: 'wall', size: f.gap })),
      ...dedupe(raw.seams, (f) => `${f.kind}|${f.physKey}|${f.visKey}`).map((f) => ({ ...f, family: 'seam', size: f.kind === 'drawn-step' ? f.dVis : f.dPhys })),
    ];
    defects = cluster(all, (f) => `${f.kind}|${groupKey(f)}`, 2.5);
    const SEV_W = { blocker: 100, major: 10, minor: 1 };
    for (const d of defects) {
      d.place = nearestPlace(places, d.x, d.z);
      d.severity = severityOf(d.kind, d.size, d.n);
      d.collider = colliders[d.physKey] ?? null;
      const story = STORY.some((id) => {
        const p = placeById.get(id);
        return p && Math.hypot(p.x - d.x, p.z - d.z) < 60;
      });
      d.onStory = story;
      // What a player would notice: severity first, then how much ground it covers and how big it is.
      d.score = +(SEV_W[d.severity] * (1 + Math.log2(d.n)) * Math.min(2.5, Math.abs(d.size) + 0.1) * (story ? 1.5 : 1)).toFixed(2);
    }
    defects.sort((a, b) => b.score - a.score);
    defectsTotal = defects.length;
    // The numbers scripts/audit/gate.mjs reads (all defects, before the JSON is trimmed).
    const nOf = (list) => list.reduce((s, d) => s + d.n, 0);
    const circusRe = /\((circus-maximus|caupona-carcerum|compitum-circi|temple-sol-circus|pulvinar),/;
    gateNumbers = {
      fallthrough: defects.filter((d) => d.kind === 'fallthrough').length,
      lips10cm: defects.filter((d) => d.kind === 'lip' && Math.abs(d.size) >= 0.1).length,
      cracks: defects.filter((d) => d.kind === 'crack').length,
      invisibleCityBoxNothingDrawn: defects.filter((d) => d.kind === 'invisible' && d.vis === 'none' && /^city:b\d+:box/.test(d.phys ?? '')).length,
      embeddedCityBox: defects.filter((d) => d.kind === 'embedded' && /city:b\d+:box/.test(d.phys ?? '')).length,
      circusGhostWallProbes: nOf(defects.filter((d) => d.kind === 'ghost-wall' && circusRe.test(d.place ?? ''))),
      tarpeianGhostProbes: nOf(defects.filter((d) => d.kind === 'ghost' && /\((tarpeian-rock|carmental-gate|porta-carmentalis)/.test(d.place ?? ''))),
      ghostOnDeckProbes: nOf(defects.filter((d) => d.kind === 'ghost' && /\((portus-tiberinus|river-port)/.test(d.place ?? ''))),
      terrainMaxDiffM: terrain.maxAbs,
      terrainDrawnDiagonalPct: terrain.drawnMatches + terrain.otherMatches + terrain.neither ? +((100 * terrain.drawnMatches) / (terrain.drawnMatches + terrain.otherMatches + terrain.neither)).toFixed(1) : null,
      bareGroundOver4cm: terrain.over4,
    };
    byKind = Object.fromEntries(kinds.map((k) => [k, { defects: defects.filter((d) => d.kind === k).length, probes: defects.filter((d) => d.kind === k).reduce((s, d) => s + d.n, 0) }]));

    // ---- report
    say(`\n# Collision against visuals\n\n${counts.stops} stops of ${todo.length} (${stops.length} planned) in ${sweepMin.toFixed(1)} min: ${counts.probes} probe columns (${counts.walkable} standable, ${counts.indoor} inside solids, ${counts.pinholes} ray-only cracks a capsule does not fall through), ${counts.edges} street edges, ${counts.seamSamples} seam samples, ${counts.rays} rays, ${counts.triangles} drawn triangles indexed (${counts.released} released pieces skipped, ${counts.farPieces} far stand-in pieces near a stop, ${counts.unsettled ?? 0} stops whose picture had not settled after 12 s), ${Math.round(counts.ms / 1000)} s of probing.`);
    say(`\n## Defects by kind (grouped probes: same kind, same collider or drawn piece, within 2.5 m)\n`);
    say('| kind | defects | probes | blocker | major | minor | worst size (m) |');
    say('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const k of kinds) {
      const list = defects.filter((d) => d.kind === k);
      if (!list.length) continue;
      say(`| ${k} | ${list.length} | ${list.reduce((s, d) => s + d.n, 0)} | ${list.filter((d) => d.severity === 'blocker').length} | ${list.filter((d) => d.severity === 'major').length} | ${list.filter((d) => d.severity === 'minor').length} | ${Math.max(...list.map((d) => Math.abs(d.size))).toFixed(2)} |`);
    }
    say(`\n## Causes (kind, collider owner vs drawn material; defects, probes, worst)\n`);
    const cause = (s) => String(s ?? '').replace(/:b\d+:/g, ':b#:').replace(/#\d+/g, '').replace(/@[-\d.,]+/g, '');
    const byCause = new Map();
    for (const d of defects) {
      const c = `${d.kind} | ${cause(d.phys)} vs ${cause(d.vis)}`;
      const e = byCause.get(c) ?? { defects: 0, probes: 0, max: 0, ex: d };
      e.defects++;
      e.probes += d.n;
      if (Math.abs(d.size) > e.max) { e.max = Math.abs(d.size); e.ex = d; }
      byCause.set(c, e);
    }
    for (const [c, e] of [...byCause.entries()].sort((a, b) => b[1].probes - a[1].probes).slice(0, 45)) say(`- ${c}: ${e.defects} defects, ${e.probes} probes, worst ${e.max.toFixed(2)} m at ${e.ex.x},${e.ex.y},${e.ex.z} (${e.ex.place})`);
    say(`\n## Terrain: physics heightfield vs drawn triangulation\n\n${terrain.samples} bare-ground probes, |physics − drawn| mean ${(terrain.sumAbs / Math.max(1, terrain.samples)).toFixed(4)} m, max ${terrain.maxAbs.toFixed(3)} m at ${JSON.stringify(terrain.worst)}. Where the two diagonals differ by over 2 cm, the physics matches the drawn diagonal ${terrain.drawnMatches}×, the other diagonal ${terrain.otherMatches}×, neither ${terrain.neither}×.`);

  }

  // ---- confirm the worst in the game, and screenshot
  await page.evaluate(() => {
    const g = window.__skyrome.game;
    document.querySelectorAll('.ui-root').forEach((e) => (e.style.visibility = 'hidden'));
    window.__pin = null;
    g.addSystem({ name: 'auditCam', priority: 150, lateUpdate() { const c = window.__pin; if (c) { g.camera.position.set(c[0], c[1], c[2]); g.camera.lookAt(c[3], c[4], c[5]); g.camera.updateMatrixWorld(); } } });
  });
  const picks = [];
  const perKind = {};
  for (const d of defects) {
    if (picks.length >= nConfirm) break;
    if (d.kind === 'headroom' || d.kind === 'drawn-step' || d.kind === 'ramp-steps' || d.kind === 'low-overhead') continue;
    if ((perKind[d.kind] ?? 0) >= Math.ceil(nConfirm / 4)) continue;
    if (picks.some((p) => Math.hypot(p.x - d.x, p.z - d.z) < 8)) continue;
    const placeId = (d.place.match(/\(([^,]+),/) ?? [])[1] ?? d.place;
    if (picks.filter((p) => p.placeId === placeId).length >= 2) continue;
    d.placeId = placeId;
    perKind[d.kind] = (perKind[d.kind] ?? 0) + 1;
    picks.push(d);
  }
  let shotN = 0;
  for (const d of picks) {
    if (Date.now() > deadline + 15 * 60_000) break;
    const ex = d.ex;
    let res;
    try {
      res = await page.evaluate(async ({ d, ex }) => {
        const g = window.__skyrome.game;
        const C = window.__collision;
        const p = g.player;
        const settle = async () => C.frames(25, 6000);
        if (d.kind === 'invisible') {
          return { how: 'walk into', ...(await C.walkInto(ex.x, ex.z, ex.dx, ex.dz, ex.reach, ex.visDist)) };
        }
        if (d.kind === 'ghost-wall') {
          // Walk at the drawn surface: a body that gets 0.35 m past it went through.
          const w = await C.walkInto(ex.x, ex.z, ex.dx, ex.dz, Math.min(ex.reach, (ex.visDist ?? 2) + 1.2), ex.visDist);
          return { how: 'walk into', passedDrawn: ex.visDist !== null && w.progress > ex.visDist + 0.35, ...w };
        }
        if (d.kind === 'ghost' || d.kind === 'sink' || d.kind === 'lip' || d.kind === 'crack') {
          // Walk through the spot along its line (seams) or from the open side.
          let dir = ex.dx !== undefined && d.family === 'seam' ? [ex.dx, ex.dz] : ex.dx !== undefined ? [ex.dx, ex.dz] : C.openApproach(ex.x, ex.z, ex.y, 2.5);
          if (!dir) dir = [1, 0];
          const w = await C.walkOver(ex.x, ex.z, dir[0], dir[1], 2.5, ex.visY ?? ex.y);
          return { how: 'walk over', approach: dir, ...w };
        }
        // float, ledge, embedded, fallthrough: stand the player on the collider at the spot (a
        // fall-through: on the drawn floor, and see how far they drop).
        const blocked = C.unblock();
        const fy = d.kind === 'fallthrough' ? ex.visY ?? ex.y : ex.physY ?? ex.y;
        p.teleport({ x: ex.x, y: fy + 0.03, z: ex.z }, 0);
        await settle();
        const drawn = C.at(p.position.x, p.position.z).drawn.filter((s) => s.facing > 0.6 && s.y < p.position.y + 1.2);
        const under = drawn.length ? drawn[0].y : null;
        return { how: d.kind === 'fallthrough' ? 'drop on the drawn floor' : 'stand on it', at: [+p.position.x.toFixed(2), +p.position.y.toFixed(2), +p.position.z.toFixed(2)], grounded: p.grounded, feetAboveDrawn: under === null ? null : +(p.position.y - under).toFixed(3), droppedBelowDrawnFloor: d.kind === 'fallthrough' ? +(fy - p.position.y).toFixed(2) : undefined, movedFromSpot: +Math.hypot(p.position.x - ex.x, p.position.z - ex.z).toFixed(2), ...(blocked ? { unblocked: blocked } : {}) };
      }, { d: { kind: d.kind, family: d.family }, ex });
    } catch (e) {
      res = { error: String(e.message ?? e).slice(0, 200) };
    }
    d.confirm = res;
    console.log(`confirm ${d.kind} @${ex.x},${ex.y},${ex.z} (${d.place}): ${JSON.stringify(res)}`);
    if (shotN < nShots && !res.error) {
      const at = res.at ?? [ex.x, ex.y, ex.z];
      const low = d.kind === 'sink' || d.kind === 'float' || d.kind === 'lip' || d.kind === 'crack';
      const cam = await page.evaluate(({ at, low }) => window.__collision.cameraFor(at[0], at[1], at[2], low ? 2.8 : 4.6, low ? 1.0 : 2.3, low ? 0.25 : 0.7), { at, low });
      await page.evaluate((c) => { window.__pin = c; }, cam);
      await page.evaluate(() => window.__collision.frames(12, 6000));
      const p = join(shotDir, `collision-${String(++shotN).padStart(2, '0')}-${d.kind}.png`);
      await page.screenshot({ path: p });
      await page.evaluate(() => { window.__pin = null; });
      d.screenshot = p;
    }
  }

  say(`\n## The worst defects (score: severity × area × size, ×1.5 on the story's route)\n`);
  for (const d of defects.slice(0, 60)) {
    const c = d.collider;
    const col = c && c.shape !== 'trimesh' && c.shape !== 'heightfield' ? ` collider ${c.shape} at ${c.at.join(',')}${c.size ? ' half-size ' + c.size.join('×') : ''}${c.top !== null ? ' top ' + c.top : ''}` : '';
    say(`- [${d.severity}] ${d.kind} ${d.family === 'stand' ? '' : Math.abs(d.size).toFixed(2) + ' m '}over ${d.n} probes @${d.x},${d.y},${d.z} (${d.place}${d.onStory ? ', story route' : ''}): ${d.phys}${d.vis ? ' vs ' + d.vis : ''}${col}${d.confirm ? `; confirmed: ${JSON.stringify(d.confirm)}` : ''}${d.screenshot ? `; shot ${d.screenshot.replace(root + '/', '')}` : ''}`);
  }

  // ---- write (bounded: the defects, not every probe)
  const trimDefect = (d) => ({ kind: d.kind, family: d.family, severity: d.severity, score: d.score, n: d.n, size: +(+d.size).toFixed(3), x: d.x, y: d.y, z: d.z, bbox: d.bbox, place: d.place, onStory: d.onStory, phys: d.phys, vis: d.vis, physKey: d.physKey, visKey: d.visKey, collider: d.collider, ex: d.ex, confirm: d.confirm, screenshot: d.screenshot });
  let keep = defects.length;
  let json;
  for (;;) {
    const out = {
      date: new Date().toISOString(),
      args: { minutes, maxStops, radius, spacing, grid, only, regions: !!args.regions, from: fromFile },
      counts,
      sweepMinutes: +(+sweepMin).toFixed(1),
      totalMinutes: +((Date.now() - started) / 60000).toFixed(1),
      byKind,
      gate: gateNumbers,
      terrain: { ...terrain, meanAbs: terrain.samples ? +(terrain.sumAbs / terrain.samples).toFixed(4) : 0 },
      stops: perStop,
      stopFields: ['id', 'x', 'z', 'columns', 'stands', 'walls', 'seams', 'probeMs', 'farPieces', 'settleFrames', 'settleMs'],
      defectsTotal,
      defects: defects.slice(0, keep).map(trimDefect),
      errors: errors.slice(0, 20),
    };
    json = JSON.stringify(out);
    if (json.length < 1.9e6 || keep < 50) break;
    keep = Math.floor(keep * 0.7);
  }
  writeFileSync(join(outDir, 'collision.json'), json);
  writeFileSync(join(outDir, 'collision-summary.md'), lines.join('\n') + '\n');
  console.log(`\nwrote ${join(outDir, 'collision.json')} (${(json.length / 1e6).toFixed(2)} MB) and collision-summary.md; ${shotN} screenshots in ${shotDir}; ${Math.round((Date.now() - started) / 60000)} min`);
} catch (e) {
  if (e.message !== 'listed') {
    code = 1;
    console.error('FAILED:', e.stack ?? e.message);
  }
} finally {
  if (errors.length) console.log('page errors:\n  ' + errors.slice(0, 10).join('\n  '));
  await browser.close();
  await server.close();
  process.exit(code);
}

/** Group findings with the same key whose probes lie within `link` m of each other (union-find on a spatial hash). */
function cluster(list, keyOf, link) {
  const groups = new Map();
  for (const f of list) {
    const k = keyOf(f);
    let g = groups.get(k);
    if (!g) groups.set(k, (g = []));
    g.push(f);
  }
  const out = [];
  for (const g of groups.values()) {
    const parent = g.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const hash = new Map();
    const cell = (v) => Math.floor(v / link);
    g.forEach((f, i) => {
      const cx = cell(f.x), cz = cell(f.z);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        for (const j of hash.get(`${cx + dx},${cz + dz}`) ?? []) {
          if (Math.hypot(g[j].x - f.x, g[j].z - f.z) <= link) parent[find(i)] = find(j);
        }
      }
      const k = `${cx},${cz}`;
      if (!hash.has(k)) hash.set(k, []);
      hash.get(k).push(i);
    });
    const parts = new Map();
    g.forEach((f, i) => {
      const r = find(i);
      if (!parts.has(r)) parts.set(r, []);
      parts.get(r).push(f);
    });
    for (const fs of parts.values()) {
      let ex = fs[0];
      for (const f of fs) if (Math.abs(f.size) > Math.abs(ex.size)) ex = f;
      const xs = fs.map((f) => f.x), zs = fs.map((f) => f.z);
      out.push({
        kind: ex.kind,
        family: ex.family,
        n: fs.length,
        size: ex.size,
        x: +(xs.reduce((a, b) => a + b, 0) / fs.length).toFixed(1),
        y: +(+ex.y).toFixed(2),
        z: +(zs.reduce((a, b) => a + b, 0) / fs.length).toFixed(1),
        bbox: [+Math.min(...xs).toFixed(1), +Math.min(...zs).toFixed(1), +Math.max(...xs).toFixed(1), +Math.max(...zs).toFixed(1)],
        phys: ex.phys,
        vis: ex.vis,
        physKey: ex.physKey,
        visKey: ex.visKey,
        ex,
      });
    }
  }
  return out;
}

function nearestPlace(places, x, z) {
  let best = null, bd = Infinity;
  for (const p of places) {
    // Named places (map markers) count from their edge (radius, at least 20 m); anything named otherwise from its centre.
    const d = Math.hypot(p.x - x, p.z - z) - (p.marker ? Math.max(p.r, 20) : 0);
    if (d < bd) { bd = d; best = p; }
  }
  return best ? `${best.name} (${best.id}, ${Math.round(Math.hypot(best.x - x, best.z - z))} m)` : '?';
}

/** Mirrors src/dev/audit/collisionRules.ts severityOf (kept here so the driver runs without a TS loader). */
function severityOf(kind, size, area) {
  const s = Math.abs(size);
  switch (kind) {
    case 'fallthrough': return 'blocker';
    case 'ledge': case 'ghost': return s >= 0.6 || area >= 4 ? 'major' : 'minor';
    case 'float': case 'sink': return s >= 0.12 && area >= 2 ? 'major' : 'minor';
    case 'invisible': return s >= 0.5 ? 'major' : 'minor';
    case 'ghost-wall': return s >= 0.5 && area >= 2 ? 'major' : 'minor';
    case 'embedded': return area >= 3 ? 'major' : 'minor';
    case 'lip': case 'crack': return s >= 0.1 ? 'major' : 'minor';
    default: return 'minor';
  }
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
