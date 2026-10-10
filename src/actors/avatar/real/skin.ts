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
import { PAINT_BUMP, PAINT_COLOR, PAINT_PARS, PAINT_SPEC, PAINT_THIN } from './head/paintShader';
import { LID_AZ } from './head/faceRig';
import { PARAM_SLOT, patchDeform } from './deform';

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
  // The jaw and the fingers bend in the vertex shader (real/deform.ts); the paint keeps to the rest pose.
  shader.vertexShader = patchDeform(shader.vertexShader)
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
    .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n' + (paint ? PAINT_SPEC : ''))
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
    m.customProgramCacheKey = () => (paint ? 'real-skin-v3-paint' : 'real-skin-v3');
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
//
// The eyeball (a sphere in the socket, see RealBody) is painted from `eyeLocal`, the direction from the
// eye's centre (pupil axis +z, in the head's bind frame). On top of sclera, iris and pupil:
//   - the lids: the opening measured on the face (head/faceRig.ts) is a table of the upper and lower lid
//     edges' elevations across the eye; above the upper edge / below the lower the ball is painted as lid
//     skin, so a blink (the avatar's parameter slot, real/deform.ts) lowers the upper edge over the ball
//     to meet the lower one, which rises a little;
//   - lid shadow: the upper lid and the lashes shade the top of the eyeball, the corners are darker;
//   - lashes: a dark fringe along the upper lid's edge, a fainter one along the lower;
//   - gaze: the iris and pupil turn by the gaze angles (the lids stay with the head, the upper one
//     follows the eyes a little when they look down);
//   - wet: a clear coat (the tear film) over a rougher sclera, a catchlight from the sky, a wet line on
//     the lower lid's edge. The lid skin is matte.

/** Lid tables: elevation (rad) of the upper and lower lid edges at LID_AZ (head/faceRig.ts). */
export interface EyeLids {
  upper: number[];
  lower: number[];
}

const EYE_VERT_PARS = /* glsl */ `
attribute vec3 eyeLocal;
varying vec3 vEyeLocal;
varying vec3 vEyePrm;
varying float vEyeSide;
`;
const EYE_VERT = /* glsl */ `
vEyeLocal = eyeLocal;
vEyeSide = position.x > 0.0 ? 1.0 : -1.0;
#ifdef USE_SKINNING
  {
    mat4 prm = getBoneMatrix( ${PARAM_SLOT}.0 );
    vEyePrm = vec3( vEyeSide > 0.0 ? prm[0].y : prm[0].z, prm[0].w, prm[1].x );
  }
#else
  vEyePrm = vec3( 0.0 );
#endif
`;
const EYE_FRAG_PARS = /* glsl */ `
uniform vec3 uIris;
uniform vec3 uLidSkin;
uniform float uLidU[${LID_AZ.length}];
uniform float uLidL[${LID_AZ.length}];
varying vec3 vEyeLocal;
varying vec3 vEyePrm;
varying float vEyeSide;
float eyLid = 0.0;
float ey_hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ey_noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ey_hash(i), ey_hash(i + vec2(1,0)), f.x), mix(ey_hash(i + vec2(0,1)), ey_hash(i + vec2(1,1)), f.x), f.y); }
// Lid edge elevation at azimuth a (rad, + outward) from a table over ${LID_AZ[0]}..${LID_AZ[LID_AZ.length - 1]} degrees.
float ey_table(float a, bool upper) {
  float x = clamp((a * 57.2958 - (${LID_AZ[0].toFixed(1)})) / ${(LID_AZ[1] - LID_AZ[0]).toFixed(1)}, 0.0, ${(LID_AZ.length - 1).toFixed(1)});
  int i = int(floor(x));
  int j = min(i + 1, ${LID_AZ.length - 1});
  float f = x - float(i);
  float v0 = 0.0;
  float v1 = 0.0;
  for (int k = 0; k < ${LID_AZ.length}; k++) {
    float v = upper ? uLidU[k] : uLidL[k];
    if (k == i) v0 = v;
    if (k == j) v1 = v;
  }
  return mix(v0, v1, f);
}
`;

const EYE_COLOR = /* glsl */ `
{
  vec3 e = normalize(vEyeLocal);
  float blink = vEyePrm.x;
  // Lids, in the head's frame.
  float az = atan(e.x * vEyeSide, e.z);
  float el = asin(clamp(e.y, -1.0, 1.0));
  float up = ey_table(az, true) + min(vEyePrm.z, 0.0) * 0.45 + 0.015;
  float lo = ey_table(az, false) - 0.015;
  float meet = mix(lo, up, 0.32);
  float upB = mix(up, meet, blink);
  float loB = mix(lo, meet, blink);
  float aa = max(fwidth(el), 0.004) * 1.2;
  float lidU = smoothstep(upB - aa, upB + aa, el);
  float lidL = smoothstep(loB + aa, loB - aa, el);
  eyLid = max(lidU, lidL);
  // The eyeball, turned by the gaze (yaw about y, then pitch).
  float cy = cos(vEyePrm.y), sy = sin(vEyePrm.y);
  vec3 a = vec3(e.x * cy - e.z * sy, e.y, e.x * sy + e.z * cy);
  float cp = cos(vEyePrm.z), sp = sin(vEyePrm.z);
  vec3 g = vec3(a.x, a.y * cp - a.z * sp, a.y * sp + a.z * cp);
  float d = length(g.xy);             // sine of the angle from the pupil axis (+z)
  float front = step(0.0, g.z);
  float ang = atan(g.y, g.x);
  float streak = ey_noise(vec2(ang * 7.0, d * 9.0)) * 0.6 + ey_noise(vec2(ang * 19.0, d * 3.0)) * 0.4;
  vec3 sclera = vec3(0.8, 0.76, 0.71) * (0.9 + 0.1 * ey_noise(e.xy * 14.0));
  sclera = mix(sclera, vec3(0.78, 0.45, 0.4), 0.2 * smoothstep(0.55, 1.0, d) * ey_noise(e.xy * 30.0));
  vec3 iris = uIris * (0.55 + 0.9 * streak);
  iris = mix(iris, uIris * 1.5 + vec3(0.12, 0.08, 0.0), smoothstep(0.34, 0.2, d) * 0.6);
  float limbal = smoothstep(0.36, 0.47, d);
  iris *= 1.0 - 0.7 * limbal;
  float irisMask = (1.0 - smoothstep(0.455, 0.485, d)) * front;
  float pupil = (1.0 - smoothstep(0.15, 0.185, d)) * front;
  vec3 c = mix(sclera, iris, irisMask);
  c = mix(c, vec3(0.01), pupil);
  // Shadow of the upper lid and lashes over the top of the ball, the corners, the lower lid's rim.
  float under = smoothstep(upB - 0.3, upB, el);
  c *= 1.0 - 0.62 * under * under - 0.2 * smoothstep(0.12, 0.0, el - loB);
  float corner = smoothstep(0.55, 1.05, abs(az));
  c = mix(c, c * vec3(0.85, 0.55, 0.52), corner * 0.7);
  // Lid skin, with the lashes along its edge (denser at the outer end) and a faint lower fringe.
  vec3 skin = uLidSkin;
  skin *= 0.82 + 0.18 * smoothstep(upB + 0.02, upB + 0.25, el);
  float outer = smoothstep(-0.3, 0.6, az);
  float comb = 0.6 + 0.4 * ey_noise(vec2(az * 140.0, 1.0));
  float lash = smoothstep(upB + 0.07 + 0.04 * outer, upB, el) * lidU * comb;
  skin = mix(skin, vec3(0.035, 0.025, 0.02), clamp(lash * 1.1, 0.0, 0.92));
  float lashL = smoothstep(loB - 0.04, loB, el) * lidL * (0.6 + 0.4 * ey_noise(vec2(az * 120.0, 3.0)));
  skin = mix(skin, skin * 0.45, lashL);
  c = mix(c, skin, eyLid);
  // The lashes' own shadow just under the upper edge (on the ball).
  c *= 1.0 - 0.5 * smoothstep(upB - 0.06, upB, el) * (1.0 - eyLid);
  diffuseColor.rgb = c;
}
`;

function patchEye(shader: THREE.WebGLProgramParametersWithUniforms, look: { iris: THREE.Color; skin: THREE.Color; lids: EyeLids }) {
  shader.uniforms.uIris = { value: look.iris };
  shader.uniforms.uLidSkin = { value: look.skin };
  shader.uniforms.uLidU = { value: look.lids.upper };
  shader.uniforms.uLidL = { value: look.lids.lower };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + EYE_VERT_PARS)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + EYE_VERT);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + EYE_FRAG_PARS)
    .replace('#include <color_fragment>', '#include <color_fragment>\n' + EYE_COLOR)
    // The ball is wet (smooth under the clear coat, sclera a little rough); the lid skin is matte and dry.
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.62, eyLid);')
    .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\nmaterial.clearcoat *= 1.0 - eyLid;')
    .replace(
      '#include <opaque_fragment>',
      `{
        // Catchlight: the bright sky reflected in the tear film (a soft window above and in front).
        vec3 rv = reflect( - normalize( vViewPosition ), normalize( normal ) );
        vec3 sky = normalize( vec3( -0.25, 0.75, 0.6 ) );
        float cl = pow( max( dot( rv, sky ), 0.0 ), 180.0 );
        outgoingLight += vec3( 0.9, 0.92, 1.0 ) * cl * 0.55 * ( 1.0 - eyLid );
      }
      #include <opaque_fragment>`,
    );
}

const eyeCache = new Map<string, THREE.MeshPhysicalMaterial>();

/**
 * Eye material for an iris colour (sRGB hex), the skin of the lids (sRGB hex) and the face's lid tables
 * (one per body template). One instance per (iris, skin, template); all share one program.
 */
export function eyeMaterial(iris: string, skin = '#c89a78', lids: EyeLids = DEFAULT_LIDS, key = 'default'): THREE.MeshPhysicalMaterial {
  const k = `${iris}|${skin}|${key}`;
  let m = eyeCache.get(k);
  if (!m) {
    // The lids in the socket are in the face's shade (the skin material darkens them with its AO map).
    const look = { iris: srgb(iris).clone(), skin: srgb(skin).clone().multiplyScalar(0.62), lids };
    m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04 });
    m.onBeforeCompile = (s) => patchEye(s, look);
    m.customProgramCacheKey = () => 'real-eye-v2';
    m.name = `eye:${k}`;
    eyeCache.set(k, m);
  }
  return m;
}

/** An almond opening for eyes with no measured face (about the baked heads' average). */
const DEFAULT_LIDS: EyeLids = (() => {
  const upper: number[] = [];
  const lower: number[] = [];
  for (const a of LID_AZ) {
    const k = Math.max(0, 1 - Math.pow(Math.abs(a - 8) / 58, 2));
    upper.push(((-8 + 30 * Math.sqrt(k)) * Math.PI) / 180);
    lower.push(((-8 - 26 * Math.sqrt(k)) * Math.PI) / 180);
  }
  return { upper, lower };
})();

/** Iris colours seen in AD 113 Rome, most common first. */
export const IRIS_COLORS = ['#3b2412', '#4a2f17', '#5a3a1c', '#6b5a2c', '#3f5a3a', '#5d7080'] as const;
