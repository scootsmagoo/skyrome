/**
 * Where a building meets the ground (phase 4b "solid ground", FABRIC): the ground sampled densely
 * along the whole outline for the foundation level, under a room for its floor, and across a
 * threshold for the step to the street. Pure, no three.js.
 *
 * Why dense sampling: a lot's floor stands at the highest sidewalk point of its frontage and its
 * walls run down to a foundation below the lowest ground under the footprint. The old generators
 * took that minimum from five to seven points, so on a hillside a dip between two corners left the
 * wall's foot hanging in the air (the "floating buildings" of the audit: 294 lots, worst 2.09 m).
 * The audit measures a wall's foot every 0.75 m against the ground 0.3 m outside it, so the
 * outline is walked every metre or less, both on the footprint line and `out` metres outside it.
 */
import type { LocalGround } from './types';

/** Margin the foundation reaches below the lowest ground along the outline (m). */
export const FOUNDATION_MARGIN = 0.5;
/** The audit probes the ground this far outside a wall's foot; the outline is sampled there too. */
export const FOOT_PROBE = 0.35;

/**
 * Lowest ground along the outline of a `w` × `d` footprint centred on the origin (and along the same
 * outline grown by `out`), sampled every `step` m or less. Starts from 0 (the floor) so a flat floor
 * never gets a foundation above itself.
 */
export function outlineMin(ground: LocalGround, w: number, d: number, step = 1, out = FOOT_PROBE): number {
  let min = 0;
  for (const g of [0, out]) {
    const hx = w / 2 + g, hz = d / 2 + g;
    const nx = Math.max(1, Math.ceil((2 * hx) / step)), nz = Math.max(1, Math.ceil((2 * hz) / step));
    for (let i = 0; i <= nx; i++) {
      const x = -hx + (2 * hx * i) / nx;
      min = Math.min(min, ground(x, -hz), ground(x, hz));
    }
    for (let i = 1; i < nz; i++) {
      const z = -hz + (2 * hz * i) / nz;
      min = Math.min(min, ground(-hx, z), ground(hx, z));
    }
  }
  return min;
}

/** Foundation level of a footprint: the outline minimum less the margin. */
export function foundationLevel(ground: LocalGround, w: number, d: number): number {
  return outlineMin(ground, w, d) - FOUNDATION_MARGIN;
}

/** Highest ground over the rectangle x0..x1 × z0..z1, sampled every `step` m or less (corners included). */
export function rectMax(ground: LocalGround, x0: number, x1: number, z0: number, z1: number, step = 1): number {
  const nx = Math.max(1, Math.ceil(Math.abs(x1 - x0) / step)), nz = Math.max(1, Math.ceil(Math.abs(z1 - z0) / step));
  let max = -Infinity;
  for (let i = 0; i <= nx; i++) {
    const x = x0 + ((x1 - x0) * i) / nx;
    for (let k = 0; k <= nz; k++) max = Math.max(max, ground(x, z0 + ((z1 - z0) * k) / nz));
  }
  return max;
}

/** Lowest ground over the rectangle x0..x1 × z0..z1, sampled every `step` m or less (corners included). */
export function rectMin(ground: LocalGround, x0: number, x1: number, z0: number, z1: number, step = 1): number {
  const nx = Math.max(1, Math.ceil(Math.abs(x1 - x0) / step)), nz = Math.max(1, Math.ceil(Math.abs(z1 - z0) / step));
  let min = Infinity;
  for (let i = 0; i <= nx; i++) {
    const x = x0 + ((x1 - x0) * i) / nx;
    for (let k = 0; k <= nz; k++) min = Math.min(min, ground(x, z0 + ((z1 - z0) * k) / nz));
  }
  return min;
}

/** The most a threshold may stand above the street before the opening closes (m; the step-up assist). */
export const MAX_THRESHOLD_STEP = 0.3;

export interface BayFloor {
  /** Floor level of the bay (wall frame y). */
  y: number;
  /** Lowest ground across the opening, 0.3 m out (the step down to the street is y − low). */
  low: number;
  /** The highest ground under the room behind the opening. */
  room: number;
  /** The opening can stay open: no step over MAX_THRESHOLD_STEP from the street up to the floor. */
  open: boolean;
}

/**
 * Floor of an open bay in a wall frame (wall along x, outer face at z = `zf`, inside toward +z):
 * the highest of the ground at both jambs 0.3 m out and the highest ground under the room
 * (x0..x1, zf..zf + depth), so neither the pavement nor the hill cuts across the opening. The
 * floor is clamped to [yMin, yMax]. `open` is false where the street falls more than
 * MAX_THRESHOLD_STEP below that floor at either jamb: the shutters then close instead of a two-step
 * climb into a shop (a shop with its room on the hill, or a street falling away along the opening).
 */
export function bayFloor(ground: LocalGround, x0: number, x1: number, zf: number, depth: number, yMin: number, yMax: number): BayFloor {
  const out = zf - 0.3;
  const n = Math.max(2, Math.ceil((x1 - x0) / 0.5));
  let jamb = -Infinity, low = Infinity;
  for (let i = 0; i <= n; i++) {
    const g = ground(x0 + ((x1 - x0) * i) / n, out);
    jamb = Math.max(jamb, g);
    low = Math.min(low, g);
  }
  const room = depth > 0 ? rectMax(ground, x0, x1, zf, zf + depth, 0.8) : -Infinity;
  const y = Math.max(yMin, Math.min(yMax, Math.max(jamb, room)));
  return { y, low, room, open: y - low <= MAX_THRESHOLD_STEP && room <= jamb + MAX_THRESHOLD_STEP };
}

/**
 * Lowest ground along a straight run from a to b (local frame of the caller), on the centre line and
 * `half` m either side of it, sampled every `step` m or less. For walls and piers that stand on open
 * ground and are measured on both faces.
 */
export function runMin(H: (x: number, z: number) => number, ax: number, az: number, bx: number, bz: number, half: number, step = 1): { min: number; max: number } {
  const L = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.ceil(L / step));
  const nx = L > 1e-6 ? -(bz - az) / L : 0, nz = L > 1e-6 ? (bx - ax) / L : 1;
  let min = Infinity, max = -Infinity;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    for (const s of half > 0 ? [-half, 0, half] : [0]) {
      const h = H(x + nx * s, z + nz * s);
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }
  return { min, max };
}
