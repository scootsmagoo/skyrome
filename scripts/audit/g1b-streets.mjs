#!/usr/bin/env node
/**
 * GROUND part 2 (G1b) helper: are the minor streets steeper because the ground changed, or because
 * the city re-planned on it? Builds the ground and the city plan under v1 and v2, then profiles each
 * plan's streets on each ground (4 m windows, as grades.mjs) and counts those over 45 / 58 / 84 %.
 * The same streets on both grounds isolate the terrain's own effect from the re-plan.
 *
 *   node scripts/audit/g1b-streets.mjs [--list 58] [--json out.json]
 *
 * --list p: print the streets of the v1 plan that are over p % on v2 and not on v1, with where.
 */
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const opt = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
const server = await createServer({ root, logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
const load = (p) => server.ssrLoadModule(p);
const atlas = await load('/src/data/atlas.ts');
const HM = await load('/src/world/terrain/heightmap.ts');
const { setTerrainProfile } = await load('/src/world/terrain/profile.ts');
const { landmarkPads } = await load('/src/world/rome/buildRome.ts');
const { planCity, scaleBounds } = await load('/src/world/city/plan.ts');
const G = await load('/src/dev/audit/grades.ts');

const box = (b, m = 0) => ({ minX: b.minX - m, maxX: b.maxX + m, minZ: b.minZ - m, maxZ: b.maxZ + m });
const lbs = [box(atlas.CORE_BOUNDS, 350), ...atlas.DETAIL_REGIONS.map((r) => box(r, 100))];
const lb = { minX: Math.min(...lbs.map((b) => b.minX)), maxX: Math.max(...lbs.map((b) => b.maxX)), minZ: Math.min(...lbs.map((b) => b.minZ)), maxZ: Math.max(...lbs.map((b) => b.maxZ)) };
const SRC = { BASE_ELEVATION: atlas.BASE_ELEVATION, HILLS: atlas.HILLS, LOWLANDS: atlas.LOWLANDS, RIVERS: atlas.RIVERS, ISLANDS: atlas.ISLANDS, ROADS: atlas.ROADS, bounds: atlas.CITY_BOUNDS };

const world = {};
for (const p of ['v1', 'v2']) {
  setTerrainProfile(p);
  const hm = HM.buildHeightmap(SRC, { spacing: 2, pads: landmarkPads(lb) });
  const plan = planCity(atlas, hm, { detailBounds: scaleBounds(atlas.CORE_BOUNDS, 150), corridorDetail: 150 });
  world[p] = { hm, plan };
  console.log(`${p}: ${plan.streets.length} streets`);
}
setTerrainProfile(null);

const steepest = (hm, pts) => {
  const pr = G.profile((x, z) => hm.heightAt(x, z), pts, 1, 4);
  let m = 0, at = null;
  for (let i = 0; i < pr.grade.length; i++) if (Math.abs(pr.grade[i]) > m) { m = Math.abs(pr.grade[i]); at = [pr.x[i], pr.y[i], pr.z[i]]; }
  return { pct: Math.round(m * 100), at };
};
const out = {};
for (const planP of ['v1', 'v2']) {
  for (const groundP of ['v1', 'v2']) {
    const rows = world[planP].plan.streets.map((s) => ({ id: s.id, ...steepest(world[groundP].hm, s.points) }));
    const n = (p) => rows.filter((r) => r.pct > p).length;
    out[`${planP} plan on ${groundP} ground`] = { over45: n(45), over58: n(58), over84: n(84), rows };
    console.log(`${planP} plan on ${groundP} ground: over 45 % ${n(45)}, over 58 % ${n(58)}, over 84 % ${n(84)}`);
  }
}
const lim = opt('--list');
if (lim !== undefined) {
  const a = out['v1 plan on v1 ground'].rows, b = out['v1 plan on v2 ground'].rows;
  for (let i = 0; i < a.length; i++) {
    if (b[i].pct > +lim && a[i].pct <= +lim) console.log(`  ${b[i].id} ${a[i].pct} → ${b[i].pct} % at ${b[i].at.map((v) => v.toFixed(1)).join(',')}`);
  }
}
if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify(out));
await server.close();
