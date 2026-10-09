/** Shared flesh and bone materials (and the bone nub geometry) of the gore stump caps. */
import * as THREE from 'three';

let flesh: THREE.MeshStandardMaterial | null = null;
let wound: THREE.MeshStandardMaterial | null = null;
let bone: THREE.MeshStandardMaterial | null = null;
let nub: THREE.BufferGeometry | null = null;

export function fleshMaterials(): { flesh: THREE.MeshStandardMaterial; wound: THREE.MeshStandardMaterial; bone: THREE.MeshStandardMaterial; nub: THREE.BufferGeometry } {
  flesh ??= new THREE.MeshStandardMaterial({ color: 0x3c0404, roughness: 0.3, metalness: 0, name: 'gore:flesh' });
  // Vertex-coloured wound surface of the realistic bodies' caps (colour set per vertex).
  wound ??= new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.32, metalness: 0, name: 'gore:wound' });
  bone ??= new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: 0.6, metalness: 0, name: 'gore:bone' });
  // A flattened dome (the end of the bone); +Y out of the wound.
  nub ??= new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  return { flesh, wound, bone, nub };
}
