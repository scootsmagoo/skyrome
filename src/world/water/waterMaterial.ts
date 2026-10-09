/**
 * River water: a MeshStandardMaterial patched with `onBeforeCompile`, so it keeps three's lights,
 * shadows, the sky's image-based reflections (scene.environment, Fresnel included) and the sky
 * module's height fog.
 *
 * - Colour: the Tiber was *flavus*, yellow-brown with silt. Depth (the water level minus the
 *   terrain height, read from the terrain's height texture) tints from the sandy-brown shallows to
 *   an olive-brown body; no depth buffer is needed.
 * - Soft shore: alpha fades to 0 over the last half metre, with a pale silt line at the edge.
 * - Normals: a tileable procedural ripple map sampled twice along the current (flow mapping with
 *   two phases cross-faded, so the pattern really travels downstream and stretches with speed),
 *   plus two wind-ripple layers; they flatten with distance so far water doesn't sparkle.
 * - Sun glints: a sharp extra specular lobe of the key light on top of the GGX highlight.
 * - Murk: the sky reflection is tinted and damped (`uReflect`) and light scattered back out of the
 *   silt (`uMurk`) is added whatever the view angle, so the river stays *flavus* at the grazing
 *   angles a walker sees it at instead of turning into a blue-grey mirror.
 */
import * as THREE from 'three';
import { FOAM_PARS, foamUniforms } from './foam';

export interface WaterUniforms {
  tHeight: { value: THREE.Texture | null };
  uGrid: { value: THREE.Vector4 };
  uGridN: { value: THREE.Vector2 };
  tWaterN: { value: THREE.Texture };
  uTime: { value: number };
  uDeep: { value: THREE.Color };
  uShallow: { value: THREE.Color };
  uSilt: { value: THREE.Color };
  uGlint: { value: number };
  /** Tint and strength of the sky reflection. */
  uReflect: { value: THREE.Color };
  /** Silt back-scattering (0 = clear water). */
  uMurk: { value: number };
}

/** Tileable ripple normal map (RGBA8, xy in rg): sine swell plus periodic value-noise chop. */
export function makeWaterNormalTexture(size = 256, seed = 7): THREE.DataTexture {
  const h = new Float32Array(size * size);
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  // Sum of sine waves with integer wave numbers (tiles exactly), random directions.
  const waves: [number, number, number, number][] = [];
  for (let i = 0; i < 40; i++) {
    const k = 1 + rnd() * (i < 12 ? 4 : 18);
    const a = rnd() * Math.PI * 2;
    const kx = Math.round(Math.cos(a) * k), ky = Math.round(Math.sin(a) * k);
    if (!kx && !ky) continue;
    waves.push([kx, ky, rnd() * Math.PI * 2, 0.6 / Math.pow(Math.hypot(kx, ky), 1.1)]);
  }
  // Periodic value noise (lattice of `cells` per side) for irregular chop.
  const lattice = (cells: number) => {
    const g = new Float32Array(cells * cells);
    for (let i = 0; i < g.length; i++) g[i] = rnd() * 2 - 1;
    return (x: number, y: number) => {
      const fx = (x / size) * cells, fy = (y / size) * cells;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      const tx = fx - ix, ty = fy - iy;
      const ux = tx * tx * (3 - 2 * tx), uy = ty * ty * (3 - 2 * ty);
      const at = (i: number, j: number) => g[((j % cells) + cells) % cells * cells + (((i % cells) + cells) % cells)];
      const a = at(ix, iy), b = at(ix + 1, iy), c = at(ix, iy + 1), d = at(ix + 1, iy + 1);
      return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
    };
  };
  const octaves = [lattice(6), lattice(12), lattice(24), lattice(48)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      for (const [kx, ky, ph, amp] of waves) v += Math.sin(((kx * x + ky * y) / size) * Math.PI * 2 + ph) * amp;
      v += octaves[0](x, y) * 0.5 + octaves[1](x, y) * 0.3 + octaves[2](x, y) * 0.16 + octaves[3](x, y) * 0.08;
      h[y * size + x] = v;
    }
  }
  const data = new Uint8Array(size * size * 4);
  const k = 2.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const hx = h[y * size + ((x + 1) % size)] - h[y * size + ((x - 1 + size) % size)];
      const hy = h[((y + 1) % size) * size + x] - h[((y - 1 + size) % size) * size + x];
      const nx = -hx * k, ny = -hy * k, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const o = (y * size + x) * 4;
      data[o] = Math.round((nx / l) * 127.5 + 127.5);
      data[o + 1] = Math.round((ny / l) * 127.5 + 127.5);
      data[o + 2] = Math.round((nz / l) * 127.5 + 127.5);
      data[o + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

const VERTEX_PARS = /* glsl */ `
attribute vec2 aFlow;
attribute float aClear;
varying vec2 vFlow;
varying float vClear;
varying vec3 vWWorld;
`;

const FRAGMENT_PARS = /* glsl */ `
uniform highp sampler2D tHeight;
uniform vec4 uGrid;
uniform vec2 uGridN;
uniform sampler2D tWaterN;
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSilt;
uniform float uGlint;
uniform vec3 uReflect;
uniform float uMurk;
varying vec2 vFlow;
varying float vClear;
varying vec3 vWWorld;

float wGround( vec2 xz ) {
  vec2 g = ( xz - uGrid.xy ) / uGrid.z;
  // Beyond the height grid (the far river): treat as deep.
  if ( any( lessThan( g, vec2( 0.0 ) ) ) || any( greaterThan( g, uGridN - 1.0 ) ) ) return vWWorld.y - 2.5;
  g = clamp( g, vec2( 0.0 ), uGridN - 1.0 );
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
vec2 wN( vec2 uv ) {
  return texture2D( tWaterN, uv ).xy * 2.0 - 1.0;
}
float wHash( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}
float wNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( wHash( i ), wHash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( wHash( i + vec2( 0.0, 1.0 ) ), wHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
`;

const FRAGMENT_MAP = /* glsl */ `
  float wDepth = vWWorld.y - wGround( vWWorld.xz );
  float wDist = length( vWWorld - cameraPosition );
  // Flow-mapped ripples: two phases of the same map pushed downstream, cross-faded.
  vec2 wFlow = vFlow;
  float wPh0 = fract( uTime * 0.21 );
  float wPh1 = fract( uTime * 0.21 + 0.5 );
  float wX = abs( wPh0 - 0.5 ) * 2.0;
  vec2 wP = vWWorld.xz;
  vec2 wA = wN( ( wP - wFlow * wPh0 * 4.8 ) / 6.5 );
  vec2 wB = wN( ( wP - wFlow * wPh1 * 4.8 ) / 6.5 + vec2( 0.37, 0.71 ) );
  vec2 wFlowN = mix( wA, wB, wX );
  vec2 wR1 = wN( mat2( 0.8, - 0.6, 0.6, 0.8 ) * wP / 3.3 + vec2( uTime * 0.021, uTime * 0.013 ) );
  vec2 wR2 = wN( mat2( 0.28, 0.96, - 0.96, 0.28 ) * wP / 1.35 + vec2( - uTime * 0.033, uTime * 0.041 ) );
  float wStr = 1.0 - 0.75 * smoothstep( 25.0, 500.0, wDist );
  vec2 wT = ( wFlowN * ( 0.55 + length( wFlow ) * 0.5 ) + wR1 * 0.32 + wR2 * 0.22 ) * wStr * 0.42;
  vec3 wNormal = normalize( vec3( wT.x, 1.0, wT.y ) );
  // Colour by depth: sandy shallows over the bed, olive-brown silt-laden body.
  float wD = smoothstep( 0.05, 2.2, wDepth );
  vec3 wCol = mix( uShallow, uDeep, wD );
  // Pale silt and scum line at the water's edge, broken up.
  float wEdge = 1.0 - smoothstep( 0.0, 0.16, wDepth );
  float wFoam = wEdge * smoothstep( 0.35, 0.75, wHash( floor( wP * 3.0 ) ) * 0.5 + 0.5 * ( wFlowN.x * 0.5 + 0.5 ) );
  wCol = mix( wCol, uSilt, wFoam * 0.6 );
  {
    // Silt eddies and streaks drawn out along the current (the river is not one flat tan sheet),
    // and a broken, drifting scum band along the banks. All fade out with distance.
    float wFar = 1.0 - smoothstep( 40.0, 380.0, wDist );
    vec2 wDir = wFlow / max( length( wFlow ), 1e-3 );
    vec2 wSt = vec2( dot( wP, wDir ) - uTime * 0.6 * length( wFlow ), dot( wP, vec2( - wDir.y, wDir.x ) ) );
    float wStreak = wNoise( vec2( wSt.x * 0.05, wSt.y * 0.7 ) ) * 0.65 + wNoise( vec2( wSt.x * 0.13 + 4.0, wSt.y * 1.9 ) ) * 0.35;
    float wEddy = wNoise( wP * 0.021 + vec2( uTime * 0.004, 0.0 ) ) * 0.6 + wNoise( wP * 0.067 + 11.0 ) * 0.4;
    wCol *= 1.0 + wFar * ( 0.5 * ( wStreak - 0.5 ) );
    wCol = mix( wCol, wCol * vec3( 1.16, 1.05, 0.84 ), wFar * smoothstep( 0.35, 0.75, wEddy ) * 0.7 );
    float wBand = ( 1.0 - smoothstep( 0.12, 0.8, wDepth ) ) * smoothstep( 0.5, 0.78, wNoise( wP * 2.4 - wFlow * uTime * 0.25 ) * 0.7 + wNoise( wP * 6.1 + 5.0 ) * 0.3 );
    wCol = mix( wCol, uSilt * 1.1, wBand * 0.55 * wFar );
  }
  {
    // Piers and the like (foam.ts): a white collar, a bow line and a streaky wake downstream.
    float wNear = 1.0 - smoothstep( 90.0, 260.0, wDist );
    vec2 wOf = wNear > 0.0 ? wObstacleFoam( wP, wFlow, uTime ) : vec2( 0.0 );
    wCol = mix( wCol, vec3( 0.84, 0.84, 0.78 ), clamp( wOf.x * 0.92 + wOf.y * 0.6, 0.0, 1.0 ) * wNear );
  }
  // Clear spring water (Agrippa's canal): dark and green over its masonry bed.
  wCol = mix( wCol, vec3( 0.075, 0.1, 0.07 ), vClear * 0.8 );
  diffuseColor.rgb = wCol;
  diffuseColor.a = smoothstep( 0.0, 0.45, wDepth );
`;

const FRAGMENT_GLINT = /* glsl */ `
#include <lights_fragment_end>
// Turbid water: a damped, silt-tinted sky reflection, plus light scattered back out of the body.
reflectedLight.indirectSpecular *= uReflect;
reflectedLight.indirectDiffuse += uMurk * material.diffuseColor * ( irradiance + iblIrradiance ) * RECIPROCAL_PI;
#if NUM_DIR_LIGHTS > 0
reflectedLight.indirectDiffuse += uMurk * 0.22 * material.diffuseColor * directionalLights[ 0 ].color * max( directionalLights[ 0 ].direction.y, 0.0 );
#endif
#if NUM_DIR_LIGHTS > 0
{
  vec3 wR = reflect( - geometryViewDir, normal );
  float wG = pow( max( dot( wR, directionalLights[ 0 ].direction ), 0.0 ), 1400.0 );
  reflectedLight.directSpecular += directionalLights[ 0 ].color * wG * uGlint;
}
#endif
`;

export function createWaterMaterial(u: WaterUniforms): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.14, metalness: 0, transparent: true, depthWrite: true });
  m.name = 'water';
  m.envMapIntensity = 0.5;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u, foamUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlow = aFlow;\nvClear = aClear;\nvWWorld = ( modelMatrix * vec4( position, 1.0 ) ).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}\n${FOAM_PARS}`)
      .replace('#include <map_fragment>', FRAGMENT_MAP)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix( 0.34, 0.13, diffuseColor.a );')
      .replace('#include <normal_fragment_maps>', 'normal = normalize( ( viewMatrix * vec4( wNormal, 0.0 ) ).xyz );')
      .replace('#include <lights_fragment_end>', FRAGMENT_GLINT);
  };
  m.customProgramCacheKey = () => 'skyrome-water-v5';
  return m;
}

/** Tiber palette (sRGB): flavus Tiberis. */
export const TIBER_COLORS = { deep: 0x786641, shallow: 0x927c53, silt: 0xb6a780 };
