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
 * - SK_WEATHER: walls weather. A band of grime splashed up from the street at their feet (height
 *   above the terrain from the heightmap texture, with a ragged noisy top edge) and soft rain
 *   streaks running down them. Only on steep faces (flat normal from screen derivatives, so it
 *   needs no extra varying). Strength per material via `skWeather`; the ground grid is shared and
 *   set once the terrain exists (`setWeatherGround`); before that only the streaks show.
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
#ifdef SK_WEATHER
uniform float skWeather;
uniform highp sampler2D skGround;
uniform vec4 skGroundGrid; // minX, minZ, spacing, 1 when set
uniform vec2 skGroundN;
float skGroundAt( vec2 xz ) {
  vec2 f = clamp( ( xz - skGroundGrid.xy ) / skGroundGrid.z, vec2( 0.0 ), skGroundN - 1.001 );
  ivec2 i0 = ivec2( floor( f ) );
  ivec2 i1 = i0 + 1;
  vec2 t = fract( f );
  float a = texelFetch( skGround, i0, 0 ).r;
  float b = texelFetch( skGround, ivec2( i1.x, i0.y ), 0 ).r;
  float c = texelFetch( skGround, ivec2( i0.x, i1.y ), 0 ).r;
  float d = texelFetch( skGround, i1, 0 ).r;
  return mix( mix( a, b, t.x ), mix( c, d, t.x ), t.y );
}
#endif
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
#ifdef SK_WEATHER
{
  vec3 skN = normalize( cross( dFdx( vSkWorld ), dFdy( vSkWorld ) ) );
  float skVert = 1.0 - smoothstep( 0.35, 0.75, abs( skN.y ) );
  if ( skVert > 0.0 ) {
    // Grime: up to ~0.6–1.6 m above the street, with a ragged top edge.
    float skH = skGroundGrid.w > 0.0 ? vSkWorld.y - skGroundAt( vSkWorld.xz ) : 100.0;
    float skTop = 0.6 + 1.0 * skNoise( vec3( vSkWorld.x * 0.7, 0.0, vSkWorld.z * 0.7 ) + 3.0 );
    float skG = 1.0 - smoothstep( skTop * 0.25, skTop, max( skH, 0.0 ) );
    diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.56, 0.5, 0.43 ), min( 1.0, skG * 0.85 * skWeather * skVert ) );
    // Rain streaks: narrow along the wall, long down it, patchy.
    vec2 skT = normalize( vec2( -skN.z, skN.x ) + 1e-5 );
    float skU = dot( vSkWorld.xz, skT );
    float skS = smoothstep( 0.4, 0.75, skNoise( vec3( skU * 2.2, vSkWorld.y * 0.15, 7.0 ) ) );
    skS *= 0.4 + skNoise( vec3( skU * 0.25, vSkWorld.y * 0.06, 11.0 ) );
    diffuseColor.rgb *= 1.0 - min( 0.8, 0.42 * skS * skVert * skWeather );
  }
}
#endif
`;

/** The terrain heights every weathered material reads (one shared set of uniforms). */
const GROUND = {
  tex: { value: null as THREE.Texture | null },
  grid: { value: { x: 0, y: 0, z: 1, w: 0 } },
  n: { value: { x: 1, y: 1 } },
};

/** Point the weathering at the terrain's height texture (game y per sample, row-major by z). */
export function setWeatherGround(tex: THREE.Texture | null, g: { minX: number; minZ: number; spacing: number; nx: number; nz: number }) {
  GROUND.tex.value = tex;
  GROUND.grid.value = { x: g.minX, y: g.minZ, z: g.spacing, w: tex ? 1 : 0 };
  GROUND.n.value = { x: g.nx, y: g.nz };
}

/**
 * Patch a MeshStandardMaterial in place. `macro` 0 disables the variation; `contrast` < 1 (with
 * `mean`, the map's average linear albedo) flattens the albedo map towards its mean.
 */
export function applyShaderPatch(material: THREE.MeshStandardMaterial, opts: { macro?: number; detile?: boolean; contrast?: number; mean?: readonly number[]; weather?: number }) {
  const macro = opts.macro ?? 0;
  const weather = opts.weather ?? 0;
  // SK_DETILE and SK_CONTRAST only act inside USE_MAP, so they are safe before the map loads.
  const detile = !!opts.detile;
  const contrast = opts.contrast !== undefined && opts.contrast < 1 && opts.mean ? opts.contrast : 1;
  if (macro <= 0 && !detile && contrast === 1 && weather <= 0) return;
  material.defines = { ...(material.defines ?? {}), ...(macro > 0 ? { SK_MACRO: '' } : {}), ...(weather > 0 ? { SK_WEATHER: '' } : {}), ...(detile ? { SK_DETILE: '' } : {}), ...(contrast < 1 ? { SK_CONTRAST: '' } : {}) };
  const uniform = { value: macro };
  const contrastU = { value: contrast };
  const meanU = { value: { x: opts.mean?.[0] ?? 0.5, y: opts.mean?.[1] ?? 0.5, z: opts.mean?.[2] ?? 0.5 } };
  const weatherU = { value: weather };
  material.userData.skMacro = uniform;
  material.userData.skWeather = weatherU;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.skMacro = uniform;
    shader.uniforms.skContrast = contrastU;
    shader.uniforms.skMean = meanU;
    shader.uniforms.skWeather = weatherU;
    shader.uniforms.skGround = GROUND.tex;
    shader.uniforms.skGroundGrid = GROUND.grid;
    shader.uniforms.skGroundN = GROUND.n;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vSkWorld;`)
      .replace('#include <project_vertex>', VERTEX_WORLD);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${NOISE}`)
      .replace('#include <map_fragment>', MAP_FRAGMENT);
  };
  material.customProgramCacheKey = () => 'skyrome-macro-v2';
}
