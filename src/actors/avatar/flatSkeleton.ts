/**
 * The flat bone path for distant avatars.
 *
 * Stock three.js re-composes and re-multiplies every bone and socket Object3D of every avatar each
 * frame (scene.updateMatrixWorld), then skeleton.update() multiplies them all again: with a crowd that
 * is thousands of matrices per frame, although a person 30 m away is a few pixels tall and
 * animates at 15 Hz (lod.ts). In flat mode:
 *
 *  - Bones and empty sockets have matrixAutoUpdate and matrixWorldAutoUpdate off, so the scene walk
 *    only calls through them. Their `matrix` is composed here, once per pose update.
 *  - On a pose update (`tick`) the bone matrices in the mesh's own space ("model space", parent chain
 *    multiplied once, flat, parents precede children) and the skin matrices (model x inverse bind)
 *    are written. In between, nothing is computed at all: the skinned meshes are switched to the
 *    detached bind mode (identity bind matrices), so the skin matrices do not depend on where the
 *    avatar stands, and `skeleton.update` only flags the bone texture when a tick changed it.
 *  - Bone `matrixWorld` is therefore stale. Whatever hangs on a bone (a held weapon, a hat, a prop
 *    on a socket) is kept right by `updateAttached` (every frame, only for bones that carry
 *    something), and `syncWorld` rebuilds all of them for a caller that needs the real values.
 *    Code that writes bones itself (ragdoll, gore) holds the avatar at the full rate instead
 *    (HumanoidAvatar.holdFull), which leaves flat mode.
 *
 * The result matches the stock path to rounding (flatSkeleton.test.ts).
 */
import * as THREE from 'three';

const _m = new THREE.Matrix4();

export class FlatSkeleton {
  /** Flat mode is on. */
  active = false;
  /** Bone matrices relative to the skinned mesh (what the stock walk would give with the mesh at the origin). */
  private readonly model: THREE.Matrix4[];
  private readonly parent: Int16Array;
  /** Sockets and other non-bone children of the bones, as {bone index, object}; rebuilt when children change. */
  private extras: { bone: number; obj: THREE.Object3D }[] = [];
  private extrasDirty = true;
  /** The hips are out of the mesh's child list: the scene walk and the renderer skip the empty bone tree. */
  private pruned = false;
  private readonly boneSet: Set<THREE.Object3D>;
  private readonly listeners: { o: THREE.Object3D; f: () => void }[] = [];
  private readonly origUpdate: () => void;
  /** A tick changed the skin matrices since the texture was last flagged. */
  private dirty = true;

  /**
   * @param skeleton the avatar's skeleton (bones ordered parents first)
   * @param mesh the skinned mesh the hips hang under
   * @param root the avatar root; its skinned children share the skeleton
   * @param sockets objects that may carry gear and are not bones
   */
  constructor(
    private readonly skeleton: THREE.Skeleton,
    private readonly mesh: THREE.Object3D,
    private readonly root: THREE.Object3D,
    private readonly sockets: readonly THREE.Object3D[],
  ) {
    const bones = skeleton.bones;
    this.model = bones.map(() => new THREE.Matrix4());
    this.parent = new Int16Array(bones.length);
    for (let i = 0; i < bones.length; i++) this.parent[i] = bones[i].parent ? bones.indexOf(bones[i].parent as THREE.Bone) : -1;
    this.boneSet = new Set(bones);
    this.origUpdate = skeleton.update;
    // Something was put on (or taken off) a bone or socket: the bone tree is back in the scene right
    // now, with fresh matrices, so the gear shows in the right place this very frame.
    const mark = () => {
      this.extrasDirty = true;
      if (this.active) this.updateAttached();
    };
    for (const o of [...bones, ...sockets]) {
      o.addEventListener('childadded', mark);
      o.addEventListener('childremoved', mark);
      this.listeners.push({ o, f: mark });
    }
  }

  /** Switch to flat mode (needs the bones' local transforms to be current: call `tick` right after). */
  enter() {
    if (this.active) return;
    this.active = true;
    for (const b of this.skeleton.bones) {
      b.updateMatrix();
      b.matrixAutoUpdate = false;
      b.matrixWorldAutoUpdate = false;
    }
    this.extrasDirty = true;
    this.skeleton.update = this.flatUpdate;
    this.dirty = true;
  }

  /** Back to the stock path: every matrix is recomputed by the next scene walk. */
  leave() {
    if (!this.active) return;
    this.active = false;
    this.unprune();
    for (const b of this.skeleton.bones) {
      b.matrixAutoUpdate = true;
      b.matrixWorldAutoUpdate = true;
      b.matrixWorldNeedsUpdate = true;
    }
    for (const s of this.sockets) {
      s.matrixAutoUpdate = true;
      s.matrixWorldAutoUpdate = true;
      s.matrixWorldNeedsUpdate = true;
    }
    // Instance override off: the prototype's update is the stock one.
    delete (this.skeleton as { update?: () => void }).update;
    if (this.skeleton.update !== this.origUpdate) this.skeleton.update = this.origUpdate;
    for (const c of this.root.children) {
      const sm = c as THREE.SkinnedMesh;
      if (sm.isSkinnedMesh && sm.bindMode !== 'attached') sm.bindMode = 'attached';
    }
  }

  /** The bones' local transforms changed: rebuild model space and the skin matrices. */
  tick() {
    const bones = this.skeleton.bones;
    const inv = this.skeleton.boneInverses;
    const arr = this.skeleton.boneMatrices!;
    const model = this.model;
    const parent = this.parent;
    for (let i = 0; i < bones.length; i++) {
      const b = bones[i];
      b.matrix.compose(b.position, b.quaternion, b.scale);
      const p = parent[i];
      if (p < 0) model[i].copy(b.matrix);
      else model[i].multiplyMatrices(model[p], b.matrix);
      _m.multiplyMatrices(model[i], inv[i]).toArray(arr, i * 16);
    }
    this.dirty = true;
  }

  /**
   * Every frame: bones that carry something get a current world matrix (the avatar moves every
   * frame), so the scene walk places the gear. `rootMoved` false when nothing could have changed.
   */
  updateAttached() {
    if (this.extrasDirty) this.rebuildExtras();
    const extras = this.extras;
    if (extras.length === 0) {
      // Nothing is carried: the bones need no world matrices and no visit at all.
      this.prune();
      return;
    }
    this.unprune();
    // Fresh from the root (the scene walk has not run yet this frame).
    this.root.updateWorldMatrix(true, false);
    this.mesh.updateWorldMatrix(false, false);
    const mw = this.mesh.matrixWorld;
    const bones = this.skeleton.bones;
    let last = -1;
    for (let k = 0; k < extras.length; k++) {
      const i = extras[k].bone;
      if (i === last) continue;
      last = i;
      bones[i].matrixWorld.multiplyMatrices(mw, this.model[i]);
    }
  }

  /** Make every bone's matrixWorld what the stock path would give (for callers that read or cut). */
  syncWorld() {
    if (!this.active) return;
    this.root.updateWorldMatrix(true, false);
    this.mesh.updateWorldMatrix(false, false);
    const mw = this.mesh.matrixWorld;
    const bones = this.skeleton.bones;
    for (let i = 0; i < bones.length; i++) bones[i].matrixWorld.multiplyMatrices(mw, this.model[i]);
    for (const s of this.sockets) {
      if (s.parent) s.matrixWorld.multiplyMatrices(s.parent.matrixWorld, s.matrix);
    }
  }

  /** The skin matrices as the shader will read them (model space), for tests. */
  skinMatrices(): Float32Array {
    return this.skeleton.boneMatrices!;
  }

  private prune() {
    if (this.pruned) return;
    const kids = this.mesh.children;
    const k = kids.indexOf(this.skeleton.bones[0]);
    if (k >= 0) kids.splice(k, 1);
    this.pruned = true;
  }

  private unprune() {
    if (!this.pruned) return;
    this.pruned = false;
    const kids = this.mesh.children;
    if (!kids.includes(this.skeleton.bones[0])) kids.push(this.skeleton.bones[0]);
  }

  private rebuildExtras() {
    this.extrasDirty = false;
    const bones = this.skeleton.bones;
    const out: { bone: number; obj: THREE.Object3D }[] = [];
    for (let i = 0; i < bones.length; i++) {
      for (const c of bones[i].children) {
        if (this.boneSet.has(c)) continue;
        out.push({ bone: i, obj: c });
      }
    }
    this.extras = out.filter((e) => e.obj.children.length > 0 || (e.obj as THREE.Mesh).isMesh);
    // Empty sockets are skipped by the walk; carrying ones update normally under their bone.
    const carrying = new Set(this.extras.map((e) => e.obj));
    for (const s of this.sockets) {
      const on = carrying.has(s);
      if (on) {
        s.updateMatrix();
        s.matrixAutoUpdate = true;
        s.matrixWorldAutoUpdate = true;
      } else {
        s.updateMatrix();
        s.matrixAutoUpdate = false;
        s.matrixWorldAutoUpdate = false;
      }
    }
  }

  /** Installed as `skeleton.update` in flat mode: enforce the bind mode, flag a changed texture. */
  private readonly flatUpdate = () => {
    for (const c of this.root.children) {
      const sm = c as THREE.SkinnedMesh;
      if (sm.isSkinnedMesh && sm.bindMode !== 'detached') {
        sm.bindMode = 'detached';
        sm.bindMatrixInverse.copy(sm.bindMatrix).invert();
      }
    }
    if (this.dirty) {
      this.dirty = false;
      if (this.skeleton.boneTexture) this.skeleton.boneTexture.needsUpdate = true;
    }
  };

  dispose() {
    this.leave();
    for (const l of this.listeners) {
      l.o.removeEventListener('childadded', l.f);
      l.o.removeEventListener('childremoved', l.f);
    }
    this.listeners.length = 0;
  }
}
