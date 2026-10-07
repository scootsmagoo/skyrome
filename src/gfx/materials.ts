/**
 * Shared material library. `getMaterial(id)` always returns the same MeshStandardMaterial for an
 * id, created synchronously:
 *
 * - Photo sets (CC0, public/textures/<set>/{color,normal,arm}.jpg) start loading immediately. The
 *   material shows its flat MATERIAL_BASE colour until all three maps of the set have arrived,
 *   then switches to the textured version in one go (one shader recompile, no black flash).
 *   Sets with a compressed version (stats `ktx2`) load public/textures/<set>/{color,normal,arm}.ktx2
 *   instead once `enableCompressedTextures(renderer)` has run: Basis ETC1S, transcoded to the GPU's
 *   own block format, so they stay compressed in video memory (2048² colour in about a quarter of
 *   what a 1024² JPEG takes once decoded). Any failure falls back to the JPEGs.
 * - Procedural sets (fabric, mosaic, painted stucco, gilded bronze, …) are generated on the spot.
 * - Every texture is tiled at real-world size (see textures/catalog.ts: MeshBuilder's box UVs are
 *   one unit per 2 m), and the tint is normalised so the texture's average albedo matches the
 *   palette colour in MATERIAL_BASE.
 * - A world-space macro-variation patch breaks up visible tiling on large surfaces.
 *
 * Await `whenTexturesLoaded()` during scene setup to avoid the flat-to-textured pop on screen.
 * Metals need an environment map: call `applyDefaultEnvironment(scene, renderer)` once.
 * In Node (unit tests) materials stay flat: there is no DOM to load images with.
 */
import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { releaseTextureAfterUpload } from './release';
import { MATERIAL_BASE, type MaterialId } from './materialIds';
import { MATERIAL_RECIPES, TEXTURE_STATS, repeatFor, roughnessFactor, tintFor, type MaterialRecipe, type TextureSetId } from './textures/catalog';
import { generateProcedural, type ProcImage } from './textures/procedural';
import { applyShaderPatch } from './textures/shaderPatch';

export { applyDefaultEnvironment } from './textures/environment';
export { UV_METERS, MATERIAL_RECIPES } from './textures/catalog';

const cache = new Map<MaterialId, THREE.Material>();
const pending = new Set<Promise<unknown>>();
const hasDom = typeof document !== 'undefined' && typeof Image !== 'undefined';
let anisotropy = 8;

export function getMaterial(id: MaterialId): THREE.Material {
  let m = cache.get(id);
  if (!m) {
    m = createMaterial(id);
    cache.set(id, m);
  }
  return m;
}

/** Replace the material registered for an id. Existing meshes keep the old instance unless they look it up again — so register BEFORE building the world. */
export function setMaterial(id: MaterialId, material: THREE.Material) {
  material.name = id;
  cache.set(id, material);
}

export function allMaterials(): ReadonlyMap<MaterialId, THREE.Material> {
  return cache;
}

/** Resolves once every texture requested so far has loaded (or failed). */
export async function whenTexturesLoaded(): Promise<void> {
  while (pending.size) await Promise.allSettled([...pending]);
}

/** Anisotropic filtering for textures created from now on (default 8; Three clamps to the GPU max). */
export function setTextureAnisotropy(value: number) {
  anisotropy = value;
}

// ---------------------------------------------------------------- creation

function createMaterial(id: MaterialId): THREE.Material {
  const base = MATERIAL_BASE[id];
  const recipe: MaterialRecipe = MATERIAL_RECIPES[id] ?? {};
  const m = new THREE.MeshStandardMaterial({
    color: base.color,
    roughness: recipe.roughness ?? base.roughness,
    metalness: base.metalness ?? 0,
    emissive: base.emissive ?? 0x000000,
    emissiveIntensity: base.emissive ? 1.5 : 0,
  });
  m.name = id;
  if (id === 'black') {
    m.envMapIntensity = 0;
    return m;
  }
  if (id === 'interior') {
    m.envMapIntensity = 0;
    lamplitRooms(m);
    return m;
  }
  if (!hasDom) return m;
  if (recipe.set) applyPhotoSet(m, id, recipe, recipe.set);
  else if (recipe.proc) applyProcedural(m, id, recipe);
  applyShaderPatch(m, { macro: recipe.macro, detile: recipe.detile, contrast: recipe.contrast, weather: recipe.weather, mean: recipe.set ? TEXTURE_STATS[recipe.set]?.albedo : undefined });
  return m;
}

/** 0 by day → 1 when the lamps are lit; the city sets it from the sky every frame. */
export const interiorLamp = { value: 0 };

/**
 * The rooms behind the windows: black by day; at night about one room in three glows with warm
 * lamplight (picked per ~3.5 m cell of the city and storey, brighter low down where the lamp
 * stands), so the streets look lived in after dark.
 */
function lamplitRooms(m: THREE.MeshStandardMaterial) {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uLamp = interiorLamp;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRoomW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
{
  vec4 rw = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
    rw = batchingMatrix * rw;
  #endif
  #ifdef USE_INSTANCING
    rw = instanceMatrix * rw;
  #endif
  vRoomW = ( modelMatrix * rw ).xyz;
}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRoomW;\nuniform float uLamp;\nfloat roomHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
if ( uLamp > 0.0 ) {
  vec3 cell = floor( vRoomW / vec3( 3.5, 3.0, 3.5 ) );
  float h = roomHash( cell );
  float lit = step( h, 0.3 );
  float fy = fract( vRoomW.y / 3.0 );
  float glow = mix( 1.0, 0.45, smoothstep( 0.1, 0.9, fy ) ) * ( 0.7 + 0.6 * fract( h * 13.7 ) );
  totalEmissiveRadiance += vec3( 1.0, 0.42, 0.12 ) * 0.42 * glow * lit * uLamp;
}`);
  };
  m.customProgramCacheKey = () => 'skyrome-interior-v1';
}

/** Linear-space target colour for an id. */
function targetLinear(id: MaterialId): [number, number, number] {
  const c = new THREE.Color(MATERIAL_BASE[id].color); // hex is sRGB → stored linear
  return [c.r, c.g, c.b];
}

function setRepeat(t: THREE.Texture, recipe: MaterialRecipe) {
  const [ru, rv] = repeatFor(recipe);
  t.repeat.set(ru, rv);
}

// ---------------------------------------------------------------- photo sets

interface SetTextures {
  color: THREE.Texture;
  normal: THREE.Texture;
  arm: THREE.Texture;
}

const setPromises = new Map<TextureSetId, Promise<SetTextures>>();
const loader = hasDom ? new THREE.TextureLoader() : null;
const baseUrl = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
let ktx2: KTX2Loader | null = null;
const ktx2Failed = new Set<TextureSetId>();
let ktx2Loaded = 0;

/**
 * Load the compressed (KTX2) photo sets from now on: the loader needs the renderer to know which
 * block formats this GPU takes. Call before the first material is created. `?ktx2=0` keeps JPEGs.
 */
export function enableCompressedTextures(renderer: THREE.WebGLRenderer) {
  if (ktx2 || !hasDom) return;
  if (new URLSearchParams(location.search).get('ktx2') === '0') return;
  ktx2 = new KTX2Loader().setTranscoderPath(`${baseUrl}basis/`).setWorkerLimit(2).detectSupport(renderer);
}

function textureUrl(set: TextureSetId, file: string): string {
  return `${baseUrl}textures/${set}/${file}`;
}

function loadKtx2Set(set: TextureSetId): Promise<SetTextures> {
  const load = (file: string) =>
    ktx2!.loadAsync(textureUrl(set, file)).then((t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = anisotropy;
      return t as THREE.Texture;
    });
  return Promise.all([load('color.ktx2'), load('normal.ktx2'), load('arm.ktx2')]).then(([color, normal, arm]) => {
    // The colour is encoded as sRGB, the data maps as linear (KTX2Loader reads it from the file).
    color.colorSpace = THREE.SRGBColorSpace;
    normal.colorSpace = arm.colorSpace = THREE.NoColorSpace;
    // Every set there is has loaded: no more transcoding, so the workers (and their wasm heaps) go.
    if (++ktx2Loaded === Object.values(TEXTURE_STATS).filter((st) => (st as { ktx2?: boolean }).ktx2).length) {
      ktx2?.dispose();
      ktx2 = null;
    }
    return { color, normal, arm };
  });
}

/**
 * Free a compressed texture's transcoded mip levels once the GPU has them. Clones share the level
 * objects, so whichever clone uploads first frees them for all (they share one GL texture too).
 */
function releaseMipsAfterUpload(t: THREE.Texture) {
  const c = t as THREE.CompressedTexture;
  if (!c.isCompressedTexture) return;
  c.onUpdate = () => {
    for (const m of c.mipmaps) (m as { data: unknown }).data = null;
  };
}

function loadSet(set: TextureSetId): Promise<SetTextures> {
  let p = setPromises.get(set);
  if (!p && ktx2 && !ktx2Failed.has(set) && (TEXTURE_STATS[set] as { ktx2?: boolean } | undefined)?.ktx2) {
    p = loadKtx2Set(set).catch((err) => {
      console.warn(`[materials] compressed textures for ${set} failed; using JPEGs`, err);
      setPromises.delete(set);
      ktx2Failed.add(set);
      return loadSet(set);
    });
    setPromises.set(set, p);
  }
  if (!p) {
    const load = (file: string, srgb: boolean) =>
      new Promise<THREE.Texture>((resolve, reject) => {
        loader!.load(
          textureUrl(set, file),
          (t) => {
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.anisotropy = anisotropy;
            if (srgb) t.colorSpace = THREE.SRGBColorSpace;
            resolve(t);
          },
          undefined,
          (err) => reject(err),
        );
      });
    p = Promise.all([load('color.jpg', true), load('normal.jpg', false), load('arm.jpg', false)]).then(([color, normal, arm]) => ({ color, normal, arm }));
    setPromises.set(set, p);
  }
  return p;
}

function applyPhotoSet(m: THREE.MeshStandardMaterial, id: MaterialId, recipe: MaterialRecipe, set: TextureSetId) {
  const stats = TEXTURE_STATS[set];
  const p = loadSet(set)
    .then((tx) => {
      const color = tx.color.clone();
      const normal = tx.normal.clone();
      const arm = tx.arm.clone();
      for (const t of [color, normal, arm]) {
        setRepeat(t, recipe);
        releaseMipsAfterUpload(t);
      }
      m.map = color;
      m.normalMap = normal;
      m.normalScale.setScalar(recipe.normal ?? 1);
      m.roughnessMap = arm;
      m.aoMap = arm;
      m.aoMapIntensity = recipe.ao ?? 1;
      if (stats) {
        if (recipe.normalize !== false) m.color.setRGB(...tintFor(stats.albedo, targetLinear(id)));
        m.roughness = roughnessFactor(recipe.roughness ?? MATERIAL_BASE[id].roughness, stats.roughness);
      }
      m.needsUpdate = true;
    })
    .catch((err) => console.warn(`[materials] textures for "${id}" (${set}) failed to load; using flat colour`, err))
    .finally(() => pending.delete(p));
  pending.add(p);
}

// ---------------------------------------------------------------- procedural sets

const procTextures = new Map<string, { color: THREE.DataTexture; normal?: THREE.DataTexture; arm?: THREE.DataTexture; img: ProcImage }>();

function dataTexture(data: Uint8ClampedArray, size: number, srgb: boolean): THREE.DataTexture {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = anisotropy;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function applyProcedural(m: THREE.MeshStandardMaterial, id: MaterialId, recipe: MaterialRecipe) {
  const key = recipe.proc!;
  let tx = procTextures.get(key);
  if (!tx) {
    const img = generateProcedural(key);
    tx = {
      img,
      color: dataTexture(img.color, img.size, true),
      normal: img.normal ? dataTexture(img.normal, img.size, false) : undefined,
      arm: img.arm ? dataTexture(img.arm, img.size, false) : undefined,
    };
    procTextures.set(key, tx);
  }
  // The pixels are needed once, for the upload: then only the GPU's copy is kept (gfx/release).
  const img = tx.img as { color?: Uint8ClampedArray | null; normal?: Uint8ClampedArray | null; arm?: Uint8ClampedArray | null };
  const color = tx.color.clone();
  releaseTextureAfterUpload(color, () => (img.color = null));
  setRepeat(color, recipe);
  m.map = color;
  if (tx.normal) {
    m.normalMap = tx.normal.clone();
    releaseTextureAfterUpload(m.normalMap, () => (img.normal = null));
    setRepeat(m.normalMap, recipe);
    m.normalScale.setScalar(recipe.normal ?? 1);
  }
  if (tx.arm) {
    const arm = tx.arm.clone();
    releaseTextureAfterUpload(arm, () => (img.arm = null));
    setRepeat(arm, recipe);
    m.roughnessMap = arm;
    m.aoMap = arm;
    m.aoMapIntensity = recipe.ao ?? 1;
    if ((MATERIAL_BASE[id].metalness ?? 0) > 0) m.metalnessMap = arm;
    m.roughness = roughnessFactor(recipe.roughness ?? MATERIAL_BASE[id].roughness, tx.img.roughness);
  }
  if (recipe.normalize !== false) m.color.setRGB(...tintFor(tx.img.albedo, targetLinear(id)));
  else m.color.setRGB(1, 1, 1);
}
