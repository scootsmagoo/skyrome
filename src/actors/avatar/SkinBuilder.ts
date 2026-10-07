/**
 * Accumulates indexed, skinned, vertex-colored geometry for one character.
 *
 * Every vertex carries: position, color (linear RGB), up to 4 bone influences, and a `surf`
 * attribute [roughness, metalness, pattern, emissive] that the shared avatar material
 * (material.ts) reads per vertex. That way a whole character — skin, wool, leather, iron, gilded
 * bronze, glowing torch — renders with ONE material and ONE draw call.
 *
 * Geometry is built in the bind pose (rig.ts). Helpers cover the shapes characters are made of:
 * lofted tubes (limbs, torso, skirts), deformed spheres (heads, caps, helmets) and parametric grids
 * (drapery, cloaks, plates). Normals are computed at the end from the indexed triangles, so parts
 * that share vertices shade smoothly and separate parts keep their own creases.
 */
import * as THREE from 'three';

/** Flat list of [bone, weight, bone, weight, ...]. */
export type Weights = number[];

/** Surface parameters per vertex. pattern: see PATTERN. */
export interface Surf {
  rough: number;
  metal: number;
  pattern: number;
  emissive: number;
}

export const PATTERN = { none: 0, mail: 1, scale: 2, wool: 3, hair: 4, linen: 5, leather: 6, plate: 7, skin: 8 } as const;

export const SURF = {
  skin: { rough: 0.72, metal: 0, pattern: PATTERN.skin, emissive: 0 },
  wool: { rough: 0.95, metal: 0, pattern: PATTERN.wool, emissive: 0 },
  linen: { rough: 0.88, metal: 0, pattern: PATTERN.linen, emissive: 0 },
  leather: { rough: 0.62, metal: 0, pattern: PATTERN.leather, emissive: 0 },
  hair: { rough: 0.55, metal: 0, pattern: PATTERN.hair, emissive: 0 },
  iron: { rough: 0.36, metal: 0.85, pattern: PATTERN.plate, emissive: 0 },
  bronze: { rough: 0.34, metal: 0.9, pattern: PATTERN.plate, emissive: 0 },
  gilded: { rough: 0.28, metal: 1, pattern: PATTERN.none, emissive: 0 },
  mail: { rough: 0.5, metal: 0.8, pattern: PATTERN.mail, emissive: 0 },
  scale: { rough: 0.38, metal: 0.88, pattern: PATTERN.scale, emissive: 0 },
  wood: { rough: 0.7, metal: 0, pattern: PATTERN.leather, emissive: 0 },
  eye: { rough: 0.22, metal: 0, pattern: PATTERN.none, emissive: 0 },
  paint: { rough: 0.7, metal: 0, pattern: PATTERN.none, emissive: 0 },
  glow: { rough: 1, metal: 0, pattern: PATTERN.none, emissive: 1 },
} satisfies Record<string, Surf>;

export interface V {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
  w: Weights;
  s: Surf;
}

/** Callback filling a vertex for grid cell (i, j). */
export type GridFn = (i: number, j: number, v: V) => void;

export class SkinBuilder {
  private pos: number[] = [];
  private col: number[] = [];
  private si: number[] = [];
  private sw: number[] = [];
  private surf: number[] = [];
  private idx: number[] = [];
  private scratch: V = { x: 0, y: 0, z: 0, r: 1, g: 1, b: 1, w: [0, 1], s: SURF.skin };

  get vertexCount() {
    return this.pos.length / 3;
  }
  get triangleCount() {
    return this.idx.length / 3;
  }

  /** Adds a vertex and returns its index. Weights are normalized and reduced to the top 4. */
  vertex(v: V): number {
    const i = this.pos.length / 3;
    this.pos.push(v.x, v.y, v.z);
    this.col.push(v.r, v.g, v.b);
    pushWeights(v.w, this.si, this.sw);
    this.surf.push(v.s.rough, v.s.metal, v.s.pattern / 255, v.s.emissive);
    return i;
  }

  /** Reverse the winding of the most recent n triangles. */
  flipTail(n: number) {
    const I = this.idx;
    for (let k = Math.max(0, I.length - n * 3); k < I.length; k += 3) {
      const t = I[k + 1];
      I[k + 1] = I[k + 2];
      I[k + 2] = t;
    }
  }

  tri(a: number, b: number, c: number) {
    this.idx.push(a, b, c);
  }

  quad(a: number, b: number, c: number, d: number) {
    this.idx.push(a, b, c, a, c, d);
  }

  /**
   * A grid of (cols × rows) vertices filled by `fn(i, j, v)`. With `wrap` the columns close into a
   * ring (no duplicate seam column). Faces are wound so that, for a tube whose columns go
   * counter-clockwise seen from +rows... callers just pass `flip` if a part renders inside out
   * (tests check outward normals for the standard helpers).
   */
  grid(cols: number, rows: number, wrap: boolean, fn: GridFn, flip: boolean | 'auto' = false, inside?: (j: number) => [number, number, number]): number {
    const base = this.vertexCount;
    const v = this.scratch;
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        v.r = v.g = v.b = 1;
        v.s = SURF.skin;
        fn(i, j, v);
        this.vertex(v);
      }
    if (flip === 'auto') flip = this.autoFlip(base, cols, rows, wrap, inside);
    const ci = wrap ? cols : cols - 1;
    for (let j = 0; j < rows - 1; j++)
      for (let i = 0; i < ci; i++) {
        const i2 = (i + 1) % cols;
        const a = base + j * cols + i;
        const b = base + j * cols + i2;
        const c = base + (j + 1) * cols + i2;
        const d = base + (j + 1) * cols + i;
        if (flip) this.quad(a, b, c, d);
        else this.quad(a, d, c, b);
      }
    return base;
  }

  /**
   * Decide the winding of a tube-like grid so faces point away from `inside(j)` (the axis point of
   * row j; defaults to the centroid of the row). Sums the vote over all quads for robustness.
   */
  private autoFlip(base: number, cols: number, rows: number, wrap: boolean, inside?: (j: number) => [number, number, number]): boolean {
    const P = this.pos;
    const px = (k: number) => P[k * 3];
    const py = (k: number) => P[k * 3 + 1];
    const pz = (k: number) => P[k * 3 + 2];
    let vote = 0;
    const ci = wrap ? cols : cols - 1;
    for (let j = 0; j < rows - 1; j++) {
      let cx = 0, cy = 0, cz = 0;
      if (inside) [cx, cy, cz] = inside(j);
      else {
        for (let i = 0; i < cols; i++) {
          const k = base + j * cols + i;
          cx += px(k) / cols;
          cy += py(k) / cols;
          cz += pz(k) / cols;
        }
      }
      for (let i = 0; i < ci; i++) {
        const a = base + j * cols + i;
        const c = base + (j + 1) * cols + ((i + 1) % cols);
        const d = base + (j + 1) * cols + i;
        // Normal of (a, d, c): the default winding.
        const e1x = px(d) - px(a), e1y = py(d) - py(a), e1z = pz(d) - pz(a);
        const e2x = px(c) - px(a), e2y = py(c) - py(a), e2z = pz(c) - pz(a);
        const nx = e1y * e2z - e1z * e2y;
        const ny = e1z * e2x - e1x * e2z;
        const nz = e1x * e2y - e1y * e2x;
        vote += nx * (px(a) - cx) + ny * (py(a) - cy) + nz * (pz(a) - cz);
      }
    }
    return vote < 0;
  }

  /** Close a ring of a grid (row j) with a fan to a new center vertex. Winding follows `outward` (a direction the cap faces). */
  capAuto(base: number, cols: number, row: number, center: V, outward: [number, number, number]) {
    const P = this.pos;
    const a = base + row * cols;
    const b = base + row * cols + 1;
    // Normal of (c, b, a) = (b - c) x (a - c)
    const cx = center.x, cy = center.y, cz = center.z;
    const e1x = P[b * 3] - cx, e1y = P[b * 3 + 1] - cy, e1z = P[b * 3 + 2] - cz;
    const e2x = P[a * 3] - cx, e2y = P[a * 3 + 1] - cy, e2z = P[a * 3 + 2] - cz;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    this.cap(base, cols, row, center, nx * outward[0] + ny * outward[1] + nz * outward[2] < 0);
  }

  /** Close a ring of a grid (row j) with a fan to a new center vertex. */
  cap(base: number, cols: number, row: number, center: V, flip = false) {
    const c = this.vertex(center);
    for (let i = 0; i < cols; i++) {
      const a = base + row * cols + i;
      const b = base + row * cols + ((i + 1) % cols);
      if (flip) this.tri(c, a, b);
      else this.tri(c, b, a);
    }
  }

  /** Append raw triangles from a non-indexed THREE geometry (rigid part bound to one weight set). */
  addGeometry(geo: THREE.BufferGeometry, matrix: THREE.Matrix4 | null, color: THREE.Color | ((p: THREE.Vector3) => THREE.Color), w: Weights, s: Surf) {
    const g = geo.index ? geo : geo;
    const pos = g.getAttribute('position');
    const base = this.vertexCount;
    const p = new THREE.Vector3();
    const v = this.scratch;
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      if (matrix) p.applyMatrix4(matrix);
      const c = typeof color === 'function' ? color(p) : color;
      v.x = p.x;
      v.y = p.y;
      v.z = p.z;
      v.r = c.r;
      v.g = c.g;
      v.b = c.b;
      v.w = w;
      v.s = s;
      this.vertex(v);
    }
    if (g.index) {
      const ix = g.index;
      for (let i = 0; i < ix.count; i += 3) this.tri(base + ix.getX(i), base + ix.getX(i + 1), base + ix.getX(i + 2));
    } else for (let i = 0; i < pos.count; i += 3) this.tri(base + i, base + i + 1, base + i + 2);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    const n = this.vertexCount;
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('skinIndex', new THREE.Uint8BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setAttribute('surf', new THREE.Uint8BufferAttribute(this.surf.map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255)), 4, true));
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeVertexNormals();
    return g;
  }
}

const tmpPairs: [number, number][] = [];
function pushWeights(w: Weights, si: number[], sw: number[]) {
  tmpPairs.length = 0;
  for (let k = 0; k < w.length; k += 2) {
    const bone = w[k];
    const wt = w[k + 1];
    if (!(wt > 0)) continue;
    const ex = tmpPairs.find((p) => p[0] === bone);
    if (ex) ex[1] += wt;
    else tmpPairs.push([bone, wt]);
  }
  if (!tmpPairs.length) tmpPairs.push([0, 1]);
  tmpPairs.sort((a, b) => b[1] - a[1]);
  if (tmpPairs.length > 4) tmpPairs.length = 4;
  let tot = 0;
  for (const p of tmpPairs) tot += p[1];
  for (let k = 0; k < 4; k++) {
    const p = tmpPairs[k];
    si.push(p ? p[0] : 0);
    sw.push(p ? p[1] / tot : 0);
  }
}

/** Blend two weight sets: (1 - t) * a + t * b. */
export function mixW(a: Weights, b: Weights, t: number): Weights {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const out: Weights = [];
  for (let k = 0; k < a.length; k += 2) out.push(a[k], a[k + 1] * (1 - t));
  for (let k = 0; k < b.length; k += 2) out.push(b[k], b[k + 1] * t);
  return out;
}

/** Single-bone weight. */
export const W1 = (bone: number): Weights => [bone, 1];
