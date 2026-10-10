/**
 * Severing a part of a procedural humanoid (actors/avatar/HumanoidAvatar).
 *
 * The body is one SkinnedMesh on a per-avatar skeleton, with shared (cached) geometry. To take a
 * part off we never touch that geometry:
 *  - the piece: the triangles skinned mostly to the cut bone's subtree are baked in their current
 *    pose (SkinnedMesh.applyBoneTransform) into a new mesh in world space, with copies of whatever
 *    hangs from those bones (the sword in the hand, the helmet on the head) and a flesh cap;
 *  - the body: the cut bone is scaled to nothing, so its part (and anything on it) collapses into
 *    the joint, and a flesh cap covers the stump on the parent bone.
 */
import * as THREE from 'three';
import type { HumanoidAvatar } from '../../actors/avatar/HumanoidAvatar';
import { avatarMaterial } from '../../actors/avatar/material';
import { B, PARENT } from '../../actors/avatar/rig';
import { severReal, isRealBody } from './dismemberReal';
import { CUT_BONE, REAL_CUT, STUMP_RADIUS, partMask, partTriangles, subtree, type Part } from './limbs';
import { fleshMaterials } from './stump';

export interface SeveredPiece {
  /** The piece in world space, centred on its centroid. */
  group: THREE.Group;
  /** Half extents of its bounding box (for a physics box). */
  half: THREE.Vector3;
  /** The spurt anchor at the cut end of the piece (+Y out of the wound). */
  pieceStump: THREE.Object3D;
  /** The spurt anchor at the stump left on the body (+Y out of the wound). */
  bodyStump: THREE.Object3D;
}


/**
 * A stump cap: a flattened dome of wet, dark flesh with the pale end of the bone in it, `r` m
 * across, its +Y out of the wound. Shared geometry and materials.
 */
function stumpCap(r: number): THREE.Group {
  const { flesh, bone, nub } = fleshMaterials();
  const g = new THREE.Group();
  g.name = 'gore:stump';
  const f = new THREE.Mesh(nub, flesh);
  f.userData.sharedGeometry = true;
  f.scale.set(r, r * 0.3, r);
  const b = new THREE.Mesh(nub, bone);
  b.userData.sharedGeometry = true;
  b.scale.set(r * 0.32, r * 0.45, r * 0.32);
  g.add(f, b);
  return g;
}

const v = new THREE.Vector3();
const m = new THREE.Matrix4();
const inv = new THREE.Matrix4();
const pParent = new THREE.Vector3();
const pCut = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);

/** Has this avatar lost this part already (its cut bone is collapsed)? */
export function isSevered(avatar: HumanoidAvatar, part: Part): boolean {
  // The procedural body collapses the cut bone, the realistic one its child (its cut is mid-bone).
  return avatar.bones[B[CUT_BONE[part]]].scale.x < 0.01 || avatar.bones[B[REAL_CUT[part].child]].scale.x < 0.01;
}

/**
 * Take `part` off `avatar` now (in its current pose). Returns the piece, already in world space
 * and NOT yet added to the scene, or null if there is nothing to cut (already gone).
 */
export function sever(avatar: HumanoidAvatar, part: Part): SeveredPiece | null {
  if (isSevered(avatar, part)) return null;
  if (isRealBody(avatar)) return severReal(avatar, part);
  const cutName = CUT_BONE[part];
  const cut = avatar.bones[B[cutName]];
  const parent = avatar.bones[B[PARENT[cutName]!]];
  const mesh = avatar.mesh;
  // A cut body keeps the stock bone path for good (the pieces and the stump read the world matrices).
  avatar.holdFull(true);
  avatar.root.updateMatrixWorld(true);
  mesh.skeleton.update();
  const geo = mesh.geometry;
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const si = geo.getAttribute('skinIndex') as THREE.BufferAttribute;
  const sw = geo.getAttribute('skinWeight') as THREE.BufferAttribute;
  const index = geo.getIndex();
  if (!pos?.array || !si?.array || !sw?.array || !index?.array) return null;
  const bones = subtree(cutName);
  const mask = partMask(si.array as ArrayLike<number>, sw.array as ArrayLike<number>, bones);
  const tris = partTriangles(index.array as ArrayLike<number>, mask);
  if (!tris.length) return null;

  // Bake the piece's vertices in their current pose, in world space.
  const remap = new Map<number, number>();
  const used: number[] = [];
  for (const i of tris) if (!remap.has(i)) remap.set(i, used.push(i) - 1);
  const n = used.length;
  const out = new Float32Array(n * 3);
  const centroid = new THREE.Vector3();
  for (let k = 0; k < n; k++) {
    v.fromBufferAttribute(pos, used[k]);
    mesh.applyBoneTransform(used[k], v);
    v.applyMatrix4(mesh.matrixWorld);
    out[k * 3] = v.x;
    out[k * 3 + 1] = v.y;
    out[k * 3 + 2] = v.z;
    centroid.add(v);
  }
  centroid.multiplyScalar(1 / n);
  const box = new THREE.Box3();
  for (let k = 0; k < n; k++) {
    out[k * 3] -= centroid.x;
    out[k * 3 + 1] -= centroid.y;
    out[k * 3 + 2] -= centroid.z;
    box.expandByPoint(v.set(out[k * 3], out[k * 3 + 1], out[k * 3 + 2]));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(out, 3));
  for (const name of ['color', 'surf'] as const) {
    const a = geo.getAttribute(name) as THREE.BufferAttribute | undefined;
    if (!a?.array) continue;
    const src = a.array as ArrayLike<number>;
    const dst = new (src.constructor as new (n: number) => Float32Array | Uint8Array)(n * a.itemSize);
    for (let k = 0; k < n; k++) for (let c = 0; c < a.itemSize; c++) dst[k * a.itemSize + c] = src[used[k] * a.itemSize + c];
    g.setAttribute(name, new THREE.BufferAttribute(dst, a.itemSize, a.normalized));
  }
  g.setIndex(tris.map((i) => remap.get(i)!));
  g.computeVertexNormals();
  g.computeBoundingSphere();

  const group = new THREE.Group();
  group.name = `gore:${part}`;
  group.position.copy(centroid);
  const body = new THREE.Mesh(g, avatarMaterial());
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Whatever hangs from the cut bones goes with the piece (weapon in the hand, helmet on the head).
  group.updateMatrixWorld(true);
  inv.copy(group.matrixWorld).invert();
  const sockets: THREE.Object3D[] = [];
  cut.traverse((o) => {
    if ((o as THREE.Bone).isBone || o === cut) return;
    if (o.parent && (o.parent as THREE.Bone).isBone) sockets.push(o);
  });
  for (const s of sockets) {
    for (const child of s.children) {
      if (!child.visible || child.name.startsWith('gore:')) continue;
      const copy = child.clone(true);
      // Own geometry: the body's equipment is disposed when the body is cleared away.
      copy.traverse((o) => {
        const mm = o as THREE.Mesh;
        if (mm.isMesh && mm.geometry) mm.geometry = mm.geometry.clone();
      });
      copy.matrixAutoUpdate = true;
      m.multiplyMatrices(inv, child.matrixWorld).decompose(copy.position, copy.quaternion, copy.scale);
      group.add(copy);
    }
  }

  // The wound: from the parent joint to the cut. The body's stump points along it; the piece's
  // stump points back the other way.
  pParent.setFromMatrixPosition(parent.matrixWorld);
  pCut.setFromMatrixPosition(cut.matrixWorld);
  const along = new THREE.Vector3().subVectors(pCut, pParent).normalize();
  if (along.lengthSq() < 0.5) along.set(0, 1, 0);
  const r = STUMP_RADIUS[part] * avatar.rig.s;
  const pieceStump = stumpCap(r);
  pieceStump.position.copy(pCut).sub(centroid);
  pieceStump.quaternion.setFromUnitVectors(Y, along.clone().negate());
  group.add(pieceStump);

  // Body side: a cap on the parent bone at the joint, +Y out of the wound (in the parent's frame).
  const ps = parent.getWorldScale(new THREE.Vector3()).x || 1;
  const bodyStump = stumpCap(r / ps);
  bodyStump.position.copy(cut.position);
  const dirLocal = cut.position.clone().normalize();
  if (dirLocal.lengthSq() < 0.5) dirLocal.set(0, 1, 0);
  bodyStump.quaternion.setFromUnitVectors(Y, dirLocal);
  parent.add(bodyStump);

  // Collapse the part on the body (its skin, and anything on its bones, vanish into the joint).
  cut.scale.setScalar(0.0001);
  const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  return { group, half, pieceStump, bodyStump };
}
