/**
 * Street-end audit (pure, over a plan): every end of a minor street must meet a ROAD, another
 * STREET, a PIAZZA or a PLAZA within a few metres along its course, or open into a court (a
 * piazza the planner placed at the end). Anything else is a stub: the street stops at a block, a
 * garden, a slope or open ground. Used by the tests, by the planner's stub closing (stubs.ts)
 * and by the dead-end screenshot hunt (STREET_AUDIT_OUT).
 */
import type { CityPlan } from './plan';
import { K, distToPoly, pointInPoly, type Grid, type Pt } from './raster';

export interface StreetEnd {
  street: string;
  /** 0 = first point, 1 = last. */
  end: 0 | 1;
  p: [number, number];
  /** Unit direction leaving the street. */
  dir: [number, number];
  /** Class of the ground just beyond the street's own band. */
  beyond: number;
  region: string;
  /** What the end meets, or 'stub'. */
  verdict: 'street' | 'road' | 'piazza' | 'plaza' | 'edge' | 'stub';
}

const NAME: Record<number, string> = Object.fromEntries(Object.entries(K).map(([k, v]) => [v, k.toLowerCase()]));
export const className = (c: number) => NAME[c] ?? String(c);

/** How far past the street's own band an end may reach to meet its target. */
export const MEET = 2.5;
/** Margin the planner stamps round a street's half width (plan.ts STREET_MARGIN). */
const BAND = 0.9;

/** What one end of a street meets (walking out along its course, past its own band). */
export function probeEnd(g: Grid, s: { index: number; points: readonly Pt[]; width: number }, end: 0 | 1) {
  const P = s.points;
  const a = end === 0 ? P[0] : P[P.length - 1], b = end === 0 ? P[1] : P[P.length - 2];
  const L = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
  const dir: Pt = [(a[0] - b[0]) / L, (a[1] - b[1]) / L];
  let verdict: StreetEnd['verdict'] = 'stub';
  let beyond: number = K.OUTSIDE;
  const reach = s.width / 2 + BAND + MEET + 1;
  for (let d = 0; d <= reach; d += 0.5) {
    const i = g.index(a[0] + dir[0] * d, a[1] + dir[1] * d);
    if (i < 0) {
      if (verdict === 'stub') verdict = 'edge';
      break;
    }
    const c = g.cls[i];
    if (c === K.STREET && g.owner[i] === s.index) continue;
    if (beyond === K.OUTSIDE) beyond = c;
    if (c === K.ROAD) verdict = 'road';
    else if (c === K.STREET) verdict = 'street';
    else if (c === K.PIAZZA) verdict = 'piazza';
    else if (c === K.PLAZA) verdict = 'plaza';
    // A strip of apron or leftover between the end and its target does not matter; a wall, the
    // river or a building does.
    if (verdict !== 'stub' || c === K.WALL || c === K.WATER || c === K.LANDMARK || c === K.AQUEDUCT) break;
  }
  return { p: a, dir, verdict, beyond };
}

export function auditStreetEnds(plan: CityPlan, regionNames?: (i: number) => string): StreetEnd[] {
  const g = plan.grid;
  const out: StreetEnd[] = [];
  for (const s of plan.streets) {
    if (s.points.length < 2) continue;
    for (const end of [0, 1] as const) {
      const r = probeEnd(g, s, end);
      // A court: a piazza the planner opened at the end of the lane (its reason for stopping there).
      let verdict = r.verdict;
      if (verdict === 'stub' && plan.piazzas.some((q) => Math.hypot(q.center[0] - r.p[0], q.center[1] - r.p[1]) < q.r + 6)) verdict = 'piazza';
      const ri = g.index(r.p[0], r.p[1]);
      const rid = ri >= 0 ? plan.region[ri] : 255;
      out.push({ street: s.id, end, p: [r.p[0], r.p[1]], dir: [r.dir[0], r.dir[1]], beyond: r.beyond, region: rid === 255 ? 'none' : (regionNames?.(rid) ?? String(rid)), verdict });
    }
  }
  return out;
}

/** Stub counts by region and by what lies beyond. */
export function summarize(ends: StreetEnd[]) {
  const stubs = ends.filter((e) => e.verdict === 'stub');
  const byRegion: Record<string, number> = {}, byBeyond: Record<string, number> = {};
  for (const e of stubs) {
    byRegion[e.region] = (byRegion[e.region] ?? 0) + 1;
    const k = className(e.beyond);
    byBeyond[k] = (byBeyond[k] ?? 0) + 1;
  }
  return { ends: ends.length, edge: ends.filter((e) => e.verdict === 'edge').length, stubs: stubs.length, byRegion, byBeyond };
}

// ---------------------------------------------------------------- road ends (M5a)

export interface RoadEnd {
  road: string;
  /** Index in `plan.roads`. */
  index: number;
  end: 0 | 1;
  p: [number, number];
  /** What the end meets: another road, a street, a gate or arch, a building (its door), a square, a stairway, the river, the edge of the planned area, or nothing ('dead'). */
  verdict: 'road' | 'street' | 'gate' | 'building' | 'plaza' | 'edge' | 'water' | 'stairs' | 'dead';
}

/** How near (m) an end must lie to what it meets. */
const END_REACH = 9;

/**
 * Where every atlas road ends and what it meets there. An end is fine when it joins another road
 * or a street, passes a gate or an arch, reaches a building (its door), a plaza or piazza, a
 * stairway, the river, or the edge of the planned area; anything else is a road that stops in the
 * open: 'dead'. Pure over the plan.
 */
export function auditRoadEnds(plan: Pick<CityPlan, 'grid' | 'roads' | 'gates' | 'landmarkPolys'>): RoadEnd[] {
  const g = plan.grid;
  const out: RoadEnd[] = [];
  const gates = plan.gates.map((q) => q.at);
  const arches = plan.landmarkPolys.filter((l) => /arch|gate/.test(l.category) || /^porta-|^arch-/.test(l.id)).map((l) => l.poly);
  for (const road of plan.roads) {
    if (road.points.length < 2) continue;
    for (const end of [0, 1] as const) {
      const p = end === 0 ? road.points[0] : road.points[road.points.length - 1];
      const own = 1_000_000 + road.index;
      // Does any cell within END_REACH of the end satisfy `test`?
      const around = (test: (c: number, i: number) => boolean) => {
        for (let dx = -END_REACH; dx <= END_REACH; dx += 1.5) {
          for (let dz = -END_REACH; dz <= END_REACH; dz += 1.5) {
            if (Math.hypot(dx, dz) > END_REACH) continue;
            const i = g.index(p[0] + dx, p[1] + dz);
            if (test(i < 0 ? K.OUTSIDE : g.cls[i], i)) return true;
          }
        }
        return false;
      };
      let verdict: RoadEnd['verdict'] = 'dead';
      // Where a flight leads on from: the ground a few metres past its end (it has parapets, so a street cannot meet it from the side).
      const q = end === 0 ? road.points[1] : road.points[road.points.length - 2];
      const ql = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1;
      const ahead = g.at(p[0] + ((p[0] - q[0]) / ql) * 3, p[1] + ((p[1] - q[1]) / ql) * 3);
      if (around((c) => c === K.OUTSIDE)) verdict = 'edge';
      else if (road.style === 'stairs' && (ahead === K.FREE || ahead === K.SCRAP)) verdict = 'dead';
      else if (around((c, i) => c === K.ROAD && g.owner[i] !== own)) verdict = 'road';
      else if (around((c) => c === K.STREET)) verdict = 'street';
      else if (gates.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 20) || arches.some((poly) => pointInPoly(p[0], p[1], poly) || distToPoly(p[0], p[1], poly) < END_REACH)) verdict = 'gate';
      else if (around((c) => c === K.PLAZA || c === K.PIAZZA)) verdict = 'plaza';
      else if (plan.landmarkPolys.some((l) => pointInPoly(p[0], p[1], l.poly) || distToPoly(p[0], p[1], l.poly) < END_REACH)) verdict = 'building';
      else if (around((c) => c === K.WATER)) verdict = 'water';
      // (A stairway's ends are checked like any road's: a flight that lands in a block's back yard is a dead end.)
      out.push({ road: road.id, index: road.index, end, p: [p[0], p[1]], verdict });
    }
  }
  return out;
}

/** Counts by verdict. */
export function summarizeRoadEnds(ends: RoadEnd[]): Record<string, number> {
  const o: Record<string, number> = {};
  for (const e of ends) o[e.verdict] = (o[e.verdict] ?? 0) + 1;
  return o;
}

// ---------------------------------------------------------------- street graph reachability (M5a)

/** The part of a street graph the reachability audit reads (network.ts StreetGraph). */
export interface GraphLike {
  nodes: { id: number; x: number; z: number; kind: string }[];
  neighbours(id: number): [number, number][];
  nearest(x: number, z: number, maxDist?: number): number;
}

export interface ReachAudit {
  nodes: number;
  /** Nodes a walker can reach from the start node (the Forum). */
  reachable: number;
  share: number;
  /** The groups of nodes cut off from the start, biggest first (positions are the group's centre). */
  islands: { size: number; at: [number, number]; kinds: string[]; first: [number, number] }[];
}

/**
 * Which nodes of the street graph can be walked to from the one nearest (x, z) (default: the
 * Forum, the world's origin)? Nodes without a link at all are not counted (they are spots that
 * never joined the network, not streets). Used by the tests and by the in-game audit
 * (`window.__streetAudit()`).
 */
export function auditReach(graph: GraphLike, x = 0, z = 0): ReachAudit {
  const start = graph.nearest(x, z, 200);
  const seen = new Uint8Array(graph.nodes.length);
  const linked = (id: number) => graph.neighbours(id).length > 0;
  let reachable = 0;
  if (start >= 0) {
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const v = stack.pop()!;
      reachable++;
      for (const [w] of graph.neighbours(v)) if (!seen[w]) { seen[w] = 1; stack.push(w); }
    }
  }
  const total = graph.nodes.filter((n) => linked(n.id)).length;
  const islands: ReachAudit['islands'] = [];
  for (const n of graph.nodes) {
    if (seen[n.id] || !linked(n.id)) continue;
    const comp: number[] = [];
    const stack = [n.id];
    seen[n.id] = 2;
    while (stack.length) {
      const v = stack.pop()!;
      comp.push(v);
      for (const [w] of graph.neighbours(v)) if (!seen[w]) { seen[w] = 2; stack.push(w); }
    }
    let cx = 0, cz = 0;
    for (const v of comp) { cx += graph.nodes[v].x; cz += graph.nodes[v].z; }
    islands.push({ size: comp.length, at: [Math.round(cx / comp.length), Math.round(cz / comp.length)], kinds: [...new Set(comp.map((v) => graph.nodes[v].kind))], first: [Math.round(graph.nodes[comp[0]].x), Math.round(graph.nodes[comp[0]].z)] });
  }
  islands.sort((a, b) => b.size - a.size);
  return { nodes: total, reachable, share: total ? reachable / total : 1, islands };
}
