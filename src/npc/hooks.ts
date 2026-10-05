/**
 * Soft links to services other crews own and declare themselves. They are read through structural
 * casts instead of `declare module` so the declarations never collide when the branches merge:
 *
 *   game.combat  — combat module: engage(a, b), isInCombat(a)
 *   game.streets — city module: street graph { nodes, edges, spots }
 */
import type { Actor } from '../actors/Actor';
import type { Game } from '../core/Game';
import type { StreetGraphLike } from '../ai/life/streets';

export interface CombatHook {
  /** Start a fight: `a` attacks `b`. */
  engage?(a: Actor, b: Actor): unknown;
  isInCombat?(a: Actor): boolean;
  /** Did the player start the fight (an assault on someone who wasn't an enemy)? */
  readonly playerAggressor?: boolean;
}

export function combatOf(game: Game): CombatHook | undefined {
  const c = (game as unknown as { combat?: CombatHook }).combat;
  return c && typeof c === 'object' ? c : undefined;
}

export function streetsOf(game: Game): StreetGraphLike | undefined {
  const s = (game as unknown as { streets?: StreetGraphLike }).streets;
  return s && typeof s === 'object' ? s : undefined;
}
