# Landmarks: the Forum of Trajan complex

The newest and grandest complex in Rome in May 113: the forum (dedicated 1 Jan 112), the Basilica
Ulpia, the Column (dedicated 12 May 113, the day after the game starts) between the twin libraries,
and the brick Markets cut into the Quirinal. The square is being made ready for tomorrow's
dedication.

Open `?scene=landmark&id=forum-trajan&ids=forum-trajan-gateway,equus-traiani,basilica-ulpia,column-trajan,bibliotheca-ulpia-east,bibliotheca-ulpia-west,markets-trajan`
for the whole complex, or `?scene=rome&at=forum-trajan` in context.

## Files (`src/world/landmarks/builders/`)

| File | Contents |
| --- | --- |
| `trajan-layout.ts` | The shared **forum frame** and plan (`PLAN`), frame conversions (`forumToLocal`, `uvToLocal`…), stair and colonnade helpers, and `TRAJAN_INSCRIPTIONS`: the Latin, English and source of every readable text, keyed by spot id. |
| `trajan-forum.ts` | `forum-trajan`: square, porticoes, attics, exedrae, SE wall, statues, festival. |
| `trajan-gateway.ts` | `forum-trajan-gateway` (arch with the six-horse chariot) and `equus-traiani`. |
| `trajan-basilica.ts` | `basilica-ulpia`: hall, porches, interior, apses, gilded roofs. |
| `trajan-column.ts` | `column-trajan` (column, pedestal, court, viewing gallery) and both `bibliotheca-ulpia-*`. |
| `trajan-markets.ts` | `markets-trajan`: ring street, Great Hemicycle, upper street, stair, Great Hall, back blocks. |
| `trajan-kit.ts` | `LodChunks` (near/far THREE.LOD cells), `midColumn` (≈ 950-triangle Corinthian for colonnades), `farColumn` (≈ 40), arc walls/floors/colliders, `facing()` (polygons wound to face a given way). |
| `trajan-sculpture.ts` | Dacian captives, horses and chariot teams (biga…seiugis), Victory, trophies, standards, eagles, shield portraits, distant figure blocks. |
| `trajan-materials.ts` | Grey granite, cipollino, opus sectile, white slab paving, coffers, gilded bronze tiles, library floors, pavonazzetto, scroll cupboards, the Dacian-arms relief. All procedural `DataTexture`s, one shared material each. |
| `trajan-props.ts` | Statue bases, garlands, grandstands, the tribunal with its awning, altar, tripods, banners, ladders, work clutter, carpet. |

## The forum frame

All the buildings sit on one axis (bearing 140/320). Builders design in the frame of the
`forum-trajan` landmark (`x = u·0.6` across the axis, + towards the SW hemicycle; `z = −v·0.6`,
+ towards the basilica, NW) and map it into their own landmark frame with `forumToLocal(lm)`.
Where the atlas centres sit a metre or two off the axis, the plan wins.

Key plan values (game metres, forum frame): square paving `|x| < 25.8`, `−37.5 < z < 37.8`;
portico columns `x = ±27.8`; back walls `±35.1…36.0`; exedrae centred at `(±35.55, 6.0)`,
radius 12.6; gateway at `z = −38`; equus at `z = −7.6`; basilica `37.8 < z < 72.9`, `|x| < 35.1`
plus apses; Column at `z = 80`; court `|x| < 7.1`; libraries `7.1 < |x| < 18.8`.
The Markets' hemicycle is concentric with the NE exedra (facade at radius 17.7).

## What is where

- **Forum.** White Luna slabs; three giallo steps up to each lateral portico; 30 pavonazzetto
  Corinthian columns a side; attic with a Dacian captive over every column and shield portraits
  between; gilded horses and standards along the roof; EX MANVBIIS in bronze letters; coffered
  ceilings; exedrae with a giallo column screen, statue niches and benches (lecture spots);
  honorific bronzes on inscribed bases (Sosius Senecio, Cornelius Palma: reconstructions).
  Festival: garland on every bay, two timber grandstands (side stairs of 0.2 m), the tribunal with
  awning and curule seats, altar, tripods, carpet, banners, ladders, crates and a hand-cart.
- **Gateway.** Composite single arch with bronze-letter dedication, six-horse gilded chariot,
  Victories and trophies; wings with columned niches and statues.
- **Equus Traiani.** Gilded horseman (≈ 2.4 × life) facing the entrance on a moulded base with the
  dedication, Dacian-arms reliefs and a garland; two walkable steps.
- **Basilica Ulpia.** Steps and three porches of giallo columns (10 in the centre), attics with
  Dacians, quadriga with Victories and statues of Trajan, bigae, the legions' frieze and attic
  legend. Inside: 94 columns in two rings (granite nave ring, giallo outer ring; the axis and the
  side doors open between columns), cipollino gallery order, clerestory, gilded coffered ceiling,
  two judges' tribunals with benches, scribes' tables, the NE apse as the Atrium Libertatis
  (praetor's tribunal, statue). Gilded bronze tiles on every roof. Back door to the Column court.
- **Column and court.** Pedestal with Dacian arms, eagles and garland, bronze door (2.25 m: the
  pedestal is drawn a little taller than 0.6 × 5.3 m so the door is walkable), CIL VI 960 between
  Victories; laurel torus, 23-turn frieze, Doric capital with railing, gilded statue (≈ 25 m in
  all). The court has an altar and tripods for the dedication, the carvers' last scaffold, and a
  two-storey NW colonnade whose upper gallery (stair of 24 × 0.197 m risers) is the viewing gallery.
- **Libraries.** Porch of six pavonazzetto columns; hall with scroll cupboards in niches on two
  levels behind a gallery on columns, the emperor's statue in the end niche, reading tables and
  scroll baskets. Labelled Greek (NE) and Latin (SW): which was which is unknown.
- **Markets.** Ring street (basalt, kerb, Lares shrine, benches); 11 stocked tabernae with
  travertine frames and mezzanine windows; second storey of arched windows, brick pilasters and
  alternating triangular/segmental pediments; set-back third storey. A stair street (42 × 0.2 m)
  at the south end climbs to the upper street (y = 8.4 m), concentric with the hemicycle, with
  shops on both sides (two storeys outside). Its north end leads into the Great Hall: six groin
  vaults on travertine corbels, rooms on two levels, the weights-and-measures table. Brick blocks
  climb behind, with window grids on the outer faces.

## Spots (for gameplay; ids are stable)

Kinds used: inscription, vista, shrine, container, door, npc, vendor, spawn, sit, stall. Texts
for every inscription spot are in `TRAJAN_INSCRIPTIONS` (the `-ne`/`-sw` variants share one).

- forum-trajan: `forum-ex-manubiis-ne/-sw`, `forum-statue-senecio`, `forum-statue-palma`,
  `forum-tribunal-consul/-praetor/-herald`, `forum-altar` (shrine), `forum-vendor-garlands/-incense`,
  `forum-guard-gatene/-gatesw`, `forum-portico-{ne,sw}-stall0/1`, `forum-stand{ne,sw}-seat*`,
  `forum-exedra{ne,sw}-bench0…4`, `forum-exedra{ne,sw}-teacher`, `forum-work-chest` (container),
  `forum-spawn-gateway`, `forum-vista-square`.
- forum-trajan-gateway: `forum-gateway-inscription`, `forum-gateway-passage` (spawn), guards.
- equus-traiani: `equus-inscription`, `equus-orator`, `equus-vista`.
- basilica-ulpia: `basilica-attic-inscription`, `basilica-frieze-legions`, `basilica-court{ne,sw}-judge/-assessor/-clerk/-advocate/-bench0…2`,
  `basilica-scribe0…3` (stall), `basilica-libertatis-praetor/-lictor`, `basilica-libertatis-manumission` (shrine),
  `basilica-door-court`, `basilica-spawn-nave`, `basilica-vista-nave`.
- column-trajan: `column-door` (the inner stair: a v0.2 dungeon), `column-inscription`,
  `column-vista-gallery`, `column-gallery-stair` (door), `column-altar`, `column-priest`, `column-guard`, `column-carver`.
- libraries: `library-{east,west}-label`, `-librarian`, `-entrance`, `-reader0…3`, `-cupboard*` (containers).
- markets-trajan: `markets-taberna0…10-vendor/-stall`, `markets-upper-inner*-stall`, `markets-upper-outer*-stall/-vendor`,
  `markets-taberna-strongbox`, `markets-lares-shrine`, `markets-sign-wine`, `markets-mensa-ponderaria`,
  `markets-street-bench1/6`, `markets-spawn-street`, `markets-hall-entrance`, `markets-hall-clerk`,
  `markets-hall-office*` (stall), `markets-stair-foot` (door), `markets-vista-landing`.

## Walkability

Box and cylinder colliders only. Every flight uses risers ≤ 0.2 m and treads ≥ 0.3 m (portico
and basilica steps 0.18 m). `tests/trajan.test.ts` walks the main routes over the colliders
(square → portico → exedra, gateway, basilica front and side porches, back door → court, both
libraries, the gallery stair, the markets stair, a taberna) and checks the step height and
headroom; the same routes were walked with the real character controller in the browser.

## Performance

Long colonnades, attic figures, interiors and statue groups sit in `LodChunks` (near ≤ 35–70 m,
far = 40-triangle columns and block figures; interiors hide beyond 150–260 m and cast no sun
shadows). Big landmarks also have a cheap `far` stand-in beyond their cull distance.

| Landmark | high, every chunk near | low | draw calls |
| --- | ---: | ---: | ---: |
| forum-trajan | 220k | 174k | 66 |
| basilica-ulpia | 240k | 171k | 81 |
| forum-trajan-gateway | 94k | 30k | 8 |
| markets-trajan | 87k | 24k | 93 |
| column-trajan | 44k | 19k | 21 |
| libraries (each) | 25k | 15k | 24 |
| equus-traiani | 15k | 5k | 7 |

In `?scene=rome&at=forum-trajan` the complex adds about 0.75M rendered triangles (shadow pass
included) and ~300 draw calls to the frame; the whole view runs at 60 fps on an M4 Max in
Chromium and WebKit.

## Known limits / next steps

- Upper galleries of the basilica and libraries, the hemicycle's second storey and the markets'
  back blocks are not enterable (no stairs); the column's inner stair is the v0.2 dungeon.
- The forum and basilica exceed the 150k "hero" guideline when every chunk is near (about 230k):
  instancing the colonnade columns (one `InstancedMesh` per column type) would be the next win.
- The atlas `via-biberatica` polyline lies 15–35 m further NE than the upper street built here
  (concentric with the hemicycle, as on plans of the Markets); the city fabric should not draw a
  ground-level street along it inside the Markets' block.
- The atlas pad flattens the Markets' rectangle to 17.5 m; the building is a solid stack on it and
  the hill rises behind its back wall.
