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
 *   chest / back — bare male torsos: skin plus anatomy as bump detail (pectorals, collarbones,
 *           abdominals and navel; spine and shoulder blades), placed by torso coordinates
 *   face  — skin plus crisp painted features (lips, brows, lid creases, nostrils) placed by the
 *           face coordinates the head builder stores in the metal/emissive channels
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
vec3 avTint3 = vec3(1.0);
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
  if (avCloth || (avPat > 7.5 && avPat < 11.5)) {
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
  } else if (avPat > 8.5 && avPat < 9.5) {
    // Face: skin, plus features painted from the face coordinates (see SkinBuilder PATTERN.face).
    float m = av_noise(uv * 22.0) * 0.6 + av_noise(uv * 70.0) * 0.4;
    avTint = 0.95 + 0.1 * m;
    avRough = (0.5 - m) * 0.12;
    avH = m;
    avBump = 0.04;
    float fu = vSurf.y * 2.0 - 1.0;
    float fy = vSurf.w;
    float au = abs(fu);
    float aa = max(fwidth(fy), 0.0015);
    // Lips: an upper lip with a cupid's bow, a fuller lower lip, a dark line between them.
    float mouthY = 0.245;
    float lx = clamp(au / 0.34, 0.0, 1.0);
    float upTop = mouthY + 0.026 * (1.0 - lx * lx) - 0.006 * exp(-fu * fu / 0.004);
    float loBot = mouthY - 0.034 * sqrt(max(0.0, 1.0 - lx * lx));
    float inLip = smoothstep(loBot - aa, loBot + aa, fy) * smoothstep(upTop + aa, upTop - aa, fy) * smoothstep(0.37, 0.31, au);
    avTint3 = mix(vec3(1.0), vec3(0.9, 0.64, 0.6), inLip);
    float lipLine = exp(-pow((fy - mouthY + 0.002 * (1.0 - lx)) / max(0.0035, aa * 1.5), 2.0)) * smoothstep(0.38, 0.28, au);
    avTint *= 1.0 - 0.5 * lipLine;
    avRough -= 0.15 * inLip;
    // Brows: an arch over each eye, thick at the inner end, tapering outward, with strands.
    float bt = clamp((au - 0.14) / 0.6, 0.0, 1.0);
    float browY = 0.628 + 0.022 * sin(bt * 2.7);
    float browH = mix(0.016, 0.006, bt);
    float inBrow = smoothstep(browH + aa, browH - aa, abs(fy - browY)) * smoothstep(0.11, 0.15, au) * smoothstep(0.78, 0.72, au);
    float strands = av_noise(vec2(au * 110.0, fy * 25.0));
    avTint3 *= mix(vec3(1.0), vec3(0.4, 0.35, 0.32), inBrow * (0.65 + 0.35 * strands));
    // Soft shade in the eye sockets and under the nose; the crease of the upper lid; nostrils.
    avTint *= 1.0 - 0.1 * exp(-pow((au - 0.44) / 0.24, 2.0) - pow((fy - 0.575) / 0.045, 2.0));
    avTint *= 1.0 - 0.08 * exp(-fu * fu / 0.05 - pow((fy - 0.33) / 0.04, 2.0));
    float ec = au - 0.44;
    avTint *= 1.0 - 0.16 * exp(-pow((fy - 0.587 + 0.05 * ec * ec) / 0.006, 2.0)) * exp(-ec * ec / 0.04);
    avTint *= 1.0 - 0.5 * exp(-pow((fy - 0.393) / 0.008, 2.0) - pow((au - 0.105) / 0.04, 2.0));
  } else if (avPat > 9.5 && avPat < 11.5) {
    // Bare torso: skin plus anatomy. Heights in metres-ish (bump 1 ≈ true slope).
    float m = av_noise(uv * 22.0) * 0.6 + av_noise(uv * 70.0) * 0.4;
    avTint = 0.95 + 0.1 * m;
    avRough = (0.5 - m) * 0.12;
    float fx = vSurf.y * 2.0 - 1.0;
    float ty = vSurf.w;
    float ax = abs(fx);
    float h = 0.0;
    if (avPat < 10.5) {
      // Pectorals with a defined lower edge; breastbone groove; collarbones.
      float pd = length(vec2((ax - 0.42) / 0.4, (ty - 0.76) / 0.17));
      h += 0.009 * smoothstep(1.05, 0.45, pd) * smoothstep(0.6, 0.66, ty);
      h -= 0.003 * exp(-fx * fx / 0.004) * smoothstep(0.45, 0.6, ty) * smoothstep(0.95, 0.85, ty);
      h += 0.003 * exp(-pow((ty - 0.93 + 0.04 * ax) / 0.025, 2.0)) * smoothstep(0.08, 0.15, ax) * smoothstep(0.7, 0.55, ax);
      // Abdominals: two columns either side of the midline, crossed by three shallow grooves.
      float abs_ = exp(-pow((ax - 0.17) / 0.12, 2.0)) * smoothstep(0.02, 0.12, ty) * smoothstep(0.6, 0.5, ty);
      float cross_ = exp(-pow((ty - 0.48) / 0.016, 2.0)) + exp(-pow((ty - 0.37) / 0.016, 2.0)) + exp(-pow((ty - 0.26) / 0.016, 2.0));
      h += 0.004 * abs_ * (1.0 - 0.7 * cross_);
      // Navel and nipples.
      float nav = exp(-(fx * fx) / 0.002 - pow((ty - 0.14) / 0.02, 2.0));
      h -= 0.004 * nav;
      avTint *= 1.0 - 0.35 * nav;
      float nip = exp(-pow((ax - 0.5) / 0.035, 2.0) - pow((ty - 0.67) / 0.018, 2.0));
      avTint3 = mix(vec3(1.0), vec3(0.78, 0.62, 0.6), nip);
      // Shade in the creases, so the forms read in flat light too.
      float under = exp(-pow((ty - 0.6 - 0.05 * (ax - 0.42) * (ax - 0.42)) / 0.03, 2.0)) * exp(-pow((ax - 0.42) / 0.3, 2.0));
      float mid = exp(-fx * fx / 0.003) * smoothstep(0.08, 0.2, ty) * smoothstep(0.9, 0.8, ty);
      avTint *= 1.0 - 0.16 * under - 0.08 * mid - 0.06 * cross_ * exp(-pow((ax - 0.17) / 0.2, 2.0));
    } else {
      // Spine groove and shoulder blades.
      h -= 0.004 * exp(-fx * fx / 0.004) * smoothstep(0.05, 0.2, ty) * smoothstep(1.0, 0.85, ty);
      float sd = length(vec2((ax - 0.42) / 0.26, (ty - 0.74) / 0.18));
      h += 0.006 * smoothstep(1.0, 0.4, sd);
      float spine = exp(-fx * fx / 0.003) * smoothstep(0.05, 0.2, ty) * smoothstep(1.0, 0.85, ty);
      float blade = exp(-pow((sd - 1.05) / 0.4, 2.0)) * smoothstep(0.8, 0.6, ty) * smoothstep(0.15, 0.3, ax);
      avTint *= 1.0 - 0.12 * spine - 0.07 * blade;
    }
    avH = h;
    avBump = 4.0;
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
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_PATTERN}\ndiffuseColor.rgb *= avTint * avTint3;\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.25, 0.19), avDust);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = clamp(vSurf.x + avRough, 0.04, 1.0);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\nmetalnessFactor = (vPat < 2.5 || (vPat > 6.5 && vPat < 7.5)) ? vSurf.y : 0.0;`)
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>\nif (avBump > 0.0) { normal = av_perturb(-vViewPosition, normal, vec2(dFdx(avH), dFdy(avH)) * avBump, faceDirection); }`,
      )
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * (vPat < 0.5 ? vSurf.w : 0.0) * 3.0;`)
      // Alpha 0 marks characters for the post chain: screen-space AO neither darkens them nor is cast by them
      // (gfx/post/ao.ts); their folds and creases carry their own shading. Materials that need alpha keep it.
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>\n#ifndef AV_KEEP_ALPHA\ngl_FragColor.a = 0.0;\n#endif');
  };
  m.customProgramCacheKey = () => 'skyrome-avatar-v6';
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
