/**
 * Thin wrapper over Rapier (WASM). Static world geometry, character controllers, ray casts.
 *
 * Conventions: meters, y up, gravity -9.81 for dynamic bodies (characters integrate their own
 * gravity). Every collider can carry an "owner" (the game object it belongs to) so hits can be
 * mapped back to actors, props, etc.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

export type Rapier = typeof RAPIER;
export { RAPIER };

let initPromise: Promise<void> | null = null;
/** Must be awaited once before constructing `Physics`. Safe to call repeatedly. */
export function initPhysics(): Promise<void> {
  if (!initPromise) initPromise = RAPIER.init();
  return initPromise;
}

/** Collision layers (16 bits each). A collider collides with another when each one's membership is in the other's filter. */
export const Layer = {
  World: 1 << 0, // terrain, buildings, static props
  Player: 1 << 1,
  Npc: 1 << 2,
  Projectile: 1 << 3,
  Trigger: 1 << 4, // sensors / interaction volumes
  Water: 1 << 5,
  Debris: 1 << 6, // small dynamic props
  CameraBlock: 1 << 7, // things the camera should not pass through but characters can (rare)
  Ragdoll: 1 << 8, // active-ragdoll body parts (src/physics/ragdoll)
} as const;
export const ALL_LAYERS = 0xffff;

export function groups(membership: number, filter: number = ALL_LAYERS): number {
  return ((membership & 0xffff) << 16) | (filter & 0xffff);
}

export interface RayHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
  collider: RAPIER.Collider;
  owner: unknown;
}

export interface CharacterBody {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  controller: RAPIER.KinematicCharacterController;
  radius: number;
  halfHeight: number;
}

/** The rapier.js 0.21 World fields its step() passes to the physics pipeline. */
interface RawStepWorld {
  physicsPipeline?: { step: (...args: unknown[]) => void };
  gravity: unknown; integrationParameters: unknown; islands: unknown; broadPhase: unknown;
  narrowPhase: unknown; bodies: unknown; colliders: unknown; softBodies: unknown;
  impulseJoints: unknown; multibodyJoints: unknown; ccdSolver: unknown;
}

const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();

export class Physics {
  readonly world: RAPIER.World;
  private owners = new Map<number, unknown>();

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  }

  step(dt: number) {
    this.world.timestep = dt;
    // rapier.js's World.step() ends by re-syncing its JS handle maps: it walks every collider and
    // body across the WASM boundary, ~2 ms a step with the city's ~40k static colliders (the
    // physics itself takes ~0.02 ms). Colliders and bodies are only ever created and removed
    // through the World API here, which keeps those maps in sync itself, so step the pipeline
    // directly. Falls back to the full step if a rapier upgrade changes these internals.
    const w = this.world as unknown as RawStepWorld;
    if (w.physicsPipeline?.step && 'softBodies' in w) {
      w.physicsPipeline.step(
        w.gravity, w.integrationParameters, w.islands, w.broadPhase, w.narrowPhase, w.bodies,
        w.colliders, w.softBodies, w.impulseJoints, w.multibodyJoints, w.ccdSolver, undefined, undefined,
      );
    } else this.world.step();
  }

  setOwner(collider: RAPIER.Collider, owner: unknown) {
    this.owners.set(collider.handle, owner);
  }

  ownerOf(collider: RAPIER.Collider | null | undefined): unknown {
    return collider ? this.owners.get(collider.handle) : undefined;
  }

  removeCollider(collider: RAPIER.Collider) {
    this.owners.delete(collider.handle);
    this.world.removeCollider(collider, true);
  }

  // ---------------------------------------------------------------- static geometry

  /** Axis-aligned (optionally yawed) static box. `rotationY` in radians (three.js convention). */
  addBox(
    center: THREE.Vector3Like,
    halfExtents: THREE.Vector3Like,
    rotationY = 0,
    opts: { owner?: unknown; layer?: number; friction?: number } = {},
  ): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
      .setTranslation(center.x, center.y, center.z)
      .setCollisionGroups(groups(opts.layer ?? Layer.World))
      .setFriction(opts.friction ?? 0.7);
    if (rotationY) {
      tmpQ.setFromEuler(tmpE.set(0, rotationY, 0));
      desc.setRotation({ x: tmpQ.x, y: tmpQ.y, z: tmpQ.z, w: tmpQ.w });
    }
    return this.track(this.world.createCollider(desc), opts.owner);
  }

  /** Static box with an arbitrary rotation. */
  addOrientedBox(
    center: THREE.Vector3Like,
    halfExtents: THREE.Vector3Like,
    quaternion: THREE.QuaternionLike,
    opts: { owner?: unknown; layer?: number } = {},
  ): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
      .setTranslation(center.x, center.y, center.z)
      .setRotation({ x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w })
      .setCollisionGroups(groups(opts.layer ?? Layer.World));
    return this.track(this.world.createCollider(desc), opts.owner);
  }

  /** Static vertical cylinder (columns, round temples, tree trunks). */
  addCylinder(
    center: THREE.Vector3Like,
    halfHeight: number,
    radius: number,
    opts: { owner?: unknown; layer?: number } = {},
  ): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cylinder(halfHeight, radius)
      .setTranslation(center.x, center.y, center.z)
      .setCollisionGroups(groups(opts.layer ?? Layer.World));
    return this.track(this.world.createCollider(desc), opts.owner);
  }

  /**
   * Static triangle mesh from a (non-indexed or indexed) BufferGeometry, transformed by `matrix`.
   * Prefer boxes for buildings — trimeshes are for terrain-like or irregular shapes.
   */
  addTrimesh(
    geometry: THREE.BufferGeometry,
    matrix?: THREE.Matrix4,
    opts: { owner?: unknown; layer?: number } = {},
  ): RAPIER.Collider {
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
    const verts = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (matrix) v.applyMatrix4(matrix);
      verts[i * 3] = v.x;
      verts[i * 3 + 1] = v.y;
      verts[i * 3 + 2] = v.z;
    }
    let indices: Uint32Array;
    if (geometry.index) {
      indices = new Uint32Array(geometry.index.array as ArrayLike<number>);
    } else {
      indices = new Uint32Array(pos.count);
      for (let i = 0; i < pos.count; i++) indices[i] = i;
    }
    const desc = RAPIER.ColliderDesc.trimesh(verts, indices).setCollisionGroups(
      groups(opts.layer ?? Layer.World),
    );
    return this.track(this.world.createCollider(desc), opts.owner);
  }

  /**
   * Static heightfield covering the rectangle [minX, minX+sizeX] × [minZ, minZ+sizeZ].
   * `heights[iz * (segX + 1) + ix]` is the height at x = minX + ix*sizeX/segX, z = minZ + iz*sizeZ/segZ
   * (row-major by z, the natural layout of a PlaneGeometry rotated to lie flat). This helper
   * converts to Rapier's column-major layout.
   */
  addHeightfield(
    minX: number,
    minZ: number,
    sizeX: number,
    sizeZ: number,
    segX: number,
    segZ: number,
    heights: ArrayLike<number>,
    opts: { owner?: unknown; layer?: number } = {},
  ): RAPIER.Collider {
    // Rapier: nrows = subdivisions along Z, ncols = subdivisions along X, matrix (nrows+1)x(ncols+1)
    // stored column-major: element (row=iz, col=ix) at index iz + ix*(nrows+1).
    const nrows = segZ;
    const ncols = segX;
    const data = new Float32Array((nrows + 1) * (ncols + 1));
    for (let iz = 0; iz <= nrows; iz++) {
      for (let ix = 0; ix <= ncols; ix++) {
        data[iz + ix * (nrows + 1)] = heights[iz * (segX + 1) + ix];
      }
    }
    const desc = RAPIER.ColliderDesc.heightfield(nrows, ncols, data, { x: sizeX, y: 1, z: sizeZ })
      .setTranslation(minX + sizeX / 2, 0, minZ + sizeZ / 2)
      .setCollisionGroups(groups(opts.layer ?? Layer.World))
      .setFriction(0.8);
    return this.track(this.world.createCollider(desc), opts.owner);
  }

  // ---------------------------------------------------------------- characters

  /**
   * Kinematic capsule driven by Rapier's KinematicCharacterController.
   * `position` is the FEET position; the capsule is centered at feet + (halfHeight + radius).
   */
  createCharacter(
    position: THREE.Vector3Like,
    opts: {
      radius?: number;
      halfHeight?: number;
      layer?: number;
      collidesWith?: number;
      owner?: unknown;
      maxStep?: number;
    } = {},
  ): CharacterBody {
    const radius = opts.radius ?? 0.35;
    const halfHeight = opts.halfHeight ?? 0.55;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        position.x,
        position.y + halfHeight + radius,
        position.z,
      ),
    );
    const layer = opts.layer ?? Layer.Player;
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(halfHeight, radius).setCollisionGroups(
        groups(layer, opts.collidesWith ?? Layer.World | Layer.Player | Layer.Npc),
      ),
      body,
    );
    this.track(collider, opts.owner);
    const controller = this.world.createCharacterController(0.03);
    controller.setUp({ x: 0, y: 1, z: 0 });
    controller.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    controller.setMinSlopeSlideAngle((40 * Math.PI) / 180);
    controller.enableAutostep(opts.maxStep ?? 0.45, 0.15, false);
    controller.enableSnapToGround(0.45);
    controller.setSlideEnabled(true);
    controller.setApplyImpulsesToDynamicBodies(true);
    return { body, collider, controller, radius, halfHeight };
  }

  removeCharacter(c: CharacterBody) {
    this.owners.delete(c.collider.handle);
    this.world.removeCharacterController(c.controller);
    this.world.removeRigidBody(c.body);
  }

  // ---------------------------------------------------------------- queries

  /**
   * Cast a ray. `filterLayers` limits which layers can be hit; `exclude` skips one collider
   * (e.g. the caster's own capsule).
   */
  raycast(
    origin: THREE.Vector3Like,
    dir: THREE.Vector3Like,
    maxDist: number,
    filterLayers: number = ALL_LAYERS,
    exclude?: RAPIER.Collider,
  ): RayHit | null {
    const ray = new RAPIER.Ray(origin, dir);
    const hit = this.world.castRayAndGetNormal(
      ray,
      maxDist,
      true,
      undefined,
      groups(ALL_LAYERS, filterLayers),
      exclude,
    );
    if (!hit) return null;
    const t = hit.timeOfImpact;
    return {
      point: new THREE.Vector3(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t),
      normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
      distance: t,
      collider: hit.collider,
      owner: this.ownerOf(hit.collider),
    };
  }

  /** Height of the first World surface below (x, z), searching down from `fromY`. */
  groundHeight(x: number, z: number, fromY = 500, maxDist = 1000): number | null {
    const hit = this.raycast({ x, y: fromY, z }, { x: 0, y: -1, z: 0 }, maxDist, Layer.World);
    return hit ? hit.point.y : null;
  }

  /** All colliders whose shapes intersect a sphere. */
  overlapSphere(center: THREE.Vector3Like, radius: number, filterLayers: number = ALL_LAYERS) {
    const out: { collider: RAPIER.Collider; owner: unknown }[] = [];
    const shape = new RAPIER.Ball(radius);
    this.world.intersectionsWithShape(
      center,
      { x: 0, y: 0, z: 0, w: 1 },
      shape,
      (c) => {
        out.push({ collider: c, owner: this.ownerOf(c) });
        return true;
      },
      undefined,
      groups(ALL_LAYERS, filterLayers),
    );
    return out;
  }

  private track(c: RAPIER.Collider, owner: unknown) {
    if (owner !== undefined) this.owners.set(c.handle, owner);
    return c;
  }
}
