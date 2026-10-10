/**
 * Stations: small authored groups of people who are always at a particular place at certain times
 * of day, with their set dressing (a brazier, a stall, a money-changer's table). They make the
 * golden path (GDD §17.2) read as a lived-in city from the first second: vigiles with lanterns
 * warming their hands at a brazier by the Porta Capena before dawn, farmers waiting at the gate
 * with their baskets, cook-shops and a fortune-teller under the Circus arcades, perfumers in the
 * Vicus Tuscus, money-changers in the Forum.
 *
 * Station people are ambient crowd members outside the crowd budget: they spawn out of sight when
 * the player comes within ~85 m of the station while it is active, stand at their posts in their
 * idle loops, and walk off when its hours end. Pure data and geometry here; NpcManager spawns them.
 */
import type { IdleLoop } from '../../actors/Actor';
import * as atlas from '../../data/atlas';
import { toGame, WORLD_SCALE } from '../../world/coords';
import { laneAt } from '../../ai/life/lanes';
import type { DayPhase } from './budget';
import { atlasLanes } from './atlasLanes';
import { TRADES } from './trades';
import type { CrowdRoleId, PropKind } from './roles';

export type DressingKind =
  | 'brazier'
  | 'stall-food'
  | 'stall-cloth'
  | 'stall-pots'
  | 'table'
  | 'cart'
  | 'counter'
  | 'amphorae'
  | 'scrolls'
  | 'bench'
  | 'stool'
  | 'vats'
  | 'anvil'
  | 'oven'
  | 'mill'
  | 'altar'
  /** A shop's wooden shutters, put up while its keeper is away (src/life). */
  | 'shutters'
  /** A market-day banner on a pole (src/life). */
  | 'banner';

export interface StationMember {
  role: CrowdRoleId;
  /** Offset from the anchor (game metres): `out` along the anchor's outward direction, `side` to its right. */
  out: number;
  side: number;
  loop: IdleLoop;
  /** Where to face: away from the building ('out'), toward it ('in'), toward the station centre ('center'), or an angle (rad) relative to 'out'. */
  face?: 'out' | 'in' | 'center' | number;
  /** Carried prop (overrides the role's random prop; null = nothing). */
  prop?: PropKind | null;
  /** Prompt label (overrides the role's). */
  label?: string;
  /** Bark table (overrides the role's). */
  barks?: string;
  /** A stool is put under them (loop 'sit'): a barber's customer, a scribe. */
  seat?: boolean;
}

export interface StationDressing {
  kind: DressingKind;
  out: number;
  side: number;
  /** Yaw relative to 'out' (rad). */
  turn?: number;
}

export interface StationDef {
  id: string;
  /** Anchor on an atlas landmark: in front of its main facade (its footprint depth/2 + `gap` real metres out). */
  landmark?: string;
  gap?: number;
  /** Or on a lane (atlas road id) at a fraction of its length; 'out' is to the right of the lane direction. */
  lane?: string;
  at?: number;
  /** Or at a real-metre point, 'out' along a compass bearing (degrees). */
  point?: readonly [number, number];
  bearing?: number;
  /** Or on a landmark's own spot (a palus in the Ludus court, a room door): 'out' is the spot's heading. */
  spot?: string;
  /** Phases of the day when the station is manned. */
  when: readonly DayPhase[];
  /** Manned only on market days (the nundinae, every 8th day: barter.isMarketDay). */
  marketDay?: boolean;
  members: readonly StationMember[];
  dressing?: readonly StationDressing[];
}

const NIGHT: readonly DayPhase[] = ['night', 'predawn'];
const DAY: readonly DayPhase[] = ['salutatio', 'morning', 'midday', 'afternoon'];
const DAYLONG: readonly DayPhase[] = ['salutatio', 'morning', 'midday', 'afternoon', 'evening'];

const ALL: StationDef[] = [
  // ---------------------------------------------------------------- the Porta Capena (the spawn)
  // The gate faces 140° (out along the Via Appia); 'out' below is toward the Campagna, 'side' to
  // its right (south-west). The road is ~5 m wide, so posts keep |side| > 4 and leave the arch,
  // the cart stand on the road (mq-01) and the crossroads shrine clear.
  {
    // The vigiles' night post just inside the gate: a brazier, two warming their hands, one on
    // watch with his lantern toward the road.
    id: 'st-capena-vigiles',
    point: [478, 912],
    bearing: 143,
    when: NIGHT,
    members: [
      { role: 'vigil', out: 0.9, side: -7.2, loop: 'talk', face: 'center', prop: null },
      { role: 'vigil', out: -0.9, side: -7.6, loop: 'stand', face: 'center', prop: null },
      { role: 'vigil', out: 1.6, side: -4.4, loop: 'guard', face: 1.57, prop: 'lantern' },
    ],
    dressing: [{ kind: 'brazier', out: 0.2, side: -6.4 }],
  },
  {
    // The cart stand outside the gate (docs/CONTENT.md §1.1 capena-extra): wagons wait here by day
    // for the night, and the last of the night's carts come back out before dawn.
    id: 'st-capena-carts',
    point: [523, 974],
    bearing: 143,
    when: ['night', 'predawn', 'salutatio', 'morning', 'midday', 'afternoon', 'evening'],
    members: [
      { role: 'carter', out: 7.4, side: 9.6, loop: 'sleep', face: 1.2, prop: null, label: 'Drover' },
      { role: 'carter', out: 3.2, side: -8.8, loop: 'stand', face: 2.6, prop: 'lantern', label: 'Drover' },
      { role: 'carter', out: 1.6, side: -6.2, loop: 'sitGround', face: -1.4, prop: null, label: 'Drover' },
    ],
    dressing: [
      { kind: 'cart', out: 4.5, side: 7.4, turn: 0.15 },
      { kind: 'cart', out: 6.5, side: -7.2, turn: -0.2 },
    ],
  },
  {
    // Farmers from the Campagna wait at the gate with their baskets; one sells to the arrivals.
    id: 'st-capena-farmers',
    point: [513, 961],
    bearing: 143,
    when: ['predawn', 'salutatio'],
    members: [
      { role: 'farmer', out: 0.4, side: -5.6, loop: 'sitGround', face: -1.9, prop: 'basket' },
      { role: 'farmer', out: 1.6, side: -6.8, loop: 'talk', face: 'center', prop: null },
      { role: 'farmer', out: -0.6, side: -7.4, loop: 'talk', face: 'center', prop: 'sack' },
      { role: 'farmer', out: 2.8, side: -8.6, loop: 'stand', face: -1.57, prop: null, label: 'Market gardener', barks: 'merchant' },
    ],
    dressing: [{ kind: 'stall-food', out: 2.8, side: -7.6, turn: -1.57 }],
  },
  {
    // The customs post (portorium) by day: an officer at his table, a trader arguing the toll.
    id: 'st-capena-portitor',
    point: [513, 961],
    bearing: 143,
    when: DAY,
    members: [
      { role: 'merchant', out: 0.6, side: 6.4, loop: 'stand', face: -1.57, prop: null, label: 'Customs officer', barks: 'portitor' },
      { role: 'merchant', out: 0.6, side: 4.6, loop: 'talk', face: 1.57, prop: null, label: 'Trader' },
      { role: 'porter', out: 2.2, side: 4.4, loop: 'stand', face: 'center', prop: 'amphora' },
    ],
    dressing: [{ kind: 'table', out: 0.6, side: 5.6, turn: 1.57 }],
  },
  {
    // Litter-bearers wait for fares at the stand inside the gate (docs/CONTENT.md §1.1).
    id: 'st-capena-lecticarii',
    point: [492, 930],
    bearing: 143,
    when: DAYLONG,
    members: [
      { role: 'porter', out: 0, side: 5.2, loop: 'sitGround', face: -1.2, prop: null, label: 'Litter-bearer' },
      { role: 'porter', out: 1.2, side: 6.2, loop: 'talk', face: 'center', prop: null, label: 'Litter-bearer' },
      { role: 'porter', out: -1, side: 6.4, loop: 'talk', face: 'center', prop: null, label: 'Litter-bearer' },
    ],
  },
  // ---------------------------------------------------------------- the Circus valley
  {
    // Cook-shop stall under the Circus arcades by the crossroads shrine (Horace, Sat. 1.6.113).
    id: 'st-circus-popina',
    lane: 'street-north-of-circus',
    at: 0.78,
    when: DAYLONG,
    members: [
      { role: 'merchant', out: 5.2, side: 0, loop: 'stand', face: 'in', prop: null, label: 'Cook-shop keeper', barks: 'merchant' },
      { role: 'citizen', out: 3.4, side: -0.8, loop: 'talk', face: 'out', prop: null },
      { role: 'artisan', out: 3.2, side: 1.2, loop: 'stand', face: 'out', prop: null },
    ],
    dressing: [{ kind: 'stall-food', out: 4.4, side: 0 }],
  },
  {
    // A fortune-teller (Juvenal 6.582–91: the plebeian girl asks her fate at the Circus).
    id: 'st-circus-sortilega',
    lane: 'street-north-of-circus',
    at: 0.62,
    when: ['morning', 'midday', 'afternoon', 'evening'],
    members: [
      { role: 'foreigner', out: 4.8, side: 0, loop: 'sitGround', face: 'in', prop: null, label: 'Fortune-teller', barks: 'sortilega' },
      { role: 'citizen-woman', out: 3.6, side: 0.4, loop: 'stand', face: 'out', prop: null },
    ],
  },
  {
    // Potters and lamp-sellers at the head of the valley.
    id: 'st-circus-figlinae',
    lane: 'street-north-of-circus',
    at: 0.9,
    when: DAY,
    members: [
      { role: 'merchant', out: -4.6, side: 0, loop: 'sweep', face: 'out', prop: null, label: 'Potter' },
      { role: 'citizen-woman', out: -3.2, side: 1, loop: 'talk', face: 'in', prop: 'basket' },
    ],
    dressing: [{ kind: 'stall-pots', out: -5.2, side: -1.6 }],
  },
  {
    // A night watch post at the valley head (the vigiles' excubitorium of Regio XI).
    id: 'st-circus-vigiles',
    lane: 'street-north-of-circus',
    at: 0.5,
    when: NIGHT,
    members: [
      { role: 'vigil', out: 4.6, side: -0.8, loop: 'talk', face: 'center', prop: null },
      { role: 'vigil', out: 4.6, side: 1.2, loop: 'stand', face: 'center', prop: 'lantern' },
    ],
    dressing: [{ kind: 'brazier', out: 5.6, side: 0.2 }],
  },
  // ---------------------------------------------------------------- the Velabrum and the Vicus Tuscus
  {
    // Silk and fine cloth: the vestarii of the Vicus Tuscus.
    id: 'st-tuscus-vestarius',
    lane: 'vicus-tuscus',
    at: 0.3,
    when: DAYLONG,
    members: [
      { role: 'merchant', out: 3.4, side: 0, loop: 'stand', face: 'in', prop: null, label: 'Silk-seller', barks: 'merchant' },
      { role: 'matron', out: 1.8, side: 0.6, loop: 'talk', face: 'out', prop: null },
    ],
    dressing: [{ kind: 'stall-cloth', out: 2.7, side: 0 }],
  },
  {
    // Oil and wine at the Velabrum end.
    id: 'st-tuscus-velabrum',
    lane: 'vicus-tuscus',
    at: 0.55,
    when: DAY,
    members: [
      { role: 'merchant', out: -3.4, side: 0, loop: 'stand', face: 'in', prop: null, label: 'Oil-seller', barks: 'merchant' },
      { role: 'porter', out: -2, side: 1.2, loop: 'stand', face: 'out', prop: 'amphora' },
      { role: 'citizen', out: -1.8, side: -1, loop: 'talk', face: 'out', prop: null },
    ],
    dressing: [{ kind: 'stall-pots', out: -2.7, side: 0 }],
  },
  // ---------------------------------------------------------------- the Forum
  {
    // Money-changers before the Basilica Aemilia (the tabernae argentariae).
    id: 'st-forum-argentarii',
    landmark: 'basilica-aemilia',
    gap: 3,
    when: DAY,
    members: [
      { role: 'merchant', out: 0.4, side: -3, loop: 'sit', face: 'out', prop: null, label: 'Money-changer', barks: 'argentarius' },
      { role: 'citizen', out: 1.6, side: -3, loop: 'talk', face: 'in', prop: null },
      { role: 'merchant', out: 0.4, side: 4, loop: 'stand', face: 'out', prop: null, label: 'Money-changer', barks: 'argentarius' },
      { role: 'foreigner', out: 1.6, side: 4.2, loop: 'talk', face: 'in', prop: null },
    ],
    dressing: [
      { kind: 'table', out: 0.9, side: -3 },
      { kind: 'table', out: 0.9, side: 4 },
    ],
  },
  {
    // Gaming boards scratched into the Basilica Julia steps; idlers squat over them all day.
    id: 'st-forum-tabulae',
    landmark: 'basilica-julia',
    gap: 2,
    when: ['morning', 'midday', 'afternoon'],
    members: [
      { role: 'idler', out: 0.6, side: -6, loop: 'sitGround', face: 1.57, prop: null },
      { role: 'idler', out: 0.6, side: -4.8, loop: 'sitGround', face: -1.57, prop: null },
      { role: 'idler', out: 1.8, side: -5.4, loop: 'cheer', face: 'in', prop: null },
    ],
  },
  {
    // The vigiles' night post by the Temple of Castor (the Forum's strongrooms).
    id: 'st-forum-vigiles',
    landmark: 'temple-castor-pollux',
    gap: 4,
    when: NIGHT,
    members: [
      { role: 'vigil', out: 1.4, side: 5.6, loop: 'talk', face: 'center', prop: null },
      { role: 'vigil', out: 3, side: 6.6, loop: 'stand', face: 'center', prop: 'lantern' },
    ],
    dressing: [{ kind: 'brazier', out: 2.4, side: 5.2 }],
  },
  // The city at work: shops, workshops, schools, the dole, the baths, the Ludus (trades.ts).
  ...TRADES,
];

/** Every station: the authored ones, then any registered at runtime (registerStations). */
export const STATIONS: readonly StationDef[] = ALL;

/**
 * Add stations defined elsewhere (src/life: a coppersmith's new post, the market-day stalls). The
 * director walks STATIONS itself, so they are manned from the next update. Ids already present are
 * skipped; returns how many were added.
 */
export function registerStations(defs: readonly StationDef[]): number {
  let n = 0;
  for (const d of defs) {
    if (ALL.some((x) => x.id === d.id)) continue;
    ALL.push(d);
    n++;
  }
  return n;
}

export interface StationAnchor {
  x: number;
  z: number;
  /** Outward unit direction. */
  ox: number;
  oz: number;
}

const anchors = new Map<string, StationAnchor | null>();

type SpotLookup = (id: string) => { x: number; z: number; heading: number } | null;
let spotLookup: SpotLookup | null = null;

/** How station `spot` anchors find landmark spots (NpcManager sets it from game.landmarks). */
export function setStationSpots(fn: SpotLookup | null) {
  spotLookup = fn;
}

/** Game-space anchor of a station (null if its landmark, lane or spot is missing). */
export function stationAnchor(def: StationDef): StationAnchor | null {
  if (anchors.has(def.id)) return anchors.get(def.id)!;
  let a: StationAnchor | null = null;
  if (def.spot) {
    // Landmarks build after the NPC module: not cached until the spot exists.
    const sp = spotLookup?.(def.spot);
    if (!sp) return null;
    a = { x: sp.x, z: sp.z, ox: Math.sin(sp.heading), oz: Math.cos(sp.heading) };
  } else if (def.landmark) {
    const lm = atlas.LANDMARK_BY_ID[def.landmark];
    if (lm) {
      const [gx, gz] = toGame(lm.center[0], lm.center[1]);
      const th = (lm.rotation * Math.PI) / 180;
      const ox = Math.sin(th);
      const oz = -Math.cos(th);
      const fp = lm.footprint;
      const depth = fp.kind === 'rect' ? fp.d : fp.kind === 'circle' ? fp.r * 2 : fp.kind === 'ellipse' ? fp.rz * 2 : 20;
      const off = (depth / 2 + (def.gap ?? 3)) * WORLD_SCALE;
      a = { x: gx + ox * off, z: gz + oz * off, ox, oz };
    }
  } else if (def.point) {
    const [gx, gz] = toGame(def.point[0], def.point[1]);
    const th = ((def.bearing ?? 0) * Math.PI) / 180;
    a = { x: gx, z: gz, ox: Math.sin(th), oz: -Math.cos(th) };
  } else if (def.lane) {
    const lane = atlasLanes().lanes.find((l) => l.id === def.lane);
    if (lane) {
      const p = laneAt(lane, lane.length * (def.at ?? 0.5));
      // 'out' is the lane's right-hand side.
      a = { x: p.x, z: p.z, ox: -p.dz, oz: p.dx };
    }
  }
  anchors.set(def.id, a);
  return a;
}

/** World position of an offset (out, side) from an anchor. */
export function stationPoint(a: StationAnchor, out: number, side: number): { x: number; z: number } {
  // Right of 'out' is (−oz, ox).
  return { x: a.x + a.ox * out - a.oz * side, z: a.z + a.oz * out + a.ox * side };
}

/** Heading for a member (Actor convention: forward = (sin h, cos h)). */
export function memberHeading(a: StationAnchor, def: StationDef, m: StationMember): number {
  const outH = Math.atan2(a.ox, a.oz);
  const f = m.face ?? 'out';
  if (f === 'out') return outH;
  if (f === 'in') return outH + Math.PI;
  if (f === 'center') {
    const pts = [...def.members.map((o) => [o.out, o.side]), ...(def.dressing ?? []).map((d) => [d.out, d.side])];
    // Toward the dressing if there is one, else the members' centroid.
    const tgt = def.dressing?.length ? [def.dressing[0].out, def.dressing[0].side] : [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
    const p = stationPoint(a, m.out, m.side);
    const c = stationPoint(a, tgt[0], tgt[1]);
    return Math.atan2(c.x - p.x, c.z - p.z);
  }
  return outH + f;
}

/** Stations manned in this phase whose anchor lies within `r` of (x, z), nearest first. */
export function activeStations(x: number, z: number, phase: DayPhase, r: number, defs: readonly StationDef[] = STATIONS): StationDef[] {
  const out: [StationDef, number][] = [];
  for (const d of defs) {
    if (!d.when.includes(phase)) continue;
    const a = stationAnchor(d);
    if (!a) continue;
    const dist = Math.hypot(a.x - x, a.z - z);
    if (dist <= r) out.push([d, dist]);
  }
  return out.sort((p, q) => p[1] - q[1]).map((p) => p[0]);
}
