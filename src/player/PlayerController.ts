/** Reads input and drives the player's locomotion and facing. */
import * as THREE from 'three';
import type { Game, System } from '../core/Game';
import { clamp, headingFromDir } from '../core/math';
import type { Player } from './Player';

export const PLAYER_SPEEDS = {
  walk: 1.9,
  run: 4.4,
  sprint: 7.0,
  sneak: 1.5,
  jump: 5.6,
  turnRate: 12, // rad/s for the body to face the move direction in third person
};

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

  constructor(
    private readonly game: Game,
    private readonly player: Player,
  ) {}

  update(dt: number) {
    const { input } = this.game;
    const p = this.player;
    const look = input.consumeLook(dt);
    p.yaw += look.yaw;
    p.pitch = clamp(p.pitch + look.pitch, -1.45, 1.35);
    if (input.pressed('jump') && this.canJump()) this.jumpQueued = true;
    if (input.pressed('walkToggle')) p.walkMode = !p.walkMode;
    if (input.pressed('sneak')) p.sneaking = !p.sneaking;
  }

  fixedUpdate(dt: number) {
    const { input } = this.game;
    const p = this.player;
    const axes = input.moveAxes();
    p.lookForward(fwd);
    right.set(-fwd.z, 0, fwd.x); // camera right
    wish.set(0, 0, 0).addScaledVector(right, axes.x).addScaledVector(fwd, -axes.z);
    const moving = wish.lengthSq() > 1e-6;
    if (moving) wish.normalize();

    const wantsSprint = input.down('sprint') && moving && axes.z <= 0 && !p.sneaking;
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
}
