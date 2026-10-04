/**
 * Forest: instanced trees and shrubs with distance LOD. Per (species, variant) there is one
 * InstancedMesh per near part (bark, foliage, flowers) and one for the far stand-in; `update(camera)`
 * re-sorts instances between them by distance (only when the camera has moved a few meters).
 * Draw calls therefore depend on the number of species × variants, not on the number of trees.
 *
 *   const f = new Forest({ near: 110 });
 *   f.add('umbrella_pine', x, y, z, { scale: 1.1 });
 *   game.scene.add(f.build());  vegetation(game).addForest(f);   // LOD + wind
 */
import * as THREE from 'three';
import { Rng } from '../../core/Rng';
import type { ColliderSpec } from '../../gfx/MeshBuilder';
import { vegMaterial, type VegProfile } from './materials';
import { makeTree, TREE_VARIANTS, type TreeModel, type TreePart, type TreeSpecies, type WindKind } from './species';

export const WIND: Record<WindKind, VegProfile> = {
  tree: { sway: 0.00045, flutter: 0.025 },
  shrub: { sway: 0.012, flutter: 0.02 },
  reed: { sway: 0.06, flutter: 0.02 },
  flower: { sway: 0.2, flutter: 0.01 },
};

export interface ForestOptions {
  /** Full detail within this distance (m). */
  near?: number;
  /** Far LOD until this distance; beyond it trees are culled. */
  far?: number;
  castShadow?: boolean;
  seed?: number;
}

interface Inst {
  pos: THREE.Vector3;
  matrix: THREE.Matrix4;
  color: THREE.Color;
}

interface Batch {
  model: TreeModel;
  items: Inst[];
  near: THREE.InstancedMesh[];
  far: THREE.InstancedMesh[];
}

const FLOWER_COLORS = [0xf06a9a, 0xf3b6c8, 0xfaf3f0, 0xd93b5b, 0xf5a3bd];

export class Forest {
  readonly group = new THREE.Group();
  private batches = new Map<string, Batch>();
  private nearD: number;
  private farD: number;
  private lastCam = new THREE.Vector3(Infinity, 0, 0);
  private rng: Rng;
  private shadow: boolean;
  /** Instances drawn at full detail after the last update. */
  nearCount = 0;
  farCount = 0;

  constructor(opts: ForestOptions = {}) {
    this.nearD = opts.near ?? 110;
    this.farD = opts.far ?? 1600;
    this.shadow = opts.castShadow ?? true;
    this.rng = new Rng(opts.seed ?? 11);
    this.group.name = 'forest';
  }

  add(species: TreeSpecies, x: number, y: number, z: number, o: { scale?: number; rotationY?: number; variant?: number } = {}): this {
    const variant = o.variant ?? this.rng.int(0, TREE_VARIANTS - 1);
    const key = `${species}#${variant}`;
    let b = this.batches.get(key);
    if (!b) {
      b = { model: makeTree(species, variant), items: [], near: [], far: [] };
      this.batches.set(key, b);
    }
    const s = o.scale ?? this.rng.range(0.85, 1.15);
    const pos = new THREE.Vector3(x, y, z);
    const matrix = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.rotationY ?? this.rng.range(0, Math.PI * 2)), new THREE.Vector3(s, s * this.rng.range(0.92, 1.08), s));
    b.items.push({ pos, matrix, color: new THREE.Color(this.rng.pick(FLOWER_COLORS)) });
    return this;
  }

  get count() {
    let n = 0;
    for (const b of this.batches.values()) n += b.items.length;
    return n;
  }

  private mesh(part: TreePart, n: number, shadow: boolean): THREE.InstancedMesh {
    const mat = vegMaterial(part.baked ? 'baked' : part.material, { ...WIND[part.wind], heads: part.heads });
    const m = new THREE.InstancedMesh(part.geometry, mat, n);
    m.castShadow = shadow;
    m.receiveShadow = true;
    m.count = 0;
    // Hidden while empty: three still binds the program and uploads uniforms for an empty
    // InstancedMesh before skipping the draw (~1,300 of them at once across the city's forests).
    m.visible = false;
    if (part.heads) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return m;
  }

  build(): THREE.Group {
    for (const [key, b] of this.batches) {
      const n = b.items.length;
      // One bounding sphere for every LOD mesh of the batch (frustum culling at batch level).
      const box = new THREE.Box3();
      for (const it of b.items) box.expandByPoint(it.pos);
      box.expandByVector(new THREE.Vector3(b.model.radius * 1.3, 0, b.model.radius * 1.3));
      box.max.y += b.model.height * 1.3;
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      for (const part of b.model.near) b.near.push(this.mesh(part, n, this.shadow));
      for (const part of b.model.far) b.far.push(this.mesh(part, n, false));
      for (const m of [...b.near, ...b.far]) {
        m.name = `forest:${key}`;
        m.boundingSphere = sphere.clone();
        this.group.add(m);
      }
    }
    return this.group;
  }

  /** Re-assign instances to near / far / culled for a camera position. */
  update(cam: THREE.Vector3, force = false) {
    if (!force && cam.distanceToSquared(this.lastCam) < 4) return;
    this.lastCam.copy(cam);
    const n2 = this.nearD * this.nearD, f2 = this.farD * this.farD;
    this.nearCount = this.farCount = 0;
    for (const b of this.batches.values()) {
      let ni = 0, fi = 0;
      const hasFar = b.far.length > 0;
      for (const it of b.items) {
        const d2 = it.pos.distanceToSquared(cam);
        if (d2 < n2) {
          for (const m of b.near) {
            m.setMatrixAt(ni, it.matrix);
            if (m.instanceColor) m.setColorAt(ni, it.color);
          }
          ni++;
        } else if (hasFar && d2 < f2) {
          for (const m of b.far) m.setMatrixAt(fi, it.matrix);
          fi++;
        }
      }
      for (const m of b.near) {
        if (!ni && !m.count) continue; // stays empty: nothing to upload
        m.count = ni;
        m.visible = ni > 0;
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
      for (const m of b.far) {
        if (!fi && !m.count) continue;
        m.count = fi;
        m.visible = fi > 0;
        m.instanceMatrix.needsUpdate = true;
      }
      this.nearCount += ni;
      this.farCount += fi;
    }
  }

  /** Trunk colliders (vertical cylinders) for trees with a trunk. */
  colliders(): ColliderSpec[] {
    const out: ColliderSpec[] = [];
    const s = new THREE.Vector3();
    for (const b of this.batches.values()) {
      if (!b.model.trunkRadius) continue;
      for (const it of b.items) {
        s.setFromMatrixScale(it.matrix);
        out.push({ kind: 'cylinder', center: it.pos.clone().add(new THREE.Vector3(0, 1.5 * s.y, 0)), halfHeight: 1.5 * s.y, radius: b.model.trunkRadius * s.x });
      }
    }
    return out;
  }
}
