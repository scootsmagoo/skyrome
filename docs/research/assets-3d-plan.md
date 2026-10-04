# Skyrome: 3D asset integration plan

Research date: 2026-10-04. This plan turns the two scouting reports (`assets-3d-sculpture.md`, `assets-3d-characters-props.md`) into something an agent can build: a ranked shortlist of 25, an asset pipeline, a runtime loader, a harmonisation policy, risks and effort. It also reads the code the assets have to plug into (`MeshBuilder`, `props`, `vegetation`, `equipment`, the landmark builders) and says where each hook goes.

Inputs: the two scout reports, `assets.md` (rules in §0, pipeline in §8), `GDD.md` §12.1, §16.1, §17, `ARCHITECTURE.md`, `docs/modules/*.md`, and the source under `src/`. Nothing was added to the repo except this file. Scratch work (re-downloads, test conversions, hashes) stayed in `.claude/asset-staging/` and the session scratchpad.

Everything below is conservative on licenses: only CC0 / public domain (PDM) and CC BY 4.0 are on the shortlist. CC BY-SA, NC, ND, "editorial", AI-generated, Mixamo raw files, Pinterest and Google-image finds are out (Pinterest and Google Images are image boards with unknown or arbitrary licenses and hold no 3D models, so they are not usable sources at all; every item here comes from a site that states its license on the asset's own page or API).

---

## 0. Summary

1. **The first 25 items ship at about 6 MB** (per-item figures in §2.1: about 2.7 MB of that is measured, the rest estimated from measured siblings). The cap proposed in §3.6 is 25 MB for `public/models` plus `public/anim`, so there is room for roughly four times as much.
2. **18 items are CC0 or public domain, 7 are CC BY 4.0.** The CC BY items are the three Mediterranean trees, the scutum, the gladius, a marble table and an oil lamp. Everything else (animation, all portrait scans, the Trajan's Column reliefs, the rocks) is CC0 / PDM.
3. **Ranking logic.** Payoff = how many minutes of play and how many placements see it, times the gap to the procedural version today, divided by license and integration risk. That puts at the top: swim, sit, death and hit animation (a gap in the core game: `player:swim` fires but nothing in `src/actors`, `src/player` or `src/game` animates it), the three trees (the procedural pine "reads as a dark blob"), and the two hero scans (Prima Porta Augustus, Trajan).
4. **Trees will not appear just because we ship models.** `buildCity` (`src/world/city/index.ts`) is still a stub, and nothing in the Rome build places trees (only river reeds, which go through the `Forest` class, and opt-in terrain grass; the tree species are placed only in `?scene=fabric`). The owner's "bland terrain" complaint needs a placement step as well as assets. That step is not counted in this plan's effort (§8.3 gives the gate).
5. **Pipeline.** One manifest (`assets/manifest.json`) is the single source of truth. `scripts/assets/fetch.mjs` downloads raw files into a git-ignored `.asset-cache/`, re-checks each license live and verifies a sha256. `build.mjs` optimises with the gltf-transform SDK into `public/models/<id>.glb` (meshopt, WebP, LODs). `credits.mjs` writes `CREDITS.md` and `public/credits.json`. `check.mjs` is the CI gate (license allowlist, size budget, provenance). Only optimised outputs are committed.
6. **Runtime.** A new `src/assets/` module (`ModelLibrary`, `addModel`, `ModelScatter`, scan materials, collider helper). Models are **preloaded before the landmarks are built**, so builders call a synchronous `get()` and fall back to today's procedural code when a model is missing. That keeps tests, dev scenes and the owner's build working at every step.
7. **Four things I found by testing that the scout reports do not say** (details in §4.3):
   - A meshopt-compressed GLB loads with **Int16-normalised positions and a large node scale**. `BufferGeometry.applyMatrix4` on it silently clamps the result into [-1, 1] on every axis (measured on the Prima Porta file: after a 2x scale and a 1 m lift, y should span 0.04 to 1.96 and came out as -1 to 1). Every consumer in `MeshBuilder` calls `applyMatrix4`, so the loader must bake to Float32 (function validated, §4.3).
   - `MeshBuilder` **box-projects UVs per triangle**. On the three staged scans, 7 to 19 % of shared edges change projection axis, which would patch the library marble texture on every curved surface. Scans must use a map-less plaster/marble material (what the scouts rendered), not `getMaterial('marble')`.
   - `MeshBuilder` strips every attribute but position, normal and uv, so vertex colours (planned for statue paint) are dropped, and `vegMaterial` forces `vertexColors`, so an imported tree without a colour attribute would render black.
   - **Quaternius UAL2's itch.io page lost its "Asset license" row on 2026-09-28** (the description still says "CC0 License", and the zip's own `License.txt` downloaded today says CC0 1.0). UAL1 and UAL2 pages both show updates after the Quaternius Asset License date (2026-08-28). Treat the in-zip license plus a hash and a dated snapshot as the record, and make UAL2 clips optional (§7).
8. **Sequencing against "core game first".** Nothing here blocks the core game. The foundation (W0) touches only new files. The swim clips are a core-game gap and are worth doing now. Everything else can wait for the v0.0 exit gate or run in parallel when an agent is free, because each item falls back to the procedural version.

**Owner decisions** (all have a default, none blocks W0):

| # | Question | Default |
|---|---|---|
| 1 | OK to ship CC BY 4.0 assets (needs a credits page: `CREDITS.md` now, an in-game credits screen before any paid release)? | Yes. If you ever sell the game, the CC BY set stays replaceable by design (each item has a procedural fallback). |
| 2 | Create a free Sketchfab account and API token for the second batch (§2.3: Cupid reliefs of the Temple of Venus Genetrix dated 113, Vespasian, Isis, Livia, Dressel 20 amphora)? | No; first 25 need no login. |
| 3 | Accept CC BY-SA for Livia and young Augustus (Saint-Raymond via Scan the World)? | No. Share-alike would reach our decimated meshes. |
| 4 | OK to add dev dependencies `@gltf-transform/{core,extensions,functions}`, `meshoptimizer`, `sharp`? | Yes (dev only; nothing ships). |
| 5 | Pay for UAL Pro ($9.99)? | No; not needed. |

---

## 1. What was verified for this plan (2026-10-04)

The scouts' claims were re-checked where the plan leans on them, and several new checks were added.

| Claim | How it was checked | Result |
|---|---|---|
| The SMK scans on the shortlist are public domain | SMK Open API (`api.smk.dk/api/v1/art/search`, filter `object_number`) for the 15 shortlisted objects (KAS65, 740, 843, 200, 598, 722, 1238, 431, 809, 644, KAS81/9, /10, /11, /13, DEP457) plus KAS1099 as a spare | All 16: `public_domain: true`, `rights: https://creativecommons.org/publicdomain/mark/1.0/`. 15 of the 16 "small" STL URLs answer a range request with HTTP 206. **KAS200 small is HTTP 404** (use the 100 MB full file). |
| Musée Saint-Raymond scans are CC0 | Raw Commons wikitext of the three STL file pages | `\|photo license = {{cc0}}` on `MSR-Trajan-Ra_117.stl`, `MSR-Auguste-Ra57.stl`, `MSR-Jupiter-2014-1-1.stl`, each with `{{PermissionTicket\|id=2024051410005487}}` |
| The nine CC BY models are CC BY 4.0, downloadable, and mirrored | Sketchfab API v3 `/models/<uid>`; HTTP HEAD on the Objaverse copy on Hugging Face | All nine: `license.label` "CC Attribution", `license.url` `http://creativecommons.org/licenses/by/4.0/`, requirement text "Author must be credited. Commercial use is allowed.", `isDownloadable: true`. All nine HF files answer 200 with the sizes the scouts reported. The scutum's and the pine's descriptions say they were modelled by the author in Blender / Substance Painter (own work). |
| Quaternius packs are CC0 | itch.io pages and `License.txt` inside the zips the scouts downloaded today | UAL1 page: "Asset license: Creative Commons Zero v1.0 Universal", updated 2026-09-16. **UAL2 page: updated 2026-09-28 and the "Asset license" row is gone** (text still says "(CC0 License)"). Both zips contain `License.txt`: "CC0 1.0 Universal ... Public Domain Dedication". Fantasy Props MegaKit page shows the CC0 field. |
| Poly Haven rocks exist as CC0 models | Poly Haven API `/info`, `/files` | `rock_07`, `rock_09` (Jenelle van Heerden), `boulder_01` (Rico Cilliers), `stone_01`, `rock_moss_set_01` are models (`type 2`). 1k glTF totals: 2.2, 2.0, 5.8, 3.7, 1.9 MB raw. |
| Real size of SMK files | Bounding boxes of the staged GLBs vs SMK `dimensions` | **Not uniform.** The KAS65 "small" STL is real millimetres (2,232 mm; record says 219 cm). KAS740, KAS81/10, KAS200, KAS1238 are normalised to 130 units on their longest axis. SMK has dimensions for only some objects (KAS65, 1238, 644, DEP457 and the Column panels). So every manifest entry needs its own `heightM`. |
| The planned loader works headless | Node 22: `GLTFLoader` + `MeshoptDecoder` on the staged meshopt GLBs | Decodes in 0.6 to 3 ms. Positions arrive as normalised Int16 (interleaved) with a node scale of about x290 to x1116. See §4.3. |
| A bake function fixes that | Same test with `bakeToFloat32` (§4.3) | Correct extents (349 x 572 x 263 mm for the Trajan bust), `applyMatrix4` and `mergeGeometries` work afterwards. Steady-state cost 4 to 9 ms per 30k-triangle mesh (first call 90 to 170 ms, JIT). |
| Optimisation presets | gltf-transform CLI 4.5.1: `weld`, `simplify`, `resize`, `webp`, `meshopt` | Hero props shrink 5 to 40x (table in §3.4). |
| KTX2 is available | `toktx`, `ktx`, `basisu` on PATH; Homebrew | None installed; `brew search ktx` finds no KTX-Software formula. KTX2 is deferred to a later phase (§3.4). |

---

## 2. Shortlist: the first 25

Ranking is by payoff (see §0). "Wave" is the build wave from §8. Sizes: **(m)** measured in this or the scouts' sessions, **(e)** estimated from a measured sibling. License ids: `CC0-1.0`, `PDM-1.0` (SMK's public-domain mark; Commons also tags these scans `Cc-zero`), `CC-BY-4.0`.

### 2.1 Ranking

| # | id | What | License | Shipped (tris, size) | Effort | Why this rank |
|---|---|---|---|---|---|---|
| 1 | `anim-ual1` | Quaternius Universal Animation Library 1 (Standard), about 20 clips baked onto our 21 bones: `Swim_Fwd_Loop`, `Swim_Idle_Loop`, the four `Sitting_*`, `Death01`, `Hit_Chest`, `Hit_Head`, `Idle_Talking_Loop`, `PickUp_Table`, `Interact`, `Push`, `Dance_Loop` | CC0-1.0 | about 0.2 MB (e); scouts: 40 clips about 0.3 to 0.4 MB | M, 3 d | Fills real holes: no swim animation exists (the Tiber is swimmable), no sit-down/get-up, thin death/hit coverage. Does not replace our procedural locomotion or combat. |
| 2 | `tree-stone-pine` | "Umbrella pine" by Alwoke, two tree variants | CC-BY-4.0 | 5.3k tris per tree; about 0.4 MB (527 KB with the ground patch, scouts (m)) | M, 2 d | The signature tree of the Roman skyline; the procedural pine is the weakest thing in view. Gated on tree placement (§8.3). |
| 3 | `tree-cypress` | "Cypress v.2" by SCADL & Co | CC-BY-4.0 | 4.4k tris; 247 KB (m, twice) | S, 0.5 d | Tombs, gardens, the Via Appia. Cheap once #2's hook exists. |
| 4 | `statue-prima-porta` | Plaster cast of the Augustus of Prima Porta (SMK `KAS65`), real-scale file (record 219 cm) | PDM-1.0 | 30k tris, LOD1 3k; 105 KB (m, meshopt) | M, 1 d (first scan, proves the pipeline) | The one full-length hero statue of the emperor type that stood everywhere. |
| 5 | `bust-trajan` | Bust of Trajan, dated 108-113, H 56 cm (Saint-Raymond `Ra 117`) | CC0-1.0 | 20k tris; 72 KB (m) | S, 0.5 d | The face of the game's year. |
| 6 | `kit-scutum` | "Roman Scutum Shield" by DennisVanMalderen (winged-thunderbolt, 1k PBR), about 1 m tall | CC-BY-4.0 | 1.5k tris; 447 KB (m, 1k textures) | M, 2 d | Always on screen in first person (the GDD's other view). Only for `scutum` + `thunderbolt`; other shields stay procedural (§4.4). |
| 7 | `tree-olive` | "Old olive tree" by massive-graphisme | CC-BY-4.0 | 14.7k tris at ratio 0.12, 604 KB (m); target at most 6k near (e) | S, 0.75 d | Hillsides, courtyards, Via Appia margins. |
| 8 | `bust-marcellus` | Augustan prince, "Marcellus?" (SMK `KAS809`) | PDM-1.0 | 20k; about 75 KB (e) | S, 0.25 d | Lands in the **already finished** river district: the Theatre of Marcellus. Identification is debated; do not name it in UI. |
| 9 | `bust-augustus-oak` | Augustus crowned with oak, H 51 cm (Saint-Raymond `Ra 57`) | CC0-1.0 | 20k (from 477k); about 75 KB (e) | S, 0.25 d | Temples and fora of Augustus; a second Augustus type. |
| 10 | `bust-matidia` | Matidia, Trajan's niece, veiled (SMK `KAS740`) | PDM-1.0 | 20k; about 75 KB (e) | S, 0.25 d | Trajanic court lady; veiled-matron type. |
| 11 | `bust-flavian-matron` | Roman lady with a tall curl-tower coiffure (SMK `KAS843`) | PDM-1.0 | 20k; about 75 KB (e) | S, 0.25 d | The hairstyle of the late Flavian / Trajanic court; best female fashion match. |
| 12 | `bust-trajanic-man` | Man with strong curly hair, dated 110-120 (SMK `KAS200`, **full file only**: 100 MB, 2M tris) | PDM-1.0 | 20k; about 75 KB (e) | S, 0.5 d | Civic portrait for atria and galleries; closest male Trajan-era portrait. |
| 13 | `kit-gladius` | "Ancient Roman gladius" with sheath by Samize, 3.1k tris | CC-BY-4.0 | about 1.5k tris after decimation; 235 KB (m, 1k) | M, 1 d | First-person sword; grip must match `WEAPON_INFO.gripTilt` and the arm IK. |
| 14 | `relief-column-trajan` | Four casts of Trajan's Column, all dated 113 (SMK `KAS81/9`, `/10`, `/11`, `/13`), baked into one normal/height strip for the shaft's spiral frieze | PDM-1.0 | strip 2048 x 1024 WebP about 0.8 to 1.5 MB (e) | L, 3.5 d | The game starts the day before the Column's dedication. Only worth it once the `column-trajan` H builder exists (v0.1). |
| 15 | `anim-ual2` | UAL2 (Standard) subset: `Walk_Carry`, `TreeChopping`, `Farm_Harvest`, `Farm_PlantSeed`, `Farm_Watering`, `Chest_Open`, `Consume`, `LayToIdle`, `Hit_Knockback`, `ClimbUp_1m` | CC0-1.0 (see §7 L1) | about 0.15 MB (e) | S, 1 d (reuses #1's bake tool) | NPC work and carry loops. Optional until the itch license row is clarified. |
| 16 | `rocks-polyhaven` | `rock_07`, `rock_09`, `boulder_01`, retinted to the tufa / travertine palette | CC0-1.0 | 3 x at most 2k tris; about 0.45 MB (e) | M, 1.5 d | Hill slopes, cliffs, banks. Needs `ModelScatter`. |
| 17 | `statuette-jupiter` | Bronze Jupiter statuette, H 16.8 cm (Saint-Raymond 2014.1.1) | CC0-1.0 | 10k, LOD1 1.5k; about 45 KB (e; 121 KB unquantised (m)) | S, 0.5 d | Lararia and shop shrines: replaces the procedural `statueFigure` inside `shrines.ts`. |
| 18 | `relief-funerary-aiedius` | Funerary relief of P. Aiedius Amphio and Aiedia, 64 x 98 cm (SMK `DEP457`) | PDM-1.0 | 25k; about 90 KB (e) | S, 0.5 d | Tomb rows on the Via Appia, columbarium facades. |
| 19 | `bust-claudius` | Claudius (SMK `KAS722`) | PDM-1.0 | 20k; about 75 KB (e) | S, 0.25 d | `temple-divus-claudius` (B in v0.0), `porticus-liviae`. |
| 20 | `bust-julia-titi` | Julia Titi, c. AD 80-81, H 62 cm (SMK `KAS1238`) | PDM-1.0 | 20k; about 75 KB (e) | S, 0.25 d | `temple-vespasian-titus` (M in v0.0), `templum-pacis`. |
| 21 | `bust-drusus` | Julio-Claudian prince, Drusus (SMK `KAS431`) | PDM-1.0 | 20k; about 75 KB (e) | S, 0.25 d | Family galleries of the Augustan temples. |
| 22 | `statue-heroic-nude` | Standing heroic-nude statue, SMK title "Germanicus", H 192 cm (SMK `KAS644`) | PDM-1.0 | 25k to 30k; about 100 KB (e) | S, 0.25 d | Second full-length hero statue for public pedestals. Use the shape, not the museum's identification. |
| 23 | `head-dacian` | Gaul-or-Dacian man, c. 100 (SMK `KAS598`) | PDM-1.0 | 20k; about 75 KB (e) | M, 1 d | Needs a head-swap on the procedural captive statue (otherwise it is only a herm head). |
| 24 | `prop-marble-table` | "Roman Marble Table" by Opus Poly, scan-based, House of the Ceii, Pompeii | CC-BY-4.0 | 3k tris; 416 KB at 1k (m), about 130 KB at 512 (e) | S, 0.5 d | Low payoff (we already have `table_marble`), but it is the **pipeline test for a textured prop** (tint normalisation, WebP, override hook). |
| 25 | `prop-oil-lamp` | "Roman Oil Lamp (Low Poly)" by Opus Poly | CC-BY-4.0 | 858 tris; 54 KB (m, 512) | S, 0.5 d | Same reason as #24; shrines and tavern tables. |

Totals of the per-item figures: about 5.7 MB, plus LOD chains on the scans, so about 6 MB. Estimated texture VRAM for the textured items (arithmetic, w x h x 4 x 1.33 per map): scutum 8.4 MB (1k base, 512 normal and ORM), gladius 8.4 MB, table 4.2, lamp 4.2, trees about 9, rocks 12.6, column strip 11, so about 58 MB against the 96 MB budget in §3.6.

### 2.2 Placement and attribution

Atlas ids are from `src/data/atlas.ts` (all exist). "Now" means a landmark that has a real builder today (only the river district does: `river-*.ts`; everything else falls back to the generic builder, which is why the Forum of Trajan group is a v0.1 target).

| id | Target placement (atlas ids / code hook) | First usable | Attribution text for `CREDITS.md` |
|---|---|---|---|
| `anim-ual1` | Avatar clip layer (`src/actors/avatar/anim`); swim driven by `player:swim` (`src/world/water/swim.ts`), sit by `IdleLoop` `sit`, death/hit by the combat events | now (swim) | Universal Animation Library (Standard) by Quaternius, CC0 1.0, https://quaternius.itch.io/universal-animation-library. Retargeted to the Skyrome rig. |
| `tree-stone-pine` | `Forest` species `umbrella_pine` near LOD (at most 110 m), procedural far LOD kept. Palatine, forum gardens, Via Appia, spawn route (Porta Capena). | when trees are placed | "Umbrella pine" by Alwoke (alwoke78), https://sketchfab.com/models/b263487bab864018a92b609882ce7989, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Modified: ground patch removed, decimated, textures resized to WebP, geometry compressed. |
| `tree-cypress` | `Forest` species `cypress`: tombs on `via-appia`, `horti-sallustiani`, villas | same | "Cypress v.2" by SCADL & Co, https://sketchfab.com/models/bdb2ae463ed644f0be9d51371ddf63c5, CC BY 4.0. Modified: textures resized to WebP, geometry compressed. |
| `statue-prima-porta` | `statueFigure` hook (hero pedestal in the Forum Romanum / Rostra area), `forum-augustus` / `temple-mars-ultor` niche, `house-augustus` atrium. Use as the *type*; the original was found at Livia's villa. | v0.1 | SMK, Statens Museum for Kunst (Royal Cast Collection), KAS65 "Augustus of Prima Porta", public domain, https://open.smk.dk. Decimated for real-time use. |
| `bust-trajan` | `forum-trajan`, `basilica-ulpia`, `forum-trajan-gateway` niches and gallery; head donor for the `equus-traiani` horseman | v0.1 (H group) | Bust of Trajan (Ra 117), Musée Saint-Raymond, Toulouse (3D scan by IMA Solutions), CC0, via Wikimedia Commons. Decimated. |
| `kit-scutum` | `Equipment` shield `scutum` + emblem `thunderbolt` (legionaries, the player in first person) | v0.0 | "Roman Scutum Shield" by DennisVanMalderen, https://sketchfab.com/models/d67564c8980b4e84acde74144da941ea, CC BY 4.0. Modified: textures resized to WebP, geometry compressed, re-oriented to the grip. |
| `tree-olive` | `Forest` species `olive`: Aventine, Janiculum, farmland, courtyards | when trees are placed | "Old olive tree" by massive-graphisme, https://sketchfab.com/models/6328df8a0f214143a880a72b86db2ab4, CC BY 4.0. Modified: decimated, textures resized to WebP, geometry compressed. |
| `bust-marcellus` | `theatre-marcellus` and `porticus-octaviae` (now); `forum-augustus` | now | SMK ... KAS809 (as above). |
| `bust-augustus-oak` | `temple-divus-augustus`, `forum-augustus`, `house-augustus`; `herm` prop heads | v0.1 | Bust of Augustus crowned with oak (Ra 57), Musée Saint-Raymond (as above). |
| `bust-matidia` | `forum-trajan` portrait gallery; atria | v0.1 | SMK ... KAS740. |
| `bust-flavian-matron` | `herm` prop, domus atria (`src/arch/fabric/domus.ts`), tombs | now (herm) | SMK ... KAS843. |
| `bust-trajanic-man` | `herm` prop, Curia gallery, Forum Romanum honorific pedestals | now (herm) | SMK ... KAS200. |
| `kit-gladius` | `Equipment` weapon `gladius` (first and third person) | v0.0 | "Ancient Roman gladius sword" by Samize, https://sketchfab.com/models/7261d334924f4a9b835ef4b15c1e16d0, CC BY 4.0. Modified: decimated, textures resized, geometry compressed. |
| `relief-column-trajan` | `column-trajan` builder: helical band normal/height map; optionally two panels as base details | v0.1 (H builder) | SMK ... KAS81/9, KAS81/10, KAS81/11, KAS81/13 (Trajan's Column casts, dated 113). Baked into a relief texture. |
| `anim-ual2` | NPC `IdleLoop` additions (`work`, `carry`), farm and chopping loops, knockback | v0.1 | Universal Animation Library 2 (Standard) by Quaternius, CC0 1.0, https://quaternius.itch.io/universal-animation-library-2. |
| `rocks-polyhaven` | `ModelScatter` on hill slopes (Palatine, Capitoline `tarpeian-rock`), riverbanks, road verges | when scatter exists | "Rock 07", "Rock 09" by Jenelle van Heerden, "Boulder 01" by Rico Cilliers, Poly Haven, CC0, https://polyhaven.com. Decimated, retinted. |
| `statuette-jupiter` | `statueFigure` hook in `shrines.ts` (lararia), offering shelves, loot icon | now (shrines) | Jupiter statuette (2014.1.1), Musée Saint-Raymond (as above). |
| `relief-funerary-aiedius` | Tomb rows on `via-appia`, `columbarium-pomponius-hylas` facade | v0.2+ | SMK ... DEP457. |
| `bust-claudius`, `bust-julia-titi`, `bust-drusus` | `temple-divus-claudius`, `porticus-liviae`; `temple-vespasian-titus`, `templum-pacis`; `temple-divus-augustus` | v0.0 to v0.1 | SMK ... KAS722, KAS1238, KAS431. |
| `statue-heroic-nude` | `statueFigure` hook (second hero pedestal), `porticus-octaviae` | v0.1 | SMK ... KAS644. |
| `head-dacian` | Forum of Trajan colonnade captives (head swap); dark stone | v0.1 | SMK ... KAS598. |
| `prop-marble-table` | `table_marble` override: domus triclinium and atrium, tavern | v0.1 | "Roman Marble Table" by Opus Poly, https://sketchfab.com/models/ae18ba9db0f34eab9b8af5250540b994, CC BY 4.0. Modified: textures resized to WebP, geometry compressed. |
| `prop-oil-lamp` | `oil_lamp` override: shrines, tavern tables | v0.1 | "Roman Oil Lamp (Low Poly)" by Opus Poly, https://sketchfab.com/models/2c86ea5fb88543529816df44cfccc3ac, CC BY 4.0. Modified as above. |

Credit rule for the SMK lines: the generator writes "SMK, Statens Museum for Kunst, Royal Cast Collection, <object number> '<our neutral title>', public domain (https://creativecommons.org/publicdomain/mark/1.0/), https://open.smk.dk". CC0 and public-domain credits are a courtesy; the CC BY lines are legally required (title, author, source, license link, note of changes: CC BY 4.0 §3).

### 2.3 Next in line (not in the first 25)

Not built first because they need a login, are lower payoff, or carry a style or type doubt.

| Item | License | Why it waits |
|---|---|---|
| Cupid relief fragments of the Temple of Venus Genetrix, "Date: 113 AD" (artfletch, `45460b35...`) | CC BY | Sketchfab login (the scouts' C2); strongest history hook of the second batch |
| Vespasian recut from Nero (Cleveland), Isis bronze (Minneapolis), "Julius Caesar?" (Rijksmuseum van Oudheden), Trajan sestertius and Augustan aurei (Saint-Raymond) | CC0 | Sketchfab login (token) |
| Livia ("Ceres type", Kiel), Ulpia Marciana (mikepnyu), Lar statuette (laurashea), Dressel 20 amphora (josemoya), priestess head (Carlos) | CC BY | Sketchfab login; Livia SA alternative is rejected |
| Helmet ("Roman Helmet", Vasco Amorim de Lemos, 11k to 3k tris) | CC BY | The model is an officer-style crested helm; the right Imperial Gallic / Italic type for 113 is unconfirmed |
| Quaternius `Dummy` (palus), `WeaponStand`, `Anvil`, `Workbench`, `Bag`, `Rope_*` | CC0 | Hand-painted fantasy style; the Ludus (v0.0) could use `Dummy` and `WeaponStand`, but a palus is easy to build procedurally |
| Poly Haven leaf and needle atlases (alpha cards for the procedural plane, laurel, fig) | CC0 | Texture work, not a model; good cheap upgrade after #2 to #7 |
| Wine strainer, silver cup (Allard Pierson), amphora (Anskar) | CC BY | Procedural amphorae are cheap and plentiful; real ones only for close-ups |

**To use the Sketchfab group:** `GET /v3/models/<uid>/download` with `Authorization: Token <API token>` returns signed glTF/GLB URLs. `fetch.mjs` reads the token from the environment variable `SKETCHFAB_TOKEN`. The token must never be committed (add `.env*` to `.gitignore` when this is wired).

### 2.4 Not recommended (summary of the scouts' rejections)

AI-generated Sketchfab "scans" (the giorgia.mingotto capital series, two "Ara Pacis" uploads, `juanbrualla`); British Museum's own uploads (BY-NC-SA) and any re-upload of them; Scan the World / MyMiniFactory; Open Heritage 3D; CC BY-SA items (Livia and young Augustus from Saint-Raymond via Scan the World); Mixamo raw files; Mesh2Motion's add-on clips (README says CC0 but provenance of Mixamo-like clip names cannot be proven); real base bodies and outfits (Quaternius UBC/MCO: modern-fantasy clothes, heroic proportions, would cost weeks to integrate and look worse than our period garments); Kenney and KayKit (toy style); anachronistic scans (Marcus Aurelius, Hadrian, Antinous, Farnese Hercules, the Capitoline Wolf, inhumation sarcophagi).

---

## 3. Pipeline

### 3.1 Layout

```
assets/
  manifest.json            source of truth (committed)
  licenses/<id>.json       dated snapshot of the license evidence (API JSON, wikitext, page text); committed
scripts/assets/
  fetch.mjs                raw download + live license check + sha256
  build.mjs                raw -> public/models/<id>.glb (+ index.json)
  bake-anim.mjs            UAL clips -> public/anim/<id>.json (retarget + 30 fps sampling)
  credits.mjs              manifest -> CREDITS.md + public/credits.json
  check.mjs                CI gate
  lib/                     sources/{smk,commons,objaverse,polyhaven,itch,manual}.mjs, stl.mjs, presets.mjs, manifest.mjs
.asset-cache/              raw downloads, git-ignored (about 0.6 GB for the first 25)
public/models/<id>.glb     optimised output (committed)
public/models/index.json   runtime catalogue (committed, generated)
public/anim/<id>.json      baked clips (committed, generated)
CREDITS.md                 generated (committed)
```

npm scripts: `assets:fetch`, `assets:build`, `assets:credits`, `assets:check`, and `assets` (all four). Use the gltf-transform **SDK** inside the scripts (pinned in `devDependencies`) instead of shelling out to `npx`: it is reproducible, and it lets the build bake transforms and attach `extras`.

`.gitignore` additions: `.asset-cache/`, `.env*`. `.gitattributes`: `public/models/** binary`, `public/anim/** binary`.

### 3.2 Manifest

One entry per shipped asset. Fields the fetch and check scripts rely on:

```jsonc
{
  "budget": { "totalMB": 25, "vramTextureMB": 96, "byKindMB": { "statue": 6, "prop": 4, "tree": 5, "anim": 1.5 } },
  "assets": [
    {
      "id": "bust-trajan",
      "kind": "bust",                         // bust | statue | relief | prop | kit | tree | rock | anim
      "title": "Bust of Trajan (Ra 117)",
      "wave": 2,
      "source": { "type": "commons",          // commons | smk | objaverse | polyhaven | itch | manual
                  "url": "https://upload.wikimedia.org/wikipedia/commons/e/e5/MSR-Trajan-Ra_117.stl",
                  "page": "https://skfb.ly/6nQIw" },
      "sha256": "d7eddf36ab29e32dbbf338e2803d29dd6e8cdc310761e8a9956621baf3876c8e",   // of the RAW file
      "license": { "id": "CC0-1.0",
                   "evidence": "Commons wikitext |photo license = {{cc0}}, PermissionTicket 2024051410005487 (checked 2026-10-04)" },
      "author": "Musée Saint-Raymond, Toulouse / IMA Solutions",
      "attribution": null,                    // required text for CC-BY; optional for CC0
      "process": { "format": "stl", "up": "y", "unit": "mm", "facing": "-z", "rotateY": 0,
                   "heightM": 0.572, "sizeSource": "bbox", "lods": [20000, 3000] },
      "runtime": { "material": "scan:marble", "collider": "cylinder", "castShadow": true, "tags": ["portrait", "trajanic"] }
    },
    {
      "id": "bust-matidia",
      "kind": "bust",
      "title": "Veiled bust, Trajanic matron (SMK KAS740)",
      "source": { "type": "smk", "objectNumber": "KAS740", "prefer": "small", "fallback": "full" },
      "sha256": "96cec6747904d4015b4bdd5a07a4f4f20e508d26158bc5670320cd5ea6f8896c",
      "license": { "id": "PDM-1.0", "evidence": "api.smk.dk public_domain=true, rights=https://creativecommons.org/publicdomain/mark/1.0/ (2026-10-04); Commons template Licensed-PD-Art|PD-old-100-expired|Cc-zero" },
      "author": "SMK, Statens Museum for Kunst (Royal Cast Collection)",
      "process": { "format": "stl", "up": "z", "unit": "normalised130", "facing": "-z", "heightM": 0.62, "sizeSource": "estimate", "lods": [20000, 3000] },
      "runtime": { "material": "scan:marble", "collider": "cylinder" }
    },
    {
      "id": "tree-stone-pine",
      "kind": "tree",
      "title": "Umbrella pine",
      "source": { "type": "objaverse", "uid": "b263487bab864018a92b609882ce7989", "shard": "000-126",
                  "page": "https://sketchfab.com/models/b263487bab864018a92b609882ce7989", "sketchfabSlug": "by" },
      "sha256": "9776a0d595406dc9eee23a11210086403ebb3229cb74ee979dea3a59ea52acec",
      "license": { "id": "CC-BY-4.0", "evidence": "Sketchfab API license.label 'CC Attribution', url creativecommons.org/licenses/by/4.0/ (2026-10-04)" },
      "author": "Alwoke (alwoke78)",
      "attribution": "\"Umbrella pine\" by Alwoke (alwoke78), https://sketchfab.com/models/b263487bab864018a92b609882ce7989, CC BY 4.0. Modified: ground patch removed, decimated, textures resized to WebP, geometry compressed.",
      "process": { "dropNodes": ["Plane"], "lods": [0.15, 0.04], "textures": { "max": 512, "format": "webp" }, "alpha": { "mode": "MASK", "cutoff": 0.5 } },
      "runtime": { "species": "umbrella_pine", "trunkRadius": 0.45, "tint": "foliage_pine", "wind": "tree" }
    },
    {
      "id": "anim-ual1",
      "kind": "anim",
      "source": { "type": "itch", "creator": "quaternius", "slug": "universal-animation-library", "member": "UAL1_Standard.glb", "manualFallback": ".asset-cache/manual/UAL1_Standard.zip" },
      "sha256": "69591853d817488edaa8fd9bf8fc1d821eaeaf789f8627b3cd23b41c4ed67997",
      "license": { "id": "CC0-1.0", "evidence": "in-zip License.txt 'CC0 1.0 Universal'; itch field 'Creative Commons Zero v1.0 Universal'; page updated 2026-09-16" },
      "author": "Quaternius",
      "process": { "clips": ["Swim_Fwd_Loop", "Swim_Idle_Loop", "Sitting_Enter", "Death01", "..."], "fps": 30 }
    }
  ]
}
```

The `sha256` values above are the real hashes of the files the scouts downloaded on 2026-10-04 (UAL1 is the GLB extracted from the zip). Appendix A lists a seed row for every shortlisted item, including hashes for the 23 raw files that are staged.

### 3.3 `fetch.mjs`

1. **Resolve** the source to URLs. SMK is resolved through the API at fetch time (`filters=[object_number:KAS740]`, pick the `files_3D` entry whose URL contains `small`, else the full file), which avoids hard-coded hash filenames and the KAS200 404. Objaverse is `https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/<shard>/<uid>.glb`. Poly Haven is `https://api.polyhaven.com/files/<id>` (the 1k glTF URL plus every `include` URL, kept at their relative paths). `itch` replays the scouts' three-request click path (their Appendix B); because that is fragile, every source type also accepts a **manual drop-in**: a file placed in `.asset-cache/manual/` that matches the manifest's sha256.
2. **Download** to `.asset-cache/raw/<id>/`, with a descriptive `User-Agent` (Wikimedia asks for one), resume support and a range check first.
3. **Verify sha256.** A `null` hash is pinned on first fetch with `--pin` (trust on first use) and printed. After that a mismatch is a hard error: the upstream file changed, so re-verify the license before accepting it.
4. **Re-check the license live and fail closed.**
   - `smk`: API `public_domain === true` and `rights` contains `publicdomain/mark`.
   - `commons`: raw wikitext matches `{{cc0}}`, `Cc-zero` or `cc-by-*`; `cc-by-sa-*` is refused unless the entry carries `ownerApproved: true`.
   - `objaverse` / `sketchfab`: `license.slug` equals the manifest's `sketchfabSlug`, `isDownloadable` is true, and the author display name equals the manifest's.
   - `polyhaven`: site-wide CC0; records `info.authors`.
   - `itch` / `manual`: requires a license file stored with the asset.
   The evidence is written to `assets/licenses/<id>.json` with `fetchedAt`. The manifest `license.id` must be in the allowlist `{CC0-1.0, PDM-1.0, CC-BY-4.0, CC-BY-3.0}`; anything else (including NC, ND, SA without approval) stops the run.
5. **Never fetch** from a host outside an allowlist (`upload.wikimedia.org`, `commons.wikimedia.org`, `api.smk.dk`, `huggingface.co`, `api.polyhaven.com`, `dl.polyhaven.org`, `api.sketchfab.com`, plus the download host that itch's endpoint returns, to be pinned at the first run), and refuse any entry whose manifest says `aiGenerated: true`.

### 3.4 `build.mjs`: optimisation presets

All presets finish with meshopt compression, quantised positions (14 bit) and normals dropped (computed at load, §4.3) for scans. They record `extras.skyrome = { heightM, bounds, tris }` in the GLB and write the catalogue `public/models/index.json` (file, content hash for cache-busting, bytes, per-LOD triangle counts, bounds, `avgAlbedo` for textured items, license id). A per-asset `buildHash` (manifest entry plus preset version plus tool versions) lets `build.mjs` skip unchanged assets, which avoids binary churn in git.

**`bust` / `statue` / `relief` (STL, no textures).** The scouts' converter logic (their Appendix B) is already tested; the steps are:

1. Parse the binary STL, weld identical vertices (about 1 s for 400k triangles; the 100 MB KAS200 file needs a larger Node heap, `--max-old-space-size=8192`).
2. Orient: `up: z` (SMK) rotates -90 degrees about X, `up: y` (Saint-Raymond) does not; apply `rotateY` so the figure **faces -z** (the convention of `statues.ts`); scale to metres from `heightM` (the bbox height after orientation); move the origin to the bottom centre (the feet). Reliefs lie flat with the front on +z.
3. LOD chain with `meshoptimizer` simplify (`ratio = target / raw`, `error 0.02`): `lod0` 20k (hero 30k to 40k), `lod1` 3k, optional `lod2` 600. All in one GLB as nodes `lod0..lodN`, each with `extras.maxDistance`.
4. Meshopt (`level: high`) with 14-bit positions.

Measured by the scouts: Trajan 20k tris 245.6 KB raw, **71.8 KB** meshopt (Draco 40.3 KB is smaller but needs its own WASM decoder; meshopt is the better fit with the `animation` and texture path and is already planned, decode speed not compared here); Prima Porta 30k **104.6 KB**; Column panel 15k **53.6 KB**. Simplification takes about 1 s per model.

**`prop` / `kit` (textured GLB).** Run today with gltf-transform CLI 4.5.1 on the staged raw files (`weld`, `simplify`, `resize`, `webp --quality 80`, `meshopt --level medium`):

| Asset | Raw | Result | Settings |
|---|---|---|---|
| scutum | 4.39 MB | **447 KB** | ratio 1.0 (1.5k tris), 1024 |
| gladius | 1.99 MB | **235 KB** | ratio 0.5 (about 1.5k tris), 1024 |
| helmet (backlog) | 2.09 MB | **180 KB** | ratio 0.27 (about 3k tris), 1024 |
| marble table | 3.39 MB | **416 KB** | ratio 1.0 (3k tris), 1024 |
| oil lamp (low poly) | 2.34 MB | **54 KB** | ratio 1.0 (858 tris), 512 |
| amphora (backlog) | 1.28 MB | **48 KB** | ratio 0.23 (about 2k tris), 512 |
| cypress | 1.07 MB | **247 KB** | 512 |

Rules: metal-rough materials only (`gltf-transform metalrough` for any old spec-gloss file; r186 `GLTFLoader` no longer reads `KHR_materials_pbrSpecularGlossiness`), flatten and join per material, strip cameras and lights, name nodes. **Default texture size 512; 1024 only for the first-person kit (base colour 1024, normal and ORM 512).** Pack roughness and metalness into one ORM texture; drop normal maps from small props where they do not read.

**`tree`.** As `prop`, plus: drop named nodes (`dropNodes`, e.g. the pine's ground patch), set `alphaMode MASK` with cutoff 0.5 for leaf cards and `doubleSided`, `simplify` ratios per LOD (pine 0.15 gave 36.6k to 5.3k per tree with no visible change at game range), textures at most 512, and write `avgAlbedo` of the base-colour texture to the catalogue for tint normalisation (§5).

**`rock`.** Poly Haven glTF with its textures: simplify to at most 2k tris, 512 textures, WebP, ARM packed.

**`anim`.** `bake-anim.mjs` implements the scouts' retarget algorithm (their §3.3 and Appendix D): align each of our bones to the source bind direction once, then per baked frame `Dq = Ws(b,t) * inverse(Ws0(b))`, `Wt = Dq * Wref[b]`, local = `inverse(Wt(parent)) * Wt`, hips translation scaled by `ourHipHeight / srcHipHeight`; sample at 30 fps; one quaternion track per mapped bone named in our camelCase (`upperArmL.quaternion`) plus `hips.position`. Output is JSON with quantised Int16 quaternions, about 0.2 MB for 20 clips. Known limits from the prototype: no foot planting (our IK still applies for locomotion), weapon and shield sockets are not driven by clips (the controller does that), `onHit` times must be authored per clip (about 0.35 s for `Sword_Regular_A`), and a seated matron's skirt flares (its weights were tuned for our own sit pose). Motion quality (blends, sliding) has not been seen in motion, only in still frames.

**KTX2 (phase 2, not needed yet).** Textures in WebP decode to full RGBA in VRAM (1k with mips is 5.6 MB per map). KTX2 (ETC1S for colour, UASTC for normals) cuts that 4 to 6x but needs `toktx` (KTX-Software; not installed here, no Homebrew formula found) or an untested WASM encoder such as `ktx2-encoder`, plus `KTX2Loader` and the Basis transcoder (`three/examples/jsm/libs/basis/`, JS plus WASM, about 0.5 MB, copied into `public/basis/`). Add it only if the VRAM budget in §3.6 is exceeded. Scans have no textures, so they are unaffected.

### 3.5 Credits and checks

- **`credits.mjs`** reads the manifest and `public/models/index.json` and writes `CREDITS.md` (root; sections: CC BY 4.0 table with title, author, source link, license link and "modified" note; CC0 / public-domain courtesy list grouped by source; libraries: three.js MIT, meshoptimizer MIT, Basis Universal Apache-2.0 if KTX2 ships) and `public/credits.json` for an in-game credits screen. Only assets present in `public/models` are listed. `check.mjs` fails if `CREDITS.md` is stale. The README's licensing line should say "code MIT; third-party assets under their own licenses, listed in CREDITS.md".
- **`check.mjs`** (also run from `npm test` through a small Vitest file, so it gates every commit) fails when: a file in `public/models` or `public/anim` is not in the manifest (provenance); a manifest license id is outside the allowlist; a CC BY entry lacks `author`, `page` or `attribution`; the total size exceeds the budget; estimated texture VRAM exceeds the budget; a catalogue entry's triangle count exceeds its kind's cap; or `CREDITS.md` is stale.

### 3.6 Size budget

| Pool | Cap | First-wave projection | Notes |
|---|---|---|---|
| Statues, busts, reliefs (incl. the baked column strip) | 6 MB | about 3 MB | strip is the biggest estimate |
| Props and first-person kit | 4 MB | about 1.1 MB | |
| Trees and rocks | 5 MB | about 1.6 MB | |
| Animation | 1.5 MB | about 0.4 MB | |
| Reserve | 8.5 MB | | next 15 items, KTX2 transcoder |
| **Total `public/models` + `public/anim`** | **25 MB** | **about 6.1 MB** | `public/` today is 12 MB of textures; keep the whole `public/` under about 60 MB |
| Texture VRAM for models (before KTX2) | 96 MB | about 58 MB | arithmetic estimate, not measured on a GPU |

Triangle caps (checked per catalogue entry): bust and statue LOD0 at most 40k, LOD1 at most 4k; props at most 4k; trees near LOD at most 8k; rocks at most 2k. Per landmark, count with `MeshBuilder.triangleCount` and keep scans under about 15 % of the 3M-triangle scene budget (so about 450k, which is roughly 20 busts at LOD0).

### 3.7 Git policy

- Commit `assets/manifest.json`, `assets/licenses/*`, `public/models/*`, `public/anim/*`, `CREDITS.md`. Never commit raw files, zips or STLs (the SMK and Saint-Raymond raw files are 20 to 100 MB each).
- Commit assets in batches (one commit per wave or per kind), not file by file, and do not re-optimise existing outputs unless their `buildHash` changed: binary files do not delta-compress, and the repo's `.git` is already 31 MB of loose objects.
- Outputs are committed (not rebuilt in CI) because several sources can disappear or change: the Hugging Face mirror, SMK's API, itch.io's page. The manifest keeps the original `page` so any item can be re-fetched or replaced.

---

## 4. Runtime loader

### 4.1 Module: `src/assets/`

```
src/assets/
  ModelLibrary.ts     GLTFLoader + MeshoptDecoder (+ lazy KTX2Loader), index.json, cache, ref-counts, dispose
  geometry.ts         bakeToFloat32, boundsOf, collider helpers
  materials.ts        scanMaterial(kind), normaliseAlbedo(material, target), tint helpers
  place.ts            addModel(...) for MeshBuilder, colliderFor(...)
  ModelScatter.ts     instanced scatter with LOD binning (rocks, open-air statues, later Quaternius clutter)
  anim.ts             ClipLibrary: baked clip JSON -> THREE.AnimationClip
  index.ts
  *.test.ts
```

The service is added the repo's way (`CLAUDE.md`): `declare module '../core/Game' { interface Game { models: ModelLibrary } }`, assigned in `src/game/boot.ts` before `buildRome` (line 74 today), with the preload on the loading screen:

```ts
loading.progress(0.02, 'Unpacking the statues…');
game.models = new ModelLibrary({ baseUrl: import.meta.env.BASE_URL + 'models/' });
await game.models.preload(PRELOAD_IDS, (done, total) => loading.progress(0.02 + 0.03 * (done / total), 'Unpacking the statues…'));
```

`BASE_URL` is the same pattern `materials.ts` uses (`./` base, GitHub Pages subpath). Dev scenes that place scans call `await game.models?.preload([...])` themselves.

### 4.2 API sketch

```ts
export interface ModelPart { geometry: THREE.BufferGeometry; material: MaterialId | THREE.Material; castShadow: boolean }
export interface ModelLod { parts: ModelPart[]; tris: number; maxDistance: number }
export interface ModelAsset {
  id: string; kind: string;
  lods: ModelLod[];                 // lods[0] = full detail
  bounds: THREE.Box3;               // metres, origin at the feet, figure faces -z
  meta: ModelMeta;                  // from index.json: heightM, license, tags, collider hint, avgAlbedo
}

class ModelLibrary {
  constructor(opts: { baseUrl: string; ktx2?: { renderer: THREE.WebGLRenderer } });
  preload(ids: Iterable<string>, onProgress?: (done: number, total: number, id: string) => void): Promise<void>; // idempotent, 4 at a time
  parse(id: string, glb: ArrayBuffer): Promise<ModelAsset>;   // used by preload and by tests (no fetch, no DOM)
  get(id: string): ModelAsset | null;       // SYNC; null when not loaded -> caller falls back to procedural
  require(id: string): ModelAsset;          // throws
  release(id: string): void;                // ref-counted; disposes geometry and textures at 0
}

/** Same shape as togate(b, at, opts): returns false when the model is absent, so callers can fall back. */
export function addModel(lib: ModelLibrary | undefined, b: MeshBuilder, id: string, at: THREE.Matrix4,
  o?: { lod?: number; scale?: number; material?: MaterialId | THREE.Material; collide?: boolean; collider?: 'cylinder' | 'box' | 'none' }): boolean;
```

`addModel` uses `MeshBuilder.instance(key, make, matrix)`: `key = model:<id>:L<n>[:<material>]` (the material override must be part of the key because `instance` caches geometry by key for the whole program), `make()` returns `InstancePart[]` with `uv: 'keep'`, and a collider from `colliderFor`. Landmark builders choose the LOD from `ctx.detail` (`'high'` gives LOD0, `'low'` gives LOD1), which needs no new LOD machinery for statues.

In a builder:

```ts
const ok = addModel(ctx.game.models, b, 'bust-trajan', mul(m, T(0, plinthTop, 0)), { lod: ctx.detail === 'high' ? 0 : 1 });
if (!ok) togate(b, m, { material: 'marble', detail: ctx.detail });   // today's procedural statue
```

### 4.3 Gotchas found (each tested or read from the code)

1. **Quantised attributes break `applyMatrix4` (tested).** A meshopt GLB (`KHR_mesh_quantization`) loads with `Int16Array` normalised, interleaved positions and a node transform that restores the real size (scale 1116 for Prima Porta, 286 for the Trajan bust). `geometry.clone().applyMatrix4(scale 2)` produced a bounding box of exactly [-1, 1]: the values are clamped to the normalised range. `MeshBuilder.add`, `instance`, `append` and `placeProp` all call `applyMatrix4`. Fix: bake the node transform into a Float32 copy at load. Validated on both staged files (extents correct afterwards, `applyMatrix4` and `mergeGeometries` fine):

   ```ts
   export function bakeToFloat32(mesh: THREE.Mesh): THREE.BufferGeometry {
     const src = mesh.geometry, m = mesh.matrixWorld;          // call gltf.scene.updateMatrixWorld(true) first
     const pos = src.getAttribute('position'), n = pos.count, e = m.elements;
     const P = new Float32Array(n * 3);
     for (let i = 0; i < n; i++) {                             // getX/Y/Z de-normalise Int16 and handle interleaving
       const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
       P[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
       P[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
       P[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
     }
     const g = new THREE.BufferGeometry();
     g.setAttribute('position', new THREE.BufferAttribute(P, 3));
     g.setIndex(new THREE.BufferAttribute(n > 65535 ? Uint32Array.from(src.index!.array) : Uint16Array.from(src.index!.array), 1));
     // normals: de-normalise with the normal matrix if present, else computeVertexNormals() on this INDEXED geometry (smooth)
     // uv: copy via getX/getY if present, else a zero Float32 uv (see 3 below)
     // color: if the consumer is vegMaterial, add a white Float32 'color' attribute (see 4 below)
     return g;
   }
   ```
2. **Flat shading unless normals exist.** `MeshBuilder` calls `toNonIndexed()` before checking for normals, then `computeVertexNormals()`, which on a non-indexed mesh gives flat faces. The loader therefore computes smooth normals on the indexed geometry first (2.6 ms for 30k triangles) and `MeshBuilder` keeps the `normal` attribute.
3. **No UV means box projection, always.** `preparedInstance` runs `boxProjectUVs` when `uv === 'box'` **or the geometry has no `uv` attribute**. `boxProjectUVs` picks one projection axis per triangle from the summed vertex normals. On the three staged scans, **7 to 19 %** of shared edges switch axis (Trajan bust 6.9 %, Matidia 12.7 %, Prima Porta 18.5 %; the Trajan figure is indicative only, because that file is Y-up and my axis remap assumed Z-up). With a photo marble texture that is a patchwork on every curved surface. So: scans carry a zero `uv` attribute (so `uv: 'keep'` is honoured) and use a **map-less** material (§5). This matches what the scouts rendered, and it suits plaster casts.
4. **Colour attribute.** `MeshBuilder.add` and `preparedInstance` delete everything except position, normal and uv, so planned vertex-colour paint (phase 2 for statues) needs a two-line change that keeps `color` for parts flagged `vertexColors`. In the other direction `vegMaterial` sets `vertexColors = true`: an imported tree without a `color` attribute would render black, so the tree adapter adds a white (or baked-AO) `color`.
5. **Async loading versus synchronous builders.** `MeshBuilder.instance(key, make, ...)` calls `make()` synchronously, and `LandmarkBuilder.build(ctx)` is synchronous. Hence preload first, `get()` second, and a fallback when `get()` is null.
6. **No DOM in Vitest.** `GLTFLoader.parse` works in Node for textureless GLBs (tested); textured models need `ImageBitmap`. Tests use scans, or build a small textured GLB in memory with the gltf-transform SDK.
7. **`GLTFLoader` r186 supports** `EXT_meshopt_compression`, `KHR_mesh_quantization`, `EXT_texture_webp`, `EXT_texture_avif`, `KHR_texture_basisu`, `KHR_texture_transform`, `EXT_mesh_gpu_instancing` (grep of the shipped file); it does not read spec-gloss.

### 4.4 Integration points

| Consumer | Change | Shared files touched |
|---|---|---|
| Landmark builders (statues, busts, reliefs) | `addModel(...)` with procedural fallback, as above | none (new calls in builders) |
| `statueFigure(d, mat, r)` in `src/arch/props/props.ts` (used by `statue_pedestal` and `shrines.ts`) | A hook `setFigureHook(fn)`: if it returns true it has drawn a scan at `d.m` and the procedural figure is skipped. Hero pedestals (variants 0 and 1) get `statue-prima-porta` / `statue-heroic-nude`; lararia get `statuette-jupiter`. Public squares otherwise keep procedural togati. | `props.ts` (about 5 lines) |
| `herm` prop | Scanned heads on the pillar (Roman herms carried portrait heads; busts on high plinths in public squares would look wrong, so full-length statues go on `statue_pedestal` and busts on herms, in atria, porticoes and cellas) | `props.ts` |
| `makeProp` / `PropScatter` (tables, lamps) | `registerPropOverride(kind, () => PropModel)`; `PropModel.parts[].material` widened to `MaterialId \| THREE.Material`; `PropScatter.build` and `placeProp` accept either | `props.ts`, `PropScatter.ts` (about 10 lines) |
| `Forest` / `makeTree` (trees) | `registerTreeOverride(species, variant => TreeModel)`; `TreePart.material` widened the same way; `vegMaterial` accepts a `THREE.Material` (clone, keep the map and `alphaTest`, keep the wind injection). The real mesh replaces `near`; the procedural far LOD stays as `far`. Alpha-tested shadows work because three copies `map` and `alphaTest` onto the depth material (the wind sway is not applied to the shadow, a small mismatch). | `species.ts`, `Forest.ts`, `vegetation/materials.ts` (about 20 lines) |
| `Equipment` (first-person kit) | `shieldGeometry` and `weaponGeometry` return geometry in the avatar's vertex format (colour plus `surf`) drawn with the single avatar material. A real kit item is a separate `THREE.Mesh` with its own material, placed by a manifest `fit` (grip origin, rotation, height). It is used only for `scutum` + `thunderbolt` and `gladius`; NPC legionaries with other emblems, colours or shields keep the procedural meshes. The draw-call count is unchanged (procedural carried items are separate meshes today too). | `Equipment.ts`, `shields.ts` (small branch) |
| Animation | `ClipLibrary` registers baked clips with the avatar controller (`anim/library.ts`): new `IdleLoop` values or action names; `AvatarView.setSwimming?(on)` driven from `player:swim` in `src/game/wiring.ts`; `onHit` times per clip | `library.ts`, `controller.ts`, `wiring.ts` (the module owner) |
| `column-trajan` builder | Reads the baked relief texture from the library and applies it to the helical band material | none |
| Rocks, open-air statues | `ModelScatter` (one `InstancedMesh` per part and LOD, re-binned by camera distance as `Forest` does), trimesh-free colliders | none |

### 4.5 Colliders and instancing

Colliders come from the model's bounds plus a manifest hint, then through `transformCollider` / `registerColliders` as for procedural parts:

| Hint | Used for | Rule |
|---|---|---|
| `cylinder` | statues, busts on plinths, trees (`trunkRadius` from the manifest, not the canopy) | vertical cylinder, radius 0.8 x half the larger of x and z extent |
| `box` | reliefs, tables | oriented box, extents x 0.9 |
| `none` | lamps, statuettes, wall reliefs | no collider |

Never use `trimesh` for scans (20k triangles; the physics wrapper is meant for irregular terrain). Statues on plinths already sit on procedural `solid` colliders.

### 4.6 Tests and test bed

- Vitest: `manifest.test.ts` (the `check.mjs` rules); `geometry.test.ts` (an in-memory meshopt GLB goes through `parse`, extents and `applyMatrix4` are correct; the failure mode from §4.3 is reproduced as a regression test); `place.test.ts` (`addModel` returns false when absent, adds one instance and one collider when present, and the key includes the material override).
- Test bed `?scene=assets` (`src/scenes/assets.ts`): every catalogued model beside a 1.64 m avatar at 3, 15 and 40 m, with `stats` output. This is the **style and scale gate** (§5) and the way to look at each new asset with `node scripts/shot.mjs --scene assets --name x.png` (and `--browser webkit` for Safari).

---

## 5. Harmonising with the procedural world

The GDD's art direction (§16.1) is "real proportions and real materials, simplified geometry; chunky, readable at 30 m; hero detail saved for landmarks; statues and moldings are painted". A 20k-triangle museum scan is more detailed than anything around it, so the policy is to make scans **read as part of the same world** and to limit them to hero spots.

| Kind | Material policy |
|---|---|
| Scans (busts, statues, reliefs) | **Untextured plaster / marble look**: a `MeshStandardMaterial` with the palette albedo (`MATERIAL_BASE.marble` is `#EEEAE2`, GDD Luna marble `#EEEDE8`), roughness about 0.5, no maps, plus the shared world-space macro noise from `applyShaderPatch(material, { macro: 0.05 })` so surfaces break up like the rest. Cached per kind in `materials.ts` (`scan:marble`, `scan:plaster`, `scan:bronze` (flat bronze colour, metalness, uses the scene environment), `scan:gilded`, `scan:darkstone`). Passed to `MeshBuilder` as a `THREE.Material`, so no change to `materialIds.ts` or the catalogue. |
| Scans, phase 2 | **Paint** as the GDD asks (cinnabar, ochre, Egyptian blue accents on hair, lips, hems): a per-model region mask written to vertex colours, which needs the two-line `MeshBuilder` change from §4.3. Not needed for the first release; a bare plaster cast is also what the SMK scans look like. A triplanar fragment-shader marble is the alternative if a veined texture is ever wanted (never per-triangle box UVs). |
| Textured props and kit | Normalise the base colour toward the palette using the existing `tintFor(avg, target)` from `src/gfx/textures/catalog.ts`: `avgAlbedo` comes from the catalogue, `target` from `MATERIAL_BASE` (for example `wood`, `terracotta`, `marble`), clamp the tint factor to the function's 0.15 to 6 range. Raise roughness to at least 0.55 for stone and wood (scans and painted textures are often too glossy), drop normal-map strength to about 0.6 (as `marble` does), apply `applyShaderPatch` macro noise, and never use emissive. |
| Trees | Normalise leaf and bark albedo to `MATERIAL_BASE.foliage_pine`, `foliage_olive`, `foliage_cypress`, `bark`; the pine is described by its author as having "stylized textures", so reduce saturation and compare side by side with the procedural pine at 20, 60 and 120 m before accepting. Wind comes from `vegMaterial`. Optional height-based darkening toward the trunk as a cheap stand-in for AO. |
| Rocks | Retint toward `tufa` / `travertine` / `rock`; the Poly Haven rocks come from European "verdant trail" collections and read green and grey by default. |

**Scale and orientation.** People are 1.64 m (men) and 1.52 m (women), a bust's head about 0.23 m, doors at least 2.2 m. Every manifest entry has `heightM` and a `sizeSource` (`record`, `bbox`, `estimate`); `estimate` entries (most SMK busts, which lack dimensions) must be eyeballed against an avatar head in `?scene=assets` and corrected. Figures face -z, the origin is the feet.

**Detail budget.** Scans only at hero spots (LOD0 at 20k within about 25 m, LOD1 3k beyond, culled with the landmark). Reliefs and statues never get normal maps. Procedural anonymous statues remain the filler in crowds.

**Style gate (per asset, before merge).** Three screenshots from `?scene=assets` (3, 15, 40 m) plus one in the real placement (`scripts/shot.mjs --scene rome --steps ...`), looked at with the Read tool, next to the procedural neighbour; frame stats from the shot output (`drawCalls`, `triangles`, `fps`); and a WebKit run for anything with textures or a custom material.

**Museum identifications are not game facts.** UI labels come from `docs/CONTENT.md`, not from the museum titles ("Marcellus?", "Germanicus", "Matidia" are all debated attributions).

---

## 6. What stays procedural, and why

| Area | Reason |
|---|---|
| Architecture: orders, columns, capitals, walls, arches, vaults, roofs, insulae, shops | Must fit atlas footprints and heights parametrically; the only scanned capitals and bases are heavy provincial pieces (385k faces), and every AI-generated Roman capital on Sketchfab is rejected. Borrow at most a scan's normal map for acanthus detail later. |
| Generic prop kinds (amphorae, dolia, crates, stalls, carts, benches, braziers, forges) | 40 kinds at 130 to 180 triangles, instanced by the hundred, style-consistent, with colliders. The real amphora (8.6k tris, decimated to 2k) is a close-up luxury. |
| Characters, garments, armour, crowds | Period accuracy (toga, stola, lorica segmentata) and one draw call per person; the scouts' comparison found the real free bodies are a worse fit (modern-fantasy clothes, heroic proportions, 3x triangles). Rejected, not deferred. |
| Locomotion, combat animation, weapon and shield IK | Foot-IK gait in 8 directions, arm IK against real weapon contact; only the gaps get clips (swim, sit, death, hit, work, carry). |
| Anonymous honorific statues (togati, cult statues) | No open scan of a toga statue (SMK's `KAS685` is c. 250). Procedural stays the filler; scans are the named portraits. |
| `equus-traiani` | Lost in antiquity; no CC scan of an imperial equestrian bronze that fits. Procedural horse, with the Trajan bust's head later. |
| Ara Pacis processions, Arch of Titus panels, Great Trajanic Frieze | No open scan exists; the Sketchfab "Ara Pacis" models are AI-generated. Procedural relief panels with a tiled stone material. |
| Armour (lorica segmentata, helmets) | Only Augustan Haltern pieces (500k to 2M faces) and hobbyist low-poly; keep procedural, use scans as reference. |
| Bulk vegetation and the horizon | Procedural trees stay as far LOD and for scatter; real trees only near the player and at hero spots. No usable plane tree, oleander, laurel or fig model exists. |
| Terrain, water, sky, audio | Systems, not meshes. |
| Quaternius Fantasy Props and nature | Hand-painted fantasy style, barrels and medieval pots; almost nothing there is Roman. |

---

## 7. Risks

### License

| # | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| L1 | **UAL2's itch page lost its "Asset license" row on 2026-09-28**; UAL1 and UAL2 were both updated after Quaternius's new license (QAL v1.0, 2026-08-28, "you just can't resell or redistribute the assets themselves as assets"; "the version in effect at the time you obtained the Assets governs") | Medium / medium | In-zip `License.txt` (read today) says CC0 1.0. Vendor now, store the zip hash, a copy of `License.txt` and a dated snapshot of the itch page in `assets/licenses/`. Take UAL1 clips first; treat UAL2 (#15) as optional and re-check the page before shipping. **Do not pull any Quaternius pack published after 2026-08-28.** If doubt remains, author the few missing loops procedurally. |
| L2 | CC BY models reached us through the Objaverse mirror: an uploader might have posted someone else's work | Low-medium / medium | Only authors whose own description says they modelled it (confirmed for the scutum and the pine; the scouts judged the rest from descriptions). Re-check the Sketchfab license at fetch time, keep the page snapshot, and remove-on-request: every item has a procedural fallback by design. |
| L3 | The Hugging Face mirror, SMK API or itch click path changes or disappears | Medium / low | Outputs are vendored; manifest keeps the canonical `page`; `fetch.mjs` accepts manual drop-ins; sha256 pins detect silent changes. |
| L4 | SMK's rights statement is the Public Domain **Mark** (a statement, not a waiver) | Low / low | Underlying casts are of antiquity; Commons tags the scans with the template `Licensed-PD-Art` (parameters `PD-old-100-expired` and `Cc-zero`) and SMK describes the release as free for any use (I saw that only in a search summary, the SMK pages return 403). Store the API JSON and the Commons wikitext as evidence. |
| L5 | A later sale: CC BY needs credit in any reasonable manner, a note of changes, and no added legal or technical restrictions (for example store DRM terms) | Low now / medium later | `CREDITS.md` now, an in-game credits screen (`public/credits.json`, about 0.5 d of UI work) before any paid release; keep the 7 CC BY items replaceable. |
| L6 | CC BY-SA, NC, ND or AI-generated models slip in | Low / high | Allowlist plus live check in `fetch.mjs`, `aiGenerated` refusal, and `check.mjs` in CI. |

### Size and performance

| # | Risk | Mitigation |
|---|---|---|
| P1 | Triangle and draw-call growth (20k-triangle busts in a crowded forum) | LOD1 3k beyond 25 m; per-landmark scan budget about 450k triangles; `MeshBuilder.triangleCount` in the shot output; one `InstancedMesh` per distinct model and material, at most about 30 distinct models per landmark |
| P2 | Texture VRAM (1k map with mips is 5.6 MB each) | 512 by default, 1k only for the first-person kit, ORM packing; estimated 58 MB against 96; KTX2 in phase 2 |
| P3 | Load time | About 6 MB total, preloaded with a progress label; meshopt decode 0.6 to 3 ms per scan in Node, bake 4 to 9 ms; WebP decode off the main thread through `ImageBitmapLoader`. Not measured in a browser. |
| P4 | Git bloat | Outputs only; batches; `buildHash` skips |
| P5 | Safari / WebKit | WebP and meshopt WASM are supported; KTX2 untested (deferred); run `scripts/shot.mjs --browser webkit` on the first textured asset |
| P6 | Shadows | Scans cast shadows only at LOD0; alpha-tested tree shadows reuse three's depth material |

### Style and history

| # | Risk | Mitigation |
|---|---|---|
| S1 | Museum-detail scans next to chunky procedural geometry | §5: map-less plaster material, macro noise, hero spots only, style gate |
| S2 | Stylised hand-painted CC BY trees against a semi-real world | Tint to palette, desaturate, A/B at three distances; fall back to the procedural tree if it does not sit |
| S3 | Wrong size (SMK files normalised to 130 units; missing dimensions) | `heightM` and `sizeSource` per entry; lineup scene against an avatar |
| S4 | Unpainted white statues versus "statues are painted" | Phase 2 vertex paint; bronze and gilded variants for contrast |
| S5 | Anachronism and misattribution | The scouts' filter is applied; "type, not provenance" for Prima Porta (found at Livia's villa); no museum identifications in the UI; modern restorations on casts (noses, busts) accepted |
| S6 | Real scutum has one painted emblem and colour; the procedural one has per-unit colours and emblems | Real scutum only for `scutum` + `thunderbolt`; everything else stays procedural |

### Technical (all found in the code or tests)

Quantised attributes versus `applyMatrix4`; flat normals; per-triangle box UVs; stripped colour attribute and forced `vertexColors`; synchronous builders versus async loading; no `ImageBitmap` in Node tests. Mitigations are in §4.3.

---

## 8. Effort and sequencing

### 8.1 Effort

Units are agent-days (one focused agent session of roughly half to one day each); S is up to 0.5 d, M is 1 to 2 d, L is 3 or more. They assume W0 exists. Item efforts are in §2.1.

| Block | Contents | Effort |
|---|---|---|
| **W0 Foundation** | manifest and `fetch.mjs` with live license gate (1.5 d), `build.mjs` presets for scans, props, trees (2 d), `credits.mjs` and `check.mjs` (0.75 d), `src/assets/` loader, geometry, materials, `addModel`, tests, `?scene=assets` (2 d) | **about 6 d** |
| **W1 Alive** | #1 anim-ual1 (3 d), #2 pine (2 d), #3 cypress (0.5 d), #7 olive (0.75 d), #16 rocks (1.5 d) | about 8 d |
| **W2 Faces** | #4, #5, #8 to #12, #17 to #23 (6 d of items) plus the `statueFigure` and `herm` hooks (about 1 d) | about 7 d |
| **W3 Hero kit** | #6 scutum (2 d), #13 gladius (1 d), #15 anim-ual2 (1 d), #24 and #25 textured props (1 d) | about 5 d |
| **W4 Column of Trajan** | #14: orthographic height bake tool, strip, shader on the helical band | about 3.5 d |
| **Total** | | **about 30 agent-days**, of which 6 are one-time infrastructure; about 12 to 15 calendar days with three agents in parallel (W1, W2 and W3 are independent after W0) |

### 8.2 Order and gates

1. **W0 now, in parallel with core work.** It adds only new files plus a few lines in `boot.ts`. Prove it end to end on two items: one scan (`bust-trajan`) and one textured prop (`prop-oil-lamp`).
2. **Swim animation first among W1** (the `player:swim` event already exists; nothing animates it). It is a core-game gap, not polish.
3. **W2 can start with what is built today**: busts on herms, `bust-marcellus` in the Theatre of Marcellus and Porticus Octaviae, the hero statue on a Campus pedestal, Jupiter in lararia. The Forum of Trajan group (`forum-trajan`, `basilica-ulpia`, `column-trajan`, `equus-traiani`, v0.1 H) gets its scans when those builders exist; today they use the generic builder.
4. **W3** after the first-person combat polish is settled, because the grip fit and the arm IK are the risky part.
5. **W4** only with the `column-trajan` H builder.

### 8.3 Dependency the assets cannot remove

Trees and rocks need a placement step. `buildCity` is a stub and the Rome build places no trees. Either the city module lands tree and rock placement (roads, gardens, Palatine slopes, the Via Appia), or a small "spawn route vegetation" step is added to `buildRome`'s `steps`. About 2 to 3 agent-days, not counted above. Without it, W1's tree items change nothing the owner sees.

---

## 9. Not verified, and open questions

- No browser frame-time or memory measurement of instanced scans, instanced trees or the tint and macro-noise shader on loaded materials. Budgets are arithmetic and the scouts' headless renders.
- Safari / WebKit decode and rendering of WebP textures were not run.
- The KTX2 route is unspiked (no `toktx`; `ktx2-encoder` untested).
- Retargeted animation was only seen in still frames (the scouts); blends and foot sliding are unverified. The swim clip looks right only if our rig's arm and hip conventions survive the retarget, which the scouts tested for walk, sit, attack and death but not for the swim pose.
- Real sizes for about 9 SMK busts are estimates (`sizeSource: estimate`) until eyeballed against an avatar.
- CC BY authors' provenance was judged from their descriptions and Sketchfab metadata, not from independent checks.
- Why UAL2's license row disappeared on 2026-09-28 is unknown.
- Poly Haven rock polycounts and decimated sizes were not measured (only the raw 1k totals).
- Question for the project owner of the avatar module: does `AvatarView` get a `setSwimming` method, or does swim go through an `IdleLoop`-style state? Either works with the clip library; the hook in `wiring.ts` follows that choice.

---

## Appendix A: seed manifest rows

Hashes are the real sha256 of the raw files downloaded on 2026-10-04 into `.claude/asset-staging/` (blank where nothing is staged). SMK sources resolve through the API by `objectNumber`. Heights: `record` = from the museum record, `bbox` = measured on the file, `estimate` = to be eyeballed.

| id | Source type and key | Raw bytes | sha256 (raw) | Process hints |
|---|---|---|---|---|
| `anim-ual1` | itch `quaternius/universal-animation-library`, `UAL1_Standard.glb` | | `69591853d817488edaa8fd9bf8fc1d821eaeaf789f8627b3cd23b41c4ed67997` (extracted GLB) | 65-joint T-pose rig; clip list in §2.1 |
| `anim-ual2` | itch `quaternius/universal-animation-library-2`, `UAL2_Standard.glb` | | `8cee20ab1bc55130092447e810e26df22dd2803eccc54f52137a7d54d7ab88a8` (extracted GLB) | same skeleton |
| `tree-stone-pine` | objaverse `b263487bab864018a92b609882ce7989`, shard `000-126` | 8,027,480 | `9776a0d595406dc9eee23a11210086403ebb3229cb74ee979dea3a59ea52acec` | drop ground patch; lods 0.15 and 0.04; 512 WebP |
| `tree-cypress` | objaverse `bdb2ae463ed644f0be9d51371ddf63c5`, shard `000-134` | 1,068,796 | `6e9e592f388a36a7d6007f8efb5ae2b6dfdbc36509abf632595b9d18b34d3717` | no decimation; 512 WebP |
| `tree-olive` | objaverse `6328df8a0f214143a880a72b86db2ab4`, shard `000-136` | 6,206,208 | `5fddfc241ba9384cf82a7ff68925b274e8883cfbd29e779633c16c222f9cb1a5` | ratio 0.08 to 0.12; fallback "Olive Tree Portugal" `e0b57e42...` (CeDRI, 22.8 MB raw) |
| `kit-scutum` | objaverse `d67564c8980b4e84acde74144da941ea`, shard `000-071` | 4,394,088 | `df8791f7ac7c59c64600578772f34cb82e6089cdd0497404dcd7fb628965f06a` | height 1.06 m (shield half height 0.53); grip fit |
| `kit-gladius` | objaverse `7261d334924f4a9b835ef4b15c1e16d0`, shard `000-039` | 1,987,408 | `8bdf53b1988289b919fb06457a6668e6e8941f86fc2ceea52e32a21a4d88c800` | ratio 0.5; blade length from `weapons.ts` |
| `prop-marble-table` | objaverse `ae18ba9db0f34eab9b8af5250540b994`, shard `000-141` | 3,394,668 | `d0bf85ffc7e9e38f19af9aa4df9618b26038dc988d774ccd29a1581e0f09b1e7` | keep 3k tris; 512 for the world, 1024 optional |
| `prop-oil-lamp` | objaverse `2c86ea5fb88543529816df44cfccc3ac`, shard `000-127` | 2,342,712 | `f9aaf8b106e888c192563b030e6acc561a8dead30c74efea06c2929d9a283e98` | about 11.5 cm long; 512 |
| `bust-trajan` | commons `https://upload.wikimedia.org/wikipedia/commons/e/e5/MSR-Trajan-Ra_117.stl` | 14,574,484 | `d7eddf36ab29e32dbbf338e2803d29dd6e8cdc310761e8a9956621baf3876c8e` | Y-up, mm; heightM 0.572 (bbox 349 x 572 x 263) |
| `bust-augustus-oak` | commons `https://upload.wikimedia.org/wikipedia/commons/1/1e/MSR-Auguste-Ra57.stl` | 23,847,284 | `ae7cf113e071b6735b01f938bf15877f972cab08865ab2d3e4536ea297c85a8a` | Y-up, mm; heightM 0.499 (record 51 cm) |
| `statuette-jupiter` | commons `https://upload.wikimedia.org/wikipedia/commons/3/35/MSR-Jupiter-2014-1-1.stl` | 5,001,184 | `0ba4376f8496794d37ec9ad89beac215b2a9f7d5b781f748b8d6bee6af107f93` | Y-up, mm; heightM 0.168 (record) |
| `statue-prima-porta` | smk `KAS65` small | 20,003,384 | `ec121e4fba4ee02e16868fe7a1e0a96c7226ad17cf0ff1fcb8bf7bee90f1a70b` | Z-up, **real mm**; heightM 2.19 (record); hero lod0 40k |
| `bust-matidia` | smk `KAS740` small | 20,005,084 | `96cec6747904d4015b4bdd5a07a4f4f20e508d26158bc5670320cd5ea6f8896c` | Z-up, normalised 130; heightM 0.62 (estimate) |
| `bust-flavian-matron` | smk `KAS843` small | 20,000,684 | `62aa5801f43567845d1aad30a8c04c50ce5e4b0c0efd77c81aace29b92dab2ce` | Z-up, normalised; estimate |
| `bust-trajanic-man` | smk `KAS200` **full only** (small is 404) | 100,001,484 | `db37815574f72d9853673dd7d244e91f4ee917bd2813e82640c807f36e324d1e` | 2M tris; Node heap 8 GB; estimate |
| `head-dacian` | smk `KAS598` small | 20,000,284 | `70556e2c4ba10dc0f56da609f6d8de4527c1652981dadc2716c3eadae5d5dbf1` | normalised; estimate |
| `bust-claudius` | smk `KAS722` small | 19,999,884 | `85300308fb0366e1b1ac375a5494d5d39bf81557e4427834a8fece0bc4f8b64f` | normalised; estimate |
| `bust-julia-titi` | smk `KAS1238` small | 20,002,184 | `4fca6b6d531a04a1072f7b628ddcff0f59426be91656b49aafe44c8ac65e6694` | normalised; heightM 0.62 (record) |
| `bust-drusus` | smk `KAS431` small | 19,999,884 | `3d2a97690a33ea3492bf2dda9010fb6c2485a005edfc4007b0c82d03a4f3b037` | normalised; estimate |
| `bust-marcellus` | smk `KAS809` small | 19,999,884 | `c80efe30fb7576e0e0ff98d82fb8546e71a47bcaf256218f39ffe4c9a456d7ae` | normalised; estimate |
| `statue-heroic-nude` | smk `KAS644` small | 20,001,084 | `046b295d024cbeff2edc1eef96c0d2435e378b452f43ec58a1fefa8ed34365cd` | Z-up; heightM 1.92 (record) |
| `relief-funerary-aiedius` | smk `DEP457` small | 19,999,884 | `2e107ad599be0deeaf23ddc867202c32425c142718be4d8d3d87fae545486487` | relief, front +z (file 125 x 80 x 29 units); record 64 x 98 cm |
| `relief-column-trajan` (4 files) | smk `KAS81/9`, `KAS81/10`, `KAS81/11`, `KAS81/13` small | 20,000,284; 20,002,184; 20,001,384; 20,001,684 | `bd6db8a2f8f3fe5cd97961ac12b66cc5b8a2f136304d54540de7c35117a17823`; `2daad76ddb63f852d6fbc9d17fb062f6e25a24fd7ac1117d4e0e3b4f441fea2b`; `0f23d4b2efdab209501bd189441d1768f794b4a914b6ed3d8ffd02e567f19650`; `9c1fe12355f6ad0cc5edc3a05a43b53643bb3ea6d0b82a41ff5cd4d6096ba305` | record h x w (cm): 78 x 34, 85 x 52, 84 x 94, 135 x 85; `/13` lies flat with depth on Z; bake, do not ship as meshes |
| `rocks-polyhaven` | polyhaven `rock_07`, `rock_09`, `boulder_01` (1k glTF + includes) | 2.2, 2.0, 5.8 MB | not staged | simplify to at most 2k tris; 512 WebP; retint |

## Appendix B: bake function used for the loader test

The scratch test (`loadtest.mjs`, `bake.mjs`, `axis.mjs`, `smk.py`, `sf.py`) lived in the session scratchpad and is not part of the repo. The facts they produced are in §1 and §4.3. The bake function in §4.3 is the one that was run; the first call costs 90 to 170 ms (JIT), steady state is 4 to 9 ms for a 30k-triangle mesh with the straightforward Vector3 version and under 1 ms with the hoisted-matrix loop shown in §4.3.

## Appendix C: sources consulted for this plan

The two scout reports and `assets.md`; `GDD.md` §12.1, §16.1, §17.0; `ARCHITECTURE.md`; `docs/modules/avatar.md`; source files `src/gfx/MeshBuilder.ts`, `src/gfx/uv.ts`, `src/gfx/materials.ts`, `src/gfx/materialIds.ts`, `src/gfx/textures/{catalog,shaderPatch}.ts`, `src/arch/props/{props,PropScatter}.ts`, `src/arch/classical/statues.ts`, `src/arch/vegetation/{species,Forest,materials,system}.ts`, `src/actors/equipment/*`, `src/world/landmarks/*`, `src/world/WorldRegistry.ts`, `src/world/rome/buildRome.ts`, `src/world/city/index.ts`, `src/world/water/swim.ts`, `src/game/boot.ts`; live queries to the SMK Open API, Wikimedia Commons raw wikitext, the Sketchfab API v3, the Hugging Face Objaverse mirror, the Poly Haven API, the itch.io pages of Quaternius's UAL1, UAL2 and Fantasy Props MegaKit; three.js r186 and `@gltf-transform/cli` 4.5.1.
