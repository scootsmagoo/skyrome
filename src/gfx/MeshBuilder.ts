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
import { releaseGeometryAfterUpload } from './release';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Game } from '../core/Game';
import { Layer } from '../core/Physics';
import { getMaterial } from './materials';
import type { MaterialId } from './materialIds';
import { boxProjectUVs } from './uv';
import { separateCoplanar } from './coplanar';
import { AUDIT, auditRecordBuild, currentAuditSource } from '../dev/audit/geomAudit';
import { SurfaceIndex, standingHeight } from './surfaceIndex';

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

/** Props whose base is not meant to touch a surface (wall brackets, lamps on hooks, awnings). */
const HUNG_PROPS = /torch|bracket|oil_lamp|awning|sign|hang|shelf|garland|wreath|lantern|banner|sconce|velum/;

/**
 * Move each prop vertically onto the surface under its base: the highest up-facing face of the
 * other geometry (or the ground) within 0.5 m below to 0.35 m above it (0.6 m above for the
 * ground: props sunk into a slope). The ground also wins over a face under the prop when it lies
 * up to 0.7 m above that face (the face is buried). Props placed at one ground height on a slope, or at a floor
 * height that was then lifted, floated or sank; this puts them down where they stand. Moves of
 * under 3 cm are skipped. Pure geometry; the geometry is non-indexed (MeshBuilder.add).
 */
export function settleProps(props: { kind: string; base: THREE.Vector3; geoms: THREE.BufferGeometry[] }[], all: THREE.BufferGeometry[], ground: ((x: number, z: number) => number) | null) {
  const live = props.filter((p) => !HUNG_PROPS.test(p.kind));
  if (!live.length) return;
  // Index the up-facing triangles of everything near the props (surfaceIndex.ts).
  const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const p of live) {
    bounds.minX = Math.min(bounds.minX, p.base.x);
    bounds.maxX = Math.max(bounds.maxX, p.base.x);
    bounds.minZ = Math.min(bounds.minZ, p.base.z);
    bounds.maxZ = Math.max(bounds.maxZ, p.base.z);
  }
  const index = new SurfaceIndex(all, bounds);
  for (const p of live) {
    const { x, y, z } = p.base;
    const best = standingHeight(index, ground, x, z, y, new Set(p.geoms));
    if (best === null) continue;
    const dy = best - y;
    if (Math.abs(dy) < 0.03) continue;
    for (const g of p.geoms) {
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      const a = pos.array as Float32Array;
      for (let i = 1; i < a.length; i += 3) a[i] += dy;
      pos.needsUpdate = true;
      g.boundingBox = null;
      g.boundingSphere = null;
    }
    p.base.y = best;
  }
}

/** Time spent separating coplanar faces (for profiling). */
export const coplanarStats = { ms: 0, builds: 0 };

/** Add order of every part (later parts win coplanar ties, see coplanar.ts). */
let seq = 0;

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
  /** Prop base points (geometry audit only, ?audit). */
  readonly auditProps: { kind: string; p: THREE.Vector3; src: string }[] = [];
  /**
   * Ground height in this builder's frame (game y at x, z), when the owner knows it: props settle
   * onto it where nothing else lies under them (see settleProps).
   */
  ground: ((x: number, z: number) => number) | null = null;
  /** Props placed so far: their base point and the geometry they added (settled at build). */
  readonly props: { kind: string; base: THREE.Vector3; geoms: THREE.BufferGeometry[] }[] = [];
  /** Geometry added while a prop is being placed (beginProp … endProp). */
  private capture: THREE.BufferGeometry[] | null = null;

  /** Start recording a prop's geometry (props.ts placeProp). */
  beginProp() {
    this.capture = [];
  }

  /** Finish recording: the prop stands at `base` (its foot, in this builder's frame). */
  endProp(kind: string, base: THREE.Vector3) {
    if (this.capture?.length) this.props.push({ kind, base, geoms: this.capture });
    this.capture = null;
  }

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
    g.userData.seq = ++seq;
    if (AUDIT) g.userData.src = currentAuditSource();
    this.capture?.push(g);
    const key = `${this.materialKey(material)}|${opts.castShadow === false ? 0 : 1}`;
    const list = this.parts.get(key) ?? [];
    list.push(g);
    this.parts.set(key, list);
    this.surfaceVersion++;
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
    // Props stand on whatever is under them (paving, a floor, a table, the ground): see settleProps.
    if (this.props.length) settleProps(this.props, [...this.parts.values()].flat(), this.ground);
    // Coplanar faces of different materials would flicker: sink the losers first (coplanar.ts).
    const all: { geometry: THREE.BufferGeometry; material: string; seq: number }[] = [];
    for (const [key, geoms] of this.parts) for (const g of geoms) all.push({ geometry: g, material: key.split('|')[0], seq: g.userData.seq ?? 0 });
    const t0 = performance.now();
    separateCoplanar(all);
    coplanarStats.ms += performance.now() - t0;
    coplanarStats.builds++;
    for (const [key, geoms] of this.parts) {
      const [material, shadow] = key.split('|');
      let merged = geoms.length === 1 ? geoms[0] : mergeGeometries(geoms, false);
      if (!merged) continue;
      if (opts.index) merged = mergeVertices(merged, 1e-4);
      if (opts.releaseCpu) releaseGeometryAfterUpload(merged);
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mat = this.custom.get(material) ?? getMaterial(material as MaterialId);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = `${name}:${mat.name || material}`;
      mesh.castShadow = shadow === '1';
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    if (AUDIT) {
      const audit: { geometry: THREE.BufferGeometry; material: string }[] = [];
      for (const [key, geoms] of this.parts) for (const g of geoms) audit.push({ geometry: g, material: (this.custom.get(key.split('|')[0])?.name || key.split('|')[0]) });
      for (const [key, { make, matrices }] of this.instances) {
        for (const part of preparedInstance(key, make).values()) {
          const flat = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry;
          const mat = typeof part.material === 'string' ? part.material : part.material.name;
          for (const mm of matrices) audit.push({ geometry: flat.clone().applyMatrix4(mm), material: mat });
        }
      }
      auditRecordBuild(name, group, audit, this.auditProps);
    }
    return group;
  }

  /** Merge another builder's parts and colliders into this one, transformed by `matrix`. */
  append(other: MeshBuilder, matrix?: THREE.Matrix4): this {
    for (const [k, m] of other.custom) this.custom.set(k, m);
    for (const [key, e] of other.instances) for (const mm of e.matrices) this.instance(key, e.make, matrix ? matrix.clone().multiply(mm) : mm);
    const moved = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
    for (const [key, geoms] of other.parts) {
      const list = this.parts.get(key) ?? [];
      for (const g of geoms) {
        if (!matrix) list.push(g);
        else {
          const c = g.clone().applyMatrix4(matrix);
          c.userData.seq = g.userData.seq;
          moved.set(g, c);
          list.push(c);
        }
      }
      this.parts.set(key, list);
      this.surfaceVersion++;
    }
    for (const pr of other.props) {
      if (!matrix) {
        this.props.push(pr);
        continue;
      }
      // One transformed base shared with the audit's record of the same prop.
      const base = pr.base.clone().applyMatrix4(matrix);
      const rec = other.auditProps.find((a) => a.p === pr.base);
      if (rec) this.auditProps.push({ ...rec, p: base });
      this.props.push({ kind: pr.kind, base, geoms: pr.geoms.map((g) => moved.get(g) ?? g) });
    }
    for (const c of other.colliders) this.colliders.push(matrix ? transformCollider(c, matrix) : c);
    // Audit records of props are carried with the props below (sharing their settled base).
    for (const p of other.auditProps) if (!matrix || !other.props.some((pr) => pr.base === p.p)) this.auditProps.push(matrix ? { ...p, p: p.p.clone().applyMatrix4(matrix) } : p);
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

  private surfaceCache: { count: number; version: number; index: SurfaceIndex } | null = null;
  private surfaceVersion = 0;

  /**
   * What a thing at (x, z) about height y would stand on, among what has been added so far (and
   * `ground`, if set): the highest face within a step of y, or the terrain where it is higher. Null
   * when nothing is near. For builders that place things on floors, podia and steps; the index is
   * rebuilt when parts were added since the last query, so ask after the floors are in, not between
   * every box.
   */
  surfaceAt(x: number, z: number, y: number): number | null {
    let count = 0;
    for (const geoms of this.parts.values()) count += geoms.length;
    if (!this.surfaceCache || this.surfaceCache.count !== count || this.surfaceCache.version !== this.surfaceVersion) {
      this.surfaceCache = { count, version: this.surfaceVersion, index: new SurfaceIndex([...this.parts.values()].flat()) };
    }
    return standingHeight(this.surfaceCache.index, this.ground, x, z, y);
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

/**
 * Position/rotate a built group in the world, register its colliders, and add it to the world
 * registry. `far` (a low-detail stand-in built in the same local frame) gets the same transform
 * and is shown instead between cullDistance and farDistance.
 */
export function placeAndRegister(
  game: Game,
  id: string,
  group: THREE.Object3D,
  colliders: ColliderSpec[],
  position: THREE.Vector3Like,
  rotationY = 0,
  opts: { cullDistance?: number; owner?: unknown; far?: THREE.Object3D; farDistance?: number } = {},
) {
  for (const o of opts.far ? [group, opts.far] : [group]) {
    o.position.set(position.x, position.y, position.z);
    o.rotation.y = rotationY;
    o.updateMatrixWorld(true);
  }
  registerColliders(game, colliders, group.matrixWorld, opts.owner);
  if (game.world) game.world.add(id, group, { cullDistance: opts.cullDistance, far: opts.far, farDistance: opts.farDistance });
  else game.scene.add(group);
  return group;
}
