/**
 * The hair material: ONE MeshStandardMaterial for every head's hair, beard and brow-line cards (the colour
 * is in the vertex colours, the strands in the shared texture, see hairTexture.ts).
 *
 *   - cut out of the strand texture with alpha-to-coverage (so edges antialias under MSAA; the Low tier
 *     has no MSAA and gets the plain alpha test: `setHairAlphaToCoverage(false)`);
 *   - Kajiya-Kay anisotropic highlight: two lobes (a sharp white one and a broader one tinted by the hair)
 *     along each card's `strand` direction, shifted per strand so the highlight breaks up into bands;
 *   - a little forward scattering (light through the hair when the sun is behind it).
 * The strand direction is a vertex attribute carried through the skin with the same matrix as the normal.
 */
import * as THREE from 'three';
import { hairTexture } from './hairTexture';

let mat: THREE.MeshStandardMaterial | null = null;
let a2c = true;

/** Alpha-to-coverage needs a multisampled target: turn it off when the graphics tier has no MSAA. */
export function setHairAlphaToCoverage(on: boolean) {
  a2c = on;
  if (mat) {
    mat.alphaToCoverage = on;
    mat.needsUpdate = true;
  }
}

const VERT_PARS = /* glsl */ `
attribute vec3 strand;
varying vec3 vStrand;
`;

const FRAG_PARS = /* glsl */ `
varying vec3 vStrand;
vec3 hrT = vec3(0.0, 1.0, 0.0);
vec3 hrCol = vec3(1.0);
float hrShift = 0.0;
float hr_hash(float x) { return fract(sin(x * 127.1 + 17.3) * 43758.5453); }
`;

const KK = `vec3 irradiance = dotNL * directLight.color;
	{
		// Kajiya-Kay: highlight where the half vector is perpendicular to the strand.
		vec3 hL = directLight.direction;
		vec3 hH = normalize( hL + geometryViewDir );
		vec3 hT = normalize( hrT );
		vec3 hT1 = normalize( hT + geometryNormal * ( hrShift - 0.1 ) );
		vec3 hT2 = normalize( hT + geometryNormal * ( hrShift + 0.25 ) );
		float hd1 = dot( hT1, hH );
		float hd2 = dot( hT2, hH );
		float hs1 = pow( sqrt( max( 0.0, 1.0 - hd1 * hd1 ) ), 180.0 );
		float hs2 = pow( sqrt( max( 0.0, 1.0 - hd2 * hd2 ) ), 48.0 );
		float hAtt = saturate( dot( geometryNormal, hL ) * 3.0 + 0.25 );
		reflectedLight.directSpecular += directLight.color * ( vec3( 0.07 * hs1 ) + hrCol * 0.22 * hs2 ) * hAtt;
		// Light that passes through the hair.
		reflectedLight.directDiffuse += directLight.color * hrCol * RECIPROCAL_PI * 0.3 * saturate( dot( - geometryNormal, hL ) );
	}`;

function patchHair(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + VERT_PARS)
    .replace(
      '#include <defaultnormal_vertex>',
      `#include <defaultnormal_vertex>
      {
        vec3 objStrand = strand;
        #ifdef USE_SKINNING
          objStrand = ( skinMatrix * vec4( objStrand, 0.0 ) ).xyz;
        #endif
        vStrand = normalize( normalMatrix * objStrand );
      }`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
    .replace('#include <lights_physical_pars_fragment>', THREE.ShaderChunk.lights_physical_pars_fragment.replace('vec3 irradiance = dotNL * directLight.color;', KK))
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      {
        hrT = vStrand;
        hrCol = diffuseColor.rgb;
        #ifdef USE_MAP
          hrShift = ( hr_hash( floor( vMapUv.x * 90.0 ) ) - 0.5 ) * 0.3;
        #endif
      }`,
    );
}

/** The shared hair material (created once). */
export function hairMaterial(): THREE.MeshStandardMaterial {
  if (mat) return mat;
  mat = new THREE.MeshStandardMaterial({
    name: 'real-hair',
    vertexColors: true,
    map: hairTexture(),
    side: THREE.DoubleSide,
    alphaTest: 0.42,
    alphaToCoverage: a2c,
    roughness: 0.85,
    metalness: 0,
    envMapIntensity: 0.55,
  });
  mat.onBeforeCompile = patchHair;
  mat.customProgramCacheKey = () => 'real-hair-v1';
  return mat;
}
