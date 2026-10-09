/**
 * Turns sun/moon positions and the weather into every lighting number the scene uses (pure, no
 * Three.js): key light (sun or moon), hemisphere fill, fog, sky-dome uniforms, target exposure and
 * whether lamps are lit. The atmosphere model makes colors physically consistent; the constants
 * here are the art direction (keep the scene-unit scale described in skyModel.ts).
 */
import type { Vec3 } from './astronomy';
import { ATMOSPHERE, type AtmosParams, type RGB, inScatter, lightTransmittance, luminance, smoothstep, transmittanceToSpace } from './skyModel';
import type { WeatherParams } from './weather';

/** Top-of-atmosphere sun brightness: a white wall facing a noon sun reads ≈ 0.85 before exposure. */
export const SUN_ILLUMINANCE = 3.4;
/** Brightness of a full moon high in the sky (scene units; artistic, ~1/10 of the sun so nights stay playable). */
export const MOON_ILLUMINANCE = 0.24;
/** The visible sky is brighter than physical single scattering suggests (multiple scattering, eye). */
export const SKY_GAIN = 3.6;
/** Night fill so moonless nights are dark but playable. */
export const NIGHT_FILL = 0.045;
/** The moonlit sky is shown darker than the sunlit one (night vision is dim and blue-grey). */
export const MOON_SKY_GAIN = 0.5;
/** Sun disc radiance multiplier (HDR, feeds bloom). */
export const SUN_DISC = 60;
/** Exposure at noon, and the limits of eye adaptation. */
export const EXPOSURE = { reference: 2.1, power: 0.42, min: 0.55, max: 3 };

export interface Lighting {
  /** Unit vector toward the key light (sun by day, moon by night). */
  keyDir: Vec3;
  keyIsMoon: boolean;
  /** Linear color with max component 1. */
  keyColor: RGB;
  keyIntensity: number;
  shadowIntensity: number;

  hemiSky: RGB;
  hemiGround: RGB;
  hemiIntensity: number;
  /** Multiplier for scene.environmentIntensity. */
  envIntensity: number;

  fogColor: RGB;
  fogSunColor: RGB;
  fogSunPower: number;
  /** The air's colour looking well above the horizon (sky at ~35°, a touch milky), and how much of it rays that climb take on. */
  fogUp: RGB;
  fogUpWeight: number;
  /** Extinction at the base height, 1/m. */
  fogDensity: number;
  /** Height falloff of the fog density, 1/m. */
  fogFalloff: number;
  fogBaseHeight: number;
  /** Height above the horizon (sin elevation) that the haze reaches in the dome. */
  horizonBand: number;

  // Sky dome
  sunRadiance: number;
  moonRadiance: number;
  sunDisc: RGB;
  moonDisc: RGB;
  stars: number;
  cloudSun: RGB;
  cloudAmbient: RGB;
  groundColor: RGB;
  nightZenith: RGB;
  nightHorizon: RGB;
  /** Afterglow toward the sun's azimuth after sunset, and the pink band opposite. */
  twilight: RGB;
  twilightBelt: RGB;
  /** 0..0.5: how milky the sky is (summer haze). */
  hazeVeil: number;

  /** Target exposure (before adaptation smoothing). */
  exposure: number;
  /** 0 = lamps out, 1 = lamps fully lit (dusk to dawn, or under dark skies). */
  lampFactor: number;
  /** 0 at night, 1 in full daylight. */
  daylight: number;
  /** Sky irradiance on a horizontal surface (scene units) – handy for other modules. */
  skyIrradiance: number;
}

export interface LightingInput {
  sun: Vec3;
  moon: Vec3;
  moonIllumination: number;
  /** Local solar hour (0..24), for hearth smoke and morning mist. */
  hour: number;
  weather: WeatherParams;
  mieG?: number;
}

/** Elevation (radians) whose sky color the fog takes; the dome blends to fog below it. */
const FOG_ELEVATION = 0.14;
const NIGHT_ZENITH: RGB = [0.0011, 0.0018, 0.0042];
const NIGHT_HORIZON: RGB = [0.0032, 0.004, 0.0064];
const GROUND_ALBEDO: RGB = [0.34, 0.29, 0.22];

const tmp: RGB = [0, 0, 0];
const tmp2: RGB = [0, 0, 0];

const normMax = (c: RGB, out: RGB): RGB => {
  const m = Math.max(c[0], c[1], c[2], 1e-9);
  out[0] = c[0] / m;
  out[1] = c[1] / m;
  out[2] = c[2] / m;
  return out;
};

/** Top-of-atmosphere moon brightness (scene units) for its phase; falls off faster than the lit fraction (opposition effect). */
export function moonBrightness(illumination: number): number {
  return MOON_ILLUMINANCE * Math.pow(illumination, 1.6);
}

/** A direction toward a point on the horizon at azimuth offset `az` (radians) from `ref`'s azimuth, raised by `el`. */
function horizonDir(ref: Vec3, az: number, el: number): Vec3 {
  const base = Math.atan2(ref.x, -ref.z);
  const a = base + az;
  return { x: Math.sin(a) * Math.cos(el), y: Math.sin(el), z: -Math.cos(a) * Math.cos(el) };
}

/** Sky radiance (scene units, with gain) toward `dir` from both lights and the night airglow. */
export function skyColor(dir: Vec3, inp: LightingInput, atm: AtmosParams, moonLight: number, out: RGB): RGB {
  inScatter(dir, inp.sun, atm, out);
  const s = SUN_ILLUMINANCE * SKY_GAIN;
  out[0] *= s;
  out[1] *= s;
  out[2] *= s;
  if (moonLight > 0 && inp.moon.y > -0.1) {
    inScatter(dir, inp.moon, atm, tmp2);
    const m = moonLight * SKY_GAIN * MOON_SKY_GAIN;
    out[0] += tmp2[0] * m;
    out[1] += tmp2[1] * m;
    out[2] += tmp2[2] * m;
  }
  const h = Math.pow(1 - Math.max(0, dir.y), 3);
  for (let i = 0; i < 3; i++) out[i] += NIGHT_ZENITH[i] + (NIGHT_HORIZON[i] - NIGHT_ZENITH[i]) * h;
  return out;
}

/** Afterglow radiance toward the sun after sunset: orange-yellow, deepening to red, gone by −12°. */
export function twilightGlow(sunY: number, out: RGB): RGB {
  const d = Math.max(0, -sunY);
  const amp = 0.2 * Math.exp(-d * 16) * smoothstep(0.04, -0.01, sunY);
  const deep = smoothstep(0.02, 0.12, d);
  out[0] = amp;
  out[1] = amp * (0.55 - 0.22 * deep);
  out[2] = amp * (0.22 - 0.1 * deep);
  return out;
}

export function computeLighting(inp: LightingInput, out?: Lighting): Lighting {
  const w = inp.weather;
  const atm: AtmosParams = { haze: w.haze, mieG: inp.mieG ?? 0.8 };
  const sun = inp.sun;
  const moon = inp.moon;

  const sunT = lightTransmittance(sun, w.haze, [0, 0, 0]);
  const moonT = lightTransmittance(moon, w.haze, [0, 0, 0]);
  const moonLight = moonBrightness(inp.moonIllumination);

  // --- Sky samples: zenith, a ring at 35°, the horizon sideways/toward the sun.
  const zen = skyColor({ x: 0, y: 1, z: 0 }, inp, atm, moonLight, [0, 0, 0]);
  const ring: RGB = [0, 0, 0];
  for (let k = 0; k < 4; k++) {
    skyColor(horizonDir(sun, (k * Math.PI) / 2 + Math.PI / 4, 0.6), inp, atm, moonLight, tmp);
    ring[0] += tmp[0] / 4;
    ring[1] += tmp[1] / 4;
    ring[2] += tmp[2] / 4;
  }
  const side = skyColor(horizonDir(sun, Math.PI / 2, 0.03), inp, atm, moonLight, [0, 0, 0]);
  const toward = skyColor(horizonDir(sun, 0, 0.03), inp, atm, moonLight, [0, 0, 0]);
  const away = skyColor(horizonDir(sun, Math.PI, 0.03), inp, atm, moonLight, [0, 0, 0]);
  // Fog color: the sky a little above the horizon. Game fog spans hundreds of metres, not the
  // infinite path of the 0° horizon, so its in-scatter is bluer (aerial perspective).
  const side8 = skyColor(horizonDir(sun, Math.PI / 2, FOG_ELEVATION), inp, atm, moonLight, [0, 0, 0]);
  const away8 = skyColor(horizonDir(sun, Math.PI, FOG_ELEVATION), inp, atm, moonLight, [0, 0, 0]);
  const toward5 = skyColor(horizonDir(sun, 0, 0.09), inp, atm, moonLight, [0, 0, 0]);

  // Cosine-weighted average sky radiance (crude quadrature) and irradiance on a horizontal surface.
  const avgSky: RGB = [0, 0, 0];
  for (let i = 0; i < 3; i++) avgSky[i] = zen[i] * 0.3 + ring[i] * 0.5 + (side[i] + away[i] + toward[i]) * (0.2 / 3);

  // --- Clouds: how much they cover and how dark they are.
  const cover = w.cloudCover;
  const overcast = smoothstep(0.55, 0.98, cover);
  const sunVis = smoothstep(-0.035, 0.02, sun.y);

  // Sun as seen from a cloud ~2 km up: still lit a little after sunset, giving pink undersides.
  const cloudT = transmittanceToSpace(2.0, sun.y + 0.035, w.haze, [0, 0, 0]);
  const cloudLitBySun = smoothstep(-0.09, -0.01, sun.y);
  const cloudSun: RGB = [0, 0, 0];
  for (let i = 0; i < 3; i++) cloudSun[i] = cloudT[i] * SUN_ILLUMINANCE * 0.32 * cloudLitBySun + moonT[i] * moonLight * 0.32;
  const cloudAmbient: RGB = [0, 0, 0];
  for (let i = 0; i < 3; i++) cloudAmbient[i] = avgSky[i] * 0.85 + (zen[i] + ring[i]) * 0.1;

  // An overcast deck replaces the blue sky: diffuse grey whose brightness follows the light above it.
  const deck: RGB = [0, 0, 0];
  const lightAbove = luminance(sunT) * SUN_ILLUMINANCE * Math.max(0, sun.y + 0.05) + moonLight * luminance(moonT) * Math.max(0, moon.y);
  const deckLum = 0.085 * lightAbove + 0.03 * luminance(avgSky) + NIGHT_FILL * 0.02;
  const darkK = 1 - w.cloudDark * 0.6;
  for (let i = 0; i < 3; i++) deck[i] = deckLum * darkK * [0.93, 0.97, 1.04][i];

  // Effective sky (what the IBL and fill see): blend clear sky toward the deck by cover.
  const effSky: RGB = [0, 0, 0];
  const cloudy = Math.min(1, overcast + cover * 0.25);
  for (let i = 0; i < 3; i++) effSky[i] = avgSky[i] * (1 - cloudy) + deck[i] * cloudy;
  const skyIrr = Math.PI * luminance(effSky);

  // --- Key light.
  const sunKeyW = sunVis;
  const sunDirect = SUN_ILLUMINANCE * luminance(sunT) * w.sun * (1 - overcast * 0.85);
  const useMoon = sun.y < -0.035;
  const moonVis = smoothstep(0.0, 0.12, moon.y) * (1 - smoothstep(-0.12, -0.03, sun.y));
  const keyColor: RGB = [1, 1, 1];
  let keyIntensity: number;
  let keyDir: Vec3;
  let shadow: number;
  if (!useMoon) {
    normMax(sunT, keyColor);
    // A touch of extra warmth: Roman travertine in sunlight should glow.
    keyColor[1] *= 0.985;
    keyColor[2] *= 0.94;
    keyIntensity = sunDirect * sunKeyW;
    keyDir = { ...sun };
    shadow = w.shadow * smoothstep(-0.02, 0.07, sun.y) * (1 - overcast * 0.7);
  } else if (moon.y > 0.0) {
    normMax(moonT, keyColor);
    // Moonlight reads as cool blue (Purkinje shift).
    keyColor[0] *= 0.62;
    keyColor[1] *= 0.78;
    normMax(keyColor, keyColor);
    keyIntensity = moonLight * luminance(moonT) * w.sun * moonVis * (1 - overcast * 0.85);
    keyDir = { ...moon };
    shadow = 0.75 * w.shadow * moonVis * (1 - overcast * 0.8);
  } else {
    // Moon down: a faint high "starlight" key keeps form readable without visible shadows.
    keyColor[0] = 0.55;
    keyColor[1] = 0.68;
    keyColor[2] = 1;
    keyIntensity = 0.015;
    const a = Math.atan2(moon.x, -moon.z);
    keyDir = { x: Math.sin(a) * 0.5, y: 0.866, z: -Math.cos(a) * 0.5 };
    shadow = 0;
  }

  // --- Hemisphere fill (the IBL does most of the ambient; this adds ground bounce and night fill).
  const night = 1 - smoothstep(-0.2, -0.02, sun.y);
  const directH = sunDirect * Math.max(0, sun.y) * sunKeyW + moonLight * luminance(moonT) * Math.max(0, moon.y);
  const groundRad: RGB = [0, 0, 0];
  for (let i = 0; i < 3; i++) groundRad[i] = (GROUND_ALBEDO[i] * (directH * normMax(sunT, tmp)[i] + skyIrr)) / Math.PI;
  const hemiSky: RGB = normMax(effSky, [0, 0, 0]);
  const hemiGround: RGB = normMax(groundRad, [0, 0, 0]);
  const nightFill = NIGHT_FILL * night * (1 - 0.4 * overcast);
  // Night fill is blue-grey moonlit air.
  for (let i = 0; i < 3; i++) hemiSky[i] = hemiSky[i] * (1 - night) + [0.62, 0.72, 1][i] * night;
  const hemiIntensity = 0.12 * skyIrr + 0.35 * luminance(groundRad) * Math.PI + nightFill * Math.PI;

  // Milky veil of summer haze (multiple scattering the single-scattering LUT lacks).
  const hazeVeil = Math.min(0.5, Math.max(0, (w.haze - 3.5) / 25));

  // --- Afterglow (added in the dome and the fog; single scattering misses it).
  const twilight = twilightGlow(sun.y, [0, 0, 0]);
  const belt: RGB = [0, 0, 0];
  const beltK = smoothstep(-0.1, -0.015, sun.y) * smoothstep(0.03, -0.005, sun.y) * 0.03;
  belt[0] = 0.62 * beltK;
  belt[1] = 0.4 * beltK;
  belt[2] = 0.5 * beltK;
  for (let i = 0; i < 3; i++) {
    twilight[i] *= 1 - cloudy * 0.85;
    belt[i] *= 1 - cloudy * 0.9;
  }

  // --- Fog: horizon sky color, warm in-scatter toward the sun.
  const fogColor: RGB = [0, 0, 0];
  const fogSun: RGB = [0, 0, 0];
  const clearFog: RGB = [0, 0, 0];
  for (let i = 0; i < 3; i++) clearFog[i] = side8[i] * 0.55 + away8[i] * 0.45;
  // A little desaturation and warmth: Mediterranean haze is milky, not cyan.
  const cl = luminance(clearFog);
  const veilFog = Math.min(0.85, 0.2 + hazeVeil * 1.3);
  for (let i = 0; i < 3; i++) clearFog[i] = (clearFog[i] * (1 - veilFog) + cl * veilFog) * [1.03, 1.0, 0.95][i];
  for (let i = 0; i < 3; i++) {
    fogColor[i] = clearFog[i] * (1 - cloudy) + deck[i] * 1.05 * cloudy;
    fogSun[i] = Math.max(0, toward5[i] - clearFog[i]) * (1 - cloudy * 0.9) + twilight[i] * 0.9;
    fogColor[i] += belt[i] * 0.5;
  }
  // Keep the sunward glow from turning the whole low view into a bright smear.
  const sunGlowMax = 2.2 * luminance(fogColor) + 0.02;
  const sg = luminance(fogSun);
  if (sg > sunGlowMax) for (let i = 0; i < 3; i++) fogSun[i] *= sunGlowMax / sg;
  // Looking up through the air you see the sky's own colour, not the haze band at the horizon.
  const fogUp: RGB = [0, 0, 0];
  const ringL = luminance(ring);
  for (let i = 0; i < 3; i++) fogUp[i] = ring[i] * (1 - veilFog * 0.5) + ringL * veilFog * 0.5;
  // Hearth smoke over the city at dawn and dusk, mist in the valleys around sunrise.
  const h = inp.hour;
  const smoke = Math.exp(-Math.pow((h - 7) / 1.4, 2)) * 0.55 + Math.exp(-Math.pow((h - 19.5) / 1.6, 2)) * 0.45;
  const mist = Math.exp(-Math.pow((h - 5.6) / 1.2, 2));
  const fogDensity = w.fog * (1 + smoke * (1 - w.rain * 0.5)) * (1 + mist * 1.6);
  const fogFalloff = 0.012 + mist * 0.05;

  // --- Exposure: partial eye adaptation to the scene's light level.
  const sceneLight = keyIntensity * 0.5 + skyIrr * 0.55 + nightFill * 2.5 + 1e-4;
  const exposure = Math.min(EXPOSURE.max, Math.max(EXPOSURE.min, Math.pow(EXPOSURE.reference / sceneLight, EXPOSURE.power)));

  // --- Lamps come on at dusk, earlier under dark skies.
  const gloom = w.cloudDark * 0.12 + overcast * 0.03;
  const lampFactor = 1 - smoothstep(-0.03, 0.08, sun.y - gloom);
  const daylight = smoothstep(-0.1, 0.1, sun.y);

  const sunDisc: RGB = [sunT[0] * SUN_DISC, sunT[1] * SUN_DISC, sunT[2] * SUN_DISC];
  const zenLum = luminance(zen);
  const moonDiscB = 1.5 * (1 - daylight) + Math.min(1.2, zenLum * 1.8) * daylight;
  const moonDisc: RGB = normMax(moonT, [0, 0, 0]);
  for (let i = 0; i < 3; i++) moonDisc[i] *= moonDiscB * [0.98, 0.98, 1.0][i];

  const stars = (1 - smoothstep(-0.2, -0.06, sun.y)) * 0.25 + (1 - smoothstep(-0.12, -0.02, sun.y)) * 0.75;

  const groundColor: RGB = [groundRad[0], groundRad[1], groundRad[2]];

  const res: Lighting = out ?? ({} as Lighting);
  res.keyDir = keyDir;
  res.keyIsMoon = useMoon;
  res.keyColor = keyColor;
  res.keyIntensity = keyIntensity;
  res.shadowIntensity = shadow;
  res.hemiSky = hemiSky;
  res.hemiGround = hemiGround;
  res.hemiIntensity = hemiIntensity;
  res.envIntensity = 1;
  res.fogColor = fogColor;
  res.fogSunColor = fogSun;
  res.fogSunPower = 9;
  res.fogUp = fogUp;
  res.fogUpWeight = 0.75 * (1 - cloudy);
  res.fogDensity = fogDensity;
  res.fogFalloff = fogFalloff;
  res.fogBaseHeight = 0;
  res.horizonBand = FOG_ELEVATION + 0.25 * cloudy * cloudy + Math.min(0.12, w.fog * 20);
  res.sunRadiance = SUN_ILLUMINANCE * SKY_GAIN;
  res.moonRadiance = moon.y > -0.1 ? moonLight * SKY_GAIN * MOON_SKY_GAIN : 0;
  res.sunDisc = sunDisc;
  res.moonDisc = moonDisc;
  res.stars = stars * (1 - cloudy * 0.5);
  res.cloudSun = cloudSun;
  res.cloudAmbient = cloudAmbient;
  res.groundColor = groundColor;
  res.nightZenith = NIGHT_ZENITH;
  res.nightHorizon = NIGHT_HORIZON;
  res.twilight = twilight;
  res.twilightBelt = belt;
  res.hazeVeil = hazeVeil;
  res.exposure = exposure;
  res.lampFactor = lampFactor;
  res.daylight = daylight;
  res.skyIrradiance = skyIrr;
  return res;
}

export { ATMOSPHERE };
