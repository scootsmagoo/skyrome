/**
 * A Roman civil basilica after the Basilica Ulpia (dedicated AD 112 in Trajan's Forum): a nave
 * surrounded on all four sides by colonnades, aisles with an upper gallery, a second order of
 * columns above, a clerestory with windows under a timber gable roof with a coffered ceiling,
 * lean-to aisle roofs, outer walls with doors and windows, and apses at the short ends.
 *
 * Local frame: hall centred on the origin, long axis along x, the main facade (doors) faces −z.
 */
import * as THREE from 'three';
import type { MeshBuilder } from '../../gfx/MeshBuilder';
import type { MaterialId } from '../../gfx/materialIds';
import { UV_METERS } from '../../gfx/textures/catalog';
import { T, TRS, makeGeometry, mul } from '../common/geom';
import { wall, type Opening } from '../common/walls';
import { column } from './column';
import { entablature } from './entablature';
import { columnDims, diameterForHeight, type Detail, type Order } from './orders';
import { apse } from './vaults';

export interface BasilicaSpec {
  /** Interior length of the hall (between the short walls). */
  length: number;
  naveWidth: number;
  aisleWidth: number;
  order?: Order;
  /** Ground-floor column height. */
  columnHeight?: number;
  /** Target axial spacing of the colonnades. */
  spacing?: number;
  apses?: 'none' | 'both';
  wallMaterial?: MaterialId;
  columnMaterial?: MaterialId;
  floorMaterial?: MaterialId;
  roofMaterial?: MaterialId;
  /** Doors in the front wall (default 3). */
  doors?: number;
  detail?: Detail;
  /** Detail of the upper (gallery) order, high up and seen from afar (default 'low'). */
  upperDetail?: Detail;
}

export interface BasilicaResult {
  width: number;
  depth: number;
  height: number;
}

/** A tiled roof plane between four corners (u along a→b, v along a→d), facing `n`. */
function roofQuad(b: MeshBuilder, a: THREE.Vector3, bb: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, mat: MaterialId, m: THREE.Matrix4) {
  const L = a.distanceTo(bb) / UV_METERS;
  const S = a.distanceTo(d) / UV_METERS;
  const n = new THREE.Vector3().subVectors(bb, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const pts: [THREE.Vector3, number, number][] = [
    [a, 0, 0],
    [d, 0, S],
    [c, L, S],
    [a, 0, 0],
    [c, L, S],
    [bb, L, 0],
  ];
  // Wind so the face normal is (b − a) × (d − a): A, B, C / A, C, D in that orientation.
  const order = [0, 5, 4, 0, 4, 1];
  for (const k of order) {
    const [p, u, v] = pts[k];
    pos.push(p.x, p.y, p.z);
    nor.push(n.x, n.y, n.z);
    uv.push(u, v);
  }
  b.add(makeGeometry(pos, nor, uv), mat, m, { uv: 'keep' });
}

export function basilica(b: MeshBuilder, spec: BasilicaSpec, at?: THREE.Matrix4): BasilicaResult {
  const m = at ?? new THREE.Matrix4();
  const detail = spec.detail ?? 'high';
  const order = spec.order ?? 'corinthian';
  const L = spec.length;
  const Wn = spec.naveWidth;
  const Wa = spec.aisleWidth;
  const H1 = spec.columnHeight ?? 7.5;
  const D1 = diameterForHeight(order, H1);
  const H2 = H1 * 0.75;
  const D2 = diameterForHeight(order, H2);
  const wallMat = spec.wallMaterial ?? 'brick';
  const colMat = spec.columnMaterial ?? 'marble_veined';
  const t = 1.0; // outer wall thickness
  const hx = L / 2; // interior half length
  const hz = Wn / 2 + Wa; // interior half width
  // Inner colonnade rectangle round the nave (aisles run round all four sides).
  const cx = hx - Wa;
  const cz = Wn / 2;
  const sp = spec.spacing ?? 4.2 * D1;
  const e1 = columnDims(order, D1, H1);
  const ent1H = H1 * 0.235;
  const yGal = H1 + ent1H; // gallery floor
  const ent2H = H2 * 0.235;
  const yUp = yGal + H2 + ent2H; // top of the upper order
  const clereH = 3.6;
  const yNave = yUp + clereH; // nave eaves
  const aislePitch = (16 * Math.PI) / 180;
  const yOuter = yUp - Wa * Math.tan(aislePitch); // outer wall top (aisle eaves)
  const rect = (x: number, z: number, y: number) => [new THREE.Vector3(-x, y, -z), new THREE.Vector3(x, y, -z), new THREE.Vector3(x, y, z), new THREE.Vector3(-x, y, z)];

  // Floor.
  b.box(spec.floorMaterial ?? 'marble_veined', 2 * hx + 2 * t, 0.2, 2 * hz + 2 * t, mul(m, T(0, 0.1 - 0.18, 0)), { castShadow: false });
  b.box('paving_travertine', 2 * cx, 0.04, 2 * cz, mul(m, T(0, 0.04, 0)), { castShadow: false });

  // Colonnades: ground order and the gallery order above, on the same rectangle.
  const placeRing = (y: number, H: number, D: number, collide: boolean, det: Detail) => {
    const sides: [THREE.Vector3, THREE.Vector3][] = [
      [new THREE.Vector3(-cx, 0, -cz), new THREE.Vector3(cx, 0, -cz)],
      [new THREE.Vector3(cx, 0, -cz), new THREE.Vector3(cx, 0, cz)],
      [new THREE.Vector3(cx, 0, cz), new THREE.Vector3(-cx, 0, cz)],
      [new THREE.Vector3(-cx, 0, cz), new THREE.Vector3(-cx, 0, -cz)],
    ];
    for (const [a, c] of sides) {
      const len = a.distanceTo(c);
      const n = Math.max(1, Math.round(len / sp));
      for (let k = 0; k < n; k++) {
        const p = a.clone().lerp(c, k / n);
        column(b, { order, D, height: H, fluted: false, material: colMat, trimMaterial: 'marble', detail: det, collide }, mul(m, T(p.x, y, p.z)));
      }
    }
  };
  placeRing(0, H1, D1, true, detail);
  const d1 = e1.d;
  entablature(b, rect(cx + d1 / 2, cz + d1 / 2, H1), { order, columnHeight: H1, D: D1, material: 'marble', detail, depth: d1 + 0.3, sima: false }, { closed: true, at: m });
  placeRing(yGal, H2, D2, false, spec.upperDetail ?? (detail === 'far' ? 'far' : 'low'));
  const d2 = columnDims(order, D2, H2).d;
  entablature(b, rect(cx + d2 / 2, cz + d2 / 2, yGal + H2), { order, columnHeight: H2, D: D2, material: 'marble', detail, depth: d2 + 0.3, sima: false }, { closed: true, at: m });

  // Gallery floor over the aisles (a frame between the outer walls and the colonnade).
  const slab = 0.35;
  const yS = yGal - 0.02;
  const ring = [
    [-hx, hx, -hz, -cz - d1 / 2],
    [-hx, hx, cz + d1 / 2, hz],
    [-hx, -cx - d1 / 2, -cz - d1 / 2, cz + d1 / 2],
    [cx + d1 / 2, hx, -cz - d1 / 2, cz + d1 / 2],
  ];
  for (const [x0, x1, z0, z1] of ring) {
    b.box('wood_dark', x1 - x0, slab, z1 - z0, mul(m, T((x0 + x1) / 2, yS - slab / 2, (z0 + z1) / 2)), { castShadow: false });
    b.box('mosaic', x1 - x0, 0.03, z1 - z0, mul(m, T((x0 + x1) / 2, yS + 0.015, (z0 + z1) / 2)), { castShadow: false });
  }

  // Clerestory: walls on the colonnade rectangle from the upper entablature to the nave eaves,
  // pierced by round-headed windows.
  const win = (len: number): Opening[] => {
    const n = Math.max(1, Math.floor(len / 4.2));
    return Array.from({ length: n }, (_, i) => ({ kind: 'window' as const, x: ((i + 0.5) * len) / n, width: 1.5, height: clereH * 0.62, sill: clereH * 0.18, arched: true, frame: false }));
  };
  const ct = 0.6;
  const clere = (len: number, mm: THREE.Matrix4) => wall(b, { length: len, height: clereH, thickness: ct, material: wallMat, openings: win(len), detail, collide: false }, mm);
  // the long walls run past the corners by half a thickness so the corners close
  clere(2 * cx + ct, mul(m, T(-cx - ct / 2, yUp, -cz)));
  clere(2 * cx + ct, mul(m, TRS(cx + ct / 2, yUp, cz, 0, Math.PI, 0)));
  clere(2 * cz, mul(m, TRS(cx, yUp, -cz, 0, -Math.PI / 2, 0)));
  clere(2 * cz, mul(m, TRS(-cx, yUp, cz, 0, Math.PI / 2, 0)));

  // Outer walls with doors (front), windows on both levels.
  const openingsFront = (): Opening[] => {
    const nd = spec.doors ?? 3;
    const len = 2 * hx + 2 * t;
    const o: Opening[] = [];
    for (let i = 0; i < nd; i++) o.push({ kind: 'door', x: (len * (i + 1)) / (nd + 1), width: 3.2, height: 5.6, leaves: 'open', leafMaterial: 'bronze' });
    const nw = Math.floor(len / 6);
    for (let i = 0; i < nw; i++) o.push({ kind: 'window', x: (len * (i + 0.5)) / nw, width: 1.6, height: 2.8, sill: yGal + 1.0, arched: true });
    return o;
  };
  const windowsOnly = (len: number): Opening[] => {
    const nw = Math.max(1, Math.floor(len / 6));
    const o: Opening[] = [];
    for (let i = 0; i < nw; i++) {
      o.push({ kind: 'window', x: (len * (i + 0.5)) / nw, width: 1.4, height: 2.6, sill: 2.6, arched: true });
      o.push({ kind: 'window', x: (len * (i + 0.5)) / nw, width: 1.6, height: 2.8, sill: yGal + 1.0, arched: true });
    }
    return o;
  };
  const W = { height: yOuter, thickness: t, material: wallMat, detail, courses: 0 } as const;
  wall(b, { ...W, length: 2 * hx + 2 * t, openings: openingsFront() }, mul(m, T(-hx - t, 0, -hz - t / 2)));
  wall(b, { ...W, length: 2 * hx + 2 * t, openings: windowsOnly(2 * hx + 2 * t) }, mul(m, TRS(hx + t, 0, hz + t / 2, 0, Math.PI, 0)));
  const apseR = Math.min(Wn / 2, 8);
  const endOpenings = (): Opening[] => (spec.apses === 'both' ? [{ kind: 'arch', x: hz, width: 2 * apseR - 0.4, height: Math.min(yOuter - 1, apseR + H1 * 0.9), frame: false }] : windowsOnly(2 * hz));
  wall(b, { ...W, length: 2 * hz, openings: endOpenings() }, mul(m, TRS(hx + t / 2, 0, -hz, 0, -Math.PI / 2, 0)));
  wall(b, { ...W, length: 2 * hz, openings: endOpenings() }, mul(m, TRS(-hx - t / 2, 0, hz, 0, Math.PI / 2, 0)));
  // Cornice on the outer walls.
  entablature(b, rect(hx + t, hz + t, yOuter - 1.0), { order: 'tuscan', columnHeight: 4, D: 0.6, material: 'travertine', detail, depth: t, dims: { architrave: 0.3, frieze: 0.3, cornice: 0.45 } }, { closed: true, at: m });
  if (spec.apses === 'both') {
    for (const sx of [-1, 1]) {
      apse(b, { radius: apseR, height: apseR * 0.4 + H1 * 0.9, thickness: t, material: wallMat, domeMaterial: 'plaster_white', niches: 3, detail }, mul(m, TRS(sx * (hx + t), 0, 0, 0, sx > 0 ? Math.PI / 2 : -Math.PI / 2, 0)));
    }
  }

  // Ceilings and roofs.
  const roofMat = spec.roofMaterial ?? 'roof_tile';
  // Nave: coffered flat ceiling at the eaves, gable roof above (ridge along x).
  b.box('wood_dark', 2 * cx + 0.6, 0.3, 2 * cz + 0.6, mul(m, T(0, yNave + 0.15, 0)), { castShadow: false });
  const rise = (cz + 1.2) * Math.tan((14 * Math.PI) / 180);
  for (const sz of [-1, 1]) {
    const e = sz * (cz + 1.2);
    const a = new THREE.Vector3(-cx - 1.2, yNave + 0.3 + rise, 0);
    const bb = new THREE.Vector3(cx + 1.2, yNave + 0.3 + rise, 0);
    const c = new THREE.Vector3(cx + 1.2, yNave + 0.3, e);
    const d = new THREE.Vector3(-cx - 1.2, yNave + 0.3, e);
    if (sz > 0) roofQuad(b, bb, a, d, c, roofMat, m);
    else roofQuad(b, a, bb, c, d, roofMat, m);
  }
  // Gable ends of the nave roof (triangles in the end walls).
  for (const sx of [-1, 1]) {
    const tri = new THREE.BufferGeometry();
    const x = sx * (cx + 0.3);
    const p = [x, yNave + 0.3, -(cz + 1.2), x, yNave + 0.3 + rise, 0, x, yNave + 0.3, cz + 1.2];
    if (sx < 0) p.splice(0, 9, x, yNave + 0.3, cz + 1.2, x, yNave + 0.3 + rise, 0, x, yNave + 0.3, -(cz + 1.2));
    tri.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    tri.computeVertexNormals();
    b.add(tri, wallMat, m);
  }
  // Aisles: lean-to roofs from the clerestory foot down to the outer walls (four sides).
  const yHi = yUp + 0.2;
  const yLo = yOuter + 0.1;
  const o = t + 0.5;
  // (ridgeB − ridgeA) × (eaveA − ridgeA) must point up and outward.
  roofQuad(b, new THREE.Vector3(-cx, yHi, -cz), new THREE.Vector3(cx, yHi, -cz), new THREE.Vector3(hx + o, yLo, -hz - o), new THREE.Vector3(-hx - o, yLo, -hz - o), roofMat, m);
  roofQuad(b, new THREE.Vector3(cx, yHi, cz), new THREE.Vector3(-cx, yHi, cz), new THREE.Vector3(-hx - o, yLo, hz + o), new THREE.Vector3(hx + o, yLo, hz + o), roofMat, m);
  roofQuad(b, new THREE.Vector3(cx, yHi, -cz), new THREE.Vector3(cx, yHi, cz), new THREE.Vector3(hx + o, yLo, hz + o), new THREE.Vector3(hx + o, yLo, -hz - o), roofMat, m);
  roofQuad(b, new THREE.Vector3(-cx, yHi, cz), new THREE.Vector3(-cx, yHi, -cz), new THREE.Vector3(-hx - o, yLo, -hz - o), new THREE.Vector3(-hx - o, yLo, hz + o), roofMat, m);
  // Aisle ceilings (under the lean-to roofs, over the gallery).
  for (const [x0, x1, z0, z1] of ring) b.box('wood_dark', x1 - x0, 0.2, z1 - z0, mul(m, T((x0 + x1) / 2, yOuter - 0.1, (z0 + z1) / 2)), { castShadow: false });
  return { width: 2 * hx + 2 * t, depth: 2 * hz + 2 * t, height: yNave + 0.3 + rise };
}
