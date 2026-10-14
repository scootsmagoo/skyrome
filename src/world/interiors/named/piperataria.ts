/**
 * `piperataria-bay`: Malchus's storeroom at the Horrea Piperataria (docs/STORY.md chapter 7, "The Eastern
 * Gold"). Malchus son of Iarhai, the Palmyrene who sells pepper and silk, keeps one bay of the warehouse's
 * front range for himself: a plank door in the brick front wall of the Spice Warehouses on the Sacred Way (hung
 * by front.ts near the spot `piperataria-malchus`, where Malchus stands by day), shut and locked when he is
 * out. Inside: bolts of silk on shelves down the left wall, amphorae of cinnamon, nard and cassia in racks on
 * the right, a table with his scales, and at the back the pile of pepper sacks with a red rag on a pole stuck
 * in it (the pile the quest cuts open: the cell's place `sacks`, the Parthian silver lies under a hand's depth
 * of pepper) and his strongbox (`ctn-arca-malchi`, with the ledger).
 *
 * Local frame: the door's threshold at the origin, the bay runs +z, floor y = 0, world axes.
 */
import { Draw } from '../../../arch/fabric/draw';
import { placeProp } from '../../../arch/props';
import type { Game } from '../../../core/Game';
import type { MaterialId } from '../../../gfx/materialIds';
import type { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { KitBuilt, KitLamp } from '../generic';
import { room, wallRun } from '../kits/parts';
import type { Vec3 } from '../types';
import { drawChests, locationOf, placeSpots, type NamedCell } from './common';
import { streetExit, type FrontSpec } from './front';

export const PIPERATARIA_BAY = 'piperataria-bay';
/** The world place before the door (where Malchus stands by day). */
export const PIPERATARIA_SPOT = 'piperataria-malchus';
export const PIPERATARIA_FRONT = 'front:piperataria-bay';

export const HX = 2.7; // half width
export const D = 7.5; // depth
export const H = 3.4;

const ENTRY: Vec3 = { x: 0, y: 0.05, z: 1.3 };

/** The cell's named places (local). */
export const PLACES: NonNullable<NamedCell['places']> = {
  entry: { position: { x: 0, y: 0, z: 1.3 }, heading: 0 },
  // In front of the pepper pile, looking at it.
  sacks: { position: { x: 0, y: 0, z: 4.9 }, heading: 0 },
  // By the strongbox in the back right corner.
  arca: { position: { x: 1.9, y: 0, z: 5.7 }, heading: Math.PI / 2 },
};

/** The pile of pepper sacks (a rough box, for the collider and the tests). */
export const PILE = { x0: -1.25, x1: 1.25, z0: 5.55, z1: 6.95, h: 1.05 };

const SILK: MaterialId[] = ['fabric_red', 'fabric_purple', 'fabric_blue', 'fabric_ochre', 'fabric_white', 'fabric_red', 'fabric_blue'];

function build(ctx: { game: Game; builder(): MeshBuilder }): KitBuilt {
  const b = ctx.builder();
  const d = new Draw(b);
  const lamps: KitLamp[] = [];
  const wall = 'plaster_cream' as const;
  const dado = 'plaster_dark' as const;

  // ---- the bay: floor, ceiling, walls (the door's gap in the front one)
  room(d, -HX, HX, 0, D, 0, H, wall, dado, 'concrete');
  wallRun(d, -HX, 0, HX, 0, 0, H, wall, dado, [-0.8, 0.8], 2.3);
  wallRun(d, -HX, 0, -HX, D, 0, H, wall, dado);
  wallRun(d, HX, 0, HX, D, 0, H, wall, dado);
  wallRun(d, -HX, D, HX, D, 0, H, wall, dado);
  // The street door seen from inside: shut leaves, an iron bar.
  d.span('wood_dark', -0.8, 0, -0.05, 0.8, 2.3, 0.05);
  d.span('iron', -0.8, 0.55, 0.05, 0.8, 0.6, 0.08);
  d.span('iron', -0.8, 1.65, 0.05, 0.8, 1.7, 0.08);
  d.span('wood', -0.75, 1.1, 0.05, 0.75, 1.24, 0.1);
  d.solid(-0.85, 0, -0.3, 0.85, 2.4, 0.08);

  // ---- the silk shelves down the left wall: posts, three boards, bolts laid across them
  for (const z of [1.0, 2.8, 4.6, 6.4]) d.span('wood_dark', -HX + 0.04, 0, z - 0.04, -HX + 0.54, 2.2, z + 0.04);
  for (const y of [0.45, 1.15, 1.85]) {
    d.span('wood', -HX + 0.04, y, 0.96, -HX + 0.54, y + 0.04, 6.44);
    for (let i = 0; i < 24; i++) d.cyl(SILK[(i + Math.round(y * 3)) % SILK.length], -HX + 0.3, y + 0.04 + 0.09, 1.12 + i * 0.22, 0.09, 0.44, 10, { rz: Math.PI / 2, shadow: false });
  }
  d.solid(-HX, 0, 0.9, -HX + 0.56, 2.25, 6.5);

  // ---- the spice amphorae in racks on the right wall, crates and more in the back left corner
  placeProp(d, 'amphora_rack', HX - 0.5, 0, 2.3, Math.PI / 2);
  placeProp(d, 'amphora_rack', HX - 0.5, 0, 4.1, Math.PI / 2);
  placeProp(d, 'amphora_tall', HX - 0.4, 0, 0.9, 0.4);
  placeProp(d, 'crate', -HX + 1.2, 0, D - 0.5, 0.1, { variant: 1 });
  placeProp(d, 'crate', -HX + 1.9, 0, D - 0.5, -0.1);
  placeProp(d, 'crate', -HX + 1.5, 0.42, D - 0.5, 0.2, { variant: 2 });
  placeProp(d, 'basket', -HX + 1.1, 0, 6.4, 0, { variant: 1, collide: false });

  // ---- the table with the scales (a bronze beam on a post, two pans) and a lamp
  placeProp(d, 'table', -0.5, 0, 2.2, 0, { variant: 1 });
  const sx = -0.5, sz = 2.2, sy = 0.76;
  d.cyl('bronze', sx, sy + 0.22, sz, 0.015, 0.44, 6);
  d.span('bronze', sx - 0.24, sy + 0.43, sz - 0.01, sx + 0.24, sy + 0.45, sz + 0.01);
  for (const s of [-1, 1]) {
    d.rod('bronze', { x: sx + s * 0.23, y: sy + 0.43, z: sz }, { x: sx + s * 0.23, y: sy + 0.14, z: sz }, 0.004, 4);
    d.cyl('bronze', sx + s * 0.23, sy + 0.13, sz, 0.09, 0.015, 12);
  }
  placeProp(d, 'oil_lamp', 0.05, 0.76, 2.3, 0);
  placeProp(d, 'lampstand', 1.5, 0, 0.9, 0);

  // ---- the pepper: the pile, a red rag on a pole stuck in it, a lead seal on the middle sack
  const rowZ = [6.65, 6.1, 5.75];
  const sack = (x: number, y: number, z: number, v: number, rot: number) => placeProp(d, 'sack', x, y, z, rot, { variant: v, collide: false });
  for (let i = 0; i < 5; i++) sack(-1.0 + i * 0.5, 0, rowZ[0], i % 3, i * 1.3);
  for (let i = 0; i < 4; i++) sack(-0.75 + i * 0.5, 0, rowZ[1], (i + 1) % 3, i * 2.1);
  for (let i = 0; i < 3; i++) sack(-0.5 + i * 0.5, 0, rowZ[2], i % 2, i * 0.7);
  for (let i = 0; i < 4; i++) sack(-0.75 + i * 0.5, 0.36, 6.5, (i + 2) % 3, i * 1.7);
  for (let i = 0; i < 3; i++) sack(-0.5 + i * 0.5, 0.7, 6.4, i % 3, i * 0.9);
  d.solid(PILE.x0, 0, PILE.z0, PILE.x1, PILE.h, PILE.z1);
  d.rod('wood_dark', { x: 0, y: 0.5, z: 5.95 }, { x: 0, y: 1.9, z: 5.95 }, 0.018, 5);
  d.poly('fabric_red', [{ x: 0, y: 1.88, z: 5.95 }, { x: 0.38, y: 1.78, z: 5.95 }, { x: 0.3, y: 1.68, z: 5.95 }, { x: 0, y: 1.6, z: 5.95 }], { doubleSided: true, shadow: false });
  d.cyl('lead', 0, 0.42, 5.55, 0.035, 0.012, 10, { rx: Math.PI / 2, shadow: false });
  // Pepper spilled by the pile.
  d.ellipsoid('black', 0.9, 0.012, 5.3, 0.22, 0.012, 0.16, { seg: [8, 3], shadow: false });
  lamps.push({ position: { x: 0.05, y: 1.1, z: 2.3 }, intensity: 4, distance: 7, flicker: 0.2 });
  lamps.push({ position: { x: 1.5, y: 1.9, z: 0.9 }, intensity: 4, distance: 6, flicker: 0.2 });
  lamps.push({ position: { x: 0, y: 2.7, z: 4.6 }, intensity: 6, distance: 8 });
  lamps.push({ position: { x: 1.4, y: 2.2, z: 6.6 }, intensity: 3.5, distance: 5.5, flicker: 0.25 });

  // ---- the strongbox in the back right corner, its face to the room
  drawChests(d, PIPERATARIA_BAY, { 'ctn-arca-malchi': 0 });

  const object = b.build(`interior:${PIPERATARIA_BAY}`);
  return { object, colliders: [...b.colliders], spots: placeSpots({ places: PLACES }), lamps };
}

export const piperatariaCell: NamedCell = {
  id: PIPERATARIA_BAY,
  name: 'Malchus’s storeroom',
  latin: 'Cella Malchi',
  at: PIPERATARIA_BAY,
  slot: 5,
  anchor: (game) => locationOf(game, PIPERATARIA_SPOT) ?? null,
  bounds: { min: { x: -HX - 0.4, y: -0.7, z: -0.3 }, max: { x: HX + 0.4, y: H + 0.8, z: D + 0.4 } },
  entry: { position: ENTRY, heading: 0 },
  route: [ENTRY, { x: 0.9, y: 0, z: 2.3 }, { x: 0, y: 0, z: 3.8 }, { x: 0, y: 0, z: PLACES.sacks.position.z }, { x: 1.9, y: 0, z: 5.4 }],
  places: PLACES,
  build,
  exit: {
    at: { x: 0, y: 1.2, z: 0.7 },
    label: 'The street door',
    verb: 'Go out',
    to: (game) => streetExit(game, PIPERATARIA_FRONT, PIPERATARIA_SPOT),
  },
};

export const piperatariaFront: FrontSpec = {
  id: PIPERATARIA_FRONT,
  spot: PIPERATARIA_SPOT,
  label: 'Malchus’s storeroom',
  width: 1.6,
  height: 2.4,
  style: 'plank',
  // Open by day while Malchus is in; locked when he is out (seventh hour to the twelfth, 07:00 to 18:00).
  lock: { tier: 'mediocris', openHours: [7, 18] },
  owner: { id: 'npc-malchus', name: 'Malchus' },
  margin: 0.65,
  cell: PIPERATARIA_BAY,
  entry: { position: ENTRY, heading: 0 },
  reach: 6,
};

