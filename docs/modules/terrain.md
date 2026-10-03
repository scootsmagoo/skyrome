# Terrain, the Tiber and its banks

The ground of Rome and the river through it: the landform from the atlas, its rendering (one
draw call for the whole city), what it is made of underfoot, the Tiber and Agrippa's canal, the
stone quays of the river port and the Emporium, reeds on the natural banks, and swimming.

```ts
const hm = buildHeightmap(source, { pads });     // pure: heights + road/pad masks + features
game.terrain = new Terrain(game, hm);             // CDLOD splat terrain, colliders, LOD system
await buildWater(game, atlas, hm);                // Tiber, canal, quays, reeds, swimming → game.water

game.terrain.heightAt(x, z);   game.terrain.normalAt(x, z);
game.terrain.surfaceAt(x, z);  // 'paved' | 'gravel' | 'dirt' | 'grass' | 'rock' | 'sand' | 'mud' | 'water'
game.water.levelAt(x, z);      game.water.depthAt(x, z);   game.water.currentAt(x, z);
```

`buildRome` already does all three; the landmark viewer now calls `buildWater` too.

Dev scene: `?scene=terrain` — the whole city's ground, the river, the sky and the player, no
landmarks (boots in ~2 s). Parameters: `&cam=overview|river|palatine|capitol|island|aventine|cliffs|emporium|janiculum|player`
(a free fly camera: WASD, arrow keys, Space / C up and down, Shift fast), `&hour=`, `&at=<landmark>`
(player spawn), `&lm=1` (core landmarks), `&flat=1` (no photo textures), `&wire=1` (tint by LOD
level), `&grass=0` (no grass tufts). `window.__terrainBench(n)` renders n frames synchronously and
reports ms/frame, draw calls and triangles.

## Files

| File | What |
| --- | --- |
| `src/world/terrain/heightmap.ts` | Atlas → height grid (pure). Hills, lowlands, the river valley, canals, quays, islands, roads leveled crosswise, building pads. Keeps the vector `features` for the renderer and the water. |
| `src/world/terrain/riverbanks.ts` | Where the Tiber's banks are stone quays in AD 113 (`TIBER_QUAYS`), river chainage/side queries (`chain`, `footOn`), a segment index for fast nearest-segment queries. |
| `src/world/terrain/terrainData.ts` | Per-sample shader data (pure): normals, road and pad signed-distance fields, pad kind, urban wear, garden lushness, canal water level. |
| `src/world/terrain/romeInputs.ts` | Atlas → splat inputs: region density, garden polygons, pad kind by landmark category. |
| `src/world/terrain/splat.ts` | The ground-layer rules in TypeScript and their GLSL twin (`SPLAT_GLSL`). |
| `src/world/terrain/surface.ts` | Splat weights → footstep surface; surface → audio footstep bank. |
| `src/world/terrain/quadtree.ts` | CDLOD quadtree and patch selection (pure). |
| `src/world/terrain/terrainMaterial.ts` | The patched MeshStandardMaterial: CDLOD vertex shader, splat fragment shader. |
| `src/world/terrain/groundTextures.ts` | The library's ground photo sets packed into two texture arrays; flat fallback; the May palette. |
| `src/world/terrain/apron.ts` | Coarse land beyond the grid (to the horizon). |
| `src/world/terrain/grass.ts` | Opt-in grass tufts and flowers where the splat draws grass (vegetation kit `GrassField`). |
| `src/world/terrain/Terrain.ts` | The service: textures, mesh, colliders, LOD system, queries. |
| `src/world/water/bodies.ts` | Water bodies in game space; `bodyAt`, `currentOf` (pure). |
| `src/world/water/surfaceMesh.ts` | Grid-aligned water surface with per-vertex current (pure arrays). |
| `src/world/water/waterMaterial.ts` | The river shader and its procedural ripple map. |
| `src/world/water/quays.ts` | Quay walls, coping, stairs, mooring blocks, the Cloaca Maxima outfall. |
| `src/world/water/reeds.ts` | Reed placement on the natural banks (pure). |
| `src/world/water/swim.ts` | Swimming (a System) and its pure helpers. |
| `src/world/water/index.ts` | `buildWater` and `game.water` (`WaterService`). |
| `src/scenes/terrain.ts` | Dev scene. |
| `tests/terrain-*.test.ts` | Quadtree coverage/cracks/budget, splat rules, terrain data, heightmap profiles, water, quays, reeds, swimming. |

## Landform (`heightmap.ts`)

Everything is computed in real metres and m ASL, then scaled by `WORLD_SCALE` (0.6) both ways, on
a 2 m game grid (1711 × 1321 samples for `CITY_BOUNDS`, built in ~1 s).

1. **Ground**: `BASE_ELEVATION` blended into the lowland polygons.
2. **River valley** carved into the ground: bed 4 m below the water, a shelving underwater slope,
   a gravel/mud beach, a 1:3 cut bank up to `bankHeight`, then a 2 % flood plain for 120 m, then a
   steep rise. Canals (`kind: 'canal'`, the Euripus) are a flat bed 1.6 m deep between vertical
   sides, nothing else.
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

**Apron.** Beyond `CITY_BOUNDS` a 75 m-cell ring (4.5 km) follows the atlas landform (the
Janiculum ridge, the Vatican, the Tiber valley north to the Mulvian bridge), vertex-coloured, with
the river channel sunk so the water shows; its outer rings bend down into the haze.
`terrain.farHeightAt(x, z)` gives heights anywhere.

## Water (`src/world/water`)

- **Surface**: every 4 m grid cell over a channel where the ground dips below the water becomes a
  flat quad at that body's level (no overlaps at bends, Tiber Island simply left out; the canal
  yields to the river where they meet); continues beyond the grid. One draw call, ~30k triangles.
- **Shader** (patched MeshStandardMaterial, so IBL reflections, Fresnel, shadows and the sky's fog
  work): Tiber *flavus* colour from depth (water level minus the terrain height texture — no depth
  pre-pass), soft shoreline (alpha over the last 0.45 m) with a broken silt line, flow-mapped
  ripples (two phases of a tileable procedural normal map pushed downstream at the local current,
  ~1 m/s mid-channel, still at the banks) plus wind ripples, flattened with distance; a sharp
  extra sun-glint lobe. `game.water.uniforms` holds the colours (`uDeep`, `uShallow`, `uSilt`).
- **Quays** (`TIBER_QUAYS`, research §5.3): Portus Tiberinus and below the Aventine in opus
  reticulatum, the Trajanic Emporium and the Transtiberim wharves in brick, all on a dark peperino
  waterline course with a travertine coping standing 0.2 m proud; paired travertine stairs to a
  landing just above the water every ~110 m (risers ≤ 0.2 m, treads 0.32 m, box colliders);
  pierced mooring blocks every ~14 m; the arched mouth of the Cloaca Maxima (three rings of
  peperino voussoirs, the dark culvert behind) in the Portus quay. Colliders: one oriented box per
  4 m wall segment plus the coping.
- **Reeds** (vegetation kit `reeds`, instanced `Forest`, 150 m range): stands along the natural
  banks on the margin −0.35…+0.9 m about the water, never on quays, near bridges, on roads or pads,
  or on Tiber Island. ~1350 clumps.
- **Swimming** (`SwimSystem`, priority −11, before the player controller): in water deeper than
  1.45 m the player floats with the eyes just above the surface, strokes at 1.4 m/s (2.2
  sprinting) through the controller's composable `speedMultiplier`, cannot jump, drifts with the
  current, and — as GDD §12.1 requires for v0.1 — is swept back toward their own bank in
  mid-channel (2.6 m/s, more than a sprinting stroke), so Transtiberim is reached only over a
  bridge. Out of the water below 1.2 m. Sets `player.swimming` and emits `player:swim`.
  Tuning: `game.water.swim.tuning` (`crossable`, `currentScale`, speeds).

## Performance (Apple M4 Max, 1080p, terrain scene, `__terrainBench`)

| View | Terrain patches / triangles | Scene draw calls / triangles | ms/frame (Chromium) |
| --- | --- | --- | --- |
| Whole city from above the Janiculum | 424 / 271k | 36 / 401k | 2.9–4.3 (WebKit 7.4) |
| Overview from 900 m up | 272 / 174k | 30 / 297k | 2.1 |
| Palatine | 326 / 209k | 36 / 338k | 2.3 |
| Tiber bank at ground level (with grass) | 251 / 161k | 15 / 255k | 2.8 |

Terrain alone ≈ 1.3 ms of the Janiculum frame. Build: heightmap 1.0 s, terrain (data textures,
apron) 0.6 s, water 0.16 s; the photo arrays are packed asynchronously (`terrain.ready`).
The headless timings are noisy (±50 %); all are far inside the budget (< 150 draw calls,
< 1.5 M triangles for the whole city terrain).

## Integration notes

- `Terrain`'s public API is unchanged (`constructor(game, hm, opts)`, `heightAt`, `normalAt`,
  `surfaceAt`, `group`, `material`); `Surface` gained `'gravel'` and `'mud'`. New: `weightsAt`,
  `farHeightAt`, `ready`, `lodStats`, `refreshHeights()` (after editing `hm.heights`), `uniforms`.
- The terrain mesh is not ray-pickable (it is an instanced unit grid); use physics or `heightAt`.
- Grass tufts are opt-in: `addTerrainGrass(game, game.terrain)` (the city or vegetation module
  should decide; ~250k triangles near the camera at the default density).
- Harbour landmarks (`portus-tiberinus`, `emporium`) and `cloaca-maxima-outlet` should not build
  their own embankment walls: the quays and the outfall arch come from here. Their builders can
  add cranes, ramps, warehouses and the culvert interior (the outfall floor is at 4.7 m ASL).
- Combat should refuse attacks while `player.swimming`; the RPG's Tiber Swimmer perk can set
  `game.water.swim.tuning.currentScale = 0.6` and `crossable = true`, and award Athletics XP from
  `player:swim`.
- Bridges (`buildBridges`) can read `game.water` and `game.terrain.farHeightAt`.

## Known limitations

- Steep cliffs are heightfield slopes (66°), not overhangs; the Tarpeian Rock wants landmark rock.
- The apron is vertex-coloured: from very high up (the overview) its tone differs a little from
  the textured city ground.
- No underwater view (the camera stays above the surface while swimming); the avatar has no swim
  animation yet (it shows its airborne pose).
- NPCs don't know about water; their navigation should avoid `game.water.depthAt(x, z) > 1.2`.
