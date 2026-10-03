/**
 * Accumulates procedural geometry per material, then merges it into one mesh per material
 * (one draw call each). Also collects collider specs so physics can be registered with the
 * same placement transform. Typical use:
 *
 *   const b = new MeshBuilder();
 *   b.add(new THREE.CylinderGeometry(0.4, 0.45, 6, 16), 'marble', new THREE.Matrix4().makeTranslation(0, 3, 0));
 *   b.box('travertine', 10, 1, 6, new THREE.Matrix4().makeTranslation(0, 0.5, 0), { collide: true });
 *   const group = b.build('temple');            // THREE.Group, local space
 *   placeAndRegister(game, group, b.colliders, position, rotationY);
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Game } from '../core/Game';
import { Layer } from '../core/Physics';
import { getMaterial } from './materials';
import type { MaterialId } from './materialIds';
import { boxProjectUVs } from './uv';

export type ColliderSpec =
  | { kind: 'box'; center: THREE.Vector3; half: THREE.Vector3; rotation?: THREE.Quaternion }
  | { kind: 'cylinder'; center: THREE.Vector3; halfHeight: number; radius: number }
  | { kind: 'trimesh'; geometry: THREE.BufferGeometry; matrix?: THREE.Matrix4 };

export interface AddOptions {
  /** 'box' re-projects UVs at world scale (default for most stone); 'keep' keeps the geometry's own UVs. */
  uv?: 'box' | 'keep';
  /** Meters per texture repeat for box UVs. */
  uvScale?: number;
  castShadow?: boolean;
}

const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();

export class MeshBuilder {
  private parts = new Map<string, THREE.BufferGeometry[]>();
  private shadow = new Map<string, boolean>();
  readonly colliders: ColliderSpec[] = [];

  /** Add geometry (it is cloned and transformed; the input is not modified). */
  add(geometry: THREE.BufferGeometry, material: MaterialId, matrix?: THREE.Matrix4, opts: AddOptions = {}): this {
    let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (matrix) g.applyMatrix4(matrix);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if ((opts.uv ?? 'box') === 'box' || !g.getAttribute('uv')) g = boxProjectUVs(g, opts.uvScale ?? 2);
    // Keep only the attributes every part shares so merging never fails.
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    g.morphAttributes = {};
    const key = `${material}|${opts.castShadow === false ? 0 : 1}`;
    const list = this.parts.get(key) ?? [];
    list.push(g);
    this.parts.set(key, list);
    return this;
  }

  /** Axis-aligned box (before `matrix`) with optional matching collider. */
  box(material: MaterialId, w: number, h: number, d: number, matrix?: THREE.Matrix4, opts: AddOptions & { collide?: boolean } = {}): this {
    this.add(new THREE.BoxGeometry(w, h, d), material, matrix, opts);
    if (opts.collide) {
      const m = matrix ?? new THREE.Matrix4();
      m.decompose(tmpPos, tmpQuat, tmpScale);
      this.colliders.push({
        kind: 'box',
        center: tmpPos.clone(),
        half: new THREE.Vector3((w * tmpScale.x) / 2, (h * tmpScale.y) / 2, (d * tmpScale.z) / 2),
        rotation: tmpQuat.clone(),
      });
    }
    return this;
  }

  collider(spec: ColliderSpec): this {
    this.colliders.push(spec);
    return this;
  }

  /** Merge into a Group with one Mesh per material. */
  build(name = 'built'): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    for (const [key, geoms] of this.parts) {
      const [material, shadow] = key.split('|');
      const merged = geoms.length === 1 ? geoms[0] : mergeGeometries(geoms, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, getMaterial(material as MaterialId));
      mesh.name = `${name}:${material}`;
      mesh.castShadow = shadow === '1';
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }

  /** Merge another builder's parts and colliders into this one, transformed by `matrix`. */
  append(other: MeshBuilder, matrix?: THREE.Matrix4): this {
    for (const [key, geoms] of other.parts) {
      const list = this.parts.get(key) ?? [];
      for (const g of geoms) list.push(matrix ? g.clone().applyMatrix4(matrix) : g);
      this.parts.set(key, list);
    }
    for (const c of other.colliders) this.colliders.push(matrix ? transformCollider(c, matrix) : c);
    return this;
  }

  get isEmpty() {
    return this.parts.size === 0;
  }
}

export function transformCollider(c: ColliderSpec, m: THREE.Matrix4): ColliderSpec {
  m.decompose(tmpPos, tmpQuat, tmpScale);
  if (c.kind === 'box') {
    return {
      kind: 'box',
      center: c.center.clone().applyMatrix4(m),
      half: c.half.clone().multiply(tmpScale),
      rotation: tmpQuat.clone().multiply(c.rotation ?? new THREE.Quaternion()),
    };
  }
  if (c.kind === 'cylinder') {
    return { kind: 'cylinder', center: c.center.clone().applyMatrix4(m), halfHeight: c.halfHeight * tmpScale.y, radius: c.radius * tmpScale.x };
  }
  return { kind: 'trimesh', geometry: c.geometry, matrix: c.matrix ? m.clone().multiply(c.matrix) : m.clone() };
}

/** Register collider specs (already in world space, or transformed by `matrix`). */
export function registerColliders(game: Game, specs: ColliderSpec[], matrix?: THREE.Matrix4, owner?: unknown) {
  for (const s0 of specs) {
    const s = matrix ? transformCollider(s0, matrix) : s0;
    if (s.kind === 'box') {
      game.physics.addOrientedBox(s.center, s.half, s.rotation ?? new THREE.Quaternion(), { owner, layer: Layer.World });
    } else if (s.kind === 'cylinder') {
      game.physics.addCylinder(s.center, s.halfHeight, s.radius, { owner, layer: Layer.World });
    } else {
      game.physics.addTrimesh(s.geometry, s.matrix, { owner, layer: Layer.World });
    }
  }
}

/** Position/rotate a built group in the world, register its colliders, and add it to the world registry. */
export function placeAndRegister(
  game: Game,
  id: string,
  group: THREE.Object3D,
  colliders: ColliderSpec[],
  position: THREE.Vector3Like,
  rotationY = 0,
  opts: { cullDistance?: number; owner?: unknown } = {},
) {
  group.position.set(position.x, position.y, position.z);
  group.rotation.y = rotationY;
  group.updateMatrixWorld(true);
  registerColliders(game, colliders, group.matrixWorld, opts.owner);
  if (game.world) game.world.add(id, group, { cullDistance: opts.cullDistance });
  else game.scene.add(group);
  return group;
}
