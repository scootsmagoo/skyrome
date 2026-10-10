import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { freeArray, packNormals, releaseStaticMeshes } from '../src/gfx/release';
import { Batch } from '../src/world/city/batches';

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
    (dyn.geometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
    (dyn.geometry.getAttribute('normal') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
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

  it('exports one module-level free callback (a closure made in a builder would keep the builder alive)', () => {
    const a = new THREE.BufferAttribute(new Float32Array(3), 3);
    a.onUpload(freeArray);
    a.onUploadCallback();
    expect(a.array).toBeNull();
    // No captured scope: the function only touches `this`.
    expect(freeArray.toString()).not.toMatch(/parts|merged/);
  });

  it('city batches store normals as bytes, for every geometry they take', () => {
    const batch = new Batch(new THREE.MeshBasicMaterial(), false, 'test', 4096, 8);
    const a = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    const b = new THREE.SphereGeometry(1, 8, 6).toNonIndexed();
    batch.add(a);
    batch.add(b);
    batch.shape('k', () => new THREE.BoxGeometry(2, 2, 2).toNonIndexed());
    const n = batch.mesh.geometry.getAttribute('normal') as THREE.BufferAttribute;
    expect(n.array).toBeInstanceOf(Int8Array);
    expect(n.normalized).toBe(true);
  });
});
