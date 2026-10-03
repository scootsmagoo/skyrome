/**
 * Physically based atmosphere (single scattering + an approximate multiple-scattering term),
 * after Hillaire, "A Scalable and Production Ready Sky and Atmosphere Rendering Technique" (2020).
 *
 * This TypeScript version is mirrored by the GLSL in `skyShader.ts` (keep the constants and the
 * integration identical). The GPU bakes it into a small sky-view LUT for the dome; the CPU calls it
 * for a handful of directions per update to derive everything that has to MATCH the rendered sky:
 * fog colors at the horizon, sun and moon light colors, cloud and hemisphere light colors.
 *
 * Lengths are in kilometres. Radiance is per unit of top-of-atmosphere illuminance, so the caller
 * multiplies by the sun's (or moon's) brightness in scene units.
 */
import type { Vec3 } from './astronomy';

export type RGB = [number, number, number];

export const ATMOSPHERE = {
  groundRadius: 6360,
  topRadius: 6460,
  /** Observer altitude (Rome's valleys are ~15–50 m above the sea). */
  observerAltitude: 0.05,
  rayleighScattering: [5.802e-3, 13.558e-3, 33.1e-3] as RGB,
  rayleighScaleHeight: 8,
  mieScattering: 3.996e-3,
  mieExtinction: 4.44e-3,
  mieScaleHeight: 1.2,
  ozoneAbsorption: [0.65e-3, 1.881e-3, 0.085e-3] as RGB,
  ozoneCenter: 25,
  ozoneHalfWidth: 15,
  /** Multiple-scattering boost (isotropic, fraction of single-scattered light). */
  multiScatter: 0.32,
  groundAlbedo: 0.3,
};

export interface AtmosParams {
  /** Multiplies the Mie (aerosol) density: 1 = clean, 3 = summer haze, 6 = smoky/overcast murk. */
  haze: number;
  /** Mie anisotropy (forward scattering around the sun). */
  mieG: number;
}

export const VIEW_STEPS = 24;
export const LIGHT_STEPS = 10;

const PI = Math.PI;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const luminance = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** Distance from radius `r` along a ray with cos(zenith) `mu` to the sphere of radius `R` (outer hit), or -1. */
function rayToSphere(r: number, mu: number, R: number): number {
  const disc = r * r * (mu * mu - 1) + R * R;
  if (disc < 0) return -1;
  return -r * mu + Math.sqrt(disc);
}

/** Distance to the ground (first hit) or -1 if the ray misses it. */
function rayToGround(r: number, mu: number): number {
  if (mu >= 0) return -1;
  const Rg = ATMOSPHERE.groundRadius;
  const disc = r * r * (mu * mu - 1) + Rg * Rg;
  if (disc < 0) return -1;
  return -r * mu - Math.sqrt(disc);
}

/** Extinction coefficients (per km) at altitude h, written into `out`; returns the scattering split. */
function media(h: number, haze: number, ext: RGB): { rayleigh: number; mie: number } {
  const A = ATMOSPHERE;
  const dr = Math.exp(-h / A.rayleighScaleHeight);
  const dm = Math.exp(-h / A.mieScaleHeight) * haze;
  const doz = Math.max(0, 1 - Math.abs(h - A.ozoneCenter) / A.ozoneHalfWidth);
  for (let i = 0; i < 3; i++) ext[i] = A.rayleighScattering[i] * dr + A.mieExtinction * dm + A.ozoneAbsorption[i] * doz;
  return { rayleigh: dr, mie: dm };
}

const extTmp: RGB = [0, 0, 0];

/** Transmittance from altitude h (km) toward a direction with cos(zenith) mu, to space. 0 if the ground blocks it. */
export function transmittanceToSpace(h: number, mu: number, haze: number, out: RGB = [0, 0, 0]): RGB {
  const r = ATMOSPHERE.groundRadius + h;
  if (rayToGround(r, mu) > 0) {
    out[0] = out[1] = out[2] = 0;
    return out;
  }
  const d = rayToSphere(r, mu, ATMOSPHERE.topRadius);
  let o0 = 0, o1 = 0, o2 = 0;
  let tPrev = 0;
  for (let i = 0; i < LIGHT_STEPS; i++) {
    // Quadratic steps: the dense low air (and the 1.2 km aerosol layer) gets most samples.
    const f = (i + 1) / LIGHT_STEPS;
    const t1 = d * f * f;
    const dt = t1 - tPrev;
    const t = (t1 + tPrev) * 0.5;
    tPrev = t1;
    const rr = Math.sqrt(r * r + t * t + 2 * r * t * mu);
    media(rr - ATMOSPHERE.groundRadius, haze, extTmp);
    o0 += extTmp[0] * dt;
    o1 += extTmp[1] * dt;
    o2 += extTmp[2] * dt;
  }
  out[0] = Math.exp(-o0);
  out[1] = Math.exp(-o1);
  out[2] = Math.exp(-o2);
  return out;
}

export const rayleighPhase = (c: number) => (3 / (16 * PI)) * (1 + c * c);
/** Cornette-Shanks phase function (Hillaire's choice for Mie). */
export function miePhase(c: number, g: number): number {
  const g2 = g * g;
  const k = 3 / (8 * PI) * ((1 - g2) / (2 + g2));
  return (k * (1 + c * c)) / Math.pow(Math.max(1e-4, 1 + g2 - 2 * g * c), 1.5);
}

const trTmp: RGB = [0, 0, 0];

/**
 * In-scattered radiance toward the observer from direction `dir` for a light from `light`, per unit
 * of top-of-atmosphere illuminance. Directions below the horizon integrate up to the ground.
 */
export function inScatter(dir: Vec3, light: Vec3, p: AtmosParams, out: RGB = [0, 0, 0]): RGB {
  const A = ATMOSPHERE;
  const r0 = A.groundRadius + A.observerAltitude;
  const mu = dir.y;
  const tGround = rayToGround(r0, mu);
  const tMax = tGround > 0 ? tGround : rayToSphere(r0, mu, A.topRadius);
  const cosT = dir.x * light.x + dir.y * light.y + dir.z * light.z;
  const pr = rayleighPhase(cosT);
  const pm = miePhase(cosT, p.mieG);
  let l0 = 0, l1 = 0, l2 = 0;
  let od0 = 0, od1 = 0, od2 = 0;
  let tPrev = 0;
  for (let i = 0; i < VIEW_STEPS; i++) {
    // Quadratic distribution: dense near the eye where the air is thickest.
    const f = (i + 1) / VIEW_STEPS;
    const t = tMax * f * f;
    const dt = t - tPrev;
    const tm = (t + tPrev) * 0.5;
    tPrev = t;
    const rr = Math.sqrt(r0 * r0 + tm * tm + 2 * r0 * tm * mu);
    const h = rr - A.groundRadius;
    const m = media(h, p.haze, extTmp);
    // Transmittance from the eye to the sample (midpoint rule).
    const e0 = extTmp[0] * dt, e1 = extTmp[1] * dt, e2 = extTmp[2] * dt;
    const tv0 = Math.exp(-(od0 + e0 * 0.5)), tv1 = Math.exp(-(od1 + e1 * 0.5)), tv2 = Math.exp(-(od2 + e2 * 0.5));
    od0 += e0;
    od1 += e1;
    od2 += e2;
    // Sun at the sample: cos of its zenith angle there.
    const upx = dir.x * tm, upy = r0 + dir.y * tm, upz = dir.z * tm;
    const muL = (upx * light.x + upy * light.y + upz * light.z) / rr;
    transmittanceToSpace(h, muL, p.haze, trTmp);
    const ms = A.multiScatter * smoothstep(-0.35, 0.1, muL);
    for (let c = 0; c < 3; c++) {
      const sr = A.rayleighScattering[c] * m.rayleigh;
      const sm = A.mieScattering * m.mie;
      const single = (sr * pr + sm * pm) * trTmp[c];
      const multi = (sr + sm) * ms * (0.25 / PI) * (0.35 + 0.65 * trTmp[c]);
      const v = (single + multi) * dt * (c === 0 ? tv0 : c === 1 ? tv1 : tv2);
      if (c === 0) l0 += v;
      else if (c === 1) l1 += v;
      else l2 += v;
    }
  }
  out[0] = l0;
  out[1] = l1;
  out[2] = l2;
  return out;
}

/** Color of the sun (or moon) disc seen from the observer: top-of-atmosphere light × transmittance. */
export function lightTransmittance(light: Vec3, haze: number, out: RGB = [0, 0, 0]): RGB {
  return transmittanceToSpace(ATMOSPHERE.observerAltitude, light.y, haze, out);
}
