/**
 * Terrain service: renders the heightmap as chunked meshes and registers heightfield colliders.
 *
 * BASELINE implementation (vertex-colored chunks, one LOD). The terrain module upgrades the
 * rendering (splat textures, LOD, skirts) behind the same `Terrain` API.
 */
import * as THREE from 'three';
import type { Game } from '../../core/Game';
import type { Heightmap } from './heightmap';

declare module '../../core/Game' {
  interface Game {
    terrain: Terrain;
  }
}

export type Surface = 'grass' | 'dirt' | 'rock' | 'paved' | 'sand' | 'water';

export interface TerrainOptions {
  /** Vertices per chunk side (quads = chunkSamples - 1). */
  chunkSamples?: number;
  /** Skip collider creation (viewer scenes). */
  noColliders?: boolean;
}

export class Terrain {
  readonly group = new THREE.Group();
  readonly material: THREE.MeshStandardMaterial;

  constructor(
    readonly game: Game,
    readonly hm: Heightmap,
    opts: TerrainOptions = {},
  ) {
    this.group.name = 'terrain';
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    const n = opts.chunkSamples ?? 65;
    const step = n - 1;
    for (let cz = 0; cz < hm.nz - 1; cz += step) {
      for (let cx = 0; cx < hm.nx - 1; cx += step) {
        const sx = Math.min(n, hm.nx - cx);
        const sz = Math.min(n, hm.nz - cz);
        if (sx < 2 || sz < 2) continue;
        const mesh = this.buildChunk(cx, cz, sx, sz);
        if (game.world) game.world.add(`terrain:${cx}:${cz}`, mesh, { cullDistance: 2500, parent: this.group });
        else this.group.add(mesh);
        if (!opts.noColliders) {
          const h = new Float32Array(sx * sz);
          for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) h[z * sx + x] = hm.heights[(cz + z) * hm.nx + cx + x];
          game.physics.addHeightfield(hm.minX + cx * hm.spacing, hm.minZ + cz * hm.spacing, (sx - 1) * hm.spacing, (sz - 1) * hm.spacing, sx - 1, sz - 1, h, { owner: this });
        }
      }
    }
    game.scene.add(this.group);
  }

  heightAt(x: number, z: number): number {
    return this.hm.heightAt(x, z);
  }

  normalAt(x: number, z: number) {
    return this.hm.normalAt(x, z);
  }

  /** Surface type for footsteps / effects. */
  surfaceAt(x: number, z: number): Surface {
    const y = this.hm.heightAt(x, z);
    if (y < this.hm.waterLevelY - 0.05) return 'water';
    if (this.hm.sampleMask(this.hm.roadMask, x, z) > 0.5) return 'paved';
    if (this.hm.sampleMask(this.hm.padMask, x, z) > 0.5) return 'dirt';
    const slope = this.hm.slopeAt(x, z);
    if (slope > 38) return 'rock';
    if (y < this.hm.waterLevelY + 1.2) return 'sand';
    return 'grass';
  }

  private buildChunk(cx: number, cz: number, sx: number, sz: number): THREE.Mesh {
    const hm = this.hm;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(sx * sz * 3);
    const col = new Float32Array(sx * sz * 3);
    const c = new THREE.Color();
    const grass = new THREE.Color(0x76803f);
    const dry = new THREE.Color(0xa59a5e);
    const dirt = new THREE.Color(0x8d7458);
    const rock = new THREE.Color(0x8f8572);
    const paved = new THREE.Color(0x6a6762);
    const sand = new THREE.Color(0xb7a47d);
    let i = 0;
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        const gx = hm.minX + (cx + x) * hm.spacing;
        const gz = hm.minZ + (cz + z) * hm.spacing;
        const k = (cz + z) * hm.nx + cx + x;
        const y = hm.heights[k];
        pos[i * 3] = gx;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = gz;
        const slope = hm.slopeAt(gx, gz);
        c.copy(grass).lerp(dry, 0.5 + 0.5 * Math.sin(gx * 0.013) * Math.cos(gz * 0.011));
        if (slope > 28) c.lerp(rock, Math.min(1, (slope - 28) / 15));
        if (y < hm.waterLevelY + 1.5) c.lerp(sand, Math.min(1, (hm.waterLevelY + 1.5 - y) / 1.5));
        const pad = hm.padMask[k];
        if (pad > 0) c.lerp(dirt, pad * 0.8);
        const road = hm.roadMask[k];
        if (road > 0) c.lerp(paved, road);
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
        i++;
      }
    }
    const idx: number[] = [];
    for (let z = 0; z < sz - 1; z++) {
      for (let x = 0; x < sx - 1; x++) {
        const a = z * sx + x;
        const b = a + 1;
        const d = a + sx;
        const e = d + 1;
        idx.push(a, d, b, b, d, e);
      }
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, this.material);
    mesh.receiveShadow = true;
    mesh.name = `terrain-chunk-${cx}-${cz}`;
    return mesh;
  }
}
