#!/usr/bin/env node
/**
 * Surface look and pop-in audit (phase 4a, lens 3: docs/design/solid-ground.md). Boots Rome with
 * the geometry audit on (`?audit=1`), injects scripts/audit/surface-page.js, and sweeps the city:
 *
 *   census   at every stop (every landmark, the opening's route, the story's places): the walkable
 *            top surface on a 1 m grid — the seams between ground materials (by pair, with the tint
 *            contrast and repeat ratio of the pair), the same material drawn by the terrain and by a
 *            mesh side by side ("twins"), terrain showing through inside the paving (holes), patches
 *            under 3 m² (slivers), and the patchwork index (seam metres per 100 m² of built ground);
 *   settle   at every stop: stand still after arriving, pinned camera, a frame every 100 ms for
 *            2.5 s: the fraction of pixels that change while nothing moves (pop-in after arrival),
 *            with the streaming / culling / texture / shadow events behind it;
 *   walk     along street routes (resolved through game.streets): the player runs at 4.4 m/s with
 *            a pinned first-person camera, a frame every 150 ms; frame-to-frame change spikes above
 *            the run's median are pops, and every cell / block / registry / texture / shadow flip is
 *            logged with the distance at which it happened.
 *
 *   node scripts/audit/surface.mjs [--mode census,settle,walk] [--only porta-capena,forum] [--max 60]
 *                                  [--radius 30] [--minutes 25] [--routes opening-a,subura]
 *                                  [--json scripts/audit/out/surface.json] [--shots 8]
 *
 * Output: the ranked report on stdout, the JSON summary (small: per-stop numbers and the top
 * examples, no raw grids), screenshots in .shots/audit-surface/ (eye-level and from above for the
 * worst seams, holes and twins; before/after pairs for the worst settle pops; filmstrips of the
 * walks with the spike frames). About 1 s per stop for the census, 4 s with settle, ~1 min per
 * route; the whole city with everything on is ~20 minutes (bounded by --minutes).
 */
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = parseArgs(process.argv.slice(2));
const outDir = resolve(root, '.shots/audit-surface');
mkdirSync(outDir, { recursive: true });
const modes = String(args.mode ?? 'census,settle,walk').split(',');
const radius = Number(args.radius ?? 30);
const maxStops = Number(args.max ?? 400);
const minutes = Number(args.minutes ?? 25);
const shotsPer = Number(args.shots ?? 8);
const only = args.only ? String(args.only).split(',') : null;
const jsonPath = resolve(root, args.json ?? 'scripts/audit/out/surface.json');
mkdirSync(dirname(jsonPath), { recursive: true });
const pageScript = readFileSync(resolve(root, 'scripts/audit/surface-page.js'), 'utf8');
const deadline = Date.now() + minutes * 60000;

/** Street routes, as landmark ids; the page resolves them through the street graph. */
const ROUTES = {
  'opening-a': ['porta-capena', 'circus-maximus', 'miliarium-aureum'],
  'opening-b': ['temple-castor-pollux', 'ludus-magnus', 'meta-sudans', 'colosseum'],
  'forum-trajan': ['miliarium-aureum', 'forum-caesar', 'forum-trajan', 'markets-trajan'],
  subura: ['basilica-aemilia', 'forum-nerva', 'subura'],
  'velabrum-river': ['temple-castor-pollux', 'forum-boarium', 'portus-tiberinus', 'temple-aesculapius'],
  campus: ['theatre-marcellus', 'largo-argentina-temples', 'pantheon', 'saepta-julia'],
  aventine: ['circus-maximus', 'temple-diana-aventine', 'emporium'],
};
const routeNames = args.routes ? String(args.routes).split(',') : Object.keys(ROUTES);

const { createServer } = await import('vite');
const port = await freePort();
const server = await createServer({ root, logLevel: 'error', server: { port, strictPort: true, host: '127.0.0.1', hmr: false } });
await server.listen();
const url = `http://127.0.0.1:${port}/?scene=rome&quick=1&hour=11&audit=1`;

const pw = await import('playwright');
const browser = await pw.chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));

const summary = { startedAt: new Date().toISOString(), url, stops: [], walks: [], totals: {} };
let code = 0;
try {
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__skyrome?.ready || window.__skyrome?.error, null, { timeout: Number(args.timeout ?? 240000), polling: 200 });
  const bootErr = await page.evaluate(() => window.__skyrome?.error);
  if (bootErr) throw new Error('Boot error: ' + bootErr);
  await page.waitForTimeout(2500);
  await page.addScriptTag({ content: pageScript });
  console.log(`ready in ${Date.now() - t0} ms  (${url})`);

  // ---- stops: the opening's route, every landmark location (deduped 25 m), nav-snapped.
  const stops = await page.evaluate(({ only }) => {
    const g = window.__skyrome.game;
    const nav = g.population?.nav;
    const out = [];
    const seen = [];
    const push = (id, x, z, look) => {
      const s = nav ? nav.snap(x, z, 30) : { x, z };
      if (seen.some((p) => Math.hypot(p.x - s.x, p.z - s.z) < 25)) return;
      seen.push(s);
      out.push({ id, x: s.x, z: s.z, look: look ?? [x, z] });
    };
    const route = ['porta-capena', 'circus-maximus', 'miliarium-aureum', 'temple-castor-pollux', 'ludus-magnus', 'meta-sudans', 'colosseum'];
    for (let i = 0; i + 1 < route.length; i++) {
      const a = g.locations.get(route[i])?.position, b = g.locations.get(route[i + 1])?.position;
      if (!a || !b) continue;
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      for (let s = 0; s < L; s += 45) push(`route:${route[i]}+${Math.round(s)}`, a.x + ((b.x - a.x) * s) / L, a.z + ((b.z - a.z) * s) / L, [b.x, b.z]);
    }
    for (const l of g.locations.all()) {
      if (!l.position) continue;
      push(l.id, l.position.x, l.position.z);
    }
    return only ? out.filter((s) => only.some((o) => s.id.startsWith(o))) : out;
  }, { only });
  console.log(`${stops.length} stops; modes ${modes.join(',')}; routes ${routeNames.join(',')}`);

  // ---- census and settle per stop
  if (modes.includes('census') || modes.includes('settle')) {
    let n = 0;
    for (const s of stops.slice(0, maxStops)) {
      if (Date.now() > deadline) {
        console.log(`time is up after ${n} stops`);
        break;
      }
      n++;
      const rec = { id: s.id, x: +s.x.toFixed(1), z: +s.z.toFixed(1) };
      await page.evaluate(({ x, z }) => {
        const g = window.__skyrome.game;
        g.player.teleport({ x, y: g.heightmap.heightAt(x, z) + 0.4, z }, 0);
      }, s);
      await page.waitForTimeout(modes.includes('settle') ? 400 : 1500);
      if (modes.includes('settle')) {
        rec.settle = await page.evaluate(({ look }) => window.__surf.settle(2500, look), s);
        rec.settle.series = undefined; // keep the JSON small: the peak, the settle time and the events stay
        rec.settle.events = rec.settle.events.slice(0, 40);
      }
      if (modes.includes('census')) {
        rec.census = await page.evaluate(({ x, z, r }) => window.__surf.census(x, z, r), { x: s.x, z: s.z, r: radius });
        rec.y = await page.evaluate(({ x, z }) => +window.__surf.groundY(x, z).toFixed(2), s);
      }
      summary.stops.push(rec);
      if (n % 10 === 0) console.log(`  ${n}/${Math.min(stops.length, maxStops)} stops`);
    }
  }

  // ---- walks
  if (modes.includes('walk')) {
    for (const name of routeNames) {
      if (Date.now() > deadline) {
        console.log('time is up before the walks finished');
        break;
      }
      const ids = ROUTES[name];
      if (!ids) continue;
      const pts = await page.evaluate((ids) => {
        const g = window.__skyrome.game;
        const S = g.streets;
        const nav = g.population?.nav;
        const P = ids.map((id) => g.locations.get(id)?.position).filter(Boolean).map((p) => (nav ? [nav.snap(p.x, p.z, 30).x, nav.snap(p.x, p.z, 30).z] : [p.x, p.z]));
        if (P.length < 2 || !S) return P;
        // Dijkstra over the street graph between the nearest nodes of consecutive landmarks.
        const path = (a, b) => {
          const na = S.nearest(a[0], a[1], 80), nb = S.nearest(b[0], b[1], 80);
          if (na < 0 || nb < 0) return [a, b];
          const dist = new Map([[na, 0]]), prev = new Map();
          const open = [na];
          while (open.length) {
            let bi = 0;
            for (let i = 1; i < open.length; i++) if (dist.get(open[i]) < dist.get(open[bi])) bi = i;
            const u = open.splice(bi, 1)[0];
            if (u === nb) break;
            const un = S.nodes[u];
            for (const [v] of S.neighbours(u)) {
              const vn = S.nodes[v];
              if (vn.kind === 'landmark' && v !== nb) continue; // inside a monument: not a street
              const d = dist.get(u) + Math.hypot(vn.x - un.x, vn.z - un.z);
              if (d < (dist.get(v) ?? Infinity)) {
                dist.set(v, d);
                prev.set(v, u);
                if (!open.includes(v)) open.push(v);
              }
            }
          }
          if (!dist.has(nb)) return [a, b];
          const out = [];
          for (let u = nb; u !== undefined; u = prev.get(u)) out.push([S.nodes[u].x, S.nodes[u].z]);
          return out.reverse();
        };
        let pts = [];
        for (let i = 0; i + 1 < P.length; i++) {
          const seg = path(P[i], P[i + 1]);
          pts = pts.length ? pts.concat(seg.slice(1)) : seg;
        }
        // G0 tool fix: street-graph nodes can sit inside a wall; snap every waypoint to a nav cell, and where
        // the straight line to the next one is not walkable re-route through the nav grid (so a "spike" in
        // the walk is a pop, not the camera going through a wall).
        if (nav) {
          const sn = pts.map(([x, z]) => {
            const q = nav.snap(x, z, 30);
            return [q.x, q.z];
          });
          const out = [sn[0]];
          for (let i = 1; i < sn.length; i++) {
            const a = out[out.length - 1], b = sn[i];
            let via = null;
            const gr = nav.grid;
            try {
              if (gr && gr.ready(a[0], a[1]) && gr.ready(b[0], b[1]) && !gr.lineClear(a[0], a[1], b[0], b[1])) via = gr.findPath(a[0], a[1], b[0], b[1], 6000);
            } catch {
              via = null;
            }
            if (via && via.length > 1) for (const q of via.slice(1)) out.push([q.x, q.z]);
            else out.push(b);
          }
          return out;
        }
        return pts;
      }, ids);
      const length = pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
      console.log(`walk ${name}: ${pts.length} waypoints, ${length.toFixed(0)} m`);
      const r = await page.evaluate(({ pts }) => window.__surf.walk(pts, { speed: 4.4, sampleMs: 150, maxMs: 200000 }), { pts });
      const strip = r.strip;
      delete r.strip;
      writeFileSync(join(outDir, `walk-${name}-strip.png`), Buffer.from(strip.split(',')[1], 'base64'));
      for (const [i, png] of Object.entries(r.spikeStrips ?? {})) writeFileSync(join(outDir, `walk-${name}-spike-${i}.png`), Buffer.from(png.split(',')[1], 'base64'));
      delete r.spikeStrips;
      const byKind = {};
      for (const e of r.events) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
      summary.walks.push({ name, ids, waypoints: pts.length, length: +length.toFixed(0), frames: r.frames, clean: r.clean, median: r.median, medianFar: r.medianFar, spikes: r.spikes.slice(0, 12), events: r.events.slice(0, 400), byKind, series: r.series });
      console.log(`  ${r.frames} frames (${r.clean} clean), median change ${(r.median * 100).toFixed(1)} % (far band ${(r.medianFar * 100).toFixed(1)} %), ${r.spikes.length} spikes; events ${JSON.stringify(byKind)}`);
    }
  }

  // ---- report
  const stopsC = summary.stops.filter((s) => s.census);
  const seamBy = new Map();
  const twinBy = new Map();
  let holesN = 0, holesArea = 0, sliversN = 0, seamLen = 0, built = 0, uncovered = 0;
  for (const s of stopsC) {
    const c = s.census;
    holesN += c.holesN;
    holesArea += c.holesArea;
    sliversN += c.sliversN;
    seamLen += c.seamLen;
    built += c.built;
    uncovered += c.uncoveredUrban;
    for (const r of c.seams) {
      const e = seamBy.get(r.pair) ?? { pair: r.pair, len: 0, stops: 0, contrast: r.contrast, tileRatio: r.tileRatio, a: r.a, b: r.b, ex: null, srcs: {} };
      e.len += r.len;
      e.stops++;
      for (const sr of r.srcs) e.srcs[sr.replace(/ ×\d+$/, '')] = (e.srcs[sr.replace(/ ×\d+$/, '')] ?? 0) + Number(sr.match(/×(\d+)$/)?.[1] ?? 1);
      if (!e.ex || r.len > e.ex.len) e.ex = { stop: s.id, at: r.at, len: r.len };
      seamBy.set(r.pair, e);
    }
    for (const r of c.twins) {
      const e = twinBy.get(r.pair) ?? { pair: r.pair, len: 0, stops: 0, contrast: r.contrast, tileRatio: r.tileRatio, ex: null };
      e.len += r.len;
      e.stops++;
      if (!e.ex || r.len > e.ex.len) e.ex = { stop: s.id, at: r.at, len: r.len };
      twinBy.set(r.pair, e);
    }
  }
  const seams = [...seamBy.values()].map((e) => ({ ...e, srcs: Object.entries(e.srcs).sort((a, b) => b[1] - a[1]).slice(0, 3) })).sort((a, b) => b.len - a.len);
  const twins = [...twinBy.values()].sort((a, b) => b.len - a.len);
  const holes = stopsC.flatMap((s) => s.census.holes.map((h) => ({ ...h, stop: s.id }))).sort((a, b) => b.area - a.area);
  const slivers = stopsC.flatMap((s) => s.census.slivers.map((h) => ({ ...h, stop: s.id })));
  const patchy = stopsC.map((s) => ({ stop: s.id, patchwork: s.census.patchwork, regions: s.census.regions, built: s.census.built, at: [s.x, s.z] })).sort((a, b) => b.patchwork - a.patchwork);
  const settles = summary.stops.filter((s) => s.settle).map((s) => ({ stop: s.id, at: [s.x, s.z], peak: s.settle.peak, settledAt: s.settle.settledAt, events: s.settle.events.length, kinds: countKinds(s.settle.events) })).sort((a, b) => b.peak.all - a.peak.all);
  summary.totals = { stops: summary.stops.length, censusStops: stopsC.length, builtCells: built, seamLen, patchwork: +((seamLen * 100) / Math.max(1, built)).toFixed(1), holesN, holesArea, sliversN, uncoveredUrban: uncovered, seamPairs: seams.length, twinPairs: twins.length, settleStops: settles.length, settlePopping: settles.filter((s) => s.peak.all > 0.01).length, walks: summary.walks.length, walkSpikes: summary.walks.reduce((n, w) => n + w.spikes.length, 0) };
  summary.ranked = { seams: seams.slice(0, 30), twins: twins.slice(0, 15), holes: holes.slice(0, 30), slivers: slivers.slice(0, 30), patchy: patchy.slice(0, 20), settles: settles.slice(0, 30) };
  summary.pageErrors = errors.slice(0, 20);

  console.log(`\n== totals: ${JSON.stringify(summary.totals)}`);
  if (seams.length) {
    console.log(`\n== seams between different ground materials (m of 1 m-cell boundary over all stops), by pair`);
    for (const e of seams.slice(0, 25)) console.log(`  ${String(e.len).padStart(6)} m ×${String(e.stops).padEnd(3)} ${e.pair}   contrast ${e.contrast}  tile ×${e.tileRatio}   e.g. @${e.ex.at.join(',')} (${e.ex.stop})   ${e.srcs.map(([s, c]) => `${s} ×${c}`).join('; ')}`);
  }
  if (twins.length) {
    console.log(`\n== twins: the same material drawn by the terrain and by a mesh side by side`);
    for (const e of twins.slice(0, 10)) console.log(`  ${String(e.len).padStart(6)} m ×${String(e.stops).padEnd(3)} ${e.pair}   contrast ${e.contrast}  tile ×${e.tileRatio}   e.g. @${e.ex.at.join(',')} (${e.ex.stop})`);
  }
  if (holes.length) {
    console.log(`\n== holes: terrain showing inside the paving/cover (${holesN} holes, ${holesArea} m²)`);
    for (const h of holes.slice(0, 12)) console.log(`  ${String(h.area).padStart(4)} m²  ${h.key}  @${h.at.join(',')} (${h.stop})`);
  }
  if (patchy.length) {
    console.log(`\n== patchwork index (seam m per 100 m² built), worst stops`);
    for (const h of patchy.slice(0, 12)) console.log(`  ${String(h.patchwork).padStart(6)}  regions ${String(h.regions).padStart(4)}  built ${String(h.built).padStart(5)} m²  ${h.stop} @${h.at.join(',')}`);
  }
  if (settles.length) {
    console.log(`\n== settle: pixels still changing after arrival (peak fraction of the frame), worst stops`);
    for (const s of settles.slice(0, 12)) console.log(`  ${(s.peak.all * 100).toFixed(1).padStart(5)} % at ${s.peak.t}s (ground ${(s.peak.low * 100).toFixed(1)} %), quiet after ${s.settledAt}s  ${s.stop} @${s.at.join(',')}  ${JSON.stringify(s.kinds)}`);
  }
  for (const w of summary.walks) {
    console.log(`\n== walk ${w.name} (${w.length} m): median change ${(w.median * 100).toFixed(1)} % (far band ${(w.medianFar * 100).toFixed(1)} %); spikes:`);
    for (const s of w.spikes.slice(0, 8)) console.log(`  frame ${s.i} t=${s.t}s @${s.x},${s.z}: far ${(s.far * 100).toFixed(1)} %, all ${(s.all * 100).toFixed(1)} % (ground ${(s.low * 100).toFixed(1)} %)   ${nearEvents(w.events, s.t)}`);
  }

  // ---- screenshots of the worst cases
  const shot = async (name, pos, at) => {
    await page.evaluate(({ pos, at }) => window.__surf.look(pos, at), { pos, at });
    await page.waitForTimeout(350);
    const p = join(outDir, name);
    await page.screenshot({ path: p });
    return p;
  };
  const visit = async (x, z) => {
    await page.evaluate(({ x, z }) => {
      const g = window.__skyrome.game;
      g.player.teleport({ x, y: g.heightmap.heightAt(x, z) + 0.4, z }, 0);
    }, { x, z });
    await page.waitForTimeout(1800);
    return page.evaluate(({ x, z }) => window.__surf.groundY(x, z), { x, z });
  };
  const shots = {};
  const spotShots = async (kind, items, nameOf) => {
    let i = 0;
    for (const it of items.slice(0, shotsPer)) {
      if (Date.now() > deadline + 5 * 60000) break;
      const [x, z] = it.at;
      await visit(x, z);
      // Eye level from the first of eight directions with no wall between the eye and the spot.
      const cam = await page.evaluate(({ x, z }) => {
        const S = window.__surf;
        const yy = S.groundY(x, z);
        for (let k = 0; k < 8; k++) {
          const a = (k * Math.PI) / 4;
          const ex = x + Math.cos(a) * 4.5, ez = z + Math.sin(a) * 4.5;
          const ey = S.groundY(ex, ez) + 1.6;
          if (Math.abs(ey - 1.6 - yy) > 2.5) continue;
          if (S.blocked([ex, ey, ez], [x - ex, yy + 0.3 - ey, z - ez], 4.4) || S.blocked([ex, ey, ez], [0, 1, 0], 2.5)) continue;
          return { eye: [ex, ey, ez], at: [x, yy + 0.1, z], yy };
        }
        return { eye: [x + 1.5, yy + 2.2, z + 1.5], at: [x, yy, z], yy };
      }, { x, z });
      const name = `${kind}-${++i}`;
      shots[name] = {
        eye: await shot(`${name}-eye.png`, cam.eye, cam.at),
        above: await shot(`${name}-above.png`, [x + 0.3, cam.yy + 8, z + 0.3], [x, cam.yy, z]),
        what: nameOf(it),
      };
      console.log(`shot ${name}: ${nameOf(it)}`);
    }
  };
  if (modes.includes('census')) {
    await spotShots('seam', seams.map((e) => ({ ...e, at: e.ex.at })), (e) => `${e.pair} @${e.ex.at.join(',')} (${e.ex.stop})`);
    await spotShots('twin', twins.map((e) => ({ ...e, at: e.ex.at })), (e) => `${e.pair} @${e.ex.at.join(',')} (${e.ex.stop})`);
    await spotShots('hole', holes, (h) => `${h.key} ${h.area} m² @${h.at.join(',')} (${h.stop})`);
  }
  if (modes.includes('settle')) {
    let i = 0;
    for (const s of settles.slice(0, Math.min(shotsPer, 6))) {
      if (s.peak.all < 0.01) break;
      const stop = summary.stops.find((q) => q.id === s.stop);
      const name = `settle-${++i}`;
      // Arrive again: a frame right after the teleport, and one after the city has settled.
      await page.evaluate(({ x, z }) => {
        const g = window.__skyrome.game;
        g.player.teleport({ x: x + 60, y: g.heightmap.heightAt(x + 60, z) + 0.4, z }, 0);
      }, stop);
      await page.waitForTimeout(1500);
      await page.evaluate(({ x, z }) => {
        const g = window.__skyrome.game;
        g.player.teleport({ x, y: g.heightmap.heightAt(x, z) + 0.4, z }, 0);
      }, stop);
      const look = stops.find((q) => q.id === s.stop)?.look ?? [stop.x + 20, stop.z];
      const eye = stop.settle.eye;
      await page.evaluate(({ eye, look }) => window.__surf.look(eye, [look[0], eye[1] - 2, look[1]]), { eye, look });
      await page.waitForTimeout(120);
      const a = join(outDir, `${name}-arrive.png`);
      await page.screenshot({ path: a });
      await page.waitForTimeout(3000);
      const b = join(outDir, `${name}-settled.png`);
      await page.screenshot({ path: b });
      shots[name] = { arrive: a, settled: b, what: `${s.stop} peak ${(s.peak.all * 100).toFixed(1)} % at ${s.peak.t}s` };
      console.log(`shot ${name}: ${shots[name].what}`);
    }
  }
  summary.shots = shots;
  writeFileSync(jsonPath, JSON.stringify(summary, null, 1));
  console.log(`\nJSON: ${jsonPath} (${(Buffer.byteLength(JSON.stringify(summary)) / 1024).toFixed(0)} KB); shots in ${outDir}`);
} catch (e) {
  code = 1;
  console.error('FAILED:', e.stack ?? e.message);
} finally {
  if (errors.length) console.log('page errors:\n  ' + errors.slice(0, 10).join('\n  '));
  await browser.close();
  await server.close();
  process.exit(code);
}

function countKinds(events) {
  const out = {};
  for (const e of events) out[e.kind] = (out[e.kind] ?? 0) + 1;
  return out;
}
function nearEvents(events, t) {
  const near = events.filter((e) => Math.abs(e.t - t) <= 0.35);
  const kinds = countKinds(near);
  const ex = near.slice(0, 3).map((e) => `${e.kind}${e.id ? ':' + e.id : ''} ${e.from ?? ''}→${e.to ?? ''}${e.d !== undefined ? ' @' + e.d + 'm' : ''}`);
  return `${JSON.stringify(kinds)} ${ex.join(' | ')}`;
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
