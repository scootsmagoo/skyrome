/**
 * Frozen matrices for static scenery. three.js recomposes every object's local matrix and
 * multiplies it into the world matrix every frame (`matrixAutoUpdate`), 10 k objects in the Forum
 * (half of them the crowd's bones, which really move): ~1.5 ms of the render submit. The static
 * groups below (by name: landmarks and their stand-ins, dressing, groves, trees) never move, so
 * once such a group is in the scene it is sealed:
 *
 *  - its meshes get `matrixAutoUpdate = false` (world matrices computed first; they stay valid);
 *  - its other objects (the group itself, sub-groups, pivots, lights) are frozen too but watched:
 *    `TransformWatch` compares their position, rotation and scale with a snapshot every frame
 *    (after every other system) and recomposes one that moved, exactly as three.js would have,
 *    so a builder that turns a door or a pivot group keeps working without knowing any of this;
 *  - the group's own `updateMatrixWorld` skips its subtree unless something in it changed (a
 *    watched object moved, or a child was added): even frozen, visiting the ~4.5 k objects of the
 *    Forum's static groups cost ~1.1 ms a frame (perf audit, October 2026). Objects that update
 *    themselves (added to the group after sealing, skinned, or `thaw`ed) are walked on their own.
 *
 * A mesh in a sealed group that must move after this ran calls `thaw(mesh)` (or is added after the
 * group was sealed). `?lodoff=seal` keeps the plain walk (the freezing stays) for A/B runs.
 */
import * as THREE from 'three';
import type { Game, System } from '../core/Game';

/** Top-level scene children whose meshes are static: landmarks and their far stand-ins, dressing, trees. */
const STATIC_GROUPS = /^(landmark:|terrain-dressing$|grass$|forest|landmark-trees$|content:standins|city:trees$|capfora)|:far$/;
const OFF = new URLSearchParams(globalThis.location?.search ?? '').get('lodoff') ?? '';

/** Snapshot of a watched object's local transform (10 numbers each). */
const SNAP = 10;

/** Freeze the meshes under `root` (their world matrices are brought up to date first). Returns how many. */
export function freezeMeshes(root: THREE.Object3D): number {
  root.updateMatrixWorld(true);
  let n = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.matrixAutoUpdate || (m as unknown as THREE.SkinnedMesh).isSkinnedMesh) return;
    m.matrixAutoUpdate = false;
    n++;
  });
  return n;
}

/** A sealed top-level group: its subtree is walked only when something in it changed. */
export class Seal {
  /** Walk the whole subtree at the next update (something in it moved or was added). */
  dirty = false;
  /** Objects inside that update themselves, walked every frame (each with its own subtree). */
  readonly live: THREE.Object3D[] = [];
  constructor(readonly root: THREE.Object3D) {}

  /** Walk `o` every frame from now on (unless an ancestor already is). */
  addLive(o: THREE.Object3D) {
    for (let p: THREE.Object3D | null = o; p && p !== this.root; p = p.parent) if (this.live.includes(p)) return;
    this.live.push(o);
    this.dirty = true;
  }

  removeLive(o: THREE.Object3D) {
    const i = this.live.indexOf(o);
    if (i >= 0) this.live.splice(i, 1);
  }

  /** Drop live objects that left the group. */
  prune() {
    for (let i = this.live.length - 1; i >= 0; i--) {
      let p: THREE.Object3D | null = this.live[i];
      while (p && p !== this.root) p = p.parent;
      if (!p) this.live.splice(i, 1);
    }
  }
}

/**
 * Frozen non-mesh objects, each checked once a frame against a snapshot of its local transform:
 * `check` recomposes the ones that moved and marks their seal dirty.
 */
export class TransformWatch {
  private objects: THREE.Object3D[] = [];
  private seals: (Seal | null)[] = [];
  private snap = new Float64Array(64 * SNAP);
  /** Objects recomposed by the last `check` (debug). */
  moved = 0;

  get size() {
    return this.objects.length;
  }

  /** Freeze `o` (its matrix is composed now) and watch it from here on. */
  add(o: THREE.Object3D, seal: Seal | null = null) {
    o.updateMatrix();
    o.matrixAutoUpdate = false;
    const i = this.objects.length;
    this.objects.push(o);
    this.seals.push(seal);
    if ((i + 1) * SNAP > this.snap.length) {
      const bigger = new Float64Array(this.snap.length * 2);
      bigger.set(this.snap);
      this.snap = bigger;
    }
    write(this.snap, i * SNAP, o);
  }

  /** Recompose every watched object whose position, rotation or scale changed. Returns how many. */
  check(): number {
    const s = this.snap;
    const list = this.objects;
    let moved = 0;
    for (let i = 0, o = 0; i < list.length; i++, o += SNAP) {
      const ob = list[i];
      const p = ob.position, q = ob.quaternion, k = ob.scale;
      if (p.x === s[o] && p.y === s[o + 1] && p.z === s[o + 2] && q.x === s[o + 3] && q.y === s[o + 4] && q.z === s[o + 5] && q.w === s[o + 6] && k.x === s[o + 7] && k.y === s[o + 8] && k.z === s[o + 9]) continue;
      write(s, o, ob);
      ob.updateMatrix(); // also flags matrixWorldNeedsUpdate: the scene walk redoes it and its subtree
      const seal = this.seals[i];
      if (seal) seal.dirty = true;
      moved++;
    }
    this.moved = moved;
    return moved;
  }

  /** Stop watching objects no longer under `root` (removed from the scene), so they can be freed. */
  prune(root: THREE.Object3D) {
    let w = 0;
    for (let i = 0; i < this.objects.length; i++) {
      const ob = this.objects[i];
      let top: THREE.Object3D = ob;
      while (top.parent) top = top.parent;
      if (top !== root) continue;
      if (w !== i) {
        this.objects[w] = ob;
        this.seals[w] = this.seals[i];
        this.snap.copyWithin(w * SNAP, i * SNAP, (i + 1) * SNAP);
      }
      w++;
    }
    this.objects.length = w;
    this.seals.length = w;
  }
}

function write(s: Float64Array, o: number, ob: THREE.Object3D) {
  const p = ob.position, q = ob.quaternion, k = ob.scale;
  s[o] = p.x; s[o + 1] = p.y; s[o + 2] = p.z;
  s[o + 3] = q.x; s[o + 4] = q.y; s[o + 5] = q.z; s[o + 6] = q.w;
  s[o + 7] = k.x; s[o + 8] = k.y; s[o + 9] = k.z;
}

/** Freeze the non-mesh objects under `root` (root included) into `watch`. Returns how many. */
export function freezeGroups(root: THREE.Object3D, watch: TransformWatch, seal: Seal | null = null): number {
  let n = 0;
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh || !o.matrixAutoUpdate) return;
    watch.add(o, seal);
    n++;
  });
  return n;
}

const seals = new WeakMap<THREE.Object3D, Seal>();
/** Runtime switch for A/B runs (`game.getSystem('staticFreeze').switches.seal = false`). */
const switches = { seal: !OFF.includes('seal') };
const plainUpdate = THREE.Object3D.prototype.updateMatrixWorld;

/**
 * Seal a static group (see the header): freeze its meshes, watch its other objects, and let its
 * scene walk skip the subtree while nothing changed. Returns the seal.
 */
export function sealGroup(root: THREE.Object3D, watch: TransformWatch): Seal {
  const seal = new Seal(root);
  seals.set(root, seal);
  freezeMeshes(root);
  freezeGroups(root, watch, seal);
  const onAdded = (e: { child: THREE.Object3D }) => seal.addLive(e.child);
  const onRemoved = (e: { child: THREE.Object3D }) => seal.removeLive(e.child);
  const visit = (o: THREE.Object3D) => {
    // Still updating itself (a skinned mesh): walked on its own, subtree included.
    if (o !== root && o.matrixAutoUpdate) {
      seal.live.push(o);
      return;
    }
    o.addEventListener('childadded', onAdded as never);
    o.addEventListener('childremoved', onRemoved as never);
    for (const c of o.children) visit(c);
  };
  visit(root);
  root.updateMatrixWorld = function (this: THREE.Object3D, force?: boolean) {
    if (force || this.matrixWorldNeedsUpdate || seal.dirty || !switches.seal) {
      seal.dirty = false;
      plainUpdate.call(this, force);
      return;
    }
    const live = seal.live;
    for (let i = 0; i < live.length; i++) live[i].updateMatrixWorld(false);
  };
  return seal;
}

/**
 * Let an object inside a sealed group move again: it updates its own matrix every frame from now
 * on. (Outside a sealed group it just turns `matrixAutoUpdate` back on.)
 */
export function thaw(o: THREE.Object3D) {
  o.matrixAutoUpdate = true;
  o.matrixWorldNeedsUpdate = true;
  let top: THREE.Object3D = o;
  while (top.parent && !seals.has(top)) top = top.parent;
  seals.get(top)?.addLive(o);
}

export class StaticFreeze implements System {
  readonly name = 'staticFreeze';
  /** After every other system: whatever moved a frozen group this frame has done so. */
  readonly priority = 5000;
  private readonly seen = new WeakSet<THREE.Object3D>();
  private readonly sealed: Seal[] = [];
  private tick = 0;
  readonly watch = new TransformWatch();
  /** Sealed walks on/off (A/B runs; `?lodoff=seal` starts with them off). */
  readonly switches = switches;
  frozen = 0;

  constructor(private readonly game: Game) {}

  lateUpdate() {
    // Streamed groups appear now and then: look twice a second.
    if (this.tick++ % 30 === 0) {
      if (this.tick % 600 === 1) this.prune();
      for (const c of this.game.scene.children) {
        if (this.seen.has(c) || !STATIC_GROUPS.test(c.name)) continue;
        this.seen.add(c);
        this.sealed.push(sealGroup(c, this.watch));
        this.frozen++;
      }
    }
    this.watch.check();
  }

  /** Forget what left the scene (every ten seconds). */
  private prune() {
    const scene = this.game.scene;
    this.watch.prune(scene);
    for (let i = this.sealed.length - 1; i >= 0; i--) {
      const s = this.sealed[i];
      if (s.root.parent !== scene) this.sealed.splice(i, 1);
      else s.prune();
    }
  }
}

/** Add the freezer to the game (once). */
export function installStaticFreeze(game: Game) {
  if (!game.getSystem('staticFreeze')) game.addSystem(new StaticFreeze(game));
}
