/** GLSL for the post-processing pipeline (see PostFX.ts). */

export const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Bloom downsample: Jimenez's 13-tap filter (CoD: Advanced Warfare). The first pass also applies
 * exposure, a soft threshold and Karis averaging so a lone bright pixel (the sun) can't flicker.
 */
export const DOWNSAMPLE_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;        // 1 / source size
uniform float uPrefilter;   // 1 on the first pass
uniform float uThreshold;
uniform float uKnee;
uniform float uExposure;
varying vec2 vUv;
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 prefilter(vec3 c) {
  c = min(c * uExposure, vec3(4000.0));
  float br = max(c.r, max(c.g, c.b));
  float rq = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  rq = rq * rq / (4.0 * uKnee + 1e-4);
  float w = max(rq, br - uThreshold) / max(br, 1e-4);
  return c * w;
}
vec3 karis(vec3 a, vec3 b, vec3 c, vec3 d) {
  float wa = 1.0 / (1.0 + luma(a)), wb = 1.0 / (1.0 + luma(b)), wc = 1.0 / (1.0 + luma(c)), wd = 1.0 / (1.0 + luma(d));
  return (a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd);
}
void main() {
  vec2 t = uTexel;
  vec3 a = texture2D(tSrc, vUv + t * vec2(-2.0, 2.0)).rgb;
  vec3 b = texture2D(tSrc, vUv + t * vec2(0.0, 2.0)).rgb;
  vec3 c = texture2D(tSrc, vUv + t * vec2(2.0, 2.0)).rgb;
  vec3 d = texture2D(tSrc, vUv + t * vec2(-2.0, 0.0)).rgb;
  vec3 e = texture2D(tSrc, vUv).rgb;
  vec3 f = texture2D(tSrc, vUv + t * vec2(2.0, 0.0)).rgb;
  vec3 g = texture2D(tSrc, vUv + t * vec2(-2.0, -2.0)).rgb;
  vec3 h = texture2D(tSrc, vUv + t * vec2(0.0, -2.0)).rgb;
  vec3 i = texture2D(tSrc, vUv + t * vec2(2.0, -2.0)).rgb;
  vec3 j = texture2D(tSrc, vUv + t * vec2(-1.0, 1.0)).rgb;
  vec3 k = texture2D(tSrc, vUv + t * vec2(1.0, 1.0)).rgb;
  vec3 l = texture2D(tSrc, vUv + t * vec2(-1.0, -1.0)).rgb;
  vec3 m = texture2D(tSrc, vUv + t * vec2(1.0, -1.0)).rgb;
  vec3 o;
  if (uPrefilter > 0.5) {
    a = prefilter(a); b = prefilter(b); c = prefilter(c); d = prefilter(d); e = prefilter(e); f = prefilter(f);
    g = prefilter(g); h = prefilter(h); i = prefilter(i); j = prefilter(j); k = prefilter(k); l = prefilter(l); m = prefilter(m);
    o = karis(j, k, l, m) * 0.5 + karis(a, b, d, e) * 0.125 + karis(b, c, e, f) * 0.125 + karis(d, e, g, h) * 0.125 + karis(e, f, h, i) * 0.125;
  } else {
    o = (j + k + l + m) * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + e * 0.125;
  }
  gl_FragColor = vec4(o, 1.0);
}
`;

/** Bloom upsample: 9-tap tent, added onto the next larger mip (additive blending). */
export const UPSAMPLE_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uWeight;
varying vec2 vUv;
void main() {
  vec2 t = uTexel * uRadius;
  vec3 s = texture2D(tSrc, vUv + t * vec2(-1.0, 1.0)).rgb;
  s += texture2D(tSrc, vUv + t * vec2(0.0, 1.0)).rgb * 2.0;
  s += texture2D(tSrc, vUv + t * vec2(1.0, 1.0)).rgb;
  s += texture2D(tSrc, vUv + t * vec2(-1.0, 0.0)).rgb * 2.0;
  s += texture2D(tSrc, vUv).rgb * 4.0;
  s += texture2D(tSrc, vUv + t * vec2(1.0, 0.0)).rgb * 2.0;
  s += texture2D(tSrc, vUv + t * vec2(-1.0, -1.0)).rgb;
  s += texture2D(tSrc, vUv + t * vec2(0.0, -1.0)).rgb * 2.0;
  s += texture2D(tSrc, vUv + t * vec2(1.0, -1.0)).rgb;
  gl_FragColor = vec4(s * (uWeight / 16.0), 1.0);
}
`;

/**
 * Final composite: scene + bloom → exposure + tone mapping → vignette → sRGB → the grade, a 3D
 * LUT built in code (saturation, split toning: warm highlights, cool shadows, contrast) → dither.
 * TONEMAP: 0 ACES, 1 AgX, 2 Neutral. With FXAA after it, alpha carries luma.
 */
export const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tBloom;
uniform sampler2D tAo;
uniform float uAoOn;
uniform float uContact;     // strength of the contact shadows (green channel of tAo)
uniform sampler2D tShafts;
uniform float uShafts;
uniform float uBloom;
uniform float uBloomOn;
uniform float uVignette;
uniform float uAspect;
uniform float uSaturation;   // the weather's (rain is greyer); the grade proper is in the LUT
uniform highp sampler3D tLut;
uniform float uTime;
varying vec2 vUv;
#include <tonemapping_pars_fragment>
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec3 c = texture2D(tColor, vUv).rgb;
  // Ambient occlusion (gfx/post/ao.ts), before the glow is added.
  if (uAoOn > 0.5) {
    vec2 a = texture2D(tAo, vUv).rg;
    c *= a.r * mix(1.0, a.g, uContact);
  }
  if (uShafts > 0.0) c += texture2D(tShafts, vUv).rgb * uShafts;
  // Bloom was built from exposed color; un-expose so tone mapping treats both alike.
  if (uBloomOn > 0.5) c += texture2D(tBloom, vUv).rgb * (uBloom / max(toneMappingExposure, 1e-4));
  #if TONEMAP == 0
    c = ACESFilmicToneMapping(c);
  #elif TONEMAP == 1
    c = AgXToneMapping(c);
  #else
    c = NeutralToneMapping(c);
  #endif
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(mix(vec3(l), c, uSaturation), 0.0);
  vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
  c *= 1.0 - uVignette * smoothstep(0.25, 1.1, dot(q, q) * 1.9);
  c = clamp(c, 0.0, 1.0);
  vec3 s = sRGBTransferOETF(vec4(c, 1.0)).rgb;
  // The grade (gfx/post/grade.ts): a 32^3 table over the encoded colour, sampled at texel centres.
  s = texture(tLut, s * (31.0 / 32.0) + 0.5 / 32.0).rgb;
  // Triangular dither (two uniform draws): the 8-bit output has no signal-correlated error left,
  // so slow night gradients dissolve into noise instead of showing one-level steps.
  vec2 dp = gl_FragCoord.xy + fract(uTime) * 61.0;
  s += (hash(dp) + hash(dp + 17.37) - 1.0) / 255.0;
  gl_FragColor = vec4(s, dot(s, vec3(0.299, 0.587, 0.114)));
}
`;
