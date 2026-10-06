/** Reads input and drives the player's locomotion and facing. */
import * as THREE from 'three';
import type { Game, System } from '../core/Game';
import { approachAngle, clamp, headingFromDir, wrapAngle } from '../core/math';
import type { Player } from './Player';

export const PLAYER_SPEEDS = {
  walk: 1.9,
  run: 4.4,
  sprint: 7.4,
  sneak: 1.5,
  jump: 5.6,
  turnRate: 12, // rad/s for the body to face the move direction in third person
};

/** Fastest auto-recenter swing (rad/s): slow enough to read as the camera settling, not turning. */
export const RECENTER_MAX_RATE = 0.5;

/**
 * Third-person auto-recenter (GDD §4.3, Trackpad and Keyboard presets): the camera yaw eases
 * toward "behind the character" at up to `maxRate` rad/s, slowing near alignment. Pure.
 */
export function recenterYaw(yaw: number, heading: number, dt: number, maxRate = RECENTER_MAX_RATE): number {
  const target = heading + Math.PI;
  const d = Math.abs(wrapAngle(target - yaw));
  const rate = Math.min(maxRate, d * 1.5);
  return approachAngle(yaw, target, rate * dt);
}

const wish = new THREE.Vector3();
const fwd = new THREE.Vector3();
const right = new THREE.Vector3();

export class PlayerController implements System {
  readonly name = 'playerController';
  readonly priority = -10;
  private jumpQueued = false;
  /** Optional hook for stamina etc.: return false to deny sprinting this step. */
  canSprint: () => boolean = () => true;
  /** Optional hook (combat): multiplier on movement speed. */
  speedMultiplier: () => number = () => 1;
  /** Optional hook (combat): false while Space dodges instead of jumping (in combat, weapon drawn). */
  canJump: () => boolean = () => true;
  /**
   * Optional hook (combat): replaces this step's movement wish (m/s, world xz) during dodges,
   * attack steps, staggers and the like; `accel` overrides the ground acceleration. null = normal.
   */
  motionOverride: (dt: number) => { x: number; z: number; accel?: number } | null = () => null;
  /** Sprint key: held (Mouse preset) or a toggle that lasts until you stop (Trackpad, Keyboard). */
  sprintMode: 'hold' | 'toggle' = 'hold';
  /** Sneak key: a toggle (default) or held. */
  sneakMode: 'toggle' | 'hold' = 'toggle';
  /** Seconds of moving without look input before the camera swings behind you; 0 = off. */
  autoRecenterDelay = 0;
  private sprintLatched = false;
  private stillTime = 0;
  /** Seconds the player has been moving without touching the camera (resets on stop or look). */
  private moveTime = 0;
  /**
   * The camera yaw the move keys are read against while the auto-recenter swings the camera.
   * Movement is camera-relative, so without this latch a diagonal (W+D) would chase the turning
   * camera and run in a circle; latched, the path stays straight while the camera settles behind
   * it. Cleared (null = follow the camera) when the keys change, the player stops or looks.
   */
  private inputYaw: number | null = null;
  private inputKeys = 0;
  /** p.yaw as this controller left it: anything else turning the camera (a lock-on, a teleport) drops the latch. */
  private yawAfter = NaN;

  constructor(
    private readonly game: Game,
    private readonly player: Player,
  ) {}

  update(dt: number) {
    const { input } = this.game;
    const p = this.player;
    if (p.yaw !== this.yawAfter) this.inputYaw = null;
    const look = input.consumeLook(dt);
    p.yaw += look.yaw;
    p.pitch = clamp(p.pitch + look.pitch, -1.45, 1.35);
    const axes = input.moveAxes();
    const moving = axes.x !== 0 || axes.z !== 0;
    const keys = (axes.x + 1) * 3 + (axes.z + 1);
    if (input.lookActive || !moving || keys !== this.inputKeys) this.inputYaw = null;
    this.inputKeys = keys;
    this.moveTime = input.lookActive || !moving ? 0 : this.moveTime + dt;
    this.autoRecenter(dt, axes);
    this.yawAfter = p.yaw;
    if (input.pressed('jump') && this.canJump()) this.jumpQueued = true;
    if (input.pressed('walkToggle')) p.walkMode = !p.walkMode;
    if (this.sneakMode === 'hold') p.sneaking = input.down('sneak');
    else if (input.pressed('sneak')) p.sneaking = !p.sneaking;
    if (this.sprintMode === 'toggle' && input.pressed('sprint')) this.sprintLatched = !this.sprintLatched;
  }

  fixedUpdate(dt: number) {
    const { input } = this.game;
    const p = this.player;
    const axes = input.moveAxes();
    if (p.noclip) return this.fly(dt, axes);
    const yaw = this.inputYaw ?? p.yaw;
    fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw)); // camera forward (or the latched one)
    right.set(-fwd.z, 0, fwd.x); // camera right
    wish.set(0, 0, 0).addScaledVector(right, axes.x).addScaledVector(fwd, -axes.z);
    const moving = wish.lengthSq() > 1e-6;
    if (moving) wish.normalize();

    // A toggled sprint ends when you stop (for a moment: pressing Shift just before W still
    // counts) or start sneaking.
    this.stillTime = moving ? 0 : this.stillTime + dt;
    if (this.stillTime > 0.3 || p.sneaking || !input.enabled) this.sprintLatched = false;
    const sprintKey = this.sprintMode === 'toggle' ? this.sprintLatched : input.down('sprint');
    const wantsSprint = sprintKey && moving && axes.z <= 0 && !p.sneaking;
    p.sprinting = wantsSprint && p.grounded && this.canSprint();
    let speed = p.sneaking ? PLAYER_SPEEDS.sneak : p.walkMode ? PLAYER_SPEEDS.walk : PLAYER_SPEEDS.run;
    if (p.sprinting) speed = PLAYER_SPEEDS.sprint;
    speed *= this.speedMultiplier();
    wish.multiplyScalar(speed);

    // Facing: first person or combat stance → face the camera; otherwise turn toward movement.
    const camHeading = p.yaw + Math.PI;
    if (p.viewMode === 'first' || p.combatStance) {
      p.heading = camHeading;
    } else if (moving) {
      p.turnToward(headingFromDir(wish.x, wish.z), PLAYER_SPEEDS.turnRate, dt);
    }

    const override = this.motionOverride(dt);
    if (override) {
      wish.set(override.x, 0, override.z);
      this.jumpQueued = false;
    }
    p.locomote(wish, dt, { jump: this.jumpQueued ? PLAYER_SPEEDS.jump : 0, accel: override?.accel });
    this.jumpQueued = false;
  }

  /**
   * No-clip (the console's `tcl`): fly where the camera looks, through walls and floors. Space
   * rises, the sneak key sinks, sprint goes fast.
   */
  private fly(dt: number, axes: { x: number; z: number }) {
    const { input } = this.game;
    const p = this.player;
    const cp = Math.cos(p.pitch);
    fwd.set(-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp);
    right.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    wish.set(0, 0, 0).addScaledVector(right, axes.x).addScaledVector(fwd, -axes.z);
    wish.y += (input.down('jump') ? 1 : 0) - (input.down('sneak') ? 1 : 0);
    if (wish.lengthSq() > 1e-6) wish.normalize().multiplyScalar(input.down('sprint') ? 24 : 8);
    p.sprinting = false;
    p.heading = p.yaw + Math.PI;
    this.jumpQueued = false;
    p.fly(wish, dt);
  }

  /**
   * Swing the third-person camera behind a character who has been moving for a while without
   * look input (GDD §4.3). Forward and forward-diagonal only: strafing and backing up keep the
   * camera where the player put it. The move keys stay mapped to the yaw the swing started from,
   * so a held W+D keeps running in a straight line while the camera comes round behind it.
   */
  private autoRecenter(dt: number, axes: { x: number; z: number }) {
    const p = this.player;
    if (this.autoRecenterDelay <= 0 || p.viewMode !== 'third' || p.combatStance) {
      this.inputYaw = null;
      return;
    }
    if (this.moveTime < this.autoRecenterDelay || axes.z >= 0) return;
    if (Math.hypot(p.velocity.x, p.velocity.z) < 0.5) return;
    const next = recenterYaw(p.yaw, p.heading, dt);
    if (next === p.yaw) return;
    this.inputYaw ??= p.yaw;
    p.yaw = next;
  }
}
