/**
 * Lanes from the atlas roads (game metres), plus a few connectors the atlas lacks: the road from
 * the Porta Capena into the city, so that the golden path (GDD §17.2: the gate, the Circus valley,
 * the Velabrum, the Vicus Tuscus, the Forum) is one continuous street people walk along.
 * Computed once.
 */
import * as atlas from '../../data/atlas';
import { toGame, WORLD_SCALE } from '../../world/coords';
import { LaneSet, makeLane, type Lane } from '../../ai/life/lanes';

/** Real-metre polylines the crowd may walk that the atlas has no road for. */
const CONNECTORS: readonly { id: string; width: number; points: readonly (readonly [number, number])[] }[] = [
  // Inside the Porta Capena: the Via Appia runs on to the head of the Circus valley, where the
  // streets below the Palatine and the triumphal road to the Colosseum begin.
  { id: 'conn-capena-intra', width: 8, points: [[507, 955], [470, 905], [430, 860], [406, 840]] },
  { id: 'conn-capena-triumphal', width: 7, points: [[430, 860], [414, 809]] },
];

let set: LaneSet | null = null;

export function atlasLanes(): LaneSet {
  if (set) return set;
  const lanes: Lane[] = [];
  const conv = (pts: readonly (readonly [number, number])[]) =>
    pts.map(([x, z]) => {
      const [gx, gz] = toGame(x, z);
      return { x: gx, z: gz };
    });
  for (const r of atlas.ROADS) {
    if (r.points.length < 2) continue;
    lanes.push(makeLane(r.id, conv(r.points), Math.max(2, r.width * WORLD_SCALE), r.kind));
  }
  for (const c of CONNECTORS) lanes.push(makeLane(c.id, conv(c.points), c.width * WORLD_SCALE, 'connector'));
  set = new LaneSet(lanes);
  return set;
}

/** Lanes carts can use (no stairs, paths or alleys narrower than a cart). */
export function cartLane(l: Lane): boolean {
  return l.kind !== 'stairs' && l.kind !== 'path' && l.width >= 2.6;
}
