/**
 * Closing the minor-street stubs (pure, runs inside planCity after the subdivision): a street the
 * marcher stopped at a sliver, a landmark apron, a slope foot or a garden is extended, straight,
 * to the nearest ROAD / foreign STREET / PIAZZA / PLAZA within REACH m, across ground a lane may
 * cross (open leftovers, aprons, slopes, an aqueduct arcade). A lane that would otherwise be an
 * island (both ends stop at nothing) reaches up to REACH_ISLAND. Where nothing is within reach
 * the end is returned as an orphan, for the piazza pass to open a court there. Deterministic.
 */
import { probeEnd } from './audit';
import { K, type Grid, type Pt } from './raster';

/** Longest extension (game m, beyond the street's own band). */
export const REACH = 24;
/** Longest extension of a lane that would otherwise be an island (both ends stop at nothing). */
export const REACH_ISLAND = 60;
/** Ground an extension may cross. Walls, water and landmarks stop it; an aqueduct arcade opens a wider arch for it (monuments.ts leaves out piers standing in a street). */
const PASS = new Set<number>([K.FREE, K.SCRAP, K.STEEP, K.MARGIN, K.GARDEN, K.PIAZZA, K.AQUEDUCT]);
/** What it is looking for. */
const TARGET = new Set<number>([K.ROAD, K.STREET, K.PLAZA, K.PIAZZA]);
/** Ground an extension turns into street. */
const STAMP = new Set<number>([K.FREE, K.SCRAP, K.STEEP, K.AQUEDUCT]);

export interface StubStreet {
  index: number;
  points: Pt[];
  width: number;
}

export interface Orphan {
  street: number;
  end: 0 | 1;
}

/** Extend the stub ends of `streets`; returns the ends nothing was in reach of. */
export function closeStubs(g: Grid, streets: StubStreet[], margin: number): { extended: number; orphans: Orphan[] } {
  let extended = 0;
  const stubs = (s: StubStreet) => ([0, 1] as const).filter((end) => s.points.length >= 2 && probeEnd(g, s, end).verdict === 'stub');
  for (const s of streets) for (const end of stubs(s)) if (extend(g, s, end, REACH, margin)) extended++;
  // Lanes still stopping at nothing at both ends: an island nobody can walk to, so reach farther.
  for (const s of streets) {
    const open = stubs(s);
    if (open.length === 2) for (const end of open) if (extend(g, s, end, REACH_ISLAND, margin)) extended++;
  }
  const orphans: Orphan[] = [];
  for (const s of streets) for (const end of stubs(s)) orphans.push({ street: s.index, end });
  return { extended, orphans };
}

/** Extend one stub end to the nearest target within `reach`; false when nothing is in reach. */
function extend(g: Grid, s: StubStreet, end: 0 | 1, reach: number, margin: number): boolean {
  const r = probeEnd(g, s, end);
  const a = r.p;
  const to = search(g, s, a, r.dir, reach);
  if (!to) return false;
  if (end === 0) s.points.unshift(to);
  else s.points.push(to);
  g.scanSegment(a, to, s.width / 2 + margin, (i) => {
    if (!STAMP.has(g.cls[i])) return;
    g.cls[i] = K.STREET;
    g.owner[i] = s.index;
  });
  return true;
}

/** The nearest target point along rays fanned ±100° round `dir` from `a` (shortest, then straightest), or null. */
function search(g: Grid, s: StubStreet, a: Pt, dir: Pt, reach: number): Pt | null {
  let best: Pt | null = null, bestScore = Infinity;
  const base = Math.atan2(dir[1], dir[0]);
  const own = s.width / 2 + 1.2;
  for (let deg = -100; deg <= 100; deg += 5) {
    const th = base + (deg * Math.PI) / 180;
    const dx = Math.cos(th), dz = Math.sin(th);
    for (let d = 0.5; d <= reach + own; d += 0.5) {
      const x = a[0] + dx * d, z = a[1] + dz * d;
      const i = g.index(x, z);
      if (i < 0) break;
      const c = g.cls[i];
      if (c === K.STREET && g.owner[i] === s.index) {
        // Its own band: carry on out of it (only near the end; far along a ray it is a loop back).
        if (d > own + 2) break;
        continue;
      }
      if (TARGET.has(c)) {
        const score = d + Math.abs(deg) * 0.04;
        if (score < bestScore) { bestScore = score; best = [x, z]; }
        break;
      }
      if (!PASS.has(c)) break;
    }
  }
  return best;
}
