# Solid ground (phase 4): the map, the ground and the routes

The owner played the latest build (2026-10-10) and still found:
- **Floating kerbs**, and **buildings that look like they float** (their bases do not meet the ground).
- **Inconsistent ground textures**, and ground textures that **pop in** as you move.
- The **minimap route led into a wall** during the main quest; the only way on was no-clip (`tcl`).
- **Hills too steep**: some are hard to climb; they should be lower or gentler.

The goal: everywhere a player walks is rock solid. Nothing floats, nothing is buried, nothing snags, every surface looks continuous and settled at every distance, every route the game shows can actually be walked, and the hills can be climbed on foot.

## Phase 4a: the audit (read the whole map, measure, record)

Six auditors, one lens each. Each builds a reusable audit tool (a script under `scripts/audit/` or an extension of `scripts/crawl.mjs` / `src/dev/audit/geomAudit.ts`) and runs it over the whole playable city, then confirms the worst cases with screenshots. Every finding has game coordinates, the place's name, a screenshot, a measured value, the cause in the code where it can be found, a severity and a fix idea.

1. **Structures on the ground:** city buildings, landmarks, podia, walls, gates, aqueduct piers, stairs: bases above the ground (gaps, floating) or sunk too deep, on slopes and flats.
2. **Street-level fit:** kerbs, paving edges, aprons, plazas, steps, fountains, stalls and props: floating, buried, lips, gaps, z-fighting, kerbs that do not meet the road or the pavement.
3. **Surface look and pop-in:** ground materials and their transitions (terrain vs paving vs cobbles vs dirt), seams, tiling, mismatched scales and tints, texture pop-in (KTX2 loading, streaming, LOD and material swaps, mips), shadows and AO popping on the ground.
4. **Routes:** the minimap and quest route (src/nav), the street graph, the NavGrid and the golden-path bot: walk every route the game can show (every objective of every quest from realistic start points, and street-graph edges) with a real player capsule; record every place a route runs into a wall, a drop or a gap, or needs a jump.
5. **Collision against visuals:** invisible walls, missing colliders (fall-through, sinking), colliders taller or offset from what is drawn, stairs and ramps whose collision differs from their look, seams between collider pieces that catch the player.
6. **Terrain grades:** a slope map of everywhere the player can walk; which hills, streets and paths are too steep to climb or run up; how the terrain is made (src/world/terrain, the atlas elevations and WORLD_SCALE) and how to lower or soften it safely (what moves with it: landmarks, roads, water, interiors, spawn points, checkpoints).

A lead turns the findings into the phase 4b plan: the defects ranked, grouped by cause, crews with file ownership, acceptance checks that are scripts (so they become regression tests), and the order of work.

## Phase 4b: the fixes (after phase 3 is merged)
From the plan above.

## Phase 4b plan (lead, 2026-10-10)

Sources: the six phase 4a audits, on branches `worktree-wf_ef94e59a-49c-1` to `-6`. None of them is merged yet. Short names used below:
- W1: structures
- W2: street fit
- W3: surfaces
- W4: routes
- W5: collision
- W6: grades

Each Wn is the worktree `.claude/worktrees/wf_ef94e59a-49c-N`, and screenshot names are relative to it. Most of these screenshots sit in gitignored `.shots/` folders. Crew G0 therefore copies every cited one into `docs/research/solid-ground/before/` before any worktree is removed.

### 1. The picture

Nearly every defect the owner saw comes from seven causes. The common thread is that each part of the world is placed against its own idea of where the ground is, and nothing checks the parts against each other.

**(RC1) Three grounds.**
- Everything placed in code stands on `Heightmap.heightAt`, which is bilinear: streets, kerbs, buildings and props.
- The terrain is drawn as triangles split along one diagonal (`Terrain.ts` `patchGeometry`, a–d).
- Rapier's heightfield splits along the other diagonal (b–c). W5 found this in 40,305 of 40,305 samples.

On a twisted 2 m cell these disagree by up to 1.19 m. Bilinear sits halfway between the two diagonals, so street paving ends up 0.4–0.6 m above the drawn ground with no skirt to hide the gap.

**(RC2) Pads beat roads.** The heightmap stamps landmark pads after it levels the roads, with a fixed 14 m blend. A pad pinned 5–17 m off the ground therefore throws a 48–76° bank across the Via Sacra, the Via Nova, the Clivus Palatinus and the Clivus Victoriae. Three other things add to it:
- The designed hill flanks are smoothsteps whose top grade is 1.5 times the mean. That makes the Capitoline 34° and the Palatine's t34 terrace 41°.
- Minor streets are ramps that run straight over atlas cliffs.
- The controller slides on any contact steeper than 40°, whichever way you push, so all of these are walls.

**(RC3) Foundations and floors from a few samples.** Builders take 3 samples per wall piece, 5–7 per building, one per shop bay, or a fixed height. So walls hang over dips, shop floors sit under rising ground, and some landmark parts have no substructure at all.

**(RC4) Colliders are not made from what is drawn.** There are:
- flat boxes over sloping paving
- whole-lot boxes across drawn doorways
- full-height parapets
- drawn decks, rocks and arcades with no collider at all

**(RC5) The street graph and the quest route ignore the built world.** 154 landmark and plaza nodes have no edge. Atlas road lines are never probed. Altars are placed after the graph is built. The planner draws the last 30–45 m as a straight line and never re-plans, so the minimap leads through the Basilica Ulpia, the Ludus wall and a city block.

**(RC6) Every surface kind lays its own paving.** The result is 845k double-paved cells, grass patches on cobbles, the dressing's kerbstones on the road, and terrain travertine and mesh travertine in two unrelated textures.

**(RC7) A few render-side causes.** A shadow-bias term bands every shadowed piece of ground. An LOD cross-fade dithers near marble. The first arrival builds its materials late. Block LOD has no hysteresis.

The plan fixes the seven causes, not the 44k symptoms:
- one ground function
- roads win over pads, and gentler hills
- foundations sampled over the whole footprint
- colliders made from the drawn surfaces
- a street graph probed against what is built, and a route that corrects itself
- one paved surface per place
- three render fixes

### 2. Defects, ranked

#### Blockers: they strand the player or route them into a wall. Fix these first; every one has a gate in §4.

| # | Cause | Defect | Where (x, y, z) | Evidence | Shot |
|---|---|---|---|---|---|
| B1 | RC5 | mq-04: the route to Gratus runs 61 m straight through the Basilica Ulpia. This is the owner's no-clip spot. | 53, 10.5, −218.1 | Every Forum of Trajan node is edgeless (plaza 7852, Column nodes 7933–7937). The nav grid finds no path in 7,000 expansions. | W4 `.shots/routes/A-column-ulpia-map.png` |
| B2 | RC5 | mq-02: the route to Glaucus cuts through the SW wall of the Ludus Magnus. | 522.7, 12, 197.6 | 40.5 m straight lead-out. 7 routes (3 quest) blocked 3–4 times each. The grid knows a 64.5 m way round. | W4 `I-ludus-wall-map.png` |
| B3 | RC5 | The Inn at the Starting Gates cannot be reached. 4 objectives FAIL: mq-01 ask-dromo, job-cliens-epistula v2:dama, job-subura-pistor s:dama, misc-hilara ask. | −81, 7.5, 305.8 | 39 m straight through block b414, 102 blocked events. No street node within 14 m. | W4 `B-inn-b414-map.png` |
| B4 | RC5 | Straight lead-outs city-wide, never corrected. | e.g. −31.6, 7.4, 193.3 | 208 of 322 blocked events. 4 re-plans in 241 walks. 113 quest locations are more than 30 m from a node. | W4 `Q-mq03-etruscan-b694-map.png` |
| B5 | RC5 | Routes from big landmarks fall back to one straight line across the city. | 325.2, 16.3, 115.8 | 154 edgeless nodes. 100 places get no street route. The tour from the Colosseum to the Forum of Trajan aborted (449.8 m straight). | W4 `F-colosseum-straight-map.png` |
| B6 | RC5/RC4 | The Pons Cestius deck stands 4.8 m above the Transtiberim street and about 8 m above the island. The walker fell into the Tiber. | −358.2, 10, 190.8 | Edge 371 drops 4.57 m. The island's streets are separate graph components. 9 swims. | W4 `pons-cestius-west-close.png` |
| B7 | RC2 | Clivus Victoriae (68–76°), Clivus Palatinus (63°) and the Via Nova at the Arch of Titus (50°) cannot be climbed. | 95, 18.8, 97.6 · 171.4, 18.3, 132.4 · 180.3, 14.8, 128.7 | 53 m of the Victoriae is over 40°. All three live climbs: NOT UP. | W6 `scripts/audit/out/grades-shots/clivus-victoriae-side.jpg`, `clivus-palatinus-side.jpg`, `vianova-arch-titus-up.jpg` |
| B8 | RC1 | Street slabs stand 0.4–0.6 m above the drawn terrain on slopes: the player is waist-deep in paving. | 486.63, 17.17, 261 (also Clivus Victoriae, Via Sacra, Clivus Capitolinus, Janiculum, Aventine) | 1,948 lip cells of 30 cm or more, 289 places. Probe: street 0.44 m above the drawn terrain. | W2 `scripts/audit/out/sf-lip1.png`, `sf-lip2.png` |
| B9 | RC4 | The River Port quay deck has no collider: the player sinks to the neck. | −262, 5.35, 182 | Deck at 6.71, collider at 5.30 (1.41–1.90 m gap). | W5 `.shots/verify/v04-river-port-quay.png` |
| B10 | RC4/RC3 | Baths of Trajan: paving is drawn past the terrace with nothing under it (a 3.2 m fall), and a library exedra floats 13.9 m above the slope. | 608.3, 25.69, 103.6 · 604.1, 28.8, 106.1 | 10 fall-through probes. Exedra base 13.89 m up over 30 m. | W5 `.shots/audit/collision-01-fallthrough.png`, W1 `.shots/audit/structures/f-baths-trajan.png` |
| B11 | RC4 | Tarpeian Rock and Carmental Gate: rock outcrops are drawn 1.6–3 m above the physics cliff and have no collider. | −110.3, 13.8, 85.7 | 5 confirmed falls of 2.2–2.9 m, 368 ghost probes. | W5 `.shots/audit/collision-02-fallthrough.png` |

#### RC1: three grounds that disagree, and slabs with no skirt

| Sev | Defect | Where | Evidence | Shot |
|---|---|---|---|---|
| major | Bare terrain: physics differs from the drawn ground; the player is buried to the chest. | 70.9, 10.72, 327 | Max 1.19 m, mean 1.4 cm. 5,604 float and 6,028 sink probes over 4 cm. | W5 `.shots/verify/v05-terrain-diagonal.png` |
| major | Kerb and paving faces end in mid-air, with ragged "teeth" under the slab. | 80.71, 14.39, 106.07 | Face-float 0.98 m. 30 clusters; piazza pz586 0.713 m. | W2 `scripts/audit/out/01-face-float.png` |
| major | Ground-cover patches float or show through the paving. | 200.88, 15.81, 94.13 | 10,827 m of ground-cover edge over 3 cm. Terrain-through 0.228 m over 555 cells. | W2 `sf-lip2.png` |
| minor | Open edges float by street kind. | city-wide | Over 3 cm: 26.3 km in total. Rural roads 2,240 m (56 %), open roads 1,111 m (34 %). | W2 `street-fit.json` |

#### RC2: pads, flanks and cliffs over roads (grades)

| Sev | Defect | Where | Evidence | Shot |
|---|---|---|---|---|
| major | The Via Sacra climbs a 46–48° paved ramp onto the Velia vestibule pad. This is on the story route from the Forum to the Ludus. | 300.5, 14.6, 160.4 | Pad pinned at 29 m ASL, ground raised 5.1 m. 104 % over 4 m (24 % without pads). | W6 `viasacra-velia-up.jpg` |
| major | The Capitoline is steep all round: the easiest way up is 31.8°, and the Clivus Capitolinus is 62 %. | −67.4, 16.6, 43 | 15 of 24 radial faces unclimbable. The flank is a smoothstep with a 34° top grade. | W6 `clivus-capitolinus-up.jpg` |
| major | The Palatine: flanks p90 51.5°. The palatine-t34 terrace is designed at 41°. | 279, 16.5, 171 | 10 of 24 faces unclimbable. Easiest way up 23.7°. | W6 `terrain-grades-core.png` |
| major | Lane st1497 runs up the Quirinal cut behind the Markets of Trajan. | 105.4, 22.5, −288.5 | 181 % (61°); live surface 66.1°. | W6 `markets-lane-side.jpg` |
| major | Pad embankments cut 55–76° banks through streets. | 467.5, 21.4, 239.9 (Claudianum); Baths of Titus; Domus Augustana | Domus Augustana: 3,400 m² over 35°. 7 minor streets moved more than 2 m by pads. | W6 `terrain-grades.json` |
| major | Vicus Iugarius at the foot of the Tarpeian cliff. | −87.8, 10.7, 84.4 | 51.2° surface; 87 % over 4 m. | W6 `vicus-iugarius-tarpeian-side.jpg` |
| major | Any slope over 40° is a wall for a walking player, even zig-zagging. | `Physics.createCharacter` | Walking at 42°: −0.5 m/s. 3.1 ha of walkable ground is over 40°. | — |
| minor | Clivus Publicius 60 %; Tiber Island bank 70° at the Cestius landing; Janiculum streets 55–67°. | −95.1, 17.9, 480.8 · −345.7, 6, 158 · −1228.9, 32.3, −124.4 | — | W6 `island-edge-side.jpg` |

#### RC3: foundations and floors from too few samples or fixed heights

| Sev | Defect | Where | Evidence | Shot |
|---|---|---|---|---|
| major | Servian wall pieces hang over hillside slopes. | 104.7, 25.55, −291.9 | 33 stretches in 15 chunks, 11 of them 0.6 m or more; worst 3.10 m. | W1 `chk-wall-quirinal.png` |
| major | Arcus Neroniani wall floats over a slope. | 556, 27.69, 470.1 | 2.28 m over 16.5 m. | W1 `f-arcus-neroniani.png` |
| major | Grass and earth inside shops. | −88.3, 22.44, 551.5 | 343 buildings, 5,837 samples, worst 2.48 m. | W1 `terrain-in-floor-block-2.png` |
| major | House of the Vestal Virgins is sunk into the slope. | 140.6, 7.76, 107.8 | Floors 5.35 m under the terrain over 412 m². | W1 `f-vestae-floor.png` |
| major | Capitoline temple flight sunk under the clivus. | −78.3, 20.12, 44.5 | Treads 3.42 m under, 52 m². | W1 `terrain-in-floor-landmark-5.png` |
| major | Emporium quay floors buried under the bank. | −364.9, 1.95, 584.8 | 4.3–7.5 m, about 1,700 m². | W1 `f-emporium-buried.png` |
| major | Colosseum cavea underside hangs over the podium terrace (confirm in game). | 425, 16.16, 172.9 | 4.55 m, 25 stretches. | W1 `f-colosseum-cavea.png` |
| major | Domus Augustana wing wall above the slope (not yet seen on screen); hippodrome floor under the terrain. | 80.9, 27.6, 345.9 · 114, 14.86, 357.3 | Wing foot 19.13 m up; hippodrome 7 m under. | W1 `floating-landmark-1.png` |
| minor | Buried thresholds (ground above the floor in an opening). | −1021.1, 28.04, 136.6 | 388 buildings, 239 stretches of 0.35 m or more. | W1 `buried-opening-block-2.png` |
| minor | Building outlines float where the slope dips between samples. | −316.7, 23.78, 633.1 | 294 buildings, worst 2.09 m. | W1 `floating-block-1.png` |
| minor | Far massing floats above the coarse distant terrain. | −1092.7, 35.3, 51.3 | 329 boxes beyond 614 m; 16 against the true terrain. | — |
| minor | Block props with a foot in the air, or buried. | 556.57, 24.29, 616.46 | 6,659 with a foot in the air, 2,409 floating, 271 sunk. | — |
| re-check | Unconfirmed: Gardens of Adonis 6.14 m (248.2, 28.45, 199.2); Ludus Gallicus 4.5–6.6 m (578.5, 18.57, 262.4); Divus Claudius terrace 2.71 m (481.2, 18.35, 258); Lupercal 1.77 m; Insula Aracoeli 1.59 m; Forum of Caesar 1.21 m over 67 m (52.4, 10.42, −35.1). | | | |

#### RC4: colliders not made from what is drawn

| Sev | Defect | Where | Evidence | Shot |
|---|---|---|---|---|
| major | Porta Capena inner square: flat boxes stand up to 1.27 m above the sloping paving. The body stops 3.4 m before the drawn edge. This is the story's opening. | 306, 10.48, 561 · 293, 10.64, 572.9 | 123 probes. `capenaParts.ts:403`. | W5 `v01-capena-square-float.png` |
| major | Porta Capena prop box 1.8 m above the paving. | 309.7, 13.44, 582.5 | `capenaParts.ts` ~483 | W5 `.shots/audit-sweep2/collision-28-ledge.png` |
| major | Imperial Mint: a 36 × 24 m box makes an invisible floor 1.1 m up. | 649.8, 16.72, 198.4 | 315 probes | W5 `v02-moneta-ledge.png` |
| major | Lot boxes fill drawn open doorways. | 259.3, 12.78, −156.8 | 919 "city box with nothing drawn" defects (1,936 probes); 779 embedded | W5 `collision-26-invisible.png` |
| major | The Circus arcade at the starting gates can be walked into. | −68.8, 7.34, 305.9 | 42 probes, 4 walks | W5 `.shots/audit/collision-16-ghost-wall.png` |
| minor | A stair parapet has a 2.8 m invisible collider. | −0.1, 8.16, 259.7 | 3.95 m short of anything drawn | W5 `collision-25-invisible.png` |
| minor | Collider lips and cracks under smooth paving. | 1.99, 7.89, −1.56 | 3,582 lips (1,038 of 10 cm or more), 195 cracks | — |
| minor | Paving drawn 2–6 cm above its collider. | city-wide | 12,951 sink defects | — |

#### RC5: the street graph and the route ignore what is built

| Sev | Defect | Where | Evidence | Shot |
|---|---|---|---|---|
| major | The first route of the game mantles the Capena crossroads altar and clips the gate pier. | 281.7, 7.9, 545.4 | 9 routes (6 quest), mantles of 1.11–1.14 m | W4 `E-capena-altar-view.png` |
| major | Forum to Forum of Trajan: a 2.3× detour that clips the Basilica Aemilia and the Forum of Nerva. | 67.1, 9.1, −28.7 | 23 routes; the imperial fora's nodes are edgeless | W4 `C-argiletum-aemilia-map.png` |
| major | The Via Sacra squeezes between the Porticus Margaritaria and the bank. | 175.8, 11.5, 127 | Edge 452 runs 6.4 m through the porticus | W4 `G-porticus-view.png` |
| major | Piazza and junction nodes sit on their own shrine or altar. | 510.2, 13.5, 199.8 · 56.8, 7.9, 37.9 | 10 routes | W4 `H-ludus-piazza-view.png` |
| major | The River Port sack job's post is behind the warehouse wall. | −233.8, 6, 139.3 | Blocked 3 times; grid: unreachable | W4 `L-portus-map.png` |
| major | Static sweep: edges through solids, over drops, up steep ground. | −178.3, 6.7, 110.4 (worst) | 367 of 8,770 edges flagged; 246 through a solid | W4 `13-line-through-284_549-over.png` |
| minor | Targets with no height get y = 0: the route never clears on arrival. | 180, 10.9, −80 | 17 targets | W4 `L-portus-view.png` |
| minor | The golden-path bot never follows the drawn route; a guide waypoint stands against b609 (20, 8, 335); the Column stair's route points sit on the inner edge. | — | — | — |

#### RC6: every surface lays its own paving

| Sev | Defect | Where | Evidence | Shot |
|---|---|---|---|---|
| major | Double paving: two materials 1–15 cm apart. | −470.13, 6.28, 585.38 | 844,789 cells | W2 `sf-lip2.png` |
| major | Dressing kerbstones sit on the Via Ostiensis paving. | −377.92, 7.4, 591.26 | 59 stones on city paving | — |
| major | Terrain travertine next to mesh travertine: two unrelated stones. | 65.4, 7.86, 63.5 | 8,875 m of seam over 91 stops; repeat ratio ×2.5 | W3 `scripts/audit/out/shots/seam-1-eye.png`, `twin-1-eye.png` |
| major | The opening's street shows cobbles, basalt and travertine kerbs at three scales. | 266, 7.81, 552.5 | Patchwork index 93; contrast 6.23 | W3 `seam-3-eye.png` |
| major | Basalt Via Sacra against the bright travertine plaza with a hard edge. | 51.5, 8.8, 1.2 | 2,570 m; contrast 6.23 | W3 `seam-8-eye.png` |
| minor | Hard one-cell edge between mesh and terrain dirt or grass; patchwork at house walls. | 139.7, 7.68, 584.8 · 280.5, 8, −112 | 3,100 holes, 14,461 slivers; worst index 181 | W3 `seam-2-eye.png` |

#### RC7: render side

| Sev | Defect | Where | Evidence | Shot |
|---|---|---|---|---|
| major | Banding across all shadowed ground. | 60, 7.9, 60 | The same with post=0 and in both shadow modes | W3 `shadow-banding-forum.png` |
| major | A dither ghost on the Forum of Augustus fittings. | 113.7, 10.32, −106.8 | LOD cross-fade, close up | W3 `seam-2-eye.png` |
| minor | The first arrival at Porta Capena pops for 2.7 s. | 304.5, 9.7, 573.5 | 26 % of the frame changes; 10 materials | — |
| minor | Block LOD flips back and forth; texture churn. | 21, 25.8, 197 | 58 flip-flops; 15 churn events | — |

Known false positives, handled by G0's tool fixes, not by the fix crews:
- Circus and Colosseum spans whose supports are filled in at runtime
- the stairs inside the Theatre of Marcellus
- wood_dark balconies and awnings
- `:mid` ghost walls
- `?:box` moving carts
- walk "spikes" that are really walls
- `look.mjs` shots taken from under the slab

### 3. The terrain decision: gentler, not lower

**What is built.** These six changes are all in profile `v2`, which becomes the default:
1. **One ground** (merge G1a). `heightAt` interpolates on the same triangles the physics uses, and the drawn mesh is flipped to that diagonal. This comes first: everything else is measured against it.
2. **Roads win over pads, and pads blend by their height.** The order becomes natural ground, then pads, then roads, so roads are stamped last. Pad margin = max(given, 1 + 2.6·|dh|) real m, capped at 60 m, where dh is the pad's height above or below the natural ground. Inside a landmark's own footprint polygon (without the +3 m grow) the pad still wins.
3. **Road profiles are capped at 25 % per 4 m**, by the minimal cut and fill. The cap uses the W6 `regrade` helper, moved into the terrain module. Bank reach = half width + max(6, 1.8·|cut or fill|) real m, so banks stay at 30° or less.
4. **Eased-linear flanks** instead of the smoothstep: the top grade drops from 1.5× to 1.25× the mean, and no plateau or foot moves. Designed flanks steeper than 30° also get longer runs: capitolium 60 → 71 m, arx 60 → 64 m, palatine-t34 35 → 53 m (real m). Cliffs keep their 13 m run and stay barriers. A cliff segment now ends 15 real m short of an atlas road's band.
5. **Local fixes:**
   - the Tiber Island edge is flattened inside the bridge corridors
   - one landmark override, v2 only: the Porticus Margaritaria is unpinned (mean ground instead of 19 m ASL), applied to the atlas record before both its pad and its building are made
   - `hm.features.retaining` lists every place where a road band meets ground steeper than 38° within 8 m; the STREETS crew builds retaining walls along them
6. **Not built:** the global ×0.8 vertical (W6 options A, F and G). It moves 66 landmarks by more than 2 m, the aqueduct channel, the Forum of Trajan's relative heights, saves and 25 test files, and its gain over this package is small. It stays in reserve in case the owner still finds the hills too high after playing v2.

The options W6 measured:

| Option | Walkable ground > 40° | Easiest way up Capitoline / Palatine | Effect on the steep roads | What moves | Verdict |
|---|---|---|---|---|---|
| As built | 0.53 % | 31.8° / 23.7° | Victoriae 288 %, Palatinus 188 %, Via Nova 109 %, Via Sacra 104 %, Capitolinus 62 % | — | — |
| A: ×0.8 vertical above 12 m ASL | 0.38 % | 26.3° / 19.3° | Victoriae 231 %, Palatinus 150 % | 66 landmarks > 2 m, saves, aqueducts, tests | reserve |
| B: flanks ×1.5 | 0.44 % | 22° / 16.3° | Capitolinus 72 %, Iugarius 119 % (flanks spread onto the roads) | 9 landmarks | no |
| C: pads by height (with roads winning) | 0.38 % | 13.3° / 11° | Victoriae 51 %, Palatinus 74 %, before the road cap | water edge 0.99 m, masked out (see below) | **yes** |
| H: eased-linear flanks | (lower) | every designed flank top −17 % | — | nothing at the plateau or the foot | **yes** |
| I: road profiles capped | — | — | cut/fill: Capitolinus ±4.4 m, Palatinus 4.9, Victoriae 7.8, Publicius 1.8 | road bands only | **yes, at 25 %** |
| F: A + C | 0.26 % | 10.7° / 8.8° | — | as A | reserve |

**Targets**, all checked by the scripts in §4:
- **Ways:** roads, streets, piazzas, plazas, landmark precincts and the 6 m margins. No cell over **38°** except on flights of steps. The controller slides at 40°.
- **Atlas roads:** steepest 4 m at most **25 %** (14°). The named clivi are included: Victoriae, Palatinus, Via Nova, Via Sacra at the Velia, Capitolinus, Argentarius, Publicius, Vicus Iugarius.
- **Minor streets:** none over **58 %** (30°) per 4 m, and no more than 15 over 45 % (today 150).
- **Designed hill flanks** (not cliffs): top grade at most **30°**. Easiest way up every hill at most **15°**.
- **Walkable ground over 40°:** at most **0.35 %** (today 0.53 %).
- **NPC navigation:** `NavGrid.canStep` refuses cells over 38° that are not on a flight.

**What moves, and how each part stays right:**

| Part | Under v2 | How it is kept right |
|---|---|---|
| Landmarks | Their pad elevations are unchanged; only the blends widen. | `frameOf`, `liftAll` and pads read `heightAt`. Gate: the structures and collision checks in §4. |
| Porticus Margaritaria | Moves to the mean ground. | One override record, read by both its pad and its builder. |
| City plan (blocks, streets) | Re-plans from the new ground. Block ids change. | Content uses coordinates, never block ids (checked). `PINNED_OPEN` holds by coordinate. Gates: every content place and NPC home can be stood on (routes-places), and the golden path passes. |
| Streets, kerbs, dressing, far apron, minimap tiles | Follow `heightAt` and the plan. | — |
| River, quays, canal | **Unchanged.** | Pads and road cut/fill are masked out of the channel, quay and canal bands. Gate: the water's edge moves 0.05 m or less at every quay sample. |
| Aqueducts, Forum of Trajan, interiors | Unchanged. | No vertical scale, so the channel elevation and relative heights stay. Piers follow the ground (FABRIC). |
| Spawns, checkpoints, NavGrid, golden path | Follow automatically. | `findSafeGround`, `heightAt`, colliders. |
| Saves | Positions were saved on the v1 ground. | The save stores its terrain profile. On load, if the profile differs or the feet are more than 1 m off the ground, the player is re-grounded with `findSafeGround` near the saved x, z. |
| Tests | Absolute elevations change under v2. | Old tests pass `profile: 'v1'`; new v2 tests are added. |

**The switch.** `src/world/terrain/profile.ts` exports `terrainProfile()`. It reads `?terrain=v1|v2`, and the default is one constant. Every GROUND change reads it: the interpolation, the patch diagonal, the stamp order, the margins, the flanks, the runs, the road cap, the island edge, the retaining features and the override. Under v1 the heights are byte-identical to today's main; a test checks the hash. Every other crew's fix must work under both profiles. Under v1 the retaining list is simply empty.

### 4. Crews for phase 4b

**Models.** Opus runs GROUND, STREETS, ROUTES and L-WEST. Sonnet runs G0, FABRIC, L-EAST and LOOK. If usage runs out, STREETS and L-WEST may fall back to Sonnet. GROUND and ROUTES wait for Opus rather than drop down.

**Rules for every crew:**
- Work in a worktree off `phase4b`, which is main after phase 3 has merged, plus G0.
- Touch only the files you own. A file nobody owns is frozen: ask the lead.
- Do not edit G0's audit tools. You may add new files under `scripts/audit/` prefixed with your crew's name. Report tool bugs to the lead with a repro.
- Any allowlist entry in `gates.json` needs the lead's approval and a screenshot proving the false positive.
- Measure only through `node scripts/audit/gate.mjs` or the tools themselves. G0's load guard holds a run when the machine is busy: the 4a numbers were taken at load averages of 66–84.
- Report:
  - a today / now / gate table for every metric you own
  - same-camera before/after pairs from `look.mjs --cams …`, viewed with the Read tool
  - `perf-budget.mjs` output
  - `npm run typecheck && npm test`
  - updates to the module doc you own

#### G0 — AUDIT (Sonnet)

**Owns:**
- `scripts/audit/**`, `src/dev/audit/**`, `docs/research/solid-ground/**`, `.gitignore`
- the `?audit` lines in `src/main.ts`, `src/gfx/release.ts` (`KEEP_CPU`), `src/gfx/MeshBuilder.ts` (the `auditRecordBuild` line) and `src/world/landmarks/builders/colos-kit.ts` (the `auditInstanced` line)
- `package.json` scripts

**Does:**
1. Merges W1–W6 onto `phase4b`. The only conflicts are `src/main.ts` (one `__audit` object with every hook, plus the collision import) and `geomAudit.ts` (the union of the three branches' additions).
2. Handles outputs:
   - gitignores `scripts/audit/out/`
   - commits `scripts/audit/baseline/<lens>.json`: counts plus the top 100 clusters, under 150 KB each
   - commits every screenshot cited in §2 as JPEG (30 MB at most in all) to `docs/research/solid-ground/before/`
3. Writes `scripts/audit/gate.mjs --tier fast|full [--lens …]`:
   - runs the tools and reduces each one to the metrics in `scripts/audit/gates.json` (metric, today, gate, direction)
   - prints a today / now / gate table and exits 1 on any miss
   - load guard: starts no browser audit while the 1-minute load is over 16, and allows at most 2 browser audits at once across the machine (lock files in the OS temp directory)
4. Writes `scripts/audit/cams.json`, with one named camera per finding in §2 (the auditors' own cameras), and `look.mjs --cams <ids> --out <dir> [--query terrain=v1]`. The camera is pinned at max(street, terrain) + 1.6 m, or uses the real third-person camera. It captures the **before** set now.
5. Makes the tool fixes the auditors asked for:
   - `look.mjs` camera height
   - street-fit skips balcony and awning detail items
   - surface walks snapped to nav cells
   - collision drops `:mid` ghost walls and `?:box` carts
   - structures allowlists runtime-filled spans until it records them
6. Adds `npm run audit:fast` and `npm run audit:full`.

**Accept:**
- `node scripts/audit/gate.mjs --tier fast` passes on the base and takes 25 minutes or less on a quiet machine.
- Typecheck and tests pass.
- `perf-budget.mjs` is unchanged: the audit code does nothing without `?audit`.
- A before shot exists for every camera.

#### GROUND (Opus): one ground, then gentler hills

**Owns:**
- `src/world/terrain/{heightmap.ts, Terrain.ts, quadtree.ts, terrainData.ts, profile.ts (new), regrade.ts (new)}`
- `src/world/rome/buildRome.ts`: `landmarkPads`, `PAD_EXTRA` and the v2 override
- `src/save/SaveSystem.ts`: the one re-grounding hunk
- `tests/terrain-*.test.ts`, plus new tests
- `docs/modules/terrain.md`

It does not edit `atlas.ts`: the historical values stay as they are.

**Part 1, G1a (merge first, small):**
- `profile.ts`
- `Heightmap.heightAt` under v2 interpolates on the b–c triangles: if tx + tz ≤ 1, h00 + (h10 − h00)·tx + (h01 − h00)·tz; otherwise h11 + (h01 − h11)·(1 − tx) + (h10 − h11)·(1 − tz).
- `patchGeometry` under v2 uses `idx.push(a, c, b, b, c, d)`.
- The physics heightfield is untouched.
- New test `tests/terrain-oneground.test.ts`:
  - at 20k random points, `heightAt` against a Rapier ray on a chunk heightfield: within 1 mm
  - `heightAt` against a CPU copy of the drawn leaf triangle: within 1 mm
  - the quadtree coverage and crack tests still pass
  - the v1 heights hash is unchanged

**Part 2, G1b:** every item of the §3 package, plus the save re-grounding and the v2 and v1 tests.

**Accept (scripts):**
- `npx vitest run tests/terrain-*.test.ts`
- `node scripts/audit/grades.mjs`, over ways excluding minor streets (STREETS owns those):
  - way cells over 38°: 0
  - atlas roads with a steepest 4 m over 25 %: 0 (today 6 roads are over 84 %)
  - designed flank top grade: 30° or less
  - easiest way up every hill: 15° or less
  - walkable ground over 40°: 0.35 % or less
- `node scripts/audit/grades-live.mjs --minutes 14`: 27 of 27 climbs get up (today 18), 0 'grade' stalls (today 3).
- `node scripts/audit/collision.mjs --only <the 40 story places>`:
  - the terrain line reads "matches the drawn diagonal 100 %"
  - |physics − drawn| max 0.01 m or less (today 1.19 m)
  - bare-ground float or sink over 4 cm: 0 (today 11,632)
- Water: the quay tests pass and the edge moves 0.05 m or less.
- `node scripts/golden-path.mjs` passes on v2 **and** with `?terrain=v1`.
- `perf-budget.mjs` within 2 %.
- Same-camera pairs in one build (`--query terrain=v1` against the default):
  - v05-terrain-diagonal
  - clivus-victoriae-side, clivus-palatinus-side
  - vianova-arch-titus-up, viasacra-velia-up
  - clivus-capitolinus-up, vicus-iugarius-tarpeian-side
  - island-edge-side
  - the core slope map (`terrain-grades-core.png`)

#### STREETS (Opus): street surfaces, kerbs, skirts, one surface per place

**Owns:**
- `src/world/city/{roads.ts, plan.ts, datum.ts, stubs.ts, detour.ts}`
- `src/arch/fabric/streets.ts`
- `src/world/terrain/dress.ts`
- `tests/city.{roads,plan,stairs,streetends,detour}.test.ts`
- `docs/modules/city.md` (streets part)

**Does:**
1. **Conforms every street surface to the ground.** This covers roads, vici, lanes, alleys, junctions, piazzas, ground cover and landings. Each surface is subdivided until its deviation from `heightAt` (at edge midpoints and the centroid) is 2 cm or less, then lifted by its datum LIFT.
2. **Skirts:** every open slab edge and kerb face runs down to the lowest `heightAt` under the edge minus 0.1 m, in the slab's material, with no collider.
3. **One surface per place.** Priority: road > junction > piazza > vicus > lane > alley > ground cover. A lower surface drops its triangles inside a higher one, and the boundary triangles are clipped. Ground cover:
   - never lies on paving
   - has its rim sunk 5 cm
   - merges neighbouring patches of the same material family
   - drops slivers under 3 m²
4. `dress.ts` puts no kerbstones inside the city's road and street corridors.
5. Builds retaining walls along `hm.features.retaining`: tufa ashlar, one box collider per 4 m, inside the street cell that holds them.
6. `plan.ts`: a minor street does not cross cells over 35°. It ends at the cliff, or that segment becomes a flight via `stairProfile`.
7. Colliders:
   - stairway parapet colliders match the drawn stepped parapet (1.1 m or less above the treads)
   - street-cell trimesh seams are welded
   - sidewalk box tops sit at the drawn kerb height (`SIDEWALK`)
8. Edges:
   - a 0.6 m dirt shoulder where a road meets terrain grass
   - a travertine edge course where an open road meets plaza paving (the Via Sacra in the Forum)

**Accept:**

| Script | Metric | Today | Gate |
|---|---|---|---|
| `street-fit.mjs` | lip cells ≥ 30 cm / ≥ 12 cm | 1,948 / 16,888 | 0 / ≤ 800 |
| | open edge > 3 cm, all kinds | 26.3 km | ≤ 1 km, none > 8 cm |
| | face-float > 0.1 m | 30 clusters | 0 |
| | double paving cells | 844,789 | ≤ 50,000 |
| | terrain-through cells | 34,722 | ≤ 3,000 |
| | dressing kerbstones on city paving | 59 | 0 |
| | z-fight cells | 35,416 | not higher |
| `grades.mjs` | minor streets > 58 % / > 45 % | 13 over 84 % / 150 | 0 / ≤ 15 |
| `collision.mjs --only <street stops>` | lips ≥ 10 cm / cracks | 1,038 / 195 | ≤ 100 / ≤ 20 |
| | parapet invisible wall at (−0.1, 8.16, 259.7) | present | gone |
| `surface.mjs --mode census` | holes / slivers < 3 m² | 3,100 / 14,461 | ≤ 300 / ≤ 3,000 |
| | patchwork mean / worst | 42.7 / 181 | ≤ 30 / ≤ 90 |
| `stepwalk.mjs --n 60 --modes walk,run` | kerb stalls | baseline | not higher |
| `perf-budget.mjs` | triangles / draw calls | baseline | +5 % / +2 % at most |

Shots:
- sf-lip1 and sf-lip2 (490, 265)
- 01-face-float (80.71, 14.39, 106.07)
- Via Ostiensis kerbs (−377.92, 7.4, 591.26)
- Horrea Piperataria (200.88, 15.81, 94.13)
- double paving (−470.13, 6.28, 585.38)
- seam-3 (266, 7.81, 552.5)
- seam-8 (51.5, 8.8, 1.2)
- the Markets lane (105.4, 22.5, −288.5)

#### FABRIC (Sonnet): city buildings, massing, walls and aqueducts on the ground

**Owns:**
- `src/arch/fabric/**`, except `streets.ts`
- `src/arch/props/**`
- `src/world/city/{fill.ts, massing.ts, monuments.ts, life.ts, frontage.ts, proximity.ts}`
- their tests
- `docs/modules/fabric.md`

**Does:**
1. **Foundations:** yMin = the minimum ground, sampled every 2 m or less along the whole outline, minus 0.5. This applies in insula ~123, domus 60, horrea 40, shops, and the back insulae in `fill.ts` ~125.
2. **Floors:** each open bay's floor = max(ground at both jambs 0.3 m out, highest ground under the room), plus a threshold step. Where that leaves a step over 0.3 m to the street, add a step, or close the shutters.
3. **Massing** (`lotMass`, `backLots`): base = minimum over the edge samples every 2 m − (0.4 + 0.32 + local relief).
4. **Walls** (`buildWall`): y0 = minimum over the footprint (both faces, every metre or less) − 0.6. Pieces are split into runs of 2 m or less where the grade is over 0.3.
   **Aqueducts:** piers and low walls take the minimum over 1 m samples along each bay and at the 4 pier corners, minus 0.5.
5. **Lot colliders** are notched around every drawn doorway and shop opening, a doorway deep, down to the drawn floor.
6. **Props** (frontage goods, `life.ts`) use `placeProp` with the ground at the lowest footprint corner. A prop that straddles a step over 0.3 m is skipped.

**Accept:**

| Script | Metric | Today | Gate |
|---|---|---|---|
| `structures.mjs --passes massing,blocks,monuments --levels full,low` | wall/aqueduct stretches ≥ 0.3 m | 33 | 0 |
| | buildings with a floating stretch > 0.1 m / any ≥ 0.25 m | 294 / some | ≤ 30 / 0 |
| | buildings with a buried opening ≥ 0.1 m / stretches ≥ 0.35 m | 388 / 239 | ≤ 40 / 0 |
| | buildings with terrain in a floor / worst | 343 / 2.48 m | ≤ 20 / ≤ 0.15 m |
| | far boxes > 0.1 m over the true terrain / over the drawn terrain beyond 614 m | 16 / 329 | 0 / ≤ 20, none > 0.3 m |
| | low detail: floating / sunk samples | 588 / 427 | ≤ 60 / ≤ 40 |
| `collision.mjs` | "city box with nothing drawn" invisible walls / embedded city boxes | 919 / 779 | ≤ 50 / ≤ 100 |
| `street-fit.mjs` | block props floating / sunk | 2,409 / 271 | ≤ 300 / ≤ 50, no foot in the air > 0.3 m |
| `perf-budget.mjs` | all | baseline | within 2 % |

Shots:
- chk-wall-quirinal (104.7, 25.55, −291.9)
- f-arcus-neroniani (556, 27.69, 470.1)
- terrain-in-floor-block-2 (−88.3, 22.44, 551.5)
- buried-opening-block-2 (−1021.1, 28.04, 136.6)
- floating-block-1 (−316.7, 23.78, 633.1)
- collision-26-invisible (259.3, 12.78, −156.8)
- the Janiculum ridge from the city (−1092.7, 35.3, 51.3)

#### L-WEST (Opus): Capena, Circus, Palatine, Forum, Capitol

**Owns:** `src/world/landmarks/builders/{palcirc-*.ts, palcirc/**, forum-*.ts, capfora-*.ts, capfora/**}`.

**Does:**
1. **Porta Capena** (`capenaParts.ts`):
   - the square collider becomes the paving's own triangles (a trimesh), or one box per paving cell topped at g + 0.28 (~403)
   - prop colliders fit each drawn prop and sit on the ground under it (~483)
   - the mid-detail block solid (~443) is split around its openings
   - the gate's floating stretch of 0.5–0.7 m is fixed
2. **Circus:** one box per pier, or per run of bays, for both `circus-bays` and `circus-bays-far`.
3. **Palatine:**
   - a substructure under the outer faces of the Domus Augustana wings, down to the ground (confirm from the air first)
   - the hippodrome floor on a pad or terraced
   - the Domus Tiberiana's substructure face meets the regraded Clivus Victoriae
4. **Forum** (`forum-vesta.ts` `atriumVestae`): terrace the back rooms (`embedTerraces`) with a retaining wall at the back.
5. **Capitol:**
   - the Jupiter flight starts at the clivus level, and treads under the ground are clipped
   - Tarpeian and Carmental outcrops (`capfora/cliff.ts`, `capfora-arx.ts`) get convex colliders within 6 m of a way, or are sunk into the heightfield
6. **Re-check, and fix if real:** Gardens of Adonis, Lupercal, Insula Aracoeli, Forum of Caesar.

**Accept:**
- `collision.mjs --only <ids for porta-capena, circus-maximus, caupona-carcerum, the Tarpeian Rock and the Carmental Gate>`:
  - 0 ledge or invisible defects on `box@305.77,9.39,561.18` and `box@292.28,9.64,572.49`
  - no prop box more than 0.15 m above its drawn prop
  - Circus ghost-wall probes 42 → 0
  - fall-through 0
  - Tarpeian ghost probes 368 → 20 or fewer
- `structures.mjs --passes landmarks --only <owned ids>`:
  - Vestals' terrain-in-floor 0 (today 5.35 m over 412 m²)
  - Capitoline flight sunk 0
  - Domus Augustana wall foot 0.3 m or less above the ground
  - no stretch of 0.6 m or more outside the allowlist
- `routes.mjs --only mq-01,mq-02`: the lead-ins at Capena are clean.
- Shots:
  - v01-capena-square-float
  - collision-28-ledge
  - collision-16-ghost-wall
  - f-vestae-floor
  - terrain-in-floor-landmark-5
  - collision-02-fallthrough
  - an aerial of floating-landmark-1

#### L-EAST (Sonnet): Colosseum valley, river and bridges

**Owns:**
- `src/world/landmarks/builders/{colos-*.ts (except the audit line in colos-kit.ts), river-*.ts, campus-*.ts, generic-*.ts, trajan-*.ts, janiculum.ts, vatican-tombs.ts}`
- `src/world/bridges/**`
- `src/world/water/**`

**Does:**
1. **River Port** (`river-port.ts`): a collider at the deck's own height, using `buildPlaza({ collide: true })` or a box from the bed to the quay top, as `ownQuay` does.
2. **Baths of Trajan** (`colos-baths.ts` ~236):
   - a blind-arch substructure under each exedra and the platform edge, down to the lowest ground − 0.5
   - the paving clipped to the terrace, or the terrace collider extended to the paving's edge with a parapet
3. **Moneta** (`colos-quarter.ts`): clip the box to the drawn yard, or draw the hall floors at the box top.
4. **Colosseum:** confirm the cavea underside in game, then close it down to the terrace.
5. **Emporium** (`campus-river.ts`):
   - the deck goes to the quay level of the new pad (GROUND adds the pad in `landmarkPads`)
   - fix the buried opening at (−361.1, 5.68, 587.4)
6. **Pons Cestius** (`src/world/bridges`): ramps or stairs at both ends, from the deck at 10–11 m down to the bank street at 5.2 m and to the island. Risers 0.2 m or less, with colliders.
7. **Re-check, and fix if real:**
   - Ludus Gallicus
   - Divus Claudius terrace
   - court lifts (`generic-civic.ts:725`, `campus-porticoes.ts:95`) brought to 2 cm or less

**Accept:**
- `collision.mjs --only <owned ids>`:
  - River Port deck ghost probes 0
  - Baths of Trajan fall-through 0
  - Moneta ledge probes 315 → 0
- `structures.mjs --passes landmarks,river --only <owned ids>`:
  - exedra and platform floating stretches of 0.3 m or more: 0
  - Emporium quay terrain-in-floor 0 (today about 1,700 m²)
  - river masonry terrain-in-floor 282 → 0
  - Colosseum cavea stretches visible from any camera zone: 25 → 0
- `routes.mjs --only misc-servus-aesculapii`, plus the tour to Tiber Island: 0 swims, 0 drops, and edge 371 no longer drops.
- `npx vitest run tests/terrain-water.test.ts` plus the Colosseum and landmark tests.
- Shots:
  - v04-river-port-quay
  - f-baths-trajan
  - collision-01-fallthrough
  - v02-moneta-ledge
  - f-colosseum-cavea
  - f-emporium-buried
  - pons-cestius-west-close

#### ROUTES (Opus): the street graph and the quest route

**Owns:**
- `src/nav/**`
- `src/world/city/network.ts`, plus the new `src/world/city/walks.ts`
- `src/ai/life/navgrid.ts`
- `src/life/jobs/posts.ts`
- `src/game/guide.ts`
- `src/world/interiors/columna.ts`: route points only
- three tiny shared edits:
  - `src/game/wiring.ts`: location height
  - `src/ui/hud/Hud.ts`: marker height
  - `src/content/install.ts`: altar placement in `addShrine`
- `scripts/golden-bot.js` and `scripts/golden-path.mjs`
- the nav, network and reach tests
- `docs/modules/nav.md` and `docs/modules/movement.md` (`canStep`)

**Does:**
1. **No edgeless nodes.** When `linkAround` finds no straight link, link along a short path on the LinkProbe raster (A* on 1 m cells within 90 m). `StreetRouter` never uses a degree-0 node, or a node in a minor component, as an entry or exit while a main-component node is within `nodeReach`.
2. **`walks.ts`:** explicit walking chains in landmark-local coordinates, so they follow the landmark:
   - Forum of Trajan: gateway, square, basilica porch, nave, back door, Column court
   - the imperial fora chain (Caesar, Augustus, Nerva, Trajan) to the Argiletum
   - a Ludus Magnus gate node (507, 165)
   - a doorway node for the caupona (−105, 6, 312)
3. **Probing atlas roads.** Atlas road polylines are probed with physics after the landmarks are built, and re-probed tile by tile as city colliders stream in. A wall hit gets a detour node, or the edge is cut. Bridges are included: the Pons Cestius edge drops out on its own until L-EAST's ramps exist, then returns. Tiber Island's components are joined to both bridge ends.
4. **Nodes off obstacles.** Piazza nodes sit on a ring beside the centrepiece. Junction nodes stay 1.5 m from altars. `addShrine` keeps compital altars 1.5 m from every graph edge.
5. **Lead-in and lead-out:**
   - both use `grid.lineClear` (body width)
   - once the goal's grid is ready, the lead-out is drawn with `grid.findPath`
   - `QuestRoute` re-plans once when the goal's grid first becomes ready, and again when the player has pushed for 3 s without gaining on the route (still at most once a second)
   - exits are ranked by a clear line; `entryReach` for exits drops from 45 to 25 m
6. **Heights and markers:**
   - targets with no height resolve to the nav floor or `heightAt`: `postTarget`, `guide.ts`, `wiring.ts`, and `collectMarkers`, which treats y = 0 as missing
   - job post markers snap to a walkable cell on the street side
   - the guide's palatine #2 waypoint moves out of block b609
   - the Column stair's route points go to mid-tread
7. **`NavGrid.canStep`** refuses cells over 38° that are not on a flight.
8. **The story bot** follows `game.questRoute.legs[0]`, and falls back to plain nav only after a logged stall.

**Accept:**

| Script | Metric | Today | Gate |
|---|---|---|---|
| `routes.mjs --phases guide,objectives` | FAIL / BLOCKED out of 72 routes | 4 / 33 | 0 / 0 |
| | snags (a jump or climb) | 7 | ≤ 3 |
| `routes.mjs --phases approach,tour,random,edges` | lead-out blocked / all blocked events | 208 / 322 | 0 / ≤ 20 |
| | tour aborted / timeouts / swims | 10 / 1 / 9 | 0 / 0 / 0 |
| `routes.mjs --probe scripts/audit/routes-places.js` | edgeless nodes | 154 | 0 |
| | core places with no street route from the Forum | 100 | 0 |
| | places > 30 m from a node / targets with no height | 181 / 17 | ≤ 10 / 0 |
| `routes.mjs --phases sweep` | edges flagged / through a solid | 367 / 246 | ≤ 90 / ≤ 20 |
| Unit tests | new: re-plan when the grid is ready, degree-0 entries skipped, no edgeless landmark node | — | pass |
| `golden-path.mjs`, `npcwalls.mjs` | — | baseline | pass / not worse |

Shots: big map with Your route, plus the player view, for:
- A-column-ulpia
- I-ludus-wall
- B-inn-b414
- F-colosseum-straight
- E-capena-altar
- C-argiletum-aemilia
- G-porticus
- H-ludus-piazza
- L-portus
- Q-mq03-etruscan-b694

#### LOOK (Sonnet): shadows, materials, pop-in

**Owns:**
- `src/world/sky/shadows.ts`
- `src/world/terrain/{groundTextures.ts, splat.ts, terrainMaterial.ts, romeInputs.ts}`
- the paving, travertine, basalt and cobble recipes in `src/gfx/textures/**`
- `src/world/landmarks/landmarkLod.ts`
- `src/world/city/streamer.ts`
- `src/gfx/prewarm.ts` (new), plus one call in `src/game/boot.ts`
- `scripts/audit/look-banding.mjs` (new)

**Does:**
1. **Banding:** A/B test with shadows off first. Then fix the bias term in `shadows.ts`: a slope-scaled normal bias for ground receivers, or a different sampling radius or noise. Check it holds at the 30 Hz shadow re-render.
2. **One travertine:** the terrain's `paving_travertine` layer packs the mesh's slab texture at the same 6 m world scale and tint.
3. **One basalt set at one scale** for roads, junctions and gates. The kerb tint moves closer to the paving, and the stain decals are toned down.
4. A clean near-LOD cut, with no dither, for pieces under 30 m.
5. **First arrival:** prewarm the NPC skin and eye materials and the ground textures while loading, and hold the fade-in until the first full blocks are built.
6. 8 m of hysteresis on each block LOD threshold (30, 85 and 140 m).
7. Reuse the transient texture that is created and freed each time.

**Accept:**
- `surface.mjs --mode census,settle,walk --max 243`:
  - stops changing more than 2 % after arrival: 1 → 0
  - LOD flip-flops 58 → 0
  - texture churn 15 → 0
  - the `paving_travertine` vs travertine repeat ratio 2.5 → 1.25 or less, and contrast halved
  - the cobbles vs basalt repeat ratio 2 → 1.3 or less
- `look-banding.mjs`: stripe energy at 2–6 px periods inside the shadowed ground mask, at 5 cameras, at most 30 % of today's.
- `perf-budget.mjs` within 2 %.
- `tests/terrain-splat.test.ts` passes.
- Shots:
  - shadow-banding-forum
  - seam-1 and twin-1
  - seam-2
  - seam-3
  - Porta Capena arrival and settled (304.5, 9.7, 573.5)

#### Order

The terrain change goes **first**. Every other fix is measured against the ground. If the terrain moved last, it would break the foundations, the street draping and the routes after they had been accepted.

```
phase 3 merged → G0 (merge) → wave 1 in parallel: GROUND part 1 (G1a, merge within hours), ROUTES, LOOK, L-WEST and L-EAST collider items
               → after G1a merges: STREETS and FABRIC start; GROUND does part 2 (G1b)
               → G1b merges before any final acceptance run of STREETS, FABRIC, L-WEST or L-EAST
```

Merge order into `phase4b`: **G0 → G1a → ROUTES → LOOK → G1b → L-EAST → L-WEST → FABRIC → STREETS.**
- STREETS goes last because it uses G1b's retaining edges and carries the triangle budget.
- The lead runs `gate.mjs --tier fast` after every merge, and `--tier full` once at the end, on a quiet machine.
- `phase4b` is pushed to main only when the full tier, `perf-budget.mjs`, `golden-path.mjs` and `check:controls` all pass.

### 5. Regression gates after phase 4

**Fast tier** (`npm run audit:fast`): before every merge into main. About 25 minutes on a quiet machine.

| Step | Command | Time | Fails on |
|---|---|---|---|
| Types and units | `npm run typecheck && npm test` | 3–4 min | any failure, including the one-ground, v2 grades, nav-route, collisionRules and audit-grades tests |
| Grades | `grades.mjs --no-climb --no-options` | 2.5 min (20 under load) | way cell > 38°, atlas road > 25 %, minor street > 58 %, designed flank > 30° |
| Street fit | `street-fit.mjs` | 3.5 min | the STREETS gates above |
| Story routes | `routes.mjs --phases guide,objectives --only mq-,lud-01` | about 10 min | any FAIL or BLOCKED |
| Collision on the story | `collision.mjs --only <40 story places> --confirm 0` | about 5 min | any fall-through, any ghost on a deck, gates.json numbers |
| Structures on the story | `structures.mjs --passes monuments,river,stairs,landmarks --only <story landmarks> --no-shots` | about 5 min | a stretch of 0.6 m or more not on the allowlist |

**Full tier** (`npm run audit:full`): nightly while map work is open, and before any push that touches `src/world`, `src/arch` or `src/nav`. About 3 hours, run in sequence:

| Command | Time |
|---|---|
| `structures.mjs` | 20 min |
| `collision.mjs` | 17 min |
| `surface.mjs --max 243` plus 7 walks | about 45 min |
| `routes.mjs`, all walk phases | 100 min |
| `routes.mjs --phases sweep`, in its own process at the same time | 60 min |
| `grades-live.mjs` | 14 min |
| `crawl.mjs` | 20 min |

On top of the full tier, the existing `perf-budget.mjs` and `golden-path.mjs`, and `check:controls` whenever input changes.

**Rules:**
- The numbers in `gates.json` only go down. A commit that raises one must say why, as with `--write-budget`.
- Only the lead refreshes the baselines.
- The load guard and the limit of two browser audits at once stay on.

### 6. Out of scope

- **A global vertical rescale** (×0.8 or ×0.7 above 12 m ASL; packages F and G). It is held in reserve until the owner has played v2. The dependent transforms are listed in W6's notes.
- **Removing cliffs, relaxing open ground, or raising the controller's 40° slide angle.** Raising it broke the spiral stairs and the Vesta podium before. Cliffs stay barriers.
- **Re-researching atlas elevations.** Only the Porticus Margaritaria is overridden, and only in v2.
- **New audit coverage:** the Aventine walk, a WebKit surface run, and checking the far stand-in swap at 220 m.
- **Art beyond unifying the material sets:** kerb and step edge wear, new textures, changes to the KTX2 pipeline.
- **Performance work** beyond holding phase 3's budget.
- **NPC crowd navigation** beyond the slope limit; minimap zoom; interiors other than the Column stair's route points.
- **Content changes**, except moving the guide's palatine #2 waypoint and snapping the job post markers.