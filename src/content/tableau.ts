/**
 * Tableau: static, non-interactive figures for staged scenes (a ceremony, a tableau the player
 * watches). Each figure is an Actor, like the Forum extras: a solid capsule with a procedural
 * humanoid, registered with `game.actors` so it animates. Figures never think or talk; a scene
 * drives them with `walk` (kinematic, in fixed steps, facing the way it goes), `face`, `loop`
 * and `remove`.
 *
 * The figure factory is injectable, so the walk and bookkeeping can be tested without WebGL.
 *
 * Known gap: a figure is a HumanoidAvatar actor that is not in the combat core, so
 * `CombatSystem.adoptable()` can still pull it into a fight (a blow from the player or a nearby
 * brawl). The Forum extras have the same exposure. Setting `canMove = false` would stop the walk
 * (`locomote` refuses), so figures stay movable. Keeping them out of combat needs a flag that
 * `adoptable()` checks, which lives in CombatSystem and is not made here.
 */
import { Actor, type IdleLoop } from '../actors/Actor';
import type { Appearance, WeaponModel } from '../actors/appearance';
import { createHumanoid } from '../actors/avatar/HumanoidAvatar';
import { randomAppearance, type AvatarRole } from '../actors/avatar/variants';
import type { Game } from '../core/Game';
import { Layer } from '../core/Physics';
import { Rng } from '../core/Rng';
import { headingFromDir } from '../core/math';
import { stageTicker } from './sequence';

export interface FigureDef {
  id: string;
  role?: AvatarRole;
  appearance?: Appearance;
  x: number;
  /**
   * Feet height. Default: the first surface below (x, z) searching down from high up, so pass `y`
   * explicitly where a roof or upper gallery is overhead, or the figure can snap onto it.
   */
  y?: number;
  z: number;
  heading: number;
  loop?: IdleLoop;
  weapon?: WeaponModel;
}

/** Builds and frees the Actors behind figures. Tests inject a stub. */
export interface FigureFactory {
  create(def: FigureDef, at: { x: number; y: number; z: number }): Actor | null;
  destroy(actor: Actor): void;
}

/** Walking figures stop this close to their mark (m). */
const ARRIVE = 0.1;
/** Slow-down distance: inside it the wish speed falls to 3 × distance. */
const EASE = 3;
/** A walk that has not arrived after this many times its ideal duration (plus 3 s) ends anyway. */
const SLACK = 3;

interface Walk {
  to: { x: number; z: number };
  speed: number;
  then: IdleLoop | undefined;
  /** Seconds left before the walk is cut short. */
  left: number;
}

/** The default factory: a procedural humanoid in an Actor, registered with `game.actors`. */
export function avatarFigureFactory(game: Game): FigureFactory {
  return {
    create(def, at) {
      const app = def.appearance ?? randomAppearance(new Rng(`tableau:${def.id}`), def.role ?? 'plebeian-man');
      const avatar = createHumanoid(app, { lod: 'auto', weapon: def.weapon });
      avatar.setIdleLoop(def.loop ?? 'stand');
      const actor = new Actor(game, { id: `tableau:${def.id}`, position: at, heading: def.heading, layer: Layer.Npc, avatar });
      // Starts on its feet. Walks move it through `locomote`, so it is movable, not frozen.
      actor.grounded = true;
      // A staged figure, never adopted into a fight (CombatSystem.adoptable).
      (actor as Actor & { staged?: boolean }).staged = true;
      return game.actors.add(actor);
    },
    destroy(actor) {
      game.actors?.remove(actor);
    },
  };
}

export class Tableau {
  private readonly figures = new Map<string, Actor>();
  private readonly walks = new Map<string, Walk>();
  private readonly factory: FigureFactory;
  private readonly off: () => void;
  private disposed = false;

  constructor(
    private readonly game: Game,
    factory?: FigureFactory,
  ) {
    this.factory = factory ?? avatarFigureFactory(game);
    this.off = stageTicker(game).add({ fixed: (dt) => this.step(dt) });
  }

  /** Add a figure (an existing figure with the same id is replaced). Returns null after `dispose()`. */
  add(def: FigureDef): Actor | null {
    if (this.disposed) return null;
    this.remove(def.id);
    const y = def.y ?? this.groundAt(def.x, def.z);
    const actor = this.factory.create(def, { x: def.x, y, z: def.z });
    if (!actor) return null;
    actor.heading = def.heading;
    this.figures.set(def.id, actor);
    return actor;
  }

  /**
   * Walk a figure to a point at `speed` m/s (kinematic, fixed steps), facing the way it goes.
   * On arrival it switches to `then` (if given). A new walk replaces the old one.
   */
  walk(id: string, to: { x: number; z: number }, speed = 1.4, then?: IdleLoop): void {
    const a = this.figures.get(id);
    if (!a) return;
    const v = Math.max(speed, 0.1);
    const d = Math.hypot(to.x - a.position.x, to.z - a.position.z);
    this.walks.set(id, { to: { x: to.x, z: to.z }, speed: v, then, left: (d / v) * SLACK + 3 });
  }

  face(id: string, heading: number): void {
    const a = this.figures.get(id);
    if (a) a.heading = heading;
  }

  loop(id: string, loop: IdleLoop): void {
    const a = this.figures.get(id);
    if (a) setLoop(a, loop);
  }

  remove(id: string): void {
    this.walks.delete(id);
    const a = this.figures.get(id);
    if (!a) return;
    this.figures.delete(id);
    this.factory.destroy(a);
  }

  clear(): void {
    for (const id of [...this.figures.keys()]) this.remove(id);
  }

  get(id: string): Actor | undefined {
    return this.figures.get(id);
  }

  /** Remove every figure and stop ticking. */
  dispose(): void {
    this.disposed = true;
    this.clear();
    this.off();
  }

  private groundAt(x: number, z: number): number {
    return this.game.physics?.groundHeight(x, z) ?? 0;
  }

  private step(dt: number) {
    for (const [id, w] of this.walks) {
      const a = this.figures.get(id);
      if (!a || a.disposed) {
        this.walks.delete(id);
        continue;
      }
      const dx = w.to.x - a.position.x;
      const dz = w.to.z - a.position.z;
      const d = Math.hypot(dx, dz);
      w.left -= dt;
      if (d <= ARRIVE || w.left <= 0) {
        this.walks.delete(id);
        a.velocity.set(0, 0, 0);
        if (w.then) setLoop(a, w.then);
        continue;
      }
      a.heading = headingFromDir(dx, dz);
      const sp = Math.min(w.speed, d * EASE);
      a.locomote({ x: (dx / d) * sp, y: 0, z: (dz / d) * sp }, dt);
    }
  }
}

function setLoop(a: Actor, loop: IdleLoop) {
  (a.avatar as { setIdleLoop?(l: IdleLoop | null): void } | null)?.setIdleLoop?.(loop);
}
