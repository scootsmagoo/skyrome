/**
 * How many people are out, and who (GDD §14.7 crowd targets, AC-10):
 *  - the Forum at hours 2–6 holds ~60 citizens around the player (v0.1 Must 30, Should 60);
 *  - the midday rest and the evening thin it out; at night ≤ 25 people are about, counting the
 *    vigiles with their lanterns, plus the night carts that Caesar's law keeps off the streets
 *    from sunrise to the 10th hour (society.md §3.5).
 * Pure functions of the clock hour, sunrise/sunset and the district density.
 */
import type { Rng } from '../../core/Rng';
import { isOut, romanPosition, type SunTimes } from '../schedules';
import type { District } from './districts';
import { CROWD_ROLES, type CrowdRoleId } from './roles';

export type DayPhase = 'predawn' | 'salutatio' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'night';

/** Phase of the Roman day at a clock hour. */
export function dayPhase(hour: number, sun: SunTimes): DayPhase {
  const p = romanPosition(hour, sun);
  if (p >= 15) return 'predawn';
  if (p >= 12) return 'night';
  if (p < 2) return 'salutatio';
  if (p < 6) return 'morning';
  if (p < 8) return 'midday';
  if (p < 10) return 'afternoon';
  return 'evening';
}

/** Citizens about at density 1 by Roman day position (0..12 day, 12..16 night). Piecewise linear. */
const CURVE: readonly [number, number][] = [
  [0, 36],
  [1.5, 54],
  [2, 60],
  [6, 60],
  [6.6, 46],
  [8, 40],
  [9.5, 34],
  [11, 27],
  [12, 20],
  [12.8, 13],
  [15, 11],
  [15.6, 16],
  [16, 36],
];

function curve(p: number) {
  for (let i = 1; i < CURVE.length; i++) {
    const [p1, v1] = CURVE[i];
    const [p0, v0] = CURVE[i - 1];
    if (p <= p1) return v0 + ((v1 - v0) * (p - p0)) / (p1 - p0);
  }
  return CURVE[CURVE.length - 1][1];
}

export interface CrowdBudget {
  phase: DayPhase;
  /** Ambient citizens to keep around the player (excluding vigiles and carts). */
  citizens: number;
  /** Vigiles with lanterns (night patrols). */
  vigiles: number;
  /** Night carts on the move. */
  carts: number;
  night: boolean;
}

/** Hard cap on people visible at night (AC-10). */
export const NIGHT_CAP = 25;

/**
 * @param density district density 0..1.8 (1 = a busy quarter; the Forum is 1.6)
 * @param scale player setting / dev override (1 = default)
 */
export function crowdBudget(hour: number, sun: SunTimes, density: number, scale = 1): CrowdBudget {
  const p = romanPosition(hour, sun);
  const phase = dayPhase(hour, sun);
  const night = phase === 'night' || phase === 'predawn';
  let citizens = Math.round(curve(p) * Math.max(0.2, Math.min(1.8, density)) * scale);
  const vigiles = night ? Math.max(2, Math.round(3 * Math.min(1, density + 0.3))) : 0;
  if (night) citizens = Math.min(citizens, NIGHT_CAP - vigiles - 2);
  else citizens = Math.max(citizens, Math.round(8 * scale));
  // Carts: allowed from the 10th hour (p ≥ 9) until sunrise; most in the dark watches.
  let carts = 0;
  if (p >= 9 && p < 12) carts = 1;
  else if (p >= 12 && p < 15.5) carts = 3;
  else if (p >= 15.5) carts = 2;
  carts = Math.round(carts * Math.min(1, scale));
  return { phase, citizens: Math.max(0, citizens), vigiles, carts, night };
}

/**
 * How many ambient citizens to keep around the player: the budget, capped by `maxCrowd`, and at
 * night by the ≤ 25 rule with the vigiles and the people at stations (posts, drovers) counted in.
 */
export function crowdTarget(b: CrowdBudget, maxCrowd: number, stationPeople = 0): number {
  if (!b.night) return Math.min(maxCrowd, b.citizens);
  return Math.min(maxCrowd, Math.max(4, Math.min(b.citizens, NIGHT_CAP - b.vigiles - 2 - stationPeople)));
}

/** Phase multipliers on role weights (who is out when). */
const PHASE_MULT: Record<DayPhase, Partial<Record<CrowdRoleId, number>>> = {
  predawn: { client: 2, porter: 1.5, citizen: 0.5, 'citizen-woman': 0.2, senator: 0, matron: 0, child: 0, elder: 0.2, reveler: 1, farmer: 2, traveller: 1.2 },
  salutatio: { senator: 1.5, porter: 1.3, merchant: 1.4, child: 0.5, idler: 0.4, farmer: 1.5 },
  morning: {},
  midday: { idler: 1.6, senator: 0.4, matron: 0.6, artisan: 0.6 },
  afternoon: { senator: 0.7, idler: 1.3, child: 1.2 },
  evening: { senator: 0.3, matron: 0.3, priest: 0.5, vestal: 0.3, child: 0.4, reveler: 1, idler: 1.2 },
  night: { traveller: 0.3, citizen: 0.6, 'citizen-woman': 0.15, porter: 0.5, reveler: 3, senator: 0.15, matron: 0, child: 0, elder: 0.1, beggar: 0.6, priest: 0, vestal: 0, merchant: 0.2, artisan: 0.3, soldier: 0.6, foreigner: 0.3 },
};

/** Night-only roles and roles that never come from the mix. */
const NIGHT_ONLY = new Set<CrowdRoleId>(['reveler']);

/**
 * Weighted role list for a district at an hour, honouring each role's archetype schedule
 * (a role whose archetype is at home now gets weight 0, night roles included) and local boosts.
 */
export function roleWeights(
  district: District,
  hour: number,
  sun: SunTimes,
  boosts: Partial<Record<CrowdRoleId, number>> = {},
): [CrowdRoleId, number][] {
  const phase = dayPhase(hour, sun);
  const night = phase === 'night' || phase === 'predawn';
  const mult = PHASE_MULT[phase];
  const base: Partial<Record<CrowdRoleId, number>> = { ...district.weights };
  if (night) base.reveler = (base.reveler ?? 0) + 2;
  for (const id of Object.keys(boosts) as CrowdRoleId[]) base[id] ??= 0;
  const out: [CrowdRoleId, number][] = [];
  for (const [id, w0] of Object.entries(base) as [CrowdRoleId, number][]) {
    const role = CROWD_ROLES[id];
    if (!role || role.escortOnly || id === 'vigil') continue;
    if (NIGHT_ONLY.has(id) && !night) continue;
    let w = w0 * (mult[id] ?? 1);
    if (boosts[id] !== undefined) w = Math.max(w, (w0 || 1) * boosts[id]!);
    // The schedule decides who is out at all: a role whose archetype is at home now never spawns
    // (it would turn round and walk home at once, and the crowd would keep replacing it).
    if (!isOut(role.archetype, hour, sun)) w = 0;
    if (w > 0) out.push([id, w]);
  }
  return out;
}

export function pickRole(rng: Rng, weights: readonly [CrowdRoleId, number][]): CrowdRoleId | null {
  if (!weights.length) return null;
  return rng.weighted(weights);
}
