# The city fabric of Rome

The ordinary city between the landmarks, for the whole of Rome in AD 113: the atlas roads and an
organic network of minor streets, city blocks filled with insulae, domus, shop rows and horrea,
the far massing that makes Rome a city to the horizon, Servian wall remnants and the old gates,
aqueduct arcades, gardens and trees, street life (stalls, torches, washing lines, fountains,
shrines) and the street graph that NPCs walk on.

```ts
await buildCity(game, atlas, hm, { extent: 'core' });   // buildRome calls it after the landmarks
game.city.classAt(x, z);        // ground class of the plan raster (raster.ts K)
game.city.blockSpots(blockId);  // exact NPC spots of a block once its full detail is built
game.city.prime(pos);           // build what a new position needs now (the streamer also does this on any jump > 80 m)
game.streets                    // street graph: nodes, edges, spots (see below)
```

`?city=0` skips the fabric (to measure the rest of the world without it).

## Files

| File | What |
| --- | --- |
| `src/world/city/index.ts` | `buildCity`: plan → far massing → street work and street life → walls, gates, aqueducts → trees and grass → street graph → lamps → streamer. `CityService` on `game.city`, the far massing material (window pattern, lamplit windows at night). |
| `plan.ts` | Pure planning over a 2 m class raster: regions, river, slopes > 28°, gardens, open fora, landmark footprints + 6 m margins, atlas roads (+ `EXTRA_ROADS`), walls, aqueducts; recursive organic subdivision into streets and blocks (contour terraces and stairs on slopes); piazzas; block character (density, wealth, storeys, corridor). |
| `raster.ts` | The raster toolkit: `Grid`, stamping, labelling, boundary tracing, simplification, polygon helpers. |
| `data.ts` | City data that is not in the atlas: `QUARTERS` (Subura, Carinae, Velabrum, Argiletum, Emporium, Aventine, Caelian, Transtiberim…), `OPEN_SPACES`, `EXTRA_ROADS`, `CORRIDORS` (the golden path), sightline landmarks, district and wild landmarks. |
| `massing.ts` | Block layouts (the filler's `planLots`, back insulae filling the interior, yard trees, wall torches) and the far stand-ins: a box with a hip or gable roof per lot, coloured like the detailed building. |
| `roads.ts` | Street work per 128 m cell: atlas roads by context (urban: basalt between curbs and sidewalks; open: flush paving; rural: basalt, gravel or dirt; stairs), junction squares, minor streets (vici, lanes, alleys, flights of steps), ground cover (earth over the town's scraps, cobbles on landmark margins and road edges), piazzas with a lacus or a compital shrine, market stalls and cattle pens, parked carts at the city's edge, awnings over market lanes. Surfaces are the cell's `items`, furniture its `detail`. |
| `life.ts` | Street life: wall torches on shop fronts, landmark-frontage dressing (stalls, goods, amphorae, benches, statue bases, braziers, lampstands, shade trees), washing lines across dense lanes. |
| `lamps.ts` | `CityLamps`: the city's torches and lamps as light-pool requests near the camera. |
| `streamer.ts` | `CityStreamer`: lazy LOD for blocks and street cells (below), `fillLevel` (the filler's block + back insulae + torches). |
| `batches.ts` | `BatchPool`: every static city mesh lives in a few dozen `BatchedMesh`es (one per material × shadow × ground offset), so the city costs ~80 draw calls whatever is built. |
| `monuments.ts` | Servian wall stretches and the agger promenade, gates that are not landmarks, aqueduct arcades along `channelElevation`. |
| `trees.ts` | `TreeLayer`: instanced trees per species × variant, near / far models by distance, culled per 96 m cell. |
| `vegetation.ts` | Where trees grow: horti and groves, hill flanks, riverbanks (reeds), countryside, scraps; lusher inside the core. |
| `network.ts` | The street graph (`game.streets`). |
| `debug.ts` | `window.__cityBreakdown()`: draw calls and triangles per family of objects. |
| `src/scenes/city.ts` | Dev scene (below). |
| `tests/city.*.test.ts` | Raster, plan, layout, street graph, vegetation, golden path, street life, lamps. |

## The plan

Everything is planned in game metres on a 2 m raster over `CITY_BOUNDS`, deterministically
(~0.65 s for the city). Ground classes (`K`): `FREE` (buildable), `ROAD`, `STREET`, `LANDMARK`,
`MARGIN` (6 m walkable apron round a solid landmark), `PLAZA` (open fora and squares; their paving
is the landmark crews'), `GARDEN`, `WATER`, `STEEP`, `WALL`, `AQUEDUCT`, `PIAZZA`, `OUTSIDE`, `SCRAP`.

- **Streets.** Each buildable component is cut recursively by organic streets until blocks suit the
  quarter (target area grows with wealth and falls with density). On slopes the cuts follow the
  contours (terraces) and streets up the fall line become flights of steps (grade > 16 %).
  Widths: vici 5.4–6 m, lanes 4.2 m, alleys 3.2 m.
- **Blocks.** The remaining pieces are traced and simplified into property lines (outer edge of the
  sidewalks), with per-edge frontage and sidewalk height (0.2 on atlas roads, 0.12 on streets).
  Density and wealth come from the Augustan region, blended with `QUARTERS`; GDD §12.3: within
  150 m of a major landmark (Capitolium, Colosseum, Column, Colossus, Palatine, Basilica Ulpia,
  Circus) blocks stay at 2–4 storeys. Thin, poor or steep pieces may become gardens.
- **The golden path** (`CORRIDORS`, GDD §17.2): blocks within ~60–75 m (real) of the Via Appia
  outside the Porta Capena, the road through the gate, the streets on both sides of the Circus, the
  Velabrum, the Vicus Tuscus and the street to the Pons Aemilius are always built, packed with
  shops (density ≥ 0.9 blended in), and get more torches, stalls and braziers. Regio I (0.35) and
  the Palatine (0.15) would otherwise leave the way into the city half gardens.
- **Extra roads** (`EXTRA_ROADS`): the atlas ends the Via Appia at the Porta Capena and starts the
  valley roads ~150 m inside it, so the city adds the road through the gate, forking to the street
  under the Palatine (and the triumphal road) and to the street under the Aventine.

## Levels of detail and streaming

| Level | What | Where (× view-distance setting) |
| --- | --- | --- |
| full | The `CityBlockFiller` block (`fillBlock`, `detail: 'full'`): shop interiors, props, colliders, exact spots, plus back insulae and torches | within 30 m of the block footprint |
| mid | The street-facing exterior (no interiors, no colliders) | to 85 m |
| low | Flat walls with painted openings, no shadows | to 140 m |
| far | Merged flat-coloured massing (one box + roof per lot, ~16 triangles a building, window pattern in the shader) | everything else, to 3.2 km |
| street cells | Roads, streets, junctions, piazza paving, ground cover (128 m cells) | to 230 m; far ribbons beyond |
| street furniture | Fountains, shrines, stalls, carts, awnings, frontage life, washing lines | to 110 m |

Blocks are built lazily, nearest first (a missing full level next to the player first), within a
6 ms budget per frame (one build every other frame), and dropped again beyond 1.35 × their range + 16 m. A
coarser built level stands in while a finer one is being built. Outside the detail area
(`extent: 'core'`: `CORE_BOUNDS` + 150 m real) only the far massing exists, with box colliders so
nobody walks through the backdrop; `extent: 'city'` streams detail everywhere.

## Street life and lamps

- **Torches.** One iron bracket with a pitch torch at a corner pier of insulae and shop rows:
  85 % of lots on the golden path, 55 % on atlas roads, 32 % on vici, 12 % in the lanes (domus and
  horrea half that). The flames use their own clone of `glow_fire` (`torchFlames()`), hidden by
  day, so forges, ovens and altars keep burning while the torches are out. 786 lamps in the core
  (torches, shrine and fountain lamps, stall lamps, braziers).
- **Landmark frontages.** Where a landmark's margin faces a street: stalls (with an oil lamp on
  some) in front of markets, the Circus, porticoes, theatres and baths; inscribed statue bases,
  benches and shade trees in front of temples and basilicas; crates, sacks, dolia and amphora
  stacks; braziers and bronze lampstands along the golden path. ~380 items in the core.
- **Piazzas** at street junctions (~530 in the city): a lacus fountain (one every ~85 m) with a
  lampstand, or a compital shrine of the Lares with its lamp, benches, sometimes a stall.
- **Washing** on lines across the lanes of the dense quarters, from facade to facade.
- **CityLamps** asks the light pool (`game.lights`, sky module) for the lamps within 150 m of the
  camera (dropped beyond 195 m), re-evaluated every 12 frames or 8 m of movement: 40–90 requests
  at street level. All are `night` lamps: lit from dusk to dawn, so the 04:30 arrival walks up a
  lamplit valley. The pool gives the 8 nearest real PointLights; the rest are glow sprites.
- **Lamplit windows.** From dusk to dawn about one window in six of the far massing (and a few
  shop fronts) glows warm, following `game.sky.lampFactor`.

## The street graph (`game.streets`)

```ts
game.streets.nodes        // { id, x, z, kind: 'road' | 'street' | 'stairs' | 'junction' | 'piazza' | 'plaza' | 'landmark' }[]
game.streets.edges        // [a, b, width][] (undirected)
game.streets.spots        // { id, kind, position, heading, block, tag?, node }[]
game.streets.nearest(x, z, maxDist?)   // node id or −1
game.streets.neighbours(id)            // [node, width][]
game.streets.components()              // node-id arrays, largest first
```

Nodes every ≤ 24 m along atlas roads, bridges and minor streets, split at crossings and where a
street ends on another; piazzas, fora and plazas, and landmark entrances (their `door`/`entr`/
`gate` spots, else the facade front) are linked to the nearest streets; leftover islands get a short
link to the main network. Spot kinds: `shopDoor`, `houseDoor` (along block frontages, one every
~12 m), `fountain`, `shrine`, `stall`, `bench`, `container` (amphora stacks and goods: GDD §12.3
street-level containers). `heading` is the way someone using the spot faces (a shopkeeper looks out
to the street). Exact spots of the detailed buildings (counters, stairs, yard wells…) come from
`game.city.blockSpots(id)` once a block's full level is built. The core forms one connected network
(> 95 % of nodes; tested), and the Porta Capena is connected to the Forum.

## Walls, gates and aqueducts

Servian wall stretches from the atlas in Grotta Oscura tufa ashlar: gaps where `partial`, broken
tops where `ruinous`, low stubs in open ground where `built-over`; nothing where the wall would
block a road or street. The Esquiline agger is an earth bank with a walkable promenade. Gates that
are not landmarks become obsolete single arches (or two broken piers). Aqueduct arcades follow the
atlas `channelElevation`: piers and arches with the covered channel on top, a solid wall where the
channel runs low, nothing underground; piers that would stand in a road are left out.

## Dev scene

`?scene=city&view=<name>[&hour=9.5][&extent=core|city][&walk=1]`, views: `subura`, `argiletum`,
`tuscus`, `velabrum`, `boarium`, `caelian`, `aventine`, `capena` (inside the Porta Capena),
`circus` (the street under the Palatine), `aerial`, `golden` (aerial over the golden path),
`capitol`, `palatine`, `far`, `aqueduct`, `arcades`, `neroniani`, `wall`, `gate`, `agger`,
`scalae`, `river`. Street views snap to the street graph and look along the street at eye height.
`window.cityView(name, turn?)` switches views; `window.cityCam(x, y, z, tx, ty, tz)` is a free
survey camera (game coordinates) that builds the detail around the eye first.

The game itself: `?scene=rome&quick=1` spawns at the Porta Capena at 04:30 (`&hour=8` for daylight).

## Performance (M4 Max, Chrome, 1280 × 720, `?scene=rome`, extent core)

Load: the city builds in ~2.3 s (plan 0.65 s, far massing 0.6 s, priming the spawn 0.8 s); the
whole game is ready in ~8 s.

Street level (draw calls / triangles incl. the shadow pass, `__cityBreakdown()`):

| Where | Total | City (blocks + streets) | Trees | Landmarks |
| --- | --- | --- | --- | --- |
| Porta Capena spawn | 528 / 2.51 M | 86 / 1.26 M | 14 / 115 k | 380 / 718 k |
| Circus street | 654 / 2.09 M | 80 / 710 k | 18 / 135 k | 502 / 807 k |
| Velabrum | 440 / 1.78 M | 85 / 948 k | 22 / 139 k | 314 / 341 k |
| Vicus Tuscus | 307 / 1.12 M | 76 / 663 k | 14 / 129 k | 202 / 4 k |
| Subura | 139 / 1.54 M | 80 / 979 k | 30 / 235 k | 11 / 0 |
| Argiletum | 143 / 1.61 M | 81 / 1.12 M | 14 / 184 k | 38 / 1 k |
| Colosseum valley | 146 / 1.35 M | 84 / 829 k | 16 / 220 k | 36 / 1 k |

The city stays at ~80 draw calls (batched); most of its triangles are the full and mid blocks
around the player and their shadows. A whole-core aerial is ~600 draw calls / 2.3 M triangles.
The batches hold 4.5–7 M live vertices (capacity ≤ 10 M) while walking the core.
`extent: 'city'` boots in ~7 s too (3,300 lamps, 15,400 graph nodes).

Walk test (scripted, player physics, `scripts/shot.mjs`): from the spawn through the Porta Capena,
along the street under the Palatine, into the Velabrum and down the Vicus Tuscus toward the Forum
with no stops; walking straight at shop fronts in the Velabrum and the Subura stops at the walls.

## Known gaps

- Block interiors are the filler's (shops, stairwells, yards); the far massing has no interiors.
- Yards inside large blocks can be big patches of earth from above; back insulae fill dense ones.
- Gates that are landmarks (the Porta Capena…) are other crews' work; until its hero builder lands
  the fallback gate has a passage (tiny change in `landmarks/builders/fallback.ts`).
- `extent: 'city'` streams everywhere but has not been profiled across the whole city.
- No NPCs here: `game.streets` and its spots are ready for the crowd module.
