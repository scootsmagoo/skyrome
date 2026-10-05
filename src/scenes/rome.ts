/**
 * The game: Rome, AD 113 (?scene=rome, the default scene).
 *
 * The boot flow lives in src/game (docs/modules/flow.md). A plain link skips the menus and starts
 * the default character in the Forum by the Rostra at 10:00 (the shareable test build).
 *
 *   &menu=1             the full flow: loading, the title over the live city, character creation,
 *                       and the spawn at the Porta Capena on 11 May 113 at 04:30
 *   &quick=1            default character at the Porta Capena, no menus (agents and tests)
 *   &at=<landmark id>   no menus, spawn near that atlas landmark (add &menu=1 for the title)
 *   &hour=<0-24>        start hour (quick mode) · &origin=<id> · &sex=female · &extent=city
 */
import type { Game } from '../core/Game';
import { romeParams, startRome } from '../game/boot';
import type { SceneDef } from './types';

const scene: SceneDef = {
  title: 'Rome',
  description: 'Rome, AD 113 — the game world',
  async setup(game: Game, ui: HTMLElement) {
    await startRome(game, ui, romeParams(location.search));
  },
};
export default scene;
