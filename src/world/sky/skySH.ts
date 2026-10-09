/**
 * Third-order spherical harmonics (9 coefficients per colour channel) of the sky's diffuse fill:
 * a handful of radiance samples (the zenith, a ring at 35°, the four horizon points, the ground
 * below) projected onto the SH basis. A THREE.LightProbe takes the coefficients as they are and
 * its shader convolves them with the cosine lobe, so every surface gets a smooth, directional
 * ambient (bluer from above, warm toward a low sun's side of the sky, earthy from below) for a
 * dozen uniform vectors and no texture fetch. It replaces the old two-colour hemisphere light,
 * which could only blend between "up" and "down" and had no east or west.
 *
 * Pure: no Three.js. The coefficient order is three's (Y00, Y1-1 = y, Y10 = z, Y11 = x, xy, yz, z², xz, x²-y²).
 */
import type { Vec3 } from './astronomy';
import type { RGB } from './skyModel';

export const SH_COUNT = 9;

/** The SH basis at a unit direction, in three's coefficient order. */
export function shBasis(d: Vec3, out: number[] | Float32Array = new Array(SH_COUNT)): number[] | Float32Array {
  const { x, y, z } = d;
  out[0] = 0.282095;
  out[1] = 0.488603 * y;
  out[2] = 0.488603 * z;
  out[3] = 0.488603 * x;
  out[4] = 1.092548 * x * y;
  out[5] = 1.092548 * y * z;
  out[6] = 0.315392 * (3 * z * z - 1);
  out[7] = 1.092548 * x * z;
  out[8] = 0.546274 * (x * x - y * y);
  return out;
}

export interface RadianceSample {
  dir: Vec3;
  color: RGB;
  /** Fraction of the sphere's solid angle this sample stands for (all weights sum to 1). */
  weight: number;
}

/** Project radiance samples onto SH: `out` is 9 × RGB, interleaved per coefficient (27 numbers). */
export function projectSH(samples: readonly RadianceSample[], out: Float32Array | number[] = new Float32Array(SH_COUNT * 3)): Float32Array | number[] {
  const basis = new Array<number>(SH_COUNT);
  out.fill(0);
  let total = 0;
  for (const s of samples) total += s.weight;
  const k = (4 * Math.PI) / Math.max(total, 1e-9);
  for (const s of samples) {
    shBasis(s.dir, basis);
    const w = s.weight * k;
    for (let i = 0; i < SH_COUNT; i++) {
      out[i * 3] += s.color[0] * basis[i] * w;
      out[i * 3 + 1] += s.color[1] * basis[i] * w;
      out[i * 3 + 2] += s.color[2] * basis[i] * w;
    }
  }
  return out;
}

/** Irradiance (radiance convolved with the cosine lobe, as three's shader does it) at unit normal `n`. */
export function irradianceSH(sh: ArrayLike<number>, n: Vec3, out: RGB = [0, 0, 0]): RGB {
  const { x, y, z } = n;
  const f = [0.886227, 2 * 0.511664 * y, 2 * 0.511664 * z, 2 * 0.511664 * x, 2 * 0.429043 * x * y, 2 * 0.429043 * y * z, 0.743125 * z * z - 0.247708, 2 * 0.429043 * x * z, 0.429043 * (x * x - y * y)];
  for (let c = 0; c < 3; c++) {
    let v = 0;
    for (let i = 0; i < SH_COUNT; i++) v += sh[i * 3 + c] * f[i];
    out[c] = v;
  }
  return out;
}

/** Elevation bands of the sample set below: the sphere split as 2 caps, 8 ring points, 4 horizon points. */
const SIN50 = Math.sin((50 * Math.PI) / 180);
const SIN15 = Math.sin((15 * Math.PI) / 180);
export const CAP_WEIGHT = (1 - SIN50) / 2;
export const RING_WEIGHT = (SIN50 - SIN15) / 2 / 4;
export const HORIZON_WEIGHT = (2 * SIN15) / 2 / 4;
