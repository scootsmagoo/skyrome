/**
 * Sun shafts ("god rays"), screen-space: at quarter resolution, the sky's own HDR colour near the
 * sun (so clouds, haze and the hour tint them) is smeared radially toward the sun's position on
 * screen, then added into the image before tone mapping. Wherever buildings, columns or trees
 * stand against the sun they cut dark gaps into the rays. Strongest with the sun low; off when
 * it is behind the camera, below the horizon or far off screen. High graphics tier only.
 */

/** The sky near the sun: HDR colour of sky pixels (depth at the far plane), weighted by nearness to the sun. */
export const SHAFT_MASK_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uSun;      // sun position in uv
uniform float uAspect;
uniform float uReversed;
varying vec2 vUv;
void main() {
  float d = texture2D(tDepth, vUv).x;
  float sky = uReversed > 0.5 ? step(d, 0.00001) : step(0.99999, d);
  vec2 dv = (vUv - uSun) * vec2(uAspect, 1.0);
  float near = exp(-dot(dv, dv) * 9.0);
  vec3 c = texture2D(tColor, vUv).rgb;
  gl_FragColor = vec4(min(c, vec3(8.0)) * sky * near, 1.0);
}
`;

/** Radial blur toward the sun (32 taps with decay). */
export const SHAFT_BLUR_FRAG = /* glsl */ `
uniform sampler2D tMask;
uniform vec2 uSun;
uniform float uDensity;
varying vec2 vUv;
void main() {
  const int N = 32;
  vec2 step_ = (vUv - uSun) * uDensity / float(N);
  vec2 uv = vUv;
  float w = 1.0, decay = 0.955;
  vec3 sum = vec3(0.0);
  float norm = 0.0;
  for (int i = 0; i < N; i++) {
    sum += texture2D(tMask, uv).rgb * w;
    norm += w;
    w *= decay;
    uv -= step_;
  }
  gl_FragColor = vec4(sum / norm, 1.0);
}
`;
