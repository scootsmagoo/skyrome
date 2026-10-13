/**
 * Installs `game.doors` (DoorSystem.ts). Runs before the world is built, so the city can hand over
 * the doors of the first blocks it details.
 */
import type { Game } from '../../core/Game';
import { DoorSystem } from './DoorSystem';

export function installDoors(game: Game): DoorSystem {
  if (!game.doors) game.doors = game.addSystem(new DoorSystem(game));
  return game.doors;
}
