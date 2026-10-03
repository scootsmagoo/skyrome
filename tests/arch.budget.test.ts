/** Triangle budgets per generator, so detail creep is caught early. */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { column } from '../src/arch/classical/column';
import { ORDERS, diameterForHeight } from '../src/arch/classical/orders';
import { MeshBuilder } from '../src/gfx/MeshBuilder';

export function triangles(b: MeshBuilder): number {
  const g = b.build('t');
  let n = 0;
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) n += m.geometry.getAttribute('position').count / 3;
  });
  return n;
}

describe('column triangle budgets', () => {
  const H = 9;
  for (const order of ORDERS) {
    it(`${order} high < 9k, low < 1k`, () => {
      const D = diameterForHeight(order, H);
      const hi = new MeshBuilder();
      column(hi, { order, D, fluted: true, detail: 'high' });
      const lo = new MeshBuilder();
      column(lo, { order, D, fluted: true, detail: 'low' });
      const th = triangles(hi);
      const tl = triangles(lo);
      console.info(`${order}: high ${th}, low ${tl}`);
      expect(th).toBeLessThan(9000);
      expect(tl).toBeLessThan(1000);
    });
  }
});
