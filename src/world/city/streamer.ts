/**
 * CityStreamer: level of detail and lazy building for the city, run after the WorldRegistry.
 *
 * Every block always has its far stand-in (massing.ts) in the shared far batch. Blocks of the
 * detail area also get, built lazily (nearest first) and dropped again well beyond their range,
 * the CityBlockFiller's levels:
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
 * and scaled by the view-distance setting, like the registry's. Build order and reach use the
 * nearer of the camera and where it will be in two seconds (its velocity), so blocks ahead of a
 * walker are ready before they are needed.
 *
 * A block level is built as a job of small units (fill.ts: the yard, each lot, each back insula,
 * walls, torches), one unit per step, within a per-frame time budget: no frame pays for a whole
 * block.
 */
import * as THREE from 'three';
import type { Game, System } from '../../core/Game';
import type { RAPIER } from '../../core/Physics';
import type { Spot } from '../../arch/fabric/types';
import { MeshBuilder, type ColliderSpec } from '../../gfx/MeshBuilder';
import { BatchHandle, type BatchPool, type BatchRef } from './batches';
import { fillUnits, type FillUnit } from './fill';
import type { BlockLayout, HeightFn } from './massing';
import type { PlanBlock } from './plan';
import type { CellWork } from './roads';
import { torchFlames } from './life';

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
  /** Build distance: the nearer of the camera's and its look-ahead point's. */
  dp?: number;
}

export interface CellRec {
  work: CellWork;
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
  y: number;
  near: { handle: BatchHandle; colliders: RAPIER.Collider[] } | null;
  /** Street furniture and props (built within `detailR`). */
  detail: { handle: BatchHandle; colliders: RAPIER.Collider[] } | null;
  far: BatchHandle | null;
  d: number;
  dp?: number;
}

/** A block level being built unit by unit. */
interface Job {
  r: BlockRec;
  level: Level;
  it: Generator<FillUnit, void, void>;
  refs: BatchRef[];
  colliders: RAPIER.Collider[];
  spots: Spot[];
  ms: number;
}

export interface StreamerOptions {
  nearR?: number;
  midR?: number;
  lowR?: number;
  cellR?: number;
  /** Street furniture / props of the cells. */
  detailR?: number;
  farMax?: number;
  /** Max milliseconds of building per frame (one step always runs when something is due). */
  budgetMs?: number;
  /** Seconds of camera motion to look ahead when ordering builds. */
  lookAhead?: number;
  /** Do mid-level blocks cast shadows? */
  midShadows?: boolean;
  /**
   * Triangle budget of the whole frame (game.stats): above `high` the mid level's shadows go off
   * (the shadow pass is the city's dearest part), below `low` they come back.
   */
  shadowBudget?: { high: number; low: number };
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
  private vel = new THREE.Vector3();
  private ahead = new THREE.Vector3();
  private lastT = 0;
  private frame = 0;
  private job: Job | null = null;
  /** Builds done so far and their cost (debug); `maxStepMs` is the longest single step. */
  builds = { full: 0, mid: 0, low: 0, cell: 0, ms: 0, fullMs: 0, midMs: 0, lowMs: 0, cellMs: 0, units: 0, maxStepMs: 0 };
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
    this.o = { nearR: 30, midR: 85, lowR: 140, cellR: 230, detailR: 110, farMax: 3200, budgetMs: 5, lookAhead: 2, midShadows: true, shadowBudget: { high: 2.45e6, low: 2.0e6 }, ...opts };
    if (!this.o.midShadows) pool.setShadows('mid', false);
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
    this.vel.set(0, 0, 0);
    this.evaluate(pos);
    const s = this.scale;
    const lim = { full: this.o.nearR * s, mid: this.o.midR * s, low: Math.min(this.o.lowR, 140) * s, cell: Math.min(this.o.cellR, 200) * s, detail: this.o.detailR * s };
    let guard = 0;
    while (this.step(lim) && guard++ < 8000);
    this.applyVisibility();
  }

  lateUpdate() {
    const cam = this.game.camera.position;
    this.frame++;
    this.pool.sync();
    const now = performance.now();
    const dt = Math.min(0.25, Math.max(1e-3, (now - this.lastT) / 1000));
    this.lastT = now;
    // A jump (teleport, loaded save, a new spawn): build what the new place needs right away
    // rather than streaming it in over the next seconds.
    if (cam.distanceToSquared(this.prevCam) > 80 * 80) {
      this.prevCam.copy(cam);
      this.prime(cam);
      return;
    }
    // Smoothed camera velocity, for the look-ahead point.
    this.vel.lerp(TMP.copy(cam).sub(this.prevCam).divideScalar(dt), 0.08);
    this.prevCam.copy(cam);
    if (cam.distanceToSquared(this.lastPos) > 4 || this.frame % 20 === 0) this.evaluate(cam);
    // Units of a few ms each, within the frame budget; at least one every other frame while
    // something is due, every frame when something close is missing.
    let n = 0;
    if (this.frame % 2 === 0 || this.urgent()) {
      const t0 = performance.now();
      while (performance.now() - t0 < this.o.budgetMs || n === 0) {
        const s0 = performance.now();
        if (!this.step()) break;
        this.builds.maxStepMs = Math.max(this.builds.maxStepMs, performance.now() - s0);
        n++;
      }
    }
    if (n) this.evaluate(cam);
    this.applyVisibility();
    if (this.frame % 30 === 0) this.shadowBudget();
  }

  /** Mid-level shadows follow the frame's triangle count (with hysteresis). */
  private midShadowsOn = true;
  private shadowBudget() {
    if (!this.o.midShadows) return;
    const tris = this.game.stats.triangles;
    const { high, low } = this.o.shadowBudget;
    if (this.midShadowsOn && tris > high) this.midShadowsOn = false;
    else if (!this.midShadowsOn && tris < low) this.midShadowsOn = true;
    else return;
    this.pool.setShadows('mid', this.midShadowsOn);
  }

  private evaluate(pos: THREE.Vector3) {
    this.lastPos.copy(pos);
    // Where the camera will be in `lookAhead` s (at most 40 m away).
    const a = this.ahead.copy(this.vel).setY(0).multiplyScalar(this.o.lookAhead);
    if (a.length() > 40) a.setLength(40);
    a.add(pos);
    for (const r of this.blocks) {
      r.d = Math.max(0, Math.hypot(r.center.x - pos.x, r.center.z - pos.z, (r.center.y - pos.y) * 0.5) - r.blk.radius * 0.8);
      const da = Math.max(0, Math.hypot(r.center.x - a.x, r.center.z - a.z, (r.center.y - pos.y) * 0.5) - r.blk.radius * 0.8);
      r.dp = Math.min(r.d, da);
    }
    for (const c of this.cells) {
      c.d = cellDist(c, pos.x, pos.z, pos.y);
      c.dp = Math.min(c.d, cellDist(c, a.x, a.z, pos.y));
    }
  }

  /** A block next to the camera without its full level, or a street cell close by without geometry. */
  private urgent(): boolean {
    const s = this.scale;
    for (const r of this.blocks) if (!r.levels.full && r.layout && r.blk.detailed && r.d < this.o.nearR * 0.6 * s) return true;
    for (const c of this.cells) if ((!c.near || (!c.detail && c.work.detail.length)) && c.d < 50 * s) return true;
    return false;
  }

  /** Is a block level due (not built, not being built, within reach)? */
  private due(r: BlockRec, l: Level, lim?: Record<Level | 'cell' | 'detail', number>) {
    if (r.levels[l] || (this.job && this.job.r === r && this.job.level === l)) return false;
    const reach = lim?.[l] ?? this.radius(l) * 1.25 + 10;
    return (r.dp ?? r.d) < reach;
  }

  /** Run evictions and the most urgent build. Returns false when nothing is due. */
  private step(lim?: Record<Level | 'cell' | 'detail', number>): boolean {
    const s = this.scale;
    for (const r of this.blocks) {
      // Dropped a little beyond their build reach (hysteresis), so hidden levels do not pile up in memory.
      for (const l of LEVELS) if (r.levels[l] && r.d > this.radius(l) * 1.35 + 16) this.drop(r, l);
    }
    for (const c of this.cells) {
      if (c.near && c.d > this.o.cellR * 1.5 * s) this.dropCell(c);
      if (c.detail && c.d > this.o.detailR * 1.5 * s) this.dropDetail(c);
    }
    // A job whose block went out of reach meanwhile is abandoned.
    const job = this.job;
    if (job && job.r.d > this.radius(job.level) * 1.35 + 16) this.abort();
    const t0 = performance.now();
    if (this.job) {
      this.advance();
      this.builds.ms += performance.now() - t0;
      return true;
    }
    let best: (() => void) | null = null, bp = Infinity;
    for (const r of this.blocks) {
      if (!r.layout || !r.blk.detailed) continue;
      const d = r.dp ?? r.d;
      for (const l of LEVELS) {
        if (d + BIAS[l] < bp && this.due(r, l, lim)) {
          bp = d + BIAS[l];
          best = () => this.start(r, l);
        }
      }
    }
    const cellLim = lim?.cell ?? this.o.cellR * s;
    const detailLim = lim?.detail ?? this.o.detailR * s;
    for (const c of this.cells) {
      const d = c.dp ?? c.d;
      if (!c.near && d < cellLim && d - 40 < bp) { bp = d - 40; best = () => this.buildCell(c); }
      if (!c.detail && c.work.detail.length && d < detailLim && d - 20 < bp) { bp = d - 20; best = () => this.buildDetail(c); }
    }
    if (!best) return false;
    best();
    this.builds.ms += performance.now() - t0;
    return true;
  }

  /** Start building a block level (and build its first unit). */
  private start(r: BlockRec, l: Level) {
    this.job = { r, level: l, it: fillUnits(r.blk, r.layout!, l, this.H), refs: [], colliders: [], spots: [], ms: 0 };
    this.advance();
  }

  /** Build the job's next unit into the batches (hidden), or finish the level. */
  private advance() {
    const job = this.job!;
    const t0 = performance.now();
    const { r, level: l } = job;
    const next = job.it.next();
    if (next.done) {
      const handle = new BatchHandle(job.refs);
      handle.visible = false; // every unit was added hidden
      r.levels[l] = handle;
      if (l === 'full') {
        r.colliders = job.colliders;
        r.spots = job.spots;
        this.onFull?.(r);
      }
      this.builds[l]++;
      this.builds[`${l}Ms`] += job.ms + performance.now() - t0;
      this.job = null;
      return;
    }
    const u = next.value;
    const group = u.builder.build(`city:${r.blk.id}:${l}`);
    // Wall torches: their flames go out by day (life.ts torchFlames).
    if (u.torches) group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.name.endsWith(':glow_fire')) m.material = torchFlames();
    });
    // The low level (beyond ~85 m) casts no shadows: the shadow pass is the expensive half there.
    const h = this.pool.addGroup(group, { offset: groundOffset, shadows: l !== 'low' && !u.torches, tag: l === 'mid' ? 'mid' : '' });
    h.setVisible(false);
    job.refs.push(...h.refs);
    if (l === 'full' && u.builder.colliders.length) job.colliders.push(...addColliders(this.game, u.builder.colliders, { city: r.blk.id }));
    for (const sp of u.spots) job.spots.push(sp);
    this.builds.units++;
    job.ms += performance.now() - t0;
  }

  /** Throw away a half-built level. */
  private abort() {
    const job = this.job;
    if (!job) return;
    new BatchHandle(job.refs).dispose();
    for (const c of job.colliders) this.game.physics.removeCollider(c);
    job.it.return();
    this.job = null;
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

  private buildDetail(c: CellRec) {
    const t0 = performance.now();
    const b = new MeshBuilder();
    for (const item of c.work.detail) {
      try {
        item(b);
      } catch (err) {
        console.warn('[city] street prop failed', c.work.key, err);
      }
    }
    const handle = this.pool.addGroup(b.build(`city:props:${c.work.key}`), { offset: groundOffset });
    handle.setVisible(false);
    c.detail = { handle, colliders: addColliders(this.game, b.colliders, { city: c.work.key }) };
    this.builds.cell++;
    this.builds.cellMs += performance.now() - t0;
  }

  private dropDetail(c: CellRec) {
    if (!c.detail) return;
    c.detail.handle.dispose();
    for (const col of c.detail.colliders) this.game.physics.removeCollider(col);
    c.detail = null;
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
      c.detail?.handle.setVisible(c.d < this.o.detailR * 1.5 * this.scale);
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
const TMP = new THREE.Vector3();

function cellDist(c: CellRec, x: number, z: number, y: number) {
  const dx = Math.max(c.bounds.minX - x, 0, x - c.bounds.maxX);
  const dz = Math.max(c.bounds.minZ - z, 0, z - c.bounds.maxZ);
  return Math.hypot(dx, dz, Math.max(0, Math.abs(y - c.y) - 40));
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
