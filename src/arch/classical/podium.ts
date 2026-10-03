/**
 * Roman podium: a solid block on any floor-plan outline, with a moulded base (plinth, torus,
 * cyma reversa) and crown (cyma reversa, fillet, ovolo) swept around it.
 */
import * as THREE from 'three';
import type { MeshBuilder } from '../../gfx/MeshBuilder';
import type { MaterialId } from '../../gfx/materialIds';
import { ProfileBuilder, sweep, type V2 } from '../common/geom';
import { orientOutline, prism } from '../common/walls';
import type { Detail } from './orders';

export interface PodiumSpec {
  /** Floor-plan outline in XZ (either orientation). */
  outline: V2[];
  height: number;
  material?: MaterialId;
  /** Material of the top surface (paving). Default: material. */
  topMaterial?: MaterialId;
  detail?: Detail;
  /** Box colliders as [x0, z0, x1, z1] rectangles (default: the outline's bounding box). */
  colliders?: [number, number, number, number][];
  base?: boolean;
  crown?: boolean;
}

export function podium(b: MeshBuilder, spec: PodiumSpec, at?: THREE.Matrix4) {
  const m = at ?? new THREE.Matrix4();
  const P = spec.height;
  const mat = spec.material ?? 'travertine';
  const detail = spec.detail ?? 'high';
  const n = detail === 'high' ? 4 : 2;
  const outline = orientOutline(spec.outline);
  const path = outline.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const topH = Math.min(0.08, P * 0.05);
  b.add(prism(outline, 0, P - topH), mat, m);
  b.add(prism(outline, P - topH, P), spec.topMaterial ?? mat, m);
  const s = Math.min(1, P / 3);
  if (spec.base ?? true) {
    const prof = new ProfileBuilder(-0.05, 0)
      .to(0.16 * s, 0)
      .up(0.22 * s)
      .torus(0.14 * s, 0.05 * s, n)
      .in(0.05 * s)
      .cymaReversa(-0.08 * s, 0.14 * s, n)
      .to(-0.05, p0(0.22 + 0.14 + 0.14, s))
      .build();
    b.add(sweep(prof, path, { closed: true }), mat, m);
  }
  if (spec.crown ?? true) {
    const y0 = P - 0.42 * s;
    const prof = new ProfileBuilder(-0.05, y0)
      .to(0, y0)
      .cymaReversa(0.07 * s, 0.12 * s, n)
      .up(0.04 * s)
      .out(0.03 * s)
      .up(0.13 * s)
      .ovolo(0.06 * s, 0.08 * s, n)
      .up(0.05 * s)
      .to(0, P)
      // tuck into the core below the top face so nothing is coplanar with the paving (no z-fighting)
      .to(-0.05, P - 0.03)
      .build();
    b.add(sweep(prof, path, { closed: true }), mat, m);
  }
  const rects = spec.colliders ?? [bounds(outline)];
  for (const [x0, z0, x1, z1] of rects) {
    const c = new THREE.Vector3((x0 + x1) / 2, P / 2, (z0 + z1) / 2).applyMatrix4(m);
    const q = new THREE.Quaternion();
    m.decompose(new THREE.Vector3(), q, new THREE.Vector3());
    b.collider({ kind: 'box', center: c, half: new THREE.Vector3((x1 - x0) / 2, P / 2, (z1 - z0) / 2), rotation: q });
  }
}

const p0 = (h: number, s: number) => h * s;

function bounds(pts: V2[]): [number, number, number, number] {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const [x, z] of pts) {
    x0 = Math.min(x0, x);
    z0 = Math.min(z0, z);
    x1 = Math.max(x1, x);
    z1 = Math.max(z1, z);
  }
  return [x0, z0, x1, z1];
}
