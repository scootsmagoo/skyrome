# Skyrome: third-party 3D assets for characters, animation, props and vegetation

Research date: 2026-10-04. Companion to `assets.md` (textures, sky, audio, fonts, museum scans). This survey covers **rigged characters and animation, props, and vegetation**. I downloaded the promising candidates into the git-ignored scratch folder `.claude/asset-staging/chars-props/`, inspected them with `gltf-transform`, and rendered them in three.js r186 next to our procedural output. Nothing was added to `src/` or `public/`.

The scratch folder holds every render mentioned below (`shots/*.png`), plus two small test harnesses: `viewer.html` + `render.mjs` (loads any GLB) and `retarget.html` + `render2.mjs` (drives our procedural avatar with real animation clips through the repo's Vite server).

## 1. Summary and ranking

**Short answers to the owner's questions**

- **Pinterest and "Google image" finds are not usable.** Pinterest is a pin board of images with unknown or arbitrary licenses, and an image is not a 3D asset. Everything below comes from sites that state a license on the asset's own page, and I quote it.
- **Should we swap our procedural characters for real ones? No.** The real free bodies are a better-looking *mesh* but a worse *fit*: modern/fantasy clothes, heroic proportions, 3x the triangles, and none of our period garments (toga, tunica, stola, lorica segmentata). **The real win is the animation**: Quaternius's CC0 Universal Animation Library clips retarget cleanly onto our existing skeleton (I built and rendered a working prototype, section 3.3).
- **There is no CC0 Mediterranean tree.** None of Poly Haven, Quaternius or Kenney has an umbrella pine, cypress or olive (I checked each catalog; KayKit's nature pack is cartoon-style and I did not download it). There *are* good **CC-BY** models of exactly those trees, and they decimate well (section 5).
- **Several Roman hero props exist under CC-BY** (scutum, gladius, helmet, Pompeii marble table, oil lamps, amphora). They are downloadable with plain `curl` through the Objaverse mirror, no Sketchfab login needed (section 4.1).

**Ranked by visual payoff for effort** (effort: S = under a day, M = 2 to 3 days, L = a week or more)

| # | What | Payoff | Effort | License | Shipped size |
|---|---|---|---|---|---|
| 1 | **Retarget Quaternius UAL clips onto our skeleton.** Fills real gaps: swimming (the player can swim the Tiber, but nothing animates it on the avatar), sit enter/exit, deaths, hit reactions, work, carry, talking, climbing. Keep our procedural walk/run/combat | High: NPCs stop looking stiff | M | CC0 | about 0.3 to 0.6 MB for about 40 baked clips (estimate) |
| 2 | **Hero kit in first person: real scutum, gladius, helmet** (section 4.1) | Medium-high: always on screen | S | CC-BY | about 0.3 MB each |
| 3 | **Real stone pine, olive and cypress for hero locations** (forum gardens, Palatine, near the player); keep procedural trees for bulk | High on the skyline | M | CC-BY | about 0.25 to 0.6 MB per tree type |
| 4 | **Roman vignette props:** Pompeii marble table, oil lamps, amphora, wine strainer, silver cup, bust | Medium: interiors, shrines, tavern tables | S | CC-BY | 0.1 to 0.4 MB each |
| 5 | **Leaf atlases from Poly Haven** as alpha cards on our procedural trees | Medium | S to M | CC0 | about 0.5 MB |
| 6 | **Ground cover and rocks from Poly Haven** (shrubs, grass clumps, flowers, boulders), decimated | Medium (bland terrain) | M | CC0 | about 0.1 to 0.3 MB each after decimation |
| 7 | **Quaternius Fantasy Props MegaKit, cherry-picked** (training dummy, weapon stand, workbench, anvil, rope, banners) | Low-medium | S | CC0 | about 2 to 3 MB for the whole free set |
| 8 | Real base bodies and outfits (Quaternius UBC + MCO) | Negative today | L | CC0 | 0.4 to 0.5 MB per character |
| 9 | Kenney, KayKit, Quaternius Stylized Nature | Skip: toy or cartoon style | n/a | CC0 | n/a |

**Decisions for the owner** (none block anything):
1. Attribution page: CC-BY items need a visible credits screen or `CREDITS.md` (all rows are in Appendix E).
2. Optional spend: **UAL Pro, $9.99**, adds 8-direction locomotion and more deaths/emotes. Not needed for the plan above, because the free Mesh2Motion add-on clips cover strafing and extra deaths (section 3.1).
3. Only if you ever want real bodies: UBC Source $19.99 (itch page) and Modular Outfits, about $20 (from the earlier survey, not rechecked) (section 3.5). I recommend against.

## 2. Licensing ground rules and risks found

| Source | License found (quoted from the asset's own page) | Redistribute in a public repo? |
|---|---|---|
| Quaternius packs (UAL, UAL2, UBC, Modular Outfits, Fantasy Props, Stylized Nature) | itch.io license field on the UAL and UBC pages: **"Creative Commons Zero v1.0 Universal"**; page text "Free to use in personal, educational and commercial projects." The quaternius.com page of every pack shows "License CC0", and **all six zips** contain a license file reading "CC0 1.0 Universal (CC0 1.0) Public Domain Dedication" (I opened each) | Yes |
| Mesh2Motion (repo README) | "The art assets (3d models, rigs, animations) are all licensed under CC0." | Yes |
| Poly Haven | "Anyone can then use the work in any way and for any purpose, including commercial purposes"; "You do not need to give credit or attribution" | Yes |
| Kenney | `License.txt`: "License: (Creative Commons Zero, CC0) ... free to use in personal, educational and commercial projects" | Yes |
| KayKit Character Animations (itch) | License field: "Creative Commons Zero v1.0 Universal" | Yes |
| MakeHuman / MPFB | "All core assets (the base mesh, targets, skins...) are shared under CC0"; third-party assets "may be under a different license" | Core yes; community clothes and hair per item |
| Sketchfab / Objaverse models I picked | License label **"CC Attribution"** (CC BY 4.0) on the live Sketchfab API. The Objaverse snapshot metadata says `license: by` for **all 27** candidates I checked (the two agree) | Yes, with attribution (section 2.2) |
| Zenodo amphora scans | Record metadata `cc-by-4.0` | Yes, with attribution |

### 2.1 Quaternius license drift (read this)

Quaternius's website now has a license page titled **"Quaternius Asset License (QAL) v1.0, last updated 8/28/2026"**. Key text:

> "You just can't resell or redistribute the assets themselves as assets." ... "Changes will not apply retroactively to Assets you've already obtained under an earlier version; the version in effect at the time you obtained the Assets governs your use of them."

The newest pack I found on the QAL (Bestiary, v1.1, 29/8/2026) says so on its itch page. **Every pack recommended here predates it and says CC0** on its pack page and in its zip: Stylized Nature 2024-07-30, Fantasy Props 2025-06-02, UBC 2025-12-16, Modular Outfits 2026-01-29, UAL and UAL2 2026-06-16. CC0 is irrevocable for copies already obtained, so we are safe, but:
- Vendor the files once and record the itch page's license text and date in the manifest (the manifest rule from `assets.md` section 7 already covers this).
- **Do not pull Quaternius packs released after 2026-08-28** without rereading the license. A public repo that serves raw GLBs is arguably "redistribution" under QAL's wording.
- The site's own FAQ still says "All models are under the CC0 License", so the site itself is inconsistent. Treat the itch page plus in-zip `License.txt` as the record.

### 2.2 CC-BY rules (what attribution means)

CC BY 4.0 needs, for each asset: **title, author, source link, license link, and a note if we changed it** ("decimated, textures resized"). Commercial use and redistribution are allowed. Appendix E has ready-to-paste lines. The game needs a credits screen or at least `CREDITS.md`.

### 2.3 Rejected, with reasons

| Source | Why not |
|---|---|
| Pinterest, Google Images | Unknown licenses, and they are images, not models |
| Mixamo (raw FBX) | Adobe terms forbid redistributing the raw files (as in `assets.md`) |
| meshy.ai "CC0" tag pages | AI-generated models with unverifiable provenance |
| CGTrader, TurboSquid, BlenderKit "free" | "Royalty free" licenses forbid redistributing raw files |
| CMU mocap, Rokoko free clips | Ambiguous redistribution (see `assets.md`) |
| Open Source Avatars (CC0 VRM) | License is fine, but they are anime and crypto-style avatars |
| Sketchfab items labelled NC, ND or SA | Per the rules in `assets.md` |

## 3. Characters and animation

### 3.1 What exists

| Candidate | License | What it is | Verdict |
|---|---|---|---|
| **Quaternius Universal Animation Library** (free "Standard") | CC0 | 15 MB zip, `UAL1_Standard.glb`: 43 clips incl. `A_TPose`, 65-joint Unreal-style skeleton, T-pose bind. Idle, Walk, Walk_Formal, Jog, Sprint, Crouch, Jump x3, Swim_Fwd, Swim_Idle, Sword_Attack, Sword_Idle, Sitting x4, Interact, PickUp_Table, Hit_Chest, Hit_Head, Death01, Idle_Talking, Idle_Torch, Dance, Driving, Push, Roll, Fixing_Kneeling, plus pistol and spell clips we skip | Use |
| **Quaternius UAL 2** (free "Standard") | CC0 | 17 MB zip, 43 clips: Sword_Regular_A/B/C (A and B have `_Rec` recoveries), Sword_Regular_Combo, Sword_Heavy_Combo, Sword_Block, Idle_Shield(+Break), Shield_OneShot, Shield_Dash, Melee_Hook, OverhandThrow (pilum), TreeChopping, Farm_Harvest/PlantSeed/Watering, Walk_Carry, Chest_Open, Consume, LayToIdle, Hit_Knockback, ClimbUp_1m, Yes | Use |
| **Mesh2Motion** (`human-base-animations.glb` 87 clips = UAL1+UAL2 repackaged; `human-addon-animations.glb` **75 more**) | CC0 per README | Add-on clips verified by name: Death_A/B/C, Defend, Fighting Idle, Strafe_left/right, Walk_Backwards, Dodge x3, Idle Hurt, Idle_Subtle, Idle Listening, Greeting, Head Nod, Kneeling Tired, Sleeping, Bow + bow draw/release, Climb Ladder, Crawl, Throw Object, Victory, Meditate. Skeleton: 66 joints with renamed bones (`head`, `head_leaf`, `ball_leaf_*`) | Use selectively (see caveat) |
| Quaternius **Universal Base Characters** (free "Standard") | CC0 | 122 MB zip: only **Superhero Male + Female** (heroic proportions), 5 hairstyles + eyebrows. Same 65-joint skeleton as UAL, so UAL clips play on it with **no retargeting** (rendered, section 3.4) | Do not swap (3.4) |
| Quaternius **Modular Character Outfits - Fantasy** (free "Standard") | CC0 | 280 MB zip: Peasant and Ranger outfits, male and female, as modular parts (body, arms, legs, feet, hood, pauldrons, belts) | Not Roman (3.5) |
| Mesh2Motion mannequins `male.glb`/`female.glb` | CC0 | Faceless mannequin, 13,757 tris, 534 KB, 66 joints | Test dummy only |
| KayKit Character Animations | CC0 | 161 clips (150+ free), Rig_Medium/Large, built for chunky KayKit characters | Skip: different rig, toy style |
| Kenney characters | CC0 | Toy-like | Skip |
| MakeHuman / MPFB | CC0 core | Customizable realistic humans; needs Blender, system clothes are modern, no Roman garments | Option for a human artist, not for this plan |
| Sketchfab rigged Roman characters | CC-BY | I searched legionary, centurion, citizen, toga, gladiator, "Roman woman": **nothing rigged and usable.** Hits were unrigged armor mannequins, museum busts and fantasy-game characters | None exist |

**Caveat on the Mesh2Motion add-on set.** The README claims CC0 for all animations, and the assets repo holds one `.blend` per clip (`animation-human-death-A.blend`, etc.), consistent with the author's own work. But many clip names read like common Mixamo-style names, and I cannot prove otherwise. For the core plan use Quaternius's own UAL/UAL2 (explicit `License.txt`, clear authorship). Pull only the specific add-on clips we need (`Death_A/B/C`, `Strafe_*`, `Walk_Backwards`, `Defend`, `Idle Hurt`, `Sleeping`, `Bow*`) and eyeball each. The Mesh2Motion repo history for the add-on file ends 2026-07-08, before QAL.

### 3.2 Real animation versus our procedural animation

Our avatars (see `docs/modules/avatar.md`) animate in code: spline-keyed poses, foot-IK gait with 8 directions, arm IK for shields, spears and bows, 12 idle loops. That is good engineering, and it already handles weapon contact. Its weak spots, from what I saw rendered and from the clip lists:
- **No swim animation at all.** `src/world/water/swim.ts` moves the player through the Tiber and sets `player.swimming`, but nothing under `src/actors/avatar` animates it, so the avatar presumably just walks through the water.
- Idle loops are generic poses (the toga man in `shots/proc_patrician-man.png` stands in a stiff "arms out" idle).
- Death, hit and sit-transition coverage is thin compared with a hand-keyed library: three death falls, no sit enter/exit, no get-up (`LayToIdle`), no climb, no carry-walk, no talk-with-gestures.

UAL fills exactly those gaps, and keeps working with our crossfade layers because the retargeted result is an ordinary `THREE.AnimationClip`.

### 3.3 Proof: UAL clips driving our procedural avatars

Rendered output: `shots/retarget1.png` and `shots/retarget2.png`. Across the two renders, procedural plebeians, a matron, a legionary, a murmillo, a priest and a Dacian play `Walk_Loop`, `Idle_Loop`, `Sitting_Talking_Loop`, `Idle_Talking_Loop`, `Sword_Attack`, `Sword_Regular_A`, `Idle_Shield_Loop`, `TreeChopping_Loop`, `Farm_Harvest`, `Walk_Carry_Loop`, `Dance_Loop` and `Death01`. Poses read correctly on our 25-bone rig with period clothes intact.

**Algorithm** (about 100 lines; harness in `retarget.html`). Our rig's bind pose has identity rotations with the arms hanging; the mannequin's bind pose is a T-pose. So a plain world-delta transfer does not work for the arms. The fix is to align each target bone to the source's bind direction first:

```js
// bone map: our name -> UAL name (spine uses spine_01, chest uses spine_03; fingers stay at rest)
const MAP = { hips:'pelvis', spine:'spine_01', chest:'spine_03', neck:'neck_01', head:'Head',
  shoulderL:'clavicle_l', upperArmL:'upperarm_l', forearmL:'lowerarm_l', handL:'hand_l',
  thighL:'thigh_l', shinL:'calf_l', footL:'foot_l', toeL:'ball_l' /* ...and the R side */ };
// Once, at setup: for each bone with a child, rotate the target's rest direction onto the source's
// bind direction ("Wref" = our bone's world orientation inside the source's bind pose).
Wref[b] = fromUnitVectors(targetRestDir(b), sourceRestDir(b)) * Wt0[b];
// Each baked frame, in hierarchy order:
Dq   = Ws(b,t) * inverse(Ws0(b));          // world rotation since the source's bind pose
Wt   = Dq * Wref[b];                       // desired world orientation of our bone
bone.quaternion = inverse(Wt(parent)) * Wt;
hips.position   = hipsRest + (pelvisWorld(t) - pelvisWorld0) * (ourHipHeight / srcHipHeight);
```

**Known limits of the prototype**: no foot planting (our IK still applies on top for locomotion), the shield and weapon sockets are not driven (the controller does that), hit-frame times (`onHit`) must be authored per clip (for example `Sword_Regular_A` at about 0.35 s), and the matron's skirt flares oddly when seated (skirt weights were tuned for our own sit pose). I only inspected still frames, so motion quality (blends, foot sliding) is unverified.

**Cost to ship**: bake offline in node (`AnimationMixer` plus the function above, sampled at 30 fps) to `AnimationClip` JSON for our 21 mapped bones. All 86 clips come to about 1.45 MB raw float32 (average 1.6 s); a 40-clip game subset is about 0.7 MB raw (computed) and, by my estimate, 0.3 to 0.4 MB quantized and gzipped (not measured). Smaller than the 3.8 MB meshopt GLB that `assets.md` estimated, because we drop the mesh and fingers. Estimated 2 to 3 days including clip curation, event timings and tests.

**Recommended split**: keep procedural locomotion, combat and weapon IK. Add retargeted clips for swim, sit/stand transitions, `LayToIdle`, deaths (UAL `Death01` plus Mesh2Motion `Death_A/B/C`), hit reactions, `Idle_Talking`, work (`TreeChopping`, `Fixing_Kneeling`, `Farm_*`), carry-walk, climb and emotes. For NPC schedules, offer them as new `IdleLoop` values or replacements inside `idles.ts`.

### 3.4 Real base bodies versus ours (honest comparison)

Rendered: `shots/real_lineup1.png` (UBC male and female, the mannequin, MCO peasant) and `shots/real_poses.png` (UBC playing UAL clips); ours: `shots/proc_*.png`, `shots/avatars_default.png`.

| Aspect | Ours (procedural) | Real (UBC + MCO, free tier) |
|---|---|---|
| Period fit | Toga, tunica, stola, paenula, lorica segmentata, helmets, gladiator kits, all accurate | Medieval-fantasy: trousers, boots, pauldrons, hoods. Trousers (braccae) are right only for Dacians and Germans |
| Faces and hands | Simple, stylized (eyes, nose, brows); mitten hands at distance | **Clearly better**: sculpted faces, eyebrows, real hair meshes, proper hands |
| Proportions | Slim, 1.64 m men and 1.52 m women, per the GDD | "Superhero" free bodies: 1.81 m, heavy musculature (the "Regular" and "Teen" bodies are in the paid tier) |
| Triangles | 4 to 5k per civilian, **1 draw call** | 14.3k (male) to 15.1k (female) bare; Peasant outfit alone 12.9k, Ranger 27k; **3 draw calls** (body, hair, eyes) unless merged |
| Variety | Unbounded (`randomAppearance`: age, build, skin, hair, garments, armor, 26 roles) | 2 bodies and 5 hairstyles free; more bodies and 20 hairstyles in the paid tiers |
| Integration | Equipment sockets, first-person arms, LOD, appearance swap, armor, all built | Would need all of that rebuilt on a new rig: weeks |
| Shipped size | n/a (code) | 436 KB (UBC male, 1k WebP + meshopt, measured), 471 KB (Peasant outfit) |

**Verdict.** Swapping bodies would trade accurate Roman clothing for a nicer face on a mannequin in a medieval tunic. Blending (real heads on our bodies, or our garments on a real body) is a large rework: our garments are lofted around *our* body surface, so they would have to be regenerated for a different mesh, and the style gap between the two would show. **Don't do it.** If real faces ever matter (dialogue close-ups), the cheap compromise is to improve our procedural faces rather than import foreign heads.

### 3.5 If the owner still wants real bodies later

The free UBC tier gives only the Superhero bodies. The Modular Outfits readme says "only the head of the model is required" and its textures are named `T_Regular_Male_*`, which suggests the outfits are fitted to the Regular body from the paid UBC tier (my inference). Roman use would need a human artist in Blender to turn the Peasant tunic into a knee-length tunica, remove the trousers, and add togas and stolas. License is CC0 throughout, so legally clean.

## 4. Props

### 4.1 Roman hero props (CC-BY, curl-downloadable via Objaverse)

The Objaverse route is a convenience: the GLB is the same Sketchfab-processed file you would get from Sketchfab's own download button, which needs a free login.

The **Objaverse 1.0** dataset (Allen AI, on Hugging Face, no login or gating) mirrors about 800K Sketchfab models that carry Creative Commons licenses, with a per-object license in its metadata shards. README: "Individual objects in Objaverse are all licensed as creative commons distributable objects ... The metadata will provide the license for each object." For the picks below I checked the live Sketchfab license **and** the Objaverse snapshot license; they agree (`by` for all). Download recipe: Appendix B. Keep an attribution and a metadata snapshot in the manifest; the HF copy could vanish, so vendor the files once.

Not in Objaverse (Sketchfab login needed, optional owner action): Albert Gregl's **"Roman furniture: Roman villa pack"** (uid `bc761cc3...`, CC-BY, 29,900 faces: amphorae, marble table, braziers, tripod stand, 26 MB glTF). Andy Woodhead's "Roman officer - body armour" (37k faces) and "Roman Pottery workshop" (33k faces) are also CC-BY and not in Objaverse.

Rendered in `shots/objv_roman_props.png`; Sketchfab thumbnails in `shots/sf_props_thumbs.png`.

| Item | Author | Faces | Raw GLB | Notes |
|---|---|---|---|---|
| **Roman Scutum Shield** | DennisVanMalderen | 1,466 | 4.4 MB | Winged-thunderbolt design, 1024 PBR. About 1 m tall. Best candidate to replace the procedural scutum in first person |
| **Ancient Roman gladius** (sword + sheath) | Samize | 3,104 | 2.0 MB | 1024 PBR, "correctly scaled". Also Samize's "Sword of Tiberius" (Mainz type, 10.5k faces, 2.5 MB). Mainz is early-Imperial; by 113 the Pompeii type was standard, but both read as a gladius |
| **Roman Helmet** | Vasco Amorim de Lemos | 11,290 | 2.1 MB | Officer-style crested helm. Decimate to about 3k |
| **Roman Marble Table** | Opus Poly | 3,016 | 3.4 MB | Photogrammetry-based scan of a three-legged table in the House of the Ceii, Pompeii, with lion legs |
| **Roman Oil Lamp (Low Poly)** | Opus Poly | 858 | 2.3 MB | Retopologized; the high version is 10,000 faces. About 11.5 cm long, a scan of a replica |
| **Amphora** | Anskar | 8,638 | 1.3 MB | Clean ceramic amphora, 1024 color only. Decimate to about 2k |
| **Wine strainer**, **Silver cup** | Allard Pierson (museum) | 7,958 / 15,395 | 1.7 / 1.5 MB | Real museum objects; decimate hard |
| **Roman Bust** | Viktor Pecsi | 13,604 | 3.3 MB | Recreation of an antique bust (original in the British Museum). Decimate for shrines and gardens |
| Roman Jug | marquestomas96 | 2,934 | 1.0 MB | Student model, plain; fine as filler |
| Not recommended | VaLiuM "Roman Amphora" (a fragment lying on ground), MicroPasts amphorae (untextured, from line drawings, 50k+ faces), Tactical_Beard "Roman Centurion Armor" (a mannequin; unclear provenance), DireRaven scutum (no description) | | | |

Each model's scale is arbitrary (Sketchfab normalizes), so import with a scale factor. One file used the old `KHR_materials_pbrSpecularGlossiness` extension and needed `gltf-transform metalrough` (only the rhcreations pine); all others loaded as is.

**Amphora scan caveat.** The Artec Eva shipwreck amphora on Zenodo (CC-BY, 131k faces, `shots/amphora_scan.png`) decimates to about 6k faces and is authentic, but it is coated in sea concretion. Useful only as Tiber-bed or wreck dressing.

### 4.2 Quaternius Fantasy Props MegaKit (CC0)

Free "Standard" tier: **94 models, 121,603 triangles in total (average 1,293)**, glTF, **4 shared 2048 trim-sheet textures** (props, furniture, metal, cloth). Rendered in `shots/q_props.png` and `shots/q_props_small.png`. Looks like hand-painted medieval fantasy: pleasant, but cartoonier than our scene, and we already generate 40 prop kinds procedurally (amphorae, doliums, carts, stalls, baskets, braziers).

Worth taking for things we do **not** generate: `Dummy` (training post / palus for the gladiator school, 2,858 tris), `WeaponStand` (2,084), `Workbench` (1,368), `Anvil` (750), `Peg_Rack`, `Rope_1..3`, `Banner_1/2`, `Cage_Small`, `Bag` (a good sack), `Stool`, `Bench`, `Table_Large`, `Chest_Wood` (2,546), `Bucket_Wooden_1` (976), `Pickaxe_Bronze`, `Axe_Bronze`, `Cauldron`, `Torch_Metal`, `Scroll_1/2`, `Coin_Pile`. Skip the barrels (barrels appear in Gaul and Germania; amphorae and dolia dominated Rome), the `Sword_Bronze`, `Shield_Wooden`, bottles, potions, mugs, books and modern-looking beds. The vases are medieval pots.

### 4.3 Poly Haven models (CC0)

Realistic, 1k textures, glTF. API: `https://api.polyhaven.com/assets?t=models` (521 models) and `/files/<id>`. Mostly modern or industrial; fine for a few close-up items. Measured 1k downloads (all sizes include textures): `wooden_bucket_01` 2.3 MB (5,116 tris), `wicker_basket_01` 2.7 MB (**22,276 tris**), `ceramic_pot` 1.6 MB (3,592), `wooden_crate_01/02` 2.3 MB, `wooden_stool_01` 1.0 MB, `wooden_ladder` 2.6 MB, `hatchet` 2.0 MB, `rusted_spade_01` 2.4 MB, `picke_dirty_01` 2.2 MB, `stone_fire_pit` 2.5 MB, `wine_barrel_01` 0.9 MB, `marble_bust_01` 0.9 MB (Renaissance style, as noted in `assets.md`). **Avoid** `jug_01` (a modern floral jug, rendered in `shots/ph_props.png`), `ceramic_pot` (modern stoneware), `vintage_oil_lamp` (Victorian) and `spinning_wheel_01` (medieval; Romans used a distaff and spindle). Rocks (`rock_07`, `rock_09`, `boulder_01`, `stone_01`, `rock_moss_set_01`) are the most useful of the set for terrain dressing.

### 4.4 Rejected prop sources

Kenney and KayKit (toy style; Kenney rendered in `shots/kenney_nature.png`), Open Game Art CC0 packs (mostly repackaged Quaternius or Kenney, as in `assets.md`), CGTrader "free" models (license forbids redistributing raw files).

## 5. Vegetation

**Reality check.** Not one CC0 source has an umbrella pine, cypress or olive. I listed all 20 tree and 57 plant models on Poly Haven (none are Mediterranean; `pine_tree_01` alone is 958 MB at 1k and `tree_small_02` 101 MB), and rendered Quaternius Stylized Nature (`shots/q_nature.png`: spruce-like "Pine", temperate and red-leaved broadleaves) and Kenney (`shots/kenney_nature.png`: flat low-poly). None match the silhouette of Rome.

### 5.1 CC-BY hero trees (downloadable via Objaverse, Appendix B)

Rendered in `shots/objv_trees.png`, `shots/objv_pine_lod.png`, `shots/objv_olive_lod.png`. All three decimate to instancing-friendly sizes with no visible change at game distance.

| Tree | Author | Faces raw | After processing | Verdict |
|---|---|---|---|---|
| **Stone / umbrella pine** ("Umbrella pine") | Alwoke | 73,764 (2 trees at 36.6k each, plus a ground patch) | **about 5.3k tris per tree, 527 KB for both** (`simplify --ratio 0.15`, 512 px WebP, meshopt) | **Best find.** Proper umbrella canopy with needle cards. Delete the ground patch. Single BLEND material atlas, so sort and alpha-test need care |
| **Old olive tree** | massive-graphisme | 67,438 | **about 14.7k tris, 604 KB** (`--ratio 0.12`); can go lower | Convincing gnarled trunk and silvery leaf cards. Alternate: "Olive Tree Portugal" (CeDRI, 78k faces, 22.8 MB raw, from the Oleachain project) |
| **Italian cypress** ("Cypress v.2") | SCADL & Co | 4,406 | no decimation needed; 247 KB (512 px WebP + meshopt) | Good slender form, handpainted. Also "Cypress" (31.7k) by the same authors |
| Umbrella Pine | rhcreations | 13,208 | n/a | Windswept and noisy, needs a spec-gloss conversion. Skip |
| Cypress Tree | Smaug | 360 | n/a | Potted, 128 px texture. Skip |

No usable plane tree, oleander, laurel or fig exists as a standalone model. Keep our procedural versions of those.

**How to use them**: place the real pine, olive and cypress at hero spots (forum gardens, Palatine, the Appian Way, near spawn) as `InstancedMesh` with 2 LODs, and keep `src/arch/vegetation/species.ts` for bulk scatter and the horizon. Wind needs a vertex-shader sway like the one the procedural trees already use. I did not test instanced performance; budget about 5k tris times the visible count (200 pines would be about 1M tris, so cap or LOD).

### 5.2 Leaf atlases for the procedural trees (CC0, Poly Haven)

The procedural pine canopy reads as a dark blob (`docs/images/street.jpg`). Poly Haven publishes photo-scanned **leaf and needle atlases with alpha maps** in each plant's file set (`Diffuse`, `Alpha`, `nor_gl`, `arm`, all 1k). Rendered in `shots/ph_foliage_tex.png`. Candidates: `wild_rooibos_bush` (long needle bundles, a reasonable stand-in for stone-pine fascicles), `island_tree_02` leaves (elongated broadleaf for laurel, oleander, olive-like), `searsia_lucida` (oval leaves for laurel and fig), `shrub_04` (narrow leaves). Botanically none are the right species, so tint them. About 1 to 2 MB each before re-encoding. Cheap upgrade: replace the vertex-colored foliage blobs with alpha-tested leaf cards.

### 5.3 Ground cover (CC0, Poly Haven; optional)

For the "bland terrain" feedback. `grass_medium_01/02` (3.1 / 0.8 MB, `grass_medium_02` is 7,842 tris), `grass_bermuda_01` (1.5 MB), `shrub_02` (2.0 MB, **27,254 tris**, spindly willowherb-like), `shrub_03/04`, `dandelion_01`, `celandine_01`, `periwinkle_plant`, `nettle_plant`, `fern_02`, `wild_rooibos_bush` (2.5 MB). These are photo-realistic and **heavy** (thousands of triangles per plant); each needs decimating to a few hundred triangles (or an imposter card) before scattering. Quaternius Stylized Nature grass tufts (155 to 622 tris, CC0) are cheap but cartoonish, so I would not mix them with Poly Haven realism.

## 6. Suggested order of work

1. **Hero kit (S):** vendor the CC-BY scutum, gladius and helmet through Appendix B and E; match `WEAPON_INFO.gripTilt`, shield socket and size; keep the procedural versions as the LOD or fallback.
2. **Animation retarget (M):** write the bake script (Appendix D), vendor UAL and UAL2 plus the chosen Mesh2Motion add-on clips, register swim, sit, death, hit, talk and work clips, hook `onHit` times.
3. **Stone pine, olive, cypress (M):** decimate per Appendix C, add an instanced scatter with wind and 2 LODs at hero locations.
4. **Roman vignette props (S):** table, lamps, amphora, strainer, cup, bust for the domus and tavern fabric.
5. Leaf atlases, ground cover and Quaternius clutter as time allows.

**Not verified.** I did not test Safari/WebKit, instanced-tree performance, or hands-on gripping of the real weapons against our arm IK. I judged Sketchfab provenance from author descriptions and kept to authors who describe their own modelling or scanning. Real license text lives on each model page; the API labels and Objaverse metadata agree, but I did not open every page in a browser.

---

## Appendix A: Verified facts used above

- UAL1_Standard.glb: 43 animations, 65 joints (`root, pelvis, spine_01..03, neck_01, Head, clavicle_l, upperarm_l, lowerarm_l, hand_l, index_01_l ...`), T-pose bind. UAL2_Standard.glb: 43 animations, same skeleton.
- Mesh2Motion `male.glb`: 13,757 tris, 66 joints, 534 KB. `human-base-animations.glb` (87 clips, 5.66 MB), `human-addon-animations.glb` (75 clips, 5.29 MB), pinned commit `79f3f61a9852ef70234a5a4a7c13ed87f7a71833` (as in `assets.md`). Files last changed 2026-07-08.
- UBC Superhero Male: 14,318 tris (body 12,566 + hair/eyes), 2048 px PNG textures, 15.5 MB as shipped, 436 KB after `resize 1024 / webp 80 / meshopt medium`.
- Unzipped Quaternius `glTF` folders: Fantasy Props 94 models, 42 MB; Stylized Nature 68 models, 48 MB (free tier: 68 of 116).
- Poly Haven API model sizes via `GET https://api.polyhaven.com/files/<id>` -> `gltf.1k.gltf.include`.
- Objaverse license metadata: `https://huggingface.co/datasets/allenai/objaverse/resolve/main/metadata/<shard>.json.gz`, path index `object-paths.json.gz`.

## Appendix B: Download recipes

**Quaternius free tier from itch.io, without a browser** (replays the "No thanks, just take me to the downloads" click path; three requests; verified 2026-10-04 for UAL, UAL2, UBC, Modular Outfits, Fantasy Props and Stylized Nature; fragile if itch changes its markup):

```python
#!/usr/bin/env python3
# itchdl.py <creator> <slug> [outdir] [--list]
import json,re,subprocess,sys,os,html
cr,slug=sys.argv[1],sys.argv[2]; out=sys.argv[3] if len(sys.argv)>3 and sys.argv[3]!='--list' else '.'
cj=f'/tmp/itchcj_{slug}.txt'; base=f'https://{cr}.itch.io/{slug}'
def curl(*a): return subprocess.run(['curl','-sL','-c',cj,'-b',cj,*a],capture_output=True,text=True).stdout
tok=re.search(r'<meta name="csrf_token" value="([^"]+)"',curl(base)).group(1)
dl=curl(json.loads(curl('-X','POST',base+'/download_url','--data-urlencode','csrf_token='+tok,'-H','X-Requested-With: XMLHttpRequest'))['url'])
tok2=re.search(r'<meta name="csrf_token" value="([^"]+)"',dl).group(1)
ids=re.findall(r'data-upload_id="(\d+)"',dl)
names=[html.unescape(re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',u)).strip()) for u in re.findall(r'<div class="upload">(.*?)</div>\s*</div>\s*</div>',dl,flags=re.S)]
for uid,n in zip(ids,names):
    print(uid,n)
    if '--list' in sys.argv: continue
    url=json.loads(curl('-X','POST',f'{base}/file/{uid}?source=game_download','--data-urlencode','csrf_token='+tok2,'-H','X-Requested-With: XMLHttpRequest'))['url']
    subprocess.run(['curl','-sL','-o',os.path.join(out,f'{slug}_{uid}.zip'),url])
```

Slugs: `universal-animation-library`, `universal-animation-library-2`, `universal-base-characters`, `modular-character-outfits-fantasy`, `fantasy-props-megakit`, `stylized-nature-megakit` (creator `quaternius`). Save each pack's itch license text and date next to the vendored files.

**Objaverse (CC-BY / CC0 Sketchfab models):**

```bash
# once: path index (19.8 MB gz); look up the uid to get "glbs/<shard>/<uid>.glb"
curl -sL -o object-paths.json.gz https://huggingface.co/datasets/allenai/objaverse/resolve/main/object-paths.json.gz
# the model:
curl -sL -o scutum.glb https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-071/d67564c8980b4e84acde74144da941ea.glb
# its license (shard = same "000-071"): json.gz of {uid: {license, name, user, ...}}
curl -sL https://huggingface.co/datasets/allenai/objaverse/resolve/main/metadata/000-071.json.gz | gunzip | jq '."d67564c8980b4e84acde74144da941ea".license'   # "by"
```

Verified picks (full uid; HF path; faces):

| Model | uid | Path | Faces |
|---|---|---|---|
| Alwoke, Umbrella pine | `b263487bab864018a92b609882ce7989` | `glbs/000-126/` | 73,764 |
| massive-graphisme, Old olive tree | `6328df8a0f214143a880a72b86db2ab4` | `glbs/000-136/` | 67,438 |
| CeDRI, Olive Tree Portugal | `e0b57e421ac546c6b7e4cb563f524640` | `glbs/000-114/` | 78,195 |
| SCADL, Cypress v.2 | `bdb2ae463ed644f0be9d51371ddf63c5` | `glbs/000-134/` | 4,406 |
| SCADL, Cypress | `877cf2f6e001422c8233edb9c45162dc` | `glbs/000-145/` | 31,702 |
| DennisVanMalderen, Roman Scutum Shield | `d67564c8980b4e84acde74144da941ea` | `glbs/000-071/` | 1,466 |
| Samize, Ancient Roman gladius | `7261d334924f4a9b835ef4b15c1e16d0` | `glbs/000-039/` | 3,104 |
| Samize, Sword of Tiberius | `3b2b0f2e927d4c3eb80a07ec786e9668` | `glbs/000-110/` | 10,548 |
| Vasco Amorim de Lemos, Roman Helmet | `fe4dc3a4c6a141b795c97e2e94b336a3` | `glbs/000-028/` | 11,290 |
| Opus Poly, Roman Marble Table | `ae18ba9db0f34eab9b8af5250540b994` | `glbs/000-141/` | 3,016 |
| Opus Poly, Roman Oil Lamp (Low Poly) | `2c86ea5fb88543529816df44cfccc3ac` | `glbs/000-127/` | 858 |
| Opus Poly, Roman Oil Lamp (hi) | `45636e55ecc842bd8b107ad7b284d428` | `glbs/000-031/` | 10,000 |
| Anskar, Amphora | `174e9df0d4c94928ac1b03a972051966` | `glbs/000-152/` | 8,638 |
| Allard Pierson, Wine strainer | `b57ea12bc3684814983dcb8d01d992b1` | `glbs/000-131/` | 7,958 |
| Allard Pierson, Silver cup | `89e15683170f427b97cd4f9397908ca9` | `glbs/000-128/` | 15,395 |
| Viktor Pecsi, Roman Bust | `4f183b3891b7413e852c058de6589be0` | `glbs/000-089/` | 13,604 |
| marquestomas96, Roman Jug | `ea22d06f2bd54529a54da54fa8d1c7ca` | `glbs/000-077/` | 2,934 |

Canonical model page for each: `https://sketchfab.com/models/<uid>`.

**Poly Haven models:** `GET https://api.polyhaven.com/files/<id>`; `gltf["1k"].gltf.url` plus every URL in `.include` (keep relative paths).

## Appendix C: Processing recipes (measured)

```bash
gt() { npx -y @gltf-transform/cli@4 "$@"; }
gt simplify in.glb out.glb --ratio 0.15 --error 0.05     # pine: 36.6k -> 5.3k tris per tree, looks the same at game range
gt resize   in.glb out.glb --width 512 --height 512      # leaf cards fine at 512; hero props at 1024
gt webp     in.glb out.glb --quality 80
gt meshopt  in.glb out.glb --level medium                # needs three's MeshoptDecoder
gt metalrough in.glb out.glb                             # only for old KHR_materials_pbrSpecularGlossiness files
```

| Asset | Raw | After |
|---|---|---|
| UBC Superhero male (1k) | 15.5 MB | 436 KB |
| MCO Male Peasant (1k) | 38.3 MB | 471 KB |
| Stone pine x2 + ground, 15% | 8.0 MB | 527 KB |
| Old olive, 12% | 6.2 MB | 604 KB |
| Cypress v.2, 512 px | 1.1 MB | 247 KB |

## Appendix D: Retarget and bake harness

`.claude/asset-staging/chars-props/retarget.html` (Vite-served; imports `createHumanoid`, `randomAppearance`, `BONES`, `PARENT` straight from `src/`) and `render2.mjs` (starts the repo's Vite server, plays a clip at time `t`, screenshots). To turn it into a bake script, loop `t` over `0..duration` at 30 fps, record `bone.quaternion` per mapped bone and `hips.position`, and emit one `QuaternionKeyframeTrack` per bone named with our camelCase names (`upperArmL.quaternion`). Load UAL with `GLTFLoader.parse` in node.

## Appendix E: Attribution block (CC-BY items; paste into `CREDITS.md` for whatever ships)

```markdown
### CC BY 4.0 models (https://creativecommons.org/licenses/by/4.0/)
Each was decimated, texture-resized and converted to WebP/meshopt for real-time use.
- "Umbrella pine" by Alwoke (alwoke78), https://sketchfab.com/models/b263487bab864018a92b609882ce7989
- "Old olive tree" by massive-graphisme, https://sketchfab.com/models/6328df8a0f214143a880a72b86db2ab4
- "Cypress v.2" by SCADL & Co, https://sketchfab.com/models/bdb2ae463ed644f0be9d51371ddf63c5
- "Roman Scutum Shield" by DennisVanMalderen, https://sketchfab.com/models/d67564c8980b4e84acde74144da941ea
- "Ancient Roman gladius sword" by Samize, https://sketchfab.com/models/7261d334924f4a9b835ef4b15c1e16d0
- "Roman Helmet" by Vasco Amorim de Lemos, https://sketchfab.com/models/fe4dc3a4c6a141b795c97e2e94b336a3
- "Roman Marble Table" and "Roman Oil Lamp (Low Poly)" by Opus Poly, https://sketchfab.com/models/ae18ba9db0f34eab9b8af5250540b994 and https://sketchfab.com/models/2c86ea5fb88543529816df44cfccc3ac
- "Amphora" by Anskar, https://sketchfab.com/models/174e9df0d4c94928ac1b03a972051966
- "Wine strainer" and "Silver cup" by Allard Pierson, https://sketchfab.com/models/b57ea12bc3684814983dcb8d01d992b1 and https://sketchfab.com/models/89e15683170f427b97cd4f9397908ca9
- "Roman Bust" by Viktor Pecsi, https://sketchfab.com/models/4f183b3891b7413e852c058de6589be0

### CC0 (credited as a courtesy)
- Universal Animation Library 1 and 2 (Standard), Fantasy Props MegaKit (Standard) by Quaternius, https://quaternius.com (CC0 1.0).
- Selected add-on animations by Mesh2Motion (Scott Petrovic), https://github.com/Mesh2Motion/mesh2motion-app (CC0 1.0).
- Plants, leaf atlases and rocks from Poly Haven (https://polyhaven.com), CC0 1.0.
```

(Drop any line for an asset that does not ship; add Appendix B's rows for any other model that does.)

## Appendix F: Scratch folder index

`.claude/asset-staging/chars-props/` (git-ignored, about 1.3 GB; safe to delete after vendoring): `x/` unzipped Quaternius packs, `objv/glb/` the Objaverse GLBs (plus `*_s/_f` decimated test outputs), `m2m/` Mesh2Motion files, `ph/`, `phtex/` Poly Haven samples, `zen/` Zenodo amphorae, `kenney/` Nature Kit, `shots/` all renders referenced above, and `itch/itchdl.py`.
