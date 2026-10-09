import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Forest } from '../src/arch/vegetation/Forest';
import { GrassField } from '../src/arch/vegetation/Grass';
import { leafCards, noise3 } from '../src/arch/vegetation/geom';
import { TREE_SPECIES, TREE_VARIANTS, makeTree, type TreeSpecies } from '../src/arch/vegetation/species';

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

  it('far LODs carry baked albedo: trunks read as bark, not black', () => {
    const bark = new THREE.Color(0x5c4a3a); // MATERIAL_BASE.bark, linear
    for (const sp of ['umbrella_pine', 'plane', 'olive', 'laurel', 'fig'] as const) {
      const t = makeTree(sp, 0);
      expect(t.far[0].baked).toBe(true);
      const g = t.far[0].geometry;
      const pos = g.getAttribute('position'), col = g.getAttribute('color');
      let r = 0, n = 0;
      for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0.8) { r += col.getX(i); n++; }
      expect(n).toBeGreaterThan(0);
      expect(r / n, sp).toBeGreaterThan(bark.r * 0.6);
    }
  });

  it('umbrella pine far LOD: a domed lens about 0.3x as deep as wide', () => {
    for (let v = 0; v < TREE_VARIANTS; v++) {
      const t = makeTree('umbrella_pine', v);
      const g = t.far[0].geometry;
      const pos = g.getAttribute('position'), col = g.getAttribute('color');
      const top = new THREE.Box3();
      // Canopy vertices: the green ones (the baked bark is red-brown).
      for (let i = 0; i < pos.count; i++) if (col.getY(i) > col.getX(i)) top.expandByPoint(new THREE.Vector3().fromBufferAttribute(pos, i));
      const s = top.getSize(new THREE.Vector3());
      const ratio = s.y / Math.min(s.x, s.z);
      expect(ratio).toBeGreaterThan(0.2);
      expect(ratio).toBeLessThan(0.4);
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
    // Bark, crown clumps and leaf cards at 2 near instances each, plus the far stand-in at 5.
    expect(near.map((m) => m.count).sort()).toEqual([2, 2, 2, 5]);
    expect(near.filter((m) => !m.castShadow).length).toBeGreaterThanOrEqual(2); // the cards and the far LOD
    // (an InstancedMesh's shadow flag: the cards must not cast their quads' shadows)
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
  const H = (x: number, z: number) => 0.1 * x + 0.05 * z;
  const live = (g: GrassField) => (g.group.children as THREE.InstancedMesh[]).filter((m) => m.visible && m.count > 0);

  it('scatters tufts and flowers inside the mask, on the terrain', () => {
    const g = new GrassField({ minX: 0, minZ: 0, maxX: 40, maxZ: 40 }, { heightAt: H, mask: (x) => x > 20, seed: 4 });
    g.build();
    g.update(new THREE.Vector3(20, H(20, 20) + 1.7, 20), Infinity);
    expect(g.instanceCount).toBeGreaterThan(300);
    const m = new THREE.Matrix4(), p = new THREE.Vector3();
    for (const c of live(g)) {
      for (let i = 0; i < c.count; i += 17) {
        c.getMatrixAt(i, m);
        p.setFromMatrixPosition(m);
        expect(p.x).toBeGreaterThan(20);
        expect(p.y).toBeCloseTo(H(p.x, p.z) - 0.02, 4);
        // Upright, uniformly scaled in x/z.
        const s = new THREE.Vector3().setFromMatrixScale(m);
        expect(s.x).toBeCloseTo(s.z, 4);
      }
    }
  });

  it('only generates the ring around the camera, recycles cells and regenerates them identically', () => {
    const g = new GrassField({ minX: -2000, minZ: -2000, maxX: 2000, maxZ: 2000 }, { heightAt: () => 0, seed: 9 });
    g.build();
    const at = (x: number, z: number) => g.update(new THREE.Vector3(x, 1.7, z), Infinity);
    at(0, 0);
    const n0 = g.instanceCount, cells0 = g.cellCount;
    expect(cells0).toBeGreaterThan(4);
    expect(cells0).toBeLessThan(40); // a 4 km field, but only the ring exists
    const snapshot = () => live(g).map((m) => Array.from((m.instanceMatrix.array as Float32Array).slice(0, m.count * 16)).reduce((a, v) => a + v * 0.001, m.count)).sort().join(',');
    const s0 = snapshot();
    for (let i = 1; i <= 20; i++) at(i * 150, i * 90); // walk far away
    expect(g.poolSize).toBeLessThan(cells0 * 2 + 10); // the pool does not grow with distance travelled
    at(0, 0);
    expect(g.instanceCount).toBe(n0);
    expect(snapshot()).toBe(s0);
  });

  it('spreads generation over frames with a per-update budget', () => {
    const g = new GrassField({ minX: -500, minZ: -500, maxX: 500, maxZ: 500 }, { heightAt: () => 0 });
    g.build();
    g.update(new THREE.Vector3(0, 1.7, 0), 3);
    expect(g.cellCount).toBe(3);
    for (let i = 0; i < 20; i++) g.update(new THREE.Vector3(0, 1.7, 0), 3);
    const full = g.cellCount;
    expect(full).toBeGreaterThan(3);
    g.update(new THREE.Vector3(0, 1.7, 0), 3);
    expect(g.cellCount).toBe(full);
  });
});

describe('leaf cards', () => {
  it('builds quads with uv, a per-card random and unit normals', () => {
    const c = new THREE.Vector3(0, 5, 0), r = new THREE.Vector3(3, 2, 3);
    const g = leafCards([{ center: c, radius: r }], c, r, { density: 1.5, size: [0.6, 0.9] }, 7);
    const n = g.getAttribute('position').count;
    expect(n).toBeGreaterThan(30);
    expect(n % 6).toBe(0);
    expect(g.getAttribute('uv').count).toBe(n);
    expect(g.getAttribute('aLeaf').count).toBe(n);
    for (let i = 0; i < n; i += 37) {
      const l = Math.hypot(g.getAttribute('normal').getX(i), g.getAttribute('normal').getY(i), g.getAttribute('normal').getZ(i));
      expect(l).toBeCloseTo(1, 3);
      expect(g.getAttribute('uv').getY(i)).toBeGreaterThanOrEqual(0);
      expect(g.getAttribute('uv').getY(i)).toBeLessThanOrEqual(1);
    }
    // Same inputs, same cards.
    const h = leafCards([{ center: c, radius: r }], c, r, { density: 1.5, size: [0.6, 0.9] }, 7);
    expect(h.getAttribute('position').array).toEqual(g.getAttribute('position').array);
  });

  it('crowns carry a card part per species, kinds matching their leaves', () => {
    const kinds: Record<string, string> = { umbrella_pine: 'needle', cypress: 'needle', plane: 'broad', olive: 'olive', laurel: 'broad', fig: 'broad' };
    for (const [sp, kind] of Object.entries(kinds)) {
      const m = makeTree(sp as TreeSpecies, 0);
      const card = m.near.find((p) => p.cards);
      expect(card?.cards, sp).toBe(kind);
      expect(card!.geometry.getAttribute('position').count).toBeGreaterThan(100);
    }
  });
});
