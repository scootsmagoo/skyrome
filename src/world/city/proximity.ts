/**
 * ProximityColliders: physics colliders that exist only near the player. Each item is a patch of
 * the world (a block of the far massing, a cell of trees) with a centre, a radius and a function
 * that makes its collider specs; `update(pos)` creates the colliders of items that come within
 * `near` m and removes them again beyond `far` m (hysteresis), so the physics world holds a few
 * hundred city colliders instead of tens of thousands (Rapier's per-step cost grows with the count).
 *
 *   const prox = new ProximityColliders(game.physics, { near: 80, far: 110 });
 *   prox.add(x, z, 12, () => specs, { city: 'massing' });
 *   prox.update(game.player.position);   // every frame; cheap until the position moves 4 m
 */
import type { ColliderSpec } from '../../gfx/MeshBuilder';

/** The part of Physics this needs (so tests can count calls). */
export interface ColliderHost<C> {
  add(spec: ColliderSpec, owner: unknown): C;
  remove(c: C): void;
}

interface Item<C> {
  x: number;
  z: number;
  r: number;
  make: () => ColliderSpec[];
  owner: unknown;
  live: C[] | null;
}

export class ProximityColliders<C> {
  private items: Item<C>[] = [];
  private lx = Infinity;
  private lz = Infinity;
  /** Colliders alive now. */
  live = 0;

  constructor(
    private readonly host: ColliderHost<C>,
    private readonly o: { near: number; far: number; moveStep?: number } = { near: 80, far: 110 },
  ) {}

  get size() {
    return this.items.length;
  }

  add(x: number, z: number, r: number, make: () => ColliderSpec[], owner?: unknown) {
    this.items.push({ x, z, r, make, owner, live: null });
    // Re-evaluate on the next update even if the position has not moved.
    this.lx = Infinity;
  }

  /** Create / remove colliders around (x, z). `force` re-evaluates even without movement. */
  update(pos: { x: number; z: number }, scale = 1, force = false) {
    const step = this.o.moveStep ?? 4;
    if (!force && (pos.x - this.lx) ** 2 + (pos.z - this.lz) ** 2 < step * step) return;
    this.lx = pos.x;
    this.lz = pos.z;
    const near = this.o.near * scale, far = this.o.far * scale;
    for (const it of this.items) {
      const d = Math.hypot(it.x - pos.x, it.z - pos.z) - it.r;
      if (!it.live && d < near) {
        it.live = it.make().map((s) => this.host.add(s, it.owner));
        this.live += it.live.length;
      } else if (it.live && d > far) {
        for (const c of it.live) this.host.remove(c);
        this.live -= it.live.length;
        it.live = null;
      }
    }
  }

  /** Remove every live collider. */
  clear() {
    for (const it of this.items) {
      if (!it.live) continue;
      for (const c of it.live) this.host.remove(c);
      it.live = null;
    }
    this.live = 0;
    this.lx = Infinity;
  }
}
