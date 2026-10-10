/**
 * BatchPool: the city's static geometry lives in a few dozen THREE.BatchedMesh objects, one per
 * (material, casts-shadow, ground-offset) combination. Every block, street piece, prop or wall
 * segment is one geometry + one instance in the batches of its materials, so the whole city costs
 * one draw call per material (multi-draw), with per-instance frustum culling and per-instance
 * visibility for LOD swaps and distance culling.
 *
 *   const pool = new BatchPool(scene);
 *   const h = pool.addGroup(meshBuilder.build('x'));   // one instance per material mesh
 *   h.setVisible(false); h.dispose();
 *
 * Geometry added once can also be instanced many times (`instance`), which is how street props
 * are scattered.
 *
 * The batches draw with the pool's own copies of the library materials (kept in step with them
 * by `sync`): three.js re-derives a material's program whenever the same material instance
 * alternates between batched and plain meshes in a frame, which the landmarks' plain meshes would
 * otherwise make it do for every shared material every frame. Instances are not depth-sorted
 * (opaque static geometry), and batches whose geometry streamed out shrink again (`trim`).
 */
import * as THREE from 'three';
import { FastCull } from '../../gfx/fastCull';
import { allMaterials } from '../../gfx/materials';
import { freeArray, packNormals } from '../../gfx/release';

export interface BatchRef {
  batch: Batch;
  geom: number;
  inst: number;
  verts: number;
}

/** One BatchedMesh with growable capacity. */
export class Batch {
  readonly mesh: THREE.BatchedMesh;
  private vertCap: number;
  private live = 0;
  private reserved = 0;
  /** Geometry ids shared by many instances (props), keyed by the caller. */
  readonly shared = new Map<string, { geom: number; verts: number; sphere: THREE.Sphere }>();
  /**
   * The stored world spheres of the instances, which the per-instance frustum cull walks instead of
   * three.js's matrix-and-sphere maths (gfx/fastCull.ts). Instances never move after they are placed.
   */
  readonly cull: FastCull;
  private readonly _sphere = new THREE.Sphere();
  /** Family of geometry (BatchPool.get) and whether the batch casts shadows when allowed to. */
  tag = '';
  shadowCaster = false;

  private readonly initialCap: number;

  constructor(material: THREE.Material, castShadow: boolean, name: string, verts = 8192, instances = 64, private readonly growth = 1.25) {
    this.vertCap = verts;
    this.initialCap = verts;
    this.mesh = new THREE.BatchedMesh(instances, verts, verts, material);
    this.mesh.name = name;
    this.mesh.castShadow = castShadow;
    this.mesh.receiveShadow = true;
    // Culled per instance; the batch's own bounding sphere would go stale as geometry streams in.
    this.mesh.frustumCulled = false;
    // Opaque static geometry: sorting every instance every pass costs more than the overdraw saves.
    this.mesh.sortObjects = false;
    // Never moves (instances carry their own matrices): no per-frame matrix work (gfx/freeze.ts).
    this.mesh.matrixAutoUpdate = false;
    this.cull = new FastCull(this.mesh);
    this.cull.install();
  }

  /** Remember an instance's world sphere (`local` is its geometry's, `matrix` its placement). */
  private track(inst: number, local: THREE.Sphere, matrix?: THREE.Matrix4) {
    const s = this._sphere.copy(local);
    if (matrix) s.applyMatrix4(matrix);
    this.cull.setSphere(inst, s.center.x, s.center.y, s.center.z, s.radius);
  }

  /**
   * Give memory back when most of the capacity is unused (geometry streamed out): compact and
   * shrink to 1.25 × the live size. Returns true when it did (a copy of the live data).
   */
  trim(): boolean {
    if (this.vertCap <= this.initialCap * 2 || this.live > this.vertCap * 0.6) return false;
    const cap = Math.max(this.initialCap, Math.ceil(this.live * 1.35));
    this.mesh.optimize();
    this.reserved = this.live;
    this.mesh.setGeometrySize(cap, cap);
    this.vertCap = cap;
    return true;
  }

  get liveVertices() {
    return this.live;
  }

  get capacity() {
    return this.vertCap;
  }

  private ensure(n: number) {
    if (this.mesh.unusedVertexCount >= n) return;
    // Compact first if a lot of space is held by deleted geometry.
    if (this.reserved - this.live > this.vertCap * 0.2) {
      this.mesh.optimize();
      this.reserved = this.live;
      if (this.mesh.unusedVertexCount >= n) return;
    }
    // Grow by a quarter (memory matters more than the occasional copy: the arrays stay in JS for
    // updates, and `trim` gives capacity back when the geometry streams out again).
    const cap = Math.ceil(Math.max(this.vertCap * this.growth, (this.live + n) * this.growth));
    this.mesh.optimize();
    this.reserved = this.live;
    this.mesh.setGeometrySize(cap, cap);
    this.vertCap = cap;
  }

  private ensureInstances(k = 1) {
    const m = this.mesh;
    if (m.instanceCount + k <= m.maxInstanceCount) return;
    m.setInstanceCount(Math.max(m.maxInstanceCount * 2, m.instanceCount + k));
  }

  /**
   * Add a geometry with one instance (identity matrix: the geometry is in world space). The batch takes the
   * geometry over: its normals are repacked to bytes in place (every caller disposes or discards it after).
   */
  add(geometry: THREE.BufferGeometry, matrix?: THREE.Matrix4): BatchRef {
    packNormals(geometry);
    const n = geometry.getAttribute('position').count;
    this.ensure(n);
    this.ensureInstances();
    const geom = this.mesh.addGeometry(geometry);
    const inst = this.mesh.addInstance(geom);
    if (matrix) this.mesh.setMatrixAt(inst, matrix);
    this.live += n;
    this.reserved += n;
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    this.track(inst, geometry.boundingSphere!, matrix);
    return { batch: this, geom, inst, verts: n };
  }

  /** Instance a shared geometry (added once under `key`). */
  instance(key: string, make: () => THREE.BufferGeometry, matrix: THREE.Matrix4): BatchRef {
    let s = this.shared.get(key);
    if (!s) {
      const g = make();
      packNormals(g);
      const n = g.getAttribute('position').count;
      this.ensure(n);
      if (!g.boundingSphere) g.computeBoundingSphere();
      s = { geom: this.mesh.addGeometry(g), verts: n, sphere: g.boundingSphere!.clone() };
      this.live += n;
      this.reserved += n;
      this.shared.set(key, s);
    }
    this.ensureInstances();
    const inst = this.mesh.addInstance(s.geom);
    this.mesh.setMatrixAt(inst, matrix);
    this.track(inst, s.sphere, matrix);
    return { batch: this, geom: s.geom, inst, verts: 0 };
  }

  /** Add a geometry that instances may use later (`place`), e.g. an LOD twin; returns its id. Takes the geometry over (normals packed in place). */
  addGeometry(geometry: THREE.BufferGeometry): number {
    packNormals(geometry);
    const n = geometry.getAttribute('position').count;
    this.ensure(n);
    const geom = this.mesh.addGeometry(geometry);
    this.live += n;
    this.reserved += n;
    return geom;
  }

  /** The id of a shape shared by many instances (made once under `key`; see `instance`). */
  shape(key: string, make: () => THREE.BufferGeometry): number {
    let s = this.shared.get(key);
    if (!s) {
      const g = make();
      packNormals(g);
      const n = g.getAttribute('position').count;
      this.ensure(n);
      if (!g.boundingSphere) g.computeBoundingSphere();
      s = { geom: this.mesh.addGeometry(g), verts: n, sphere: g.boundingSphere!.clone() };
      this.live += n;
      this.reserved += n;
      this.shared.set(key, s);
    }
    return s.geom;
  }

  /** One more instance of a geometry already in the batch (`sphere`: that geometry's bounds). */
  place(geom: number, matrix: THREE.Matrix4, sphere: THREE.Sphere): BatchRef {
    this.ensureInstances();
    const inst = this.mesh.addInstance(geom);
    this.mesh.setMatrixAt(inst, matrix);
    this.track(inst, sphere, matrix);
    return { batch: this, geom, inst, verts: 0 };
  }

  /**
   * For a batch that is finished (nothing more will be added, moved or removed): shrink the
   * buffers to the live size and let the vertex arrays go once uploaded, like a static mesh
   * (gfx/release). `trim`, `ensure` and every add must not be used afterwards. The freed arrays
   * cannot be uploaded again: a batch must not get `needsUpdate` set, and after a WebGL
   * context loss it would upload nothing (the game has no context-loss handler; like any static
   * mesh released by gfx/release, it needs a reload).
   */
  finish() {
    if (this.live < this.vertCap) {
      this.mesh.optimize();
      this.mesh.setGeometrySize(Math.max(1, this.live), Math.max(1, this.live));
      this.vertCap = Math.max(1, this.live);
    }
    // Per-geometry bounds are made on first use from the vertex arrays: make them all now.
    const box = new THREE.Box3();
    const sphere = new THREE.Sphere();
    // Walk the whole id range (an inactive id returns null but later ids may be live).
    for (let id = 0, n = (this.mesh as unknown as { _geometryCount: number })._geometryCount; id < n; id++) {
      if (this.mesh.getBoundingBoxAt(id, box) !== null) this.mesh.getBoundingSphereAt(id, sphere);
    }
    for (const a of Object.values(this.mesh.geometry.attributes)) (a as THREE.BufferAttribute).onUpload(freeArray);
    this.mesh.geometry.index?.onUpload(freeArray);
    this.finished = true;
  }

  finished = false;

  remove(ref: BatchRef) {
    if (ref.verts > 0) {
      this.mesh.deleteGeometry(ref.geom); // also deletes its instance
      this.live -= ref.verts;
    } else {
      this.mesh.deleteInstance(ref.inst);
    }
  }
}

export interface PoolOptions {
  /** Initial vertex capacity per batch. */
  verts?: number;
  /** Capacity growth factor when a batch fills (default 1.25). */
  growth?: number;
  /** Name of the pool's group and prefix of its batches' names (default 'city'). */
  name?: string;
  /** Give back unused capacity now and then (default true; a finished pool must not). */
  trim?: boolean;
}

/** A set of instances added together (a block level, a street piece…), toggled and removed as one. */
export class BatchHandle {
  visible = true;
  constructor(readonly refs: BatchRef[]) {}

  setVisible(v: boolean) {
    if (v === this.visible) return;
    this.visible = v;
    for (const r of this.refs) r.batch.mesh.setVisibleAt(r.inst, v);
  }

  dispose() {
    for (const r of this.refs) r.batch.remove(r);
    this.refs.length = 0;
  }

  get vertexCount() {
    let n = 0;
    for (const r of this.refs) n += r.verts;
    return n;
  }
}

export class BatchPool {
  readonly group = new THREE.Group();
  private batches = new Map<string, Batch>();
  /** The pool's copies of library materials, keyed by source uuid (+ ':off' for the offset copy). */
  private copies = new Map<string, { src: THREE.Material; copy: THREE.Material; version: number; offset: boolean }>();
  private trimAt = 0;

  constructor(parent: THREE.Object3D, private readonly opts: PoolOptions = {}) {
    this.group.name = opts.name ? `${opts.name}:batches` : 'city:batches';
    this.group.matrixAutoUpdate = false; // at the origin for good, like its batches
    parent.add(this.group);
  }

  /**
   * The batch for a material. `tag` keeps a family of geometry in batches of its own (the mid
   * level's, whose shadows the streamer can switch off as a whole, see `setShadows`).
   */
  get(material: THREE.Material, castShadow: boolean, offset = false, tag = ''): Batch {
    const key = `${material.uuid}|${castShadow ? 1 : 0}|${offset ? 1 : 0}|${tag}`;
    let b = this.batches.get(key);
    if (!b) {
      b = new Batch(this.own(material, offset), castShadow, `${this.opts.name ?? 'city'}:${material.name || 'mat'}${castShadow ? '' : ':ns'}${offset ? ':off' : ''}${tag ? `:${tag}` : ''}`, this.opts.verts, 64, this.opts.growth);
      b.tag = tag;
      b.shadowCaster = castShadow;
      if (castShadow && this.shadowsOff.has(tag)) b.mesh.castShadow = false;
      this.batches.set(key, b);
      this.group.add(b.mesh);
    }
    return b;
  }

  private shadowsOff = new Set<string>();

  /** Switch the shadows of every shadow-casting batch of a tag on or off. */
  setShadows(tag: string, on: boolean) {
    if (on) this.shadowsOff.delete(tag);
    else this.shadowsOff.add(tag);
    for (const b of this.batches.values()) if (b.tag === tag && b.shadowCaster) b.mesh.castShadow = on;
  }

  /**
   * The material a batch draws with: for a library material, the pool's copy (with the polygon
   * offset baked in for ground batches); the city's own materials (far massing, torch flames) as
   * they are.
   */
  private own(src: THREE.Material, offset: boolean): THREE.Material {
    const library = allMaterials().get(src.name as never) === src;
    if (!library) {
      // The city's own materials (far massing, torch flames) are drawn by the pool only.
      if (offset) Object.assign(src, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
      return src;
    }
    const key = `${src.uuid}${offset ? ':off' : ''}`;
    let c = this.copies.get(key);
    if (!c) {
      c = { src, copy: copyMaterial(src, offset), version: src.version, offset };
      this.copies.set(key, c);
    }
    return c.copy;
  }

  /**
   * Keep the copies in step with their library materials (textures arrive after creation, quality
   * settings change maps), and now and then give unused batch capacity back. Call once a frame.
   */
  sync() {
    for (const c of this.copies.values()) {
      if (c.src.version === c.version) continue;
      c.version = c.src.version;
      refreshCopy(c.copy, c.src, c.offset);
    }
    // Every second, batches holding mostly dead capacity, ≤ ~400k live vertices copied per round.
    if (this.opts.trim !== false && ++this.trimAt % 60 === 0) {
      let copied = 0;
      for (const b of this.batches.values()) {
        if (copied > 400_000) break;
        if (b.trim()) copied += b.liveVertices;
      }
    }
  }

  /** Add every mesh of a MeshBuilder-built group (world-space geometry) as one instance each. */
  addGroup(group: THREE.Object3D, opts: { offset?: boolean | ((material: THREE.Material) => boolean); shadows?: boolean; tag?: string } = {}): BatchHandle {
    const refs: BatchRef[] = [];
    group.updateMatrixWorld(true);
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.Material;
      const off = typeof opts.offset === 'function' ? opts.offset(mat) : !!opts.offset;
      const batch = this.get(mat, mesh.castShadow && opts.shadows !== false, off, opts.tag);
      const g = mesh.geometry;
      if (!g.getAttribute('position')?.count) return;
      const im = mesh as THREE.InstancedMesh;
      if (im.isInstancedMesh) {
        // Instanced parts (e.g. kit columns): one batch instance per instance matrix.
        const flat = g.index ? g.toNonIndexed() : g;
        const key = `${g.uuid}`;
        const m = new THREE.Matrix4();
        for (let i = 0; i < im.count; i++) {
          im.getMatrixAt(i, m);
          refs.push(batch.instance(key, () => flat, mesh.matrixWorld.clone().multiply(m)));
        }
        return;
      }
      const isIdentity = mesh.matrixWorld.equals(IDENTITY);
      refs.push(batch.add(g.index ? g.toNonIndexed() : g, isIdentity ? undefined : mesh.matrixWorld));
    });
    // The batches copied the data: free the builder's geometry.
    group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    return new BatchHandle(refs);
  }

  /** Wrap refs added straight to a batch as one handle. */
  handle(refs: BatchRef[]): BatchHandle {
    return new BatchHandle(refs);
  }

  all(): Batch[] {
    return [...this.batches.values()];
  }

  /** Vertex counts (live) per batch, for debugging. */
  stats() {
    let verts = 0, cap = 0, inst = 0;
    for (const b of this.batches.values()) {
      verts += b.liveVertices;
      cap += b.capacity;
      inst += b.mesh.instanceCount;
    }
    return { batches: this.batches.size, verts, cap, instances: inst };
  }
}

const IDENTITY = new THREE.Matrix4();

/** A copy of a library material, shader patch included (three's copy() drops it). */
function copyMaterial(src: THREE.Material, offset: boolean): THREE.Material {
  const m = src.clone();
  refreshCopy(m, src, offset);
  return m;
}

function refreshCopy(m: THREE.Material, src: THREE.Material, offset: boolean) {
  m.copy(src);
  const s = src as THREE.Material & { defines?: Record<string, unknown> };
  (m as THREE.Material & { defines?: Record<string, unknown> }).defines = s.defines ? { ...s.defines } : undefined;
  m.onBeforeCompile = src.onBeforeCompile;
  m.customProgramCacheKey = src.customProgramCacheKey;
  m.userData = src.userData;
  // Ground-hugging batches draw a little toward the camera, so they never fight the terrain.
  m.polygonOffset = offset;
  m.polygonOffsetFactor = offset ? -1 : 0;
  m.polygonOffsetUnits = offset ? -4 : 0;
  m.needsUpdate = true;
}

