// TEMP probe (not committed): local terrain grid in a landmark frame (game metres).
import { it } from 'vitest';
import * as atlas from '../src/data/atlas';
import { buildHeightmap } from '../src/world/terrain/heightmap';
import { landmarkPads } from '../src/world/rome/buildRome';
import { toGame } from '../src/world/coords';

it('probe2', () => {
  const b = { minX: -450, maxX: 500, minZ: -500, maxZ: 400 };
  const hm = buildHeightmap({ ...atlas, bounds: b } as any, { spacing: 2, pads: landmarkPads(atlas.CITY_BOUNDS) });
  const id = process.env.ID!;
  const [x0, x1, z0, z1, st] = (process.env.BOX ?? '-40,40,-60,30,5').split(',').map(Number);
  const lm = atlas.LANDMARK_BY_ID[id];
  const [gx, gz] = toGame(lm.center[0], lm.center[1]);
  const y0 = hm.heightAt(gx, gz);
  const th = (lm.rotation * Math.PI) / 180;
  const c = Math.cos(th), s = Math.sin(th);
  const rows: string[] = ['        ' + Array.from({ length: Math.floor((x1 - x0) / st) + 1 }, (_, i) => String(x0 + i * st).padStart(6)).join('')];
  for (let lz = z0; lz <= z1; lz += st) {
    const cells: string[] = [];
    for (let lx = x0; lx <= x1; lx += st) {
      const wx = gx + lx * c - lz * s;
      const wz = gz + lx * s + lz * c;
      cells.push((hm.heightAt(wx, wz) - y0).toFixed(1).padStart(6));
    }
    rows.push(`z ${String(lz).padStart(5)} |` + cells.join(''));
  }
  console.log(`${id} y0=${y0.toFixed(2)}\n` + rows.join('\n'));
});
