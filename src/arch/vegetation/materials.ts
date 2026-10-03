/**
 * Vegetation materials: clones of the shared library materials (so textured PBR upgrades carry
 * over) with vertex colours (baked AO) and a cheap wind sway injected into the vertex shader.
 *
 * Sway = (world wind direction) × sin(time, per-instance phase) × amplitude × height². It is
 * computed in world units from the instance origin and mapped back into the instance's local frame,
 * so rotated / scaled instances all lean the same way. Grass can also shrink to nothing between
 * `fade[0]` and `fade[1]` meters from the camera (distance fade without transparency sorting).
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
    float vDist = distance(vO.xz, cameraPosition.xz);
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

export function vegMaterial(base: MaterialId, p: VegProfile): THREE.Material {
  const key = `${base}|${p.sway}|${p.flutter}|${p.fade?.join(',') ?? ''}|${p.doubleSide ? 1 : 0}|${p.heads ? 1 : 0}`;
  let m = cache.get(key);
  if (m) return m;
  const src = getMaterial(base) as THREE.MeshStandardMaterial;
  const mat = src.clone();
  mat.name = `veg:${key}`;
  mat.vertexColors = true;
  if (p.doubleSide) mat.side = THREE.DoubleSide;
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
      .replace('#include <common>', `#include <common>\n${HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${SWAY}`);
    if (p.heads) shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>', HEAD_COLOR);
  };
  mat.customProgramCacheKey = () => `veg|${p.fade ? 1 : 0}|${p.heads ? 1 : 0}`;
  cache.set(key, mat);
  m = mat;
  return m;
}
