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
  basalt paving 3.2 m and travertine 2.6 × 1.0 m. Travertine is deliberately anisotropic: a pitted
  aggregate stretched horizontally reads as travertine's layered pores. Generators that write
  their own UVs (`uv: 'keep'`) must use the same convention: metres / `UV_METERS`.
- **Tint normalisation.** `tools/fetch-textures.mjs` records each set's average linear albedo and
  roughness in `stats.gen.json`. At runtime the tint scales the texture so its average matches
  the palette colour in `MATERIAL_BASE`. That is how one plaster texture serves all five
  `plaster_*` ids and terracotta, and one marble serves giallo antico.
- **Anti-tiling.** `textures/shaderPatch.ts` injects world-space 3D value noise (ALU only) that
  varies albedo brightness and warmth over 10–30 m (`macro`). Natural ground also blends a
  second, rotated sample of the albedo by a noise mask (`detile`, one extra fetch). All patched
  materials share one program per define set.
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
ground at the plan centre. `detail: 'high' | 'low'` is on every spec: build `low` for the
WorldRegistry far LOD. Human-scale parts stay 1:1 whatever the building's scale: stair risers of
about 0.22 m, doors, row seats of 0.4 × 0.7 m.

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
| `temple(b, spec)` / `templeLayout(spec)` | `temple.ts` | Prostyle, pseudoperipteral, peripteral and sine postico plans. Tetra- to decastyle, high podium with frontal stairs between wings, ashlar cella with bronze doors, tiled or gilded gable roof with imbrices. One box per step for colliders. |
| `tholos(b, spec)` | `tholos.ts` | Round temple on a podium with stairs (Vesta) or a stepped crepidoma (Hercules Victor), ring entablature, conical tiled roof, finial. |
| `triumphalArch(b, {bays: 1\|3})`, `plainArch()`, `archway()` | `arch.ts` | Arch of Titus scheme in passage widths: engaged columns on pedestals, attic with inscription, spandrel Victories, coffered soffit, processional reliefs, quadriga. |
| `arcade(b, spec)`, `arcadeBay()`, `colosseumStoreys(k)` | `arch.ts` | Straight arcades and superimposed storeys: Tuscan, Ionic and Corinthian half-columns framing arches, then an attic with pilasters, windows, corbels and velarium masts. |
| `ellipticalArcade(b, spec)`, `cavea(b, spec)` | `amphitheatre.ts` | Bays at equal arc length, one mitred entablature per storey, ambulatory floors and inner wall. The cavea is a single stepped section swept round a parallel curve: podium, maeniana, praecinctio walls, aisles, porticus in summa cavea. Colliders are boxes per row segment. |
| `basilica(b, spec)` | `basilica.ts` | Basilica Ulpia type: nave ringed by two superimposed colonnades, galleries, clerestory, coffered ceiling, gable and lean-to tiled roofs, doors, apses. |
| `porticus(b, path, spec)`, `quadriporticus()` | `porticus.ts` | Colonnade along any polyline, facing the right-hand side, with back wall, lean-to roof, ceiling and stylobate. |
| `dome()`, `rotunda()`, `barrelVault()`, `exedra()`, `apse()` | `vaults.ts` | Coffered domes with an oculus, a drum with niches, vaults, semidomes. |
| `obelisk()`, `honorificColumn()` | `monuments.ts` | Granite obelisk with carved hieroglyphs. Trajan's Column (AD 113): pedestal with door and inscription, laurel torus, 23-turn helical frieze texture, Doric capital, gilded emperor. |
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

## Triangle counts (gallery, `?scene=arch`)

| Exhibit | high | low |
| --- | ---: | ---: |
| Column: Tuscan / Doric / Ionic / Corinthian / Composite (8 m) | 1.7k / 3.2k / 5.9k / 7.7k / 8.4k | 0.5k / 0.6k / 0.7k / 0.7k / 1.0k |
| Hexastyle pseudoperipteral temple (30 × 55 m real) | 201k | 21k |
| Tholos, 20 columns (Hercules Victor) | 167k | 19k |
| Arch of Titus (with quadriga) / triple arch | 105k / 105k | 20k / 19k |
| Colosseum facade section, 4 bays × 4 storeys | 68k | 14k |
| Full amphitheatre (80 bays, cavea, top portico) | 376k (facade built 'low') | 370k |
| Basilica (46 m nave, two orders, apses) | 287k | 57k |
| Ionic porticus, L-shaped, 64 m | 213k | 24k |
| Ionic tetrastyle temple with rostrum and side stairs | 54k | — |
| Forum court: Corinthian quadriporticus, 44 × 32 m (low columns) + equestrian | 92k | — |
| Wall specimens (brick door/niches, reticulatum windows, painted stucco) | 2.2k | — |
| Rotunda, 24 m dome / exedra / barrel vault | 18k / 34k / 1.6k | 2.7k / 4.2k / 0.1k |
| Honorific column / obelisk | 20k / 0.2k | 3.9k / 0.15k |
| Statues: togate / emperor / seated / equestrian / quadriga | 5.8k / 8.6k / 8.1k / 14k / 39k | 1.7k / 2.5k / 2.6k / 4.5k / 12.7k |

From the spawn, the whole gallery renders at 60 fps on an M4 Max in Chromium and WebKit, with
about 158 draw calls and 2.4M triangles per frame including the shadow pass. At `detail=low`
that drops to 0.69M. Every building is one draw call per material.

## Shared-file changes

- `src/gfx/MeshBuilder.ts`: `add()` and `box()` also accept a `THREE.Material` for one-off
  textured surfaces (inscriptions, the column frieze, hieroglyphs). These are merged per
  material instance and carried through `append()`. The change is backward compatible.
- `src/actors/Actor.ts`: blocked horizontal velocity is now bled only while airborne. Bleeding
  on the ground stalled the character controller's autostep at the first riser and on slopes,
  so nobody could climb stairs or ramps. `tests/arch.stairs.test.ts` reproduces the original
  failure and covers the fix.

## Known limits / next steps

- The amphitheatre at 'low' is still 370k triangles. A far LOD should drop the half-columns and
  the top portico.
- Corinthian leaves are scalloped bands, not individually sculpted acanthus. Columns could be
  instanced (`InstancedMesh`) to save memory in large colonnades.
- Pavonazzetto uses the veined marble with a tint, so its veins are grey rather than purple.
