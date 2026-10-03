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

/**
 * Parameters t_i (i = 0..n−1) that split the ellipse into n arcs of equal length. With `phase`
 * (a fraction of one arc) the split points are shifted along the curve: phase 0.5 centres the
 * arcs on t = 0, π/2, π, 3π/2 — the axes — instead of starting one there.
 */
export function equalArcParams(rx: number, rz: number, n: number, samples = 4096, phase = 0): number[] {
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
    const target = (((k + phase) / n) % 1) * total;
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
  /**
   * Bay phase in bays (default 0.5): bays are centred on the axes, so arches (the four axial
   * entrances) straddle them instead of piers. 0 puts a pier on each axis.
   */
  phase?: number;
  /** Build the corridor's inner wall (default true; amphitheatre() lets the cavea build it). */
  innerWall?: boolean;
  /** Extra depth of the corridor slabs past `corridor` (to tuck into an inner wall built elsewhere). */
  slabOverlap?: number;
}

export interface EllipticalArcadeResult {
  height: number;
  bayWidth: number;
  /** Centre of each bay on the facade's mid-wall ellipse (in the builder's local frame, before `at`). */
  bayCenters: { x: number; z: number; nx: number; nz: number }[];
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
  const ts = equalArcParams(rx, rz, n, 4096, spec.phase ?? 0.5);
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
      const cs = c + (spec.slabOverlap ?? 0);
      const slab = new ProfileBuilder(0, s.height - 0.4).to(0, s.height).to(-cs, s.height).to(-cs, s.height - 0.4).to(0, s.height - 0.4).build();
      b.add(sweep({ pts: slab.pts.map(([px, py]) => [px, py + y] as V2), smooth: slab.smooth }, ring(spec.depth / 2), { closed: full }), 'concrete', m, { castShadow: false });
      if (spec.innerWall ?? true) {
        // Inner wall (solid; amphitheatre() builds it with the cavea instead, cut by passages).
        const wallProf = new ProfileBuilder(0, 0).to(0, s.height).to(-0.9, s.height).to(-0.9, 0).build();
        b.add(sweep({ pts: wallProf.pts.map(([px, py]) => [px, py + y] as V2), smooth: wallProf.smooth }, ring(spec.depth / 2 + c), { closed: full }), mat, m);
      }
    }
    y += s.height;
  });
  const inner = spec.depth / 2 + (spec.corridor ? spec.corridor + 0.9 : 0);
  const bayCenters = pts.map((a, i) => {
    const c = pts[(i + 1) % n];
    const x = (a[0] + c[0]) / 2;
    const z = (a[1] + c[1]) / 2;
    const dx = c[0] - a[0];
    const dz = c[1] - a[1];
    const l = Math.hypot(dx, dz);
    return { x, z, nx: dz / l, nz: -dx / l };
  });
  return { height: y, bayWidth, bayCenters, innerRx: rx - inner, innerRz: rz - inner };
}

// ---------------------------------------------------------------- cavea

export interface CaveaTier {
  rows: number;
  /** Row rise (default 0.38). Rows are not walkable: the aisles (half-steps) are. */
  rise?: number;
  /** Row depth (default 0.72). */
  depth?: number;
  /** Height of the praecinctio wall in front of this tier (default 0 for the first). */
  wall?: number;
  /** Walkway width at the foot of the tier. */
  walk?: number;
}

/**
 * A radial passage through the cavea. Its centre line is the arena ellipse's normal at `t` and its
 * sides are parallel to it (a parallel strip, so floors and stairs are plain boxes).
 *  - 'gate': at ground level from the corridor straight into the arena (Porta Triumphalis and
 *    Libitinensis on the major axis), cutting the podium; open to the sky over the low rows.
 *  - 'vomitorium': a level passage from the corridor, then a flight of ≤ 0.2 m risers up to the
 *    walkway in front of praecinctio wall `wall`, emerging through a slot in the rows behind it.
 */
export interface CaveaPassage {
  t: number;
  kind: 'gate' | 'vomitorium';
  width?: number;
  /** Vomitorium: which praecinctio wall's walkway it opens onto (default 0 = the first). */
  wall?: number;
}

export interface CaveaSpec {
  /** Arena semi-axes (the arena floor; Colosseum ≈ 43 × 27 m real to the podium). */
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
  /** Radial stairways (scalaria) — number round the ellipse (placed between passages). */
  aisles?: number;
  collide?: boolean;
  /** Walkway at the top of the cavea (default 0, or 3.5 with a top portico). */
  topWalk?: number;
  /** Colonnade round the top of the cavea (porticus in summa cavea), facing the arena. */
  topPortico?: { order?: Order; columnHeight?: number; depth?: number; detail?: Detail };
  /** Gates and vomitoria cut through the seating. */
  passages?: CaveaPassage[];
  /**
   * The corridor's inner wall behind the cavea (from the back of the section outward), cut by
   * the passages up to `opening` (default 3 m): the wall the facade's ambulatory runs along.
   */
  backWall?: { height: number; thickness?: number; opening?: number; material?: MaterialId };
}

export interface CaveaAisle {
  t: number;
  /** Point on the arena edge and the outward normal there. */
  x: number;
  z: number;
  nx: number;
  nz: number;
}

export interface CaveaPassageInfo {
  kind: 'gate' | 'vomitorium';
  t: number;
  width: number;
  /** Axis: the point on the arena edge and the outward unit direction. */
  x: number;
  z: number;
  dx: number;
  dz: number;
  /** Section offsets: the mouth (praecinctio wall face, 0 for gates), the flight's foot, the corridor face. */
  mouth: number;
  foot: number;
  outer: number;
  /** Floor height at the mouth (the walkway level; 0 for gates). */
  floor: number;
}

export interface CaveaResult {
  /** Outer offset distance from the arena edge and the top height. */
  reach: number;
  height: number;
  rows: number;
  aisles: CaveaAisle[];
  passages: CaveaPassageInfo[];
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
  let x = 0;
  let y = spec.podium;
  const rows: { x0: number; x1: number; y: number; prevY?: number }[] = [];
  const walls: CaveaWall[] = [];
  spec.tiers.forEach((tier, ti) => {
    // In front of a praecinctio wall the walkway must hold the aisle flight that climbs it
    // (0.2 m risers on 0.34 m treads).
    const flight = tier.wall && tier.wall > 0 ? Math.ceil(tier.wall / 0.2 - 1e-9) * 0.34 + 0.15 : 0;
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
  // Back face down to the ground (hidden behind the corridor's inner wall).
  pts.push([x, 0]);
  return { profile: pts, rows, walls, reach: x, height: y };
}

/** Lowest surface height of a stepped profile at offset d (a riser counts at its foot). Pure. */
export function profileHeightAt(profile: V2[], d: number): number {
  let h = Infinity;
  for (let i = 0; i < profile.length - 1; i++) {
    const [x0, y0] = profile[i];
    const [x1, y1] = profile[i + 1];
    if (d < Math.min(x0, x1) - 1e-9 || d > Math.max(x0, x1) + 1e-9) continue;
    if (Math.abs(x1 - x0) < 1e-9) h = Math.min(h, y0, y1);
    else h = Math.min(h, y0 + ((y1 - y0) * (d - x0)) / (x1 - x0));
  }
  return h === Infinity ? 0 : h;
}

/** Arc-length ↔ parameter lookup on an ellipse (u ∈ [0, 1) is the fraction of the perimeter). */
export function arcTable(rx: number, rz: number, samples = 4096) {
  const cum: number[] = [0];
  let [x0, z0] = ellipseAt(rx, rz, 0);
  for (let i = 1; i <= samples; i++) {
    const [x1, z1] = ellipseAt(rx, rz, (i / samples) * Math.PI * 2);
    cum.push(cum[i - 1] + Math.hypot(x1 - x0, z1 - z0));
    x0 = x1;
    z0 = z1;
  }
  const total = cum[samples];
  const tToU = (t: number) => {
    const turns = Math.floor(t / (Math.PI * 2));
    const f = ((t - turns * Math.PI * 2) / (Math.PI * 2)) * samples;
    const i = Math.min(samples - 1, Math.floor(f));
    return turns + (cum[i] + (cum[i + 1] - cum[i]) * (f - i)) / total;
  };
  const uToT = (u: number) => {
    const turns = Math.floor(u);
    const target = (u - turns) * total;
    let lo = 0;
    let hi = samples;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= target) lo = mid;
      else hi = mid;
    }
    const f = (target - cum[lo]) / (cum[lo + 1] - cum[lo] || 1);
    return (turns + (lo + f) / samples) * Math.PI * 2;
  };
  return { total, tToU, uToT };
}

interface Strip {
  /** Axis origin on the arena edge, outward direction and the lateral (tangent) direction. */
  ox: number;
  oz: number;
  dx: number;
  dz: number;
  ux: number;
  uz: number;
  half: number;
  t: number;
}

/** Point at parameter t on the curve parallel to the ellipse at distance d. */
function offsetAt(rx: number, rz: number, t: number, d: number): [number, number] {
  const [x, z] = ellipseAt(rx, rz, t);
  const [nx, nz] = ellipseNormal(rx, rz, t);
  return [x + nx * d, z + nz * d];
}

/** Parameter where the offset curve at distance d crosses the strip side at lateral offset `side`. */
function stripBound(rx: number, rz: number, s: Strip, d: number, side: number): number {
  const lat = (t: number) => {
    const [x, z] = offsetAt(rx, rz, t, d);
    return (x - s.ox) * s.ux + (z - s.oz) * s.uz - side;
  };
  let a = s.t - 0.6;
  let b = s.t + 0.6;
  for (let i = 0; i < 60; i++) {
    const m = (a + b) / 2;
    if (lat(m) > 0) b = m;
    else a = m;
  }
  return (a + b) / 2;
}

/**
 * Sweep a polyline section (d, y) round the arena between per-vertex parameter bounds (sectors
 * between passages), or all the way round. The section is traversed with the solid on its right
 * (clockwise in d–y), so the outward normal of an edge is its left normal. `material(i)` picks a
 * material per edge.
 */
function sectorSweep(
  b: MeshBuilder,
  rx: number,
  rz: number,
  section: V2[],
  bounds: ((d: number) => [number, number]) | null,
  segs: number,
  arc: ReturnType<typeof arcTable>,
  material: (i: number) => MaterialId,
  m: THREE.Matrix4,
  opts: { closed?: boolean; castShadow?: boolean } = {},
) {
  const byMat = new Map<MaterialId, { pos: number[]; nor: number[] }>();
  const range = (d: number): [number, number] => {
    if (!bounds) return [0, 1];
    const [t0, t1] = bounds(d);
    const u0 = arc.tToU(t0);
    let u1 = arc.tToU(t1);
    while (u1 < u0) u1 += 1;
    return [u0, u1];
  };
  const ranges = section.map(([d]) => range(d));
  const span = Math.max(...ranges.map(([a, c]) => c - a));
  const K = Math.max(1, Math.ceil(segs * span));
  const pt = (k: number, i: number) => {
    const [u0, u1] = ranges[i];
    const t = arc.uToT(u0 + ((u1 - u0) * k) / K);
    const [x, z] = offsetAt(rx, rz, t, section[i][0]);
    return { p: new THREE.Vector3(x, section[i][1], z), t };
  };
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const n = section.length - 1 + (opts.closed ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % section.length;
    const dd = section[j][0] - section[i][0];
    const dy = section[j][1] - section[i][1];
    const l = Math.hypot(dd, dy);
    if (l < 1e-9) continue;
    const nd = -dy / l;
    const ny = dd / l;
    const mat = material(i);
    let bucket = byMat.get(mat);
    if (!bucket) byMat.set(mat, (bucket = { pos: [], nor: [] }));
    for (let k = 0; k < K; k++) {
      const a0 = pt(k, i);
      const a1 = pt(k + 1, i);
      const b0 = pt(k, j);
      const b1 = pt(k + 1, j);
      const N = (t: number) => {
        const [ex, ez] = ellipseNormal(rx, rz, t);
        return new THREE.Vector3(ex * nd, ny, ez * nd);
      };
      const quad = [a0, a1, b1, a0, b1, b0];
      // Wind each quad to face its analytic normal.
      A.subVectors(a1.p, a0.p);
      B.subVectors(b1.p, a0.p);
      const geo = new THREE.Vector3().crossVectors(A, B);
      if (geo.lengthSq() < 1e-14) {
        A.subVectors(b1.p, a0.p);
        B.subVectors(b0.p, a0.p);
        geo.crossVectors(A, B);
      }
      const order = geo.dot(N(a0.t)) >= 0 ? quad : [a0, b1, a1, a0, b0, b1];
      for (const v of order) {
        const nn = N(v.t);
        bucket.pos.push(v.p.x, v.p.y, v.p.z);
        bucket.nor.push(nn.x, nn.y, nn.z);
      }
    }
  }
  for (const [mat, { pos, nor }] of byMat) {
    if (!pos.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    b.add(g, mat, m, { castShadow: opts.castShadow });
  }
}

/** A flat polygon given in the strip side plane: section points (d, y) placed on a strip side. */
function stripSideCap(b: MeshBuilder, s: Strip, side: number, poly: V2[], mat: MaterialId, m: THREE.Matrix4, facing: 1 | -1) {
  const contour = poly.map(([d, y]) => new THREE.Vector2(d, y));
  if (THREE.ShapeUtils.isClockWise(contour)) contour.reverse();
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  const pos: number[] = [];
  const nor: number[] = [];
  // A CCW (d, y) triangle's normal is D × Y = (dx, 0, dz) × (0, 1, 0) = (−dz, 0, dx) = +U, so a
  // CCW contour faces +U; reverse it to face −U.
  const nx = s.ux * facing;
  const nz = s.uz * facing;
  for (const tri of tris) {
    const order = facing > 0 ? tri : [tri[0], tri[2], tri[1]];
    for (const k of order) {
      const { x: d, y } = contour[k];
      pos.push(s.ox + s.dx * d + s.ux * side, y, s.oz + s.dz * d + s.uz * side);
      nor.push(nx, 0, nz);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  b.add(g, mat, m);
}

/** An oriented box in the strip frame: d ∈ [d0, d1] along the axis, lateral [l0, l1], y ∈ [y0, y1]. */
function stripBox(b: MeshBuilder, s: Strip, d0: number, d1: number, l0: number, l1: number, y0: number, y1: number, m: THREE.Matrix4, mat: MaterialId | null, collide: boolean, castShadow = true) {
  if (d1 - d0 < 1e-4 || y1 - y0 < 1e-4 || l1 - l0 < 1e-4) return;
  const cd = (d0 + d1) / 2;
  const cl = (l0 + l1) / 2;
  const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(s.ux, 0, s.uz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(s.dx, 0, s.dz));
  basis.setPosition(s.ox + s.dx * cd + s.ux * cl, (y0 + y1) / 2, s.oz + s.dz * cd + s.uz * cl);
  const w = mul(m, basis);
  if (mat) b.box(mat, l1 - l0, y1 - y0, d1 - d0, w, { castShadow });
  if (collide) {
    const pos = new THREE.Vector3();
    const q = new THREE.Quaternion();
    w.decompose(pos, q, new THREE.Vector3());
    b.collider({ kind: 'box', center: pos, half: new THREE.Vector3((l1 - l0) / 2, (y1 - y0) / 2, (d1 - d0) / 2), rotation: q });
  }
}

export function cavea(b: MeshBuilder, spec: CaveaSpec, at?: THREE.Matrix4): CaveaResult {
  const m = at ?? new THREE.Matrix4();
  const segs = spec.segments ?? 96;
  const detail = spec.detail ?? 'high';
  const mat = spec.material ?? 'travertine';
  const seat = spec.seatMaterial ?? 'marble';
  const riser = spec.riserMaterial ?? mat;
  const collide = spec.collide ?? true;
  const rx = spec.arenaRx;
  const rz = spec.arenaRz;
  const arc = arcTable(rx, rz);
  const { profile, rows, walls, reach, height } = caveaSection(spec);
  const backT = spec.backWall?.thickness ?? 0.9;
  const opening = Math.min(spec.backWall?.opening ?? 3.0, (spec.backWall?.height ?? Infinity) - 0.5);
  const outer = reach + (spec.backWall ? backT : 0);

  // ---- passages: strips, the section vertex where each one cuts in, and its geometry
  interface P {
    spec: CaveaPassage;
    s: Strip;
    cut: number; // section vertex index where the interruption starts
    mouth: number;
    floor: number;
    foot: number;
    run: number;
    count: number;
    cover: number; // section offset from which seating bridges over the passage
    soffit: (d: number) => number;
  }
  const passages: P[] = [];
  // Headroom above the flight's pitch line: the character controller's autostep casts its capsule
  // 0.42 m up, so a 1.8 m character needs ≈ 2.7 m over the nosings plus a margin.
  const clear = 2.9;
  for (const ps of [...(spec.passages ?? [])].sort((a, c) => ((a.t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - (((c.t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)))) {
    const t = ((ps.t % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const w = ps.width ?? (ps.kind === 'gate' ? 3.2 : 2.0);
    const [ox, oz] = ellipseAt(rx, rz, t);
    const [dx, dz] = ellipseNormal(rx, rz, t);
    const s: Strip = { ox, oz, dx, dz, ux: -dz, uz: dx, half: w / 2, t };
    if (ps.kind === 'gate') {
      // Level from the arena to the corridor; open to the sky until the rows are high enough to
      // span it with headroom, then a flat soffit.
      const soffit = () => opening;
      let cover = 0;
      for (const r of rows) if (r.prevY !== undefined && r.prevY >= opening + 0.35 - 1e-9 && cover === 0) cover = r.x0;
      for (const wl of walls) if (cover === 0 && wl.y0 >= opening + 0.35) cover = wl.walk0;
      passages.push({ spec: ps, s, cut: 0, mouth: 0, floor: 0, foot: 0, run: 0, count: 0, cover: cover || reach, soffit });
      continue;
    }
    const wl = walls[Math.min(walls.length - 1, ps.wall ?? 0)];
    if (!wl) continue;
    const count = Math.max(1, Math.ceil(wl.y0 / 0.2 - 1e-9));
    let run = 0.34;
    if (wl.x + count * run > reach - 0.8) run = (reach - 0.8 - wl.x) / count;
    if (run < 0.28) {
      console.warn('[cavea] no room for a vomitorium flight to walkway', ps.wall ?? 0);
      continue;
    }
    const rise = wl.y0 / count;
    const foot = wl.x + count * run;
    // Nosing line of the flight, then a soffit `clear` above it (never below the corridor opening).
    const floorAt = (d: number) => (d <= wl.x ? wl.y0 : d >= foot ? 0 : wl.y0 - ((d - wl.x) / run) * rise);
    const soffit = (d: number) => Math.max(opening, floorAt(d) + clear);
    // The bridge starts at the first riser from which the rows clear the soffit (plus a slab).
    let cover = reach;
    const candidates = profile.map((p) => p[0]).filter((d) => d > wl.x + 0.3).sort((a, c) => a - c);
    for (const d of candidates) {
      let ok = true;
      for (let x = d; x <= reach; x += 0.1) if (profileHeightAt(profile, x) < soffit(x) + 0.35) ok = false;
      if (ok) {
        cover = d;
        break;
      }
    }
    const cut = profile.findIndex(([d, y]) => Math.abs(d - wl.x) < 1e-6 && Math.abs(y - wl.y0) < 1e-6);
    passages.push({ spec: ps, s, cut, mouth: wl.x, floor: wl.y0, foot, run, count, cover, soffit });
  }

  // ---- seating bands: the section is split at each passage's cut vertex; a band is interrupted
  // by the passages that cut at or before its start.
  const cuts = [...new Set([0, ...passages.map((p) => p.cut)])].sort((a, c) => a - c);
  const sectorBounds = (inter: P[], i: number) => {
    // Sector i runs from passage i's right side to passage i+1's left side.
    const a = inter[i];
    const c = inter[(i + 1) % inter.length];
    return (d: number): [number, number] => {
      const t0 = stripBound(rx, rz, a.s, d, a.s.half);
      let t1 = stripBound(rx, rz, c.s, d, -c.s.half);
      while (t1 <= t0) t1 += Math.PI * 2;
      return [t0, t1];
    };
  };
  const edgeMat = (sec: V2[], first: number) => (i: number) => {
    const gi = first + i;
    if (gi === 0) return 'marble' as MaterialId; // podium face
    const horizontal = Math.abs(sec[i + 1][1] - sec[i][1]) < 1e-6;
    return horizontal ? seat : riser;
  };
  for (let ci = 0; ci < cuts.length; ci++) {
    const first = cuts[ci];
    const last = ci + 1 < cuts.length ? cuts[ci + 1] : profile.length - 1;
    const sec = profile.slice(first, last + 1);
    if (sec.length < 2) continue;
    const inter = passages.filter((p) => p.cut <= first);
    if (!inter.length) {
      sectorSweep(b, rx, rz, sec, null, segs, arc, edgeMat(sec, first), m);
      continue;
    }
    // Close the band's region down to the ground for the end caps.
    const capPoly: V2[] = [...sec];
    if (sec[sec.length - 1][1] > 1e-6) capPoly.push([sec[sec.length - 1][0], 0]);
    if (sec[0][1] > 1e-6) capPoly.push([sec[0][0], 0]);
    for (let i = 0; i < inter.length; i++) {
      sectorSweep(b, rx, rz, sec, sectorBounds(inter, i), segs, arc, edgeMat(sec, first), m);
      // caps on the passage sides (the side walls of gates and vomitoria), facing into it
      const p = inter[i];
      stripSideCap(b, p.s, p.s.half, capPoly, riser, m, -1);
      stripSideCap(b, p.s, -p.s.half, capPoly, riser, m, 1);
    }
  }
  // Balustrade on the podium edge, cut by the gates.
  const balSec: V2[] = [[0.05, spec.podium], [0.05, spec.podium + 1.0], [0.35, spec.podium + 1.0], [0.35, spec.podium]];
  const gates = passages.filter((p) => p.cut === 0);
  if (!gates.length) sectorSweep(b, rx, rz, balSec, null, segs, arc, () => mat, m);
  else
    for (let i = 0; i < gates.length; i++) {
      sectorSweep(b, rx, rz, balSec, sectorBounds(gates, i), segs, arc, () => mat, m);
      stripSideCap(b, gates[i].s, gates[i].s.half, balSec, mat, m, -1);
      stripSideCap(b, gates[i].s, -gates[i].s.half, balSec, mat, m, 1);
    }

  // ---- inside each passage: the seating bridged over it, floors, stairs, side colliders
  for (const p of passages) {
    const { s } = p;
    // Bridge: the section from `cover` outward, closed underneath by the soffit.
    const ci = profile.findIndex(([d]) => d >= p.cover - 1e-9);
    const upper = profile.slice(ci, profile.length - 1); // drop the back face's foot
    const sAt = (d: number) => p.soffit(d);
    const soffitPts: V2[] = [];
    const stepsN = 12;
    for (let k = stepsN; k >= 0; k--) {
      const d = p.cover + ((reach - p.cover) * k) / stepsN;
      soffitPts.push([d, sAt(d)]);
    }
    const bridge: V2[] = [[p.cover, sAt(p.cover)], ...upper.filter(([d, y]) => !(Math.abs(d - p.cover) < 1e-9 && y < sAt(p.cover))), [reach, sAt(reach)], ...soffitPts.slice(1, -1)];
    const own = (d: number): [number, number] => [stripBound(rx, rz, s, d, -s.half), stripBound(rx, rz, s, d, s.half)];
    sectorSweep(b, rx, rz, bridge, own, Math.max(segs, 64), arc, (i) => (Math.abs(bridge[(i + 1) % bridge.length][1] - bridge[i][1]) < 1e-6 && bridge[i][1] > sAt(bridge[i][0]) + 0.01 ? seat : riser), m, { closed: true });
    // Floors.
    if (p.spec.kind === 'gate') {
      stripBox(b, s, 0, outer + 0.2, -s.half, s.half, 0, 0.03, m, spec.arenaMaterial ?? 'sand', false, false);
    } else {
      stripBox(b, s, p.foot, outer + 0.2, -s.half, s.half, 0, 0.03, m, 'paving_travertine', false, false);
      // The flight climbs towards the mouth: step k (from the foot) is a slab from its nosing in
      // to the mouth, so the slabs stack into a solid flight; the top one tucks under the walkway.
      const rise = p.floor / p.count;
      for (let k = 0; k < p.count; k++) {
        const top = (k + 1) * rise - (k === p.count - 1 ? 0.004 : 0);
        const nosing = p.mouth + (p.count - k) * p.run;
        stripBox(b, s, p.mouth - 0.08, nosing, -s.half - 0.02, s.half + 0.02, k * rise, top, m, mat, false, false);
        if (collide) stripBox(b, s, p.mouth, nosing, -s.half - 0.05, s.half + 0.05, 0, (k + 1) * rise, m, null, true);
      }
    }
    if (collide) {
      // Side walls of the cut (to the surface above each tread), and the bridge's underside.
      const t0 = p.spec.kind === 'gate' ? 0 : p.mouth;
      for (let i = 0; i < profile.length - 1; i++) {
        const [x0, y0] = profile[i];
        const [x1, y1] = profile[i + 1];
        if (Math.abs(y1 - y0) > 1e-6 || x1 <= t0 + 1e-6) continue;
        const a = Math.max(t0, x0) - 0.02;
        for (const side of [-1, 1]) stripBox(b, s, a, x1 + 0.02, side > 0 ? s.half : -s.half - 0.3, side > 0 ? s.half + 0.3 : -s.half, 0, y0, m, null, true);
        if (x1 > p.cover + 1e-6) {
          const lo = Math.max(...[Math.max(x0, p.cover), x1].map((d) => sAt(d)));
          if (y0 > lo + 0.05) stripBox(b, s, Math.max(x0, p.cover) - 0.02, x1 + 0.02, -s.half - 0.1, s.half + 0.1, lo, y0, m, null, true);
        }
      }
      // gates: balustrade-height cheeks at the podium
      if (p.spec.kind === 'gate') for (const side of [-1, 1]) stripBox(b, s, -0.2, 0.4, side > 0 ? s.half : -s.half - 0.3, side > 0 ? s.half + 0.3 : -s.half, 0, spec.podium + 1.0, m, null, true);
    }
  }

  // ---- the corridor's inner wall behind the cavea, cut by the passages up to `opening`
  if (spec.backWall) {
    const bw = spec.backWall;
    const wm = bw.material ?? mat;
    const H = bw.height;
    const upper: V2[] = [[reach, opening], [reach, H], [outer, H], [outer, opening]];
    sectorSweep(b, rx, rz, upper, null, segs, arc, () => wm, m);
    // (its inner face below the cavea's top is hidden against the cavea's back face)
    const lower: V2[] = [[outer, opening], [outer, 0]];
    if (!passages.length) sectorSweep(b, rx, rz, lower, null, segs, arc, () => wm, m);
    else {
      for (let i = 0; i < passages.length; i++) sectorSweep(b, rx, rz, lower, sectorBounds(passages, i), segs, arc, () => wm, m);
      for (const p of passages) {
        // jambs and the lintel's soffit
        const jamb: V2[] = [[reach, 0], [reach, opening], [outer, opening], [outer, 0]];
        stripSideCap(b, p.s, p.s.half, jamb, wm, m, -1);
        stripSideCap(b, p.s, -p.s.half, jamb, wm, m, 1);
        if (collide) for (const side of [-1, 1]) stripBox(b, p.s, reach - 0.02, outer, side > 0 ? p.s.half : -p.s.half - 0.4, side > 0 ? p.s.half + 0.4 : -p.s.half, 0, opening + 0.5, m, null, true);
        sectorSweep(b, rx, rz, [[outer, opening], [reach, opening]], (d) => [stripBound(rx, rz, p.s, d, -p.s.half), stripBound(rx, rz, p.s, d, p.s.half)], 32, arc, () => wm, m);
      }
    }
  }

  // ---- aisles (scalaria) between the passages
  const aisleCount = spec.aisles ?? 16;
  const aisleTs: number[] = [];
  if (aisleCount > 0) {
    if (!passages.length) aisleTs.push(...equalArcParams(rx, rz, aisleCount));
    else {
      const per = Math.max(1, Math.round(aisleCount / passages.length));
      for (let i = 0; i < passages.length; i++) {
        const u0 = arc.tToU(passages[i].s.t);
        let u1 = arc.tToU(passages[(i + 1) % passages.length].s.t);
        while (u1 <= u0) u1 += 1;
        for (let j = 0; j < per; j++) aisleTs.push(arc.uToT(u0 + ((u1 - u0) * (j + 0.5)) / per) % (Math.PI * 2));
      }
    }
  }
  const W = 1.1;
  const aisles: CaveaAisle[] = [];
  for (const t of aisleTs) {
    const [ex, ez] = ellipseAt(rx, rz, t);
    const [nx, nz] = ellipseNormal(rx, rz, t);
    aisles.push({ t, x: ex, z: ez, nx, nz });
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
    // Half-height steps up the rows (0.4 m rows are taller than the controller steps, ≈0.26 m).
    for (const r of rows) {
      const prev = r.prevY ?? r.y - 0.38;
      const dd = (r.x1 - r.x0) * 0.5;
      step(r.x0 - dd, r.x0 + 0.01, prev, (prev + r.y) / 2);
    }
    // Flights in the walkways to climb the praecinctio walls (0.34 m treads).
    for (const w of walls) {
      const n = Math.ceil((w.y1 - w.y0) / 0.2 - 1e-9);
      const run = 0.34;
      for (let k = 1; k <= n; k++) step(w.x - (n - k + 1) * run, w.x + 0.01, w.y0, w.y0 + ((w.y1 - w.y0) * k) / n);
    }
  }

  // ---- colliders: every tread is a solid band from the ground, chained along each sector
  if (collide) {
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const addSeg = (d0: number, d1: number, y0: number, y1: number, inter: P[]) => {
      const dm = (d0 + d1) / 2;
      const chain = (u0: number, u1: number) => {
        const k = Math.max(1, Math.ceil(segs * (u1 - u0)));
        for (let i = 0; i < k; i++) {
          const a = offsetAt(rx, rz, arc.uToT(u0 + ((u1 - u0) * i) / k), dm);
          const c = offsetAt(rx, rz, arc.uToT(u0 + ((u1 - u0) * (i + 1)) / k), dm);
          const dx = c[0] - a[0];
          const dz = c[1] - a[1];
          const len = Math.hypot(dx, dz);
          const yaw = Math.atan2(-dz, dx);
          const local = new THREE.Matrix4().compose(new THREE.Vector3((a[0] + c[0]) / 2, (y0 + y1) / 2, (a[1] + c[1]) / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(1, 1, 1));
          mul(m, local).decompose(pos, q, scl);
          b.collider({ kind: 'box', center: pos.clone(), half: new THREE.Vector3(len / 2 + 0.03, (y1 - y0) / 2, (d1 - d0) / 2), rotation: q.clone() });
        }
      };
      if (!inter.length) return chain(0, 1);
      for (let i = 0; i < inter.length; i++) {
        // conservative ends: keep the chain out of the passage at both edges of the band
        const fA = sectorBounds(inter, i);
        const [a0, b0] = fA(d0);
        const [a1, b1] = fA(d1);
        const u0 = Math.max(arc.tToU(a0), arc.tToU(a1));
        const u1 = Math.min(arc.tToU(b0), arc.tToU(b1));
        if (u1 > u0) chain(u0, u1 - 0.0005);
      }
    };
    addSeg(-0.2, 0.4, 0, spec.podium + 1.0, gates); // podium wall + balustrade
    for (let i = 1; i < profile.length - 1; i++) {
      const [x0, y0] = profile[i];
      const [x1, y1] = profile[i + 1];
      if (Math.abs(y1 - y0) < 1e-6 && x1 > x0 + 1e-6) addSeg(Math.max(0.4, x0) - 0.01, x1 + 0.01, 0, y0, passages.filter((p) => p.cut <= i));
    }
    if (spec.backWall) addSeg(reach, outer, 0, spec.backWall.height, passages);
  }

  // Arena floor (sand over boards).
  const base = offsetEllipse(rx, rz, 0, segs).map(([x, z]) => new THREE.Vector3(x, 0, z));
  const shape = new THREE.Shape(base.map((p) => new THREE.Vector2(p.x, -p.z)));
  const floor = new THREE.ShapeGeometry(shape, 1);
  floor.rotateX(-Math.PI / 2);
  floor.translate(0, 0.03, 0);
  b.add(floor, spec.arenaMaterial ?? 'sand', m, { castShadow: false });

  if (spec.topPortico) {
    const tp = spec.topPortico;
    const topW = spec.topWalk ?? 3.5;
    // Reversed ring so the colonnade faces the arena.
    const ring = offsetEllipse(rx, rz, reach - topW + 0.9, segs)
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
  const info: CaveaPassageInfo[] = passages.map((p) => ({ kind: p.spec.kind, t: p.s.t, width: p.s.half * 2, x: p.s.ox, z: p.s.oz, dx: p.s.dx, dz: p.s.dz, mouth: p.mouth, foot: p.foot, outer, floor: p.floor }));
  return { reach, height, rows: rows.length, aisles, passages: info };
}

// ---------------------------------------------------------------- the whole amphitheatre

export interface AmphitheatreSpec {
  facade: Omit<EllipticalArcadeSpec, 'innerWall' | 'phase' | 'slabOverlap'>;
  cavea: Omit<CaveaSpec, 'passages' | 'backWall'>;
  /** The two arena gates on the major axis (default true). */
  gates?: boolean;
  /** A vomitorium every N bays (default 10; the minor-axis bays fall on this grid for 80 bays). 0 = none. */
  vomitoriumEvery?: number;
  gateWidth?: number;
  vomitoriumWidth?: number;
}

export interface AmphitheatreResult {
  facade: EllipticalArcadeResult;
  cavea: CaveaResult;
  /** Per passage: the facade bay it enters by (centre and outward normal). */
  entrances: { kind: 'gate' | 'vomitorium'; bay: number; x: number; z: number; nx: number; nz: number; passage: CaveaPassageInfo }[];
}

/**
 * Facade, ambulatory and cavea together, with the four axial entrances: arena gates on the major
 * axis and vomitoria every N bays (the minor-axis ones included) that run from the ground-floor
 * arches through the corridor's inner wall and up to the first praecinctio walkway; the aisles
 * lead on from there to every tier.
 */
export function amphitheatre(b: MeshBuilder, spec: AmphitheatreSpec, at?: THREE.Matrix4): AmphitheatreResult {
  const f = spec.facade;
  const n = f.bays;
  const facade = ellipticalArcade(b, { ...f, phase: 0.5, innerWall: false, slabOverlap: 0.5 }, at);
  const c = spec.cavea;
  const ax = c.arenaRx;
  const az = c.arenaRz;
  // Bay centres sit on the axes: bay n−1 at t = 0, n/4−1 at π/2, n/2−1 at π, 3n/4−1 at 3π/2.
  const every = spec.vomitoriumEvery ?? 10;
  const chosen: { bay: number; kind: 'gate' | 'vomitorium' }[] = [];
  for (let k = 0; k < n; k++) {
    const bay = (k + n - 1) % n; // bay whose centre is k bays round from +x
    const isGate = (spec.gates ?? true) && (k === 0 || k === n / 2);
    if (isGate) chosen.push({ bay, kind: 'gate' });
    else if (every > 0 && k % every === 0) chosen.push({ bay, kind: 'vomitorium' });
  }
  // Each passage's axis is the arena normal that passes through its facade bay's centre.
  const passages: CaveaPassage[] = chosen.map(({ bay, kind }) => {
    const bc = facade.bayCenters[bay];
    const guess = Math.atan2(bc.z / az, bc.x / ax);
    const miss = (t: number) => {
      const [ex, ez] = ellipseAt(ax, az, t);
      const [nx, nz] = ellipseNormal(ax, az, t);
      return (bc.x - ex) * -nz + (bc.z - ez) * nx;
    };
    let lo = guess - 0.4;
    let hi = guess + 0.4;
    if (miss(lo) > miss(hi)) [lo, hi] = [hi, lo];
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (miss(mid) > 0) hi = mid;
      else lo = mid;
    }
    return { t: (lo + hi) / 2, kind, width: kind === 'gate' ? (spec.gateWidth ?? 3.2) : (spec.vomitoriumWidth ?? 2.0) };
  });
  const cav = cavea(b, { ...c, passages, backWall: { height: facade.height, thickness: 0.9, opening: 3.0, material: f.material } }, at);
  const entrances = chosen.map(({ bay, kind }, i) => {
    const bc = facade.bayCenters[bay];
    const t = ((passages[i].t % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const passage = cav.passages.reduce((best, p) => (Math.abs(Math.cos(p.t - t) - 1) < Math.abs(Math.cos(best.t - t) - 1) ? p : best), cav.passages[0]);
    return { kind, bay, x: bc.x, z: bc.z, nx: bc.nx, nz: bc.nz, passage };
  });
  return { facade, cavea: cav, entrances };
}
