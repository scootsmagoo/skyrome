import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyShaderPatch } from '../src/gfx/textures/shaderPatch';

/** Run a material's onBeforeCompile on a shader made of the real chunks it patches. */
function compile(m: THREE.MeshStandardMaterial) {
  const shader = {
    uniforms: {} as Record<string, unknown>,
    vertexShader: '#include <common>\n#include <project_vertex>',
    fragmentShader: '#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>',
  };
  m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as unknown as THREE.WebGLRenderer);
  return shader;
}

describe('shader patch', () => {
  it('always turns on specular AA, and the rest only when asked', () => {
    const m = new THREE.MeshStandardMaterial();
    applyShaderPatch(m, {});
    expect(m.defines).toHaveProperty('SK_SPECAA');
    for (const d of ['SK_MACRO', 'SK_WEATHER', 'SK_DETAIL', 'SK_MOTTLE', 'SK_WEAR', 'SK_GRAIN', 'SK_FLAKE']) expect(m.defines).not.toHaveProperty(d);
    const w = new THREE.MeshStandardMaterial();
    applyShaderPatch(w, { macro: 0.1, weather: 1, detail: 0.9, mottle: 0.1, wear: 1, grain: 1, flake: 1 });
    for (const d of ['SK_MACRO', 'SK_WEATHER', 'SK_DETAIL', 'SK_MOTTLE', 'SK_WEAR', 'SK_GRAIN', 'SK_FLAKE']) expect(w.defines, d).toHaveProperty(d);
    // Flaking is a weathering effect: without weather it stays off.
    const f = new THREE.MeshStandardMaterial();
    applyShaderPatch(f, { flake: 1 });
    expect(f.defines).not.toHaveProperty('SK_FLAKE');
  });

  it('injects the noise texture, the detail normal layer and the roughness widening', () => {
    const m = new THREE.MeshStandardMaterial();
    applyShaderPatch(m, { macro: 0.1, detail: 0.9, grain: 1, wear: 1 });
    const s = compile(m);
    expect(s.uniforms.skNoiseTex).toBeTruthy();
    expect(s.fragmentShader).toContain('texture2D( skNoiseTex');
    expect(s.fragmentShader).toContain('skDetail');
    expect(s.fragmentShader).toContain('roughnessFactor = sqrt(');
    expect(s.fragmentShader).toContain('skWearK');
    expect(s.fragmentShader).not.toContain('#include <normal_fragment_maps>');
  });

  it('shares one noise texture between materials', () => {
    const a = new THREE.MeshStandardMaterial(), b = new THREE.MeshStandardMaterial();
    applyShaderPatch(a, { macro: 0.1 });
    applyShaderPatch(b, { macro: 0.2 });
    expect((compile(a).uniforms.skNoiseTex as { value: unknown }).value).toBe((compile(b).uniforms.skNoiseTex as { value: unknown }).value);
  });
});
