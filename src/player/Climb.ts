/**
 * Climbing on land (GDD §4.2: Space "jumps or mantles"). Two ways up a ledge:
 *
 * - Clamber: keep pushing into a ledge a little too high to step onto (≈0.42–0.8 m: a basin rim,
 *   a high kerb, a podium step, a cart bed) and after a moment the character pulls up onto it.
 *   Only onto a real surface you can stand on, not along the top of a thin wall.
 * - Mantle: press Space facing a ledge up to 1.6 m high and the character climbs it instead of
 *   jumping (out of combat; with a weapon drawn in a fight Space dodges, as before).
 *
 * Shares the ledge search and the climb path with swimming (findLedge / mantlePose in
 * world/water/swim.ts), never climbs onto steep or roofed surfaces, and checks the headroom both
 * above the ledge and above the climber before starting.
 */
import * as THREE from 'three';
import type { Game, System } from '../core/Game';
import { Layer } from '../core/Physics';
import { findLedge, mantlePose, type Ledge } from '../world/water/swim';
import type { Player } from './Player';
import type { PlayerController } from './PlayerController';

declare module '../core/Events' {
  interface GameEvents {
    'player:climb': { height: number; kind: 'clamber' | 'mantle' };
  }
}

export const CLIMB = {
  /** Rises the step-up already handles stay with it (Physics autostep is 0.45 m). */
  minRise: 0.42,
  /** Highest ledge a clamber (just pushing) goes up. */
  clamberMax: 0.8,
  /** Highest ledge a Space mantle goes up. */
  mantleMax: 1.6,
  /** Fixed steps (60 Hz) of pushing into a ledge before a clamber starts (~0.15 s). */
  dwellSteps: 9,
  /** Seconds a climb of `rise` 1.6 m takes; lower ones are quicker. */
  time: 0.6,
  /** Clear height needed above the ledge to stand there. */
  headroom: 1.75,
  /** Surfaces steeper than this (normal.y below) are walls or roofs, not ledges. */
  minNormalY: 0.7,
};

const UP = { x: 0, y: 1, z: 0 };
const DOWN = { x: 0, y: -1, z: 0 };
const NO_MOTION = { x: 0, z: 0 };
const pose = new THREE.Vector3();
const fwd = new THREE.Vector3();

interface Climb {
  t: number;
  T: number;
  from: THREE.Vector3;
  to: Ledge;
}

export class ClimbSystem implements System {
  readonly name = 'climb';
  /** After swimming (-11), before the PlayerController (-10). */
  readonly priority = -10.5;
  private climb: Climb | null = null;
  private dwell = 0;
  private hooked: PlayerController | null = null;

  constructor(private readonly game: Game) {}

  /** True while a climb is in progress. */
  get climbing(): boolean {
    return this.climb !== null;
  }

  update() {
    const p = this.game.player;
    if (!p || this.climb) return;
    this.hook();
    const input = this.game.input;
    if (!input.pressed('jump') || !this.canStart(p)) return;
    // In a fight with a weapon drawn Space dodges (combat's own rule); leave it alone then.
    const combat = (this.game as Game & { combat?: { canJump?: () => boolean } }).combat;
    if (combat?.canJump && !combat.canJump()) return;
    const dir = this.direction(p, true);
    const ledge = this.findClimbable(p, dir, CLIMB.mantleMax, false);
    if (ledge && dir) this.start(p, ledge, dir, 'mantle');
  }

  fixedUpdate(dt: number) {
    const p = this.game.player;
    if (!p) return;
    this.hook();
    if (this.climb) {
      this.step(p, dt);
      return;
    }
    if (!this.canStart(p)) {
      this.dwell = 0;
      return;
    }
    // Clamber: pushing (move keys held) but going nowhere.
    const axes = this.game.input.moveAxes();
    const moved = Math.hypot(p.position.x - p.prevPos.x, p.position.z - p.prevPos.z) / dt;
    if (Math.abs(axes.x) + Math.abs(axes.z) < 0.3 || moved > 0.6) {
      this.dwell = 0;
      return;
    }
    const dir = this.direction(p, false);
    if (!dir) {
      this.dwell = 0;
      return;
    }
    const ledge = this.findClimbable(p, dir, CLIMB.clamberMax, true);
    if (!ledge) {
      this.dwell = 0;
      return;
    }
    if (++this.dwell >= CLIMB.dwellSteps) this.start(p, ledge, dir, 'clamber');
  }

  private canStart(p: Player): boolean {
    const swim = this.game.getSystem<System & { climbing?: boolean }>('swim');
    return p.canMove && p.grounded && !p.swimming && !swim?.climbing && this.game.input.enabled;
  }

  /** The way the player is trying to go: the move keys against the camera, else the facing. */
  private direction(p: Player, allowFacing: boolean): { x: number; z: number } | null {
    const axes = this.game.input.moveAxes();
    if (Math.abs(axes.x) + Math.abs(axes.z) > 0.3) {
      p.lookForward(fwd);
      const dx = -fwd.z * axes.x - fwd.x * axes.z;
      const dz = fwd.x * axes.x - fwd.z * axes.z;
      const l = Math.hypot(dx, dz) || 1;
      return { x: dx / l, z: dz / l };
    }
    if (!allowFacing) return null;
    return { x: Math.sin(p.heading), z: Math.cos(p.heading) };
  }

  /**
   * A ledge between `minRise` and `maxRise` above the feet along `dir`, walkable, with room to
   * stand on it and room to rise into from here. `platform`: only a surface that carries on past
   * the lip (no walking along the top of a thin wall).
   */
  private findClimbable(p: Player, dir: { x: number; z: number } | null, maxRise: number, platform: boolean): Ledge | null {
    if (!dir) return null;
    const physics = this.game.physics;
    const pos = p.position;
    const maxTop = pos.y + maxRise;
    const from = maxTop + 0.6;
    const probe = (x: number, z: number) => {
      const hit = physics.raycast({ x, y: from, z }, DOWN, from - (pos.y - 3), Layer.World);
      if (!hit) return null;
      // A steep face or a roof pitch is a wall, not a ledge: report it as too high to climb.
      return hit.normal.y < CLIMB.minNormalY ? Infinity : hit.point.y;
    };
    const ledge = findLedge(probe, pos.x, pos.z, dir.x, dir.z, pos.y + CLIMB.minRise, maxTop);
    if (!ledge) return null;
    if (platform) {
      const lip = probe(ledge.x - dir.x * 0.45, ledge.z - dir.z * 0.45);
      const beyond = probe(ledge.x + dir.x * 0.4, ledge.z + dir.z * 0.4);
      if (lip === null || beyond === null || Math.abs(beyond - ledge.top) > 0.3 || Math.abs(lip - ledge.top) > 0.3) return null;
    }
    // Room to stand on the ledge, and to rise from where we are without hitting a ceiling.
    if (physics.raycast({ x: ledge.x, y: ledge.top + 0.05, z: ledge.z }, UP, CLIMB.headroom, Layer.World)) return null;
    const rise = ledge.top - pos.y;
    if (physics.raycast({ x: pos.x, y: pos.y + 1.75, z: pos.z }, UP, rise + 0.15, Layer.World)) return null;
    // Nothing in the way between rising here and arriving there, at chest height on the ledge.
    const cy = ledge.top + 1.0;
    const dx = ledge.x - pos.x, dz = ledge.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.01 && physics.raycast({ x: pos.x, y: cy, z: pos.z }, { x: dx / d, y: 0, z: dz / d }, d, Layer.World)) return null;
    return ledge;
  }

  private start(p: Player, ledge: Ledge, dir: { x: number; z: number }, kind: 'clamber' | 'mantle') {
    const rise = ledge.top - p.position.y;
    this.climb = { t: 0, T: CLIMB.time * (0.55 + 0.45 * Math.min(1, rise / CLIMB.mantleMax)), from: p.position.clone(), to: ledge };
    this.dwell = 0;
    p.heading = Math.atan2(dir.x, dir.z);
    p.sprinting = false;
    this.game.events.emit('player:climb', { height: rise, kind });
  }

  private step(p: Player, dt: number) {
    const m = this.climb!;
    m.t += dt;
    const k = Math.min(1, m.t / m.T);
    mantlePose(m.from, m.to, k, pose);
    const b = p.body;
    const c = { x: pose.x, y: pose.y + b.halfHeight + b.radius, z: pose.z };
    b.body.setTranslation(c, true);
    b.body.setNextKinematicTranslation(c);
    p.currPos.copy(pose);
    p.velocity.set(0, 0, 0);
    p.grounded = false;
    if (k >= 1) this.climb = null;
  }

  /** While climbing the controller neither jumps nor moves the body (the climb does). */
  private hook() {
    const pc = this.game.getSystem<PlayerController>('playerController');
    if (!pc || pc === this.hooked) return;
    this.hooked = pc;
    const prevJump = pc.canJump;
    pc.canJump = () => !this.climb && prevJump();
    const prevMotion = pc.motionOverride;
    pc.motionOverride = (dt) => (this.climb ? NO_MOTION : prevMotion(dt));
  }
}
