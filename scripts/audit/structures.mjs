#!/usr/bin/env node
/**
 * Structures-on-the-ground audit (phase 4 "solid ground", lens 1): do the city's buildings,
 * landmarks and their podia, walls, gates, aqueduct piers, monuments and stairs meet the ground?
 *
 * It boots the game with the geometry audit on (`?audit`, src/dev/audit/geomAudit.ts, which with
 * this phase also records every steep face a MeshBuilder builds), then:
 *
 *   1. Massing pass (pure, the whole city at once): for every far-massing box of every block
 *      (city/massing.ts `lotMass`: base = lowest of 5 terrain samples − 0.4 m) it samples the terrain
 *      every 0.5 m along the box's four edges and reports where the base hangs above the terrain
 *      (what a player sees of a block beyond the detail radius, or anywhere outside the detail area).
 *   2. Feet pass (streamed): it teleports the player to a tour of stops covering every detailed block
 *      and every landmark (and the story's places), lets the city build around each stop, and runs
 *      `analyzeFeet` there: along the bottom edge of every wall, riser, podium side and slab side it
 *      compares the edge with the ground just outside (terrain or walkable surface) → `floating`
 *      (void under the base), and the ground outside with the floor just inside → `buried` (doors and
 *      shop openings under the pavement). Each finding is a stretch of one build with its length,
 *      worst gap (also against the terrain as drawn: 9 cm lower under roads and pads), position,
 *      the nearest named place and the lot or landmark it belongs to.
 *   3. Screenshots of the worst cases per class into .shots/audit/structures/.
 *
 *   node scripts/audit/structures.mjs [--near 70] [--minutes 40] [--max 400] [--shots 6]
 *                                     [--only porta-capena,forum-trajan] [--no-massing] [--no-shots]
 *                                     [--json scripts/audit/out/structures.json] [--list-records]
 *
 * `--near` is the city's full-detail radius for the run (cityNear) and the analysis radius; stops are
 * spaced at 0.8 × near. Takes about 15–25 minutes for the whole city at --near 70.
 */
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = parseArgs(process.argv.slice(2));
const near = Number(args.near ?? 70);
const minutes = Number(args.minutes ?? 40);
const maxStops = Number(args.max ?? 400);
const shotsPer = args['no-shots'] ? 0 : Number(args.shots ?? 6);
const jsonOut = resolve(root, args.json ?? 'scripts/audit/out/structures.json');
const shotDir = resolve(root, '.shots/audit/structures');
mkdirSync(shotDir, { recursive: true });
mkdirSync(dirname(jsonOut), { recursive: true });
const t0 = Date.now();
const deadline = t0 + minutes * 60_000;

const { createServer } = await import('vite');
const port = await freePort();
const server = await createServer({ root, logLevel: 'error', server: { port, strictPort: true, host: '127.0.0.1', hmr: false } });
await server.listen();
const url = `http://127.0.0.1:${port}/?scene=rome&quick=1&hour=11&audit=1&cityNear=${near}&cityMid=${Math.max(85, near + 15)}`;

const pw = await import('playwright');
const browser = await pw.chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));

let code = 0;
try {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__skyrome?.ready || window.__skyrome?.error, null, { timeout: 180000, polling: 200 });
  const bootErr = await page.evaluate(() => window.__skyrome?.error);
  if (bootErr) throw new Error(`boot failed: ${bootErr}`);
  await page.waitForTimeout(2000);
  // Hide the HUD for the whole run (it also costs frames).
  await page.evaluate(() => document.querySelectorAll('.ui-root').forEach((e) => (e.style.visibility = 'hidden')));

  if (args['list-records']) {
    const names = await page.evaluate(() => window.__audit.auditRecordNames());
    const by = new Map();
    for (const r of names) {
      const k = r.name.replace(/\d+/g, '#');
      const e = by.get(k) ?? { n: 0, up: 0, steep: 0 };
      e.n++; e.up += r.up; e.steep += r.steep;
      by.set(k, e);
    }
    for (const [k, e] of [...by.entries()].sort((a, b) => b[1].steep - a[1].steep).slice(0, 80)) console.log(`${String(e.n).padStart(4)} ${String(e.up).padStart(8)} up ${String(e.steep).padStart(8)} steep  ${k}`);
    console.log(`${names.length} records`);
    throw new Error('listed');
  }

  if (args.look) {
    // --look x,y,z[,name]: one framed screenshot of a spot (the finding's foot point), for confirming a case.
    const [lx, ly, lz, lname] = String(args.look).split(',');
    await page.evaluate(() => {
      const g = window.__skyrome.game;
      window.__pin = null;
      g.addSystem({ name: 'auditCam', priority: 150, lateUpdate() { const c = window.__pin; if (c) { g.camera.position.set(c[0], c[1], c[2]); g.camera.lookAt(c[3], c[4], c[5]); } } });
    });
    const info = await frame(page, Number(lx), Number(ly), Number(lz));
    const p = join(shotDir, `${lname || 'look'}.png`);
    await page.screenshot({ path: p });
    console.log(`shot ${p} from ${JSON.stringify(info)}`);
    throw new Error('listed');
  }

  if (args.probe) {
    // --probe x,z[,r]: teleport there, measure the feet within r (default 6 m) and dump the faces at the point.
    const [px, pz, pr] = String(args.probe).split(',').map(Number);
    const res = await page.evaluate(async ({ px, pz, pr }) => {
      const g = window.__skyrome.game;
      g.player.teleport({ x: px + 3, y: g.heightmap.heightAt(px + 3, pz + 3) + 0.5, z: pz + 3 }, 0);
      await new Promise((r) => setTimeout(r, 2500));
      const H = (a, b) => g.heightmap.heightAt(a, b);
      const { findings, totals } = window.__audit.analyzeFeet(px, pz, pr || 6, H, {});
      return { findings: findings.slice(0, 30), totals, faces: window.__audit.auditFacesNear(px, pz, 0.45, 60), terrain: H(px, pz), surfaces: window.__audit.surfacesAt(px, pz) };
    }, { px, pz, pr });
    console.log(`terrain ${res.terrain.toFixed(2)}; surfaces at the point:`, JSON.stringify(res.surfaces));
    console.log('faces within 0.45 m (lowest first):');
    for (const f of res.faces) console.log(`  ${f.steep ? 'steep' : 'up   '} ${f.minY.toFixed(2)}..${f.maxY.toFixed(2)}  ${f.mat.padEnd(16)} ${f.name} ${f.src}  ${JSON.stringify(f.tri)}`);
    console.log('findings:', JSON.stringify(res.totals));
    for (const f of res.findings) console.log(`  ${f.kind} ${f.depth} m ${f.length} m ${f.mat} ${f.name} @${f.at.join(',')} ground=${f.ground}(${f.groundMat}) terrain=${f.terrain}${f.floor !== undefined ? ` floor=${f.floor}(${f.floorMat})` : ''}`);
    throw new Error('listed');
  }

  // ---- 1. massing pass (pure)
  let massing = null;
  if (!args['no-massing']) {
    massing = await page.evaluate(() => {
      const g = window.__skyrome.game;
      const H = (x, z) => g.heightmap.heightAt(x, z);
      const blocks = g.city.streamer.blocks;
      const out = [];
      let boxes = 0, detailedBoxes = 0;
      for (const r of blocks) {
        if (!r.layout) continue;
        for (const m of r.layout.masses) {
          boxes++;
          if (r.blk.detailed) detailedBoxes++;
          const { c, u, v, hu, hv } = m.obb;
          const at = (lx, lz) => [c[0] + u[0] * lx + v[0] * lz, c[1] + u[1] * lx + v[1] * lz];
          let minH = Infinity, maxH = -Infinity, worst = null;
          const edges = [[[-hu, -hv], [hu, -hv]], [[hu, -hv], [hu, hv]], [[hu, hv], [-hu, hv]], [[-hu, hv], [-hu, -hv]]];
          for (const [a, b] of edges) {
            const L = Math.hypot((b[0] - a[0]), (b[1] - a[1]));
            const n = Math.max(2, Math.ceil(L / 0.5));
            for (let i = 0; i <= n; i++) {
              const s = i / n;
              const [x, z] = at(a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s);
              const h = H(x, z);
              if (h < minH) { minH = h; worst = [x, z]; }
              if (h > maxH) maxH = h;
            }
          }
          const gap = m.base - minH;
          const kind = hv <= 0.25 ? 'compound-wall' : m.windows.every((w) => !w) && m.eave - m.floorY <= 7.3 ? 'domus/horrea' : 'insula/shops';
          if (gap > 0.1) out.push({ block: r.blk.id, detailed: r.blk.detailed, kind, gap: +gap.toFixed(2), base: +m.base.toFixed(2), floorY: +m.floorY.toFixed(2), terrainMin: +minH.toFixed(2), terrainMax: +maxH.toFixed(2), at: [+worst[0].toFixed(1), +m.base.toFixed(2), +worst[1].toFixed(1)], size: [+(2 * hu).toFixed(1), +(2 * hv).toFixed(1)] });
        }
      }
      out.sort((a, b) => b.gap - a.gap);
      return { boxes, detailedBoxes, floating: out.length, floatingFar: out.filter((o) => !o.detailed).length, worst: out.slice(0, 300) };
    });
    console.log(`massing: ${massing.boxes} boxes (${massing.detailedBoxes} in detailed blocks), ${massing.floating} with the base above the terrain somewhere along an edge (> 0.1 m), ${massing.floatingFar} of them outside the detail area (the massing is all a player sees there)`);
    for (const o of massing.worst.slice(0, 12)) console.log(`  ${o.gap.toFixed(2)} m  ${o.kind.padEnd(14)} ${o.detailed ? 'detailed' : 'far     '} @${o.at.join(',')} block ${o.block} ${o.size[0]}x${o.size[1]} m`);
  }

  // ---- 2. stops: a tour over the detailed blocks, the landmarks and the story's places
  const stops = await page.evaluate(({ near, only }) => {
    const g = window.__skyrome.game;
    const pts = [];
    for (const r of g.city.streamer.blocks) if (r.blk.detailed && r.layout) pts.push({ id: `block:${r.blk.id}`, x: r.blk.centroid[0], z: r.blk.centroid[1], w: 1 });
    for (const [id, p] of g.landmarks) pts.push({ id, x: p.position.x, z: p.position.z, w: 2 });
    for (const id of ['porta-capena', 'circus-maximus', 'miliarium-aureum', 'velabrum', 'vicus-tuscus', 'subura', 'ludus-magnus', 'colosseum', 'forum-trajan', 'emporium', 'tiber-island', 'insula-tiberina', 'campus-martius', 'forum-boarium']) {
      const l = g.locations.get(id);
      if (l?.position) pts.push({ id: `place:${id}`, x: l.position.x, z: l.position.z, w: 3 });
    }
    // Greedy clusters of radius 0.8 × near: the heaviest-weighted point of a cluster names it.
    pts.sort((a, b) => b.w - a.w);
    const R = near * 0.8;
    const clusters = [];
    for (const p of pts) {
      const c = clusters.find((q) => Math.hypot(q.x - p.x, q.z - p.z) < R);
      if (c) { c.ids.push(p.id); continue; }
      clusters.push({ id: p.id, x: p.x, z: p.z, ids: [p.id] });
    }
    // Centre each cluster on its members, but keep it within R/2 of the naming point.
    for (const c of clusters) {
      const ms = pts.filter((p) => c.ids.includes(p.id));
      let mx = 0, mz = 0;
      for (const m of ms) { mx += m.x; mz += m.z; }
      mx /= ms.length; mz /= ms.length;
      const d = Math.hypot(mx - c.x, mz - c.z);
      if (d > R / 2) { mx = c.x + ((mx - c.x) * R) / 2 / d; mz = c.z + ((mz - c.z) * R) / 2 / d; }
      c.x = mx; c.z = mz;
    }
    // Nearest-neighbour tour from the Porta Capena (less streaming churn).
    const tour = [];
    let cur = clusters.find((c) => c.ids.includes('porta-capena')) ?? clusters[0];
    const left = new Set(clusters);
    while (cur) {
      tour.push(cur);
      left.delete(cur);
      let best = null, bd = Infinity;
      for (const c of left) { const d = Math.hypot(c.x - cur.x, c.z - cur.z); if (d < bd) { bd = d; best = c; } }
      cur = best;
    }
    const sel = only ? tour.filter((c) => c.ids.some((id) => only.some((o) => id.includes(o)))) : tour;
    return sel.map((c) => ({ id: c.id, x: +c.x.toFixed(1), z: +c.z.toFixed(1), n: c.ids.length }));
  }, { near, only: args.only ? String(args.only).split(',') : null });
  console.log(`${stops.length} stops (clusters of ${near * 0.8} m over the detailed blocks, landmarks and story places)`);

  // ---- 3. the feet pass
  const all = [];
  const totals = { samples: 0, edges: 0, records: 0, skipped: { overhang: 0, water: 0, interior: 0, continues: 0 }, stops: 0, forgotten: 0 };
  let n = 0;
  for (const s of stops.slice(0, maxStops)) {
    if (Date.now() > deadline) { console.log(`time is up after ${n} stops (--minutes ${minutes})`); break; }
    n++;
    await page.evaluate(({ x, z }) => {
      const g = window.__skyrome.game;
      g.player.teleport({ x, y: g.heightmap.heightAt(x, z) + 0.5, z }, 0);
    }, s);
    // The teleport primes the city; give the streamer a moment to finish anything the frame budget deferred.
    await page.waitForTimeout(1800);
    await page.waitForFunction(() => !window.__skyrome.game.city.streamer.busy?.(), null, { timeout: 8000, polling: 150 }).catch(() => {});
    const res = await page.evaluate(({ x, z, r }) => {
      const g = window.__skyrome.game;
      const H = (a, b) => g.heightmap.heightAt(a, b);
      const sm = (e0, e1, v) => { const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
      const visualDrop = (a, b) => { const i = g.terrain.inputAt(a, b); return 0.09 * Math.max(sm(0.75, -0.25, i.roadSd), sm(0.75, -0.25, i.padSd)); };
      const waterAt = (a, b) => g.water?.levelAt?.(a, b) ?? null;
      const T = performance.now();
      const { findings, totals } = window.__audit.analyzeFeet(x, z, r, H, { visualDrop, waterAt });
      // Name what each finding belongs to: the lot (kind) of a block unit, the landmark, the monument.
      const blocks = g.city.streamer.blocks;
      const lotAt = (fx, fz, blockId) => {
        const rec = blocks.find((b) => b.blk.id === blockId);
        if (!rec?.layout) return null;
        const inObb = (o, m) => { const dx = fx - o.c[0], dz = fz - o.c[1]; const lu = dx * o.u[0] + dz * o.u[1], lv = dx * o.v[0] + dz * o.v[1]; return Math.abs(lu) <= o.hu + m && Math.abs(lv) <= o.hv + m; };
        for (const p of rec.layout.lots) if (p.kind !== 'alley' && inObb(p.obb, 0.6)) return { kind: p.kind, lot: p.id, floorY: null };
        for (const b of rec.layout.back) if (inObb(b.obb, 0.6)) return { kind: 'back-insula', lot: b.id, floorY: +b.floorY.toFixed(2) };
        for (const w of rec.layout.walls) { const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1; const ux = (w.b[0] - w.a[0]) / L, uz = (w.b[1] - w.a[1]) / L; const dx = fx - w.a[0], dz = fz - w.a[1]; const t = dx * ux + dz * uz; if (t > -0.6 && t < L + 0.6 && Math.abs(dx * -uz + dz * ux) < 0.8) return { kind: 'compound-wall', lot: null, floorY: null }; }
        return { kind: 'yard', lot: null, floorY: null };
      };
      const lms = [...g.landmarks.values()];
      const nearestLandmark = (fx, fz) => {
        let best = null, bd = Infinity;
        for (const p of lms) { const d = Math.hypot(p.position.x - fx, p.position.z - fz); if (d < bd) { bd = d; best = p; } }
        return best ? { id: best.lm.id, name: best.lm.name, category: best.lm.category, d: +bd.toFixed(0) } : null;
      };
      const locs = g.locations.all().filter((l) => l.position);
      const place = (fx, fz) => {
        let best = null, bd = Infinity;
        for (const l of locs) { const d = Math.hypot(l.position.x - fx, l.position.z - fz) - (l.radius ?? 0); if (d < bd) { bd = d; best = l; } }
        return best ? `${best.name}${bd > 25 ? ` (+${Math.round(bd)} m)` : ''}` : '?';
      };
      for (const f of findings) {
        const m = /^city:(.+):full$/.exec(f.name);
        if (m && !/^(cell|props|mon)/.test(m[1])) {
          const lot = lotAt(f.at[0], f.at[2], m[1]);
          f.type = lot ? (lot.kind === 'yard' ? 'block:yard' : `block:${lot.kind}`) : 'block:?';
          f.lot = lot?.lot ?? null;
          f.owner = `block ${m[1]}`;
        } else if (/^city:mon:/.test(f.name)) {
          f.type = 'monument';
          f.owner = f.name;
        } else if (/^city:cell:/.test(f.name)) {
          f.type = f.src && /stair|step|flight/.test(f.src) ? 'street:stairs' : 'street';
          f.owner = f.src || f.name;
        } else if (/^city:props:/.test(f.name)) {
          f.type = 'street:props';
          f.owner = f.src || f.name;
        } else {
          const lm = nearestLandmark(f.at[0], f.at[2]);
          f.type = 'landmark';
          f.owner = lm ? `${lm.id} (${lm.category}, ${lm.d} m from its centre)` : f.name;
          f.landmark = lm?.id ?? null;
        }
        f.place = place(f.at[0], f.at[2]);
      }
      // Forget the block units measured here (memory); monuments, cells and landmarks stay (built once).
      const forgotten = window.__audit.auditForget((name) => /^city:(?!cell:|props:|mon:)/.test(name));
      return { findings, totals, forgotten, ms: Math.round(performance.now() - T), records: window.__audit.auditRecordCount() };
    }, { x: s.x, z: s.z, r: near + 15 });
    for (const f of res.findings) all.push({ ...f, stop: s.id });
    totals.samples += res.totals.samples;
    totals.edges += res.totals.edges;
    totals.records += res.totals.records;
    for (const k of Object.keys(totals.skipped)) totals.skipped[k] += res.totals.skipped[k];
    totals.forgotten += res.forgotten;
    totals.stops++;
    if (n % 5 === 0 || n === 1) console.log(`  ${n}/${Math.min(stops.length, maxStops)} ${s.id.padEnd(28)} ${String(res.totals.samples).padStart(6)} samples ${String(res.findings.length).padStart(4)} findings  ${res.ms} ms  ${res.records} records live  ${Math.round((Date.now() - t0) / 1000)} s`);
  }

  // Merge duplicates (stops overlap): same kind, build name, material and position within 2 m.
  const uniq = [];
  for (const f of all.sort((a, b) => b.n - a.n)) {
    const dup = uniq.find((u) => u.kind === f.kind && u.name === f.name && u.mat === f.mat && Math.hypot(u.at[0] - f.at[0], u.at[2] - f.at[2]) < 2.5);
    if (!dup) uniq.push(f);
  }
  const finds = uniq.sort((a, b) => b.depth - a.depth);

  // ---- report
  const byType = {};
  for (const f of finds) {
    const e = (byType[`${f.kind}|${f.type}`] ??= { n: 0, length: 0, max: 0, major: 0 });
    e.n++;
    e.length += f.length;
    e.max = Math.max(e.max, f.depth);
    if (f.depth >= (f.kind === 'floating' ? 0.3 : 0.6)) e.major++;
  }
  console.log(`\n== feet: ${totals.samples} foot samples on ${totals.edges} bottom edges over ${totals.stops} stops; skipped ${totals.skipped.continues} (wall below), ${totals.skipped.overhang} (overhangs), ${totals.skipped.water} (over water), ${totals.skipped.interior} (interiors)`);
  console.log(`== ${finds.length} stretches that do not meet the ground, by kind and type (n, total length m, worst m, major):`);
  for (const [k, e] of Object.entries(byType).sort((a, b) => b[1].length - a[1].length)) console.log(`  ${k.padEnd(28)} ${String(e.n).padStart(5)}  ${e.length.toFixed(0).padStart(7)} m  max ${e.max.toFixed(2)}  major ${e.major}`);
  for (const kind of ['floating', 'buried']) {
    console.log(`\n== worst ${kind}:`);
    for (const f of finds.filter((f) => f.kind === kind).slice(0, 25)) console.log(`  ${f.depth.toFixed(2)} m (drawn ${f.depthVis.toFixed(2)})  ${f.length.toFixed(1).padStart(5)} m long  ${f.type.padEnd(18)} ${f.mat.padEnd(16)} @${f.at.join(',')}  ${f.place}  [${f.owner}${f.src ? ` src=${f.src}` : ''}]  ground=${f.groundMat}`);
  }

  // ---- screenshots of the worst per class
  const shots = [];
  if (shotsPer > 0) {
    await page.evaluate(() => {
      const g = window.__skyrome.game;
      window.__pin = null;
      g.addSystem({ name: 'auditCam', priority: 150, lateUpdate() { const c = window.__pin; if (c) { g.camera.position.set(c[0], c[1], c[2]); g.camera.lookAt(c[3], c[4], c[5]); } } });
    });
    const classes = [...new Set(finds.map((f) => `${f.kind}|${f.type.split(':')[0]}`))];
    for (const cls of classes) {
      const [kind, type] = cls.split('|');
      const list = finds.filter((f) => f.kind === kind && f.type.split(':')[0] === type).slice(0, shotsPer);
      let i = 0;
      for (const f of list) {
        if (Date.now() > deadline + 6 * 60_000) break;
        const [x, y, z] = f.at;
        const info = await frame(page, x, y, z);
        const file = `${kind}-${type}-${++i}.png`;
        const p = join(shotDir, file);
        await page.screenshot({ path: p });
        f.screenshot = `.shots/audit/structures/${file}`;
        shots.push({ file: f.screenshot, from: info, finding: f.at, kind, type, depth: f.depth, place: f.place });
        console.log(`shot ${f.screenshot}  ${f.depth} m ${kind} ${f.type} @${f.at.join(',')} ${f.place}`);
      }
    }
  }

  const summary = {
    generated: new Date().toISOString(),
    args: { near, minutes, maxStops, only: args.only ?? null },
    runtimeS: Math.round((Date.now() - t0) / 1000),
    stops: stops.slice(0, totals.stops),
    totals,
    byType,
    massing: massing ? { boxes: massing.boxes, detailedBoxes: massing.detailedBoxes, floating: massing.floating, floatingFar: massing.floatingFar, worst: massing.worst.slice(0, 120) } : null,
    findings: finds.slice(0, 600),
    pageErrors: errors.slice(0, 20),
  };
  writeFileSync(jsonOut, JSON.stringify(summary, null, 1));
  console.log(`\nwrote ${jsonOut} (${finds.length} findings, ${Math.round((Date.now() - t0) / 1000)} s)`);
} catch (e) {
  if (e.message !== 'listed') {
    code = 1;
    console.error('FAILED:', e.stack || e.message);
  }
} finally {
  if (errors.length) console.log('page errors:\n  ' + errors.slice(0, 10).join('\n  '));
  await browser.close();
  await server.close();
  process.exit(code);
}

/**
 * Frame a spot for a screenshot: teleport the player near it (so the city builds), then put the
 * camera 9 m off on the side with the clearest line of sight (physics ray from the eye to the spot,
 * lowest terrain breaks ties: a void under a base shows from below), eye 2.5 m over the foot.
 */
async function frame(page, x, y, z) {
  const info = await page.evaluate(async ({ x, y, z }) => {
    const g = window.__skyrome.game;
    const H = (a, b) => g.heightmap.heightAt(a, b);
    g.player.teleport({ x: x + 2, y: H(x + 2, z + 2) + 0.5, z: z + 2 }, 0);
    if (g.player.avatar) g.player.avatar.root.visible = false;
    await new Promise((r) => setTimeout(r, 1500));
    g.physics.step(1e-4);
    let best = null, bs = -Infinity;
    for (const d of [9, 6, 4]) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
        const ey = Math.max(H(px, pz) + 1.5, y + 2.5);
        const dir = { x: x - px, y: y - ey, z: z - pz };
        const L = Math.hypot(dir.x, dir.y, dir.z);
        const hit = g.physics.raycast({ x: px, y: ey, z: pz }, { x: dir.x / L, y: dir.y / L, z: dir.z / L }, L - 0.5, 1);
        const clear = hit ? hit.distance : L;
        const score = clear - (H(px, pz) - y) * 0.2;
        if (score > bs) { bs = score; best = { px, pz, ey, clear: +clear.toFixed(1), L: +L.toFixed(1) }; }
      }
      if (best && best.clear >= best.L - 0.6) break;
    }
    g.player.teleport({ x: best.px, y: H(best.px, best.pz) + 0.5, z: best.pz }, 0);
    if (g.player.avatar) g.player.avatar.root.visible = false;
    window.__pin = [best.px, best.ey, best.pz, x, y, z];
    return best;
  }, { x, y, z });
  await page.waitForTimeout(2200);
  return info;
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
