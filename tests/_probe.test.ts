import { it } from 'vitest';
import * as atlas from '../src/data/atlas';
import { buildHeightmap } from '../src/world/terrain/heightmap';
import { landmarkPads } from '../src/world/rome/buildRome';
import { WORLD_SCALE } from '../src/world/coords';

it('probe', () => {
  const S = WORLD_SCALE;
  const bounds = { minX: 300, maxX: 1400, minZ: -450, maxZ: 1000 };
  const hm = buildHeightmap({ ...atlas, bounds } as any, { spacing: 2, pads: landmarkPads(atlas.CITY_BOUNDS) });
  const y = (x: number, z: number) => hm.heightAt(x * S, z * S) / S;
  const ids = ['colosseum', 'ludus-magnus', 'ludus-dacicus', 'ludus-matutinus', 'ludus-gallicus', 'castra-misenatium', 'moneta', 'meta-sudans', 'baths-titus', 'baths-trajan', 'domus-aurea-buried', 'sette-sale', 'porticus-liviae', 'lacus-orphei', 'domus-plinii', 'temple-divus-claudius', 'arch-dolabella', 'castra-peregrina', 'macellum-magnum', 'statio-vigiles-v', 'curiae-veteres'];
  for (const id of ids) {
    const lm = atlas.LANDMARK_BY_ID[id];
    const [cx, cz] = lm.center;
    const fp: any = lm.footprint;
    const hw = fp.kind === 'rect' ? fp.w / 2 : fp.kind === 'ellipse' ? fp.rx : fp.r;
    const hd = fp.kind === 'rect' ? fp.d / 2 : fp.kind === 'ellipse' ? fp.rz : fp.r;
    const th = (lm.rotation * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
    const tr = (lx: number, lz: number) => [cx + lx * c - lz * s, cz + lx * s + lz * c];
    const samp: string[] = [];
    for (const [lx, lz, n] of [[0, 0, 'C'], [0, -hd, 'F'], [0, hd, 'B'], [-hw, 0, 'L'], [hw, 0, 'R'], [0, -hd - 20, 'F+20'], [0, hd + 20, 'B+20'], [-hw - 20, 0, 'L+20'], [hw + 20, 0, 'R+20']] as const) {
      const [x, z] = tr(lx as number, lz as number);
      samp.push(`${n}:${y(x, z).toFixed(1)}`);
    }
    console.log(id.padEnd(22), 'base', lm.baseElevation, samp.join(' '));
  }
  const rows: string[] = [];
  for (let z = -420; z <= 950; z += 25) {
    let r = String(z).padStart(5) + ' ';
    for (let x = 400; x <= 1300; x += 20) r += String(Math.round(y(x, z))).padStart(3);
    rows.push(r);
  }
  let hdr = '      ';
  for (let x = 400; x <= 1300; x += 20) hdr += String(x / 10).padStart(3);
  console.log(hdr + '\n' + rows.join('\n'));
  for (const r of atlas.ROADS) {
    if (r.points.some(([x, z]) => x > 400 && x < 1300 && z > -450 && z < 950)) console.log('road', r.id, r.width, JSON.stringify(r.points));
  }
});
