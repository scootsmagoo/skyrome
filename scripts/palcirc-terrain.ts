// Dev probe (palcirc crew): terrain heights (m ASL) around landmarks, padded/natural.
// Run: node scripts/palcirc-run.mjs scripts/palcirc-terrain.ts <id|all> [step]
import * as atlas from '../src/data/atlas';
import { buildHeightmap, makeNaturalElevation } from '../src/world/terrain/heightmap';
import { landmarkPads } from '../src/world/rome/buildRome';

const MINE = [
  'domus-tiberiana', 'domus-flavia', 'domus-augustana', 'palatine-stadium', 'paedagogium', 'temple-apollo-palatinus', 'house-augustus',
  'house-livia', 'temple-magna-mater', 'casa-romuli', 'lupercal', 'adonaea', 'temple-victoria', 'circus-maximus', 'obelisk-circus-maximus',
  'pulvinar', 'arch-titus-circus', 'temple-ceres', 'temple-sol-circus', 'porta-capena',
];
const arg = process.argv[2] ?? 'all';
const step = Number(process.argv[3] ?? 10);
const bounds = { minX: -700, maxX: 1000, minZ: -100, maxZ: 1400 };
const hm = buildHeightmap({ ...atlas, bounds } as any, { spacing: 2, pads: landmarkPads(atlas.CITY_BOUNDS) });
const nat = makeNaturalElevation({ ...atlas, bounds } as any);

function frame(lm: (typeof atlas.LANDMARKS)[number]) {
  const th = (lm.rotation * Math.PI) / 180;
  const cos = Math.cos(th), sin = Math.sin(th);
  const tr = (lx: number, lz: number) => [lm.center[0] + lx * cos - lz * sin, lm.center[1] + lx * sin + lz * cos];
  const fp = lm.footprint as any;
  const hw = fp.w ? fp.w / 2 : fp.rx ?? fp.r;
  const hd = fp.d ? fp.d / 2 : fp.rz ?? fp.r;
  return { tr, hw, hd };
}
const H = (x: number, z: number) => hm.heightAt(x * 0.6, z * 0.6) / 0.6;

if (arg === 'all') {
  for (const id of MINE) {
    const lm = atlas.LANDMARK_BY_ID[id];
    const { tr, hw, hd } = frame(lm);
    const pts: [string, number, number][] = [['c', 0, 0], ['F', 0, -hd], ['B', 0, hd], ['L', -hw, 0], ['R', hw, 0], ['F+10', 0, -hd - 10], ['B+10', 0, hd + 10]];
    const s = pts.map(([n, lx, lz]) => {
      const [x, z] = tr(lx, lz);
      return `${n}:${H(x, z).toFixed(1)}/${nat(x, z).toFixed(0)}`;
    });
    console.log(id.padEnd(24), String(lm.baseElevation ?? '-').padStart(5), s.join('  '));
  }
} else {
  const lm = atlas.LANDMARK_BY_ID[arg];
  const { tr, hw, hd } = frame(lm);
  console.log(arg, 'center', lm.center, 'rot', lm.rotation, 'base', lm.baseElevation, 'w', hw * 2, 'd', hd * 2);
  const xs = [-hw - 20, -hw, -hw / 2, 0, hw / 2, hw, hw + 20];
  console.log('lz\\lx  ' + xs.map((x) => x.toFixed(0).padStart(11)).join(''));
  for (let lz = -hd - 40; lz <= hd + 40; lz += step) {
    const row = xs.map((lx) => {
      const [x, z] = tr(lx, lz);
      return `${H(x, z).toFixed(1)}/${nat(x, z).toFixed(0)}`.padStart(11);
    });
    console.log(String(Math.round(lz)).padStart(6) + ' ' + row.join(''));
  }
}
