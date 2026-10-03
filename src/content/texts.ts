/**
 * In-world texts (docs/CONTENT.md §7, T1–T13, and the signage of §8.4):
 *
 * - Texts carried by items: the courier's sealed tablet (T1, its outer face and cipher), Festus'
 *   letter home (T2), the curse tablets (T6), the emperor's nativity (T12). Their ItemDefs live in
 *   the item catalogue (src/rpg/data/items/content.ts, quest.ts); the bodies are here.
 * - TEXT_ITEMS: two readable extras (type 'book'): Juvenal's drafts and Zenon's almanac leaf.
 * - WALL_TEXTS: graffiti, painted notices, a lampoon and an altar the world attaches to places as
 *   "Read" interactables (T3, T4, T5, T7, T8, T9, T10, T11, T13).
 * - SIGNS: shop signs and inscriptions (§8.4).
 *
 * The reader picks its look from tags ('letter', 'tablet', 'note', 'scroll'; default book).
 * Paragraphs are separated by blank lines; `*italic*` is honoured. CONTENT.md labels all thirteen
 * texts invented [G]: the Lexicon must say so.
 */
import type { ItemDef } from '../rpg/types';
import type { BookView } from '../ui/types';

/** T1: the outer face of the courier's tablet and the cipher inside (a Caesar shift of four). */
export const T1_TABELLA =
  '*Outer face, scratched in the wax of the cover:*\n\nDABIS · T · AVFIDIO · PVDENTI · PRINCIPI · PEREGRINORVM\nAB · C · MARIO · FESTO\nDATA · A · D · VI · NON · MAI · BRVNDISII\n\n*“Deliver to T. Aufidius Pudens, chief of the Peregrini, from C. Marius Festus. Given at Brundisium on the 6th day before the Nones of May.”*\n\n*Inside, under the seal, in letters that make no words:*\n\nNR HIHNGEBNSRI EXGCA NR PSGS EPBS\nID SXNIRBI TIGCRNE TIX MSXXIE TNTIXEBEXNE\nQSRI LXEBCQ';

/** T1 decoded (quest-nuntius-festi, v0.2). */
export const T1_DECODED =
  'IN DEDICATIONE ARCVS IN LOCO ALTO · EX ORIENTE PECVNIA PER HORREA PIPERATARIA · MONE GRATVM\n\n*“At the dedication, a bow in the high place. Money from the East through the Pepper Warehouses. Warn Gratus.”*';

/** T2: Festus' letter home, never sent. */
export const T2_EPISTULA =
  '*Festus matri suae Helpidi salutem. Si vales, bene est; ego valeo.*\n\nI write from Brundisium with a pen that hates me. I will be home before the Ides, the gods and the mules willing, and I am bringing you a little jar of Falernian, the real kind, not the kind Chreste sells. Don’t tell Father. He’ll pour it on the Lares.\n\nTell Gemellus to come down off the roof and eat something. Tell him too that I have not forgotten our old game, and that he should practise it, because I may need him to read something for me. He will know what I mean. Four is still the number.\n\nThe camp sends me everywhere and pays me from nowhere. When Caesar goes east I may go with him, or not; nobody tells a courier anything, which is why they make us couriers.\n\nLight a lamp for me at the crossroads on the Kalends. Farewell, and kiss Father for me, if he lets you.\n\n*Written on the 6th day before the Nones of May.*';

/** T6: the curse tablet against the Greens. */
export const T6_DEFIXIO_PRASINA =
  'DEFIGO · EQVOS · PRASINOS · VICTOREM · AQVILAM · CERVVM · HILARVM\nLIGO · PEDES · CVRSVM · ANIMAM · EORVM\nNE · CVRRERE · NE · FLECTERE · AD · METAS · POSSINT\nVT · IN · CARCERIBVS · CADANT\nET · AVRIGAM · HIERACEM · ET · OCVLOS · EIVS · ET · MANVS\nTE · ROGO · QVI · SVB · HAC · TERRA · IACES\nFAC · HODIE · HODIE · IAM · IAM · CITO · CITO\n\n*“I bind the horses of the Greens, Victor, Aquila, Cervus, Hilarus. I tie their feet, their running, their breath, so they cannot run, cannot turn at the turning-posts, so they fall in the starting-gates. And the driver Hierax, his eyes and his hands. I ask you, who lie under this earth: do it today, today, now, now, quickly, quickly.”*';

/** The Blue mirror of T6 (defixio-veneta, CONTENT.md §4.11). */
export const T6_DEFIXIO_VENETA =
  'DEFIGO · EQVOS · VENETOS · BOREAM · LVCIFERVM · PASSERINVM · TIGRIM\nLIGO · PEDES · CVRSVM · ANIMAM · EORVM\nNE · CVRRERE · NE · FLECTERE · AD · METAS · POSSINT\nET · AVRIGAM · AQVILONEM · ET · OCVLOS · EIVS · ET · MANVS\nTE · ROGO · QVI · SVB · HAC · TERRA · IACES\nFAC · HODIE · HODIE · IAM · IAM · CITO · CITO\n\n*“I bind the horses of the Blues, Boreas, Lucifer, Passerinus, Tigris. I tie their feet, their running, their breath, so they cannot run, cannot turn at the turning-posts. And the driver Aquilo, his eyes and his hands. I ask you, who lie under this earth: do it today, today, now, now, quickly, quickly.”*';

/** The rolled lead strip from the Pons Sublicius (defixio-tiberina, misc-sublicius-clavi). */
export const DEFIXIO_TIBERINA = 'Father Tiber, take the barge of Sosibius, who sent my father out in a rotten hull. Take it as you took him.';

/** T12: the emperor's nativity (quest-genitura, misc-genitura-caesaris, v0.2). */
export const T12_GENITURA =
  'GENITVRA\n\nA nativity cast by one who reads the heavens. The native was born at Italica in Baetica on the 14th day before the Kalends of October, when D. Iunius Silanus and Q. Haterius Antoninus were consuls, in the first hour after sunrise.\n\nThe Sun in the Virgin. The Moon in the house of kings. Jupiter rising, which gives empire. Mars in the setting quarter, which gives victories in the West: see the Danube.\n\nSaturn stands in the eighth place, the place of endings, in an eastern sign.\n\nTherefore: he will rule long, fight much, and be called the best. His greatest glory and his last journey both lie in the East. Let him beware of water, and of the summer of his sixty-fourth year.\n\n*(At the foot, in a different hand, in Greek letters:)* ἀκριβῶς. *“Exactly.”*';

function text(id: string, name: string, latin: string, kind: 'letter' | 'tablet' | 'note' | 'scroll', description: string, body: string, extra: Partial<ItemDef> = {}): ItemDef {
  return { id, name, latin, type: 'book', weight: kind === 'tablet' ? 0.3 : 0.05, value: 0, icon: '✉', description, text: body, tags: ['text', kind], ...extra };
}

/** Readable extras beyond CONTENT.md §7 (marked "Extra" like the catalogue's own extras). */
export const TEXT_ITEMS: ItemDef[] = [
  // Juvenal drafting (society.md §7.6: he may draft, never quote, Satires 3 and 10). Given for a Rhetoric check. [G]
  text(
    'schedae-iuvenalis',
    'Crossed-out Verses',
    'schedae',
    'scroll',
    'A scrap of used papyrus covered in verses, most of them struck through. The hand is angry. (Extra.)',
    'My friend is leaving Rome. Good. Someone sensible should.\n\n(Struck out: “a thousand dangers of this savage city.”) *Fires, falling roofs, and poets reciting in August.*\n\nWhat can I do in Rome? I cannot lie. I cannot praise a bad book and ask for a copy.\n\n(Underlined twice:) *The Syrian Orontes has long been flowing into the Tiber.*\n\nThe people, who once gave out commands, legions, everything, now hold back and long anxiously for two things only: bread, and — races? games? the Circus? (Struck out. In the margin: “Not yet. Not angry enough yet.”)\n\nMake your will before you go out to dinner.',
  ),
  // Zenon's stall (CONTENT.md §2.D: "Your nativity, citizen? Saturn in the eighth…"). [G]
  text(
    'tabella-mathematici',
    'An Astrologer’s Leaf',
    'tabella mathematici',
    'note',
    'A cheap papyrus leaf of predictions, sold for an as at the Astrologers’ Arcade by the Circus. (Extra.)',
    'FOR THE DAYS OF THE LEMURIA, by Zenon of Seleucia, who reads the heavens for the great and the small.\n\nIf the moon is waxing: buy, marry, travel. If it is waning: sell, divorce, stay home.\n\nOn the ghost nights: do not whistle after dark, do not sweep the house, do not lend fire to a neighbour. Black beans, nine times, without looking back.\n\nThe stars incline; they do not compel. Mostly.\n\nWhose stars? Nobody’s. Everybody’s. Do not ask.',
    { value: 1 / 16, stackable: true },
  ),
];

export type WallTextKind = 'graffito' | 'dipinto' | 'notice' | 'inscription' | 'sign' | 'tablet';

export interface WallText {
  id: string;
  /** Location id the world attaches a "Read" interactable to. */
  at: string;
  kind: WallTextKind;
  title: string;
  /** Text as it stands (Latin capitals for inscriptions), shown above the translation. */
  latin?: string;
  text: string;
  /** CONTENT.md text number or section, and confidence. */
  source: string;
  /** Washed off or taken down at this game hour (the vigiles clean the lampoon at v1). */
  until?: number;
}

/** Readable writing on walls and objects in the v0.1 places (CONTENT.md §7). */
export const WALL_TEXTS: WallText[] = [
  // T3 — the Silver Pig, scratched by the counter (each line a separate decal)
  { id: 't3-chreste', at: 'popina-vici-tusci', kind: 'graffito', title: 'Scratched by the counter', latin: 'VIBIA · CHRESTE · VINVM · NON · MISCET · MENTITVR', text: '“Vibia Chreste doesn’t water her wine.” (Below, another hand:) “LIAR.”', source: 'CONTENT.md T3 [G]' },
  { id: 't3-iucunda', at: 'popina-vici-tusci', kind: 'graffito', title: 'Scratched by the counter', latin: 'PRIMIGENIVS · IVCVNDAM · AMAT · IVCVNDA · PISTOREM', text: '“Primigenius loves Iucunda. Iucunda loves the baker.”', source: 'CONTENT.md T3 [G]' },
  { id: 't3-bucco', at: 'popina-vici-tusci', kind: 'graffito', title: 'A tally on the wall', latin: 'BVCCO · AS · AS · AS · AS · AS · AS · AS', text: 'Chreste’s tally of what Bucco owes. Five asses are crossed out. Two are still not.', source: 'CONTENT.md T3 [G]' },
  { id: 't3-scutarii', at: 'popina-vici-tusci', kind: 'graffito', title: 'Scratched by the door', latin: 'SCVTARII · VINCVNT — IN · TABERNA · TANTVM', text: '“The scutarii win!” — “In the tavern, maybe.”', source: 'CONTENT.md T3 [G]' },
  { id: 't3-venus', at: 'popina-vici-tusci', kind: 'graffito', title: 'Scratched in the back corner', latin: 'QVI · HIC · MINXERIT · IRATAM · VENEREM · HABEAT', text: '“Whoever pisses here, may Venus be angry with him.”', source: 'CONTENT.md T3 [G]' },
  // T4 — the Ludus barracks
  { id: 't4-nereus', at: 'ludus-cellae', kind: 'graffito', title: 'Cut into a cell wall', latin: 'NEREVS · RET · V · XXXI', text: '“Nereus, retiarius: 31 wins.” (Beside it, a net drawn with a fish caught in it.)', source: 'CONTENT.md T4 [G]' },
  { id: 't4-auctus', at: 'ludus-cellae', kind: 'graffito', title: 'Cut into a cell wall', latin: 'AVCTVS · THR · XXX · V · XVIII · M · XI · ST · I', text: '“Auctus, thraex: 30 bouts, 18 won, 11 spared, 1 draw.”', source: 'CONTENT.md T4 [G]; Pompeian scoring' },
  { id: 't4-pullus', at: 'ludus-cellae', kind: 'graffito', title: 'Cut into a cell wall', latin: 'PVLLVS · MATRI · SALVTEM · PISTOR · SVM', text: '“Pullus to his mother, greetings: I’m a baker.”', source: 'CONTENT.md T4 [G]' },
  { id: 't4-mus', at: 'ludus-cellae', kind: 'graffito', title: 'Cut into a cell wall', latin: 'DIZAS · MVS · FVR · EST', text: '“Dizas the Mouse is a thief.” (Someone has scratched a cloak next to it, and then scratched it out.)', source: 'CONTENT.md T4 [G]' },
  { id: 't4-tiro', at: 'ludus-cellae', kind: 'graffito', title: 'Cut into a cell wall', latin: 'TIRO · HODIE · CRAS · HEROS · POSTRIDIE · CINIS', text: '“Today a recruit, tomorrow a hero, the day after, ash.”', source: 'CONTENT.md T4 [G]' },
  // T5 — the lampoon on the Basilica Julia steps (washed off at v1)
  {
    id: 't5-lampoon', at: 'basilica-julia-gradus', kind: 'graffito', title: '“On the Column”, chalked on the steps', until: 19.1, source: 'CONTENT.md T5 [G]',
    text: '*A hundred feet of Luna stone, and every foot a war:*\n*the river bridged, the forests felled, the hill-forts set alight;*\n*two thousand little soldiers marching round and round and upward,*\n*and not a single one of them has had his pay tonight.*\n\n*Look up, Quirites! Look up! It does the neck a kindness,*\n*and while you gape at heaven no one’s watching where you’re stepping.*\n*Up there the Dacian kneels for ever and the Emperor stands for ever;*\n*down here the landlord’s always paid, the tenant always weeping.*\n\n*Inside, they say, a stairway turns, a hundred steps and more,*\n*with little slits to let the light in and to keep the weather out.*\n*Now there’s a lodging for a client: dry, and high, and quiet.*\n*I’d rent it if I had the rent; and Caesar, I’ve no doubt,*\n*would charge me less than Callistus.*',
  },
  // T7 — the playbill (Meta Sudans wall and the Circus north street)
  ...['meta-sudans', 'street-north-of-circus'].map((at) => ({
    id: `t7-playbill-${at}`, at, kind: 'dipinto' as const, title: 'A painted games notice', source: 'CONTENT.md T7 [G: the games are invented]',
    latin: 'OB · DEDICATIONEM · COLVMNAE\nIMP · CAESARIS · NERVAE · TRAIANI · AVG · GERM · DACICI\nVENATIO · ET · PARIA · GLADIATORVM\nIN · AMPHITHEATRO · A · D · XV · K · IVN · ET · SEQVENTIBVS · DIEBVS\nVELA · ERVNT · SPARSIONES · ERVNT\nFELICITER\n(in red, smaller:) NEREVS · RET · PVGNABIT',
    text: '“For the dedication of the Column of the Emperor Caesar Nerva Trajan Augustus, conqueror of the Germans and the Dacians: a beast hunt and pairs of gladiators in the amphitheatre, on the 15th day before the Kalends of June (18 May) and the following days. There will be awnings. There will be sprinklings of perfume. Good luck to all!” — (below) “Nereus the retiarius will fight.”',
  })),
  // T8 — the vigiles' fire notice (the post, and copied at the Velabrum compita)
  ...['excubitorium-velabri', 'compitum-velabri', 'compitum-vici-tusci'].map((at) => ({
    id: `t8-vigiles-${at}`, at, kind: 'notice' as const, title: 'The Prefect of the Watch proclaims', source: 'CONTENT.md T8 [G]; Digest 1.15.3–4 [A]',
    latin: 'PRAEFECTVS · VIGILVM · EDICIT\nINQVILINI · AQVAM · IN · CENACVLO · PARATAM · HABENTO\nLVCERNAS · ET · FOCOS · NOCTV · NE · NEGLEGVNTO\nQVI · NEGLEXERIT · FVSTIBVS · CASTIGABITVR\nSI · INCENDIVM · VIDERIS · CLAMA · VIGILES · VOCA',
    text: '“The Prefect of the Watch proclaims: Tenants shall keep water ready in their flats. They shall not leave lamps and hearths unattended at night. Whoever neglects this will be beaten with cudgels. If you see a fire, shout, and call the Watch.” (Scrawled underneath:) “And who’s going to carry the water up to the fourth floor?”',
  })),
  // T9 — the crossroads altar of the Vicus Tuscus
  {
    id: 't9-ara-vici-tusci', at: 'compitum-vici-tusci', kind: 'inscription', title: 'The altar of the crossroads shrine', source: 'CONTENT.md T9 [G]; four vicomagistri per vicus [A]',
    latin: 'LARIBVS · AVGVSTIS · ET · GENIO · CAESARIS\nMAGISTRI · VICI · TVSCI\nM · LVCRETIVS · ZETHVS · L · SEIVS · CERDO · Q · NAEVIVS · PHILOMVSVS · C · TITIVS · FAVSTVS\nARAM · VETVSTATE · CONLAPSAM · DE · SVA · PECVNIA · RESTITVERVNT\nL · PVBLILIO · CELSO · II · C · CLODIO · CRISPINO · COS',
    text: '“To the Lares Augusti and the Genius of Caesar. The magistrates of the Vicus Tuscus, M. Lucretius Zethus, L. Seius Cerdo, Q. Naevius Philomusus and C. Titius Faustus, restored at their own cost this altar, which had collapsed with age, in the consulship of L. Publilius Celsus (for the second time) and C. Clodius Crispinus.”',
  },
  // T10 — the lost dog
  {
    id: 't10-canis', at: 'tabernae-aemiliae', kind: 'dipinto', title: 'Painted on a pier of the shop row', source: 'CONTENT.md T10 [G]',
    latin: 'CANIS · MOLOSSA · NOMINE · HILARA\nABERRAVIT · A · D · VIII · ID · MAI\nQVI · EAM · REDVXERIT · AD · TONSTRINAM · TRYPHONIS\nIN · TABERNIS · BASILICAE · PAVLLI\nACCIPIET · HS · XX',
    text: '“A Molossian bitch named Hilara went astray on the 8th day before the Ides of May. Whoever brings her back to Tryphon’s barber’s shop in the shops of the Basilica Paulli will receive 20 sesterces.”',
  },
  // T11 — Fuscus' Lemuria tablet on his lararium (v0.2 interior)
  {
    id: 't11-fuscus', at: 'insula-mariorum', kind: 'tablet', title: 'A wax tablet on the lararium', source: 'CONTENT.md T11 [G]; Ovid, Fasti 5.429–44 [A]',
    text: 'Midnight. Bare feet. No knots on you anywhere.\n\nMake the sign: thumb between the fingers.\n\nWash the hands at the basin.\n\nBeans: the BLACK ones, in the blue jar. NOT Helpis’ cooking beans.\n\nThrow them behind. Do not look back. Nine times:\n*haec ego mitto; his redimo meque meosque fabis.*\n\nWash again. Strike the bronze. Nine times:\n*Manes exite paterni.*\n\nThen look back. Not before. NOT BEFORE.',
  },
  // T13 — the burial club's rules (v0.3 place; v0.2 copy carried by Chrysis)
  {
    id: 't13-lex-collegii', at: 'fullonica-suburana', kind: 'notice', title: 'LEX · COLLEGII · CVLTORVM · LAVERNAE', source: 'CONTENT.md T13 [G]; after the Lanuvium statutes (AD 136) [A, later model]',
    text: 'Whoever wishes to join this club pays an entrance fee of one hundred sesterces and an amphora of good wine, and five asses on the Kalends of every month.\n\nTo any member who has paid his dues for six months, the club grants three hundred sesterces for his funeral, and walks behind his bier.\n\nMembers shall not quarrel at dinners. Whoever strikes another pays twenty sesterces; whoever insults the magister pays twelve; whoever insults Laverna pays nothing, because nobody does.\n\nMembers shall not ask one another where anything came from.',
  },
];

export interface Sign {
  at: string;
  latin: string;
  english: string;
  kind: 'sign' | 'mosaic' | 'dipinto' | 'inscription' | 'graffito' | 'plaque' | 'prop';
  note?: string;
}

/** Shop signs, threshold mosaics and inscriptions (CONTENT.md §8.4). `at` '*' = random places of that kind. */
export const SIGNS: Sign[] = [
  { at: 'popina-vici-tusci', latin: 'AD · PORCVM · ARGENTEVM', english: 'At the Silver Pig', kind: 'sign', note: 'a painted silver pig' },
  { at: 'popina-vici-tusci', latin: 'VINVM · AS · I · MELIVS · AS · II · FALERNVM · AS · IIII', english: 'Wine 1 as · better 2 · Falernian 4', kind: 'dipinto', note: 'the price list by the counter (GDD §7.2)' },
  { at: 'taberna-armorum', latin: 'EVHODVS · ARMA · VENALIA · ET · REFECTA', english: 'Euhodus: arms for sale, and repaired', kind: 'sign', note: 'with a painted gladius' },
  { at: 'castor-strongroom', latin: 'LOCVLI · DEPOSITORVM', english: 'Deposit vaults', kind: 'plaque' },
  { at: 'temple-castor-pollux', latin: '', english: 'A black wool fillet hangs across the shut doors (the Lemuria).', kind: 'prop' },
  { at: 'tabernae-aemiliae', latin: 'TONSTRINA · MENSA · HERMOGENIS · MEDICVS', english: 'Barber · Hermogenes’ table · Physician', kind: 'sign', note: 'a painted razor and mirror, a coin, a cupping vessel' },
  { at: 'seplasia-vici-tusci', latin: 'VNGVENTA · TVS · MYRRHA · NARDVS', english: 'Perfumes, incense, myrrh, nard', kind: 'sign' },
  { at: 'pistrinum-velabri', latin: 'PANIS · CALIDVS', english: 'Hot bread', kind: 'sign', note: 'a painted donkey turning a mill' },
  { at: 'fullonica-velabri', latin: 'FVLLONES · ET · VLVLAM · CANO', english: 'I sing of fullers and the owl', kind: 'graffito', note: 'parodies CIL IV 9131 [A]' },
  { at: 'excubitorium-velabri', latin: 'COH · V · VIGILVM · EXCVBITORIVM', english: 'Watch post of the 5th Cohort of the Vigiles', kind: 'sign' },
  { at: 'statio-cohortium-urbanarum', latin: 'COH · X · VRB', english: 'Tenth Urban Cohort', kind: 'sign' },
  { at: 'ludus-gate', latin: 'LVDVS · MAGNVS', english: 'The Great School', kind: 'inscription' },
  { at: '*', latin: 'SALVE · · · CAVE · CANEM · · · LVCRVM · GAVDIVM', english: 'Welcome · Beware of the dog · Profit is joy', kind: 'mosaic', note: 'shop thresholds, conventional formulae [A]' },
  { at: '*', latin: 'CACATOR · CAVE · MALVM', english: 'You who relieve yourself here: beware of bad luck', kind: 'dipinto', note: 'alley corners, with painted snakes [A]' },
  { at: 'circus-maximus', latin: 'PRASINA · VINCIT · / · VENETA · VINCIT', english: 'Green wins! / Blue wins!', kind: 'graffito', note: 'overwritten in turns on the arcades' },
  { at: 'astrologi-circi', latin: 'GENITVRAE · HIC · FIVNT', english: 'Nativities cast here', kind: 'dipinto', note: 'Zenon’s board; Arruns’ booth has a painted liver' },
  { at: 'miliarium-aureum', latin: '', english: 'Gilded bronze without legible letters (what it carried is unknown).', kind: 'prop' },
  { at: 'column-trajan', latin: 'SENATVS · POPVLVSQVE · ROMANVS …', english: 'The dedicatory inscription of 113 (CIL VI 960): the real text, in the Lexicon.', kind: 'inscription', note: 'historical [A]' },
];

/** A reader view for any item that carries text (books, letters, quest tablets). */
export function bookViewFor(def: Pick<ItemDef, 'name' | 'text' | 'tags'> | undefined): BookView | null {
  if (!def?.text) return null;
  const t = def.tags ?? [];
  const kind: BookView['kind'] = t.includes('letter') ? 'letter' : t.includes('tablet') ? 'tablet' : t.includes('note') ? 'note' : t.includes('scroll') ? 'scroll' : 'book';
  return { title: def.name, kind, text: def.text };
}
