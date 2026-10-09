/**
 * Landmarks as batches. A landmark is built as one mesh per material plus one InstancedMesh per
 * shape, so the Forum's twenty landmarks were ~600 draw calls in the main pass and ~200 more in
 * the shadow pass: render submit was the biggest CPU cost. Here every static landmark's meshes
 * move into one BatchedMesh per material (the city's BatchPool, a second pool), where each mesh is
 * an instance, one multi-draw per material draws them all, and three.js culls per instance.
 *
 * What the batching buys besides draws:
 *  - big meshes are split into ~30 m pieces (chunking.ts), which cost nothing as instances, so a
 *    forum is culled piece by piece in the main and the shadow pass;
 *  - every piece and every column has coarser twins as extra geometries of its batch
 *    (landmarkLod.ts), swapped in per instance by distance (`setGeometryIdAt`), and the shadow pass
 *    uses them from much nearer (`ShadowHook`, gfx/shadowLod.ts).
 *
 * Only what is static is moved: meshes with a plain opaque library-style material that receive
 * shadows, outside tree groves and builder-managed LOD groups (names with ':lod'). Everything else
 * stays where the builder put it. A landmark's `visible` flag drives its instances (the world
 * registry still just sets `object.visible`).
 */
import * as THREE from 'three';
import type { Game, System } from '../../core/Game';
import { BatchHandle, BatchPool, type Batch, type BatchRef } from '../city/batches';
import { addShadowHook, type ShadowHook } from '../../gfx/shadowLod';
import { CHUNK_CELL, CHUNK_MIN_RADIUS, CHUNK_MIN_TRIANGLES, splitByCells } from './chunking';
import { PIECE_FROM, SHADOW_TWIN_FROM, pieceTwin, shapeTwins } from './landmarkLod';

/** Hysteresis (m) around each LOD distance. */
const BAND = 6;

interface Entry {
  batch: THREE.BatchedMesh;
  inst: number;
  /** Geometry id per level (0 = full detail) and the distance each level starts at. */
  geoms: number[];
  from: number[];
  level: number;
  /** The geometry id the shadow pass uses beyond SHADOW_TWIN_FROM. */
  shadow: number;
  center: THREE.Vector3;
  radius: number;
}

export interface BatchResult {
  handle: BatchHandle;
  /** How many meshes moved into batches, and how many instances they became. */
  meshes: number;
  instances: number;
}

const OFF = new URLSearchParams(globalThis.location?.search ?? '').get('lodoff') ?? '';
const _sphere = new THREE.Sphere();
const _m = new THREE.Matrix4();

export class LandmarkBatcher implements System, ShadowHook {
  readonly name = 'landmarkBatch';
  readonly priority = 96;
  private readonly batchPool: BatchPool;
  private readonly entries: Entry[] = [];
  private cursor = 0;
  /** Entries whose geometry the current shadow render replaced. */
  private readonly swapped: Entry[] = [];
  private finished = false;
  readonly stats = { meshes: 0, instances: 0, lodEntries: 0 };
  /** Prepared (position + packed normal + uv, non-indexed) copies of source geometries. */
  private readonly prepared = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();

  constructor(private readonly game: Game) {
    this.batchPool = new BatchPool(game.scene, { name: 'lmbatch', verts: 1 << 15, growth: 1.6, trim: false });
    addShadowHook(this);
  }

  /**
   * Move the static meshes under `obj` (positioned, world matrices current) into batches. Returns
   * null when nothing qualified. Call before the landmark's arrays are released.
   */
  add(obj: THREE.Object3D): BatchResult | null {
    if (this.finished) return null;
    obj.updateMatrixWorld(true);
    const todo: THREE.Mesh[] = [];
    obj.traverse((o) => {
      if (this.eligible(o as THREE.Mesh, obj)) todo.push(o as THREE.Mesh);
    });
    if (!todo.length) return null;
    const refs: BatchRef[] = [];
    let instances = 0;
    for (const mesh of todo) {
      const im = mesh as THREE.InstancedMesh;
      const material = mesh.material as THREE.Material;
      const batch = this.batchPool.get(material, mesh.castShadow, false);
      if (im.isInstancedMesh) instances += this.addInstanced(im, batch, refs);
      else instances += this.addPlain(mesh, batch, refs);
      mesh.removeFromParent();
      if (im.isInstancedMesh) im.dispose();
    }
    this.stats.meshes += todo.length;
    this.stats.instances += instances;
    const handle = new BatchHandle(refs);
    followVisibility(obj, handle);
    return { handle, meshes: todo.length, instances };
  }

  private eligible(m: THREE.Mesh, root: THREE.Object3D): boolean {
    if (!m.isMesh || !m.visible || !m.receiveShadow || m.userData.keepCpu || m.userData.noBatch) return false;
    if ((m as unknown as THREE.SkinnedMesh).isSkinnedMesh || (m as unknown as { isBatchedMesh?: boolean }).isBatchedMesh) return false;
    const mat = m.material as THREE.Material;
    if (!mat || Array.isArray(mat) || mat.transparent || mat.name.includes('water')) return false;
    if (!(mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) return false;
    const g = m.geometry;
    const pos = g?.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!pos || !pos.count || !(pos.array as ArrayLike<number> | null)) return false;
    if (g.index && !(g.index.array as ArrayLike<number> | null)) return false;
    if (Object.keys(g.morphAttributes).length) return false;
    if ((m as THREE.InstancedMesh).isInstancedMesh && ((m as THREE.InstancedMesh).count === 0 || (m as THREE.InstancedMesh).instanceColor)) return false;
    for (let p: THREE.Object3D | null = m; p && p !== root.parent; p = p.parent) {
      // Tree groves run their own near/far levels; ':lod' groups are swapped by their builders.
      if (!p.visible || p.name === 'forest' || p.name.includes(':lod')) return false;
    }
    return true;
  }

  /** Position + packed normal + uv, non-indexed: what every geometry of the pool must look like. */
  private prep(src: THREE.BufferGeometry): THREE.BufferGeometry {
    let g = this.prepared.get(src);
    if (g) return g;
    const flat = src.index ? src.toNonIndexed() : src;
    const pos = flat.getAttribute('position') as THREE.BufferAttribute;
    const n = pos.count;
    g = new THREE.BufferGeometry();
    const P = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      P[i * 3] = pos.getX(i);
      P[i * 3 + 1] = pos.getY(i);
      P[i * 3 + 2] = pos.getZ(i);
    }
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    if (!flat.getAttribute('normal')) flat.computeVertexNormals();
    const nor = flat.getAttribute('normal') as THREE.BufferAttribute;
    const N = new Int8Array(n * 3);
    for (let i = 0; i < n; i++) {
      const x = nor.getX(i);
      const y = nor.getY(i);
      const z = nor.getZ(i);
      const l = Math.hypot(x, y, z) || 1;
      N[i * 3] = Math.round((x / l) * 127);
      N[i * 3 + 1] = Math.round((y / l) * 127);
      N[i * 3 + 2] = Math.round((z / l) * 127);
    }
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3, true));
    const uv = flat.getAttribute('uv') as THREE.BufferAttribute | undefined;
    const U = new Float32Array(n * 2);
    if (uv) for (let i = 0; i < n; i++) { U[i * 2] = uv.getX(i); U[i * 2 + 1] = uv.getY(i); }
    g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    if (flat !== src) flat.dispose();
    this.prepared.set(src, g);
    return g;
  }

  private addInstanced(mesh: THREE.InstancedMesh, batch: Batch, refs: BatchRef[]): number {
    const src = mesh.geometry;
    const twins = OFF.includes('twin') ? [] : shapeTwins(src);
    const key = `s:${src.uuid}`;
    const geoms = [batch.shape(key, () => this.prep(src))];
    twins.forEach((t, i) => geoms.push(batch.shape(`${key}:${i + 1}`, () => this.prep(t.geometry))));
    if (!src.boundingSphere) src.computeBoundingSphere();
    const local = src.boundingSphere!;
    const im = new THREE.Matrix4();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, im);
      _m.multiplyMatrices(mesh.matrixWorld, im);
      const ref = batch.place(geoms[0], _m, local);
      refs.push(ref);
      if (twins.length) {
        _sphere.copy(local).applyMatrix4(_m);
        this.entries.push({
          batch: batch.mesh,
          inst: ref.inst,
          geoms,
          from: [0, ...twins.map((t) => t.from)],
          level: 0,
          shadow: geoms[1],
          center: _sphere.center.clone(),
          radius: _sphere.radius,
        });
        this.stats.lodEntries++;
      }
    }
    return mesh.count;
  }

  private addPlain(mesh: THREE.Mesh, batch: Batch, refs: BatchRef[]): number {
    const src = mesh.geometry;
    if (!src.boundingSphere) src.computeBoundingSphere();
    const matrix = mesh.matrixWorld;
    const big = src.boundingSphere!.radius * matrix.getMaxScaleOnAxis() >= CHUNK_MIN_RADIUS && (src.index ? src.index.count : src.getAttribute('position').count) / 3 >= CHUNK_MIN_TRIANGLES;
    const pieces = (big && !OFF.includes('chunk') ? splitByCells(src, CHUNK_CELL) : null) ?? [src];
    for (const piece of pieces) {
      if (!piece.boundingSphere) piece.computeBoundingSphere();
      const id = batch.addGeometry(this.prep(piece));
      const ref = batch.place(id, matrix, piece.boundingSphere!);
      refs.push(ref);
      const twin = OFF.includes('twin') ? null : pieceTwin(piece);
      if (twin) {
        const tid = batch.addGeometry(this.prep(twin));
        _sphere.copy(piece.boundingSphere!).applyMatrix4(matrix);
        this.entries.push({ batch: batch.mesh, inst: ref.inst, geoms: [id, tid], from: [0, PIECE_FROM], level: 0, shadow: tid, center: _sphere.center.clone(), radius: _sphere.radius });
        this.stats.lodEntries++;
      }
    }
    return pieces.length;
  }

  /** Every landmark is in: shrink the batches and let their arrays go once uploaded. */
  finish() {
    if (this.finished) return;
    this.finished = true;
    for (const b of this.batchPool.all()) b.finish();
  }

  get count() {
    return this.entries.length;
  }

  lateUpdate() {
    this.batchPool.sync();
    const n = this.entries.length;
    if (!n) return;
    const cam = this.game.camera.position;
    // A quarter of the entries a frame is plenty at walking speed (and a teleport settles in four).
    const batch = Math.max(64, Math.ceil(n / 4));
    for (let i = 0; i < batch && i < n; i++) {
      this.cursor = (this.cursor + 1) % n;
      const e = this.entries[this.cursor];
      const d = cam.distanceTo(e.center) - e.radius;
      let level = e.level;
      while (level < e.geoms.length - 1 && d > e.from[level + 1] + BAND) level++;
      while (level > 0 && d < e.from[level] - BAND) level--;
      if (level !== e.level) {
        e.level = level;
        e.batch.setGeometryIdAt(e.inst, e.geoms[level]);
      }
    }
  }

  // ---- ShadowHook: beyond SHADOW_TWIN_FROM the shadow map sees each entry's first twin.

  enter(cx: number, cy: number, cz: number) {
    for (const e of this.entries) {
      if (e.level >= 1) continue; // already a twin
      if (Math.hypot(e.center.x - cx, e.center.y - cy, e.center.z - cz) - e.radius < SHADOW_TWIN_FROM) continue;
      e.batch.setGeometryIdAt(e.inst, e.shadow);
      this.swapped.push(e);
    }
  }

  leave() {
    for (const e of this.swapped) e.batch.setGeometryIdAt(e.inst, e.geoms[e.level]);
    this.swapped.length = 0;
  }
}

/**
 * The registry sets `object.visible`; the batch instances follow it. (A function of its own so the
 * accessors do not keep the caller's locals, the moved meshes, alive.)
 */
function followVisibility(obj: THREE.Object3D, handle: BatchHandle) {
  let visible = obj.visible;
  Object.defineProperty(obj, 'visible', {
    configurable: true,
    get: () => visible,
    set: (v: boolean) => {
      visible = v;
      handle.setVisible(v);
    },
  });
}

/**
 * Whether a builder fills instanced meshes in at run time (an empty InstancedMesh at build time
 * outside tree groves): such a landmark runs its own LOD and keeps its meshes.
 */
export function fillsAtRuntime(root: THREE.Object3D): boolean {
  let found = false;
  root.traverse((o) => {
    if (found || !(o as THREE.InstancedMesh).isInstancedMesh || (o as THREE.InstancedMesh).count > 0) return;
    for (let p: THREE.Object3D | null = o; p && p !== root.parent; p = p.parent) if (p.name === 'forest') return;
    found = true;
  });
  return found;
}

const batchers = new WeakMap<Game, LandmarkBatcher>();

/** The game's landmark batcher (added as a system on first use). */
export function landmarkBatcherFor(game: Game): LandmarkBatcher {
  let b = batchers.get(game);
  if (!b) {
    b = new LandmarkBatcher(game);
    batchers.set(game, b);
    game.addSystem(b);
  }
  return b;
}
