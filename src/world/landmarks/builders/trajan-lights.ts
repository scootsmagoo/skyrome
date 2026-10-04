/**
 * Lamps and fires of the Forum of Trajan complex: the altar fires and incense tripods of the
 * dedication, braziers at the gateway, bronze candelabra along the processional way, torches on
 * the tribunal, lamps in the basilica, the libraries and the Markets' shops and streets. The game
 * starts at 04:30, so this is what makes the complex readable (and inviting) before sunrise.
 *
 * Builders run before the sky installs the light pool (`game.lights`), so a builder collects its
 * lamps in a `Lamps` list (positions in the landmark's LOCAL frame) and `attach()`es it to its root
 * object; the lamps are requested once the pool exists, at the object's final world transform.
 * Each request costs one glow sprite (all sprites are one instanced draw call); only the nearest
 * few get a real PointLight.
 */
import * as THREE from 'three';
import type { Game, System } from '../../../core/Game';
import type { LightRequest } from '../../lights';

export type LampKind = 'torch' | 'candelabrum' | 'brazier' | 'altar' | 'lamp' | 'shrine' | 'interior';

/** Light presets per kind (warm flame colours; `night` lamps are lit from dusk to dawn). */
export const LAMP_PRESETS: Record<LampKind, Omit<LightRequest, 'position'>> = {
  torch: { color: 0xff8f40, intensity: 13, distance: 11, flicker: 0.45, night: true, glow: 0.3 },
  candelabrum: { color: 0xffa050, intensity: 9, distance: 10, flicker: 0.25, night: true, glow: 0.26 },
  brazier: { color: 0xff8a3a, intensity: 22, distance: 14, flicker: 0.5, glow: 0.5, priority: 1.3 },
  altar: { color: 0xff9040, intensity: 26, distance: 15, flicker: 0.55, glow: 0.6, priority: 1.5 },
  lamp: { color: 0xffa860, intensity: 4, distance: 6, flicker: 0.12, night: true, glow: 0.15, priority: 0.5 },
  shrine: { color: 0xffa050, intensity: 3, distance: 5, flicker: 0.2, glow: 0.13, priority: 0.4 },
  // Lamps in dark halls keep some light by day (the sky's indoor factor does the rest).
  interior: { color: 0xffa258, intensity: 8, distance: 10, flicker: 0.2, night: true, glow: 0.22, dayScale: 0.6 },
};

export interface Lamp extends Omit<LightRequest, 'position'> {
  kind: LampKind;
  /** Flame position in the landmark's local frame. */
  position: THREE.Vector3;
}

/** A builder's lamp list. */
export class Lamps {
  readonly list: Lamp[] = [];

  /** Add a flame at local position `p` (through the optional frame `m`). */
  add(kind: LampKind, p: THREE.Vector3, m?: THREE.Matrix4, extra: Partial<Omit<LightRequest, 'position'>> = {}): this {
    const position = m ? p.clone().applyMatrix4(m) : p.clone();
    this.list.push({ ...LAMP_PRESETS[kind], ...extra, kind, position });
    return this;
  }

  /** Hand the lamps to the light pool once it exists, at `root`'s world transform. */
  attach(game: Game | undefined, root: THREE.Object3D) {
    queueLamps(game, root, this.list);
  }
}

class LampQueue implements System {
  readonly name = 'trajanLamps';
  readonly priority = 105;
  private pending: { root: THREE.Object3D; lamps: Lamp[] }[] = [];

  constructor(private readonly game: Game) {}

  add(root: THREE.Object3D, lamps: Lamp[]) {
    this.pending.push({ root, lamps });
  }

  update() {
    const pool = this.game.lights;
    if (!this.pending.length || !pool) return;
    const p = new THREE.Vector3();
    for (const { root, lamps } of this.pending) {
      root.updateWorldMatrix(true, false);
      for (const { kind: _kind, position, ...req } of lamps) pool.request({ ...req, position: p.copy(position).applyMatrix4(root.matrixWorld) });
    }
    this.pending.length = 0;
  }
}

const queues = new WeakMap<object, LampQueue>();

/** Queue lamps (local to `root`) for the light pool; a no-op without a real game (unit tests). */
export function queueLamps(game: Game | undefined, root: THREE.Object3D, lamps: Lamp[]) {
  if (!lamps.length || !game || typeof game.addSystem !== 'function') return;
  let q = queues.get(game);
  if (!q) {
    q = new LampQueue(game);
    queues.set(game, q);
    game.addSystem(q);
  }
  q.add(root, lamps);
}
