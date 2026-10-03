/**
 * Vaulted forms of Roman concrete architecture: hemispherical domes (coffered, with an oculus),
 * rotundas (a drum with a door and niches under a dome), barrel vaults, exedrae and apses.
 *
 * Frames: domes are centred on their springing circle (y = 0 at the springing); rotundas,
 * exedrae and apses stand on the ground at y = 0 with their opening/door towards −z.
 */
import * as THREE from 'three';
import type { MeshBuilder } from '../../gfx/MeshBuilder';
import type { MaterialId } from '../../gfx/materialIds';
import { ProfileBuilder, T, gridSurface, lathe, linspace, makeGeometry, mul, sweep, type Profile, type V2 } from '../common/geom';
import { column } from './column';
import { diameterForHeight, type Detail, type Order } from './orders';

// ---------------------------------------------------------------- dome

export interface DomeSpec {
  /** Inner radius at the springing. */
  radius: number;
  /** Shell thickness at the springing (default 0.12 R); it thins towards the crown. */
  thickness?: number;
  /** Oculus radius (0 = closed). */
  oculus?: number;
  /** Coffers: rings × per ring (default 5 × 28, as in the Hadrianic Pantheon); false = plain. */
  coffers?: { rings: number; perRing: number } | false;
  /** Stepped rings on the extrados (default 5). */
  steps?: number;
  /** Inner (intrados) material. */
  material?: MaterialId;
  /** Outer (extrados) material — concrete, lead sheeting or tiles. */
  outerMaterial?: MaterialId;
  detail?: Detail;
  /** Angular range for half domes (apses): θ0..θ1, default full circle. */
  theta0?: number;
  theta1?: number;
}

/** Map a rib profile (p = protrusion into the room, w = across) into the latitude-ring sweep frame at elevation e. */
function ribRing(e: number, prof: V2[]): Profile {
  const c = Math.cos(e);
  const s = Math.sin(e);
  return { pts: prof.map(([p, w]) => [-p * c - w * s, -p * s + w * c] as V2), smooth: prof.map(() => false) };
}

export function dome(b: MeshBuilder, spec: DomeSpec, at?: THREE.Matrix4) {
  const m = at ?? new THREE.Matrix4();
  const R = spec.radius;
  const t = spec.thickness ?? 0.12 * R;
  const detail = spec.detail ?? 'high';
  const hi = detail === 'high';
  const ocu = spec.oculus ?? 0;
  const eTop = ocu > 0 ? Math.acos(Math.min(0.999, ocu / R)) : Math.PI / 2;
  const segs = hi ? 56 : 24;
  const th0 = spec.theta0 ?? 0;
  const th1 = spec.theta1 ?? Math.PI * 2;
  const range = { theta0: th0, theta1: th1 };
  const inner = spec.material ?? 'concrete';
  const outer = spec.outerMaterial ?? 'concrete';
  // Intrados: traverse from the crown down to the springing so normals face the centre.
  const rows = hi ? 18 : 8;
  const inPts: V2[] = linspace(eTop, 0, rows).map((e) => [R * Math.cos(e), R * Math.sin(e)] as V2);
  b.add(lathe({ pts: inPts, smooth: inPts.map(() => true) }, { segments: segs, ...range }), inner, m);
  // Extrados: thick haunches with stepped rings, thinning to t/3 at the oculus.
  const outerR = (e: number) => R + t * (1 - 0.65 * (e / (Math.PI / 2)));
  const steps = spec.steps ?? 5;
  const op = new ProfileBuilder(R + t, 0);
  const eSteps = 0.42;
  for (let k = 0; k < steps; k++) {
    const e = (eSteps * (k + 1)) / steps;
    const r = outerR(e) + t * 0.4 * (1 - k / steps);
    op.up(R * Math.sin(e) - op.y).in(Math.max(0, op.x - r));
  }
  for (const e of linspace(eSteps, eTop, hi ? 12 : 6)) op.to(outerR(e) * Math.cos(e), outerR(e) * Math.sin(e));
  if (ocu > 0) op.to(ocu, R * Math.sin(eTop));
  b.add(lathe(op.build(), { segments: segs, ...range }), outer, m);
  // Oculus rim: a bronze-clad ring joining the shells.
  if (ocu > 0) {
    const yTop = R * Math.sin(eTop);
    const rim = new ProfileBuilder(ocu, yTop).to(ocu - 0.02, yTop + t * 0.25).to(ocu - 0.15, yTop + t * 0.25).to(ocu - 0.15, yTop - 0.05).to(ocu * 0.999, yTop - 0.06).build();
    b.add(lathe(rim, { segments: segs, ...range }), 'bronze', m);
  }
  // Coffers: stepped latitude and meridian ribs on the intrados.
  const cof = spec.coffers === undefined ? { rings: 5, perRing: 28 } : spec.coffers;
  if (cof && hi) {
    const e0 = 0.12;
    const e1 = Math.min(eTop - 0.12, 1.05);
    const depth = 0.05 * R;
    const ribW = (R * (e1 - e0)) / cof.rings * 0.18;
    // two-step rib section: wide low step, narrower top
    const rib: V2[] = [
      [0, -ribW],
      [depth * 0.5, -ribW],
      [depth * 0.5, -ribW * 0.6],
      [depth, -ribW * 0.6],
      [depth, ribW * 0.6],
      [depth * 0.5, ribW * 0.6],
      [depth * 0.5, ribW],
      [0, ribW],
    ];
    const ringPath = (e: number) => linspace(th0, th1, segs).slice(0, th1 - th0 >= Math.PI * 2 - 1e-6 ? segs : segs + 1).map((a) => new THREE.Vector3(R * Math.cos(e) * Math.sin(a), R * Math.sin(e), R * Math.cos(e) * Math.cos(a)));
    const full = th1 - th0 >= Math.PI * 2 - 1e-6;
    for (let k = 0; k <= cof.rings; k++) {
      const e = e0 + ((e1 - e0) * k) / cof.rings;
      // walk with decreasing angle so the sweep's outward normal is +radial; profile maps inward
      const path = ringPath(e).reverse();
      b.add(sweep(ribRing(e, rib.map(([p, w]) => [p, w] as V2)), path, { closed: full, caps: !full }), inner, m);
    }
    for (let k = 0; k < cof.perRing; k++) {
      const a = th0 + ((th1 - th0) * (k + (full ? 0 : 0.5))) / cof.perRing;
      if (!full && k >= cof.perRing) break;
      const path = linspace(e0, e1, hi ? 10 : 4).map((e) => new THREE.Vector3(R * Math.cos(e) * Math.sin(a), R * Math.sin(e), R * Math.cos(e) * Math.cos(a)));
      const n = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
      const prof: Profile = { pts: rib.map(([p, w]) => [w, p] as V2), smooth: rib.map(() => false) };
      b.add(sweep(prof, path, { outward: n, caps: true }), inner, m);
    }
  }
  return { height: R * Math.sin(eTop) + t * 0.35 };
}

// ---------------------------------------------------------------- niches in curved walls

export interface CurvedNiche {
  /** Angle of the niche axis (lathe convention: (R sin a, y, R cos a)). */
  a: number;
  width: number;
  height: number;
  /** Sill height. */
  y0: number;
  /** Recess depth (default width / 2: a semicircular plan). */
  depth?: number;
}

/**
 * The inner face (radius R, y ∈ [0, H], facing the centre) of a curved wall between θ0 and θ1,
 * with real recessed niches: each opening is cut out of the face, lined with a half-elliptical
 * recess (semicircular plan by default), a floor and a flat soffit in `lining`. The recess runs
 * from the chord between the opening's edges into the wall, so it needs depth < wall thickness.
 */
export function innerFaceWithNiches(b: MeshBuilder, R: number, H: number, theta0: number, theta1: number, niches: CurvedNiche[], segs: number, mat: MaterialId, lining: MaterialId, m: THREE.Matrix4, detail: Detail) {
  const face = (a0: number, a1: number, y0: number, y1: number) => {
    if (a1 - a0 < 1e-6 || y1 - y0 < 1e-6) return;
    const n = Math.max(1, Math.ceil((segs * (a1 - a0)) / (Math.PI * 2)));
    b.add(lathe(new ProfileBuilder(R, y1).to(R, y0).build(), { segments: n, theta0: a0, theta1: a1 }), mat, m);
  };
  const list = [...niches].sort((p, q) => p.a - q.a).map((nc) => ({ ...nc, da: Math.asin(Math.min(0.95, nc.width / 2 / R)) }));
  let a = theta0;
  for (const nc of list) {
    face(a, nc.a - nc.da, 0, H);
    face(nc.a - nc.da, nc.a + nc.da, 0, nc.y0);
    face(nc.a - nc.da, nc.a + nc.da, nc.y0 + nc.height, H);
    a = nc.a + nc.da;
  }
  face(a, theta1, 0, H);
  const k = detail === 'high' ? 14 : 7;
  for (const nc of list) {
    const hw = nc.width / 2;
    const dep = nc.depth ?? hw;
    // Local frame: origin on the chord between the opening's edges, +z outward into the wall.
    const local = mul(m, new THREE.Matrix4().makeRotationY(nc.a).setPosition(R * Math.cos(nc.da) * Math.sin(nc.a), 0, R * Math.cos(nc.da) * Math.cos(nc.a)));
    const phis = linspace(-Math.PI / 2, Math.PI / 2, k);
    b.add(gridSurface(phis, [nc.y0, nc.y0 + nc.height], (f, y, out) => out.set(hw * Math.sin(f), y, dep * Math.cos(f)), { flip: true }), lining, local);
    // Floor and soffit: the lens between chord and wall face plus the recess's half-ellipse.
    const outline: V2[] = [];
    for (const t of linspace(nc.da, -nc.da, 4)) outline.push([R * Math.sin(t), R * Math.cos(t) - R * Math.cos(nc.da)]);
    for (const f of linspace(-Math.PI / 2, Math.PI / 2, k).slice(1, -1)) outline.push([hw * Math.sin(f), dep * Math.cos(f)]);
    b.add(flatPolygon(outline, nc.y0, true), lining, local);
    b.add(flatPolygon(outline, nc.y0 + nc.height, false), lining, local);
  }
}

/** A horizontal polygon given in (x, z), facing up or down. */
function flatPolygon(pts: V2[], y: number, up: boolean): THREE.BufferGeometry {
  const contour = pts.map(([x, z]) => new THREE.Vector2(x, z));
  if (THREE.ShapeUtils.isClockWise(contour)) contour.reverse();
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  const pos: number[] = [];
  const nor: number[] = [];
  for (const tri of tris) {
    // A CCW (x, z) contour seen from above (+y) is clockwise, so "up" needs the reversed order.
    const order = up ? [tri[0], tri[2], tri[1]] : tri;
    for (const i of order) {
      pos.push(contour[i].x, y, contour[i].y);
      nor.push(0, up ? 1 : -1, 0);
    }
  }
  return makeGeometry(pos, nor);
}

// ---------------------------------------------------------------- apse / exedra

export interface ApseSpec {
  /** Inner radius of the half-cylinder. */
  radius: number;
  /** Wall height to the springing of the semi-dome. */
  height: number;
  thickness?: number;
  material?: MaterialId;
  domeMaterial?: MaterialId;
  /** Semi-dome over the apse (default true). */
  semidome?: boolean;
  /** Statue niches round the curve (exedrae of the imperial fora). */
  niches?: number;
  /** Niche lining (default marble). */
  liningMaterial?: MaterialId;
  /** Columns across the open chord (screen colonnade). */
  colonnade?: { order: Order; count: number };
  detail?: Detail;
  collide?: boolean;
}

/**
 * Half-cylinder wall open towards −z, centred on the origin (the chord lies on z = 0 and the curve
 * bulges towards +z), optionally with a semi-dome, niches and a screen of columns.
 */
export function apse(b: MeshBuilder, spec: ApseSpec, at?: THREE.Matrix4) {
  const m = at ?? new THREE.Matrix4();
  const R = spec.radius;
  const t = spec.thickness ?? Math.max(0.6, 0.1 * R);
  const H = spec.height;
  const detail = spec.detail ?? 'high';
  const segs = detail === 'high' ? 32 : 12;
  const mat = spec.material ?? 'brick';
  // θ ∈ [−π/2, π/2] covers the +z half (x = r sin θ, z = r cos θ).
  const range = { theta0: -Math.PI / 2, theta1: Math.PI / 2 };
  // Outer face (going up: normal outward) + top; the inner face (with niches) separately.
  const wall = new ProfileBuilder(R + t, 0).up(H).in(t).build();
  b.add(lathe(wall, { segments: segs, ...range }), mat, m);
  // Wall ends at the chord.
  for (const sx of [-1, 1]) {
    const end = new THREE.BoxGeometry(t, H, 0.02);
    end.translate(sx * (R + t / 2), H / 2, 0.01);
    b.add(end, mat, m);
  }
  const niches: CurvedNiche[] = [];
  const n = spec.niches ?? 0;
  const nh = Math.min(H * 0.55, 3.2);
  const nw = Math.min((Math.PI * R) / (n + 1) * 0.55, nh * 0.5);
  for (let i = 0; i < n; i++) niches.push({ a: -Math.PI / 2 + (Math.PI * (i + 1)) / (n + 1), width: nw, height: nh, y0: H * 0.18, depth: Math.min(nw / 2, t - 0.15) });
  // Inner face going down (normal inward), with real recessed statue niches.
  innerFaceWithNiches(b, R, H, range.theta0, range.theta1, niches, segs * 2, mat, spec.liningMaterial ?? 'marble', m, detail);
  if (n > 0) {
    for (const { a } of niches) {
      // Marble frame round each recess.
      const local = new THREE.Matrix4().makeRotationY(a).setPosition(R * Math.sin(a), 0, R * Math.cos(a));
      for (const sx of [-1, 1]) {
        const jamb = new THREE.BoxGeometry(0.12, nh + 0.12, 0.14);
        jamb.translate(sx * (nw / 2 + 0.06), H * 0.18 + nh / 2, -0.07);
        b.add(jamb, 'marble', mul(m, local));
      }
      const lint = new THREE.BoxGeometry(nw + 0.4, 0.14, 0.18);
      lint.translate(0, H * 0.18 + nh + 0.07, -0.09);
      b.add(lint, 'marble', mul(m, local));
    }
  }
  if (spec.semidome ?? true) {
    dome(b, { radius: R, thickness: t, oculus: 0, coffers: detail === 'high' ? { rings: 4, perRing: 10 } : false, steps: 3, material: spec.domeMaterial ?? 'plaster_white', outerMaterial: 'roof_tile', detail, ...range }, mul(m, T(0, H, 0)));
  }
  if (spec.colonnade) {
    const c = spec.colonnade;
    const colH = H * 0.9;
    const D = diameterForHeight(c.order, colH);
    for (let i = 0; i < c.count; i++) {
      const x = -R + ((i + 0.5) * 2 * R) / c.count;
      column(b, { order: c.order, D, height: colH, material: 'marble', detail }, mul(m, T(x, 0, -0.2)));
    }
    const lintel = new THREE.BoxGeometry(2 * R + 2 * t, H * 0.1, D * 0.9);
    lintel.translate(0, colH + H * 0.05, -0.2);
    b.add(lintel, 'marble', m);
  }
  if (spec.collide ?? true) {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a0 = -Math.PI / 2 + (Math.PI * i) / n;
      const a1 = -Math.PI / 2 + (Math.PI * (i + 1)) / n;
      const am = (a0 + a1) / 2;
      const rm = R + t / 2;
      const len = 2 * rm * Math.sin((a1 - a0) / 2) + 0.1;
      const local = new THREE.Matrix4().makeRotationY(am).setPosition(rm * Math.sin(am), H / 2, rm * Math.cos(am));
      const w = mul(m, local);
      const pos = new THREE.Vector3();
      const q = new THREE.Quaternion();
      w.decompose(pos, q, new THREE.Vector3());
      b.collider({ kind: 'box', center: pos, half: new THREE.Vector3(len / 2, H / 2, t / 2), rotation: q });
    }
  }
}

/** An exedra: a large apse with statue niches and an optional screen of columns. */
export function exedra(b: MeshBuilder, spec: ApseSpec, at?: THREE.Matrix4) {
  apse(b, { niches: 5, ...spec }, at);
}

// ---------------------------------------------------------------- barrel vault

export interface BarrelVaultSpec {
  /** Clear span between the side walls. */
  span: number;
  /** Length along +z. */
  length: number;
  /** Height of the springing (side walls). */
  springing: number;
  thickness?: number;
  wallThickness?: number;
  material?: MaterialId;
  vaultMaterial?: MaterialId;
  coffers?: boolean;
  detail?: Detail;
  collide?: boolean;
}

/** A vaulted hall/passage: two side walls and a semicircular vault along z ∈ [0, length]. */
export function barrelVault(b: MeshBuilder, spec: BarrelVaultSpec, at?: THREE.Matrix4) {
  const m = at ?? new THREE.Matrix4();
  const r = spec.span / 2;
  const t = spec.thickness ?? Math.max(0.5, 0.12 * spec.span);
  const wt = spec.wallThickness ?? t * 1.2;
  const L = spec.length;
  const hs = spec.springing;
  const detail = spec.detail ?? 'high';
  const n = detail === 'high' ? 24 : 10;
  const mat = spec.material ?? 'brick';
  const vmat = spec.vaultMaterial ?? 'plaster_white';
  for (const sx of [-1, 1]) b.box(mat, wt, hs, L, mul(m, T(sx * (r + wt / 2), hs / 2, L / 2)), { collide: spec.collide ?? true });
  // Intrados (faces down/in) and extrados. Samples must increase: gridSurface derives normals
  // from increasing parameters, and the winding follows the sample order.
  const as = linspace(0, Math.PI, n);
  const zs = [0, L];
  b.add(gridSurface(as, zs, (a, z, o) => o.set(Math.cos(a) * r, hs + Math.sin(a) * r, z), { flip: true }), vmat, m);
  b.add(gridSurface(as, zs, (a, z, o) => o.set(Math.cos(a) * (r + t), hs + Math.sin(a) * (r + t), z)), mat, m);
  // End rings: ∂a × ∂k points −z, so the front (z = 0) keeps it and the back flips.
  for (const [z, flip] of [
    [0, false],
    [L, true],
  ] as const) {
    const g = gridSurface(as, [0, 1], (a, k, o) => o.set(Math.cos(a) * (r + k * t), hs + Math.sin(a) * (r + k * t), z), { flip });
    b.add(g, mat, m);
  }
  if (spec.coffers && detail === 'high') {
    const rows = Math.max(2, Math.round(L / 1.2));
    for (let j = 0; j <= rows; j++) {
      const z = (L * j) / rows;
      const rib = new ProfileBuilder(-0.08, 0).to(0.08, 0).to(0.08, 0.12).to(-0.08, 0.12).build();
      const path = linspace(Math.PI, 0, n).map((a) => new THREE.Vector3(Math.cos(a) * r, hs + Math.sin(a) * r, z));
      // (a sweep path may run either way; only gridSurface needs increasing samples)
      b.add(sweep({ pts: rib.pts.map(([x, y]) => [x, -y] as V2), smooth: rib.smooth }, path, { outward: new THREE.Vector3(0, 0, 1), caps: false }), vmat, m);
    }
    for (let i = 1; i < 8; i++) {
      const a = (Math.PI * i) / 8;
      const g = new THREE.BoxGeometry(0.16, 0.12, L);
      g.rotateZ(a - Math.PI / 2);
      g.translate(Math.cos(a) * (r - 0.06), hs + Math.sin(a) * (r - 0.06), L / 2);
      b.add(g, vmat, m);
    }
  }
}

// ---------------------------------------------------------------- rotunda

export interface RotundaSpec {
  /** Inner radius of the drum (= dome radius). */
  radius: number;
  /** Drum height to the dome's springing (Pantheon: = radius). */
  drumHeight?: number;
  wallThickness?: number;
  oculus?: number;
  material?: MaterialId;
  interiorMaterial?: MaterialId;
  floorMaterial?: MaterialId;
  /** Niches round the interior (alternating rectangular/semicircular in reality). */
  niches?: number;
  /** Niche lining (default: the interior material). */
  liningMaterial?: MaterialId;
  doorWidth?: number;
  detail?: Detail;
}

/** A domed rotunda with a door towards −z: drum + interior niches + coffered dome with an oculus. */
export function rotunda(b: MeshBuilder, spec: RotundaSpec, at?: THREE.Matrix4) {
  const m = at ?? new THREE.Matrix4();
  const R = spec.radius;
  const H = spec.drumHeight ?? R;
  const t = spec.wallThickness ?? Math.max(1.2, 0.16 * R);
  const detail = spec.detail ?? 'high';
  const segs = detail === 'high' ? 64 : 24;
  const mat = spec.material ?? 'brick';
  const imat = spec.interiorMaterial ?? 'marble';
  const doorW = spec.doorWidth ?? Math.min(4, R * 0.35);
  const doorH = Math.min(H * 0.7, doorW * 2);
  const half = Math.asin(Math.min(0.95, doorW / 2 / R));
  const halfOut = Math.asin(Math.min(0.95, doorW / 2 / (R + t)));
  // Outer drum (brick with a marble base and cornice), with the door gap at θ = π.
  const outer = new ProfileBuilder(R + t, 0).up(H).build();
  b.add(lathe(outer, { segments: segs, theta0: Math.PI + halfOut, theta1: Math.PI * 3 - halfOut }), mat, m);
  const top = new ProfileBuilder(R + t, H).to(R, H).build();
  b.add(lathe(top, { segments: segs }), mat, m);
  // Inner face (traverse down so normals face the centre) with recessed niches.
  const niches = spec.niches ?? 6;
  const nw = Math.min(2.4, R * 0.28);
  const nh = Math.min(H * 0.5, 4.2);
  const nicheList: CurvedNiche[] = [];
  for (let i = 0; i < niches; i++) nicheList.push({ a: Math.PI + ((i + 1) * Math.PI * 2) / (niches + 1), width: nw, height: nh, y0: H * 0.12, depth: Math.min(nw / 2, t - 0.25) });
  innerFaceWithNiches(b, R, H, Math.PI + half, Math.PI * 3 - half, nicheList, segs, imat, spec.liningMaterial ?? imat, m, detail);
  // Lintel over the door through the wall thickness.
  const lin = new ProfileBuilder(R + t, doorH).up(H - doorH).build();
  b.add(lathe(lin, { segments: 4, theta0: Math.PI - halfOut, theta1: Math.PI + halfOut }), mat, m);
  b.add(lathe(new ProfileBuilder(R, H).to(R, doorH).build(), { segments: 4, theta0: Math.PI - half, theta1: Math.PI + half }), imat, m);
  const soffit = new ProfileBuilder(R, doorH).to(R + t, doorH).build();
  b.add(lathe(soffit, { segments: 4, theta0: Math.PI - half, theta1: Math.PI + half }), mat, m);
  for (const sx of [-1, 1]) {
    const jamb = new THREE.BoxGeometry(0.04, doorH, t);
    jamb.translate(sx * doorW / 2, doorH / 2, -(R + t / 2));
    b.add(jamb, 'marble', m);
  }
  // Mouldings outside: base and cornice.
  const n = detail === 'high' ? 3 : 1;
  const base = new ProfileBuilder(R + t - 0.05, 0).out(0.25).up(0.3).cymaReversa(-0.2, 0.2, n).to(R + t - 0.05, 0.5).build();
  b.add(lathe(base, { segments: segs, theta0: Math.PI + halfOut + 0.05, theta1: Math.PI * 3 - halfOut - 0.05 }), 'marble', m);
  const corn = new ProfileBuilder(R + t - 0.05, H - 0.6).to(R + t, H - 0.6).cymaReversa(0.12, 0.2, n).up(0.1).out(0.3).up(0.2).to(R + t, H).to(R + t - 0.05, H - 0.03).build();
  b.add(lathe(corn, { segments: segs }), 'marble', m);
  // Interior: floor, niches with frames, an attic cornice at the springing.
  b.add(lathe(new ProfileBuilder(R, 0.03).to(0, 0.03).build(), { segments: segs }), spec.floorMaterial ?? 'paving_travertine', m, { castShadow: false });
  for (const { a } of nicheList) {
    // Giallo antico colonnettes and a marble cornice frame each recess; local −z faces the room.
    const local = new THREE.Matrix4().makeRotationY(a).setPosition(R * Math.sin(a), 0, R * Math.cos(a));
    for (const sx of [-1, 1]) {
      const col = new THREE.BoxGeometry(0.22, nh + 0.2, 0.25);
      col.translate(sx * (nw / 2 + 0.11), H * 0.12 + nh / 2, -0.06);
      b.add(col, 'marble_giallo', mul(m, local));
    }
    const ped = new THREE.BoxGeometry(nw + 0.8, 0.25, 0.4);
    ped.translate(0, H * 0.12 + nh + 0.22, -0.12);
    b.add(ped, 'marble', mul(m, local));
  }
  const attic = new ProfileBuilder(R, H - 0.5).to(R - 0.25, H - 0.35).to(R - 0.25, H - 0.15).to(R, H).build();
  b.add(lathe({ pts: [...attic.pts].reverse(), smooth: attic.smooth }, { segments: segs }), 'marble', m);
  // Dome.
  const d = dome(b, { radius: R, thickness: t * 0.9, oculus: spec.oculus ?? R * 0.2, material: 'plaster_white', outerMaterial: 'lead', detail }, mul(m, T(0, H, 0)));
  // Colliders: segments of the drum ring, skipping the door.
  const k = 28;
  for (let i = 0; i < k; i++) {
    const a0 = (i / k) * Math.PI * 2;
    const a1 = ((i + 1) / k) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    if (Math.abs(((am - Math.PI + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < half + Math.PI / k) continue;
    const rm = R + t / 2;
    const len = 2 * rm * Math.sin(Math.PI / k) + 0.1;
    const local = new THREE.Matrix4().makeRotationY(am).setPosition(rm * Math.sin(am), H / 2, rm * Math.cos(am));
    const w = mul(m, local);
    const pos = new THREE.Vector3();
    const q = new THREE.Quaternion();
    w.decompose(pos, q, new THREE.Vector3());
    b.collider({ kind: 'box', center: pos, half: new THREE.Vector3(len / 2, H / 2, t / 2), rotation: q });
  }
  return { height: H + d.height };
}
