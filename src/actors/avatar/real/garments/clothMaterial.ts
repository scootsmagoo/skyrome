/**
 * The cloth material of the realistic bodies at LOD 0: avatarMaterial plus a coverage cut.
 *
 * The cloth group's triangles carry a smooth per-vertex `cover` (1 deep inside a garment, falling to 0
 * over the skin around it); fragments below about one half are discarded, which puts hems and sleeve
 * ends on a smooth contour. With MSAA the edge is also alpha-to-coverage blended. A small polygon
 * offset keeps the cloth in front of the skin it lies on.
 */
import * as THREE from 'three';
import { avatarMaterial } from '../../material';

let cloth: THREE.MeshStandardMaterial | null = null;

export function realClothMaterial(): THREE.MeshStandardMaterial {
  if (cloth) return cloth;
  const base = avatarMaterial();
  const m = new THREE.MeshStandardMaterial();
  m.copy(base);
  m.name = 'real-cloth';
  m.alphaToCoverage = true;
  m.polygonOffset = true;
  m.polygonOffsetFactor = -2;
  m.polygonOffsetUnits = -2;
  m.onBeforeCompile = (shader, renderer) => {
    base.onBeforeCompile(shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float cover;\nvarying float vCover;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCover = cover;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCover;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vCover < 0.44) discard;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a = smoothstep(0.44, 0.56, vCover);');
  };
  m.customProgramCacheKey = () => 'skyrome-real-cloth-v1';
  cloth = m;
  return m;
}
