import { describe, expect, it } from 'vitest';
import { classifyGpu, graphicsWrites, lowerTier, TIER_SETTINGS } from '../src/core/graphics';

const gpu = (name: string, software = false) => ({ name, software });

describe('graphics tiers', () => {
  it('classifies GPUs by their WebGL renderer string', () => {
    expect(classifyGpu(gpu('ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Max, Unspecified Version)'))).toBe('high');
    expect(classifyGpu(gpu('Apple GPU'))).toBe('high');
    expect(classifyGpu(gpu('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Laptop GPU Direct3D11 vs_5_0 ps_5_0, D3D11)'))).toBe('high');
    expect(classifyGpu(gpu('ANGLE (AMD, AMD Radeon RX 6600 Direct3D11 vs_5_0 ps_5_0, D3D11)'))).toBe('high');
    expect(classifyGpu(gpu('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'))).toBe('medium');
    expect(classifyGpu(gpu('ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'))).toBe('medium');
    expect(classifyGpu(gpu('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)'))).toBe('low');
    expect(classifyGpu(gpu('Intel(R) Iris(TM) Plus Graphics 655'))).toBe('low');
    expect(classifyGpu(gpu('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'))).toBe('low');
    expect(classifyGpu(gpu('ANGLE (NVIDIA GeForce GTX 1650)', true))).toBe('low');
    expect(classifyGpu(gpu(''))).toBe('low');
  });

  it('low memory caps at Low; few cores cap a High GPU at Medium', () => {
    expect(classifyGpu(gpu('Apple M1'), { memoryGb: 4 })).toBe('low');
    expect(classifyGpu(gpu('NVIDIA GeForce RTX 3060'), { cores: 4 })).toBe('medium');
    expect(classifyGpu(gpu('NVIDIA GeForce RTX 3060'), { memoryGb: 8, cores: 8 })).toBe('high');
  });

  it('Auto writes a tier once per GPU; a fixed tier or the same GPU writes nothing', () => {
    const w = graphicsWrites({}, gpu('Intel(R) UHD Graphics 620'));
    expect(w).toMatchObject({ ...TIER_SETTINGS.low, graphicsApplied: { tier: 'low', gpu: 'Intel(R) UHD Graphics 620', by: 'gpu' } });
    expect(graphicsWrites({ graphicsApplied: { tier: 'medium', gpu: 'Intel(R) UHD Graphics 620', by: 'fps' } }, gpu('Intel(R) UHD Graphics 620'))).toBeNull();
    expect(graphicsWrites({ graphicsApplied: { tier: 'low', gpu: 'Intel(R) UHD Graphics 620', by: 'gpu' } }, gpu('Apple M2'))).toMatchObject({ graphicsApplied: { tier: 'high' } });
    expect(graphicsWrites({ graphics: 'high' }, gpu('Intel(R) UHD Graphics 620'))).toBeNull();
  });

  it('steps down one tier at a time and stops at Low; every tier sets the same rows', () => {
    expect([lowerTier('high'), lowerTier('medium'), lowerTier('low')]).toEqual(['medium', 'low', null]);
    const keys = (t: keyof typeof TIER_SETTINGS) => Object.keys(TIER_SETTINGS[t]).sort();
    expect(keys('low')).toEqual(keys('high'));
    expect(keys('medium')).toEqual(keys('high'));
  });
});
