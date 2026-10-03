/**
 * Seating and arcades along arbitrary paths — what theatres (semicircle), stadia and circuses
 * (U-shaped runs) and naumachiae need and the kit's elliptical cavea does not cover.
 *
 * - `seating()` sweeps the kit's stepped cavea section (`caveaSection`) along an open polyline: the
 *   path is the foot of the podium wall at the arena/orchestra edge and its right-hand normal
 *   (dz, 0, −dx) points away from the arena. Rows are 1:1 (0.4 m risers, not walkable), radial
 *   aisles get half-height steps (walkable), every tread gets a solid box collider.
 * - `liteArcade()` is a cheap arcaded facade (piers + arch heads extruded from one notched outline,
 *   engaged half-columns, a cornice band per storey) for long facades seen mostly from afar; ~150
 *   triangles per bay instead of the kit's ~1–4k.
 */
import * as THREE from 'three';
import { caveaSection } from '../../../arch/classical/amphitheatre';
import { sweep, type V2 } from '../../../arch/common/geom';
import type { Draw } from '../../../arch/fabric/draw';
import type { MaterialId } from '../../../gfx/materialIds';
import type { LandmarkBuilder } from '../types';
import { V, along, frameAt, offsetLine, pathLength, type Detail, type V3 } from './generic-common';

export const builders: LandmarkBuilder[] = [];

export interface SeatingSpec {
  /** Foot of the podium wall, walked so the right-hand normal points away from the arena. */
  path: V3[];
  podium: number;
  /** Target height of the top row and horizontal reach of the seating. */
  height: number;
  reach: number;
  /** Horizontal walkways (praecinctiones) splitting the rows into tiers. */
  walkways?: number;
  /** Radial aisles (scalaria) spaced evenly along the path. */
  aisles: number;
  /** Walkway at the top (where a colonnade or the facade's attic stands). */
  topWalk?: number;
  seat?: MaterialId;
  riser?: MaterialId;
  podiumMat?: MaterialId;
  detail: Detail;
  /** Max chord length of the collider boxes along curves (default 5 m). */
  colliderChord?: number;
  /** Close the open ends with solid end walls (analemmata). Default true. */
  ends?: boolean;
  /** Skip aisles whose arc-length position falls in these [s0, s1] ranges (e.g. a temple at the top). */
  skip?: [number, number][];
  /** Balustrade on the podium (default true). */
  parapet?: boolean;
  /** A flight up the podium at every aisle, from the arena/orchestra floor (default false). */
  podiumStairs?: boolean;
}

export interface SeatingResult {
  height: number;
  reach: number;
  rows: number;
  /** Section profile (x outward from the path, y up). */
  profile: V2[];
}

/** Tiers and row depth that fit a target height and reach (pure). */
export function seatingTiers(height: number, reach: number, podium: number, walkways: number, topWalk: number) {
  const rise = 0.4;
  const rowsTotal = Math.max(3, Math.floor((height - podium) / rise));
  const tiers = Math.max(1, walkways + 1);
  const walk0 = 1.8;
  const walk = 1.4;
  const walks = walk0 + (tiers - 1) * walk + topWalk;
  const depth = Math.min(1.1, Math.max(0.62, (reach - walks) / rowsTotal));
  const per = Math.floor(rowsTotal / tiers);
  const list = Array.from({ length: tiers }, (_, i) => ({ rows: i === tiers - 1 ? rowsTotal - per * (tiers - 1) : per, rise, depth, walk: i === 0 ? walk0 : walk }));
  return list;
}

export function seating(d: Draw, spec: SeatingSpec): SeatingResult {
  const seat = spec.seat ?? 'marble';
  const riser = spec.riser ?? 'travertine';
  const topWalk = spec.topWalk ?? 2.5;
  const tiers = seatingTiers(spec.height, spec.reach, spec.podium, spec.walkways ?? 1, topWalk);
  const sec = caveaSection({ arenaRx: 1, arenaRz: 1, podium: spec.podium, tiers, topWalk });
  const { profile, rows } = sec;
  const path = spec.path;
  const m = d.m;
  // Swept surfaces: podium wall, then each riser/tread separately so materials alternate.
  const toProfile = (pts: V2[]) => ({ pts: [...pts].reverse(), smooth: pts.map(() => false) });
  d.b.add(sweep(toProfile(profile.slice(0, 3)), path, {}), spec.podiumMat ?? 'marble', m);
  const seatPts = profile.slice(2);
  for (let i = 0; i < seatPts.length - 1; i++) {
    const horizontal = Math.abs(seatPts[i + 1][1] - seatPts[i][1]) < 1e-6;
    const back = i === seatPts.length - 2;
    d.b.add(sweep(toProfile([seatPts[i], seatPts[i + 1]]), path, {}), back ? riser : horizontal ? seat : riser, m);
  }
  // Parapet on the podium.
  if (spec.parapet ?? true) {
    const par: V2[] = [[0.35, spec.podium], [0.35, spec.podium + 1.0], [0.05, spec.podium + 1.0], [0.05, spec.podium]];
    d.b.add(sweep({ pts: par, smooth: par.map(() => false) }, path, { back: true }), riser, m);
  }

  // End walls (analemmata): the section outline as a slab at each end.
  if (spec.ends ?? true) {
    const outline: V2[] = [...profile];
    const thick = 0.8;
    for (const [s, dir] of [[0, -1], [pathLength(path), 1]] as const) {
      const f = along(path, s);
      // shape in the plane spanned by (n, up): local x = −(profile x) maps to the frame's −z = n
      const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
      const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 1 });
      // ExtrudeGeometry: shape in XY, extruded along +z. Map shape x → n, y → up, extrude along ±t.
      const basis = new THREE.Matrix4().makeBasis(f.n.clone(), V(0, 1, 0), f.t.clone().multiplyScalar(dir));
      basis.setPosition(f.p);
      g.applyMatrix4(basis);
      // the start's basis is left-handed (mirrored): turn its triangles back outward
      if (dir < 0) fixWinding(g);
      d.b.add(g, riser, m);
      // collider for the end wall (a box along n)
      const mid = f.p.clone().addScaledVector(f.n, sec.reach / 2).addScaledVector(f.t, dir * thick / 2);
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.t, V(0, 1, 0), f.n.clone().negate()));
      pushBox(d, mid.setY(sec.height / 2), new THREE.Vector3(thick / 2, sec.height / 2, sec.reach / 2), q);
    }
  }

  // Tread colliders: one box per path segment (split long chords) per tread, from the ground up.
  const chord = spec.colliderChord ?? 5;
  const treads: { x0: number; x1: number; y: number }[] = [];
  for (let i = 1; i < profile.length - 1; i++) {
    const [x0, y0] = profile[i];
    const [x1, y1] = profile[i + 1];
    if (Math.abs(y1 - y0) < 1e-6 && x1 > x0 + 1e-6) treads.push({ x0: Math.max(0.3, x0) - 0.01, x1: x1 + 0.01, y: y0 });
  }
  // podium wall (+ parapet) as a band
  treads.unshift({ x0: -0.1, x1: 0.4, y: spec.podium + ((spec.parapet ?? true) ? 1.0 : 0) });
  for (const tr of treads) {
    const line = offsetLine(path, (tr.x0 + tr.x1) / 2);
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i], b = line[i + 1];
      const L = a.distanceTo(b);
      const k = Math.max(1, Math.ceil(L / chord));
      for (let j = 0; j < k; j++) {
        const p0 = a.clone().lerp(b, j / k), p1 = a.clone().lerp(b, (j + 1) / k);
        const t = p1.clone().sub(p0).normalize();
        const n = V(t.z, 0, -t.x);
        const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(t, V(0, 1, 0), n.clone().negate()));
        const c = p0.clone().add(p1).multiplyScalar(0.5).setY(tr.y / 2);
        pushBox(d, c, new THREE.Vector3(L / k / 2 + 0.05, tr.y / 2, (tr.x1 - tr.x0) / 2), q);
      }
    }
  }

  // Aisles: half-height steps in front of every row riser (0.2 m), walkable; and a flight up the podium.
  const L = pathLength(path);
  const W = 1.1;
  for (let k = 0; k < spec.aisles; k++) {
    const s = ((k + 0.5) / spec.aisles) * L;
    if (spec.skip?.some(([a, b]) => s >= a && s <= b)) continue;
    const f = along(path, s);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.t, V(0, 1, 0), f.n.clone().negate()));
    const step = (x0: number, x1: number, y0: number, y1: number, visible: boolean) => {
      const c = f.p.clone().addScaledVector(f.n, (x0 + x1) / 2).setY((y0 + y1) / 2);
      const half = new THREE.Vector3(W / 2, (y1 - y0) / 2, (x1 - x0) / 2);
      if (visible && spec.detail === 'high') {
        const g = new THREE.BoxGeometry(W, y1 - y0, x1 - x0);
        g.applyMatrix4(new THREE.Matrix4().compose(c, q, new THREE.Vector3(1, 1, 1)));
        d.b.add(g, riser, m, { castShadow: false });
      }
      pushBox(d, c, half, q);
    };
    for (const r of rows) {
      const prev = r.prevY ?? r.y - 0.4;
      const dd = (r.x1 - r.x0) * 0.5;
      step(r.x0 - dd, r.x0 + 0.01, prev, (prev + r.y) / 2, true);
    }
    if (spec.podiumStairs) {
      const n = Math.ceil(spec.podium / 0.2);
      for (let j = 1; j <= n; j++) step(-(n - j + 1) * 0.34, 0.02, 0, (spec.podium * j) / n, true);
    }
  }
  return { height: sec.height, reach: sec.reach, rows: rows.length, profile };
}

function pushBox(d: Draw, center: THREE.Vector3, half: THREE.Vector3, q: THREE.Quaternion) {
  const pos = new THREE.Vector3(), rot = new THREE.Quaternion(), scl = new THREE.Vector3();
  d.m.decompose(pos, rot, scl);
  d.b.collider({ kind: 'box', center: center.clone().applyMatrix4(d.m), half, rotation: rot.multiply(q) });
}

// ---------------------------------------------------------------- lite arcade

export interface LiteStorey {
  height: number;
  /** Engaged half-columns between the arches. */
  columns?: boolean;
  /** 'arcade' (default) or 'attic' (solid with small windows / pilasters). */
  kind?: 'arcade' | 'attic';
  /** Parapet height in upper arches. */
  parapet?: number;
}

export interface LiteArcadeSpec {
  storeys: LiteStorey[];
  /** Target bay width (axis to axis). */
  bay: number;
  depth: number;
  material?: MaterialId;
  detail: Detail;
  /** Opening width as a fraction of the bay (default 0.6). */
  open?: number;
  /** Colliders on the ground storey piers (default true). */
  collide?: boolean;
  /** Closed loop path. */
  closed?: boolean;
  /** Bays (by index) left solid (no opening), e.g. where a building abuts. */
  solid?: (i: number, n: number) => boolean;
}

const bayCache = new Map<string, THREE.BufferGeometry>();

/** One bay as a notched slab: x ∈ [0, w], y ∈ [0, h], z ∈ [0, depth] (front face at z = 0 facing −z). */
function bayGeometry(w: number, h: number, depth: number, open: number, sill: number, kind: 'arcade' | 'attic' | 'solid', segs: number): THREE.BufferGeometry {
  const key = [w, h, depth, open, sill, kind, segs].map((v) => (typeof v === 'number' ? v.toFixed(3) : v)).join('|');
  let g = bayCache.get(key);
  if (g) return g;
  const pts: THREE.Vector2[] = [];
  const ow = w * open;
  const x0 = (w - ow) / 2, x1 = (w + ow) / 2;
  if (kind === 'solid') {
    pts.push(new THREE.Vector2(0, 0), new THREE.Vector2(w, 0), new THREE.Vector2(w, h), new THREE.Vector2(0, h));
  } else if (kind === 'attic') {
    // small rectangular window in the middle
    const ww = w * 0.22, wy0 = h * 0.38, wy1 = h * 0.62;
    const s = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(w, 0), new THREE.Vector2(w, h), new THREE.Vector2(0, h)]);
    s.holes.push(new THREE.Path([new THREE.Vector2(w / 2 - ww / 2, wy0), new THREE.Vector2(w / 2 + ww / 2, wy0), new THREE.Vector2(w / 2 + ww / 2, wy1), new THREE.Vector2(w / 2 - ww / 2, wy1)]));
    g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 1 });
    g.scale(1, 1, -1);
    g.translate(0, 0, depth);
    fixWinding(g);
    bayCache.set(key, g);
    return g;
  } else {
    const r = ow / 2;
    const crown = Math.min(h * 0.86, sill + Math.max(ow * 1.6, r + 0.5));
    const spring = crown - r;
    pts.push(new THREE.Vector2(0, 0), new THREE.Vector2(x0, 0));
    pts.push(new THREE.Vector2(x0, spring));
    for (let i = 1; i < segs; i++) {
      const a = Math.PI - (Math.PI * i) / segs;
      pts.push(new THREE.Vector2(w / 2 + Math.cos(a) * r, spring + Math.sin(a) * r));
    }
    pts.push(new THREE.Vector2(x1, spring), new THREE.Vector2(x1, 0), new THREE.Vector2(w, 0), new THREE.Vector2(w, h), new THREE.Vector2(0, h));
  }
  g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth, bevelEnabled: false, curveSegments: 1 });
  // Extrusion runs along +z from the front face (z = 0) to the back; mirror so the shape's front
  // (normal +z in shape space) faces −z.
  g.scale(1, 1, -1);
  g.translate(0, 0, depth);
  fixWinding(g);
  bayCache.set(key, g);
  return g;
}

/** After a mirror the triangles are inside-out: swap two vertices of every triangle. */
export function fixWinding(g: THREE.BufferGeometry) {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i += 3) {
    const x = pos.getX(i + 1), y = pos.getY(i + 1), z = pos.getZ(i + 1);
    pos.setXYZ(i + 1, pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
    pos.setXYZ(i + 2, x, y, z);
  }
  g.deleteAttribute('normal');
  g.computeVertexNormals();
}

/**
 * Arcaded facade along a polyline: the facade faces the path's right-hand normal. Bays are spaced
 * evenly on each segment run (curves: one bay per chord when chords ≈ bay). Returns the height.
 */
export function liteArcade(d: Draw, path: V3[], spec: LiteArcadeSpec): { height: number; bays: number } {
  const mat = spec.material ?? 'travertine';
  const open = spec.open ?? 0.6;
  const segs = spec.detail === 'high' ? 8 : 5;
  // Build the bay list: (start point, tangent, normal, width)
  const bays: { p: V3; t: V3; n: V3; w: number }[] = [];
  const nSeg = spec.closed ? path.length : path.length - 1;
  for (let i = 0; i < nSeg; i++) {
    const a = path[i], b = path[(i + 1) % path.length];
    const L = a.distanceTo(b);
    if (L < 0.05) continue;
    const k = Math.max(1, Math.round(L / spec.bay));
    const t = b.clone().sub(a).normalize();
    const n = V(t.z, 0, -t.x);
    for (let j = 0; j < k; j++) bays.push({ p: a.clone().lerp(b, j / k), t, n, w: L / k });
  }
  let y = 0;
  spec.storeys.forEach((st, si) => {
    const entH = Math.min(1.2, st.height * 0.12);
    const wallH = st.height - entH;
    const kind = st.kind ?? 'arcade';
    const sill = si > 0 ? (st.parapet ?? 1.0) : 0;
    bays.forEach((bay, i) => {
      const solid = spec.solid?.(i, bays.length) ?? false;
      // overlap a little so curved chords close up
      const g = bayGeometry(bay.w + 0.04, wallH, spec.depth, open, sill, solid ? 'solid' : kind, segs);
      const fm = frameAt(bay.p.clone().setY(y).addScaledVector(bay.t, -0.02), bay.t, bay.n);
      d.b.add(g, mat, d.m.clone().multiply(fm));
      if (sill > 0 && kind === 'arcade' && !solid) {
        // parapet slab inside the opening
        const pm = fm.clone().multiply(new THREE.Matrix4().makeTranslation(bay.w / 2, sill * 0.45, spec.depth * 0.5));
        d.b.add(new THREE.BoxGeometry(bay.w * open, sill * 0.9, 0.25), mat, d.m.clone().multiply(pm));
      }
      if (st.columns && kind === 'arcade') {
        // engaged half-column at the bay start + capital and base blocks
        const D = Math.min(bay.w * 0.16, wallH / 9);
        const cm = fm.clone().multiply(new THREE.Matrix4().makeTranslation(0, sill, 0));
        const shaft = new THREE.CylinderGeometry(D * 0.43, D * 0.5, wallH - sill, spec.detail === 'high' ? 8 : 5, 1, true, Math.PI / 2, Math.PI);
        shaft.translate(0, (wallH - sill) / 2, 0);
        d.b.add(shaft, mat, d.m.clone().multiply(cm));
        d.b.add(new THREE.BoxGeometry(D * 1.25, D * 0.45, D * 0.7).translate(0, wallH - sill - D * 0.22, -D * 0.1), mat, d.m.clone().multiply(cm));
        d.b.add(new THREE.BoxGeometry(D * 1.3, D * 0.4, D * 0.7).translate(0, D * 0.2, -D * 0.1), mat, d.m.clone().multiply(cm));
      } else if (kind === 'attic' && st.columns) {
        const D = Math.min(bay.w * 0.12, wallH / 10);
        d.b.add(new THREE.BoxGeometry(D, wallH, D * 0.3).translate(0, wallH / 2, -D * 0.15), mat, d.m.clone().multiply(fm));
      }
      if (si === 0 && (spec.collide ?? true)) {
        // one pier collider at the bay start (half piers merge with the neighbour's)
        const pw = solid ? bay.w : bay.w * (1 - open);
        const cx = solid ? bay.w / 2 : 0;
        const c = bay.p.clone().addScaledVector(bay.t, cx).addScaledVector(bay.n, -spec.depth / 2).setY(st.height / 2);
        const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(bay.t, V(0, 1, 0), bay.n.clone().negate()));
        pushBox(d, c, new THREE.Vector3(pw / 2, st.height / 2, spec.depth / 2), q);
      }
    });
    // Entablature band (architrave + cornice) along the whole run.
    const corniceProfile: V2[] = [[-0.05, 0], [0.12, 0], [0.12, entH * 0.55], [0.32, entH * 0.75], [0.42, entH], [-0.05, entH]];
    const band = { pts: corniceProfile.map(([px, py]) => [px, py + y + wallH] as V2), smooth: corniceProfile.map(() => false) };
    d.b.add(sweep(band, path.map((p) => p.clone().setY(0)), { closed: spec.closed }), mat, d.m);
    // fill behind the band to the wall depth
    const fill: V2[] = [[-spec.depth, y + wallH], [0, y + wallH], [0, y + st.height], [-spec.depth, y + st.height]];
    d.b.add(sweep({ pts: fill, smooth: fill.map(() => false) }, path.map((p) => p.clone().setY(0)), { closed: spec.closed }), mat, d.m, { castShadow: false });
    y += st.height;
  });
  return { height: y, bays: bays.length };
}

/** Horizontal slab between two parallel paths (ambulatory floors / vault tops). */
export function ribbonSlab(d: Draw, path: V3[], x0: number, x1: number, y: number, thick: number, mat: MaterialId, closed = false) {
  const prof: V2[] = [[x0, y - thick], [x1, y - thick], [x1, y], [x0, y]];
  d.b.add(sweep({ pts: prof, smooth: prof.map(() => false) }, path.map((p) => p.clone().setY(0)), { closed, back: true }), mat, d.m, { castShadow: false });
}

/** A plain wall band along a path (profile x ∈ [x0, x1] outward, y0..y1). */
export function ribbonWall(d: Draw, path: V3[], x0: number, x1: number, y0: number, y1: number, mat: MaterialId, closed = false, collide = false) {
  const prof: V2[] = [[x1, y0], [x1, y1], [x0, y1], [x0, y0]];
  d.b.add(sweep({ pts: prof, smooth: prof.map(() => false) }, path.map((p) => p.clone().setY(0)), { closed, back: true }), mat, d.m);
  if (collide) {
    const line = offsetLine(path, (x0 + x1) / 2);
    const n = closed ? line.length : line.length - 1;
    for (let i = 0; i < n; i++) {
      const a = line[i], b = line[(i + 1) % line.length];
      const L = a.distanceTo(b);
      if (L < 0.01) continue;
      const t = b.clone().sub(a).normalize();
      const nn = V(t.z, 0, -t.x);
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(t, V(0, 1, 0), nn.negate()));
      pushBox(d, a.clone().add(b).multiplyScalar(0.5).setY((y0 + y1) / 2), new THREE.Vector3(L / 2 + 0.05, (y1 - y0) / 2, Math.abs(x1 - x0) / 2), q);
    }
  }
}
