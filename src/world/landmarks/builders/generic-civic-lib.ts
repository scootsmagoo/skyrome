/**
 * Cheap building blocks for civic landmarks seen mostly from the street or afar: a light colonnade
 * (porticus) along any path, plain halls with painted openings, courtyard ranges, rows of tabernae
 * and brick vaulted cells. Geometry stays at a few dozen triangles per bay so long porticoes and
 * huge warehouses stay inside the landmark budgets; heroes use the kit where the player is close.
 */
import * as THREE from 'three';
import { sweep, type V2 } from '../../../arch/common/geom';
import type { Draw } from '../../../arch/fabric/draw';
import type { Order } from '../../../arch/classical/orders';
import type { MaterialId } from '../../../gfx/materialIds';
import type { LandmarkBuilder } from '../types';
import { V, cornice, tiledRoof, ringRoof, wallRun, type Detail, type V3 } from './generic-common';

export const builders: LandmarkBuilder[] = [];

export interface ColonnadeSpec {
  columnHeight: number;
  /** Axial spacing target. */
  spacing: number;
  /** Distance from the column axes to the back wall. */
  depth: number;
  material?: MaterialId;
  wallMaterial?: MaterialId;
  roofMaterial?: MaterialId;
  floorMaterial?: MaterialId;
  back?: 'wall' | 'none';
  closed?: boolean;
  detail: Detail;
  order?: Order;
  /** Base height of the stylobate bottom. */
  y?: number;
  stylobate?: number;
  /** Extra wall height above the roof line (two-storey porticoes). */
  storeys?: number;
}

const colCache = new Map<string, THREE.BufferGeometry[]>();

/** Simplified column pieces (shaft, base, capital) for a height and diameter. */
function liteColumn(H: number, D: number, order: Order, seg: number): THREE.BufferGeometry[] {
  const key = `${H.toFixed(2)}|${D.toFixed(3)}|${order}|${seg}`;
  let parts = colCache.get(key);
  if (parts) return parts;
  const baseH = order === 'tuscan' || order === 'doric' ? 0.2 * D : 0.4 * D;
  const capH = order === 'corinthian' || order === 'composite' ? 1.1 * D : 0.5 * D;
  const shaftH = H - baseH - capH;
  const shaft = new THREE.CylinderGeometry(0.42 * D, 0.5 * D, shaftH, seg, 1, true);
  shaft.translate(0, baseH + shaftH / 2, 0);
  const base = new THREE.CylinderGeometry(0.62 * D, 0.68 * D, baseH, seg);
  base.translate(0, baseH / 2, 0);
  const bell = new THREE.CylinderGeometry(order === 'tuscan' || order === 'doric' ? 0.58 * D : 0.62 * D, 0.44 * D, capH * 0.8, seg, 1, true);
  bell.translate(0, H - capH + capH * 0.4, 0);
  const abacus = new THREE.BoxGeometry(1.35 * D, capH * 0.2, 1.35 * D);
  abacus.translate(0, H - capH * 0.1, 0);
  parts = [shaft, base, bell, abacus];
  colCache.set(key, parts);
  return parts;
}

/** Place one lite column (with a cylinder collider). */
export function liteColumnAt(d: Draw, x: number, y: number, z: number, H: number, D: number, mat: MaterialId, order: Order, detail: Detail, collide = true) {
  const m = d.m.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z));
  for (const g of liteColumn(H, D, order, detail === 'high' ? 10 : 6)) d.b.add(g, mat, m);
  if (collide) d.solidCyl(x, y + H / 2, z, D * 0.5, H);
}

/**
 * A colonnade along a polyline (column axes at ground level). As the kit's porticus it FACES the
 * right-hand side of the path; the back wall stands `depth` to the left. Lean-to tiled roof.
 */
export function liteColonnade(d: Draw, path: V3[], spec: ColonnadeSpec): { columns: number; height: number } {
  const H = spec.columnHeight;
  const order = spec.order ?? 'ionic';
  const D = H / (order === 'tuscan' ? 7 : order === 'doric' ? 8 : order === 'ionic' ? 9 : 10);
  const mat = spec.material ?? 'marble';
  const wallMat = spec.wallMaterial ?? 'plaster_cream';
  const st = spec.stylobate ?? 0.3;
  const y0 = spec.y ?? 0;
  const closed = !!spec.closed;
  const depth = spec.depth;
  const flat = path.map((p) => V(p.x, 0, p.z));
  const prof = (pts: V2[]) => ({ pts, smooth: pts.map(() => false) });
  // Floor/stylobate.
  const front = 0.7 * D + 0.25;
  d.b.add(sweep(prof([[-depth - 0.05, y0 + st], [-depth - 0.05, y0], [front, y0], [front, y0 + st]]), flat, { closed, back: true }), spec.floorMaterial ?? 'paving_travertine', d.m);
  // Columns.
  let count = 0;
  const nSeg = closed ? path.length : path.length - 1;
  for (let i = 0; i < nSeg; i++) {
    const a = flat[i], c = flat[(i + 1) % flat.length];
    const len = a.distanceTo(c);
    const n = Math.max(1, Math.round(len / spec.spacing));
    const last = !closed && i === nSeg - 1 ? n : n - 1;
    for (let k = 0; k <= last; k++) {
      const p = a.clone().lerp(c, k / n);
      liteColumnAt(d, p.x, y0 + st, p.z, H, D, mat, order, spec.detail);
      count++;
    }
  }
  // Entablature + ceiling slab.
  const eh = Math.max(0.5, H * 0.22);
  const yE = y0 + st + H;
  const f = 0.45 * D;
  d.b.add(sweep(prof([[-depth, yE], [f, yE], [f, yE + eh * 0.62], [f + 0.28 * eh, yE + eh * 0.8], [f + 0.38 * eh, yE + eh], [-depth, yE + eh]]), flat, { closed, back: true, caps: !closed }), mat, d.m);
  const yTop = yE + eh;
  const storeys = spec.storeys ?? 1;
  // Back wall (with colliders).
  if ((spec.back ?? 'wall') === 'wall') {
    const t = 0.6;
    const rise = Math.tan((16 * Math.PI) / 180) * (depth + 0.6);
    const wallTop = yTop + rise + 0.4 + (storeys - 1) * (H + eh);
    d.b.add(sweep(prof([[-depth, y0], [-depth, wallTop], [-depth - t, wallTop], [-depth - t, y0]]), flat, { closed, back: true, caps: !closed }), wallMat, d.m);
    for (let i = 0; i < nSeg; i++) {
      const a = flat[i], c = flat[(i + 1) % flat.length];
      const dir = c.clone().sub(a);
      const len = dir.length();
      if (len < 0.01) continue;
      dir.normalize();
      const out = V(dir.z, 0, -dir.x);
      const mid = a.clone().add(c).multiplyScalar(0.5).addScaledVector(out, -depth - t / 2);
      d.at(mid.x, 0, mid.z, Math.atan2(-dir.z, dir.x)).solid(-len / 2 - t / 2, y0, -t / 2, len / 2 + t / 2, wallTop, t / 2);
    }
  }
  // Lean-to roof from the wall down over the cornice.
  const proj = 0.38 * eh + f + 0.1;
  const rise = Math.tan((16 * Math.PI) / 180) * (depth + proj);
  const roofPts: V2[] = [[proj, yTop - 0.02], [proj, yTop + 0.12], [-depth - 0.3, yTop + 0.12 + rise], [-depth - 0.3, yTop - 0.02 + rise]];
  d.b.add(sweep(prof(roofPts), flat, { closed, back: true, caps: !closed }), spec.roofMaterial ?? 'roof_tile', d.m);
  return { columns: count, height: yTop + rise - y0 };
}

// ---------------------------------------------------------------- halls and ranges

export interface HallSpec {
  /** Wall material. */
  mat: MaterialId;
  height: number;
  roof?: 'gable' | 'hip' | 'flat' | 'none';
  roofAxis?: 'x' | 'z';
  /** Doors on the front (−z) face: count. */
  doors?: number;
  doorH?: number;
  /** Rows of windows (painted dark openings) on all faces. */
  windowRows?: number;
  arched?: boolean;
  corniceMat?: MaterialId;
  detail: Detail;
  collide?: boolean;
  /** Pilaster strips every n m on the faces (brick buildings). */
  pilasters?: number;
  /** Plaster dado band (red) on stuccoed walls. */
  dado?: MaterialId;
}

/** A plain rectangular building over (x0, z0)–(x1, z1) with painted openings and a roof. Returns the roof top. */
export function hall(d: Draw, x0: number, z0: number, x1: number, z1: number, s: HallSpec): number {
  const H = s.height;
  d.span(s.mat, x0, 0, z0, x1, H, z1, { collide: s.collide ?? true });
  const w = x1 - x0, dd = z1 - z0;
  const cm = s.corniceMat ?? (s.mat === 'brick' ? 'travertine' : s.mat);
  cornice(d, x0, z0, x1, z1, H - 0.35, 0.35, 0.25, cm);
  if (s.dado) {
    d.span(s.dado, x0 - 0.03, 0, z0 - 0.03, x1 + 0.03, 1.1, z0);
  }
  // Doors on the front face.
  const nd = s.doors ?? 1;
  const dh = Math.min(s.doorH ?? 3.2, H * 0.6);
  for (let i = 0; i < nd; i++) {
    const x = x0 + ((i + 0.5) * w) / nd;
    const dw = Math.min(2.4, dh * 0.55);
    d.span('wood_dark', x - dw / 2, 0, z0 - 0.04, x + dw / 2, dh, z0 + 0.02);
    d.span(cm, x - dw / 2 - 0.25, 0, z0 - 0.12, x - dw / 2, dh + 0.25, z0);
    d.span(cm, x + dw / 2, 0, z0 - 0.12, x + dw / 2 + 0.25, dh + 0.25, z0);
    d.span(cm, x - dw / 2 - 0.35, dh, z0 - 0.15, x + dw / 2 + 0.35, dh + 0.35, z0);
  }
  // Window rows on all four faces.
  const rows = s.windowRows ?? Math.max(0, Math.floor((H - 3) / 3.5));
  const ww = 1.1, wh = s.arched ? 2.0 : 1.4;
  for (let r = 0; r < rows; r++) {
    const y = Math.max(dh + 0.8, 3) + r * ((H - 3.5) / Math.max(1, rows));
    if (y + wh > H - 0.6) break;
    const faces: [number, number, number, number, number][] = [
      [x0, x1, z0, -1, 0],
      [x0, x1, z1, 1, 0],
    ];
    for (const [a, b, z, dir] of faces) {
      const n = Math.max(1, Math.floor((b - a) / 4));
      for (let i = 0; i < n; i++) {
        const x = a + ((i + 0.5) * (b - a)) / n;
        d.span('black', x - ww / 2, y, z + dir * 0.03, x + ww / 2, y + wh, z + dir * 0.0);
      }
    }
    for (const [x, dir] of [[x0, -1], [x1, 1]] as const) {
      const n = Math.max(1, Math.floor(dd / 4));
      for (let i = 0; i < n; i++) {
        const z = z0 + ((i + 0.5) * dd) / n;
        d.span('black', x + dir * 0.03, y, z - ww / 2, x, y + wh, z + ww / 2);
      }
    }
  }
  if (s.pilasters && s.detail === 'high') {
    const n = Math.max(1, Math.round(w / s.pilasters));
    for (let i = 0; i <= n; i++) d.span(s.mat, x0 + (i * w) / n - 0.3, 0, z0 - 0.15, x0 + (i * w) / n + 0.3, H - 0.35, z0);
  }
  const roof = s.roof ?? 'gable';
  if (roof === 'none') return H;
  if (roof === 'flat') {
    d.span('concrete', x0 + 0.2, H, z0 + 0.2, x1 - 0.2, H + 0.25, z1 - 0.2);
    d.span(s.mat, x0, H, z0, x1, H + 0.9, z0 + 0.4);
    d.span(s.mat, x0, H, z1 - 0.4, x1, H + 0.9, z1);
    d.span(s.mat, x0, H, z0, x0 + 0.4, H + 0.9, z1);
    d.span(s.mat, x1 - 0.4, H, z0, x1, H + 0.9, z1);
    return H + 0.9;
  }
  const r = tiledRoof(d, roof, (x0 + x1) / 2, (z0 + z1) / 2, w, dd, H, s.detail, { axis: s.roofAxis, wallMat: s.mat });
  return r.top;
}

/** Four ranges round a courtyard (horrea, barracks, macella); the front range keeps a gate passage. */
export function courtyardRanges(d: Draw, x0: number, z0: number, x1: number, z1: number, wing: number, H: number, mat: MaterialId, detail: Detail, opts: { gate?: number; inner?: 'cells' | 'colonnade' | 'plain'; ring?: boolean; courtMat?: MaterialId } = {}) {
  const gate = opts.gate ?? 4;
  const w = x1 - x0, dd = z1 - z0;
  const cx = (x0 + x1) / 2;
  // Outer walls (front split by the gate).
  const t = 0.7;
  wallRun(d, x0, z0 + t / 2, cx - gate / 2, z0 + t / 2, 0, H, t, mat);
  wallRun(d, cx + gate / 2, z0 + t / 2, x1, z0 + t / 2, 0, H, t, mat);
  d.span(mat, cx - gate / 2, Math.min(H - 0.5, 4.6), z0, cx + gate / 2, H, z0 + wing);
  wallRun(d, x1 - t / 2, z0, x1 - t / 2, z1, 0, H, t, mat);
  wallRun(d, x1, z1 - t / 2, x0, z1 - t / 2, 0, H, t, mat);
  wallRun(d, x0 + t / 2, z1, x0 + t / 2, z0, 0, H, t, mat);
  // Inner walls of the ranges (facing the court) with cell doors.
  const ix0 = x0 + wing, ix1 = x1 - wing, iz0 = z0 + wing, iz1 = z1 - wing;
  const inner = opts.inner ?? 'cells';
  const cellW = 4;
  const innerFace = (ax: number, az: number, bx: number, bz: number) => {
    wallRun(d, ax, az, bx, bz, 0, H, 0.5, mat);
    if (inner !== 'cells') return;
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.floor(len / cellW));
    const tx = (bx - ax) / len, tz = (bz - az) / len;
    // court side is to the left of the walk (we walk the court clockwise)
    const nx = -tz, nz = tx;
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n;
      const x = ax + (bx - ax) * f + nx * 0.27, z = az + (bz - az) * f + nz * 0.27;
      d.box('black', x, 1.2, z, Math.abs(tx) * 1.6 + 0.04, 2.4, Math.abs(tz) * 1.6 + 0.04);
      if (detail === 'high') d.box('travertine', x, 2.5, z, Math.abs(tx) * 2.0 + 0.1, 0.2, Math.abs(tz) * 2.0 + 0.1);
    }
  };
  innerFace(ix0, iz0 + 0.25, ix1, iz0 + 0.25);
  innerFace(ix1 - 0.25, iz0, ix1 - 0.25, iz1);
  innerFace(ix1, iz1 - 0.25, ix0, iz1 - 0.25);
  innerFace(ix0 + 0.25, iz1, ix0 + 0.25, iz0);
  // Gate passage side walls.
  wallRun(d, cx - gate / 2 - 0.25, z0, cx - gate / 2 - 0.25, iz0, 0, H, 0.5, mat);
  wallRun(d, cx + gate / 2 + 0.25, z0, cx + gate / 2 + 0.25, iz0, 0, H, 0.5, mat);
  d.span(opts.courtMat ?? 'gravel', ix0, 0, iz0, ix1, 0.04, iz1);
  if (opts.ring ?? true) ringRoof(d, (x0 + x1) / 2, (z0 + z1) / 2, w, dd, ix1 - ix0, iz1 - iz0, H, detail);
  else {
    // flat terrace roofs on the ranges
    for (const [a, b, c, e] of [[x0, z0, x1, iz0], [x0, iz1, x1, z1], [x0, iz0, ix0, iz1], [ix1, iz0, x1, iz1]]) d.span('concrete', a, H - 0.2, b, c, H + 0.1, e);
  }
}

/** A row of tabernae along x in a wall frame facing −z at z: piers, wide openings with shutters, mezzanine windows. */
export function tabernae(d: Draw, x0: number, x1: number, z: number, depth: number, H: number, mat: MaterialId, detail: Detail, rng?: { next(): number }) {
  const n = Math.max(1, Math.floor((x1 - x0) / 4.2));
  const w = (x1 - x0) / n;
  d.span(mat, x0, 2.9, z, x1, H, z + depth, { collide: true });
  for (let i = 0; i <= n; i++) {
    const x = x0 + i * w;
    d.span(mat, x - 0.35, 0, z, x + 0.35, 2.9, z + depth, { collide: true });
  }
  for (let i = 0; i < n; i++) {
    const cx = x0 + (i + 0.5) * w;
    d.span('black', cx - w / 2 + 0.36, 0, z + 0.6, cx + w / 2 - 0.36, 2.9, z + depth - 0.2);
    d.span('travertine', cx - w / 2 + 0.35, 0, z - 0.05, cx + w / 2 - 0.35, 0.12, z + 0.6);
    d.span('travertine', cx - w / 2 + 0.3, 2.75, z - 0.1, cx + w / 2 - 0.3, 2.95, z + 0.3);
    if (detail === 'high') {
      const r = rng ? rng.next() : 0.5;
      if (r < 0.35) d.span('wood', cx - w / 2 + 0.4, 0.12, z + 0.25, cx + w / 2 - 0.4, 2.75, z + 0.32); // closed shutters
      else if (r < 0.6) d.span('wood', cx - w / 2 + 0.4, 0.12, z + 0.25, cx - 0.2, 2.75, z + 0.32);
      d.span('black', cx - 0.5, 3.4, z - 0.02, cx + 0.5, 4.2, z + 0.02);
    }
  }
}

/** Long barrel-vaulted brick hall (warehouse aisles, cells): a half-cylinder on low walls, along z. */
export function vaultedAisle(d: Draw, cx: number, z0: number, z1: number, span: number, springH: number, mat: MaterialId, detail: Detail) {
  const r = span / 2;
  const L = z1 - z0;
  const seg = detail === 'high' ? 10 : 6;
  const g = new THREE.CylinderGeometry(r + 0.4, r + 0.4, L, seg * 2, 1, true, -Math.PI / 2, Math.PI);
  g.rotateX(Math.PI / 2);
  g.translate(cx, springH, (z0 + z1) / 2);
  d.b.add(g, mat, d.m);
  const ceil = new THREE.CylinderGeometry(r, r, L, seg * 2, 1, true, Math.PI / 2, Math.PI);
  ceil.rotateX(Math.PI / 2);
  ceil.rotateY(Math.PI);
  ceil.translate(cx, springH, (z0 + z1) / 2);
  d.b.add(ceil, 'plaster_white', d.m, { castShadow: false });
}

export { ringRoof };
