/**
 * Patches to three.js's shared shader chunks, installed once before the first material compiles
 * (`installChunkPatches`, called from main.ts right after the renderer exists).
 *
 * Dark point lights cost nothing. The light pool (world/lights/LightPool.ts) keeps exactly eight
 * PointLights in the scene so that lighting a lamp never recompiles a shader, and by day all eight
 * sit at intensity 0 (fires light nothing in sunlight). three.js still ran its whole direct-light
 * model for each of them on every lit pixel: the light vector and fall-off, then the GGX specular
 * and diffuse terms (and, on hair, the two Kajiya-Kay lobes) eight times over, all multiplied by
 * a colour of zero. The patch skips
 *  - a light whose colour is zero (switched off: the same for every pixel of a draw, so the GPU
 *    branches as one), and
 *  - the lighting model where a light's colour at this pixel is zero (out of its range: three.js's
 *    fall-off ends at the light's `distance`).
 * The picture is the same to the bit (each skipped term was a product with zero). In the Forum at
 * noon the frame's GPU time fell by about a fifth (docs/research/perf-audit-2026-10.md, phase 3).
 *
 * `?lodoff=lightskip` leaves the chunks alone (A/B runs); `originalChunks` keeps the unpatched text
 * for scripts/perf-probe.mjs's in-page A/B.
 */
import * as THREE from 'three';

/** The point-light loop of `lights_fragment_begin` as three r186 writes it (body up to RE_Direct). */
const POINT_LOOP =
  /(for \( int i = 0; i < NUM_POINT_LIGHTS; i \+\+ \) \{\s*pointLight = pointLights\[ i \];)([\s\S]*?)(RE_Direct\( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight \);)(\s*\}\s*#pragma unroll_loop_end)/;

/**
 * `lights_fragment_begin` with each point light's work behind its colour and the lighting model
 * behind `directLight.visible` (pure). Null when the chunk does not have the expected shape
 * (another three.js version): then nothing is patched and the game draws as before.
 */
export function skipDarkPointLights(chunk: string): string | null {
  const m = POINT_LOOP.exec(chunk);
  if (!m) return null;
  const [all, head, body, call, tail] = m;
  const patched = `${head}\n\n\t\tif ( pointLight.color != vec3( 0.0 ) ) {${body}if ( directLight.visible ) ${call}\n\n\t\t}${tail}`;
  return chunk.slice(0, m.index) + patched + chunk.slice(m.index + all.length);
}

/** The chunks as three.js shipped them (before `installChunkPatches`). */
export const originalChunks: Partial<Record<keyof typeof THREE.ShaderChunk, string>> = {};

let installed = false;

/** Patch the shared chunks (once). Returns which patches took. */
export function installChunkPatches(): { lightSkip: boolean } {
  const res = { lightSkip: false };
  if (installed) return res;
  installed = true;
  const off = new URLSearchParams(globalThis.location?.search ?? '').get('lodoff') ?? '';
  if (!off.includes('lightskip')) {
    const src = THREE.ShaderChunk.lights_fragment_begin;
    const patched = skipDarkPointLights(src);
    if (patched) {
      originalChunks.lights_fragment_begin = src;
      THREE.ShaderChunk.lights_fragment_begin = patched;
      res.lightSkip = true;
    }
  }
  return res;
}
