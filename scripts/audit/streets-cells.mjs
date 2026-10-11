#!/usr/bin/env node
/**
 * STREETS crew (phase 4b): offline check of the city's street cells, without a browser. Builds the
 * heightmap and the city plan as the game does (as grades.mjs does), runs the street work items of
 * chosen 128 m cells into MeshBuilders and reports per cell: items, triangles (by source kind),
 * colliders, the slowest item (ms), and the largest gap between the street surfaces' vertices and
 * heightAt. Use it for before/after triangle budgets and the cost of a cell's items.
 *
 *   node scripts/audit/streets-cells.mjs [--at x,z;x,z] [--all] [--terrain v1|v2] [--json out.json]
 *
 * Default cells: the STREETS cameras of docs/design/solid-ground.md §4 plus the Forum and the spawn.
 */
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './boot.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = parseArgs(process.argv.slice(2));
if (args.terrain) process.env.SKYROME_TERRAIN = String(args.terrain);
const T0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a);

const server = await createServer({ root, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
const load = (p) => server.ssrLoadModule(p);
try {
  const atlas = await load('/src/data/atlas.ts');
  const HM = await load('/src/world/terrain/heightmap.ts');
  const { landmarkPads } = await load('/src/world/rome/buildRome.ts');
  const { planCity, scaleBounds } = await load('/src/world/city/plan.ts');
  const { streetWork } = await load('/src/world/city/roads.ts');
  const { MeshBuilder } = await load('/src/gfx/MeshBuilder.ts');
  const { withAuditSource } = await load('/src/dev/audit/geomAudit.ts');
  const streets = await load('/src/arch/fabric/streets.ts');
  const cs = streets.conformStats;
  const box = (b, m = 0) => ({ minX: b.minX - m, maxX: b.maxX + m, minZ: b.minZ - m, maxZ: b.maxZ + m });
  const lbs = [box(atlas.CORE_BOUNDS, 350), ...atlas.DETAIL_REGIONS.map((r) => box(r, 100))];
  const landmarkBounds = { minX: Math.min(...lbs.map((b) => b.minX)), maxX: Math.max(...lbs.map((b) => b.maxX)), minZ: Math.min(...lbs.map((b) => b.minZ)), maxZ: Math.max(...lbs.map((b) => b.maxZ)) };
  const SRC = { BASE_ELEVATION: atlas.BASE_ELEVATION, HILLS: atlas.HILLS, LOWLANDS: atlas.LOWLANDS, RIVERS: atlas.RIVERS, ISLANDS: atlas.ISLANDS, ROADS: atlas.ROADS, bounds: atlas.CITY_BOUNDS };
  const hm = HM.buildHeightmap(SRC, { spacing: 2, pads: landmarkPads(landmarkBounds) });
  log(`heightmap ${hm.nx}x${hm.nz} profile ${hm.profile}`);
  const plan = planCity(atlas, hm, { detailBounds: scaleBounds(atlas.CORE_BOUNDS, 150), corridorDetail: 150 });
  log(`plan: ${plan.roads.length} roads, ${plan.streets.length} streets, ${plan.blocks.length} blocks`);
  const H = (x, z) => hm.heightAt(x, z);
  const areaRects = plan.detailRects.map((b) => ({ minX: b.minX - 60, minZ: b.minZ - 60, maxX: b.maxX + 60, maxZ: b.maxZ + 60 }));
  const work = streetWork(plan, H, areaRects, 128);
  log(`street work: ${work.cells.size} cells`);
  const DEFAULT = '486.6,261;80.7,106.1;200.9,94.1;-470.1,585.4;-377.9,591.3;266,552.5;51.5,1.2;105.4,-288.5;60,60;300,570;-0.1,259.7';
  const keys = args.all ? [...work.cells.keys()] : [...new Set(String(args.at ?? DEFAULT).split(';').map((s) => s.split(',').map(Number)).map(([x, z]) => `${Math.floor(x / 128)},${Math.floor(z / 128)}`))];
  const rows = [];
  let total = { tris: 0, items: 0, ms: 0, colliders: 0 };
  for (const key of keys) {
    const c = work.cells.get(key);
    if (!c) continue;
    const b = new MeshBuilder();
    let slow = 0, slowTag = '', ms = 0;
    const per = [];
    if (cs) for (const k of Object.keys(cs)) cs[k] = 0;
    c.items.forEach((it, k) => {
      const before = b.triangleCount;
      const t = performance.now();
      const s0 = cs ? { ...cs } : null;
      try {
        withAuditSource(`item#${k}`, () => it(b));
      } catch (e) {
        console.log(`  item ${k} failed: ${e.message}`);
      }
      const dt = performance.now() - t;
      ms += dt;
      const added = b.triangleCount - before;
      if (dt > slow) {
        slow = dt;
        slowTag = `#${k}`;
      }
      const src = [...b.parts.values()].flat().find((g) => g.userData.src)?.userData.src;
      void src;
      per.push({ k, tris: added, ms: +dt.toFixed(1), stats: cs ? Object.fromEntries(Object.keys(cs).map((q) => [q, Math.round(cs[q] - s0[q])])) : null });
    });
    if (args.items) for (const p of per.sort((a, b) => b.tris - a.tris).slice(0, 6)) console.log(`   item #${p.k}: ${p.tris} tris ${p.ms} ms ${JSON.stringify(p.stats)}`);
    if (cs) console.log(`   sheets ${JSON.stringify(Object.fromEntries(Object.entries(cs).map(([k, v]) => [k, Math.round(v)])))}`);
    const tris = b.triangleCount;
    rows.push({ key, items: c.items.length, tris, colliders: b.colliders.length, ms: +ms.toFixed(1), slowestMs: +slow.toFixed(1), slowest: slowTag });
    total.tris += tris;
    total.items += c.items.length;
    total.ms += ms;
    total.colliders += b.colliders.length;
    log(`cell ${key}: ${c.items.length} items, ${tris} tris, ${b.colliders.length} colliders, ${ms.toFixed(0)} ms (slowest item ${slow.toFixed(1)} ms ${slowTag})`);
  }
  log(`total: ${JSON.stringify({ ...total, ms: +total.ms.toFixed(0) })}`);
  if (args.json) writeFileSync(resolve(root, String(args.json)), JSON.stringify({ profile: hm.profile, rows, total }, null, 1));
} finally {
  await server.close();
}
