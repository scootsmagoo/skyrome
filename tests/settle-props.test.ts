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

  it('stands on the terrain where it lies above a buried floor, and on the floor where it lies below', () => {
    const above = new MeshBuilder();
    above.ground = () => 0.3;
    const da = new Draw(above);
    da.span('paving_travertine', -2, -0.2, -2, 2, 0.0, 2);
    placeProp(da, 'dolium', 0, 0.0, 0, 0, { collide: false });
    expect(minY(above.build('t'), 'terracotta')).toBeCloseTo(0.3, 1);
    const below = new MeshBuilder();
    below.ground = () => -0.2;
    const db = new Draw(below);
    db.span('paving_travertine', -2, -0.2, -2, 2, 0.1, 2);
    placeProp(db, 'dolium', 0, 0.1, 0, 0, { collide: false });
    expect(minY(below.build('t'), 'terracotta')).toBeCloseTo(0.1, 1);
  });

  it('a grounded prop never starts under the ground at its origin, whatever y the caller gave', () => {
    const ground = (x: number) => 1 + 0.05 * x;
    for (const y of [0.2, 1, 1.4]) {
      const b = new MeshBuilder();
      placeProp(new Draw(b), 'dolium', 0, y, 0, 0, { collide: false, ground });
      // (no settle: no ground on the builder, no faces under it)
      expect(minY(b.build('t'), 'terracotta')).toBeGreaterThan(0.85);
    }
  });

  it('answers what stands under a point: the podium top over its floor, the floor beside it', () => {
    const b = new MeshBuilder();
    const d = new Draw(b);
    d.span('paving_travertine', -6, -0.2, -6, 6, 0.0, 6);
    d.span('travertine', -1, 0, -1, 1, 1.0, 1);
    expect(b.surfaceAt(0, 0, 1.1)).toBeCloseTo(1.0, 3);
    expect(b.surfaceAt(4, 4, 0.2)).toBeCloseTo(0.0, 3);
    // Out of reach (a floor far under the height asked) is no answer, and the terrain joins in.
    expect(b.surfaceAt(4, 4, 3)).toBeNull();
    b.ground = () => 0.4;
    expect(b.surfaceAt(4, 4, 0.2)).toBeCloseTo(0.4, 3);
    // Parts added later are seen by the next query.
    d.span('wood', 3, 0, 3, 5, 0.5, 5);
    expect(b.surfaceAt(4, 4, 0.6)).toBeCloseTo(0.5, 3);
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
