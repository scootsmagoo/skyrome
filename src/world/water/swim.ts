/**
 * Swimming in the Tiber (GDD §5.4 / §6.6: swim 1.4 m/s, 2.2 sprinting; the Tiber Swimmer perk
 * resists the current; "the current is too strong to swim" across in v0.1).
 *
 * A self-contained System that runs just BEFORE the PlayerController (priority -11): in water
 * deeper than about chest height it floats the player at the surface (head above water), makes the
 * stroke slow and sluggish, drifts them downstream with the current and, unless the river is
 * `crossable`, pushes them back toward their own bank in mid-channel, so the far bank is reached
 * only over a bridge. It hooks the controller through its composable `speedMultiplier`, and sets
 * `player.swimming` (combat should refuse attacks while it is true) plus a `player:swim` event.
 */
import type { Game, System } from '../../core/Game';
import { damp } from '../../core/math';
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
};

const GRAVITY = -20; // must match Actor.ts
const AIR_ACCEL = 2.5; // Actor.locomote's airborne acceleration

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

export class SwimSystem implements System {
  readonly name = 'swim';
  readonly priority = -11;
  readonly tuning: SwimTuning = { ...SWIM_DEFAULTS };
  private hooked: PlayerController | null = null;
  private t = 0;
  private readonly cur = { x: 0, z: 0 };

  constructor(
    private readonly game: Game,
    private readonly hitAt: (x: number, z: number) => BodyHit | null,
  ) {}

  private hook() {
    const pc = this.game.getSystem<PlayerController>('playerController');
    if (!pc || pc === this.hooked) return;
    this.hooked = pc;
    const prev = pc.speedMultiplier;
    pc.speedMultiplier = () => {
      const p = this.game.player;
      if (!p?.swimming) return prev();
      const base = p.walkMode ? PLAYER_SPEEDS.walk : p.sneaking ? PLAYER_SPEEDS.sneak : PLAYER_SPEEDS.run;
      const target = this.game.input.down('sprint') ? this.tuning.swimSprint : this.tuning.swimSpeed;
      return Math.min(1, target / base) * prev();
    };
  }

  private setSwimming(on: boolean) {
    const p = this.game.player;
    if (!!p.swimming === on) return;
    p.swimming = on;
    this.game.events.emit('player:swim', { swimming: on });
  }

  fixedUpdate(dt: number) {
    const p = this.game.player;
    if (!p) return;
    this.hook();
    this.t += dt;
    const pos = p.position;
    const hit = this.hitAt(pos.x, pos.z);
    if (!hit) {
      this.setSwimming(false);
      return;
    }
    const level = hit.body.level;
    const ground = this.game.terrain ? this.game.terrain.heightAt(pos.x, pos.z) : -Infinity;
    const depth = level - ground;
    const tn = this.tuning;
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
}
