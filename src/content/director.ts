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
  /** Owning quest id. */
  quest?: string;
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
