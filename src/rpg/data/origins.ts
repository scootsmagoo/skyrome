/**
 * Origins — docs/GDD.md §3.2 and §3.5. Skills start at 10; an origin adds +10 / +5 / +5 (the
 * veteran's old wound is −5 Athletics). Trait ids are also sheet flags. Every origin also gets the
 * common kit; its signature weapon starts at 90% condition; formal dress (a toga, or a stola and
 * palla) starts in the pack, not worn. v0.1 ships four origins (`since: 'v0.1'`); the other six
 * show locked until their systems exist. Every origin but the veteran picks a creation extra: a
 * used parmula (60%) or +40 den.
 */
import type { BackgroundDef } from '../types';

/** Signature weapons start well used, not ruined. */
export const SIGNATURE_CONDITION = 0.9;
const sig = SIGNATURE_CONDITION;

/** Formal dress by sex, packed (not worn). */
const TOGA = { male: [{ id: 'toga' }], female: [{ id: 'stola' }, { id: 'palla' }] };

export const ORIGINS: BackgroundDef[] = [
  {
    id: 'civis-suburanus', name: 'Subura-born Plebeian', latin: 'Civis Suburanus', status: 'civis', since: 'v0.1', creationExtra: true,
    description: 'Born in a Suburan tenement to plebeian citizens. You know every alley, every popina and every man who owes money.',
    skills: { rhetoric: 10, mercatura: 5, brawling: 5 },
    traitId: 'trait-street-wise', trait: 'Street-wise: the Subura’s and Velabrum’s lesser sights start revealed; −5% prices at plebeian vendors.', flags: ['trait-street-wise'],
    kit: [{ id: 'tunica', equip: true }, { id: 'paenula', equip: true }, { id: 'calcei', equip: true }, { id: 'fustis', equip: true, condition: sig }],
    pack: TOGA,
    denarii: 60, hook: 'An aunt’s popina is being squeezed by a collegium.',
  },
  {
    id: 'libertus', name: 'Freedman or Freedwoman', latin: 'Libertus', status: 'libertus', since: 'v0.2', creationExtra: true,
    description: 'You wore the felt cap at your manumission and still keep accounts for your old master’s house. You know what everything costs.',
    skills: { mercatura: 10, 'locks-seals': 5, rhetoric: 5 },
    traitId: 'trait-patrons-shadow', trait: 'Patron’s shadow: +10% Trade XP; your former owner calls in favors.', flags: ['trait-patrons-shadow', 'xp.mercatura'],
    kit: [{ id: 'tunica-crassa', equip: true }, { id: 'soleae', equip: true }, { id: 'tabula-cerata', count: 2 }, { id: 'pugio', equip: true, condition: sig }],
    denarii: 80, hook: 'Your manumission tablet is “lost”: prove your freedom.',
  },
  {
    id: 'gallus', name: 'Gaul', latin: 'Gallus', status: 'civis', since: 'v0.2', creationExtra: true,
    description: 'From Narbonensis or Lugdunensis, where your family works iron. Someone in Rome is forging your kinsman’s maker’s mark.',
    skills: { fabrica: 10, spear: 5, 'heavy-armor': 5 },
    traitId: 'trait-gallic-smith', trait: 'Gallic smith: improvements at a forge reach one quality tier further.', flags: ['trait-gallic-smith'],
    kit: [{ id: 'tunica', equip: true }, { id: 'bracae', equip: true }, { id: 'sagum', equip: true }, { id: 'carbatinae', equip: true }, { id: 'hasta', equip: true, condition: sig }, { id: 'thorax-coriaceus', equip: true }],
    denarii: 50, hook: 'A forgery ring uses a kinsman’s maker’s mark.',
  },
  {
    id: 'hispanus', name: 'Hispanian from Baetica', latin: 'Hispanus', status: 'civis', since: 'v0.1', creationExtra: true,
    description: 'From Baetica around Italica, the emperor’s own homeland, with a letter of introduction in your satchel.',
    skills: { blades: 10, rhetoric: 5, equitatio: 5 },
    traitId: 'trait-caesars-countryman', trait: 'Caesar’s countryman: +10 disposition with Baetican NPCs; Bilbilis-steel blades cost 20% less.', flags: ['trait-caesars-countryman'],
    kit: [{ id: 'tunica', equip: true }, { id: 'gladius', equip: true, condition: sig }],
    pack: TOGA,
    denarii: 90, hook: 'A letter of introduction to the patroness Calpurnia Severa.',
  },
  {
    id: 'syrus', name: 'Syrian', latin: 'Syrus', status: 'peregrinus', since: 'v0.2', creationExtra: true,
    description: 'From Antioch or Emesa, a bowman’s son. With war against Parthia coming, some Romans eye every Easterner.',
    skills: { archery: 10, mercatura: 5, medicina: 5 },
    traitId: 'trait-eastern-archer', trait: 'Eastern archer: bow draw time −20%; soldiers −5 disposition during the war levy.', flags: ['trait-eastern-archer'],
    kit: [{ id: 'tunica-longa', equip: true }, { id: 'soleae', equip: true }, { id: 'arcus', equip: true, condition: sig }, { id: 'sagitta', count: 20, equip: true }, { id: 'pugio' }],
    denarii: 70, hook: 'A Parthian silk merchant asks for “a small favor”.',
  },
  {
    id: 'aegyptius', name: 'Alexandrian', latin: 'Aegyptius', status: 'alexandrinus', since: 'v0.2', creationExtra: true,
    description: 'Trained in the shadow of the Museum. The Iseum Campense has lost a papyrus, and they think you can find it.',
    skills: { medicina: 10, 'locks-seals': 5, religio: 5 },
    traitId: 'trait-alexandrian-learning', trait: 'Alexandrian learning: +50% from Greek skill books; devotees of Isis +10 disposition.', flags: ['trait-alexandrian-learning'],
    kit: [{ id: 'tunica-linea', equip: true }, { id: 'soleae', equip: true }, { id: 'fascia', count: 5 }, { id: 'pugio', equip: true, condition: sig }],
    denarii: 60, hook: 'A papyrus is missing from the Iseum Campense.',
  },
  {
    id: 'afer', name: 'African', latin: 'Afer', status: 'civis', since: 'v0.2', creationExtra: true,
    description: 'From Africa Proconsularis or Mauretania, where you hunted for the arena trade.',
    skills: { spear: 10, athletics: 5, 'light-armor': 5 },
    traitId: 'trait-beast-wise', trait: 'Beast-wise: +20% damage against beasts; beasts flee from you sooner.', flags: ['trait-beast-wise'],
    kit: [{ id: 'tunica', equip: true }, { id: 'carbatinae', equip: true }, { id: 'lancea', count: 3, equip: true, condition: sig }, { id: 'thorax-coriaceus', equip: true }],
    denarii: 50, hook: 'A leopard crate for the Ludus Matutinus has gone missing.',
  },
  {
    id: 'veteranus', name: 'Veteran of Dacia', latin: 'Veteranus', status: 'civis', since: 'v0.1', creationExtra: false,
    description: 'An auxiliary of the Dacian war, discharged early with a wound (missio causaria). Your cohort won citizenship before its time, and you carry the bronze diploma that says so. Your old centurion is in the city, too rich for his pay.',
    skills: { shield: 10, blades: 5, 'heavy-armor': 5, athletics: -5 },
    traitId: 'trait-old-wound', trait: 'Old wound: Athletics −5 at the start, +20 poise; soldiers +10 disposition. You carry a bronze diploma.', flags: ['trait-old-wound'],
    kit: [{ id: 'tunica', equip: true }, { id: 'sagum', equip: true }, { id: 'caligae', equip: true }, { id: 'gladius', equip: true, condition: sig }, { id: 'scutum-ovale', equip: true, condition: 0.4 }, { id: 'galea-gallica', equip: true }, { id: 'diploma' }],
    denarii: 60, hook: 'Your old centurion is too rich for his pay.',
  },
  {
    id: 'dacus', name: 'Dacian', latin: 'Dacus', status: 'latinus-iunianus', since: 'v0.1', creationExtra: true,
    description: 'Taken captive in 106, you hauled stone for Trajan’s Forum and were informally freed — a Junian Latin. Your people are carved on the Column.',
    skills: { fabrica: 10, athletics: 5, blades: 5 },
    traitId: 'trait-survivor', trait: 'Survivor: +10 poise per enemy beyond the first (max +30); some Romans −10 disposition, Dacians +20.', flags: ['trait-survivor'],
    kit: [{ id: 'tunica', equip: true }, { id: 'carbatinae', equip: true }, { id: 'sica', equip: true, condition: sig }, { id: 'malleus' }],
    denarii: 30, hook: 'A Dacian revenge cell wants your help.',
  },
  {
    id: 'eques-lapsus', name: 'Fallen Equestrian', latin: 'Eques Lapsus', status: 'civis', since: 'v0.2', creationExtra: true,
    description: 'Born to the equestrian order, you lost the census and the gold ring with it. Debt collectors know your door.',
    skills: { rhetoric: 10, equitatio: 5, blades: 5 },
    traitId: 'trait-old-name', trait: 'Old name: opens one elite door per patron, once; debt collectors ambush you.', flags: ['trait-old-name'],
    kit: [{ id: 'tunica', equip: true }, { id: 'calcei', equip: true }, { id: 'anulus-signatorius', equip: true }, { id: 'spatha', equip: true, condition: sig }],
    pack: { male: [{ id: 'toga-fina', condition: 0.5 }], female: [{ id: 'stola-fina', condition: 0.5 }, { id: 'palla-fina', condition: 0.5 }] },
    denarii: 20, debt: 2000, hook: 'Win back the gold ring (a woman: the family’s fortune and standing).',
  },
];

/** @deprecated Use ORIGINS (GDD Appendix A: origins.ts). */
export const BACKGROUNDS = ORIGINS;

/** §3.5 Every origin also starts with these (the courier's tablet is added if the main quest defines it). */
export const COMMON_KIT: { id: string; count?: number }[] = [
  { id: 'fascia', count: 2 },
  { id: 'panis', count: 1 },
  { id: 'tabula-cerata', count: 1 },
  { id: 'stilus', count: 1 },
  { id: 'quest-tabella-signata', count: 1 },
];

/** §3.2 creation extra (every origin but the veteran): a used parmula or 40 den. */
export const CREATION_EXTRAS = {
  parmula: { item: 'parmula', condition: 0.6 },
  denarii: { denarii: 40 },
} as const;
export type CreationExtra = keyof typeof CREATION_EXTRAS;

/** Origins playable in a given version ('v0.1' → the four that ship first). */
export function playableOrigins(version: string): BackgroundDef[] {
  return ORIGINS.filter((o) => !o.since || versionAtLeast(version, o.since));
}

function versionAtLeast(v: string, min: string): boolean {
  const n = (s: string) => s.replace(/^v/, '').split('.').map(Number);
  const a = n(v);
  const b = n(min);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d > 0;
  }
  return true;
}
