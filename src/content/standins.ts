/**
 * The visible things behind the content's prompts: an altar where you pray, a painted board or a
 * scratched wall where you read, a basket, a sack or a stack of amphorae where you search, a lamp
 * on a post or a bracket where a light burns (the owner's note: prompts over bare grass and lights
 * floating in the air).
 *
 * Kit props (src/arch/props: altar, herm, basket, sack, crate, amphora_stack, trough) and a few small
 * content-only shapes (a stele, a notice board, a lantern on a post, a wall lamp, a loose slab, a
 * tool on a step, an offering box on its stand, painted and scratched writing) are merged per area
 * cell into one mesh per material (MeshBuilder), registered with the world for distance culling with
 * their colliders (`placeAndRegister`). Every shape is drawn in its own frame: origin on the ground
 * (wall-mounted: on the wall surface), front facing −z, metres 1:1.
 */
import * as THREE from 'three';
import type { Game } from '../core/Game';
import { Rng } from '../core/Rng';
import { placeProp, type PropKind } from '../arch/props';
import { Draw } from '../arch/fabric/draw';
import { MeshBuilder, placeAndRegister } from '../gfx/MeshBuilder';
import type { MaterialId } from '../gfx/materialIds';

export type StandInKind =
  | 'stele'
  | 'album'
  | 'pier'
  | 'lantern-post'
  | 'wall-lamp'
  | 'wall-notice'
  | 'wall-plaque'
  | 'wall-graffito'
  | 'wall-crack'
  | 'wall-stub'
  | 'slab'
  | 'tool-step'
  | 'offering-box'
  | 'silt-heap'
  | 'loot-heap'
  | 'basket-crate'
  | 'bundle';

type Shape = (d: Draw, r: Rng) => void;

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Lines of writing on a face at z (front), as thin strokes. */
function writing(d: Draw, r: Rng, mat: MaterialId, w: number, y0: number, lines: number, z: number, lineH = 0.05) {
  for (let i = 0; i < lines; i++) {
    const len = w * (0.55 + r.next() * 0.45);
    d.box(mat, (r.next() - 0.5) * (w - len) * 0.5, y0 - i * lineH * 1.9, z, len, lineH * 0.45, 0.006);
  }
}

/** Scratched graffiti: short strokes at odd angles. */
function scratches(d: Draw, r: Rng, mat: MaterialId, y: number, z: number) {
  for (let line = 0; line < 3; line++) {
    let x = -0.32 + r.next() * 0.1;
    const yy = y - line * 0.11;
    while (x < 0.32) {
      const len = 0.03 + r.next() * 0.05;
      d.box(mat, x + len / 2, yy + (r.next() - 0.5) * 0.02, z, len, 0.012, 0.004, { rz: (r.next() - 0.5) * 0.9 });
      x += len + 0.012 + r.next() * 0.03;
    }
  }
}

const SHAPES: Record<StandInKind, Shape> = {
  /** A marble cippus with an inscribed face (an inscription, a dedication). */
  stele: (d, r) => {
    d.span('travertine', -0.38, 0, -0.24, 0.38, 0.2, 0.24);
    d.span('marble', -0.3, 0.2, -0.14, 0.3, 1.32, 0.14);
    d.span('marble', -0.34, 1.32, -0.18, 0.34, 1.42, 0.18);
    d.cyl('marble', 0, 1.47, 0, 0.13, 0.1, 10);
    writing(d, r, 'black', 0.44, 1.12, 6, -0.143, 0.045);
    d.solid(-0.38, 0, -0.24, 0.38, 1.45, 0.24);
  },
  /** A whitewashed notice board (album) on two posts under a little roof. */
  album: (d, r) => {
    for (const x of [-0.62, 0.62]) d.box('wood_dark', x, 0.95, 0, 0.08, 1.9, 0.08);
    d.box('wood_dark', 0, 1.36, 0.02, 1.36, 0.92, 0.04);
    d.box('plaster_white', 0, 1.36, -0.005, 1.22, 0.8, 0.02);
    d.box('wood', 0, 1.86, 0.0, 1.5, 0.05, 0.26, { rx: -0.18 });
    d.box('plaster_red', 0, 1.67, -0.017, 0.9, 0.07, 0.006);
    writing(d, r, 'black', 0.95, 1.52, 5, -0.017, 0.05);
    writing(d, r, 'plaster_red', 0.7, 1.12, 2, -0.017, 0.05);
    d.solid(-0.7, 0, -0.08, 0.7, 1.9, 0.08);
  },
  /** A stone pier, scratched (graffiti where there is no wall). */
  pier: (d, r) => {
    d.span('travertine', -0.32, 0, -0.32, 0.32, 1.85, 0.32);
    d.span('travertine', -0.38, 1.85, -0.38, 0.38, 1.95, 0.38);
    scratches(d, r, 'black', 1.45, -0.325);
    scratches(d, r, 'plaster_red', 1.1, -0.325);
    d.solid(-0.32, 0, -0.32, 0.32, 1.95, 0.32);
  },
  /** A lantern hung from an iron arm on a wooden post (the light burns in the lantern). */
  'lantern-post': (d) => {
    d.box('wood_dark', 0, 1.27, 0, 0.12, 2.55, 0.12);
    d.rod('iron', V(0, 2.42, -0.04), V(0, 2.42, -0.62), 0.016, 4);
    d.rod('iron', V(0, 2.1, -0.04), V(0, 2.42, -0.36), 0.012, 4);
    lantern(d.at(0, 2.42, -0.58));
    d.solidCyl(0, 1.27, 0, 0.1, 2.55);
  },
  /** A lantern on an iron bracket fixed to a wall (origin on the wall). */
  'wall-lamp': (d) => {
    d.span('iron', -0.06, -0.14, -0.02, 0.06, 0.14, 0.0);
    d.rod('iron', V(0, 0.06, -0.01), V(0, 0.06, -0.42), 0.014, 4);
    d.rod('iron', V(0, -0.12, -0.01), V(0, 0.06, -0.28), 0.01, 4);
    lantern(d.at(0, 0.06, -0.4));
  },
  /** A painted notice on a wall: white ground, red heading, black lines. */
  'wall-notice': (d, r) => {
    d.box('plaster_white', 0, 0, -0.012, 0.95, 0.62, 0.024);
    d.box('plaster_red', 0, 0.22, -0.026, 0.7, 0.07, 0.004);
    writing(d, r, 'black', 0.8, 0.09, 5, -0.026, 0.045);
  },
  /** A marble plaque on a wall. */
  'wall-plaque': (d, r) => {
    d.box('marble', 0, 0, -0.02, 0.78, 0.46, 0.04);
    writing(d, r, 'black', 0.6, 0.13, 4, -0.041, 0.045);
  },
  /** Scratched and painted graffiti on a wall. */
  'wall-graffito': (d, r) => {
    scratches(d, r, 'black', 0.12, -0.004);
    scratches(d, r, r.next() < 0.5 ? 'plaster_red' : 'black', -0.24, -0.004);
  },
  /** A crack in a wall stuffed with rags. */
  'wall-crack': (d) => {
    d.box('black', 0.02, 0.02, -0.006, 0.05, 0.7, 0.012, { rz: 0.12 });
    d.box('black', -0.08, -0.25, -0.006, 0.035, 0.35, 0.012, { rz: -0.35 });
    d.ellipsoid('fabric_ochre', 0.03, 0.06, -0.05, 0.1, 0.07, 0.07, { seg: [6, 4] });
  },
  /** A broken stretch of old wall with a crack stuffed with rags (where there is no wall). */
  'wall-stub': (d) => {
    d.span('tufa', -0.75, 0, -0.22, 0.75, 0.95, 0.22);
    d.span('tufa', -0.75, 0.95, -0.22, 0.1, 1.15, 0.22);
    d.box('black', 0.1, 0.55, -0.226, 0.05, 0.6, 0.012, { rz: 0.15 });
    d.ellipsoid('fabric_ochre', 0.1, 0.6, -0.25, 0.1, 0.07, 0.07, { seg: [6, 4] });
    d.solid(-0.75, 0, -0.22, 0.75, 1.15, 0.22);
  },
  /** A paving slab lifted a finger's breadth on one side. */
  slab: (d) => {
    d.box('black', 0, 0.01, 0, 0.78, 0.02, 0.62);
    d.box('travertine', 0, 0.06, 0, 0.72, 0.07, 0.56, { rx: 0.07 });
  },
  /** A mallet and a chisel left on a stone step. */
  'tool-step': (d) => {
    d.span('travertine', -0.35, 0, -0.22, 0.35, 0.32, 0.22);
    d.rod('wood', V(-0.2, 0.345, 0.02), V(0.08, 0.345, -0.06), 0.016, 5);
    d.cyl('wood_dark', 0.12, 0.36, -0.07, 0.045, 0.14, 8, { rx: Math.PI / 2, rz: 0.28 });
    d.rod('iron', V(0.0, 0.34, 0.1), V(0.2, 0.34, 0.12), 0.008, 4);
    d.solid(-0.35, 0, -0.22, 0.35, 0.32, 0.22);
  },
  /** The vicus' offering box on a stone stand (a slot in the lid). */
  'offering-box': (d) => {
    d.span('tufa', -0.24, 0, -0.22, 0.24, 0.72, 0.22);
    d.span('wood_dark', -0.18, 0.72, -0.15, 0.18, 0.92, 0.15);
    d.span('bronze', -0.19, 0.84, -0.155, 0.19, 0.87, 0.155);
    d.box('black', 0, 0.921, 0, 0.1, 0.004, 0.015);
    d.solid(-0.24, 0, -0.22, 0.24, 0.92, 0.22);
  },
  /** Silt heaped in a niche of the drain, a broken jar in it. */
  'silt-heap': (d) => {
    d.ellipsoid('mud', 0, 0.08, 0, 0.55, 0.2, 0.42, { seg: [8, 4] });
    d.ellipsoid('dirt', 0.15, 0.12, 0.05, 0.3, 0.16, 0.25, { seg: [7, 4] });
    placeProp(d, 'amphora_globular', -0.2, 0.05, -0.05, 0.6, { rx: 1.2, collide: false });
  },
  /** A heap of stolen goods: a crate, a sack and a jar. */
  'loot-heap': (d, r) => {
    placeProp(d, 'crate', 0, 0, 0, 0.3, { rng: r });
    placeProp(d, 'sack', 0.55, 0, 0.15, 0, { rng: r });
    placeProp(d, 'amphora_globular', -0.5, 0, 0.1, 0, { collide: false });
  },
  /** A market basket on a crate. */
  'basket-crate': (d, r) => {
    placeProp(d, 'crate', 0, 0, 0, 0, { variant: 0 });
    placeProp(d, 'basket', 0, 0.42, 0, r.next() * 6, { variant: r.next() < 0.5 ? 0 : 1 });
  },
  /** A tied bundle and a sack. */
  bundle: (d, r) => {
    placeProp(d, 'sack', 0, 0, 0, r.next() * 6, { rng: r });
    d.box('fabric_white', 0.42, 0.14, 0.05, 0.42, 0.26, 0.3, { ry: 0.4 });
    d.box('fabric_ochre', 0.42, 0.14, 0.05, 0.05, 0.27, 0.31, { ry: 0.4 });
  },
};

/** A bronze lantern with horn panes, hanging below its hook at the origin. */
function lantern(d: Draw) {
  d.rod('iron', V(0, 0, 0), V(0, -0.08, 0), 0.006, 3);
  d.cyl('bronze', 0, -0.09, 0, 0.07, 0.03, 8, { rTop: 0.03 });
  d.box('plaster_cream', 0, -0.2, 0, 0.12, 0.2, 0.12);
  for (const [x, z] of [[-0.065, -0.065], [0.065, -0.065], [-0.065, 0.065], [0.065, 0.065]] as const) d.box('bronze', x, -0.2, z, 0.015, 0.22, 0.015);
  d.box('bronze', 0, -0.315, 0, 0.15, 0.025, 0.15);
}

/** Where the flame of a lamp shape sits, in its frame (the light pool's glow goes there). */
export const LAMP_FLAME: Record<'lantern-post' | 'wall-lamp', THREE.Vector3> = {
  'lantern-post': V(0, 2.22, -0.58),
  'wall-lamp': V(0, -0.14, -0.4),
};

/** Kit props and content shapes, one placement API. */
export type PlaceableKind = StandInKind | PropKind;

const CELL = 150;

interface Cell {
  key: string;
  origin: THREE.Vector3;
  b: MeshBuilder;
  d: Draw;
  count: number;
}

/**
 * Collects stand-ins and builds them per 150 m cell (one mesh per material per cell), so a few
 * hundred small things cost a handful of draw calls where the player is.
 */
export class StandIns {
  private cells = new Map<string, Cell>();
  private registered: string[] = [];
  private readonly rng: Rng;

  constructor(seed = 'content-standins') {
    this.rng = new Rng(seed);
  }

  /** Number of things placed so far. */
  get count() {
    let n = 0;
    for (const c of this.cells.values()) n += c.count;
    return n;
  }

  private cell(x: number, z: number): Cell {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    const key = `${cx},${cz}`;
    let cell = this.cells.get(key);
    if (!cell) {
      const origin = new THREE.Vector3((cx + 0.5) * CELL, 0, (cz + 0.5) * CELL);
      const b = new MeshBuilder();
      cell = { key, origin, b, d: new Draw(b), count: 0 };
      this.cells.set(key, cell);
    }
    return cell;
  }

  private frame(x: number, y: number, z: number, rotY: number): Draw {
    const cell = this.cell(x, z);
    return cell.d.at(x - cell.origin.x, y, z - cell.origin.z, rotY);
  }

  private bump(x: number, z: number) {
    this.cell(x, z).count++;
  }

  /** Add a thing at world (x, y, z) with yaw `rotY` (its local −z then faces (−sin rotY, −cos rotY)). */
  add(kind: PlaceableKind, x: number, y: number, z: number, rotY = 0, opts: { variant?: number; scale?: number } = {}) {
    const cell = this.cell(x, z);
    const local = cell.d.at(x - cell.origin.x, y, z - cell.origin.z, rotY);
    const shape = (SHAPES as Record<string, Shape | undefined>)[kind];
    if (shape) {
      const d = opts.scale && opts.scale !== 1 ? local.sub(new THREE.Matrix4().makeScale(opts.scale, opts.scale, opts.scale)) : local;
      shape(d, this.rng.fork(`${kind}:${Math.round(x * 10)},${Math.round(z * 10)}`));
    } else placeProp(local, kind as PropKind, 0, 0, 0, 0, { variant: opts.variant, scale: opts.scale });
    cell.count++;
  }

  /**
   * A free-standing stretch of plastered wall `len` metres long (a shopfront's side wall, a garden
   * wall) for notices and graffiti where the street has no building to write on. Its writable face
   * is local −z, 0.2 m in front of the origin, from 0.35 to 2.3 m up.
   */
  addWall(x: number, y: number, z: number, rotY: number, len: number) {
    const d = this.frame(x, y, z, rotY);
    const h = len / 2;
    d.span('tufa', -h, 0, -0.24, h, 0.35, 0.24);
    d.span('plaster_cream', -h + 0.18, 0.35, -0.2, h - 0.18, 2.3, 0.2);
    // A brick pilaster at each end.
    for (const sx of [-1, 1]) d.span('brick', sx > 0 ? h - 0.18 : -h, 0.35, -0.23, sx > 0 ? h : -h + 0.18, 2.3, 0.23);
    d.span('travertine', -h - 0.05, 2.3, -0.26, h + 0.05, 2.42, 0.26);
    d.span('roof_tile', -h - 0.05, 2.42, -0.2, h + 0.05, 2.5, 0.2);
    d.solid(-h, 0, -0.24, h, 2.5, 0.24);
    this.bump(x, z);
  }

  /** Register every cell with the world (meshes, culling, colliders). Returns the world ids. */
  build(game: Game, cullDistance = 230): string[] {
    if (!game.scene || !game.physics) return [];
    for (const cell of this.cells.values()) {
      if (!cell.count) continue;
      const id = `content:standins:${cell.key}`;
      const group = cell.b.build(id);
      try {
        placeAndRegister(game, id, group, cell.b.colliders, cell.origin, 0, { cullDistance });
        this.registered.push(id);
      } catch (err) {
        console.warn(`[content] stand-ins of cell ${cell.key} could not be placed`, err);
      }
    }
    this.cells.clear();
    return [...this.registered];
  }

  dispose(game: Game) {
    for (const id of this.registered.splice(0)) game.world?.remove?.(id);
  }
}

/** Yaw that turns a wall-mounted shape (front −z) to face along the wall's outward normal. */
export function yawFacing(nx: number, nz: number): number {
  return Math.atan2(-nx, -nz);
}
