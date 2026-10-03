/**
 * VegetationSystem: advances the shared wind clock and runs LOD / culling for every Forest and
 * GrassField after the camera has been placed. One per game: `vegetation(game)` gets or creates it.
 */
import type { Game, System } from '../../core/Game';
import type { Forest } from './Forest';
import type { GrassField } from './Grass';
import { windTime } from './materials';

declare module '../../core/Game' {
  interface Game {
    vegetation: VegetationSystem;
  }
}

export class VegetationSystem implements System {
  readonly name = 'vegetation';
  /** After the camera rig (100) so LOD uses this frame's camera. */
  readonly priority = 105;
  private forests: Forest[] = [];
  private grass: GrassField[] = [];

  constructor(private readonly game: Game) {}

  addForest(f: Forest) {
    this.forests.push(f);
    f.update(this.game.camera.position, true);
    return f;
  }

  addGrass(g: GrassField) {
    this.grass.push(g);
    g.update(this.game.camera.position);
    return g;
  }

  update(dt: number) {
    windTime.value += dt;
  }

  lateUpdate() {
    const cam = this.game.camera.position;
    for (const f of this.forests) f.update(cam);
    for (const g of this.grass) g.update(cam);
  }
}

export function vegetation(game: Game): VegetationSystem {
  if (!game.vegetation) game.vegetation = game.addSystem(new VegetationSystem(game));
  return game.vegetation;
}
