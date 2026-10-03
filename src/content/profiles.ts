/**
 * Combat profiles for named content NPCs (NpcDef.combat), built from the RPG module's tier and
 * archetype data (GDD §6.11, §13.1) so the numbers stay in one place, plus the §13.2 stat block of
 * the v0.1 boss, Nereus.
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

/**
 * boss-nereus (GDD §13.2): a lusio with practice arms. 300 HP, AR 7 (manica and greave), the
 * blunted trident and the net, a wooden dagger in P3; skill 60, poise 150, reaction 0.25 s, block
 * 0.45 (weapon only; the galerus covers the left), phases at 75% and 45%, yields at 15%.
 */
export const NEREUS_PROFILE: CombatProfile = {
  ...combatProfileFor('boss', { health: 300, armor: 7 }),
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
  blockSkill: 0.45,
  attackIntervalS: 1.6,
  tokensCost: 2,
  speedMult: 1.05,
  yieldAt: 0.15,
  fleeAt: 0,
  loot: undefined,
};
