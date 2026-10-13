/**
 * The guns, as pure data and pure helpers (tests/anachronism.test.ts). Ammunition is infinite and
 * there is no reloading: the cheat is for fun.
 */
import type { GunId } from './types';

export interface GunStats {
  id: GunId;
  name: string;
  /** Fires while the trigger is held (else one shot a press). */
  auto: boolean;
  /** Rounds a minute (the fastest a trigger can be worked). */
  rpm: number;
  /** Damage of one bullet or pellet (people have ~100 health; an armoured gladiator more). */
  damage: number;
  pellets: number;
  /** Cone half-angle (degrees) of the shot's scatter; the rifle's grows while held (`bloom`). */
  spread: number;
  bloom?: { perShot: number; max: number; recover: number };
  /** Range of a bullet (m). */
  range: number;
  /** Muzzle climb a shot (radians of camera pitch). */
  recoil: number;
  /** A hit throws its man down (the shotgun up close), from this many pellets. */
  knockdownPellets?: number;
  rocket?: { speed: number; radius: number; damage: number };
}

export const GUNS: Record<GunId, GunStats> = {
  pistol: { id: 'pistol', name: 'Pistol', auto: false, rpm: 360, damage: 45, pellets: 1, spread: 0.5, range: 150, recoil: 0.025 },
  rifle: { id: 'rifle', name: 'Assault rifle', auto: true, rpm: 600, damage: 30, pellets: 1, spread: 0.9, bloom: { perShot: 0.35, max: 3.2, recover: 6 }, range: 220, recoil: 0.012 },
  shotgun: { id: 'shotgun', name: 'Shotgun', auto: false, rpm: 70, damage: 16, pellets: 9, spread: 4.5, range: 45, recoil: 0.06, knockdownPellets: 4 },
  rpg: { id: 'rpg', name: 'RPG', auto: false, rpm: 30, damage: 0, pellets: 0, spread: 0.4, range: 300, recoil: 0.07, rocket: { speed: 55, radius: 7, damage: 180 } },
};

export const GUN_ORDER: GunId[] = ['pistol', 'rifle', 'shotgun', 'rpg'];

/** Seconds between shots. */
export function shotInterval(g: GunStats): number {
  return 60 / g.rpm;
}

/** The next gun in the cycle. */
export function nextGun(id: GunId | null, dir: 1 | -1 = 1): GunId {
  const i = id ? GUN_ORDER.indexOf(id) : -1;
  return GUN_ORDER[(i + dir + GUN_ORDER.length) % GUN_ORDER.length];
}

/**
 * Blast damage at `d` metres from the centre of a blast of `radius`: full within a fifth of the
 * radius, falling off with the square to nothing at the edge.
 */
export function blastDamage(d: number, radius: number, max: number): number {
  if (d >= radius) return 0;
  const k = Math.max(0, (d - radius * 0.2) / (radius * 0.8));
  return max * (1 - k) * (1 - k);
}

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/**
 * A direction scattered inside a cone of half-angle `deg` around unit `dir` (u, v in 0..1 pick the
 * point: uniform over the cone's disc). Returns a new unit vector.
 */
export function scatter(dir: V3, deg: number, u: number, v: number): V3 {
  if (deg <= 0) return { ...dir };
  // Two axes perpendicular to dir.
  const ax = Math.abs(dir.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  let px = dir.y * ax.z - dir.z * ax.y, py = dir.z * ax.x - dir.x * ax.z, pz = dir.x * ax.y - dir.y * ax.x;
  const pl = Math.hypot(px, py, pz) || 1;
  px /= pl; py /= pl; pz /= pl;
  const qx = dir.y * pz - dir.z * py, qy = dir.z * px - dir.x * pz, qz = dir.x * py - dir.y * px;
  const r = Math.tan((deg * Math.PI) / 180) * Math.sqrt(u);
  const a = v * Math.PI * 2;
  const ox = Math.cos(a) * r, oy = Math.sin(a) * r;
  const x = dir.x + px * ox + qx * oy, y = dir.y + py * ox + qy * oy, z = dir.z + pz * ox + qz * oy;
  const l = Math.hypot(x, y, z) || 1;
  return { x: x / l, y: y / l, z: z / l };
}

/**
 * Distance along a ray (origin `o`, unit `d`) to a standing person's capsule (feet at `f`, `h` tall,
 * radius `r`), or null if it misses within `max`. The capsule is a vertical segment swept by r.
 */
export function rayCapsule(o: V3, d: V3, max: number, f: V3, h: number, r: number): number | null {
  // Closest approach between the ray and the capsule's axis segment (feet+r … top−r).
  const a0 = { x: f.x, y: f.y + r, z: f.z };
  const seg = Math.max(0, h - 2 * r);
  // Axis direction is +y.
  const wx = o.x - a0.x, wy = o.y - a0.y, wz = o.z - a0.z;
  const b = d.y; // dot(d, axis)
  const dd = 1; // |d|²
  const e = wy; // dot(w, axis)
  const c = d.x * wx + d.y * wy + d.z * wz; // dot(d, w)
  const den = dd - b * b;
  let t: number, s: number;
  if (den < 1e-8) {
    t = 0;
    s = e;
  } else {
    t = (b * e - c) / den;
    s = (dd * e - b * c) / den;
  }
  s = Math.max(0, Math.min(seg, s));
  // Re-project t for the clamped s.
  t = Math.max(0, -(c - b * s) / dd);
  const px = o.x + d.x * t - a0.x, py = o.y + d.y * t - (a0.y + s), pz = o.z + d.z * t - a0.z;
  const dist2 = px * px + py * py + pz * pz;
  if (dist2 > r * r) return null;
  // Step back to the surface along the ray.
  const back = Math.sqrt(Math.max(0, r * r - dist2));
  const hit = Math.max(0, t - back);
  return hit <= max ? hit : null;
}
