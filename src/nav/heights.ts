/**
 * Heights for route and marker targets that have none: a point or a place given only as x and z (y = 0 or
 * missing) stands on the nav grid's floor there when the grid is built (a podium, a deck, a raised square), else on
 * the terrain (`heightAt`). The quest route's arrival test (|Δy| < 3 m) and the HUD's 3D distances need it: a target
 * at y = 0 on raised ground was never "arrived" at (phase 4b, RC5: 17 targets).
 */
import type { Game } from '../core/Game';

/** A height that says nothing (0 is what the content writes when it means "on the ground"). */
export function missingY(y: number | undefined | null): boolean {
  return y === undefined || y === null || !Number.isFinite(y) || y === 0;
}

/** The standing height at (x, z): the nav grid's floor when built there, else the terrain, else 0. */
export function standingY(game: Game, x: number, z: number): number {
  const grid = game.population?.grid;
  if (grid?.ready(x, z)) {
    const f = grid.floorAt(x, z);
    if (f !== null && Number.isFinite(f)) return f;
  }
  return game.heightmap?.heightAt(x, z) ?? 0;
}

/**
 * Where a marker on a bare point should stand: on its own spot when that is walkable, else on the nearest walkable
 * cell the player can reach within `r` m (a post drawn just behind a wall, or inside a stall), once the grid is built
 * there. Null when there is nothing better (the grid is not built there, or nothing walkable is near).
 */
export function walkableNear(game: Game, x: number, z: number, r = 6): { x: number; z: number } | null {
  const grid = game.population?.grid;
  if (!grid?.ready(x, z)) return null;
  if (grid.walkable(x, z) && grid.reachable(x, z)) return null;
  return grid.nearestWalkable(x, z, r, { x: 0, z: 0 }, true);
}
