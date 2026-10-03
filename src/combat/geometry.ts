/**
 * Hit geometry: a weapon's swept arc against character capsules (pure math, unit-tested).
 *
 * Hits come from the character, never from the camera (§4.4 "Combat parity"): at the hit frame
 * the blade is a segment that starts at the attacker's hand — its distance from the shoulder axis
 * and its height are read from the avatar's `handR` socket — and reaches `weapon.reach` beyond
 * it. The segment sweeps the attack's arc around the attacker's facing (a thrust is narrow, a cut
 * wide, the sideways power sweep 140°). A target is hit when any sampled segment touches its
 * capsule (vertical cylinder of radius r between y0 and y1).
 */
import { DEG, headingFromDir, wrapAngle } from '../core/math';
import type { DamageType } from '../rpg/types';

/** Body dimensions shared by the hit test and the AI's spacing. */
export const BODY = {
  /** Default horizontal shoulder → hand distance at the hit frame (m). */
  handDist: 0.55,
  minHand: 0.35,
  maxHand: 0.8,
  /** Shoulder (pivot) height above the feet when no avatar socket is available. */
  shoulder: 1.38,
  /** Default capsule radius (core/Physics createCharacter). */
  radius: 0.35,
  height: 1.8,
};

/** Arc widths in degrees by kind of stroke. */
export const ARC = { thrust: 50, cut: 110, blunt: 100, overhead: 60, sweep: 140, bash: 90 } as const;

/** Arc (radians) for an attack of a damage type; `sweep` / `overhead` / `bash` override. */
export function arcFor(type: DamageType, o: { sweep?: boolean; overhead?: boolean; bash?: boolean } = {}): number {
  if (o.sweep) return ARC.sweep * DEG;
  if (o.bash) return ARC.bash * DEG;
  if (o.overhead) return ARC.overhead * DEG;
  return (type === 'thrust' ? ARC.thrust : type === 'cut' ? ARC.cut : ARC.blunt) * DEG;
}

/**
 * Centre-to-centre distance at which a weapon of `reach` touches a target of `targetRadius`
 * (hand extension + blade + the target's body). The AI spaces itself with this.
 */
export function meleeRange(reach: number, targetRadius = BODY.radius): number {
  return BODY.handDist + reach + targetRadius;
}

export interface Sweep {
  /** Shoulder pivot (world). */
  x: number;
  y: number;
  z: number;
  /** Attacker heading (model forward = (sin h, 0, cos h)). */
  heading: number;
  /** Horizontal pivot → hand distance. */
  handDist: number;
  /** Weapon length beyond the hand. */
  reach: number;
  /** Total arc, radians, centred on the heading. */
  arc: number;
  /** Vertical band the blade covers (world y). */
  y0: number;
  y1: number;
  /** Segments sampled across the arc (default: one per ~10°, at least 3). */
  samples?: number;
}

export interface Capsule {
  x: number;
  z: number;
  /** Feet and top (world y). */
  y0: number;
  y1: number;
  r: number;
}

/** Squared distance from point (px, pz) to segment a→b in the ground plane. */
export function segmentPointDist2(ax: number, az: number, bx: number, bz: number, px: number, pz: number): number {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const l2 = vx * vx + vz * vz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, (wx * vx + wz * vz) / l2)) : 0;
  const dx = ax + vx * t - px;
  const dz = az + vz * t - pz;
  return dx * dx + dz * dz;
}

/**
 * Sweep test. Returns the smallest |angle| (radians from the attacker's facing) at which the blade
 * touches the capsule — useful to pick the most central of several targets — or -1 for a miss.
 */
export function sweepCapsule(s: Sweep, c: Capsule): number {
  if (s.y1 < c.y0 || s.y0 > c.y1) return -1;
  // An odd count, so the segment straight ahead is always tested.
  const n = s.samples ?? Math.max(3, Math.ceil(s.arc / (10 * DEG)) + 1) | 1;
  const r2 = c.r * c.r;
  let best = -1;
  // The blade's inner end sits a little inside the hand so a target hugging the attacker is hit too.
  const inner = Math.min(0.2, s.handDist * 0.5);
  const outer = s.handDist + s.reach;
  for (let i = 0; i < n; i++) {
    const off = n === 1 ? 0 : -s.arc / 2 + (s.arc * i) / (n - 1);
    const h = s.heading + off;
    const dx = Math.sin(h);
    const dz = Math.cos(h);
    const d2 = segmentPointDist2(s.x + dx * inner, s.z + dz * inner, s.x + dx * outer, s.z + dz * outer, c.x, c.z);
    if (d2 <= r2 && (best < 0 || Math.abs(off) < best)) best = Math.abs(off);
  }
  return best;
}

/** Signed angle (radians) from `heading` to the direction of (dx, dz). */
export function angleTo(heading: number, dx: number, dz: number): number {
  return wrapAngle(headingFromDir(dx, dz) - heading);
}

/** Is `to` within ±halfArc of `heading` as seen from `from`? */
export function inArc(heading: number, from: { x: number; z: number }, to: { x: number; z: number }, halfArc: number): boolean {
  return Math.abs(angleTo(heading, to.x - from.x, to.z - from.z)) <= halfArc;
}

/** Horizontal distance. */
export function dist2D(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Classify a movement direction relative to a facing as a power-attack direction (§6.1). */
export function powerDirection(heading: number, mx: number, mz: number): 'none' | 'forward' | 'sideways' | 'back' {
  if (mx * mx + mz * mz < 1e-6) return 'none';
  const a = Math.abs(angleTo(heading, mx, mz));
  if (a <= 50 * DEG) return 'forward';
  if (a >= 130 * DEG) return 'back';
  return 'sideways';
}
