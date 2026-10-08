/**
 * Geometry audit (dev tool, `?audit=1`): finds the ground defects that read as "inconsistent
 * textures", "stairs to nowhere" and "floating objects", and names what built them.
 *
 * With `?audit` every MeshBuilder.build() keeps a compact copy of its horizontal-ish faces (and the
 * base points of the props placed into it), tagged with the build's name and, inside city cells,
 * the street item that made them (`auditSource`). `analyzeArea()` then rasterises everything near
 * a point onto a 0.5 m grid, together with the terrain height, and looks for:
 *
 *  - stacked:  two surfaces of different materials within 10 cm of each other (patches, flicker);
 *  - through:  the terrain at or above a paved surface (grass/dirt/gravel showing through paving);
 *  - lip:      a paved surface standing > 25 cm above the terrain at its open edge (floating slab);
 *  - deadend:  a small raised area that climbs (a flight) and links to nothing at its top;
 *  - floating / buried props: a prop's base above / below the surface under it.
 *
 * `scripts/crawl.mjs` drives it across the city and writes the ranked report.
 */
import * as THREE from 'three';

export const AUDIT = typeof location !== 'undefined' && new URLSearchParams(location.search).has('audit');

let source = '';
/** Tag the geometry added while `fn` runs (audit only). */
export function withAuditSource<T>(tag: string, fn: () => T): T {
  if (!AUDIT) return fn();
  const prev = source;
  source = tag;
  try {
    return fn();
  } finally {
    source = prev;
  }
}
export function currentAuditSource(): string {
  return source;
}

interface FaceSet {
  mat: string;
  src: string;
  /** xyz × 3 per triangle, the group's local frame. */
  up: Float32Array;
  /** World-space copy and bounds (cached on first use; groups do not move after placement). */
  world?: Float32Array;
  box?: [number, number, number, number];
}
interface PropRec {
  kind: string;
  p: THREE.Vector3;
  src: string;
}
interface Record {
  name: string;
  group: THREE.Object3D | null;
  faces: FaceSet[];
  props: PropRec[];
}

const records = new Map<string, Record>();

/** Hung or wall-mounted props: no surface under them is expected. */
const HUNG = /torch|bracket|lamp|awning|sign|hang|shelf|garland|wreath|lantern|banner|sconce/;

/** Called by MeshBuilder.build (audit only). */
export function auditRecordBuild(name: string, group: THREE.Object3D, parts: { geometry: THREE.BufferGeometry; material: string }[], props: PropRec[]) {
  // Far stand-ins and coarse city levels overlap the near geometry: only the near level counts.
  if (/:far\b|:mid$|:low$|-far$/.test(name)) return;
  const bySet = new Map<string, number[]>();
  for (const { geometry: g, material } of parts) {
    const pos = g.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!pos) continue;
    const a = pos.array as Float32Array;
    const src = (g.userData.src as string) || '';
    const key = `${material}|${src}`;
    let out = bySet.get(key);
    if (!out) bySet.set(key, (out = []));
    for (let i = 0; i + 8 < a.length; i += 9) {
      const ux = a[i + 3] - a[i], uy = a[i + 4] - a[i + 1], uz = a[i + 5] - a[i + 2];
      const vx = a[i + 6] - a[i], vy = a[i + 7] - a[i + 1], vz = a[i + 8] - a[i + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz);
      if (l < 0.02 || ny / l < 0.85) continue; // walkable-flat (not bevels or banks), not tiny
      for (let k = 0; k < 9; k++) out.push(a[i + k]);
    }
  }
  const faces: FaceSet[] = [];
  for (const [key, arr] of bySet) {
    if (!arr.length) continue;
    const [mat, src] = key.split('|');
    faces.push({ mat, src, up: new Float32Array(arr) });
  }
  records.set(name, { name, group, faces, props: props.filter((p) => !HUNG.test(p.kind)) });
}

export function auditRecordCount() {
  return records.size;
}

// ---------------------------------------------------------------- analysis

interface Surf {
  y: number;
  mat: string;
  src: string;
}

/** Materials steps are made of (not roofs, awnings, tables, foliage). */
const STEPPY = /paving|cobbles|travertine|marble|tufa|peperino|concrete|brick|basalt|stone|rock/;

const PAVED = /paving|cobbles|gravel|basalt|travertine|mosaic|concrete|tufa|peperino|marble|sand|dirt|mud|terracotta|brick/;

export interface Finding {
  kind: 'stacked' | 'through' | 'lip' | 'deadend' | 'floating' | 'buried';
  key: string;
  cells: number;
  /** Worst depth (m): terrain above the surface (through), height (lip, floating). */
  depth?: number;
  at: [number, number, number];
}

export function analyzeArea(cx: number, cz: number, radius: number, heightAt: (x: number, z: number) => number): Finding[] {
  const C = 0.5;
  const n = Math.ceil((radius * 2) / C);
  const x0 = cx - radius, z0 = cz - radius;
  const cells: (Surf[] | undefined)[] = new Array(n * n);
  const m = new THREE.Matrix4();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const props: (PropRec & { w: THREE.Vector3 })[] = [];
  for (const r of records.values()) {
    m.copy(r.group?.matrixWorld ?? new THREE.Matrix4());
    for (const p of r.props) {
      const w = p.p.clone().applyMatrix4(m);
      if (Math.abs(w.x - cx) < radius - 2 && Math.abs(w.z - cz) < radius - 2) props.push({ ...p, src: p.src || r.name, w });
    }
    for (const f of r.faces) {
      if (!f.world) {
        const w = new Float32Array(f.up.length);
        let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
        for (let i = 0; i < w.length; i += 3) {
          a.set(f.up[i], f.up[i + 1], f.up[i + 2]).applyMatrix4(m);
          w[i] = a.x;
          w[i + 1] = a.y;
          w[i + 2] = a.z;
          bx0 = Math.min(bx0, a.x);
          bx1 = Math.max(bx1, a.x);
          bz0 = Math.min(bz0, a.z);
          bz1 = Math.max(bz1, a.z);
        }
        f.world = w;
        f.box = [bx0, bx1, bz0, bz1];
      }
      const [fx0, fx1, fz0, fz1] = f.box!;
      if (fx1 < x0 || fx0 > x0 + n * C || fz1 < z0 || fz0 > z0 + n * C) continue;
      const t = f.world;
      const src = f.src || r.name;
      for (let i = 0; i < t.length; i += 9) {
        a.set(t[i], t[i + 1], t[i + 2]);
        b.set(t[i + 3], t[i + 4], t[i + 5]);
        c.set(t[i + 6], t[i + 7], t[i + 8]);
        const minX = Math.min(a.x, b.x, c.x), maxX = Math.max(a.x, b.x, c.x);
        const minZ = Math.min(a.z, b.z, c.z), maxZ = Math.max(a.z, b.z, c.z);
        if (maxX < x0 || minX > x0 + n * C || maxZ < z0 || minZ > z0 + n * C) continue;
        const i0 = Math.max(0, Math.ceil((minX - x0) / C - 0.5)), i1 = Math.min(n - 1, Math.floor((maxX - x0) / C - 0.5));
        const j0 = Math.max(0, Math.ceil((minZ - z0) / C - 0.5)), j1 = Math.min(n - 1, Math.floor((maxZ - z0) / C - 0.5));
        const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
        if (Math.abs(d) < 1e-9) continue;
        for (let j = j0; j <= j1; j++) {
          const pz = z0 + (j + 0.5) * C;
          for (let ii = i0; ii <= i1; ii++) {
            const px = x0 + (ii + 0.5) * C;
            const l1 = ((b.z - c.z) * (px - c.x) + (c.x - b.x) * (pz - c.z)) / d;
            const l2 = ((c.z - a.z) * (px - c.x) + (a.x - c.x) * (pz - c.z)) / d;
            const l3 = 1 - l1 - l2;
            if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
            const y = l1 * a.y + l2 * b.y + l3 * c.y;
            const k = j * n + ii;
            (cells[k] ??= []).push({ y, mat: f.mat, src });
          }
        }
      }
    }
  }
  const tally = new Map<string, Finding>();
  const note = (kind: Finding['kind'], key: string, x: number, y: number, z: number, depth = 0) => {
    const k = `${kind}|${key}`;
    const e = tally.get(k);
    if (e) {
      e.cells++;
      if (depth > (e.depth ?? 0)) {
        e.depth = +depth.toFixed(2);
        e.at = [+x.toFixed(1), +y.toFixed(2), +z.toFixed(1)];
      }
    } else tally.set(k, { kind, key, cells: 1, depth: +depth.toFixed(2), at: [+x.toFixed(1), +y.toFixed(2), +z.toFixed(1)] });
  };
  const top = new Float32Array(n * n);
  const topMat: string[] = new Array(n * n);
  const terr = new Float32Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const px = x0 + (i + 0.5) * C, pz = z0 + (j + 0.5) * C;
      const ty = heightAt(px, pz);
      terr[k] = ty;
      const list = cells[k];
      if (!list?.length) {
        top[k] = ty;
        topMat[k] = 'terrain';
        continue;
      }
      list.sort((p, q) => q.y - p.y);
      // Ignore roofs and upper floors: the walkable top is the highest surface within 3 m of the
      // terrain (or the lowest one when everything stands higher, e.g. on a podium).
      const ground = list.filter((s) => s.y < ty + 3);
      const s0 = ground[0] ?? list[list.length - 1];
      top[k] = Math.max(s0.y, ty);
      topMat[k] = s0.y >= ty ? s0.mat : 'terrain';
      for (const s of ground) {
        if (s === s0) continue;
        if (s0.y - s.y > 0.1) break;
        if (s.mat !== s0.mat) note('stacked', `${s0.src}:${s0.mat} | ${s.src}:${s.mat}`, px, s0.y, pz);
      }
      if (PAVED.test(s0.mat) && s0.y - ty < 0.02 && s0.y - ty > -0.4) note('through', `${s0.src}:${s0.mat}`, px, s0.y, pz, ty - s0.y);
    }
  // Lips: a paved top standing well above the terrain right next to bare terrain.
  for (let j = 1; j < n - 1; j++)
    for (let i = 1; i < n - 1; i++) {
      const k = j * n + i;
      if (topMat[k] === 'terrain' || !PAVED.test(topMat[k])) continue;
      const h = top[k] - terr[k];
      if (h < 0.25 || h > 1.2) continue;
      for (const o of [k - 1, k + 1, k - n, k + n]) {
        if (topMat[o] === 'terrain' && top[k] - top[o] > 0.25) {
          const s = cells[k]![0];
          note('lip', `${s.src}:${s.mat}`, x0 + (i + 0.5) * C, top[k], z0 + (j + 0.5) * C, h);
          break;
        }
      }
    }
  // Dead-end flights: connected raised areas (≥ 0.3 m over the terrain, steps of ≤ 0.25 m) that
  // are small, climb by ≥ 0.3 m, and do not reach the edge of the analysed area.
  const comp = new Int32Array(n * n).fill(-1);
  let nc = 0;
  for (let k0 = 0; k0 < n * n; k0++) {
    if (comp[k0] >= 0 || topMat[k0] === 'terrain' || !STEPPY.test(topMat[k0]) || top[k0] - terr[k0] < 0.3 || top[k0] - terr[k0] > 2.5) continue;
    const stack = [k0];
    comp[k0] = nc;
    let area = 0, lo = Infinity, hi = -Infinity, edge = false, hiK = k0;
    const mats = new Map<string, number>();
    while (stack.length) {
      const k = stack.pop()!;
      area += C * C;
      lo = Math.min(lo, top[k]);
      if (top[k] > hi) {
        hi = top[k];
        hiK = k;
      }
      const s = cells[k]?.[0];
      if (s) mats.set(`${s.src}:${s.mat}`, (mats.get(`${s.src}:${s.mat}`) ?? 0) + 1);
      const i = k % n, j = (k / n) | 0;
      if (i === 0 || j === 0 || i === n - 1 || j === n - 1) edge = true;
      for (const o of [k - 1, k + 1, k - n, k + n]) {
        if (o < 0 || o >= n * n || comp[o] >= 0 || topMat[o] === 'terrain' || !STEPPY.test(topMat[o])) continue;
        if (Math.abs((o % n) - i) > 1) continue;
        if (top[o] - terr[o] < 0.3 || Math.abs(top[o] - top[k]) > 0.25) continue;
        comp[o] = nc;
        stack.push(o);
      }
      if (area > 40) edge = true; // big: a building floor or a terrace, not a stub
    }
    nc++;
    if (!edge && area <= 30 && hi - lo >= 0.3) {
      const key = [...mats.entries()].sort((p, q) => q[1] - p[1])[0]?.[0] ?? '?';
      const i = hiK % n, j = (hiK / n) | 0;
      const f: Finding = { kind: 'deadend', key, cells: Math.round(area / (C * C)), at: [+(x0 + (i + 0.5) * C).toFixed(1), +hi.toFixed(2), +(z0 + (j + 0.5) * C).toFixed(1)] };
      const k = `deadend|${key}|${f.at.join(',')}`;
      tally.set(k, f);
    }
  }
  // Props: base against the surface under it.
  for (const p of props) {
    const i = Math.floor((p.w.x - x0) / C), j = Math.floor((p.w.z - z0) / C);
    if (i < 0 || j < 0 || i >= n || j >= n) continue;
    const k = j * n + i;
    const below = (cells[k] ?? []).filter((s) => s.y <= p.w.y + 0.05).map((s) => s.y);
    const ground = Math.max(terr[k], ...below);
    const gap = p.w.y - ground;
    if (gap > 0.12) note('floating', `${p.src}:${p.kind}`, p.w.x, p.w.y, p.w.z, gap);
    else if (gap < -0.25 && terr[k] - p.w.y > 0.25) note('buried', `${p.src}:${p.kind}`, p.w.x, p.w.y, p.w.z);
  }
  return [...tally.values()];
}
