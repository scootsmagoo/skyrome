/**
 * Where the jobs happen (docs/design/world-life.md §4.7): the two new posts at the river port, and
 * the marker points of the job steps that end at a post rather than with a named NPC.
 *
 *  - The tally clerk's post is on the quay beside the harbour office (the builder's
 *    'portus-tiberinus:statio' kiosk), with the heap of amphorae fresh off the moored barges. The
 *    crowd's own `st-portus-saccarii` anchors 23 real metres out from the landmark's facade, which
 *    puts its porters in the river, so the job does not use it.
 *  - The storekeeper stands at the storeroom door under the painted HORREA sign
 *    ('portus-tiberinus:horrea'), about 34 m down the quay.
 *
 * Both posts are `point` anchors (real metres and a compass bearing) so that their positions are
 * known without the game: job steps put their quest markers on them (a keeper is not a named NPC of
 * src/npc/content, so a marker names the post, not the person). `y` is 0 as in src/game/guide.ts:
 * the compass and the maps read x and z.
 *
 * `jobStep(game, id)` is the step a running job is on (the job keeps it in its quest vars), for
 * gates in life data that must not import the job modules.
 */
import type { Game } from '../../core/Game';
import { STATIONS, stationAnchor, stationPoint, type StationDef } from '../../npc/crowd/stations';
import type { MarkerTarget } from '../../quests/types';

/** The quay is under the harbour office's counter: 'out' faces the river (233°), 'side' runs south-west along the quay. */
export const ST_TABULARIUS: StationDef = {
  id: 'st-life-portus-tabularius',
  point: [-414.7, 227.2],
  bearing: 233,
  when: ['salutatio', 'morning', 'afternoon'],
  // The porter waits a few steps beyond the heap, so that E on the heap isn't E on him.
  members: [
    { role: 'merchant', out: 0.2, side: -2.6, loop: 'stand', face: 'center', prop: 'scroll', label: 'Tally clerk' },
    { role: 'porter', out: 0.7, side: -7.4, loop: 'stand', face: 'center', prop: 'amphora', label: 'Dock porter' },
  ],
  // The barge's oil, landed on the quay; the job's amphorae are taken from it.
  dressing: [{ kind: 'amphorae', out: 0.2, side: -4.8 }],
};

/** The storeroom door under the HORREA sign: 'out' faces the river (216°), the facade is 1.6 m inland. */
export const ST_HORREUM: StationDef = {
  id: 'st-life-portus-horreum',
  point: [-445.5, 180.2],
  bearing: 216,
  when: ['salutatio', 'morning', 'afternoon'],
  members: [{ role: 'merchant', out: -0.6, side: -2.1, loop: 'stand', face: 'out', prop: 'scroll', label: 'Storekeeper' }],
  // What has been carried in today, stacked against the wall under the sign.
  dressing: [{ kind: 'amphorae', out: -1.0, side: -0.2 }],
};

/** A quest marker on a station post (`out`, `side` from its anchor), or null when it has none. */
export function postTarget(def: StationDef | string, out: number, side: number): MarkerTarget | null {
  const st = typeof def === 'string' ? STATIONS.find((s) => s.id === def) : def;
  const a = st ? stationAnchor(st) : null;
  if (!a) return null;
  const p = stationPoint(a, out, side);
  return { kind: 'point', x: Math.round(p.x * 10) / 10, y: 0, z: Math.round(p.z * 10) / 10 };
}

/** A marker on a station's member (`member`) or dressing piece (`dressing`). */
export function stationTarget(def: StationDef | string, at: { member: number } | { dressing: number }): MarkerTarget {
  const st = typeof def === 'string' ? STATIONS.find((s) => s.id === def) : def;
  const o = !st ? undefined : 'member' in at ? st.members[at.member] : st.dressing?.[at.dressing];
  const t = st && o ? postTarget(st, o.out, o.side) : null;
  if (!t) throw new Error(`[jobs] no post for ${typeof def === 'string' ? def : def.id}`);
  return t;
}

/** The step a running job is on (its id), or null. */
export function jobStep(game: Game, jobId: string): string | null {
  const st = game.quests?.state(jobId);
  if (st?.status !== 'running') return null;
  const s = st.vars.step;
  return typeof s === 'string' ? s : null;
}
