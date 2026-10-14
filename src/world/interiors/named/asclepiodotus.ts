/**
 * `domus-asclepiodoti`: the Chaldaean's rooms, the Cenaculum Asclepiodoti, a fine upper flat on the Clivus
 * Victoriae (docs/STORY.md chapter 7). A street door in a wall of the Palatine slope (hung by front.ts near
 * the place `asclepiodotus-door`) opens on a stair up one storey (3.2 m) to the landing, an anteroom (a bench,
 * a herm of Saturn, a brazier) and, behind a purple curtain, the reading room: a mosaic floor, a big table
 * covered in star tables (parchment sheets with circles and lines painted on them, the nativity among them),
 * a brass astrolabe and an armillary sphere, cabinets of scrolls, a wall chart of the heavens, a window on the
 * slope with its shutters open, lamps. Asclepiodotus sits at the table's far side (the place `reader`) when the
 * player is in the cell (src/world/interiors/named/cast.ts), his client's stool opposite (`client`), and the
 * place `table` is where a visitor stands to look at the charts.
 *
 * Local frame: the street door's threshold at the origin (the stair runs +z and up), the flat's floor at
 * `FLAT_Y`, world axes.
 */
import * as THREE from 'three';
import { Draw } from '../../../arch/fabric/draw';
import { placeProp } from '../../../arch/props';
import type { Game } from '../../../core/Game';
import type { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { KitBuilt, KitLamp } from '../generic';
import { room, wallRun } from '../kits/parts';
import type { Vec3 } from '../types';
import { locationOf, placeSpots, type NamedCell } from './common';
import { streetExit, type FrontSpec } from './front';

export const DOMUS_ASCLEPIODOTI = 'domus-asclepiodoti';
export const ASCLEPIODOTUS_SPOT = 'asclepiodotus-door';
export const ASCLEPIODOTUS_FRONT = 'front:domus-asclepiodoti';

export const STEPS = 16;
export const RISE = 0.2;
export const RUN = 0.3;
export const LAND0 = 1.2; // the flat landing at the foot of the stair
export const FLAT_Y = STEPS * RISE; // 3.2
export const STAIR_TOP_Z = LAND0 + STEPS * RUN; // 6.0
const SH = 0.8; // half width of the stair well
export const ANTE_HX = 2.4;
export const ANTE_Z1 = 10.4;
export const READ_HX = 3.6;
export const READ_Z0 = 10.6;
export const READ_Z1 = 17.0;
const ANTE_H = 3.3;
const READ_H = 3.7;

/** The big table's top (a box on the flat's floor) and the charts on it. */
export const TABLE = { x0: -1.4, x1: 1.4, z0: 12.7, z1: 13.9, h: 0.78 };

const ENTRY: Vec3 = { x: 0, y: 0.05, z: 1.1 };

export const treadZ = (i: number) => LAND0 + i * RUN;
export const treadTop = (i: number) => (i + 1) * RISE;

export const PLACES: NonNullable<NamedCell['places']> = {
  entry: { position: { x: 0, y: 0, z: 1.1 }, heading: 0 },
  // Asclepiodotus sits at the table's far side, facing the door.
  reader: { position: { x: 0, y: FLAT_Y, z: 14.6 }, heading: Math.PI },
  // The client's stool across the table.
  client: { position: { x: -0.7, y: FLAT_Y, z: 11.9 }, heading: 0 },
  // A visitor's place at the table's edge, over the charts.
  table: { position: { x: 0.8, y: FLAT_Y, z: 12.2 }, heading: 0 },
};

/** A star table: a parchment sheet with the zodiac's rings and lines painted on it, in the frame of `d` at height y. */
function chart(d: Draw, cx: number, y: number, cz: number, w: number, dpt: number, rot: number, rings = 3) {
  const f = d.at(cx, y, cz, rot);
  f.span('plaster_cream', -w / 2, 0, -dpt / 2, w / 2, 0.006, dpt / 2, { shadow: false });
  const r0 = Math.min(w, dpt) * 0.44;
  for (let i = 0; i < rings; i++) {
    const r = r0 * (1 - i * 0.22);
    f.cyl('plaster_dark', 0, 0.007, 0, r, 0.0016, 20, { shadow: false });
    f.cyl('plaster_cream', 0, 0.0085, 0, r - 0.007, 0.0016, 20, { shadow: false });
  }
  for (let k = 0; k < 6; k++) f.box('plaster_dark', 0, 0.0112, 0, r0 * 2, 0.001, 0.005, { ry: (k * Math.PI) / 6, shadow: false });
  for (const [a, rr] of [[0.4, 0.7], [1.7, 0.5], [2.6, 0.8], [3.7, 0.6], [4.8, 0.75], [5.6, 0.45]] as const) f.cyl('fabric_red', Math.cos(a) * r0 * rr, 0.0115, Math.sin(a) * r0 * rr, 0.012, 0.002, 6, { shadow: false });
  // Columns of figures down one edge.
  for (let i = 0; i < 5; i++) f.box('plaster_dark', w / 2 - 0.05, 0.0112, -dpt / 2 + 0.07 + i * 0.07, 0.07, 0.001, 0.012, { shadow: false });
}

function build(ctx: { game: Game; builder(): MeshBuilder }): KitBuilt {
  const b = ctx.builder();
  const d = new Draw(b);
  const lamps: KitLamp[] = [];
  const Y = FLAT_Y;
  const wall = 'plaster_cream' as const;
  const dado = 'plaster_red' as const;

  // ---- the foot of the stair: the landing, the door wall (the shut door seen from inside)
  d.span('paving_travertine', -SH, -0.2, 0, SH, 0, LAND0);
  d.solid(-SH, -0.6, 0, SH, 0, LAND0);
  wallRun(d, -SH, 0, SH, 0, 0, 2.7, wall, dado, [-0.6, 0.6], 2.2);
  d.span('wood_dark', -0.6, 0, -0.05, 0.6, 2.2, 0.05);
  d.span('iron', -0.6, 0.5, 0.05, 0.6, 0.55, 0.08);
  d.span('iron', -0.6, 1.5, 0.05, 0.6, 1.55, 0.08);
  d.solid(-0.65, 0, -0.3, 0.65, 2.3, 0.08);
  // ---- the stair up: treads, walls, a stepped ceiling
  for (let i = 0; i < STEPS; i++) {
    const z = treadZ(i), top = treadTop(i);
    d.span('travertine', -SH, -0.2, z, SH, top, z + RUN);
    d.solid(-SH, -0.5, z, SH, top, z + RUN);
    d.span('wood_dark', -SH, top + 2.5, z, SH, top + 2.7, z + RUN, { shadow: false });
  }
  d.span('wood_dark', -SH, 2.55, 0, SH, 2.75, LAND0, { shadow: false });
  for (const s of [-1, 1]) wallRun(d, s * SH, 0, s * SH, STAIR_TOP_Z + 0.1, 0, Y + 2.7, wall, dado);
  lamps.push({ position: { x: 0, y: 1.8, z: 0.9 }, intensity: 4, distance: 6, flicker: 0.25 });
  lamps.push({ position: { x: 0, y: 3.4, z: 3.6 }, intensity: 3.5, distance: 6, flicker: 0.25 });
  placeProp(d, 'torch_bracket', -SH + 0.08, 1.6, treadZ(1), -Math.PI / 2);
  placeProp(d, 'torch_bracket', SH - 0.08, treadTop(8) + 1.5, treadZ(8), Math.PI / 2);

  // ---- the anteroom
  room(d, -ANTE_HX, ANTE_HX, STAIR_TOP_Z, ANTE_Z1, Y, ANTE_H, wall, dado, 'paving_travertine');
  wallRun(d, -ANTE_HX, STAIR_TOP_Z, ANTE_HX, STAIR_TOP_Z, Y, ANTE_H, wall, dado, [-SH, SH], 2.4);
  for (const s of [-1, 1]) wallRun(d, s * ANTE_HX, STAIR_TOP_Z, s * ANTE_HX, ANTE_Z1, Y, ANTE_H, wall, dado);
  wallRun(d, -ANTE_HX, ANTE_Z1, ANTE_HX, ANTE_Z1, Y, ANTE_H, wall, dado, [-0.9, 0.9], 2.5);
  placeProp(d, 'bench', -ANTE_HX + 0.4, Y, 8.4, Math.PI / 2, { variant: 1 });
  placeProp(d, 'stool', ANTE_HX - 0.6, Y, 8.0, 0.3, { variant: 2 });
  placeProp(d, 'herm', ANTE_HX - 0.4, Y, 9.6, Math.PI / 2, { variant: 1 });
  placeProp(d, 'brazier', -ANTE_HX + 0.6, Y, 7.0, 0);
  // A rug, a tall jar, a painted sign of Saturn (a ringed disc) over the bench.
  d.span('fabric_red', -1.0, Y, 7.2, 1.0, Y + 0.02, 9.4, { shadow: false });
  d.span('fabric_ochre', -0.9, Y + 0.02, 7.3, 0.9, Y + 0.025, 9.3, { shadow: false });
  placeProp(d, 'amphora_globular', ANTE_HX - 0.4, Y, 7.0, 0.5, { variant: 1 });
  d.cyl('plaster_ochre', -ANTE_HX + 0.12, Y + 2.0, 8.4, 0.34, 0.02, 20, { rz: Math.PI / 2, shadow: false });
  d.cyl('plaster_dark', -ANTE_HX + 0.125, Y + 2.0, 8.4, 0.18, 0.02, 14, { rz: Math.PI / 2, shadow: false });
  d.cyl('plaster_ochre', -ANTE_HX + 0.13, Y + 2.0, 8.4, 0.15, 0.02, 14, { rz: Math.PI / 2, shadow: false });
  lamps.push({ position: { x: -ANTE_HX + 0.7, y: Y + 1.1, z: 7.0 }, intensity: 4, distance: 6, flicker: 0.45, color: 0xff9a50 });
  lamps.push({ position: { x: 0, y: Y + 2.6, z: 8.6 }, intensity: 5, distance: 8 });

  // ---- the curtain at the reading room's door: drawn aside, a rod over the opening
  d.span('bronze', -1.0, Y + 2.45, ANTE_Z1 - 0.12, 1.0, Y + 2.5, ANTE_Z1 - 0.08, { shadow: false });
  d.span('fabric_purple', 0.9, Y + 0.05, ANTE_Z1 - 0.14, 1.25, Y + 2.45, ANTE_Z1 - 0.06, { shadow: false });
  d.span('fabric_purple', -1.25, Y + 0.05, ANTE_Z1 - 0.14, -0.9, Y + 2.45, ANTE_Z1 - 0.06, { shadow: false });

  // ---- the reading room
  const rwall = 'plaster_ochre' as const;
  room(d, -READ_HX, READ_HX, READ_Z0, READ_Z1, Y, READ_H, rwall, dado, 'mosaic');
  d.span('plaster_cream', -READ_HX, Y + READ_H - 0.1, READ_Z0, READ_HX, Y + READ_H, READ_Z1, { shadow: false });
  wallRun(d, -READ_HX, READ_Z0, READ_HX, READ_Z0, Y, READ_H, rwall, dado, [-0.9, 0.9], 2.5);
  wallRun(d, -READ_HX, READ_Z0, -READ_HX, READ_Z1, Y, READ_H, rwall, dado);
  wallRun(d, -READ_HX, READ_Z1, READ_HX, READ_Z1, Y, READ_H, rwall, dado);
  // The east wall with its window on the slope: a gap with a sill, shutters thrown back, a pane of white daylight.
  const WZ0 = 12.5, WZ1 = 13.9, WY0 = 1.05, WY1 = 2.6;
  wallRun(d, READ_HX, READ_Z0, READ_HX, READ_Z1, Y, READ_H, rwall, dado, [WZ0, WZ1], WY1);
  d.span(rwall, READ_HX - 0.1, Y, WZ0, READ_HX + 0.1, Y + WY0, WZ1);
  d.span('travertine', READ_HX - 0.2, Y + WY0 - 0.03, WZ0 - 0.06, READ_HX + 0.14, Y + WY0 + 0.04, WZ1 + 0.06);
  d.span('plaster_white', READ_HX + 0.12, Y + WY0, WZ0, READ_HX + 0.14, Y + WY1, WZ1, { shadow: false });
  d.solid(READ_HX - 0.1, Y, WZ0, READ_HX + 0.2, Y + WY1, WZ1);
  for (const [z0, z1] of [[WZ0 - 0.52, WZ0 - 0.04], [WZ1 + 0.04, WZ1 + 0.52]] as const) d.span('wood_painted', READ_HX - 0.2, Y + WY0, z0, READ_HX - 0.15, Y + WY1, z1, { shadow: false });
  for (const z of [WZ0 + 0.7]) d.span('wood_dark', READ_HX + 0.1, Y + WY0, z - 0.02, READ_HX + 0.12, Y + WY1, z + 0.02, { shadow: false });
  lamps.push({ position: { x: READ_HX - 0.7, y: Y + 1.9, z: (WZ0 + WZ1) / 2 }, color: 0xdfe8ff, intensity: 7, distance: 7, daylight: true });

  // The rug, the big table, its chairs.
  d.span('fabric_red', -2.1, Y, 11.9, 2.1, Y + 0.02, 15.2, { shadow: false });
  d.span('fabric_ochre', -1.95, Y + 0.02, 12.05, 1.95, Y + 0.026, 15.05, { shadow: false });
  const { x0, x1, z0, z1, h } = TABLE;
  d.span('wood_dark', x0, Y + h - 0.06, z0, x1, Y + h, z1);
  d.span('wood', x0 + 0.04, Y + h, z0 + 0.04, x1 - 0.04, Y + h + 0.004, z1 - 0.04, { shadow: false });
  const t = d.at(0, Y, 0);
  for (const sx of [x0 + 0.12, x1 - 0.12]) for (const sz of [z0 + 0.12, z1 - 0.12]) t.span('wood_dark', sx - 0.06, 0, sz - 0.06, sx + 0.06, h - 0.06, sz + 0.06);
  t.span('wood_dark', x0 + 0.1, 0.18, (z0 + z1) / 2 - 0.02, x1 - 0.1, 0.24, (z0 + z1) / 2 + 0.02);
  d.solid(x0, Y, z0, x1, Y + h, z1);
  // The star tables: five sheets on the table, a few curled, and the nativity at the visitor's place.
  const tt = Y + h + 0.004;
  chart(d, -0.9, tt, 13.35, 0.62, 0.5, 0.15, 3);
  chart(d, -0.2, tt, 13.15, 0.5, 0.42, -0.2, 2);
  chart(d, 0.85, tt, 13.15, 0.72, 0.56, 0.05, 4);
  chart(d, 0.2, tt, 13.5, 0.46, 0.4, 0.5, 2);
  chart(d, 1.1, tt, 13.55, 0.34, 0.3, -0.4, 2);
  // A rolled scroll, an inkwell, a reed pen, two weights holding a sheet down.
  d.cyl('plaster_cream', -1.15, tt + 0.03, 12.95, 0.03, 0.4, 8, { rz: Math.PI / 2, ry: 0.3, shadow: false });
  d.cyl('black', -0.45, tt + 0.03, 13.7, 0.035, 0.06, 8, { shadow: false });
  d.rod('wood', { x: -0.4, y: tt + 0.012, z: 13.75 }, { x: -0.1, y: tt + 0.012, z: 13.6 }, 0.004, 4);
  for (const [x, z] of [[0.52, 13.0], [1.28, 13.0]] as const) d.cyl('lead', x, tt + 0.02, z, 0.025, 0.04, 8, { shadow: false });
  // The brass astrolabe standing on the table's west end, facing the client's side.
  d.span('wood_dark', -1.3, tt, 13.15, -1.0, tt + 0.1, 13.45);
  d.cyl('bronze', -1.15, tt + 0.3, 13.3, 0.17, 0.02, 24, { rx: Math.PI / 2 });
  const ring = new THREE.TorusGeometry(0.15, 0.008, 5, 24);
  d.geo(ring, 'bronze', -1.15, tt + 0.3, 13.28, { shadow: false });
  ring.dispose();
  d.rod('gilded_bronze', { x: -1.15, y: tt + 0.14, z: 13.28 }, { x: -1.15, y: tt + 0.46, z: 13.28 }, 0.007, 4);
  d.rod('gilded_bronze', { x: -1.29, y: tt + 0.22, z: 13.28 }, { x: -1.01, y: tt + 0.38, z: 13.28 }, 0.007, 4);
  d.cyl('gilded_bronze', -1.15, tt + 0.3, 13.27, 0.025, 0.01, 8, { rx: Math.PI / 2 });
  placeProp(d, 'oil_lamp', 1.2, tt, 13.4, 0);
  // The chairs: his, high-backed, at the far side; the client's stool.
  const c = d.at(PLACES.reader.position.x, Y, PLACES.reader.position.z + 0.45, 0);
  c.span('wood_dark', -0.26, 0.44, -0.24, 0.26, 0.5, 0.24);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.span('wood_dark', sx * 0.22 - 0.025, 0, sz * 0.2 - 0.025, sx * 0.22 + 0.025, 0.44, sz * 0.2 + 0.025);
  c.span('wood_dark', -0.26, 0.5, 0.2, 0.26, 1.15, 0.26);
  c.span('fabric_purple', -0.2, 0.5, -0.2, 0.2, 0.54, 0.18, { shadow: false });
  d.solid(-0.3, Y, 14.7, 0.3, Y + 1.15, 15.05);
  placeProp(d, 'stool', PLACES.client.position.x, Y, PLACES.client.position.z - 0.25, 0.3, { variant: 2 });

  // The armillary sphere on its stand (west side, by the cabinet): three bronze rings round a small earth.
  const ax = -2.6, az = 15.2, ay = Y + 1.15;
  d.cyl('wood_dark', ax, Y + 0.55, az, 0.045, 1.1, 8);
  d.cyl('wood_dark', ax, Y + 0.03, az, 0.24, 0.06, 12);
  d.cyl('bronze', ax, Y + 1.12, az, 0.07, 0.04, 10);
  d.solidCyl(ax, Y + 0.55, az, 0.26, 1.1);
  for (const [rx, ry, rz, r] of [[0, 0, 0, 0.32], [Math.PI / 2, 0, 0, 0.3], [0, Math.PI / 2, 0.41, 0.28], [Math.PI / 2, 0.5, 0.41, 0.22]] as const) {
    const g = new THREE.TorusGeometry(r, 0.011, 6, 30);
    d.geo(g, 'bronze', ax, ay + 0.32, az, { rx, ry, rz, shadow: false });
    g.dispose();
  }
  d.rod('gilded_bronze', { x: ax - 0.1, y: ay + 0.1, z: az }, { x: ax + 0.1, y: ay + 0.54, z: az }, 0.008, 4);
  d.ellipsoid('marble_giallo', ax, ay + 0.32, az, 0.05, 0.05, 0.05, { seg: [8, 6] });
  d.ellipsoid('gilded_bronze', ax + 0.28, ay + 0.32, az, 0.022, 0.022, 0.022, { seg: [6, 4], shadow: false });

  // Cabinets of scrolls: a pigeonhole press on the west wall and another on the north wall.
  const press = (px: number, pz: number, yaw: number, cols: number) => {
    const p = d.at(px, Y, pz, yaw); // face −z of the frame
    const w = cols * 0.3;
    p.span('wood_dark', -w / 2, 0, -0.02, w / 2, 2.1, 0.4);
    for (let k = 0; k <= cols; k++) p.span('wood', -w / 2 + k * 0.3 - 0.015, 0.05, -0.05, -w / 2 + k * 0.3 + 0.015, 2.05, 0.05);
    for (let r = 0; r < 5; r++) p.span('wood', -w / 2, 0.05 + r * 0.5, -0.05, w / 2, 0.08 + r * 0.5, 0.05);
    for (let r = 0; r < 4; r++) {
      for (let k = 0; k < cols; k++) {
        const x = -w / 2 + k * 0.3 + 0.15;
        p.cyl((r + k) % 3 === 0 ? 'fabric_white' : 'plaster_cream', x - 0.05, 0.15 + r * 0.5 + 0.07, -0.01, 0.045, 0.2, 7, { rx: Math.PI / 2, shadow: false });
        p.cyl((r + k) % 2 ? 'plaster_cream' : 'fabric_white', x + 0.06, 0.15 + r * 0.5 + 0.07, -0.01, 0.04, 0.2, 7, { rx: Math.PI / 2, shadow: false });
        p.cyl('wood', x - 0.05, 0.15 + r * 0.5 + 0.07, -0.115, 0.012, 0.01, 6, { rx: Math.PI / 2, shadow: false });
      }
    }
    p.solid(-w / 2, 0, -0.1, w / 2, 2.1, 0.4);
  };
  // West wall: face +x, so yaw −π/2 turns the frame's −z to +x; the wall is at x = −READ_HX + 0.1.
  press(-READ_HX + 0.12, 13.0, -Math.PI / 2, 8);
  // North wall (z = READ_Z1): face −z in world.
  press(-2.2, READ_Z1 - 0.12, 0, 4);
  press(2.2, READ_Z1 - 0.12, 0, 4);

  // The wall chart of the heavens on the north wall: a blue disc in a gilded ring, the twelve houses, planets.
  const cf = d.at(0, Y + 1.95, READ_Z1 - 0.1, Math.PI); // +z of this frame is out of the wall (toward −z)
  cf.cyl('wood_dark', 0, 0, 0.01, 0.98, 0.04, 28, { rx: Math.PI / 2 });
  cf.cyl('gilded_bronze', 0, 0, 0.035, 0.92, 0.02, 28, { rx: Math.PI / 2, shadow: false });
  cf.cyl('fabric_blue', 0, 0, 0.05, 0.86, 0.02, 28, { rx: Math.PI / 2, shadow: false });
  cf.cyl('gilded_bronze', 0, 0, 0.06, 0.52, 0.012, 24, { rx: Math.PI / 2, shadow: false });
  cf.cyl('fabric_blue', 0, 0, 0.068, 0.5, 0.012, 24, { rx: Math.PI / 2, shadow: false });
  for (let k = 0; k < 6; k++) cf.box('gilded_bronze', 0, 0, 0.075, 1.72, 0.014, 0.008, { rz: (k * Math.PI) / 6, shadow: false });
  for (let k = 0; k < 7; k++) {
    const a = k * 0.9 + 0.3, r = 0.2 + (k % 3) * 0.2;
    cf.cyl(k % 2 ? 'fabric_red' : 'marble', Math.cos(a) * r, Math.sin(a) * r, 0.082, 0.035, 0.012, 10, { rx: Math.PI / 2, shadow: false });
  }

  // A shelf of instruments and jars on the east wall by the window, lamps on stands either side of the table.
  placeProp(d, 'shelf', READ_HX - 0.3, Y, 15.8, -Math.PI / 2, { variant: 0 });
  placeProp(d, 'lampstand', -2.0, Y, 13.3, 0);
  placeProp(d, 'lampstand', 2.0, Y, 13.3, 0);
  placeProp(d, 'brazier', 2.7, Y, 11.4, 0);
  lamps.push({ position: { x: -2.0, y: Y + 1.5, z: 13.3 }, intensity: 5, distance: 8, flicker: 0.2 });
  lamps.push({ position: { x: 2.0, y: Y + 1.5, z: 13.3 }, intensity: 5, distance: 8, flicker: 0.2 });
  lamps.push({ position: { x: 0, y: Y + 3.0, z: 12.5 }, intensity: 4.5, distance: 9 });
  lamps.push({ position: { x: 2.7, y: Y + 0.9, z: 11.4 }, intensity: 3, distance: 5, flicker: 0.5, color: 0xff9a50 });
  lamps.push({ position: { x: 0, y: Y + 2.6, z: 16.2 }, intensity: 4, distance: 6 });

  const object = b.build(`interior:${DOMUS_ASCLEPIODOTI}`);
  return { object, colliders: [...b.colliders], spots: placeSpots({ places: PLACES }), lamps };
}

export const asclepiodotusCell: NamedCell = {
  id: DOMUS_ASCLEPIODOTI,
  name: 'The Chaldaean’s rooms',
  latin: 'Cenaculum Asclepiodoti',
  at: DOMUS_ASCLEPIODOTI,
  slot: 7,
  anchor: (game) => locationOf(game, ASCLEPIODOTUS_SPOT) ?? null,
  bounds: { min: { x: -READ_HX - 0.5, y: -0.7, z: -0.3 }, max: { x: READ_HX + 0.5, y: FLAT_Y + READ_H + 0.8, z: READ_Z1 + 0.5 } },
  entry: { position: ENTRY, heading: 0 },
  route: [
    ENTRY,
    { x: 0, y: 0, z: LAND0 + 0.2 },
    ...[2, 5, 8, 11, 14].map((i) => ({ x: 0, y: treadTop(i), z: treadZ(i) + RUN / 2 })),
    { x: 0, y: FLAT_Y, z: STAIR_TOP_Z + 0.6 },
    { x: 0, y: FLAT_Y, z: 9.2 },
    { x: 0, y: FLAT_Y, z: READ_Z0 + 0.8 },
    { x: 0, y: FLAT_Y, z: 11.6 },
  ],
  places: PLACES,
  build,
  exit: {
    at: { x: 0, y: 1.2, z: 0.5 },
    label: 'The street door',
    verb: 'Go out',
    to: (game) => streetExit(game, ASCLEPIODOTUS_FRONT, ASCLEPIODOTUS_SPOT),
  },
};

export const asclepiodotusFront: FrontSpec = {
  id: ASCLEPIODOTUS_FRONT,
  spot: ASCLEPIODOTUS_SPOT,
  label: 'The Chaldaean’s door',
  width: 1.3,
  height: 2.3,
  style: 'studded',
  // He receives clients from the third hour to the ninth of the evening (09:00 to 21:00).
  lock: { tier: 'mediocris', openHours: [9, 21] },
  owner: { id: 'npc-asclepiodotus', name: 'Asclepiodotus' },
  margin: 0.65,
  cell: DOMUS_ASCLEPIODOTI,
  entry: { position: ENTRY, heading: 0 },
  sign: 1,
};

