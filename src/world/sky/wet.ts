/**
 * Rain-wet look for every MeshStandardMaterial / MeshPhysicalMaterial: surfaces darken and
 * upward-facing ones turn glossy (they then reflect the grey sky through the environment map).
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
  }
}
`;

let installed = false;

export function installWetness() {
  if (installed) return;
  installed = true;
  const chunks = THREE.ShaderChunk as unknown as Record<string, string>;
  chunks.lights_physical_fragment = PATCH + chunks.lights_physical_fragment;
  chunks.lights_physical_pars_fragment = 'uniform vec4 skyWet;\n' + chunks.lights_physical_pars_fragment;
  for (const k of ['standard', 'physical'] as const) THREE.ShaderLib[k].uniforms.skyWet = skyWetUniform;
}
