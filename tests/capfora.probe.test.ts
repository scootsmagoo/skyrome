// TEMP probe (not committed): terrain around capfora landmarks.
import { it } from 'vitest';
import * as atlas from '../src/data/atlas';
import { buildHeightmap } from '../src/world/terrain/heightmap';
import { landmarkPads } from '../src/world/rome/buildRome';
import { toGame } from '../src/world/coords';

it('probe', () => {
  const b = { minX: -450, maxX: 500, minZ: -500, maxZ: 400 };
  const hm = buildHeightmap({ ...atlas, bounds: b } as any, { spacing: 2, pads: landmarkPads(atlas.CITY_BOUNDS) });
  const ids = (process.env.IDS ?? '').split(',').filter(Boolean);
  const S = 0.6;
  for (const id of ids) {
    const lm = atlas.LANDMARK_BY_ID[id];
    const [gx, gz] = toGame(lm.center[0], lm.center[1]);
    const y0 = hm.heightAt(gx, gz);
    const th = (lm.rotation * Math.PI) / 180;
    const c = Math.cos(th), s = Math.sin(th);
    const fp = lm.footprint as any;
    const w = (fp.w ?? 2 * (fp.r ?? fp.rx ?? 50)) * S, d = (fp.d ?? 2 * (fp.r ?? fp.rz ?? 50)) * S;
    const k = Number(process.env.K ?? 1.6);
    const n = 9;
    const rows: string[] = [];
    for (let j = 0; j < n; j++) {
      const lz = (-d / 2) * k + (d * k * j) / (n - 1);
      const cells: string[] = [];
      for (let i = 0; i < n; i++) {
        const lx = (-w / 2) * k + (w * k * i) / (n - 1);
        const wx = gx + lx * c - lz * s;
        const wz = gz + lx * s + lz * c;
        cells.push((hm.heightAt(wx, wz) - y0).toFixed(1).padStart(6));
      }
      rows.push(`lz ${lz.toFixed(0).padStart(4)} |` + cells.join(''));
    }
    console.log(`${id} y0=${y0.toFixed(2)} (real ${(y0 / S).toFixed(1)}) w=${w.toFixed(1)} d=${d.toFixed(1)} grid x${k} (local game, facade at -z)\n` + rows.join('\n'));
  }
});
