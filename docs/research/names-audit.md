# Names audit (rework M1, 2026-10-09)

Scope: every landmark (197), named hill, road and gate name in `src/data/atlas.ts`, and every
player-facing `LocationDef` (`src/game/locations.ts`, `src/content/places.ts`). The rules are
enforced by `tests/names.test.ts`.

## Method and honesty note

- All 197 landmark names (English and Latin) were read against Platner and Ashby (1929), the
  Regionary Catalogues (Notitia, Curiosum) and Richardson/LTUR as I know them. Web checks were made
  only where I was unsure or the plan flagged the entry; pages fetched or searched are cited below.
  Entries not listed here were read and left unchanged (their Latin is the standard attested form:
  Aedes Saturni, Basilica Iulia, Curia Iulia, Thermae Traiani, Theatrum Pompei, etc.).
- Primary-source citations (Livy, Pliny, Frontinus, CIL numbers and so on) not backed by a page listed in this file are from memory and unchecked; treat them as pointers to verify.
- Entries marked "reconstructed" have no recorded ancient name. They get a plainly descriptive Latin
  phrase (not a claim of attestation), flagged here so wave 2 can replace it if better evidence turns up.
- Rules: no parentheses, slashes or question marks in a name; modern, Italian and medieval names go
  to `codexNote` (out-of-world text); display names are unique; Latin present and not Italian.

## One pipeline

| Before | After |
|---|---|
| Map used `mapName` (kept glosses such as "(private palace)"), banner used `displayName`, content `landmarkLocation` used the raw atlas name, front spots used `Before the ${raw}` | `displayName` everywhere (`mapName` is now an alias), content locations and `Before ...` spots go through it (`beforeName`: "Before Trajan's Column", not "Before the Trajan's Column") |
| Map labelled every non-terrace hill ("MONTEVERDE PLATEAU") | Map labels only `namedHills()` (hills with an ancient Latin name) |
| Map roads, aqueducts and bridges showed the raw Latin ("Pons Neronianus (Triumphalis)") | `displayLatin` with English fallback |

## Collisions fixed

| Id | Was | Now | Source |
|---|---|---|---|
| temple-castor-in-circo | Temple of Castor and Pollux (Circus Flaminius) | Temple of Castor in the Circus Flaminius / Aedes Castoris in Circo Flaminio | Platner and Ashby, "Castor, Aedes (in Circo Flaminio)" |
| iseum-campense / iseum-labicana | both "Sanctuary of Isis and Serapis" | Isis Sanctuary of the Campus Martius / Iseum Campense; Isis Sanctuary of the Oppian / Iseum Metellinum | Notitia Regio III "Isis et Serapis"; Platner p. 286 cross-references "Isium Metellinum" to Isis in Reg. III; Wikipedia, Regio III Isis et Serapis |
| arch-augustus / arch-augustus-tiburtina | both "Arch of Augustus" | Arch of Augustus at the Forum; Arch of Augustus on the Tiburtine Way (Latin "Arcus Augusti in Via Tiburtina") | Cassius Dio 54.8 (Forum arch); Frontinus, Aq. (Porta Tiburtina arch) |
| bibliotheca-ulpia-east / -west | both "Ulpian Library" | Ulpian Greek Library / Ulpian Latin Library | Gellius 11.17 (Bibliotheca Ulpia); the Greek and Latin pair is attested, which hall was which is not, so the assignment is a convention (noted in codexNote) |
| asylum vs hill capitoline-asylum | both "The Asylum" in effect | landmark "The Asylum" (Asylum); hill "Saddle Between the Summits" (Inter Duos Lucos) | Livy 1.8.5 "inter duos lucos" |
| temple-bellona vs columna-bellica | "Temple of Bellona and the War Column" and "War Column" | Temple of Bellona; the column keeps its own entry | Platner, "Bellona, Aedes" and "Columna Bellica" |

## Modern, Italian or medieval names moved to codexNote

| Id | Was | Now (player text) | Note | Source |
|---|---|---|---|---|
| meta-romuli | Vatican Pyramid / Meta Romuli (medieval name) | Pyramid Tomb of the Vatican Fields / Pyramis Vaticana (reconstructed) | Names kept in codexNote | Richardson, "Meta Romuli" (medieval name) |
| monte-testaccio | Mound of Potsherds / Mons Testaceus (medieval) | Potsherd Heap of the Emporium / Cumulus Testarum (reconstructed) | Testaccio, Mons Testaceus | Platner, "Testaceus Mons": the name is medieval |
| sette-sale | Seven Halls Cistern / (Sette Sale) | Cistern of the Baths of Trajan / Cisterna Thermarum Traiani (reconstructed) | Sette Sale is Italian | LTUR, "Sette Sale" |
| colossus-sol | Colossus of Sol (formerly Nero) | Colossus of Sol / Colossus Solis | Nero origin, Hadrian's move in 128 | Pliny NH 34.45; Historia Augusta, Hadrian 19.12 |
| arch-augustus | (Parthian Arch) | Arch of Augustus at the Forum | "Parthian Arch" is a modern label | Cassius Dio 54.8 |
| forum-nerva | (Passageway Forum) | Forum of Nerva / Forum Transitorium | Passageway gloss | Martial 1.2.8; Suetonius, Domitian 5 |
| markets-trajan | Markets of Trajan / "(Mercatus Traiani, modern name)" | Market Halls of Trajan / Tabernae Fori Traiani (reconstructed) | Mercati di Traiano, ancient name and use unknown | LTUR, "Mercati di Traiano" |
| insula-aracoeli | Insula of the Ara Coeli / "(insula)" | Tenement on the Capitoline Slope / Insula ad Capitolium (reconstructed) | Ara Coeli is a medieval church | Richardson, "Insula Aracoeli" |
| domus-flavia | Flavian Palace (state wing) / Domus Flavia | Imperial Palace, State Halls / Aula Regia (reconstructed) | Domus Flavia is a nineteenth-century label | Wikipedia, Domus Flavia: "The term Domus Flavia is a modern designation for the northwestern section of the palace" |
| domitianic-vestibule | Aula / Rampa Domitianea | Vestibulum Palatii (reconstructed) | Rampa Domitianea modern | same |
| colosseum | Flavian Amphitheatre (Colosseum) | Flavian Amphitheatre | Colosseum name is medieval | Platner, "Amphitheatrum Flavium" |
| auditorium-maecenas | Auditorium of Maecenas / "(Auditorium Maecenatis)" | Garden Hall of Maecenas / Cenatio Maecenatiana (reconstructed) | Auditorium is the modern guess | LTUR, "Horti Maecenatis" |
| jewish-transtiberim | Jewish Quarter of Trastevere / "(Transtiberim)" | Jewish Quarter Across the Tiber / Trans Tiberim | Trastevere is Italian | Notitia Regio XIV Trans Tiberim |
| vatican-necropolis | Tombs of the Via Cornelia (Vatican) / "(Vatican necropolis)" | Tombs of the Via Cornelia / Sepulcra Viae Corneliae (descriptive) | Modern label | Richardson |
| largo-argentina-temples | Sacred Area (Temples A-D) / Area Sacra | Four Temples of the Old Minucian Portico / Porticus Minucia Vetus | Area Sacra di Largo Argentina is modern; temple B is the Fortuna Huiusce Diei of Catulus | Wikipedia, Largo di Torre Argentina and Fortuna Huiusce Diei; Stanford FUR project lists the Porticus Minucia identification with a question mark, so the Latin is a best match |
| obelisk-circus-maximus | Obelisk of Ramesses II (Circus) | Obelisk of Augustus in the Circus Maximus | Ramesses II in codexNote | Pliny NH 36.71 |
| porta-maggiore | Claudian Aqueduct Arches (later Porta Maggiore) / Arcus Claudii (Praenestina/Labicana) | Claudian Aqueduct Arches / Arcus Aquae Claudiae (descriptive; the old Latin duplicated the Arch of Claudius) | Aurelian Wall reuse | CIL VI 1256 (inscription on the arches) |
| temple-apollo-sosianus | Aedes Apollinis in Circo (Medici) | Aedes Apollinis in Circo | "Sosianus" is modern shorthand for the final rebuild; the 431 BC temple was Apollo Medicus | Wikipedia, Temple of Apollo Sosianus; Livy 40.51.6 "aedem Apollinis Medici" |
| clivus-argentarius (road) | Bankers' Rise / Clivus Argentarius (medieval name) | Rise Beside the Forum of Caesar (no Latin) | The Latin name is medieval | Platner, "Argentarius, Clivus" |
| via-biberatica (road) | Via Biberatica (Markets of Trajan) / medieval name | Street by the Market Halls | Via Biberatica is medieval (already in the Markets codexNote) | Richardson |
| road names | "(later Via della Lungara)", "(later Via dei Serpenti)" | removed from the names | Italian street names | |

## Other Latin and English corrections

| Id | Change | Source |
|---|---|---|
| rostra | "Rostra (Speakers' Platform)" becomes "Rostra" | gloss removed |
| comitium-lapis-niger | Latin "Comitium / Lapis Niger" becomes "Comitium et Niger Lapis" | Festus 184 L "niger lapis in Comitio" |
| temple-concord | Latin "Aedes Concordiae (Augustae)" becomes "Aedes Concordiae" | Platner |
| porticus-margaritaria | Latin "(? = 'Horrea Vespasiani')" becomes "Porticus Margaritaria"; the equation goes to codexNote | Platner, "Margaritaria, Porticus" |
| carcer-tullianum | Latin "Carcer et Tullianum" | Sallust, Cat. 55.3 "Tullianum"; "Carcer Tullianum" is a scholars' compound |
| forum-trajan-gateway | Latin "(Arcus Traiani?)" becomes "Arcus Traiani" with the doubt in codexNote | coin evidence only |
| palatine-stadium | "Palatine Stadium (Garden Hippodrome)" becomes "Palace Hippodrome" (Hippodromus Palatii); "stadium" is the modern label | Platner, "Hippodromus Palatii" (could not retrieve the page; the name is attested in the Historia Augusta) |
| adonaea | Latin "Adonaea (?)" becomes "Adonaea" | Platner, "Adonaea": the name is on a Forma Urbis fragment, site uncertain; Stanford FUR project suggests the Campus Martius |
| temple-hercules-victor | Latin "(Olivarii)" dropped from the line | codexNote already carries it |
| temple-janus-holitorium | "Temple of Janus at the Vegetable Market" | Livy 40.34 |
| horrea-galbana | Latin "Horrea Galbae" | CIL VI 33747 and Platner, "Horrea Galbae" |
| horologium-augusti | "Horologium Augusti" | Pliny NH 36.72 |
| pantheon | "(burned; rebuilding begins)" removed from the name; Latin "Pantheum" | Pliny NH 36.38; Dio 53.27 |
| temple-sol-circus | Latin "Aedes Solis in Circo" | Tacitus, Ann. 15.74 |
| divorum | "Porticus of the Deified" becomes "Portico of the Deified" | Notitia Reg. IX "Divorum" |
| tarentum-altar | "... at the Tarentum" | Valerius Maximus 2.4.5 |
| aqua-traiana-terminus, temple-jupiter-stator, volcanal, moneta, cloaca-maxima-outlet, arch-titus-circus, porta-collina | parentheses removed from the Latin | no change of content |
| 14 other names with parentheses | glosses removed (Tabularium, The Subura, Buried Golden House, Emporium, Naumachia of Augustus, Temple of the Great Mother, Morning School, Portico of Pompey, Portico of Vipsania, Minucian Portico, Temple of Neptune and Mars at the Circus Flaminius, Temples of Diana and Juno Regina on the Aventine, Temple of Victory on the Palatine, Prow of the Tiber Island, Obelisk of the Island) | none needed |
| spes-vetus-castella | "Aqueduct Junction at Spes Vetus" / Ad Spem Veterem | Frontinus, Aq. 19 and 65 "ad Spem Veterem" |

## Hills

| Id | Was | Now | Source |
|---|---|---|---|
| capitolium | Capitoline Hill: Capitolium / Capitolium (Mons Capitolinus) | Capitoline Hill / Capitolium | Platner, "Capitolium" |
| arx | Capitoline Hill: Arx | The Arx | |
| oppius, cispius, esquiline-plateau | "Esquiline: Oppian" and similar | Oppian Hill, Cispian Hill, Esquiline Hill | Varro, LL 5.50 |
| pincian | Pincian Hill / Collis Hortulorum (later: Pincius) | Hill of Gardens / Collis Hortulorum | Wikipedia, Pincian Hill: the name Pincius comes from the Pincii "in the 4th century AD". Lewis and Short give "collis hortorum" for the early name; Pleiades and Notitia-style lists give "hortulorum". Kept "hortulorum"; verify against Platner's "Pincius Mons" entry in wave 2 |
| castra-plateau | Castra Praetoria plateau / Campus Viminalis (sub aggere) | Viminal Field / Campus Viminalis | Platner, "Viminalis Campus" (medium confidence) |
| aventine-minor | Lesser Aventine / "Aventinus (modern term: Aventinus Minor)" | Lesser Aventine / Aventinus Minor | The term is modern scholarly usage: Oxford (ORA) and the BSR project use it, and the Arval acta of AD 240 have "Aventino maiori". Kept because the hill needs a Latin line to be a region; flagged |
| janiculum-north | Janiculum north spur | Northern Janiculum / Ianiculum | |
| monteverde, latin-plateau | Monteverde plateau (modern); Plateau of the Via Latina | Transtiberine Plateau; unchanged | Not named hills (no ancient Latin), so no longer map labels or banners |
| spes-vetus-rise | Rise of Ad Spem Veterem | Rise of Spes Vetus | |

Terrace entries ("(34 m terrace)") keep their parenthetical: they are terrain shaping, never shown.

## Contents spots (places.ts)

Parentheses removed from "Inside/Outside the Capena Gate (the night cart)", "Litter Stand (Forum)" and
friends, "The Street below the Palatine (sweepers)", "The Circus wall (the fans' graffiti)" and the
atlas road "Street below the Palatine (N side of the Circus)". The two world-spot and bible-spot
copies of the Capena spawn now agree.

## Not changed, and why

- Lowland names ("Campus Martius (general)", "Velia north slope (Horrea Piperataria)") are terrain
  shaping, never shown; only the two named valleys (Circus Valley, Velabrum) are places.
- Wall and aqueduct names are not shown; the map strips notes from their Latin.
- "Domus Augustana": Wikipedia says the name "in antiquity may have applied to the palace as a whole",
  so it stays as both the English and Latin name.
- "Temple of Jupiter Best and Greatest", "Carcer", "Sepulcrum C. Cestii" etc. are conventional and attested.

## Wave 2

- Confirm Collis Hortulorum versus Collis Hortorum, Campus Viminalis, Hippodromus Palatii and the
  reconstructed Latin phrases against Platner's own pages (the Thayer and Heidelberg scans were not
  reachable from this session).
- The unnamed lowlands, walls and aqueducts could be run through the same test if they ever get labels.
- Terrace parentheticals could move to an `id` convention if they are ever exposed.

## M5b re-audit (rework wave 3, 2026-10-10)

Every name the player can see was read again: the 197 landmarks (English, Latin, and the Latin as the
banner prints it: `toInscription` upper-cases and turns U to V and J to I, so "Basilica Iulia" reads
BASILICA · IVLIA; every Latin line is stored with I and U and the banner is the only place the
convention lives, so the lines stay consistent), the named hills and valleys, every road, gate, bridge
and aqueduct label on the map, `places.ts` and `locations.ts` spots, and the player-facing lines in
`src/content`, `src/npc`, `src/dialogue` and `src/quests` that mention a place. Method and honesty as
in the first audit: judged from Platner and Ashby, the Regionary Catalogues and LTUR as remembered; no
page was fetched this time, so each change below is a correction of an anachronism the repository's
own rules call out, not a new claim of attestation.

### Changed

| Where | Was | Now | Why |
|---|---|---|---|
| landmark `aqua-traiana-terminus` | Aqua Traiana Terminal and Janiculum Mills | Terminus of Trajan's Aqueduct | The atlas' own note says the excavated Janiculum mills are mostly later; the aqueduct (AD 109) is what is certain. "Terminal" is modern usage |
| road `via-aurelia` Latin | Via Aurelia Vetus | Via Aurelia | "Vetus" distinguishes it from the Via Aurelia Nova, which is Caracalla's (after AD 113) |
| road `road-between-palatine-and-caelian` | Triumphal Road, Capena Gate to the Colosseum | Triumphal Road, Capena Gate to the Amphitheatre | "Colosseum" is a medieval name; the same word was also in `combat/danger.ts` ("the road to the Colosseum"), a sailor's bark ("the whole Colosseum") and two district names |
| bark, danger spot, district names | Colosseum | amphitheatre (district: "Amphitheatre valley", Latin Vallis Amphitheatri was already there) | same |

### Read and left, with the reason

- "Basilica Paulli" in content spots, dialogue and builders against "Basilica Aemilia" on the banner:
  Pliny (NH 36.102) says Paulli; the atlas `codexNote` says both. Left as is; the banner and map agree.
- "Basilica Argentaria" (Bankers' Hall): the name is attested only in the 4th-century catalogues. The
  building (a Trajanic hall by the Forum of Caesar) is a hypothesis. Flag for wave 4; not changed.
- "Domus Augustana", "Domus Flavia" (already moved to "Imperial Palace, State Halls"), "Pons
  Neronianus" and "Aventinus Minor": plausible, not provable for 113; left, as in the first audit.
- "Via Salaria Vetus": the Old Salt Way is the Via Salaria itself (the "Nova" is later, Hadrianic or
  after); left.
- "Via Triumphalis" is the Latin of two roads (the Vatican one and the valley road between the Palatine
  and the Caelian): the second is a conjecture, noted here, not changed.
- Region names (Porta Capena, Isis et Serapis, Templum Pacis, Palatium...) are the Regionary
  headings, 4th century; they are used only as out-of-world labels (the atlas says so).
- Nothing built after AD 113 appears: no Aurelian Walls, Venus and Roma, Hadrian's Mausoleum, Arch of
  Constantine, Baths of Caracalla or Diocletian. The Pantheon reads "burned; rebuilding begins".
- Lines in `talk.ts`, `barks.ts` and the folk topics that name places (Capitol, Pantheon under
  hoardings, "lime for the Pantheon", Hadrian in Athens) are consistent with 113 (the Pantheon burned in 110; Hadrian was archon at Athens in 112).

### Tests

`tests/names.test.ts` now also reads every road, gate, bridge and aqueduct label: no later names
(Colosseum, Coliseum, "Aurelia Vetus", "Aurelia Nova", Rocca, Botteghe, Mills, Aurelian Wall,
Trastevere), no Italian, no notes.
