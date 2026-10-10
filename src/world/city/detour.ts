/**
 * Roads round solid buildings (pure, runs in planCity before the atlas roads are stamped).
 *
 * The atlas roads are historical centrelines in real metres; the landmarks are built at game
 * scale on footprints of their own, so a handful of roads (Via Nova through the Horrea
 * Agrippiana, Via Labicana Urbana through the Colosseum…) run straight through a building that
 * has walls and colliders. A walker on such a road ends up pushing against brickwork. Here every
 * span of a road that lies inside a blocking footprint is replaced by a detour along the
 * footprint's outline pushed out by the road's half width plus a gap, on the shorter side. A road
 * that begins or ends inside a footprint (it ends at that building's door) stays, unless it runs
 * `cutMin` m or more into it: then it is cut where it meets the outline.
 */
import { pointInPoly, offsetPoly, type Pt } from './raster';

/** Landmark categories whose footprints a road must not run through (arches, gates, fora, harbours and porticoes are walked through). */
export const BLOCKING = new Set(['temple', 'basilica', 'baths', 'palace', 'warehouse', 'market', 'camp', 'circus', 'amphitheatre', 'theatre', 'stadium', 'library', 'curia', 'prison', 'odeum', 'house', 'tomb', 'other']);

/**
 * How far past its building a detoured road keeps its edge (m): the landmark pads blend into the
 * terrain over a few metres and the buildings have steps, plinths and ramps outside their footprint,
 * so the edge is held clear of all that (the planner's walkable margin is 6 m).
 */
export const DETOUR_GAP = 5;

export interface Blocker {
  id: string;
  poly: readonly Pt[];
  /** Gap beyond the footprint (default DETOUR_GAP), see `blockerGap`. */
  gap?: number;
}

/** Steepest ground (rise per metre) a detoured road's centreline may lie on. */
export const MAX_ROAD_SLOPE = 0.16;
/** Widest gap taken for a building on a raised pad (the pad's blend is 14 m beyond a footprint grown by 3). */
export const MAX_GAP = 17;
/** A road that runs this far (m) into a building from its end is cut at the building's outline (and joined to the roads round it). */
export const CUT_MIN = 10;

/**
 * The gap a road must keep from a building so that it does not climb the bank of its pad: the
 * smallest gap from `DETOUR_GAP` up to `MAX_GAP` at which the ground along the ring (the road's
 * centreline, `centre` m further out for the road's half width) is nowhere steeper than
 * MAX_ROAD_SLOPE. `slope(x, z)` is the ground's gradient there. A building on level ground keeps
 * the base gap.
 */
export function blockerGap(poly: readonly Pt[], slope: (x: number, z: number) => number, centre = 4.4): number {
  const hull = convexHull(poly);
  if (hull.length < 3) return DETOUR_GAP;
  for (let g = DETOUR_GAP; g <= MAX_GAP; g += 2) {
    const ring = offsetPoly(hull, g + centre);
    let ok = true;
    for (let i = 0; i < ring.length && ok; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const n = Math.max(1, Math.ceil(len(a, b) / 3));
      for (let k = 0; k < n; k++) {
        if (slope(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n) > MAX_ROAD_SLOPE) { ok = false; break; }
      }
    }
    if (ok) return g;
  }
  return MAX_GAP;
}

export interface Detour {
  blocker: string;
  /** What was done: 'around' = a detour, 'start' / 'end' = the road was cut. */
  kind: 'around' | 'start' | 'end';
  /** Where the road met the building and left it again. */
  from: Pt;
  to: Pt;
  /** Length of the original span inside the footprint, and of its replacement (m). */
  inside: number;
  detour: number;
}

/** Spans shorter than this inside a footprint are a graze (an overlapping corner), not worth bending a road for. */
const MIN_INSIDE = 1.5;
/** A detour longer than this many times its span (+ SLACK m) is not taken: the road stays. */
const MAX_RATIO = 2.5;
const SLACK = 25;
const STEP = 0.5;
/** Metres of a road inside a building from which its detour keeps the building's full gap. */
const GRAZE = 15;

/** Convex hull (Andrew's monotone chain), counter-clockwise in x/z. */
export function convexHull(pts: readonly Pt[]): Pt[] {
  const p = pts.map((q) => [q[0], q[1]] as Pt).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Pt[] = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const up: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  lo.pop();
  up.pop();
  return lo.concat(up);
}

const len = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Position along a polyline at arc length s (clamped). */
function pointAt(pts: readonly Pt[], cum: readonly number[], s: number): Pt {
  if (s <= 0) return [pts[0][0], pts[0][1]];
  for (let k = 0; k + 1 < pts.length; k++) {
    if (s <= cum[k + 1]) {
      const t = (s - cum[k]) / Math.max(1e-9, cum[k + 1] - cum[k]);
      return [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t];
    }
  }
  const l = pts[pts.length - 1];
  return [l[0], l[1]];
}

/** The nearest point of a closed ring to p: its edge index (edge i runs ring[i] → ring[i+1]) and the position along it. */
function nearestOnRing(ring: readonly Pt[], p: Pt): { edge: number; pt: Pt } {
  let best = Infinity, edge = 0, pt: Pt = [ring[0][0], ring[0][1]];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const q: Pt = [a[0] + dx * t, a[1] + dz * t];
    const d = len(p, q);
    if (d < best) { best = d; edge = i; pt = q; }
  }
  return { edge, pt };
}

/** Length of a polyline's stretches on ground steeper than `limit` (rise per metre), sampled every 2 m. */
export function steepLength(pts: readonly Pt[], slope: (x: number, z: number) => number, limit = MAX_ROAD_SLOPE * 1.5): number {
  let n = 0;
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1];
    const L = len(a, b);
    const m = Math.max(1, Math.ceil(L / 2));
    for (let i = 0; i < m; i++) if (slope(a[0] + ((b[0] - a[0]) * (i + 0.5)) / m, a[1] + ((b[1] - a[1]) * (i + 0.5)) / m) > limit) n += L / m;
  }
  return n;
}

/**
 * The way round a ring from a to b (the ring's vertices between them): the shorter side, or, when a
 * `slope` is given, the side with less of its length on steep ground (a bank of a raised pad) first.
 */
export function around(ring: readonly Pt[], a: Pt, b: Pt, slope?: (x: number, z: number) => number): Pt[] {
  const n = ring.length;
  const cum = [0];
  for (let i = 1; i <= n; i++) cum.push(cum[i - 1] + len(ring[i - 1], ring[i % n]));
  const P = cum[n];
  const A = nearestOnRing(ring, a), B = nearestOnRing(ring, b);
  const pos = (r: { edge: number; pt: Pt }) => cum[r.edge] + len(ring[r.edge], r.pt);
  const pa = pos(A), pb = pos(B);
  const mod = (v: number) => ((v % P) + P) % P;
  const dFw = mod(pb - pa), dBw = P - dFw;
  const fw: Pt[] = [A.pt], bw: Pt[] = [A.pt];
  const vs = ring.map((v, i) => ({ v, i }));
  const f = vs.map((q) => ({ q, d: mod(cum[q.i] - pa) })).filter((o) => o.d > 1e-6 && o.d < dFw - 1e-6).sort((x, y) => x.d - y.d);
  const bk = vs.map((q) => ({ q, d: mod(pa - cum[q.i]) })).filter((o) => o.d > 1e-6 && o.d < dBw - 1e-6).sort((x, y) => x.d - y.d);
  for (const o of f) fw.push(o.q.v);
  for (const o of bk) bw.push(o.q.v);
  fw.push(B.pt);
  bw.push(B.pt);
  const cost = (path: Pt[], length: number) => length + (slope ? steepLength(path, slope) * 25 : 0);
  return cost(fw, dFw) <= cost(bw, dBw) ? fw : bw;
}

/**
 * Bend `pts` round the blockers' footprints. Returns the new polyline and what was done. Each
 * footprint is replaced by its convex hull (the landmark footprints are rectangles, ellipses and
 * mild polygons).
 */
export function detourRoad(pts: readonly Pt[], blockers: readonly Blocker[], halfWidth: number, joints: readonly Pt[] = [], cutMin = Infinity, slope?: (x: number, z: number) => number): { points: Pt[]; detours: Detour[] } {
  // Two buildings close together (the Colosseum and the Baths of Titus) can leave no room for both
  // gaps: a detour round one runs into the other. Try the full gaps, then narrower ones, and take
  // the first road that stays out of every footprint and keeps its joints with other roads (a
  // junction in the removed span would cut the network in two). Joints inside a footprint are lost anyway.
  const hulls = blockers.map((b) => convexHull(b.poly));
  const keep = joints.filter((j) => !hulls.some((h) => pointInPoly(j[0], j[1], h)));
  // The road as it is, the baseline: a candidate must be clearly better, or the road stays.
  const stay = { points: pts.map((p) => [p[0], p[1]] as Pt), detours: [] as Detour[] };
  let best: { points: Pt[]; detours: Detour[] } | null = stay, bestCost = insideLength(stay.points, blockers) * 0.6;
  for (const scale of [1, 0.65, 0.35, 0]) {
    const r = detourOnce(pts, blockers.map((b) => ({ ...b, gap: (b.gap ?? DETOUR_GAP) * scale })), halfWidth, cutMin, slope);
    const lost = keep.filter((j) => distToPolyline(j, r.points) > JOINT_KEEP).length;
    const cost = insideLength(r.points, blockers) + lost * LOST_JOINT;
    if (cost < bestCost - 1e-6) { best = r; bestCost = cost; }
    if (cost < MIN_INSIDE) break;
  }
  return best!;
}

/** What a lost joint costs in metres inside a building (a link repairs it afterwards, see repairJoints). */
const LOST_JOINT = 8;

/** A joint (a crossing or touch with another road) stays joined while the road passes this near. */
const JOINT_KEEP = 2.5;

function distToPolyline(p: Pt, pts: readonly Pt[]): number {
  let d = Infinity;
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0;
    d = Math.min(d, Math.hypot(a[0] + dx * t - p[0], a[1] + dz * t - p[1]));
  }
  return d;
}

export interface Joint {
  /** The two roads (indices into the list given) and where they meet. */
  i: number;
  j: number;
  p: Pt;
}

/** Where roads meet (crossings, and ends within `touch` m of another road). */
export function roadJoints(roads: readonly (readonly Pt[])[], touch = 6): Joint[] {
  const out: Joint[] = [];
  for (let i = 0; i < roads.length; i++) {
    for (let j = i + 1; j < roads.length; j++) {
      const A = roads[i], B = roads[j];
      for (let s = 0; s + 1 < A.length; s++) {
        for (let t = 0; t + 1 < B.length; t++) {
          const h = segHit(A[s], A[s + 1], B[t], B[t + 1]);
          if (h) out.push({ i, j, p: h });
        }
      }
      for (const r of [A, B]) {
        const o = r === A ? B : A;
        for (const e of [r[0], r[r.length - 1]]) if (distToPolyline(e, o) < touch) out.push({ i, j, p: [e[0], e[1]] });
      }
    }
  }
  return out;
}

function segHit(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [a[0] + r[0] * t, a[1] + r[1] * t];
}

/** A link longer than this (m) is not made: the roads really are apart. */
const LINK_MAX = 45;
/** Roads whose nearest points are this close still meet (the street graph joins ends within a road's half width + 3). */
const MEET = 3;

/** The nearest point of a polyline to p. */
function nearestOn(p: Pt, pts: readonly Pt[]): Pt {
  let best: Pt = [pts[0][0], pts[0][1]], bd = Infinity;
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0;
    const q: Pt = [a[0] + dx * t, a[1] + dz * t];
    const d = len(p, q);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}

/**
 * Roads that met before they were bent (`joints`, found on the original lines) and no longer do
 * (a junction stood inside a building, or in the span a detour replaced) get a short link between
 * their nearest points, unless that line would cross a building or is longer than LINK_MAX. Returns the links as
 * [road i, road j, polyline].
 */
export function repairJoints(roads: readonly (readonly Pt[])[], joints: readonly Joint[], blockers: readonly Blocker[]): { i: number; j: number; points: Pt[] }[] {
  const links: { i: number; j: number; points: Pt[] }[] = [];
  const seen = new Set<string>();
  for (const J of joints) {
    const A = roads[J.i], B = roads[J.j];
    const pa = nearestOn(J.p, A), pb = nearestOn(J.p, B);
    // Still meeting: either's nearest point to the old joint lies on the other road.
    if (distToPolyline(pa, B) < MEET || distToPolyline(pb, A) < MEET) continue;
    // Or already linked by one made for another joint of the pair.
    const key = `${J.i}:${J.j}`;
    const fa = nearestOn(pa, B), fb = nearestOn(pb, A);
    const pts: Pt[] = len(pa, fa) <= len(pb, fb) ? [pa, fa] : [fb, pb];
    const L = len(pts[0], pts[1]);
    if (L > LINK_MAX || L < 0.5 || insideLength(pts, blockers) > 0.5) continue;
    if (seen.has(key) && links.some((l) => l.i === J.i && l.j === J.j && len(l.points[0], pts[0]) < 12)) continue;
    seen.add(key);
    links.push({ i: J.i, j: J.j, points: pts });
  }
  return links;
}

/** Length of a polyline inside the blockers' convex hulls (m). */
export function insideLength(pts: readonly Pt[], blockers: readonly Blocker[]): number {
  const hulls = blockers.map((b) => convexHull(b.poly));
  let n = 0;
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1], L = len(a, b);
    const m = Math.max(1, Math.ceil(L / STEP));
    for (let i = 0; i < m; i++) {
      const x = a[0] + ((b[0] - a[0]) * (i + 0.5)) / m, z = a[1] + ((b[1] - a[1]) * (i + 0.5)) / m;
      if (hulls.some((h) => pointInPoly(x, z, h))) n += L / m;
    }
  }
  return n;
}

function detourOnce(pts: readonly Pt[], blockers: readonly Blocker[], halfWidth: number, cutMin: number, slope?: (x: number, z: number) => number): { points: Pt[]; detours: Detour[] } {
  let cur: Pt[] = pts.map((p) => [p[0], p[1]] as Pt);
  const detours: Detour[] = [];
  const rings = blockers.map((b) => {
    const hull = convexHull(b.poly);
    return { id: b.id, hull, gap: b.gap ?? DETOUR_GAP, out: [] as Pt[] };
  });
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const R of rings) {
      if (cur.length < 2 || R.hull.length < 3) continue;
      // A road that only clips the building (a few metres inside) is nudged clear of it, not sent round a ring as wide as the
      // bank of its pad: the gap grows with how far the road runs into the building (full gap from GRAZE m).
      const ins = insideLength(cur, [{ id: R.id, poly: R.hull }]);
      if (ins < MIN_INSIDE) continue;
      R.out = offsetPoly(R.hull, halfWidth + R.gap * Math.max(0.2, Math.min(1, ins / GRAZE)));
      const cum = [0];
      for (let k = 1; k < cur.length; k++) cum.push(cum[k - 1] + len(cur[k - 1], cur[k]));
      const total = cum[cum.length - 1];
      // Walk the road in small steps: the first run inside the outset ring that dips into the footprint.
      const n = Math.ceil(total / STEP) + 1;
      const inO: boolean[] = [], inH: boolean[] = [];
      for (let k = 0; k < n; k++) {
        const q = pointAt(cur, cum, Math.min(total, k * STEP));
        inO.push(pointInPoly(q[0], q[1], R.out));
        inH.push(pointInPoly(q[0], q[1], R.hull));
      }
      let i0 = -1, i1 = -1, inside = 0;
      for (let k = 0; k < n && i0 < 0; ) {
        if (!inO[k]) { k++; continue; }
        let e = k, cnt = 0;
        while (e + 1 < n && inO[e + 1]) e++;
        for (let j = k; j <= e; j++) if (inH[j]) cnt++;
        if (cnt * STEP >= MIN_INSIDE) { i0 = k; i1 = e; inside = cnt * STEP; }
        k = e + 1;
      }
      if (i0 < 0) continue;
      const startsInside = i0 === 0;
      const endsInside = i1 === n - 1;
      // A road that begins or ends inside the footprint ends at a door or a forecourt there: it is cut at the outline only when it runs `cutMin` m or more into the building.
      if ((startsInside || endsInside) && inside < cutMin) continue;
      if (startsInside && endsInside) continue;
      const bisect = (sOut: number, sIn: number, poly: readonly Pt[] = R.out) => {
        // sOut is outside the polygon, sIn inside: bisect to the boundary.
        for (let k = 0; k < 14; k++) {
          const m = (sOut + sIn) / 2, q = pointAt(cur, cum, m);
          if (pointInPoly(q[0], q[1], poly)) sIn = m;
          else sOut = m;
        }
        return (sOut + sIn) / 2;
      };
      let sIn: number, sOut: number;
      if (startsInside || endsInside) {
        // Cut where the road leaves the building itself (its outline), not the ring round it: the rest of the road stays.
        let k = startsInside ? 0 : n - 1;
        while (k >= 0 && k < n && inH[k]) k += startsInside ? 1 : -1;
        if (k < 0 || k >= n) continue;
        const edge = bisect(k * STEP, (k + (startsInside ? -1 : 1)) * STEP, R.hull);
        sIn = startsInside ? 0 : edge;
        sOut = startsInside ? edge : total;
      } else {
        sIn = bisect((i0 - 1) * STEP, i0 * STEP);
        sOut = bisect(Math.min(total, (i1 + 1) * STEP), i1 * STEP);
      }
      const E = pointAt(cur, cum, sIn), X = pointAt(cur, cum, sOut);
      const keepBefore = cur.filter((_, k) => cum[k] < sIn - 1e-6);
      const keepAfter = cur.filter((_, k) => cum[k] > sOut + 1e-6);
      let mid: Pt[], kind: Detour['kind'];
      if (startsInside) { mid = [X]; kind = 'start'; }
      else if (endsInside) { mid = [E]; kind = 'end'; }
      else {
        mid = around(R.out, E, X, slope);
        kind = 'around';
        const dl = mid.reduce((s, q, k) => (k ? s + len(mid[k - 1], q) : 0), 0);
        if (dl > (sOut - sIn) * MAX_RATIO + SLACK) continue;
      }
      const next = [...keepBefore, ...mid, ...keepAfter];
      // The original span's length and the detour's, for the record.
      const dl = mid.reduce((s, q, k) => (k ? s + len(mid[k - 1], q) : 0), 0);
      detours.push({ blocker: R.id, kind, from: E, to: X, inside, detour: dl });
      if (next.length >= 2) {
        cur = next;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return { points: cur, detours };
}

/** Do two polylines meet (a vertex of one within `tol` m of the other)? Crossings count: a crossing leaves vertices on both sides near. */
function polylinesMeet(a: readonly Pt[], b: readonly Pt[], tol: number): boolean {
  for (let k = 0; k + 1 < a.length; k++) for (let t = 0; t + 1 < b.length; t++) if (segHit(a[k], a[k + 1], b[t], b[t + 1])) return true;
  for (const p of a) if (distToPolyline(p, b) < tol) return true;
  for (const p of b) if (distToPolyline(p, a) < tol) return true;
  return false;
}

/** The roads' connected components: a component id per road (roads meeting within `tol` m, or crossing, are one). */
export function roadComponents(roads: readonly (readonly Pt[])[], tol = MEET): number[] {
  const par = roads.map((_, i) => i);
  const find = (i: number): number => (par[i] === i ? i : (par[i] = find(par[i])));
  for (let i = 0; i < roads.length; i++) {
    for (let j = i + 1; j < roads.length; j++) {
      if (find(i) !== find(j) && polylinesMeet(roads[i], roads[j], tol)) par[find(i)] = find(j);
    }
  }
  return roads.map((_, i) => find(i));
}

/**
 * Bending a road must not cut the network: roads that met through the original lines must still
 * be one network on the new ones. Where a bend (or its absence of a link) splits the network, the
 * changed roads, in order, are put back to their original line whenever that mends more than it
 * leaves split. `now` is edited in place; returns the indices put back.
 */
export function revertSplitting(orig: readonly (readonly Pt[])[], now: Pt[][], changed: readonly number[]): number[] {
  const a = roadComponents(orig);
  const splits = (cur: readonly (readonly Pt[])[]) => {
    const b = roadComponents(cur);
    const groups = new Map<number, Set<number>>();
    for (let i = 0; i < orig.length; i++) {
      const g = groups.get(a[i]) ?? new Set<number>();
      g.add(b[i]);
      groups.set(a[i], g);
    }
    let n = 0;
    for (const g of groups.values()) n += g.size - 1;
    return n;
  };
  const reverted: number[] = [];
  let now0 = splits(now);
  for (let pass = 0; pass < 2 && now0 > 0; pass++) {
    for (const i of changed) {
      if (now0 === 0) break;
      if (reverted.includes(i)) continue;
      const keep = now[i];
      now[i] = orig[i] as Pt[];
      const n = splits(now);
      if (n < now0) { now0 = n; reverted.push(i); }
      else now[i] = keep;
    }
  }
  return reverted;
}
