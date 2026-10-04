/**
 * Swimming in the Tiber (GDD §5.4 / §6.6: swim 1.4 m/s, 2.2 sprinting; the Tiber Swimmer perk
 * resists the current; "the current is too strong to swim" across in v0.1).
 *
 * A self-contained System that runs just BEFORE the PlayerController (priority -11): in water
 * deeper than about chest height it floats the player at the surface (head above water), makes the
 * stroke slow and sluggish, drifts them downstream with the current and, unless the river is
 * `crossable`, pushes them back toward their own bank in mid-channel, so the far bank is reached
 * only over a bridge. It hooks the controller through its composable hooks (`speedMultiplier`,
 * `canJump`, `motionOverride`), and sets `player.swimming` (combat should refuse attacks while it
 * is true) plus a `player:swim` event.
 *
 * Climbing out: swimming (or wading in a canal) while pushing against a ledge no higher than
 * `mantleReach` above the water — a quay landing, a submerged step, a canal kerb — pulls the player
 * up onto it in about half a second (`player:mantle`). Depth is measured against the physics world
 * (so steps and landings count), not just the terrain.
 */
import * as THREE from 'three';
import type { Game, System } from '../../core/Game';
import { Layer } from '../../core/Physics';
import { damp } from '../../core/math';
import type { Player } from '../../player/Player';
import type { PlayerController } from '../../player/PlayerController';
import { PLAYER_SPEEDS } from '../../player/PlayerController';
import { currentOf, type BodyHit } from './bodies';

declare module '../../player/Player' {
  interface Player {
    /** True while swimming in deep water (no attacks, no jumping). */
    swimming?: boolean;
  }
}

declare module '../../core/Events' {
  interface GameEvents {
    'player:swim': { swimming: boolean };
    /** The player pulled themselves out of the water onto a ledge `height` m above their feet. */
    'player:mantle': { height: number };
  }
}

export interface SwimTuning {
  /** Feet this far below the surface while floating (eyes ~0.25 m above water). */
  floatDepth: number;
  /** Start swimming where the water is deeper than this… */
  enterDepth: number;
  /** …and stop where it is shallower than this (hysteresis). */
  exitDepth: number;
  swimSpeed: number;
  swimSprint: number;
  /** Scale on the river current (the perk lowers it). */
  currentScale: number;
  /** When false, the mid-channel current sweeps swimmers back toward their bank. */
  crossable: boolean;
  /** Strength (m/s) of that push in mid-channel. */
  pushBack: number;
  /** Distance (game m) inside the channel edge where the push starts, and where it is full. */
  pushFrom: number;
  pushFull: number;
  /** Ledges up to this far above the water surface can be climbed onto from the water. */
  mantleReach: number;
  /** Seconds a climb-out takes. */
  mantleTime: number;
}

export const SWIM_DEFAULTS: SwimTuning = {
  floatDepth: 1.38,
  enterDepth: 1.45,
  exitDepth: 1.2,
  swimSpeed: 1.4,
  swimSprint: 2.2,
  currentScale: 1,
  crossable: false,
  pushBack: 2.6,
  pushFrom: 5,
  pushFull: 13,
  mantleReach: 1.35,
  mantleTime: 0.55,
};

const GRAVITY = -20; // must match Actor.ts
const AIR_ACCEL = 2.5; // Actor.locomote's airborne acceleration
/** Probe distances (m, from the capsule axis) ahead of a swimmer looking for a ledge. */
const PROBES = [0.5, 0.75, 1.0];
/** How far past the lip the climber ends up (about a capsule radius plus a margin). */
const OVER = 0.45;
/** Consecutive fixed steps of pushing at a ledge before the climb starts. */
const MANTLE_DWELL = 4;

/** Lateral push (m/s, along the bank direction) at distance `d` from the centerline. Pure. */
export function pushBackSpeed(d: number, half: number, t: SwimTuning): number {
  if (t.crossable) return 0;
  const a = half - t.pushFrom, b = half - t.pushFull;
  if (d >= a) return 0;
  const k = Math.min(1, Math.max(0, (a - d) / Math.max(0.1, a - b)));
  return t.pushBack * k * k * (3 - 2 * k);
}

/** Vertical velocity that, after Actor's gravity step, eases the feet toward `targetY`. Pure. */
export function floatVelocity(feetY: number, targetY: number, dt: number): number {
  const vy = Math.max(-2.5, Math.min(2.5, (targetY - feetY) * 4));
  return vy - GRAVITY * dt;
}

export interface Ledge {
  /** Where the feet end up (game x, z) and the surface height there. */
  x: number;
  z: number;
  top: number;
}

/**
 * Look for a ledge to climb onto ahead of (x, z) along the unit direction (dx, dz). `probe(x, z)`
 * gives the height of the highest walkable surface (or null). The nearest probe that rises at
 * least to `minTop` wins, unless it is higher than `maxTop` (a wall: nothing to climb). Pure.
 */
export function findLedge(probe: (x: number, z: number) => number | null, x: number, z: number, dx: number, dz: number, minTop: number, maxTop: number): Ledge | null {
  for (const d of PROBES) {
    const px = x + dx * d, pz = z + dz * d;
    const h = probe(px, pz);
    if (h === null) continue;
    if (h > maxTop) return null;
    if (h < minTop) continue;
    // Stand a capsule radius past the lip if the surface carries on; else right at it (a step).
    const qx = px + dx * OVER, qz = pz + dz * OVER;
    const h2 = probe(qx, qz);
    if (h2 !== null && Math.abs(h2 - h) < 0.3 && h2 <= maxTop) return { x: qx, z: qz, top: Math.max(h, h2) };
    return { x: px, z: pz, top: h };
  }
  return null;
}

/**
 * Feet position during a climb at progress k (0..1): up first (easing out), then over the lip.
 * Pure; writes into `out`.
 */
export function mantlePose(from: THREE.Vector3Like, to: Ledge, k: number, out: THREE.Vector3): THREE.Vector3 {
  const ku = Math.min(1, k / 0.6);
  const up = 1 - (1 - ku) * (1 - ku);
  const kf = Math.min(1, Math.max(0, (k - 0.35) / 0.65));
  const fw = kf * kf * (3 - 2 * kf);
  return out.set(from.x + (to.x - from.x) * fw, from.y + (to.top + 0.04 - from.y) * up, from.z + (to.z - from.z) * fw);
}

interface Mantle {
  t: number;
  T: number;
  from: THREE.Vector3;
  to: Ledge;
}

const NO_MOTION = { x: 0, z: 0 };
const UP = { x: 0, y: 1, z: 0 };
const fwd = new THREE.Vector3();
const pose = new THREE.Vector3();

export class SwimSystem implements System {
  readonly name = 'swim';
  readonly priority = -11;
  readonly tuning: SwimTuning = { ...SWIM_DEFAULTS };
  private hooked: PlayerController | null = null;
  private t = 0;
  private readonly cur = { x: 0, z: 0 };
  private mantle: Mantle | null = null;
  private ledgeSteps = 0;

  constructor(
    private readonly game: Game,
    private readonly hitAt: (x: number, z: number) => BodyHit | null,
  ) {}

  /** True while climbing out of the water. */
  get climbing(): boolean {
    return this.mantle !== null;
  }

  private hook() {
    const pc = this.game.getSystem<PlayerController>('playerController');
    if (!pc || pc === this.hooked) return;
    this.hooked = pc;
    const prevSpeed = pc.speedMultiplier;
    pc.speedMultiplier = () => {
      const p = this.game.player;
      if (!p?.swimming) return prevSpeed();
      const base = p.walkMode ? PLAYER_SPEEDS.walk : p.sneaking ? PLAYER_SPEEDS.sneak : PLAYER_SPEEDS.run;
      const target = this.game.input.down('sprint') ? this.tuning.swimSprint : this.tuning.swimSpeed;
      return Math.min(1, target / base) * prevSpeed();
    };
    // No jumping (nor, in combat, dodging) while afloat or climbing out.
    const prevJump = pc.canJump;
    pc.canJump = () => !this.game.player?.swimming && !this.mantle && prevJump();
    // The climb drives the body itself.
    const prevMotion = pc.motionOverride;
    pc.motionOverride = (dt) => (this.mantle ? NO_MOTION : prevMotion(dt));
  }

  private setSwimming(on: boolean) {
    const p = this.game.player;
    if (!!p.swimming === on) return;
    p.swimming = on;
    this.game.events.emit('player:swim', { swimming: on });
  }

  /** Height of the walkable surface under (x, z) below `fromY`: steps and landings included. */
  private groundAt(x: number, z: number, fromY: number): number {
    const g = this.game.physics.groundHeight(x, z, fromY, 40);
    if (g !== null) return g;
    return this.game.terrain ? this.game.terrain.heightAt(x, z) : -Infinity;
  }

  fixedUpdate(dt: number) {
    const p = this.game.player;
    if (!p) return;
    this.hook();
    this.t += dt;
    if (this.mantle) {
      this.stepMantle(p, dt);
      return;
    }
    const pos = p.position;
    const hit = this.hitAt(pos.x, pos.z);
    if (!hit) {
      this.setSwimming(false);
      this.ledgeSteps = 0;
      return;
    }
    const level = hit.body.level;
    const tn = this.tuning;
    // Climb out onto a landing, a step or a kerb (swimming, or wading deep as in a canal).
    if (p.canMove && (p.swimming || pos.y < level - 0.35) && this.tryMantle(p, level)) return;
    const depth = level - this.groundAt(pos.x, pos.z, level + 0.4);
    if (!p.swimming) {
      if (depth > tn.enterDepth && pos.y < level - tn.floatDepth + 0.3) this.setSwimming(true);
      else return;
    } else if (depth < tn.exitDepth || pos.y > level + 0.3) {
      this.setSwimming(false);
      return;
    }
    // Float at the surface with a slight bob.
    const target = level - tn.floatDepth + Math.sin(this.t * 2.1) * 0.03;
    p.grounded = false;
    p.sprinting = false;
    p.velocity.y = floatVelocity(pos.y, target, dt);
    // Current and (unless crossable) the push back toward the swimmer's own bank.
    const c = currentOf(hit, this.cur);
    const f = hit.foot;
    const push = pushBackSpeed(f.d, hit.half, tn);
    const bx = f.side * f.tz, bz = f.side * -f.tx;
    const ax = c.x * tn.currentScale + bx * push, az = c.z * tn.currentScale + bz * push;
    const k = damp(AIR_ACCEL, dt);
    const g = k / Math.max(1e-4, 1 - k);
    p.velocity.x += ax * g;
    p.velocity.z += az * g;
  }

  /** Start a climb if the player pushes at a reachable ledge (for a few steps running). */
  private tryMantle(p: Player, level: number): boolean {
    const axes = this.game.input.moveAxes();
    if (Math.abs(axes.x) + Math.abs(axes.z) < 0.3 || Math.hypot(p.velocity.x, p.velocity.z) > 1.6) {
      this.ledgeSteps = 0;
      return false;
    }
    // The controller's wish direction: camera right * x + camera forward * -z.
    p.lookForward(fwd);
    let dx = -fwd.z * axes.x - fwd.x * axes.z;
    let dz = fwd.x * axes.x - fwd.z * axes.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    const pos = p.position;
    const tn = this.tuning;
    const maxTop = level + tn.mantleReach;
    const physics = this.game.physics;
    const probe = (x: number, z: number) => physics.groundHeight(x, z, maxTop + 0.6, maxTop + 0.6 - (pos.y - 3));
    // Afloat, anything above the feet blocks the stroke; wading, the controller steps up 0.45 m itself.
    const minTop = pos.y + (p.swimming ? 0.12 : 0.45);
    const ledge = findLedge(probe, pos.x, pos.z, dx, dz, minTop, maxTop);
    if (!ledge) {
      this.ledgeSteps = 0;
      return false;
    }
    if (++this.ledgeSteps < MANTLE_DWELL) return false;
    // Room to stand up there?
    if (physics.raycast({ x: ledge.x, y: ledge.top + 0.05, z: ledge.z }, UP, 1.75, Layer.World)) return false;
    this.ledgeSteps = 0;
    const rise = ledge.top - pos.y;
    this.mantle = { t: 0, T: tn.mantleTime * (0.6 + 0.4 * Math.min(1, rise / 1.6)), from: pos.clone(), to: ledge };
    this.setSwimming(false);
    p.heading = Math.atan2(dx, dz);
    this.game.events.emit('player:mantle', { height: rise });
    return true;
  }

  private stepMantle(p: Player, dt: number) {
    const m = this.mantle!;
    m.t += dt;
    const k = Math.min(1, m.t / m.T);
    mantlePose(m.from, m.to, k, pose);
    // Move the kinematic body along the path; the controller adds only a sliver of gravity.
    const b = p.body;
    const c = { x: pose.x, y: pose.y + b.halfHeight + b.radius, z: pose.z };
    b.body.setTranslation(c, true);
    b.body.setNextKinematicTranslation(c);
    p.currPos.copy(pose);
    p.velocity.set(0, 0, 0);
    p.grounded = false;
    p.sprinting = false;
    if (k >= 1) this.mantle = null;
  }
}
