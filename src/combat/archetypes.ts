/**
 * Enemy archetypes the combat module can spawn for v0.0–v0.1 (docs/GDD.md §13.1, §13.2):
 * stats come from src/rpg (tier rows of §6.11, archetype kits of §13.1); this adds the look
 * (avatar role and weapon/shield models), the AI's leanings and the boss scripts.
 *
 *   grassator          mugger, pugio or fustis; flees at low health; hunts in pairs (group)
 *   ebrius-rixator     drunk tough, fists; a brawl (non-lethal by rule)
 *   collegium-bruiser  caestus or clava, padded
 *   tiro               a novice gladiator (thug tier) with a rudis and scutum
 *   thraex             sica and parmula (veteran tier by default)
 *   miles-urbanus      urban soldier: gladius, scutum, segmentata (law)
 *   vigil              night watchman: fustis or dolabra (law, prefers knockouts)
 *   boss-nereus        Nereus the retiarius: practice trident, net, phases 75/45, yields at 15 %
 */
import type { ShieldModel, WeaponModel } from '../actors/appearance';
import type { AvatarRole } from '../actors/avatar/variants';
import type { BrainProfile } from '../ai/combat/types';
import { archetypeProfile, combatProfileFor } from '../rpg/enemies';
import type { ItemDb } from '../rpg/items';
import type { CombatProfile } from '../rpg/types';
import { NEREUS } from '../ai/combat/nereus';

export interface EnemyOptions {
  /** Tier for archetypes with several (gladiators: 'thug' = tiro, 'veteran', 'champion'). */
  tier?: string;
  /** Kit index (grassator: 0 pugio, 1 fustis; bruiser: 0 caestus, 1 clava; vigil: 0 dolabra, 1 fustis). */
  kit?: number;
  /** A practice bout: arma lusoria (rudis) instead of steel. */
  lusio?: boolean;
}

export interface EnemySpec {
  id: string;
  name: string;
  title?: string;
  role: AvatarRole;
  profile(items: ItemDb, o: EnemyOptions): CombatProfile;
  /** AI leanings on top of the tier's. */
  brain?: Partial<BrainProfile>;
  lawful?: boolean;
  /** A rixa: nobody dies (§6.9). */
  brawl?: boolean;
  /** Default team and call-for-help group. */
  team: string;
  group?: string;
  boss?: { title: string; phases: number[] };
  /** Defaults for options. */
  defaults?: EnemyOptions;
}

/** Replace steel with practice arms for a lusio (§6.10). */
function practice(p: CombatProfile, o: EnemyOptions): CombatProfile {
  if (!o.lusio) return p;
  const spear = p.weapon === 'tridens' || p.weapon === 'hasta';
  return { ...p, weapon: spear ? 'tridens-lusorius' : 'rudis' };
}

export const ENEMIES: Record<string, EnemySpec> = {
  grassator: {
    id: 'grassator',
    name: 'Grassator',
    title: 'Mugger',
    role: 'plebeian-man',
    profile: (items, o) => archetypeProfile('grassator', items, { kit: o.kit ?? 0 }),
    brain: { prefersFlee: true },
    team: 'hostile',
    group: 'grassatores',
  },
  'ebrius-rixator': {
    id: 'ebrius-rixator',
    name: 'Drunk Tough',
    title: 'Ebrius rixator',
    role: 'plebeian-man',
    profile: (items) => archetypeProfile('ebrius-rixator', items),
    brawl: true,
    team: 'brawlers',
  },
  'collegium-bruiser': {
    id: 'collegium-bruiser',
    name: 'Collegium Bruiser',
    role: 'plebeian-man',
    profile: (items, o) => archetypeProfile('collegium-bruiser', items, { kit: o.kit ?? 1 }),
    team: 'hostile',
    group: 'collegium',
  },
  tiro: {
    id: 'tiro',
    name: 'Tiro',
    title: 'A novice of the Ludus',
    role: 'murmillo',
    profile: (items, o) => practice({ ...archetypeProfile('murmillo', items, { tier: o.tier ?? 'thug' }), name: 'Tiro', archetype: 'tiro' }, o),
    team: 'ludus',
    defaults: { lusio: true },
  },
  thraex: {
    id: 'thraex',
    name: 'Thraex',
    title: 'Gladiator',
    role: 'thraex',
    profile: (items, o) => practice(archetypeProfile('thraex', items, { tier: o.tier ?? 'veteran' }), o),
    team: 'ludus',
    defaults: { lusio: true },
  },
  'miles-urbanus': {
    id: 'miles-urbanus',
    name: 'Miles Urbanus',
    title: 'Urban Cohorts',
    role: 'urban-cohort',
    profile: (items, o) => archetypeProfile('miles-urbanus', items, { kit: o.kit ?? 0 }),
    lawful: true,
    team: 'law',
    group: 'cohortes-urbanae',
  },
  vigil: {
    id: 'vigil',
    name: 'Vigil',
    title: 'Night Watch',
    role: 'vigil',
    profile: (items, o) => archetypeProfile('vigil', items, { kit: o.kit ?? 1 }),
    lawful: true,
    team: 'law',
    group: 'vigiles',
  },
  'boss-nereus': {
    id: 'boss-nereus',
    name: 'Nereus',
    title: 'Retiarius, victor of 31',
    role: 'retiarius',
    profile: () => nereusProfile(),
    team: 'ludus',
    boss: { title: 'Retiarius, victor of 31', phases: [...NEREUS.phases] },
    defaults: { lusio: true },
  },
};

/** §13.2 stat block for Nereus (boss tier defaults otherwise: dmgMult 1.4). */
export function nereusProfile(): CombatProfile {
  const base = combatProfileFor('boss', { health: 300, armor: 7 });
  return {
    ...base,
    name: 'Nereus',
    archetype: 'boss-nereus',
    armorFamily: 'cloth',
    weapon: 'tridens-lusorius',
    // The galerus only guards the left shoulder: he blocks weapon-only (block skill 0.45).
    shield: undefined,
    ranged: 'rete',
    worn: ['manica-linea'],
    skill: 60,
    poise: 150,
    reactionS: 0.25,
    blockSkill: 0.45,
    attackIntervalS: NEREUS.interval[0],
    tokensCost: 2,
    speedMult: NEREUS.speed[0],
    yieldAt: NEREUS.yieldAt,
    fleeAt: 0,
    dmgMult: 1.4,
    aggression: 0.6,
  };
}

/** The look for an enemy's weapon and shield items. */
export function visualsFor(items: ItemDb, p: CombatProfile): { weapon: WeaponModel; shield: ShieldModel } {
  const w = p.weapon ? items.get(p.weapon)?.visual?.weapon : undefined;
  const s = p.shield ? items.get(p.shield)?.visual?.shield : undefined;
  return { weapon: w ?? (p.weapon === 'tridens-lusorius' ? 'trident' : 'none'), shield: s ?? 'none' };
}

export function enemySpec(id: string): EnemySpec | undefined {
  return ENEMIES[id];
}

export const ENEMY_IDS = Object.keys(ENEMIES);
