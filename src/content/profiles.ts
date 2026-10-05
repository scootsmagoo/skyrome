/**
 * Combat profiles for named content NPCs (NpcDef.combat), built from the RPG module's tier and
 * archetype data (GDD §6.11, §13.1) with the overrides of docs/CONTENT.md §5.2 (named fighters)
 * and §5.3 (the v0.1 bosses: Nereus, the Rex Cloacae).
 */
import { ITEMS } from '../rpg/data/items';
import { archetypeProfile, combatProfileFor, type ArchetypeOptions } from '../rpg/enemies';
import { ItemDb } from '../rpg/items';
import type { CombatProfile } from '../rpg/types';

const db = new ItemDb(ITEMS);

/** A §13.1 archetype's profile (tier stats + kit), with optional overrides. */
export function archetype(id: string, opts: ArchetypeOptions = {}, override: Partial<CombatProfile> = {}): CombatProfile {
  return { ...archetypeProfile(id, db, opts), ...override };
}

/** A bare tier profile (civilians, bystanders who only defend themselves). */
export function tier(id: string, override: Partial<CombatProfile> = {}): CombatProfile {
  return { ...combatProfileFor(id), ...override };
}

/** §5.2: bout 1 — a nervous tiro who over-commits his power attacks (so the player learns to parry). */
export const PULLUS_PROFILE: CombatProfile = archetype('murmillo', { tier: 'thug' }, {
  name: 'Pullus · tiro', health: 45, stamina: 60, armor: 0, armorFamily: 'cloth', worn: [], weapon: 'rudis', shield: 'scutum',
  skill: 15, poise: 30, reactionS: 0.45, blockSkill: 0.25, aggression: 0.5, yieldAt: 0.25, fleeAt: 0, loot: undefined,
});

/** §5.2: bout 2 — Auctus, thraex veteranus: low, hooking, a practice sica (ignores 25% of block). */
export const AUCTUS_PROFILE: CombatProfile = archetype('thraex', { tier: 'thug' }, {
  name: 'Auctus · thraex', health: 70, stamina: 90, armor: 10, armorFamily: 'cloth', worn: ['ocreae', 'manica-linea'], weapon: 'sica-lusoria', shield: 'parmula',
  skill: 30, poise: 40, reactionS: 0.4, blockSkill: 0.35, aggression: 0.6, attackIntervalS: 1.4, yieldAt: 0.25, fleeAt: 0, loot: undefined,
});

/** §5.2: Mus, the ex-thraex who leads the knife-men (dun-taberna-collapsa). Cornered: never flees. */
export const MUS_PROFILE: CombatProfile = archetype('grassator', { kit: 0 }, {
  tier: 'bruiser', name: 'Mus · the Mouse', health: 75, stamina: 90, armor: 6, armorFamily: 'cloth', worn: ['tunica', 'cucullus'], weapon: 'sica-muris',
  skill: 35, poise: 50, reactionS: 0.4, blockSkill: 0.3, aggression: 0.7, yieldAt: 0.2, fleeAt: 0, dmgMult: 1, loot: 'body.npc-mus',
});

/** §5.2: the mq-01 tutorial pair (A opens with a light chain; B waits 3 s, then a long power wind-up). */
export function mq01GrassatorProfile(which: 'a' | 'b'): CombatProfile {
  return archetype('grassator', { kit: which === 'a' ? 0 : 1 }, { name: which === 'a' ? 'Grassator with a knife' : 'Grassator with a cudgel', skill: 15, poise: 30, reactionS: 0.45, blockSkill: 0.15, aggression: 0.55, yieldAt: 0.25, fleeAt: 0.15 });
}

/**
 * boss-nereus (GDD §13.2, CONTENT.md §5.3): a lusio with practice arms. 300 HP, AR 7 (manica and
 * greave), the blunted trident and the net, a practice dagger in P3; skill 60, poise 150, reaction
 * 0.25 s, block 0.45 (weapon only; the galerus covers the left), phases at 75% and 45%, yields at 15%.
 */
export const NEREUS_PROFILE: CombatProfile = {
  // §13.2 gives 300 HP; 260 keeps the fight in its 3–6 minutes for a new character (playtests).
  ...combatProfileFor('boss', { health: 260, armor: 7 }),
  name: 'Nereus · Retiarius, victor of 31',
  archetype: 'retiarius',
  armorFamily: 'cloth',
  weapon: 'tridens-lusorius',
  shield: 'galerus',
  ranged: 'rete',
  worn: ['manica-linea', 'ocrea'],
  skill: 60,
  poise: 150,
  reactionS: 0.25,
  // GDD §13.2 says 0.45; at that he parries and ripostes a first-time player off the sand
  // (agent playtests: 0 wins in 10 while the warm-up bouts fell in seconds).
  blockSkill: 0.3,
  attackIntervalS: 2.1,
  tokensCost: 2,
  speedMult: 1.05,
  // A lusio: his blows are the blunted practice trident's (GDD §13.2 gives no boss multiplier).
  dmgMult: 1,
  yieldAt: 0.15,
  fleeAt: 0,
  loot: undefined,
};

/** boss-rex-cloacae (GDD §13.2, CONTENT.md §5.3): 350 HP, AR 14 padded, gladius and pugio; sluice at 50%. */
export const REX_CLOACAE_PROFILE: CombatProfile = {
  ...combatProfileFor('boss', { health: 350, armor: 14 }),
  name: 'Saturninus · Rex Cloacae',
  armorFamily: 'padded',
  weapon: 'gladius',
  worn: ['thorax-coriaceus'],
  skill: 60,
  poise: 150,
  reactionS: 0.25,
  blockSkill: 0.5,
  attackIntervalS: 1.6,
  tokensCost: 1,
  speedMult: 1,
  yieldAt: 0,
  fleeAt: 0,
  loot: 'body.npc-rex-cloacae',
};
