/**
 * Closing the minor-street stubs (pure, runs inside planCity after the subdivision): a street the
 * marcher stopped at a sliver, a landmark apron, a slope foot or a garden is extended, straight,
 * to the nearest ROAD / foreign STREET / PIAZZA / PLAZA within REACH m, across ground a lane may
 * cross (open leftovers, aprons, slopes, an aqueduct arcade, a Servian wall band: a lane ends at the
 * wall only when nothing is beyond it). A lane that would otherwise be an
 * island (both ends stop at nothing) reaches up to REACH_ISLAND. Where nothing is within reach
 * the end is returned as an orphan, for the piazza pass to open a court there. Deterministic.
 */
import { probeEnd } from './audit';
import { K, type Grid, type Pt } from './raster';

/** Longest extension (game m, beyond the street's own band). */
export const REACH = 18;
/** Longest extension of a lane that would otherwise be an island (both ends stop at nothing). */
export const REACH_ISLAND = 36;
/** Ground an extension may cross. Water and landmarks stop it; an aqueduct arcade opens a wider arch for it (monuments.ts leaves out piers standing in a street) and a Servian wall a breach with jambs (monuments.ts). */
const PASS = new Set<number>([K.FREE, K.SCRAP, K.STEEP, K.MARGIN, K.GARDEN, K.PIAZZA, K.AQUEDUCT, K.WALL]);
/** What it is looking for. */
const TARGET = new Set<number>([K.ROAD, K.STREET, K.PLAZA, K.PIAZZA]);
/** Ground an extension turns into street. */
const STAMP = new Set<number>([K.FREE, K.SCRAP, K.STEEP, K.AQUEDUCT, K.WALL]);

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

// ---------------------------------------------------------------- atlas road ends

export interface EndRoad {
  index: number;
  points: Pt[];
  /** Half of the road's full surface width. */
  half: number;
  style: string;
}

/** Longest extension of a road end that stops at nothing (game m). */
export const ROAD_END_REACH = 45;

/** Ground a road end's extension stops at: it does not cross water, a wall band or an aqueduct line. */
const END_STOP = new Set<number>([K.WATER, K.WALL, K.AQUEDUCT, K.OUTSIDE]);

/**
 * Extend the atlas road ends that stop in the open (`dead`: audit.ts auditRoadEnds) to the nearest
 * other road, street, square or building within ROAD_END_REACH m, straight (rays fanned ±120°
 * round the road's course, the shortest and straightest wins), so a road never ends at nothing.
 * The extension is stamped as road. A stairway's end is not lengthened: the way on from its foot
 * comes back as a link, for a road of its own. Returns how many ends were extended, and the links.
 */
export function closeRoadEnds(g: Grid, roads: EndRoad[], dead: { road: number; end: 0 | 1 }[], roadable: (c: number) => boolean): { extended: number; links: { road: number; points: Pt[] }[] } {
  let n = 0;
  const links: { road: number; points: Pt[] }[] = [];
  for (const d of dead) {
    const road = roads[d.road];
    if (!road || road.points.length < 2) continue;
    const P = road.points;
    const a = d.end === 0 ? P[0] : P[P.length - 1], b = d.end === 0 ? P[1] : P[P.length - 2];
    const L = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
    const base = Math.atan2((a[1] - b[1]) / L, (a[0] - b[0]) / L);
    const own = 1_000_000 + road.index;
    let best: Pt | null = null, bestScore = Infinity;
    for (let deg = -120; deg <= 120; deg += 10) {
      const th = base + (deg * Math.PI) / 180;
      const dx = Math.cos(th), dz = Math.sin(th);
      let prev = 0;
      for (let t = 2; t <= ROAD_END_REACH; t += 1.5) {
        const x = a[0] + dx * t, z = a[1] + dz * t;
        const i = g.index(x, z);
        if (i < 0) break;
        const c = g.cls[i];
        if (END_STOP.has(c)) break;
        const hit = (c === K.ROAD && g.owner[i] !== own) || c === K.STREET || c === K.PLAZA || c === K.PIAZZA || c === K.LANDMARK;
        if (hit) {
          // A building: stop at its apron, not inside it.
          const s = c === K.LANDMARK ? prev : t;
          const score = s + Math.abs(deg) * 0.08;
          if (s >= 2 && score < bestScore) { bestScore = score; best = [a[0] + dx * s, a[1] + dz * s]; }
          break;
        }
        prev = t;
      }
    }
    if (!best) continue;
    if (road.style === 'stairs') {
      // A flight is not lengthened: a path leads on from its foot (the caller makes it a road of its own).
      links.push({ road: road.index, points: [[a[0], a[1]], best] });
    } else if (d.end === 0) P.unshift(best);
    else P.push(best);
    g.fillBand([a, best], (road.style === 'stairs' ? 1.5 : road.half) + 0.7, K.ROAD, roadable, own);
    n++;
  }
  return { extended: n, links };
}
