/**
 * How each material id is textured: which photo set (public/textures/<set>/) or procedural
 * canvas generator it uses, how big one texture repeat is in the real world, and how much
 * large-scale variation the shader adds. Pure data — no DOM, safe to import in tests.
 */
import type { MaterialId } from '../materialIds';
import statsJson from './stats.gen.json';

/**
 * Geometry UVs are world-scale: `boxProjectUVs` (MeshBuilder's default `uvScale` of 2) gives one
 * UV unit per 2 m. Generators that write their own UVs ('keep') must use the same convention.
 */
export const UV_METERS = 2;

/** Photo texture sets downloaded by tools/fetch-textures.mjs. */
export type TextureSetId =
  | 'marble'
  | 'marble_veined'
  | 'tufa'
  | 'peperino'
  | 'basalt'
  | 'rock'
  | 'brick'
  | 'concrete'
  | 'plaster'
  | 'roof_tile'
  | 'wood'
  | 'wood_dark'
  | 'paving_basalt'
  | 'paving_travertine'
  | 'cobbles'
  | 'gravel'
  | 'dirt'
  | 'grass'
  | 'dry_grass'
  | 'sand'
  | 'mud'
  | 'bark';

/** Canvas generators in procedural.ts. */
export type ProceduralId = 'fabric' | 'mosaic' | 'stucco' | 'gilded' | 'bronze' | 'metal' | 'porphyry' | 'reticulatum' | 'travertine' | 'foliage';

export interface MaterialRecipe {
  set?: TextureSetId;
  proc?: ProceduralId;
  /** Real-world meters covered by one texture repeat: a number, or [u, v] for anisotropic tiling. */
  tile?: number | [number, number];
  /** Normal map strength (Three's normalScale). Default 1. */
  normal?: number;
  /** Amplitude of the world-space albedo variation that breaks up tiling (0 = off). */
  macro?: number;
  /** Blend a second, rotated sample of the albedo map by a noise mask (natural ground only). */
  detile?: boolean;
  /** Scale the tint so the texture's average albedo matches MATERIAL_BASE's color. Default true. */
  normalize?: boolean;
  /** Override the base roughness from MATERIAL_BASE. */
  roughness?: number;
  /** Strength of the ARM map's ambient occlusion. Default 1. */
  ao?: number;
  /** Albedo-map contrast around its mean (1 = as scanned). Photo sets only. */
  contrast?: number;
  /** Weathering on walls: street grime at the foot, rain streaks (0 = off; ~1 for plaster). */
  weather?: number;
}

export const MATERIAL_RECIPES: Record<MaterialId, MaterialRecipe> = {
  // stone
  // White marble's scanned veining is softened (contrast) so forms in shade read before the veins.
  marble: { set: 'marble', tile: 2.4, normal: 0.6, macro: 0.05, contrast: 0.5, weather: 0.35 },
  marble_veined: { set: 'marble_veined', tile: 2.4, normal: 0.6, macro: 0.05, contrast: 0.8, weather: 0.35 },
  marble_giallo: { set: 'marble', tile: 2.0, normal: 0.6, macro: 0.08, contrast: 0.6, weather: 0.35 },
  marble_pavonazzetto: { set: 'marble_veined', tile: 2.0, normal: 0.6, macro: 0.05, contrast: 0.9, weather: 0.35 },
  porphyry: { proc: 'porphyry', tile: 0.8, macro: 0.04 },
  // Procedural ashlar travertine (laminae, voids along the bedding, hairline joints), drawn for a
  // 2.4 × 1.2 m repeat: two 0.6 m courses, smooth as in AD 113 (the pockmarks are medieval).
  travertine: { proc: 'travertine', tile: [2.4, 1.2], normal: 0.4, macro: 0.09, weather: 0.7 },
  tufa: { set: 'tufa', tile: 2.0, macro: 0.1, weather: 0.6 },
  peperino: { set: 'peperino', tile: 1.6, macro: 0.08, weather: 0.6 },
  basalt: { set: 'basalt', tile: 2.0, macro: 0.08, weather: 0.4 },
  rock: { set: 'rock', tile: 3.5, macro: 0.12, detile: true },
  // masonry / plaster
  brick: { set: 'brick', tile: 1.1, macro: 0.08, weather: 0.6 },
  reticulatum: { proc: 'reticulatum', tile: 0.85, macro: 0.08, weather: 0.6 },
  concrete: { set: 'concrete', tile: 2.2, macro: 0.1, weather: 0.8 },
  plaster_white: { set: 'plaster', tile: 2.5, macro: 0.06, normal: 0.45, weather: 1 },
  plaster_cream: { set: 'plaster', tile: 2.5, macro: 0.07, normal: 0.45, weather: 1 },
  plaster_ochre: { set: 'plaster', tile: 2.5, macro: 0.08, normal: 0.45, weather: 1 },
  plaster_red: { set: 'plaster', tile: 2.5, macro: 0.08, normal: 0.45, weather: 0.9 },
  plaster_dark: { set: 'plaster', tile: 2.5, macro: 0.06, normal: 0.45, weather: 0.6 },
  stucco_painted: { proc: 'stucco', tile: [3.2, 3.2], macro: 0.04, normalize: false, weather: 0.8 },
  // roofs & metal
  roof_tile: { set: 'roof_tile', tile: 3.2, macro: 0.1 },
  gilded_bronze: { proc: 'gilded', tile: 1.2, normalize: false },
  bronze: { proc: 'bronze', tile: 1.2, normalize: false },
  iron: { proc: 'metal', tile: 1.0 },
  lead: { proc: 'metal', tile: 1.5 },
  terracotta: { set: 'plaster', tile: 1.5, normal: 0.5, macro: 0.06, roughness: 0.8 },
  // wood & fabric
  wood: { set: 'wood', tile: 1.8, macro: 0.08, weather: 0.4 },
  wood_dark: { set: 'wood_dark', tile: 2.0, macro: 0.06, weather: 0.3 },
  wood_painted: { set: 'wood', tile: 1.8, macro: 0.06, weather: 0.5 },
  fabric_white: { proc: 'fabric', tile: 0.6 },
  fabric_red: { proc: 'fabric', tile: 0.6 },
  fabric_purple: { proc: 'fabric', tile: 0.6 },
  fabric_ochre: { proc: 'fabric', tile: 0.6 },
  fabric_blue: { proc: 'fabric', tile: 0.6 },
  // ground
  paving_basalt: { set: 'paving_basalt', tile: 3.2, macro: 0.08 },
  paving_travertine: { set: 'paving_travertine', tile: 4.5, macro: 0.07 },
  cobbles: { set: 'cobbles', tile: 1.6, macro: 0.08 },
  gravel: { set: 'gravel', tile: 2.2, macro: 0.08, detile: true },
  dirt: { set: 'dirt', tile: 2.5, macro: 0.12, detile: true },
  grass: { set: 'grass', tile: 2.6, macro: 0.14, detile: true },
  dry_grass: { set: 'dry_grass', tile: 2.2, macro: 0.12, detile: true },
  sand: { set: 'sand', tile: 1.8, macro: 0.08, detile: true },
  mud: { set: 'mud', tile: 1.5, macro: 0.1, detile: true },
  // nature
  bark: { set: 'bark', tile: 1.4, macro: 0.06 },
  foliage_pine: { proc: 'foliage', tile: 1.2, macro: 0.12 },
  foliage_cypress: { proc: 'foliage', tile: 1.0, macro: 0.1 },
  foliage_broad: { proc: 'foliage', tile: 1.4, macro: 0.12 },
  foliage_olive: { proc: 'foliage', tile: 1.2, macro: 0.12 },
  // misc
  water: {},
  mosaic: { proc: 'mosaic', tile: 2.0, normalize: false, macro: 0.03 },
  black: {},
  interior: {},
  glow_fire: {},
};

export interface TextureStats {
  source: string;
  /** Average albedo in linear RGB. */
  albedo: number[];
  /** Average roughness (ARM green channel). */
  roughness: number;
}

export const TEXTURE_STATS = statsJson as Record<TextureSetId, TextureStats>;

/** Texture repeat (per UV unit) that makes a recipe appear at its real-world size. */
export function repeatFor(recipe: MaterialRecipe): [number, number] {
  const t = recipe.tile ?? UV_METERS;
  const [tu, tv] = typeof t === 'number' ? [t, t] : t;
  return [UV_METERS / tu, UV_METERS / tv];
}

/**
 * Per-channel multiplier (linear RGB) that maps a texture whose average albedo is `avg` onto the
 * target base colour `target` (also linear). Clamped so near-black channels can't explode.
 */
export function tintFor(avg: readonly number[], target: readonly number[], lo = 0.15, hi = 6): [number, number, number] {
  const f = (i: number) => Math.min(hi, Math.max(lo, target[i] / Math.max(1e-4, avg[i])));
  return [f(0), f(1), f(2)];
}

/** Base roughness scaled by the inverse of the roughness map's mean, so the average matches. */
export function roughnessFactor(baseRoughness: number, mapMean: number): number {
  return Math.min(3, baseRoughness / Math.max(0.05, mapMean));
}
