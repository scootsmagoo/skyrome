/**
 * Enemy tiers and beasts — docs/GDD.md §6.11 (fixed stats: the GDD has no level scaling; areas have
 * bands) with kits and loot from §6.14. `dmgMult` multiplies weapon damage; `speed` is a
 * locomotion multiplier (beasts give `moveSpeed` in m/s); `reaction` is the delay in seconds before
 * a block or dodge. A kit's AR and family override the tier default when the spawner picks it.
 *
 * Lethality check (§6.2): an iron gladius at Blades 25 does 14.6 — 4 thrusts on a thug in a tunic,
 * 10 on an urban soldier in segmentata and helmet (AR 50). Pinned by tests/rpg-combat.test.ts.
 */
import type { EnemyTierDef, WeaponStats } from '../types';

export const ENEMY_TIERS: EnemyTierDef[] = [
  {
    tier: 'civilian', name: 'Citizen', band: 0, health: 30, stamina: 50, ar: [0, 0], family: 'cloth', dmgMult: 0.6, speed: 1, aggression: 0.1, blockSkill: 0.05, poise: 20, reaction: 0.6, skill: 5, yieldAt: 0.5, fleeAt: 0.6,
    kits: [{ weapon: 'fists' }, { weapon: 'fustis' }], loot: 'civilian',
  },
  {
    tier: 'thug', name: 'Grassator', band: 1, health: 45, stamina: 60, ar: [0, 6], family: 'cloth', dmgMult: 0.9, speed: 1, aggression: 0.55, blockSkill: 0.15, poise: 30, reaction: 0.45, skill: 15, yieldAt: 0.25, fleeAt: 0.15,
    kits: [{ weapon: 'fustis', ar: 0 }, { weapon: 'pugio', ar: 2 }], loot: 'thug',
  },
  {
    tier: 'bruiser', name: 'Collegium Bruiser', band: [1, 2], health: 75, stamina: 80, ar: [10, 10], family: 'padded', dmgMult: 1, speed: 0.95, aggression: 0.7, blockSkill: 0.2, poise: 55, reaction: 0.45, skill: 25, yieldAt: 0.2, fleeAt: 0.1,
    kits: [{ weapon: 'caestus' }, { weapon: 'clava' }], loot: 'bruiser',
  },
  {
    tier: 'skirmisher', name: 'Skirmisher', band: [1, 2], health: 45, stamina: 70, ar: [6, 6], family: 'cloth', dmgMult: 1, speed: 1.05, aggression: 0.5, blockSkill: 0.1, poise: 30, reaction: 0.4, skill: 30, yieldAt: 0.25, fleeAt: 0.2,
    kits: [{ weapon: 'funda' }, { weapon: 'arcus' }], loot: 'skirmisher',
  },
  {
    tier: 'miles', name: 'Soldier', band: [2, 3], health: 70, stamina: 100, ar: [45, 50], family: 'plate', dmgMult: 1, speed: 0.95, aggression: 0.5, blockSkill: 0.55, poise: 60, reaction: 0.35, skill: 35, yieldAt: 0.15, fleeAt: 0.05,
    kits: [{ weapon: 'gladius', shield: 'scutum', ar: 50, family: 'plate' }, { weapon: 'gladius', shield: 'scutum-ovale', ar: 45, family: 'mail' }], loot: 'miles',
  },
  {
    tier: 'veteran', name: 'Veteran', band: 3, health: 95, stamina: 110, ar: [20, 55], family: 'mail', dmgMult: 1.15, speed: 1, aggression: 0.6, blockSkill: 0.6, poise: 70, reaction: 0.3, skill: 50, yieldAt: 0.3, fleeAt: 0,
    kits: [{ weapon: 'gladius-noric', shield: 'scutum', ar: 55, family: 'plate' }, { weapon: 'sica', shield: 'parmula', ar: 20, family: 'cloth' }, { weapon: 'tridens', shield: 'galerus', ar: 20, family: 'cloth' }], loot: 'veteran',
  },
  {
    tier: 'champion', name: 'Champion', band: [3, 4], health: 140, stamina: 130, ar: [25, 60], family: 'mail', dmgMult: 1.3, speed: 1.05, aggression: 0.65, blockSkill: 0.7, poise: 90, reaction: 0.25, skill: 70, yieldAt: 0.3, fleeAt: 0,
    kits: [{ weapon: 'gladius-bilbilis', shield: 'scutum', ar: 60, family: 'plate' }, { weapon: 'falx', ar: 25, family: 'padded' }], loot: 'champion',
  },
  {
    tier: 'elite', name: 'Elite', band: 4, health: 120, stamina: 120, ar: [55, 55], family: 'mail', dmgMult: 1.3, speed: 1, aggression: 0.6, blockSkill: 0.75, poise: 85, reaction: 0.22, skill: 70, yieldAt: 0.1, fleeAt: 0,
    kits: [{ weapon: 'gladius-noric', shield: 'scutum-ovale', ar: 55, family: 'mail' }, { weapon: 'spatha-bilbilis', shield: 'scutum-ovale', ar: 55, family: 'mail' }], loot: 'elite',
  },
  {
    tier: 'boss', name: 'Boss', band: 4, health: 500, stamina: 150, ar: [55, 55], family: 'padded', dmgMult: 1.4, speed: 1, aggression: 0.6, blockSkill: 0.7, poise: 150, reaction: 0.2, skill: 80, fleeAt: 0,
    kits: [{ weapon: 'falx' }], loot: 'boss',
  },
  // ---- beasts (never yield; heavy attacks are unblockable charges and grapples)
  { tier: 'canis', name: 'Stray Dog', band: 1, health: 25, stamina: 80, ar: [0, 0], dmgMult: 1, speed: 1, moveSpeed: 7.5, aggression: 0.6, blockSkill: 0, poise: 15, reaction: 0.4, skill: 0, fleeAt: 0.4, kits: [{ weapon: 'morsus-canis' }], loot: 'beast', beast: true },
  { tier: 'canis-molossus', name: 'Molossian Hound', band: 2, health: 45, stamina: 100, ar: [0, 0], dmgMult: 1, speed: 1, moveSpeed: 8, aggression: 0.75, blockSkill: 0, poise: 30, reaction: 0.35, skill: 0, fleeAt: 0.2, kits: [{ weapon: 'morsus-molossi' }], loot: 'beast', beast: true },
  { tier: 'lupus', name: 'Wolf', band: 2, health: 50, stamina: 100, ar: [0, 0], dmgMult: 1, speed: 1, moveSpeed: 8, aggression: 0.7, blockSkill: 0, poise: 25, reaction: 0.35, skill: 0, fleeAt: 0.2, kits: [{ weapon: 'morsus-lupi' }], loot: 'beast', beast: true },
  { tier: 'aper', name: 'Boar', band: 2, health: 90, stamina: 120, ar: [0, 0], dmgMult: 1, speed: 1, moveSpeed: 7, aggression: 0.7, blockSkill: 0, poise: 60, reaction: 0.4, skill: 0, fleeAt: 0, kits: [{ weapon: 'dens-apri' }], loot: 'beast', beast: true },
  { tier: 'pardus', name: 'Leopard', band: 3, health: 120, stamina: 120, ar: [0, 0], dmgMult: 1, speed: 1, moveSpeed: 9, aggression: 0.8, blockSkill: 0, poise: 40, reaction: 0.3, skill: 0, fleeAt: 0.15, kits: [{ weapon: 'unguis-pardi' }], loot: 'beast', beast: true },
  { tier: 'leo', name: 'Lion', band: 3, health: 200, stamina: 150, ar: [0, 0], dmgMult: 1, speed: 1, moveSpeed: 8.5, aggression: 0.8, blockSkill: 0, poise: 80, reaction: 0.3, skill: 0, fleeAt: 0, kits: [{ weapon: 'unguis-leonis' }], loot: 'beast', beast: true },
  { tier: 'ursus', name: 'Bear', band: 3, health: 240, stamina: 150, ar: [0, 0], dmgMult: 1, speed: 1, moveSpeed: 6.5, aggression: 0.7, blockSkill: 0, poise: 120, reaction: 0.4, skill: 0, fleeAt: 0, kits: [{ weapon: 'ictus-ursi' }], loot: 'beast', beast: true },
  { tier: 'taurus', name: 'Bull', band: 3, health: 260, stamina: 150, ar: [0, 0], dmgMult: 1, speed: 1, moveSpeed: 7.5, aggression: 0.6, blockSkill: 0, poise: 150, reaction: 0.5, skill: 0, fleeAt: 0, kits: [{ weapon: 'cornu-tauri' }], loot: 'beast', beast: true },
  { tier: 'crocodilus', name: 'Crocodile', band: 4, health: 320, stamina: 150, ar: [0, 0], dmgMult: 1, speed: 1, moveSpeed: 2.5, aggression: 0.5, blockSkill: 0, poise: 140, reaction: 0.4, skill: 0, fleeAt: 0, kits: [{ weapon: 'morsus-crocodili' }], loot: 'beast', beast: true },
];

const bite = (damage: number, damageType: WeaponStats['damageType'], stagger: number, reach = 0.9): WeaponStats => ({ class: 'unarmed', skill: 'brawling', damage, damageType, speed: 1.1, reach, stagger });

/** Natural weapons (not in the item catalogue) and fists. */
export const NATURAL_WEAPONS: Record<string, WeaponStats> = {
  fists: { class: 'unarmed', skill: 'brawling', damage: 4, damageType: 'blunt', speed: 1.4, reach: 0.5, stagger: 8 },
  'morsus-canis': bite(6, 'cut', 8),
  'morsus-molossi': bite(10, 'cut', 12),
  'morsus-lupi': bite(10, 'cut', 12),
  'dens-apri': bite(16, 'thrust', 30, 1),
  'unguis-pardi': bite(14, 'cut', 20, 1.1),
  'unguis-leonis': bite(20, 'cut', 35, 1.3),
  'ictus-ursi': bite(22, 'blunt', 45, 1.4),
  'cornu-tauri': bite(25, 'thrust', 60, 1.4),
  'morsus-crocodili': bite(24, 'cut', 50, 1.2),
};
