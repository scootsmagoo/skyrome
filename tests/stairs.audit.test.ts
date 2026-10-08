/**
 * Stair-clash audit (opt-in: `AUDIT=1 npx vitest run tests/stairs.audit.test.ts`; AUDIT_ONLY=ids,
 * AUDIT_PAIRS=1 to print each clash). Builds every landmark and finds flights of steps that run
 * into each other, the "jutting" stairs at a building's corner: every flight `stairs()` builds is
 * recorded (`recordFlights`), and two whose footprints overlap in plan while their heights overlap
 * are a clash. Steps that wrap round a corner (`wrappedSteps`) are one piece and never clash.
 * AUDIT_TREADS=1 looks at the geometry instead (upward step-shaped faces of two flights at an angle,
 * overlapping at different heights): it also finds hand-built steps, but cornices and copings too.
 * Prints world positions to look at (`tp x z` in the console).
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LANDMARKS } from '../src/data/atlas';
import { Rng } from '../src/core/Rng';
import { MeshBuilder } from '../src/gfx/MeshBuilder';
import { bearingToRotationY } from '../src/core/math';
import { toGame } from '../src/world/coords';
import { builderFor } from '../src/world/landmarks/registry';
import { recordFlights, type FlightRecord } from '../src/arch/common/stairs';
import type { LandmarkData } from '../src/world/landmarks/types';

const RUN = !!process.env.AUDIT;
const ONLY = process.env.AUDIT_ONLY?.split(',');
const STUB_GAME: never = new Proxy(function () {}, { get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : STUB_GAME), apply: () => STUB_GAME }) as never;

export interface Tread {
  /** Plan corners (x, z) of the triangle, its height, the long-axis angle (0..π), plan box. */
  pts: [number, number][];
  y: number;
  angle: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Upward-facing, tread-shaped triangles of an object (local frame). */
export function treadsOf(root: THREE.Object3D): Tread[] {
  root.updateMatrixWorld(true);
  const out: Tread[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh) return;
    const pos = m.geometry.getAttribute('position');
    if (!pos) return;
    const idx = m.geometry.index;
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i + 2 < n; i += 3) {
      a.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m.matrixWorld);
      b.fromBufferAttribute(pos, idx ? idx.getX(i + 1) : i + 1).applyMatrix4(m.matrixWorld);
      c.fromBufferAttribute(pos, idx ? idx.getX(i + 2) : i + 2).applyMatrix4(m.matrixWorld);
      if (Math.abs(a.y - b.y) > 0.01 || Math.abs(a.y - c.y) > 0.01) continue;
      const cross = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
      // Upward faces only (the plan cross is −n.y): box bottoms on the ground aren't treads.
      if (cross > -0.02) continue;
      const pts: [number, number][] = [[a.x, a.z], [b.x, b.z], [c.x, c.z]];
      // The long edge sets the axis; the tread's depth is the triangle's height over it.
      let best = 0;
      let ang = 0;
      for (let k = 0; k < 3; k++) {
        const p = pts[k];
        const q = pts[(k + 1) % 3];
        const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (len > best) {
          best = len;
          ang = Math.atan2(q[1] - p[1], q[0] - p[0]);
        }
      }
      const depth = Math.abs(cross) / best;
      // Box tops split on the diagonal: the long edge is the diagonal; use the edges instead.
      const edges = [0, 1, 2].map((k) => {
        const p = pts[k];
        const q = pts[(k + 1) % 3];
        return { len: Math.hypot(q[0] - p[0], q[1] - p[1]), ang: Math.atan2(q[1] - p[1], q[0] - p[0]) };
      }).sort((x, y) => x.len - y.len);
      const right = Math.abs(Math.cos(edges[0].ang - edges[1].ang)) < 0.05;
      const tLen = right ? edges[1].len : best;
      const tDepth = right ? edges[0].len : depth;
      const tAng = right ? edges[1].ang : ang;
      // A step is a long, narrow box top: round fans (tholoi, basins) and squarish plinths aren't.
      if (!right || tDepth < 0.18 || tDepth > 0.55 || tLen < 0.6 || tLen < 3 * tDepth) continue;
      out.push({
        pts,
        y: a.y,
        angle: ((tAng % Math.PI) + Math.PI) % Math.PI,
        minX: Math.min(a.x, b.x, c.x),
        maxX: Math.max(a.x, b.x, c.x),
        minZ: Math.min(a.z, b.z, c.z),
        maxZ: Math.max(a.z, b.z, c.z),
      });
    }
  });
  return out;
}

/** Plan overlap area of two convex polygons (clipping). */
function overlap2(p: [number, number][], q: [number, number][]): number {
  let poly = p.slice();
  const s = Math.sign((q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) - (q[1][1] - q[0][1]) * (q[2][0] - q[0][0])) || 1;
  for (let i = 0; i < q.length && poly.length; i++) {
    const A = q[i];
    const B = q[(i + 1) % q.length];
    const side = (v: [number, number]) => s * ((B[0] - A[0]) * (v[1] - A[1]) - (B[1] - A[1]) * (v[0] - A[0]));
    const next: [number, number][] = [];
    for (let k = 0; k < poly.length; k++) {
      const u = poly[k];
      const w = poly[(k + 1) % poly.length];
      const du = side(u);
      const dw = side(w);
      if (du >= 0) next.push(u);
      if (du >= 0 !== dw >= 0) {
        const t = du / (du - dw);
        next.push([u[0] + (w[0] - u[0]) * t, u[1] + (w[1] - u[1]) * t]);
      }
    }
    poly = next;
  }
  let ar = 0;
  for (let k = 0; k < poly.length; k++) ar += poly[k][0] * poly[(k + 1) % poly.length][1] - poly[(k + 1) % poly.length][0] * poly[k][1];
  return Math.abs(ar) / 2;
}

/** Clashing tread pairs: at an angle (> 20°), overlapping in plan, 5 cm–1.5 m apart in height. */
export function clashes(treads: Tread[]): { at: [number, number, number]; area: number; desc: string }[] {
  const cell = 1.5;
  const grid = new Map<string, number[]>();
  treads.forEach((t, i) => {
    for (let gx = Math.floor(t.minX / cell); gx <= Math.floor(t.maxX / cell); gx++) {
      for (let gz = Math.floor(t.minZ / cell); gz <= Math.floor(t.maxZ / cell); gz++) {
        const k = `${gx},${gz}`;
        let l = grid.get(k);
        if (!l) grid.set(k, (l = []));
        l.push(i);
      }
    }
  });
  const seen = new Set<string>();
  const out: { at: [number, number, number]; area: number; desc: string }[] = [];
  for (const list of grid.values()) {
    for (let x = 0; x < list.length; x++) {
      for (let y = x + 1; y < list.length; y++) {
        const i = list[x];
        const j = list[y];
        const key = i < j ? `${i},${j}` : `${j},${i}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const A = treads[i];
        const B = treads[j];
        const dy = Math.abs(A.y - B.y);
        if (dy < 0.05 || dy > 1.5) continue;
        let da = Math.abs(A.angle - B.angle);
        da = Math.min(da, Math.PI - da);
        if (da < 0.35) continue;
        if (A.maxX < B.minX || B.maxX < A.minX || A.maxZ < B.minZ || B.maxZ < A.minZ) continue;
        const ar = overlap2(A.pts, B.pts);
        if (ar < 0.02) continue;
        const hi = A.y > B.y ? A : B;
        const lo = hi === A ? B : A;
        const d = (t: Tread) => `y${t.y.toFixed(2)} a${Math.round((t.angle * 180) / Math.PI)} x${t.minX.toFixed(1)}..${t.maxX.toFixed(1)} z${t.minZ.toFixed(1)}..${t.maxZ.toFixed(1)}`;
        out.push({ at: [(hi.minX + hi.maxX) / 2, hi.y, (hi.minZ + hi.maxZ) / 2], area: ar, desc: `${d(hi)} / ${d(lo)}` });
      }
    }
  }
  return out;
}

/** Flights (as `stairs()` built them) running into each other: footprints overlapping in plan while their heights overlap. */
export function flightClashes(flights: FlightRecord[]): { at: [number, number, number]; area: number; desc: string }[] {
  const out: { at: [number, number, number]; area: number; desc: string }[] = [];
  for (let i = 0; i < flights.length; i++) {
    for (let j = i + 1; j < flights.length; j++) {
      const A = flights[i];
      const B = flights[j];
      if (A.builder !== B.builder) continue;
      const lo = Math.max(Math.min(A.y0, A.y1), Math.min(B.y0, B.y1));
      const hi = Math.min(Math.max(A.y0, A.y1), Math.max(B.y0, B.y1));
      if (hi - lo < 0.1) continue;
      const ar = overlap2(A.corners, B.corners);
      if (ar < 0.05) continue;
      const cx = (A.corners[0][0] + A.corners[1][0] + B.corners[0][0] + B.corners[1][0]) / 4;
      const cz = (A.corners[0][1] + A.corners[1][1] + B.corners[0][1] + B.corners[1][1]) / 4;
      const d = (f: FlightRecord) => `y${f.y0.toFixed(1)}..${f.y1.toFixed(1)} ${f.corners.map(([x, z]) => `${x.toFixed(1)},${z.toFixed(1)}`).join(' ')}`;
      out.push({ at: [cx, lo, cz], area: ar, desc: `${d(A)} / ${d(B)}` });
    }
  }
  return out;
}

describe.skipIf(!RUN)('stair-clash audit', () => {
  it('lists flights of steps that run into each other', () => {
    const report: { id: string; area: number; spots: string[] }[] = [];
    for (const lm of LANDMARKS) {
      if (ONLY && !ONLY.includes(lm.id)) continue;
      const b = builderFor(lm as unknown as LandmarkData);
      if (!b) continue;
      let r;
      const flights: FlightRecord[] = [];
      recordFlights((f) => flights.push(f));
      try {
        r = b.build({ game: STUB_GAME, lm: lm as unknown as LandmarkData, S: 0.6, rng: new Rng(`landmark:${lm.id}`), detail: 'high', builder: () => new MeshBuilder(), groundAt: () => 0 });
      } catch {
        continue;
      } finally {
        recordFlights(null);
      }
      const obj = (r as { object?: THREE.Object3D }).object;
      if (!obj) continue;
      const found = process.env.AUDIT_TREADS ? clashes(treadsOf(obj)) : flightClashes(flights);
      if (!found.length) continue;
      const area = found.reduce((s, f) => s + f.area, 0);
      if (area < 0.1) continue;
      // Local → world (rotation.y = rotY about the atlas centre).
      const [gx, gz] = toGame(lm.center[0], lm.center[1]);
      const rot = bearingToRotationY(lm.rotation);
      const cs = Math.cos(rot);
      const sn = Math.sin(rot);
      const spots = new Map<string, number>();
      for (const f of found) {
        const wx = gx + f.at[0] * cs + f.at[2] * sn;
        const wz = gz - f.at[0] * sn + f.at[2] * cs;
        const k = `${Math.round(wx / 3) * 3},${Math.round(wz / 3) * 3}`;
        spots.set(k, (spots.get(k) ?? 0) + f.area);
      }
      const top = [...spots.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4).map(([k, v]) => `${k} (${v.toFixed(1)} m²)`);
      report.push({ id: lm.id, area: +area.toFixed(2), spots: top });
      if (process.env.AUDIT_PAIRS) for (const f of found.sort((x, y) => y.area - x.area).slice(0, 14)) console.log(`  ${f.area.toFixed(2)}  ${f.desc}`);
    }
    report.sort((a, b) => b.area - a.area);
    for (const r of report) console.log(`${r.id.padEnd(30)} ${String(r.area).padStart(7)} m²  at ${r.spots.join(' | ')}`);
    console.log(`${report.length} landmarks with clashing flights`);
    expect(report.length).toBeGreaterThanOrEqual(0);
  });
});
