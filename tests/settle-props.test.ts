import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MeshBuilder } from '../src/gfx/MeshBuilder';
import { Draw } from '../src/arch/fabric/draw';
import { placeProp } from '../src/arch/props';

/** Lowest y of the meshes of `mat` in a built group. */
function minY(g: THREE.Group, suffix: string): number {
  let y = Infinity;
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.name.endsWith(suffix)) return;
    const p = m.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) y = Math.min(y, p.getY(i));
  });
  return y;
}

describe('props settle onto what is under them', () => {
  it('drops a floating prop onto the paving below it', () => {
    const b = new MeshBuilder();
    const d = new Draw(b);
    d.span('paving_travertine', -2, -0.2, -2, 2, 0.0, 2);
    placeProp(d, 'dolium', 0, 0.3, 0, 0, { collide: false });
    expect(minY(b.build('t'), 'terracotta')).toBeCloseTo(0, 1);
  });

  it('lifts a sunken prop onto the ground of its builder', () => {
    const b = new MeshBuilder();
    b.ground = () => 1.0;
    placeProp(new Draw(b), 'dolium', 0, 0.6, 0, 0, { collide: false });
    expect(minY(b.build('t'), 'terracotta')).toBeCloseTo(1.0, 1);
  });

  it('leaves props on tables and hung props alone', () => {
    const b = new MeshBuilder();
    const d = new Draw(b);
    d.span('wood', -0.5, 0.0, -0.5, 0.5, 0.75, 0.5);
    placeProp(d, 'dolium', 0, 0.75, 0, 0, { collide: false });
    placeProp(d, 'torch_bracket', 3, 2.2, 0, 0, { collide: false });
    const g = b.build('t');
    expect(minY(g, 'terracotta')).toBeGreaterThan(0.7);
  });
});
