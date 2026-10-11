#!/usr/bin/env node
/**
 * Street-level fit audit (phase 4 "solid ground", docs/design/solid-ground.md): kerbs, pavements,
 * paving edges, aprons, junction squares, piazzas, ground cover, steps, fountains, stalls, benches,
 * statue bases, amphora stacks and the terrain dressing's kerbstones, over the WHOLE playable city.
 *
 *   node scripts/audit/street-fit.mjs [--only 2,4;1,3] [--near x,z,r] [--max 400] [--shots 12]
 *                                     [--out docs/research/solid-ground] [--no-blocks] [--minutes 40]
 *
 * It boots the game once with `?audit`, imports src/dev/audit/streetFit.ts into the page and, for
 * every 128 m street cell of the detail area, rebuilds the cell's street surfaces, its furniture and
 * the full level of the blocks that touch it (the same work items and block units the streamer
 * runs, into builders that are never drawn), then measures them against the terrain as the GPU draws
 * it (see streetFit.ts for every check). No walking or streaming: ~1-3 s a cell, ~10-15 minutes for
 * the city (227 cells). Then it screenshots the worst cases at street level (teleport, wait for the
 * city to stream in, camera pinned 3-5 m off the spot at knee-to-eye height).
 *
 * Output: <out>/street-fit.json (totals, per-source tallies, ranked findings, < 2 MB) and
 * <out>/street-fit.md (the ranked report), screenshots in .shots/street-fit/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { boot, parseArgs, root } from './boot.mjs';

const args = parseArgs(process.argv.slice(2));
const outDir = resolve(root, args.out ?? 'docs/research/solid-ground');
const shotDir = resolve(root, '.shots/street-fit');
mkdirSync(outDir, { recursive: true });
mkdirSync(shotDir, { recursive: true });
const maxCells = Number(args.max ?? 1000);
const nShots = Number(args.shots ?? 12);
const deadline = Date.now() + Number(args.minutes ?? 40) * 60000;
const T0 = Date.now();

const { page, errors, close, bootMs } = await boot('scene=rome&quick=1&hour=11&audit=1&tgm=1&npcs=0', { size: args.size ?? '1280x720' });
console.log(`booted in ${(bootMs / 1000).toFixed(1)} s`);
let code = 0;
try {
  await page.evaluate(() => import('/src/dev/audit/streetFit.ts'));
  const info = await page.evaluate(() => window.__streetFit.init());
  console.log(`${info.cells.length} street cells, ${info.blocks} detailed blocks, ${info.landmarkSets} landmark face sets, ${info.landmarkProps} landmark props, ${info.kerbstones} dressing kerbstones`);
  let cells = info.cells;
  if (args.only) {
    const keys = String(args.only).split(';');
    cells = cells.filter((c) => keys.includes(c.key));
  }
  if (args.near) {
    const [x, z, r] = String(args.near).split(',').map(Number);
    cells = cells.filter((c) => Math.abs(c.cx - x) < r + 64 && Math.abs(c.cz - z) < r + 64);
  }
  // Row by row, so the neighbour cells and blocks a cell needs are mostly cached from the last one.
  cells.sort((a, b) => a.cz - b.cz || a.cx - b.cx);
  cells = cells.slice(0, maxCells);
  const results = [];
  let n = 0;
  for (const c of cells) {
    if (Date.now() > deadline) {
      console.log(`time is up (--minutes): ${n} of ${cells.length} cells swept`);
      break;
    }
    const r = await page.evaluate(({ key, blocks }) => window.__streetFit.sweepCell(key, { blocks }), { key: c.key, blocks: !args['no-blocks'] });
    n++;
    if (!r) continue;
    results.push(r);
    if (n % 10 === 0 || n === cells.length) console.log(`  ${n}/${cells.length} cells  (${r.key}: ${r.ms} ms, ${r.findings.length} findings)  ${((Date.now() - T0) / 60000).toFixed(1)} min`);
  }
  const sweepMin = (Date.now() - T0) / 60000;

  // ---- totals
  const totals = {};
  const bySrc = {};
  for (const r of results) {
    for (const [k, v] of Object.entries(r.tally)) totals[k] = (totals[k] ?? 0) + v;
    for (const [s, e] of Object.entries(r.bySrc)) {
      const t = (bySrc[s] ??= {});
      for (const [k, v] of Object.entries(e)) t[k] = (t[k] ?? 0) + v;
    }
  }
  for (const e of Object.values(bySrc)) for (const k of Object.keys(e)) e[k] = +e[k].toFixed(1);
  totals.cells = results.length;
  totals.droppedFindings = results.reduce((a, r) => a + r.dropped, 0);

  // ---- findings: score by how much a player would notice them, merge neighbours of one kind and cause
  const all = results.flatMap((r) => r.findings.map((f) => ({ ...f, cell: r.key })));
  const cause = (f) => `${f.kind}|${srcKindOf(f.src)}|${f.kind.startsWith('prop') || f.kind.startsWith('fixture') ? f.mat : ''}|${f.kind === 'lip' || f.kind === 'zfight' ? (f.note ?? '').split(' (')[0] : ''}`;
  const clusters = [];
  const byCause = new Map();
  for (const f of all.sort((a, b) => score(b) - score(a))) {
    const k = cause(f);
    let list = byCause.get(k);
    if (!list) byCause.set(k, (list = []));
    const near = list.find((c) => Math.hypot(c.x - f.x, c.z - f.z) < 8);
    if (near) {
      near.n++;
      near.len = +(near.len + f.len).toFixed(2);
      continue;
    }
    const c = { ...f, n: 1 };
    list.push(c);
    clusters.push(c);
  }
  for (const c of clusters) {
    c.score = +score(c).toFixed(3);
    c.severity = severity(c);
  }
  clusters.sort((a, b) => b.score - a.score);
  // Causes: the same defect everywhere (one fix each).
  const causes = [...byCause.entries()].map(([k, list]) => ({
    cause: k,
    places: list.length,
    extent: +list.reduce((a, c) => a + c.len, 0).toFixed(1),
    worst: +Math.max(...list.map((c) => c.v)).toFixed(3),
    example: list[0] && { x: list[0].x, y: list[0].y, z: list[0].z, place: list[0].place?.id, note: list[0].note },
  })).sort((a, b) => b.extent * b.worst - a.extent * a.worst);

  // ---- screenshots of the worst cases at street level
  const shots = [];
  if (nShots > 0) {
    await page.evaluate(() => {
      const g = window.__skyrome.game;
      document.querySelectorAll('.ui-root').forEach((e) => (e.style.visibility = 'hidden'));
      window.__pin = null;
      g.addSystem({ name: 'streetFitCam', priority: 150, lateUpdate() { const c = window.__pin; if (c) { g.camera.position.set(c[0], c[1], c[2]); g.camera.lookAt(c[3], c[4], c[5]); } if (g.player.avatar) g.player.avatar.root.visible = false; } });
    });
    // One per cause first (variety), then the next worst.
    const picked = [];
    const seen = new Set();
    for (const c of clusters) {
      const k = cause(c);
      if (seen.has(k) || c.severity === 'minor') continue;
      seen.add(k);
      picked.push(c);
      if (picked.length >= nShots) break;
    }
    for (const c of clusters) if (picked.length < nShots && !picked.includes(c)) picked.push(c);
    let i = 0;
    for (const c of picked) {
      if (Date.now() > deadline + 5 * 60000) break;
      const name = `${String(++i).padStart(2, '0')}-${c.kind}.png`;
      const view = await page.evaluate(async ({ x, y, z }) => {
        const g = window.__skyrome.game;
        const V = window.__streetFit.visibleAt;
        // Stand 4 m off the spot on the side with the lowest ground (to look at the gap), knee-to-eye height.
        let best = null;
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          const cx = x + Math.cos(a) * 4, cz = z + Math.sin(a) * 4;
          const gy = V(cx, cz);
          if (!best || gy < best.gy) best = { cx, cz, gy, a };
        }
        // The player stands 10 m behind the camera (out of the picture; the city streams round it).
        const px = best.cx + Math.cos(best.a) * 10, pz = best.cz + Math.sin(best.a) * 10;
        g.player.teleport({ x: px, y: g.heightmap.heightAt(px, pz) + 0.5, z: pz }, 0);
        const eye = Math.max(best.gy, y) + 0.9;
        window.__pin = [best.cx, eye, best.cz, x, y, z];
        // Let the city stream in round the spot (at most 12 s).
        const t0 = performance.now();
        await new Promise((r) => setTimeout(r, 1500));
        while (performance.now() - t0 < 12000) {
          const s = g.city.streamer;
          const busy = s.job || s.cellJob;
          if (!busy) break;
          await new Promise((r) => setTimeout(r, 250));
        }
        await new Promise((r) => setTimeout(r, 800));
        return window.__pin;
      }, c);
      const p = join(shotDir, name);
      await page.screenshot({ path: p });
      c.screenshot = `.shots/street-fit/${name}`;
      c.camera = view.map((v) => +v.toFixed(2));
      shots.push({ file: c.screenshot, kind: c.kind, src: c.src, at: [c.x, c.y, c.z], v: c.v, camera: c.camera });
      console.log(`shot ${c.screenshot}  ${c.kind} ${c.src} v=${c.v} @${c.x},${c.y},${c.z} (${c.place?.id})`);
    }
  }

  // ---- write
  const minutes = (Date.now() - T0) / 60000;
  const top = clusters.slice(0, 600);
  const json = {
    generated: new Date().toISOString(),
    tool: 'scripts/audit/street-fit.mjs',
    sweepMinutes: +sweepMin.toFixed(1),
    minutes: +minutes.toFixed(1),
    info: { cells: info.cells.length, swept: results.length, blocks: info.blocks, landmarkProps: info.landmarkProps, kerbstones: info.kerbstones },
    totals,
    // The numbers scripts/audit/gate.mjs reads (all clusters, not just the kept findings).
    gate: {
      lipCells30: totals.lipCells30 ?? 0,
      lipCells12: totals.lipCells12 ?? 0,
      openEdgeOver3cmM: +Object.values(bySrc).reduce((a, e) => a + (e.float03 ?? 0), 0).toFixed(1),
      openEdgeOver8cmM: +Object.values(bySrc).reduce((a, e) => a + (e.float08 ?? 0), 0).toFixed(1),
      faceFloatOver10cm: clusters.filter((c) => c.kind === 'face-float' && c.v > 0.1).length,
      doublePavingCells: totals.doublePavingCells ?? 0,
      terrainThroughCells: totals.throughCells ?? 0,
      kerbstonesOnCityPaving: totals.kerbstonesOnCityPaving ?? 0,
      zfightCells: totals.zfightCells ?? 0,
      propsFloating: totals.propsFloating ?? 0,
      propsSunk: totals.propsSunk ?? 0,
      propFootInAirOver30cm: clusters.filter((c) => c.kind === 'prop-foot-in-air' && c.v > 0.3).length,
    },
    bySrc,
    causes: causes.slice(0, 120),
    findings: top,
    shots,
    perCell: results.map((r) => ({ key: r.key, ms: r.ms, tally: r.tally })),
  };
  let text = JSON.stringify(json);
  if (text.length > 1.9e6) {
    json.findings = top.slice(0, 250);
    text = JSON.stringify(json);
  }
  writeFileSync(join(outDir, 'street-fit.json'), text);
  writeFileSync(join(outDir, 'street-fit.md'), report(json));
  console.log(`\nwrote ${join(outDir, 'street-fit.json')} (${(text.length / 1e6).toFixed(2)} MB) and street-fit.md in ${minutes.toFixed(1)} min`);
  printSummary(json);
} catch (e) {
  code = 1;
  console.error('FAILED:', e?.stack ?? e);
} finally {
  if (errors.length) console.log('page errors:\n  ' + errors.slice(0, 10).join('\n  '));
  await close();
  process.exit(code);
}

function srcKindOf(s) {
  if (!s) return '?';
  if (s.startsWith('lm:')) return 'landmark:' + s.slice(3).replace(/[:#].*$/, '');
  if (s.startsWith('road:')) return 'road:' + s.split(':').slice(-1)[0];
  if (s.startsWith('street:')) return 'street:' + s.split(':').slice(-1)[0];
  if (s.startsWith('block:')) return 'block';
  if (s.startsWith('item#')) return 'item';
  if (s.startsWith('detail#')) return 'street-furniture';
  return s.replace(/:.*$/, '').replace(/#.*$/, '');
}

/**
 * How much a player would notice it: the measured value (m) scaled by how far it runs, with the
 * kinds a player meets head-on (a floating object, a lip underfoot) weighted up.
 */
function score(f) {
  const w = { 'edge-float': 1, 'face-float': 1.2, 'under-gap': 1, lip: 1.4, zfight: 0.6, 'terrain-through': 0.8, 'double-paving': 0.5, 'prop-floating': 1.6, 'prop-foot-in-air': 0.9, 'prop-sunk': 0.5, 'fixture-floating': 1.6, 'fixture-edge-in-air': 1.1, 'kerbstone-floating': 1.5, 'kerbstone-end-in-air': 1, 'kerbstone-in-paving': 1.2 }[f.kind] ?? 1;
  // Extent as a length: metres of edge, of lip (raster steps of 0.25 m), or the side of an area of 0.25 m cells.
  const area = f.kind === 'zfight' || f.kind === 'terrain-through' || f.kind === 'double-paving';
  const ext = area ? Math.sqrt(f.len * 0.0625) : f.kind === 'lip' ? Math.sqrt(f.len * 0.25) : Math.sqrt(Math.max(0.5, f.len));
  const v = f.kind === 'zfight' ? 0.05 : f.kind === 'kerbstone-in-paving' ? Math.max(0.05, Math.abs(f.v)) : f.v;
  return w * v * ext;
}

function severity(f) {
  const v = Math.abs(f.v);
  if (f.kind === 'lip' && v >= 0.3) return 'major'; // a ledge the step-up does not take (a clamber)
  if (f.kind === 'kerbstone-in-paving') return v > 0.05 ? 'major' : 'minor';
  if (f.kind === 'zfight') return f.len >= 64 ? 'major' : 'minor';
  if (f.kind === 'terrain-through') return f.len >= 64 && v > 0.01 ? 'major' : 'minor';
  if (f.kind === 'double-paving') return f.len >= 64 && v >= 0.03 ? 'major' : 'minor';
  if (f.kind === 'lip') return v >= 0.08 && f.len >= 8 ? 'major' : 'minor';
  if (f.kind.startsWith('prop') || f.kind.startsWith('fixture') || f.kind.startsWith('kerbstone')) return v >= 0.08 ? 'major' : 'minor';
  return v >= 0.08 && f.len >= 1 ? 'major' : 'minor';
}

function printSummary(j) {
  console.log('\n== totals'); console.log(JSON.stringify(j.totals));
  console.log('\n== open edges by source (metres of edge examined; floating over 3 / 8 / 15 cm)');
  for (const [s, e] of Object.entries(j.bySrc).sort((a, b) => (b[1].float03 ?? 0) - (a[1].float03 ?? 0)).slice(0, 20)) console.log(`  ${s.padEnd(22)} ${String(e.edgeLen ?? 0).padStart(9)} m   ${String(e.float03 ?? 0).padStart(8)} / ${String(e.float08 ?? 0).padStart(7)} / ${String(e.float15 ?? 0).padStart(6)}`);
  console.log('\n== causes (places, extent, worst)');
  for (const c of j.causes.slice(0, 30)) console.log(`  ${String(c.places).padStart(5)} × ${String(c.extent).padStart(8)}  worst ${c.worst}  ${c.cause}  e.g. @${c.example?.x},${c.example?.y},${c.example?.z} (${c.example?.place})`);
  console.log('\n== worst 25');
  for (const f of j.findings.slice(0, 25)) console.log(`  [${f.severity}] ${f.kind} ${f.src} ${f.mat ?? ''} v=${f.v} len=${f.len} n=${f.n} @${f.x},${f.y},${f.z} (${f.place?.id} ${f.place?.d} m) ${f.note ?? ''}`);
}

function report(j) {
  const L = [];
  L.push('# Street-level fit audit');
  L.push('');
  L.push(`Generated ${j.generated} by \`node ${j.tool}\` (${j.info.swept} of ${j.info.cells} street cells, ${j.sweepMinutes} min sweep, ${j.minutes} min with screenshots). Coordinates are game metres (+x east, +z south). Values are metres.`);
  L.push('');
  L.push('## Totals');
  L.push('');
  L.push('```');
  L.push(JSON.stringify(j.totals, null, 1));
  L.push('```');
  L.push('');
  L.push('## Open edges by source');
  L.push('');
  L.push('| source | edge examined (m) | floating > 3 cm (m) | > 8 cm | > 15 cm |');
  L.push('| --- | ---: | ---: | ---: | ---: |');
  for (const [s, e] of Object.entries(j.bySrc).sort((a, b) => (b[1].float03 ?? 0) - (a[1].float03 ?? 0))) L.push(`| ${s} | ${e.edgeLen ?? 0} | ${e.float03 ?? 0} | ${e.float08 ?? 0} | ${e.float15 ?? 0} |`);
  L.push('');
  L.push('## Causes (same defect, many places)');
  L.push('');
  L.push('| places | extent | worst (m) | cause | example |');
  L.push('| ---: | ---: | ---: | --- | --- |');
  for (const c of j.causes.slice(0, 60)) L.push(`| ${c.places} | ${c.extent} | ${c.worst} | ${c.cause.replace(/\|/g, ' / ')} | ${c.example ? `${c.example.x}, ${c.example.y}, ${c.example.z} (${c.example.place})` : ''} |`);
  L.push('');
  L.push('## Worst places');
  L.push('');
  L.push('| # | severity | kind | source | value (m) | extent | x, y, z | place | screenshot | note |');
  L.push('| ---: | --- | --- | --- | ---: | ---: | --- | --- | --- | --- |');
  j.findings.slice(0, 120).forEach((f, i) => L.push(`| ${i + 1} | ${f.severity} | ${f.kind} | ${f.src} ${f.mat ? `(${f.mat})` : ''} | ${f.v} | ${f.len}${f.n > 1 ? ` (${f.n})` : ''} | ${f.x}, ${f.y}, ${f.z} | ${f.place?.id} (${f.place?.d} m) | ${f.screenshot ?? ''} | ${(f.note ?? '').replace(/\|/g, '/')} |`));
  L.push('');
  return L.join('\n');
}
