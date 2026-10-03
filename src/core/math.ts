/**
 * Math helpers and orientation conventions.
 *
 * World: meters, +x east, +y up, +z SOUTH (north is -z).
 * Character models face +Z in their local space (glTF convention). A character's `heading`
 * θ (radians) means its forward vector is (sin θ, 0, cos θ); set `object.rotation.y = θ`.
 * Cameras look down -Z: a camera with yaw ψ looks along (-sin ψ, 0, -cos ψ) — i.e. heading ψ + π.
 */
import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Frame-rate independent exponential approach: fraction to move this frame given a rate (1/s). */
export const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

/** Wrap an angle to (-π, π]. */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Move angle `from` toward `to` by at most `maxStep` radians along the shortest arc. */
export function approachAngle(from: number, to: number, maxStep: number): number {
  const d = wrapAngle(to - from);
  if (Math.abs(d) <= maxStep) return to;
  return from + Math.sign(d) * maxStep;
}

/** Heading of a direction in the xz plane (model faces +Z convention). */
export const headingFromDir = (dx: number, dz: number) => Math.atan2(dx, dz);
export const dirFromHeading = (h: number, out = new THREE.Vector3()) => out.set(Math.sin(h), 0, Math.cos(h));

/** Compass bearing in degrees (0 = north, 90 = east) → three.js rotation.y for a building whose facade faces -z locally. */
export const bearingToRotationY = (bearingDeg: number) => -bearingDeg * DEG;
/** Compass bearing (degrees) of a direction in the xz plane. */
export const bearingOf = (dx: number, dz: number) => ((Math.atan2(dx, -dz) / DEG) % 360 + 360) % 360;
