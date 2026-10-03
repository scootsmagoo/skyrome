// Dev probe (palcirc crew): terrain (relative to a landmark's pad, game m) on a local grid.
// node scripts/palcirc-run.mjs scripts/palcirc-local.ts <id> x0 x1 dx z0 z1 dz
import * as atlas from '../src/data/atlas';
import { buildHeightmap } from '../src/world/terrain/heightmap';
import { landmarkPads } from '../src/world/rome/buildRome';
const [id, x0, x1, dx, z0, z1, dz] = process.argv.slice(2);
const lm = atlas.LANDMARK_BY_ID[id];
const bounds = { minX: lm.center[0] - 700, maxX: lm.center[0] + 700, minZ: lm.center[1] - 700, maxZ: lm.center[1] + 700 };
const hm = buildHeightmap({ ...atlas, bounds } as any, { spacing: 2, pads: landmarkPads(atlas.CITY_BOUNDS) });
const S = 0.6;
const gx = lm.center[0] * S, gz = lm.center[1] * S;
const base = hm.heightAt(gx, gz);
const th = (lm.rotation * Math.PI) / 180;
const c = Math.cos(th), s = Math.sin(th);
const at = (lx: number, lz: number) => hm.heightAt(gx + lx * c - lz * s, gz + lx * s + lz * c) - base;
const xs: number[] = [];
for (let x = +x0; x <= +x1 + 1e-6; x += +dx) xs.push(x);
console.log(id, 'base y', base.toFixed(2), '(' + (base / S).toFixed(1) + ' m)');
console.log('z\\x'.padStart(7) + xs.map((x) => x.toFixed(0).padStart(7)).join(''));
for (let z = +z0; z <= +z1 + 1e-6; z += +dz) console.log(z.toFixed(0).padStart(7) + xs.map((x) => at(x, z).toFixed(1).padStart(7)).join(''));
