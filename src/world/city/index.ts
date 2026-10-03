/** City fabric over Rome: roads, blocks of insulae/domus/shops, walls, aqueducts, gardens, trees.
 *  STUB — the city module implements it. `extent` matches buildRome's. */
import type { Game } from '../../core/Game';
import type * as Atlas from '../../data/atlas';
import type { Heightmap } from '../terrain/heightmap';

export async function buildCity(
  _game: Game,
  _atlas: typeof Atlas,
  _hm: Heightmap,
  _opts: { extent: 'core' | 'city'; onProgress?: (f: number, label: string) => void },
): Promise<void> {}
