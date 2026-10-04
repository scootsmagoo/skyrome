/**
 * Agrippa's Euripus as built masonry: a wall on each side of the channel (tufa under a travertine
 * coping, the kerb standing `CANAL.kerb` above the water), an end wall where it leaves the Stagnum,
 * a sill where it spills into the Tiber, and its water as a ribbon exactly between the walls (the
 * river surface's 4 m grid would saw its edges). GAME space; the heightmap carries the trench and
 * the banks (`canalProfile`, `canalBank`). Its water is the Aqua Virgo's: clear and dark, not
 * the Tiber's silt (`clear` per vertex).
 */
import * as THREE from 'three';
import { MeshBuilder } from '../../gfx/MeshBuilder';
import { WORLD_SCALE } from '../coords';
import { CANAL } from '../terrain/heightmap';
import { footOn, nearSegments } from '../terrain/riverbanks';
import type { WaterBody } from './bodies';
import type { WaterSurfaceData } from './surfaceMesh';

export interface CanalBuild {
  builder: MeshBuilder;
  /** The water between the walls (same layout as the river surface, to be merged with it). */
  ribbon: WaterSurfaceData;
  /** Chainage range (game m) actually built (the outfall end yields to the river). */
  s0: number;
  s1: number;
}

/** Width (game m) of the paved strip along the back of each wall. */
const PAVE = 1.3;

/** Real metres beyond a river's half width where its beach begins (heightmap `canalYields`). */
const YIELD = 16;

/** True when (x, z) lies within a river's channel or beach (GAME m). Pure. */
export function inRiverZone(rivers: readonly WaterBody[], x: number, z: number, S = WORLD_SCALE): boolean {
  for (const r of rivers) {
    if (r.kind === 'canal') continue;
    const segs = nearSegments(r.index, x, z);
    if (!segs) continue;
    const f = footOn(r.line, x, z, segs);
    const w0 = r.width[f.i], w1 = r.width[f.i + 1] ?? w0;
    if (f.d < (w0 + (w1 - w0) * f.t) / 2 + YIELD * S) return true;
  }
  return false;
}

interface Station {
  x: number;
  z: number;
  tx: number;
  tz: number;
  half: number;
}

function stationAt(body: WaterBody, s: number): Station {
  const { pts, cum } = body.line;
  let i = 0;
  while (i < pts.length - 2 && cum[i + 1] < s) i++;
  const L = cum[i + 1] - cum[i] || 1;
  const t = Math.min(1, Math.max(0, (s - cum[i]) / L));
  const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1];
  const l = Math.hypot(dx, dz) || 1;
  const w0 = body.width[i], w1 = body.width[i + 1] ?? w0;
  return { x: pts[i][0] + dx * t, z: pts[i][1] + dz * t, tx: dx / l, tz: dz / l, half: (w0 + (w1 - w0) * t) / 2 };
}

export function buildCanal(body: WaterBody, rivers: readonly WaterBody[], S = WORLD_SCALE): CanalBuild {
  const b = new MeshBuilder();
  const level = body.level;
  const yBed = level - CANAL.depth * S - 0.3;
  const kerb = level + CANAL.kerb * S;
  const wallT = CANAL.wall * S;
  const total = body.line.cum[body.line.cum.length - 1];
  const step = 4;
  const n = Math.max(1, Math.ceil(total / step));
  const ds = total / n;
  // Build only up to where the canal reaches the river's beach (from either end).
  const keep: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const st = stationAt(body, (i + 0.5) * ds);
    keep.push(!inRiverZone(rivers, st.x, st.z, S));
  }
  let i0 = 0, i1 = n - 1;
  while (i0 < n && !keep[i0]) i0++;
  while (i1 >= 0 && !keep[i1]) i1--;
  const pos: number[] = [];
  const flow: number[] = [];
  const idx: number[] = [];
  if (i0 > i1) return { builder: b, ribbon: { positions: new Float32Array(0), flow: new Float32Array(0), index: new Uint32Array(0), cells: {} }, s0: 0, s1: 0 };
  const yAxis = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  const one = new THREE.Vector3(1, 1, 1);
  const box = (mat: 'tufa' | 'travertine' | 'paving_travertine', cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, tx: number, tz: number, collide: boolean) => {
    q.setFromAxisAngle(yAxis, Math.atan2(-tz, tx));
    m.compose(new THREE.Vector3(cx, cy, cz), q, one);
    b.box(mat, sx, sy, sz, m.clone(), { collide, castShadow: true });
  };
  const cop = 0.22;
  for (let i = i0; i <= i1; i++) {
    const sa = i * ds, sb = sa + ds;
    const a = stationAt(body, sa), c = stationAt(body, sb);
    const tx = c.x - a.x, tz = c.z - a.z;
    const L = Math.hypot(tx, tz) || 1;
    const ux = tx / L, uz = tz / L;
    const nx = uz, nz = -ux;
    const half = (a.half + c.half) / 2;
    const mx = (a.x + c.x) / 2, mz = (a.z + c.z) / 2;
    for (const sd of [-1, 1]) {
      const o = half + wallT / 2;
      // Overlap the pieces a little so bends stay closed.
      box('tufa', mx + nx * sd * o, (yBed + kerb - cop) / 2, mz + nz * sd * o, L + 0.25, kerb - cop - yBed, wallT, ux, uz, true);
      box('travertine', mx + nx * sd * (o - 0.05), kerb - cop / 2, mz + nz * sd * (o - 0.05), L + 0.3, cop, wallT + 0.1, ux, uz, false);
      // A paved strip behind the coping, over the coarse terrain's dip at the wall's back.
      const po = half + wallT + PAVE / 2;
      box('paving_travertine', mx + nx * sd * po, kerb + 0.03 - 0.6, mz + nz * sd * po, L + 0.3, 1.2, PAVE, ux, uz, false);
    }
  }
  // Ends: a wall across the channel where the canal stops on land, a sill where it spills.
  const endPiece = (s: number, dir: number, spill: boolean) => {
    const st = stationAt(body, s);
    const span = 2 * (st.half + wallT + (spill ? 0 : PAVE));
    const cx = st.x + st.tx * dir * (wallT / 2), cz = st.z + st.tz * dir * (wallT / 2);
    const nx = st.tz, nz = -st.tx;
    // A box "along" the channel's normal: its long side spans the channel.
    if (spill) {
      box('travertine', cx, (yBed + level - 0.04) / 2, cz, span, level - 0.04 - yBed, wallT, nx, nz, true);
    } else {
      box('tufa', cx, (yBed + kerb - cop) / 2, cz, span, kerb - cop - yBed, wallT, nx, nz, true);
      box('travertine', cx, kerb - cop / 2, cz, span + 0.1, cop, wallT + 0.1, nx, nz, false);
    }
  };
  endPiece(i0 * ds, -1, i0 > 0);
  endPiece((i1 + 1) * ds, 1, i1 < n - 1);
  // The water: a strip between the walls' inner faces, mitred at the joints.
  const speed = body.speed * 0.6;
  for (let i = i0; i <= i1 + 1; i++) {
    const st = stationAt(body, i * ds);
    // Averaged tangent at the joint.
    const pa = stationAt(body, Math.max(0, i * ds - 0.5)), pb = stationAt(body, Math.min(total, i * ds + 0.5));
    let tx = pb.x - pa.x, tz = pb.z - pa.z;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    const nx = tz, nz = -tx;
    const h = st.half + 0.05;
    pos.push(st.x + nx * h, level, st.z + nz * h, st.x - nx * h, level, st.z - nz * h);
    flow.push(tx * speed, tz * speed, tx * speed, tz * speed);
    if (i > i0) {
      const v = pos.length / 3 - 4;
      idx.push(v, v + 3, v + 2, v, v + 1, v + 3); // facing up
    }
  }
  return {
    builder: b,
    ribbon: { positions: new Float32Array(pos), flow: new Float32Array(flow), index: new Uint32Array(idx), cells: { [body.id]: i1 - i0 + 1 }, clear: new Float32Array(pos.length / 3).fill(1) },
    s0: i0 * ds,
    s1: (i1 + 1) * ds,
  };
}

/** Concatenate surface meshes (the river grid and the canal ribbons) into one. Pure. */
export function mergeSurfaces(parts: readonly WaterSurfaceData[]): WaterSurfaceData {
  let nv = 0, ni = 0;
  for (const p of parts) {
    nv += p.positions.length / 3;
    ni += p.index.length;
  }
  const positions = new Float32Array(nv * 3);
  const flow = new Float32Array(nv * 2);
  const clear = new Float32Array(nv);
  const index = new Uint32Array(ni);
  const cells: Record<string, number> = {};
  let v = 0, k = 0;
  for (const p of parts) {
    positions.set(p.positions, v * 3);
    flow.set(p.flow, v * 2);
    if (p.clear) clear.set(p.clear, v);
    for (let j = 0; j < p.index.length; j++) index[k + j] = p.index[j] + v;
    v += p.positions.length / 3;
    k += p.index.length;
    Object.assign(cells, p.cells);
  }
  return { positions, flow, index, cells, clear };
}
