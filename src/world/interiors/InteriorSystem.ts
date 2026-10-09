/**
 * The interior-cell system. A cell is a def (types.ts) built on first use in its own frame and
 * placed at `origin` in the world. The player is "inside" a cell while their feet are in the
 * def's local bounds (3D). Doors are interactions: a door from the world sits at a world point,
 * a door inside a cell is placed through the cell's frame. Moving between frames goes through
 * UIManager.fade, so the teleport happens in the dark.
 *
 * Without a scene, physics, interactions, player or UI the system still runs: it only skips what
 * it cannot reach.
 */
import * as THREE from 'three';
import type { Game, System } from '../../core/Game';
import type { Physics } from '../../core/Physics';
import { Layer } from '../../core/Physics';
import { MeshBuilder, transformCollider, type ColliderSpec } from '../../gfx/MeshBuilder';
import type { Interactable } from '../../interaction/Interactions';
import type { Spot } from '../landmarks/types';
import type { InteriorDef, InteriorDoor, InteriorOrigin, Vec3, Where } from './types';

declare module '../../core/Game' {
  interface Game {
    interiors?: InteriorSystem;
  }
}

declare module '../../core/Events' {
  interface GameEvents {
    /** The player's feet entered an interior cell. */
    'interior:entered': { id: string };
    /** The player's feet left an interior cell. */
    'interior:exited': { id: string };
  }
}

type Collider = ReturnType<Physics['addBox']>;

interface Built {
  def: InteriorDef;
  object: THREE.Object3D;
  origin: InteriorOrigin;
  spots: Spot[];
  colliders: Collider[];
  doors: Interactable[];
}

/** The part of the UI the cells use: the veil (UIManager.fade). */
interface FadeSource {
  readonly name: string;
  fade?(outS?: number, holdS?: number, inS?: number): Promise<void>;
}

const UP = new THREE.Vector3(0, 1, 0);
const CHECK_EVERY = 0.2;
const MARKER = /^interior:([^:]+):(.+)$/;

/** Local → world for a frame placed at `o` with rotation.y = o.rotY. */
export function localToWorld(o: InteriorOrigin, local: Vec3, out = new THREE.Vector3()): THREE.Vector3 {
  out.set(local.x, local.y, local.z).applyAxisAngle(UP, o.rotY);
  return out.add(new THREE.Vector3(o.x, o.y, o.z));
}

/** World → local for a frame placed at `o` (the inverse of localToWorld). */
export function worldToLocal(o: InteriorOrigin, world: Vec3, out = new THREE.Vector3()): THREE.Vector3 {
  out.set(world.x - o.x, world.y - o.y, world.z - o.z).applyAxisAngle(UP, -o.rotY);
  return out;
}

/** A door's point, worked out now (null: not knowable yet, e.g. the landmark isn't placed). */
function where(game: Game, w: Where): Vec3 | null {
  return typeof w === 'function' ? w(game) : w;
}

function inBox(p: Vec3, b: { min: Vec3; max: Vec3 }): boolean {
  return p.x >= b.min.x && p.x <= b.max.x && p.y >= b.min.y && p.y <= b.max.y && p.z >= b.min.z && p.z <= b.max.z;
}

/** Physics colliders for a cell, owned by `owner` (MeshBuilder's registerColliders, keeping the handles). */
function addColliders(physics: Physics, specs: ColliderSpec[], matrix: THREE.Matrix4, owner: string): Collider[] {
  const out: Collider[] = [];
  for (const s0 of specs) {
    const s = transformCollider(s0, matrix);
    if (s.kind === 'box') out.push(physics.addOrientedBox(s.center, s.half, s.rotation ?? new THREE.Quaternion(), { owner, layer: Layer.World }));
    else if (s.kind === 'cylinder') out.push(physics.addCylinder(s.center, s.halfHeight, s.radius, { owner, layer: Layer.World }));
    else out.push(physics.addTrimesh(s.geometry, s.matrix, { owner, layer: Layer.World }));
  }
  return out;
}

export class InteriorSystem implements System {
  readonly name = 'interiors';
  readonly priority = 50;
  private readonly defs = new Map<string, InteriorDef>();
  private readonly built = new Map<string, Built>();
  /** Doors from the outside world (from: null), added at register. */
  private readonly outsideDoors: Interactable[] = [];
  private readonly offs: (() => void)[] = [];
  private inside: string | null = null;
  private timer = 0;
  /** True while a fade-and-move is running: the periodic check stands still. */
  private busy = false;

  constructor(private readonly game: Game) {
    const off = game.events?.on('save:loaded', () => this.check());
    if (off) this.offs.push(off);
  }

  // ------------------------------------------------------------------ registry and building

  /** Register a cell def. Doors from the outside world become interactions at once. */
  register(def: InteriorDef): void {
    if (this.defs.has(def.id)) return;
    this.defs.set(def.id, def);
    for (const d of def.doors ?? []) {
      if (d.from !== null) continue;
      const item = this.makeDoor(d);
      this.outsideDoors.push(item);
      this.game.interactions?.add(item);
    }
  }

  get(id: string): InteriorDef | undefined {
    return this.defs.get(id);
  }

  /** Build the cell once (its object, colliders and inside doors). False if it cannot be built yet. */
  ensure(id: string): boolean {
    if (this.built.has(id)) return true;
    const def = this.defs.get(id);
    if (!def) return false;
    const origin = def.origin(this.game);
    if (!origin) return false;
    try {
      const build = def.build({ game: this.game, builder: () => new MeshBuilder() });
      const object = build.object;
      object.name = `interior:${id}`;
      object.position.set(origin.x, origin.y, origin.z);
      object.rotation.y = origin.rotY;
      object.visible = !(def.hiddenOutside ?? true) || this.inside === id;
      object.updateMatrixWorld(true);
      this.game.scene?.add(object);
      const colliders = this.game.physics ? addColliders(this.game.physics, build.colliders, object.matrixWorld, `interior:${id}`) : [];
      const doors: Interactable[] = [];
      for (const d of def.doors ?? []) {
        if (d.from !== id) continue;
        const item = this.makeDoor(d);
        doors.push(item);
        this.game.interactions?.add(item);
      }
      this.built.set(id, { def, object, origin, spots: build.spots, colliders, doors });
      return true;
    } catch (err) {
      console.error(`[interiors] failed to build ${id}`, err);
      return false;
    }
  }

  /** Remove a built cell: object, colliders and doors. */
  dispose(id?: string): void {
    if (id === undefined) {
      for (const k of [...this.built.keys()]) this.dispose(k);
      for (const off of this.offs.splice(0)) off();
      for (const item of this.outsideDoors.splice(0)) this.game.interactions?.remove(item);
      return;
    }
    const b = this.built.get(id);
    if (!b) return;
    this.built.delete(id);
    b.object.removeFromParent();
    for (const c of b.colliders) this.game.physics?.removeCollider(c);
    for (const item of b.doors) this.game.interactions?.remove(item);
  }

  // ------------------------------------------------------------------ player state

  /** The cell whose local bounds hold the player's feet (3D), or null. */
  current(): string | null {
    const p = this.game.player?.position;
    if (!p) return null;
    for (const def of this.defs.values()) {
      const origin = this.built.get(def.id)?.origin ?? def.origin(this.game);
      if (!origin) continue;
      if (inBox(worldToLocal(origin, p), def.bounds)) return def.id;
    }
    return null;
  }

  isInside(id: string): boolean {
    return this.current() === id;
  }

  // ------------------------------------------------------------------ coordinates

  /** A local point of cell `id` in the world (works before the cell is built). */
  toWorld(id: string, local: Vec3): THREE.Vector3 | null {
    const origin = this.built.get(id)?.origin ?? this.defs.get(id)?.origin(this.game);
    return origin ? localToWorld(origin, local) : null;
  }

  /** A named spot of cell `id` in the world: its position and heading (builds the cell if needed). */
  spot(id: string, spotId: string): { position: THREE.Vector3; heading: number } | null {
    if (!this.ensure(id)) return null;
    const b = this.built.get(id)!;
    const s = b.spots.find((x) => x.id === spotId);
    if (!s) return null;
    b.object.updateMatrixWorld(true);
    return { position: s.position.clone().applyMatrix4(b.object.matrixWorld), heading: (s.heading ?? 0) + b.origin.rotY };
  }

  /** The cell's route, in the world. */
  routeWorld(id: string): THREE.Vector3[] {
    const r = this.defs.get(id)?.route ?? [];
    const route = typeof r === 'function' ? r() : r;
    return route.map((p) => this.toWorld(id, p)).filter((v): v is THREE.Vector3 => !!v);
  }

  /** Quest marker target `interior:<id>:<spot>`. */
  resolve(markerId: string): THREE.Vector3 | null {
    const m = MARKER.exec(markerId);
    if (!m) return null;
    return this.spot(m[1], m[2])?.position ?? null;
  }

  // ------------------------------------------------------------------ moving the player

  /** Fade out, build if needed, put the player at `local` (heading local to the cell), then fade in. */
  async enter(id: string, local: Vec3, heading: number): Promise<void> {
    const def = this.defs.get(id);
    if (!def || this.busy) return;
    this.busy = true;
    try {
      await this.fade();
      if (!this.ensure(id)) return;
      const origin = this.built.get(id)!.origin;
      const world = localToWorld(origin, local);
      this.game.player?.teleport(world, heading + origin.rotY);
      this.setInside(id);
    } finally {
      this.busy = false;
    }
  }

  /** Fade out, put the player at a world point (heading world), then fade in. */
  async leave(world: Vec3, heading: number): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.fade();
      this.game.player?.teleport(world, heading);
      this.setInside(null);
    } finally {
      this.busy = false;
    }
  }

  // ------------------------------------------------------------------ system

  fixedUpdate(dt: number): void {
    this.timer += dt;
    if (this.timer < CHECK_EVERY) return;
    this.timer = 0;
    this.check();
  }

  /** Re-check where the player is: builds the cell they are in, and reports entering or leaving. */
  check(): void {
    if (this.busy) return;
    const id = this.current();
    if (id !== null && !this.built.has(id)) this.ensure(id);
    if (id !== this.inside) this.setInside(id);
  }

  // ------------------------------------------------------------------ internals

  private setInside(next: string | null): void {
    const prev = this.inside;
    if (prev === next) return;
    this.inside = next;
    if (prev !== null) {
      this.defs.get(prev)?.onExit?.(this.game);
    }
    this.refreshVisibility();
    if (this.game.sky) this.game.sky.indoor = next === null ? 0 : (this.defs.get(next)?.indoor ?? 1);
    if (prev !== null) this.game.events?.emit('interior:exited', { id: prev });
    if (next !== null) {
      this.game.locations?.discover(next);
      this.defs.get(next)?.onEnter?.(this.game);
      this.game.events?.emit('interior:entered', { id: next });
    }
  }

  private refreshVisibility(): void {
    for (const [id, b] of this.built) b.object.visible = !(b.def.hiddenOutside ?? true) || this.inside === id;
  }

  private makeDoor(d: InteriorDoor): Interactable {
    return {
      id: `door:${d.id}`,
      reach: d.reach ?? 1.8,
      position: () => {
        const at = where(this.game, d.at);
        if (!at) return new THREE.Vector3(0, -1e4, 0);
        return d.from === null ? new THREE.Vector3(at.x, at.y, at.z) : (this.toWorld(d.from, at) ?? new THREE.Vector3(0, -1e4, 0));
      },
      verb: () => d.verb,
      label: () => d.label,
      enabled: () => this.inside === d.from && where(this.game, d.at) !== null,
      interact: () => this.useDoor(d),
    };
  }

  private useDoor(d: InteriorDoor): void {
    if (this.busy) return;
    const why = d.locked?.(this.game) ?? null;
    if (why) {
      this.game.events?.emit('ui:notify', { text: why, kind: 'warning' });
      return;
    }
    const to = d.to;
    const pos = where(this.game, to.position);
    if (!pos) return;
    const heading = typeof to.heading === 'function' ? to.heading(this.game) : to.heading;
    if (to.interior !== null) void this.enter(to.interior, pos, heading);
    else void this.leave(pos, heading);
  }

  private fade(): Promise<void> {
    const ui = this.game.getSystem<FadeSource>('ui');
    return ui?.fade ? ui.fade() : Promise.resolve();
  }
}
