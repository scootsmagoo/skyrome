#!/usr/bin/env node
/**
 * Writes scripts/audit/baseline/<lens>.json from the audit outputs: the counts and the top 100 clusters (each file
 * under 150 KB), so the phase 4a numbers survive (scripts/audit/out is gitignored). Only the lead refreshes them.
 *
 *   node scripts/audit/baseline.mjs [--from scripts/audit/out] [--street-fit docs/research/solid-ground/street-fit.json]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const arg = (k, d) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const from = resolve(root, arg('from', 'scripts/audit/out'));
const sfPath = resolve(root, arg('street-fit', 'docs/research/solid-ground/street-fit.json'));
const dir = join(root, 'scripts/audit/baseline');
mkdirSync(dir, { recursive: true });
const read = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o && o[k] !== undefined).map((k) => [k, o[k]]));
const top = (list, n = 100) => (list ?? []).slice(0, n);

function write(lens, source, counts, clusters) {
  const json = { lens, note: 'Phase 4a baseline (2026-10-10): counts plus the top 100 clusters. Refreshed only by the lead.', source, counts, clusters };
  let text = JSON.stringify(json, null, 1);
  let n = clusters.length;
  while (text.length > 140_000 && n > 10) {
    n = Math.floor(n * 0.8);
    text = JSON.stringify({ ...json, clusters: clusters.slice(0, n) }, null, 1);
  }
  writeFileSync(join(dir, `${lens}.json`), text + '\n');
  console.log(`${lens}.json  ${(text.length / 1000).toFixed(0)} KB  ${n} clusters`);
}

const st = read(join(from, 'structures.json'));
if (st) {
  write('structures', 'scripts/audit/structures.mjs, 2026-10-10 full run', { totals: st.totals, byType: st.byType, massing: pick(st.massing, ['boxes', 'detailedBoxes', 'floating', 'floatingFar', 'major', 'drawn']) },
    top([...st.findings].sort((a, b) => b.depthVis - a.depthVis)).map((f) => pick(f, ['kind', 'name', 'owner', 'type', 'depthVis', 'length', 'n', 'at', 'ground', 'place', 'severity', 'lot'])));
}
const sf = read(sfPath) ?? read(join(from, 'street-fit.json'));
if (sf) write('street-fit', 'scripts/audit/street-fit.mjs, 2026-10-10 sweep of 227 cells', { totals: sf.totals, bySrc: sf.bySrc, causes: top(sf.causes, 40) }, top(sf.findings).map((f) => pick(f, ['kind', 'src', 'mat', 'x', 'y', 'z', 'v', 'len', 'n', 'place', 'severity', 'score'])));
const su = read(join(from, 'surface.json'));
if (su) {
  const flat = Object.entries(su.ranked ?? {}).flatMap(([k, list]) => list.slice(0, 30).map((x) => ({ ranked: k, ...x })));
  write('surfaces', 'scripts/audit/surface.mjs, 2026-10-10 run (120 stops, 6 walks)', { totals: su.totals, walks: (su.walks ?? []).map((w) => pick(w, ['name', 'length', 'frames', 'median', 'medianFar', 'byKind'])) }, flat.map((x) => JSON.parse(JSON.stringify(x, (k, v) => (k === 'series' || k === 'events' ? undefined : v)))));
}
const ro = read(join(from, 'routes.json'));
if (ro) {
  const pl = read(join(from, 'routes-places.json'));
  write('routes', 'scripts/audit/routes.mjs, 2026-10-10 run (241 jobs + sweep)', { totals: ro.totals, graph: ro.graph, sweep: pick(ro.sweep, ['tiles', 'edges', 'checked', 'metres', 'edgesFlagged', 'perKind', 'places']), places: pl && pick(pl, ['nodes', 'isolated', 'isoKinds', 'checked']), questTableFailing: (ro.questTable ?? []).filter((q) => q.verdict === 'FAIL' || q.verdict === 'BLOCKED').map((q) => pick(q, ['id', 'verdict', 'outcome', 'length', 'blocks'])) },
    top(ro.places).map((p) => pick(p, ['sev', 'at', 'place', 'routes', 'kinds', 'parts'])));
}
const co = read(join(from, 'collision.json'));
if (co) write('collision', 'scripts/audit/collision.mjs, 2026-10-10 run (865 stops)', { counts: co.counts, byKind: co.byKind, terrain: co.terrain, defectsTotal: co.defectsTotal }, top(co.defects).map((d) => pick(d, ['kind', 'family', 'severity', 'score', 'n', 'size', 'x', 'y', 'z', 'place', 'onStory', 'phys', 'vis'])));
const gr = read(join(from, 'terrain-grades.json'));
if (gr) {
  const live = read(join(from, 'terrain-grades-live.json'));
  write('grades', 'scripts/audit/grades.mjs and grades-live.mjs, 2026-10-10', {
    walkableOver: gr.walkable.over, steepOver35ByCause: gr.walkable.steepOver35ByCause, streets: pick(gr.streets, ['count', 'over30pct', 'over45pct', 'over84pct', 'over119pct', 'takenOverByPads']),
    hills: gr.hills.map((h) => ({ group: h.group, flankDeg: h.flankDeg, easiestUp: pick(h.easiestUp, ['surfaceDeg', 'zigzagDeg']) })), live: live && { climbs: live.climbs.map((c) => pick(c, ['id', 'kind', 'maxPct', 'reached', 'secs', 'flatSecs'])) },
  }, [...gr.roads.slice(0, 40).map((r) => ({ kind: 'road', id: r.id, name: r.name, max4m: r.max4m, max4mWithoutPads: r.max4mWithoutPads, padTakeover: r.padTakeover })), ...top(gr.streets.steepest, 25).map((s) => ({ kind: 'street', id: s.id, max4m: s.max4m, place: s.place })), ...top(gr.spots.onWays, 40).map((s) => ({ kind: 'spot', at: s.at, areaM2: s.areaM2, maxDeg: s.maxDeg, cause: s.cause, place: s.place }))]);
}
