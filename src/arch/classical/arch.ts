/**
 * Arches: the archway primitive (piers, semicircular head, archivolts, imposts, keystone,
 * coffered soffit), triumphal arches (single bay like the Arch of Titus, or triple bay), plain
 * arches, straight arcades and superimposed-order arcade storeys (the "theatre motif" of the
 * Theatre of Marcellus and the Colosseum: arches framed by engaged columns and entablatures).
 *
 * Frames: archway and arch bodies are centred on x = 0 and z = 0, the FRONT face looks towards
 * −z, y = 0 is the ground. Arcades run along +x.
 */
import * as THREE from 'three';
import type { MeshBuilder } from '../../gfx/MeshBuilder';
import type { MaterialId } from '../../gfx/materialIds';
import { ProfileBuilder, T, TRS, extrudePolygon, mul, sweep, type V2 } from '../common/geom';
import { inscriptionPanel } from '../common/inscription';
import { windowVoidMaterial } from '../common/walls';
import { column } from './column';
import { corniceOnlyProfile, entablature } from './entablature';
import { ORDER_PROPORTIONS, columnDims, diameterForHeight, entablatureDims, type Detail, type Order } from './orders';
import { quadriga, reliefProcession } from './statues';

// ---------------------------------------------------------------- archway primitive

export interface ArchwaySpec {
  /** Clear width of the opening. */
  span: number;
  /** Height of the springing (impost) line; the crown is springing + span/2. */
  springing: number;
  /** Pier width on each side of the opening. */
  pier: number;
  /** Wall depth (z ∈ [−depth/2, depth/2]). */
  depth: number;
  /** Top of the masonry above the arch. */
  top: number;
  material?: MaterialId;
  /** Material for archivolts, imposts and keystones (default: material). */
  trim?: MaterialId;
  detail?: Detail;
  impost?: boolean;
  archivolt?: boolean;
  keystone?: boolean;
  /** Coffers on the intrados (triumphal arches). */
  coffers?: boolean;
  /** Skip the left/right pier (arcades share piers between bays). */
  leftPier?: boolean;
  rightPier?: boolean;
  /** Pier box colliders (default true). */
  collide?: boolean;
}

function head(span: number, ys: number, top: number, x0: number, n: number): V2[] {
  const r = span / 2;
  const out: V2[] = [[x0 - r, ys]];
  for (let i = 1; i < n; i++) {
    const a = Math.PI - (Math.PI * i) / n;
    out.push([x0 + Math.cos(a) * r, ys + Math.sin(a) * r]);
  }
  out.push([x0 + r, ys], [x0 + r, top], [x0 - r, top]);
  return out;
}

/** Profile of an archivolt band (x outward from the wall face, y = radial outward). */
function archivoltProfile(w: number, detail: Detail) {
  const n = detail === 'high' ? 3 : 1;
  return new ProfileBuilder(-0.02, 0)
    .to(0.03 * w * 4, 0)
    .up(w * 0.3)
    .out(0.012 * w * 4)
    .up(w * 0.35)
    .cymaReversa(0.025 * w * 4, w * 0.25, n)
    .up(w * 0.1)
    .to(-0.02, w)
    .build();
}

export function archway(b: MeshBuilder, spec: ArchwaySpec, at?: THREE.Matrix4) {
  const m = at ?? new THREE.Matrix4();
  const mat = spec.material ?? 'travertine';
  const trim = spec.trim ?? mat;
  const detail = spec.detail ?? 'high';
  const { span, springing: ys, pier, depth: d, top } = spec;
  const r = span / 2;
  const collide = spec.collide ?? true;
  const pierBox = (x: number) => {
    const local = T(x, top / 2, 0);
    b.box(mat, pier, top, d, mul(m, local), { collide });
  };
  if (spec.leftPier ?? true) pierBox(-r - pier / 2);
  if (spec.rightPier ?? true) pierBox(r + pier / 2);
  // Head over the opening (its curved side wall is the intrados).
  const n = detail === 'high' ? 18 : 8;
  const g = extrudePolygon(head(span, ys, top, 0, n), d);
  g.translate(0, 0, d / 2);
  b.add(g, mat, m);
  const band = Math.max(0.12, span * 0.09);
  // Archivolts on both faces.
  if (spec.archivolt ?? true) {
    const prof = archivoltProfile(band, detail);
    for (const side of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= n; i++) {
        const a = Math.PI - (Math.PI * i) / n;
        pts.push(new THREE.Vector3(Math.cos(a) * r * side * -1, ys + Math.sin(a) * r, (side * d) / 2));
      }
      // Profile's y runs radially outward: sweep the band along the arc with outward = ±z.
      const radial = pts.map((p) => p);
      const geo = sweep(prof, radial, { outward: new THREE.Vector3(0, 0, side), caps: true });
      b.add(geo, trim, m);
    }
  }
  // Impost mouldings at the springing: across both faces of the piers and inside the passage.
  if (spec.impost ?? true) {
    const h = Math.max(0.12, span * 0.06);
    const prof = new ProfileBuilder(-0.02, 0).to(0, 0).up(h * 0.35).out(h * 0.15).cymaReversa(h * 0.25, h * 0.45, detail === 'high' ? 3 : 1).up(h * 0.2).to(-0.02, h).build();
    for (const sx of [-1, 1]) {
      if ((sx < 0 && !(spec.leftPier ?? true)) || (sx > 0 && !(spec.rightPier ?? true))) continue;
      const xi = sx * r;
      const xo = sx * (r + pier);
      // U path: front face (outer→inner), passage face, back face (inner→outer); keep outward on the right.
      const path =
        sx < 0
          ? [new THREE.Vector3(xo, ys - h, -d / 2), new THREE.Vector3(xi, ys - h, -d / 2), new THREE.Vector3(xi, ys - h, d / 2), new THREE.Vector3(xo, ys - h, d / 2)]
          : [new THREE.Vector3(xo, ys - h, d / 2), new THREE.Vector3(xi, ys - h, d / 2), new THREE.Vector3(xi, ys - h, -d / 2), new THREE.Vector3(xo, ys - h, -d / 2)];
      b.add(sweep(prof, path, { caps: true }), trim, m);
    }
  }
  // Keystones.
  if (spec.keystone ?? true) {
    const kw = band * 1.1;
    const kh = band * 1.6;
    for (const side of [-1, 1]) {
      const k = new THREE.BoxGeometry(kw, kh, 0.12);
      k.translate(0, ys + r + kh * 0.35, (side * (d + 0.12)) / 2);
      b.add(k, trim, m);
    }
  }
  // Coffered soffit: transverse ribs and two longitudinal ribs on the intrados.
  if (spec.coffers && detail === 'high') {
    const rows = Math.max(3, Math.round(d / 0.7));
    const cols = 7;
    for (let i = 0; i <= cols; i++) {
      const a = Math.PI - (Math.PI * i) / cols;
      const rib = new THREE.BoxGeometry(0.06, 0.08, d);
      rib.rotateZ(a - Math.PI / 2);
      rib.translate(Math.cos(a) * (r - 0.03), ys + Math.sin(a) * (r - 0.03), 0);
      b.add(rib, trim, m);
    }
    for (let j = 0; j <= rows; j++) {
      const z = -d / 2 + (d * j) / rows;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= n; i++) {
        const a = Math.PI - (Math.PI * i) / n;
        pts.push(new THREE.Vector3(Math.cos(a) * (r - 0.0), ys + Math.sin(a) * (r - 0.0), z));
      }
      const ribProf = new ProfileBuilder(-0.03, -0.03).to(0.03, -0.03).to(0.03, 0.03).to(-0.03, 0.03).build();
      // ribs hang inward from the intrados: sweep along the arc with "outward" = −radial ≈ use z normal frame
      b.add(sweep(ribProf, pts, { outward: new THREE.Vector3(0, 0, 1), caps: false }), trim, m);
    }
  }
}

// ---------------------------------------------------------------- triumphal arch

export interface TriumphalArchSpec {
  bays?: 1 | 3;
  /** Clear width of the central passage (Arch of Titus: 5.36 m real). */
  span?: number;
  order?: Order;
  material?: MaterialId;
  detail?: Detail;
  /** Attic inscription lines (Latin; U/V and interpuncts handled). */
  inscription?: string[];
  inscriptionStyle?: 'carved' | 'bronze';
  /** Bronze chariot group on the attic. */
  quadriga?: boolean;
  /** Relief panels inside the passage and spandrel Victories. */
  reliefs?: boolean;
}

export interface TriumphalArchResult {
  width: number;
  depth: number;
  height: number;
}

const TITUS = ['Senatus', 'Populusque Romanus', 'Divo Tito Divi Vespasiani F', 'Vespasiano Augusto'];

/** A winged Victory in low relief for the spandrels (flat silhouette, faces −z). */
function victory(b: MeshBuilder, mat: MaterialId, at: THREE.Matrix4, size: number, flip: boolean) {
  // Reclining flying figure: body diagonal, one wing up, arm forward holding a wreath.
  const s = size;
  const pts: V2[] = [
    [0, 0],
    [0.18, 0.06],
    [0.42, 0.2],
    [0.62, 0.34],
    [0.86, 0.38],
    [0.95, 0.46],
    [0.9, 0.54],
    [0.78, 0.5],
    [0.66, 0.52],
    [0.72, 0.78],
    [0.6, 1.0],
    [0.5, 0.72],
    [0.44, 0.46],
    [0.26, 0.34],
    [0.08, 0.2],
  ].map(([x, y]) => [(flip ? -x : x) * s, y * s * 0.62] as V2);
  if (flip) pts.reverse();
  const g = extrudePolygon(pts, 0.09, [], 0.05);
  b.add(g, mat, at);
  const wreath = new THREE.TorusGeometry(0.07 * s, 0.015 * s, 4, 10);
  wreath.translate((flip ? -1.0 : 1.0) * s, 0.5 * s * 0.62, -0.02);
  b.add(wreath, mat, at);
}

export function triumphalArch(b: MeshBuilder, spec: TriumphalArchSpec = {}, at?: THREE.Matrix4): TriumphalArchResult {
  const m = at ?? new THREE.Matrix4();
  const W = spec.span ?? 3.2;
  const order = spec.order ?? 'composite';
  const mat = spec.material ?? 'marble';
  const detail = spec.detail ?? 'high';
  const triple = spec.bays === 3;
  const depth = triple ? 0.95 * W : 0.89 * W;
  // Vertical scheme (Arch of Titus, in passage widths W).
  const socle = 0.57 * W;
  const colH = 1.18 * W;
  const D = diameterForHeight(order, colH) * 1.02;
  const ent = entablatureDims(order, colH);
  const yCol = socle;
  const yEnt = socle + colH;
  const atticH = triple ? 0.7 * W : 0.82 * W;
  const yAttic = yEnt + ent.total;
  // Plan: piers and bays along x.
  type Bay = { x: number; span: number; spring: number };
  let bays: Bay[];
  let width: number;
  let colXs: number[];
  if (!triple) {
    const pier = 0.76 * W;
    width = W + 2 * pier;
    bays = [{ x: 0, span: W, spring: 1.05 * W }];
    colXs = [-(W / 2 + 0.17 * W), W / 2 + 0.17 * W, -(width / 2 - 0.15 * W), width / 2 - 0.15 * W];
  } else {
    const w = 0.56 * W;
    const pierIn = 0.5 * W;
    const pierOut = 0.42 * W;
    width = W + 2 * w + 2 * pierIn + 2 * pierOut;
    const xs = W / 2 + pierIn + w / 2;
    bays = [
      { x: -xs, span: w, spring: 0.66 * W },
      { x: 0, span: W, spring: 1.05 * W },
      { x: xs, span: w, spring: 0.66 * W },
    ];
    colXs = [-(W / 2 + pierIn / 2), W / 2 + pierIn / 2, -(width / 2 - pierOut / 2), width / 2 - pierOut / 2];
  }
  // Body: archways side by side; piers fill the gaps.
  const edges: number[] = [];
  for (const bay of bays) edges.push(bay.x - bay.span / 2, bay.x + bay.span / 2);
  edges.sort((a, c) => a - c);
  const xsPier: [number, number][] = [[-width / 2, edges[0]]];
  for (let i = 1; i < edges.length - 1; i += 2) xsPier.push([edges[i], edges[i + 1]]);
  xsPier.push([edges[edges.length - 1], width / 2]);
  for (const [x0, x1] of xsPier) b.box(mat, x1 - x0, yAttic, depth, mul(m, T((x0 + x1) / 2, yAttic / 2, 0)), { collide: true });
  for (const bay of bays) {
    archway(
      b,
      { span: bay.span, springing: bay.spring, pier: 0, depth, top: yEnt, material: mat, detail, leftPier: false, rightPier: false, coffers: bay.x === 0, collide: false },
      mul(m, T(bay.x, 0, 0)),
    );
    // Masonry between the archway top and the attic (entablature zone core).
    b.box(mat, bay.span, yAttic - yEnt + 0.01, depth, mul(m, T(bay.x, (yEnt + yAttic) / 2, 0)));
  }
  // Socle: base and crowning mouldings around the body at the pedestal zone.
  const rect = (hw: number, hd: number, y: number) => [new THREE.Vector3(-hw, y, -hd), new THREE.Vector3(hw, y, -hd), new THREE.Vector3(hw, y, hd), new THREE.Vector3(-hw, y, hd)];
  const n = detail === 'high' ? 3 : 1;
  const sBase = new ProfileBuilder(-0.02, 0).to(0.14, 0).up(0.22).torus(0.12, 0.05, n).in(0.05).cymaReversa(-0.07, 0.12, n).to(-0.02, 0.46).build();
  const sCrown = new ProfileBuilder(-0.02, -0.3).to(0, -0.3).cymaReversa(0.06, 0.1, n).up(0.04).out(0.04).up(0.12).ovolo(0.05, 0.06, n).to(-0.02, 0.02).build();
  // Mouldings ring each pier separately so they never cross a passage.
  const ringPier = (prof: ReturnType<ProfileBuilder['build']>, x0: number, x1: number, y: number) => {
    const hd = depth / 2;
    const path = [new THREE.Vector3(x0, y, -hd), new THREE.Vector3(x1, y, -hd), new THREE.Vector3(x1, y, hd), new THREE.Vector3(x0, y, hd)];
    b.add(sweep(prof, path, { closed: true }), mat, m);
  };
  for (const [x0, x1] of xsPier) {
    ringPier(sBase, x0, x1, 0);
    ringPier(sCrown, x0, x1, socle);
  }
  // Column pedestals and engaged columns on both faces.
  for (const side of [-1, 1]) {
    for (const x of colXs) {
      const pz = side * (depth / 2);
      const ped = new THREE.BoxGeometry(D * 1.5, socle, D * 0.9);
      ped.translate(x, socle / 2, pz + side * D * 0.45 - side * 0.02);
      b.add(ped, mat, m);
      column(b, { order, D, height: colH, fluted: true, material: mat, detail, kind: 'engaged', collide: false }, mul(m, TRS(x, yCol, pz, 0, side < 0 ? 0 : Math.PI, 0)));
    }
  }
  // Entablature round the body at the column faces.
  const d = D * ORDER_PROPORTIONS[order].topRatio;
  entablature(b, rect(width / 2 + 0.02, depth / 2 + d / 2, yEnt), { order, columnHeight: colH, D, material: mat, detail }, { closed: true, at: m });
  // Attic with base and crowning cornice; inscription on both faces.
  const aw = width / 2 - 0.04;
  const ad = depth / 2 + d / 2 - 0.05;
  const atticTop = yAttic + atticH;
  b.box(mat, aw * 2, atticH, ad * 2, mul(m, T(0, yAttic + atticH / 2, 0)));
  const aBase = new ProfileBuilder(-0.02, 0).to(0.1, 0).up(0.16).cymaReversa(-0.08, 0.14, n).to(-0.02, 0.32).build();
  b.add(sweep(aBase, rect(aw, ad, yAttic), { closed: true }), mat, m);
  const crown = corniceOnlyProfile('tuscan', atticH * 0.16, detail, 0.3, true);
  b.add(sweep(crown.profile, rect(aw, ad, atticTop - atticH * 0.16), { closed: true, back: true }), mat, m);
  const lines = spec.inscription ?? TITUS;
  const panelW = triple ? W * 2.2 : W * 1.55;
  const panelH = atticH * 0.62;
  for (const side of [-1, 1]) {
    inscriptionPanel(
      b,
      { lines, width: panelW, height: panelH, style: spec.inscriptionStyle ?? 'carved', sizes: lines.map((_, i) => (i === 0 ? 1.05 : 0.8)), border: true },
      mul(m, TRS(0, yAttic + atticH * 0.48, side * (ad + 0.03), 0, side < 0 ? 0 : Math.PI, 0)),
      { depth: 0.06 },
    );
  }
  // Spandrel Victories and passage reliefs.
  if ((spec.reliefs ?? true) && detail === 'high') {
    const main = bays.find((bb) => bb.x === 0)!;
    const vs = main.span * 0.42;
    for (const side of [-1, 1]) {
      const z = side * (depth / 2 + 0.01);
      const rot = side < 0 ? 0 : Math.PI;
      victory(b, mat, mul(m, TRS(-main.span / 2 - 0.05, main.spring + main.span * 0.36, z, 0, rot, 0)), vs, false);
      victory(b, mat, mul(m, TRS(main.span / 2 + 0.05, main.spring + main.span * 0.36, z, 0, rot, 0)), vs, true);
    }
    // Processional reliefs on the passage walls (spoils and triumph).
    const ph = main.spring * 0.45;
    for (const sx of [-1, 1]) {
      const x = sx * (main.span / 2) - sx * 0.005;
      const frameMat: MaterialId = mat;
      const back = new THREE.BoxGeometry(0.04, ph + 0.2, depth * 0.78);
      back.translate(x - sx * 0.02, main.spring * 0.48, 0);
      b.add(back, frameMat, m);
      reliefProcession(b, mul(m, TRS(x - sx * 0.04, main.spring * 0.26, 0, 0, sx < 0 ? -Math.PI / 2 : Math.PI / 2, 0)), depth * 0.72, ph, { material: mat, depth: 0.1 });
    }
  }
  // Crowning group.
  let height = atticTop;
  if (spec.quadriga ?? true) {
    const sc = W / 3.2;
    quadriga(b, mul(m, T(0, atticTop, 0.1)), { material: 'bronze', driverMaterial: 'gilded_bronze', scale: sc, detail });
    height += 2.4 * sc;
  }
  return { width, depth, height };
}

// ---------------------------------------------------------------- plain arch

export interface PlainArchSpec {
  span: number;
  /** Crown height of the opening (default 1.5 × span). */
  height?: number;
  pier?: number;
  depth?: number;
  material?: MaterialId;
  detail?: Detail;
  /** Attic/cornice above (default true). */
  cornice?: boolean;
}

/** A free-standing arch or gate: two piers, archivolt, impost, keystone and a crowning cornice. */
export function plainArch(b: MeshBuilder, spec: PlainArchSpec, at?: THREE.Matrix4) {
  const m = at ?? new THREE.Matrix4();
  const span = spec.span;
  const crown = spec.height ?? 1.5 * span;
  const pier = spec.pier ?? Math.max(0.6, 0.45 * span);
  const depth = spec.depth ?? Math.max(0.8, 0.5 * span);
  const top = crown + span * 0.35;
  const mat = spec.material ?? 'travertine';
  const detail = spec.detail ?? 'high';
  archway(b, { span, springing: crown - span / 2, pier, depth, top, material: mat, detail }, m);
  if (spec.cornice ?? true) {
    const w = span / 2 + pier;
    const prof = corniceOnlyProfile('tuscan', span * 0.18, detail, 0.3, true);
    const path = [new THREE.Vector3(-w, top, -depth / 2), new THREE.Vector3(w, top, -depth / 2), new THREE.Vector3(w, top, depth / 2), new THREE.Vector3(-w, top, depth / 2)];
    b.add(sweep(prof.profile, path, { closed: true, back: true }), mat, mul(m, T(0, -span * 0.18, 0)));
  }
  return { width: span + 2 * pier, depth, height: top };
}

// ---------------------------------------------------------------- arcades and storeys

export interface ArcadeStorey {
  /** Engaged column order framing the arches ('none' = plain piers). */
  order: Order | 'none';
  /** Storey height including its entablature. */
  height: number;
  /** Crown height of the arches above the storey floor (default 0.72 × (height − entablature)). */
  archHeight?: number;
  /** Pedestal under the columns (upper storeys: parapet zone). */
  pedestal?: number;
  /** 'attic': solid wall with pilasters and small windows instead of arches. */
  kind?: 'arcade' | 'attic';
  /** Attic windows: in alternate bays (Colosseum) or none. */
  windows?: 'alternate' | 'all' | 'none';
}

export interface ArcadeSpec {
  /** Number of bays. */
  bays: number;
  /** Axial bay width (pier centre to pier centre). */
  bay: number;
  /** Pier width. */
  pier: number;
  /** Wall depth. */
  depth: number;
  storeys: ArcadeStorey[];
  material?: MaterialId;
  detail?: Detail;
  /** Detail of the engaged columns (e.g. 'low' for long amphitheatre facades). */
  columnDetail?: Detail;
  /** Velarium masts and corbels on an attic storey. */
  masts?: boolean;
  /** Corridor floors behind the arcade (depth of the ambulatory, 0 = none). */
  corridor?: number;
}

/** Column diameter for an arcade storey (half-columns sized to the storey). */
export function storeyColumn(s: ArcadeStorey, bay: number) {
  const order: Order = s.order === 'none' ? 'tuscan' : s.order;
  const entH = s.height * 0.16;
  const colH = s.height - entH - (s.pedestal ?? 0);
  const D = Math.min(diameterForHeight(order, colH), bay * 0.2);
  return { order, colH, D, entH };
}

/**
 * One bay of a storey in its own frame: x ∈ [0, bay], wall z ∈ [−depth/2, depth/2], facade at −z.
 * Half-piers at both ends (extended slightly past the bay edge so curved arcades close up).
 */
export function arcadeBay(b: MeshBuilder, spec: ArcadeSpec, si: number, y0: number, at: THREE.Matrix4, opts: { firstColumn?: boolean; lastColumn?: boolean; window?: boolean; collide?: boolean } = {}) {
  const s = spec.storeys[si];
  const mat = spec.material ?? 'travertine';
  const detail = spec.detail ?? 'high';
  const cdet = spec.columnDetail ?? detail;
  const { bay, pier, depth } = spec;
  const { order, colH, D, entH } = storeyColumn(s, bay);
  const ped = s.pedestal ?? 0;
  const ext = 0.06;
  const m = at;
  if ((s.kind ?? 'arcade') === 'attic') {
    // Solid wall, pilaster at the bay start, optional small window.
    const wallTop = s.height;
    if (opts.window) {
      const ww = bay * 0.24;
      const wh = s.height * 0.22;
      const wy = s.height * 0.38;
      const cx = bay / 2;
      b.box(mat, cx - ww / 2 + ext, wallTop, depth, mul(m, T((cx - ww / 2 - ext) / 2, y0 + wallTop / 2, 0)));
      b.box(mat, bay - cx - ww / 2 + ext, wallTop, depth, mul(m, T((bay + cx + ww / 2 + ext) / 2, y0 + wallTop / 2, 0)));
      b.box(mat, ww, wy, depth, mul(m, T(cx, y0 + wy / 2, 0)));
      b.box(mat, ww, wallTop - wy - wh, depth, mul(m, T(cx, y0 + (wy + wh + wallTop) / 2, 0)));
      // A real opening with reveals; a dark card at the back of the reveal reads as the unlit
      // gallery behind it (the attic corridor has no interior to see).
      b.box(windowVoidMaterial(), ww + 0.04, wh + 0.04, 0.02, mul(m, T(cx, y0 + wy + wh / 2, depth / 2 + 0.01)), { castShadow: false });
    } else {
      b.box(mat, bay + 2 * ext, wallTop, depth, mul(m, T(bay / 2, y0 + wallTop / 2, 0)));
    }
    if (s.order !== 'none' && (opts.firstColumn ?? true)) {
      column(b, { order, D, height: colH, material: mat, detail: cdet, kind: 'pilaster', collide: false }, mul(m, T(0, y0 + ped, -depth / 2)));
    }
    if (s.order !== 'none' && opts.lastColumn) column(b, { order, D, height: colH, material: mat, detail: cdet, kind: 'pilaster', collide: false }, mul(m, T(bay, y0 + ped, -depth / 2)));
    if (spec.masts) {
      // Three corbels per bay near the top; a velarium mast rising from the middle one.
      for (const f of [0.25, 0.5, 0.75]) {
        b.box(mat, 0.28, 0.3, 0.35, mul(m, T(bay * f, y0 + s.height * 0.62, -depth / 2 - 0.17)));
      }
      const mast = new THREE.CylinderGeometry(0.12, 0.14, s.height * 0.9, detail === 'high' ? 8 : 5);
      mast.translate(bay * 0.5, y0 + s.height * 0.62 + s.height * 0.45, -depth / 2 - 0.17);
      b.add(mast, 'wood_dark', m);
    }
    return;
  }
  // Arcade bay: two half-piers and an arch.
  const span = bay - pier;
  const crown = s.archHeight ?? Math.min((s.height - entH) * 0.82, ped + colH * 0.86);
  const spring = crown - span / 2;
  const top = s.height - entH * 0.0;
  // half piers (extended past the bay edges)
  b.box(mat, pier / 2 + ext, top, depth, mul(m, T((pier / 2 - ext) / 2, y0 + top / 2, 0)), { collide: opts.collide });
  b.box(mat, pier / 2 + ext, top, depth, mul(m, T(bay - (pier / 2 - ext) / 2, y0 + top / 2, 0)), { collide: opts.collide });
  archway(b, { span, springing: spring, pier: 0, depth, top: s.height - entH, material: mat, detail, leftPier: false, rightPier: false, collide: false, keystone: detail === 'high' }, mul(m, T(bay / 2, y0, 0)));
  if (ped > 0) {
    // parapet between the pedestals of an upper storey
    b.box(mat, span, ped * 0.9, depth * 0.3, mul(m, T(bay / 2, y0 + (ped * 0.9) / 2, -depth / 2 + depth * 0.15)));
  }
  if (s.order !== 'none') {
    const placeCol = (x: number) => {
      if (ped > 0) b.box(mat, D * 1.4, ped, D * 0.75, mul(m, T(x, y0 + ped / 2, -depth / 2 - D * 0.3)));
      column(b, { order, D, height: colH, material: mat, detail: cdet, kind: 'engaged', collide: false }, mul(m, T(x, y0 + ped, -depth / 2)));
    };
    if (opts.firstColumn ?? true) placeCol(0);
    if (opts.lastColumn) placeCol(bay);
  }
}

/** Straight arcade (optionally several superimposed storeys) along +x from x = 0. */
export function arcade(b: MeshBuilder, spec: ArcadeSpec, at?: THREE.Matrix4) {
  const m = at ?? new THREE.Matrix4();
  const detail = spec.detail ?? 'high';
  const mat = spec.material ?? 'travertine';
  let y = 0;
  const length = spec.bays * spec.bay;
  spec.storeys.forEach((s, si) => {
    for (let i = 0; i < spec.bays; i++) {
      const bm = mul(m, T(i * spec.bay, 0, 0));
      const window = s.windows === 'all' || (s.windows === 'alternate' && i % 2 === 1);
      arcadeBay(b, spec, si, y, bm, { firstColumn: true, lastColumn: i === spec.bays - 1, window, collide: si === 0 });
    }
    // Storey entablature (engaged columns stand at the wall face; the architrave sits on them).
    if (s.order !== 'none' || (s.kind ?? 'arcade') === 'attic') {
      const { order, colH, D, entH } = storeyColumn(s, spec.bay);
      const yE = y + s.height - entH;
      const d = D * ORDER_PROPORTIONS[order].topRatio;
      const ez = -spec.depth / 2 - d / 2;
      const path = [new THREE.Vector3(-0.3, yE, ez), new THREE.Vector3(length + 0.3, yE, ez)];
      entablature(b, path, { order, columnHeight: colH, D, material: mat, detail, dims: { architrave: entH * 0.3, frieze: entH * 0.3, cornice: entH * 0.4 }, depth: spec.depth * 0.5 + d / 2, axial: spec.bay }, { at: m, caps: true });
    }
    if (spec.corridor && spec.corridor > 0) {
      // Ambulatory floor (and the storey's ceiling for the one below) behind the facade.
      const fl = new THREE.BoxGeometry(length, 0.35, spec.corridor);
      fl.translate(length / 2, y + s.height - 0.175, spec.depth / 2 + spec.corridor / 2);
      b.add(fl, 'concrete', m, { castShadow: false });
    }
    y += s.height;
  });
  return { length, height: y };
}

/** Colosseum facade storeys (real heights 10.5 / 11.85 / 11.6 / 14.2 m) scaled by `k`. */
export function colosseumStoreys(k = 0.6): ArcadeStorey[] {
  return [
    { order: 'tuscan', height: 10.5 * k },
    { order: 'ionic', height: 11.85 * k, pedestal: 1.6 * k },
    { order: 'corinthian', height: 11.6 * k, pedestal: 1.6 * k },
    { order: 'corinthian', height: 14.2 * k, kind: 'attic', pedestal: 1.0 * k, windows: 'alternate' },
  ];
}

export { columnDims };
