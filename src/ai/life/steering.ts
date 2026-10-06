/**
 * Local steering for walking crowds (GDD §14.7b): seek/arrive toward the next path corner, keep
 * personal space (separation), predict and sidestep collisions with other walkers (a light RVO:
 * time-to-closest-approach with a right-hand bias), and give the player a wide berth.
 *
 * Pure math on plain {x, z} records so it runs in tests without three.js or physics.
 * Velocities are m/s in the xz plane.
 */

export interface Vec2 {
  x: number;
  z: number;
}

/**
 * Length of (x, z). Math.hypot is a builtin call that boxes its double arguments (garbage on every
 * call in the per-NPC per-step paths); this small function is inlined and allocation-free.
 */
export function hyp(x: number, z: number): number {
  return Math.sqrt(x * x + z * z);
}

export interface SteerAgent {
  x: number;
  z: number;
  /** Current velocity. */
  vx: number;
  vz: number;
  /** Body radius (m). */
  radius: number;
  maxSpeed: number;
  /**
   * A number of its own (e.g. a hash of its id): people standing exactly on top of each other
   * split in different directions instead of all being pushed the same way.
   */
  seed?: number;
}

/** The separation push never exceeds this (m/s): a crowd squeezes people apart, it doesn't fling them. */
export const MAX_SEPARATION_SPEED = 3;

export interface SteerNeighbor {
  x: number;
  z: number;
  vx: number;
  vz: number;
  radius: number;
  /**
   * How strongly to keep away (1 = another walker). The player uses ~2.5 so crowds part around
   * them; a cart or a procession leader even more.
   */
  weight: number;
}

export interface SteerParams {
  /** Extra clearance kept around neighbours (m). */
  personalSpace: number;
  /** Strength of the separation push (m/s at contact). */
  separation: number;
  /** Strength of predictive avoidance (m/s). */
  avoidance: number;
  /** Look-ahead for predictive avoidance (s). */
  horizon: number;
  /** Neighbours farther than this are ignored (m). */
  range: number;
}

export const DEFAULT_STEER: SteerParams = {
  personalSpace: 0.35,
  separation: 1.6,
  avoidance: 1.1,
  horizon: 1.6,
  range: 5,
};

/** Desired velocity toward a target, slowing inside `arrive` metres (0 = no slowdown). */
export function seek(ax: number, az: number, tx: number, tz: number, speed: number, arrive: number, out: Vec2): Vec2 {
  const dx = tx - ax;
  const dz = tz - az;
  const d = hyp(dx, dz);
  if (d < 1e-4) {
    out.x = out.z = 0;
    return out;
  }
  const s = arrive > 0 && d < arrive ? speed * Math.max(0.25, d / arrive) : speed;
  out.x = (dx / d) * s;
  out.z = (dz / d) * s;
  return out;
}

/** Push away from neighbours that are inside personal space (quadratic falloff). */
export function separation(a: SteerAgent, ns: readonly SteerNeighbor[], p: SteerParams, out: Vec2): Vec2 {
  out.x = out.z = 0;
  for (const n of ns) {
    const dx = a.x - n.x;
    const dz = a.z - n.z;
    const reach = a.radius + n.radius + p.personalSpace * n.weight;
    const d2 = dx * dx + dz * dz;
    if (d2 >= reach * reach) continue;
    const d = Math.sqrt(d2);
    const k = (1 - d / reach) ** 2 * p.separation * n.weight;
    if (d < 1e-3) {
      // Exactly on top of each other: split by a direction of the agent's own (its seed), so a
      // stack of people fans out; the position alone would push the whole stack the same way.
      const ang = ((a.seed ?? 0) * 2.39996 + a.x * 12.9898 + a.z * 78.233) % (Math.PI * 2);
      out.x += Math.cos(ang) * k;
      out.z += Math.sin(ang) * k;
    } else {
      out.x += (dx / d) * k;
      out.z += (dz / d) * k;
    }
  }
  const m = hyp(out.x, out.z);
  if (m > MAX_SEPARATION_SPEED) {
    out.x *= MAX_SEPARATION_SPEED / m;
    out.z *= MAX_SEPARATION_SPEED / m;
  }
  return out;
}

/**
 * Predictive avoidance: for each neighbour, find the time of closest approach given our desired
 * velocity and its current one; if we would pass closer than the sum of radii (+ space), push
 * sideways away from that closest point, sooner = stronger. Head-on cases get a right-hand bias
 * (keep right, as walkers tend to) so two agents don't mirror each other forever.
 */
export function avoidance(a: SteerAgent, desired: Vec2, ns: readonly SteerNeighbor[], p: SteerParams, out: Vec2): Vec2 {
  out.x = out.z = 0;
  const sp = hyp(desired.x, desired.z);
  if (sp < 0.05) return out;
  for (const n of ns) {
    const px = n.x - a.x;
    const pz = n.z - a.z;
    const rvx = n.vx - desired.x;
    const rvz = n.vz - desired.z;
    const rv2 = rvx * rvx + rvz * rvz;
    if (rv2 < 1e-6) continue;
    const t = -(px * rvx + pz * rvz) / rv2;
    if (t <= 0 || t > p.horizon) continue;
    const cx = px + rvx * t;
    const cz = pz + rvz * t;
    const dist = hyp(cx, cz);
    const rsum = a.radius + n.radius + p.personalSpace * Math.min(2, n.weight);
    if (dist >= rsum) continue;
    const urgency = (1 - t / p.horizon) * (1 - dist / rsum) * p.avoidance * n.weight;
    let sx: number;
    let sz: number;
    if (dist < 0.05) {
      // Dead ahead: step to our right. Forward (x, z) has its right at (-z, x) (Actor convention).
      sx = -desired.z / sp;
      sz = desired.x / sp;
    } else {
      sx = -cx / dist;
      sz = -cz / dist;
    }
    out.x += sx * urgency;
    out.z += sz * urgency;
  }
  return out;
}

const tmpA: Vec2 = { x: 0, z: 0 };
const tmpB: Vec2 = { x: 0, z: 0 };

/**
 * Combine the desired (path-following) velocity with separation and avoidance and clamp to the
 * agent's max speed. Returns the wish velocity to hand to the character controller.
 */
export function steer(a: SteerAgent, desired: Vec2, ns: readonly SteerNeighbor[], p: SteerParams, out: Vec2): Vec2 {
  const sep = separation(a, ns, p, tmpA);
  const avo = avoidance(a, desired, ns, p, tmpB);
  let x = desired.x + sep.x + avo.x;
  let z = desired.z + sep.z + avo.z;
  const s = hyp(x, z);
  const max = Math.max(a.maxSpeed, hyp(sep.x, sep.z));
  if (s > max) {
    x = (x / s) * max;
    z = (z / s) * max;
  }
  // Don't let avoidance turn a walker fully around: keep some forward progress if it wanted to move.
  const ds = hyp(desired.x, desired.z);
  if (ds > 0.1) {
    const fwd = (x * desired.x + z * desired.z) / ds;
    if (fwd < -0.2 * ds && hyp(sep.x, sep.z) < 0.5) {
      x -= (desired.x / ds) * (fwd + 0.2 * ds);
      z -= (desired.z / ds) * (fwd + 0.2 * ds);
    }
  }
  out.x = x;
  out.z = z;
  return out;
}

// ---------------------------------------------------------------- stuck detection

/**
 * Watches an agent that wants to move and reports for how long it has made (almost) no progress.
 * Progress is measured over short windows so a slow shuffle around an obstacle still counts.
 * The brain escalates on `stuckTime` (see `stuckAction`), which guarantees nobody stays stuck
 * longer than about 2.5–3 s (AC-22).
 */
export class StuckMonitor {
  /** Seconds without meaningful progress while wanting to move. */
  stuckTime = 0;
  /** Seconds per measuring window. */
  window = 0.5;
  private t = 0;
  private ax = 0;
  private az = 0;
  private wanted = false;

  reset(x: number, z: number) {
    this.stuckTime = 0;
    this.t = 0;
    this.ax = x;
    this.az = z;
    this.wanted = false;
  }

  /**
   * @param wantsMove the agent is trying to get somewhere (not idling or waiting on purpose)
   * @param speed the speed it is asking for (m/s)
   */
  update(dt: number, x: number, z: number, wantsMove: boolean, speed: number): number {
    if (!wantsMove) {
      this.reset(x, z);
      return 0;
    }
    if (!this.wanted) {
      this.wanted = true;
      this.t = 0;
      this.ax = x;
      this.az = z;
    }
    this.t += dt;
    if (this.t >= this.window) {
      const moved = hyp(x - this.ax, z - this.az);
      // Expect at least a fifth of the requested speed (crowds slow people a lot), min 12 cm.
      const need = Math.max(0.12, speed * this.window * 0.2);
      if (moved < need) this.stuckTime += this.t;
      else this.stuckTime = 0;
      this.t = 0;
      this.ax = x;
      this.az = z;
    }
    return this.stuckTime;
  }
}

export type StuckAction = 'none' | 'sidestep' | 'replan' | 'newGoal' | 'unstick';

/** Escalation ladder for a stuck agent. Thresholds in seconds of no progress. */
export const STUCK_LADDER: readonly [number, StuckAction][] = [
  [2.5, 'unstick'], // teleport to a free cell on the way (out of view) or give up the goal on the spot
  [1.75, 'newGoal'],
  [1.0, 'replan'],
  [0.5, 'sidestep'],
];

export function stuckAction(stuckTime: number): StuckAction {
  for (const [t, a] of STUCK_LADDER) if (stuckTime >= t) return a;
  return 'none';
}
