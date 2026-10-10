/**
 * Dropping CPU copies the GPU already has. A static mesh's vertex arrays and a procedural
 * texture's pixels are needed once, for the upload; keeping them afterwards doubles their memory
 * (on a Mac with unified memory, both copies are the same RAM). These helpers free them right
 * after the renderer uploads, with no visible change.
 *
 * Only for data that never changes after it is first drawn: three.js re-reads an attribute's or a
 * texture's arrays when `needsUpdate` is set again, so nothing released here may be edited later.
 * Physics has its own collider copies, and the game never ray-tests three.js meshes.
 */
import * as THREE from 'three';

/**
 * The `onUpload` callback that drops an attribute's array. Module level on purpose: V8 gives every
 * closure created in one function the same context, so a copy made inside a builder would keep
 * that builder's locals (the 78 MB of pre-merge parts in `farBake`) alive for as long as the
 * geometry lives. Import this one instead of writing a new `function (this) { ... }`.
 */
export const freeArray = function (this: THREE.BufferAttribute) {
  (this as unknown as { array: ArrayLike<number> | null }).array = null;
};

/** Free a geometry's vertex arrays once uploaded (its bounds are computed first, while they exist). */
export function releaseGeometryAfterUpload(g: THREE.BufferGeometry) {
  if (!g.boundingSphere) g.computeBoundingSphere();
  if (!g.boundingBox) g.computeBoundingBox();
  for (const a of Object.values(g.attributes)) {
    const attr = a as THREE.BufferAttribute;
    if (attr.usage === THREE.StaticDrawUsage && attr.array) attr.onUpload(freeArray);
  }
  if (g.index && g.index.usage === THREE.StaticDrawUsage) g.index.onUpload(freeArray);
}

/**
 * Release every static mesh under `root` (see the header). Skinned, morphing and batched meshes
 * keep their arrays (they are edited or read at run time), and so does anything with
 * `userData.keepCpu`. Instanced meshes release their shared shape, never their instance matrices.
 * Returns how many geometries were marked.
 */
export function releaseStaticMeshes(root: THREE.Object3D): number {
  const seen = new Set<THREE.BufferGeometry>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || o.userData.keepCpu) return;
    if ((o as THREE.SkinnedMesh).isSkinnedMesh || (o as unknown as { isBatchedMesh?: boolean }).isBatchedMesh) return;
    const g = mesh.geometry;
    if (!g || seen.has(g) || Object.keys(g.morphAttributes).length) return;
    seen.add(g);
    packNormals(g);
    releaseGeometryAfterUpload(g);
  });
  return seen.size;
}

/**
 * Store a static geometry's normals as normalized bytes (3 B a vertex instead of 12, CPU and GPU
 * alike). The error is under half a degree: invisible on stone. Skipped for dynamic normals and
 * ones already packed.
 */
export function packNormals(g: THREE.BufferGeometry): boolean {
  const n = g.getAttribute('normal') as THREE.BufferAttribute | undefined;
  if (!n || !(n.array instanceof Float32Array) || n.itemSize !== 3 || n.usage !== THREE.StaticDrawUsage || (n as unknown as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute) return false;
  const src = n.array;
  const out = new Int8Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    const x = src[i];
    const y = src[i + 1];
    const z = src[i + 2];
    const l = Math.hypot(x, y, z) || 1;
    out[i] = Math.round((x / l) * 127);
    out[i + 1] = Math.round((y / l) * 127);
    out[i + 2] = Math.round((z / l) * 127);
  }
  g.setAttribute('normal', new THREE.BufferAttribute(out, 3, true));
  return true;
}

/**
 * Free a data texture's pixels once uploaded. `also` runs at the same moment (to drop other
 * references to the same arrays). Every texture object sharing the pixels must get the callback:
 * three.js calls it only on the one that actually uploads.
 */
export function releaseTextureAfterUpload<T extends THREE.Texture>(t: T, also?: () => void): T {
  t.onUpdate = () => {
    const img = t.image as { data?: ArrayBufferView | null } | undefined;
    if (img && 'data' in img) img.data = null;
    also?.();
    t.onUpdate = null;
  };
  return t;
}
