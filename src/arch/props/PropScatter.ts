/**
 * Instanced placement of many props: one InstancedMesh per (prop kind, variant, material), so a
 * thousand amphorae cost a handful of draw calls.
 *
 *   const s = new PropScatter();
 *   s.add('amphora_tall', { x, y, z }, rotY);
 *   placeAndRegister(game, 'props', s.build(), s.colliders(), { x: 0, y: 0, z: 0 });
 */
import * as THREE from 'three';
import { getMaterial } from '../../gfx/materials';
import { transformCollider, type ColliderSpec } from '../../gfx/MeshBuilder';
import { makeProp, type PropKind, type PropModel } from './props';
import type { Rng } from '../../core/Rng';

interface Batch {
  model: PropModel;
  matrices: THREE.Matrix4[];
  collide: boolean[];
}

export class PropScatter {
  private batches = new Map<string, Batch>();
  private total = 0;

  /** Add one instance. `variant` (0..2) picks a seeded variant; `rng` picks one at random. */
  add(kind: PropKind, position: THREE.Vector3Like, rotationY = 0, scale = 1, opts: { variant?: number; rng?: Rng; collide?: boolean } = {}): this {
    const model = makeProp(kind, opts.rng, opts.variant);
    const key = `${model.kind}#${model.variant}`;
    let b = this.batches.get(key);
    if (!b) {
      b = { model, matrices: [], collide: [] };
      this.batches.set(key, b);
    }
    b.matrices.push(
      new THREE.Matrix4().compose(
        new THREE.Vector3(position.x, position.y, position.z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY),
        new THREE.Vector3(scale, scale, scale),
      ),
    );
    b.collide.push(opts.collide !== false);
    this.total++;
    return this;
  }

  get count() {
    return this.total;
  }

  /** Number of InstancedMeshes `build()` will create (= draw calls when all are visible). */
  get meshCount() {
    let n = 0;
    for (const b of this.batches.values()) n += b.model.parts.length;
    return n;
  }

  build(name = 'props'): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    for (const [key, b] of this.batches) {
      for (const part of b.model.parts) {
        const mesh = new THREE.InstancedMesh(part.geometry, getMaterial(part.material), b.matrices.length);
        mesh.name = `${name}:${key}:${part.material}`;
        b.matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.castShadow = part.castShadow;
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        group.add(mesh);
      }
    }
    return group;
  }

  /** World-space colliders of every instance that wants them. */
  colliders(): ColliderSpec[] {
    const out: ColliderSpec[] = [];
    for (const b of this.batches.values()) {
      b.matrices.forEach((m, i) => {
        if (!b.collide[i]) return;
        for (const c of b.model.colliders) out.push(transformCollider(c, m));
      });
    }
    return out;
  }
}
