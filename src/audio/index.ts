/**
 * Audio module entry point.
 *
 *   import { installAudio } from '../audio';
 *   const audio = installAudio(game);          // game.audio
 *   audio.ambience.setBase({ city: 1, birds: 0.6 });
 *   audio.music.setState('explore');
 *   audio.footsteps.attach(game.player, { surfaceAt, spatial: () => game.player.viewMode === 'third', voice: 'm' });
 *
 * Other modules can also request sounds without importing anything:
 *   game.events.emit('sfx', { id: 'door.open', position });
 */
import type { Game } from '../core/Game';
import { AudioEngine } from './AudioEngine';

declare module '../core/Game' {
  interface Game {
    audio: AudioEngine;
  }
}

/** Create the audio engine (idempotent) and register it as a system. */
export function installAudio(game: Game): AudioEngine {
  if (game.audio) return game.audio;
  const engine = new AudioEngine(game);
  game.audio = engine;
  game.addSystem(engine);
  return engine;
}

export { AudioEngine, BUSES, type LoopHandle, type LoopOptions, type PlayOptions, type VoiceHandle } from './AudioEngine';
export { AmbienceDirector, type Zone, type ZoneOptions } from './Ambience';
export { FootstepDriver, cadence, type FootstepOptions, type Surface, SURFACES } from './FootstepDriver';
export { MusicDirector, type MusicRequest } from './music/MusicDirector';
export { MUSIC_STATES, type MusicState } from './music/styles';
export { LOOPS, SOUNDS } from './bank';
export { swingIdForSpeed } from './sounds/combat';
export type { ReverbPreset } from './dsp/reverb';
