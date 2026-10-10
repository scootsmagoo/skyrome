/**
 * One walker's learned walls (NpcManager.learnWall, and the stuck ladder's last rung): spots it pushed
 * into and could not pass although the nav grid said the way was open (a low wall, a corner a cell was
 * too generous with). Its own path searches keep out of those cells (`NavGrid.avoid`, through
 * `NavService.findPath`) for a while; nobody else's do. So a false alarm (the edge of a crowd, a stall,
 * a shut door, a shove) never closes a doorway for everyone, and it lapses on its own. Pure: no physics.
 *
 *   walls.add(x, z);          // the cell under (x, z), for LEARNED_WALL_S seconds
 *   walls.tick(dt);           // each step (the Mover does it)
 *   nav.findPath(ax, az, bx, bz, true, walls);
 */

/** Seconds a learned wall stays in its walker's plans. */
export const LEARNED_WALL_S = 30;
/** Walls one walker remembers (the oldest goes first). */
export const MAX_LEARNED = 4;

export class LearnedWalls {
  /** Positions (x, z pairs), oldest first; `n` of them are live. */
  readonly xz = new Float32Array(2 * MAX_LEARNED);
  private readonly left = new Float32Array(MAX_LEARNED);
  n = 0;

  /** Remember a wall at (x, z) for `ttl` seconds (replacing the oldest when full). */
  add(x: number, z: number, ttl = LEARNED_WALL_S) {
    if (this.n === MAX_LEARNED) this.remove(0);
    const k = this.n++;
    this.xz[2 * k] = x;
    this.xz[2 * k + 1] = z;
    this.left[k] = ttl;
  }

  /** Age the walls; lapsed ones are forgotten. */
  tick(dt: number) {
    for (let k = this.n - 1; k >= 0; k--) {
      this.left[k] -= dt;
      if (this.left[k] <= 0) this.remove(k);
    }
  }

  clear() {
    this.n = 0;
  }

  private remove(k: number) {
    for (let j = k; j + 1 < this.n; j++) {
      this.xz[2 * j] = this.xz[2 * j + 2];
      this.xz[2 * j + 1] = this.xz[2 * j + 3];
      this.left[j] = this.left[j + 1];
    }
    this.n--;
  }
}
