#!/usr/bin/env node
/**
 * GROUND part 2 (G1b) helper: the atlas roads' grades on the terrain as the game builds it, with
 * why a road is steep where it is (a landmark's own footprint it runs through, a water band, a
 * crossing). Offline, a few seconds.
 *
 *   node scripts/audit/g1b-roads.mjs [--roads id,id] [--plan] [--json out.json]
 *
 * Profile: SKYROME_TERRAIN=v1|v2 (default v2). --plan also profiles the city plan's lines (the
 * detoured ones, which `grades.mjs` measures). Prints, per road: the steepest 4 m (game window,
 * as grades.mjs measures it) on the atlas line and on the plan's line, and where.
 */
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : null)).filter(Boolean));
const server = await createServer({ root, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
const load = (p) => server.ssrLoadModule(p);
const atlas = await load('/src/data/atlas.ts');
const HM = await load('/src/world/terrain/heightmap.ts');
const { landmarkPads } = await load('/src/world/rome/buildRome.ts');
const G = await load('/src/dev/audit/grades.ts');
const { WORLD_SCALE: S } = await load('/src/world/coords.ts');

const box = (b, m = 0) => ({ minX: b.minX - m, maxX: b.maxX + m, minZ: b.minZ - m, maxZ: b.maxZ + m });
const lbs = [box(atlas.CORE_BOUNDS, 350), ...atlas.DETAIL_REGIONS.map((r) => box(r, 100))];
const landmarkBounds = { minX: Math.min(...lbs.map((b) => b.minX)), maxX: Math.max(...lbs.map((b) => b.maxX)), minZ: Math.min(...lbs.map((b) => b.minZ)), maxZ: Math.max(...lbs.map((b) => b.maxZ)) };
const SRC = { BASE_ELEVATION: atlas.BASE_ELEVATION, HILLS: atlas.HILLS, LOWLANDS: atlas.LOWLANDS, RIVERS: atlas.RIVERS, ISLANDS: atlas.ISLANDS, ROADS: atlas.ROADS, BRIDGES: atlas.BRIDGES, bounds: atlas.CITY_BOUNDS };
const PADS = landmarkPads(landmarkBounds);
const t0 = Date.now();
const hm = HM.buildHeightmap(SRC, { spacing: 2, pads: PADS });
console.log(`heightmap (${hm.profile}) ${hm.nx}×${hm.nz} in ${Date.now() - t0} ms; retaining runs: ${hm.features.retaining.length} (${hm.features.retaining.reduce((a, r) => a + r.points.length, 0)} points)`);
let plan = null;
if (args.plan) {
  const { planCity, scaleBounds } = await load('/src/world/city/plan.ts');
  plan = planCity(atlas, hm, { detailBounds: scaleBounds(atlas.CORE_BOUNDS, 150), corridorDetail: 150 });
}
const only = args.roads ? new Set(String(args.roads).split(',')) : null;
const r1 = (v) => Math.round(v * 10) / 10;
function steepest(pts) {
  const p = G.profile((x, z) => hm.heightAt(x, z), pts, 1, 4);
  let m = 0, mi = 0;
  for (let i = 0; i < p.grade.length; i++) if (Math.abs(p.grade[i]) > m) { m = Math.abs(p.grade[i]); mi = i; }
  return { pct: Math.round(m * 100), at: [r1(p.x[mi]), r1(p.y[mi]), r1(p.z[mi])] };
}
/** Pads whose own footprint (signed distance ≤ −grow) holds a game point. */
function coresAt(x, z) {
  const out = [];
  for (const p of PADS) {
    if (p.grow === undefined) continue;
    if (HM.signedDistance(x / S, z / S, p.polygon) <= -p.grow) out.push(p.id);
  }
  return out;
}
const rows = [];
for (const r of atlas.ROADS) {
  if (only && !only.has(r.id)) continue;
  const line = r.points.map(([x, z]) => [x * S, z * S]);
  const a = steepest(line);
  const row = { id: r.id, paving: r.paving, atlas: a, coreAtMax: coresAt(a.at[0], a.at[2]) };
  if (plan) {
    const pr = plan.roads.find((p) => p.id === r.id);
    if (pr) row.plan = steepest(pr.points);
  }
  rows.push(row);
}
rows.sort((a, b) => b.atlas.pct - a.atlas.pct);
for (const r of rows.slice(0, only ? rows.length : 25)) console.log(`${String(r.atlas.pct).padStart(4)}% ${r.id.padEnd(34)} ${r.paving.padEnd(6)} @${r.atlas.at.join(',')}${r.coreAtMax.length ? ` in core of ${r.coreAtMax.join(',')}` : ''}${r.plan ? `   plan ${r.plan.pct}% @${r.plan.at.join(',')}` : ''}`);
const over = rows.filter((r) => r.paving !== 'steps' && r.atlas.pct > 25);
console.log(`atlas lines over 25 % (flights of steps left out): ${over.length}${over.length ? ': ' + over.map((r) => r.id).join(', ') : ''}`);
if (args.json) writeFileSync(resolve(root, String(args.json)), JSON.stringify({ profile: hm.profile, roads: rows }, null, 1));
await server.close();
process.exit(0);
