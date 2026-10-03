import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { temple, templeLayout } from '../src/arch/classical/temple';
import { MeshBuilder } from '../src/gfx/MeshBuilder';

describe('templeLayout', () => {
  it('hexastyle pseudoperipteral Corinthian (Maison Carrée type)', () => {
    const L = templeLayout({ order: 'corinthian', plan: 'pseudoperipteral', front: 6, width: 18 });
    expect(L.front).toBe(6);
    expect(L.sides).toBe(11);
    // 6 × 11 perimeter = 30 columns, the front row free
    expect(L.columns.length).toBe(2 * (6 + 11) - 4);
    const frontRow = L.columns.filter((c) => Math.abs(c.z - -L.spanZ / 2) < 1e-6);
    expect(frontRow.length).toBe(6);
    expect(frontRow.every((c) => c.kind === 'free')).toBe(true);
    expect(L.columns.some((c) => c.kind === 'engaged')).toBe(true);
    // stylobate width close to the requested width
    expect(L.stylobate.x1 - L.stylobate.x0).toBeCloseTo(18, 0);
    // systyle: clear space 2 D
    expect(L.axial - L.D).toBeCloseTo(2 * L.D, 6);
    // Corinthian: column ≈ 10 D
    expect(L.H / L.D).toBeCloseTo(10, 6);
    // cella inside the stylobate, door wall behind the porch
    expect(L.cella.x0).toBeGreaterThanOrEqual(L.stylobate.x0);
    expect(L.cella.x1).toBeLessThanOrEqual(L.stylobate.x1);
    expect(L.cella.z0).toBeGreaterThan(-L.spanZ / 2 + 2 * L.axial);
  });

  it('stairs climb the podium with human-scale risers below the 0.42 m autostep', () => {
    for (const P of [1.5, 2.9, 3.55]) {
      const L = templeLayout({ podiumHeight: P });
      const s = L.stairs;
      expect(s.rise * s.count).toBeCloseTo(P, 6);
      expect(s.rise).toBeLessThan(0.26);
      expect(s.rise).toBeGreaterThan(0.17);
      expect(s.run).toBeGreaterThanOrEqual(0.3);
      expect(s.z1).toBeCloseTo(L.stylobate.z0, 6);
      expect(s.z1 - s.z0).toBeCloseTo(s.count * s.run, 6);
    }
  });

  it('side stairs: a rostrum with two lateral flights; none: a bare podium', () => {
    const L = templeLayout({ stairs: 'sides', podiumHeight: 3 });
    expect(L.flights.length).toBe(2);
    expect(L.podiumFront).toBeLessThan(L.stylobate.z0);
    const [l, r] = L.flights;
    expect(l.x1).toBeCloseTo(L.stylobate.x0, 6);
    expect(r.x0).toBeCloseTo(L.stylobate.x1, 6);
    expect(l.rise * l.count).toBeCloseTo(3, 6);
    expect(templeLayout({ stairs: 'none' }).flights.length).toBe(0);
    const b = new MeshBuilder();
    temple(b, { stairs: 'sides', detail: 'low' });
    expect(b.colliders.length).toBeGreaterThan(20);
  });

  it('plans place columns as Vitruvius describes', () => {
    const per = templeLayout({ plan: 'peripteral', front: 6, sides: 11 });
    expect(per.columns.every((c) => c.kind === 'free')).toBe(true);
    expect(per.columns.length).toBe(30);
    const sp = templeLayout({ plan: 'sine_postico', front: 8, sides: 8 });
    expect(sp.columns.some((c) => Math.abs(c.z - sp.spanZ / 2) < 1e-6)).toBe(false); // no back row
    const pro = templeLayout({ plan: 'prostyle', front: 4, pronaos: 2 });
    expect(pro.columns.length).toBe(4 + 2); // front + one return column each side
  });

  it('builds with colliders for podium, stairs, columns and cella', () => {
    const b = new MeshBuilder();
    const { layout } = temple(b, { front: 6, width: 18, detail: 'low' });
    const boxes = b.colliders.filter((c) => c.kind === 'box');
    const cyl = b.colliders.filter((c) => c.kind === 'cylinder');
    expect(cyl.length).toBeGreaterThanOrEqual(layout.columns.filter((c) => c.kind === 'free').length);
    // one box per step, each top higher than the last by one riser
    const steps = boxes
      .filter((c) => c.kind === 'box' && c.center.z < layout.stylobate.z0 && Math.abs(c.half.x * 2 - (layout.stairs.x1 - layout.stairs.x0)) < 1e-3)
      .map((c) => (c.kind === 'box' ? c.center.y + c.half.y : 0))
      .sort((a, c) => a - c);
    expect(steps.length).toBe(layout.stairs.count);
    for (let i = 1; i < steps.length; i++) expect(steps[i] - steps[i - 1]).toBeLessThan(0.42);
    const g = b.build('t');
    const box = new THREE.Box3().setFromObject(g);
    expect(box.max.y).toBeGreaterThan(layout.podiumHeight + layout.H);
  });
});
