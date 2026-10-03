import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MeshBuilder, transformCollider } from '../src/gfx/MeshBuilder';

describe('MeshBuilder', () => {
  it('merges per material and collects colliders', () => {
    const b = new MeshBuilder();
    b.box('marble', 1, 2, 1, new THREE.Matrix4().makeTranslation(0, 1, 0), { collide: true });
    b.box('marble', 1, 2, 1, new THREE.Matrix4().makeTranslation(3, 1, 0));
    b.add(new THREE.CylinderGeometry(0.3, 0.3, 4, 8), 'travertine');
    const g = b.build('t');
    expect(g.children.length).toBe(2);
    expect(b.colliders.length).toBe(1);
    const mesh = g.children.find((m) => (m as THREE.Mesh).name.endsWith('marble')) as THREE.Mesh;
    expect(mesh.geometry.getAttribute('uv')).toBeTruthy();
    expect(mesh.geometry.getAttribute('position').count).toBe(72);
  });
  it('transforms colliders', () => {
    const c = transformCollider(
      { kind: 'box', center: new THREE.Vector3(1, 0, 0), half: new THREE.Vector3(1, 1, 1) },
      new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(10, 0, 0),
    );
    expect(c.kind).toBe('box');
    if (c.kind === 'box') {
      expect(c.center.x).toBeCloseTo(10);
      expect(c.center.z).toBeCloseTo(-1);
    }
  });
});
