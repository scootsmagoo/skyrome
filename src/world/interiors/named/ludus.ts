/**
 * `ludus-cellae`: the barracks of the Ludus Magnus (CONTENT.md §1.1 and §1.4, GDD §17.1). The cell
 * doors on the court's back portico are the Forum-side builder's decoration (colos-court.ts: shut
 * timber doors in the plaster, a dark board behind each); the one by the `ludus-cellae` spot, where
 * Glaucus and the gladiators sit between bouts, is the way in. Behind it a passage runs between six
 * cells, three a side, each with a bunk, a stool and the gladiator's locker (`ctn-cella-ludi-1..6`),
 * the tally of his days scratched on the plaster, and at the end a barred window on the practice
 * yard. The doctors and the men stay in the court (the people of the world stay at street level);
 * the cells are for the player's curiosity and fingers.
 *
 * Local frame: the door's threshold at the origin, the passage runs +z, floor y = 0, world axes.
 */
import * as THREE from 'three';
import { Rng } from '../../../core/Rng';
import { Draw } from '../../../arch/fabric/draw';
import { placeProp } from '../../../arch/props';
import type { Game } from '../../../core/Game';
import type { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { Spot } from '../../landmarks/types';
import type { KitBuilt, KitLamp } from '../generic';
import type { Vec3 } from '../types';
import { room, wallRun } from '../kits/parts';
import { drawChests, type NamedCell } from './common';

export const LUDUS_CELLAE = 'ludus-cellae';
const LANDMARK = 'ludus-magnus';

const HALF = 1.0; // the passage's half width
const END = 13.2; // z of the end wall
const CELL_X = 4.4; // far wall of a cell
const CEIL = 3.0;
const CELL_H = 2.8;
/** The cells' z extents (three a side). */
const CELLS: [number, number][] = [[1.0, 4.6], [4.8, 8.4], [8.6, 12.2]];

/**
 * The cell door the barracks open by: on the ground storey of the court's back wall, 6.61 m along it
 * (toward −x of the landmark) from the `ludus-cellae` spot, which stands before the mess hall's wider
 * opening. The court builder (colos-court.ts) puts a cell door every 42.6/13 m along that wall except
 * where a room opens; this is the first one beyond the mess hall's side (tests/named-interiors.test.ts
 * works it out from the builder's numbers).
 */
export const CELL_DOOR_ALONG = -6.608;
/** How far before the wall's face the spot stands (the wall at z = inner.d/2, the spot 1.2 m short of it). */
const SPOT_TO_WALL = 1.2;

interface Barracks {
  /** The standing place before the cell door, street-level: the way in and out. */
  stand: THREE.Vector3;
  /** The way the player faces going in (toward the wall). */
  heading: number;
}

/** The cell door's standing place in the world and the heading that faces it (null until the landmark is placed). */
function barracks(game: Game): Barracks | null {
  const s = game.landmarks?.get(LANDMARK)?.spots.find((x) => x.id === LUDUS_CELLAE);
  if (!s) return null;
  const h = s.heading ?? 0;
  // The wall's own direction (landmark-local +x) is (cos h, −sin h) once the spot's heading is the landmark's rotation.
  const stand = new THREE.Vector3(s.position.x + Math.cos(h) * CELL_DOOR_ALONG, s.position.y, s.position.z - Math.sin(h) * CELL_DOOR_ALONG);
  return { stand, heading: h };
}

/** Five-bar tally groups scratched on the plaster, `n` of them, in the frame `f` (face −z). */
function tally(f: Draw, rng: Rng, x: number, y: number, n: number) {
  for (let g = 0; g < n; g++) {
    const gx = x + (g % 4) * 0.22;
    const gy = y - Math.floor(g / 4) * 0.16;
    for (let i = 0; i < 4; i++) f.span('plaster_dark', gx + i * 0.03, gy, -0.012, gx + i * 0.03 + 0.008, gy + 0.11 + rng.range(-0.01, 0.01), 0);
    f.span('plaster_dark', gx - 0.015, gy + 0.04, -0.012, gx + 0.11, gy + 0.05, 0);
  }
}

function build(ctx: { game: Game; builder(): MeshBuilder }): KitBuilt {
  const b = ctx.builder();
  const d = new Draw(b);
  const rng = new Rng(LUDUS_CELLAE);
  const spots: Spot[] = [];
  const lamps: KitLamp[] = [];
  const wall = 'plaster_cream' as const;
  const dado = 'plaster_dark' as const;

  // ---- the passage
  room(d, -HALF, HALF, 0.6, END, 0, CEIL, wall, dado, 'concrete');
  d.span('concrete', -HALF, -0.2, 0, HALF, 0, 0.6);
  // The door wall at the threshold, the shut door seen from inside.
  wallRun(d, -HALF - 0.2, 0, HALF + 0.2, 0, 0, CEIL, wall, dado, [-0.55, 0.55], 2.1);
  d.span('wood_dark', -0.55, 0, -0.05, 0.55, 2.1, 0.05);
  d.span('iron', -0.55, 0.5, 0.04, 0.55, 0.56, 0.07);
  d.span('iron', -0.55, 1.5, 0.04, 0.55, 1.56, 0.07);
  d.solid(-0.6, 0, -0.3, 0.6, 2.2, 0.08);
  // The end wall with its barred window on the yard: a pale plane behind iron bars.
  wallRun(d, -HALF - 0.2, END, HALF + 0.2, END, 0, CEIL, wall, dado);
  d.span('plaster_white', -0.35, 1.7, END - 0.115, 0.35, 2.5, END - 0.105, { shadow: false });
  for (let i = 0; i < 6; i++) d.span('iron', -0.3 + i * 0.12 - 0.012, 1.65, END - 0.14, -0.3 + i * 0.12 + 0.012, 2.55, END - 0.12);
  for (const y of [1.65, 2.1, 2.52]) d.span('iron', -0.38, y, END - 0.14, 0.38, y + 0.04, END - 0.12);
  lamps.push({ position: { x: 0, y: 2.0, z: END - 0.6 }, color: 0xdfe8ff, intensity: 5, distance: 6 });
  for (const z of [2.6, 6.6, 10.6]) lamps.push({ position: { x: 0, y: 2.4, z }, intensity: 5, distance: 7, flicker: 0.25 });

  // The passage's walls where no cell opens off them: the end by the door and the end by the window.
  for (const s of [-1, 1]) {
    wallRun(d, s * HALF, 0, s * HALF, CELLS[0][0] - 0.1, 0, CEIL, wall, dado);
    wallRun(d, s * HALF, CELLS[2][1] + 0.1, s * HALF, END, 0, CEIL, wall, dado);
  }

  // ---- the cells, three a side
  CELLS.forEach(([zA, zB], k) => {
    const zc = (zA + zB) / 2;
    for (const s of [-1, 1]) {
      const near = s * (HALF + 0.1), far = s * CELL_X;
      // The passage wall with the cell's doorway (a lintel over it), the cell's floor and ceiling.
      wallRun(d, s * HALF, zA - 0.1, s * HALF, zB + 0.1, 0, CEIL, wall, dado, [zc - 0.5, zc + 0.5], 2.05);
      room(d, Math.min(near, far), Math.max(near, far), zA, zB, 0, CELL_H, wall, dado, 'dirt');
      wallRun(d, far, zA - 0.1, far, zB + 0.1, 0, CELL_H + 0.2, wall, dado);
      wallRun(d, s * HALF, zA - 0.1, far, zA - 0.1, 0, CELL_H + 0.2, wall, dado);
      wallRun(d, s * HALF, zB + 0.1, far, zB + 0.1, 0, CELL_H + 0.2, wall, dado);
      // A timber door standing ajar against the wall in the doorway, hinged on the far jamb.
      d.span('wood_dark', s * (HALF - 0.02) - 0.03 * s, 0, zc + 0.5, s * (HALF + 0.9), 2.0, zc + 0.56);
      // The bunk along the far wall: a plank frame, a straw tick and a blanket.
      const bx0 = s * (CELL_X - 0.85), bx1 = s * (CELL_X - 0.05);
      const bz0 = zA + 0.15, bz1 = zA + 2.05;
      d.span('wood', Math.min(bx0, bx1), 0.0, bz0, Math.max(bx0, bx1), 0.4, bz1);
      d.span('dry_grass', Math.min(bx0, bx1) + 0.04, 0.4, bz0 + 0.04, Math.max(bx0, bx1) - 0.04, 0.5, bz1 - 0.04, { shadow: false });
      d.span(rng.pick(['fabric_ochre', 'fabric_red', 'fabric_blue']), Math.min(bx0, bx1) + 0.05, 0.5, bz0 + 0.7, Math.max(bx0, bx1) - 0.05, 0.54, bz1 - 0.05, { shadow: false });
      d.solid(Math.min(bx0, bx1), 0, bz0, Math.max(bx0, bx1), 0.54, bz1);
      placeProp(d, 'stool', s * (HALF + 1.0), 0, zc - 0.6, rng.range(0, 3));
      // A peg with a belt and a cloak, a water jug.
      d.span('iron', far - s * 0.12, 1.6, zA + 1.4, far, 1.65, zA + 1.5, { shadow: false });
      d.span('fabric_ochre', far - s * 0.07, 0.9, zA + 1.35, far - s * 0.02, 1.62, zA + 1.55, { shadow: false });
      // Tally of days on the partition wall (face into the cell).
      tally(d.at(s * (HALF + 1.5), 1.35, zB - 0.01 - 0.0, 0), rng, 0, 0, 3 + k * 2);
      lamps.push({ position: { x: s * (HALF + 1.6), y: 1.6, z: zc }, intensity: 2.6, distance: 4.5, flicker: 0.3 });
    }
  });

  // The lockers (their places are in containers.ts): at the far wall, their faces to the passage.
  const yaws: Record<string, number> = {};
  for (let i = 0; i < 6; i++) yaws[`ctn-cella-ludi-${i + 1}`] = i < 3 ? Math.PI / 2 : -Math.PI / 2;
  drawChests(d, LUDUS_CELLAE, yaws);

  spots.push(
    { id: 'entry', kind: 'spawn', position: new THREE.Vector3(0, 0, 1.3), heading: 0 },
    { id: 'passage', kind: 'spot', position: new THREE.Vector3(0, 0, 6.6), heading: 0 },
    { id: 'cell-1', kind: 'spot', position: new THREE.Vector3(2.4, 0, 2.8), heading: Math.PI / 2 },
    { id: 'cell-4', kind: 'spot', position: new THREE.Vector3(-2.4, 0, 2.8), heading: -Math.PI / 2 },
  );
  const object = b.build(`interior:${LUDUS_CELLAE}`);
  return { object, colliders: [...b.colliders], spots, lamps };
}

const ENTRY: Vec3 = { x: 0, y: 0.05, z: 1.3 };

export const ludusCellae: NamedCell = {
  id: LUDUS_CELLAE,
  name: 'The Ludus Barracks',
  latin: 'Cellae Ludi',
  at: LUDUS_CELLAE,
  slot: 1,
  anchor: (game) => barracks(game)?.stand ?? null,
  bounds: { min: { x: -CELL_X - 0.4, y: -0.7, z: -0.3 }, max: { x: CELL_X + 0.4, y: CEIL + 0.8, z: END + 0.4 } },
  entry: { position: ENTRY, heading: 0 },
  // Down the passage, looking into each cell (right and left) as it passes: the walk of a man on the watch.
  route: [
    ENTRY,
    ...CELLS.flatMap(([zA, zB]) => {
      const zc = (zA + zB) / 2;
      return [{ x: 0, y: 0, z: zc }, { x: 2.5, y: 0, z: zc }, { x: 0, y: 0, z: zc }, { x: -2.5, y: 0, z: zc }, { x: 0, y: 0, z: zc }];
    }),
    { x: 0, y: 0, z: END - 1 },
  ],
  build,
  exit: {
    at: { x: 0, y: 1.2, z: 0.8 },
    label: 'The cell door',
    verb: 'Go out',
    to: (game) => {
      const s = barracks(game);
      return s ? { position: s.stand, heading: s.heading + Math.PI } : null;
    },
  },
  outside: [
    {
      id: `${LUDUS_CELLAE}:in`,
      label: 'The barracks',
      verb: 'Go in',
      at: (game) => {
        const s = barracks(game);
        return s ? { x: s.stand.x + Math.sin(s.heading) * (SPOT_TO_WALL - 0.4), y: s.stand.y + 1.0, z: s.stand.z + Math.cos(s.heading) * (SPOT_TO_WALL - 0.4) } : null;
      },
      from: null,
      reach: 1.8,
      to: { interior: LUDUS_CELLAE, position: ENTRY, heading: 0 },
    },
  ],
};
