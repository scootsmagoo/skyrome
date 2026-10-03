import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { fillBlock, planLots } from '../src/arch/fabric/blockFiller';
import { MAX_BUILDING_HEIGHT } from '../src/arch/fabric/insula';
import { distToPolygonEdge, obbCorners, obbOverlap, pointInPolygon, polygonContainsOBB } from '../src/arch/fabric/polygon';
import type { Polygon } from '../src/arch/fabric/types';

const block: Polygon = [[0, 0], [70, 0], [70, 45], [0, 45]];
const slope = (x: number, z: number) => 0.05 * x - 0.03 * z + Math.sin(x / 9) * 0.4;

describe('planLots', () => {
  it('is deterministic per seed and varies with the seed', () => {
    const a = planLots(block, { seed: 3, wealth: 0.4, density: 0.7 });
    const b = planLots(block, { seed: 3, wealth: 0.4, density: 0.7 });
    const c = planLots(block, { seed: 4, wealth: 0.4, density: 0.7 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
    expect(a.length).toBeGreaterThan(4);
  });

  it('keeps lots inside the block and apart from each other', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const wealth of [0.1, 0.5, 0.9]) {
        const lots = planLots(block, { seed, wealth, density: 0.8, allowHorrea: true }).filter((l) => l.kind !== 'alley');
        for (const l of lots) expect(polygonContainsOBB(block, l.obb)).toBe(true);
        for (let i = 0; i < lots.length; i++)
          for (let j = i + 1; j < lots.length; j++) expect(obbOverlap(lots[i].obb, lots[j].obb, 0.05)).toBe(false);
      }
    }
  });

  it('only fronts the requested edges, also for clockwise input', () => {
    const cw: Polygon = [...block].reverse(); // edges now: (0,45)->(70,45) is index 0 … caller's order
    // Caller's edge 2 of the clockwise polygon runs (70,0) -> (0,0): the z = 0 side.
    const lots = planLots(cw, { seed: 2, frontEdges: [2] }).filter((l) => l.kind !== 'alley');
    expect(lots.length).toBeGreaterThan(1);
    for (const l of lots) {
      const zs = obbCorners(l.obb).map((p) => p[1]);
      expect(Math.min(...zs)).toBeCloseTo(0, 5);
    }
  });

  it('respects avoid polygons', () => {
    const avoid: Polygon = [[20, -1], [50, -1], [50, 20], [20, 20]];
    const lots = planLots(block, { seed: 7, avoid: [avoid], density: 1 });
    for (const l of lots) for (const p of obbCorners(l.obb)) expect(pointInPolygon(p, avoid) && l.kind !== 'alley').toBe(false);
  });

  it('marks party walls between adjacent lots', () => {
    const lots = planLots(block, { seed: 5, density: 1, wealth: 0.2 }).filter((l) => l.kind === 'insula');
    expect(lots.some((l) => l.party.left || l.party.right)).toBe(true);
  });
});

describe('fillBlock on sloping ground', () => {
  const r = fillBlock(block, { heightAt: slope, seed: 9, wealth: 0.5, density: 0.8, sidewalkHeight: 0.3, id: 'T:' });

  it('puts every floor at or above the sidewalk along its frontage', () => {
    for (const l of r.lots) {
      if (l.kind === 'alley' || l.kind === 'piazza') continue;
      const [a, b] = [obbCorners(l.obb)[0], obbCorners(l.obb)[1]]; // front corners (−v side)
      for (let t = 0; t <= 1; t += 0.25) {
        const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
        // The filler samples 0.4 m outside the lot; allow for the terrain gradient over that distance.
        expect(l.floorY).toBeGreaterThanOrEqual(slope(x, z) + 0.3 - 0.05);
      }
    }
  });

  it('respects the 60-foot height limit', () => {
    for (const l of r.lots) expect(l.height).toBeLessThanOrEqual(MAX_BUILDING_HEIGHT + 1e-6);
  });

  it('returns uniquely named spots of several kinds', () => {
    const ids = new Set(r.spots.map((s) => s.id));
    expect(ids.size).toBe(r.spots.length);
    for (const s of r.spots) expect(s.id.startsWith('T:')).toBe(true);
    const kinds = new Set(r.spots.map((s) => s.kind));
    expect(kinds.has('shopDoor')).toBe(true);
    expect(kinds.has('houseDoor')).toBe(true);
    for (const s of r.spots) expect(Number.isFinite(s.position.y) && Number.isFinite(s.facing)).toBe(true);
  });

  it('builds geometry and colliders', () => {
    const g = r.builder.build('t');
    expect(g.children.length).toBeGreaterThan(8);
    expect(r.builder.colliders.length).toBeGreaterThan(20);
  });

  it('low detail: same lots and massing, a fraction of the triangles, no colliders', () => {
    const lowR = fillBlock(block, { heightAt: slope, seed: 9, wealth: 0.5, density: 0.8, sidewalkHeight: 0.3, id: 'T:', detail: 'low' });
    expect(lowR.lots.map((l) => [l.id, l.kind, l.floorY, l.height])).toEqual(r.lots.map((l) => [l.id, l.kind, l.floorY, l.height]));
    expect(lowR.builder.colliders.length).toBe(0);
    const count = (g: THREE.Group) => g.children.reduce((n, c) => n + (c as THREE.Mesh).geometry.getAttribute('position').count / 3, 0);
    const full = r.builder.build('f'), far = lowR.builder.build('l');
    expect(count(far)).toBeLessThan(count(full) * 0.6);
    const bf = new THREE.Box3().setFromObject(full), bl = new THREE.Box3().setFromObject(far);
    expect(bl.max.y).toBeCloseTo(bf.max.y, 1);
  });
});

describe('fillBlock with avoid polygons', () => {
  const avoid: Polygon = [[18, 12], [52, 12], [52, 40], [18, 40]];
  // Strictly inside (a few cm of tolerance at the boundary).
  const inside = (x: number, z: number) => pointInPolygon([x, z], avoid) && distToPolygonEdge([x, z], avoid) > 0.05;

  it('puts no spots, colliders or yard surface inside the avoid area', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const r = fillBlock(block, { heightAt: slope, seed, wealth: 0.5, density: 0.6, avoid: [avoid], id: 'A:' });
      for (const s of r.spots) expect(inside(s.position.x, s.position.z), `seed ${seed} spot ${s.id}`).toBe(false);
      for (const c of r.builder.colliders) {
        if (c.kind === 'trimesh') continue;
        expect(inside(c.center.x, c.center.z), `seed ${seed} ${c.kind} collider`).toBe(false);
      }
      const dirt = r.builder.build('a').children.find((m) => m.name === 'a:dirt') as THREE.Mesh;
      expect(dirt).toBeTruthy();
      const pos = dirt.geometry.getAttribute('position');
      let tris = 0;
      for (let i = 0; i < pos.count; i += 3) {
        const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
        if (inside(x, z)) tris++;
      }
      expect(tris, `seed ${seed} yard triangles inside avoid`).toBe(0);
    }
  });

  it('still paves the yard around the avoid area', () => {
    const r = fillBlock(block, { heightAt: slope, seed: 2, wealth: 0.5, density: 0.6, avoid: [avoid] });
    const dirt = r.builder.build('a').children.find((m) => m.name === 'a:dirt') as THREE.Mesh;
    dirt.geometry.computeBoundingBox();
    const bb = dirt.geometry.boundingBox!;
    expect(bb.min.x).toBeLessThan(1);
    expect(bb.max.x).toBeGreaterThan(69);
  });
});
