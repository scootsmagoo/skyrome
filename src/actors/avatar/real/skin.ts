/**
 * Materials of the realistic bodies: skin and eyes.
 *
 * Skin is a MeshStandardMaterial (baked tangent-space normal map and AO map per LOD) patched in
 * onBeforeCompile with:
 *   - wrap lighting: light that scatters past the terminator, tinted red by the blood under the skin;
 *   - a procedural pore / micro-variation detail normal from the bind-pose position (fades out with
 *     distance through screen-space derivatives, so it never shimmers);
 *   - soft large-scale blotches and a warm shift in the creases (where the AO map is dark).
 * Specular anti-aliasing comes from three's own geometry-roughness term.
 *
 * One material per (sex, LOD, skin colour); the programs are shared (customProgramCacheKey).
 */
import * as THREE from 'three';
import { srgb } from '../build/common';
import { PAINT_BUMP, PAINT_COLOR, PAINT_PARS, PAINT_THIN } from './head/paintShader';

const SKIN_PARS = /* glsl */ `
varying vec3 vRest;
varying vec3 vRestN;
float sk_hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float sk_noise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sk_hash(i), sk_hash(i + vec3(1,0,0)), f.x), mix(sk_hash(i + vec3(0,1,0)), sk_hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(sk_hash(i + vec3(0,0,1)), sk_hash(i + vec3(1,0,1)), f.x), mix(sk_hash(i + vec3(0,1,1)), sk_hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
// Pore-scale height field: cellular dimples over fine noise.
float sk_pores(vec3 p) {
  float a = sk_noise(p * 900.0);
  float b = sk_noise(p * 2300.0);
  float c = sk_noise(p * 260.0);
  return 0.5 * smoothstep(0.55, 0.9, a) + 0.3 * b + 0.4 * c;
}
`;

/** Painted-face data (head/paint.ts builds it; every value is in the reference head's frame, see paintShader.ts). */
export interface SkinPaint {
  /** Identifies the material variant (same key, same look). */
  key: string;
  headJ: THREE.Vector3;
  headK: number;
  eye: THREE.Vector3;
  /** mouth y, nose-tip y, nose-tip z, mouth half width */
  face: THREE.Vector4;
  /** chin y, head height, axis z, brow y */
  head: THREE.Vector4;
  /** ear x min, y bottom, y top, z max */
  ear: THREE.Vector4;
  brow: THREE.Color;
  lip: THREE.Color;
  /** beard colour and stubble amount */
  stub: THREE.Vector4;
  /** hairline fractions: front, temple, side, nape */
  hairline: THREE.Vector4;
  hairRoots: THREE.Color;
  /** beard (0 none, 1 stubble, 2 short, 3 full), blush, age, scalp on */
  misc: THREE.Vector4;
  /** sex (0 male, 1 female), brow thickness */
  look: THREE.Vector2;
}

function patchSkin(shader: THREE.WebGLProgramParametersWithUniforms, paint?: SkinPaint) {
  if (paint) {
    const u = shader.uniforms;
    u.uHeadJ = { value: paint.headJ };
    u.uHeadK = { value: paint.headK };
    u.uEye = { value: paint.eye };
    u.uFace = { value: paint.face };
    u.uHead = { value: paint.head };
    u.uEar = { value: paint.ear };
    u.uBrowC = { value: paint.brow };
    u.uLipC = { value: paint.lip };
    u.uStubC = { value: paint.stub };
    u.uHl = { value: paint.hairline };
    u.uHlC = { value: paint.hairRoots };
    u.uMisc = { value: paint.misc };
    u.uLook = { value: paint.look };
  }
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vRest;\nvarying vec3 vRestN;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position;\nvRestN = normal;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + SKIN_PARS + (paint ? PAINT_PARS : ''))
    // Wrap lighting in the direct term (a copy of three's RE_Direct_Physical with a scatter term).
    .replace(
      '#include <lights_physical_pars_fragment>',
      THREE.ShaderChunk.lights_physical_pars_fragment.replace(
        'vec3 irradiance = dotNL * directLight.color;',
        `vec3 irradiance = dotNL * directLight.color;
	{
		float rawNL = dot( geometryNormal, directLight.direction );
		float wrap = saturate( ( rawNL + 0.5 ) / 1.5 ) * saturate( ( rawNL + 0.5 ) / 1.5 );
		reflectedLight.directDiffuse += directLight.color * max( wrap - dotNL * dotNL, 0.0 ) * 0.42 * vec3( 1.0, 0.42, 0.28 ) * material.diffuseColor * RECIPROCAL_PI;
		${paint ? PAINT_THIN : ''}
	}`,
      ),
    )
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      {
        // Large blotches (freckling, redness) and a warm shift where the body creases (AO).
        float bl = sk_noise(vRest * 9.0) * 0.6 + sk_noise(vRest * 31.0) * 0.4;
        diffuseColor.rgb *= 0.93 + 0.14 * bl;
        #ifdef USE_AOMAP
          float skAo = texture2D( aoMap, vAoMapUv ).r;
          diffuseColor.rgb *= mix(vec3(0.78, 0.52, 0.46), vec3(1.0), smoothstep(0.35, 0.95, skAo));
        #endif
      }
      ${paint ? PAINT_COLOR : ''}`,
    )
    .replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      {
        // Detail normal: pores and micro-bumps, triplanar-free (the rest-pose position is smooth).
        vec3 q = vRest;
        float h = sk_pores(q);
        float fade = 1.0 - smoothstep(0.35, 1.1, length(vec2(dFdx(h), dFdy(h))) * 40.0 + length(fwidth(q)) * 700.0);
        vec3 dpdx = dFdx( - vViewPosition );
        vec3 dpdy = dFdy( - vViewPosition );
        float dHx = dFdx( h );
        float dHy = dFdy( h );
        vec3 r1 = cross( dpdy, normal );
        vec3 r2 = cross( normal, dpdx );
        float det = dot( dpdx, r1 );
        vec3 grad = sign( det ) * ( dHx * r1 + dHy * r2 );
        normal = normalize( abs( det ) * normal - 0.0018 * fade * grad );
        roughnessFactor = clamp( roughnessFactor + (h - 0.5) * 0.12 * fade, 0.3, 1.0 );
      }
      ${paint ? PAINT_BUMP : ''}`,
    );
}

const skinCache = new Map<string, THREE.MeshStandardMaterial>();
const painted: string[] = [];
const PAINTED_MAX = 96;

export interface SkinMaps {
  normal: THREE.Texture;
  ao: THREE.Texture;
}

/**
 * Skin material for one LOD of a body (shared by everyone with that skin colour). With a `paint` (the
 * painted face of one appearance, see head/paint.ts) the material is that appearance's own variant; the
 * shader program is shared, only the uniforms differ.
 */
export function skinMaterial(key: string, color: string, maps: SkinMaps, paint?: SkinPaint): THREE.MeshStandardMaterial {
  const k = `${key}|${color}${paint ? '|' + paint.key : ''}`;
  let m = skinCache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: srgb(color).clone(),
      roughness: 0.62,
      metalness: 0,
      normalMap: maps.normal,
      normalScale: new THREE.Vector2(1, 1),
      aoMap: maps.ao,
      aoMapIntensity: 1.6,
    });
    m.name = `skin:${k}`;
    m.onBeforeCompile = (s) => patchSkin(s, paint);
    m.customProgramCacheKey = () => (paint ? 'real-skin-v2-paint' : 'real-skin-v1');
    skinCache.set(k, m);
    if (paint) {
      // Painted variants are per appearance: keep the newest PAINTED_MAX (a disposed one that is still on screen just re-uploads).
      painted.push(k);
      while (painted.length > PAINTED_MAX) {
        const old = painted.shift()!;
        skinCache.get(old)?.dispose();
        skinCache.delete(old);
      }
    }
  }
  return m;
}

// ---------------------------------------------------------------- eyes

const EYE_VERT_PARS = 'attribute vec3 eyeLocal;\nvarying vec3 vEyeLocal;';
const EYE_FRAG_PARS = /* glsl */ `
uniform vec3 uIris;
varying vec3 vEyeLocal;
float ey_hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ey_noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ey_hash(i), ey_hash(i + vec2(1,0)), f.x), mix(ey_hash(i + vec2(0,1)), ey_hash(i + vec2(1,1)), f.x), f.y); }
`;

function patchEye(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.uniforms.uIris = { value: new THREE.Color(0x5a3a1c) };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + EYE_VERT_PARS)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEyeLocal = eyeLocal;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + EYE_FRAG_PARS)
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      {
        vec3 e = normalize(vEyeLocal);
        float d = length(e.xy);             // sine of the angle from the pupil axis (+z)
        float front = step(0.0, e.z);
        float ang = atan(e.y, e.x);
        float streak = ey_noise(vec2(ang * 7.0, d * 9.0)) * 0.6 + ey_noise(vec2(ang * 19.0, d * 3.0)) * 0.4;
        vec3 sclera = vec3(0.86, 0.82, 0.77) * (0.9 + 0.1 * ey_noise(e.xy * 14.0));
        sclera = mix(sclera, vec3(0.8, 0.45, 0.4), 0.18 * smoothstep(0.55, 1.0, d) * ey_noise(e.xy * 30.0));
        vec3 iris = uIris * (0.55 + 0.9 * streak);
        iris = mix(iris, uIris * 1.5 + vec3(0.12, 0.08, 0.0), smoothstep(0.34, 0.2, d) * 0.6);
        float limbal = smoothstep(0.36, 0.47, d);
        iris *= 1.0 - 0.7 * limbal;
        float irisMask = (1.0 - smoothstep(0.455, 0.485, d)) * front;
        float pupil = (1.0 - smoothstep(0.15, 0.185, d)) * front;
        vec3 c = mix(sclera, iris, irisMask);
        c = mix(c, vec3(0.01), pupil);
        diffuseColor.rgb = c;
      }`,
    );
}

let eyeMat: THREE.MeshStandardMaterial | null = null;
const eyeIris = new Map<string, THREE.MeshStandardMaterial>();

/** Eye material; `iris` is the iris colour (sRGB hex). One instance per colour. */
export function eyeMaterial(iris: string): THREE.MeshStandardMaterial {
  let m = eyeIris.get(iris);
  if (!m) {
    m = eyeMat
      ? eyeMat.clone()
      : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.07, metalness: 0 });
    eyeMat ??= m;
    m.onBeforeCompile = (s) => {
      patchEye(s);
      (s.uniforms.uIris.value as THREE.Color).copy(srgb(iris));
    };
    // Same program for every colour; the uniform is bound per material via the hook above.
    m.customProgramCacheKey = () => 'real-eye-v1:' + iris;
    m.name = `eye:${iris}`;
    eyeIris.set(iris, m);
  }
  return m;
}

/** Iris colours seen in AD 113 Rome, most common first. */
export const IRIS_COLORS = ['#3b2412', '#4a2f17', '#5a3a1c', '#6b5a2c', '#3f5a3a', '#5d7080'] as const;
