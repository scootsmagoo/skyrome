import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/Rng';
import { MATERIAL_IDS } from '../src/gfx/materialIds';
import { MeshBuilder } from '../src/gfx/MeshBuilder';
import { Draw } from '../src/arch/fabric/draw';
import { PROP_KINDS, PROP_VARIANTS, PropScatter, makeProp, placeProp } from '../src/arch/props';

describe('props', () => {
  it('every kind and variant builds sane geometry', () => {
    for (const kind of PROP_KINDS) {
      for (let v = 0; v < PROP_VARIANTS; v++) {
        const m = makeProp(kind, undefined, v);
        expect(m.parts.length, kind).toBeGreaterThan(0);
        for (const p of m.parts) {
          expect(MATERIAL_IDS).toContain(p.material);
          expect(p.geometry.getAttribute('position').count).toBeGreaterThan(0);
        }
        const size = m.bounds.getSize(new THREE.Vector3());
        expect(Math.max(size.x, size.y, size.z), kind).toBeLessThan(8);
        expect(Math.max(size.x, size.y, size.z), kind).toBeGreaterThan(0.04);
      }
    }
  });

  it('human-scale checks', () => {
    const size = (k: Parameters<typeof makeProp>[0]) => makeProp(k, undefined, 0).bounds.getSize(new THREE.Vector3());
    expect(size('amphora_tall').y).toBeGreaterThan(0.9);
    expect(size('amphora_tall').y).toBeLessThan(1.2);
    expect(size('table').y).toBeCloseTo(0.76, 1);
    expect(size('dolium').y).toBeGreaterThan(1.0);
    expect(size('stall_fruit').y).toBeGreaterThan(2.0);
    expect(size('cart').z).toBeGreaterThan(3.5); // with its pole
  });

  it('stays within triangle budgets (they are repeated by the hundred in shops and stacks)', () => {
    const tris = (k: Parameters<typeof makeProp>[0]) =>
      Math.max(...[0, 1, 2].map((v) => makeProp(k, undefined, v).parts.reduce((n, p) => n + p.geometry.getAttribute('position').count / 3, 0)));
    expect(tris('basket')).toBeLessThan(200);
    expect(tris('amphora_tall')).toBeLessThan(160);
    expect(tris('amphora_globular')).toBeLessThan(200);
    expect(tris('amphora_rack')).toBeLessThan(1700);
    for (const k of PROP_KINDS) expect(tris(k), k).toBeLessThan(3500);
  });

  it('is cached and deterministic', () => {
    expect(makeProp('stall', new Rng(1))).toBe(makeProp('stall', new Rng(1)));
    expect(makeProp('crate', undefined, 1)).toBe(makeProp('crate', undefined, 1));
  });

  it('placeProp merges into a builder with transformed colliders', () => {
    const b = new MeshBuilder();
    placeProp(new Draw(b), 'altar', 10, 2, -5, Math.PI / 2);
    expect(b.colliders.length).toBe(1);
    const c = b.colliders[0];
    if (c.kind === 'box') {
      expect(c.center.x).toBeCloseTo(10, 1);
      expect(c.center.z).toBeCloseTo(-5, 1);
    }
    const nb = new MeshBuilder();
    placeProp(new Draw(nb), 'altar', 0, 0, 0, 0, { collide: false });
    expect(nb.colliders.length).toBe(0);
  });

  it('PropScatter: one InstancedMesh per kind+variant+material', () => {
    const s = new PropScatter();
    for (let i = 0; i < 50; i++) s.add('amphora_tall', { x: i, y: 0, z: 0 }, i * 0.1, 1, { variant: 0 });
    for (let i = 0; i < 10; i++) s.add('crate', { x: i, y: 0, z: 5 }, 0, 1.2, { variant: 1 });
    const g = s.build();
    expect(s.count).toBe(60);
    expect(g.children.length).toBe(s.meshCount);
    const amph = g.children.find((c) => c.name.includes('amphora_tall')) as THREE.InstancedMesh;
    expect(amph.count).toBe(50);
    expect(s.colliders().length).toBe(50 * makeProp('amphora_tall', undefined, 0).colliders.length + 10 * makeProp('crate', undefined, 1).colliders.length);
  });
});
