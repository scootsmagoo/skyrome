import type { Game } from '../core/Game';

/** A bootable scene: the real game ("rome") or a dev test bed. Files in src/scenes/*.ts that
 *  default-export a SceneDef are discovered automatically and selectable with ?scene=<file name>. */
export interface SceneDef {
  title: string;
  /** Short description for the scene picker. */
  description?: string;
  /** Build the world, add systems, place the player. `ui` is the DOM overlay root. */
  setup(game: Game, ui: HTMLElement): Promise<void> | void;
}
