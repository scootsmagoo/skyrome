/**
 * Circus Maximus layout (pure arithmetic, unit-tested). Game metres in the circus's LOCAL frame:
 * the carceres (starting gates) face −z, the curved end is at +z, x runs across the track and +x is
 * the Palatine (NE) side. y = 0 is the arena pad.
 *
 * Real dimensions (architecture.md §3.25, atlas): 621 × 140 m overall, track ≈ 80 m wide, spina
 * ≈ 335 m, 12 carceres, three-storey arcaded facade with shops, Trajan's stone rebuild of 103.
 * Monumental sizes are ×0.6; seats (0.38 × 0.72 m rows), steps (≤ 0.2 m risers) and doors stay 1:1.
 */
import type { V2 } from '../../../../arch/common/geom';

export const S = 0.6;

export const CIRCUS = {
  /** Half the overall length (carceres outer face at −halfLen, curved apex at +halfLen). */
  halfLen: (621 * S) / 2,
  /** Half the overall width (outer facade face). */
  halfW: 70 * S,
  /** Half the track width (podium wall face). */
  track: 40 * S,
  /** Depth of the carceres block. */
  carceresDepth: 10,
  /** Overall facade height (28 m real). */
  height: 28 * S,
  /** Facade thickness. */
  wall: 1.0,
  /** Spina: centre z, length, width, platform height. The obelisk stands at its middle. */
  spina: { z: -36, length: 335 * S, width: 5.2, height: 1.2 },
  /** Facade bay width (axis to axis) and the clear span of the ground-storey arches. */
  bay: 4.86,
  span: 3.2,
} as const;

/** z of the centre of the curved end. */
export const curveZ = () => CIRCUS.halfLen - CIRCUS.halfW;
/** z of the carceres front (track side). */
export const carceresFront = () => -CIRCUS.halfLen + CIRCUS.carceresDepth;

export interface Row {
  /** Tread from u0 to u1 (u = outward distance from the track edge) at height y; the riser below rises from prevY. */
  u0: number;
  u1: number;
  y: number;
  prevY: number;
}

export interface CircusSection {
  /** Height of the podium / senators' terrace. */
  podium: number;
  /** Lower block (podium, terrace, tier 1, walkway) up to the balteus foot. */
  lower: V2[];
  /** Upper block (balteus wall, ledge, tier 2) ending with the back face down to the ground. */
  upper: V2[];
  /** Gallery (summa cavea) floor slab, u from galleryU0 to the facade's inner face. */
  gallery: { u0: number; u1: number; y: number };
  rows: Row[];
  /** Walkway in front of the balteus wall: its start, the wall face u and the wall's foot/top heights. */
  balteus: { walk0: number; u: number; y0: number; y1: number };
  /** Total band width (track edge → outer facade face). */
  band: number;
}

/**
 * The stepped section of the stands. Rows are human scale (0.38 m rise, 0.72 m tread); the
 * aisles (scalaria) split each riser into two 0.19 m half-steps, and a short flight of 0.2 m steps
 * climbs the balteus wall, so the player can walk from the front terrace to the top gallery.
 */
export function circusSection(): CircusSection {
  const rise = 0.38;
  const depth = 0.72;
  const podium = 1.6;
  const band = CIRCUS.halfW - CIRCUS.track; // 18
  const rows: Row[] = [];
  const lower: V2[] = [[0, 0], [0, podium]];
  let u = 0.6;
  let y = podium;
  lower.push([0.6, podium]); // podium crown (balustrade sits on it)
  u = 2.2; // senators' terrace
  lower.push([u, y]);
  for (let r = 0; r < 6; r++) {
    lower.push([u, y + rise]);
    rows.push({ u0: u, u1: u + depth, y: y + rise, prevY: y });
    y += rise;
    u += depth;
    lower.push([u, y]);
  }
  // Walkway (praecinctio) in front of the balteus: deep enough for the aisle flight up the wall.
  const wallH = 1.2;
  const flight = Math.ceil(wallH / 0.2) * 0.34 + 0.25;
  const walk0 = u;
  u += Math.max(2.3, flight);
  lower.push([u, y]);
  const balteus = { walk0, u, y0: y, y1: y + wallH };
  const upper: V2[] = [[u, y], [u, y + wallH]];
  y += wallH;
  u += 0.4;
  upper.push([u, y]);
  for (let r = 0; r < 7; r++) {
    upper.push([u, y + rise]);
    rows.push({ u0: u, u1: u + depth, y: y + rise, prevY: y });
    y += rise;
    u += depth;
    upper.push([u, y]);
  }
  upper.push([u, 0]);
  return { podium, lower, upper, gallery: { u0: u, u1: band - CIRCUS.wall, y }, rows, balteus, band };
}

/** A closed z-interval on a straight side, or an angle interval (radians, 0 = +x, π/2 = apex) on the curve. */
export type Interval = [number, number];

/** Subtract gaps from [a, b]; returns the remaining pieces (sorted). */
export function subtractIntervals(a: number, b: number, gaps: Interval[]): Interval[] {
  const sorted = gaps.map(([g0, g1]) => [Math.min(g0, g1), Math.max(g0, g1)] as Interval).sort((p, q) => p[0] - q[0]);
  const out: Interval[] = [];
  let cur = a;
  for (const [g0, g1] of sorted) {
    if (g1 <= cur || g0 >= b) continue;
    if (g0 > cur) out.push([cur, Math.min(g0, b)]);
    cur = Math.max(cur, g1);
    if (cur >= b) break;
  }
  if (cur < b) out.push([cur, b]);
  return out.filter(([p, q]) => q - p > 1e-3);
}

/** Facade bay stations along a run of length `len` with target bay width `bay`: n bays of equal width. */
export function bays(len: number, bay = CIRCUS.bay): { n: number; w: number } {
  const n = Math.max(1, Math.round(len / bay));
  return { n, w: len / n };
}

/**
 * Carceres stall fronts: 12 stalls, six either side of the Porta Pompae, their fronts on a shallow
 * arc concave to the track (centred on the axis, `R` m behind the start line), so every lane is the
 * same distance from the start. Returns the stall centre x and front z.
 */
export function carceresStalls(R = 110): { x: number; z: number; w: number }[] {
  const zf = carceresFront();
  const pompa = 3.2; // half width of the Porta Pompae with its piers
  const w = (CIRCUS.track - pompa - 0.4) / 6;
  const out: { x: number; z: number; w: number }[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const x = side * (pompa + w * (i + 0.5));
      const sag = R - Math.sqrt(R * R - x * x);
      out.push({ x, z: zf + sag, w });
    }
  }
  return out.sort((a, b) => a.x - b.x);
}

/** Stair-hall stations (z of the hall start) on each straight, and the flight geometry (0.2 m risers). */
export function stairHall(galleryY: number) {
  const count = Math.ceil(galleryY / 0.2);
  const rise = galleryY / count;
  const run = 0.3;
  return { count, rise, run, length: count * run, width: 1.4 };
}
