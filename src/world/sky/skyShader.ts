/**
 * GLSL for the sky: the atmosphere (generated from the same constants as `skyModel.ts`), the
 * sky-view LUT bake, and the dome (LUT lookup, sun and moon discs, procedural stars, the Milky Way,
 * two cloud layers, horizon haze). The dome is drawn last among opaque objects at depth 1.0, so it
 * only shades pixels that no geometry covered.
 */
import { ATMOSPHERE, LIGHT_STEPS, VIEW_STEPS } from './skyModel';

const f = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : String(v));
const v3 = (a: readonly number[]) => `vec3(${a.map(f).join(', ')})`;

/** Shared atmosphere functions (kilometres; radiance per unit of top-of-atmosphere illuminance). */
export const ATMOSPHERE_GLSL = /* glsl */ `
const float A_RG = ${f(ATMOSPHERE.groundRadius)};
const float A_RT = ${f(ATMOSPHERE.topRadius)};
const float A_H0 = ${f(ATMOSPHERE.observerAltitude)};
const vec3 A_RAY = ${v3(ATMOSPHERE.rayleighScattering)};
const float A_RAY_H = ${f(ATMOSPHERE.rayleighScaleHeight)};
const float A_MIE_S = ${f(ATMOSPHERE.mieScattering)};
const float A_MIE_E = ${f(ATMOSPHERE.mieExtinction)};
const float A_MIE_H = ${f(ATMOSPHERE.mieScaleHeight)};
const vec3 A_OZONE = ${v3(ATMOSPHERE.ozoneAbsorption)};
const float A_OZ_C = ${f(ATMOSPHERE.ozoneCenter)};
const float A_OZ_W = ${f(ATMOSPHERE.ozoneHalfWidth)};
const float A_MS = ${f(ATMOSPHERE.multiScatter)};
const float A_PI = 3.141592653589793;

float aRayToSphere(float r, float mu, float R) {
  float disc = r * r * (mu * mu - 1.0) + R * R;
  if (disc < 0.0) return -1.0;
  return -r * mu + sqrt(disc);
}
float aRayToGround(float r, float mu) {
  if (mu >= 0.0) return -1.0;
  float disc = r * r * (mu * mu - 1.0) + A_RG * A_RG;
  if (disc < 0.0) return -1.0;
  return -r * mu - sqrt(disc);
}
// Extinction at altitude h; xy of 'dens' returns (rayleigh, mie) densities.
vec3 aMedia(float h, float haze, out vec2 dens) {
  float dr = exp(-h / A_RAY_H);
  float dm = exp(-h / A_MIE_H) * haze;
  float doz = max(0.0, 1.0 - abs(h - A_OZ_C) / A_OZ_W);
  dens = vec2(dr, dm);
  return A_RAY * dr + A_MIE_E * dm + A_OZONE * doz;
}
vec3 aTransmittanceToSpace(float h, float mu, float haze) {
  float r = A_RG + h;
  if (aRayToGround(r, mu) > 0.0) return vec3(0.0);
  float d = aRayToSphere(r, mu, A_RT);
  vec3 od = vec3(0.0);
  vec2 dens;
  float tPrev = 0.0;
  for (int i = 0; i < ${LIGHT_STEPS}; i++) {
    float fr = float(i + 1) / ${f(LIGHT_STEPS)};
    float t1 = d * fr * fr;
    float dt = t1 - tPrev;
    float t = (t1 + tPrev) * 0.5;
    tPrev = t1;
    float rr = sqrt(r * r + t * t + 2.0 * r * t * mu);
    od += aMedia(rr - A_RG, haze, dens) * dt;
  }
  return exp(-od);
}
float aRayleighPhase(float c) { return 3.0 / (16.0 * A_PI) * (1.0 + c * c); }
float aMiePhase(float c, float g) {
  float g2 = g * g;
  float k = 3.0 / (8.0 * A_PI) * ((1.0 - g2) / (2.0 + g2));
  return k * (1.0 + c * c) / pow(max(1e-4, 1.0 + g2 - 2.0 * g * c), 1.5);
}
vec3 aInScatter(vec3 dir, vec3 light, float haze, float g) {
  float r0 = A_RG + A_H0;
  float mu = dir.y;
  float tGround = aRayToGround(r0, mu);
  float tMax = tGround > 0.0 ? tGround : aRayToSphere(r0, mu, A_RT);
  float cosT = dot(dir, light);
  float pr = aRayleighPhase(cosT);
  float pm = aMiePhase(cosT, g);
  vec3 L = vec3(0.0);
  vec3 od = vec3(0.0);
  float tPrev = 0.0;
  vec2 dens;
  for (int i = 0; i < ${VIEW_STEPS}; i++) {
    float fr = float(i + 1) / ${f(VIEW_STEPS)};
    float t = tMax * fr * fr;
    float dt = t - tPrev;
    float tm = (t + tPrev) * 0.5;
    tPrev = t;
    float rr = sqrt(r0 * r0 + tm * tm + 2.0 * r0 * tm * mu);
    float h = rr - A_RG;
    vec3 ext = aMedia(h, haze, dens);
    vec3 e = ext * dt;
    vec3 tv = exp(-(od + e * 0.5));
    od += e;
    vec3 up = vec3(dir.x * tm, r0 + dir.y * tm, dir.z * tm);
    float muL = dot(up, light) / rr;
    vec3 tr = aTransmittanceToSpace(h, muL, haze);
    float ms = A_MS * smoothstep(-0.35, 0.1, muL);
    vec3 sr = A_RAY * dens.x;
    float sm = A_MIE_S * dens.y;
    vec3 single = (sr * pr + sm * pm) * tr;
    vec3 multi = (sr + sm) * ms * (0.25 / A_PI) * (0.35 + 0.65 * tr);
    L += (single + multi) * dt * tv;
  }
  return L;
}
`;

/** Sky-view LUT mapping (shared by the bake and the lookup). u: azimuth from the light, v: elevation. */
export const LUT_MAPPING_GLSL = /* glsl */ `
// u in [0,1] -> azimuth difference [0, pi] (denser near the light); v -> elevation (denser near the horizon).
vec2 lutToAngles(vec2 uv) {
  float az = A_PI * uv.x * uv.x;
  float s = uv.y * 2.0 - 1.0;
  float el = sign(s) * s * s * (A_PI * 0.5);
  return vec2(az, el);
}
vec2 anglesToLut(float az, float el) {
  float u = sqrt(clamp(az / A_PI, 0.0, 1.0));
  float s = sqrt(clamp(abs(el) / (A_PI * 0.5), 0.0, 1.0)) * sign(el);
  return vec2(u, s * 0.5 + 0.5);
}
`;

export const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** Bakes in-scattered radiance for a light at elevation `uLightEl` into the LUT. */
export const LUT_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uLightEl;
uniform float uHaze;
uniform float uMieG;
${ATMOSPHERE_GLSL}
${LUT_MAPPING_GLSL}
void main() {
  vec2 a = lutToAngles(vUv);
  vec3 dir = vec3(sin(a.x) * cos(a.y), sin(a.y), -cos(a.x) * cos(a.y));
  vec3 light = vec3(0.0, sin(uLightEl), -cos(uLightEl));
  gl_FragColor = vec4(aInScatter(dir, light, uHaze, uMieG), 1.0);
}
`;

const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
const mat2 ROT = mat2(0.8, -0.6, 0.6, 0.8);
float fbm5(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = ROT * p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
float fbm3(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = ROT * p * 2.03 + 17.1; a *= 0.5; }
  return s / 0.875;
}
`;

export const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

/**
 * Cloud density for a view direction (also evaluated per vertex by the bright-star points so they
 * hide behind clouds). Returns opacity in x and the raw density in y.
 */
export const CLOUD_FUNCS_GLSL = /* glsl */ `
uniform float uCloudCover;
uniform vec2 uCloudOffset;
uniform vec2 uCirrusOffset;
uniform float uCirrus;
vec2 cloudUv(vec3 dir) { return dir.xz / (dir.y + 0.12); }
float cloudDensity(vec2 uv) {
  vec2 q = uv * 1.6 + uCloudOffset;
  // Domain warp: billowy, irregular outlines instead of round blobs.
  vec2 w = vec2(vnoise(q * 0.9 + 3.1), vnoise(q * 0.9 - 7.7)) - 0.5;
  float n = fbm5(q + w * 0.9);
  float cov = uCloudCover;
  // Large-scale variation so partial cover forms banks and clear gaps.
  float region = vnoise(uv * 0.23 + uCloudOffset * 0.15);
  float th = 1.0 - cov * (0.75 + 0.5 * region) - 0.08 * cov * cov;
  // Thin cover → wispy, soft-edged fair-weather clouds; thick cover → a solid deck.
  float soft = mix(0.42, 0.14, smoothstep(0.2, 0.8, cov));
  return clamp((n - th) / soft, 0.0, 1.0);
}
float cloudOpacity(vec3 dir) {
  if (dir.y <= 0.0 || uCloudCover <= 0.001) return 0.0;
  float d = cloudDensity(cloudUv(dir));
  return clamp(1.0 - exp(-d * 5.0), 0.0, 1.0) * smoothstep(0.0, 0.08, dir.y);
}
`;

export const SKY_FRAG = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform sampler2D uSunLut;
uniform sampler2D uMoonLut;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uSunRadiance;     // top-of-atmosphere sun brightness x sky gain (scene units)
uniform vec3 uMoonRadiance;    // same for the moonlit sky
uniform vec3 uSunDisc;         // transmitted sun color x disc brightness
uniform vec3 uMoonDisc;        // transmitted moon color x disc brightness
uniform float uSunSize;        // cos of the disc radius
uniform float uMoonSize;       // radius in radians
uniform vec3 uNightZenith;
uniform vec3 uNightHorizon;
uniform mat3 uStarMatrix;      // equatorial -> game
uniform float uStars;          // star brightness (0 by day)
uniform vec3 uGalPole;         // galactic north pole, equatorial of date
uniform vec3 uGalCenter;
uniform float uTime;
uniform vec3 uCloudSun;        // sunlight on clouds
uniform vec3 uCloudAmbient;    // skylight on clouds
uniform float uCloudDark;      // 0..1 rain-cloud darkening
uniform vec3 uFogColor;        // horizon haze, matches the scene fog
uniform vec3 uFogSunColor;
uniform float uFogSunPower;
uniform float uHorizonBand;    // how high the haze climbs (0.05 clear .. 0.4 rain)
uniform vec3 uGroundColor;     // env-map lower hemisphere
uniform float uEnvMode;        // 1 while baking the environment map
uniform float uFlash;          // lightning
uniform vec3 uTwilight;        // afterglow color toward the sun's azimuth (scene units)
uniform vec3 uTwilightBelt;    // pinkish band opposite the sun
uniform float uHazeVeil;       // 0..0.6 milky veil (multiple scattering in summer haze)
${ATMOSPHERE_GLSL}
${LUT_MAPPING_GLSL}
${NOISE_GLSL}
${CLOUD_FUNCS_GLSL}

vec3 sampleLut(sampler2D lut, vec3 dir, vec3 light) {
  vec2 dh = dir.xz;
  vec2 lh = light.xz;
  float ld = length(dh) * length(lh);
  float c = ld > 1e-6 ? clamp(dot(dh, lh) / ld, -1.0, 1.0) : 1.0;
  float az = acos(c);
  float el = asin(clamp(dir.y, -1.0, 1.0));
  return texture2D(lut, anglesToLut(az, el)).rgb;
}

vec3 fogAt(vec3 dir) {
  float s = pow(max(dot(dir, uSunDir), 0.0), uFogSunPower);
  return uFogColor + uFogSunColor * s;
}

// Procedural faint stars (the catalog points supply the bright ones): one per few cells of a 3D
// grid over the celestial sphere, magnitudes drawn from N(<m) ∝ 10^(0.5 m) between 3.5 and 6.5.
// Fainter stars drown first as the sky brightens.
vec3 starField(vec3 eq, float pix, float skyLum) {
  vec3 p = eq * 64.0;
  vec3 cell = floor(p);
  vec3 h = hash33(cell);
  if (h.x > 0.16) return vec3(0.0);
  vec3 sp = cell + 0.2 + 0.6 * hash33(cell + 7.3);
  vec3 sd = normalize(sp);
  float d = length(cross(sd, eq));
  float mag = clamp(6.5 + 2.0 * log(max(h.y, 1e-4)) / log(10.0), 3.5, 6.5);
  float b = pow(10.0, -0.4 * (mag - 3.5));
  // Visible only when brighter than the sky around it.
  b *= smoothstep(1.0, 3.0, b * 0.02 / max(skyLum, 1e-5));
  float tw = 0.8 + 0.2 * sin(uTime * (1.7 + 4.0 * h.z) + h.x * 60.0);
  float t = h.z;
  vec3 tint = t < 0.12 ? vec3(1.0, 0.75, 0.55) : t < 0.3 ? vec3(1.0, 0.9, 0.8) : t > 0.82 ? vec3(0.78, 0.86, 1.0) : vec3(1.0);
  float rad = pix * 0.85;
  return tint * b * tw * smoothstep(rad, rad * 0.2, d);
}

float milkyWay(vec3 eq) {
  float lat = dot(eq, uGalPole);
  float band = exp(-lat * lat * 38.0);
  float core = pow(max(dot(eq, uGalCenter), 0.0), 3.0);
  vec2 q = vec2(atan(eq.y, eq.x) * 6.0, eq.z * 9.0);
  float n = fbm3(q * 1.7) ;
  float rift = smoothstep(0.02, 0.12, abs(lat + 0.035 * sin(q.x * 0.7))) ;
  return band * (0.35 + 0.65 * n) * mix(1.0, rift, 0.65 * core + 0.25) * (0.55 + 1.6 * core);
}

void main() {
  vec3 dir = normalize(vDir);
  float pix = length(fwidth(dir));

  // Clear-sky radiance from both LUTs plus airglow at night.
  vec3 sky = sampleLut(uSunLut, dir, uSunDir) * uSunRadiance;
  sky += sampleLut(uMoonLut, dir, uMoonDir) * uMoonRadiance;
  float up = max(dir.y, 0.0);
  sky += mix(uNightZenith, uNightHorizon, pow(1.0 - up, 3.0));
  // Afterglow: single scattering misses most of it (it needs light bent through the upper air).
  {
    vec2 dh = normalize(dir.xz + 1e-6);
    vec2 sh = normalize(uSunDir.xz + 1e-6);
    float toward = dot(dh, sh) * 0.5 + 0.5;
    sky += uTwilight * pow(toward, 4.0) * exp(-up * 9.0);
    sky += uTwilightBelt * pow(1.0 - toward, 2.0) * exp(-abs(up - 0.08) * 16.0);
  }
  float skyLum = dot(sky, vec3(0.2126, 0.7152, 0.0722));
  sky = mix(sky, vec3(skyLum) * vec3(1.04, 1.0, 0.94) * 1.12, uHazeVeil);

  vec3 col = sky;
  float vis = smoothstep(-0.01, 0.06, dir.y);   // horizon extinction for discs/stars

  if (uEnvMode < 0.5) {
    // Stars and the Milky Way, rotating with sidereal time.
    if (uStars > 0.001 && dir.y > -0.05) {
      vec3 eq = transpose(uStarMatrix) * dir;
      float starVis = uStars * vis;
      col += starField(eq, pix, skyLum) * starVis * 0.55;
      col += vec3(0.66, 0.68, 0.8) * milkyWay(eq) * starVis * 0.012 * (1.0 - smoothstep(0.002, 0.012, skyLum));
    }
    // Moon: a shaded sphere lit from the sun's direction, with faint earthshine.
    float md = acos(clamp(dot(dir, uMoonDir), -1.0, 1.0));
    if (md < uMoonSize * 1.4) {
      vec3 mr = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
      vec3 mu = cross(mr, uMoonDir);
      vec2 q = vec2(dot(dir - uMoonDir, mr), dot(dir - uMoonDir, mu)) / uMoonSize;
      float r2 = dot(q, q);
      if (r2 < 1.0) {
        // Normal of the visible (near) hemisphere: it faces back toward the viewer.
        vec3 n = q.x * mr + q.y * mu - sqrt(1.0 - r2) * uMoonDir;
        float lit = smoothstep(-0.06, 0.12, dot(n, uSunDir));
        float maria = 0.72 + 0.28 * smoothstep(0.35, 0.65, fbm3(q * 2.3 + 4.0));
        float limb = 0.75 + 0.25 * sqrt(1.0 - r2);
        float edge = smoothstep(1.0, 1.0 - pix / uMoonSize * 1.5, sqrt(r2));
        vec3 disc = uMoonDisc * maria * limb * (lit + 0.012);
        // During the day the disc is seen through the lit sky: keep it pale, not glowing.
        col = mix(col, max(col, col * 0.45 + disc), edge * vis);
      }
    }
    // Sun disc with limb darkening (HDR: bloom makes the glare).
    float cs = dot(dir, uSunDir);
    if (cs > uSunSize - 0.0004) {
      float x = clamp((1.0 - cs) / (1.0 - uSunSize), 0.0, 1.0);
      float limb = 1.0 - 0.45 * x;
      float edge = smoothstep(1.0, 0.85, x);
      col += uSunDisc * limb * edge * vis;
    }
  }

  // Clouds: a cumulus layer and high cirrus, lit by the sun (silver lining) and the sky.
  if (dir.y > 0.0 && (uCloudCover > 0.001 || uCirrus > 0.001)) {
    vec2 uv = cloudUv(dir);
    float horizon = smoothstep(0.0, 0.1, dir.y);
    float cosS = dot(dir, uSunDir);
    float silver = 0.35 * pow(max(cosS, 0.0), 6.0) + 0.9 * pow(max(cosS, 0.0), 40.0);
    if (uCirrus > 0.001) {
      vec2 cu = uv * vec2(0.55, 2.4) + uCirrusOffset;
      float c = smoothstep(0.55, 0.9, fbm3(cu * 1.3)) * smoothstep(0.3, 0.8, fbm3(cu * 5.0 + 3.0));
      float a = clamp(c * uCirrus * 0.8, 0.0, 0.45) * horizon;
      vec3 cc = uCloudAmbient * 1.1 + uCloudSun * (0.55 + 2.2 * silver);
      col = mix(col, cc, a);
    }
    if (uCloudCover > 0.001) {
      float d = cloudDensity(uv);
      if (d > 0.0) {
        vec2 toSun = normalize(uSunDir.xz + 1e-5) * 0.06;
        float ds = cloudDensity(uv + toSun);
        float shade = exp(-ds * 2.2);
        float thick = clamp(d * (1.0 + uCloudCover), 0.0, 1.0);
        vec3 lit = uCloudSun * (0.25 + 0.75 * shade) * (0.5 + 1.6 * silver * (1.0 - 0.6 * thick));
        vec3 amb = uCloudAmbient * (1.05 - 0.45 * thick);
        vec3 cc = (lit + amb) * (1.0 - uCloudDark * (0.35 + 0.45 * thick));
        // A full deck still has structure: darker rolls and lighter thin patches.
        float deckVar = fbm3(uv * 0.55 + uCloudOffset * 0.7);
        cc *= mix(1.0, 0.7 + 0.6 * deckVar, smoothstep(0.6, 1.0, uCloudCover));
        float a = clamp(1.0 - exp(-d * 5.0), 0.0, 1.0) * horizon;
        // Distant clouds fade into the haze.
        float far = clamp(1.0 - exp(-0.035 / max(dir.y, 0.01)), 0.0, 1.0);
        cc = mix(cc, fogAt(dir), far * 0.6);
        col = mix(col, cc, a);
      }
    }
  }

  // Horizon haze matching the scene fog; below the horizon it's the ground (env) or the haze.
  float band = 1.0 - smoothstep(-0.02, uHorizonBand, dir.y);
  vec3 fog = fogAt(dir);
  col = mix(col, fog, band * band);
  if (uEnvMode > 0.5) col = mix(col, uGroundColor, smoothstep(0.0, -0.08, dir.y));
  col += uFlash * vec3(0.55, 0.6, 0.75) * (0.4 + 0.6 * up);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export { NOISE_GLSL };
