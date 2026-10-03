// Dev probe (palcirc crew): which padded landmarks are sited on slopes.
import * as atlas from '../src/data/atlas';
import { landmarkPads } from '../src/world/rome/buildRome';
const pads = new Set(landmarkPads(atlas.CITY_BOUNDS).map((p) => p.id));
for (const lm of atlas.LANDMARKS as any[]) {
  if (lm.siting && lm.siting !== 'pad') console.log(lm.id.padEnd(30), lm.category.padEnd(12), lm.siting.padEnd(12), pads.has(lm.id) ? 'PADDED' : '-', lm.baseElevation ?? '-', 'p' + lm.priority);
}
