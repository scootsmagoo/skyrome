/**
 * World extras that landmark builders can't put into their merged mesh: real trees (instanced
 * vegetation `Forest`s with their own LOD) and lamps/fires in the light pool.
 *
 * Builders run while Rome is assembled, before the sky (and so `game.lights`) is installed, and a
 * builder only knows its LOCAL frame. So `plant()` and `lamp()` convert the point to world space
 * from the landmark's atlas centre, bearing and pad height (exactly as `buildLandmarks` places the
 * object) and queue it; one small system flushes the queue: lights as soon as the light pool
 * exists, trees in one Forest once the landmarks have stopped adding any for a moment (so the
 * whole city's monument trees share a handful of instanced draws instead of one set per landmark).
 */
import * as THREE from 'three';
import type { Game, System } from '../../../core/Game';
import { bearingToRotationY } from '../../../core/math';
import type { Draw } from '../../../arch/fabric/draw';
import { Forest } from '../../../arch/vegetation/Forest';
import type { TreeSpecies } from '../../../arch/vegetation/species';
import { vegetation } from '../../../arch/vegetation/system';
import { toGame } from '../../coords';
import type { LandmarkBuilder, LandmarkContext } from '../types';

/** Helpers only (the registry glob imports every file in builders/). */
export const builders: LandmarkBuilder[] = [];

interface QueuedTree {
  species: TreeSpecies;
  p: THREE.Vector3;
  scale: number;
  rot: number;
}

export interface LampOptions {
  /** 'lamp': lit at dusk, out at dawn (street lamps, torches). 'fire': always burning (braziers, altars, forges). */
  kind?: 'lamp' | 'fire';
  intensity?: number;
  distance?: number;
  color?: number;
  flicker?: number;
  priority?: number;
  glow?: number;
}

interface QueuedLamp extends LampOptions {
  p: THREE.Vector3;
}

const SETTLE_MS = 600;

class LandmarkExtras implements System {
  readonly name = 'landmarkExtras';
  readonly priority = 96;
  trees: QueuedTree[] = [];
  lamps: QueuedLamp[] = [];
  lastAdd = 0;
  forests = 0;

  constructor(private readonly game: Game) {}

  /** lateUpdate also runs while the game is paused (title screen, loading). */
  lateUpdate() {
    const g = this.game;
    if (this.lamps.length && g.lights) {
      for (const l of this.lamps) {
        g.lights.request({
          position: l.p,
          color: l.color ?? 0xff8f40,
          intensity: l.intensity ?? 14,
          distance: l.distance ?? 11,
          flicker: l.flicker ?? 0.4,
          night: (l.kind ?? 'lamp') === 'lamp',
          priority: l.priority ?? 1,
          glow: l.glow ?? 0.32,
        });
      }
      this.lamps = [];
    }
    if (this.trees.length && performance.now() - this.lastAdd > SETTLE_MS) {
      const f = new Forest({ castShadow: true, seed: 113 + this.forests++ });
      for (const t of this.trees) f.add(t.species, t.p.x, t.p.y, t.p.z, { scale: t.scale, rotationY: t.rot });
      this.trees = [];
      const group = f.build();
      group.name = 'landmark-trees';
      g.scene.add(group);
      vegetation(g).addForest(f);
    }
  }
}

function extras(game: Game): LandmarkExtras | null {
  // Unit tests build landmarks with a stub game: nothing to queue into.
  if (!game || typeof (game as Partial<Game>).addSystem !== 'function') return null;
  let sys = game.getSystem<LandmarkExtras>('landmarkExtras');
  if (!sys) sys = game.addSystem(new LandmarkExtras(game));
  return sys;
}

/** World position of a point given in the landmark's local frame (as buildLandmarks places it). */
export function landmarkToWorld(ctx: LandmarkContext, local: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
  const [gx, gz] = toGame(ctx.lm.center[0], ctx.lm.center[1]);
  const hm = (ctx.game as Partial<Game> & { heightmap?: { heightAt(x: number, z: number): number } }).heightmap;
  const baseY = hm ? hm.heightAt(gx, gz) : 0;
  const r = bearingToRotationY(ctx.lm.rotation);
  const c = Math.cos(r), s = Math.sin(r);
  return out.set(gx + local.x * c + local.z * s, baseY + local.y, gz - local.x * s + local.z * c);
}

/**
 * Plant a real tree at (x, y, z) in the frame `d` (y = the ground under it). `scale` 1 = the species'
 * natural size (umbrella pine ≈ 14 m, cypress ≈ 12 m, plane ≈ 15 m).
 */
export function plant(ctx: LandmarkContext, d: Draw, species: TreeSpecies, x: number, y: number, z: number, scale = 1) {
  const sys = extras(ctx.game);
  if (!sys) return;
  const p = landmarkToWorld(ctx, d.point(x, y, z));
  sys.trees.push({ species, p, scale: scale * ctx.rng.range(0.88, 1.12), rot: ctx.rng.range(0, Math.PI * 2) });
  sys.lastAdd = performance.now();
}

/** Register a light (torch, lamp, brazier) at (x, y, z) in the frame `d`. The flame geometry is the caller's. */
export function lamp(ctx: LandmarkContext, d: Draw, x: number, y: number, z: number, o: LampOptions = {}) {
  const sys = extras(ctx.game);
  if (!sys) return;
  sys.lamps.push({ ...o, p: landmarkToWorld(ctx, d.point(x, y, z)) });
}

/** A wall torch: iron bracket, pitch-soaked head with a flame, and its light. Wall face at z, facing −z. */
export function wallTorch(ctx: LandmarkContext, d: Draw, x: number, y: number, z: number, rotY = 0) {
  const f = d.at(x, y, z, rotY);
  f.box('iron', 0, 0, -0.04, 0.1, 0.32, 0.08);
  f.rod('iron', V(0, -0.05, -0.04), V(0, 0.18, -0.36), 0.022, 4);
  f.cyl('wood_dark', 0, 0.3, -0.38, 0.045, 0.42, 5, { rx: -0.25 });
  f.cyl('black', 0, 0.52, -0.43, 0.07, 0.14, 6, { rx: -0.25 });
  f.cyl('glow_fire', 0, 0.68, -0.46, 0.08, 0.24, 6, { rTop: 0.01 });
  lamp(ctx, f, 0, 0.75, -0.48, { kind: 'lamp', intensity: 14, distance: 11, flicker: 0.45 });
}

/** A bronze brazier on a tripod with live coals (always burning). */
export function brazier(ctx: LandmarkContext, d: Draw, x: number, y: number, z: number, h = 1.0) {
  const f = d.at(x, y, z);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    f.rod('bronze', V(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3), V(Math.cos(a) * 0.16, h, Math.sin(a) * 0.16), 0.025, 4);
  }
  f.cyl('bronze', 0, h + 0.06, 0, 0.32, 0.14, 10, { rTop: 0.38, collide: true });
  f.cyl('glow_fire', 0, h + 0.15, 0, 0.27, 0.06, 8);
  f.cyl('glow_fire', 0, h + 0.32, 0, 0.16, 0.34, 6, { rTop: 0.01 });
  lamp(ctx, f, 0, h + 0.5, 0, { kind: 'fire', intensity: 30, distance: 14, flicker: 0.5, glow: 0.55, priority: 1.4 });
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const NATURAL_HEIGHT: Partial<Record<TreeSpecies, number>> = { umbrella_pine: 16.4, cypress: 12.4, plane: 16.9, olive: 4.8, laurel: 7.1, fig: 5.4, oleander: 2.2 };

/** A real tree of about `height` metres (scaled from the species' natural size) — see `plant`. */
export function tree(ctx: LandmarkContext, d: Draw, species: TreeSpecies, x: number, y: number, z: number, height: number) {
  plant(ctx, d, species, x, y, z, height / (NATURAL_HEIGHT[species] ?? 10));
}
