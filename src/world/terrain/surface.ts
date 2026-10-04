/**
 * Footstep surfaces from splat weights (pure). `Terrain.surfaceAt` reports the dominant drawn
 * layer; `footstepSound` maps it onto the audio module's footstep banks.
 */
import { L, LAYER_COUNT } from './splat';

export type Surface = 'grass' | 'dirt' | 'rock' | 'paved' | 'sand' | 'water' | 'gravel' | 'mud';

const BY_LAYER: Surface[] = [];
BY_LAYER[L.grass] = 'grass';
BY_LAYER[L.dry] = 'grass';
BY_LAYER[L.dirt] = 'dirt';
BY_LAYER[L.rock] = 'rock';
BY_LAYER[L.sand] = 'sand';
BY_LAYER[L.mud] = 'mud';
BY_LAYER[L.gravel] = 'gravel';
BY_LAYER[L.basalt] = 'paved';
BY_LAYER[L.travertine] = 'paved';

/** The surface of the strongest layer (grass and dry grass count together). */
export function surfaceForWeights(w: ArrayLike<number>): Surface {
  let best = -1;
  let bi = 0;
  for (let i = 0; i < LAYER_COUNT; i++) {
    const v = i === L.grass ? w[L.grass] + w[L.dry] : i === L.dry ? -1 : w[i];
    if (v > best) {
      best = v;
      bi = i;
    }
  }
  return BY_LAYER[bi];
}

/** Audio footstep bank for a terrain surface (src/audio/sounds/footsteps.ts SURFACES). */
export function footstepSound(s: Surface): 'stone' | 'dirt' | 'grass' | 'gravel' | 'water' {
  switch (s) {
    case 'paved':
    case 'rock':
      return 'stone';
    case 'grass':
      return 'grass';
    case 'gravel':
    case 'sand':
      return 'gravel';
    case 'water':
      return 'water';
    default:
      return 'dirt';
  }
}
