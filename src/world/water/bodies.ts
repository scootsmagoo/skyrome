/**
 * Water bodies in GAME space (the Tiber, the Euripus canal): centerline with chainage, width and
 * level, and the queries gameplay needs (is there water here, how deep, which way does it flow).
 * Pure: no Three.js scene objects, unit-tested.
 */
import { WORLD_SCALE } from '../coords';
import { chain, footOn, indexSegments, nearSegments, type ChainedLine, type LineFoot, type SegmentIndex } from '../terrain/riverbanks';
import type { P2 } from '../terrain/heightmap';

export interface RiverSource {
  id: string;
  centerline: readonly P2[];
  width: readonly number[];
  waterLevel: number;
  kind?: 'river' | 'canal';
}

export interface WaterBody {
  id: string;
  kind: 'river' | 'canal';
  /** Surface height (game y). */
  level: number;
  /** Centerline in game metres. */
  line: ChainedLine;
  /** Channel width (game m) at each centerline point. */
  width: number[];
  /** Unit downstream tangent at each centerline point (averaged across the joint). */
  tangents: [number, number][];
  /** Surface current at mid-channel (m/s). */
  speed: number;
  index: SegmentIndex;
  maxHalf: number;
}

/** Margin (game m) beyond the channel's half width that still counts as "in the body". */
export const BODY_MARGIN = 4;

export function makeWaterBodies(rivers: readonly RiverSource[], S = WORLD_SCALE): WaterBody[] {
  return rivers.map((r) => {
    const pts = r.centerline.map((p) => [p[0] * S, p[1] * S] as const);
    const width = r.width.map((w) => w * S);
    const tangents: [number, number][] = pts.map((_, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const l = Math.hypot(dx, dz) || 1;
      return [dx / l, dz / l];
    });
    const maxHalf = Math.max(...width) / 2;
    const kind = r.kind ?? 'river';
    return {
      id: r.id,
      kind,
      level: r.waterLevel * S,
      line: chain(pts),
      width,
      tangents,
      // The Tiber runs brisk (~1 m/s, research §5.2); Agrippa's canal barely moves.
      speed: kind === 'canal' ? 0.15 : 1.0,
      index: indexSegments(pts, maxHalf + BODY_MARGIN + 2, 40),
      maxHalf,
    };
  });
}

export interface BodyHit {
  body: WaterBody;
  foot: LineFoot;
  /** Channel half width (game m) at the foot. */
  half: number;
}

/** The water body whose channel contains (x, z), nearest centerline first. */
export function bodyAt(bodies: readonly WaterBody[], x: number, z: number, margin = BODY_MARGIN): BodyHit | null {
  let best: BodyHit | null = null;
  for (const body of bodies) {
    const segs = nearSegments(body.index, x, z);
    if (!segs) continue;
    const f = footOn(body.line, x, z, segs);
    const w0 = body.width[f.i], w1 = body.width[f.i + 1] ?? w0;
    const half = (w0 + (w1 - w0) * f.t) / 2;
    if (f.d > half + margin) continue;
    if (!best || f.d - half < best.foot.d - best.half) best = { body, foot: f, half };
  }
  return best;
}

/** Downstream current (m/s) at a hit: fastest mid-channel, still at the banks. */
export function currentOf(hit: BodyHit, out: { x: number; z: number } = { x: 0, z: 0 }) {
  const { body, foot, half } = hit;
  const a = body.tangents[foot.i], b = body.tangents[foot.i + 1] ?? a;
  let tx = a[0] + (b[0] - a[0]) * foot.t;
  let tz = a[1] + (b[1] - a[1]) * foot.t;
  const l = Math.hypot(tx, tz) || 1;
  tx /= l;
  tz /= l;
  const r = Math.min(1, foot.d / Math.max(1, half));
  const v = body.speed * Math.max(0, 1 - r * r);
  out.x = tx * v;
  out.z = tz * v;
  return out;
}
