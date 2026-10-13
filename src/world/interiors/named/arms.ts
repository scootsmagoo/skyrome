/**
 * `taberna-armorum`: Tiberius Claudius Euhodus' arms shop on the Sacra Via by the Meta Sudans
 * (CONTENT.md §1.1, STORY.md Act II: "arms for sale, and repaired"). A studded door off the street
 * (hung by front.ts at the spot) opens on the shop: a counter with the scales and the ledger's place,
 * swords and daggers on boards, spears in racks, shields hung on the back wall, a cuirass and a helmet
 * on their stands; right of the counter the way behind it, where the master's strongbox stands
 * (`ctn-arca-armorum`, locked). A doorway in the back wall leads to the forge: the fire, the anvil,
 * the quenching vat, the boy Felix's cot.
 *
 * Euhodus and Felix keep the street side of the counter, in the street (the people of the world are at
 * street level), and he sells there as always (src/dialogue/content/vendors.ts). The shop's door is
 * open in daylight hours and shut on a mediocre lock at night.
 *
 * Local frame: the door's threshold at the origin, the shop runs +z, floor y = 0, world axes.
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

export const ARMS = 'taberna-armorum';
export const ARMS_FRONT = 'front:taberna-armorum';

const HX = 3.8;
const SHOP_D = 6.2;
const H = 3.6;
const FORGE_X1 = 0.2;
const FORGE_D = 9.6;
const COUNTER_Z0 = 2.4;
const COUNTER_Z1 = 3.1;
const COUNTER_X1 = 1.3;

/** A gladius or a dagger hanging point-down on a board: a blade, a guard and a grip, in the frame of `f` (face −z). */
function sword(f: Draw, x: number, y: number, len: number) {
  f.span('iron', x - 0.025, y - len, -0.012, x + 0.025, y, 0.0);
  f.span('iron', x - 0.012, y - len - 0.03, -0.014, x + 0.012, y - len, -0.0);
  f.span('bronze', x - 0.08, y, -0.025, x + 0.08, y + 0.025, 0.0);
  f.span('wood_dark', x - 0.018, y + 0.025, -0.02, x + 0.018, y + 0.17, -0.002);
  f.ellipsoid('bronze', x, y + 0.19, -0.012, 0.03, 0.025, 0.03, { seg: [6, 4] });
}

/** A scutum on the wall: a red board with a bronze boss and a bronze rim, face −z. */
function scutum(f: Draw, x: number, y: number) {
  f.span('fabric_red', x - 0.38, y - 0.55, -0.06, x + 0.38, y + 0.55, 0);
  f.span('bronze', x - 0.4, y - 0.57, -0.07, x + 0.4, y - 0.53, -0.0);
  f.span('bronze', x - 0.4, y + 0.53, -0.07, x + 0.4, y + 0.57, -0.0);
  f.ellipsoid('bronze', x, y, -0.07, 0.11, 0.11, 0.05, { seg: [8, 5] });
  f.span('bronze', x - 0.012, y - 0.52, -0.075, x + 0.012, y + 0.52, -0.0);
}

/** A round parma: a bronze-rimmed disc. */
function parma(f: Draw, x: number, y: number) {
  f.cyl('wood', x, y, -0.04, 0.34, 0.06, 16, { rx: Math.PI / 2 });
  f.cyl('bronze', x, y, -0.075, 0.35, 0.03, 16, { rx: Math.PI / 2 });
  f.ellipsoid('bronze', x, y, -0.09, 0.08, 0.08, 0.04, { seg: [8, 5] });
}

/** A cuirass on a stand and a helmet over it: a post, a crossbar, bands of iron round a torso. */
function armourStand(d: Draw, x: number, z: number, yaw = 0) {
  const f = d.at(x, 0, z, yaw);
  f.cyl('wood_dark', 0, 0.6, 0, 0.04, 1.2, 6, { collide: true });
  f.span('wood_dark', -0.35, 0.0, -0.18, 0.35, 0.05, 0.18);
  f.span('wood_dark', -0.3, 1.45, -0.02, 0.3, 1.5, 0.02);
  f.cyl('iron', 0, 1.2, 0, 0.19, 0.5, 10, { rTop: 0.17 });
  for (const y of [1.05, 1.18, 1.31]) f.cyl('bronze', 0, y, 0, 0.2, 0.025, 10);
  f.span('iron', -0.3, 1.38, -0.09, -0.12, 1.46, 0.09);
  f.span('iron', 0.12, 1.38, -0.09, 0.3, 1.46, 0.09);
  f.ellipsoid('bronze', 0, 1.62, 0, 0.12, 0.13, 0.14, { seg: [10, 6] });
  f.span('bronze', -0.14, 1.52, -0.15, 0.14, 1.55, -0.1);
}

/** A rack of spears on the wall: a rail low and a rail high, shafts between them leaning on the wall. */
function spearRack(d: Draw, x: number, z: number, yaw: number, n = 7) {
  const f = d.at(x, 0, z, yaw);
  f.span('wood_dark', -0.6, 0.2, -0.12, 0.6, 0.26, 0.04);
  f.span('wood_dark', -0.6, 1.5, -0.04, 0.6, 1.56, 0.04);
  for (let i = 0; i < n; i++) {
    const sx = -0.52 + (i * 1.04) / (n - 1);
    f.rod('wood', { x: sx, y: 0.05, z: -0.1 }, { x: sx, y: 2.3, z: 0.02 }, 0.017, 5);
    f.rod('iron', { x: sx, y: 2.3, z: 0.02 }, { x: sx, y: 2.55, z: 0.03 }, 0.014, 4, { rTop: 0.002 });
  }
}

function build(ctx: { game: Game; builder(): MeshBuilder }): KitBuilt {
  const b = ctx.builder();
  const d = new Draw(b);
  const spots: Spot[] = [];
  const lamps: KitLamp[] = [];
  const wall = 'plaster_white' as const;
  const dado = 'plaster_ochre' as const;

  // ---- the shop: floor, ceiling, walls (the street door's gap in the front one, the forge's in the back one)
  room(d, -HX, HX, 0, SHOP_D, 0, H, wall, dado, 'concrete');
  wallRun(d, -HX, 0, HX, 0, 0, H, wall, dado, [-0.75, 0.75], 2.3);
  wallRun(d, -HX, 0, -HX, FORGE_D, 0, H, wall, dado);
  wallRun(d, HX, 0, HX, SHOP_D, 0, H, wall, dado);
  wallRun(d, -HX, SHOP_D, HX, SHOP_D, 0, H, wall, dado, [-2.9, -1.1], 2.3);
  // The street door seen from inside, studded: shut, barred.
  d.span('wood_dark', -0.75, 0, -0.05, 0.75, 2.3, 0.05);
  for (const y of [0.5, 1.2, 1.9]) d.span('iron', -0.75, y, 0.05, 0.75, y + 0.06, 0.08);
  d.span('wood', -0.7, 1.1, 0.07, 0.7, 1.22, 0.12);
  d.solid(-0.8, 0, -0.3, 0.8, 2.4, 0.08);

  // ---- the counter, with the scales and a pair of daggers on a cloth; a flap on its right end
  d.span('wood_dark', -HX, 0, COUNTER_Z0, COUNTER_X1, 0.95, COUNTER_Z1);
  d.span('wood', -HX, 0.95, COUNTER_Z0 - 0.04, COUNTER_X1 + 0.04, 1.0, COUNTER_Z1 + 0.04);
  d.solid(-HX, 0, COUNTER_Z0, COUNTER_X1, 1.0, COUNTER_Z1);
  const sy = 1.0, sz = (COUNTER_Z0 + COUNTER_Z1) / 2;
  d.cyl('bronze', -2.4, sy + 0.2, sz, 0.012, 0.4, 5);
  d.span('bronze', -2.65, sy + 0.38, sz - 0.012, -2.15, sy + 0.396, sz + 0.012);
  for (const x of [-2.65, -2.15]) d.cyl('bronze', x, sy + 0.22, sz, 0.08, 0.012, 8);
  d.span('fabric_red', -1.4, sy, sz - 0.2, -0.5, sy + 0.015, sz + 0.2, { shadow: false });
  for (const [x, z] of [[-1.2, sz - 0.08], [-0.85, sz + 0.07]] as const) {
    d.span('iron', x - 0.01, sy + 0.015, z - 0.12, x + 0.01, sy + 0.025, z + 0.12);
    d.span('wood_dark', x - 0.015, sy + 0.015, z + 0.12, x + 0.015, sy + 0.045, z + 0.2);
  }
  placeProp(d, 'oil_lamp', 0.4, sy, sz, 0);

  // ---- swords and daggers on the left wall's board, shields and spears on the back wall, stands at the front corners
  const lw = d.at(-HX + 0.1, 0, 3.4, -Math.PI / 2);
  lw.span('wood_dark', -1.5, 1.1, 0.0, 1.5, 2.15, 0.04);
  lw.span('wood_dark', -1.55, 1.05, -0.03, 1.55, 1.1, 0.04);
  for (let i = 0; i < 8; i++) sword(lw, -1.3 + i * 0.37, 2.05, i % 3 === 0 ? 0.3 : 0.55);
  for (let i = 0; i < 7; i++) sword(lw, -1.1 + i * 0.37, 1.55, i % 2 === 0 ? 0.28 : 0.5);
  // The right wall: shields in two rows.
  const rw = d.at(HX - 0.1, 0, 4.2, Math.PI / 2);
  for (let i = 0; i < 3; i++) scutum(rw, -1.1 + i * 0.95, 1.9);
  for (let i = 0; i < 3; i++) parma(rw, -0.95 + i * 0.95, 1.0);
  spearRack(d, -0.5, SHOP_D - 0.15, Math.PI, 7);
  spearRack(d, 1.2, SHOP_D - 0.15, Math.PI, 6);
  spearRack(d, 2.6, SHOP_D - 0.15, Math.PI, 5);
  armourStand(d, -3.0, 1.2, 0.5);
  armourStand(d, 2.8, 1.2, -0.5);
  placeProp(d, 'crate', -3.2, 0, 4.5, 0.3);
  placeProp(d, 'crate', -3.0, 0, 5.4, 0.1);
  lamps.push({ position: { x: -0.4, y: 2.6, z: 1.4 }, intensity: 6, distance: 8 });
  lamps.push({ position: { x: 1.8, y: 2.6, z: 4.6 }, intensity: 5, distance: 8 });
  lamps.push({ position: { x: -2.6, y: 2.4, z: 4.4 }, intensity: 4, distance: 6 });

  // ---- the strongbox behind the counter (its place is in containers.ts)
  drawChests(d, ARMS, { 'ctn-arca-armorum': Math.PI / 2 });

  // ---- the forge: the fire with its bellows, the anvil, the vat, a chopping block, a boy's cot
  room(d, -HX, FORGE_X1, SHOP_D, FORGE_D, 0, 3.4, 'plaster_cream', 'plaster_dark', 'dirt');
  wallRun(d, FORGE_X1, SHOP_D, FORGE_X1, FORGE_D, 0, 3.4, 'plaster_cream', 'plaster_dark');
  wallRun(d, -HX, FORGE_D, FORGE_X1, FORGE_D, 0, 3.4, 'plaster_cream', 'plaster_dark');
  placeProp(d, 'forge', -HX + 1.0, 0, FORGE_D - 0.9, Math.PI);
  placeProp(d, 'anvil', -0.8, 0, SHOP_D + 1.0, 0.3);
  placeProp(d, 'vat', -0.55, 0, SHOP_D + 2.2, 0, { scale: 0.7 });
  placeProp(d, 'chopping_block', -0.9, 0, FORGE_D - 0.6, 0);
  d.span('wood', -HX + 0.15, 0, SHOP_D + 0.5, -HX + 0.95, 0.35, SHOP_D + 2.2);
  d.span('fabric_ochre', -HX + 0.2, 0.35, SHOP_D + 0.55, -HX + 0.9, 0.4, SHOP_D + 2.15, { shadow: false });
  d.solid(-HX + 0.15, 0, SHOP_D + 0.5, -HX + 0.95, 0.4, SHOP_D + 2.2);
  lamps.push({ position: { x: -1.2, y: 1.9, z: FORGE_D - 1.7 }, intensity: 3, distance: 6, flicker: 0.4, color: 0xff8a40 });

  spots.push(
    { id: 'entry', kind: 'spawn', position: new THREE.Vector3(0, 0, 1.3), heading: 0 },
    { id: 'counter', kind: 'npc', position: new THREE.Vector3(-1.2, 0, 3.8), heading: Math.PI },
    { id: 'forge', kind: 'spot', position: new THREE.Vector3(-2.0, 0, SHOP_D + 1.4), heading: Math.PI },
  );
  const object = b.build(`interior:${ARMS}`);
  return { object, colliders: [...b.colliders], spots, lamps };
}

const ENTRY: Vec3 = { x: 0, y: 0.05, z: 1.3 };

export const armsCell: NamedCell = {
  id: ARMS,
  name: 'Euhodus’ Arms Shop',
  latin: 'Arma venalia',
  at: ARMS,
  slot: 3,
  anchor: (game) => locationOf(game, ARMS) ?? null,
  bounds: { min: { x: -HX - 0.4, y: -0.7, z: -0.3 }, max: { x: HX + 0.4, y: H + 0.8, z: FORGE_D + 0.4 } },
  entry: { position: ENTRY, heading: 0 },
  route: [ENTRY, { x: 1.9, y: 0, z: 2.2 }, { x: 2.1, y: 0, z: 3.9 }, { x: 0.8, y: 0, z: 5.5 }, { x: -2.0, y: 0, z: SHOP_D - 0.5 }, { x: -2.0, y: 0, z: SHOP_D + 1.4 }],
  build,
  exit: {
    at: { x: 0, y: 1.2, z: 0.7 },
    label: 'The street door',
    verb: 'Go out',
    to: (game) => streetExit(game, ARMS_FRONT, ARMS),
  },
};

export const armsFront: FrontSpec = {
  id: ARMS_FRONT,
  spot: ARMS,
  label: 'The arms shop',
  width: 1.5,
  height: 2.3,
  style: 'studded',
  // Open in the working day; shut and locked after it (Euhodus sleeps over the shop, so it is not for the faint-hearted).
  lock: { tier: 'mediocris', openHours: [6, 19] },
  owner: { id: 'npc-euhodus', name: 'Euhodus' },
  cell: ARMS,
  entry: { position: ENTRY, heading: 0 },
  sign: -1,
};
