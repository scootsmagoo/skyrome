/**
 * The law in v0.1 (GDD §14.1: the Urban Cohorts by day, the Vigiles by night). Named patrol
 * leaders and their men; the crowd module adds unnamed ones from the same archetypes. Patrols walk
 * routes of named places; the Vigiles sleep by day (§14.7 'vigil' template).
 */
import { archetype } from '../../content/profiles';
import type { NpcDef, ScheduleEntry } from '../types';

const NIGHT_ROUTE = ['excubitorium-velabri', 'insula-fabaria', 'fullonica-velabri', 'insula-nutans', 'popina-vicus-tuscus', 'castor-steps', 'miliarium-aureum', 'basilica-julia-steps', 'excubitorium-velabri'];
const DAY_ROUTE = ['carcer-tullianum', 'rostra', 'basilica-julia-steps', 'castor-steps', 'basilica-aemilia-tabernae', 'arch-titus', 'meta-sudans-ring', 'arch-titus', 'rostra'];

const nightWatch = (route = NIGHT_ROUTE): ScheduleEntry[] => [
  { from: 0, at: route[0], activity: 'patrol', route },
  { from: 5, at: 'excubitorium-velabri', activity: 'sleep' },
  { from: 19.5, at: route[0], activity: 'patrol', route },
];
const dayWatch = (route = DAY_ROUTE): ScheduleEntry[] => [
  { from: 0, at: 'carcer-tullianum', activity: 'sleep' },
  { from: 6, at: route[0], activity: 'patrol', route },
  { from: 19.5, at: 'carcer-tullianum', activity: 'guard' },
];

const vigilLook = (skin: string, hair: string, build: 'average' | 'stocky' | 'muscular', age: 'young' | 'adult' | 'middle'): NpcDef['appearance'] => ({
  sex: 'male', age, build, height: 1.68, skin,
  hair: { style: 'cropped', color: hair }, beard: 'stubble',
  garments: [{ kind: 'tunica', color: '#7a4a32' }, { kind: 'balteus', color: '#3b2a1c' }, { kind: 'paenula', color: '#5b4a3a' }],
  footwear: 'caligae', armor: { helmet: { kind: 'vigiles-cap' } }, weapon: 'axe',
});

const urbanLook = (skin: string, hair: string, age: 'young' | 'adult' | 'middle'): NpcDef['appearance'] => ({
  sex: 'male', age, build: 'stocky', height: 1.71, skin,
  hair: { style: 'cropped', color: hair }, beard: 'none',
  garments: [{ kind: 'tunica', color: '#d9d0bd' }],
  footwear: 'caligae',
  armor: { helmet: { kind: 'imperial-italic', metal: 'iron' }, body: { kind: 'lorica-hamata', metal: 'iron' } },
  weapon: 'gladius', shield: { model: 'scutum-oval', color: '#5a4a6e', emblem: 'wreath' },
});

const npcs: NpcDef[] = [
  {
    id: 'npc-crescens',
    name: 'Tiberius Claudius Crescens',
    title: 'Optio of the Vigiles, 5th Cohort',
    faction: 'vigiles',
    rank: 'optio',
    home: 'excubitorium-velabri',
    schedule: nightWatch(),
    dialogue: 'npc-vigiles',
    disposition: 'neutral',
    appearance: vigilLook('#c6936b', '#4a3524', 'muscular', 'middle'),
    combat: archetype('vigil', { kit: 1 }, { name: 'Optio of the Vigiles', health: 60, skill: 30 }),
    barks: ['Water in every flat! The prefect’s order!', 'Lamps out up there!', 'Quiet night. That’s when I worry.'],
    tags: ['vigil', 'official', 'soldier', 'dignitas:libertus'],
  },
  {
    id: 'npc-vigil-fortunatus',
    name: 'Fortunatus',
    title: 'Vigil, 5th Cohort',
    faction: 'vigiles',
    rank: 'vigil',
    home: 'excubitorium-velabri',
    schedule: nightWatch(),
    dialogue: 'npc-vigiles',
    disposition: 'neutral',
    appearance: vigilLook('#a46b49', '#1f1914', 'stocky', 'young'),
    combat: archetype('vigil', { kit: 0 }),
    barks: ['Smoke? Where?', 'Bucket chain, if it comes to it. You can hold a bucket?'],
    tags: ['vigil', 'soldier', 'dignitas:libertus'],
  },
  {
    id: 'npc-vigil-primus',
    name: 'Primus',
    title: 'Vigil, 5th Cohort (siphonarius)',
    faction: 'vigiles',
    rank: 'siphonarius',
    home: 'excubitorium-velabri',
    schedule: nightWatch(),
    dialogue: 'npc-vigiles',
    disposition: 'neutral',
    appearance: vigilLook('#d9ab84', '#5e3b22', 'average', 'adult'),
    combat: archetype('vigil', { kit: 1 }),
    barks: ['I work the pump. The pump does not work me.', 'Rome burns a little every night.'],
    tags: ['vigil', 'soldier', 'dignitas:libertus'],
  },
  {
    id: 'npc-petronius-firmus',
    name: 'Lucius Petronius Firmus',
    title: 'Tesserarius, Cohors X Urbana',
    faction: 'cohortes-urbanae',
    rank: 'tesserarius',
    home: 'carcer-tullianum',
    schedule: dayWatch(),
    dialogue: 'npc-urbaniciani',
    disposition: 'neutral',
    appearance: urbanLook('#cf9f78', '#2a1f17', 'adult'),
    combat: archetype('miles-urbanus', { kit: 1 }, { name: 'Tesserarius' }),
    barks: ['Move along.', 'Keep your blade sheathed in the Forum, citizen.', 'Another riot at the Circus and we’ll all be on double watches.'],
    tags: ['soldier', 'official', 'dignitas:civis'],
  },
  {
    id: 'npc-miles-valens',
    name: 'Valens',
    title: 'Soldier, Cohors X Urbana',
    faction: 'cohortes-urbanae',
    rank: 'miles',
    home: 'carcer-tullianum',
    schedule: dayWatch(),
    dialogue: 'npc-urbaniciani',
    disposition: 'neutral',
    appearance: urbanLook('#bd9067', '#3a2a1d', 'young'),
    combat: archetype('miles-urbanus', { kit: 1 }),
    barks: ['Nothing to see here.', 'Watch your purse in this crowd.'],
    tags: ['soldier', 'dignitas:civis'],
  },
  {
    id: 'npc-miles-severus',
    name: 'Severus',
    title: 'Soldier, Cohors X Urbana',
    faction: 'cohortes-urbanae',
    rank: 'miles',
    home: 'carcer-tullianum',
    schedule: dayWatch(),
    dialogue: 'npc-urbaniciani',
    disposition: 'neutral',
    appearance: urbanLook('#dcb08c', '#563d2a', 'middle'),
    combat: archetype('miles-urbanus', { kit: 1 }),
    barks: ['Parthia, they say. Not us, thank the gods. We guard the bakers.'],
    tags: ['soldier', 'dignitas:civis'],
  },
];

export default npcs;
