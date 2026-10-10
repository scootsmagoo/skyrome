/**
 * The baked cloth library: garments simulated offline in Blender (tools/characters/garments.py) on the reference
 * bodies, loaded from public/models/garments/<sex>.glb, and bound once per (sex, garment, LOD) to the reference
 * body of the same LOD (bind.ts). fit.ts fits them to each person.
 *
 * GLB contract (one file per sex): meshes `<id>_lod<k>` (k = 0..2) in the reference bind pose (game space) with
 * TEXCOORD_0 = pattern coordinates (metres on the flat cloth), TEXCOORD_1 = (distance to the nearest bordered
 * edge in metres, ambient occlusion), TEXCOORD_2 = (part id, 1 on the turned hem's rim). glTF stores v flipped
 * (1 - v), so the second component of each is read back as 1 - v.
 */
import type * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Sex } from '../../../appearance';
import type { BodyArrays } from '../morph';
import { TriGrid, bindGarment, coverMask, transferWeights, type Binding, type CoverOptions, type WeightPolicy, type BindOptions } from './bind';

export const BAKED_IDS = ['tunic_short', 'tunic_knee', 'tunic_long', 'toga', 'toga_velata', 'stola', 'palla', 'paenula', 'sagum', 'lacerna'] as const;
export type BakedId = (typeof BAKED_IDS)[number];

export interface BakedMesh {
  position: Float32Array;
  normal: Float32Array;
  index: Uint16Array | Uint32Array;
  /** Pattern coordinates (u, v) in metres. */
  pattern: Float32Array;
  /** Distance to the nearest bordered edge (m; 9 where the garment has none). */
  border: Float32Array;
  ao: Float32Array;
  part: Uint8Array;
  rim: Uint8Array;
}

/** The reference body of a sex at a LOD (RealBody hands these over once its templates are loaded). */
export type TemplateSource = (sex: Sex, lod: number) => { body: BodyArrays; index: ArrayLike<number> } | null;

const meshes = new Map<string, BakedMesh>();
let templateOf: TemplateSource | null = null;
let loaded = false;
/** The rules of each garment (fit.ts registers them when it loads), so the bindings can be made at load time. */
let rulesOf: ((sex: Sex, id: BakedId) => GarmentRules) | null = null;

export function registerGarmentRules(fn: (sex: Sex, id: BakedId) => GarmentRules) {
  rulesOf = fn;
}

const key = (sex: Sex, id: BakedId, lod: number) => `${sex}:${id}:${lod}`;

/** `?cloth=procedural` keeps the C3a procedural garments (A/B comparisons). */
function disabled(): boolean {
  try {
    return new URLSearchParams(globalThis.location?.search ?? '').get('cloth') === 'procedural';
  } catch {
    return false;
  }
}

/**
 * Load the baked garments of both sexes. Missing files are fine (every garment then falls back to its
 * procedural shell). Called from loadRealBodies once the body templates exist.
 */
export async function loadBakedGarments(loader: GLTFLoader, baseUrl: string, templates: TemplateSource): Promise<void> {
  templateOf = templates;
  if (disabled()) return;
  await Promise.all(
    (['male', 'female'] as const).map(async (sex) => {
      let scene: THREE.Object3D;
      try {
        scene = (await loader.loadAsync(`${baseUrl}models/garments/${sex}.glb`)).scene;
      } catch {
        return;
      }
      scene.traverse((o) => {
        const m = /^([a-z_]+)_lod([0-2])$/.exec(o.name);
        const mesh = o as THREE.Mesh;
        if (!m || !mesh.isMesh || !(BAKED_IDS as readonly string[]).includes(m[1])) return;
        meshes.set(key(sex, m[1] as BakedId, Number(m[2])), readMesh(mesh.geometry));
      });
    }),
  );
  loaded = true;
  // Bind everything now, a garment at a time between frames (10 to 35 ms each at LOD 0, half a second all told):
  // done on first use instead, the first toga in view would stall a frame.
  if (rulesOf)
    for (const k of [...meshes.keys()]) {
      const [sex, id, lod] = k.split(':');
      boundGarment(sex as Sex, id as BakedId, Number(lod), rulesOf(sex as Sex, id as BakedId));
      await new Promise((r) => setTimeout(r, 0));
    }
}

function readMesh(g: THREE.BufferGeometry): BakedMesh {
  const n = g.getAttribute('position').count;
  const uv0 = g.getAttribute('uv');
  const uv1 = g.getAttribute('uv1');
  const uv2 = g.getAttribute('uv2');
  const pattern = new Float32Array(n * 2);
  const border = new Float32Array(n);
  const ao = new Float32Array(n);
  const part = new Uint8Array(n);
  const rim = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    pattern[i * 2] = uv0 ? uv0.getX(i) : 0;
    pattern[i * 2 + 1] = uv0 ? 1 - uv0.getY(i) : 0;
    border[i] = uv1 ? uv1.getX(i) : 9;
    ao[i] = uv1 ? Math.min(1, Math.max(0, 1 - uv1.getY(i))) : 1;
    part[i] = uv2 ? Math.round(uv2.getX(i)) : 0;
    rim[i] = uv2 && 1 - uv2.getY(i) > 0.5 ? 1 : 0;
  }
  const idx = g.index!.array;
  return {
    position: Float32Array.from(g.getAttribute('position').array as ArrayLike<number>),
    normal: Float32Array.from(g.getAttribute('normal').array as ArrayLike<number>),
    index: n > 65535 ? Uint32Array.from(idx as ArrayLike<number>) : Uint16Array.from(idx as ArrayLike<number>),
    pattern,
    border,
    ao,
    part,
    rim,
  };
}

export function bakedLoaded(): boolean {
  return loaded;
}

export function hasBaked(sex: Sex, id: BakedId, lod: number): boolean {
  return meshes.has(key(sex, id, lod)) && !!templateOf?.(sex, lod);
}

/** For tests and tools: register a garment mesh and the template source directly. */
export function registerBaked(sex: Sex, id: BakedId, lod: number, mesh: BakedMesh, templates?: TemplateSource) {
  meshes.set(key(sex, id, lod), mesh);
  if (templates) templateOf = templates;
  loaded = true;
}

// ------------------------------------------------------------------------------------------------ binding cache

export interface BoundGarment {
  id: BakedId;
  mesh: BakedMesh;
  binding: Binding;
  skinIndex: Uint8Array;
  skinWeight: Float32Array;
  /** Reference body vertices this garment covers (per body vertex of the LOD). */
  hide: Uint8Array;
  /** The reference body's triangle index (the morphed body shares it). */
  bodyIndex: ArrayLike<number>;
  triangles: number;
}

export interface GarmentRules {
  bind?: BindOptions;
  weights: (body: BodyArrays, mesh: BakedMesh) => WeightPolicy;
  cover: (body: BodyArrays) => Omit<CoverOptions, 'eligible'> & { eligible: (v: number) => boolean };
}

const bound = new Map<string, BoundGarment>();
const grids = new Map<string, TriGrid>();

/** The garment bound to its reference body (computed on first use, then shared by every person). */
export function boundGarment(sex: Sex, id: BakedId, lod: number, rules: GarmentRules): BoundGarment | null {
  const k = key(sex, id, lod);
  let b = bound.get(k);
  if (b) return b;
  const mesh = meshes.get(k);
  const tpl = templateOf?.(sex, lod);
  if (!mesh || !tpl) return null;
  const gk = `${sex}:${lod}`;
  let grid = grids.get(gk);
  if (!grid) {
    grid = new TriGrid(tpl.body.position, tpl.index, 0.035);
    grids.set(gk, grid);
  }
  const binding = bindGarment({ position: mesh.position, normal: mesh.normal, index: mesh.index }, { position: tpl.body.position, normal: tpl.body.normal, index: tpl.index }, grid, rules.bind);
  const w = transferWeights(binding, tpl.body, tpl.index, 25, rules.weights(tpl.body, mesh));
  const cover = rules.cover(tpl.body);
  const gGrid = new TriGrid(mesh.position, mesh.index, 0.04);
  const hide = coverMask({ position: tpl.body.position, normal: tpl.body.normal, index: tpl.index }, gGrid, cover);
  b = { id, mesh, binding, skinIndex: w.skinIndex, skinWeight: w.skinWeight, hide, bodyIndex: tpl.index, triangles: mesh.index.length / 3 };
  bound.set(k, b);
  return b;
}

// ------------------------------------------------------------------------------------------------ layers

const covered = new Map<string, Uint8Array>();

/**
 * Vertices of a garment (or of its inner parts) lying well under another layer: a ray out along the vertex normal
 * and four tilted ones all meet the outer cloth within 6 cm. Their triangles are dropped from the inner layer: they
 * cannot be seen, and decimating the two layers apart lets a chord of the outer cloth dip under a fold of the inner
 * one (a patch of the toga's wrap showed through its mantle). `outer` lists other garments worn over this one;
 * `outerParts` instead takes this garment's own parts at or above that id (the toga's mantle over its wrap).
 */
export function coveredVertices(sex: Sex, id: BakedId, lod: number, outer: BakedId[], outerParts?: number): Uint8Array | null {
  const k = `${key(sex, id, lod)}|${outer.join(',')}|${outerParts ?? ''}`;
  let c = covered.get(k);
  if (c) return c;
  const inner = meshes.get(key(sex, id, lod));
  if (!inner) return null;
  const pos: number[] = [];
  const idx: number[] = [];
  const add = (m: BakedMesh, keepTri: (t: number) => boolean) => {
    const base = pos.length / 3;
    for (let i = 0; i < m.position.length; i++) pos.push(m.position[i]);
    for (let t = 0; t < m.index.length / 3; t++) if (keepTri(t)) idx.push(base + m.index[t * 3], base + m.index[t * 3 + 1], base + m.index[t * 3 + 2]);
  };
  if (outerParts !== undefined) add(inner, (t) => inner.part[inner.index[t * 3]] >= outerParts);
  for (const o of outer) {
    const m = meshes.get(key(sex, o, lod));
    if (m) add(m, () => true);
  }
  if (!idx.length) return null;
  const grid = new TriGrid(new Float32Array(pos), idx, 0.04);
  c = coverMask({ position: inner.position, normal: inner.normal, index: inner.index }, grid, {
    maxDist: 0.06,
    tilt: 0.5,
    eligible: (v) => !inner.rim[v] && (outerParts === undefined || inner.part[v] < outerParts),
  });
  covered.set(k, c);
  return c;
}
