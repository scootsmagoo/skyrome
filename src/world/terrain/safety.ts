/**
 * The edge of the world and a safety net under it.
 *
 * - `worldEdgeWalls`: four tall, thin, invisible box colliders just inside the heightmap grid, so
 *   nobody walks off the modelled land onto the collider-less apron (the land beyond is scenery).
 * - `SafetyNet`: if the player still ends up below the world (a crack, a glitch, a future bug),
 *   they are put back where they last stood on solid ground. Runs after the player controller.
 */
import * as THREE from 'three';
import type { Game, System } from '../../core/Game';
import type { Heightmap } from './heightmap';

declare module '../../core/Events' {
  interface GameEvents {
    /** The safety net caught the player below the world and put them back at `to`. */
    'player:rescued': { from: THREE.Vector3; to: THREE.Vector3 };
  }
}

/** The grid's playable rectangle: the grid minus `inset` (game m) on every side. */
export function playableBounds(hm: Heightmap, inset = 4) {
  return { minX: hm.minX + inset, maxX: hm.maxX - inset, minZ: hm.minZ + inset, maxZ: hm.maxZ - inset };
}

/** Lowest and highest terrain heights (game y). */
export function heightRange(hm: Heightmap): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (const h of hm.heights) {
    if (h < lo) lo = h;
    if (h > hi) hi = h;
  }
  return [lo, hi];
}

/**
 * Box specs (centre, half extents) for walls around the playable rectangle, from below the lowest
 * ground to well above the highest. Pure.
 */
export function edgeWallBoxes(hm: Heightmap, inset = 4, thick = 1): { center: THREE.Vector3; half: THREE.Vector3 }[] {
  const b = playableBounds(hm, inset);
  const [lo, hi] = heightRange(hm);
  const y0 = lo - 60, y1 = hi + 120;
  const cy = (y0 + y1) / 2, hy = (y1 - y0) / 2;
  const w = (b.maxX - b.minX) / 2 + thick, d = (b.maxZ - b.minZ) / 2 + thick;
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  return [
    { center: new THREE.Vector3(cx, cy, b.minZ - thick / 2), half: new THREE.Vector3(w, hy, thick / 2) },
    { center: new THREE.Vector3(cx, cy, b.maxZ + thick / 2), half: new THREE.Vector3(w, hy, thick / 2) },
    { center: new THREE.Vector3(b.minX - thick / 2, cy, cz), half: new THREE.Vector3(thick / 2, hy, d) },
    { center: new THREE.Vector3(b.maxX + thick / 2, cy, cz), half: new THREE.Vector3(thick / 2, hy, d) },
  ];
}

export function addWorldEdgeWalls(game: Game, hm: Heightmap, owner?: unknown) {
  return edgeWallBoxes(hm).map((w) => game.physics.addBox(w.center, w.half, 0, { owner }));
}

export class SafetyNet implements System {
  readonly name = 'safetyNet';
  /** After the player controller (-10): checks the position this step produced. */
  readonly priority = -9;
  /** Below this the player is lost (game y). */
  readonly floorY: number;
  private readonly bounds: ReturnType<typeof playableBounds>;
  private safe: THREE.Vector3 | null = null;
  private candidate: THREE.Vector3 | null = null;
  private acc = 0;
  /** Times the net has caught the player. */
  rescues = 0;

  constructor(
    private readonly game: Game,
    private readonly hm: Heightmap,
  ) {
    this.floorY = heightRange(hm)[0] - 30;
    this.bounds = playableBounds(hm, 6);
  }

  fixedUpdate(dt: number) {
    const p = this.game.player;
    if (!p) return;
    const pos = p.position;
    if (pos.y < this.floorY) {
      this.rescue();
      return;
    }
    // Remember where the player stood, half a second apart: `safe` is always at least that old,
    // so it is not the very edge they just stepped off.
    this.acc += dt;
    if (this.acc < 0.5) return;
    this.acc = 0;
    const b = this.bounds;
    const swimming = (p as { swimming?: boolean }).swimming;
    if (!p.grounded || swimming || pos.x < b.minX || pos.x > b.maxX || pos.z < b.minZ || pos.z > b.maxZ) return;
    this.safe = this.candidate;
    this.candidate = pos.clone();
  }

  /** Put the player back on solid ground. */
  rescue() {
    const p = this.game.player;
    const from = p.position.clone();
    let to = this.safe ?? this.candidate;
    if (!to) {
      const b = this.bounds;
      const x = Math.min(b.maxX, Math.max(b.minX, from.x)), z = Math.min(b.maxZ, Math.max(b.minZ, from.z));
      to = new THREE.Vector3(x, this.hm.heightAt(x, z), z);
    }
    to = to.clone();
    to.y += 0.1;
    p.teleport(to);
    this.candidate = this.safe;
    this.rescues++;
    this.game.events.emit('player:rescued', { from, to });
  }
}
