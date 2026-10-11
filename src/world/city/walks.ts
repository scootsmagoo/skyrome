/**
 * Explicit walking chains for the street graph (network.ts): the ways through landmarks that the graph's own
 * links cannot find. A link across a solid landmark's footprint is refused by the plan raster, and the physics
 * probe cannot climb onto a raised floor or through a porch from the side, so without these the Forum of Trajan's
 * nodes had no edge at all and the quest route to the Column ran straight through the Basilica Ulpia (phase 4b, B1).
 *
 * A chain's points are in its landmark's local frame (game metres: the frame the builder draws in, `PlacedLandmark`
 * position and rotationY), so the chain follows the landmark if the atlas moves it; a chain with no landmark is in
 * world game metres (a city spot such as an inn's door). Its consecutive points are joined as drawn (they were walked
 * on the nav grid in the built game: scripts/audit/routes-walks.js), and the points in `link` (default: both ends)
 * are joined to the street network by the graph's own walkable links.
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
    // the gateway from the Forum of Augustus, the square (round the Equus on its east side), the central porch of
    // the Basilica Ulpia between its middle columns, the nave on the axis, the back door and its four steps down,
    // and the court of the Column. Walked on the nav grid: floor 10.53 in the square and the court, 11.22 inside.
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
