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
 * and the fog degrades to plain exponential fog with the scene color.
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
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogRay;
  uniform vec4 skyFogSun;
  uniform vec4 skyFogSunColor;
  uniform vec4 skyFogParams;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif
`;

const FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float skyFogDist = length( vFogRay );
    vec3 skyFogDir = vFogRay / max( skyFogDist, 1e-4 );
    float skyFogK = skyFogSunColor.w;
    float skyFogDy = vFogRay.y * skyFogK;
    float skyFogOD = fogDensity * exp( - skyFogK * ( cameraPosition.y - skyFogParams.x ) ) * skyFogDist
      * ( abs( skyFogDy ) > 1e-4 ? ( 1.0 - exp( - skyFogDy ) ) / skyFogDy : 1.0 );
    float fogFactor = ( 1.0 - exp( - skyFogOD ) ) * ( skyFogParams.y > 0.0 ? skyFogParams.y : 1.0 );
    vec3 skyFogCol = fogColor + skyFogSunColor.rgb * pow( max( dot( skyFogDir, skyFogSun.xyz ), 0.0 ), max( skyFogSun.w, 1.0 ) );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    vec3 skyFogCol = fogColor;
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, skyFogCol, fogFactor );
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
