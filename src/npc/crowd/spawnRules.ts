/**
 * Where and how many late arrivals the crowd director may spawn (pure; NpcManager asks these).
 *
 * Streets: on a straight open street nothing hides a spawn, so a rule of "only out of sight"
 * leaves the road ahead empty once the first crowd has walked past. People may therefore appear
 *  - out of the frustum to the side (they walk into view),
 *  - in the frustum behind a building (they step out from behind it),
 *  - in the frustum but far away (≥ 50 m: a person is a few pixels tall there), walking toward
 *    the player, so the street ahead keeps filling as the player walks along it,
 *  - behind the camera when the player is standing still (they overtake and walk into view).
 *
 * Caps: people walking home still stand in the street, so they count toward the cap; at night the
 * cap is hard (AC-10: ≤ 25 people about).
 */

export const LANE_SPAWN = {
  /** In view and at least this far: small enough to appear unnoticed (m). */
  farInView: 50,
  /** In view but hidden behind something: at least this far (m). */
  hiddenMin: 22,
  /** Out of view to the side: up to this much beyond the half field of view (rad). */
  sideExtra: 1.1,
  /** Behind the camera (player standing still): at least this far (m). */
  behindMin: 25,
  /** "Standing still" below this ground speed (m/s). */
  stillSpeed: 1.0,
  /** Street spawn radius by day / at night outside the squares (m). */
  radiusDay: 80,
  radiusNight: 70,
};

export interface LaneSpawnQuery {
  /** Distance from the player (m). */
  d: number;
  /** In the camera frustum. */
  inView: boolean;
  /** Not hidden behind world geometry (a ray from the camera); only asked when in view and near. */
  seen: () => boolean;
  /** Angle between the point's bearing from the player and the view direction (rad). */
  offView: number;
  /** Horizontal half field of view (rad). */
  halfFov: number;
  /** The player's ground speed (m/s). */
  playerSpeed: number;
}

export type LaneSpawnVerdict = 'far' | 'hidden' | 'side' | 'behind' | null;

/** May a late arrival appear at this street point? Null = no; otherwise why it may. */
export function laneSpawnVerdict(q: LaneSpawnQuery): LaneSpawnVerdict {
  if (q.inView) {
    if (q.d >= LANE_SPAWN.farInView) return 'far';
    if (q.d >= LANE_SPAWN.hiddenMin && !q.seen()) return 'hidden';
    return null;
  }
  if (q.offView <= q.halfFov + LANE_SPAWN.sideExtra) return 'side';
  if (q.playerSpeed < LANE_SPAWN.stillSpeed && q.d >= LANE_SPAWN.behindMin) return 'behind';
  return null;
}

/**
 * The ring a street spawn is drawn from on try `i`: every other try only the far part of the ring
 * (where in-view spawns are allowed), so an open street ahead gets its share.
 */
export function laneSpawnRing(i: number, initial: boolean, radius: number, spawnMin: number): [number, number] {
  if (initial) return [5, radius];
  if (i % 2 === 1 && radius > LANE_SPAWN.farInView + 5) return [LANE_SPAWN.farInView, radius];
  return [spawnMin, radius];
}

/**
 * How many more ambient citizens may spawn now. `present` counts everyone in the crowd budget
 * (people walking home included: they are still in the street), `active` only those not leaving.
 * By day a small margin lets people who head home be replaced before they vanish; at night the
 * cap is hard.
 */
export function crowdRoom(present: number, active: number, target: number, night: boolean): number {
  const margin = night ? 0 : Math.max(3, Math.round(target * 0.1));
  return Math.max(0, Math.min(target - active, target + margin - present));
}

/** Station posts this far from the player or more are staffed even in plain view (m). */
export const STATION_SEEN_SPAWN = 45;
