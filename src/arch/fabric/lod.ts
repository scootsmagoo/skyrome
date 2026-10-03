/**
 * Three-level LOD for city blocks, built on the WorldRegistry:
 *
 * - near ('full' detail: interiors, props, colliders) within `near` m of a block,
 * - mid ('mid' detail: the street-facing exterior) up to `mid` m,
 * - far ('low' detail) beyond that: every far block of a grid cell is baked into ONE vertex-coloured
 *   mesh (flat shading, no textures, no shadows), so far draw calls scale with the number of cells
 *   in view, not with the number of blocks. Blocks inside a merged cell mesh are hidden one by one
 *   (while their near / mid level shows) through a visibility texture read in the vertex shader.
 *
 *   const lod = game.addSystem(new CityLOD(game));
 *   for (const blk of blocks) {
 *     const o = { heightAt, seed: blk.seed, … };
 *     const full = fillBlock(blk.poly, o);
 *     registerColliders(game, full.builder.colliders);
 *     lod.addBlock(blk.id, {
 *       near: full.builder.build(blk.id),
 *       mid: fillBlock(blk.poly, { ...o, detail: 'mid' }).builder.build(blk.id + ':mid'),
 *       far: fillBlock(blk.poly, { ...o, detail: 'low' }).builder.build(blk.id + ':far'),
 *     });
 *   }
 *   lod.finish();   // merges the far cells (call again after adding more blocks)
 *
 * Distances follow the registry: measured from each block's bounding-sphere surface and scaled by
 * the view-distance setting.
 */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Game, System } from '../../core/Game';
import { MATERIAL_BASE, MATERIAL_IDS, type MaterialId } from '../../gfx/materialIds';
import type { WorldEntry } from '../../world/WorldRegistry';

export interface CityLODOptions {
  /** Full detail within this distance of a block (m). Default 70. */
  near?: number;
  /** Mid detail up to this distance; the merged far stand-in beyond it. Default 220. */
  mid?: number;
  /** Far stand-ins are culled beyond this (per cell). Default 3000. */
  far?: number;
  /** Far stand-ins are merged per square cell of this size (m). Default 320. */
  cell?: number;
  /** Prefix for registry ids of the merged far cells. */
  id?: string;
}

interface BlockRec {
  index: number;
  entry: WorldEntry;
}

interface CellRec {
  key: string;
  mesh: THREE.Mesh | null;
  pending: THREE.BufferGeometry[];
}

const MAX_BLOCKS = 128 * 128;

/**
 * Bake a built block (one mesh per material, as `MeshBuilder.build` makes) into one indexed,
 * vertex-coloured geometry: positions + colour (each material's flat MATERIAL_BASE colour) + the
 * block index. Normals and UVs are dropped (the far material shades flat from screen derivatives),
 * which lets vertices merge across faces: ~10 bytes per triangle.
 */
export function bakeFarGeometry(group: THREE.Object3D, blockIndex: number): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  group.updateMatrixWorld(true);
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const id = materialIdOf(mesh);
    const src = mesh.geometry;
    const pos = src.getAttribute('position') as THREE.BufferAttribute;
    const p = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      p[i * 3] = v.x; p[i * 3 + 1] = v.y; p[i * 3 + 2] = v.z;
    }
    const c = new THREE.Color(id ? MATERIAL_BASE[id].color : 0x808080).convertLinearToSRGB();
    const col = new Uint8Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      col[i * 3] = Math.round(c.r * 255); col[i * 3 + 1] = Math.round(c.g * 255); col[i * 3 + 2] = Math.round(c.b * 255);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
    g.setAttribute('aBlock', new THREE.BufferAttribute(new Uint16Array(pos.count).fill(blockIndex), 1));
    if (src.index) g.setIndex(src.index.clone());
    parts.push(g);
  });
  if (!parts.length) return null;
  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
  if (!merged) return null;
  return mergeVertices(merged, 1e-3);
}

function materialIdOf(mesh: THREE.Mesh): MaterialId | null {
  const m = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.Material;
  const fromName = mesh.name.slice(mesh.name.lastIndexOf(':') + 1);
  for (const cand of [m?.name, fromName]) if (cand && (MATERIAL_IDS as readonly string[]).includes(cand)) return cand as MaterialId;
  return null;
}

/**
 * Shared vertex-coloured material for far city cells. Vertex colours are stored as sRGB bytes, so
 * they are decoded to linear in the shader; vertices of blocks hidden in `vis` collapse to a point.
 */
function farMaterial(vis: THREE.DataTexture): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0 });
  mat.name = 'city:far';
  const uVis = { value: vis };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFarVis = uVis;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aBlock;
uniform sampler2D uFarVis;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  int bi = int(aBlock + 0.5);
  ivec2 size = textureSize(uFarVis, 0);
  transformed *= step(0.5, texelFetch(uFarVis, ivec2(bi % size.x, bi / size.x), 0).r);
}`)
      .replace('#include <color_vertex>', `#include <color_vertex>
#ifdef USE_COLOR
  vColor.rgb = pow(vColor.rgb, vec3(2.2));
#endif`);
  };
  mat.customProgramCacheKey = () => 'city:far';
  return mat;
}

export class CityLOD implements System {
  readonly name = 'cityLOD';
  /** Right after the WorldRegistry (95), which decides near / mid visibility this frame. */
  readonly priority = 96;
  readonly group = new THREE.Group();
  private readonly o: Required<CityLODOptions>;
  private readonly blocks: BlockRec[] = [];
  private readonly cells = new Map<string, CellRec>();
  private readonly visData: Uint8Array;
  private readonly vis: THREE.DataTexture;
  private readonly material: THREE.MeshStandardMaterial;

  constructor(
    private readonly game: Game,
    opts: CityLODOptions = {},
  ) {
    this.o = { near: 70, mid: 220, far: 3000, cell: 320, id: 'city', ...opts };
    this.visData = new Uint8Array(MAX_BLOCKS);
    this.vis = new THREE.DataTexture(this.visData, 128, 128, THREE.RedFormat, THREE.UnsignedByteType);
    this.vis.magFilter = this.vis.minFilter = THREE.NearestFilter;
    this.vis.needsUpdate = true;
    this.material = farMaterial(this.vis);
    this.group.name = `${this.o.id}:far`;
  }

  get blockCount() {
    return this.blocks.length;
  }

  /** Number of merged far meshes (one draw call each when in view). */
  get cellCount() {
    return this.cells.size;
  }

  /** Is block `id` currently drawn by its merged far stand-in? (debug / tests) */
  farVisible(id: string): boolean {
    const b = this.blocks.find((x) => x.entry.id === id);
    return !!b && this.visData[b.index] > 0;
  }

  /**
   * Register one block. `near` and `mid` go to the WorldRegistry (near within `near` m, mid up to
   * `mid` m); `far` is baked into its cell's merged mesh at the next `finish()` and disposed.
   */
  addBlock(id: string, levels: { near: THREE.Object3D; mid: THREE.Object3D; far: THREE.Object3D }) {
    const index = this.blocks.length;
    if (index >= MAX_BLOCKS) throw new Error(`CityLOD: more than ${MAX_BLOCKS} blocks`);
    const entry = this.game.world.add(id, levels.near, { cullDistance: this.o.near, far: levels.mid, farDistance: this.o.mid, tags: ['city'] });
    this.blocks.push({ index, entry });
    const g = bakeFarGeometry(levels.far, index);
    levels.far.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    if (!g) return;
    const c = entry.sphere.center;
    const key = `${Math.floor(c.x / this.o.cell)},${Math.floor(c.z / this.o.cell)}`;
    let cell = this.cells.get(key);
    if (!cell) this.cells.set(key, (cell = { key, mesh: null, pending: [] }));
    cell.pending.push(g);
  }

  /** Merge pending far geometry into the cell meshes and register new cells. */
  finish() {
    for (const cell of this.cells.values()) {
      if (!cell.pending.length) continue;
      const parts = cell.mesh ? [cell.mesh.geometry, ...cell.pending] : cell.pending;
      const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
      if (!merged) continue;
      for (const g of parts) if (g !== merged) g.dispose();
      cell.pending = [];
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      if (cell.mesh) {
        cell.mesh.geometry = merged;
        // Re-register so the registry's sphere covers the grown cell.
        this.game.world.remove(`${this.o.id}:far:${cell.key}`);
      } else {
        cell.mesh = new THREE.Mesh(merged, this.material);
        cell.mesh.name = `${this.o.id}:far:${cell.key}`;
        // Far beyond the shadow camera: neither casts nor receives.
        cell.mesh.castShadow = false;
        cell.mesh.receiveShadow = false;
      }
      this.game.world.add(`${this.o.id}:far:${cell.key}`, cell.mesh, { cullDistance: this.o.far, parent: this.group, tags: ['city', 'far'] });
    }
    if (!this.group.parent) this.game.scene.add(this.group);
    this.sync(true);
  }

  lateUpdate() {
    this.sync(false);
  }

  /** A block's far stand-in shows exactly when neither its near nor its mid level does. */
  private sync(force: boolean) {
    let changed = force;
    for (const b of this.blocks) {
      const show = b.entry.object.visible || b.entry.far?.visible ? 0 : 255;
      if (this.visData[b.index] !== show) {
        this.visData[b.index] = show;
        changed = true;
      }
    }
    if (changed) this.vis.needsUpdate = true;
  }
}
