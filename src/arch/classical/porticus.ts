/**
 * Porticoes: a colonnade along any path with entablature, a back wall, a lean-to tiled roof,
 * a flat ceiling and a stepped stylobate. `quadriporticus()` wraps one round a rectangular court
 * (Porticus of Octavia, the Forum of Augustus' flanks, temple precincts).
 *
 * Path convention (as geom.sweep): the colonnade FACES the right-hand side of the direction of
 * travel, the back wall lies `depth` to the left. Points are the column axes at ground level.
 */
import * as THREE from 'three';
import type { MeshBuilder } from '../../gfx/MeshBuilder';
import type { MaterialId } from '../../gfx/materialIds';
import { ProfileBuilder, T, mul, offsetPath, sweep } from '../common/geom';
import { column } from './column';
import { entablature } from './entablature';
import { ORDER_PROPORTIONS, columnDims, diameterForHeight, type Detail, type Order } from './orders';

export interface PorticusSpec {
  order?: Order;
  /** Column height (default 5.5 m). */
  columnHeight?: number;
  /** Lower diameter (default canonical for the height). */
  D?: number;
  /** Target axial spacing; each straight run is divided evenly (default 3.2 D). */
  spacing?: number;
  /** Distance from the column axes to the inner face of the back wall. */
  depth: number;
  /** 'wall' (default) or 'none' (the back is provided by something else). */
  back?: 'wall' | 'none';
  /** Stylobate (step) height above the ground (default 0.3). */
  stylobate?: number;
  material?: MaterialId;
  wallMaterial?: MaterialId;
  roofMaterial?: MaterialId;
  floorMaterial?: MaterialId;
  fluted?: boolean;
  detail?: Detail;
  columnDetail?: Detail;
  closed?: boolean;
  /** Base elevation of the stylobate bottom (e.g. the top of a cavea). */
  y?: number;
}

export interface PorticusResult {
  columns: number;
  height: number;
}

export function porticus(b: MeshBuilder, path: THREE.Vector3[], spec: PorticusSpec, at?: THREE.Matrix4): PorticusResult {
  const m = at ?? new THREE.Matrix4();
  const order = spec.order ?? 'ionic';
  const H = spec.columnHeight ?? 5.5;
  const D = spec.D ?? diameterForHeight(order, H);
  const dims = columnDims(order, D, H);
  const detail = spec.detail ?? 'high';
  const mat = spec.material ?? 'marble';
  const wallMat = spec.wallMaterial ?? 'plaster_cream';
  const st = spec.stylobate ?? 0.3;
  const y0 = spec.y ?? 0;
  const closed = !!spec.closed;
  const spacing = spec.spacing ?? 3.2 * D;
  const depth = spec.depth;
  const yCol = y0 + st;
  const lift = (p: THREE.Vector3, y: number) => new THREE.Vector3(p.x, y, p.z);

  // Stylobate / floor: from the back wall to a step in front of the columns.
  const front = dims.plinth / 2 + 0.25;
  // Profiles run counter-clockwise in (x outward, y up) — solid on the left — so normals face out.
  const floor = new ProfileBuilder(-depth - 0.05, st).to(-depth - 0.05, 0).to(front, 0).to(front, st).to(-depth - 0.05, st).build();
  b.add(sweep(floor, path.map((p) => lift(p, y0)), { closed, caps: !closed }), spec.floorMaterial ?? 'paving_travertine', m);

  // Columns, evenly spaced on every straight run, corners shared.
  let count = 0;
  const nSeg = closed ? path.length : path.length - 1;
  for (let i = 0; i < nSeg; i++) {
    const a = path[i];
    const c = path[(i + 1) % path.length];
    const len = a.distanceTo(c);
    const n = Math.max(1, Math.round(len / spacing));
    const last = !closed && i === nSeg - 1 ? n : n - 1;
    for (let k = 0; k <= last; k++) {
      const p = a.clone().lerp(c, k / n);
      column(b, { order, D, height: H, fluted: spec.fluted ?? false, material: mat, detail: spec.columnDetail ?? detail }, mul(m, T(p.x, yCol, p.z)));
      count++;
    }
  }

  // Entablature on the columns (architrave face at the upper-shaft face, outward side).
  const d = dims.d;
  const ent = entablature(
    b,
    offsetPath(path, d / 2, closed).map((p) => lift(p, yCol + H)),
    { order, columnHeight: H, D, material: mat, detail, depth: depth + d / 2, axial: spacing },
    { closed, at: m, caps: !closed },
  );
  const yTop = yCol + H + ent.dims.total;

  // Back wall.
  if ((spec.back ?? 'wall') === 'wall') {
    const t = 0.6;
    const wallH = yTop - y0 + 1.2;
    const prof = new ProfileBuilder(-depth, 0).to(-depth, wallH).to(-depth - t, wallH).to(-depth - t, 0).build();
    b.add(sweep(prof, path.map((p) => lift(p, y0)), { closed, caps: !closed }), wallMat, m);
    // colliders per segment
    for (let i = 0; i < nSeg; i++) {
      const a = path[i];
      const c = path[(i + 1) % path.length];
      const dir = c.clone().sub(a);
      const len = dir.length();
      dir.normalize();
      const out = new THREE.Vector3(dir.z, 0, -dir.x);
      const mid = a.clone().add(c).multiplyScalar(0.5).addScaledVector(out, -depth - t / 2);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(-dir.z, dir.x), 0));
      const w = mul(m, new THREE.Matrix4().compose(new THREE.Vector3(mid.x, y0 + wallH / 2, mid.z), q, new THREE.Vector3(1, 1, 1)));
      const pos = new THREE.Vector3();
      const qq = new THREE.Quaternion();
      w.decompose(pos, qq, new THREE.Vector3());
      b.collider({ kind: 'box', center: pos, half: new THREE.Vector3(len / 2 + t, wallH / 2, t / 2), rotation: qq });
    }
  }
  // Ceiling at the frieze top, and a lean-to roof from the wall top down over the cornice.
  const ceilY = yCol + H + ent.dims.architrave + ent.dims.frieze;
  const ceil = new ProfileBuilder(-depth, ceilY).to(0, ceilY).to(0, ceilY + 0.15).to(-depth, ceilY + 0.15).build();
  b.add(sweep(ceil, path.map((p) => lift(p, 0)), { closed, caps: !closed }), 'wood_dark', m, { castShadow: false });
  const proj = ent.projection + 0.1;
  const rise = Math.tan((15 * Math.PI) / 180) * (depth + proj);
  const roofProf = new ProfileBuilder(proj, yTop - 0.05).to(-depth - 0.6, yTop - 0.05 + rise).to(-depth - 0.6, yTop + 0.1 + rise).to(proj, yTop + 0.1).build();
  b.add(sweep({ pts: [...roofProf.pts].reverse(), smooth: roofProf.smooth }, path.map((p) => lift(p, 0)), { closed, caps: !closed }), spec.roofMaterial ?? 'roof_tile', m, { uv: 'keep' });
  return { columns: count, height: yTop + rise - y0 };
}

/**
 * Colonnades round a rectangular court of `width` × `length` (column-axis rectangle, centred on
 * the origin), facing inward, with the back wall `depth` outside the columns.
 */
export function quadriporticus(b: MeshBuilder, width: number, length: number, spec: PorticusSpec, at?: THREE.Matrix4) {
  const hw = width / 2;
  const hl = length / 2;
  // Reverse orientation of the sweep convention so "outward" (the facing side) is the court.
  const path = [new THREE.Vector3(-hw, 0, -hl), new THREE.Vector3(-hw, 0, hl), new THREE.Vector3(hw, 0, hl), new THREE.Vector3(hw, 0, -hl)];
  return porticus(b, path, { ...spec, closed: true }, at);
}

export { ORDER_PROPORTIONS };
