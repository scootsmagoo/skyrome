import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Forest } from '../src/arch/vegetation/Forest';
import { GrassField } from '../src/arch/vegetation/Grass';
import { noise3 } from '../src/arch/vegetation/geom';
import { TREE_SPECIES, TREE_VARIANTS, makeTree } from '../src/arch/vegetation/species';

function bounds(g: THREE.BufferGeometry) {
  g.computeBoundingBox();
  return g.boundingBox!;
}

describe('species', () => {
  it('every species and variant builds with colours and UVs', () => {
    for (const sp of TREE_SPECIES) {
      for (let v = 0; v < TREE_VARIANTS; v++) {
        const t = makeTree(sp, v);
        expect(t.near.length).toBeGreaterThan(0);
        for (const p of [...t.near, ...t.far]) {
          for (const a of ['position', 'normal', 'color', 'uv']) expect(p.geometry.getAttribute(a), `${sp} ${a}`).toBeTruthy();
        }
        if (sp !== 'oleander' && sp !== 'reeds') expect(t.far.length).toBe(1);
      }
    }
  });

  it('umbrella pine: tall bare trunk under a broad, flat canopy', () => {
    for (let v = 0; v < TREE_VARIANTS; v++) {
      const t = makeTree('umbrella_pine', v);
      const canopy = bounds(t.near[1].geometry);
      const size = canopy.getSize(new THREE.Vector3());
      expect(Math.min(size.x, size.z)).toBeGreaterThan(2.4 * size.y); // flat umbrella
      expect(canopy.min.y).toBeGreaterThan(0.55 * t.height); // trunk bare below
      expect(t.height).toBeGreaterThan(11);
      expect(t.height).toBeLessThan(19);
      // The far LOD keeps the silhouette.
      const far = bounds(t.far[0].geometry).getSize(new THREE.Vector3());
      expect(far.x).toBeGreaterThan(size.x * 0.75);
    }
  });

  it('cypress: tall and narrow', () => {
    const t = makeTree('cypress', 1);
    const s = bounds(t.near[0].geometry).getSize(new THREE.Vector3());
    expect(s.x / s.y).toBeLessThan(0.2);
    expect(s.y).toBeGreaterThan(8);
  });

  it('noise is deterministic and bounded', () => {
    for (let i = 0; i < 200; i++) {
      const n = noise3(i * 0.37, i * 0.11, -i * 0.23, 5);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
      expect(noise3(i * 0.37, i * 0.11, -i * 0.23, 5)).toBe(n);
    }
  });
});

describe('Forest LOD', () => {
  it('sorts instances into near / far / culled by camera distance', () => {
    const f = new Forest({ near: 50, far: 200, seed: 1 });
    for (let i = 0; i < 10; i++) f.add('umbrella_pine', i * 30, 0, 0, { variant: 0 });
    f.add('reeds', 0, 0, 5, { variant: 0 });
    f.build();
    f.update(new THREE.Vector3(0, 2, 0), true);
    // Pines at 0, 30 → near; 60..180 → far; 210+ → culled. Reeds have no far LOD.
    expect(f.nearCount).toBe(3);
    expect(f.farCount).toBe(5);
    const near = f.group.children.filter((c) => c.name === 'forest:umbrella_pine#0') as THREE.InstancedMesh[];
    expect(near.map((m) => m.count).sort()).toEqual([2, 2, 5]);
    f.update(new THREE.Vector3(1000, 0, 0), true);
    expect(f.nearCount + f.farCount).toBe(0);
  });

  it('gives trees trunk colliders but not shrubs', () => {
    const f = new Forest({ seed: 2 });
    f.add('plane', 0, 0, 0).add('oleander', 5, 0, 0).add('reeds', 9, 0, 0);
    expect(f.colliders().length).toBe(1);
  });
});

describe('GrassField', () => {
  it('scatters tufts and flowers inside the mask, on the terrain', () => {
    const H = (x: number, z: number) => 0.1 * x + 0.05 * z;
    const g = new GrassField({ minX: 0, minZ: 0, maxX: 40, maxZ: 40 }, { heightAt: H, mask: (x) => x > 20, seed: 4 });
    const group = g.build();
    expect(g.instanceCount).toBeGreaterThan(300);
    const m = new THREE.Matrix4(), p = new THREE.Vector3();
    for (const c of group.children as THREE.InstancedMesh[]) {
      for (let i = 0; i < c.count; i += 17) {
        c.getMatrixAt(i, m);
        p.setFromMatrixPosition(m);
        expect(p.x).toBeGreaterThan(20);
        expect(p.y).toBeCloseTo(H(p.x, p.z) - 0.02, 5);
      }
    }
  });
});
