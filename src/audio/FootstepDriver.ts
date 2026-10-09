/**
 * Turns an actor's locomotion into footstep sounds. It has no Web Audio dependency: it reads a
 * `LocomotionState` each frame, asks a surface callback what is underfoot, and calls `play`.
 *
 *   const steps = game.audio.footsteps.attach(actor, { surfaceAt: (x, y, z) => terrain.surface(x, z) });
 *   // later: steps.detach();
 *
 * Cadence follows speed (≈2 steps/s walking, ≈2.7 running, ≈3.3 sprinting), so steps stay in
 * step with a typical gait. Avatars that know their real foot plants can switch `auto` off and
 * call `footPlant()` from their animation instead: an avatar that has an `onFootContact` hook (see
 * `ContactAvatar`) is wired to it, and from its first contact on the speed cadence stands down.
 * Jumps give a push-off scuff (and sometimes an effort grunt); landings give a heavier double
 * contact scaled by the fall speed. Soldiers add hobnails on hard ground and the ring of their mail.
 */
import type { LocomotionState } from '../actors/Actor';
import { SURFACES, type Gait, type Surface } from './sounds/footsteps';

export type { Surface, Gait };
export { SURFACES };

/** The animation's foot-contact hook (AvatarView.onFootContact): the foot, the gait name, 0..1 strength. */
export interface ContactAvatar {
  onFootContact?: ((side: 'L' | 'R', gait: string, strength: number) => void) | null;
}

export interface FootstepSource {
  locomotionState(): LocomotionState;
  /** Feet position. */
  readonly position: { x: number; y: number; z: number };
  /** Set by Actor: the avatar whose animation may report foot contacts. */
  readonly avatar?: unknown;
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
  /** Is this spot worth a step at all (near enough to be heard)? Checked before the ground lookup. */
  near?: (p: { x: number; y: number; z: number }) => boolean;
}

/** Surfaces where hobnails ring. */
const HARD: ReadonlySet<Surface> = new Set<Surface>(['stone', 'marble', 'cobbles', 'wood']);
/** The ground under a walker changes slowly: look it up again only after this many meters. */
const SURFACE_REUSE = 1.2;

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
  private near: FootstepOptions['near'];
  /** Where the surface was last looked up (to reuse it for a meter or so), and for how many steps. */
  private lookX = NaN;
  private lookZ = NaN;
  private lookAge = 0;
  /** A foot-contact event has been seen: the animation owns the rhythm. */
  private contactSeen = false;
  private sinceContact = 0;
  private readonly contact = (side: 'L' | 'R', gait: string, strength: number) => {
    if (!this.source.locomotionState().grounded) return;
    this.contactSeen = true;
    this.sinceContact = 0;
    const g: Gait | undefined = gait === 'sneak' ? 'sneak' : gait === 'run' || gait === 'sprint' ? 'run' : gait === 'walk' ? 'walk' : undefined;
    // A soft touch (a foot settling) is quieter, a hard plant fuller.
    this.footPlant(g, 0.55 + 0.45 * Math.min(1, Math.max(0, strength)));
  };

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
    this.near = opts.near;
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

  /** The ground under the feet, looked up at a low rate (NPCs call this for every step they take). */
  private ground(): Surface {
    const p = this.source.position;
    const dx = p.x - this.lookX;
    const dz = p.z - this.lookZ;
    if (dx * dx + dz * dz <= SURFACE_REUSE * SURFACE_REUSE && this.lookAge < 6) {
      this.lookAge++;
      return this.surface;
    }
    this.lookX = p.x;
    this.lookZ = p.z;
    this.lookAge = 0;
    return (this.surface = this.surfaceAt(p.x, p.y, p.z));
  }

  /** Play one step now (for animation-driven foot plants). */
  footPlant(gait?: Gait, volume = 1) {
    const s = this.source.locomotionState();
    if (this.near && !this.near(this.source.position)) {
      this.steps++;
      return;
    }
    const surface = this.ground();
    const g = gait ?? gaitFor(s);
    const position = this.where();
    // A little different every time: the engine adds pitch and gain spread, this adds the weight of the step.
    const vol = this.volume * volume * (0.9 + 0.2 * this.random());
    this.play(`step.${surface}.${g}`, { position, volume: vol });
    this.steps++;
    // Gear: hobnails ring on hard ground, mail jingles on most running steps, a cloak rustles now and then.
    const r = this.random();
    if (this.gear === 'armor') {
      if (g !== 'sneak' && HARD.has(surface) && this.random() < (g === 'run' ? 0.9 : 0.6)) this.play('gear.hobnail', { position, volume: vol * 0.8 });
      if (r < (g === 'run' ? 0.55 : g === 'walk' ? 0.2 : 0.05)) this.play('armor.jingle', { position, volume: this.volume * (g === 'run' ? 0.9 : 0.6) });
    } else if (this.gear === 'cloth' && r < (g === 'run' ? 0.25 : 0.08)) this.play('cloth.rustle', { position, volume: this.volume * 0.7 });
    // A leather sole's own scuff under some steps on hard ground (the heel layer of a sandal or calceus).
    if (this.gear !== 'armor' && g !== 'sneak' && HARD.has(surface) && this.random() < (g === 'run' ? 0.5 : 0.3)) this.play('gear.leather', { position, volume: vol * 0.7 });
  }

  /** Wire the animation's contact hook (an avatar may be replaced, so this is checked every frame). */
  private hook() {
    const av = this.source.avatar as ContactAvatar | null | undefined;
    if (av && av.onFootContact !== this.contact && !av.onFootContact) av.onFootContact = this.contact;
  }

  /** Let go of the avatar's contact hook (the driver is being detached). */
  release() {
    const av = this.source.avatar as ContactAvatar | null | undefined;
    if (av && av.onFootContact === this.contact) av.onFootContact = null;
  }

  update(dt: number) {
    const s = this.source.locomotionState();
    this.hook();
    // Contacts that stop coming (the avatar was swapped, an animation without them) hand the beat back.
    if (this.contactSeen && (this.sinceContact += dt) > 1.2 && s.speed > 0.5) this.contactSeen = false;
    if (!s.grounded) {
      if (this.wasGrounded && s.verticalSpeed > 2) {
        // Push-off.
        this.play('jump.push', { position: this.where(), volume: this.volume * 0.8 });
        if (this.voice && this.random() < 0.35) this.play(`vox.effort.${this.voice}`, { position: this.where(), volume: this.volume * 0.8 });
      }
      this.wasGrounded = false;
      this.airTime += dt;
      this.minVy = Math.min(this.minVy, s.verticalSpeed);
      return;
    }
    if (!this.wasGrounded) {
      this.wasGrounded = true;
      this.lookAge = 99; // a landing always looks again
      const surface = this.ground();
      const impact = Math.min(1, Math.max(0, (-this.minVy - 2) / 10));
      if (this.airTime > 0.25 || this.minVy < -4) {
        this.play(`land.${surface}`, { position: this.where(), volume: this.volume * (0.55 + 0.45 * impact) });
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
    if (!this.auto || this.contactSeen) return;
    this.phase += dt * cadence(s.speed);
    if (this.phase >= 1) {
      this.phase -= 1;
      this.footPlant();
    }
  }
}
