/** Reads input and drives the player's locomotion and facing. */
import * as THREE from 'three';
import type { Game, System } from '../core/Game';
import { approachAngle, clamp, headingFromDir, wrapAngle } from '../core/math';
import type { Player } from './Player';

export const PLAYER_SPEEDS = {
  walk: 1.9,
  run: 4.4,
  sprint: 7.0,
  sneak: 1.5,
  jump: 5.6,
  turnRate: 12, // rad/s for the body to face the move direction in third person
};

/**
 * Third-person auto-recenter (GDD §4.3, Trackpad and Keyboard presets): the camera yaw eases
 * toward "behind the character" at up to `maxRate` rad/s, slowing near alignment. Pure.
 */
export function recenterYaw(yaw: number, heading: number, dt: number, maxRate = 1): number {
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
  /** Sprint key: held (Mouse preset) or a toggle that lasts until you stop (Trackpad, Keyboard). */
  sprintMode: 'hold' | 'toggle' = 'hold';
  /** Sneak key: a toggle (default) or held. */
  sneakMode: 'toggle' | 'hold' = 'toggle';
  /** Seconds without look input while moving before the camera swings behind you; 0 = off. */
  autoRecenterDelay = 0;
  private sprintLatched = false;
  private noLookTime = 0;

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
    this.noLookTime = input.lookActive ? 0 : this.noLookTime + dt;
    this.autoRecenter(dt);
    if (input.pressed('jump')) this.jumpQueued = true;
    if (input.pressed('walkToggle')) p.walkMode = !p.walkMode;
    if (this.sneakMode === 'hold') p.sneaking = input.down('sneak');
    else if (input.pressed('sneak')) p.sneaking = !p.sneaking;
    if (this.sprintMode === 'toggle' && input.pressed('sprint')) this.sprintLatched = !this.sprintLatched;
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

    // A toggled sprint ends when you stop or start sneaking.
    if (!moving || p.sneaking || !input.enabled) this.sprintLatched = false;
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

    p.locomote(wish, dt, { jump: this.jumpQueued ? PLAYER_SPEEDS.jump : 0 });
    this.jumpQueued = false;
  }

  /** Swing the third-person camera behind a moving character after a pause in look input. */
  private autoRecenter(dt: number) {
    const p = this.player;
    if (this.autoRecenterDelay <= 0 || p.viewMode !== 'third' || p.combatStance) return;
    if (this.noLookTime < this.autoRecenterDelay) return;
    const axes = this.game.input.moveAxes();
    // Only while heading forward: strafing or backing up would chase its own tail.
    if (axes.z >= 0) return;
    if (Math.hypot(p.velocity.x, p.velocity.z) < 0.5) return;
    p.yaw = recenterYaw(p.yaw, p.heading, dt);
  }
}
