/**
 * CityStreamer: level of detail and lazy building for the city, run after the WorldRegistry.
 *
 * Every block always has its far stand-in (massing.ts) in the shared far batch. Blocks of the
 * detail area also get, built lazily (nearest first, one build every other frame) and dropped
 * again well beyond their range, the CityBlockFiller's levels:
 *
 *   full  (interiors, props, colliders)        within `nearR`
 *   mid   (the street-facing exterior)         within `midR`
 *   low   (massing with openings painted on)   within `lowR`
 *   far   (merged flat-coloured stand-in)      beyond, up to `farMax`
 *
 * The best level built for a block's distance is shown (a finer one stands in while the right one
 * is still being built, then a coarser one), and the far stand-in hides exactly while a detailed
 * level shows. Street cells (roads, lanes, stairs, piazzas, ground cover) are built within
 * `cellR` of the camera and dropped beyond 1.5 × that.
 *
 * Distances are measured from the block's footprint (centroid distance minus most of its radius)
 * and scaled by the view-distance setting, like the registry's.
 */
import * as THREE from 'three';
import type { Game, System } from '../../core/Game';
import type { RAPIER } from '../../core/Physics';
import { fillBlock } from '../../arch/fabric/blockFiller';
import { insula, MAX_BUILDING_HEIGHT } from '../../arch/fabric/insula';
import type { Detail, Polygon, Spot } from '../../arch/fabric/types';
import { MeshBuilder, type ColliderSpec } from '../../gfx/MeshBuilder';
import type { BatchHandle, BatchPool } from './batches';
import type { BlockLayout, HeightFn } from './massing';
import type { PlanBlock } from './plan';
import type { CellWork } from './roads';
import { drawTorches } from './life';

export type Level = 'full' | 'mid' | 'low';
const LEVELS: Level[] = ['full', 'mid', 'low'];

export interface BlockRec {
  blk: PlanBlock;
  layout: BlockLayout | null;
  far: BatchHandle | null;
  levels: { full?: BatchHandle; mid?: BatchHandle; low?: BatchHandle };
  colliders: RAPIER.Collider[] | null;
  spots: Spot[] | null;
  center: THREE.Vector3;
  /** Distance from the camera at the last evaluation. */
  d: number;
}

export interface CellRec {
  work: CellWork;
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
  y: number;
  near: { handle: BatchHandle; colliders: RAPIER.Collider[] } | null;
  far: BatchHandle | null;
  d: number;
}

export interface StreamerOptions {
  nearR?: number;
  midR?: number;
  lowR?: number;
  cellR?: number;
  farMax?: number;
  /** Max milliseconds of building per frame (one build always runs when something is due). */
  budgetMs?: number;
}

const OFFSET_MATS = new Set(['paving_basalt', 'paving_travertine', 'cobbles', 'gravel', 'dirt', 'grass', 'dry_grass', 'sand', 'mud', 'mosaic']);
/** Ground-like materials get the polygon offset so they never fight the terrain. */
export const groundOffset = (m: THREE.Material) => OFFSET_MATS.has(m.name);

/** Build order bias per level (a missing full level near the player comes first). */
const BIAS: Record<Level, number> = { full: -30, mid: 0, low: 25 };

export class CityStreamer implements System {
  readonly name = 'cityStreamer';
  readonly priority = 96;
  private o: Required<StreamerOptions>;
  private lastPos = new THREE.Vector3(Infinity, 0, 0);
  private prevCam = new THREE.Vector3(Infinity, 0, 0);
  private frame = 0;
  /** Builds done so far and their cost (debug). */
  builds = { full: 0, mid: 0, low: 0, cell: 0, ms: 0, fullMs: 0, midMs: 0, lowMs: 0, cellMs: 0 };
  /** Called when a block's full level is built (exact spots available). */
  onFull?: (rec: BlockRec) => void;

  constructor(
    private readonly game: Game,
    private readonly pool: BatchPool,
    readonly blocks: BlockRec[],
    readonly cells: CellRec[],
    private readonly H: HeightFn,
    opts: StreamerOptions = {},
  ) {
    this.o = { nearR: 36, midR: 85, lowR: 190, cellR: 230, farMax: 3200, budgetMs: 6, ...opts };
  }

  private get scale() {
    return this.game.world?.distanceScale ?? 1;
  }

  private radius(l: Level) {
    return (l === 'full' ? this.o.nearR : l === 'mid' ? this.o.midR : this.o.lowR) * this.scale;
  }

  /** Build what the first frames need around `pos` right now (loading screen, teleports). */
  prime(pos: THREE.Vector3) {
    this.prevCam.copy(pos);
    this.evaluate(pos);
    const s = this.scale;
    const lim = { full: this.o.nearR * s, mid: this.o.midR * s, low: Math.min(this.o.lowR, 140) * s, cell: Math.min(this.o.cellR, 200) * s };
    let guard = 0;
    while (this.step(lim) && guard++ < 800);
    this.applyVisibility();
  }

  lateUpdate() {
    const cam = this.game.camera.position;
    this.frame++;
    // A jump (teleport, loaded save, a new spawn): build what the new place needs right away
    // rather than streaming it in over the next seconds.
    if (cam.distanceToSquared(this.prevCam) > 80 * 80) {
      this.prevCam.copy(cam);
      this.prime(cam);
      return;
    }
    this.prevCam.copy(cam);
    if (cam.distanceToSquared(this.lastPos) > 4 || this.frame % 20 === 0) this.evaluate(cam);
    // At most one build every other frame (a block takes 10–50 ms), unless something close is missing.
    let n = 0;
    if (this.frame % 2 === 0 || this.urgent()) {
      const t0 = performance.now();
      while (performance.now() - t0 < this.o.budgetMs || n === 0) {
        if (!this.step()) break;
        n++;
      }
    }
    if (n) this.evaluate(cam);
    this.applyVisibility();
  }

  private evaluate(pos: THREE.Vector3) {
    this.lastPos.copy(pos);
    for (const r of this.blocks) r.d = Math.max(0, Math.hypot(r.center.x - pos.x, r.center.z - pos.z, (r.center.y - pos.y) * 0.5) - r.blk.radius * 0.8);
    for (const c of this.cells) {
      const dx = Math.max(c.bounds.minX - pos.x, 0, pos.x - c.bounds.maxX);
      const dz = Math.max(c.bounds.minZ - pos.z, 0, pos.z - c.bounds.maxZ);
      c.d = Math.hypot(dx, dz, Math.max(0, Math.abs(pos.y - c.y) - 40));
    }
  }

  /** A block next to the camera without its full level, or a street cell close by without geometry. */
  private urgent(): boolean {
    const s = this.scale;
    for (const r of this.blocks) if (!r.levels.full && r.layout && r.blk.detailed && r.d < this.o.nearR * 0.6 * s) return true;
    for (const c of this.cells) if (!c.near && c.d < 60 * s) return true;
    return false;
  }

  /** Run evictions and the most urgent build. Returns false when nothing is due. */
  private step(lim?: Record<Level | 'cell', number>): boolean {
    const s = this.scale;
    for (const r of this.blocks) {
      for (const l of LEVELS) if (r.levels[l] && r.d > this.radius(l) * 1.6 + 20) this.drop(r, l);
    }
    for (const c of this.cells) if (c.near && c.d > this.o.cellR * 1.5 * s) this.dropCell(c);
    let best: (() => void) | null = null, bp = Infinity;
    for (const r of this.blocks) {
      if (!r.layout || !r.blk.detailed) continue;
      for (const l of LEVELS) {
        if (r.levels[l]) continue;
        const reach = lim?.[l] ?? this.radius(l) * 1.25 + 10;
        if (r.d < reach && r.d + BIAS[l] < bp) {
          bp = r.d + BIAS[l];
          best = () => this.build(r, l);
        }
      }
    }
    const cellLim = lim?.cell ?? this.o.cellR * s;
    for (const c of this.cells) {
      if (!c.near && c.d < cellLim && c.d - 40 < bp) { bp = c.d - 40; best = () => this.buildCell(c); }
    }
    if (!best) return false;
    const t0 = performance.now();
    best();
    this.builds.ms += performance.now() - t0;
    return true;
  }

  private build(r: BlockRec, l: Level) {
    const t0 = performance.now();
    const out = fillLevel(r, l, this.H);
    // The low level (beyond ~85 m) casts no shadows: the shadow pass is the expensive half there.
    const handle = this.pool.addGroup(out.builder.build(`city:${r.blk.id}:${l}`), { offset: groundOffset, shadows: l !== 'low' });
    handle.setVisible(false);
    r.levels[l] = handle;
    if (l === 'full') {
      r.colliders = addColliders(this.game, out.builder.colliders, { city: r.blk.id });
      r.spots = out.spots;
      this.onFull?.(r);
    }
    this.builds[l]++;
    this.builds[`${l}Ms`] += performance.now() - t0;
  }

  private drop(r: BlockRec, l: Level) {
    r.levels[l]?.dispose();
    r.levels[l] = undefined;
    if (l === 'full') {
      for (const col of r.colliders ?? []) this.game.physics.removeCollider(col);
      r.colliders = null;
      r.spots = null;
    }
  }

  private buildCell(c: CellRec) {
    const t0 = performance.now();
    const b = new MeshBuilder();
    for (const item of c.work.items) {
      try {
        item(b);
      } catch (err) {
        console.warn('[city] street item failed', c.work.key, err);
      }
    }
    const handle = this.pool.addGroup(b.build(`city:cell:${c.work.key}`), { offset: groundOffset });
    handle.setVisible(false);
    const colliders = addColliders(this.game, b.colliders, { city: c.work.key });
    c.near = { handle, colliders };
    this.builds.cell++;
    this.builds.cellMs += performance.now() - t0;
  }

  private dropCell(c: CellRec) {
    if (!c.near) return;
    c.near.handle.dispose();
    for (const col of c.near.colliders) this.game.physics.removeCollider(col);
    c.near = null;
  }

  /** The level a block should show at its distance, falling back to whatever is built. */
  private shownLevel(r: BlockRec): Level | null {
    const want = LEVELS.findIndex((l) => r.d < this.radius(l));
    if (want < 0) return null;
    // The wanted level, else a finer one already built, else a coarser one.
    if (r.levels[LEVELS[want]]) return LEVELS[want];
    for (let k = want - 1; k >= 0; k--) if (r.levels[LEVELS[k]]) return LEVELS[k];
    for (let k = want + 1; k < LEVELS.length; k++) if (r.levels[LEVELS[k]]) return LEVELS[k];
    return null;
  }

  private applyVisibility() {
    const farMax = this.o.farMax * this.scale;
    for (const r of this.blocks) {
      const show = this.shownLevel(r);
      for (const l of LEVELS) r.levels[l]?.setVisible(l === show);
      r.far?.setVisible(!show && r.d < farMax);
    }
    for (const c of this.cells) {
      const show = !!c.near && c.d < this.o.cellR * 1.5 * this.scale;
      c.near?.handle.setVisible(show);
      c.far?.setVisible(!show && c.d < farMax);
    }
  }

  /** Counts of levels currently shown (debug / tests). */
  shown() {
    const out = { full: 0, mid: 0, low: 0, far: 0, cells: 0 };
    for (const r of this.blocks) {
      const l = LEVELS.find((k) => r.levels[k]?.visible);
      if (l) out[l]++;
      else if (r.far?.visible) out.far++;
    }
    for (const c of this.cells) if (c.near?.handle.visible) out.cells++;
    return out;
  }
}

const Q = new THREE.Quaternion();

/** The CityBlockFiller's block at a detail level, plus the back insulae of the block's interior. */
export function fillLevel(r: BlockRec, detail: Detail, H: HeightFn) {
  const out = fillBlock(r.blk.outline as Polygon, { ...r.layout!.opts, detail });
  for (const bl of r.layout!.back) {
    const { c, u, v } = bl.obb;
    const groundAt = (lx: number, lz: number) => H(c[0] + u[0] * lx + v[0] * lz, c[1] + u[1] * lx + v[1] * lz) - bl.floorY;
    const ins = insula({
      width: bl.width, depth: bl.depth, seed: bl.seed, storeys: bl.storeys, wealth: r.blk.wealth, groundAt,
      sides: { left: true, right: true, back: true }, streetDressing: false, detail, maxHeight: MAX_BUILDING_HEIGHT,
    });
    const m = new THREE.Matrix4().makeTranslation(c[0], bl.floorY, c[1]).multiply(new THREE.Matrix4().makeRotationY(bl.rotationY));
    out.builder.append(ins.builder, m);
  }
  if (detail !== 'low') drawTorches(out.builder, r.layout!.torches);
  if (detail !== 'full') out.builder.colliders.length = 0;
  return out;
}

/** Register collider specs with physics and return the colliders (so they can be removed). */
export function addColliders(game: Game, specs: ColliderSpec[], owner?: unknown): RAPIER.Collider[] {
  const out: RAPIER.Collider[] = [];
  for (const s of specs) {
    if (s.kind === 'box') out.push(game.physics.addOrientedBox(s.center, s.half, s.rotation ?? Q, { owner }));
    else if (s.kind === 'cylinder') out.push(game.physics.addCylinder(s.center, s.halfHeight, s.radius, { owner }));
    else out.push(game.physics.addTrimesh(s.geometry, s.matrix, { owner }));
  }
  return out;
}
