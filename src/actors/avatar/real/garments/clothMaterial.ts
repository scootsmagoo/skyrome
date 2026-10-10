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
import { B } from '../../rig';

let cloth: THREE.MeshStandardMaterial | null = null;
let shell: THREE.MeshStandardMaterial | null = null;

/** Replaces avatarMaterial's cloth pattern (it runs right before `diffuseColor.rgb *= avTint * avTint3`). */
const WEAVE = /* glsl */ `
float rcSheen = 0.0;
float rcAo = 1.0;
// Derivatives are taken in uniform control flow (outside the pattern branch), then used inside it.
vec2 rcUv = av_uv();
vec2 rcGw = rcUv / 0.0028;
vec2 rcGl = rcUv / 0.0016;
float rcFadeW = 1.0 - smoothstep(0.22, 0.65, length(fwidth(rcGw)));
float rcFadeL = 1.0 - smoothstep(0.22, 0.65, length(fwidth(rcGl)));
if (vPat > 2.5 && vPat < 3.5 || (vPat > 4.5 && vPat < 5.5)) {
  bool lin = vPat > 4.5;
  vec2 g = lin ? rcGl : rcGw;
  float fade = lin ? rcFadeL : rcFadeW;
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

/**
 * Baked cloth (shell garments from the cloth simulation, garments/fit.ts; patterns 12 wool and 13 linen): the
 * weave runs along the cloth's own threads (pattern coordinates), borders (the praetexta's purple, a stola's
 * trim) are bands at a set distance from the bordered edge, the clavi run down the cloth, the turned hem's rim
 * is a shade darker, and the baked occlusion (surf.y) shades the folds' creases. Runs after WEAVE.
 */
const BAKED = /* glsl */ `
vec2 rbGw = vCloth.zw / 0.0028;
vec2 rbGl = vCloth.zw / 0.0016;
float rbFadeW = 1.0 - smoothstep(0.22, 0.65, length(fwidth(rbGw)));
float rbFadeL = 1.0 - smoothstep(0.22, 0.65, length(fwidth(rbGl)));
float rbAa = max(fwidth(vCloth.x) * 0.75, 0.0008);
float rbAaC = max(fwidth(vClavus.x) * 0.75, 0.0006);
if (vPat > 11.5 && vPat < 13.5) {
  bool lin = vPat > 12.5;
  vec2 g = lin ? rbGl : rbGw;
  float fade = lin ? rbFadeL : rbFadeW;
  float wx = sin(g.x * 6.2832);
  float wy = sin(g.y * 6.2832);
  float weave = wx * wy * 0.5 + 0.5;
  float extra = lin ? av_noise(vec2(floor(g.x), floor(g.y) * 0.31)) : sin((g.x - g.y) * 3.1416) * 0.5 + 0.5;
  avH = (weave * 0.8 + extra * 0.2) * fade;
  avBump = lin ? 0.12 : 0.2;
  float dye = av_noise(vCloth.zw * 7.0);
  avTint = (0.985 + 0.03 * dye) * (1.0 - 0.03 * fade * (1.0 - weave));
  avTint *= 1.0 - 0.32 * smoothstep(0.4, 0.8, dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)));
  float band = vTrim.w > 0.0 ? 1.0 - smoothstep(vTrim.w - rbAa, vTrim.w + rbAa, vCloth.x) : 0.0;
  diffuseColor.rgb = mix(diffuseColor.rgb, vTrim.rgb, band);
  float cl = step(1.5, vClavus.w) * (1.0 - smoothstep(vClavus.z - rbAaC, vClavus.z + rbAaC, abs(vClavus.x)));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.078, 0.009, 0.04), cl);
  avTint *= 1.0 - 0.14 * vSurf.w;
  avDust = (1.0 - smoothstep(0.02, 0.24 + 0.18 * av_noise(vCloth.zw * 9.0), vRest.y)) * 0.24;
  rcSheen = lin ? 0.5 : 0.32;
  // Baked occlusion, never black: a vertex the simulation sandwiched between two layers bakes to 0, and a big
  // decimated triangle would carry that dark corner out into the light.
  rcAo = 0.3 + 0.7 * vSurf.y;
}
`;

/**
 * Legs inside long cloth (vertex shader, after skinning): a skirt vertex below the crotch is pushed out of the
 * capsule round the thigh or shin at its height (axis and radius per vertex in `legs`, the bone matrices from
 * the skeleton), so a striding leg presses the cloth forward instead of poking through it.
 */
const LEG_PUSH = /* glsl */ `
#ifdef USE_SKINNING
if (legs.z > 0.0) {
  for (int k = 0; k < 2; k++) {
    float side = k == 0 ? 1.0 : -1.0;
    float bi = legs.w < 1.5 ? (k == 0 ? ${B.thighL}.0 : ${B.thighR}.0) : (k == 0 ? ${B.shinL}.0 : ${B.shinR}.0);
    mat4 bm = bindMatrixInverse * getBoneMatrix(bi) * bindMatrix;
    vec3 la = (bm * vec4(side * legs.x, position.y, legs.y, 1.0)).xyz;
    vec3 ld = normalize(mat3(bm) * vec3(0.0, -1.0, 0.0));
    vec3 lq = transformed - la;
    float lt = clamp(dot(lq, ld), -0.12, 0.12);
    vec3 lr = lq - ld * lt;
    float lrl = length(lr);
    if (lrl < legs.z && lrl > 1e-4) transformed += lr * (legs.z / lrl - 1.0);
  }
}
#endif
`;

/** After the lights: lit cloth brightens toward grazing angles; baked occlusion darkens the creases. */
const SHEEN = /* glsl */ `
if (rcAo < 0.999) {
  reflectedLight.indirectDiffuse *= rcAo;
  reflectedLight.indirectSpecular *= rcAo;
  reflectedLight.directDiffuse *= mix(1.0, rcAo, 0.5);
}
if (rcSheen > 0.0) {
  float rcRim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 3.0);
  reflectedLight.directDiffuse *= 1.0 + rcRim * rcSheen;
  reflectedLight.indirectDiffuse *= 1.0 + rcRim * rcSheen * 0.6;
}
`;

/** The clavi: stripes drawn per pixel from the bind-pose x (a vertex attribute), so they are crisp lines. */
const CLAVI = /* glsl */ `
{
  float rcAa = max(fwidth(vClavus.x) * 0.75, 0.0006);
  float rcCl = step(1.5, vClavus.w) * (1.0 - smoothstep(vClavus.z - rcAa, vClavus.z + rcAa, abs(abs(vClavus.x) - vClavus.y)));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.078, 0.009, 0.04) * (0.9 + 0.1 * avTint), rcCl);
}
`;

function patch(shader: { vertexShader: string; fragmentShader: string }, withCover: boolean) {
  shader.fragmentShader = shader.fragmentShader
    .replace('diffuseColor.rgb *= avTint * avTint3;', `${WEAVE}\n${withCover ? '' : BAKED}\ndiffuseColor.rgb *= avTint * avTint3;`)
    .replace('#include <aomap_fragment>', `#include <aomap_fragment>\n${SHEEN}`);
  if (!withCover) {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec4 cloth;\nattribute vec4 trim;\nattribute vec4 clavus;\nattribute vec4 legs;\nvarying vec4 vCloth;\nvarying vec4 vTrim;\nvarying vec4 vClavus;',
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCloth = cloth;\nvTrim = trim;\nvClavus = clavus;')
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>\n${LEG_PUSH}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vCloth;\nvarying vec4 vTrim;\nvarying vec4 vClavus;');
    return;
  }
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float cover;\nattribute vec4 clavus;\nvarying float vCover;\nvarying vec4 vClavus;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCover = cover;\nvClavus = clavus;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vCover;\nvarying vec4 vClavus;')
    .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vCover < 0.44) discard;')
    .replace(
      '#include <color_fragment>',
      // The edge band: darker just inside the border, with a faint stitched line about a centimetre in.
      '#include <color_fragment>\ndiffuseColor.a = smoothstep(0.44, 0.56, vCover);\nfloat rcEdge = 1.0 - 0.2 * (1.0 - smoothstep(0.5, 0.64, vCover)) - 0.07 * exp(-((vCover - 0.7) / 0.025) * ((vCover - 0.7) / 0.025));',
    )
    .replace('diffuseColor.rgb *= avTint * avTint3;', `diffuseColor.rgb *= avTint * avTint3 * rcEdge;\n${CLAVI}`);
}

function make(name: string, withCover: boolean): THREE.MeshStandardMaterial {
  const base = avatarMaterial();
  const m = new THREE.MeshStandardMaterial();
  m.copy(base);
  m.name = name;
  if (withCover) {
    // Its alpha is the hem's coverage: it keeps it (avatarMaterial otherwise writes 0, the post chain's mark).
    m.defines = { ...m.defines, AV_KEEP_ALPHA: '' };
    m.alphaToCoverage = true;
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -2;
  } else {
    // Baked cloth is a single sheet: its inside shows under hems, in the sinus and inside cloaks.
    m.side = THREE.DoubleSide;
  }
  m.onBeforeCompile = (shader, renderer) => {
    base.onBeforeCompile(shader, renderer);
    patch(shader, withCover);
  };
  m.customProgramCacheKey = () => `skyrome-${name}-v6`;
  return m;
}

export function realClothMaterial(): THREE.MeshStandardMaterial {
  return (cloth ??= make('real-cloth', true));
}

/** For the shell garments' SkinnedMesh (RealBody.applyShells). */
export function realShellMaterial(): THREE.MeshStandardMaterial {
  return (shell ??= make('real-shell', false));
}
