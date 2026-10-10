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
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MATERIAL_BASE, MATERIAL_IDS, type MaterialId } from '../../gfx/materialIds';

/** Full detail within this distance of a landmark's bounding sphere (m, × the view-distance scale). */
export const LANDMARK_DETAIL_DISTANCE = 220;
/** The stand-in is simplified by snapping vertices to a grid this fine (m): sub-pixel beyond 200 m. */
export const FAR_CELL = 0.5;

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
    const src32 = pos.array instanceof Float32Array && pos.itemSize === 3 && !pos.normalized && pos.array.length === n * 3 ? pos.array : null;
    if (src32) {
      // Plain floats: the matrix applied inline (the per-vertex accessors were a good part of the bake).
      const e = toRoot.elements;
      for (let i = 0; i < n * 3; i += 3) {
        const x = src32[i], y = src32[i + 1], z = src32[i + 2];
        const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
        p[i] = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
        p[i + 1] = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
        p[i + 2] = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
      }
    } else {
      for (let i = 0; i < n; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(toRoot);
        p[i * 3] = v.x; p[i * 3 + 1] = v.y; p[i * 3 + 2] = v.z;
      }
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
  const geometry = cluster(merged, FAR_CELL);
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

/**
 * Vertex-clustering simplification (Rossignac–Borrel): snap every vertex to a `cell` grid, merge
 * vertices that land in the same cell with the same colour, and drop the triangles that collapse.
 * Column flutes, mouldings and steps melt into their mass; silhouettes stay. Input is non-indexed
 * (position + sRGB byte colour); output is indexed. Keys are numbers, not strings (it ran for
 * ~0.5 s of the boot with string keys; the output is the same).
 */
export function cluster(geo: THREE.BufferGeometry, cell: number): THREE.BufferGeometry {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const col = geo.getAttribute('color') as THREE.BufferAttribute;
  const pa = pos.array as Float32Array;
  const ca = col.array as Uint8Array;
  // Grid cell → its first cluster; clusters of other colours in the same cell chain on `next`.
  const firstInCell = new Map<number, number>();
  const next: number[] = [];
  const rgb: number[] = [];
  const outC: number[] = [];
  const sum: number[] = [];
  const count: number[] = [];
  const remap = new Uint32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const qx = Math.round(pa[i * 3] / cell);
    const qy = Math.round(pa[i * 3 + 1] / cell);
    const qz = Math.round(pa[i * 3 + 2] / cell);
    const key = cellKey(qx, qy, qz);
    const c = (ca[i * 3] << 16) | (ca[i * 3 + 1] << 8) | ca[i * 3 + 2];
    let k = firstInCell.get(key) ?? -1;
    let last = -1;
    while (k >= 0 && rgb[k] !== c) {
      last = k;
      k = next[k];
    }
    if (k < 0) {
      k = count.length;
      if (last >= 0) next[last] = k;
      else firstInCell.set(key, k);
      next.push(-1);
      rgb.push(c);
      sum.push(0, 0, 0);
      count.push(0);
      outC.push(ca[i * 3], ca[i * 3 + 1], ca[i * 3 + 2]);
    }
    // Each cluster sits at the mean of its vertices (keeps big flat faces where they were).
    sum[k * 3] += pa[i * 3];
    sum[k * 3 + 1] += pa[i * 3 + 1];
    sum[k * 3 + 2] += pa[i * 3 + 2];
    count[k]++;
    remap[i] = k;
  }
  const outP = new Float32Array(count.length * 3);
  for (let k = 0; k < count.length; k++) {
    outP[k * 3] = sum[k * 3] / count[k];
    outP[k * 3 + 1] = sum[k * 3 + 1] / count[k];
    outP[k * 3 + 2] = sum[k * 3 + 2] / count[k];
  }
  const index: number[] = [];
  // Triangles kept so far, by their two smallest corners → chain of third corners.
  const firstTri = new Map<number, number>();
  const triZ: number[] = [];
  const triNext: number[] = [];
  for (let t = 0; t + 2 < pos.count; t += 3) {
    const a = remap[t];
    const b = remap[t + 1];
    const c = remap[t + 2];
    if (a === b || b === c || a === c) continue;
    // The same triangle twice (two faces collapsed onto each other): keep one.
    const lo = Math.min(a, b, c);
    const hi = Math.max(a, b, c);
    const mid = a + b + c - lo - hi;
    const key = lo * 67108864 + mid; // 2^26: cluster counts stay far below it
    let j = firstTri.get(key) ?? -1;
    let last = -1;
    while (j >= 0 && triZ[j] !== hi) {
      last = j;
      j = triNext[j];
    }
    if (j >= 0) continue;
    j = triZ.length;
    triZ.push(hi);
    triNext.push(-1);
    if (last >= 0) triNext[last] = j;
    else firstTri.set(key, j);
    index.push(a, b, c);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(outP, 3));
  out.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(outC), 3, true));
  out.setIndex(count.length > 65535 ? new THREE.BufferAttribute(new Uint32Array(index), 1) : new THREE.BufferAttribute(new Uint16Array(index), 1));
  return out;
}

/** A grid cell's integer coordinates as one number (exact for |q| < 65536 on each axis). */
function cellKey(qx: number, qy: number, qz: number): number {
  return ((qx + 65536) * 131072 + (qy + 65536)) * 131072 + (qz + 65536);
}
