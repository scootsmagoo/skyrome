/**
 * Far stand-ins for city blocks: one cheap box with a hip or gable tile roof per lot of the block's
 * lot plan (the same `planLots` the CityBlockFiller uses, so the massing matches the detailed
 * buildings), plus the block's yard surface, as flat-coloured triangles (≈ 16 per building).
 * Heights and wall finishes replay the filler's and the insula generator's seeded choices, so the
 * swap to the detailed block barely shows. Also: where yard trees go (outside every lot).
 */
import * as THREE from 'three';
import { Rng } from '../../core/Rng';
import { planLots, type FillOptions, type LotPlan } from '../../arch/fabric/blockFiller';
import { MAX_BUILDING_HEIGHT } from '../../arch/fabric/insula';
import { obbCorners, pointInOBB, polygonContainsOBB, type OBB } from '../../arch/fabric/polygon';
import type { Polygon } from '../../arch/fabric/types';
import { MATERIAL_BASE, type MaterialId } from '../../gfx/materialIds';
import type { PlanBlock } from './plan';
import { pointInPoly, polyBounds, type Pt } from './raster';
import { blockTorches, type Torch } from './life';

export type HeightFn = (x: number, z: number) => number;

/** Fill options shared by the far massing and the detailed block (same seed → same lots). */
export function blockFillOptions(blk: PlanBlock, heightAt: HeightFn, trees: Pt[] = []): FillOptions {
  const avoid: Polygon[] = blk.holes.map((h) => h.map((p) => [p[0], p[1]] as [number, number]));
  // Tree pits: the yard surface and yard props keep clear of the planted trees.
  for (const [x, z] of trees) avoid.push([[x - 0.9, z - 0.9], [x + 0.9, z - 0.9], [x + 0.9, z + 0.9], [x - 0.9, z + 0.9]]);
  return {
    heightAt,
    density: blk.density,
    wealth: blk.wealth,
    seed: blk.seed,
    id: `${blk.id}:`,
    sidewalkHeight: blk.sidewalk,
    frontEdges: blk.frontEdges,
    maxStoreys: blk.maxStoreys,
    allowHorrea: blk.allowHorrea,
    yard: blk.yard,
    avoid,
  };
}

export interface LotMass {
  obb: OBB;
  /** Walls with the window pattern: front, right, back, left. */
  windows: [boolean, boolean, boolean, boolean];
  floorY: number;
  base: number;
  eave: number;
  roof: 'hip' | 'gable';
  wall: MaterialId;
}

const storeyH = (k: number) => 3.05 - 0.08 * Math.max(0, k - 2);

/** Replays the filler's / generators' seeded choices for a lot's height and wall finish. */
export function lotMass(p: LotPlan, blk: PlanBlock, H: HeightFn): LotMass | null {
  if (p.kind === 'alley' || p.kind === 'piazza') return null;
  const { obb } = p;
  const at = (lx: number, lz: number): Pt => [obb.c[0] + obb.u[0] * lx + obb.v[0] * lz, obb.c[1] + obb.u[1] * lx + obb.v[1] * lz];
  const sw = blk.sidewalk[p.edge] ?? 0.12;
  let floorY = -Infinity;
  for (let i = 0; i <= 4; i++) {
    const [x, z] = at(-obb.hu + (2 * obb.hu * i) / 4, -obb.hv - 0.4);
    floorY = Math.max(floorY, H(x, z) + sw + 0.06);
  }
  let base = floorY;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) {
    const [x, z] = at(sx * obb.hu, sz * obb.hv);
    base = Math.min(base, H(x, z) - 0.4);
  }
  const lrng = new Rng(p.seed);
  if (p.kind === 'insula' || p.kind === 'shops') {
    let storeys = 2, wealth = blk.wealth;
    if (p.kind === 'insula') {
      const maxS = blk.maxStoreys;
      storeys = Math.max(3, Math.min(maxS, Math.round(2.6 + blk.density * 2.2 + (1 - blk.wealth) * 1.2 + lrng.range(-0.6, 0.8))));
      wealth = Math.min(1, Math.max(0, blk.wealth + lrng.range(-0.15, 0.15)));
    }
    const rng = new Rng(p.seed);
    const G = rng.range(4.1, 4.5);
    const floorAt = (k: number) => { let y = G; for (let j = 1; j < k; j++) y += storeyH(j); return y; };
    let n = Math.max(2, Math.min(6, storeys));
    while (n > 2 && floorAt(n) + 0.3 > MAX_BUILDING_HEIGHT) n--;
    const brick = rng.chance(0.6 - 0.25 * wealth);
    const wall: MaterialId = brick ? 'brick' : rng.weighted<MaterialId>([['plaster_cream', 3], ['plaster_ochre', 2], ['plaster_white', 1.5 + wealth], ['plaster_red', 0.4]]);
    return { obb: p.obb, windows: [true, !p.party.right, !p.party.back, !p.party.left], floorY, base, eave: floorY + floorAt(n), roof: p.kind === 'shops' ? 'gable' : 'hip', wall };
  }
  if (p.kind === 'domus') {
    const r = new Rng(p.seed ^ 0x9e37);
    return { obb: p.obb, windows: [false, false, false, false], floorY, base, eave: floorY + (r.chance(0.5) ? 7.2 : 4.7), roof: 'hip', wall: r.chance(0.7) ? 'plaster_white' : 'plaster_cream' };
  }
  return { obb: p.obb, windows: [false, false, false, false], floorY, base, eave: floorY + 8.8, roof: 'hip', wall: 'brick' };
}

/** Yard trees: points inside the block, clear of every lot (and of each other). */
export function yardTrees(blk: PlanBlock, lots: LotPlan[], rng: Rng, max: number): Pt[] {
  const out: Pt[] = [];
  const bb = polyBounds(blk.outline);
  const solid = lots.filter((p) => p.kind !== 'alley');
  const inside = (x: number, z: number, r: number) =>
    pointInPoly(x, z, blk.outline) && [[r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dz]) => pointInPoly(x + dx, z + dz, blk.outline)) && !blk.holes.some((h) => pointInPoly(x, z, h));
  for (let i = 0; i < 60 && out.length < max; i++) {
    const x = rng.range(bb.minX, bb.maxX), z = rng.range(bb.minZ, bb.maxZ);
    if (!inside(x, z, 3)) continue;
    if (solid.some((p) => pointInOBB([x, z], p.obb as OBB, 3.2))) continue;
    if (out.some(([ox, oz]) => Math.hypot(ox - x, oz - z) < 6)) continue;
    out.push([x, z]);
  }
  return out;
}

/** A building in the block's interior (behind the street frontage), reached through the yards. */
export interface BackLot {
  id: string;
  obb: OBB;
  /** rotation.y of the building (its front, local −z, faces the block's main street edge). */
  rotationY: number;
  width: number;
  depth: number;
  floorY: number;
  storeys: number;
  seed: number;
  mass: LotMass;
}

/**
 * Fill the yard space the filler leaves behind the frontage lots with back insulae (Rome's blocks
 * were built up almost solid): oriented rectangles inside the outline, ≥ 2.5 m clear of every lot
 * (alleys and light wells stay open) and of each other.
 */
export function backLots(blk: PlanBlock, lots: LotPlan[], H: HeightFn): BackLot[] {
  const out: BackLot[] = [];
  const max = Math.floor(blk.area / 300);
  if (max < 1 || blk.density < 0.45) return out;
  // Frame along the longest outline edge.
  let best = 0, bl = 0;
  for (let k = 0; k < blk.outline.length; k++) {
    const a = blk.outline[k], b = blk.outline[(k + 1) % blk.outline.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > bl) { bl = l; best = k; }
  }
  const a = blk.outline[best], b = blk.outline[(best + 1) % blk.outline.length];
  const u: Pt = [(b[0] - a[0]) / bl, (b[1] - a[1]) / bl], v: Pt = [-u[1], u[0]];
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const p of blk.outline) {
    const pu = p[0] * u[0] + p[1] * u[1], pv = p[0] * v[0] + p[1] * v[1];
    u0 = Math.min(u0, pu); u1 = Math.max(u1, pu); v0 = Math.min(v0, pv); v1 = Math.max(v1, pv);
  }
  // Occupancy grid in the (u, v) frame: free = inside the outline, ≥ 2.5 m from every lot, not in a hole.
  const cs = 1.5;
  const gu = Math.max(1, Math.ceil((u1 - u0) / cs)), gv = Math.max(1, Math.ceil((v1 - v0) / cs));
  const free = new Uint8Array(gu * gv);
  const W = (pu: number, pv: number): Pt => [u[0] * pu + v[0] * pv, u[1] * pu + v[1] * pv];
  // Inside: scanline fill of the outline (in the u, v frame), eroded by one cell so rectangles stay
  // clear of the property line; then cut out the lots (+2.5 m) and the holes.
  const uvOf = (p: readonly number[]): Pt => [(p[0] * u[0] + p[1] * u[1] - u0) / cs, (p[0] * v[0] + p[1] * v[1] - v0) / cs];
  const ring = blk.outline.map(uvOf);
  const xs: number[] = [];
  for (let j = 0; j < gv; j++) {
    const y = j + 0.5;
    xs.length = 0;
    for (let k = 0, m = ring.length - 1; k < ring.length; m = k++) {
      const [ax, ay] = ring[m], [bx, by] = ring[k];
      if ((ay <= y && by > y) || (by <= y && ay > y)) xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let i = Math.max(0, Math.ceil(xs[k] - 0.5)); i <= Math.min(gu - 1, Math.floor(xs[k + 1] - 0.5)); i++) free[j * gu + i] = 1;
    }
  }
  const eroded = new Uint8Array(free);
  for (let j = 0; j < gv; j++) for (let i = 0; i < gu; i++) {
    const k = j * gu + i;
    if (!free[k]) continue;
    if (i === 0 || j === 0 || i === gu - 1 || j === gv - 1 || !free[k - 1] || !free[k + 1] || !free[k - gu] || !free[k + gu]) eroded[k] = 0;
  }
  free.set(eroded);
  const cutOBB = (o: OBB, pad: number) => {
    const r = Math.hypot(o.hu, o.hv) + pad;
    const [ci, cj] = uvOf(o.c);
    for (let j = Math.max(0, Math.floor(cj - r / cs)); j <= Math.min(gv - 1, Math.ceil(cj + r / cs)); j++)
      for (let i = Math.max(0, Math.floor(ci - r / cs)); i <= Math.min(gu - 1, Math.ceil(ci + r / cs)); i++) {
        if (!free[j * gu + i]) continue;
        if (pointInOBB(W(u0 + (i + 0.5) * cs, v0 + (j + 0.5) * cs), o, pad)) free[j * gu + i] = 0;
      }
  };
  for (const l of lots) cutOBB(l.obb, l.kind === 'alley' ? 0.5 : 1.6);
  for (const h of blk.holes) {
    const bb = polyBounds(h);
    const pad = 1;
    for (let j = 0; j < gv; j++) for (let i = 0; i < gu; i++) {
      if (!free[j * gu + i]) continue;
      const [x, z] = W(u0 + (i + 0.5) * cs, v0 + (j + 0.5) * cs);
      if (x < bb.minX - pad || x > bb.maxX + pad || z < bb.minZ - pad || z > bb.maxZ + pad) continue;
      if (pointInPoly(x, z, h)) free[j * gu + i] = 0;
    }
  }
  // Summed-area table of occupied cells.
  const sat = new Int32Array((gu + 1) * (gv + 1));
  const rebuild = () => {
    for (let j = 0; j < gv; j++) for (let i = 0; i < gu; i++) {
      sat[(j + 1) * (gu + 1) + i + 1] = (free[j * gu + i] ? 0 : 1) + sat[j * (gu + 1) + i + 1] + sat[(j + 1) * (gu + 1) + i] - sat[j * (gu + 1) + i];
    }
  };
  rebuild();
  const occupied = (i0: number, j0: number, ni: number, nj: number) =>
    sat[(j0 + nj) * (gu + 1) + i0 + ni] - sat[j0 * (gu + 1) + i0 + ni] - sat[(j0 + nj) * (gu + 1) + i0] + sat[j0 * (gu + 1) + i0];
  const rng = new Rng(blk.seed ^ 0xbac4);
  const sizes: [number, number][] = [[18, 15], [15, 13], [13, 11], [11, 10], [9.5, 8.5], [8, 7]];
  for (const [w, d] of sizes) {
    const ni = Math.ceil(w / cs), nj = Math.ceil(d / cs);
    for (let j0 = 0; j0 + nj <= gv && out.length < max; j0++) {
      for (let i0 = 0; i0 + ni <= gu && out.length < max; i0++) {
        if (occupied(i0, j0, ni, nj)) continue;
        const cu = u0 + (i0 + ni / 2) * cs, cv = v0 + (j0 + nj / 2) * cs;
        const c = W(cu, cv);
        const o: OBB = { c, u, v, hu: w / 2, hv: d / 2 };
        // The eroded raster can still let a corner poke out of a concave outline: check exactly.
        if (!polygonContainsOBB(blk.outline as Polygon, o, 0.05)) continue;
        const seed = (blk.seed ^ Math.imul(out.length + 1, 0x9e3779b1)) >>> 0;
        let floorY = -Infinity, base = Infinity;
        for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) {
          const x = c[0] + u[0] * su * w / 2 + v[0] * sv * d / 2, z = c[1] + u[1] * su * w / 2 + v[1] * sv * d / 2;
          const y = H(x, z);
          floorY = Math.max(floorY, y + 0.08);
          base = Math.min(base, y - 0.4);
        }
        const storeys = Math.max(3, Math.min(blk.maxStoreys, Math.round(2.4 + blk.density * 2 + rng.range(-0.5, 0.7))));
        const r2 = new Rng(seed);
        const G = r2.range(4.1, 4.5);
        let n = storeys;
        const floorAt = (k: number) => { let y = G; for (let jj = 1; jj < k; jj++) y += storeyH(jj); return y; };
        while (n > 2 && floorAt(n) + 0.3 > MAX_BUILDING_HEIGHT) n--;
        const brick = r2.chance(0.6 - 0.25 * blk.wealth);
        const wall: MaterialId = brick ? 'brick' : r2.weighted<MaterialId>([['plaster_cream', 3], ['plaster_ochre', 2], ['plaster_white', 1.5 + blk.wealth], ['plaster_red', 0.4]]);
        out.push({
          id: `${blk.id}:back${out.length}`, obb: o, rotationY: Math.atan2(v[0], v[1]), width: w, depth: d, floorY, storeys: n, seed,
          mass: { obb: o, windows: [true, true, true, true], floorY, base, eave: floorY + floorAt(n), roof: 'hip', wall },
        });
        // Keep ~1.5 m (1 cell) of light and passage around it.
        for (let j = Math.max(0, j0 - 1); j < Math.min(gv, j0 + nj + 1); j++) for (let i = Math.max(0, i0 - 1); i < Math.min(gu, i0 + ni + 1); i++) free[j * gu + i] = 0;
        rebuild();
      }
    }
  }
  return out;
}

export interface BlockLayout {
  opts: FillOptions;
  lots: LotPlan[];
  back: BackLot[];
  masses: LotMass[];
  trees: Pt[];
  /** Wall torches on the shop fronts (life.ts). */
  torches: Torch[];
}

/** Lot plan, back buildings, massing and yard trees of a built block. */
export function layoutBlock(blk: PlanBlock, H: HeightFn): BlockLayout {
  const base = blockFillOptions(blk, H);
  const lots = planLots(blk.outline as Polygon, base);
  const masses: LotMass[] = [];
  for (const p of lots) {
    const m = lotMass(p, blk, H);
    if (m) masses.push(m);
  }
  const back = backLots(blk, lots, H);
  for (const bl of back) masses.push(bl.mass);
  const rng = new Rng(blk.seed ^ 0x7ee5);
  const occupied: LotPlan[] = [...lots, ...back.map((bl) => ({ ...lots[0], kind: 'insula' as const, obb: bl.obb }))];
  const trees = yardTrees(blk, occupied, rng, Math.min(5, Math.floor(blk.area / 900)));
  // The filler keeps its yard surface and yard props off the back buildings and the tree pits.
  const opts = blockFillOptions(blk, H, trees);
  for (const bl of back) opts.avoid!.push(obbCorners({ ...bl.obb, hu: bl.obb.hu + 0.3, hv: bl.obb.hv + 0.3 }) as Polygon);
  return { opts, lots, back, masses, trees, torches: blockTorches(blk, lots, H) };
}

// ---------------------------------------------------------------- geometry

/** Linear-space RGB bytes of a material's palette colour, with a little seeded variation. */
function colorOf(id: MaterialId, vary: number, out: number[]) {
  const c = new THREE.Color(MATERIAL_BASE[id].color); // hex is sRGB → stored linear
  out[0] = Math.max(0, Math.min(255, Math.round(c.r * 255 * vary)));
  out[1] = Math.max(0, Math.min(255, Math.round(c.g * 255 * vary)));
  out[2] = Math.max(0, Math.min(255, Math.round(c.b * 255 * vary)));
}

/** Growable flat-coloured triangle soup (position + RGBA8 colour, non-indexed). */
export class FlatSoup {
  pos: number[] = [];
  col: number[] = [];
  /** Facade coordinates per vertex: (metres along the wall, metres above the floor); y < 0 = plain. */
  fac: number[] = [];
  private c = [0, 0, 0];

  color(id: MaterialId, vary = 1) {
    colorOf(id, vary, this.c);
    return this;
  }

  tri(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, f?: number[]) {
    // Upward/outward winding is the caller's job (counter-clockwise seen from the outside).
    this.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    for (let k = 0; k < 3; k++) this.col.push(this.c[0], this.c[1], this.c[2], 255);
    if (f) this.fac.push(...f);
    else this.fac.push(0, -1, 0, -1, 0, -1);
  }

  quad(a: number[], b: number[], c: number[], d: number[], f?: [number[], number[], number[], number[]]) {
    this.tri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], f ? [...f[0], ...f[1], ...f[2]] : undefined);
    this.tri(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2], f ? [...f[0], ...f[2], ...f[3]] : undefined);
  }

  get empty() {
    return this.pos.length === 0;
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(this.col), 4, true));
    g.setAttribute('facade', new THREE.Float32BufferAttribute(this.fac, 2));
    return g;
  }
}

/** Box walls + roof for one lot. */
export function massLot(s: FlatSoup, m: LotMass, rng: Rng) {
  const { obb } = m;
  const P = (lx: number, lz: number, y: number) => [obb.c[0] + obb.u[0] * lx + obb.v[0] * lz, y, obb.c[1] + obb.u[1] * lx + obb.v[1] * lz];
  const a = obb.hu, b = obb.hv;
  const corners = [P(-a, -b, 0), P(a, -b, 0), P(a, b, 0), P(-a, b, 0)];
  s.color(m.wall, rng.range(0.9, 1.05));
  const lens = [2 * a, 2 * b, 2 * a, 2 * b];
  for (let k = 0; k < 4; k++) {
    const p = corners[k], q = corners[(k + 1) % 4];
    // Outward faces (front, right, back, left): the normal points away from the centre. Windowed
    // walls carry facade coordinates for the window pattern of the far material.
    const yb = m.base - m.floorY, ye = m.eave - m.floorY;
    const f: [number[], number[], number[], number[]] | undefined = m.windows[k] ? [[0, yb], [0, ye], [lens[k], ye], [lens[k], yb]] : undefined;
    s.quad([p[0], m.base, p[2]], [p[0], m.eave, p[2]], [q[0], m.eave, q[2]], [q[0], m.base, q[2]], f);
  }
  // Roof (22° hip or gable over the longer axis, 0.35 m eaves).
  const o = 0.35;
  const ra = a + o, rb = b + o;
  const e = m.eave - 0.05;
  s.color('roof_tile', rng.range(0.85, 1.08));
  const t = Math.tan((22 * Math.PI) / 180);
  const along = ra >= rb; // ridge along u
  const half = along ? rb : ra; // half span across the ridge
  const rise = half * t;
  const r = e + rise;
  if (along) {
    const rl = m.roof === 'gable' ? ra : ra - rb;
    const A = P(-ra, -rb, e), B = P(ra, -rb, e), C = P(ra, rb, e), D = P(-ra, rb, e);
    const R0 = P(-rl, 0, r), R1 = P(rl, 0, r);
    s.quad(A, R0, R1, B);
    s.quad(C, R1, R0, D);
    if (m.roof === 'hip') {
      s.tri(B[0], B[1], B[2], R1[0], R1[1], R1[2], C[0], C[1], C[2]);
      s.tri(D[0], D[1], D[2], R0[0], R0[1], R0[2], A[0], A[1], A[2]);
    } else {
      s.color(m.wall, 0.95);
      s.tri(B[0], B[1] - 0.02, B[2], R1[0], R1[1], R1[2], C[0], C[1] - 0.02, C[2]);
      s.tri(D[0], D[1] - 0.02, D[2], R0[0], R0[1], R0[2], A[0], A[1] - 0.02, A[2]);
    }
  } else {
    const rl = m.roof === 'gable' ? rb : rb - ra;
    const A = P(-ra, -rb, e), B = P(ra, -rb, e), C = P(ra, rb, e), D = P(-ra, rb, e);
    const R0 = P(0, -rl, r), R1 = P(0, rl, r);
    s.quad(B, R0, R1, C);
    s.quad(D, R1, R0, A);
    if (m.roof === 'hip') {
      s.tri(A[0], A[1], A[2], R0[0], R0[1], R0[2], B[0], B[1], B[2]);
      s.tri(C[0], C[1], C[2], R1[0], R1[1], R1[2], D[0], D[1], D[2]);
    } else {
      s.color(m.wall, 0.95);
      s.tri(A[0], A[1] - 0.02, A[2], R0[0], R0[1], R0[2], B[0], B[1] - 0.02, B[2]);
      s.tri(C[0], C[1] - 0.02, C[2], R1[0], R1[1], R1[2], D[0], D[1] - 0.02, D[2]);
    }
  }
}

/** A polygon draped over the terrain on a coarse grid (yards, gardens, far street ribbons). */
export function drapePolygon(s: FlatSoup, poly: readonly Pt[], H: HeightFn, lift: number, cell = 10) {
  const bb = polyBounds(poly);
  for (let x = bb.minX; x < bb.maxX - 1e-6; x += cell) {
    for (let z = bb.minZ; z < bb.maxZ - 1e-6; z += cell) {
      const x1 = Math.min(bb.maxX, x + cell), z1 = Math.min(bb.maxZ, z + cell);
      const corners: Pt[] = [[x, z], [x1, z], [x1, z1], [x, z1]];
      const piece = corners.every((c) => pointInPoly(c[0], c[1], poly as Pt[])) ? corners : clipToCell(poly, x, z, x1, z1);
      if (piece.length < 3) continue;
      const tris = THREE.ShapeUtils.triangulateShape(piece.map((p) => new THREE.Vector2(p[0], p[1])), []);
      for (const tr of tris) {
        const [p, q, r] = [piece[tr[0]], piece[tr[1]], piece[tr[2]]];
        const cr = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
        const [A, B, C] = cr > 0 ? [p, r, q] : [p, q, r];
        s.tri(A[0], H(A[0], A[1]) + lift, A[1], B[0], H(B[0], B[1]) + lift, B[1], C[0], H(C[0], C[1]) + lift, C[1]);
      }
    }
  }
}

/** A flat ribbon along a polyline (far streets). */
export function ribbon(s: FlatSoup, pts: readonly Pt[], width: number, H: HeightFn, lift: number) {
  const hw = width / 2;
  for (let k = 0; k + 1 < pts.length; k++) {
    const [ax, az] = pts[k], [bx, bz] = pts[k + 1];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 0.01) continue;
    const n = Math.max(1, Math.ceil(L / 8));
    const nx = -(bz - az) / L * hw, nz = (bx - ax) / L * hw;
    for (let j = 0; j < n; j++) {
      const t0 = j / n, t1 = (j + 1) / n;
      const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
      const p = [x0 - nx, H(x0 - nx, z0 - nz) + lift, z0 - nz], q = [x0 + nx, H(x0 + nx, z0 + nz) + lift, z0 + nz];
      const r = [x1 + nx, H(x1 + nx, z1 + nz) + lift, z1 + nz], u = [x1 - nx, H(x1 - nx, z1 - nz) + lift, z1 - nz];
      // Up-facing winding: right edge → left edge → ahead.
      s.quad(p, q, r, u);
    }
  }
}

function clipToCell(subject: readonly Pt[], x0: number, z0: number, x1: number, z1: number): Pt[] {
  let out = subject.slice() as Pt[];
  const edges: [(p: Pt) => boolean, (a: Pt, b: Pt) => Pt][] = [
    [(p) => p[0] >= x0, (a, c) => [x0, a[1] + ((c[1] - a[1]) * (x0 - a[0])) / (c[0] - a[0])]],
    [(p) => p[0] <= x1, (a, c) => [x1, a[1] + ((c[1] - a[1]) * (x1 - a[0])) / (c[0] - a[0])]],
    [(p) => p[1] >= z0, (a, c) => [a[0] + ((c[0] - a[0]) * (z0 - a[1])) / (c[1] - a[1]), z0]],
    [(p) => p[1] <= z1, (a, c) => [a[0] + ((c[0] - a[0]) * (z1 - a[1])) / (c[1] - a[1]), z1]],
  ];
  for (const [inside, cut] of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i], prev = input[(i + input.length - 1) % input.length];
      const ci = inside(cur), pi = inside(prev);
      if (ci) {
        if (!pi) out.push(cut(prev, cur));
        out.push(cur);
      } else if (pi) out.push(cut(prev, cur));
    }
    if (!out.length) break;
  }
  return out;
}

/** Far stand-in of a whole block: yard surface + every building's box and roof. */
export function blockFarGeometry(blk: PlanBlock, layout: BlockLayout | null, H: HeightFn): THREE.BufferGeometry {
  const s = new FlatSoup();
  const rng = new Rng(blk.seed ^ 0xfa12);
  // Gardens are the terrain's own grass; built blocks get their yard surface.
  if (blk.kind === 'built') {
    s.color(blk.yard === 'cobbles' ? 'dirt' : blk.yard, 0.95);
    drapePolygon(s, blk.outline, H, 0.25, 12);
  }
  if (layout) for (const m of layout.masses) massLot(s, m, rng);
  return s.geometry();
}
