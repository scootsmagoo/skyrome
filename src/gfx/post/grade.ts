/**
 * The colour grade as a 3D look-up table, built in code (no image files). The composite pass tone
 * maps, encodes to sRGB and then looks the colour up here: one 3-D texture fetch replaces the old
 * per-pixel saturation / split-tone / contrast maths, and a grade can be anything a function of
 * (r, g, b) can express (shadow desaturation, a warm key, a lifted toe).
 *
 * Both sides of the table are display-encoded sRGB in 0..1; the maths inside runs in linear light.
 */

export const LUT_SIZE = 32;

export interface GradeLutParams {
  /** Overall saturation (1 = unchanged). */
  saturation: number;
  /** How much of that saturation the deepest shadows give up (0..1): film-like, keeps shade from going garish. */
  shadowDesat: number;
  /** S-curve strength on the encoded value (0 = none). */
  contrast: number;
  /** Linear multipliers for shadows and highlights (split toning). */
  shadowTint: [number, number, number];
  highlightTint: [number, number, number];
  /** Lifts the very darkest values toward a cool black (encoded units), so night is not crushed. */
  toe: number;
}

export const srgbToLinear = (e: number) => (e <= 0.04045 ? e / 12.92 : Math.pow((e + 0.055) / 1.055, 2.4));
export const linearToSrgb = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The grade of one colour (encoded in, encoded out), written into `out`. */
export function gradeColor(r: number, g: number, b: number, p: GradeLutParams, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  let lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
  const l = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  // Saturation, a little less of it in the shadows.
  const sat = p.saturation * (1 - p.shadowDesat * (1 - smooth(0.0, 0.2, l)));
  lr = Math.max(0, l + (lr - l) * sat);
  lg = Math.max(0, l + (lg - l) * sat);
  lb = Math.max(0, l + (lb - l) * sat);
  // Split toning by luminance.
  const k = smooth(0.05, 0.75, l);
  lr *= p.shadowTint[0] + (p.highlightTint[0] - p.shadowTint[0]) * k;
  lg *= p.shadowTint[1] + (p.highlightTint[1] - p.shadowTint[1]) * k;
  lb *= p.shadowTint[2] + (p.highlightTint[2] - p.shadowTint[2]) * k;
  const e = [linearToSrgb(Math.min(1, lr)), linearToSrgb(Math.min(1, lg)), linearToSrgb(Math.min(1, lb))];
  for (let i = 0; i < 3; i++) {
    let v = e[i];
    v = v + (v * v * (3 - 2 * v) - v) * p.contrast;
    // Toe: black is a very dark blue-grey, not nothing.
    v = v + p.toe * (1 - smooth(0, 0.12, v)) * [0.8, 0.95, 1.2][i];
    e[i] = Math.min(1, Math.max(0, v));
  }
  out[0] = e[0];
  out[1] = e[1];
  out[2] = e[2];
  return out;
}

/** An RGBA8 table, `size`³ texels, r fastest then g then b (the layout of a THREE.Data3DTexture). */
export function buildGradeLut(p: GradeLutParams, size = LUT_SIZE, data = new Uint8Array(size * size * size * 4)): Uint8Array {
  const tmp: [number, number, number] = [0, 0, 0];
  const s = 1 / (size - 1);
  let i = 0;
  for (let bi = 0; bi < size; bi++)
    for (let gi = 0; gi < size; gi++)
      for (let ri = 0; ri < size; ri++) {
        gradeColor(ri * s, gi * s, bi * s, p, tmp);
        data[i++] = Math.round(tmp[0] * 255);
        data[i++] = Math.round(tmp[1] * 255);
        data[i++] = Math.round(tmp[2] * 255);
        data[i++] = 255;
      }
  return data;
}

/**
 * The same table as half-float values (RGBA16F, 0..1 kept unrounded): an 8-bit table rounds every
 * node to 1/255, and a dark gradient crossing a node boundary then changes slope there, which
 * shows as a faint band in the night sky and in shade. Half precision near black is ~1e-5.
 */
export function buildGradeLutHalf(p: GradeLutParams, size = LUT_SIZE, data = new Uint16Array(size * size * size * 4), toHalf: (v: number) => number = floatToHalf): Uint16Array {
  const tmp: [number, number, number] = [0, 0, 0];
  const s = 1 / (size - 1);
  const one = toHalf(1);
  let i = 0;
  for (let bi = 0; bi < size; bi++)
    for (let gi = 0; gi < size; gi++)
      for (let ri = 0; ri < size; ri++) {
        gradeColor(ri * s, gi * s, bi * s, p, tmp);
        data[i++] = toHalf(tmp[0]);
        data[i++] = toHalf(tmp[1]);
        data[i++] = toHalf(tmp[2]);
        data[i++] = one;
      }
  return data;
}

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

/** IEEE half from a float in 0..1 (round to nearest; enough for table values). */
export function floatToHalf(v: number): number {
  f32[0] = v;
  const x = u32[0];
  const sign = (x >>> 16) & 0x8000;
  const e = ((x >>> 23) & 0xff) - 127 + 15;
  if (e <= 0) {
    // Subnormal half (or zero).
    if (e < -10) return sign;
    const m = (x & 0x7fffff) | 0x800000;
    const sh = 14 - e;
    return sign | ((m + (1 << (sh - 1))) >> sh);
  }
  if (e >= 31) return sign | 0x7c00;
  const r = (x & 0x7fffff) + 0x1000;
  return r & 0x800000 ? sign | ((e + 1) << 10) : sign | (e << 10) | (r >> 13);
}
