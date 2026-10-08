/**
 * Ambient crowd roles: who walks the streets of Rome in AD 113, what they look like, what they
 * carry, how fast they walk, which schedule archetype they follow and how they react
 * (society.md §3, §3.8; GDD §14.7). The crowd director picks roles from district mixes.
 */
import type { AvatarRole } from '../../actors/avatar/variants';
import type { ArchetypeId } from '../schedules';

export type PropKind = 'amphora' | 'basket' | 'sack' | 'tray' | 'lantern' | 'torch' | 'scroll';

export type CrowdRoleId =
  | 'citizen'
  | 'citizen-woman'
  | 'senator'
  | 'client'
  | 'matron'
  | 'porter'
  | 'attendant'
  | 'merchant'
  | 'artisan'
  | 'soldier'
  | 'vigil'
  | 'priest'
  | 'vestal'
  | 'idler'
  | 'beggar'
  | 'child'
  | 'elder'
  | 'foreigner'
  | 'reveler'
  | 'carter'
  | 'torchbearer'
  | 'farmer'
  | 'traveller'
  | 'gladiator';

export interface CrowdRole {
  id: CrowdRoleId;
  /** Interaction-prompt label (Skyrim-style "Citizen"). */
  label: string;
  /** Avatar roles to pick from. */
  avatar: readonly AvatarRole[];
  archetype: ArchetypeId;
  /** Walking speed range (m/s). */
  speed: readonly [number, number];
  /** Something carried, and how often. */
  prop?: PropKind;
  propChance?: number;
  /** Followers spawned with this one (clients, a matron's slave). */
  escort?: readonly { role: CrowdRoleId; count: readonly [number, number] }[];
  /** Force a plain toga over the tunic (clients at the salutatio). */
  toga?: boolean;
  /** Bark table key (barks.ts). */
  barks: string;
  /** Adults who stop to watch a fight instead of always running. */
  gawks?: boolean;
  /** Steps in when there is trouble (calls game.combat.engage when combat exists). */
  guard?: boolean;
  /** Always flees from danger. */
  fragile?: boolean;
  /** Only spawned as an escort / by a director, never from the district mix. */
  escortOnly?: boolean;
}

export const CROWD_ROLES: Record<CrowdRoleId, CrowdRole> = {
  citizen: { id: 'citizen', label: 'Citizen', avatar: ['plebeian-man', 'plebeian-man', 'freedman'], archetype: 'civis', speed: [1.15, 1.5], prop: 'sack', propChance: 0.08, barks: 'citizen', gawks: true },
  'citizen-woman': { id: 'citizen-woman', label: 'Citizen', avatar: ['plebeian-woman'], archetype: 'civis', speed: [1.05, 1.35], prop: 'basket', propChance: 0.35, barks: 'woman', gawks: true },
  senator: {
    id: 'senator',
    label: 'Senator',
    avatar: ['patrician-man'],
    archetype: 'patronus',
    speed: [0.95, 1.15],
    escort: [
      { role: 'client', count: [1, 3] },
      { role: 'attendant', count: [0, 1] },
    ],
    barks: 'senator',
    fragile: true,
  },
  client: { id: 'client', label: 'Client', avatar: ['plebeian-man', 'freedman'], archetype: 'cliens', speed: [1.0, 1.2], toga: true, barks: 'client', gawks: true, escortOnly: true },
  matron: { id: 'matron', label: 'Matron', avatar: ['matron'], archetype: 'matrona', speed: [0.95, 1.15], escort: [{ role: 'attendant', count: [0, 1] }], barks: 'matron', fragile: true },
  porter: { id: 'porter', label: 'Slave', avatar: ['slave'], archetype: 'servus-baiulus', speed: [1.25, 1.6], prop: 'amphora', propChance: 0.6, barks: 'slave' },
  attendant: { id: 'attendant', label: 'Slave', avatar: ['slave'], archetype: 'servus-baiulus', speed: [1.0, 1.3], prop: 'basket', propChance: 0.2, barks: 'slave', escortOnly: true },
  merchant: { id: 'merchant', label: 'Merchant', avatar: ['merchant'], archetype: 'tabernarius', speed: [1.0, 1.35], prop: 'tray', propChance: 0.25, barks: 'merchant', gawks: true },
  artisan: { id: 'artisan', label: 'Laborer', avatar: ['plebeian-man', 'slave'], archetype: 'faber', speed: [1.15, 1.45], prop: 'sack', propChance: 0.3, barks: 'worker', gawks: true },
  soldier: { id: 'soldier', label: 'Soldier of the Urban Cohorts', avatar: ['urban-cohort'], archetype: 'miles-urbanus', speed: [1.2, 1.4], barks: 'soldier', guard: true },
  vigil: { id: 'vigil', label: 'Vigil', avatar: ['vigil'], archetype: 'vigil', speed: [1.1, 1.3], prop: 'lantern', propChance: 1, barks: 'vigil', guard: true },
  priest: { id: 'priest', label: 'Priest', avatar: ['priest'], archetype: 'sacerdos', speed: [0.9, 1.1], barks: 'priest', fragile: true },
  vestal: { id: 'vestal', label: 'Vestal Virgin', avatar: ['vestal'], archetype: 'vestalis', speed: [0.85, 1.0], escort: [{ role: 'attendant', count: [1, 1] }], barks: 'vestal', fragile: true },
  idler: { id: 'idler', label: 'Idler', avatar: ['plebeian-man', 'freedman', 'greek'], archetype: 'otiosus', speed: [0.9, 1.2], barks: 'idler', gawks: true },
  beggar: { id: 'beggar', label: 'Beggar', avatar: ['elderly', 'plebeian-man'], archetype: 'mendicus', speed: [0.7, 0.9], barks: 'beggar', fragile: true },
  child: { id: 'child', label: 'Child', avatar: ['child'], archetype: 'puer', speed: [1.6, 2.6], barks: 'child', fragile: true },
  elder: { id: 'elder', label: 'Elder', avatar: ['elderly'], archetype: 'civis', speed: [0.65, 0.9], barks: 'elder', fragile: true },
  foreigner: { id: 'foreigner', label: 'Foreigner', avatar: ['greek', 'syrian', 'egyptian'], archetype: 'civis', speed: [1.05, 1.4], prop: 'scroll', propChance: 0.1, barks: 'foreigner', gawks: true },
  reveler: { id: 'reveler', label: 'Reveler', avatar: ['plebeian-man', 'freedman'], archetype: 'comissator', speed: [0.8, 1.1], prop: 'torch', propChance: 0.5, barks: 'reveler', gawks: true },
  carter: { id: 'carter', label: 'Drover', avatar: ['plebeian-man', 'slave'], archetype: 'plaustrarius', speed: [1.1, 1.2], prop: 'lantern', propChance: 1, barks: 'carter', escortOnly: true },
  // Market gardeners and smallholders from the Campagna bring produce in at dawn (Martial 3.47).
  farmer: { id: 'farmer', label: 'Farmer', avatar: ['plebeian-man', 'plebeian-man', 'elderly', 'plebeian-woman'], archetype: 'rusticus', speed: [1.0, 1.3], prop: 'basket', propChance: 0.7, barks: 'farmer', gawks: true },
  // Travellers on the consular roads: arrivals with their bundles, muleteers, pilgrims, couriers.
  traveller: { id: 'traveller', label: 'Traveller', avatar: ['plebeian-man', 'freedman', 'greek', 'syrian', 'egyptian'], archetype: 'viator', speed: [1.15, 1.45], prop: 'sack', propChance: 0.75, barks: 'traveller', gawks: true },
  // Gladiators of the schools in their practice kit (stations at the Ludus only).
  gladiator: { id: 'gladiator', label: 'Gladiator', avatar: ['murmillo', 'thraex', 'secutor', 'hoplomachus', 'provocator', 'retiarius'], archetype: 'gladiator', speed: [1.15, 1.45], barks: 'gladiator', gawks: true, escortOnly: true },
  torchbearer: { id: 'torchbearer', label: 'Slave', avatar: ['slave'], archetype: 'servus-baiulus', speed: [1.0, 1.2], prop: 'torch', propChance: 1, barks: 'slave', escortOnly: true },
};

/** Labels for avatar-specific foreigners. */
export const FOREIGN_LABELS: Partial<Record<AvatarRole, string>> = { greek: 'Greek', syrian: 'Syrian', egyptian: 'Egyptian' };
