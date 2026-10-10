/**
 * The cloth materials of the realistic bodies: avatarMaterial with the blotchy wool / linen mottling
 * replaced by woven cloth, plus a soft fabric sheen.
 *
 *   realClothMaterial   the cloth group of the body at LOD 0. Its triangles carry a smooth per-vertex `cover`
 *                       (0.5 on the true garment border, see paint.ts); fragments below 0.44 are discarded and
 *                       the edge is alpha-to-coverage blended, so hems and sleeve ends are clean lines. A narrow
 *                       band just inside the border is darkened a little (a turned hem, a seam).
 *   realShellMaterial   the shell garments (skirts, togas, cloaks; no `cover`).
 *
 * Both share the cloth look. Large folds come from the geometry; the material adds only what is too small for
 * it: a plain weave (wool: coarser, with a twill hint; linen: finer, with slubs) as a height bump and a faint
 * thread shade, a whisper of dye variation, and a sheen that brightens the lit cloth toward grazing angles
 * (the fuzz of wool, the glint of linen). The weave and its bump fade with distance through screen-space
 * derivatives, like the skin's pores (real/skin.ts), so nothing shimmers beyond a few metres.
 * A small polygon offset keeps the body cloth in front of the skin it lies on.
 */
import * as THREE from 'three';
import { avatarMaterial } from '../../material';

let cloth: THREE.MeshStandardMaterial | null = null;
let shell: THREE.MeshStandardMaterial | null = null;

/** Replaces avatarMaterial's cloth pattern (it runs right before `diffuseColor.rgb *= avTint * avTint3`). */
const WEAVE = /* glsl */ `
float rcSheen = 0.0;
if (vPat > 2.5 && vPat < 3.5 || (vPat > 4.5 && vPat < 5.5)) {
  bool lin = vPat > 4.5;
  vec2 rcUv = av_uv();
  vec2 g = rcUv / (lin ? 0.0016 : 0.0028);
  float fade = 1.0 - smoothstep(0.22, 0.65, length(fwidth(g)));
  float wx = sin(g.x * 6.2832);
  float wy = sin(g.y * 6.2832);
  float weave = wx * wy * 0.5 + 0.5;
  float extra = lin ? av_noise(vec2(floor(g.x), floor(g.y) * 0.31)) : sin((g.x - g.y) * 3.1416) * 0.5 + 0.5;
  avH = (weave * 0.8 + extra * 0.2) * fade;
  avBump = lin ? 0.12 : 0.2;
  avRough = 0.0;
  float dye = av_noise(rcUv * 7.0);
  avTint = (0.985 + 0.03 * dye) * (1.0 - 0.03 * fade * (1.0 - weave));
  // Undyed wool is never paper white: the brightest albedos are eased down so folds keep their shading.
  avTint *= 1.0 - 0.32 * smoothstep(0.4, 0.8, dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)));
  rcSheen = lin ? 0.5 : 0.32;
}
`;

/** After the lights: lit cloth brightens toward grazing angles. */
const SHEEN = /* glsl */ `
if (rcSheen > 0.0) {
  float rcRim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 3.0);
  reflectedLight.directDiffuse *= 1.0 + rcRim * rcSheen;
  reflectedLight.indirectDiffuse *= 1.0 + rcRim * rcSheen * 0.6;
}
`;

function patch(shader: { vertexShader: string; fragmentShader: string }, withCover: boolean) {
  shader.fragmentShader = shader.fragmentShader
    .replace('diffuseColor.rgb *= avTint * avTint3;', `${WEAVE}\ndiffuseColor.rgb *= avTint * avTint3;`)
    .replace('#include <aomap_fragment>', `#include <aomap_fragment>\n${SHEEN}`);
  if (!withCover) return;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float cover;\nvarying float vCover;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCover = cover;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vCover;')
    .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vCover < 0.44) discard;')
    .replace(
      '#include <color_fragment>',
      // The edge band: darker just inside the border, with a faint stitched line about a centimetre in.
      '#include <color_fragment>\ndiffuseColor.a = smoothstep(0.44, 0.56, vCover);\nfloat rcEdge = 1.0 - 0.2 * (1.0 - smoothstep(0.5, 0.64, vCover)) - 0.07 * exp(-((vCover - 0.7) / 0.025) * ((vCover - 0.7) / 0.025));',
    )
    .replace('diffuseColor.rgb *= avTint * avTint3;', 'diffuseColor.rgb *= avTint * avTint3 * rcEdge;');
}

function make(name: string, withCover: boolean): THREE.MeshStandardMaterial {
  const base = avatarMaterial();
  const m = new THREE.MeshStandardMaterial();
  m.copy(base);
  m.name = name;
  if (withCover) {
    m.alphaToCoverage = true;
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -2;
  }
  m.onBeforeCompile = (shader, renderer) => {
    base.onBeforeCompile(shader, renderer);
    patch(shader, withCover);
  };
  m.customProgramCacheKey = () => `skyrome-${name}-v2`;
  return m;
}

export function realClothMaterial(): THREE.MeshStandardMaterial {
  return (cloth ??= make('real-cloth', true));
}

/** For the shell garments' SkinnedMesh (RealBody.applyShells). */
export function realShellMaterial(): THREE.MeshStandardMaterial {
  return (shell ??= make('real-shell', false));
}
