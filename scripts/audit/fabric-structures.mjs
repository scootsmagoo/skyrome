#!/usr/bin/env node
/**
 * Structures-on-the-ground audit (phase 4 "solid ground", lens 1): do the city's buildings,
 * landmarks and their podia, walls, gates, aqueduct piers, monuments and stairs meet the ground?
 *
 * It boots the game with the geometry audit on (`?audit`: src/dev/audit/geomAudit.ts keeps a copy of
 * the up-facing and the steep faces of every MeshBuilder build) and sweeps the whole playable city,
 * structure by structure, without teleporting:
 *
 *   1. massing  (pure) every far-massing box of every block (city/massing.ts `lotMass`): the terrain
 *               every 0.5 m along its four edges against its base; also as the terrain is drawn
 *               beyond 205 m and 614 m (CDLOD levels 1 and 2: a 4 / 8 m grid, sunk 0.16 / 0.32 m).
 *   2. structures, in 128 m tiles (so the street cells round each are built once):
 *        blocks     every block of the detail area is generated in isolation at full detail (the
 *                   streamer's own `fillUnits`, named `audit:blk:<id>`), with the street cells round
 *                   it (`audit:cell:<key>`) as its ground, measured, then forgotten;
 *        landmarks  every landmark built at boot (records `<id>:…`);
 *        monuments  the Servian wall, gates and aqueduct arcades (`city:mon:<chunk>`, built at boot);
 *        river      the quays, Tiber Island's facing and the bridges (water module, built at boot);
 *        stairs     the street flights of every cell (`street-stairs:*`, `stairs-road:*`).
 *      `analyzeFeet` walks the bottom edge of every wall, riser, podium side and slab side every
 *      0.75 m: `floating` (the edge hangs above the ground just outside, no part of the structure
 *      stands in the gap within reach and nothing hides the void), `buried-opening` (the ground
 *      outside stands above the floor inside where the wall is open: doorways, shop mouths) and
 *      `terrain-in-floor` (the drawn terrain pokes through a floor, tread or podium top).
 *   3. screenshots of the worst cases of each class (teleport, let the city stream in, frame the
 *      foot from the clearest side) into .shots/audit/structures/.
 *
 *   node scripts/audit/structures.mjs [--passes massing,blocks,landmarks,monuments,river,stairs]
 *        [--only <id-substring,…> (landmarks and blocks; with --only-all monuments, river and stairs too)] [--max-blocks N] [--levels full,low] [--minutes 45] [--shots 4] [--no-shots]
 *        [--json scripts/audit/out/structures.json]
 *   node scripts/audit/structures.mjs --look "x,y,z[,name[,dist[,eye[,nx:nz]]]];…"   framed screenshots of spots
 *        (with nx:nz the camera stands outside along that normal, eye `eye` m over the gap's middle)
 *   node scripts/audit/structures.mjs --probe x,z[,r]         the faces and findings at a spot (streamed city)
 *
 * The whole city takes about 15–30 minutes (most of it generating ~1500 blocks at full detail),
 * plus about 20 s per screenshot. The game loop is capped at 3 fps while it measures (the GPU is shared).
 */
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = parseArgs(process.argv.slice(2));
const minutes = Number(args.minutes ?? 45);
const shotsPer = args['no-shots'] ? 0 : Number(args.shots ?? 4);
const passes = new Set(String(args.passes ?? 'massing,blocks,landmarks,monuments,river,stairs').split(','));
const only = args.only ? String(args.only).split(',') : null;
const maxBlocks = Number(args['max-blocks'] ?? 1e9);
const levels = String(args.levels ?? 'full').split(',');
const jsonOut = resolve(root, args.json ?? 'scripts/audit/out/structures.json');
const shotDir = resolve(root, '.shots/audit/structures');
mkdirSync(shotDir, { recursive: true });
mkdirSync(dirname(jsonOut), { recursive: true });
const t0 = Date.now();
const deadline = t0 + minutes * 60_000;
const secs = () => Math.round((Date.now() - t0) / 1000);

const { createServer } = await import('vite');
const port = await freePort();
const server = await createServer({ root, logLevel: 'error', server: { port, strictPort: true, host: '127.0.0.1', hmr: false } });
await server.listen();
const url = `http://127.0.0.1:${port}/?scene=rome&quick=1&hour=11&audit=1`;

const pw = await import('playwright');
const browser = await pw.chromium.launch({ headless: true, args: [...(process.platform === 'darwin' ? ['--use-angle=metal'] : ['--use-angle=vulkan', '--enable-features=Vulkan']), '--enable-gpu', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=8192'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));
page.on('console', (m) => { if (m.type() === 'error' && errors.length < 50) errors.push(`console: ${m.text().slice(0, 300)}`); });

let code = 0;
try {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__skyrome?.ready || window.__skyrome?.error, null, { timeout: 300000, polling: 250 });
  const bootErr = await page.evaluate(() => window.__skyrome?.error);
  if (bootErr) throw new Error(`boot failed: ${bootErr}`);
  console.log(`booted in ${secs()} s`);
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelectorAll('.ui-root').forEach((e) => (e.style.visibility = 'hidden')));

  if (args.look) {
    // --look "x,y,z[,name[,dist[,height]]];…": framed screenshots of spots (a finding's foot point), for confirming cases.
    await installCam(page);
    for (const spec of String(args.look).split(';')) {
      const [lx, ly, lz, lname, ld, lh, lo] = spec.split(',');
      const out = lo ? lo.split(':').map(Number) : undefined;
      const info = await frame(page, Number(lx), Number(ly), Number(lz), ld ? Number(ld) : undefined, lh ? Number(lh) : undefined, out);
      const p = join(shotDir, `${lname || 'look'}.png`);
      await page.screenshot({ path: p });
      console.log(`shot ${p} from ${JSON.stringify(info)}`);
    }
    throw new Error('done');
  }

  if (args.probe) {
    // --probe "x,z[,r];…": teleport there, let the city stream in, measure everything within r (default 6 m) and dump the faces at the point.
    for (const spec of String(args.probe).split(';')) {
    const [px, pz, pr] = spec.split(',').map(Number);
    console.log(`\n### probe ${px},${pz}`);
    const res = await page.evaluate(async ({ px, pz, pr }) => {
      const g = window.__skyrome.game;
      g.player.teleport({ x: px + 3, y: g.heightmap.heightAt(px + 3, pz + 3) + 0.5, z: pz + 3 }, 0);
      await new Promise((r) => setTimeout(r, 3000));
      const H = (a, b) => g.heightmap.heightAt(a, b);
      const { findings, totals } = window.__audit.analyzeFeet(px, pz, pr || 6, H, {});
      return { findings: findings.slice(0, 12), totals, faces: window.__audit.auditFacesNear(px, pz, 0.45, 40), terrain: H(px, pz), surfaces: window.__audit.surfacesAt(px, pz).slice(0, 8) };
    }, { px, pz, pr });
    console.log(`terrain ${res.terrain.toFixed(2)}; surfaces at the point:`, JSON.stringify(res.surfaces));
    console.log('faces within 0.45 m (lowest first):');
    for (const f of res.faces) console.log(`  ${f.steep ? 'steep' : 'up   '} ${f.minY.toFixed(2)}..${f.maxY.toFixed(2)}  ${f.mat.padEnd(16)} ${f.name} ${f.src}  ${JSON.stringify(f.tri)}`);
    console.log('totals:', JSON.stringify(res.totals));
    for (const f of res.findings) console.log(`  ${f.kind} ${f.depth} m (drawn ${f.depthVis}) ${f.length} m ${f.mat} ${f.name} ${f.src} @${f.at.join(',')} ground=${f.ground}(${f.groundMat}) terrain=${f.terrain}${f.floor !== undefined ? ` floor=${f.floor}(${f.floorMat})` : ''}`);
    }
    throw new Error('done');
  }

  // Measuring: the loop at 3 fps (the sweep's own evaluate calls block it anyway).
  await page.evaluate(() => window.__skyrome.game.capFps('audit', 3));

  // ---- page-side helpers
  await page.evaluate(async () => {
    const g = window.__skyrome.game;
    const fill = await import('/src/world/city/fill.ts');
    const { MeshBuilder } = await import('/src/gfx/MeshBuilder.ts');
    const A = window.__audit;
    const streamer = g.city.streamer;
    const H = (x, z) => g.heightmap.heightAt(x, z);
    const sm = (e0, e1, v) => { const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
    const visualDrop = (a, b) => { const i = g.terrain.inputAt(a, b); return 0.09 * Math.max(sm(0.75, -0.25, i.roadSd), sm(0.75, -0.25, i.padSd)); };
    const waterAt = (a, b) => g.water?.levelAt?.(a, b) ?? null;
    // The streamed city (blocks, cells, props) duplicates what the sweep builds itself: left out.
    const ignore = (name) => /^city:(?!mon:)/.test(name) || /#\d+$/.test(name);
    const disposeGroup = (grp) => grp.traverse((o) => o.geometry?.dispose?.());
    const cells = new Map(); // key -> CellRec
    for (const c of streamer.cells) cells.set(c.work.key, c);
    const built = new Map(); // key -> insertion order
    let order = 0;
    const cellsIn = (box) => streamer.cells.filter((c) => !(c.bounds.maxX < box[0] || c.bounds.minX > box[1] || c.bounds.maxZ < box[2] || c.bounds.minZ > box[3]));
    const ensureCells = (box) => {
      const need = cellsIn(box);
      let ms = 0;
      for (const c of need) {
        if (built.has(c.work.key)) { built.set(c.work.key, ++order); continue; }
        const T = performance.now();
        const b = new MeshBuilder();
        for (const it of c.work.items) { try { it(b); } catch (err) { console.warn('[audit] street item failed', c.work.key, err); } }
        disposeGroup(b.build(`audit:cell:${c.work.key}`));
        built.set(c.work.key, ++order);
        ms += performance.now() - T;
      }
      // Keep the 24 most recently used cells (each holds its street surfaces).
      if (built.size > 24) {
        const keep = new Set(need.map((c) => c.work.key));
        const old = [...built.entries()].filter(([k]) => !keep.has(k)).sort((a, b) => a[1] - b[1]).slice(0, built.size - 24);
        for (const [k] of old) { A.auditForget((n) => n === `audit:cell:${k}`); built.delete(k); }
      }
      return ms;
    };
    const blockRec = new Map(streamer.blocks.map((r) => [r.blk.id, r]));
    const inObb = (o, x, z, m) => { const dx = x - o.c[0], dz = z - o.c[1]; const lu = dx * o.u[0] + dz * o.u[1], lv = dx * o.v[0] + dz * o.v[1]; return Math.abs(lu) <= o.hu + m && Math.abs(lv) <= o.hv + m; };
    const lotAt = (rec, x, z) => {
      for (const p of rec.layout.lots) if (p.kind !== 'alley' && inObb(p.obb, x, z, 0.7)) return { kind: p.kind, lot: p.id };
      for (const b of rec.layout.back) if (inObb(b.obb, x, z, 0.7)) return { kind: 'back-insula', lot: b.id };
      for (const w of rec.layout.walls) { const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1; const ux = (w.b[0] - w.a[0]) / L, uz = (w.b[1] - w.a[1]) / L; const dx = x - w.a[0], dz = z - w.a[1]; const t = dx * ux + dz * uz; if (t > -0.8 && t < L + 0.8 && Math.abs(dx * -uz + dz * ux) < 1) return { kind: 'compound-wall', lot: null }; }
      return { kind: 'yard', lot: null };
    };
    // Feet of a block are measured along its buildings' outlines (lots, back insulae, compound walls).
    const onOutline = (rec, x, z) => {
      const edge = (o) => {
        const dx = x - o.c[0], dz = z - o.c[1];
        const lu = Math.abs(dx * o.u[0] + dz * o.u[1]), lv = Math.abs(dx * o.v[0] + dz * o.v[1]);
        return lu <= o.hu + 0.8 && lv <= o.hv + 0.8 && (lu >= o.hu - 0.8 || lv >= o.hv - 0.8);
      };
      for (const p of rec.layout.lots) if (p.kind !== 'alley' && edge(p.obb)) return true;
      for (const b of rec.layout.back) if (edge(b.obb)) return true;
      for (const w of rec.layout.walls) { const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1; const ux = (w.b[0] - w.a[0]) / L, uz = (w.b[1] - w.a[1]) / L; const dx = x - w.a[0], dz = z - w.a[1]; const t = dx * ux + dz * uz; if (t > -1 && t < L + 1 && Math.abs(dx * -uz + dz * ux) < 1.2) return true; }
      return false;
    };
    const locs = g.locations.all().filter((l) => l.position);
    const place = (x, z) => {
      let best = null, bd = Infinity;
      for (const l of locs) { const d = Math.hypot(l.position.x - x, l.position.z - z) - (l.radius ?? 0); if (d < bd) { bd = d; best = l; } }
      return best ? `${best.name}${bd > 25 ? ` (+${Math.round(bd)} m)` : ''}` : '?';
    };
    // The terrain as drawn 205–614 m away (CDLOD level 1: a 4 m grid, sunk 0.16 m), for feet seen from afar.
    const hm = g.heightmap;
    const drawnL1 = (x, z) => {
      const s = hm.spacing * 2;
      const gx = (x - hm.minX) / s, gz = (z - hm.minZ) / s;
      const ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz;
      const at = (i, k) => H(hm.minX + i * s, hm.minZ + k * s);
      return (at(ix, iz) * (1 - fx) + at(ix + 1, iz) * fx) * (1 - fz) + (at(ix, iz + 1) * (1 - fx) + at(ix + 1, iz + 1) * fx) * fz - 0.04 * s - visualDrop(x, z);
    };
    const opts = { visualDrop, waterAt, ignore, farTerrain: drawnL1 };
    window.__sa = {
      /** The jobs: every detailed block, landmark, monument chunk and street cell, with its box. */
      jobs(only, onlyAll) {
        const out = [];
        for (const r of streamer.blocks) {
          if (!r.blk.detailed || !r.layout) continue;
          const xs = r.blk.outline.map((p) => p[0]), zs = r.blk.outline.map((p) => p[1]);
          out.push({ kind: 'block', id: r.blk.id, box: [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)], quarter: r.blk.quarter, region: r.blk.region });
        }
        const lmIds = new Set(g.landmarks.keys());
        for (const o of A.auditOwners((n) => !/^(city|audit|interior)/.test(n))) {
          if (!lmIds.has(o.owner)) continue;
          const lm = g.landmarks.get(o.owner).lm;
          out.push({ kind: 'landmark', id: o.owner, box: o.box, category: lm.category, name: lm.name });
        }
        for (const o of A.auditOwners((n) => n.startsWith('city:mon:'))) out.push({ kind: 'monument', id: o.owner, box: o.box });
        // The river's masonry (water module): quays, Tiber Island's facing, bridges.
        for (const o of A.auditOwners((n) => /^(quay|island|bridge)/.test(n))) if (!lmIds.has(o.owner)) out.push({ kind: 'river', id: o.owner, box: o.box });
        for (const c of streamer.cells) if (c.work.items.length) out.push({ kind: 'stairs', id: `cell:${c.work.key}`, key: c.work.key, box: [c.bounds.minX, c.bounds.maxX, c.bounds.minZ, c.bounds.maxZ] });
        const unknown = A.auditOwners((n) => !/^(city|audit|interior)/.test(n)).filter((o) => !lmIds.has(o.owner)).map((o) => ({ owner: o.owner, tris: o.tris }));
        const sel = only ? out.filter((j) => (!onlyAll && j.kind !== 'landmark' && j.kind !== 'block') || only.some((s) => j.id.includes(s) || (j.name ?? '').toLowerCase().includes(s))) : out;
        // 128 m tiles in serpentine order, so neighbouring jobs share their street cells.
        const T = 128;
        for (const j of sel) { j.cx = (j.box[0] + j.box[1]) / 2; j.cz = (j.box[2] + j.box[3]) / 2; j.tx = Math.floor(j.cx / T); j.tz = Math.floor(j.cz / T); }
        sel.sort((a, b) => a.tz - b.tz || (a.tz % 2 ? b.tx - a.tx : a.tx - b.tx));
        return { jobs: sel, unknown, landmarks: g.landmarks.size, cells: streamer.cells.length };
      },
      /** Run one job: build what it needs, measure it, tag the findings, forget what was built for it. */
      run(j, levels) {
        const T0 = performance.now();
        const pad = 6;
        const box = [j.box[0] - pad, j.box[1] + pad, j.box[2] - pad, j.box[3] + pad];
        const cellMs = ensureCells(box);
        let name = null, measure, measureFace, footAt;
        let genMs = 0;
        if (j.kind === 'block') {
          const rec = blockRec.get(j.id);
          name = `audit:blk:${j.id}`;
          const T = performance.now();
          for (const u of fill.fillUnits(rec.blk, rec.layout, 'full', H)) disposeGroup(u.builder.build(name));
          genMs = performance.now() - T;
          measure = (n) => n === name;
          footAt = (x, z) => onOutline(rec, x, z);
        } else if (j.kind === 'landmark' || j.kind === 'river') {
          measure = (n, o) => o === j.id;
        } else if (j.kind === 'monument') {
          measure = (n) => n === j.id;
        } else {
          measure = (n) => n === `audit:cell:${j.key}`;
          measureFace = (n, src) => /^(street-stairs|stairs-road)/.test(src);
        }
        const cx = (j.box[0] + j.box[1]) / 2, cz = (j.box[2] + j.box[3]) / 2;
        const r = Math.max(j.box[1] - j.box[0], j.box[3] - j.box[2]) / 2 + 2;
        const T1 = performance.now();
        const res = A.analyzeFeet(cx, cz, r, H, { ...opts, measure, measureFace, footAt });
        const anaMs = performance.now() - T1;
        const rec = j.kind === 'block' ? blockRec.get(j.id) : null;
        for (const f of res.findings) {
          f.place = place(f.at[0], f.at[2]);
          f.job = j.id;
          if (rec) {
            const lot = lotAt(rec, f.at[0], f.at[2]);
            f.type = `block:${lot.kind}`;
            f.lot = lot.lot;
          } else if (j.kind === 'landmark') f.type = `landmark:${j.category}`;
          else if (j.kind === 'river') f.type = `river:${j.id}`;
          else if (j.kind === 'monument') f.type = 'monument';
          else f.type = 'street-stairs';
        }
        // Per-lot tally for blocks (structures with a floating / buried stretch).
        let lots = null;
        if (rec) {
          lots = { built: rec.layout.lots.filter((p) => p.kind !== 'alley' && p.kind !== 'piazza').length + rec.layout.back.length, floating: new Set(), buried: new Set(), sunk: new Set() };
          for (const f of res.findings) {
            const k = f.lot ?? f.type;
            if (f.kind === 'floating') lots.floating.add(k);
            else if (f.kind === 'buried-opening') lots.buried.add(k);
            else lots.sunk.add(k);
          }
          lots = { built: lots.built, floating: lots.floating.size, buried: lots.buried.size, sunk: lots.sunk.size };
        }
        if (name) A.auditForget((n) => n === name);
        // The low level (85–140 m: flat walls, openings painted on) of the same block, measured the same way.
        let low = null;
        if (rec && levels.includes('low')) {
          const nl = `audit:blkl:${j.id}`;
          for (const u of fill.fillUnits(rec.blk, rec.layout, 'low', H)) disposeGroup(u.builder.build(nl));
          const rl = A.analyzeFeet(cx, cz, r, H, { ...opts, measure: (n) => n === nl, footAt });
          A.auditForget((n) => n === nl);
          low = { totals: rl.totals, findings: rl.findings.map((f) => { const lot = lotAt(rec, f.at[0], f.at[2]); return { ...f, place: place(f.at[0], f.at[2]), job: j.id, type: `block-low:${lot.kind}`, lot: lot.lot }; }) };
        }
        return { low, findings: res.findings, totals: res.totals, owners: res.owners, lots, cellsBuilt: built.size, ms: { cell: Math.round(cellMs), gen: Math.round(genMs), analyze: Math.round(anaMs), all: Math.round(performance.now() - T0) } };
      },
    };
  });

  const report = { generated: new Date().toISOString(), args: { passes: [...passes], only, maxBlocks, minutes, levels }, massing: null, jobs: {}, totals: {}, byType: {}, findings: [], unknownOwners: [], pageErrors: [] };

  // ---- 1. massing pass (pure)
  if (passes.has('massing')) {
    report.massing = await page.evaluate(() => {
      const g = window.__skyrome.game;
      const hm = g.heightmap;
      const H = (x, z) => hm.heightAt(x, z);
      // The terrain as drawn at CDLOD level L: the heightmap on a grid 2^L times coarser, sunk 0.04 m per metre of grid.
      const drawn = (x, z, L) => {
        if (!L) return H(x, z);
        const s = hm.spacing * 2 ** L;
        const gx = (x - hm.minX) / s, gz = (z - hm.minZ) / s;
        const ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz;
        const at = (i, k) => H(hm.minX + i * s, hm.minZ + k * s);
        const y = (at(ix, iz) * (1 - fx) + at(ix + 1, iz) * fx) * (1 - fz) + (at(ix, iz + 1) * (1 - fx) + at(ix + 1, iz + 1) * fx) * fz;
        return y - Math.min(3, 0.04 * s);
      };
      const out = [];
      let boxes = 0, detailedBoxes = 0;
      const far = { L1: 0, L2: 0, L1major: 0, L2major: 0, L1over1: 0, L2over1: 0 };
      for (const r of g.city.streamer.blocks) {
        if (!r.layout) continue;
        for (const m of r.layout.masses) {
          boxes++;
          if (r.blk.detailed) detailedBoxes++;
          const { c, u, v, hu, hv } = m.obb;
          const at = (lx, lz) => [c[0] + u[0] * lx + v[0] * lz, c[1] + u[1] * lx + v[1] * lz];
          let minH = Infinity, maxH = -Infinity, worst = null, min1 = Infinity, min2 = Infinity;
          const edges = [[[-hu, -hv], [hu, -hv]], [[hu, -hv], [hu, hv]], [[hu, hv], [-hu, hv]], [[-hu, hv], [-hu, -hv]]];
          for (const [a, b] of edges) {
            const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
            const n = Math.max(2, Math.ceil(L / 0.5));
            for (let i = 0; i <= n; i++) {
              const s = i / n;
              const [x, z] = at(a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s);
              const h = H(x, z);
              if (h < minH) { minH = h; worst = [x, z]; }
              if (h > maxH) maxH = h;
              min1 = Math.min(min1, drawn(x, z, 1));
              min2 = Math.min(min2, drawn(x, z, 2));
            }
          }
          const gap = m.base - minH;
          if (m.base - min1 > 0.1) far.L1++;
          if (m.base - min2 > 0.1) far.L2++;
          if (m.base - min1 > 0.3) far.L1major++;
          if (m.base - min2 > 0.3) far.L2major++;
          if (m.base - min1 > 1) far.L1over1++;
          if (m.base - min2 > 1) far.L2over1++;
          const kind = hv <= 0.25 ? 'compound-wall' : m.windows.every((w) => !w) && m.eave - m.floorY <= 7.3 ? 'domus/horrea' : 'insula/shops';
          if (gap > 0.1 || m.base - min2 > 0.3) out.push({ block: r.blk.id, detailed: r.blk.detailed, kind, gap: +gap.toFixed(2), gapL1: +(m.base - min1).toFixed(2), gapL2: +(m.base - min2).toFixed(2), base: +m.base.toFixed(2), terrainMin: +minH.toFixed(2), terrainMax: +maxH.toFixed(2), at: [+worst[0].toFixed(1), +m.base.toFixed(2), +worst[1].toFixed(1)], size: [+(2 * hu).toFixed(1), +(2 * hv).toFixed(1)] });
        }
      }
      out.sort((a, b) => b.gap - a.gap);
      const near = out.filter((o) => o.gap > 0.1);
      return { boxes, detailedBoxes, floating: near.length, floatingFar: near.filter((o) => !o.detailed).length, major: near.filter((o) => o.gap > 0.3).length, drawn: far, worst: near.slice(0, 60), worstDrawn: out.sort((a, b) => b.gapL2 - a.gapL2).slice(0, 30) };
    });
    const ms = report.massing;
    console.log(`massing: ${ms.boxes} boxes (${ms.detailedBoxes} in detailed blocks): ${ms.floating} with the base above the terrain somewhere along an edge (> 0.1 m; ${ms.major} > 0.3 m), ${ms.floatingFar} outside the detail area`);
    console.log(`  as drawn: ${ms.drawn.L1} boxes float > 0.1 m beyond 205 m (${ms.drawn.L1major} > 0.3 m, ${ms.drawn.L1over1} > 1 m), ${ms.drawn.L2} beyond 614 m (${ms.drawn.L2major} > 0.3 m, ${ms.drawn.L2over1} > 1 m)`);
    for (const o of ms.worst.slice(0, 8)) console.log(`  ${o.gap.toFixed(2)} m  ${o.kind.padEnd(14)} ${o.detailed ? 'detailed' : 'far     '} @${o.at.join(',')} block ${o.block} ${o.size[0]}x${o.size[1]} m`);
  }

  // ---- 2. structures
  const { jobs, unknown, landmarks, cells } = await page.evaluate((only) => window.__sa.jobs(only[0], only[1]), [only, !!args['only-all']]);
  report.unknownOwners = unknown;
  const want = jobs.filter((j) => passes.has(j.kind === 'block' ? 'blocks' : j.kind === 'landmark' ? 'landmarks' : j.kind === 'monument' ? 'monuments' : j.kind === 'river' ? 'river' : 'stairs'));
  let nb = 0;
  const sel = want.filter((j) => j.kind !== 'block' || ++nb <= maxBlocks);
  const count = (k) => sel.filter((j) => j.kind === k).length;
  console.log(`${sel.length} jobs: ${count('block')} blocks, ${count('landmark')} landmarks (of ${landmarks}), ${count('monument')} monument chunks, ${count('river')} river structures, ${count('stairs')} street cells (of ${cells}); ${unknown.length} recorded owners that are not landmarks: ${unknown.slice(0, 12).map((u) => u.owner).join(', ')}`);
  const all = [];
  const totals = {};
  const lotTally = { built: 0, floating: 0, buried: 0, sunk: 0, blocks: 0, blocksFloating: 0 };
  const ownerRows = [];
  const ms = { cell: 0, gen: 0, analyze: 0 };
  let done = 0;
  let cellsLive = 0;
  const bump = (kind, t) => {
    const e = (totals[kind] ??= { jobs: 0, samples: 0, edges: 0, floating: 0, buriedOpening: 0, buriedWall: 0, buriedTop: 0, farFloat: 0, floorSamples: 0, sunkFloor: 0, skipped: { overhang: 0, water: 0, interior: 0, continues: 0, occluded: 0, enclosed: 0, inside: 0 } });
    e.jobs++;
    for (const k of ['samples', 'edges', 'floating', 'buriedOpening', 'buriedWall', 'buriedTop', 'farFloat', 'floorSamples', 'sunkFloor']) e[k] += t[k];
    for (const k of Object.keys(e.skipped)) e.skipped[k] += t.skipped[k];
  };
  for (let i = 0; i < sel.length; ) {
    if (Date.now() > deadline) { console.log(`time is up after ${done} of ${sel.length} jobs (--minutes ${minutes})`); break; }
    const batch = sel.slice(i, i + 8);
    i += batch.length;
    const res = await page.evaluate(({ batch, levels }) => batch.map((j) => {
      try { return window.__sa.run(j, levels); } catch (e) { return { error: String(e?.stack ?? e).slice(0, 400) }; }
    }), { batch, levels });
    res.forEach((r, k) => {
      const j = batch[k];
      done++;
      if (r.error) { console.log(`  ! ${j.kind} ${j.id}: ${r.error}`); errors.push(`${j.id}: ${r.error}`); return; }
      cellsLive = r.cellsBuilt;
      bump(j.kind, r.totals);
      if (r.low) { bump('block-low', r.low.totals); for (const f of r.low.findings) all.push(f); }
      for (const key of Object.keys(ms)) ms[key] += r.ms[key];
      for (const f of r.findings) all.push(f);
      if (r.lots) {
        lotTally.blocks++;
        lotTally.built += r.lots.built;
        lotTally.floating += r.lots.floating;
        lotTally.buried += r.lots.buried;
        lotTally.sunk += r.lots.sunk;
        if (r.lots.floating) lotTally.blocksFloating++;
      }
      if (j.kind !== 'block') for (const o of r.owners) ownerRows.push({ kind: j.kind, ...o, maxFloat: +o.maxFloat.toFixed(2), maxBuried: +o.maxBuried.toFixed(2), maxSunk: +o.maxSunk.toFixed(2), maxFar: +o.maxFar.toFixed(2), name: j.name ?? null, category: j.category ?? null });
    });
    if (done % 80 < batch.length || done === sel.length) console.log(`  ${done}/${sel.length}  ${batch[batch.length - 1].kind} ${batch[batch.length - 1].id}  findings ${all.length}  (cells ${Math.round(ms.cell / 1000)} s, generating ${Math.round(ms.gen / 1000)} s, analysing ${Math.round(ms.analyze / 1000)} s; ${cellsLive} street cells live)  ${secs()} s`);
  }

  // ---- report
  const finds = all.sort((a, b) => b.depthVis - a.depthVis);
  const sev = (f) => {
    if (f.kind === 'floating') return f.depthVis >= 0.6 ? 'major' : f.depthVis >= 0.25 ? 'visible' : 'minor';
    if (f.kind === 'buried-opening') return f.depthVis >= 0.6 ? 'major' : f.depthVis >= 0.35 ? 'visible' : 'minor';
    return f.depthVis >= 0.4 ? 'major' : f.depthVis >= 0.2 ? 'visible' : 'minor';
  };
  const byType = {};
  // False positives set aside (scripts/audit/allowlist.json): still in the findings, marked `allow`, and left out of the gate counts.
  const allowRules = (() => {
    try { return JSON.parse(readFileSync(resolve(root, 'scripts/audit/allowlist.json'), 'utf8')).structures ?? []; } catch { return []; }
  })();
  for (const f of finds) {
    const rule = allowRules.find((r) => (!r.owner || r.owner === f.owner) && (!r.kind || r.kind === f.kind));
    if (rule) f.allow = rule.reason;
  }
  for (const f of finds) {
    f.severity = sev(f);
    const e = (byType[`${f.kind}|${f.type}`] ??= { n: 0, length: 0, max: 0, major: 0, visible: 0, owners: new Set() });
    e.n++;
    e.length += f.length;
    e.max = Math.max(e.max, f.depthVis);
    if (f.severity === 'major') e.major++;
    if (f.severity === 'visible') e.visible++;
    e.owners.add(f.lot ?? f.owner);
  }
  for (const e of Object.values(byType)) { e.owners = e.owners.size; e.length = +e.length.toFixed(1); e.max = +e.max.toFixed(2); }
  // The numbers scripts/audit/gate.mjs reads (all stretches, before the JSON is trimmed).
  {
    const live = finds.filter((f) => !f.allow);
    const lots = (list) => new Set(list.filter((f) => f.lot).map((f) => f.lot)).size;
    const fl = live.filter((f) => f.kind === 'floating'), bu = live.filter((f) => f.kind === 'buried-opening'), tf = live.filter((f) => f.kind === 'terrain-in-floor');
    report.gate = {
      allowlisted: finds.length - live.length,
      stretches06NotAllowlisted: live.filter((f) => f.depthVis >= 0.6).length,
      colosseumCaveaStretches: finds.filter((f) => f.owner === 'colosseum' && f.kind === 'floating' && f.depthVis >= 0.3).length,
      wallAqueductStretches03: fl.filter((f) => (f.type === 'monument' || f.type === 'landmark:aqueduct') && f.depthVis >= 0.3).length,
      buildingsFloating01: lotTally.floating,
      buildingsFloating025: lots(fl.filter((f) => f.type.startsWith('block:') && f.depthVis >= 0.25)),
      buildingsBuriedOpening: lotTally.buried,
      buriedOpeningStretches035: bu.filter((f) => f.type.startsWith('block:') && f.depthVis >= 0.35).length,
      buildingsTerrainInFloor: lots(tf.filter((f) => f.type.startsWith('block:'))),
      terrainInFloorWorstM: +Math.max(0, ...tf.filter((f) => f.type.startsWith('block:')).map((f) => f.depthVis)).toFixed(2),
      landmarkTerrainInFloorWorstM: +Math.max(0, ...tf.filter((f) => f.type.startsWith('landmark:')).map((f) => f.depthVis)).toFixed(2),
      landmarkFloating06: fl.filter((f) => f.type.startsWith('landmark:') && f.depthVis >= 0.6).length,
      riverTerrainInFloor: tf.filter((f) => f.type.startsWith('river:')).length,
      farBoxesOver10cm: report.massing?.floating ?? null,
      farBoxesDrawnL2: report.massing?.drawn?.L2 ?? null,
      lowDetailFloatingSamples: totals['block-low']?.floating ?? null,
      lowDetailSunkSamples: totals['block-low']?.sunkFloor ?? null,
    };
  }
  report.totals = { jobs: done, of: sel.length, byJob: totals, lots: lotTally, ms: { cell: Math.round(ms.cell / 1000), generate: Math.round(ms.gen / 1000), analyse: Math.round(ms.analyze / 1000) } };
  report.byType = byType;
  console.log(`\n== ${done}/${sel.length} jobs in ${secs()} s`);
  for (const [k, t] of Object.entries(totals)) console.log(`  ${k.padEnd(9)} ${String(t.jobs).padStart(5)} jobs ${String(t.samples).padStart(8)} foot samples (${t.edges} bottom edges; skipped: ${t.skipped.continues} wall below, ${t.skipped.overhang} spans, ${t.skipped.occluded} hidden, ${t.skipped.enclosed} enclosed, ${t.skipped.inside} inside the outline, ${t.skipped.water} water) → ${t.floating} floating, ${t.buriedOpening} buried openings (${t.buriedWall} blank walls into a slope, ${t.buriedTop} low tops under the ground); ${t.floorSamples} floor samples → ${t.sunkFloor} with terrain through; ${t.farFloat} grounded feet float > 0.3 m over the terrain drawn at 205–614 m`);
  console.log(`  blocks: ${lotTally.blocks} blocks, ${lotTally.built} buildings; ${lotTally.floating} buildings (in ${lotTally.blocksFloating} blocks) with a floating stretch, ${lotTally.buried} with a buried opening, ${lotTally.sunk} with terrain through a floor`);
  console.log(`== ${finds.length} stretches, by kind and type (n, length, worst drawn gap, major ≥ 0.6 m, visible ≥ 0.25 m, structures):`);
  for (const [k, e] of Object.entries(byType).sort((a, b) => b[1].major - a[1].major || b[1].n - a[1].n)) console.log(`  ${k.padEnd(40)} ${String(e.n).padStart(5)}  ${String(e.length).padStart(8)} m  max ${e.max.toFixed(2)}  major ${e.major}  visible ${e.visible}  structures ${e.owners}`);
  for (const kind of ['floating', 'buried-opening', 'terrain-in-floor']) {
    console.log(`\n== worst ${kind}:`);
    for (const f of finds.filter((f) => f.kind === kind).slice(0, 20)) console.log(`  ${f.depthVis.toFixed(2)} m  ${String(f.length).padStart(5)} m  ${f.type.padEnd(24)} ${f.mat.padEnd(14)} @${f.at.join(',')}  ${f.place}  [${f.lot ?? f.owner}${f.src ? ` ${f.src}` : ''}] ground=${f.groundMat}${f.floor !== undefined ? ` floor=${f.floor}` : ''}`);
  }

  // ---- screenshots: per kind and family (landmark, block, monument, stairs), the worst by how
  // much of it shows (depth × √length), one per structure.
  if (shotsPer > 0) {
    await page.evaluate(() => window.__skyrome.game.capFps('audit', null));
    await installCam(page);
    const score = (f) => f.depthVis * Math.sqrt(Math.min(f.length, 25));
    const classes = [...new Set(finds.filter((f) => f.severity !== 'minor').map((f) => `${f.kind}|${f.type.split(':')[0]}`))];
    for (const cls of classes) {
      const [kind, type] = cls.split('|');
      const list = [];
      const per = type === 'landmark' ? shotsPer * 2 : type === 'block-low' ? Math.min(2, shotsPer) : shotsPer;
      for (const f of finds.filter((f) => f.kind === kind && f.type.split(':')[0] === type && f.severity !== 'minor').sort((a, b) => score(b) - score(a))) {
        if (list.some((o) => (o.lot ?? o.owner) === (f.lot ?? f.owner) || Math.hypot(o.at[0] - f.at[0], o.at[2] - f.at[2]) < 30)) continue;
        list.push(f);
        if (list.length >= per) break;
      }
      let i = 0;
      for (const f of list) {
        if (Date.now() > deadline + 10 * 60_000) break;
        const info = f.kind === 'terrain-in-floor' ? await frame(page, f.at[0], f.at[1], f.at[2], 6, 3) : await frame(page, f.at[0], f.at[1], f.at[2], undefined, 0, f.out, f.ground);
        const file = `${kind}-${type}-${++i}.png`;
        await page.screenshot({ path: join(shotDir, file) });
        f.screenshot = `.shots/audit/structures/${file}`;
        f.camera = info;
        console.log(`shot ${f.screenshot}  ${f.depthVis} m ${kind} ${f.type} @${f.at.join(',')} ${f.place}`);
      }
    }
  }

  report.owners = ownerRows.filter((o) => o.floating || o.buriedOpening || o.sunkFloor || o.farFloat).sort((a, b) => b.maxFloat - a.maxFloat).slice(0, 300);
  report.farFloat = ownerRows.filter((o) => o.farFloat).sort((a, b) => b.farFloat - a.farFloat).slice(0, 40).map((o) => ({ owner: o.owner, kind: o.kind, name: o.name, samples: o.samples, farFloat: o.farFloat, maxFar: o.maxFar }));
  report.findings = finds.filter((f) => f.severity !== 'minor').slice(0, 100000).concat(finds.filter((f) => f.severity === 'minor').slice(0, 100000));
  report.pageErrors = errors.slice(0, 30);
  report.runtimeS = secs();
  writeFileSync(jsonOut, JSON.stringify(report, null, 1));
  console.log(`\nwrote ${jsonOut} (${finds.length} stretches, ${report.findings.length} kept, ${secs()} s)`);
} catch (e) {
  if (e.message !== 'done') {
    code = 1;
    console.error('FAILED:', e.stack || e.message);
  }
} finally {
  if (errors.length) console.log('page errors:\n  ' + errors.slice(0, 10).join('\n  '));
  await browser.close();
  await server.close();
  process.exit(code);
}

async function installCam(page) {
  await page.evaluate(() => {
    const g = window.__skyrome.game;
    if (window.__pinInstalled) return;
    window.__pinInstalled = true;
    window.__pin = null;
    g.addSystem({ name: 'auditCam', priority: 150, lateUpdate() { const c = window.__pin; if (c) { g.camera.position.set(c[0], c[1], c[2]); g.camera.lookAt(c[3], c[4], c[5]); } } });
  });
}

/**
 * Frame a spot for a screenshot: teleport the player near it (so the city streams in), then put the
 * camera 4–9 m off on the side with the clearest line of sight (physics ray from the eye to the
 * spot; lower ground breaks ties: a void under a base shows from below), eye 1.6 m over the foot.
 */
async function frame(page, x, y, z, dist, height, out, ground) {
  const info = await page.evaluate(async ({ x, y, z, dist, height, out, ground }) => {
    const g = window.__skyrome.game;
    const H = (a, b) => g.heightmap.heightAt(a, b);
    window.__pin = null;
    g.player.teleport({ x: x + 2, y: H(x + 2, z + 2) + 0.5, z: z + 2 }, 0);
    if (g.player.avatar) g.player.avatar.root.visible = false;
    // Let the streamer finish the blocks and cells round the spot (bounded).
    const t0 = performance.now();
    await new Promise((r) => setTimeout(r, 1500));
    while (performance.now() - t0 < 9000 && (g.city.streamer.job || g.city.streamer.cellJob)) await new Promise((r) => setTimeout(r, 250));
    g.physics.step(1e-4);
    if (out) {
      // From where a player could stand outside: on open ground along the foot's outward normal
      // (turned up to ±70°), eye 1.7 m over the terrain (+ `height`), with a clear line to the foot
      // and to the middle of the gap under it, not under a roof.
      const gy = ground ?? H(x + out[0] * 0.3, z + out[1] * 0.3);
      const ty = (y + gy) / 2;
      const tx = x + out[0] * 0.25, tz = z + out[1] * 0.25;
      const clear = (ax, ay, az, bx, by, bz) => {
        const dir = { x: bx - ax, y: by - ay, z: bz - az };
        const L = Math.hypot(dir.x, dir.y, dir.z);
        const hit = g.physics.raycast({ x: ax, y: ay, z: az }, { x: dir.x / L, y: dir.y / L, z: dir.z / L }, L, 1);
        return hit ? Math.min(1, hit.distance / Math.max(0.1, L - 0.5)) : 1;
      };
      let pick = null, ps = -Infinity;
      for (const d of dist ? [dist, dist * 1.6, dist * 0.6] : [6, 10, 16, 24]) {
        for (const turn of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2]) {
          const c = Math.cos(turn), sn = Math.sin(turn);
          const dx = out[0] * c - out[1] * sn, dz = out[0] * sn + out[1] * c;
          const px = x + dx * d, pz = z + dz * d;
          const ey = H(px, pz) + 1.7 + (height ?? 0);
          const up = g.physics.raycast({ x: px, y: ey, z: pz }, { x: 0, y: 1, z: 0 }, 12, 1);
          const score = clear(px, ey, pz, tx, ty, tz) + clear(px, ey, pz, tx, y + 0.3, tz) - (up ? 0.6 : 0) - Math.abs(turn) * 0.05 - d * 0.004;
          if (score > ps) { ps = score; pick = { px: +px.toFixed(1), pz: +pz.toFixed(1), ey: +ey.toFixed(1), ty: +ty.toFixed(2), score: +score.toFixed(2) }; }
        }
      }
      g.player.teleport({ x: pick.px, y: H(pick.px, pick.pz) + 0.5, z: pick.pz }, 0);
      if (g.player.avatar) g.player.avatar.root.scale.setScalar(0.001);
      window.__pin = [pick.px, pick.ey, pick.pz, x, Math.min(y, Math.max(ty, pick.ey - 6)), z];
      return pick;
    }
    let best = null, bs = -Infinity;
    for (const d of dist ? [dist, dist * 0.7, dist * 0.45] : [8, 5.5, 3.5]) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
        const ey = Math.max(H(px, pz) + 1.2, y + (height ?? 1.6));
        const dir = { x: x - px, y: y - ey, z: z - pz };
        const L = Math.hypot(dir.x, dir.y, dir.z);
        const hit = g.physics.raycast({ x: px, y: ey, z: pz }, { x: dir.x / L, y: dir.y / L, z: dir.z / L }, L - 0.4, 1);
        const clear = hit ? hit.distance : L;
        const score = clear / L - (H(px, pz) - y) * 0.05;
        if (score > bs) { bs = score; best = { px: +px.toFixed(1), pz: +pz.toFixed(1), ey: +ey.toFixed(1), clear: +clear.toFixed(1), L: +L.toFixed(1) }; }
      }
      if (best && best.clear >= best.L - 0.5) break;
    }
    g.player.teleport({ x: best.px, y: H(best.px, best.pz) + 0.5, z: best.pz }, 0);
    if (g.player.avatar) g.player.avatar.root.scale.setScalar(0.001);
    window.__pin = [best.px, best.ey, best.pz, x, y, z];
    return best;
  }, { x, y, z, dist: dist ?? null, height: height ?? null, out: out ?? null, ground: ground ?? null });
  await page.waitForTimeout(2500);
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
