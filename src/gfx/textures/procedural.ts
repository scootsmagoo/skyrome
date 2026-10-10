/**
 * Procedural texture generators for materials that have no photo set: fabrics, black-and-white
 * floor mosaic, Pompeian painted stucco, gilded and plain bronze, iron/lead, porphyry, opus
 * reticulatum, travertine ashlar and foliage. Pure functions: they return raw RGBA arrays (row 0 = v 0, i.e. the
 * layout `DataTexture` uploads), so they run in tests and need no canvas. All are seamless.
 */
import type { ProceduralId } from './catalog';
import { fbm2D, hash2, heightToNormal, hexRgb, mixRgb, prng, srgbToLinear } from './noise';

export interface ProcImage {
  size: number;
  /** sRGB albedo, RGBA. */
  color: Uint8ClampedArray;
  /** Tangent-space normals, RGBA. */
  normal?: Uint8ClampedArray;
  /** R = ambient occlusion, G = roughness, B = metalness. */
  arm?: Uint8ClampedArray;
  /** Average linear albedo of `color` (for tint normalisation). */
  albedo: [number, number, number];
  /** Mean of arm.G in 0..1. */
  roughness: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const fract = (x: number) => x - Math.floor(x);

/** Collects the per-pixel outputs of a generator and computes the averages. */
class Img {
  readonly color: Uint8ClampedArray;
  readonly arm: Uint8ClampedArray;
  readonly height: Float32Array;
  constructor(readonly size: number) {
    this.color = new Uint8ClampedArray(size * size * 4);
    this.arm = new Uint8ClampedArray(size * size * 4);
    this.height = new Float32Array(size * size);
  }
  set(x: number, y: number, rgb: readonly number[], h: number, rough: number, ao = 1, metal = 0) {
    const i = y * this.size + x;
    const j = i * 4;
    this.color[j] = rgb[0];
    this.color[j + 1] = rgb[1];
    this.color[j + 2] = rgb[2];
    this.color[j + 3] = 255;
    this.arm[j] = ao * 255;
    this.arm[j + 1] = rough * 255;
    this.arm[j + 2] = metal * 255;
    this.arm[j + 3] = 255;
    this.height[i] = h;
  }
  finish(normalStrength: number): ProcImage {
    let r = 0;
    let g = 0;
    let b = 0;
    let ro = 0;
    // Average on a sparse grid: plenty accurate and keeps generation cheap.
    const step = Math.max(1, Math.floor(this.size / 64));
    let count = 0;
    for (let y = 0; y < this.size; y += step)
      for (let x = 0; x < this.size; x += step) {
        const j = (y * this.size + x) * 4;
        r += srgbToLinear(this.color[j] / 255);
        g += srgbToLinear(this.color[j + 1] / 255);
        b += srgbToLinear(this.color[j + 2] / 255);
        ro += this.arm[j + 1] / 255;
        count++;
      }
    return {
      size: this.size,
      color: this.color,
      arm: this.arm,
      normal: normalStrength > 0 ? heightToNormal(this.height, this.size, this.size, normalStrength) : undefined,
      albedo: [r / count, g / count, b / count],
      roughness: ro / count,
    };
  }
}

/** Plain-weave wool/linen with soft drapery wrinkles; near-white so the material tint colours it. */
function fabric(seed: number): ProcImage {
  const S = 256;
  const img = new Img(S);
  const wrinkles = fbm2D(seed, 3, 4, 0.55, 1);
  const mottle = fbm2D(seed + 5, 8, 3);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const over = ((x >> 1) + (y >> 1)) & 1;
      const weave = over ? Math.sin(Math.PI * ((x % 2) + 0.5) * 0.5) : Math.sin(Math.PI * ((y % 2) + 0.5) * 0.5);
      const w = wrinkles(u, v);
      const h = weave * 0.35 + w * 6;
      const shade = 0.86 + 0.08 * weave + 0.12 * (w - 0.5) + 0.06 * (mottle(u, v) - 0.5);
      const c = 236 * shade;
      img.set(x, y, [c, c * 0.985, c * 0.955], h, 0.95, 0.85 + 0.15 * w);
    }
  return img.finish(1.6);
}

/**
 * Black-and-white geometric floor mosaic (2nd-century Ostia style): a field of intersecting
 * circles framed by a double black band at the tile edges, ~1.5 cm tesserae with grout.
 */
function mosaic(seed: number): ProcImage {
  const S = 1024;
  const CELL = 8; // px per tessera → 128 tesserae per tile
  const N = S / CELL;
  const img = new Img(S);
  const white = hexRgb(0xe8e1d0);
  const black = hexRgb(0x2a2724);
  const red = hexRgb(0x9a3b2a);
  const grout = hexRgb(0x8f8574);
  const dirt = fbm2D(seed, 4, 4);
  // Design value per tessera: 0 white, 1 black, 2 red accent.
  const design = new Uint8Array(N * N);
  const P = 32; // pattern repeat in tesserae (= 4 repeats per tile)
  const R = P / 2;
  for (let cy = 0; cy < N; cy++)
    for (let cx = 0; cx < N; cx++) {
      const edge = Math.min(cx, cy, N - 1 - cx, N - 1 - cy);
      let d = 0;
      if (edge < 2 || (edge >= 3 && edge < 4)) d = 1;
      else if (edge >= 6) {
        const px = (cx + 0.5) % P;
        const py = (cy + 0.5) % P;
        // Circles centred on the pattern corners and its middle.
        const centres = [
          [0, 0],
          [P, 0],
          [0, P],
          [P, P],
          [R, R],
          [R, -R],
          [R, P + R],
          [-R, R],
          [P + R, R],
        ];
        for (const [ox, oy] of centres) {
          const dist = Math.hypot(px - ox, py - oy);
          if (Math.abs(dist - R) < 0.85) d = 1;
        }
        // Small red lozenge in the centre of each quatrefoil.
        if (Math.abs(px - R) + Math.abs(py - R) < 1.6 || Math.abs(px) + Math.abs(py) < 1.6) d = 2;
      } else if (edge === 5 && ((cx + cy) & 1) === 0) d = 1; // dotted inner frame line
      design[cy * N + cx] = d;
    }
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const cx = (x / CELL) | 0;
      const cy = (y / CELL) | 0;
      const lx = x % CELL;
      const ly = y % CELL;
      const isGrout = lx === 0 || ly === 0;
      const r = hash2(cx, cy, seed);
      const d = design[cy * N + cx];
      const base = d === 1 ? black : d === 2 ? red : white;
      const dd = dirt(x / S, y / S);
      let rgb: number[];
      let h: number;
      let rough: number;
      if (isGrout) {
        rgb = mixRgb(grout, black, 0.25 * dd);
        h = 0;
        rough = 0.95;
      } else {
        const j = 0.9 + 0.18 * r;
        rgb = [base[0] * j, base[1] * j, base[2] * j];
        rgb = mixRgb(rgb, [120, 108, 90], 0.12 * dd);
        const e = Math.min(lx, ly, CELL - lx, CELL - ly);
        h = Math.min(1, e / 1.5) * (0.8 + 0.2 * r);
        rough = 0.55 + 0.15 * r;
      }
      img.set(x, y, rgb, h, rough, isGrout ? 0.7 : 1);
    }
  return img.finish(1.2);
}

/**
 * Pompeian "fourth style" wall painting over 3.2 m of height: black socle, red panels split by
 * black candelabra strips, a black frieze with an ochre scroll, and a cream upper zone.
 * v = 0 is the floor (box-projected UVs put v at world height).
 */
function stucco(seed: number): ProcImage {
  const S = 1024;
  const img = new Img(S);
  const mott = fbm2D(seed, 6, 5);
  const fine = fbm2D(seed + 3, 48, 2);
  const cRed = hexRgb(0x9c3022);
  const cBlack = hexRgb(0x221e1b);
  const cOchre = hexRgb(0xc8953f);
  const cWhite = hexRgb(0xe9dfc8);
  const cGreen = hexRgb(0x4f6a45);
  const panels = 3;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const pu = fract(u * panels); // position within a panel bay
      let rgb: readonly number[] = cWhite;
      if (v < 0.27) {
        rgb = cBlack;
        // Socle: thin green plant stems in each bay.
        const stem = Math.abs(pu - 0.5) < 0.003 && v > 0.05 && v < 0.22;
        const leaf = Math.abs(Math.abs(pu - 0.5) - (0.03 * Math.sin(v * 80) + 0.03)) < 0.004 && v > 0.08 && v < 0.2;
        if (stem || leaf) rgb = cGreen;
      } else if (v < 0.278) rgb = cWhite;
      else if (v < 0.8) {
        const strip = pu < 0.085 || pu > 0.915;
        if (strip) {
          rgb = cBlack;
          // Candelabrum: an ochre line with knobs.
          const cu = pu < 0.5 ? pu : pu - 1;
          if (Math.abs(cu) < 0.004 || (Math.abs(cu) < 0.016 && fract(v * 14) < 0.05)) rgb = cOchre;
        } else {
          rgb = cRed;
          // Inner ochre border.
          const iu = Math.min(pu - 0.085, 0.915 - pu);
          const iv = Math.min(v - 0.278, 0.8 - v);
          const inset = Math.min(iu * 3.2, iv); // in tile units (u spans 3.2 m, v 3.2 m)
          if (Math.abs(inset - 0.022) < 0.0025) rgb = cOchre;
          // Central vignette: a small floating figure-ish oval.
          const du = (pu - 0.5) * 3.2 / panels;
          const dv = v - 0.55;
          const e = (du / 0.045) ** 2 + (dv / 0.07) ** 2;
          if (e < 1) rgb = mixRgb(cOchre, cGreen, smooth(0.2, 1, e) * 0.6 + 0.2 * (dv > 0 ? 1 : 0));
        }
      } else if (v < 0.808) rgb = cWhite;
      else if (v < 0.895) {
        rgb = cBlack;
        // Ochre running scroll.
        const sv = 0.851 + 0.025 * Math.sin(u * Math.PI * 2 * 24);
        if (Math.abs(v - sv) < 0.003) rgb = cOchre;
        const spiral = Math.hypot(fract(u * 24) - 0.5, (v - 0.851) * 24 * 0.7) ;
        if (Math.abs(spiral - 0.22) < 0.03 && fract(u * 24) > 0.5) rgb = cGreen;
      } else {
        rgb = cWhite;
        if (Math.abs(v - 0.965) < 0.0025) rgb = cRed;
      }
      const m = mott(u, v);
      const f = fine(u, v);
      const k = 0.9 + 0.14 * m + 0.05 * (f - 0.5);
      img.set(x, y, [rgb[0] * k, rgb[1] * k, rgb[2] * k], m * 2 + f * 0.6, 0.62 + 0.15 * m);
    }
  return img.finish(0.8);
}

/** Gold leaf over bronze: faint leaf squares, polish variation and a little wear. */
function gilded(seed: number): ProcImage {
  const S = 512;
  const img = new Img(S);
  const LEAF = 32;
  const wear = fbm2D(seed, 5, 5);
  const ripple = fbm2D(seed + 9, 24, 3);
  const gold = [246, 196, 98];
  const bronze = [140, 92, 48];
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const lx = (x + ((y / LEAF) | 0) * 13) % LEAF;
      const ly = y % LEAF;
      const leafId = hash2(((x + ((y / LEAF) | 0) * 13) / LEAF) | 0, (y / LEAF) | 0, seed);
      const seam = lx < 1 || ly < 1 ? 1 : 0;
      const w = smooth(0.74, 0.82, wear(u, v)) * 0.6;
      const r = ripple(u, v);
      const k = 0.94 + 0.06 * leafId - 0.03 * seam;
      let rgb = [gold[0] * k, gold[1] * k, gold[2] * k];
      rgb = mixRgb(rgb, bronze, w * 0.85);
      img.set(x, y, rgb, r * 1.2 + seam * -0.12 - w * 0.3, 0.22 + 0.1 * r + 0.06 * leafId + 0.25 * w, 1, 1);
    }
  return img.finish(0.9);
}

/** Polished statuary bronze: warm golden-brown with soft, low-contrast tarnish and fine grain. */
function bronze(seed: number): ProcImage {
  const S = 256;
  const img = new Img(S);
  const tarnish = fbm2D(seed, 3, 5, 0.5);
  const grain = fbm2D(seed + 4, 48, 2);
  const warm = [178, 132, 80];
  const dark = [128, 90, 56];
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const p = tarnish(u, v);
      const g = grain(u, v);
      const t = smooth(0.25, 0.85, p) * 0.35;
      const rgb = mixRgb(warm, dark, t);
      const k = 0.96 + 0.08 * (g - 0.5);
      img.set(x, y, [rgb[0] * k, rgb[1] * k, rgb[2] * k], p * 0.8 + g * 0.3, 0.3 + 0.22 * t + 0.06 * g, 1, 1);
    }
  return img.finish(0.5);
}

/** Wrought iron / cast lead: neutral grey, mottled; the material tint sets the hue. */
function metal(seed: number): ProcImage {
  const S = 256;
  const img = new Img(S);
  const n = fbm2D(seed, 5, 5);
  const g = fbm2D(seed + 2, 40, 2);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const a = n(x / S, y / S);
      const b = g(x / S, y / S);
      const c = 150 + 60 * (a - 0.5) + 14 * (b - 0.5);
      img.set(x, y, [c, c, c * 1.02], a * 2 + b * 0.5, 0.45 + 0.25 * a, 1, 1);
    }
  return img.finish(0.7);
}

/** Imperial porphyry: deep purple-red groundmass with pale feldspar crystals. */
function porphyry(seed: number): ProcImage {
  const S = 512;
  const img = new Img(S);
  const ground = fbm2D(seed, 8, 4);
  const grains = fbm2D(seed + 1, 96, 2);
  const base = [112, 40, 50];
  // Crystal specks: rasterise a few thousand small discs into a mask (wrapping).
  const mask = new Float32Array(S * S);
  const rnd = prng(seed + 77);
  for (let i = 0; i < 2600; i++) {
    const cx = rnd() * S;
    const cy = rnd() * S;
    const rad = 0.6 + rnd() ** 3 * 2.6;
    const strength = 0.55 + rnd() * 0.45;
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const d = Math.hypot(dx + 0.5 - fract(cx), dy + 0.5 - fract(cy));
        if (d > rad) continue;
        const px = (((cx | 0) + dx) % S + S) % S;
        const py = (((cy | 0) + dy) % S + S) % S;
        mask[py * S + px] = Math.max(mask[py * S + px], strength * smooth(rad, rad * 0.4, d));
      }
  }
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const gm = ground(u, v);
      const gr = grains(u, v);
      const k = 0.82 + 0.3 * gm - 0.18 * smooth(0.55, 0.8, gr);
      let rgb = [base[0] * k, base[1] * k, base[2] * k];
      const m = mask[y * S + x];
      rgb = mixRgb(rgb, [226, 196, 190], m);
      img.set(x, y, rgb, gm * 0.3 + m * 0.15, 0.3 + 0.08 * gm);
    }
  return img.finish(0.5);
}

/**
 * Opus reticulatum: small square tufa blocks (cubilia) set diagonally in a net pattern with
 * light mortar joints. 7 diamonds across one repeat (≈ 8.5 cm blocks at 0.85 m per repeat).
 */
function reticulatum(seed: number): ProcImage {
  const S = 512;
  const N = 7;
  const img = new Img(S);
  const stone = fbm2D(seed, 16, 4);
  const grit = fbm2D(seed + 3, 64, 2);
  const palette = [hexRgb(0xa48a63), hexRgb(0x8f7a5c), hexRgb(0xb0956a), hexRgb(0x857565), hexRgb(0x9b8460)];
  const mortar = hexRgb(0xbdb3a0);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const a = (u + v) * N;
      const b = (u - v) * N;
      const A = Math.floor(a);
      const B = Math.floor(b);
      // Canonical cell id so the diamond lattice tiles seamlessly.
      const A0 = ((A % N) + N) % N;
      const s = (A - A0) / N;
      const B0 = (((B - s * N) % (2 * N)) + 2 * N) % (2 * N);
      const r = hash2(A0, B0, seed);
      const fa = a - A;
      const fb = b - B;
      const e = Math.min(fa, 1 - fa, fb, 1 - fb);
      const st = stone(u, v);
      const gr = grit(u, v);
      const joint = 0.075 + 0.02 * (st - 0.5);
      const block = smooth(joint, joint + 0.08, e);
      const pc = palette[Math.floor(r * palette.length)];
      const k = 0.85 + 0.25 * st + 0.08 * (gr - 0.5);
      const stoneRgb = [pc[0] * k, pc[1] * k, pc[2] * k];
      const mortRgb = mixRgb(mortar, [150, 140, 125], gr * 0.5);
      const rgb = mixRgb(mortRgb, stoneRgb, block);
      const h = block * (1 + 0.35 * st + 0.25 * r) + gr * 0.15;
      img.set(x, y, rgb, h * 4, 0.85 + 0.1 * gr, 0.65 + 0.35 * block);
    }
  return img.finish(2.2);
}

/**
 * Lapis Tiburtinus as cut for Roman ashlar (fresh in AD 113, honed, never pockmarked): warm cream
 * with wavy horizontal laminae, sparse small voids drawn out along the bedding, and fine tight
 * joints of opus quadratum (two 0.6 m courses per repeat, staggered head joints). Designed for a
 * 2.4 × 1.2 m repeat, so features are drawn half as wide as they appear.
 */
function travertine(seed: number): ProcImage {
  const S = 1024;
  const img = new Img(S);
  const warp = fbm2D(seed, 3, 3, 0.5, 2);
  // One lattice cell across u: the laminae run straight across, then get warped.
  const lam = fbm2D(seed + 1, 1, 5, 0.62, 18);
  const lamFine = fbm2D(seed + 2, 2, 3, 0.5, 90);
  const mott = fbm2D(seed + 3, 5, 4, 0.5, 3);
  const grain = fbm2D(seed + 4, 96, 2);
  const porous = fbm2D(seed + 5, 1, 3, 0.5, 7);
  // Voids: small ellipses elongated along the bedding, clustered in porous laminae (wrapping).
  const voids = new Float32Array(S * S);
  const rnd = prng(seed + 99);
  let placed = 0;
  for (let tries = 0; placed < 1300 && tries < 40000; tries++) {
    const cx = rnd() * S;
    const cy = rnd() * S;
    // Porosity varies by lamina, but every band has a few voids (no stripes of holes).
    if (rnd() > 0.3 + 0.7 * smooth(0.35, 0.75, porous(cx / S, cy / S))) continue;
    placed++;
    const rx = 1.2 + rnd() ** 4 * 7;
    const ry = Math.max(0.7, rx * (0.35 + rnd() * 0.35));
    const depth = 0.45 + rnd() * 0.45;
    for (let dy = -Math.ceil(ry) - 1; dy <= Math.ceil(ry) + 1; dy++)
      for (let dx = -Math.ceil(rx) - 1; dx <= Math.ceil(rx) + 1; dx++) {
        const d = Math.hypot(dx / rx, dy / ry);
        if (d >= 1.15) continue;
        const px = ((((cx | 0) + dx) % S) + S) % S;
        const py = ((((cy | 0) + dy) % S) + S) % S;
        const i = py * S + px;
        voids[i] = Math.max(voids[i], depth * smooth(1.15, 0.6, d));
      }
  }
  const cream = hexRgb(0xe3dac6);
  const light = hexRgb(0xeee6d4);
  const warm = hexRgb(0xd9c7a4);
  const weathered = hexRgb(0xcfc4ac);
  const pore = hexRgb(0x8f826a);
  // Head joints per course (u position), courses at v = 0 and 0.5.
  const heads = [0.31, 0.83];
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const lv = v + (warp(u, v) - 0.5) * 0.07;
      const L = lam(u, lv);
      const lf = lamFine(u, lv);
      const m = mott(u, v);
      const g = grain(u, v);
      let rgb = mixRgb(cream, light, smooth(0.5, 0.75, L));
      rgb = mixRgb(rgb, warm, smooth(0.52, 0.32, L) * 0.4);
      rgb = mixRgb(rgb, weathered, smooth(0.45, 0.8, m) * 0.5);
      const k = 0.97 + 0.06 * (lf - 0.5) + 0.05 * (g - 0.5);
      rgb = [rgb[0] * k, rgb[1] * k, rgb[2] * k];
      const vd = voids[y * S + x];
      rgb = mixRgb(rgb, pore, vd * 0.55);
      // Ashlar joints: hairline, slightly darker and recessed.
      const course = v < 0.5 ? 0 : 1;
      const dv = Math.min(Math.abs(v - 0), Math.abs(v - 0.5), Math.abs(v - 1)) * S;
      let du = Math.abs(u - heads[course]);
      du = Math.min(du, 1 - du) * S;
      const joint = Math.max(smooth(2.2, 0.6, dv), smooth(1.6, 0.4, du));
      rgb = mixRgb(rgb, [rgb[0] * 0.72, rgb[1] * 0.7, rgb[2] * 0.66], joint);
      const h = (L - 0.5) * 0.25 + (lf - 0.5) * 0.15 + g * 0.08 - vd * 1.6 - joint * 0.9;
      img.set(x, y, rgb, h, 0.8 + 0.1 * g + 0.08 * vd, 1 - 0.45 * vd - 0.3 * joint);
    }
  return img.finish(2.0);
}

/**
 * Forum paving as laid in the Augustan and Flavian square: big rectangular travertine slabs in
 * running bond, tight dark joints, a tone of their own per slab (some warmer, some greyer), a
 * polished walking-lane where the crowds pass, a few chipped edges, hairline cracks, a repair slab
 * of another stone, and one slab with a carved band of lettering. Designed for a 6 x 6 m repeat
 * (five courses of about 1.2 m, slabs 1.5-2.6 m long, so 1 px is 4 mm).
 */
function slabs(seed: number): ProcImage {
  const S = 1536;
  const M = 6; // metres per repeat
  const PX = S / M;
  const img = new Img(S);
  const rnd = prng(seed + 7);
  // Courses: heights near 1.2 m summing to 6; slabs per course with staggered head joints.
  const rows: { y0: number; y1: number; heads: number[] }[] = [];
  {
    const hs = Array.from({ length: 5 }, () => 0.85 + rnd() * 0.3);
    const tot = hs.reduce((a, b) => a + b, 0);
    let y = 0;
    for (const h of hs) {
      const hh = (h / tot) * M;
      const n = rnd() < 0.55 ? 3 : 2 + (rnd() < 0.5 ? 1 : 0);
      const ws = Array.from({ length: n }, () => 0.75 + rnd() * 0.5);
      const wt = ws.reduce((a, b) => a + b, 0);
      const off = rnd() * M;
      const heads: number[] = [];
      let x = off;
      for (const w of ws) {
        heads.push(x % M);
        x += (w / wt) * M;
      }
      heads.sort((a, b) => a - b);
      rows.push({ y0: y, y1: y + hh, heads });
      y += hh;
    }
  }
  // Per-slab parameters, indexed by (row, slab).
  const slabAt = rows.map((r, ri) =>
    r.heads.map((_, si) => ({
      tone: (hash2(ri, si, seed + 1) - 0.5) * 0.07,
      warm: hash2(ri, si, seed + 2),
      grey: hash2(ri, si, seed + 5) < 0.07 ? 1 : hash2(ri, si, seed + 3) < 0.15 ? 0.4 : 0,
      polish: hash2(ri, si, seed + 4),
      crack: hash2(ri, si, seed) < 0.05 ? 1 : 0,
      chip: hash2(ri, si, seed + 6),
    })),
  );
  const blotch = fbm2D(seed + 11, 5, 4, 0.55);
  const lamina = fbm2D(seed + 12, 3, 4, 0.5, 14);
  const fine = fbm2D(seed + 13, 90, 2);
  const lane = fbm2D(seed + 14, 3, 3, 0.5);
  const edgeN = fbm2D(seed + 15, 40, 2);
  const crackN = fbm2D(seed + 16, 18, 3, 0.5);
  const cream = hexRgb(0xe6dcc6);
  const warmC = hexRgb(0xdcc9a2);
  const greyC = hexRgb(0xc9c4b6);
  const dirt = hexRgb(0x7d725d);
  // The carved band: one slab (course 1, its slab 0) gets two incised rules and a line of blocky letters.
  const lettering = (row: number, slab: number, lx: number, ly: number, w: number, h: number) => {
    if (row !== 1 || slab !== 0) return 0;
    const cy = h * 0.5;
    const band = Math.abs(ly - cy);
    if (Math.abs(band - h * 0.3) < 1.3 && lx > w * 0.08 && lx < w * 0.92) return 0.6; // rules
    if (band < h * 0.17 && lx > w * 0.1 && lx < w * 0.9) {
      const gw = PX * 0.2;
      const gx = Math.floor((lx - w * 0.1) / gw);
      const inGlyph = ((lx - w * 0.1) % gw) / gw;
      if (hash2(gx, 3, seed) > 0.28 && inGlyph > 0.15 && inGlyph < 0.8) {
        const stroke = hash2(gx, 9, seed);
        const yy = (ly - cy) / (h * 0.17);
        // a stem with serifs or arms: I, T, L, F-like marks
        const bar = (stroke < 0.34 && Math.abs(yy) > 0.78) || (stroke >= 0.34 && stroke < 0.67 && yy < -0.78) || (stroke >= 0.67 && (yy > 0.78 || Math.abs(yy) < 0.14));
        if (Math.abs(inGlyph - 0.48) < 0.1 || (bar && inGlyph > 0.25 && inGlyph < 0.72)) return 0.8;
      }
    }
    return 0;
  };
  for (let y = 0; y < S; y++) {
    const v = y / S;
    const wy = v * M;
    const ri = rows.findIndex((r) => wy >= r.y0 && wy < r.y1);
    const row = rows[ri];
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const wx = u * M;
      // Which slab: the last head joint at or before wx (wrapping from the final one).
      let si = row.heads.length - 1;
      let xs = row.heads[si] - M;
      for (let i = 0; i < row.heads.length; i++)
        if (row.heads[i] <= wx) {
          si = i;
          xs = row.heads[i];
        }
      const xe = si + 1 < row.heads.length ? row.heads[si + 1] : row.heads[0] + M;
      const sp = slabAt[ri][si];
      // Distance to the slab's edges in px, with a slightly wandering arris.
      const wob = (edgeN(u, v) - 0.5) * 2.2 + (fine(u, v) - 0.5) * 1.2;
      const dEdge = Math.min((wx - xs) * PX, (xe - wx) * PX, (wy - row.y0) * PX, (row.y1 - wy) * PX) + wob;
      const joint = smooth(2.8, 0.8, dEdge);
      const chipped = sp.chip > 0.7 ? smooth(6, 1.5, dEdge) * smooth(0.45, 0.7, edgeN(u * 2.1, v * 2.1)) * 0.55 : 0;
      const lx = (wx - xs) * PX;
      const ly = (wy - row.y0) * PX;
      const w = (xe - xs) * PX;
      const h = (row.y1 - row.y0) * PX;
      const bl = blotch(u, v);
      const lam = lamina(u, v);
      const fn = fine(u, v);
      let rgb = mixRgb(cream, warmC, smooth(0.3, 0.8, sp.warm) * 0.4 + (bl - 0.5) * 0.3);
      rgb = mixRgb(rgb, greyC, sp.grey * 0.5 + smooth(0.55, 0.8, bl) * 0.15);
      // Polished lane: lighter and smoother in the slabs people cross.
      const traffic = smooth(0.45, 0.72, lane(u, v)) * smooth(0.25, 0.8, sp.polish);
      const k = 1 + sp.tone + (lam - 0.5) * 0.06 + (fn - 0.5) * 0.05 + traffic * 0.05;
      rgb = [rgb[0] * k, rgb[1] * k, rgb[2] * k];
      // Dirt gathers in the joints and along chipped arrises.
      rgb = mixRgb(rgb, dirt, Math.max(joint * 0.75, chipped * 0.5));
      const letter = lettering(ri, si, lx, ly, w, h);
      if (letter > 0) rgb = mixRgb(rgb, dirt, 0.55 * letter);
      let crack = 0;
      if (sp.crack > 0) {
        const c = Math.abs(crackN(u, v) - 0.5);
        crack = smooth(0.006, 0.001, c) * smooth(0, 14, dEdge) * smooth(0.18, 0.3, bl);
        rgb = mixRgb(rgb, dirt, crack * 0.6);
      }
      const hgt = fn * 0.18 + lam * 0.1 - joint * 1.4 - chipped * 0.6 - crack * 0.7 - letter * 0.7 + traffic * 0.05;
      const rough = 0.84 - traffic * 0.22 + (fn - 0.5) * 0.1 + joint * 0.06;
      img.set(x, y, rgb, hgt, rough, 1 - joint * 0.5 - crack * 0.3 - chipped * 0.2);
    }
  }
  return img.finish(2.2);
}

/** Leaf clusters for foliage cards/blobs: dark interiors, lit leaf edges. */
function foliage(seed: number): ProcImage {
  const S = 256;
  const img = new Img(S);
  const big = fbm2D(seed, 6, 4, 0.6);
  const small = fbm2D(seed + 1, 32, 3);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const b = big(u, v);
      const s = small(u, v);
      const h = b * 0.7 + s * 0.6;
      const k = 0.55 + 0.75 * smooth(0.3, 0.8, h);
      img.set(x, y, [120 * k, 150 * k, 90 * k], h * 6, 0.85, 0.5 + 0.5 * smooth(0.25, 0.7, h));
    }
  return img.finish(1.5);
}

const GENERATORS: Record<ProceduralId, (seed: number) => ProcImage> = {
  fabric,
  mosaic,
  stucco,
  gilded,
  bronze,
  metal,
  porphyry,
  reticulatum,
  foliage,
  travertine,
  slabs,
};

const cache = new Map<string, ProcImage>();

/** Generate (or fetch from cache) a procedural texture set. */
export function generateProcedural(id: ProceduralId, seed = 1): ProcImage {
  const key = `${id}:${seed}`;
  let img = cache.get(key);
  if (!img) {
    img = GENERATORS[id](seed);
    cache.set(key, img);
  }
  return img;
}
