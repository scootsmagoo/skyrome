# Realistic characters (avatar-real)

Wave-1 prototype of the realistic body: two sculpted bodies (CC0 Human Base Meshes) rigged to the
game's own 25-bone skeleton, so `AnimationController`, sockets, IK, equipment and combat drive them
unchanged. Opt-in: `?scene=avatars&avatar=real` (all slots), `avatar=mix` (every second slot, next to
the procedural ones), `&bodies=1` (bare men and women of heights 1.50 to 1.95 m and all builds).
Since wave 2 (C2a) the realistic body is the default everywhere; `?avatar=classic` selects the procedural
one (see "Wave 2: integration and painted garments" below).

Files: `tools/characters/` (Blender pipeline), `src/actors/avatar/real/` (runtime),
`public/models/people/{male,female}.glb`, `public/textures/people/*.ktx2` (about 11 MB all told).

## Pipeline (`npm run characters`, `[male|female] [--no-bake]`)

Needs `.cache/hbm/` (unzip `hbm.zip` from https://mirror.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.4.1.zip),
Blender 5.1 and `basisu`. One body takes about 20 s.

1. `dump-rig.mjs` writes `rigs.json`: `computeRig` for the two reference bodies (man 1.75 m = the animation
   reference height; woman 1.62 m; both average build, adult). `real/refs.ts` must match.
2. `landmarks.py` (run by hand when landmarks change) writes `landmarks.json`: joint positions of the sculpt
   in its own A-pose. The male set is measured by hand from cross-section slices of the level-2 multires cloud
   (centroids of limb slices; elbow and knee where the silhouette turns); `preview_landmarks.py` renders them
   in x-ray over the body to check by eye. The female body has the male's topology (10 582 vertices, same
   order), so her landmarks are transferred through nearest-vertex offsets, plus two hand corrections.
3. `build_body.py <sex>`:
   - repacks the sculpt's UVs (9 x 4 UDIM tiles) into one 0..1 atlas (2 048 px, uniform density);
   - builds a temporary armature on the landmarks and heat-weights the cage (Blender `ARMATURE_AUTO`); then
     cleans the weights in numpy: a slanted plane splits neck and head (the game's head joint is at mouth
     level, so the jaw must follow the head), edge smoothing, extra smoothing near shoulder, hip, elbow and knee,
     4 influences;
   - LODs by collapse-decimation of the triangulated cage: **11 000 / 4 000 / 1 200 triangles**; UVs are
     projected again from the cage island by island (decimation smears them); weights are re-fitted from the cage;
   - bakes a tangent-space normal map from multires level 3 (677 k quads) onto each LOD (2 048 / 1 024 / 512), and
     one AO map from the detailed mesh itself (2 048, resized for the lower LODs);
   - **poses** every LOD into the game's bind pose: per bone a rigid frame (primary axis = bone, secondary = forward
     or up) maps the sculpt joint to the reference joint, with a scale along the bone so child joints land exactly,
     blended with the weights (linear blend skinning). The arms end up straight down at the `computeRig`
     x, the legs vertical, the feet flat, the head scaled to the reference head height;
   - eyes: two UV spheres at the measured eye centres, rigid to `head`;
   - exports one GLB: `Armature` with the 25 game bone names, meshes `<sex>_lod0..2` and `eyes`
     (POSITION, NORMAL, TANGENT, TEXCOORD_0, JOINTS_0, WEIGHTS_0).
4. `build.mjs` converts the maps with `basisu`: normals UASTC (ETC1S smears fine detail), AO ETC1S, no y-flip
   (the GLB UVs are glTF's top-left origin).

Axes: Blender (x, y, z) = game (x, -z, y); the glTF exporter's Y-up conversion is that exact map, so the GLB is in
game space (+Z forward, +X the figure's left, feet on y = 0).

## Runtime (`src/actors/avatar/real/`)

- `RealBody.ts`: `await loadRealBodies(renderer)` (GLTFLoader + KTX2Loader; the GLB skin is used only for the
  vertex weights, remapped to `B[...]` by joint name), then `applyRealBody(avatar)` returns a `RealBody`.
  It swaps `avatar.mesh.geometry/material` (the avatar keeps its own skeleton), adds an eye `SkinnedMesh` on the same
  skeleton, and `updateRealBodies(camera)` (call once a frame) picks the LOD by distance: LOD 1 beyond 14 m,
  LOD 2 beyond 40 m (hysteresis 5 %; the eyes are dropped at LOD 2). Geometry is cached per
  `sex|age|build|height(mm)` and ref-counted.
- `morph.ts` (pure, tested): the proportion morph. Per bone a diagonal scale around its own joint plus the joint
  move: `p' = sum w_i (J'_i + S_i (p - J_i))`; along the bone S is the ratio of the segment lengths (child joints land
  exactly on the target), across it the overall scale `s` times the girth ratio (`computeRig` girths relative to the
  reference's: arms, legs, neck, hips, waist/torso, shoulders; belly and bust scale only the front). Normals use the
  inverse-transpose, tangents the matrix.
- `skin.ts`: `MeshStandardMaterial` per (sex, LOD, skin colour) with the baked normal and AO maps, patched in
  `onBeforeCompile`: wrap lighting with a red terminator tint, a procedural pore detail normal from the bind-pose
  position (fades with screen-space derivatives), large blotches and a warm shift in creases (from the AO map).
  Specular AA is three's geometry-roughness term. Eyes: sclera, iris with streaks and limbal ring, pupil, all from
  an `eyeLocal` attribute (direction from the eye centre, pupil axis +Z), roughness 0.07 for the cornea highlight.
- `scenes/avatars.ts` (shared file, small edit): the `avatar=` / `bodies=` params above, async setup.

## Performance (M4 Max, headless Chromium)

30-person crowd plus the lineup and player (51 bodies), 9 m view: 55 draw calls, 195 k triangles (includes the
shadow pass and eyes), CPU 1.7 ms/frame; 60 renders with `gl.finish()` measure 0.46 ms each, against 0.37 to 0.77 ms
for the procedural crowd. The GPU is nowhere near its limit in the test bed, so see the report for what that does
and does not prove. Per body: about 2 draw calls at LOD 0/1 (body, eyes), 1 at LOD 2.

## Known limits of wave 1

- Bare bodies only (no clothes, hair, faces painted, helmets, gore): the bodies are anatomically unclothed, so
  wave 2 garments must land before this is the default.
- Armpit webbing when the arm is raised far above the shoulder (cheer, bow draw): the bind pose collapses the
  sculpt's open armpit (arms 22 degrees closer to the torso than sculpted). Needs a corrective (see wave 2).
- Fingers are rigid per bone group (4 fingers on `fingers`, index on `index`, thumb on the hand) and keep the
  sculpt's slight splay; grips look like blocks.
- The head pivots at the game's mouth-level joint, not at the skull base.
- Skin has no albedo painting (one tint plus blotches); ears and nose have no back-lighting term (no thickness map).
- Ages: `child` and `old` only scale the adult mesh (no proportions, no wrinkles).
- `HumanoidAvatar` still builds its procedural geometry first and `setAppearance` resets the body mesh: a real body
  must be re-applied after `setAppearance` (wave 2 hook below).
- In the avatars test bed the face shows blocky shading patches: that is the scene's 60 m, 2 048 px sun shadow map
  (3 cm texels) self-shadowing a face, not the body maps.

## Wave-2 contract

**Garments.** Rendered over the body from the same skeleton and the same rest pose, so a garment mesh is skinned
with the body's vertex weights. Two routes:
1. *Painted*: tunics, subligacula, braccae and armour trims are regions of the body's UV atlas (`<sex>_n0` atlas, 2 048)
   painted to an albedo/roughness texture, with a per-region offset along the normal (0.4 to 1.5 cm) done in the
   vertex shader from a `thickness` vertex attribute. Region masks come from the body's UV islands (arms, torso,
   legs), exported as vertex colours or masks by `build_body.py` (add a `--regions` step).
2. *Shells*: skirts, togas, pallae, cloaks and plate pieces are separate skinned meshes. Fit them with
   `morphBody` (same function, a garment's own `BodyArrays` in the reference pose) so they follow height and
   build. The existing lofts in `src/actors/avatar/build/` can be refitted: their anchors come from `rig.joints`,
   which the real body matches exactly.
Hide covered skin by a per-vertex `hide` mask (a second vertex attribute or a texture channel) to avoid z-fighting
and clipping.

**Hair, beards.** Hair cards parented to the `head` bone: the scalp's reference frame is `RealBody`'s head
(`head` joint at mouth level; skull top = `head.y + 0.8 * headH`; eye centres are in the GLB's `eyes` mesh and in
`tools/characters/landmarks.json`). Helmets use the same frame: define a `HeadFrame` (centre, radii, brow height,
ear height) measured from LOD 0 head vertices (weights `head` > 0.9) in the reference pose, then scale by `rig.headH
/ refRig.headH` like the morph does.

**Faces.** Paint on the face region of the atlas (island of the head; lips, brows, lid lines, nostrils). Eyes are
already separate; add lids as a morph or two bones (`morph.ts` style) only if blinking is wanted.

**Gore.** `src/combat/gore/` collapses bones and swaps baked pieces; baking pieces from the real LOD 0 means cutting
the geometry by bone weight (>0.5 on the severed bone chain) at runtime, caps from the cut rim. The per-vertex
weights in `RealGeometry.lods[0]` are the inputs.

**Plumbing the default.** Give `HumanoidAvatar` an option (`body: 'real'`) that skips `acquireAvatarGeometry`
and takes geometry and material from `RealBody` (including in `setAppearance`, first person: collapse of `neck`
and `head` scale already works through the shared skeleton, the eyes ride on `head`), hide the eye mesh in first
person, and replace `updateRealBodies` by the avatar's own LOD step. Crowd LODs: add LOD 3 (a 300-triangle mesh) and,
beyond about 80 m, vertex-animation-texture impostors per clip.

**Contract for new meshes.** Joint names are `BONES` (rig.ts); weights sum to 1 over at most 4 influences;
positions are in the reference bind pose of `refRig(sex)`; tangents have w = +-1; UVs are glTF-oriented (v = 0 at
the top) into the atlas; anything added to the GLB must keep the `<sex>_lodN` naming for body LODs.

## Wave-2 improvements to the body itself

- Armpit/shoulder corrective: a pose-space shape keyed by the `upperArm` elevation, or two helper bones (clavicle
  roll, deltoid) driven from the controller; or bake the bind pose with less armpit collapse by weighting more to
  `shoulder` and `chest`.
- Finger bones (the rig has 2 per hand); toe bone split.
- More bodies: HBM has stylized and other presets; an older and a child body (separate sculpts) instead of scaling.
- Age and build as real blend shapes (the heavy and slight builds only scale girth today).


## Wave 2: integration and painted garments (C2a)

`HumanoidAvatar` takes `body: 'real' | 'classic'` (default `'real'`; `?avatar=classic` forces classic).
`main.ts` starts `loadRealBodies` at boot and `startRome` awaits it before the first avatar, so every avatar of
the game is real from the start. Scenes that create avatars earlier (or without the await) get a classic avatar
that `upgradeToReal()` swaps over when the load ends. No `applyRealBody` / `updateRealBodies` any more: the avatar
owns a `RealBody` (real/RealBody.ts) and picks its LOD in `updateLod` (`lod: 'low'` avatars stay at LOD 2 or lower).

**Interface** (`real/types.ts`, verbatim from the plan): `buildShells` (garments/shells.ts, C2d), `buildHead`
(head/index.ts, C2b), `addCorrectives` / `updateCorrectives` (corrective.ts, C2c). RealBody calls them as follows.
- `buildHead(ctx)` once per avatar (LOD 0 arrays). Its `objects` are parented to the head bone inside a group that
  cancels the head joint's offset, i.e. **they must be expressed in the character's bind-pose coordinates** (the same
  space as `ctx.body` and `frame`), not in head-bone-local space. Hidden in first person and beyond LOD 2.
  If it returns any object the procedural helmets are left out of the rigid pieces (it is then the head module's job).
- `buildShells(ctx)` per LOD 0..2 (cached per appearance, shared by every avatar with it): the geometry is drawn by a
  `SkinnedMesh` with avatarMaterial on the avatar's skeleton; `hide` drops body triangles with 2 of 3 vertices
  hidden. When shells exist the procedural skirts, togas and cloaks are not built (only the belt and armour).
- `addCorrectives(geometry, ctx)` per LOD 0..2 on a template-ordered temporary geometry (positions, normals, skin
  attributes, no index); its `morphAttributes` are then carried onto the assembled geometry (appended copies take their
  source vertex's offsets). `updateCorrectives(mesh, bones)` runs after each animation step at LOD <= 2.

**LODs**: 0 (11 k triangles, < 9 m), 1 (4 k, < 22 m), 2 (1.2 k, < 55 m), 3 (about 300, beyond; vertex-cluster
decimation of LOD 2 at load, `real/decimate.ts`, keeps the weights). LOD 0 is two draws (cloth + skin) plus the eyes;
LOD 1 to 3 are one draw (avatarMaterial, skin as a colour; LOD 0 only has the eyes). Geometry is built per LOD on first
need (at most one build per 5 ms), cached per appearance (`realKey`: sex, age, build, height, skin, garments,
footwear, armour; 40 entries).

**Painted garments** (`real/garments/`):
- `paint.ts` evaluates the procedural rules (`paintTorso/Arm/Leg/Foot`, `armor*Paint`) at every vertex of the morphed
  body: region by dominant bone, limb axes from the rig joints, the torso's centre line measured from the body. Output:
  colour, surf (avatarMaterial's contract), thickness and `cloth`. Near garment borders the rule is sampled around the
  vertex (+-3 cm) so the vertex's `cover` ramps with the distance to the true border.
- `assemble.ts` builds the geometry. LOD 0: cloth group (copies of the cloth triangles' vertices, offset along the normal
  by the thickness, plus the rigid pieces) and skin group (the body minus triangles wholly under cloth);
  `clothMaterial.ts` discards cover < 0.5 (alpha-to-coverage with MSAA), so hems are smooth contours. Triangles
  where garments meet get one material (the pattern id is flat per triangle). The first `count` vertices are always the template's.
- Rigid pieces (`rigidPieces` in RealBody.ts) are the procedural builders run against a `MeasuredProfile`
  (garments/profile.ts, the torso measured from the real body plus 1.8 cm): armour lames, galerus, cardiophylax,
  scarf, helmets, belt and, until C2d's shells exist, skirts, togas, pallae, aprons and cloaks (`buildLowerGarments`,
  `buildCloak`). Not built at LOD 3.
- Skin keeps skin.ts (C2b's file): the skin group uses `skinMaterial`; nothing in it was changed.

**Numbers** (M4 Max, 1512x860 @2x, `node scripts/perf.mjs --views forum,circus,colosseum`): the Forum's worst direction
1260 draws / 3.63 M triangles (wave 1 classic: 1252 / 4.03 M); circus and Colosseum within 1 % of classic. LOD builds:
about 1.7 ms each on average.

**Known limits**: heads are bald until C2b's hair arrives; painted togas/stolas without shells wear the procedural lofts
(fitted to the measured torso, a little loose at the hips); hems between two cloth garments are triangle-scale; the shadow
map's self-shadowing of draped lofts on the painted cloth is visible at close range; hands are rigid blocks around a grip.

## Shell garments (C2d, `real/garments/`)

`buildShells(ctx)` (`shells.ts`) returns one skinned mesh (position, normal, color, surf, skinIndex, skinWeight) plus a
`hide` mask per body vertex. `profile.ts` turns the morphed body into a polar silhouette table (radius per height slab and
direction; core = torso and legs, wide = plus upper arms for cloaks). `skirt.ts` is the procedural skirt loft refitted to
that table (tunic hems, stola with under-hem, toga skirt, pteruges, apron, palla wrap). The toga drape, belt and the cloaks
(paenula, sagum, lacerna) run the original builders on a `TorsoProfile` whose `sample` hook (`body.ts`) answers from the real
mesh; cloak vertices are pushed to at least 8 mm outside the silhouette. `hide` covers only the pelvis (hips/spine weights
only): limbs can swing out of cloth in a stride and a hidden limb would vanish. `attach.ts` is the reference for adding the
mesh to an avatar and dropping the covered triangles; the test bed does it with `?scene=avatars&avatar=real&shells=1`
(`__avatars.dress(i, role, seed, patch)`). The belt is included in the shells; the integration may drop it if the painted
garments draw their own.
