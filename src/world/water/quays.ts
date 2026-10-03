/**
 * Stone quays along the Tiber (AD 113): where riverbanks.ts says the bank is a quay, the heightmap
 * already shapes a flat quay top and a deep face; this builds the masonry on that shape.
 *
 * - The wall: a slightly battered face from below the river bed up to the quay top, dark wet
 *   peperino at the waterline, opus reticulatum above (brick-faced concrete on the Trajanic
 *   Emporium and the Transtiberim wharves), a travertine coping course standing 0.2 m proud.
 * - Paired travertine stairs down to a landing just above the water, every ~110 m.
 * - Pierced travertine mooring blocks every ~14 m.
 * - Openings in the face (`gaps`): the arched outfall of the Cloaca Maxima, with three rings of
 *   peperino voussoirs and the dark culvert behind.
 *
 * All in one MeshBuilder per quay (merged per material); colliders are oriented boxes.
 */
import * as THREE from 'three';
import type { MaterialId } from '../../gfx/materialIds';
import { MeshBuilder, type ColliderSpec } from '../../gfx/MeshBuilder';
import { WORLD_SCALE } from '../coords';
import type { TerrainRiver } from '../terrain/heightmap';
import { chain, type ChainedLine, type ResolvedQuay } from '../terrain/riverbanks';

export interface StationPoint {
  x: number;
  z: number;
  tx: number;
  tz: number;
  /** Channel half width (real m) at the station. */
  half: number;
}

/** Point, tangent and half width at chainage `s` (real m) along a river centerline. */
export function stationAt(line: ChainedLine, widths: readonly number[], s: number): StationPoint {
  const { pts, cum } = line;
  let i = 0;
  while (i < pts.length - 2 && cum[i + 1] < s) i++;
  const L = cum[i + 1] - cum[i] || 1;
  const t = Math.min(1, Math.max(0, (s - cum[i]) / L));
  const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1];
  const l = Math.hypot(dx, dz) || 1;
  const w0 = widths[i] ?? widths[widths.length - 1];
  const w1 = widths[i + 1] ?? w0;
  return { x: pts[i][0] + dx * t, z: pts[i][1] + dz * t, tx: dx / l, tz: dz / l, half: (w0 + (w1 - w0) * t) / 2 };
}

export interface QuayStyle {
  face: MaterialId;
  base: MaterialId;
  trim: MaterialId;
}

export function quayStyle(id: string): QuayStyle {
  // Trajanic and late wharves: brick-faced concrete; older Republican quays: reticulatum.
  const brick = id === 'quay-emporium' || id === 'quay-ripa';
  return { face: brick ? 'brick' : 'reticulatum', base: 'peperino', trim: 'travertine' };
}

/** Quay geometry constants (game metres unless noted). */
export const QUAY = {
  /** Face offset from the channel edge, real m (negative = into the river). */
  faceOffset: -3.2,
  /** Back of the wall top, real m behind the channel edge (covers the terrain's coarse rise). */
  backOffset: 3.5,
  coping: 0.2,
  copingDepth: 0.9,
  batter: 0.3,
  station: 4,
  stairEvery: 110,
  mooringEvery: 14,
  riser: 0.2,
  tread: 0.32,
  stairWidth: 2.0,
  landing: 2.4,
};

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const yAxis = new THREE.Vector3(0, 1, 0);

/** Add a box (centre, size) in a local frame `frame` (columns: along, up, riverward). */
function frameBox(b: MeshBuilder, mat: MaterialId, frame: THREE.Matrix4, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, collide: boolean) {
  m4.makeTranslation(cx, cy, cz).premultiply(frame);
  b.box(mat, sx, sy, sz, m4.clone(), { collide, castShadow: true });
}

export interface QuayBuild {
  builder: MeshBuilder;
  colliders: ColliderSpec[];
  /** Stair landings (game x, y, z) – handy spawn / interaction points. */
  landings: THREE.Vector3[];
}

/**
 * Build one quay. `heightAt` is the terrain (game m) for the wall top behind the coping.
 * Returns geometry in WORLD (game) space.
 */
export function buildQuay(river: TerrainRiver, rq: ResolvedQuay, heightAt: (x: number, z: number) => number, S = WORLD_SCALE): QuayBuild {
  const b = new MeshBuilder();
  const line = chain(river.centerline);
  const style = quayStyle(rq.quay.id);
  const wl = river.waterLevel * S;
  const yBed = (river.waterLevel - 4.6) * S;
  const yTop = rq.quay.top * S;
  const yCop = yTop + QUAY.coping;
  const yBase = wl + 0.55;
  const side = rq.side;
  const landings: THREE.Vector3[] = [];
  const len = rq.s1 - rq.s0;
  const n = Math.max(1, Math.round(len / QUAY.station));
  const ds = len / n;

  /** World point at chainage s, offset (real m) from the channel edge toward the bank. */
  const at = (s: number, off: number) => {
    const p = stationAt(line, river.width, s);
    // Bank direction: side * left normal (tz, -tx).
    const bx = side * p.tz, bz = side * -p.tx;
    const d = p.half + off;
    return { x: (p.x + bx * d) * S, z: (p.z + bz * d) * S, tx: p.tx, tz: p.tz, bx, bz };
  };
  const inGap = (s: number) => rq.gaps.some((g) => Math.abs(s - g.s) < g.half + 0.8);
  const stairAt: number[] = [];
  if (len > 40) {
    const k = Math.max(1, Math.round(len / QUAY.stairEvery));
    for (let i = 0; i < k; i++) {
      const s = rq.s0 + (len * (i + 0.5)) / k;
      if (!rq.gaps.some((g) => Math.abs(s - g.s) < g.half + 20)) stairAt.push(s);
    }
  }
  const nearStair = (s: number) => stairAt.some((c) => Math.abs(s - c) < 12);

  // ---- the wall, segment by segment (face, waterline course, coping, top)
  const pos: number[] = [];
  const base: number[] = [];
  const quad = (arr: number[], a: number[], bb: number[], c: number[], d: number[]) => arr.push(...a, ...bb, ...c, ...a, ...c, ...d);
  for (let i = 0; i < n; i++) {
    const sa = rq.s0 + i * ds, sb = sa + ds;
    if (inGap((sa + sb) / 2)) continue;
    const fa = at(sa, QUAY.faceOffset), fb = at(sb, QUAY.faceOffset);
    const ka = at(sa, QUAY.backOffset), kb = at(sb, QUAY.backOffset);
    // Batter: the face leans back toward the bank as it rises.
    const ta = { x: fa.x + fa.bx * QUAY.batter, z: fa.z + fa.bz * QUAY.batter };
    const tb = { x: fb.x + fb.bx * QUAY.batter, z: fb.z + fb.bz * QUAY.batter };
    const yc = yCop - 0.5;
    // Order the quad so it faces the river whichever side the quay is on.
    const face = (arr: number[], y0: number, y1: number, k0: number, k1: number) => {
      const lerp = (p: { x: number; z: number }, t: { x: number; z: number }, k: number) => [p.x + (t.x - p.x) * k, 0, p.z + (t.z - p.z) * k];
      const A0 = lerp(fa, ta, k0), B0 = lerp(fb, tb, k0), A1 = lerp(fa, ta, k1), B1 = lerp(fb, tb, k1);
      A0[1] = B0[1] = y0;
      A1[1] = B1[1] = y1;
      if (side > 0) quad(arr, A0, B0, B1, A1);
      else quad(arr, A0, A1, B1, B0);
    };
    const kBase = (yBase - yBed) / (yc - yBed);
    face(base, yBed, yBase, 0, kBase);
    face(pos, yBase, yc, kBase, 1);
    // Coping course (travertine): proud of the face by a little, standing 0.2 m above the quay.
    const ca = at(sa, QUAY.faceOffset), cb = at(sb, QUAY.faceOffset);
    const cl = Math.hypot(cb.x - ca.x, cb.z - ca.z);
    const mid = { x: (ca.x + cb.x) / 2 + ca.bx * (QUAY.batter + QUAY.copingDepth / 2 - 0.08), z: (ca.z + cb.z) / 2 + ca.bz * (QUAY.batter + QUAY.copingDepth / 2 - 0.08) };
    q.setFromAxisAngle(yAxis, Math.atan2(-(cb.z - ca.z), cb.x - ca.x));
    m4.compose(new THREE.Vector3(mid.x, yc + 0.25, mid.z), q, new THREE.Vector3(1, 1, 1));
    b.box(style.trim, cl + 0.04, 0.5, QUAY.copingDepth, m4.clone(), { castShadow: true });
    // Wall top between the coping and the back (flush with the quay surface, in travertine).
    const backH = Math.max(yTop, heightAt((ka.x + kb.x) / 2, (ka.z + kb.z) / 2)) + 0.04;
    const t0 = { x: ta.x + fa.bx * (QUAY.copingDepth - 0.1), z: ta.z + fa.bz * (QUAY.copingDepth - 0.1) };
    const t1 = { x: tb.x + fb.bx * (QUAY.copingDepth - 0.1), z: tb.z + fb.bz * (QUAY.copingDepth - 0.1) };
    const top: number[] = [];
    const P = (p: { x: number; z: number }) => [p.x, backH, p.z];
    if (side > 0) quad(top, P(t0), P(t1), P(kb), P(ka));
    else quad(top, P(t0), P(ka), P(kb), P(t1));
    b.add(geom(top), 'paving_travertine', undefined, { castShadow: false });
    // Collider: one box per segment from the bed to the coping top, face to back.
    const cx = (fa.x + fb.x + ka.x + kb.x) / 4, cz = (fa.z + fb.z + ka.z + kb.z) / 4;
    const depth = Math.hypot(ka.x - fa.x, ka.z - fa.z);
    b.collider({
      kind: 'box',
      center: new THREE.Vector3(cx, (yBed + yTop) / 2, cz),
      half: new THREE.Vector3(cl / 2 + 0.05, (yTop - yBed) / 2, depth / 2),
      rotation: q.clone(),
    });
    b.collider({ kind: 'box', center: new THREE.Vector3(mid.x, yc + 0.25, mid.z), half: new THREE.Vector3(cl / 2 + 0.02, 0.25, QUAY.copingDepth / 2), rotation: q.clone() });

    // Mooring blocks (not on stairs): a pierced travertine block with its stone ring.
    const sm = (sa + sb) / 2;
    if (Math.floor((sa - rq.s0) / QUAY.mooringEvery) !== Math.floor((sb - rq.s0) / QUAY.mooringEvery) && !nearStair(sm)) {
      const f = at(sm, QUAY.faceOffset);
      const k = (wl + 1.1 - yBed) / (yc - yBed);
      const fx = f.x + f.bx * QUAY.batter * k - f.bx * 0.18, fz = f.z + f.bz * QUAY.batter * k - f.bz * 0.18;
      m4.compose(new THREE.Vector3(fx, wl + 1.1, fz), q, new THREE.Vector3(1, 1, 1));
      b.box(style.trim, 0.8, 0.6, 0.45, m4.clone(), { castShadow: true });
      const ring = new THREE.TorusGeometry(0.17, 0.055, 6, 12);
      const ringM = new THREE.Matrix4().compose(new THREE.Vector3(fx - f.bx * 0.28, wl + 1.1, fz - f.bz * 0.28), q, new THREE.Vector3(1, 1, 1));
      b.add(ring, style.trim, ringM, { castShadow: true });
    }
  }
  b.add(geom(pos), style.face, undefined, { castShadow: true });
  b.add(geom(base), style.base, undefined, { castShadow: true });

  // ---- paired stairs to the water
  for (const sc of stairAt) {
    const f = at(sc, QUAY.faceOffset);
    // Local frame: x along the bank (mirrored so the frame stays right-handed), y up, z riverward.
    const X = new THREE.Vector3(side * f.tx, 0, side * f.tz);
    const Z = new THREE.Vector3(-f.bx, 0, -f.bz);
    const frame = new THREE.Matrix4().makeBasis(X, yAxis, Z).setPosition(f.x, 0, f.z);
    const yLand = wl + 0.25;
    const rise = yCop - yLand;
    const steps = Math.ceil(rise / QUAY.riser);
    const riser = rise / steps;
    const W = QUAY.stairWidth;
    const y0 = yBed + 0.5;
    // Landing (a solid travertine pier from the bed).
    frameBox(b, style.trim, frame, 0, (y0 + yLand) / 2, W / 2, QUAY.landing, yLand - y0, W, true);
    for (const dir of [-1, 1]) {
      for (let k = 0; k < steps; k++) {
        const yT = yLand + (k + 1) * riser;
        const x = dir * (QUAY.landing / 2 + (k + 0.5) * QUAY.tread);
        frameBox(b, style.trim, frame, x, (y0 + yT) / 2, W / 2, QUAY.tread + 0.01, yT - y0, W, true);
      }
    }
    landings.push(new THREE.Vector3(0, yLand, W / 2).applyMatrix4(frame));
  }

  // ---- openings (the Cloaca Maxima outfall)
  for (const g of rq.gaps) {
    const f = at(g.s, QUAY.faceOffset);
    const X = new THREE.Vector3(side * f.tx, 0, side * f.tz);
    const Z = new THREE.Vector3(-f.bx, 0, -f.bz);
    const frame = new THREE.Matrix4().makeBasis(X, yAxis, Z).setPosition(f.x, 0, f.z);
    const half = (g.half + 0.8) * S; // the wall gap (game m)
    const w = 3.0; // opening width (game m; walkable)
    const floor = 4.7 * S;
    const spring = floor + 1.4;
    const r = w / 2;
    const crown = spring + r;
    const yc = yCop - 0.5;
    // Face pieces either side of the opening and the spandrel above it.
    const side0 = half - w / 2;
    for (const sgn of [-1, 1]) {
      frameBox(b, style.face, frame, sgn * (w / 2 + side0 / 2), (yBase + yc) / 2, -0.15, side0 + 0.02, yc - yBase, 0.6, true);
      frameBox(b, style.base, frame, sgn * (w / 2 + side0 / 2), (yBed + yBase) / 2, 0, side0 + 0.02, yBase - yBed, 0.6, true);
      // Jambs.
      frameBox(b, 'peperino', frame, sgn * (r + 0.3), (floor - 1 + spring) / 2, -0.45, 0.6, spring - floor + 1, 0.9, true);
    }
    frameBox(b, style.face, frame, 0, (crown + 0.9 + yc) / 2, -0.15, w + 0.02, yc - crown - 0.9, 0.6, false);
    // Three rings of voussoirs.
    for (let ring = 0; ring < 3; ring++) {
      const rr = r + 0.15 + ring * 0.32;
      const nv = 11 + ring * 2;
      for (let k = 0; k < nv; k++) {
        const a = Math.PI * ((k + 0.5) / nv);
        const cx = Math.cos(a) * rr, cy = spring + Math.sin(a) * rr;
        const vm = new THREE.Matrix4().makeRotationZ(a - Math.PI / 2).setPosition(cx, cy, -0.05 + ring * 0.05);
        b.box('peperino', 0.3, (Math.PI * rr) / nv - 0.02, 0.5 - ring * 0.08, vm.premultiply(frame), { castShadow: true });
      }
    }
    // A short barrel vault, then the dark culvert (the dungeon module owns what lies beyond).
    for (let k = 0; k < 9; k++) {
      const a = Math.PI * ((k + 0.5) / 9);
      const vm = new THREE.Matrix4().makeRotationZ(a - Math.PI / 2).setPosition(Math.cos(a) * (r + 0.1), spring + Math.sin(a) * (r + 0.1), -0.45);
      b.box('tufa', 0.2, (Math.PI * r) / 9 + 0.05, 0.8, vm.premultiply(frame), { castShadow: false });
    }
    frameBox(b, 'black', frame, 0, (floor + crown) / 2, -0.85, w + 0.4, crown - floor + 0.6, 0.1, false);
    frameBox(b, 'peperino', frame, 0, floor - 0.3, -0.45, w + 0.6, 0.6, 0.9, true);
  }

  return { builder: b, colliders: b.colliders, landings };
}

function geom(arr: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Tiber Island's travertine facing (the "stone ship", 1st c. BC): a wall all round the island
 * outline from the river bed to just above the island's ground, with a coping course.
 * `skip` points (real m) leave room for structures built elsewhere (the carved prow landmark).
 */
export function buildIslandFacing(
  outline: readonly (readonly [number, number])[],
  ground: number,
  waterLevel: number,
  skip: readonly { at: readonly [number, number]; r: number }[] = [],
  S = WORLD_SCALE,
): MeshBuilder {
  const b = new MeshBuilder();
  const n = outline.length;
  let cx = 0, cz = 0;
  for (const [x, z] of outline) {
    cx += x / n;
    cz += z / n;
  }
  const yBed = (waterLevel - 4.6) * S;
  const yTop = ground * S + 0.25;
  // The face stands 6 m (real) outside the outline; the wall reaches back to 1 m outside it, so
  // its top covers the whole of the terrain's drop from the island ground to the river bed.
  const out = 6;
  const T = (out - 1) * S;
  const skipped = (x: number, z: number) => skip.some((s) => Math.hypot(x - s.at[0], z - s.at[1]) < s.r);
  for (let i = 0; i < n; i++) {
    const a = outline[i], c = outline[(i + 1) % n];
    const dx = c[0] - a[0], dz = c[1] - a[1];
    const L = Math.hypot(dx, dz);
    if (L < 0.5) continue;
    // Edge normal, flipped to point away from the island's centroid.
    let nx = dz / L, nz = -dx / L;
    const mx = (a[0] + c[0]) / 2 - cx, mz = (a[1] + c[1]) / 2 - cz;
    if (mx * nx + mz * nz < 0) {
      nx = -nx;
      nz = -nz;
    }
    const steps = Math.max(1, Math.round(L / 4));
    q.setFromAxisAngle(yAxis, Math.atan2(-dz, dx));
    for (let k = 0; k < steps; k++) {
      const t = (k + 0.5) / steps;
      const x = a[0] + dx * t + nx * out, z = a[1] + dz * t + nz * out;
      if (skipped(x, z)) continue;
      const len = (L / steps) * S + 0.3;
      const centre = new THREE.Vector3(x * S - nx * (T / 2), (yBed + yTop) / 2, z * S - nz * (T / 2));
      m4.compose(centre, q, new THREE.Vector3(1, 1, 1));
      b.box('travertine', len, yTop - yBed, T, m4.clone(), { collide: true, castShadow: true });
      // Coping, a little proud of the face.
      m4.compose(new THREE.Vector3(x * S + nx * 0.08, yTop + 0.1, z * S + nz * 0.08), q, new THREE.Vector3(1, 1, 1));
      b.box('travertine', len, 0.2, 0.9, m4.clone(), { castShadow: true });
    }
  }
  return b;
}
