// Dev probe (palcirc crew): atlas points / roads in a landmark's LOCAL frame (game metres).
// Run: node scripts/palcirc-run.mjs scripts/palcirc-rel.ts <hostId> [roadId|landmarkId ...]
import * as atlas from '../src/data/atlas';
const [host, ...rest] = process.argv.slice(2);
const h = atlas.LANDMARK_BY_ID[host];
const th = (h.rotation * Math.PI) / 180;
const loc = (x: number, z: number) => {
  const dx = (x - h.center[0]) * 0.6, dz = (z - h.center[1]) * 0.6;
  return [dx * Math.cos(th) + dz * Math.sin(th), -dx * Math.sin(th) + dz * Math.cos(th)].map((v) => +v.toFixed(1));
};
for (const id of rest) {
  const r = atlas.ROADS.find((rr) => rr.id === id);
  if (r) console.log(id, 'w', r.width, r.points.map(([x, z]) => loc(x, z)));
  const l = atlas.LANDMARK_BY_ID[id];
  if (l) console.log(id, 'centre', loc(l.center[0], l.center[1]), 'rot', l.rotation - h.rotation);
}
