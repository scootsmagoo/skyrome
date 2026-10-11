// Walk segments on the built nav grid (phase 4b ROUTES crew): for each pair of world points, stand between them,
// let the city and the nav grid build, and return the grid's smoothed path with floor heights. Used to draw the
// explicit walks of src/world/city/walks.ts (turned into each landmark's local frame).
//
//   node scripts/audit/routes.mjs --probe scripts/audit/routes-4b-walks.js
const grid = game.population.grid;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const segs = [
  ['aug-arg', [109.2, -100.8], [117.3, -47.9]],
  ['aug-gate', [109.2, -100.8], [72.5, -123]],
  ['gate-square', [72.5, -123], [39.1, -162.8]],
  ['square-court', [39.1, -162.8], [-2.4, -212.2]],
  ['court-693', [-2.4, -212.2], [57, -219]],
  ['caesar-aug', [42, -73.2], [109.2, -100.8]],
  ['caesar-forum', [42, -73.2], [18.2, -37.3]],
  ['caesar-arg', [42, -73.2], [84.3, -34.5]],
  ['caupona', [-105, 312], [-118.1, 307.1]],
  ['ludus-gate-glaucus', [507.4, 164.9], [522.7, 197.6]],
];
const r1 = (v) => Math.round(v * 10) / 10;
const out = [];
for (const [name, a, b] of segs) {
  await audit.placeAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, undefined, true);
  for (let t = 0; t < 80 && !(grid.ready(a[0], a[1]) && grid.ready(b[0], b[1])); t++) await sleep(250);
  const s = grid.walkable(a[0], a[1]) ? { x: a[0], z: a[1] } : grid.nearestWalkable(a[0], a[1], 5);
  const e = grid.walkable(b[0], b[1]) ? { x: b[0], z: b[1] } : grid.nearestWalkable(b[0], b[1], 5);
  const rec = { name, ready: [grid.ready(a[0], a[1]), grid.ready(b[0], b[1])], s: s && [r1(s.x), r1(s.z)], e: e && [r1(e.x), r1(e.z)] };
  if (s && e) {
    let p = grid.findPath(s.x, s.z, e.x, e.z, 40000);
    if (p) {
      p = grid.smooth(s.x, s.z, p);
      let len = 0, px = s.x, pz = s.z;
      for (const q of p) ((len += Math.hypot(q.x - px, q.z - pz)), (px = q.x), (pz = q.z));
      rec.len = r1(len);
      rec.straight = r1(Math.hypot(e.x - s.x, e.z - s.z));
      rec.pts = [[r1(s.x), r1(s.z), r1(grid.floorAt(s.x, s.z) ?? NaN)], ...p.map((q) => [r1(q.x), r1(q.z), r1(grid.floorAt(q.x, q.z) ?? NaN)])];
    } else rec.path = null;
  }
  out.push(rec);
}
return JSON.stringify(out);
