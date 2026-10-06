/**
 * Registry of static world content with distance culling. Everything big that lives in the world
 * (terrain tiles, landmark groups, city blocks, props) is registered here so that it can be hidden
 * beyond its cull distance and found by id/cell.
 */
import * as THREE from 'three';
import type { Game, System } from '../core/Game';

declare module '../core/Game' {
  interface Game {
    world: WorldRegistry;
  }
}

export interface WorldEntry {
  id: string;
  object: THREE.Object3D;
  /** Hidden when the camera is farther than this from the bounding sphere's surface. */
  cullDistance: number;
  /** World-space bounding sphere (computed on register). */
  sphere: THREE.Sphere;
  /** Optional low-detail stand-in shown between cullDistance and farDistance. */
  far?: THREE.Object3D;
  farDistance?: number;
  tags?: string[];
  /**
   * How much of the bounding sphere's radius counts toward "near" (1 = its whole surface). A big
   * complex with a far stand-in uses less, so its far end goes simple when you're at the other.
   */
  radiusWeight?: number;
}

const box = new THREE.Box3();

export class WorldRegistry implements System {
  readonly name = 'world';
  readonly priority = 95; // after camera placement (100 is camera; we read camera in lateUpdate below)
  private entries: WorldEntry[] = [];
  private byId = new Map<string, WorldEntry>();
  private cursor = 0;
  /** Multiplies every cull distance (settings.viewDistance / 900). */
  distanceScale = 1;

  constructor(private readonly game: Game) {
    this.distanceScale = game.settings.data.viewDistance / 900;
    game.settings.onChange((s) => (this.distanceScale = s.viewDistance / 900));
  }

  /** Add an object to the scene and the registry. */
  add(
    id: string,
    object: THREE.Object3D,
    opts: { cullDistance?: number; far?: THREE.Object3D; farDistance?: number; tags?: string[]; parent?: THREE.Object3D; radiusWeight?: number } = {},
  ): WorldEntry {
    (opts.parent ?? this.game.scene).add(object);
    object.updateMatrixWorld(true);
    box.setFromObject(object);
    const sphere = box.isEmpty() ? new THREE.Sphere(object.getWorldPosition(new THREE.Vector3()), 1) : box.getBoundingSphere(new THREE.Sphere());
    const entry: WorldEntry = {
      id,
      object,
      cullDistance: opts.cullDistance ?? 600,
      sphere,
      far: opts.far,
      farDistance: opts.farDistance,
      tags: opts.tags,
      radiusWeight: opts.radiusWeight,
    };
    if (opts.far) (opts.parent ?? this.game.scene).add(opts.far);
    this.entries.push(entry);
    this.byId.set(id, entry);
    return entry;
  }

  get(id: string) {
    return this.byId.get(id);
  }

  remove(id: string) {
    const e = this.byId.get(id);
    if (!e) return;
    e.object.removeFromParent();
    e.far?.removeFromParent();
    this.byId.delete(id);
    this.entries = this.entries.filter((x) => x !== e);
  }

  all(): readonly WorldEntry[] {
    return this.entries;
  }

  /** Re-evaluate visibility for every entry now (e.g. after teleport). */
  refreshAll() {
    for (const e of this.entries) this.evaluate(e);
  }

  lateUpdate() {
    // Spread work over frames: ~1/4 of entries per frame is plenty at walking speeds.
    const n = this.entries.length;
    if (!n) return;
    const batch = Math.max(64, Math.ceil(n / 4));
    for (let i = 0; i < batch && i < n; i++) {
      this.cursor = (this.cursor + 1) % n;
      this.evaluate(this.entries[this.cursor]);
    }
  }

  private evaluate(e: WorldEntry) {
    const cam = this.game.camera.position;
    const d = Math.max(0, cam.distanceTo(e.sphere.center) - e.sphere.radius * (e.radiusWeight ?? 1));
    const near = d <= e.cullDistance * this.distanceScale;
    e.object.visible = near;
    if (e.far) e.far.visible = !near && d <= (e.farDistance ?? Infinity) * this.distanceScale;
  }
}
