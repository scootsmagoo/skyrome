/**
 * Who a spawn request makes (pure: no scene, physics or DOM, so tests can check it).
 *
 * Callers ask in their own words: the combat dev scene with `lusio`, quest content (src/content)
 * with `practice`, `brawl`, `yieldAt`, `tags`, `quest`, a named NPC (`npc`) and a `boss` id; the
 * NPC module by engaging an actor it already placed. This turns any of them into one archetype
 * spec, profile, look, team and opener.
 */
import type { Appearance } from '../actors/appearance';
import type { CombatProfile } from '../rpg/types';
import type { ItemDb } from '../rpg/items';
import { archetypeProfile, combatProfileFor } from '../rpg/enemies';
import { ENEMIES, QUEST_OPENERS, enemySpec, practice, type EnemySpec, type Opener } from './archetypes';

/** A named NPC definition, read structurally (src/npc/types.ts NpcDef). */
export interface NpcLike {
  id?: string;
  name?: string;
  title?: string;
  appearance?: Appearance;
  faction?: string;
  essential?: boolean;
  combat?: CombatProfile;
  disposition?: 'hostile' | 'neutral' | 'friendly';
  tags?: string[];
}

export interface SpawnRequest {
  /** Requested archetype ('grassator', 'murmillo', 'retiarius'…). */
  archetype: string;
  /** Boss id from §13.2 ('boss-nereus'); wins over the archetype when known. */
  boss?: string;
  tier?: string;
  kit?: number;
  /** Practice arms: the dev scene says `lusio`, quest content says `practice`. */
  lusio?: boolean;
  practice?: boolean;
  /** A rixa: non-lethal by rule (§6.9). */
  brawl?: boolean;
  /** Override the yield threshold (fraction of health). */
  yieldAt?: number;
  /** Hostile to the player at once (default: as the archetype is). */
  hostile?: boolean;
  /** Echoed in 'actor:killed'. */
  tags?: string[];
  quest?: string;
  name?: string;
  /** The named NPC this fighter is (its look, name, title, profile, essential flag). */
  npc?: NpcLike;
  /**
   * The stat block the caller wants (quest content: the mq-01 pair, named gladiators). It wins over
   * the archetype's and the NPC definition's numbers; practice arms and `yieldAt` apply on top.
   */
  profile?: CombatProfile;
  opener?: Opener;
}

export interface ResolvedSpawn {
  spec: EnemySpec;
  profile: CombatProfile;
  lusio: boolean;
  brawl: boolean;
  name: string;
  title?: string;
  appearance?: Appearance;
  essential: boolean;
  team: string;
  group?: string;
  hostile: boolean;
  lawful: boolean;
  tags: string[];
  opener: Opener | null;
  /** Attach Nereus' script (the net, phases). */
  nereus: boolean;
}

/** A knife thug for anything unknown: the city's commonest enemy, with the requested name. */
function fallbackSpec(id: string): EnemySpec {
  return { ...ENEMIES.grassator, id, name: id.charAt(0).toUpperCase() + id.slice(1) };
}

/**
 * Resolve a request. `questIndex` is how many fighters of this quest were spawned before (for the
 * quest openers of archetypes.ts).
 */
export function resolveSpawn(req: SpawnRequest, items: ItemDb, questIndex = 0): ResolvedSpawn {
  const bossSpec = req.boss ? ENEMIES[req.boss] : undefined;
  const spec = bossSpec ?? enemySpec(req.archetype) ?? fallbackSpec(req.archetype);
  const qo = req.quest ? QUEST_OPENERS[req.quest] : undefined;
  const scripted = qo && qo.archetype === spec.id ? qo.seq[questIndex % qo.seq.length] : undefined;
  const lusio = req.lusio ?? req.practice ?? !!spec.defaults?.lusio;
  const o = { ...spec.defaults, tier: req.tier, kit: req.kit ?? scripted?.kit, lusio };
  let profile = spec.profile(items, o);
  // A named NPC's own stat block (docs/CONTENT.md §5.2) replaces the archetype's numbers.
  if (req.npc?.combat) profile = practice({ ...profile, ...req.npc.combat, archetype: profile.archetype ?? req.npc.combat.archetype }, o);
  // The caller's own stat block (content's profiles) wins over both.
  if (req.profile) profile = practice({ ...profile, ...req.profile, archetype: req.profile.archetype ?? profile.archetype }, o);
  if (req.yieldAt !== undefined) profile = { ...profile, yieldAt: req.yieldAt };
  const nereus = spec.id === 'boss-nereus' || profile.archetype === 'boss-nereus';
  const tags = [...(req.tags ?? [])];
  if (req.quest && !tags.includes(req.quest)) tags.push(req.quest);
  return {
    spec,
    profile,
    lusio,
    brawl: req.brawl ?? !!spec.brawl,
    name: req.name ?? req.npc?.name ?? spec.name,
    title: req.npc?.title ?? spec.title,
    appearance: req.npc?.appearance,
    essential: !!req.npc?.essential,
    team: spec.team,
    group: spec.group,
    hostile: req.hostile ?? spec.team === 'hostile',
    lawful: !!spec.lawful,
    tags,
    opener: req.opener ?? scripted?.opener ?? null,
    nereus,
  };
}

/** Factions that keep the peace (their people answer calls against an aggressor). */
const LAW = new Set(['vigiles', 'cohortes-urbanae', 'praetoriani', 'law']);

export interface AdoptHints {
  /** The actor's own definition (an NPC module's `def`), if it has one. */
  npc?: NpcLike;
  /** Hostile to the player (an NPC module's flag). */
  hostile?: boolean;
  essential?: boolean;
  faction?: string;
  name?: string;
}

export interface Adoption {
  profile: CombatProfile;
  team: string;
  group?: string;
  lawful: boolean;
  essential: boolean;
  name: string;
  title?: string;
}

/**
 * A combat identity for an actor another module placed (an NPC the player picks a fight with, a
 * guard who steps in): its definition's profile when it has one, otherwise by its faction (watch,
 * soldiers) or a civilian who defends himself (§6.11 tiers). Its team is its faction, so allies
 * answer its calls for help.
 */
export function adoptProfile(id: string, items: ItemDb, h: AdoptHints = {}): Adoption {
  const npc = h.npc;
  const faction = h.faction ?? npc?.faction;
  let profile: CombatProfile;
  if (npc?.combat) profile = npc.combat;
  else if (faction === 'vigiles') profile = archetypeProfile('vigil', items, { kit: 1 });
  else if (faction === 'cohortes-urbanae') profile = archetypeProfile('miles-urbanus', items);
  else if (faction === 'praetoriani') profile = archetypeProfile('praetorianus', items);
  else if (h.hostile || npc?.disposition === 'hostile') profile = archetypeProfile('grassator', items, { kit: 1 });
  else profile = combatProfileFor('civilian', { kit: 0 });
  const lawful = !!faction && LAW.has(faction);
  return {
    profile,
    team: lawful ? 'law' : faction ? `faction:${faction}` : h.hostile ? 'hostile' : `npc:${id}`,
    group: faction,
    lawful,
    essential: !!(h.essential ?? npc?.essential),
    name: h.name ?? npc?.name ?? profile.name ?? id,
    title: npc?.title,
  };
}
