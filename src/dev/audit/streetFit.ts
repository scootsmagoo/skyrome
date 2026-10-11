/**
 * Street-level fit audit (dev tool, needs `?audit`; driven by scripts/audit/street-fit.mjs).
 *
 * The city builds its streets lazily near the player, so a walk only ever sees a few cells. This
 * audit rebuilds the street level itself, cell by cell, from the same work items the streamer runs
 * (`game.city.streamer.cells[*].work`: roads, lanes, junction squares, piazzas, ground cover,
 * stairs, street furniture and props) and the same block units (`fillUnits`, full level: shop
 * floors, yards, frontage goods), without drawing anything. It reads the landmarks' paving, floors
 * and prop bases from the geometry audit's records (geomAudit.ts), and compares everything against
 * the terrain AS DRAWN: the CDLOD leaf triangulation of the 2 m height grid, lowered 9 cm under the
 * atlas roads and the building pads (terrainMaterial.ts), not the bilinear `heightAt` the builders
 * drape on.
 *
 * Per 128 m street cell it measures:
 *  - edges:    every open (boundary) edge of the street surfaces, sampled every 0.25 m: how far it
 *              stands over what is visible just beyond it (a paving edge, an apron, a skirt or a
 *              kerb face ending in the air: "floating kerbs"), and the same for down-facing faces
 *              (stair blocks, parapets) with a gap under them;
 *  - lips:     steps of 3-30 cm between neighbouring walkable surfaces of different builds where a
 *              street surface is one of them (road ends on junctions, lanes on sidewalks, piazzas,
 *              ground cover, shop floors, landmark paving);
 *  - zfight:   two visible surfaces of different materials within 2 mm (with the reversed float depth
 *              buffer only true coplanarity flickers), and the drawn
 *              terrain at or above a street surface (it shows through);
 *  - props:    each placed prop's feet (its lowest vertices, ≤ 15 % tilt) against the ground under
 *              them: floating (no foot touches), a foot in the air, sunk; fixtures (fountains,
 *              shrines, pens: geometry that is not a prop) by their lowest vertices; landmark props
 *              by their base point;
 *  - kerbstones: the terrain dressing's travertine kerbs (dress.ts) by their box corners: floating,
 *              buried, or standing in a city street's paving.
 *
 * API (on `window.__streetFit` once the driver has imported this module):
 *   init()            the cell list and global counts
 *   sweepCell(key)    measures one cell, returns its tallies and findings (compact)
 *   visibleAt(x, z)   the terrain height as drawn (CDLOD leaf), for spot checks
 */
import * as THREE from 'three';
import type { Game } from '../../core/Game';
import { MeshBuilder } from '../../gfx/MeshBuilder';
import { fillUnits } from '../../world/city/fill';
import type { CellRec, BlockRec } from '../../world/city/streamer';
import { auditFaceSets, auditPropBases, withAuditSource } from './geomAudit';

// ------------------------------------------------------------------------------- registries

const MATS: string[] = [];
const MAT_ID = new Map<string, number>();
const SRCS: string[] = [];
const SRC_ID = new Map<string, number>();
const matId = (m: string) => {
  let i = MAT_ID.get(m);
  if (i === undefined) MAT_ID.set(m, (i = MATS.push(m) - 1));
  return i;
};
const srcId = (s: string) => {
  let i = SRC_ID.get(s);
  if (i === undefined) SRC_ID.set(s, (i = SRCS.push(s) - 1));
  return i;
};

/** Materials one walks on as a floor (lips and double paving are judged only between these and the terrain). */
const FLOOR = /paving|cobbles|gravel|dirt|sand|mud|concrete|basalt|mosaic|terracotta|grass|opus|floor|earth/;

/** Layers of what a triangle belongs to. */
const ITEMS = 0, DETAIL = 1, BLOCK = 2, LANDMARK = 3;

/** A triangle soup with tags: 9 floats per triangle. */
interface Soup {
  pos: Float32Array;
  mat: Uint16Array;
  src: Uint32Array;
  /** Prop id (global) or -1. */
  owner: Int32Array;
  layer: number;
  n: number;
  /** Props placed in it: id, kind, base and the triangle range of each part. */
  props: PropRec[];
}

interface PropRec {
  id: number;
  kind: string;
  src: string;
  base: [number, number, number];
  /** Foot vertices (x, y, z) in world space. */
  feet: Float32Array;
}

let nextProp = 0;

/** Reads a built MeshBuilder's parts (after build(): settled and coplanar-separated) into a soup. */
function soupOf(b: MeshBuilder, layer: number, keep?: (ny: number, y: number, x: number, z: number) => boolean): Soup {
  const bb = b as unknown as {
    parts: Map<string, THREE.BufferGeometry[]>;
    custom: Map<string, THREE.Material>;
    props: { kind: string; base: THREE.Vector3; geoms: THREE.BufferGeometry[] }[];
    auditProps: { kind: string; p: THREE.Vector3; src: string }[];
  };
  const owner = new Map<THREE.BufferGeometry, number>();
  const props: PropRec[] = [];
  const srcOfBase = new Map<THREE.Vector3, string>();
  for (const a of bb.auditProps) srcOfBase.set(a.p, a.src);
  for (const p of bb.props) {
    const id = nextProp++;
    for (const g of p.geoms) owner.set(g, id);
    props.push({ id, kind: p.kind, src: srcOfBase.get(p.base) ?? '', base: [p.base.x, p.base.y, p.base.z], feet: feetOf(p.geoms, p.base) });
  }
  const pos: number[] = [];
  const mat: number[] = [];
  const src: number[] = [];
  const own: number[] = [];
  for (const [key, geoms] of bb.parts) {
    const mk = key.split('|')[0];
    const mname = mk.startsWith('#') ? bb.custom.get(mk)?.name || 'custom' : mk;
    const mi = matId(mname);
    for (const g of geoms) {
      const a = (g.getAttribute('position') as THREE.BufferAttribute | undefined)?.array as Float32Array | undefined;
      if (!a) continue;
      const si = srcId((g.userData.src as string) || '');
      const oi = owner.get(g) ?? -1;
      for (let i = 0; i + 8 < a.length; i += 9) {
        if (keep) {
          const ux = a[i + 3] - a[i], uy = a[i + 4] - a[i + 1], uz = a[i + 5] - a[i + 2];
          const vx = a[i + 6] - a[i], vy = a[i + 7] - a[i + 1], vz = a[i + 8] - a[i + 2];
          const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
          const l = Math.hypot(nx, ny, nz) || 1;
          if (!keep(ny / l, (a[i + 1] + a[i + 4] + a[i + 7]) / 3, (a[i] + a[i + 3] + a[i + 6]) / 3, (a[i + 2] + a[i + 5] + a[i + 8]) / 3)) continue;
        }
        for (let k = 0; k < 9; k++) pos.push(a[i + k]);
        mat.push(mi);
        src.push(si);
        own.push(oi);
      }
    }
  }
  return { pos: new Float32Array(pos), mat: Uint16Array.from(mat), src: Uint32Array.from(src), owner: Int32Array.from(own), layer, n: mat.length, props };
}

/**
 * A prop's feet: the vertices of its geometry no higher over its base than 4 cm plus the steepest
 * tilt a prop takes (15 %, props/ground.ts) times their distance from it: leg ends, plinth bottoms,
 * the lowest amphora's toe; not seats, counters or shelves.
 */
function feetOf(geoms: THREE.BufferGeometry[], base: THREE.Vector3): Float32Array {
  const out: number[] = [];
  let minY = Infinity;
  for (const g of geoms) {
    const a = (g.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    for (let i = 1; i < a.length; i += 3) minY = Math.min(minY, a[i]);
  }
  const y0 = Math.min(base.y, minY);
  const seen = new Set<string>();
  for (const g of geoms) {
    const a = (g.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    for (let i = 0; i + 2 < a.length; i += 3) {
      const r = Math.hypot(a[i] - base.x, a[i + 2] - base.z);
      if (a[i + 1] - y0 > 0.04 + 0.15 * r) continue;
      const k = `${Math.round(a[i] * 50)},${Math.round(a[i + 2] * 50)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(a[i], a[i + 1], a[i + 2]);
    }
  }
  return new Float32Array(out);
}

// ------------------------------------------------------------------------------- the drawn terrain

interface Hm {
  heights: Float32Array;
  nx: number;
  nz: number;
  minX: number;
  minZ: number;
  spacing: number;
  heightAt(x: number, z: number): number;
}

let V: (x: number, z: number) => number = () => 0;
let P: (x: number, z: number) => number = () => 0;

/**
 * The terrain as the CDLOD leaf level draws it (terrainMaterial.ts): the 2 m grid's heights at the
 * vertices, minus 9 cm under paved atlas roads and building pads (their signed-distance fields,
 * smoothstep 0.75 → -0.25 m), planar over each grid square's two triangles (diagonal from (i, j) to
 * (i+1, j+1), Terrain.patchGeometry, or from (i+1, j) to (i, j+1) when `bc`: terrain profile v2,
 * read from the drawn patch's index). Coarser levels (beyond ~200 m) sit lower still.
 */
function visibleTerrain(hm: Hm, a: Uint8Array, bc = false): (x: number, z: number) => number {
  const { heights: h, nx, nz, minX, minZ, spacing: sp } = hm;
  const ss = (x: number) => {
    const t = Math.min(1, Math.max(0, (x - 0.75) / -1));
    return t * t * (3 - 2 * t);
  };
  const drop = new Float32Array(nx * nz);
  for (let k = 0; k < nx * nz; k++) {
    const road = (a[k * 4 + 2] / 255 - 0.5) * 16, pad = (a[k * 4 + 3] / 255 - 0.5) * 16;
    drop[k] = 0.09 * Math.max(ss(road), ss(pad));
  }
  const vv = (i: number, j: number) => h[j * nx + i] - drop[j * nx + i];
  return (x, z) => {
    const fx = Math.min(Math.max((x - minX) / sp, 0), nx - 1.0001);
    const fz = Math.min(Math.max((z - minZ) / sp, 0), nz - 1.0001);
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const A = vv(i, j), B = vv(i + 1, j), C = vv(i, j + 1), D = vv(i + 1, j + 1);
    if (bc) return tx + tz <= 1 ? A + (B - A) * tx + (C - A) * tz : D + (C - D) * (1 - tx) + (B - D) * (1 - tz);
    return tz >= tx ? A + (D - C) * tx + (C - A) * tz : A + (B - A) * tx + (D - B) * tz;
  };
}

// ------------------------------------------------------------------------------- surface index

/** Up-facing triangles in 1 m buckets over a rectangle; `surfaces(x, z)` lists what lies over a point. */
class UpIndex {
  private readonly buckets: Map<number, number[]> = new Map();
  /** Packed triangles: 9 floats each, plus tags. */
  private pos: number[] = [];
  private mat: number[] = [];
  private src: number[] = [];
  private own: number[] = [];
  private lay: number[] = [];
  constructor(readonly x0: number, readonly z0: number, readonly x1: number, readonly z1: number) {}

  addSoup(s: Soup, onlyLayerUp = true) {
    const p = s.pos;
    for (let t = 0; t < s.n; t++) {
      const i = t * 9;
      if (onlyLayerUp && !isUp(p, i)) continue;
      this.add(p, i, s.mat[t], s.src[t], s.owner[t], s.layer);
    }
  }

  add(p: ArrayLike<number>, i: number, mat: number, src: number, own: number, layer: number) {
    const minX = Math.min(p[i], p[i + 3], p[i + 6]), maxX = Math.max(p[i], p[i + 3], p[i + 6]);
    const minZ = Math.min(p[i + 2], p[i + 5], p[i + 8]), maxZ = Math.max(p[i + 2], p[i + 5], p[i + 8]);
    if (maxX < this.x0 || minX > this.x1 || maxZ < this.z0 || minZ > this.z1) return;
    const id = this.mat.length;
    for (let k = 0; k < 9; k++) this.pos.push(p[i + k]);
    this.mat.push(mat);
    this.src.push(src);
    this.own.push(own);
    this.lay.push(layer);
    const bx0 = Math.max(Math.floor(this.x0), Math.floor(minX)), bx1 = Math.min(Math.floor(this.x1), Math.floor(maxX));
    const bz0 = Math.max(Math.floor(this.z0), Math.floor(minZ)), bz1 = Math.min(Math.floor(this.z1), Math.floor(maxZ));
    for (let bz = bz0; bz <= bz1; bz++)
      for (let bx = bx0; bx <= bx1; bx++) {
        const key = bz * 65536 + bx;
        const l = this.buckets.get(key);
        if (l) l.push(id);
        else this.buckets.set(key, [id]);
      }
  }

  get size() {
    return this.mat.length;
  }

  /** Surfaces over (x, z), unsorted: calls fn(y, mat, src, owner, layer). */
  each(x: number, z: number, fn: (y: number, mat: number, src: number, own: number, layer: number) => void) {
    const l = this.buckets.get(Math.floor(z) * 65536 + Math.floor(x));
    if (!l) return;
    const p = this.pos;
    for (const id of l) {
      const i = id * 9;
      const ax = p[i], ay = p[i + 1], az = p[i + 2], bx = p[i + 3], by = p[i + 4], bz = p[i + 5], cx = p[i + 6], cy = p[i + 7], cz = p[i + 8];
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(d) < 1e-10) continue;
      const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
      if (l1 < -1e-6) continue;
      const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
      if (l2 < -1e-6 || l1 + l2 > 1 + 1e-6) continue;
      fn(l1 * ay + l2 * by + (1 - l1 - l2) * cy, this.mat[id], this.src[id], this.own[id], this.lay[id]);
    }
  }
}

function isUp(p: ArrayLike<number>, i: number, min = 0.7) {
  const ux = p[i + 3] - p[i], uy = p[i + 4] - p[i + 1], uz = p[i + 5] - p[i + 2];
  const vx = p[i + 6] - p[i], vy = p[i + 7] - p[i + 1], vz = p[i + 8] - p[i + 2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz);
  return l > 1e-8 && ny / l > min;
}

function normalOf(p: ArrayLike<number>, i: number): [number, number, number] {
  const ux = p[i + 3] - p[i], uy = p[i + 4] - p[i + 1], uz = p[i + 5] - p[i + 2];
  const vx = p[i + 6] - p[i], vy = p[i + 7] - p[i + 1], vz = p[i + 8] - p[i + 2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

// ------------------------------------------------------------------------------- state

interface CellData {
  items: Soup;
  detail: Soup;
}

let game: Game;
let cellRecs: CellRec[] = [];
let blockRecs: BlockRec[] = [];
const cellCache = new Map<string, CellData>();
const blockCache = new Map<string, Soup>();
let landmarkSets: ReturnType<typeof auditFaceSets> = [];
let landmarkProps: ReturnType<typeof auditPropBases> = [];
let kerbstones: { x: number; z: number; corners: Float32Array; top: number }[] = [];
let places: { id: string; x: number; z: number }[] = [];

const H = (x: number, z: number) => game.heightmap.heightAt(x, z);

export function init() {
  game = (window as unknown as { __skyrome: { game: Game } }).__skyrome.game;
  const city = game.city;
  if (!city) throw new Error('no city');
  const hm = game.heightmap as unknown as Hm;
  const terrain = game.terrain as unknown as { data: { a: Uint8Array }; mesh?: { geometry?: { index?: { array: ArrayLike<number> } | null } } };
  // The drawn patch's first cell is (a, c, d, …) when split a–d and (a, c, b, …) when split b–c.
  V = visibleTerrain(hm, terrain.data.a, terrain.mesh?.geometry?.index?.array[2] === 1);
  P = (x, z) => hm.heightAt(x, z);
  cellRecs = city.streamer.cells as CellRec[];
  blockRecs = (city.streamer.blocks as BlockRec[]).filter((r) => r.blk.detailed && r.layout);
  // The landmarks (and quays, bridges, walls): the geometry audit's records, minus the city's own builds.
  landmarkSets = auditFaceSets(/^city:|^sf:/);
  landmarkProps = auditPropBases(/^city:|^sf:/);
  // The terrain dressing's kerbstones: box corners from the instance matrices (geometry 2.4 × 0.36 × 0.26).
  kerbstones = [];
  const m = new THREE.Matrix4(), v = new THREE.Vector3();
  game.dressing?.group.traverse((o) => {
    const im = o as THREE.InstancedMesh;
    if (!im.isInstancedMesh || !/^kerbs/.test(im.name)) return;
    const g = im.geometry;
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    for (let k = 0; k < im.count; k++) {
      im.getMatrixAt(k, m);
      m.premultiply(im.matrixWorld);
      const c = new Float32Array(24);
      let top = -Infinity;
      let n = 0;
      for (const y of [bb.min.y, bb.max.y])
        for (const x of [bb.min.x, bb.max.x])
          for (const z of [bb.min.z, bb.max.z]) {
            v.set(x, y, z).applyMatrix4(m);
            c[n++] = v.x;
            c[n++] = v.y;
            c[n++] = v.z;
            top = Math.max(top, v.y);
          }
      v.set(0, 0, 0).applyMatrix4(m);
      kerbstones.push({ x: v.x, z: v.z, corners: c, top });
    }
  });
  places = game.locations.all().filter((l) => l.position).map((l) => ({ id: l.id, x: l.position!.x, z: l.position!.z }));
  const cells = cellRecs.filter((c) => c.work.items.length || c.work.detail.length).map((c) => ({ key: c.work.key, cx: c.work.cx, cz: c.work.cz, items: c.work.items.length, detail: c.work.detail.length }));
  return { cells, blocks: blockRecs.length, landmarkSets: landmarkSets.length, landmarkProps: landmarkProps.length, kerbstones: kerbstones.length, places: places.length };
}

export const visibleAt = (x: number, z: number) => V(x, z);

/** The nearest named place (location) to (x, z). */
export function placeOf(x: number, z: number): { id: string; d: number } {
  let best = { id: '?', d: Infinity };
  for (const p of places) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < best.d) best = { id: p.id, d };
  }
  return { id: best.id, d: Math.round(best.d) };
}

function cellRec(key: string) {
  return cellRecs.find((c) => c.work.key === key);
}

/** Build a street cell's surfaces and furniture the way the streamer does (into unrendered builders). */
function cellData(key: string): CellData | null {
  let d = cellCache.get(key);
  if (d) return d;
  const c = cellRec(key);
  if (!c) return null;
  const run = (items: ((b: MeshBuilder) => void)[], layer: number, tag: string) => {
    const b = new MeshBuilder();
    items.forEach((it, k) => {
      try {
        withAuditSource(`${tag}#${k}`, () => it(b));
      } catch {
        /* the streamer skips a failing item too */
      }
    });
    // ':low' keeps this build out of the geometry audit's records (geomAudit skips coarse levels).
    const g = b.build(`sf:${tag}:${key}:low`);
    g.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    return soupOf(b, layer);
  };
  d = { items: run(c.work.items, ITEMS, 'item'), detail: run(c.work.detail, DETAIL, 'detail') };
  cellCache.set(key, d);
  return d;
}

/** A block's full level, unit by unit (fill.ts), keeping its street-level faces and its props. */
function blockData(r: BlockRec): Soup {
  let s = blockCache.get(r.blk.id);
  if (s) return s;
  const parts: Soup[] = [];
  const tag = `block:${r.blk.id}`;
  const it = fillUnits(r.blk, r.layout!, 'full', H);
  // Generating a unit adds its geometry (MeshBuilder.add reads the audit source then), so tag that.
  for (;;) {
    let step: IteratorResult<{ builder: MeshBuilder }>;
    try {
      step = withAuditSource(tag, () => it.next());
    } catch {
      break;
    }
    if (step.done) break;
    const u = step.value;
    try {
      const g = withAuditSource(tag, () => u.builder.build(`sf:block:${r.blk.id}:low`));
      g.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      parts.push(soupOf(u.builder, BLOCK, (ny, y, x, z) => ny > 0.7 && y < V(x, z) + 6));
    } catch {
      /* skip */
    }
  }
  s = joinSoups(parts, BLOCK);
  blockCache.set(r.blk.id, s);
  return s;
}

function joinSoups(list: Soup[], layer: number): Soup {
  const n = list.reduce((a, s) => a + s.n, 0);
  const out: Soup = { pos: new Float32Array(n * 9), mat: new Uint16Array(n), src: new Uint32Array(n), owner: new Int32Array(n), layer, n, props: [] };
  let o = 0;
  for (const s of list) {
    out.pos.set(s.pos, o * 9);
    out.mat.set(s.mat, o);
    out.src.set(s.src, o);
    out.owner.set(s.owner, o);
    out.props.push(...s.props);
    o += s.n;
  }
  return out;
}

// ------------------------------------------------------------------------------- findings

export interface Finding {
  kind: string;
  src: string;
  mat?: string;
  x: number;
  y: number;
  z: number;
  /** The measured value (m): gap, lip height, sink depth… */
  v: number;
  /** Extent: metres of edge, 0.25 m raster cells, or 1 for an object. */
  len: number;
  note?: string;
}

/** What made a surface, without ids: 'road:urban', 'junction', 'ground-cover', 'piazza', 'street:lane'… */
export function srcKind(s: string): string {
  if (!s) return '?';
  if (s.startsWith('road:')) return 'road:' + s.split(':').slice(-1)[0];
  if (s.startsWith('street:')) return 'street:' + s.split(':').slice(-1)[0];
  if (s.startsWith('block:')) return 'block';
  if (s.startsWith('item#')) return 'item';
  if (s.startsWith('detail#')) return 'detail';
  return s.replace(/:.*$/, '').replace(/#.*$/, '');
}

// ------------------------------------------------------------------------------- the sweep of one cell

export function sweepCell(key: string, o: { blocks?: boolean; maxFindings?: number } = {}) {
  const t0 = performance.now();
  const c = cellRec(key);
  if (!c) return null;
  const { minX: x0, minZ: z0, maxX: x1, maxZ: z1 } = c.bounds;
  const M = 3;
  const inCell = (x: number, z: number) => x >= x0 && x < x1 && z >= z0 && z < z1;
  // Evict cached cells and blocks far from this one.
  for (const k of [...cellCache.keys()]) {
    const r = cellRec(k);
    if (r && (Math.abs(r.work.cx - c.work.cx) > 200 || Math.abs(r.work.cz - c.work.cz) > 200)) cellCache.delete(k);
  }
  for (const [id] of [...blockCache]) {
    const r = blockRecs.find((b) => b.blk.id === id);
    if (!r || Math.abs(r.blk.centroid[0] - c.work.cx) > 260 || Math.abs(r.blk.centroid[1] - c.work.cz) > 260) blockCache.delete(id);
  }
  const me = cellData(key)!;
  const idx = new UpIndex(x0 - M, z0 - M, x1 + M, z1 + M);
  // Neighbour cells' surfaces (a road piece of the next cell may reach into this one).
  const [ix, iz] = key.split(',').map(Number);
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) {
      const d = dx || dz ? cellData(`${ix + dx},${iz + dz}`) : me;
      if (!d) continue;
      idx.addSoup(d.items);
      idx.addSoup(d.detail);
    }
  // Blocks touching the cell: their floors, yards and props.
  const blocks: Soup[] = [];
  if (o.blocks !== false) {
    for (const r of blockRecs) {
      const [bx, bz] = r.blk.centroid;
      const rad = r.blk.radius + M;
      if (bx + rad < x0 || bx - rad > x1 || bz + rad < z0 || bz - rad > z1) continue;
      const s = blockData(r);
      blocks.push(s);
      idx.addSoup(s, true);
    }
  }
  // Landmark faces near the cell (skip roofs: nothing over 8 m above the drawn ground).
  const lmSrc = new Set<number>();
  for (const f of landmarkSets) {
    const [bx0, bx1, bz0, bz1] = f.box;
    if (bx1 < x0 - M || bx0 > x1 + M || bz1 < z0 - M || bz0 > z1 + M) continue;
    const mi = matId(f.mat), si = srcId(`lm:${f.name}`);
    lmSrc.add(si);
    const w = f.world;
    for (let i = 0; i + 8 < w.length; i += 9) {
      const cx = (w[i] + w[i + 3] + w[i + 6]) / 3, cz = (w[i + 2] + w[i + 5] + w[i + 8]) / 3;
      if ((w[i + 1] + w[i + 4] + w[i + 7]) / 3 > V(cx, cz) + 8) continue;
      idx.add(w, i, mi, si, -1, LANDMARK);
    }
  }

  /** The highest visible ground at (x, z) no higher than yMax: drawn terrain or any up-facing surface (not `skipOwner`'s). */
  const groundAt = (x: number, z: number, yMax: number, skipOwner = -2, skipSrc = -1) => {
    let g = V(x, z);
    idx.each(x, z, (y, _m, s, own) => {
      if (y <= yMax && y > g && own !== skipOwner && s !== skipSrc) g = y;
    });
    return g;
  };

  /** Is there a surface over (x, z) between y0 and y1 (an edge tucked under its neighbour is not open)? */
  const coveredAt = (x: number, z: number, y0: number, y1: number) => {
    let hit = V(x, z) > y0 && V(x, z) < y1;
    if (!hit) idx.each(x, z, (y) => {
      if (y > y0 && y < y1) hit = true;
    });
    return hit;
  };

  const findings: Finding[] = [];
  const tally: Record<string, number> = {};
  const add = (k: string, v = 1) => (tally[k] = (tally[k] ?? 0) + v);
  const bySrc: Record<string, Record<string, number>> = {};
  const addSrc = (s: string, k: string, v: number) => {
    const e = (bySrc[s] ??= {});
    e[k] = (e[k] ?? 0) + v;
  };

  // ---- 1. open edges of the street surfaces (this cell's items)
  {
    const s = me.items;
    const p = s.pos;
    // Weld vertices (2 mm) and count edge uses over the whole cell build.
    const vid = new Map<string, number>();
    const vi = new Int32Array(s.n * 3);
    for (let t = 0; t < s.n; t++)
      for (let k = 0; k < 3; k++) {
        const i = t * 9 + k * 3;
        const key2 = `${Math.round(p[i] * 500)},${Math.round(p[i + 1] * 500)},${Math.round(p[i + 2] * 500)}`;
        let id = vid.get(key2);
        if (id === undefined) vid.set(key2, (id = vid.size));
        vi[t * 3 + k] = id;
      }
    const uses = new Map<number, number>();
    const ekey = (a: number, b: number) => (a < b ? a * 4194304 + b : b * 4194304 + a);
    for (let t = 0; t < s.n; t++)
      for (let k = 0; k < 3; k++) {
        const e = ekey(vi[t * 3 + k], vi[t * 3 + ((k + 1) % 3)]);
        uses.set(e, (uses.get(e) ?? 0) + 1);
      }
    // Floating edge samples, binned per source and 2 m square.
    const bins = new Map<string, { src: string; mat: string; len: number; max: number; at: [number, number, number]; kind: string }>();
    for (let t = 0; t < s.n; t++) {
      const i = t * 9;
      const [nx, ny, nz] = normalOf(p, i);
      const up = ny > 0.7;
      const down = ny < -0.7;
      for (let k = 0; k < 3; k++) {
        const a = vi[t * 3 + k], b = vi[t * 3 + ((k + 1) % 3)];
        if (uses.get(ekey(a, b)) !== 1) continue;
        const ia = i + k * 3, ib = i + ((k + 1) % 3) * 3, ic = i + ((k + 2) % 3) * 3;
        const ax = p[ia], ay = p[ia + 1], az = p[ia + 2], bx = p[ib], by = p[ib + 1], bz = p[ib + 2];
        const len = Math.hypot(bx - ax, bz - az);
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if (!inCell(mx, mz)) continue;
        let kind: string;
        let ox = 0, oz = 0;
        if (up) {
          // Outward: perpendicular to the edge in plan, away from the third vertex.
          if (len < 0.01) continue;
          ox = -(bz - az) / len;
          oz = (bx - ax) / len;
          const cx = p[ic] - mx, cz = p[ic + 2] - mz;
          if (ox * cx + oz * cz > 0) {
            ox = -ox;
            oz = -oz;
          }
          kind = 'edge';
        } else if (down) continue;
        else {
          // A side face (kerb, skirt, cap, riser): only its bottom edge can hang in the air.
          const cy = p[ic + 1];
          if (cy <= Math.max(ay, by) + 0.01) continue;
          const l2 = Math.hypot(nx, nz) || 1;
          ox = nx / l2;
          oz = nz / l2;
          kind = 'face-bottom';
        }
        const srcName = SRCS[s.src[t]];
        const sk = srcKind(srcName);
        const L = Math.max(len, Math.abs(by - ay));
        const nS = Math.max(1, Math.round(L / 0.25));
        for (let j = 0; j < nS; j++) {
          const f = (j + 0.5) / nS;
          const x = ax + (bx - ax) * f, y = ay + (by - ay) * f, z = az + (bz - az) * f;
          const seg = L / nS;
          addSrc(sk, 'edgeLen', seg);
          const qx = x + ox * 0.06, qz = z + oz * 0.06;
          const g = groundAt(qx, qz, y + 0.02);
          const gap = y - g;
          add('edgeSamples');
          if (gap <= 0.03) continue;
          // An edge tucked under a higher neighbour (a road end under a junction square) is hidden.
          if (coveredAt(qx, qz, y + 0.02, y + 0.6)) continue;
          addSrc(sk, 'float03', seg);
          if (gap > 0.08) addSrc(sk, 'float08', seg);
          if (gap > 0.15) addSrc(sk, 'float15', seg);
          const bk = `${kind}|${srcName}|${Math.floor(x / 2)},${Math.floor(z / 2)}`;
          const e = bins.get(bk);
          if (e) {
            e.len += seg;
            if (gap > e.max) {
              e.max = gap;
              e.at = [x, y, z];
            }
          } else bins.set(bk, { src: srcName, mat: MATS[s.mat[t]], len: seg, max: gap, at: [x, y, z], kind });
        }
      }
    }
    for (const e of bins.values()) {
      add(`${e.kind}Bins`);
      findings.push({ kind: e.kind === 'edge' ? 'edge-float' : 'face-float', src: e.src, mat: e.mat, x: e.at[0], y: e.at[1], z: e.at[2], v: e.max, len: e.len });
    }
    // Down-facing faces of the street surfaces (stair blocks, parapets): a gap under them.
    const dbins = new Map<string, Finding>();
    for (let t = 0; t < s.n; t++) {
      const i = t * 9;
      const [, ny] = normalOf(p, i);
      if (ny > -0.7) continue;
      for (const [fa, fb] of [[1 / 3, 1 / 3], [0.8, 0.1], [0.1, 0.8], [0.1, 0.1]]) {
        const x = p[i] * fa + p[i + 3] * fb + p[i + 6] * (1 - fa - fb), y = p[i + 1] * fa + p[i + 4] * fb + p[i + 7] * (1 - fa - fb), z = p[i + 2] * fa + p[i + 5] * fb + p[i + 8] * (1 - fa - fb);
        if (!inCell(x, z)) continue;
        const g = groundAt(x, z, y + 0.02);
        const gap = y - g;
        if (gap <= 0.03 || gap > 1.5) continue;
        const bk = `${SRCS[s.src[t]]}|${Math.floor(x / 2)},${Math.floor(z / 2)}`;
        const e = dbins.get(bk);
        if (!e) dbins.set(bk, { kind: 'under-gap', src: SRCS[s.src[t]], mat: MATS[s.mat[t]], x, y, z, v: gap, len: 1 });
        else {
          e.len++;
          if (gap > e.v) Object.assign(e, { x, y, z, v: gap });
        }
      }
    }
    for (const e of dbins.values()) findings.push(e);
  }

  // ---- 2. the walkable top on a 0.25 m raster: lips between builds, z-fighting, terrain through paving
  {
    const C = 0.25;
    const nx = Math.round((x1 - x0) / C), nz = Math.round((z1 - z0) / C);
    const top = new Float32Array(nx * nz);
    const tsrc = new Int32Array(nx * nz);
    const tlay = new Int8Array(nx * nz);
    const tmat = new Int32Array(nx * nz);
    const dbl = new Map<string, Finding>();
    const zb = new Map<string, Finding>();
    const thr = new Map<string, Finding>();
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const x = x0 + (i + 0.5) * C, z = z0 + (j + 0.5) * C;
        const v = V(x, z);
        // Walkable top: the highest surface not of a prop, no higher than 1.5 m over the drawn ground.
        let y1 = -Infinity, m1 = -1, s1 = -1, l1 = -1, y2 = -Infinity, m2 = -1, s2 = -1;
        idx.each(x, z, (y, mat, src, own, layer) => {
          if (own >= 0 || layer === DETAIL || y > v + 1.5 || y < v - 1.5) return;
          if (y > y1) {
            y2 = y1;
            m2 = m1;
            s2 = s1;
            y1 = y;
            m1 = mat;
            s1 = src;
            l1 = layer;
          } else if (y > y2) {
            y2 = y;
            m2 = mat;
            s2 = src;
          }
        });
        const k = j * nx + i;
        if (y1 < v) {
          // The drawn terrain is on top (or nothing is built).
          if (y1 > v - 0.3 && v - y1 > 0.002 && l1 === ITEMS) {
            // A street surface under the drawn terrain: it shows through.
            const sn = SRCS[s1];
            const bk = `${sn}|${Math.floor(x / 4)},${Math.floor(z / 4)}`;
            const e = thr.get(bk);
            if (e) {
              e.len++;
              if (v - y1 > e.v) Object.assign(e, { x, y: y1, z, v: v - y1 });
            } else thr.set(bk, { kind: 'terrain-through', src: sn, mat: MATS[m1], x, y: y1, z, v: v - y1, len: 1 });
            add('throughCells');
          }
          top[k] = v;
          tsrc[k] = -1;
          tlay[k] = -1;
          tmat[k] = -1;
          continue;
        }
        top[k] = y1;
        tsrc[k] = s1;
        tlay[k] = l1;
        tmat[k] = m1;
        // Double paving: a street surface laid over another build's floor (or under it) a few
        // centimetres apart: two roads, two kerb lines, patches where their outlines differ.
        if (s2 >= 0 && s2 !== s1 && y1 - y2 >= 0.002 && y1 - y2 < 0.15 && FLOOR.test(MATS[m1]) && FLOOR.test(MATS[m2]) && srcKind(SRCS[s1]) !== srcKind(SRCS[s2])) {
          let l2 = -1;
          idx.each(x, z, (y, _m, src, own, layer) => {
            if (src === s2 && Math.abs(y - y2) < 1e-4 && own < 0) l2 = layer;
          });
          if (l1 === ITEMS || l2 === ITEMS) {
            const pair = [srcKind(SRCS[s1]), srcKind(SRCS[s2])].sort().join(' + ');
            const nm = `${SRCS[s1]} over ${SRCS[s2]}`;
            const bk = `${nm}|${Math.floor(x / 8)},${Math.floor(z / 8)}`;
            const e = dbl.get(bk);
            if (e) e.len++;
            else dbl.set(bk, { kind: 'double-paving', src: SRCS[s1], mat: `${MATS[m1]} over ${MATS[m2]}`, x, y: y1, z, v: y1 - y2, len: 1, note: `${pair}: ${nm} (${(y1 - y2).toFixed(3)} m apart)` });
            add('doublePavingCells');
          }
        }
        if (l1 === ITEMS) add('streetCells');
        // Z-fighting: the next surface (or the drawn terrain) within 1.5 cm, of another material.
        // (Reversed float depth: only true coplanarity, a millimetre or two, flickers.)
        const near2 = y1 - y2 < 0.002 && m2 >= 0 && m2 !== m1;
        const nearT = y1 - v < 0.002;
        if ((near2 || nearT) && (l1 === ITEMS || (s2 >= 0 && SRCS[s2] && !SRCS[s2].startsWith('lm:') && !SRCS[s2].startsWith('block:')))) {
          const other = near2 ? `${SRCS[s2]}:${MATS[m2]}` : 'terrain';
          const pair = [`${srcKind(SRCS[s1])}:${MATS[m1]}`, near2 ? `${srcKind(SRCS[s2])}:${MATS[m2]}` : 'terrain'].sort().join(' | ');
          const bk = `${pair}|${Math.floor(x / 4)},${Math.floor(z / 4)}`;
          const e = zb.get(bk);
          if (e) e.len++;
          else zb.set(bk, { kind: 'zfight', src: SRCS[s1], mat: MATS[m1], x, y: y1, z, v: near2 ? y1 - y2 : y1 - v, len: 1, note: `${pair} (vs ${other})` });
          add('zfightCells');
        }
      }
    for (const e of zb.values()) findings.push(e);
    for (const e of thr.values()) findings.push(e);
    for (const e of dbl.values()) findings.push(e);
    // Lips: a step between neighbouring raster cells of different builds, where one is a street surface
    // and the ground is level-ish on both sides (a ramp is not a lip).
    const lb = new Map<string, Finding>();
    for (let j = 1; j < nz - 2; j++)
      for (let i = 1; i < nx - 2; i++) {
        const k = j * nx + i;
        for (const dir of [1, nx]) {
          const o = k + dir;
          const sa = tsrc[k], sb = tsrc[o];
          if (sa === sb) continue;
          const la = tlay[k], lb2 = tlay[o];
          if (la !== ITEMS && lb2 !== ITEMS) continue;
          // Between floors only (a plinth, a podium or a step of travertine is built to stand there).
          if ((tmat[k] >= 0 && !FLOOR.test(MATS[tmat[k]])) || (tmat[o] >= 0 && !FLOOR.test(MATS[tmat[o]]))) continue;
          const d = top[o] - top[k];
          const ad = Math.abs(d);
          if (ad < 0.03 || ad > 0.6) continue;
          const before = top[k] - top[k - dir], after = top[o + dir] - top[o];
          // Discontinuity beyond the local slope on either side.
          if (ad - Math.max(Math.abs(before), Math.abs(after)) < 0.03) continue;
          if (Math.sign(before) === Math.sign(d) && Math.abs(before) > ad * 0.6) continue;
          const na = sa < 0 ? 'terrain' : SRCS[sa], nb = sb < 0 ? 'terrain' : SRCS[sb];
          const hiS = d > 0 ? nb : na, loS = d > 0 ? na : nb;
          const x = x0 + (i + 0.5 + (dir === 1 ? 0.5 : 0)) * C, z = z0 + (j + 0.5 + (dir === 1 ? 0 : 0.5)) * C;
          const pair = `${srcKind(hiS)} over ${srcKind(loS)}`;
          const bk = `${hiS}|${loS}|${Math.floor(x / 4)},${Math.floor(z / 4)}`;
          const e = lb.get(bk);
          if (e) {
            e.len++;
            if (ad > e.v) Object.assign(e, { x, z, y: Math.max(top[k], top[o]), v: ad });
          } else lb.set(bk, { kind: 'lip', src: hiS, x, y: Math.max(top[k], top[o]), z, v: ad, len: 1, note: `${pair} (${hiS} | ${loS})` });
          add('lipCells');
          if (ad >= 0.05) add('lipCells05');
          if (ad >= 0.12) add('lipCells12');
          if (ad >= 0.3) add('lipCells30');
        }
      }
    for (const e of lb.values()) findings.push(e);
  }

  // ---- 3. props: city furniture (this cell's detail), block props in the cell, landmark prop bases
  {
    const checkProp = (pr: PropRec, layer: string, others: PropRec[]) => {
      if (!inCell(pr.base[0], pr.base[2])) return;
      if (/torch|bracket|oil_lamp|awning|sign|hang|shelf|garland|wreath|lantern|banner|sconce|velum/.test(pr.kind)) return;
      add(`props:${layer}`);
      const f = pr.feet;
      if (!f.length) return;
      let minGap = Infinity, maxGap = -Infinity, maxSink = 0, inFloor = 0;
      let at: [number, number, number] = pr.base;
      for (let i = 0; i < f.length; i += 3) {
        const fx = f[i], fy = f[i + 1], fz = f[i + 2];
        // The highest built surface under the foot (not the prop's own), and the drawn terrain.
        let built = -Infinity;
        idx.each(fx, fz, (y, _m, _s, own) => {
          if (own !== pr.id && y <= fy + 0.12 && y > built) built = y;
        });
        const v = V(fx, fz);
        // A prop on a floor stands on it, even where the hill rises through the floor (that is the
        // building's fault, counted apart).
        const onFloor = built > fy - 0.3;
        if (onFloor && v > built + 0.05) inFloor++;
        const g = onFloor ? built : Math.max(v, built);
        const gap = fy - g;
        minGap = Math.min(minGap, gap);
        if (gap > maxGap) {
          maxGap = gap;
          at = [fx, fy, fz];
        }
        maxSink = Math.max(maxSink, -gap);
      }
      if (inFloor) add('propsTerrainThroughFloor');
      const src = pr.src || layer;
      // Resting on another prop (an amphora in a rack, a basket on a crate: round or barred tops).
      const onProp = () => others.some((q) => q !== pr && Math.hypot(q.base[0] - pr.base[0], q.base[2] - pr.base[2]) < 0.9 && q.base[1] < pr.base[1] - 0.02 && q.base[1] > pr.base[1] - 1.3);
      if (minGap > 0.03) {
        if (onProp()) add('propsOnProps');
        else {
          add('propsFloating');
          findings.push({ kind: 'prop-floating', src, mat: pr.kind, x: pr.base[0], y: pr.base[1], z: pr.base[2], v: minGap, len: 1, note: `${layer} ${pr.kind}: no foot touches (lowest ${minGap.toFixed(2)} m, highest foot ${maxGap.toFixed(2)} m)` });
        }
      } else if (maxGap > 0.08) {
        add('propsFootInAir');
        findings.push({ kind: 'prop-foot-in-air', src, mat: pr.kind, x: at[0], y: at[1], z: at[2], v: maxGap, len: 1, note: `${layer} ${pr.kind}: a foot ${maxGap.toFixed(2)} m over the ground` });
      }
      if (maxSink > 0.15) {
        add('propsSunk');
        findings.push({ kind: 'prop-sunk', src, mat: pr.kind, x: pr.base[0], y: pr.base[1], z: pr.base[2], v: maxSink, len: 1, note: `${layer} ${pr.kind}: a foot ${maxSink.toFixed(2)} m under the ground` });
      }
    };
    for (const pr of me.detail.props) checkProp(pr, 'street', me.detail.props);
    for (const b of blocks) for (const pr of b.props) checkProp(pr, 'block', b.props);
    // Fixtures: the furniture's own geometry that is not a prop (fountain basins, shrines, pens, stalls on
    // piazzas, awnings), by connected piece: its lowest vertices against the ground under them.
    const s = me.detail;
    const p = s.pos;
    const vid = new Map<string, number>();
    const parent: number[] = [];
    const find = (a: number): number => {
      while (parent[a] !== a) a = parent[a] = parent[parent[a]];
      return a;
    };
    const triV = new Int32Array(s.n * 3).fill(-1);
    for (let t = 0; t < s.n; t++) {
      if (s.owner[t] >= 0) continue;
      for (let k = 0; k < 3; k++) {
        const i = t * 9 + k * 3;
        const kk = `${Math.round(p[i] * 200)},${Math.round(p[i + 1] * 200)},${Math.round(p[i + 2] * 200)}`;
        let id = vid.get(kk);
        if (id === undefined) {
          vid.set(kk, (id = parent.length));
          parent.push(id);
        }
        triV[t * 3 + k] = id;
      }
      const a = find(triV[t * 3]);
      for (let k = 1; k < 3; k++) {
        const b = find(triV[t * 3 + k]);
        if (a !== b) parent[b] = a;
      }
    }
    const comps = new Map<number, { minY: number; tris: number[]; src: number; mat: number }>();
    for (let t = 0; t < s.n; t++) {
      if (triV[t * 3] < 0) continue;
      const r = find(triV[t * 3]);
      const i = t * 9;
      const my = Math.min(p[i + 1], p[i + 4], p[i + 7]);
      const e = comps.get(r);
      if (e) {
        e.minY = Math.min(e.minY, my);
        e.tris.push(t);
      } else comps.set(r, { minY: my, tris: [t], src: s.src[t], mat: s.mat[t] });
    }
    for (const e of comps.values()) {
      const pts: number[] = [];
      for (const t of e.tris)
        for (let k = 0; k < 3; k++) {
          const i = t * 9 + k * 3;
          if (p[i + 1] <= e.minY + 0.03) pts.push(p[i], p[i + 1], p[i + 2]);
        }
      if (!pts.length || !inCell(pts[0], pts[2])) continue;
      // Balconies (wood_dark) and awnings (fabric_*) are held up by the building, not the ground: skipped (G0 tool fix).
      if (/^(wood_dark|fabric)/.test(MATS[e.mat] ?? '')) {
        add('fixturesBalconyAwning');
        continue;
      }
      let minGap = Infinity, maxGap = -Infinity, maxSink = 0, at = [pts[0], pts[1], pts[2]];
      for (let i = 0; i < pts.length; i += 3) {
        const g = groundAt(pts[i], pts[i + 2], pts[i + 1] + 0.12);
        const gap = pts[i + 1] - g;
        minGap = Math.min(minGap, gap);
        if (gap > maxGap) {
          maxGap = gap;
          at = [pts[i], pts[i + 1], pts[i + 2]];
        }
        maxSink = Math.max(maxSink, -gap);
      }
      // Pieces held up by others (rails on posts, roofs on poles) stand well clear of the ground.
      if (minGap > 0.35) continue;
      add('fixtures');
      const src = SRCS[e.src];
      if (minGap > 0.03) {
        add('fixturesFloating');
        findings.push({ kind: 'fixture-floating', src, mat: MATS[e.mat], x: at[0], y: at[1], z: at[2], v: minGap, len: 1, note: `nothing of it touches (lowest ${minGap.toFixed(2)}, highest ${maxGap.toFixed(2)} m)` });
      } else if (maxGap > 1.5) {
        add('fixturesUpperLevel'); // a balcony, gallery or awning frame: held up by the building, not a fit defect
      } else if (maxGap > 0.08) {
        add('fixturesEdgeInAir');
        findings.push({ kind: 'fixture-edge-in-air', src, mat: MATS[e.mat], x: at[0], y: at[1], z: at[2], v: maxGap, len: 1, note: `its base stands ${maxGap.toFixed(2)} m over the ground at one side` });
      }
    }
    // Landmark props: base point only (their geometry is not recorded).
    for (const lp of landmarkProps) {
      if (!inCell(lp.x, lp.z)) continue;
      if (/torch|bracket|oil_lamp|awning|sign|hang|shelf|garland|wreath|lantern|banner|sconce|velum/.test(lp.kind)) continue;
      add('props:landmark');
      const g = groundAt(lp.x, lp.z, lp.y + 0.12);
      const gap = lp.y - g;
      // A base more than 1.5 m up stands on an upper floor or terrace the face records do not hold: counted, not reported.
      if (gap > 1.5) {
        add('lmPropsUpperLevel');
      } else if (gap > 0.06) {
        add('lmPropsFloating');
        findings.push({ kind: 'prop-floating', src: `lm:${lp.name}`, mat: lp.kind, x: lp.x, y: lp.y, z: lp.z, v: gap, len: 1, note: `landmark ${lp.kind} (${lp.src}): base ${gap.toFixed(2)} m over the ground` });
      } else if (gap < -0.15 && -gap < 2) {
        add('lmPropsSunk');
        findings.push({ kind: 'prop-sunk', src: `lm:${lp.name}`, mat: lp.kind, x: lp.x, y: lp.y, z: lp.z, v: -gap, len: 1, note: `landmark ${lp.kind} (${lp.src}): base ${(-gap).toFixed(2)} m under the ground` });
      }
    }
  }

  // ---- 4. the terrain dressing's kerbstones in this cell
  {
    for (const k of kerbstones) {
      if (!inCell(k.x, k.z)) continue;
      add('kerbstones');
      const c = k.corners;
      let maxGap = -Infinity, minGap = Infinity;
      let at = [k.x, 0, k.z];
      // Bottom corners are the first four (y = min).
      for (let i = 0; i < 12; i += 3) {
        const g = groundAt(c[i], c[i + 2], c[i + 1] + 0.02);
        const gap = c[i + 1] - g;
        minGap = Math.min(minGap, gap);
        if (gap > maxGap) {
          maxGap = gap;
          at = [c[i], c[i + 1], c[i + 2]];
        }
      }
      // Its top against the street surfaces round it: a kerb standing in (or buried under) city paving.
      let paved = -Infinity, pavedSrc = -1;
      for (const [dx, dz] of [[0, 0], [0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]])
        idx.each(k.x + dx, k.z + dz, (y, _m, s, _o, layer) => {
          if (layer === ITEMS && y > paved) {
            paved = y;
            pavedSrc = s;
          }
        });
      const midY = (c[1] + c[13]) / 2;
      if (minGap > 0.03) {
        add('kerbstonesFloating');
        findings.push({ kind: 'kerbstone-floating', src: 'dress:kerbs', mat: 'travertine', x: at[0], y: at[1], z: at[2], v: minGap, len: 2.4, note: `whole kerbstone ${minGap.toFixed(2)}-${maxGap.toFixed(2)} m over the ground` });
      } else if (maxGap > 0.05) {
        add('kerbstonesEndInAir');
        findings.push({ kind: 'kerbstone-end-in-air', src: 'dress:kerbs', mat: 'travertine', x: at[0], y: at[1], z: at[2], v: maxGap, len: 2.4, note: `one end ${maxGap.toFixed(2)} m over the ground` });
      }
      if (paved > -Infinity) {
        add('kerbstonesOnCityPaving');
        const stick = k.top - paved;
        findings.push({ kind: 'kerbstone-in-paving', src: SRCS[pavedSrc], mat: 'travertine', x: k.x, y: midY, z: k.z, v: stick, len: 2.4, note: `dressing kerbstone on a city street surface (${srcKind(SRCS[pavedSrc])}); top ${stick.toFixed(2)} m over it` });
      }
    }
  }

  const maxF = o.maxFindings ?? 400;
  findings.sort((a, b) => b.v * Math.sqrt(b.len) - a.v * Math.sqrt(a.len));
  const out = findings.slice(0, maxF).map((f) => ({ ...f, x: +f.x.toFixed(2), y: +f.y.toFixed(2), z: +f.z.toFixed(2), v: +f.v.toFixed(3), len: +f.len.toFixed(2), place: placeOf(f.x, f.z) }));
  const r = {
    key,
    ms: Math.round(performance.now() - t0),
    tally,
    bySrc,
    dropped: Math.max(0, findings.length - maxF),
    findings: out,
    idx: idx.size,
    cached: { cells: cellCache.size, blocks: blockCache.size },
    lmSrc: lmSrc.size,
  };
  return r;
}

/** Spot check: every surface over (x, z) (city cell, blocks, landmarks) with its build, and the ground as drawn / as walked. */
export function probe(x: number, z: number) {
  const out: { y: number; mat: string; src: string; layer: number }[] = [];
  const idx = new UpIndex(x - 1, z - 1, x + 1, z + 1);
  const c = cellRecs.find((r) => x >= r.bounds.minX && x < r.bounds.maxX && z >= r.bounds.minZ && z < r.bounds.maxZ);
  const d = c && cellData(c.work.key);
  if (d) {
    idx.addSoup(d.items);
    idx.addSoup(d.detail);
  }
  for (const r of blockRecs) {
    const [bx, bz] = r.blk.centroid;
    if (Math.hypot(bx - x, bz - z) < r.blk.radius + 2) idx.addSoup(blockData(r));
  }
  for (const f of landmarkSets) {
    const [bx0, bx1, bz0, bz1] = f.box;
    if (bx1 < x - 1 || bx0 > x + 1 || bz1 < z - 1 || bz0 > z + 1) continue;
    const mi = matId(f.mat), si = srcId(`lm:${f.name}`);
    for (let i = 0; i + 8 < f.world.length; i += 9) idx.add(f.world, i, mi, si, -1, LANDMARK);
  }
  idx.each(x, z, (y, m, s, _o, layer) => out.push({ y: +y.toFixed(3), mat: MATS[m], src: SRCS[s], layer }));
  return { visible: +V(x, z).toFixed(3), physics: +P(x, z).toFixed(3), surfaces: out.sort((a, b) => b.y - a.y).slice(0, 30) };
}

export function stats() {
  return { mats: MATS.length, srcs: SRCS.length, props: nextProp, cells: cellCache.size, blocks: blockCache.size };
}

if (typeof window !== 'undefined') (window as unknown as { __streetFit: unknown }).__streetFit = { init, sweepCell, visibleAt, placeOf, probe, stats, srcKind };
