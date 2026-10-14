/**
 * `mithraeum-subura`: the cave of Mithras, the Spelaeum Mithrae under an insula off the Vicus Patricius in
 * the Subura (docs/STORY.md chapter 7). A plain plank door in a street wall (hung by front.ts near the place
 * `mithraeum-door`, with a raven scratched on the plaster beside it) opens on a short stair down. At the
 * bottom a long, low barrel vault, 4.4 m wide and 14 m long, painted blue with gold stars; a raised bench
 * (podium) along each side with red and ochre cushions, a paved aisle between them; at the far end a painted
 * relief of Mithras killing the bull (the tauroctony: a cave-arch field with the bull, the god in his red
 * Phrygian cap with the dagger at its neck, the dog, the snake, the raven, the sun and the moon), a small
 * altar either side, lamps along the walls. Its keeper, the Father of the cave, stands before the relief
 * (src/world/interiors/named/cast.ts places him, and two initiates at the feasts).
 *
 * Local frame: the street door's threshold at the origin (the stair runs +z and down), the vault floor at
 * `FLOOR` (below it), world axes. The way in is locked except at night (the feasts), 19:00 to 24:00.
 */
import * as THREE from 'three';
import { Draw } from '../../../arch/fabric/draw';
import { placeProp } from '../../../arch/props';
import type { Game } from '../../../core/Game';
import type { MaterialId } from '../../../gfx/materialIds';
import type { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { KitBuilt, KitLamp } from '../generic';
import { wallRun } from '../kits/parts';
import type { Vec3 } from '../types';
import { barrelGeometry, locationOf, placeSpots, type NamedCell } from './common';
import { streetExit, PORCH, type FrontSpec } from './front';

export const MITHRAEUM = 'mithraeum-subura';
/** The world place before the door. */
export const MITHRAEUM_SPOT = 'mithraeum-door';
export const MITHRAEUM_FRONT = 'front:mithraeum-subura';

// The stair: a landing, then STEPS treads down.
export const STEPS = 14;
export const RISE = 0.2;
export const RUN = 0.3;
export const LANDING = 1.4;
export const FLOOR = -STEPS * RISE; // the vault floor (local y)
const STAIR_HALF = 0.75; // half width of the stair well
// The vault.
export const VAULT_Z0 = LANDING + STEPS * RUN; // 5.6
export const VAULT_LEN = 14;
export const VAULT_Z1 = VAULT_Z0 + VAULT_LEN;
export const VAULT_HALF = 2.2; // half width, and the vault's radius
const WALL_H = 2.0; // the springing above the floor
const PODIUM_W = 1.1;
const PODIUM_H = 0.5;
export const PODIUM_Z0 = VAULT_Z0 + 1.2;
export const PODIUM_Z1 = VAULT_Z1 - 2.5;

/** The relief's field (a box in the cell's local frame; the panel faces −z on the end wall). */
export const RELIEF = { x0: -1.2, x1: 1.2, y0: FLOOR + 0.75, y1: FLOOR + 0.75 + 2.8, z: VAULT_Z1 - 0.1 };

/** The z of the stair's tread `i` (its near edge) and the top of it. */
export const treadZ = (i: number) => LANDING + i * RUN;
export const treadTop = (i: number) => -(i + 1) * RISE;

const ENTRY: Vec3 = { x: 0, y: 0.05, z: 1.1 };
const BENCH_X = VAULT_HALF - PODIUM_W / 2; // the centre of a podium
const SEAT_Y = FLOOR + PODIUM_H;

export const PLACES: NonNullable<NamedCell['places']> = {
  // Just inside, at the bottom of the stair.
  entry: { position: { x: 0, y: FLOOR, z: VAULT_Z0 + 0.8 }, heading: 0 },
  // The Father stands by the relief and faces the aisle (south-looking along −z).
  father: { position: { x: 0, y: FLOOR, z: VAULT_Z1 - 2.4 }, heading: Math.PI },
  // The initiates sit on the benches nearer the stair.
  'initiate-1': { position: { x: -BENCH_X, y: SEAT_Y, z: VAULT_Z0 + 2.6 }, heading: Math.PI / 2 },
  'initiate-2': { position: { x: BENCH_X, y: SEAT_Y, z: VAULT_Z0 + 3.6 }, heading: -Math.PI / 2 },
  // The three at the far end, apart from the soldiers.
  'feast-malchus': { position: { x: BENCH_X, y: SEAT_Y, z: VAULT_Z1 - 5.4 }, heading: -Math.PI / 2 },
  'feast-mardonius': { position: { x: BENCH_X, y: SEAT_Y, z: VAULT_Z1 - 4.0 }, heading: -Math.PI / 2 },
  'feast-chaldaean': { position: { x: -BENCH_X, y: SEAT_Y, z: VAULT_Z1 - 4.7 }, heading: Math.PI / 2 },
  // Two places on the stair for the knife-men, facing up toward the door.
  'stair-1': { position: { x: 0, y: treadTop(4), z: treadZ(4) + RUN / 2 }, heading: Math.PI },
  'stair-2': { position: { x: 0, y: treadTop(9), z: treadZ(9) + RUN / 2 }, heading: Math.PI },
};

/** The raven scratched on the plaster beside the door, in the door's frame (street side −z, the wall face at z = PORCH). */
export function ravenMark(d: Draw) {
  const hw = 0.65;
  const cx = -(hw + 0.22 + 0.5), cy = 1.55, z = PORCH - 0.02;
  d.span('plaster_white', cx - 0.3, cy - 0.32, z, cx + 0.3, cy + 0.32, z + 0.012, { shadow: false });
  const m = d.at(cx, cy, z - 0.004);
  // Scratched lines: body, head, beak, tail feathers and the wing, the legs and a branch.
  m.ellipsoid('plaster_dark', 0.02, 0.02, 0, 0.14, 0.085, 0.004, { rz: 0.35, seg: [10, 5] });
  m.ellipsoid('plaster_dark', -0.14, 0.12, 0, 0.055, 0.05, 0.004, { seg: [8, 5] });
  m.box('plaster_dark', -0.235, 0.1, 0, 0.1, 0.022, 0.004, { rz: -0.25 });
  for (const [r, y] of [[0.25, -0.02], [0.4, -0.08], [0.55, -0.15]] as const) m.box('plaster_dark', 0.2, y, 0, 0.17, 0.02, 0.004, { rz: -r });
  m.box('plaster_white', 0.0, 0.03, 0.002, 0.2, 0.012, 0.004, { rz: 0.3 });
  for (const x of [-0.04, 0.04]) m.box('plaster_dark', x, -0.1, 0, 0.012, 0.1, 0.004);
  m.box('plaster_dark', 0, -0.17, 0, 0.3, 0.015, 0.004, { rz: 0.06 });
}

/** The painted relief: Mithras killing the bull, a cave-arch field with its figures in the frame `f` (x right, y up, +z out of the wall; origin at the field's foot). */
export function reliefPainting(f: Draw) {
  const W = 1.2; // half width of the field
  const HS = 1.7; // height of the springing
  const arch = (w: number, hs: number) => {
    const s = new THREE.Shape();
    s.moveTo(-w, 0);
    s.lineTo(w, 0);
    s.lineTo(w, hs);
    s.absarc(0, hs, w, 0, Math.PI, false);
    s.lineTo(-w, 0);
    return new THREE.ShapeGeometry(s, 18);
  };
  // The rock rim of the cave, then the night-blue field.
  const rim = arch(W + 0.16, HS);
  f.geo(rim, 'rock', 0, -0.04, 0.0, { uvScale: 1 });
  rim.dispose();
  const field = arch(W, HS);
  f.geo(field, 'fabric_blue', 0, 0, 0.02);
  field.dispose();
  f.span('mud', -W, 0, 0.02, W, 0.15, 0.06, { shadow: false });
  // Stars on the field.
  for (const [x, y] of [[-0.95, 1.9], [-0.55, 2.35], [0.1, 2.55], [0.55, 2.1], [1.0, 1.85], [-1.0, 1.3], [0.45, 2.6], [-0.3, 2.0], [0.95, 1.2], [-0.75, 2.6]] as const) f.box('glow_fire', x, y, 0.035, 0.06, 0.06, 0.006, { rz: 0.78, shadow: false });
  // The sun, top left, with its rays; the moon, top right.
  f.cyl('glow_fire', -0.78, 2.15, 0.07, 0.12, 0.02, 14, { rx: Math.PI / 2, shadow: false });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    f.rod('glow_fire', { x: -0.78 + Math.cos(a) * 0.15, y: 2.15 + Math.sin(a) * 0.15, z: 0.07 }, { x: -0.78 + Math.cos(a) * 0.25, y: 2.15 + Math.sin(a) * 0.25, z: 0.07 }, 0.012, 4);
  }
  f.cyl('marble', 0.82, 2.2, 0.07, 0.11, 0.02, 14, { rx: Math.PI / 2, shadow: false });
  f.cyl('fabric_blue', 0.87, 2.24, 0.09, 0.1, 0.02, 14, { rx: Math.PI / 2, shadow: false });

  // The cloak: red, streaming up and back from the god's shoulders, with gold stars on it.
  f.poly('fabric_red', [{ x: 0.2, y: 1.42, z: 0.09 }, { x: 0.42, y: 2.0, z: 0.09 }, { x: 0.95, y: 2.05, z: 0.09 }, { x: 1.08, y: 1.55, z: 0.09 }, { x: 0.82, y: 1.05, z: 0.09 }, { x: 0.45, y: 1.0, z: 0.09 }], { doubleSided: true, shadow: false });
  for (const [x, y] of [[0.55, 1.75], [0.8, 1.9], [0.9, 1.45], [0.65, 1.3], [0.45, 1.5]] as const) f.box('glow_fire', x, y, 0.1, 0.05, 0.05, 0.006, { rz: 0.78, shadow: false });

  // The bull: white, its forelegs folded, its head dragged up and back.
  const white: MaterialId = 'plaster_white';
  f.ellipsoid(white, 0.12, 0.74, 0.14, 0.52, 0.26, 0.15, { seg: [12, 8] });
  f.ellipsoid(white, -0.32, 0.84, 0.14, 0.22, 0.24, 0.14, { seg: [10, 7] });
  f.rod(white, { x: -0.4, y: 0.9, z: 0.14 }, { x: -0.62, y: 1.0, z: 0.14 }, 0.1, 7);
  f.ellipsoid(white, -0.7, 1.04, 0.14, 0.15, 0.085, 0.08, { rz: 0.6, seg: [10, 7] });
  f.ellipsoid(white, -0.82, 0.97, 0.14, 0.06, 0.05, 0.055, { rz: 0.6, seg: [8, 5] });
  for (const z of [0.08, 0.2]) {
    const horn = new THREE.TorusGeometry(0.085, 0.013, 5, 10, Math.PI * 0.85);
    f.geo(horn, 'travertine', -0.66, 1.1, z, { rz: 0.5, shadow: false });
    horn.dispose();
  }
  f.ellipsoid('plaster_dark', -0.72, 1.08, 0.215, 0.015, 0.015, 0.015, { seg: [5, 4] });
  const leg = (a: [number, number], b: [number, number], c: [number, number], z: number) => {
    f.rod(white, { x: a[0], y: a[1], z }, { x: b[0], y: b[1], z }, 0.055, 6);
    f.rod(white, { x: b[0], y: b[1], z }, { x: c[0], y: c[1], z }, 0.045, 6);
  };
  leg([-0.28, 0.62], [-0.46, 0.34], [-0.58, 0.2], 0.12);
  leg([-0.2, 0.62], [-0.36, 0.3], [-0.42, 0.18], 0.17);
  leg([0.52, 0.64], [0.68, 0.36], [0.8, 0.17], 0.12);
  leg([0.42, 0.62], [0.5, 0.32], [0.44, 0.17], 0.17);
  f.rod(white, { x: 0.62, y: 0.82, z: 0.14 }, { x: 0.92, y: 0.7, z: 0.14 }, 0.03, 5);
  f.rod(white, { x: 0.92, y: 0.7, z: 0.14 }, { x: 1.0, y: 0.45, z: 0.14 }, 0.025, 5);
  for (const [x, y] of [[0.99, 0.4], [1.04, 0.33], [0.93, 0.34]] as const) f.ellipsoid('fabric_ochre', x, y, 0.14, 0.03, 0.07, 0.025, { rz: 0.3, seg: [5, 4] });
  // The wound, and the blood.
  f.ellipsoid('fabric_red', -0.27, 0.93, 0.3, 0.05, 0.05, 0.02, { seg: [6, 4] });
  f.rod('fabric_red', { x: -0.27, y: 0.9, z: 0.3 }, { x: -0.3, y: 0.62, z: 0.3 }, 0.012, 4);

  // Mithras: the red cap, the face, the tunic, the knee on the bull's back, the arm with the dagger.
  f.ellipsoid('fabric_purple', 0.18, 1.2, 0.22, 0.15, 0.27, 0.1, { rz: -0.35, seg: [9, 6] });
  f.ellipsoid('plaster_ochre', 0.06, 1.6, 0.24, 0.1, 0.115, 0.1, { seg: [8, 6] });
  f.cyl('fabric_red', 0.05, 1.74, 0.24, 0.1, 0.16, 8, { rTop: 0.05, rz: 0.25 });
  f.cyl('fabric_red', -0.0, 1.88, 0.24, 0.05, 0.14, 8, { rTop: 0.012, rz: 1.0 });
  f.rod('plaster_ochre', { x: 0.12, y: 1.46, z: 0.3 }, { x: -0.14, y: 1.08, z: 0.32 }, 0.04, 6);
  f.rod('iron', { x: -0.14, y: 1.08, z: 0.32 }, { x: -0.26, y: 0.93, z: 0.32 }, 0.017, 5);
  f.rod('plaster_ochre', { x: 0.22, y: 1.44, z: 0.2 }, { x: -0.58, y: 1.1, z: 0.2 }, 0.036, 6);
  f.rod('fabric_ochre', { x: 0.26, y: 1.0, z: 0.22 }, { x: 0.02, y: 0.98, z: 0.22 }, 0.06, 6);
  f.rod('fabric_ochre', { x: 0.02, y: 0.98, z: 0.22 }, { x: -0.1, y: 0.86, z: 0.22 }, 0.05, 6);
  f.rod('fabric_ochre', { x: 0.26, y: 1.0, z: 0.2 }, { x: 0.6, y: 0.88, z: 0.2 }, 0.055, 6);

  // The dog leaping at the wound, the snake beneath, the raven on the cloak's edge, the scorpion by the bull's belly.
  f.ellipsoid('wood', -0.36, 0.45, 0.2, 0.15, 0.08, 0.06, { rz: 0.85, seg: [8, 5] });
  f.ellipsoid('wood', -0.43, 0.6, 0.2, 0.065, 0.06, 0.05, { seg: [7, 5] });
  f.rod('wood', { x: -0.3, y: 0.38, z: 0.2 }, { x: -0.18, y: 0.34, z: 0.2 }, 0.018, 4);
  for (let i = 0; i < 10; i++) f.ellipsoid('foliage_pine', -1.0 + i * 0.09, 0.2 + 0.05 * Math.sin(i * 1.3), 0.2, 0.05, 0.035, 0.035, { seg: [6, 4] });
  f.ellipsoid('foliage_pine', -0.07, 0.3, 0.2, 0.045, 0.035, 0.035, { seg: [6, 4] });
  f.ellipsoid('black', 0.85, 1.58, 0.14, 0.075, 0.045, 0.04, { rz: 0.3, seg: [7, 5] });
  f.ellipsoid('black', 0.78, 1.64, 0.14, 0.035, 0.035, 0.035, { seg: [6, 4] });
  f.rod('black', { x: 0.74, y: 1.64, z: 0.14 }, { x: 0.68, y: 1.62, z: 0.14 }, 0.012, 4);
  f.ellipsoid('plaster_dark', 0.1, 0.55, 0.2, 0.035, 0.02, 0.02, { seg: [5, 4] });
}

function build(ctx: { game: Game; builder(): MeshBuilder }): KitBuilt {
  const b = ctx.builder();
  const d = new Draw(b);
  const lamps: KitLamp[] = [];
  const wall = 'peperino' as const;
  const dado = 'plaster_dark' as const;
  const HX = VAULT_HALF;

  // ---- the landing and the door wall (the shut door seen from inside)
  d.span('paving_travertine', -STAIR_HALF, -0.2, 0, STAIR_HALF, 0, LANDING);
  d.solid(-STAIR_HALF, -0.6, 0, STAIR_HALF, 0, LANDING);
  wallRun(d, -STAIR_HALF, 0, STAIR_HALF, 0, FLOOR, 2.6 - FLOOR, wall, dado, [-0.6, 0.6], 2.2 - FLOOR);
  d.span('wood_dark', -0.6, 0, -0.05, 0.6, 2.2, 0.05);
  d.span('iron', -0.6, 0.5, 0.05, 0.6, 0.55, 0.08);
  d.span('iron', -0.6, 1.5, 0.05, 0.6, 1.55, 0.08);
  d.solid(-0.65, 0, -0.3, 0.65, 2.3, 0.08);
  // ---- the stair down: treads (solid), two walls, a stepped ceiling
  for (let i = 0; i < STEPS; i++) {
    const z = treadZ(i), top = treadTop(i);
    d.span('travertine', -STAIR_HALF, FLOOR - 0.2, z, STAIR_HALF, top, z + RUN);
    d.solid(-STAIR_HALF, FLOOR - 0.5, z, STAIR_HALF, top, z + RUN);
    d.span('plaster_dark', -STAIR_HALF + 0.05, top + 0.0, z + RUN - 0.01, STAIR_HALF - 0.05, top + 0.0, z + RUN, { shadow: false });
    d.span('wood_dark', -STAIR_HALF, top + 2.55, z, STAIR_HALF, top + 2.75, z + RUN, { shadow: false });
  }
  for (const s of [-1, 1]) wallRun(d, s * STAIR_HALF, 0, s * STAIR_HALF, VAULT_Z0 + 0.1, FLOOR, 2.6 - FLOOR, wall, dado);
  d.span('wood_dark', -STAIR_HALF, 2.55, 0, STAIR_HALF, 2.75, LANDING, { shadow: false });
  lamps.push({ position: { x: 0, y: 1.9, z: 1.0 }, intensity: 4, distance: 6, flicker: 0.3 });
  lamps.push({ position: { x: 0, y: -0.6, z: treadZ(8) }, intensity: 3, distance: 6, flicker: 0.3 });
  placeProp(d, 'torch_bracket', -STAIR_HALF + 0.08, 1.5, treadZ(1), -Math.PI / 2);
  placeProp(d, 'torch_bracket', STAIR_HALF - 0.08, treadTop(10) + 1.5, treadZ(10), Math.PI / 2);

  // ---- the vault: floor, side walls, end walls (the stair's mouth in the near one), the barrel overhead
  d.span('concrete', -HX, FLOOR - 0.2, VAULT_Z0, HX, FLOOR, VAULT_Z1);
  d.solid(-HX - 0.2, FLOOR - 0.8, VAULT_Z0, HX + 0.2, FLOOR, VAULT_Z1 + 0.2);
  d.span('paving_travertine', -HX + PODIUM_W + 0.05, FLOOR, VAULT_Z0, HX - PODIUM_W - 0.05, FLOOR + 0.01, VAULT_Z1 - 0.1, { shadow: false });
  for (const s of [-1, 1]) wallRun(d, s * HX, VAULT_Z0, s * HX, VAULT_Z1, FLOOR, WALL_H, wall, dado);
  wallRun(d, -HX, VAULT_Z0, HX, VAULT_Z0, FLOOR, WALL_H + HX, wall, dado, [-STAIR_HALF, STAIR_HALF], 2.4);
  wallRun(d, -HX, VAULT_Z1, HX, VAULT_Z1, FLOOR, WALL_H + HX, wall, dado);
  d.geo(barrelGeometry(HX, VAULT_LEN, 22), 'fabric_blue', 0, FLOOR + WALL_H, (VAULT_Z0 + VAULT_Z1) / 2, { shadow: false });
  d.solid(-HX, FLOOR + WALL_H + HX, VAULT_Z0, HX, FLOOR + WALL_H + HX + 0.4, VAULT_Z1);
  // Gold stars on the vault, scattered over it (a fixed pattern), and seven larger ones down the crown.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 90; i++) {
    const a = 0.12 + rnd() * (Math.PI - 0.24);
    const z = VAULT_Z0 + 0.3 + rnd() * (VAULT_LEN - 0.6);
    const r = HX - 0.015;
    const sz = 0.03 + rnd() * 0.03;
    // A little diamond lying on the vault, turned to face the room: a frame whose y axis is the radius there.
    const f = d.sub(new THREE.Matrix4().makeRotationZ(a - Math.PI / 2).setPosition(Math.cos(a) * r, FLOOR + WALL_H + Math.sin(a) * r, z));
    f.box('glow_fire', 0, 0, 0, sz, 0.01, sz, { ry: 0.4 + rnd(), shadow: false });
  }
  for (let i = 0; i < 7; i++) d.box('glow_fire', 0, FLOOR + WALL_H + HX - 0.02, VAULT_Z0 + 1.2 + i * 1.8, 0.16, 0.012, 0.16, { ry: 0.78, shadow: false });
  // A band of gold at the springing, along both walls.
  for (const s of [-1, 1]) d.span('plaster_ochre', s * (HX - 0.03), FLOOR + WALL_H - 0.04, VAULT_Z0, s * (HX - 0.01), FLOOR + WALL_H + 0.04, VAULT_Z1, { shadow: false });

  // ---- the podia along both sides, with cushions
  for (const s of [-1, 1]) {
    const xi = s * (HX - PODIUM_W), xo = s * HX;
    d.span('plaster_red', Math.min(xi, xo), FLOOR, PODIUM_Z0, Math.max(xi, xo), FLOOR + PODIUM_H - 0.05, PODIUM_Z1);
    d.span('travertine', Math.min(xi - s * 0.03, xo), FLOOR + PODIUM_H - 0.05, PODIUM_Z0 - 0.03, Math.max(xi - s * 0.03, xo), FLOOR + PODIUM_H, PODIUM_Z1 + 0.03);
    d.solid(Math.min(xi, xo), FLOOR - 0.1, PODIUM_Z0, Math.max(xi, xo), FLOOR + PODIUM_H, PODIUM_Z1);
    let k = 0;
    for (let z = PODIUM_Z0 + 0.15; z + 0.95 <= PODIUM_Z1; z += 1.1, k++) {
      const mat: MaterialId = (k + (s > 0 ? 1 : 0)) % 2 ? 'fabric_ochre' : 'fabric_red';
      d.span(mat, Math.min(xi, xo) + 0.1, FLOOR + PODIUM_H, z, Math.max(xi, xo) - 0.1, FLOOR + PODIUM_H + 0.07, z + 0.95, { shadow: false });
    }
  }
  // Wall lamps over the podia, and a lamp on each altar's side.
  for (let i = 0; i < 4; i++) {
    const z = VAULT_Z0 + 2.2 + i * 2.7;
    for (const s of [-1, 1]) {
      placeProp(d, 'torch_bracket', s * (HX - 0.08), FLOOR + 1.55, z, s * (Math.PI / 2));
      lamps.push({ position: { x: s * (HX - 0.5), y: FLOOR + 1.9, z }, intensity: 2.4, distance: 6, flicker: 0.35, color: 0xffa65a });
    }
  }

  // ---- the far end: the relief, the altars, the lamps that light it
  const rf = d.at(0, RELIEF.y0, RELIEF.z, Math.PI);
  reliefPainting(rf);
  d.span('rock', -1.55, FLOOR, VAULT_Z1 - 0.12, -1.3, FLOOR + 0.75, VAULT_Z1 - 0.02, { shadow: false });
  d.span('rock', 1.3, FLOOR, VAULT_Z1 - 0.12, 1.55, FLOOR + 0.75, VAULT_Z1 - 0.02, { shadow: false });
  d.span('travertine', -1.45, FLOOR + 0.6, VAULT_Z1 - 0.3, 1.45, FLOOR + 0.75, VAULT_Z1 - 0.1);
  d.solid(-1.45, FLOOR, VAULT_Z1 - 0.3, 1.45, FLOOR + 0.75, VAULT_Z1 - 0.1);
  placeProp(d, 'altar', -1.0, FLOOR, VAULT_Z1 - 1.0, 0, { scale: 0.65, variant: 2 });
  placeProp(d, 'altar', 1.0, FLOOR, VAULT_Z1 - 1.0, 0, { scale: 0.65, variant: 0 });
  placeProp(d, 'lampstand', -1.6, FLOOR, VAULT_Z1 - 1.1, 0);
  placeProp(d, 'lampstand', 1.6, FLOOR, VAULT_Z1 - 1.1, 0);
  lamps.push({ position: { x: -1.0, y: FLOOR + 1.2, z: VAULT_Z1 - 1.0 }, intensity: 3.5, distance: 5.5, flicker: 0.45, color: 0xff9a50 });
  lamps.push({ position: { x: 1.0, y: FLOOR + 1.2, z: VAULT_Z1 - 1.0 }, intensity: 3.5, distance: 5.5, flicker: 0.45, color: 0xff9a50 });
  lamps.push({ position: { x: 0, y: FLOOR + 3.3, z: VAULT_Z1 - 1.6 }, intensity: 4, distance: 6, color: 0xffc27a });
  // A cool fill under the vault so the painted night sky reads blue against the warm flames.
  for (const z of [VAULT_Z0 + 3.5, VAULT_Z0 + 9]) lamps.push({ position: { x: 0, y: FLOOR + 3.9, z }, intensity: 2.2, distance: 7, color: 0x6a8cff });

  const object = b.build(`interior:${MITHRAEUM}`);
  return { object, colliders: [...b.colliders], spots: placeSpots({ places: PLACES }), lamps };
}

export const mithraeumCell: NamedCell = {
  id: MITHRAEUM,
  name: 'The cave of Mithras',
  latin: 'Spelaeum Mithrae',
  at: MITHRAEUM,
  slot: 6,
  anchor: (game) => locationOf(game, MITHRAEUM_SPOT) ?? null,
  bounds: { min: { x: -VAULT_HALF - 0.5, y: FLOOR - 0.7, z: -0.3 }, max: { x: VAULT_HALF + 0.5, y: 3.2, z: VAULT_Z1 + 0.5 } },
  entry: { position: ENTRY, heading: 0 },
  // Down the stair, along the aisle to the Father.
  route: [
    ENTRY,
    { x: 0, y: 0, z: LANDING + 0.2 },
    ...[2, 5, 8, 11, 13].map((i) => ({ x: 0, y: treadTop(i), z: treadZ(i) + RUN / 2 })),
    { x: 0, y: FLOOR, z: VAULT_Z0 + 1.2 },
    { x: 0, y: FLOOR, z: VAULT_Z0 + 6 },
    { x: 0, y: FLOOR, z: VAULT_Z1 - 3.4 },
  ],
  places: PLACES,
  build,
  exit: {
    at: { x: 0, y: 1.2, z: 0.5 },
    label: 'The raven door',
    verb: 'Go out',
    to: (game) => streetExit(game, MITHRAEUM_FRONT, MITHRAEUM_SPOT),
  },
};

export const mithraeumFront: FrontSpec = {
  id: MITHRAEUM_FRONT,
  spot: MITHRAEUM_SPOT,
  label: 'A plain door with a raven scratched beside it',
  width: 1.2,
  height: 2.2,
  style: 'plank',
  // Shut and firmly locked by day; the feasts are at night (the quest opens it for its own).
  lock: { tier: 'firma', openHours: [19, 24] },
  owner: { id: 'cult-mithras', name: 'the Father of the cave' },
  margin: 0.65,
  cell: MITHRAEUM,
  entry: { position: ENTRY, heading: 0 },
  mark: ravenMark,
};
