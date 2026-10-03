/**
 * Round temples (tholoi): a ring of Corinthian columns round a cylindrical cella under a conical
 * tiled roof. Two bases:
 *  - 'podium' with frontal stairs (Temple of Vesta in the Forum: 20 columns on a high podium);
 *  - 'steps', a stepped crepidoma all round (Temple of Hercules Victor by the Tiber, 20 columns).
 *
 * Local frame: centred on the origin, the door and stairs face −z, y = 0 is the ground.
 */
import * as THREE from 'three';
import type { MeshBuilder } from '../../gfx/MeshBuilder';
import type { MaterialId } from '../../gfx/materialIds';
import { ProfileBuilder, T, TRS, lathe, mul } from '../common/geom';
import { stairs, stepCount } from '../common/stairs';
import { column } from './column';
import { entablature } from './entablature';
import { columnDims, diameterForHeight, type Detail, type Order } from './orders';

export interface TholosSpec {
  order?: Order;
  /** Number of columns (Vesta and Hercules Victor: 20). */
  columns?: number;
  /** Radius of the circle through the column axes. */
  radius: number;
  columnHeight?: number;
  D?: number;
  base?: 'podium' | 'steps';
  /** Podium height or total crepidoma height. */
  baseHeight?: number;
  material?: MaterialId;
  cellaMaterial?: MaterialId;
  podiumMaterial?: MaterialId;
  roofMaterial?: MaterialId;
  /** Roof pitch in degrees (default 24). */
  pitchDeg?: number;
  fluted?: boolean;
  detail?: Detail;
}

export interface TholosResult {
  height: number;
  baseHeight: number;
  outerRadius: number;
}

/** Circle polygon walked so that sweep()'s outward normal (dz, 0, −dx) points away from the centre. */
function circle(r: number, n: number, y: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push(new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a)));
  }
  return out;
}

export function tholos(b: MeshBuilder, spec: TholosSpec, at?: THREE.Matrix4): TholosResult {
  const m = at ?? new THREE.Matrix4();
  const order = spec.order ?? 'corinthian';
  const n = spec.columns ?? 20;
  const R = spec.radius;
  const H = spec.columnHeight ?? Math.min(R * 1.45, 11);
  const D = spec.D ?? diameterForHeight(order, H);
  const dims = columnDims(order, D, H);
  const detail = spec.detail ?? 'high';
  const mat = spec.material ?? 'marble';
  const podMat = spec.podiumMaterial ?? (spec.base === 'steps' ? mat : 'travertine');
  const segs = detail === 'high' ? n * 4 : n * 2;
  const baseKind = spec.base ?? 'podium';
  const outerR = R + dims.plinth / 2 + 0.35;
  let P: number;

  if (baseKind === 'steps') {
    // Crepidoma: concentric steps all round, each a stacked cylinder the player can climb.
    const total = spec.baseHeight ?? 1.1;
    const { count, rise } = stepCount(total, 0.22);
    const run = 0.36;
    for (let i = 0; i < count; i++) {
      const r = outerR + (count - 1 - i) * run;
      // the top step stops short of its top face: the paving disc covers it (no coplanar faces)
      const last = i === count - 1;
      const prof = new ProfileBuilder(r, i * rise).up(rise).to(last ? r - 0.1 : 0, (i + 1) * rise - (last ? 0.03 : 0)).build();
      b.add(lathe(prof, { segments: segs }), podMat, m);
      const c = new THREE.Vector3(0, ((i + 1) * rise) / 2, 0).applyMatrix4(m);
      b.collider({ kind: 'cylinder', center: c, halfHeight: ((i + 1) * rise) / 2, radius: r });
    }
    P = count * rise;
  } else {
    P = spec.baseHeight ?? Math.max(1.6, H * 0.32);
    const s = Math.min(1, P / 3);
    const nn = detail === 'high' ? 4 : 2;
    const prof = new ProfileBuilder(outerR + 0.16 * s, 0)
      .up(0.22 * s)
      .torus(0.14 * s, 0.05 * s, nn)
      .in(0.05 * s)
      .cymaReversa(-0.08 * s, 0.14 * s, nn)
      .to(outerR, P - 0.42 * s)
      .cymaReversa(0.07 * s, 0.12 * s, nn)
      .up(0.04 * s)
      .out(0.03 * s)
      .up(0.13 * s)
      .ovolo(0.06 * s, 0.08 * s, nn)
      .up(0.05 * s)
      .to(outerR, P)
      .to(outerR - 0.1, P - 0.03)
      .build();
    b.add(lathe(prof, { segments: segs, capTop: false }), podMat, m);
    const c = new THREE.Vector3(0, P / 2, 0).applyMatrix4(m);
    b.collider({ kind: 'cylinder', center: c, halfHeight: P / 2, radius: outerR });
    // Frontal stairs towards −z, flanked by the curve of the podium.
    const { count, rise } = stepCount(P, 0.22);
    const run = 0.34;
    const w = Math.min(outerR * 1.1, 2 * R * Math.sin(Math.PI / n) * 2.2);
    const z0 = -outerR - count * run + 0.6;
    stairs(b, { width: w, rise, run, count, material: podMat }, mul(m, T(0, 0, z0)));
    // cheek walls
    for (const sx of [-1, 1]) {
      b.box(podMat, 0.5, P, count * run, mul(m, T(sx * (w / 2 + 0.25), P / 2, z0 + (count * run) / 2)), { collide: true });
    }
  }
  // Paving of the top (the base profiles stop just below it, so nothing is coplanar).
  b.add(lathe(new ProfileBuilder(outerR + (baseKind === 'steps' ? 0 : 0.02), P).to(0, P).build(), { segments: segs }), 'paving_travertine', m, { castShadow: false });

  // Columns, oriented radially so the abaci line up with the ring.
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / n;
    column(b, { order, D, height: H, fluted: spec.fluted ?? true, material: mat, detail }, mul(m, TRS(R * Math.sin(a), P, R * Math.cos(a), 0, a, 0)));
  }
  // Circular entablature (architrave face over the upper shaft face).
  const yE = P + H;
  const entPath = circle(R + dims.d / 2, segs, yE);
  const ent = entablature(b, entPath, { order, columnHeight: H, D, material: mat, detail, axial: (2 * Math.PI * R) / n }, { closed: true, at: m });
  const yTop = yE + ent.dims.total;

  // Cella: cylindrical wall with the door towards −z; a lintel closes the wall over the door.
  const cellaR = R - Math.max(1.6, 1.9 * D);
  const wallT = Math.max(0.5, 0.7 * D);
  const wallH = H + ent.dims.architrave + ent.dims.frieze;
  const doorW = Math.min(cellaR * 0.75, H * 0.35);
  const doorH = Math.min(H * 0.72, doorW * 2.2);
  const half = Math.asin(Math.min(0.95, doorW / 2 / cellaR));
  const cellaMat = spec.cellaMaterial ?? mat;
  const wallProf = new ProfileBuilder(cellaR, 0).up(wallH).in(wallT).to(cellaR - wallT, 0).build();
  // full ring except the door gap (θ = π is −z)
  const t0 = Math.PI + half;
  const t1 = Math.PI * 3 - half;
  b.add(lathe(wallProf, { segments: segs, theta0: t0, theta1: t1 }), cellaMat, mul(m, T(0, P, 0)));
  const lintel = new ProfileBuilder(cellaR, doorH).up(wallH - doorH).in(wallT).to(cellaR - wallT, doorH).build();
  b.add(lathe(lintel, { segments: 4, theta0: Math.PI - half, theta1: Math.PI + half }), cellaMat, mul(m, T(0, P, 0)));
  // door jambs (flat ends of the wall), and closed bronze doors set back in the opening
  for (const sx of [-1, 1]) {
    const a = Math.PI + sx * half;
    const jamb = new THREE.BoxGeometry(0.02, doorH, wallT);
    jamb.translate(0, doorH / 2, -(cellaR - wallT / 2));
    jamb.rotateY(a - Math.PI);
    b.add(jamb, cellaMat, mul(m, T(0, P, 0)));
  }
  const leaf = new THREE.BoxGeometry(doorW * 0.98, doorH, 0.1);
  leaf.translate(0, P + doorH / 2, -(cellaR - wallT * 0.55) * Math.cos(half));
  b.add(leaf, 'bronze', m);
  const cc = new THREE.Vector3(0, P + wallH / 2, 0).applyMatrix4(m);
  b.collider({ kind: 'cylinder', center: cc, halfHeight: wallH / 2, radius: cellaR });
  // Ceiling ring between the cella and the entablature, and a cap over the cella.
  const ceil = new ProfileBuilder(R + dims.d / 2 + 0.05, yE + ent.dims.architrave + ent.dims.frieze).to(0, yE + ent.dims.architrave + ent.dims.frieze).build();
  b.add(lathe({ pts: [...ceil.pts].reverse(), smooth: ceil.smooth }, { segments: segs }), 'wood_dark', m, { castShadow: false });
  // Conical roof from the cornice to an apex, tiles running down the slope.
  const pitch = ((spec.pitchDeg ?? 24) * Math.PI) / 180;
  const roofR = R + ent.projection + 0.15;
  const rise = roofR * Math.tan(pitch);
  const roofProf = new ProfileBuilder(0.02, yTop + rise).to(roofR, yTop - 0.05).build();
  b.add(lathe({ pts: [...roofProf.pts].reverse(), smooth: roofProf.smooth }, { segments: segs }), spec.roofMaterial ?? 'roof_tile', m, { uv: 'keep' });
  const under = new ProfileBuilder(roofR, yTop - 0.15).to(0.02, yTop + rise - 0.15).build();
  b.add(lathe({ pts: [...under.pts].reverse(), smooth: under.smooth }, { segments: segs }), 'wood_dark', m, { castShadow: false });
  // Finial.
  const fin = new ProfileBuilder(0.0, yTop + rise - 0.05).to(0.35, yTop + rise - 0.05).up(0.12).to(0.12, yTop + rise + 0.3).ovolo(0.16, 0.25, 4).to(0, yTop + rise + 0.75).build();
  b.add(lathe(fin, { segments: 12 }), 'gilded_bronze', m);
  return { height: yTop + rise + 0.75, baseHeight: P, outerRadius: outerR };
}
