/**
 * Shadow policy for merged city geometry: a material either always casts shadows or never does,
 * so the MeshBuilder produces ONE mesh per material (splitting by a per-part flag would double the
 * draw calls). Flat ground-like surfaces, emissives, water and dark fills never cast.
 */
import type { MaterialId } from '../../gfx/materialIds';

const NO_SHADOW = new Set<MaterialId>([
  'black', 'glow_fire', 'water', 'mosaic', 'paving_basalt', 'paving_travertine', 'cobbles', 'gravel', 'dirt', 'grass', 'dry_grass', 'sand', 'mud',
]);

export function castsShadow(mat: MaterialId): boolean {
  return !NO_SHADOW.has(mat);
}
