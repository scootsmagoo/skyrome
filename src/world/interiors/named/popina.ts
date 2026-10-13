/**
 * `popina-vici-tusci`: the Silver Pig, Vibia Chreste's popina on the Vicus Tuscus (CONTENT.md §1.1;
 * "Ad Porcum Argenteum", the painted silver pig). A plank door off the street (hung by front.ts at the
 * spot) opens on the shop room: a masonry counter painted red with three dolia sunk in it and a marble
 * top, the hearth with its cauldron at the back, two tables with their benches, the price list on the
 * wall, and the keeper's rack of amphorae. A doorway in the back wall leads to the store room: more
 * amphorae, a dolium, a pallet to sleep on, and Chreste's strongbox (`ctn-arca-porci`, locked).
 *
 * Chreste and her regulars stay in the street with the counter's front (the people of the world are
 * at street level): the room behind the door is the player's, and so is the strongbox.
 *
 * Local frame: the door's threshold at the origin, the room runs +z, floor y = 0, world axes.
 */
import * as THREE from 'three';
import { Draw } from '../../../arch/fabric/draw';
import { placeProp } from '../../../arch/props';
import type { Game } from '../../../core/Game';
import type { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { Spot } from '../../landmarks/types';
import type { KitBuilt, KitLamp } from '../generic';
import { room, wallRun } from '../kits/parts';
import type { Vec3 } from '../types';
import { drawChests, locationOf, type NamedCell } from './common';
import { streetExit, type FrontSpec } from './front';

export const POPINA = 'popina-vici-tusci';
export const POPINA_FRONT = 'front:popina-vici-tusci';

const HX = 3.4; // half width of the shop room
const ROOM_D = 6.8; // depth of the shop room
const H = 3.5;
const BACK_X0 = -HX; // the store room: x from here to BACK_X1
const BACK_X1 = 0.4;
const BACK_D = 9.9; // end of the store room
const COUNTER_X0 = 1.15;
const COUNTER_X1 = 1.95;

function build(ctx: { game: Game; builder(): MeshBuilder }): KitBuilt {
  const b = ctx.builder();
  const d = new Draw(b);
  const spots: Spot[] = [];
  const lamps: KitLamp[] = [];
  const wall = 'plaster_cream' as const;
  const dado = 'plaster_red' as const;

  // ---- the shop room: floor, ceiling, walls (the street door gap in the front one, the store room's in the back one)
  room(d, -HX, HX, 0, ROOM_D, 0, H, wall, dado, 'terracotta');
  wallRun(d, -HX, 0, HX, 0, 0, H, wall, dado, [-0.75, 0.75], 2.3);
  wallRun(d, -HX, 0, -HX, BACK_D, 0, H, wall, dado);
  wallRun(d, HX, 0, HX, ROOM_D, 0, H, wall, dado);
  wallRun(d, -HX, ROOM_D, HX, ROOM_D, 0, H, wall, dado, [-2.75, -1.25], 2.3);
  // The street door seen from inside: shut leaves in the doorway, a bar across them.
  d.span('wood_dark', -0.75, 0, -0.05, 0.75, 2.3, 0.05);
  d.span('iron', -0.75, 0.55, 0.05, 0.75, 0.6, 0.08);
  d.span('iron', -0.75, 1.65, 0.05, 0.75, 1.7, 0.08);
  d.span('wood', -0.7, 1.15, 0.05, 0.7, 1.28, 0.1);
  d.solid(-0.8, 0, -0.3, 0.8, 2.4, 0.08);
  // The shutters of the counter's window: two boards shut over a hatch in the front wall, right of the door.
  d.span('wood', 1.3, 0.95, 0.1, 2.6, 2.1, 0.16);
  d.span('wood_dark', 1.3, 1.5, 0.15, 2.6, 1.56, 0.19);

  // ---- the counter: red masonry, a marble top, three dolia sunk in it under terracotta lids
  const cz0 = 1.5, cz1 = 5.3;
  d.span('plaster_red', COUNTER_X0, 0, cz0, COUNTER_X1, 0.95, cz1);
  d.span('marble_veined', COUNTER_X0 - 0.04, 0.95, cz0 - 0.04, COUNTER_X1 + 0.04, 1.02, cz1 + 0.04);
  d.solid(COUNTER_X0, 0, cz0, COUNTER_X1, 1.02, cz1);
  for (const z of [2.4, 3.4, 4.4]) {
    const x = (COUNTER_X0 + COUNTER_X1) / 2;
    d.cyl('black', x, 1.025, z, 0.3, 0.012, 14);
    d.cyl('terracotta', x, 1.04, z, 0.27, 0.035, 14);
    d.cyl('terracotta', x, 1.07, z, 0.05, 0.03, 8);
  }
  // A shelf of cups and bowls on the counter's end, a lamp, the day's bread.
  placeProp(d, 'shelf', HX - 0.35, 0, 2.3, -Math.PI / 2);
  placeProp(d, 'amphora_rack', HX - 0.45, 0, 3.7, Math.PI / 2);
  placeProp(d, 'dolium', HX - 0.75, 0, 5.4, 0, { scale: 0.8 });

  // ---- the hearth at the back right: a brick block, a cauldron on a grate, a hood to the ceiling
  const hx0 = 2.0, hx1 = 3.3, hz0 = ROOM_D - 0.8, hz1 = ROOM_D;
  d.span('brick', hx0, 0, hz0, hx1, 0.85, hz1 - 0.1, { collide: true });
  d.span('iron', hx0 + 0.1, 0.85, hz0 + 0.1, hx1 - 0.1, 0.9, hz1 - 0.2);
  d.cyl('bronze', (hx0 + hx1) / 2 - 0.1, 1.05, (hz0 + hz1) / 2 - 0.1, 0.3, 0.32, 12, { rTop: 0.36 });
  d.span('glow_fire', hx0 + 0.15, 0.86, hz0 + 0.12, hx1 - 0.15, 0.95, hz1 - 0.25, { shadow: false });
  for (const s of [-1, 1]) d.span('brick', s < 0 ? hx0 : hx1 - 0.2, 0.9, hz1 - 0.6, s < 0 ? hx0 + 0.2 : hx1, H, hz1 - 0.1);
  d.span('brick', hx0, 2.2, hz0 + 0.2, hx1, 2.5, hz1 - 0.1);
  lamps.push({ position: { x: (hx0 + hx1) / 2, y: 1.2, z: hz0 + 0.2 }, intensity: 7, distance: 8, flicker: 0.4, color: 0xff9a50 });
  lamps.push({ position: { x: 0.2, y: 2.6, z: 2.6 }, intensity: 5, distance: 8 });
  lamps.push({ position: { x: -1.8, y: 2.4, z: 5.2 }, intensity: 4, distance: 7 });

  // ---- the customers' side: two tables, their benches, a stool by the door
  for (const z of [2.6, 4.7]) {
    placeProp(d, 'table', -1.9, 0, z, 0.1);
    placeProp(d, 'bench', -1.9 - 0.95, 0, z, Math.PI / 2);
    placeProp(d, 'bench', -1.9 + 0.95, 0, z, -Math.PI / 2);
    placeProp(d, 'oil_lamp', -1.9, 0.78, z, 0);
  }
  placeProp(d, 'stool', -2.8, 0, 1.0, 0.4);
  // Dice and three counters on a table, a jug.
  for (const [x, z] of [[-1.75, 2.5], [-1.62, 2.66]] as const) d.span('fabric_white', x, 0.78, z, x + 0.035, 0.815, z + 0.035, { shadow: false });
  // The price list on the left wall: a whitewashed board with the lines painted on it.
  d.span('plaster_white', -HX + 0.1, 1.5, 1.2, -HX + 0.115, 2.5, 2.8, { shadow: false });
  for (let i = 0; i < 6; i++) {
    const y = 2.35 - i * 0.14;
    d.span('plaster_dark', -HX + 0.115, y, 1.35, -HX + 0.125, y + 0.05, 1.35 + (i % 3 === 0 ? 1.05 : 0.8), { shadow: false });
    d.span('plaster_dark', -HX + 0.115, y, 2.55, -HX + 0.125, y + 0.05, 2.7, { shadow: false });
  }
  // A painted silver pig over the back doorway.
  d.ellipsoid('lead', -2.0, 2.65, ROOM_D - 0.14, 0.28, 0.16, 0.05, { seg: [10, 6] });
  d.ellipsoid('lead', -1.72, 2.7, ROOM_D - 0.14, 0.1, 0.09, 0.05, { seg: [8, 5] });

  // ---- the store room: pallet, amphorae, a dolium, a shelf, the strongbox
  room(d, BACK_X0, BACK_X1, ROOM_D, BACK_D, 0, 3.2, wall, dado, 'concrete');
  wallRun(d, BACK_X1, ROOM_D, BACK_X1, BACK_D, 0, 3.2, wall, dado);
  wallRun(d, BACK_X0, BACK_D, BACK_X1, BACK_D, 0, 3.2, wall, dado);
  // The pallet along the left wall: a plank bed with a straw tick and a rug.
  d.span('wood', BACK_X0 + 0.15, 0, ROOM_D + 0.6, BACK_X0 + 1.0, 0.35, ROOM_D + 2.5);
  d.span('dry_grass', BACK_X0 + 0.19, 0.35, ROOM_D + 0.64, BACK_X0 + 0.96, 0.45, ROOM_D + 2.46, { shadow: false });
  d.span('fabric_ochre', BACK_X0 + 0.2, 0.45, ROOM_D + 1.4, BACK_X0 + 0.95, 0.49, ROOM_D + 2.45, { shadow: false });
  d.solid(BACK_X0 + 0.15, 0, ROOM_D + 0.6, BACK_X0 + 1.0, 0.49, ROOM_D + 2.5);
  placeProp(d, 'amphora_rack', BACK_X0 + 0.5, 0, BACK_D - 0.7, 0);
  placeProp(d, 'dolium', BACK_X1 - 0.8, 0, ROOM_D + 0.9, 0);
  placeProp(d, 'amphora_tall', BACK_X0 + 1.7, 0, BACK_D - 0.45, 0);
  placeProp(d, 'amphora_tall', BACK_X0 + 2.0, 0, BACK_D - 0.4, 0, { variant: 1 });
  placeProp(d, 'sack', BACK_X1 - 0.5, 0, BACK_D - 0.6, 0.6);
  placeProp(d, 'shelf', BACK_X0 + 0.3, 0, ROOM_D + 3.0, Math.PI / 2);
  drawChests(d, POPINA);
  lamps.push({ position: { x: -1.5, y: 2.3, z: 8.4 }, intensity: 4, distance: 6, flicker: 0.2 });

  spots.push(
    { id: 'entry', kind: 'spawn', position: new THREE.Vector3(0, 0, 1.3), heading: 0 },
    { id: 'counter', kind: 'npc', position: new THREE.Vector3(2.7, 0, 3.4), heading: -Math.PI / 2 },
    { id: 'tables', kind: 'sit', position: new THREE.Vector3(-1.9, 0, 3.6), heading: 0 },
    { id: 'store', kind: 'spot', position: new THREE.Vector3(-1.5, 0, 8.2), heading: 0 },
  );
  const object = b.build(`interior:${POPINA}`);
  return { object, colliders: [...b.colliders], spots, lamps };
}

const ENTRY: Vec3 = { x: 0, y: 0.05, z: 1.3 };

export const popinaCell: NamedCell = {
  id: POPINA,
  name: 'The Silver Pig',
  latin: 'Ad Porcum Argenteum',
  at: POPINA,
  slot: 2,
  anchor: (game) => locationOf(game, POPINA) ?? null,
  bounds: { min: { x: -HX - 0.4, y: -0.7, z: -0.3 }, max: { x: HX + 0.4, y: H + 0.8, z: BACK_D + 0.4 } },
  entry: { position: ENTRY, heading: 0 },
  route: [ENTRY, { x: 0, y: 0, z: 3.4 }, { x: -1.9, y: 0, z: ROOM_D - 0.4 }, { x: -1.9, y: 0, z: ROOM_D + 1.5 }, { x: -1.5, y: 0, z: BACK_D - 1.6 }],
  build,
  exit: {
    at: { x: 0, y: 1.2, z: 0.7 },
    label: 'The street door',
    verb: 'Go out',
    to: (game) => streetExit(game, POPINA_FRONT, POPINA),
  },
};

export const popinaFront: FrontSpec = {
  id: POPINA_FRONT,
  spot: POPINA,
  label: 'The Silver Pig',
  width: 1.5,
  height: 2.3,
  style: 'plank',
  // A popina stays open late: shut only in the small hours.
  lock: { tier: 'mediocris', openHours: [5, 2] },
  owner: { id: 'npc-chreste', name: 'Vibia Chreste' },
  cell: POPINA,
  entry: { position: ENTRY, heading: 0 },
  sign: 1,
};
