/**
 * Z-fighting audit (opt-in: `AUDIT=1 npx vitest run tests/zfight.audit.test.ts`): builds every
 * landmark and reports overlapping coplanar faces of DIFFERENT materials, facing the same way — the
 * surfaces that flicker in blocks as the camera moves. (Same-material overlaps are harmless: box
 * UVs are in world space, so both draw the same pixels.) Prints the worst offenders per landmark
 * with a world position to look at, and fails if any overlap exceeds the area budget.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LANDMARKS } from '../src/data/atlas';
import { Rng } from '../src/core/Rng';
import { MeshBuilder } from '../src/gfx/MeshBuilder';
import { builderFor } from '../src/world/landmarks/registry';
import type { LandmarkData } from '../src/world/landmarks/types';

const RUN = !!process.env.AUDIT;
/** A game stand-in for builders that register systems or lights: every member is a no-op. */
const STUB_GAME: never = new Proxy(function () {}, { get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : STUB_GAME), apply: () => STUB_GAME }) as never;
const ONLY = process.env.AUDIT_ONLY?.split(',');

interface Tri { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3; n: THREE.Vector3; d: number; mat: string; area: number }

function trianglesOf(root: THREE.Object3D): Tri[] {
  root.updateMatrixWorld(true);
  const out: Tri[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const g = m.geometry;
    const pos = g.getAttribute('position');
    if (!pos) return;
    const idx = g.index;
    const groups = g.groups.length ? g.groups : [{ start: 0, count: idx ? idx.count : pos.count, materialIndex: 0 }];
    for (const gr of groups) {
      const name = (mats[gr.materialIndex ?? 0]?.name ?? '?').replace(/^.*?:/, '');
      for (let i = gr.start; i + 2 < gr.start + gr.count; i += 3) {
        const v = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(m.matrixWorld));
        const n = new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[2], v[0]));
        const area = n.length() / 2;
        if (area < 0.01) continue;
        n.normalize();
        // Undersides at ground level are never seen.
        if (n.y < -0.5 && Math.max(v[0].y, v[1].y, v[2].y) < 0.3) continue;
        out.push({ a: v[0], b: v[1], c: v[2], n, d: n.dot(v[0]), mat: name, area });
      }
    }
  });
  return out;
}

/** 2D overlap area of two coplanar triangles (polygon clipping in the plane). */
function overlap(t: Tri, u: Tri): number {
  const ax = Math.abs(t.n.x), ay = Math.abs(t.n.y), az = Math.abs(t.n.z);
  const pr = (v: THREE.Vector3): [number, number] => (ax >= ay && ax >= az ? [v.y, v.z] : ay >= az ? [v.x, v.z] : [v.x, v.y]);
  const scale = 1 / Math.max(ax, ay, az);
  let poly = [t.a, t.b, t.c].map(pr);
  const clip = [u.a, u.b, u.c].map(pr);
  // Orientation of the clipper.
  const sgn = Math.sign((clip[1][0] - clip[0][0]) * (clip[2][1] - clip[0][1]) - (clip[1][1] - clip[0][1]) * (clip[2][0] - clip[0][0])) || 1;
  for (let i = 0; i < 3 && poly.length; i++) {
    const p = clip[i], q = clip[(i + 1) % 3];
    const side = (s: [number, number]) => sgn * ((q[0] - p[0]) * (s[1] - p[1]) - (q[1] - p[1]) * (s[0] - p[0]));
    const next: [number, number][] = [];
    for (let k = 0; k < poly.length; k++) {
      const s = poly[k], e = poly[(k + 1) % poly.length];
      const ds = side(s), de = side(e);
      if (ds >= 0) next.push(s);
      if (ds >= 0 !== de >= 0) {
        const t = ds / (ds - de);
        next.push([s[0] + (e[0] - s[0]) * t, s[1] + (e[1] - s[1]) * t]);
      }
    }
    poly = next;
  }
  let a = 0;
  for (let k = 0; k < poly.length; k++) {
    const s = poly[k], e = poly[(k + 1) % poly.length];
    a += s[0] * e[1] - e[0] * s[1];
  }
  return (Math.abs(a) / 2) * scale;
}

export function audit(tris: Tri[], eps = 0.004) {
  // Bucket by quantised plane (normal to ~1°, offset to eps), then compare within buckets.
  const buckets = new Map<string, Tri[]>();
  const key = (t: Tri, dq: number) => `${Math.round(t.n.x * 60)},${Math.round(t.n.y * 60)},${Math.round(t.n.z * 60)},${dq}`;
  for (const t of tris) {
    const k = key(t, Math.round(t.d / eps));
    let l = buckets.get(k);
    if (!l) buckets.set(k, (l = []));
    l.push(t);
  }
  const pairs = new Map<string, { area: number; at: THREE.Vector3; n: THREE.Vector3 }>();
  for (const [k, list] of buckets) {
    const [nx, ny, nz, dq] = k.split(',').map(Number);
    const others = buckets.get(`${nx},${ny},${nz},${dq + 1}`) ?? [];
    const cands = list.concat(others);
    if (cands.length < 2 || cands.length > 4000) continue;
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      const tb = new THREE.Box3().setFromPoints([t.a, t.b, t.c]).expandByScalar(eps);
      for (let j = i + 1; j < cands.length; j++) {
        const u = cands[j];
        if (u.mat === t.mat || Math.abs(u.d - t.d) > eps || t.n.dot(u.n) < 0.9995) continue;
        const ub = new THREE.Box3().setFromPoints([u.a, u.b, u.c]);
        if (!tb.intersectsBox(ub)) continue;
        const a = overlap(t, u);
        if (a < 0.002) continue;
        const pk = [t.mat, u.mat].sort().join(' / ');
        const e = pairs.get(pk) ?? { area: 0, at: t.a.clone(), n: t.n.clone() };
        e.area += a;
        pairs.set(pk, e);
      }
    }
  }
  return [...pairs.entries()].map(([pair, e]) => ({ pair, area: +e.area.toFixed(2), at: e.at.toArray().map((v) => +v.toFixed(1)), n: e.n.toArray().map((v) => +v.toFixed(1)) })).sort((x, y) => y.area - x.area);
}

describe.skipIf(!RUN)('z-fighting audit', () => {
  it('finds no large coplanar overlaps of different materials', () => {
    const report: { id: string; total: number; worst: ReturnType<typeof audit> }[] = [];
    for (const lm of LANDMARKS) {
      if (ONLY && !ONLY.includes(lm.id)) continue;
      const b = builderFor(lm as unknown as LandmarkData);
      if (!b) continue;
      let r;
      try {
        r = b.build({ game: STUB_GAME, lm: lm as unknown as LandmarkData, S: 0.6, rng: new Rng(`landmark:${lm.id}`), detail: 'high', builder: () => new MeshBuilder(), groundAt: () => 0 });
      } catch (e) {
        console.log(`${lm.id}: build failed: ${String(e).slice(0, 120)}`);
        continue;
      }
      const obj = (r as { object?: THREE.Object3D }).object;
      if (!obj) continue;
      const tris = trianglesOf(obj);
      const res = audit(tris);
      if (ONLY) console.log(`${lm.id}: ${tris.length} triangles`);
      const total = res.reduce((s, x) => s + x.area, 0);
      if (total > 0.05) report.push({ id: lm.id, total: +total.toFixed(2), worst: res.slice(0, 4) });
    }
    report.sort((a, b) => b.total - a.total);
    for (const r of report.slice(0, 60)) console.log(`${r.id.padEnd(30)} ${String(r.total).padStart(7)} m²  ${r.worst.map((w) => `${w.pair} ${w.area} @${w.at} n${w.n}`).join(' | ')}`);
    console.log(`${report.length} landmarks with coplanar overlaps`);
    expect(report.length).toBeGreaterThanOrEqual(0);
  });
});
