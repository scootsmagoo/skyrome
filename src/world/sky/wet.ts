/**
 * Rain-wet look for every MeshStandardMaterial / MeshPhysicalMaterial: surfaces darken and
 * upward-facing ones turn glossy (they then reflect the grey sky through the environment map).
 * On flat ground, puddles gather in the hollows (world-space noise) and spread as the wetness
 * rises: mirror-smooth, flat (the stone's normal map drowns) and dark (water over the albedo), so
 * they show the sky by day and the lamps by night.
 * One shared uniform drives all materials; metals are left alone.
 *
 * Known limitation: there is no rain occlusion, so floors under roofs get wet too. Keep the
 * effect moderate, and set `skyWetUniform.value.y` (max wetness) to 0 inside buildings.
 */
import * as THREE from 'three';
import type { SharedVec4 } from './fog';

/** x: wetness 0..1; y: cap (1 outdoors, 0 to disable); z: darkening; w: gloss. */
export const skyWetUniform = { value: { x: 0, y: 1, z: 0.38, w: 0.55 } as SharedVec4 };

const PATCH = /* glsl */ `
{
  // Rain-wet surfaces (src/world/sky/wet.ts).
  float skyWetAmt = skyWet.x * skyWet.y * ( 1.0 - metalnessFactor );
  if ( skyWetAmt > 0.001 ) {
    vec3 skyUpV = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
    float skyUp = clamp( dot( normal, skyUpV ), 0.0, 1.0 );
    float skyW = skyWetAmt * ( 0.4 + 0.6 * skyUp );
    diffuseColor.rgb *= 1.0 - skyWet.z * skyW;
    roughnessFactor = mix( roughnessFactor, roughnessFactor * ( 1.0 - skyWet.w ), skyWetAmt * smoothstep( 0.5, 0.95, skyUp ) );
    if ( skyUp > 0.96 && skyWetAmt > 0.3 ) {
      vec3 skyWp = cameraPosition + transpose( mat3( viewMatrix ) ) * ( -vViewPosition );
      float skyN = skyPuddleNoise( skyWp.xz * 0.32 ) * 0.7 + skyPuddleNoise( skyWp.xz * 1.3 + 9.0 ) * 0.3;
      float skyEdge = 0.66 - 0.14 * smoothstep( 0.3, 1.0, skyWetAmt );
      float skyP = smoothstep( skyEdge, skyEdge + 0.04, skyN ) * smoothstep( 0.96, 0.99, skyUp );
      diffuseColor.rgb *= 1.0 - 0.45 * skyP;
      roughnessFactor = mix( roughnessFactor, 0.1, skyP );
      normal = normalize( mix( normal, skyUpV, skyP ) );
    }
  }
}
`;

const PARS = /* glsl */ `
uniform vec4 skyWet;
float skyPuddleHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float skyPuddleNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( skyPuddleHash( i ), skyPuddleHash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( skyPuddleHash( i + vec2( 0.0, 1.0 ) ), skyPuddleHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
`;

let installed = false;

export function installWetness() {
  if (installed) return;
  installed = true;
  const chunks = THREE.ShaderChunk as unknown as Record<string, string>;
  chunks.lights_physical_fragment = PATCH + chunks.lights_physical_fragment;
  chunks.lights_physical_pars_fragment = PARS + chunks.lights_physical_pars_fragment;
  for (const k of ['standard', 'physical'] as const) THREE.ShaderLib[k].uniforms.skyWet = skyWetUniform;
}
