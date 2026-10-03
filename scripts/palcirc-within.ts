// Dev probe (palcirc crew): nested ('within') landmarks whose pad differs from the host's.
import * as atlas from '../src/data/atlas';
import { landmarkPads } from '../src/world/rome/buildRome';
const pads = new Map(landmarkPads(atlas.CITY_BOUNDS).map((p) => [p.id, p]));
for (const lm of atlas.LANDMARKS as any[]) {
  if (!lm.within) continue;
  const host = atlas.LANDMARK_BY_ID[lm.within] as any;
  console.log(lm.id.padEnd(28), 'in', String(lm.within).padEnd(24), 'base', lm.baseElevation, 'host', host?.baseElevation, pads.has(lm.id) ? 'PAD' : '-', pads.has(lm.within) ? 'hostPAD' : '-');
}
