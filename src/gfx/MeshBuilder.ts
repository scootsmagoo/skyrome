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
import { UV_AUDIT, uvAuditRecord } from './uvstretch';
import { separateCoplanar } from './coplanar';
import { AUDIT, auditRecordBuild, currentAuditSource } from '../dev/audit/geomAudit';

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
const HUNG_PROPS = /torch|bracket|lamp|awning|sign|hang|shelf|garland|wreath|lantern|banner|sconce|velum/;

/**
 * Move each prop vertically onto the surface under its base: the highest up-facing face of the
 * other geometry (or the ground) within 0.5 m below to 0.35 m above it (0.6 m above for the
 * ground: props sunk into a slope). Props placed at one ground height on a slope, or at a floor
 * height that was then lifted, floated or sank; this puts them down where they stand. Moves of
 * under 3 cm are skipped. Pure geometry; the geometry is non-indexed (MeshBuilder.add).
 */
export function settleProps(props: { kind: string; base: THREE.Vector3; geoms: THREE.BufferGeometry[] }[], all: THREE.BufferGeometry[], ground: ((x: number, z: number) => number) | null) {
  const live = props.filter((p) => !HUNG_PROPS.test(p.kind));
  if (!live.length) return;
  // Index up-facing triangles of everything near the props in 1 m cells.
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of live) {
    x0 = Math.min(x0, p.base.x);
    x1 = Math.max(x1, p.base.x);
    z0 = Math.min(z0, p.base.z);
    z1 = Math.max(z1, p.base.z);
  }
  const cells = new Map<number, { g: THREE.BufferGeometry; i: number }[]>();
  const key = (ix: number, iz: number) => ix * 100003 + iz;
  for (const g of all) {
    const a = (g.getAttribute('position') as THREE.BufferAttribute | undefined)?.array as Float32Array | undefined;
    if (!a) continue;
    for (let i = 0; i + 8 < a.length; i += 9) {
      const minX = Math.min(a[i], a[i + 3], a[i + 6]), maxX = Math.max(a[i], a[i + 3], a[i + 6]);
      const minZ = Math.min(a[i + 2], a[i + 5], a[i + 8]), maxZ = Math.max(a[i + 2], a[i + 5], a[i + 8]);
      if (maxX < x0 - 1 || minX > x1 + 1 || maxZ < z0 - 1 || minZ > z1 + 1) continue;
      const ux = a[i + 3] - a[i], uy = a[i + 4] - a[i + 1], uz = a[i + 5] - a[i + 2];
      const vx = a[i + 6] - a[i], vy = a[i + 7] - a[i + 1], vz = a[i + 8] - a[i + 2];
      const ny = uz * vx - ux * vz;
      const l = Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx);
      if (l < 1e-6 || ny / l < 0.7) continue;
      for (let ix = Math.floor(minX); ix <= Math.floor(maxX); ix++)
        for (let iz = Math.floor(minZ); iz <= Math.floor(maxZ); iz++) {
          const k = key(ix, iz);
          let list = cells.get(k);
          if (!list) cells.set(k, (list = []));
          list.push({ g, i });
        }
    }
  }
  for (const p of live) {
    const own = new Set(p.geoms);
    const { x, y, z } = p.base;
    let best = -Infinity;
    for (const { g, i } of cells.get(key(Math.floor(x), Math.floor(z))) ?? []) {
      if (own.has(g)) continue;
      const a = (g.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
      const ax = a[i], az = a[i + 2], bx = a[i + 3], bz = a[i + 5], cx = a[i + 6], cz = a[i + 8];
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(d) < 1e-9) continue;
      const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
      const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
      const l3 = 1 - l1 - l2;
      if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
      const sy = l1 * a[i + 1] + l2 * a[i + 4] + l3 * a[i + 7];
      if (sy >= y - 0.5 && sy <= y + 0.35 && sy > best) best = sy;
    }
    if (best === -Infinity && ground) {
      const gy = ground(x, z);
      if (gy >= y - 0.5 && gy <= y + 0.6) best = gy;
    }
    if (best === -Infinity) continue;
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
    if (UV_AUDIT) uvAuditRecord(g, typeof material === 'string' ? material : material.name, (opts.uv ?? 'box') === 'box' ? opts.uvScale ?? 2 : 2);
    g.userData.seq = ++seq;
    if (AUDIT) g.userData.src = currentAuditSource();
    this.capture?.push(g);
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
    if (UV_AUDIT) uvAuditRecord(g, typeof part.material === 'string' ? part.material : part.material.name, (part.uv ?? 'box') === 'box' ? part.uvScale ?? 2 : 2);
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
