/**
 * Static greenery that merges into city-block MeshBuilders (no wind, plain material ids): ivy
 * patches climbing walls, vine canopies over pergolas with hanging grapes, and clipped box hedges.
 */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Rng } from '../../core/Rng';
import type { Draw } from '../fabric/draw';
import { noise3 } from './geom';

const leafBase = mergeVertices(new THREE.IcosahedronGeometry(1, 0).deleteAttribute('normal').deleteAttribute('uv'));
/** Cheaper lumps for long hedges (8 triangles instead of 20). */
const leafBaseLow = mergeVertices(new THREE.OctahedronGeometry(1, 0).deleteAttribute('normal').deleteAttribute('uv'));

function leafClump(x: number, y: number, z: number, sx: number, sy: number, sz: number, seed: number, low = false): THREE.BufferGeometry {
  const g = (low ? leafBaseLow : leafBase).clone();
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const k = 0.8 + noise3(p.getX(i) * 2 + seed, p.getY(i) * 2, p.getZ(i) * 2, seed) * 0.45;
    p.setXYZ(i, x + p.getX(i) * sx * k, y + p.getY(i) * sy * k, z + p.getZ(i) * sz * k);
  }
  g.computeVertexNormals();
  return g.toNonIndexed();
}

/**
 * Ivy on a wall face (wall frame: face at z = 0, outside −z): a patch `w` wide rising from `y0`
 * to about `h`, densest at the bottom with a ragged top and trailing tendrils.
 */
export function ivy(d: Draw, x0: number, w: number, y0: number, h: number, rng: Rng) {
  const parts: THREE.BufferGeometry[] = [];
  const n = Math.round(w * h * 7);
  for (let i = 0; i < n; i++) {
    const x = x0 + rng.next() * w;
    const edge = h * (0.55 + 0.45 * noise3(x * 0.8, 0, 0, 7));
    const y = y0 + Math.pow(rng.next(), 1.6) * edge;
    const s = rng.range(0.14, 0.3);
    parts.push(leafClump(x, y, -s * 0.35, s, s * 0.9, s * 0.45, i));
  }
  if (!parts.length) return;
  d.geo(mergeGeometries(parts, false)!, 'foliage_cypress', 0, 0, 0, { uvScale: 1, shadow: false });
}

/** Vine canopy over a pergola top (centred, at height y) with hanging grape bunches. */
export function vineCanopy(d: Draw, w: number, l: number, y: number, rng: Rng) {
  const parts: THREE.BufferGeometry[] = [];
  const n = Math.round(w * l * 1.6);
  for (let i = 0; i < n; i++) {
    const x = rng.range(-w / 2, w / 2), z = rng.range(-l / 2, l / 2);
    const s = rng.range(0.35, 0.7);
    parts.push(leafClump(x, y + 0.12 + rng.range(-0.05, 0.12), z, s, s * 0.45, s, i));
    if (rng.chance(0.18)) parts.push(leafClump(x, y - 0.3, z, s * 0.5, s * 0.7, s * 0.5, i + 7));
  }
  d.geo(mergeGeometries(parts, false)!, 'foliage_broad', 0, 0, 0, { uvScale: 1 });
  for (let i = 0; i < Math.round(w * l * 0.25); i++) {
    const x = rng.range(-w / 2 + 0.3, w / 2 - 0.3), z = rng.range(-l / 2 + 0.3, l / 2 - 0.3);
    d.ellipsoid('fabric_purple', x, y - 0.25, z, 0.07, 0.13, 0.07, { seg: [6, 5], shadow: false });
  }
}

/**
 * Clipped box hedge from (x0, z0) to (x1, z1), height h: a dark core wrapped in a skin of small
 * leaf lumps (about 25 cm, jittered) laid over its top, sides and ends, so the silhouette and the
 * shading read as clipped foliage instead of one lumpy block.
 */
export function hedge(d: Draw, x0: number, z0: number, x1: number, z1: number, h: number, seed = 1) {
  const w = Math.abs(x1 - x0), l = Math.abs(z1 - z0);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  let s32 = (Math.imul(seed + 7, 2654435761) >>> 0) || 1;
  const rnd = () => ((s32 = (Math.imul(s32, 1664525) + 1013904223) >>> 0) / 4294967296);
  const parts: THREE.BufferGeometry[] = [];
  const core = new THREE.BoxGeometry(Math.max(0.1, w - 0.28), h * 0.82, Math.max(0.1, l - 0.28));
  core.translate(cx, h * 0.41, cz);
  parts.push(core);
  // About 25 cm lumps on a short hedge; a long one gets bigger lumps so it stays near 60 of
  // them (8 triangles each): the landmark builders have triangle budgets.
  const area = 2 * h * (w + l) + w * l;
  const step = Math.max(0.26, Math.sqrt(area / 60));
  const lump = (x: number, y: number, z: number) => {
    const r = step * (0.62 + rnd() * 0.3);
    parts.push(leafClump(x, y, z, r, r * (0.8 + rnd() * 0.2), r, Math.floor(rnd() * 999), true));
  };
  const nx = Math.max(1, Math.round(w / step)), nz = Math.max(1, Math.round(l / step)), ny = Math.max(1, Math.round(h / step));
  // Top (slightly domed), sides along x, ends along z.
  for (let i = 0; i <= nx; i++) for (let k = 0; k <= nz; k++) {
    const u = i / nx - 0.5, v = k / nz - 0.5;
    lump(cx + u * (w - 0.12) + (rnd() - 0.5) * 0.08, h - 0.1 + rnd() * 0.05, cz + v * (l - 0.12) + (rnd() - 0.5) * 0.08);
  }
  for (let j = 0; j < ny; j++) {
    const y = 0.08 + (j + 0.5) * ((h - 0.18) / ny);
    for (let i = 0; i <= nx; i++) {
      const x = cx + (i / nx - 0.5) * (w - 0.12);
      lump(x + (rnd() - 0.5) * 0.08, y, z0 < z1 ? z0 + 0.1 : z1 + 0.1);
      lump(x + (rnd() - 0.5) * 0.08, y, z0 < z1 ? z1 - 0.1 : z0 - 0.1);
    }
    for (let k = 1; k < nz; k++) {
      const z = cz + (k / nz - 0.5) * (l - 0.12);
      lump(x0 < x1 ? x0 + 0.1 : x1 + 0.1, y, z + (rnd() - 0.5) * 0.08);
      lump(x0 < x1 ? x1 - 0.1 : x0 - 0.1, y, z + (rnd() - 0.5) * 0.08);
    }
  }
  d.geo(mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { g.deleteAttribute('uv'); return g; }), false)!, 'foliage_broad', 0, 0, 0, { uvScale: 1 });
}
