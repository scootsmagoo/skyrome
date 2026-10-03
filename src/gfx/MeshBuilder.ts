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
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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

/** One piece of a repeated object (see MeshBuilder.instance), in the object's own frame. */
export interface InstancePart {
  geometry: THREE.BufferGeometry;
  material: MaterialId | THREE.Material;
  uv?: 'box' | 'keep';
  uvScale?: number;
  castShadow?: boolean;
}

/**
 * Prepared geometry for an instanced key: one indexed geometry per material (and shadow flag),
 * shared by every builder and every build — a colonnade of 30 columns holds one column's
 * vertices, and so does every temple with the same columns.
 */
const instanceGeometry = new Map<string, Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material | MaterialId; castShadow: boolean }>>();

const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();

export class MeshBuilder {
  private parts = new Map<string, THREE.BufferGeometry[]>();
  private shadow = new Map<string, boolean>();
  /** One-off materials (inscriptions, painted signs) passed as THREE.Material, keyed '#uuid'. */
  private custom = new Map<string, THREE.Material>();
  /** Instanced objects: key → placements (and how to make the parts, once). */
  private instances = new Map<string, { make: () => InstancePart[]; matrices: THREE.Matrix4[] }>();
  readonly colliders: ColliderSpec[] = [];

  /**
   * Add geometry (it is cloned and transformed; the input is not modified). `material` is a
   * shared library id or, for one-off textured surfaces, a THREE.Material (merged per instance).
   */
  add(geometry: THREE.BufferGeometry, material: MaterialId | THREE.Material, matrix?: THREE.Matrix4, opts: AddOptions = {}): this {
    let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (matrix) g.applyMatrix4(matrix);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if ((opts.uv ?? 'box') === 'box' || !g.getAttribute('uv')) g = boxProjectUVs(g, opts.uvScale ?? 2);
    // Keep only the attributes every part shares so merging never fails.
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    g.morphAttributes = {};
    const key = `${this.materialKey(material)}|${opts.castShadow === false ? 0 : 1}`;
    const list = this.parts.get(key) ?? [];
    list.push(g);
    this.parts.set(key, list);
    return this;
  }

  /** Axis-aligned box (before `matrix`) with optional matching collider. */
  box(material: MaterialId | THREE.Material, w: number, h: number, d: number, matrix?: THREE.Matrix4, opts: AddOptions & { collide?: boolean } = {}): this {
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

  /**
   * Place a repeated object (columns, statues): its parts are built once per `key` — by `make`,
   * called at most once per key for the whole program — and drawn as one InstancedMesh per
   * material at build(). Use the same key only for identical objects. UVs are projected in the
   * object's own frame. Colliders are not handled here: add them with collider().
   */
  instance(key: string, make: () => InstancePart[], matrix: THREE.Matrix4): this {
    let e = this.instances.get(key);
    if (!e) this.instances.set(key, (e = { make, matrices: [] }));
    e.matrices.push(matrix.clone());
    return this;
  }

  collider(spec: ColliderSpec): this {
    this.colliders.push(spec);
    return this;
  }

  /**
   * Merge into a Group with one Mesh per material (plus one InstancedMesh per instanced key and
   * material). Options: `index` welds identical vertices of the merged geometry (smooth lathes
   * and sweeps share most of theirs); `releaseCpu` drops the vertex arrays from the JS heap once
   * they are on the GPU (only for static scenery nobody raycasts: colliders are separate).
   */
  build(name = 'built', opts: { index?: boolean; releaseCpu?: boolean } = {}): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    for (const [key, { make, matrices }] of this.instances) {
      for (const [mk, part] of preparedInstance(key, make)) {
        const mat = typeof part.material === 'string' ? getMaterial(part.material) : part.material;
        const mesh = new THREE.InstancedMesh(part.geometry, mat, matrices.length);
        matrices.forEach((mm, i) => mesh.setMatrixAt(i, mm));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.computeBoundingBox();
        mesh.name = `${name}:${key}:${mk}`;
        mesh.castShadow = part.castShadow;
        mesh.receiveShadow = true;
        group.add(mesh);
      }
    }
    for (const [key, geoms] of this.parts) {
      const [material, shadow] = key.split('|');
      let merged = geoms.length === 1 ? geoms[0] : mergeGeometries(geoms, false);
      if (!merged) continue;
      if (opts.index) merged = mergeVertices(merged, 1e-4);
      if (opts.releaseCpu) releaseAfterUpload(merged);
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mat = this.custom.get(material) ?? getMaterial(material as MaterialId);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = `${name}:${mat.name || material}`;
      mesh.castShadow = shadow === '1';
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }

  /** Merge another builder's parts and colliders into this one, transformed by `matrix`. */
  append(other: MeshBuilder, matrix?: THREE.Matrix4): this {
    for (const [k, m] of other.custom) this.custom.set(k, m);
    for (const [key, e] of other.instances) for (const mm of e.matrices) this.instance(key, e.make, matrix ? matrix.clone().multiply(mm) : mm);
    for (const [key, geoms] of other.parts) {
      const list = this.parts.get(key) ?? [];
      for (const g of geoms) list.push(matrix ? g.clone().applyMatrix4(matrix) : g);
      this.parts.set(key, list);
    }
    for (const c of other.colliders) this.colliders.push(matrix ? transformCollider(c, matrix) : c);
    return this;
  }

  private materialKey(material: MaterialId | THREE.Material): string {
    if (typeof material === 'string') return material;
    const k = `#${material.uuid}`;
    this.custom.set(k, material);
    return k;
  }

  get isEmpty() {
    return this.parts.size === 0 && this.instances.size === 0;
  }

  /** Triangles that build() will draw (instances counted once per placement). */
  get triangleCount(): number {
    let n = 0;
    for (const geoms of this.parts.values()) for (const g of geoms) n += g.getAttribute('position').count / 3;
    for (const [key, e] of this.instances) for (const part of preparedInstance(key, e.make).values()) n += ((part.geometry.index?.count ?? part.geometry.getAttribute('position').count) / 3) * e.matrices.length;
    return Math.round(n);
  }
}

/** Build (once per key) the per-material indexed geometry of an instanced object. */
function preparedInstance(key: string, make: () => InstancePart[]) {
  let prepared = instanceGeometry.get(key);
  if (prepared) return prepared;
  const lists = new Map<string, { geoms: THREE.BufferGeometry[]; material: THREE.Material | MaterialId; castShadow: boolean }>();
  for (const part of make()) {
    let g = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if ((part.uv ?? 'box') === 'box' || !g.getAttribute('uv')) g = boxProjectUVs(g, part.uvScale ?? 2);
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    g.morphAttributes = {};
    const castShadow = part.castShadow !== false;
    const mk = `${typeof part.material === 'string' ? part.material : `#${part.material.uuid}`}|${castShadow ? 1 : 0}`;
    const l = lists.get(mk) ?? { geoms: [], material: part.material, castShadow };
    l.geoms.push(g);
    lists.set(mk, l);
  }
  prepared = new Map();
  for (const [mk, l] of lists) {
    const merged = l.geoms.length === 1 ? l.geoms[0] : mergeGeometries(l.geoms, false);
    if (!merged) continue;
    const geometry = mergeVertices(merged, 1e-4);
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    prepared.set(mk, { geometry, material: l.material, castShadow: l.castShadow });
  }
  instanceGeometry.set(key, prepared);
  return prepared;
}

/** Free a geometry's CPU-side vertex arrays once the renderer has uploaded them. */
function releaseAfterUpload(g: THREE.BufferGeometry) {
  g.computeBoundingSphere();
  g.computeBoundingBox();
  const free = function (this: THREE.BufferAttribute) {
    (this as unknown as { array: ArrayLike<number> | null }).array = null;
  };
  for (const a of Object.values(g.attributes)) (a as THREE.BufferAttribute).onUpload(free);
  g.index?.onUpload(free);
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
