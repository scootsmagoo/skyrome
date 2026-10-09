/**
 * Street-end audit (pure, over a plan): every end of a minor street must meet a ROAD, another
 * STREET, a PIAZZA or a PLAZA within a few metres along its course, or open into a court (a
 * piazza the planner placed at the end). Anything else is a stub: the street stops at a block, a
 * garden, a slope or open ground. Used by the tests, by the planner's stub closing (stubs.ts)
 * and by the dead-end screenshot hunt (STREET_AUDIT_OUT).
 */
import type { CityPlan } from './plan';
import { K, type Grid, type Pt } from './raster';

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
