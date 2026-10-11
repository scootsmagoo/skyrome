/**
 * Shadow level of detail. The shadow pass draws every caster inside the shadow box again, and in
 * the Forum that was ~45 % of all triangles: ~140 people at 7 k each and whole temples at full
 * detail, drawn into a 3.3 cm texel map where a 1 k stand-in casts the same shadow.
 *
 * A shadow-pass-only swap: `renderer.shadowMap.render` runs after three.js has built the main
 * pass's render list (it keeps each item's geometry) and returns before the main pass draws, so
 * swapping a mesh's geometry or visibility around that one call changes only what the shadow map
 * sees. Two kinds of stand-in:
 *  - a mesh with `userData.shadowGeometry` casts that geometry instead of its own once it is
 *    farther than `userData.shadowFrom` metres (default 12) from the camera (avatars: their low
 *    LOD, see `trackShadowProxy`);
 *  - other owners (landmark pieces in batches, see world/landmarks/landmarkLod.ts) swap their own
 *    geometry ids through a `ShadowHook`;
 *  - a landmark with a baked far stand-in (farBake.ts) casts that single mesh instead of its
 *    dozens of detailed ones once the camera is `LANDMARK_SHADOW_FROM` metres from its bounding
 *    sphere (`trackLandmarkShadow`).
 *
 * The wrapper also gives each kind of caster its own depth material (`depthForKind`, phase 3): three.js
 * draws every caster without a material of its own with one shared MeshDepthMaterial, whose program
 * depends on the kind of object (batched, instanced, skinned, morphed). Each time two casters next to
 * each other in the scene differ (a body, then the sword it carries; a batch, then a person) three.js
 * looked the program up again and switched it: 43 times a shadow pass in the Forum.
 *
 * Nothing is allocated per frame; with shadows off or between shadow renders nothing happens.
 */
import * as THREE from 'three';
import type { Game } from '../core/Game';
import { lodScale } from './lodScale';

/** Beyond this distance (m) from a landmark's bounding sphere its baked stand-in casts its shadow. */
export const LANDMARK_SHADOW_FROM = 24;
/** Default distance (m) beyond which a mesh casts its `shadowGeometry`. */
export const SHADOW_PROXY_FROM = 12;

/** Meshes with a shadow stand-in (an array: walked at every shadow render). */
const meshes: THREE.Mesh[] = [];
/** Systems that swap their own geometry for the shadow pass (landmark pieces in batches). */
export interface ShadowHook {
  /** Called just before the shadow map renders, with the camera position. */
  enter(cx: number, cy: number, cz: number): void;
  /** Called just after: put everything back. */
  leave(): void;
}
const hooks: ShadowHook[] = [];
const landmarks: { object: THREE.Object3D; far: THREE.Object3D; sphere: THREE.Sphere }[] = [];
const installed = new WeakSet<THREE.WebGLRenderer>();

// Scratch lists of what the current shadow render swapped (reused, never reallocated).
const swappedMesh: THREE.Mesh[] = [];
const swappedGeo: THREE.BufferGeometry[] = [];
const hiddenRoots: THREE.Object3D[] = [];
const shownFars: THREE.Object3D[] = [];
const farWasCasting: boolean[] = [];

/** Let a mesh cast `mesh.userData.shadowGeometry` (when set) beyond `userData.shadowFrom` metres. */
export function trackShadowProxy(mesh: THREE.Mesh) {
  if (!meshes.includes(mesh)) meshes.push(mesh);
}

export function untrackShadowProxy(mesh: THREE.Mesh) {
  const k = meshes.indexOf(mesh);
  if (k >= 0) meshes.splice(k, 1);
}

/** Register a hook run around every shadow-map render. */
export function addShadowHook(h: ShadowHook) {
  hooks.push(h);
}

/** A landmark whose baked stand-in may cast its shadow (`sphere` in world space). */
export function trackLandmarkShadow(object: THREE.Object3D, far: THREE.Object3D, sphere: THREE.Sphere) {
  landmarks.push({ object, far, sphere });
}

/**
 * Kind of an object as far as a depth program cares (pure): batched 1, instanced 2, skinned 4,
 * morphed 8, per-instance colours 16. Plain meshes are 0.
 */
export function casterKind(o: { isBatchedMesh?: boolean; isInstancedMesh?: boolean; isSkinnedMesh?: boolean; morphTargetInfluences?: number[]; instanceColor?: unknown }, morphed: boolean): number {
  let k = 0;
  if (o.isBatchedMesh) k |= 1;
  else if (o.isInstancedMesh) k |= o.instanceColor ? 18 : 2;
  if (o.isSkinnedMesh) k |= 4;
  if (morphed && o.morphTargetInfluences !== undefined) k |= 8;
  return k;
}

/** Depth materials per (three.js's depth material, kind of caster): copies made on first use. */
const kindCopies = new Map<THREE.Material, THREE.Material[]>();
/** Per-object state three.js writes onto its depth material before each draw (getDepthMaterial). */
type DepthState = THREE.MeshDepthMaterial & { clipShadows: boolean; wireframeLinewidth: number; linewidth?: number };

/**
 * The depth material to draw `object` with in the shadow pass: three's own for plain meshes, a
 * copy per kind for the others, carrying the state three.js just wrote onto its own.
 */
function depthForKind(src: THREE.Material, object: THREE.Object3D, geometry: THREE.BufferGeometry): THREE.Material {
  const kind = casterKind(object as never, geometry.morphAttributes.position !== undefined || geometry.morphAttributes.normal !== undefined);
  if (kind === 0) return src;
  let copies = kindCopies.get(src);
  if (!copies) {
    copies = [];
    kindCopies.set(src, copies);
    src.addEventListener('dispose', () => {
      for (const c of kindCopies.get(src) ?? []) c?.dispose();
      kindCopies.delete(src);
    });
  }
  let m = copies[kind] as DepthState | undefined;
  if (!m) {
    m = src.clone() as DepthState;
    m.name = `${src.name || 'depth'}:kind${kind}`;
    copies[kind] = m;
  }
  const d = src as DepthState;
  m.visible = d.visible;
  m.wireframe = d.wireframe;
  m.side = d.side;
  m.alphaMap = d.alphaMap;
  m.alphaTest = d.alphaTest;
  m.map = d.map;
  m.clipShadows = d.clipShadows;
  m.clippingPlanes = d.clippingPlanes;
  m.clipIntersection = d.clipIntersection;
  m.displacementMap = d.displacementMap;
  m.displacementScale = d.displacementScale;
  m.displacementBias = d.displacementBias;
  m.wireframeLinewidth = d.wireframeLinewidth;
  if (d.linewidth !== undefined) m.linewidth = d.linewidth;
  return m;
}

const OFF = new URLSearchParams(globalThis.location?.search ?? '').get('lodoff') ?? '';
/** Runtime switches for A/B runs (scripts/perf-probe.mjs): per-kind depth materials. */
export const shadowLodSwitches = { kindDepth: !OFF.includes('kinddepth') };

/** Wrap the renderer's shadow-map render (once per renderer). */
export function installShadowLod(game: Game) {
  const r = game.renderer;
  if (installed.has(r)) return;
  installed.add(r);
  const sm = r.shadowMap;
  const orig = sm.render.bind(sm);
  let inShadow = false;
  sm.render = (lights, scene, camera) => {
    // The same early-outs as three's own: nothing to swap unless the map is about to be drawn.
    if (!sm.enabled || (!sm.autoUpdate && !sm.needsUpdate) || lights.length === 0) return orig(lights, scene, camera);
    swapIn(camera);
    inShadow = shadowLodSwitches.kindDepth;
    try {
      orig(lights, scene, camera);
    } finally {
      inShadow = false;
      swapOut();
    }
  };
  // three.js's shadow pass draws through the renderer's own renderBufferDirect, with no scene.
  if (typeof r.renderBufferDirect !== 'function') return;
  const draw = r.renderBufferDirect.bind(r);
  r.renderBufferDirect = (camera, scene, geometry, material, object, group) => {
    if (inShadow && scene === null && (material as THREE.MeshDepthMaterial).isMeshDepthMaterial) material = depthForKind(material, object, geometry as THREE.BufferGeometry);
    draw(camera, scene, geometry, material, object, group);
  };
}

function swapIn(camera: THREE.Camera) {
  const e = camera.matrixWorld.elements;
  const cx = e[12];
  const cy = e[13];
  const cz = e[14];
  // The tier's LOD scale (lodScale.ts): stand-ins cast from nearer on Medium and Low.
  const k = lodScale.value;
  for (let i = 0; i < meshes.length; i++) {
    const m = meshes[i];
    const g = m.userData.shadowGeometry as THREE.BufferGeometry | null | undefined;
    if (!g || !m.castShadow || !m.visible || m.geometry === g) continue;
    const w = m.matrixWorld.elements;
    const from = ((m.userData.shadowFrom as number | undefined) ?? SHADOW_PROXY_FROM) * k;
    const dx = w[12] - cx;
    const dy = w[13] - cy;
    const dz = w[14] - cz;
    if (dx * dx + dy * dy + dz * dz < from * from) continue;
    swappedMesh.push(m);
    swappedGeo.push(m.geometry);
    m.geometry = g;
  }
  for (const h of hooks) h.enter(cx, cy, cz);
  for (const l of landmarks) {
    // Only landmarks drawn in detail right now (a hidden one casts nothing; one past its cull
    // distance already shows the stand-in, which is not a caster).
    if (!l.object.visible || l.far.visible) continue;
    const dx = l.sphere.center.x - cx, dy = l.sphere.center.y - cy, dz = l.sphere.center.z - cz;
    // Math.sqrt, not Math.hypot: hypot allocates its arguments (the heap profile's top allocator).
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) - l.sphere.radius;
    if (d < LANDMARK_SHADOW_FROM * k) continue;
    l.object.visible = false;
    hiddenRoots.push(l.object);
    l.far.visible = true;
    farWasCasting.push((l.far as THREE.Mesh).castShadow);
    (l.far as THREE.Mesh).castShadow = true;
    shownFars.push(l.far);
  }
}

function swapOut() {
  for (const h of hooks) h.leave();
  for (let i = swappedMesh.length - 1; i >= 0; i--) swappedMesh[i].geometry = swappedGeo[i];
  swappedMesh.length = 0;
  swappedGeo.length = 0;
  for (const o of hiddenRoots) o.visible = true;
  hiddenRoots.length = 0;
  for (let i = 0; i < shownFars.length; i++) {
    shownFars[i].visible = false;
    (shownFars[i] as THREE.Mesh).castShadow = farWasCasting[i];
  }
  shownFars.length = 0;
  farWasCasting.length = 0;
}
