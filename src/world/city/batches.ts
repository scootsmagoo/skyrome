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
 */
import * as THREE from 'three';

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
  readonly shared = new Map<string, { geom: number; verts: number }>();

  constructor(material: THREE.Material, castShadow: boolean, name: string, verts = 65536, instances = 256) {
    this.vertCap = verts;
    this.mesh = new THREE.BatchedMesh(instances, verts, verts, material);
    this.mesh.name = name;
    this.mesh.castShadow = castShadow;
    this.mesh.receiveShadow = true;
    // Culled per instance; the batch's own bounding sphere would go stale as geometry streams in.
    this.mesh.frustumCulled = false;
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
    if (this.reserved - this.live > this.vertCap * 0.3) {
      this.mesh.optimize();
      this.reserved = this.live;
      if (this.mesh.unusedVertexCount >= n) return;
    }
    const cap = Math.max(this.vertCap * 2, this.live + n * 2);
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

  /** Add a geometry with one instance (identity matrix: the geometry is in world space). */
  add(geometry: THREE.BufferGeometry, matrix?: THREE.Matrix4): BatchRef {
    const n = geometry.getAttribute('position').count;
    this.ensure(n);
    this.ensureInstances();
    const geom = this.mesh.addGeometry(geometry);
    const inst = this.mesh.addInstance(geom);
    if (matrix) this.mesh.setMatrixAt(inst, matrix);
    this.live += n;
    this.reserved += n;
    return { batch: this, geom, inst, verts: n };
  }

  /** Instance a shared geometry (added once under `key`). */
  instance(key: string, make: () => THREE.BufferGeometry, matrix: THREE.Matrix4): BatchRef {
    let s = this.shared.get(key);
    if (!s) {
      const g = make();
      const n = g.getAttribute('position').count;
      this.ensure(n);
      s = { geom: this.mesh.addGeometry(g), verts: n };
      this.live += n;
      this.reserved += n;
      this.shared.set(key, s);
    }
    this.ensureInstances();
    const inst = this.mesh.addInstance(s.geom);
    this.mesh.setMatrixAt(inst, matrix);
    return { batch: this, geom: s.geom, inst, verts: 0 };
  }

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
  /** Ground-hugging batches drawn with a polygon offset (roads, yards, plazas over the terrain). */
  private offsetMats = new Set<THREE.Material>();

  constructor(parent: THREE.Object3D, private readonly opts: PoolOptions = {}) {
    this.group.name = 'city:batches';
    parent.add(this.group);
  }

  get(material: THREE.Material, castShadow: boolean, offset = false): Batch {
    const key = `${material.uuid}|${castShadow ? 1 : 0}|${offset ? 1 : 0}`;
    let b = this.batches.get(key);
    if (!b) {
      b = new Batch(material, castShadow, `city:${material.name || 'mat'}${castShadow ? '' : ':ns'}${offset ? ':off' : ''}`, this.opts.verts);
      if (offset) installOffset(b.mesh, material);
      this.batches.set(key, b);
      this.group.add(b.mesh);
    }
    return b;
  }

  /** Add every mesh of a MeshBuilder-built group (world-space geometry) as one instance each. */
  addGroup(group: THREE.Object3D, opts: { offset?: boolean | ((material: THREE.Material) => boolean); shadows?: boolean } = {}): BatchHandle {
    const refs: BatchRef[] = [];
    group.updateMatrixWorld(true);
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.Material;
      const off = typeof opts.offset === 'function' ? opts.offset(mat) : !!opts.offset;
      const batch = this.get(mat, mesh.castShadow && opts.shadows !== false, off);
      const g = mesh.geometry;
      if (!g.getAttribute('position')?.count) return;
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

/**
 * Draw a batch with a polygon offset toward the camera, without touching the shared library
 * material: the flag is a render state, so it is switched on just for this object's draw.
 */
function installOffset(mesh: THREE.BatchedMesh, material: THREE.Material) {
  const before = mesh.onBeforeRender.bind(mesh);
  mesh.onBeforeRender = (renderer, scene, camera, geometry, mat, group) => {
    before(renderer, scene, camera, geometry, mat, group);
    material.polygonOffset = true;
    material.polygonOffsetFactor = -1;
    material.polygonOffsetUnits = -4;
  };
  mesh.onAfterRender = () => {
    material.polygonOffset = false;
    material.polygonOffsetFactor = 0;
    material.polygonOffsetUnits = 0;
  };
}
