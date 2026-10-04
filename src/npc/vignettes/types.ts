/**
 * Ambient vignettes (GDD §12.3 tier 3): small scripted scenes that play out near the player every
 * 15–30 s by day and 30–60 s at night — a sacrifice, a scuffle, a procession, a dog stealing a
 * sausage, a pot thrown from a window (Juvenal 3.268–77)…
 *
 * A vignette is a plan (where, with whom) plus a generator script. The script yields cues:
 *   yield 2.5          wait 2.5 s
 *   yield () => cond   wait until cond() is true (the director also enforces a timeout)
 *   yield 0            wait one frame (for hand-animated things: dogs, pots)
 * Cast members are ambient NPCs taken from the crowd (or spawned out of sight) and handed back
 * when the scene ends or aborts.
 */
import type * as THREE from 'three';
import type { Appearance } from '../../actors/appearance';
import type { Game } from '../../core/Game';
import type { Rng } from '../../core/Rng';
import type { NavService } from '../../ai/life/nav';
import type { LifeContext } from '../brain';
import type { Poi, PoiKind } from '../crowd/districts';
import type { CrowdRoleId } from '../crowd/roles';
import type { Npc } from '../Npc';
import type { WallProbe } from '../spots';

export type Cue = number | (() => boolean);

export interface VignetteContext {
  readonly game: Game;
  readonly rng: Rng;
  readonly nav: NavService;
  readonly life: LifeContext;
  /** Seconds since the last frame (for hand-animated objects). */
  readonly dt: number;
  readonly now: number;
  readonly night: boolean;
  /** The Lemuria night: from sunset of the festival day (9, 11 or 13 May, first elapsed day) to sunrise. */
  readonly lemuria: boolean;
  /** Temple cellae are shut today (the Lemuria day): no rites before temples, compita only. */
  readonly templesShut: boolean;
  readonly player: THREE.Vector3;
  /** Camera forward on the ground plane (unit). */
  readonly look: { x: number; z: number };
  /** Ambient NPCs free for a part near a point, nearest first. */
  free(x: number, z: number, r: number, filter?: (n: Npc) => boolean): Npc[];
  /** Spawn an ambient NPC of a role at a point (null if over budget). */
  spawn(role: CrowdRoleId, x: number, z: number, heading?: number, opts?: { appearance?: Appearance; escorts?: boolean }): Npc | null;
  /** Remove an NPC from the world at once (ghosts, thieves gone round a corner). */
  vanish(npc: Npc): void;
  /** Take an NPC into this scene (scripted until released). */
  cast(npc: Npc): Npc;
  /** Give a cast member back to normal life early. */
  release(npc: Npc): void;
  /** Speak a line as an NPC (subtitle; bypasses the bark rationing gap). */
  say(npc: Npc | string, text: string): void;
  sfx(id: string, pos: THREE.Vector3Like): void;
  floorY(x: number, z: number): number | null;
  /** Add an object to the scene; removed automatically when the vignette ends. */
  addObject(o: THREE.Object3D): THREE.Object3D;
  /** Run a cleanup function when the vignette ends. */
  onEnd(fn: () => void): void;
  wallProbe: WallProbe;
  isVisible(x: number, y: number, z: number): boolean;
  /** A walkable point near (x, z), or null. */
  snap(x: number, z: number, r?: number): { x: number; z: number } | null;
  /** Atlas points of interest near a point (empty in test beds that aren't Rome). */
  pois(x: number, z: number, r: number, kind?: PoiKind | readonly PoiKind[]): Poi[];
}

export interface VignettePlan {
  x: number;
  z: number;
  /** Heading the scene faces (e.g. toward a temple). */
  face: number;
  data?: Record<string, unknown>;
}

export interface VignetteDef {
  id: string;
  /** 'day', 'night' or 'any'. */
  when: 'day' | 'night' | 'any';
  /** Relative chance among eligible vignettes. */
  weight: number;
  /** Seconds before the same vignette may run again. */
  cooldown: number;
  plan(ctx: VignetteContext): VignettePlan | null;
  run(ctx: VignetteContext, plan: VignettePlan): Generator<Cue, void, unknown>;
}
