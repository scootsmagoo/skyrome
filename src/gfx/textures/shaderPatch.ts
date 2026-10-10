/**
 * Cheap anti-tiling for the shared materials, injected with `onBeforeCompile`:
 *
 * - SK_MACRO: world-space 3D value noise (2 octaves, ALU only) modulates albedo brightness and
 *   shifts it slightly warm/cool, so a 2 m texture repeating over a 100 m wall no longer reads as
 *   a grid. Strength per material via the `skMacro` uniform.
 * - SK_DETILE: natural ground (grass, dirt, sand…) also blends a second, rotated and rescaled
 *   sample of the albedo map by a low-frequency noise mask. One extra texture fetch.
 *
 * - SK_CONTRAST: pulls the albedo map towards its own mean (`skContrast` 1 = unchanged). White
 *   marble scans carry strong grey veining that, in shade with no AO, dominates the forms of
 *   columns and mouldings; at 0.5–0.6 the veins stay visible but the shading reads first.
 *
 * - SK_WEATHER: walls weather. A band of grime splashed up from the street at their feet (height
 *   above the terrain from the heightmap texture, with a ragged noisy top edge) and soft rain
 *   streaks running down them. Only on steep faces (flat normal from screen derivatives, so it
 *   needs no extra varying). Strength per material via `skWeather`; the ground grid is shared and
 *   set once the terrain exists (`setWeatherGround`); before that only the streaks show.
 *   The same block grows moss on the lowest metre and a half and a few columns of ivy up the wall.
 *
 * - SK_SPECAA: specular anti-aliasing. The roughness is widened by the screen-space variance of the
 *   shading normal (Tokuyoshi/Kaplanis), so a normal-mapped stone far away stops sparkling and the
 *   highlight on a distant column stays a highlight instead of crawling.
 * - SK_DETAIL: a second look at the material's own normal map at ~5.3x the frequency and rotated,
 *   added onto the first (strength `skDetail`, fading out beyond ~18 m where mips would average it
 *   away anyway). Close up, the stone, plaster, paving and cloth gain grain the 2 m scan lacks.
 * - SK_MOTTLE: two octaves of stone-scale value noise (about 0.3 and 0.15 m) modulate the albedo
 *   a little per "stone", so a wall of one scan no longer carries the same stone colour everywhere.
 * - SK_WEAR: horizontal surfaces (paving) get worn patches in streaks along both ground axes:
 *   lighter, smoother (traffic polish) in the patch and a touch of dirt between them.
 * - SK_GRAIN: fine world-space grain bump (derivative bump mapping, no tangents needed, gone past ~9 m).
 * - SK_FLAKE: plaster walls lose patches of their skin (most of them low down) and show the brick or
 *   tufa beneath, rougher, with a darker rim around each patch.
 *
 * Every patched material shares the same shader source, so Three compiles one program per
 * define combination and only the uniform values differ per material.
 */
import * as THREE from 'three';

const NOISE = /* glsl */ `
varying vec3 vSkWorld;
uniform sampler2D skNoiseTex;
uniform float skMacro;
uniform float skContrast;
uniform vec3 skMean;
uniform float skDetail;
uniform float skMottle;
uniform float skWear;
uniform float skGrain;
uniform float skFlake;
uniform float skPuddle;
float skPuddleK = 0.0;
float skWearK = 0.0;
float skFlakeK = 0.0;
#ifdef SK_WEATHER
uniform float skWeather;
uniform highp sampler2D skGround;
uniform vec4 skGroundGrid; // minX, minZ, spacing, 1 when set
uniform vec2 skGroundN;
float skGroundAt( vec2 xz ) {
  vec2 f = clamp( ( xz - skGroundGrid.xy ) / skGroundGrid.z, vec2( 0.0 ), skGroundN - 1.001 );
  ivec2 i0 = ivec2( floor( f ) );
  ivec2 i1 = i0 + 1;
  vec2 t = fract( f );
  float a = texelFetch( skGround, i0, 0 ).r;
  float b = texelFetch( skGround, ivec2( i1.x, i0.y ), 0 ).r;
  float c = texelFetch( skGround, ivec2( i0.x, i1.y ), 0 ).r;
  float d = texelFetch( skGround, i1, 0 ).r;
  return mix( mix( a, b, t.x ), mix( c, d, t.x ), t.y );
}
#endif
// Value noise from one fetch of a tiny periodic lattice texture (period 32 units; the 3D point is
// sheared onto the plane), which the mips also filter once the frequency outruns the pixels.
float skNoise( vec3 x ) {
  return texture2D( skNoiseTex, vec2( x.x + x.y * 0.6180339, x.z + x.y * 0.4142136 ) * ( 1.0 / 32.0 ) ).r;
}
`;

const VERTEX_WORLD = /* glsl */ `
#include <project_vertex>
{
  vec4 skWp = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
    skWp = batchingMatrix * skWp;
  #endif
  #ifdef USE_INSTANCING
    skWp = instanceMatrix * skWp;
  #endif
  vSkWorld = ( modelMatrix * skWp ).xyz;
}
`;

const MAP_FRAGMENT = /* glsl */ `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  #ifdef SK_DETILE
  {
    float skW = smoothstep( 0.35, 0.65, skNoise( vSkWorld * 0.13 + 5.0 ) );
    vec2 skUv = mat2( 0.8, -0.6, 0.6, 0.8 ) * vMapUv * 0.71 + vec2( 0.37, 0.61 );
    sampledDiffuseColor = mix( sampledDiffuseColor, texture2D( map, skUv ), skW );
  }
  #endif
  #ifdef SK_CONTRAST
    sampledDiffuseColor.rgb = mix( skMean, sampledDiffuseColor.rgb, skContrast );
  #endif
  diffuseColor *= sampledDiffuseColor;
#endif
#ifdef SK_MACRO
{
  float skA = skNoise( vSkWorld * 0.09 ) * 0.62 + skNoise( vSkWorld * 0.41 + 17.0 ) * 0.38;
  float skB = skNoise( vSkWorld * 0.035 + 31.0 );
  diffuseColor.rgb *= 1.0 + skMacro * ( skA * 2.0 - 1.0 );
  diffuseColor.rgb *= mix( vec3( 1.0 ), mix( vec3( 0.96, 0.98, 1.03 ), vec3( 1.04, 1.0, 0.94 ), skB ), clamp( skMacro * 6.0, 0.0, 1.0 ) );
}
#endif
#ifdef SK_MOTTLE
{
  float skM = skNoise( vSkWorld * 3.3 + 41.0 ) * 0.65 + skNoise( vSkWorld * 7.9 + 9.0 ) * 0.35;
  float skMf = 1.0 - smoothstep( 40.0, 140.0, length( vSkWorld - cameraPosition ) );
  diffuseColor.rgb *= 1.0 + skMottle * skMf * ( skM * 2.0 - 1.0 );
}
#endif
#ifdef SK_WEAR
{
  vec3 skWn = normalize( cross( dFdx( vSkWorld ), dFdy( vSkWorld ) ) );
  float skFlat = smoothstep( 0.75, 0.95, abs( skWn.y ) );
  // Streaks along x and along z cross into patches; only where both agree is the stone polished.
  float skA1 = skNoise( vec3( vSkWorld.x * 0.07, 0.0, vSkWorld.z * 0.9 ) + 71.0 );
  float skA2 = skNoise( vec3( vSkWorld.x * 0.9, 0.0, vSkWorld.z * 0.07 ) + 13.0 );
  float skP = smoothstep( 0.42, 0.72, max( skA1, skA2 ) * 0.7 + skNoise( vSkWorld * 0.31 + 5.0 ) * 0.3 );
  skWearK = skP * skFlat * skWear;
  diffuseColor.rgb *= 1.0 + 0.2 * skWearK - 0.05 * ( 1.0 - skP ) * skFlat * skWear;
}
#endif
#ifdef SK_PUDDLE
{
  // Street wetness: damp darker patches where water stands after rain, and small clear puddles in
  // the hollows (darker, glassy, flat), with a few dung and oil smudges. World-space, flat faces only.
  vec3 skPn = normalize( cross( dFdx( vSkWorld ), dFdy( vSkWorld ) ) );
  float skPf = smoothstep( 0.8, 0.96, abs( skPn.y ) );
  float skPh = skNoise( vec3( vSkWorld.x * 0.13, 0.0, vSkWorld.z * 0.13 ) + 37.0 ) * 0.62 + skNoise( vec3( vSkWorld.x * 0.41, 0.0, vSkWorld.z * 0.41 ) + 5.0 ) * 0.38;
  float skDampP = smoothstep( 0.44, 0.6, skPh ) * skPf * skPuddle;
  skPuddleK = smoothstep( 0.6, 0.64, skPh ) * skPf * skPuddle;
  float skSm = smoothstep( 0.72, 0.8, skNoise( vSkWorld * 2.1 + 53.0 ) * 0.7 + skNoise( vSkWorld * 6.7 + 3.0 ) * 0.3 ) * skPf * skPuddle;
  diffuseColor.rgb *= 1.0 - 0.4 * skDampP - 0.3 * skPuddleK - 0.35 * skSm;
  diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.9, 0.85, 0.75 ), skDampP * 0.5 );
  skPuddleK = max( skPuddleK, skDampP * 0.35 );
}
#endif
#ifdef SK_WEATHER
{
  vec3 skN = normalize( cross( dFdx( vSkWorld ), dFdy( vSkWorld ) ) );
  float skVert = 1.0 - smoothstep( 0.35, 0.75, abs( skN.y ) );
  {  // (no branch: skNoise samples a texture, whose mips need uniform control flow)
    // Grime: up to ~0.6–1.6 m above the street, with a ragged top edge.
    float skH = skGroundGrid.w > 0.0 ? vSkWorld.y - skGroundAt( vSkWorld.xz ) : 100.0;
    float skTop = 0.6 + 1.0 * skNoise( vec3( vSkWorld.x * 0.7, 0.0, vSkWorld.z * 0.7 ) + 3.0 );
    float skG = 1.0 - smoothstep( skTop * 0.25, skTop, max( skH, 0.0 ) );
    diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.56, 0.5, 0.43 ), min( 1.0, skG * 0.85 * skWeather * skVert ) );
    // Rising damp: the lowest handspan stays wet and dark, with a green-black bloom where it is shaded.
    float skDamp = ( 1.0 - smoothstep( 0.02, 0.18 + 0.22 * skNoise( vec3( vSkWorld.x * 1.9, 0.0, vSkWorld.z * 1.9 ) + 23.0 ), max( skH, 0.0 ) ) ) * skVert * skWeather * ( skGroundGrid.w > 0.0 ? 1.0 : 0.0 );
    diffuseColor.rgb *= 1.0 - 0.38 * skDamp;
    // Contact grime: a tight dark line where wall meets ground, with splash flecks just above it.
    float skCon = ( 1.0 - smoothstep( 0.0, 0.07 + 0.05 * skNoise( vec3( vSkWorld.x * 3.1, 0.0, vSkWorld.z * 3.1 ) + 47.0 ), max( skH, 0.0 ) ) ) * skVert * skWeather * ( skGroundGrid.w > 0.0 ? 1.0 : 0.0 );
    float skSpl = smoothstep( 0.55, 0.75, skNoise( vSkWorld * 23.0 + 5.0 ) ) * ( 1.0 - smoothstep( 0.05, 0.45, max( skH, 0.0 ) ) ) * skVert * skWeather * ( skGroundGrid.w > 0.0 ? 1.0 : 0.0 );
    diffuseColor.rgb *= ( 1.0 - 0.45 * skCon ) * ( 1.0 - 0.3 * skSpl );
    #ifdef SK_FLAKE
    {
      // Plaster lost to weather: ragged patches, most of them low on the wall, show the brick or tufa below.
      float skFl = skNoise( vSkWorld * vec3( 1.3, 1.7, 1.3 ) + 83.0 ) * 0.6 + skNoise( vSkWorld * 4.1 + 29.0 ) * 0.4;
      float skFlLow = 1.0 - smoothstep( 0.0, 2.4, max( skH, 0.0 ) );
      float skFlT = 0.78 - 0.14 * skFlLow - 0.03 * skFlake;
      skFlakeK = smoothstep( skFlT, skFlT + 0.03, skFl ) * skVert * min( skFlake, 1.0 );
      float skFlRim = smoothstep( skFlT - 0.05, skFlT, skFl ) * ( 1.0 - skFlakeK ) * skVert;
      vec3 skUnder = mix( vec3( 0.3, 0.13, 0.085 ), vec3( 0.27, 0.25, 0.22 ), smoothstep( 0.3, 0.7, skNoise( vSkWorld * 2.1 + 3.0 ) ) );
      skUnder *= 0.9 + 0.7 * skNoise( vSkWorld * 19.0 );
      diffuseColor.rgb = mix( diffuseColor.rgb * ( 1.0 - 0.3 * skFlRim ), skUnder, skFlakeK );
    }
    #endif
    diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.8, 0.95, 0.62 ), skDamp * smoothstep( 0.45, 0.8, skNoise( vSkWorld * 2.7 + 61.0 ) ) );
    // Moss: soft green cushions on the lowest metre and a half of stone, thickest in the damp.
    float skMo = skNoise( vSkWorld * vec3( 2.3, 3.1, 2.3 ) + 41.0 ) * 0.6 + skNoise( vSkWorld * 7.3 + 17.0 ) * 0.4;
    float skMoK = smoothstep( 0.6, 0.72, skMo + 0.18 * skDamp ) * ( 1.0 - smoothstep( 0.2, 1.5, max( skH, 0.0 ) ) ) * skVert * skWeather * ( skGroundGrid.w > 0.0 ? 1.0 : 0.0 );
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.12, 0.2, 0.06 ) * ( 0.7 + 0.8 * skNoise( vSkWorld * 31.0 ) ), skMoK * 0.7 );
    // Ivy: a few columns of dark leaf clusters climbing the wall, ragged at the top, sparse at the edge.
    float skIvC = smoothstep( 0.7, 0.8, skNoise( vec3( vSkWorld.x * 0.23 + vSkWorld.z * 0.21, 0.0, 5.0 ) ) );
    float skIvTop = 2.2 + 4.0 * skNoise( vec3( vSkWorld.x * 0.5, 0.0, vSkWorld.z * 0.5 ) + 9.0 );
    float skIvLeaf = skNoise( vSkWorld * 9.0 + 3.0 ) * 0.65 + skNoise( vSkWorld * 21.0 ) * 0.35;
    float skIvK = skIvC * ( 1.0 - smoothstep( skIvTop * 0.55, skIvTop, max( skH, 0.0 ) ) ) * smoothstep( 0.38 + 0.2 * skIvC, 0.52, skIvLeaf ) * skVert * skWeather * ( skGroundGrid.w > 0.0 ? 1.0 : 0.0 );
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.045, 0.1, 0.03 ) * ( 0.6 + 1.1 * skNoise( vSkWorld * 47.0 ) ), skIvK * 0.85 );
    // Rain streaks: narrow along the wall, long down it, patchy.
    vec2 skT = normalize( vec2( -skN.z, skN.x ) + 1e-5 );
    float skU = dot( vSkWorld.xz, skT );
    float skS = smoothstep( 0.4, 0.75, skNoise( vec3( skU * 2.2, vSkWorld.y * 0.15, 7.0 ) ) );
    skS *= 0.4 + skNoise( vec3( skU * 0.25, vSkWorld.y * 0.06, 11.0 ) );
    diffuseColor.rgb *= 1.0 - min( 0.8, 0.42 * skS * skVert * skWeather );
  }
}
#endif
`;

/** three's normal_fragment_maps with the detail layer and the specular-AA roughness widening folded in. */
function normalFragmentMaps(): string {
  let c: string = THREE.ShaderChunk.normal_fragment_maps;
  c = c.replace(
    'mapN.xy *= normalScale;',
    `#ifdef SK_DETAIL
    {
      vec2 skDn = texture2D( normalMap, mat2( 0.8, -0.6, 0.6, 0.8 ) * vNormalMapUv * 5.3 + 0.37 ).xy * 2.0 - 1.0;
      mapN.xy += skDn * skDetail * ( 1.0 - smoothstep( 6.0, 18.0, length( vViewPosition ) ) );
    }
    #endif
    mapN.xy *= normalScale;`,
  );
  return `${c}
#ifdef SK_PUDDLE
  normal = normalize( mix( normal, nonPerturbedNormal, skPuddleK ) );
#endif
#ifdef SK_GRAIN
{
  // Fine grain bump from world-space noise (no tangent frame needed): derivative bump mapping.
  float skGh = skNoise( vSkWorld * 38.0 ) * 0.6 + skNoise( vSkWorld * 91.0 + 7.0 ) * 0.4;
  float skGf = skGrain * ( 1.0 - smoothstep( 3.0, 9.0, length( vViewPosition ) ) );
  vec3 skSx = dFdx( - vViewPosition ), skSy = dFdy( - vViewPosition );
  vec3 skR1 = cross( skSy, normal ), skR2 = cross( normal, skSx );
  float skDet = dot( skSx, skR1 );
  vec3 skGrad = sign( skDet ) * ( dFdx( skGh ) * skR1 + dFdy( skGh ) * skR2 );
  normal = normalize( abs( skDet ) * normal - skGf * 0.012 * skGrad );
}
#endif
#ifdef SK_SPECAA
{
  vec3 skDx = dFdx( normal ), skDy = dFdy( normal );
  float skVar = min( 0.5 * ( dot( skDx, skDx ) + dot( skDy, skDy ) ), 0.25 );
  roughnessFactor = sqrt( clamp( roughnessFactor * roughnessFactor + skVar, 0.0, 1.0 ) );
}
#endif`;
}

/** `?puddle=0` switches the street wetness off, for A/B shots. */
const NO_PUDDLE = typeof location !== 'undefined' && new URLSearchParams(location.search).get('puddle') === '0';

let noiseTex: THREE.DataTexture | null = null;

/** A 256² periodic value-noise texture (32 lattice cells, smooth between them), four independent channels. */
function skNoiseTexture(): THREE.DataTexture {
  if (noiseTex) return noiseTex;
  const N = 256, CELLS = 32, K = N / CELLS;
  const data = new Uint8Array(N * N * 4);
  let seed = 0x9e3779b9;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let c = 0; c < 4; c++) {
    const lat = new Float32Array(CELLS * CELLS);
    for (let i = 0; i < lat.length; i++) lat[i] = rnd();
    const at = (i: number, j: number) => lat[(j % CELLS) * CELLS + (i % CELLS)];
    for (let y = 0; y < N; y++) {
      const fy = y / K, iy = Math.floor(fy), ty = fy - iy, uy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < N; x++) {
        const fx = x / K, ix = Math.floor(fx), tx = fx - ix, ux = tx * tx * (3 - 2 * tx);
        const a = at(ix, iy), b = at(ix + 1, iy), cc = at(ix, iy + 1), d = at(ix + 1, iy + 1);
        data[(y * N + x) * 4 + c] = Math.round((a + (b - a) * ux + (cc - a) * uy + (a - b - cc + d) * ux * uy) * 255);
      }
    }
  }
  noiseTex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
  noiseTex.magFilter = THREE.LinearFilter;
  noiseTex.minFilter = THREE.LinearMipmapLinearFilter;
  noiseTex.generateMipmaps = true;
  noiseTex.needsUpdate = true;
  return noiseTex;
}

/** The terrain heights every weathered material reads (one shared set of uniforms). */
const GROUND = {
  tex: { value: null as THREE.Texture | null },
  grid: { value: { x: 0, y: 0, z: 1, w: 0 } },
  n: { value: { x: 1, y: 1 } },
};

/** Point the weathering at the terrain's height texture (game y per sample, row-major by z). */
export function setWeatherGround(tex: THREE.Texture | null, g: { minX: number; minZ: number; spacing: number; nx: number; nz: number }) {
  GROUND.tex.value = tex;
  GROUND.grid.value = { x: g.minX, y: g.minZ, z: g.spacing, w: tex ? 1 : 0 };
  GROUND.n.value = { x: g.nx, y: g.nz };
}


/**
 * Patch a MeshStandardMaterial in place. `macro` 0 disables the variation; `contrast` < 1 (with
 * `mean`, the map's average linear albedo) flattens the albedo map towards its mean. `detail` > 0
 * adds the detail-normal layer (needs a normal map), `mottle` the per-stone tint noise and `wear`
 * the polished-patch streaks on horizontal faces. Specular AA is always on.
 */
export function applyShaderPatch(
  material: THREE.MeshStandardMaterial,
  opts: { macro?: number; detile?: boolean; contrast?: number; mean?: readonly number[]; weather?: number; detail?: number; mottle?: number; wear?: number; grain?: number; flake?: number; puddle?: number },
) {
  const macro = opts.macro ?? 0;
  const weather = opts.weather ?? 0;
  const detailV = opts.detail ?? 0;
  const mottle = opts.mottle ?? 0;
  const wear = opts.wear ?? 0;
  const grain = opts.grain ?? 0;
  const flake = opts.flake ?? 0;
  const puddle = NO_PUDDLE ? 0 : opts.puddle ?? 0;
  // SK_DETILE and SK_CONTRAST only act inside USE_MAP, so they are safe before the map loads.
  const detile = !!opts.detile;
  const contrast = opts.contrast !== undefined && opts.contrast < 1 && opts.mean ? opts.contrast : 1;
  material.defines = {
    ...(material.defines ?? {}),
    SK_SPECAA: '',
    ...(macro > 0 ? { SK_MACRO: '' } : {}),
    ...(weather > 0 ? { SK_WEATHER: '' } : {}),
    ...(detile ? { SK_DETILE: '' } : {}),
    ...(contrast < 1 ? { SK_CONTRAST: '' } : {}),
    ...(detailV > 0 ? { SK_DETAIL: '' } : {}),
    ...(mottle > 0 ? { SK_MOTTLE: '' } : {}),
    ...(wear > 0 ? { SK_WEAR: '' } : {}),
    ...(puddle > 0 ? { SK_PUDDLE: '' } : {}),
    ...(grain > 0 ? { SK_GRAIN: '' } : {}),
    ...(flake > 0 && weather > 0 ? { SK_FLAKE: '' } : {}),
  };
  const uniform = { value: macro };
  const contrastU = { value: contrast };
  const meanU = { value: { x: opts.mean?.[0] ?? 0.5, y: opts.mean?.[1] ?? 0.5, z: opts.mean?.[2] ?? 0.5 } };
  const weatherU = { value: weather };
  const detailU = { value: detailV };
  const mottleU = { value: mottle };
  const wearU = { value: wear };
  const grainU = { value: grain };
  const flakeU = { value: flake };
  const puddleU = { value: puddle };
  material.userData.skMacro = uniform;
  material.userData.skWeather = weatherU;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.skNoiseTex = { value: skNoiseTexture() };
    shader.uniforms.skMacro = uniform;
    shader.uniforms.skContrast = contrastU;
    shader.uniforms.skMean = meanU;
    shader.uniforms.skWeather = weatherU;
    shader.uniforms.skDetail = detailU;
    shader.uniforms.skMottle = mottleU;
    shader.uniforms.skWear = wearU;
    shader.uniforms.skGrain = grainU;
    shader.uniforms.skFlake = flakeU;
    shader.uniforms.skPuddle = puddleU;
    shader.uniforms.skGround = GROUND.tex;
    shader.uniforms.skGroundGrid = GROUND.grid;
    shader.uniforms.skGroundN = GROUND.n;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vSkWorld;`)
      .replace('#include <project_vertex>', VERTEX_WORLD);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${NOISE}`)
      .replace('#include <map_fragment>', MAP_FRAGMENT)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n#ifdef SK_WEAR\nroughnessFactor *= 1.0 - 0.25 * skWearK;\n#endif\n#ifdef SK_PUDDLE\nroughnessFactor = mix( roughnessFactor, 0.07, skPuddleK );\n#endif\n#ifdef SK_FLAKE\nroughnessFactor = mix( roughnessFactor, 0.95, skFlakeK );\n#endif')
      .replace('#include <normal_fragment_maps>', normalFragmentMaps());
  };
  material.customProgramCacheKey = () => 'skyrome-macro-v7';
}
