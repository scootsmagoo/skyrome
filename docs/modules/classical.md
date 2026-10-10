# Materials and the classical architecture kit

This module gives Skyrome its stone, brick, plaster, tile, wood and ground surfaces, and a kit of
procedural Roman buildings that write into a `MeshBuilder`. Open `?scene=arch` to walk round
every generator at real scale, or `?scene=arch&view=materials` to see every material.
Add `&detail=low` to see the far-LOD versions.

## Materials (`src/gfx/materials.ts`, `src/gfx/textures/`)

`getMaterial(id)` is synchronous and returns one shared `MeshStandardMaterial` per id.

- **Photo sets.** 23 CC0 sets from Poly Haven and ambientCG live in
  `public/textures/<set>/{color,normal,arm}.jpg`: 1K albedo (sRGB), 1K OpenGL normals and a
  512² ARM map (R = ambient occlusion, G = roughness). The total is about 14 MB (budget 18 MB).
  The material shows its flat palette colour until all three maps have loaded, then switches
  in one go. Await `whenTexturesLoaded()` in scene setup to avoid the pop.
- **Real-world tiling.** MeshBuilder's box UVs are one unit per 2 m (`UV_METERS`). Each recipe in
  `textures/catalog.ts` gives the metres covered by one texture repeat, for example brick 1.1 m,
  basalt paving 3.2 m and travertine 2.4 × 1.2 m (two 0.6 m ashlar courses). Travertine is
  procedural: cream laminae, voids along the bedding and hairline joints, smooth as it was in
  AD 113 (the Colosseum's pockmarks are medieval). Generators that write their own UVs
  (`uv: 'keep'`) must use the same convention: metres / `UV_METERS`.
- **Tint normalisation.** `tools/fetch-textures.mjs` records each set's average linear albedo and
  roughness in `stats.gen.json`. At runtime the tint scales the texture so its average matches
  the palette colour in `MATERIAL_BASE`. That is how one plaster texture serves all five
  `plaster_*` ids and terracotta, and one marble serves giallo antico.
- **Anti-tiling.** `textures/shaderPatch.ts` injects world-space 3D value noise (ALU only) that
  varies albedo brightness and warmth over 10–30 m (`macro`). Natural ground also blends a
  second, rotated sample of the albedo by a noise mask (`detile`, one extra fetch). All patched
  materials share one program per define set.
- **Albedo contrast.** A recipe's `contrast` (< 1) pulls the photo albedo towards its mean in the
  shader. White marble uses 0.5: the scan's grey veining otherwise dominates columns and
  mouldings in shade, where there is no AO to show the form.
- **Procedural sets** (`textures/procedural.ts`, pure and tested): fabric weave with drapery
  wrinkles, a black-and-white Ostia-style floor mosaic, Pompeian fourth-style painted stucco
  (black socle, red panels, black candelabra strips, frieze, cream upper zone; v = 0 at the
  floor), gold leaf over bronze, statuary bronze, iron/lead, porphyry with feldspar specks,
  opus reticulatum and foliage. They are uploaded as `DataTexture`s, so no canvas is needed.
- **Environment.** `applyDefaultEnvironment(scene, renderer, opts)` prefilters a small warm
  Mediterranean sky gradient with a sun glow (PMREM) and sets `scene.environment`, so metals
  don't render black. The sky module can replace it later.
- To refresh or add texture sets, edit `SOURCES` in `src/gfx/textures/tools/fetch-textures.mjs`
  and run `node src/gfx/textures/tools/fetch-textures.mjs [set…]`. It needs ImageMagick 7 and
  `unzip`. Credits are in `docs/credits/classical.md`.

## Architecture kit (`src/arch/classical/`, `src/arch/common/`)

Every generator has the shape `fn(b: MeshBuilder, spec, at?: Matrix4)`. It adds geometry and
colliders to the builder at the local transform `at`. Then build and place as usual:

```ts
const b = new MeshBuilder();
temple(b, { order: 'corinthian', plan: 'pseudoperipteral', front: 6, width: 30 * WORLD_SCALE });
placeAndRegister(game, 'temple-of-castor', b.build('temple'), b.colliders, pos, rotY, { cullDistance: 600 });
```

Conventions: metres, y up. **Facades face −z** (as atlas landmarks expect), and origins sit on the
ground at the plan centre. Human-scale parts stay 1:1 whatever the building's scale: stair risers
of about 0.22 m, doors, row seats of 0.4 × 0.7 m.

**Levels of detail** (`detail` on every spec, `orders.ts`; research §1.8):

| Detail | Use | What it builds |
| --- | --- | --- |
| `'high'` | 0–30 m, hero buildings | Flutes, carved capitals, dentils, modillions, pediment sculpture, imbrices. |
| `'low'` | 30–150 m | Lathe shafts, simplified capitals and mouldings, no blocks. |
| `'far'` | > 150 m, the WorldRegistry `far` object | 8-sided column prisms with a frustum capital and a slab abacus (≈ 50 triangles), entablatures as architrave, frieze and corona with the cornice shadow line, no base mouldings, acroteria or sculpture. A temple is about 2k triangles. |

The amphitheatre has its own far shell, `amphitheatreFar(b, spec)` (`amphitheatreFar.ts`, about
5k triangles against 376k): the facade as one textured band (a procedural two-bay texture of
arches, half-columns, entablatures and the attic) with real cornice bands and velarium masts,
the cavea as one slope per tier with a seat-row texture, and the summa cavea colonnade as a
textured band. Register it as the near build's `far`:

```ts
placeAndRegister(game, 'colosseum', near, b.colliders, pos, rotY, { far: farGroup, cullDistance: 180, farDistance: 3000 });
```

**Memory.** Columns are instanced: `column()` places the cached geometry with
`MeshBuilder.instance()`, so every colonnade of one column spec, in every building, shares one
indexed geometry per material and draws as one `InstancedMesh` per builder. `build(name,
{ index: true, releaseCpu: true })` also welds the merged geometry and drops its vertex arrays
from the JS heap once uploaded (static scenery only; colliders are separate). The gallery holds
1.0M vertices (39 MB on the GPU, 5 MB in the heap) where it held 6.1M (185 MB in the heap).

**Signs and inscriptions.** `inscriptionPanel()` and `paintedSign()` pack their text into shared
atlas pages per style (carved, bronze, painted; 1024² each), so a street of shop signs is one
material and one draw call per building. Pass `monumental: true` for a unique full-resolution
material (arch attics, the column's pedestal).

**Walkability.** The character controller is configured with a 0.42 m autostep, but with its
0.35 m-radius capsule the effective climbable step is about **0.26 m**, and treads need about
**0.3 m**. Everything walkable in the kit keeps to that: temple and tholos stairs (0.22 m), and
the cavea aisles (0.2 m half-steps). Amphitheatre seat rows (0.4 m, as in Rome) are not
walkable; the aisles (scalaria), plus short flights in front of each praecinctio wall, are the
routes up. This is tested in `tests/arch.stairs.test.ts`.

| Generator | File | Notes |
| --- | --- | --- |
| `column(b, {order, D, height?, fluted?, kind: 'free'\|'engaged'\|'pilaster'})` | `column.ts` | Attic/Tuscan base, entasis shaft (straight lower third), 20 Doric arrises or 24 fillets, capitals in `capitals.ts`. Geometry cached per spec. Cylinder + plinth colliders. |
| `entablature(b, path, spec, {closed})`, `pediment()`, `acroterion()` | `entablature.ts` | Fasciae, frieze, cornice with dentils, modillions, or Doric triglyphs and mutules, swept with mitred corners. Raking cornices with sima, recessed tympanum. |
| `temple(b, spec)` / `templeLayout(spec)` | `temple.ts` | Prostyle, pseudoperipteral, peripteral and sine postico plans. Tetra- to decastyle, high podium with frontal stairs between wings (or lateral flights from a rostrum, each ending on a walled landing that turns onto the podium), ashlar cella with bronze doors, tiled or gilded gable roof with imbrices. One box per step for colliders. |
| `tholos(b, spec)` | `tholos.ts` | Round temple on a podium with stairs (Vesta) or a stepped crepidoma (Hercules Victor), ring entablature, conical tiled roof, finial. |
| `triumphalArch(b, {bays: 1\|3})`, `plainArch()`, `archway()` | `arch.ts` | Arch of Titus scheme in passage widths: engaged columns on pedestals, attic with inscription, spandrel Victories, coffered soffit, processional reliefs, quadriga. |
| `arcade(b, spec)`, `arcadeBay()`, `colosseumStoreys(k)` | `arch.ts` | Straight arcades and superimposed storeys: Tuscan, Ionic and Corinthian half-columns framing arches, then an attic with pilasters, windows, corbels and velarium masts. |
| `amphitheatre(b, spec)`, `amphitheatreFar(b, spec)` | `amphitheatre.ts`, `amphitheatreFar.ts` | Facade, ambulatory and cavea together with the four axial entrances, two arena gates and vomitoria up to the first praecinctio walkway (walkable, tested). The far shell is described above. |
| `ellipticalArcade(b, spec)`, `cavea(b, spec)` | `amphitheatre.ts` | Bays at equal arc length, one mitred entablature per storey, ambulatory floors and inner wall. The cavea is a single stepped section swept round a parallel curve: podium, maeniana, praecinctio walls, aisles, porticus in summa cavea. Colliders are boxes per row segment. |
| `basilica(b, spec)` | `basilica.ts` | Basilica Ulpia type: nave ringed by two superimposed colonnades, galleries, clerestory, coffered ceiling, gable and lean-to tiled roofs, doors, apses. |
| `porticus(b, path, spec)`, `quadriporticus()` | `porticus.ts` | Colonnade along any polyline, facing the right-hand side, with back wall, lean-to roof, ceiling and stylobate. |
| `dome()`, `rotunda()`, `barrelVault()`, `exedra()`, `apse()` | `vaults.ts` | Coffered domes with an oculus (coffer backs a shade darker than the ribs), a drum with recessed niches, vaults whose coffers end flush in framing ribs, semidomes with edge bands. |
| `obelisk()`, `honorificColumn()` | `monuments.ts` | Obelisk of red Aswan granite (a crystal mosaic of feldspar, quartz and biotite) with carved hieroglyphs. Trajan's Column (AD 113): pedestal with door and inscription, laurel torus, a 23-turn helical frieze from a non-repeating narrative strip, Doric capital, gilded emperor. |
| `togate()`, `armoredEmperor()`, `equestrian()`, `seatedDeity()`, `quadriga()`, `reliefProcession()` | `statues.ts` | Simplified sculptural forms with life-size proportions, facing −z. |
| `stairs()`, `wall()` (doors, windows, arches, niches, ashlar courses), `prism()`, `orientOutline()` | `common/stairs.ts`, `common/walls.ts` | Shared by the fabric module. |
| `pedimentSculpture()` | `entablature.ts` | Placeholder pedimental group (seated deity, diminishing standing, kneeling and reclining figures), on by default for high-detail temples. |
| `inscriptionPanel()`, `paintedSign()`, `inscriptionMaterial()`, `latinize()` | `common/inscription.ts` | Carved and rubricated, gilded-bronze, or painted dipinti. Uses the Cinzel font (OFL), loaded with `loadInscriptionFont()`. |
| `ProfileBuilder`, `lathe`, `sweep`, `gridSurface`, `tube`, `extrudePolygon`, `offsetPath` | `common/geom.ts` | The toolkit everything else is built from. |

Proportions come from `orders.ts`, after Vitruvius as systematised by Vignola and checked
against Roman buildings. Column heights are Tuscan 7 D, Doric 8 D, Ionic 9 D, and Corinthian and
Composite 10 D. The Corinthian capital is 1⅙ D, the entablature is ¼ of the column height
(0.235 for Corinthian), and the default intercolumniation is systyle (2 D clear). Pediments
rise 14° (Vitruvius gives about 12.5°).

## Triangle counts (gallery, `?scene=arch`, `&detail=low`, `&detail=far`)

Drawn triangles per exhibit (instanced columns counted per placement).

| Exhibit | high | low | far |
| --- | ---: | ---: | ---: |
| Column: Tuscan / Doric / Ionic / Corinthian / Composite (8 m, with label base) | 1.7k / 3.2k / 5.9k / 7.7k / 8.4k | 0.5k / 0.6k / 0.7k / 0.7k / 1.0k | 80 each |
| Hexastyle pseudoperipteral temple (30 × 55 m real) | 211k | 21k | 2.3k |
| Tholos, 20 columns (Hercules Victor) / Vesta on its podium | 167k / 154k | 19k / 18k | 3.4k / 4.1k |
| Arch of Titus (with quadriga) / triple arch | 77k / 77k | 10k / 10k | 4.5k / 5.5k |
| Colosseum facade section, 4 bays × 4 storeys | 68k | 14k | 5.7k |
| Full amphitheatre (80 bays, cavea, top portico) / far shell | 376k (facade 'low') | 368k | 5.2k (`amphitheatreFar`) |
| Basilica (46 m nave, two orders, apses) | 288k | 57k | 14k |
| Ionic porticus, L-shaped, 64 m | 213k | 24k | 2.1k |
| Ionic tetrastyle temple with rostrum, lateral flights and landings | 50k | 6.1k | 1.4k |
| Forum court: Corinthian quadriporticus, 44 × 32 m + equestrian | 86k | 55k | — |
| Wall specimens (brick door/niches, reticulatum windows, painted stucco) | 2.6k | 1.1k | 1.1k |
| Rotunda, 24 m dome / exedra / barrel vault | 18k / 35k / 1.6k | 2.9k / 4.4k / 0.1k | 2.9k / 1.7k / 0.1k |
| Honorific column / obelisk | 30k / 0.2k | 3.4k / 0.15k | 3.4k / 0.15k |
| Statues: togate / emperor / seated / equestrian / quadriga | 6.0k / 7.3k / 7.1k / 7.9k / 14k | 0.8k / 1.4k / 1.2k / 1.4k / 3.3k | as low |

From the spawn, the whole gallery renders at 60 fps on an M4 Max in Chromium and WebKit, with
about 226 draw calls and 2.4M triangles per frame including the shadow pass (the amphitheatre,
~200 m away, is its far shell). At `detail=low` that drops to 0.37M, at `detail=far` to 0.15M.
The overhead overview is about 320 draw calls and 3.1M triangles. Geometry memory: 1.0M
vertices, 39 MB on the GPU and 5 MB in the JS heap (high).

## Shared-file changes

- `src/gfx/MeshBuilder.ts` (all backward compatible):
  - `add()` and `box()` also accept a `THREE.Material` for one-off textured surfaces
    (inscriptions, the column frieze, hieroglyphs). These are merged per material instance and
    carried through `append()`.
  - New `instance(key, make, matrix)`: repeated objects (columns) built once per key for the
    whole program and drawn as one `InstancedMesh` per material; carried through `append()`.
    New `triangleCount` getter.
  - `build(name, { index?, releaseCpu? })`: optional vertex welding and freeing of the CPU
    vertex arrays after upload.
  - `placeAndRegister(..., { far, farDistance })`: passes a far-LOD stand-in (given the same
    transform) to `WorldRegistry.add`.
- `src/actors/Actor.ts`: a grounded actor bleeds its blocked horizontal velocity only after the
  block has lasted 3 fixed steps and while the character controller is not lifting it (never
  reversing the direction). Bleeding at once on the ground stalled the autostep at the first
  riser, so nobody could climb stairs; never bleeding made a blocked actor report full running
  speed. `tests/arch.stairs.test.ts` drives the real Actor for both (stairs climb; pushing into
  a wall reports ~0 speed). A body that still slides along a wall at a good share of its push
  (0.8 m/s and over a third of it) takes its real velocity at once (the per-axis bleed alone
  zeroed the wrong component on an oblique wall and stopped the player dead:
  `tests/player-slide.test.ts`).
- `src/scenes/arch.ts` creates a `WorldRegistry` when the game has none (scene-local), so the
  amphitheatre's far shell swaps in beyond 180 m.

## Known limits / next steps

- There is no ambient occlusion: shaded facades, the cavea and coffers read flatter than they
  should. The kit compensates (softer marble veining, grey-marble risers, darker coffer backs,
  a greyer ground behind the passage reliefs); an SSAO/GTAO pass belongs to the gfx/post owner.
- Statues use the 'low' geometry at 'far'. Trajan's Column and the statues would suit impostor
  billboards at skyline distance (research LOD3).
- Corinthian leaves are scalloped bands, not individually sculpted acanthus.
- Pavonazzetto uses the veined marble with a tint, so its veins are grey rather than purple.
