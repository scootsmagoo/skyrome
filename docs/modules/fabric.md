# City fabric, props and vegetation

The ordinary city around the landmarks: apartment blocks, town houses, shops, warehouses, street
shrines and fountains, streets and stairs, the props of daily life, and the trees, grass and ivy of
Rome. All of it is procedural TypeScript, built with `MeshBuilder` and the shared material ids, so it
merges into a handful of draw calls per city block and picks up the textured PBR materials once they
are registered.

- `src/arch/fabric/`: building generators, streets and the `CityBlockFiller`
- `src/arch/props/`: `makeProp`, `placeProp`, `PropScatter`, 40 prop kinds
- `src/arch/vegetation/`: tree and shrub species, `Forest` (instancing with LOD), `GrassField`, wind, ivy, vines and hedges
- `src/scenes/fabric.ts`: the dev scene

Open it with `npm run dev` and then `?scene=fabric`. Other views are
`&gallery=props`, `&gallery=buildings`, `&gallery=trees` and `&spots` (draws NPC spots as coloured pins).

## Conventions

- **Units** are meters, at 1:1 human scale. A storey is about 3 m, a door 2.2 to 2.5 m and a shop opening 2.1 to 3.5 m wide.
- **Local frames.** Every building is generated in its own frame. The footprint `width` (x) × `depth` (z) is centred on the origin, the street front faces **−z**, and the floor level is **y = 0**. Wall pieces use a "wall frame": the outer face lies at z = 0 facing −z and the wall extends toward +z. Place a building with `placeAndRegister(game, id, out.builder.build(id), out.builder.colliders, pos, rotY)`, or merge it with `builder.append(out.builder, matrix)`, which is what the filler does.
- **Ground.** Generators take `groundAt(x, z)`: the terrain relative to the floor, in local coordinates. Where the terrain falls away, walls continue down to a foundation below the lowest corner, and each shop bay gets its own floor at street level. That gives stepped shop fronts on sloping streets, the way they look on the Via dell'Abbondanza. Plastered walls get a masonry socle (tufa or travertine) over any foundation the slope exposes below the floor, and a red or yellow-ochre dado about 1.1 m tall that follows the ground (or sits on the socle). Brick walls simply continue down.
- **Spots** (`Spot { id, kind, position, facing, tag? }`) are hooks for NPCs and quests. The kinds are `shopDoor`, `houseDoor`, `fountain`, `shrine`, `bench`, `stall`, `tree`, `well` and `workshop`. `position` is on walkable ground. `facing` is a heading (+Z model convention) pointing **out** toward the street: the way a shopkeeper at the counter looks. A customer should face `facing + π`. `tag` carries the shop kind (`'thermopolium'`, `'smithy'` …), `'domus'`, `'stair'`, `'aedicula'`, or a tree species for `tree` spots.
- **Determinism.** Everything is seeded (`Rng`), so the same seed gives the same geometry, lots and spots.
- **Levels of detail** (`Detail`): every generator and the filler take `detail: 'full' | 'mid' | 'low'`. All three have identical massing. `'full'` has everything, including enterable shop interiors, props and colliders. `'mid'` is the exterior as seen from the street (shutters, balconies, awnings, tile ribs), with dark shop mouths, no props and no colliders. `'low'` is the far stand-in: plain roofs, and openings painted flat on plain wall slabs (`Draw.flatWalls()`), at about 12% of the full triangles. Decorative randomness comes from forked RNGs, so `'mid'` matches `'full'` exactly wherever both draw something.

## Buildings (`src/arch/fabric`)

| Function | What it makes |
| --- | --- |
| `insula(spec)` | Apartment block, 3 to 6 storeys and clamped to Trajan's 60-foot limit (`MAX_BUILDING_HEIGHT` = 17.7 m). It is brick-faced (opus testaceum, with relieving arches over lintels) or plastered (cream, ochre, white or red, with a painted dado). The ground floor holds tabernae (lintelled or segmental-arched openings, plank shutters or open shops), stair doors with steps rising into the dark, and mezzanine windows. Upper floors get regular windows with sills and open, half-open or closed shutters, wooden balconies (maeniana) on joists with X-lattice rails, string courses, a cornice, and a hip or gable tile roof with imbrex ridges. Options: `courtyard` (light well with a ring roof and inner facades), `portico` (Neronian street arcade carrying a terrace), `bays` (explicit shop kinds), `sides` (party walls get no windows), `sideShops` (corner lots: shops and sometimes a shrine aedicula on the side street), `detail: 'low'`. |
| `domus(spec)` | Town house. Blank plastered street walls let out as shops either side of a tall travertine doorway with pilasters and studded doors standing ajar. Behind them: an atrium under a compluviate roof with a marble impluvium, a tablinum block, and a peristyle garden with red-and-white Pompeian columns, box hedges and a fountain. Emits `tree` spots in the garden. |
| `horrea(spec)` | Warehouse. Brick wings around a courtyard with two storeys of storage cells, slit windows, and a gateway with engaged columns and a pediment (after the Horrea Epagathiana). The gate passage and the courtyard are walkable. |
| `shopInterior(draw, kind, room, rng)` | Dresses a shop room. Kinds (`SHOP_KINDS`): `thermopolium` (L-shaped counter with sunken dolia, stepped shelf, hearth, lararium), `bakery` (hourglass mill, oven, loaves), `fullonica` (vats, drying cloth, urine jars by the door), `cobbler`, `butcher`, `wine` (amphora rack, dolium), `smithy` (forge with glow, anvil, trough), `barber`, `moneychanger` (coin stacks, scales, strongbox), `general`, `pottery`, `textile` (loom). `shopFrontage()` places goods and benches on the sidewalk. |
| `compitalShrine`, `lararium`, `aedicula`, `streetAltar` | Street religion. The compitum shrine of the Lares stands at crossroads, with painted Lares and an altar. |
| `lacus(draw, rng)` | Public fountain: four clamped stone slabs, a spout pillar with a head, a jet of water and a worn stepping stone. It returns the spots where people stand to fill jars. |
| `scaffolding`, `treadwheelCrane` | A building site (as at the Pantheon rebuilding): scaffolding with plank decks and bracing, and a magna rota crane with an A-frame jib, a treadwheel, a pulley block, ropes and a hanging block. |
| `velum`, `pergola` | Striped awnings on poles, and timber or brick pergolas. Pair a pergola with `vineCanopy` from the vegetation module. |
| `roof(draw, spec)` | Tile roof: `'hip'`, `'gable'`, `'ring'` (courtyard or compluviate atrium; `ridgeAt` moves the ridge toward the walls) or `'shed'`. The planes are stepped into 0.5 m courses of tegulae (each lower edge 3.5 cm proud of the course below), with imbrex ribs running up-slope over them. Each plane has its own UVs: U along its eave, V up the slope, 2 m per repeat. |
| `wall`, `windowDetails`, `doorFrame`, `doorLeaves`, `plankShutters`, `band`, `archBand`, `socleAndDado` | Building blocks. A wall with openings is one extruded shape with holes, so reveals have real depth (on a `flatWalls()` frame it is a plain slab with each opening painted on in its `fill` colour). `socleAndDado` draws the terrain-following socle and dado. |
| `Draw` | `MeshBuilder` plus a local frame: `box`, `span`, `cyl`, `rod`, `ellipsoid`, `geo`, `tris` (optionally with its own `uvs`), `poly`, collider-only `solid` / `solidCyl`, and nested frames `at(x, y, z, rotY)`. `noShadow()` gives a frame whose parts never cast shadows; shop interiors use it, since they sit in the building's own shadow anyway. |

### Streets (`streets.ts`), all draped on a `heightAt(x, z)` in world space

- **Traversal contract** (`src/core/traversal.ts`): `KERB` 0.15 m is the one kerb height (`buildStreet`'s default), `STEP_ASSIST_MAX` 0.3 m is what the Actor's step-up takes in stride, `AUTOSTEP_MAX` is Rapier's (0.45, not relied on), and `NAV_MAX_STEP` (= the assist) is the most the NPC planner accepts between cells. Nothing the planner connects may need more than the Actor can climb. `placeProp(…, { ground })` (`props/ground.ts`) sits a prop on its footprint: it leans with the ground (at most 15 %) and sinks until no corner floats; pass `ground: H` (or `groundIn(draw, H)` in a local frame).
- `buildStreet(builder, { points, kind: 'paved' | 'lane', roadWidth, sidewalk, curb, steppingStones, … }, heightAt)` makes a cambered basalt roadway (selce) between travertine curbs and raised cobbled sidewalks (crepidines), with Pompeian stepping stones at given distances. Lanes are crowned gravel or dirt. It adds a trimesh collider for the walkable surfaces and returns the property-line polylines on both sides. **Streets must not overlap one another.** End a lane at the edge of the street it meets, and put a plaza over crossings.
- `buildPlaza(builder, polygon, heightAt, { material, lift, exclude })` paves any polygon (concave is fine) over the terrain, with an edge skirt and a trimesh collider. `exclude` polygons (any simple polygons) are cut out exactly, and get skirts of their own.
- `buildStairs(builder, a, c, width, heightAt, { riser, parapet })` makes a flight of steps of about 17 cm risers with tufa parapets, plus one smooth ramp collider, so the character controller climbs without snagging.

### CityBlockFiller (`blockFiller.ts`)

```ts
const r = new CityBlockFiller().fill(polygon, {
  heightAt, density: 0.8, wealth: 0.3, seed: 7,
  id: 'subura3:',                 // prefix for lot and spot ids
  sidewalkHeight: [0.3, 0.12, …], // per polygon edge: 0.3 paved street, 0.12 lane
  avoid: [templeFootprint],       // kept clear of lots, yard surface, yard props and tree spots
});
placeAndRegister(game, 'subura3', r.builder.build('subura3'), r.builder.colliders, { x: 0, y: 0, z: 0 });
```

- The polygon is the block's **property line**, which is the outer edge of the sidewalks. Pass `streetWidth` if the polygon is street centrelines instead. Any orientation works; `frontEdges` and `sidewalkHeight` refer to the edges in the order you pass them.
- Lots are walked along each frontage, longest edge first. Corners go to the first edge. Each lot is an insula, domus (more often when rich), a small `shops` row, `horrea` (`allowHorrea`), an `alley` gap or a small `piazza` (with a lacus or a compital shrine, benches, trees and a market-stall spot). Lots get their own floor level at the highest sidewalk point of their frontage, so slopes produce plinths and stepped foundations and nothing floats.
- Party walls (lots touching each other) get no windows. Free sides on the block outline become corner lots with side-street shops. Leftover yards get wells, stacked amphorae, carts, troughs and `tree` spots. None of these, nor the yard surface, enter an `avoid` polygon (yard props stay their own radius away from it).
- `planLots(polygon, opts)` is the pure, geometry-free layout, and it is unit-tested.

### LOD: `CityLOD` (`lod.ts`)

Build each block three times with the same options and `detail: 'full' | 'mid' | 'low'`, and hand the three groups to a `CityLOD`:

```ts
const lod = game.addSystem(new CityLOD(game, { near: 70, mid: 220 }));
for (const blk of blocks) {
  const o = { heightAt, seed: blk.seed, id: `${blk.id}:`, … };
  const full = fillBlock(blk.poly, o);
  registerColliders(game, full.builder.colliders);
  lod.addBlock(blk.id, {
    near: full.builder.build(blk.id),
    mid: fillBlock(blk.poly, { ...o, detail: 'mid' }).builder.build(blk.id + ':mid'),
    far: fillBlock(blk.poly, { ...o, detail: 'low' }).builder.build(blk.id + ':far'),
  });
}
lod.finish(); // merges the far stand-ins per cell; call again after adding more blocks
```

- **near** (`'full'`) within `near` m, **mid** up to `mid` m, both as WorldRegistry entries (distances are measured from each block's bounding-sphere *surface*, so 70 m means full detail up to roughly 110 to 120 m from the centre of a 60 × 80 m block). Keep `near` at 60 to 80 m: a full block is 120 to 170k triangles, a mid block about half of that.
- **far** (`'low'`): every far block in a `cell` (default 320 m) is baked by `bakeFarGeometry` into **one** mesh: positions, the MATERIAL_BASE colour of each material as vertex colours, and the block index. It uses one flat-shaded material with no textures and no shadows. A block inside a merged mesh is hidden (its vertices collapse in the vertex shader, driven by a small visibility texture) exactly while its near or mid level is showing. So far draw calls scale with the cells in view, not with the blocks. Memory is about 350 KB per baked block.
- Measured on block C of the dev scene (58 × 78 m, about 20 buildings): full 162k triangles in 49 meshes (the extra meshes are the non-shadow-casting interiors), mid 82k in 26 meshes, far 20k triangles baked into its cell's single mesh.

## Props (`src/arch/props`)

`PROP_KINDS` covers these: amphorae (`amphora_globular` Dressel 20 for Baetican oil, `amphora_tall` Dressel 2–4 for wine), `amphora_stack`, `amphora_rack`, `dolium`, `crate`, `sack`, `basket`, `cart` (plaustrum with solid wheels), `handcart`, `litter` (lectica), the market stalls `stall_fruit`, `stall_fish`, `stall_pottery` and `stall_cloth` (`stall` picks one at random), `table`, `table_marble`, `bench`, `bench_masonry`, `stool` (variant 2 is a folding sella), `shelf`, `brazier`, `oil_lamp`, `lampstand`, `torch_bracket`, `altar`, `herm`, `milestone`, `statue_pedestal`, `puteal`, `trough`, `signboard`, `anvil`, `forge`, `loom`, `grain_mill`, `oven`, `vat`, `waterspout` and `chopping_block`. Each kind has 3 seeded variants.

- `makeProp(kind, rng?, variant?)` returns `{ parts: [{ material, geometry, castShadow }], colliders, bounds }`. The result is cached and shared, so don't mutate it.
- Triangle budgets (unit-tested), because props are repeated by the hundred in shop racks, stacks and carts: amphorae are 140 to 190 triangles (lathe profiles of about 10 points and 6 to 8 segments, open handle tubes), a basket is under 200, an amphora rack about 1.5k, and every kind is under 3.5k (the fruit stall is the largest at about 3.2k).
- `placeProp(draw, kind, x, y, z, rotY, { variant, scale, rx, collide })` merges a prop into a static builder. Use it for one-offs, which then cost no extra draw calls.
- `new PropScatter().add(kind, pos, rotY, scale, { variant, collide })` and then `.build()` / `.colliders()` give one `InstancedMesh` per kind × variant × material. Use it for things repeated many times.
- Wall-mounted props (`torch_bracket`, `signboard`, `waterspout`) have their origin on the wall face and project toward −z.
- **Grounding (rework M5b).** Three layers keep props on what is under them; ask the surface, never the terrain, when a floor, a podium or a step is there.
  - `placeProp(…, { ground })` fits the prop to the ground under its footprint (`ground.ts`), and the caller's `y` is only a lift over the ground at the origin: a `y` under the ground there is raised to it (a stall set at the lowest of three samples sank a metre into a Palatine slope). Give each prop the height of the ground where *it* stands, not of the cluster it belongs to.
  - `MeshBuilder.settleProps` (at `build()`) then drops each prop onto the highest up-facing face of the builder's own geometry within 0.5 m under to 0.35 m over its base, or onto the terrain (`builder.ground`) where there is no face or the terrain lies up to 0.7 m above the face (a floor sunk below a rising bank, a quay yard at pad level). `oil_lamp`, torches, signs, awnings and shelves are hung, not settled; lampstands stand.
  - `src/gfx/surfaceIndex.ts` is that query as a module: `SurfaceIndex` (a 1 m hash of the up-facing triangles, `heightAt(x, z, y, below, above)`) and `standingHeight(index, ground, x, z, y)`. `MeshBuilder.surfaceAt(x, z, y)` asks it while a builder is still building (floors in first, then the props that need to stand on podia, steps and floors); it is re-exported from `src/arch/props`.
- **Fixtures on slopes.** A fountain basin or compital shrine is level and rigid: the city's piazzas (`world/city/roads.ts`, `fill.ts`) stand it on the ground a third of the way up its fall under a 2.8 m footprint and build none where the fall is over 0.8 m (a shrine hung over a cliff); benches, stalls and amphora stacks need about a metre of level ground (0.5 m of fall).

## Vegetation (`src/arch/vegetation`)

- **Species** (`makeTree(species, variant)`, 3 variants each):
  - `umbrella_pine`: Pinus pinea. A tall, bare, leaning trunk splits into splaying limbs under a broad, nearly flat-topped canopy with a dark underside. Unit tests check that the canopy is more than 2.4× as wide as it is deep and that the trunk is bare below 55% of the height.
  - `cypress`: narrow dark flame.
  - `plane`: pale bark, big crown.
  - `olive`: gnarled twin trunk, silvery crown.
  - `laurel`, `fig`.
  - `oleander`: shrub with pink, white and red flower heads, coloured per instance. Its crown is lance-shaped leaf cards (`cards: 'olive'`, alpha-cut, wind-flutter) over dark inner clumps, so it reads as leaves, not as a smooth blob (R4b, 2026-10).
  - `reeds`: Arundo canes.
  - Each species has a near mesh (bark, foliage and optional flowers) and, for trees, a far LOD of a few hundred triangles. Vertex colours carry baked ambient occlusion.
  - Far LODs are `baked`: bark and foliage colours (MATERIAL_BASE, with the species tints) are multiplied into the vertex colours, so the whole stand-in renders with one neutral white material (`vegMaterial('baked', …)`) in one draw. The trunk keeps its full girth up to the split. The far stone pine is a lobed, domed lens about 0.3× as deep as it is wide, with a shaded underside. These are unit-tested.
- **`Forest`** handles instancing with distance LOD. `add(species, x, y, z, { scale, rotationY, variant })`, then `build()`, then `vegetation(game).addForest(forest)`. Instances move between near, far and culled when the camera moves. Draw calls depend on the number of species × variants, not on the number of trees. `colliders()` returns trunk cylinders.
- **`GrassField(bounds, { heightAt, mask, density, flowers, dryness, fadeStart, fadeEnd })`** draws green and sun-dried tufts plus wildflowers (poppies, daisies, chicory) in 20 m cells. Only the cells within `fadeEnd` + ¾ cell of the camera exist. `update(camera, budget)` generates newly reached cells (nearest first, at most `budget` per call, 8 by default) with a deterministic seed per cell, writing matrices straight into pooled InstancedMeshes, and hands cells that fall out of range back to the pool. Memory and build time therefore do not depend on the size of the field: about 30 pooled cells, around 4 MB. In the vertex shader the tufts shrink to nothing between `fadeStart` and `fadeEnd`, which avoids transparency sorting.
- **Wind.** `vegMaterial(id, profile)` clones the shared material (so textured PBR carries over), turns on vertex colours, and injects sway proportional to height² plus leaf flutter into the vertex shader. It is computed in world space, so every instance leans the same way. `windStrength.value` scales it globally. The materials are cached, one per (id, profile).
- **Static greenery for city builders:** `ivy(draw, x0, w, y0, h, rng)` on wall faces, `vineCanopy(draw, w, l, y, rng)` over pergolas with grape bunches, and `hedge(draw, …)`: a dark core wrapped in a skin of jittered leaf lumps (about 25 cm on a short hedge; lumps grow on a long one so a hedge stays near 60 lumps of 8 triangles, because landmark builders have triangle budgets). The domus garden's box hedges use it too.
- Thin blades are geometrically two-sided (`twoSided`) rather than drawn with `DoubleSide`, which would flip the normals on back faces and render them black.

## Materials and textures

Everything uses `getMaterial(MaterialId)` with world-scale box-projected UVs (the `MeshBuilder` default; `uvScale` is 2 m per repeat, and 1 to 1.5 m for foliage). Until the textured materials are merged, the scene looks flat-coloured, which is expected. Two notes for the materials module:

- Vegetation **clones** the library material the first time a species is built. Register textured materials with `setMaterial` **before** building the world, which is the same rule `materials.ts` already states.
- Window and door openings rely on `black` and on interior "dark boxes" (also `black`) behind them. A slightly lifted dark brown or blue would read more naturally than pure black.
- **`roof_tile`** is mapped per roof plane: U runs along the eave and V up the slope, at 2 m per repeat. A directional tile texture should have its tile rows running along U. Everything else uses world box UVs.
- Dados use `plaster_red` or `plaster_ochre`, never `plaster_dark`, which read as voids at street level. The far city LOD ignores textures and uses the MATERIAL_BASE colours as vertex colours, so keep those close to the average colour of each texture.

Shadows: each material either always casts or never casts (`shadow.ts`; ground-like materials, water, `black` and `glow_fire` never do), so each material merges into exactly one mesh per block.

## Performance (`?scene=fabric`, M4 Max, Chrome)

The scene has 5 filled blocks (about 55 buildings), each built at all three detail levels and managed by a `CityLOD` (`?lod=near,mid` overrides the default `70,220`), plus streets, a piazza, a building site, 390 trees and a grass field of 400 × 400 m, of which only the cells around the camera exist (1k to 25k live instances). It builds in about 0.7 s.

| View | Draw calls | Triangles (incl. shadow pass) |
| --- | --- | --- |
| Street level at the piazza (all blocks at full detail) | ~465 | ~1.7 M |
| Rooftop over block C | ~325 | ~1.2 M |
| Overview from 200 m (blocks at mid detail) | ~290 | ~0.87 M |
| Same overview, every block forced to its far stand-in (`?lod=1,2`) | ~160 | ~0.5 M |

The interiors of full-detail blocks no longer cast shadows; this splits them into their own meshes, which adds about 10 to 18 draw calls per near block. Grass is still the largest variable cost (each tuft is 40 triangles): lower `density` or `fadeEnd` if needed.

## Historical notes baked into the generators

- Trajan's 60-foot cap on private buildings sets the height limit. Nero's post-fire rule that insulae have street porticoes gives the `portico` option. Ground floors are given over to tabernae with mezzanines (pergulae) and wooden plank shutters set in grooved travertine thresholds.
- Dressel 20 (Baetican oil) and Dressel 2–4 (wine) amphorae, panis quadratus loaves, hourglass lava mills, fullers' collecting jars, and red-gloss terra sigillata on the pottery stall are all represented.
- Compital shrines of the Lares stand at crossroads, and lararia are painted in shops. Pompeian red-and-white columns appear in peristyles.
- Stone pines and cypresses dominate the skyline. Plane trees give shade in public spaces. Oleander grows in gardens, olives on the hills, and giant reeds along the water.

## Known gaps and next steps

- Building interiors are dark boxes behind openings. Only shop rooms, stairwells, courtyards and the horrea yard are modelled.
- Streets do not generate junction geometry. Use plazas at crossings and stop lanes at the sidewalk edge.
- Side-street shops on corner lots are visual only: the player can't step inside them.
- There are no billboard impostors. The far tree LOD is a reduced mesh, which is fine to a few hundred meters.
- Mid-detail blocks are still one mesh per material each (about 26 draw calls). In a dense city with 20 to 30 blocks inside the mid ring, that is 500 to 800 draw calls. The next step would be to merge mid blocks per cell as well, using the same per-block visibility texture as the far cells (with cloned library materials, plus a matching depth material for shadows).
- City-wide, blocks should be built lazily by distance. Keeping full- and mid-detail geometry for every block resident does not scale. The baked far cells (about 350 KB per block) can stay resident.
- The terrain of the dev scene switches from dirt to grass on a straight line, softened only by a fringe of grass tufts. A real terrain module should blend the two with a splat mask.
- Not built yet: a public latrine (forica), bath-house frontages, and the tall multi-storey `porticus` variant for the Via Lata.
