# Landmark category builders and the Campus Martius heroes

Every atlas landmark without a hand-made builder is built by a **category builder** that reads
its footprint, height and notes (`generic-*.ts`). The Campus Martius, the river warehouses, the
Aventine, the Castra Praetoria and the Vatican plain have **custom builders** (`campus-*.ts`).
Both follow the landmark contract in `src/world/landmarks/types.ts`: local space, facade towards
−z, monumental sizes × `WORLD_SCALE`, and human-scale parts (steps, doors, seats) at 1:1.

Single landmarks: `?scene=landmark&id=<id>[&ids=a,b][&cam=front|aerial|side|back|inside]`. In
the game: `?scene=rome&at=<id>` (add `&extent=city` outside the core).

## Files

| File | Builds |
| --- | --- |
| `generic-common.ts` | The shared toolkit: atlas-text hints (`parseHints`: order, column count, plan, round, Republican fabric, materials), footprint sizes, terrain-following plinths and walls, 1:1 flights (risers ≤ 0.21 m), ashlar coursing, tiled roofs, statues, altars, pools, railings, spots, and `finish()` (far stand-ins, see below). Also the **terrain lift** (`lifted` / `liftAll`). |
| `generic-world.ts` | What a merged mesh can't hold: real instanced trees (`plant`, `tree`: one shared vegetation `Forest` for all landmarks) and light-pool lamps (`lamp`, `wallTorch`, `brazier`). Both are queued in world space while Rome is assembled and flushed by a small system once the light pool exists. |
| `generic-sacred.ts` | `category:temple` (kit temple fitted to the footprint, order/plan/columns from the notes, Republican stucco-over-tufa or marble, carved frieze dedication, bronze statues by the stairs, altar with a live fire; round ones as tholoi; big precincts as a porticoed court), `shrine` (groves, grottoes, altars, aediculae, capped shafts), `monument` (obelisks, enclosures, altars, equestrian and standing statues, stripped bases), `column`, `fountain`, `tomb` (pyramid, drum with cypress mound, rock-cut facade in a hillside, columbarium entrance, Eurysaces' bakery tomb, roadside cemetery, altar tomb) and `arch`. |
| `generic-gates.ts` | `category:gate`: the obsolete Servian gates — tufa ashlar (or the Augustan travertine rebuild with its dedication), 1–3 passages, ragged wall stubs on the terrain, merlons, torches, a guard and customs booth with a brazier, a trough, a hawker's stall and the road's first milestone; the leaking aqueduct arcade over the Porta Capena ("madida Capena"). |
| `generic-groves.ts` | Sacred groves: spring nymphaeum, aedicula, altar fire, beaten path, real trees, and the camp of the families renting the Camenae grove (Juvenal 3.13). |
| `generic-forum.ts` | `category:forum`: paved court, colonnades clipped round the temple or basilica built inside it, exedrae, caryatid/captive attics, statues of the great men, the Augustan firewall, tabernae, the garden court of the Templum Pacis. |
| `generic-civic.ts` / `generic-civic-lib.ts` | `basilica` (kit basilica; two-storey arcaded fronts wrapping the hall for the Julia/Aemilia type, columnar porches and a quadriga for the Ulpia type), `curia`, `library`, `prison`, `palace` (courtyard ranges, peristyle, audience hall, **arcaded substructures** down the slope, concave exedra facade), `house`, `market`, `warehouse`, `portico`, `baths`, `camp` (forts, gladiator schools, fire stations), `harbor` (quays), `garden` and `other`. The lib holds the cheap parts: lite colonnades, halls, courtyard ranges with street faces, tabernae, vaults. |
| `generic-venues.ts` / `generic-seating.ts` | `theatre`, `odeum`, `stadium`, `circus` (seating, arcades, carceres, spina, a passage through the curved end where an arch stands) and `amphitheatre` (the kit's full amphitheatre fitted to the footprint, cavea filling exactly the space to the ambulatory, lite summa-cavea colonnade, kit far shell). |
| `campus-pantheon.ts` | The Pantheon **building site** of 113 (burned 110, rebuild c. 114: research §3.26): the fire-gutted pronaos wall with soot over its windows and stripped revetment, charred and fallen porch columns, Agrippa's inscription lying in the forecourt, the ring foundation and first brick lifts of the new drum, centring, scaffolding, two treadwheel cranes, brick pallets, marble blocks, two granite shafts, lime pit, hoarding with a watchman's brazier. The Basilica of Neptune, half-roofed after the fire. |
| `campus-mausoleum.ts` | Mausoleum of Augustus (travertine drum, earth mound with rings of cypresses, bronze Augustus, Res Gestae pillars, obelisks [FLAG]), Ara Pacis (relief textures), Horologium (obelisk, bronze meridian with Greek labels). |
| `campus-pompey.ts` | Theatre of Pompey, Temple of Venus Victrix at the top of the cavea with its great stair, Porticus Pompeiana (plane groves, fountains, Pompey's statue), Curia of Pompey (walled up), the four Largo Argentina temples. |
| `campus-porticoes.ts` | Saepta Julia, Diribitorium, Porticus Minucia Frumentaria (numbered ostia), Porticus Philippi, Porticus Vipsania (Agrippa's map), Iseum Campense. |
| `campus-venues.ts`, `campus-baths.ts` | Stadium and Odeum of Domitian, Theatre and Crypta of Balbus; Baths of Agrippa (+ Stagnum), Nero, Sura. |
| `campus-river.ts`, `campus-aventine.ts`, `campus-castra.ts`, `campus-vatican.ts` | Emporium, Porticus Aemilia, Horrea Galbana and Lolliana, Monte Testaccio (a modest terraced heap: its size in 113 is unknown), Pyramid of Cestius; Trajan's private house, Temple of Diana; the Castra Praetoria; Circus Vaticanus with its obelisk, the Naumachiae of Augustus (ruin) and Trajan (new, 109). |

## Far stand-ins and terrain

- `finish()` bakes the `far` massing into **one vertex-coloured mesh** (flat shading, MATERIAL_BASE
  colours) swapped in beyond 450 m; small landmarks without a far build get their own near mesh baked
  the same way, swapped at 260 m. At the Porta Capena spawn this took the view from ~1170 to ~650 draw
  calls.
- **Terrain lift.** Priority-3 and some categories get no flattened pad, so terrain could poke
  through floors. Every builder export is wrapped by `liftAll`: where the ground under the footprint
  rises more than 0.3 m above the centre, the whole build (object, colliders, spots, far) is raised to
  the highest ground, the builder sees the ground relative to the new floor (its plinths reach down),
  and a flight climbs from the street to the floor. Builders that follow the terrain themselves
  (forts, gardens, the Emporium, the Porticus Aemilia, the Pyramid, Testaccio) opt out.

## Spots

Builders return `LandmarkBuild.spots` with kinds `inscription`, `vista`, `shrine`, `container`,
`door`, `npc`, `vendor`, `spawn`, `sit`, `stall`. Gates give `<id>:spawn-<name>` (12 m outside),
`guard`, `customs` (vendor), `stall`, `milestone`; temples `door`, `steps`, `altar`; venues `entrance`,
`arena`/`orchestra`, `topseat`; heroes add their own (`pantheon:foreman`, `pantheon:inscription`,
`saepta-julia:slaver`, `porticus-minucia-frumentaria:mensa`, `camenae-grove:weaver`, …).

## Triangles (high detail, groundAt = 0)

Heroes: Venus Victrix 110k, Horrea Galbana 109k, Porticus Minucia 67k, Largo Argentina 66k,
Saepta 59k, Baths of Agrippa 56k, Circus Vaticanus 54k, Theatre of Balbus 54k, Theatre of Pompey 45k,
Pantheon site 38k, Mausoleum 22k; most others under 30k. Category builds: the amphitheatre 155k
(was 380k), basilicas 140–165k, fora 22–122k, temples 8–20k, gates 7–22k. `tests/landmarks-generic.test.ts`
builds every landmark these builders handle at both detail levels and checks budgets and spots.

## Known limits

- The terrain lift's street flight sits on the facade axis; where a building's door is elsewhere
  the steps lead to a wall.
- Category builders read free text: a landmark whose notes describe a neighbour (e.g. the Tomb of
  the Scipios mentioning a columbarium) can pick the wrong form; the more specific test comes first.
- Atlas footprints of the Theatre of Balbus and the Crypta Balbi touch; their roof and wall overlap
  by under 0.6 m.

## Surfaces and UV audit (R4a, wave 3)

- **Forum paving** (`paving_travertine`): a procedural slab texture (`slabs` in
  `src/gfx/textures/procedural.ts`, 6 m repeat at 1024², about 6 mm per pixel): five courses of
  1.5-2.6 m slabs in running bond, tight dark joints, a tone and warmth of its own per slab, a
  polished walk-lane, chipped arrises, the odd hairline crack, one repair slab of greyer stone and
  one slab with a carved band of lettering. The recipe keeps `set: 'paving_travertine'` only
  because the terrain's ground layer reads it; `createMaterial` prefers `proc` when both are set.
  The streaky shader `wear` is off for it (the polish is drawn per slab). Generation costs about
  0.4 s on the main thread at boot (same class as `travertine`).
- **`boxProjectUVs`** (`src/gfx/uv.ts`) now picks the projection plane from each triangle's own
  geometry, with the sign of the shading normal. Before, it used the summed vertex normals, so a
  fluted shaft or lathe moulding whose smooth normals disagreed with its facets was projected at a
  grazing angle (stretch up to 460x on column shafts, 25x on capitals). The worst case is now the
  box-projection limit of 1.73 (a facet whose normal sits on the cube diagonal).
- **`?uvcheck=1`** (`src/gfx/uvcheck.ts`): every material becomes a checker whose squares are 1 m
  with a 0.25 m grid and an "F" for orientation, tinted per material id. Square, 1 m squares mean
  correct world-scale UVs; bars, diamonds or smears mean stretching. Terrain and avatars are
  not covered.
- **`?uvaudit=1`** (`src/gfx/uvstretch.ts`, hooked in `MeshBuilder.add` and instance parts): measures
  the singular values of the UV-to-surface map per triangle while the world builds and totals the
  stretched area (> 1.8x) per material and builder call site. Read it in the page with
  `window.__uvAudit(40)`, e.g. `node scripts/shot.mjs --query "at=rostra&hour=10&uvaudit=1" --wait 8000
  --steps '[{"eval":"JSON.stringify(window.__uvAudit(40))"}]'`. Call sites are the first two stack
  frames outside gfx/ and the Draw helper (line numbers are of the Vite-transformed module, so use
  the function names). Known leftovers: custom-texture materials with their own 0..1 UVs (obelisk
  faces, soot fans, relief quads, numerals) are expected to show up and are not stone tiling.
- **Street wetness** (`puddle` in `MaterialRecipe`, `SK_PUDDLE` in `shaderPatch.ts`): world-space
  damp darker patches, small glassy puddles (roughness 0.07, normal flattened) and dung/oil
  smudges on flat faces of basalt, cobbles, dirt, gravel and mud (and a little on travertine).
  `?puddle=0` switches it off for A/B shots.
- Stretched roofs fixed at the source: the tholos roof and Forum of the Vesta roof, and the
  Boarium round temple, no longer use `uv: 'keep'` lathe UVs (6x stretch on roof_tile).
- Not done: step and kerb edge wear. A shader cannot see a tread's edge (box-projected UVs carry no
  edge distance, and batching drops extra attributes), so it needs geometry (a worn nosing strip in
  `stairs()`); wall-base grime already exists as `weather` (grime band, damp, moss).
