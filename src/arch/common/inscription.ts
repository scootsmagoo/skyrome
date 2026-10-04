/**
 * Inscriptions and painted signs: Latin text rendered to a canvas and turned into a textured
 * panel. Three looks:
 *  - 'carved'  V-cut letters in stone, picked out in red paint (rubrication) — honorific arches,
 *              tombs, temple friezes.
 *  - 'bronze'  raised gilded-bronze letters (litterae aureae) on marble.
 *  - 'painted' dipinti: red/black letters brushed on whitewashed plaster (shop signs, election
 *              notices, graffiti boards).
 *
 * Letters use Cinzel (SIL OFL, after Roman inscriptional capitals), self-hosted under
 * public/textures/fonts. Panels drawn before the font has loaded are redrawn once it arrives.
 * Text goes through `latinize()`: capitals, U→V, J→I, word gaps → interpuncts.
 */
import * as THREE from 'three';
import type { MeshBuilder } from '../../gfx/MeshBuilder';
import type { MaterialId } from '../../gfx/materialIds';
import { heightToNormal } from '../../gfx/textures/noise';

export type InscriptionStyle = 'carved' | 'bronze' | 'painted';

export interface InscriptionSpec {
  lines: string[];
  /** Panel size in metres (sets the texture aspect). */
  width: number;
  height: number;
  style?: InscriptionStyle;
  /** Ground colour (CSS). Defaults: marble for carved/bronze, whitewash for painted. */
  ground?: string;
  /** Letter colour (CSS). Defaults: rubrication red, gold, or dipinto red. */
  ink?: string;
  /** Replace word gaps with interpuncts (·). Default true except for painted signs. */
  interpunct?: boolean;
  /** Relative letter heights per line (default: first line 1, the rest 0.82). */
  sizes?: number[];
  /** Horizontal squeeze of letters (rustic capitals on signs ≈ 0.8). */
  condense?: number;
  /** Texture resolution (px per metre, default 220, max side 2048). */
  pxPerMeter?: number;
  /** Draw a thin moulded border inside the panel edge. */
  border?: boolean;
  /**
   * Monumental inscriptions (arch attics, the column's pedestal) get their own full-resolution
   * material. Everything else — labels, shop signs, notices — is packed into shared atlas pages
   * per style: one material (one draw call per building) however many signs there are.
   */
  monumental?: boolean;
}

/** Roman orthography: upper case, U→V, J→I, optional interpuncts between words. */
export function latinize(text: string, interpunct = true): string {
  let s = text.toUpperCase().replace(/U/g, 'V').replace(/J/g, 'I');
  if (interpunct) s = s.trim().replace(/\s+/g, ' · ');
  return s;
}

export interface LineLayout {
  /** Letter height in panel fractions (of the panel height). */
  size: number;
  /** Baseline position from the top, in panel fractions. */
  baseline: number;
}

/**
 * Vertical layout: letter heights proportional to `sizes`, line gap 0.45 × letter height,
 * the block centred with margins. Pure (tested).
 */
export function layoutLines(n: number, sizes?: number[], margin = 0.12): LineLayout[] {
  const rel = Array.from({ length: n }, (_, i) => sizes?.[i] ?? (i === 0 ? 1 : 0.82));
  const gap = 0.45;
  const totalRel = rel.reduce((a, r) => a + r, 0) + gap * rel.slice(1).reduce((a, r) => a + r, 0);
  const scale = (1 - 2 * margin) / totalRel;
  const out: LineLayout[] = [];
  let y = margin;
  rel.forEach((r, i) => {
    if (i > 0) y += gap * r * scale;
    y += r * scale;
    out.push({ size: r * scale, baseline: y });
  });
  return out;
}

// ---------------------------------------------------------------- font loading

const FONT = 'Cinzel';
let fontState: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
let fontPromise: Promise<void> | null = null;
const redraw = new Set<() => void>();

function fontUrl() {
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return `${base}textures/fonts/Cinzel-latin.woff2`;
}

/** Start loading the inscription font (idempotent). Resolves when ready (or failed). */
export function loadInscriptionFont(): Promise<void> {
  if (fontPromise) return fontPromise;
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') {
    fontState = 'failed';
    return (fontPromise = Promise.resolve());
  }
  fontState = 'loading';
  const face = new FontFace(FONT, `url(${fontUrl()})`, { weight: '400 900' });
  fontPromise = face
    .load()
    .then((f) => {
      (document.fonts as unknown as { add(f: FontFace): void }).add(f);
      fontState = 'ready';
      for (const fn of redraw) fn();
      redraw.clear();
    })
    .catch((err) => {
      fontState = 'failed';
      console.warn('[inscription] font failed to load; using a fallback serif', err);
    });
  return fontPromise;
}

function fontFamily() {
  return fontState === 'ready' ? `${FONT}, 'Times New Roman', serif` : `'Times New Roman', Times, serif`;
}

// ---------------------------------------------------------------- rendering

interface Rendered {
  w: number;
  h: number;
  color: Uint8ClampedArray;
  normal: Uint8ClampedArray;
  arm: Uint8ClampedArray;
}

/** Copy canvas RGBA (row 0 = top) into a rows-up array (row 0 = v 0) for DataTexture. */
function flipRows(src: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  const row = w * 4;
  for (let y = 0; y < h; y++) out.set(src.subarray((h - 1 - y) * row, (h - y) * row), y * row);
  return out;
}

function drawText(ctx: CanvasRenderingContext2D, spec: InscriptionSpec, w: number, h: number, fill: string, blur = 0) {
  const style = spec.style ?? 'carved';
  const interp = spec.interpunct ?? style !== 'painted';
  const layout = layoutLines(spec.lines.length, spec.sizes, spec.border ? 0.16 : 0.12);
  const condense = spec.condense ?? (style === 'painted' ? 0.82 : 1);
  ctx.fillStyle = fill;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  if (blur) ctx.filter = `blur(${blur}px)`;
  spec.lines.forEach((line, i) => {
    const text = latinize(line, interp);
    const L = layout[i];
    let px = L.size * h * 1.38; // cap height ≈ 0.72 em
    ctx.font = `${style === 'bronze' ? 700 : 600} ${px}px ${fontFamily()}`;
    const spacing = px * 0.06;
    (ctx as unknown as { letterSpacing?: string }).letterSpacing = `${spacing}px`;
    const maxW = w * (spec.border ? 0.86 : 0.92);
    let tw = ctx.measureText(text).width * condense;
    if (tw > maxW) {
      px *= maxW / tw;
      ctx.font = `${style === 'bronze' ? 700 : 600} ${px}px ${fontFamily()}`;
      (ctx as unknown as { letterSpacing?: string }).letterSpacing = `${px * 0.06}px`;
      tw = maxW;
    }
    ctx.save();
    ctx.translate(w / 2, L.baseline * h);
    ctx.scale(condense, 1);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  });
  ctx.filter = 'none';
}

/** Texture size for a panel at `ppm` pixels per metre, capped at `max` px on the longer side. */
export function panelPixels(spec: InscriptionSpec, ppm: number, max: number): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(spec.width * ppm, spec.height * ppm));
  return { w: Math.max(16, Math.round(spec.width * ppm * scale)), h: Math.max(16, Math.round(spec.height * ppm * scale)) };
}

let sharedCanvas: HTMLCanvasElement | null = null;

function render(spec: InscriptionSpec, size = panelPixels(spec, spec.pxPerMeter ?? 220, 2048)): Rendered {
  const { w, h } = size;
  const style = spec.style ?? 'carved';
  const canvas = (sharedCanvas ??= document.createElement('canvas'));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  // Letter mask (white on black), softened for V-cut bevels.
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  drawText(ctx, spec, w, h, '#fff', style === 'carved' ? Math.max(0.6, h / 300) : 0.4);
  const mask = ctx.getImageData(0, 0, w, h).data;
  // Sharp mask for the ink.
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  drawText(ctx, spec, w, h, '#fff', 0);
  const sharp = ctx.getImageData(0, 0, w, h).data;

  const ground = new THREE.Color(spec.ground ?? (style === 'painted' ? '#e8e0cc' : '#ebe6db'));
  const inkHex = spec.ink ?? (style === 'carved' ? '#8c2a1c' : style === 'bronze' ? '#e8b85a' : '#a32418');
  const ink = new THREE.Color(inkHex);
  // THREE.Color stores linear; convert back to sRGB bytes.
  const toSrgb = (c: THREE.Color) => {
    const s = c.clone().convertLinearToSRGB();
    return [s.r * 255, s.g * 255, s.b * 255];
  };
  const G = toSrgb(ground);
  const I = toSrgb(ink);
  const color = new Uint8ClampedArray(w * h * 4);
  const arm = new Uint8ClampedArray(w * h * 4);
  const height = new Float32Array(w * h);
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < w * h; i++) {
    const m = mask[i * 4] / 255;
    const sm = sharp[i * 4] / 255;
    const n = (rnd() - 0.5) * 0.05;
    const j = i * 4;
    let rgb: number[];
    let rough: number;
    let metal = 0;
    if (style === 'carved') {
      // Recessed letters: darker in the groove, rubricated.
      const t = sm * 0.85;
      rgb = [G[0] + (I[0] - G[0]) * t, G[1] + (I[1] - G[1]) * t, G[2] + (I[2] - G[2]) * t].map((c) => c * (1 - 0.12 * m + n));
      rough = 0.5 + 0.25 * sm;
      height[i] = -m;
    } else if (style === 'bronze') {
      rgb = [G[0] + (I[0] - G[0]) * sm, G[1] + (I[1] - G[1]) * sm, G[2] + (I[2] - G[2]) * sm].map((c) => c * (1 + n));
      rough = 0.5 - 0.22 * sm;
      metal = sm;
      height[i] = m;
    } else {
      const t = sm * (0.85 + rnd() * 0.15);
      rgb = [G[0] + (I[0] - G[0]) * t, G[1] + (I[1] - G[1]) * t, G[2] + (I[2] - G[2]) * t].map((c) => c * (1 + n * 1.6));
      rough = 0.85;
      height[i] = n * 0.5;
    }
    color[j] = rgb[0];
    color[j + 1] = rgb[1];
    color[j + 2] = rgb[2];
    color[j + 3] = 255;
    arm[j] = 255 * (style === 'carved' ? 1 - 0.35 * m : 1);
    arm[j + 1] = rough * 255;
    arm[j + 2] = metal * 255;
    arm[j + 3] = 255;
  }
  if (spec.border) {
    // Thin incised border (a simple frame line) 6% in from the edge.
    const bx = Math.round(w * 0.04);
    const by = Math.round(h * 0.07);
    const lw = Math.max(2, Math.round(h / 120));
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const onX = (Math.abs(x - bx) < lw || Math.abs(x - (w - 1 - bx)) < lw) && y >= by && y <= h - 1 - by;
        const onY = (Math.abs(y - by) < lw || Math.abs(y - (h - 1 - by)) < lw) && x >= bx && x <= w - 1 - bx;
        if (onX || onY) {
          const i = y * w + x;
          height[i] = Math.min(height[i], -0.8);
          color[i * 4] *= 0.8;
          color[i * 4 + 1] *= 0.8;
          color[i * 4 + 2] *= 0.8;
        }
      }
  }
  // Canvas rows run top-down; DataTexture rows run up the texture.
  const flipH = new Float32Array(w * h);
  for (let y = 0; y < h; y++) flipH.set(height.subarray((h - 1 - y) * w, (h - y) * w), y * w);
  return {
    w,
    h,
    color: flipRows(color, w, h),
    arm: flipRows(arm, w, h),
    normal: heightToNormal(flipH, w, h, style === 'painted' ? 0.5 : 2.2),
  };
}

function dataTex(data: Uint8ClampedArray, w: number, h: number, srgb: boolean) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

const materials = new Map<string, THREE.MeshStandardMaterial>();

/** A unique full-resolution material for one (monumental) inscription. Cached by spec. */
export function inscriptionMaterial(spec: InscriptionSpec): THREE.MeshStandardMaterial {
  const key = JSON.stringify(spec);
  let mat = materials.get(key);
  if (mat) return mat;
  const style = spec.style ?? 'carved';
  mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: style === 'bronze' ? 1 : 0 });
  mat.name = `inscription:${spec.lines[0]?.slice(0, 24) ?? ''}`;
  if (typeof document === 'undefined') {
    materials.set(key, mat);
    return mat;
  }
  const apply = () => {
    const r = render(spec);
    const old = [mat!.map, mat!.normalMap, mat!.roughnessMap];
    mat!.map = dataTex(r.color, r.w, r.h, true);
    mat!.normalMap = dataTex(r.normal, r.w, r.h, false);
    const arm = dataTex(r.arm, r.w, r.h, false);
    mat!.roughnessMap = arm;
    mat!.aoMap = arm;
    if (style === 'bronze') mat!.metalnessMap = arm;
    mat!.needsUpdate = true;
    for (const t of old) t?.dispose();
  };
  apply();
  if (fontState !== 'ready') {
    redraw.add(apply);
    loadInscriptionFont();
  }
  materials.set(key, mat);
  return mat;
}

// ---------------------------------------------------------------- shared atlas pages

/** Atlas page size (px). 1024² holds ~20 shop signs at the default densities. */
export const ATLAS_PAGE = 1024;
const PAD = 4;
/** Pixel density per style in the atlas (signs are read at a few metres, not inches). */
const ATLAS_PPM: Record<InscriptionStyle, number> = { carved: 200, bronze: 200, painted: 150 };

/** Shelf packer state for one page. Pure. */
export interface Shelves {
  size: number;
  x: number;
  y: number;
  rowH: number;
}

/** Place a w × h rectangle (padding included by the caller) on a page, or null when it is full. Pure. */
export function shelfPack(st: Shelves, w: number, h: number): { x: number; y: number } | null {
  if (w > st.size || h > st.size) return null;
  if (st.x + w > st.size) {
    st.y += st.rowH;
    st.x = 0;
    st.rowH = 0;
  }
  if (st.y + h > st.size) return null;
  const at = { x: st.x, y: st.y };
  st.x += w;
  st.rowH = Math.max(st.rowH, h);
  return at;
}

interface AtlasEntry {
  spec: InscriptionSpec;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface AtlasPage {
  style: InscriptionStyle;
  shelves: Shelves;
  entries: AtlasEntry[];
  material: THREE.MeshStandardMaterial;
  color?: Uint8ClampedArray;
  normal?: Uint8ClampedArray;
  arm?: Uint8ClampedArray;
  textures: THREE.DataTexture[];
}

const pages: AtlasPage[] = [];
const atlasCache = new Map<string, { page: AtlasPage; entry: AtlasEntry }>();

function newPage(style: InscriptionStyle): AtlasPage {
  const S = ATLAS_PAGE;
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: style === 'painted' ? 0.85 : 1, metalness: style === 'bronze' ? 1 : 0 });
  material.name = `inscriptions:${style}#${pages.filter((p) => p.style === style).length}`;
  const page: AtlasPage = { style, shelves: { size: S, x: 0, y: 0, rowH: 0 }, entries: [], material, textures: [] };
  if (typeof document !== 'undefined') {
    // Painted dipinti are flat and evenly matte: colour only. Carved and bronze need relief and
    // a roughness/metal map.
    page.color = new Uint8ClampedArray(S * S * 4);
    const tex = (d: Uint8ClampedArray, srgb: boolean) => {
      const t = dataTex(d, S, S, srgb);
      page.textures.push(t);
      return t;
    };
    material.map = tex(page.color, true);
    if (style !== 'painted') {
      page.normal = new Uint8ClampedArray(S * S * 4);
      page.arm = new Uint8ClampedArray(S * S * 4);
      material.normalMap = tex(page.normal, false);
      const arm = tex(page.arm, false);
      material.roughnessMap = arm;
      material.aoMap = arm;
      if (style === 'bronze') material.metalnessMap = arm;
    }
  }
  pages.push(page);
  return page;
}

/** Copy a rendered panel into its page region, smearing its edge pixels into the padding. */
function blit(page: AtlasPage, e: AtlasEntry, r: Rendered) {
  const S = ATLAS_PAGE;
  const copy = (dst: Uint8ClampedArray | undefined, src: Uint8ClampedArray) => {
    if (!dst) return;
    for (let y = -PAD; y < r.h + PAD; y++) {
      const sy = Math.min(r.h - 1, Math.max(0, y));
      const ty = e.y + PAD + y;
      if (ty < 0 || ty >= S) continue;
      for (let x = -PAD; x < r.w + PAD; x++) {
        const sx = Math.min(r.w - 1, Math.max(0, x));
        const tx = e.x + PAD + x;
        if (tx < 0 || tx >= S) continue;
        const si = (sy * r.w + sx) * 4;
        const ti = (ty * S + tx) * 4;
        dst[ti] = src[si];
        dst[ti + 1] = src[si + 1];
        dst[ti + 2] = src[si + 2];
        dst[ti + 3] = src[si + 3];
      }
    }
  };
  copy(page.color, r.color);
  copy(page.normal, r.normal);
  copy(page.arm, r.arm);
  for (const t of page.textures) t.needsUpdate = true;
}

let atlasRedrawQueued = false;

/** The shared material and UV rectangle [u0, v0, u1, v1] for a (non-monumental) panel. */
export function atlasEntry(spec: InscriptionSpec): { material: THREE.MeshStandardMaterial; uv: [number, number, number, number] } {
  const style = spec.style ?? 'carved';
  const key = JSON.stringify(spec);
  let hit = atlasCache.get(key);
  if (!hit) {
    const { w, h } = panelPixels(spec, spec.pxPerMeter ?? ATLAS_PPM[style], ATLAS_PAGE - 2 * PAD);
    let page = pages.find((p) => p.style === style && p.shelves.size > 0 && shelfFits(p.shelves, w + 2 * PAD, h + 2 * PAD));
    page ??= newPage(style);
    const at = shelfPack(page.shelves, w + 2 * PAD, h + 2 * PAD)!;
    const entry: AtlasEntry = { spec, x: at.x, y: at.y, w, h };
    page.entries.push(entry);
    hit = { page, entry };
    atlasCache.set(key, hit);
    if (typeof document !== 'undefined') {
      blit(page, entry, render(spec, { w, h }));
      if (fontState !== 'ready' && !atlasRedrawQueued) {
        // Redraw every atlas entry once the font arrives.
        atlasRedrawQueued = true;
        redraw.add(() => {
          for (const p of pages) for (const e of p.entries) blit(p, e, render(e.spec, { w: e.w, h: e.h }));
          atlasRedrawQueued = false;
        });
        loadInscriptionFont();
      }
    }
  }
  const { entry } = hit;
  const S = ATLAS_PAGE;
  return { material: hit.page.material, uv: [(entry.x + PAD) / S, (entry.y + PAD) / S, (entry.x + PAD + entry.w) / S, (entry.y + PAD + entry.h) / S] };
}

function shelfFits(st: Shelves, w: number, h: number): boolean {
  return shelfPack({ ...st }, w, h) !== null;
}

/** Split a box into its −z face (front) and the other five faces. */
function boxFaces(w: number, h: number, d: number) {
  const box = new THREE.BoxGeometry(w, h, d);
  const groups = box.groups;
  const idx = box.index!;
  const pick = (want: (g: number) => boolean) => {
    const indices: number[] = [];
    groups.forEach((g, gi) => {
      if (!want(gi)) return;
      for (let i = g.start; i < g.start + g.count; i++) indices.push(idx.getX(i));
    });
    const geo = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) geo.setAttribute(name, box.getAttribute(name));
    geo.setIndex(indices);
    return geo.toNonIndexed();
  };
  return { front: pick((g) => g === 5), rest: pick((g) => g !== 5) };
}

/**
 * A stone (or plaster) panel carrying an inscription. Local frame: centred on the origin, front
 * face in the plane z = 0 facing −z, body extending to z = +depth.
 */
export function inscriptionPanel(b: MeshBuilder, spec: InscriptionSpec, at?: THREE.Matrix4, opts: { depth?: number; bodyMaterial?: MaterialId } = {}) {
  const depth = opts.depth ?? 0.12;
  const { front, rest } = boxFaces(spec.width, spec.height, depth);
  front.translate(0, 0, depth / 2);
  rest.translate(0, 0, depth / 2);
  if (spec.monumental) b.add(front, inscriptionMaterial(spec), at, { uv: 'keep' });
  else {
    // Remap the face's 0..1 UVs into the panel's rectangle on its atlas page.
    const { material, uv: [u0, v0, u1, v1] } = atlasEntry(spec);
    const uv = front.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + (u1 - u0) * uv.getX(i), v0 + (v1 - v0) * uv.getY(i));
    b.add(front, material, at, { uv: 'keep' });
  }
  b.add(rest, opts.bodyMaterial ?? ((spec.style ?? 'carved') === 'painted' ? 'plaster_white' : 'marble'), at);
}

/** A painted shop sign / notice (dipinto) on a thin whitewashed board. Shares atlas pages. */
export function paintedSign(b: MeshBuilder, lines: string[], width: number, height: number, at?: THREE.Matrix4, opts: { ink?: string; ground?: string } = {}) {
  inscriptionPanel(b, { lines, width, height, style: 'painted', ink: opts.ink, ground: opts.ground, interpunct: false, sizes: lines.map((_, i) => (i === 0 ? 1 : 0.7)) }, at, { depth: 0.04 });
}

/** Atlas pages in use (for stats and tests). */
export function inscriptionAtlasPages(): readonly { style: InscriptionStyle; entries: number; material: THREE.Material }[] {
  return pages.map((p) => ({ style: p.style, entries: p.entries.length, material: p.material }));
}
