/**
 * Getting around things (docs/GDD.md §6.13 "approach: path to the target"; AC-22 "no NPC stuck for
 * more than 3 s"). The brain steers in straight lines; a `PathFollower` turns its wish into one that
 * goes around a gate block, a cart, a stall or a wall:
 *
 *   clear     the straight line to the goal is probed (cached 0.25 s); while it is clear the
 *             brain's wish stands
 *   path      blocked, and a path service exists (the NPC crew's NavService): follow its waypoints,
 *             asking again when the goal has moved, every 1.5 s, or after getting stuck
 *   follow    blocked without a path (no service, unreachable, rationed): the clear direction
 *             nearest the goal, keeping to one side until the goal is in the clear again (the
 *             "bug" wall-follower), so a convex obstacle is rounded in one pass
 *   slide     no goal (circling, retreating, fleeing): a blocked wish turns to the nearest clear
 *             direction instead of pushing into the wall
 *   stuck     trying to move but no 0.35 m of progress in 1.5 s: change sides, drop the path and
 *             sidestep for 0.6 s (`onStuck` lets the brain flip its circling too)
 *
 * Pure logic: the world comes in through `NavProbe` (tests use a fake wall).
 */

export interface NavPoint {
  x: number;
  z: number;
}

export interface NavProbe {
  /**
   * Is the straight walk from a to b blocked (for a body of radius r whose feet are at height y)?
   * Only the first `b − a` metres count.
   */
  blocked(ax: number, az: number, bx: number, bz: number, y: number, r: number): boolean;
  /** Waypoints toward b (a excluded); null = unreachable; 'busy' = rationed, ask again later. */
  findPath?(ax: number, az: number, bx: number, bz: number): NavPoint[] | null | 'busy';
}

export interface SteerInput {
  now: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  /** Where the brain is heading (target, last known position), or null (circle, retreat, flee). */
  goal: NavPoint | null;
  /** The brain's wish (m/s, world); adjusted in place. */
  wish: { x: number; z: number };
  /** Free to walk (not striking, staggered, netted or pushed): the stuck clock runs only then. */
  free: boolean;
}

/** Tuning (seconds, metres). */
export const NAV = {
  /** Re-probe the straight line to the goal this often. */
  directEvery: 0.25,
  /** The straight-line probe looks this far ahead at most. */
  directReach: 9,
  /** Whiskers for wall-following and sliding. */
  whisker: 1.4,
  /** Re-pick the wall-following direction this often. */
  followEvery: 0.12,
  /** Ask the path service again this often while blocked. */
  repathEvery: 1.5,
  /** A waypoint is reached within this distance. */
  waypointReach: 0.7,
  /** Closer than this to the goal, nothing is probed: we are there. */
  near: 1.3,
  /** No progress of `progress` metres for `stuckAfter` seconds while trying to move = stuck. */
  progress: 0.35,
  stuckAfter: 1.5,
  sidestep: 0.6,
};

/** Candidate turns for wall-following: 0, ±22.5°, … ±157.5°. */
const STEP = Math.PI / 8;

export class PathFollower {
  /** Times this mover got stuck (tests, AC-22 logs). */
  stuckCount = 0;
  /** Last time it made progress, or wasn't trying to move (combat clock). */
  lastProgressAt = 0;
  /** Called when a stuck spell begins (the brain flips its circling direction). */
  onStuck: (() => void) | null = null;
  /** Current mode, for logs and tests. */
  mode: 'clear' | 'path' | 'follow' | 'slide' | 'stuck' | 'idle' = 'idle';

  private directAt = -Infinity;
  private directBlocked = false;
  private directGoal: NavPoint = { x: NaN, z: NaN };
  private side = 0;
  private followAt = -Infinity;
  private followDir = { x: 0, z: 0 };
  private path: NavPoint[] | null = null;
  private pathIdx = 0;
  private pathGoal: NavPoint = { x: NaN, z: NaN };
  private pathAt = -Infinity;
  private anchor = { x: NaN, z: NaN };
  private sidestepUntil = -Infinity;
  private sidestepDir = { x: 0, z: 0 };
  /** The stuck clock restarts after each sidestep (lastProgressAt only on real progress). */
  private stuckClock = 0;

  constructor(private readonly probe: NavProbe) {}

  /** How long it has been trying to move without progress (0 when fine). */
  stuckFor(now: number): number {
    return Math.max(0, now - this.lastProgressAt);
  }

  /** Forget the route (a new fight, a teleport). */
  reset(now = 0) {
    this.path = null;
    this.side = 0;
    this.directAt = -Infinity;
    this.anchor.x = NaN;
    this.lastProgressAt = now;
    this.stuckClock = now;
    this.sidestepUntil = -Infinity;
    this.mode = 'idle';
  }

  /** Adjust `s.wish` so the mover goes around what is in its way. */
  steer(s: SteerInput) {
    const w = s.wish;
    const speed = Math.hypot(w.x, w.z);
    this.trackProgress(s, speed);
    if (speed < 0.05) {
      this.mode = 'idle';
      return;
    }
    if (s.now < this.sidestepUntil) {
      w.x = this.sidestepDir.x * speed;
      w.z = this.sidestepDir.z * speed;
      this.mode = 'stuck';
      return;
    }
    const g = s.goal;
    // Only a wish that heads for the goal is routed; a step back or a strafe just slides.
    if (g) {
      const gx = g.x - s.x;
      const gz = g.z - s.z;
      const gd = Math.hypot(gx, gz);
      if (gd > NAV.near && (gx * w.x + gz * w.z) / (gd * speed) > 0.3) {
        this.route(s, g, gd, speed);
        return;
      }
    }
    this.slide(s, speed);
  }

  private route(s: SteerInput, g: NavPoint, gd: number, speed: number) {
    const w = s.wish;
    if (!this.directBlockedTo(s, g, gd)) {
      // In the clear: the brain's straight line stands, and any detour is over.
      this.side = 0;
      this.path = null;
      this.mode = 'clear';
      return;
    }
    // Waypoints from the path service, when there is one.
    if (this.probe.findPath) {
      const moved = Math.hypot(g.x - this.pathGoal.x, g.z - this.pathGoal.z);
      if (!this.path || moved > 2 || s.now - this.pathAt > NAV.repathEvery) {
        const p = this.probe.findPath(s.x, s.z, g.x, g.z);
        if (p !== 'busy') {
          this.pathAt = s.now;
          this.pathGoal.x = g.x;
          this.pathGoal.z = g.z;
          this.path = p && p.length ? p : null;
          this.pathIdx = 0;
        }
      }
      const path = this.path;
      if (path) {
        while (this.pathIdx < path.length - 1 && Math.hypot(path[this.pathIdx].x - s.x, path[this.pathIdx].z - s.z) < NAV.waypointReach) this.pathIdx++;
        const wp = path[this.pathIdx];
        const dx = wp.x - s.x;
        const dz = wp.z - s.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.05) {
          w.x = (dx / d) * speed;
          w.z = (dz / d) * speed;
          this.mode = 'path';
          return;
        }
      }
    }
    // No path: follow the wall, keeping to one side.
    if (s.now - this.followAt >= NAV.followEvery) {
      this.followAt = s.now;
      const base = Math.atan2(g.x - s.x, g.z - s.z);
      if (this.side === 0) this.side = this.pickSide(s, base);
      const a = this.clearAngle(s, base, this.side);
      this.followDir.x = Math.sin(a);
      this.followDir.z = Math.cos(a);
    }
    w.x = this.followDir.x * speed;
    w.z = this.followDir.z * speed;
    this.mode = 'follow';
  }

  /** A blocked wish without a goal turns to the nearest clear direction. */
  private slide(s: SteerInput, speed: number) {
    const w = s.wish;
    if (s.now - this.followAt < NAV.followEvery) {
      if (this.mode === 'slide') {
        w.x = this.followDir.x * speed;
        w.z = this.followDir.z * speed;
      }
      return;
    }
    this.followAt = s.now;
    const ux = w.x / speed;
    const uz = w.z / speed;
    if (!this.probe.blocked(s.x, s.z, s.x + ux * NAV.whisker, s.z + uz * NAV.whisker, s.y, s.radius)) {
      this.mode = 'clear';
      return;
    }
    const base = Math.atan2(ux, uz);
    const a = this.clearAngle(s, base, this.side || this.pickSide(s, base));
    this.followDir.x = Math.sin(a);
    this.followDir.z = Math.cos(a);
    w.x = this.followDir.x * speed;
    w.z = this.followDir.z * speed;
    this.mode = 'slide';
  }

  private directBlockedTo(s: SteerInput, g: NavPoint, gd: number): boolean {
    const moved = Math.hypot(g.x - this.directGoal.x, g.z - this.directGoal.z);
    if (s.now - this.directAt < NAV.directEvery && moved < 0.75) return this.directBlocked;
    this.directAt = s.now;
    this.directGoal.x = g.x;
    this.directGoal.z = g.z;
    const reach = Math.min(gd, NAV.directReach);
    const bx = s.x + ((g.x - s.x) / gd) * reach;
    const bz = s.z + ((g.z - s.z) / gd) * reach;
    this.directBlocked = this.probe.blocked(s.x, s.z, bx, bz, s.y, s.radius);
    return this.directBlocked;
  }

  /** The side (+1 left-turning, −1 right-turning) whose first clear direction is nearer the goal. */
  private pickSide(s: SteerInput, base: number): number {
    for (let k = 1; k <= 7; k++) {
      const l = this.clear(s, base + k * STEP);
      const r = this.clear(s, base - k * STEP);
      if (l && !r) return 1;
      if (r && !l) return -1;
      if (l && r) return (Math.round(s.x * 7 + s.z * 13) & 1) === 0 ? 1 : -1;
    }
    return 1;
  }

  /** The first clear direction turning from `base` toward `side` (straight back if nothing is clear). */
  private clearAngle(s: SteerInput, base: number, side: number): number {
    for (let k = 0; k <= 7; k++) {
      const a = base + side * k * STEP;
      if (this.clear(s, a)) return a;
    }
    // Boxed in on that side: try the other, else back out.
    for (let k = 1; k <= 7; k++) {
      const a = base - side * k * STEP;
      if (this.clear(s, a)) return a;
    }
    return base + Math.PI;
  }

  private clear(s: SteerInput, a: number): boolean {
    const L = NAV.whisker + s.radius;
    return !this.probe.blocked(s.x, s.z, s.x + Math.sin(a) * L, s.z + Math.cos(a) * L, s.y, s.radius);
  }

  private trackProgress(s: SteerInput, speed: number) {
    const now = s.now;
    if (!s.free || speed < 0.5) {
      // Not trying to walk (striking, staggered, standing in reach): never "stuck".
      this.anchor.x = s.x;
      this.anchor.z = s.z;
      this.lastProgressAt = now;
      return;
    }
    if (!Number.isFinite(this.anchor.x) || Math.hypot(s.x - this.anchor.x, s.z - this.anchor.z) >= NAV.progress) {
      this.anchor.x = s.x;
      this.anchor.z = s.z;
      this.lastProgressAt = now;
      return;
    }
    if (now - Math.max(this.lastProgressAt, this.stuckClock) < NAV.stuckAfter || now < this.sidestepUntil) return;
    // Stuck: the other side, a fresh path, and a sidestep away from whatever holds us.
    this.stuckCount++;
    this.side = this.side === 0 ? 1 : -this.side;
    this.path = null;
    this.pathAt = -Infinity;
    this.directAt = -Infinity;
    const ux = s.wish.x / speed;
    const uz = s.wish.z / speed;
    // Perpendicular to the wish on the new side, a little backward.
    let dx = -uz * this.side - ux * 0.35;
    let dz = ux * this.side - uz * 0.35;
    const a = Math.atan2(dx, dz);
    if (!this.clear(s, a)) {
      dx = uz * this.side - ux * 0.35;
      dz = -ux * this.side - uz * 0.35;
    }
    const d = Math.hypot(dx, dz) || 1;
    this.sidestepDir.x = dx / d;
    this.sidestepDir.z = dz / d;
    this.sidestepUntil = now + NAV.sidestep;
    this.anchor.x = s.x;
    this.anchor.z = s.z;
    this.stuckClock = now + NAV.sidestep;
    this.onStuck?.();
  }
}
