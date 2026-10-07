/**
 * The one shared material for every procedural character, weapon and shield.
 *
 * MeshStandardMaterial with vertex colors, extended (onBeforeCompile) to read a per-vertex `surf`
 * attribute: roughness, metalness, a pattern id and emissive strength. Patterns add procedural
 * micro-detail computed from the bind-pose position, so they stick to the skin while it animates:
 *   mail  — rows of interlocking rings (lorica hamata)
 *   scale — overlapping scales (lorica squamata)
 *   wool  — soft mottling and a fine weave
 *   linen — finer, flatter weave
 *   hair  — strands flowing down from the crown
 *   leather / plate — faint grain, hammer marks
 *   skin  — soft blotches and a little roughness variation
 * Cloth also gets shading along the folds it hangs in, and cloth and skin a film of street dust
 * toward the feet (bind-pose height; the avatar is built standing on y = 0).
 * Details fade out with distance (screen-space derivatives) so they never shimmer.
 *
 * Metals look best with `scene.environment` set (the sky module provides one); without it they
 * still read through their vertex color because metalness tops out below 1 for iron.
 */
import * as THREE from 'three';

let shared: THREE.MeshStandardMaterial | null = null;
let flame: THREE.ShaderMaterial | null = null;

const VERT_PARS = /* glsl */ `
attribute vec4 surf;
varying vec4 vSurf;
flat varying float vPat;
varying vec3 vRest;
varying vec3 vRestN;
`;

const VERT_MAIN = /* glsl */ `
vSurf = surf;
vPat = floor(surf.z * 255.0 + 0.5);
vRest = position;
vRestN = normal;
`;

const FRAG_PARS = /* glsl */ `
varying vec4 vSurf;
flat varying float vPat;
varying vec3 vRest;
varying vec3 vRestN;

float av_hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float av_noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(av_hash(i), av_hash(i + vec2(1.0, 0.0)), u.x), mix(av_hash(i + vec2(0.0, 1.0)), av_hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// 2D surface coordinates from the bind pose: pick the projection plane by the rest normal.
vec2 av_uv() {
  vec3 n = abs(normalize(vRestN));
  if (n.y > 0.75) return vRest.xz;
  return vec2(n.x > n.z ? vRest.z * sign(vRestN.x) : vRest.x * -sign(vRestN.z), vRest.y);
}
vec3 av_perturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
  vec3 vSigmaX = normalize(dFdx(surf_pos.xyz));
  vec3 vSigmaY = normalize(dFdy(surf_pos.xyz));
  vec3 vN = surf_norm;
  vec3 R1 = cross(vSigmaY, vN);
  vec3 R2 = cross(vN, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDirection;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}
`;

// Computes avH (height for bump), avTint (albedo multiplier) and avRough (roughness offset).
const FRAG_PATTERN = /* glsl */ `
float avPat = vPat;
float avH = 0.0;
float avTint = 1.0;
float avRough = 0.0;
float avBump = 0.0;
float avDust = 0.0;
{
  vec2 uv = av_uv();
  bool avCloth = (avPat > 2.5 && avPat < 3.5) || (avPat > 4.5 && avPat < 5.5);
  if (avCloth) {
    // Folds: long soft creases running down (around the body's vertical axis), deeper low down
    // where a tunic or toga hangs free.
    float ang = atan(vRest.x, vRest.z);
    float fold = av_noise(vec2(ang * 6.0, vRest.y * 1.1)) * 0.65 + av_noise(vec2(ang * 15.0, vRest.y * 2.3 + 7.0)) * 0.35;
    float hang = 1.0 - smoothstep(0.7, 1.4, vRest.y);
    avTint *= 1.0 - (0.08 + 0.1 * hang) * (1.0 - fold);
  }
  if (avCloth || (avPat > 7.5 && avPat < 8.5)) {
    float top = 0.24 + 0.18 * av_noise(uv * 9.0);
    avDust = (1.0 - smoothstep(0.02, top, vRest.y)) * 0.28;
  }
  if (avPat > 0.5 && avPat < 1.5) {
    // Mail: staggered rings, ~7 mm.
    vec2 g = uv / 0.0075;
    g.x += 0.5 * mod(floor(g.y), 2.0);
    vec2 f = fract(g) - 0.5;
    float r = length(f * vec2(1.0, 1.25));
    float ring = smoothstep(0.18, 0.3, r) * (1.0 - smoothstep(0.38, 0.5, r));
    float fade = 1.0 - smoothstep(0.25, 0.7, length(fwidth(g)));
    avH = ring * fade;
    avTint = mix(0.78, 0.6 + 0.5 * ring, fade);
    avRough = (1.0 - ring) * 0.25 * fade;
    avBump = 0.9;
  } else if (avPat > 1.5 && avPat < 2.5) {
    // Scales: rows overlapping downward, ~14 x 20 mm.
    vec2 g = uv / vec2(0.014, 0.018);
    g.x += 0.5 * mod(floor(g.y), 2.0);
    vec2 f = fract(g);
    float d = length((f - vec2(0.5, 0.95)) * vec2(1.0, 0.85));
    float scale = 1.0 - smoothstep(0.42, 0.55, d);
    float h = scale * (1.0 - f.y * 0.8);
    float fade = 1.0 - smoothstep(0.25, 0.7, length(fwidth(g)));
    avH = h * fade;
    avTint = mix(0.82, 0.62 + 0.55 * h, fade);
    avBump = 1.2;
  } else if (avPat > 2.5 && avPat < 3.5) {
    // Wool: blotchy mottling + coarse weave.
    float m = av_noise(uv * 18.0) * 0.6 + av_noise(uv * 55.0) * 0.4;
    vec2 g = uv / 0.004;
    float fade = 1.0 - smoothstep(0.3, 0.8, length(fwidth(g)));
    float weave = (sin(g.x * 3.1416) * sin(g.y * 3.1416)) * 0.5 + 0.5;
    avTint = 0.9 + 0.16 * m + 0.06 * (weave - 0.5) * fade;
    avH = (m * 0.6 + weave * 0.4 * fade);
    avBump = 0.25;
  } else if (avPat > 4.5 && avPat < 5.5) {
    // Linen: fine and flat.
    float m = av_noise(uv * 30.0);
    vec2 g = uv / 0.0025;
    float fade = 1.0 - smoothstep(0.3, 0.8, length(fwidth(g)));
    float weave = (sin(g.x * 3.1416) * sin(g.y * 3.1416)) * 0.5 + 0.5;
    avTint = 0.94 + 0.1 * m + 0.05 * (weave - 0.5) * fade;
    avH = weave * fade;
    avBump = 0.12;
  } else if (avPat > 3.5 && avPat < 4.5) {
    // Hair: strands running from the crown down (longitude stripes around the vertical axis).
    float ang = atan(vRest.x, vRest.z);
    vec2 g = vec2(ang * 70.0, vRest.y * 6.0);
    float s = av_noise(vec2(g.x, g.y)) * 0.6 + av_noise(vec2(g.x * 3.1, g.y * 2.0)) * 0.4;
    float fade = 1.0 - smoothstep(0.4, 1.2, length(fwidth(g)));
    avTint = mix(1.0, 0.72 + 0.5 * s, fade);
    avH = s * fade;
    avRough = -0.1 * s;
    avBump = 0.6;
  } else if (avPat > 5.5 && avPat < 6.5) {
    // Leather / wood grain.
    float m = av_noise(uv * vec2(25.0, 90.0)) * 0.7 + av_noise(uv * 160.0) * 0.3;
    avTint = 0.88 + 0.2 * m;
    avH = m;
    avBump = 0.2;
  } else if (avPat > 7.5 && avPat < 8.5) {
    // Skin: soft blotches, a little shine where it is smoother.
    float m = av_noise(uv * 22.0) * 0.6 + av_noise(uv * 70.0) * 0.4;
    avTint = 0.95 + 0.1 * m;
    avRough = (0.5 - m) * 0.12;
    avH = m;
    avBump = 0.04;
  } else if (avPat > 6.5 && avPat < 7.5) {
    // Plate: faint hammer marks and smudges.
    float m = av_noise(uv * 40.0) * 0.6 + av_noise(uv * 9.0) * 0.4;
    avTint = 0.9 + 0.16 * m;
    avH = m;
    avRough = (m - 0.5) * 0.18;
    avBump = 0.15;
  }
}
`;

/** The shared character material (created once). */
export function avatarMaterial(): THREE.MeshStandardMaterial {
  if (shared) return shared;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
  m.name = 'avatar';
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_MAIN}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_PATTERN}\ndiffuseColor.rgb *= avTint;\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.25, 0.19), avDust);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = clamp(vSurf.x + avRough, 0.04, 1.0);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\nmetalnessFactor = vSurf.y;`)
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>\nif (avBump > 0.0) { normal = av_perturb(-vViewPosition, normal, vec2(dFdx(avH), dFdy(avH)) * avBump, faceDirection); }`,
      )
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vSurf.w * 3.0;`);
  };
  m.customProgramCacheKey = () => 'skyrome-avatar-v3';
  shared = m;
  return m;
}

/**
 * Additive flickering flame (torches). The flame is built in WORLD axes at its mesh's origin, so it
 * burns upward however the torch is tilted. `time` is absolute (see `syncFlameClock`), so any number
 * of torches flicker at the same rate.
 */
export function flameMaterial(): THREE.ShaderMaterial {
  if (flame) return flame;
  flame = new THREE.ShaderMaterial({
    name: 'avatar-flame',
    uniforms: { time: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform float time;
      varying vec2 vUv;
      varying float vSeed;
      attribute float seed;
      void main() {
        vUv = uv;
        vSeed = seed;
        vec3 p = position;
        float k = uv.y * uv.y;
        p.x += sin(time * 9.0 + seed * 6.0 + uv.y * 5.0) * 0.012 * k;
        p.z += cos(time * 7.0 + seed * 4.0 + uv.y * 4.0) * 0.012 * k;
        p.y *= 0.9 + 0.15 * sin(time * 13.0 + seed * 3.0);
        vec3 origin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float sc = length(modelMatrix[1].xyz);
        gl_Position = projectionMatrix * viewMatrix * vec4(origin + p * sc, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float time;
      varying vec2 vUv;
      varying float vSeed;
      void main() {
        float x = (vUv.x - 0.5) * 2.0;
        float y = vUv.y;
        float w = (1.0 - y) * (0.55 + 0.45 * sin(y * 3.0 + time * 6.0 + vSeed * 5.0) * y);
        float body = smoothstep(w, w * 0.35, abs(x)) * smoothstep(0.0, 0.12, y) * (1.0 - smoothstep(0.65, 1.0, y));
        vec3 col = mix(vec3(1.0, 0.85, 0.45), vec3(1.0, 0.35, 0.06), smoothstep(0.1, 0.8, y));
        gl_FragColor = vec4(col * body * 1.6, body);
      }`,
  });
  return flame;
}

/** Flicker clock in seconds (half speed), from wall time: idempotent, so every flame may call it. */
export function syncFlameClock(now = performance.now()) {
  flameMaterial().uniforms.time.value = now * 0.0005;
}
