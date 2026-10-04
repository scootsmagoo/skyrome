/**
 * The Flavian Amphitheatre (AMPHITHEATRVM), AD 113 — complete, smooth travertine, no robbing holes.
 *
 * Plan: every ring is a curve PARALLEL to the arena ellipse (43 × 27 m real semi-axes at the podium
 * wall), so the facade lands on 94 × 78 m and ring widths stay constant all the way round. 80 bays
 * per ring at equal arc length on the facade; bay 0 is centred on the east end of the long axis,
 * bays 20/40/60 on the south (imperial box), west (Porta Triumphalis) and north axes. The 76 others
 * carry their entrance numbers I–LXXVI.
 *
 * Section (game metres, x = outward offset from the podium face):
 *   arena edge 0 · podium terrace + 3 senatorial rows · balteus · maenianum primum (8 rows) ·
 *   balteus · maenianum secundum imum (8) · high wall · summum in ligneis (6 timber rows) · top
 *   walk + porticus in summa cavea · attic. Behind/under the cavea: ring 3 wall 21.2, inner
 *   ambulatory, ring 2 arcade 24.8–26.2, outer ambulatory, facade 29.2–30.6.
 *
 * Walkable: the plaza (cippi ring), every ground-floor arch, both ambulatories, the two long-axis
 * passages straight onto the arena sand (Porta Triumphalis W, Libitinensis E), stairs from the
 * short-axis passages up into the imperial (S) and editor's (N) boxes on the podium, four
 * vomitoria with stairs onto the first balteus, and the cavea by its aisles (scalaria) and the
 * flights at each balteus up to the top of the maenianum secundum.
 *
 * Performance: the 80 bays per storey (and the inner arcade, statues, top colonnade, cippi) are
 * InstancedMeshes with per-instance distance LOD (colos-kit InstanceLod): near detail only where
 * the camera is. Continuous parts (entablatures, floors, vaults, cavea rows) are merged sweeps.
 */
import * as THREE from 'three';
import { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../gfx/materialIds';
import { ProfileBuilder, extrudePolygon, sweep, type V2 } from '../../../arch/common/geom';
import { column } from '../../../arch/classical/column';
import { entablature, corniceOnlyProfile } from '../../../arch/classical/entablature';
import { ORDER_PROPORTIONS, type Order } from '../../../arch/classical/orders';
import { inscriptionPanel } from '../../../arch/common/inscription';
import { Draw } from '../../../arch/fabric';
import { placeProp, type PropKind } from '../../../arch/props';
import { Rng } from '../../../core/Rng';
import type { LandmarkBuilder, LandmarkContext, Spot } from '../types';
import {
  Oval,
  type LodSet,
  type ReadableSpec,
  addReadables,
  flight,
  instanceLod,
  lodInstances,
  numeralMaterial,
  numeralUV,
  ovalBand,
  ovalPaving,
  ovalSweep,
  risers,
  romanNumeral,
  solid,
  span,
  statueGeometry,
  uvQuad,
} from './colos-kit';

// ---------------------------------------------------------------- dimensions (game metres)

const S = 0.6;
export const COLOS = {
  arenaA: 43 * S,
  arenaB: 27 * S,
  /** Facade outer face, offset from the podium face. */
  xF: 51 * S,
  wall: 2.4 * S,
  bays: 80,
  storeyH: [10.5, 11.85, 11.6, 14.2].map((h) => h * S),
  /** Arch openings: clear span and crown height above each storey floor. */
  span: 4.2 * S,
  crown: [7.0 * S, 6.4 * S, 6.4 * S],
  pedestal: [0, 1.6 * S, 1.6 * S, 1.0 * S],
  /** Podium wall height (unclimbable with its balustrade). */
  podium: 3.2,
  /** Cippi ring: 18 m real out from the facade. */
  cippi: 18 * S,
};
const XF = COLOS.xF;
const XI = XF - COLOS.wall; // facade inner face
const XM = XF - COLOS.wall / 2; // facade mid-wall (bay chords)
const AMB1: [number, number] = [XI - 3.0, XI];
const R2: [number, number] = [AMB1[0] - 1.4, AMB1[0]];
const AMB2: [number, number] = [R2[0] - 2.7, R2[0]];
const R3: [number, number] = [AMB2[0] - 0.86, AMB2[0]];
const SY = [0, 0, 0, 0, 0];
for (let i = 0; i < 4; i++) SY[i + 1] = SY[i] + COLOS.storeyH[i];
const ORDERS: Order[] = ['tuscan', 'ionic', 'corinthian', 'corinthian'];

// ---------------------------------------------------------------- cavea section (pure)

export interface CaveaSeg {
  kind: 'riser' | 'tread';
  /** riser: x; tread: x0..x1. */
  x0: number;
  x1: number;
  /** riser: y0..y1; tread: y0 = y1 = level. */
  y0: number;
  y1: number;
  /** -1 podium face, 0.. tiers. */
  tier: number;
  /** Row index within the tier (-1: walkway / wall / cap). */
  row: number;
  role: 'podium' | 'walk' | 'wall' | 'cap' | 'row' | 'top';
  mat: MaterialId;
}

export interface CaveaTierDef {
  name: string;
  walk: number;
  wall: number;
  cap: number;
  rows: number;
  rise: number;
  depth: number;
  seat: MaterialId;
  riser: MaterialId;
}

export const CAVEA_TIERS: CaveaTierDef[] = [
  { name: 'podium', walk: 2.4, wall: 0, cap: 0, rows: 3, rise: 0.42, depth: 0.85, seat: 'marble', riser: 'marble_veined' },
  { name: 'maenianum primum', walk: 2.14, wall: 1.26, cap: 0.4, rows: 8, rise: 0.42, depth: 0.68, seat: 'marble', riser: 'travertine' },
  { name: 'maenianum secundum imum', walk: 2.14, wall: 1.26, cap: 0.4, rows: 8, rise: 0.42, depth: 0.68, seat: 'marble', riser: 'travertine' },
  { name: 'summum in ligneis', walk: 1.4, wall: 2.52, cap: 0.4, rows: 6, rise: 0.42, depth: 0.68, seat: 'wood', riser: 'wood' },
];

export interface CaveaSection {
  segs: CaveaSeg[];
  /** Walkway (balteus) in front of each tier: x range and level. */
  walks: { tier: number; x0: number; x1: number; y: number; wallX: number; wallTop: number }[];
  /** Per tier: rows (front x, depth, tread y, previous y). */
  rows: { tier: number; row: number; x0: number; x1: number; y: number; yPrev: number }[];
  /** Top walk (portico floor) start x and level. */
  topX: number;
  topY: number;
}

export function caveaSection(tiers = CAVEA_TIERS, podium = COLOS.podium, topEnd = XI): CaveaSection {
  const segs: CaveaSeg[] = [];
  const walks: CaveaSection['walks'] = [];
  const rows: CaveaSection['rows'] = [];
  segs.push({ kind: 'riser', x0: 0, x1: 0, y0: 0, y1: podium, tier: -1, row: -1, role: 'podium', mat: 'marble' });
  let x = 0;
  let y = podium;
  tiers.forEach((t, ti) => {
    const walkMat: MaterialId = ti === 0 ? 'marble' : 'paving_travertine';
    segs.push({ kind: 'tread', x0: x, x1: x + t.walk, y0: y, y1: y, tier: ti, row: -1, role: 'walk', mat: walkMat });
    const w = { tier: ti, x0: x, x1: x + t.walk, y, wallX: x + t.walk, wallTop: y + t.wall };
    walks.push(w);
    x += t.walk;
    if (t.wall > 0) {
      segs.push({ kind: 'riser', x0: x, x1: x, y0: y, y1: y + t.wall, tier: ti, row: -1, role: 'wall', mat: 'marble' });
      y += t.wall;
      segs.push({ kind: 'tread', x0: x, x1: x + t.cap, y0: y, y1: y, tier: ti, row: -1, role: 'cap', mat: 'marble' });
      x += t.cap;
    }
    for (let r = 0; r < t.rows; r++) {
      segs.push({ kind: 'riser', x0: x, x1: x, y0: y, y1: y + t.rise, tier: ti, row: r, role: 'row', mat: t.riser });
      rows.push({ tier: ti, row: r, x0: x, x1: x + t.depth, y: y + t.rise, yPrev: y });
      y += t.rise;
      segs.push({ kind: 'tread', x0: x, x1: x + t.depth, y0: y, y1: y, tier: ti, row: r, role: 'row', mat: t.seat });
      x += t.depth;
    }
  });
  segs.push({ kind: 'tread', x0: x, x1: topEnd, y0: y, y1: y, tier: tiers.length, row: -1, role: 'top', mat: 'marble' });
  return { segs, walks, rows, topX: x, topY: y };
}

// ---------------------------------------------------------------- layout (pure)

export interface ColosseumLayout {
  oval: Oval;
  /** Bay boundary parameters (bay k spans ts[k]..ts[k+1]); bay k centred on fraction k/80. */
  ts: number[];
  /** Bay centre parameters. */
  centres: number[];
  /** Mean bay chord on the facade mid-wall. */
  bay: number;
  section: CaveaSection;
  /** Entrance number of bay k (0 = axial, unnumbered). */
  numberOf(k: number): number;
}

/** Bay index → carved entrance number. Axial bays 0/20/40/60 are unnumbered; I starts W of the S axis. */
export function entranceNumber(k: number, n = COLOS.bays): number {
  const q = n / 4;
  const kk = ((k % n) + n) % n;
  if (kk % q === 0) return 0;
  // Count from the south axis (bay q) towards the west: bays q+1 .. q+q-1 → 1..q-1, skip axials.
  const rel = (kk - q + n) % n; // 1..n-1 (0 = south axis)
  const quadrant = Math.floor(rel / q);
  return rel - quadrant;
}

export function colosseumLayout(): ColosseumLayout {
  const oval = new Oval(COLOS.arenaA, COLOS.arenaB);
  const ts = oval.equalArc(COLOS.bays, XM, -0.5);
  const centres = oval.equalArc(COLOS.bays, XM, 0);
  const bay = oval.perimeter(XM) / COLOS.bays;
  return { oval, ts, centres, bay, section: caveaSection(), numberOf: (k) => entranceNumber(k) };
}

// ---------------------------------------------------------------- bay pieces (one bay, bay frame)

type Level = 'near' | 'mid' | 'low';

/** Archway head: the masonry above a semicircular opening (x centred, front face at z = -d/2). */
function archHead(span: number, spring: number, top: number, depth: number, n: number): THREE.BufferGeometry {
  const r = span / 2;
  const pts: V2[] = [[-r, spring]];
  for (let i = 1; i < n; i++) {
    const a = Math.PI - (Math.PI * i) / n;
    pts.push([Math.cos(a) * r, spring + Math.sin(a) * r]);
  }
  pts.push([r, spring], [r, top], [-r, top]);
  const g = extrudePolygon(pts, depth);
  g.translate(0, 0, depth / 2);
  return g;
}

/** Moulded archivolt band on a face (z = zf, facing −z), following the arch from springing to springing. */
function archivolt(b: MeshBuilder, mat: MaterialId, m: THREE.Matrix4, cx: number, spring: number, r: number, zf: number, w: number, n: number) {
  const prof = new ProfileBuilder(-0.02, 0).to(0.05, 0).to(0.05, w * 0.45).to(0.08, w * 0.55).to(0.08, w * 0.85).to(0.04, w).to(-0.02, w).build();
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const a = Math.PI - (Math.PI * i) / n;
    pts.push(new THREE.Vector3(cx + Math.cos(a) * r, spring + Math.sin(a) * r, zf));
  }
  b.add(sweep(prof, pts, { outward: new THREE.Vector3(0, 0, -1), caps: true }), mat, m);
}

/** Simple half-column (mid/low LOD): polygonal half shaft, block base and capital. */
function cheapHalfColumn(b: MeshBuilder, mat: MaterialId, m: THREE.Matrix4, x: number, y0: number, z: number, D: number, h: number, sides: number, order: Order) {
  const r = D / 2;
  const shaft = new THREE.CylinderGeometry(r * 0.88, r, h * 0.84, sides * 2, 1, true, Math.PI / 2, Math.PI);
  // CylinderGeometry θ from +z towards +x; the half facing −z spans π/2..3π/2.
  shaft.translate(x, y0 + h * 0.08 + h * 0.42, z);
  b.add(shaft, mat, m);
  span(b, mat, m, x - r * 1.25, y0, z - r * 1.15, x + r * 1.25, y0 + h * 0.08, z + 0.02);
  const capH = order === 'corinthian' ? h * 0.1 : h * 0.06;
  span(b, mat, m, x - r * (order === 'ionic' ? 1.35 : 1.15), y0 + h - capH, z - r * 1.1, x + r * (order === 'ionic' ? 1.35 : 1.15), y0 + h, z + 0.02);
}

interface StoreyGeo {
  order: Order;
  D: number;
  colH: number;
  entH: number;
  ped: number;
  crown: number;
  spring: number;
  pier: number;
}

function storeyGeo(si: number, bay: number): StoreyGeo {
  const H = COLOS.storeyH[si];
  const order = ORDERS[si];
  const ped = COLOS.pedestal[si];
  const entH = si === 3 ? 1.25 : H * 0.16;
  const colH = H - entH - ped;
  const D = Math.min(colH / ORDER_PROPORTIONS[order].heightD, bay * 0.2);
  const crown = si < 3 ? COLOS.crown[si] : 0;
  const spring = crown - COLOS.span / 2;
  return { order, D, colH, entH, ped, crown, spring, pier: bay - COLOS.span };
}

/** One facade bay of storey si at a LOD level, in the bay frame (x ∈ [0, bay], wall z ∈ ±wall/2). */
function facadeBay(si: number, level: Level, bay: number, variant: 'window' | 'shield' | 'plain' = 'plain'): MeshBuilder {
  const b = new MeshBuilder();
  const m = new THREE.Matrix4();
  const g = storeyGeo(si, bay);
  const H = COLOS.storeyH[si];
  const d = COLOS.wall;
  const zf = -d / 2;
  const mat: MaterialId = 'travertine';
  const ext = 0.05;
  if (si < 3) {
    const p2 = g.pier / 2;
    // Half piers (extended past the bay ends so the curved ring closes).
    span(b, mat, m, -ext, 0, zf, p2, H, -zf);
    span(b, mat, m, bay - p2, 0, zf, bay + ext, H, -zf);
    const n = level === 'near' ? 12 : level === 'mid' ? 6 : 3;
    b.add(archHead(COLOS.span, g.spring, H, d, n), mat, new THREE.Matrix4().makeTranslation(bay / 2, 0, 0));
    if (level === 'low') {
      // Column as a flat pilaster strip, entablature line as a band.
      span(b, mat, m, -g.D * 0.45, g.ped, zf - g.D * 0.35, g.D * 0.45, H - g.entH, zf);
      if (g.ped > 0) span(b, mat, m, p2, 0, zf + 0.1, bay - p2, g.ped * 0.9, zf + 0.5);
      return b;
    }
    // Impost mouldings at the springing on the pier faces and returns into the passage.
    const ih = 0.2;
    for (const [x0, x1] of [[g.D * 0.55, p2], [bay - p2, bay - g.D * 0.55]] as const) {
      span(b, mat, m, x0, g.spring - ih, zf - 0.07, x1, g.spring, zf + 0.02, false, false);
    }
    if (level === 'near') {
      span(b, mat, m, p2 - 0.01, g.spring - ih, zf, p2 + 0.05, g.spring, -zf, false, false);
      span(b, mat, m, bay - p2 - 0.05, g.spring - ih, zf, bay - p2 + 0.01, g.spring, -zf, false, false);
      archivolt(b, mat, m, bay / 2, g.spring, COLOS.span / 2, zf, 0.2, 12);
      // Keystone.
      span(b, mat, m, bay / 2 - 0.13, g.crown - 0.02, zf - 0.09, bay / 2 + 0.13, g.crown + 0.32, zf + 0.02, false, false);
      // Inner face archivolt (plain band) so the ambulatory side reads too.
      span(b, mat, m, bay / 2 - 0.1, g.crown, -zf - 0.01, bay / 2 + 0.1, g.crown + 0.18, -zf + 0.04, false, false);
    }
    // Pedestal under the column + parapet across the opening (storeys II, III).
    if (g.ped > 0) {
      span(b, mat, m, -g.D * 0.7, 0, zf - g.D * 0.42, g.D * 0.7, g.ped, zf + 0.02);
      span(b, mat, m, p2, 0, zf + 0.04, bay - p2, g.ped * 0.92, zf + 0.42);
      if (level === 'near') span(b, mat, m, p2 - 0.02, g.ped * 0.92, zf + 0.0, bay - p2 + 0.02, g.ped * 0.92 + 0.08, zf + 0.46, false, false);
    }
    // Engaged column at the bay start.
    if (level === 'near') {
      column(b, { order: g.order, D: g.D, height: g.colH, material: mat, detail: 'low', kind: 'engaged', collide: false }, new THREE.Matrix4().makeTranslation(0, g.ped, zf));
    } else {
      cheapHalfColumn(b, mat, m, 0, g.ped, zf, g.D, g.colH, 4, g.order);
    }
    return b;
  }
  // ---- attic: solid wall, flat Corinthian pilaster, window or bronze shield, corbels, masts.
  const wy = H * 0.36;
  const wh = H * 0.2;
  const ww = bay * 0.22;
  const cx = bay / 2;
  if (variant === 'window') {
    span(b, mat, m, -ext, 0, zf, cx - ww / 2, H, -zf);
    span(b, mat, m, cx + ww / 2, 0, zf, bay + ext, H, -zf);
    span(b, mat, m, cx - ww / 2, 0, zf, cx + ww / 2, wy, -zf);
    span(b, mat, m, cx - ww / 2, wy + wh, zf, cx + ww / 2, H, -zf);
    span(b, 'black', m, cx - ww / 2, wy, zf + 0.25, cx + ww / 2, wy + wh, zf + 0.3, false, false);
    if (level !== 'low') {
      // Reveals so the window has depth.
      span(b, mat, m, cx - ww / 2, wy, zf, cx - ww / 2 + 0.04, wy + wh, zf + 0.25, false, false);
      span(b, mat, m, cx + ww / 2 - 0.04, wy, zf, cx + ww / 2, wy + wh, zf + 0.25, false, false);
      span(b, mat, m, cx - ww / 2 - 0.1, wy - 0.12, zf - 0.08, cx + ww / 2 + 0.1, wy, zf + 0.02, false, false);
    }
  } else {
    span(b, mat, m, -ext, 0, zf, bay + ext, H, -zf);
    if (variant === 'shield' && level !== 'low') {
      const r = 0.62;
      const disc = new THREE.CylinderGeometry(r, r, 0.08, level === 'near' ? 24 : 8);
      disc.rotateX(Math.PI / 2);
      disc.translate(cx, wy + wh * 0.55, zf - 0.04);
      b.add(disc, 'gilded_bronze', m);
      if (level === 'near') {
        const boss = new THREE.SphereGeometry(0.17, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
        boss.rotateX(-Math.PI / 2);
        boss.translate(cx, wy + wh * 0.55, zf - 0.08);
        b.add(boss, 'gilded_bronze', m);
        const rim = new THREE.TorusGeometry(r - 0.04, 0.04, 4, 24);
        rim.translate(cx, wy + wh * 0.55, zf - 0.09);
        b.add(rim, 'gilded_bronze', m);
      }
    }
  }
  // Pilaster on its pedestal at the bay start.
  if (level === 'near') {
    span(b, mat, m, -g.D * 0.65, 0, zf - 0.18, g.D * 0.65, g.ped, zf + 0.02);
    column(b, { order: 'corinthian', D: g.D, height: g.colH, material: mat, detail: 'low', kind: 'pilaster', collide: false }, new THREE.Matrix4().makeTranslation(0, g.ped, zf));
  } else {
    span(b, mat, m, -g.D * 0.5, 0, zf - 0.12, g.D * 0.5, H - g.entH, zf);
  }
  // Three corbels and three velarium masts per bay (240 round the building).
  const yc = H * 0.62;
  const mastTop = H + 3.0;
  for (const f of [1 / 6, 1 / 2, 5 / 6]) {
    const x = bay * f;
    if (level !== 'low') span(b, mat, m, x - 0.16, yc - 0.32, zf - 0.38, x + 0.16, yc, zf + 0.02, false, level === 'near');
    const r = 0.13;
    const sides = level === 'near' ? 8 : level === 'mid' ? 5 : 3;
    const mast = new THREE.CylinderGeometry(r * 0.8, r, mastTop - yc, sides);
    mast.translate(x, (yc + mastTop) / 2, zf - 0.22);
    b.add(mast, 'wood', m);
  }
  return b;
}

/** One bay of the inner arcade (ring 2) at storey si (no columns; plain piers and arches). */
function innerBay(si: number, level: 'near' | 'mid', bay: number): MeshBuilder {
  const b = new MeshBuilder();
  const m = new THREE.Matrix4();
  const H = COLOS.storeyH[si];
  const d = R2[1] - R2[0];
  const spanW = bay * 0.62;
  const p2 = (bay - spanW) / 2;
  const crown = si === 0 ? 4.1 : 3.7;
  const spring = crown - spanW / 2;
  const top = si === 2 ? 4.2 : H; // the third storey is closed above by the summum seating
  span(b, 'travertine', m, -0.04, 0, -d / 2, p2, top, d / 2);
  span(b, 'travertine', m, bay - p2, 0, -d / 2, bay + 0.04, top, d / 2);
  b.add(archHead(spanW, spring, top, d, level === 'near' ? 10 : 4), 'travertine', new THREE.Matrix4().makeTranslation(bay / 2, 0, 0));
  if (level === 'near') {
    for (const zs of [-1, 1]) {
      span(b, 'travertine', m, p2 - 0.3, spring - 0.16, zs * d / 2 - 0.04, p2, spring, zs * d / 2 + 0.04, false, false);
      span(b, 'travertine', m, bay - p2, spring - 0.16, zs * d / 2 - 0.04, bay - p2 + 0.3, spring, zs * d / 2 + 0.04, false, false);
    }
  }
  return b;
}

// ---------------------------------------------------------------- the builder

export function buildColosseum(ctx: LandmarkContext) {
  const L = colosseumLayout();
  const { oval, ts } = L;
  const N = COLOS.bays;
  const sec = L.section;
  const high = ctx.detail === 'high';
  const root = new THREE.Group();
  // Visibility groups (see zoneVisibility): the outer shell, the ambulatory interiors, the bowl
  // (cavea, arena, boxes, passages) and the attic + velarium (always).
  const gOuter = new THREE.Group();
  const gInner = new THREE.Group();
  const gBowl = new THREE.Group();
  const gAttic = new THREE.Group();
  gOuter.name = 'colosseum:outer';
  gInner.name = 'colosseum:inner';
  gBowl.name = 'colosseum:bowl';
  gAttic.name = 'colosseum:attic';
  root.add(gOuter, gInner, gBowl, gAttic);
  const stat = new MeshBuilder(); // merged static parts of the outer shell
  const inner = new MeshBuilder(); // ambulatory vaults, floors, ring 3
  const cav = new MeshBuilder(); // the bowl
  const collide = new MeshBuilder(); // collider-only
  const spots: Spot[] = [];
  const readables: ReadableSpec[] = [];
  const I = new THREE.Matrix4();
  const two = Math.PI * 2;
  const tAt = (k: number) => (k < N ? ts[k] : ts[k - N] + two);
  // Bay chord frames on a ring.
  const chord = (k: number, x: number) => oval.chordFrame(tAt(k), tAt(k + 1), x);
  const W0 = L.bay;
  const instMatrix = (k: number, x: number, y: number, w0: number) => {
    const { m, len } = chord(k, x);
    return m.clone().multiply(new THREE.Matrix4().makeTranslation(0, y, 0)).multiply(new THREE.Matrix4().makeScale(len / w0, 1, 1));
  };
  // Anchor for LOD distance: the bay's facade centre at mid storey.
  const anchor = (k: number, x: number, y: number) => {
    const [px, pz] = oval.point(L.centres[k], x);
    return new THREE.Vector3(px, y, pz);
  };
  const near = 34;
  const mid = 190;

  // ---- facade storeys I–III (instanced, three levels)
  const facadeSets: LodSet[] = [];
  const hideSets: LodSet[] = []; // hidden from inside the bowl
  const ring2Sets: LodSet[] = [];
  let cippiSet: LodSet | null = null;
  for (let si = 0; si < 3; si++) {
    const y = SY[si];
    const mats = Array.from({ length: N }, (_, k) => instMatrix(k, XM, y, W0));
    const anchors = Array.from({ length: N }, (_, k) => anchor(k, XF, y + COLOS.storeyH[si] / 2));
    facadeSets[si] = lodInstances(ctx.game, gOuter, {
      name: `colosseum-facade-${si}`,
      matrices: mats,
      anchors,
      levels: [
        ...(high ? [{ builder: facadeBay(si, 'near', W0), maxDist: near }] : []),
        { builder: facadeBay(si, 'mid', W0), maxDist: mid },
        { builder: facadeBay(si, 'low', W0), maxDist: Infinity },
      ],
    });
  }
  // ---- attic (alternate window / shield bays)
  for (const variant of ['window', 'shield'] as const) {
    const ks = Array.from({ length: N }, (_, k) => k).filter((k) => (k % 2 === 1) === (variant === 'window'));
    lodInstances(ctx.game, gAttic, {
      name: `colosseum-attic-${variant}`,
      matrices: ks.map((k) => instMatrix(k, XM, SY[3], W0)),
      anchors: ks.map((k) => anchor(k, XF, SY[3] + 4)),
      levels: [
        ...(high ? [{ builder: facadeBay(3, 'near', W0, variant), maxDist: near * 1.2 }] : []),
        { builder: facadeBay(3, 'mid', W0, variant), maxDist: mid },
        { builder: facadeBay(3, 'low', W0, variant), maxDist: Infinity },
      ],
    });
  }
  // ---- statues in the arches of storeys II (marble) and III (bronze)
  for (const si of [1, 2]) {
    for (let v = 0; v < 3; v++) {
      const ks = Array.from({ length: N }, (_, k) => k).filter((k) => k % 3 === v && k % 20 !== 0);
      const body: MaterialId = si === 1 ? 'marble' : 'bronze';
      const mk = (level: 'near' | 'mid') => {
        const b = new MeshBuilder();
        statueGeometry(b, new THREE.Matrix4(), { level, variant: v + si, body, attr: si === 1 ? 'bronze' : 'gilded_bronze', plinth: 'travertine', scale: 1.22 });
        return b;
      };
      const g = storeyGeo(si, W0);
      hideSets.push(lodInstances(ctx.game, gOuter, {
        name: `colosseum-statues-${si}-${v}`,
        matrices: ks.map((k) => {
          const { m, len } = chord(k, XM);
          return m.clone().multiply(new THREE.Matrix4().makeTranslation(len / 2, SY[si] + g.ped * 0.92 + 0.08, -COLOS.wall / 2 + 0.3));
        }),
        anchors: ks.map((k) => anchor(k, XF, SY[si] + 2)),
        levels: [
          ...(high ? [{ builder: mk('near'), maxDist: 24 }] : []),
          { builder: mk('mid'), maxDist: mid * 0.8 },
        ],
        cullBeyond: true,
      }));
    }
  }
  // ---- inner arcade (ring 2), three storeys
  const XR2 = (R2[0] + R2[1]) / 2;
  const W2 = oval.perimeter(XR2) / N;
  for (let si = 0; si < 3; si++) {
    ring2Sets[si] = lodInstances(ctx.game, gOuter, {
      name: `colosseum-ring2-${si}`,
      matrices: Array.from({ length: N }, (_, k) => instMatrix(k, XR2, SY[si], W2)),
      anchors: Array.from({ length: N }, (_, k) => anchor(k, XR2, SY[si] + 3)),
      levels: [
        ...(high ? [{ builder: innerBay(si, 'near', W2), maxDist: 40 }] : []),
        { builder: innerBay(si, 'mid', W2), maxDist: si === 0 ? 160 : 260 },
      ],
      cullBeyond: true,
    });
  }

  // ---- colliders for the instanced ground-storey piers (facade and inner arcade)
  {
    const g0 = storeyGeo(0, W0);
    for (let k = 0; k < N; k++) {
      const { m } = chord(k, XM);
      solid(stat, m, -g0.pier / 2, 0, -COLOS.wall / 2, g0.pier / 2, SY[1], COLOS.wall / 2);
      const { m: m2, len: l2 } = chord(k, XR2);
      const p2 = (l2 - l2 * 0.62) / 2;
      solid(stat, m2, -p2, 0, -(R2[1] - R2[0]) / 2, p2, SY[1], (R2[1] - R2[0]) / 2);
    }
  }

  // ---- static rings: steps, entablatures, attic cornice, floors and vaults
  const tsLoop = (x: number, y: number) => oval.loop(ts, x, y);
  // A low travertine step round the base (with colliders: one box per bay).
  stat.add(ovalBand(oval, XF - 0.3, XF + 0.55, -0.5, 0.16, 0, two, 160, true), 'travertine', I);
  for (let k = 0; k < N; k++) {
    const { m, len } = chord(k, XF + 0.12);
    solid(stat, m, -0.02, -0.3, -0.43, len + 0.02, 0.16, 0.42);
  }
  for (let si = 0; si < 3; si++) {
    const g = storeyGeo(si, W0);
    const dtop = (g.D * ORDER_PROPORTIONS[g.order].topRatio) / 2;
    const yE = SY[si] + COLOS.storeyH[si] - g.entH;
    const path = tsLoop(XF + dtop, yE);
    entablature(stat, path, {
      order: g.order,
      columnHeight: g.colH,
      D: g.D,
      material: 'travertine',
      detail: 'low',
      depth: COLOS.wall / 2 + dtop,
      axial: W0,
      dims: { architrave: g.entH * 0.3, frieze: g.entH * 0.3, cornice: g.entH * 0.4 },
      sima: false,
    }, { closed: true });
  }
  // Attic cornice (the masts pass through it) and a plain top.
  {
    const g = storeyGeo(3, W0);
    const ch = g.entH;
    const c = corniceOnlyProfile('corinthian', ch * 0.75, 'low', COLOS.wall, false);
    const base = SY[4] - ch * 0.75;
    stat.add(sweep(c.profile, tsLoop(XF, base), { closed: true, back: true }), 'travertine', I);
    stat.add(ovalBand(oval, XI, XF, base - ch * 0.25, base, 0, two, 80, true), 'travertine', I);
    // Attic base moulding (string course over storey III's cornice).
    stat.add(ovalBand(oval, XF - 0.02, XF + 0.12, SY[3] + g.ped - 0.1, SY[3] + g.ped + 0.02, 0, two, 80, true), 'travertine', I);
  }
  // Floors of the upper ambulatories and barrel vaults over each ambulatory.
  const vault = (x0: number, x1: number, ySpring: number, mat: MaterialId) => {
    const w = x1 - x0;
    const pb = new ProfileBuilder(x1, ySpring);
    const n = 4;
    for (let i = 1; i <= n; i++) {
      const a = (Math.PI * i) / n;
      pb.to(x0 + w / 2 + (Math.cos(a) * w) / 2, ySpring + Math.sin(a) * w * 0.42);
    }
    // Traverse so the intrados faces down (into the corridor): reverse.
    const p = pb.build();
    p.pts.reverse();
    inner.add(ovalSweep(oval, p, 0, two, 80, { closed: true }), mat, I, { castShadow: false });
  };
  for (let si = 0; si < 3; si++) {
    const top = si === 2 ? sec.topY - 0.9 : SY[si + 1] - 0.15;
    for (const [x0, x1] of si === 2 ? [AMB1] : [AMB1, AMB2]) {
      vault(x0, x1, top - (x1 - x0) * 0.42, 'plaster_cream');
      // Haunch fill between vault and floor above.
      inner.add(ovalSweep(oval, new ProfileBuilder(x1, si === 2 ? sec.topY : SY[si + 1]).to(x0, si === 2 ? sec.topY : SY[si + 1]).build(), 0, two, 80, { closed: true }), 'concrete', I, { castShadow: false });
    }
    // Paved floor.
    const fy = SY[si] + (si === 0 ? 0.03 : 0);
    inner.add(ovalBand(oval, AMB2[0], si === 0 ? XF - 0.25 : XI, fy - 0.12, fy, 0, two, 96, true), si === 0 ? 'paving_travertine' : 'concrete', I, { castShadow: false });
  }
  // Ring 3 (inner wall of the inner ambulatory): solid except doors at stairs and passages; a
  // red-painted dado inside. Upper storeys: plain wall.
  const axial = (k: number) => k % 20 === 0;
  const VOM_BAYS = [10, 30, 50, 70];
  const boxBays = [20, 60];
  const gateBays = [0, 40];
  {
    const wallH = sec.walks[3].y - 0.2; // stays under the top balteus of the secundum
    for (let k = 0; k < N; k++) {
      const { m, len } = chord(k, (R3[0] + R3[1]) / 2);
      const d = R3[1] - R3[0];
      const door = axial(k) || VOM_BAYS.includes(k) || k % 5 === 0;
      if (!door) {
        span(inner, 'plaster_cream', m, -0.05, 0, -d / 2, len + 0.05, wallH, d / 2, true);
      } else {
        const dw = gateBays.includes(k) ? 3.6 : boxBays.includes(k) ? 2.4 : 1.6;
        const dh = gateBays.includes(k) ? 3.0 : 2.6;
        // Centre the door on the radial line through the bay centre (the passage behind it).
        const q = new THREE.Vector3(...((): [number, number, number] => {
          const [qx, qz] = oval.point(L.centres[k], (R3[0] + R3[1]) / 2);
          return [qx, 0, qz];
        })()).applyMatrix4(m.clone().invert());
        const x0 = q.x - dw / 2;
        span(inner, 'plaster_cream', m, -0.05, 0, -d / 2, x0, wallH, d / 2, true);
        span(inner, 'plaster_cream', m, x0 + dw, 0, -d / 2, len + 0.05, wallH, d / 2, true);
        span(inner, 'plaster_cream', m, x0, dh, -d / 2, x0 + dw, wallH, d / 2);
        if (!axial(k) && !VOM_BAYS.includes(k)) span(inner, 'black', m, x0, 0, d / 2 - 0.1, x0 + dw, dh, d / 2 + 0.02, true, false);
        span(inner, 'travertine', m, x0 - 0.12, dh, -d / 2 - 0.03, x0 + dw + 0.12, dh + 0.22, -d / 2 + 0.02, false, false);
      }
      // Painted dado on the ambulatory side (not across the doorways).
      if (!door) span(inner, 'plaster_red', m, -0.05, 0.05, -d / 2 - 0.02, len + 0.05, 1.3, -d / 2, false, false);
      else {
        const dw = gateBays.includes(k) ? 3.6 : boxBays.includes(k) ? 2.4 : 1.6;
        const [qx, qz] = oval.point(L.centres[k], (R3[0] + R3[1]) / 2);
        const qc = new THREE.Vector3(qx, 0, qz).applyMatrix4(m.clone().invert()).x;
        span(inner, 'plaster_red', m, -0.05, 0.05, -d / 2 - 0.02, qc - dw / 2, 1.3, -d / 2, false, false);
        span(inner, 'plaster_red', m, qc + dw / 2, 0.05, -d / 2 - 0.02, len + 0.05, 1.3, -d / 2, false, false);
      }
    }
    // The ring-3 wall continues above the ground storey as a plain band (seen through the arches).
  }
  // The underside of the summum seating over the third-storey inner ambulatory: seen from outside
  // through the arches of storeys III and ring 2 (the cavea itself is one-sided and hidden there).
  {
    const w3 = sec.walks[3];
    const xw = w3.wallX + 0.03;
    const r0 = sec.rows.find((r) => r.tier === 3 && r.row === 0)!;
    const yLow = r0.yPrev - 0.12;
    const yHigh = SY[2] + 4.2 - 0.25;
    const p = new ProfileBuilder(xw, SY[2]).to(xw, yLow).to(r0.x0, yLow).to(R2[0] + 0.05, Math.min(yHigh, yLow + (R2[0] - r0.x0) * 0.55)).build();
    inner.add(ovalSweep(oval, p, 0, two, 96, { closed: true }), 'concrete', I, { castShadow: false });
  }
  // Facade inner face above the ground storey and ring-2 back faces are part of the instanced bays.

  // ---- cavea
  const topColonnade = buildCavea(ctx, L, cav, collide, gBowl, spots, high);

  // ---- arena floor (sand over boards) with the hypogeum trapdoors
  {
    const shape = new THREE.Shape();
    const nA = 128;
    for (let i = 0; i < nA; i++) {
      const t = (i / nA) * two;
      const [x, z] = oval.point(t, 0.02);
      if (i === 0) shape.moveTo(x, -z);
      else shape.lineTo(x, -z);
    }
    const floor = new THREE.ShapeGeometry(shape, 1);
    floor.rotateX(-Math.PI / 2);
    floor.translate(0, 0.05, 0);
    cav.add(floor, 'sand', I, { castShadow: false });
    // The boards over the hypogeum's central corridor along the long axis (iron-strapped, nearly
    // flush with the sand) and two rows of square lift hatches over the cage shafts; every third
    // hatch is an open iron grating over the dark shaft (the hypogeum itself is a later dungeon).
    const yS = 0.05;
    span(cav, 'wood_dark', I, -COLOS.arenaA * 0.62, yS, -0.6, COLOS.arenaA * 0.62, yS + 0.018, 0.6, false, false);
    for (let i = -7; i <= 7; i++) span(cav, 'iron', I, i * 2.1 - 0.035, yS + 0.018, -0.6, i * 2.1 + 0.035, yS + 0.026, 0.6, false, false);
    for (const zs of [-1, 1]) {
      for (let i = -6; i <= 6; i++) {
        const x = i * 3.3;
        const z = zs * (3.2 + 0.9 * Math.cos((i / 7) * 1.2));
        if (Math.abs(x) / COLOS.arenaA + Math.abs(z) / COLOS.arenaB > 1.1) continue;
        const grate = (((i + (zs > 0 ? 1 : 0)) % 3) + 3) % 3 === 0;
        if (grate) {
          span(cav, 'black', I, x - 0.55, yS - 0.01, z - 0.55, x + 0.55, yS + 0.004, z + 0.55, false, false);
          for (let j = -4; j <= 4; j++) span(cav, 'iron', I, x - 0.55, yS + 0.004, z + j * 0.12 - 0.018, x + 0.55, yS + 0.02, z + j * 0.12 + 0.018, false, false);
        } else {
          span(cav, 'wood_dark', I, x - 0.58, yS, z - 0.58, x + 0.58, yS + 0.014, z + 0.58, false, false);
          for (const j of [-0.3, 0.3]) span(cav, 'iron', I, x - 0.58, yS + 0.014, z + j - 0.03, x + 0.58, yS + 0.02, z + j + 0.03, false, false);
        }
        // Iron frame round each opening.
        for (const sz of [-1, 1]) span(cav, 'iron', I, x - 0.62, yS, z + sz * 0.6 - 0.035, x + 0.62, yS + 0.022, z + sz * 0.6 + 0.035, false, false);
        for (const sx of [-1, 1]) span(cav, 'iron', I, x + sx * 0.6 - 0.035, yS, z - 0.6, x + sx * 0.6 + 0.035, yS + 0.022, z + 0.6, false, false);
      }
    }
    spots.push({ id: 'colos-arena-center', kind: 'spawn', position: new THREE.Vector3(0, 0.05, 0), heading: 0 });
    spots.push({ id: 'colos-hypogeum-hatch', kind: 'door', position: new THREE.Vector3(COLOS.arenaA * 0.45, 0.06, 0), heading: -Math.PI / 2 });
  }

  // ---- long-axis passages (Porta Triumphalis W = bay 40, Libitinensis E = bay 0) onto the sand
  for (const k of gateBays) {
    const t = k === 0 ? 0 : Math.PI;
    const fr = oval.radialFrame(t, XF + 0.2); // +z inward along the axis
    const len = XF + 0.2;
    const hw = 1.8;
    const h = 2.95;
    // Side walls from ring 3 to the arena, ceiling slab, sand floor.
    const zIn = XF + 0.2 - R3[1];
    span(cav, 'brick', fr, -hw - 0.6, 0, zIn, -hw, h + 0.3, len - 0.05, true);
    span(cav, 'brick', fr, hw, 0, zIn, hw + 0.6, h + 0.3, len - 0.05, true);
    span(cav, 'concrete', fr, -hw - 0.6, h - 0.05, zIn, hw + 0.6, COLOS.podium - 0.02, len - 0.05, true, false);
    span(cav, 'plaster_white', fr, -hw - 0.01, h - 0.02, zIn, hw + 0.01, h, len - 0.2, false, false);
    span(cav, 'sand', fr, -hw, 0.0, 0.5, hw, 0.05, len, false, false);
    // Painted dado in the passage.
    for (const sx of [-1, 1]) span(cav, 'plaster_red', fr, sx * hw - sx * 0.02, 0.05, zIn, sx * hw, 1.2, len - 0.3, false, false);
    // Gate leaves (iron-bound timber) swung open against the walls at the arena mouth.
    for (const sx of [-1, 1]) {
      const leaf = fr.clone().multiply(new THREE.Matrix4().makeTranslation(sx * (hw - 0.12), 0, len - 1.0)).multiply(new THREE.Matrix4().makeRotationY(sx * 0.08));
      span(cav, 'wood_dark', leaf, -0.05, 0.05, -0.9, 0.05, 2.9, 0.9);
      for (const yy of [0.5, 1.5, 2.5]) span(cav, 'iron', leaf, -0.07, yy, -0.9, 0.07, yy + 0.08, 0.9, false, false);
    }
    const name = k === 40 ? 'porta-triumphalis' : 'porta-libitinensis';
    spots.push({ id: `colos-${name}`, kind: 'door', position: new THREE.Vector3().setFromMatrixPosition(fr.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.05, len - 1.5))), heading: t === 0 ? -Math.PI / 2 : Math.PI / 2 });
  }

  // ---- axial porches on the four main entrances, dedicatory inscription over the west one
  for (const k of [0, 20, 40, 60]) {
    const t = L.centres[k];
    const fr = oval.radialFrame(t, XF); // origin on the facade, +z inward, facade faces −z
    const pw = 3.6;
    const pd = 1.7;
    const ph = 4.4; // column height (base at 0.2)
    const colD = 0.42;
    const yA = ph + 0.2; // architrave bottom
    const yT = yA + 1.25; // entablature top (architrave, inscribed frieze, cornice)
    for (const sx of [-1, 1]) {
      column(stat, { order: 'corinthian', D: colD, height: ph, material: 'marble', detail: 'low', kind: 'free', collide: true }, fr.clone().multiply(new THREE.Matrix4().makeTranslation((sx * pw) / 2, 0.2, -pd)));
      span(stat, 'marble', fr, (sx * pw) / 2 - 0.36, 0, -pd - 0.36, (sx * pw) / 2 + 0.36, 0.2, -pd + 0.36, true);
      // Responding pilaster strip on the facade.
      span(stat, 'marble', fr, (sx * pw) / 2 - 0.3, 0, -0.12, (sx * pw) / 2 + 0.3, yA, 0.0);
    }
    // Entablature: architrave, a tall frieze (the dedication on the west porch), cornice.
    span(stat, 'marble', fr, -pw / 2 - 0.4, yA, -pd - 0.32, pw / 2 + 0.4, yA + 0.28, 0.05);
    span(stat, 'marble', fr, -pw / 2 - 0.4, yA + 0.28, -pd - 0.26, pw / 2 + 0.4, yT - 0.22, 0.05);
    span(stat, 'marble', fr, -pw / 2 - 0.55, yT - 0.22, -pd - 0.5, pw / 2 + 0.55, yT, 0.05);
    const ped = extrudePolygon([[-pw / 2 - 0.5, 0], [pw / 2 + 0.5, 0], [0, 0.95]], pd + 0.5);
    stat.add(ped, 'marble', fr.clone().multiply(new THREE.Matrix4().makeTranslation(0, yT, 0.05)));
    const roof = extrudePolygon([[-pw / 2 - 0.62, -0.06], [pw / 2 + 0.62, -0.06], [0, 1.02]], pd + 0.4);
    stat.add(roof, 'roof_tile', fr.clone().multiply(new THREE.Matrix4().makeTranslation(0, yT + 0.03, 0.0)));
    if (k === 20) {
      // Imperial entrance: gilded bronze statue on the pediment.
      statueGeometry(stat, fr.clone().multiply(new THREE.Matrix4().makeTranslation(0, yT + 0.75, -pd * 0.55)), { level: 'near', variant: 0, body: 'gilded_bronze', attr: 'gilded_bronze', plinth: 'marble', scale: 1.0 });
    }
    if (k === 40) {
      // Dedication (Alföldy's reading of the dowel holes, CIL VI 40454a), gilded bronze letters.
      if (typeof document !== 'undefined') {
        inscriptionPanel(
          stat,
          { lines: ['Imp T Caes Vespasianus Aug', 'Amphitheatrum Novum', 'Ex Manubis Fieri Iussit'], width: pw + 0.5, height: 0.72, style: 'bronze', sizes: [1, 0.95, 0.95] },
          fr.clone().multiply(new THREE.Matrix4().makeTranslation(0, yA + 0.28 + (yT - 0.22 - yA - 0.28) / 2, -pd - 0.27)),
          { depth: 0.02 },
        );
      }
      const p = new THREE.Vector3().setFromMatrixPosition(fr.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.05, -pd - 5)));
      spots.push({ id: 'colos-inscription', kind: 'inscription', position: p, heading: Math.PI / 2 });
      readables.push({
        id: 'colos-inscription',
        at: new THREE.Vector3().setFromMatrixPosition(fr.clone().multiply(new THREE.Matrix4().makeTranslation(0, yA + 0.28 + (yT - 0.22 - yA - 0.28) / 2, -pd - 0.3))),
        reach: 8,
        title: 'Dedication of the Amphitheatre',
        text: 'IMP · T · CAES · VESPASIANVS · AVG / AMPHITHEATRVM · NOVVM / EX · MANVBIS · FIERI · IVSSIT\n\n*The Emperor Titus Caesar Vespasian Augustus ordered the new amphitheatre to be built from the spoils of war.*\n\nGilded bronze letters pinned into the marble of the west porch. The spoils were Judaea\'s: the Temple of Jerusalem, sacked forty-three years ago, paid for these walls.',
      });
      spots.push({ id: 'colos-spawn-west', kind: 'spawn', position: new THREE.Vector3().setFromMatrixPosition(fr.clone().multiply(new THREE.Matrix4().makeTranslation(2.5, 0.05, -9))), heading: Math.PI / 2 });
    }
  }

  // ---- carved entrance numbers over the 76 numbered ground-floor arches
  {
    const nm = numeralMaterial();
    const g0 = storeyGeo(0, W0);
    const geos: THREE.BufferGeometry[] = [];
    for (let k = 0; k < N; k++) {
      const num = L.numberOf(k);
      if (!num) continue;
      const { m, len } = chord(k, XM);
      const q = uvQuad(1.0, 0.4, numeralUV(num));
      q.applyMatrix4(m.clone().multiply(new THREE.Matrix4().makeTranslation(len / 2, g0.crown + 0.62, -COLOS.wall / 2 - 0.012)));
      geos.push(q);
    }
    for (const g of geos) stat.add(g, nm, I, { uv: 'keep', castShadow: false });
  }

  // ---- plaza: travertine paving to the cippi ring, the cippi themselves
  {
    const ground = (x: number, z: number) => ctx.groundAt(x, z);
    ovalPaving(stat, oval, XF + 0.85, XF + COLOS.cippi + 1.6, 160, 4, ground, 'paving_travertine', 0.05, -0.05);
    const cipT = oval.equalArc(N * 2, XF + COLOS.cippi, 0.25);
    const cip = new MeshBuilder();
    const cb = new MeshBuilder();
    // A travertine bollard 1.75 m tall with a rounded top and an iron ring.
    cb.add(new THREE.BoxGeometry(0.55, 1.5, 0.45), 'travertine', new THREE.Matrix4().makeTranslation(0, 0.75, 0));
    const cap = new THREE.CylinderGeometry(0.275, 0.275, 0.45, 8, 1, false, 0, Math.PI);
    cap.rotateZ(Math.PI / 2);
    cap.rotateY(Math.PI / 2);
    cb.add(cap, 'travertine', new THREE.Matrix4().makeTranslation(0, 1.5, 0));
    const cmats: THREE.Matrix4[] = [];
    for (const t of cipT) {
      const [px, pz] = oval.point(t, XF + COLOS.cippi);
      const y = ground(px, pz);
      const fr = oval.radialFrame(t, XF + COLOS.cippi);
      fr.setPosition(px, y - 0.05, pz);
      cmats.push(fr);
      cip.collider({ kind: 'box', center: new THREE.Vector3(px, y + 0.85, pz), half: new THREE.Vector3(0.3, 0.9, 0.3) });
    }
    cippiSet = lodInstances(ctx.game, gOuter, { name: 'colosseum-cippi', matrices: cmats, levels: [{ builder: cb, maxDist: 420 }], cullBeyond: true });
    for (const c of cip.colliders) stat.collider(c);
    plazaLife(L, stat, ground, spots, high);
    [38, 42, 18, 22].forEach((k, i) => {
      const t = L.centres[k];
      const [px, pz] = oval.point(t, XF + 1.6);
      const [nx, nz] = oval.normal(t);
      spots.push({ id: `colos-tessera-${i + 1}`, kind: 'npc', position: new THREE.Vector3(px, Math.max(0, ground(px, pz)) + 0.05, pz), heading: Math.atan2(nx, nz) });
    });
  }

  // ---- the velarium: canvas strips on ropes from the 240 masts towards an open oval over the
  //      sand, anchored by ropes down to the cippi. Exposed as object.userData.velarium (toggle).
  const velarium = buildVelarium(L, ctx.groundAt);
  gAttic.add(velarium);
  root.userData.velarium = velarium;

  // Merge static parts into their groups.
  gOuter.add(stat.build('colosseum:static'));
  gInner.add(inner.build('colosseum:inner'));
  gBowl.add(cav.build('colosseum:cavea'));

  // Zone visibility: from inside the bowl the outer shell, the ambulatories and the cippi can't be
  // seen; from outside below the rim the bowl can't be seen; far away the interiors drop out.
  const zone = zoneVisibility(L, root, { gOuter, gInner, gBowl, facadeSets, hideSets, ring2Sets, topColonnade, cippi: cippiSet! });
  const sys = instanceLod(ctx.game);
  if (sys) sys.hook((_dt, _t, cam) => zone(cam));

  addReadables(ctx.game, root, readables);
  const colliders = [...stat.colliders, ...inner.colliders, ...cav.colliders, ...collide.colliders];
  return { object: root, colliders, spots, far: buildFar(L), cullDistance: 1500 };
}

// ---------------------------------------------------------------- the plaza

/**
 * Life on the travertine ring round the building on an ordinary morning: eight sellers' pitches
 * between the axial entrances (sausages and chickpeas over braziers, cushions to hire for the stone
 * seats, wine, clay lamps with gladiators on them), the Misenum sailors' rope coils by the cippi,
 * and torch brackets beside the four axial porches. Props only at high detail; spots always.
 */
function plazaLife(L: ColosseumLayout, stat: MeshBuilder, ground: (x: number, z: number) => number, spots: Spot[], high: boolean) {
  const { oval } = L;
  const rng = new Rng('colosseum-plaza');
  const D0 = new Draw(stat);
  const floorAt = (x: number, z: number) => Math.max(ground(x, z), -0.05) + 0.05;
  /** Landmark-local point at bay parameter t, ring offset X, `along` metres along the tangent. */
  const at = (t: number, X: number, along: number): [number, number, number, number] => {
    const [px, pz] = oval.point(t, X);
    const [nx, nz] = oval.normal(t);
    const x = px - nz * along;
    const z = pz + nx * along;
    return [x, floorAt(x, z), z, Math.atan2(nx, nz)];
  };
  const put = (kind: PropKind, t: number, X: number, along: number, rot = 0, opts: { variant?: number; collide?: boolean; scale?: number } = {}) => {
    if (!high) return;
    const [x, y, z, yaw] = at(t, X, along);
    placeProp(D0, kind, x, y, z, yaw + rot, { rng, ...opts });
  };
  const box = (mat: MaterialId, t: number, X: number, along: number, w: number, h: number, dd: number, y0 = 0) => {
    if (!high) return;
    const [x, y, z, yaw] = at(t, X, along);
    D0.at(x, y + y0, z, yaw).span(mat, -w / 2, 0, -dd / 2, w / 2, h, dd / 2);
  };
  const Xs = XF + COLOS.cippi * 0.5;
  const kinds = ['food', 'cushions', 'wine', 'lamps'] as const;
  [5, 15, 25, 35, 45, 55, 65, 75].forEach((k, i) => {
    const t = L.centres[k];
    const kind = kinds[i % kinds.length];
    const [vx, vy, vz, vyaw] = at(t, Xs + 0.4, 0);
    spots.push({ id: `colos-vendor-${i + 1}`, kind: 'vendor', position: new THREE.Vector3(vx, vy, vz), heading: vyaw + Math.PI });
    switch (kind) {
      case 'food':
        put('stall_fruit', t, Xs + 1.4, 0, Math.PI);
        put('brazier', t, Xs - 0.4, 1.6);
        put('table', t, Xs - 0.4, -1.4, 0.2);
        put('amphora_tall', t, Xs + 1.0, 2.1, 0.4);
        put('stool', t, Xs + 0.6, -2.4, 1.1, { variant: 2 });
        break;
      case 'cushions':
        put('table', t, Xs, 0, 0);
        // Stacks of hired cushions (red and saffron wool) for the stone seats.
        for (let s = 0; s < 4; s++) {
          box(s % 2 ? 'fabric_ochre' : 'fabric_red', t, Xs + 0.1, -1.6, 0.55, 0.12, 0.4, s * 0.12);
          box(s % 2 ? 'fabric_red' : 'fabric_purple', t, Xs + 0.1, 1.6, 0.55, 0.12, 0.4, s * 0.12);
        }
        put('bench', t, Xs + 1.6, 0, Math.PI);
        break;
      case 'wine':
        put('amphora_stack', t, Xs + 1.0, -1.2, 0.3);
        put('amphora_rack', t, Xs + 1.3, 1.0, Math.PI);
        put('handcart', t, Xs - 0.8, 2.6, 1.2);
        break;
      case 'lamps':
        put('stall_pottery', t, Xs + 1.4, 0, Math.PI);
        put('basket', t, Xs + 0.2, 1.7);
        put('crate', t, Xs + 0.5, -1.8, 0.5);
        break;
    }
  });
  // The sailors who rig the awning: coils of rope and a chest by the bollards, four places.
  [9, 29, 49, 69].forEach((k, i) => {
    const t = L.centres[k];
    const X = XF + COLOS.cippi - 1.4;
    const [x, y, z, yaw] = at(t, X, 0);
    spots.push({ id: `colos-sailor-${i + 1}`, kind: 'npc', position: new THREE.Vector3(x, y, z), heading: yaw + Math.PI });
    if (!high) return;
    for (const [along, n] of [[1.0, 3], [1.9, 2]] as const) {
      const [cx, cy, cz] = at(t, X + 0.3, along);
      for (let s = 0; s < n; s++) {
        const coil = new THREE.TorusGeometry(0.34, 0.075, 5, 14);
        coil.rotateX(Math.PI / 2);
        coil.translate(cx, cy + 0.075 + s * 0.13, cz);
        stat.add(coil, 'fabric_ochre', undefined, { castShadow: true });
      }
    }
    put('crate', t, X + 0.4, -1.2, 0.2);
  });
  // Torch brackets either side of the four axial porches (lit at night by the sky module's lamps).
  if (high) {
    for (const k of [0, 20, 40, 60]) {
      for (const s of [-1, 1]) {
        const t = L.centres[k] + (s * 2.6) / speedAt(oval, L.centres[k], XF);
        const [px, pz] = oval.point(t, XF + 0.02);
        const [nx, nz] = oval.normal(t);
        placeProp(D0, 'torch_bracket', px, 2.7, pz, Math.atan2(-nx, -nz), { rng, collide: false });
      }
    }
  }
}

// ---------------------------------------------------------------- cavea

interface Cut {
  t: number;
  /** Half width (m) of the cut. */
  hw: number;
  /** Which segments it removes. */
  hits(s: CaveaSeg, i: number): boolean;
}

/** Complement (in [t, t + 2π)) of a set of cut ranges; null when there are no cuts. */
export function complementRanges(cuts: { t0: number; t1: number }[]): { t0: number; t1: number }[] | null {
  if (!cuts.length) return null;
  const two = Math.PI * 2;
  const cs = cuts
    .map((c) => {
      const w = c.t1 - c.t0;
      const t0 = ((c.t0 % two) + two) % two;
      return { t0, t1: t0 + w };
    })
    .sort((a, b) => a.t0 - b.t0);
  const m: { t0: number; t1: number }[] = [];
  for (const c of cs) {
    const last = m[m.length - 1];
    if (last && c.t0 <= last.t1) last.t1 = Math.max(last.t1, c.t1);
    else m.push({ ...c });
  }
  while (m.length > 1 && m[m.length - 1].t1 >= m[0].t0 + two) {
    const last = m.pop()!;
    m[0] = { t0: last.t0 - two, t1: Math.max(m[0].t1, last.t1 - two) };
  }
  const out: { t0: number; t1: number }[] = [];
  for (let i = 0; i < m.length; i++) {
    const t0 = m[i].t1;
    const t1 = i + 1 < m.length ? m[i + 1].t0 : m[0].t0 + two;
    if (t1 - t0 > 1e-4) out.push({ t0, t1 });
  }
  return out;
}

function speedAt(oval: Oval, t: number, x: number): number {
  const e = 1e-3;
  const a = oval.point(t - e, x);
  const c = oval.point(t + e, x);
  return Math.hypot(c[0] - a[0], c[1] - a[1]) / (2 * e);
}

function buildCavea(ctx: LandmarkContext, L: ColosseumLayout, cav: MeshBuilder, collideOut: MeshBuilder, root: THREE.Group, spots: Spot[], high: boolean): LodSet {
  const { oval, section: sec } = L;
  const two = Math.PI * 2;
  const I = new THREE.Matrix4();
  const tiers = CAVEA_TIERS;
  const wallSegIndex = (tier: number) => sec.segs.findIndex((s) => s.tier === tier && s.role === 'wall');
  const capSegIndex = (tier: number) => sec.segs.findIndex((s) => s.tier === tier && s.role === 'cap');
  const cuts: Cut[] = [];
  // Long-axis gates: podium face only.
  for (const t of [0, Math.PI]) cuts.push({ t, hw: 1.8, hits: (s) => s.role === 'podium' });
  // Boxes on the short axis: everything from the podium face to the first balteus cap.
  const boxDepth = sec.walks[1].wallX + tiers[1].cap;
  for (const t of [Math.PI / 2, (3 * Math.PI) / 2]) cuts.push({ t, hw: 4.0, hits: (s) => s.x1 <= boxDepth + 1e-6 && s.role !== 'podium' });
  // Vomitoria: walkable at the diagonals of the primum, decorative elsewhere (primum + imum).
  const vomT = (k: number) => L.centres[k];
  const vomWalk = [10, 30, 50, 70].map(vomT);
  const vomDeco1 = [5, 15, 25, 35, 45, 55, 65, 75].map(vomT);
  const vomDeco2 = [5, 10, 15, 25, 30, 35, 45, 50, 55, 65, 70, 75].map(vomT);
  const mouth = (tier: number, nRows: number) => (s: CaveaSeg, i: number) => i === wallSegIndex(tier) || i === capSegIndex(tier) || (s.tier === tier && s.role === 'row' && s.row < nRows);
  for (const t of [...vomWalk, ...vomDeco1]) cuts.push({ t, hw: 0.8, hits: mouth(1, 4) });
  for (const t of vomDeco2) cuts.push({ t, hw: 0.8, hits: mouth(2, 4) });

  // Collider geometry (one trimesh) gathers every swept tread/riser.
  const colGeo: THREE.BufferGeometry[] = [];
  sec.segs.forEach((s, i) => {
    const x = s.kind === 'riser' ? s.x0 : (s.x0 + s.x1) / 2;
    const my = cuts.filter((c) => c.hits(s, i));
    const ranges = my.map((c) => {
      const dt = c.hw / speedAt(oval, c.t, x);
      return { t0: c.t - dt, t1: c.t + dt };
    });
    // Profile (traversed so faces point up / towards the arena).
    const prof =
      s.kind === 'riser'
        ? new ProfileBuilder(s.x0, s.y1).to(s.x0, s.y0).build()
        : new ProfileBuilder(s.x1, s.y0).to(s.x0, s.y0).build();
    const per = oval.perimeter(x, 256);
    const iv = complementRanges(ranges);
    const geos: THREE.BufferGeometry[] = [];
    if (!iv) {
      geos.push(ovalSweep(oval, prof, 0, two, Math.max(48, Math.round(per / 1.6)), { closed: true }));
    } else {
      for (const r of iv) {
        const n = Math.max(2, Math.round(((r.t1 - r.t0) / two) * per / 1.6));
        geos.push(ovalSweep(oval, prof, r.t0, r.t1, n));
      }
    }
    for (const g of geos) {
      cav.add(g, s.mat, I, { castShadow: s.kind === 'riser' && s.y1 - s.y0 > 1 });
      colGeo.push(g);
    }
  });
  // One trimesh collider for the whole seating surface.
  {
    let total = 0;
    for (const g of colGeo) total += g.getAttribute('position').count;
    const arr = new Float32Array(total * 3);
    let o = 0;
    for (const g of colGeo) {
      const p = g.getAttribute('position').array as Float32Array;
      arr.set(p, o);
      o += p.length;
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    cav.collider({ kind: 'trimesh', geometry: cg });
  }
  // Podium balustrade (with colliders, gaps at the boxes) and the bronze rail.
  {
    const P = COLOS.podium;
    const segs = 96;
    const boxDt = 4.2 / speedAt(oval, Math.PI / 2, 0.2);
    const ranges = [
      { t0: Math.PI / 2 + boxDt, t1: (3 * Math.PI) / 2 - boxDt },
      { t0: (3 * Math.PI) / 2 + boxDt, t1: Math.PI / 2 - boxDt + two },
    ];
    for (const r of ranges) {
      const n = Math.round((segs * (r.t1 - r.t0)) / two);
      cav.add(ovalSweep(oval, new ProfileBuilder(0.05, P).to(0.35, P).to(0.35, P + 0.95).to(0.32, P + 1.0).to(0.05, P + 1.0).to(0.05, P).build(), r.t0, r.t1, n, { caps: true }), 'marble', I);
      cav.add(ovalBand(oval, 0.16, 0.24, P + 1.0, P + 1.32, r.t0, r.t1, n), 'bronze', I);
      // Colliders: chord boxes along the balustrade, from the arena floor up (podium + rail).
      for (let i = 0; i < n; i++) {
        const t0 = r.t0 + ((r.t1 - r.t0) * i) / n;
        const t1 = r.t0 + ((r.t1 - r.t0) * (i + 1)) / n;
        const { m, len } = oval.chordFrame(t0, t1, 0.2);
        solid(collideOut, m, -0.05, P - 0.1, -0.35, len + 0.05, P + 1.35, 0.15);
      }
    }
    // Marble cornice on the podium face and a painted band at its foot.
    const cornice = new ProfileBuilder(-0.02, P - 0.32).to(0.0, P - 0.32).to(0.0, P - 0.24).to(-0.1, P - 0.16).to(-0.18, P - 0.02).to(-0.18, P).to(0.2, P).build();
    cornice.pts.reverse();
    cav.add(ovalSweep(oval, cornice, 0, two, 128, { closed: true }), 'marble', I);
    cav.add(ovalBand(oval, -0.03, 0.0, 0.05, 0.75, 0, two, 128, true), 'plaster_red', I, { castShadow: false });
    // Marble revetment articulated by veined pilaster strips, and a painted frieze of hunt scenes
    // (a red band with a dark border) under the cornice.
    cav.add(ovalBand(oval, -0.025, 0.0, P - 0.95, P - 0.4, 0, two, 128, true), 'stucco_painted', I, { castShadow: false });
    for (const tt of oval.equalArc(64, 0, 0.5)) {
      if (Math.abs(Math.sin(tt)) < 0.06 || Math.abs(Math.cos(tt)) < 0.12) continue;
      const fr = oval.radialFrame(tt, 0);
      span(cav, 'marble_veined', fr, -0.32, 0.75, -0.02, 0.32, P - 0.95, 0.06, false, false);
    }
  }
  // Lintels over the gates (the podium face is cut there).
  for (const t of [0, Math.PI]) {
    const fr = oval.radialFrame(t, 0);
    span(cav, 'marble', fr, -2.0, 2.95, -0.45, 2.0, COLOS.podium, 0.0);
  }

  // ---- aisles (scalaria): half steps on every row, flights up each balteus wall
  const aisleKs: number[] = [];
  for (let k = 0; k < 80; k += 5) aisleKs.push(k + 2.5);
  const aisleT = aisleKs.map((k) => {
    const lo = Math.floor(k);
    return (L.centres[lo] + (lo + 1 < 80 ? L.centres[lo + 1] : L.centres[0] + two)) / 2;
  });
  for (const t of aisleT) {
    const fr = oval.radialFrame(t, 0); // +z inward → steps climb towards −z (outward)
    const W = 1.0;
    for (const r of sec.rows) {
      if (r.tier === 3) continue; // the summum is reached from its own vomitoria
      const d = (r.x1 - r.x0) / 2;
      // local z = −x (radial outward is −z)
      span(cav, r.tier === 0 ? 'marble' : 'travertine', fr, -W / 2, r.yPrev, -(r.x0), W / 2, (r.yPrev + r.y) / 2, -(r.x0 - d), true, false);
    }
    for (const w of sec.walks) {
      if (w.tier === 0 || w.tier === 3) continue;
      const tier = tiers[w.tier];
      const { count, rise } = risers(tier.wall, 0.21);
      const run = 0.34;
      for (let i = 0; i < count; i++) {
        const z0 = -(w.wallX - (count - i) * run);
        span(cav, 'travertine', fr, -W / 2, w.y, z0, W / 2, w.y + (i + 1) * rise, -(w.wallX + 0.01), true, false);
      }
    }
  }

  // ---- vomitoria mouths (cheeks, lintel, dark passage) and the four walkable stairs
  const mouthAt = (t: number, tier: number, walkable: boolean) => {
    const w = sec.walks[tier];
    const fr = oval.radialFrame(t, 0);
    const hw = 0.8;
    const y0 = w.y;
    const rowsHere = sec.rows.filter((r) => r.tier === tier);
    const xFront = w.wallX; // balteus wall face
    const xBack = rowsHere[3].x1; // behind the four cut rows
    const lintelTop = rowsHere[3].y; // flush with the cut fourth row's tread
    const lintel = Math.min(y0 + 2.75, lintelTop - 0.2);
    // Cheeks (side parapets) and lintel.
    for (const sx of [-1, 1]) {
      span(cav, 'marble', fr, sx * hw, y0, -xFront, sx * (hw + 0.35), lintelTop + 0.45, -xBack, true);
    }
    span(cav, 'marble', fr, -hw, lintel, -xFront, hw, lintelTop, -xBack, true);
    if (!walkable) {
      span(cav, 'black', fr, -hw, y0, -(xBack - 0.05), hw, lintelTop, -(xBack + 0.4), true, false);
      span(cav, 'concrete', fr, -hw, y0 - 0.05, -xFront, hw, y0, -xBack, false, false);
      return;
    }
    // Walkable: a passage from ring 3 at ground level climbing to the balteus.
    const H = y0;
    const { count, rise } = risers(H, 0.2);
    const run = 0.34;
    const zTop = -xBack; // top of the flight at the mouth's back
    const zBot = zTop + count * run; // further in-ring (towards ring 3) = +z? No: outward is −z.
    void zBot;
    // Flight climbs from the outside (−z, larger x) towards the arena (+z): steps at x = xBack + i·run.
    for (let i = 0; i < count; i++) {
      const xa = xBack + (count - i) * run;
      const xb = xBack + (count - i - 1) * run;
      span(cav, 'travertine', fr, -hw, 0, -xa, hw, (i + 1) * rise, -xb, true, false);
    }
    // Landing at the top under the lintel to the balteus.
    span(cav, 'travertine', fr, -hw, 0, -xBack, hw, H, -xFront, true, false);
    // Corridor at ground level from ring 3 to the foot of the flight.
    const xFoot = xBack + count * run;
    span(cav, 'paving_travertine', fr, -hw, 0, -R3[0], hw, 0.04, -xFoot, false, false);
    // Walls and ceiling of the passage.
    for (const sx of [-1, 1]) span(cav, 'brick', fr, sx * hw, 0, -R3[0], sx * (hw + 0.4), H + 3.0, -xBack, true);
    // Sloped ceiling over the flight + flat over the corridor (≥ 2.8 m headroom: the controller's
    // autostep probes 0.45 m above the capsule).
    const slope = Math.atan2(H, count * run);
    const ceilLen = Math.hypot(H, count * run);
    const cm = fr.clone().multiply(new THREE.Matrix4().makeTranslation(0, H / 2 + 3.05, -(xBack + (count * run) / 2))).multiply(new THREE.Matrix4().makeRotationX(-slope));
    cav.box('plaster_cream', hw * 2 + 0.8, 0.3, ceilLen - 0.4, cm, { collide: true, castShadow: false });
    span(cav, 'plaster_cream', fr, -hw - 0.4, 2.9, -R3[0], hw + 0.4, 3.2, -xFoot, true, false);
    spots.push({ id: `colos-vomitorium-${spots.filter((s) => s.id.startsWith('colos-vomitorium')).length + 1}`, kind: 'door', position: new THREE.Vector3().setFromMatrixPosition(fr.clone().multiply(new THREE.Matrix4().makeTranslation(0, H + 0.05, -(w.x0 + w.x1) / 2))), heading: 0 });
  };
  for (const t of vomWalk) mouthAt(t, 1, true);
  for (const t of vomDeco1) mouthAt(t, 1, false);
  for (const t of vomDeco2) mouthAt(t, 2, false);
  // Doors in the high wall of the summum (dark openings) — upper vomitoria.
  {
    const w = sec.walks[3];
    for (let k = 2.5; k < 80; k += 5) {
      const t = (L.centres[Math.floor(k)] + L.centres[(Math.floor(k) + 1) % 80] + (Math.floor(k) + 1 >= 80 ? two : 0)) / 2;
      const fr = oval.radialFrame(t, 0);
      span(cav, 'black', fr, -0.7, w.y, -(w.wallX - 0.01), 0.7, w.y + 2.1, -(w.wallX + 0.02), false, false);
      span(cav, 'marble', fr, -0.82, w.y + 2.1, -(w.wallX - 0.05), 0.82, w.y + 2.25, -(w.wallX + 0.01), false, false);
    }
  }

  // ---- imperial box (S, bay 20) and editor's box (N, bay 60)
  for (const [t, imperial] of [[Math.PI / 2, true], [(3 * Math.PI) / 2, false]] as const) {
    const fr = oval.radialFrame(t, 0);
    const P = COLOS.podium;
    const hw = 4.0;
    const back = boxDepth;
    // Platform (floor at the podium level) and the solid block beneath, flush with the podium face.
    span(cav, 'marble', fr, -hw, 0, -back, hw, P, 0.0, true);
    span(cav, imperial ? 'porphyry' : 'marble_giallo', fr, -hw + 0.5, P, -back + 0.5, hw - 0.5, P + 0.02, -0.9, false, false);
    // Front parapet (marble with a bronze rail) — low enough to look over.
    span(cav, 'marble', fr, -hw, P, -0.45, hw, P + 1.0, 0.0, true);
    span(cav, imperial ? 'gilded_bronze' : 'bronze', fr, -hw + 0.1, P + 1.0, -0.3, hw - 0.1, P + 1.06, -0.12, false, false);
    // Side walls where the cut seating would show; open to the podium terrace at the front.
    const tw = sec.walks[0].x1; // terrace width
    for (const sx of [-1, 1]) {
      span(cav, 'marble', fr, sx * hw, P, -back - 0.3, sx * (hw + 0.35), P + 3.0, -tw, true);
      span(cav, imperial ? 'plaster_red' : 'stucco_painted', fr, sx * (hw - 0.01), P + 0.9, -back + 0.1, sx * hw, P + 2.6, -tw - 0.2, false, false);
    }
    // Back wall with the door from the stair (painted panels).
    span(cav, 'marble', fr, -hw, P, -back - 0.3, -0.8, P + 3.6, -back, true);
    span(cav, 'marble', fr, 0.8, P, -back - 0.3, hw, P + 3.6, -back, true);
    span(cav, 'marble', fr, -0.8, P + 2.5, -back - 0.3, 0.8, P + 3.6, -back);
    span(cav, imperial ? 'plaster_red' : 'stucco_painted', fr, -hw + 0.3, P + 0.6, -back + 0.01, -1.1, P + 2.7, -back + 0.03, false, false);
    span(cav, imperial ? 'plaster_red' : 'stucco_painted', fr, 1.1, P + 0.6, -back + 0.01, hw - 0.3, P + 2.7, -back + 0.03, false, false);
    // Four columns at the front carrying a light entablature, a gable over the middle and an awning.
    const ch = 3.4;
    for (const x of [-hw + 0.4, -1.3, 1.3, hw - 0.4]) {
      column(cav, { order: 'corinthian', D: 0.28, height: ch, material: imperial ? 'marble_pavonazzetto' : 'marble', trimMaterial: 'marble', detail: 'low', kind: 'free', collide: true }, fr.clone().multiply(new THREE.Matrix4().makeTranslation(x, P + 0.02, -0.75)));
    }
    span(cav, 'marble', fr, -hw - 0.35, P + ch, -1.05, hw + 0.35, P + ch + 0.42, -0.45);
    span(cav, imperial ? 'gilded_bronze' : 'marble', fr, -hw - 0.35, P + ch + 0.12, -0.47, hw + 0.35, P + ch + 0.3, -0.44, false, false);
    const pedi = extrudePolygon([[-1.9, 0], [1.9, 0], [0, 0.75]], 0.6);
    cav.add(pedi, 'marble', fr.clone().multiply(new THREE.Matrix4().makeTranslation(0, P + ch + 0.42, -0.45)));
    // Awning (velum) from the front beam back and up to the back wall: one sloped slab.
    {
      const y0 = P + ch + 0.35;
      const y1 = P + 3.6;
      const len = Math.hypot(back - 1.0, y1 - y0);
      const ang = Math.atan2(y1 - y0, back - 1.0);
      const am = fr.clone().multiply(new THREE.Matrix4().makeTranslation(0, (y0 + y1) / 2, -(1.0 + back) / 2)).multiply(new THREE.Matrix4().makeRotationX(-ang));
      cav.box(imperial ? 'fabric_purple' : 'fabric_red', hw * 2 + 0.6, 0.05, len, am);
    }
    if (imperial) {
      // Gilded statue group on the gable, the couches (pulvinar) and the curule chair.
      statueGeometry(cav, fr.clone().multiply(new THREE.Matrix4().makeTranslation(0, P + ch + 0.8, -0.75)), { level: 'near', variant: 2, body: 'gilded_bronze', attr: 'gilded_bronze', plinth: 'marble', scale: 0.8 });
      span(cav, 'fabric_purple', fr, -2.4, P + 0.02, -back + 0.6, 2.4, P + 0.5, -back + 1.6);
      span(cav, 'fabric_purple', fr, -2.4, P + 0.5, -back + 0.6, 2.4, P + 0.95, -back + 0.85);
      span(cav, 'gilded_bronze', fr, -0.35, P + 0.02, -3.0, 0.35, P + 0.5, -2.4);
      span(cav, 'fabric_purple', fr, -0.33, P + 0.5, -3.0, 0.33, P + 0.58, -2.4, false, false);
    } else {
      span(cav, 'fabric_red', fr, -2.2, P + 0.02, -back + 0.6, 2.2, P + 0.5, -back + 1.6);
      span(cav, 'bronze', fr, -0.35, P + 0.02, -3.0, 0.35, P + 0.5, -2.4);
    }
    // The stair from the short-axis passage below, rising towards the arena into the back door.
    const { count, rise } = risers(P, 0.2);
    const run = 0.34;
    for (let i = 0; i < count; i++) {
      const xa = back + 0.3 + (count - i) * run;
      const xb = back + 0.3 + (count - i - 1) * run;
      span(cav, 'travertine', fr, -0.8, 0, -xa, 0.8, (i + 1) * rise, -xb, true, false);
    }
    span(cav, 'travertine', fr, -0.8, 0, -(back + 0.3), 0.8, P, -back, true, false);
    const xFoot = back + 0.3 + count * run;
    // Passage walls from ring 3 to the box, ceiling.
    for (const sx of [-1, 1]) span(cav, 'brick', fr, sx * 0.8, 0, -R3[0], sx * 1.2, P + 3.0, -back - 0.3, true);
    span(cav, 'plaster_cream', fr, -1.2, 2.95, -R3[0], 1.2, 3.25, -xFoot, true, false);
    const slope = Math.atan2(P, count * run);
    const cm = fr.clone().multiply(new THREE.Matrix4().makeTranslation(0, P / 2 + 3.1, -(back + 0.3 + (count * run) / 2))).multiply(new THREE.Matrix4().makeRotationX(-slope));
    cav.box('plaster_cream', 2.4, 0.3, Math.hypot(P, count * run) - 0.6, cm, { collide: true, castShadow: false });
    span(cav, 'paving_travertine', fr, -0.8, 0, -R3[0], 0.8, 0.04, -xFoot, false, false);
    const sp = new THREE.Vector3().setFromMatrixPosition(fr.clone().multiply(new THREE.Matrix4().makeTranslation(0, P + 0.05, -2.0)));
    spots.push({ id: imperial ? 'colos-pulvinar' : 'colos-editor-box', kind: 'vista', position: sp, heading: imperial ? Math.PI : 0 });
  }

  // ---- porticus in summa cavea: 80 columns (instanced), entablature, lean-to tiled roof
  let topSet: LodSet | null = null;
  {
    const yF = sec.topY;
    const xc = sec.topX + 0.75;
    const colH = 5.2;
    const D = 0.48;
    const mats: THREE.Matrix4[] = [];
    for (let k = 0; k < 80; k++) {
      const t = L.ts[k];
      const fr = oval.radialFrame(t, xc);
      fr.multiply(new THREE.Matrix4().makeTranslation(0, yF, 0)).multiply(new THREE.Matrix4().makeRotationY(Math.PI));
      mats.push(fr);
    }
    const cNear = new MeshBuilder();
    column(cNear, { order: 'corinthian', D, height: colH, material: 'marble_veined', trimMaterial: 'marble', detail: 'low', kind: 'free', collide: false });
    const cMid = new MeshBuilder();
    cMid.add(new THREE.CylinderGeometry(D * 0.42, D * 0.5, colH, 6), 'marble_veined', new THREE.Matrix4().makeTranslation(0, colH / 2, 0));
    cMid.add(new THREE.BoxGeometry(D * 1.2, colH * 0.1, D * 1.2), 'marble', new THREE.Matrix4().makeTranslation(0, colH * 0.95, 0));
    topSet = lodInstances(ctx.game, root, { name: 'colosseum-top-colonnade', matrices: mats, levels: [{ builder: cNear, maxDist: 22 }, { builder: cMid, maxDist: Infinity }] });
    const yE = yF + colH;
    cav.add(ovalBand(oval, xc - 0.32, xc + 0.32, yE, yE + 0.75, 0, two, 96, true), 'marble', I);
    cav.add(ovalBand(oval, xc - 0.45, xc + 0.4, yE + 0.75, yE + 0.95, 0, two, 96, true), 'marble', I);
    // Lean-to roof from the colonnade up to the attic's inner face (tiles above, timber below).
    const roofTop = yE + 2.15;
    const rp = new ProfileBuilder(xc - 0.55, yE + 0.95).to(XI + 0.02, roofTop).to(XI + 0.02, roofTop - 0.18).to(xc - 0.55, yE + 0.77).build();
    rp.pts.reverse();
    cav.add(ovalSweep(oval, new ProfileBuilder(XI + 0.02, roofTop).to(xc - 0.55, yE + 0.95).build(), 0, two, 96, { closed: true }), 'roof_tile', I);
    cav.add(ovalSweep(oval, new ProfileBuilder(xc - 0.55, yE + 0.8).to(XI + 0.02, roofTop - 0.15).build(), 0, two, 96, { closed: true }), 'wood_dark', I, { castShadow: false });
    void rp;
    // Back wall: the attic's inner face (the attic's instanced bays carry the outer face only
    // to the full wall depth, so add a plain inner band above the portico roof).
    cav.add(ovalBand(oval, XI - 0.07, XI - 0.03, yF, SY[4] - 0.3, 0, two, 96, true), 'travertine', I, { castShadow: false });
    spots.push({ id: 'colos-vista-summa', kind: 'vista', position: new THREE.Vector3(...pointY(oval, Math.PI / 2 + 0.3, sec.walks[3].x0 + 0.6, sec.walks[3].y + 0.05)), heading: 0 });
  }
  // A few seats for spectators to sit.
  [0.3, 1.2, 2.1, 3.0, 3.9, 4.8, 5.7].forEach((t, i) => {
    const r = sec.rows.find((rr) => rr.tier === 1 && rr.row === 3)!;
    const [px, pz] = oval.point(t, (r.x0 + r.x1) / 2);
    const [nx, nz] = oval.normal(t);
    spots.push({ id: `colos-seat-${i + 1}`, kind: 'sit', position: new THREE.Vector3(px, r.y + 0.02, pz), heading: Math.atan2(-nx, -nz) });
  });
  void ctx;
  void collideOut;
  return topSet!;
}

function pointY(oval: Oval, t: number, x: number, y: number): [number, number, number] {
  const [px, pz] = oval.point(t, x);
  return [px, y, pz];
}

// ---------------------------------------------------------------- velarium

/**
 * Whether bay k's awning strip is furled. On 11 May the sailors have run out the awning over the
 * sunny south, east and west of the bowl only; the north arc (local −z) stays furled, which also
 * opens the bowl to the view from the Oppian and the Esquiline.
 */
export function velariumFurled(L: ColosseumLayout, k: number): boolean {
  return Math.sin(L.centres[k]) < -0.45;
}

/** Mast-top ring, sagging canvas annulus (two-sided) with coloured strips, ropes to the cippi. */
function buildVelarium(L: ColosseumLayout, groundAt: (x: number, z: number) => number): THREE.Group {
  const b = new MeshBuilder();
  const { oval } = L;
  const two = Math.PI * 2;
  const N = COLOS.bays;
  const yTop = SY[4] + 2.6; // a little under the mast tops
  const xOut = XF - 0.2;
  const xIn = 4.0; // inner edge over the podium rows: the sand stays in the sun
  const rings = 5;
  const sag = 2.2;
  // Natural linen with a saffron strip every other bay and a red one on the axes.
  const strip = (k: number): 'fabric_white' | 'fabric_ochre' | 'fabric_red' => (k % 20 === 0 ? 'fabric_red' : k % 4 === 2 ? 'fabric_ochre' : 'fabric_white');
  const P = (t: number, f: number): [number, number, number] => {
    const x = xOut + (xIn - xOut) * f;
    const [px, pz] = oval.point(t, x);
    // Falls from the masts towards the inner rope ring (which hangs lower), with a catenary sag.
    const y = yTop - 5.5 * f - sag * Math.sin(Math.PI * f);
    return [px, y, pz];
  };
  for (let k = 0; k < N; k++) {
    const t0 = L.ts[k];
    const t1 = k + 1 < N ? L.ts[k + 1] : L.ts[0] + two;
    if (velariumFurled(L, k)) {
      // Furled: the strip is hauled out along its ropes and hangs bunched under the mast ring.
      const n = 4;
      for (let i = 0; i < n; i++) {
        const a = new THREE.Vector3(...P(t0 + ((t1 - t0) * i) / n, 0.035));
        const c = new THREE.Vector3(...P(t0 + ((t1 - t0) * (i + 1)) / n, 0.035));
        a.y -= 0.35;
        c.y -= 0.35;
        const sag = 0.25 * Math.sin((Math.PI * (i + 0.5)) / n);
        const g = new THREE.CylinderGeometry(0.26, 0.26, a.distanceTo(c) + 0.08, 6, 1, false);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), c.clone().sub(a).normalize()));
        g.translate((a.x + c.x) / 2, (a.y + c.y) / 2 - sag, (a.z + c.z) / 2);
        b.add(g, strip(k), undefined, { castShadow: false });
      }
      continue;
    }
    const pos: number[] = [];
    for (let j = 0; j < rings; j++) {
      const f0 = j / rings;
      const f1 = (j + 1) / rings;
      const a = P(t0, f0), c = P(t1, f0), d = P(t1, f1), e = P(t0, f1);
      // Top side (faces up) and underside.
      pos.push(...a, ...e, ...c, ...c, ...e, ...d);
      pos.push(...a, ...c, ...e, ...c, ...d, ...e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    b.add(g, strip(k), undefined);
  }
  // Ropes: along each bay boundary (radial) over the canvas, the inner ring rope, and the
  // anchor ropes from every mast top down to the cippi ring.
  for (let k = 0; k < N; k++) {
    const t = L.ts[k];
    const pts: THREE.Vector3[] = [];
    for (let j = 0; j <= rings; j++) pts.push(new THREE.Vector3(...P(t, j / rings)).add(new THREE.Vector3(0, 0.05, 0)));
    for (let j = 0; j < rings; j++) {
      const g = new THREE.CylinderGeometry(0.035, 0.035, pts[j].distanceTo(pts[j + 1]), 3, 1, true);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), pts[j + 1].clone().sub(pts[j]).normalize()));
      g.translate((pts[j].x + pts[j + 1].x) / 2, (pts[j].y + pts[j + 1].y) / 2, (pts[j].z + pts[j + 1].z) / 2);
      b.add(g, 'wood_dark', undefined, { castShadow: false });
    }
  }
  for (const t of oval.equalArc(N, XM, 0)) {
    const [mx, mz] = oval.point(t, XF + 0.25);
    const top = new THREE.Vector3(mx, SY[4] + 2.9, mz);
    const [cx, cz] = oval.point(t, XF + COLOS.cippi);
    const foot = new THREE.Vector3(cx, groundAt(cx, cz) + 1.5, cz);
    const len = top.distanceTo(foot);
    const g = new THREE.CylinderGeometry(0.02, 0.02, len, 3, 1, true);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize()));
    g.translate((top.x + foot.x) / 2, (top.y + foot.y) / 2, (top.z + foot.z) / 2);
    b.add(g, 'wood_dark', undefined, { castShadow: false });
  }
  const g = b.build('colosseum:velarium');
  g.name = 'colosseum:velarium';
  return g;
}

// ---------------------------------------------------------------- zone visibility

/** Approximate offset X of a local point from the arena oval (solves the ellipse a+X, b+X). */
export function ovalOffset(a: number, b: number, x: number, z: number): number {
  let lo = -Math.min(a, b) + 0.01;
  let hi = 400;
  for (let i = 0; i < 30; i++) {
    const m = (lo + hi) / 2;
    const v = (x / (a + m)) ** 2 + (z / (b + m)) ** 2;
    if (v > 1) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

function zoneVisibility(
  L: ColosseumLayout,
  root: THREE.Object3D,
  g: { gOuter: THREE.Group; gInner: THREE.Group; gBowl: THREE.Group; facadeSets: LodSet[]; hideSets: LodSet[]; ring2Sets: LodSet[]; topColonnade: LodSet; cippi: LodSet },
) {
  const inv = new THREE.Matrix4();
  const c = new THREE.Vector3();
  let last = '';
  return (camWorld: THREE.Vector3) => {
    root.updateWorldMatrix(true, false);
    inv.copy(root.matrixWorld).invert();
    c.copy(camWorld).applyMatrix4(inv);
    const X = ovalOffset(L.oval.a, L.oval.b, c.x, c.z);
    const dist = Math.hypot(c.x, c.z);
    let zone: string;
    if (X < R3[0] && c.y > 4.6) zone = 'cavea';
    else if (X < 0) zone = 'arena';
    else if (X > XF + 0.3) zone = c.y > SY[4] - 1 ? 'above' : dist > 260 ? 'far' : 'outside';
    else zone = c.y < SY[1] - 0.5 ? 'ambulatory' : 'between';
    if (zone === last) return;
    last = zone;
    const inBowl = zone === 'cavea' || zone === 'arena';
    const outside = zone === 'outside' || zone === 'far';
    g.gBowl.visible = !outside;
    // The ambulatories show through the arches from outside and through the gates from the sand.
    g.gInner.visible = zone !== 'cavea' && zone !== 'far';
    // From the ground-floor ambulatories only the ground storey's inner faces are in view.
    const amb = zone === 'ambulatory';
    g.facadeSets.forEach((s, si) => s.setForced(inBowl ? 2 : amb && si > 0 ? 2 : null));
    for (const s of g.hideSets) s.setForced(inBowl || amb ? -1 : null);
    g.cippi.setForced(inBowl ? -1 : null);
    for (const s of g.ring2Sets) s.setForced(zone === 'cavea' ? -1 : zone === 'arena' ? 1 : null);
    g.topColonnade.setForced(zone === 'outside' || zone === 'far' ? -1 : null);
  };
}

// ---------------------------------------------------------------- far stand-in

function buildFar(L: ColosseumLayout): THREE.Object3D {
  const b = new MeshBuilder();
  const { oval } = L;
  const two = Math.PI * 2;
  const H = SY[4];
  b.add(ovalBand(oval, XF - 1.4, XF, 0, H, 0, two, 80, true), 'travertine');
  // Dark arch openings painted on the three arcaded storeys.
  for (let si = 0; si < 3; si++) {
    for (let k = 0; k < 80; k++) {
      const { m, len } = oval.chordFrame(L.ts[k], L.ts[(k + 1) % 80] + (k === 79 ? two : 0), XF);
      span(b, 'black', m, len / 2 - 1.2, SY[si] + (si ? 0.9 : 0.1), -0.03, len / 2 + 1.2, SY[si] + COLOS.crown[si] - 0.3, 0.0, false, false);
    }
  }
  // Cavea bowl as a cone and the arena.
  const p = new ProfileBuilder(XF - 1.4, H - 9).to(0, 3.2).build();
  b.add(ovalSweep(oval, p, 0, two, 48, { closed: true }), 'marble');
  const g = b.build('colosseum:far');
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = false;
  });
  return g;
}

export const builders: LandmarkBuilder[] = [
  {
    handles: ['colosseum'],
    build: (ctx) => buildColosseum(ctx),
  },
];
