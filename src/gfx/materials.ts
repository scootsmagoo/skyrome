/**
 * Shared material library. `getMaterial(id)` always returns the same instance for an id.
 * This baseline uses flat colors; the materials module upgrades entries to textured PBR
 * (CC0 textures in public/textures/) without changing callers.
 */
import * as THREE from 'three';
import { MATERIAL_BASE, type MaterialId } from './materialIds';

const cache = new Map<MaterialId, THREE.Material>();

export function getMaterial(id: MaterialId): THREE.Material {
  let m = cache.get(id);
  if (!m) {
    const b = MATERIAL_BASE[id];
    m = new THREE.MeshStandardMaterial({
      color: b.color,
      roughness: b.roughness,
      metalness: b.metalness ?? 0,
      emissive: b.emissive ?? 0x000000,
      emissiveIntensity: b.emissive ? 1.5 : 0,
    });
    m.name = id;
    cache.set(id, m);
  }
  return m;
}

/** Replace the material registered for an id (used by the texture loader). Existing meshes keep the old instance unless they look it up again — so register textured materials BEFORE building the world. */
export function setMaterial(id: MaterialId, material: THREE.Material) {
  material.name = id;
  cache.set(id, material);
}

export function allMaterials(): ReadonlyMap<MaterialId, THREE.Material> {
  return cache;
}
