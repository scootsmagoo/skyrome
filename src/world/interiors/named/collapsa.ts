/**
 * `dun-taberna-collapsa`: the cellar under the burned taberna off the Vicus Tuscus (CONTENT.md §1.4,
 * GDD §17.1, "dun-taberna-collapsa"). The taberna itself is open ground in the world (the city keeps
 * it clear for mq-02: Mus and his knife-men wait there, `taberna-collapsa`, and his strongbox with
 * Festus' satchel stands in the street beside it), so the cellar is an extra way in for the curious:
 * a cellar hatch in the ground near the place (front.ts hangs it) and a stair down into what is left
 * of the shop's storeroom. The ceiling came down in the fire: charred beams hang half-fallen across
 * the room, rubble heaps in the corners, the amphorae cracked and black. A side chamber holds a
 * scorched chest (`ctn-cista-combusta`), and in the corner by the back wall the light well to the
 * next insula's court lets in a shaft of grey daylight and a ladder of iron rungs up it; the way out is
 * the stair to the hatch, or that ladder up to the court (`taberna-collapsa-puteus`).
 *
 * Local frame: the cellar floor y = 0, world axes; the stair climbs −z from the entry to the hatch.
 */
import * as THREE from 'three';
import { Draw } from '../../../arch/fabric/draw';
import { placeProp } from '../../../arch/props';
import { Rng } from '../../../core/Rng';
import type { Game } from '../../../core/Game';
import type { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { Spot } from '../../landmarks/types';
import type { KitBuilt, KitLamp } from '../generic';
import { wallRun } from '../kits/parts';
import type { Vec3 } from '../types';
import { drawChests, locationOf, type NamedCell } from './common';
import { streetExit, type FrontSpec } from './front';

export const COLLAPSA = 'dun-taberna-collapsa';
/** The place (and its `:interior` containers' prefix): the burned taberna's spot. */
export const COLLAPSA_AT = 'taberna-collapsa';
export const COLLAPSA_FRONT = 'front:taberna-collapsa';
const PUTEUS = 'taberna-collapsa-puteus';

const HX = 3.2; // half width of the cellar
const D = 8.4; // its depth
const H = 2.9;
const STEPS = 14;
const RISE = 0.2;
const RUN = 0.3;
const CHAMBER_X1 = 6.7;

/** A charred beam from (x0, y0, z0) to (x1, y1, z1): black wood, a square section, collision-free (they hang above the walk). */
function beam(d: Draw, a: Vec3, b: Vec3, t = 0.2) {
  d.rod('black', a, b, t * 0.55, 4);
  d.rod('wood_dark', { x: a.x + 0.02, y: a.y + 0.03, z: a.z }, { x: b.x + 0.02, y: b.y + 0.03, z: b.z }, t * 0.4, 4);
}

function build(ctx: { game: Game; builder(): MeshBuilder }): KitBuilt {
  const b = ctx.builder();
  const d = new Draw(b);
  const rng = new Rng(COLLAPSA);
  const spots: Spot[] = [];
  const lamps: KitLamp[] = [];
  const wall = 'brick' as const;
  const dado = 'plaster_dark' as const;

  // ---- the stair from the hatch: 14 treads down to the floor, a ceiling over it, the hatch's square of grey light
  const stairTop = STEPS * RISE;
  for (let i = 0; i < STEPS; i++) {
    const z = -STEPS * RUN + i * RUN, y = stairTop - i * RISE;
    d.span('wood_dark', -0.6, y - 0.12, z, 0.6, y, z + RUN);
    d.solid(-0.6, 0, z, 0.6, y, z + RUN);
  }
  // The stairwell: two walls, a ceiling a storey up, and daylight at the head (the hatch) as a pale square.
  const wellTop = stairTop + 2.6;
  wallRun(d, -0.7, -STEPS * RUN - 0.1, -0.7, 0.4, 0, wellTop, wall, dado);
  wallRun(d, 0.7, -STEPS * RUN - 0.1, 0.7, 0.4, 0, wellTop, wall, dado);
  d.span('wood_dark', -0.8, wellTop, -STEPS * RUN - 0.3, 0.8, wellTop + 0.2, 0.4, { shadow: false });
  // Below the head of the stair a wall of earth and brick; above it the opening, grey light.
  d.span('brick', -0.7, 0, -STEPS * RUN - 0.3, 0.7, stairTop, -STEPS * RUN - 0.1);
  d.span('plaster_cream', -0.58, stairTop + 0.05, -STEPS * RUN - 0.2, 0.58, wellTop, -STEPS * RUN - 0.18, { shadow: false });
  d.solid(-0.7, 0, -STEPS * RUN - 0.4, 0.7, wellTop, -STEPS * RUN - 0.1);
  lamps.push({ position: { x: 0, y: stairTop + 1.4, z: -STEPS * RUN + 1.6 }, color: 0xdfe8ff, intensity: 3, distance: 6 });

  // ---- the cellar: a floor of ash and cracked tile, walls scorched black at the top, the doorway to the stair at the front
  d.span('mud', -HX, -0.2, 0.3, HX, 0, D);
  d.solid(-HX, -0.6, -0.3, HX, 0, D);
  d.span('mud', -0.7, -0.2, -STEPS * RUN, 0.7, -0.01, 0.4, { shadow: false });
  wallRun(d, -HX, 0.3, -0.7, 0.3, 0, H, wall, dado);
  wallRun(d, 0.7, 0.3, HX, 0.3, 0, H, wall, dado);
  wallRun(d, -HX, 0.3, -HX, D, 0, H, wall, dado);
  wallRun(d, -HX, D, HX, D, 0, H, wall, dado);
  // The east wall, with a doorway to the side chamber.
  wallRun(d, HX, 0.3, HX, D, 0, H, wall, dado, [2.0, 3.4], 2.1);
  // The scorch above the dado: soot bands up each wall.
  for (const [x0, z0, x1, z1] of [[-HX + 0.11, 0.4, -HX + 0.13, D - 0.1], [HX - 0.13, 0.4, HX - 0.11, D - 0.1]] as const) d.span('black', x0, 1.2, z0, x1, H, z1, { shadow: false });
  d.span('black', -HX + 0.1, 1.2, D - 0.13, HX - 0.1, H, D - 0.11, { shadow: false });
  // What is left of the ceiling: planks over the front third and the right, the rest fallen.
  const WX = 1.7, WZ = D - 1.75; // the light well's opening in the ceiling: x from WX, z from WZ
  for (const [x0, z0, x1, z1] of [[-HX, 0.3, HX, 2.6], [0.2, 2.6, WX, D], [WX, 2.6, HX, WZ]] as const) {
    d.span('wood_dark', x0, H, z0, x1, H + 0.12, z1, { shadow: false });
    d.span('black', x0, H + 0.12, z0, x1, H + 0.3, z1, { shadow: false });
  }
  // Where the ceiling fell: the shop's burned shell above, open to a grey sky (the cell is under the
  // city: an open top would show the streets' underside).
  const top = H + 2.6;
  d.span('brick', -HX - 0.2, H, 2.6, -HX, top, D, { shadow: false });
  d.span('brick', -HX, H, D, 0.2, top, D + 0.2, { shadow: false });
  d.span('brick', -HX, H + 0.3, 2.5, 0.2, top, 2.6, { shadow: false });
  d.span('brick', 0.2, H + 0.3, 2.6, 0.3, top, D, { shadow: false });
  d.span('plaster_white', -HX - 0.2, top, 2.5, 0.3, top + 0.05, D + 0.2, { shadow: false });
  lamps.push({ position: { x: -HX / 2, y: top - 0.6, z: (2.6 + D) / 2 }, color: 0xdfe8ff, intensity: 6, distance: 7 });
  // Beams: two still standing on their posts, three half-fallen from the ceiling to the heap below.
  for (const x of [-HX + 0.3, 0.8]) {
    d.rod('black', { x, y: 0, z: 2.6 }, { x, y: H, z: 2.6 }, 0.12, 5);
    d.solid(x - 0.12, 0, 2.5, x + 0.12, H, 2.7);
  }
  d.span('black', -HX, H - 0.28, 2.5, 1.0, H, 2.7, { shadow: false });
  beam(d, { x: -2.9, y: 2.75, z: 3.6 }, { x: -0.6, y: 0.9, z: 4.6 }, 0.3);
  beam(d, { x: 0.3, y: 2.8, z: 5.6 }, { x: 2.3, y: 1.1, z: 6.7 }, 0.3);
  beam(d, { x: -1.2, y: 2.85, z: 6.8 }, { x: -2.9, y: 0.5, z: 7.7 }, 0.26);
  // A beam fallen flat across the left half of the room, knee high: the way is round it by the right or over it.
  d.span('black', -HX, 0.0, 4.9, -0.4, 0.42, 5.3, { shadow: false });
  d.span('wood_dark', -HX + 0.05, 0.4, 4.92, -0.45, 0.43, 5.28, { shadow: false });
  d.solid(-HX, 0, 4.9, -0.4, 0.42, 5.3);
  // Rubble: heaps of fallen brick and concrete in the corners.
  const heap = (cx: number, cz: number, w: number, h: number, dd: number, solid = true) => {
    d.span('concrete', cx - w / 2, 0, cz - dd / 2, cx + w / 2, h, cz + dd / 2);
    for (let i = 0; i < 5; i++) {
      const bx = cx + rng.range(-w / 2, w / 2), bz = cz + rng.range(-dd / 2, dd / 2);
      d.box(rng.chance(0.5) ? 'brick' : 'concrete', bx, h + 0.04, bz, rng.range(0.2, 0.4), 0.14, rng.range(0.2, 0.35), { ry: rng.range(0, 3), rx: rng.range(-0.3, 0.3) });
    }
    if (solid) d.solid(cx - w / 2, 0, cz - dd / 2, cx + w / 2, h, cz + dd / 2);
  };
  heap(-2.4, 1.1, 1.4, 0.6, 1.1);
  heap(2.5, 4.1, 1.5, 0.7, 1.2);
  heap(-0.4, 7.6, 2.0, 0.8, 1.2);
  heap(2.6, 7.4, 1.2, 0.5, 1.2);
  // Burnt amphorae, a tipped dolium, charred sacks.
  placeProp(d, 'amphora_tall', 1.5, 0, 1.6, 0.3);
  placeProp(d, 'amphora_globular', 2.2, 0, 1.2, 1.1, { variant: 2 });
  placeProp(d, 'dolium', -1.9, 0, 6.0, 0, { scale: 0.9 });
  for (const [x, z] of [[1.9, 2.9], [0.4, 6.1]] as const) d.ellipsoid('black', x, 0.18, z, 0.34, 0.2, 0.26, { seg: [8, 5] });
  for (let i = 0; i < 12; i++) d.box('terracotta', rng.range(-HX + 0.4, HX - 0.4), 0.02, rng.range(1.0, D - 0.5), rng.range(0.1, 0.25), 0.03, rng.range(0.08, 0.2), { ry: rng.range(0, 3) });
  // Embers still glowing in the ash by the dolium.
  for (const [x, z] of [[-1.0, 6.2], [-0.8, 6.45], [-1.15, 6.5]] as const) d.span('glow_fire', x, 0.01, z, x + 0.12, 0.03, z + 0.1, { shadow: false });
  lamps.push({ position: { x: -1.0, y: 0.5, z: 6.3 }, color: 0xff7a35, intensity: 2.5, distance: 5, flicker: 0.6 });

  // ---- the light well in the back-right corner: a shaft of grey daylight, a ladder of iron rungs up it
  const wx = (WX + HX) / 2, wz = (WZ + D) / 2;
  // The shaft: three brick walls from the ceiling up, a pale cap, the ladder of iron rungs on the back wall.
  d.span('brick', WX - 0.1, H, WZ, WX + 0.1, H + 4.2, D);
  d.span('brick', WX, H, WZ - 0.1, HX, H + 4.2, WZ + 0.1);
  d.span('plaster_white', WX + 0.1, H + 4.1, WZ + 0.1, HX - 0.1, H + 4.2, D - 0.1, { shadow: false });
  for (let i = 0; i < 9; i++) d.span('iron', wx - 0.3, 0.3 + i * 0.4, D - 0.18, wx + 0.3, 0.35 + i * 0.4, D - 0.1, { shadow: false });
  for (const x of [-0.3, 0.3]) d.span('iron', wx + x - 0.02, 0.2, D - 0.18, wx + x + 0.02, H + 4.0, D - 0.1, { shadow: false });
  lamps.push({ position: { x: wx, y: H + 1.2, z: wz - 0.2 }, color: 0xdfe8ff, intensity: 7, distance: 8 });

  // ---- the side chamber: a store room that kept its roof; the scorched chest against the far wall
  const cz0 = 1.0, cz1 = 4.6;
  d.span('mud', HX, -0.2, cz0, CHAMBER_X1, 0, cz1);
  d.solid(HX, -0.6, cz0, CHAMBER_X1, 0, cz1);
  d.span('wood_dark', HX, 2.5, cz0, CHAMBER_X1, 2.62, cz1, { shadow: false });
  wallRun(d, HX, cz0, CHAMBER_X1, cz0, 0, 2.6, wall, dado);
  wallRun(d, HX, cz1, CHAMBER_X1, cz1, 0, 2.6, wall, dado);
  wallRun(d, CHAMBER_X1, cz0, CHAMBER_X1, cz1, 0, 2.6, wall, dado);
  d.span('black', HX + 0.1, 1.2, cz0 + 0.1, CHAMBER_X1 - 0.1, 2.5, cz0 + 0.12, { shadow: false });
  placeProp(d, 'shelf', HX + 1.5, 0, cz1 - 0.35, Math.PI, { scale: 0.9 });
  placeProp(d, 'sack', HX + 0.7, 0, cz0 + 0.7, 0.4);
  placeProp(d, 'amphora_rack', HX + 1.7, 0, cz0 + 0.55, 0);
  drawChests(d, COLLAPSA_AT, { 'ctn-cista-combusta': Math.PI / 2 });
  lamps.push({ position: { x: HX + 1.6, y: 1.8, z: 2.8 }, color: 0xff9a50, intensity: 3, distance: 5, flicker: 0.5 });

  spots.push(
    { id: 'entry', kind: 'spawn', position: new THREE.Vector3(0, 0, 1.0), heading: 0 },
    { id: 'cellar', kind: 'spot', position: new THREE.Vector3(0, 0, 4.0), heading: 0 },
    { id: 'chamber', kind: 'spot', position: new THREE.Vector3(5.0, 0, 2.8), heading: Math.PI / 2 },
    { id: 'well', kind: 'spot', position: new THREE.Vector3(wx, 0, D - 1.3), heading: 0 },
  );
  const object = b.build(`interior:${COLLAPSA}`);
  return { object, colliders: [...b.colliders], spots, lamps };
}

const ENTRY: Vec3 = { x: 0, y: 0.05, z: 1.0 };
const STAIR_TOP = STEPS * RISE;

export const collapsaCell: NamedCell = {
  id: COLLAPSA,
  name: 'The Burned Cellar',
  latin: 'Cella combusta',
  at: COLLAPSA_AT,
  slot: 4,
  anchor: (game) => locationOf(game, COLLAPSA_AT) ?? null,
  bounds: { min: { x: -HX - 0.4, y: -0.7, z: -STEPS * RUN - 0.6 }, max: { x: CHAMBER_X1 + 0.4, y: STAIR_TOP + 2.8, z: D + 0.4 } },
  entry: { position: ENTRY, heading: 0 },
  route: [ENTRY, { x: 0, y: 0, z: 3.0 }, { x: 2.7, y: 0, z: 3.0 }, { x: 5.0, y: 0, z: 2.8 }],
  build,
  exit: {
    // At the head of the stair: climb it and press the key.
    at: { x: 0, y: STAIR_TOP + 1.0, z: -STEPS * RUN + 0.5 },
    label: 'The cellar hatch',
    verb: 'Climb out',
    to: (game) => streetExit(game, COLLAPSA_FRONT, COLLAPSA_AT),
  },
  outside: [
    {
      id: `${COLLAPSA}:well`,
      label: 'The light well',
      verb: 'Climb the ladder',
      at: { x: 2.45, y: 1.2, z: D - 1.3 },
      from: COLLAPSA,
      reach: 1.6,
      // Up into the court of the next insula (CONTENT.md §1.4): its spot, the player stepped clear if a wall stands there.
      to: {
        interior: null,
        position: (game) => {
          const l = locationOf(game, PUTEUS);
          return l ?? (null as unknown as Vec3);
        },
        heading: 0,
      },
    },
  ],
};

export const collapsaFront: FrontSpec = {
  id: COLLAPSA_FRONT,
  spot: COLLAPSA_AT,
  label: 'A cellar hatch',
  width: 1.1,
  height: 0.2,
  style: 'plank',
  cell: COLLAPSA,
  entry: { position: ENTRY, heading: 0 },
  // South-east of Mus' corner, off the fight's ground and the strongbox and the amphorae the content puts there.
  hatch: { dx: 1.2, dz: 3.4, verb: 'Climb down' },
};
