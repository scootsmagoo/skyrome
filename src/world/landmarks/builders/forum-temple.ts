/**
 * Temple and arcade bodies for the Forum builders, assembled from the classical kit's pieces
 * (templeLayout, podium, entablature, pediment, wall, stairs) but with the column tiers of
 * forum-kit `col()`: full kit columns only on the front row the player walks past, cheaper 'mid'
 * columns elsewhere, kit 'low' columns in the far stand-ins. That keeps an octastyle peripteral
 * temple (Castor) near 150k triangles instead of the kit's 300k.
 *
 * Frames follow the kit: facade towards −z, origin on the ground at the plan centre.
 */
import * as THREE from 'three';
import { archway } from '../../../arch/classical/arch';
import { acroterion, entablature, pediment } from '../../../arch/classical/entablature';
import { ORDER_PROPORTIONS, diameterForHeight, type Order } from '../../../arch/classical/orders';
import { podium } from '../../../arch/classical/podium';
import { quadriga } from '../../../arch/classical/statues';
import { templeLayout, type TempleLayout, type TempleSpec } from '../../../arch/classical/temple';
import { T, TRS, makeGeometry, mul, type V2 } from '../../../arch/common/geom';
import { stairs } from '../../../arch/common/stairs';
import { wall } from '../../../arch/common/walls';
import type { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../gfx/materialIds';
import { UV_METERS } from '../../../gfx/textures/catalog';
import { col, inscription, type Part, type Tier } from './forum-kit';
import { drapedFemale, figure, nudeMale } from './forum-figures';

// ---------------------------------------------------------------- roof

/** Gable roof (ridge along z) with per-plane tile UVs, a timber underside and, near, imbrex ribs. */
export function gableRoof(b: MeshBuilder, x0: number, x1: number, z0: number, z1: number, yEave: number, pitch: number, mat: MaterialId, hi: boolean, m: THREE.Matrix4) {
  const halfW = (x1 - x0) / 2;
  const rise = halfW * Math.tan(pitch);
  const xr = (x0 + x1) / 2;
  const slopeLen = halfW / Math.cos(pitch);
  for (const side of [-1, 1]) {
    const xe = side < 0 ? x0 : x1;
    const top = (x: number, z: number) => [x, yEave + rise * (1 - Math.abs(x - xr) / halfW), z];
    const A = top(xr, z0);
    const B = top(xr, z1);
    const C = top(xe, z1);
    const Dd = top(xe, z0);
    const L = (z1 - z0) / UV_METERS;
    const S = slopeLen / UV_METERS;
    const n = new THREE.Vector3(side * Math.sin(pitch), Math.cos(pitch), 0);
    const pos: number[] = [];
    const nor: number[] = [];
    const uv: number[] = [];
    const tri = (pts: number[][], uvs: number[][]) => {
      for (let i = 0; i < 3; i++) {
        pos.push(...pts[i]);
        nor.push(n.x, n.y, n.z);
        uv.push(...uvs[i]);
      }
    };
    if (side > 0) {
      tri([A, B, C], [[0, 0], [L, 0], [L, S]]);
      tri([A, C, Dd], [[0, 0], [L, S], [0, S]]);
    } else {
      tri([A, Dd, C], [[0, 0], [0, S], [L, S]]);
      tri([A, C, B], [[0, 0], [L, S], [L, 0]]);
    }
    b.add(makeGeometry(pos, nor, uv), mat, m, { uv: 'keep' });
    const slab = new THREE.BoxGeometry(slopeLen, 0.16, z1 - z0);
    slab.rotateZ(side * -pitch);
    slab.translate((xr + xe) / 2, yEave + rise / 2 - 0.1, (z0 + z1) / 2);
    // the timber underside also casts the roof's shadow (the tile plane alone is one-sided)
    b.add(slab, 'wood_dark', m);
    if (hi && mat === 'roof_tile') {
      const step = 0.48;
      const nR = Math.floor((z1 - z0) / step);
      const ridge = new THREE.CylinderGeometry(0.07, 0.07, slopeLen, 4, 1, true);
      ridge.rotateZ(Math.PI / 2);
      ridge.rotateZ(side * -pitch);
      for (let k = 0; k < nR; k++) {
        const z = z0 + (k + 0.5) * ((z1 - z0) / nR);
        b.add(ridge.clone().translate((xr + xe) / 2, yEave + rise / 2 + 0.01, z), mat, m);
      }
    }
  }
  const cap = new THREE.CylinderGeometry(0.16, 0.16, z1 - z0, 6);
  cap.rotateX(Math.PI / 2);
  cap.translate(xr, yEave + rise + 0.06, (z0 + z1) / 2);
  b.add(cap, mat, m);
  return rise;
}

/** Lean-to (shed) roof falling from (yHigh at z0) to (yLow at z1), spanning x0..x1. */
export function shedRoof(b: MeshBuilder, x0: number, x1: number, z0: number, z1: number, yHigh: number, yLow: number, mat: MaterialId, m: THREE.Matrix4) {
  const a = [x0, yHigh, z0];
  const bb = [x1, yHigh, z0];
  const c = [x1, yLow, z1];
  const d = [x0, yLow, z1];
  const n = new THREE.Vector3(0, z1 - z0, yHigh - yLow).normalize();
  if (z1 < z0) n.negate();
  const L = (x1 - x0) / UV_METERS;
  const S = Math.hypot(z1 - z0, yHigh - yLow) / UV_METERS;
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const put = (p: number[], u: number, v: number) => {
    pos.push(...p);
    nor.push(n.x, n.y, n.z);
    uv.push(u, v);
  };
  // Winding so the face points up: check with the cross product of the first triangle.
  const e1 = new THREE.Vector3(bb[0] - a[0], bb[1] - a[1], bb[2] - a[2]);
  const e2 = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  const up = e1.cross(e2).y > 0;
  if (up) {
    put(a, 0, 0); put(bb, L, 0); put(c, L, S);
    put(a, 0, 0); put(c, L, S); put(d, 0, S);
  } else {
    put(a, 0, 0); put(c, L, S); put(bb, L, 0);
    put(a, 0, 0); put(d, 0, S); put(c, L, S);
  }
  b.add(makeGeometry(pos, nor, uv), mat, m, { uv: 'keep' });
  const under = new THREE.BoxGeometry(x1 - x0, 0.12, Math.hypot(z1 - z0, yHigh - yLow));
  under.rotateX(Math.atan2(yHigh - yLow, z1 - z0));
  under.translate((x0 + x1) / 2, (yHigh + yLow) / 2 - 0.09, (z0 + z1) / 2);
  b.add(under, 'wood_dark', m);
}

// ---------------------------------------------------------------- temple

export interface ForumTempleSpec extends TempleSpec {
  /** Tier of the front-row columns (default 'hero' near). */
  frontTier?: Tier;
  /** Tier of the other columns (default 'mid' near). */
  tier?: Tier;
  /** Only this many central columns of the front row get the front tier (default all). */
  frontCount?: number;
  /** Front frieze inscription (lines), in bronze letters by default. */
  frieze?: string[];
  friezeStyle?: 'bronze' | 'carved';
  friezeMaterial?: MaterialId | THREE.Material;
  /** Crowning figures on the pediment apex: a gilded quadriga, three standing gods, or palmettes. */
  crown?: 'quadriga' | 'figures' | 'palmette' | 'none';
  /** Skip the kit stairs (the caller builds its own). */
  ownStairs?: boolean;
  /** Override the podium outline (and its box colliders). */
  podiumOutline?: V2[];
  podiumColliders?: [number, number, number, number][];
  /** Open bronze door leaves (the cella stays solid behind a dark doorway). */
  doorOpen?: boolean;
  /** Detail of the entablature and pediments (default: 'high' near for hero temples, else 'low'). */
  entDetail?: 'high' | 'low';
  /** Material of the stair flights (default: the podium's). */
  stairMaterial?: MaterialId;
}

export interface ForumTempleResult {
  L: TempleLayout;
  /** Podium height. */
  P: number;
  /** Column top (architrave bottom). */
  yE: number;
  /** Top of the horizontal cornice. */
  yTop: number;
  /** Apex of the pediment above yTop. */
  apex: number;
  /** Entablature rectangle (architrave faces). */
  e: TempleLayout['entablature'];
  friezeX: number;
  architrave: number;
  frieze: number;
}

/** A complete temple (podium, stairs, columns, cella, entablature, pediments, roof) at `at`. */
export function forumTemple(p: Part, spec: ForumTempleSpec, at: THREE.Matrix4 = new THREE.Matrix4()): ForumTempleResult {
  const { b, hi } = p;
  const L = templeLayout(spec);
  const m = at;
  const detail = p.detail;
  const mat = spec.material ?? 'marble';
  const podMat = spec.podiumMaterial ?? 'travertine';
  // a slightly greyer marble for the cella walls, so the columns read against them in shade
  const cellaMat = spec.cellaMaterial ?? (mat === 'marble' ? 'marble_veined' : mat);
  const P = L.podiumHeight;
  const pitchDeg = spec.pitchDeg ?? 14;
  const pitch = (pitchDeg * Math.PI) / 180;
  const { stylobate: s, stairs: st } = L;

  // Podium.
  const outline: V2[] =
    spec.podiumOutline ??
    (L.stairMode === 'front'
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
        ]);
  const rects: [number, number, number, number][] =
    spec.podiumColliders ??
    (L.stairMode === 'front'
      ? [
          [s.x0, s.z0, s.x1, s.z1],
          [s.x0, st.z0, st.x0, s.z0],
          [st.x1, st.z0, s.x1, s.z0],
        ]
      : [[s.x0, L.podiumFront, s.x1, s.z1]]);
  podium(b, { outline, height: P, material: podMat, topMaterial: 'paving_travertine', detail, colliders: p.main ? rects : [] }, m);
  if (!spec.ownStairs) {
    for (const f of L.flights) stairs(b, { width: f.x1 - f.x0, rise: f.rise, run: f.run, count: f.count, material: spec.stairMaterial ?? podMat, collider: p.main ? 'steps' : 'none' }, mul(m, T((f.x0 + f.x1) / 2, 0, f.z0)));
  }

  // Columns: the front row at the front tier, the rest cheaper.
  const zFront = Math.min(...L.columns.map((c) => c.z));
  const fc = spec.frontCount ?? L.front;
  for (const c of L.columns) {
    const front = Math.abs(c.z - zFront) < 1e-3 && c.kind === 'free' && Math.abs(c.x) < (fc / 2) * L.axial;
    const tier: Tier = !hi ? 'stub' : front ? (spec.frontTier ?? 'hero') : (spec.tier ?? 'mid');
    col(b, { order: L.order, D: L.D, H: L.H, tier, material: mat, kind: c.kind, collide: p.main && c.kind === 'free' }, mul(m, TRS(c.x, P, c.z, 0, c.rotY, 0)));
  }

  // Cella.
  const e = L.entablature;
  const cl = L.cella;
  const ent0 = ORDER_PROPORTIONS[L.order];
  const entH = L.H * ent0.entablatureRatio;
  const wallH = L.H + entH * 0.55;
  const t = cl.wall;
  const cw = cl.x1 - cl.x0;
  const cd = cl.z1 - cl.z0;
  const doorW = Math.min(cw * 0.42, L.H * 0.36);
  const doorH = Math.min(L.H * 0.72, doorW * 2.1);
  const course = Math.max(0.45, L.D * 0.5);
  const wallOpts = { height: wallH, thickness: t, material: cellaMat, courses: hi ? course : 0, detail, collide: false } as const;
  wall(b, { ...wallOpts, length: cw, openings: [{ kind: 'door', x: cw / 2, width: doorW, height: doorH, leafMaterial: spec.doorMaterial ?? 'bronze', leaves: spec.doorOpen ? 'open' : 'closed' }] }, mul(m, T(cl.x0, P, cl.z0 + t / 2)));
  if (spec.doorOpen) {
    // Dark interior behind the open leaves (the cella itself stays a solid block).
    b.box('black', doorW + 0.6, doorH + 0.3, 0.1, mul(m, T(0, P + doorH / 2, cl.z0 + t + doorW * 0.55 + 0.3)), { castShadow: false });
  }
  wall(b, { ...wallOpts, length: cw }, mul(m, TRS(cl.x1, P, cl.z1 - t / 2, 0, Math.PI, 0)));
  wall(b, { ...wallOpts, length: cd - 2 * t + 0.002 }, mul(m, TRS(cl.x1 - t / 2, P, cl.z0 + t - 0.001, 0, -Math.PI / 2, 0)));
  wall(b, { ...wallOpts, length: cd - 2 * t + 0.002 }, mul(m, TRS(cl.x0 + t / 2, P, cl.z1 - t + 0.001, 0, Math.PI / 2, 0)));
  if (p.main) {
    const c = new THREE.Vector3((cl.x0 + cl.x1) / 2, P + wallH / 2, (cl.z0 + cl.z1) / 2).applyMatrix4(m);
    const q = new THREE.Quaternion();
    m.decompose(new THREE.Vector3(), q, new THREE.Vector3());
    b.collider({ kind: 'box', center: c, half: new THREE.Vector3(cw / 2, wallH / 2, cd / 2), rotation: q });
  }
  if (L.plan === 'sine_postico') wall(b, { ...wallOpts, length: e.x1 - e.x0, collide: p.main }, mul(m, TRS(e.x1, P, L.spanZ / 2, 0, Math.PI, 0)));

  // Entablature.
  const yE = P + L.H;
  const path = [new THREE.Vector3(e.x0, yE, e.z0), new THREE.Vector3(e.x1, yE, e.z0), new THREE.Vector3(e.x1, yE, e.z1), new THREE.Vector3(e.x0, yE, e.z1)];
  const hero = (spec.frontTier ?? 'hero') === 'hero';
  const eDetail = hi ? (spec.entDetail ?? (hero ? 'high' : 'low')) : 'low';
  const ent = entablature(b, path, { order: L.order, columnHeight: L.H, D: L.D, material: mat, detail: eDetail, axial: L.axial, friezeMaterial: spec.friezeMaterial }, { closed: true, at: m });
  if (spec.frieze?.length && hi) {
    const F = ent.dims.frieze;
    const w = Math.min(e.x1 - e.x0 - 1.0, (e.x1 - e.x0) * 0.86);
    inscription(b, mul(m, T(0, yE + ent.dims.architrave + F / 2, e.z0 - ent.friezeX - 0.012)), spec.frieze, w, F * 0.8, spec.friezeStyle ?? 'bronze', { depth: 0.01, sizes: spec.frieze.map(() => 1) });
  }
  {
    const yc = yE + ent.dims.architrave + ent.dims.frieze;
    const ceil = new THREE.BoxGeometry(e.x1 - e.x0 - 0.2, 0.25, e.z1 - e.z0 - 0.2);
    ceil.translate(0, yc - 0.125 + 0.02, (e.z0 + e.z1) / 2);
    b.add(ceil, 'marble', m, { castShadow: false });
    const fill = new THREE.BoxGeometry(cw, Math.max(0.05, yc - (P + wallH) + 0.02), cd);
    fill.translate((cl.x0 + cl.x1) / 2, (P + wallH + yc) / 2, (cl.z0 + cl.z1) / 2);
    b.add(fill, cellaMat, m);
  }
  // Pediments and roof.
  const yTop = yE + ent.dims.total;
  const span = e.x1 - e.x0;
  const ped = { order: L.order, span, cornice: ent.dims.cornice, depth: 0.9 * L.D, friezeX: ent.friezeX, pitchDeg, material: mat, detail: eDetail, D: L.D };
  const pf = pediment(b, { ...ped, relief: (spec.pedimentRelief ?? hero) && hi }, mul(m, T(0, yTop, e.z0)));
  pediment(b, ped, mul(m, TRS(0, yTop, e.z1, 0, Math.PI, 0)));
  const roofMat = spec.roofMaterial ?? 'roof_tile';
  const over = ent.projection + 0.1;
  gableRoof(b, e.x0 - over, e.x1 + over, e.z0 + 0.4 * L.D, e.z1 - 0.4 * L.D, yTop - 0.05, pitch, roofMat, hi, m);
  const crown = spec.crown ?? 'palmette';
  const size = L.D * 1.1;
  const acMat: MaterialId = roofMat === 'gilded_bronze' ? 'gilded_bronze' : mat;
  for (const z of [e.z0, e.z1]) {
    const zz = z + (z < 0 ? -ent.friezeX : ent.friezeX);
    const rot = z < 0 ? 0 : Math.PI;
    if (!hi && (crown === 'quadriga' || crown === 'figures')) {
      // far stand-in: a plain block for the crowning group
      if (z < 0) b.box(acMat === 'gilded_bronze' ? acMat : 'gilded_bronze', L.D * 1.6, L.D * 1.6, L.D * 1.2, mul(m, T(0, yTop + pf.apex + L.D * 0.7, zz + 0.6)));
    } else if (crown === 'quadriga' && z < 0) {
      quadriga(b, mul(m, TRS(0, yTop + pf.apex - 0.15, zz + 0.9, 0, rot, 0)), { material: 'gilded_bronze', driverMaterial: 'gilded_bronze', scale: Math.max(0.6, L.D * 0.75), detail: 'low' });
    } else if (crown === 'figures' && z < 0) {
      figure(b, mul(m, TRS(0, yTop + pf.apex - 0.15, zz + 0.3, 0, rot, 0)), false, 'gilded_bronze', Math.max(0.9, L.D * 1.2), (sc) => nudeMale(sc, { right: 'raised', left: 'spear', cloak: true }));
    } else if (crown !== 'none') {
      acroterion(b, size * 1.25, acMat, mul(m, TRS(0, yTop + pf.apex - 0.1, zz, 0, rot, 0)), eDetail);
    }
    if (crown === 'figures' && hi) {
      for (const x of [e.x0 + 0.5, e.x1 - 0.5]) {
        figure(b, mul(m, TRS(x, yTop + 0.05, zz + (z < 0 ? 0.35 : -0.35), 0, rot, 0)), false, 'gilded_bronze', Math.max(0.8, L.D * 1.0), (sc) => drapedFemale(sc, { right: 'wreath', left: 'palm', wings: true }));
      }
    } else if (crown !== 'none') {
      for (const x of [e.x0 + 0.3, e.x1 - 0.3]) acroterion(b, size, acMat, mul(m, TRS(x, yTop + 0.05, zz, 0, rot, 0)), eDetail);
    }
  }
  return { L, P, yE, yTop, apex: pf.apex, e, friezeX: ent.friezeX, architrave: ent.dims.architrave, frieze: ent.dims.frieze };
}

// ---------------------------------------------------------------- arcades

export interface ArcadeStoreySpec {
  order: Order | 'none';
  /** Storey height including its entablature. */
  height: number;
  /** Pedestal / parapet zone under the columns (upper storeys). */
  pedestal?: number;
  /** Arch crown above the storey floor. */
  crown?: number;
  /** Blank wall instead of arches (closed storey with optional windows). */
  blind?: boolean;
  /** Small windows in a blind storey. */
  windows?: boolean;
  /** Column tier for this storey (overrides the row's). */
  tier?: Tier;
}

export interface ArcadeRowSpec {
  bays: number;
  bay: number;
  pier: number;
  depth: number;
  storeys: ArcadeStoreySpec[];
  material?: MaterialId;
  trim?: MaterialId;
  /** Column tier for the engaged columns (default 'mid' near, 'low' far). */
  tier?: Tier;
  /** Collide the ground-storey piers. */
  collide?: boolean;
  /** Skip the entablature return caps. */
  caps?: boolean;
  /** Detail of the arch heads and archivolts (default: the part's detail). */
  archDetail?: 'high' | 'low';
}

/** Entablature height of an arcade storey. */
export function storeyEnt(s: ArcadeStoreySpec) {
  return s.height * 0.16;
}

/**
 * A straight run of arcade bays along +x from x = 0 (front face at z = −depth/2), storeys stacked:
 * piers, semicircular arches with archivolts and imposts, engaged half-columns on the front face
 * between the bays, a parapet in each upper arch and an entablature per storey. Returns the total height.
 */
export function arcadeRow(p: Part, spec: ArcadeRowSpec, m: THREE.Matrix4): number {
  const { b, hi } = p;
  const mat = spec.material ?? 'travertine';
  const tier: Tier = hi ? (spec.tier ?? 'mid') : 'stub';
  const { bay, pier, depth, bays } = spec;
  const len = bays * bay;
  let y = 0;
  spec.storeys.forEach((s, si) => {
    const entH = storeyEnt(s);
    const ped = s.pedestal ?? 0;
    const order: Order = s.order === 'none' ? 'tuscan' : s.order;
    const colH = s.height - entH - ped;
    const D = Math.min(diameterForHeight(order, colH), bay * 0.2);
    const top = s.height - entH;
    if (s.blind) {
      b.box(mat, len, top, depth, mul(m, T(len / 2, y + top / 2, 0)), { collide: p.main && si === 0 && (spec.collide ?? true) });
      if (s.windows && hi) {
        for (let i = 0; i < bays; i++) b.box('black', bay * 0.22, top * 0.28, 0.04, mul(m, T((i + 0.5) * bay, y + top * 0.55, -depth / 2 - 0.01)), { castShadow: false });
      }
    } else {
      const span = bay - pier;
      const crown = s.crown ?? Math.min(top * 0.86, ped + colH * 0.88);
      const spring = crown - span / 2;
      for (let i = 0; i < bays; i++) {
        const x = (i + 0.5) * bay;
        archway(b, { span, springing: spring, pier: 0, depth, top, material: mat, trim: spec.trim ?? mat, detail: hi ? (spec.archDetail ?? 'high') : 'low', leftPier: false, rightPier: false, collide: false, keystone: hi }, mul(m, T(x, y, 0)));
        if (ped > 0) b.box(mat, span, ped * 0.92, depth * 0.3, mul(m, T(x, y + (ped * 0.92) / 2, -depth / 2 + depth * 0.15)), { collide: false });
      }
      // Piers between the arches (full piers inside, half piers at the ends).
      for (let i = 0; i <= bays; i++) {
        const w = i === 0 || i === bays ? pier / 2 : pier;
        const x = i === 0 ? w / 2 : i === bays ? len - w / 2 : i * bay;
        b.box(mat, w, top, depth, mul(m, T(x, y + top / 2, 0)), { collide: p.main && si === 0 && (spec.collide ?? true) });
      }
    }
    if (s.order !== 'none') {
      for (let i = 0; i <= bays; i++) {
        const x = i * bay;
        if (ped > 0) b.box(mat, D * 1.4, ped, D * 0.75, mul(m, T(x, y + ped / 2, -depth / 2 - D * 0.3)));
        col(b, { order, D, H: colH, tier: hi ? (s.tier ?? tier) : 'stub', material: mat, kind: 'engaged', collide: false }, mul(m, T(x, y + ped, -depth / 2)));
      }
      const d = D * ORDER_PROPORTIONS[order].topRatio;
      const ez = -depth / 2 - d / 2;
      const path = [new THREE.Vector3(-0.3, y + top, ez), new THREE.Vector3(len + 0.3, y + top, ez)];
      entablature(b, path, { order, columnHeight: colH, D, material: mat, detail: hi && (s.tier ?? tier) !== 'low' && (s.tier ?? tier) !== 'stub' ? 'high' : 'low', dims: { architrave: entH * 0.3, frieze: entH * 0.3, cornice: entH * 0.4 }, depth: depth * 0.5 + d / 2, axial: bay }, { at: m, caps: spec.caps ?? true });
    } else {
      b.box(mat, len + 0.2, entH, depth + 0.3, mul(m, T(len / 2, y + top + entH / 2, 0)));
    }
    y += s.height;
  });
  return y;
}
