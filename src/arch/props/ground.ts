/**
 * Prop grounding: where a prop of a given footprint sits on uneven ground. The ground is sampled
 * under the footprint's four corners and its centre; the prop takes the best-fit plane through them,
 * its slope capped at PROP_MAX_SLOPE (a stall on a hillside leans a few degrees, never more), and
 * sinks until no corner floats (a hand's breadth at most). Pure: no three.js.
 */

/** Steepest tilt a prop takes (rise per run: ~8.5 degrees). */
export const PROP_MAX_SLOPE = 0.15;
/** Deepest a prop sinks to keep every corner on the ground (m). */
export const PROP_MAX_SINK = 0.1;
/** Footprint half-extent beyond which the outer part is ignored (a cart's pole is not its footprint). */
const MAX_HALF = 1.6;

export interface Footprint {
  /** Bounds of the prop's model in its own frame (x, z), already scaled. */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Grounding {
  /** Lift to add to the y the caller chose for the origin (it assumed the ground under the origin). */
  dy: number;
  /** Ground gradient the prop leans with (rise per metre, after the cap), in the caller's x / z. */
  gx: number;
  gz: number;
  /** The surface height under the prop's origin, as `ground` reports it (so a caller can tell if its own y lay under it). */
  origin: number;
  /** Worst gap between the prop's base and the ground under a footprint corner (m, + = floating). */
  worstGap: number;
}

/**
 * `ground(x, z)` is the surface height in the caller's frame; the prop's origin stands at (x, z)
 * and is turned by `rotY` (three.js: x' = x cos + z sin, z' = z cos - x sin).
 */
export function groundProp(ground: (x: number, z: number) => number, x: number, z: number, rotY: number, fp: Footprint): Grounding {
  const cx = (fp.minX + fp.maxX) / 2, cz = (fp.minZ + fp.maxZ) / 2;
  const hx = Math.min(MAX_HALF, (fp.maxX - fp.minX) / 2), hz = Math.min(MAX_HALF, (fp.maxZ - fp.minZ) / 2);
  const c = Math.cos(rotY), s = Math.sin(rotY);
  const rot = (px: number, pz: number): [number, number] => [x + px * c + pz * s, z + pz * c - px * s];
  const [mx, mz] = rot(cx, cz);
  const pts: [number, number][] = [];
  for (const [ox, oz] of [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]]) pts.push(rot(cx + ox, cz + oz));
  const gOrigin = ground(x, z);
  const gs = pts.map(([px, pz]) => ground(px, pz));
  const gm = ground(mx, mz);
  if (!Number.isFinite(gOrigin) || !Number.isFinite(gm) || gs.some((g) => !Number.isFinite(g))) return { dy: 0, gx: 0, gz: 0, origin: Number.isFinite(gOrigin) ? gOrigin : -Infinity, worstGap: 0 };
  const mean = (gs[0] + gs[1] + gs[2] + gs[3] + gm) / 5;
  // Least squares g = mean + gx dx + gz dz over the corners (the centre has dx = dz = 0).
  let sxx = 0, sxz = 0, szz = 0, sxg = 0, szg = 0;
  for (let i = 0; i < 4; i++) {
    const dx = pts[i][0] - mx, dz = pts[i][1] - mz, dg = gs[i] - mean;
    sxx += dx * dx;
    sxz += dx * dz;
    szz += dz * dz;
    sxg += dx * dg;
    szg += dz * dg;
  }
  const det = sxx * szz - sxz * sxz;
  let gx = 0, gz = 0;
  if (Math.abs(det) > 1e-9) {
    gx = (sxg * szz - szg * sxz) / det;
    gz = (szg * sxx - sxg * sxz) / det;
  }
  const slope = Math.hypot(gx, gz);
  if (slope > PROP_MAX_SLOPE) {
    gx *= PROP_MAX_SLOPE / slope;
    gz *= PROP_MAX_SLOPE / slope;
  }
  // The leaning plane through the footprint centre, then sunk until no corner floats.
  const plane = (px: number, pz: number) => mean + gx * (px - mx) + gz * (pz - mz);
  let lowest = 0;
  for (let i = 0; i < 4; i++) lowest = Math.min(lowest, gs[i] - plane(pts[i][0], pts[i][1]));
  const sink = Math.max(-PROP_MAX_SINK, lowest);
  const y0 = plane(x, z) + sink;
  let worstGap = 0;
  for (let i = 0; i < 4; i++) worstGap = Math.max(worstGap, plane(pts[i][0], pts[i][1]) + sink - gs[i]);
  return { dy: y0 - gOrigin, gx, gz, origin: gOrigin, worstGap };
}
