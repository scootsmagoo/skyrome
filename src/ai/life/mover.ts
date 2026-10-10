/**
 * Mover: per-agent path following with the stuck ladder (AC-22: nobody stuck > 3 s).
 *
 *   mover.setGoal(x, z, speed);
 *   each fixed step:  const ev = mover.update(dt, agent.x, agent.z, nav, desired);
 *                     then steer `desired` with neighbours and hand it to the character controller.
 *
 * Events: 'arrived' (goal reached), 'failed' (no path), 'blocked' (gave up after ~1.75 s without
 * progress — pick another goal), 'stuck' (2.5 s: the owner must unstick the agent now, e.g. snap
 * it to the next free cell out of view or drop the goal). Pure: no three.js, no physics.
 */
import type { NavService } from './nav';
import { hyp, seek, stuckAction, StuckMonitor, type Vec2 } from './steering';

export type MoverEvent = 'none' | 'arrived' | 'failed' | 'blocked' | 'stuck';

export class Mover {
  active = false;
  goalX = 0;
  goalZ = 0;
  speed = 1.3;
  /** Distance at which the goal counts as reached. */
  arrive = 0.6;
  path: Vec2[] = [];
  idx = 0;
  readonly stuck = new StuckMonitor();
  /** Lateral nudge while side-stepping (s left, direction ±1). */
  private sidestepT = 0;
  private sidestepDir = 1;
  private replanned = false;
  private needPath = false;
  private lastX = 0;
  private lastZ = 0;
  /** Seconds spent waiting for a path search slot. */
  private waitT = 0;

  setGoal(x: number, z: number, speed: number, arrive = 0.6) {
    this.active = true;
    this.goalX = x;
    this.goalZ = z;
    this.speed = speed;
    this.arrive = arrive;
    this.path = [];
    this.idx = 0;
    this.needPath = true;
    this.replanned = false;
    this.sidestepT = 0;
    this.waitT = 0;
    this.stuck.reset(this.lastX, this.lastZ);
  }

  /** Plan again from where the agent stands (a wall the grid did not know about was found): the next update searches. */
  replan() {
    if (!this.active) return;
    this.needPath = true;
    this.path = [];
    this.idx = 0;
  }

  clear() {
    this.active = false;
    this.path = [];
    this.idx = 0;
    this.needPath = false;
  }

  /** Remaining straight-line distance to the goal from the last update. */
  get remaining() {
    return hyp(this.goalX - this.lastX, this.goalZ - this.lastZ);
  }

  /** The point being walked to right now. */
  corner(): Vec2 | null {
    return this.path[this.idx] ?? null;
  }

  update(dt: number, x: number, z: number, nav: NavService, out: Vec2): MoverEvent {
    this.lastX = x;
    this.lastZ = z;
    out.x = out.z = 0;
    if (!this.active) {
      this.stuck.reset(x, z);
      return 'none';
    }
    if (hyp(this.goalX - x, this.goalZ - z) <= this.arrive) {
      this.clear();
      return 'arrived';
    }
    if (this.needPath) {
      const p = nav.findPath(x, z, this.goalX, this.goalZ);
      if (p === 'busy') {
        // Wait for a search slot, edging toward the goal meanwhile.
        this.waitT += dt;
        seek(x, z, this.goalX, this.goalZ, this.speed * 0.4, 0, out);
        return 'none';
      }
      this.needPath = false;
      if (!p || !p.length) {
        this.clear();
        return 'failed';
      }
      this.path = p;
      this.idx = 0;
    }

    // Advance along corners; a pushed-aside walker skips corners it has already passed.
    let c = this.path[this.idx];
    while (c && this.idx < this.path.length - 1) {
      const d = hyp(c.x - x, c.z - z);
      if (d > 0.7) {
        // Passed it? (the next corner is closer than this one and roughly ahead)
        const n = this.path[this.idx + 1];
        const dn = hyp(n.x - x, n.z - z);
        const seg = hyp(n.x - c.x, n.z - c.z);
        if (dn >= seg) break;
        if (nav.grid && nav.grid.ready(x, z) && !nav.grid.lineWalkable(x, z, n.x, n.z)) break;
      }
      this.idx++;
      c = this.path[this.idx];
    }
    if (!c) {
      this.clear();
      return 'arrived';
    }
    const last = this.idx === this.path.length - 1;
    seek(x, z, c.x, c.z, this.speed, last ? Math.max(1.2, this.arrive * 2) : 0, out);

    // Stuck ladder.
    const t = this.stuck.update(dt, x, z, true, this.speed);
    const act = stuckAction(t);
    if (act === 'unstick') {
      return 'stuck';
    }
    if (act === 'newGoal') {
      return 'blocked';
    }
    if (act === 'replan' && !this.replanned) {
      this.replanned = true;
      this.needPath = true;
    }
    if (act === 'sidestep' && this.sidestepT <= 0) {
      this.sidestepT = 0.45;
      this.sidestepDir = -this.sidestepDir;
    }
    if (this.sidestepT > 0) {
      this.sidestepT -= dt;
      const s = hyp(out.x, out.z) || 1;
      // Right of (x, z) is (-z, x).
      const lx = (-out.z / s) * this.sidestepDir;
      const lz = (out.x / s) * this.sidestepDir;
      out.x = out.x * 0.35 + lx * this.speed * 0.9;
      out.z = out.z * 0.35 + lz * this.speed * 0.9;
    }
    return 'none';
  }
}
