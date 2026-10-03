/**
 * Tiber riverbanks in AD 113: where the banks are stone quays rather than sloping natural banks.
 * Pure data + geometry helpers (REAL meters, atlas frame), shared by the heightmap (which shapes a
 * flat quay top and a deep face) and the water module (which builds the travertine walls, stairs
 * and mooring stones on top of that shape).
 *
 * Source: docs/research/topography-terrain.md §5.3 (Aldrete 2007 ch. 5). "The Romans built quays,
 * not flood walls": tufa/concrete cores faced in stone, travertine quay surfaces at 10–12 m ASL,
 * paired stairs to the water and pierced travertine mooring blocks. Elsewhere the banks are
 * natural: gravel and mud beaches and reeds.
 */
export type P2 = readonly [number, number];

export interface TerrainQuay {
  id: string;
  name: string;
  /** River id (atlas RIVERS). */
  river: string;
  /** 'left' = the city bank (left when looking downstream), 'right' = Transtiberim side. */
  bank: 'left' | 'right';
  /** Approximate ends of the quay (real m); projected onto the river centerline. */
  from: P2;
  to: P2;
  /** Quay surface (m ASL). */
  top: number;
  /** Width of the flat quay strip behind the face (real m). Default 12. */
  width?: number;
  /** Openings in the wall face (real m along the bank, centred on these points), e.g. the Cloaca Maxima outfall. */
  gaps?: readonly { at: P2; width: number }[];
  confidence: 'high' | 'medium' | 'low';
}

/** Quays along the Tiber in AD 113 (research §5.3). */
export const TIBER_QUAYS: readonly TerrainQuay[] = [
  {
    id: 'quay-portus-tiberinus',
    name: 'Quays of the Portus Tiberinus',
    river: 'tiber',
    bank: 'left',
    from: [-478, 132],
    to: [-352, 535],
    top: 10,
    width: 14,
    // The Cloaca Maxima outfall opens in the quay face (landmark cloaca-maxima-outlet).
    gaps: [{ at: [-343, 414], width: 9 }],
    confidence: 'medium',
  },
  {
    id: 'quay-aventine',
    name: 'Quays below the Aventine',
    river: 'tiber',
    bank: 'left',
    from: [-405, 600],
    to: [-648, 918],
    top: 9.5,
    width: 9,
    confidence: 'low',
  },
  {
    id: 'quay-emporium',
    name: 'Quays of the Emporium',
    river: 'tiber',
    bank: 'left',
    from: [-655, 926],
    to: [-1192, 1575],
    top: 10.5,
    width: 18,
    confidence: 'medium',
  },
  {
    id: 'quay-ripa',
    name: 'Riverside wharves of Transtiberim',
    river: 'tiber',
    bank: 'right',
    from: [-560, 700],
    to: [-900, 1060],
    top: 10,
    width: 10,
    confidence: 'low',
  },
];

/** A river centerline with cumulative chainage for fast queries. */
export interface ChainedLine {
  pts: readonly P2[];
  /** Cumulative length at each point. */
  cum: Float64Array;
}

export function chain(pts: readonly P2[]): ChainedLine {
  const cum = new Float64Array(pts.length);
  for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return { pts, cum };
}

export interface LineFoot {
  /** Distance from the line. */
  d: number;
  /** Segment index and parameter of the nearest point. */
  i: number;
  t: number;
  /** Chainage of the nearest point. */
  s: number;
  /** +1 if the point is on the left bank (left looking downstream = increasing index), -1 right. */
  side: number;
  /** Unit tangent (downstream) at the nearest point. */
  tx: number;
  tz: number;
}

/** Nearest point on a chained polyline with chainage and side. */
export function footOn(line: ChainedLine, px: number, pz: number): LineFoot {
  const pts = line.pts;
  let best = Infinity;
  let bi = 0;
  let bt = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1];
    const dx = pts[i + 1][0] - ax, dz = pts[i + 1][1] - az;
    const l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = ax + dx * t - px, ez = az + dz * t - pz;
    const d2 = ex * ex + ez * ez;
    if (d2 < best) {
      best = d2;
      bi = i;
      bt = t;
    }
  }
  const ax = pts[bi][0], az = pts[bi][1];
  const dx = pts[bi + 1][0] - ax, dz = pts[bi + 1][1] - az;
  const L = Math.hypot(dx, dz) || 1;
  const tx = dx / L, tz = dz / L;
  const fx = ax + dx * bt, fz = az + dz * bt;
  // Left of the downstream direction (tx, tz) is (tz, -tx) with +x east, +z south.
  const side = (px - fx) * tz + (pz - fz) * -tx >= 0 ? 1 : -1;
  return { d: Math.sqrt(best), i: bi, t: bt, s: line.cum[bi] + L * bt, side, tx, tz };
}

/** A quay resolved against its river: chainage interval and side. */
export interface ResolvedQuay {
  quay: TerrainQuay;
  s0: number;
  s1: number;
  side: number;
  /** Chainage of each gap centre and its half width. */
  gaps: { s: number; half: number }[];
}

export function resolveQuays(quays: readonly TerrainQuay[], riverId: string, line: ChainedLine): ResolvedQuay[] {
  const out: ResolvedQuay[] = [];
  for (const q of quays) {
    if (q.river !== riverId) continue;
    const a = footOn(line, q.from[0], q.from[1]);
    const b = footOn(line, q.to[0], q.to[1]);
    out.push({
      quay: q,
      s0: Math.min(a.s, b.s),
      s1: Math.max(a.s, b.s),
      side: q.bank === 'left' ? 1 : -1,
      gaps: (q.gaps ?? []).map((g) => ({ s: footOn(line, g.at[0], g.at[1]).s, half: g.width / 2 })),
    });
  }
  return out;
}

/** Ramp length (real m) over which a quay blends into the natural bank at each end. */
export const QUAY_END_BLEND = 14;

/**
 * Quay influence 0..1 at chainage s on the given side (1 = full quay profile). Gaps do not change
 * the ground (the quay top continues over an outfall); they only open the wall.
 */
export function quayInfluence(q: ResolvedQuay, s: number, side: number): number {
  if (side !== q.side) return 0;
  if (s < q.s0 - QUAY_END_BLEND || s > q.s1 + QUAY_END_BLEND) return 0;
  const a = Math.min(1, Math.max(0, (s - (q.s0 - QUAY_END_BLEND)) / QUAY_END_BLEND));
  const b = Math.min(1, Math.max(0, (q.s1 + QUAY_END_BLEND - s) / QUAY_END_BLEND));
  const k = Math.min(a, b);
  return k * k * (3 - 2 * k);
}
