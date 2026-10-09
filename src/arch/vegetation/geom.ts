/**
 * Geometry toolkit for plants: value noise, tapered tubes for trunks and limbs, lumpy foliage
 * clumps, and merging with baked vertex colours (ambient occlusion: darker inside and underneath).
 * All outputs are non-indexed BufferGeometries with position / normal / color / uv.
 */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { boxProjectUVs } from '../../gfx/uv';

// ------------------------------------------------------------------ noise

function hash3(x: number, y: number, z: number, seed: number): number {
  let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth 3D value noise in [0, 1). */
export function noise3(x: number, y: number, z: number, seed = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz, seed);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}

/** 2D fractal noise in [0, 1) (two octaves). */
export function fbm2(x: number, z: number, seed = 0): number {
  return noise3(x, 0.5, z, seed) * 0.65 + noise3(x * 2.1, 3.7, z * 2.1, seed + 17) * 0.35;
}

// ------------------------------------------------------------------ tubes

/**
 * A tube through `path` with per-point radii (rings oriented by parallel transport). Open ends.
 * `shade(t)` returns the vertex colour brightness along the tube (0 = start).
 */
export function taperedTube(path: THREE.Vector3[], radii: number[], radial = 6, shade: (t: number) => number = () => 1, wobble = 0, seed = 0): THREE.BufferGeometry {
  const n = path.length;
  const pos: number[] = [], col: number[] = [];
  const tangents: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)];
    tangents.push(b.clone().sub(a).normalize());
  }
  let normal = new THREE.Vector3(1, 0, 0);
  if (Math.abs(tangents[0].x) > 0.9) normal.set(0, 0, 1);
  normal = normal.sub(tangents[0].clone().multiplyScalar(normal.dot(tangents[0]))).normalize();
  const rings: THREE.Vector3[][] = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const axis = new THREE.Vector3().crossVectors(tangents[i - 1], tangents[i]);
      const s = axis.length();
      if (s > 1e-6) normal.applyAxisAngle(axis.normalize(), Math.asin(Math.min(1, s)));
    }
    const bin = new THREE.Vector3().crossVectors(tangents[i], normal).normalize();
    const ring: THREE.Vector3[] = [];
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      const r = radii[i] * (1 + (wobble ? (noise3(i * 0.9, k * 0.7, seed) - 0.5) * wobble : 0));
      ring.push(path[i].clone().addScaledVector(normal, Math.cos(a) * r).addScaledVector(bin, Math.sin(a) * r));
    }
    rings.push(ring);
  }
  for (let i = 0; i < n - 1; i++) {
    const c0 = shade(i / (n - 1)), c1 = shade((i + 1) / (n - 1));
    for (let k = 0; k < radial; k++) {
      const k1 = (k + 1) % radial;
      const a = rings[i][k], b = rings[i][k1], c = rings[i + 1][k1], d = rings[i + 1][k];
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
      col.push(c0, c0, c0, c0, c0, c0, c1, c1, c1, c0, c0, c0, c1, c1, c1, c1, c1, c1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  // Smooth normals around the tube.
  const ig = mergeVertices(g, 1e-4);
  ig.computeVertexNormals();
  const out = ig.toNonIndexed();
  return out;
}

// ------------------------------------------------------------------ foliage clumps

const icoCache = new Map<number, THREE.BufferGeometry>();
function ico(detail: number) {
  let g = icoCache.get(detail);
  if (!g) {
    g = mergeVertices(new THREE.IcosahedronGeometry(1, detail).deleteAttribute('normal').deleteAttribute('uv'));
    icoCache.set(detail, g);
  }
  return g;
}

export interface ClumpSpec {
  center: THREE.Vector3;
  radius: THREE.Vector3;
  detail?: number;
  /** Lumpiness (0..0.5). */
  rough?: number;
  /** Flatten the underside below this fraction of the radius (-1 = none). */
  flatBottom?: number;
  seed?: number;
}

/**
 * Lumpy ellipsoid. Normals point outward from `canopyCenter` blended with the clump's own normals,
 * which gives the soft, rounded shading of a tree crown. Colours: darker underneath and inside.
 */
export function clump(s: ClumpSpec, canopyCenter: THREE.Vector3, canopyRadius: THREE.Vector3, tint: [number, number, number] = [1, 1, 1]): THREE.BufferGeometry {
  const base = ico(s.detail ?? 1).clone();
  const pos = base.getAttribute('position') as THREE.BufferAttribute;
  const rough = s.rough ?? 0.28;
  const seed = s.seed ?? 0;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const n = noise3(p.x * 1.7 + seed * 0.37, p.y * 1.7, p.z * 1.7, seed);
    const k = 1 + (n - 0.5) * 2 * rough;
    p.multiplyScalar(k);
    if (s.flatBottom !== undefined && s.flatBottom > -1 && p.y < s.flatBottom) p.y = s.flatBottom + (p.y - s.flatBottom) * 0.3;
    p.multiply(s.radius).add(s.center);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  base.computeVertexNormals();
  const nor = base.getAttribute('normal') as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const cn = new THREE.Vector3(), q = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    q.copy(p).sub(canopyCenter).divide(canopyRadius);
    cn.copy(q).normalize();
    const own = new THREE.Vector3().fromBufferAttribute(nor, i);
    const blended = own.multiplyScalar(0.45).addScaledVector(cn, 0.55).normalize();
    nor.setXYZ(i, blended.x, blended.y, blended.z);
    // AO: height within the crown and distance from its core.
    const h = THREE.MathUtils.clamp(q.y * 0.5 + 0.5, 0, 1);
    const outer = THREE.MathUtils.clamp(q.length(), 0, 1);
    const ao = 0.42 + 0.5 * h * h + 0.2 * outer;
    const jitter = 0.94 + noise3(p.x * 3.1, p.y * 3.1, p.z * 3.1, seed + 9) * 0.12;
    col[i * 3] = ao * jitter * tint[0];
    col[i * 3 + 1] = ao * jitter * tint[1];
    col[i * 3 + 2] = ao * jitter * tint[2];
  }
  base.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return base.toNonIndexed();
}

/** Merge parts (all must have position/normal/color) and add world-scale box UVs. */
export function mergeParts(parts: THREE.BufferGeometry[], uvScale = 1.5): THREE.BufferGeometry {
  const clean = parts.map((g) => {
    const c = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(c.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'color' && name !== 'aHead') c.deleteAttribute(name);
    if (!c.getAttribute('color')) {
      const col = new Float32Array(c.getAttribute('position').count * 3).fill(1);
      c.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    return c;
  });
  const merged = mergeGeometries(clean, false)!;
  // boxProjectUVs reads normals per triangle; it keeps existing attributes.
  const withUv = boxProjectUVs(merged, uvScale);
  withUv.computeBoundingSphere();
  withUv.computeBoundingBox();
  return withUv;
}

/**
 * Append a reversed copy of every triangle with the SAME normals, so thin blades render from both
 * sides with FrontSide materials (DoubleSide would flip the normal on back faces and turn them black).
 */
export function twoSided(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(src.attributes)) {
    const a = src.getAttribute(name) as THREE.BufferAttribute;
    const n = a.count, s = a.itemSize;
    const arr = new Float32Array(n * 2 * s);
    arr.set(a.array as Float32Array, 0);
    for (let t = 0; t < n; t += 3) {
      for (const [dst, from] of [[0, 0], [1, 2], [2, 1]]) {
        for (let k = 0; k < s; k++) arr[(n + t + dst) * s + k] = a.array[(t + from) * s + k];
      }
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, s));
  }
  return out;
}

/** Scale an existing colour attribute (tint a part). */
export function tintGeometry(g: THREE.BufferGeometry, r: number, gg: number, b: number) {
  const c = g.getAttribute('color') as THREE.BufferAttribute;
  for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * r, c.getY(i) * gg, c.getZ(i) * b);
  return g;
}

// ------------------------------------------------------------------ leaf cards

export interface CardSpec {
  center: THREE.Vector3;
  radius: THREE.Vector3;
}

export interface CardOpts {
  /** Cards per m² of the clump's ellipsoid surface. */
  density: number;
  /** Card width range (m); the height is a little more. */
  size: [number, number];
  /** Surface offset range as a fraction of the clump radius (1 = on the surface). */
  reach?: [number, number];
  /** 0..1: pull card directions toward the upper hemisphere (flat mats such as the pine's). */
  upBias?: number;
  tint?: [number, number, number];
}

/**
 * Leaf cards: small quads standing on a clump's surface (tilted and rolled at random), carrying
 * `uv` (0..1, the stem end at v = 0) and `aLeaf` (a per-card random for the shader's leaf pattern
 * and tint). Normals are the soft crown normals (the clump's outward blended with the crown's
 * outward and a lift), so the shell reads as one lit mass and not as flat cards. Vertex colours are
 * the same baked crown AO as `clump`. Non-indexed, six vertices a card, counter-clockwise seen from
 * the card's own face; use DoubleSide.
 */
export function leafCards(specs: CardSpec[], canopyCenter: THREE.Vector3, canopyRadius: THREE.Vector3, o: CardOpts, seed = 1): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], col: number[] = [], uv: number[] = [], leaf: number[] = [];
  const tint = o.tint ?? [1, 1, 1];
  const [r0, r1] = o.reach ?? [0.92, 1.12];
  let s32 = (seed * 2654435761) >>> 0;
  const rng = () => ((s32 = (Math.imul(s32, 1664525) + 1013904223) >>> 0) / 4294967296);
  const dir = new THREE.Vector3(), p = new THREE.Vector3(), n = new THREE.Vector3(), cn = new THREE.Vector3(), q = new THREE.Vector3();
  const nn = new THREE.Vector3(), tt = new THREE.Vector3(), bb = new THREE.Vector3(), ax = new THREE.Vector3();
  const CORNERS: [number, number][] = [[-1, 0], [1, 0], [1, 1], [-1, 0], [1, 1], [-1, 1]];
  for (const s of specs) {
    // Knud Thomsen's approximation of an ellipsoid's surface area.
    const a = s.radius.x, b = s.radius.y, c = s.radius.z;
    const area = 4 * Math.PI * Math.pow((Math.pow(a * b, 1.6) + Math.pow(a * c, 1.6) + Math.pow(b * c, 1.6)) / 3, 1 / 1.6);
    const count = Math.max(3, Math.round(area * o.density));
    for (let i = 0; i < count; i++) {
      dir.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1);
      const l2 = dir.lengthSq();
      if (l2 > 1 || l2 < 1e-3) { i--; continue; }
      dir.normalize();
      if (o.upBias) dir.y = dir.y * (1 - o.upBias) + o.upBias * Math.abs(dir.y);
      dir.normalize();
      // The underside is in deep shade and seen least: it gets fewer cards.
      if (dir.y < -0.35 && rng() < 0.65) continue;
      p.copy(dir).multiply(s.radius).multiplyScalar(r0 + (r1 - r0) * rng()).add(s.center);
      // Soft normal: the clump's outward, the crown's outward, and a lift.
      n.copy(dir).divide(s.radius).normalize();
      cn.copy(p).sub(canopyCenter).divide(canopyRadius).normalize();
      n.multiplyScalar(0.4).addScaledVector(cn, 0.45);
      n.y += 0.25;
      n.normalize();
      // The card's own plane: the surface normal, tilted at random, then a random roll about it.
      nn.copy(n);
      nn.x += (rng() - 0.5) * 0.9;
      nn.y += (rng() - 0.5) * 0.9;
      nn.z += (rng() - 0.5) * 0.9;
      nn.normalize();
      ax.set(Math.abs(nn.y) < 0.9 ? 0 : 1, Math.abs(nn.y) < 0.9 ? 1 : 0, 0);
      tt.crossVectors(ax, nn).normalize();
      bb.crossVectors(nn, tt);
      const roll = rng() * Math.PI * 2, cr = Math.cos(roll), sr = Math.sin(roll);
      const tx = tt.x * cr + bb.x * sr, ty = tt.y * cr + bb.y * sr, tz = tt.z * cr + bb.z * sr;
      const bx = nn.y * tz - nn.z * ty, by = nn.z * tx - nn.x * tz, bz = nn.x * ty - nn.y * tx;
      const w = (o.size[0] + (o.size[1] - o.size[0]) * rng()) * 0.5;
      const h = w * (2.1 + rng() * 0.4);
      // AO from the position in the crown (as `clump`).
      q.copy(p).sub(canopyCenter).divide(canopyRadius);
      const hy = THREE.MathUtils.clamp(q.y * 0.5 + 0.5, 0, 1);
      const outer = THREE.MathUtils.clamp(q.length(), 0, 1);
      const ao = (0.42 + 0.5 * hy * hy + 0.2 * outer) * (0.9 + rng() * 0.2);
      const leafId = rng();
      // The stem end (v = 0) sits a little behind the point, the tip points along (bx, by, bz).
      for (const [cx, cy] of CORNERS) {
        const along = cy * h - h * 0.25;
        pos.push(p.x + tx * cx * w + bx * along, p.y + ty * cx * w + by * along, p.z + tz * cx * w + bz * along);
        nor.push(n.x, n.y, n.z);
        col.push(ao * tint[0], ao * tint[1], ao * tint[2]);
        uv.push((cx + 1) * 0.5, cy);
        leaf.push(leafId);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aLeaf', new THREE.Float32BufferAttribute(leaf, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}
