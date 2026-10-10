/** Registry of live actors; interpolates their visuals every frame. */
import * as THREE from 'three';
import type { Game, System } from '../core/Game';
import type { Actor } from './Actor';
import { avatarLod } from './avatar/lod';
import { stepRealBuilds } from './avatar/real/RealBody';

/**
 * Milliseconds a frame for the avatars' LOD builds made ahead of need (a stage at least while any
 * is queued): a person walking up builds their detailed body over a few frames, not in one 15–25 ms
 * hitch (perf audit, October 2026).
 */
const BUILD_BUDGET_MS = 3;

declare module '../core/Game' {
  interface Game {
    actors: ActorSystem;
  }
}

export class ActorSystem implements System {
  readonly name = 'actors';
  readonly priority = 50;
  /** The animation LOD (toggle `lod.disabled` at runtime for A/B runs). */
  readonly lod = avatarLod;
  private list: Actor[] = [];
  private byId = new Map<string, Actor>();

  constructor(private readonly game: Game) {}

  add<T extends Actor>(a: T): T {
    this.list.push(a);
    this.byId.set(a.id, a);
    return a;
  }

  remove(a: Actor) {
    this.list = this.list.filter((x) => x !== a);
    this.byId.delete(a.id);
    a.dispose();
  }

  get(id: string): Actor | undefined {
    return this.byId.get(id);
  }

  all(): readonly Actor[] {
    return this.list;
  }

  /** Actors within `radius` of a point (xz distance), nearest first. */
  near(p: THREE.Vector3Like, radius: number, filter?: (a: Actor) => boolean): Actor[] {
    const r2 = radius * radius;
    const out: [number, Actor][] = [];
    for (const a of this.list) {
      const dx = a.position.x - p.x;
      const dz = a.position.z - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 <= r2 && (!filter || filter(a))) out.push([d2, a]);
    }
    return out.sort((x, y) => x[0] - y[0]).map((x) => x[1]);
  }

  update(dt: number, alpha: number) {
    // The animation LOD tests each avatar against this frame's view frustum.
    avatarLod.beginFrame();
    for (const a of this.list) a.syncVisual(alpha, dt);
    const t0 = performance.now();
    stepRealBuilds(BUILD_BUDGET_MS);
    this.game.backgroundMs += performance.now() - t0;
  }
}
