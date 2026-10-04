/**
 * TreeLayer: the city's trees as instanced meshes (one InstancedMesh per species × variant × part
 * for the near model and one for the far stand-in, shared by the whole city), with instances
 * bucketed in square cells. Each update writes only the instances of cells inside the (slightly
 * widened) view frustum, at near or far detail by distance, and thins the far ones out with
 * distance, so the draw calls stay at species × variants and the triangles follow the view.
 */
import * as THREE from 'three';
import { Rng } from '../../core/Rng';
import { WIND } from '../../arch/vegetation/Forest';
import { vegMaterial } from '../../arch/vegetation/materials';
import { makeTree, TREE_VARIANTS, type TreeModel, type TreePart, type TreeSpecies } from '../../arch/vegetation/species';
import type { ColliderSpec } from '../../gfx/MeshBuilder';

export interface TreeLayerOptions {
  /** Full detail within this distance (m). */
  near?: number;
  /** Far stand-ins until this distance. */
  far?: number;
  /** Far stand-ins start thinning out here (fraction kept falls to `minKeep` at `far`). */
  thinFrom?: number;
  minKeep?: number;
  cell?: number;
  seed?: number;
  /** Variants per species used (fewer = fewer draw calls). */
  variants?: number;
}

interface BatchDef {
  key: string;
  model: TreeModel;
  /** Batch whose far meshes draw this batch's far instances (variant 0 of the species). */
  farOf: number;
  near: THREE.InstancedMesh[];
  far: THREE.InstancedMesh[];
  capNear: number;
  capFar: number;
  nNear: number;
  nFar: number;
}

interface CellItems {
  /** Per batch index: packed matrices, positions and importance (typed copies made lazily). */
  byBatch: Map<number, { mats: number[]; pos: number[]; imp: number[]; fm?: Float32Array }>;
  sphere: THREE.Sphere;
  count: number;
}

const FLOWER = [0xf06a9a, 0xf3b6c8, 0xfaf3f0, 0xd93b5b, 0xf5a3bd];

export class TreeLayer {
  readonly group = new THREE.Group();
  private o: Required<TreeLayerOptions>;
  private batches: BatchDef[] = [];
  private batchIndex = new Map<string, number>();
  private cells = new Map<string, CellItems>();
  private rng: Rng;
  private lastPos = new THREE.Vector3(Infinity, 0, 0);
  private lastDir = new THREE.Vector3();
  private frustum = new THREE.Frustum();
  private pv = new THREE.Matrix4();
  private built = false;
  private trunks: { x: number; y: number; z: number; s: number; r: number }[] = [];
  /** Instances drawn after the last update. */
  nearCount = 0;
  farCount = 0;
  total = 0;

  constructor(opts: TreeLayerOptions = {}) {
    this.o = { near: 60, far: 1300, thinFrom: 280, minKeep: 0.18, cell: 96, seed: 7, variants: 2, ...opts };
    this.rng = new Rng(this.o.seed);
    this.group.name = 'city:trees';
  }

  private batchFor(species: TreeSpecies, variant: number): number {
    const key = `${species}#${variant}`;
    let bi = this.batchIndex.get(key);
    if (bi === undefined) {
      // Far instances of every variant are drawn with variant 0's stand-in (one draw per species).
      const farOf = variant === 0 ? this.batches.length : this.batchFor(species, 0);
      bi = this.batches.length;
      this.batchIndex.set(key, bi);
      this.batches.push({ key, model: makeTree(species, variant), farOf, near: [], far: [], capNear: 0, capFar: 0, nNear: 0, nFar: 0 });
    }
    return bi;
  }

  add(species: TreeSpecies, x: number, y: number, z: number, o: { scale?: number; variant?: number; rotationY?: number } = {}) {
    const variant = o.variant ?? this.rng.int(0, Math.min(TREE_VARIANTS, this.o.variants) - 1);
    const bi = this.batchFor(species, variant);
    const s = o.scale ?? this.rng.range(0.85, 1.15);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.rotationY ?? this.rng.range(0, Math.PI * 2)),
      new THREE.Vector3(s, s * this.rng.range(0.92, 1.08), s),
    );
    const ck = `${Math.floor(x / this.o.cell)},${Math.floor(z / this.o.cell)}`;
    let c = this.cells.get(ck);
    if (!c) {
      const [ix, iz] = ck.split(',').map(Number);
      const half = this.o.cell / 2;
      c = { byBatch: new Map(), sphere: new THREE.Sphere(new THREE.Vector3((ix + 0.5) * this.o.cell, y, (iz + 0.5) * this.o.cell), half * Math.SQRT2 + 20), count: 0 };
      this.cells.set(ck, c);
    }
    let arr = c.byBatch.get(bi);
    if (!arr) c.byBatch.set(bi, (arr = { mats: [], pos: [], imp: [] }));
    arr.mats.push(...m.elements);
    arr.fm = undefined;
    arr.pos.push(x, y, z);
    arr.imp.push(this.rng.next());
    c.count++;
    // Keep the cell sphere's height near its trees.
    c.sphere.center.y += (y - c.sphere.center.y) / c.count;
    this.total++;
    const model = this.batches[bi].model;
    if (model.trunkRadius) this.trunks.push({ x, y, z, s, r: model.trunkRadius });
  }

  /** Create the instanced meshes (call once the library textures have loaded). */
  build(): THREE.Group {
    if (this.built) return this.group;
    this.built = true;
    for (const b of this.batches) {
      b.capNear = 64;
      b.capFar = 256;
      b.near = b.model.near.map((p) => this.mesh(p, b.capNear, true, b.key));
      b.far = b.farOf === this.batches.indexOf(b) ? b.model.far.map((p) => this.mesh(p, b.capFar, false, b.key)) : [];
    }
    return this.group;
  }

  private mesh(part: TreePart, n: number, shadow: boolean, key: string): THREE.InstancedMesh {
    const mat = vegMaterial(part.baked ? 'baked' : part.material, { ...WIND[part.wind], heads: part.heads });
    const m = new THREE.InstancedMesh(part.geometry, mat, n);
    m.name = `city:tree:${key}`;
    m.castShadow = shadow;
    m.receiveShadow = true;
    m.count = 0;
    m.visible = false; // hidden while empty (see Forest.mesh)
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (part.heads) {
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      const c = new THREE.Color();
      for (let i = 0; i < n; i++) m.setColorAt(i, c.setHex(FLOWER[i % FLOWER.length]));
    }
    this.group.add(m);
    return m;
  }

  private grow(b: BatchDef, near: boolean, need: number) {
    const cap = Math.max(need, (near ? b.capNear : b.capFar) * 2);
    const list = near ? b.near : b.far;
    const parts = near ? b.model.near : b.model.far;
    for (let k = 0; k < list.length; k++) {
      const old = list[k];
      this.group.remove(old);
      old.dispose();
      list[k] = this.mesh(parts[k], cap, near, b.key);
    }
    if (near) b.capNear = cap;
    else b.capFar = cap;
  }

  /** Re-assign instances for a camera; cheap when the camera has not moved or turned. */
  update(camera: THREE.Camera, distanceScale = 1, force = false) {
    if (!this.built) return;
    const pos = camera.getWorldPosition(TMP_P);
    const dir = camera.getWorldDirection(TMP_D);
    if (!force && pos.distanceToSquared(this.lastPos) < 4 && dir.dot(this.lastDir) > 0.995) return;
    this.lastPos.copy(pos);
    this.lastDir.copy(dir);
    camera.updateMatrixWorld();
    this.pv.multiplyMatrices((camera as THREE.PerspectiveCamera).projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);
    const near = this.o.near * distanceScale, far = this.o.far * distanceScale, thin = this.o.thinFrom * distanceScale;
    const n2 = near * near, f2 = far * far;
    for (const b of this.batches) b.nNear = b.nFar = 0;
    // First pass: count, so the meshes can grow before writing.
    const vis: CellItems[] = [];
    for (const c of this.cells.values()) {
      const d = c.sphere.center.distanceTo(pos) - c.sphere.radius;
      if (d > far) continue;
      if (d > 30 && !this.frustum.intersectsSphere(c.sphere)) continue;
      vis.push(c);
    }
    const keep = (d2: number) => {
      const d = Math.sqrt(d2);
      if (d <= thin) return 1;
      return 1 - (1 - this.o.minKeep) * Math.min(1, (d - thin) / Math.max(1, far - thin));
    };
    // Two passes: count (so the meshes can grow), then write the matrices.
    for (let pass = 0; pass < 2; pass++) {
      for (const c of vis) {
        for (const [bi, arr] of c.byBatch) {
          const b = this.batches[bi];
          const fb = this.batches[b.farOf];
          const hasFar = fb.far.length > 0;
          const fm = arr.fm ?? (arr.fm = Float32Array.from(arr.mats));
          for (let i = 0; i < arr.imp.length; i++) {
            const dx = arr.pos[i * 3] - pos.x, dy = arr.pos[i * 3 + 1] - pos.y, dz = arr.pos[i * 3 + 2] - pos.z;
            const d2 = dx * dx + dy * dy + dz * dz;
            let list: THREE.InstancedMesh[] | null = null, slot = 0;
            if (d2 < n2) {
              slot = b.nNear++;
              list = b.near;
            } else if (hasFar && d2 < f2 && arr.imp[i] < keep(d2)) {
              slot = fb.nFar++;
              list = fb.far;
            }
            if (!list || pass === 0) continue;
            for (const m of list) {
              const dst = m.instanceMatrix.array as Float32Array;
              const o = slot * 16, src = i * 16;
              for (let k = 0; k < 16; k++) dst[o + k] = fm[src + k];
            }
          }
        }
      }
      if (pass === 0) {
        for (const b of this.batches) {
          if (b.nNear > b.capNear) this.grow(b, true, b.nNear + 32);
          if (b.nFar > b.capFar && b.far.length) this.grow(b, false, b.nFar + 128);
          b.nNear = b.nFar = 0;
        }
      }
    }
    this.nearCount = this.farCount = 0;
    for (const b of this.batches) {
      for (const m of b.near) {
        m.count = b.nNear;
        m.visible = b.nNear > 0;
        m.instanceMatrix.needsUpdate = true;
      }
      for (const m of b.far) {
        m.count = b.nFar;
        m.visible = b.nFar > 0;
        m.instanceMatrix.needsUpdate = true;
      }
      this.nearCount += b.nNear;
      this.farCount += b.nFar;
    }
  }

  /**
   * Trunk colliders grouped in square cells of `cell` m: centre, radius and a maker for the specs
   * (handed to ProximityColliders, so only the trees near the player have colliders).
   */
  trunkGroups(cell = 32): { x: number; z: number; r: number; specs: () => ColliderSpec[] }[] {
    const cells = new Map<string, typeof this.trunks>();
    for (const t of this.trunks) {
      const k = `${Math.floor(t.x / cell)},${Math.floor(t.z / cell)}`;
      const l = cells.get(k);
      if (l) l.push(t);
      else cells.set(k, [t]);
    }
    return [...cells.entries()].map(([k, list]) => {
      const [ix, iz] = k.split(',').map(Number);
      return {
        x: (ix + 0.5) * cell, z: (iz + 0.5) * cell, r: cell * Math.SQRT1_2,
        specs: () => list.map((t): ColliderSpec => ({ kind: 'cylinder', center: new THREE.Vector3(t.x, t.y + 1.5 * t.s, t.z), halfHeight: 1.5 * t.s, radius: t.r * t.s })),
      };
    });
  }

  /** Trunks as discs (game m) grown by a walker's radius and a margin, for keeping paths clear. */
  trunkDiscs(): { x: number; z: number; r: number }[] {
    return this.trunks.map((t) => ({ x: t.x, z: t.z, r: t.r * t.s + 0.55 }));
  }

  /** Trunk colliders of the trees inside a rectangle (game m). */
  colliders(area?: { minX: number; minZ: number; maxX: number; maxZ: number }): ColliderSpec[] {
    const out: ColliderSpec[] = [];
    for (const t of this.trunks) {
      if (area && (t.x < area.minX || t.x > area.maxX || t.z < area.minZ || t.z > area.maxZ)) continue;
      out.push({ kind: 'cylinder', center: new THREE.Vector3(t.x, t.y + 1.5 * t.s, t.z), halfHeight: 1.5 * t.s, radius: t.r * t.s });
    }
    return out;
  }
}

const TMP_P = new THREE.Vector3();
const TMP_D = new THREE.Vector3();
