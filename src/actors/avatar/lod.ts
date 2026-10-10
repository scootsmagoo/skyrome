/**
 * Animation level of detail: distant avatars sample their animation, and rebuild their skin
 * matrices, less often.
 *
 * Within NEAR meters of the viewer an avatar animates every frame; out to MID it updates at 30 Hz,
 * beyond at 15 Hz, and out of the view frustum (beyond NEAR) at 8 Hz. The skipped time is
 * accumulated so motion stays in sync, and each avatar gets a random phase so the reduced-rate
 * updates spread across frames instead of spiking. The actor's root still moves every frame, so
 * only the limb motion is coarser; HumanoidAvatar also puts avatars beyond `flatFrom` on the flat bone
 * path (flatSkeleton.ts), which makes the frames in between nearly free.
 *
 * `?lodoff=anim` switches all of it off (every avatar at the full rate on the stock bone path) for A/B runs.
 * Callers that must have the full rate (the player, fighters, ragdolls) ask for it by `force`.
 */
import * as THREE from 'three';

interface Lodded {
  readonly root: THREE.Object3D;
}

interface State {
  acc: number;
  dist: number;
  visible: boolean;
}

/** Whether the A/B switch ?lodoff=anim is on (read once). */
export const ANIM_LOD_OFF = (new URLSearchParams(globalThis.location?.search ?? '').get('lodoff') ?? '').split(',').includes('anim');

/** Radius (m) of the sphere standing in for a person in the frustum test (generous: arms up, a spear, a shadow). */
const BODY_RADIUS = 2.4;

export class AvatarLod {
  /** The camera (or player) distances are measured from; set by the scene/game. */
  viewer: THREE.Object3D | null = null;
  /** Full pose rate inside this distance (m): nothing animates differently within 25 m. */
  near = 25;
  /** Half rate out to here, a quarter beyond. */
  mid = 40;
  /** The flat bone path (flatSkeleton.ts, identical results) from this distance on. */
  flatFrom = 10;
  /** Foot IK and loose parts (anim.near) work within this distance (m). */
  ikNear = 40;
  /** Global multiplier on update intervals (settings/perf mode). */
  scale = 1;
  /** Switched off by ?lodoff=anim. */
  disabled = ANIM_LOD_OFF;
  private readonly states = new WeakMap<Lodded, State>();
  private readonly frustum = new THREE.Frustum();
  private readonly pv = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere();
  private haveFrustum = false;

  /** Call once per frame before the avatars update: reads the viewer's frustum. */
  beginFrame() {
    const cam = this.viewer as THREE.Camera | null;
    if (this.disabled || !cam?.isCamera) {
      this.haveFrustum = false;
      return;
    }
    this.pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);
    this.haveFrustum = true;
  }

  /** Distance from the viewer (m) as of the last step() call. */
  distance(a: Lodded): number {
    return this.states.get(a)?.dist ?? 0;
  }

  /** Was the avatar inside the view frustum at the last step() call (true when unknown)? */
  visible(a: Lodded): boolean {
    return this.states.get(a)?.visible ?? true;
  }

  /** Update interval (s) for a distance and visibility (0 = every frame). */
  interval(d: number, visible = true): number {
    if (this.disabled || d < this.near) return 0;
    if (!visible) return (1 / 8) * this.scale;
    if (d < this.mid) return (1 / 30) * this.scale;
    return (1 / 15) * this.scale;
  }

  /** Should an avatar this far away use the flat bone path? */
  flat(d: number): boolean {
    return !this.disabled && d >= this.flatFrom;
  }

  /**
   * Accumulate dt for an avatar; returns the time to advance its animation by now (0 = skip).
   * `force` (fighting, dead, being cut...) always returns the frame time.
   */
  step(a: Lodded, dt: number, force = false): number {
    let s = this.states.get(a);
    if (!s) this.states.set(a, (s = { acc: -1, dist: 0, visible: true }));
    let d = 0;
    if (this.viewer) {
      const e = a.root.matrixWorld.elements;
      const ve = this.viewer.matrixWorld.elements;
      d = Math.hypot(e[12] - ve[12], e[13] - ve[13], e[14] - ve[14]);
    }
    s.dist = d;
    const wasVisible = s.visible;
    let visible = true;
    if (this.haveFrustum && d >= this.near) {
      const e = a.root.matrixWorld.elements;
      this.sphere.center.set(e[12], e[13] + 1, e[14]);
      this.sphere.radius = BODY_RADIUS;
      visible = this.frustum.intersectsSphere(this.sphere);
    }
    s.visible = visible;
    const iv = force ? 0 : this.interval(d, visible);
    // The first call always samples (no avatar shows its bind pose); the phase is random after it.
    const first = s.acc < 0;
    s.acc = first ? 0 : s.acc + dt;
    // Coming into view: refresh the pose now rather than up to an eighth of a second late.
    if (first || s.acc >= iv || (visible && !wasVisible)) {
      const t = Math.min(s.acc, 0.25);
      s.acc = first ? Math.random() * iv : 0;
      return Math.max(t, dt);
    }
    return 0;
  }
}

/** Shared instance used by every HumanoidAvatar. */
export const avatarLod = new AvatarLod();
