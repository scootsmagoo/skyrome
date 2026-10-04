/**
 * Entry point the game flow looks for (src/game/optional.ts): installs the NPC life module, i.e.
 * `game.population` (crowds, named NPCs on schedules, barks, vignettes, night carts).
 *
 *   ?scene=rome&npcs=0      no NPC life at all
 *   &crowd=0 | &crowd=2     no ambient crowd | twice the crowd
 *   &vignettes=0            no street scenes
 *
 * Only one `install…` function is exported here: the flow calls every one it finds.
 */
import type { Game } from '../core/Game';
import { installNpcs as install, type NpcManager, type NpcManagerOptions } from './NpcManager';

export function installPopulation(game: Game, opts: NpcManagerOptions = {}): NpcManager | null {
  const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  if (q.get('npcs') === '0') return null;
  return install(game, opts);
}
