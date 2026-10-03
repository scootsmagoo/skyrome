/**
 * Enemy tiers and beasts — docs/GDD.md §6.11 (fixed stats: the GDD has no level scaling; areas have
 * bands) with kits and loot from §6.14. `dmgMult` multiplies weapon damage; `speed` is a
 * locomotion multiplier (beasts give `moveSpeed` in m/s); `reaction` is the delay in seconds before
 * a block or dodge. A kit's AR and family override the tier default when the spawner picks it.
 *
 * Lethality check (§6.2): an iron gladius at Blades 25 does 14.6 — 4 thrusts on a thug in a tunic,
 * 10 on an urban soldier in segmentata and helmet (AR 50). Pinned by tests/rpg-combat.test.ts.
 */
import type { ArmorFamily, EnemyTierDef, WeaponStats } from '../types';

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

/** A kit an archetype carries: what it wields and wears (AR and family follow from `worn` unless given). */
export interface ArchetypeKit {
  weapon: string;
  /** Off-hand: a shield, a torch, or a second blade. */
  shield?: string;
  /** Thrown or ranged backup (pila, a net, a sling's shot). */
  ranged?: string;
  /** Worn item ids (for the avatar, loot and AR). */
  worn?: string[];
  ar?: number;
  family?: ArmorFamily;
  /** Weapon coating (sicarii). */
  poison?: string;
  /** An animal companion's tier (the fugitivarius' hound, the venator's dogs). */
  companion?: string;
}

/** An enemy archetype (§13.1): who it is, which tier(s) it fights as, and its kits. */
export interface ArchetypeDef {
  id: string;
  name: string;
  latin?: string;
  /** Tier(s): several for gladiators (tiro = thug → veteran → champion). */
  tier: string | string[];
  band: number | [number, number];
  kits: ArchetypeKit[];
  behaviour: string;
  where: string;
  /** Version it first appears in. */
  firstIn: string;
  /** Law-keepers (arrest instead of murder). */
  lawful?: boolean;
  faction?: string;
}

const LEGIONARY = ['tunica', 'lorica-segmentata', 'galea-gallica', 'caligae'];
const ARENA = 'The Ludus, the amphitheatre';
const GLADIATOR: string[] = ['thug', 'veteran', 'champion'];

/** GDD §13.1 roster. Villains are individuals and cells, never whole peoples or religions. */
export const ARCHETYPES: ArchetypeDef[] = [
  { id: 'grassator', name: 'Mugger', latin: 'grassator', tier: 'thug', band: 1, kits: [{ weapon: 'pugio', worn: ['tunica', 'cucullus'] }, { weapon: 'fustis', worn: ['tunica'] }], behaviour: 'Hunts in pairs at night; flees at low health.', where: 'Streets; the Velabrum by night', firstIn: 'v0.1', faction: 'grassatores' },
  { id: 'ebrius-rixator', name: 'Drunk Tough', latin: 'ebrius rixator', tier: 'thug', band: 1, kits: [{ weapon: 'fists', worn: ['tunica'] }], behaviour: 'Starts brawls (“Whose sour wine are you full of?”). Non-lethal.', where: 'Popinae', firstIn: 'v0.1' },
  { id: 'collegium-bruiser', name: 'Collegium Bruiser', tier: 'bruiser', band: [1, 2], kits: [{ weapon: 'caestus', worn: ['tunica-crassa', 'subarmalis'] }, { weapon: 'clava', worn: ['tunica-crassa', 'subarmalis'] }], behaviour: 'Grapples and knocks down.', where: 'The Subura, the Meta Sudans', firstIn: 'v0.1' },
  { id: 'funditor', name: 'Slinger', latin: 'funditor', tier: 'skirmisher', band: [1, 2], kits: [{ weapon: 'funda', ranged: 'glans-plumbea', worn: ['tunica'] }], behaviour: 'Keeps its distance, staggers hard, uses ledges.', where: 'The Cloaca, rooftops', firstIn: 'v0.1 (should)' },
  { id: 'cloacarius', name: 'Sewer Dweller', latin: 'cloacarius', tier: ['thug', 'bruiser'], band: 2, kits: [{ weapon: 'pugio', worn: ['tunica'] }, { weapon: 'pugio', ranged: 'rete', worn: ['tunica'] }, { weapon: 'fustis', shield: 'fax', worn: ['tunica'] }], behaviour: 'Ambushes from side channels with knives, nets and torches.', where: 'The Cloaca', firstIn: 'v0.1 (should)' },
  { id: 'miles-urbanus', name: 'Urban Soldier', latin: 'miles urbanus', tier: 'miles', band: [2, 3], kits: [{ weapon: 'gladius', shield: 'scutum', ranged: 'pilum', worn: LEGIONARY, ar: 50, family: 'plate' }, { weapon: 'gladius', shield: 'scutum-ovale', ranged: 'pilum', worn: ['tunica', 'lorica-hamata', 'galea-italica', 'caligae'], ar: 45, family: 'mail' }], behaviour: 'Formation, a pilum volley, arrests.', where: 'Day patrols', firstIn: 'v0.1 (law)', lawful: true, faction: 'cohortes-urbanae' },
  { id: 'vigil', name: 'Night Watchman', latin: 'vigil', tier: 'thug', band: [1, 2], kits: [{ weapon: 'dolabra', worn: ['tunica', 'paenula', 'caligae'] }, { weapon: 'fustis', worn: ['tunica', 'paenula', 'caligae'] }], behaviour: 'Prefers knockouts and arrests; calls the siphon crews.', where: 'Night patrols', firstIn: 'v0.1 (law)', lawful: true, faction: 'vigiles' },
  { id: 'sicarius', name: 'Assassin', latin: 'sicarius', tier: 'veteran', band: [2, 3], kits: [{ weapon: 'sica', poison: 'aconitum', worn: ['tunica', 'paenula'], ar: 20, family: 'cloth' }], behaviour: 'Ambushes from crowds; feints.', where: 'Main-quest streets', firstIn: 'v0.2' },
  { id: 'effractor', name: 'Burglar', latin: 'effractor', tier: 'thug', band: 2, kits: [{ weapon: 'pugio', worn: ['tunica', 'cucullus'] }], behaviour: 'Flees over the rooftops.', where: 'Rich quarters at night', firstIn: 'v0.3' },
  { id: 'sagittarius', name: 'Archer', latin: 'sagittarius', tier: 'skirmisher', band: [2, 3], kits: [{ weapon: 'arcus', ranged: 'sagitta', worn: ['tunica-longa', 'thorax-coriaceus'] }], behaviour: 'Cover and high ground; a dagger at close range.', where: 'Main quest, the Circus', firstIn: 'v0.3' },
  { id: 'praetorianus', name: 'Praetorian', latin: 'praetorianus', tier: 'elite', band: 4, kits: [{ weapon: 'gladius-noric', shield: 'scutum-ovale', worn: ['tunica', 'lorica-segmentata', 'galea-attica', 'caligae'], ar: 55, family: 'plate' }], behaviour: 'Coordinated; officers buff their men.', where: 'The Palatine, the Castra', firstIn: 'v0.3', lawful: true, faction: 'praetoriani' },
  { id: 'fugitivarius', name: 'Bounty Hunter', latin: 'fugitivarius', tier: 'veteran', band: 3, kits: [{ weapon: 'spatha', worn: ['tunica', 'lorica-hamata', 'caligae'], ar: 35, family: 'mail', companion: 'canis-molossus' }], behaviour: 'Tracks high-bounty players (§14.1) with a Molossian hound.', where: 'Anywhere', firstIn: 'v0.3' },
  // Gladiators fight to type (armaturae: society.md §10.2).
  { id: 'murmillo', name: 'Murmillo', latin: 'murmillo', tier: GLADIATOR, band: [1, 4], kits: [{ weapon: 'gladius', shield: 'scutum', worn: ['galea-murmillonis', 'manica-linea', 'ocrea'], family: 'cloth' }], behaviour: 'Shield forward, short thrusts.', where: ARENA, firstIn: 'v0.4' },
  { id: 'thraex', name: 'Thraex', latin: 'thraex', tier: GLADIATOR, band: [1, 4], kits: [{ weapon: 'sica', shield: 'parmula', worn: ['galea-thraecis', 'manica-linea', 'ocreae'], family: 'cloth' }], behaviour: 'Hooks round the shield with the sica.', where: ARENA, firstIn: 'v0.1' },
  { id: 'hoplomachus', name: 'Hoplomachus', latin: 'hoplomachus', tier: GLADIATOR, band: [1, 4], kits: [{ weapon: 'hasta', shield: 'parma', worn: ['galea-hoplomachi', 'manica-linea', 'ocreae'], family: 'cloth' }], behaviour: 'Spear first, dagger when pressed.', where: ARENA, firstIn: 'v0.4' },
  { id: 'secutor', name: 'Secutor', latin: 'secutor', tier: GLADIATOR, band: [1, 4], kits: [{ weapon: 'gladius', shield: 'scutum', worn: ['galea-secutoris', 'manica-linea', 'ocrea'], family: 'cloth' }], behaviour: 'Hunts by sound (flank him); no net can catch his helmet.', where: ARENA, firstIn: 'v0.4' },
  { id: 'retiarius', name: 'Retiarius', latin: 'retiarius', tier: GLADIATOR, band: [1, 4], kits: [{ weapon: 'tridens', shield: 'galerus', ranged: 'rete', worn: ['manica-linea'], family: 'cloth' }], behaviour: 'Net, trident, distance.', where: ARENA, firstIn: 'v0.1' },
  { id: 'provocator', name: 'Provocator', latin: 'provocator', tier: GLADIATOR, band: [1, 4], kits: [{ weapon: 'gladius', shield: 'scutum', worn: ['galea-provocatoris', 'cardiophylax', 'manica-linea', 'ocrea'] }], behaviour: 'Fights like a legionary.', where: ARENA, firstIn: 'v0.4' },
  { id: 'eques', name: 'Eques (mounted gladiator)', latin: 'eques', tier: 'champion', band: 4, kits: [{ weapon: 'lancea', shield: 'parma', worn: ['tunica', 'galea-equitis', 'manica-linea'] }], behaviour: 'Lance, then sword.', where: 'The amphitheatre', firstIn: 'v1.2' },
  { id: 'dimachaerus', name: 'Dimachaerus', latin: 'dimachaerus', tier: 'champion', band: 4, kits: [{ weapon: 'sica', shield: 'pugio', worn: ['manica-linea', 'ocreae'] }], behaviour: 'Two swords [U: use rarely].', where: 'The amphitheatre', firstIn: 'v0.4' },
  { id: 'venator', name: 'Beast Hunter', latin: 'venator', tier: 'veteran', band: 3, kits: [{ weapon: 'venabulum', worn: ['tunica', 'fasciae', 'subarmalis'], companion: 'canis-molossus' }], behaviour: 'Hunts beasts with dogs; hostile only in quests.', where: 'The Ludus Matutinus', firstIn: 'v0.4' },
  { id: 'contrabandista', name: 'Smuggler', tier: ['thug', 'miles'], band: 2, kits: [{ weapon: 'gladius', worn: ['tunica', 'thorax-coriaceus'] }], behaviour: 'Fights near the water; boats.', where: 'The Emporium', firstIn: 'v0.5', faction: 'latrones' },
  { id: 'desertor', name: 'Deserter', latin: 'desertor', tier: 'miles', band: [2, 3], kits: [{ weapon: 'gladius', shield: 'scutum', worn: ['tunica', 'lorica-hamata', 'galea-gallica', 'caligae'], ar: 42, family: 'mail' }], behaviour: 'Desperate; may yield.', where: 'The Subura', firstIn: 'v0.5' },
  { id: 'falcarius', name: 'Dacian Falx-man', latin: 'falcarius', tier: 'elite', band: 4, kits: [{ weapon: 'falx', worn: ['bracae', 'thorax-coriaceus', 'manica-ferrea'], ar: 55, family: 'padded' }], behaviour: 'Unblockable sweeps.', where: 'The Domus Aurea, the main quest', firstIn: 'v0.5', faction: 'coniuratio' },
  { id: 'fanaticus', name: 'Cult Fanatic', latin: 'fanaticus', tier: 'bruiser', band: 3, kits: [{ weapon: 'pugio', shield: 'fax', worn: ['tunica', 'cucullus'] }], behaviour: 'Ambushes in the dark with a knife and a torch.', where: 'The Mithraic line', firstIn: 'v0.6' },
  { id: 'agens-parthicus', name: 'Parthian Agent', tier: 'elite', band: 4, kits: [{ weapon: 'pugio-noric', ranged: 'arcus', worn: ['tunica-longa', 'lorica-squamata'], ar: 55, family: 'mail' }], behaviour: 'Kites with the bow, then closes in.', where: 'Main quest', firstIn: 'v0.6', faction: 'coniuratio' },
  { id: 'veteranus-coniurationis', name: 'Cabal Veteran', tier: 'elite', band: 4, kits: [{ weapon: 'gladius-noric', shield: 'scutum', ranged: 'pilum', worn: LEGIONARY, ar: 55, family: 'plate' }], behaviour: 'Shield wall.', where: 'Act III', firstIn: 'v0.7', faction: 'coniuratio' },
  { id: 'violator-sepulcri', name: 'Tomb Robber', latin: 'violator sepulcri', tier: ['thug', 'skirmisher'], band: 2, kits: [{ weapon: 'dolabra', worn: ['tunica'] }, { weapon: 'funda', ranged: 'lapis', worn: ['tunica'] }], behaviour: 'Traps and tunnels.', where: 'The Via Appia', firstIn: 'v0.7', faction: 'latrones' },
];
