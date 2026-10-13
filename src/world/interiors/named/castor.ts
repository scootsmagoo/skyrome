/**
 * `castor-loculi`: the deposit vaults in the podium of the Temple of Castor and Pollux (CONTENT.md
 * §1.1 and §1.4, GDD §17.1). A grated door on the podium's west flank, toward the Vicus Tuscus
 * (the Forum builder's `castor-strongroom` door, forum-temples.ts), opens on a barrel-vaulted
 * passage lined with iron cages of the bankers' deposits (strongboxes, document cases, sealed
 * sacks) and, at the end, the keeper's room: Chrysippus' desk with his scales and tablets, the
 * shelf of receipts. Three deposit chests stand in the bays on the right; their key (`clavis-loculi`)
 * is Chrysippus' and nobody gives it away, so they are for the lockpick.
 *
 * Chrysippus and Gratus keep to the street at the door (the strongroom's spot), as the quests
 * have them: nothing in the story needs the inside, and `castor-loculi` as a place (mq-02's dusk
 * hint) is still the stretch of paving at the door. The cell is for the player.
 *
 * Local frame: the door's threshold at the origin (the street side is −z, the passage runs +z), floor
 * y = 0, world axes. 1:1 metres.
 */
import * as THREE from 'three';
import { Draw } from '../../../arch/fabric/draw';
import { placeProp } from '../../../arch/props';
import type { Game } from '../../../core/Game';
import type { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { Spot } from '../../landmarks/types';
import type { KitBuilt, KitLamp } from '../generic';
import type { Vec3 } from '../types';
import { room, wallRun } from '../kits/parts';
import { barrelGeometry, drawChests, type NamedCell } from './common';

export const CASTOR_LOCULI = 'castor-loculi';
/** The Forum builder's door spot (forum-temples.ts): 1.2 m in front of the grated door, facing it. */
const DOOR_SPOT = 'castor-strongroom';
const LANDMARK = 'temple-castor-pollux';

const PW = 1.8; // the passage's half width
const PASS_END = 11.2; // z where the passage meets the keeper's room
const SPRING = 2.3; // the vault's springing
const OFFICE_HALF = 3.2;
const OFFICE_END = 16.6;
const OFFICE_H = 3.3;

/** The spot in the world: position (street level in front of the door) and the heading that faces the door. */
function doorSpot(game: Game): { position: THREE.Vector3; heading: number } | null {
  const lm = game.landmarks?.get(LANDMARK);
  const s = lm?.spots.find((x) => x.id === DOOR_SPOT);
  return s ? { position: s.position.clone(), heading: s.heading ?? 0 } : null;
}

function build(ctx: { game: Game; builder(): MeshBuilder }): KitBuilt {
  const b = ctx.builder();
  const d = new Draw(b);
  const spots: Spot[] = [];
  const lamps: KitLamp[] = [];
  const W = 'concrete' as const;
  const D = 'brick' as const;

  // ---- the passage: floor, two walls, a barrel vault over them
  d.span('paving_travertine', -PW, -0.2, 0, PW, 0, PASS_END);
  d.solid(-PW, -0.6, 0, PW, 0, PASS_END);
  for (const s of [-1, 1]) wallRun(d, s * PW, 0, s * PW, PASS_END, 0, SPRING + PW, W, D);
  d.geo(barrelGeometry(PW, PASS_END, 20), 'concrete', 0, SPRING, PASS_END / 2, { shadow: false });
  d.solid(-PW, SPRING + PW, 0, PW, SPRING + PW + 0.4, PASS_END);
  // Brick ribs across the vault every 3 m.
  for (let z = 2; z < PASS_END - 0.5; z += 3.2) d.geo(barrelGeometry(PW - 0.02, 0.35, 20), 'brick', 0, SPRING, z, { shadow: false });

  // ---- the door wall: the doorway and the grated door standing open against the right jamb
  wallRun(d, -PW, 0, PW, 0, 0, SPRING + PW, W, D, [-0.65, 0.65], 2.35);
  d.span('travertine', -0.78, 0, -0.14, -0.65, 2.45, 0.12);
  d.span('travertine', 0.65, 0, -0.14, 0.78, 2.45, 0.12);
  d.span('travertine', -0.78, 2.35, -0.14, 0.78, 2.5, 0.12);
  for (let i = 0; i <= 5; i++) d.span('iron', 0.7, 0, 0.14 + i * 0.2 - 0.015, 0.74, 2.3, 0.14 + i * 0.2 + 0.015);
  for (const y of [0.4, 1.2, 2.2]) d.span('iron', 0.7, y - 0.025, 0.14, 0.74, y + 0.025, 1.14);
  // Beyond the doorway the street, white in the daylight; the doorway itself is sealed to walkers.
  d.span('plaster_white', -0.66, 0.02, -0.55, 0.66, 2.34, -0.5, { shadow: false });
  d.solid(-0.7, 0, -0.5, 0.7, 2.5, 0.08);
  lamps.push({ position: { x: 0, y: 1.7, z: 0.5 }, color: 0xdfe8ff, intensity: 7, distance: 6 });

  // ---- the loculi: iron cages of deposits against the left wall (four bays) and the first two on the right
  const cage = (side: number, z0: number, z1: number) => {
    const x0 = side * PW, x1 = side * (PW - 0.55);
    const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
    d.span('black', Math.min(x0, x0 - side * 0.02), 0.2, z0, Math.max(x0, x0 - side * 0.02), 2.25, z1, { shadow: false });
    // the frame: posts at each end, rails at the shelves, a floor plinth
    for (const z of [z0, z1 - 0.06]) d.span('iron', lo, 0, z, hi, 2.3, z + 0.06);
    for (const y of [0.05, 0.85, 1.55, 2.25]) d.span('iron', lo, y, z0, hi, y + 0.05, z1);
    // the bars across the front
    const front = x1 - side * 0.02;
    for (let z = z0 + 0.12; z < z1 - 0.06; z += 0.13) d.span('iron', front - 0.012, 0.1, z - 0.012, front + 0.012, 2.25, z + 0.012);
    // what is behind them: strongboxes, document cases, sealed sacks
    const mid = (x0 + x1) / 2 + side * 0.04;
    for (const [y, kind] of [[0.1, 0], [0.9, 1], [1.6, 2]] as const) {
      const n = kind === 1 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const z = z0 + 0.3 + (i * (z1 - z0 - 0.4)) / n;
        if (kind === 0) {
          d.span('wood_dark', mid - 0.18, y, z, mid + 0.18, y + 0.5, z + 0.5);
          d.span('iron', mid - 0.19, y + 0.2, z, mid + 0.19, y + 0.26, z + 0.5);
        } else if (kind === 1) {
          d.cyl('wood', mid, y + 0.17, z + 0.18, 0.12, 0.34, 8);
          d.cyl('terracotta', mid, y + 0.37, z + 0.18, 0.13, 0.04, 8);
        } else {
          d.ellipsoid('fabric_ochre', mid, y + 0.2, z + 0.25, 0.22, 0.2, 0.28);
          d.cyl('lead', mid, y + 0.08, z + 0.25, 0.04, 0.02, 6);
        }
      }
    }
    d.solid(lo, 0, z0, hi, 2.3, z1);
  };
  const bays: [number, number][] = [[1.4, 3.2], [3.4, 5.2], [5.4, 7.2], [7.4, 9.2]];
  for (const [z0, z1] of bays) cage(-1, z0, z1);
  cage(1, bays[0][0], bays[0][1]);
  cage(1, bays[1][0], bays[1][1]);
  // Bay numbers over the cages (bronze plates) and piers between them.
  for (const [i, [z0]] of bays.entries()) {
    d.span('bronze', -PW + 0.02, 2.4, z0 + 0.6, -PW + 0.05, 2.62, z0 + 1.2, { shadow: false });
    if (i < 2) d.span('bronze', PW - 0.05, 2.4, z0 + 0.6, PW - 0.02, 2.62, z0 + 1.2, { shadow: false });
  }
  // The right wall's open bays hold the deposit chests (their places are in containers.ts); a plinth of stone under each.
  drawChests(d, CASTOR_LOCULI, { 'ctn-loculi-1': Math.PI / 2, 'ctn-loculi-2': Math.PI / 2, 'ctn-loculi-3': Math.PI / 2 });
  for (const z of [6.3, 8.1, 9.9]) {
    d.span('travertine', PW - 0.55, 0, z - 0.55, PW - 0.02, 0.06, z + 0.55);
    d.span('black', PW - 0.03, 0.06, z - 0.5, PW - 0.02, 1.6, z + 0.5, { shadow: false });
  }
  // A strip of lamps down the passage: a bracket lamp over every second bay.
  for (const z of [2.6, 6.2, 9.8]) lamps.push({ position: { x: 0.2, y: 2.9, z }, intensity: 5, distance: 7, flicker: 0.2 });

  // ---- the keeper's room: a desk with scales and tablets, shelves of receipts, a brazier
  const x0 = -OFFICE_HALF, x1 = OFFICE_HALF;
  room(d, x0, x1, PASS_END, OFFICE_END, 0, OFFICE_H, 'plaster_cream', 'plaster_red', 'wood');
  wallRun(d, x0, PASS_END, x1, PASS_END, 0, OFFICE_H, 'plaster_cream', 'plaster_red', [-1.0, 1.0], 2.5);
  wallRun(d, x0, OFFICE_END, x1, OFFICE_END, 0, OFFICE_H, 'plaster_cream', 'plaster_red');
  wallRun(d, x0, PASS_END, x0, OFFICE_END, 0, OFFICE_H, 'plaster_cream', 'plaster_red');
  wallRun(d, x1, PASS_END, x1, OFFICE_END, 0, OFFICE_H, 'plaster_cream', 'plaster_red');
  // The wall between the passage's end and the room is the vault's end wall: keep it up to the crown.
  d.span('concrete', -PW, OFFICE_H, PASS_END - 0.1, PW, SPRING + PW, PASS_END + 0.1);
  placeProp(d, 'table', 0, 0, OFFICE_END - 2.2, 0, { scale: 1.2 });
  placeProp(d, 'stool', 0.1, 0, OFFICE_END - 3.2, 0);
  placeProp(d, 'shelf', -OFFICE_HALF + 0.35, 0, OFFICE_END - 2.4, Math.PI / 2);
  placeProp(d, 'shelf', OFFICE_HALF - 0.35, 0, OFFICE_END - 2.4, -Math.PI / 2);
  placeProp(d, 'shelf', -OFFICE_HALF + 0.35, 0, OFFICE_END - 4.4, Math.PI / 2);
  placeProp(d, 'brazier', OFFICE_HALF - 0.9, 0, PASS_END + 1.1, 0);
  // On the desk: a balance (a bronze beam on a post, two pans), a stack of wax tablets, a lamp.
  const dy = 0.85;
  const dz = OFFICE_END - 2.2;
  d.cyl('bronze', -0.5, dy + 0.18, dz, 0.012, 0.36, 5);
  d.span('bronze', -0.72, dy + 0.34, dz - 0.012, -0.28, dy + 0.356, dz + 0.012);
  for (const x of [-0.72, -0.28]) d.cyl('bronze', x, dy + 0.2, dz, 0.07, 0.012, 8);
  for (let i = 0; i < 4; i++) d.span('wood', 0.2, dy + i * 0.03, dz - 0.12, 0.5, dy + i * 0.03 + 0.026, dz + 0.12);
  placeProp(d, 'oil_lamp', 0.75, dy, dz + 0.1, 0);
  lamps.push({ position: { x: 0, y: 1.9, z: dz - 0.6 }, intensity: 6, distance: 8 });
  lamps.push({ position: { x: OFFICE_HALF - 0.9, y: 1.2, z: PASS_END + 1.1 }, intensity: 4, distance: 6, flicker: 0.4 });

  spots.push(
    { id: 'entry', kind: 'spawn', position: new THREE.Vector3(0, 0, 1.2), heading: 0 },
    { id: 'passage', kind: 'spot', position: new THREE.Vector3(0, 0, 6), heading: 0 },
    { id: 'office', kind: 'npc', position: new THREE.Vector3(0, 0, OFFICE_END - 3.4), heading: Math.PI },
    { id: 'desk', kind: 'spot', position: new THREE.Vector3(0, 0, OFFICE_END - 3.4), heading: 0 },
  );
  const object = b.build(`interior:${CASTOR_LOCULI}`);
  return { object, colliders: [...b.colliders], spots, lamps };
}

const ENTRY: Vec3 = { x: 0, y: 0.05, z: 1.2 };

export const castorLoculi: NamedCell = {
  id: CASTOR_LOCULI,
  name: 'The Strongrooms of Castor',
  latin: 'Loculi aedis Castoris',
  at: CASTOR_LOCULI,
  slot: 0,
  anchor: (game) => doorSpot(game)?.position ?? null,
  bounds: { min: { x: -PW - 0.4, y: -0.7, z: -0.3 }, max: { x: OFFICE_HALF + 0.4, y: SPRING + PW + 0.6, z: OFFICE_END + 0.4 } },
  entry: { position: ENTRY, heading: 0 },
  route: [ENTRY, { x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: PASS_END - 0.5 }, { x: 0, y: 0, z: OFFICE_END - 4.2 }],
  build,
  exit: {
    at: { x: 0, y: 1.2, z: 0.7 },
    label: 'The grated door',
    verb: 'Go out',
    // Out of the door onto the paving of the Vicus Tuscus, facing away from it.
    to: (game) => {
      const s = doorSpot(game);
      return s ? { position: s.position, heading: s.heading + Math.PI } : null;
    },
  },
  outside: [
    {
      id: `${CASTOR_LOCULI}:in`,
      label: 'The deposit vaults',
      verb: 'Go in',
      // A step before the door itself (the spot is 1.2 m from it).
      at: (game) => {
        const s = doorSpot(game);
        return s ? { x: s.position.x + Math.sin(s.heading) * 0.9, y: s.position.y + 1.0, z: s.position.z + Math.cos(s.heading) * 0.9 } : null;
      },
      from: null,
      reach: 1.8,
      to: { interior: CASTOR_LOCULI, position: ENTRY, heading: 0 },
    },
  ],
};
