// Dev probe (palcirc crew): landmarks near the Palatine / Circus area.
import * as atlas from '../src/data/atlas';
const box = { minX: -300, maxX: 650, minZ: 150, maxZ: 1050 };
for (const lm of atlas.LANDMARKS) {
  const [x, z] = lm.center;
  if (x < box.minX || x > box.maxX || z < box.minZ || z > box.maxZ) continue;
  const fp = lm.footprint as any;
  const dims = fp.kind === 'rect' ? `${fp.w}x${fp.d}` : fp.kind === 'ellipse' ? `e${fp.rx}x${fp.rz}` : fp.kind === 'circle' ? `r${fp.r}` : 'poly';
  console.log(lm.id.padEnd(30), lm.category.padEnd(12), `[${x},${z}]`.padEnd(12), `rot ${lm.rotation}`.padEnd(9), dims.padEnd(10), `h${lm.height} base${lm.baseElevation ?? '-'} p${lm.priority}`);
}
for (const k of Object.keys(atlas)) console.log('export', k);
