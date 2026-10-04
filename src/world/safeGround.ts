/**
 * Finding somewhere safe to put the player: open, walkable ground at street level with room to
 * stand and to move, not in water, not on a roof, a ledge or in a basin. Used for spawns
 * (`&at=` links, the start, loads) and for "I'm stuck" in the pause menu.
 */
import * as THREE from 'three';
import type { Game } from '../core/Game';
import { Layer } from '../core/Physics';
import { K } from './city/raster';

export interface SafeGroundOptions {
  /** Search radius (m) around the point. */
  maxRadius?: number;
  /** Clear distance (m) needed in most of 8 directions at knee and chest height. */
  open?: number;
  /** How many of the 8 directions must be open. */
  openDirs?: number;
  /** Skip the spot itself (unstuck: the player is standing on it). */
  excludeCenter?: boolean;
  /** Prefer ground no higher than this above the terrain (m): street level, not on top of things. */
  maxAboveTerrain?: number;
  /**
   * Re-check each candidate after streaming the city's detail around it (default true). The city
   * builds buildings and their colliders only near the camera/player, so a far candidate can look
   * open and turn out to be inside a building once it streams in. Costs a prime per candidate.
   */
  verify?: boolean;
}

const DOWN = { x: 0, y: -1, z: 0 };

/**
 * City plan cells nobody should be put down in. Buildable lots become buildings whose colliders
 * stream in only near the camera (so ray tests there can't be trusted); walls, aqueducts and garden
 * trees likewise collide only near the player. Water and steep ground are no place to stand.
 */
const NO_STAND: ReadonlySet<number> = new Set([K.FREE, K.WATER, K.STEEP, K.WALL, K.AQUEDUCT, K.GARDEN]);
const UP = { x: 0, y: 1, z: 0 };

/**
 * Rapier only answers queries about colliders that a step has put in its broad phase. Colliders
 * added during loading (landmarks, streets) are invisible to ray casts until then; a tiny step
 * flushes them. Cheap and harmless to call more than once.
 */
export function flushPhysicsQueries(game: Game) {
  game.physics.step(1e-4);
}

/** Build the city's lazy (near-the-player) colliders around a point, then flush them to queries. */
export function primeArea(game: Game, at: THREE.Vector3Like) {
  (game as Game & { city?: { prime?: (p: THREE.Vector3Like) => void } }).city?.prime?.(at);
  flushPhysicsQueries(game);
}

/** Would a player capsule standing with its feet here overlap any world geometry? */
export function capsuleBlocked(game: Game, x: number, y: number, z: number): boolean {
  for (const h of [0.45, 0.95, 1.45]) {
    if (game.physics.overlapSphere({ x, y: y + h, z }, 0.36, Layer.World).length) return true;
  }
  return false;
}

/** Is this a good place to stand? Returns the feet position or null. */
export function standableAt(game: Game, x: number, z: number, nearY: number, opts: SafeGroundOptions = {}): THREE.Vector3 | null {
  const physics = game.physics;
  const cls = (game as Game & { city?: { classAt?: (x: number, z: number) => number } }).city?.classAt?.(x, z);
  if (cls !== undefined && NO_STAND.has(cls)) return null;
  const hit = physics.raycast({ x, y: nearY + 30, z }, DOWN, 60, Layer.World);
  if (!hit || hit.normal.y < 0.85) return null;
  const y = hit.point.y;
  // Street level: not standing on top of a building, a wall, a stall or a statue base.
  const terrainY = game.terrain?.heightAt?.(x, z);
  if (terrainY !== undefined && y - terrainY > (opts.maxAboveTerrain ?? 0.6)) return null;
  // Not in water.
  const water = game.terrain?.surfaceAt?.(x, z);
  if (water === 'water') return null;
  // Room to stand (2 m clear above the feet, and the body overlapping nothing) …
  if (physics.raycast({ x, y: y + 0.05, z }, UP, 2.0, Layer.World)) return null;
  if (capsuleBlocked(game, x, y + 0.05, z)) return null;
  // … and to move: open in most directions at knee and chest height.
  const open = opts.open ?? 3;
  let clear = 0;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const dir = { x: Math.cos(a), y: 0, z: Math.sin(a) };
    if (physics.raycast({ x, y: y + 0.35, z }, dir, open, Layer.World)) continue;
    if (physics.raycast({ x, y: y + 1.3, z }, dir, open, Layer.World)) continue;
    // No sudden drop or wall-high rise right there (a basin, a stair edge).
    const gy = physics.groundHeight(x + dir.x * 1.2, z + dir.z * 1.2, y + 2, 6);
    if (gy === null || Math.abs(gy - y) > 0.4) continue;
    clear++;
  }
  if (clear < (opts.openDirs ?? 6)) return null;
  return new THREE.Vector3(x, y + 0.05, z);
}

/** Nearest safe ground to `near` within `maxRadius`, searching outward in rings; null if none. */
export function findSafeGround(game: Game, near: THREE.Vector3Like, opts: SafeGroundOptions = {}): THREE.Vector3 | null {
  primeArea(game, near);
  const maxR = opts.maxRadius ?? 40;
  const verify = opts.verify ?? true;
  let checks = 0;
  const accept = (p: THREE.Vector3 | null): THREE.Vector3 | null => {
    if (!p || !verify) return p;
    if (++checks > 24) return null;
    // Stream the city in around it and look again with every collider in place.
    primeArea(game, p);
    return standableAt(game, p.x, p.z, p.y, opts);
  };
  if (!opts.excludeCenter) {
    const here = accept(standableAt(game, near.x, near.z, near.y, opts));
    if (here) return here;
  }
  for (let r = 1.5; r <= maxR; r += 1.5) {
    const n = Math.max(8, Math.round((2 * Math.PI * r) / 1.5));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const p = accept(standableAt(game, near.x + Math.cos(a) * r, near.z + Math.sin(a) * r, near.y, opts));
      if (p) return p;
      if (checks > 24) return null;
    }
  }
  return null;
}

/**
 * The heading (model +Z convention) a spawned player should face from `at`: toward `target` if
 * it is in view (nothing within `minClear` m in the way at eye height), else the most open way.
 */
export function openHeading(game: Game, at: THREE.Vector3Like, target: THREE.Vector3Like | null, minClear = 10): number {
  const physics = game.physics;
  const eye = { x: at.x, y: at.y + 1.6, z: at.z };
  if (target) {
    const dx = target.x - at.x, dz = target.z - at.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.1) {
      const hit = physics.raycast(eye, { x: dx / d, y: 0, z: dz / d }, Math.min(d, 60), Layer.World);
      if (!hit || hit.distance >= Math.min(minClear, d - 1)) return Math.atan2(dx, dz);
    }
  }
  let best = 0, bestD = -1;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const dir = { x: Math.sin(a), y: 0, z: Math.cos(a) };
    const hit = physics.raycast(eye, dir, 80, Layer.World);
    const dist = hit ? hit.distance : 80;
    if (dist > bestD) { bestD = dist; best = a; }
  }
  return best;
}

/**
 * After a teleport (which primes the city's lazy colliders at the destination): if the body now
 * overlaps something that only just appeared, step to the nearest clear ground. Returns true if
 * the player was moved.
 */
export function settleAfterTeleport(game: Game): boolean {
  const p = game.player;
  if (!p) return false;
  flushPhysicsQueries(game);
  const pos = p.position;
  if (!capsuleBlocked(game, pos.x, pos.y, pos.z)) return false;
  const safe = findSafeGround(game, pos, { maxRadius: 25, excludeCenter: true, open: 2, openDirs: 5 });
  if (!safe) return false;
  p.teleport(safe, p.heading);
  return true;
}
