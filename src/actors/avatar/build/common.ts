/** Shared helpers for the character mesh builders: colors, the build context and math. */
import * as THREE from 'three';
import type { Appearance } from '../../appearance';
import { Rng, hashString } from '../../../core/Rng';
import type { Rig } from '../rig';
import { SkinBuilder, type Surf } from '../SkinBuilder';
import type { Outfit } from './outfit';

export type LOD = 'high' | 'low';

export interface Ctx {
  rig: Rig;
  app: Appearance;
  outfit: Outfit;
  lod: LOD;
  b: SkinBuilder;
  rng: Rng;
  /** Skin color (linear). */
  skin: THREE.Color;
  hair: THREE.Color;
  /** Resolution helpers: ring segments etc. */
  hi: boolean;
}

export function makeCtx(rig: Rig, app: Appearance, outfit: Outfit, lod: LOD): Ctx {
  return {
    rig,
    app,
    outfit,
    lod,
    b: new SkinBuilder(),
    rng: new Rng(hashString(JSON.stringify(app))),
    skin: srgb(app.skin),
    hair: srgb(app.hair.color),
    hi: lod === 'high',
  };
}

const colorCache = new Map<string, THREE.Color>();
/** sRGB hex string or number → linear THREE.Color (cached; do not mutate the result). */
export function srgb(hex: string | number): THREE.Color {
  const key = String(hex);
  let c = colorCache.get(key);
  if (!c) {
    c = new THREE.Color();
    if (typeof hex === 'number') c.setHex(hex);
    else c.set(hex.startsWith('#') ? hex : `#${hex}`);
    colorCache.set(key, c);
  }
  return c;
}

/** New color = c * k. */
export const shade = (c: THREE.Color, k: number) => new THREE.Color(c.r * k, c.g * k, c.b * k);
export const mixC = (a: THREE.Color, b: THREE.Color, t: number) => new THREE.Color().copy(a).lerp(b, t);

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const gauss = (x: number, w: number) => Math.exp(-(x * x) / (w * w));

/** Cheap deterministic 1D noise in [-1, 1] for fold placement etc. */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const h = (n: number) => {
    const s = Math.sin((n + seed * 17.13) * 127.1) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}

/** Superellipse ring point: half-width a (x), front depth bf (+z), back depth bb (-z), exponent n. */
export function superellipse(theta: number, a: number, bf: number, bb: number, n = 2.4): [number, number] {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const e = 2 / n;
  const x = a * Math.sign(c) * Math.pow(Math.abs(c), e);
  const z = (s >= 0 ? bf : bb) * Math.sign(s) * Math.pow(Math.abs(s), e);
  return [x, z];
}

/** A surface + color pair used by layered garment rules. */
export interface Paint {
  color: THREE.Color;
  surf: Surf;
  /** Extra thickness over the body (m). */
  t: number;
}
