/**
 * Where content may stand: on the street, outside the buildings.
 *
 * Content places hundreds of small things (altars, notices, baskets, lamps, quest spots, NPC homes)
 * by place id and offset. A place id often names a building whose atlas centre is inside solid
 * masonry (a temple's podium, the Meta Sudans, the fallback block of the Porta Capena), and the
 * world's real geometry (city blocks, custom landmark builders) is only known at run time. Two
 * layers keep things in the open:
 *
 * - `pushOutOfFootprints` (pure, atlas only): a point inside the footprint of a landmark that is
 *   built as solid masonry is moved out along the line from its centre (the façade normal when it
 *   is at the centre). Tests use it to check every spot the content defines statically.
 * - `Placer` (run time, physics): a point is free when the first surface under the sky is at street
 *   level (within 0.9 m of the terrain: no roof, podium or wall top), nothing solid stands at body
 *   height, and nothing content already put there claims it. Otherwise the nearest free point on
 *   rings around it is used. It also finds walls to hang notices and lamps on.
 *
 * Everything is in game metres.
 */
import * as THREE from 'three';
import type { Game } from '../core/Game';
import { Layer } from '../core/Physics';
import { LANDMARKS, type Landmark } from '../data/atlas';
import { WORLD_SCALE, toGame } from '../world/coords';
import { registeredBuilderKeys } from '../world/landmarks/registry';

/**
 * How the generic landmark builder (src/world/landmarks/builders/fallback.ts) builds a landmark: open
 * courts (paved floor, a wall round it) for these categories with a rectangular footprint, nothing
 * for gardens and aqueducts, a solid mass for everything else.
 */
const OPEN_COURT = new Set(['circus', 'stadium', 'forum', 'camp', 'harbor', 'portico', 'market']);
const NOT_BUILT = new Set(['garden', 'aqueduct']);

let custom: Set<string> | null = null;
/** Landmarks with a builder of their own (real passages, courts and quays): only a probe of the built world can tell. */
function hasOwnBuilder(id: string): boolean {
  custom ??= new Set(registeredBuilderKeys().filter((k) => !k.startsWith('category:')));
  return custom.has(id);
}

/** An open court of the generic builder (a paved floor inside a wall): walkable, but its wall is not. */
export function isOpenCourt(lm: Landmark): boolean {
  return OPEN_COURT.has(lm.category) && lm.footprint.kind === 'rect' && !hasOwnBuilder(lm.id) && lm.siting !== 'underground';
}

/** True when the world builds this landmark as a solid mass a person cannot stand inside. */
export function isSolidLandmark(lm: Landmark): boolean {
  if (NOT_BUILT.has(lm.category) || lm.siting === 'underground' || hasOwnBuilder(lm.id)) return false;
  if (OPEN_COURT.has(lm.category) && lm.footprint.kind === 'rect') return false;
  // District anchors and sites ("The Subura", "the Naumachia (site)") are areas, not buildings.
  if (lm.category === 'other') {
    const f = lm.footprint;
    const r = f.kind === 'rect' ? Math.hypot(f.w, f.d) / 2 : f.kind === 'circle' ? f.r : f.kind === 'ellipse' ? Math.max(f.rx, f.rz) : Math.max(...f.points.map(([x, z]) => Math.hypot(x - lm.center[0], z - lm.center[1])));
    if (r > 100) return false;
  }
  return true;
}

interface Prepared {
  lm: Landmark;
  cx: number;
  cz: number;
  cos: number;
  sin: number;
  /** Bounding radius, game m. */
  r: number;
  /** Poly footprints in game coordinates. */
  poly?: [number, number][];
  /** Poly footprints: the generic builder's box collider (local frame: centre and half size, game m). */
  box?: { x: number; z: number; hx: number; hz: number };
  /** Open courts: only the perimeter wall (this thick, game m) is solid. */
  court?: number;
}

/** The box collider the generic builder gives a poly footprint (90% of its local bounding box). */
function polyBox(lm: Landmark, cos: number, sin: number): Prepared['box'] {
  const f = lm.footprint;
  if (f.kind !== 'poly') return undefined;
  const S = WORLD_SCALE;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [px, pz] of f.points) {
    const dx = (px - lm.center[0]) * S;
    const dz = (pz - lm.center[1]) * S;
    const lx = dx * cos + dz * sin;
    const lz = -dx * sin + dz * cos;
    x0 = Math.min(x0, lx);
    x1 = Math.max(x1, lx);
    z0 = Math.min(z0, lz);
    z1 = Math.max(z1, lz);
  }
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, hx: (x1 - x0) * 0.45, hz: (z1 - z0) * 0.45 };
}

let prepared: Prepared[] | null = null;
function solids(): Prepared[] {
  if (prepared) return prepared;
  const S = WORLD_SCALE;
  prepared = LANDMARKS.filter((lm) => isSolidLandmark(lm) || isOpenCourt(lm)).map((lm) => {
    const [cx, cz] = toGame(lm.center[0], lm.center[1]);
    const th = (lm.rotation * Math.PI) / 180;
    const f = lm.footprint;
    let r: number;
    let poly: [number, number][] | undefined;
    if (f.kind === 'rect') r = (Math.hypot(f.w, f.d) / 2) * S;
    else if (f.kind === 'circle') r = f.r * S;
    else if (f.kind === 'ellipse') r = Math.max(f.rx, f.rz) * S;
    else {
      poly = f.points.map(([x, z]) => toGame(x, z) as [number, number]);
      r = Math.max(...poly.map(([x, z]) => Math.hypot(x - cx, z - cz)));
    }
    const court = isOpenCourt(lm) && f.kind === 'rect' ? Math.max(1.2, Math.min(f.w, f.d) * S * 0.04) : undefined;
    return { lm, cx, cz, cos: Math.cos(th), sin: Math.sin(th), r, poly, box: polyBox(lm, Math.cos(th), Math.sin(th)), court };
  });
  return prepared;
}

function insidePrepared(p: Prepared, x: number, z: number, margin: number): boolean {
  const dx = x - p.cx;
  const dz = z - p.cz;
  if (dx * dx + dz * dz > (p.r + margin) * (p.r + margin)) return false;
  const S = WORLD_SCALE;
  const f = p.lm.footprint;
  // Local frame: +x along the façade, -z out of it (src/world/landmarks/footprint.ts).
  const lx = dx * p.cos + dz * p.sin;
  const lz = -dx * p.sin + dz * p.cos;
  if (f.kind === 'rect') {
    const hx = (f.w / 2) * S;
    const hz = (f.d / 2) * S;
    const outer = Math.abs(lx) <= hx + (p.court ?? 0) / 2 + margin && Math.abs(lz) <= hz + (p.court ?? 0) / 2 + margin;
    if (!outer || p.court === undefined) return outer;
    // An open court: inside, clear of the wall band, is open ground.
    const inner = Math.abs(lx) < hx - p.court / 2 - margin && Math.abs(lz) < hz - p.court / 2 - margin;
    return !inner;
  }
  if (f.kind === 'circle') return Math.hypot(lx, lz) <= f.r * S + margin;
  if (f.kind === 'ellipse') {
    const a = f.rx * S + margin;
    const b = f.rz * S + margin;
    return (lx / a) ** 2 + (lz / b) ** 2 <= 1;
  }
  const b = p.box;
  if (b && Math.abs(lx - b.x) <= b.hx + margin && Math.abs(lz - b.z) <= b.hz + margin) return true;
  return pointInPoly(p.poly!, x, z) || distToPoly(p.poly!, x, z) <= margin;
}

/** Is the game point (x, z) inside this landmark's footprint (grown by `margin`)? */
export function footprintContains(lm: Landmark, x: number, z: number, margin = 0): boolean {
  const p = solids().find((s) => s.lm === lm);
  if (p) return insidePrepared(p, x, z, margin);
  // Open landmarks are not in the solid list; build a one-off record.
  const [cx, cz] = toGame(lm.center[0], lm.center[1]);
  const th = (lm.rotation * Math.PI) / 180;
  const f = lm.footprint;
  const poly = f.kind === 'poly' ? f.points.map(([px, pz]) => toGame(px, pz) as [number, number]) : undefined;
  return insidePrepared({ lm, cx, cz, cos: Math.cos(th), sin: Math.sin(th), r: Infinity, poly }, x, z, margin);
}

/** The solid landmark whose footprint contains (x, z), grown by `margin` (game m), or null. */
export function solidLandmarkAt(x: number, z: number, margin = 0.5): Landmark | null {
  for (const p of solids()) if (insidePrepared(p, x, z, margin)) return p.lm;
  return null;
}

/**
 * Move a point out of any solid footprint: along the line from the landmark's centre through the
 * point (along the façade normal if it sits on the centre), to `margin` beyond the edge. Repeats a
 * few times for neighbours. Pure.
 */
export function pushOutOfFootprints(x: number, z: number, margin = 0.8): { x: number; z: number; from: string | null } {
  const x0 = x;
  const z0 = z;
  let from: string | null = null;
  for (let iter = 0; iter < 6; iter++) {
    const p = solids().find((s) => insidePrepared(s, x, z, margin));
    if (!p) break;
    from ??= p.lm.id;
    if (p.court !== undefined && p.lm.footprint.kind === 'rect') {
      // A court's wall: step to whichever side of it is nearer (into the court or out of it).
      const S = WORLD_SCALE;
      const f = p.lm.footprint;
      const lx = (x - p.cx) * p.cos + (z - p.cz) * p.sin;
      const lz = -(x - p.cx) * p.sin + (z - p.cz) * p.cos;
      const hx = (f.w / 2) * S;
      const hz = (f.d / 2) * S;
      const t = p.court / 2 + margin + 0.05;
      const ox = Math.abs(lx) <= hx ? hx - t - Math.abs(lx) : hx + t - Math.abs(lx);
      const oz = Math.abs(lz) <= hz ? hz - t - Math.abs(lz) : hz + t - Math.abs(lz);
      let nx = lx;
      let nz = lz;
      // The smaller move wins; moves are signed along the axis away from (or toward) the centre.
      if (Math.abs(lx) > hx - t && (Math.abs(ox) <= Math.abs(oz) || Math.abs(lz) <= hz - t)) nx = Math.sign(lx || 1) * (Math.abs(lx) + ox);
      else nz = Math.sign(lz || 1) * (Math.abs(lz) + oz);
      x = p.cx + nx * p.cos - nz * p.sin;
      z = p.cz + nx * p.sin + nz * p.cos;
      continue;
    }
    let dx = x - p.cx;
    let dz = z - p.cz;
    let len = Math.hypot(dx, dz);
    if (len < 0.5) {
      // On the centre: out of the front, like a visitor.
      dx = p.sin;
      dz = -p.cos;
      len = 1;
    }
    dx /= len;
    dz /= len;
    let t = 0;
    while (t < 600 && insidePrepared(p, x + dx * t, z + dz * t, margin)) t += 0.25;
    x += dx * t;
    z += dz * t;
  }
  const stuck = (px: number, pz: number) => solids().some((s) => insidePrepared(s, px, pz, margin));
  if (from && stuck(x, z)) {
    // Wedged between neighbours (an arch against a portico's wall): the nearest clear point around.
    for (let r = 0.5; r <= 80; r += 0.5) {
      for (let k = 0; k < 32; k++) {
        const a = (k / 32) * Math.PI * 2;
        const qx = x0 + Math.cos(a) * r;
        const qz = z0 + Math.sin(a) * r;
        if (!stuck(qx, qz)) return { x: round2(qx), z: round2(qz), from };
      }
    }
  }
  return { x: round2(x), z: round2(z), from };
}

/** Game point in front of a landmark's façade, `out` metres beyond the footprint edge, `side` to its right. */
export function frontOf(lm: Landmark, out = 2.5, side = 0): { x: number; z: number } {
  const S = WORLD_SCALE;
  const [cx, cz] = toGame(lm.center[0], lm.center[1]);
  const th = (lm.rotation * Math.PI) / 180;
  const f = lm.footprint;
  let half: number;
  if (f.kind === 'rect') half = (f.d / 2) * S;
  else if (f.kind === 'circle') half = f.r * S;
  else if (f.kind === 'ellipse') half = f.rz * S;
  else {
    // Poly: walk out of the polygon along the façade normal.
    const poly = f.points.map(([px, pz]) => toGame(px, pz) as [number, number]);
    half = 0;
    while (half < 600 && pointInPoly(poly, cx + Math.sin(th) * half + Math.cos(th) * side, cz - Math.cos(th) * half + Math.sin(th) * side)) half += 0.5;
  }
  const fwd = half + out;
  return { x: round2(cx + Math.sin(th) * fwd + Math.cos(th) * side), z: round2(cz - Math.cos(th) * fwd + Math.sin(th) * side) };
}

function pointInPoly(poly: [number, number][], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function distToPoly(poly: [number, number][], x: number, z: number): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j];
    const [bx, bz] = poly[i];
    const l2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / l2));
    best = Math.min(best, Math.hypot(x - (ax + (bx - ax) * t), z - (az + (bz - az) * t)));
  }
  return best;
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}

// ------------------------------------------------------------------ run time

export interface Spot {
  x: number;
  /** Street level (the walkable surface). */
  y: number;
  z: number;
}

export interface WallHit {
  point: THREE.Vector3;
  /** Horizontal outward normal of the wall. */
  normal: THREE.Vector3;
  distance: number;
}

interface PhysicsLike {
  groundHeight?(x: number, z: number, fromY?: number, maxDist?: number): number | null;
  overlapSphere?(c: THREE.Vector3Like, r: number, layers?: number): unknown[];
  raycast?(o: THREE.Vector3Like, d: THREE.Vector3Like, maxDist: number, layers?: number): { point: THREE.Vector3; normal: THREE.Vector3; distance: number } | null;
}

const RINGS = [0.8, 1.6, 2.4, 3.3, 4.4, 5.6, 7, 8.5, 10, 12, 14.5, 17, 20, 24];

/**
 * Rapier answers ray and shape queries from the state of its last step: colliders the world added
 * since (all of Rome, while the loading screen is up) are invisible to them until the next one. A
 * step of a tenth of a millisecond brings the queries up to date without moving anything visibly.
 * Call it once before probing a freshly built world.
 */
export function refreshQueries(game: Game) {
  const ph = game.physics as unknown as { step?(dt: number): void } | undefined;
  try {
    ph?.step?.(1e-4);
  } catch (err) {
    console.warn('[content] could not refresh the physics queries', err);
  }
}

/**
 * Run-time placement: finds free street points (see the file comment) and remembers what content
 * has claimed, so an altar, its offering box and a notice do not end up in one another.
 */
export class Placer {
  private claims: { x: number; z: number; r: number }[] = [];
  private readonly physics: PhysicsLike | undefined;
  private readonly hm: { heightAt(x: number, z: number): number; waterLevelY?: number } | undefined;

  constructor(game: Game) {
    this.physics = game.physics as unknown as PhysicsLike | undefined;
    this.hm = (game as unknown as { heightmap?: { heightAt(x: number, z: number): number; waterLevelY?: number } }).heightmap;
  }

  /** Whether the world can be probed (physics with a ground query). */
  get probing(): boolean {
    return typeof this.physics?.groundHeight === 'function';
  }

  /** Terrain height (no buildings), or 0. */
  terrain(x: number, z: number): number {
    return this.hm ? this.hm.heightAt(x, z) : 0;
  }

  /** Street level at (x, z), or null when something stands there (a roof, a podium, a wall, a claim). */
  levelAt(x: number, z: number, clearance = 0.35, claim = clearance): number | null {
    for (const c of this.claims) if ((c.x - x) ** 2 + (c.z - z) ** 2 < (c.r + claim) ** 2) return null;
    const base = this.terrain(x, z);
    const ph = this.physics;
    if (!ph?.groundHeight) return base;
    const hit = ph.groundHeight(x, z, base + 30, 45);
    const top = typeof hit === 'number' && Number.isFinite(hit) ? hit : base;
    if (top - base > 0.9) return null;
    // Not in the river (the riverbed is terrain too).
    const water = this.hm?.waterLevelY;
    if (water !== undefined && Number.isFinite(water) && top < water + 0.2) return null;
    if (ph.overlapSphere && ph.overlapSphere({ x, y: top + 0.95, z }, clearance, Layer.World).length) return null;
    return top;
  }

  /**
   * The free street point nearest to (x, z): first out of solid atlas footprints, then rings of
   * probes. `away` (a point) makes the search try directions away from it first.
   */
  find(x: number, z: number, opts: { clearance?: number; claim?: number; away?: { x: number; z: number } } = {}): Spot {
    return this.tryFind(x, z, opts) ?? (() => {
      const start = pushOutOfFootprints(x, z);
      return { x: start.x, y: this.groundY(start.x, start.z), z: start.z };
    })();
  }

  /** Like `find`, but null when there is no free street within 24 m (the place is buried in a building). */
  tryFind(x: number, z: number, opts: { clearance?: number; claim?: number; away?: { x: number; z: number } } = {}): Spot | null {
    const clearance = opts.clearance ?? 0.35;
    const claimR = opts.claim ?? clearance;
    const start = pushOutOfFootprints(x, z);
    const y0 = this.levelAt(start.x, start.z, clearance, claimR);
    if (y0 !== null) return { x: start.x, y: y0, z: start.z };
    let a0 = 0;
    if (opts.away) a0 = Math.atan2(start.z - opts.away.z, start.x - opts.away.x);
    for (const r of RINGS) {
      const n = r < 3 ? 12 : 16;
      for (let k = 0; k < n; k++) {
        // Alternate either side of the preferred direction: 0, +1, -1, +2, -2…
        const step = k % 2 ? (k + 1) / 2 : -k / 2;
        const a = a0 + (step / n) * Math.PI * 2;
        const qx = start.x + Math.cos(a) * r;
        const qz = start.z + Math.sin(a) * r;
        if (solidLandmarkAt(qx, qz, 0.4)) continue;
        const y = this.levelAt(qx, qz, clearance, claimR);
        if (y !== null) return { x: round2(qx), y, z: round2(qz) };
      }
    }
    return null;
  }

  /** Street-level y at a point even if it is not free (short probe, so it never lands on a roof). */
  groundY(x: number, z: number): number {
    const base = this.terrain(x, z);
    const g = this.physics?.groundHeight?.(x, z, base + 2.5, 6);
    return typeof g === 'number' && Number.isFinite(g) ? g : base;
  }

  /** Remember that content stands here (radius r). */
  claim(x: number, z: number, r: number) {
    this.claims.push({ x, z, r });
  }

  /** Walls around a point: horizontal rays at height y, nearest first. */
  walls(x: number, y: number, z: number, maxDist: number, rays = 24): WallHit[] {
    const ph = this.physics;
    if (!ph?.raycast) return [];
    const out: WallHit[] = [];
    for (let k = 0; k < rays; k++) {
      const a = (k / rays) * Math.PI * 2;
      const dir = { x: Math.cos(a), y: 0, z: Math.sin(a) };
      const hit = ph.raycast({ x, y, z }, dir, maxDist, Layer.World);
      if (!hit || hit.distance < 0.05 || Math.abs(hit.normal.y) > 0.35) continue;
      const n = new THREE.Vector3(hit.normal.x, 0, hit.normal.z).normalize();
      // The ray must meet the wall face-on enough to hang something on it.
      if (n.x * dir.x + n.z * dir.z > -0.35) continue;
      out.push({ point: hit.point.clone(), normal: n, distance: hit.distance });
    }
    return out.sort((a, b) => a.distance - b.distance);
  }

  /** Re-aim at a wall from `back` metres in front of a point on it (exact surface and normal), or null. */
  wallAt(p: THREE.Vector3Like, normal: THREE.Vector3Like, back = 1): WallHit | null {
    const ph = this.physics;
    if (!ph?.raycast) return null;
    const o = { x: p.x + normal.x * back, y: p.y, z: p.z + normal.z * back };
    const hit = ph.raycast(o, { x: -normal.x, y: 0, z: -normal.z }, back + 1.2, Layer.World);
    if (!hit || hit.distance < 0.05 || Math.abs(hit.normal.y) > 0.35) return null;
    return { point: hit.point.clone(), normal: new THREE.Vector3(hit.normal.x, 0, hit.normal.z).normalize(), distance: hit.distance };
  }
}
