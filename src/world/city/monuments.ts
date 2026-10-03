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
import type { Game } from '../../core/Game';
import { MeshBuilder } from '../../gfx/MeshBuilder';
import type { MaterialId } from '../../gfx/materialIds';
import type { Heightmap } from '../terrain/heightmap';
import type { BatchPool } from './batches';
import { offsetLine, type Bounds, type CityPlan, type PlanAqueduct, type PlanGate, type PlanWall } from './plan';
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

export function buildMonuments(game: Game, plan: CityPlan, hm: Heightmap, pool: BatchPool, opts: { detailBounds: Bounds }) {
  const H = (x: number, z: number) => hm.heightAt(x, z);
  const db = opts.detailBounds;
  const inDetail = (x: number, z: number) => x >= db.minX && x <= db.maxX && z >= db.minZ && z <= db.maxZ;
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
    addColliders(game, b.colliders, { city: 'monuments' });
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
      // Nothing where the wall would block a road or street, or stands in the river.
      if (c === K.ROAD || c === K.STREET || c === K.WATER || c === K.LANDMARK || c === K.PIAZZA) continue;
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
      const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + 0.05;
      const y0 = Math.min(H(p0[0], p0[1]), H(p1[0], p1[1]), H(mid[0], mid[1])) - 0.6;
      const top = H(mid[0], mid[1]) + h;
      const theta = Math.atan2(-dz, dx);
      const at = new THREE.Matrix4().makeTranslation(p0[0], y0, p0[1]).multiply(new THREE.Matrix4().makeRotationY(theta));
      const high = inDetail(mid[0], mid[1]);
      ashlarWall(chunk(mid[0], mid[1]), { length: len, height: top - y0, thickness: w.thickness, material: 'tufa', courses: high ? 0.42 : undefined, collide: true, detail: high ? 'high' : 'low' }, at);
      n++;
    }
  }
  if (w.agger) n += buildAgger(w, H, chunk);
  return n;
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
  let base = Infinity;
  for (const lx of [-span / 2 - pier, 0, span / 2 + pier]) {
    const [x, z] = world(lx, 0);
    base = Math.min(base, H(x, z));
  }
  const ground = H(gt.at[0], gt.at[1]);
  base -= 0.4;
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
  // Wall stubs either side (the circuit ran on from the gate).
  for (const s of [-1, 1]) {
    const len = rng.range(4, 9);
    const x0 = s < 0 ? -span / 2 - pier - len : span / 2 + pier;
    const h = (top + lift) * rng.range(0.55, 0.85);
    ashlarWall(b, { length: len, height: h, thickness: depth * 0.85, material: 'tufa', courses: high ? 0.42 : undefined, collide: true, detail }, at.clone().multiply(new THREE.Matrix4().makeTranslation(x0, 0, 0)));
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
    if (h < 3) {
      // Low stretch: a solid substructure wall with the channel on top.
      if (prev !== null) {
        const A = at(prev);
        const len = s - prev;
        const mid = at((s + prev) / 2);
        const y0 = Math.min(H(A.p[0], A.p[1]), ground) - 0.5;
        const m = new THREE.Matrix4().makeTranslation(mid.p[0], 0, mid.p[1]).multiply(new THREE.Matrix4().makeRotationY(theta));
        b.box(mat, len + 0.05, P.y - y0, depth, m.clone().multiply(new THREE.Matrix4().makeTranslation(0, (P.y + y0) / 2, 0)), { collide: true });
        channel(b, mat, m, len, depth, P.y, channelH);
        n++;
      }
      prev = s;
      continue;
    }
    // Pier.
    const y0 = ground - 0.5;
    const pm = new THREE.Matrix4().makeTranslation(P.p[0], 0, P.p[1]).multiply(new THREE.Matrix4().makeRotationY(theta));
    if (prev !== null) {
      const A = at(prev);
      const span = s - prev - pier;
      const mid = at((s + prev) / 2);
      const mm = new THREE.Matrix4().makeTranslation(mid.p[0], 0, mid.p[1]).multiply(new THREE.Matrix4().makeRotationY(theta));
      const lowGround = Math.min(H(A.p[0], A.p[1]), ground);
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
