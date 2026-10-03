/**
 * Compass math (pure). Bearings are compass degrees: 0 = north (−z), 90 = east (+x).
 * The compass shows `COMPASS_SPAN` degrees centered on the camera's heading.
 */

/** Degrees visible across the whole compass bar. */
export const COMPASS_SPAN = 180;

/** Compass bearing (0..360) of a direction in the xz plane. */
export function bearingOfDir(dx: number, dz: number): number {
  const b = (Math.atan2(dx, -dz) * 180) / Math.PI;
  return ((b % 360) + 360) % 360;
}

/** Bearing from one point to another. */
export function bearingTo(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return bearingOfDir(toX - fromX, toZ - fromZ);
}

/** Signed difference target − heading wrapped into (−180, 180]. Positive = to the right. */
export function relativeBearing(heading: number, target: number): number {
  let d = (target - heading) % 360;
  if (d <= -180) d += 360;
  if (d > 180) d -= 360;
  return d;
}

/**
 * Horizontal position on the compass in −1..1 (0 = center) for a relative bearing, or null when
 * it falls outside the visible span. With `clamp`, out-of-view markers stick to the nearest edge
 * (used for the tracked quest so the player always knows which way to turn).
 */
export function compassPosition(rel: number, span = COMPASS_SPAN, clamp = false): number | null {
  const half = span / 2;
  if (Math.abs(rel) > half) return clamp ? Math.sign(rel) || 1 : null;
  return rel / half;
}

/** Opacity falloff toward the compass ends (1 in the middle, 0 at the edge). */
export function edgeFade(pos: number, start = 0.78): number {
  const a = Math.abs(pos);
  if (a <= start) return 1;
  return Math.max(0, 1 - (a - start) / (1 - start));
}

export interface CardinalLabel {
  bearing: number;
  text: string;
  major: boolean;
}

/** Labels painted on the compass strip. Latin uses three-letter abbreviations because
 *  Oriens and Occidens share an initial. */
export function cardinalLabels(latin: boolean): CardinalLabel[] {
  const major = latin ? ['SEP', 'ORI', 'MER', 'OCC'] : ['N', 'E', 'S', 'W'];
  return [
    { bearing: 0, text: major[0], major: true },
    { bearing: 90, text: major[1], major: true },
    { bearing: 180, text: major[2], major: true },
    { bearing: 270, text: major[3], major: true },
  ];
}

/** Horizontal distance in meters, for marker labels ('42 m'). */
export function distance2(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(bx - ax, bz - az);
}
