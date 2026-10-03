/**
 * `capTemple()`: the kit's Roman temple (src/arch/classical/temple.ts) extended for the hero
 * temples of the Capitoline and the Imperial Fora:
 *
 *  - an enterable cella: bronze doors standing open, wall colliders instead of a solid block, an
 *    opus sectile floor, coloured marble dado, coffered ceiling, an apse with cult statues
 *    (`furnish` callback), interior colonnades;
 *  - a triple cella (Jupiter Optimus Maximus: Juno, Jupiter, Minerva side by side, three doors);
 *  - extra porch rows (the deep Tuscan-plan porch of the Capitolium);
 *  - a gilded-bronze roof with gilded antefixes, a quadriga on the apex, statues at the corners;
 *  - a relief frieze (Trajanic cupids, Arachne…) and a painted tympanum;
 *  - festoons hung between the columns (the rededication of 12 May 113);
 *  - per-column level of detail (the front row high, the rest low) to keep heroes ≲150k tris.
 *
 * Local frame as the kit: facade (stairs) towards −z, origin on the ground at the stylobate
 * centre. Geometry is in GAME metres (callers scale real dimensions by S themselves).
 */
import * as THREE from 'three';
import { column } from '../../../../arch/classical/column';
import { acroterion, entablature, pediment } from '../../../../arch/classical/entablature';
import { podium } from '../../../../arch/classical/podium';
import { apse } from '../../../../arch/classical/vaults';
import { quadriga, togate, armoredEmperor } from '../../../../arch/classical/statues';
import { templeLayout, type TempleLayout, type TempleSpec } from '../../../../arch/classical/temple';
import { T, TRS, makeGeometry, mul, type V2 } from '../../../../arch/common/geom';
import { stairs } from '../../../../arch/common/stairs';
import { wall, type Opening } from '../../../../arch/common/walls';
import type { MeshBuilder } from '../../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../../gfx/materialIds';
import { UV_METERS } from '../../../../gfx/textures/catalog';
import { coffers, festoon, friezeStrip, sectileFloor, span, solid } from './ornament';

export interface TempleInterior {
  /** Cella interior rectangle (inside the walls), its floor y and the wall height. */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y: number;
  wallH: number;
  /** Interior bays for a triple cella (left → right, seen from inside facing +z). */
  cells: { x0: number; x1: number }[];
  at: THREE.Matrix4;
  detail: 'high' | 'low';
}

export interface CapTempleSpec extends TempleSpec {
  /** 1 (default) or 3 cellae side by side (Capitoline triad). Central share of the width for 3. */
  cellae?: 1 | 3;
  centralShare?: number;
  /** Hollow, enterable cella with open doors. */
  interior?: boolean;
  /** Extra rows of porch columns behind the front row (inner columns, not just the flanks). */
  porchRows?: number;
  /** Which columns get high detail: 'front' = the front row only (default for high detail). */
  hiColumns?: 'all' | 'front';
  /** Podium grown beyond the stylobate by this margin on the sides and back (archaic platforms). */
  podiumMargin?: number;
  /** Relief material for the frieze on the front and flanks, and its tile length (m). */
  frieze?: THREE.Material;
  friezeTile?: number;
  tympanum?: MaterialId | THREE.Material;
  antefix?: MaterialId;
  festoons?: boolean;
  /** Crown of the pediment: kit palmettes (default) or a gilded quadriga. */
  apex?: 'palmette' | 'quadriga';
  /** Gilded statues on the corners of the pediment instead of palmettes. */
  cornerStatues?: boolean;
  floor?: MaterialId;
  /** Apse in the back of the cella (radius as a share of the cella width). */
  apse?: number;
  /** Free columns along the inside of the long walls (count per side). */
  innerColumns?: number;
  furnish?: (b: MeshBuilder, info: TempleInterior) => void;
}

export interface CapTempleResult {
  layout: TempleLayout;
  /** Door centres on the outer face of the front wall (local, y = podium top). */
  doors: THREE.Vector3[];
  /** Top of the stairs, centre (podium top at the front edge). */
  stairTop: THREE.Vector3;
  /** Front foot of the stairs, centre (ground). */
  stairFoot: THREE.Vector3;
  interior?: TempleInterior;
  /** Pediment apex height (y). */
  apexY: number;
}

/** Tiled (or gilded) gable roof along z, as the kit's, with the antefix material exposed. */
function roof(b: MeshBuilder, x0: number, x1: number, z0: number, z1: number, yEave: number, pitch: number, mat: MaterialId, antefix: MaterialId, detail: 'high' | 'low', m: THREE.Matrix4) {
  const halfW = (x1 - x0) / 2;
  const rise = halfW * Math.tan(pitch);
  const thick = 0.18;
  const slopeLen = halfW / Math.cos(pitch);
  const xr = (x0 + x1) / 2;
  for (const side of [-1, 1]) {
    const xe = side < 0 ? x0 : x1;
    const pos: number[] = [];
    const nor: number[] = [];
    const uv: number[] = [];
    const n = new THREE.Vector3(side * Math.sin(pitch), Math.cos(pitch), 0);
    const top = (x: number, z: number) => [x, yEave + rise * (1 - Math.abs(x - xr) / halfW), z];
    const A = top(xr, z0);
    const B = top(xr, z1);
    const C = top(xe, z1);
    const D = top(xe, z0);
    const L = (z1 - z0) / UV_METERS;
    const Sv = slopeLen / UV_METERS;
    const quad = (pts: number[][], uvs: number[][]) => {
      for (const k of [0, 1, 2, 0, 2, 3]) {
        pos.push(pts[k][0], pts[k][1], pts[k][2]);
        nor.push(n.x, n.y, n.z);
        uv.push(uvs[k][0], uvs[k][1]);
      }
    };
    if (side > 0) quad([A, B, C, D], [[0, 0], [L, 0], [L, Sv], [0, Sv]]);
    else quad([A, D, C, B], [[0, 0], [0, Sv], [L, Sv], [L, 0]]);
    b.add(makeGeometry(pos, nor, uv), mat, m, { uv: 'keep' });
    const slab = new THREE.BoxGeometry(slopeLen, thick, z1 - z0);
    slab.rotateZ(side * -pitch);
    slab.translate((xr + xe) / 2 - side * Math.sin(pitch) * thick * 0.5, yEave + rise / 2 - (thick / 2) * Math.cos(pitch) - 0.005, (z0 + z1) / 2);
    b.add(slab, 'wood_dark', m, { castShadow: false });
    if (detail === 'high') {
      const step = 0.48 * Math.max(1, (z1 - z0) / 40);
      const nRidge = Math.floor((z1 - z0) / step);
      const ridge = new THREE.CylinderGeometry(0.07, 0.07, slopeLen, 4, 1, true);
      ridge.rotateZ(Math.PI / 2);
      ridge.rotateZ(side * -pitch);
      const ante = new THREE.CircleGeometry(0.14, 6, 0, Math.PI);
      ante.rotateY((side * Math.PI) / 2);
      for (let k = 0; k < nRidge; k++) {
        const z = z0 + (k + 0.5) * ((z1 - z0) / nRidge);
        b.add(ridge.clone().translate((xr + xe) / 2, yEave + rise / 2 + 0.01, z), mat, m, { uv: 'box' });
        b.add(ante.clone().translate(xe + side * 0.01, yEave + 0.02, z), antefix, m);
      }
    }
  }
  const cap = new THREE.CylinderGeometry(0.16, 0.16, z1 - z0, 6);
  cap.rotateX(Math.PI / 2);
  cap.translate(xr, yEave + rise + 0.06, (z0 + z1) / 2);
  b.add(cap, mat, m);
}

export function capTemple(b: MeshBuilder, spec: CapTempleSpec, at?: THREE.Matrix4): CapTempleResult {
  const L = templeLayout(spec);
  const m = at ?? new THREE.Matrix4();
  const detail = spec.detail ?? 'high';
  const mat = spec.material ?? 'marble';
  const podMat = spec.podiumMaterial ?? 'travertine';
  const cellaMat = spec.cellaMaterial ?? mat;
  const P = L.podiumHeight;
  const pitchDeg = spec.pitchDeg ?? 14;
  const pitch = (pitchDeg * Math.PI) / 180;
  const { stylobate: s0, stairs: st } = L;
  const pm = spec.podiumMargin ?? 0;
  const s = { x0: s0.x0 - pm, x1: s0.x1 + pm, z0: s0.z0, z1: s0.z1 + pm };

  // ---- podium and stairs
  const outline: V2[] =
    L.stairMode === 'front'
      ? [
          [s.x0, s.z0],
          [st.x0, s.z0],
          [st.x0, st.z0],
          [st.x1, st.z0],
          [st.x1, s.z0],
          [s.x1, s.z0],
          [s.x1, s.z1],
          [s.x0, s.z1],
        ]
      : [
          [s.x0, L.podiumFront],
          [s.x1, L.podiumFront],
          [s.x1, s.z1],
          [s.x0, s.z1],
        ];
  // Front-stair podium: the wings project forward beside the flight (kit layout), the body
  // behind. Our outline keeps the wings by using the stair rectangle as a notch.
  const front: V2[] =
    L.stairMode === 'front'
      ? [
          [s.x0, st.z0],
          [st.x0, st.z0],
          [st.x0, s.z0],
          [st.x1, s.z0],
          [st.x1, st.z0],
          [s.x1, st.z0],
          [s.x1, s.z1],
          [s.x0, s.z1],
        ]
      : outline;
  const cols: [number, number, number, number][] =
    L.stairMode === 'front'
      ? [
          [s.x0, s.z0, s.x1, s.z1],
          [s.x0, st.z0, st.x0, s.z0],
          [st.x1, st.z0, s.x1, s.z0],
        ]
      : [[s.x0, L.podiumFront, s.x1, s.z1]];
  podium(b, { outline: front, height: P, material: podMat, topMaterial: 'paving_travertine', detail, colliders: cols }, m);
  for (const f of L.flights) stairs(b, { width: f.x1 - f.x0, rise: f.rise, run: f.run, count: f.count, material: podMat }, mul(m, T((f.x0 + f.x1) / 2, 0, f.z0)));

  // ---- columns (the kit's grid, plus inner porch rows)
  const hiFront = (spec.hiColumns ?? 'front') === 'front';
  const zFront = -L.spanZ / 2;
  const colSpec = { order: L.order, D: L.D, height: L.H, fluted: spec.fluted ?? true, material: mat };
  const placeCol = (x: number, z: number, kind: 'free' | 'engaged', rotY: number) => {
    const d = detail === 'high' && (!hiFront || Math.abs(z - zFront) < 1e-3) ? 'high' : 'low';
    column(b, { ...colSpec, kind, detail: d }, mul(m, TRS(x, P, z, 0, rotY, 0)));
  };
  for (const c of L.columns) placeCol(c.x, c.z, c.kind, c.rotY);
  const rows = spec.porchRows ?? 0;
  for (let j = 1; j <= rows; j++)
    for (let i = 1; i < L.front - 1; i++) placeCol(-L.spanX / 2 + i * L.axial, zFront + j * L.axial, 'free', 0);

  // ---- cella
  const cl = L.cella;
  const e = L.entablature;
  const wallH = L.H + e.height * 0.55;
  const t = cl.wall;
  // Pull the cella front back behind the extra porch rows.
  const cz0 = rows > 0 ? Math.max(cl.z0, zFront + (rows + 0.6) * L.axial) : cl.z0;
  const cw = cl.x1 - cl.x0;
  const cd = cl.z1 - cz0;
  const nCells = spec.cellae ?? 1;
  const share = spec.centralShare ?? 0.4;
  const cellXs: { x0: number; x1: number }[] = [];
  if (nCells === 3) {
    const inner = cw - 2 * t;
    const wc = inner * share;
    const ws = (inner - wc - 2 * t) / 2;
    let x = cl.x0 + t;
    for (const w of [ws, wc, ws]) {
      cellXs.push({ x0: x, x1: x + w });
      x += w + t;
    }
  } else cellXs.push({ x0: cl.x0 + t, x1: cl.x1 - t });
  const interior = !!spec.interior;
  const course = Math.max(0.45, L.D * 0.5);
  const wallOpts = { height: wallH, thickness: t, material: cellaMat, courses: course, detail, collide: interior } as const;
  const doorMat = spec.doorMaterial ?? 'bronze';
  const openings: Opening[] = cellXs.map((c) => {
    const w = c.x1 - c.x0;
    const doorW = Math.min(w * (nCells === 3 ? 0.5 : 0.42), L.H * 0.36);
    const doorH = Math.min(L.H * 0.72, doorW * 2.1);
    return { kind: 'door', x: (c.x0 + c.x1) / 2 - cl.x0, width: Math.max(2.2, doorW), height: Math.max(3, doorH), leafMaterial: doorMat, leaves: interior ? 'open' : 'closed' };
  });
  wall(b, { ...wallOpts, length: cw, openings }, mul(m, T(cl.x0, P, cz0 + t / 2)));
  wall(b, { ...wallOpts, length: cw }, mul(m, TRS(cl.x1, P, cl.z1 - t / 2, 0, Math.PI, 0)));
  wall(b, { ...wallOpts, length: cd - 2 * t + 0.002 }, mul(m, TRS(cl.x1 - t / 2, P, cz0 + t - 0.001, 0, -Math.PI / 2, 0)));
  wall(b, { ...wallOpts, length: cd - 2 * t + 0.002 }, mul(m, TRS(cl.x0 + t / 2, P, cl.z1 - t + 0.001, 0, Math.PI / 2, 0)));
  if (nCells === 3) {
    for (let k = 0; k < 2; k++) {
      const x = cellXs[k].x1 + t / 2;
      wall(b, { ...wallOpts, length: cd - 2 * t + 0.002 }, mul(m, TRS(x, P, cl.z1 - t + 0.001, 0, Math.PI / 2, 0)));
    }
  }
  if (!interior) solid(b, (cl.x0 + cl.x1) / 2, P + wallH / 2, (cz0 + cl.z1) / 2, cw, wallH, cd, m);
  if (L.plan === 'sine_postico') wall(b, { ...wallOpts, length: e.x1 - e.x0, collide: true }, mul(m, TRS(e.x1, P, L.spanZ / 2, 0, Math.PI, 0)));

  // ---- entablature, ceiling, frieze
  const yE = P + L.H;
  const path = [new THREE.Vector3(e.x0, yE, e.z0), new THREE.Vector3(e.x1, yE, e.z0), new THREE.Vector3(e.x1, yE, e.z1), new THREE.Vector3(e.x0, yE, e.z1)];
  const ent = entablature(b, path, { order: L.order, columnHeight: L.H, D: L.D, material: mat, detail, axial: L.axial }, { closed: true, at: m });
  const yc = yE + ent.dims.architrave + ent.dims.frieze;
  {
    const ceil = new THREE.BoxGeometry(e.x1 - e.x0 - 0.2, 0.25, e.z1 - e.z0 - 0.2);
    ceil.translate(0, yc - 0.125 + 0.02, (e.z0 + e.z1) / 2);
    b.add(ceil, 'marble', m, { castShadow: false });
    const fill = new THREE.BoxGeometry(cw, yc - (P + wallH) + 0.02, cd);
    fill.translate((cl.x0 + cl.x1) / 2, (P + wallH + yc) / 2, (cz0 + cl.z1) / 2);
    b.add(fill, cellaMat, m);
  }
  if (spec.frieze) {
    const tile = spec.friezeTile ?? ent.dims.frieze * 8;
    const off = ent.friezeX + 0.012;
    const y0 = yE + ent.dims.architrave + ent.dims.frieze * 0.04;
    const fh = ent.dims.frieze * 0.92;
    // front (faces −z)
    friezeStrip(b, spec.frieze, e.x0 - off, e.x1 + off, y0, fh, tile, mul(m, T(0, 0, e.z0 - off)));
    // flanks: east (+x) faces +x, west (−x) faces −x
    const len = e.z1 - e.z0 + 2 * off;
    friezeStrip(b, spec.frieze, -len / 2, len / 2, y0, fh, tile, mul(m, TRS(e.x1 + off, 0, (e.z0 + e.z1) / 2, 0, -Math.PI / 2, 0)));
    friezeStrip(b, spec.frieze, -len / 2, len / 2, y0, fh, tile, mul(m, TRS(e.x0 - off, 0, (e.z0 + e.z1) / 2, 0, Math.PI / 2, 0)));
  }

  // ---- pediments and roof
  const yTop = yE + ent.dims.total;
  const spanW = e.x1 - e.x0;
  const ped = { order: L.order, span: spanW, cornice: ent.dims.cornice, depth: 0.9 * L.D, friezeX: ent.friezeX, pitchDeg, material: mat, detail, D: L.D, tympanumMaterial: spec.tympanum };
  const pf = pediment(b, { ...ped, relief: spec.pedimentRelief ?? detail === 'high' }, mul(m, T(0, yTop, e.z0)));
  pediment(b, ped, mul(m, TRS(0, yTop, e.z1, 0, Math.PI, 0)));
  const roofMat = spec.roofMaterial ?? 'roof_tile';
  const over = ent.projection + 0.1;
  roof(b, e.x0 - over, e.x1 + over, e.z0 + 0.4 * L.D, e.z1 - 0.4 * L.D, yTop - 0.05, pitch, roofMat, spec.antefix ?? (roofMat === 'gilded_bronze' ? 'gilded_bronze' : 'terracotta'), detail, m);
  const apexY = yTop + pf.apex;
  {
    const size = L.D * 1.1;
    const acMat: MaterialId = roofMat === 'gilded_bronze' ? 'gilded_bronze' : mat;
    for (const z of [e.z0, e.z1]) {
      const zz = z + (z < 0 ? -ent.friezeX : ent.friezeX);
      const rot = z < 0 ? 0 : Math.PI;
      if (spec.apex === 'quadriga' && z < 0) {
        const sc = Math.max(0.8, (pf.apex * 1.05) / 2.6);
        quadriga(b, mul(m, TRS(0, yTop + pf.apex - 0.15, zz + 0.6 * sc, 0, rot, 0)), { scale: sc, detail: detail === 'high' ? 'low' : 'low', plinth: true });
      } else if ((spec.acroteria ?? 'palmette') === 'palmette') acroterion(b, size * 1.25, acMat, mul(m, TRS(0, yTop + pf.apex - 0.1, zz, 0, rot, 0)), detail);
      for (const x of [e.x0 + 0.3, e.x1 - 0.3]) {
        if (spec.cornerStatues && z < 0) {
          const sc = Math.max(0.9, pf.apex / 3.2);
          const fn = x < 0 ? armoredEmperor : togate;
          fn(b, mul(m, TRS(x * 0.97, yTop + 0.05, zz, 0, rot, 0)), { material: 'gilded_bronze', scale: sc, detail: 'low' });
        } else if ((spec.acroteria ?? 'palmette') === 'palmette') acroterion(b, size, acMat, mul(m, TRS(x, yTop + 0.05, zz, 0, rot, 0)), detail);
      }
    }
  }

  // ---- festoons between the column capitals
  if (spec.festoons) {
    const yF = yE - 0.05;
    const front = L.columns.filter((c) => Math.abs(c.z - zFront) < 1e-3).sort((a, c) => a.x - c.x);
    const zf = zFront - L.D * 0.55;
    for (let i = 0; i < front.length - 1; i++) {
      festoon(b, new THREE.Vector3(front[i].x, yF, zf), new THREE.Vector3(front[i + 1].x, yF, zf), { sag: L.axial * 0.24, r: L.D * 0.11, detail, ribbons: true }, );
    }
    for (const sx of [-1, 1]) {
      const flank = L.columns.filter((c) => Math.abs(c.x - (sx * L.spanX) / 2) < 1e-3 && c.kind === 'free').sort((a, c) => a.z - c.z);
      const xf = (sx * L.spanX) / 2 + sx * L.D * 0.55;
      for (let i = 0; i < flank.length - 1; i++) festoon(b, new THREE.Vector3(xf, yF, flank[i].z), new THREE.Vector3(xf, yF, flank[i + 1].z), { sag: L.axial * 0.22, r: L.D * 0.1, detail: 'low', ribbons: detail === 'high' });
    }
  }

  // ---- interior
  let info: TempleInterior | undefined;
  if (interior) {
    const ix0 = cl.x0 + t;
    const ix1 = cl.x1 - t;
    const iz0 = cz0 + t;
    const iz1 = cl.z1 - t;
    info = { x0: ix0, x1: ix1, z0: iz0, z1: iz1, y: P, wallH, cells: cellXs, at: m, detail };
    for (const c of cellXs) sectileFloor(b, c.x0, c.x1, iz0, iz1, P, Math.max(1.2, L.D * 1.6), m, detail);
    // Coloured marble dado (pavonazzetto with a giallo band) round the inside.
    for (const c of cellXs) {
      const dh = Math.min(1.6, wallH * 0.12);
      span(b, 'marble_pavonazzetto', c.x0, P, iz1 - 0.04, c.x1, P + dh, iz1, m);
      span(b, 'marble_pavonazzetto', c.x0, P, iz0, c.x0 + 0.04, P + dh, iz1, m);
      span(b, 'marble_pavonazzetto', c.x1 - 0.04, P, iz0, c.x1, P + dh, iz1, m);
      span(b, 'marble_giallo', c.x0, P + dh, iz1 - 0.05, c.x1, P + dh + 0.18, iz1, m);
      coffers(b, c.x0, c.x1, iz0, iz1, P + wallH - 0.01, Math.max(1.4, (c.x1 - c.x0) / 5), m, detail);
    }
    if (spec.innerColumns && spec.innerColumns > 0 && nCells === 1) {
      const n = spec.innerColumns;
      const H2 = wallH * 0.62;
      const D2 = H2 / 10;
      for (const sx of [-1, 1]) {
        const x = sx < 0 ? ix0 + D2 * 1.2 : ix1 - D2 * 1.2;
        for (let k = 0; k < n; k++) {
          const z = iz0 + ((k + 0.7) * (iz1 - iz0 - (spec.apse ? (ix1 - ix0) * 0.3 : 0))) / (n + 0.4);
          column(b, { order: 'corinthian', D: D2, height: H2, fluted: false, material: 'marble_pavonazzetto', trimMaterial: 'marble', detail: 'low' }, mul(m, T(x, P, z)));
        }
      }
    }
    if (spec.apse && nCells === 1) {
      const R = ((ix1 - ix0) / 2) * spec.apse;
      const hA = wallH * 0.62;
      // A raised platform (pulvinar) under the apse for the cult statues.
      const zc = iz1 - R - 0.05;
      span(b, 'marble', -R - 0.6, P, zc - 0.8, R + 0.6, P + 0.9, iz1, m, true);
      apse(b, { radius: R, height: hA, thickness: 0.5, material: 'marble', domeMaterial: 'plaster_white', detail, collide: false }, mul(m, T(0, P + 0.9, zc)));
    }
    spec.furnish?.(b, info);
  }

  const doors = openings.map((o) => new THREE.Vector3(cl.x0 + o.x, P, cz0));
  const stairTop = new THREE.Vector3(0, P, L.stairMode === 'sides' ? L.podiumFront : s.z0);
  const stairFoot = new THREE.Vector3(L.stairMode === 'sides' ? s.x0 - 1 : 0, 0, L.stairMode === 'front' ? st.z0 - 0.5 : L.podiumFront);
  return { layout: L, doors, stairTop, stairFoot, interior: info, apexY };
}

/**
 * A small archaic or Republican shrine-temple (Jupiter Feretrius, Fides, minor aedes): podium with a
 * frontal stair, `n` columns in front (low-detail kit columns), a solid cella, a plain entablature
 * band and a gable roof with pediments. Cheap (≈ 3–6k triangles). Facade −z, origin at the podium
 * centre on the ground; `w` × `d` is the podium.
 */
export function smallTemple(
  b: MeshBuilder,
  o: { w: number; d: number; P: number; H: number; n: number; order: 'tuscan' | 'ionic' | 'corinthian'; mat: MaterialId; podium: MaterialId; roof?: MaterialId; tympanum?: MaterialId | THREE.Material; detail: 'high' | 'low' },
  at: THREE.Matrix4,
): { stairFoot: number; top: number } {
  const { w, d, P, H, n } = o;
  const run = 0.34;
  const { count, rise } = stepCountLocal(P);
  const sd = count * run;
  const z0 = -d / 2 + sd; // podium front (top of the stair)
  podium(b, { outline: [[-w / 2, z0], [w / 2, z0], [w / 2, d / 2], [-w / 2, d / 2]], height: P, material: o.podium, topMaterial: 'paving_travertine', detail: o.detail }, at);
  stairs(b, { width: w * 0.7, rise, run, count, material: o.podium }, mul(at, T(0, 0, -d / 2)));
  const D = H / (o.order === 'tuscan' ? 7 : o.order === 'ionic' ? 9 : 10);
  const zc = z0 + D * 1.2;
  const span = w - 2 * D;
  for (let i = 0; i < n; i++) column(b, { order: o.order, D, height: H, material: o.mat, detail: 'low' }, mul(at, T(-span / 2 + (span * i) / Math.max(1, n - 1), P, zc)));
  // Cella behind a porch two intercolumns deep.
  const cz0 = zc + Math.min(d * 0.35, span / Math.max(1, n - 1) * 1.6);
  solid(b, 0, P + H / 2, (cz0 + d / 2 - 0.2) / 2, w - 0.6, H, d / 2 - 0.2 - cz0, at);
  b.box(o.mat, w - 0.6, H, d / 2 - 0.2 - cz0, mul(at, T(0, P + H / 2, (cz0 + d / 2 - 0.2) / 2)));
  // Door in the cella front.
  b.box('bronze', Math.min(1.6, w * 0.25), Math.min(H * 0.7, 3.2), 0.06, mul(at, T(0, P + Math.min(H * 0.7, 3.2) / 2, cz0 - 0.03)));
  // Entablature band and roof.
  const eh = H * 0.22;
  const ez0 = zc - D * 0.6;
  b.box(o.mat, w + 0.1, eh, d / 2 - ez0, mul(at, T(0, P + H + eh / 2, (ez0 + d / 2) / 2)));
  const rise2 = (w / 2 + 0.3) * Math.tan((16 * Math.PI) / 180);
  const yR = P + H + eh;
  for (const sx of [-1, 1]) {
    const g = new THREE.BoxGeometry(Math.hypot(w / 2 + 0.4, rise2), 0.16, d / 2 - ez0 + 0.5);
    g.rotateZ(sx * -Math.atan2(rise2, w / 2 + 0.4));
    g.translate((sx * (w / 2 + 0.4)) / 2, yR + rise2 / 2 + 0.05, (ez0 + d / 2) / 2);
    b.add(g, o.roof ?? 'roof_tile', at);
  }
  for (const z of [ez0 - 0.01, d / 2 + 0.01]) {
    const shape = new THREE.Shape([new THREE.Vector2(-w / 2 - 0.05, 0), new THREE.Vector2(w / 2 + 0.05, 0), new THREE.Vector2(0, rise2)]);
    const g = new THREE.ShapeGeometry(shape);
    if (z < 0) g.rotateY(Math.PI);
    g.translate(0, yR, z);
    b.add(g, z < 0 ? (o.tympanum ?? o.mat) : o.mat, at);
  }
  return { stairFoot: -d / 2, top: yR + rise2 };
}

function stepCountLocal(P: number) {
  const count = Math.max(1, Math.round(P / 0.21));
  return { count, rise: P / count };
}
