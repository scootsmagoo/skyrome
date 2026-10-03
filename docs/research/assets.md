# Skyrome: third-party asset sourcing (CC0 / permissive)

Research date: 2026-10-03. Every download URL below was checked with `curl -sIL` (HEAD, following redirects) on that date. All returned **HTTP 200** unless a note says otherwise. Sizes are the `content-length` the server reported. Poly Haven and ambientCG metadata came from their public APIs. I judged the candidate textures by eye from contact sheets built in scratch space. Nothing was downloaded into the repo.

**Why this matters.** Skyrome ships from a **public GitHub repo** to GitHub Pages, so anyone can download every file we commit. A file can go in only if its license allows **redistribution of the file itself**.

| Allowed | Conditions |
|---|---|
| **CC0 / Public Domain** (preferred) | None. Credit anyway as a courtesy and for provenance. |
| **CC-BY 3.0/4.0** | Give an attribution line in `CREDITS.md` (Title, Author, Source, License). |
| **SIL OFL 1.1** (fonts) | Ship `OFL.txt` next to the font. Don't sell the font by itself. Renaming rules apply if the font is modified (see §5). |
| **MIT / Apache-2.0** (code-adjacent files, e.g. three.js example textures) | Keep the license notice. |

| Not allowed / avoid | Why |
|---|---|
| Mixamo raw FBX | Adobe terms forbid redistributing the raw character/animation files. |
| **Sonniss GDC Game Audio Bundles** | The license allows use "as part of your finished game" but forbids distributing sounds "as standalone files". A public repo hands out the raw files. The license also bans AI/ML training ([sonniss.com/gameaudiogdc](https://sonniss.com/gameaudiogdc)). **Do not use.** |
| Fab / Quixel Megascans, Unreal/Unity store packs, itch.io "free for your games, no redistribution" packs | The terms forbid redistributing the raw assets. |
| CC-BY-NC, CC-BY-ND | Non-commercial or no-derivatives terms don't fit a public, remixable repo. |
| CC-BY-SA | Legal, but share-alike would spread to our derived assets. Avoid unless the owner signs off. |
| Sketchfab "Standard"/"Editorial" licenses, MyMiniFactory/Scan-the-World items without a CC0/CC-BY tag | Restricted, or the license is unclear. |
| CMU mocap data (incl. Mesh2Motion's `human-mocap-animations.glb`) | CMU's FAQ forbids reselling the data "even in converted form". That's ambiguous for a public repo, so skip it. |

**Workflow rules (for whoever writes the fetch script):**
1. Download raw files into a git-ignored cache (e.g. `.asset-cache/`) or scratch space. Never commit raw zips.
2. Commit only optimized derivatives (re-encoded textures, trimmed audio, compressed glTF) under `public/assets/...`.
3. Record every shipped file in a manifest with: source URL, author, license, original asset ID, and the processing applied. Also add a line to `CREDITS.md` (block at the end of this doc).
4. Poly Haven's API terms ask for a "Powered by Poly Haven" credit only when an app calls the **live API**. We only use the API at dev time to find URLs and then vendor the files. Credit Poly Haven anyway.

---

## 1. PBR textures

### 1.1 Sources and URL patterns

**Poly Haven** (CC0, [polyhaven.com/license](https://polyhaven.com/license)).
- List assets: `https://api.polyhaven.com/assets?t=textures` (864 textures). File list per asset: `https://api.polyhaven.com/files/<id>`.
- 1k JPG maps follow a fixed pattern (verified for every ID in this doc):
  ```
  https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/<id>/<id>_diff_1k.jpg     # base color (sRGB)
  https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/<id>/<id>_nor_gl_1k.jpg   # OpenGL normal (three.js convention)
  https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/<id>/<id>_arm_1k.jpg      # R=AO, G=Roughness, B=Metalness
  https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/<id>/<id>_rough_1k.jpg    # standalone roughness (optional)
  ```
- **The ARM map is the efficient choice for three.js.** Assign one ARM texture to `aoMap`, `roughnessMap` and `metalnessMap`. three samples AO from R, roughness from G and metalness from B. Since r151, three.js can read `aoMap` from UV channel 0 via `Texture.channel`, so no `uv2` is needed (verify against the pinned three version).
- Color spaces: `diff` → `SRGBColorSpace`. `nor_gl` and `arm` → `NoColorSpace` (linear).

**ambientCG** (CC0, [docs.ambientcg.com/license](https://docs.ambientcg.com/license/): "You can include the raw files in your project, for example a video game… You don't need to give credit.")
- List assets: `https://ambientcg.com/api/v2/full_json?type=Material&limit=2000&include=downloadData,tagData`
- Download: `https://ambientcg.com/get?file=<ID>_1K-JPG.zip`. It answers with a **302** redirect to `acg-download.struffelproductions.com/...`, so use `curl -L`.
- Example zip contents (Marble019, 4.08 MB): `_Color.jpg` 768 KB, `_NormalGL.jpg` 340 KB, `_Roughness.jpg` 559 KB, `_Displacement.jpg`, `_NormalDX.jpg`, `.blend`, `.mtlx`, `.usdc`, preview png. **Extract only Color, NormalGL and Roughness.** ambientCG has no ARM map; pack one ourselves, or use roughness-only.
- Flat color previews for eyeballing: `https://f003.backblazeb2.com/file/ambientCG-Web/media/surface-preview/<ID>/<ID>_SQ_Color.jpg`

**Shipped size.** Raw Poly Haven 1k sets are about 1.5–3.7 MB per material (diff + nor_gl + arm). I re-encoded `medieval_red_brick` as a test:
- JPEG q80: 194 KB diff + 283 KB normal + 126 KB ARM = **≈0.6 MB per material**
- WebP q80: ≈0.5 MB
- 512² JPEG: ≈0.16 MB

Plan on **about 0.6 MB per 1k material** after re-encoding, or switch to KTX2/Basis later (§8).

**Texture scale vs. `WORLD_SCALE`.** Bricks, paving stones and tiles are human-scale details, so they stay 1:1. Compute UV repeat from each texture's **physical size** (the "Real size" column below, from Poly Haven metadata) in *rendered* meters. A wall on a 0.6-scaled temple then still shows life-size bricks.

### 1.2 Picks by need

Sizes are raw 1k JPG: diff / nor_gl / arm, in KB. ★ = in the first-playable shortlist (§7).

| Need | Primary | Real size | Raw 1k (KB) | Alternates | Notes |
|---|---|---|---|---|---|
| **Basalt polygonal paving** (*selce*, via silice strata) | ★ PH `grey_stone_path` | 1.8 m | 820/893/763 | PH `slab_tiles` (black polygonal stones, orange joints; 481/498/727). aCG `PavingStones055` (tagged "roman", blue-grey polygons with sandy joints; zip 9.3 MB). PH `volcanic_rock_tiles` (smaller, darker) | `grey_stone_path` reads as Roman basalt road out of the box. Darken and desaturate slightly. Add cart ruts procedurally. |
| **Travertine** (ashlar: Colosseum, Theatre of Marcellus, temple podia) | ★ PH `sandstone_blocks_08` | 3.0 m | 237/163/57 | PH `white_sandstone_blocks_02` (2.3 MB set). aCG `Travertine009` (polished cream slab, zip 3.3 MB), good for **interior veneer/floors only** | No CC0 "weathered pitted travertine ashlar" exists in either library. aCG's Travertine001–014 are all polished, vein-cut slabs. Use `sandstone_blocks_08` (large smooth cream blocks, tiny file) tinted warm cream, plus a procedural pore/pitting detail normal. |
| **White marble** (Luna/Carrara; Trajan's Forum, temples) | ★ aCG `Marble019` | n/a | zip 4.08 MB | aCG `Marble012` (white with grey veins, zip 4.7 MB). aCG `Marble025` (plain white). PH `marble_01` (cream tiles, 1.5 m, very small 298/108/53) | Raise roughness for weathered exterior marble. Keep it low for polished interior. |
| **Veined coloured marbles** (*marmora*) | ★ aCG `Marble026` (≈ giallo antico) | n/a | zip 5.2 MB | aCG `Onyx010` (red/violet banding, ≈ pavonazzetto-ish), `Travertine011` (green banding, ≈ cipollino), `Marble009` (dark green, ≈ verde antico / serpentine), `Marble008` (brown-red brecciated, ≈ africano), `Marble022` (≈ rosso) | These are procedural "approximations" of the real stones. Labels are my visual matches, not petrographic identifications. **No CC0 porphyry found**: tint a granite/terrazzo, or generate speckle procedurally. |
| **Roman brick** (*opus testaceum*) | ★ PH `medieval_red_brick` | 2.0 m | 852/1159/724 | PH `brick_wall_12` (long thin **yellow** bricks; Trajanic brick is often yellow to red). PH `broken_brick_wall` (weathered red). aCG `Bricks094` (thin red, zip 5.1 MB) | Real opus testaceum has thin bricks (roughly 3.5–4.5 cm) and **thick** mortar beds, often nearly as thick as the brick. None of these textures matches that ratio. *Approximate figures; check against J.-P. Adam, *Roman Building*.* **Best long-term:** a procedural brick shader. Use these textures for color/noise. |
| **Opus reticulatum / tufa** | **Procedural** (diagonal net of square tuff *cubilia*, roughly 8–10 cm faces, thin joints; dimensions approximate) | n/a | n/a | PH `stone_tiles_03` (square-ish setts with grid joints, 1.9 m) **rotated 45°** and tinted grey-brown | Neither library has a reticulate texture. |
| **Tufa blocks** (Servian wall, *cappellaccio* / *Grotta Oscura*; peperino firewalls) | ★ PH `large_sandstone_blocks_01` | 3.0 m | 597/928/191 | PH `medieval_blocks_03` (grey-brown ashlar; good for **peperino/sperone**, e.g. the Forum of Augustus firewall). PH `stone_block_wall` (dark) | `large_sandstone_blocks_01` is porous, yellow-grey, rough-cut. A very plausible tuff. |
| **Weathered plaster, tintable** (insulae, *tectorium*) | ★ PH `plastered_wall_04` | 3.2 m | 292/417/208 | ★ PH `damaged_plaster` (white plaster flaking off **red brick**, ideal for insula ground floors; 831/937/562). PH `red_plaster_weathered` (Pompeian-red-ish). aCG `Plaster001` / `PaintedPlaster017` (white) | `plastered_wall_04` is near-neutral grey, so multiply in any ochre, red or white. |
| **Terracotta roof tiles** | ★ PH `clay_roof_tiles_02` | 2.5 m | 883/967/551 | PH `clay_roof_tiles` (4.0 m). PH `roof_tiles` (ribbed). aCG RoofingTiles011–014 (rely on displacement/opacity, weak as flat textures) | Roman roofs used flat **tegulae** with **imbrices** over the joints. These are Mediterranean canal tiles, fine at a distance. For near views, build tegula/imbrex geometry procedurally with a plain terracotta material. |
| **Cobblestones / gravel** | PH `gravel_floor_02` | 2.0 m | 1211/1509/1077 | PH `gravel_floor`. aCG `Gravel022`. PH `cobblestone_floor_08` (572/979/194) | **Anachronism:** Rome's *sampietrini* cobbles are early-modern (16th c.+). Ancient secondary streets were beaten earth or gravel (*glarea*). Use cobbles only for non-Roman or utility contexts. |
| **Packed dirt path** | ★ PH `dirt_floor` | 2.1 m | 882/1140/637 | PH `brown_mud_dry`. aCG `Ground102` ("compressed dirt, stamped", zip 8.4 MB) | n/a |
| **Grass / meadow** | ★ PH `grass_ground` | 2.5 m | 856/1280/875 | PH `leafy_grass`, `sparse_grass`. aCG `Grass004` (very green lawn, zip 11 MB) | Mediterranean spring: mixed green/brown. Add instanced grass blades procedurally. |
| **Dry grass** (summer) | ★ PH `withered_grass` | 2.0 m | 1112/1438/1084 | aCG `Ground105` | Blend it with `grass_ground` as summer advances. |
| **Wood planks** | ★ PH `weathered_planks` | 2.0 m | 586/666/516 | PH `wood_planks` (warm brown, 1.5 m), `old_planks_02` | n/a |
| **Rough timber** (beams, scaffolding) | PH `rough_wood` | 0.5 m | 554/772/135 | PH `bark_brown_01` (logs) | n/a |
| **Bronze / metal** | ★ aCG `Metal008` (bronze/copper, smooth) | n/a | zip 5.2 MB | aCG `Metal017` / `Metal013` (eroded bronze). `Metal058C` (copper verdigris) | Neither library has a clean bronze. Use `MeshStandardMaterial` (metalness 1, bronze base color ≈ `#b08d57`, roughness 0.3–0.45) and borrow roughness/normal from Metal008. In 113, public bronzes were kept polished, many gilded. Verdigris is for neglected or buried items only. |
| **Rock / cliff** (tuff cliffs of the Capitoline, quarries) | ★ PH `cliff_side` | 1.8 m | 840/984/538 | PH `rock_face` (brown). aCG `Rock055` (yellow layered) | `cliff_side` is layered yellow-orange rock that reads as tuff. |
| **Riverbank mud / sand** (Tiber) | ★ PH `brown_mud` | 1.3 m | 490/988/219 | aCG `Ground083` (wet beige river mud, zip 9.3 MB). PH `damp_sand` | n/a |
| **Water normal map** | **Procedural** (bake a tiling normal from summed noise/Gerstner waves at build time, or do it in-shader) | n/a | n/a | three.js `examples/textures/waternormals.jpg` (243 KB; added 2014 from jbouny's MIT ocean demo). `examples/textures/water/Water_1_M_Normal.jpg` (397 KB) | three.js is MIT, but the **original provenance of these JPGs isn't documented**. Prefer generating our own. |
| **Fabric / linen** (optional) | aCG `Fabric032` (white cloth, tintable) | n/a | zip 8.9 MB | PH `rough_linen` (dyed blue, 0.27 m; desaturate first) | Togas, tunics, awnings (*vela*). |
| **Floors** (bonus) | PH `terracotta_floor_tiles` | 2.1 m | 634/579/697 | aCG `Terrazzo008` (beige/orange chips, a stand-in for *opus signinum*) | n/a |

**Poly Haven authors** (for credits): Rob Tuytel (sandstone_blocks_08, marble_01, medieval_red_brick, large_sandstone_blocks_01, medieval_blocks_03, plastered_wall_04, cobblestone_floor_08, brown_mud(_dry), rough_wood, bark_brown_01). Amal Kumar (grey_stone_path, damaged_plaster, broken_brick_wall, red_plaster_weathered, clay_roof_tiles(_02), sparse_grass, wood_planks). Charlotte Baglioni (grass_ground, leafy_grass, withered_grass). Dario Barresi & Dimitrios Savva (weathered_planks, slab_tiles). Dimitrios Savva (brick_wall_12, terracotta_floor_tiles). eye-candy.xyz (dirt_floor, stone_tiles_03, damp_sand). James Ray Cock, Jenelle van Heerden & Dario Barresi (cliff_side). Greg Zaal & Dario Barresi (rock_face). Jenelle van Heerden & Dimitrios Savva (gravel_floor_02).

---

## 2. Sky

**Recommendation: no HDRI needed for the first playable.** Use three's procedural sky addon `three/examples/jsm/objects/Sky.js` (Preetham model, MIT, ships with the `three` package). Drive it from the game clock:
- **Day / sunset:** move the sun elevation/azimuth with the time of day and match the `DirectionalLight` to it. Every few minutes of game time (or when the sun moves more than about 2°), render the sky into a `PMREMGenerator` to get image-based lighting.
- **Night:** Sky.js has no stars. Add a procedural starfield (`Points` on a large sphere) and a moon sprite or disc.

Spring–summer 113 skies over Rome: mostly clear, some cumulus. Clouds can be a cheap noise layer later.

Optional CC0 HDRIs from Poly Haven. Use the `*_puresky` variants: sky only, no ground or buildings.

| Use | ID | Authors | 1k .hdr | 2k .hdr |
|---|---|---|---|---|
| Clear day (alpine Italy, clear midday) | `pizzo_pernice_puresky` | Andreas Mischok, Jarod Guest | 1.11 MB | 4.3 MB |
| Clear noon | `qwantani_noon_puresky` | Greg Zaal, Jarod Guest | 1.04 MB | 4.0 MB |
| Partly cloudy | `kloofendal_48d_partly_cloudy_puresky` | Greg Zaal, Jarod Guest | 1.37 MB | 5.2 MB |
| Sunset | `qwantani_sunset_puresky` | Greg Zaal, Jarod Guest | 1.01 MB | 4.0 MB |
| Dusk | `qwantani_dusk_2_puresky` | Greg Zaal, Jarod Guest | 1.11 MB | 4.4 MB |
| Night, clear | `qwantani_night_puresky` | Greg Zaal, Jarod Guest | 1.32 MB | 5.2 MB |
| Night, clear (alt) | `kloppenheim_02_puresky` | Greg Zaal, Jarod Guest | 1.33 MB | 5.3 MB |
| Moonrise | `qwantani_moonrise_puresky` | Greg Zaal, Jarod Guest | 1.21 MB | 4.7 MB |

URL pattern (all verified): `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/<id>_1k.hdr` (`2k` likewise). Load with three's `HDRLoader`/`RGBELoader` and convert with PMREM. A 1k HDRI is fine for lighting but looks blurry as a visible backdrop. Use 2k or larger if one is shown as the sky.

---

## 3. Characters and models

### 3.1 Recommended: Quaternius-derived CC0 rig and animations via Mesh2Motion (curl-able)

**[Mesh2Motion](https://github.com/Mesh2Motion/mesh2motion-app)** is an open-source web auto-rigger (code MIT). Per its README and `LICENSE-CC0.MD`, all of its **3D models, rigs and animations are CC0**. Its repo ships ready-to-use GLBs on **one shared 66-joint skeleton** (Unreal-mannequin bone names). It bundles Quaternius's *Universal Animation Library* 1 + 2 "Standard" clips plus its own clips, and Quaternius base bodies.

Everything shares the skeleton, so one `THREE.AnimationMixer` can play any clip on any of these bodies. No retargeting needed.

Pinned commit (2026-09-28): `79f3f61a9852ef70234a5a4a7c13ed87f7a71833`. Base URL: `https://raw.githubusercontent.com/Mesh2Motion/mesh2motion-app/79f3f61a9852ef70234a5a4a7c13ed87f7a71833/`

| File | Size | Contents | License / origin |
|---|---|---|---|
| `static/models-variation/human/male.glb` | 534 KB | Faceless mannequin body, 13,757 tris, 1 material, 66 joints. Height ≈1.83 m (tall for a Roman; scale to about 0.92) | CC0, Quaternius (per `src/lib/RigModelVariations.ts`) |
| `static/models-variation/human/female.glb` | 1.36 MB | Female mannequin, 14,244 tris, same skeleton | CC0, Quaternius |
| `static/animations/human-base-animations.glb` | 5.66 MB | **87 clips** + mannequin mesh (details below) | CC0, Quaternius UAL1 + UAL2 Standard |
| `static/animations/human-addon-animations.glb` | 5.29 MB | **75 clips**, incl. `Death_A/B/C`, `Defend`, `Fighting Idle`, `Dodge_back/left/right` (+`_RM`), `Strafe_left/right`, `Walk_Backwards`, `Idle Hurt`, `Idle_Subtle`, `Idle Listening`, `Greeting`, `Head Nod`, `Kneeling Tired`, `Sleeping`, `Bow`, `Bow Pull Back/Hold/Release`, `Climb Ladder`, `Crawl`, `Throw Object`, `Victory`, `Walk_Female`, `Run_Female`, `Walk_Stealth`, `Run_Stealth`. Skip the silly ones (`Run_Anime`, `Levitate`, `Power Up`, `Flying…`) | CC0, Mesh2Motion |
| `static/animations/horse-animations.glb` | 1.09 MB | Horse mesh (3,414 tris, its own 56-joint rig) + 14 clips: `Idle, Walk, Trot, Run, Eating, Rear, Kick, Head_But, Death, Sleep, lay_to_idle, Turn_Left, Turn_Right, Rest_Pose` | CC0, Mesh2Motion. Useful later for horses, mules, cavalry |
| `static/models-variation/human/{male,female}_N.glb`, `police_*`, etc. | 330–450 KB each | ~900–1,300-tri photo-textured low-poly people on the **same skeleton** | CC0, "elbolilloduro". **Modern clothes.** Use only as placeholders and tests |
| `static/models-variation/human/sophia.glb`, `jay.glb`, `sintel.glb`, `bunny.glb` | n/a | n/a | **CC-BY-SA / CC-BY (Blender Studio). Don't use.** |
| `static/animations/human-mocap-animations.glb` | 2.0 MB | 16 CMU mocap clips | **Avoid** (CMU terms, see top) |

**Skeleton bones** (fingers omitted): `root, pelvis, spine_01, spine_02, spine_03, neck_01, head, head_leaf, clavicle_l/r, upperarm_l/r, lowerarm_l/r, hand_l/r, thigh_l/r, calf_l/r, foot_l/r, ball_l/r, ball_leaf_l/r`. Attach the gladius to `hand_r`, the scutum to `lowerarm_l`/`hand_l`, the helmet to `head`.

**The 87 base clips** (`*_RM` = root-motion version), mapped to our needs:

| Need | Clips |
|---|---|
| idle | `Idle_A`, `Idle_Sword`, `Idle_Shield`, `Idle_FoldArms`, `Idle_Torch`, `Idle_Lantern`, `Idle_Rail`, `Idle_ShakeOff` |
| walk / run / sprint | `Walk`, `Walk_Formal`, `Walk_Carry`, `Jog`, `Sprint`, `Crouch_Walk`, `Crouch_Idle` |
| jump | `Jump_Start`, `Jump_air`, `Jump_Land` (+ `NinjaJump_*`, `ClimbUp_1m_RM`) |
| sword attacks | `Sword_Regular_A`, `Sword_Regular_B`, `Sword_Regular_C` (+`_C_RM`), each with `_Rec` recoveries. `Sword_Regular_Combo`, `Sword_Attack` (+`_RM`), `Sword_Dash_RM`, `Melee_Hook` (+`_Rec`), `Punch_Jab`, `Punch_Cross` |
| block / shield | `Sword_Block`, `Idle_Shield`, `Idle_Shield_Break`, `Shield_OneShot` (shield bash), `Shield_Dash_RM` (+ addon `Defend`) |
| hit reactions | `Hit_Chest`, `Hit_Head`, `Hit_Knockback` (+`_RM`) |
| death | `Death_D` (+ addon `Death_A/B/C`), `LayToIdle` (get up) |
| sit | `Sitting_Enter`, `Sitting_Idle`, `Sitting_Talking`, `Sitting_Exit` |
| talk / social | `Idle_Talking`, `Yes`, `Dance_Simple` (+ addon `Greeting`, `Head Nod`, `Angry`, `Reject`) |
| misc | `OverhandThrow` (pilum!), `Interact`, `PickUp_Table`, `Chest_Open`, `Consume`, `Push`, `Roll` (+`_RM`), `Slide*`, `Swim_Fwd`, `Swim_Idle`, `Chop_Tree`, `Farm_Harvest`, `Farm_PlantSeed`, `Farm_Watering`, `Fixing_Kneeling`, `Driving` (≈ cart/chariot reins). Skip `Pistol_*`, `Spell_*`, `Zombie_*`, `Idle_TalkingPhone`, `Idle_Rail_Call` |

**Size test** with `npx @gltf-transform/cli@4`: `resample` took the base library from 5.66 MB to 4.96 MB, and `meshopt` took it to 3.82 MB. Keeping only about 25 clips should land around **1.5–2 MB**. Strip the embedded mannequin from the animation file and load bodies separately.

**Clothing.** No CC0 Roman tunic/toga/lorica exists for this rig. Options:
- Generate garments procedurally: skinned tube/skirt meshes weighted to `pelvis`/`spine_*`/`thigh_*`, plus tinted Fabric032.
- Adapt Quaternius *Modular Character Outfits – Fantasy* (below). Its "Peasant" outfit is close to a tunic.

### 3.2 Upstream Quaternius packs (all CC0, but browser-only downloads)

These come from [quaternius.com](https://quaternius.com) and Quaternius on itch.io. The site's "Download" button goes through itch.io. Free itch downloads need a browser click-through (or a "name your own price: $0" step), so **they can't be fetched with plain curl**. Older packs link **Google Drive folders**, which need a browser or `gdown` (unreliable on folders). Paid tiers are still **CC0**, so if the owner buys them, we may commit the derived files publicly.

| Pack | Free ("Standard") | Paid | Formats | Notes |
|---|---|---|---|---|
| [Universal Animation Library](https://quaternius.itch.io/universal-animation-library) (2025) | 45 clips, 15 MB zip | Pro $9.99+ = 120+ clips (41 MB). Source $14.99+ = .blend + rig | FBX, GLB, .blend | The extra Pro clips include **8-direction locomotion**, more deaths/emotes, crawl, etc. **Probably worth buying later** for strafing in third person. A GitHub mirror of the free tier, [J-Ponzo/gltf-universal-animation-library](https://github.com/J-Ponzo/gltf-universal-animation-library) (CC0), uses Godot/Rigify bone names (`DEF-*`, 53 joints, 46 clips). **Different names from Mesh2Motion's**, so prefer Mesh2Motion |
| [Universal Animation Library 2](https://quaternius.itch.io/universal-animation-library-2) | 42 clips, 17 MB zip | Source $14.99+ (110+ clips) | FBX, GLB, .blend | 3- and 4-hit melee combos, shield idles, parkour, farming |
| [Universal Base Characters](https://quaternius.itch.io/universal-base-characters) | 2 bodies + 5 hairstyles, 122 MB zip | Source $19.99+ = 6 bodies (Superhero/Regular/Teen × M/F), 20 hairstyles | glTF, FBX, OBJ, .blend | About 13k tris each. "Compatible with the Universal Animation Library". Real faces and hair, a step up from the mannequins |
| [Modular Character Outfits – Fantasy](https://quaternius.itch.io/modular-character-outfits-fantasy) | Ranger + Peasant outfits, 280 MB zip | $20+ = 12 outfits / 62 parts (peasant, knight, ranger, noble, wizard) | glTF, .blend | Built for UBC heads + UAL rig. Peasant/noble ≈ tunic. Knight armor is medieval (wrong period) |
| Ultimate Animated Character Pack (2019), Ultimate Modular Men/Women, Knight Character, Medieval Weapons, Ultimate Modular Ruins (2021, 90 models) | Free via **Google Drive** | n/a | FBX/OBJ/.blend (some glTF) | Older, low-poly flat-colour style, separate rigs. **Not recommended** for main characters. Ruins/props are a style mismatch |

**Kenney** characters (CC0, curl-able zips) are toy-like (mini/blocky). Skip them for this project.

### 3.3 Roman-specific CC0 museum scans (Sketchfab)

All of these were confirmed **CC0** through the Sketchfab API (`license.slug == "cc0"`). **Sketchfab downloads need a logged-in account** (API token / OAuth). They are **not anonymous-curl-able**: the owner or a human must download them, or an agent with a token. Raw scans are heavy. Each needs `gltf-transform simplify` + weld + resizing textures to ≤1k (target ≤1–2 MB).

| Object | Museum (Sketchfab user) | UID | Faces | GLB | Why it matters |
|---|---|---|---|---|---|
| **Bust of Trajan**, marble, dated **108–113** (Villa of Chiragan) | Musée Saint-Raymond, Toulouse (`museesaintraymond`) | `e7e240f95b4348e0af42289a67b23633` | 146k | 13.2 MB | Contemporary portrait of our emperor: statues, busts, coins |
| **Sestertius of Trajan** (minted at Rome 103–111) | Musée Saint-Raymond | `ba652714bc514e3888f94a606985f79e` | 400 (relief in 4k textures) | 35 MB | Coin icon, inventory art (render to 2D) |
| Bust of Augustus crowned with oak (19–18 BC) | Musée Saint-Raymond | `6ccc01ad1cda47f3b2511ef6fbf07e0b` | 238k | 21 MB | **Use this UID.** The other Augustus upload, `60235874…`, is **CC-BY** |
| Armoured bust of Marcus Aurelius (170–180) | Musée Saint-Raymond | `a7e0a77f81f74c80b15ba64164e14c03` | 245k | n/a | **Anachronistic portrait** (later emperor). Only useful as a generic cuirass-bust shape |
| Jupiter (bronze statuette), Mercury (bronze statuette), Bacchus, Venus head, Discobolus (2nd-c. copy), Hercules relief | Musée Saint-Raymond | `26ad23dca17b42a6bce2bf6cae880c55`, `32103b33b94d499e8d1bdf1541d4ec13`, `aa8748acb2594a37a372fe78dc41235d`, `dd50296725c54dc6a7dc68f2b9acc9d0`, `43729173adab4bf18e10db2992fabfcf`, `71288d6e53954579981a30977be469bc` | 100–350k | 33–36 MB | Shrine/lararium statuettes, garden sculpture. (`Tête de Bacchus` `7e7d533c…` is **CC-BY**) |
| Roman legionary helmet | LWL-Archäologie für Westfalen | `58b2ee67fbda4764a2c975ded8e46b96` | 500k | 94 MB | Helmet reference. Very heavy, so decimate hard or remodel from it |
| Portrait head of Vespasian | Cleveland Museum of Art | `359e48ed821544fe8cf22c3c5dbbff9d` | 65k | 70 MB | Flavian statue for the Forum/Templum Pacis |
| Roman funerary relief (2nd–3rd c.), Tondo portrait of a young noblewoman (2nd c.) | Minneapolis Institute of Art | `fe4730a35f8c478194e0897195ca9717`, `e69f29a1fb114428a7759ac3fc6d06e3` | 64k each | 17.6 / 24.4 MB | Tomb decoration along the roads out of the city |
| Roman bronze jug, bronze wine strainer | The Hunt Museum | `bc7fb82f750142d58602c779db467878`, `7747730f1eb341e0a8b1f7b99e8ff387` | 175k / 265k | 8.6 / 12.9 MB | Tavern and household props |
| Oil lamps | LWL-Archäologie (`f6d93594ac874ab780201850c044e208`), Cleveland (`1946d782b9d949848f75b6b69efcedf7`) | n/a | 120–500k | 70–153 MB | *Lucernae*. Probably simpler to model procedurally |
| Roman altars (Vechten; Nehalennia altar) | Rijksmuseum van Oudheden, Leiden | `0f106d4226f0458bb29c8fc5d7ed5111`, `72054cae6aa447849168b309a69da570` | 1–1.5M | 38–57 MB | Altar shapes (the Nehalennia one is a provincial cult, so use only as a shape) |
| Corinthian capital | Virtual Museums of Małopolska | `1b61fd199e744afa9bdb8f46cf843e31` | 22k | 23 MB | Capital detail reference. The game should generate capitals procedurally |

Model page: `https://sketchfab.com/3d-models/<uid>`. Search API used: `https://api.sketchfab.com/v3/search?type=models&q=<q>&downloadable=true&license=cc0`. Musée Saint-Raymond has 34 downloadable models, mostly CC0. Check each one, because a few are CC-BY.

**Other model sources checked:**
- **OpenGameArt CC0 low-poly**, curl-able:
  - "Gladius" by LordNeo: `https://opengameart.org/sites/default/files/gladius_0.zip`, 152 KB, DAE/FBX/OBJ.
  - "3d Greek Weapons Set" by gamekorp (spear, shield, sword, sheath + textures): `https://opengameart.org/sites/default/files/WeaponSetcc0.zip`, 2.3 MB.
  - "Lowpoly Trajan's column model" by Micket: `https://opengameart.org/sites/default/files/trajan.zip`, 142 KB `.blend`.
  - "Toscan column (low poly)" by XaosXV: `.blend`.
  - These are handy references, but a procedural generator (lathe amphorae and columns, extruded scuta) will probably look more consistent.
- **Poly Haven models** (CC0, glTF): mostly modern/Renaissance. `marble_bust_01` is a *Renaissance-style* bust; the vases are transferware. Rocks such as `rock_moss_set_01` (1.9 MB) are usable. Trees are far too heavy (`pine_tree_01` ≈ 958 MB at "1k"), so procedural vegetation (umbrella pine, cypress, olive, plane) is the way.
- **Smithsonian Open Access 3D** (CC0, [3d.si.edu/cc0](https://3d.si.edu/cc0)): the API found **essentially no Roman objects**. Not useful here.
- **Scan the World / MyMiniFactory** (incl. SMK Copenhagen casts): licenses vary per item, and many are CC BY-NC. Downloads need a login. Use only items clearly tagged CC0 or CC-BY.

---

## 4. Audio

### 4.1 Format note (owner plays on a Mac)
Freesound previews and Kenney/OGA packs are mostly **Ogg Vorbis**. Ogg playback in Safari/WebKit has historically been missing or partial, depending on the Safari version. **Ship AAC (`.m4a`) or MP3**, or test Ogg on the owner's Safari first.
- On macOS, `afconvert -f m4af -d aac -b 96000 in.wav out.m4a` works without installing anything (`ffmpeg` isn't installed here).
- Freesound offers MP3 previews at the same path with `-hq.mp3`.
- Use mono for SFX, 96–128 kbps. Trim ambience loops to 20–40 s with crossfades.

### 4.2 Kenney audio packs (CC0, direct curl)
License text inside each zip: "License (Creative Commons Zero, CC0) … Credit (Kenney or www.kenney.nl) would be nice but is not mandatory."

| Pack | URL | Size | Useful contents |
|---|---|---|---|
| Impact Sounds | `https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip` | 801 KB | `footstep_concrete/grass/wood/carpet_000–004`, `impactMetal_light/medium/heavy`, `impactPlank_medium`, `impactWood_*`, `impactPunch_medium/heavy`, `impactPlate_*` (armor), `impactSoft_*`, `impactMining_*` (stone) |
| RPG Audio | `https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip` | 965 KB | `doorOpen_1–2`, `doorClose_1–4`, `handleCoins(2)`, `drawKnife1–3` (draw blade), `cloth1–4`, `beltHandle`, `chop`, `creak1–3`, `footstep00–09`, `knifeSlice`, `metalLatch`, `metalPot1–3`, `bookOpen/Flip` |
| UI Audio | `https://kenney.nl/media/pages/assets/ui-audio/490d233f68-1677590494/kenney_ui-audio.zip` | 412 KB | `click1–5`, `switch1–38`, `rollover1–6`, `mouseclick1` |
| Interface Sounds | `https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip` | 835 KB | `confirmation_*`, `error_*`, `open_*`/`close_*`, `back_*`, `click_*`, `drop_*`, `maximize/minimize_*` (skip `glitch_*`) |

### 4.3 OpenGameArt packs (CC0, direct curl)

| Pack (page) | Author | File URL | Size | Contents |
|---|---|---|---|---|
| [80 CC0 RPG SFX](https://opengameart.org/content/80-cc0-rpg-sfx) | rubberduck | `https://opengameart.org/sites/default/files/80-CC0-RPG-SFX_0.zip` | 1.85 MB | `blade_01–03`, `metal_01–03`, `item_coins_01–04`, `lock_01–03`, `stones_01–04`, `wood_01–05`, `chain_01–03`, `book_*` (skip `spell_*` / `creature_*` slime and roar sounds) |
| [100 CC0 SFX](https://opengameart.org/content/100-cc0-sfx) | rubberduck | `https://opengameart.org/sites/default/files/100-CC0-SFX_0.zip` | 2.9 MB | `door_open/close_*`, `key_open_*`, `metal_01–12`, `hit_01–04`, `bell_*`, `gong_*`, `dishes_*`, `glass_*`, `pot_*`, `paper_*`, `slam_*` (skip `microwave_*`, `machine_*`, `shot_*`, `explosion`) |
| [20 Sword Sound Effects (Attacks and Clashes)](https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes) | StarNinjas | `https://opengameart.org/sites/default/files/sword_-_starninjas_1.zip` and `…/sword_clash_-_starninjas_0.zip` | 150 KB + 145 KB | 10 swings + 10 `sword_clash.N.ogg` |
| [Swishes Sound Pack](https://opengameart.org/content/swishes-sound-pack) | artisticdude | `https://opengameart.org/sites/default/files/swishes.zip` | 385 KB | 13 `swish-N.wav` (weapon whooshes) |
| [3 Melee sounds](https://opengameart.org/content/3-melee-sounds) | remaxim | `https://opengameart.org/sites/default/files/melee%20sounds.zip` | 248 KB | `melee sound.wav`, `sword sound.wav`, `animal melee sound.wav` |
| [Battle Sound Effects](https://opengameart.org/content/battle-sound-effects) | Ogrebane | `https://opengameart.org/sites/default/files/battle_sound_effects_0.zip` | 221 KB | swishes, bow (multi-licensed; **choose CC0**) |
| [Pain sounds by EmoPreben](https://opengameart.org/content/pain-sounds-by-emopreben) | EmoPreben | `https://opengameart.org/sites/default/files/painsounds.zip` | 73 KB | 6 pain grunts |
| [37 hits/punches](https://opengameart.org/content/37-hitspunches) | qubodup | `https://opengameart.org/sites/default/files/independent_nu_ljudbank-hits_and_punches.7z` | 1.7 MB (.7z) | body hits |

### 4.4 Freesound CC0 candidates
Found with Freesound's search, filtered `license:"Creative Commons 0"` and sorted by downloads.
- **Originals** need a logged-in account or OAuth2 (API). **HQ previews** are open on the CDN and are fine to ship for CC0 sounds: `https://cdn.freesound.org/previews/<id/1000>/<id>_<userid>-hq.ogg` (or `-hq.mp3`). All URLs below returned 200.
- **Audition before use.** Real-world recordings can contain cars, phones or English speech.
- Freesound sound page: `https://freesound.org/s/<id>/`

| Need | ID | Title | Author | Dur. | HQ preview (ogg; `.mp3` also available) | Size |
|---|---|---|---|---|---|---|
| Market (Roman vendors!) | 159614 | Venditori Campo de fiori | lollosound | 128 s | `https://cdn.freesound.org/previews/159/159614_804763-hq.ogg` | 1.3 MB |
| Market | 424790 | Crowded street at medieval market | bolkmar | 10 s | `https://cdn.freesound.org/previews/424/424790_2927958-hq.ogg` | 235 KB |
| Market | 173013 | market.wav | ninebilly | 178 s | `https://cdn.freesound.org/previews/173/173013_773642-hq.ogg` | 4.0 MB |
| Crowd walla (outdoor) | 478248 | Outdoors Walla | brunoboselli | 76 s | `https://cdn.freesound.org/previews/478/478248_300738-hq.ogg` | 1.8 MB |
| Crowd walla (outdoor) | 634880 | Generic Exterior Walla | brunoboselli | 31 s | `https://cdn.freesound.org/previews/634/634880_300738-hq.ogg` | 623 KB |
| Crowd (interior: tavern, baths) | 465699 | Busy Room Ambience / People talking in background | Breviceps | 28 s | `https://cdn.freesound.org/previews/465/465699_9159316-hq.ogg` | 615 KB |
| Cicadas | 272169 | Cicadas | dethrok | 46 s | `https://cdn.freesound.org/previews/272/272169_3186672-hq.ogg` | 1.1 MB |
| Countryside (insects/birds) | 458113 | Countryside | brunoboselli | 58 s | `https://cdn.freesound.org/previews/458/458113_300738-hq.ogg` | 1.3 MB |
| Night insects | 328293 | Forest at night, crickets, cicadas and insects | felix.blume | 301 s | `https://cdn.freesound.org/previews/328/328293_1661766-hq.ogg` | 8.3 MB (recorded in Mexico; trim and check it sounds Mediterranean) |
| Birds | 184870 | bird chirps5 | keweldog | 20 s | `https://cdn.freesound.org/previews/184/184870_3153523-hq.ogg` | 351 KB |
| Birds | 364663 | Bird call in spring | jmiddlesworth | 132 s | `https://cdn.freesound.org/previews/364/364663_3124312-hq.ogg` | 2.5 MB |
| Wind | 457318 | Autumn wind and dry leaves | Stek59 | 43 s | `https://cdn.freesound.org/previews/457/457318_9065275-hq.ogg` | 1.0 MB |
| Wind | 22331 | wind.ogg | sleepCircle | 34 s | `https://cdn.freesound.org/previews/22/22331_124894-hq.ogg` | 588 KB |
| Fountain | 415027 | small fountain | roman_cgr | 45 s | `https://cdn.freesound.org/previews/415/415027_639300-hq.ogg` | 920 KB |
| Fountain | 169250 | Fountain_1 | skyko | 61 s | `https://cdn.freesound.org/previews/169/169250_1391822-hq.ogg` | 1.7 MB |
| Fire | 363092 | Fire Crackle and Flames 002 | TheWoodlandNomad | 21 s | `https://cdn.freesound.org/previews/363/363092_6612464-hq.ogg` | 508 KB |
| Fire | 181563 | Fire Crackling 01 | kingsrow | 34 s | `https://cdn.freesound.org/previews/181/181563_1857065-hq.ogg` | 921 KB |
| Torch loop | 483692 | torch ambience loop | LordStirling | 816 s | `https://cdn.freesound.org/previews/483/483692_7662631-hq.ogg` | 10 MB (**trim to 20 s**) |
| Torch swing | 249809 | Waving Torch | spookymodem | 4 s | `https://cdn.freesound.org/previews/249/249809_3756348-hq.ogg` | 103 KB |
| Footsteps: **sandals** | 734632 | Footsteps Sandals - Walk & run | Vrymaa | 35 s | `https://cdn.freesound.org/previews/734/734632_13973196-hq.ogg` | 410 KB |
| Footsteps: gravel/stone | 825854 | Footsteps Gravel Stones - Walk | Vrymaa | n/a | `https://cdn.freesound.org/previews/825/825854_13973196-hq.ogg` | 549 KB |
| Footsteps: rock | 770084 | Footsteps Rock - Dry floor, walk & run | Vrymaa | n/a | `https://cdn.freesound.org/previews/770/770084_13973196-hq.mp3` | 844 KB |
| Footsteps: mud | 770097 | Footsteps Mud - Walk & run | Vrymaa | n/a | `https://cdn.freesound.org/previews/770/770097_13973196-hq.mp3` | 710 KB |
| Armour / straps (legionary jingle) | 805470 | Harness Armour straps - Baldric or military equipment | Vrymaa | n/a | `https://cdn.freesound.org/previews/805/805470_13973196-hq.mp3` | 439 KB |
| Footsteps with harness | 805469 | Footsteps with harness - Baldric or straps | Vrymaa | n/a | `https://cdn.freesound.org/previews/805/805469_13973196-hq.mp3` | 1.2 MB |
| Footsteps: dirt/gravel | 352870 | Footsteps Dirt Gravel | PotatokingXII | 35 s | `https://cdn.freesound.org/previews/352/352870_4187409-hq.ogg` | 423 KB |
| Footsteps: stone steps | 208103 | Stone Steps | Phil25 | 9 s | `https://cdn.freesound.org/previews/208/208103_2943165-hq.ogg` | 71 KB |
| Footsteps: dirt | 264469 | Footsteps Dirt 01 | aglinder | 26 s | `https://cdn.freesound.org/previews/264/264469_1042839-hq.ogg` | 615 KB |
| Sword clashes (long take, cut it up) | 568790 | sword against sword | Fenodyrie | 79 s | `https://cdn.freesound.org/previews/568/568790_6371307-hq.ogg` | 1.8 MB |
| Sword clash | 471095 | Sword clash 1 | spycrah | 3 s | `https://cdn.freesound.org/previews/471/471095_9856191-hq.ogg` | 60 KB |
| Sword clash | 275159 | Sword Clash | Bird_man | 1 s | `https://cdn.freesound.org/previews/275/275159_4745081-hq.ogg` | 17 KB |
| Swing whoosh | 263595 | swoosh | PorkMuncher | 2 s | `https://cdn.freesound.org/previews/263/263595_4946670-hq.ogg` | 22 KB |
| Swing whoosh | 268227 | Swing | XxChr0nosxX | 1 s | `https://cdn.freesound.org/previews/268/268227_5078136-hq.ogg` | 29 KB |
| Grunts (effort) | 427972 | male grunt | lipalearning | 16 s | `https://cdn.freesound.org/previews/427/427972_4687265-hq.ogg` | 76 KB |
| Grunts (effort) | 218895 | human grunts 3 | Halgrimm | 14 s | `https://cdn.freesound.org/previews/218/218895_2834921-hq.ogg` | 149 KB |
| Pain / death | 416838, 416839 | Grunt2 / Grunt1 - Death Pain | tonsil5 | 1–2 s | `https://cdn.freesound.org/previews/416/416838_8247784-hq.ogg`, `…/416839_8247784-hq.ogg` | 20 / 15 KB |
| Door creak | 219499 | Door - Creak | JarredGibb | 1 s | `https://cdn.freesound.org/previews/219/219499_4056007-hq.ogg` | 21 KB |
| Door creak (long) | 346267 | Door Creak | stib | 37 s | `https://cdn.freesound.org/previews/346/346267_470543-hq.ogg` | 946 KB |
| Coins | 363090 | Coins Being Dropped-Assorted | TheWoodlandNomad | 24 s | `https://cdn.freesound.org/previews/363/363090_6612464-hq.ogg` | 546 KB |
| Coin drop | 17502 | Coin dropping | Jace | 2 s | `https://cdn.freesound.org/previews/17/17502_60285-hq.ogg` | 58 KB |
| Horses on paving | 549882 | Horses Pavement Then Cobblestone | guynoland | 68 s | `https://cdn.freesound.org/previews/549/549882_8234803-hq.ogg` | 1.3 MB |
| Smithy | 137836 | Blacksmith Workshop | thefilmbakery | 130 s | `https://cdn.freesound.org/previews/137/137836_977564-hq.ogg` | 1.4 MB |
| Anvil | 270588 | Anvil Hit 2 | michorvath | 1 s | `https://cdn.freesound.org/previews/270/270588_3094998-hq.ogg` | 18 KB |
| Amphora knock | 770042 | Amphora - Hitting jar & wooden lid | Vrymaa | 7 s | `https://cdn.freesound.org/previews/770/770042_13973196-hq.ogg` | 124 KB |
| Lyre (sample) | 191883 | Lyre.flac | Hedmarking | 16 s | `https://cdn.freesound.org/previews/191/191883_3331686-hq.ogg` | 329 KB |
| Frame drum one-shot | 345636 | Frame drum_oneshot_RAW_13 | cabled_mess | 3 s | `https://cdn.freesound.org/previews/345/345636_5450487-hq.ogg` | 35 KB (part of a one-shot series by the same user) |

Freesound user **Vrymaa**'s CC0 pack *Clothes & Garments* (`https://freesound.org/people/Vrymaa/packs/40975/`, 12 sounds, all CC0) is especially well suited: sandals, armour straps, footsteps on rock, mud and gravel.

### 4.5 Music
Very little CC0 "ancient Roman" music exists. Options:

| Option | Details |
|---|---|
| **OGA CC0 tracks** | "Gladiator's Lament – Epic Tragic Music" by Sorth (`https://opengameart.org/sites/default/files/gladiator_lament_0.mp3`, 1.2 MB). "Experimenting with Greek instrument samples" by Spring Spring (`…/files/greek%20instruments_0.ogg` 2.3 MB, `…/files/greek%20boss%20battle_0.ogg` 2.2 MB). "Medieval: Exploration" by RandomMind (`…/files/Exploration_0.mp3`, 9.4 MB, generic medieval). "ancient fairytale" by obscure music (`…/files/abf_0.mp3`, 10.4 MB). All pages show CC0. |
| **Our own performances of public-domain ancient melodies** (recommended) | The surviving tunes are PD as compositions: the **Seikilos epitaph** (c. 1st c. BC–1st c. AD), the **Delphic Hymns** (2nd c. BC), and **Mesomedes'** *Hymn to the Sun* and *Hymn to Nemesis* (Hadrianic, so a decade or two after 113; close enough for flavor). Render them with a WebAudio plucked-string (Karplus–Strong) "lyre/kithara", a reed-ish double-pipe "aulos", and frame-drum one-shots. No license risk, tiny file size, and authentic. |
| **Kevin MacLeod / incompetech** (CC-BY 4.0) | A fallback if we need polished orchestral cues. Requires attribution. Pick tracks by ear. |
| Sonniss | **No** (see top). |

---

## 5. Fonts (SIL OFL 1.1, self-hosted woff2)

Fontsource npm files are served by jsDelivr and are the same OFL fonts as Google Fonts. Pin a version (e.g. `@fontsource/cinzel@5`) when fetching, then **self-host** under `public/fonts/` with each family's `OFL.txt`. `latin-ext` covers **macrons** (ā ē ī ō ū) for Latin vowel length.

| Role | Family | URL | Size |
|---|---|---|---|
| Display: Roman capitals (titles, inscriptions, map labels) | **Cinzel** 400 | `https://cdn.jsdelivr.net/npm/@fontsource/cinzel/files/cinzel-latin-400-normal.woff2` | 14.1 KB |
| | Cinzel 700 | `https://cdn.jsdelivr.net/npm/@fontsource/cinzel/files/cinzel-latin-700-normal.woff2` | 15.2 KB |
| | Cinzel latin-ext 400 / 700 | `…/cinzel-latin-ext-400-normal.woff2` / `…/cinzel-latin-ext-700-normal.woff2` | 7.9 / 8.3 KB |
| | Cinzel variable (wght 400–900) | `https://cdn.jsdelivr.net/npm/@fontsource-variable/cinzel/files/cinzel-latin-wght-normal.woff2` | 25.9 KB |
| Display alt (softer, has lowercase) | Marcellus 400 (only weight) | `https://cdn.jsdelivr.net/npm/@fontsource/marcellus/files/marcellus-latin-400-normal.woff2` (+ `-latin-ext-`) | 14.6 KB (+8.9) |
| | Marcellus SC 400 | `https://cdn.jsdelivr.net/npm/@fontsource/marcellus-sc/files/marcellus-sc-latin-400-normal.woff2` | 14.5 KB |
| | Cinzel Decorative 400/700 | `https://cdn.jsdelivr.net/npm/@fontsource/cinzel-decorative/files/cinzel-decorative-latin-400-normal.woff2` | 14.4 KB |
| Body serif (dialogue, journal, books) | **EB Garamond** 400 / 700 / 400 italic | `https://cdn.jsdelivr.net/npm/@fontsource/eb-garamond/files/eb-garamond-latin-400-normal.woff2`, `…-latin-700-normal.woff2`, `…-latin-400-italic.woff2` | 23.8 / 25.3 / 25.4 KB |
| | EB Garamond latin-ext 400 / 700 | `…/eb-garamond-latin-ext-400-normal.woff2` / `…-700-normal.woff2` | 57 / 64 KB |
| | EB Garamond variable | `https://cdn.jsdelivr.net/npm/@fontsource-variable/eb-garamond/files/eb-garamond-latin-wght-normal.woff2` | 44.3 KB |
| Body alt (elegant, high-contrast; weaker at small sizes) | Cormorant Garamond 400 / 700 | `https://cdn.jsdelivr.net/npm/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-400-normal.woff2` (`-700-`) | 22.9 / 22.3 KB |

**OFL license texts** (all return 200):
- `https://raw.githubusercontent.com/google/fonts/main/ofl/cinzel/OFL.txt`: "Copyright 2020 The Cinzel Project Authors (https://github.com/NDISCOVER/Cinzel)"
- `…/ofl/marcellus/OFL.txt`: "Copyright (c) 2012, Brian J. Bonislawsky DBA Astigmatic (AOETI), with **Reserved Font Names "Marcellus"**"
- `…/ofl/ebgaramond/OFL.txt`: "Copyright 2017 The EB Garamond Project Authors (https://github.com/octaviopardo/EBGaramond12)"
- `…/ofl/cormorantgaramond/OFL.txt`: "Copyright 2015 the Cormorant Project Authors (github.com/CatharsisFonts/Cormorant)"

**RFN caveat:** if we modify Marcellus (for example by re-subsetting it ourselves), the result can't be called "Marcellus". Ship Fontsource's files unmodified, or prefer Cinzel, which has no reserved name. **Recommended pair: Cinzel (display) + EB Garamond (body)**, about 0.1 MB total.

---

## 6. Public-domain map imagery (for the parchment map style)

All of these are on Wikimedia Commons, tagged **Public domain**. The authors died long ago: Lanciani 1929, Nolli 1756, Piranesi 1778. Commons API: `https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url|size|extmetadata&titles=File:<name>`. Send a descriptive User-Agent. Commons also serves scaled copies at `https://upload.wikimedia.org/wikipedia/commons/thumb/<a>/<ab>/<file>/3840px-<file>`. 3840 px is the largest standard thumbnail; Commons now snaps other requested widths to standard sizes.

| Map | Commons file | Full resolution | 3840-px version |
|---|---|---|---|
| **Lanciani, *Forma Urbis Romae* (1893–1901), key/overview sheet** | `File:Rodolfo Lanciani - Forma Urbis Romae - Overview.jpg` → `https://upload.wikimedia.org/wikipedia/commons/5/5e/Rodolfo_Lanciani_-_Forma_Urbis_Romae_-_Overview.jpg` | 14000×9500, 40.9 MB | `https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Rodolfo_Lanciani_-_Forma_Urbis_Romae_-_Overview.jpg/3840px-Rodolfo_Lanciani_-_Forma_Urbis_Romae_-_Overview.jpg`, 2.29 MB |
| Lanciani overview, small | `File:Rodolfo Lanciani - Forma Urbis Romae Overview.jpg` → `https://upload.wikimedia.org/wikipedia/commons/1/1c/Rodolfo_Lanciani_-_Forma_Urbis_Romae_Overview.jpg` | 2000×1440, 0.66 MB | n/a |
| **Lanciani FUR, all 46 sheets** ("Tavola 01"–"Tavola 46", plus "Synopsis 1/2") | Category `Forma Urbis Romae by Edizioni Quasar`. Files named `File:Rodolfo Lanciani - Forma Urbis Romae - Tavola NN.jpg`. Example: Tav. 21 → `https://upload.wikimedia.org/wikipedia/commons/b/bf/Rodolfo_Lanciani_-_Forma_Urbis_Romae_-_Tavola_21.jpg` | ≈11360×7650 each, 30–41 MB | Tav. 21 at 3840 px: 2.53 MB |
| **Nolli, *Nuova Pianta di Roma* (1748)**, 12 sheets | `File:Giovanni Battista Nolli-Nuova Pianta di Roma (1748) 1-12.jpg` (`https://upload.wikimedia.org/wikipedia/commons/8/8b/Giovanni_Battista_Nolli-Nuova_Pianta_di_Roma_%281748%29_1-12.jpg`). Search found sheets `02-12`, `03-12`, `04-12`, `05-12`, `06-12`, `08-12`, `09-12`, `10-12`, `12-12` (`.JPG`). 07 and 11 weren't in the results; check their exact names. Credit: "Self-scanned" | ≈8233×5080, 17.6 MB | 4.54 MB |
| Nolli/Piranesi **reduced plan** (*La Topografia di Roma … minor tavola*), single sheet | `File:La Topografia di Roma di - Gio. Battista Nolli, dalla maggiore in questa minor tavola dal medesimo ridotta. Piranesi e Nolli incisero - btv1b53064508x.jpg` (credit: Bibliothèque nationale de France) | 9188×6494, 14.0 MB | n/a |
| **Piranesi, *Ichnographia Campi Martii*** (Commons file labelled 1780) | `File:Ichnographiam Campi Martii antiquae urbis 1780 barcode (1780).jpg` → `https://upload.wikimedia.org/wikipedia/commons/c/c7/Ichnographiam_Campi_Martii_antiquae_urbis_1780_barcode_%281780%29.jpg` (credit: Ghent University Library) | 3979×3999, 17.7 MB | 5.28 MB |

**Caveats:**
- **These maps are anachronistic as-is.**
  - Lanciani overlays the **Aurelian Walls** (270s), modern streets in red, and **later monuments**: the Baths of Diocletian, Constantine and Caracalla (the "Th. Antoninianae"), St Peter's, Castel Sant'Angelo/Mausoleum of Hadrian, the Pons Aelius area, and so on.
  - Nolli shows baroque Rome.
  - Piranesi's Campus Martius is a partly *imaginary* reconstruction.
  - **Use them as style and tracing references.** Generate the in-game map from our own world data (AD 113 features only), styled with an engraving look (hatching, Cinzel labels).
- Lanciani's overview sheet shows the sheet grid. The Forum, Capitol and Colosseum fall roughly in sheet XXIX/XXX, the Palatine and Circus Maximus in XXXV, and the Campus Martius in XXI–XXII. That's my reading of the key; verify before relying on it.
- **Scan rights:** Commons credits the Lanciani sheets to "davidrumsey.com – Edizioni Quasar". David Rumsey publishes his scans as CC BY-NC-SA. Under US law (*Bridgeman v. Corel*), and per Commons policy, faithful scans of 2D public-domain works are themselves PD. Risk is low, but still credit the scan sources.
- **Not usable:** Stanford's *Digital Forma Urbis Romae* (images of the Severan Marble Plan) isn't openly licensed. Use it as a reference only.
- **Lore note:** the Severan Marble Plan dates to c. 203–211. An earlier Flavian marble plan is widely believed to have hung at the Templum Pacis, and Agrippa's world map stood in the Porticus Vipsania. Either gives an in-world reason for a "marble plan" map style. Also, papyrus (not parchment) was the everyday writing material in 113.
- **Paper texture for the map UI:** ambientCG `Paper006` (beige/brown, CC0, `https://ambientcg.com/get?file=Paper006_1K-JPG.zip`, 4.75 MB zip) or `Paper003` (creased white). Tint them papyrus-yellow.

---

## 7. Recommended first-playable shortlist (fetch in this order)

Target: **about 25–28 MB shipped**. Raw downloads are larger, about 60 MB, and stay in the cache.

| # | Group | Fetch | Raw download | Shipped (est.) |
|---|---|---|---|---|
| 1 | **Characters** | Mesh2Motion `male.glb`, `female.glb`, `human-base-animations.glb` (pinned SHA above). Later: `human-addon-animations.glb` (for `Death_A/B/C`, `Strafe_*`, `Walk_Backwards`, `Defend`) | 7.5 MB (+5.3) | **≈3.5 MB** (bodies + about 25 clips, resampled + meshopt) |
| 2 | **Textures, 13 Poly Haven sets** | `grey_stone_path`, `sandstone_blocks_08`, `medieval_red_brick`, `plastered_wall_04`, `damaged_plaster`, `large_sandstone_blocks_01`, `clay_roof_tiles_02`, `dirt_floor`, `grass_ground`, `withered_grass`, `weathered_planks`, `cliff_side`, `brown_mud` (diff + nor_gl + arm each; exact URLs in Appendix A) | ≈30 MB | **≈7.5 MB** (1k JPEG q80) |
| 3 | **Textures, 3 ambientCG zips** | `Marble019`, `Marble026`, `Metal008` (keep Color + NormalGL + Roughness, pack ARM) | 14.5 MB | **≈1.8 MB** |
| 4 | **Procedural (no download)** | Sky.js day/sunset + star field; water normals; opus reticulatum; tegula/imbrex roofs; brick shader (later) | n/a | 0 |
| 5 | **SFX** | Kenney `impact-sounds` + `rpg-audio` + `ui-audio`. OGA `sword_clash` + `sword` (StarNinjas), `swishes`, `painsounds`, `80-CC0-RPG-SFX`. Freesound: 734632 (sandals), 825854, 770084, 805470, 416838/416839, 363090, 219499 | ≈6 MB | **≈2 MB** (≈40 trimmed mono clips) |
| 6 | **Ambience loops** | Freesound 159614 (market), 478248 (walla), 272169 (cicadas), 364663 or 184870 (birds), 457318 (wind), 415027 (fountain), 363092 (fire) | ≈8 MB | **≈2.5 MB** (7 loops × 20–30 s, mono AAC 96k) |
| 7 | **Music** | OGA "Gladiator's Lament" (1.2 MB) + "Greek instruments" (2.3 MB), plus procedural lyre/aulos playing the Seikilos epitaph | 3.5 MB | **≈3.5 MB** |
| 8 | **Fonts** | Cinzel 400/700 (latin + latin-ext), EB Garamond 400/700/400-italic (latin + latin-ext), + OFL.txt ×2 | 0.2 MB | **≈0.15 MB** |
| 9 | **Map** | Lanciani overview 3840 px (reference only, don't ship). Ship our generated map + `Paper006` color | 7 MB | **≈1 MB** |
| 10 | Optional set piece | **Bust of Trajan** (Sketchfab `e7e240f9…`, needs login) decimated to about 20k tris with 1k textures | 13 MB | **≈1.5 MB** |
| 11 | Optional | One night HDRI `qwantani_night_puresky` 1k (if procedural stars look poor) | 1.3 MB | 1.3 MB |
| | | | **≈95 MB raw** | **≈24–27 MB** |

Defer: the remaining texture alternates, horses (`horse-animations.glb`, 1.1 MB), coloured-marble variety, Quaternius UAL Pro (owner purchase), UBC bodies with faces and hair (browser download, 122 MB zip), museum statues.

---

## 8. Processing pipeline notes

- **Textures:**
  - JPEG q80 4:2:0 for diffuse and ARM. Normals at q85–90, or WebP; Safari supports WebP since v14.
  - Later, convert to **KTX2** (`toktx`, or `gltf-transform uastc`/`etc1s`): UASTC for normals, ETC1S for colour. KTX2 cuts GPU memory a lot but needs three's `KTX2Loader` plus the Basis transcoder (~0.5 MB, Apache-2.0).
  - Keep 1k for hero surfaces and 512 for distant or terrain-tiled ones.
- **glTF:**
  - Run `gltf-transform resample`, `prune`, `dedup`, `weld`, then `meshopt` (or `draco`). three needs `MeshoptDecoder` from `three/examples/jsm/libs/meshopt_decoder.module.js`.
  - Split bodies from the animation libraries.
  - For museum scans, `simplify --ratio 0.1–0.2`, then `resize --width 1024`.
- **Audio:** cut ambience to seamless 20–40 s loops. Normalize SFX to about −3 dBFS peak. Ship mono AAC or MP3 (see §4.1).
- **Manifest:** store `{id, file, sourceUrl, author, license, licenseUrl, modifications}` for every shipped asset, and generate `CREDITS.md` from it.

---

## Appendix A: exact URLs for the first-playable textures (all HEAD = 200)

```
# Poly Haven 1k JPG: diffuse, OpenGL normal, ARM (R=AO, G=rough, B=metal)
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/grey_stone_path/grey_stone_path_diff_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/grey_stone_path/grey_stone_path_nor_gl_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/grey_stone_path/grey_stone_path_arm_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/sandstone_blocks_08/sandstone_blocks_08_diff_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/sandstone_blocks_08/sandstone_blocks_08_nor_gl_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/sandstone_blocks_08/sandstone_blocks_08_arm_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/medieval_red_brick/medieval_red_brick_diff_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/medieval_red_brick/medieval_red_brick_nor_gl_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/medieval_red_brick/medieval_red_brick_arm_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/plastered_wall_04/plastered_wall_04_diff_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/plastered_wall_04/plastered_wall_04_nor_gl_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/plastered_wall_04/plastered_wall_04_arm_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/damaged_plaster/damaged_plaster_diff_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/damaged_plaster/damaged_plaster_nor_gl_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/damaged_plaster/damaged_plaster_arm_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/large_sandstone_blocks_01/large_sandstone_blocks_01_diff_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/large_sandstone_blocks_01/large_sandstone_blocks_01_nor_gl_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/large_sandstone_blocks_01/large_sandstone_blocks_01_arm_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/clay_roof_tiles_02/clay_roof_tiles_02_diff_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/clay_roof_tiles_02/clay_roof_tiles_02_nor_gl_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/clay_roof_tiles_02/clay_roof_tiles_02_arm_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/dirt_floor/dirt_floor_diff_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/dirt_floor/dirt_floor_nor_gl_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/dirt_floor/dirt_floor_arm_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/grass_ground/grass_ground_diff_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/grass_ground/grass_ground_nor_gl_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/grass_ground/grass_ground_arm_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/withered_grass/withered_grass_diff_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/withered_grass/withered_grass_nor_gl_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/withered_grass/withered_grass_arm_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/weathered_planks/weathered_planks_diff_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/weathered_planks/weathered_planks_nor_gl_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/weathered_planks/weathered_planks_arm_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/cliff_side/cliff_side_diff_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/cliff_side/cliff_side_nor_gl_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/cliff_side/cliff_side_arm_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/brown_mud/brown_mud_diff_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/brown_mud/brown_mud_nor_gl_1k.jpg
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/brown_mud/brown_mud_arm_1k.jpg

# ambientCG 1K-JPG zips (302 -> acg-download.struffelproductions.com; curl -L)
https://ambientcg.com/get?file=Marble019_1K-JPG.zip     # 4.08 MB
https://ambientcg.com/get?file=Marble026_1K-JPG.zip     # 5.24 MB
https://ambientcg.com/get?file=Metal008_1K-JPG.zip      # 5.21 MB
https://ambientcg.com/get?file=Paper006_1K-JPG.zip      # 4.75 MB

# Characters (Mesh2Motion, CC0), pinned commit
https://raw.githubusercontent.com/Mesh2Motion/mesh2motion-app/79f3f61a9852ef70234a5a4a7c13ed87f7a71833/static/models-variation/human/male.glb
https://raw.githubusercontent.com/Mesh2Motion/mesh2motion-app/79f3f61a9852ef70234a5a4a7c13ed87f7a71833/static/models-variation/human/female.glb
https://raw.githubusercontent.com/Mesh2Motion/mesh2motion-app/79f3f61a9852ef70234a5a4a7c13ed87f7a71833/static/animations/human-base-animations.glb
https://raw.githubusercontent.com/Mesh2Motion/mesh2motion-app/79f3f61a9852ef70234a5a4a7c13ed87f7a71833/static/animations/human-addon-animations.glb
https://raw.githubusercontent.com/Mesh2Motion/mesh2motion-app/79f3f61a9852ef70234a5a4a7c13ed87f7a71833/static/animations/horse-animations.glb
https://raw.githubusercontent.com/Mesh2Motion/mesh2motion-app/79f3f61a9852ef70234a5a4a7c13ed87f7a71833/LICENSE-CC0.MD
```

Every other Poly Haven ID in §1.2 follows the same pattern. All 36 candidate IDs × 4 maps (144 URLs) plus 21 ambientCG zips were HEAD-checked: **165/165 returned 200**.

---

## Appendix B: ATTRIBUTION block (paste into `CREDITS.md`; trim to what actually ships)

```markdown
## Third-party assets

Skyrome's code is our own. The following third-party assets are used under the licenses noted.
CC0 assets need no attribution; we credit them anyway with thanks.

### Textures & HDRIs
- Textures from **Poly Haven** (https://polyhaven.com), CC0 1.0. Authors: Rob Tuytel, Amal Kumar,
  Charlotte Baglioni, Dario Barresi, Dimitrios Savva, eye-candy.xyz, James Ray Cock,
  Jenelle van Heerden, Greg Zaal. Assets: grey_stone_path, sandstone_blocks_08, medieval_red_brick,
  plastered_wall_04, damaged_plaster, large_sandstone_blocks_01, clay_roof_tiles_02, dirt_floor,
  grass_ground, withered_grass, weathered_planks, cliff_side, brown_mud.
- HDRIs from **Poly Haven**, CC0 1.0 (Greg Zaal, Andreas Mischok, Jarod Guest), if used.
- Created using Marble019, Marble026, Metal008 and Paper006 from **ambientCG.com**,
  licensed under the Creative Commons CC0 1.0 Universal License.

### Characters & animation
- Base character meshes and the Universal Animation Library 1 & 2 (Standard) animations by
  **Quaternius** (https://quaternius.com), CC0 1.0, as packaged by **Mesh2Motion**
  (https://github.com/Mesh2Motion/mesh2motion-app, art assets CC0 1.0).
- Additional animations (human-addon-animations, horse-animations) by **Mesh2Motion** / Scott Petrovic, CC0 1.0.

### 3D scans (if used)
- "Buste de Trajan" (Inv. Ra 117), **Musée Saint-Raymond, Toulouse**, CC0 1.0 via Sketchfab
  (https://sketchfab.com/3d-models/buste-de-trajan-e7e240f95b4348e0af42289a67b23633).
  3D scan by IMA Solutions. Decimated and retextured for real-time use.

### Sound effects
- **Kenney** (https://kenney.nl): Impact Sounds, RPG Audio, UI Audio, Interface Sounds. CC0 1.0.
- **OpenGameArt.org**, CC0 1.0: "80 CC0 RPG SFX" and "100 CC0 SFX" by rubberduck;
  "20 Sword Sound Effects (Attacks and Clashes)" by StarNinjas; "Swishes Sound Pack" by artisticdude;
  "3 Melee sounds" by remaxim; "Battle Sound Effects" by Ogrebane (CC0 option);
  "Pain sounds" by EmoPreben; "37 hits/punches" by qubodup.
- **Freesound.org**, CC0 1.0 (sound IDs in parentheses): lollosound (159614), bolkmar (424790),
  ninebilly (173013), brunoboselli (478248, 634880, 458113), Breviceps (465699), dethrok (272169),
  felix.blume (328293), keweldog (184870), jmiddlesworth (364663), Stek59 (457318), sleepCircle (22331),
  roman_cgr (415027), skyko (169250), TheWoodlandNomad (363092, 363090), kingsrow (181563),
  LordStirling (483692), spookymodem (249809), Vrymaa (734632, 825854, 770084, 770097, 805470, 805469, 770042),
  PotatokingXII (352870), Phil25 (208103), aglinder (264469), Fenodyrie (568790), spycrah (471095),
  Bird_man (275159), PorkMuncher (263595), XxChr0nosxX (268227), lipalearning (427972), Halgrimm (218895),
  tonsil5 (416838, 416839), JarredGibb (219499), stib (346267), Jace (17502), guynoland (549882),
  thefilmbakery (137836), michorvath (270588), Hedmarking (191883), cabled_mess (345636).

### Music
- "Gladiator's Lament" by Sorth; "Experimenting with Greek instrument samples" by Spring Spring.
  OpenGameArt.org, CC0 1.0.
- Ancient melodies (Seikilos epitaph; Mesomedes' hymns) are public-domain compositions,
  performed by Skyrome's procedural instruments.

### Fonts (SIL Open Font License 1.1; license texts in /public/fonts/)
- **Cinzel**, Copyright 2020 The Cinzel Project Authors (https://github.com/NDISCOVER/Cinzel).
- **EB Garamond**, Copyright 2017 The EB Garamond Project Authors (https://github.com/octaviopardo/EBGaramond12).
- (If used) **Marcellus**, Copyright (c) 2012 Brian J. Bonislawsky DBA Astigmatic (AOETI), Reserved Font Name "Marcellus".
- (If used) **Cormorant Garamond**, Copyright 2015 the Cormorant Project Authors.

### Map references (public domain)
- Rodolfo Lanciani, *Forma Urbis Romae* (Milan, 1893–1901). Scans via Wikimedia Commons
  (David Rumsey Map Collection / Edizioni Quasar). Public domain.
- Giovanni Battista Nolli, *Nuova Pianta di Roma* (1748), via Wikimedia Commons. Public domain.
- Giovanni Battista Piranesi, *Ichnographia Campi Martii* (first published 1762; scanned copy dated 1780),
  Ghent University Library scan via Wikimedia Commons. Public domain.

### Libraries
- three.js (MIT), including the Sky addon (examples/jsm/objects/Sky.js).
```

---

### Sources consulted
Poly Haven API and license (api.polyhaven.com, polyhaven.com/license, github.com/Poly-Haven/Public-API); ambientCG API and license (docs.ambientcg.com/license); quaternius.com pack pages and quaternius.itch.io pages for UAL, UAL2, UBC and Modular Character Outfits – Fantasy; Mesh2Motion README, `LICENSE-CC0.MD`, `src/lib/RigModelVariations.ts`; J-Ponzo/gltf-universal-animation-library; Sketchfab API v3 (`/search`, `/models/<uid>`); Smithsonian Open Access API; kenney.nl asset pages and in-zip License.txt; opengameart.org content pages; freesound.org search and pack pages; sonniss.com/gameaudiogdc; Wikimedia Commons API; Fontsource on jsDelivr; google/fonts OFL.txt files.
