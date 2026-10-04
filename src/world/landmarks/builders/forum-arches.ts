/**
 * Honorific arches of the Forum and the Sacra Via, on the proportions of the kit's triumphal arch
 * (in passage widths W after the Arch of Titus) but with column tiers and per-face inscriptions:
 *  - the Arch of Titus (single bay, Composite, the spoils of Jerusalem and Titus' triumph in the
 *    passage, the apotheosis eagle in the vault, the dedication on the E attic only, quadriga);
 *  - the Parthian Arch of Augustus (three bays, the side bays lower under pediments);
 *  - the Arch of Tiberius (single bay with a statue group);
 *  - the Fornix Fabianus (the old plain arch of tufa and travertine).
 */
import * as THREE from 'three';
import { archway, plainArch } from '../../../arch/classical/arch';
import { corniceOnlyProfile, entablature, pediment } from '../../../arch/classical/entablature';
import { ORDER_PROPORTIONS, diameterForHeight, entablatureDims, type Order } from '../../../arch/classical/orders';
import { quadriga } from '../../../arch/classical/statues';
import { ProfileBuilder, extrudePolygon, sweep, type V2 } from '../../../arch/common/geom';
import { friezeBand, reliefMaterial } from '../../../arch/common/relief';
import type { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../gfx/materialIds';
import type { LandmarkBuilder } from '../types';
import { FORUM_INSCRIPTIONS } from './forum-data';
import { T, TRS, atlasToLocal, col, inscription, landmark, mul, type Part, type Tier } from './forum-kit';
import { apotheosisMaterial, panel, spoilsMaterial, triumphMaterial } from './forum-reliefs';

const text = (id: string) => FORUM_INSCRIPTIONS[id].latin;

let processionFrieze: THREE.MeshStandardMaterial | null = null;
function friezeMat() {
  if (!processionFrieze) {
    processionFrieze = reliefMaterial(friezeBand(1024, 128, 81), { ground: [214, 206, 192], relief: [242, 238, 230], strength: 3.5, roughness: 0.55, repeat: true });
    processionFrieze.name = 'forum-relief:titus-frieze';
  }
  return processionFrieze;
}

/** A flying Victory in low relief for a spandrel (faces −z), holding out a wreath. */
function victory(b: MeshBuilder, mat: MaterialId, at: THREE.Matrix4, size: number, flip: boolean) {
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
  ].map(([x, y]) => [(flip ? -x : x) * size, y * size * 0.62] as V2);
  if (flip) pts.reverse();
  b.add(extrudePolygon(pts, 0.08, [], 0.04), mat, at);
  const wreath = new THREE.TorusGeometry(0.07 * size, 0.015 * size, 4, 10);
  wreath.translate((flip ? -1.0 : 1.0) * size, 0.5 * size * 0.62, -0.02);
  b.add(wreath, 'gilded_bronze', at);
}

interface ArchSpec {
  /** Clear width of the central passage. */
  W: number;
  bays: 1 | 3;
  order: Order;
  material?: MaterialId;
  /** Attic inscription on the front (−z) and back (+z) faces; null = a blank panel. */
  front: string[] | null;
  back: string[] | null;
  style?: 'carved' | 'bronze';
  /** Column tier near (default 'mid'; 'hero' for the Arch of Titus). */
  tier?: Tier;
  quadriga?: boolean;
  /** Pediments over the side bays (Arch of Augustus). */
  sidePediments?: boolean;
  /** Procession frieze over the passage. */
  frieze?: boolean;
  /** Spandrel Victories. */
  victories?: boolean;
}

interface ArchResult {
  width: number;
  depth: number;
  spring: number;
  socle: number;
  yEnt: number;
  yAttic: number;
  atticTop: number;
}

/** Body, columns, entablature, attic and crown of an honorific arch, centred on the origin, passage along z. */
function forumArch(p: Part, s: ArchSpec): ArchResult {
  const { b, hi } = p;
  const m = new THREE.Matrix4();
  const W = s.W;
  const mat = s.material ?? 'marble';
  const triple = s.bays === 3;
  const depth = triple ? 0.95 * W : 0.89 * W;
  const socle = 0.57 * W;
  const colH = 1.18 * W;
  const D = diameterForHeight(s.order, colH) * 1.02;
  const ent = entablatureDims(s.order, colH);
  const yEnt = socle + colH;
  const atticH = triple ? 0.7 * W : 0.82 * W;
  const yAttic = yEnt + ent.total;
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
  // piers and the masonry over the passages
  const edges: number[] = [];
  for (const bay of bays) edges.push(bay.x - bay.span / 2, bay.x + bay.span / 2);
  edges.sort((a, c) => a - c);
  const piers: [number, number][] = [[-width / 2, edges[0]]];
  for (let i = 1; i < edges.length - 1; i += 2) piers.push([edges[i], edges[i + 1]]);
  piers.push([edges[edges.length - 1], width / 2]);
  for (const [x0, x1] of piers) b.box(mat, x1 - x0, yAttic, depth, T((x0 + x1) / 2, yAttic / 2, 0), { collide: p.main });
  for (const bay of bays) {
    archway(b, { span: bay.span, springing: bay.spring, pier: 0, depth, top: yEnt, material: mat, detail: p.detail, leftPier: false, rightPier: false, coffers: bay.x === 0 && hi, collide: false }, T(bay.x, 0, 0));
    b.box(mat, bay.span, yAttic - yEnt + 0.01, depth, T(bay.x, (yEnt + yAttic) / 2, 0));
  }
  // socle mouldings round each pier
  const n = hi ? 3 : 1;
  const sBase = new ProfileBuilder(-0.02, 0).to(0.14, 0).up(0.22).torus(0.12, 0.05, n).in(0.05).cymaReversa(-0.07, 0.12, n).to(-0.02, 0.46).build();
  const sCrown = new ProfileBuilder(-0.02, -0.3).to(0, -0.3).cymaReversa(0.06, 0.1, n).up(0.04).out(0.04).up(0.12).ovolo(0.05, 0.06, n).to(-0.02, 0.02).build();
  const hd = depth / 2;
  for (const [x0, x1] of piers) {
    for (const [prof, y] of [
      [sBase, 0],
      [sCrown, socle],
    ] as const) {
      const path = [new THREE.Vector3(x0, y, -hd), new THREE.Vector3(x1, y, -hd), new THREE.Vector3(x1, y, hd), new THREE.Vector3(x0, y, hd)];
      b.add(sweep(prof, path, { closed: true }), mat, m);
    }
  }
  // pedestals and engaged columns on both faces
  const tier: Tier = hi ? (s.tier ?? 'mid') : 'stub';
  for (const side of [-1, 1]) {
    for (const x of colXs) {
      const pz = side * hd;
      b.box(mat, D * 1.5, socle, D * 0.9, T(x, socle / 2, pz + side * D * 0.45 - side * 0.02));
      col(b, { order: s.order, D, H: colH, tier, material: mat, kind: 'engaged', collide: false }, TRS(x, socle, pz, 0, side < 0 ? 0 : Math.PI, 0));
    }
  }
  // entablature round the body
  const d = D * ORDER_PROPORTIONS[s.order].topRatio;
  const rect = (hw: number, hz: number, y: number) => [new THREE.Vector3(-hw, y, -hz), new THREE.Vector3(hw, y, -hz), new THREE.Vector3(hw, y, hz), new THREE.Vector3(-hw, y, hz)];
  const e = entablature(b, rect(width / 2 + 0.02, hd + d / 2, yEnt), { order: s.order, columnHeight: colH, D, material: mat, detail: p.detail }, { closed: true, at: m });
  if (s.frieze && hi) {
    const F = e.dims.frieze;
    for (const side of [-1, 1]) {
      panel(b, friezeMat(), width - 0.4, F * 0.86, TRS(0, yEnt + e.dims.architrave + F / 2, side * (hd + d / 2 + e.friezeX + 0.008), 0, side < 0 ? 0 : Math.PI, 0), 5);
    }
  }
  // pediments over the side bays (Arch of Augustus)
  if (triple && s.sidePediments) {
    for (const bay of bays.filter((bb) => bb.x !== 0)) {
      for (const side of [-1, 1]) {
        pediment(b, { order: s.order, span: bay.span + 0.9, cornice: 0.18, depth: 0.3, material: mat, detail: p.detail, D: D * 0.6 }, TRS(bay.x, bay.spring + bay.span / 2 + 0.55, side * (hd + 0.15), 0, side < 0 ? 0 : Math.PI, 0));
      }
    }
  }
  // attic with base and crowning cornice
  const aw = width / 2 - 0.04;
  const ad = hd + d / 2 - 0.05;
  const atticTop = yAttic + atticH;
  b.box(mat, aw * 2, atticH, ad * 2, T(0, yAttic + atticH / 2, 0), { collide: p.main });
  const aBase = new ProfileBuilder(-0.02, 0).to(0.1, 0).up(0.16).cymaReversa(-0.08, 0.14, n).to(-0.02, 0.32).build();
  b.add(sweep(aBase, rect(aw, ad, yAttic), { closed: true }), mat, m);
  const crown = corniceOnlyProfile('tuscan', atticH * 0.16, p.detail, 0.3, true);
  b.add(sweep(crown.profile, rect(aw, ad, atticTop - atticH * 0.16), { closed: true, back: true }), mat, m);
  const panelW = triple ? W * 2.2 : W * 1.55;
  const panelH = atticH * 0.62;
  for (const side of [-1, 1]) {
    const lines = side < 0 ? s.front : s.back;
    const at = TRS(0, yAttic + atticH * 0.48, side * (ad + 0.03), 0, side < 0 ? 0 : Math.PI, 0);
    if (lines && hi) inscription(b, at, lines, panelW, panelH, s.style ?? 'carved', { depth: 0.06, sizes: lines.map((_, i) => (i === 0 ? 1.05 : 0.8)) });
    else b.box(mat, panelW, panelH, 0.06, mul(at, T(0, 0, 0.03)));
  }
  // spandrel Victories
  if ((s.victories ?? true) && hi) {
    const main = bays.find((bb) => bb.x === 0)!;
    const vs = main.span * 0.42;
    for (const side of [-1, 1]) {
      const z = side * (hd + 0.01);
      const rot = side < 0 ? 0 : Math.PI;
      victory(b, mat, TRS(-main.span / 2 - 0.05, main.spring + main.span * 0.36, z, 0, rot, 0), vs, false);
      victory(b, mat, TRS(main.span / 2 + 0.05, main.spring + main.span * 0.36, z, 0, rot, 0), vs, true);
    }
  }
  if ((s.quadriga ?? true) && !hi) b.box('bronze', W * 0.9, W * 0.55, W * 0.5, T(0, atticTop + W * 0.27, 0.1));
  else if (s.quadriga ?? true) {
    const sc = W / 3.2;
    quadriga(b, T(0, atticTop, 0.1), { material: 'bronze', driverMaterial: 'gilded_bronze', scale: sc, detail: 'low' });
  }
  return { width, depth, spring: bays.find((bb) => bb.x === 0)!.spring, socle, yEnt, yAttic, atticTop };
}

// ---------------------------------------------------------------- Arch of Titus

function archTitus(p: Part) {
  const { b, hi } = p;
  const W = 5.36 * p.S;
  // the inscription faces ESE (local −z) towards the amphitheatre; the W attic is lost (left plain)
  const r = forumArch(p, { W, bays: 1, order: 'composite', front: text('arch-titus'), back: null, style: 'carved', tier: 'hero', frieze: true, quadriga: true });
  const hd = r.depth / 2;
  if (hi) {
    // the passage reliefs: the spoils of Jerusalem (S wall, +x) and Titus' triumph (N wall, −x)
    const ph = 1.25;
    const pw = r.depth * 0.82;
    const y = r.socle + 0.15 + ph / 2;
    for (const sx of [-1, 1]) {
      const x = sx * (W / 2 - 0.012);
      const rot = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
      panel(b, sx > 0 ? spoilsMaterial() : triumphMaterial(), pw, ph, TRS(x, y, 0, 0, rot, 0));
      // moulded frame
      for (const dy of [-1, 1]) b.box('marble', 0.08, 0.1, pw + 0.2, T(x - sx * 0.03, y + dy * (ph / 2 + 0.05), 0));
      for (const dz of [-1, 1]) b.box('marble', 0.08, ph + 0.2, 0.1, T(x - sx * 0.03, y, dz * (pw / 2 + 0.05)));
    }
    // the apotheosis of Titus in the central coffer of the vault
    const crown = r.spring + W / 2;
    panel(b, apotheosisMaterial(), 1.0, 1.0, TRS(0, crown - 0.04, 0, -Math.PI / 2, 0, 0));
  }
  p.spot('arch-titus', 'inscription', 0, 0, -hd - 4.5, 0);
  p.spot('arch-titus-spoils', 'inscription', 0, 0, 0, Math.PI / 2);
  p.spot('arch-titus-triumph', 'inscription', 0, 0, 0.3, -Math.PI / 2);
  // v0.0 spawn: on the Sacra Via just W of the arch, looking down towards the Forum
  p.spot('spawn-sacra-via', 'spawn', 0.5, 0, hd + 6, 0);
  p.spot('arch-titus-vista', 'vista', 0, 0, -hd - 9, Math.PI);
  summaSacraVia(p);
}

/**
 * The last climb of the Sacra Via to the arch (atlas real 310, 147 → 340, 180): the terrain model
 * puts a 4.5 m step just below the arch's pad, so the street is carried up on an embanked causeway
 * at an even grade (about 1 in 6), basalt between travertine kerbs, its retaining walls of tufa
 * ashlar with a parapet: the Flavian regrading of the summa Sacra Via. Skipped where the terrain is
 * already smooth (less than a metre to make up).
 */
function summaSacraVia(p: Part) {
  const { b, ctx } = p;
  const A = atlasToLocal(ctx, 310, 147.1);
  const B = atlasToLocal(ctx, 340.5, 180.5);
  const yA = ctx.groundAt(A[0], A[1]) + 0.03;
  const yB = ctx.groundAt(B[0], B[1]) + 0.03;
  const dx = B[0] - A[0];
  const dz = B[1] - A[1];
  const L = Math.hypot(dx, dz);
  // is there a step to smooth? (sample the road profile against the straight line)
  let worst = 0;
  for (let k = 1; k < 10; k++) {
    const t = k / 10;
    worst = Math.max(worst, yA + (yB - yA) * t - ctx.groundAt(A[0] + dx * t, A[1] + dz * t));
  }
  if (worst < 1.0) return;
  const u = new THREE.Vector3(dx / L, 0, dz / L);
  const n = new THREE.Vector3(-u.z, 0, u.x);
  const yaw = Math.atan2(u.x, u.z);
  const pitch = Math.atan2(yB - yA, L);
  const mid = (o: number, y: number) => new THREE.Matrix4().compose(new THREE.Vector3((A[0] + B[0]) / 2 + n.x * o, (yA + yB) / 2 + y, (A[1] + B[1]) / 2 + n.z * o), new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, yaw, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
  const hw = 3.3;
  const Ls = L / Math.cos(pitch);
  // deck (basalt), kerbs and sidewalks (travertine), parapets; the deck runs on 1.5 m below the
  // foot so its leading edge is buried in the street
  const lead = 1.5;
  const midD = (o: number, y: number) => mid(o, y).multiply(new THREE.Matrix4().makeTranslation(0, 0, -lead / 2));
  b.box('paving_basalt', 2 * hw - 1.8, 1.2, Ls + lead, midD(0, -0.6), { collide: p.main });
  for (const sx of [-1, 1]) {
    b.box('travertine', 0.9, 1.35, Ls + lead, midD(sx * (hw - 0.45), -0.6 + 0.075), { collide: p.main });
    b.box('reticulatum', 0.5, 1.0, Ls, mid(sx * (hw + 0.25), 0.5), { collide: p.main });
    b.box('travertine', 0.62, 0.12, Ls, mid(sx * (hw + 0.25), 1.06));
  }
  // retaining walls down to the ground on both sides (a vertical slab under each parapet)
  let gmin = Math.min(yA, yB);
  for (let k = 0; k <= 10; k++) {
    const t = k / 10;
    for (const sx of [-1, 1]) gmin = Math.min(gmin, ctx.groundAt(A[0] + dx * t + n.x * sx * hw, A[1] + dz * t + n.z * sx * hw));
  }
  for (const sx of [-1, 1]) {
    // shape x → along the road (from A on the right side, from B on the left, so the basis stays
    // right-handed), shape y → up, extrusion z → across, outward
    const [o, y0, y1] = sx > 0 ? [A, yA, yB] : [B, yB, yA];
    const shape: V2[] = [
      [0, gmin - 0.4],
      [L, gmin - 0.4],
      [L, y1],
      [0, y0],
    ];
    const g = extrudePolygon(shape, 0.6);
    const basis = new THREE.Matrix4().makeBasis(u.clone().multiplyScalar(sx), new THREE.Vector3(0, 1, 0), n.clone().multiplyScalar(sx));
    basis.setPosition(o[0] + n.x * sx * (hw - 0.05), 0, o[1] + n.z * sx * (hw - 0.05));
    b.add(g, 'reticulatum', basis);
  }
  p.spot('summa-sacra-via-vista', 'vista', A[0] + dx * 0.95, yB, A[1] + dz * 0.95, Math.atan2(-u.x, -u.z));
}

// ---------------------------------------------------------------- Arch of Augustus

function archAugustus(p: Part) {
  const W = 10.2 / 3.96;
  const r = forumArch(p, { W, bays: 3, order: 'corinthian', front: text('arch-augustus'), back: text('arch-augustus'), style: 'carved', sidePediments: true, quadriga: true, victories: true });
  // the Fasti: lists of magistrates on marble panels on the inner faces of the central piers
  if (p.hi) {
    for (const sx of [-1, 1]) {
      const x = sx * (W / 2 + 0.005);
      inscription(p.b, TRS(x, r.socle + 0.9, 0, 0, sx > 0 ? Math.PI / 2 : -Math.PI / 2, 0), text('arch-augustus-fasti'), r.depth * 0.8, 1.3, 'carved', { depth: 0.02, sizes: [1, 0.7, 0.7, 0.7] });
    }
  }
  p.spot('arch-augustus', 'inscription', 0, 0, -r.depth / 2 - 3.5, 0);
  p.spot('arch-augustus-fasti', 'inscription', 0, 0, 0, Math.PI / 2);
}

// ---------------------------------------------------------------- Arch of Tiberius

function archTiberius(p: Part) {
  const W = (8 * p.S) / 2.52;
  const r = forumArch(p, { W, bays: 1, order: 'corinthian', front: text('arch-tiberius'), back: text('arch-tiberius'), style: 'carved', quadriga: true, victories: true });
  p.spot('arch-tiberius', 'inscription', 0, 0, -r.depth / 2 - 3, 0);
}

// ---------------------------------------------------------------- Fornix Fabianus

function fornixFabianus(p: Part) {
  const { b, hi } = p;
  const r = plainArch(b, { span: 3.0, height: 4.6, pier: 0.9, depth: 2.2, material: 'peperino', detail: p.detail }, new THREE.Matrix4());
  // travertine attic carrying the restoration inscription
  const aw = r.width - 0.1;
  b.box('travertine', aw, 1.2, r.depth - 0.2, T(0, r.height + 0.6, 0), { collide: false });
  b.box('travertine', aw + 0.3, 0.16, r.depth + 0.1, T(0, r.height + 1.28, 0));
  for (const side of [-1, 1]) {
    const at = TRS(0, r.height + 0.6, side * ((r.depth - 0.2) / 2 + 0.02), 0, side < 0 ? 0 : Math.PI, 0);
    if (hi) inscription(b, at, text('fornix-fabianus'), aw * 0.8, 0.8, 'carved', { depth: 0.03, body: 'travertine', sizes: [1, 0.85] });
  }
  p.spot('fornix-fabianus', 'inscription', 0, 0, -r.depth / 2 - 2.5, 0);
}

export const builders: LandmarkBuilder[] = [
  { handles: ['arch-titus'], build: (ctx) => landmark(ctx, archTitus, { near: 110 }) },
  { handles: ['arch-augustus'], build: (ctx) => landmark(ctx, archAugustus, { near: 110 }) },
  { handles: ['arch-tiberius'], build: (ctx) => landmark(ctx, archTiberius, { near: 110 }) },
  { handles: ['fornix-fabianus'], build: (ctx) => landmark(ctx, fornixFabianus, { cull: 320 }) },
];
