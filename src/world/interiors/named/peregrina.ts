/**
 * `peregrina-barracks`: the couriers' barracks (Contubernia) in the Castra Peregrina (docs/STORY.md chapter 7).
 * The camp builder (builders/colos-caelian.ts) lines its two sides with barrack blocks, a front room and a
 * sleeping room each, with a plain door every four metres along the street side; the one by the place
 * `peregrina-barracks-door` is the way in (hung by front.ts: a stone porch and a plank door, open from 05:00 to
 * 22:00, mediocre lock, the couriers' own). Inside: the front room with a long table and benches, pegs of
 * cloaks and satchels, a brazier and a notice board; through the opening, the sleeping room: a row of five bunks
 * down the west wall, five down the east, each with its wooden locker at the foot, a herm of Mercury at the end.
 * Mardonius's box (`ctn-loculus-mardonii`) is the third locker on the east side; two more are ordinary
 * (`ctn-loculus-peregrini-1` and `-2`). Picking his box with the couriers about is a crime like any other (nobody
 * stands in the cell: the men are on their rounds).
 *
 * Local frame: the door's threshold at the origin, the barracks runs +z, floor y = 0, world axes.
 */
import { Draw } from '../../../arch/fabric/draw';
import { placeProp } from '../../../arch/props';
import type { Game } from '../../../core/Game';
import type { MaterialId } from '../../../gfx/materialIds';
import type { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { KitBuilt, KitLamp } from '../generic';
import { chest, room, wallRun } from '../kits/parts';
import type { Vec3 } from '../types';
import { drawChests, locationOf, placeSpots, type NamedCell } from './common';
import { streetExit, type FrontSpec } from './front';

export const PEREGRINA_BARRACKS = 'peregrina-barracks';
export const PEREGRINA_SPOT = 'peregrina-barracks-door';
export const PEREGRINA_FRONT = 'front:peregrina-barracks';

export const HX = 3.2;
export const D = 11.5;
export const H = 3.0;
const PART_Z = 4.2; // the partition between the front room and the sleeping room
/** The bunks' z centres (five a side), the length of a bunk and where the lockers stand. */
export const BUNK_Z = [5.2, 6.55, 7.9, 9.25, 10.6];
const BUNK_LEN = 1.65;
export const LOCKER_X = HX - BUNK_LEN - 0.3; // 1.25: the lockers' centre line (±)

/** The long table of the front room stands along the west side, leaving the east side of the room for the way through. */
const TABLE_X = -1.55;

const ENTRY: Vec3 = { x: 0, y: 0.05, z: 1.3 };

export const PLACES: NonNullable<NamedCell['places']> = {
  entry: { position: { x: 0, y: 0, z: 1.3 }, heading: 0 },
  // Before Mardonius's box on the east side, facing it.
  'mardonius-box': { position: { x: 0.35, y: 0, z: BUNK_Z[2] }, heading: Math.PI / 2 },
};

function build(ctx: { game: Game; builder(): MeshBuilder }): KitBuilt {
  const b = ctx.builder();
  const d = new Draw(b);
  const lamps: KitLamp[] = [];
  const wall = 'plaster_cream' as const;
  const dado = 'plaster_red' as const;

  // ---- the two rooms: floors, ceilings, walls, the door and the partition's opening
  room(d, -HX, HX, 0, PART_Z, 0, H, wall, dado, 'concrete');
  room(d, -HX, HX, PART_Z, D, 0, H, wall, dado, 'dirt');
  wallRun(d, -HX, 0, HX, 0, 0, H, wall, dado, [-0.6, 0.6], 2.2);
  wallRun(d, -HX, 0, -HX, D, 0, H, wall, dado);
  wallRun(d, HX, 0, HX, D, 0, H, wall, dado);
  wallRun(d, -HX, D, HX, D, 0, H, wall, dado);
  wallRun(d, -HX, PART_Z, HX, PART_Z, 0, H, wall, dado, [-1.5, 1.5], 2.3);
  d.span('wood_dark', -0.6, 0, -0.05, 0.6, 2.2, 0.05);
  d.span('iron', -0.6, 0.5, 0.05, 0.6, 0.55, 0.08);
  d.span('iron', -0.6, 1.5, 0.05, 0.6, 1.55, 0.08);
  d.solid(-0.65, 0, -0.3, 0.65, 2.3, 0.08);
  // Slit windows high in the end wall (the camp's daylight).
  for (const x of [-1.8, 1.8]) d.span('plaster_white', x - 0.22, 1.9, D - 0.115, x + 0.22, 2.5, D - 0.105, { shadow: false });
  lamps.push({ position: { x: 0, y: 2.2, z: D - 0.6 }, color: 0xdfe8ff, intensity: 4, distance: 7, daylight: true });

  // ---- the front room: a long table end to end, a bench either side, a brazier, pegs and a board
  for (const z of [1.9, 3.0]) placeProp(d, 'table', TABLE_X, 0, z, Math.PI / 2, { variant: z < 2 ? 2 : 1 });
  placeProp(d, 'bench', TABLE_X - 0.75, 0, 2.45, Math.PI / 2, { variant: 1 });
  placeProp(d, 'bench', TABLE_X + 0.75, 0, 2.45, Math.PI / 2, { variant: 1 });
  placeProp(d, 'brazier', HX - 0.55, 0, 3.4, 0);
  // Pegs on the west wall with cloaks and leather satchels (a courier's), message tubes in a rack.
  for (let i = 0; i < 5; i++) {
    const z = 1.2 + i * 0.6;
    d.span('iron', -HX + 0.1, 1.7, z - 0.02, -HX + 0.2, 1.74, z + 0.02, { shadow: false });
    d.span(i % 2 ? 'fabric_ochre' : 'fabric_red', -HX + 0.12, 0.85, z - 0.2, -HX + 0.2, 1.7, z + 0.2, { shadow: false });
    if (i % 2 === 0) d.span('wood', -HX + 0.2, 0.9, z - 0.12, -HX + 0.32, 1.22, z + 0.12, { shadow: false });
  }
  d.span('wood_dark', -HX + 0.1, 0.4, 0.8, -HX + 0.3, 0.46, 3.9);
  for (let i = 0; i < 6; i++) d.cyl('wood', -HX + 0.2, 0.55, 1.0 + i * 0.5, 0.045, 0.3, 7, { shadow: false });
  // A notice board on the east wall with tablets pinned on it.
  d.span('wood_dark', HX - 0.12, 1.3, 0.9, HX - 0.1, 2.3, 2.5, { shadow: false });
  for (const [z, y] of [[1.2, 2.05], [1.8, 1.9], [2.2, 2.1], [1.4, 1.55], [2.0, 1.5]] as const) d.span('plaster_cream', HX - 0.14, y, z - 0.16, HX - 0.12, y + 0.2, z + 0.16, { shadow: false });
  lamps.push({ position: { x: TABLE_X, y: 1.9, z: 2.4 }, intensity: 5, distance: 8, flicker: 0.2 });
  lamps.push({ position: { x: HX - 0.9, y: 1.0, z: 3.4 }, intensity: 3, distance: 5, flicker: 0.5, color: 0xff9a50 });
  placeProp(d, 'oil_lamp', TABLE_X, 0.76, 2.45, 0);

  // ---- the sleeping room: five bunks and five lockers a side
  const blankets: MaterialId[] = ['fabric_red', 'fabric_ochre', 'fabric_blue', 'fabric_white', 'fabric_red'];
  for (const s of [-1, 1]) {
    BUNK_Z.forEach((z, i) => {
      const xa = s * HX, xb = s * (HX - BUNK_LEN);
      const x0 = Math.min(xa, xb) + (s > 0 ? 0 : 0.05), x1 = Math.max(xa, xb) - (s > 0 ? 0.05 : 0);
      d.span('wood', x0, 0, z - 0.42, x1, 0.4, z + 0.42);
      d.span('dry_grass', x0 + 0.03, 0.4, z - 0.38, x1 - 0.03, 0.48, z + 0.38, { shadow: false });
      const mid = (x0 + x1) / 2;
      d.span(s > 0 && i === 2 ? 'fabric_purple' : blankets[(i + (s > 0 ? 2 : 0)) % blankets.length], s > 0 ? mid - 0.2 : x0 + 0.05, 0.48, z - 0.38, s > 0 ? x1 - 0.05 : mid + 0.2, 0.52, z + 0.38, { shadow: false });
      d.span('fabric_white', s > 0 ? x1 - 0.32 : x0 + 0.05, 0.48, z - 0.28, s > 0 ? x1 - 0.05 : x0 + 0.32, 0.56, z + 0.28, { shadow: false });
      d.solid(x0, 0, z - 0.42, x1, 0.52, z + 0.42);
      // A peg over the bunk's head, a pair of boots under it.
      d.span('iron', s > 0 ? HX - 0.12 : -HX + 0.02, 1.6, z - 0.02, s > 0 ? HX - 0.02 : -HX + 0.12, 1.65, z + 0.02, { shadow: false });
      d.span('wood_dark', s * (HX - 0.4) - 0.1, 0, z + 0.45, s * (HX - 0.4) + 0.1, 0.12, z + 0.6, { shadow: false });
    });
  }
  // The lockers at the feet. The containers' boxes are drawn from their data (one way for the prompt and the box).
  const yaws: Record<string, number> = { 'ctn-loculus-mardonii': Math.PI / 2, 'ctn-loculus-peregrini-1': Math.PI / 2, 'ctn-loculus-peregrini-2': -Math.PI / 2 };
  drawChests(d, PEREGRINA_BARRACKS, yaws);
  // Plain lockers where no container stands (east: 5.2, 6.55, 9.25; west: all but the last).
  for (const s of [-1, 1]) {
    BUNK_Z.forEach((z, i) => {
      const taken = (s > 0 && (i === 2 || i === 4)) || (s < 0 && i === 0);
      if (!taken) chest(d, 'locker', s * LOCKER_X, 0, z, -s * (Math.PI / 2));
    });
  }
  // A herm of Mercury at the end of the aisle, with a lamp on a stand either side.
  placeProp(d, 'herm', 0, 0, D - 0.5, Math.PI, { variant: 0 });
  placeProp(d, 'lampstand', -0.7, 0, D - 0.7, 0);
  placeProp(d, 'lampstand', 0.7, 0, D - 0.7, 0);
  lamps.push({ position: { x: -0.7, y: 1.5, z: D - 0.7 }, intensity: 3.5, distance: 6, flicker: 0.3 });
  lamps.push({ position: { x: 0, y: 2.4, z: 7.0 }, intensity: 4.5, distance: 8 });
  lamps.push({ position: { x: 0, y: 2.4, z: 9.8 }, intensity: 3.5, distance: 7, flicker: 0.15 });

  const object = b.build(`interior:${PEREGRINA_BARRACKS}`);
  return { object, colliders: [...b.colliders], spots: placeSpots({ places: PLACES }), lamps };
}

export const peregrinaCell: NamedCell = {
  id: PEREGRINA_BARRACKS,
  name: 'The couriers’ barracks',
  latin: 'Contubernia',
  at: PEREGRINA_BARRACKS,
  slot: 8,
  anchor: (game) => locationOf(game, PEREGRINA_SPOT) ?? null,
  bounds: { min: { x: -HX - 0.4, y: -0.7, z: -0.3 }, max: { x: HX + 0.4, y: H + 0.8, z: D + 0.4 } },
  entry: { position: ENTRY, heading: 0 },
  route: [ENTRY, { x: 0.9, y: 0, z: 3.6 }, { x: 0, y: 0, z: 6.0 }, { x: 0, y: 0, z: BUNK_Z[2] }, { x: 0, y: 0, z: 10.2 }],
  places: PLACES,
  build,
  exit: {
    at: { x: 0, y: 1.2, z: 0.7 },
    label: 'The barracks door',
    verb: 'Go out',
    to: (game) => streetExit(game, PEREGRINA_FRONT, PEREGRINA_SPOT),
  },
};

export const peregrinaFront: FrontSpec = {
  id: PEREGRINA_FRONT,
  spot: PEREGRINA_SPOT,
  label: 'The couriers’ barracks',
  width: 1.2,
  height: 2.2,
  style: 'plank',
  // Unlocked from dawn to the end of the evening, the couriers coming and going; locked after.
  lock: { tier: 'mediocris', openHours: [5, 22] },
  owner: { id: 'castra-peregrina', name: 'the couriers' },
  margin: 0.65,
  cell: PEREGRINA_BARRACKS,
  entry: { position: ENTRY, heading: 0 },
  reach: 6,
};
