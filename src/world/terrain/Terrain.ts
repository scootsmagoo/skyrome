/**
 * Terrain service: renders the heightmap and answers ground queries.
 *
 * Rendering is CDLOD (see quadtree.ts / terrainMaterial.ts): one shared grid patch drawn
 * instanced, a few hundred patches per frame in ONE draw call, displaced on the GPU from an R32F
 * height texture, morphing smoothly between levels, with skirts. The fragment shader splats nine
 * ground textures (grass, sun-dried grass, trodden earth, tufa rock, river sand and mud, gravel,
 * basalt road paving, travertine pavement) from per-sample data (normals, road / pad distance
 * fields, urban wear, gardens, water level), so `surfaceAt` reports what is drawn underfoot.
 * Physics uses Rapier heightfields per 128 m chunk.
 *
 * Public API (stable): `new Terrain(game, hm, opts)`, `heightAt`, `normalAt`, `surfaceAt`,
 * `group`, `material`.
 */
import * as THREE from 'three';
import type { Game, System } from '../../core/Game';
import * as atlas from '../../data/atlas';
import { WORLD_SCALE } from '../coords';
import { makeNaturalElevation, type Heightmap } from './heightmap';
import { buildApron, farHeight, type ApronOptions } from './apron';
import { flatGroundTextures, loadGroundTextures, type GroundTextures } from './groundTextures';
import { PATCH_STRIDE, TerrainQuadtree, type QuadtreeOptions } from './quadtree';
import { romeTerrainInputs } from './romeInputs';
import { LAYER_COUNT, SPLAT_LAYERS, splatWeights, type SplatInput } from './splat';
import { buildTerrainData, decodeSdf, sampleChannel, WATER_OFFSET_RANGE, type TerrainData, type TerrainDataInputs } from './terrainData';
import { createTerrainMaterial, defaultLayerUniforms, MAX_LOD_LEVELS, type TerrainUniforms } from './terrainMaterial';
import { MATERIAL_RECIPES } from '../../gfx/textures/catalog';
import { surfaceForWeights, type Surface } from './surface';

export type { Surface } from './surface';

declare module '../../core/Game' {
  interface Game {
    terrain: Terrain;
  }
}

export interface TerrainOptions {
  /** Vertices per physics chunk side (quads = chunkSamples - 1). */
  chunkSamples?: number;
  /** Skip collider creation (viewer scenes). */
  noColliders?: boolean;
  /** Splat inputs (regions, gardens, pad kinds). Default: derived from the atlas. */
  inputs?: TerrainDataInputs;
  /** CDLOD tuning. */
  lod?: QuadtreeOptions;
  /** Don't load the photo textures (flat palette colours only). */
  flat?: boolean;
  /**
   * Coarse land beyond the grid, from the atlas landform (default: on for atlas-built heightmaps).
   * false turns it off.
   */
  apron?: boolean | ApronOptions;
}

/**
 * Size (m) of one repeat of each splat layer on the ground. Natural ground repeats over a little
 * more than the library's mesh tiling: seen from above over hundreds of metres, a 2 m grass photo
 * reads as a pattern even with the anti-tiling sample.
 */
const TERRAIN_TILE: Partial<Record<(typeof SPLAT_LAYERS)[number], number>> = { grass: 3.0, dry_grass: 3.4, dirt: 3.0, sand: 2.4, mud: 2.2 };
function layerTiles(): number[] {
  return SPLAT_LAYERS.map((id) => {
    const t = TERRAIN_TILE[id] ?? MATERIAL_RECIPES[id]?.tile ?? 2;
    return typeof t === 'number' ? t : t[0];
  });
}

/** The shared P×P grid patch with skirts: position = (gx, skirt 0|1, gz). */
export function patchGeometry(P: number): THREE.InstancedBufferGeometry {
  const n = P + 1;
  const pos: number[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) pos.push(i, 0, j);
  const idx: number[] = [];
  for (let j = 0; j < P; j++) {
    for (let i = 0; i < P; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx.push(a, c, d, a, d, b);
    }
  }
  // Perimeter traversed so that (p_k, p_k+1, s_k) faces outward on every edge.
  const edges: [number, number][][] = [[], [], [], []];
  for (let k = 0; k <= P; k++) {
    edges[0].push([k, 0]);
    edges[1].push([P, k]);
    edges[2].push([P - k, P]);
    edges[3].push([0, P - k]);
  }
  for (const e of edges) {
    const base = pos.length / 3;
    for (const [i, j] of e) pos.push(i, 1, j);
    for (let k = 0; k < P; k++) {
      const p0 = e[k][1] * n + e[k][0], p1 = e[k + 1][1] * n + e[k + 1][0];
      const s0 = base + k, s1 = base + k + 1;
      idx.push(p0, p1, s0, p1, s1, s0);
    }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

export class Terrain implements System {
  readonly name = 'terrain';
  /** After the camera rig (100): LOD selection uses this frame's camera. */
  readonly priority = 101;
  readonly group = new THREE.Group();
  readonly material: THREE.MeshStandardMaterial;
  readonly quadtree: TerrainQuadtree;
  readonly data: TerrainData;
  readonly uniforms: TerrainUniforms;
  /** Resolves when the photo textures are in use (or immediately when flat). */
  readonly ready: Promise<void>;
  readonly mesh: THREE.Mesh;
  /** The land beyond the grid (null when off). */
  readonly apron: THREE.Mesh | null = null;
  /** Ground height anywhere (game m): the grid inside, the atlas landform outside. */
  readonly farHeightAt: (x: number, z: number) => number;
  /** Last LOD selection: patches drawn and triangles. */
  readonly lodStats = { patches: 0, triangles: 0, perLevel: [] as number[] };
  private readonly patchAttr: THREE.InstancedBufferAttribute;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly trisPerPatch: number;
  private readonly frustum = new THREE.Frustum();
  private readonly projView = new THREE.Matrix4();
  private textures: GroundTextures;
  private readonly splatScratch = new Float32Array(LAYER_COUNT);

  constructor(
    readonly game: Game,
    readonly hm: Heightmap,
    opts: TerrainOptions = {},
  ) {
    this.group.name = 'terrain';
    this.data = buildTerrainData(hm, opts.inputs ?? (hm.features ? romeTerrainInputs() : {}));

    // ---- GPU data
    const heightTex = new THREE.DataTexture(hm.heights, hm.nx, hm.nz, THREE.RedFormat, THREE.FloatType);
    heightTex.magFilter = heightTex.minFilter = THREE.NearestFilter;
    heightTex.generateMipmaps = false;
    heightTex.needsUpdate = true;
    const dataTex = (arr: Uint8Array) => {
      const t = new THREE.DataTexture(arr, hm.nx, hm.nz, THREE.RGBAFormat, THREE.UnsignedByteType);
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.needsUpdate = true;
      return t;
    };
    this.textures = flatGroundTextures(SPLAT_LAYERS);
    this.quadtree = new TerrainQuadtree(hm, opts.lod);
    const levels = this.quadtree.levels;
    if (levels > MAX_LOD_LEVELS) throw new Error(`terrain: ${levels} LOD levels > ${MAX_LOD_LEVELS}`);
    const morph: THREE.Vector2[] = [];
    const bias: number[] = [];
    const skirt: number[] = [];
    for (let L = 0; L < MAX_LOD_LEVELS; L++) {
      const m = this.quadtree.morph[Math.min(L, levels - 1)];
      morph.push(new THREE.Vector2(m[0], m[1]));
      const cell = hm.spacing * 2 ** L;
      bias.push(L === 0 ? 0 : Math.min(3, 0.04 * cell));
      skirt.push(cell * 0.75 + 0.6);
    }
    const tiles = layerTiles();
    this.uniforms = {
      tHeight: { value: heightTex },
      tDataA: { value: dataTex(this.data.a) },
      tDataB: { value: dataTex(this.data.b) },
      tAlbedo: { value: this.textures.albedo },
      tSurface: { value: this.textures.surface },
      uGrid: { value: new THREE.Vector4(hm.minX, hm.minZ, hm.spacing, 0) },
      uGridN: { value: new THREE.Vector2(hm.nx, hm.nz) },
      uMorph: { value: morph },
      uBias: { value: bias },
      uSkirt: { value: skirt },
      uWater: { value: new THREE.Vector3(Number.isFinite(hm.waterLevelY) ? hm.waterLevelY : -1e4, WATER_OFFSET_RANGE, 0) },
      uTile: { value: tiles },
      uTint: { value: this.textures.tints },
      uRough: { value: this.textures.roughness },
      ...defaultLayerUniforms(),
    };
    this.material = createTerrainMaterial(this.uniforms);

    // ---- the instanced patch mesh
    const P = this.quadtree.patchQuads;
    this.geometry = patchGeometry(P);
    this.trisPerPatch = (this.geometry.index!.count / 3) | 0;
    const maxPatches = Math.ceil((hm.nx - 1) / P) * Math.ceil((hm.nz - 1) / P) + 16;
    this.patchAttr = new THREE.InstancedBufferAttribute(new Float32Array(maxPatches * PATCH_STRIDE), PATCH_STRIDE);
    this.patchAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('aPatch', this.patchAttr);
    this.geometry.instanceCount = 0;
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'terrain-cdlod';
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    // The base geometry is a unit grid near the origin; it must never be ray-picked.
    this.mesh.raycast = () => {};
    this.group.add(this.mesh);

    // ---- the land beyond the grid
    this.farHeightAt = (x, z) => hm.heightAt(x, z);
    if (opts.apron !== false && hm.features) {
      const ext = (typeof opts.apron === 'object' ? opts.apron.extent : undefined) ?? 4500;
      const natural = makeNaturalElevation(
        {
          BASE_ELEVATION: atlas.BASE_ELEVATION,
          HILLS: atlas.HILLS,
          LOWLANDS: atlas.LOWLANDS,
          RIVERS: hm.features.rivers,
          ISLANDS: hm.features.islands,
          bounds: { minX: (hm.minX - ext) / WORLD_SCALE, maxX: (hm.maxX + ext) / WORLD_SCALE, minZ: (hm.minZ - ext) / WORLD_SCALE, maxZ: (hm.maxZ + ext) / WORLD_SCALE },
        },
        { quays: hm.features.quays, noise: 0, sdfCell: 25 },
      );
      this.farHeightAt = farHeight(hm, natural);
      this.apron = buildApron(hm, this.farHeightAt, hm.waterLevelY, typeof opts.apron === 'object' ? opts.apron : {});
      this.group.add(this.apron);
    }

    // ---- physics: Rapier heightfields per chunk
    if (!opts.noColliders) this.addColliders(opts.chunkSamples ?? 65);

    game.scene.add(this.group);
    game.addSystem(this);
    this.select();

    this.ready = opts.flat
      ? Promise.resolve()
      : loadGroundTextures(SPLAT_LAYERS)
          .then((t) => {
            if (!t) return;
            this.textures.albedo.dispose();
            this.textures.surface.dispose();
            this.textures = t;
            this.uniforms.tAlbedo.value = t.albedo;
            this.uniforms.tSurface.value = t.surface;
            this.uniforms.uTint.value = t.tints;
            this.uniforms.uRough.value = t.roughness;
          })
          .catch((err) => console.warn('[terrain] ground textures failed; using flat colours', err));
  }

  private addColliders(n: number) {
    const hm = this.hm;
    const step = n - 1;
    for (let cz = 0; cz < hm.nz - 1; cz += step) {
      for (let cx = 0; cx < hm.nx - 1; cx += step) {
        const sx = Math.min(n, hm.nx - cx);
        const sz = Math.min(n, hm.nz - cz);
        if (sx < 2 || sz < 2) continue;
        const h = new Float32Array(sx * sz);
        for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) h[z * sx + x] = hm.heights[(cz + z) * hm.nx + cx + x];
        this.game.physics.addHeightfield(hm.minX + cx * hm.spacing, hm.minZ + cz * hm.spacing, (sx - 1) * hm.spacing, (sz - 1) * hm.spacing, sx - 1, sz - 1, h, { owner: this });
      }
    }
  }

  /** Re-run the LOD selection for the current camera (also done every frame). */
  select() {
    const cam = this.game.camera;
    cam.updateMatrixWorld();
    this.projView.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projView);
    const { data, count } = this.quadtree.select(cam.position, this.frustum);
    const arr = this.patchAttr.array as Float32Array;
    const n = Math.min(count, arr.length / PATCH_STRIDE);
    arr.set(data.subarray(0, n * PATCH_STRIDE));
    this.patchAttr.clearUpdateRanges();
    this.patchAttr.addUpdateRange(0, n * PATCH_STRIDE);
    this.patchAttr.needsUpdate = true;
    this.geometry.instanceCount = n;
    this.lodStats.patches = n;
    this.lodStats.triangles = n * this.trisPerPatch;
    this.lodStats.perLevel = [...this.quadtree.stats.perLevel];
  }

  lateUpdate() {
    if (this.mesh.visible) this.select();
  }

  /** Re-upload heights after another module edited `hm.heights` (colliders are not rebuilt). */
  refreshHeights() {
    this.uniforms.tHeight.value.needsUpdate = true;
  }

  heightAt(x: number, z: number): number {
    return this.hm.heightAt(x, z);
  }

  normalAt(x: number, z: number) {
    return this.hm.normalAt(x, z);
  }

  /** Splat layer weights at (x, z), exactly as the shader computes them (Float32Array, reused). */
  weightsAt(x: number, z: number, out = this.splatScratch): Float32Array {
    const hm = this.hm;
    const n = hm.normalAt(x, z);
    const a = this.data.a, b = this.data.b;
    const p: SplatInput = {
      x,
      z,
      ny: n.y,
      nz: n.z,
      hw: hm.heightAt(x, z) - (hm.waterLevelY + sampleChannel(hm, b, 3, x, z) * WATER_OFFSET_RANGE),
      roadSd: decodeSdf(sampleChannel(hm, a, 2, x, z) * 255),
      padSd: decodeSdf(sampleChannel(hm, a, 3, x, z) * 255),
      padKind: sampleChannel(hm, b, 0, x, z),
      urban: sampleChannel(hm, b, 1, x, z),
      lush: sampleChannel(hm, b, 2, x, z),
    };
    return splatWeights(p, out);
  }

  /** Surface type for footsteps / effects. */
  surfaceAt(x: number, z: number): Surface {
    const hm = this.hm;
    const level = hm.waterLevelY + sampleChannel(hm, this.data.b, 3, x, z) * WATER_OFFSET_RANGE;
    if (hm.heightAt(x, z) < level - 0.08) return 'water';
    return surfaceForWeights(this.weightsAt(x, z));
  }

  dispose() {
    this.game.removeSystem(this);
    this.game.scene.remove(this.group);
    this.geometry.dispose();
    this.material.dispose();
    for (const t of [this.uniforms.tHeight, this.uniforms.tDataA, this.uniforms.tDataB, this.uniforms.tAlbedo, this.uniforms.tSurface]) t.value.dispose();
  }
}
