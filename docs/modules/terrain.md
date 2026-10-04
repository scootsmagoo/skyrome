# Terrain, the Tiber and its banks

The ground of Rome and the river through it: the landform from the atlas, its rendering (one
draw call for the whole city), what it is made of underfoot, what grows and lies on it (grass,
trees, stones, kerbs), the Tiber and Agrippa's canal, the stone quays of the river port and the
Emporium, reeds on the natural banks, swimming and climbing out, and the edge of the world.

```ts
const hm = buildHeightmap(source, { pads });     // pure: heights + road/pad masks + features
game.terrain = new Terrain(game, hm);             // CDLOD splat terrain, colliders, LOD system
await buildWater(game, atlas, hm);                // Tiber, canal, quays, reeds, swimming → game.water
// … landmarks, bridges, city fabric …
dressTerrain(game);                               // grass, trees, stones, kerbs → game.dressing

game.terrain.heightAt(x, z);   game.terrain.normalAt(x, z);
game.terrain.surfaceAt(x, z);  // 'paved' | 'gravel' | 'dirt' | 'grass' | 'rock' | 'sand' | 'mud' | 'water'
game.water.levelAt(x, z);      game.water.depthAt(x, z);   game.water.currentAt(x, z);
```

`buildRome` does all of it (`dressTerrain` last, after `buildCity`); the landmark viewer calls
`buildWater` too.

Dev scene: `?scene=terrain` — the whole city's ground, the river, the sky and the player, no
landmarks (boots in ~2 s). Parameters: `&cam=overview|river|palatine|capitol|island|aventine|cliffs|emporium|janiculum|player`
(a free fly camera: WASD, arrow keys, Space / C up and down, Shift fast), `&hour=`, `&at=<landmark>`
(player spawn), `&lm=1` (core landmarks), `&flat=1` (no photo textures), `&wire=1` (tint by LOD
level), `&grass=0` (no grass tufts), `&dress=0` (no grass, trees, stones or kerbs).
`window.__terrainBench(n)` renders n frames synchronously and reports ms/frame, draw calls and
triangles.

## Files

| File | What |
| --- | --- |
| `src/world/terrain/heightmap.ts` | Atlas → height grid (pure). Hills, lowlands, the river valley, canals, quays, islands, roads leveled crosswise, building pads. Keeps the vector `features` for the renderer and the water. |
| `src/world/terrain/riverbanks.ts` | Where the Tiber's banks are stone quays in AD 113 (`TIBER_QUAYS`), river chainage/side queries (`chain`, `footOn`), a segment index for fast nearest-segment queries. |
| `src/world/terrain/terrainData.ts` | Per-sample shader data (pure): normals, road and pad signed-distance fields, pad kind, urban wear, garden lushness, canal water level. |
| `src/world/terrain/romeInputs.ts` | Atlas → splat inputs: region density, garden polygons, pad kind by landmark category, trodden tracks (`desirePaths`: the worn track from the Porta Capena, round the gate, to the head of the triumphal road — the atlas has no road there). |
| `src/world/terrain/splat.ts` | The ground-layer rules in TypeScript and their GLSL twin (`SPLAT_GLSL`). |
| `src/world/terrain/surface.ts` | Splat weights → footstep surface; surface → audio footstep bank. |
| `src/world/terrain/quadtree.ts` | CDLOD quadtree and patch selection (pure). |
| `src/world/terrain/terrainMaterial.ts` | The patched MeshStandardMaterial: CDLOD vertex shader, splat fragment shader. |
| `src/world/terrain/groundTextures.ts` | The library's ground photo sets packed into two texture arrays; flat fallback; the May palette. |
| `src/world/terrain/apron.ts` | Coarse land beyond the grid (to the horizon). |
| `src/world/terrain/grass.ts` | Grass tufts and flowers where the splat draws grass (vegetation kit `GrassField`). |
| `src/world/terrain/dress.ts` | `dressTerrain`: grass, trees and shrubs, stones and rubble, kerbstones; `BuiltProbe`; the pure placement rules. |
| `src/world/terrain/safety.ts` | Walls at the edge of the grid and the `SafetyNet` under the world. |
| `src/world/terrain/Terrain.ts` | The service: textures, mesh, colliders, edge walls, safety net, LOD system, queries. |
| `src/world/water/bodies.ts` | Water bodies in game space; `bodyAt`, `currentOf` (pure). |
| `src/world/water/surfaceMesh.ts` | Grid-aligned water surface with per-vertex current (pure arrays). |
| `src/world/water/waterMaterial.ts` | The river shader and its procedural ripple map. |
| `src/world/water/quays.ts` | Quay walls, coping, parapets, stairs with submerged steps, mooring blocks, the Cloaca Maxima outfall; Tiber Island's facing. |
| `src/world/water/canal.ts` | Agrippa's Euripus as masonry: walls, coping, paved strips, end wall, outfall sill, its water ribbon. |
| `src/world/water/reeds.ts` | Reed placement on the natural banks (pure). |
| `src/world/water/swim.ts` | Swimming and climbing out (a System) and its pure helpers. |
| `src/world/water/index.ts` | `buildWater`, `game.water` (`WaterService`), `WaterCamera`. |
| `src/scenes/terrain.ts` | Dev scene. |
| `tests/terrain-*.test.ts` | Quadtree coverage/cracks/budget, splat rules, terrain data, heightmap profiles, water, quays, reeds, swimming; `terrain-world` drives the real player controller, swim system and Rapier: climbing out at a quay, the parapet, wading out of the canal, the world edge and safety net; dressing rules, footstep banks. |

## Landform (`heightmap.ts`)

Everything is computed in real metres and m ASL, then scaled by `WORLD_SCALE` (0.6) both ways, on
a 2 m game grid (1711 × 1321 samples for `CITY_BOUNDS`, built in ~1 s).

1. **Ground**: `BASE_ELEVATION` blended into the lowland polygons.
2. **River valley** carved into the ground: bed 4 m below the water, a shelving underwater slope,
   a gravel/mud beach, a 1:3 cut bank up to `bankHeight`, then a 2 % flood plain for 120 m, then a
   steep rise. Canals (`kind: 'canal'`, the Euripus) come after the rivers (`canalBank`): a flat
   bed 1.6 m deep in a trench that runs on under the inner half of the masonry walls (`CANAL`:
   walls 2.4 m thick, their tops 0.5 m above the water), then a 3 m bank at kerb height wherever
   the land lies lower — the Euripus, fed by the Aqua Virgo at 10.5 m, ran a little above the
   10 m Campus — and a 7 m ramp down to the ground. The channel ends square at its end walls
   (`canalDistance`), and the canal yields where it reaches the Tiber's beach (its outfall).
3. **Hills** on top of that ground (plateau dome, slope to the ground, cliffs). Because the
   valley is cut into the ground *before* the hills, it can no longer shave them — previously the
   unbounded 2 % ramp flattened the Janiculum to ~21 m; it now stands at 70–80 m.
4. **Channel cut**: where a hill reaches the river, the channel cuts a 45° face into it (the
   Aventine's river cliff). Then the **quays**: deep water right at a masonry face, a flat quay top
   at the atlas `top` elevation for `width` m, blending back to the ground over 25 m. Quays and
   canals get no ground noise.
5. Islands, fine noise, then roads (leveled crosswise along a smoothed profile) and pads.

Cliffs run 13 m horizontally (not 9): steeper faces render as a sawtooth wherever a cliff runs
diagonally to the 2 m grid. Truly vertical rock (the Tarpeian Rock) is for landmark geometry.

Speed: polygon distances come from bilinear signed-distance grids (6 m cells), river queries go
through a segment index, and roads are stamped segment by segment (6.8 s → 1.0 s for the city).

## Rendering

**CDLOD** (Strugar 2010). One shared grid patch of 16 × 16 quads with skirts is drawn instanced:
every instance is a patch `[x0, z0, cell, level]`. A node at level L covers 32·2^L cells and is
drawn as its four quadrant patches; the quadtree picks per frame (after the camera, priority
101) which nodes and quadrants to draw, with frustum culling on min/max-height boxes. The vertex
shader reads heights from an R32F texture with `texelFetch` (bilinear by hand, so no float
filtering is needed), morphs odd vertices onto their even neighbours as the distance approaches
the level's range (no popping, no cracks; unit-tested: full coverage, no overlaps, at most one
level between neighbours), drops skirt vertices below the surface, and lowers coarse levels a
little (0.16 m at level 1 … ) so roads and pavements laid on the ground are never poked through by
its coarser approximation. Leaf range ≈ 205 m at full 2 m resolution, then ×3 per level.

The whole terrain is **one draw call** (plus one for the apron). It receives shadows but casts
none (hills are lit by the per-pixel normal; the sun's shadow box is only 150 m anyway).

**Splat.** Per-sample data textures (RGBA8, bilinear) give the 2 m normal, signed distances to
paved roads and to pads (distance fields keep 3–6 m roads crisp although samples are 2 m apart),
pad kind, urban wear (region density), garden lushness and a local water level (canals).
`splatWeights` (TS and GLSL, kept line-by-line identical) turns them into weights for nine layers:

| Layer | Where |
| --- | --- |
| grass / dry_grass | everywhere open; a wide green-gold blend: drier on south-facing and steep slopes and high ground, greener near water and in gardens |
| dirt | road verges, pad aprons, trodden ground in the dense regions, bare patches, eroded slopes, the river margin |
| rock (tufa) | slopes over ~31–41° (triplanar) |
| sand, mud | river margins: patchy gravelly sand above the waterline, mud at it |
| gravel / dirt / travertine | building pads by landmark category (`romeInputs.ts`): fora, markets, temples, baths, palaces → travertine; camps, circuses, warehouses → gravel; the rest beaten earth. Quay tops are travertine. |
| paving_basalt | atlas roads with basalt or steps paving |

The fragment shader takes the three strongest layers, samples them from two `DataArrayTexture`s
(albedo + height proxy; normal xy + roughness + AO), anti-tiles them (a rotated second sample
under a noise mask; a large-scale sample blended in with distance), height-blends them so stones
and tufts poke through, adds large-scale tone variation and darkens/glosses the wet margin at the
waterline. Fine-noise edges fade with distance (no speckle). Photos come from the material library's
sets (`public/textures`), re-packed at 1024² (albedo) and 512² (data), tinted to the palette in
`GROUND_PALETTE`; until they load (and in Node) 1×1 palette layers are used.

`surfaceAt` runs the same rules on the CPU, so footsteps match what is drawn. Use
`footstepSound(surface)` to pick the audio bank.

**Dressing** (`dress.ts`, `dressTerrain(game)`, run by `buildRome` after the city fabric). It asks
the physics world whether a spot is built over (`BuiltProbe`: a ray down; a surface more than
0.25 m above the terrain means a floor, wall, street, quay or trunk is there; cached per 2 m cell
and computed only when first asked), so nothing grows through anything built, whoever built it.
Placement is deterministic (hashes of the grid cell) and uses the splat inputs (`terrain.inputAt`).

- **Grass**: `addTerrainGrass` (two GrassFields, green and sun-dried tufts plus wildflowers, masked
  by the splat and the probe), on by default now.
- **Trees and shrubs** (`treeRule`, vegetation kit `Forest`, one Forest per 512 m tile so whole
  tiles behind the camera are frustum-culled; near LOD within 85 m, far LOD to 650 m; trunk
  colliders): by kind of place — gardens (stone pines, cypresses, planes, laurels, oleander),
  hill slopes (olives, cypresses, pines, oleander), natural river banks within ~22 m of the
  channel (planes, laurels, figs), the open aprons round temples and tombs (cypress groves), the
  verges of roads out of town (cypresses and stone pines: the Via Appia), sparse figs and laurels in
  the quarters, scattered olives in the open. Never on roads, paving, pads, wet margins or rock;
  denser along the first walk (Porta Capena → triumphal road → Via Sacra, `goldenRoute`). Clear of
  built things by each species' canopy (`TREE_CLEARANCE`). ~20k plants city-wide, two variants per
  species.
- **Stones** (`stoneRule`): tufa boulders on the rock outcrops, pebbles on the beaches and road
  verges, travertine blocks and broken brick on the trodden ground of the quarters. Instanced per
  256 m tile, culled beyond 170 m.
- **Kerbstones** along the basalt roads (weathered travertine, 0.11 m above the paving), broken at
  junctions, pads, the water and anything built; per 256 m tile, culled beyond 320 m.

Cost: ~0.3 s to place; in the views below the dressing adds ~130–200 draw calls and 0.4–0.65 M
triangles. A city module that lays its own kerbed streets can pass `{ kerbs: false }`.

**Apron.** Beyond `CITY_BOUNDS` a 75 m-cell ring (4.5 km) follows the atlas landform (the
Janiculum ridge, the Vatican, the Tiber valley north to the Mulvian bridge), vertex-coloured, with
the river channel sunk so the water shows; its outer rings bend down into the haze.
`terrain.farHeightAt(x, z)` gives heights anywhere. It is scenery: invisible walls 4 m inside the
grid edge stop the player (`safety.ts`), and a `SafetyNet` (priority −9) returns anyone who still
falls below the world (30 m under its lowest ground) to where they last stood on solid ground
(`player:rescued`).

## Water (`src/world/water`)

- **Surface**: every 4 m grid cell over the river channel where the ground dips below the water
  becomes a flat quad at the river's level (no overlaps at bends, Tiber Island simply left out);
  continues beyond the grid. The canal's water is a ribbon exactly between its walls, merged in.
  One draw call, ~30k triangles.
- **Shader** (patched MeshStandardMaterial, so IBL reflections, Fresnel, shadows and the sky's fog
  work): Tiber *flavus* colour from depth (water level minus the terrain height texture — no depth
  pre-pass), soft shoreline (alpha over the last 0.45 m) with a broken silt line, flow-mapped
  ripples (two phases of a tileable procedural normal map pushed downstream at the local current,
  ~1 m/s mid-channel, still at the banks) plus wind ripples, flattened with distance; a sharp
  extra sun-glint lobe. The Tiber is turbid: its sky reflection is damped and silt-tinted
  (`uReflect`) and light scattered back out of the silt is added at every angle (`uMurk`), so it
  stays yellow-brown at the grazing angles a walker sees it at; the canal's spring water is clear
  and dark (`aClear`). `game.water.uniforms` holds the colours (`uDeep`, `uShallow`, `uSilt`) and
  these two. `WaterCamera` (priority 100.5, right after the rig) keeps any camera over the water at
  least 0.2 m above the surface, so a swimmer looking up, or a fall from a quay, never shows the
  dry bed under the single-sided surface.
- **Quays** (`TIBER_QUAYS`, research §5.3): Portus Tiberinus and below the Aventine in opus
  reticulatum, the Trajanic Emporium and the Transtiberim wharves in brick, all on a dark peperino
  waterline course with a travertine coping standing 0.2 m proud; paired travertine stairs to a
  landing just above the water every ~110 m, kept clear of the bridges (risers ≤ 0.2 m, treads
  0.32 m, box colliders), with cheek walls on the flights' river side and submerged steps along
  the whole front down to 1.55 m below the water, so a swimmer who reaches the stairs anywhere
  walks (or climbs) out; a low travertine parapet on the coping (0.9 m over the quay, more than a
  jump), open at the stair heads, the bridges' abutments (`bridgeCorridors`), across each opening
  in the face and `QUAY.gapFlank` (2 m) beyond it on both sides (the flight that climbs out of the
  Cloaca outfall's flank starts there; this is data, so it holds in any build order) and wherever a
  landmark built before the water already stands out over the river at the wall (a physics probe;
  note Rapier queries only see colliders added before the last `step`, which the game doesn't run
  during setup, so the probe is inert in a real boot), so falling in is a choice; pierced
  mooring blocks every ~14 m; the arched mouth of the Cloaca Maxima (three rings of peperino
  voussoirs, the dark culvert behind) in the Portus quay.
  Colliders: one oriented box per 4 m wall segment plus the coping and the parapet.
- **Tiber Island** is the travertine "stone ship" of the 1st c. BC: a facing wall all round its
  outline (the heightmap gives the island near-vertical sides to match), leaving 16 m around the
  `island-prow` landmark for its carved prow, with the same parapet (open at the two bridges) and a
  flight of stairs to the water on each long side.
- **Agrippa's Euripus** (`canal.ts`): tufa walls under a travertine coping, paved strips behind
  them, an end wall at the Stagnum end and a sill where it spills toward the Tiber; colliders on
  the walls. Its water stands 0.96 m deep, so it is waded, not swum.
- **Reeds** (vegetation kit `reeds`, instanced `Forest`, 150 m range): stands along the natural
  banks on the margin −0.35…+0.9 m about the water, never on quays, near bridges, on roads or pads,
  or on Tiber Island. ~1350 clumps.
- **Swimming** (`SwimSystem`, priority −11, before the player controller): in water deeper than
  1.45 m the player floats with the eyes just above the surface, strokes at 1.4 m/s (2.2
  sprinting) through the controller's composable `speedMultiplier`, cannot jump, drifts with the
  current, and — as GDD §12.1 requires for v0.1 — is swept back toward their own bank in
  mid-channel (2.6 m/s, more than a sprinting stroke), so Transtiberim is reached only over a
  bridge. Out of the water below 1.2 m (depth is measured against the physics world, so steps and
  landings count). Sets `player.swimming`, emits `player:swim`, and turns the controller's
  `canJump` off while afloat.
- **Climbing out**: swimming, wading, or standing awash and pushing (without moving) at a ledge no
  higher than 1.35 m above the water — a landing, a submerged step, the canal's kerb — pulls the
  player up onto it in about half a second (`findLedge`, `mantlePose`; `player:mantle`, `climbing`).
  Tuning: `game.water.swim.tuning` (`crossable`, `currentScale`, speeds, `mantleReach`).

## Performance (Apple M4 Max, 1080p)

Terrain scene (`__terrainBench`, everything dressed, no landmarks):

| View | Terrain patches / triangles | Scene draw calls / triangles | ms/frame (Chromium) |
| --- | --- | --- | --- |
| Whole city from above the Janiculum | 424 / 271k | 139 / 873k | 5.4 |
| Overview from 900 m up (beyond the trees' 650 m) | 272 / 174k | 30 / 310k | 3.2 |
| Palatine | 326 / 209k | 163 / 759k | 2.3 |
| Tiber bank at ground level | 281 / 180k | 166 / 695k | 3.5 |

Rome (`?scene=rome`, core landmarks, everything dressed): the Porta Capena from 25 m up 572 draw
calls / 1.77 M triangles; the triumphal road at eye height 386 / 0.96 M; the Via Sacra at the
Velia 722 / 1.69 M; the city from 140 m over the Caelian 339 / 0.99 M — all at 60 fps, inside
the 1500 / 3 M budget. Terrain alone ≈ 1.3 ms of the Janiculum frame. Build: heightmap 1.0 s,
terrain 0.6 s, water 0.16 s, dressing 0.3 s; the photo arrays are packed asynchronously
(`terrain.ready`). The headless timings are noisy (±50 %).

## Integration notes

- `Terrain`'s public API is unchanged (`constructor(game, hm, opts)`, `heightAt`, `normalAt`,
  `surfaceAt`, `group`, `material`); `Surface` gained `'gravel'` and `'mud'`. New: `weightsAt`,
  `farHeightAt`, `ready`, `lodStats`, `refreshHeights()` (after editing `hm.heights`), `uniforms`.
- The terrain mesh is not ray-pickable (it is an instanced unit grid); use physics or `heightAt`.
- `dressTerrain` runs last in `buildRome` (after `buildCity`) and keeps out of anything with a
  collider. A city module that builds blocks lazily later, or lays its own kerbed streets, should
  either build before it or pass `{ kerbs: false }` / ask for a re-dress; its gardens and piazzas
  can keep planting their own trees (`tree` spots).
- Events: `player:swim`, `player:mantle` (climbed out), `player:rescued` (the safety net).
- Harbour landmarks (`portus-tiberinus`, `emporium`) and `cloaca-maxima-outlet` should not build
  their own embankment walls: the quays and the outfall arch come from here. Their builders can
  add cranes, ramps, warehouses and the culvert interior (the outfall floor is at 4.7 m ASL).
- Combat should refuse attacks, blocks and weapon draws while `player.swimming` (one line in its
  input gate; there is no combat module on main yet — jumping and dodging are already off through
  the controller's `canJump`); the RPG's Tiber Swimmer perk can set
  `game.water.swim.tuning.currentScale = 0.6` and `crossable = true`, and award Athletics XP from
  `player:swim`.
- Bridges (`buildBridges`) can read `game.water` and `game.terrain.farHeightAt`.

## Known limitations

- Steep cliffs are heightfield slopes (66°), not overhangs; the Tarpeian Rock wants landmark rock.
- Regular paving (travertine slabs) still moirés a little at grazing distances despite a mip
  bias; buildings' own floors cover most paved pads.
- The apron is vertex-coloured: from very high up (the overview) its tone differs a little from
  the textured city ground.
- No underwater view (the camera is kept above the surface); the avatar has no swim or climb
  animation yet (it shows its airborne pose).
- The edge walls are invisible; the apron beyond them looks walkable. A gate or a "turn back"
  message would read better.
- The kit lacks poplars and willows, so the banks get planes, laurels and figs.
- Trees fade out beyond 650 m (from very high up the far city is bare); there are no impostors.
- NPCs don't know about water; their navigation should avoid `game.water.depthAt(x, z) > 1.2`.
