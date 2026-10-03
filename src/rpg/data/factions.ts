/**
 * Factions — docs/GDD.md §9.1 (ids, leaders, HQs, rank ladders, skill gates, joining rules) and
 * §3.4 (Fama runs −100…+100 per track). Ranks are granted by quest completion (the Skyrim model);
 * middle and top ranks also need a skill (30 / 45 unless stated; the Ludus 45 / 60), and a
 * promotion waits until you have it. Fama no longer gates rank (minReputation 0): it drives
 * discounts, dialogue, radiant pay and greetings. Capstones are flagged `questOnly`. `lawful`
 * factions receive crime reports; `enemies` attack each other on sight ('player' = hostile to you).
 */
import type { FactionDef, FactionRank } from '../types';
import { STANDING } from './tuning';

const MARTIAL = ['blades', 'spear', 'archery', 'shield', 'brawling', 'heavy-armor', 'light-armor'];

type R = [id: string, title: string, latin: string, opts?: { requires?: FactionRank['requires']; questOnly?: boolean }];
const ladder = (list: R[]): FactionRank[] => list.map(([id, title, latin, o]) => ({ id, title, latin, minReputation: 0, requires: o?.requires, questOnly: o?.questOnly }));

export const FACTIONS: FactionDef[] = [
  {
    id: 'vigiles', name: 'Vigiles, Cohors V', latin: 'Cohortes Vigilum', lawful: true, leader: 'npc-vindex', hq: 'statio-vigiles-v',
    description: 'The night watch and fire brigade of the 5th Cohort on the Caelian. Any status may join; freedmen are welcome. A Junian Latin earns citizenship here.',
    enemies: ['latrones', 'grassatores'],
    ranks: ladder([
      ['vigil', 'Watchman', 'Vigil'],
      ['sebaciarius', 'Torch-bearer', 'Sebaciarius'],
      ['siphonarius', 'Pump-master', 'Siphonarius'],
      ['optio', 'Deputy', 'Optio', { requires: [{ skill: 'athletics', level: 30 }] }],
      ['centurio', 'Centurion', 'Centurio', { requires: [{ skill: 'athletics', level: 45 }, { skill: ['brawling', 'blades'], level: 30 }] }],
    ]),
  },
  {
    id: 'ludus-magnus', name: 'Ludus Magnus', latin: 'Ludus Magnus', leader: 'npc-glaucus', hq: 'ludus-magnus',
    description: 'The imperial gladiator school beside the Amphitheatrum Flavium. Fight as a paid guest (no ranks, no Infamia), swear the oath as an auctoratus (Infamia +20, which blocks equestrian rank), or be condemned ad ludum. Ranks need the oath.',
    joinInfamia: 20,
    ranks: ladder([
      ['tiro', 'Recruit', 'Tiro'],
      ['veteranus', 'Veteran', 'Veteranus'],
      ['palus-quartus', 'Fourth Post', 'Palus Quartus'],
      ['palus-tertius', 'Third Post', 'Palus Tertius'],
      ['palus-secundus', 'Second Post', 'Palus Secundus', { requires: [{ skill: MARTIAL, level: 45 }] }],
      ['primus-palus', 'First Post', 'Primus Palus', { requires: [{ skill: MARTIAL, level: 60 }] }],
      ['rudiarius', 'Freed Champion', 'Rudiarius', { questOnly: true }],
    ]),
  },
  {
    id: 'cohortes-urbanae', name: 'Urban Cohorts, Cohors X Urbana', latin: 'Cohortes Urbanae', lawful: true, citizensOnly: true, leader: 'npc-rufus', hq: 'castra-praetoria',
    description: 'The city’s police by day under the urban prefect, quartered in the Castra Praetoria. Citizens only, and no bounty.',
    enemies: ['latrones', 'grassatores', 'coniuratio'],
    ranks: ladder([
      ['miles', 'Soldier', 'Miles'],
      ['tesserarius', 'Watch-officer', 'Tesserarius'],
      ['optio', 'Deputy', 'Optio', { requires: [{ skill: ['blades', 'spear'], level: 30 }] }],
      ['centurio', 'Centurion', 'Centurio', { requires: [{ skill: ['blades', 'spear'], level: 45 }] }],
    ]),
  },
  {
    id: 'cultores-lavernae', name: 'Cultores Lavernae', latin: 'Collegium Cultorum Lavernae', leader: 'npc-faustus', hq: 'fullonica-suburana',
    description: 'Thieves posing as a burial club, meeting behind a fullonica off the Clivus Suburanus with a disused cistern below. Join by stealing the doorman’s token or bringing 25 den. of stolen goods.',
    ranks: ladder([
      ['tiro', 'Novice', 'Tiro'],
      ['fur', 'Thief', 'Fur'],
      ['sector-zonarius', 'Purse-cutter', 'Sector Zonarius'],
      ['effractor', 'Housebreaker', 'Effractor', { requires: [{ skill: 'locks-seals', level: 30 }] }],
      ['magister', 'Master', 'Magister', { questOnly: true, requires: [{ skill: ['pickpocket', 'locks-seals'], level: 45 }] }],
    ]),
  },
  {
    id: 'sodales-invicti', name: 'The Mithraic Cell', latin: 'Sodales Invicti', leader: 'npc-alcimus', hq: 'horrea-agrippiana',
    description: 'A secret cell in a cellar spelaeum under the Horrea Agrippiana. Entry by invitation, after a soldier vouches for you and you have spared a yielded foe.',
    ranks: ladder([
      ['corax', 'Raven', 'Corax'],
      ['nymphus', 'Bridegroom', 'Nymphus'],
      ['miles', 'Soldier', 'Miles'],
      ['leo', 'Lion', 'Leo'],
      ['perses', 'Persian', 'Perses'],
      ['heliodromus', 'Sun-runner', 'Heliodromus'],
      ['pater', 'Father', 'Pater', { questOnly: true }],
    ]),
  },
  {
    id: 'clientela', name: 'Clientela', latin: 'Clientela', lawful: false,
    description: 'Patronage: your patron’s house (Sergius Bassus, Calpurnia Severa or Vettius Crispinus). Attend three salutationes in formal dress (a toga, or a stola and palla) to become a client; non-citizens rise only to amicus until they are citizens.',
    nonCitizenMaxRank: 'amicus',
    ranks: ladder([
      ['cliens', 'Client', 'Cliens'],
      ['amicus-minor', 'Lesser Friend', 'Amicus Minor'],
      ['amicus', 'Friend of the House', 'Amicus', { requires: [{ skill: 'rhetoric', level: 30 }] }],
      ['procurator', 'Agent', 'Procurator', { requires: [{ skill: 'rhetoric', level: 45 }] }],
      ['eques', 'Knight', 'Eques', { questOnly: true }],
    ]),
  },
  {
    id: 'factio-prasina', name: 'The Greens', latin: 'Factio Prasina', leader: 'npc-felix', hq: 'stabula-factionum',
    description: 'The Green chariot faction, with stables in the Campus Martius. Choosing a color is exclusive; Riding 15 to drive.',
    exclusiveWith: ['factio-veneta'],
    ranks: ladder([
      ['agaso', 'Stable Hand', 'Agaso'],
      ['sparsor', 'Water-thrower', 'Sparsor'],
      ['hortator', 'Pace-rider', 'Hortator'],
      ['auriga', 'Charioteer', 'Auriga', { requires: [{ skill: 'equitatio', level: 30 }] }],
      ['miliarius', 'Winner of a Thousand', 'Miliarius', { questOnly: true }],
    ]),
  },
  {
    id: 'factio-veneta', name: 'The Blues', latin: 'Factio Veneta', leader: 'npc-venustus', hq: 'stabula-factionum',
    description: 'The Blue chariot faction. They hate the Greens. Choosing a color is exclusive; Riding 15 to drive.',
    exclusiveWith: ['factio-prasina'],
    ranks: ladder([
      ['agaso', 'Stable Hand', 'Agaso'],
      ['sparsor', 'Water-thrower', 'Sparsor'],
      ['hortator', 'Pace-rider', 'Hortator'],
      ['auriga', 'Charioteer', 'Auriga', { requires: [{ skill: 'equitatio', level: 30 }] }],
      ['miliarius', 'Winner of a Thousand', 'Miliarius', { questOnly: true }],
    ]),
  },
  // ---- the Guard: invitation to the speculatores is the Urban Cohorts' capstone reward
  {
    id: 'praetoriani', name: 'Praetorian Guard', latin: 'Cohortes Praetoriae', lawful: true, citizensOnly: true, hq: 'castra-praetoria',
    description: 'The emperor’s guard. Inside the city they wear tunic and cloak, swords hidden. Entry by invitation to the speculatores.',
    enemies: ['latrones', 'coniuratio'],
    ranks: ladder([['speculator', 'Scout of the Guard', 'Speculator', { questOnly: true }]]),
  },
  // ---- Fama with the city at large (no ranks)
  { id: 'plebs', name: 'The Plebs', latin: 'Plebs Urbana', description: 'The common people of Rome. Your Fama with them sets the arena crowd’s first mood and how the streets greet you.', ranks: [] },
  // ---- hostile groups (not joinable). Villains are individuals and cells, never whole peoples.
  { id: 'latrones', name: 'Brigands', latin: 'Latrones', description: 'Smugglers, tomb robbers and highwaymen of the wharves and the consular roads.', enemies: ['cohortes-urbanae', 'vigiles', 'praetoriani', 'player'], ranks: [] },
  { id: 'grassatores', name: 'Street Gangs', latin: 'Grassatores', description: 'Muggers and toughs who rule the alleys after dark.', enemies: ['cohortes-urbanae', 'vigiles', 'player'], ranks: [] },
  { id: 'coniuratio', name: 'The Cabal', latin: 'Coniuratio', description: 'The conspiracy around Trajan’s departure: contractors, Parthian silver, a Dacian revenge cell and a disgraced senator.', enemies: ['cohortes-urbanae', 'praetoriani', 'player'], ranks: [] },
];

/**
 * Fama tracks (§9.1): one per faction (`fama.vigiles`…), one per district (`fama.dist-<id>`), and
 * `fama.plebs` (the city crowd and the arena). Faction tracks are FactionSystem.reputation(id);
 * district tracks are Standing.fame('dist-<id>').
 */
export const FAMA_FACTIONS = ['vigiles', 'ludus-magnus', 'cohortes-urbanae', 'cultores-lavernae', 'sodales-invicti', 'clientela', 'factio-prasina', 'factio-veneta', 'plebs'];
export const famaTrack = (id: string) => `fama.${id}`;

/** Fama bounds (GDD §3.4). */
export const REPUTATION_MIN = STANDING.famaMin;
export const REPUTATION_MAX = STANDING.famaMax;
