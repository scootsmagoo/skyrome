#!/usr/bin/env node
/**
 * GROUND part 2 (G1b) helper: the designed hill flanks' top grade under a terrain profile. The
 * grades audit (`grades.mjs` designMaxDeg) uses v1's shape for every profile (smoothstep, 1.5 × the
 * mean, the atlas `slope` run); this reads the profile's own: v2's eased-linear flank (1.25 × the
 * mean) and its longer runs (heightmap.ts `V2_FLANK_RUN`). The foot is found as grades.mjs finds
 * it (median ground `run + 8` m out from the outline on the natural landform, no roads, pads or
 * noise). Also measures the steepest 4 m along every outline vertex's outward normal on that
 * landform, from the plateau edge to the foot, leaving out an atlas cliff's reach (CLIFF_RUN 13 m
 * + 70 m blend). Offline, a few seconds.
 *
 *   node scripts/audit/g1b-flanks.mjs [--top 12]       (SKYROME_TERRAIN=v1|v2, default v2)
 */
import { createServer } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const TOP = argv.includes('--top') ? Number(argv[argv.indexOf('--top') + 1]) : 12;
const server = await createServer({ root, logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
const load = (p) => server.ssrLoadModule(p);
const atlas = await load('/src/data/atlas.ts');
const HM = await load('/src/world/terrain/heightmap.ts');
const { terrainProfile } = await load('/src/world/terrain/profile.ts');
const profile = terrainProfile();
const SRC = { BASE_ELEVATION: atlas.BASE_ELEVATION, HILLS: atlas.HILLS, LOWLANDS: atlas.LOWLANDS, RIVERS: atlas.RIVERS, ISLANDS: atlas.ISLANDS, ROADS: atlas.ROADS, BRIDGES: atlas.BRIDGES, bounds: atlas.CITY_BOUNDS };
const nat = HM.makeNaturalElevation(SRC, { noise: 0, profile });
const DEG = (g) => +((Math.atan(g) * 180) / Math.PI).toFixed(1);
const b = atlas.CITY_BOUNDS;
const rows = [];
for (const h of atlas.HILLS) {
  if (!h.outline.some(([x, z]) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ)) continue;
  const run = HM.flankRun(h, profile);
  let cx = 0, cz = 0;
  for (const [x, z] of h.outline) {
    cx += x;
    cz += z;
  }
  cx /= h.outline.length;
  cz /= h.outline.length;
  const feet = h.outline.map(([x, z]) => {
    const L = Math.hypot(x - cx, z - cz) || 1;
    return nat(x + ((x - cx) / L) * (run + 8), z + ((z - cz) / L) * (run + 8));
  }).sort((a, c) => a - c);
  const foot = feet[Math.floor(feet.length / 2)];
  const rise = Math.max(0, h.plateau - foot);
  const design = (HM.flankTopFactor(profile) * rise) / run;
  // Measured: along each vertex's outward normal (from the centroid), 4 m windows.
  let worst = 0, at = null;
  const cliffs = profile === 'v1' ? (h.cliffs ?? []) : (h.cliffs ?? []).flatMap((c) => HM.clipCliff(c, atlas.ROADS));
  const nearCliff = (x, z) => cliffs.some((c) => HM.segDist2 ? Math.sqrt(HM.segDist2(x, z, c.a[0], c.a[1], c.b[0], c.b[1])) < 83 : false);
  for (const [x, z] of h.outline) {
    const L = Math.hypot(x - cx, z - cz) || 1;
    const ux = (x - cx) / L, uz = (z - cz) / L;
    let prev = null;
    for (let d = 0; d <= run; d += 4) {
      const px = x + ux * d, pz = z + uz * d;
      if (nearCliff(px, pz)) {
        prev = null;
        continue;
      }
      const y = nat(px, pz);
      if (prev !== null) {
        const g = Math.abs(y - prev) / 4;
        if (g > worst) {
          worst = g;
          at = [Math.round(px * 6) / 10, Math.round(y * 6) / 10, Math.round(pz * 6) / 10];
        }
      }
      prev = y;
    }
  }
  rows.push({ id: h.id, run, rise: +rise.toFixed(1), designDeg: DEG(design), measuredDeg: DEG(worst), at, cliffs: cliffs.length });
}
rows.sort((a, c) => c.designDeg - a.designDeg);
console.log(`designed flanks (${profile}): top grade = ${HM.flankTopFactor(profile)} × rise / run; measured = steepest 4 m on the natural landform off the cliffs' reach`);
for (const r of rows.slice(0, TOP)) console.log(`  ${r.id.padEnd(24)} run ${String(r.run).padStart(4)} m, rise ${String(r.rise).padStart(5)} m: design ${String(r.designDeg).padStart(5)}°, measured ${String(r.measuredDeg).padStart(5)}°${r.at ? ` @${r.at.join(',')}` : ''}${r.cliffs ? ` (${r.cliffs} cliff pieces)` : ''}`);
console.log(`designedFlankTopDeg (${profile}): ${Math.max(...rows.map((r) => r.designDeg))}`);
await server.close();
process.exit(0);
