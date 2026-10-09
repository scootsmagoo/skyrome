/**
 * The Column's two interior cells (mq-04, spec §3.2 and §3.3). `dun-columna` is the stair inside
 * the Column's well: a vestibule and chamber under the court, then 185 risers of spiral stair lit
 * by 43 slit windows, up to a top landing under a cap. `columna-summa` is the 1:1 platform on the
 * abacus: a marble slab with the bronze rail, the drum and the gilded emperor, reached through the
 * little bronze door at the top of the stair. Both live in their own frames away from the world
 * (the stair 120 m under the court, the platform on the abacus) and are hidden outside; the player
 * moves between them and the world through doors (InteriorSystem).
 *
 * Local frames (metres, 1:1): the stair cell's origin is the Column's axis, its door side −z.
 * The platform's origin is the abacus top on the same axis.
 */
import * as THREE from 'three';
import { armoredEmperor } from '../../arch/classical/statues';
import { spiralStairs, type SpiralResult, type SpiralSpec } from '../../arch/common/spiral';
import type { Game } from '../../core/Game';
import { MeshBuilder } from '../../gfx/MeshBuilder';
import type { MaterialId } from '../../gfx/materialIds';
import { COLUMN_LOCAL, columnHeading, columnLocalToWorld, columnRotation } from '../landmarks/columnFrame';
import { Lamps } from '../landmarks/builders/trajan-lights';
import type { Spot } from '../landmarks/types';
import type { InteriorBuild, InteriorDef, InteriorOrigin, Vec3 } from './types';

export const DUN_COLUMNA = 'dun-columna';
export const COLUMNA_SUMMA = 'columna-summa';

/** The stair cell sits this far under the Column's axis (its own pocket, hidden outside). */
const SINK = 120;
/** The stair (spec §3.2): 185 risers, 18 steps a turn, quarter-turn landings after steps 62 and 124. */
const STAIR: SpiralSpec = {
  count: 185,
  rise: 0.19,
  stepsPerTurn: 18,
  innerR: 0.32,
  outerR: 1.35,
  // Step 0 starts at the vestibule mouth, which opens on the well toward −z (angle π).
  startAngle: Math.PI,
  landings: [
    { after: 62, turns: 0.25 },
    { after: 124, turns: 0.25 },
  ],
};
const WELL_IN = 1.35;
const WELL_OUT = 1.8;
const WALL_R = (WELL_IN + WELL_OUT) / 2;
const TAU = Math.PI * 2;
/** The vestibule opens on the well at this angle (toward −z), half a radian wide at the wall. */
const MOUTH = Math.PI;
const MOUTH_HALF = 0.45;
const CEILING = 2.5;
/** The well's cap sits this far above the top landing (its underside), and the wall stands to 0.2 m over it. */
const CAP_ABOVE = 2.6;
/** Slit windows (spec §3.2): 43 of them, evenly along the helix, sill 1.1 m above the tread. */
const SLITS = 43;
const SLIT_W = 0.12;
const SLIT_H = 0.85;
const SLIT_SILL = 1.1;
const SLIT_HALF = SLIT_W / 2 / WALL_R;
/** The platform's slab, rail and drum (spec §3.3). */
const SLAB = 2.6;
const RAIL_H = 1.05;
const RAIL_X = 2.5;
const DRUM_R = 0.95;
const DRUM_H = 1.45;
/** The Column top's LOD chunk, hidden while the player stands on the platform. */
const COLUMN_TOP = 'column-trajan:lod:column-top';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- shared helpers

/** The stair's walking plan, worked out once without a scene (the doors need the top point before any build). */
let plan: SpiralResult | null = null;
function stairPlan(): SpiralResult {
  plan ??= spiralStairs(new MeshBuilder(), STAIR);
  return plan;
}

/** A box between two corners, solid or visual only. */
function blk(b: MeshBuilder, mat: MaterialId, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, collide = true) {
  b.box(mat, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), new THREE.Matrix4().makeTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), { collide });
}

/** A collider with no visible box (the bronze rail's solid part). */
function collideBox(b: MeshBuilder, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
  b.collider({ kind: 'box', center: V((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), half: V(Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, Math.abs(z1 - z0) / 2) });
}

/** The matrix that puts a wall-like box on the well's radius at angle `a`, its x across the radius. */
function radial(r: number, a: number, y: number): THREE.Matrix4 {
  return new THREE.Matrix4().makeTranslation(r * Math.sin(a), y, r * Math.cos(a)).multiply(new THREE.Matrix4().makeRotationY(a - Math.PI / 2));
}

/** A cut in the well wall: an angle range and a height range. */
interface Cut {
  a0: number;
  a1: number;
  y0: number;
  y1: number;
}

/** The cut at angle `a` (± `half`), split where it wraps past 0 or 2π. */
function cutAt(a: number, half: number, y0: number, y1: number): Cut[] {
  const c = ((a % TAU) + TAU) % TAU;
  const lo = c - half;
  const hi = c + half;
  const out: Cut[] = [{ a0: Math.max(lo, 0), a1: Math.min(hi, TAU), y0, y1 }];
  if (lo < 0) out.push({ a0: lo + TAU, a1: TAU, y0, y1 });
  if (hi > TAU) out.push({ a0: 0, a1: hi - TAU, y0, y1 });
  return out;
}

/** One wall piece of the well between angles a0 and a1, heights y0..y1 (a visible box and its collider). */
function wallPiece(b: MeshBuilder, a0: number, a1: number, y0: number, y1: number) {
  const am = (a0 + a1) / 2;
  const t = WELL_OUT - WELL_IN + 0.02;
  b.box('travertine', t, y1 - y0, WALL_R * (a1 - a0) * 1.02, radial(WALL_R, am, (y0 + y1) / 2), { collide: true });
}

/**
 * The well wall as 24 segments per turn, each cut where the cuts (the vestibule mouth and the
 * slit windows) run through it, so every opening is a real hole and nothing else is removed.
 */
function wellWall(b: MeshBuilder, cuts: Cut[], top: number) {
  const N = 24;
  for (let k = 0; k < N; k++) {
    const s0 = (k / N) * TAU;
    const s1 = ((k + 1) / N) * TAU;
    const inner = cuts.filter((c) => c.a1 > s0 && c.a0 < s1);
    const xs = [s0, s1];
    for (const c of inner) xs.push(Math.min(Math.max(c.a0, s0), s1), Math.min(Math.max(c.a1, s0), s1));
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i++) {
      const u = xs[i];
      const v = xs[i + 1];
      if (v - u < 1e-6) continue;
      const mid = (u + v) / 2;
      const blocked = inner
        .filter((c) => c.a0 <= mid && mid <= c.a1)
        .map((c) => [c.y0, c.y1] as [number, number])
        .sort((p, q) => p[0] - q[0]);
      let y = 0;
      for (const [s, e] of blocked) {
        if (s > y) wallPiece(b, u, v, y, s);
        y = Math.max(y, e);
      }
      if (y < top) wallPiece(b, u, v, y, top);
    }
  }
}

// ---------------------------------------------------------------- dun-columna: the stair

const lampsOf = new WeakMap<THREE.Object3D, Lamps>();

/** The stair cell's door-side point of the vestibule, its far (inner) door and the mouth on the well. */
const ENTRY: Vec3 = { x: 0, y: 0, z: -3.1 };
const MOUTH_POINT: Vec3 = { x: 0, y: 0, z: -1.45 };

function buildDun(ctx: { builder(): MeshBuilder }): InteriorBuild {
  const b = ctx.builder();
  const stair = spiralStairs(b, STAIR);
  const H = stair.height;
  const top = H + CAP_ABOVE + 0.2;

  // The well wall, cut for the vestibule mouth and each slit window.
  const cuts: Cut[] = cutAt(MOUTH, MOUTH_HALF, -1, CEILING);
  const slitSteps = Array.from({ length: SLITS }, (_, i) => Math.floor(((i + 0.5) * STAIR.count) / SLITS));
  const slits: { a: number; y: number }[] = [];
  for (const s of slitSteps) {
    const a = stair.steps[s].angle;
    const y = stair.steps[s].y + SLIT_SILL;
    slits.push({ a, y });
    cuts.push(...cutAt(a, SLIT_HALF, y, y + SLIT_H));
  }
  wellWall(b, cuts, top);
  // Daylight: a pale plane just outside each slit (no collider).
  for (const s of slits) {
    b.box('glow_fire', 0.02, SLIT_H, SLIT_W, radial(WELL_OUT + 0.03, s.a, s.y + SLIT_H / 2));
  }

  // Well floor under the stair (the stair's first tread is 0.19 m up) and the cap over the top landing.
  b.add(new THREE.CylinderGeometry(WELL_OUT, WELL_OUT, 0.3, 24).translate(0, -0.15, 0), 'travertine');
  b.collider({ kind: 'cylinder', center: V(0, -0.15, 0), halfHeight: 0.15, radius: WELL_OUT });
  b.add(new THREE.CylinderGeometry(WELL_OUT, WELL_OUT, 0.2, 24).translate(0, H + CAP_ABOVE + 0.1, 0), 'travertine');
  b.collider({ kind: 'cylinder', center: V(0, H + CAP_ABOVE + 0.1, 0), halfHeight: 0.1, radius: WELL_OUT });

  // The vestibule (floor at 0): the bronze inner door at z = −3.6, the chamber to the −x side.
  blk(b, 'travertine', -3.1, -0.3, -3.9, 0.9, 0, -1.5);
  blk(b, 'travertine', -3.1, 0, -3.9, 0.9, 2.8, -3.6); // end wall, behind the door
  blk(b, 'bronze', -0.5, 0, -3.62, 0.5, 2.2, -3.6, false); // the door leaf
  blk(b, 'travertine', 0.6, 0, -3.6, 0.9, CEILING, -1.5); // vestibule, right wall
  blk(b, 'travertine', -0.9, 0, -3.6, -0.6, CEILING, -3.0); // vestibule, left wall (the chamber opening at z −3.0..−2.0)
  blk(b, 'travertine', -0.9, 0, -2.0, -0.6, CEILING, -1.5);
  blk(b, 'travertine', -3.1, 0, -3.9, -3.0, 2.8, -1.5); // chamber, far wall
  blk(b, 'travertine', -3.0, 0, -1.6, -0.9, 2.8, -1.5); // chamber, back wall
  blk(b, 'travertine', -3.1, CEILING, -3.9, 0.9, 2.8, -1.5); // ceiling over vestibule and chamber
  blk(b, 'marble', -2.95, 0, -3.0, -2.5, 0.9, -2.0); // the empty shelf

  // Spots: entry (vestibule, heading +z), chamber, the landings' centres and the top.
  const walkR = stair.walkR;
  const landingSpot = (k: number) => {
    const l = stair.landings[k];
    const a = (l.angle0 + l.angle1) / 2;
    return { p: V(walkR * Math.sin(a), l.y, walkR * Math.cos(a)), heading: a + Math.PI / 2 };
  };
  const l1 = landingSpot(0);
  const l2 = landingSpot(1);
  const topP = stair.pointAt(STAIR.count - 1);
  const spots: Spot[] = [
    { id: 'entry', kind: 'spawn', position: V(ENTRY.x, ENTRY.y, ENTRY.z), heading: 0 },
    { id: 'chamber', kind: 'spot', position: V(-2.0, 0, -2.6), heading: -Math.PI / 2 },
    { id: 'landing-1', kind: 'spot', position: l1.p, heading: l1.heading },
    { id: 'landing-2', kind: 'spot', position: l2.p, heading: l2.heading },
    // The angle grows as the stair climbs, so the walking tangent (the way up) is endAngle + π/2.
    { id: 'top', kind: 'spot', position: topP, heading: stair.endAngle + Math.PI / 2 },
  ];

  // Interior lamps: the vestibule, the two landings and the top.
  const lamps = new Lamps();
  lamps.add('interior', V(0, 2.1, -2.6));
  lamps.add('interior', l1.p.clone().add(V(0, 2.0, 0)));
  lamps.add('interior', l2.p.clone().add(V(0, 2.0, 0)));
  lamps.add('interior', topP.clone().add(V(0, 1.8, 0)));

  const object = b.build(DUN_COLUMNA);
  lampsOf.set(object, lamps);
  return { object, colliders: [...b.colliders], spots };
}

/**
 * The route in the stair cell: the entry, the vestibule mouth, then the stair's walking line, one
 * point per tread. Spec §3.2 asks for a point every 7 steps, but 60° chords (every 3rd tread) make a
 * 0.3 m townsman's capsule at 1.3 m/s fall off near step 75 (tests/columna.test.ts), so every tread
 * is kept: that walks at both speeds. Deviation from the spec, to be settled with the spiral owner.
 */
function dunRoute(): Vec3[] {
  return [ENTRY, MOUTH_POINT, ...stairPlan().route(1)];
}

function dunTop(): Vec3 {
  return stairPlan().pointAt(STAIR.count - 1);
}

/** The Column's stair door, as the world sees it (null-safe until the landmark is placed). */
function originOf(game: Game, local: { x: number; y: number; z: number }, dy: number): InteriorOrigin | null {
  const p = columnLocalToWorld(game, local);
  const rot = columnRotation(game);
  if (!p || rot === null) return null;
  return { x: p.x, y: p.y + dy, z: p.z, rotY: rot };
}

/** The view the player had before the stair switched them to first person. */
const viewBefore = new WeakMap<Game, string>();

export const dunColumna: InteriorDef = {
  id: DUN_COLUMNA,
  name: 'The stair of the Column',
  latin: 'Scalae columnae',
  origin: (game) => originOf(game, COLUMN_LOCAL.axis, -SINK),
  build: buildDun,
  bounds: { min: { x: -3.2, y: -0.5, z: -4.0 }, max: { x: 2.0, y: 39, z: 2.0 } },
  doors: [
    {
      id: 'dun-columna:in',
      label: 'The bronze door',
      verb: 'Enter the stair',
      at: (game) => columnLocalToWorld(game, COLUMN_LOCAL.door),
      from: null,
      to: { interior: DUN_COLUMNA, position: ENTRY, heading: 0 },
      locked: (game) => (game.quests?.flags?.get('columna-open') ? null : 'The bronze door is shut and sealed with lead.'),
    },
    {
      id: 'dun-columna:out',
      label: 'The bronze door',
      verb: 'Go out',
      at: V(0, 0, -3.4),
      from: DUN_COLUMNA,
      to: {
        interior: null,
        position: (game) => columnLocalToWorld(game, COLUMN_LOCAL.door),
        // Out of the door, facing away from it.
        heading: (game) => columnHeading(game, Math.PI) ?? 0,
      },
    },
    {
      id: 'dun-columna:up',
      label: 'The hatch',
      verb: 'Out onto the platform',
      at: dunTop(),
      from: DUN_COLUMNA,
      to: { interior: COLUMNA_SUMMA, position: V(0, 0, -1.9), heading: Math.PI },
    },
  ],
  route: dunRoute,
  hiddenOutside: true,
  indoor: 1,
  // A stair a metre wide: the over-the-shoulder camera would sit in the wall, so the climb is in
  // first person, and the player's own view comes back at the door (unless they changed it inside).
  onEnter: (game) => {
    const p = game.player as (typeof game.player & { viewMode?: string; setViewMode?(m: string): void }) | undefined;
    if (!p?.setViewMode || p.viewMode === 'first') return;
    viewBefore.set(game, p.viewMode ?? 'third');
    p.setViewMode('first');
  },
  onExit: (game) => {
    const p = game.player as (typeof game.player & { viewMode?: string; setViewMode?(m: string): void }) | undefined;
    const was = viewBefore.get(game);
    viewBefore.delete(game);
    if (was && p?.setViewMode && p.viewMode === 'first') p.setViewMode(was);
  },
  afterPlace(game, object) {
    lampsOf.get(object)?.attach(game, object);
  },
};

// ---------------------------------------------------------------- columna-summa: the platform

/**
 * Show or hide the Column's own top (the rail, drum and emperor), as the platform stands in for it.
 * Scanned each time (the enter and exit are rare), so a rebuilt landmark is never left stale.
 */
function setColumnTop(game: Game, shown: boolean) {
  game.scene?.traverse((o) => {
    if (o.name.startsWith(COLUMN_TOP)) o.visible = shown;
  });
}

function buildSumma(ctx: { builder(): MeshBuilder }): InteriorBuild {
  const b = ctx.builder();
  // The slab (top at local y 0) and the rail: posts every 0.9 m, a bronze bar at 1.05 m, and solid
  // colliders 1.15 m high on all four sides.
  blk(b, 'marble', -SLAB, -0.3, -SLAB, SLAB, 0, SLAB);
  for (const side of [-1, 1]) {
    collideBox(b, side * RAIL_X - 0.05, 0, -SLAB, side * RAIL_X + 0.05, 1.15, SLAB);
    collideBox(b, -SLAB, 0, side * RAIL_X - 0.05, SLAB, 1.15, side * RAIL_X + 0.05);
    b.box('bronze', 0.06, 0.06, SLAB * 2 - 0.2, new THREE.Matrix4().makeTranslation(side * RAIL_X, RAIL_H, 0));
    b.box('bronze', SLAB * 2 - 0.2, 0.06, 0.06, new THREE.Matrix4().makeTranslation(0, RAIL_H, side * RAIL_X));
  }
  for (const p of [-2.25, -1.35, -0.45, 0.45, 1.35, 2.25]) {
    for (const side of [-1, 1]) {
      b.box('bronze', 0.05, RAIL_H, 0.05, new THREE.Matrix4().makeTranslation(side * RAIL_X, RAIL_H / 2, p));
      b.box('bronze', 0.05, RAIL_H, 0.05, new THREE.Matrix4().makeTranslation(p, RAIL_H / 2, side * RAIL_X));
    }
  }
  // The drum with its collider, a small bronze door on its −z face, and the gilded emperor (1:1).
  b.add(new THREE.CylinderGeometry(DRUM_R, DRUM_R, DRUM_H, 32).translate(0, DRUM_H / 2, 0), 'marble');
  b.collider({ kind: 'cylinder', center: V(0, DRUM_H / 2, 0), halfHeight: DRUM_H / 2, radius: DRUM_R });
  blk(b, 'bronze', -0.25, 0.1, -DRUM_R - 0.02, 0.25, 1.0, -DRUM_R + 0.01, false);
  armoredEmperor(b, new THREE.Matrix4().makeTranslation(0, DRUM_H, 0), { material: 'gilded_bronze', scale: 4 / 1.85, detail: 'high', plinth: false, spear: true });

  const spots: Spot[] = [
    { id: 'hatch', kind: 'spawn', position: V(0, 0, -1.9), heading: Math.PI },
    { id: 'bitus', kind: 'npc', position: V(0, 0, 1.6), heading: Math.PI },
    { id: 'view', kind: 'vista', position: V(1.8, 0, 0), heading: Math.PI / 2 },
  ];
  const object = b.build(COLUMNA_SUMMA);
  return { object, colliders: [...b.colliders], spots };
}

export const columnaSumma: InteriorDef = {
  id: COLUMNA_SUMMA,
  name: 'The platform of the Column',
  latin: 'Summa columna',
  origin: (game) => originOf(game, { x: COLUMN_LOCAL.axis.x, y: COLUMN_LOCAL.abacusTop, z: COLUMN_LOCAL.axis.z }, 0),
  build: buildSumma,
  bounds: { min: { x: -2.8, y: -0.5, z: -2.8 }, max: { x: 2.8, y: 6, z: 2.8 } },
  doors: [
    {
      id: 'columna-summa:down',
      label: 'The bronze door',
      verb: 'Down the stair',
      at: V(0, 0.6, -1.1),
      from: COLUMNA_SUMMA,
      to: { interior: DUN_COLUMNA, position: dunTop(), heading: stairPlan().endAngle + Math.PI / 2 },
    },
  ],
  hiddenOutside: true,
  indoor: 0,
  onEnter: (game) => setColumnTop(game, false),
  onExit: (game) => setColumnTop(game, true),
};

/** Register the Column's two cells with the interior service (a no-op without one). */
export function registerColumnInteriors(game: Game): void {
  const sys = game.interiors;
  if (!sys) return;
  sys.register(dunColumna);
  sys.register(columnaSumma);
}
