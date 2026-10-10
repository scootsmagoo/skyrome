import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { boxProjectUVs } from '../src/gfx/uv';
import { uvStretch } from '../src/gfx/uvstretch';

describe('uvStretch', () => {
  it('box-projected axis-aligned boxes are faithful at any size', () => {
    const g = boxProjectUVs(new THREE.BoxGeometry(14, 3, 0.4), 2);
    const s = uvStretch(g, 2);
    expect(s.badArea).toBe(0);
    expect(s.worst).toBeLessThan(1.05);
  });

  it('a texture stretched along one axis is reported as bad', () => {
    const g = boxProjectUVs(new THREE.PlaneGeometry(10, 10).rotateX(-Math.PI / 2), 2);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.2);
    const s = uvStretch(g, 2);
    expect(s.badArea).toBeCloseTo(s.area, 5);
    expect(s.worst).toBeGreaterThan(4.5);
  });

  it('box projection of a 45 degree slope is the worst it can do (about 1.41)', () => {
    const g = new THREE.PlaneGeometry(4, 4).rotateX(-Math.PI / 4 - 0.001);
    const s = uvStretch(boxProjectUVs(g, 2), 2);
    expect(s.worst).toBeGreaterThan(1.38);
    expect(s.worst).toBeLessThan(1.45);
    expect(uvStretch(boxProjectUVs(g, 2), 2, 1.3).badArea).toBeGreaterThan(0);
    expect(uvStretch(boxProjectUVs(g, 2), 2, 1.8).badArea).toBe(0);
  });

  it('projects by the triangle itself, not by smoothed vertex normals', () => {
    // A vertical wall triangle whose vertex normals (as on a smooth fluted shaft) point up.
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0.2, 0, 1, 0.2, 0, 1, 0.2], 3));
    const s = uvStretch(boxProjectUVs(g, 2), 2);
    expect(s.collapsedArea).toBe(0);
    expect(s.worst).toBeLessThan(1.05);
  });

  it('collapsed UVs count as bad', () => {
    const g = new THREE.PlaneGeometry(2, 2).toNonIndexed();
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    const s = uvStretch(g, 2);
    expect(s.collapsedArea).toBeCloseTo(4, 5);
  });
});
