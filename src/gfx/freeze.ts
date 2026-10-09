/**
 * Frozen matrices for static scenery. three.js recomposes every object's local matrix and
 * multiplies it into the world matrix every frame (`matrixAutoUpdate`), 10 k objects in the Forum
 * (half of them the crowd's bones, which really move): ~1.5 ms of the render submit. The meshes of
 * the static groups below never move, so once a group is in the scene each of its meshes gets
 * `matrixAutoUpdate = false` (its world matrix is computed first and stays valid; if a parent ever
 * did move, three.js still recomputes the world matrix from the frozen local one).
 *
 * Only groups known to be static are touched (by name); only meshes, never the groups themselves,
 * so a builder that later adds a child or moves a group keeps working. Anything that must move
 * after this ran has to set `matrixAutoUpdate = true` again.
 */
import * as THREE from 'three';
import type { Game, System } from '../core/Game';

/** Top-level scene children whose meshes are static: landmarks and their far stand-ins, dressing, trees. */
const STATIC_GROUPS = /^(landmark:|terrain-dressing$|grass$|forest|landmark-trees$|content:standins|city:trees$|capfora)|:far$/;

/** Freeze the meshes under `root` (their world matrices are brought up to date first). Returns how many. */
export function freezeMeshes(root: THREE.Object3D): number {
  root.updateMatrixWorld(true);
  let n = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.matrixAutoUpdate || (m as unknown as THREE.SkinnedMesh).isSkinnedMesh) return;
    m.matrixAutoUpdate = false;
    n++;
  });
  return n;
}

export class StaticFreeze implements System {
  readonly name = 'staticFreeze';
  readonly priority = 300;
  private readonly seen = new WeakSet<THREE.Object3D>();
  private tick = 0;
  frozen = 0;

  constructor(private readonly game: Game) {}

  lateUpdate() {
    // Streamed groups appear now and then: look twice a second.
    if (this.tick++ % 30 !== 0) return;
    for (const c of this.game.scene.children) {
      if (this.seen.has(c) || !STATIC_GROUPS.test(c.name)) continue;
      this.seen.add(c);
      this.frozen += freezeMeshes(c);
    }
  }
}

/** Add the freezer to the game (once). */
export function installStaticFreeze(game: Game) {
  if (!game.getSystem('staticFreeze')) game.addSystem(new StaticFreeze(game));
}
