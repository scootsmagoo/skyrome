/**
 * Secondary motion: loose parts (head, forearms, hands, carried kit) that lag behind the body, and
 * the springy body response to a blow.
 *
 * Everything is a closed-form spring (exact for any step, so throttled updates and 120 Hz frames
 * behave alike). The loose parts follow a target angle derived from the body's acceleration in its
 * own frame (a part hanging off an accelerating body trails it), critically damped, plus small
 * velocity kicks on each footfall. The hit response is underdamped so a blow rocks the torso and
 * settles. Pure math on plain numbers: the controller applies the angles to bones and sockets.
 */

/** One angle (degrees) and its velocity (deg/s). */
export interface Spring {
  x: number;
  v: number;
}

/**
 * Advance a spring toward `goal` by dt. `omega` is the natural frequency (rad/s), `zeta` the damping
 * ratio (1 = critically damped: the angle eases to the goal without overshoot).
 */
export function stepSpring(s: Spring, goal: number, omega: number, zeta: number, dt: number) {
  const x0 = s.x - goal;
  const v0 = s.v;
  if (zeta >= 0.999) {
    const e = Math.exp(-omega * dt);
    const j = v0 + omega * x0;
    s.x = goal + e * (x0 + j * dt);
    s.v = e * (v0 - omega * j * dt);
    return;
  }
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  const e = Math.exp(-zeta * omega * dt);
  const c = Math.cos(wd * dt);
  const sn = Math.sin(wd * dt);
  const k = (v0 + zeta * omega * x0) / wd;
  s.x = goal + e * (x0 * c + k * sn);
  s.v = e * (v0 * c - (x0 * wd + (zeta * omega * v0 + zeta * zeta * omega * omega * x0) / wd) * sn);
}

/** Natural frequency (rad/s) of a critically damped spring that closes half the distance in `halflife` s. */
export const omegaFor = (halflife: number) => (2 * Math.LN2) / Math.max(1e-3, halflife);

/** What drives the loose parts, in the character's frame. */
export interface Drive {
  /** Acceleration (m/s²): forward, to the left, up. */
  af: number;
  al: number;
  au: number;
  /** Turn rate (rad/s), + = turning left. */
  turn: number;
}

/** Loose parts, in order (indexes into SecondaryMotion.out). */
export const PART = { head: 0, forearmL: 1, forearmR: 2, handL: 3, handR: 4, kitR: 5, kitL: 6, hang: 7 } as const;
export const PART_COUNT = 8;

/** Per part: degrees of lag per m/s² (pitch, roll) and per rad/s of turn (yaw), and the follow half-life (s). */
interface PartSpec {
  pitch: number;
  roll: number;
  yaw: number;
  half: number;
  /** Degrees/s of pitch kick per unit footfall strength. */
  kick: number;
}
const SPECS: readonly PartSpec[] = [
  // Pitch is about the bone's X axis (+ leans forward; a hanging limb swings back), roll about Z (+ = top to the right).
  /* head     */ { pitch: -0.9, roll: 0.7, yaw: -2.4, half: 0.09, kick: 70 },
  /* forearmL */ { pitch: 1.9, roll: -0.5, yaw: 0, half: 0.07, kick: 60 },
  /* forearmR */ { pitch: 1.9, roll: -0.5, yaw: 0, half: 0.07, kick: 60 },
  /* handL    */ { pitch: 2.6, roll: -1.0, yaw: 0, half: 0.06, kick: 80 },
  /* handR    */ { pitch: 2.6, roll: -1.0, yaw: 0, half: 0.06, kick: 80 },
  /* kitR     */ { pitch: 1.7, roll: -0.8, yaw: -1.2, half: 0.07, kick: 70 },
  /* kitL     */ { pitch: 1.7, roll: -0.8, yaw: -1.2, half: 0.07, kick: 70 },
  /* hang     */ { pitch: 3.0, roll: -1.4, yaw: 0, half: 0.08, kick: 50 },
];

/** Largest lag of any part (deg): keeps a violent start or a teleport from flinging a limb. */
const MAX_LAG = 16;
const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

export class SecondaryMotion {
  /** Pitch (about X), roll (about Z) and yaw (about Y) of every part, degrees. */
  readonly pitch: Spring[] = [];
  readonly roll: Spring[] = [];
  readonly yaw: Spring[] = [];
  /** Hit response of the torso (pitch, roll) and head. */
  readonly hitPitch: Spring = { x: 0, v: 0 };
  readonly hitRoll: Spring = { x: 0, v: 0 };
  readonly hitHead: Spring = { x: 0, v: 0 };
  private readonly omega: number[] = [];

  constructor() {
    for (let i = 0; i < PART_COUNT; i++) {
      this.pitch.push({ x: 0, v: 0 });
      this.roll.push({ x: 0, v: 0 });
      this.yaw.push({ x: 0, v: 0 });
      this.omega.push(omegaFor(SPECS[i].half));
    }
  }

  /** Everything at rest (a teleport, switching on). */
  reset() {
    for (let i = 0; i < PART_COUNT; i++) {
      this.pitch[i].x = this.pitch[i].v = this.roll[i].x = this.roll[i].v = this.yaw[i].x = this.yaw[i].v = 0;
    }
    for (const s of [this.hitPitch, this.hitRoll, this.hitHead]) s.x = s.v = 0;
  }

  /** Largest displacement of any part (deg): below a hair the update can be skipped. */
  get energy(): number {
    let m = 0;
    for (let i = 0; i < PART_COUNT; i++) m = Math.max(m, Math.abs(this.pitch[i].x), Math.abs(this.roll[i].x), Math.abs(this.yaw[i].x), Math.abs(this.pitch[i].v) * 0.05);
    return Math.max(m, Math.abs(this.hitPitch.x), Math.abs(this.hitRoll.x), Math.abs(this.hitHead.x), Math.abs(this.hitPitch.v) * 0.05, Math.abs(this.hitRoll.v) * 0.05);
  }

  /** Advance the loose parts by dt toward the lag the drive asks for, scaled by `amount` (0..1+). */
  step(dt: number, d: Drive, amount: number) {
    for (let i = 0; i < PART_COUNT; i++) {
      const sp = SPECS[i];
      const gp = clamp(sp.pitch * d.af + sp.pitch * 0.25 * d.au, -MAX_LAG, MAX_LAG) * amount;
      const gr = clamp(sp.roll * d.al, -MAX_LAG, MAX_LAG) * amount;
      const gy = clamp(sp.yaw * d.turn, -MAX_LAG, MAX_LAG) * amount;
      stepSpring(this.pitch[i], gp, this.omega[i], 1, dt);
      stepSpring(this.roll[i], gr, this.omega[i], 1, dt);
      stepSpring(this.yaw[i], gy, this.omega[i], 1, dt);
    }
    // The hit response rings down on its own.
    stepSpring(this.hitPitch, 0, HIT_OMEGA, HIT_ZETA, dt);
    stepSpring(this.hitRoll, 0, HIT_OMEGA, HIT_ZETA, dt);
    stepSpring(this.hitHead, 0, HIT_OMEGA * 0.8, HIT_ZETA * 0.9, dt);
  }

  /** A footfall: every part gets a small downward kick (the body jolts as the foot lands). */
  footfall(strength: number, side: 1 | -1) {
    for (let i = 0; i < PART_COUNT; i++) {
      this.pitch[i].v += SPECS[i].kick * strength;
      this.roll[i].v += SPECS[i].kick * 0.25 * strength * side * (i === PART.head ? 1 : -1);
    }
  }

  /**
   * A blow: `lf` forward and `ll` leftward components of the direction it travels in the character's
   * frame (unit-ish), `strength` 0..1+. The torso rocks away along the blow (a push from the front
   * leans it back), the head whips further.
   */
  hit(lf: number, ll: number, strength: number) {
    // Forward lean is + about X; a push toward the left rolls the body about -Z (head toward +X).
    this.hitPitch.v += HIT_KICK * strength * lf;
    this.hitRoll.v += -HIT_KICK * strength * ll;
    // The head lags the torso: it whips against the blow first.
    this.hitHead.v += -HIT_KICK * 1.4 * strength * lf;
  }
}

export const HIT_OMEGA = 13;
export const HIT_ZETA = 0.45;
/** Angular velocity (deg/s) a full-strength blow gives the torso. */
export const HIT_KICK = 240;
