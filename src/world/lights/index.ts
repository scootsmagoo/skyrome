/** Pooled point lights + glow sprites. See LightPool.ts. */
import type { Game } from '../../core/Game';
import { LightPool, type LightPoolOptions } from './LightPool';

export function installLightPool(game: Game, opts: LightPoolOptions = {}): LightPool {
  if (game.lights) return game.lights;
  const pool = new LightPool(game, opts);
  game.lights = pool;
  game.addSystem(pool);
  return pool;
}

export { LightPool } from './LightPool';
export type { LightHandle, LightPoolOptions, LightRequest } from './LightPool';
export { dayLightScale, flicker, lampLevel } from './logic';
