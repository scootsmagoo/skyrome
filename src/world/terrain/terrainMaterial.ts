/**
 * The terrain material: a MeshStandardMaterial patched with `onBeforeCompile`, so three's lights,
 * shadows, the sky module's height fog and rain wetness all keep working.
 *
 * Vertex: CDLOD. Every instance is a patch (`aPatch` = x0, z0, cell size, level) of a shared
 * P×P grid; heights come from an R32F texture with texelFetch (bilinear by hand, so it works
 * without float filtering). Odd vertices morph onto their even neighbours toward the next level's
 * range; skirt vertices drop below the surface; far levels sit slightly lower so roads and
 * pavements laid on the terrain never get poked through by its coarser approximation.
 *
 * Fragment: splat. The per-sample data textures give the 2 m normal, road and pad distance fields,
 * pad kind, urban wear, garden lushness and local water level; `SPLAT_GLSL` turns them into
 * weights for nine ground layers; the three strongest are sampled from the texture arrays with
 * anti-tiling (a rotated second sample under a noise mask, plus a large-scale sample at distance),
 * height-blended, and lit with the blended detail normals over the 2 m normal. Steep rock is
 * triplanar. Wet margins darken and turn glossy at the waterline.
 */
import * as THREE from 'three';
import { SDF_RANGE, WATER_OFFSET_RANGE } from './terrainData';
import { L, LAYER_COUNT, SPLAT_GLSL } from './splat';

export const MAX_LOD_LEVELS = 10;

/** Layers whose photos get the rotated anti-tiling sample (not the regular paving patterns). */
const DETILE = [1, 1, 1, 1, 1, 1, 1, 0, 0];
/** Detail normal strength per layer. */
const NORMAL_K = [0.9, 0.8, 0.9, 1.0, 0.7, 0.8, 1.0, 1.0, 0.8];

export interface TerrainUniforms {
  tHeight: { value: THREE.Texture };
  tDataA: { value: THREE.Texture };
  tDataB: { value: THREE.Texture };
  tAlbedo: { value: THREE.Texture };
  tSurface: { value: THREE.Texture };
  uGrid: { value: THREE.Vector4 };
  uGridN: { value: THREE.Vector2 };
  uMorph: { value: THREE.Vector2[] };
  uBias: { value: number[] };
  uSkirt: { value: number[] };
  uWater: { value: THREE.Vector3 };
  uTile: { value: number[] };
  uTint: { value: THREE.Vector3[] };
  uRough: { value: number[] };
  uNormalK: { value: number[] };
  uDetile: { value: number[] };
  /** 1 = tint by LOD level (debug). */
  uDebugLod: { value: number };
}

const VERTEX_PARS = /* glsl */ `
uniform highp sampler2D tHeight;
uniform sampler2D tDataA;
uniform vec4 uGrid;
uniform vec2 uGridN;
uniform vec2 uMorph[ ${MAX_LOD_LEVELS} ];
uniform float uBias[ ${MAX_LOD_LEVELS} ];
uniform float uSkirt[ ${MAX_LOD_LEVELS} ];
attribute vec4 aPatch;
varying vec3 vTWorld;
varying float vTMorph;

float tHeightAt( vec2 xz ) {
  vec2 g = clamp( ( xz - uGrid.xy ) / uGrid.z, vec2( 0.0 ), uGridN - 1.0 );
  vec2 i = floor( g );
  vec2 f = g - i;
  ivec2 i0 = ivec2( i );
  ivec2 i1 = min( i0 + 1, ivec2( uGridN ) - 1 );
  float a = texelFetch( tHeight, i0, 0 ).r;
  float b = texelFetch( tHeight, ivec2( i1.x, i0.y ), 0 ).r;
  float c = texelFetch( tHeight, ivec2( i0.x, i1.y ), 0 ).r;
  float d = texelFetch( tHeight, i1, 0 ).r;
  return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
}
`;

const VERTEX_TERRAIN = /* glsl */ `
  vec2 tG = position.xz;
  float tSkirtV = position.y;
  int tL = int( aPatch.w + 0.5 );
  vec2 tMax = uGrid.xy + ( uGridN - 1.0 ) * uGrid.z;
  vec2 tXZ = min( aPatch.xy + tG * aPatch.z, tMax );
  float tY0 = tHeightAt( tXZ );
  float tDist = distance( cameraPosition, vec3( tXZ.x, tY0, tXZ.y ) );
  vec2 tM = uMorph[ tL ];
  float tMorph = clamp( ( tDist - tM.x ) / ( tM.y - tM.x ), 0.0, 1.0 );
  tXZ -= fract( tG * 0.5 ) * 2.0 * aPatch.z * tMorph;
  tXZ = min( tXZ, tMax );
  int tL1 = min( tL + 1, ${MAX_LOD_LEVELS - 1} );
  float tY = tHeightAt( tXZ ) - mix( uBias[ tL ], uBias[ tL1 ], tMorph ) - tSkirtV * uSkirt[ tL ];
  {
    // Under paved roads and building pads the terrain drops 9 cm out of sight: the floors, paving
    // and roads laid there sit on the same heights, and where they meet the ground exactly the two
    // fought (patches of grass or earth flickering through stone). Visual only: physics keeps the
    // true heightfield.
    vec2 tUVv = ( ( tXZ - uGrid.xy ) / uGrid.z + 0.5 ) / uGridN;
    vec4 tDAv = textureLod( tDataA, tUVv, 0.0 );
    float tRoadV = ( tDAv.b - 0.5 ) * ${(2 * SDF_RANGE).toFixed(1)};
    float tPadV = ( tDAv.a - 0.5 ) * ${(2 * SDF_RANGE).toFixed(1)};
    tY -= 0.09 * max( smoothstep( 0.75, -0.25, tRoadV ), smoothstep( 0.75, -0.25, tPadV ) );
  }
  float tE = uGrid.z;
  float tHx = tHeightAt( tXZ + vec2( tE, 0.0 ) ) - tHeightAt( tXZ - vec2( tE, 0.0 ) );
  float tHz = tHeightAt( tXZ + vec2( 0.0, tE ) ) - tHeightAt( tXZ - vec2( 0.0, tE ) );
  vec3 objectNormal = normalize( vec3( - tHx, 2.0 * tE, - tHz ) );
  vTWorld = vec3( tXZ.x, tY, tXZ.y );
  vTMorph = float( tL ) + tMorph;
  #ifdef USE_TANGENT
    vec3 objectTangent = vec3( 1.0, 0.0, 0.0 );
  #endif
`;

const FRAGMENT_PARS = /* glsl */ `
#define SDF_RANGE ${SDF_RANGE.toFixed(1)}
#define T_LAYERS ${LAYER_COUNT}
#define T_ROCK ${L.rock}
uniform sampler2D tDataA;
uniform sampler2D tDataB;
uniform highp sampler2DArray tAlbedo;
uniform highp sampler2DArray tSurface;
uniform vec4 uGrid;
uniform vec2 uGridN;
uniform vec3 uWater;
uniform float uTile[ T_LAYERS ];
uniform vec3 uTint[ T_LAYERS ];
uniform float uRough[ T_LAYERS ];
uniform float uNormalK[ T_LAYERS ];
uniform float uDetile[ T_LAYERS ];
uniform float uDebugLod;
varying vec3 vTWorld;
varying float vTMorph;
${SPLAT_GLSL}

// Sample one layer: albedo (rgb + height) and surface (normal xy, roughness, ao), anti-tiled.
void tLayer( int layer, vec2 p, float mask, float far, out vec4 alb, out vec4 srf ) {
  float fl = float( layer );
  vec2 uv = p / uTile[ layer ];
  // Regular paving patterns moiré at grazing distances: blur them a little sooner.
  float lodBias = uDetile[ layer ] > 0.5 ? 0.0 : far * 1.2;
  alb = texture( tAlbedo, vec3( uv, fl ), lodBias );
  srf = texture( tSurface, vec3( uv, fl ), lodBias );
  float m = mask * uDetile[ layer ];
  if ( m > 0.002 ) {
    vec2 uv2 = mat2( 0.8, - 0.6, 0.6, 0.8 ) * uv * 0.71 + vec2( 0.37, 0.61 );
    alb = mix( alb, texture( tAlbedo, vec3( uv2, fl ) ), m );
    srf = mix( srf, texture( tSurface, vec3( uv2, fl ) ), m );
  }
  // Natural ground only: a large-scale sample over a regular paving pattern would moiré.
  if ( far > 0.002 && uDetile[ layer ] > 0.5 ) {
    vec4 a3 = texture( tAlbedo, vec3( uv * 0.19 + vec2( 0.13, 0.71 ), fl ) );
    alb.rgb = mix( alb.rgb, a3.rgb, far * 0.55 );
  }
}

// Triplanar rock (cliffs): whiteout-blended world normal in n, albedo in alb.
void tRockTri( vec3 wp, inout vec3 n, out vec4 alb, out vec4 srf ) {
  float fl = float( T_ROCK );
  float t = uTile[ T_ROCK ] * 2.1;
  vec3 bw = pow( abs( n ), vec3( 4.0 ) );
  bw /= bw.x + bw.y + bw.z;
  vec4 ax = texture( tAlbedo, vec3( wp.zy / t, fl ) );
  vec4 ay = texture( tAlbedo, vec3( wp.xz / t, fl ) );
  vec4 az = texture( tAlbedo, vec3( wp.xy / t, fl ) );
  vec4 sx = texture( tSurface, vec3( wp.zy / t, fl ) );
  vec4 sy = texture( tSurface, vec3( wp.xz / t, fl ) );
  vec4 sz = texture( tSurface, vec3( wp.xy / t, fl ) );
  alb = ax * bw.x + ay * bw.y + az * bw.z;
  srf = sx * bw.x + sy * bw.y + sz * bw.z;
  float k = uNormalK[ T_ROCK ];
  vec3 tx = vec3( ( sx.xy * 2.0 - 1.0 ) * k, 1.0 );
  vec3 ty = vec3( ( sy.xy * 2.0 - 1.0 ) * k, 1.0 );
  vec3 tz = vec3( ( sz.xy * 2.0 - 1.0 ) * k, 1.0 );
  tx = vec3( tx.xy + n.zy, abs( tx.z ) * n.x );
  ty = vec3( ty.xy + n.xz, abs( ty.z ) * n.y );
  tz = vec3( tz.xy + n.xy, abs( tz.z ) * n.z );
  n = normalize( tx.zyx * bw.x + ty.xzy * bw.y + tz.xyz * bw.z );
}
`;

const FRAGMENT_SPLAT = /* glsl */ `
  vec2 tP = vTWorld.xz;
  vec2 tUV = ( ( tP - uGrid.xy ) / uGrid.z + 0.5 ) / uGridN;
  vec4 tDA = texture( tDataA, tUV );
  vec4 tDB = texture( tDataB, tUV );
  vec3 tGeo = vec3( tDA.r * 2.0 - 1.0, 0.0, tDA.g * 2.0 - 1.0 );
  tGeo.y = sqrt( max( 0.0, 1.0 - tGeo.x * tGeo.x - tGeo.z * tGeo.z ) );
  float tRoadSd = ( tDA.b - 0.5 ) * 2.0 * SDF_RANGE;
  float tPadSd = ( tDA.a - 0.5 ) * 2.0 * SDF_RANGE;
  float tHw = vTWorld.y - ( uWater.x + tDB.a * uWater.y );
  float tw[ 9 ];
  vec4 tNz;
  float tDist = length( vTWorld - cameraPosition );
  float tFine = 1.0 - smoothstep( 40.0, 220.0, tDist );
  splatWeights( tP, tGeo.y, tGeo.z, tHw, tRoadSd, tPadSd, tDB.r, tDB.g, tDB.b, tFine, tw, tNz );

  // The three strongest layers.
  int tI0 = 0, tI1 = 0, tI2 = 0;
  float tW0 = - 1.0, tW1 = - 1.0, tW2 = - 1.0;
  for ( int i = 0; i < T_LAYERS; i ++ ) {
    float w = tw[ i ];
    if ( w > tW0 ) { tW2 = tW1; tI2 = tI1; tW1 = tW0; tI1 = tI0; tW0 = w; tI0 = i; }
    else if ( w > tW1 ) { tW2 = tW1; tI2 = tI1; tW1 = w; tI1 = i; }
    else if ( w > tW2 ) { tW2 = w; tI2 = i; }
  }
  tW1 = max( tW1, 0.0 );
  tW2 = max( tW2, 0.0 );
  float tSum = tW0 + tW1 + tW2;
  tW0 /= tSum; tW1 /= tSum; tW2 /= tSum;

  float tFar = smoothstep( 30.0, 160.0, tDist );
  float tMask = smoothstep( 0.32, 0.68, tNoise( tP * 0.075 + vec2( 13.1, 4.7 ) ) );
  vec4 tA0, tA1, tA2, tS0, tS1, tS2;
  vec3 tRockN = tGeo;
  bool tTri = tGeo.y < 0.88;
  if ( tTri && tI0 == T_ROCK ) tRockTri( vTWorld, tRockN, tA0, tS0 ); else tLayer( tI0, tP, tMask, tFar, tA0, tS0 );
  if ( tW1 > 0.003 ) { if ( tTri && tI1 == T_ROCK ) tRockTri( vTWorld, tRockN, tA1, tS1 ); else tLayer( tI1, tP, tMask, tFar, tA1, tS1 ); } else { tA1 = tA0; tS1 = tS0; }
  if ( tW2 > 0.003 ) { if ( tTri && tI2 == T_ROCK ) tRockTri( vTWorld, tRockN, tA2, tS2 ); else tLayer( tI2, tP, tMask, tFar, tA2, tS2 ); } else { tA2 = tA0; tS2 = tS0; }

  // Height-based blend: stones and tufts poke through the neighbouring layer.
  float tHk = 0.3;
  float tB0 = tW0 + tA0.a * tHk, tB1 = tW1 + tA1.a * tHk, tB2 = tW2 + tA2.a * tHk;
  float tTop = max( tB0, max( tB1, tB2 ) ) - 0.3;
  tB0 = max( tB0 - tTop, 0.0 ) * step( 0.0005, tW0 );
  tB1 = max( tB1 - tTop, 0.0 ) * step( 0.0005, tW1 );
  tB2 = max( tB2 - tTop, 0.0 ) * step( 0.0005, tW2 );
  float tBs = max( tB0 + tB1 + tB2, 1e-4 );
  tB0 /= tBs; tB1 /= tBs; tB2 /= tBs;

  vec3 tAlb = tA0.rgb * uTint[ tI0 ] * tB0 + tA1.rgb * uTint[ tI1 ] * tB1 + tA2.rgb * uTint[ tI2 ] * tB2;
  float tRoughness = tS0.b * uRough[ tI0 ] * tB0 + tS1.b * uRough[ tI1 ] * tB1 + tS2.b * uRough[ tI2 ] * tB2;
  float tAO = tS0.a * tB0 + tS1.a * tB1 + tS2.a * tB2;
  float tNk = 1.0 - tFar * 0.6;
  vec2 tTn = ( ( tS0.xy * 2.0 - 1.0 ) * uNormalK[ tI0 ] * ( tTri && tI0 == T_ROCK ? 0.0 : tB0 )
    + ( tS1.xy * 2.0 - 1.0 ) * uNormalK[ tI1 ] * ( tTri && tI1 == T_ROCK ? 0.0 : tB1 )
    + ( tS2.xy * 2.0 - 1.0 ) * uNormalK[ tI2 ] * ( tTri && tI2 == T_ROCK ? 0.0 : tB2 ) ) * tNk;
  vec3 tNW = normalize( vec3( tTn.x + tGeo.x, tGeo.y, tTn.y + tGeo.z ) );
  float tRockW = ( tI0 == T_ROCK ? tB0 : 0.0 ) + ( tI1 == T_ROCK ? tB1 : 0.0 ) + ( tI2 == T_ROCK ? tB2 : 0.0 );
  if ( tTri && tRockW > 0.0 ) tNW = normalize( mix( tNW, tRockN, tRockW ) );

  // Large-scale variation: sun-bleached and darker patches, slight warm / cool shift.
  float tMac = tNz.x * 0.6 + tNoise( tP * 0.0047 + vec2( 7.3, 1.1 ) ) * 0.4;
  tAlb *= 0.88 + 0.24 * tMac;
  tAlb *= mix( vec3( 0.97, 0.99, 1.03 ), vec3( 1.04, 1.0, 0.95 ), tNz.y );
  // Wet margin at the river: darker, glossier.
  float tWet = 1.0 - smoothstep( 0.0, 0.35, tHw );
  tAlb *= 1.0 - 0.22 * tWet;
  tRoughness = mix( tRoughness, tRoughness * 0.45, tWet );
  {
    // Near-field grain: two octaves of fine noise, so the ground never reads as one smooth scan up close.
    float tNear = 1.0 - smoothstep( 6.0, 38.0, tDist );
    float tGr = tNoise( tP * 11.0 ) * 0.6 + tNoise( tP * 29.0 + 3.0 ) * 0.4;
    tAlb *= 1.0 + 0.2 * tNear * ( tGr - 0.5 );
    tRoughness = clamp( tRoughness + 0.12 * tNear * ( tGr - 0.5 ), 0.04, 1.0 );
  }
  diffuseColor.rgb *= tAlb;
  if ( uDebugLod > 0.5 ) {
    vec3 tLc[ 6 ] = vec3[ 6 ]( vec3( 1.0, 0.2, 0.2 ), vec3( 1.0, 0.8, 0.2 ), vec3( 0.2, 1.0, 0.3 ), vec3( 0.2, 0.7, 1.0 ), vec3( 0.7, 0.3, 1.0 ), vec3( 1.0, 1.0, 1.0 ) );
    int tLi = int( floor( vTMorph ) );
    vec3 tLcol = mix( tLc[ min( tLi, 5 ) ], tLc[ min( tLi + 1, 5 ) ], fract( vTMorph ) );
    diffuseColor.rgb = mix( diffuseColor.rgb, tLcol * 0.6, 0.65 );
  }
`;

/** Build the terrain material and its shared uniforms. */
export function createTerrainMaterial(u: TerrainUniforms): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  m.name = 'terrain';
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace('#include <beginnormal_vertex>', VERTEX_TERRAIN)
      .replace('#include <begin_vertex>', 'vec3 transformed = vTWorld;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
      .replace('#include <map_fragment>', FRAGMENT_SPLAT)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp( tRoughness, 0.04, 1.0 );')
      .replace(
        '#include <normal_fragment_maps>',
        `normal = normalize( ( viewMatrix * vec4( tNW, 0.0 ) ).xyz );
        {
          // Specular AA: widen the roughness by the screen-space variance of the detail normal.
          vec3 tDx = dFdx( normal ), tDy = dFdy( normal );
          float tVar = min( 0.5 * ( dot( tDx, tDx ) + dot( tDy, tDy ) ), 0.25 );
          roughnessFactor = sqrt( clamp( roughnessFactor * roughnessFactor + tVar, 0.0, 1.0 ) );
        }`,
      )
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
        {
          // The photos' cavity AO, gently on the sky light: at full strength the ground went
          // charcoal in twilight (sky-lit only) while the buildings around it stayed bright.
          float tAo = mix( 1.0, tAO, 0.5 );
          reflectedLight.indirectDiffuse *= tAo;
          reflectedLight.indirectSpecular *= mix( 1.0, tAO, 0.85 );
        }`,
      );
  };
  m.customProgramCacheKey = () => 'skyrome-terrain-v3';
  return m;
}

export function defaultLayerUniforms() {
  return {
    uNormalK: { value: [...NORMAL_K] },
    uDetile: { value: [...DETILE] },
    uDebugLod: { value: 0 },
  };
}

export { WATER_OFFSET_RANGE };
