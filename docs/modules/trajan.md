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
| `trajan-kit.ts` | `LodChunks` (near/far THREE.LOD cells; each level is re-origined by offsetting its group, never by translating geometry, because the kit's instanced columns share one geometry program-wide), `midColumn` (≈ 950-triangle Corinthian for colonnades), `farColumn` (≈ 40), arc walls/floors/colliders, `coneRoof()` (half-cone roofs wound to face up), `beam()`, `facing()` (polygons wound to face a given way). |
| `trajan-sculpture.ts` | Dacian captives, horses and chariot teams (biga…seiugis), Victory, trophies, standards, eagles, shield portraits, distant figure blocks. |
| `trajan-materials.ts` | Grey granite, cipollino, opus sectile, white slab paving, coffers, gilded bronze tiles, library floors, pavonazzetto, scroll cupboards, the Dacian-arms relief, peperino ashlar (the enclosure walls). All procedural `DataTexture`s, one shared material each. |
| `trajan-props.ts` | Statue bases, garlands, grandstands, the tribunal with its awning, altar, tripods, banners, ladders, work clutter, carpet; flames, bronze candelabra, torch poles and the festival vendors' stalls. |
| `trajan-lights.ts` | `Lamps`: the complex's lamps and fires, queued per landmark and requested from the light pool (`game.lights`) once the sky has installed it. Presets per kind (torch, candelabrum, brazier, altar, lamp, shrine, interior). |
| `trajan-facades.ts` | `brickFront()`: brick street fronts on the city-fabric wall helpers (tabernae with travertine frames, most shuttered at dawn, mezzanine grilles, arched windows, pilasters, string courses, cornice, optional torches and shop lamps). |
| `trajan-equus.ts` | `equusStatue()`: the lofted gilded horseman of the Equus Traiani (horse walking, right foreleg raised; Trajan in cuirass and paludamentum, adlocutio). |

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
  ceilings; exedrae with a giallo column screen, statue niches and benches (lecture spots), roofed
  with half-cones of tiles over coffered ceilings, a gable over each mouth; enclosure walls in
  peperino ashlar with a travertine string course; honorific bronzes on inscribed bases (Sosius
  Senecio, Cornelius Palma: reconstructions).
  Festival: garland on every bay, two timber grandstands (side stairs of 0.2 m), the tribunal with
  awning and curule seats, altar, tripods, carpet, banners, bronze candelabra lining the
  processional way, torches at the tribunal, a garland seller's and an incense seller's stall
  inside the gateway, braziers at the opening, ladders, crates and a hand-cart.
- **Gateway.** Composite single arch with bronze-letter dedication, six-horse gilded chariot,
  Victories and trophies; wings with columned niches and statues; the guards' braziers outside.
- **Equus Traiani.** A lofted gilded horseman (≈ 2.2 × life) facing the entrance on a moulded base
  with the dedication, Dacian-arms reliefs and a garland; two walkable steps; incense tripods in
  front.
- **Basilica Ulpia.** Steps and three porches of giallo columns (10 in the centre), attics with
  Dacians, quadriga with Victories and statues of Trajan, bigae, the legions' frieze and attic
  legend. Inside: 94 columns in two rings (granite nave ring, giallo outer ring; the axis and the
  side doors open between columns), cipollino gallery order, clerestory, gilded coffered ceiling,
  two judges' tribunals with benches, scribes' tables, candelabra, the NE apse as the Atrium
  Libertatis (praetor's tribunal, statue). Gilded bronze tiles on every roof, the apses' half-cones
  included. Back door to the Column court.
- **Column and court.** Pedestal with Dacian arms, eagles and garland, bronze door (2.25 m: the
  pedestal is drawn a little taller than 0.6 × 5.3 m so the door is walkable) with a torch either
  side, CIL VI 960 between Victories; laurel torus, 23-turn frieze, Doric capital with railing,
  gilded statue (≈ 25 m in all). The court has an altar and tripods burning for the dedication, the
  carvers' last scaffold, and a two-storey NW colonnade whose upper gallery (stair of 24 × 0.197 m
  risers) is the viewing gallery; its outer face has pilasters, a cornice and a framed door.
- **Libraries.** Porch of six pavonazzetto columns; hall with scroll cupboards in niches on two
  levels behind a gallery on columns, the emperor's statue in the end niche, reading tables with
  candelabra and scroll baskets. Outside: brick with a travertine socle, pilasters, string courses
  and a cornice; the high windows open into the hall. Labelled Greek (NE) and Latin (SW): which was
  which is unknown.
- **Markets.** Ring street (basalt, kerb, Lares shrine with its lamp, benches, torches on the
  piers); 11 stocked tabernae with travertine frames and mezzanine windows; second storey of
  arched windows, brick pilasters and alternating triangular/segmental pediments; set-back third
  storey. A stair street (42 × 0.2 m) at the south end climbs to the upper street (y = 8.4 m),
  concentric with the hemicycle, with shops on both sides (two storeys outside, windows on the
  back). Its north end leads into the Great Hall: six groin vaults on travertine corbels, rooms on
  two levels lit by two rows of windows, the weights-and-measures table. The rear and both flanks
  are brick street fronts (`brickFront`) of two storeys with tabernae (most still shuttered at
  dawn, a few open with a lamp inside), torches in brackets and vendor spots; above them three
  blocks of two or three storeys stand back behind a parapet terrace, windows on every face,
  hipped tile roofs.

## Lamps (the 04:30 start)

`trajan-lights.ts` collects each builder's flames (local positions) and requests them from the
light pool as soon as `game.lights` exists (builders run before the sky is installed). About 90
requests for the whole complex: altar fires and incense tripods (always burning), braziers at the
gateway, candelabra and torches (lit from dusk to dawn), `interior` candelabra in the basilica,
exedrae and libraries (they keep some light by day), shop lamps and street torches in the
Markets. Every request costs one glow sprite (all sprites are a single instanced draw); only the
nearest eight get a real PointLight, so the cost is flat.

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
- markets-trajan: `markets-{back,nnw,sse}-shop*` (vendors at the open shops of the street fronts), `markets-taberna0…10-vendor/-stall`, `markets-upper-inner*-stall`, `markets-upper-outer*-stall/-vendor`,
  `markets-taberna-strongbox`, `markets-lares-shrine`, `markets-sign-wine`, `markets-mensa-ponderaria`,
  `markets-street-bench1/6`, `markets-spawn-street`, `markets-hall-entrance`, `markets-hall-clerk`,
  `markets-hall-office*` (stall), `markets-stair-foot` (door), `markets-vista-landing`.

## Walkability

Box and cylinder colliders only. Every flight uses risers ≤ 0.2 m and treads ≥ 0.3 m (portico
and basilica steps 0.18 m). `tests/trajan.test.ts` walks the main routes over the colliders
(square → portico → exedra, gateway, the processional way past the Equus and the candelabra,
basilica front and side porches, back door → court, both libraries, the gallery stair, the markets
stair, a taberna, the street behind the Markets) and checks the step height and
headroom; the same routes were walked with the real character controller in the browser.

## Performance

Long colonnades, attic figures, interiors and statue groups sit in `LodChunks` (near ≤ 35–70 m,
far = 40-triangle columns and block figures; interiors hide beyond 150–260 m and cast no sun
shadows). Big landmarks also have a cheap `far` stand-in beyond their cull distance.

| Landmark | high, every chunk near | low | every chunk far |
| --- | ---: | ---: | ---: |
| forum-trajan | 210k | 163k | 43k |
| basilica-ulpia | 234k | 164k | 50k |
| markets-trajan | 127k | 60k | 65k |
| forum-trajan-gateway | 87k | 25k | 25k |
| column-trajan | 43k | 18k | 8k |
| libraries (each) | 26k | 16k | 5k |
| equus-traiani | 13k | 4k | 4k |

The forum and basilica exceed the 150k hero guideline only when every chunk is near at once
(from the middle of the square or the nave all of them are). In `?scene=rome&at=forum-trajan`
(04:30, lamps lit) the frame is ≈ 1.1M rendered triangles (shadow pass included) and ≈ 430 draw
calls, at 60 fps on an M4 Max in Chromium and WebKit.

## Known limits / next steps

- Upper galleries of the basilica and libraries, the hemicycle's second storey and the Markets'
  upper blocks are not enterable (no stairs); the column's inner stair is the v0.2 dungeon.
- Instancing the colonnade columns and the attic Dacians (one `InstancedMesh` per type) would cut
  memory; cutting triangles further means a third LOD level for the porticoes.
- The atlas `via-biberatica` polyline lies 15–35 m further NE than the upper street built here
  (concentric with the hemicycle, as on plans of the Markets); the city fabric should not draw a
  ground-level street along it inside the Markets' block. The rear street front faces the strip
  where that street runs.
- The atlas pad flattens the Markets' rectangle to 17.5 m; the hill rises behind the rear street
  front, and the terrain's pad margin there is a steep cut with stretched texture (terrain module).
- `?scene=rome&at=<id>` spawns 18 m in front of the atlas centre (game flow): for the Markets that
  lands on a statue base in the forum's NE exedra, for the gateway inside the Forum of Augustus'
  stand-in. A landmark's own `spawn` spot (`markets-spawn-street`, `forum-spawn-gateway`…) would
  be a better target.
- The `subura` district anchor's discovery circle covers the Forum of Trajan, so entering the
  square announces "SVBVRA" (locations module).
