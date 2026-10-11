/**
 * A faster per-instance frustum cull for BatchedMeshes whose instances never move.
 *
 * three.js's BatchedMesh.onBeforeRender walks every instance in every pass (main and shadow):
 * fetch its matrix, fetch its geometry's bounding sphere, transform the sphere (including the
 * largest axis scale), test six planes. For the ~6 k static landmark instances that was ~0.65 ms a
 * frame. Here each instance's world sphere is stored once (`setSphere`, a float4 per instance id)
 * and the walk is just the six plane tests. The draw list it writes is the same one three.js
 * writes (starts, counts, indirect ids), so the renderer and the shaders are untouched.
 *
 * Three more savings (perf audit, October 2026; docs/research/perf-audit-2026-10.md):
 *  - Each pass keeps its own draw list. The shadow pass draws from a second indirect texture and
 *    start/count arrays, swapped into the mesh around its shadow draw, so the passes no longer
 *    overwrite each other's list. A pass's indirect texture (draw id → instance id) is re-uploaded
 *    only when its sequence of instances changed; LOD swaps change only starts and counts, which
 *    the multi-draw takes as plain arrays. Before, every batch uploaded its indirect texture in
 *    every pass, empty or not: ~320 texture uploads a frame in the Forum.
 *  - The main pass is culled before three.js walks the scene (`hookScene`: the scene's
 *    onBeforeRender), and a batch with nothing in view is hidden for that walk, so it costs no
 *    program switch, uniform upload or binding. It is shown again before the shadow pass (which
 *    culls with the light's frustum) and after the frame.
 *  - Nothing is allocated per frame.
 *
 * And one from phase 3: a batch with no instance in the shadow camera's view stops casting for that
 * shadow pass (`precullShadow`, run as the shadow map starts). three.js's shadow walk still drew it,
 * with nothing in its list: a program switch, its uniforms and bindings for an empty multi-draw,
 * about a third of the city batches' shadow draws in the Forum.
 *
 * The same pre-cull also takes whole scene subtrees out of the main walk by one sphere each
 * (`cullAsWhole`: the people, registered by ActorSystem). three.js tests every mesh of a person
 * against the view on its own and walks all their nodes (bones, sockets, the head group) even when
 * the person is behind the camera. In the shadow pass such a subtree is left out when its sphere is
 * outside every shadow camera, or when its `casts()` says no (a person beyond the distance where
 * their body stops casting: their sword and helmet stopped casting too, instead of throwing shadows
 * with no body).
 *
 * `?lodoff=precull`, `?lodoff=passlists`, `?lodoff=shadowprecull` and `?lodoff=rootcull` switch these
 * off for A/B runs.
 *
 * The sphere must contain the instance in every geometry it can show (LOD twins are smaller than
 * the original, so the original's sphere does). Written against three r186's BatchedMesh fields;
 * if a field is missing (another version) the mesh keeps three.js's own walk.
 */
import * as THREE from 'three';

interface BatchedInternals {
  _instanceInfo: { visible: boolean; active: boolean; geometryIndex: number }[];
  _geometryInfo: { start: number; count: number }[];
  _multiDrawStarts: Int32Array;
  _multiDrawCounts: Int32Array;
  _multiDrawCount: number;
  _multiDrawBytesPerElement: number;
  _visibilityChanged: boolean;
  _indirectTexture: THREE.DataTexture;
  _maxInstanceCount: number;
}

const frustum = new THREE.Frustum();
const projView = new THREE.Matrix4();
/** The last camera's world-space frustum and the matrices it was made from (shared by every batch at the origin). */
const worldFrustum = new THREE.Frustum();
const worldKey = new Float64Array(32);
let worldCam: THREE.Camera | null = null;

/**
 * The planes to cull `mesh`'s instances with for `camera`. Batches sit at the origin, so all of
 * them share one world-space frustum per camera and pass (made again only when the camera's
 * matrices changed); a mesh elsewhere gets its own.
 */
function planesFor(camera: THREE.Camera, mesh: THREE.Object3D): THREE.Plane[] {
  const reversed = (camera as THREE.PerspectiveCamera & { reversedDepth?: boolean }).reversedDepth;
  if (!isIdentity(mesh.matrixWorld.elements)) {
    projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(mesh.matrixWorld);
    frustum.setFromProjectionMatrix(projView, camera.coordinateSystem, reversed);
    return frustum.planes;
  }
  const p = camera.projectionMatrix.elements, v = camera.matrixWorldInverse.elements;
  let same = worldCam === camera;
  for (let i = 0; same && i < 16; i++) same = worldKey[i] === p[i] && worldKey[16 + i] === v[i];
  if (!same) {
    projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    worldFrustum.setFromProjectionMatrix(projView, camera.coordinateSystem, reversed);
    for (let i = 0; i < 16; i++) {
      worldKey[i] = p[i];
      worldKey[16 + i] = v[i];
    }
    worldCam = camera;
  }
  return worldFrustum.planes;
}

function isIdentity(e: ArrayLike<number>): boolean {
  return e[0] === 1 && e[5] === 1 && e[10] === 1 && e[15] === 1 && e[1] === 0 && e[2] === 0 && e[3] === 0 && e[4] === 0 && e[6] === 0 && e[7] === 0 && e[8] === 0 && e[9] === 0 && e[11] === 0 && e[12] === 0 && e[13] === 0 && e[14] === 0;
}
const OFF = new URLSearchParams(globalThis.location?.search ?? '').get('lodoff') ?? '';
/** Runtime switches for A/B runs (scripts/perf-probe.mjs imports this module and flips them). */
export const fastCullSwitches = { precull: !OFF.includes('precull'), passLists: !OFF.includes('passlists'), shadowPrecull: !OFF.includes('shadowprecull'), rootCull: !OFF.includes('rootcull') };

/** Every installed cull, for the scene hook's pre-cull (an array: iterated every frame). */
const all: FastCull[] = [];
/** Batches hidden for the current main-pass walk (shown again before the shadow pass). */
const hidden: THREE.Object3D[] = [];
/** Scene children culled as a whole: a sphere `lift` m above the origin, `radius` m; `casts` false: no shadow at all. */
const roots: { object: THREE.Object3D; radius: number; lift: number; casts: (() => boolean) | null }[] = [];
/** Subtrees left out of the current shadow pass (shown again after it). */
const shadowHidden: THREE.Object3D[] = [];

/**
 * Cull `object` (a child of the scene) as a whole in the main pass: hidden for three.js's walk when
 * the sphere `radius` m around the point `lift` m above its origin is out of view (shown again for
 * the shadow pass and after the frame). The sphere must hold everything below the object.
 */
export function cullAsWhole(object: THREE.Object3D, radius: number, lift = 0, casts: (() => boolean) | null = null) {
  if (!roots.some((r) => r.object === object)) roots.push({ object, radius, lift, casts });
}

export function stopCullingAsWhole(object: THREE.Object3D) {
  const k = roots.findIndex((r) => r.object === object);
  if (k >= 0) roots.splice(k, 1);
}

/** Batches that cast nothing in the current shadow pass (their castShadow is back on after it). */
const noCast: THREE.Object3D[] = [];
const hookedScenes = new WeakSet<THREE.Object3D>();
const hookedRenderers = new WeakSet<THREE.WebGLRenderer>();
/** The main pass under way (set by the scene hook, cleared after the frame). */
let passToken = 0;
let passCamera: THREE.Camera | null = null;

/** Counters for the probe scripts: indirect-texture uploads, culls, batches skipped as empty (main pass, shadow pass), subtrees culled whole. */
export const fastCullStats = { uploads: 0, culls: 0, skipped: 0, shadowSkipped: 0, rootsCulled: 0 };

export class FastCull {
  private spheres = new Float32Array(64 * 4);
  /** The main pass's list lives in the mesh's own fields; what its texture holds is tracked here. */
  private mainN = -1;
  private mainTex: THREE.DataTexture | null = null;
  /** The pass token the main list was pre-culled for. */
  private preToken = -1;
  /** The shadow pass's own list. */
  private sStarts = new Int32Array(0);
  private sCounts = new Int32Array(0);
  private sTex: THREE.DataTexture | null = null;
  private sN = -1;
  /** The main fields while the shadow list is swapped in. */
  private savedStarts: Int32Array | null = null;
  private savedCounts: Int32Array | null = null;
  private savedTex: THREE.DataTexture | null = null;
  private savedN = 0;
  private savedBytes = 1;

  constructor(readonly mesh: THREE.BatchedMesh) {}

  /** The world-space sphere of instance `inst`. */
  setSphere(inst: number, x: number, y: number, z: number, r: number) {
    if ((inst + 1) * 4 > this.spheres.length) {
      const bigger = new Float32Array(Math.max(this.spheres.length * 2, (inst + 1) * 4));
      bigger.set(this.spheres);
      this.spheres = bigger;
    }
    const o = inst * 4;
    this.spheres[o] = x;
    this.spheres[o + 1] = y;
    this.spheres[o + 2] = z;
    this.spheres[o + 3] = r;
  }

  /** Take over the mesh's culling (a no-op on a three.js whose BatchedMesh differs from r186's). */
  install() {
    const m = this.mesh as unknown as BatchedInternals;
    if (!m._instanceInfo || !m._geometryInfo || !m._multiDrawStarts || !m._multiDrawCounts || !m._indirectTexture || this.mesh.sortObjects) return false;
    const original = THREE.BatchedMesh.prototype.onBeforeRender;
    const self = this;
    this.mesh.onBeforeRender = function (this: THREE.BatchedMesh, renderer, scene, camera, geometry, material, group) {
      if (self.stock(material, camera)) {
        self.mainN = -1; // three.js wrote the list: compare against nothing next time
        original.call(this, renderer, scene, camera, geometry, material, group);
        return;
      }
      hookScene(scene, renderer);
      // Culled for this very pass already, before the scene walk.
      if (self.preToken === passToken && camera === passCamera) return;
      self.cullMain(camera, geometry);
    } as THREE.Object3D['onBeforeRender'];
    this.mesh.onBeforeShadow = function (this: THREE.BatchedMesh, _renderer, _object, _camera, shadowCamera, geometry, depthMaterial) {
      if (self.stock(depthMaterial, shadowCamera)) {
        self.mainN = -1;
        self.preToken = -1;
        original.call(this, _renderer, null as unknown as THREE.Scene, shadowCamera, geometry, depthMaterial, null as unknown as THREE.Group);
        return;
      }
      if (!fastCullSwitches.passLists) {
        // One shared list: the shadow list overwrites the main one, which is rebuilt in full.
        self.preToken = -1;
        self.cullMain(shadowCamera, geometry);
        return;
      }
      self.enterShadow();
      self.sN = self.cull(shadowCamera, geometry, self.sN, self.sTex);
    } as THREE.Object3D['onBeforeShadow'];
    this.mesh.onAfterShadow = function () {
      self.leaveShadow();
    } as THREE.Object3D['onAfterShadow'];
    this.mesh.addEventListener('dispose', () => {
      const k = all.indexOf(this);
      if (k >= 0) all.splice(k, 1);
      this.sTex?.dispose();
      this.sTex = null;
    });
    all.push(this);
    return true;
  }

  /** Cases three.js's own walk handles (wireframe, XR cameras, per-instance culling off). */
  private stock(material: THREE.Material, camera: THREE.Camera) {
    return (material as THREE.MeshBasicMaterial).wireframe || (camera as THREE.ArrayCamera).isArrayCamera || !this.mesh.perObjectFrustumCulled;
  }

  /**
   * Is any visible instance inside `camera`'s view? (Stops at the first one; the shadow pre-cull.)
   * A mesh three.js culls itself (see `stock`) counts as in view.
   */
  anyInView(camera: THREE.Camera): boolean {
    if (this.stock(this.mesh.material as THREE.Material, camera)) return true;
    const m = this.mesh as unknown as BatchedInternals;
    const p = planesFor(camera, this.mesh);
    const instances = m._instanceInfo;
    const sp = this.spheres;
    for (let i = 0, l = instances.length; i < l; i++) {
      const info = instances[i];
      if (!info.visible || !info.active) continue;
      const o = i * 4;
      const x = sp[o], y = sp[o + 1], z = sp[o + 2], r = -sp[o + 3];
      let inside = true;
      for (let k = 0; k < 6; k++) {
        const n = p[k].normal;
        if (n.x * x + n.y * y + n.z * z + p[k].constant < r) {
          inside = false;
          break;
        }
      }
      if (inside) return true;
    }
    return false;
  }

  /** Main pass, before the scene walk: cull now; true when nothing is in view. */
  precull(camera: THREE.Camera): boolean {
    if (this.stock(this.mesh.material as THREE.Material, camera)) return false;
    this.cullMain(camera, this.mesh.geometry);
    this.preToken = passToken;
    return this.mainN === 0;
  }

  private cullMain(camera: THREE.Camera, geometry: THREE.BufferGeometry) {
    const m = this.mesh as unknown as BatchedInternals;
    this.mainN = this.cull(camera, geometry, this.mainN, this.mainTex);
    this.mainTex = m._indirectTexture;
  }

  /** Put the shadow list into the mesh's fields (sized to the mesh's capacity). */
  private enterShadow() {
    const m = this.mesh as unknown as BatchedInternals;
    const cap = m._maxInstanceCount;
    if (this.sStarts.length < cap) {
      this.sStarts = new Int32Array(cap);
      this.sCounts = new Int32Array(cap);
    }
    const size = m._indirectTexture.image.width;
    if (!this.sTex || this.sTex.image.width !== size) {
      this.sTex?.dispose();
      this.sTex = new THREE.DataTexture(new Uint32Array(size * size), size, size, THREE.RedIntegerFormat, THREE.UnsignedIntType);
      this.sN = -1;
    }
    this.savedStarts = m._multiDrawStarts;
    this.savedCounts = m._multiDrawCounts;
    this.savedTex = m._indirectTexture;
    this.savedN = m._multiDrawCount;
    this.savedBytes = m._multiDrawBytesPerElement;
    m._multiDrawStarts = this.sStarts;
    m._multiDrawCounts = this.sCounts;
    m._indirectTexture = this.sTex;
  }

  /** Give the mesh its main list back. */
  private leaveShadow() {
    if (!this.savedTex) return;
    const m = this.mesh as unknown as BatchedInternals;
    m._multiDrawStarts = this.savedStarts!;
    m._multiDrawCounts = this.savedCounts!;
    m._indirectTexture = this.savedTex;
    m._multiDrawCount = this.savedN;
    m._multiDrawBytesPerElement = this.savedBytes;
    this.savedStarts = this.savedCounts = this.savedTex = null;
  }

  /**
   * Write the visible instances into the mesh's current list fields. `prevN` and `prevTex`: the
   * length of the list the texture holds and the texture it was written for; the texture is only
   * flagged for upload when the instance sequence differs. Returns the new length.
   */
  private cull(camera: THREE.Camera, geometry: THREE.BufferGeometry, prevN: number, prevTex: THREE.DataTexture | null): number {
    const m = this.mesh as unknown as BatchedInternals;
    const index = geometry.getIndex();
    const bytes = index === null ? 1 : (index.array as ArrayBufferView & { BYTES_PER_ELEMENT: number }).BYTES_PER_ELEMENT;
    const p = planesFor(camera, this.mesh);
    const instances = m._instanceInfo;
    const geometries = m._geometryInfo;
    const starts = m._multiDrawStarts;
    const counts = m._multiDrawCounts;
    const tex = m._indirectTexture;
    const indirect = tex.image.data as unknown as Uint32Array;
    const sp = this.spheres;
    const p0 = p[0], p1 = p[1], p2 = p[2], p3 = p[3], p4 = p[4], p5 = p[5];
    const n0x = p0.normal.x, n0y = p0.normal.y, n0z = p0.normal.z, c0 = p0.constant;
    const n1x = p1.normal.x, n1y = p1.normal.y, n1z = p1.normal.z, c1 = p1.constant;
    const n2x = p2.normal.x, n2y = p2.normal.y, n2z = p2.normal.z, c2 = p2.constant;
    const n3x = p3.normal.x, n3y = p3.normal.y, n3z = p3.normal.z, c3 = p3.constant;
    const n4x = p4.normal.x, n4y = p4.normal.y, n4z = p4.normal.z, c4 = p4.constant;
    const n5x = p5.normal.x, n5y = p5.normal.y, n5z = p5.normal.z, c5 = p5.constant;
    let n = 0;
    let changed = tex !== prevTex;
    for (let i = 0, l = instances.length; i < l; i++) {
      const info = instances[i];
      if (!info.visible || !info.active) continue;
      const o = i * 4;
      const x = sp[o], y = sp[o + 1], z = sp[o + 2], r = -sp[o + 3];
      if (n0x * x + n0y * y + n0z * z + c0 < r) continue;
      if (n1x * x + n1y * y + n1z * z + c1 < r) continue;
      if (n2x * x + n2y * y + n2z * z + c2 < r) continue;
      if (n3x * x + n3y * y + n3z * z + c3 < r) continue;
      if (n4x * x + n4y * y + n4z * z + c4 < r) continue;
      if (n5x * x + n5y * y + n5z * z + c5 < r) continue;
      const g = geometries[info.geometryIndex];
      starts[n] = g.start * bytes;
      counts[n] = g.count;
      if (indirect[n] !== i) {
        indirect[n] = i;
        changed = true;
      }
      n++;
    }
    if (changed || n !== prevN) {
      tex.needsUpdate = true;
      fastCullStats.uploads++;
    }
    fastCullStats.culls++;
    m._multiDrawCount = n;
    m._multiDrawBytesPerElement = bytes;
    m._visibilityChanged = false;
    return n;
  }
}

/**
 * Hook a scene's render once: before three.js walks it, cull every batch in it for the camera and
 * hide the empty ones; show them again when the shadow pass starts and after the frame.
 */
function hookScene(scene: THREE.Object3D, renderer: THREE.WebGLRenderer) {
  if (scene && !hookedScenes.has(scene) && (scene as THREE.Scene).isScene) {
    hookedScenes.add(scene);
    const before = scene.onBeforeRender;
    const after = scene.onAfterRender;
    scene.onBeforeRender = function (this: THREE.Scene, r, s, camera, geometry, material, group) {
      before.call(this, r, s, camera, geometry, material, group);
      showHidden();
      passToken++;
      passCamera = camera;
      if (!fastCullSwitches.precull) return;
      for (let i = 0; i < all.length; i++) {
        const c = all[i];
        const mesh = c.mesh;
        if (!mesh.visible || !inScene(mesh, scene)) continue;
        if (c.precull(camera)) {
          mesh.visible = false;
          hidden.push(mesh);
          fastCullStats.skipped++;
        }
      }
      if (fastCullSwitches.rootCull && roots.length) cullRoots(scene, camera);
    } as THREE.Object3D['onBeforeRender'];
    scene.onAfterRender = function (this: THREE.Scene, r, s, camera, geometry, material, group) {
      showHidden();
      passCamera = null;
      after.call(this, r, s, camera, geometry, material, group);
    } as THREE.Object3D['onAfterRender'];
  }
  if (renderer?.shadowMap && !hookedRenderers.has(renderer)) {
    hookedRenderers.add(renderer);
    const sm = renderer.shadowMap;
    const render = sm.render.bind(sm);
    // The shadow pass walks the scene itself: what the main view could not see may cast into it.
    sm.render = (lights, s, camera) => {
      showHidden();
      if (fastCullSwitches.shadowPrecull && sm.enabled && (sm.autoUpdate || sm.needsUpdate) && lights.length > 0) precullShadow(lights, s, camera);
      try {
        render(lights, s, camera);
      } finally {
        for (const o of noCast) o.castShadow = true;
        noCast.length = 0;
        for (const o of shadowHidden) o.visible = true;
        shadowHidden.length = 0;
      }
    };
  }
}

/** Hide the registered subtrees whose sphere is out of `camera`'s view (shown again with the batches). */
function cullRoots(scene: THREE.Object3D, camera: THREE.Camera) {
  const p = planesFor(camera, scene);
  for (let i = 0; i < roots.length; i++) {
    const { object, radius, lift } = roots[i];
    if (object.parent === null) {
      // Gone from the world (a person disposed without leaving the registry): let it go.
      roots[i] = roots[roots.length - 1];
      roots.pop();
      i--;
      continue;
    }
    if (!object.visible || object.parent !== scene) continue;
    const e = object.matrixWorld.elements;
    if (sphereInView(p, e[12], e[13] + lift, e[14], radius)) continue;
    object.visible = false;
    hidden.push(object);
    fastCullStats.rootsCulled++;
  }
}

type ShadowLight = THREE.Light & { shadow?: THREE.LightShadow & { updateMatrices(light: THREE.Light, camera?: THREE.Camera): void } };

/**
 * Before a shadow pass: batches with no instance in any shadow camera's view stop casting for it
 * (their castShadow comes back after the pass). Only for plain one-view shadows (directional and
 * spot lights): point-light cubes and cascades keep three.js's own walk.
 */
function precullShadow(lights: ShadowLight[], scene: THREE.Object3D, camera: THREE.Camera) {
  for (const l of lights) {
    const sh = l.shadow;
    if (!sh || (l as THREE.PointLight).isPointLight || sh.getViewportCount() !== 1) return;
  }
  // The same matrices three.js is about to compute for the pass (it does this again, harmlessly).
  for (const l of lights) l.shadow!.updateMatrices(l, camera);
  for (let i = 0; i < all.length; i++) {
    const c = all[i];
    const mesh = c.mesh;
    if (!mesh.castShadow || !mesh.visible || !inScene(mesh, scene)) continue;
    let any = false;
    for (let k = 0; k < lights.length && !any; k++) any = c.anyInView(lights[k].shadow!.camera);
    if (any) continue;
    mesh.castShadow = false;
    noCast.push(mesh);
    fastCullStats.shadowSkipped++;
  }
  if (!fastCullSwitches.rootCull) return;
  for (let i = 0; i < roots.length; i++) {
    const { object, radius, lift, casts } = roots[i];
    if (!object.visible || object.parent !== scene) continue;
    let out = casts !== null && !casts();
    if (!out) {
      const e = object.matrixWorld.elements;
      const x = e[12], y = e[13] + lift, z = e[14];
      out = true;
      for (let k = 0; k < lights.length && out; k++) out = !sphereInView(planesFor(lights[k].shadow!.camera, scene), x, y, z, radius);
    }
    if (!out) continue;
    object.visible = false;
    shadowHidden.push(object);
  }
}

/** Is the sphere at (x, y, z) of radius `r` inside (or crossing) all six planes? */
function sphereInView(p: THREE.Plane[], x: number, y: number, z: number, r: number): boolean {
  for (let k = 0; k < 6; k++) {
    const n = p[k].normal;
    if (n.x * x + n.y * y + n.z * z + p[k].constant < -r) return false;
  }
  return true;
}

function showHidden() {
  for (const o of hidden) o.visible = true;
  hidden.length = 0;
}

/** Is `o` drawn as part of `scene` (every ancestor visible)? */
function inScene(o: THREE.Object3D, scene: THREE.Object3D): boolean {
  for (let p = o.parent; p; p = p.parent) {
    if (p === scene) return true;
    if (!p.visible) return false;
  }
  return false;
}
