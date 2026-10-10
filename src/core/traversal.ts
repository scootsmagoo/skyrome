/**
 * The traversal contract: one place for the heights a walker can climb, so the surfaces the city
 * builds, the character controller, the step-up assist and the NPC planner all agree.
 *
 *   KERB            the one kerb standard: a street's sidewalk stands this far above its gutter.
 *   STEP_ASSIST_MAX the highest ledge the Actor's step-up assist takes in stride (doorsteps, kerbs,
 *                   stair risers). The reliable limit: the planner and the builders stay under it.
 *   STEP_ASSIST_MIN under this the capsule's round bottom rides over by itself.
 *   AUTOSTEP_MAX    Rapier's own autostep (Physics.createCharacter). It reaches higher but stalls at
 *                   a lone kerb, so nothing is planned on it: it only smooths stair risers.
 *   SLOPE_WALK_MAX_DEG the steepest slope (degrees) a character climbs AND stands on (no slide); steeper slides.
 *   NAV_MAX_STEP    the biggest height change the NPC planner (NavGrid) accepts between cells.
 */
export const KERB = 0.15;
export const STEP_ASSIST_MAX = 0.3;
export const STEP_ASSIST_MIN = 0.09;
export const AUTOSTEP_MAX = 0.45;
export const AUTOSTEP_MIN_WIDTH = 0.15;
export const NAV_MAX_STEP = STEP_ASSIST_MAX;
export const SLOPE_WALK_MAX_DEG = 50;
