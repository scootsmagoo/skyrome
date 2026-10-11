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
 *  - ledge:    a 3-12 cm step between two neighbouring walkable surfaces (a lip to trip on and a seam to
 *              see; kerbs and stairs are taller, ride-over rises shorter);
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
  /** Steep faces (walls, risers, podium sides; |ny| < 0.5), for the structure-foot audit (analyzeFeet). */
  steep: FaceSet[];
  props: PropRec[];
  /** What it belongs to (see `recOwner`), cached once known. */
  owner?: string;
}

/**
 * Records by a unique key. The city names every unit of a block level the same (`city:<block>:full`
 * for the yard, each lot, the back insulae, the walls …), so keying by name alone kept only the last
 * unit of a block: the buildings were invisible to the crawl. `keyOf` remembers the latest key per
 * name for the instanced-template lookup.
 */
const records = new Map<string, Record>();
const keyOf = new Map<string, string>();
let seq = 0;

/** Hung or wall-mounted props: no surface under them is expected. */
const HUNG = /torch|bracket|oil_lamp|awning|sign|hang|shelf|garland|wreath|lantern|banner|sconce/;

/** Steep faces more than this far above the builder's ground are upper storeys: not recorded (memory). */
const STEEP_KEEP_ABOVE_GROUND = 6;

/**
 * Called by MeshBuilder.build (audit only). `ground` is the builder's own ground function (the
 * terrain in the build's local frame, set for landmarks), used only to drop upper-storey walls.
 */
export function auditRecordBuild(name: string, group: THREE.Object3D, parts: { geometry: THREE.BufferGeometry; material: string }[], props: PropRec[], ground: ((x: number, z: number) => number) | null = null) {
  // Far stand-ins and coarse city levels overlap the near geometry: only the near level counts.
  if (/:far\b|:mid$|:low$|-far$/.test(name)) return;
  const bySet = new Map<string, number[]>();
  const steepBySet = new Map<string, number[]>();
  for (const { geometry: g, material } of parts) {
    const pos = g.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!pos) continue;
    const a = pos.array as Float32Array;
    const src = (g.userData.src as string) || '';
    const key = `${material}|${src}`;
    let out = bySet.get(key);
    if (!out) bySet.set(key, (out = []));
    let outS = steepBySet.get(key);
    if (!outS) steepBySet.set(key, (outS = []));
    for (let i = 0; i + 8 < a.length; i += 9) {
      const ux = a[i + 3] - a[i], uy = a[i + 4] - a[i + 1], uz = a[i + 5] - a[i + 2];
      const vx = a[i + 6] - a[i], vy = a[i + 7] - a[i + 1], vz = a[i + 8] - a[i + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz);
      if (l < 0.02) continue; // tiny
      const up = ny / l;
      if (up >= 0.85) {
        // walkable-flat (not bevels or banks)
        for (let k = 0; k < 9; k++) out.push(a[i + k]);
      } else if (Math.abs(up) < 0.5) {
        // a wall, a riser, the side of a podium or a slab
        if (ground) {
          const minY = Math.min(a[i + 1], a[i + 4], a[i + 7]);
          const g0 = ground((a[i] + a[i + 3] + a[i + 6]) / 3, (a[i + 2] + a[i + 5] + a[i + 8]) / 3);
          if (minY > g0 + STEEP_KEEP_ABOVE_GROUND) continue;
        }
        for (let k = 0; k < 9; k++) outS.push(a[i + k]);
      }
    }
  }
  const faces: FaceSet[] = [];
  for (const [key, arr] of bySet) {
    if (!arr.length) continue;
    const [mat, src] = key.split('|');
    faces.push({ mat, src, up: new Float32Array(arr) });
  }
  const steep: FaceSet[] = [];
  for (const [key, arr] of steepBySet) {
    if (!arr.length) continue;
    const [mat, src] = key.split('|');
    steep.push({ mat, src, up: new Float32Array(arr) });
  }
  const key = `${name}#${++seq}`;
  keyOf.set(name, key);
  records.set(key, { name, group, faces, steep, props: props.filter((p) => !HUNG.test(p.kind)) });
}

/**
 * Drop the records of every build whose name starts with `match` (or passes it, as a predicate): a
 * sweep moving on frees the memory of the blocks it has measured. Returns how many.
 */
export function auditForget(match: string | ((name: string) => boolean)): number {
  let n = 0;
  const test = typeof match === 'string' ? (name: string) => name.startsWith(match) : match;
  for (const [k, r] of records) {
    if (!test(r.name)) continue;
    records.delete(k);
    if (keyOf.get(r.name) === k) keyOf.delete(r.name);
    n++;
  }
  return n;
}

/** The recorded faces (up and steep) whose XZ footprint passes within r of (x, z): for debugging a finding from the console. */
export function auditFacesNear(x: number, z: number, r = 0.5, max = 200): { name: string; mat: string; src: string; steep: boolean; minY: number; maxY: number; tri: number[] }[] {
  const out: { name: string; mat: string; src: string; steep: boolean; minY: number; maxY: number; tri: number[] }[] = [];
  const m = new THREE.Matrix4();
  for (const rec of records.values()) {
    m.copy(rec.group?.matrixWorld ?? new THREE.Matrix4());
    for (const [steep, list] of [[false, rec.faces], [true, rec.steep]] as [boolean, FaceSet[]][]) {
      for (const f of list) {
        worldOf(f, m);
        const [fx0, fx1, fz0, fz1] = f.box!;
        if (x < fx0 - r || x > fx1 + r || z < fz0 - r || z > fz1 + r) continue;
        const t = f.world!;
        for (let i = 0; i < t.length && out.length < max; i += 9) {
          if (triDistXZ(t, i, x, z) > r) continue;
          out.push({ name: rec.name, mat: f.mat, src: f.src, steep, minY: +Math.min(t[i + 1], t[i + 4], t[i + 7]).toFixed(3), maxY: +Math.max(t[i + 1], t[i + 4], t[i + 7]).toFixed(3), tri: [...t.subarray(i, i + 9)].map((v) => +v.toFixed(2)) });
        }
      }
    }
  }
  return out.sort((p, q) => p.minY - q.minY);
}

/** Record names with their counts of faces (debug). */
export function auditRecordNames(): { name: string; up: number; steep: number; props: number }[] {
  const out: { name: string; up: number; steep: number; props: number }[] = [];
  for (const r of records.values()) out.push({ name: r.name, up: r.faces.reduce((s, f) => s + f.up.length / 9, 0), steep: r.steep.reduce((s, f) => s + f.up.length / 9, 0), props: r.props.length });
  return out;
}

/**
 * An instanced build (a part drawn many times, palcirc `instanced`): its faces and props were
 * recorded in the template's own frame, so they are replaced by one copy per instance matrix
 * (the landmark's local frame) and hang from `group`, which the landmark adds to its own.
 */
export function auditInstanced(name: string, group: THREE.Object3D, matrices: readonly THREE.Matrix4[]) {
  const key = keyOf.get(name);
  const r = key ? records.get(key) : undefined;
  if (!r || !key) return;
  const v = new THREE.Vector3();
  const props: PropRec[] = [];
  for (const mm of matrices) {
    for (const p of r.props) props.push({ ...p, p: p.p.clone().applyMatrix4(mm) });
  }
  const copy = (list: FaceSet[]) =>
    list.map((f) => {
      const up = new Float32Array(f.up.length * matrices.length);
      matrices.forEach((mm, k) => {
        for (let i = 0; i < f.up.length; i += 3) {
          v.set(f.up[i], f.up[i + 1], f.up[i + 2]).applyMatrix4(mm);
          up.set([v.x, v.y, v.z], k * f.up.length + i);
        }
      });
      return { mat: f.mat, src: f.src, up } as FaceSet;
    });
  records.set(key, { name, group, faces: copy(r.faces), steep: copy(r.steep), props });
}

export function auditRecordCount() {
  return records.size;
}

/**
 * Every recorded build's walkable-flat faces in world space, with its name, material and source
 * (the street-fit audit, streetFit.ts, reads the landmarks' paving and floors through this).
 * `skip` leaves out builds by name (the city's own, which that audit rebuilds itself).
 */
export function auditFaceSets(skip?: RegExp): { name: string; mat: string; src: string; world: Float32Array; box: [number, number, number, number] }[] {
  const out: { name: string; mat: string; src: string; world: Float32Array; box: [number, number, number, number] }[] = [];
  const m = new THREE.Matrix4();
  for (const r of records.values()) {
    if (skip?.test(r.name)) continue;
    m.copy(r.group?.matrixWorld ?? new THREE.Matrix4());
    for (const f of r.faces) {
      worldOf(f, m);
      out.push({ name: r.name, mat: f.mat, src: f.src || r.name, world: f.world!, box: f.box! });
    }
  }
  return out;
}

/** Every recorded prop base in world space (see auditFaceSets). */
export function auditPropBases(skip?: RegExp): { name: string; kind: string; src: string; x: number; y: number; z: number }[] {
  const out: { name: string; kind: string; src: string; x: number; y: number; z: number }[] = [];
  const m = new THREE.Matrix4();
  const w = new THREE.Vector3();
  for (const r of records.values()) {
    if (skip?.test(r.name)) continue;
    m.copy(r.group?.matrixWorld ?? new THREE.Matrix4());
    for (const p of r.props) {
      w.copy(p.p).applyMatrix4(m);
      out.push({ name: r.name, kind: p.kind, src: p.src || r.name, x: w.x, y: w.y, z: w.z });
    }
  }
  return out;
}

// ---------------------------------------------------------------- analysis

interface Surf {
  y: number;
  mat: string;
  src: string;
}

/** Materials steps are made of (not roofs, awnings, tables, foliage). */
const STEPPY = /paving|cobbles|travertine|marble|tufa|peperino|concrete|brick|basalt|stone|rock/;

/** Ledge band (m): shorter rises are ridden over, taller ones are kerbs and stairs. */
const LEDGE_MIN = 0.03;
const LEDGE_MAX = 0.12;

const PAVED = /paving|cobbles|gravel|basalt|travertine|mosaic|concrete|tufa|peperino|marble|sand|dirt|mud|terracotta|brick/;

export interface Finding {
  kind: 'stacked' | 'through' | 'lip' | 'ledge' | 'deadend' | 'floating' | 'buried';
  key: string;
  cells: number;
  /** Worst depth (m): terrain above the surface (through), height (lip, floating). */
  depth?: number;
  at: [number, number, number];
}

/** The world-space copy of a face set (cached; groups do not move after placement), transformed by `m` on first use. */
function worldOf(f: FaceSet, m: THREE.Matrix4) {
  if (f.world) return;
  const a = new THREE.Vector3();
  // City units are built in the world frame (identity group): no copy.
  const e = m.elements;
  const identity = e[0] === 1 && e[5] === 1 && e[10] === 1 && e[12] === 0 && e[13] === 0 && e[14] === 0 && e[1] === 0 && e[2] === 0 && e[4] === 0 && e[6] === 0 && e[8] === 0 && e[9] === 0;
  const w = identity ? f.up : new Float32Array(f.up.length);
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

/**
 * Every walkable-flat surface (up-facing triangle) over the point (x, z): its height, material and
 * the build that made it, highest first. For debugging a floating or buried prop from the console
 * (`__audit.surfacesAt(x, z)`) and for the prop check below, which is exact at the prop's base.
 */
export function surfacesAt(x: number, z: number): { y: number; mat: string; src: string }[] {
  const out: { y: number; mat: string; src: string }[] = [];
  const m = new THREE.Matrix4();
  for (const r of records.values()) {
    m.copy(r.group?.matrixWorld ?? new THREE.Matrix4());
    for (const f of r.faces) {
      worldOf(f, m);
      const [fx0, fx1, fz0, fz1] = f.box!;
      if (x < fx0 || x > fx1 || z < fz0 || z > fz1) continue;
      const t = f.world!;
      for (let i = 0; i < t.length; i += 9) {
        const d = (t[i + 5] - t[i + 8]) * (t[i] - t[i + 6]) + (t[i + 6] - t[i + 3]) * (t[i + 2] - t[i + 8]);
        if (Math.abs(d) < 1e-9) continue;
        const l1 = ((t[i + 5] - t[i + 8]) * (x - t[i + 6]) + (t[i + 6] - t[i + 3]) * (z - t[i + 8])) / d;
        const l2 = ((t[i + 8] - t[i + 2]) * (x - t[i + 6]) + (t[i] - t[i + 6]) * (z - t[i + 8])) / d;
        const l3 = 1 - l1 - l2;
        if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
        out.push({ y: l1 * t[i + 1] + l2 * t[i + 4] + l3 * t[i + 7], mat: f.mat, src: f.src || r.name });
      }
    }
  }
  return out.sort((p, q) => q.y - p.y);
}

export interface SurfaceGrid {
  n: number;
  x0: number;
  z0: number;
  cell: number;
  /** Top walkable material per cell ('terrain' where nothing built covers the ground). */
  mat: string[];
  /** The build (or street item) that made the top surface, '' on terrain. */
  src: string[];
  /** Top surface height and the terrain height per cell. */
  y: Float32Array;
  terr: Float32Array;
}

/**
 * The walkable top surface on a `cell` m grid round (cx, cz): which material covers the ground
 * and who built it (the surface-look census in scripts/audit/surface.mjs reads material regions,
 * their seams and the terrain showing between them from it). Same rasterisation as analyzeArea
 * (roofs and upper floors ignored: the walkable top is the highest surface within 3 m of the
 * terrain), but one pass and the top only.
 */
export function topSurfaceGrid(cx: number, cz: number, radius: number, heightAt: (x: number, z: number) => number, cell = 1): SurfaceGrid {
  const C = cell;
  const n = Math.ceil((radius * 2) / C);
  const x0 = cx - radius, z0 = cz - radius;
  const cells: (Surf[] | undefined)[] = new Array(n * n);
  const m = new THREE.Matrix4();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (const r of records.values()) {
    m.copy(r.group?.matrixWorld ?? new THREE.Matrix4());
    for (const f of r.faces) {
      worldOf(f, m);
      const [fx0, fx1, fz0, fz1] = f.box!;
      if (fx1 < x0 || fx0 > x0 + n * C || fz1 < z0 || fz0 > z0 + n * C) continue;
      const t = f.world!;
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
            const k = j * n + ii;
            (cells[k] ??= []).push({ y: l1 * a.y + l2 * b.y + l3 * c.y, mat: f.mat, src });
          }
        }
      }
    }
  }
  const mat: string[] = new Array(n * n);
  const src: string[] = new Array(n * n);
  const y = new Float32Array(n * n);
  const terr = new Float32Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const ty = heightAt(x0 + (i + 0.5) * C, z0 + (j + 0.5) * C);
      terr[k] = ty;
      const list = cells[k];
      if (!list?.length) {
        y[k] = ty;
        mat[k] = 'terrain';
        src[k] = '';
        continue;
      }
      list.sort((p, q) => q.y - p.y);
      const ground = list.filter((s) => s.y < ty + 3);
      const s0 = ground[0] ?? list[list.length - 1];
      y[k] = Math.max(s0.y, ty);
      mat[k] = s0.y >= ty - 0.02 ? s0.mat : 'terrain';
      src[k] = s0.y >= ty - 0.02 ? s0.src : '';
    }
  return { n, x0, z0, cell: C, mat, src, y, terr };
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
      worldOf(f, m);
      const [fx0, fx1, fz0, fz1] = f.box!;
      if (fx1 < x0 || fx0 > x0 + n * C || fz1 < z0 || fz0 > z0 + n * C) continue;
      const t = f.world!;
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
  // Ledges: a few centimetres between neighbouring walkable tops (mismatched lifts and datums).
  for (let j = 0; j < n - 1; j++)
    for (let i = 0; i < n - 1; i++) {
      const k = j * n + i;
      for (const o of [k + 1, k + n]) {
        // Compare heights above the terrain, so a surface following a slope is not a ledge.
        const hk = top[k] - terr[k], ho = top[o] - terr[o];
        const d = Math.abs(hk - ho);
        if (d < LEDGE_MIN || d >= LEDGE_MAX) continue;
        // A ramp is not a ledge: the surface keeps climbing the same way on both sides of the pair
        // (an apron, a dropped kerb). A ledge is a step with level ground (or no ground) beyond it.
        const dir = o - k, p = k - dir, q = o + dir;
        if (p >= 0 && q < n * n && (dir !== 1 || (Math.floor(p / n) === Math.floor(k / n) && Math.floor(q / n) === Math.floor(o / n)))) {
          const up = ho > hk ? 1 : -1;
          const rp = (hk - (top[p] - terr[p])) * up, rq = ((top[q] - terr[q]) - ho) * up;
          if (rp >= d * 0.6 && rq >= d * 0.6 && rp < LEDGE_MAX * 1.5 && rq < LEDGE_MAX * 1.5) continue;
        }
        const ak = topMat[k] === 'terrain', bk = topMat[o] === 'terrain';
        if ((!ak && !PAVED.test(topMat[k])) || (!bk && !PAVED.test(topMat[o])) || (ak && bk)) continue;
        const sa = ak ? 'terrain' : `${cells[k]![0].src}:${topMat[k]}`, sb = bk ? 'terrain' : `${cells[o]![0].src}:${topMat[o]}`;
        if (sa === sb) continue;
        note('ledge', [sa, sb].sort().join(' | '), x0 + (i + 0.5) * C, Math.max(top[k], top[o]), z0 + (j + 0.5) * C, d);
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
  // Props: base against the surface under it, exact at the base point (not at the cell centre: a
  // prop on the edge of a plaza or a kerb is judged by what lies under it).
  for (const p of props) {
    if (p.w.x < x0 || p.w.z < z0 || p.w.x > x0 + n * C || p.w.z > z0 + n * C) continue;
    const terrain = heightAt(p.w.x, p.w.z);
    const here = surfacesAt(p.w.x, p.w.z);
    // (a prop a hand's breadth into its support, a basket sunk into a crate's top, still stands on it)
    const below = here.filter((s) => s.y <= p.w.y + 0.15).map((s) => s.y);
    const ground = Math.max(terrain, ...below);
    const gap = p.w.y - ground;
    // A prop resting on another (a basket on a crate, a sack on a pile) has a round or tilted top under
    // it, which the flat-face surfaces above do not record: another base close under it is its support.
    const onProp = () => props.some((q) => q !== p && Math.hypot(q.w.x - p.w.x, q.w.z - p.w.z) < 0.8 && q.w.y < p.w.y && q.w.y > p.w.y - 1.2);
    if (gap > 0.12 && !onProp()) note('floating', `${p.src}:${p.kind}`, p.w.x, p.w.y, p.w.z, gap);
    else if (gap < -0.25 && terrain - p.w.y > 0.25 && terrain - p.w.y < 2) {
      // (More than 2 m under the terrain is a dock below a quay or a pit, not a burial.)
      // Indoors (a floor under it and a ceiling or roof over it) the terrain is the building's
      // problem (hill showing through its walls), not the prop's.
      const floor = below.some((y) => Math.abs(y - p.w.y) < 0.15);
      const roofed = here.some((s) => s.y > p.w.y + 1.8 && s.y < p.w.y + 9);
      if (!(floor && roofed)) note('buried', `${p.src}:${p.kind}`, p.w.x, p.w.y, p.w.z, terrain - p.w.y);
    }
  }
  return [...tally.values()];
}

// ---------------------------------------------------------------- structure feet (phase 4 audit)

/**
 * How a structure meets the ground (phase 4 "solid ground", lens 1; `scripts/audit/structures.mjs`):
 *
 * - `floating`: a stretch of a structure's foot (the bottom edge of a wall, riser, podium side or
 *   slab side) hangs above the ground just outside it (the terrain, or the highest walkable surface
 *   up to 0.5 m over the edge): a void under the base, seen from outside. Spans are not feet: an edge
 *   with the same structure standing in the gap below it within reach (a lintel over its jambs, an
 *   entablature over its columns, an arch over its piers, a balcony or an eave over its wall) is an
 *   overhang; a void hidden behind something standing in front of it (a neighbour's wall, a socle,
 *   a step) is occluded.
 * - `buried-opening`: the ground outside stands above the floor just inside the wall where the wall
 *   is open (a doorway, a shop mouth, an arcade): the pavement or the slope cuts across the opening.
 *   The same behind a blank wall is a building cut into a slope (counted, not a defect).
 * - `terrain-in-floor`: the terrain as drawn pokes up through a floor, tread, podium top or slab of
 *   the structure (a base sunk deeper than its plinth hides). Ground-like materials (yards, paving,
 *   streets) are lens 2's and not counted here.
 */
export interface FootFinding {
  kind: 'floating' | 'buried-opening' | 'terrain-in-floor';
  /** The build (record name), what owns it (landmark id, block level, monument chunk), the street item that made it, the face's material. */
  name: string;
  owner: string;
  src: string;
  mat: string;
  /** Samples in this stretch, and its length (m; m² for terrain-in-floor). */
  n: number;
  length: number;
  /** Worst gap (m): foot above ground (floating), ground above the floor (buried), terrain above the floor (terrain-in-floor). */
  depth: number;
  /** The same against the terrain as drawn (the renderer drops it 9 cm under roads and pads). */
  depthVis: number;
  /** Worst sample (the foot edge point, or the floor point). */
  at: [number, number, number];
  /** At the worst sample: the ground outside (terrain or surface), the terrain, the floor inside (buried). */
  ground: number;
  terrain: number;
  groundMat: string;
  floor?: number;
  floorMat?: string;
  /** Outward horizontal normal of the foot at the worst sample (where a camera sees the void from). */
  out?: [number, number];
}

export interface FeetOptions {
  /** Sample spacing along the foot edges (m). Default 0.75. */
  step?: number;
  /** Water level at (x, z) or null: feet over water (quays, bridges) are not measured. */
  waterAt?: (x: number, z: number) => number | null;
  /** How much lower the renderer draws the terrain at (x, z) than the heightmap (m, ≥ 0). */
  visualDrop?: (x: number, z: number) => number;
  /** Floating when the foot is this far above the ground (m). Default 0.08. */
  floatMin?: number;
  /** Buried when the ground outside is this far above the floor inside (m). Default 0.2. */
  buryMin?: number;
  /** Terrain-in-floor when the drawn terrain is this far above a floor (m). Default 0.08. */
  sinkMin?: number;
  /** Which records' feet are measured, by build name and owner (default all in the area); the rest are ground and occluders only. */
  measure?: (name: string, owner: string) => boolean;
  /** Which face sets of a measured record are measured (by source tag and material). */
  measureFace?: (name: string, src: string, mat: string) => boolean;
  /** Records left out entirely (not ground, not occluders): e.g. the streamed copies of what the sweep builds itself. */
  ignore?: (name: string) => boolean;
  /** The terrain as drawn from afar (a coarse CDLOD level): grounded feet that float over it are tallied (`farFloat`). */
  farTerrain?: (x: number, z: number) => number;
  /**
   * Where feet are measured (default everywhere): e.g. only along a city building's outline, whose
   * walls the generators carry down to a foundation; rooms inside it (an atrium floor, a peristyle)
   * stand over the hollow the outer walls enclose.
   */
  footAt?: (x: number, z: number) => boolean;
}

export interface FeetTotals {
  /** Foot samples measured, bottom edges walked, records measured. */
  samples: number;
  edges: number;
  records: number;
  /** Samples by verdict. */
  floating: number;
  buriedOpening: number;
  /** The ground outside above the floor behind a blank wall (a building cut into a slope). */
  buriedWall: number;
  /** The ground outside over the top of a low structure (no wall above the 'opening'). */
  buriedTop: number;
  /** Feet on the terrain that float > 0.3 m over the terrain as drawn from afar (`farTerrain`). */
  farFloat: number;
  floorSamples: number;
  sunkFloor: number;
  skipped: { overhang: number; water: number; interior: number; continues: number; occluded: number; enclosed: number; inside: number };
}

/** Per owner (landmark, block level, monument chunk): what was measured and the worst. */
export interface FeetOwner {
  owner: string;
  samples: number;
  floating: number;
  maxFloat: number;
  buriedOpening: number;
  maxBuried: number;
  floorSamples: number;
  sunkFloor: number;
  maxSunk: number;
  farFloat: number;
  maxFar: number;
}

/** What a build belongs to: a landmark id (`basilica-ulpia:nave:…` → `basilica-ulpia`) or the city's block level / chunk / cell. */
export function auditOwnerOf(name: string): string {
  if (name.startsWith('city:') || name.startsWith('audit:')) return name.split(':').slice(0, 3).join(':');
  return name.split(':')[0];
}
const isCityName = (name: string) => name.startsWith('city:') || name.startsWith('audit:');

/**
 * What a record belongs to: the landmark whose object (`landmark:<id>`) holds its group (instanced
 * parts named after their kind, `colosseum-facade-0:L0`, belong to the Colosseum), else the name's
 * owner (`auditOwnerOf`). '' for a template: a landmark-side build whose group never joined the
 * scene (a LOD level or prop built once and instanced elsewhere; its faces lie at the origin).
 */
function recOwner(r: Record): string {
  if (r.owner !== undefined) return r.owner;
  if (isCityName(r.name)) return (r.owner = auditOwnerOf(r.name));
  let p = r.group?.parent ?? null;
  if (!p) return '';
  for (; p; p = p.parent) {
    const m = /^landmark:([^:]+)$/.exec(p.name);
    if (m) return (r.owner = m[1]);
  }
  return (r.owner = auditOwnerOf(r.name));
}

/**
 * The owners recorded (landmark ids, block levels, monument chunks …) with their face counts and
 * world XZ bounds: the sweep's list of what to measure and how far each reaches.
 */
export function auditOwners(match?: (name: string) => boolean): { owner: string; records: number; tris: number; box: [number, number, number, number] }[] {
  const out = new Map<string, { owner: string; records: number; tris: number; box: [number, number, number, number] }>();
  const m = new THREE.Matrix4();
  for (const r of records.values()) {
    if (match && !match(r.name)) continue;
    const o = recOwner(r);
    if (!o) continue;
    let e = out.get(o);
    if (!e) out.set(o, (e = { owner: o, records: 0, tris: 0, box: [Infinity, -Infinity, Infinity, -Infinity] }));
    e.records++;
    m.copy(r.group?.matrixWorld ?? new THREE.Matrix4());
    for (const f of [...r.faces, ...r.steep]) {
      worldOf(f, m);
      const b = f.box!;
      if (b[1] - b[0] > 400 || b[3] - b[2] > 400) continue;
      e.tris += f.up.length / 9;
      e.box[0] = Math.min(e.box[0], b[0]);
      e.box[1] = Math.max(e.box[1], b[1]);
      e.box[2] = Math.min(e.box[2], b[2]);
      e.box[3] = Math.max(e.box[3], b[3]);
    }
  }
  return [...out.values()].filter((e) => e.tris > 0);
}

/** Ground-like surfaces (yards, streets, paving, gardens): lens 2's, not a structure's floor. */
const GROUNDLIKE = /dirt|grass|gravel|sand|mud|cobbles|paving|water|soil|earth|moss|ivy|leaf|foliage|hedge|reed/;
/** What a structure's foot is made of (not shutters, doors, awnings, carts, statues, dark interiors, roofs). */
const FOOTMAT = /marble|porphyry|travertine|tufa|peperino|basalt|rock|brick|reticulatum|concrete|plaster|stucco|paving|cobbles/;
/** What a structure's floors are made of (wood only in big pieces: floors, not tables). */
const FLOORMAT = /marble|porphyry|travertine|tufa|peperino|basalt|brick|reticulatum|concrete|mosaic|terracotta|wood/;
/** What the ground under a foot can be (not table tops, awnings, carts, roofs, sills). */
const GROUNDMAT = /marble|porphyry|travertine|tufa|peperino|basalt|rock|brick|reticulatum|concrete|mosaic|terracotta|paving|cobbles|gravel|dirt|grass|sand|mud/;

interface TriRef {
  /** World-space triangle array and offset. */
  t: Float32Array;
  i: number;
  rec: Record;
  f: FaceSet;
}

/** XZ distance from (x, z) to a triangle's XZ projection (0 inside). */
function triDistXZ(t: Float32Array, i: number, x: number, z: number): number {
  const ax = t[i], az = t[i + 2], bx = t[i + 3], bz = t[i + 5], cx = t[i + 6], cz = t[i + 8];
  const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
  if (Math.abs(d) > 1e-9) {
    const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
    const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
    if (l1 >= 0 && l2 >= 0 && 1 - l1 - l2 >= 0) return 0;
  }
  const seg = (px: number, pz: number, qx: number, qz: number) => {
    const dx = qx - px, dz = qz - pz;
    const L2 = dx * dx + dz * dz;
    const u = L2 > 1e-12 ? Math.max(0, Math.min(1, ((x - px) * dx + (z - pz) * dz) / L2)) : 0;
    return Math.hypot(x - (px + dx * u), z - (pz + dz * u));
  };
  return Math.min(seg(ax, az, bx, bz), seg(bx, bz, cx, cz), seg(cx, cz, ax, az));
}

/** Möller–Trumbore: distance along the (unit) ray to the triangle, or Infinity. */
function rayTri(t: Float32Array, i: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): number {
  const e1x = t[i + 3] - t[i], e1y = t[i + 4] - t[i + 1], e1z = t[i + 5] - t[i + 2];
  const e2x = t[i + 6] - t[i], e2y = t[i + 7] - t[i + 1], e2z = t[i + 8] - t[i + 2];
  const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-10) return Infinity;
  const inv = 1 / det;
  const sx = ox - t[i], sy = oy - t[i + 1], sz = oz - t[i + 2];
  const u = (sx * px + sy * py + sz * pz) * inv;
  if (u < -1e-6 || u > 1 + 1e-6) return Infinity;
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < -1e-6 || u + v > 1 + 1e-6) return Infinity;
  const d = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return d >= 0 ? d : Infinity;
}

/**
 * Measures how the structures near (cx, cz) meet the ground (see `FootFinding`). Every record in
 * the square of half-size `radius` is ground and occluder; only those passing `opts.measure` are
 * measured. Returns stretches (samples of one build, source, material and kind within 2 m of one
 * another) ranked by depth, the totals, and the per-owner tally.
 */
export function analyzeFeet(cx: number, cz: number, radius: number, heightAt: (x: number, z: number) => number, opts: FeetOptions = {}): { findings: FootFinding[]; totals: FeetTotals; owners: FeetOwner[] } {
  const step = opts.step ?? 0.75;
  const floatMin = opts.floatMin ?? 0.08;
  const buryMin = opts.buryMin ?? 0.2;
  const sinkMin = opts.sinkMin ?? 0.08;
  const measure = opts.measure ?? (() => true);
  const measureFace = opts.measureFace ?? (() => true);
  const ignore = opts.ignore ?? (() => false);
  const drop = opts.visualDrop ?? (() => 0);
  const x0 = cx - radius, x1 = cx + radius, z0 = cz - radius, z1 = cz + radius;
  // Ground and occluders reach a little beyond the measured square.
  const gx0 = x0 - 3, gx1 = x1 + 3, gz0 = z0 - 3, gz1 = z1 + 3;
  const CELL = 1;
  const key = (gx: number, gz: number) => gx * 100003 + gz;
  const upHash = new Map<number, TriRef[]>();
  const steepHash = new Map<number, TriRef[]>();
  const steepRefs: TriRef[] = [];
  const floorRefs: TriRef[] = [];
  const m = new THREE.Matrix4();
  const insert = (hash: Map<number, TriRef[]>, ref: TriRef) => {
    const { t, i } = ref;
    const minX = Math.min(t[i], t[i + 3], t[i + 6]), maxX = Math.max(t[i], t[i + 3], t[i + 6]);
    const minZ = Math.min(t[i + 2], t[i + 5], t[i + 8]), maxZ = Math.max(t[i + 2], t[i + 5], t[i + 8]);
    if (maxX < gx0 || minX > gx1 || maxZ < gz0 || minZ > gz1) return false;
    if (maxX - minX > 400 || maxZ - minZ > 400) return false; // the apron or a sky dome: not a structure
    for (let gx = Math.floor(minX / CELL); gx <= Math.floor(maxX / CELL); gx++)
      for (let gz = Math.floor(minZ / CELL); gz <= Math.floor(maxZ / CELL); gz++) {
        const k = key(gx, gz);
        let list = hash.get(k);
        if (!list) hash.set(k, (list = []));
        list.push(ref);
      }
    return true;
  };
  let nRecords = 0;
  for (const r of records.values()) {
    if (/^interior/.test(r.name) || ignore(r.name)) continue;
    const owner = recOwner(r);
    if (!owner) continue;
    m.copy(r.group?.matrixWorld ?? new THREE.Matrix4());
    const meas = measure(r.name, owner);
    let touched = false;
    for (const f of r.faces) {
      worldOf(f, m);
      const [fx0, fx1, fz0, fz1] = f.box!;
      if (fx1 < gx0 || fx0 > gx1 || fz1 < gz0 || fz0 > gz1) continue;
      const t = f.world!;
      const floors = meas && FLOORMAT.test(f.mat) && !GROUNDLIKE.test(f.mat) && measureFace(r.name, f.src, f.mat);
      for (let i = 0; i < t.length; i += 9) {
        const ref = { t, i, rec: r, f };
        if (insert(upHash, ref) && floors) {
          floorRefs.push(ref);
          touched = true;
        }
      }
    }
    for (const f of r.steep) {
      worldOf(f, m);
      const [fx0, fx1, fz0, fz1] = f.box!;
      if (fx1 < gx0 || fx0 > gx1 || fz1 < gz0 || fz0 > gz1) continue;
      const t = f.world!;
      const feet = meas && FOOTMAT.test(f.mat) && measureFace(r.name, f.src, f.mat);
      for (let i = 0; i < t.length; i += 9) {
        const ref = { t, i, rec: r, f };
        if (insert(steepHash, ref) && feet) {
          steepRefs.push(ref);
          touched = true;
        }
      }
    }
    if (touched) nRecords++;
  }
  /** Highest up-face at (x, z) with y in [lo, hi] (of a material passing `mats`), or null. */
  const upAt = (x: number, z: number, lo: number, hi: number, not?: TriRef, mats?: RegExp, notRec?: Record): { y: number; mat: string } | null => {
    const list = upHash.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!list) return null;
    let best: { y: number; mat: string } | null = null;
    for (const ref of list) {
      if (ref === not || ref.rec === notRec || (mats && !mats.test(ref.f.mat))) continue;
      const t = ref.t, i = ref.i;
      const d = (t[i + 5] - t[i + 8]) * (t[i] - t[i + 6]) + (t[i + 6] - t[i + 3]) * (t[i + 2] - t[i + 8]);
      if (Math.abs(d) < 1e-9) continue;
      const l1 = ((t[i + 5] - t[i + 8]) * (x - t[i + 6]) + (t[i + 6] - t[i + 3]) * (z - t[i + 8])) / d;
      const l2 = ((t[i + 8] - t[i + 2]) * (x - t[i + 6]) + (t[i] - t[i + 6]) * (z - t[i + 8])) / d;
      const l3 = 1 - l1 - l2;
      if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
      const y = l1 * t[i + 1] + l2 * t[i + 4] + l3 * t[i + 7];
      if (y < lo || y > hi) continue;
      if (!best || y > best.y) best = { y, mat: ref.f.mat };
    }
    return best;
  };
  /** Steep faces whose XZ footprint passes within r of (x, z), passing `test`. */
  const steepAny = (x: number, z: number, r: number, test: (ref: TriRef, minY: number, maxY: number) => boolean): boolean => {
    const c = Math.ceil(r / CELL);
    const gx = Math.floor(x / CELL), gz = Math.floor(z / CELL);
    for (let ix = gx - c; ix <= gx + c; ix++)
      for (let iz = gz - c; iz <= gz + c; iz++) {
        const list = steepHash.get(key(ix, iz));
        if (!list) continue;
        for (const ref of list) {
          const t = ref.t, i = ref.i;
          const minY = Math.min(t[i + 1], t[i + 4], t[i + 7]), maxY = Math.max(t[i + 1], t[i + 4], t[i + 7]);
          if (!test(ref, minY, maxY)) continue;
          if (triDistXZ(t, i, x, z) <= r) return true;
        }
      }
    return false;
  };
  /** Nearest hit of a horizontal ray (unit dir dx, dz) of length len at height y against steep faces passing `test`. */
  const rayHit = (ox: number, oy: number, oz: number, dx: number, dz: number, len: number, test: (ref: TriRef) => boolean): number => {
    const seen = new Set<TriRef>();
    let best = Infinity;
    const n = Math.max(1, Math.ceil(len / CELL));
    for (let k = 0; k <= n; k++) {
      const px = ox + (dx * len * k) / n, pz = oz + (dz * len * k) / n;
      const gx = Math.floor(px / CELL), gz = Math.floor(pz / CELL);
      for (let ix = gx - 1; ix <= gx + 1; ix++)
        for (let iz = gz - 1; iz <= gz + 1; iz++) {
          const list = steepHash.get(key(ix, iz));
          if (!list) continue;
          for (const ref of list) {
            if (seen.has(ref)) continue;
            seen.add(ref);
            if (!test(ref)) continue;
            const d = rayTri(ref.t, ref.i, ox, oy, oz, dx, 0, dz);
            if (d < best) best = d;
          }
        }
    }
    return best <= len ? best : Infinity;
  };
  /** Support for a span: the same structure (record; a landmark's other parts too). */
  const sameSupport = (a: Record, b: Record) => a === b || (!isCityName(a.name) && !isCityName(b.name) && recOwner(a) === recOwner(b));

  const totals: FeetTotals = { samples: 0, edges: 0, records: nRecords, floating: 0, buriedOpening: 0, buriedWall: 0, buriedTop: 0, farFloat: 0, floorSamples: 0, sunkFloor: 0, skipped: { overhang: 0, water: 0, interior: 0, continues: 0, occluded: 0, enclosed: 0, inside: 0 } };
  const owners = new Map<string, FeetOwner>();
  const ownerRec = (rec: Record) => {
    const o = recOwner(rec);
    let e = owners.get(o);
    if (!e) owners.set(o, (e = { owner: o, samples: 0, floating: 0, maxFloat: 0, buriedOpening: 0, maxBuried: 0, floorSamples: 0, sunkFloor: 0, maxSunk: 0, farFloat: 0, maxFar: 0 }));
    return e;
  };
  interface Sample {
    kind: FootFinding['kind'];
    rec: Record;
    f: FaceSet;
    x: number;
    y: number;
    z: number;
    depth: number;
    depthVis: number;
    ground: number;
    terrain: number;
    groundMat: string;
    floor?: number;
    floorMat?: string;
    w: number;
    nx?: number;
    nz?: number;
  }
  const samples: Sample[] = [];
  const spanCache = new Map<TriRef, boolean>();
  for (const ref of steepRefs) {
    const t = ref.t, i = ref.i;
    // The bottom edge: the two lowest vertices, with the third standing above the edge (sloped
    // bottoms that follow the ground count too, up to 1:2).
    const vs = [0, 3, 6].map((k) => [t[i + k], t[i + k + 1], t[i + k + 2]]).sort((p, q) => p[1] - q[1]);
    const [a, b, c] = vs;
    const ex = b[0] - a[0], ez = b[2] - a[2];
    const L = Math.hypot(ex, ez);
    if (L < 0.12) continue;
    if (Math.abs(b[1] - a[1]) > 0.5 * L || c[1] - b[1] < 0.04) continue;
    // Outward horizontal normal from the winding (MeshBuilder faces point out of their solids).
    const ux = t[i + 3] - t[i], uy = t[i + 4] - t[i + 1], uz = t[i + 5] - t[i + 2];
    const vx = t[i + 6] - t[i], vy = t[i + 7] - t[i + 1], vz = t[i + 8] - t[i + 2];
    let nx = uy * vz - uz * vy, nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, nz);
    if (nl < 1e-6) continue;
    nx /= nl;
    nz /= nl;
    totals.edges++;
    const own = ownerRec(ref.rec);
    const n = Math.max(1, Math.round(L / step));
    for (let k = 0; k < n; k++) {
      const s = n === 1 ? 0.5 : (k + 0.5) / n;
      const qx = a[0] + ex * s, qz = a[2] + ez * s, qy = a[1] + (b[1] - a[1]) * s;
      if (qx < x0 || qx > x1 || qz < z0 || qz > z1) continue;
      if (opts.footAt && !opts.footAt(qx, qz)) {
        totals.skipped.inside++;
        continue;
      }
      const ox = qx + nx * 0.3, oz = qz + nz * 0.3;
      const terrain = heightAt(ox, oz);
      if (Math.abs(qy - terrain) > 25) {
        totals.skipped.interior++;
        continue;
      }
      const water = opts.waterAt?.(ox, oz);
      if (water != null && water > terrain + 0.05 && qy > terrain) {
        totals.skipped.water++;
        continue;
      }
      // Wall continuing below (a cornice, a sill, a course, a stacked box, the other half of a quad): not a foot.
      if (steepAny(qx, qz, 0.12, (r2, lo) => r2 !== ref && lo < qy - 0.02 && lo > qy - 40 && Math.max(r2.t[r2.i + 1], r2.t[r2.i + 4], r2.t[r2.i + 7]) > qy - 0.3)) {
        totals.skipped.continues++;
        continue;
      }
      totals.samples++;
      own.samples++;
      const surf = upAt(ox, oz, terrain - 1.5, qy + 0.5, undefined, GROUNDMAT);
      const ground = Math.max(terrain, surf?.y ?? -Infinity);
      const groundMat = surf && surf.y >= terrain ? surf.mat : 'terrain';
      const dropHere = groundMat === 'terrain' ? drop(ox, oz) : 0;
      const gap = qy - ground;
      if (gap > floatMin) {
        // A span: the same structure stands in the gap below the edge within reach. High edges
        // (lintels, entablatures, eaves, roof courses: thousands per building) decide once per triangle.
        const reach = Math.min(8, Math.max(0.6, gap * 0.8));
        const lowEnough = qy - 0.3 * gap;
        let spanned = gap > 1.5 ? spanCache.get(ref) : undefined;
        if (spanned === undefined) {
          spanned = steepAny(qx, qz, reach, (r2, lo, hi) => r2 !== ref && lo < lowEnough && hi > ground + 0.05 && sameSupport(r2.rec, ref.rec));
          if (gap > 1.5) spanCache.set(ref, spanned);
        }
        if (spanned) {
          totals.skipped.overhang++;
          continue;
        }
        // Occluded: something stands in front of the void (a neighbour's wall, a socle, a step).
        const ym = (qy + ground) / 2;
        if (rayHit(qx + nx * 0.7, ym, qz + nz * 0.7, -nx, -nz, 0.66, (r2) => r2 !== ref) < 0.66) {
          totals.skipped.occluded++;
          continue;
        }
        // Inside a city building (a closed room, a light well walled all round): the same block
        // stands within 15 m every way round the void. Landmarks' halls are walked through: kept.
        if (isCityName(ref.rec.name)) {
          const blk = recOwner(ref.rec);
          const sx = qx + nx * 0.05, sz = qz + nz * 0.05;
          const mine = (r2: TriRef) => r2 !== ref && recOwner(r2.rec) === blk;
          if ([[nx, nz], [-nz, nx], [nz, -nx], [-nx, -nz]].every(([dx, dz]) => rayHit(sx, ym, sz, dx, dz, 15, mine) < 15)) {
            totals.skipped.enclosed++;
            continue;
          }
        }
        totals.floating++;
        own.floating++;
        own.maxFloat = Math.max(own.maxFloat, gap);
        samples.push({ kind: 'floating', rec: ref.rec, f: ref.f, x: qx, y: qy, z: qz, depth: gap, depthVis: gap + dropHere, ground, terrain, groundMat, w: step, nx, nz });
        continue;
      }
      // A grounded foot seen from afar: the terrain drawn coarser and lower (CDLOD) opens a gap.
      if (opts.farTerrain && groundMat === 'terrain') {
        const far = qy - opts.farTerrain(ox, oz);
        if (far > 0.3) {
          totals.farFloat++;
          own.farFloat++;
          own.maxFar = Math.max(own.maxFar, far);
        }
      }
      // Buried: the floor just inside the wall lies under the ground outside (the street, the
      // terrain, a neighbour: not the structure's own threshold or step).
      const outside = Math.max(terrain, upAt(ox, oz, terrain - 1.5, qy + 0.5, undefined, GROUNDMAT, ref.rec)?.y ?? -Infinity);
      const ix = qx - nx * 0.6, iz = qz - nz * 0.6;
      const floor = upAt(ix, iz, qy - 0.3, outside + 0.3);
      if (!floor || outside - floor.y <= buryMin) continue;
      // Open there? A ray from outside just above the ground toward the wall meets none of its faces.
      const yo = outside + 0.35;
      const mineRec = (r2: TriRef) => r2.rec === ref.rec;
      const hit = rayHit(qx + nx * 0.8, yo, qz + nz * 0.8, -nx, -nz, 1.2, mineRec);
      if (hit < 0.95) {
        totals.buriedWall++;
        continue;
      }
      // An opening has wall over it (a lintel, an arch); nothing above means the ground rises over
      // a low structure's top (counted under terrain-in-floor).
      if (rayHit(qx + nx * 0.8, Math.max(floor.y + 4, outside + 1), qz + nz * 0.8, -nx, -nz, 1.2, mineRec) > 0.95) {
        totals.buriedTop++;
        continue;
      }
      totals.buriedOpening++;
      own.buriedOpening++;
      own.maxBuried = Math.max(own.maxBuried, outside - floor.y);
      const outMat = outside > terrain ? upAt(ox, oz, outside - 0.01, outside + 0.01, undefined, GROUNDMAT, ref.rec)?.mat ?? 'surface' : 'terrain';
      samples.push({ kind: 'buried-opening', rec: ref.rec, f: ref.f, x: qx, y: qy, z: qz, depth: outside - floor.y, depthVis: outside - floor.y - (outMat === 'terrain' ? drop(ox, oz) : 0), ground: outside, terrain, groundMat: outMat, floor: floor.y, floorMat: floor.mat, w: step, nx, nz });
    }
  }
  // Terrain through the structure's floors, treads, podium tops and slabs (as drawn).
  for (const ref of floorRefs) {
    const t = ref.t, i = ref.i;
    const ax = t[i], ay = t[i + 1], az = t[i + 2], bx = t[i + 3], by = t[i + 4], bz = t[i + 5], qx3 = t[i + 6], qy3 = t[i + 7], qz3 = t[i + 8];
    const area = 0.5 * Math.abs((bx - ax) * (qz3 - az) - (qx3 - ax) * (bz - az));
    if (area < 0.02 || (ref.f.mat.startsWith('wood') && area < 1)) continue;
    const nn = Math.max(1, Math.min(40, Math.round(Math.sqrt(area) / 0.75)));
    const per = area / ((nn * (nn + 1)) / 2);
    const own = ownerRec(ref.rec);
    for (let u = 0; u < nn; u++)
      for (let v = 0; u + v < nn; v++) {
        const l1 = (u + 1 / 3) / nn, l2 = (v + 1 / 3) / nn, l3 = 1 - l1 - l2;
        const x = l1 * ax + l2 * bx + l3 * qx3, z = l1 * az + l2 * bz + l3 * qz3, y = l1 * ay + l2 * by + l3 * qy3;
        if (x < x0 || x > x1 || z < z0 || z > z1) continue;
        const terrain = heightAt(x, z);
        if (Math.abs(terrain - y) > 25) continue;
        const water = opts.waterAt?.(x, z);
        if (water != null && water > terrain + 0.05) continue;
        totals.floorSamples++;
        own.floorSamples++;
        const vis = terrain - drop(x, z);
        const sunk = vis - y;
        if (sunk <= sinkMin) continue;
        // Covered just above the terrain (a floor laid over a sunk slab, a step over its footing): not seen.
        const over = upAt(x, z, vis - 0.02, vis + 0.6, ref);
        if (over) continue;
        totals.sunkFloor++;
        own.sunkFloor++;
        own.maxSunk = Math.max(own.maxSunk, sunk);
        samples.push({ kind: 'terrain-in-floor', rec: ref.rec, f: ref.f, x, y, z, depth: terrain - y, depthVis: sunk, ground: terrain, terrain, groundMat: 'terrain', floor: y, floorMat: ref.f.mat, w: per });
      }
  }
  // Stretches: samples of one build, source, material and kind within 2 m of one another.
  const groups: Sample[][] = [];
  const byRec = new Map<string, Sample[][]>();
  for (const s of samples) {
    const k = `${s.kind}|${s.rec.name}|${s.f.src}|${s.f.mat}`;
    let list = byRec.get(k);
    if (!list) byRec.set(k, (list = []));
    let home: Sample[] | null = null;
    for (const g of list) {
      if (!g.length || !g.some((o) => Math.abs(o.x - s.x) < 2 && Math.abs(o.z - s.z) < 2 && Math.hypot(o.x - s.x, o.z - s.z) < 2)) continue;
      if (!home) {
        home = g;
        g.push(s);
      } else {
        // The sample joins two stretches: merge them.
        home.push(...g);
        g.length = 0;
      }
    }
    if (!home) {
      const g = [s];
      list.push(g);
      groups.push(g);
    }
  }
  const findings: FootFinding[] = [];
  for (const g of groups) {
    if (!g.length) continue;
    const worst = g.reduce((p, q) => (q.depthVis > p.depthVis ? q : p));
    findings.push({
      kind: worst.kind,
      name: worst.rec.name,
      owner: recOwner(worst.rec),
      src: worst.f.src,
      mat: worst.f.mat,
      n: g.length,
      length: +g.reduce((s, q) => s + q.w, 0).toFixed(1),
      depth: +worst.depth.toFixed(2),
      depthVis: +worst.depthVis.toFixed(2),
      at: [+worst.x.toFixed(1), +worst.y.toFixed(2), +worst.z.toFixed(1)],
      ground: +worst.ground.toFixed(2),
      terrain: +worst.terrain.toFixed(2),
      groundMat: worst.groundMat,
      ...(worst.floor !== undefined ? { floor: +worst.floor.toFixed(2), floorMat: worst.floorMat } : {}),
      ...(worst.nx !== undefined ? { out: [+worst.nx.toFixed(2), +worst.nz!.toFixed(2)] as [number, number] } : {}),
    });
  }
  findings.sort((p, q) => q.depthVis - p.depthVis);
  return { findings, totals, owners: [...owners.values()].filter((o) => o.samples || o.floorSamples) };
}
