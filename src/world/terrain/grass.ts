/**
 * Grass tufts and wildflowers on the terrain near the camera (the vegetation kit's GrassField),
 * only where the splat draws grass: not on roads, paving, trodden earth, river mud or rock. Two
 * fields, one of green and one of sun-dried tufts, each accepting a tuft with the probability of
 * its layer's share at that spot, so the tufts match the ground under them.
 * Opt-in (the city / vegetation modules decide where Rome gets grass); the terrain dev scene uses it.
 *
 *   addTerrainGrass(game, game.terrain, { density: 2 });
 */
import type { Game } from '../../core/Game';
import { GrassField, vegetation, type GrassOptions } from '../../arch/vegetation';
import { L, LAYER_COUNT } from './splat';
import type { Terrain } from './Terrain';

const frac = (v: number) => v - Math.floor(v);
/** Deterministic 0..1 per position (so a cell regenerates identically). */
const spotHash = (x: number, z: number) => frac(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453);

export function addTerrainGrass(game: Game, terrain: Terrain, opts: Partial<GrassOptions> & { minGrass?: number } = {}): GrassField[] {
  const hm = terrain.hm;
  const w = new Float32Array(LAYER_COUNT);
  const minGrass = opts.minGrass ?? 0.6;
  const fields: GrassField[] = [];
  for (const dry of [false, true]) {
    const field = new GrassField(
      { minX: hm.minX, minZ: hm.minZ, maxX: hm.maxX, maxZ: hm.maxZ },
      {
        heightAt: (x, z) => hm.heightAt(x, z),
        mask: (x, z) => {
          const ww = terrain.weightsAt(x, z, w);
          const g = ww[L.grass] + ww[L.dry];
          if (g < minGrass) return false;
          const greenShare = ww[L.grass] / g;
          return dry ? spotHash(x, z) >= greenShare : spotHash(x, z) < greenShare;
        },
        density: 1.8,
        flowers: dry ? 0.12 : 0.3,
        dryness: dry ? 1 : 0,
        fadeStart: 22,
        fadeEnd: 38,
        seed: dry ? 37 : 21,
        ...opts,
      },
    );
    game.scene.add(field.build());
    vegetation(game).addGrass(field);
    fields.push(field);
  }
  return fields;
}
