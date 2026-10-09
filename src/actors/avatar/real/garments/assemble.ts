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
  const tan = inp.tangent ? new Float32Array(total * 4) : null;
  const uv = inp.uv ? new Float32Array(total * 2) : null;

  const copyVertex = (dst: number, v: number, pv: number, offset: number, sv = pv) => {
    const nx = inp.normal[v * 3], ny = inp.normal[v * 3 + 1], nz = inp.normal[v * 3 + 2];
    pos[dst * 3] = inp.position[v * 3] + nx * offset;
    // Soles stay on the ground: no offset into the floor from downward-facing surfaces.
    pos[dst * 3 + 1] = inp.position[v * 3 + 1] + (ny < -0.5 ? 0 : ny * offset);
    pos[dst * 3 + 2] = inp.position[v * 3 + 2] + nz * offset;
    nor[dst * 3] = nx;
    nor[dst * 3 + 1] = ny;
    nor[dst * 3 + 2] = nz;
    col[dst * 3] = paint.color[pv * 3];
    col[dst * 3 + 1] = paint.color[pv * 3 + 1];
    col[dst * 3 + 2] = paint.color[pv * 3 + 2];
    for (let k = 0; k < 4; k++) {
      surf[dst * 4 + k] = paint.surf[sv * 4 + k];
      si[dst * 4 + k] = inp.skinIndex[v * 4 + k];
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
    copyVertex(n + j, v, p, Math.max(MIN_CLOTH, paint.thick[p]), surfFrom[j]);
    cov![n + j] = cover![v];
  }
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
  if (tan) g.setAttribute('tangent', new THREE.BufferAttribute(tan, 4));
  if (uv) g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(total > 65535 ? new THREE.Uint32BufferAttribute(index, 1) : new THREE.Uint16BufferAttribute(index, 1));
  for (const gr of groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
  const src = new Int32Array(source.length + rn).fill(-1);
  src.set(source);
  return { geometry: g, count: n, source: src, split: !!cover, triangles: index.length / 3 };
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
