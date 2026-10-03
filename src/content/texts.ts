/**
 * In-world texts for v0.1: letters, tablets, notices, a playbill, a curse tablet, notes and drafts
 * the player can carry and read (ItemDefs of type 'book', registered in the item catalogue through
 * src/rpg/data/items/index.ts), plus wall texts (graffiti, painted notices) that the world can
 * attach to places as "Read" interactables.
 *
 * The reader picks its look from the tags: 'letter', 'tablet', 'note' or 'scroll' (default: book).
 * Paragraphs are separated by blank lines; `*italic*` is honored.
 *
 * Confidence (GDD §0): texts marked [A] follow a surviving original (cited); [G] are invented in
 * the period's manner and must never be presented as history in the Lexicon.
 */
import type { ItemDef } from '../rpg/types';

function text(id: string, name: string, latin: string, kind: 'letter' | 'tablet' | 'note' | 'scroll' | 'book', description: string, body: string, extra: Partial<ItemDef> = {}): ItemDef {
  return {
    id,
    name,
    latin,
    type: 'book',
    weight: kind === 'tablet' ? 0.3 : 0.05,
    value: 0,
    stackable: false,
    icon: kind === 'tablet' ? '▭' : '✉',
    description,
    text: body,
    tags: ['text', ...(kind === 'book' ? [] : [kind])],
    ...extra,
  };
}

/** Readable items (all [G] unless a source is named in the text's comment). */
export const TEXT_ITEMS: ItemDef[] = [
  // mq-01: found on the courier. Travel warrants (diplomata) of the imperial post: Pliny Ep. 10.45–46, 10.120–121 [A]; this one is [G].
  text(
    'evectio-festi',
    'Courier’s Warrant',
    'diploma evectionis',
    'letter',
    'A folded bronze-hinged warrant of the imperial post, stained at one corner. The name on it is C. Marius Festus.',
    '*Imp(erator) Caesar Nerva Traianus Aug(ustus) Germ(anicus) Dacicus, pontifex maximus, to the magistrates of the towns and to the managers of the post-stations along the Via Appia, greetings.*\n\nGive to the bearer, C. Marius Festus, *frumentarius*, one light carriage and two animals, and lodging for one night where he asks it, as far as the city.\n\nValid until the Kalends of June. Whoever delays him will explain the delay to me.\n\n(On the back, in a hurried hand:) *Castor — XIV — not before dusk. Speak to no one in the Forum.*',
    { tags: ['text', 'letter', 'quest-lead'] },
  ),
  // The praefectus vigilum told tenants to keep water in their rooms: Digest 1.15.3.3–4 (Paul) [A]. Wording [G].
  text(
    'nuntius-vigilum',
    'Notice of the Night Watch',
    'edictum praefecti vigilum',
    'note',
    'A copy of the watch prefect’s standing order, the kind the vigiles nail to stairwell doors.',
    'THE PREFECT OF THE WATCH TO THE TENANTS OF THE FIFTH COHORT’S DISTRICT.\n\nEvery tenant shall keep water in his room, a full jar at least, against fire.\n\nNo one shall leave a lamp burning when he goes out, nor a brazier unattended, nor cook on the stairs.\n\nThe careless will be beaten with rods; the very careless will be sent to the prefect. Those who start a fire on purpose will be sent to the Prefect of the City.\n\nWhoever sees smoke shall shout *“Fire!”* and send a boy to the watch post. The vigiles come by night with buckets, hooks and the pump. Do not pour oil on the fire; it happens more often than you would think.',
  ),
  // Painted munus notices: Pompeii, e.g. CIL IV 3884 ("gladiatorum paria XX … venatio, sparsiones, vela erunt") [A]. This one is [G].
  text(
    'libellus-munerarius',
    'Playbill for a Funeral Munus',
    'edictum muneris',
    'note',
    'A wax-tablet copy of a painted games notice from the Ludus gate. Someone has scratched a little net beside one name.',
    'FOR THE SHADE OF QUINTUS LOLLIUS FLACCUS\n\nhis son, Q. Lollius Severus, will give\n\nTEN PAIRS OF GLADIATORS\n\nat his father’s tomb on the Via Appia, at the second milestone, on the third day before the Ides of June.\n\nHunt of hares and a bear. Sprinklings of saffron water. AWNINGS.\n\nThe pairs are lent by the Ludus Magnus, by kind permission of the procurator. Among them: NEREUS the retiarius, victor of thirty-one; FEROX the Gaul.\n\n*Good luck to the sponsor! Good luck to Nereus!*',
  ),
  // Curse tablets with the "bind him" formula and the plea to Mercury: Bath and Uley tablets (Tab. Sulis, Uley) [A]. This one is [G].
  {
    id: 'defixio-capena',
    name: 'Curse Tablet against a Carter',
    latin: 'defixio',
    type: 'book',
    weight: 0.2,
    value: 0,
    icon: '✠',
    tags: ['text', 'curse', 'tablet'],
    description: 'A lead sheet, folded twice and pierced with a nail, fished out of the spring of Mercury by the Porta Capena.',
    text: 'Mercury, messenger, I give you Dama the carter, son of no one,\n\nwho sold me sour wine for Setine and drove his left wheel over my foot by the gate and laughed.\n\nBind his tongue, that he may not swear; bind his hands, that he may not hold the reins; bind his mules, that they may not pull. Let his axle squeal all the way to Capua.\n\nI give you also the wine, if you can find any in it.\n\nNow, now, quickly, quickly.',
  },
  // The Aesernia inn bill: CIL IX 2689 [A] (paraphrased below the tab). The tab itself is [G].
  text(
    'rationes-popinae',
    'A Popina Tab',
    'rationes popinae',
    'tablet',
    'A greasy wax tablet from the counter of the Cockerel on the Vicus Tuscus.',
    'OWED TO THE COCKEREL — Kalends to the Ides\n\nSextus the carter: 3 cups of house wine, 3 asses. Bread, 1 as. Relish, 2 asses. Hay for the mule, 2 asses. *That mule will be the death of me.*\n\nPhilo the scribe: 1 cup Falernian, 4 asses. (He asked for it twice and paid once.)\n\nThe two from the Ludus: everything. *Ask the procurator.*\n\nNEVER AGAIN: the man with the ferret.\n\n(Scratched under the wax, older:) *Innkeeper, the bill! — A pint of wine and bread, one as; relish, two asses. — Right. — The girl, eight asses. — Right too. — Hay for the mule, two asses. — That mule will ruin me!*',
  ),
  // Seed for misc-suspirium-puellarum (v0.2+). [G]
  text(
    'epistula-matronae',
    'A Perfumed Letter',
    'epistula amatoria',
    'letter',
    'A small folded letter on good papyrus, smelling of nard. It was tucked behind a loose brick in the Ludus barracks.',
    'To Nereus, from one who watches from the women’s seats at the top, where the gods sit.\n\nWhen you cast the net I forget to breathe. My husband says the retiarius is the least of the gladiators, half-naked and without a helmet, a fish-catcher. My husband has never caught anything in his life except a cold.\n\nI cannot sign this. You will know me by the green stone on my hand, the next time you look up.\n\nBurn this. (He did not.)',
  ),
  // Juvenal's first book of Satires (1–5) dates c. 110–115 [P]; Satire 3 opens at the Porta Capena. "Panem et circenses"
  // is Satire 10 (c. 120s): here only as a draft, the in-joke suggested in docs/research/society.md §7.6. [G]
  text(
    'schedae-iuvenalis',
    'Crossed-out Verses',
    'schedae',
    'scroll',
    'A scrap of used papyrus covered in verses, most of them struck through. The hand is angry.',
    'My friend is leaving Rome. Good. Someone sensible should.\n\n(Struck out: “a thousand dangers of this savage city.”) *Fires, falling roofs, and poets reciting in August.*\n\nWhat can I do in Rome? I cannot lie. I cannot praise a bad book and ask for a copy.\n\n(Underlined twice:) *The Syrian Orontes has long been flowing into the Tiber.*\n\nThe people, who once gave out commands, legions, everything, now hold back and long anxiously for two things only: bread, and — races? games? the Circus? (Struck out. In the margin: “Not yet. Not angry enough yet.”)\n\nMake your will before you go out to dinner.',
  ),
  // mq-02 end: a deposit receipt (chirographum) for the strongrooms in the podium of Castor. Safe deposits there: [A]. Text [G].
  text(
    'chirographum-castoris',
    'Strongroom Receipt',
    'chirographum',
    'tablet',
    'A small tablet from the strongrooms of the Temple of Castor, with the locker number pressed into the wax.',
    'RECEIVED into the keeping of the strongrooms of Castor, below the god’s house, on the fifth day before the Ides of May, in the consulship of Celsus for the second time and Crispinus:\n\nONE TABLET, sealed, with the seal unbroken. Locker XIV.\n\nTo be released to the bearer of the matching token only, or to the officer named under the seal.\n\nThe keepers of the strongrooms answer for the lockers and not for what is in them. Fire, flood and the gods excepted.',
  ),
  // Astrologers by the Circus: Juvenal 6.582–591; Horace Sat. 1.6.113–114 ("fallacem Circum") [A]. This leaf [G].
  text(
    'tabella-mathematici',
    'An Astrologer’s Leaf',
    'tabella mathematici',
    'note',
    'A cheap papyrus leaf of predictions, sold for an as by the Circus.',
    'FOR THE DAYS OF THE LEMURIA, by Abdes the Chaldaean, who foretold the death of Domitian (afterwards).\n\nIf the moon is waxing: buy, marry, travel. If it is waning: sell, divorce, stay home.\n\nOn the ghost nights: do not whistle after dark, do not sweep the house, do not lend fire to a neighbor. Black beans, nine times, without looking back.\n\nIf a dog howls at your door, it is hungry. If a bird sings on the left, it is a good sign for the man on the right.\n\nThe emperor’s nativity is not for sale. (Ask again later.)',
    { value: 1 / 16, stackable: true },
  ),
  // Lessons for boss-nereus (§13.2). [G]
  text(
    'libellus-tironis',
    'A Tiro’s Notes on the Net',
    'libellus tironis',
    'note',
    'A recruit’s scratched notes from the Ludus Magnus, passed from bunk to bunk.',
    'GLAUCUS SAYS (and he is right, the old goat):\n\nI. Watch his hand, not his face. When the net starts to turn, he throws on the second turn. Step aside then, not before.\n\nII. If the net takes you, do not drop the shield. Keep it up and pull. Pull hard and often. His first stab after the net is slow and heavy: you will see it coming.\n\nIII. He is faster when he is losing. He kicks sand. Blink later.\n\nIV. When he has lost the net he is a man with a fork. Close in.\n\nV. Salute the crowd. They pay your purse, not him.',
  ),
  // The Lemuria rite: Ovid, Fasti 5.429–444 [A] (paraphrased). The household card is [G].
  text(
    'carmen-lemuriae',
    'The Words of the Lemuria',
    'verba Lemuriae',
    'tablet',
    'A child’s writing tablet with the rite copied out, so the father would not forget the words.',
    'AT MIDNIGHT, barefoot, without knots on you:\n\nMake the sign with the thumb in the middle of the fingers, so no shade comes near.\n\nWash your hands in spring water. Take the black beans in your mouth and throw them behind you, without looking back, and say:\n\n*Haec ego mitto; his redimo meque meosque fabis.* “These I send; with these beans I redeem me and mine.”\n\nNine times. The shade gathers them and follows unseen.\n\nWash again, clash the bronze, and say nine times: *Manes exite paterni!* “Ghosts of my fathers, go out!”\n\nThen look back.',
  ),
];

export type WallTextKind = 'graffito' | 'dipinto' | 'notice' | 'inscription';

export interface WallText {
  id: string;
  /** Location id (content place or landmark) the world may attach a "Read" interactable to. */
  at: string;
  kind: WallTextKind;
  title: string;
  /** Original text (Latin), shown above the translation. */
  latin?: string;
  text: string;
  /** Source and confidence. */
  source: string;
}

/** Graffiti, painted notices and inscriptions for the v0.1 places. */
export const WALL_TEXTS: WallText[] = [
  {
    id: 'graffito-popina-pretia', at: 'popina-vicus-tuscus', kind: 'graffito', title: 'Scratched by the counter',
    latin: 'ASSIBVS·HIC·BIBITVR·DIPVNDIVM·SI·DEDERIS·MELIORA·BIBES·QVATTVS·SI·DEDERIS·VINA·FALERNA·BIBES',
    text: 'Here you drink for one as. Pay two and you’ll drink better. Pay four and you’ll drink Falernian.',
    source: 'CIL IV 1679 (Pompeii) [A], copied onto a Roman wall [G]',
  },
  {
    id: 'graffito-popina-hospes', at: 'popina-vicus-tuscus', kind: 'graffito', title: 'Scratched above a bench',
    latin: 'MIXIMVS·IN·LECTO·FATEOR·PECCAVIMVS·HOSPES·SI·DICES·QVARE·NVLLA·MATELLA·FVIT',
    text: 'Innkeeper, I admit we wet the bed. You ask why? There was no chamber pot.',
    source: 'CIL IV 4957 (Pompeii) [A]',
  },
  {
    id: 'graffito-ludus-nereus', at: 'ludus-gate', kind: 'graffito', title: 'Scratched by the Ludus gate',
    latin: 'NEREVS·RETIARIVS·PVPARVM·DOMINVS',
    text: 'Nereus the net-fighter, lord of the dolls.',
    source: 'After CIL IV 4353 (Crescens retiarius puparum dominus) [A]; Nereus is fictional [G]',
  },
  {
    id: 'graffito-ludus-celadus', at: 'ludus-cellae', kind: 'graffito', title: 'Scratched on a barracks pillar',
    latin: 'SVSPIRIVM·PVELLARVM·TRAEX',
    text: 'The thraex: the girls’ heartthrob. (Below, in another hand: “He wrote this himself.”)',
    source: 'After CIL IV 4342 (Celadus thraex suspirium puellarum) [A]; the reply is [G]',
  },
  {
    id: 'dipinto-meta-factiones', at: 'meta-sudans', kind: 'dipinto', title: 'Painted on the fountain’s enclosure',
    latin: 'NEREO·FELICITER · FEROCI·FELICITER · RETIARII·PISCES·SVNT',
    text: 'Good luck to Nereus! Good luck to Ferox! — The net-men are fish.',
    source: 'Acclamation formula “feliciter” [A]; names and insult [G]',
  },
  {
    id: 'notice-insula-locatio', at: 'insula-nutans', kind: 'dipinto', title: 'Painted beside the door',
    latin: 'INSVLA·FVLVIANA · LOCANTVR·EX·K·IVLIS·TABERNAE·CVM·PERGVLIS·SVIS·ET·CENACVLA',
    text: 'The Fulvian block. To let from the Kalends of July: shops with their upper rooms, and flats. Apply to Saturninus, the owner’s agent. (Under it, chalked: “Bring your own props for the ceiling.”)',
    source: 'After CIL IV 138 (Insula Arriana Polliana) [A]; this notice [G]',
  },
  {
    id: 'notice-urna-perdita', at: 'popina-vicus-tuscus', kind: 'dipinto', title: 'A lost-property notice',
    latin: 'VRNA·AENIA·PEREIT·DE·TABERNA',
    text: 'A bronze pot has gone missing from this shop. Whoever brings it back gets 65 sesterces. Whoever hands over the thief gets more.',
    source: 'After CIL IV 64 [A]',
  },
  {
    id: 'graffito-capena-paries', at: 'porta-capena', kind: 'graffito', title: 'Scratched on the gate pier',
    latin: 'ADMIROR·O·PARIES·TE·NON·CECIDISSE·RVINIS·QVI·TOT·SCRIPTORVM·TAEDIA·SVSTINEAS',
    text: 'I am amazed, O wall, that you have not collapsed in ruins, when you hold up the tedious scribbles of so many writers.',
    source: 'CIL IV 1904 (Pompeii) [A]',
  },
  {
    id: 'notice-vigiles', at: 'excubitorium-velabri', kind: 'notice', title: 'The watch prefect’s order',
    text: 'Every tenant shall keep water in his room against fire. No lamp left burning, no brazier unattended, no cooking on the stairs. The careless will be beaten with rods.',
    source: 'Digest 1.15.3.3–4 [A]; wording [G]',
  },
  {
    id: 'graffito-basilica-alea', at: 'basilica-julia-steps', kind: 'graffito', title: 'A gaming board cut into the step',
    latin: 'VINCIS·GAVDES · PERDIS·PLANGIS · NOLI·LVDERE',
    text: 'You win, you’re glad. You lose, you weep. Don’t play. (The board is worn smooth by people who played.)',
    source: 'Gaming boards survive on the Basilica Julia steps [A]; this text [G]',
  },
  {
    id: 'graffito-velabrum-lucrum', at: 'pistrinum-velabri', kind: 'graffito', title: 'Cut into the bakery threshold',
    latin: 'SALVE·LVCRVM',
    text: 'Welcome, profit!',
    source: 'Threshold formula, Pompeii [A]',
  },
  {
    id: 'graffito-fullonica', at: 'fullonica-velabri', kind: 'graffito', title: 'Scratched on the fullery wall',
    latin: 'FVLLONES·VLVLAMQVE·CANO·NON·ARMA·VIRVMQVE',
    text: 'I sing of fullers and the owl, not of arms and the man.',
    source: 'CIL IV 9131 (Pompeii), a Virgil parody [A]',
  },
  {
    id: 'dipinto-castor-loculi', at: 'castor-strongroom', kind: 'notice', title: 'Painted over the strongroom door',
    latin: 'LOCVLI·HIC·LOCANTVR',
    text: 'Lockers to let here. Deposits by daylight; the keepers answer for the lockers, not for what is in them.',
    source: 'Strongrooms in the podium of Castor [A: safe deposits]; this notice [G]',
  },
];
