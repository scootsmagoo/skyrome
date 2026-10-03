/**
 * Shared helpers for the Forum Romanum and Velia landmark builders (forum-*.ts).
 *
 * - `landmark()` wraps a build function and produces the LandmarkBuild: the near version at the
 *   context detail plus, for big landmarks, a cheap 'low' far stand-in, collecting spots once.
 * - Ground helpers: foundations that reach the lowest terrain under an outline (nothing floats),
 *   human-scale flights of steps (riser ≤ 0.2 m, tread 0.33 m) with per-step box colliders,
 *   paving draped on the terrain.
 * - `col()`: columns in three tiers. 'hero' is the kit's full column, 'low' the kit's far column,
 *   'mid' a cheaper composition (fluted shaft, simple base, kit capital) for long colonnades.
 * - Small furniture of the Forum: bronze ship rams, balustrades (plutei), altars, statue bases,
 *   painted materials for polychromy, trees, and fires (light-pool requests deferred until the
 *   sky module is installed).
 *
 * Local frames follow the landmark contract: origin at the landmark centre on its pad, facade
 * towards −z, y = 0 is the pad. Monumental sizes come in real metres × S; human-scale parts are 1:1.
 */
import * as THREE from 'three';
import type { Game } from '../../../core/Game';
import { Draw } from '../../../arch/fabric/draw';
import { buildPlaza } from '../../../arch/fabric/streets';
import type { Polygon } from '../../../arch/fabric/types';
import { capitalPieces } from '../../../arch/classical/capitals';
import { column } from '../../../arch/classical/column';
import { ORDER_PROPORTIONS, columnDims, entasisRadius, type Order } from '../../../arch/classical/orders';
import { ProfileBuilder, T, TRS, gridSurface, lathe, mul, type V2 } from '../../../arch/common/geom';
import { inscriptionPanel, type InscriptionStyle } from '../../../arch/common/inscription';
import { stairs } from '../../../arch/common/stairs';
import { prism } from '../../../arch/common/walls';
import { Forest } from '../../../arch/vegetation/Forest';
import type { TreeSpecies } from '../../../arch/vegetation/species';
import { vegetation } from '../../../arch/vegetation/system';
import { UV_METERS } from '../../../gfx/textures/catalog';
import { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../gfx/materialIds';
import { toGame } from '../../coords';
import type { LandmarkBuild, LandmarkContext, Spot } from '../types';

export type Detail = 'high' | 'low';
export type { V2 };

// ---------------------------------------------------------------- build wrapper

/** What a forum build function receives. */
export interface Part {
  ctx: LandmarkContext;
  b: MeshBuilder;
  d: Draw;
  detail: Detail;
  hi: boolean;
  /** WORLD_SCALE. */
  S: number;
  /** Spots are only collected on the first (near) pass. */
  spot(id: string, kind: string, x: number, y: number, z: number, heading?: number): void;
  /** True on the near pass (colliders and spots count); false while building the far stand-in. */
  main: boolean;
}

export interface LandmarkOpts {
  /** Build a 'low' far stand-in and show the near version only within this distance (m). */
  near?: number;
  /** Override cull distance when there is no far stand-in. */
  cull?: number;
}

/** Runs `fn` for the near version (and the far stand-in when `near` is set) and packages the result. */
export function landmark(ctx: LandmarkContext, fn: (p: Part) => void, o: LandmarkOpts = {}): LandmarkBuild {
  const spots: Spot[] = [];
  const make = (detail: Detail, main: boolean) => {
    const b = ctx.builder();
    const p: Part = {
      ctx,
      b,
      d: new Draw(b),
      detail,
      hi: detail === 'high',
      S: ctx.S,
      main,
      spot(id, kind, x, y, z, heading) {
        if (main) spots.push({ id, kind, position: new THREE.Vector3(x, y, z), heading });
      },
    };
    fn(p);
    return b;
  };
  const near = make(ctx.detail, true);
  const out: LandmarkBuild = { object: near.build(ctx.lm.id), colliders: near.colliders, spots };
  if (o.near && ctx.detail === 'high') {
    const far = make('low', false);
    out.far = far.build(`${ctx.lm.id}:far`);
    out.cullDistance = o.near;
  } else if (o.cull) out.cullDistance = o.cull;
  return out;
}

// ---------------------------------------------------------------- ground

/** Terrain under the outline (sampled along edges every ~2 m and at the centroid), min and max, relative to the pad. */
export function groundRange(ctx: LandmarkContext, pts: readonly V2[], step = 2): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % pts.length];
    cx += ax;
    cz += az;
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = 0; k < n; k++) {
      const g = ctx.groundAt(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n);
      min = Math.min(min, g);
      max = Math.max(max, g);
    }
  }
  const g = ctx.groundAt(cx / pts.length, cz / pts.length);
  return { min: Math.min(min, g), max: Math.max(max, g) };
}

/** Rectangle outline [x0,z0]-[x1,z1]. */
export function rect(x0: number, z0: number, x1: number, z1: number): V2[] {
  return [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ];
}

/**
 * Solid masonry from `yTop` down below the lowest terrain under `pts` (so a building on a slope or
 * an uneven pad never floats). Adds nothing when the ground is everywhere at or above yTop.
 */
export function foundation(p: Part, pts: V2[], yTop: number, mat: MaterialId = 'travertine', collide = false): number {
  const { min } = groundRange(p.ctx, pts);
  if (min >= yTop - 0.02) return yTop;
  const y0 = min - 0.4;
  p.b.add(prism(pts, y0, yTop), mat);
  if (collide) {
    const xs = pts.map((q) => q[0]);
    const zs = pts.map((q) => q[1]);
    p.d.solid(Math.min(...xs), y0, Math.min(...zs), Math.max(...xs), yTop, Math.max(...zs));
  }
  return y0;
}

/** Steps (riser ≤ `maxRise`, tread `run`) from y = 0 up to `height`, climbing toward +z of `at`, centred on x = 0. */
export function flight(b: MeshBuilder, at: THREE.Matrix4, width: number, height: number, mat: MaterialId = 'travertine', run = 0.33, maxRise = 0.2): { depth: number; count: number; rise: number } {
  if (height <= 0.02) return { depth: 0, count: 0, rise: 0 };
  const count = Math.max(1, Math.ceil(height / maxRise));
  const rise = height / count;
  stairs(b, { width, rise, run, count, material: mat }, at);
  return { depth: count * run, count, rise };
}

/** Pave a local polygon over the terrain (lift above the ground), optional holes. Collider: trimesh. */
export function pave(p: Part, poly: V2[], o: { material?: MaterialId; lift?: number; exclude?: V2[][]; cell?: number; skirt?: number; collide?: boolean } = {}) {
  buildPlaza(p.b, poly as Polygon, (x, z) => p.ctx.groundAt(x, z), {
    material: o.material ?? 'paving_travertine',
    lift: o.lift ?? 0.06,
    exclude: o.exclude as Polygon[] | undefined,
    cell: o.cell ?? (p.hi ? 2.5 : 6),
    skirt: o.skirt ?? 0.35,
    collide: p.main && (o.collide ?? true),
  });
}

/** Thin paved slab of fixed height (local floor), e.g. a raised enclosure floor. */
export function slab(p: Part, pts: V2[], y0: number, y1: number, mat: MaterialId, collide = true) {
  p.b.add(prism(pts, y0, y1), mat, undefined, { castShadow: false });
  if (collide) {
    const xs = pts.map((q) => q[0]);
    const zs = pts.map((q) => q[1]);
    p.d.solid(Math.min(...xs), y0, Math.min(...zs), Math.max(...xs), y1, Math.max(...zs));
  }
}

// ---------------------------------------------------------------- world transforms

/** Local → world matrix of a landmark (the same transform buildLandmarks applies). */
export function localToWorld(ctx: LandmarkContext): THREE.Matrix4 {
  const [gx, gz] = toGame(ctx.lm.center[0], ctx.lm.center[1]);
  const hm = ctx.game.heightmap;
  const y = hm ? hm.heightAt(gx, gz) : 0;
  return new THREE.Matrix4().makeRotationY(-ctx.lm.rotation * (Math.PI / 180)).setPosition(gx, y, gz);
}

/** Atlas real-metre point → this landmark's local frame (x, z in game metres). */
export function atlasToLocal(ctx: LandmarkContext, x: number, z: number): V2 {
  const th = (ctx.lm.rotation * Math.PI) / 180;
  const dx = (x - ctx.lm.center[0]) * ctx.S;
  const dz = (z - ctx.lm.center[1]) * ctx.S;
  const c = Math.cos(th);
  const s = Math.sin(th);
  return [dx * c + dz * s, -dx * s + dz * c];
}

// ---------------------------------------------------------------- vegetation and fire

/** Plant trees (local positions, on the terrain) as a small instanced Forest. */
export function plantTrees(p: Part, trees: { species: TreeSpecies; x: number; z: number; y?: number; scale?: number; variant?: number }[]) {
  if (!p.main || !trees.length) return;
  const m = localToWorld(p.ctx);
  const f = new Forest({ seed: p.ctx.rng.int(1, 1e6), near: 140 });
  const v = new THREE.Vector3();
  for (const t of trees) {
    v.set(t.x, t.y ?? p.ctx.groundAt(t.x, t.z), t.z).applyMatrix4(m);
    f.add(t.species, v.x, v.y, v.z, { scale: t.scale, variant: t.variant });
  }
  p.ctx.game.scene.add(f.build());
  vegetation(p.ctx.game).addForest(f);
}

interface FireRequest {
  position: THREE.Vector3;
  intensity?: number;
  distance?: number;
  glow?: number;
  dayScale?: number;
  flicker?: number;
}

/**
 * Ask the light pool for a fire (a flame glow by day, real light at night). The landmarks are
 * built before the sky (and its light pool) is installed, so requests wait for `game.lights`.
 */
export function addFire(p: Part, x: number, y: number, z: number, o: Omit<FireRequest, 'position'> = {}) {
  if (!p.main) return;
  const pos = new THREE.Vector3(x, y, z).applyMatrix4(localToWorld(p.ctx));
  queueFire(p.ctx.game, { position: pos, ...o });
}

const pendingFires = new WeakMap<Game, FireRequest[]>();

function queueFire(game: Game, r: FireRequest) {
  let q = pendingFires.get(game);
  if (!q) {
    const list: FireRequest[] = [];
    pendingFires.set(game, list);
    q = list;
    let tries = 0;
    const sys = {
      name: 'forumFires',
      priority: 200,
      update() {
        const lights = (game as unknown as { lights?: { request(o: object): unknown } }).lights;
        if (lights) {
          for (const f of list) {
            lights.request({ position: f.position, color: 0xff9a45, intensity: f.intensity ?? 10, distance: f.distance ?? 9, flicker: f.flicker ?? 0.45, glow: f.glow ?? 0.45, dayScale: f.dayScale ?? 0 });
          }
          game.removeSystem(sys);
        } else if (++tries > 6000) game.removeSystem(sys);
      },
    };
    game.addSystem(sys);
  }
  q.push(r);
}

// ---------------------------------------------------------------- materials

const paints = new Map<string, THREE.MeshStandardMaterial>();

/** A shared painted / special material (polychromy, inscriptions grounds…), cached by colour. */
export function paint(hex: string, roughness = 0.75, metalness = 0, emissive?: string): THREE.MeshStandardMaterial {
  const key = `${hex}|${roughness}|${metalness}|${emissive ?? ''}`;
  let m = paints.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: hex, roughness, metalness });
    if (emissive) {
      m.emissive = new THREE.Color(emissive);
      m.emissiveIntensity = 1.6;
    }
    m.name = `forum-paint:${hex}`;
    paints.set(key, m);
  }
  return m;
}

/** Palette (GDD §16.1). */
export const PAINT = {
  cinnabar: '#A3271F',
  redOchre: '#9A3A24',
  yellowOchre: '#CC9A35',
  egyptianBlue: '#2D5DA1',
  greenEarth: '#6F8656',
  black: '#1F1D1B',
} as const;

// ---------------------------------------------------------------- columns

export type Tier = 'hero' | 'mid' | 'low';

export interface ColSpec {
  order: Order;
  D: number;
  /** Total column height (base + shaft + capital). */
  H: number;
  tier: Tier;
  material?: MaterialId;
  trim?: MaterialId;
  kind?: 'free' | 'engaged';
  fluted?: boolean;
  collide?: boolean;
}

interface Piece {
  g: THREE.BufferGeometry;
  trim: boolean;
}

const midCache = new Map<string, Piece[]>();

/** Fluted (or plain) shaft from y0 to y1 with entasis; 'engaged' keeps the front half (z < 0). */
function midShaft(D: number, top: number, y0: number, y1: number, fluted: boolean, half: boolean, arris: boolean): THREE.BufferGeometry {
  const t0 = half ? Math.PI / 2 - 0.25 : 0;
  const t1 = half ? Math.PI * 1.5 + 0.25 : Math.PI * 2;
  const n = 24;
  const P = (Math.PI * 2) / n;
  const angles: number[] = [];
  if (fluted) {
    for (let k = 0; k <= n; k++) {
      const base = k * P;
      for (const f of arris ? [0, 0.5] : [0, 0.14, 0.5, 0.86]) {
        const a = base + f * P;
        if (a >= t0 - 1e-9 && a <= t1 + 1e-9) angles.push(a);
      }
    }
    if (angles[0] > t0) angles.unshift(t0);
    if (angles[angles.length - 1] < t1) angles.push(t1);
  } else for (let i = 0; i <= (half ? 10 : 18); i++) angles.push(t0 + ((t1 - t0) * i) / (half ? 10 : 18));
  const L = y1 - y0;
  const depth = 0.045 * D;
  const groove = (a: number) => {
    let s = a / P;
    s -= Math.floor(s);
    if (arris) return 1 - Math.abs(2 * s - 1) < 0.02 ? 0 : 1;
    return s > 0.13 && s < 0.87 ? 1 : 0;
  };
  const rows = [0, 0.06, 1 / 3, 0.66, 0.94, 1];
  return gridSurface(
    angles,
    rows,
    (a, t, out) => {
      const fade = Math.min(1, t / 0.06, (1 - t) / 0.06);
      const r = entasisRadius(D, top, t) - (fluted ? depth * groove(a) * fade : 0);
      return out.set(r * Math.sin(a), y0 + t * L, r * Math.cos(a));
    },
    { uv: (a, t) => [(a * D * 0.5) / UV_METERS, (y0 + t * L) / UV_METERS] },
  );
}

function midParts(order: Order, D: number, H: number, half: boolean, fluted: boolean): Piece[] {
  const key = `${order}|${D.toFixed(3)}|${H.toFixed(3)}|${half}|${fluted}`;
  const hit = midCache.get(key);
  if (hit) return hit;
  const dims = columnDims(order, D, H);
  const p = ORDER_PROPORTIONS[order];
  const out: Piece[] = [];
  const segs = 16;
  const range = half ? { theta0: Math.PI / 2 - 0.25, theta1: Math.PI * 1.5 + 0.25 } : {};
  const plinthH = order === 'tuscan' ? 0.25 * D : D / 6;
  const w = dims.plinth;
  const pl = new THREE.BoxGeometry(w, plinthH, half ? w / 2 : w);
  pl.translate(0, plinthH / 2, half ? -w / 4 : 0);
  out.push({ g: pl, trim: true });
  const base =
    order === 'tuscan' || order === 'doric'
      ? new ProfileBuilder(0.6 * D, plinthH).torus(0.18 * D, 0.1 * D, 3).in(0.08 * D).to(0.5 * D, plinthH + 0.25 * D).build()
      : new ProfileBuilder(0.6 * D, plinthH).torus(0.11 * D, 0.08 * D, 3).in(0.05 * D).up(0.02 * D).scotia(0.06 * D, 0.04 * D, 2).up(0.02 * D).torus(0.075 * D, 0.06 * D, 3).to(0.5 * D, plinthH + 0.34 * D).build();
  out.push({ g: lathe(base, { segments: segs, ...range }), trim: true });
  const y0 = dims.base - 0.01 * D;
  const y1 = dims.height - dims.capital;
  out.push({ g: midShaft(D, p.topRatio, y0, y1 - 0.08 * D, fluted && p.flutes > 0, half, order === 'doric'), trim: false });
  const r1 = (entasisRadius(D, p.topRatio, 1) * 2) / 2;
  const astr = new ProfileBuilder(r1, y1 - 0.1 * D).up(0.03 * D).torus(0.06 * D, 0.03 * D, 2).to(r1 * 0.98, y1 + 0.002).build();
  out.push({ g: lathe(astr, { segments: segs, ...range }), trim: false });
  for (const pc of capitalPieces(order, { D, d: dims.d, height: dims.capital, detail: 'low', half })) {
    const g = pc.geometry.clone();
    g.translate(0, y1, 0);
    out.push({ g, trim: true });
  }
  midCache.set(key, out);
  return out;
}

/** A column at the given tier (origin on the ground at the axis). */
export function col(b: MeshBuilder, s: ColSpec, at: THREE.Matrix4) {
  const mat = s.material ?? 'marble';
  const fluted = s.fluted ?? s.order !== 'tuscan';
  const kind = s.kind ?? 'free';
  if (s.tier !== 'mid') {
    column(b, { order: s.order, D: s.D, height: s.H, fluted, material: mat, trimMaterial: s.trim ?? mat, detail: s.tier === 'hero' ? 'high' : 'low', kind, collide: s.collide ?? kind === 'free' }, at);
    return;
  }
  for (const pc of midParts(s.order, s.D, s.H, kind === 'engaged', fluted)) b.add(pc.g, pc.trim ? (s.trim ?? mat) : mat, at);
  if (s.collide ?? kind === 'free') {
    const c = new THREE.Vector3(0, s.H / 2, 0).applyMatrix4(at);
    b.collider({ kind: 'cylinder', center: c, halfHeight: s.H / 2, radius: s.D * 0.52 });
  }
}

// ---------------------------------------------------------------- furniture

/**
 * A bronze warship ram (rostrum): a socket that wrapped the keel and stem, three horizontal fins
 * and a blunt front plate. Origin at the mount on a wall face (z = 0), pointing toward −z, `len` long.
 */
export function shipRam(b: MeshBuilder, at: THREE.Matrix4, len = 1.4, mat: MaterialId = 'bronze') {
  const h = len * 0.42;
  const w = len * 0.32;
  // Socket: tapered box from the wall forward.
  const sock = new THREE.CylinderGeometry(0.32, 0.5, 1, 4, 1);
  sock.rotateY(Math.PI / 4);
  sock.rotateX(-Math.PI / 2);
  sock.scale(w, h, len * 0.75);
  sock.translate(0, 0, -len * 0.375);
  b.add(sock, mat, at);
  // Fins: three horizontal blades and a vertical stem post.
  for (const y of [-0.3, 0, 0.3]) {
    const fin = new THREE.BoxGeometry(w * 1.25, h * 0.08, len * 0.32);
    fin.translate(0, y * h, -len * 0.82);
    b.add(fin, mat, at);
  }
  const plate = new THREE.BoxGeometry(w * 0.2, h * 0.86, len * 0.06);
  plate.translate(0, 0, -len * 0.98);
  b.add(plate, mat, at);
  // Top cap (the fore-deck socket), a slanted wedge.
  const cap = new THREE.BoxGeometry(w * 0.7, h * 0.18, len * 0.5);
  cap.rotateX(-0.25);
  cap.translate(0, h * 0.5, -len * 0.28);
  b.add(cap, mat, at);
}

/**
 * Balustrade of marble plutei between square posts along a straight line (a→b) in the Draw frame:
 * height `h`, panels slightly recessed, a moulded top rail. Box collider along the run.
 */
export function balustrade(d: Draw, ax: number, az: number, bx: number, bz: number, o: { h?: number; y?: number; mat?: MaterialId; post?: number; collide?: boolean; lattice?: boolean } = {}) {
  const h = o.h ?? 1.05;
  const y = o.y ?? 0;
  const mat = o.mat ?? 'marble';
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 0.05) return;
  const rot = Math.atan2(-(bz - az), bx - ax);
  const f = d.at(ax, y, az, rot);
  const t = 0.18;
  const nPost = Math.max(1, Math.round(len / (o.post ?? 1.6)));
  for (let i = 0; i <= nPost; i++) f.box(mat, (len * i) / nPost, h / 2, 0, 0.24, h, 0.24);
  f.box(mat, len / 2, h - 0.06, 0, len, 0.12, t + 0.08);
  f.box(mat, len / 2, 0.08, 0, len, 0.16, t + 0.06);
  if (o.lattice) {
    for (let i = 0; i < nPost; i++) {
      const x0 = (len * i) / nPost + 0.12;
      const x1 = (len * (i + 1)) / nPost - 0.12;
      const n = 3;
      for (let k = 0; k <= n; k++) {
        const xa = x0 + ((x1 - x0) * k) / n;
        f.rod('bronze', { x: xa, y: 0.16, z: 0 }, { x: Math.min(x1, xa + (x1 - x0) / n), y: h - 0.12, z: 0 }, 0.025, 4);
        f.rod('bronze', { x: Math.min(x1, xa + (x1 - x0) / n), y: 0.16, z: 0 }, { x: xa, y: h - 0.12, z: 0 }, 0.025, 4);
      }
    }
  } else f.box(mat, len / 2, h / 2, 0, len, h - 0.2, t * 0.6);
  if (o.collide ?? true) f.solid(0, 0, -t / 2 - 0.05, len, h, t / 2 + 0.05);
}

/** Moulded altar (ara) centred at (x, z) in the Draw frame: plinth, die, crowning with bolsters. */
export function altar(d: Draw, x: number, y: number, z: number, o: { w?: number; h?: number; rot?: number; mat?: MaterialId; fire?: boolean } = {}) {
  const w = o.w ?? 1.0;
  const h = o.h ?? 1.0;
  const mat = o.mat ?? 'marble';
  const f = d.at(x, y, z, o.rot ?? 0);
  f.box(mat, 0, 0.08, 0, w * 1.18, 0.16, w * 0.9);
  f.box(mat, 0, 0.16 + (h - 0.4) / 2, 0, w, h - 0.4, w * 0.72);
  f.box(mat, 0, h - 0.17, 0, w * 1.12, 0.12, w * 0.84);
  f.box(mat, 0, h - 0.06, 0, w * 1.0, 0.1, w * 0.74);
  for (const sx of [-1, 1]) f.cyl(mat, sx * w * 0.42, h + 0.04, 0, 0.09, w * 0.72, 8, { rx: Math.PI / 2 });
  // garland band on the die
  f.box('stucco_painted', 0, h * 0.62, -w * 0.36 - 0.01, w * 0.8, 0.06, 0.02);
  f.solid(-w * 0.6, 0, -w * 0.45, w * 0.6, h, w * 0.45);
  if (o.fire) f.cyl('glow_fire', 0, h + 0.12, 0, 0.18, 0.18, 6, { rTop: 0.02 });
}

/** Statue base: moulded die with an optional inscription panel on the −z face. Returns the top y. */
export function pedestal(b: MeshBuilder, at: THREE.Matrix4, w: number, dpt: number, h: number, mat: MaterialId = 'marble', lines?: string[], style: InscriptionStyle = 'carved'): number {
  const d = new Draw(b, at);
  d.box(mat, 0, 0.1, 0, w + 0.16, 0.2, dpt + 0.16);
  d.box(mat, 0, 0.2 + (h - 0.4) / 2, 0, w, h - 0.4, dpt);
  d.box(mat, 0, h - 0.13, 0, w + 0.14, 0.14, dpt + 0.14);
  d.box(mat, 0, h - 0.03, 0, w + 0.06, 0.06, dpt + 0.06);
  d.solid(-w / 2 - 0.08, 0, -dpt / 2 - 0.08, w / 2 + 0.08, h, dpt / 2 + 0.08);
  if (lines?.length) {
    inscriptionPanel(b, { lines, width: w * 0.86, height: Math.min(h * 0.55, 0.22 * lines.length + 0.2), style, sizes: lines.map((_, i) => (i === 0 ? 1 : 0.8)) }, mul(at, T(0, 0.2 + (h - 0.4) * 0.55, -dpt / 2 - 0.005)), { depth: 0.02, bodyMaterial: mat });
  }
  return h;
}

/** Inscription panel helper (front face at z = 0 of `at`, facing −z). */
export function inscription(b: MeshBuilder, at: THREE.Matrix4, lines: string[], w: number, h: number, style: InscriptionStyle = 'carved', o: { depth?: number; body?: MaterialId; sizes?: number[]; ground?: string; ink?: string; interpunct?: boolean } = {}) {
  inscriptionPanel(
    b,
    { lines, width: w, height: h, style, sizes: o.sizes ?? lines.map((_, i) => (i === 0 ? 1 : 0.82)), ground: o.ground, ink: o.ink, interpunct: o.interpunct, border: true },
    at,
    { depth: o.depth ?? 0.04, bodyMaterial: o.body },
  );
}

/** Ring of `n` points (radius r) for round plans; angle 0 = −z (front). */
export function ring(r: number, n: number, phase = 0): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    out.push([Math.sin(a) * r, -Math.cos(a) * r]);
  }
  return out;
}

/** Shorthand matrices. */
export { T, TRS, mul };
