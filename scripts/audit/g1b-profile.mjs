#!/usr/bin/env node
/**
 * GROUND part 2 (G1b) helper: one road's profile on the terrain as the game builds it, every
 * metre along the atlas line (game m): the ground, the 4 m grade, and the pads whose footprint or
 * blend the point lies in. Offline, a few seconds.
 *
 *   node scripts/audit/g1b-profile.mjs <roadId> [--from s] [--to s] [--over 0.22] [--plan]
 *
 * --plan: the city plan's line for the road (detoured round footprints; what grades.mjs measures).
 *
 * Profile: SKYROME_TERRAIN=v1|v2 (default v2). Prints only the stretches over `--over` (rise / run).
 */
import { createServer } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const id = argv[0];
const opt = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? Number(argv[i + 1]) : d;
};
const server = await createServer({ root, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
const load = (p) => server.ssrLoadModule(p);
const atlas = await load('/src/data/atlas.ts');
const HM = await load('/src/world/terrain/heightmap.ts');
const { landmarkPads } = await load('/src/world/rome/buildRome.ts');
const G = await load('/src/dev/audit/grades.ts');
const { WORLD_SCALE: S } = await load('/src/world/coords.ts');
const box = (b, m = 0) => ({ minX: b.minX - m, maxX: b.maxX + m, minZ: b.minZ - m, maxZ: b.maxZ + m });
const lbs = [box(atlas.CORE_BOUNDS, 350), ...atlas.DETAIL_REGIONS.map((r) => box(r, 100))];
const lb = { minX: Math.min(...lbs.map((b) => b.minX)), maxX: Math.max(...lbs.map((b) => b.maxX)), minZ: Math.min(...lbs.map((b) => b.minZ)), maxZ: Math.max(...lbs.map((b) => b.maxZ)) };
const SRC = { BASE_ELEVATION: atlas.BASE_ELEVATION, HILLS: atlas.HILLS, LOWLANDS: atlas.LOWLANDS, RIVERS: atlas.RIVERS, ISLANDS: atlas.ISLANDS, ROADS: atlas.ROADS, BRIDGES: atlas.BRIDGES, bounds: atlas.CITY_BOUNDS };
const PADS = landmarkPads(lb);
const hm = HM.buildHeightmap(SRC, { spacing: 2, pads: PADS });
const r = atlas.ROADS.find((x) => x.id === id.split('~')[0]);
if (!r) throw new Error(`no road ${id}`);
console.log(`${id} (${hm.profile}) width ${r.width} ${r.paving}; atlas points ${JSON.stringify(r.points)}`);
let line = r.points.map(([x, z]) => [x * S, z * S]);
if (argv.includes('--plan')) {
  const { planCity, scaleBounds } = await load('/src/world/city/plan.ts');
  const plan = planCity(atlas, hm, { detailBounds: scaleBounds(atlas.CORE_BOUNDS, 150), corridorDetail: 150 });
  line = plan.roads.find((x) => x.id === id).points;
  console.log(`plan line (game m): ${JSON.stringify(line.map((p) => p.map((v) => Math.round(v * 10) / 10)))}`);
}
const p = G.profile((x, z) => hm.heightAt(x, z), line, 1, 4);
const from = opt('from', 0), to = opt('to', Infinity), over = opt('over', 0.22);
const padsAt = (gx, gz) => PADS.map((pad) => ({ pad, sd: HM.signedDistance(gx / S, gz / S, pad.polygon) })).filter((e) => e.sd < 20).map((e) => `${e.pad.id}${e.pad.grow !== undefined && e.sd <= -e.pad.grow ? '[core]' : ''} sd ${e.sd.toFixed(1)} @${e.pad.elevationV2 ?? e.pad.elevation ?? 'mean'}`).join('; ');
for (let i = 0; i < p.s.length; i++) {
  if (p.s[i] < from || p.s[i] > to || Math.abs(p.grade[i]) <= over) continue;
  console.log(`s ${p.s[i].toFixed(0).padStart(5)}  (${p.x[i].toFixed(1)}, ${p.y[i].toFixed(2)}, ${p.z[i].toFixed(1)})  ${(p.grade[i] * 100).toFixed(0).padStart(4)}%  ${padsAt(p.x[i], p.z[i])}`);
}
await server.close();
process.exit(0);
