/**
 * Small runtime helpers quest content uses to stage its scenes without depending on modules that
 * are built in parallel: spawning enemies (through `game.combat`, when it exists), subtitles,
 * "examine" interactables, positions of named places and the time of day.
 *
 * Everything degrades to a no-op: in unit tests and in dev scenes without combat, UI or a world,
 * the helpers do nothing and every quest stays drivable by events alone ('actor:killed',
 * 'actor:yielded', 'dialogue:node', 'location:entered', 'content:interact').
 */
import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { CombatProfile } from '../rpg/types';
import { festivalsOn } from './barks';
import { Placer } from './ground';

declare module '../core/Events' {
  interface GameEvents {
    /** A content interactable was used ("Examine the crack", "Search the drain"). Quests listen for it. */
    'content:interact': { id: string };
    /**
     * A staged story beat other modules may act on: the NPC/combat side plays deaths, flights and
     * cheers for the named actors ('courier-knifed', 'grassatores-flee', 'crowd-cheers'…).
     */
    'content:beat': { questId: string; beat: string; actors?: string[]; at?: string };
    /**
     * The missio of a lusio was decided (lud-01, bout 3): `spared` true = "Mitte!". The combat/arena
     * side emits it when it runs its own yield prompt; the quest also offers the choice in dialogue.
     */
    'content:missio': { spared: boolean };
  }
}

/** Options content passes when it asks the combat module for an enemy. */
export interface SpawnOptions {
  /** Stable actor id, so 'actor:killed' / 'actor:yielded' can be matched (also the NPC def id when `npc` is unset). */
  id: string;
  /** Named NPC definition (src/npc/content) for name, appearance and profile, if any. */
  npc?: string;
  /** Display name for unnamed foes. */
  name?: string;
  /** Quest tags, echoed back in 'actor:killed'.tags when the combat side supports it. */
  tags?: string[];
  /** Practice arms (lusio, §6.10): 0 HP is a knockout, never a death. */
  practice?: boolean;
  /** A fist fight (rixa, §6.9): non-lethal by rule; drawing a blade turns it into assault. */
  brawl?: boolean;
  /** Boss id from GDD §13.2 ('boss-nereus'). */
  boss?: string;
  /** Override the archetype's yield threshold (fraction of HP). */
  yieldAt?: number;
  /** Hostile at once (default true). */
  hostile?: boolean;
  /** Combat team (sides of a brawl: fighters on one team never strike each other). */
  team?: string;
  /** Owning quest id. */
  quest?: string;
  /** Attack hostiles on sight within this radius (0 = only when told). */
  aggro?: number;
  /** Call-for-help group (allies of a group join each other's fights). */
  group?: string;
  /**
   * The stat block the content wants (src/content/profiles.ts: the mq-01 tutorial pair, Mus, the
   * named gladiators); combat may use it instead of the archetype's default tier.
   */
  profile?: CombatProfile;
}

type Vec3 = { x: number; y?: number; z: number };

interface CombatLike {
  spawnEnemy?(archetype: string, position: THREE.Vector3, opts?: SpawnOptions): unknown;
  /** Turn an NPC already in the world into a foe (a fan who starts a brawl, a sparring partner). */
  engage?(actorId: string, opts?: Omit<SpawnOptions, 'id'>): boolean | void;
}

/** The combat service if it exists (it is declared by the combat module; read structurally here). */
function combat(game: Game): CombatLike | undefined {
  return (game as unknown as { combat?: CombatLike }).combat;
}

/** World position of a named place (location registry), on open street level, or null. */
export function placePosition(game: Game, id: string): THREE.Vector3 | null {
  const l = game.locations?.get(id);
  if (!l) return null;
  return streetPoint(game, l.position);
}

/**
 * The nearest point to `p` where a person can stand in the open: out of solid buildings (a place
 * id may name a temple or the Meta Sudans, whose centre is masonry) and off roofs and podiums
 * (src/content/ground.ts). Enemies, moved NPCs and examine points go through it.
 */
export function streetPoint(game: Game, p: Vec3): THREE.Vector3 {
  const s = new Placer(game).find(p.x, p.z, { clearance: 0.4, claim: 0 });
  return new THREE.Vector3(s.x, s.y + 0.05, s.z);
}

/**
 * A point at street level (heightmap, then a short physics probe from 2.5 m above it, then the given
 * y). The probe is short on purpose: a long one would land on the roof of a building whose footprint
 * covers the spot, and a prompt or an enemy would float up there.
 */
export function groundAt(game: Game, p: Vec3): THREE.Vector3 {
  let y = p.y ?? 0;
  const hm = (game as unknown as { heightmap?: { heightAt(x: number, z: number): number } }).heightmap;
  if (hm) y = hm.heightAt(p.x, p.z);
  const ground = game.physics?.groundHeight?.(p.x, p.z, y + 2.5, 6);
  if (typeof ground === 'number' && Number.isFinite(ground)) y = ground;
  return new THREE.Vector3(p.x, y + 0.05, p.z);
}

/**
 * Ask the combat module for an enemy of an archetype (§13.1 ids: 'grassator', 'thraex',
 * 'retiarius'…) at a place id or point, `offset` meters east/south of it. Returns the actor id to
 * listen for (the spawned actor's own id when the combat side returns one), or null when nothing
 * could spawn (no combat module yet, unknown place).
 */
export function spawnEnemy(game: Game, archetype: string, at: string | Vec3, opts: SpawnOptions, offset: { x?: number; z?: number } = {}): string | null {
  const c = combat(game);
  if (!c?.spawnEnemy) return null;
  const base = typeof at === 'string' ? placePosition(game, at) : groundAt(game, at);
  if (!base) return null;
  const pos = streetPoint(game, { x: base.x + (offset.x ?? 0), y: base.y, z: base.z + (offset.z ?? 0) });
  try {
    const actor = c.spawnEnemy(archetype, pos, { hostile: true, ...opts }) as { id?: unknown } | null | undefined;
    return typeof actor?.id === 'string' ? actor.id : opts.id;
  } catch (err) {
    console.error(`[content] spawnEnemy(${archetype}) failed`, err);
    return null;
  }
}

/** True when an actor with this id exists in the world (the NPC/combat side spawned it). */
export function actorExists(game: Game, id: string): boolean {
  return !!game.actors?.get?.(id);
}

/** Move an actor already in the world (an NPC the population module spawned) to a named place. */
export function moveActor(game: Game, id: string, to: string | Vec3, offset: { x?: number; z?: number } = {}): boolean {
  const actor = game.actors?.get?.(id);
  if (!actor || typeof actor.teleport !== 'function') return false;
  const base = typeof to === 'string' ? placePosition(game, to) : groundAt(game, to);
  if (!base) return false;
  const p = streetPoint(game, { x: base.x + (offset.x ?? 0), y: base.y, z: base.z + (offset.z ?? 0) });
  actor.teleport({ x: p.x, y: p.y, z: p.z });
  return true;
}

interface PopulationLike {
  get?(id: string): unknown;
  kill?(npc: unknown): void;
  direct?(npc: unknown, x: number, z: number, speed: number, arrive?: number): boolean;
  undirect?(npc: unknown): void;
  pose?(npc: unknown, loop: string | null, face?: number | null): boolean;
}

function population(game: Game): PopulationLike | undefined {
  return (game as unknown as { population?: PopulationLike }).population;
}

/**
 * Walk a named NPC (already in the world) to a place or point: Festus walking to the gate beside
 * the player. They stay scripted until `release`. False when there is no such NPC about.
 */
export function walkTo(game: Game, npcId: string, to: string | Vec3, speed = 1.25, offset: { x?: number; z?: number } = {}): boolean {
  const pop = population(game);
  const npc = pop?.get?.(npcId);
  if (!npc || !pop?.direct) return false;
  const base = typeof to === 'string' ? placePosition(game, to) : groundAt(game, to);
  if (!base) return false;
  const p = streetPoint(game, { x: base.x + (offset.x ?? 0), y: base.y, z: base.z + (offset.z ?? 0) });
  return pop.direct(npc, p.x, p.z, speed, 1.2);
}

/** Hold a named NPC in an idle loop where they are ('sleep' = lying on the ground, wounded). */
export function holdPose(game: Game, npcId: string, loop: string | null): boolean {
  const pop = population(game);
  const npc = pop?.get?.(npcId);
  return !!npc && !!pop?.pose?.(npc, loop, null);
}

/** Give a scripted NPC back to its own life. */
export function release(game: Game, npcId: string) {
  const pop = population(game);
  const npc = pop?.get?.(npcId);
  if (npc) pop?.undirect?.(npc);
}

interface RunnerCombat {
  get?(id: string): { march?: { x: number; z: number; speed: number } | null; position: THREE.Vector3 } | undefined;
  despawn?(c: unknown): void;
}

/**
 * Someone who does a deed and runs (the hooded killer at the gate): a non-hostile fighter spawned
 * at `from` who sprints to `to` and is gone when he gets there (or after `ttl` seconds). The
 * player sees him go; he isn't a target. Returns false without a combat module.
 */
export function runner(game: Game, archetype: string, from: string | Vec3, to: string | Vec3, opts: Omit<SpawnOptions, 'hostile'>, offset: { x?: number; z?: number } = {}, ttl = 14): boolean {
  // Nobody's ally and nobody's foe: he doesn't join the fight he leaves behind.
  const id = spawnEnemy(game, archetype, from, { aggro: 0, group: `runner:${opts.id}`, team: `runner:${opts.id}`, ...opts, hostile: false }, offset);
  const c = combat(game) as (CombatLike & RunnerCombat) | undefined;
  const body = id ? c?.get?.(id) : undefined;
  const goal = typeof to === 'string' ? placePosition(game, to) : groundAt(game, to);
  if (!body || !goal) return false;
  body.march = { x: goal.x, z: goal.z, speed: 5 };
  const t0 = Date.now();
  const tick = () => {
    const b = c?.get?.(id!);
    if (!b) return;
    const there = Math.hypot(b.position.x - goal.x, b.position.z - goal.z) < 2.5;
    if (there || Date.now() - t0 > ttl * 1000) c?.despawn?.(b);
    else setTimeout(tick, 400);
  };
  if (typeof setTimeout === 'function') setTimeout(tick, 400);
  return true;
}

/**
 * A scripted death (Festus under the arch): the population module's `kill` when it has the NPC,
 * so the body stays and the registry remembers; else just announce the death for the quests and
 * the save. Always emits 'actor:killed' with the 'scripted' tag.
 */
export function scriptedDeath(game: Game, id: string, killerId?: string) {
  const pop = (game as unknown as { population?: PopulationLike }).population;
  const npc = pop?.get?.(id);
  try {
    if (npc && pop?.kill) pop.kill(npc);
  } catch (err) {
    console.error(`[content] scriptedDeath(${id}) failed`, err);
  }
  game.events.emit('actor:killed', { victimId: id, killerId, tags: ['scripted'] });
}

/**
 * A named NPC becomes a foe: if the NPC module already has the actor in the world, ask combat to
 * `engage` it; otherwise spawn it from its archetype with the NPC's look. Returns the actor id to
 * listen for, or null when there is no combat module yet.
 */
export function fight(game: Game, npcId: string, archetype: string, at: string | Vec3, opts: Omit<SpawnOptions, 'id' | 'npc'> = {}, offset: { x?: number; z?: number } = {}): string | null {
  const c = combat(game);
  if (!c) return null;
  // A staged fight (a boss, an arena bout) needs its fighter at the spot, with the boss's script
  // and the bout's crowd: the NPC living in the world steps out while it plays them.
  const staged = !!(opts.boss || opts.practice);
  const pop = (game as unknown as { population?: { holdNamed?(id: string): () => void } }).population;
  // Held whether or not they have spawned yet: a bout started right after loading must not see
  // the resident appear a moment later beside the fighter playing them.
  if (staged && pop?.holdNamed) {
    const hold = pop.holdNamed(npcId);
    const id = spawnEnemy(game, archetype, at, { ...opts, id: npcId, npc: npcId }, offset);
    if (!id) {
      hold();
      return null;
    }
    const clear = opts.practice ? clearFloor(game, at) : () => {};
    releaseWhenGone(game, id, () => (hold(), clear()));
    return id;
  }
  if (actorExists(game, npcId)) {
    if (c.engage) {
      try {
        if (c.engage(npcId, { hostile: true, ...opts }) !== false) return npcId;
      } catch (err) {
        console.error(`[content] engage(${npcId}) failed`, err);
      }
    }
    // The NPC stands in the world but combat can't turn it: spawn a stand-in with its own id.
    return spawnEnemy(game, archetype, at, { ...opts, id: `${npcId}~foe`, npc: npcId }, offset);
  }
  return spawnEnemy(game, archetype, at, { ...opts, id: npcId, npc: npcId }, offset);
}

/** How far from the centre of an arena bout everyone else stands back (m). */
export const BOUT_CLEAR_RADIUS = 10;

interface CrowdLike {
  resolveLocation?(id: string): { x: number; z: number } | null;
  near?(p: { x: number; y: number; z: number }, r: number): { id: string; position: { x: number; z: number }; isFighting(): boolean }[];
  direct?(npc: unknown, x: number, z: number, speed: number, arrive?: number): boolean;
  undirect?(npc: unknown): void;
  nav?: { snap(x: number, z: number, r?: number): { x: number; z: number } };
}

/**
 * An arena bout clears the sand: everyone else within `BOUT_CLEAR_RADIUS` of the centre walks out
 * to the ring's edge (straight away from the centre) and watches from there until the returned
 * release lets them go back to their day. Without it the Ludus regulars drill right inside the
 * fight, in the way of every swing.
 */
export function clearFloor(game: Game, at: string | Vec3): () => void {
  const pop = (game as unknown as { population?: CrowdLike }).population;
  const c = typeof at === 'string' ? pop?.resolveLocation?.(at) : at;
  if (!pop?.near || !pop.direct || !c) return () => {};
  const moved: unknown[] = [];
  for (const n of pop.near({ x: c.x, y: 0, z: c.z }, BOUT_CLEAR_RADIUS)) {
    if (n.isFighting()) continue;
    let dx = n.position.x - c.x;
    let dz = n.position.z - c.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.5) (dx = 1), (dz = 0);
    else (dx /= d), (dz /= d);
    const r = BOUT_CLEAR_RADIUS + 1.5;
    const to = pop.nav?.snap(c.x + dx * r, c.z + dz * r, 3) ?? { x: c.x + dx * r, z: c.z + dz * r };
    if (pop.direct(n, to.x, to.z, 2.4, 0.8)) moved.push(n);
  }
  return () => {
    for (const n of moved) pop.undirect?.(n);
  };
}

/** Call `release` once the fighter `id` has left combat for good (despawned). */
function releaseWhenGone(game: Game, id: string, release: () => void) {
  const core = (game as unknown as { combat?: { core?: { get(id: string): unknown } } }).combat?.core;
  if (!core) return release();
  const timer = setInterval(() => {
    if (core.get(id)) return;
    clearInterval(timer);
    release();
  }, 2000);
}

/** Show a subtitle line (barks, shouts, the crowd) when a UI is listening. */
export function say(game: Game, speaker: string, text: string, duration?: number) {
  game.events.emit('ui:subtitle', { speaker, text, duration });
}

/** Announce a staged beat for other modules (see 'content:beat'). */
export function beat(game: Game, questId: string, name: string, extra: { actors?: string[]; at?: string } = {}) {
  game.events.emit('content:beat', { questId, beat: name, ...extra });
}

// ------------------------------------------------------------------ examine points

const placed = new Map<string, () => void>();

export interface ExamineSpec {
  /** Interactable id, echoed in 'content:interact'. */
  id: string;
  /** Place id (location registry) or point. */
  at: string | Vec3;
  verb?: string;
  label: string;
  /** Height of the prompt point above the ground (default 1.2 m). */
  height?: number;
  reach?: number;
  offset?: { x?: number; z?: number };
}

/**
 * Put an "examine" interactable in the world (a crack, a drain grate, a bean pot). Using it emits
 * 'content:interact' { id } and removes it. No-op without the interaction system or the place.
 */
export function placeExamine(game: Game, spec: ExamineSpec): boolean {
  removeExamine(spec.id);
  const inter = game.interactions;
  if (!inter?.add) return false;
  const base = typeof spec.at === 'string' ? placePosition(game, spec.at) : groundAt(game, spec.at);
  if (!base) return false;
  const foot = streetPoint(game, { x: base.x + (spec.offset?.x ?? 0), y: base.y, z: base.z + (spec.offset?.z ?? 0) });
  const pos = new THREE.Vector3(foot.x, foot.y + (spec.height ?? 1.2), foot.z);
  const target = {
    id: `content:${spec.id}`,
    reach: spec.reach ?? 2.5,
    position: () => pos,
    verb: () => spec.verb ?? 'Examine',
    label: () => spec.label,
    interact: (g: Game) => {
      removeExamine(spec.id);
      g.events.emit('content:interact', { id: spec.id });
    },
  };
  placed.set(spec.id, inter.add(target) as () => void);
  return true;
}

export function removeExamine(id: string) {
  const off = placed.get(id);
  if (off) {
    placed.delete(id);
    off();
  }
}

// ------------------------------------------------------------------ time of day

/** Game hour 0..24 (8 when there is no clock). */
export function hourOf(game: Game): number {
  return game.time?.hour ?? 8;
}

/**
 * "Dusk or later" for v0.1 meetings: from 19:00 (sunset on 11 May is about 19:06) until the fourth
 * watch ends at dawn (04:30).
 */
export function isDusk(game: Game): boolean {
  const h = hourOf(game);
  return h >= 19 || h < 4.5;
}

/** The Lemuria midnight rite window: 23:00–02:00. */
export function isLemuriaMidnight(game: Game): boolean {
  const h = hourOf(game);
  return h >= 23 || h < 2;
}

/** Festival ids of the current calendar day (see barks.ts festivalsOn). */
export function todaysFestivals(game: Game): string[] {
  const d = game.time?.date?.();
  return d ? festivalsOn(d.month, d.day) : [];
}

/**
 * Temple cellae are shut (the Lemuria, §14.10): the calendar's hook when it reports so, else the
 * Lemuria dates themselves. Podium strongrooms and compitum shrines stay open.
 */
export function templesShut(game: Game): boolean {
  if (game.rpg?.hooks?.templesClosed?.()) return true;
  return todaysFestivals(game).includes('fest-lemuria');
}

/** The skill of the weapon in the player's hand (fists: brawling). */
export function wieldedSkill(game: Game): string {
  const inv = game.player?.inventory;
  const id = inv?.equipped?.('mainHand');
  const def = id ? game.items?.get(id) : undefined;
  return def?.weapon?.skill ?? 'brawling';
}

/** A HUD hint (tutorial line). */
export function hint(game: Game, text: string) {
  game.events.emit('rpg:notify', { text, kind: 'info' });
}
