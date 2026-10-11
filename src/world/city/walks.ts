/**
 * Explicit walking chains for the street graph (network.ts): the ways through landmarks that the graph's own
 * links cannot find. A link across a solid landmark's footprint is refused by the plan raster, and the physics
 * probe cannot climb onto a raised floor or through a porch from the side, so without these the Forum of Trajan's
 * nodes had no edge at all and the quest route to the Column ran straight through the Basilica Ulpia (phase 4b, B1).
 *
 * A chain's points are in its landmark's local frame (game metres: the frame the builder draws in, `PlacedLandmark`
 * position and rotationY), so the chain follows the landmark if the atlas moves it; a chain with no landmark is in
 * world game metres (a city spot such as an inn's door). Its consecutive points are joined as drawn (they are the
 * nav grid's own smoothed paths in the built game, taken with scripts/audit/routes-4b-walks.js and turned into the
 * landmark's frame), and the points in `link` (default: both ends) are joined to the street network by the graph's
 * own walkable links. Chains that meet share their meeting point (one node: points within a metre of a node already
 * in the graph are that node). A walk's own points are more than a metre apart.
 */
import type { Vec2 } from '../../arch/fabric/types';

export interface Walk {
  id: string;
  /** The landmark whose local frame the points are in, or null for world game coordinates. */
  landmark: string | null;
  pts: readonly (readonly [number, number])[];
  /** Points (indices) joined to the street network; default the first and the last. */
  link?: readonly number[];
}

export const WALKS: readonly Walk[] = [
  {
    // Forum of Trajan (forum-trajan's local frame is the forum frame of trajan-layout.ts: x = u·0.6, z = −v·0.6):
    // the gateway from the square before the Forum of Augustus, the square (round the Equus on its east side), the
    // central porch of the Basilica Ulpia between its middle columns, the nave on the axis, the back door and its four
    // steps down, and the court of the Column. Walked on the nav grid: floor 10.53 in the square and the court, 11.22
    // inside. The owner's no-clip spot (phase 4b, B1): with no way through, the route to the Column ran straight
    // through the basilica's walls.
    id: 'forum-trajan',
    landmark: 'forum-trajan',
    pts: [
      [0, -40],
      [0, -26],
      [5, -8],
      [0, 12],
      [0, 29.5],
      [0, 35.5],
      [0, 41],
      [0, 55],
      [0, 70.5],
      [0, 72.4],
      [0, 76.5],
    ],
    link: [0, 3, 10],
  },
  {
    // Out of the court of the Column past its north side, and east along the back of the court to the road under the
    // Markets (the court's only open side; grid path 94 m, 2026-10-11).
    id: 'forum-trajan-court',
    landmark: 'forum-trajan',
    pts: [
      [0, 76.5],
      [-1.5, 76.9],
      [-3.4, 79.2],
      [-2.6, 91.7],
      [-3.2, 92.9],
      [-6.4, 93.7],
      [-18.2, 89],
      [-48.1, 64],
      [-50.7, 57.8],
      [-49.9, 43.5],
    ],
    link: [6, 9],
  },
  {
    // The imperial fora, Forum of Augustus frame: from its square out of its front (south-west) into the open ground
    // before it, and along the back of the Forum of Caesar to the gateway of the Forum of Trajan (the first point of
    // the walk above). Grid path, floors 10.2 to 10.5.
    id: 'fora-augustus-trajan',
    landmark: 'forum-augustus',
    pts: [
      [0, 0],
      [5.5, -21.1],
      [4.2, -36.6],
      [6.1, -38.9],
      [26.7, -38.5],
      [29, -36.6],
      [40.6, -13.8],
    ],
    link: [0, 2, 6],
  },
  {
    // …and from its square out of its front the other way, past the end of the Forum of Nerva (the Argiletum's mouth,
    // floor 9.0), to the square of the Forum of Caesar.
    id: 'fora-augustus-caesar',
    landmark: 'forum-augustus',
    pts: [
      [0, 0],
      [-3, -4.7],
      [-4.4, -37.2],
      [-5.9, -38.5],
      [-21.5, -38.6],
      [-23.1, -39.9],
      [-25.2, -48.2],
      [-23.3, -50.5],
      [22.1, -69.2],
    ],
    link: [3, 7],
  },
  {
    // The Forum of Caesar down its axis to the Argiletum by the Curia (the Forum Romanum): grid path 58 m.
    id: 'fora-caesar-argiletum',
    landmark: 'forum-caesar',
    pts: [
      [0, 0],
      [-0.6, -50.5],
      [-0.3, -54.7],
      [1.5, -57.3],
    ],
    link: [0, 3],
  },
  {
    // …and out of its west corner past the Basilica Argentaria and down the Clivus Argentarius to the Forum.
    id: 'fora-caesar-argentarius',
    landmark: 'forum-caesar',
    pts: [
      [0, 0],
      [15.1, 19.3],
      [15.1, 30],
      [17, 32.2],
      [23.9, 35.6],
      [26, 35],
      [30.7, 29.6],
      [36.7, 24.4],
      [43.8, -2.5],
      [43.7, -4.2],
      [42.7, -5.6],
    ],
    link: [4, 10],
  },
  {
    // Across the Forum from the Via Sacra before the Temple of Castor to the Golden Milestone (the Forum's own links
    // went round by the Vicus Tuscus: its middle is all monuments and bases). World game metres, grid path 55 m.
    id: 'forum-romanum-cross',
    landmark: null,
    pts: [
      [45, 30],
      [8.5, 7.5],
      [2.5, -2.5],
    ],
    link: [0, 1],
  },
  {
    // From the Golden Milestone past the Curia to the corner between the Forum of Caesar and the Basilica Argentaria
    // (the end of the walk above): the Forum's way into the imperial fora while the Argiletum's mouth between the Curia
    // and the Basilica Aemilia is walled (no grid path from the Forum to it, 2026-10-11). World game metres, grid path 48 m.
    id: 'forum-curia-corner',
    landmark: null,
    pts: [
      [2.5, -2.5],
      [7.5, -24.5],
      [18.2, -37.3],
    ],
    link: [0, 2],
  },
  {
    // The Inn at the Starting Gates (the caupona of mq-01, phase 4b B3): its door on the lane behind it, and the lane
    // out to the street west of it (world game metres; grid path 37 m). The inn's place (−105, 312) is inside it.
    id: 'caupona-carcerum',
    landmark: null,
    pts: [
      [-100.5, 316.8],
      [-101.5, 321.2],
      [-101.5, 324.5],
      [-112.5, 324.5],
    ],
    link: [3],
  },
];

/** A landmark's placement (PlacedLandmark fits). */
export interface WalkFrame {
  position: { x: number; z: number };
  rotationY: number;
}

/** A chain's points in world game metres (frame: its landmark's placement; null for a world chain). */
export function walkPoints(w: Walk, frame: WalkFrame | null): Vec2[] {
  if (!frame) return w.pts.map((p) => [p[0], p[1]] as Vec2);
  const c = Math.cos(frame.rotationY);
  const s = Math.sin(frame.rotationY);
  return w.pts.map(([x, z]) => [frame.position.x + x * c + z * s, frame.position.z - x * s + z * c] as Vec2);
}
