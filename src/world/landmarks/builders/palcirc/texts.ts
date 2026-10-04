/**
 * Readable texts behind the palcirc 'inscription' spots, for the gameplay team (spot id → Latin as
 * carved, an English reading, and its source). Authentic texts are marked [A]; texts composed for
 * the game in period style are marked [G] and must not be cited as fact in the Lexicon.
 */
export interface InscriptionText {
  /** Shown in the prompt and as the reader's heading. */
  title: string;
  latin: string;
  english: string;
  source: string;
}

export const PALCIRC_INSCRIPTIONS: Record<string, InscriptionText> = {
  'obelisk-dedication': {
    title: 'Dedication of the Obelisk',
    latin: 'IMP · CAESAR · DIVI · F · AVGVSTVS · PONTIFEX · MAXIMVS · IMP · XII · COS · XI · TRIB · POT · XIV · AEGVPTO · IN · POTESTATEM · POPVLI · ROMANI · REDACTA · SOLI · DONVM · DEDIT',
    english: 'Imperator Caesar Augustus, son of the Deified, Pontifex Maximus, hailed Imperator twelve times, consul eleven times, in his fourteenth year of tribunician power, Egypt having been brought under the power of the Roman People, gave this as a gift to the Sun.',
    source: '[A] CIL VI 701 (the same text stands on both Augustan obelisks, 10 BC)',
  },
  'arch-titus-circus-inscription': {
    title: 'Arch of Titus in the Circus',
    latin: 'SENATVS · POPVLVSQVE · ROMANVS · IMP · TITO · CAESARI · DIVI · VESPASIANI · F · VESPASIANO · AVG · PONTIF · MAX · TRIB · POT · X · IMP · XVII · COS · VIII · P · P · PRINCIPI · SVO · QVOD · PRAECEPTIS · PATRIS · CONSILIISQ · ET · AVSPICIS · GENTEM · IVDAEORVM · DOMVIT · ET · VRBEM · HIERVSOLYMAM · OMNIBVS · ANTE · SE · DVCIBVS · REGIBVS · GENTIBVS · AVT · FRVSTRA · PETITAM · AVT · OMNINO · INTEMPTATAM · DELEVIT',
    english: 'The Senate and People of Rome to the Imperator Titus Caesar Vespasianus Augustus, son of the Deified Vespasian, ... their princeps, because by his father\'s precepts, counsel and auspices he subdued the Jewish people and destroyed the city of Jerusalem, which all generals, kings and peoples before him had either attacked in vain or not attempted at all.',
    source: '[A] CIL VI 944 (recorded by the Einsiedeln itinerary; AD 81). The carved attic shows an abridgement.',
  },
  'circus-dedication': {
    title: 'Dedication of the Circus Maximus',
    latin: 'IMP · CAESAR · DIVI · NERVAE · F · NERVA · TRAIANVS · AVG · GERM · DACICVS · PONT · MAX · TRIB · POT · VII · IMP · IIII · COS · V · P · P · CIRCVM · MAXIMVM · AMPLIATVM · ET · EXORNATVM',
    english: 'Imperator Caesar Nerva Traianus Augustus, son of the Deified Nerva, conqueror of Germany and Dacia, Pontifex Maximus, in his seventh year of tribunician power, hailed Imperator four times, consul five times, Father of his Country: the Circus Maximus, enlarged and adorned.',
    source: '[G] composed for the game from Trajan\'s titles in AD 103 and Pliny, Panegyricus 51 (the real dedication is lost)',
  },
  'porta-capena-arch': {
    title: 'Marker on the Aqueduct Arch',
    latin: 'AQVA · MARCIA',
    english: 'The Marcian Water.',
    source: '[G] a short marker on the aqueduct arch (the Marcia\'s own restoration texts are on the Porta Tiburtina arch).',
  },
  'temple-apollo-inscription': {
    title: 'Dedication of the Temple of Apollo',
    latin: 'APOLLINI · PALATINO · IMP · CAESAR · DIVI · F',
    english: 'To Palatine Apollo: Imperator Caesar, son of the Deified.',
    source: '[G] period-style dedication for Augustus\' temple (28 BC); the real one is lost.',
  },
  'magna-mater-inscription': {
    title: 'Dedication of the Temple of the Great Mother',
    latin: 'MATRI · DEVM · MAGNAE · IDAEAE',
    english: 'To the Great Idaean Mother of the Gods.',
    source: '[G] after the cult title Mater Deum Magna Idaea (well attested on altars).',
  },
  'casa-romuli-titulus': {
    title: 'Marker Stone of the Hut',
    latin: 'CASA · ROMVLI',
    english: 'The Hut of Romulus.',
    source: '[G] a small marker stone; the hut is attested by Dionysius 1.79 and Plutarch.',
  },
  'lupercal-inscription': {
    title: 'Inscription of the Lupercal',
    latin: 'LVPERCAL',
    english: 'The Lupercal.',
    source: '[G] restored by Augustus (Res Gestae 19).',
  },
  'temple-ceres-album': {
    title: 'Notice Board of the Aediles',
    latin: 'AEDILES · PLEBIS · EDICVNT · MERCATORES · IDIBVS · MAIIS · AD · AEDEM · MERCVRII',
    english: 'The plebeian aediles proclaim: merchants, on the Ides of May, to the Temple of Mercury.',
    source: '[G] a whitewashed notice board (album) of the aediles, who kept their archive at this temple. The Mercuralia, the merchants\' feast, fell on the Ides of May (15 May), the dedication day of Mercury\'s temple over the Circus (Livy 2.21, 2.27; Ovid, Fasti 5.663–692); the aediles policed the markets.',
  },
  'appia-tomb-0': {
    title: 'Bench Tomb on the Via Appia',
    latin: 'SISTE · VIATOR · ET · LEGE',
    english: 'Stop, traveller, and read.',
    source: '[G] the commonest appeal of Roman roadside epitaphs (e.g. CIL VI 11252 and many others); this schola bench is composed for the game.',
  },
  'appia-tomb-1': {
    title: 'Tomb on the Via Appia',
    latin: 'D · M · C · IVLIO · FELICI · VIX · ANN · LXII · IVLIA · PRIMA · CONIVGI',
    english: 'To the Spirits of the Dead. To Gaius Julius Felix, who lived 62 years. Julia Prima to her husband.',
    source: '[G] composed in the standard formula (D M, vixit annos) of Rome\'s early 2nd-century epitaphs.',
  },
  'appia-tomb-2': {
    title: 'Tomb on the Via Appia',
    latin: 'M · LICINIVS · EROS · PISTOR · SIBI · ET · SVIS',
    english: 'Marcus Licinius Eros, baker, (made this) for himself and his family.',
    source: '[G] a freedman tradesman\'s tomb in the manner of the baker Eurysaces\' (CIL VI 1958).',
  },
  'appia-tomb-3': {
    title: 'Tomb on the Via Appia',
    latin: 'LIBERTORVM · FAMILIAE · STATILIAE',
    english: '(The tomb) of the freedmen of the household of the Statilii.',
    source: '[G] after the great columbarium of the Statilii Tauri (CIL VI 6213–6640), which lay by the Porta Maggiore.',
  },
  'appia-tomb-4': {
    title: 'Tomb on the Via Appia',
    latin: 'CLAVDIAE · SECVNDAE · H · M · H · N · S',
    english: 'To Claudia Secunda. This monument does not pass to the heir.',
    source: '[G] with the standard clause hoc monumentum heredem non sequetur.',
  },
  'appia-tomb-5': {
    title: 'Tomb on the Via Appia',
    latin: 'L · VALERIVS · L · F · PAL · RVFVS',
    english: 'Lucius Valerius Rufus, son of Lucius, of the Palatine tribe.',
    source: '[G] a citizen\'s name with filiation and voting tribe, as on 1st-century tombs.',
  },
  'appia-tomb-6': {
    title: 'Tomb on the Via Appia',
    latin: 'DIS · MANIBVS · ANTONIAE · HELPIDI · VIX · ANN · XXIV',
    english: 'To the Spirits of the Dead. To Antonia Helpis, who lived 24 years.',
    source: '[G] composed in the standard formula.',
  },
  'appia-tomb-8': {
    title: 'Tomb on the Via Appia',
    latin: 'COLLEGIVM · FABRVM · TIGNARIORVM',
    english: 'The guild of the carpenters (builders).',
    source: '[G] the collegium fabrum tignariorum is well attested in Rome; guilds kept burial houses for their members.',
  },
  'paedagogium-graffiti': {
    title: 'Graffiti of the Pages',
    latin: 'HIC · FVIMVS · EVTYCHES · LIBANVS · HERMES — VALETE · PVERI · PRASINE · VINCAS',
    english: 'We were here: Eutyches, Libanus, Hermes. — Farewell, boys! Green, may you win!',
    source: '[G] scratched in the plaster by the imperial pages, composed in the manner of Roman graffiti ("hic fuimus", farewells, acclamations of the circus factions); the Paedagogium\'s real graffiti are mostly later.',
  },
  'house-livia-pipe': {
    title: 'Stamp on a Lead Pipe',
    latin: 'IVLIAE · AVG',
    english: '(Property) of Julia Augusta.',
    source: '[A] the stamp on the lead water pipe found in this house (CIL XV 7264), which gave it its name: Livia was called Julia Augusta after Augustus\' death in AD 14.',
  },
  'domus-flavia-inscription': {
    title: 'Statue Base of Trajan',
    latin: 'IMP · CAESARI · DIVI · NERVAE · F · NERVAE · TRAIANO · AVG · GERM · DACICO · PONT · MAX · TRIB · POT · XVII · IMP · VI · COS · VI · P · P',
    english: 'To the Imperator Caesar Nerva Traianus Augustus, son of the Deified Nerva, conqueror of Germany and Dacia, Pontifex Maximus, in his seventeenth year of tribunician power, hailed Imperator six times, consul six times, Father of his Country.',
    source: '[G] an honorific statue base in the vestibule; the titles are those of 113 (as on the Column\'s pedestal, CIL VI 960).',
  },
};

/**
 * Composed flavour in the palcirc scenery that is NOT an attested custom, so the Lexicon must not
 * present it as fact ([G]).
 */
export const PALCIRC_NOTES: Record<string, { note: string; source: string }> = {
  'appia-tomb-lamps': {
    note: 'Small oil lamps burn on a few tomb steps along the Via Appia at night.',
    source: '[G] families did bring lamps, food and flowers to tombs on anniversaries and at the Parentalia (13–21 February), and lamps were left in tombs; lamps burning on these particular nights are invented. The Lemuria (9, 11, 13 May) was a household rite at midnight with black beans (Ovid, Fasti 5.419–492), not a graveside one.',
  },
};

/** Viewpoints ('vista' spots): a title and one line, shown as a banner when the player looks out. */
export const PALCIRC_VISTAS: Record<string, { title: string; line: string }> = {
  'augustana-vista-circus': { title: 'The Emperor\'s Gallery', line: 'Below, the Circus Maximus fills the valley: the track, the spina with Augustus\' obelisk, and the Aventine beyond.' },
  'augustana-facade-vista': { title: 'The Palace over the Circus', line: 'Domitian\'s palace rises over the valley in a great curved front of three storeys, crowned by the colonnade of the imperial gallery.' },
  'augustana-lower-peristyle': { title: 'The Sunken Peristyle', line: 'A court one storey down, round a pool with crescent-shaped islands: the private heart of the emperor\'s house.' },
  'flavia-vista-area-palatina': { title: 'The Area Palatina', line: 'Where the Clivus Palatinus arrives. Senators and clients wait here for the morning salutation of the emperor.' },
  'tiberiana-vista-forum': { title: 'Over the Forum', line: 'From the Tiberian palace\'s terrace the Forum lies below, and the Capitol rises beyond it.' },
  'stadium-imperial-box': { title: 'The Imperial Box', line: 'The emperor\'s garden hippodrome: plane trees and laurels, fountains at both ends, a walk of gravel between two storeys of porticoes.' },
  'stadium-terrace-vista': { title: 'The Stadium Terrace', line: 'The garden terrace stands on tall substructures over the slope of the hill.' },
  'circus-vista-gallery': { title: 'The Top of the Stands', line: 'From the gallery on the Aventine side: the track, the spina, and across the valley the palaces of the Palatine.' },
  'circus-meta-prima': { title: 'Meta Prima', line: 'Three gilded cones on a podium: the chariots wheel round them seven times, and here most of the crashes happen.' },
  'circus-meta-secunda': { title: 'Meta Secunda', line: 'The turning post nearest the starting gates, where the drivers cut in tight for the next lap.' },
  'circus-tribunal': { title: 'Over the Starting Gates', line: 'The giver of the games drops the white cloth, the mappa, from here, and the twelve gates spring open together.' },
  'pulvinar-emperor-seat': { title: 'The Pulvinar', line: 'The imperial box beside the couches of the gods: the emperor watches the races here, in sight of the people.' },
  'capena-vista-city': { title: 'Inside the Porta Capena', line: 'The old Servian gate, long since swallowed by the city. The Via Appia runs on toward the Circus and the Palatine.' },
  'apollo-vista-terrace': { title: 'The Terrace of Apollo', line: 'Augustus\' temple of Luna marble behind you; below, his own modest house, and beyond it the valley of the Circus.' },
  'house-livia-atrium': { title: 'The Atrium of Livia\'s House', line: 'An old-fashioned atrium round its impluvium; the painted rooms beyond are well over a century old.' },
  'casa-romuli-vista': { title: 'The Edge of the Cermalus', line: 'Below the hut of Romulus the hill falls to the Velabrum and the river, where the basket with the twins came ashore.' },
  'adonaea-vista': { title: 'The Garden Balustrade', line: 'The gardens of Adonis end at a balustrade over the slope, with the roofs of the valley and the Caelian beyond.' },
};

/**
 * Shrines, altars and fountains ('shrine' spots): the name in the prompt, what kind of act it
 * offers (a temple prayer needs an offering, a crossroads prayer does not, a fountain is drunk
 * from) and a line for the rest.
 */
export const PALCIRC_SHRINES: Record<string, { name: string; act: 'temple' | 'compitum' | 'pray' | 'drink'; temple?: string; line: string }> = {
  'capena-mercury-spring': { name: 'Spring of Mercury', act: 'pray', line: 'Merchants dip a laurel sprig here and sprinkle their wares, asking Mercury to wash away their false oaths (Ovid, Fasti 5.673–692).' },
  'capena-castellum-outlet': { name: 'Outlet of the Aqua Marcia', act: 'drink', line: 'The Marcia: the coldest, clearest water in Rome.' },
  'capena-egeria-spring': { name: 'Spring of Egeria', act: 'pray', line: 'The nymph who counselled King Numa. Her grotto is plain now, its marble long gone (Juvenal 3.17–20).' },
  'capena-compitum': { name: 'Shrine of the Lares Compitales', act: 'compitum', line: 'The crossroads Lares of the gate quarter.' },
  'capena-fountain': { name: 'Street Fountain', act: 'drink', line: 'You drink from the spout of the lacus.' },
  'capena-lacus-appia': { name: 'Street Fountain', act: 'drink', line: 'You drink from the spout of the lacus.' },
  'capena-compitum-appia': { name: 'Shrine of the Lares Compitales', act: 'compitum', line: 'The crossroads Lares of the Via Appia.' },
  'lupercal-compitum': { name: 'Shrine of the Lares Compitales', act: 'compitum', line: 'The crossroads Lares of the Vicus Tuscus.' },
  'lupercal-lacus': { name: 'Street Fountain', act: 'drink', line: 'You drink from the spout of the lacus.' },
  'pulvinar-gods-couch': { name: 'Couches of the Gods', act: 'pray', line: 'The images of the gods, carried in the procession, watch the races from these couches.' },
  'sol-altar': { name: 'Altar of Sol', act: 'temple', temple: 'temple-sol-circus', line: 'The Sun, lord of the Circus, whose chariot the races imitate.' },
  'temple-ceres-altar': { name: 'Altar of Ceres, Liber and Libera', act: 'temple', temple: 'temple-ceres', line: 'The plebs\' own temple, where the aediles keep their archive.' },
  'apollo-altar': { name: 'Altar of Palatine Apollo', act: 'temple', temple: 'temple-apollo-palatinus', line: 'Myron\'s four bronze cattle stand round the altar.' },
  'house-augustus-laurels': { name: 'The Laurels of Augustus', act: 'pray', line: 'The laurels and the oak-leaf crown over the door were voted to Augustus by the Senate (Res Gestae 34).' },
  'magna-mater-altar': { name: 'Altar of the Great Mother', act: 'temple', temple: 'temple-magna-mater', line: 'Cybele, brought from Phrygia as a black stone in 204 BC.' },
  'victoria-altar': { name: 'Altar of Victory', act: 'temple', temple: 'temple-victoria', line: 'Victory, who kept the black stone of the Great Mother here until her own temple was built.' },
  'casa-romuli-hut': { name: 'The Hut of Romulus', act: 'pray', line: 'The pontiffs keep the founder\'s hut exactly as it was, and rebuild it whenever it burns.' },
  'lupercal-shrine': { name: 'The Lupercal', act: 'pray', line: 'Here the she-wolf suckled the twins. At the Lupercalia, in February, the Luperci run out from this cave.' },
  'adonaea-shrine': { name: 'Shrine of Venus and Adonis', act: 'pray', line: 'In summer the women sow quick seedlings in pots, the gardens of Adonis, that wither in days.' },
  'augustana-island-shrine': { name: 'The Island Shrine', act: 'pray', line: 'A small temple on an island in the great pool of the emperor\'s peristyle.' },
  'area-palatina-fountain': { name: 'Basin of the Area Palatina', act: 'drink', line: 'You drink from the marble basin.' },
  'stadium-fountain': { name: 'Fountain of the Stadium', act: 'drink', line: 'You drink from the semicircular fountain.' },
  'circus-shrine-murcia': { name: 'Shrine of Murcia', act: 'pray', line: 'The old goddess of the valley: her shrine stood here before the stands, and the Circus was built round it.' },
  'circus-altar-consus': { name: 'Altar of Consus', act: 'pray', line: 'The underground altar of Consus, uncovered only at his games, the Consualia, where the Sabine women were carried off.' },
};

/** What the 'vendor' spots sell over the counter (item id from the RPG's food list). */
export function vendorItem(spotId: string): { item: string; label: string } | null {
  if (/popina|thermopolium|wine/.test(spotId)) return { item: 'vinum', label: 'House wine' };
  if (/customs/.test(spotId)) return null;
  if (/taberna/.test(spotId)) return { item: 'panis', label: 'Bread' };
  return null;
}
