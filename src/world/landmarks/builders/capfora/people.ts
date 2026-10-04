/**
 * Who stands at the capfora spots (pure data + layout, no game objects): for every 'npc', 'vendor'
 * and 'stall' spot of the Capitoline and the Imperial Fora, and a few benches, the role and dress
 * (an avatar role), what they are doing (an idle loop), a gesture now and then, and a few lines to
 * say when you talk to them. Groups (the rededication crowd, pilgrims, porters, a family) are a
 * handful of people round their spot. `crowd.ts` turns these into people in the running game;
 * tests check the layout against the landmarks' colliders.
 *
 * The lines are written for 11 May AD 113: the Emperor rededicates the Temple of Venus Genetrix
 * and his Column tomorrow.
 */
import * as THREE from 'three';
import type { ActionClip, IdleLoop } from '../../../../actors/Actor';
import type { AvatarRole } from '../../../../actors/avatar/variants';
import type { CapSpot } from './frame';

export interface Topic {
  ask: string;
  answer: string;
}

export interface PersonDef {
  /** One role, or one per group member (cycled). */
  role: AvatarRole | AvatarRole[];
  idle: IdleLoop | IdleLoop[];
  /** Shown in the prompt and the dialogue panel. */
  name: string;
  title?: string;
  greet: string;
  topics?: Topic[];
  /** Group size (default 1). */
  n?: number;
  /** Played now and then. */
  gesture?: ActionClip;
}

/** One person to place: landmark-local position and heading (spot convention), and who. */
export interface PersonPlace {
  /** `<spot id>` or `<spot id>:<k>` for group members. */
  id: string;
  position: THREE.Vector3;
  heading: number;
  role: AvatarRole;
  idle: IdleLoop;
  def: PersonDef;
}

const MONEY: PersonDef = {
  role: 'merchant',
  idle: 'sit',
  name: 'Argentarius',
  title: 'Money-changer',
  greet: 'Changing coin, friend? Drachmas, Egyptian tetradrachms, Gaulish silver: I weigh them all, and my scales are honest, by Mercury.',
  topics: [
    { ask: 'What is the rate today?', answer: 'Four sesterces to the denarius, twenty-five denarii to the gold aureus, as always. The commission is my living: one as in the denarius.' },
    { ask: 'Is business good?', answer: 'With the Dacian gold coming in? Never better. Half the city wants to borrow for tomorrow’s feast, the other half to lend.' },
  ],
  gesture: 'talk',
};

const BANKER: PersonDef = {
  ...MONEY,
  idle: 'stand',
  name: 'Argentarius',
  title: 'Banker of the Basilica Argentaria',
  greet: 'The Emperor built us a proper hall at last: no more tables in the rain. Deposits, loans, letters of credit to Puteoli or Alexandria. What will it be?',
  topics: [
    { ask: 'Who uses this hall?', answer: 'Bankers by day, and a schoolmaster with his boys in the corner. Mind the walls: the little wretches scratch Virgil on every pier.' },
    { ask: 'Can I leave money here?', answer: 'Of course. I write it in my codex, you get a token. And should I go bankrupt, the praetor sells my house. Rome is a city of law.' },
  ],
};

const SHOP: Record<string, PersonDef> = {
  textile: { role: 'plebeian-woman', idle: 'stand', name: 'Cloth seller', greet: 'Wool from Tarentum, linen from Egypt, a fine purple border for your toga, if your purse is fat enough.', gesture: 'wave' },
  wine: { role: 'plebeian-man', idle: 'stand', name: 'Wine seller', greet: 'Alban, Falernian, or the cheap Vatican stuff that gives you a headache? Tomorrow everyone drinks to Venus, so buy today.', gesture: 'wave' },
  general: { role: 'plebeian-woman', idle: 'stand', name: 'Shopkeeper', greet: 'Lamps, oil, a bit of cheese, rope. If I haven’t got it, my cousin in the Velabrum has.' },
};

const GREENS: PersonDef = {
  role: 'plebeian-woman',
  idle: 'work',
  name: 'Greengrocer',
  greet: 'Cabbages, leeks, lettuce from the Forum Holitorium, fresh this morning! Cabbage keeps you healthy, old Cato said, and he lived to eighty-five.',
};

/** By `<landmark>:<spot>`; a key ending in '*' matches a prefix. */
export const PEOPLE: Record<string, PersonDef> = {
  // ---- Forum of Augustus and Mars Ultor
  'forum-augustus:praetor': {
    role: 'patrician-man',
    idle: 'sit',
    name: 'The praetor',
    title: 'Praetor urbanus',
    greet: 'Silence before the tribunal! If you have business with the court, wait until your case is called.',
    topics: [
      { ask: 'What case is being heard?', answer: 'A freedman says his patron’s will makes him heir to a fuller’s shop on the Vicus Tuscus. The patron’s sons say the seals are forged. The jurors will decide.' },
      { ask: 'Why hold court here?', answer: 'The god Augustus built this forum for the courts as much as for Mars. Too many trials for the old Forum: here the praetors sit in the shade.' },
    ],
  },
  'forum-augustus:advocate': {
    role: 'patrician-man',
    idle: 'talk',
    name: 'An advocate',
    greet: '…and so I ask you, judges: would a man who wept at his patron’s pyre forge his hand? — Not now, stranger, I am pleading!',
    topics: [{ ask: 'Are you winning?', answer: 'Rhetoric wins more cases than the truth, my friend. I studied with a pupil of Quintilian. Come back when the water clock runs out.' }],
    gesture: 'talk',
  },
  'forum-augustus:jurors': { role: ['patrician-man', 'freedman'], idle: 'sit', n: 2, name: 'A juror', greet: 'Shh. We are judging. Or trying to stay awake: that advocate has been talking since the second hour.' },
  'forum-augustus:magistrate': {
    role: 'patrician-man',
    idle: 'stand',
    name: 'A propraetor',
    title: 'Governor-designate of Baetica',
    greet: 'Tomorrow at dawn I sacrifice to Mars Ultor and set out for my province. Every governor leaves from this forum, as Augustus decreed.',
    topics: [{ ask: 'What is Baetica like?', answer: 'Olive oil, silver mines and senators: the Emperor’s own family came from there, from Italica. I had better govern it well.' }],
  },
  'forum-augustus:toga-virilis': {
    role: ['patrician-man', 'matron', 'child', 'elderly'],
    idle: ['talk', 'stand', 'stand', 'stand'],
    n: 4,
    name: 'A proud father',
    greet: 'Today my son puts on the toga of a man! We have offered his bulla to the household gods; now his name goes on the rolls, and then to the baths.',
    gesture: 'talk',
  },
  'temple-mars-ultor:priest': {
    role: 'priest',
    idle: 'pray',
    name: 'Priest of Mars',
    greet: 'Here the Senate votes on war and triumphs, and the standards that Crassus lost to the Parthians hang before the god. Mars the Avenger keeps them.',
    topics: [{ ask: 'May I go inside?', answer: 'Walk up and see the standards in the cella, and the great statues of Mars, Venus and the deified Julius. Speak softly.' }],
    gesture: 'pray',
  },

  // ---- Forum of Caesar, Venus Genetrix, the Basilica Argentaria
  'forum-caesar:taberna-*': MONEY,
  'forum-caesar:festival-crowd': {
    role: ['plebeian-man', 'plebeian-woman', 'child', 'elderly', 'freedman', 'greek'],
    idle: ['cheer', 'talk', 'stand', 'stand', 'talk', 'stand'],
    n: 6,
    name: 'A Roman in the crowd',
    greet: 'Tomorrow the Emperor himself dedicates the temple, on the same day as his Column! They say there will be a distribution. Coins, maybe, or oil.',
    topics: [{ ask: 'Why so many garlands?', answer: 'Venus Genetrix is the mother of the Julii and of all Romans. Trajan rebuilt her temple from the ground up. Look at that frieze: cupids everywhere!' }],
    gesture: 'cheer',
  },
  'forum-caesar:stall-*': {
    role: 'plebeian-woman',
    idle: 'work',
    name: 'Garland seller',
    greet: 'Roses! Laurel! A crown for the rededication, only two asses! You can’t stand before Venus bareheaded tomorrow.',
    gesture: 'wave',
  },
  'forum-caesar:herald': {
    role: 'plebeian-man',
    idle: 'talk',
    name: 'Herald',
    title: 'Praeco',
    greet: 'Hear, Quirites! On the fourth day before the Ides of May the Emperor Caesar Nerva Trajan Augustus, conqueror of Dacia, dedicates the temple of Venus Genetrix, restored!',
    topics: [{ ask: 'What happens tomorrow?', answer: 'A sacrifice at dawn, the dedication, then the Emperor goes on to his own forum to dedicate the Column. Be here early if you want to see anything.' }],
    gesture: 'wave',
  },
  'forum-caesar:stands': { role: ['patrician-man', 'patrician-man', 'elderly'], idle: 'sit', n: 3, name: 'A senator', greet: 'Testing the benches for tomorrow. Splinters! For senators of Rome! I shall write to the curator of public works.' },
  'forum-caesar:portico-ne': { role: 'elderly', idle: 'sit', name: 'An old man', greet: 'I saw the old temple burn in the year of the four emperors… no, that was the Capitol. My memory, young man. Sit, sit.' },
  'temple-venus-genetrix:workmen': {
    role: ['slave', 'plebeian-man'],
    idle: 'work',
    n: 2,
    name: 'A marble worker',
    greet: 'Mind the dust! The cupids on this frieze must be finished by dawn tomorrow, or the contractor will dock our pay.',
    topics: [{ ask: 'Who designed it?', answer: 'The Emperor’s architect, Apollodorus of Damascus, so they say. The same man who built the bridge over the Danube and the great new forum.' }],
  },
  'basilica-argentaria:mensa-*': BANKER,

  // ---- Forum of Nerva, the Subura, the Templum Pacis
  'forum-nerva:bookseller': {
    role: 'greek',
    idle: 'stand',
    name: 'Bookseller',
    title: 'Of the Argiletum',
    greet: 'Martial’s epigrams, the new copy! Five denarii in purple covers, or a cheaper one for the poor scholar. Or Pliny’s letters, all nine books?',
    topics: [{ ask: 'Is Martial still in Rome?', answer: 'He went home to Spain years ago and died there, they say. His books sell better than ever. The dead never ask for their royalties.' }],
    gesture: 'wave',
  },
  'forum-nerva:porticus-absidata': { role: ['slave', 'slave', 'freedman'], idle: 'sitGround', n: 3, name: 'A porter', greet: 'Grain sacks up from the river since dawn. Leave us be till the sun turns, friend.' },
  'forum-nerva:passers-by': {
    role: ['plebeian-man', 'plebeian-woman', 'syrian'],
    idle: ['talk', 'talk', 'stand'],
    n: 3,
    name: 'A passer-by',
    greet: 'This forum is a street with columns: everyone cuts through to the Argiletum. Mind your purse in the Subura beyond that wall.',
  },
  'subura:vicomagister': {
    role: 'freedman',
    idle: 'stand',
    name: 'The vicomagister',
    greet: 'I keep the shrine of the Lares at this crossroads. The neighbourhood pays for the lamps and the games at the Compitalia. And I hear everything.',
    topics: [{ ask: 'What is the Subura like?', answer: 'Loud, crowded, dirty and alive. Tenements six storeys high, taverns that never close. Julius Caesar was born here, they say. So was half the trouble in Rome.' }],
  },
  'templum-pacis:librarian': {
    role: 'greek',
    idle: 'stand',
    name: 'The librarian',
    title: 'Library of the Temple of Peace',
    greet: 'Vespasian filled this temple with the masterpieces of Greece and the spoils of Jerusalem. Scholars come from everywhere to read in the library. Quietly, please.',
    topics: [{ ask: 'What spoils?', answer: 'The golden lampstand and the table from the temple in Jerusalem, carried in Titus’ triumph. The scrolls of their Law are in the palace.' }],
  },

  // ---- the Capitol
  'temple-jupiter-capitolinus:flamen': {
    role: 'priest',
    idle: 'pray',
    name: 'The Flamen Dialis',
    greet: 'The priest of Jupiter may not ride a horse, look upon an army under arms or sleep three nights away from his bed. Speak softly near the altar, stranger.',
    gesture: 'pray',
  },
  'temple-jupiter-capitolinus:votive-seller': {
    role: 'plebeian-woman',
    idle: 'work',
    name: 'Votive seller',
    greet: 'Clay figures for a vow, incense, a garland for Jupiter? Every pilgrim leaves something on the Capitol.',
    gesture: 'wave',
  },
  'temple-jupiter-capitolinus:gate-guard': { role: 'slave', idle: 'guard', name: 'Temple slave', greet: 'The Area Capitolina is open from dawn. Keep your blade sheathed beyond the gate: this is Jupiter’s ground.' },
  'temple-jupiter-capitolinus:forecourt-crowd': {
    role: ['egyptian', 'syrian', 'plebeian-woman', 'greek'],
    idle: ['stand', 'pray', 'stand', 'talk'],
    n: 4,
    name: 'A pilgrim',
    greet: 'We walked up from Ostia to see the golden roof. It shines like a second sun! Domitian gilded it, and it cost more than twelve thousand talents, they say.',
  },
  'temple-jupiter-capitolinus:haruspex': {
    role: 'priest',
    idle: 'work',
    name: 'A haruspex',
    greet: 'The liver is clean, the gall full. The gods accept the sacrifice. This time.',
    topics: [{ ask: 'Can you read my future?', answer: 'For a lamb, I can read the gods’ will about a day or a deed. Your future? That costs an ox.' }],
  },
  'tarpeian-rock:lictor': { role: 'freedman', idle: 'guard', name: 'A lictor', greet: 'Traitors and murderers go over the edge here. Don’t lean too far, stranger.' },

  // ---- the Asylum and the Arx
  'asylum:suppliant': {
    role: 'slave',
    idle: 'sitGround',
    name: 'A runaway slave',
    greet: 'Romulus opened this refuge to anyone who came. Do you think the old right still holds? I only ask a few nights’ peace before my master finds me.',
  },
  'asylum:priest': { role: 'priest', idle: 'sweep', name: 'Aedituus of Veiovis', greet: 'I keep the clearing swept and the god’s lamp lit. Veiovis is young, and holds arrows: do not anger him.' },
  'asylum:benchW': { role: 'elderly', idle: 'sit', name: 'An old Quirite', greet: 'Between the two groves it is always cool. I come up every afternoon to watch the city.' },
  'temple-juno-moneta:arx-guard': { role: 'slave', idle: 'guard', name: 'Public slave', greet: 'The Arx. Mind the geese: they still raise the alarm better than any watchman.' },
  'temple-juno-moneta:geese': {
    role: 'slave',
    idle: 'work',
    name: 'Keeper of the geese',
    greet: 'Juno’s geese woke Manlius when the Gauls climbed the cliff. Every year one rides through the city on a purple cushion, and a dog is crucified. Dogs failed.',
  },
  'auguraculum:augur': {
    role: 'priest',
    idle: 'stand',
    name: 'An augur',
    greet: 'From here the augurs mark out the sky with the lituus and watch the birds, as Romulus did. An eagle on the left is a good sign, for us Romans.',
  },
  'insula-aracoeli:insula-shopDoor*': SHOP.general,

  // ---- Sant'Omobono and the Porta Carmentalis
  'sant-omobono-temples:cake-seller': { role: 'plebeian-woman', idle: 'work', name: 'Cake seller', greet: 'Honey cakes for Mater Matuta! The Matralia is in June, but the goddess likes them all year.' },
  'sant-omobono-temples:matron': { role: 'matron', idle: 'pray', name: 'A matron', greet: 'Only women married once may crown Mater Matuta’s statue. Slave women may not even enter. I’ve brought liba for her.' },
  'porta-carmentalis:superstitious': {
    role: 'plebeian-man',
    idle: 'stand',
    name: 'A cautious traveller',
    greet: 'Through the right-hand arch? Never! The three hundred and six Fabii marched out that way and all died at the Cremera. I go round by the left.',
  },
  'porta-carmentalis:greens-seller': GREENS,
};

/** The person (or group) for a spot, or null. */
export function personFor(lmId: string, spot: CapSpot): PersonDef | null {
  const key = `${lmId}:${spot.id}`;
  const exact = PEOPLE[key];
  if (exact) return exact;
  for (const [k, def] of Object.entries(PEOPLE)) {
    if (!k.endsWith('*') || !key.startsWith(k.slice(0, -1))) continue;
    // Shops in the Forum of Caesar: the money-changers, a cloth seller, a wine seller.
    if (k === 'forum-caesar:taberna-*' && spot.label && !/argentarius/i.test(spot.label)) return SHOP[/textile/.test(spot.label) ? 'textile' : 'wine'];
    if (k === 'insula-aracoeli:insula-shopDoor*' && spot.label && SHOP[spot.label]) return SHOP[spot.label];
    return def;
  }
  if (spot.kind === 'vendor' || spot.kind === 'stall') return { role: 'merchant', idle: 'stand', name: 'A trader', greet: 'Good day! Have a look, no charge for looking.' };
  if (spot.kind === 'npc') return { role: 'plebeian-man', idle: 'stand', name: spot.label ?? 'A Roman', greet: 'Salve, stranger.' };
  return null;
}

const pick = <T>(v: T | T[], k: number): T => (Array.isArray(v) ? v[k % v.length] : v);

/**
 * Everyone at a landmark's spots (local space). A group stands in a loose arc round its spot, in
 * front of it, facing the way the spot faces; members of a seated group sit side by side.
 */
export function peopleAt(lmId: string, spots: readonly CapSpot[]): PersonPlace[] {
  const out: PersonPlace[] = [];
  for (const s of spots) {
    if (s.kind !== 'npc' && s.kind !== 'vendor' && s.kind !== 'stall' && !PEOPLE[`${lmId}:${s.id}`]) continue;
    const def = personFor(lmId, s);
    if (!def) continue;
    const n = def.n ?? 1;
    const h = s.heading ?? 0;
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    for (let k = 0; k < n; k++) {
      const idle = pick(def.idle, k);
      let ax = 0;
      let az = 0;
      let hk = h;
      if (n > 1) {
        // Side by side for a seated row; an arc a step apart otherwise, each turned a little
        // towards the middle of the group.
        const t = k - (n - 1) / 2;
        const side = idle === 'sit' ? 0.75 * t : 0.95 * t;
        const fwd = idle === 'sit' ? 0 : 0.35 * Math.abs(t) - 0.3 * (k % 2);
        ax = -fz * side + fx * fwd;
        az = fx * side + fz * fwd;
        if (idle !== 'sit') hk = h - t * 0.35;
      }
      out.push({
        id: n > 1 ? `${s.id}:${k}` : s.id,
        position: s.position.clone().add(new THREE.Vector3(ax, 0, az)),
        heading: hk,
        role: pick(def.role, k),
        idle,
        def,
      });
    }
  }
  return out;
}
