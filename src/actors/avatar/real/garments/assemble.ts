/**
 * Assembles the drawable geometry of one body LOD from the morphed template and its painted garments.
 *
 * Two layouts:
 *   split (LOD 0): the cloth group (group 0, avatarMaterial with a coverage cut, see clothMaterial.ts)
 *     then the skin group (group 1, the realistic skin material). The skin group is the whole body
 *     except triangles wholly under cloth. The cloth group holds every triangle that touches a cloth
 *     vertex, on its own copies of the vertices (appended after the template's), pushed out along the
 *     normal by the garment thickness, plus the rigid armour pieces. A per-vertex `cover` (the
 *     cloth/skin indicator, refined at the borders and smoothed over the mesh, see paint.ts) is interpolated across the triangles and the
 *     material discards below 0.5, so a hem is a smooth line through the triangles, not a sawtooth of
 *     whole triangles.
 *   flat (far LODs): one group for avatarMaterial, where skin is just a colour: cloth vertices are
 *     offset in place and colours blend across the borders.
 *
 * The first `count` vertices are always the template's, in order, so per-vertex data computed on
 * the template (correctives, `hide` masks) maps straight on; `source[i - count]` is the template
 * vertex each appended copy came from (-1 for rigid pieces).
 */
import * as THREE from 'three';
import { B } from '../../rig';
import type { BodyPaint } from './paint';

export interface AssembleInput {
  position: Float32Array;
  normal: Float32Array;
  tangent?: Float32Array;
  uv?: Float32Array;
  skinIndex: ArrayLike<number>;
  skinWeight: ArrayLike<number>;
  index: ArrayLike<number>;
  paint: BodyPaint;
  /** Per template vertex: 1 where a shell garment covers the skin. */
  hide?: Uint8Array | null;
  split: boolean;
  /** Rigid armour pieces, belts and lofted garments (a SkinBuilder geometry), appended to the cloth group. */
  rigid?: THREE.BufferGeometry | null;
}

export interface Assembled {
  geometry: THREE.BufferGeometry;
  /** Number of template vertices (they come first). */
  count: number;
  /** Template vertex of each appended copy (-1 for rigid pieces). */
  source: Int32Array;
  split: boolean;
  triangles: number;
}

/** Thinnest cloth layer over the skin (m): keeps the two surfaces apart in the depth buffer. */
const MIN_CLOTH = 0.003;

export function assembleBody(inp: AssembleInput): Assembled {
  const n = inp.position.length / 3;
  const { paint, hide } = inp;
  const I = inp.index;
  const cover = inp.split ? paint.cover ?? null : null;
  const skinTris: number[] = [];
  const clothTris: number[] = [];
  for (let i = 0; i < I.length; i += 3) {
    const a = I[i], b = I[i + 1], c = I[i + 2];
    if (hide && hide[a] + hide[b] + hide[c] >= 2) continue;
    if (cover) {
      const nc = paint.cloth[a] + paint.cloth[b] + paint.cloth[c];
      if (nc > 0) clothTris.push(a, b, c);
      // Wholly under the cloth: the skin there is never seen.
      if (nc === 3 && cover[a] > 0.9 && cover[b] > 0.9 && cover[c] > 0.9) continue;
    }
    skinTris.push(a, b, c);
  }

  // Copies for the cloth triangles (split layout only). A cloth vertex whose triangles agree on the material
  // is shared; at borders (a skin-painted vertex inside a cloth triangle, or two garments meeting) the triangle
  // gets its own three copies, all taking one material (the pattern id is flat per triangle in the shader).
  const copyOf = new Int32Array(n).fill(-1);
  const source: number[] = [];
  const paintFrom: number[] = [];
  const surfFrom: number[] = [];
  const clothIndex: number[] = [];
  const sameSurf = (u: number, w: number) => {
    for (let k = 0; k < 4; k++) if (paint.surf[u * 4 + k] !== paint.surf[w * 4 + k]) return false;
    return true;
  };
  const pv = [0, 0, 0];
  for (let i = 0; i < clothTris.length; i += 3) {
    let donor = -1;
    for (let k = 0; k < 3; k++) if (paint.cloth[clothTris[i + k]]) { donor = clothTris[i + k]; break; }
    let pure = true;
    for (let k = 0; k < 3; k++) {
      const v = clothTris[i + k];
      pv[k] = paint.cloth[v] ? v : donor;
      if (!paint.cloth[v]) pure = false;
    }
    if (pure && sameSurf(pv[0], pv[1]) && sameSurf(pv[0], pv[2])) {
      for (let k = 0; k < 3; k++) {
        const v = clothTris[i + k];
        if (copyOf[v] < 0) {
          copyOf[v] = n + source.length;
          source.push(v);
          paintFrom.push(v);
          surfFrom.push(v);
        }
        clothIndex.push(copyOf[v]);
      }
      continue;
    }
    // The material two of the three agree on, else the first cloth vertex's.
    const m = sameSurf(pv[0], pv[1]) || sameSurf(pv[0], pv[2]) ? pv[0] : sameSurf(pv[1], pv[2]) ? pv[1] : pv[0];
    for (let k = 0; k < 3; k++) {
      clothIndex.push(n + source.length);
      source.push(clothTris[i + k]);
      paintFrom.push(pv[k]);
      surfFrom.push(m);
    }
  }
  const rigid = inp.rigid ?? null;
  const rn = rigid ? rigid.getAttribute('position').count : 0;
  const total = n + source.length + rn;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  const surf = new Uint8Array(total * 4);
  const si = new Uint16Array(total * 4);
  const sw = new Float32Array(total * 4);
  const cov = cover ? new Float32Array(total).fill(1) : null;
  const clv = cover && paint.clavus ? new Float32Array(total * 4) : null;
  const tan = inp.tangent ? new Float32Array(total * 4) : null;
  const uv = inp.uv ? new Float32Array(total * 2) : null;

  // The layer is lifted along a smoothed normal: the sculpt's own normals wobble from vertex to vertex, and a
  // few millimetres of lift along them would show as a ragged contour at every border.
  const welded = weldGroups(inp.position, n);
  const lift = smoothNormals(welded, geometricNormals(inp.position, I, n), I, n);
  const copyVertex = (dst: number, v: number, pv: number, offset: number, sv = pv) => {
    const nx = inp.normal[v * 3], ny = inp.normal[v * 3 + 1], nz = inp.normal[v * 3 + 2];
    const lx = lift[v * 3], ly = lift[v * 3 + 1], lz = lift[v * 3 + 2];
    pos[dst * 3] = inp.position[v * 3] + lx * offset;
    // Soles stay on the ground: no offset into the floor from downward-facing surfaces.
    pos[dst * 3 + 1] = inp.position[v * 3 + 1] + (ly < -0.5 ? 0 : ly * offset);
    pos[dst * 3 + 2] = inp.position[v * 3 + 2] + lz * offset;
    nor[dst * 3] = nx;
    nor[dst * 3 + 1] = ny;
    nor[dst * 3 + 2] = nz;
    col[dst * 3] = paint.color[pv * 3];
    col[dst * 3 + 1] = paint.color[pv * 3 + 1];
    col[dst * 3 + 2] = paint.color[pv * 3 + 2];
    for (let k = 0; k < 4; k++) {
      surf[dst * 4 + k] = paint.surf[sv * 4 + k];
      // Cloth never follows the head: its neckline would swing with every turn of the head (a ragged collar).
      si[dst * 4 + k] = dst >= n && inp.skinIndex[v * 4 + k] === B.head ? B.neck : inp.skinIndex[v * 4 + k];
      sw[dst * 4 + k] = inp.skinWeight[v * 4 + k];
    }
    if (tan && inp.tangent) for (let k = 0; k < 4; k++) tan[dst * 4 + k] = inp.tangent[v * 4 + k];
    if (uv && inp.uv) {
      uv[dst * 2] = inp.uv[v * 2];
      uv[dst * 2 + 1] = inp.uv[v * 2 + 1];
    }
  };
  for (let v = 0; v < n; v++) copyVertex(v, v, v, inp.split ? 0 : paint.cloth[v] ? paint.thick[v] : 0);
  for (let j = 0; j < source.length; j++) {
    const v = source[j];
    const p = paintFrom[j];
    // The layer thins to a lip of MIN_CLOTH at its border: a hem lying on the skin, not a standing wall.
    const full = Math.max(MIN_CLOTH, paint.thick[p]);
    const k = cover ? Math.min(1, Math.max(0, (cover[v] - 0.52) / 0.48)) : 1;
    copyVertex(n + j, v, p, MIN_CLOTH + (full - MIN_CLOTH) * k * k * (3 - 2 * k), surfFrom[j]);
    cov![n + j] = cover![v];
    if (clv) {
      for (let k = 1; k < 4; k++) clv[(n + j) * 4 + k] = paint.clavus![p * 4 + k];
      clv[(n + j) * 4] = inp.position[v * 3];
    }
  }
  if (cover) relitClothNormals(pos, nor, clothIndex, source, n, welded);
  const index: number[] = [];
  const groups: { start: number; count: number; materialIndex: number }[] = [];
  if (cover) {
    for (const v of clothIndex) index.push(v);
    if (rigid) pushRigid(index, rigid, n + source.length);
    groups.push({ start: 0, count: index.length, materialIndex: 1 });
    for (const v of skinTris) index.push(v);
    groups.push({ start: groups[0].count, count: skinTris.length, materialIndex: 0 });
  } else {
    for (const v of skinTris) index.push(v);
    if (rigid) pushRigid(index, rigid, n);
  }
  if (rigid) writeRigid(rigid, n + source.length, { pos, nor, col, surf, si, sw, tan });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('surf', new THREE.BufferAttribute(surf, 4, true));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  if (cov) g.setAttribute('cover', new THREE.BufferAttribute(cov, 1));
  if (clv) g.setAttribute('clavus', new THREE.BufferAttribute(clv, 4));
  if (tan) g.setAttribute('tangent', new THREE.BufferAttribute(tan, 4));
  if (uv) g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(total > 65535 ? new THREE.Uint32BufferAttribute(index, 1) : new THREE.Uint16BufferAttribute(index, 1));
  for (const gr of groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
  const src = new Int32Array(source.length + rn).fill(-1);
  src.set(source);
  return { geometry: g, count: n, source: src, split: !!cover, triangles: index.length / 3 };
}

/** Vertices at the same place (UV seams) share a group. */
export interface Welded {
  group: Int32Array;
  count: number;
}

export function weldGroups(position: ArrayLike<number>, n: number): Welded {
  const group = new Int32Array(n);
  // Numeric keys (exact while every coordinate is within ±3.2 m of the origin, as a body's are), string keys
  // otherwise: the strings were a good part of a LOD build (perf audit 2026-10).
  const keys = new Map<number | string, number>();
  let count = 0;
  for (let v = 0; v < n; v++) {
    const qx = Math.round(position[v * 3] * 2e4), qy = Math.round(position[v * 3 + 1] * 2e4), qz = Math.round(position[v * 3 + 2] * 2e4);
    const key = qx > -65536 && qx < 65536 && qy > -65536 && qy < 65536 && qz > -65536 && qz < 65536 ? ((qx + 65536) * 131072 + (qy + 65536)) * 131072 + (qz + 65536) : `${qx},${qy},${qz}`;
    let g = keys.get(key);
    if (g === undefined) {
      g = count++;
      keys.set(key, g);
    }
    group[v] = g;
  }
  return { group, count };
}

/** Area-weighted normals of the triangles round each vertex (the surface as it is, not as the sculpt shaded it). */
export function geometricNormals(position: ArrayLike<number>, index: ArrayLike<number>, n: number): Float32Array {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i], b = index[i + 1], c = index[i + 2];
    const e1x = position[b * 3] - position[a * 3], e1y = position[b * 3 + 1] - position[a * 3 + 1], e1z = position[b * 3 + 2] - position[a * 3 + 2];
    const e2x = position[c * 3] - position[a * 3], e2y = position[c * 3 + 1] - position[a * 3 + 1], e2z = position[c * 3 + 2] - position[a * 3 + 2];
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    out[a * 3] += nx; out[a * 3 + 1] += ny; out[a * 3 + 2] += nz;
    out[b * 3] += nx; out[b * 3 + 1] += ny; out[b * 3 + 2] += nz;
    out[c * 3] += nx; out[c * 3 + 1] += ny; out[c * 3 + 2] += nz;
  }
  for (let v = 0; v < n; v++) {
    const x = out[v * 3], y = out[v * 3 + 1], z = out[v * 3 + 2];
    const l = Math.sqrt(x * x + y * y + z * z) || 1; // not Math.hypot: it allocates
    out[v * 3] /= l;
    out[v * 3 + 1] /= l;
    out[v * 3 + 2] /= l;
  }
  return out;
}

/**
 * Vertex normals averaged with their neighbours' (two passes) and renormalised. Welded vertices keep one
 * normal, so a layer lifted along it never cracks open at a UV seam.
 */
export function smoothNormals(w: Welded, normal: ArrayLike<number>, index: ArrayLike<number>, n: number): Float32Array {
  const { group, count: ng } = w;
  let cur = new Float32Array(ng * 3);
  for (let v = 0; v < n; v++) for (let c = 0; c < 3; c++) cur[group[v] * 3 + c] += normal[v * 3 + c];
  for (let pass = 0; pass < 2; pass++) {
    const acc = Float32Array.from(cur);
    for (let i = 0; i < index.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const a = group[index[i + k]];
        const b = group[index[i + ((k + 1) % 3)]];
        if (a === b) continue;
        for (let c = 0; c < 3; c++) {
          acc[a * 3 + c] += cur[b * 3 + c] * 0.5;
          acc[b * 3 + c] += cur[a * 3 + c] * 0.5;
        }
      }
    }
    for (let g = 0; g < ng; g++) {
      const x = acc[g * 3], y = acc[g * 3 + 1], z = acc[g * 3 + 2];
      const l = Math.sqrt(x * x + y * y + z * z) || 1;
      acc[g * 3] /= l;
      acc[g * 3 + 1] /= l;
      acc[g * 3 + 2] /= l;
    }
    cur = acc;
  }
  const out = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) for (let c = 0; c < 3; c++) out[v * 3 + c] = cur[group[v] * 3 + c];
  return out;
}

/**
 * Light the cloth copies from the surface they now form: each copy's normal becomes half the sculpt's, half the
 * area-weighted normal of the displaced triangles around its (welded) source vertex, so folds painted as layer
 * thickness (detail.ts) shade as folds.
 */
export function relitClothNormals(pos: Float32Array, nor: Float32Array, tris: ArrayLike<number>, source: ArrayLike<number>, base: number, w: Welded) {
  const acc = new Float32Array(w.count * 3);
  const g = (i: number) => w.group[source[i - base]];
  for (let i = 0; i < tris.length; i += 3) {
    const a = tris[i], b = tris[i + 1], c = tris[i + 2];
    if (a < base || b < base || c < base) continue;
    const e1x = pos[b * 3] - pos[a * 3], e1y = pos[b * 3 + 1] - pos[a * 3 + 1], e1z = pos[b * 3 + 2] - pos[a * 3 + 2];
    const e2x = pos[c * 3] - pos[a * 3], e2y = pos[c * 3 + 1] - pos[a * 3 + 1], e2z = pos[c * 3 + 2] - pos[a * 3 + 2];
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const ka = g(a) * 3, kb = g(b) * 3, kc = g(c) * 3;
    acc[ka] += nx; acc[ka + 1] += ny; acc[ka + 2] += nz;
    acc[kb] += nx; acc[kb + 1] += ny; acc[kb + 2] += nz;
    acc[kc] += nx; acc[kc + 1] += ny; acc[kc + 2] += nz;
  }
  for (let j = 0; j < source.length; j++) {
    const v = base + j;
    const k = w.group[source[j]] * 3;
    const l = Math.sqrt(acc[k] * acc[k] + acc[k + 1] * acc[k + 1] + acc[k + 2] * acc[k + 2]);
    if (l < 1e-12) continue;
    let x = nor[v * 3] * 0.5 + (acc[k] / l) * 0.5;
    let y = nor[v * 3 + 1] * 0.5 + (acc[k + 1] / l) * 0.5;
    let z = nor[v * 3 + 2] * 0.5 + (acc[k + 2] / l) * 0.5;
    const m = Math.sqrt(x * x + y * y + z * z) || 1;
    x /= m;
    y /= m;
    z /= m;
    nor[v * 3] = x;
    nor[v * 3 + 1] = y;
    nor[v * 3 + 2] = z;
  }
}

function pushRigid(index: number[], rigid: THREE.BufferGeometry, base: number) {
  const ix = rigid.index!;
  for (let i = 0; i < ix.count; i++) index.push(base + ix.getX(i));
}

function writeRigid(
  rigid: THREE.BufferGeometry,
  base: number,
  o: { pos: Float32Array; nor: Float32Array; col: Float32Array; surf: Uint8Array; si: Uint16Array; sw: Float32Array; tan: Float32Array | null },
) {
  const p = rigid.getAttribute('position');
  const nr = rigid.getAttribute('normal');
  const c = rigid.getAttribute('color');
  const s = rigid.getAttribute('surf');
  const i4 = rigid.getAttribute('skinIndex');
  const w4 = rigid.getAttribute('skinWeight');
  for (let v = 0; v < p.count; v++) {
    const d = base + v;
    o.pos[d * 3] = p.getX(v);
    o.pos[d * 3 + 1] = p.getY(v);
    o.pos[d * 3 + 2] = p.getZ(v);
    o.nor[d * 3] = nr.getX(v);
    o.nor[d * 3 + 1] = nr.getY(v);
    o.nor[d * 3 + 2] = nr.getZ(v);
    o.col[d * 3] = c.getX(v);
    o.col[d * 3 + 1] = c.getY(v);
    o.col[d * 3 + 2] = c.getZ(v);
    for (let k = 0; k < 4; k++) {
      // The attribute is normalized: getComponent gives 0..1, the target stores bytes.
      o.surf[d * 4 + k] = Math.round(s.getComponent(v, k) * 255);
      o.si[d * 4 + k] = i4.getComponent(v, k);
      o.sw[d * 4 + k] = w4.getComponent(v, k);
    }
    if (o.tan) {
      o.tan[d * 4] = 1;
      o.tan[d * 4 + 3] = 1;
    }
  }
}
