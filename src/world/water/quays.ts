/**
 * Stone quays along the Tiber (AD 113): where riverbanks.ts says the bank is a quay, the heightmap
 * already shapes a flat quay top and a deep face; this builds the masonry on that shape.
 *
 * - The wall: a slightly battered face from below the river bed up to the quay top, dark wet
 *   peperino at the waterline, opus reticulatum above (brick-faced concrete on the Trajanic
 *   Emporium and the Transtiberim wharves), a travertine coping course standing 0.2 m proud.
 * - Paired travertine stairs down to a landing just above the water, every ~110 m, and submerged
 *   steps on from the landing to below a swimmer's feet, so the river can always be left there.
 * - A low travertine parapet on the coping (open at the stair heads, bridge abutments, across the
 *   openings in the face and `QUAY.gapFlank` beyond them, and wherever a landmark builds something
 *   out over the water), so falling in is a choice.
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
  /** Submerged steps run on from the landing down to this far below the water (game m). */
  wetDepth: 1.55,
  /** Parapet on the coping: height above the coping and thickness (game m). */
  parapet: 0.7,
  parapetThick: 0.42,
  /**
   * The parapet also stays open this far (game m) beyond each opening in the face, on both sides:
   * the landmark that fills the opening (the Cloaca Maxima's outfall bastion) climbs out of the
   * quay on a flight along its flank, and that flight's head must be reachable from the quay top.
   * It is data, not a probe, so it holds in whatever order the world is built.
   */
  gapFlank: 2,
};

/** A strip (REAL m, atlas frame) where the parapet stays open: a bridge and its abutment ramps. */
export interface Corridor {
  a: readonly [number, number];
  b: readonly [number, number];
  /** Half width (real m) of the open strip. */
  half: number;
}

/** Open strips for the bridges: deck half width + 3 m, the line extended 12 m past both ends. */
export function bridgeCorridors(bridges: readonly { a: readonly [number, number]; b: readonly [number, number]; width: number }[]): Corridor[] {
  return bridges.map((br) => {
    const dx = br.b[0] - br.a[0], dz = br.b[1] - br.a[1];
    const l = Math.hypot(dx, dz) || 1;
    const ex = (dx / l) * 12, ez = (dz / l) * 12;
    return { a: [br.a[0] - ex, br.a[1] - ez], b: [br.b[0] + ex, br.b[1] + ez], half: br.width / 2 + 3 };
  });
}

/** True when the REAL point (x, z) lies in one of the corridors. Pure. */
export function inCorridor(corridors: readonly Corridor[], x: number, z: number): boolean {
  for (const c of corridors) {
    const dx = c.b[0] - c.a[0], dz = c.b[1] - c.a[1];
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.min(1, Math.max(0, ((x - c.a[0]) * dx + (z - c.a[1]) * dz) / l2));
    if (Math.hypot(c.a[0] + dx * t - x, c.a[1] + dz * t - z) < c.half) return true;
  }
  return false;
}

export interface QuayOptions {
  /** Keep the parapet open over these strips (bridges). */
  corridors?: readonly Corridor[];
  /**
   * True where something already stands out over the water at the wall (GAME x, z) — a
   * landmark's own stairs, a crane platform: the parapet stays open there too.
   */
  occupied?: (x: number, z: number) => boolean;
  /** No parapet at all. */
  parapet?: boolean;
}

/**
 * Paired flights from the coping down to a landing just above the water, then submerged steps on
 * from the landing into the river, all solid travertine from the bed. `frame`: x along the bank,
 * y up, z riverward, origin on the wall face at y = 0. Returns the landing (frame coordinates).
 */
export function stairsToWater(b: MeshBuilder, mat: MaterialId, frame: THREE.Matrix4, water: number, yBed: number, yCop: number): THREE.Vector3 {
  const yLand = water + 0.25;
  const rise = yCop - yLand;
  const steps = Math.ceil(rise / QUAY.riser);
  const riser = rise / steps;
  const W = QUAY.stairWidth;
  const y0 = yBed + 0.5;
  // Landing (a solid travertine pier from the bed).
  frameBox(b, mat, frame, 0, (y0 + yLand) / 2, W / 2, QUAY.landing, yLand - y0, W, true);
  for (const dir of [-1, 1]) {
    for (let k = 0; k < steps; k++) {
      const yT = yLand + (k + 1) * riser;
      const x = dir * (QUAY.landing / 2 + (k + 0.5) * QUAY.tread);
      frameBox(b, mat, frame, x, (y0 + yT) / 2, W / 2, QUAY.tread + 0.01, yT - y0, W, true);
    }
  }
  const ph = QUAY.parapet + 0.15, pt = 0.3;
  const run = steps * QUAY.tread;
  const slope = Math.atan2(rise, run);
  const xEnd = QUAY.landing / 2 + run;
  // Submerged steps along the whole front (landing and flights), down to below a swimmer's feet:
  // whoever swims up to the stairs meets a step, and the first one, just awash, leads along to
  // the landing.
  const wet = Math.ceil((yLand - (water - QUAY.wetDepth)) / QUAY.riser);
  for (let k = 0; k < wet; k++) {
    const yT = yLand - (k + 1) * QUAY.riser;
    const z = W + (k + 0.5) * QUAY.tread;
    frameBox(b, mat, frame, 0, (y0 + yT) / 2, z, 2 * (xEnd + pt), yT - y0, QUAY.tread + 0.01, true);
  }
  // A parapet along each flight's river side, rising with it, and across its head (the way up
  // turns onto the quay through the opening in the coping parapet).
  // It starts a few steps up, so the landing stays open on the river side across its full width.
  const skip = Math.min(run * 0.5, 3 * QUAY.tread);
  for (const dir of [-1, 1]) {
    const pr = run - skip, prise = rise * (pr / run);
    const len = Math.hypot(pr, prise);
    const cx = dir * (xEnd - pr / 2), cy = yCop - prise / 2 + ph / 2 + 0.1;
    const lm = new THREE.Matrix4().makeRotationZ(dir * slope).setPosition(cx, cy, W - pt / 2).premultiply(frame);
    b.box(mat, len, ph, pt, lm, { castShadow: true });
    const rot = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(lm));
    b.collider({ kind: 'box', center: new THREE.Vector3().setFromMatrixPosition(lm), half: new THREE.Vector3(len / 2, ph / 2, pt / 2), rotation: rot });
    frameBox(b, mat, frame, dir * (xEnd + pt / 2), yCop + ph / 2, W / 2, pt, ph, W, true);
  }
  return new THREE.Vector3(0, yLand, W / 2);
}

/** Half span (game m, along the bank from the stair centre) of each flight's head: [inner, outer]. */
export function stairHead(water: number, yCop: number): [number, number] {
  const steps = Math.ceil((yCop - (water + 0.25)) / QUAY.riser);
  const xTop = QUAY.landing / 2 + (steps - 0.5) * QUAY.tread;
  return [xTop - 1.1, xTop + 0.45];
}

/**
 * Parapet pieces between chainages along a wall: `open` intervals are left out. Pure: returns the
 * kept intervals (pieces shorter than `min` are dropped).
 */
export function parapetPieces(s0: number, s1: number, open: readonly (readonly [number, number])[], min = 0.3): [number, number][] {
  let pieces: [number, number][] = [[s0, s1]];
  for (const [a, b] of open) {
    const next: [number, number][] = [];
    for (const [p, q] of pieces) {
      if (b <= p || a >= q) next.push([p, q]);
      else {
        if (a > p) next.push([p, a]);
        if (b < q) next.push([b, q]);
      }
    }
    pieces = next;
  }
  return pieces.filter(([p, q]) => q - p >= min);
}

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
export function buildQuay(river: TerrainRiver, rq: ResolvedQuay, heightAt: (x: number, z: number) => number, S = WORLD_SCALE, opts: QuayOptions = {}): QuayBuild {
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
    // Clear of the gaps and of the bridges (shifted along the quay if need be).
    const free = (s: number) => {
      if (s < rq.s0 + 15 || s > rq.s1 - 15 || rq.gaps.some((g) => Math.abs(s - g.s) < g.half + 20)) return false;
      for (const d of [-14, 0, 14]) {
        const p = at(s + d, QUAY.faceOffset);
        if (inCorridor(opts.corridors ?? [], p.x / S, p.z / S)) return false;
      }
      return true;
    };
    for (let i = 0; i < k; i++) {
      const s = rq.s0 + (len * (i + 0.5)) / k;
      const t = [0, 15, -15, 30, -30, 45, -45].map((d) => s + d).find(free);
      if (t !== undefined) stairAt.push(t);
    }
  }
  const nearStair = (s: number) => stairAt.some((c) => Math.abs(s - c) < 12);
  // The parapet stays open at the stair heads and over the gaps (and their flanks).
  const [hIn, hOut] = stairHead(wl, yCop);
  const open: [number, number][] = [];
  for (const sc of stairAt) open.push([sc + hIn / S, sc + hOut / S], [sc - hOut / S, sc - hIn / S]);
  const flank = QUAY.gapFlank / S;
  for (const g of rq.gaps) open.push([g.s - g.half - 0.8 - flank, g.s + g.half + 0.8 + flank]);
  const corridors = opts.corridors ?? [];
  const parapetOpen = (s: number) => {
    const c = at(s, QUAY.faceOffset);
    if (inCorridor(corridors, c.x / S, c.z / S)) return true;
    if (!opts.occupied) return false;
    for (const out of [0.8, 1.8]) {
      const o = at(s, QUAY.faceOffset - out / S);
      if (opts.occupied(o.x, o.z)) return true;
    }
    return false;
  };
  /** A parapet piece on the coping between chainages p0 and p1. */
  const parapet = (p0: number, p1: number) => {
    const pa = at(p0, QUAY.faceOffset), pb = at(p1, QUAY.faceOffset);
    const L = Math.hypot(pb.x - pa.x, pb.z - pa.z);
    if (L < 0.2) return;
    const off = QUAY.batter + 0.25;
    const c = new THREE.Vector3((pa.x + pb.x) / 2 + pa.bx * off, yCop + QUAY.parapet / 2, (pa.z + pb.z) / 2 + pa.bz * off);
    const rot = new THREE.Quaternion().setFromAxisAngle(yAxis, Math.atan2(-(pb.z - pa.z), pb.x - pa.x));
    m4.compose(c, rot, new THREE.Vector3(1, 1, 1));
    b.box(style.trim, L + 0.02, QUAY.parapet - 0.08, QUAY.parapetThick, m4.clone(), { castShadow: true });
    m4.compose(c.clone().setY(yCop + QUAY.parapet - 0.04), rot, new THREE.Vector3(1, 1, 1));
    b.box(style.trim, L + 0.06, 0.08, QUAY.parapetThick + 0.1, m4.clone(), { castShadow: true });
    b.collider({ kind: 'box', center: c, half: new THREE.Vector3(L / 2 + 0.01, QUAY.parapet / 2, QUAY.parapetThick / 2), rotation: rot });
  };

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
    if (opts.parapet !== false && !parapetOpen((sa + sb) / 2)) for (const [p0, p1] of parapetPieces(sa, sb, open)) parapet(p0, p1);

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
    landings.push(stairsToWater(b, style.trim, frame, wl, yBed, yCop).applyMatrix4(frame));
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
 * outline from the river bed to just above the island's ground, with a coping course and a low
 * parapet, and a flight of stairs down to the water on each long side (so a swimmer can climb
 * out). `skip` points (real m) leave room for structures built elsewhere (the carved prow
 * landmark); the parapet also stays open over `corridors` (the bridges' abutments).
 */
export function buildIslandFacing(
  outline: readonly (readonly [number, number])[],
  ground: number,
  waterLevel: number,
  skip: readonly { at: readonly [number, number]; r: number }[] = [],
  S = WORLD_SCALE,
  opts: { corridors?: readonly Corridor[]; stairs?: boolean; parapet?: boolean } = {},
): MeshBuilder & { landings: THREE.Vector3[] } {
  const b = new MeshBuilder() as MeshBuilder & { landings: THREE.Vector3[] };
  b.landings = [];
  const n = outline.length;
  let cx = 0, cz = 0;
  for (const [x, z] of outline) {
    cx += x / n;
    cz += z / n;
  }
  const yBed = (waterLevel - 4.6) * S;
  const wl = waterLevel * S;
  const yTop = ground * S + 0.25;
  const yCop = yTop + 0.2;
  // The face stands 6 m (real) outside the outline; the wall reaches back to 1 m outside it, so
  // its top covers the whole of the terrain's drop from the island ground to the river bed.
  const out = 6;
  const T = (out - 1) * S;
  const corridors = opts.corridors ?? [];
  const skipped = (x: number, z: number) => skip.some((s) => Math.hypot(x - s.at[0], z - s.at[1]) < s.r);
  // Outward edge normals, and one stair site per long side: the longest edge on each side of the
  // island's long axis that is clear of the bridges and the prow.
  const edges = [];
  for (let i = 0; i < n; i++) {
    const a = outline[i], c = outline[(i + 1) % n];
    const dx = c[0] - a[0], dz = c[1] - a[1];
    const L = Math.hypot(dx, dz);
    let nx = dz / Math.max(L, 1e-6), nz = -dx / Math.max(L, 1e-6);
    const mx = (a[0] + c[0]) / 2 - cx, mz = (a[1] + c[1]) / 2 - cz;
    if (mx * nx + mz * nz < 0) {
      nx = -nx;
      nz = -nz;
    }
    edges.push({ a, dx, dz, L, nx, nz, mx: (a[0] + c[0]) / 2, mz: (a[1] + c[1]) / 2 });
  }
  const [hIn, hOut] = stairHead(wl, yCop);
  const stairs: { e: (typeof edges)[number]; open: [number, number][] }[] = [];
  if (opts.stairs !== false) {
    // Long axis from the outline's covariance (sign of the cross product picks the side).
    let sxx = 0, sxz = 0, szz = 0;
    for (const [x, z] of outline) {
      sxx += (x - cx) ** 2;
      sxz += (x - cx) * (z - cz);
      szz += (z - cz) ** 2;
    }
    const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz);
    const ax = Math.cos(ang), az = Math.sin(ang);
    for (const sgn of [1, -1]) {
      let best: (typeof edges)[number] | null = null;
      for (const e of edges) {
        if (e.L * S < 2 * hOut + 1 || (ax * e.nz - az * e.nx) * sgn <= 0.5) continue;
        const fx = e.mx + e.nx * out, fz = e.mz + e.nz * out;
        if (skipped(fx, fz) || inCorridor(corridors, fx, fz)) continue;
        if (corridors.some((c) => inCorridor([{ ...c, half: c.half + 20 }], fx, fz))) continue;
        if (!best || e.L > best.L) best = e;
      }
      if (best) stairs.push({ e: best, open: [] });
    }
  }
  for (const st of stairs) {
    const e = st.e;
    // Frame: x along the edge (right-handed with y up and z outward), on the face at mid-edge.
    const Z = new THREE.Vector3(e.nx, 0, e.nz);
    const X = new THREE.Vector3().crossVectors(yAxis, Z).normalize();
    const frame = new THREE.Matrix4().makeBasis(X, yAxis, Z).setPosition((e.mx + e.nx * out) * S, 0, (e.mz + e.nz * out) * S);
    b.landings.push(stairsToWater(b, 'travertine', frame, wl, yBed, yCop).applyMatrix4(frame));
    // Openings in the parapet, as fractions along the edge (the edge runs along ±X).
    const half = (e.L * S) / 2;
    const along = (X.x * e.dx + X.z * e.dz) / e.L; // +1 when the edge runs along +X
    for (const sg of [-1, 1]) {
      const x0 = sg * hIn, x1 = sg * hOut;
      const t0 = 0.5 + (along * Math.min(x0, x1)) / (2 * half), t1 = 0.5 + (along * Math.max(x0, x1)) / (2 * half);
      st.open.push([Math.min(t0, t1), Math.max(t0, t1)]);
    }
  }
  edges.forEach((e) => {
    if (e.L < 0.5) return;
    const steps = Math.max(1, Math.round(e.L / 4));
    q.setFromAxisAngle(yAxis, Math.atan2(-e.dz, e.dx));
    const open = stairs.find((st) => st.e === e)?.open ?? [];
    for (let k = 0; k < steps; k++) {
      const t = (k + 0.5) / steps;
      const x = e.a[0] + e.dx * t + e.nx * out, z = e.a[1] + e.dz * t + e.nz * out;
      if (skipped(x, z)) continue;
      const len = (e.L / steps) * S + 0.3;
      const centre = new THREE.Vector3(x * S - e.nx * (T / 2), (yBed + yTop) / 2, z * S - e.nz * (T / 2));
      m4.compose(centre, q, new THREE.Vector3(1, 1, 1));
      b.box('travertine', len, yTop - yBed, T, m4.clone(), { collide: true, castShadow: true });
      // Coping, a little proud of the face.
      m4.compose(new THREE.Vector3(x * S + e.nx * 0.08, yTop + 0.1, z * S + e.nz * 0.08), q, new THREE.Vector3(1, 1, 1));
      b.box('travertine', len, 0.2, 0.9, m4.clone(), { castShadow: true });
      // Parapet pieces (open over the bridges and at the stair heads).
      if (opts.parapet === false || inCorridor(corridors, x, z)) continue;
      for (const [p0, p1] of parapetPieces(k / steps, (k + 1) / steps, open, 0.3 / (e.L * S))) {
        const L = (p1 - p0) * e.L * S + (p0 <= 0 || p1 >= 1 ? 0.15 : 0.02);
        const tm = (p0 + p1) / 2;
        const px = (e.a[0] + e.dx * tm + e.nx * out) * S - e.nx * 0.1, pz = (e.a[1] + e.dz * tm + e.nz * out) * S - e.nz * 0.1;
        const c = new THREE.Vector3(px, yCop + QUAY.parapet / 2, pz);
        m4.compose(c, q, new THREE.Vector3(1, 1, 1));
        b.box('travertine', L, QUAY.parapet - 0.08, QUAY.parapetThick, m4.clone(), { castShadow: true });
        m4.compose(c.clone().setY(yCop + QUAY.parapet - 0.04), q, new THREE.Vector3(1, 1, 1));
        b.box('travertine', L + 0.04, 0.08, QUAY.parapetThick + 0.1, m4.clone(), { castShadow: true });
        b.collider({ kind: 'box', center: c, half: new THREE.Vector3(L / 2, QUAY.parapet / 2, QUAY.parapetThick / 2), rotation: q.clone() });
      }
    }
  });
  return b;
}
