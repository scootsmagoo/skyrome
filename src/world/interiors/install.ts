/**
 * installInteriors(game): the interior-cell service (game.interiors). Installed for the Rome game
 * before the optional modules (src/game/boot.ts), so the content and the quests find it.
 *
 * Cell defs are registered by the modules in this folder: any export named register…Interiors
 * (e.g. registerColumnInteriors in columna.ts) is called once with the game. The modules are
 * found with import.meta.glob, so a folder without them installs an empty service.
 */
import type { Game } from '../../core/Game';
import { InteriorSystem } from './InteriorSystem';

type Mod = Record<string, unknown>;

const cellModules = import.meta.glob<Mod>(['./columna.ts'], { eager: true });

/** Install the interior service (idempotent). Returns it, also as game.interiors. */
export function installInteriors(game: Game): InteriorSystem {
  if (game.interiors) return game.interiors;
  const sys = game.addSystem(new InteriorSystem(game));
  game.interiors = sys;
  for (const mod of Object.values(cellModules)) {
    for (const [name, fn] of Object.entries(mod)) {
      if (/^register\w*Interiors$/.test(name) && typeof fn === 'function') (fn as (g: Game) => void)(game);
    }
  }
  return sys;
}
