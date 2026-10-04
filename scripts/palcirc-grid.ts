// Dev probe (palcirc crew): terrain (game y relative to the landmark pad) on a LOCAL game-metre grid.
// Run: node scripts/palcirc-run.mjs scripts/palcirc-grid.ts <id> x0 x1 dx z0 z1 dz
import * as atlas from '../src/data/atlas';
import { buildHeightmap } from '../src/world/terrain/heightmap';
import { landmarkPads } from '../src/world/rome/buildRome';
const [id, ...nums] = process.argv.slice(2);
const [x0, x1, dx, z0, z1, dz] = nums.map(Number);
const lm = atlas.LANDMARK_BY_ID[id];
const bounds = { minX: lm.center[0] - 700, maxX: lm.center[0] + 700, minZ: lm.center[1] - 700, maxZ: lm.center[1] + 700 };
const hm = buildHeightmap({ ...atlas, bounds } as any, { spacing: 2, pads: landmarkPads(atlas.CITY_BOUNDS) });
const gx = lm.center[0] * 0.6, gz = lm.center[1] * 0.6;
const r = -(lm.rotation * Math.PI) / 180;
const c = Math.cos(r), s = Math.sin(r);
const base = hm.heightAt(gx, gz);
const at = (lx: number, lz: number) => hm.heightAt(gx + lx * c + lz * s, gz - lx * s + lz * c) - base;
console.log(id, 'pad y', base.toFixed(2));
const xs: number[] = [];
for (let x = x0; x <= x1 + 1e-6; x += dx) xs.push(x);
console.log('z\\x'.padStart(6) + xs.map((x) => String(x).padStart(7)).join(''));
for (let z = z0; z <= z1 + 1e-6; z += dz) console.log(String(z).padStart(6) + xs.map((x) => at(x, z).toFixed(1).padStart(7)).join(''));
