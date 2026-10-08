/**
 * Who a person in the crowd is (docs/research/folk.md): a stable persona for every unnamed NPC,
 * drawn from their crowd role, their look and their trade, seeded by their id so they are the same
 * person every time you talk to them. Pure data; the dialogue (src/dialogue/content/citizens.ts)
 * turns it into greetings and answers.
 *
 * Naming follows the period:
 *  - freeborn citizens carry the tria nomina (Gaius Julius Felix); women the family name and a
 *    cognomen (Caecilia Prima);
 *  - freed slaves take their former master's praenomen and nomen and keep their slave name as the
 *    cognomen (Marcus Ulpius Phoebus: a freedman of the emperor's own family);
 *  - slaves have one name, often Greek or a "hopeful" Latin one (Felix, Hilarus, Fortunatus);
 *  - foreigners keep their own name and say where they're from (Demetrios of Smyrna).
 */
import { Rng } from '../../core/Rng';

export type Status =
  | 'elite'
  | 'citizen'
  | 'freed'
  | 'slave'
  | 'poor'
  | 'foreign'
  | 'rural'
  | 'soldier'
  | 'watch'
  | 'religious'
  | 'vestal'
  | 'child'
  | 'elder'
  | 'reveler'
  | 'gladiator';

export type Mood = 'cheerful' | 'weary' | 'wary' | 'gossip' | 'grumpy' | 'pious' | 'proud';

export interface Persona {
  /** Full name ("Gaius Julius Felix"). */
  name: string;
  /** What friends call them ("Felix"). */
  short: string;
  status: Status;
  female: boolean;
  /** Trade key (station bark tables and role pools) and how they say it ("a baker"). */
  trade: string;
  tradeLabel: string;
  /** Where they live, as they'd say it ("on the third floor of an insula on the Vicus Longus"). */
  home: string;
  /** Where they were born ("here, in the Subura"; "Smyrna"). */
  origin: string;
  mood: Mood;
  age: 'young' | 'adult' | 'old';
  /** A spouse, children, a sweetheart, or nobody ("a wife and three girls"). */
  family: string;
  /** For slaves: the master; for freedmen: the patron; for clients: the patron. */
  master: string;
  /** A seed for picking among variant lines. */
  seed: number;
}

// ---------------------------------------------------------------- names

const PRAENOMINA = ['Gaius', 'Lucius', 'Marcus', 'Publius', 'Quintus', 'Titus', 'Gnaeus', 'Sextus', 'Aulus', 'Decimus', 'Tiberius'];
const NOMINA = ['Julius', 'Cornelius', 'Valerius', 'Aemilius', 'Caecilius', 'Claudius', 'Flavius', 'Junius', 'Licinius', 'Sempronius', 'Fabius', 'Antonius', 'Petronius', 'Sulpicius', 'Vettius', 'Pompeius', 'Terentius', 'Octavius', 'Annius', 'Marius'];
/** Imperial and great-house nomina a freedman takes from his former master. */
const PATRON_NOMINA = ['Ulpius', 'Flavius', 'Claudius', 'Julius', 'Cocceius', 'Plinius', 'Aemilius', 'Licinius', 'Calpurnius', 'Domitius'];
const COGNOMINA = ['Felix', 'Faustus', 'Rufus', 'Priscus', 'Saturninus', 'Severus', 'Secundus', 'Celer', 'Crispus', 'Niger', 'Longus', 'Fuscus', 'Maximus', 'Pudens', 'Verus', 'Marcellus', 'Sabinus', 'Iustus', 'Clemens', 'Tertius'];
const FEM_COGNOMINA = ['Prima', 'Secunda', 'Tertia', 'Maxima', 'Rufa', 'Felicula', 'Procula', 'Sabina', 'Severa', 'Lucilla', 'Paulla', 'Marcella', 'Iusta', 'Quarta'];
const SLAVE_M = ['Hilarus', 'Felix', 'Eros', 'Philemon', 'Syrus', 'Fortunatus', 'Onesimus', 'Hermes', 'Chrestus', 'Pamphilus', 'Dama', 'Stephanus', 'Epaphroditus', 'Narcissus', 'Phileros', 'Callistus', 'Zosimus', 'Primus', 'Thallus', 'Daos'];
const SLAVE_F = ['Chloe', 'Daphne', 'Lalage', 'Thais', 'Phoebe', 'Myrtale', 'Iris', 'Helena', 'Tyche', 'Philematium', 'Chrysis', 'Galene', 'Hedone', 'Melissa', 'Psyche', 'Syra'];
const GREEK_M = ['Demetrios', 'Apollonios', 'Dionysios', 'Theodoros', 'Nikias', 'Menandros', 'Kallias', 'Alexandros', 'Philippos', 'Diodoros'];
const GREEK_F = ['Eirene', 'Theodote', 'Kallisto', 'Nikarete', 'Sophrone', 'Doris'];
const SYRIAN_M = ['Barates', 'Malchus', 'Iarhai', 'Zabdas', 'Bargates', 'Abgar'];
const SYRIAN_F = ['Martha', 'Batsheba', 'Hadirat', 'Zenobia'];
const EGYPT_M = ['Harpocras', 'Ammonios', 'Horion', 'Petosiris', 'Sarapion', 'Paniskos'];
const EGYPT_F = ['Isidora', 'Tetheus', 'Thermouthis', 'Sarapias'];
const CHILD_M = ['Gaiolus', 'Lucilius', 'Pupus', 'Felicio', 'Marcellinus', 'Tertullus'];
const CHILD_F = ['Tulliola', 'Lucilla', 'Pupa', 'Primula', 'Iunilla'];

const FOREIGN_HOMES: Record<string, string[]> = {
  greek: ['Smyrna', 'Athens', 'Corinth', 'Ephesus', 'Rhodes', 'Pergamon', 'Nicomedia, in Bithynia'],
  syrian: ['Antioch', 'Palmyra', 'Emesa', 'Tyre', 'Damascus', 'Berytus'],
  egyptian: ['Alexandria', 'Memphis', 'Oxyrhynchus', 'Naukratis'],
  other: ['Gades, in Spain', 'Carthage', 'Lugdunum, in Gaul', 'Aquileia', 'Leptis Magna', 'Massilia', 'Sardis'],
};
const ITALY = ['Ostia', 'Praeneste', 'Tibur', 'Capua', 'Aricia', 'Veii', 'Lanuvium', 'Tusculum', 'Bovillae', 'Sabine country, near Reate', 'Puteoli', 'Ravenna'];
const ROMAN_HOMES = ['the Subura', 'the Velabrum', 'the Aventine', 'Transtiberim, across the river', 'the Esquiline', 'the Caelian', 'the Vicus Longus', 'the Argiletum', 'the streets below the Circus', 'the quarter by the Porta Capena'];
const STREETS = ['the Vicus Longus', 'the Clivus Suburanus', 'the Vicus Patricius', 'the Argiletum', 'the Vicus Tuscus', 'the Vicus Iugarius', 'the street under the Circus', 'the Clivus Publicius', 'the Vicus Sandalarius', 'the Vicus Cuprius'];

// ---------------------------------------------------------------- trades

/** Trades by station bark table (crowd/trades.ts) or role, as the person would name them. */
export const TRADE_LABELS: Record<string, string> = {
  pistor: 'a baker', tonsor: 'a barber', fullo: 'a fuller', librarius: 'a bookseller', sutor: 'a cobbler', thermopolium: 'keeper of a hot-food counter',
  vinarius: 'a wine-seller', caseus: 'a cheese-seller', lanius: 'a butcher', piscator: 'a fishmonger', balneator: 'a bath attendant', magister: 'a schoolmaster',
  scriba: 'a scribe for hire', margaritarius: 'a pearl-dealer', piperarius: 'a spice-dealer', saepta: 'a dealer in fine goods', nauta: 'a sailor of the Misenum fleet',
  libelli: 'a programme-seller at the games', botularius: 'a sausage-seller', frumentum: 'a clerk of the grain dole', haruspex: 'a haruspex', tibicen: 'a flute-player at the sacrifices',
  ostiarius: 'a doorkeeper', portitor: 'a customs officer', sortilega: 'a fortune-teller', argentarius: 'a money-changer', factio: 'a fan of the Greens',
  smith: 'a smith', carpenter: 'a carpenter', mason: 'a mason on the emperor’s works', potter: 'a potter', tanner: 'a tanner', dyer: 'a dyer', lampmaker: 'a lamp-maker',
  oil: 'an oil-seller', wine: 'a wine-seller', cloth: 'a cloth-seller', fruit: 'a fruit-seller', pottery: 'a seller of pots and lamps', perfume: 'a perfumer',
  weaver: 'a weaver', midwife: 'a midwife', seamstress: 'a seamstress', laundress: 'a laundress', nurse: 'a wet-nurse', barmaid: 'a barmaid', greens: 'a vegetable-seller',
  porter: 'a porter', stevedore: 'a porter on the river wharves', litter: 'a litter-bearer', water: 'a water-carrier', pedisequus: 'a footman', ornatrix: 'a lady’s maid', cook: 'a cook', copyist: 'a copyist',
  clerk: 'a clerk', dole: 'nobody’s man: the dole and a patron', client: 'a client of a great house', carter: 'a carter', farmer: 'a market gardener',
  merchant: 'a merchant', tutor: 'a tutor of Greek', doctor: 'a doctor', astrologer: 'an astrologer', trader: 'a trader', pilgrim: 'a pilgrim', courier: 'a courier',
  senator: 'a senator', matron: 'mistress of a great house', priest: 'a priest', vestal: 'a Vestal Virgin', soldier: 'a soldier of the urban cohorts', vigil: 'a vigil of the night watch',
  beggar: 'a beggar', child: 'nobody yet', veteran: 'a veteran', gladiator: 'a gladiator', idler: 'a gentleman of leisure', reveler: 'thirsty',
};

const ROLE_TRADES: Record<string, string[]> = {
  artisan: ['smith', 'carpenter', 'mason', 'potter', 'tanner', 'dyer', 'lampmaker', 'fullo', 'sutor'],
  merchant: ['oil', 'wine', 'cloth', 'fruit', 'pottery', 'perfume', 'merchant'],
  citizen: ['clerk', 'dole', 'stevedore', 'carpenter', 'cook', 'copyist', 'client'],
  'citizen-woman': ['weaver', 'midwife', 'seamstress', 'laundress', 'nurse', 'barmaid', 'greens'],
  porter: ['porter', 'litter', 'water'],
  attendant: ['pedisequus', 'ornatrix', 'cook'],
  torchbearer: ['pedisequus'],
  foreigner: ['tutor', 'doctor', 'astrologer', 'trader', 'merchant'],
  traveller: ['trader', 'pilgrim', 'courier', 'farmer'],
  farmer: ['farmer'],
  carter: ['carter'],
  idler: ['idler', 'dole'],
  client: ['client'],
  elder: ['veteran', 'dole', 'lampmaker', 'weaver'],
  senator: ['senator'],
  matron: ['matron'],
  priest: ['priest'],
  vestal: ['vestal'],
  soldier: ['soldier'],
  vigil: ['vigil'],
  beggar: ['beggar'],
  child: ['child'],
  reveler: ['reveler'],
  gladiator: ['gladiator'],
};

/** Trades that are women's work in the period (for picking a woman's trade from a mixed pool). */
const WOMEN_TRADES = new Set(['weaver', 'midwife', 'seamstress', 'laundress', 'nurse', 'barmaid', 'greens', 'ornatrix', 'perfume', 'fruit', 'cook', 'dole']);

// ---------------------------------------------------------------- the persona

export interface PersonaInput {
  /** A stable id (the NPC's). */
  id: string;
  /** Crowd role id (citizen, porter, senator…). */
  role: string;
  female: boolean;
  age?: 'child' | 'young' | 'adult' | 'middle' | 'old';
  /** The prompt label at spawn ("Freedman", "Greek", "Syrian", "Baker"…). */
  label?: string;
  /** A station's bark table (the trade at a stall or workshop). */
  barks?: string;
}

function statusOf(i: PersonaInput, rng: Rng): Status {
  const label = i.label ?? '';
  switch (i.role) {
    case 'senator':
    case 'matron':
      return 'elite';
    case 'porter':
    case 'attendant':
    case 'torchbearer':
      return 'slave';
    case 'carter':
      return rng.chance(0.6) ? 'slave' : 'freed';
    case 'beggar':
      return 'poor';
    case 'foreigner':
      return 'foreign';
    case 'traveller':
      return rng.chance(0.5) ? 'foreign' : 'rural';
    case 'farmer':
      return 'rural';
    case 'soldier':
      return 'soldier';
    case 'vigil':
      return 'watch';
    case 'priest':
      return 'religious';
    case 'vestal':
      return 'vestal';
    case 'child':
      return 'child';
    case 'elder':
      return 'elder';
    case 'reveler':
      return 'reveler';
    case 'gladiator':
      return 'gladiator';
    case 'merchant':
      return label === 'Freedman' || rng.chance(0.55) ? 'freed' : 'citizen';
    case 'artisan':
      return rng.weighted([['slave', 3], ['freed', 3], ['citizen', 4]] as const);
    default:
      return label === 'Freedman' ? 'freed' : rng.chance(0.25) ? 'freed' : 'citizen';
  }
}

function moodOf(status: Status, rng: Rng): Mood {
  const w: Record<Status, [Mood, number][]> = {
    elite: [['proud', 5], ['grumpy', 2], ['wary', 2], ['gossip', 1]],
    citizen: [['cheerful', 3], ['weary', 2], ['gossip', 3], ['grumpy', 2], ['wary', 1], ['pious', 1]],
    freed: [['proud', 3], ['cheerful', 3], ['gossip', 2], ['weary', 1], ['grumpy', 1]],
    slave: [['weary', 4], ['wary', 3], ['cheerful', 2], ['gossip', 1]],
    poor: [['weary', 4], ['grumpy', 2], ['pious', 2], ['cheerful', 1]],
    foreign: [['cheerful', 2], ['wary', 3], ['proud', 2], ['gossip', 1]],
    rural: [['cheerful', 3], ['weary', 2], ['wary', 2], ['pious', 1]],
    soldier: [['proud', 2], ['grumpy', 3], ['weary', 2]],
    watch: [['weary', 4], ['grumpy', 2], ['cheerful', 1]],
    religious: [['pious', 5], ['proud', 2]],
    vestal: [['pious', 3], ['proud', 3]],
    child: [['cheerful', 5], ['wary', 2]],
    elder: [['grumpy', 3], ['gossip', 3], ['pious', 2], ['weary', 2]],
    reveler: [['cheerful', 6], ['gossip', 2]],
    gladiator: [['proud', 3], ['grumpy', 2], ['cheerful', 2], ['weary', 1]],
  };
  return rng.weighted(w[status]);
}

function nameOf(status: Status, female: boolean, label: string, rng: Rng): { name: string; short: string; master: string } {
  const masterName = () => `${rng.pick(PRAENOMINA)} ${rng.pick(NOMINA)} ${rng.pick(COGNOMINA)}`;
  const femName = (nomen: string) => nomen.replace(/us$/, 'a').replace(/ius$/, 'ia');
  const citizen = () => {
    const nomen = rng.pick(NOMINA);
    if (female) {
      const cog = rng.pick(FEM_COGNOMINA);
      return { name: `${femName(nomen)} ${cog}`, short: cog, master: '' };
    }
    const cog = rng.pick(COGNOMINA);
    return { name: `${rng.pick(PRAENOMINA)} ${nomen} ${cog}`, short: cog, master: '' };
  };
  switch (status) {
    case 'slave':
    case 'gladiator': {
      const n = female ? rng.pick(SLAVE_F) : rng.pick(SLAVE_M);
      return { name: n, short: n, master: masterName() };
    }
    case 'freed': {
      const nomen = rng.pick(PATRON_NOMINA);
      const old = female ? rng.pick(SLAVE_F) : rng.pick(SLAVE_M);
      const praen = rng.pick(PRAENOMINA);
      const name = female ? `${femName(nomen)} ${old}` : `${praen} ${nomen} ${old}`;
      return { name, short: old, master: nomen === 'Ulpius' ? 'the emperor’s household' : `${praen} ${nomen} ${rng.pick(COGNOMINA)}` };
    }
    case 'foreign': {
      const kind = label === 'Syrian' ? 'syrian' : label === 'Egyptian' ? 'egyptian' : 'greek';
      const pool = kind === 'syrian' ? (female ? SYRIAN_F : SYRIAN_M) : kind === 'egyptian' ? (female ? EGYPT_F : EGYPT_M) : female ? GREEK_F : GREEK_M;
      const n = rng.pick(pool);
      return { name: n, short: n, master: '' };
    }
    case 'child': {
      const n = female ? rng.pick(CHILD_F) : rng.pick(CHILD_M);
      return { name: n, short: n, master: '' };
    }
    case 'poor':
      return rng.chance(0.5) ? citizen() : { name: rng.pick(female ? SLAVE_F : SLAVE_M), short: '', master: '' };
    case 'elite': {
      const c = citizen();
      return { ...c, short: c.name };
    }
    default:
      return citizen();
  }
}

function homeOf(status: Status, rng: Rng, trade: string): string {
  const floor = rng.pick(['on the third floor of an insula', 'on the fifth floor, under the tiles, of an insula', 'in two rooms over a cookshop', 'in a back room of the shop', 'in a cenaculum on the second floor of an insula']);
  switch (status) {
    case 'elite':
      return rng.pick(['in a house on the Caelian, with a garden', 'on the Esquiline, near the gardens of Maecenas', 'on the Quirinal, among the old families', 'on the slope of the Palatine', 'on the Aventine, above the river']);
    case 'slave':
      return rng.pick(['in my master’s house, under the stairs', 'in the slave quarters behind my master’s shop', 'in a cell off my master’s kitchen', 'wherever my master sleeps, at the foot of his door']);
    case 'poor':
      return rng.pick(['under the arches of the Circus', 'on the steps of the Temple of Saturn, when the aedile’s men let me', 'by the Pons Sublicius, where the beggars sit', 'in a stairwell in the Subura', 'in a tomb on the Appian Way, with the dead for neighbours']);
    case 'foreign':
      return rng.pick(['at an inn by the Porta Capena', 'with cousins in Transtiberim', 'in a room near the Emporium, where the ships unload', 'in a lodging-house in the Subura full of my countrymen']);
    case 'rural':
      return rng.pick(['on a farm out past the third milestone', 'in a village in the Alban hills', 'on a smallholding by the Via Labicana', 'in the Sabine country, two days’ walk']);
    case 'soldier':
      return 'in the Castra Praetoria, with the cohorts';
    case 'watch':
      return rng.pick(['at the station house of the cohort', 'in a room by our watch-post']);
    case 'religious':
      return 'in the priests’ house by the temple';
    case 'vestal':
      return 'in the House of the Vestals';
    case 'gladiator':
      return 'in a cell in the Ludus Magnus';
    case 'child':
      return `${floor} on ${rng.pick(STREETS)}, with my mother`;
    default:
      return trade === 'dole' || trade === 'client' ? `${floor} on ${rng.pick(STREETS)}` : `${floor} on ${rng.pick(STREETS)}`;
  }
}

function originOf(status: Status, label: string, rng: Rng): string {
  if (status === 'foreign') {
    const kind = label === 'Syrian' ? 'syrian' : label === 'Egyptian' ? 'egyptian' : label === 'Greek' ? 'greek' : rng.pick(['greek', 'other']);
    return rng.pick(FOREIGN_HOMES[kind]);
  }
  if (status === 'slave' || status === 'freed' || status === 'gladiator') return rng.pick(['Syria', 'Phrygia', 'Cappadocia', 'Thrace', 'Dacia, taken in the war', 'Egypt', 'Bithynia', 'Germany, beyond the Rhine', 'born a slave in this very house', 'born a slave on a farm in Campania']);
  if (status === 'rural') return rng.pick(ITALY);
  if (status === 'religious') return rng.pick(['a wife and sons; one of them will serve the god after me', 'nobody but the god and the temple slaves', 'a wife who thinks the god asks too much of me']);
  if (status === 'soldier' || status === 'watch') return rng.pick(ITALY.concat(['here, in Rome']));
  return rng.chance(0.65) ? `here, in ${rng.pick(ROMAN_HOMES)}` : rng.pick(ITALY);
}

function familyOf(status: Status, female: boolean, rng: Rng, old = false): string {
  if (status === 'vestal' || status === 'child') return '';
  if (status === 'slave') return rng.pick(['a woman in the same household; our master lets us call it a marriage', 'nobody. My mother was sold to Capua when I was small', 'a little boy, born in the house. He belongs to the master too', 'nobody, and I like it that way', 'a sweetheart in the house across the street. We wave']);
  if (status === 'gladiator') return rng.pick(['a woman in the Subura who waits outside on bout days', 'nobody. Gladiators shouldn’t', 'a son I haven’t seen since the oath']);
  if (status === 'poor') return rng.pick(['nobody, not any more. Fever took them', 'a daughter in service in a big house. She doesn’t come', 'a dog. He’s more loyal than my brothers were']);
  if (status === 'soldier' || status === 'watch') return rng.pick(['no wife: soldiers may not marry. A woman, though, and a boy', 'a mother in the country who thinks I guard the emperor himself', 'nobody but the century']);
  if (old || status === 'elder') return rng.pick([female ? 'a husband in the ground and two sons who visit at the Parentalia' : 'a wife in the ground and two sons who visit at the Parentalia', 'grandchildren, five of them, all loud', 'nobody left but a cat and the neighbours', female ? 'a daughter who married well and forgot her mother' : 'a son with the legions on the Danube']);
  const kids = rng.int(0, 4);
  const kidsTxt = kids === 0 ? 'no children yet' : kids === 1 ? 'one child' : `${['', '', 'two', 'three', 'four'][kids]} children`;
  if (female) return rng.pick([`a husband and ${kidsTxt}`, `${kidsTxt}, and a husband who drinks`, 'a husband at sea, on the grain ships', `I’m a widow, with ${kidsTxt}`]);
  return rng.pick([`a wife and ${kidsTxt}`, 'a wife who runs the shop better than I do', 'no wife yet; my mother is looking', `a wife, ${kidsTxt}, and her mother`, 'I buried my wife at the Kalends of March']);
}

export function makePersona(i: PersonaInput): Persona {
  const rng = new Rng(`folk:${i.id}:${i.role}:${i.female ? 'f' : 'm'}`);
  const status = statusOf(i, rng);
  const label = i.label ?? '';
  const pool = i.barks && TRADE_LABELS[i.barks] ? [i.barks] : (ROLE_TRADES[i.role] ?? ['clerk']);
  const forSex = pool.filter((t) => (i.female ? WOMEN_TRADES.has(t) || pool.length === 1 : !WOMEN_TRADES.has(t) || pool.length === 1));
  let trade = rng.pick(forSex.length ? forSex : pool);
  if (status === 'elite') trade = i.female ? 'matron' : 'senator';
  const n = nameOf(status, i.female, label, rng);
  const age = i.age === 'child' ? 'young' : i.age === 'old' || i.role === 'elder' ? 'old' : i.age === 'young' ? 'young' : 'adult';
  return {
    name: n.name,
    short: n.short || n.name,
    status,
    female: i.female,
    trade,
    tradeLabel: TRADE_LABELS[trade] ?? 'a working man',
    home: homeOf(status, rng, trade),
    origin: originOf(status, label, rng),
    mood: moodOf(status, rng),
    age,
    family: familyOf(status, i.female, rng, age === 'old'),
    master: n.master,
    seed: Math.floor(rng.next() * 1e9),
  };
}

/** Pick one of several lines, the same one every time for this person (and key). */
export function vary(p: Persona, key: string, lines: readonly string[]): string {
  if (!lines.length) return '';
  let h = p.seed;
  for (let k = 0; k < key.length; k++) h = (h * 31 + key.charCodeAt(k)) >>> 0;
  return lines[h % lines.length];
}
