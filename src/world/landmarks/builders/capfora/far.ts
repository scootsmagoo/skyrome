/**
 * Cheap far stand-ins (a few hundred triangles) for the capfora landmarks, shown by the
 * WorldRegistry beyond the full-detail cull distance: the massing, the colonnade rhythm, the
 * cornice shadow line, the roof colour and the gilding (architecture.md §1.8, LOD3 "skyline").
 */
import * as THREE from 'three';
import type { TempleLayout } from '../../../../arch/classical/temple';
import { mul, T } from '../../../../arch/common/geom';
import type { MeshBuilder } from '../../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../../gfx/materialIds';
import { span } from './ornament';

/** Gable roof prism along z between x0..x1, eaves at y, ridge rise `rise`. */
export function roofPrism(b: MeshBuilder, mat: MaterialId, x0: number, x1: number, z0: number, z1: number, y: number, rise: number, at?: THREE.Matrix4) {
  const w = x1 - x0;
  const shape = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, rise)]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: z1 - z0, bevelEnabled: false });
  g.translate((x0 + x1) / 2, y, z0);
  b.add(g, mat, at);
}

/** Lean-to roof slab from (z0, y0) up to (z1, y1) across x0..x1. */
export function leanTo(b: MeshBuilder, mat: MaterialId, x0: number, x1: number, z0: number, y0: number, z1: number, y1: number, at?: THREE.Matrix4) {
  const run = z1 - z0;
  const rise = y1 - y0;
  const g = new THREE.BoxGeometry(x1 - x0, 0.2, Math.hypot(run, rise));
  g.rotateX(-Math.atan2(rise, run));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  b.add(g, mat, at);
}

/** A temple from its kit layout: podium, stair, columns as prisms, cella, entablature, roof, pediments. */
export function templeFar(b: MeshBuilder, L: TempleLayout, at: THREE.Matrix4, o: { mat?: MaterialId; podium?: MaterialId; roof?: MaterialId; cella?: MaterialId } = {}) {
  const mat = o.mat ?? 'marble';
  const P = L.podiumHeight;
  const s = L.stylobate;
  span(b, o.podium ?? 'travertine', s.x0, 0, s.z0, s.x1, P, s.z1, at);
  // Stairs as a ramp-shaped block.
  const st = L.stairs;
  if (L.stairMode === 'front') {
    const g = new THREE.BoxGeometry(st.x1 - st.x0, P * 0.5, st.z1 - st.z0);
    g.translate((st.x0 + st.x1) / 2, P * 0.25, (st.z0 + st.z1) / 2);
    b.add(g, o.podium ?? 'travertine', at);
    span(b, o.podium ?? 'travertine', st.x0, 0, (st.z0 + st.z1) / 2, st.x1, P * 0.8, st.z1, at);
  }
  const col = new THREE.CylinderGeometry(L.D * 0.42, L.D * 0.5, L.H, 6);
  for (const c of L.columns) b.add(col.clone().translate(c.x, P + L.H / 2, c.z), mat, at);
  const cl = L.cella;
  span(b, o.cella ?? mat, cl.x0, P, cl.z0, cl.x1, P + L.H, cl.z1, at);
  const e = L.entablature;
  span(b, mat, e.x0, P + L.H, e.z0, e.x1, P + L.H + e.height, e.z1, at);
  const rise = ((e.x1 - e.x0) / 2) * Math.tan((13.5 * Math.PI) / 180);
  roofPrism(b, o.roof ?? 'roof_tile', e.x0 - 0.3, e.x1 + 0.3, e.z0, e.z1, P + L.H + e.height, rise, at);
  // Pediment faces in marble just inside the roof ends.
  for (const z of [e.z0 - 0.02, e.z1 + 0.02]) {
    const w = e.x1 - e.x0;
    const shape = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, rise)]);
    const g = new THREE.ShapeGeometry(shape);
    if (z < 0) g.rotateY(Math.PI);
    g.translate((e.x0 + e.x1) / 2, P + L.H + e.height, z);
    b.add(g, mat, at);
  }
}

/** Box wall from (x0, z0) to (x1, z1) in plan, thickness t (centred), from y0 to y1. */
export function farWall(b: MeshBuilder, mat: MaterialId, x0: number, z0: number, x1: number, z1: number, t: number, y0: number, y1: number, at?: THREE.Matrix4) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const m = new THREE.Matrix4().makeRotationY(Math.atan2(-(z1 - z0), x1 - x0)).setPosition((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  b.box(mat, len, y1 - y0, t, mul(at, m));
}

/** A colonnade front as a stripe of prisms (dark gaps read as the rhythm at a distance). */
export function farColonnade(b: MeshBuilder, mat: MaterialId, x0: number, x1: number, z: number, y: number, H: number, n: number, D: number, at?: THREE.Matrix4) {
  const col = new THREE.CylinderGeometry(D * 0.45, D * 0.5, H, 5);
  for (let k = 0; k < n; k++) {
    const x = x0 + ((k + 0.5) * (x1 - x0)) / n;
    b.add(col.clone().translate(x, y + H / 2, z), mat, at);
  }
}

export { T };
