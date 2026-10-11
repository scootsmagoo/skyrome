import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { skipDarkPointLights } from './chunkPatches';

/** three.js's loop unrolling (WebGLProgram's unrollLoops), as the compiled shader will see it. */
function unroll(src: string, n: number) {
  return src
    .replace(/NUM_POINT_LIGHTS/g, String(n))
    .replace(/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g, (_m, start, end, body: string) => {
      let s = '';
      for (let i = +start; i < +end; i++) s += body.replace(/\[\s*i\s*\]/g, `[ ${i} ]`).replace(/UNROLLED_LOOP_INDEX/g, String(i));
      return s;
    });
}

describe('skipDarkPointLights', () => {
  const chunk = THREE.ShaderChunk.lights_fragment_begin;
  const out = skipDarkPointLights(chunk)!;

  it('wraps each point light in a colour test and its lighting model in the visibility test', () => {
    expect(out).not.toBeNull();
    const count = (s: string, t: string) => s.split(t).length - 1;
    // Same lighting-model calls (point, spot, directional...), only the point light's guarded.
    expect(count(out, 'RE_Direct( directLight')).toBe(count(chunk, 'RE_Direct( directLight'));
    expect(count(out, 'if ( directLight.visible ) RE_Direct(')).toBe(1);
    expect(count(out, 'if ( pointLight.color != vec3( 0.0 ) ) {')).toBe(1);
    // Inside the point-light loop: after its light info, before the spot lights.
    const g = out.indexOf('if ( directLight.visible ) RE_Direct(');
    expect(g).toBeGreaterThan(out.indexOf('getPointLightInfo( pointLight'));
    expect(g).toBeLessThan(out.indexOf('getSpotLightInfo( spotLight'));
    // Balanced braces: the block closes inside the loop.
    expect(count(out, '{')).toBe(count(chunk, '{') + 1);
    expect(count(out, '}')).toBe(count(chunk, '}') + 1);
  });

  it('survives three.js unrolling: one guarded body per light', () => {
    const u = unroll(out, 8);
    expect(u.split('if ( pointLight.color != vec3( 0.0 ) ) {').length - 1).toBe(8);
    expect(u).toContain('pointLight = pointLights[ 7 ];');
    expect(u).not.toContain('#pragma unroll_loop_start\n\tfor ( int i = 0; i < 8;');
  });

  it('leaves an unknown chunk alone', () => {
    expect(skipDarkPointLights('void main() {}')).toBeNull();
  });
});
