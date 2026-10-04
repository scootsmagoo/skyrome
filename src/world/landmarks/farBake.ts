/**
 * Automatic far stand-ins for landmarks. A landmark is built as one mesh per material (often 12–80
 * meshes), and every one of them is a draw call wherever it is in view, even as a speck 1 km away.
 * Beyond `LANDMARK_DETAIL_DISTANCE` we show instead a single vertex-coloured mesh baked from the
 * landmark (each material's flat MATERIAL_BASE colour, flat shading, no textures or shadows): the
 * same look the far city blocks already have (arch/fabric/lod.ts).
 *
 * Only what is visible at build time is baked. Landmarks whose own runtime LOD fills instanced
 * meshes later (an empty InstancedMesh at build time) are left alone: their bake would have holes.
 */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MATERIAL_BASE, MATERIAL_IDS, type MaterialId } from '../../gfx/materialIds';

/** Full detail within this distance of a landmark's bounding sphere (m, × the view-distance scale). */
export const LANDMARK_DETAIL_DISTANCE = 300;

/** Materials left out of the bake: emissive glows, painted/carved lettering, water. */
const SKIP = /glow|inscription|water|window_glow|flame/i;

let sharedMaterial: THREE.MeshStandardMaterial | null = null;

/** One material for every landmark stand-in (one shader program). Colours are sRGB bytes. */
export function landmarkFarMaterial(): THREE.MeshStandardMaterial {
  if (sharedMaterial) return sharedMaterial;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0 });
  mat.name = 'landmark:far';
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>', `#include <color_vertex>
#ifdef USE_COLOR
  vColor.rgb = pow(vColor.rgb, vec3(2.2));
#endif`);
  };
  mat.customProgramCacheKey = () => 'landmark:far';
  sharedMaterial = mat;
  return mat;
}

function colorOf(mesh: THREE.Mesh, material: THREE.Material): THREE.Color {
  const fromName = mesh.name.split(':');
  for (const cand of [material.name, ...fromName.reverse()]) {
    if (cand && (MATERIAL_IDS as readonly string[]).includes(cand)) return new THREE.Color(MATERIAL_BASE[cand as MaterialId].color);
  }
  const c = (material as THREE.MeshStandardMaterial).color;
  return c ? c.clone() : new THREE.Color(0x9a9080);
}

export interface FarBake {
  /** The stand-in (place it with the landmark's own transform). */
  mesh: THREE.Mesh;
  triangles: number;
}

/**
 * Bake `root` (a landmark object, in its local frame) into one vertex-coloured mesh, or null when
 * it can't be baked faithfully (see the header) or has nothing to bake. `skip` prunes subtrees
 * (e.g. tree groups that stay visible on their own).
 */
export function bakeLandmarkFar(root: THREE.Object3D, skip?: (o: THREE.Object3D) => boolean): FarBake | null {
  root.updateMatrixWorld(true);
  const toLocal = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const parts: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  const im = new THREE.Matrix4();
  const v = new THREE.Vector3();
  let holes = false;

  const addPart = (mesh: THREE.Mesh, toRoot: THREE.Matrix4, material: THREE.Material) => {
    const src = mesh.geometry;
    const pos = src.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!pos || !(pos.array as ArrayLike<number> | null)) return; // arrays already freed after upload
    const n = pos.count;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(toRoot);
      p[i * 3] = v.x; p[i * 3 + 1] = v.y; p[i * 3 + 2] = v.z;
    }
    const c = colorOf(mesh, material).convertLinearToSRGB();
    const r = Math.round(c.r * 255), g = Math.round(c.g * 255), b = Math.round(c.b * 255);
    const col = new Uint8Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
    if (src.index) {
      if (!(src.index.array as ArrayLike<number> | null)) return;
      geo.setIndex(new THREE.BufferAttribute(new Uint32Array(src.index.array as ArrayLike<number>), 1));
    }
    parts.push(geo.index ? geo.toNonIndexed() : geo);
  };

  const walk = (o: THREE.Object3D) => {
    if (!o.visible || (skip && o !== root && skip(o))) return;
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && !(o as THREE.SkinnedMesh).isSkinnedMesh) {
      const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.Material;
      const skipMat = !material || SKIP.test(material.name) || SKIP.test(mesh.name) || (material.transparent && material.opacity < 0.9);
      const inst = o as THREE.InstancedMesh;
      if (inst.isInstancedMesh) {
        if (inst.count === 0) {
          if (!skipMat) holes = true;
        } else if (!skipMat) {
          for (let i = 0; i < inst.count; i++) {
            inst.getMatrixAt(i, im);
            m.multiplyMatrices(toLocal, mesh.matrixWorld).multiply(im);
            addPart(mesh, m, material);
          }
        }
      } else if (!skipMat) {
        m.multiplyMatrices(toLocal, mesh.matrixWorld);
        addPart(mesh, m, material);
      }
    }
    for (const c of o.children) walk(c);
  };
  walk(root);
  if (holes || !parts.length) return null;
  const merged = mergeGeometries(parts, false);
  if (!merged) return null;
  const geometry = mergeVertices(merged, 1e-3);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  // The stand-in is drawn once uploaded and never read again on the CPU: free its arrays then.
  const free = function (this: THREE.BufferAttribute) {
    (this as unknown as { array: ArrayLike<number> | null }).array = null;
  };
  for (const a of Object.values(geometry.attributes)) (a as THREE.BufferAttribute).onUpload(free);
  geometry.index?.onUpload(free);
  const mesh = new THREE.Mesh(geometry, landmarkFarMaterial());
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = true;
  const triangles = (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;
  return { mesh, triangles };
}
