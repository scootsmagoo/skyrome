/**
 * Readable texts behind the palcirc 'inscription' spots, for the gameplay team (spot id → Latin as
 * carved, an English reading, and its source). Authentic texts are marked [A]; texts composed for
 * the game in period style are marked [G] and must not be cited as fact in the Lexicon.
 */
export interface InscriptionText {
  latin: string;
  english: string;
  source: string;
}

export const PALCIRC_INSCRIPTIONS: Record<string, InscriptionText> = {
  'obelisk-dedication': {
    latin: 'IMP · CAESAR · DIVI · F · AVGVSTVS · PONTIFEX · MAXIMVS · IMP · XII · COS · XI · TRIB · POT · XIV · AEGVPTO · IN · POTESTATEM · POPVLI · ROMANI · REDACTA · SOLI · DONVM · DEDIT',
    english: 'Imperator Caesar Augustus, son of the Deified, Pontifex Maximus, hailed Imperator twelve times, consul eleven times, in his fourteenth year of tribunician power, Egypt having been brought under the power of the Roman People, gave this as a gift to the Sun.',
    source: '[A] CIL VI 701 (the same text stands on both Augustan obelisks, 10 BC)',
  },
  'arch-titus-circus-inscription': {
    latin: 'SENATVS · POPVLVSQVE · ROMANVS · IMP · TITO · CAESARI · DIVI · VESPASIANI · F · VESPASIANO · AVG · PONTIF · MAX · TRIB · POT · X · IMP · XVII · COS · VIII · P · P · PRINCIPI · SVO · QVOD · PRAECEPTIS · PATRIS · CONSILIISQ · ET · AVSPICIS · GENTEM · IVDAEORVM · DOMVIT · ET · VRBEM · HIERVSOLYMAM · OMNIBVS · ANTE · SE · DVCIBVS · REGIBVS · GENTIBVS · AVT · FRVSTRA · PETITAM · AVT · OMNINO · INTEMPTATAM · DELEVIT',
    english: 'The Senate and People of Rome to the Imperator Titus Caesar Vespasianus Augustus, son of the Deified Vespasian, ... their princeps, because by his father\'s precepts, counsel and auspices he subdued the Jewish people and destroyed the city of Jerusalem, which all generals, kings and peoples before him had either attacked in vain or not attempted at all.',
    source: '[A] CIL VI 944 (recorded by the Einsiedeln itinerary; AD 81). The carved attic shows an abridgement.',
  },
  'circus-dedication': {
    latin: 'IMP · CAESAR · DIVI · NERVAE · F · NERVA · TRAIANVS · AVG · GERM · DACICVS · PONT · MAX · TRIB · POT · VII · IMP · IIII · COS · V · P · P · CIRCVM · MAXIMVM · AMPLIATVM · ET · EXORNATVM',
    english: 'Imperator Caesar Nerva Traianus Augustus, son of the Deified Nerva, conqueror of Germany and Dacia, Pontifex Maximus, in his seventh year of tribunician power, hailed Imperator four times, consul five times, Father of his Country: the Circus Maximus, enlarged and adorned.',
    source: '[G] composed for the game from Trajan\'s titles in AD 103 and Pliny, Panegyricus 51 (the real dedication is lost)',
  },
  'porta-capena-titulus': {
    latin: 'PORTA · CAPENA',
    english: 'The Capena Gate.',
    source: '[G] painted name board; the gate\'s name is ancient (Livy, Juvenal 3.11).',
  },
  'porta-capena-arch': {
    latin: 'AQVA · MARCIA',
    english: 'The Marcian Water.',
    source: '[G] a short marker on the aqueduct arch (the Marcia\'s own restoration texts are on the Porta Tiburtina arch).',
  },
  'temple-apollo-inscription': {
    latin: 'APOLLINI · PALATINO · IMP · CAESAR · DIVI · F',
    english: 'To Palatine Apollo: Imperator Caesar, son of the Deified.',
    source: '[G] period-style dedication for Augustus\' temple (28 BC); the real one is lost.',
  },
  'magna-mater-inscription': {
    latin: 'MATRI · DEVM · MAGNAE · IDAEAE',
    english: 'To the Great Idaean Mother of the Gods.',
    source: '[G] after the cult title Mater Deum Magna Idaea (well attested on altars).',
  },
  'casa-romuli-titulus': {
    latin: 'CASA · ROMVLI',
    english: 'The Hut of Romulus.',
    source: '[G] a small marker stone; the hut is attested by Dionysius 1.79 and Plutarch.',
  },
  'lupercal-inscription': {
    latin: 'LVPERCAL',
    english: 'The Lupercal.',
    source: '[G] restored by Augustus (Res Gestae 19).',
  },
  'temple-ceres-album': {
    latin: 'AEDILES · PLEBIS · EDICVNT',
    english: 'The plebeian aediles proclaim...',
    source: '[G] a whitewashed notice board (album) of the aediles, who kept their archive here.',
  },
  'domus-flavia-inscription': {
    latin: 'IMP · CAESARI · DIVI · NERVAE · F · NERVAE · TRAIANO · AVG · GERM · DACICO · PONT · MAX · TRIB · POT · XVII · IMP · VI · COS · VI · P · P',
    english: 'To the Imperator Caesar Nerva Traianus Augustus, son of the Deified Nerva, conqueror of Germany and Dacia, Pontifex Maximus, in his seventeenth year of tribunician power, hailed Imperator six times, consul six times, Father of his Country.',
    source: '[G] an honorific statue base in the vestibule; the titles are those of 113 (as on the Column\'s pedestal, CIL VI 960).',
  },
};
