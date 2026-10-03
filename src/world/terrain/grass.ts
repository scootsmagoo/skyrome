/**
 * Grass tufts and wildflowers on the terrain near the camera (the vegetation kit's GrassField),
 * only where the splat draws grass: not on roads, paving, trodden earth, river mud or rock.
 * Opt-in (the city / vegetation modules decide where Rome gets grass); the terrain dev scene uses it.
 *
 *   addTerrainGrass(game, game.terrain, { density: 1.4 });
 */
import type { Game } from '../../core/Game';
import { GrassField, vegetation, type GrassOptions } from '../../arch/vegetation';
import { L, LAYER_COUNT } from './splat';
import type { Terrain } from './Terrain';

export function addTerrainGrass(game: Game, terrain: Terrain, opts: Partial<GrassOptions> & { minGrass?: number } = {}): GrassField {
  const hm = terrain.hm;
  const w = new Float32Array(LAYER_COUNT);
  const minGrass = opts.minGrass ?? 0.6;
  const field = new GrassField(
    { minX: hm.minX, minZ: hm.minZ, maxX: hm.maxX, maxZ: hm.maxZ },
    {
      heightAt: (x, z) => hm.heightAt(x, z),
      mask: (x, z) => {
        const ww = terrain.weightsAt(x, z, w);
        return ww[L.grass] + ww[L.dry] > minGrass;
      },
      density: 2.2,
      flowers: 0.35,
      dryness: 0.5,
      fadeStart: 22,
      fadeEnd: 38,
      ...opts,
    },
  );
  game.scene.add(field.build());
  vegetation(game).addGrass(field);
  return field;
}
