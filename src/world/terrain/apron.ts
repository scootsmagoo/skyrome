/**
 * The land beyond the modelled city: a coarse ring of terrain around the heightmap grid, sampled
 * from the same atlas landform (hills, lowlands, the Tiber's valley up to the Mulvian bridge and
 * down toward Ostia), so views from the Janiculum or the Pincian end in fields and haze instead
 * of a cut edge. One mesh, vertex-coloured in the terrain's far-field palette, no colliders.
 * Inside the grid the ring dips under the real terrain (whose skirts hide the seam).
 */
import * as THREE from 'three';
import { WORLD_SCALE } from '../coords';
import type { Heightmap } from './heightmap';
import { GROUND_PALETTE } from './groundTextures';
import { chain, footOn, indexSegments, nearSegments } from './riverbanks';

export interface ApronOptions {
  /** How far (game m) the ring reaches beyond the grid. Default 4500. */
  extent?: number;
  /** Cell size (game m). Default 75. */
  cell?: number;
}

const hash = (x: number, z: number) => {
  let n = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
function vnoise(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * A height function (game m) for anywhere: the heightmap inside the grid, `naturalReal` (real m
 * in, m ASL out) outside it.
 */
export function farHeight(hm: Heightmap, naturalReal: (x: number, z: number) => number, S = WORLD_SCALE) {
  return (x: number, z: number): number => {
    if (x >= hm.minX && x <= hm.maxX && z >= hm.minZ && z <= hm.maxZ) return hm.heightAt(x, z);
    return naturalReal(x / S, z / S) * S;
  };
}

export function buildApron(hm: Heightmap, height: (x: number, z: number) => number, waterY: number, opts: ApronOptions = {}): THREE.Mesh {
  const ext = opts.extent ?? 4500;
  const cell = opts.cell ?? 75;
  const x0 = hm.minX - ext, z0 = hm.minZ - ext;
  const nx = Math.ceil((hm.maxX - hm.minX + 2 * ext) / cell) + 1;
  const nz = Math.ceil((hm.maxZ - hm.minZ + 2 * ext) / cell) + 1;
  const pos = new Float32Array(nx * nz * 3);
  const col = new Float32Array(nx * nz * 3);
  const grass = new THREE.Color(GROUND_PALETTE.grass!), dry = new THREE.Color(GROUND_PALETTE.dry_grass!);
  const dirt = new THREE.Color(GROUND_PALETTE.dirt!), mud = new THREE.Color(GROUND_PALETTE.mud!), rock = new THREE.Color(GROUND_PALETTE.rock!);
  const c = new THREE.Color();
  const inside = (x: number, z: number, m = 0) => x > hm.minX + m && x < hm.maxX - m && z > hm.minZ + m && z < hm.maxZ - m;
  const H = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) H[j * nx + i] = height(x0 + i * cell, z0 + j * cell);
  // At this cell size a river would be bridged over by the triangles: sink every vertex within a
  // cell of the channel below the water, so the river (drawn by the water module) stays visible.
  const S = WORLD_SCALE;
  for (const r of hm.features?.rivers ?? []) {
    const pts = r.centerline.map((p) => [p[0] * S, p[1] * S] as const);
    const line = chain(pts);
    const maxHalf = (Math.max(...r.width) / 2) * S;
    const idx = indexSegments(pts, maxHalf + cell, cell * 2);
    const level = r.waterLevel * S;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = x0 + i * cell, z = z0 + j * cell;
        if (inside(x, z, -cell)) continue;
        const segs = nearSegments(idx, x, z);
        if (!segs) continue;
        const f = footOn(line, x, z, segs);
        const w0 = r.width[f.i] ?? r.width[r.width.length - 1], w1 = r.width[f.i + 1] ?? w0;
        const half = ((w0 + (w1 - w0) * f.t) / 2) * S;
        if (f.d < half + cell * 0.7) H[j * nx + i] = Math.min(H[j * nx + i], level - (f.d < half ? 2 : 0.6));
      }
    }
  }
  const at = (i: number, j: number) => H[Math.min(nz - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * cell, z = z0 + j * cell;
      let y = H[j * nx + i];
      if (inside(x, z)) y -= 1.5;
      // The outermost rings bend down so the edge never shows against the sky.
      const edge = Math.min(i, j, nx - 1 - i, nz - 1 - j);
      if (edge < 3) y -= (3 - edge) * 40;
      const k = (j * nx + i) * 3;
      pos[k] = x;
      pos[k + 1] = y;
      pos[k + 2] = z;
      const slope = (Math.abs(at(i + 1, j) - at(i - 1, j)) + Math.abs(at(i, j + 1) - at(i, j - 1))) / (2 * cell);
      const n = vnoise(x * 0.004, z * 0.004) * 0.65 + vnoise(x * 0.013 + 5, z * 0.013) * 0.35;
      c.copy(grass).lerp(dry, Math.min(1, Math.max(0, (n - 0.3) * 1.6 + slope * 1.2)));
      c.lerp(dirt, Math.max(0, vnoise(x * 0.02 + 9, z * 0.02) - 0.62) * 1.4);
      if (slope > 0.5) c.lerp(rock, Math.min(1, (slope - 0.5) * 2));
      if (y < waterY + 1.2) c.lerp(mud, Math.min(1, (waterY + 1.2 - y) / 1.2));
      // Darker, slightly hazier-looking than the textured near terrain: the photos' mean albedo.
      col[k] = c.r * 0.82;
      col[k + 1] = c.g * 0.82;
      col[k + 2] = c.b * 0.82;
    }
  }
  const idx: number[] = [];
  const m = cell * 1.5;
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      // Skip cells wholly inside the grid (keep a one-cell overlap under the terrain's edge).
      const xa = x0 + i * cell, za = z0 + j * cell;
      if (inside(xa, za, m) && inside(xa + cell, za + cell, m)) continue;
      const a = j * nx + i, b = a + 1, d = a + nx, e = d + 1;
      idx.push(a, d, e, a, e, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  mat.name = 'terrain-apron';
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'terrain-apron';
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  mesh.raycast = () => {};
  return mesh;
}
