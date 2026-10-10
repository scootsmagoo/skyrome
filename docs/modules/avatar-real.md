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
  sculpt's open armpit (arms 22 degrees closer to the torso than sculpted). Fixed in wave 2 by the pose-space
  correctives below.
- Fingers are rigid per bone group (4 fingers on `fingers`, index on `index`, thumb on the hand) and keep the
  sculpt's slight splay; grips look like blocks. *(Fixed in wave 3, see "Wave 3: hands and faces" below.)*
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
need, cached per appearance (`realKey`: sex, age, build, height, skin, garments, footwear, armour; 40 entries). Builds
are spread out (perf audit, October 2026): within 1.15 × a finer LOD's distance that LOD is built ahead in stages
(`buildLodSteps`: the painted body in steps of 2 k vertices, `paintBodySteps`; the shells; the rigid pieces; the
assembly; the rest), one stage at a time by `stepRealBuilds` (3 ms a
frame, from `ActorSystem.update`), and a switch to a finer LOD waits for it down to 0.7 × its distance (then builds at
once). A LOD 0 build was one 15–25 ms frame; now its biggest stages are the shells and the assembly (~6–12 ms). After any switch that built
something, no avatar switches for 24 ms counted from the end of that build, so two builds never share a frame (the old
5 ms gap was counted from the start, and a 20 ms build let the next one start in the same frame). A staged build of an
entry that was evicted or reset meanwhile (`Entry.version`) is thrown away.

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

## Wave 2: correctives, gore, age (C2c)

**Shoulder/armpit correctives** (`real/corrective.ts`, `tools/characters/build_body.py` stage 5b). The pipeline
solves, per side and for four sample poses (upper arm out sideways and forwards, 90 and 150 degrees), the shape that
skinning the sculpt's own open-armpit A-pose to that pose gives, and stores the difference to the bind-pose
skinning as glTF morph targets (position and normal deltas in bind space, so skin(bind + d) lands on the solved
shape; `abd90L abd150L flex90L flex150L`, then R) on LOD 0 and 1. `addCorrectives` attaches the template's shared
morph attributes to a LOD 0 body geometry (no per-appearance copy; the influences are scaled by `rig.s / ref.s`),
`updateCorrectives` (called from `RealBody.update` at LOD 0) sets the 8 influences each frame from the upper-arm
direction in the chest frame: elevation (0 hanging, 1 at 90, second target at 150) times the plane (sideways or
forwards). Regenerate the GLBs with `npm run characters -- --no-bake` (about 5 s per sex; vertex order, UVs and
textures stay identical, the bakes are only needed when the sculpt changes). Cost: one morph texture per drawn LOD 0
geometry (8 targets x 6.8 k vertices x position and normal, about 1.7 MB on the GPU); LOD 1 and 2 have none (an
armpit beyond 14 m is a few pixels).

**Gore on the real body** (`combat/gore/dismemberReal.ts`, `cut.ts`, `stump.ts`). `sever()` branches on
`isRealBody(avatar)` (UV and tangent attributes, no `surf`). The cut is a plane through the middle of a bone
(`REAL_CUT` in `limbs.ts`: the upper arm and thigh halfway, forearm and shin halfway, the neck for the head), in the
bind pose: `cutMesh` splits the triangles on the plane (attributes interpolated, UV seams welded so the rim chains
into closed loops). The piece is baked in the current pose into a world-space mesh with position, normal, tangent and
UV and the avatar's skin material (the baked maps still fit), the head piece takes the eyes, and whatever hangs from
the collapsing child bone is copied. A wound cap (vertex-coloured dome with the bone end) closes the rim on both
sides. The body gets its OWN geometry copy without the piece (`mesh.userData.goreGeometry`; `RealBody.setLod`
leaves it alone) and a cap carried by the cut bone; the child bone collapses (so it also works if a LOD switch
restores the shared geometry: the limb then folds into the stump). Own geometries and caps are freed when the
avatar's root leaves the scene. Not carried: correctives (the severed body has none), skinned shell garments (they
collapse with the bone, a sleeve folds to the stump).

**Age.** Not started beyond what `computeRig` already does (child proportions and head size through the bone
scales, thinner limbs and a belly for the old, `rig.stoop` for the animation layer). A real age blend wants two more
shape keys in the pipeline (old: sagging, thinner torso and calves; child: rounder trunk, no adult musculature) and
blending them in `morph.ts`; the extension point is `BodyArrays.morphs`.


## Wave 3: hands and faces (C3b)

**Why the hands were rigid and splayed.** Measured on the GLB: the sculpt's fingers fan out over 11 cm at the tips
(index 38 degrees forward, little finger 10 degrees back), the thumb stands 45 degrees off the palm, the fingers are
straight, and the weights are wrong (the middle finger is on `index`, the ring finger half on `index`). The curl
poses (anim/poses.ts) then rotated those straight, fanned blocks at the knuckle only.

**The relaxed hand** (`real/handShape.ts`, at load, every template LOD before LOD 3 is made):
- `measureHand` finds the four fingers on LOD 0: components of the hand below the knuckle line (vertices welded across
  UV seams), an axis per finger by PCA, the knuckle at the centre of the finger where it leaves the palm, its length
  and radius; the thumb's tip (farthest forward) and a base by the wrist.
- `reshapeHand` gives each vertex to its nearest finger (so fingers part cleanly at the webs) and re-poses them:
  a gentle fan about the hand's own line (+5, +1, -3, -7 degrees), knuckles evenly spaced, a relaxed cascade baked in
  (knuckle 0/3/6/10, middle joint 20/25/29/33, end joint 10/13/15/17 degrees from index to little finger), the thumb
  laid along the index finger (22 degrees from it) and turned 18 degrees in front of the palm with its joints a little
  bent; normals and tangents turn with them. Weights: the index finger on `index`, the other three on `fingers`
  (blending into `hand` over the knuckle), the thumb and palm on `hand`. It records which digit each vertex is and
  where along it (`HandParts`), for the grip.

**Moving joints without bones** (`real/deform.ts`). The rig has 25 bones and no room for more, and morph targets would
cost about 3 MB per LOD 0 geometry. Instead:
- a parameter channel: three.js sizes a skeleton's bone texture to 12 x 12 texels (36 matrices), so slot 25 is free.
  `paramsOf(skeleton)` is a 16-float view of it (jaw, blinks, gaze, each hand's middle-joint curls and thumb), written
  by RealBody every frame at LOD 0 and read by every skinned material on that skeleton with `getBoneMatrix(25.0)`;
- two vertex attributes on the LOD 0 body (`aDef0`, `aDef1`: pivots in the bind pose, channel and weights; the code is
  stored negative so a geometry without them, read as w = 1, stays still) say which chain a vertex follows: finger
  middle and end joints (pivots at the placed joints, carried to each rig like the vertices), the thumb (swing about
  its base, its end joint), the jaw (about its hinge). `patchDeform` adds the bend to a skinned standard material's
  vertex shader before skinning (position, normal, tangent); the skin material and the hair material (beards ride the
  jaw) use it. `deformPoint` is the same maths on the CPU for the tests. Cost: 32 bytes per LOD 0 vertex, nothing
  per frame beyond 16 floats in a texture three uploads anyway.
- **Contract for whoever changes the skeleton update (C3c):** keep the bone texture at least 26 matrices and do not
  overwrite floats 400..415 of `skeleton.boneMatrices`; RealBody sets `boneTexture.needsUpdate` when it writes them.

**Face** (head/faceRig.ts, see avatar-real-head.md): the jaw's vertices and hinge and the lid opening, measured once per
template. Blinks and gaze are drawn by the eye shader; the jaw bends the skin (and a beard) in the vertex shader.

**LOD 3 heads**: `clusterDecimate` takes a per-bone cell scale; the head uses `REAL_HEAD_CELL` (0.45), so it keeps a
skull, ears, a face and a chin (56 triangles instead of a 10-triangle wedge, at the same 300 for the body). The far mesh
has no hair (head objects stop at LOD 2), so RealBody paints the crown in the hair's colour (a helmet's metal, a veil's
cloth) on LOD 3 (`farHead`).

**Cost** (Forum at 10:00, M4 Max, in-page timing of `updateCorrectives`): 0.6 microseconds per LOD 0 avatar per frame
(was 0.07: correctives only), 0.025 per far avatar (unchanged; far avatars skip the face and hands). Draws and triangles
unchanged (900 / 2.58 M in the worst direction, 898 / 2.58 M before).

## Wave 3: cloth up close (C3a, `real/garments/`)

What changed, in the order a garment is made:

- **Borders** (`paint.ts`). `cover` is now a signed-distance field, not a blurred indicator: each vertex within five
  mesh rings of a cloth/skin change probes the garment rule around it (rings out to 9 cm, bisected), so the 0.5 contour
  that `clothMaterial` cuts at lies on the true hem, neckline or sleeve edge as a straight line across the (large)
  triangles. Values are not clamped (a far corner pulls the contour of a big triangle into place). Torso/arm
  assignment: the trapezius, the shoulder blade and the chest beside the arm take the torso rules (the arm rules have no
  neckline and left holes and spikes), and a palla is dropped from the painted rules (it is drapery now).
- **Layer** (`assemble.ts`). The cloth layer lifts along a *smoothed, seam-welded* normal (`smoothNormals`), thins to a
  3 mm lip at its border (so a hem lies on the skin instead of standing as a wall) and its copies never follow the
  `head` bone (a collar that turns with the head looked ragged). Cloth copies are re-lit from the displaced surface
  (`relitClothNormals`), so folds painted as thickness shade as folds.
- **Folds** (`folds.ts`, `detail.ts`). Pure maths: `ridge` (rounded crest between creases), `foldPhase` (leaning,
  drifting), `foldDepth` (growing toward the hem). `detail.ts` gives the painted toga, palla, stola and the toga's
  left-arm sleeve their relief as extra layer thickness plus a shade: pleats parallel to the sash across the front,
  vertical pillars from the left shoulder down the back, the stola's close vertical pleats.
- **Skirts** (`skirt.ts`). Cloth that hangs: a ring never falls inside the body shape up to 27 cm above it, so skirts
  drop clear of the belly and hips; pillar folds, a scalloped hem (longest on a crest), a rolled hem and a crisp
  two-row trim edge (the toga praetexta's purple band, the stola's trim).
- **Drapery** (`drape.ts`). `slab()` is a cloth sheet with a rim (edge thickness) and an optional back face, rows and
  columns spaced unevenly; each quad is wound against the sheet's surface normal (one sign per sheet, voted against the
  hint), not by one winding for the whole grid. The toga is ONE mantle (`buildTogaDrapery`): a ring round the torso
  slit under the right arm, whose top edge is the toga's line (neck base over the left shoulder and the back down to the
  right armpit, in front the balteus diagonal from the left shoulder to the right hip) and whose hem swings low in front
  (the sinus, with the praetexta's purple band along it, and a rolled lip and umbo swell along the diagonal) and a
  little at the back. It hangs over the wide profile on the left (over the arm) and the body profile on the right (the
  bare arm), stays outside the skirt (`radiusAt`, sampled either side of each column: a crest between two columns must
  not poke through) and takes the skirt's thigh weights below the waist (without them a stride or the idle stance moved
  the skirt through the mantle: holes in the hem).
- **Palla** (`cloaks.ts`, `buildRealPalla`). One continuous shawl: the cape builder with a thigh-length hem, the border
  along it, a wide span (it comes round over the arms) and no fibula. It replaces the toga-style sash and pouch (two
  hard-edged slabs) of the first pass. Over a tunic the stola's painted straps are dropped (thinner than the sculpt's
  vertex spacing, they painted as red spikes up the shoulders) and the stola's top edge is a soft colour band.
- **Cloaks** (`cloaks.ts`). The lacerna, sagum and paenula hang from the neck base over the wide profile (upper arms
  included), with pillar folds and a scalloped, thick hem. The procedural `buildCloak` is no longer used by the real
  bodies.
- **Material** (`clothMaterial.ts`). `realClothMaterial` (the body's cloth group, with the cover cut and a darker
  band inside the border plus a faint stitch line) and `realShellMaterial` (shell garments; `RealBody.applyShells`
  uses it): avatarMaterial with the blotchy mottling replaced by a plain weave (wool 2.8 mm with a twill hint, linen
  1.6 mm with slubs) as height bump and thread shade, a whisper of dye variation, the very brightest albedos eased
  down so white wool keeps its folds, and a rim sheen (wool 0.32, linen 0.5) on the lit light. Weave, bump and sheen
  fade with `fwidth` of the weave coordinates like the skin pores.
- **Clavi** (narrow equestrian 2.6 cm, broad senatorial 5 cm). Painted on the body's vertices they came out ragged (a
  stripe narrower than the vertex spacing), so `paintBody` hands `paintTorso` a tunic without clavi and writes a
  `clavus` vec4 per vertex instead (bind-pose x, stripe centre, half width, flag 2 where the tunic shows: not under
  the painted toga, not under armour). `assembleBody` copies it onto the cloth copies (with the copied vertex's own x)
  and `realClothMaterial` draws the stripe per pixel from the interpolated x: crisp lines at any triangle size.
  A geometry without the attribute reads w = 1 and draws nothing. The stripe ends at the belt (the tunic skirt shell
  carries none). Belts are `buildBelt` (unchanged).

Folds, review pass 2: the toga mantle's pillar folds are added AFTER the clamp to the skirt's surface (before, the
clamp flattened them below the waist, which is why the mantle read as a smooth sack), 11 folds over 44 columns, depth
0.08 body heights, fading toward the slit edges, with vertex shade 0.26..1 on the crests; the toga skirt has 12 folds
(depth 0.05), the stola 14 (0.016), the palla 10 over 20 columns. Long skirts (legK > 0.85) also take shin weights
over their lower half (up to 0.75 at the hem), so a back-swung calf is more often under the cloth.

Budget (shell triangles per person at LOD 0, mean over six seeds per role; original pre-C3a numbers in brackets):
patrician (toga) 1436 [1224], matron 1648 [1190], priest 1684 [1224], plebeian man 1209, slave 864, merchant (paenula)
and Dacian (sagum) 1848 [2100]. Measured in the game via the shells geometry's index count. The body's cloth group is unchanged.
Forum crowd (`perf.mjs --views forum`): triangles per direction identical to within noise (2.57M/2.11M/2.13M/2.27M
against 2.57M/2.13M/2.13M/2.26M); GPU/CPU ms differ run to run with the shared GPU.

Known limits: the toga's front is still smoother than a real wool toga (folds read at 1.5 to 8 m but are soft); a
sharp stride still pushes a calf (painted in the skirt's colour) out of the toga's skirt; a tunic-only back shows
skin notches at the armpits; the shoulder of a short sleeve
still shows a slightly jagged contour where the sculpt's armpit web is a very large triangle; walking in a toga at
speed leaves the sinus swinging as one piece.

## Wave 3: baked cloth (C3a-2, `real/garments/{baked,bind,fit}.ts`, `tools/characters/garments.py`)

Two rounds of procedural fold maths topped out (the toga read as a smooth sheet, a plaster bib), so the draped
garments are now made the way games make cloth folds: **simulated offline, baked, fitted at runtime**.

**Offline** (`node tools/characters/garments.mjs [male|female] [--only=toga,stola] [--preview]`, Blender 5.1, about 10
minutes; one garment: `Blender -b --python tools/characters/garments.py -- male --only=toga --preview`):
- The collider is the game's own reference body (`public/models/people/<sex>.glb`, LOD 0, already in the bind pose). An
  arm the cloth passes under is swung out of the way first (the bind pose has the arms against the torso): both for
  skirts, the right one for the toga.
- Each garment is a flat **pattern** in metres (a grid, u across, v down from its top edge) whose flat shape is the
  cloth's rest shape (`rest_shape_key`), laid loosely round the body in folds (`Pleats`: folds of uneven width so they
  look gathered by hand) and **pinned** where it is fixed: a skirt's belt line, the toga's line over the left
  shoulder, a cloak's neckline and the sagum's fibula. Skirts are cut as cones (lightly gathered at the belt, about 1.7
  times the belt at the hem), the toga's mantle as a fan (the toga is a segment of a circle: 1.35 times wider at the
  hem than along its top line).
- Blender's cloth solver settles it under gravity with body and self collision; wool (`wool`, toga/palla/cloaks: heavy,
  bending 15, broad folds), light wool (`wool_light`, lacerna, paenula), tunic wool and linen (stola: finer folds). A
  few volume-keeping Laplacian passes take out the solver's grid-scale crinkles (the big folds stay).
- **Layers**: a garment worn over another is simulated over that one's settled cloth (`UNDER`: cloaks and the male
  palla over the knee tunic, the female palla over the stola), so they never cross; fitted to any body both keep their
  offsets from the skin, so they stay apart.
- Then: per-vertex ambient occlusion ray-traced against body and cloth (48 rays, both faces), collapse-decimation to
  three LODs, a turned rim along every hem (LOD 0 and 1), and one GLB per sex (`public/models/garments/<sex>.glb`, meshes
  `<id>_lod<k>`, TEXCOORD_0 = pattern metres, TEXCOORD_1 = (distance to the bordered edge, AO), TEXCOORD_2 = (part id,
  rim)). `--preview` writes workbench renders to `.cache/garments/` (look at them: a sim can swing or fold differently
  after a small change).

The garments (male / female):

| id | what | pinned | parts |
|---|---|---|---|
| `toga` | Imperial toga: the lower wrap to the instep; the mantle hung from the toga line (over the left shoulder, down across the back to under the right arm, back up across the chest), its front free between the right hip and the left shoulder so it sags into the **sinus**; over the left arm; to the calves behind (a lacinia hanging down the front from the left shoulder is in the script, off: `--set=lacinia=1`) | the toga line (not its front), the wrap's waist | 0 wrap, 1 mantle |
| `toga_velata` | the same toga **capite velato** (priests, sacrificants): the line runs from the left shoulder up beside the cheek, over the brow, down the right side of the head to the right shoulder, then across the chest; the hood falls over the head and down the back, the right shoulder is covered | the line round the face and across the chest | 0 wrap, 1 mantle |
| `tunic_short/knee/long` | the tunic below the belt (cone cut) and the kolpos falling over the belt | belt line, the kolpos's top | 0 skirt, 1 kolpos |
| `stola` (f) | high-belted under the bust to the instep (linen, fine folds), a short bodice and two straps | belt, bodice top, straps | 0 skirt, 1 bodice, 2 straps |
| `palla` (m, f) | a wool mantle round both shoulders and the back, over the upper arms, with its end down over the left arm | the line round the shoulders | 1 mantle, 2 end |
| `paenula` | the bell cloak (a circle and a half of wool, flare 2.6) to the knees, its hood lying on the back | neckline | 1 bell, 2 hood |
| `sagum`, `lacerna` | a rectangle round the shoulders pinned at the right shoulder, open down the right side (lacerna longer and lighter) | the line from the fibula round the neck back to it | 1 |

**Runtime** (`baked.ts`: library and cache; `bind.ts`: pure maths, tested in `bind.test.ts`; `fit.ts`: rules and fit):
- `loadRealBodies` also loads the two GLBs and hands `baked.ts` the body templates (one hook in RealBody).
- **Binding**, once per (sex, garment, LOD) on first use: every garment vertex is bound to the reference body of the
  same LOD at its nearest surface point (triangle + barycentrics, uniform-grid search), as a distance along the body's
  smooth (interpolated) normal plus a small tangential rest.
- **Fit** per appearance: re-evaluated on `ctx.body` (already morphed: never morph it again): the anchor moves with the
  skin, the offset turns with the skin's normal (shortest rotation from the bind normal), so cloth that lay 2 cm off a
  belly lies 2 cm off a heavier one; the displacement of cloth hanging far from the body (hems, the sinus, cloak tails)
  is relaxed over the garment mesh (8 passes, fading in from 3 to 16 cm off the skin) so neighbouring anchors on
  different limbs cannot tear it.
- **Weights**: the body's weights at each anchor, handed up the parent chain to the bones the garment may follow
  (`SPECS[id].bones`: a toga follows the left upper arm, not the right; a cloak both upper arms, not the forearms),
  smoothed over the garment, then below the hips blended into the **skirt rule** (hips, the thigh on its side, the shins
  near the hem of long skirts; `skirtRule`): skirt parts from their belt down, drapery over the legs from the crotch down
  with the rule of the skirt it hangs over (a cloak or a man's palla the knee tunic's, a woman's palla the stola's, the
  toga's mantle its wrap's), so the two layers move alike and the inner one never strides through the outer.
- **Legs inside long cloth** (`legs` attribute + the shell material's vertex shader): each skirt vertex below the crotch
  knows the leg axis and radius at its height (measured on the person's body); after skinning it is pushed out of the
  posed thigh or shin capsule of both legs (bone matrices from the skeleton), so a stride presses the cloth forward
  instead of poking through it. Outer layers keep more clearance (a toga's mantle 3.2 cm, cloaks 3.5 cm, skirts 1.2 cm)
  so a leg pushing both never presses them into one surface.
- **Hide** (per reference body vertex, cached): a vertex whose bones the garment follows closely is hidden when a ray
  out along its normal and four tilted ones all hit the cloth within 9 to 12 cm (hems and necklines fail a tilted
  probe and stay visible); long skirts also hide the thighs down to 16 cm above the hem (the leg push keeps them under
  the cloth).
- **Colours**: per vertex garment colour; `trim` = border colour and band width, drawn per pixel at a distance from the
  bordered edge (`cloth.x`): the praetexta's purple 6 cm along the toga's hem, the lacinia's edge; stola and tunic
  trims along their hems. **Clavi** continue down the tunic skirt along the cloth (pattern u, from where the cloth leaves
  the belt: they run into the folds). The baked occlusion (`surf.y`) shades the indirect light fully and the direct
  light by 60 % (the shadow map cannot resolve folds); the hem's rim is a shade darker; the weave runs along the
  cloth's threads (pattern coordinates). Shell material: DoubleSide (single sheets).
- Paint: at LOD 0 to 2 the body no longer paints a toga or stola that is baked (it paints the tunic under it);
  LOD 3 keeps the painted garments. `?cloth=procedural` turns the baked cloth off (A/B).
- **Dark smears on light cloth** (the priest at the Lacus Curtius): the post chain's screen-space AO, darkening every
  fold and casting halos from cloth edges onto the tunic and skin. Characters now write alpha 0 into the HDR target
  (avatarMaterial, so classic avatars, real LOD 1 to 3 bodies, shells, head gear; the body's A2C cloth keeps its alpha)
  while the post chain renders the scene (`AO_MARK`, a shared uniform PostFX sets around that one render: straight to the
  canvas Safari would composite alpha 0 as black), and the AO pass neither darkens alpha-0 pixels nor counts them as
  occluders (`gfx/post/ao.ts`, `shaders.ts`); their own occlusion is baked.
- The head module's veil is left out when a baked toga velata exists (`head/gear.ts`, one line).
- Armpit notches on tunic-only bodies (`paint.ts`): the armpit's front and back folds and the inside of the arm beside
  the ribs (upper-arm vertices inward of the arm's axis, from 11 cm below the armpit up) take the torso's rules, so
  the tunic runs on under the arm instead of stopping at the sleeve's hem.

**Budget** (triangles per garment at LOD 0 / 1 / 2, including the hem rims on LOD 0 and 1; `baked.test.ts` holds them
under 4500 / 2400 / 520): toga 3920 / 1905 / 420, toga velata 4336 / 2055 / 460, knee tunic 2928 / 1417 / 299, short 2626 /
1299 / 260, long 3344 / 1581 / 339 (woman's 3284 / 1600 / 339), stola 3860 / 1840 / 380, palla 3344-3392 / 1753-1773 / 359,
paenula 3168 / 1612 / 359, sagum 2756 / 1520 / 320, lacerna 3020 / 1580 / 340 (C3a's procedural shells: about 1440 for a
toga, 1650 for a matron, 1850 with a cloak, at LOD 0 and 1). LOD 0 keeps its hems at nearly full resolution (they
decimate last); `--relod` rebuilds the LODs from the kept simulation without simulating again. Triangles of an inner layer lying
under an outer one are dropped (about 100 of the toga's wrap). LOD 0 is drawn within 9 m only, so the Forum's totals
did not move (`perf.mjs --views forum`, procedural against baked: 899/2.58M 711/2.13M 725/2.12M 805/2.25M draws/triangles
against 897/2.58M 713/2.12M 719/2.09M 796/2.22M; geometry +6 MB; the GLBs are 1.5 MB + 0.5 MB). Binding all garments at
load costs about 0.4 s (spread between frames); a person's LOD 0 fit about 1.7 ms (LOD 1 0.8, LOD 2 0.15).

**Known limits** (C3a-2): a sprint still lifts the back calf out below a long hem (it shows in the under-tunic's painted
colour) and a knee at full stride can dent a stola's front; the cloth is skinned drape, with no secondary motion (the
sinus swings with the hips); the toga has no separate umbo pouch and no lacinia (simulated, it crumpled into a ragged band and was left out); the
palla's end hangs as a crumpled band; the sagum bulges forward over the belly; the stola reads as straight organ-pipe folds; tunic skirts flare a little at the sides where the simulation had
the arms swung out; beyond 55 m (LOD 3) the painted body garments return (a toga becomes white legs), as before; women's
togas and cloaks and men's stolas stay procedural (no role wears them); the shadow pass does not push the cloth out of the
legs. A simulation is chaotic: a small change to garments.py can change a drape completely (it is deterministic for the
same inputs), so look at the `--preview` renders after every change.
