/**
 * Puts the shell garments on an avatar that wears a realistic body (test bed and reference for the
 * integration): builds the shells from the body's LOD 0 arrays, adds them as a skinned mesh on the
 * avatar's skeleton and returns a body geometry without the triangles that touch a hidden vertex.
 */
import * as THREE from 'three';
import type { HumanoidAvatar } from '../../HumanoidAvatar';
import { avatarMaterial } from '../../material';
import type { BodyArrays } from '../morph';
import { buildShells } from './shells';

export interface AttachedShells {
  mesh: THREE.SkinnedMesh;
  /** The LOD 0 body geometry minus the triangles under the shells (to swap in for LOD 0). */
  body: THREE.BufferGeometry;
  hidden: number;
}

/** `bodyGeo` is the avatar's morphed LOD 0 geometry (position, normal, skinIndex, skinWeight, index). */
export function attachShells(avatar: HumanoidAvatar, bodyGeo: THREE.BufferGeometry): AttachedShells | null {
  const app = avatar.appearance;
  const body: BodyArrays = {
    position: bodyGeo.getAttribute('position').array as Float32Array,
    normal: bodyGeo.getAttribute('normal').array as Float32Array,
    skinIndex: bodyGeo.getAttribute('skinIndex').array as ArrayLike<number>,
    skinWeight: bodyGeo.getAttribute('skinWeight').array as ArrayLike<number>,
  };
  const built = buildShells({ app, rig: avatar.rig, sex: app.sex, lod: 0, body });
  if (!built) return null;
  const mesh = new THREE.SkinnedMesh(built.geometry, avatarMaterial());
  mesh.name = 'humanoid:shells';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  avatar.root.add(mesh);
  mesh.updateMatrixWorld(true);
  mesh.bind(avatar.skeleton, new THREE.Matrix4());
  // Body without the covered triangles.
  const idx = bodyGeo.index!;
  const keep: number[] = [];
  let hidden = 0;
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i);
    const b = idx.getX(i + 1);
    const c = idx.getX(i + 2);
    if (built.hide[a] && built.hide[b] && built.hide[c]) hidden++;
    else keep.push(a, b, c);
  }
  const geo = bodyGeo.clone();
  geo.setIndex(keep);
  geo.boundingSphere = bodyGeo.boundingSphere;
  return { mesh, body: geo, hidden };
}
