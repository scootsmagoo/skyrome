/**
 * Relief for the cloth painted on the body (the toga and palla on the torso and the left arm, the stola's
 * pleats): coherent folds as extra layer thickness (assemble.ts lifts the cloth by it and lights the result from
 * the displaced surface) and a matching shade, so the garment reads as draped cloth, not a coat of paint.
 *
 * Pure maths over the same rules the procedural builders paint with (build/garments.ts): `sashDist` and `inToga`
 * there are private, so the two small functions are repeated here.
 */
import type { Levels } from '../../build/body';
import type { Outfit } from '../../build/outfit';
import { ridge, vnoise } from './folds';

export interface Relief {
  /** Extra layer thickness (m), may be negative. */
  thick: number;
  /** Colour multiplier: creases in shade, crests in light. */
  shade: number;
}

/** Signed distance (m) from the diagonal band of the toga/palla (left shoulder to right hip); + above/right. */
export function sashDist(L: Levels, x: number, y: number): number {
  const x0 = 0.11 * L.s;
  const y0 = L.shoulder + 0.01 * L.s;
  const x1 = -0.17 * L.s;
  const y1 = L.waist - 0.02 * L.s;
  const dx = x1 - x0;
  const dy = y1 - y0;
  return ((x - x0) * dy - (y - y0) * dx) / Math.hypot(dx, dy);
}

/** Where the toga covers the torso: everything except the right shoulder and upper chest above the sash. */
export function inToga(L: Levels, x: number, y: number, z: number): boolean {
  if (y < L.armpit - 0.02 * L.s) return true;
  const d = sashDist(L, x, y);
  if (z > -0.02 * L.s) return d > -0.035 * L.s || x > 0.04 * L.s;
  return x > -0.06 * L.s || y < L.chest - 0.02 * L.s;
}

/** Relief of the cloth on the torso at (x, y, z), or null when the rules paint no draped cloth there. */
export function torsoRelief(o: Outfit, L: Levels, x: number, y: number, z: number, seed: number): Relief | null {
  const s = L.s;
  if (o.armor.body) return null;
  if (o.toga && y > L.crotch && y < L.neckBase - 0.01 * s && inToga(L, x, y, z)) {
    let h: number;
    let amp: number;
    if (z > -0.02 * s) {
      // Front: pleats run parallel to the sash, widening toward the hip; the cloth gathers along the sash itself.
      const d = sashDist(L, x, y);
      const period = (0.05 + 0.02 * Math.max(0, -d / s) * 4) * s;
      h = ridge((d / period) * Math.PI + vnoise(x * 6 + y * 3, seed) * 0.5);
      amp = 0.0065 * s * (0.45 + 0.55 * Math.exp(-Math.pow(d / (0.09 * s), 2)));
    } else {
      // Back: the end of the toga falls from the left shoulder in vertical pillars.
      const fall = Math.min(1, Math.max(0, (L.shoulder - y) / (0.25 * s)));
      h = ridge(((x + 0.02 * s * vnoise(y * 4, seed)) / (0.055 * s)) * Math.PI + seed);
      amp = 0.006 * s * (0.35 + 0.65 * fall);
    }
    return { thick: -0.009 * s + amp * (h - 0.4), shade: 0.78 + 0.22 * h };
  }
  if (o.palla && !o.toga && y > L.crotch && y < L.chest - 0.02 * s) {
    const d = sashDist(L, x, y + 0.05 * s);
    if (y < L.waist + 0.02 * s || d > 0) {
      const h = ridge((d / (0.05 * s)) * Math.PI + vnoise(x * 6 + y * 3, seed) * 0.5);
      return { thick: 0.005 * s * (h - 0.4), shade: 0.84 + 0.16 * h };
    }
  }
  if (o.stola && !o.toga && y > L.crotch && y < L.armpit + 0.03 * s) {
    // The stola's close vertical pleats, fuller toward the belt.
    const h = ridge((x / (0.022 * s)) * Math.PI + 0.4 * vnoise(y * 5, seed));
    return { thick: 0.0028 * s * (h - 0.4), shade: 0.9 + 0.1 * h };
  }
  return null;
}

/** Relief of a toga or palla draped over the left arm: pillars hanging along the arm, deeper toward the elbow. */
export function armRelief(o: Outfit, L: Levels, side: 'L' | 'R', y: number, th: number, seed: number): Relief | null {
  const s = L.s;
  if (side !== 'L' || !(o.toga || o.palla)) return null;
  const down = Math.min(1, Math.max(0, (L.shoulder - y) / (L.shoulder - L.elbow + 0.09 * s)));
  const h = ridge(th * 1.6 + y * 5 + 0.6 * vnoise(y * 7, seed) + seed);
  return { thick: 0.008 * s * (0.3 + 0.7 * down) * (h - 0.4), shade: 0.8 + 0.2 * h };
}
