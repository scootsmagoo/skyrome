/**
 * The interface the four wave-2 realistic-character modules meet through (see docs/design/rework-2026-10.md).
 * C2a writes the integration, C2b the head, C2c the correctives, C2d the shell garments.
 */
import type * as THREE from 'three';
import type { Appearance } from '../../appearance';
import type { Rig } from '../rig';
import type { BodyArrays } from './morph';

export interface RealContext {
  app: Appearance;
  rig: Rig;
  sex: 'male' | 'female';
  lod: 0 | 1 | 2;
  body: BodyArrays;
}

// garments/shells.ts (C2d): separate skinned garment meshes (same skeleton, bind pose), vertex attributes
// position, normal, color, surf (avatarMaterial's contract), skinIndex, skinWeight; `hide` = per body vertex 1 when covered.
export type BuildShells = (ctx: RealContext) => { geometry: THREE.BufferGeometry; hide: Uint8Array } | null;

// head/index.ts (C2b): hair, beard, brows, veils, helmets fitted to a measured HeadFrame.
export interface RealHeadFrame {
  centre: THREE.Vector3;
  radii: THREE.Vector3;
  brow: number;
  ears: number;
  crown: number;
  chin: number;
}
export type BuildHead = (ctx: RealContext) => { objects: THREE.Object3D[]; frame: RealHeadFrame; skinPaint?: unknown };

// corrective.ts (C2c): pose-space correctives (shoulder/armpit), morphAttributes on the body geometry, driven per frame.
export type AddCorrectives = (geometry: THREE.BufferGeometry, ctx: RealContext) => void;
export type UpdateCorrectives = (mesh: THREE.SkinnedMesh, bones: readonly THREE.Bone[]) => void;
