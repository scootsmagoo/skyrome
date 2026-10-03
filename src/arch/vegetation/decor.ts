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

function leafClump(x: number, y: number, z: number, sx: number, sy: number, sz: number, seed: number): THREE.BufferGeometry {
  const g = leafBase.clone();
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

/** Clipped box hedge from (x0, z0) to (x1, z1), height h, slightly lumpy. */
export function hedge(d: Draw, x0: number, z0: number, x1: number, z1: number, h: number, seed = 1) {
  const w = Math.abs(x1 - x0), l = Math.abs(z1 - z0);
  const g = new THREE.BoxGeometry(w, h, l, Math.max(1, Math.round(w * 2)), 2, Math.max(1, Math.round(l * 2)));
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = (noise3(x * 2.3, y * 2.3, z * 2.3, seed) - 0.5) * 0.08;
    p.setXYZ(i, x * (1 + k / Math.max(0.3, w)), y + (y > 0 ? k : 0), z * (1 + k / Math.max(0.3, l)));
  }
  g.computeVertexNormals();
  d.geo(g, 'foliage_broad', (x0 + x1) / 2, h / 2, (z0 + z1) / 2, { uvScale: 1 });
}
