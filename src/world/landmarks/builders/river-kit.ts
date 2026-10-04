/**
 * Shared helpers for the river-district landmarks (Forum Boarium, Forum Holitorium, Tiber Island,
 * Theatre of Marcellus, Circus Flaminius): local/atlas coordinate conversion, absolute heights
 * (water level, pad), neighbour footprints to keep clear of, spots, a gable roof, boats, cattle,
 * fences and a cheap far stand-in. No builders live here.
 */
import * as THREE from 'three';
import * as atlas from '../../../data/atlas';
import { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../gfx/materialIds';
import { UV_METERS } from '../../../gfx/textures/catalog';
import { T, makeGeometry, type V2 } from '../../../arch/common/geom';
import { temple, templeLayout, type TempleLayout, type TempleSpec } from '../../../arch/classical/temple';
import { entablatureDims } from '../../../arch/classical/orders';
import { inscriptionPanel } from '../../../arch/common/inscription';
import { Draw } from '../../../arch/fabric/draw';
import { pointInPolygon } from '../../../arch/fabric/polygon';
import type { Rng } from '../../../core/Rng';
import { bearingToRotationY } from '../../../core/math';
import { footprintPolygon, type Heightmap, type TerrainRiver } from '../../terrain/heightmap';
import { chain, resolveQuays, type ResolvedQuay } from '../../terrain/riverbanks';
import { QUAY, stationAt } from '../../water/quays';
import { bridgeLayoutFor } from '../../bridges';
import type { LandmarkBuilder, LandmarkContext, LandmarkData, Spot } from '../types';

export const builders: LandmarkBuilder[] = [];

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Absolute heights and coordinate conversion for a landmark's local frame (game metres). */
export interface RiverEnv {
  /** Game y of the local origin (the pad, or the terrain under the centre). */
  baseY: number;
  /** Tiber water level relative to the local origin. */
  waterY: number;
  /** River bed (≈ 4 m real below the water) relative to the local origin. */
  bedY: number;
  /** Atlas (real metres) → local game metres. */
  local(x: number, z: number): V2;
  /** Local game metres → world game metres. */
  world(lx: number, lz: number): V2;
  /** Real elevation (m ASL) → local y. */
  elev(asl: number): number;
}

export function riverEnv(ctx: LandmarkContext): RiverEnv {
  const { lm, S } = ctx;
  const gx = lm.center[0] * S;
  const gz = lm.center[1] * S;
  const hm = ctx.game.heightmap;
  const baseY = hm ? hm.heightAt(gx, gz) : (lm.baseElevation ?? 12) * S;
  const river = atlas.RIVERS[0];
  const waterAbs = hm && Number.isFinite(hm.waterLevelY) ? hm.waterLevelY : river.waterLevel * S;
  const rot = bearingToRotationY(lm.rotation);
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return {
    baseY,
    waterY: waterAbs - baseY,
    bedY: waterAbs - 4 * S - baseY,
    local(x, z) {
      const dx = x * S - gx;
      const dz = z * S - gz;
      // Inverse of world = R_y(rot)·local: x = x'cos − z'sin, z = x'sin + z'cos.
      return [dx * c - dz * s, dx * s + dz * c];
    },
    world(lx, lz) {
      return [gx + lx * c + lz * s, gz - lx * s + lz * c];
    },
    elev(asl) {
      return asl * S - baseY;
    },
  };
}

/** Footprint of an atlas landmark as a local polygon (game metres) in `ctx`'s frame. */
export function footprintLocal(env: RiverEnv, lm: Pick<LandmarkData, 'center' | 'rotation' | 'footprint'>, grow = 0): V2[] {
  return footprintPolygon(lm.center, lm.rotation, lm.footprint as never, grow).map(([x, z]) => env.local(x, z));
}

/**
 * Footprints (local, game metres, grown by `grow` real metres) of the other atlas landmarks whose
 * footprints come within `reach` real metres of this one — areas an open square must leave to
 * its neighbours.
 */
export function neighbourFootprints(ctx: LandmarkContext, env: RiverEnv, opts: { grow?: number; skip?: string[]; reach?: number } = {}): { id: string; poly: V2[] }[] {
  const self = ctx.lm;
  const r0 = radius(self);
  const out: { id: string; poly: V2[] }[] = [];
  for (const o of atlas.LANDMARKS) {
    if (o.id === self.id || opts.skip?.includes(o.id)) continue;
    if (o.siting === 'underground') continue;
    const d = Math.hypot(o.center[0] - self.center[0], o.center[1] - self.center[1]);
    if (d > r0 + radius(o) + (opts.reach ?? 0)) continue;
    out.push({ id: o.id, poly: footprintLocal(env, o, opts.grow ?? 0) });
  }
  return out;
}

function radius(lm: Pick<LandmarkData, 'center' | 'footprint'>): number {
  const fp = lm.footprint;
  if (fp.kind === 'rect') return Math.hypot(fp.w, fp.d) / 2;
  if (fp.kind === 'ellipse') return Math.max(fp.rx, fp.rz);
  if (fp.kind === 'circle') return fp.r;
  let r = 0;
  for (const [x, z] of fp.points) r = Math.max(r, Math.hypot(x - lm.center[0], z - lm.center[1]));
  return r;
}

/**
 * Atlas roads near this landmark as local corridors (one quad per segment, game metres), widened
 * by `extra` game metres each side: open squares leave them to the street builders.
 */
export function roadCorridors(ctx: LandmarkContext, env: RiverEnv, extra = 0.6): V2[][] {
  const self = ctx.lm;
  const r0 = radius(self) + 40;
  const out: V2[][] = [];
  for (const road of atlas.ROADS) {
    const half = (road.width * ctx.S) / 2 + extra;
    for (let i = 0; i < road.points.length - 1; i++) {
      const [ax, az] = road.points[i];
      const [bx, bz] = road.points[i + 1];
      // Segment-to-centre distance (real) as a cheap relevance test.
      const dx = bx - ax, dz = bz - az;
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((self.center[0] - ax) * dx + (self.center[1] - az) * dz) / l2));
      if (Math.hypot(ax + dx * t - self.center[0], az + dz * t - self.center[1]) > r0) continue;
      const a = env.local(ax, az);
      const c = env.local(bx, bz);
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
      const nx = (-(c[1] - a[1]) / len) * half, nz = ((c[0] - a[0]) / len) * half;
      const ux = ((c[0] - a[0]) / len) * half * 0.5, uz = ((c[1] - a[1]) / len) * half * 0.5;
      out.push([
        [a[0] - ux + nx, a[1] - uz + nz],
        [c[0] + ux + nx, c[1] + uz + nz],
        [c[0] + ux - nx, c[1] + uz - nz],
        [a[0] - ux - nx, a[1] - uz - nz],
      ]);
    }
  }
  return out;
}

/** True if (x, z) lies inside any of the polygons. */
export function insideAny(x: number, z: number, polys: readonly V2[][]): boolean {
  for (const p of polys) if (pointInPolygon([x, z], p)) return true;
  return false;
}

export function spot(id: string, kind: string, x: number, y: number, z: number, heading = 0): Spot {
  return { id, kind, position: new THREE.Vector3(x, y, z), heading };
}

/** Heading (model +Z convention) that looks from (x0, z0) towards (x1, z1). */
export function headingTo(x0: number, z0: number, x1: number, z1: number): number {
  return Math.atan2(x1 - x0, z1 - z0);
}

// ------------------------------------------------------------------ temples

/**
 * A kit temple centred on the atlas footprint (stairs included), sitting on y = 0, with a
 * foundation skirt wherever the ground falls away under it. Returns the layout and the z offset
 * that was applied (layout z + dz = local z).
 */
export function centredTemple(ctx: LandmarkContext, b: MeshBuilder, spec: TempleSpec): { L: TempleLayout; dz: number; front: number; back: number } {
  const L = templeLayout(spec);
  const front = L.podiumFront;
  const back = L.stylobate.z1;
  const dz = -(front + back) / 2;
  temple(b, spec, T(0, 0, dz));
  foundation(ctx, b, L.stylobate.x0, front + dz, L.stylobate.x1, back + dz, spec.podiumMaterial ?? 'travertine');
  return { L, dz, front: front + dz, back: back + dz };
}

/**
 * Like centredTemple, but picks the number of flank columns so the temple (stairs included) fits
 * the atlas footprint depth `depth` (game m) as closely as possible without exceeding it by more
 * than a metre.
 */
export function fittedTemple(ctx: LandmarkContext, b: MeshBuilder, spec: TempleSpec, depth: number) {
  let best = spec.sides ?? 7;
  let bestErr = Infinity;
  for (let sides = 4; sides <= 15; sides++) {
    const L = templeLayout({ ...spec, sides });
    const len = L.stylobate.z1 - L.podiumFront;
    const err = len > depth + 1 ? 1e3 + len : Math.abs(depth - len);
    if (err < bestErr) {
      bestErr = err;
      best = sides;
    }
  }
  return centredTemple(ctx, b, { ...spec, sides: best });
}

/** A dedication panel on the front frieze of a kit temple (lines latinized by the caller). */
export function friezeInscription(b: MeshBuilder, L: TempleLayout, dz: number, lines: string[], style: 'carved' | 'bronze' = 'bronze', ground = '#e9e4da') {
  const ent = entablatureDims(L.order, L.H);
  const y = L.podiumHeight + L.H + ent.architrave + ent.frieze / 2;
  const w = Math.min((L.entablature.x1 - L.entablature.x0) * 0.72, 9);
  const h = Math.max(0.3, ent.frieze * 0.8);
  inscriptionPanel(b, { lines, width: w, height: h, style, ground, sizes: lines.map(() => 1) }, T(0, y, L.entablature.z0 + dz - 0.05), { depth: 0.05 });
}

/** A masonry skirt from y = 0 down to the lowest ground under the rectangle (if it is lower). */
export function foundation(ctx: LandmarkContext, b: MeshBuilder, x0: number, z0: number, x1: number, z1: number, mat: MaterialId) {
  let lo = 0;
  for (let i = 0; i <= 4; i++)
    for (let j = 0; j <= 4; j++) lo = Math.min(lo, ctx.groundAt(x0 + ((x1 - x0) * i) / 4, z0 + ((z1 - z0) * j) / 4));
  if (lo > -0.05) return;
  const h = -lo + 0.3;
  b.box(mat, x1 - x0 + 0.1, h, z1 - z0 + 0.1, T((x0 + x1) / 2, -h / 2 + 0.02, (z0 + z1) / 2), { collide: true });
}

/** A Roman altar (ara) at 1:1: moulded base and crown, bolsters (pulvini), a fire on top. */
export function altar(d: Draw, w = 1.6, dpt = 1.1, h = 1.15, mat: MaterialId = 'marble', fire = true) {
  d.span(mat, -w / 2 - 0.12, 0, -dpt / 2 - 0.12, w / 2 + 0.12, 0.18, dpt / 2 + 0.12);
  d.span(mat, -w / 2, 0.18, -dpt / 2, w / 2, h - 0.2, dpt / 2);
  d.span(mat, -w / 2 - 0.08, h - 0.2, -dpt / 2 - 0.08, w / 2 + 0.08, h - 0.06, dpt / 2 + 0.08);
  for (const sx of [-1, 1]) d.cyl(mat, sx * (w / 2 - 0.12), h + 0.04, 0, 0.13, dpt + 0.1, 8, { rx: Math.PI / 2 });
  // Garland band (painted) and a patera on the front.
  d.span('stucco_painted', -w / 2 - 0.005, h * 0.55, -dpt / 2 - 0.006, w / 2 + 0.005, h * 0.62, dpt / 2 + 0.006, { shadow: false });
  if (fire) {
    d.span('plaster_dark', -w / 2 + 0.3, h - 0.06, -dpt / 2 + 0.2, w / 2 - 0.3, h + 0.02, dpt / 2 - 0.2, { shadow: false });
    // Embers and three flame tongues (stretched teardrops read better than a cone).
    d.span('glow_fire', -w / 2 + 0.36, h - 0.02, -dpt / 2 + 0.26, w / 2 - 0.36, h + 0.04, dpt / 2 - 0.26, { shadow: false });
    for (const [x, z, s] of [[0, 0, 1], [-0.16, 0.08, 0.7], [0.15, -0.06, 0.8]] as const) d.ellipsoid('glow_fire', x, h + 0.18 * s, z, 0.09 * s, 0.24 * s, 0.09 * s, { seg: [6, 5] });
  }
  d.solid(-w / 2 - 0.12, 0, -dpt / 2 - 0.12, w / 2 + 0.12, h, dpt / 2 + 0.12);
}

// ------------------------------------------------------------------ roofs

/**
 * Gable roof: two tiled slopes, ridge along z, eaves at `yEave` along x0/x1, own UVs (U along the
 * ridge, V down the slope), plus a dark underside and (high detail) imbrex ridges.
 */
export function gableRoof(b: MeshBuilder, x0: number, x1: number, z0: number, z1: number, yEave: number, pitchDeg: number, mat: MaterialId, hi: boolean, m?: THREE.Matrix4) {
  const pitch = (pitchDeg * Math.PI) / 180;
  const halfW = (x1 - x0) / 2;
  const xr = (x0 + x1) / 2;
  const rise = halfW * Math.tan(pitch);
  const slope = halfW / Math.cos(pitch);
  const L = (z1 - z0) / UV_METERS;
  const Sv = slope / UV_METERS;
  for (const side of [-1, 1]) {
    const xe = side < 0 ? x0 : x1;
    const A = [xr, yEave + rise, z0], B = [xr, yEave + rise, z1], C = [xe, yEave, z1], D = [xe, yEave, z0];
    const n = new THREE.Vector3(side * Math.sin(pitch), Math.cos(pitch), 0);
    const pos: number[] = [];
    const nor: number[] = [];
    const uv: number[] = [];
    const push = (p: number[], t: number[]) => {
      pos.push(p[0], p[1], p[2]);
      nor.push(n.x, n.y, n.z);
      uv.push(t[0], t[1]);
    };
    if (side > 0) {
      push(A, [0, 0]); push(B, [L, 0]); push(C, [L, Sv]);
      push(A, [0, 0]); push(C, [L, Sv]); push(D, [0, Sv]);
    } else {
      push(A, [0, 0]); push(D, [0, Sv]); push(C, [L, Sv]);
      push(A, [0, 0]); push(C, [L, Sv]); push(B, [L, 0]);
    }
    b.add(makeGeometry(pos, nor, uv), mat, m, { uv: 'keep' });
    const slab = new THREE.BoxGeometry(slope, 0.16, z1 - z0);
    slab.rotateZ(side * -pitch);
    slab.translate((xr + xe) / 2 - side * Math.sin(pitch) * 0.08, yEave + rise / 2 - 0.08 * Math.cos(pitch) - 0.005, (z0 + z1) / 2);
    b.add(slab, 'wood_dark', m, { castShadow: false });
    if (hi) {
      const nR = Math.floor((z1 - z0) / 0.5);
      const ridge = new THREE.CylinderGeometry(0.065, 0.065, slope, 4, 1, true);
      ridge.rotateZ(Math.PI / 2);
      ridge.rotateZ(side * -pitch);
      for (let k = 0; k < nR; k++) {
        const z = z0 + (k + 0.5) * ((z1 - z0) / nR);
        b.add(ridge.clone().translate((xr + xe) / 2, yEave + rise / 2 + 0.01, z), mat, m);
      }
    }
  }
  // Gable ends (triangles) so the roof void is closed.
  for (const z of [z0, z1]) {
    const tri = new THREE.BufferGeometry();
    const f = z === z0 ? -1 : 1;
    const p = f < 0 ? [x0, yEave, z, xr, yEave + rise, z, x1, yEave, z] : [x0, yEave, z, x1, yEave, z, xr, yEave + rise, z];
    tri.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    tri.computeVertexNormals();
    b.add(tri, 'wood_dark', m, { castShadow: false });
  }
  const cap = new THREE.CylinderGeometry(0.14, 0.14, z1 - z0, 6);
  cap.rotateX(Math.PI / 2);
  cap.translate(xr, yEave + rise + 0.05, (z0 + z1) / 2);
  b.add(cap, mat, m);
  return { rise };
}

/** Lean-to (shed) roof sloping down towards −z, from yHigh at z1 to yLow at z0. */
export function shedRoof(d: Draw, x0: number, x1: number, z0: number, z1: number, yLow: number, yHigh: number, mat: MaterialId = 'roof_tile') {
  const len = Math.hypot(z1 - z0, yHigh - yLow);
  const ang = Math.atan2(yHigh - yLow, z1 - z0);
  d.box(mat, (x0 + x1) / 2, (yLow + yHigh) / 2 + 0.06, (z0 + z1) / 2, x1 - x0, 0.12, len, { rx: -ang });
}

// ------------------------------------------------------------------ boats

export type BoatKind = 'caudicaria' | 'linter' | 'scapha';

/**
 * River craft at 1:1, built in a Draw frame with the waterline at y = 0, bow towards −z.
 * - 'caudicaria': the towed river barge of the Ostia run (≈ 15 × 4.4 m): flat hull, raised
 *   stern with a deckhouse, a towing mast forward, steering oars, a cargo of amphorae.
 * - 'scapha': a ship's boat / lighter (≈ 7 × 2.2 m) with oars.
 * - 'linter': a small punt (≈ 5 × 1.4 m).
 */
export function boat(d: Draw, kind: BoatKind, rng: Rng, hi = true): { floor: number; standZ: number } {
  const L = kind === 'caudicaria' ? 15 : kind === 'scapha' ? 7 : 5;
  const B = kind === 'caudicaria' ? 4.4 : kind === 'scapha' ? 2.2 : 1.4;
  const H = kind === 'caudicaria' ? 1.6 : kind === 'scapha' ? 0.9 : 0.6;
  const draft = kind === 'caudicaria' ? 0.7 : 0.3;
  const hullMat: MaterialId = kind === 'caudicaria' ? 'wood_dark' : 'wood';
  // Hull: a lofted shell from stations (z, half-beam at gunwale, half-beam at bottom, sheer y).
  const st: [number, number, number, number][] = [];
  const n = hi ? 9 : 5;
  for (let i = 0; i <= n; i++) {
    const t = i / n; // 0 bow → 1 stern
    const z = -L / 2 + t * L;
    const bowK = Math.min(1, t / 0.28);
    const sternK = Math.min(1, (1 - t) / 0.22);
    const k = Math.sqrt(Math.max(0.02, Math.min(bowK, sternK)));
    const half = (B / 2) * k;
    const bot = half * (kind === 'caudicaria' ? 0.82 : 0.55);
    const sheer = H - draft + (t < 0.15 ? (0.15 - t) * 2.2 : 0) + (t > 0.8 ? (t - 0.8) * (kind === 'caudicaria' ? 6 : 1.5) : 0);
    st.push([z, half, bot, sheer]);
  }
  const pos: number[] = [];
  const quad = (a: number[], b: number[], c: number[], e: number[]) => pos.push(...a, ...b, ...c, ...a, ...c, ...e);
  for (let i = 0; i < st.length - 1; i++) {
    const [z0, h0, b0, s0] = st[i];
    const [z1, h1, b1, s1] = st[i + 1];
    const y0 = -draft;
    // starboard (+x) and port (−x) sides, bottom
    quad([h0, s0, z0], [h1, s1, z1], [b1, y0, z1], [b0, y0, z0]);
    quad([-h0, s0, z0], [-b0, y0, z0], [-b1, y0, z1], [-h1, s1, z1]);
    quad([b0, y0, z0], [b1, y0, z1], [-b1, y0, z1], [-b0, y0, z0]);
  }
  d.tris(hullMat, pos);
  // Inside of the hull (darker) and the deck/floorboards just under the gunwale.
  const inner: number[] = [];
  for (let i = 0; i < st.length - 1; i++) {
    const [z0, h0, , s0] = st[i];
    const [z1, h1, , s1] = st[i + 1];
    const f0 = Math.min(s0, s1) - (kind === 'caudicaria' ? 0.35 : 0.4);
    inner.push(...[h0 * 0.94, f0, z0], ...[-h0 * 0.94, f0, z0], ...[-h1 * 0.94, f0, z1]);
    inner.push(...[h0 * 0.94, f0, z0], ...[-h1 * 0.94, f0, z1], ...[h1 * 0.94, f0, z1]);
  }
  d.tris('wood', inner);
  // Gunwale rails.
  for (let i = 0; i < st.length - 1; i++) {
    const [z0, h0, , s0] = st[i];
    const [z1, h1, , s1] = st[i + 1];
    for (const sx of [-1, 1]) d.rod('wood_painted', V(sx * h0, s0 + 0.04, z0), V(sx * h1, s1 + 0.04, z1), 0.06, 4);
  }
  if (kind === 'caudicaria') {
    // Stern deckhouse, towing mast with a yard-less rope to the bank, steering oars.
    const zs = L / 2 - 3;
    d.span('wood_dark', -1.3, 0.6, zs - 1.2, 1.3, 2.3, zs + 1.2);
    d.span('roof_tile', -1.45, 2.3, zs - 1.35, 1.45, 2.42, zs + 1.35);
    d.span('black', -0.45, 0.8, zs - 1.21, 0.45, 2.0, zs - 1.2, { shadow: false });
    d.rod('wood', V(0, 0.4, -L / 2 + 4), V(0, 7.5, -L / 2 + 4.2), 0.12, 6, { rTop: 0.08 });
    d.rod('fabric_ochre', V(0, 7.2, -L / 2 + 4.2), V(0, 0.9, -L / 2 - 1.5), 0.02, 3);
    for (const sx of [-1, 1]) d.rod('wood', V(sx * 1.6, 2.4, L / 2 - 1.2), V(sx * 2.3, -0.6, L / 2 + 1.6), 0.07, 5);
    d.box('wood', 0, 0.3, -L / 2 + 0.5, 0.25, 1.6, 0.25); // stem post
    // Cargo: rows of amphorae lying in the hold, a few sacks.
    const rows = hi ? 4 : 2;
    for (let r = 0; r < rows; r++) {
      for (let c = -2; c <= 2; c++) {
        const z = -L / 2 + 5.5 + r * 1.05;
        d.ellipsoid(rng.chance(0.5) ? 'terracotta' : 'plaster_ochre', c * 0.62, 0.55, z, 0.28, 0.27, 0.48, { seg: [7, 5] });
      }
    }
  } else if (kind === 'scapha') {
    for (const sx of [-1, 1]) d.rod('wood', V(sx * 0.9, 0.6, -0.5), V(sx * 2.6, -0.2, 0.6), 0.04, 4);
    d.span('wood', -0.95, 0.2, 0.8, 0.95, 0.28, 1.1);
    d.span('wood', -0.95, 0.2, -1.4, 0.95, 0.28, -1.1);
  } else {
    d.rod('wood', V(0.3, 0.2, 1.2), V(0.6, 4.2, 2.6), 0.035, 4); // punt pole
  }
  // The hold floor is walkable: one box from the keel to the floorboards (a boatman stands on it,
  // the player can jump aboard).
  const floor = H - draft - (kind === 'caudicaria' ? 0.35 : 0.4);
  d.solid((-B / 2) * 0.82, -draft, -L / 2 + 1.2, (B / 2) * 0.82, floor, L / 2 - 1.2);
  // Where the boatman stands: between the cargo and the deckhouse on a barge, amidships otherwise.
  return { floor, standZ: kind === 'caudicaria' ? L / 2 - 4.6 : 0 };
}

// Cattle and statues: see river-sculpt.ts (lofted bodies, vertex-coloured hides).

// ------------------------------------------------------------------ fences, stalls

/** Post-and-rail timber fence along a polyline (1:1), with an optional gate gap between points 0 and 1. */
export function fence(d: Draw, pts: V2[], opts: { height?: number; gap?: number; closed?: boolean; collide?: boolean } = {}) {
  const h = opts.height ?? 1.25;
  const n = opts.closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const c = pts[(i + 1) % pts.length];
    let len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const ux = (c[0] - a[0]) / len, uz = (c[1] - a[1]) / len;
    let s0 = 0;
    if (i === 0 && opts.gap) {
      s0 = opts.gap; // gate gap at the start of the first side
    }
    len -= 0;
    const posts = Math.max(1, Math.ceil((len - s0) / 2.2));
    for (let k = 0; k <= posts; k++) {
      const t = s0 + ((len - s0) * k) / posts;
      d.cyl('wood_dark', a[0] + ux * t, h / 2, a[1] + uz * t, 0.07, h, 5);
    }
    for (const y of [h * 0.45, h * 0.88]) d.rod('wood', V(a[0] + ux * s0, y, a[1] + uz * s0), V(c[0], y, c[1]), 0.045, 4);
    if (opts.collide !== false) {
      const mx = a[0] + ux * (s0 + (len - s0) / 2), mz = a[1] + uz * (s0 + (len - s0) / 2);
      d.sub(new THREE.Matrix4().makeRotationY(Math.atan2(-uz, ux)).setPosition(mx, 0, mz)).solid(-(len - s0) / 2, 0, -0.08, (len - s0) / 2, h, 0.08);
    }
  }
}

// ------------------------------------------------------------------ far stand-ins

/** A cheap far stand-in: flat-coloured boxes (one mesh per material). */
export function farBoxes(boxes: { mat: MaterialId; c: [number, number, number]; s: [number, number, number]; ry?: number }[], name: string): THREE.Object3D {
  const b = new MeshBuilder();
  for (const x of boxes) {
    const m = new THREE.Matrix4().makeRotationY(x.ry ?? 0).setPosition(x.c[0], x.c[1], x.c[2]);
    b.add(new THREE.BoxGeometry(x.s[0], x.s[1], x.s[2]), x.mat, m, { castShadow: false });
  }
  return b.build(name);
}

/** Draw a Draw-frame wrapper around a builder with an optional local matrix. */
export function draw(b: MeshBuilder, m?: THREE.Matrix4): Draw {
  return new Draw(b, m ?? new THREE.Matrix4());
}

/** Signed distance helper: is p inside polygon `poly` shrunk by `inset` (approximately, via 8 probes)? */
export function insideWithMargin(p: V2, poly: V2[], inset: number): boolean {
  if (!pointInPolygon(p, poly)) return false;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    if (!pointInPolygon([p[0] + Math.cos(a) * inset, p[1] + Math.sin(a) * inset], poly)) return false;
  }
  return true;
}

// ------------------------------------------------------------------ cheap colonnades

/**
 * A cheap colonnade for distant or secondary porticoes (≈ 60 triangles a column): plain shafts
 * with a moulded base and a block capital, an architrave beam along `pts` and, optionally, a
 * lean-to roof back toward `roofTo` (an offset path on the wall side). Columns stand at `y`.
 */
export function simpleColonnade(
  d: Draw,
  pts: V2[],
  o: { y?: number; height: number; D: number; spacing: number; mat?: MaterialId; roofDepth?: number; roofMat?: MaterialId; seg?: number; collide?: boolean },
) {
  const y = o.y ?? 0;
  const mat = o.mat ?? 'marble';
  const D = o.D;
  const H = o.height;
  const seg = o.seg ?? 8;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / o.spacing));
    for (let k = i === 0 ? 0 : 1; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n;
      const z = az + ((bz - az) * k) / n;
      d.box(mat, x, y + D * 0.15, z, D * 1.3, D * 0.3, D * 1.3);
      d.cyl(mat, x, y + D * 0.3 + (H - D * 0.75) / 2, z, D / 2, H - D * 0.75, seg, { rTop: D * 0.42 });
      d.cyl(mat, x, y + H - D * 0.3, z, D * 0.42, D * 0.3, seg, { rTop: D * 0.62 });
      d.box(mat, x, y + H - D * 0.075, z, D * 1.25, D * 0.15, D * 1.25);
      if (o.collide) d.solidCyl(x, y + H / 2, z, D / 2, H);
    }
    // Architrave + frieze beam, and the roof slab sloping back.
    const ang = Math.atan2(-(bz - az), bx - ax);
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    d.box(mat, mx, y + H + D * 0.45, mz, len + D * 0.6, D * 0.9, D * 1.1, { ry: ang });
    if (o.roofDepth) {
      const nx = -(bz - az) / len, nz = (bx - ax) / len; // left-hand side of the run
      const rd = o.roofDepth;
      d.box(o.roofMat ?? 'roof_tile', mx + (nx * rd) / 2, y + H + D * 1.0, mz + (nz * rd) / 2, len + D, 0.14, rd + D, { ry: ang, rx: 0 });
    }
  }
}

/**
 * Offset a polyline sideways by `dist` (positive = away from `centre`, e.g. outward from an
 * island), using the per-vertex average normal.
 */
export function offsetAway(pts: V2[], dist: number, centre: V2): V2[] {
  if (pts.length < 2) return pts.map((p) => [p[0], p[1]] as V2);
  const mid = pts[Math.floor(pts.length / 2)];
  const a = pts[Math.max(0, Math.floor(pts.length / 2) - 1)];
  const c = pts[Math.min(pts.length - 1, Math.floor(pts.length / 2) + 1)];
  // Left normal of the walking direction at the middle; flip if it points toward the centre.
  let sign = 1;
  const lx = -(c[1] - a[1]), lz = c[0] - a[0];
  if (lx * (mid[0] - centre[0]) + lz * (mid[1] - centre[1]) < 0) sign = -1;
  return pts.map((p, i) => {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[Math.min(pts.length - 1, i + 1)];
    const dx = p1[0] - p0[0], dz = p1[1] - p0[1];
    const l = Math.hypot(dx, dz) || 1;
    return [p[0] + (-dz / l) * dist * sign, p[1] + (dx / l) * dist * sign] as V2;
  });
}

/**
 * Corridors (local quads, game metres) along every atlas bridge within reach, extended `ext` real
 * metres beyond both ends for the approach ramps: open squares and quays leave them free.
 */
export function bridgeCorridors(ctx: LandmarkContext, env: RiverEnv, ext = 40, extraHalf = 2.5): V2[][] {
  const out: V2[][] = [];
  const self = ctx.lm;
  const r0 = radius(self) + 120;
  const hm = ctx.game.heightmap as Heightmap | undefined;
  for (const br of atlas.BRIDGES) {
    const dx = br.b[0] - br.a[0], dz = br.b[1] - br.a[1];
    const L = Math.hypot(dx, dz) || 1;
    const ux = dx / L, uz = dz / L;
    const near = Math.min(Math.hypot(br.a[0] - self.center[0], br.a[1] - self.center[1]), Math.hypot(br.b[0] - self.center[0], br.b[1] - self.center[1]));
    if (near > r0) continue;
    // With the terrain at hand, use the bridge's real extent (ramp foot to ramp foot).
    let s0 = -ext, s1 = L + ext;
    if (hm) {
      const lay = bridgeLayoutFor(br, hm, atlas.RIVERS[0]).layout;
      s0 = lay.start / ctx.S - 2;
      s1 = lay.end / ctx.S + 2;
    }
    const h = br.width / 2 + extraHalf;
    const a: [number, number] = [br.a[0] + ux * s0, br.a[1] + uz * s0];
    const c: [number, number] = [br.a[0] + ux * s1, br.a[1] + uz * s1];
    const nx = -uz * h, nz = ux * h;
    out.push([env.local(a[0] + nx, a[1] + nz), env.local(c[0] + nx, c[1] + nz), env.local(c[0] - nx, c[1] - nz), env.local(a[0] - nx, a[1] - nz)]);
  }
  return out;
}

// ------------------------------------------------------------------ the terrain's stone quays

/** A point on a quay in a landmark's local frame: position, tangent (downstream) and inland normal. */
export interface QuayPoint {
  x: number;
  z: number;
  tx: number;
  tz: number;
  nx: number;
  nz: number;
}

/**
 * The stone quay the terrain/water modules built near a landmark (`hm.features.quays`, walls in
 * src/world/water/quays.ts), in the landmark's local frame. Positions follow the water module's
 * geometry exactly: the face line at the river bed (`inland` = 0), the face top 0.3 m further in
 * (batter), a travertine coping 0.2 m proud of the quay surface from 0.22 to 1.12 m inland, the
 * flat quay surface behind it out to ~10 m.
 */
export interface QuayEdge {
  quay: ResolvedQuay;
  river: TerrainRiver;
  /** Chainage (real m) range of the quay that lies near the landmark. */
  s0: number;
  s1: number;
  /** Quay surface, coping top, water level and river bed at the face (local y). */
  top: number;
  coping: number;
  water: number;
  bed: number;
  /** Local point at chainage `s` (real m), `inland` game metres in from the bed-level face line. */
  at(s: number, inland?: number): QuayPoint;
  /** Nearest chainage and inland distance (game m) of a local point. */
  project(x: number, z: number): { s: number; inland: number };
  /** Chainages of the water module's mooring blocks, stair landings and wall gaps. */
  moorings: number[];
  stairs: number[];
  gaps: { s: number; half: number }[];
}

/**
 * The quay whose wall passes within `reach` (real m) of the landmark's centre, or null (natural
 * banks, or a heightmap without quay features).
 */
export function quayEdge(ctx: LandmarkContext, env: RiverEnv, reach = 120): QuayEdge | null {
  const hm = ctx.game.heightmap as Heightmap | undefined;
  const quays = hm?.features?.quays;
  if (!hm || !quays?.length) return null;
  const S = ctx.S;
  const rot = bearingToRotationY(ctx.lm.rotation);
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const dirLocal = (dx: number, dz: number): V2 => [dx * c - dz * s, dx * s + dz * c];
  let best: { rq: ResolvedQuay; river: TerrainRiver; d: number; sNear: number } | null = null;
  for (const river of hm.features!.rivers) {
    const line = chain(river.centerline);
    for (const rq of resolveQuays(quays, river.id, line)) {
      for (let ch = rq.s0; ch <= rq.s1; ch += 2) {
        const p = stationAt(line, river.width, ch);
        const bx = rq.side * p.tz, bz = rq.side * -p.tx;
        const fx = p.x + bx * (p.half + QUAY.faceOffset), fz = p.z + bz * (p.half + QUAY.faceOffset);
        const d = Math.hypot(fx - ctx.lm.center[0], fz - ctx.lm.center[1]);
        if (d < reach && (!best || d < best.d)) best = { rq, river, d, sNear: ch };
      }
    }
  }
  if (!best) return null;
  const { rq, river } = best;
  const line = chain(river.centerline);
  const at = (ch: number, inland = 0): QuayPoint => {
    const p = stationAt(line, river.width, ch);
    const bx = rq.side * p.tz, bz = rq.side * -p.tx;
    const d = p.half + QUAY.faceOffset;
    const [x, z] = env.local(p.x + bx * d, p.z + bz * d);
    const [nx, nz] = dirLocal(bx, bz);
    const [tx, tz] = dirLocal(p.tx, p.tz);
    return { x: x + nx * inland, z: z + nz * inland, tx, tz, nx, nz };
  };
  // The water module's stairs and mooring blocks (same rules as buildQuay).
  const len = rq.s1 - rq.s0;
  const stairs: number[] = [];
  if (len > 40) {
    const k = Math.max(1, Math.round(len / QUAY.stairEvery));
    for (let i = 0; i < k; i++) {
      const ch = rq.s0 + (len * (i + 0.5)) / k;
      if (!rq.gaps.some((g) => Math.abs(ch - g.s) < g.half + 20)) stairs.push(ch);
    }
  }
  const moorings: number[] = [];
  const n = Math.max(1, Math.round(len / QUAY.station));
  const ds = len / n;
  for (let i = 0; i < n; i++) {
    const sa = rq.s0 + i * ds, sb = sa + ds;
    const sm = (sa + sb) / 2;
    if (rq.gaps.some((g) => Math.abs(sm - g.s) < g.half + 0.8)) continue;
    if (Math.floor((sa - rq.s0) / QUAY.mooringEvery) !== Math.floor((sb - rq.s0) / QUAY.mooringEvery) && !stairs.some((st) => Math.abs(sm - st) < 12)) moorings.push(sm);
  }
  // The part of the quay near the landmark.
  const r = radius(ctx.lm) + 30;
  let s0 = Infinity, s1 = -Infinity;
  for (let ch = rq.s0; ch <= rq.s1; ch += 1) {
    const p = stationAt(line, river.width, ch);
    if (Math.hypot(p.x - ctx.lm.center[0], p.z - ctx.lm.center[1]) < r + p.half) {
      s0 = Math.min(s0, ch);
      s1 = Math.max(s1, ch);
    }
  }
  if (!Number.isFinite(s0)) {
    s0 = best.sNear;
    s1 = best.sNear;
  }
  const project = (x: number, z: number) => {
    let bs = s0, bd = Infinity;
    for (let ch = Math.max(rq.s0, s0 - 40); ch <= Math.min(rq.s1, s1 + 40); ch += 1) {
      const p = at(ch);
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) {
        bd = d;
        bs = ch;
      }
    }
    const p = at(bs);
    return { s: bs, inland: (x - p.x) * p.nx + (z - p.z) * p.nz };
  };
  return {
    quay: rq,
    river,
    s0,
    s1,
    top: rq.quay.top * S - env.baseY,
    coping: rq.quay.top * S + QUAY.coping - env.baseY,
    water: river.waterLevel * S - env.baseY,
    bed: (river.waterLevel - 4.6) * S - env.baseY,
    at,
    project,
    moorings,
    stairs,
    gaps: rq.gaps,
  };
}

/** A Draw frame at a quay point whose local −z faces the river (x along the quay). */
export function quayFrame(d: Draw, p: QuayPoint, y: number): Draw {
  // Local −z = riverward (−n): rotation.y = atan2(nx, nz) maps +z to (nx, nz).
  return d.at(p.x, y, p.z, Math.atan2(p.nx, p.nz));
}
