import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { floatsOf, packSkinned } from './pack';

function geometry() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 1.5, 0.2, 0.1, 1.7, -0.3]), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, -0.6, 0, 0.8]), 3));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array([0.7, 0.3, 0, 0, 1, 0, 0, 0]), 4));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array([3, 4, 0, 0, 24, 0, 0, 0]), 4));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array([0.2, 0.5, 0.9, 0.01, 0.02, 0.03]), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0.25, 0.998, 1]), 2));
  g.setAttribute('cloth', new THREE.BufferAttribute(new Float32Array([9, 0.5]), 1));
  return g;
}

describe('packSkinned', () => {
  it('packs weights, indices, normals, colours and uvs to within their precision', () => {
    const g = geometry();
    const before = Object.fromEntries(Object.entries(g.attributes).map(([n, a]) => [n, Array.from((a as THREE.BufferAttribute).array)]));
    const saved = packSkinned(g);
    expect(saved).toBeGreaterThan(0);
    expect(g.getAttribute('skinWeight').array).toBeInstanceOf(Uint16Array);
    expect(g.getAttribute('skinIndex').array).toBeInstanceOf(Uint8Array);
    expect(g.getAttribute('normal').array).toBeInstanceOf(Int16Array);
    expect(g.getAttribute('color').array).toBeInstanceOf(Uint16Array);
    expect(g.getAttribute('uv').array).toBeInstanceOf(Uint16Array);
    // Position and attributes without a rule stay float.
    expect(g.getAttribute('position').array).toBeInstanceOf(Float32Array);
    expect(g.getAttribute('cloth').array).toBeInstanceOf(Float32Array);
    for (const name of ['skinWeight', 'normal', 'color', 'uv']) {
      const a = g.getAttribute(name) as THREE.BufferAttribute;
      const f = floatsOf(a);
      before[name].forEach((v, i) => {
        expect(Math.abs(f[i] - v)).toBeLessThan(4e-5);
        expect(Math.abs(a.getComponent(Math.floor(i / a.itemSize), i % a.itemSize) - v)).toBeLessThan(4e-5);
      });
    }
    expect(Array.from(g.getAttribute('skinIndex').array)).toEqual(before.skinIndex);
  });

  it('leaves an attribute alone when a value is out of range or the data is dynamic', () => {
    const g = geometry();
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array([0.2, 1.007, 0.9]), 3));
    (g.getAttribute('normal') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
    packSkinned(g);
    expect(g.getAttribute('color').array).toBeInstanceOf(Float32Array);
    expect(g.getAttribute('normal').array).toBeInstanceOf(Float32Array);
  });

  it('floatsOf returns float arrays as they are', () => {
    const a = new THREE.BufferAttribute(new Float32Array([0.5, 1]), 1);
    expect(floatsOf(a)).toBe(a.array);
  });
});
