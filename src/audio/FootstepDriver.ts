/**
 * Turns an actor's locomotion into footstep sounds. It has no Web Audio dependency: it reads a
 * `LocomotionState` each frame, asks a surface callback what is underfoot, and calls `play`.
 *
 *   const steps = game.audio.footsteps.attach(actor, { surfaceAt: (x, y, z) => terrain.surface(x, z) });
 *   // later: steps.detach();
 *
 * Cadence follows speed (≈2 steps/s walking, ≈2.7 running, ≈3.3 sprinting), so steps stay in
 * step with a typical gait. Avatars that know their real foot plants can switch `auto` off and
 * call `footPlant()` from their animation instead. Jumps give a push-off scuff (and sometimes an
 * effort grunt); landings give a heavier double contact scaled by the fall speed.
 */
import type { LocomotionState } from '../actors/Actor';
import { SURFACES, type Gait, type Surface } from './sounds/footsteps';

export type { Surface, Gait };
export { SURFACES };

export interface FootstepSource {
  locomotionState(): LocomotionState;
  /** Feet position. */
  readonly position: { x: number; y: number; z: number };
}

export type SurfaceLookup = (x: number, y: number, z: number) => Surface;

export interface FootstepPlay {
  (id: string, opts: { position?: { x: number; y: number; z: number }; volume?: number }): void;
}

export interface FootstepOptions {
  surfaceAt?: SurfaceLookup;
  /** Spatialize at the feet (NPCs). The player is usually played 2D. Default true. */
  spatial?: boolean | (() => boolean);
  volume?: number;
  /** Who grunts on jumps/hard landings (null = silent). */
  voice?: 'm' | 'f' | null;
  /** Gear layered on some steps: mail jingle or cloak rustle. */
  gear?: 'none' | 'cloth' | 'armor';
  /** Drive steps from speed (default) or only from `footPlant()`. */
  auto?: boolean;
}

/** Steps per second for a horizontal speed (m/s). */
export function cadence(speed: number): number {
  return Math.min(3.4, Math.max(1.4, 1.55 + 0.27 * speed));
}

export function gaitFor(s: LocomotionState): Gait {
  if (s.sneaking) return 'sneak';
  return s.sprinting || s.speed > 3.2 ? 'run' : 'walk';
}

export class FootstepDriver {
  surfaceAt: SurfaceLookup;
  volume: number;
  voice: 'm' | 'f' | null;
  gear: 'none' | 'cloth' | 'armor';
  auto: boolean;
  /** Last surface stepped on (for debugging / HUD). */
  surface: Surface = 'stone';
  steps = 0;
  private phase = 0.5;
  private wasGrounded = true;
  private airTime = 0;
  private minVy = 0;
  private settled = true;
  private rnd = 0x2545f491;
  private spatial: boolean | (() => boolean);

  constructor(
    readonly source: FootstepSource,
    private readonly play: FootstepPlay,
    opts: FootstepOptions = {},
  ) {
    this.surfaceAt = opts.surfaceAt ?? (() => 'stone');
    this.volume = opts.volume ?? 1;
    this.voice = opts.voice ?? null;
    this.gear = opts.gear ?? 'none';
    this.auto = opts.auto ?? true;
    this.spatial = opts.spatial ?? true;
  }

  private random(): number {
    let x = this.rnd;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rnd = x >>> 0;
    return this.rnd / 4294967296;
  }

  private where() {
    const sp = typeof this.spatial === 'function' ? this.spatial() : this.spatial;
    return sp ? { x: this.source.position.x, y: this.source.position.y + 0.05, z: this.source.position.z } : undefined;
  }

  /** Play one step now (for animation-driven foot plants). */
  footPlant(gait?: Gait, volume = 1) {
    const s = this.source.locomotionState();
    const p = this.source.position;
    this.surface = this.surfaceAt(p.x, p.y, p.z);
    const g = gait ?? gaitFor(s);
    const position = this.where();
    this.play(`step.${this.surface}.${g}`, { position, volume: this.volume * volume });
    this.steps++;
    // Gear: mail jingles on most running steps, a cloak rustles now and then.
    const r = this.random();
    if (this.gear === 'armor' && r < (g === 'run' ? 0.55 : g === 'walk' ? 0.2 : 0.05)) this.play('armor.jingle', { position, volume: this.volume * (g === 'run' ? 0.9 : 0.6) });
    else if (this.gear === 'cloth' && r < (g === 'run' ? 0.25 : 0.08)) this.play('cloth.rustle', { position, volume: this.volume * 0.7 });
  }

  update(dt: number) {
    const s = this.source.locomotionState();
    if (!s.grounded) {
      if (this.wasGrounded && s.verticalSpeed > 2) {
        // Push-off.
        this.footPlant('run', 0.6);
        if (this.voice && this.random() < 0.35) this.play(`vox.effort.${this.voice}`, { position: this.where(), volume: this.volume * 0.8 });
      }
      this.wasGrounded = false;
      this.airTime += dt;
      this.minVy = Math.min(this.minVy, s.verticalSpeed);
      return;
    }
    if (!this.wasGrounded) {
      this.wasGrounded = true;
      const p = this.source.position;
      this.surface = this.surfaceAt(p.x, p.y, p.z);
      const impact = Math.min(1, Math.max(0, (-this.minVy - 2) / 10));
      if (this.airTime > 0.25 || this.minVy < -4) {
        this.play(`land.${this.surface}`, { position: this.where(), volume: this.volume * (0.55 + 0.45 * impact) });
        if (this.voice && impact > 0.6) this.play(`vox.pain.${this.voice}`, { position: this.where(), volume: this.volume * 0.8 });
        this.steps++;
      } else if (this.airTime > 0.05) this.footPlant();
      this.airTime = 0;
      this.minVy = 0;
      this.phase = 0;
      return;
    }
    this.airTime = 0;
    this.minVy = 0;
    if (s.speed < 0.3) {
      // Stopping: bring the trailing foot alongside once.
      if (!this.settled && this.auto && this.phase > 0.35) this.footPlant(s.sneaking ? 'sneak' : 'walk', 0.55);
      this.settled = true;
      this.phase = 0.6; // the first step comes quickly when moving off again
      return;
    }
    this.settled = false;
    if (!this.auto) return;
    this.phase += dt * cadence(s.speed);
    if (this.phase >= 1) {
      this.phase -= 1;
      this.footPlant();
    }
  }
}
