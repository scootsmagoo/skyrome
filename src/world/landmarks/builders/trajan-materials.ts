/**
 * Extra stone and furnishing materials for the Forum of Trajan complex that the shared library
 * lacks: Mons Claudianus grey granite (Basilica Ulpia ground order), cipollino (its gallery
 * order), the coloured opus sectile floors of the basilica and libraries, the white Luna-marble
 * slab paving of the square, scroll ends for the library cupboards, and the relief of heaped
 * Dacian arms on the Column's pedestal.
 *
 * Each is ONE shared material, generated once from pure data (DataTextures, no canvas) and cached
 * at module level, like the kit's inscription and frieze materials. Textures follow the library
 * convention: one UV unit = UV_METERS (2 m), so `repeat = UV_METERS / tile`.
 */
import * as THREE from 'three';
import { HeightField, reliefMaterial } from '../../../arch/common/relief';
import { UV_METERS } from '../../../gfx/textures/catalog';
import { fbm2D, hash2, heightToNormal } from '../../../gfx/textures/noise';
import { applyShaderPatch } from '../../../gfx/textures/shaderPatch';

type RGB = [number, number, number];

interface Pixel {
  rgb: RGB;
  /** Height for the normal map (any units; scaled by `normal`). */
  h: number;
  rough: number;
  ao?: number;
}

const cache = new Map<string, THREE.MeshStandardMaterial>();

function dataTex(data: Uint8ClampedArray, size: number, srgb: boolean, repeat: [number, number]): THREE.DataTexture {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Build (once) a textured standard material from a per-pixel function over the unit square. */
function procMaterial(
  key: string,
  size: number,
  tile: number | [number, number],
  px: (u: number, v: number, x: number, y: number) => Pixel,
  opts: { normal?: number; roughness?: number; metalness?: number; macro?: number } = {},
): THREE.MeshStandardMaterial {
  const hit = cache.get(key);
  if (hit) return hit;
  const color = new Uint8ClampedArray(size * size * 4);
  const arm = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const p = px(x / size, y / size, x, y);
      const i = y * size + x;
      const j = i * 4;
      color[j] = p.rgb[0];
      color[j + 1] = p.rgb[1];
      color[j + 2] = p.rgb[2];
      color[j + 3] = 255;
      arm[j] = (p.ao ?? 1) * 255;
      arm[j + 1] = p.rough * 255;
      arm[j + 2] = (opts.metalness ?? 0) * 255;
      arm[j + 3] = 255;
      height[i] = p.h;
    }
  const [tu, tv] = typeof tile === 'number' ? [tile, tile] : tile;
  const rep: [number, number] = [UV_METERS / tu, UV_METERS / tv];
  const armT = dataTex(arm, size, false, rep);
  const m = new THREE.MeshStandardMaterial({
    map: dataTex(color, size, true, rep),
    normalMap: dataTex(heightToNormal(height, size, size, opts.normal ?? 1.5), size, false, rep),
    roughnessMap: armT,
    aoMap: armT,
    roughness: opts.roughness ?? 1,
    metalness: opts.metalness ?? 0,
  });
  m.name = `trajan:${key}`;
  applyShaderPatch(m, { macro: opts.macro ?? 0.04 });
  cache.set(key, m);
  return m;
}

const mix = (a: readonly number[], b: readonly number[], t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (a: readonly number[], k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Mons Claudianus granite: polished salt-and-pepper grey (#8F8E89, specks #3E3D3B / #D0CEC8). */
export function graniteMaterial(): THREE.MeshStandardMaterial {
  const coarse = fbm2D(311, 6, 3);
  const grain = fbm2D(312, 64, 2);
  return procMaterial(
    'granite',
    256,
    0.9,
    (u, v, x, y) => {
      const g = grain(u, v);
      const c = coarse(u, v);
      const r = hash2(x >> 1, y >> 1, 77);
      let rgb: RGB = scale([146, 145, 140], 0.92 + 0.16 * c);
      if (r < 0.2 + 0.1 * g) rgb = mix(rgb, [58, 57, 55], 0.85);
      else if (r > 0.93) rgb = mix(rgb, [214, 211, 204], 0.8);
      else if (r > 0.86) rgb = mix(rgb, [176, 160, 152], 0.4);
      return { rgb, h: g * 0.3, rough: 0.32 + 0.1 * g };
    },
    { normal: 0.6 },
  );
}

/** Cipollino (marmor Carystium): pale green with wavy "onion-layer" bands, running up the shaft. */
export function cipollinoMaterial(): THREE.MeshStandardMaterial {
  const warp = fbm2D(421, 3, 4, 0.5, 2);
  const fine = fbm2D(422, 24, 2);
  return procMaterial(
    'cipollino',
    256,
    [1.6, 3.2],
    (u, v) => {
      const w = warp(u, v);
      const band = Math.sin((u * 7 + w * 2.2) * Math.PI * 2);
      const dark = smooth(0.55, 0.95, band);
      const mid = smooth(0.1, 0.5, band) * (1 - dark);
      let rgb: RGB = [182, 197, 176];
      rgb = mix(rgb, [111, 140, 114], mid * 0.7);
      rgb = mix(rgb, [78, 107, 87], dark * 0.85);
      rgb = scale(rgb, 0.95 + 0.1 * fine(u, v));
      return { rgb, h: band * 0.05, rough: 0.3 };
    },
    { normal: 0.4 },
  );
}

/**
 * Opus sectile floor (Basilica Ulpia, libraries): panels of giallo antico with a pavonazzetto
 * roundel, framed by grey granite bands; one repeat = 2 × 2 panels over `tile` metres.
 */
export function sectileMaterial(tile = 3.0): THREE.MeshStandardMaterial {
  const vein = fbm2D(531, 8, 4);
  const fine = fbm2D(532, 40, 2);
  return procMaterial(
    `sectile${tile}`,
    512,
    tile,
    (u, v, x, y) => {
      const pu = (u * 2) % 1;
      const pv = (v * 2) % 1;
      const band = 0.08;
      const inBand = pu < band / 2 || pu > 1 - band / 2 || pv < band / 2 || pv > 1 - band / 2;
      const joint = pu < 0.006 || pv < 0.006 || Math.abs(pu - band / 2) < 0.004 || Math.abs(pu - (1 - band / 2)) < 0.004 || Math.abs(pv - band / 2) < 0.004 || Math.abs(pv - (1 - band / 2)) < 0.004;
      const dx = pu - 0.5;
      const dy = pv - 0.5;
      const rr = Math.hypot(dx, dy);
      const vn = vein(u, v);
      const f = fine(u, v);
      let rgb: RGB;
      let rough = 0.28;
      if (inBand) {
        const r = hash2(x >> 1, y >> 1, 9);
        rgb = scale([132, 131, 126], 0.9 + 0.2 * f);
        if (r < 0.22) rgb = mix(rgb, [60, 59, 57], 0.8);
        else if (r > 0.92) rgb = mix(rgb, [210, 207, 200], 0.7);
      } else if (rr < 0.3) {
        // pavonazzetto roundel with violet veins, framed by a thin porphyry ring
        if (rr > 0.275) rgb = scale([112, 44, 48], 0.9 + 0.2 * f);
        else {
          const veins = smooth(0.62, 0.7, vn) * (1 - smooth(0.7, 0.8, vn));
          rgb = mix(scale([236, 229, 218], 0.97 + 0.06 * f), [110, 66, 96], veins * 0.75);
        }
      } else {
        // giallo antico, brecciated
        const k = 0.9 + 0.2 * vn;
        rgb = scale([216, 172, 88], k);
        rgb = mix(rgb, [181, 101, 74], smooth(0.72, 0.8, vn) * 0.45);
        rough = 0.3;
      }
      if (joint) rgb = scale(rgb, 0.62);
      return { rgb, h: joint ? -1 : 0, rough };
    },
    { normal: 0.8, macro: 0.03 },
  );
}

/** White Luna-marble paving slabs of the square, laid in staggered courses (4 × 4 m repeat). */
export function slabPavingMaterial(): THREE.MeshStandardMaterial {
  const vein = fbm2D(641, 6, 5);
  const grain = fbm2D(642, 48, 2);
  const rows = 4; // courses of 1 m
  const cols = 2; // slabs of 2 m
  return procMaterial(
    'slabs',
    512,
    4,
    (u, v) => {
      const row = Math.floor(v * rows);
      const off = (row % 2) * 0.5;
      const cu = u * cols + off;
      const col = Math.floor(cu);
      const lu = cu - col;
      const lv = v * rows - row;
      const id = hash2(((col % cols) + cols) % cols, row, 5);
      const joint = lu < 0.008 || lu > 0.992 || lv < 0.012 || lv > 0.988;
      const vn = vein(u, v);
      const veins = smooth(0.6, 0.66, vn) * (1 - smooth(0.66, 0.74, vn));
      let rgb: RGB = scale([236, 234, 227], 0.95 + 0.07 * id + 0.03 * grain(u, v));
      rgb = mix(rgb, [170, 172, 176], veins * 0.45);
      // slight wear in the middle of each slab
      if (joint) rgb = scale(rgb, 0.6);
      return { rgb, h: joint ? -1 : grain(u, v) * 0.1, rough: joint ? 0.9 : 0.42 + 0.1 * id };
    },
    { normal: 0.9, macro: 0.05 },
  );
}

/** Scroll ends stacked on cupboard shelves (papyrus rolls with coloured title tags). */
export function scrollsMaterial(): THREE.MeshStandardMaterial {
  return procMaterial(
    'scrolls',
    256,
    [0.8, 0.8],
    (u, v, x, y) => {
      // 8 columns × 8 rows of roll ends in a 0.8 m repeat (shelves every 0.4 m: 4 rows per shelf)
      const cx = u * 8;
      const cy = v * 8;
      const ix = Math.floor(cx);
      const iy = Math.floor(cy);
      const shelf = iy % 4 === 0 && cy - iy < 0.18;
      const lx = cx - ix - 0.5;
      const ly = cy - iy - 0.55;
      const r = Math.hypot(lx, ly);
      const id = hash2(ix, iy, 3);
      let rgb: RGB = [52, 36, 24];
      let h = -0.5;
      if (shelf) {
        rgb = [96, 66, 42];
        h = 0.3;
      } else if (r < 0.4) {
        const ring = 0.5 + 0.5 * Math.cos(r * 60);
        rgb = mix([214, 196, 156], [176, 150, 108], ring * 0.4 + (r > 0.34 ? 0.5 : 0));
        h = 0.4 - r;
        // title tag (sittybos) hanging from some rolls
        if (id > 0.7 && ly < -0.2 && Math.abs(lx) < 0.06) rgb = id > 0.85 ? [150, 40, 30] : [60, 110, 70];
      }
      const n = hash2(x, y, 1) * 0.08;
      return { rgb: scale(rgb, 0.96 + n), h, rough: 0.8 };
    },
    { normal: 2.5, macro: 0 },
  );
}

let armsRelief: THREE.MeshStandardMaterial | null = null;

/**
 * The Column pedestal's relief of heaped Dacian arms: oval and hexagonal shields, crested
 * helmets, curved falces, spears and the wolf-headed draco standards. One face, clamped UVs.
 */
export function dacianArmsMaterial(): THREE.MeshStandardMaterial {
  if (armsRelief) return armsRelief;
  const w = 512;
  const h = 512;
  const f = new HeightField(w, h);
  let seed = 9113;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // Lower frame band and upper border
  f.rect(0, 0, w - 1, 10, 0.9);
  f.rect(0, h - 11, w - 1, h - 1, 0.9);
  for (let i = 0; i < 46; i++) {
    const x = 24 + rnd() * (w - 48);
    const y = 26 + rnd() * (h - 60);
    const k = rnd();
    const s = 26 + rnd() * 26;
    if (k < 0.3) {
      // oval shield with boss and rim
      f.ellipse(x, y, s * 0.75, s, 0.55 + rnd() * 0.15);
      f.ellipse(x, y, s * 0.2, s * 0.2, 0.95);
    } else if (k < 0.45) {
      // hexagonal shield
      f.rect(x - s * 0.5, y - s * 0.8, x + s * 0.5, y + s * 0.8, 0.6);
      f.ellipse(x, y, s * 0.18, s * 0.18, 0.9);
    } else if (k < 0.6) {
      // helmet with crest
      f.ellipse(x, y, s * 0.55, s * 0.45, 0.75);
      f.line(x - s * 0.5, y + s * 0.35, x + s * 0.5, y + s * 0.35, 4, 0.85);
    } else if (k < 0.75) {
      // curved falx / sword
      const a = rnd() * Math.PI;
      for (let t = 0; t < 1; t += 0.1) {
        const x0 = x + Math.cos(a) * s * 1.6 * (t - 0.5) + Math.sin(t * 3) * 6;
        const y0 = y + Math.sin(a) * s * 1.6 * (t - 0.5);
        f.ellipse(x0, y0, 3.5, 3.5, 0.7);
      }
    } else if (k < 0.88) {
      // spear shaft
      const a = rnd() * Math.PI;
      f.line(x - Math.cos(a) * s * 2, y - Math.sin(a) * s * 2, x + Math.cos(a) * s * 2, y + Math.sin(a) * s * 2, 3, 0.65);
    } else {
      // draco: wolf head with a tube body
      f.ellipse(x, y, s * 0.4, s * 0.3, 0.8);
      f.ellipse(x + s * 0.35, y + s * 0.05, s * 0.2, s * 0.12, 0.8);
      for (let t = 0; t < 1; t += 0.08) f.ellipse(x - s * 0.4 - t * s * 1.6, y + Math.sin(t * 7) * s * 0.25, s * 0.16, s * 0.16, 0.6);
    }
  }
  f.blur(2);
  armsRelief = reliefMaterial(f, { ground: [214, 208, 196], relief: [242, 238, 230], noise: 0.06, strength: 4, roughness: 0.55 });
  armsRelief.name = 'trajan:dacian-arms';
  return armsRelief;
}

/** Materials created here, for the dev scene and tests. */
export function trajanMaterialNames(): string[] {
  return [...cache.keys()];
}
