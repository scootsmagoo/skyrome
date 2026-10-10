import { describe, expect, it } from 'vitest';
import { MeshBuilder } from '../src/gfx/MeshBuilder';
import { stairs, wrappedSteps } from '../src/arch/common/stairs';

describe('tread wear strips', () => {
  it('adds a marble lip and a dirt joint per tread of a travertine flight, no colliders', () => {
    const plain = new MeshBuilder();
    stairs(plain, { width: 4, rise: 0.2, run: 0.35, count: 5, collider: 'none' });
    const g = plain.build('x');
    const names = new Set<string>();
    g.traverse((o) => { const m = (o as { material?: { name?: string } }).material; if (m?.name) names.add(m.name); });
    expect(names.has('dirt')).toBe(true);
    expect(names.has('marble')).toBe(true);
  });
  it('marble steps get no pale lip', () => {
    const b = new MeshBuilder();
    stairs(b, { width: 4, rise: 0.2, run: 0.35, count: 3, material: 'marble', collider: 'none' });
    const names = new Set<string>();
    b.build('x').traverse((o) => { const m = (o as { material?: { name?: string } }).material; if (m?.name) names.add(m.name); });
    expect(names.has('dirt')).toBe(true);
  });
  it('wrapped steps add strips and keep their colliders', () => {
    const b = new MeshBuilder();
    wrappedSteps(b, { x0: -3, x1: 3, z0: 0, z1: 6, rise: 0.2, run: 0.4, count: 4, sides: { front: true, left: true, right: true } });
    expect(b.colliders.length).toBeGreaterThan(0);
  });
});
