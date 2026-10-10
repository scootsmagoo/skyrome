/**
 * Aerial-perspective fog for every built-in material.
 *
 * Replaces three's fog shader chunks (once, when the sky is installed) with exponential HEIGHT fog
 * whose color brightens toward the sun, so distant hills dissolve into the same haze the sky dome
 * shows at the horizon and sunsets glow through the air. The scene keeps a normal `THREE.FogExp2`
 * (color + density); three extra uniforms are shared by reference with every material through
 * `ShaderLib`/`UniformsLib`, so updating them once per frame updates all shaders.
 *
 * Custom ShaderMaterials with `fog: true` keep working: if they were built from
 * `UniformsLib.fog` after installation they get the extra uniforms; otherwise those read as zero
 * and the fog degrades to plain exponential fog with the scene color. The fog is applied before
 * tone mapping whatever order a shader includes the chunks in (see FRAGMENT).
 */
import * as THREE from 'three';

/** Plain {x,y,z,w} objects (NOT Vector4) so `UniformsUtils.clone` shares them by reference. */
export interface SharedVec4 {
  x: number;
  y: number;
  z: number;
  w: number;
}

export const skyFogUniforms = {
  /** xyz: direction toward the sun; w: in-scatter phase exponent. */
  skyFogSun: { value: { x: 0, y: 1, z: 0, w: 8 } as SharedVec4 },
  /** rgb: extra in-scattered color toward the sun; w: height falloff (1/m). */
  skyFogSunColor: { value: { x: 0, y: 0, z: 0, w: 0.012 } as SharedVec4 },
  /** x: base height (m) where density = fogDensity; y: max opacity (0 → 1). */
  skyFogParams: { value: { x: 0, y: 1, z: 0, w: 0 } as SharedVec4 },
  /** rgb: the air's colour looking well above the horizon (sky in-scatter); w: how far rays that climb take it on (0 = off). */
  skyFogUp: { value: { x: 0, y: 0, z: 0, w: 0 } as SharedVec4 },
};

const PARS_VERTEX = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogRay;
#endif
`;

const VERTEX = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  // World-space offset from the camera (view rotation is orthonormal: R^T * v == v * R).
  vFogRay = mvPosition.xyz * mat3( viewMatrix );
#endif
`;

const PARS_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  #define SKY_FOG_PARS
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogRay;
  uniform vec4 skyFogSun;
  uniform vec4 skyFogSunColor;
  uniform vec4 skyFogParams;
  uniform vec4 skyFogUp;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif
`;

/**
 * The fog mix, in scene-linear light (as the sky dome does it). three includes `<fog_fragment>`
 * AFTER tone mapping and the output encode, and to match it uploads `fogColor` in the OUTPUT color
 * space when drawing to the canvas. Into PostFX's linear HDR target that is all a no-op; with
 * post-processing off it leaves the haze un-exposed and inconsistent with the dome. So:
 *  - the same code is prepended to `<tonemapping_fragment>`: whichever chunk comes first applies
 *    the fog, once (`SKY_FOG_APPLIED`), and that is before tone mapping in every three material;
 *  - when the output is encoded (sRGB canvas) `fogColor` is decoded back to linear. The test
 *    folds to a constant. (A Display-P3 canvas would be decoded without its gamut matrix.)
 */
const FRAGMENT = /* glsl */ `
#if defined( USE_FOG ) && defined( SKY_FOG_PARS ) && ! defined( SKY_FOG_APPLIED )
#define SKY_FOG_APPLIED
{
  vec3 skyFogBase = fogColor;
  if ( linearToOutputTexel( vec4( 0.25 ) ).r > 0.3 ) skyFogBase = sRGBTransferEOTF( vec4( fogColor, 1.0 ) ).rgb;
  #ifdef FOG_EXP2
    float skyFogDist = length( vFogRay );
    vec3 skyFogDir = vFogRay / max( skyFogDist, 1e-4 );
    float skyFogK = skyFogSunColor.w;
    float skyFogDy = vFogRay.y * skyFogK;
    float skyFogOD = fogDensity * exp( - skyFogK * ( cameraPosition.y - skyFogParams.x ) ) * skyFogDist
      * ( abs( skyFogDy ) > 1e-4 ? ( 1.0 - exp( - skyFogDy ) ) / skyFogDy : 1.0 );
    // Aerial perspective: red is extinguished a little faster than blue (far hills go blue), and
    // rays that climb see the air take on the sky's colour above the horizon, not the haze band's.
    vec3 fogFactor = ( 1.0 - exp( - skyFogOD * vec3( 1.22, 1.0, 0.8 ) ) ) * ( skyFogParams.y > 0.0 ? skyFogParams.y : 1.0 );
    skyFogBase = mix( skyFogBase, skyFogUp.rgb, skyFogUp.w * smoothstep( 0.02, 0.55, skyFogDir.y ) );
    vec3 skyFogCol = skyFogBase + skyFogSunColor.rgb * pow( max( dot( skyFogDir, skyFogSun.xyz ), 0.0 ), max( skyFogSun.w, 1.0 ) );
  #else
    vec3 fogFactor = vec3( smoothstep( fogNear, fogFar, vFogDepth ) );
    vec3 skyFogCol = skyFogBase;
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, skyFogCol, fogFactor );
}
#endif
`;

let installed = false;

/** Patch the fog chunks and share the extra uniforms with every built-in shader. Idempotent. */
export function installSkyFog() {
  if (installed) return;
  installed = true;
  const chunks = THREE.ShaderChunk as unknown as Record<string, string>;
  chunks.fog_pars_vertex = PARS_VERTEX;
  chunks.fog_vertex = VERTEX;
  chunks.fog_pars_fragment = PARS_FRAGMENT;
  chunks.fog_fragment = FRAGMENT;
  chunks.tonemapping_fragment = FRAGMENT + chunks.tonemapping_fragment;
  const add = (u: Record<string, THREE.IUniform>) => {
    if (!('fogColor' in u)) return;
    for (const [k, v] of Object.entries(skyFogUniforms)) u[k] = v;
  };
  add(THREE.UniformsLib.fog as unknown as Record<string, THREE.IUniform>);
  for (const shader of Object.values(THREE.ShaderLib)) add(shader.uniforms);
}

/** CPU twin of the GLSL fog factor (for tests and gameplay queries such as visibility). */
export function fogFactor(density: number, falloff: number, baseHeight: number, cameraY: number, ray: { x: number; y: number; z: number }): number {
  const dist = Math.hypot(ray.x, ray.y, ray.z);
  const dy = ray.y * falloff;
  const k = Math.abs(dy) > 1e-4 ? (1 - Math.exp(-dy)) / dy : 1;
  const od = density * Math.exp(-falloff * (cameraY - baseHeight)) * dist * k;
  return 1 - Math.exp(-od);
}
