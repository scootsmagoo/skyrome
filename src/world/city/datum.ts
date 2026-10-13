/**
 * The city's vertical datum: how far each kind of street surface lies above the terrain, and the
 * sidewalk height per block edge that follows from it. One place, so a street, the plaza it meets
 * and the floor of the house beside it agree to the centimetre (no 2-6 cm lips between them).
 *
 * Kerbs are KERB (core/traversal.ts) everywhere. A sidewalk's top is its street's lift plus the kerb;
 * a building's ground floor stands FLOOR_LIFT over `terrain + sidewalk` (see fill.ts / massing.ts),
 * so a block edge's `sidewalk` value is the sidewalk top minus FLOOR_LIFT.
 */
import { KERB } from '../../core/traversal';

/** Lifts above the terrain, so overlapping surfaces never fight (plus a polygon offset). */
export const LIFT = { road: 0.08, junction: 0.1, vicus: 0.07, lane: 0.055, alley: 0.05, piazza: 0.1 };

/** A building's ground floor above `terrain + sidewalk`. */
export const FLOOR_LIFT = 0.06;

/** Block-edge sidewalk values (plan.ts): by what the edge fronts. */
export const SIDEWALK = {
  /** An atlas road (carriageway between kerbs and raised sidewalks). */
  road: LIFT.road + KERB - FLOOR_LIFT,
  /** A vicus (paved minor street with narrow sidewalks). */
  street: LIFT.vicus + KERB - FLOOR_LIFT,
  /** A lane or an alley: no sidewalk, the house stands flush with the cobbles, gravel or dirt. */
  lane: LIFT.lane - FLOOR_LIFT,
  /** A piazza, plaza or open ground: flush with the paving. */
  other: LIFT.piazza - FLOOR_LIFT,
};

/**
 * The sidewalk a house's floor is set from. A house on a lane or alley keeps the floor it had when
 * every street edge counted a vicus's sidewalk: one proper step (~16 cm) up from the lane, rather than
 * a 3–12 cm lip. The ground in front of it is the lane's own (`SIDEWALK.lane`), so what stands there
 * (benches, a threshold step) sits on the cobbles or the dirt, not on a sidewalk that isn't there.
 */
export function floorSidewalk(sw: number): number {
  return Math.abs(sw - SIDEWALK.lane) < 1e-6 ? SIDEWALK.street : sw;
}

/** Top of a street's sidewalk above the terrain. */
export const sidewalkTop = (lift: number) => lift + KERB;
