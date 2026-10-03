/**
 * PROVISIONAL enemy tier table (the GDD tier table is pending). A tier's level follows the
 * player's, clamped to [minLevel, maxLevel] (Skyrim encounter zones), and its stats grow linearly
 * with level: value = base + perLevel × (level − 1).
 *
 * `damage` is the NPC damage multiplier (their stand-in for perks): weapon damage × that value.
 *
 * Expected time-to-kill for these numbers is documented in docs/modules/rpg.md and pinned by
 * tests/rpg-combat.test.ts. Rough targets for an on-level fight, light attacks only:
 * trash (thug, brigand) 5–10 hits, soldiers (gladiator, veteran, urbanus) 10–18, elites
 * (praetorian, champion) 18–26, bosses 28–40.
 */
import type { EnemyTierDef } from '../types';

export const ENEMY_TIERS: EnemyTierDef[] = [
  {
    tier: 'animal', name: 'Stray Dog', minLevel: 1, maxLevel: 10,
    health: [30, 4], stamina: [60, 2], armor: [0, 0], skill: [20, 2], damage: [1, 0.03], poise: 20,
    weapons: [{ minLevel: 1, weapon: 'bite' }],
    aggression: 0.75, blockSkill: 0, fleeAt: 0.25, loot: 'animal',
  },
  {
    tier: 'citizen', name: 'Angry Citizen', minLevel: 1, maxLevel: 6,
    health: [40, 3], stamina: [60, 2], armor: [0, 0], skill: [10, 1], damage: [1, 0], poise: 25,
    weapons: [{ minLevel: 1, weapon: 'fustis' }],
    aggression: 0.25, blockSkill: 0.05, yieldAt: 0.4, fleeAt: 0.5, loot: 'citizen',
  },
  {
    tier: 'thug', name: 'Suburan Thug', minLevel: 1, maxLevel: 12,
    health: [50, 5], stamina: [80, 4], armor: [8, 0.5], skill: [20, 2.5], damage: [1, 0.03], poise: 30,
    weapons: [{ minLevel: 1, weapon: 'fustis' }, { minLevel: 4, weapon: 'pugio' }, { minLevel: 8, weapon: 'gladius_rusty' }],
    aggression: 0.6, blockSkill: 0.15, yieldAt: 0.15, fleeAt: 0.1, loot: 'thug',
  },
  {
    tier: 'brigand', name: 'Brigand', minLevel: 3, maxLevel: 20,
    health: [70, 6], stamina: [100, 4], armor: [20, 1], skill: [25, 2.5], damage: [1, 0.03], poise: 40,
    weapons: [{ minLevel: 1, weapon: 'gladius_rusty', shield: 'parma' }, { minLevel: 8, weapon: 'hasta', shield: 'parma' }, { minLevel: 14, weapon: 'spatha', shield: 'scutum_ovale' }],
    aggression: 0.6, blockSkill: 0.25, yieldAt: 0.1, fleeAt: 0.05, loot: 'brigand',
  },
  {
    tier: 'vigil', name: 'Vigil of the Watch', minLevel: 4, maxLevel: 20,
    health: [80, 6], stamina: [100, 4], armor: [18, 1], skill: [30, 2], damage: [1, 0.03], poise: 45,
    weapons: [{ minLevel: 1, weapon: 'fustis' }, { minLevel: 10, weapon: 'securis' }],
    aggression: 0.45, blockSkill: 0.3, loot: 'guard',
  },
  {
    tier: 'urbanus', name: 'Soldier of the Urban Cohorts', minLevel: 6, maxLevel: 40,
    health: [100, 6], stamina: [120, 4], armor: [40, 1], skill: [40, 1.5], damage: [1, 0.035], poise: 60,
    weapons: [{ minLevel: 1, weapon: 'gladius', shield: 'scutum_ovale' }],
    aggression: 0.5, blockSkill: 0.45, loot: 'guard',
  },
  {
    tier: 'veteran', name: 'Legion Veteran', minLevel: 8, maxLevel: 35,
    health: [100, 6], stamina: [120, 4], armor: [45, 1], skill: [45, 1.5], damage: [1, 0.035], poise: 60,
    weapons: [{ minLevel: 1, weapon: 'gladius', shield: 'scutum' }, { minLevel: 20, weapon: 'gladius_noric', shield: 'scutum' }],
    aggression: 0.55, blockSkill: 0.5, yieldAt: 0.1, loot: 'veteran',
  },
  {
    tier: 'gladiator', name: 'Gladiator', minLevel: 5, maxLevel: 40,
    health: [90, 6], stamina: [140, 5], armor: [30, 1], skill: [40, 1.8], damage: [1.05, 0.035], poise: 55,
    weapons: [{ minLevel: 1, weapon: 'sica', shield: 'parmula' }, { minLevel: 10, weapon: 'gladius', shield: 'scutum' }, { minLevel: 20, weapon: 'fuscina' }],
    aggression: 0.7, blockSkill: 0.45, yieldAt: 0.2, loot: 'gladiator',
  },
  {
    tier: 'praetorian', name: 'Praetorian', minLevel: 15, maxLevel: 50,
    health: [150, 6], stamina: [150, 5], armor: [60, 1.2], skill: [55, 1.2], damage: [1.1, 0.035], poise: 80,
    weapons: [{ minLevel: 1, weapon: 'gladius_noric', shield: 'scutum' }],
    aggression: 0.55, blockSkill: 0.6, loot: 'praetorian',
  },
  {
    tier: 'champion', name: 'Champion', minLevel: 10, maxLevel: 50,
    health: [160, 7], stamina: [160, 5], armor: [50, 1.2], skill: [55, 1.2], damage: [1.1, 0.04], poise: 100,
    weapons: [{ minLevel: 1, weapon: 'spatha', shield: 'scutum_ovale' }, { minLevel: 20, weapon: 'gladius_tribuni', shield: 'scutum' }],
    aggression: 0.65, blockSkill: 0.55, yieldAt: 0.15, loot: 'champion',
  },
  {
    tier: 'boss', name: 'Boss', minLevel: 10, maxLevel: 60,
    health: [220, 10], stamina: [200, 6], armor: [55, 1.2], skill: [60, 1], damage: [1.2, 0.045], poise: 150,
    weapons: [{ minLevel: 1, weapon: 'falx' }],
    aggression: 0.6, blockSkill: 0.6, loot: 'boss',
  },
];

/** Natural weapons for animals (not in the item catalogue). */
export const NATURAL_WEAPONS = {
  bite: { class: 'unarmed' as const, skill: 'unarmed', damage: 7, speed: 1.2, reach: 0.9, stagger: 0.3 },
};
