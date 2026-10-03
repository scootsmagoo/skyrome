/**
 * Roman temples on a high podium with frontal stairs.
 *
 * Plans (Vitruvius IV; Roman practice):
 *  - 'prostyle'          columns across the front and down the sides of a deep porch only
 *                        (Temple of Saturn).
 *  - 'pseudoperipteral'  free columns in the porch, half-columns engaged on the cella walls
 *                        (Maison Carrée, Temple of Portunus).
 *  - 'peripteral'        a colonnade all round (Temple of Castor).
 *  - 'sine_postico'      columns on the front and flanks, a solid back wall
 *                        (Temple of Mars Ultor, Venus Genetrix).
 *
 * Local frame: the facade (stairs) faces −z, origin on the ground at the centre of the
 * stylobate. `templeLayout()` is pure arithmetic (tested); `temple()` builds geometry and
 * colliders into a MeshBuilder.
 */
import * as THREE from 'three';
import type { MeshBuilder } from '../../gfx/MeshBuilder';
import type { MaterialId } from '../../gfx/materialIds';
import { UV_METERS } from '../../gfx/textures/catalog';
import { T, TRS, makeGeometry, mul, type V2 } from '../common/geom';
import { stairs, stepCount } from '../common/stairs';
import { wall } from '../common/walls';
import { column } from './column';
import { acroterion, entablature, pediment } from './entablature';
import { INTERCOLUMNIATION, ORDER_PROPORTIONS, axialSpacing, columnDims, entablatureDims, pedimentRise, type Detail, type Intercolumniation, type Order } from './orders';
import { podium } from './podium';

export type TemplePlan = 'prostyle' | 'pseudoperipteral' | 'peripteral' | 'sine_postico';

export interface TempleSpec {
  order?: Order;
  plan?: TemplePlan;
  /** Columns across the front: 4 tetrastyle, 6 hexastyle, 8 octastyle, 10 decastyle. */
  front?: number;
  /** Column positions along each flank including both corners (virtual grid for prostyle). */
  sides?: number;
  /** Lower column diameter. Alternatively give `width`. */
  D?: number;
  /** Target stylobate width (sets D). */
  width?: number;
  /** Column height (default canonical for the order). */
  columnHeight?: number;
  intercolumniation?: Intercolumniation | number;
  /** Porch depth in bays (default 3, peripteral 2). */
  pronaos?: number;
  podiumHeight?: number;
  /**
   * 'front' (default): a frontal flight between podium wings. 'sides': a rostrum projecting in
   * front of the columns with lateral flights along both flanks (Temple of Castor, Divus Iulius).
   * 'none': a bare podium.
   */
  stairs?: 'front' | 'sides' | 'none';
  /** Target stair riser (default 0.22 m). */
  riser?: number;
  fluted?: boolean;
  material?: MaterialId;
  podiumMaterial?: MaterialId;
  cellaMaterial?: MaterialId;
  roofMaterial?: 'roof_tile' | 'gilded_bronze';
  doorMaterial?: MaterialId;
  acroteria?: 'palmette' | 'none';
  /** Sculpture group in the front pediment (placeholder figures). Default true at high detail. */
  pedimentRelief?: boolean;
  pitchDeg?: number;
  detail?: Detail;
}

export interface TempleColumn {
  x: number;
  z: number;
  kind: 'free' | 'engaged';
  /** Rotation for engaged columns so the half faces outward. */
  rotY: number;
}

export interface TempleLayout {
  order: Order;
  plan: TemplePlan;
  D: number;
  /** Column height. */
  H: number;
  axial: number;
  front: number;
  sides: number;
  /** Axis-to-axis width and depth of the column grid. */
  spanX: number;
  spanZ: number;
  columns: TempleColumn[];
  /** Stylobate rectangle (podium top, excluding the stair wings). */
  stylobate: { x0: number; x1: number; z0: number; z1: number };
  podiumHeight: number;
  /** The main flight (the left flight for 'sides'). */
  stairs: { x0: number; x1: number; z0: number; z1: number; count: number; rise: number; run: number };
  /** Every flight; each climbs towards +z from z0 to z1. */
  flights: { x0: number; x1: number; z0: number; z1: number; count: number; rise: number; run: number }[];
  /** Podium front edge (the rostrum front for 'sides'). */
  podiumFront: number;
  stairMode: 'front' | 'sides' | 'none';
  /** Cella outer rectangle and wall thickness. */
  cella: { x0: number; x1: number; z0: number; z1: number; wall: number };
  /** Entablature: architrave-face rectangle and its height above the podium top. */
  entablature: { x0: number; x1: number; z0: number; z1: number; height: number };
  /** Total height from ground to the pediment apex (approx). */
  totalHeight: number;
}

const DEFAULT_SIDES: Record<TemplePlan, (front: number) => number> = {
  prostyle: (f) => (f <= 4 ? 7 : f <= 6 ? 10 : 12),
  pseudoperipteral: (f) => (f <= 4 ? 7 : f <= 6 ? 11 : 13),
  peripteral: (f) => (f <= 4 ? 7 : f <= 6 ? 11 : f <= 8 ? 11 : 13),
  sine_postico: (f) => (f <= 6 ? 7 : 8),
};

export function templeLayout(spec: TempleSpec): TempleLayout {
  const order = spec.order ?? 'corinthian';
  const plan = spec.plan ?? 'pseudoperipteral';
  const front = Math.max(2, spec.front ?? 6);
  const sides = Math.max(3, spec.sides ?? DEFAULT_SIDES[plan](front));
  const ic = spec.intercolumniation ?? 'systyle';
  const icD = typeof ic === 'number' ? ic : INTERCOLUMNIATION[ic];
  const props = ORDER_PROPORTIONS[order];
  const margin = 0.3;
  const D = spec.D ?? (spec.width ? spec.width / ((front - 1) * (1 + icD) + props.plinthD + 2 * margin) : 1);
  const dims = columnDims(order, D, spec.columnHeight);
  const H = dims.height;
  const axial = axialSpacing(D, icD);
  const spanX = (front - 1) * axial;
  const spanZ = (sides - 1) * axial;
  const pron = Math.min(sides - 2, spec.pronaos ?? (plan === 'peripteral' ? 2 : 3));
  const xs = (i: number) => -spanX / 2 + i * axial;
  const zs = (j: number) => -spanZ / 2 + j * axial;
  const columns: TempleColumn[] = [];
  const wallT = Math.max(0.5, 0.85 * D);
  // Columns.
  for (let j = 0; j < sides; j++) {
    for (let i = 0; i < front; i++) {
      const edgeX = i === 0 || i === front - 1;
      const isFront = j === 0;
      const isBack = j === sides - 1;
      if (!(edgeX || isFront || isBack)) continue;
      const free = { x: xs(i), z: zs(j), kind: 'free' as const, rotY: 0 };
      // Engaged columns face outward (local −z): west −x → π/2, east +x → −π/2, back +z → π.
      const outward = isBack && !edgeX ? Math.PI : i === 0 ? Math.PI / 2 : i === front - 1 ? -Math.PI / 2 : Math.PI;
      const engaged = { x: xs(i), z: zs(j), kind: 'engaged' as const, rotY: outward };
      if (plan === 'peripteral') columns.push(free);
      else if (plan === 'sine_postico') {
        if (!isBack) columns.push(free);
      } else if (plan === 'pseudoperipteral') {
        if (isFront || j <= pron) columns.push(free);
        else if (isBack && edgeX) columns.push(free); // three-quarter engaged at the back corners
        else columns.push(engaged);
      } else if (plan === 'prostyle') {
        if (isFront || (edgeX && j <= pron - 1)) columns.push(free);
      }
    }
  }
  // Cella.
  let cella: TempleLayout['cella'];
  const zPron = zs(pron);
  if (plan === 'peripteral') {
    cella = { x0: xs(1) - wallT / 2, x1: xs(front - 2) + wallT / 2, z0: zPron - wallT / 2, z1: zs(sides - 2) + wallT / 2, wall: wallT };
  } else if (plan === 'sine_postico') {
    cella = { x0: xs(1) - wallT / 2, x1: xs(front - 2) + wallT / 2, z0: zPron - wallT / 2, z1: zs(sides - 1) + wallT / 2, wall: wallT };
  } else {
    cella = { x0: xs(0), x1: xs(front - 1), z0: zPron - wallT / 2, z1: zs(sides - 1), wall: wallT };
  }
  const half = dims.plinth / 2 + margin;
  const stylobate = { x0: -spanX / 2 - half, x1: spanX / 2 + half, z0: -spanZ / 2 - half, z1: spanZ / 2 + half };
  const podiumHeight = spec.podiumHeight ?? Math.max(1.2, 0.28 * H);
  const { count, rise } = stepCount(podiumHeight, spec.riser ?? 0.22);
  const run = 0.34;
  const wing = Math.max(0.9, 1.1 * D);
  const stairMode = spec.stairs ?? 'front';
  let st = { x0: stylobate.x0 + wing, x1: stylobate.x1 - wing, z1: stylobate.z0, z0: stylobate.z0 - count * run, count, rise, run };
  let flights = [st];
  let podiumFront = st.z0;
  if (stairMode === 'sides') {
    // Rostrum in front of the columns; lateral flights run up along the flanks from its front.
    const rostrum = Math.max(3, 1.2 * axial);
    podiumFront = stylobate.z0 - rostrum;
    const w = Math.max(1.6, 1.4 * D);
    const len = count * run;
    flights = [
      { x0: stylobate.x0 - w, x1: stylobate.x0, z0: podiumFront, z1: podiumFront + len, count, rise, run },
      { x0: stylobate.x1, x1: stylobate.x1 + w, z0: podiumFront, z1: podiumFront + len, count, rise, run },
    ];
    st = flights[0];
  } else if (stairMode === 'none') {
    flights = [];
    podiumFront = stylobate.z0;
  }
  const d = dims.d;
  const ent = entablatureDims(order, H);
  const ex = spanX / 2 + d / 2;
  const entablatureRect = { x0: -ex, x1: ex, z0: -spanZ / 2 - d / 2, z1: spanZ / 2 + d / 2, height: ent.total };
  const totalHeight = podiumHeight + H + ent.total + pedimentRise(2 * ex, spec.pitchDeg ?? 14) + ent.cornice;
  return { order, plan, D, H, axial, front, sides, spanX, spanZ, columns, stylobate, podiumHeight, stairs: st, flights, podiumFront, stairMode, cella, entablature: entablatureRect, totalHeight };
}

export interface TempleResult {
  layout: TempleLayout;
}

/** Gable roof: two tiled slopes from the ridge (along z) down to the eaves, with imbrex ridges. */
function roof(b: MeshBuilder, x0: number, x1: number, z0: number, z1: number, yEave: number, pitch: number, mat: MaterialId, detail: Detail, m: THREE.Matrix4) {
  const halfW = (x1 - x0) / 2;
  const rise = halfW * Math.tan(pitch);
  const thick = 0.18;
  const slopeLen = halfW / Math.cos(pitch);
  for (const side of [-1, 1]) {
    // A sloped slab with its own UVs: u along the ridge, v down the slope (tile rows run down-slope).
    const xr = (x0 + x1) / 2;
    const xe = side < 0 ? x0 : x1;
    const pos: number[] = [];
    const nor: number[] = [];
    const uv: number[] = [];
    const n = new THREE.Vector3(side * Math.sin(pitch), Math.cos(pitch), 0);
    const quad = (a: number[], bq: number[], c: number[], d: number[], nn: THREE.Vector3, uvs: number[][]) => {
      for (const [p, t] of [
        [a, uvs[0]],
        [bq, uvs[1]],
        [c, uvs[2]],
        [a, uvs[0]],
        [c, uvs[2]],
        [d, uvs[3]],
      ] as [number[], number[]][]) {
        pos.push(p[0], p[1], p[2]);
        nor.push(nn.x, nn.y, nn.z);
        uv.push(t[0], t[1]);
      }
    };
    const top = (x: number, z: number) => [x, yEave + rise * (1 - Math.abs(x - xr) / halfW), z];
    const A = top(xr, z0);
    const B = top(xr, z1);
    const C = top(xe, z1);
    const Dd = top(xe, z0);
    const L = (z1 - z0) / UV_METERS;
    const S = slopeLen / UV_METERS;
    // Winding so the face points along n (outward/up).
    if (side > 0) quad(A, B, C, Dd, n, [[0, 0], [L, 0], [L, S], [0, S]]);
    else quad(A, Dd, C, B, n, [[0, 0], [0, S], [L, S], [L, 0]]);
    b.add(makeGeometry(pos, nor, uv), mat, m, { uv: 'keep' });
    // Slab thickness / underside (simple box under the slope).
    const slab = new THREE.BoxGeometry(slopeLen, thick, z1 - z0);
    slab.rotateZ(side * -pitch);
    slab.translate((xr + xe) / 2 - side * Math.sin(pitch) * thick * 0.5, yEave + rise / 2 - (thick / 2) * Math.cos(pitch) - 0.005, (z0 + z1) / 2);
    b.add(slab, 'wood_dark', m, { castShadow: false });
    if (detail === 'high') {
      // Imbrices: low triangular ridges down the slope every ~0.48 m, ending in antefix discs.
      const pitchStep = 0.48;
      const nRidge = Math.floor((z1 - z0) / pitchStep);
      const ridge = new THREE.CylinderGeometry(0.07, 0.07, slopeLen, 4, 1, true);
      ridge.rotateZ(Math.PI / 2);
      ridge.rotateZ(side * -pitch);
      for (let k = 0; k < nRidge; k++) {
        const z = z0 + (k + 0.5) * ((z1 - z0) / nRidge);
        const g = ridge.clone().translate((xr + xe) / 2, yEave + rise / 2 + 0.01, z);
        b.add(g, mat, m, { uv: 'box' });
        const ante = new THREE.CircleGeometry(0.12, 6, 0, Math.PI);
        ante.rotateY(side * Math.PI / 2);
        ante.translate(xe + side * 0.01, yEave + 0.02, z);
        b.add(ante, 'terracotta', m);
      }
    }
  }
  // Ridge cap.
  const cap = new THREE.CylinderGeometry(0.16, 0.16, z1 - z0, 6);
  cap.rotateX(Math.PI / 2);
  cap.translate((x0 + x1) / 2, yEave + rise + 0.06, (z0 + z1) / 2);
  b.add(cap, mat, m);
}

export function temple(b: MeshBuilder, spec: TempleSpec, at?: THREE.Matrix4): TempleResult {
  const L = templeLayout(spec);
  const m = at ?? new THREE.Matrix4();
  const detail = spec.detail ?? 'high';
  const mat = spec.material ?? 'marble';
  const podMat = spec.podiumMaterial ?? 'travertine';
  const cellaMat = spec.cellaMaterial ?? mat;
  const P = L.podiumHeight;
  const pitchDeg = spec.pitchDeg ?? 14;
  const pitch = (pitchDeg * Math.PI) / 180;
  const { stylobate: s, stairs: st } = L;

  // Podium: with stair wings (front), a rostrum (sides) or plain.
  const outline: V2[] =
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
      : [
          [s.x0, L.podiumFront],
          [s.x1, L.podiumFront],
          [s.x1, s.z1],
          [s.x0, s.z1],
        ];
  const colliders: [number, number, number, number][] =
    L.stairMode === 'front'
      ? [
          [s.x0, s.z0, s.x1, s.z1],
          [s.x0, st.z0, st.x0, s.z0],
          [st.x1, st.z0, s.x1, s.z0],
        ]
      : [[s.x0, L.podiumFront, s.x1, s.z1]];
  podium(b, { outline, height: P, material: podMat, topMaterial: 'paving_travertine', detail, colliders }, m);
  for (const f of L.flights) stairs(b, { width: f.x1 - f.x0, rise: f.rise, run: f.run, count: f.count, material: podMat }, mul(m, T((f.x0 + f.x1) / 2, 0, f.z0)));

  // Columns.
  const colSpec = { order: L.order, D: L.D, height: L.H, fluted: spec.fluted ?? true, material: mat, detail };
  for (const c of L.columns) {
    column(b, { ...colSpec, kind: c.kind }, mul(m, TRS(c.x, P, c.z, 0, c.rotY, 0)));
  }

  // Cella walls (with the door in the front wall).
  const cl = L.cella;
  const wallH = L.H + L.entablature.height * 0.55;
  const t = cl.wall;
  const cw = cl.x1 - cl.x0;
  const cd = cl.z1 - cl.z0;
  const doorW = Math.min(cw * 0.42, L.H * 0.36);
  const doorH = Math.min(L.H * 0.72, doorW * 2.1);
  const course = Math.max(0.45, L.D * 0.5);
  const wallOpts = { height: wallH, thickness: t, material: cellaMat, courses: course, detail, collide: false } as const;
  // front (facing −z): runs +x at z = z0 + t/2
  wall(b, { ...wallOpts, length: cw, openings: [{ kind: 'door', x: cw / 2, width: doorW, height: doorH, leafMaterial: spec.doorMaterial ?? 'bronze' }] }, mul(m, T(cl.x0, P, cl.z0 + t / 2)));
  // back: runs −x at z = z1 − t/2 (rotated π so its front faces +z)
  wall(b, { ...wallOpts, length: cw }, mul(m, TRS(cl.x1, P, cl.z1 - t / 2, 0, Math.PI, 0)));
  // flanks: east (+x) faces +x, runs along +z… rotY = −π/2 maps local +x → +z? (cos, −sin): use explicit rotations
  wall(b, { ...wallOpts, length: cd - 2 * t + 0.002 }, mul(m, TRS(cl.x1 - t / 2, P, cl.z0 + t - 0.001, 0, -Math.PI / 2, 0)));
  wall(b, { ...wallOpts, length: cd - 2 * t + 0.002 }, mul(m, TRS(cl.x0 + t / 2, P, cl.z1 - t + 0.001, 0, Math.PI / 2, 0)));
  // One solid collider for the cella block.
  {
    const c = new THREE.Vector3((cl.x0 + cl.x1) / 2, P + wallH / 2, (cl.z0 + cl.z1) / 2).applyMatrix4(m);
    const q = new THREE.Quaternion();
    m.decompose(new THREE.Vector3(), q, new THREE.Vector3());
    b.collider({ kind: 'box', center: c, half: new THREE.Vector3(cw / 2, wallH / 2, cd / 2), rotation: q });
  }
  if (L.plan === 'sine_postico') {
    // High back wall spanning the full width behind the flank colonnades.
    const e = L.entablature;
    wall(b, { ...wallOpts, length: e.x1 - e.x0, collide: true }, mul(m, TRS(e.x1, P, L.spanZ / 2, 0, Math.PI, 0)));
  }

  // Entablature round the architrave-face rectangle.
  const e = L.entablature;
  const yE = P + L.H;
  const path = [new THREE.Vector3(e.x0, yE, e.z0), new THREE.Vector3(e.x1, yE, e.z0), new THREE.Vector3(e.x1, yE, e.z1), new THREE.Vector3(e.x0, yE, e.z1)];
  const ent = entablature(b, path, { order: L.order, columnHeight: L.H, D: L.D, material: mat, detail, axial: L.axial }, { closed: true, at: m });
  // Porch / ambulatory ceiling at the frieze top, inside the entablature.
  {
    const yc = yE + ent.dims.architrave + ent.dims.frieze;
    const ceil = new THREE.BoxGeometry(e.x1 - e.x0 - 0.2, 0.25, e.z1 - e.z0 - 0.2);
    ceil.translate(0, yc - 0.125 + 0.02, (e.z0 + e.z1) / 2);
    b.add(ceil, 'marble', m, { castShadow: false });
    // Fill between the cella wall top and the ceiling.
    const fill = new THREE.BoxGeometry(cw, yc - (P + wallH) + 0.02, cd);
    fill.translate((cl.x0 + cl.x1) / 2, (P + wallH + yc) / 2, (cl.z0 + cl.z1) / 2);
    b.add(fill, cellaMat, m);
  }
  // Pediments front and back, roof between.
  const yTop = yE + ent.dims.total;
  const span = e.x1 - e.x0;
  const ped = { order: L.order, span, cornice: ent.dims.cornice, depth: 0.9 * L.D, friezeX: ent.friezeX, pitchDeg, material: mat, detail, D: L.D };
  const pf = pediment(b, { ...ped, relief: spec.pedimentRelief ?? detail === 'high' }, mul(m, T(0, yTop, e.z0)));
  pediment(b, ped, mul(m, TRS(0, yTop, e.z1, 0, Math.PI, 0)));
  // Tympanum back-fill so the roof void can't be seen through: a triangular gable wall.
  const roofMat = spec.roofMaterial ?? 'roof_tile';
  const over = ent.projection + 0.1;
  roof(b, e.x0 - over, e.x1 + over, e.z0 + 0.4 * L.D, e.z1 - 0.4 * L.D, yTop - 0.05, pitch, roofMat, detail, m);
  // Acroteria.
  if ((spec.acroteria ?? 'palmette') === 'palmette') {
    const size = L.D * 1.1;
    const acMat: MaterialId = roofMat === 'gilded_bronze' ? 'gilded_bronze' : mat;
    for (const z of [e.z0, e.z1]) {
      const zz = z + (z < 0 ? -ent.friezeX : ent.friezeX);
      acroterion(b, size * 1.25, acMat, mul(m, TRS(0, yTop + pf.apex - 0.1, zz, 0, z < 0 ? 0 : Math.PI, 0)), detail);
      for (const x of [e.x0 + 0.3, e.x1 - 0.3]) acroterion(b, size, acMat, mul(m, TRS(x, yTop + 0.05, zz, 0, z < 0 ? 0 : Math.PI, 0)), detail);
    }
  }
  return { layout: L };
}
