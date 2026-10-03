/**
 * Amphitheatres: the Colosseum-type elliptical facade (superimposed arcaded storeys with Tuscan,
 * Ionic and Corinthian half-columns, an attic with pilasters, windows, corbels and velarium
 * masts) and the cavea (stepped seating rings round an arena, podium wall, walkable rows).
 *
 * Plan frame: the ellipse is centred on the origin with semi-axes rx (along x) and rz (along z).
 * Bays are spaced at EQUAL ARC LENGTH (not equal angle), so arches are all the same width.
 */
import * as THREE from 'three';
import type { MeshBuilder } from '../../gfx/MeshBuilder';
import type { MaterialId } from '../../gfx/materialIds';
import { ProfileBuilder, mul, sweep, type V2 } from '../common/geom';
import { arcadeBay, storeyColumn, type ArcadeSpec, type ArcadeStorey } from './arch';
import { porticus } from './porticus';
import { entablature } from './entablature';
import { ORDER_PROPORTIONS, type Detail, type Order } from './orders';

// ---------------------------------------------------------------- ellipse arithmetic (pure)

/** Point on the ellipse at parameter t. */
export function ellipseAt(rx: number, rz: number, t: number): [number, number] {
  return [rx * Math.cos(t), rz * Math.sin(t)];
}

/** Perimeter by numerical integration (accurate to ~1e-6 relative with n = 2048). */
export function ellipsePerimeter(rx: number, rz: number, n = 2048): number {
  let p = 0;
  let [x0, z0] = ellipseAt(rx, rz, 0);
  for (let i = 1; i <= n; i++) {
    const [x1, z1] = ellipseAt(rx, rz, (i / n) * Math.PI * 2);
    p += Math.hypot(x1 - x0, z1 - z0);
    x0 = x1;
    z0 = z1;
  }
  return p;
}

/** Parameters t_i (i = 0..n−1) that split the ellipse into n arcs of equal length. */
export function equalArcParams(rx: number, rz: number, n: number, samples = 4096): number[] {
  const cum: number[] = [0];
  let [x0, z0] = ellipseAt(rx, rz, 0);
  for (let i = 1; i <= samples; i++) {
    const [x1, z1] = ellipseAt(rx, rz, (i / samples) * Math.PI * 2);
    cum.push(cum[i - 1] + Math.hypot(x1 - x0, z1 - z0));
    x0 = x1;
    z0 = z1;
  }
  const total = cum[samples];
  const out: number[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const target = (k / n) * total;
    while (j < samples && cum[j + 1] < target) j++;
    const f = (target - cum[j]) / (cum[j + 1] - cum[j] || 1);
    out.push(((j + f) / samples) * Math.PI * 2);
  }
  return out;
}

/** Outward unit normal of the ellipse at t. */
export function ellipseNormal(rx: number, rz: number, t: number): [number, number] {
  const nx = Math.cos(t) / rx;
  const nz = Math.sin(t) / rz;
  const l = Math.hypot(nx, nz);
  return [nx / l, nz / l];
}

/** Polyline of the curve parallel to the ellipse at distance `d` (positive = outward). */
export function offsetEllipse(rx: number, rz: number, d: number, n: number): V2[] {
  const ts = equalArcParams(rx, rz, n);
  return ts.map((t) => {
    const [x, z] = ellipseAt(rx, rz, t);
    const [nx, nz] = ellipseNormal(rx, rz, t);
    return [x + nx * d, z + nz * d] as V2;
  });
}

// ---------------------------------------------------------------- facade

export interface EllipticalArcadeSpec {
  /** Semi-axes of the facade's OUTER face. Colosseum: 94 × 78 m real. */
  rx: number;
  rz: number;
  /** Number of bays round (Colosseum: 80). */
  bays: number;
  storeys: ArcadeStorey[];
  /** Pier width (default 36% of the bay). */
  pier?: number;
  /** Facade wall depth. */
  depth: number;
  /** Ambulatory width behind the facade (floors + inner wall). 0 = none. */
  corridor?: number;
  material?: MaterialId;
  detail?: Detail;
  columnDetail?: Detail;
  masts?: boolean;
  /** Only build bays whose index is in [from, to) (sections / ruins). */
  from?: number;
  to?: number;
}

export interface EllipticalArcadeResult {
  height: number;
  bayWidth: number;
  /** Semi-axes of the inner face of the corridor's inner wall (where the cavea can start). */
  innerRx: number;
  innerRz: number;
}

export function ellipticalArcade(b: MeshBuilder, spec: EllipticalArcadeSpec, at?: THREE.Matrix4): EllipticalArcadeResult {
  const m = at ?? new THREE.Matrix4();
  const n = spec.bays;
  const detail = spec.detail ?? 'high';
  const mat = spec.material ?? 'travertine';
  // Bays are laid on the facade's mid-wall ellipse; the outer face sits depth/2 further out.
  const rx = spec.rx - spec.depth / 2;
  const rz = spec.rz - spec.depth / 2;
  const ts = equalArcParams(rx, rz, n);
  const pts = ts.map((t) => ellipseAt(rx, rz, t));
  const bayWidth = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
  const arcSpec: ArcadeSpec = {
    bays: n,
    bay: bayWidth,
    pier: spec.pier ?? bayWidth * 0.36,
    depth: spec.depth,
    storeys: spec.storeys,
    material: mat,
    detail,
    columnDetail: spec.columnDetail,
    masts: spec.masts,
  };
  const from = spec.from ?? 0;
  const to = spec.to ?? n;
  const full = from === 0 && to === n;
  const frame = (i: number) => {
    const a = pts[i % n];
    const c = pts[(i + 1) % n];
    const dx = c[0] - a[0];
    const dz = c[1] - a[1];
    const len = Math.hypot(dx, dz);
    // local x along the chord, local −z outward (dz, −dx), local +z inward
    const xh = new THREE.Vector3(dx / len, 0, dz / len);
    const zh = new THREE.Vector3(-dz / len, 0, dx / len);
    const mm = new THREE.Matrix4().makeBasis(xh, new THREE.Vector3(0, 1, 0), zh).setPosition(a[0], 0, a[1]);
    return mul(m, mm);
  };
  let y = 0;
  spec.storeys.forEach((s, si) => {
    for (let i = from; i < to; i++) {
      const window = s.windows === 'all' || (s.windows === 'alternate' && i % 2 === 1);
      arcadeBay(b, arcSpec, si, y, frame(i), { firstColumn: true, lastColumn: !full && i === to - 1, window, collide: si === 0 });
    }
    // One continuous entablature per storey along the polygon of bay corners.
    const { order, colH, D, entH } = storeyColumn(s, bayWidth);
    const d = D * ORDER_PROPORTIONS[order].topRatio;
    const yE = y + s.height - entH;
    const off = spec.depth / 2 + d / 2;
    const path: THREE.Vector3[] = [];
    const count = full ? n : to - from + 1;
    for (let k = 0; k < count; k++) {
      const i = (from + k) % n;
      const [nx, nz] = ellipseNormal(rx, rz, ts[i]);
      path.push(new THREE.Vector3(pts[i][0] + nx * off, yE, pts[i][1] + nz * off));
    }
    entablature(b, path, { order, columnHeight: colH, D, material: mat, detail, dims: { architrave: entH * 0.3, frieze: entH * 0.3, cornice: entH * 0.4 }, depth: spec.depth * 0.5 + d / 2, axial: bayWidth }, { closed: full, at: m, caps: !full });
    // Corridor floor behind this storey + inner wall.
    if (spec.corridor && spec.corridor > 0) {
      const c = spec.corridor;
      const ring = (dOff: number) => {
        const out: THREE.Vector3[] = [];
        for (let k = 0; k < count; k++) {
          const i = (from + k) % n;
          const [nx, nz] = ellipseNormal(rx, rz, ts[i]);
          out.push(new THREE.Vector3(pts[i][0] - nx * dOff, 0, pts[i][1] - nz * dOff));
        }
        return out;
      };
      // Floor/vault slab: a flat profile swept along the corridor's outer edge, extending inward.
      // Profiles run counter-clockwise (solid on the left) so their normals face out.
      const slab = new ProfileBuilder(0, s.height - 0.4).to(0, s.height).to(-c, s.height).to(-c, s.height - 0.4).to(0, s.height - 0.4).build();
      b.add(sweep({ pts: slab.pts.map(([px, py]) => [px, py + y] as V2), smooth: slab.smooth }, ring(spec.depth / 2), { closed: full }), 'concrete', m, { castShadow: false });
      // Inner wall with an arch per bay (piers only, simplified): a plain wall band.
      const wallProf = new ProfileBuilder(0, 0).to(0, s.height).to(-0.9, s.height).to(-0.9, 0).build();
      b.add(sweep({ pts: wallProf.pts.map(([px, py]) => [px, py + y] as V2), smooth: wallProf.smooth }, ring(spec.depth / 2 + c), { closed: full }), mat, m);
    }
    y += s.height;
  });
  const inner = spec.depth / 2 + (spec.corridor ? spec.corridor + 0.9 : 0);
  return { height: y, bayWidth, innerRx: rx - inner, innerRz: rz - inner };
}

// ---------------------------------------------------------------- cavea

export interface CaveaTier {
  rows: number;
  /** Row rise (default 0.38 — under the controller's 0.42 m autostep). */
  rise?: number;
  /** Row depth (default 0.72). */
  depth?: number;
  /** Height of the praecinctio wall in front of this tier (default 0 for the first). */
  wall?: number;
  /** Walkway width at the foot of the tier. */
  walk?: number;
}

export interface CaveaSpec {
  /** Arena semi-axes (Colosseum: 43 × 27 m real... the arena floor). */
  arenaRx: number;
  arenaRz: number;
  /** Podium wall height round the arena (Colosseum ≈ 4 m real). */
  podium: number;
  tiers: CaveaTier[];
  /** Polygon segments round (also the collider count per row). */
  segments?: number;
  material?: MaterialId;
  seatMaterial?: MaterialId;
  /** Risers and praecinctio walls (default: material). */
  riserMaterial?: MaterialId;
  arenaMaterial?: MaterialId;
  detail?: Detail;
  /** Radial stairways (scalaria) — number round the ellipse. */
  aisles?: number;
  collide?: boolean;
  /** Walkway at the top of the cavea (default 0, or 3.5 with a top portico). */
  topWalk?: number;
  /** Colonnade round the top of the cavea (porticus in summa cavea), facing the arena. */
  topPortico?: { order?: Order; columnHeight?: number; depth?: number; detail?: Detail };
}

export interface CaveaResult {
  /** Outer offset distance from the arena edge and the top height. */
  reach: number;
  height: number;
  rows: number;
}

/** Stepped section profile (x = offset outward from the arena edge, y up). Pure. */
export interface CaveaWall {
  /** Offset of the wall face, start of the walkway in front of it, walkway and wall-top heights. */
  x: number;
  walk0: number;
  y0: number;
  y1: number;
}

export function caveaSection(spec: CaveaSpec): { profile: V2[]; rows: { x0: number; x1: number; y: number; prevY?: number }[]; walls: CaveaWall[]; reach: number; height: number } {
  const pts: V2[] = [[0, 0], [0, spec.podium]];
  // Podium terrace (senatorial seats) behind a balustrade.
  let x = 0;
  let y = spec.podium;
  const rows: { x0: number; x1: number; y: number; prevY?: number }[] = [];
  const walls: CaveaWall[] = [];
  spec.tiers.forEach((tier, ti) => {
    // In front of a praecinctio wall the walkway must hold the aisle flight that climbs it
    // (0.2 m risers on 0.34 m treads).
    const flight = tier.wall && tier.wall > 0 ? Math.ceil(tier.wall / 0.2) * 0.34 + 0.15 : 0;
    const walk = Math.max(tier.walk ?? (ti === 0 ? 2.2 : 1.6), flight);
    pts.push([x + walk, y]);
    x += walk;
    if (tier.wall && tier.wall > 0) {
      walls.push({ x, walk0: x - walk, y0: y, y1: y + tier.wall });
      pts.push([x, y + tier.wall]);
      y += tier.wall;
      pts.push([x + 0.6, y]);
      x += 0.6;
    }
    const rise = tier.rise ?? 0.38;
    const depth = tier.depth ?? 0.72;
    for (let r = 0; r < tier.rows; r++) {
      pts.push([x, y + rise]);
      y += rise;
      rows.push({ x0: x, x1: x + depth, y, prevY: y - rise });
      pts.push([x + depth, y]);
      x += depth;
    }
  });
  const top = spec.topWalk ?? (spec.topPortico ? 3.5 : 0);
  if (top > 0) {
    pts.push([x + top, y]);
    x += top;
  }
  // Back face down to the ground (hidden behind the facade's inner wall).
  pts.push([x, 0]);
  return { profile: pts, rows, walls, reach: x, height: y };
}

export function cavea(b: MeshBuilder, spec: CaveaSpec, at?: THREE.Matrix4): CaveaResult {
  const m = at ?? new THREE.Matrix4();
  const segs = spec.segments ?? 96;
  const detail = spec.detail ?? 'high';
  const mat = spec.material ?? 'travertine';
  const seat = spec.seatMaterial ?? 'marble';
  const { profile, rows, walls, reach, height } = caveaSection(spec);
  const base = offsetEllipse(spec.arenaRx, spec.arenaRz, 0, segs).map(([x, z]) => new THREE.Vector3(x, 0, z));
  // The section is swept along the arena edge: rows become parallel curves. It is traversed
  // from the back down towards the arena so treads face up and risers face the arena.
  const toProfile = (pts: V2[]) => ({ pts: [...pts].reverse(), smooth: pts.map(() => false) });
  // Podium wall (marble-faced) and the stepped seating as separate sweeps for materials.
  const podiumIdx = 2;
  b.add(sweep(toProfile(profile.slice(0, podiumIdx + 1)), base, { closed: true }), 'marble', m);
  // Seating: treads in `seat` material, risers and walls in `riserMaterial`, so rows read.
  const seatPts = profile.slice(podiumIdx);
  for (let i = 0; i < seatPts.length - 1; i++) {
    const seg = toProfile([seatPts[i], seatPts[i + 1]]);
    const horizontal = Math.abs(seatPts[i + 1][1] - seatPts[i][1]) < 1e-6;
    b.add(sweep(seg, base, { closed: true }), horizontal ? seat : (spec.riserMaterial ?? mat), m);
  }
  // Balustrade on the podium edge.
  const bal = new ProfileBuilder(0.35, spec.podium).to(0.35, spec.podium + 1.0).to(0.05, spec.podium + 1.0).to(0.05, spec.podium).build();
  b.add(sweep(bal, base, { closed: true }), mat, m);
  // Arena floor (sand over boards).
  const shape = new THREE.Shape(base.map((p) => new THREE.Vector2(p.x, -p.z)));
  const floor = new THREE.ShapeGeometry(shape, 1);
  floor.rotateX(-Math.PI / 2);
  floor.translate(0, 0.03, 0);
  b.add(floor, spec.arenaMaterial ?? 'sand', m, { castShadow: false });
  // Aisle stairs (scalaria): half-height steps up each radial gangway, plus short flights in the
  // walkways to climb the praecinctio walls. Seat rows (≈0.4 m) are taller than the character
  // controller can step (≈0.26 m effective), so the aisles are the walkable routes — as in Rome.
  const aisles = spec.aisles ?? 16;
  if (aisles > 0) {
    const ts = equalArcParams(spec.arenaRx, spec.arenaRz, aisles);
    const W = 1.1;
    const collide = spec.collide ?? true;
    for (const t of ts) {
      const [ex, ez] = ellipseAt(spec.arenaRx, spec.arenaRz, t);
      const [nx, nz] = ellipseNormal(spec.arenaRx, spec.arenaRz, t);
      const tan = new THREE.Vector3(-nz, 0, nx);
      const basis = new THREE.Matrix4().makeBasis(tan, new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, 0, nz));
      // radial band [d0, d1] × height [y0, y1] at this aisle
      const step = (d0: number, d1: number, y0: number, y1: number) => {
        const local = basis.clone().setPosition(ex + nx * ((d0 + d1) / 2), (y0 + y1) / 2, ez + nz * ((d0 + d1) / 2));
        if (detail === 'high') {
          const g = new THREE.BoxGeometry(W, y1 - y0, d1 - d0);
          g.applyMatrix4(local);
          b.add(g, mat, m, { castShadow: false });
        }
        if (collide) {
          const w = mul(m, local);
          const pos = new THREE.Vector3();
          const q = new THREE.Quaternion();
          w.decompose(pos, q, new THREE.Vector3());
          b.collider({ kind: 'box', center: pos, half: new THREE.Vector3(W / 2, (y1 - y0) / 2, (d1 - d0) / 2), rotation: q });
        }
      };
      for (const r of rows) {
        // Half-height step on the row below, just in front of this row's riser.
        const prev = r.prevY ?? r.y - 0.38;
        const dd = (r.x1 - r.x0) * 0.5;
        step(r.x0 - dd, r.x0 + 0.01, prev, (prev + r.y) / 2);
      }
      for (const w of walls) {
        // 0.34 m treads: shorter ones trip the 0.35 m-radius capsule. caveaSection sizes the
        // walkway so the whole flight fits in front of the wall.
        const n = Math.ceil((w.y1 - w.y0) / 0.2);
        const run = 0.34;
        for (let k = 1; k <= n; k++) step(w.x - (n - k + 1) * run, w.x + 0.01, w.y0, w.y0 + ((w.y1 - w.y0) * k) / n);
      }
    }
  }
  // Colliders: per row, one box per segment from the ground to the row's tread.
  if (spec.collide ?? true) {
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const addSeg = (d0: number, d1: number, y0: number, y1: number) => {
      const ring0 = offsetEllipse(spec.arenaRx, spec.arenaRz, (d0 + d1) / 2, segs);
      for (let i = 0; i < segs; i++) {
        const a = ring0[i];
        const c = ring0[(i + 1) % segs];
        const dx = c[0] - a[0];
        const dz = c[1] - a[1];
        const len = Math.hypot(dx, dz);
        const yaw = Math.atan2(-dz, dx);
        const local = new THREE.Matrix4().compose(new THREE.Vector3((a[0] + c[0]) / 2, (y0 + y1) / 2, (a[1] + c[1]) / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(1, 1, 1));
        const w = mul(m, local);
        w.decompose(pos, q, scl);
        b.collider({ kind: 'box', center: pos.clone(), half: new THREE.Vector3(len / 2 + 0.05, (y1 - y0) / 2, (d1 - d0) / 2), rotation: q.clone() });
      }
    };
    addSeg(-0.2, 0.4, 0, spec.podium + 1.0); // podium wall + balustrade
    // Every tread of the section (walkways and seat rows) becomes a solid band from the ground.
    for (let i = 1; i < profile.length - 1; i++) {
      const [x0, y0] = profile[i];
      const [x1, y1] = profile[i + 1];
      if (Math.abs(y1 - y0) < 1e-6 && x1 > x0 + 1e-6) addSeg(Math.max(0.4, x0) - 0.01, x1 + 0.01, 0, y0);
    }
  }
  if (spec.topPortico) {
    const tp = spec.topPortico;
    const topW = spec.topWalk ?? 3.5;
    // Reversed ring so the colonnade faces the arena.
    const ring = offsetEllipse(spec.arenaRx, spec.arenaRz, reach - topW + 0.9, segs)
      .map(([x, z]) => new THREE.Vector3(x, 0, z))
      .reverse();
    porticus(b, ring, {
      order: tp.order ?? 'corinthian',
      columnHeight: tp.columnHeight ?? 6,
      depth: tp.depth ?? topW - 0.9 + 0.7,
      back: 'none',
      stylobate: 0.15,
      y: height,
      closed: true,
      material: 'marble',
      detail: tp.detail ?? 'low',
      columnDetail: 'low',
    }, m);
  }
  return { reach, height, rows: rows.length };
}
