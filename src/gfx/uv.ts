/** UV helpers for procedural geometry: world-scale box projection so textures tile at real size. */
import * as THREE from 'three';

/**
 * Assigns UVs by projecting each triangle onto the plane most perpendicular to its normal
 * (triplanar "box" mapping). `metersPerTile` = how many meters one texture repeat covers.
 * Works on indexed geometry by de-indexing first (returns a new geometry if needed).
 */
export function boxProjectUVs(geometry: THREE.BufferGeometry, metersPerTile = 2, matrix?: THREE.Matrix4): THREE.BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nor = g.getAttribute('normal') as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  const p2 = new THREE.Vector3();
  const gn = new THREE.Vector3();
  const nm = matrix ? new THREE.Matrix3().getNormalMatrix(matrix) : null;
  const s = 1 / metersPerTile;
  for (let i = 0; i < pos.count; i += 3) {
    // The plane to project on follows the triangle's own geometry (so no triangle is ever seen at
    // a grazing angle, which stretched fluted shafts and lathe mouldings by 20x), with the sign
    // of the shading normals (which way the surface faces).
    n.set(0, 0, 0);
    for (let k = 0; k < 3; k++) n.x += nor.getX(i + k), n.y += nor.getY(i + k), n.z += nor.getZ(i + k);
    if (nm) n.applyMatrix3(nm);
    p0.fromBufferAttribute(pos, i);
    p1.fromBufferAttribute(pos, i + 1);
    p2.fromBufferAttribute(pos, i + 2);
    if (matrix) p0.applyMatrix4(matrix), p1.applyMatrix4(matrix), p2.applyMatrix4(matrix);
    gn.subVectors(p1, p0).cross(p2.sub(p0));
    if (gn.lengthSq() > 1e-12) n.copy(gn.dot(n) < 0 ? gn.negate() : gn);
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      p.fromBufferAttribute(pos, i + k);
      if (matrix) p.applyMatrix4(matrix);
      let u: number, v: number;
      if (ay >= ax && ay >= az) { u = p.x; v = p.z; }
      else if (ax >= az) { u = p.z * Math.sign(n.x || 1); v = p.y; }
      else { u = p.x * -Math.sign(n.z || 1); v = p.y; }
      uv[(i + k) * 2] = u * s;
      uv[(i + k) * 2 + 1] = v * s;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
