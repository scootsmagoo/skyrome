/**
 * Spatial chunking of a landmark's big meshes. A builder merges everything of one material into
 * one mesh, so a sprawling complex like a forum is a handful of meshes with bounding spheres 100 m
 * across: the frustum test passes them all whenever any corner is in view, and the shadow pass
 * (a 100 m box) draws them whole too. Split into ~30 m cells, each piece is culled on its own. As
 * instances of one batch (landmarkBatch.ts) the pieces cost no extra draw calls.
 */
import * as THREE from 'three';

/** Only meshes whose bounding sphere is wider than this (m) are split. */
export const CHUNK_MIN_RADIUS = 30;
/** Cell size (m) in the mesh's local x/z. */
export const CHUNK_CELL = 30;
/** A plain mesh needs this many triangles to be worth splitting. */
export const CHUNK_MIN_TRIANGLES = 6000;

/**
 * The triangles of `src` grouped by the cell of their centroid, as one non-indexed geometry per
 * cell (every attribute copied), or null when everything falls in one cell.
 */
export function splitByCells(src: THREE.BufferGeometry, cell = CHUNK_CELL): THREE.BufferGeometry[] | null {
  const pos = src.getAttribute('position') as THREE.BufferAttribute;
  if (!(pos.array as ArrayLike<number> | null)) return null;
  const names = Object.keys(src.attributes);
  const attrs = names.map((n) => src.getAttribute(n) as THREE.BufferAttribute);
  if (attrs.some((a) => !(a.array as ArrayLike<number> | null) || (a as unknown as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute)) return null;
  const index = src.index?.array as ArrayLike<number> | null | undefined;
  const tris = (index ? index.length : pos.count) / 3;
  const at = (t: number) => (index ? index[t] : t);
  const buckets = new Map<string, number[]>();
  for (let t = 0; t < tris; t++) {
    const a = at(t * 3);
    const b = at(t * 3 + 1);
    const c = at(t * 3 + 2);
    const x = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;
    const z = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
    const k = `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
    const list = buckets.get(k);
    if (list) list.push(t);
    else buckets.set(k, [t]);
  }
  if (buckets.size < 2) return null;
  const out: THREE.BufferGeometry[] = [];
  for (const list of buckets.values()) {
    const geo = new THREE.BufferGeometry();
    const verts = list.length * 3;
    attrs.forEach((a, ai) => {
      const Ctor = a.array.constructor as new (n: number) => THREE.TypedArray;
      const dst = new Ctor(verts * a.itemSize);
      let o = 0;
      for (const t of list) {
        for (let k = 0; k < 3; k++) {
          const v = at(t * 3 + k) * a.itemSize;
          for (let j = 0; j < a.itemSize; j++) dst[o++] = a.array[v + j];
        }
      }
      geo.setAttribute(names[ai], new THREE.BufferAttribute(dst, a.itemSize, a.normalized));
    });
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    out.push(geo);
  }
  return out;
}
