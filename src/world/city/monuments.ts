/**
 * The city's old and linear monuments, built once at load (they are seen from afar):
 *
 * - Servian wall remnants (atlas WALLS): Grotta Oscura tufa ashlar in stretches with gaps where
 *   the wall is 'partial', broken tops where 'ruinous', and only low stubs in open ground where it
 *   is 'built-over' (houses stand on the rest). The agger behind the Esquiline stretch is an earth
 *   bank with a promenade on top (Horace's garden walk).
 * - Gates that are not landmarks of their own (atlas GATES without `landmarkId`): obsolete single
 *   arches in tufa with a travertine arch ring, flanked by wall stubs; fragmentary ones as two
 *   broken piers. Gates recorded as "site only" / vanished are left out.
 * - Aqueduct arcades (atlas AQUEDUCTS of kind 'arcade' / 'mixed'): piers and arches carrying the
 *   channel (specus) at its recorded elevation; low stretches become a solid wall, underground
 *   stretches nothing. Piers that would stand in a road or street are left out (wider arch).
 */
import * as THREE from 'three';
import { Rng } from '../../core/Rng';
import { archway } from '../../arch/classical/arch';
import { wall as ashlarWall } from '../../arch/common/walls';
import { rectMin, runMin } from '../../arch/fabric/foundation';
import type { Game } from '../../core/Game';
import { MeshBuilder, type ColliderSpec } from '../../gfx/MeshBuilder';
import type { MaterialId } from '../../gfx/materialIds';
import type { Heightmap } from '../terrain/heightmap';
import type { BatchPool } from './batches';
import { offsetLine, type CityPlan, type PlanAqueduct, type PlanGate, type PlanWall } from './plan';
import { K, type Pt } from './raster';
import { addColliders, groundOffset } from './streamer';

const MATERIAL: Record<string, MaterialId> = {
  'aqua-claudia-anio-novus': 'peperino',
  'arcus-neroniani': 'brick',
  'aqua-claudia-palatine-branch': 'brick',
  'aqua-marcia-tepula-julia': 'tufa',
  'aqua-virgo': 'travertine',
  'aqua-julia-esquiline': 'tufa',
  'rivus-herculaneus': 'tufa',
  'aqua-traiana': 'brick',
};

/**
 * Build every wall, gate and aqueduct into the pool. Colliders go to `opts.colliders` per ~120 m
 * chunk (centre, radius, specs) when given, so they can exist only near the player; else to the
 * physics world at once.
 */
export function buildMonuments(
  game: Game,
  plan: CityPlan,
  hm: Heightmap,
  pool: BatchPool,
  opts: { inDetail: (x: number, z: number) => boolean; colliders?: (x: number, z: number, r: number, specs: ColliderSpec[]) => void },
) {
  const H = (x: number, z: number) => hm.heightAt(x, z);
  const inDetail = opts.inDetail;
  let pieces = 0;
  // Chunked builders (~120 m), so each chunk is one culling instance per material.
  const chunks = new Map<string, MeshBuilder>();
  const chunk = (x: number, z: number) => {
    const k = `${Math.floor(x / 120)},${Math.floor(z / 120)}`;
    let b = chunks.get(k);
    if (!b) chunks.set(k, (b = new MeshBuilder()));
    return b;
  };
  for (const w of plan.walls) pieces += buildWall(plan, w, H, chunk, inDetail);
  for (const gt of plan.gates) {
    buildGate(gt, H, chunk(gt.at[0], gt.at[1]), inDetail(gt.at[0], gt.at[1]));
    pieces++;
  }
  for (const a of plan.aqueducts) pieces += buildAqueduct(plan, a, H, chunk, inDetail);
  for (const [k, b] of chunks) {
    if (b.isEmpty) continue;
    const group = b.build(`city:mon:${k}`);
    pool.addGroup(group, { offset: groundOffset });
    if (!b.colliders.length) continue;
    const [ix, iz] = k.split(',').map(Number);
    if (opts.colliders) opts.colliders((ix + 0.5) * 120, (iz + 0.5) * 120, 86, b.colliders.slice());
    else addColliders(game, b.colliders, { city: 'monuments' });
  }
  return { pieces };
}

// ---------------------------------------------------------------- walls

function buildWall(plan: CityPlan, w: PlanWall, H: (x: number, z: number) => number, chunk: (x: number, z: number) => MeshBuilder, inDetail: (x: number, z: number) => boolean): number {
  const rng = new Rng(`wall:${w.id}`);
  const g = plan.grid;
  let n = 0;
  const piece = 7;
  const pts = w.points;
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const m = Math.max(1, Math.round(L / piece));
    const dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L;
    for (let j = 0; j < m; j++) {
      const p0: Pt = [a[0] + (b[0] - a[0]) * (j / m), a[1] + (b[1] - a[1]) * (j / m)];
      const p1: Pt = [a[0] + (b[0] - a[0]) * ((j + 1) / m), a[1] + (b[1] - a[1]) * ((j + 1) / m)];
      const mid: Pt = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
      const c = g.at(mid[0], mid[1]);
      // Nothing where the wall would stand in the river or on a landmark.
      if (c === K.WATER || c === K.LANDMARK) continue;
      let h = w.height;
      if (w.state === 'partial') {
        if (!rng.chance(0.62)) continue;
        h *= rng.range(0.75, 1);
      } else if (w.state === 'ruinous') {
        if (!rng.chance(0.5)) continue;
        h *= rng.range(0.35, 0.9);
      } else if (w.state === 'built-over') {
        // Stubs only in open ground (gardens, slopes, margins): houses stand on the rest.
        if (!(c === K.GARDEN || c === K.STEEP || c === K.MARGIN || c === K.OUTSIDE || c === K.SCRAP) || !rng.chance(0.35)) continue;
        h = rng.range(1.2, 2.6);
      }
      // Where a road or street crosses, the wall is breached exactly as wide as the way (the cells'
      // class along the wall's line decides, every metre): a piece that overlaps the way is cut short
      // at its edge, and the cut end is dressed as a jamb. (A whole piece skipped by its middle cell
      // left either a half-width gap or a block of wall standing in the road.)
      const runs = freeRuns(g, p0, p1);
      const theta = Math.atan2(-dz, dx);
      const half = w.thickness / 2 + 0.35; // both faces, where the audit probes the ground
      for (const run of runs) {
        const a0: Pt = [p0[0] + dx * run.s0, p0[1] + dz * run.s0];
        const len = run.s1 - run.s0 + (run.s0 > 0 || run.s1 < L ? 0 : 0.05);
        if (len < 1.2) continue;
        // Each run stands on the lowest ground under both its faces (sampled every metre), 0.6 m
        // down. Where the ground falls more than 0.3 per metre along it, it is built in steps of
        // 2 m or less, each on its own foot, so no piece hangs over the slope (the Quirinal wall).
        const whole = runMin(H, a0[0], a0[1], a0[0] + dx * len, a0[1] + dz * len, half);
        const parts = (whole.max - whole.min) / len > 0.3 ? Math.max(1, Math.ceil(len / 2)) : 1;
        let firstTop = 0, lastTop = 0, firstY0 = 0, lastY0 = 0;
        for (let q = 0; q < parts; q++) {
          const sa = (len * q) / parts, sb = (len * (q + 1)) / parts;
          const pa: Pt = [a0[0] + dx * sa, a0[1] + dz * sa];
          const plen = sb - sa + (q + 1 < parts ? 0.04 : 0);
          const pmid: Pt = [pa[0] + dx * (plen / 2), pa[1] + dz * (plen / 2)];
          const gnd = parts === 1 ? whole : runMin(H, pa[0], pa[1], pa[0] + dx * plen, pa[1] + dz * plen, half);
          const y0 = gnd.min - 0.6;
          const top = H(pmid[0], pmid[1]) + h;
          const at = new THREE.Matrix4().makeTranslation(pa[0], y0, pa[1]).multiply(new THREE.Matrix4().makeRotationY(theta));
          const high = inDetail(pmid[0], pmid[1]);
          ashlarWall(chunk(pmid[0], pmid[1]), { length: plen, height: top - y0, thickness: w.thickness, material: 'tufa', courses: high ? 0.42 : undefined, collide: true, detail: high ? 'high' : 'low' }, at);
          if (q === 0) { firstTop = top; firstY0 = y0; }
          lastTop = top;
          lastY0 = y0;
        }
        n++;
        // Jambs: a pier a little taller and wider than the wall where its end meets the way, on the
        // lowest ground under its own footprint.
        for (const side of [0, 1] as const) {
          if (!(side === 0 ? run.openStart : run.openEnd)) continue;
          if (w.state === 'built-over') continue;
          const s = side === 0 ? run.s0 : run.s1 - 1.4;
          const qa: Pt = [p0[0] + dx * s, p0[1] + dz * s];
          const q: Pt = [qa[0] + dx * 0.7, qa[1] + dz * 0.7];
          const jg = runMin(H, qa[0], qa[1], qa[0] + dx * 1.4, qa[1] + dz * 1.4, (w.thickness + 0.5) / 2 + 0.35, 0.5);
          const jy0 = Math.min(jg.min, side === 0 ? firstY0 + 0.6 : lastY0 + 0.6) - 0.6;
          const hj = (side === 0 ? firstTop : lastTop) - jy0 + 0.35;
          chunk(q[0], q[1]).box('tufa', 1.4, hj, w.thickness + 0.5, new THREE.Matrix4().makeTranslation(q[0], jy0 + hj / 2, q[1]).multiply(new THREE.Matrix4().makeRotationY(theta)), { collide: true });
        }
      }
    }
  }
  if (w.agger) n += buildAgger(w, H, chunk);
  return n;
}

/** A stretch of a wall piece that stands clear of the roads and streets crossing it. */
export interface FreeRun {
  s0: number;
  s1: number;
  /** The run's start / end meets a road or street (a breach), not just the piece's own end. */
  openStart: boolean;
  openEnd: boolean;
}

/** Ways through a wall: ground the wall line must leave open. */
const OPENING = new Set<number>([K.ROAD, K.STREET, K.PIAZZA]);

/** Split the piece p0→p1 into the runs of its line (0.5 m samples) that are not on a road or street. */
export function freeRuns(g: CityPlan['grid'], p0: Pt, p1: Pt): FreeRun[] {
  const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const n = Math.max(1, Math.ceil(L * 2));
  const runs: FreeRun[] = [];
  let start = -1;
  let openStart = false;
  const open = (k: number) => OPENING.has(g.at(p0[0] + ((p1[0] - p0[0]) * k) / n, p0[1] + ((p1[1] - p0[1]) * k) / n));
  for (let k = 0; k <= n; k++) {
    const blocked = k < n ? open(k) : false;
    if (!blocked && start < 0 && k < n) {
      start = k;
      openStart = k > 0;
    } else if ((blocked || k === n) && start >= 0) {
      runs.push({ s0: (start * L) / n, s1: (k * L) / n, openStart, openEnd: blocked });
      start = -1;
    }
  }
  return runs;
}

/** The agger: an earth bank behind the wall, its top a promenade (walkable trimesh). */
function buildAgger(w: PlanWall, H: (x: number, z: number) => number, chunk: (x: number, z: number) => MeshBuilder): number {
  const ag = w.agger!;
  const inner = offsetLine(w.points, (w.thickness / 2 + 0.2) * ag.side);
  const crest = offsetLine(w.points, (w.thickness / 2 + ag.width * 0.45) * ag.side);
  const foot = offsetLine(w.points, (w.thickness / 2 + ag.width) * ag.side);
  const top = w.height * 0.85;
  let n = 0;
  for (let k = 0; k + 1 < w.points.length; k++) {
    const segs = Math.max(1, Math.ceil(Math.hypot(w.points[k + 1][0] - w.points[k][0], w.points[k + 1][1] - w.points[k][1]) / 6));
    for (let j = 0; j < segs; j++) {
      const t0 = j / segs, t1 = (j + 1) / segs;
      const lerp = (l: Pt[], t: number): Pt => [l[k][0] + (l[k + 1][0] - l[k][0]) * t, l[k][1] + (l[k + 1][1] - l[k][1]) * t];
      const i0 = lerp(inner, t0), i1 = lerp(inner, t1), c0 = lerp(crest, t0), c1 = lerp(crest, t1), f0 = lerp(foot, t0), f1 = lerp(foot, t1);
      const y = (p: Pt, dy: number) => new THREE.Vector3(p[0], H(p[0], p[1]) + dy, p[1]);
      const yTop = (p: Pt) => y(p, top);
      const quads: THREE.Vector3[][] = [
        [yTop(i0), yTop(i1), yTop(c1), yTop(c0)], // promenade
        [yTop(c0), yTop(c1), y(f1, -0.2), y(f0, -0.2)], // bank down to the city side
      ];
      const b = chunk(i0[0], i0[1]);
      const pos: number[] = [];
      for (const q of quads) {
        // Up-facing: orient each quad so its normal has +y.
        const nrm = new THREE.Vector3().subVectors(q[1], q[0]).cross(new THREE.Vector3().subVectors(q[3], q[0]));
        const [a, bb, c, d] = nrm.y >= 0 ? q : [q[0], q[3], q[2], q[1]];
        pos.push(a.x, a.y, a.z, bb.x, bb.y, bb.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      b.add(geo, 'grass', undefined, { castShadow: false });
      b.collider({ kind: 'trimesh', geometry: geo });
      n++;
    }
  }
  return n;
}

// ---------------------------------------------------------------- gates

function buildGate(gt: PlanGate, H: (x: number, z: number) => number, b: MeshBuilder, high: boolean) {
  const rng = new Rng(`gate:${gt.id}`);
  const span = gt.passage;
  const pier = 2.2;
  const depth = 3.2;
  const springing = Math.max(3.6, span * 0.75);
  const top = springing + span / 2 + 1.8;
  const cos = Math.cos(gt.rotationY), sin = Math.sin(gt.rotationY);
  const world = (lx: number, lz: number): Pt => [gt.at[0] + lx * cos + lz * sin, gt.at[1] - lx * sin + lz * cos];
  const gLocal = (lx: number, lz: number) => H(...world(lx, lz));
  // The piers stand on the lowest ground under their whole footprint (0.35 m round it, every 0.5 m).
  const base = rectMin(gLocal, -span / 2 - pier - 0.35, span / 2 + pier + 0.35, -depth / 2 - 0.35, depth / 2 + 0.35, 0.5) - 0.5;
  const ground = H(gt.at[0], gt.at[1]);
  const at = new THREE.Matrix4().makeTranslation(gt.at[0], base, gt.at[1]).multiply(new THREE.Matrix4().makeRotationY(gt.rotationY));
  const lift = ground - base;
  const detail = high ? 'high' : 'low';
  if (gt.kind === 'arch') {
    archway(b, { span, springing: springing + lift, pier, depth, top: top + lift, material: 'tufa', trim: 'travertine', detail, keystone: true }, at);
  } else {
    // Fragmentary: two broken piers, no arch.
    for (const s of [-1, 1]) {
      const h = (top + lift) * rng.range(0.45, 0.8);
      b.box('tufa', pier, h, depth, at.clone().multiply(new THREE.Matrix4().makeTranslation(s * (span / 2 + pier / 2), h / 2, 0)), { collide: true });
    }
  }
  // Wall stubs either side (the circuit ran on from the gate), each on its own foot: the lowest
  // ground under its length and both faces, its top where it was.
  for (const s of [-1, 1]) {
    const len = rng.range(4, 9);
    const x0 = s < 0 ? -span / 2 - pier - len : span / 2 + pier;
    const topY = base + (top + lift) * rng.range(0.55, 0.85);
    const t = depth * 0.85;
    const sBase = rectMin(gLocal, x0, x0 + len, -t / 2 - 0.35, t / 2 + 0.35, 0.5) - 0.5;
    ashlarWall(b, { length: len, height: topY - sBase, thickness: t, material: 'tufa', courses: high ? 0.42 : undefined, collide: true, detail }, at.clone().multiply(new THREE.Matrix4().makeTranslation(x0, sBase - base, 0)));
  }
}

// ---------------------------------------------------------------- aqueducts

function buildAqueduct(plan: CityPlan, a: PlanAqueduct, H: (x: number, z: number) => number, chunk: (x: number, z: number) => MeshBuilder, inDetail: (x: number, z: number) => boolean): number {
  const mat = MATERIAL[a.id] ?? 'brick';
  const tall = a.channelY.some((y, i) => y - H(a.points[i][0], a.points[i][1]) > 14);
  const bay = tall ? 5.4 : 4.4;
  const pier = tall ? 1.9 : 1.5;
  const depth = tall ? 2.6 : 2.0;
  const channelH = 1.5;
  const g = plan.grid;
  // Arc-length parametrisation of the channel height.
  const cum = [0];
  for (let k = 1; k < a.points.length; k++) cum.push(cum[k - 1] + Math.hypot(a.points[k][0] - a.points[k - 1][0], a.points[k][1] - a.points[k - 1][1]));
  const total = cum[cum.length - 1];
  const at = (s: number) => {
    let k = 0;
    while (k < cum.length - 2 && cum[k + 1] < s) k++;
    const t = Math.min(1, Math.max(0, (s - cum[k]) / Math.max(1e-6, cum[k + 1] - cum[k])));
    const p: Pt = [a.points[k][0] + (a.points[k + 1][0] - a.points[k][0]) * t, a.points[k][1] + (a.points[k + 1][1] - a.points[k][1]) * t];
    const dir: Pt = [(a.points[k + 1][0] - a.points[k][0]) / Math.max(1e-6, cum[k + 1] - cum[k]), (a.points[k + 1][1] - a.points[k][1]) / Math.max(1e-6, cum[k + 1] - cum[k])];
    return { p, dir, y: a.channelY[k] + (a.channelY[k + 1] - a.channelY[k]) * t };
  };
  const blocked = (p: Pt) => {
    const c = g.at(p[0], p[1]);
    return c === K.ROAD || c === K.STREET || c === K.PIAZZA || c === K.LANDMARK || c === K.WATER;
  };
  // Pier positions: every bay, skipping those that would stand in a road, street or landmark.
  const piers: number[] = [];
  for (let s = 0; s <= total; s += bay) {
    const { p, y } = at(s);
    if (y - H(p[0], p[1]) < 1.2) {
      piers.push(-s - 1); // marker: underground here
      continue;
    }
    if (!blocked(p)) piers.push(s);
  }
  let n = 0;
  let prev: number | null = null;
  for (const s of piers) {
    if (s < 0) {
      prev = null;
      continue;
    }
    const P = at(s);
    const ground = H(P.p[0], P.p[1]);
    const h = P.y - ground;
    const high = inDetail(P.p[0], P.p[1]);
    const b = chunk(P.p[0], P.p[1]);
    const theta = Math.atan2(-P.dir[1], P.dir[0]);
    const topY = P.y - channelH; // top of the arcade masonry (under the channel)
    // The lowest ground under a bay (every metre along it, on both faces) and under a pier's footprint.
    const bayMin = (from: number) => runMin(H, at(from).p[0], at(from).p[1], P.p[0], P.p[1], depth / 2 + 0.35).min;
    if (h < 3) {
      // Low stretch: a solid substructure wall with the channel on top.
      if (prev !== null) {
        const len = s - prev;
        const mid = at((s + prev) / 2);
        const y0 = bayMin(prev) - 0.5;
        const m = new THREE.Matrix4().makeTranslation(mid.p[0], 0, mid.p[1]).multiply(new THREE.Matrix4().makeRotationY(theta));
        b.box(mat, len + 0.05, P.y - y0, depth, m.clone().multiply(new THREE.Matrix4().makeTranslation(0, (P.y + y0) / 2, 0)), { collide: true });
        channel(b, mat, m, len, depth, P.y, channelH);
        n++;
      }
      prev = s;
      continue;
    }
    // Pier, on the lowest ground under its four corners (and 0.35 m round them).
    const c = Math.cos(theta), sn = Math.sin(theta);
    const pierMin = rectMin((lx, lz) => H(P.p[0] + lx * c + lz * sn, P.p[1] - lx * sn + lz * c), -pier / 2 - 0.35, pier / 2 + 0.35, -depth / 2 - 0.35, depth / 2 + 0.35, 0.5);
    const y0 = pierMin - 0.5;
    const pm = new THREE.Matrix4().makeTranslation(P.p[0], 0, P.p[1]).multiply(new THREE.Matrix4().makeRotationY(theta));
    if (prev !== null) {
      const span = s - prev - pier;
      const mid = at((s + prev) / 2);
      const mm = new THREE.Matrix4().makeTranslation(mid.p[0], 0, mid.p[1]).multiply(new THREE.Matrix4().makeRotationY(theta));
      const lowGround = bayMin(prev);
      const springing = Math.max(lowGround + 2.4, topY - span / 2 - Math.max(0.6, span * 0.12));
      if (span > 0.5 && springing + span / 2 < topY - 0.2) {
        archway(b, { span, springing, pier: 0, depth, top: topY, material: mat, detail: 'low', leftPier: false, rightPier: false, archivolt: false, keystone: false, impost: high, collide: false }, mm);
        // Fill between the springing of a wide arch and the piers' tops is part of the piers.
      } else {
        // Too low for an arch: wall up to the channel.
        b.box(mat, Math.max(0.1, span), topY - lowGround + 0.5, depth, mm.clone().multiply(new THREE.Matrix4().makeTranslation(0, (topY + lowGround - 0.5) / 2, 0)));
      }
      channel(b, mat, mm, s - prev, depth, P.y, channelH);
      // Piers reach up to the springing of the higher neighbouring arch.
    }
    b.box(mat, pier, topY - y0, depth, pm.clone().multiply(new THREE.Matrix4().makeTranslation(0, (topY + y0) / 2, 0)), { collide: true });
    // String course at the springing level of the arches.
    if (high) b.box('travertine', pier + 0.12, 0.22, depth + 0.12, pm.clone().multiply(new THREE.Matrix4().makeTranslation(0, Math.max(y0 + 2.6, topY - bay * 0.5 - 0.6), 0)));
    prev = s;
    n++;
  }
  return n;
}

/** The covered channel (specus) on top of an arcade bay, with a cornice under it. */
function channel(b: MeshBuilder, mat: MaterialId, m: THREE.Matrix4, len: number, depth: number, top: number, h: number) {
  const L = len + 0.04;
  b.box(mat, L, h - 0.25, depth, m.clone().multiply(new THREE.Matrix4().makeTranslation(0, top - h + (h - 0.25) / 2, 0)));
  b.box('travertine', L, 0.25, depth + 0.35, m.clone().multiply(new THREE.Matrix4().makeTranslation(0, top - 0.125, 0)));
  b.box('travertine', L, 0.22, depth + 0.25, m.clone().multiply(new THREE.Matrix4().makeTranslation(0, top - h - 0.11, 0)));
}
