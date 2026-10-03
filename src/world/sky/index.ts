/**
 * Sky, time of day, weather, lighting and shadows. One call sets up the whole look:
 *
 *   import { installSky } from '../world/sky';
 *   const sky = installSky(game);               // also installs game.lights and post-processing
 *   sky.setWeather('rain', 20);
 *
 * Don't add your own sun/hemisphere lights or scene.fog when the sky is installed.
 */
import type { Game } from '../../core/Game';
import { installPostFX, type PostOptions } from '../../gfx/post';
import { installLightPool, type LightPoolOptions } from '../lights';
import { installSkyFog } from './fog';
import { installWetness } from './wet';
import { type SkyOptions, SkySystem } from './SkySystem';

export interface InstallSkyOptions extends SkyOptions {
  /** Install the light pool (game.lights). Default true. */
  lights?: boolean | LightPoolOptions;
  /** Install post-processing (game.post). Default true. */
  post?: boolean | PostOptions;
}

export function installSky(game: Game, opts: InstallSkyOptions = {}): SkySystem {
  if (game.sky) return game.sky;
  installSkyFog();
  installWetness();
  const sky = new SkySystem(game, opts);
  game.sky = sky;
  game.addSystem(sky);
  if (opts.lights !== false && !game.lights) installLightPool(game, typeof opts.lights === 'object' ? opts.lights : {});
  if (opts.post !== false && !game.post) installPostFX(game, typeof opts.post === 'object' ? opts.post : {});
  return sky;
}

export { SkySystem } from './SkySystem';
export type { SkyOptions } from './SkySystem';
export { WEATHER_STATES, WEATHER_PRESETS, type WeatherState, type WeatherParams } from './weather';
export { computeEphemeris, sunriseSunset, solarDeclination } from './astronomy';
export type { ShadowQuality, ShadowMode } from './shadows';
