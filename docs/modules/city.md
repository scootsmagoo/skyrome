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
game.city.coversGround(x, z);   // does the city dress this ground itself? (terrain/dress.ts asks)
game.city.ownsTrees(x, z);      // does the city plant the trees here?
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
| `massing.ts` | Block layouts (the filler's `planLots`, the golden-path frontage, back insulae filling the interior, yard trees, wall torches) and the far stand-ins: a box with a hip or gable roof per lot, coloured like the detailed building. |
| `frontage.ts` | The golden path's closed street wall: piazza lots become shops, open stretches of a corridor block's frontage get shop rows (5–10 m deep) or a compound wall with a gate; `frontClosure` measures it. |
| `fill.ts` | `fillUnits`: the kit's `fillBlock` (same lots, seeds and generators) as a sequence of small units — yard, each lot, yard dressing, each back insula, compound walls, torches — so no block costs one long frame. Kept in step with the kit by hand. |
| `proximity.ts` | `ProximityColliders`: colliders that exist only near the player (far massing, trees, walls and aqueducts). |
| `datum.ts` | The vertical datum: street `LIFT`s above the terrain, `FLOOR_LIFT`, and the per-edge `SIDEWALK` heights that follow from the kerb standard (`KERB` 0.15 m, `src/core/traversal.ts`), so street, plaza and house floor agree to the centimetre. |
| `roads.ts` | Street work per 128 m cell: atlas roads by context (urban: basalt between curbs and sidewalks; open: flush paving; rural: basalt, gravel or dirt), the atlas stairways (`stairProfile`: a walking surface never steeper than 0.66 that reaches the ground at both ends, flights on a substructure, parapets open at road crossings), junction squares, minor streets (vici, lanes, alleys, flights of steps), ground cover (earth over the town's scraps, cobbles on landmark margins, road edges and the golden path's scraps; never inside a block's outline nor on grades over 0.4), piazzas with a lacus or a compital shrine, market stalls (with aisles to the streets) and cattle pens, parked carts at the city's edge (on level open ground only), awnings over market lanes. Surfaces are the cell's `items`, furniture its `detail`. |
| `life.ts` | Street life: wall torches on shop fronts, landmark-frontage dressing (stalls, goods, amphorae, benches, statue bases, braziers, lampstands, shade trees), washing lines across dense lanes. |
| `lamps.ts` | `CityLamps`: the city's torches and lamps as light-pool requests near the camera. |
| `streamer.ts` | `CityStreamer`: lazy LOD for blocks and street cells (below), block levels built as jobs of `fillUnits`, look-ahead, the mid-level shadow budget. |
| `batches.ts` | `BatchPool`: every static city mesh lives in a few dozen `BatchedMesh`es (one per material × shadow × ground offset × tag), so the city costs ~100–130 draw calls whatever is built. The batches draw with the pool's own copies of the library materials (no program thrash with the landmarks' plain meshes), unsorted, and give capacity back when geometry streams out (`trim`). They are culled per instance by `gfx/fastCull.ts`: each pass keeps its own draw list (the indirect texture is re-uploaded only when the pass's instance list changed), and a batch with nothing in view is left out of the main pass before three.js walks the scene. Their matrices are frozen (they never move). Normals are stored as normalized bytes (`gfx/release.packNormals`, applied in `Batch.add`/`instance`/`shape`/`addGeometry`), which saves 9 of every 12 normal bytes, in the CPU copy and on the GPU; every geometry a batch takes must go through those four calls so the batch's attribute types stay the same. |
| `monuments.ts` | Servian wall stretches and the agger promenade, gates that are not landmarks, aqueduct arcades along `channelElevation`. |
| `trees.ts` | `TreeLayer`: instanced trees per species × variant, near / far models by distance, culled per 96 m cell. |
| `vegetation.ts` | Where trees grow: horti and groves, hill flanks, riverbanks (reeds), countryside, scraps; lusher inside the core. |
| `network.ts` | The street graph (`game.streets`) and its link probes (plan raster + physics). |
| `debug.ts` | `window.__cityBreakdown()`: draw calls and triangles per family of objects. |
| `src/scenes/city.ts` | Dev scene (below). |
| `tests/city.*.test.ts` | Raster, plan, layout, street graph and its links, vegetation, golden path and its frontage, street life, lamps, stairways walked by the real Actor through Rapier, parked carts. |

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
  sidewalks), with per-edge frontage and sidewalk height (`SIDEWALK` in `datum.ts`: 0.17 on atlas roads, 0.16 on vici, 0.04 flush with paving; a building's floor stands `FLOOR_LIFT` above it).
  Density and wealth come from the Augustan region, blended with `QUARTERS`; GDD §12.3: within
  150 m of a major landmark (Capitolium, Colosseum, Column, Colossus, Palatine, Basilica Ulpia,
  Circus) blocks stay at 2–4 storeys. Thin, poor or steep pieces may become gardens.
- **The golden path** (`CORRIDORS`, GDD §17.2): blocks within ~60–75 m (real) of the Via Appia
  outside the Porta Capena, the road through the gate, the streets on both sides of the Circus, the
  Velabrum, the Vicus Tuscus and the street to the Pons Aemilius are always built, packed with
  shops (density ≥ 0.9 blended in), and get more torches, stalls and braziers. Their street wall is
  closed (`frontage.ts`: piazza lots turned into shops, gaps filled with shop rows or compound walls
  with gates; ~0.97 of the corridor blocks' frontage, from ~0.6) and their yards are cobbled. Regio I (0.35) and
  the Palatine (0.15) would otherwise leave the way into the city half gardens.
- **Detail area.** Blocks inside `CORE_BOUNDS` + 150 m (real), and inside the boxes of the golden-path
  corridors grown by their radius + 150 m, are detailed (`plan.detailRects`, `plan.inDetail`): the
  Via Appia outside the Porta Capena, where the game starts, is real streets, not far massing.
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

Blocks are built lazily, nearest first (a missing full level next to the player first), and dropped
again beyond 1.35 × their range + 16 m. A level is a job of small units (`fill.ts`), each taken in
two steps: generating it (the procedural architecture, up to ~15 ms for a big insula) and
committing it (meshes into the batches, colliders: ~2–4 ms). A street cell's items run in 3 ms
slices, then a commit step. The big steps (generating, starting a job) run every other frame and
only when no other background work had the frame (`game.backgroundMs`: an avatar's staged LOD
build), the small ones every frame; more steps run while the next one's expected cost (a running
average per kind, `stepCost`) still fits the 5 ms budget. Something close and missing (`urgent`)
lifts the every-other-frame rule. So the longest frame of streaming is one unit's generation
(perf audit, October 2026: it was a unit plus its commit plus a whole cell, 15–21 ms; the Forum's
pan went from 8 slow frames to 1–2). Build order and reach use the
nearer of the camera and where it will be in 2 s, so blocks ahead of a walker are ready first. A
coarser built level stands in while a finer one is being built. Outside the detail area only the
far massing exists; its buildings get box colliders within 80 m of the player (`ProximityColliders`,
dropped beyond 110 m), like the trees (60 / 85 m) and the walls and arcades (90 / 125 m), so the
city keeps ~1.5 k colliders instead of 13 k. `extent: 'city'` streams detail everywhere.

**Shadow budget.** Full and mid levels cast shadows, low and far do not. The mid level's batches
are tagged apart: when a frame passes 2.45 M triangles (`game.stats`) their shadows go off as a
whole, and come back below 2.0 M (the mid level's shadows are ~0.25 M triangles at the spawn).

**Ground shared with the terrain dressing** (`terrain/dress.ts`, run after the city). The city
dresses its own ground: in the detail area everything but landmark footprints and the river
(streets, ground cover, the city's grass and trees), beyond it the blocks of massing, street
ribbons, walls, aqueduct lines and fora (`coversGround`); the dressing plants no grass, stones,
kerbs or trees there. Trees: the city plants its regions and all of the detail area (`ownsTrees`);
the dressing plants the countryside, the riverbanks and the landmarks' open ground. Before the
street graph the city steps the physics world once (nothing has stepped it during the load, and
Rapier only finds colliders in ray casts after a step), which also lets the dressing's own probe see
the landmarks.

## Street life and lamps

- **Torches.** One iron bracket with a pitch torch at a corner pier of insulae and shop rows:
  85 % of lots on the golden path, 55 % on atlas roads, 32 % on vici, 12 % in the lanes (domus and
  horrea half that). The flames use their own clone of `glow_fire` (`torchFlames()`), hidden by
  day, so forges, ovens and altars keep burning while the torches are out. ~940 lamps in the core
  (torches, shrine and fountain lamps, stall lamps, braziers).
- **Landmark frontages.** Where a landmark's margin faces a street: stalls (with an oil lamp on
  some) in front of markets, the Circus, porticoes, theatres and baths; inscribed statue bases,
  benches and shade trees in front of temples and basilicas; crates, sacks, dolia and amphora
  stacks; braziers and bronze lampstands along the golden path. ~380 items in the core.
- **Piazzas** at street junctions (~530 in the city): a lacus fountain (one every ~85 m) with a
  lampstand, or a compital shrine of the Lares with its lamp, benches, sometimes a stall.
- **Grounding.** Frontage props (`life.ts`) are skipped where the ground falls more than 0.5 m along or across their 2.4 m footprint, and each prop of a cluster takes the height of the ground where it stands. Piazza fixtures: see `docs/modules/fabric.md` (Props, "Fixtures on slopes"). The geometry crawl (`node scripts/crawl.mjs`) audits every prop base exactly (not at the 0.5 m cell centre), with instanced builds placed at their instances, and tells apart a prop under the terrain outdoors (buried) from one on a floor inside a roofed building (the terrain showing through the walls: not a prop's fault).
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

Nodes every ≤ 24 m along atlas roads, bridges and minor streets (every 8 m along the stairways, on
the course their flights take), split at crossings and where a street ends on another; piazzas,
fora and plazas, and landmark entrances (their `door`/`entr`/`gate` spots, else the facade front)
are linked to the nearest streets; leftover islands get a short link to the main network.

Every link the graph makes of its own is the nearest one that is walkable (`LinkProbe`): the plan
says no to a block, the river, a standing wall, the city's own furniture (stalls, fountains,
benches, carts, tree trunks: built later, near the player) and the side of a stairway; physics
(static colliders: landmarks, bridges, quays) walks the link in 0.5 m steps — at most 0.4 m up or
down per step, nothing at knee or chest height, headroom above. Nodes standing inside a collider
(a road crossing inside a monument) move to the nearest free spot, and atlas roads that run into a
monument's pier (the line misses the arch's passage) get a detour node. Market stalls leave aisles
toward the streets the square links to. Spot kinds: `shopDoor`, `houseDoor` (along block frontages, one every
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

## Performance (M4 Max, Chrome, 1280 × 720, `?scene=rome`, extent core, merged with the terrain dressing)

Load: the city builds in ~2.9 s (plan 0.63 s, far massing 0.69 s, street graph with its probes,
priming the spawn 0.97 s); the whole game is ready in ~8.5–9 s.

Street level (draw calls / triangles incl. the shadow pass, `__cityBreakdown()`; `?scene=city&view=`):

| Where | Total | City (blocks + streets) | Trees | Landmarks |
| --- | --- | --- | --- | --- |
| Porta Capena spawn (`scene=rome`) | 629 / 2.32 M | 110 / 858 k | 14 / 118 k | 457 / 898 k |
| Inside the Porta Capena | 647 / 2.42 M | 129 / 968 k | 14 / 118 k | 460 / 898 k |
| Circus street | 730 / 2.18 M | 115 / 678 k | 24 / 122 k | 534 / 934 k |
| Velabrum | 326 / 2.04 M | 125 / 1.02 M | 10 / 102 k | 155 / 581 k |
| Vicus Tuscus | 386 / 2.00 M | 132 / 999 k | 18 / 82 k | 188 / 546 k |
| Subura | 207 / 1.45 M | 128 / 881 k | 40 / 234 k | 24 / 1 k |
| Argiletum | 723 / 1.93 M | 98 / 473 k | 10 / 69 k | 552 / 934 k |

Along the golden path (11 points from the spawn to the Forum) the frame stays ≤ 744 draw calls and
≤ 2.3 M triangles at 60 fps; WebKit at the spawn: 639 / 2.32 M, 60 fps. Most of the city's
triangles are the full and mid blocks around the player and their shadows.

Physics and memory at the spawn: ~1.5 k city colliders (16.8 k in the world, 12.6 k of them the
dressing's trees outside the city), 1.5 ms per physics step (2.3 ms with `?city=0`, where the
dressing plants the whole city), ~2 MB of heap churn per frame. JS heap 755 MB (398 MB with
`?city=0`); the batches hold 7.1 M live vertices at the spawn (capacity 8.2 M) and 3.4 M after a
walk to the Forum (capacity 4.8 M, trimmed). `extent: 'city'` boots in ~8.5 s too.

Walk tests (scripted, player physics, `scripts/shot.mjs`): the 183 s walk from the spawn to the
Rostra along the street graph has p99 23 ms per frame and no frame over 33 ms (the longest
streaming step is ~13 ms); the 75 s Velabrum walk has no stops. The 14 steepest stair edges of the
graph and 45 sampled plaza / landmark links are walked to the end by the player; walking straight
at shop fronts in the Velabrum and the Subura stops at the walls.

## Facades (R4b, 2026-10)

Plaster and brick fronts share one library material per colour, so their variety comes from the
shader (`src/gfx/textures/shaderPatch.ts`, `SK_FACADE`, on every weathered plaster material and on
brick): each ~11 m stretch of wall and each wall plane has its own coat (lightness, warm-cool and
yellow-green slide), faded chalky paint above ~3.5 m, and tall damp stains. Weathering patterns (plaster
flaking, moss, ivy, rain streaks) are now laid in planar wall coordinates (metres along the wall, metres
up) via `skNoise2`/`skWc`: the old 3D lattice noise shears with height, which tilted every patch about
30 degrees and read as slashes and camouflage. Specular AA (`SK_SPECAA`) is in every patched library
material, which the city batches copy (`BatchPool.copyMaterial` keeps `defines` and `onBeforeCompile`).
The far massing material is flat-shaded (no normal variance), so it needs none.

## Known gaps

- Block interiors are the filler's (shops, stairwells, yards); the far massing has no interiors.
- Yards inside large blocks can be big patches of earth from above; back insulae fill dense ones
  (the golden path's yards are cobbled).
- `fill.ts` copies the kit's `fillBlock` loop: port kit changes by hand.
- The graph's road edges are physics-checked only where they cross a landmark footprint or the
  river; the Via Sacra climbing the Velia (around (295, 162)) is ~0.85 grade terrain, where a
  walker may slide back.
- Gates that are landmarks (the Porta Capena…) are other crews' work; until its hero builder lands
  the fallback gate has a passage (tiny change in `landmarks/builders/fallback.ts`).
- `extent: 'city'` streams everywhere but has not been profiled across the whole city.
- No NPCs here: `game.streets` and its spots are ready for the crowd module.
