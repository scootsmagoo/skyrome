# Rome, AD 113: topography and terrain (research data for SKYROME)

Research notes for building the terrain and city layout of Rome in spring–summer AD 113, the year Trajan's Column was dedicated. The file covers the hills, the low ground, the Tiber, bridges, streets, the Servian Wall, aqueducts and the 14 regions. Each coordinate gives a confidence and a source.

**The frame is the same as the rest of the project** (see `CLAUDE.md` and `topography-landmarks.md`):

- The origin `[0, 0]` is the **Miliarium Aureum**: **lat0 = 41.892580, lon0 = 12.484380** (OSM way 131557543).
- `x = (lon − lon0) · 111320 · cos(lat0) ≈ (lon − 12.484380) · 82 866.4`, so +x points EAST.
- `z = −(lat − lat0) · 110 574`, so +z points SOUTH and north is −z.
- Every number here is in **REAL meters**. The game applies `WORLD_SCALE = 0.6` through `src/world/coords.ts`.
- Elevations are **m ASL at ancient ground level for AD 113** unless the text says "modern".

**Confidence codes** used throughout:

| Code | Meaning |
|---|---|
| **A** | Surveyed modern position of surviving fabric (OSM geometry), or an elevation measured by modern instruments. Good to about 10 m horizontally. |
| **B** | Good published value, or a well-established identification. Good to about 20–40 m or about 2 m vertically. |
| **C** | Reconstructed or inferred from sources plus topography. Good to about 50–150 m or 3–5 m vertically. Fine for the game, but flagged. |
| **D** | Speculative. Scholars disagree. Treat it as a design choice. |

> **TL;DR for the terrain builder.**
> 1. The Tiber's **normal water level is about 6 m ASL** (seasonal 5–7). Minor floods reach 10 m, major floods 15 m and exceptional floods 18–20 m.
> 2. Valley floors in AD 113: the Forum is 12.6–14 m, the Velabrum about 12 m, the Forum Boarium about 9.5 m, the Circus Maximus arena 11–13.5 m, the Colosseum surround about 19 m, the Campus Martius 10–14 m (lowest about 10 m at the Tarentum), Trastevere 10–13 m and the Emporium about 9 m.
> 3. Hilltops: Palatine **51**, Capitoline (Arx) **48** and Capitolium **46**, Aventine **46**, Caelian **45–52**, Oppian about 50, Cispian about 56, Viminal about 56, Quirinal **55–60**, Pincian about 58, Janiculum crest **80–85**, Vatican hill about 65–75, Monte Mario 139.
> 4. Today's ground in the valleys sits **5–15 m higher** than ancient ground. **Never use modern street levels** in the valleys. Hilltops have risen only 1–5 m.
> 5. Section 4 has a **gridded ancient DEM** (100 m core and 200 m outer grid) plus about 100 curated control points. Appendix A has the same data shaped for `TerrainSource` in `src/world/terrain/heightmap.ts`.

## 1. Origin and anchor sites

The **Miliarium Aureum** was the gilded milestone that Augustus set up in 20 BC. Tacitus places it "sub aedem Saturni", below the Temple of Saturn (*Hist.* 1.27). A circular marble base at the S end of the Rostra, next to the Temple of Saturn, is traditionally identified as its foundation, and OSM maps it as way 131557543 (A for the position of the remains, B for the identification). The "Umbilicus Urbis" brick drum sits at the other (N) end of the Rostra, about 23 m away.

Positions below are polygon centroids computed from current OpenStreetMap geometry, unless the note says otherwise. Lat/lon are WGS84. "Ref only" means the structure does **not exist in 113** and is listed only as a survey landmark.

| Site | lat | lon | [x, z] | Note |
|---|---|---|---|---|
| Miliarium Aureum (ORIGIN) | 41.892580 | 12.484380 | [0, 0] | by definition (A/B) |
| Umbilicus Urbis | 41.892721 | 12.484589 | [17, -16] | N end of Rostra (A) |
| Rostra Augusti, centre | 41.892595 | 12.484642 | [22, -2] |  (A) |
| Temple of Saturn (podium) | 41.892403 | 12.484087 | [-24, 20] | 8 Ionic columns survive; front faces the Forum (A) |
| Temple of Concord | 41.892934 | 12.484206 | [-14, -39] | set against the Tabularium (A) |
| Temple of Vespasian | 41.892731 | 12.483921 | [-38, -17] |  (A) |
| Tabularium (Forum façade) | 41.892856 | 12.483850 | [-44, -31] | OSM node; substructures rise against the Capitoline cliff (A) |
| Curia Julia | 41.892960 | 12.485397 | [84, -42] | Domitianic rebuild in 113 (A) |
| Basilica Aemilia | 41.892625 | 12.486092 | [142, -5] |  (A) |
| Basilica Julia | 41.891961 | 12.484783 | [33, 68] |  (A) |
| Temple of Castor (podium centroid) | 41.891679 | 12.485630 | [104, 100] | the 3 standing columns are on the E flank, near the front (A) |
| Temple of Divus Julius | 41.892045 | 12.486014 | [135, 59] |  (A) |
| Temple of Vesta | 41.891694 | 12.486198 | [151, 98] |  (A) |
| House of the Vestals | 41.891351 | 12.486671 | [190, 136] |  (A) |
| Arch of Titus | 41.890672 | 12.488584 | [348, 211] | summa Sacra Via, on the Velia saddle (A) |
| Colosseum, centre | 41.890267 | 12.492346 | [660, 256] | outer ellipse about 188 x 156 m; long axis bearing about 115°/295° (WNW–ESE) (A) |
| Ludus Magnus | 41.890133 | 12.494987 | [879, 271] | Domitianic gladiator school (A) |
| Trajan's Column | 41.895809 | 12.484273 | [-9, -357] | dedicated 12 May 113 (A) |
| Forum of Trajan (centroid of remains) | 41.895161 | 12.485218 | [69, -285] | axis bearing about 131° (NW–SE) (A) |
| Markets of Trajan | 41.895656 | 12.486118 | [144, -340] | cut into the Quirinal slope (A) |
| Forum of Augustus | 41.894234 | 12.486765 | [198, -183] |  (A) |
| Forum of Caesar | 41.893721 | 12.485180 | [66, -126] |  (A) |
| Forum of Nerva (Transitorium) | 41.893242 | 12.486483 | [174, -73] | built over the lower Argiletum (A) |
| Templum Pacis | 41.892682 | 12.487294 | [241, -11] |  (A) |
| Domus Tiberiana | 41.890275 | 12.486153 | [147, 255] |  (A) |
| Domus Flavia | 41.888814 | 12.486608 | [185, 416] |  (A) |
| Domus Augustana | 41.888064 | 12.487074 | [223, 499] |  (A) |
| Palatine "Stadium" | 41.887560 | 12.487493 | [258, 555] |  (A) |
| Circus Maximus, carceres (WNW end) | 41.887063 | 12.482268 | [-175, 610] | derived from the park outline; axis bearing about 120° (B) |
| Circus Maximus, centre of spina | 41.885662 | 12.485526 | [95, 765] | Wikipedia centre 41.8859, 12.4857 gives [110, 744] (B) |
| Circus Maximus, apex of curved ESE end | 41.884215 | 12.488785 | [365, 925] | arena about 580 m; outer building about 620 x 120–140 m (B) |
| Temple of Portunus | 41.889246 | 12.480904 | [-288, 369] |  (A) |
| Round Temple (Hercules Victor / Olivarius) | 41.888740 | 12.480766 | [-299, 425] |  (A) |
| Sant'Omobono temples (Fortuna & Mater Matuta) | 41.890640 | 12.481289 | [-256, 215] |  (A) |
| Theatre of Marcellus (OSM building) | 41.891960 | 12.479705 | [-387, 69] | cavea centre about [-395, 80] ±25; diameter about 130 m; curved façade toward the E/SE, stage toward the river (A/C) |
| Temple of Apollo Sosianus | 41.892400 | 12.479555 | [-400, 20] |  (A) |
| Temple of Bellona | 41.892382 | 12.479887 | [-372, 22] |  (A) |
| Porticus Octaviae (propylon) | 41.892522 | 12.478572 | [-481, 6] |  (A) |
| Crypta Balbi | 41.894389 | 12.478908 | [-453, -200] | Theatre of Balbus lay just W (A) |
| Largo Argentina, Area Sacra | 41.895398 | 12.476868 | [-622, -312] | Republican temples A–D (A) |
| Theatre of Pompey (orchestra, approx.) | 41.895429 | 12.473519 | [-900, -315] | cavea convex to the W (traced by Via di Grotta Pinta); the porticus runs E to Largo Argentina (C) |
| Pantheon rotunda centre (Hadrianic plan) | 41.898558 | 12.476826 | [-626, -661] | circle fit, r = 29 m. In 113 this is a construction site: the Domitianic Pantheon burned in 110 (A) |
| Baths of Agrippa (remains) | 41.896935 | 12.476997 | [-612, -482] |  (A) |
| Stadium of Domitian (Piazza Navona) | 41.898910 | 12.473098 | [-935, -700] | arena about 256 x 60 m, axis about N–S (175°) (A) |
| Mausoleum of Augustus | 41.906018 | 12.476426 | [-659, -1486] | drum diameter about 89 m (A) |
| Ara Pacis, ORIGINAL site (under Palazzo Fiano) | 41.903297 | 12.479372 | [-415, -1185] | ±20 m; the modern museum at [-736, -1501] is NOT the 113 site (B) |
| Castra Praetoria, centre | 41.906580 | 12.506850 | [1862, -1548] | corners NE [1962, -1816], SE [2120, -1411], SW [1763, -1280], NW [1605, -1685]; long axis NNW–SSE; N and E walls survive inside the Aurelian Wall (B) |
| Pyramid of Cestius | 41.876449 | 12.480854 | [-292, 1784] | tomb beside the Via Ostiensis. There is NO wall here in 113 (A) |
| Tiber Island, centre | 41.890545 | 12.477682 | [-555, 225] | see section 5.5 (A) |
| Pons Fabricius, centre | 41.891075 | 12.478253 | [-508, 166] |  (A) |
| Pons Cestius, centre | 41.890057 | 12.477327 | [-584, 279] |  (A) |
| Pons Aemilius, surviving arch (Ponte Rotto) | 41.889337 | 12.479373 | [-415, 359] |  (A) |
| Porta Maggiore (Claudian aqueduct arches) | 41.891439 | 12.515184 | [2553, 126] | NOT a city gate in 113; the arches carry the Claudia and Anio Novus over the Via Labicana and Via Praenestina (A) |
| Baths of Trajan, W exedra (OSM) | 41.892591 | 12.493911 | [790, -1] | precinct centre approx. [965, 30] ±40, precinct about 330 x 315 m (A/C) |
| Baths of Trajan, main remains (OSM) | 41.892425 | 12.497367 | [1076, 17] |  (A) |
| Sette Sale cistern (Baths of Trajan) | 41.892668 | 12.499431 | [1247, -10] |  (A) |
| Santa Sabina (Aventine NW edge) | 41.884500 | 12.479757 | [-383, 893] |  (A) |
| Porta Capena (site; tower remains) | 41.883940 | 12.490499 | [507, 955] |  (A/B) |
| Porta Esquilina (later "Arch of Gallienus") | 41.895776 | 12.501357 | [1407, -353] | Augustan travertine arch (A) |
| Tarpeian Rock (OSM) | 41.891506 | 12.482311 | [-171, 119] |  (B) |
| Monte Testaccio (modern mound) | 41.875965 | 12.475297 | [-753, 1837] | only partly built in 113 (A) |
| Pons Mulvius (Ponte Milvio), centre | 41.935511 | 12.466978 | [-1442, -4747] |  (A) |
| Arch of Septimius Severus (ref only, AD 203) | 41.892834 | 12.484739 | [30, -28] | not built yet (A) |
| Arch of Constantine (ref only, 315) | 41.889762 | 12.490667 | [521, 312] | not built yet (A) |
| Temple of Venus & Roma site (ref only, 121–135) | 41.890802 | 12.489797 | [449, 197] | in 113: Nero's vestibule terrace with the Colossus (A) |
| Mausoleum of Hadrian (ref only, 130s) | 41.903040 | 12.466361 | [-1493, -1157] | in 113: Horti Domitiae gardens (A) |

Sources: OpenStreetMap (Overpass extracts, Oct 2026), with geometry from the mapped archaeological features. Wikipedia and Wikidata coordinates were used as cross-checks; they agree to within about 20–60 m, and Wikipedia points tend to be less precise.

## 2. Hills

### 2.1 Summary (ancient AD 113 levels)

"Plateau" means the typical top surface. "Foot" means the valley floor at the base in 113. Slopes come from the reconstructed DEM, which is smoothed, so real cliffs are steeper than the DEM numbers.

| Hill | Summit (m ASL) | Typical plateau | Foot (valley) | Slope character | Cliffs and notes | Conf. |
|---|---|---|---|---|---|---|
| **Capitoline: Arx** (N summit, S. Maria in Aracoeli) | **48–49** | 40–48 | 13–15 (Forum, Via Lata) | Very steep on all sides (DEM 35–75 %) | N and NE faces fall about 30 m to the Clivus Argentarius and Via Lata. In 113 the N spur facing the Quirinal has been **cut back for Trajan's Forum** (107–112). | B (Platner: Arx about 49 m, area about 1 ha) |
| **Capitoline: Capitolium** (S summit, Temple of Jupiter O.M.) | **46–47** | 40–46 | 10–14 (Forum Holitorium, Forum) | Cliffs | **Tarpeian Rock** (Saxum Tarpeium) is the S/SW cliff over the Vicus Iugarius and Forum Holitorium, a near-vertical drop of about 30 m. The E face over the Forum is masked by the **Tabularium** substructure wall, about 25 m tall, rising from about 14 m. | B |
| Capitoline: **Asylum** saddle (Piazza del Campidoglio) | — | **~37** | — | saddle | "Inter duos lucos"; the Clivus Capitolinus arrives here. Platner gives about 30 m above the Tiber for the modern piazza. | C |
| Whole Capitoline | 49 | — | — | — | About **460 m long (NNE–SSW) x 180 m wide** (Platner). | B |
| **Palatine** | **51** (51.20 per Platner, the Palatium summit near the Domus Flavia/Augustana) | 44–50; **Germalus** (W) 43–45 | 11–13 (Velabrum, Circus); 18–20 (Colosseum side); about 20 (Forum/Via Nova) | Steep, 30–50 % (DEM), with cliffs | **SW corner** over the Velabrum and Circus (Lupercal cave, Scalae Caci): cliff of about 30 m. **S face**: the Domus Augustana's curved façade and terraces overlook the Circus. **N face**: Domus Tiberiana substructures over the Clivus Victoriae and Forum. **NE**: a gentle link to the **Velia** saddle at the Arch of Titus. About 2 km circuit. | B |
| **Velia** (saddle between Palatine and Oppian) | — | **28–31** | — | gentle saddle | Summa Sacra Via at the Arch of Titus is about 28 m. In 113 it is terraced by Nero's Domus Aurea vestibule, and the **Colossus** (Nero/Sol) stands there. Hadrian moves it and builds Venus and Roma only after 121. The Velia was later cut away (1932) for Via dei Fori Imperiali, so modern ground is misleading. | C |
| **Aventine** (Aventinus Maior) | **46–47** (near S. Alessio) | 40–46 | 8–10 (river, Emporium); 11–13 (Circus) | Steep. **River (W/NW) side: cliffs** | Cliffs over the Tiber below S. Sabina and Clivo di Rocca Savella, 30–35 m and near-vertical. The NE slope down to the Circus is about 30 %. Aldrete puts the Aventine summits under less than 2 m of later fill, so modern levels are nearly ancient. | B (summit is modern 46.6 m, Wikidata) |
| **Lesser Aventine** (S. Saba, S. Balbina) | **40–41** | 33–40 | about 25–30 in the dividing valley (later Viale Aventino); 16 at Porta Capena | moderate, 15–30 % | The valley between the two Aventines carried the road to the Porta Raudusculana. | C |
| **Caelian** | **45** at the W end (Platner: Villa Mattei); rising to **50–54** in the E toward the Lateran and S. Croce | 42–50 | 16–19 (Via di S. Gregorio valley, Colosseum); 28–32 (Via Labicana valley) | moderate, 10–25 %; steeper NW at the Claudianum | A ridge about **2 km long x 400–500 m wide**, W–E. The **Temple of Divus Claudius** platform (about 180 x 200 m, terraced substructures, Nero's nymphaeum façade on the E) sits on the NW end. The Arcus Neroniani run along the crest. | B |
| **Esquiline: Oppius** (S tongue) | **50–52** | 45–50 | 19–21 (Colosseum valley, Subura) | 15–25 % | The **Baths of Trajan** (109) sit on a platform built over Nero's Domus Aurea wing. The **Carinae** is the W slope toward the Velia and Forum. The **Fagutal** is the beech grove at the W tip. | C |
| **Esquiline: Cispius** (N tongue) | **56–57** (S. Maria Maggiore) | 48–56 | 25–30 (upper Subura / Vicus Patricius) | 15–25 % | The Clivus Suburanus climbs the saddle between Oppius and Cispius to the Porta Esquilina. | B (summit 58.3 m modern, Wikidata) |
| **Esquiline plateau** (E of the agger) | 55–58 | 50–56 | — | nearly flat | The Servian **agger** (rampart) crests at about 60 m. Beyond it are the **Horti Maecenatis**, Horti Lamiani and the Spes Vetus aqueduct node. The pauper necropolis was buried under Maecenas's gardens long before 113. | C |
| **Viminal** | **56–57** (near Termini) | 45–56 | 25 (Vicus Longus); 28 (Vicus Patricius) | 25–35 % on its long flanks | A narrow tongue running NE→SW between the Vicus Longus and Vicus Patricius. The SW tip is about 45 m (S. Lorenzo in Panisperna). | C (57 m modern) |
| **Quirinal** | **55–60** (Quattro Fontane to Porta Collina) | 45–58; Piazza del Quirinale about 50 | 13–16 (Campus Martius along Via Lata); 25 (Vicus Longus) | **W face very steep** (30–40 m drop, DEM up to 100 %) | The W face over the Campus Martius (the Trevi area) is very steep. The SW tip was **cut vertically behind Trajan's Markets** in 107–112; Trajan's Column inscription says the column marks the height of the hill removed. The Alta Semita runs along the crest. | C |
| **Pincian** (Collis Hortulorum) | **~58** (S part of the later Villa Borghese) | 50–58; the W rim is about 50 (Trinità dei Monti) | 12–14 (Campus Martius, Piazza del Popolo) | **W escarpment** of about 35 m, terraced | Outside the Servian Wall. Garden villas: **Horti Luculliani** on the W/SW brow, Horti Aciliorum, Horti Pompeiani. The **Horti Sallustiani** lie in the valley (about 38 m) between the Pincian and the Quirinal. | C |
| **Janiculum** | **80–85** (crest; Porta S. Pancrazio about 82, Piazzale Garibaldi about 80) | 60–85 | 15–20 at the foot (Trastevere) | **E escarpment** of about 60 m over 300–400 m, locally 40–90 % | A N–S ridge on the right bank. It is the E edge of the Monteverde plateau, which is higher (80–90) further W. The **Aqua Traiana** (109) ends on the crest and drives **water-mills** down the slope. | B (crest 82 m modern, Wikidata) |
| **Vatican hill** (Mons Vaticanus) | **~65–75** | 45–70 | 20–22 at the Circus of Gaius & Nero; 10–13 in the Ager Vaticanus plain | moderate, with steep stretches | Imperial gardens: Horti Agrippinae, Horti Domitiae. The **Circus of Gaius and Nero** (Vatican obelisk on its spina) lies at the foot. Necropoleis line the Via Cornelia and Via Triumphalis. | C (75 m modern summit, OSM) |
| Monte Mario (Clivus Cinnae) | 139 | — | — | steep | About 4 km NW of the origin, beyond the Vatican. Use it only as a skyline element. | A (modern) |
| **Monte Testaccio** | in 113 perhaps **15–25 m above the plain** (D) | — | plain 8.5–10 | spoil heap | The amphora dump behind the Horrea Galbana started under Augustus. Most of its volume is Severan (late 2nd–3rd c.), so in 113 it is a **growing mound, much smaller** than today's (about 35 m high, 240 x 390 m). | D |

Sources: Platner & Ashby, *Topographical Dictionary* (1929), entries Capitolium, Arx, Palatinus Mons and Caelius Mons. Aldrete, *Floods of the Tiber in Ancient Rome* (2007), ch. 1 fig. 1.5 (fill depth) and fig. 1.6 (Augustan topography, 5 m contours). Wikidata P2044 (modern summits). Coarelli, *Rome and Environs* (2007).

### 2.2 Hill outlines

Polygons are in REAL meters `[x, z]`, clockwise or counter-clockwise, without a repeated closing point. They were produced by contouring the reconstructed AD 113 DEM (section 4), then closing and simplifying to 16 points or fewer (about ±25–40 m).

- **"Plateau"** is the contour that marks the top edge of the slope. Use it as the hill `outline` in `heightmap.ts`.
- **"Foot"** is a lower contour that marks the base of the slope.
- **Straight edges marked † are artificial cuts.** The plateau continues into the neighbouring hill or past the edge of the study area there. Do not model a slope along them.

**Capitoline**: Plateau = Capitolium (S summit) only; the Arx polygon is below. The foot polygon wraps both summits and the Asylum
```
plateau 40 m (1.4 ha): [[-250, 120], [-240, 135], [-220, 140], [-180, 135], [-160, 125], [-125, 90], [-115, 50], [-120, 30], [-145, 35], [-170, 15], [-190, 10], [-240, 25], [-250, 45]]
arx     40 m (0.9 ha): [[-35, -180], [-60, -215], [-90, -220], [-120, -205], [-130, -195], [-140, -160], [-130, -140], [-90, -95], [-80, -90], [-60, -105], [-45, -120]]
foot    20 m (13.1 ha): [[-235, -190], [-330, 65], [-310, 145], [-175, 210], [-150, 240], [-120, 215], [-75, 230], [-25, 95], [-40, -10], [25, -100], [15, -170], [40, -295], [-30, -285], [-120, -300], [-160, -285]]
```
**Palatine**: Plateau includes Germalus (W) and Palatium (E)
```
plateau 40 m (9.7 ha): [[55, 270], [30, 350], [70, 460], [110, 490], [200, 505], [280, 540], [310, 540], [380, 490], [390, 420], [430, 335], [425, 280], [410, 270], [340, 260], [300, 240], [170, 210], [90, 240]]
foot    20 m (19.4 ha): [[-10, 210], [10, 240], [-20, 340], [-5, 400], [-10, 470], [65, 550], [190, 645], [250, 670], [300, 675], [340, 665], [445, 510], [420, 230], [330, 150], [235, 145], [85, 175], [0, 140]]
```
**Aventine**
```
plateau 36 m (19.3 ha): [[-550, 1180], [-470, 1235], [-285, 1140], [-265, 1200], [-200, 1265], [-170, 1270], [5, 1080], [30, 1010], [25, 960], [-10, 910], [-170, 845], [-235, 770], [-290, 750], [-390, 835], [-560, 1030]]
foot    15 m (46.6 ha): [[-655, 980], [-670, 1040], [-660, 1080], [-580, 1250], [-465, 1450], [-150, 1450], [80, 1250], [80, 800], [75, 775], [-10, 730], [-70, 715], [-170, 665], [-270, 655], [-340, 665], [-400, 690], [-520, 820]]
```
**Lesser Aventine**: † S and E edges of the foot polygon (study-area cut at z=1900, x=700)
```
plateau 33 m (34.7 ha): [[-90, 1570], [-70, 1645], [40, 1755], [475, 1900], [510, 1890], [605, 1660], [560, 1490], [485, 1380], [470, 1260], [380, 1175], [250, 1185], [145, 1250], [75, 1255], [-60, 1375], [-15, 1420]]
foot    20 m (57.9 ha): [[-150, 1450], [-115, 1760], [-80, 1815], [-30, 1900], [700, 1900], [700, 1150], [0, 1150], [80, 1250]]
```
**Caelian**: † E end (x=2700) and the N edge between [2000,450] and [2700,350] continue toward Porta Maggiore
```
plateau 40 m (118.9 ha): [[640, 475], [630, 860], [910, 1010], [1455, 735], [1835, 1200], [2165, 1200], [2340, 1075], [2700, 1015], [2700, 350], [2000, 450], [1580, 365], [1485, 510], [1160, 460], [905, 555], [730, 435]]
foot    25 m (169.0 ha): [[490, 720], [485, 840], [570, 940], [930, 1120], [1210, 1100], [1290, 1130], [1300, 1200], [2700, 1200], [2700, 350], [2000, 450], [1400, 330], [965, 330], [925, 365], [740, 350], [620, 375], [565, 410]]
```
**Pincian**: † N edge (z=-2700) and the E edge x=1100; the plateau continues N into the Villa Borghese area
```
plateau 45 m (154.7 ha): [[-650, -2700], [-630, -2420], [-320, -2300], [-465, -2110], [-460, -1950], [20, -1330], [325, -1380], [560, -1985], [790, -1925], [890, -1690], [1100, -1900], [1100, -2700], [180, -2700], [15, -2500]]
foot    25 m (215.1 ha): [[-810, -2255], [-635, -2220], [-590, -2180], [-525, -1780], [-400, -1565], [-320, -1490], [-180, -1420], [-105, -1280], [100, -1180], [350, -1270], [700, -1500], [1100, -1900], [1100, -2700], [-705, -2700], [-715, -2470]]
```
**Quirinal**: † NE edge [1000,-1110]–[1200,-1350]–[1350,-1700]–[1100,-1900] where it joins the Viminal, Esquiline plateau and Pincian
```
plateau 45 m (59.0 ha): [[95, -910], [175, -800], [115, -650], [200, -430], [620, -805], [690, -965], [805, -1025], [800, -930], [1000, -1110], [1200, -1350], [1350, -1700], [1100, -1900], [890, -1690], [840, -1400], [440, -1095], [120, -995]]
foot    25 m (87.9 ha): [[-105, -1280], [25, -990], [-80, -790], [-80, -715], [65, -420], [190, -420], [1000, -1110], [1200, -1350], [1350, -1700], [1100, -1900], [700, -1500], [350, -1270], [100, -1180]]
```
**Viminal**: † NE edge [950,-700]–[1450,-900]–[1450,-1200]–[1200,-1350] where it merges into the Esquiline plateau (agger)
```
plateau 45 m (42.7 ha): [[200, -430], [320, -360], [395, -380], [420, -510], [465, -590], [530, -480], [715, -435], [950, -700], [1450, -900], [1450, -1200], [1200, -1350], [790, -915], [690, -850], [655, -795], [620, -805], [560, -760]]
foot    30 m (48.3 ha): [[190, -420], [440, -265], [490, -330], [525, -345], [605, -315], [640, -330], [780, -520], [950, -700], [1150, -760], [1450, -900], [1450, -1200], [1200, -1350], [1000, -1110], [800, -930], [560, -760], [330, -560]]
```
**Esquiline: Cispius**: † E edges at x=1500 and z=-330
```
plateau 48 m (25.0 ha): [[915, -350], [920, -340], [940, -330], [1120, -310], [1145, -300], [1300, -330], [1500, -330], [1500, -900], [1450, -900], [1150, -760], [1025, -720], [1045, -670], [1045, -640], [945, -440]]
foot    30 m (34.3 ha): [[640, -330], [715, -310], [735, -320], [745, -320], [755, -310], [760, -300], [900, -260], [1100, -290], [1300, -330], [1500, -330], [1500, -900], [1450, -900], [1150, -760], [950, -700], [780, -520]]
```
**Esquiline: Oppius**: † E edge x=1300
```
plateau 45 m (20.1 ha): [[660, -120], [675, -20], [740, 35], [790, 30], [890, 70], [900, 25], [925, 15], [1000, 80], [1090, 80], [1085, 140], [1300, 245], [1300, -330], [1110, -290], [980, -180], [830, -150], [720, -155]]
foot    25 m (41.3 ha): [[450, -220], [510, -260], [570, -265], [650, -215], [460, -10], [450, 80], [630, 165], [730, 170], [915, 270], [1100, 330], [1300, 250], [1300, -330], [900, -260], [640, -330], [450, -260]]
```
**Esquiline: main plateau (east of agger)**: † almost all edges except the W rim; the plateau continues E to Porta Maggiore
```
plateau 50 m (123.7 ha): [[1300, -130], [1470, -155], [1530, 20], [1595, 70], [1995, 10], [2170, 250], [2515, 250], [2345, -285], [2400, -700], [2485, -950], [2395, -1085], [2375, -1200], [1450, -1200], [1500, -900], [1500, -330], [1300, -330]]
foot    35 m (171.8 ha): [[1300, 250], [2600, 250], [2600, -1200], [1450, -1200], [1500, -900], [1500, -330], [1300, -330]]
```
**Janiculum**: † W edge x=-2700 (the Monteverde plateau continues W)
```
plateau 60 m (157.2 ha): [[-2700, -30], [-2675, 1360], [-2440, 1415], [-2380, 1760], [-2265, 1705], [-2165, 1325], [-1670, 1400], [-1610, 1135], [-1710, 740], [-1535, 450], [-2055, -210], [-2130, -210], [-2135, -35], [-2230, 10], [-2500, -280], [-2625, -230]]
foot    20 m (346.8 ha): [[-2700, -900], [-2700, 1900], [-1900, 1900], [-1560, 1650], [-1380, 1315], [-1340, 925], [-1455, 595], [-1300, 335], [-1430, 125], [-1630, 55], [-1670, -25], [-1610, -250], [-1395, -590], [-1300, -635], [-1300, -850], [-1335, -900]]
```
**Vatican hill**: † W edge x=-3700 and N/S edges (z=-2000/-500)
```
plateau 45 m (101.2 ha): [[-3700, -910], [-3700, -500], [-3045, -500], [-2850, -1180], [-2990, -1445], [-3080, -1535], [-3155, -1805], [-3135, -1870], [-2995, -2000], [-3700, -2000], [-3700, -1125], [-3530, -1045], [-3490, -975], [-3510, -910], [-3585, -855], [-3655, -860]]
foot    25 m (164.3 ha): [[-3700, -2000], [-3700, -500], [-2250, -500], [-2250, -1040], [-2350, -955], [-2420, -915], [-2515, -905], [-2575, -945], [-2600, -1020], [-2595, -1240], [-2630, -1360], [-2735, -1510], [-2920, -1685], [-2960, -1760], [-2965, -1815], [-2920, -2000]]
```
**Velia saddle** (crest line about 28–31 m; model it as a low ridge between the Palatine NE corner and the Oppian W slope):
```
crest polyline: [[300, 215], [348, 205], [440, 170], [520, 110], [600, 30]]
outline (plateau 28 m, summit 30): [[300, 200], [350, 160], [470, 120], [560, 60], [610, 110], [530, 200], [420, 245], [330, 250]]
```

### 2.3 Cliff segments

Model these as near-vertical faces, or as `cliffs` segments in `heightmap.ts` (C).

| Cliff | a | b | Drop (m) | Notes |
|---|---|---|---|---|
| Tarpeian Rock, S/SW face of the Capitolium | [-250, 120] | [-170, 140] | ~30 (46→15) | Over the Vicus Iugarius and Forum Holitorium. Executions happen here (gameplay hook). |
| Capitolium W face | [-250, 45] | [-250, 120] | ~32 | Over the Theatre of Marcellus / Circus Flaminius side |
| Capitoline E face (Tabularium) | [-115, 50] | [-60, -105] | ~30 | Tabularium substructure wall from the Forum (about 14 m) |
| Arx N face | [-140, -160] | [-60, -215] | ~30 | Over the Clivus Argentarius / Via Lata head |
| Palatine SW corner (Lupercal, Scalae Caci) | [30, 350] | [70, 460] | ~30 | Over the Velabrum and Circus carceres |
| Palatine S face (Domus Augustana) | [110, 490] | [310, 540] | ~30–38 | Palace façade over the Circus valley |
| Palatine N face (Domus Tiberiana) | [55, 270] | [170, 210] | ~25 | Substructures over the Clivus Victoriae and Forum |
| Aventine river cliff | [-560, 1030] | [-390, 835] | ~33 | Over the Via Ostiensis and the river |
| Aventine NW cliff (S. Sabina) | [-390, 835] | [-290, 750] | ~32 | Over the Porta Trigemina and Forum Boarium |
| Quirinal W face | [95, -910] | [115, -650] | ~35 | Over the Campus Martius (Trevi) |
| Trajan's cut, Quirinal SW tip | [115, -650] | [200, -430] | ~30 | Vertical cut retained by Trajan's Markets (terraces 17→45 m) |
| Pincian W escarpment | [-460, -1950] | [20, -1330] | ~35 | Terraced garden walls (Horti Luculliani) |
| Janiculum E escarpment | [-2055, -210] | [-1535, 450] | ~50–60 | Wooded; the Via Aurelia climbs it in hairpins |

## 3. Low ground (ancient ground levels, AD 113)

Ground levels rose all through antiquity. Aldrete (2007, citing Ammerman) gives the **Forum paving sequence**:

| Phase | Level |
|---|---|
| Gravel | about 9 m |
| First stone paving | 10.6–10.9 m |
| 179 BC | 11.8–11.9 m |
| Sullan | 12.6 m |
| **Augustan (still in use in 113)** | **12.6–14 m** |

In the northern Campus Martius, the Hadrianic level is **2.35–2.95 m above the Vespasianic** (pomerium cippi and the Ara Pacis), and Domitian raised the Horologium area by about 1.6 m. **Trajanic Rome therefore sits at the Domitianic (pre-Hadrianic) levels.** Today's low-lying districts are at 18–20 m. Natural pre-urban levels were often under 10 m (Velabrum).

| Area | AD 113 ground (m ASL) | Polygon `[x, z]` | Notes | Conf. |
|---|---|---|---|---|
| **Forum Romanum** basin | **13** (12.6–14), rising E to about 20 at the foot of the Velia | [[-30,-40],[60,-75],[150,-40],[250,40],[330,150],[250,180],[150,150],[60,150],[0,90],[-40,40]] | Travertine paving. The Lacus Curtius is a paved depression. The Cloaca Maxima runs under it. | B |
| **Velabrum** | **12** (11–13) | [[-130,230],[-20,230],[40,330],[-30,470],[-150,470],[-200,350]] | Once marshy; raised by fill. Horrea Agrippiana stand on its N edge [56, 193]. | B |
| **Forum Boarium** | **9.5** (8.5 at the riverside to 11 inland) | [[-430,200],[-260,220],[-150,380],[-170,520],[-330,560],[-420,430],[-440,300]] | Floods at a river level of 10 m. River quays of the Portus Tiberinus. | B |
| Forum Holitorium | **11** (10–12) | [[-470,60],[-300,60],[-250,180],[-430,200]] | Vegetable market. Temples of Janus, Spes and Juno Sospita (S. Nicola in Carcere). | C |
| **Vallis Murcia** (Circus Maximus valley) | arena **11 (W) → 13.5 (E)**; Porta Capena **16** | [[-220,688],[-130,532],[410,847],[320,1003]] (valley floor strip) | The valley rises ESE toward Porta Capena and the Via Appia. Earlier a stream (the later sewer) ran down its axis. | C |
| **Colosseum valley** | **19** (18–20) | [[440,260],[450,170],[560,120],[760,150],[850,250],[800,380],[600,420],[480,380]] | Site of Nero's stagnum. Rises ESE along the Via Labicana/Tusculana valley to 28–32 at about [1300, 350]. | C |
| Valley between Palatine and Caelian (Via di S. Gregorio line) | 16 (S) – 19 (N) | strip along [[414,809],[490,459],[501,432]], about 120 m wide | Triumphal route from Porta Capena to the Colosseum. | C |
| **Subura** | **20–22** in the SW, rising to **28–32** at the heads of the Vicus Longus and Vicus Patricius valleys | [[200,-200],[330,-130],[520,-200],[700,-260],[760,-380],[900,-620],[820,-660],[640,-450],[520,-560],[380,-480],[250,-360]] | Dense, damp valley floor between the Quirinal, Viminal, Cispius and Oppius. | C |
| **Argiletum** / Forum Transitorium | **14–16** | [[70,-60],[100,-30],[180,-80],[260,-130],[220,-180],[140,-120]] | The lower Argiletum is enclosed by Nerva's Forum (97). | C |
| Imperial fora | Caesar about 15.5; Augustus **17**; Nerva about 15; Templum Pacis about 16; **Trajan 17–18** | see the anchors | Forum of Augustus at 17 m (Aldrete). The others are inferred. | B/C |
| **Campus Martius**, general | **11–14**; Via Lata strip 13.5–15 | Region IX + VII polygons, section 10 | Flood plain, 3–8 m above the river. Swept by any flood above 10 m. | B |
| Campus Martius, central depression (remnant of the Palus Caprae) | **10.5–12** (Augustan: under 10) | [[-1000,-600],[-900,-800],[-550,-800],[-450,-500],[-600,-280],[-900,-350]] | Pantheon, Baths of Agrippa, Stagnum Agrippae, Stadium. Floods first. | C |
| Tarentum (NW river bend) | **10** (9.5–10.5) | circle centre about [-1300, -650], r about 200 | Underground altar of Dis Pater and Proserpina (Ludi Saeculares, last held by Domitian in 88). | C/D (location) |
| Northern Campus (Mausoleum, Horologium, Ara Pacis) | **10.5–11.5** | about [-900..-350, -1700..-1000] | **Pre-Hadrianic** level. Hadrian later raised it by about 2.5–3 m. | B |
| **Transtiberim** (Trastevere) | **10–11** at the riverside, **13** in the centre (S. Maria), **15–20** at the Janiculum foot | [[-1042,108],[-531,310],[-394,451],[-493,725],[-652,919],[-1000,1250],[-1300,1100],[-1450,600],[-1420,300],[-1450,0],[-1560,-430]] | Peninsula enclosed by the river bend. Slightly higher bank than the Campus. | C |
| **Emporium / Testaccio plain** | **9** (8.5–10); quay tops 11–12 | [[-652,919],[-1053,1295],[-1192,1556],[-1166,1852],[-1030,2111],[-578,1987],[-300,1760],[-450,1500],[-600,1150]] | Porticus Aemilia, the horrea, and the growing Monte Testaccio. | B |
| Ager Vaticanus / Campus Vaticanus (later Prati) | **11–12**; Circus of Gaius & Nero 20–22 | about [-2600..-1450, -2300..-900] | Gardens, the Naumachia Traiani (109), tombs. | C |

### 3.1 Campus Martius water features

- **Petronia Amnis** (Coarelli; Aldrete 2007 p. 173): a stream from springs at the foot of the Quirinal. In 113 it is vaulted over and serves as a drain. It ran SW across the Campus and entered the Tiber **just N of the Pons Fabricius**. Approximate bed (C/D): `[[-150,-900],[-400,-760],[-600,-620],[-680,-400],[-640,-150],[-540,110]]`. Bed falls about 12 → 6 m.
- **Palus Caprae** (Goat Marsh), where legend says Romulus vanished: the lowest part of the Campus, centred near the Pantheon, about **[-700, -600], r ≈ 200 m**. It was drained and built over by Agrippa, so in 113 only a slight depression remains (C).
- **Stagnum Agrippae**: an artificial pool W of the Baths of Agrippa, around S. Andrea della Valle and Corso Vittorio. Centre about **[-800, -430]**, roughly 200 x 120 m. Water at about 11 m, fed by the Aqua Virgo (C/D).
- **Euripus (Thermarum Agrippae)**: Agrippa's canal from the Stagnum W to the Tiber, about 800 m long and about 5–9 m wide (D). Line: `[[-800,-430],[-1000,-500],[-1250,-640],[-1450,-760],[-1600,-880]]` (C/D). Seneca (*Ep.* 83.5) took a New Year's Day plunge into it.
- **Naumachia Augusti** (2 BC): basin about 536 x 357 m in S Trastevere, near S. Cosimato. Centre about [-1150, 800] ±200 (D). It may be partly disused by 113.
- **Naumachia Traiani** (inaugurated Nov. AD 109, *Fasti Ostienses*): in the Ager Vaticanus NW of the later Hadrian's Mausoleum, near the church of S. Pellegrino in Naumachia. About [-2200, -1400] ±300 (D).

## 4. Elevation model (AD 113 DEM)

### 4.1 How it was built

1. **Core** (x −1900…1760, z −1660…1880): Aldrete 2007, **fig. 1.6**, "Topographic map of Rome at the time of Augustus" (5 m contours). The figure was extracted from the book PDF on ostia-antica.org and **georeferenced by matching its Tiber banks to the OSM river polygon** with a similarity transform: 6.12 m/px, rotation −1.7°, **median residual 4.3 m**, 90th percentile 10 m. Contour bands were labelled by solving a least-squares graph over the regions between lines, anchored to the printed labels.
2. **Outside the core**: the **TINITALY 1.1 10 m DTM** (INGV; bare earth, but coarse in the centre), minus an estimated fill: 8 m in the lowlands, tapering to 0 above 45 m. Copernicus GLO-30 (a DSM, building-contaminated) was used only for cross-checks.
3. **Correction**: a thin-plate-spline residual surface forces the model through the **~100 curated control points** in 4.2. The fit at those points is better than 0.1 m.
4. The modern **Monte Testaccio** mound is flattened to the 9.5 m plain. Add the AD 113 heap separately (section 2.1).
5. **The Tiber is NOT carved.** River cells read about 7 m, the clamp value. Carve the channel from section 5.

**Expected error:** about ±3 m vertical on valley floors and plateaus, worse on steep slopes. Positions are good to about ±30 m. It is a smoothed surface: **add cliffs (2.3) and monument pads on top of it.**

### 4.2 Curated control points (authoritative values; m ASL, AD 113)
| Point | [x, z] | m ASL | Conf. |
|---|---|---|---|
| Forum Romanum centre (Miliarium) | [0, 0] | 13 | B |
| Forum, Regia/Vesta | [150, 98] | 13.5 | B |
| Comitium/Curia | [84, -42] | 12.8 | B |
| Summa Sacra Via (Arch of Titus) | [348, 211] | 28 | C |
| Velia ridge (Colossus/vestibule) | [440, 170] | 30 | C |
| Colosseum surround | [660, 256] | 19 | C |
| Meta Sudans | [540, 290] | 19.5 | C |
| Forum of Augustus | [197, -183] | 17 | B |
| Forum of Caesar | [66, -126] | 15.5 | C |
| Forum of Nerva | [174, -73] | 15 | C |
| Templum Pacis | [241, -12] | 16 | C |
| Forum of Trajan | [69, -286] | 17.5 | C |
| Trajan Markets (mid-terrace) | [150, -350] | 30 | C |
| Subura low | [380, -170] | 21 | C |
| Subura upper | [600, -300] | 27 | C |
| Argiletum lower end | [120, -60] | 14 | C |
| Velabrum | [-60, 300] | 12 | B |
| Forum Boarium (Portunus) | [-288, 368] | 9.5 | B |
| Ara Maxima | [-150, 480] | 11 | C |
| Circus Maximus, carceres | [-150, 620] | 11 | C |
| Circus Maximus, centre | [95, 765] | 12 | C |
| Circus Maximus, curved end | [330, 900] | 13.5 | C |
| Porta Capena | [507, 955] | 16 | C |
| Via di S. Gregorio valley mid | [460, 600] | 16 | C |
| Pantheon (Agrippan level) | [-626, -661] | 11.5 | C |
| Baths of Agrippa | [-612, -482] | 11.5 | C |
| Largo Argentina (Domitianic paving) | [-623, -312] | 13 | B |
| Theatre of Pompey | [-850, -330] | 12 | C |
| Stadium of Domitian | [-935, -700] | 11.5 | C |
| Mausoleum of Augustus ground | [-659, -1486] | 11 | C |
| Ara Pacis original ground | [-430, -1192] | 10.5 | C |
| Via Lata at Piazza Colonna | [-380, -920] | 13.5 | C |
| Via Lata at Piazza Venezia | [-160, -390] | 15 | C |
| Circus Flaminius | [-650, -150] | 11 | C |
| Theatre of Marcellus | [-400, 72] | 12 | C |
| Tarentum | [-1250, -500] | 10 | C |
| Ager Vaticanus riverside | [-1493, -1157] | 11 | C |
| Piazza del Popolo area | [-663, -2010] | 12 | C |
| North Campus by river bend | [-950, -1700] | 10 | C |
| Trastevere S. Maria | [-1166, 333] | 13 | C |
| Trastevere S. Francesco a Ripa | [-917, 831] | 12 | C |
| Trastevere riverside | [-800, 500] | 10.5 | C |
| Porta Settimiana | [-1390, 37] | 13 | C |
| Janiculum foot | [-1420, 520] | 18 | C |
| Emporium | [-650, 1350] | 9 | B |
| Pyramid of Cestius | [-292, 1783] | 11 | C |
| Testaccio plain | [-900, 1700] | 9 | C |
| Circus of Gaius & Nero (Vatican) | [-2541, -1000] | 22 | C |
| Vatican hill | [-3000, -1150] | 65 | C |
| Prati plain | [-1700, -2200] | 12 | C |
| Pons Mulvius banks | [-1440, -4745] | 14 | C |
| Arx | [-75, -160] | 48 | B |
| Capitolium | [-200, 66] | 46 | B |
| Asylum | [-117, -72] | 37 | C |
| Tarpeian cliff top | [-172, 118] | 44 | C |
| Palatine summit | [260, 420] | 50.5 | B |
| Domus Flavia | [184, 416] | 48 | C |
| Domus Tiberiana platform | [147, 255] | 46 | C |
| Germalus (Magna Mater) | [60, 330] | 44 | C |
| Domus Augustana lower court | [223, 520] | 40 | C |
| Palatine NE (Vigna Barberini) | [330, 300] | 47 | C |
| Aventine S. Alessio (summit) | [-425, 1012] | 46 | B |
| Aventine S. Sabina | [-383, 893] | 44 | C |
| Aventine S. Prisca | [-34, 1051] | 40 | C |
| Aventine centre | [-250, 1050] | 44 | C |
| Clivus Publicius mid | [-120, 800] | 28 | C |
| Lesser Aventine S. Saba | [95, 1545] | 40 | C |
| S. Balbina | [438, 1331] | 38 | C |
| Temple of Claudius platform | [720, 560] | 47 | C |
| Caelian SS. Giovanni e Paolo | [640, 690] | 45 | B |
| Caelian S. Stefano Rotondo | [1022, 874] | 48 | C |
| Caelian SS. Quattro | [1136, 479] | 42 | C |
| Lateran | [1757, 753] | 47 | C |
| Caelian east (Villa Wolkonsky) | [2250, 640] | 52 | C |
| S. Croce (Sessorium area) | [2608, 481] | 50 | C |
| Porta Maggiore ground | [2552, 126] | 47 | C |
| Oppian S. Pietro in Vincoli | [727, -141] | 47 | C |
| Oppian Baths of Trajan platform | [960, 10] | 50 | C |
| Oppian NE (Via delle Sette Sale) | [1121, -170] | 53 | C |
| Cispian S. Maria Maggiore | [1166, -556] | 56 | B |
| Porta Esquilina | [1404, -347] | 55 | C |
| Esquiline Horti Maecenatis | [1700, -300] | 56 | C |
| Esquiline east | [2200, -200] | 54 | C |
| Viminal summit | [1000, -900] | 56 | C |
| Viminal SW tip | [560, -480] | 45 | C |
| Quirinal, Piazza del Quirinale | [175, -746] | 50 | C |
| Quirinal, Quattro Fontane | [527, -1038] | 55 | C |
| Porta Collina | [1188, -1632] | 60 | C |
| Quirinal SW tip (Magnanapoli) | [199, -427] | 45 | C |
| Pincian, Trinita dei Monti | [-55, -1514] | 50 | C |
| Pincian, Villa Medici | [-112, -1734] | 55 | C |
| Pincian, Pincio terrace | [-430, -1950] | 50 | C |
| Pincian summit | [150, -2150] | 58 | C |
| Horti Sallustiani valley | [700, -1700] | 38 | C |
| Castra Praetoria | [1862, -1548] | 58 | C |
| Porta Tiburtina | [2170, -544] | 52 | C |
| Janiculum summit (Piazzale Garibaldi) | [-1925, 120] | 80 | B |
| Janiculum S. Pietro in Montorio | [-1489, 443] | 58 | C |
| Janiculum Porta S. Pancrazio | [-1885, 465] | 82 | C |
| Janiculum north (S. Onofrio) | [-1700, -700] | 45 | C |
| Forum of Trajan, N (Basilica Ulpia/Column court) | [0, -420] | 16 | C |
| Basilica Ulpia | [20, -330] | 17.5 | C |
| Via Lata start (Capitoline N foot) | [-100, -330] | 15.5 | C |
| Circus arena by Palatine | [200, 700] | 12.5 | C |
| Capitoline W foot | [-310, -110] | 14 | C |
| Monte Mario summit | [-2672, -3519] | 139 | A |

### 4.3 Core grid: 100 m spacing, AD 113 ground (m ASL)

Columns run x = −1900, −1800, …, +1800 (38 values) and rows run z = −1700 (north) … +1900 (south) (37 rows). The row label is z. Interpolate bilinearly.
```
-1700: 11 10  9  9  8  8  9  9 10 10 10 11 14 19 25 30 42 49 54 59 59 56 52 47 41 39 38 41 46 51 56 60 62 63 63 63 61 59
-1600: 12 11 10  9  8  8  8  9  9 10  9 10 12 17 22 26 31 40 50 54 54 52 48 44 41 39 39 41 45 51 56 60 62 62 62 62 61 59
-1500: 15 13 11 10  9  8  8  9  9 10  9 10 10 15 20 23 26 29 45 53 52 50 47 43 38 35 37 42 46 51 56 60 61 62 60 60 60 59
-1400: 18 15 13 11 10  9  9  9 10 10  7  9 13 15 18 20 23 24 37 47 49 48 45 42 33 33 43 44 47 51 57 60 61 58 59 59 59 58
-1300: 21 18 15 12 10  9  9  9 10 10  8  7 13 14 16 18 20 21 31 37 43 43 41 34 33 39 46 47 48 51 53 55 57 58 58 58 58 57
-1200: 26 23 19 14 12 11 10 10 10  7  8  7 12 13 10 13 17 18 19 30 39 38 37 39 44 49 49 49 50 52 54 55 56 57 58 58 57 56
-1100: 32 29 24 14 10  8  8  9  9  8  7  8 13 13 14 10 16 17 17 30 29 30 44 44 49 52 52 52 52 53 54 55 56 57 58 57 56 55
-1000: 39 36 27 22 18 15 11  9  9  8  8  8 13 13 14 14 14 15 16 18 32 61 59 59 57 54 48 43 54 55 55 56 56 57 57 57 56 54
 -900: 46 42 35 27 22 18 19 16 15 14 10 10 14 14 14 13 14 15 15 29 45 57 57 61 54 47 44 45 54 56 56 56 56 57 57 56 55 54
 -800: 51 47 41 32 32 26 21 18 16 11 11 16 11 10 14 14 14 14 16 29 35 53 57 58 51 45 49 52 51 55 56 56 56 56 56 56 55 54
 -700: 53 50 45 35 33 26 21 17 15 11 12 12 12 11 10 14 14 13 15 28 40 57 59 51 47 48 55 56 49 45 50 56 56 56 56 56 56 55
 -600: 52 52 43 34 27 20 16 16 15 11 12 12 12 11 11 15 14 13 12 25 40 55 56 51 48 53 56 54 43 46 55 56 56 56 56 56 56 55
 -500: 48 48 40 31 24 18 12  9 14 12 11 12 12 11 11 15 15 13 11 22 37 52 50 47 42 48 50 43 41 51 56 56 55 55 56 56 56 55
 -400: 47 44 35 26 22 15 10 10 13 15 11 13 13 12 12 15 15 15 12 10 30 43 47 46 34 40 42 35 45 55 56 55 55 55 56 56 56 55
 -300: 54 45 31 21 18 14  9 13 13 14 16 12 13 12 10 13 14 17 21 20 17 27 40 40 28 27 30 34 44 44 46 55 55 55 55 56 56 55
 -200: 55 34 24 18 15 12  9  7 13 14 15 11 10  9  8  9 10 23 44 28 13 17 24 25 22 21 30 37 39 44 47 54 59 55 51 55 55 55
 -100: 57 30 22 19 16 11  8  7  8 13 14 13 12  7  9  7 16 27 38 25 16 16 18 21 24 30 52 50 47 51 53 54 48 49 50 51 54 54
    0: 62 35 21 18 16 13 10 10  9  8 13 12  8  7  9 10 22 39 37 13 11 15 18 21 30 33 46 49 45 50 51 46 48 49 47 51 51 51
  100: 73 46 32 29 23 15 14 14 11 11  8  7  7  7 10 13 26 46 33 19 11 13 19 23 29 33 32 39 42 44 45 46 48 49 41 48 49 48
  200: 82 61 44 36 32 23 16 15 14 10 10  9  8  8  9  8 11 20 26 22 27 35 31 29 25 23 21 26 32 40 42 46 49 50 42 45 48 45
  300: 87 81 62 49 40 28 14 14 14 13 12 11 10  9  8  9  7  7 12 25 50 49 48 46 24 19 18 20 23 26 30 34 38 39 38 41 47 45
  400: 89 84 72 60 53 34 17  9 10 11 11 11 11 11 10  7  9  9 11 22 51 49 49 40 21 27 30 31 27 28 29 31 31 29 35 44 47 45
  500: 85 81 74 60 49 18  7  9  7  8  9 11  9 11 11  7 10 10 11 17 36 40 45 32 18 31 50 45 33 34 42 42 42 40 39 44 46 45
  600: 79 79 72 50 32  9  7  7  7  7  9 11 12 13 11  9 11 10  9 10 15 28 29 17 21 37 48 48 42 43 43 43 48 41 41 45 46 45
  700: 75 72 60 46 33 14  7  7  7  7 10 13 14 13 13 16 23 22 15 11 11 12 18 16 26 41 49 50 44 43 45 48 47 44 41 43 47 46
  800: 76 71 59 47 36 21  7  7  7  8 12 14 13 14 15 27 41 33 27 24 16 12 12 13 29 40 45 44 43 43 48 48 47 40 39 41 45 46
  900: 73 74 62 51 39 23 11  7  7 10 13 13 14 13 28 43 44 42 41 32 26 18 14 13 18 33 40 41 49 48 42 41 39 36 36 39 43 46
 1000: 72 75 67 55 45 26 15  7  8 10 11 12 11 25 39 46 43 44 44 43 31 21 19 18 18 19 26 34 41 39 38 32 30 30 31 34 39 45
 1100: 74 78 72 56 54 30 15  8  9  9 10  9  9 26 49 44 43 45 38 35 32 25 23 22 20 20 20 21 27 27 25 25 26 26 26 30 37 42
 1200: 74 74 70 56 48 28 10  9  8  9  7  8  9 15 40 38 35 37 36 33 33 32 35 35 23 21 21 20 19 21 21 21 25 26 30 31 35 39
 1300: 68 67 65 56 39 23 10  8  8  7  7  7  9  9 25 32 32 35 35 33 37 37 43 44 30 21 20 19 19 21 28 31 21 29 31 33 36 37
 1400: 58 59 62 51 29 11 10  8  7  7  7  7  8  9 15 22 26 31 33 33 37 39 45 43 32 24 22 20 18 19 31 33 25 21 29 35 38 38
 1500: 48 52 50 34 20 11  9  7  7  7  7  8  8  9 10 16 17 23 29 36 39 42 44 44 37 29 22 21 18 19 23 26 26 21 23 31 34 35
 1600: 47 44 39 21 13 11 10  8  7  7  8  9  9  9 10 11 17 20 31 39 44 44 38 40 41 33 24 21 22 26 24 27 27 27 28 28 33 33
 1700: 39 36 30 17 13 12 12 10  9  9  9 10 10  9  9 10 13 17 26 35 40 41 38 36 38 33 28 27 28 32 33 30 30 35 36 34 36 36
 1800: 28 25 18 12  8  7  7  7  7  8 10 10 10  9  8 10 11 13 19 27 31 33 35 36 34 31 29 29 31 35 36 34 32 37 41 40 39 38
 1900: 20 15 12  9  7  7  7  7  8 10 10 10 10  9  8  9 10 11 15 22 26 28 30 32 33 31 29 31 33 36 35 33 32 35 41 44 42 41
```

### 4.4 Outer grid: 200 m spacing, AD 113 ground (m ASL)

Columns run x = −4600, −4400, …, +4600 (47 values) and rows run z = −5000 … +3600 (44 rows). Inside the core box, prefer 4.3. Monte Mario (139 m) is at the NW. NW and SE corners outside about x ±3000 come from the TINITALY DTM minus fill (C).
```
-5000: 117 116 124 122 123 103 119 100  87  54  37  55  47  16  10  13  16  21  23  32  16   9   7   8   8   9   8  12  21  56  57  33  12  15  13  44  40  41   7  12  14   7  17  32  32  36  15
-4800: 112 110 113 114 119 105 122 101 109 101  53  18  12   8   9  12  15  18  17  16  13  12  10   8   8   8   9   9  15  50  32  33   8  15  27  44  40  40  13   7   9  16  14  14  22  31  28
-4600: 109 101 102 103 108 123 127 127 127  83  27  16  12   9  11  13  13  13  12  12  16  17  14  15   9  10  10  15  44  30  22  20  31  16  41  45  40  30  19  14   7  13  15   7  16  30  14
-4400: 103 102 111 107 103 111 123 112  80  78  52  16  13  12  13  12  10  10  10  10  16  53  46  32  10  15  16  22  33  28  52  50  25  38  48  49  39  25  22  18  15  17   8  12  16  28   7
-4200: 101  90  94 102 100 126 122 129 117  73  54  17  14  12  10  10   8   8   8   8  27  53  59  37  26  42  41  39  54  41  52  49  32  51  40  30  32  21  24  21  22  21   8  10  28  29  23
-4000: 100  75  95 112 123 126 133 132 106 121  66  19  15  12  11  10   8  20  14  14  21  41  45  28  42  51  48  42  47  37  49  51  49  47  38  21  21  30  30  25  38  23   9   7   7  11  11
-3800:  87  79  89 104 118 121 122 132 112 131 100  29  16  13  11  11  10  10  39  31  50  43  26  36  48  53  54  47  48  47  50  50  48  40  31  22  22  31  32  32  36  23   9  11  12  13   9
-3600:  83  74  88 100 106 104 111 124 113 134 129  48  10  12  12  12  11  10  33  50  50  49  27  41  50  55  58  43  49  47  49  48  46  38  29  21  21  26  28  31  25  16  10  18  27  37  19
-3400:  76  75  75  91 102  98 102  99 110 130 126  38  13  11  11  12  12  12  46  48  54  48  36  43  51  58  58  50  53  53  50  47  45  38  29  25  26  21  23  24  23  12  14  29  36  42  39
-3200:  75  77  75  74  95  78 105  93  98  91  99  19  13  10  10  11  12  14  44  40  49  50  38  48  53  58  58  58  56  55  52  49  45  37  33  34  36  38  27  20  21  18  11  34  42  40  39
-3000:  76  71  69  76  94  75  80 101  92  48  30  13  11  10  10  11  12  13  25  27  44  46  46  46  51  56  57  59  58  57  54  50  44  39  41  42  46  43  34  24  21  20  13  27  42  36  33
-2800:  70  71  63  87  77  76  76 100  89  54  13  11  10   9  10  12  13  13  11  17  36  46  44  45  48  53  56  58  61  59  55  50  46  47  48  48  47  43  32  21  24  21  17  28  36  40  34
-2600:  63  68  69  72  69  74  70  98  72  17  11  11  10  10  11  13  13  13  10   8  51  44  46  42  44  50  54  58  62  59  55  51  52  52  51  49  47  43  32  23  24  19  20  18  22  38  35
-2400:  81  47  64  68  67  65  63  85  56  20  14  11  10  11  12  13  13  13  10  15  44  45  56  49  47  48  52  55  59  57  55  53  51  51  51  51  48  45  39  32  23  19  17  19  34  32  27
-2200:  58  69  59  76  74  65  58  73  56  17  14  11  10  11  12  12  12  12  10  17  22  39  47  55  56  52  50  52  56  59  58  55  53  51  51  50  44  39  35  32  27  19  14  17  39  38  22
-2000:  91  74  55  64  69  73  67  60  46  17  13  10  10  11  11  11  11  11  10   9  20  56  72  61  60  54  45  48  54  60  60  58  56  54  51  49  40  31  26  23  19  17  11  15  23  19  19
-1800:  76  87  70  33  55  83  71  50  28  18  13  12  11  11  10   9   9  10  10  11  20  40  59  63  62  49  40  42  51  60  63  62  59  55  52  47  38  28  19  17  16  15  14  16  20  19  19
-1600:  78  72  74  56  70  81  62  50  36  24  17  15  14  14  11   9   8   9  10  10  17  26  40  54  52  44  39  41  51  60  62  62  59  55  52  47  39  30  21  17  17  18  18  21  19  24  30
-1400:  80  74  73  61  67  79  61  65  50  34  22  18  18  19  15  11   9   9  10   9  15  20  24  47  48  42  33  44  51  60  58  59  58  54  52  48  40  31  23  19  17  19  23  23  12  24  33
-1200:  74  72  69  59  53  67  62  81  64  42  25  19  22  25  23  14  11  10   7   7  13  13  18  30  38  39  49  49  52  55  57  58  56  54  53  49  41  32  25  21  18  21  26  19  10  19  19
-1000:  86  87  74  46  33  30  64  83  60  38  25  22  29  36  36  22  15   9   8   8  13  14  15  18  61  59  54  43  55  56  57  57  54  53  52  51  46  37  28  23  19  32  28  16  14  32  27
 -800:  87  87  75  55  69  62  75  75  50  31  31  31  38  48  47  32  26  18  11  16  10  14  14  29  53  58  45  52  55  56  56  56  54  53  52  50  48  45  37  31  23  29  26  18  21  25  35
 -600:  85  77  74  74  78  66  72  63  44  27  35  41  46  50  52  34  20  16  11  12  11  15  13  25  55  51  53  54  46  56  56  56  55  53  52  50  48  46  43  37  28  20  25  18  17  19  24
 -400:  85  86  78  71  58  53  72  57  37  30  41  47  47  47  44  26  15  10  15  13  12  15  15  10  43  46  40  35  55  55  55  56  55  54  52  49  46  43  42  41  32  23  20  19  22  21  20
 -200:  82  73  69  63  51  69  72  60  39  44  63  60  57  59  34  18  12   7  14  11   9   9  23  28  17  25  21  37  44  54  55  55  55  54  54  49  44  42  42  43  37  28  27  28  28  27  21
    0:  83  82  79  76  61  79  73  70  66  63  69  78  55  78  35  18  13  10   8  12   7  10  39  13  15  21  33  49  50  46  49  51  51  50  53  51  45  43  43  43  41  37  37  35  31  28  26
  200:  83  73  78  74  72  79  78  78  74  72  71  84  59  77  61  36  23  15  10   9   8   8  20  22  35  29  23  26  40  46  50  45  45  47  51  51  47  45  44  44  44  43  41  35  28  26  27
  400:  82  71  73  80  79  78  72  76  79  78  69  82  73  86  84  60  34   9  11  11  11   7   9  22  49  40  27  31  28  31  29  44  45  45  51  52  50  47  45  44  44  46  44  38  31  28  25
  600:  80  74  61  76  76  77  69  69  80  76  67  85  88  80  79  50   9   7   7  11  13   9  10  10  28  17  37  48  43  43  41  45  45  44  51  52  50  47  45  43  45  47  46  41  35  46  26
  800:  77  75  58  63  70  71  64  63  71  68  69  79  73  75  71  47  21   7   8  14  14  27  33  24  12  13  40  44  43  48  40  41  46  45  47  48  46  43  42  42  45  47  48  47  45  37  31
 1000:  59  67  74  52  55  74  64  52  55  48  70  70  66  68  75  55  26   7  10  12  25  46  44  43  21  18  19  34  39  32  30  34  45  42  42  42  41  39  40  43  46  48  49  48  47  44  39
 1200:  70  57  73  63  60  77  68  54  49  44  66  62  63  68  74  56  28   9   9   8  15  38  37  33  32  35  21  20  21  21  26  31  39  41  40  38  38  40  42  45  47  48  50  49  49  44  33
 1400:  70  58  53  63  56  72  62  54  42  41  62  63  57  60  59  51  11   8   7   7   9  22  31  33  39  43  24  20  19  33  21  35  38  38  34  37  40  42  44  46  48  50  50  50  50  46  33
 1600:  71  64  49  50  59  74  64  68  66  49  47  62  55  56  44  21  11   8   7   9   9  11  20  39  44  40  33  21  26  27  27  28  33  31  34  38  42  44  46  48  50  48  46  47  51  49  38
 1800:  68  63  58  46  63  67  56  69  67  61  45  58  47  41  25  12   7   7   8  10   9  10  13  27  33  36  31  29  35  34  37  40  38  36  35  40  44  46  48  49  49  47  49  50  51  48  38
 2000:  66  62  54  48  70  65  50  68  62  50  49  37  26  24  15  10   7   7  11  10  10   8  11  18  22  26  31  32  34  32  32  42  44  42  41  41  46  48  48  48  48  49  50  53  54  51  46
 2200:  69  52  56  49  70  55  50  64  63  59  55  44  18  15  14  10   7   9  11  11  11   8  10  11  13  18  23  23  23  24  25  31  31  35  41  41  40  46  46  45  48  48  51  50  51  53  48
 2400:  54  51  54  46  68  59  49  54  60  62  56  47  30  17  12   9   7   9   9   8   7   7   8  10  10  12  16  14  13  14  14  18  21  31  34  22  31  37  39  39  43  44  45  42  48  49  49
 2600:  51  44  50  44  68  55  42  49  51  51  52  40  27  18  13   9   7   7   7   7   7   7   7   8   9   9   8   7   7   7   9   9  10  11  12  12  20  24  32  46  32  42  35  35  46  48  50
 2800:  67  51  31  49  67  51  46  46  59  55  51  42  29  21  16  11   7   7   7   7   7   7   9   7  10   8   8   7   9  14   9  10   9  10   9  10  11  12  29  26  23  33  37  34  32  44  49
 3000:  57  48  29  56  58  53  40  52  62  55  49  40  31  24  21  10   7   7   7   7   7   7  10  14  11  10  11  23  12  11  28  17  24  15  24  13  11  11  14  21  27  38  37  41  42  38  46
 3200:  45  38  28  52  62  45  37  51  64  58  50  29  29  37  18   7   7   7   7   7   7   7  12  14  18  17  14  31  31  12  20  29  34  26  23  35  30  12  18  45  43  40  39  39  50  43  44
 3400:  58  46  29  47  61  44  30  47  59  56  47  42  39  42  14   7   7   7   7   7   7  10  15  18  24  22  22  25  40  27  24  27  34  39  30  37  41  17  14  17  34  46  43  40  49  52  44
 3600:  51  54  25  30  61  49  27  39  51  56  47  25  16  18  14   8   7   7   7   7  12  32  14  23  28  26  25  29  37  36  31  39  32  40  45  37  44  33  20  18  16  22  40  39  43  50  49
```

## 5. The Tiber

### 5.1 Centerline and widths

The polyline follows the **modern** OSM river centerline, simplified with a 12 m tolerance. It runs from Pons Mulvius to about 1.6 km below the Aventine. Width is the **water surface at normal level** today, measured perpendicular to the flow and median-smoothed.

- **The river's course has barely changed since antiquity** in this stretch, and the bed level is unchanged within about 0.5–1 m (Aldrete 2007 p. 41).
- The banks were different. There were no 18 m embankment walls (*muraglioni*, 1876–1926). Instead there were sloping natural banks, beaches and discontinuous stone quays.
- Recommended ancient water width is the listed value **+0–15 m**: the river was slightly wider where the modern walls now confine it, chiefly in the Campus Martius.
- Vertex 32 sits on Tiber Island. Its "width" is the width of a branch.

| # | [x, z] | width (m) | chainage (m) | landmark |
|---|---|---|---|---|
| 0 | [-1444, -4764] | 105 | 0 | Pons Mulvius (Via Flaminia crossing) |
| 1 | [-1692, -4597] | 80 | 300 |  |
| 2 | [-1834, -4457] | 80 | 500 |  |
| 3 | [-1922, -4335] | 80 | 650 |  |
| 4 | [-2028, -4110] | 80 | 900 |  |
| 5 | [-2060, -3863] | 80 | 1150 |  |
| 6 | [-1994, -3624] | 75 | 1400 |  |
| 7 | [-1833, -3434] | 75 | 1650 |  |
| 8 | [-1755, -3371] | 75 | 1750 |  |
| 9 | [-1664, -3330] | 80 | 1850 | Tor di Quinto bend |
| 10 | [-1328, -3231] | 80 | 2200 |  |
| 11 | [-1248, -3172] | 75 | 2300 |  |
| 12 | [-1192, -3090] | 70 | 2400 |  |
| 13 | [-1127, -2902] | 75 | 2600 |  |
| 14 | [-1143, -2603] | 70 | 2900 |  |
| 15 | [-1119, -2354] | 80 | 3150 |  |
| 16 | [-1002, -1920] | 80 | 3600 | river turns SE; N edge of the Campus Martius (the later Porta del Popolo is about 350 m E) |
| 17 | [-885, -1700] | 85 | 3850 |  |
| 18 | [-833, -1561] | 90 | 4000 | Mausoleum of Augustus about 190 m E (port area later called Ripetta) |
| 19 | [-831, -1411] | 90 | 4150 |  |
| 20 | [-864, -1317] | 80 | 4250 |  |
| 21 | [-950, -1194] | 75 | 4400 | bend W |
| 22 | [-1031, -1137] | 80 | 4500 |  |
| 23 | [-1170, -1080] | 80 | 4650 | river flows W; Ager Vaticanus on the right bank |
| 24 | [-1565, -1020] | 95 | 5050 |  |
| 25 | [-1608, -995] | 90 | 5100 |  |
| 26 | [-1683, -930] | 90 | 5200 | Pons Neronianus (remains about 30 m E of this vertex) |
| 27 | [-1726, -840] | 90 | 5300 | big bend; Tarentum on the left bank |
| 28 | [-1725, -741] | 85 | 5400 |  |
| 29 | [-1708, -694] | 85 | 5450 |  |
| 30 | [-1560, -433] | 80 | 5750 | Pons Agrippae is near chainage ≈6150 (between #30 and #31) |
| 31 | [-1042, 108] | 80 | 6500 | upstream of Tiber Island (later Ponte Garibaldi) |
| 32 | [-531, 310] | 50 | 7050 | Tiber Island (two branches, see 5.5) |
| 33 | [-394, 451] | 80 | 7250 | Forum Boarium bank; Pons Aemilius about 90 m upstream; Cloaca Maxima outlet |
| 34 | [-413, 599] | 75 | 7400 | Porta Trigemina; Pons Sublicius somewhere near here (D) |
| 35 | [-493, 725] | 75 | 7550 | Aventine cliffs on the left bank |
| 36 | [-652, 919] | 70 | 7800 | Emporium quays begin (left); Ripa (right) |
| 37 | [-1053, 1295] | 65 | 8350 | Porticus Aemilia inland (E) |
| 38 | [-1138, 1417] | 65 | 8500 |  |
| 39 | [-1192, 1556] | 65 | 8650 |  |
| 40 | [-1198, 1705] | 55 | 8800 |  |
| 41 | [-1166, 1852] | 55 | 8950 | Monte Testaccio about 400 m E; Via Ostiensis and Via Portuensis diverge |
| 42 | [-908, 2609] | 65 | 9750 |  |
| 43 | [-844, 2744] | 60 | 9900 |  |
| 44 | [-681, 2933] | 60 | 10150 | downstream: wharves continue about 2 km (Pietra Papa) |
| 45 | [-611, 3063] | 60 | 10300 |  |
| 46 | [-591, 3211] | 55 | 10450 |  |
| 47 | [-627, 3303] | 55 | 10550 |  |
| 48 | [-693, 3378] | 55 | 10650 |  |

Compact array for code (`[x, z, width]`):
```
[[-1444,-4764,105], [-1692,-4597,80], [-1834,-4457,80], [-1922,-4335,80], [-2028,-4110,80], [-2060,-3863,80], [-1994,-3624,75], [-1833,-3434,75], [-1755,-3371,75], [-1664,-3330,80], [-1328,-3231,80], [-1248,-3172,75], [-1192,-3090,70], [-1127,-2902,75], [-1143,-2603,70], [-1119,-2354,80], [-1002,-1920,80], [-885,-1700,85], [-833,-1561,90], [-831,-1411,90], [-864,-1317,80], [-950,-1194,75], [-1031,-1137,80], [-1170,-1080,80], [-1565,-1020,95], [-1608,-995,90], [-1683,-930,90], [-1726,-840,90], [-1725,-741,85], [-1708,-694,85], [-1560,-433,80], [-1042,108,80], [-531,310,50], [-394,451,80], [-413,599,75], [-493,725,75], [-652,919,70], [-1053,1295,65], [-1138,1417,65], [-1192,1556,65], [-1198,1705,55], [-1166,1852,55], [-908,2609,65], [-844,2744,60], [-681,2933,60], [-611,3063,60], [-591,3211,55], [-627,3303,55], [-693,3378,55]]
```

### 5.2 Water level, depth and floods

- **Normal level about 6 m ASL in the city.** Aldrete (2007, ch. 2) gives the Ripetta gauge averages: 6.7 m (1822–1921) and 6.26 m (1921–40). Seasonal swing: about 7.2 m in winter and about 5.8 m in July. His normal range is 5–7 m. For the game, use **6.5 m at Pons Mulvius, 6.0 m through the city and 5.8 m at the Emporium.**
- Depth at normal flow is about **4–6 m mid-channel**, so the bed is about 0–2 m ASL. The current is brisk (about 1 m/s) with brown, silty water (*flavus Tiberis*).
- Flood classes (Aldrete): elevated 7–10 m; ordinary flood 10–13 m; extraordinary 13–16 m; **exceptional above 16 m** (record about 19.6 m, in 1598).
  - Minor floods (≈10 m) inundate the Forum Boarium, the low Campus and the Emporium.
  - At ≈15 m water reaches the Forum (backing up the Cloaca), the Circus and the whole Campus.
  - At ≈20 m the Velabrum, imperial fora and part of the Subura flood. The Capitoline and Palatine nearly become islands.
- A notable flood struck **under Trajan** (Pliny, *Ep.* 8.17), despite the emperor's relief channel. This is a good quest hook.
- The **Cloaca Maxima outlet** is on the left bank just below the Pons Aemilius. The arched mouth is 4.5 m wide x 3.3 m high, with its floor at **4.7 m ASL**, so it is partly submerged at normal flow. Position about **[-350, 430]** (C).

### 5.3 Banks, quays and embankments in AD 113

- **Natural banks:** 3–8 m above the water. The bank is about 10–13 m ASL in the Campus Martius and about 10–11 m in Trastevere and the Emporium. They slope at about 1:2 to 1:4, with gravel and mud beaches at low water, reeds upstream, and mooring posts.
- **The Romans built quays, not flood walls** (Aldrete ch. 5). There are concrete or tufa cores with sloping walls about 5 m high faced in opus reticulatum. The quay surfaces are travertine at about **11–12 m ASL**, with paired stairs and ramps to the water and big travertine **mooring rings**. Barrel-vaulted storerooms stand behind. **A Trajanic rebuild** is attested at the Emporium (Lungotevere Testaccio). The *curatores alvei et riparum Tiberis et cloacarum* mark the public riverbank zone with inscribed **cippi**.

| Quay / embankment (113) | Bank | Polyline [x, z] | Notes | Conf. |
|---|---|---|---|---|
| Portus Tiberinus (Forum Boarium / Holitorium) | left | [[-470,140],[-440,230],[-400,330],[-360,430],[-360,520]] | The old river port, with the Temple of Portunus behind. Includes the Cloaca outlet. | B |
| Below the Aventine (Pons Sublicius → Emporium) | left | [[-400,600],[-470,700],[-560,830],[-650,920]] | Republican stone quays at the foot of the cliff | C |
| **Emporium** (Trajanic phase) | left | [[-650,930],[-800,1060],[-950,1180],[-1060,1300],[-1150,1430],[-1190,1560]] | About 500 m of quays with ramps, stairs and mooring rings. The Porticus Aemilia (487 x 60 m) and Horrea Galbana and Lolliana stand inland. | B |
| Ripa (Transtiberim, opposite the Aventine) | right | [[-560,700],[-650,850],[-780,960],[-900,1060]] | Riverside wharves (the later Ripa Grande) | C |
| Campus Martius river frontage | left | [[-1700,-700],[-1600,-460],[-1300,-160],[-1100,40]] | Scattered landings and the **Navalia**? The location of the Navalia shipsheds is debated: the Campus Martius or the Forum Boarium. | D |
| Ager Vaticanus landing | right | [[-1560,-1020],[-1700,-940]] | By the Pons Neronianus | D |

### 5.4 Notes on the river's course in 113

- The Tiber bends E around the Campus Martius and Ager Vaticanus, turns S at the Tarentum, then runs SE past Tiber Island and S/SW past the Aventine and the Emporium.
- In the **Campus Martius stretch**, the ancient left bank lay within a few tens of meters of the modern wall line. The 19th-century embankment straightened small irregularities (C).
- There is **no Pons Aelius and no Castel Sant'Angelo** (both 130s). The right bank there holds the **Horti Domitiae** gardens.

### 5.5 Tiber Island (Insula Tiberina)

- **Outline** (OSM river polygon, with the modern upstream sand-bar tail removed; it includes the modern quay apron, B):
  `[[-685, 180], [-660, 221], [-593, 248], [-590, 267], [-575, 271], [-563, 261], [-507, 294], [-489, 297], [-443, 328], [-431, 329], [-421, 321], [-421, 306], [-457, 242], [-485, 213], [-565, 158], [-612, 142], [-660, 139]]`
- **Literature size:** about **270 m long x 67 m wide**. The outline above is about 300 x 90 m because of the modern quays. For the ancient island, inset it by about 8–10 m.
- **Orientation:** the long axis runs WNW (upstream) → ESE (downstream), bearing about **118°**.
- Upstream tip about [-675, 180]. **Downstream tip about [-425, 325]**, about 35 m above the surviving Pons Aemilius arch.
- **Ground level** about **11–12 m ASL**, raised by the temple platforms. Use an island elevation of 11.
- **Ship form:** in the 1st c. BC the island was faced in **travertine to look like a ship**, with an **obelisk as the mast** in the middle (about [-540, 235]). The surviving "prow" (or "stern"; sources differ), carved with Aesculapius's staff and snake, is at the **downstream (ESE) tip on the left-branch side** (B for location, D for the prow/stern label).
- **Temples:**
  - **Aesculapius**, on the downstream (E) half under S. Bartolomeo, about [-505, 255].
  - **Faunus** and **Veiovis**, also on the island (exact positions D).
  - A shrine of **Tiberinus**.
  - The temple of Aesculapius doubles as a refuge for sick slaves (a Claudian edict freed those abandoned there).
- **Branches:**
  - Left/NE (Pons Fabricius) branch: about **55–60 m** wide.
  - Right/SW (Pons Cestius) branch: about **45–60 m** wide.
  - Total width from bank to bank across the island is about 190 m.

## 6. Bridges standing in AD 113

End points run from the **left (E/N, city) bank** to the **right (W/S) bank**. Positions come from OSM (modern bridge axes) or are reconstructed. Deck levels are not well attested: about **15–18 m ASL**, with ramps up from 10–13 m banks (C).

| Bridge | Date / builder | Left end [x, z] | Right end [x, z] | Length | Width | Arches | Material | Conf. |
|---|---|---|---|---|---|---|---|---|
| **Pons Mulvius** (Ponte Milvio) | 109 BC, M. Aemilius Scaurus (stone; an earlier timber bridge stood here) | [-1415, -4667] (S, city side) | [-1469, -4827] (N) | 136 m (modern total) | 8.75 m | 6 spans; central 4 of about 18.5 m, 2 end spans about 9 m | Tufa and travertine (towers and ends are later) | A |
| **Pons Neronianus** (Pons Triumphalis / Vaticanus) | 1st c. AD (Caligula or Nero) | [-1620, -875] | [-1705, -950] | about 110 m | ? (about 7–8, D) | 4 piers → 5 arches | Stone | B for the position (piers seen just below Ponte Vittorio Emanuele II, at a slightly different angle) |
| **Pons Agrippae** | Agrippa (late 1st c. BC) or by Claudius at the latest; restored 147 | [-1203, -121] | [-1276, -56] | about 100 m | ? (D) | 4 piers found in 1887 | Stone | C (160 m upstream of Ponte Sisto) |
| **Pons Fabricius** | 62 BC, L. Fabricius, *curator viarum* | [-486, 141] (left bank) | [-530, 190] (island) | 62 m | 5.5 m | 2 arches (24.25 and 24.5 m) + a small flood opening through the central pier | Tufa and peperino core, travertine, brick facing | **A** (it still stands) |
| **Pons Cestius** | c. 62–27 BC (prob. L. Cestius, about 46 BC) | [-572, 241] (island) | [-597, 318] (Trastevere) | 48 m | 8.2 m | 3 arches, central 23.65 m with small flanking arches | Tufa and peperino, travertine facing | A (position); B (original form; rebuilt 370 and 1888–92) |
| **Pons Aemilius** | piers 179 BC (M. Aemilius Lepidus, M. Fulvius Nobilior); arches 142 BC | about [-340, 352] (Forum Boarium) | about [-495, 370] (Trastevere, start of the Via Aurelia) | about 140–150 m | about 8 m (D) | 6–7 spans of about 24 m | Tufa and travertine | A (the surviving arch at [-415, 358]); C (ends) |
| **Pons Sublicius** | regal (Ancus Marcius); the sacred **wooden** bridge, built without iron and maintained by the *pontifices* | about [-360, 520] (Porta Trigemina) | about [-480, 560] | about 110 m | about 5 m (D) | timber trestles on piles | Wood | **D**. Most topographers put it just below the Pons Aemilius at the Porta Trigemina. The modern "Ponte Sublicio" (about 500 m further S) is NOT the ancient site. |

**Not standing in 113:**

- **Pons Aelius** (Ponte Sant'Angelo): AD 134.
- **Pons Aurelius / Antonini**: the Severan rebuild of the Pons Agrippae near Ponte Sisto, early 3rd c. In 113 that crossing is the Pons Agrippae.
- **Pons Probi**: 3rd c.
- **Caligula's bridge** between the Palatine and the Capitol: dismantled after 41.

Sources: Wikipedia (Ponte Milvio, Pons Fabricius, Pons Cestius, Pons Aemilius, Pons Agrippae, Pons Neronianus; *List of Roman bridges*); Platner & Ashby s.v. Pons; Coarelli 2007. Axes come from OSM `man_made=bridge` polygons.

## 7. Major streets

Polylines are `[x, z]` in real meters. Most are traced from the **modern streets that preserve the ancient line** (OSM geometry), then simplified. The inferred ones say so.

**General facts:**

- **Paving (silex):** urban viae and clivi are paved with **polygonal basalt blocks (selce)**, about 0.5–0.9 m across, cambered, with raised **crepidines** (sidewalks, 1–3 m wide) of travertine or tufa. Forum squares use **travertine slabs**.
- **Minor streets:** vici and angiporti are 2–4 m wide, often unpaved or brick and tufa rubble.
- **Steep places:** the steepest clivi have transverse ribs, and some routes are **stairs** (gradus). Examples: **Centum Gradus** (Forum → Capitolium), **Scalae Caci** (Palatine SW), **Gradus Monetae** (Arx).
- **Carts:** wheeled traffic is banned from the city by day (Lex Iulia municipalis), except for building carts. **Streets are pedestrian-crowded in daytime and full of carts at night.**

| Street | Length (m) | Width | Paving | Conf. | Notes |
|---|---|---|---|---|---|
| **Via Sacra** | 566 | 6–8 m in Nero's and Flavian form, flanked by porticoes; wider in the Forum | basalt; travertine in the Forum | A | From the Meta Sudans and Colosseum valley up over the Velia (Arch of Titus, summa Sacra Via, about 28 m) and down past the Regia and Temple of Divus Julius into the Forum (13 m). |
| **Via Nova** | 402 | 4–5 m, partly arcaded and vaulted on the Palatine side | basalt | B (E part); C (W end to the Velabrum) | Runs along the Palatine's N foot above the House of the Vestals, toward the Velabrum and Porta Romana. |
| **Clivus Capitolinus** | 237 | 4–5 m, steep (about 12–15 %) | basalt | A | From the Forum by the Temple of Saturn, in front of the Porticus Deorum Consentium, up to the Asylum and Capitolium. The triumph route. |
| **Clivus Palatinus** | 226 | about 6 m | basalt | A | From the Arch of Titus SW up to the Domus Flavia entrance. |
| **Clivus Victoriae** | 282 | 3–5 m | basalt | B | Along the Palatine's NW slope under the Domus Tiberiana, from the Velabrum (Porta Romana) up and E. |
| **Vicus Tuscus** | 568 | about 5 m with shopfronts | basalt | A (Forum end); B | Between the Basilica Julia and the Temple of Castor, through the Velabrum to the Circus carceres and Forum Boarium. Luxury shops: silk, incense and perfume (vicus turarius). |
| **Vicus Iugarius** | 381 | about 5 m | basalt | A | Between the Basilica Julia and the Temple of Saturn, W along the Capitoline's S foot under the Tarpeian Rock to the Forum Holitorium and Porta Carmentalis. |
| **Argiletum → Subura street** | 519 | about 5–6 m | basalt | A (Forum end, now inside the Forum of Nerva); B | Booksellers and cobblers. Since 97 the lower Argiletum runs as the Forum Transitorium. The main Subura street then continues NE (along the later Via della Madonna dei Monti). |
| **Clivus Suburanus** | 1063 | 5–6 m | basalt | B | From the Subura up the Oppius–Cispius saddle (Via Leonina, Via in Selci, Via di S. Martino ai Monti, Via di S. Vito) to the **Porta Esquilina**. Main road to the Esquiline gate. |
| **Vicus Longus** | 1031 | about 5 m | basalt | C | The valley road between the Quirinal and Viminal, approximately the line of the modern Via Nazionale. |
| **Vicus Patricius** | 1059 | 5–6 m | basalt | B (= Via Urbana); C (NE extension to Porta Viminalis) | The valley between the Viminal and Cispius. |
| **Alta Semita** | 1648 | about 6 m | basalt | B | The Quirinal crest road (Via del Quirinale, then Via XX Settembre) to the **Porta Collina**. Gives Regio VI its name. |
| **Clivus Argentarius** | 485 | 4–5 m | basalt | B | From the Forum (Carcer) N around the Capitoline's E foot to the Porta Fontinalis and the head of the Via Lata. Lined with bankers. |
| **Via Lata / Via Flaminia** | 4591 | Via Lata 10–12 m between porticoes (carriageway about 6–7 m); Flaminia 4.1 m carriageway + sidewalks | basalt | A | Dead straight along the later Via del Corso. The **Arch of Claudius** (51/52) carries the Aqua Virgo over it at about [-297, -765]. Beyond the Campus Martius (there is no gate in 113) it continues as the Via Flaminia to the Pons Mulvius, lined with tombs. |
| **Via Recta** | 1007 | about 6 m | basalt | B (W part = Via dei Coronari); C (E end) | E–W straight road across the Campus Martius toward the river near the (later) Pons Aelius. |
| **Via Appia** | 3536 | 4.1 m (14 ft) carriageway + crepidines, about 8–10 m total | basalt | A | From the Porta Capena SE through the valley (later Viale delle Terme di Caracalla and Via di Porta S. Sebastiano). It passes the Tomb of the Scipios at about [1339, 1837] and the Temple of Mars about 1.5 km beyond. Lined with tombs. |
| **Via Latina** | 1362 | as the Appia | basalt | A | Branches from the Appia at about [990, 1455] (the later Piazzale Numa Pompilio). |
| **Via Labicana / Praenestina (inner)** | 1251 | about 6 m | basalt | C | From the Porta Esquilina ESE to **Ad Spem Veterem**, where the two roads pass through the twin arches of the Claudian aqueduct (Porta Maggiore) and split: the Labicana goes SE, the Praenestina E. |
| **Via Tiburtina (inner)** | 1025 | about 6 m | basalt | C | From the Porta Esquilina NE to the **Arch of Augustus** (5 BC), which carries the Marcia, Tepula and Julia over the road at [2146, -541] (later Porta Tiburtina). |
| **Via Nomentana** | 2740 | 4–5 m + sidewalks | basalt | A (line); B (start) | From the Porta Collina NE along Via XX Settembre past the later Porta Nomentana. |
| **Via Salaria** | 673 | 4–5 m + sidewalks | basalt | B | From the Porta Collina N (later Via Piave) past the later Porta Salaria. The Salaria Vetus branched W toward the later Porta Pinciana (not drawn). |
| **Via Ostiensis** | 1655 | about 6 m | basalt | B | From the Porta Trigemina S along the Aventine's river foot (later Via della Marmorata), past the Emporium to the Pyramid of Cestius and beyond. |
| **Clivus Publicius** | 392 | about 4 m, steep | basalt | B | From the Forum Boarium and Circus W end up to the Aventine (S. Prisca). Built about 240 BC. |
| **Vicus Armilustri** | 559 | about 4 m | basalt / beaten earth | C | Aventine crest street toward the Armilustrium (near S. Sabina). |
| **Clivus Scauri** | 144 | about 4 m | basalt | A | From the valley up the Caelian's W end to the houses of the Caelian elite. |
| **Valley road, Porta Capena → Colosseum** | 387 | about 8 m (triumphal route) | basalt | B | The triumph entered via the Circus and this road, then the Sacra Via. |
| **Via Aurelia (vetus)** | 3673 | about 6 m | basalt | B (Trastevere = Via della Lungaretta); C (ascent) | From the Pons Aemilius W through Trastevere, then up the Janiculum in zig-zags to the crest (the later Porta Aurelia / S. Pancrazio, NOT a gate in 113) and W. |
| **Via Portuensis (+ Via Campana)** | 1586 | about 6 m | basalt / gravel | C | From the Pons Aemilius and Pons Sublicius SW along the right bank toward Portus. The Via Campana (to the salt-beds) follows the river similarly. |
| **Trastevere → Ager Vaticanus road** | 1055 | about 5 m | gravel / basalt | C | Along the foot of the Janiculum, later Via della Lungara. |
| **Via Triumphalis** | 2306 | about 5 m | basalt | C | From the right-bank end of the Pons Neronianus NW to Monte Mario. |
| **Via Cornelia** | 1954 | about 5 m | basalt | C | From the right-bank end of the Pons Neronianus W past the Circus of Gaius & Nero and the necropolis under the later St Peter's. |

Polylines:
```
Via Sacra:                             [[520, 290], [505, 269], [343, 209], [348, 188], [295, 131], [197, 82], [67, -4]]
Via Nova:                              [[328, 226], [135, 142], [60, 215], [-20, 250]]
Clivus Capitolinus:                    [[6, 2], [-1, -10], [-20, -9], [-56, 34], [-97, 66], [-185, 40]]
Clivus Palatinus:                      [[343, 209], [308, 271], [290, 267], [289, 245], [215, 330]]
Clivus Victoriae:                      [[-10, 250], [130, 177], [189, 197], [211, 221], [236, 234]]
Vicus Tuscus:                          [[97, 62], [66, 131], [45, 140], [-45, 311], [-73, 452], [-150, 560]]
Vicus Iugarius:                        [[-5, 18], [-28, 51], [-134, 135], [-205, 167], [-330, 190]]
Argiletum → Subura street:             [[69, -3], [107, -42], [174, -73], [255, -125], [414, -173], [533, -219]]
Clivus Suburanus:                      [[533, -218], [686, -255], [797, -252], [807, -234], [838, -227], [947, -227], [1035, -258], [1102, -301], [1270, -372], [1407, -354]]
Vicus Longus:                          [[218, -452], [899, -1045], [1010, -1110]]
Vicus Patricius:                       [[715, -266], [976, -671], [1100, -830], [1300, -930], [1440, -990]]
Alta Semita:                           [[199, -427], [180, -700], [340, -865], [800, -1300], [1066, -1536], [1188, -1632]]
Clivus Argentarius:                    [[-20, -40], [-45, -110], [-60, -180], [-80, -250], [-110, -310]]
Via Lata / Via Flaminia:               [[-110, -310], [-189, -478], [-292, -829], [-385, -1104], [-859, -2639], [-962, -2946], [-1300, -4056], [-1327, -4148], [-1430, -4700]]
Via Recta:                             [[-1386, -881], [-985, -869], [-788, -880], [-649, -875], [-380, -880]]
Via Appia:                             [[507, 955], [620, 1110], [891, 1361], [990, 1455], [1246, 1729], [1354, 1913], [1421, 2111], [1463, 2263], [1467, 2510], [1548, 2834], [1742, 2982], [2302, 3640]]
Via Latina:                            [[990, 1455], [998, 1466], [1117, 1528], [1438, 1741], [1600, 1830], [2199, 2067]]
Via Labicana / Praenestina (inner):    [[1407, -354], [1600, -280], [2086, -69], [2100, -63], [2107, -73], [2457, 78], [2552, 126]]
Via Tiburtina (inner):                 [[1407, -354], [1950, -520], [2146, -541], [2400, -600]]
Via Nomentana:                         [[1188, -1632], [1403, -1850], [1640, -2059], [1655, -2063], [2692, -3006], [2713, -3032], [2792, -3190], [2989, -3419], [3104, -3568]]
Via Salaria:                           [[1188, -1632], [1196, -1657], [1139, -2014], [1150, -2300]]
Via Ostiensis:                         [[-320, 560], [-520, 900], [-610, 1100], [-621, 1193], [-408, 1603], [-298, 1714], [-291, 1732], [-244, 1761], [-330, 2000]]
Clivus Publicius:                      [[-177, 595], [-172, 632], [-117, 731], [-130, 772], [-163, 806], [-115, 947]]
Vicus Armilustri:                      [[-340, 913], [-254, 827], [-163, 806], [-120, 950], [-46, 1129]]
Clivus Scauri:                         [[521, 676], [664, 698]]
Valley road, Porta Capena → Colosseum: [[414, 809], [490, 459], [501, 432]]
Via Aurelia (vetus):                   [[-490, 370], [-702, 361], [-843, 344], [-1166, 333], [-1350, 420], [-1512, 545], [-1700, 520], [-1896, 457], [-2148, 555], [-2229, 578], [-2295, 555], [-2424, 446], [-2579, 399], [-2809, 412], [-3033, 392], [-3649, 369], [-3846, 342], [-4000, 290]]
Via Portuensis (+ Via Campana):        [[-490, 370], [-640, 620], [-875, 978], [-1183, 1313], [-1298, 1520], [-1356, 1685]]
Trastevere → Ager Vaticanus road:      [[-1390, 37], [-1466, -126], [-1754, -622], [-1790, -820], [-1705, -950]]
Via Triumphalis:                       [[-1705, -950], [-1900, -1150], [-2150, -1500], [-2500, -2200], [-2913, -2833]]
Via Cornelia:                          [[-1705, -950], [-2100, -1000], [-2541, -1000], [-3600, -1100]]
```

## 8. The Servian Wall in AD 113

### 8.1 What it is

- A tufa wall (Grotta Oscura tufa, early 4th c. BC, after 390 BC; earlier cappellaccio phases) about **10 m high and 3.6–4 m thick**.
- Total circuit about **11 km** (the line below measures about 8.5 km because it simplifies the Capitoline and Quirinal stretches). Enclosed area about 400+ ha (estimates vary).
- On the open **Esquiline–Viminal–Quirinal plateau** it is doubled by the **agger**, an earth rampart about **1.3 km** long. Dionysius gives it 50 ft thick behind a moat 100 ft wide and 30 ft deep (about 15 m rampart, ditch about 30 x 9 m), running from the **Porta Collina to the Porta Esquilina**.

**State in 113:** long obsolete militarily, because the city has spread far beyond it.

- **Much of the wall is built over, incorporated into houses, or demolished.** Gates survive as arches and landmarks and as names for neighbourhoods. They are not barriers.
- The **agger** is a raised promenade. Maecenas laid out his **gardens on and behind it** over the old paupers' cemetery (Horace, *Sat.* 1.8).
- The **ditch is filled** in many places.
- The **pomerium** (sacred boundary) no longer follows the wall. Claudius (49) and Vespasian (75) extended it, marked by cippi, and it includes the Aventine.
- **Design suggestion:** show 3–6 m high fragments of squared tufa with houses built into them, gate arches standing free across streets, and a grassy, garden-topped agger.

### 8.2 Course (clockwise from the river at the Forum Holitorium)

C overall: about ±50 m where remains are known, ±150 m elsewhere.
```
[[-440, 175], [-420, 160], [-330, 170], [-240, 165], [-265, 90], [-275, 0], [-235, -80], [-170, -170], [-125, -255], [-110, -310], [-60, -290], [0, -340], [120, -400], [199, -427], [150, -560], [110, -690], [70, -800], [40, -950], [10, -1163], [330, -1250], [550, -1300], [773, -1353], [825, -1513], [1000, -1600], [1188, -1632], [1260, -1450], [1305, -1210], [1380, -1110], [1440, -990], [1470, -800], [1482, -592], [1430, -420], [1404, -354], [1338, -20], [1250, 200], [1160, 370], [1000, 560], [854, 793], [700, 900], [600, 950], [507, 955], [450, 1100], [350, 1270], [313, 1330], [150, 1350], [40, 1350], [-140, 1357], [-300, 1340], [-430, 1280], [-560, 1150], [-560, 1000], [-470, 880], [-400, 740], [-320, 575], [-380, 420], [-430, 300]]
```

| Gate | [x, z] | Ground (m ASL) | Conf. | Notes |
|---|---|---|---|---|
| Porta Flumentana | [-420, 160] | 9 | C | Between the Capitoline and the river, where the Via Aurelia crossing approached. The river frontage may not have been walled. |
| Porta Carmentalis | [-240, 165] | 14 | B | SW foot of the Capitoline by the shrine of Carmenta (near S. Omobono / Vico Jugario). Its right arch was ill-omened (the Fabii marched out through it). |
| Porta Fontinalis | [-110, -310] | 16 | C | N foot of the Capitoline toward the Campus. The Tomb of Bibulus (about [-150, -370]) stood just outside. |
| Porta Ratumena (?) | [-60, -290] | 18 | D | Probably near the Fontinalis, on the old Capitoline–Quirinal saddle. That ground was **cut away by Trajan's Forum works in 107–112**. |
| Porta Sanqualis | [199, -427] | 40 | B | Largo Magnanapoli; wall remains survive. |
| Porta Salutaris | [70, -800] | 35 | D | W edge of the Quirinal near the Temple of Salus. |
| Porta Quirinalis (?) | [330, -1250] | 45 | D | N edge of the Quirinal near the Temple of Quirinus. |
| Porta Collina | [1188, -1632] | 60 | A | 41°54'26"N 12°29'55"E, under the NE corner of the Ministero delle Finanze (Via XX Settembre). The Via Salaria and Via Nomentana leave from here. |
| Porta Viminalis | [1440, -990] | 56 | B | In the agger near the Termini remains. |
| Porta Esquilina | [1404, -354] | 55 | A | The Augustan travertine arch (later "Arch of Gallienus"). The Via Labicana, Praenestina and Tiburtina leave from here. |
| Porta Querquetulana (?) | [1160, 370] | 30 | D | In the valley between the Oppius and Caelian. |
| Porta Caelimontana | [854, 793] | 44 | B | The Arch of Dolabella and Silanus (AD 10) reuses its position. The Arcus Neroniani ride over it. |
| Porta Capena | [507, 955] | 16 | A/B | Remains of a tower survive. The Via Appia and Via Latina start here. **"madida Capena"**: it drips from the aqueduct arches over it (Juvenal 3.11, written about 110s!). |
| Porta Naevia (?) | [313, 1330] | 35 | D | Lesser Aventine, near S. Balbina. |
| Porta Raudusculana | [40, 1350] | 30 | C | In the valley between the two Aventines (later Piazza Albania). Wall remains survive along Via di S. Anselmo. |
| Porta Lavernalis | [-430, 1280] | 30 | C | Aventine S side (the modern Via di Porta Lavernale preserves the name). |
| Porta Trigemina | [-320, 575] | 10 | B | NW foot of the Aventine near the river and the Salinae. The Via Ostiensis starts here. |

Known wall remains used as control points (OSM, A): Termini/Piazza dei Cinquecento [1380..1454, -1130..-974]; Via delle Finanze / Via XX Settembre area [1305, -1210]; Largo S. Susanna [773, -1353]; Via Salandra area [825, -1513]; Via del Traforo area [10, -1163]; Largo Magnanapoli [199, -427]; Via Mecenate [1338, -20]; Arch of Dolabella [854, 793]; Porta Capena tower [507, 955]; Via di S. Anselmo [-192..-140, 1341..1357]; S. Sabina crypt [about -470, 880].

The stretch along the river (Porta Trigemina → Porta Flumentana) is uncertain. The river itself may have served as the defence.

## 9. Aqueducts inside the map

Channel (specus) elevations where each aqueduct reaches the city, from **Hodge, Evans, Aicher** and Frontinus. Modern measurement at Porta Maggiore gives the specus of the **Claudia at 63.8 m and the Anio Novus at 66.0 m**. Older handbooks give 67/70 m.

| Aqueduct | Built | Channel at the city (m ASL) | Approach | Notes |
|---|---|---|---|---|
| Aqua Appia | 312 BC | about 20 → 15 at the terminus | underground | Lowest. Ends at the Salinae by the Porta Trigemina. |
| Anio Vetus | 272–269 BC | about 48 | underground | Muddy Anio water, for gardens and fountains. |
| Aqua Marcia | 144–140 BC | about 58–59 | on arcades, sharing them with the Tepula and Julia | Best, coldest water. Reached the Capitol. |
| Aqua Tepula | 125 BC | about 61 | above the Marcia | Lukewarm |
| Aqua Julia | 33 BC | about 63.7 (measured at Porta Maggiore) | above the Tepula | |
| Aqua Virgo | 19 BC (Agrippa) | about 20 | underground, then low arcades in the Campus | Feeds the Baths of Agrippa, the Stagnum and the Euripus. Its surviving descendant feeds the later Trevi Fountain. |
| Aqua Alsietina | 2 BC | about 17 | from the NW into Trastevere | Non-potable. For the Naumachia Augusti and gardens. |
| Aqua Claudia | AD 38–52 | 63.8 (measured) | high arcades from the SE to Ad Spem Veterem | Highest quality after the Marcia. Supplies all 14 regions. |
| Anio Novus | AD 38–52 | 66.0 (measured) | stacked on the Claudia arcades | Highest channel. Very large volume. |
| **Aqua Traiana** | **AD 109 (brand new)** | about 72 | from Lake Bracciano along the Via Aurelia to the Janiculum crest | Drives the **Janiculum water-mills**. Supplies Trastevere and the Vatican. |

**Polylines** (`[x, z]`, real meters; C unless noted):

```
Arcus Neroniani (Aqua Claudia branch) + Palatine extension:    [[2552, 126], [2261, 327], [1890, 534], [1568, 586], [1250, 700], [947, 821], [854, 793], [841, 720], [760, 640], [640, 620], [520, 600], [428, 606], [330, 560]]
Aqua Claudia + Anio Novus trunk (arrival at Spes Vetus):       [[3600, 900], [3000, 500], [2552, 126]]
Aqua Marcia/Tepula/Julia trunk (approx.):                      [[3600, 600], [2900, 330], [2560, 140], [2475, -120], [2300, -380], [2146, -541], [1900, -720], [1500, -950]]
Aqua Julia branch to Esquiline castellum (approx.):            [[2475, -120], [2200, -280], [1891, -359], [1587, -328]]
Rivus Herculaneus (Marcia branch, approx.):                    [[2540, 160], [2200, 420], [1800, 640], [1400, 780], [1000, 900], [700, 950], [600, 920]]
Aqua Virgo:                                                    [[700, -2500], [300, -2050], [-100, -1650], [-56, -1114], [-150, -1000], [-297, -765], [-420, -640], [-560, -520], [-612, -482]]
Aqua Traiana:                                                  [[-3600, 300], [-2900, 420], [-2511, 427], [-2288, 516], [-1896, 457], [-1700, 450], [-1550, 460], [-1450, 500]]
Aqua Appia (underground):                                      [[2450, 250], [1800, 700], [1200, 900], [507, 955], [300, 820], [0, 760], [-200, 680], [-320, 575]]
Anio Vetus (underground):                                      [[2450, 150], [1900, -100], [1404, -354]]
```
- **Arcus Neroniani (Aqua Claudia branch) + Palatine extension**: On arches. Arch height above ground is about 10–18 m along the Caelian crest (ground 42–51 m) and 25–40 m where the Domitianic extension crosses the valley to the Palatine (ground 16–25 m). Points come from surviving remains on Via Statilia, Via di S. Stefano Rotondo, the Arch of Dolabella and Via di S. Gregorio (A for those segments). Channel about 60–62 m on the Caelian, falling to about 55 m at the Palatine. It ends at a castellum by the Temple of Claudius [760, 640], and Domitian's branch continues to the Palatine palaces.
- **Aqua Claudia + Anio Novus trunk (arrival at Spes Vetus)**: On the great arcade from the SE (ground about 45–48 m, channels at about 64/66 m, so arches stand about 18–22 m high). The **Porta Maggiore** double arch (AD 52; Vespasian and Titus restoration inscriptions) carries both channels over the Via Labicana and Via Praenestina.
- **Aqua Marcia/Tepula/Julia trunk (approx.)**: Three channels stacked on one arcade, arriving at Spes Vetus, then NW along the line of the later Aurelian Wall to the **Arch of Augustus** over the Via Tiburtina. From there they run to castella near the Porta Viminalis. The channel is 3–9 m above ground (ground 47–57 m). C/D west of the Arch of Augustus.
- **Aqua Julia branch to Esquiline castellum (approx.)**: Toward the castellum at the Esquiline crossroads (Piazza Vittorio). The visible "Trofei di Mario" nymphaeum there is Severan and does NOT exist in 113. D.
- **Rivus Herculaneus (Marcia branch, approx.)**: Frontinus: it runs along the Caelian and "ends above the Porta Capena". Underground or on low walls; the channel is at about 50–55 m. D for the line.
- **Aqua Virgo**: Underground under the Pincian, then emerges at the hill foot (the arches on Via del Nazareno survive, about [-56, -1114], A). Low arcades (2–6 m) run SW, cross the **Via Lata on the Arch of Claudius** (about [-297, -765]) and continue to the Saepta and the **Baths of Agrippa**. Channel at about 20 m.
- **Aqua Traiana**: Approaches along the Via Aurelia (remains in Villa Doria Pamphilj at [-2511, 427] and [-2288, 516], A). It ends on the Janiculum crest near the later Porta S. Pancrazio and S. Pietro in Montorio. **Mill-races** step down the E slope toward Trastevere (excavated under the American Academy).
- **Aqua Appia (underground)**: Runs 10–30 m below ground under the Caelian and Aventine. It surfaces only briefly on low arches by the **Porta Capena** (part of the "dripping gate") and ends at the **Salinae near the Porta Trigemina**.
- **Anio Vetus (underground)**: Underground from Spes Vetus to the Esquiline.

Spes Vetus / **Ad Spem Veterem** (about [2450..2560, 100..200]) is the hydraulic hub where most aqueducts converge (all except the Virgo, Alsietina and Traiana), with castella and settling tanks. It is outside the Servian Wall and has **no city wall in 113**. The bare countryside begins about 300–500 m further E.

## 10. The 14 Augustan regiones

- Augustus created the regiones in 7 BC. They are administrative and firefighting districts made up of about 265 *vici*, each with its own Lares Compitales shrine and *vicomagistri*.
- In 113 they extend **beyond the Servian Wall** out to the edge of continuous building. There is **no outer wall**: the Aurelian Wall comes 160 years later, and its line is used below only as an approximate edge.
- Polygons are **approximate (C/D, ±100–200 m)**. Boundaries are debated, so they are meant for procedural fill and quest geography, not as legal lines.
- The 4th-c. Regionary Catalogues list about **46,600 insulae (apartment units) and about 1,790 domus** for the whole city. The ratings below are relative.

| Region | Wealth 1–5 | Density 1–5 | Character for procedural fill | Feel |
|---|---|---|---|---|
| **I Porta Capena** | 3 | 2 | Suburban strip along the first mile of the Via Appia beyond the Porta Capena: tombs (the **Scipios**, about [1339, 1837]), the **Camenae** spring and grove, the Temple of Honos et Virtus, the Area Carruces (carriage and mule hire for travellers), inns, stables and warehouses. The Almo stream and the Temple of Mars lie just beyond the polygon. | travellers' quarter: inns, carters, tomb-builders and stonecutters, shrines |
| **II Caelimontium** | 4 | 3 | Aristocratic **domus** with gardens. **Temple of Divus Claudius**. **Macellum Magnum** (Nero). **Castra Peregrina** (frumentarii; probably by 113, C). **Castra Equitum Singularium** at the Lateran (Trajan's new horse guard; C). The Arcus Neroniani run along the crest. | quiet, wealthy, military camps at the E end |
| **III Isis et Serapis** | 3 | 4 | **Colosseum**, **Ludus Magnus** and the other gladiator schools (Dacicus, Gallicus, Matutinus), the **Baths of Titus** and the **Baths of Trajan** (109), the Porticus Liviae, a temple of Isis and Serapis (site unknown), the Summum Choragium (props store), and the **Castra Misenatium** (sailors who work the velarium). The Domus Aurea's Oppian wing lies buried under Trajan's baths. | entertainment and spectacle; insulae for staff and fans |
| **IV Templum Pacis** | 2 (Subura) / 4 (Carinae) | 5 | **Templum Pacis** (Vespasian's forum-museum). The **Subura** (the densest, noisiest tenements). The **Argiletum** booksellers. The **Carinae** (old aristocratic houses on the Oppian slope). The Velia with Nero's vestibule and the **Colossus**. The Horrea Piperataria (spice warehouses, about [316, 102]). The Tigillum Sororium. | slums plus elite pockets; markets, brothels, workshops |
| **V Esquiliae** | 4 (gardens) / 2 | 2–3 | **Horti Maecenatis** (Auditorium of Maecenas, [1405, -156]), the Horti Lamiani (imperial, about [1776, -106]), the Macellum Liviae, the agger promenade, the **Porta Esquilina**, aqueduct castella, **Ad Spem Veterem / Porta Maggiore**, and the Campus Esquilinus (executions and crosses outside the gate). | gardens, villas, a liminal "edge of the city" feel |
| **VI Alta Semita** | 4–5 | 3 | **Horti Sallustiani** (imperial gardens in the valley, [1039, -1715]), the Templum Gentis Flaviae, the Temples of **Quirinus** and **Salus**, aristocratic houses, the **Castra Praetoria** (Praetorian camp, 23 AD), and the **Porta Collina** with the Vestals' burial ground (Campus Sceleratus). | elite residential plus soldiers |
| **VII Via Lata** | 3 | 4 | The E Campus between the Via Lata and the Quirinal/Pincian: the Porticus Vipsania and **Campus Agrippae**, the Arch of Claudius (Virgo), the barracks of the **Cohors I Vigilum** (near SS. Apostoli, C), shops and insulae. The Horti Luculliani are on the Pincian brow. | commercial, porticoes, apartments |
| **VIII Forum Romanum** | 5 (public) | commercial | The civic heart: the **Forum**, Capitol temples, the **imperial fora** including **Trajan's new forum, Basilica Ulpia, libraries and Column (113)**, the basilicas, the Carcer, the Vicus Tuscus luxury shops, the Velabrum warehouses (Horrea Agrippiana) and the **Miliarium Aureum**. | monumental, crowded by day, patrolled |
| **IX Circus Flaminius** | 3–4 | 2–4 | The monumental W Campus: the **Pantheon** (burnt 110, rebuilding), the **Baths of Agrippa** and **Nero**, the **Saepta Iulia**, Diribitorium, Iseum Campense, the theatres of **Pompey, Balbus and Marcellus**, porticoes (Octavia, Philippus, Minucia, Pompey), the Circus Flaminius, the **Stadium and Odeum of Domitian**, the **Mausoleum of Augustus**, **Ara Pacis**, Horologium, Ustrinum, the Tarentum and Navalia(?). | leisure and monuments in the E; insulae in the river bend in the W |
| **X Palatium** | 5 | 1 | The **imperial palace** (Domus Flavia and Augustana; Domus Tiberiana), the **Temple of Apollo Palatinus**, the **Magna Mater**, Victoria, the **Casa Romuli**, the **Lupercal**, the Curiae Veteres, and the "stadium" garden. | palace, Praetorians on guard, slaves and freedmen of the household |
| **XI Circus Maximus** | 2–3 | 4 | The **Circus Maximus** (Trajan rebuilt and enlarged it after Domitian's fire, about 103, adding about 5,000 seats; Pliny, *Pan.* 51). The **Forum Boarium** (cattle), Ara Maxima of Hercules, Temples of **Portunus**, **Hercules Victor**, Fortuna and Mater Matuta, the Portus Tiberinus quays, the Cloaca Maxima outlet and the Salinae. | river port, markets, betting, taverns |
| **XII Piscina Publica** | 3 | 3 | The **Lesser Aventine** and the area toward the Via Appia and Via Ardeatina. The old Piscina Publica (a public pool) survives only as a name. Houses and gardens stand on the later site of the Baths of Caracalla. | mixed residential |
| **XIII Aventinus** | 4 (hilltop) / 1–2 (river) | 2 (hill) / 3–4 (Emporium) | Hilltop temples of **Diana**, **Juno Regina**, **Minerva**, **Libertas** and Bona Dea Subsaxana, and the Armilustrium. Trajan's **private house** (Privata Traiani, near S. Prisca, about [-210, 1104]). The **Thermae Surianae** of Licinius Sura (c. 100s). Below are the **Emporium**, **Porticus Aemilia**, **Horrea Galbana**, Lolliana and Seiana, and the growing **Monte Testaccio**. | plebeian dockworkers and grain-handlers below, aristocrats above |
| **XIV Transtiberim** | 1–3 (riverside) / 4–5 (garden villas) | 4–5 (riverside) / 1 (slopes) | Multi-ethnic port quarter (**Jews**, **Syrians**) with tanners, potters, millers and sailors. The **Naumachia Augusti** and **Naumachia Traiani** (109). The **Circus of Gaius and Nero** (Vatican). The **Horti Caesaris** (public park, Via Portuensis), **Horti Agrippinae** and **Horti Domitiae**. The **Janiculum mills** (Aqua Traiana). The Lucus Furrinae, the Temple of Fors Fortuna, Syrian sanctuaries, and the Castra Ravennatium (fleet). | immigrant and industrial; elite villas on the heights |

Polygons (`[x, z]`):
```
I Porta Capena:        [[507, 955], [700, 1000], [1000, 1150], [1181, 1133], [1300, 1400], [1500, 1775], [1421, 2111], [1054, 2137], [800, 1700], [600, 1350], [450, 1100]]
II Caelimontium:       [[480, 560], [560, 400], [700, 330], [1000, 350], [1300, 420], [1800, 500], [2014, 762], [1800, 850], [1500, 900], [1181, 1133], [1000, 1150], [700, 1000], [507, 955], [450, 800]]
III Isis et Serapis:   [[480, 140], [520, 30], [560, -150], [640, -330], [900, -260], [1100, -290], [1300, -330], [1350, 0], [1300, 420], [1000, 350], [700, 330], [560, 400], [480, 300]]
IV Templum Pacis:      [[330, 190], [250, 120], [180, -20], [210, -130], [280, -260], [200, -430], [560, -760], [800, -930], [976, -671], [715, -266], [640, -330], [560, -150], [520, 30], [480, 140]]
V Esquiliae:           [[976, -671], [1100, -830], [1440, -990], [1700, -950], [2146, -541], [2552, 126], [2300, 350], [1800, 500], [1300, 420], [1350, 0], [1300, -330], [1100, -290], [900, -260], [715, -266]]
VI Alta Semita:        [[200, -430], [100, -650], [0, -1000], [50, -1200], [350, -1300], [700, -1700], [1139, -2014], [1470, -1876], [1962, -1816], [2120, -1411], [1950, -1000], [1700, -950], [1440, -990], [1100, -830], [976, -671], [800, -930], [560, -760]]
VII Via Lata:          [[-110, -310], [-385, -1104], [-650, -2000], [-680, -2090], [-430, -1950], [-200, -1600], [-150, -1300], [50, -1200], [0, -1000], [100, -650], [200, -430], [-30, -420]]
VIII Forum Romanum:    [[-300, 170], [-280, -100], [-110, -310], [-30, -420], [200, -430], [280, -260], [210, -130], [180, -20], [250, 120], [330, 190], [150, 190], [0, 240], [-120, 330], [-230, 260]]
IX Circus Flaminius:   [[-110, -310], [-385, -1104], [-650, -2000], [-860, -2100], [-1000, -1900], [-830, -1500], [-950, -1190], [-1560, -1020], [-1725, -740], [-1560, -430], [-1042, 108], [-600, 170], [-420, 170], [-300, 170], [-280, -100]]
X Palatium:            [[-120, 330], [0, 240], [150, 190], [330, 190], [440, 260], [480, 300], [480, 560], [450, 620], [350, 660], [150, 640], [-30, 520]]
XI Circus Maximus:     [[-420, 170], [-300, 170], [-230, 260], [-120, 330], [-30, 520], [150, 640], [350, 660], [450, 620], [480, 560], [450, 800], [507, 955], [400, 960], [100, 870], [-150, 700], [-320, 575], [-400, 420]]
XII Piscina Publica:   [[507, 955], [450, 1100], [600, 1350], [800, 1700], [1054, 2137], [600, 2000], [150, 1830], [-100, 1600], [-60, 1350], [80, 1100], [300, 950], [400, 960]]
XIII Aventinus:        [[-320, 575], [-150, 700], [100, 870], [400, 960], [300, 950], [80, 1100], [-60, 1350], [-100, 1600], [150, 1830], [-244, 1761], [-578, 1987], [-1030, 2111], [-1166, 1852], [-1192, 1556], [-1053, 1295], [-652, 919], [-493, 725], [-413, 599]]
XIV Transtiberim:      [[-1450, -1300], [-1565, -1020], [-1725, -740], [-1560, -430], [-1042, 108], [-531, 310], [-394, 451], [-493, 725], [-652, 919], [-1053, 1295], [-1356, 1685], [-1700, 1500], [-2000, 800], [-2100, 0], [-2400, -500], [-3100, -700], [-3100, -1500], [-2500, -1800]]
```

Procedural-fill hints (C):

| Zone | Mix |
|---|---|
| Insula districts (Subura, Transtiberim riverside, Via Lata, Campus W bend, Emporium hinterland) | 4–6 storey insulae (Augustus capped them at 70 ft, Trajan at 60 ft, about 18 m) over **tabernae** shopfronts. Street widths 3–6 m. |
| Hill crests (Caelian, Aventine, Quirinal, Esquiline, Palatine edges) | Domus with atria and peristyles, 1–2 storeys plus gardens; blind street walls with a single doorway; more trees. |
| Garden belts (Pincian, Esquiline beyond the agger, Janiculum, Vatican) | Horti: walls, pavilions, groves, fountains, sparse building. |
| River edges | Horrea (warehouses with large courtyards), quays, cranes, boatyards. |

## 11. Neighbourhoods of note

| District | Location (centre / extent) | Ground (m) | Character and gameplay notes | Conf. |
|---|---|---|---|---|
| **Subura** | about [450, -280]; polygon in section 3 | 20–30 | The proverbially loud, crowded, dirty, dangerous valley. Juvenal and Martial complain of it. Shops, brothels, cookshops, workshops. **A fire wall** (the tufa wall behind the Forum of Augustus) shields the fora from it. | B |
| **Carinae** | Oppian W slope about [500..700, -150..100] | 25–45 | The "keels" quarter: old aristocratic houses (Pompey's house; later owned by Antony and the emperors), the Fagutal grove at the tip. | B/C |
| **Velabrum** | about [-70, 330] | 11–13 | Low passage between the Capitoline and Palatine: oil and food merchants, the Horrea Agrippiana, the Arcus Argentariorum (NOT yet built; 204). Legendary site of the twins' basket. | B |
| **Argiletum** | about [170, -90] | 14–16 | Booksellers and cobblers. Mostly absorbed into the Forum of Nerva. | B |
| **Vicus Tuscus** | about [40, 250] (Forum → Velabrum) | 13 | Luxury shops (silks, perfumes, incense). Also notorious. | B |
| **Forum Boarium / Portus Tiberinus** | about [-280, 380] | 9.5 | Cattle market, river port, the oldest cults (Hercules, Portunus), salt (Salinae). | A/B |
| **Emporium** | about [-850, 1250] | 9 | The grain and marble port: the Porticus Aemilia, the horrea Galbana, Lolliana and Seiana, the marble yards (*Marmorata*) and the amphora dump (Monte Testaccio). Dockers, porters (*saccarii*), guild halls. | B |
| **Campus Martius** | Regions VII and IX | 10–15 | Leisure: baths, theatres, porticoes, the Saepta (luxury shopping), athletics in the Stadium and the open Campus (gymnastics, riding, swimming in the Tiber). Floods. | A/B |
| **Transtiberim** | Region XIV | 10–20 | See section 10. The ferry and the bridges to the island. The Janiculum mills are brand new. | B |
| **Esquiline gardens** | about [1300..2500, -1200..200] | 50–58 | The Horti Maecenatis, Lamiani, Lolliani and Tauriani (C): pavilions and long walls. Witches (Canidia) and old graves in Horace's poems: **ambiguous-supernatural hook**. | B/C |
| **Aventine** | Region XIII | 40–47 crest | Historically plebeian (Temple of Ceres, Liber and Libera, the plebeian archive; site uncertain, near the Circus W end, C). By 113 it is increasingly upper-class: Trajan's own private house, Sura's baths. Mixed with dockers below. Outside the Republican pomerium until Claudius. | B |
| **Velia** | about [440, 170] | 28–31 | A Neronian ceremonial terrace with the **Colossus** (about 35 m bronze, now Sol). The Sacra Via crests here. | B/C |
| **Forum Holitorium** | about [-370, 120] | 11 | Vegetable market; three Republican temples in a row (S. Nicola in Carcere); the Theatre of Marcellus. | A/B |
| **Ad Spem Veterem** | about [2500, 150] | 47 | The aqueduct junction, gardens and the Sessorium area (the imperial villa there is mostly Severan, so in 113 it is gardens). | C |
| **Ager Vaticanus** | about [-2300, -1200] | 11–22 | Imperial gardens, the Circus of Gaius & Nero (where Christians died in 64), the Naumachia Traiani, tombs along the Via Cornelia and Via Triumphalis, potteries. | C |

## 12. Topographic anachronism watch-list (AD 113)

| Do NOT include (built later) | In 113 the site is instead… |
|---|---|
| Aurelian Wall and all its gates (270s): Porta del Popolo/Flaminia, Pia, Salaria, Pinciana, Tiburtina/S. Lorenzo, Maggiore *as a gate*, S. Giovanni/Asinaria, Metronia, Latina, Appia/S. Sebastiano, Ardeatina, Ostiensis/S. Paolo, Portuensis, Aurelia/S. Pancrazio, Settimiana | Open suburbs, garden walls, tombs along the roads; the customs line. The Pyramid of Cestius and the Castra Praetoria stand free. |
| Pons Aelius and Castel Sant'Angelo (130s) | Horti Domitiae (gardens) on the right bank |
| Temple of Venus and Roma (121–135) | Nero's vestibule terrace on the Velia with the **Colossus** |
| Hadrian's finished Pantheon (c. 125) | The Agrippan/Domitianic Pantheon **burned in 110**: a rebuilding site with scaffolding, and perhaps the new rotunda's foundations under way (brick stamps of the 110s; C) |
| Temple of Divus Traianus (after 117) | Trajan's Forum ends at the Column court and libraries |
| Arches of Septimius Severus (203), Argentarii (204), Constantine (315); Janus Quadrifrons (4th c.) | Open Forum corner; the Velabrum street; the Colosseum piazza |
| Septizodium (203); Severan palace substructures at the Palatine SE corner | Domitianic Palatine slope and aqueduct arches |
| Baths of Caracalla (212–216), Diocletian (298–306), Constantine | Houses and gardens (Caracalla site); Horti Sallustiani and insulae (Diocletian site) |
| Basilica of Maxentius (4th c.), "Temple of Romulus" | Horrea Piperataria and Sacra Via shops |
| Column of Marcus Aurelius (180–193), Temple of Hadrian/Matidia, Temple of Antoninus and Faustina (141) | Open Campus, porticoes, the Via Lata |
| Temple of Serapis on the Quirinal (Caracalla), "Trophies of Marius" nymphaeum (Alexander Severus), Minerva Medica nymphaeum (4th c.), Amphitheatrum Castrense / Sessorium (Severan) | Aqueduct castella, gardens |
| Aqua Alexandrina (226), the Aqua Antoniniana branch over the "Arch of Drusus" (Caracalla) | — |
| Christian churches and catacombs; Lateran basilica | Domus of the Laterani; the Castra Equitum Singularium |
| Modern Monte Testaccio at full height (mostly Severan) | A smaller, growing mound |
| Lungotevere embankment walls (1876–1926); Vittoriano (1911); Via dei Fori Imperiali (1932); Termini railway fill | Sloping banks and quays; the Capitoline's N spur and Aracoeli slope; **the intact Velia saddle**; the agger and gardens |
| Ponte Sisto, Ponte Garibaldi and all modern bridges | Pons Agrippae (near Sisto); no bridge at Garibaldi |

## 13. Method, sources and open questions

**Data pipeline.** The working files are in the session scratchpad (`…/scratchpad/topo/`) and were not committed.

1. OSM Overpass extracts of archaeological features, bridges, the river centerline and water polygon, streets and wall remains, converted to the frame.
2. The Aldrete fig. 1.6 contour map georeferenced to the OSM river by an ICP similarity fit, with contour bands solved by least squares.
3. TINITALY 1.1 (INGV) 10 m DTM tile w46075, less estimated fill, outside the Aldrete map.
4. Thin-plate residual correction to the curated control points.
5. Contouring with skimage, then shapely simplification.

**Main sources:**

- **G. S. Aldrete, *Floods of the Tiber in Ancient Rome* (2007).** Ch. 1: ground levels, fill depths and fig. 1.6 Augustan topography. Ch. 2: Tiber levels (Ripetta gauge). Ch. 5: quays, Cloaca Maxima and the Forum paving sequence. Full text at ostia-antica.org/fulltext/aldrete.
- **S. B. Platner & T. Ashby, *A Topographical Dictionary of Ancient Rome* (1929)**, on LacusCurtius: Capitolium/Arx, Palatinus, Caelius, Murus Servii Tullii, Porta Collina and others.
- **Wikipedia / Wikidata:** hill elevations (P2044), bridges, Servian Wall, Porta Collina coordinates, Tiber Island, Pons Agrippae and Pons Neronianus.
- **F. Coarelli, *Rome and Environs: An Archaeological Guide* (2007); L. Richardson Jr., *A New Topographical Dictionary* (1992):** general identifications (Petronia Amnis, gates, regions).
- **Aqueduct elevations:** Frontinus, *De Aquaeductu*; H. B. Evans, *Water Distribution in Ancient Rome* (1994); P. Aicher, *Guide to the Aqueducts of Ancient Rome* (1995); a recent survey of the Claudia and Anio Novus channels at Porta Maggiore (63.83 and 65.95 m) via ResearchGate, "The Distribution of Aqua Claudia and Anio Novus in Rome".
- **OpenStreetMap contributors (ODbL)** for all modern geometry. **INGV TINITALY 1.1** (CC BY 4.0). Copernicus GLO-30 for cross-checks only.

**Open questions and flags:**

1. Positions of the less-known Servian gates: Ratumena, Salutaris, Quirinalis, Querquetulana, Naevia (D).
2. The Pons Sublicius site (D).
3. The prow or stern label at the island's downstream end (D).
4. Monte Testaccio height in 113 (D).
5. Exact Asylum and Velia levels (C).
6. The Navalia location (D).
7. The inner courses of the Via Labicana and Via Tiburtina (C).
8. The precise Marcia/Tepula/Julia line W of the Arch of Augustus (C/D).
9. The Theatre of Marcellus and Theatre of Pompey orchestra centres (C).
10. The DEM inherits Aldrete's 5 m contour quantisation. In the Forum zone the raw map was text-cluttered, so the curated control points override it. Trust 4.2 over 4.3 and 4.4 wherever they disagree.

## Appendix A: data shaped for `TerrainSource` (`src/world/terrain/heightmap.ts`)

Ready-to-paste literals in **real meters / m ASL**.

- `slope` is the horizontal fall-off distance in meters from the plateau edge to the valley floor, matching how `makeNaturalElevation` uses it.
- `cliffs` lists near-vertical segments.
- Where hill outlines abut along † edges (section 2.2), they deliberately overlap or touch so the `max()` blend makes one continuous plateau.
- **The section 4 grids are the fuller alternative.** You can also sample them as a base and use this appendix only for crisp edges.

```ts
export const BASE_ELEVATION = 13;
export const bounds = { minX: -4600, maxX: 4600, minZ: -5000, maxZ: 3600 };
export const HILLS = [
  { id: 'capitolium', summit: 46, plateau: 40, slope: 60, cliffs: [{ a: [-250, 120], b: [-170, 140] }, { a: [-250, 45], b: [-250, 120] }, { a: [-115, 50], b: [-130, 95] }],
    outline: [[-250, 120], [-240, 135], [-220, 140], [-180, 135], [-160, 125], [-125, 90], [-115, 50], [-120, 30], [-145, 35], [-170, 15], [-190, 10], [-240, 25], [-250, 45]] },
  { id: 'arx', summit: 48, plateau: 40, slope: 60, cliffs: [{ a: [-140, -160], b: [-60, -215] }],
    outline: [[-35, -180], [-60, -215], [-90, -220], [-120, -205], [-130, -195], [-140, -160], [-130, -140], [-90, -95], [-80, -90], [-60, -105], [-45, -120]] },
  { id: 'palatine', summit: 51, plateau: 40, slope: 70, cliffs: [{ a: [30, 350], b: [70, 460] }, { a: [110, 490], b: [310, 540] }, { a: [55, 270], b: [170, 210] }],
    outline: [[55, 270], [30, 350], [70, 460], [110, 490], [200, 505], [280, 540], [310, 540], [380, 490], [390, 420], [430, 335], [425, 280], [410, 270], [340, 260], [300, 240], [170, 210], [90, 240]] },
  { id: 'velia', summit: 30, plateau: 28, slope: 60,
    outline: [[300, 200], [350, 160], [470, 120], [560, 60], [610, 110], [530, 200], [420, 245], [330, 250]] },
  { id: 'aventine', summit: 46, plateau: 36, slope: 110, cliffs: [{ a: [-560, 1030], b: [-390, 835] }, { a: [-390, 835], b: [-290, 750] }],
    outline: [[-550, 1180], [-470, 1235], [-285, 1140], [-265, 1200], [-200, 1265], [-170, 1270], [5, 1080], [30, 1010], [25, 960], [-10, 910], [-170, 845], [-235, 770], [-290, 750], [-390, 835], [-560, 1030]] },
  { id: 'aventine-minor', summit: 40, plateau: 33, slope: 100,
    outline: [[-90, 1570], [-70, 1645], [40, 1755], [475, 1900], [510, 1890], [605, 1660], [560, 1490], [485, 1380], [470, 1260], [380, 1175], [250, 1185], [145, 1250], [75, 1255], [-60, 1375], [-15, 1420]] },
  { id: 'caelian', summit: 49, plateau: 40, slope: 130,
    outline: [[640, 475], [630, 860], [910, 1010], [1455, 735], [1835, 1200], [2165, 1200], [2340, 1075], [2700, 1015], [2700, 350], [2000, 450], [1580, 365], [1485, 510], [1160, 460], [905, 555], [730, 435]] },
  { id: 'oppius', summit: 51, plateau: 45, slope: 130,
    outline: [[660, -120], [675, -20], [740, 35], [790, 30], [890, 70], [900, 25], [925, 15], [1000, 80], [1090, 80], [1085, 140], [1300, 245], [1300, -330], [1110, -290], [980, -180], [830, -150], [720, -155]] },
  { id: 'cispius', summit: 56, plateau: 48, slope: 120,
    outline: [[915, -350], [920, -340], [940, -330], [1120, -310], [1145, -300], [1300, -330], [1500, -330], [1500, -900], [1450, -900], [1150, -760], [1025, -720], [1045, -670], [1045, -640], [945, -440]] },
  { id: 'esquiline-plateau', summit: 57, plateau: 50, slope: 200,
    outline: [[1300, -130], [1470, -155], [1530, 20], [1595, 70], [1995, 10], [2170, 250], [2515, 250], [2345, -285], [2400, -700], [2485, -950], [2395, -1085], [2375, -1200], [1450, -1200], [1500, -900], [1500, -330], [1300, -330]] },
  { id: 'viminal', summit: 56, plateau: 45, slope: 110,
    outline: [[200, -430], [320, -360], [395, -380], [420, -510], [465, -590], [530, -480], [715, -435], [950, -700], [1450, -900], [1450, -1200], [1200, -1350], [790, -915], [690, -850], [655, -795], [620, -805], [560, -760]] },
  { id: 'quirinal', summit: 58, plateau: 45, slope: 120, cliffs: [{ a: [95, -910], b: [115, -650] }, { a: [115, -650], b: [200, -430] }],
    outline: [[95, -910], [175, -800], [115, -650], [200, -430], [620, -805], [690, -965], [805, -1025], [800, -930], [1000, -1110], [1200, -1350], [1350, -1700], [1100, -1900], [890, -1690], [840, -1400], [440, -1095], [120, -995]] },
  { id: 'pincian', summit: 58, plateau: 45, slope: 170, cliffs: [{ a: [-460, -1950], b: [20, -1330] }],
    outline: [[-650, -2700], [-630, -2420], [-320, -2300], [-465, -2110], [-460, -1950], [20, -1330], [325, -1380], [560, -1985], [790, -1925], [890, -1690], [1100, -1900], [1100, -2700], [180, -2700], [15, -2500]] },
  { id: 'janiculum', summit: 82, plateau: 60, slope: 300, cliffs: [{ a: [-2055, -210], b: [-1535, 450] }],
    outline: [[-2700, -30], [-2675, 1360], [-2440, 1415], [-2380, 1760], [-2265, 1705], [-2165, 1325], [-1670, 1400], [-1610, 1135], [-1710, 740], [-1535, 450], [-2055, -210], [-2130, -210], [-2135, -35], [-2230, 10], [-2500, -280], [-2625, -230]] },
  { id: 'vatican', summit: 68, plateau: 45, slope: 250,
    outline: [[-3700, -910], [-3700, -500], [-3045, -500], [-2850, -1180], [-2990, -1445], [-3080, -1535], [-3155, -1805], [-3135, -1870], [-2995, -2000], [-3700, -2000], [-3700, -1125], [-3530, -1045], [-3490, -975], [-3510, -910], [-3585, -855], [-3655, -860]] },
];
export const LOWLANDS = [
  { id: 'forum-romanum', elevation: 13, polygon: [[-30, -40], [60, -75], [150, -40], [250, 40], [330, 150], [250, 180], [150, 150], [60, 150], [0, 90], [-40, 40]] },
  { id: 'velabrum', elevation: 12, polygon: [[-130, 230], [-20, 230], [40, 330], [-30, 470], [-150, 470], [-200, 350]] },
  { id: 'forum-boarium', elevation: 9.5, polygon: [[-430, 200], [-260, 220], [-150, 380], [-170, 520], [-330, 560], [-420, 430], [-440, 300]] },
  { id: 'forum-holitorium', elevation: 11, polygon: [[-470, 60], [-300, 60], [-250, 180], [-430, 200]] },
  { id: 'vallis-murcia', elevation: 12, polygon: [[-220, 688], [-130, 532], [410, 847], [320, 1003]] },
  { id: 'colosseum-valley', elevation: 19, polygon: [[440, 260], [450, 170], [560, 120], [760, 150], [850, 250], [800, 380], [600, 420], [480, 380]] },
  { id: 'subura', elevation: 22, polygon: [[200, -200], [330, -130], [520, -200], [700, -260], [760, -380], [900, -620], [820, -660], [640, -450], [520, -560], [380, -480], [250, -360]] },
  { id: 'argiletum', elevation: 15, polygon: [[70, -60], [100, -30], [180, -80], [260, -130], [220, -180], [140, -120]] },
  { id: 'trajan-forum', elevation: 17.5, polygon: [[-60, -430], [90, -470], [200, -330], [150, -230], [20, -200], [-80, -290]] },
  { id: 'campus-martius-central', elevation: 11, polygon: [[-1000, -600], [-900, -800], [-550, -800], [-450, -500], [-600, -280], [-900, -350]] },
  { id: 'campus-martius', elevation: 12.5, polygon: [[-110, -310], [-385, -1104], [-650, -2000], [-860, -2100], [-1000, -1900], [-830, -1500], [-950, -1190], [-1560, -1020], [-1725, -740], [-1560, -430], [-1042, 108], [-600, 170], [-300, 170], [-280, -100]] },
  { id: 'transtiberim', elevation: 12, polygon: [[-1042, 108], [-531, 310], [-394, 451], [-493, 725], [-652, 919], [-1000, 1250], [-1300, 1100], [-1450, 600], [-1420, 300], [-1450, 0], [-1560, -430]] },
  { id: 'emporium', elevation: 9, polygon: [[-652, 919], [-1053, 1295], [-1192, 1556], [-1166, 1852], [-1030, 2111], [-578, 1987], [-300, 1760], [-450, 1500], [-600, 1150]] },
  { id: 'ager-vaticanus', elevation: 11.5, polygon: [[-2600, -2300], [-1450, -2300], [-1450, -1300], [-1700, -940], [-2250, -900], [-2600, -1000]] },
];
export const RIVERS = [
  { id: 'tiber', waterLevel: 6, bankHeight: 10.5,
    centerline: [[-1444, -4764], [-1692, -4597], [-1834, -4457], [-1922, -4335], [-2028, -4110], [-2060, -3863], [-1994, -3624], [-1833, -3434], [-1755, -3371], [-1664, -3330], [-1328, -3231], [-1248, -3172], [-1192, -3090], [-1127, -2902], [-1143, -2603], [-1119, -2354], [-1002, -1920], [-885, -1700], [-833, -1561], [-831, -1411], [-864, -1317], [-950, -1194], [-1031, -1137], [-1170, -1080], [-1565, -1020], [-1608, -995], [-1683, -930], [-1726, -840], [-1725, -741], [-1708, -694], [-1560, -433], [-1042, 108], [-531, 310], [-394, 451], [-413, 599], [-493, 725], [-652, 919], [-1053, 1295], [-1138, 1417], [-1192, 1556], [-1198, 1705], [-1166, 1852], [-908, 2609], [-844, 2744], [-681, 2933], [-611, 3063], [-591, 3211], [-627, 3303], [-693, 3378]],
    width: [105, 80, 80, 80, 80, 80, 75, 75, 75, 80, 80, 75, 70, 75, 70, 80, 80, 85, 90, 90, 80, 75, 80, 80, 95, 90, 90, 90, 85, 85, 80, 80, 190, 80, 75, 75, 70, 65, 65, 65, 55, 55, 65, 60, 60, 60, 55, 55, 55] },
];
export const ISLANDS = [
  { id: 'insula-tiberina', elevation: 11, outline: [[-685, 180], [-660, 221], [-593, 248], [-590, 267], [-575, 271], [-563, 261], [-507, 294], [-489, 297], [-443, 328], [-431, 329], [-421, 321], [-421, 306], [-457, 242], [-485, 213], [-565, 158], [-612, 142], [-660, 139]] },
];
export const ROADS = [
  { id: 'via-sacra', width: 7, points: [[520, 290], [505, 269], [343, 209], [348, 188], [295, 131], [197, 82], [67, -4]] },
  { id: 'via-nova', width: 4.5, points: [[328, 226], [135, 142], [60, 215], [-20, 250]] },
  { id: 'clivus-capitolinus', width: 4.5, points: [[6, 2], [-1, -10], [-20, -9], [-56, 34], [-97, 66], [-185, 40]] },
  { id: 'clivus-palatinus', width: 6, points: [[343, 209], [308, 271], [290, 267], [289, 245], [215, 330]] },
  { id: 'clivus-victoriae', width: 4, points: [[-10, 250], [130, 177], [189, 197], [211, 221], [236, 234]] },
  { id: 'vicus-tuscus', width: 5, points: [[97, 62], [66, 131], [45, 140], [-45, 311], [-73, 452], [-150, 560]] },
  { id: 'vicus-iugarius', width: 5, points: [[-5, 18], [-28, 51], [-134, 135], [-205, 167], [-330, 190]] },
  { id: 'argiletum', width: 5.5, points: [[69, -3], [107, -42], [174, -73], [255, -125], [414, -173], [533, -219]] },
  { id: 'clivus-suburanus', width: 5.5, points: [[533, -218], [686, -255], [797, -252], [807, -234], [838, -227], [947, -227], [1035, -258], [1102, -301], [1270, -372], [1407, -354]] },
  { id: 'vicus-longus', width: 5, points: [[218, -452], [899, -1045], [1010, -1110]] },
  { id: 'vicus-patricius', width: 5.5, points: [[715, -266], [976, -671], [1100, -830], [1300, -930], [1440, -990]] },
  { id: 'alta-semita', width: 6, points: [[199, -427], [180, -700], [340, -865], [800, -1300], [1066, -1536], [1188, -1632]] },
  { id: 'clivus-argentarius', width: 4.5, points: [[-20, -40], [-45, -110], [-60, -180], [-80, -250], [-110, -310]] },
  { id: 'via-lata-via-flaminia', width: 10, points: [[-110, -310], [-189, -478], [-292, -829], [-385, -1104], [-859, -2639], [-962, -2946], [-1300, -4056], [-1327, -4148], [-1430, -4700]] },
  { id: 'via-recta', width: 6, points: [[-1386, -881], [-985, -869], [-788, -880], [-649, -875], [-380, -880]] },
  { id: 'via-appia', width: 8, points: [[507, 955], [620, 1110], [891, 1361], [990, 1455], [1246, 1729], [1354, 1913], [1421, 2111], [1463, 2263], [1467, 2510], [1548, 2834], [1742, 2982], [2302, 3640]] },
  { id: 'via-latina', width: 7, points: [[990, 1455], [998, 1466], [1117, 1528], [1438, 1741], [1600, 1830], [2199, 2067]] },
  { id: 'via-labicana-praenestina', width: 6, points: [[1407, -354], [1600, -280], [2086, -69], [2100, -63], [2107, -73], [2457, 78], [2552, 126]] },
  { id: 'via-tiburtina', width: 6, points: [[1407, -354], [1950, -520], [2146, -541], [2400, -600]] },
  { id: 'via-nomentana', width: 6, points: [[1188, -1632], [1403, -1850], [1640, -2059], [1655, -2063], [2692, -3006], [2713, -3032], [2792, -3190], [2989, -3419], [3104, -3568]] },
  { id: 'via-salaria', width: 6, points: [[1188, -1632], [1196, -1657], [1139, -2014], [1150, -2300]] },
  { id: 'via-ostiensis', width: 6, points: [[-320, 560], [-520, 900], [-610, 1100], [-621, 1193], [-408, 1603], [-298, 1714], [-291, 1732], [-244, 1761], [-330, 2000]] },
  { id: 'clivus-publicius', width: 4, points: [[-177, 595], [-172, 632], [-117, 731], [-130, 772], [-163, 806], [-115, 947]] },
  { id: 'vicus-armilustri', width: 4, points: [[-340, 913], [-254, 827], [-163, 806], [-120, 950], [-46, 1129]] },
  { id: 'clivus-scauri', width: 4, points: [[521, 676], [664, 698]] },
  { id: 'road-between-palatine-and-caelian', width: 8, points: [[414, 809], [490, 459], [501, 432]] },
  { id: 'via-aurelia', width: 6, points: [[-490, 370], [-702, 361], [-843, 344], [-1166, 333], [-1350, 420], [-1512, 545], [-1700, 520], [-1896, 457], [-2148, 555], [-2229, 578], [-2295, 555], [-2424, 446], [-2579, 399], [-2809, 412], [-3033, 392], [-3649, 369], [-3846, 342], [-4000, 290]] },
  { id: 'via-portuensis', width: 6, points: [[-490, 370], [-640, 620], [-875, 978], [-1183, 1313], [-1298, 1520], [-1356, 1685]] },
  { id: 'trastevere-vatican-riverside-road', width: 5, points: [[-1390, 37], [-1466, -126], [-1754, -622], [-1790, -820], [-1705, -950]] },
  { id: 'via-triumphalis', width: 5, points: [[-1705, -950], [-1900, -1150], [-2150, -1500], [-2500, -2200], [-2913, -2833]] },
  { id: 'via-cornelia', width: 5, points: [[-1705, -950], [-2100, -1000], [-2541, -1000], [-3600, -1100]] },
];
```

Notes on the river literal:

- `width[32] = 190` spans both branches **plus the island**. The `ISLANDS` entry raises the island back out of the water.
- For a quick look at the channel, keep the `heightmap.ts` default bed at waterLevel − 4. The real centre is deeper, about 0–2 m ASL.

*End of file. Compiled 2026-10-03 for the SKYROME team. Corrections are welcome: update section 4.2 first, because everything else derives from it.*

