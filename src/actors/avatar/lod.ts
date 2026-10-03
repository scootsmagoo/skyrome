/**
 * Animation level of detail: distant avatars sample their animation less often.
 *
 * Within NEAR meters of the viewer an avatar animates every frame; farther out it updates at
 * 30, 15 and finally 8 Hz, accumulating the skipped time so motion stays in sync. Each avatar
 * gets a random phase offset so the reduced-rate updates spread across frames instead of spiking.
 * The actor's root still moves every frame, so only the limb motion is coarser — at those
 * distances it is a few pixels tall and the steps are invisible.
 */
import * as THREE from 'three';

interface Lodded {
  readonly root: THREE.Object3D;
}

export class AvatarLod {
  /** The camera (or player) distances are measured from; set by the scene/game. */
  viewer: THREE.Object3D | null = null;
  near = 40;
  mid = 80;
  far = 150;
  /** Global multiplier on update intervals (settings/perf mode). */
  scale = 1;
  private acc = new WeakMap<Lodded, number>();
  private dist = new WeakMap<Lodded, number>();
  private readonly v = new THREE.Vector3();

  /** Distance from the viewer (m) as of the last step() call. */
  distance(a: Lodded): number {
    return this.dist.get(a) ?? 0;
  }

  /** Update interval (s) for a distance. */
  interval(d: number): number {
    if (d < this.near) return 0;
    if (d < this.mid) return (1 / 30) * this.scale;
    if (d < this.far) return (1 / 15) * this.scale;
    return (1 / 8) * this.scale;
  }

  /**
   * Accumulate dt for an avatar; returns the time to advance its animation by now (0 = skip).
   */
  step(a: Lodded, dt: number): number {
    let d = 0;
    if (this.viewer) {
      const e = a.root.matrixWorld.elements;
      const ve = this.viewer.matrixWorld.elements;
      d = Math.hypot(e[12] - ve[12], e[13] - ve[13], e[14] - ve[14]);
    }
    this.dist.set(a, d);
    const iv = this.interval(d);
    let acc = this.acc.get(a);
    if (acc === undefined) acc = Math.random() * iv;
    acc += dt;
    if (acc >= iv) {
      this.acc.set(a, 0);
      return Math.min(acc, 0.25);
    }
    this.acc.set(a, acc);
    return 0;
  }
}

/** Shared instance used by every HumanoidAvatar. */
export const avatarLod = new AvatarLod();
