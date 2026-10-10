/**
 * Realistic bodies: loading, per-appearance geometry, and the body of a HumanoidAvatar.
 *
 *   await loadRealBodies(game.renderer);       // GLBs + KTX2 maps (once; main.ts starts it at boot)
 *   const real = new RealBody(app, minLod);    // HumanoidAvatar does this: geometry for an appearance
 *   real.attach(avatar);                       // eyes, shells, head objects, correctives on its skeleton
 *
 * The GLB holds three LODs and the eyes in the bind pose of the reference rig (refs.ts), skinned to
 * the game's 25 bones by name. Only the vertex weights of the GLB skin are used: the avatar keeps
 * its own skeleton, so every animation, socket and IK target works unchanged. LOD 3 (about 300
 * triangles, for crowds far away) is made at load by vertex-cluster decimation of LOD 2.
 *
 * A body for an appearance is the template morphed to its rig (morph.ts), then dressed: the garment
 * rules of the procedural avatar are evaluated per vertex (garments/paint.ts) and the triangles are
 * assembled into a skin group and a cloth group (garments/assemble.ts). LOD 0 draws the two groups
 * with the realistic skin material and avatarMaterial; the far LODs are one avatarMaterial draw.
 * Geometry is cached per appearance (reference counted) and built per LOD on first need.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import type { Appearance, Sex } from '../../appearance';
import type { HumanoidAvatar } from '../HumanoidAvatar';
import { B, BONES, computeRig, type Rig } from '../rig';
import { avatarMaterial } from '../material';
import { realClothMaterial } from './garments/clothMaterial';
import { levels } from '../build/body';
import { buildArmorPieces } from '../build/armor';
import { buildBelt, buildLowerGarments } from '../build/garments';
import { buildCloak } from '../build/cloak';
import { headFrame } from '../build/head';
import { makeCtx, srgb } from '../build/common';
import { resolveOutfit } from '../build/outfit';
import { morphBody, type BodyArrays } from './morph';
import { refRig } from './refs';
import { eyeMaterial, IRIS_COLORS, skinMaterial, type EyeLids } from './skin';
import { deformAttributes, deformTable, paramsOf, type DeformVertex } from './deform';
import { measureJaw, measureLids } from './head/faceRig';
import { headMeasureOf } from './head/frame';
import { HandDriver } from '../anim/hands';
import { FaceDriver } from '../anim/face';
import { clusterDecimate, REAL_HEAD_CELL } from './decimate';
import { handParts, measureHand, reshapeHand, type HandMeasure, type HandParts } from './handShape';
import { paintBody, type TorsoMeasure } from './garments/paint';
import { MeasuredProfile } from './garments/measured';
import { assembleBody } from './garments/assemble';
import { buildShells } from './garments/shells';
import { buildHead, type RealHead } from './head/index';
import { addCorrectives, updateCorrectives } from './corrective';
import type { RealContext } from './types';

/** Body LODs: 0 (11 k triangles), 1 (4 k), 2 (1.2 k), 3 (about 300). */
export const REAL_LODS = 4;
/** LODs that have baked normal and AO maps. */
const MAP_LODS = 3;
/** Distances (m) beyond which LOD 1, 2 and 3 are used (with a little hysteresis). */
export const REAL_LOD_DISTANCE = [9, 22, 55] as const;
/** Eyes are a separate draw: only the LODs below this show them. */
const EYE_LODS = 1;
/** Triangle target of LOD 3. */
const LOD3_TRIS = 300;
/** LODs that wear the painted face (a per-appearance skin material). */
const PAINT_LODS = 1;
/** LODs drawn as skin + cloth with the realistic skin material; the others are one avatarMaterial draw. */
const SPLIT_LODS = [true, false, false, false];
/** Lazy LOD builds are spread out: at most one per this many milliseconds (all avatars). */
const BUILD_INTERVAL_MS = 5;

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
  /** The measured hands (left, right) in the reference pose, and which digit each vertex of LOD 0..2 belongs to. */
  hands: (HandMeasure | null)[];
  handParts: HandParts[];
  /** LOD 0 vertices that bend in the shader (fingers, thumbs, jaw: real/deform.ts). */
  deform: Map<number, DeformVertex>;
  /** The eye opening (head/faceRig.ts), for the eye shader's lids. */
  lids: EyeLids;
}

const templates = new Map<Sex, Template>();
let loading: Promise<void> | null = null;
const readyListeners: (() => void)[] = [];
const baseUrl = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

export function realBodiesReady(): boolean {
  return templates.size === 2;
}

/** Call `cb` once the bodies are loaded (immediately when they are). */
export function whenRealBodiesReady(cb: () => void) {
  if (realBodiesReady()) cb();
  else readyListeners.push(cb);
}

/** `?avatar=classic` falls back to the procedural bodies everywhere. */
export function classicRequested(): boolean {
  try {
    return new URLSearchParams(globalThis.location?.search ?? '').get('avatar') === 'classic';
  } catch {
    return false;
  }
}

/** Load both bodies (GLB geometry + KTX2 maps). Safe to call repeatedly. */
export function loadRealBodies(renderer: THREE.WebGLRenderer): Promise<void> {
  loading ??= (async () => {
    const ktx2 = new KTX2Loader().setTranscoderPath(`${baseUrl}basis/`).setWorkerLimit(2).detectSupport(renderer);
    const gltf = new GLTFLoader();
    const loaded = await Promise.all(
      (['male', 'female'] as const).map(async (sex) => {
        const g = await gltf.loadAsync(`${baseUrl}models/people/${sex}.glb`);
        const tex = async (name: string) => {
          const t = await ktx2.loadAsync(`${baseUrl}textures/people/${sex}_${name}.ktx2`);
          t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
          t.colorSpace = THREE.NoColorSpace;
          return t as THREE.Texture;
        };
        const normalMaps: THREE.Texture[] = [];
        const aoMaps: THREE.Texture[] = [];
        for (let i = 0; i < MAP_LODS; i++) {
          normalMaps.push(await tex(`n${i}`));
          aoMaps.push(await tex(`ao${i}`));
        }
        return [sex, extract(g.scene, normalMaps, aoMaps, sex)] as const;
      }),
    );
    for (const [sex, tpl] of loaded) templates.set(sex, tpl);
    ktx2.dispose();
    for (const cb of readyListeners.splice(0)) cb();
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
  return {
    position: Float32Array.from(geo.getAttribute('position').array as ArrayLike<number>),
    normal: Float32Array.from(geo.getAttribute('normal').array as ArrayLike<number>),
    tangent: tan ? Float32Array.from(tan.array as ArrayLike<number>) : undefined,
    skinIndex: idx,
    skinWeight: wt,
  };
}

function extract(scene: THREE.Object3D, normalMaps: THREE.Texture[], aoMaps: THREE.Texture[], sex: Sex): Template {
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
  for (let i = 0; i < MAP_LODS; i++) {
    const m = find(`lod${i}`);
    lods.push(arrays(m));
    uv.push(Float32Array.from(m.geometry.getAttribute('uv').array as ArrayLike<number>));
    index.push((m.geometry.index!.array as Uint16Array).slice());
  }
  // The hands, re-posed once for every LOD (handShape.ts): measured on LOD 0, the LODs share the bind pose.
  const hands: (HandMeasure | null)[] = [measureHand(lods[0], index[0], refRig(sex), 1), measureHand(lods[0], index[0], refRig(sex), -1)];
  const partsByLod: HandParts[] = [];
  for (let i = 0; i < MAP_LODS; i++) {
    const parts = handParts(lods[i].position.length / 3);
    for (const h of hands) if (h) reshapeHand(lods[i], h, refRig(sex), parts);
    partsByLod.push(parts);
  }
  // LOD 3: decimated from LOD 2 (no maps, so no UVs or tangents).
  // Half-size cells on the head keep its silhouette (a skull and a chin, not a wedge).
  const cells = new Array<number>(BONES.length).fill(1);
  cells[B.head] = REAL_HEAD_CELL;
  const d = clusterDecimate(lods[2], index[2], LOD3_TRIS, cells);
  lods.push({ position: d.position, normal: d.normal, skinIndex: d.skinIndex, skinWeight: d.skinWeight });
  index.push(d.index);
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
  // The face's moving parts: the jaw and the lids (head/faceRig.ts), measured on LOD 0.
  let eyeR = 0;
  for (let i = 0; i < eyes.position.length / 3; i++)
    if (eyes.position[i * 3] > 0) eyeR = Math.max(eyeR, Math.hypot(eyes.position[i * 3] - c[0].x, eyes.position[i * 3 + 1] - c[0].y, eyes.position[i * 3 + 2] - c[0].z));
  const lids = measureLids(lods[0], index[0], c[0].toArray(), eyeR, 1);
  const jaw = measureJaw(lods[0], headMeasureOf(lods[0], sex));
  const deform = deformTable(hands, partsByLod[0], jaw);
  return { lods, uv, index, eyes, eyeIndex: (em.geometry.index!.array as Uint16Array).slice(), eyeCenters: c, normalMaps, aoMaps, hands, handParts: partsByLod, deform, lids };
}

// ---------------------------------------------------------------- per-appearance geometry

interface LodData {
  geometry: THREE.BufferGeometry;
  split: boolean;
  triangles: number;
  /** Shell garments for this LOD (geometry shared by every avatar with the entry), or null. */
  shells: THREE.BufferGeometry | null;
}

interface Entry {
  key: string;
  app: Appearance;
  rig: Rig;
  eyes: THREE.BufferGeometry;
  /** Eye height of the morphed body (bind pose). */
  eyeY: number;
  /** Morphed template arrays per LOD (kept for head fitting and later builds). */
  body: (BodyArrays | null)[];
  lods: (LodData | null)[];
  refs: number;
  /** Whether a head module supplies the helmets (the rigid pieces then leave them out). */
  headHelmets: boolean;
}

const cache = new Map<string, Entry>();
/** LOD builds so far and their total time (ms), for the perf survey and the debug overlay. */
export const buildStats = { lods: 0, ms: 0 };
const MAX_ENTRIES = 40;
let lastBuild = -Infinity;

/** Cache key: everything that changes the morph or the painted garments (hair is the head module's). */
export function realKey(app: Appearance): string {
  return JSON.stringify([app.sex, app.age, app.build, Math.round(app.height * 1000), app.skin, app.garments, app.footwear ?? '', app.armor ?? null]);
}

function morphedBody(e: Entry, lod: number): BodyArrays {
  let b = e.body[lod];
  if (b) return b;
  const tpl = templates.get(e.app.sex)!;
  const src = tpl.lods[lod];
  const out = {
    position: new Float32Array(src.position.length),
    normal: new Float32Array(src.normal.length),
    tangent: src.tangent ? new Float32Array(src.tangent.length) : undefined,
  };
  morphBody(src, refRig(e.app.sex), e.rig, out);
  b = { position: out.position, normal: out.normal, tangent: out.tangent, skinIndex: src.skinIndex, skinWeight: src.skinWeight };
  e.body[lod] = b;
  return b;
}

function context(e: Entry, lod: 0 | 1 | 2): RealContext {
  return { app: e.app, rig: e.rig, sex: e.app.sex, lod, body: morphedBody(e, lod) };
}

/**
 * The rigid and lofted pieces on top of the painted body: armour (segmentata lames, galerus, cardiophylax,
 * scarf, helmets), belts, and, while no shell module supplies them, the procedural skirts, togas, pallae,
 * aprons and cloaks (the same lofts the classic avatar wears, anchored on the rig's joints). A head module
 * that supplies helmets replaces the procedural ones.
 */
function rigidPieces(e: Entry, lod: number, shells: boolean, torso: TorsoMeasure): THREE.BufferGeometry | null {
  if (lod >= 3) return null;
  const outfit = resolveOutfit(e.app);
  const a = outfit.armor;
  const o = e.headHelmets && a.helmet ? { ...outfit, armor: { ...a, helmet: undefined } } : outfit;
  const ctx = makeCtx(e.rig, e.app, o, lod === 0 ? 'high' : 'low');
  const L = levels(e.rig);
  const prof = new MeasuredProfile(ctx, L, torso);
  if (shells) buildBelt(ctx, L, prof);
  else {
    buildLowerGarments(ctx, L, prof);
    buildCloak(ctx, L, prof);
  }
  buildArmorPieces(ctx, L, prof, headFrame(ctx, L));
  if (ctx.b.triangleCount === 0) return null;
  return ctx.b.build();
}

function buildLod(e: Entry, lod: number): LodData {
  const t0 = performance.now();
  const tpl = templates.get(e.app.sex)!;
  const body = morphedBody(e, lod);
  const split = SPLIT_LODS[lod];
  const paint = paintBody({ app: e.app, rig: e.rig, body, index: split ? tpl.index[lod] : undefined });
  let shells: ReturnType<typeof buildShells> = null;
  if (lod <= 2) shells = buildShells(context(e, lod as 0 | 1 | 2));
  const a = assembleBody({
    position: body.position,
    normal: body.normal,
    tangent: split ? body.tangent : undefined,
    uv: split ? tpl.uv[lod] : undefined,
    skinIndex: body.skinIndex,
    skinWeight: body.skinWeight,
    index: tpl.index[lod],
    paint,
    hide: shells?.hide ?? null,
    split,
    rigid: rigidPieces(e, lod, !!shells, paint.torso),
  });
  const geo = a.geometry;
  geo.name = `real:${e.app.sex}:lod${lod}`;
  if (lod <= 2) applyCorrectives(geo, a, context(e, lod as 0 | 1 | 2));
  if (lod === 3) farHead(geo, e);
  if (split) {
    // Fingers, thumbs and jaw bend in the skin shader (real/deform.ts); appended cloth copies stay still.
    const d = deformAttributes(tpl.deform, geo.getAttribute('position').count, refRig(e.app.sex), e.rig);
    geo.setAttribute('aDef0', new THREE.BufferAttribute(d.a0, 4));
    geo.setAttribute('aDef1', new THREE.BufferAttribute(d.a1, 4));
  }
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, e.rig.height * 0.5, 0), e.rig.height * 1.15);
  if (shells) shells.geometry.boundingSphere = geo.boundingSphere.clone();
  buildStats.lods++;
  buildStats.ms += performance.now() - t0;
  return { geometry: geo, split, triangles: a.triangles, shells: shells?.geometry ?? null };
}

/**
 * LOD 3 has no hair or headgear (the head objects stop at LOD 2): paint the crown of the head in the hair's
 * colour (or the helmet's metal, or the veil's cloth) so a far crowd keeps its dark heads and helmets.
 */
function farHead(geo: THREE.BufferGeometry, e: Entry) {
  const app = e.app;
  const veil = app.hair.style === 'veiled' || app.hair.style === 'vestal';
  if (app.hair.style === 'bald' && !app.armor?.helmet) return;
  const hex = app.armor?.helmet ? '#7d7b76' : veil ? app.garments.find((g) => g.kind === 'palla' || g.kind === 'toga')?.color ?? '#d8d0bf' : app.hair.color;
  const c = srgb(hex);
  const pos = geo.getAttribute('position');
  const col = geo.getAttribute('color');
  const si = geo.getAttribute('skinIndex');
  const sw = geo.getAttribute('skinWeight');
  const r = e.rig;
  const chin = r.height - r.headH;
  const jz = r.joints[B.head * 3 + 2];
  // A cap (helmet), or hair that comes down further at the back and sides than over the brow.
  const low = app.armor?.helmet ? 0.62 : veil ? 0.45 : 0.36;
  for (let v = 0; v < pos.count; v++) {
    let w = 0;
    for (let k = 0; k < 4; k++) if (si.getComponent(v, k) === B.head) w += sw.getComponent(v, k);
    if (w < 0.5) continue;
    const yf = (pos.getY(v) - chin) / r.headH;
    const front = Math.min(1, Math.max(0, (pos.getZ(v) - jz + 0.03 * r.s) / (0.11 * r.s)));
    const line = low + (0.8 - low) * front * front;
    if (yf < line) continue;
    col.setXYZ(v, c.r, c.g, c.b);
  }
}

/**
 * Let the corrective module add its morph targets to a template-ordered geometry, then carry them over to
 * the assembled one (appended copies take their source vertex's offsets, rigid pieces none).
 */
function applyCorrectives(geo: THREE.BufferGeometry, a: ReturnType<typeof assembleBody>, ctx: RealContext) {
  const t = new THREE.BufferGeometry();
  t.setAttribute('position', new THREE.BufferAttribute(ctx.body.position, 3));
  t.setAttribute('normal', new THREE.BufferAttribute(ctx.body.normal, 3));
  t.setAttribute('skinIndex', new THREE.BufferAttribute(Uint16Array.from(ctx.body.skinIndex as ArrayLike<number>), 4));
  t.setAttribute('skinWeight', new THREE.BufferAttribute(ctx.body.skinWeight as Float32Array, 4));
  addCorrectives(t, ctx);
  const total = geo.getAttribute('position').count;
  const morphs = t.morphAttributes as Record<string, THREE.BufferAttribute[]>;
  for (const key of Object.keys(morphs)) {
    (geo.morphAttributes as Record<string, THREE.BufferAttribute[]>)[key] = morphs[key].map((attr) => {
      const size = attr.itemSize;
      const out = new Float32Array(total * size);
      for (let v = 0; v < a.count; v++) for (let k = 0; k < size; k++) out[v * size + k] = attr.getComponent(v, k);
      for (let j = 0; j < a.source.length; j++) {
        const s = a.source[j];
        if (s >= 0) for (let k = 0; k < size; k++) out[(a.count + j) * size + k] = attr.getComponent(s, k);
      }
      const o = new THREE.BufferAttribute(out, size);
      o.name = attr.name;
      return o;
    });
  }
  geo.morphTargetsRelative = t.morphTargetsRelative;
  if (t.userData.morphTargetDictionary) geo.userData.morphTargetDictionary = t.userData.morphTargetDictionary;
}

function buildEntry(app: Appearance): Entry {
  const tpl = templates.get(app.sex)!;
  const rig = computeRig(app);
  // Eyes: morphed with the head bone; `eyeLocal` is the direction from the eye centre (pupil axis +z).
  const eo = { position: new Float32Array(tpl.eyes.position.length), normal: new Float32Array(tpl.eyes.normal.length) };
  morphBody(tpl.eyes, refRig(app.sex), rig, eo);
  const eg = new THREE.BufferGeometry();
  eg.setAttribute('position', new THREE.BufferAttribute(eo.position, 3));
  eg.setAttribute('normal', new THREE.BufferAttribute(eo.normal, 3));
  const loc = new Float32Array(tpl.eyes.position.length);
  let ey = 0;
  const ne = loc.length / 3;
  for (let i = 0; i < ne; i++) {
    const c = tpl.eyeCenters[tpl.eyes.position[i * 3] > 0 ? 0 : 1];
    loc[i * 3] = tpl.eyes.position[i * 3] - c.x;
    loc[i * 3 + 1] = tpl.eyes.position[i * 3 + 1] - c.y;
    loc[i * 3 + 2] = tpl.eyes.position[i * 3 + 2] - c.z;
    ey += eo.position[i * 3 + 1] / ne;
  }
  eg.setAttribute('eyeLocal', new THREE.BufferAttribute(loc, 3));
  eg.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Uint16Array.from(tpl.eyes.skinIndex as ArrayLike<number>), 4));
  eg.setAttribute('skinWeight', new THREE.BufferAttribute(tpl.eyes.skinWeight as Float32Array, 4));
  eg.setIndex(new THREE.BufferAttribute(tpl.eyeIndex, 1));
  eg.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, rig.height * 0.5, 0), rig.height * 1.15);
  rig.eyeHeight = ey;
  return { key: realKey(app), app, rig, eyes: eg, eyeY: ey, body: new Array(REAL_LODS).fill(null), lods: new Array(REAL_LODS).fill(null), refs: 0, headHelmets: false };
}

function acquire(app: Appearance): Entry {
  const key = realKey(app);
  let e = cache.get(key);
  if (!e) {
    e = buildEntry(app);
    cache.set(key, e);
  }
  e.refs++;
  return e;
}

function release(e: Entry) {
  e.refs = Math.max(0, e.refs - 1);
  if (e.refs === 0 && cache.size > MAX_ENTRIES) {
    for (const [k, v] of cache) {
      if (v.refs === 0) {
        for (const l of v.lods) {
          l?.geometry.dispose();
          l?.shells?.dispose();
        }
        v.eyes.dispose();
        cache.delete(k);
        if (cache.size <= MAX_ENTRIES - 8) break;
      }
    }
  }
}

/** Cache statistics (tests, debug). */
export function realCacheStats() {
  let held = 0;
  for (const e of cache.values()) if (e.refs > 0) held++;
  return { entries: cache.size, held };
}

// ---------------------------------------------------------------- the body of an avatar

function irisFor(app: Appearance): string {
  // A stable pick from the look: darker skin and hair, darker eyes; fair northerners get the lighter ones.
  let h = 0;
  const s = app.skin + app.hair.color + app.height;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const light = new THREE.Color(app.skin).getHSL({ h: 0, s: 0, l: 0 }).l;
  const pool = light > 0.55 ? IRIS_COLORS.slice(0, 6) : IRIS_COLORS.slice(0, 3);
  return pool[h % pool.length];
}

const tmpM = new THREE.Matrix4();
const tmpV = new THREE.Vector3();
/** The real body of each avatar (for the face director: who is speaking). */
const bodies = new WeakMap<HumanoidAvatar, RealBody>();

/** The realistic body of an avatar, if it has one. */
export function realBodyOf(avatar: unknown): RealBody | undefined {
  return bodies.get(avatar as HumanoidAvatar);
}

export class RealBody {
  private entry: Entry;
  private lod: number;
  private avatar: HumanoidAvatar | null = null;
  private eyes: THREE.SkinnedMesh | null = null;
  private shells: THREE.SkinnedMesh | null = null;
  private headRoot: THREE.Group | null = null;
  /** Skinned head objects (hair, headgear) bound to the avatar's skeleton on its root. */
  private mountedSkinned: THREE.Object3D[] = [];
  private headObjects: THREE.Object3D[] = [];
  private head: RealHead | null = null;
  private firstPerson = false;
  private disposed = false;
  private skinMats: THREE.Material[] = [];
  /** Hands that grip and faces that blink, talk and look (anim/hands.ts, anim/face.ts). */
  private readonly hands = new HandDriver();
  readonly face = new FaceDriver();
  private lookTarget: THREE.Vector3 | null = null;
  private lastFaceT = -1;
  /** The face and hands were driven last frame (LOD 0). */
  private alive = true;

  /** `lod`: the LOD to build now (the avatar picks the right one once it knows its distance). */
  constructor(app: Appearance, lod = 2) {
    this.entry = acquire(app);
    this.lod = lod;
    this.makeHead();
    this.ensure(lod);
  }

  /** Hair, beards and head-gear from the head module; whether it supplies helmets decides the rigid pieces. */
  private makeHead() {
    this.head?.dispose();
    const head = buildHead(context(this.entry, 0));
    this.head = head;
    this.headObjects = head.objects;
    if (this.entry.headHelmets !== head.objects.length > 0) {
      // The flag shapes the rigid pieces baked into the LOD geometry: rebuild if it changed.
      this.entry.headHelmets = head.objects.length > 0;
      this.entry.lods.fill(null);
    }
  }

  get rig(): Rig {
    return this.entry.rig;
  }

  get currentLod() {
    return this.lod;
  }

  get triangles() {
    return this.entry.lods[this.lod]?.triangles ?? 0;
  }

  private ensure(lod: number): LodData {
    let d = this.entry.lods[lod];
    if (!d) {
      d = buildLod(this.entry, lod);
      this.entry.lods[lod] = d;
    }
    return d;
  }

  /** Geometry and material of the current LOD (for the avatar's mesh). */
  get geometry(): THREE.BufferGeometry {
    return this.ensure(this.lod).geometry;
  }

  get material(): THREE.Material | THREE.Material[] {
    const split = this.ensure(this.lod).split;
    if (!split) return avatarMaterial();
    return [this.skin(this.lod), realClothMaterial()];
  }

  private skin(lod: number): THREE.Material {
    const app = this.entry.app;
    const tpl = templates.get(app.sex)!;
    // The painted face (brows, lips, stubble, age) only reads up close; farther out everyone shares one material.
    const paint = lod <= PAINT_LODS && this.head ? this.head.skinPaint : undefined;
    return skinMaterial(`${app.sex}:${lod}`, app.skin, { normal: tpl.normalMaps[lod], ao: tpl.aoMaps[lod] }, paint);
  }

  /** Eyes, shells, head objects: everything that rides on the avatar's skeleton. */
  attach(avatar: HumanoidAvatar) {
    this.avatar = avatar;
    bodies.set(avatar, this);
    this.eyes = new THREE.SkinnedMesh(this.entry.eyes, this.eyeMaterial());
    this.eyes.name = 'humanoid:eyes';
    this.eyes.castShadow = false;
    avatar.root.add(this.eyes);
    this.eyes.updateMatrixWorld(true);
    this.eyes.bind(avatar.skeleton, new THREE.Matrix4());
    this.eyes.visible = this.lod < EYE_LODS && !this.firstPerson;
    this.mountHead();
    this.applyShells();
  }

  /**
   * Their geometry is expressed in the character's bind pose (like the body), so the head objects ride in
   * a group that cancels the head bone's offset.
   */
  private mountHead() {
    const av = this.avatar!;
    this.headRoot?.removeFromParent();
    for (const o of this.mountedSkinned) o.removeFromParent();
    this.mountedSkinned = [];
    const J = this.entry.rig.joints;
    const root = new THREE.Group();
    root.name = 'humanoid:head';
    root.position.set(-J[B.head * 3], -J[B.head * 3 + 1], -J[B.head * 3 + 2]);
    for (const o of this.headObjects) {
      // Skinned head objects (hair, headgear: real/head) carry their own weights in the bind pose, like the
      // eyes: they hang on the avatar's root and bind to its skeleton. Rigid ones ride the head bone.
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) {
        const sm = o as THREE.SkinnedMesh;
        sm.removeFromParent();
        av.root.add(sm);
        sm.updateMatrixWorld(true);
        sm.bind(av.skeleton, new THREE.Matrix4());
        // Cull on the geometry's body-sized sphere: one measured from the skinned pose goes stale when the
        // person falls or ragdolls.
        if (sm.geometry.boundingSphere) sm.boundingSphere = sm.geometry.boundingSphere.clone();
        this.mountedSkinned.push(sm);
      } else root.add(o);
    }
    av.bone('head').add(root);
    this.headRoot = root;
    this.setHeadVisible(!this.firstPerson && this.lod < 3);
  }

  /** Show or hide everything the head carries (the group on the head bone and the skinned head objects). */
  private setHeadVisible(on: boolean) {
    if (this.headRoot) this.headRoot.visible = on;
    for (const o of this.mountedSkinned) o.visible = on;
  }

  private applyShells() {
    const av = this.avatar;
    if (!av) return;
    const g = this.lod <= 2 ? this.entry.lods[this.lod]?.shells ?? null : null;
    if (!g) {
      if (this.shells) this.shells.visible = false;
      return;
    }
    if (!this.shells) {
      this.shells = new THREE.SkinnedMesh(g, avatarMaterial());
      this.shells.name = 'humanoid:shells';
      this.shells.castShadow = av.mesh.castShadow;
      this.shells.receiveShadow = true;
      av.root.add(this.shells);
      this.shells.updateMatrixWorld(true);
      this.shells.bind(av.skeleton, new THREE.Matrix4());
    }
    this.shells.geometry = g;
    this.shells.visible = true;
  }

  /** Pick the LOD for a distance (m) from the viewer, at least `minLod`. Returns true if the LOD changed. */
  updateLod(d: number, minLod = 0): boolean {
    if (this.disposed || !this.avatar) return false;
    const T = REAL_LOD_DISTANCE;
    let lod = this.lod;
    // Up one level beyond the threshold, down one level a little inside it (hysteresis).
    while (lod < 3 && d > T[lod] * 1.05) lod++;
    while (lod > 0 && d < T[lod - 1] * 0.95) lod--;
    lod = Math.max(lod, Math.min(minLod, 3));
    if (lod === this.lod) return false;
    if (!this.entry.lods[lod]) {
      const now = performance.now();
      if (now - lastBuild < BUILD_INTERVAL_MS) return false;
      lastBuild = now;
    }
    this.setLod(lod);
    return true;
  }

  setLod(lod: number) {
    this.lod = lod;
    const av = this.avatar;
    if (!av) return;
    const mesh = av.mesh;
    mesh.geometry = this.geometry;
    mesh.material = this.material;
    mesh.updateMorphTargets();
    if (this.eyes) this.eyes.visible = lod < EYE_LODS && !this.firstPerson;
    this.head?.setLod(Math.min(lod, 2) as 0 | 1 | 2);
    this.setHeadVisible(!this.firstPerson && lod < 3);
    this.applyShells();
    this.updateCorrectives();
  }

  /** Iris, lid skin and the template's lid opening. */
  private eyeMaterial(): THREE.Material {
    const app = this.entry.app;
    return eyeMaterial(irisFor(app), app.skin, templates.get(app.sex)!.lids, app.sex);
  }

  /**
   * After the animation updated the bones: the corrective shapes, then the hands (the knuckle curl shared
   * out over the finger joints) and the face (blinks, jaw, gaze) at LOD 0.
   */
  updateCorrectives() {
    const av = this.avatar;
    if (!av) return;
    if (this.lod <= 2) updateCorrectives(av.mesh, av.bones);
    const near = this.lod === 0;
    // Faces and hands only move at LOD 0 (the skin shader that bends them and the eyes are only there):
    // farther out, one last pass hands the bones back their plain curl and zeroes the parameters.
    if (!near && !this.alive) return;
    this.alive = near;
    const params = paramsOf(av.skeleton);
    // Which hands hold something (a handle to wrap) and which are empty (a fist).
    const eq = av.equipment as HumanoidAvatar['equipment'] | undefined;
    const drawn = !!eq && eq.inHand && !eq.droppedItems;
    const heldR = drawn && !!eq!.weaponObject;
    const heldL = !!eq && ((drawn && (!!eq.shieldObject || !!eq.twoHandGrip())) || !!eq.offHand());
    this.hands.update(av.bones, params, near, heldL, heldR);
    const now = performance.now() / 1000;
    const dt = this.lastFaceT < 0 || !near ? 0 : Math.min(0.1, Math.max(0, now - this.lastFaceT));
    this.lastFaceT = now;
    if (near && !this.firstPerson) {
      this.aimEyes(av);
      this.face.update(dt, params);
    } else FaceDriver.clear(params);
    if (av.skeleton.boneTexture) av.skeleton.boneTexture.needsUpdate = true;
  }

  /** The eyes toward the head's look-at target (in the head's frame, from between the eyes). */
  private aimEyes(av: HumanoidAvatar) {
    const t = this.lookTarget;
    if (!t) {
      this.face.lookAt(null);
      return;
    }
    const head = av.bones[B.head];
    const J = this.entry.rig.joints;
    tmpM.copy(head.matrixWorld).invert();
    tmpV.copy(t).applyMatrix4(tmpM);
    // Head-bone space has the bind pose's axes; the eyes sit above and in front of the joint.
    const dx = tmpV.x;
    const dy = tmpV.y - (this.entry.eyeY - J[B.head * 3 + 1]);
    const dz = tmpV.z - (0.085 * this.entry.rig.s - J[B.head * 3 + 2]);
    const yaw = Math.atan2(dx, dz);
    if (Math.abs(yaw) > 1.4) {
      this.face.lookAt(null);
      return;
    }
    this.face.lookAt(yaw, Math.atan2(dy, Math.hypot(dx, dz)));
  }

  /** The point the head turns to (the avatar's look-at; a live reference: it is read every frame). */
  lookAt(p: THREE.Vector3 | null) {
    this.lookTarget = p;
  }

  /** Move the jaw to a spoken line (subtitles, dialogue). */
  speak(text: string) {
    this.face.speak(text);
  }

  setFirstPerson(on: boolean) {
    this.firstPerson = on;
    if (on && this.avatar) FaceDriver.clear(paramsOf(this.avatar.skeleton));
    if (this.eyes) this.eyes.visible = !on && this.lod < EYE_LODS;
    this.setHeadVisible(!on && this.lod < 3);
  }

  /** A new look for the same avatar (clothes, armour, height...). Returns the new rig. */
  setAppearance(app: Appearance): Rig {
    const old = this.entry;
    this.entry = acquire(app);
    release(old);
    const av = this.avatar;
    this.makeHead();
    if (av) {
      this.eyes!.geometry = this.entry.eyes;
      this.eyes!.material = this.eyeMaterial();
      this.mountHead();
    }
    // Keep the LOD in use; the geometry is built now (the look just changed, there is no old mesh to keep).
    this.setLod(this.lod);
    return this.entry.rig;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.avatar && bodies.get(this.avatar) === this) bodies.delete(this.avatar);
    this.eyes?.removeFromParent();
    this.shells?.removeFromParent();
    this.headRoot?.removeFromParent();
    for (const o of this.mountedSkinned) o.removeFromParent();
    this.mountedSkinned = [];
    this.head?.dispose();
    this.head = null;
    release(this.entry);
  }
}
