#!/usr/bin/env node
/**
 * GROUND part 2 (G1b) helper: the ground around one game point as the game builds it: the grid
 * samples (game m) in a window, and the pads and atlas roads there (signed distance, real m).
 *
 *   node scripts/audit/g1b-spot.mjs <x> <z> [--r 8]
 */
import { createServer } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const X = Number(argv[0]), Z = Number(argv[1]);
const R = argv.includes('--r') ? Number(argv[argv.indexOf('--r') + 1]) : 8;
const server = await createServer({ root, logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
const load = (p) => server.ssrLoadModule(p);
const atlas = await load('/src/data/atlas.ts');
const HM = await load('/src/world/terrain/heightmap.ts');
const { landmarkPads } = await load('/src/world/rome/buildRome.ts');
const { WORLD_SCALE: S } = await load('/src/world/coords.ts');
const box = (b, m = 0) => ({ minX: b.minX - m, maxX: b.maxX + m, minZ: b.minZ - m, maxZ: b.maxZ + m });
const lbs = [box(atlas.CORE_BOUNDS, 350), ...atlas.DETAIL_REGIONS.map((r) => box(r, 100))];
const lb = { minX: Math.min(...lbs.map((b) => b.minX)), maxX: Math.max(...lbs.map((b) => b.maxX)), minZ: Math.min(...lbs.map((b) => b.minZ)), maxZ: Math.max(...lbs.map((b) => b.maxZ)) };
const PADS = landmarkPads(lb);
const hm = HM.buildHeightmap({ BASE_ELEVATION: atlas.BASE_ELEVATION, HILLS: atlas.HILLS, LOWLANDS: atlas.LOWLANDS, RIVERS: atlas.RIVERS, ISLANDS: atlas.ISLANDS, ROADS: atlas.ROADS, BRIDGES: atlas.BRIDGES, bounds: atlas.CITY_BOUNDS }, { spacing: 2, pads: PADS });
const ix0 = Math.round((X - hm.minX) / hm.spacing), iz0 = Math.round((Z - hm.minZ) / hm.spacing);
const n = Math.round(R / hm.spacing);
console.log(`(${hm.profile}) samples around (${X}, ${Z}), rows z, cols x, step ${hm.spacing} m:`);
console.log('        ' + Array.from({ length: 2 * n + 1 }, (_, i) => String(Math.round(hm.minX + (ix0 - n + i) * hm.spacing)).padStart(6)).join(''));
for (let j = -n; j <= n; j++) {
  const iz = iz0 + j;
  let row = String(Math.round(hm.minZ + iz * hm.spacing)).padStart(6) + '  ';
  for (let i = -n; i <= n; i++) {
    const k = iz * hm.nx + ix0 + i;
    row += (hm.heights[k].toFixed(1) + (hm.roadMask[k] > 0.5 ? 'r' : hm.padMask[k] > 0.5 ? 'p' : ' ')).padStart(6);
  }
  console.log(row);
}
for (const pad of PADS) {
  const sd = HM.signedDistance(X / S, Z / S, pad.polygon);
  if (sd < 40) console.log(`pad ${pad.id} sd ${sd.toFixed(1)} elev ${pad.elevationV2 ?? pad.elevation ?? 'mean'} margin ${pad.margin} grow ${pad.grow}`);
}
for (const r of atlas.ROADS) {
  let best = Infinity;
  for (let i = 0; i + 1 < r.points.length; i++) {
    const [ax, az] = r.points[i], [bx, bz] = r.points[i + 1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    let t = l2 ? ((X / S - ax) * dx + (Z / S - az) * dz) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(ax + dx * t - X / S, az + dz * t - Z / S));
  }
  if (best < 40) console.log(`road ${r.id} (${r.paving}, w ${r.width}) ${best.toFixed(1)} m off its line`);
}
await server.close();
process.exit(0);
