/**
 * A faster per-instance frustum cull for BatchedMeshes whose instances never move.
 *
 * three.js's BatchedMesh.onBeforeRender walks every instance in every pass (main and shadow):
 * fetch its matrix, fetch its geometry's bounding sphere, transform the sphere (including the
 * largest axis scale), test six planes. For the ~6 k static landmark instances that was ~0.65 ms a
 * frame. Here each instance's world sphere is stored once (`setSphere`, a float4 per instance id)
 * and the walk is just the six plane tests. The draw list it writes is the same one three.js
 * writes (starts, counts, indirect ids), so the renderer and the shaders are untouched.
 *
 * The sphere must contain the instance in every geometry it can show (LOD twins are smaller than
 * the original, so the original's sphere does). Written against three r186's BatchedMesh fields;
 * if a field is missing (another version) the mesh keeps three.js's own walk.
 */
import * as THREE from 'three';

interface BatchedInternals {
  _instanceInfo: { visible: boolean; active: boolean; geometryIndex: number }[];
  _geometryInfo: { start: number; count: number }[];
  _multiDrawStarts: Int32Array | number[];
  _multiDrawCounts: Int32Array | number[];
  _multiDrawCount: number;
  _multiDrawBytesPerElement: number;
  _visibilityChanged: boolean;
  _indirectTexture: THREE.DataTexture;
}

const frustum = new THREE.Frustum();
const projView = new THREE.Matrix4();

export class FastCull {
  private spheres = new Float32Array(64 * 4);

  constructor(private readonly mesh: THREE.BatchedMesh) {}

  /** The world-space sphere of instance `inst`. */
  setSphere(inst: number, x: number, y: number, z: number, r: number) {
    if ((inst + 1) * 4 > this.spheres.length) {
      const bigger = new Float32Array(Math.max(this.spheres.length * 2, (inst + 1) * 4));
      bigger.set(this.spheres);
      this.spheres = bigger;
    }
    const o = inst * 4;
    this.spheres[o] = x;
    this.spheres[o + 1] = y;
    this.spheres[o + 2] = z;
    this.spheres[o + 3] = r;
  }

  /** Take over the mesh's culling (a no-op on a three.js whose BatchedMesh differs from r186's). */
  install() {
    const m = this.mesh as unknown as BatchedInternals;
    if (!m._instanceInfo || !m._geometryInfo || !m._multiDrawStarts || !m._multiDrawCounts || !m._indirectTexture || this.mesh.sortObjects) return false;
    const original = THREE.BatchedMesh.prototype.onBeforeRender;
    const self = this;
    this.mesh.onBeforeRender = function (this: THREE.BatchedMesh, renderer, scene, camera, geometry, material, group) {
      if ((material as THREE.MeshBasicMaterial).wireframe || (camera as THREE.ArrayCamera).isArrayCamera || !self.mesh.perObjectFrustumCulled) {
        original.call(this, renderer, scene, camera, geometry, material, group);
        return;
      }
      self.cull(camera, geometry);
    } as THREE.Object3D['onBeforeRender'];
    return true;
  }

  /**
   * Whether any visible instance's sphere touches the camera's frustum (stops at the first). A mesh
   * with none can be hidden for the frame: three.js would still bind its program and textures.
   */
  anyVisible(camera: THREE.Camera): boolean {
    const m = this.mesh as unknown as BatchedInternals;
    projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(this.mesh.matrixWorld);
    frustum.setFromProjectionMatrix(projView, camera.coordinateSystem, (camera as THREE.PerspectiveCamera & { reversedDepth?: boolean }).reversedDepth);
    const p = frustum.planes;
    const instances = m._instanceInfo;
    const sp = this.spheres;
    for (let i = 0, l = instances.length; i < l; i++) {
      const info = instances[i];
      if (!info.visible || !info.active) continue;
      const o = i * 4;
      const x = sp[o], y = sp[o + 1], z = sp[o + 2], r = -sp[o + 3];
      let inside = true;
      for (let k = 0; k < 6; k++) {
        const pl = p[k];
        if (pl.normal.x * x + pl.normal.y * y + pl.normal.z * z + pl.constant < r) {
          inside = false;
          break;
        }
      }
      if (inside) return true;
    }
    return false;
  }

  private cull(camera: THREE.Camera, geometry: THREE.BufferGeometry) {
    const m = this.mesh as unknown as BatchedInternals;
    const index = geometry.getIndex();
    const bytes = index === null ? 1 : (index.array as ArrayBufferView & { BYTES_PER_ELEMENT: number }).BYTES_PER_ELEMENT;
    projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(this.mesh.matrixWorld);
    frustum.setFromProjectionMatrix(projView, camera.coordinateSystem, (camera as THREE.PerspectiveCamera & { reversedDepth?: boolean }).reversedDepth);
    const p = frustum.planes;
    const instances = m._instanceInfo;
    const geometries = m._geometryInfo;
    const starts = m._multiDrawStarts;
    const counts = m._multiDrawCounts;
    const indirect = m._indirectTexture.image.data as unknown as Uint32Array;
    const sp = this.spheres;
    const p0 = p[0], p1 = p[1], p2 = p[2], p3 = p[3], p4 = p[4], p5 = p[5];
    const n0x = p0.normal.x, n0y = p0.normal.y, n0z = p0.normal.z, c0 = p0.constant;
    const n1x = p1.normal.x, n1y = p1.normal.y, n1z = p1.normal.z, c1 = p1.constant;
    const n2x = p2.normal.x, n2y = p2.normal.y, n2z = p2.normal.z, c2 = p2.constant;
    const n3x = p3.normal.x, n3y = p3.normal.y, n3z = p3.normal.z, c3 = p3.constant;
    const n4x = p4.normal.x, n4y = p4.normal.y, n4z = p4.normal.z, c4 = p4.constant;
    const n5x = p5.normal.x, n5y = p5.normal.y, n5z = p5.normal.z, c5 = p5.constant;
    let n = 0;
    for (let i = 0, l = instances.length; i < l; i++) {
      const info = instances[i];
      if (!info.visible || !info.active) continue;
      const o = i * 4;
      const x = sp[o], y = sp[o + 1], z = sp[o + 2], r = -sp[o + 3];
      if (n0x * x + n0y * y + n0z * z + c0 < r) continue;
      if (n1x * x + n1y * y + n1z * z + c1 < r) continue;
      if (n2x * x + n2y * y + n2z * z + c2 < r) continue;
      if (n3x * x + n3y * y + n3z * z + c3 < r) continue;
      if (n4x * x + n4y * y + n4z * z + c4 < r) continue;
      if (n5x * x + n5y * y + n5z * z + c5 < r) continue;
      const g = geometries[info.geometryIndex];
      starts[n] = g.start * bytes;
      counts[n] = g.count;
      indirect[n] = i;
      n++;
    }
    m._indirectTexture.needsUpdate = true;
    m._multiDrawCount = n;
    m._multiDrawBytesPerElement = bytes;
    m._visibilityChanged = false;
  }
}
