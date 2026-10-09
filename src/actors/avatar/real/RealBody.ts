/**
 * Realistic bodies: loading, per-appearance geometry and the hook that puts one on an avatar.
 *
 *   await loadRealBodies(game.renderer);                 // GLBs + KTX2 maps (once)
 *   const avatar = createHumanoid(app);
 *   const real = applyRealBody(avatar);                  // swaps the body mesh, adds the eyes
 *   // every frame (or in a system): real.update(camera)   -> LOD by distance
 *
 * The GLB holds three LODs and the eyes in the bind pose of the reference rig (refs.ts), skinned to
 * the game's 25 bones by name. Only the vertex weights of the GLB skin are used: the avatar keeps
 * its own skeleton (HumanoidAvatar), so every animation, socket and IK target works unchanged. A
 * body for an appearance is the template morphed to that appearance's rig (morph.ts) and cached.
 *
 * Wave-1 scope: bare body and eyes. HumanoidAvatar still builds its procedural geometry first
 * (wasted work, replaced here); wave 2 gives it a constructor hook, see docs/modules/avatar-real.md.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import type { Appearance, Sex } from '../../appearance';
import type { HumanoidAvatar } from '../HumanoidAvatar';
import { B, computeRig, type Rig } from '../rig';
import { addCorrectives, updateCorrectives } from './corrective';
import { morphBody, type BodyArrays } from './morph';
import { refRig } from './refs';
import { eyeMaterial, IRIS_COLORS, skinMaterial } from './skin';

export const REAL_LODS = 3;
/** Distances (m) beyond which LOD 1 and LOD 2 are used (with a little hysteresis in update()). */
export const REAL_LOD_DISTANCE = [14, 40] as const;

interface Template {
  lods: BodyArrays[];
  uv: Float32Array[];
  index: (Uint16Array | Uint32Array)[];
  eyes: BodyArrays;
  eyeIndex: Uint16Array | Uint32Array;
  /** Eye centres in the reference pose (left, right). */
  eyeCenters: THREE.Vector3[];
  normalMaps: THREE.Texture[];
  aoMaps: THREE.Texture[];
}

const templates = new Map<Sex, Template>();
let loading: Promise<void> | null = null;
const baseUrl = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

export function realBodiesReady(): boolean {
  return templates.size === 2;
}

/** Load both bodies (GLB geometry + KTX2 maps). Safe to call repeatedly. */
export function loadRealBodies(renderer: THREE.WebGLRenderer): Promise<void> {
  loading ??= (async () => {
    const ktx2 = new KTX2Loader().setTranscoderPath(`${baseUrl}basis/`).setWorkerLimit(2).detectSupport(renderer);
    const gltf = new GLTFLoader();
    for (const sex of ['male', 'female'] as const) {
      const g = await gltf.loadAsync(`${baseUrl}models/people/${sex}.glb`);
      const tex = async (name: string) => {
        const t = await ktx2.loadAsync(`${baseUrl}textures/people/${sex}_${name}.ktx2`);
        t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        t.colorSpace = THREE.NoColorSpace;
        return t as THREE.Texture;
      };
      const normalMaps: THREE.Texture[] = [];
      const aoMaps: THREE.Texture[] = [];
      for (let i = 0; i < REAL_LODS; i++) {
        normalMaps.push(await tex(`n${i}`));
        aoMaps.push(await tex(`ao${i}`));
      }
      templates.set(sex, extract(g.scene, normalMaps, aoMaps));
    }
    ktx2.dispose();
  })();
  return loading;
}

function arrays(mesh: THREE.SkinnedMesh): BodyArrays {
  const geo = mesh.geometry;
  // The GLB's joint indices point into its own skin; remap them to the game's bone indices by name.
  const names = mesh.skeleton.bones.map((b) => b.name);
  const map = names.map((n) => (n in B ? B[n as keyof typeof B] : 0));
  const si = geo.getAttribute('skinIndex');
  const sw = geo.getAttribute('skinWeight');
  const idx = new Uint8Array(si.count * 4);
  const wt = new Float32Array(si.count * 4);
  for (let i = 0; i < si.count; i++) {
    for (let k = 0; k < 4; k++) {
      idx[i * 4 + k] = map[si.getComponent(i, k)];
      wt[i * 4 + k] = sw.getComponent(i, k);
    }
  }
  const tan = geo.getAttribute('tangent');
  // Pose-space corrective targets (relative deltas) by name, see corrective.ts.
  const mp = geo.morphAttributes.position as THREE.BufferAttribute[] | undefined;
  const mn = geo.morphAttributes.normal as THREE.BufferAttribute[] | undefined;
  const dict = mesh.morphTargetDictionary;
  const morphs = mp && dict
    ? Object.entries(dict).map(([name, i]) => ({ name, delta: Float32Array.from(mp[i].array as ArrayLike<number>), normal: mn?.[i] ? Float32Array.from(mn[i].array as ArrayLike<number>) : undefined }))
    : undefined;
  return {
    position: Float32Array.from(geo.getAttribute('position').array as ArrayLike<number>),
    normal: Float32Array.from(geo.getAttribute('normal').array as ArrayLike<number>),
    tangent: tan ? Float32Array.from(tan.array as ArrayLike<number>) : undefined,
    skinIndex: idx,
    skinWeight: wt,
    morphs,
  };
}

function extract(scene: THREE.Object3D, normalMaps: THREE.Texture[], aoMaps: THREE.Texture[]): Template {
  scene.updateMatrixWorld(true);
  const find = (suffix: string) => {
    let found: THREE.SkinnedMesh | null = null;
    scene.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh && o.name.endsWith(suffix)) found = o as THREE.SkinnedMesh;
    });
    if (!found) throw new Error(`real body: mesh ${suffix} missing in the GLB`);
    return found as THREE.SkinnedMesh;
  };
  const lods: BodyArrays[] = [];
  const uv: Float32Array[] = [];
  const index: (Uint16Array | Uint32Array)[] = [];
  for (let i = 0; i < REAL_LODS; i++) {
    const m = find(`lod${i}`);
    lods.push(arrays(m));
    uv.push(Float32Array.from(m.geometry.getAttribute('uv').array as ArrayLike<number>));
    index.push((m.geometry.index!.array as Uint16Array).slice());
  }
  const em = find('eyes');
  const eyes = arrays(em);
  // Eye centres: the two clusters of the eye mesh (x > 0 is the figure's left).
  const c = [new THREE.Vector3(), new THREE.Vector3()];
  const n = [0, 0];
  for (let i = 0; i < eyes.position.length / 3; i++) {
    const k = eyes.position[i * 3] > 0 ? 0 : 1;
    c[k].x += eyes.position[i * 3];
    c[k].y += eyes.position[i * 3 + 1];
    c[k].z += eyes.position[i * 3 + 2];
    n[k]++;
  }
  c[0].divideScalar(n[0]);
  c[1].divideScalar(n[1]);
  return { lods, uv, index, eyes, eyeIndex: (em.geometry.index!.array as Uint16Array).slice(), eyeCenters: c, normalMaps, aoMaps };
}

// ---------------------------------------------------------------- per-appearance geometry

export interface RealGeometry {
  key: string;
  sex: Sex;
  lods: THREE.BufferGeometry[];
  eyes: THREE.BufferGeometry;
  rig: Rig;
  refs: number;
}

const geoCache = new Map<string, RealGeometry>();

/** Cache key: everything that changes the morph (height to the millimetre). */
export function realKey(app: Pick<Appearance, 'sex' | 'age' | 'build' | 'height'>): string {
  return `${app.sex}|${app.age}|${app.build}|${Math.round(app.height * 1000)}`;
}

function buildGeometry(app: Appearance): RealGeometry {
  const tpl = templates.get(app.sex)!;
  const ref = refRig(app.sex);
  const rig = computeRig(app);
  const lods = tpl.lods.map((src, i) => {
    const out = {
      position: new Float32Array(src.position.length),
      normal: new Float32Array(src.normal.length),
      tangent: src.tangent ? new Float32Array(src.tangent.length) : undefined,
    };
    morphBody(src, ref, rig, out);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(out.position, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(out.normal, 3));
    if (out.tangent) geo.setAttribute('tangent', new THREE.BufferAttribute(out.tangent, 4));
    geo.setAttribute('uv', new THREE.BufferAttribute(tpl.uv[i], 2));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Uint16Array.from(src.skinIndex as ArrayLike<number>), 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(src.skinWeight as Float32Array, 4));
    geo.setIndex(new THREE.BufferAttribute(tpl.index[i], 1));
    geo.name = `real:${app.sex}:lod${i}`;
    addCorrectives(geo, { app, rig, sex: app.sex, lod: i as 0 | 1 | 2, body: src });
    return geo;
  });
  // Eyes: morphed with the head bone; `eyeLocal` is the direction from the eye centre (pupil axis +z).
  const eo = { position: new Float32Array(tpl.eyes.position.length), normal: new Float32Array(tpl.eyes.normal.length) };
  morphBody(tpl.eyes, ref, rig, eo);
  const eg = new THREE.BufferGeometry();
  eg.setAttribute('position', new THREE.BufferAttribute(eo.position, 3));
  eg.setAttribute('normal', new THREE.BufferAttribute(eo.normal, 3));
  const loc = new Float32Array(tpl.eyes.position.length);
  for (let i = 0; i < loc.length / 3; i++) {
    const c = tpl.eyeCenters[tpl.eyes.position[i * 3] > 0 ? 0 : 1];
    loc[i * 3] = tpl.eyes.position[i * 3] - c.x;
    loc[i * 3 + 1] = tpl.eyes.position[i * 3 + 1] - c.y;
    loc[i * 3 + 2] = tpl.eyes.position[i * 3 + 2] - c.z;
  }
  eg.setAttribute('eyeLocal', new THREE.BufferAttribute(loc, 3));
  eg.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Uint16Array.from(tpl.eyes.skinIndex as ArrayLike<number>), 4));
  eg.setAttribute('skinWeight', new THREE.BufferAttribute(tpl.eyes.skinWeight as Float32Array, 4));
  eg.setIndex(new THREE.BufferAttribute(tpl.eyeIndex, 1));
  for (const g of [...lods, eg]) g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, rig.height * 0.5, 0), rig.height * 1.15);
  return { key: realKey(app), sex: app.sex, lods, eyes: eg, rig, refs: 0 };
}

function acquire(app: Appearance): RealGeometry {
  const key = realKey(app);
  let g = geoCache.get(key);
  if (!g) {
    g = buildGeometry(app);
    geoCache.set(key, g);
  }
  g.refs++;
  return g;
}

function release(g: RealGeometry) {
  g.refs = Math.max(0, g.refs - 1);
  if (g.refs === 0 && geoCache.size > 48) {
    for (const [k, v] of geoCache) {
      if (v.refs === 0) {
        v.lods.forEach((l) => l.dispose());
        v.eyes.dispose();
        geoCache.delete(k);
        if (geoCache.size <= 40) break;
      }
    }
  }
}

// ---------------------------------------------------------------- applying to an avatar

export class RealBody {
  readonly eyes: THREE.SkinnedMesh;
  private geo: RealGeometry;
  private lod = 0;
  private disposed = false;
  private readonly app: Appearance;
  private readonly materials: THREE.Material[] = [];
  private readonly skin: string;

  constructor(readonly avatar: HumanoidAvatar) {
    this.app = avatar.appearance;
    this.skin = this.app.skin;
    this.geo = acquire(this.app);
    const tpl = templates.get(this.app.sex)!;
    for (let i = 0; i < REAL_LODS; i++) {
      this.materials.push(skinMaterial(`${this.app.sex}:${i}`, this.skin, { normal: tpl.normalMaps[i], ao: tpl.aoMaps[i] }));
    }
    const mesh = avatar.mesh;
    mesh.geometry = this.geo.lods[0];
    mesh.material = this.materials[0];
    // The procedural body's geometry (cached by the avatar module) stays with HumanoidAvatar; ours is separate.
    this.eyes = new THREE.SkinnedMesh(this.geo.eyes, eyeMaterial(irisFor(this.app)));
    this.eyes.name = 'humanoid:eyes';
    this.eyes.castShadow = false;
    avatar.root.add(this.eyes);
    this.eyes.updateMatrixWorld(true);
    this.eyes.bind(avatar.skeleton, new THREE.Matrix4());
    registry.add(this);
  }

  /** Pick the LOD for the distance from the camera (with hysteresis). */
  update(camera: THREE.Camera) {
    if (this.disposed) return;
    const m = this.avatar.root.matrixWorld.elements;
    const c = camera.matrixWorld.elements;
    const d = Math.hypot(m[12] - c[12], m[13] - c[13], m[14] - c[14]);
    const [a, b] = REAL_LOD_DISTANCE;
    let lod = this.lod;
    if (lod === 0 && d > a * 1.05) lod = 1;
    else if (lod === 1 && d < a * 0.95) lod = 0;
    if (lod === 1 && d > b * 1.05) lod = 2;
    else if (lod === 2 && d < b * 0.95) lod = 1;
    if (lod !== this.lod) this.setLod(lod);
    if (lod === 0) updateCorrectives(this.avatar.mesh, this.avatar.bones);
  }

  setLod(lod: number) {
    this.lod = lod;
    // A body with a limb cut off has its own geometry (combat/gore/dismemberReal.ts): keep it.
    if (!this.avatar.mesh.userData.goreGeometry) this.avatar.mesh.geometry = this.geo.lods[lod];
    this.avatar.mesh.material = this.materials[lod];
    this.eyes.visible = lod < 2;
  }

  get currentLod() {
    return this.lod;
  }

  get triangles() {
    return this.geo.lods[this.lod].index!.count / 3;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    registry.delete(this);
    this.eyes.removeFromParent();
    release(this.geo);
  }
}

const registry = new Set<RealBody>();

/** Update the LOD of every real body for a camera (call once per frame). */
export function updateRealBodies(camera: THREE.Camera) {
  for (const r of registry) r.update(camera);
}

function irisFor(app: Appearance): string {
  // A stable pick from the look: darker skin and hair, darker eyes; fair northerners get the lighter ones.
  let h = 0;
  const s = app.skin + app.hair.color + app.height;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const light = new THREE.Color(app.skin).getHSL({ h: 0, s: 0, l: 0 }).l;
  const pool = light > 0.55 ? IRIS_COLORS.slice(0, 6) : IRIS_COLORS.slice(0, 3);
  return pool[h % pool.length];
}

/** Put the realistic body on an avatar (needs loadRealBodies to have finished). */
export function applyRealBody(avatar: HumanoidAvatar): RealBody {
  if (!realBodiesReady()) throw new Error('applyRealBody: call loadRealBodies first');
  return new RealBody(avatar);
}
