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
  'appia-tomb-0': {
    latin: 'SISTE · VIATOR · ET · LEGE',
    english: 'Stop, traveller, and read.',
    source: '[G] the commonest appeal of Roman roadside epitaphs (e.g. CIL VI 11252 and many others); this schola bench is composed for the game.',
  },
  'appia-tomb-1': {
    latin: 'D · M · C · IVLIO · FELICI · VIX · ANN · LXII · IVLIA · PRIMA · CONIVGI',
    english: 'To the Spirits of the Dead. To Gaius Julius Felix, who lived 62 years. Julia Prima to her husband.',
    source: '[G] composed in the standard formula (D M, vixit annos) of Rome\'s early 2nd-century epitaphs.',
  },
  'appia-tomb-2': {
    latin: 'M · LICINIVS · EROS · PISTOR · SIBI · ET · SVIS',
    english: 'Marcus Licinius Eros, baker, (made this) for himself and his family.',
    source: '[G] a freedman tradesman\'s tomb in the manner of the baker Eurysaces\' (CIL VI 1958).',
  },
  'appia-tomb-3': {
    latin: 'LIBERTORVM · FAMILIAE · STATILIAE',
    english: '(The tomb) of the freedmen of the household of the Statilii.',
    source: '[G] after the great columbarium of the Statilii Tauri (CIL VI 6213–6640), which lay by the Porta Maggiore.',
  },
  'appia-tomb-4': {
    latin: 'CLAVDIAE · SECVNDAE · H · M · H · N · S',
    english: 'To Claudia Secunda. This monument does not pass to the heir.',
    source: '[G] with the standard clause hoc monumentum heredem non sequetur.',
  },
  'appia-tomb-5': {
    latin: 'L · VALERIVS · L · F · PAL · RVFVS',
    english: 'Lucius Valerius Rufus, son of Lucius, of the Palatine tribe.',
    source: '[G] a citizen\'s name with filiation and voting tribe, as on 1st-century tombs.',
  },
  'appia-tomb-6': {
    latin: 'DIS · MANIBVS · ANTONIAE · HELPIDI · VIX · ANN · XXIV',
    english: 'To the Spirits of the Dead. To Antonia Helpis, who lived 24 years.',
    source: '[G] composed in the standard formula.',
  },
  'appia-tomb-8': {
    latin: 'COLLEGIVM · FABRVM · TIGNARIORVM',
    english: 'The guild of the carpenters (builders).',
    source: '[G] the collegium fabrum tignariorum is well attested in Rome; guilds kept burial houses for their members.',
  },
  'domus-flavia-inscription': {
    latin: 'IMP · CAESARI · DIVI · NERVAE · F · NERVAE · TRAIANO · AVG · GERM · DACICO · PONT · MAX · TRIB · POT · XVII · IMP · VI · COS · VI · P · P',
    english: 'To the Imperator Caesar Nerva Traianus Augustus, son of the Deified Nerva, conqueror of Germany and Dacia, Pontifex Maximus, in his seventeenth year of tribunician power, hailed Imperator six times, consul six times, Father of his Country.',
    source: '[G] an honorific statue base in the vestibule; the titles are those of 113 (as on the Column\'s pedestal, CIL VI 960).',
  },
};
