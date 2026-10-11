// Route reach of every named place (a probe for scripts/audit/routes.mjs --probe, phase 4 routes audit).
//
//   node scripts/audit/routes.mjs --probe scripts/audit/routes-places.js > scripts/audit/out/routes-places.json
//
// Runs the quest route's own street router (src/nav/streetRouter.ts with src/nav/plan.ts's PLAN) from
// the Golden Milestone to every quest location and every landmark, and back, and reports:
//   isolated   street-graph nodes with no edge at all (landmark entrances, piazza and plaza centres
//              the graph builder could not link): routeBetween may start or end on them and fail;
//   bad        places a route to cannot end on the streets: 'no route (fallback)' (every node within
//              PLAN.entryReach is cut off, so plan.ts falls back to the nearest node of the player's
//              network and draws the rest straight: `straight` m) or 'long lead' (the last street node is
//              more than 30 m away: the rest is drawn straight, through whatever stands between);
//   badFrom    places from which a route cannot start on the streets (the same fallback).
// No walking: about a minute. A fixed street graph should bring `bad` and `badFrom` down.
const { StreetRouter } = await import('/src/nav/streetRouter.ts');
const { PLAN } = await import('/src/nav/plan.ts');
const st = game.streets;
const R = new StreetRouter(st);
const deg = new Int32Array(st.nodes.length);
for (const e of st.edges) (deg[e[0]]++, deg[e[1]]++);
const lms = [...game.landmarks.values()].map((pl) => ({ id: pl.lm.id, name: pl.lm.name, x: pl.position.x, z: pl.position.z }));
const nearLm = (x, z) => {
  let b = null;
  let bd = Infinity;
  for (const l of lms) {
    const d = Math.hypot(l.x - x, l.z - z);
    if (d < bd) ((bd = d), (b = l.id));
  }
  return `${b}@${Math.round(bd)}`;
};
const iso = [];
const isoKinds = {};
st.nodes.forEach((n, i) => {
  if (deg[i] === 0) {
    isoKinds[n.kind] = (isoKinds[n.kind] ?? 0) + 1;
    iso.push([i, n.kind, Math.round(n.x), Math.round(n.z), nearLm(n.x, n.z)]);
  }
});
// Every place a quest can name, and every landmark: would a route from the Forum end on the streets
// near it, or degenerate into a straight line (no reachable node within reach)?
const places = [
  ...(game.locations?.all() ?? []).map((l) => ({ id: `loc:${l.id}`, x: l.position.x, z: l.position.z })),
  ...lms.map((l) => ({ id: `lm:${l.id}`, x: l.x, z: l.z })),
];
const bad = [];
let checked = 0;
for (const p of places) {
  checked++;
  const r = R.routeBetween(0, 6, p.x, p.z, PLAN.entryReach, PLAN.offGraph, PLAN.nodeReach);
  if (!r) {
    const na = R.nearest(0, 6, PLAN.nodeReach);
    const nb = R.nearest(p.x, p.z, PLAN.nodeReach * 3, R.comp[na]);
    bad.push({ id: p.id, at: [Math.round(p.x), Math.round(p.z)], why: 'no route (fallback)', straight: nb >= 0 ? Math.round(Math.hypot(R.x[nb] - p.x, R.z[nb] - p.z)) : null });
    continue;
  }
  const last = r[r.length - 1];
  const lead = Math.hypot(R.x[last] - p.x, R.z[last] - p.z);
  if (lead > 30) bad.push({ id: p.id, at: [Math.round(p.x), Math.round(p.z)], why: 'long lead', straight: Math.round(lead) });
}
// Starting from each place (the player standing there) to the Forum.
const badFrom = [];
for (const p of places) {
  const r = R.routeBetween(p.x, p.z, 0, 6, PLAN.entryReach, PLAN.offGraph, PLAN.nodeReach);
  if (!r) badFrom.push({ id: p.id, at: [Math.round(p.x), Math.round(p.z)] });
}
return JSON.stringify({ nodes: st.nodes.length, isolated: iso.length, isoKinds, iso: iso.slice(0, 200), checked, bad, badFrom });
