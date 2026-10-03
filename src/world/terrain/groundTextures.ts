/**
 * Ground texture arrays for the terrain splat shader: the photo sets of the material library
 * (public/textures/<set>/{color,normal,arm}.jpg) re-packed into two `DataArrayTexture`s, so the
 * shader samples any of the nine layers through two samplers instead of 27:
 *
 *   albedo  (sRGB)   rgb = albedo, a = height proxy (for height-based blending)
 *   surface (linear) r,g = tangent-space normal x,y   b = roughness   a = ambient occlusion
 *
 * Until the photos arrive (and in Node) `flatGroundTextures` gives 1×1 layers in the palette
 * colours, so the terrain renders correctly from the first frame. Per-layer tints normalise each
 * photo's average albedo to MATERIAL_BASE, as the material library does for meshes.
 */
import * as THREE from 'three';
import { MATERIAL_BASE, type MaterialId } from '../../gfx/materialIds';
import { MATERIAL_RECIPES, TEXTURE_STATS, roughnessFactor, tintFor } from '../../gfx/textures/catalog';

export interface GroundTextures {
  albedo: THREE.DataArrayTexture;
  surface: THREE.DataArrayTexture;
  /** Linear RGB multiplier per layer. */
  tints: THREE.Vector3[];
  /** Roughness multiplier per layer (applied to the map's value). */
  roughness: number[];
  /** True once the photo sets are in. */
  textured: boolean;
}

const hasDom = typeof document !== 'undefined' && typeof Image !== 'undefined';

/** Palette overrides (sRGB) for the terrain: May in Rome, green-gold rather than golf-course. */
export const GROUND_PALETTE: Partial<Record<MaterialId, number>> = {
  grass: 0x6f7944,
  dry_grass: 0xa49a5f,
  dirt: 0x8b7a60,
  rock: 0x9d8b6c, // cappellaccio / tufa cliffs: warm grey-brown
  sand: 0xa89877,
  mud: 0x6a5c49,
  gravel: 0xa09885,
};

function targetLinear(id: MaterialId): [number, number, number] {
  const c = new THREE.Color(GROUND_PALETTE[id] ?? MATERIAL_BASE[id].color);
  return [c.r, c.g, c.b];
}

function arrayTexture(data: Uint8Array, size: number, layers: number, srgb: boolean, mips: boolean): THREE.DataArrayTexture {
  const t = new THREE.DataArrayTexture(data, size, size, layers);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.generateMipmaps = mips;
  t.anisotropy = mips ? 8 : 1;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** 1×1 layers in the palette colours (flat normal, base roughness). */
export function flatGroundTextures(layers: readonly MaterialId[]): GroundTextures {
  const n = layers.length;
  const a = new Uint8Array(n * 4);
  const s = new Uint8Array(n * 4);
  const c = new THREE.Color();
  layers.forEach((id, i) => {
    c.set(GROUND_PALETTE[id] ?? MATERIAL_BASE[id].color);
    const srgb = c.clone().convertLinearToSRGB();
    a.set([Math.round(srgb.r * 255), Math.round(srgb.g * 255), Math.round(srgb.b * 255), 128], i * 4);
    s.set([128, 128, Math.round(MATERIAL_BASE[id].roughness * 255), 255], i * 4);
  });
  return {
    albedo: arrayTexture(a, 1, n, true, false),
    surface: arrayTexture(s, 1, n, false, false),
    tints: layers.map(() => new THREE.Vector3(1, 1, 1)),
    roughness: layers.map(() => 1),
    textured: false,
  };
}

function textureUrl(set: string, file: string): string {
  const baseUrl = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return `${baseUrl}textures/${set}/${file}`;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${url}`));
    img.src = url;
  });
}

/** Draw an image at size×size and return its pixels with row 0 at the BOTTOM (three's flipY). */
function pixels(img: HTMLImageElement | null, size: number, ctx: CanvasRenderingContext2D): Uint8ClampedArray | null {
  if (!img) return null;
  ctx.setTransform(1, 0, 0, -1, 0, size);
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(img, 0, 0, size, size);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return ctx.getImageData(0, 0, size, size).data;
}

/**
 * Load the photo sets for `layers` and pack them. Resolves to null without a DOM. A layer whose
 * set fails to load falls back to its flat colour (other layers stay textured).
 */
export async function loadGroundTextures(layers: readonly MaterialId[], opts: { albedoSize?: number; surfaceSize?: number } = {}): Promise<GroundTextures | null> {
  if (!hasDom) return null;
  const A = opts.albedoSize ?? 1024;
  const Sz = opts.surfaceSize ?? 512;
  const n = layers.length;
  const sets = layers.map((id) => MATERIAL_RECIPES[id]?.set ?? null);
  const imgs = await Promise.all(
    sets.map((set) =>
      set
        ? Promise.all(['color.jpg', 'normal.jpg', 'arm.jpg'].map((f) => loadImage(textureUrl(set, f)).catch(() => null)))
        : Promise.resolve([null, null, null]),
    ),
  );
  const canvasA = document.createElement('canvas');
  canvasA.width = canvasA.height = A;
  const ctxA = canvasA.getContext('2d', { willReadFrequently: true })!;
  const canvasS = document.createElement('canvas');
  canvasS.width = canvasS.height = Sz;
  const ctxS = canvasS.getContext('2d', { willReadFrequently: true })!;
  const albedo = new Uint8Array(A * A * 4 * n);
  const surface = new Uint8Array(Sz * Sz * 4 * n);
  const tints: THREE.Vector3[] = [];
  const rough: number[] = [];
  const flatColor = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const id = layers[i];
    const [color, normal, arm] = imgs[i];
    const set = sets[i];
    const stats = set ? TEXTURE_STATS[set] : undefined;
    const pa = pixels(color, A, ctxA);
    const oa = i * A * A * 4;
    if (pa && stats) {
      // Height proxy from the local luminance: stones, tufts and clods stand out; gaps are low.
      let sum = 0, sum2 = 0;
      const N = A * A;
      const lum = new Float32Array(N);
      for (let k = 0; k < N; k++) {
        const l = pa[k * 4] * 0.3 + pa[k * 4 + 1] * 0.59 + pa[k * 4 + 2] * 0.11;
        lum[k] = l;
        sum += l;
        sum2 += l * l;
      }
      const mean = sum / N;
      const std = Math.max(4, Math.sqrt(Math.max(0, sum2 / N - mean * mean)));
      for (let k = 0; k < N; k++) {
        const o = oa + k * 4;
        albedo[o] = pa[k * 4];
        albedo[o + 1] = pa[k * 4 + 1];
        albedo[o + 2] = pa[k * 4 + 2];
        albedo[o + 3] = Math.max(0, Math.min(255, Math.round(128 + ((lum[k] - mean) / (2.2 * std)) * 127)));
      }
      const t = tintFor(stats.albedo, targetLinear(id));
      tints.push(new THREE.Vector3(t[0], t[1], t[2]));
      rough.push(roughnessFactor(MATERIAL_RECIPES[id].roughness ?? MATERIAL_BASE[id].roughness, stats.roughness));
    } else {
      flatColor.set(GROUND_PALETTE[id] ?? MATERIAL_BASE[id].color).convertLinearToSRGB();
      for (let k = 0; k < A * A; k++) albedo.set([flatColor.r * 255, flatColor.g * 255, flatColor.b * 255, 128], oa + k * 4);
      tints.push(new THREE.Vector3(1, 1, 1));
      rough.push(1);
    }
    const pn = pixels(normal, Sz, ctxS);
    const pr = pixels(arm, Sz, ctxS);
    const os = i * Sz * Sz * 4;
    const baseRough = Math.round(MATERIAL_BASE[id].roughness * 255);
    for (let k = 0; k < Sz * Sz; k++) {
      const o = os + k * 4;
      surface[o] = pn ? pn[k * 4] : 128;
      surface[o + 1] = pn ? pn[k * 4 + 1] : 128;
      surface[o + 2] = pr ? pr[k * 4 + 1] : baseRough;
      surface[o + 3] = pr ? pr[k * 4] : 255;
    }
  }
  return {
    albedo: arrayTexture(albedo, A, n, true, true),
    surface: arrayTexture(surface, Sz, n, false, true),
    tints,
    roughness: rough,
    textured: true,
  };
}
