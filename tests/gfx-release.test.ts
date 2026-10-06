import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { packNormals, releaseStaticMeshes } from '../src/gfx/release';

describe('gfx/release', () => {
  it('packs static normals into normalized bytes within half a degree', () => {
    const g = new THREE.SphereGeometry(1, 16, 12);
    const before = (g.getAttribute('normal').array as Float32Array).slice();
    expect(packNormals(g)).toBe(true);
    const n = g.getAttribute('normal') as THREE.BufferAttribute;
    expect(n.array).toBeInstanceOf(Int8Array);
    expect(n.normalized).toBe(true);
    let worst = 0;
    for (let i = 0; i < n.count; i++) {
      const a = new THREE.Vector3(before[i * 3], before[i * 3 + 1], before[i * 3 + 2]).normalize();
      const b = new THREE.Vector3(n.getX(i), n.getY(i), n.getZ(i)).normalize();
      worst = Math.max(worst, a.angleTo(b));
    }
    expect(worst).toBeLessThan((0.5 * Math.PI) / 180);
    expect(packNormals(g)).toBe(false);
  });

  it('marks static meshes only: skinned and dynamic geometry keep their arrays; bounds come first', () => {
    const root = new THREE.Group();
    const stat = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const dyn = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    dyn.geometry.getAttribute('position').setUsage(THREE.DynamicDrawUsage);
    dyn.geometry.getAttribute('normal').setUsage(THREE.DynamicDrawUsage);
    const kept = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    kept.userData.keepCpu = true;
    root.add(stat, dyn, kept);
    expect(releaseStaticMeshes(root)).toBe(2);
    expect(stat.geometry.boundingSphere).not.toBeNull();
    // The upload callback frees a static attribute; a dynamic one is never marked.
    const pos = stat.geometry.getAttribute('position') as THREE.BufferAttribute;
    pos.onUploadCallback();
    expect(pos.array).toBeNull();
    const dpos = dyn.geometry.getAttribute('position') as THREE.BufferAttribute;
    dpos.onUploadCallback();
    expect(dpos.array).not.toBeNull();
    expect(kept.geometry.getAttribute('normal').array).toBeInstanceOf(Float32Array);
  });
});
