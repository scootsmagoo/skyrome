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
 * Leaf cards (`card`: broad, olive, needle) are alpha-cut quads whose leaf spray is drawn in the
 * fragment shader (leaflets along a stem, or a fan of needles, each with its own tone), with
 * alpha-to-coverage so the edges antialias under MSAA. Foliage of every kind is translucent: the
 * sun shining through a leaf lights its far side (back-face term plus a forward-scatter lobe when
 * the viewer looks toward the sun), shadowed by the shadow map like any direct light.
 *
 * One material per (base id, profile) — cached, never per object.
 */
import * as THREE from 'three';
import { getMaterial } from '../../gfx/materials';
import { MATERIAL_BASE, type MaterialId } from '../../gfx/materialIds';
import type { LeafKind } from './species';

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
  /** Leaf cards of this kind (geometry has uv and aLeaf; see geom.leafCards). */
  card?: LeafKind;
}

const cache = new Map<string, THREE.Material>();

let leafyCanopies = true;
/** Leafy canopies cost fill rate (two-sided, cut out): the Low graphics tier turns them off at boot. */
export function setLeafyCanopies(on: boolean) {
  leafyCanopies = on;
}

/** Whether leaf cards are built and drawn (they need MSAA to look right; the Low tier has none). */
export function leafCardsEnabled() {
  return leafyCanopies;
}

const CARD_KIND: Record<LeafKind, number> = { broad: 0, olive: 1, needle: 2 };

/**
 * three's direct-light diffuse with a translucency term added (VEG_TRANS). Read the chunk at
 * compile time: the sky module's wetness patch rewrites it once the sky exists.
 */
const lightsPars = () => THREE.ShaderChunk.lights_physical_pars_fragment.replace(
  'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );',
  `reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );
	#ifdef VEG_TRANS
		{
			// Light through the leaf: from behind the surface, and the glow when looking toward the sun.
			float vtBack = saturate( dot( - geometryNormal, directLight.direction ) );
			float vtFwd = pow( saturate( dot( - geometryViewDir, directLight.direction ) ), 3.0 );
			reflectedLight.directDiffuse += directLight.color * material.diffuseContribution * RECIPROCAL_PI * ( 0.9 * vtBack + 0.7 * vtFwd * ( 0.4 + 0.6 * vtBack ) ) * vec3( 1.0, 1.0, 0.55 );
		}
	#endif`,
);

const CARD_VERT = /* glsl */ `
#ifdef VEG_CARD
  vCardUv = uv;
  vCardId = aLeaf;
#endif
`;

const CARD_PARS = /* glsl */ `
varying vec2 vCardUv;
varying float vCardId;
float cardHash( float x ) { return fract( sin( x * 127.1 + 17.3 ) * 43758.5453 ); }
// x: coverage (> 0 inside a leaf), y: the tone of the leaflet there.
vec2 cardPattern( vec2 uv, float id ) {
  float a = -1.0, tone = 0.5;
  #if VEG_CARD_KIND == 2
    // A fan of needles from the stem end.
    vec2 p = uv - vec2( 0.5, 0.03 );
    for ( int i = 0; i < 9; i++ ) {
      float fi = float( i );
      float ang = ( fi / 8.0 - 0.5 ) * 1.55 + ( cardHash( id * 9.0 + fi ) - 0.5 ) * 0.22;
      vec2 d = vec2( sin( ang ), cos( ang ) );
      float len = 0.72 + 0.24 * cardHash( id * 3.0 + fi * 1.7 );
      float t = clamp( dot( p, d ), 0.0, len );
      float v = 1.0 - length( p - d * t ) / ( 0.045 * ( 1.0 - 0.6 * t / len ) );
      if ( v > a ) { a = v; tone = cardHash( id * 5.0 + fi ); }
    }
  #else
    #if VEG_CARD_KIND == 1
      const int PAIRS = 5;
      const vec2 AX = vec2( 0.055, 0.19 );
      const float SPREAD = 0.07;
    #else
      const int PAIRS = 3;
      const vec2 AX = vec2( 0.115, 0.24 );
      const float SPREAD = 0.1;
    #endif
    float sz = 0.86 + 0.28 * cardHash( id * 13.0 );
    for ( int i = 0; i < PAIRS; i++ ) {
      float fi = float( i );
      float y = 0.1 + fi * ( 0.62 / float( PAIRS ) );
      for ( int k = 0; k < 2; k++ ) {
        float side = k == 0 ? -1.0 : 1.0;
        float th = - side * 0.85;
        vec2 q = uv - vec2( 0.5 + side * SPREAD, y + AX.y * 0.55 * sz );
        vec2 r = vec2( cos( th ) * q.x + sin( th ) * q.y, - sin( th ) * q.x + cos( th ) * q.y );
        float v = 1.0 - length( r / ( AX * sz ) );
        if ( v > a ) { a = v; tone = cardHash( id * 7.0 + fi * 2.0 + side ); }
      }
    }
    vec2 q = uv - vec2( 0.5, 0.72 );
    float v = 1.0 - length( q / ( AX * 1.15 * sz ) );
    if ( v > a ) { a = v; tone = cardHash( id * 11.0 ); }
  #endif
  return vec2( a, tone );
}
`;

const CARD_FRAG = /* glsl */ `
{
  vec2 cp = cardPattern( vCardUv, vCardId );
  diffuseColor.a = smoothstep( 0.0, 0.3, cp.x );
  diffuseColor.rgb *= mix( vec3( 0.62, 0.76, 0.56 ), vec3( 1.0, 1.03, 0.78 ), cp.y ) * ( 0.9 + 0.2 * fract( vCardId * 5.3 ) );
  if ( !gl_FrontFacing ) diffuseColor.rgb *= 0.82;
}
`;

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
  const key = `${leafyCanopies ? 'L' : ''}${base}|${p.sway}|${p.flutter}|${p.fade?.join(',') ?? ''}|${p.doubleSide ? 1 : 0}|${p.heads ? 1 : 0}|${p.card ?? ''}`;
  let m = cache.get(key);
  if (m) return m;
  const card = p.card !== undefined && base !== 'baked';
  // A card material is its own: the library material's texture would be box-projected over uvs it doesn't have.
  const mat = base === 'baked'
    ? new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 })
    : card
      ? new THREE.MeshStandardMaterial({ color: MATERIAL_BASE[base].color, roughness: 0.82, side: THREE.DoubleSide, alphaTest: 0.5, alphaToCoverage: true })
      : (getMaterial(base) as THREE.MeshStandardMaterial).clone();
  mat.name = `veg:${key}`;
  mat.vertexColors = true;
  const leafy = leafyCanopies && base !== 'baked' && base.startsWith('foliage') && !card;
  const trans = base !== 'baked' && base.startsWith('foliage');
  if (p.doubleSide || leafy) mat.side = THREE.DoubleSide;
  if (leafy) mat.defines = { ...(mat.defines ?? {}), VEG_LEAFY: '' };
  if (trans) mat.defines = { ...(mat.defines ?? {}), VEG_TRANS: '' };
  if (card) mat.defines = { ...(mat.defines ?? {}), VEG_CARD: '', VEG_CARD_KIND: String(CARD_KIND[p.card!]) };
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
      .replace('#include <common>', `#include <common>\n${HEAD}${leafy ? 'varying vec3 vLeafP;' : ''}${card ? 'attribute float aLeaf;\nvarying vec2 vCardUv;\nvarying float vCardId;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${LEAFY_VERT}${card ? CARD_VERT : ''}${SWAY}`);
    if (trans) shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_pars_fragment>', lightsPars());
    if (card) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${CARD_PARS}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${CARD_FRAG}`);
    }
    if (leafy) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${LEAFY_PARS}`)
        .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>\n${LEAFY_FRAG}`)
        .replace('#include <color_fragment>', '#include <color_fragment>\nif ( !gl_FrontFacing ) diffuseColor.rgb *= 0.75;');
    }
    if (p.heads) shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>', HEAD_COLOR);
  };
  mat.customProgramCacheKey = () => `veg2|${p.fade ? 1 : 0}|${p.heads ? 1 : 0}|${leafy ? 1 : 0}|${trans ? 1 : 0}|${card ? p.card : 0}`;
  cache.set(key, mat);
  m = mat;
  return m;
}
