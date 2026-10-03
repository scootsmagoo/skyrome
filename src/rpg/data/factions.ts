/**
 * PROVISIONAL factions (GDD/society research pending). Reputation runs from −1000 to 1000;
 * a rank is held when reputation ≥ its `minReputation` and the player has joined.
 * `lawful` factions receive crime reports (the guards). `enemies` attack each other on sight.
 */
import type { FactionDef } from '../types';

export const FACTIONS: FactionDef[] = [
  // ---- law and order
  {
    id: 'urbaniciani', name: 'Urban Cohorts', latin: 'Cohortes Urbanae', lawful: true,
    description: 'The city’s police under the Prefect of the City, quartered with the Praetorians in the Castra Praetoria. They patrol by day and keep order at the games.',
    enemies: ['latrones', 'grassatores'],
    ranks: [
      { id: 'miles', title: 'Soldier', latin: 'Miles', minReputation: 0 },
      { id: 'tesserarius', title: 'Watch-officer', latin: 'Tesserarius', minReputation: 150 },
      { id: 'optio', title: 'Deputy', latin: 'Optio', minReputation: 350 },
      { id: 'centurio', title: 'Centurion', latin: 'Centurio', minReputation: 700 },
    ],
  },
  {
    id: 'vigiles', name: 'The Watch', latin: 'Cohortes Vigilum', lawful: true,
    description: 'Seven cohorts of freedmen who fight the fires of Rome and patrol its streets at night with buckets, axes and cudgels.',
    enemies: ['latrones', 'grassatores'],
    ranks: [
      { id: 'miles', title: 'Watchman', latin: 'Miles', minReputation: 0 },
      { id: 'sebaciarius', title: 'Torch-bearer', latin: 'Sebaciarius', minReputation: 100 },
      { id: 'siphonarius', title: 'Pump-master', latin: 'Siphonarius', minReputation: 300 },
      { id: 'centurio', title: 'Centurion', latin: 'Centurio', minReputation: 600 },
      { id: 'tribunus', title: 'Tribune', latin: 'Tribunus', minReputation: 900 },
    ],
  },
  {
    id: 'praetoriani', name: 'Praetorian Guard', latin: 'Cohortes Praetoriae', lawful: true,
    description: 'The emperor’s own guard: well paid, well armed and well aware that they have made and unmade emperors.',
    enemies: ['latrones'],
    ranks: [
      { id: 'miles', title: 'Guardsman', latin: 'Miles', minReputation: 0 },
      { id: 'speculator', title: 'Scout of the Guard', latin: 'Speculator', minReputation: 250 },
      { id: 'evocatus', title: 'Recalled Veteran', latin: 'Evocatus', minReputation: 500 },
      { id: 'centurio', title: 'Centurion', latin: 'Centurio', minReputation: 800 },
    ],
  },
  // ---- society
  {
    id: 'populus', name: 'People of Rome', latin: 'Populus Romanus',
    description: 'The ordinary citizens, freedmen and slaves of the city. Your standing with them is your fame.',
    ranks: [
      { id: 'ignotus', title: 'Unknown', latin: 'Ignotus', minReputation: 0 },
      { id: 'notus', title: 'Known', latin: 'Notus', minReputation: 150 },
      { id: 'clarus', title: 'Famous', latin: 'Clarus', minReputation: 450 },
      { id: 'amicus', title: 'Friend of the People', latin: 'Amicus Populi', minReputation: 850 },
    ],
  },
  {
    id: 'mercatores', name: 'Guild of Merchants', latin: 'Collegium Mercatorum',
    description: 'Traders and shopkeepers of the Forum, the markets and the river port. Members trade on better terms.',
    ranks: [
      { id: 'socius', title: 'Associate', latin: 'Socius', minReputation: 0 },
      { id: 'negotiator', title: 'Trader', latin: 'Negotiator', minReputation: 200 },
      { id: 'magister', title: 'Master of the Guild', latin: 'Magister', minReputation: 600 },
    ],
  },
  {
    id: 'ludus', name: 'Ludus Magnus', latin: 'Ludus Magnus',
    description: 'The great imperial gladiator school beside the Flavian Amphitheatre, connected to the arena by a tunnel.',
    ranks: [
      { id: 'tiro', title: 'Recruit', latin: 'Tiro', minReputation: 0 },
      { id: 'veteranus', title: 'Veteran', latin: 'Veteranus', minReputation: 200 },
      { id: 'primus_palus', title: 'First of the School', latin: 'Primus Palus', minReputation: 550 },
      { id: 'rudiarius', title: 'Freed Champion', latin: 'Rudiarius', minReputation: 900 },
    ],
  },
  // ---- circus factions (supporters' clubs; Domitian's Purple and Gold died with him)
  { id: 'prasina', name: 'The Greens', latin: 'Factio Prasina', enemies: [], description: 'The chariot faction of the common people — and, it is said, of the emperor’s own heart.', ranks: [{ id: 'fautor', title: 'Supporter', latin: 'Fautor', minReputation: 0 }, { id: 'sodalis', title: 'Member', latin: 'Sodalis', minReputation: 200 }, { id: 'patronus', title: 'Patron', latin: 'Patronus', minReputation: 600 }] },
  { id: 'veneta', name: 'The Blues', latin: 'Factio Veneta', enemies: [], description: 'The chariot faction of the respectable and the rich. They hate the Greens.', ranks: [{ id: 'fautor', title: 'Supporter', latin: 'Fautor', minReputation: 0 }, { id: 'sodalis', title: 'Member', latin: 'Sodalis', minReputation: 200 }, { id: 'patronus', title: 'Patron', latin: 'Patronus', minReputation: 600 }] },
  { id: 'russata', name: 'The Reds', latin: 'Factio Russata', description: 'The old faction of the Reds, junior partners of the Greens.', ranks: [{ id: 'fautor', title: 'Supporter', latin: 'Fautor', minReputation: 0 }, { id: 'sodalis', title: 'Member', latin: 'Sodalis', minReputation: 200 }] },
  { id: 'albata', name: 'The Whites', latin: 'Factio Albata', description: 'The Whites, junior partners of the Blues.', ranks: [{ id: 'fautor', title: 'Supporter', latin: 'Fautor', minReputation: 0 }, { id: 'sodalis', title: 'Member', latin: 'Sodalis', minReputation: 200 }] },
  // ---- cults
  {
    id: 'mithraei', name: 'Mysteries of Mithras', latin: 'Mithraici',
    description: 'A secret brotherhood of soldiers and freedmen who meet in cave-like shrines beneath the city. Seven grades lead to the light.',
    ranks: [
      { id: 'corax', title: 'Raven', latin: 'Corax', minReputation: 0 },
      { id: 'nymphus', title: 'Bridegroom', latin: 'Nymphus', minReputation: 100 },
      { id: 'miles', title: 'Soldier', latin: 'Miles', minReputation: 220 },
      { id: 'leo', title: 'Lion', latin: 'Leo', minReputation: 380 },
      { id: 'perses', title: 'Persian', latin: 'Perses', minReputation: 560 },
      { id: 'heliodromus', title: 'Sun-runner', latin: 'Heliodromus', minReputation: 760 },
      { id: 'pater', title: 'Father', latin: 'Pater', minReputation: 950 },
    ],
  },
  {
    id: 'isiaci', name: 'Servants of Isis', latin: 'Isiaci',
    description: 'Initiates of the Egyptian goddess, whose great temple stands in the Campus Martius beside the Saepta.',
    ranks: [
      { id: 'initiatus', title: 'Initiate', latin: 'Initiatus', minReputation: 0 },
      { id: 'pastophorus', title: 'Shrine-bearer', latin: 'Pastophorus', minReputation: 250 },
      { id: 'sacerdos', title: 'Priest', latin: 'Sacerdos', minReputation: 650 },
    ],
  },
  // ---- the underworld
  {
    id: 'cloacini', name: 'Children of Cloacina', latin: 'Filii Cloacinae',
    description: 'A brotherhood of thieves named for the goddess of the Great Drain, whose little shrine stands in the Forum. They know every tunnel under the city.',
    enemies: [],
    ranks: [
      { id: 'mus', title: 'Mouse', latin: 'Mus', minReputation: 0 },
      { id: 'fur', title: 'Thief', latin: 'Fur', minReputation: 150 },
      { id: 'sector', title: 'Cutpurse', latin: 'Sector', minReputation: 350 },
      { id: 'umbra', title: 'Shadow', latin: 'Umbra', minReputation: 650 },
      { id: 'rex', title: 'King of the Drain', latin: 'Rex Cloacae', minReputation: 950 },
    ],
  },
  {
    id: 'locustae', name: 'Heirs of Locusta', latin: 'Heredes Locustae',
    description: 'Poisoners for hire, who claim to keep the recipes of Nero’s infamous Gallic poisoner.',
    ranks: [
      { id: 'discipula', title: 'Apprentice', latin: 'Discipulus', minReputation: 0 },
      { id: 'venefica', title: 'Poisoner', latin: 'Veneficus', minReputation: 300 },
      { id: 'mater', title: 'Mother of Poisons', latin: 'Mater', minReputation: 800 },
    ],
  },
  // ---- hostile groups (not joinable)
  { id: 'latrones', name: 'Brigands', latin: 'Latrones', description: 'Highwaymen of the Campagna and the tombs along the consular roads.', enemies: ['urbaniciani', 'vigiles', 'praetoriani', 'player'], ranks: [] },
  { id: 'grassatores', name: 'Street Gangs', latin: 'Grassatores', description: 'Muggers and toughs of the Subura who rule the alleys after dark.', enemies: ['urbaniciani', 'vigiles', 'player'], ranks: [] },
  { id: 'daci', name: 'Dacian Avengers', latin: 'Daci', description: 'Survivors of Decebalus’s fallen kingdom, come to Rome for revenge.', enemies: ['praetoriani', 'urbaniciani', 'player'], ranks: [] },
];

/** Reputation bounds. */
export const REPUTATION_MIN = -1000;
export const REPUTATION_MAX = 1000;
