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
 * Nothing is allocated per frame; with shadows off or between shadow renders nothing happens.
 */
import * as THREE from 'three';
import type { Game } from '../core/Game';

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

/** Wrap the renderer's shadow-map render (once per renderer). */
export function installShadowLod(game: Game) {
  const r = game.renderer;
  if (installed.has(r)) return;
  installed.add(r);
  const sm = r.shadowMap;
  const orig = sm.render.bind(sm);
  sm.render = (lights, scene, camera) => {
    // The same early-outs as three's own: nothing to swap unless the map is about to be drawn.
    if (!sm.enabled || (!sm.autoUpdate && !sm.needsUpdate) || lights.length === 0) return orig(lights, scene, camera);
    swapIn(camera);
    try {
      orig(lights, scene, camera);
    } finally {
      swapOut();
    }
  };
}

function swapIn(camera: THREE.Camera) {
  const e = camera.matrixWorld.elements;
  const cx = e[12];
  const cy = e[13];
  const cz = e[14];
  for (let i = 0; i < meshes.length; i++) {
    const m = meshes[i];
    const g = m.userData.shadowGeometry as THREE.BufferGeometry | null | undefined;
    if (!g || !m.castShadow || !m.visible || m.geometry === g) continue;
    const w = m.matrixWorld.elements;
    const from = (m.userData.shadowFrom as number | undefined) ?? SHADOW_PROXY_FROM;
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
    if (d < LANDMARK_SHADOW_FROM) continue;
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
