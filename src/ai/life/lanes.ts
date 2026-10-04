/**
 * Lanes: street centrelines as polylines (game metres) that crowds walk along, spawn on and leave
 * by. Pure and engine-free. In Rome they come from the atlas roads (npc/crowd/atlasLanes.ts) until
 * the city crew's street graph (game.streets) exists; either way people stream along the streets
 * in both directions, keeping to their right, instead of drifting across open ground.
 */
import type { Vec2 } from './steering';

export interface Lane {
  id: string;
  /** Centreline points (game metres). */
  pts: readonly Vec2[];
  /** Paved width (game metres). */
  width: number;
  /** Atlas kind ('via', 'street', 'vicus', 'clivus', 'stairs', 'path', 'connector'…). */
  kind: string;
  /** Cumulative arc length at each point. */
  cum: readonly number[];
  /** Total length. */
  length: number;
}

export interface LanePoint {
  lane: Lane;
  /** Arc length along the lane. */
  s: number;
  /** Distance from the query point to the centreline. */
  d: number;
  /** Closest centreline point. */
  x: number;
  z: number;
  /** Unit direction of the lane at s (toward increasing s). */
  dx: number;
  dz: number;
}

export function makeLane(id: string, pts: readonly Vec2[], width: number, kind = 'street'): Lane {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  return { id, pts, width, kind, cum, length: cum[cum.length - 1] };
}

/** Closest point of a lane to (x, z). */
export function closestOnLane(lane: Lane, x: number, z: number): LanePoint {
  let best: LanePoint = { lane, s: 0, d: Infinity, x: lane.pts[0].x, z: lane.pts[0].z, dx: 1, dz: 0 };
  const p = lane.pts;
  for (let i = 1; i < p.length; i++) {
    const ax = p[i - 1].x;
    const az = p[i - 1].z;
    const ex = p[i].x - ax;
    const ez = p[i].z - az;
    const l2 = ex * ex + ez * ez;
    if (l2 < 1e-9) continue;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
    const cx = ax + ex * t;
    const cz = az + ez * t;
    const d = Math.hypot(x - cx, z - cz);
    if (d < best.d) {
      const l = Math.sqrt(l2);
      best = { lane, s: lane.cum[i - 1] + l * t, d, x: cx, z: cz, dx: ex / l, dz: ez / l };
    }
  }
  return best;
}

/** Point (and unit direction) at arc length s, shifted `lateral` metres to the right of travel. */
export function laneAt(lane: Lane, s: number, lateral = 0): { x: number; z: number; dx: number; dz: number } {
  const p = lane.pts;
  const ss = Math.max(0, Math.min(lane.length, s));
  let i = 1;
  while (i < p.length - 1 && lane.cum[i] < ss) i++;
  const seg = lane.cum[i] - lane.cum[i - 1] || 1;
  const t = (ss - lane.cum[i - 1]) / seg;
  const dx = (p[i].x - p[i - 1].x) / seg;
  const dz = (p[i].z - p[i - 1].z) / seg;
  // The right of travel along +s is (−dz, dx) (+x east, +z south: facing south, right is west).
  return { x: p[i - 1].x + (p[i].x - p[i - 1].x) * t - dz * lateral, z: p[i - 1].z + (p[i].z - p[i - 1].z) * t + dx * lateral, dx, dz };
}

export class LaneSet {
  readonly lanes: Lane[];
  /** Coarse bucket index (cell → lanes passing near it). */
  private cells = new Map<number, Lane[]>();
  private readonly cell = 32;

  constructor(lanes: readonly Lane[]) {
    this.lanes = lanes.filter((l) => l.pts.length >= 2 && l.length > 1);
    for (const l of this.lanes) {
      const seen = new Set<number>();
      for (let i = 1; i < l.pts.length; i++) {
        const a = l.pts[i - 1];
        const b = l.pts[i];
        const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (this.cell / 2)));
        for (let k = 0; k <= n; k++) {
          const x = a.x + ((b.x - a.x) * k) / n;
          const z = a.z + ((b.z - a.z) * k) / n;
          const cx = Math.floor(x / this.cell);
          const cz = Math.floor(z / this.cell);
          for (let dz = -1; dz <= 1; dz++)
            for (let dx = -1; dx <= 1; dx++) {
              const key = this.key(cx + dx, cz + dz);
              if (seen.has(key)) continue;
              seen.add(key);
              let arr = this.cells.get(key);
              if (!arr) this.cells.set(key, (arr = []));
              arr.push(l);
            }
        }
      }
    }
  }

  get empty() {
    return this.lanes.length === 0;
  }

  private key(cx: number, cz: number) {
    return (cx + 32768) * 65536 + (cz + 32768);
  }

  /** Lanes that may pass within ~one cell of (x, z). */
  candidates(x: number, z: number): readonly Lane[] {
    return this.cells.get(this.key(Math.floor(x / this.cell), Math.floor(z / this.cell))) ?? [];
  }

  /** The nearest lane point within `maxD` of (x, z). */
  nearest(x: number, z: number, maxD: number, filter?: (l: Lane) => boolean): LanePoint | null {
    let best: LanePoint | null = null;
    const pool = maxD <= this.cell ? this.candidates(x, z) : this.lanes;
    for (const l of pool) {
      if (filter && !filter(l)) continue;
      const c = closestOnLane(l, x, z);
      if (c.d <= maxD && (!best || c.d < best.d)) best = c;
    }
    return best;
  }

  /** Lanes passing within r of (x, z). */
  near(x: number, z: number, r: number): Lane[] {
    const out: Lane[] = [];
    const pool = r <= this.cell ? this.candidates(x, z) : this.lanes;
    for (const l of pool) if (closestOnLane(l, x, z).d <= r) out.push(l);
    return out;
  }

  /**
   * A random point on a lane between rMin and rMax from (x, z): sampled every 2 m along the lanes
   * in range, so longer stretches get more people. Heading is along the lane in a random
   * direction, and the point keeps to the right of that direction.
   */
  sample(rand: () => number, x: number, z: number, rMin: number, rMax: number, filter?: (l: Lane) => boolean): { x: number; z: number; heading: number; lane: Lane; s: number; dir: 1 | -1 } | null {
    const cands: { lane: Lane; s: number }[] = [];
    for (const l of this.near(x, z, rMax)) {
      if (filter && !filter(l)) continue;
      // Clip the walk along the lane to the part inside the ring.
      const c = closestOnLane(l, x, z);
      const span = Math.sqrt(Math.max(0, rMax * rMax - c.d * c.d));
      const s0 = Math.max(0, c.s - span - 4);
      const s1 = Math.min(l.length, c.s + span + 4);
      for (let s = s0; s <= s1; s += 2) {
        const p = laneAt(l, s);
        const d = Math.hypot(p.x - x, p.z - z);
        if (d >= rMin && d <= rMax) cands.push({ lane: l, s });
      }
    }
    if (!cands.length) return null;
    const pick = cands[Math.floor(rand() * cands.length) % cands.length];
    const dir: 1 | -1 = rand() < 0.5 ? 1 : -1;
    const lat = keepRight(pick.lane, rand) * dir;
    const p = laneAt(pick.lane, pick.s, lat);
    return { x: p.x, z: p.z, heading: Math.atan2(p.dx * dir, p.dz * dir), lane: pick.lane, s: pick.s, dir };
  }

  /**
   * The next leg of a walk along the street: `dist` metres further along the nearest lane, in the
   * lane direction closest to `heading`, keeping right. At a lane's end it turns onto another lane
   * that starts or ends nearby (a junction), else turns back.
   */
  ahead(rand: () => number, x: number, z: number, heading: number, dist: number, maxD = 12): { x: number; z: number; lane: Lane; dir: 1 | -1 } | null {
    const c = this.nearest(x, z, maxD);
    if (!c) return null;
    const hx = Math.sin(heading);
    const hz = Math.cos(heading);
    let dir: 1 | -1 = c.dx * hx + c.dz * hz >= 0 ? 1 : -1;
    let lane = c.lane;
    let s = c.s + dir * dist;
    if (s < 0 || s > lane.length) {
      const endS = s < 0 ? 0 : lane.length;
      const end = laneAt(lane, endS);
      const rest = Math.abs(s - endS);
      // A junction: another lane near this end.
      const next = this.lanes
        .filter((l) => l !== lane)
        .map((l) => closestOnLane(l, end.x, end.z))
        .filter((p) => p.d < Math.max(8, p.lane.width + lane.width))
        .sort(() => rand() - 0.5)[0];
      if (next) {
        lane = next.lane;
        // Continue away from the junction.
        dir = next.s < lane.length / 2 ? 1 : -1;
        if (next.s > 2 && next.s < lane.length - 2) dir = rand() < 0.5 ? 1 : -1;
        s = Math.max(0, Math.min(lane.length, next.s + dir * Math.max(8, rest)));
      } else {
        dir = (-dir) as 1 | -1;
        s = Math.max(0, Math.min(lane.length, endS + dir * Math.max(8, rest)));
      }
    }
    const p = laneAt(lane, s, keepRight(lane, rand) * dir);
    return { x: p.x, z: p.z, lane, dir };
  }
}

/** How far right of the centreline people walk (m): a quarter of the width, give or take. */
function keepRight(lane: Lane, rand: () => number): number {
  const half = lane.width / 2;
  return Math.min(half * 0.75, Math.max(0.3, half * (0.25 + rand() * 0.45)));
}
