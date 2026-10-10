/**
 * Where do the GPU textures come from? `renderer.info.memory.textures` counts every texture object
 * the renderer has uploaded, and most of them are not images: this sorts the scene's into classes so
 * a jump in the number can be explained (console command `tex`).
 *
 *  - material maps (colour, normal, roughness, ... of the scene's materials, each texture once);
 *  - bone textures: one small float texture per avatar skeleton;
 *  - BatchedMesh data: every BatchedMesh holds a matrices texture and an indirect (per-instance
 *    index) texture, however few instances it draws, so 100 batches are 200 textures;
 *  - the rest: render targets (shadow map, post chain), the sky, UI, anything not on a scene object.
 *
 * Nothing here runs per frame.
 */
import * as THREE from 'three';

export interface TextureCensus {
  /** `renderer.info.memory.textures`. */
  total: number;
  /** Distinct textures reachable from the scene's materials (and shader uniforms). */
  materialMaps: number;
  boneTextures: number;
  batchedMeshes: number;
  /** Two data textures per BatchedMesh (matrices, indirect). */
  batchedTextures: number;
  /** BatchedMeshes holding 8 instances or fewer (each still costs a draw call and two textures). */
  tinyBatches: number;
  /** Total minus the classes above. */
  other: number;
}

const MAP_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'displacementMap', 'lightMap', 'envMap'] as const;

export function textureCensus(scene: THREE.Object3D, renderer: THREE.WebGLRenderer): TextureCensus {
  const maps = new Set<THREE.Texture>();
  const skeletons = new Set<THREE.Skeleton>();
  const materials = new Set<THREE.Material>();
  let batched = 0;
  let tiny = 0;
  scene.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (m) for (const x of Array.isArray(m) ? m : [m]) materials.add(x);
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skeletons.add((o as THREE.SkinnedMesh).skeleton);
    if ((o as THREE.BatchedMesh).isBatchedMesh) {
      batched++;
      if ((o as THREE.BatchedMesh).instanceCount <= 8) tiny++;
    }
  });
  for (const m of materials) {
    const any = m as unknown as Record<string, unknown>;
    for (const k of MAP_KEYS) if ((any[k] as THREE.Texture | null)?.isTexture) maps.add(any[k] as THREE.Texture);
    const uniforms = (m as THREE.ShaderMaterial).uniforms;
    if (uniforms) for (const u of Object.values(uniforms)) if ((u.value as THREE.Texture | null)?.isTexture) maps.add(u.value as THREE.Texture);
  }
  let bones = 0;
  for (const s of skeletons) if (s.boneTexture) bones++;
  const total = renderer.info.memory.textures;
  const batchedTextures = batched * 2;
  return {
    total,
    materialMaps: maps.size,
    boneTextures: bones,
    batchedMeshes: batched,
    batchedTextures,
    tinyBatches: tiny,
    other: Math.max(0, total - maps.size - bones - batchedTextures),
  };
}
