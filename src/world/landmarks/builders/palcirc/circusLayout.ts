/**
 * Circus Maximus layout (pure arithmetic, unit-tested in tests/palcirc-circus.test.ts). Game metres
 * in the circus's LOCAL frame: the carceres (starting gates) face −z, the curved end is at +z, x runs
 * across the track and +x is the Palatine (NE) side. y = 0 is the arena pad.
 *
 * Real dimensions (architecture.md §3.25, atlas): 621 × 140 m overall, track ≈ 80 m wide, spina
 * ≈ 335 m, 12 carceres, three-storey arcaded facade with shops, Trajan's stone rebuild of 103.
 * Monumental sizes are ×0.6; seats (0.4 × 0.7 m rows), steps (≤ 0.2 m risers) and doors stay 1:1.
 *
 * Stations: positions round the stands are given by a station `s` measured along the track edge
 * (u = 0): up the Palatine (+x) straight from the carceres, round the semicircle through the apex,
 * and back down the Aventine (−x) straight. `u` is the outward distance from the track edge.
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
  /** Overall facade height (28 m real) and its three storeys. */
  height: 28 * S,
  storeys: [6.2, 5.4, 5.2] as const,
  /** Facade wall thickness. */
  wall: 1.1,
  /** Spina: centre line x (the obelisk's atlas line), centre z, length, width, platform height. */
  spina: { x: -2.2, z: -36, length: 335 * S, width: 5.2, height: 1.2 },
  /** Facade bay width (axis to axis) and the clear span of the ground-storey arches. */
  bay: 4.86,
  span: 3.2,
  /** Shops behind the ground-storey arcade: back wall u and ceiling height. */
  shopBack: 13.5,
  shopCeiling: 4.4,
  /** Entrance tunnels through the stands: clear width and ceiling height. */
  tunnelW: 3.0,
  tunnelH: 3.4,
} as const;

/** z of the centre of the curved end. */
export const curveZ = () => CIRCUS.halfLen - CIRCUS.halfW;
/** z of the carceres front (track side). */
export const carceresFront = () => -CIRCUS.halfLen + CIRCUS.carceresDepth;
/** Length of each straight (carceres front → curve start). */
export const straightLen = () => curveZ() - carceresFront();
/** Total station length round the track edge. */
export const totalStations = () => 2 * straightLen() + Math.PI * CIRCUS.track;

export interface Row {
  /** Tread from u0 to u1 at height y; the riser below rises from prevY. */
  u0: number;
  u1: number;
  y: number;
  prevY: number;
  tier: 1 | 2;
}

export interface Walk {
  /** Walkway from u0 to the wall face u1 at height y; the wall rises to y1 with a ledge to u2. */
  u0: number;
  u1: number;
  y: number;
  y1: number;
  u2: number;
}

export interface CircusSection {
  /** Podium wall height (the track side). */
  podium: number;
  /** Terrace (front seats) from `terrace[0]` to `terrace[1]` at the podium height. */
  terrace: [number, number];
  rows: Row[];
  /** The two praecinctio walkways with their balteus walls. */
  walks: [Walk, Walk];
  /** Top gallery (porticus in summa cavea): floor from u0 to u1 at y, column axis, roof eave/ridge. */
  gallery: { u0: number; u1: number; y: number; colU: number; colH: number; eaveY: number };
  /** Full stepped outline (u, y) from the track foot to the facade's inner face. */
  outline: V2[];
  /** Total band width (track edge → outer facade face). */
  band: number;
}

/**
 * The stepped section of the stands. Rows are human scale (0.4 m rise, 0.7 m tread, as in the
 * amphitheatres); aisles (scalaria) split each riser into two 0.2 m half-steps, and a flight of
 * four 0.2 m steps in each walkway climbs the 0.8 m balteus wall, so the player can walk from the
 * front terrace to the top gallery.
 */
export function circusSection(): CircusSection {
  const rise = 0.4;
  const depth = 0.7;
  const podium = 1.6;
  const band = CIRCUS.halfW - CIRCUS.track; // 18
  const inner = band - CIRCUS.wall; // facade inner face
  const rows: Row[] = [];
  const outline: V2[] = [[0, 0], [0, podium]];
  const terrace: [number, number] = [0.3, 2.0];
  let u = terrace[1];
  let y = podium;
  outline.push([u, y]);
  const tier = (n: number, t: 1 | 2) => {
    for (let r = 0; r < n; r++) {
      outline.push([u, y + rise]);
      rows.push({ u0: u, u1: u + depth, y: y + rise, prevY: y, tier: t });
      y += rise;
      u += depth;
      outline.push([u, y]);
    }
  };
  const walk = (): Walk => {
    const wallH = 0.8;
    const w = { u0: u, u1: u + 1.4, y, y1: y + wallH, u2: u + 1.7 };
    u = w.u1;
    outline.push([u, y], [u, w.y1]);
    y = w.y1;
    u = w.u2;
    outline.push([u, y]);
    return w;
  };
  tier(6, 1);
  const w1 = walk();
  tier(8, 2);
  const w2 = walk();
  // Gallery floor to the facade's inner face, under a colonnade and a lean-to roof.
  outline.push([inner, y]);
  const colH = 5.4;
  const gallery = { u0: u, u1: inner, y, colU: u + 0.35, colH, eaveY: y + colH + 0.7 };
  return { podium, terrace, rows, walks: [w1, w2], gallery, outline, band };
}

/** A closed interval [a, b]. */
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

export interface PathPoint {
  x: number;
  z: number;
  /** Outward unit normal (away from the track). */
  nx: number;
  nz: number;
  /** Unit tangent in the direction of increasing station. */
  tx: number;
  tz: number;
}

/** Point on the stands' ring at station `s` (measured on the track edge) and outward offset `u`. */
export function ringPoint(s: number, u: number): PathPoint {
  const L = straightLen();
  const z0 = carceresFront();
  const zc = curveZ();
  const r0 = CIRCUS.track;
  const arc = Math.PI * r0;
  if (s <= L) return { x: r0 + u, z: z0 + s, nx: 1, nz: 0, tx: 0, tz: 1 };
  if (s <= L + arc) {
    const phi = (s - L) / r0;
    const c = Math.cos(phi);
    const sn = Math.sin(phi);
    return { x: (r0 + u) * c, z: zc + (r0 + u) * sn, nx: c, nz: sn, tx: -sn, tz: c };
  }
  const t = s - L - arc;
  return { x: -(r0 + u), z: zc - t, nx: -1, nz: 0, tx: 0, tz: -1 };
}

/** Station of the curve start/end and the apex. */
export const stations = () => {
  const L = straightLen();
  const arc = Math.PI * CIRCUS.track;
  return { curveStart: L, apex: L + arc / 2, curveEnd: L + arc, end: 2 * L + arc };
};

/** Station on a straight for a local z (+x side when `side` = 1, −x side when −1). */
export function stationAtZ(z: number, side: 1 | -1): number {
  const L = straightLen();
  const z0 = carceresFront();
  return side > 0 ? z - z0 : 2 * L + Math.PI * CIRCUS.track - (z - z0);
}

/**
 * Polyline of the ring at offset `u` between two stations: straight parts are single segments and
 * the curve is sampled every `dPhi` radians (so concentric rings share their vertices' stations).
 */
export function ringPolyline(s0: number, s1: number, u: number, dPhi = Math.PI / 48): { s: number; p: PathPoint }[] {
  const st = stations();
  const out: { s: number; p: PathPoint }[] = [];
  const push = (s: number) => {
    if (out.length && Math.abs(out[out.length - 1].s - s) < 1e-6) return;
    out.push({ s, p: ringPoint(s, u) });
  };
  push(s0);
  const step = dPhi * CIRCUS.track;
  for (let k = 0; ; k++) {
    const s = st.curveStart + k * step;
    if (s > st.curveEnd + 1e-6) break;
    if (s > s0 && s < s1) push(s);
  }
  if (s0 < st.curveStart && s1 > st.curveStart) push(st.curveStart);
  if (s0 < st.curveEnd && s1 > st.curveEnd) push(st.curveEnd);
  out.sort((a, b) => a.s - b.s);
  push(s1);
  return out.filter((v, i) => i === 0 || v.s - out[i - 1].s > 1e-6);
}

/** Facade bay stations along a run of length `len` with target bay width `bay`: n bays of equal width. */
export function bays(len: number, bay: number = CIRCUS.bay): { n: number; w: number } {
  const n = Math.max(1, Math.round(len / bay));
  return { n, w: len / n };
}

/**
 * Outer facade bays: centre position, outward normal and width for every bay round the straights and
 * the curve (the straights start at the carceres' outer corners).
 */
export interface FacadeBay {
  x: number;
  z: number;
  /** Outward normal. */
  nx: number;
  nz: number;
  /** Bay width (chord on the curve). */
  w: number;
  /** +1 Palatine straight, −1 Aventine straight, 0 curve, 2 the carceres' outer face. */
  side: 1 | -1 | 0 | 2;
}

/** Half width of the Porta Pompae opening in the carceres' outer face. */
export const POMPA_OUTER = 4.8;

/** Bays of the carceres' outer face (facing −z), either side of the Porta Pompae. */
export function carceresFaceBays(): FacadeBay[] {
  const out: FacadeBay[] = [];
  const R = CIRCUS.halfW;
  const run = bays(R - POMPA_OUTER);
  for (const s of [-1, 1]) {
    for (let i = 0; i < run.n; i++) {
      const x = s * (POMPA_OUTER + (i + 0.5) * run.w);
      out.push({ x, z: -CIRCUS.halfLen, nx: 0, nz: -1, w: run.w, side: 2 });
    }
  }
  return out;
}

/**
 * Outer facade bays: centre position, outward normal and width for every bay round the straights and
 * the curve (the straights start at the carceres' outer corners). `gapX` leaves an opening in the
 * curved end between x = gapX[0] and gapX[1] (on the facade circle), for the Arch of Titus passage.
 */
export function facadeBays(gapX?: [number, number]): FacadeBay[] {
  const out: FacadeBay[] = [];
  const R = CIRCUS.halfW;
  const zs0 = -CIRCUS.halfLen;
  const zc = curveZ();
  const st = bays(zc - zs0);
  for (let i = 0; i < st.n; i++) out.push({ x: R, z: zs0 + (i + 0.5) * st.w, nx: 1, nz: 0, w: st.w, side: 1 });
  const runs: [number, number][] = gapX ? [[0, Math.acos(Math.min(1, gapX[1] / R))], [Math.acos(Math.max(-1, gapX[0] / R)), Math.PI]] : [[0, Math.PI]];
  for (const [p0, p1] of runs) {
    const cv = bays((p1 - p0) * R);
    const dp = (p1 - p0) / cv.n;
    for (let i = 0; i < cv.n; i++) {
      const phi = p0 + (i + 0.5) * dp;
      // Chord: the flat bay sits on the polygon inscribed in the circle; its centre is the chord midpoint.
      const rc = R * Math.cos(dp / 2);
      out.push({ x: rc * Math.cos(phi), z: zc + rc * Math.sin(phi), nx: Math.cos(phi), nz: Math.sin(phi), w: 2 * R * Math.sin(dp / 2), side: 0 });
    }
  }
  for (let i = st.n - 1; i >= 0; i--) out.push({ x: -R, z: zs0 + (i + 0.5) * st.w, nx: -1, nz: 0, w: st.w, side: -1 });
  return out;
}

/**
 * Carceres stall fronts: 12 stalls, six either side of the Porta Pompae, their fronts on a shallow
 * arc concave to the track (centred on the axis, `R` m behind the start line), so every lane is the
 * same distance from the start. Returns the stall centre x, front z and width.
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

/** Aisle (scalaria) stations: evenly spaced round the stands, skipping the given gaps. */
export function aisleStations(spacing: number, gaps: Interval[], margin = 2.5): number[] {
  const total = totalStations();
  const n = Math.max(2, Math.round(total / spacing));
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = ((i + 0.5) / n) * total;
    if (s < 4 || s > total - 4) continue;
    if (gaps.some(([a, b]) => s > a - margin && s < b + margin)) continue;
    out.push(s);
  }
  return out;
}

/**
 * Station interval on the ring of offset `u` covered by the channel x ∈ [x0, x1] through the curved
 * end (the Arch of Titus passage). Returns null when the ring doesn't cross it.
 */
export function channelGap(x0: number, x1: number, u: number): Interval | null {
  const R = CIRCUS.track + u;
  const a = Math.min(1, Math.max(-1, x1 / R));
  const b = Math.min(1, Math.max(-1, x0 / R));
  const phi0 = Math.acos(a);
  const phi1 = Math.acos(b);
  if (phi1 - phi0 < 1e-6) return null;
  const L = straightLen();
  return [L + phi0 * CIRCUS.track, L + phi1 * CIRCUS.track];
}
