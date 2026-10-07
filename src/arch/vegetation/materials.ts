/**
 * Vegetation materials: clones of the shared library materials (so textured PBR upgrades carry
 * over) with vertex colours (baked AO) and a cheap wind sway injected into the vertex shader.
 *
 * Sway = (world wind direction) × sin(time, per-instance phase) × amplitude × height². It is
 * computed in world units from the instance origin and mapped back into the instance's local frame,
 * so rotated / scaled instances all lean the same way. Grass can also shrink to nothing between
 * `fade[0]` and `fade[1]` meters from the camera (distance fade without transparency sorting).
 *
 * Canopies (foliage_* materials, near LOD) are "leafy": toward the silhouette the surface is cut
 * into leaf clumps (3D value noise in the tree's own frame, so it never swims), and both sides
 * are drawn so the holes show the darker inside of the crown instead of the sky only. The fraying
 * fades out with distance, where it would shimmer.
 *
 * One material per (base id, profile) — cached, never per object.
 */
import * as THREE from 'three';
import { getMaterial } from '../../gfx/materials';
import type { MaterialId } from '../../gfx/materialIds';

/** Shared clock for every wind material (advanced by VegetationSystem). */
export const windTime = { value: 0 };
/** Global wind strength multiplier (0 = calm). */
export const windStrength = { value: 1 };

export interface VegProfile {
  /** Trunk/stem sway per m² of height (trees ~0.0005, grass ~0.25). */
  sway: number;
  /** Leaf flutter amplitude (m). */
  flutter: number;
  /** Shrink to zero between these camera distances (grass, flowers). */
  fade?: [number, number];
  doubleSide?: boolean;
  /** Per-instance colour applied only where attribute aHead = 1 (flower heads). */
  heads?: boolean;
}

const cache = new Map<string, THREE.Material>();

let leafyCanopies = true;
/** Leafy canopies cost fill rate (two-sided, cut out): the Low graphics tier turns them off at boot. */
export function setLeafyCanopies(on: boolean) {
  leafyCanopies = on;
}

const HEAD = /* glsl */ `
uniform float uVegTime;
uniform float uVegWind;
uniform float uVegSway;
uniform float uVegFlutter;
uniform vec2 uVegFade;
#ifdef VEG_HEADS
attribute float aHead;
#endif
`;

const LEAFY_VERT = /* glsl */ `
#ifdef VEG_LEAFY
  vLeafP = position;
#endif
`;

const LEAFY_PARS = /* glsl */ `
varying vec3 vLeafP;
float leafHash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float leafNoise( vec3 x ) {
  vec3 i = floor( x ), f = fract( x );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( leafHash( i ), leafHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( leafHash( i + vec3( 0, 1, 0 ) ), leafHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( leafHash( i + vec3( 0, 0, 1 ) ), leafHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( leafHash( i + vec3( 0, 1, 1 ) ), leafHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
`;

const LEAFY_FRAG = /* glsl */ `
{
  // Fray the crown's silhouette into leaf clumps; the inside shows through, darker.
  float lfRim = 1.0 - abs( dot( normal, normalize( vViewPosition ) ) );
  float lfNear = smoothstep( 75.0, 35.0, length( vViewPosition ) );
  float lfN = leafNoise( vLeafP * 3.0 ) * 0.8 + leafNoise( vLeafP * 8.0 + 3.1 ) * 0.2;
  if ( lfN < ( smoothstep( 0.55, 1.0, lfRim ) * 0.75 - 0.05 ) * lfNear ) discard;
}
`;

const SWAY = /* glsl */ `
{
  vec3 vO = vec3(0.0);
  mat3 vB = mat3(1.0);
  #ifdef USE_INSTANCING
    vO = instanceMatrix[3].xyz;
    vB = mat3(instanceMatrix);
  #endif
  vO = (modelMatrix * vec4(vO, 1.0)).xyz;
  float vS = length(vB[0]);
  float vPh = vO.x * 0.13 + vO.z * 0.11;
  float vH = max(transformed.y, 0.0) * vS;
  float vGust = 0.6 + 0.4 * sin(uVegTime * 0.27 + vPh * 0.15);
  float vSw = (sin(uVegTime * 1.25 + vPh) * 0.7 + sin(uVegTime * 2.05 + vPh * 1.7) * 0.3) * vGust * uVegWind;
  vec3 vD = vec3(0.94, 0.0, 0.34) * vSw * uVegSway * vH * vH;
  float vF = uVegFlutter * min(vH, 3.0) * uVegWind;
  vD += vec3(sin(uVegTime * 5.1 + dot(transformed, vec3(1.7, 2.3, 1.1)) * 2.0 + vPh), 0.0, cos(uVegTime * 4.3 + dot(transformed, vec3(2.1, 1.3, 1.9)) * 2.0)) * vF;
  transformed += (transpose(vB) * vD) / max(vS * vS, 1e-4);
  #ifdef VEG_FADE
    float vDist = distance(vO, cameraPosition);
    transformed *= 1.0 - smoothstep(uVegFade.x, uVegFade.y, vDist);
  #endif
}
`;

const HEAD_COLOR = /* glsl */ `
#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
  vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR
  vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
  vColor.rgb = mix( vColor.rgb, vColor.rgb * instanceColor.rgb, aHead );
#endif
`;

/**
 * `base` is a library material id, or 'baked': a neutral white material for parts whose vertex
 * colours already carry the albedo (far LODs).
 */
export function vegMaterial(base: MaterialId | 'baked', p: VegProfile): THREE.Material {
  const key = `${leafyCanopies ? 'L' : ''}${base}|${p.sway}|${p.flutter}|${p.fade?.join(',') ?? ''}|${p.doubleSide ? 1 : 0}|${p.heads ? 1 : 0}`;
  let m = cache.get(key);
  if (m) return m;
  const mat = base === 'baked' ? new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 }) : (getMaterial(base) as THREE.MeshStandardMaterial).clone();
  mat.name = `veg:${key}`;
  mat.vertexColors = true;
  const leafy = leafyCanopies && base !== 'baked' && base.startsWith('foliage');
  if (p.doubleSide || leafy) mat.side = THREE.DoubleSide;
  if (leafy) mat.defines = { ...(mat.defines ?? {}), VEG_LEAFY: '' };
  if (p.fade) mat.defines = { ...(mat.defines ?? {}), VEG_FADE: '' };
  if (p.heads) mat.defines = { ...(mat.defines ?? {}), VEG_HEADS: '' };
  const sway = { value: p.sway }, flutter = { value: p.flutter }, fade = { value: new THREE.Vector2(...(p.fade ?? [0, 0])) };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uVegTime = windTime;
    shader.uniforms.uVegWind = windStrength;
    shader.uniforms.uVegSway = sway;
    shader.uniforms.uVegFlutter = flutter;
    shader.uniforms.uVegFade = fade;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${HEAD}${leafy ? 'varying vec3 vLeafP;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${LEAFY_VERT}${SWAY}`);
    if (leafy) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${LEAFY_PARS}`)
        .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>\n${LEAFY_FRAG}`)
        .replace('#include <color_fragment>', '#include <color_fragment>\nif ( !gl_FrontFacing ) diffuseColor.rgb *= 0.75;');
    }
    if (p.heads) shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>', HEAD_COLOR);
  };
  mat.customProgramCacheKey = () => `veg|${p.fade ? 1 : 0}|${p.heads ? 1 : 0}|${leafy ? 1 : 0}`;
  cache.set(key, mat);
  m = mat;
  return m;
}
