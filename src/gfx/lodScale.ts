/**
 * The graphics tier's level-of-detail scale (High 1, Medium 0.75, Low 0.55; `lodScale` in
 * core/graphics.ts): every level-of-detail distance is multiplied by it, so a cheaper tier swaps in
 * the coarser version of a thing sooner. What follows it:
 *  - people (actors/avatar/lod.ts measures their distance divided by it): body and hair levels,
 *    the animation rates, the flat bone path, foot IK, and where they stop casting a shadow;
 *  - landmark twins and their shadow twins (world/landmarks/landmarkBatch.ts);
 *  - the shadow stand-ins of gfx/shadowLod.ts.
 * Readers divide the distance they measure by `lodScale.value` (or multiply their threshold): one
 * operation, nothing allocated. `installLodScale` keeps it in step with the settings, which the
 * graphics governor changes while playing.
 */
import type { Game } from '../core/Game';
import { lodScaleDefault } from '../core/graphics';

export const lodScale = { value: 1 };

/** Follow the settings' level-of-detail scale (once, at startup). */
export function installLodScale(game: Game) {
  const apply = () => {
    lodScale.value = Math.min(2, Math.max(0.25, lodScaleDefault(game.settings.data)));
  };
  apply();
  game.settings.onChange(apply);
}
