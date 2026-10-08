/**
 * The games (src/arena): installed with the NPC life module (src/npc/install.ts), since the show
 * steers the crowd round the Colosseum. `?munus=0` turns it off.
 */
import type { Game } from '../core/Game';
import type { NpcManager } from '../npc/NpcManager';
import { MunusDirector } from './MunusDirector';

export function installArena(game: Game, pop: NpcManager | null): MunusDirector | null {
  const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  if (q.get('munus') === '0') return null;
  const d = new MunusDirector(game, pop);
  game.munus = d;
  game.addSystem(d);
  return d;
}
