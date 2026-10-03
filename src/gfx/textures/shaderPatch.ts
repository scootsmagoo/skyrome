/**
 * Cheap anti-tiling for the shared materials, injected with `onBeforeCompile`:
 *
 * - SK_MACRO: world-space 3D value noise (2 octaves, ALU only) modulates albedo brightness and
 *   shifts it slightly warm/cool, so a 2 m texture repeating over a 100 m wall no longer reads as
 *   a grid. Strength per material via the `skMacro` uniform.
 * - SK_DETILE: natural ground (grass, dirt, sand…) also blends a second, rotated and rescaled
 *   sample of the albedo map by a low-frequency noise mask. One extra texture fetch.
 *
 * - SK_CONTRAST: pulls the albedo map towards its own mean (`skContrast` 1 = unchanged). White
 *   marble scans carry strong grey veining that, in shade with no AO, dominates the forms of
 *   columns and mouldings; at 0.5–0.6 the veins stay visible but the shading reads first.
 *
 * Every patched material shares the same shader source, so Three compiles one program per
 * define combination and only the uniform values differ per material.
 */
import type * as THREE from 'three';

const NOISE = /* glsl */ `
varying vec3 vSkWorld;
uniform float skMacro;
uniform float skContrast;
uniform vec3 skMean;
float skHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float skNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(skHash(i), skHash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(skHash(i + vec3(0.0, 1.0, 0.0)), skHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(skHash(i + vec3(0.0, 0.0, 1.0)), skHash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(skHash(i + vec3(0.0, 1.0, 1.0)), skHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
`;

const VERTEX_WORLD = /* glsl */ `
#include <project_vertex>
{
  vec4 skWp = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
    skWp = batchingMatrix * skWp;
  #endif
  #ifdef USE_INSTANCING
    skWp = instanceMatrix * skWp;
  #endif
  vSkWorld = ( modelMatrix * skWp ).xyz;
}
`;

const MAP_FRAGMENT = /* glsl */ `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  #ifdef SK_DETILE
  {
    float skW = smoothstep( 0.35, 0.65, skNoise( vSkWorld * 0.13 + 5.0 ) );
    vec2 skUv = mat2( 0.8, -0.6, 0.6, 0.8 ) * vMapUv * 0.71 + vec2( 0.37, 0.61 );
    sampledDiffuseColor = mix( sampledDiffuseColor, texture2D( map, skUv ), skW );
  }
  #endif
  #ifdef SK_CONTRAST
    sampledDiffuseColor.rgb = mix( skMean, sampledDiffuseColor.rgb, skContrast );
  #endif
  diffuseColor *= sampledDiffuseColor;
#endif
#ifdef SK_MACRO
{
  float skA = skNoise( vSkWorld * 0.09 ) * 0.62 + skNoise( vSkWorld * 0.41 + 17.0 ) * 0.38;
  float skB = skNoise( vSkWorld * 0.035 + 31.0 );
  diffuseColor.rgb *= 1.0 + skMacro * ( skA * 2.0 - 1.0 );
  diffuseColor.rgb *= mix( vec3( 1.0 ), mix( vec3( 0.96, 0.98, 1.03 ), vec3( 1.04, 1.0, 0.94 ), skB ), clamp( skMacro * 6.0, 0.0, 1.0 ) );
}
#endif
`;

/**
 * Patch a MeshStandardMaterial in place. `macro` 0 disables the variation; `contrast` < 1 (with
 * `mean`, the map's average linear albedo) flattens the albedo map towards its mean.
 */
export function applyShaderPatch(material: THREE.MeshStandardMaterial, opts: { macro?: number; detile?: boolean; contrast?: number; mean?: readonly number[] }) {
  const macro = opts.macro ?? 0;
  // SK_DETILE and SK_CONTRAST only act inside USE_MAP, so they are safe before the map loads.
  const detile = !!opts.detile;
  const contrast = opts.contrast !== undefined && opts.contrast < 1 && opts.mean ? opts.contrast : 1;
  if (macro <= 0 && !detile && contrast === 1) return;
  material.defines = { ...(material.defines ?? {}), ...(macro > 0 ? { SK_MACRO: '' } : {}), ...(detile ? { SK_DETILE: '' } : {}), ...(contrast < 1 ? { SK_CONTRAST: '' } : {}) };
  const uniform = { value: macro };
  const contrastU = { value: contrast };
  const meanU = { value: { x: opts.mean?.[0] ?? 0.5, y: opts.mean?.[1] ?? 0.5, z: opts.mean?.[2] ?? 0.5 } };
  material.userData.skMacro = uniform;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.skMacro = uniform;
    shader.uniforms.skContrast = contrastU;
    shader.uniforms.skMean = meanU;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vSkWorld;`)
      .replace('#include <project_vertex>', VERTEX_WORLD);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${NOISE}`)
      .replace('#include <map_fragment>', MAP_FRAGMENT);
  };
  material.customProgramCacheKey = () => 'skyrome-macro-v1';
}
