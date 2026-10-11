# Realistic heads (avatar-real/head, wave 2 C2b)

Hair, beards, painted faces, helmets and veils for the realistic bodies (`src/actors/avatar/real/head/`, plus
the painting hook in `real/skin.ts`). Entry point: `buildHead(ctx)` in `head/index.ts` (the `BuildHead` of
`real/types.ts`). Test bed: `?scene=avatars&avatar=real&bodies=1&heads=1` (see below).

## What `buildHead` returns

```ts
const head = buildHead({ app, rig, sex, lod, body });   // body: the reference-pose BodyArrays of that LOD
head.objects      // SkinnedMeshes in the bind pose: [hair+beard (hair material), helmet/veil/infula (avatarMaterial)]
head.frame        // HeadSurface (a RealHeadFrame): centre, radii, brow, ears, crown, chin, plus at(), normalAt() ...
head.skinPaint    // SkinPaint for skinMaterial(key, colour, maps, head.skinPaint)
head.setLod(0|1|2)   // hair/beard detail for the body LOD
// buildHead(ctx, hairLod) starts the hair at another level than ctx.lod (RealBody: the body's own)
head.dispose()       // release the cached geometry
bindHead(head.objects, avatar.skeleton, avatar.root)   // add + bind (the eyes do the same)
```

Integration notes for the avatar (C2a):
- Objects are skinned to the head bone only (a ponytail blends into neck and chest), so collapsing the head
  bone in first person hides hair, beard and headgear with the head. Call `bindHead` after the body is applied.
- The painted face needs the body's LOD 0 material to be `skinMaterial(sex + ":0", app.skin, maps, head.skinPaint)`
  (one material per appearance, the shader program is shared). LOD 1 and 2 keep the unpainted material.
- Hair geometry is cached per (sex, style, colour, beard, age, head size, height, LOD) and reference counted;
  a unique head costs 2 to 5 ms to build. `Cache.acquire` holds the entry before it trims: trimming first evicted
  (and disposed) the newest entry whenever the map was full of held ones, so its release found nothing and every new
  look past the cap leaked its uploaded hair geometry (about 45 a lap of 12 teleports; `tests/head-cache.test.ts`).
  The map may exceed its cap while avatars hold the entries (the crowd is about 140 heads, the cap 96).
- `setHairAlphaToCoverage(false)` for the tier without MSAA (main.ts calls it from the settings).
- `head/devScene.ts` shows the whole recipe (it loads LOD 0 of both bodies itself for the arrays).

## Pieces

| File | Purpose |
|---|---|
| `frame.ts` | `measureHead`: polar radius table (26 rows chin to crown x 36 azimuths) from the head-weighted vertices (weight on `head` >= 0.5) of the reference pose; ears removed by a per-row ellipse fit (`earOut`, `earTop`, `earBottom` kept); crown closed into a dome. `HeadSurface`: the table carried to a rig (uniform scale `rig.headH / ref.headH` about the head joint, as morph.ts does), with `at(yf, th)` (the old HeadFrame contract), `normalAt`, `radius`. |
| `hairTexture.ts` | One 1024x1024 RGBA texture built once from a seed (no canvas), four regions (`HAIR_UV`): **strand** (a clump of fifty wavy strands, solid root, tapering tips), **curl** (a clump of tight curls: 150 locks wound in small loops over a soft round silhouette), **plait** (an opaque three-bundle braid, ridged, dark grooves; repeats in v), **fade** (continuous streaks, long along the hair, fine across it). Wrap T repeats (tubes run v unwrapped along the plait). |
| `hairMaterial.ts` | One `MeshStandardMaterial` for all hair: vertex colour x strand texture, alpha test + alpha-to-coverage, Kajiya-Kay highlight (two lobes, per-strand shift) along a `strand` vertex attribute carried through the skin, a little forward scatter. Fade region: keeps the streaks above the vertex's own `fade` density with a soft threshold (a hairline thins out as wisps that A2C dithers, not dots) and is a shade darker (the root layer); strand and curl cards darken toward the root (v = 0) and lighten a touch toward the tips. |
| `cards.ts` | `HairBuilder`: ribbons (3 vertices across), tubes, per-vertex skin weights, and a `fade` attribute (0 solid ... 1 bare). |
| `hair.ts` | Per `HairStyle`: scalp cap (u round the head, v up the meridian, `fade` from the hairline band; `receding` and old age thin the crown so scalp shows through streaks), then cards. `cropped` (comb-forward fringe, shingled sides), `curly-short` (a mass of about 300 overlapping **curl cards**: small cards of the curl texture bulging off the cap in a lying and a raised layer, flat at the hairline, plus a fringe), `receding`, `long-tied` (tail down the neck), `bun` and the Trajanic nodus (`knot()`: two rings of plait with the braid's bumps and a button in the middle), `braided-crown` (plait rings that swell once per crossing), `trajanic-tower` (a tiered diadem of curl cards over a bed of lying ones, raised a little more row by row), `veiled`/`vestal` (front hair under the veil). Under an open helmet: a short cap. |
| `beard.ts` | `short` and `full`: cap over jaw, chin and cheeks (stipple edge), hanging cards (longer and below the chin when full), moustache. `stubble` is painted. |
| `gear.ts` | The existing `buildHelmet` (build/armor.ts, now exported) and `buildVeil` (build/head.ts, now exported) fitted through `legacyFrame(HeadSurface)`: ears pushed back in so bowls and cloth clear them. Plus the Vestal's infula and fillets. Output: one avatarMaterial mesh. |
| `paint.ts`, `paintShader.ts`, `real/skin.ts` | The painted face. The atlas has only baked normals and AO, so the face is painted from the bind-pose position: `q = (vRest - headJoint) / headScale` is the position in the reference head's frame, where brows (strand noise), lips (cupid's bow, mouth line), lid lines, lashes, crease, nostrils, nose-wing creases, blush, eye-socket shadow, stubble and beard-skin tone, age lines (forehead, crow's feet, nasolabial fold, eye bags, as albedo and a small bump) and the shadow of the hair roots above the hairline are drawn. `skThin` (ears, nose) adds light through thin skin in the direct-light hook. |

## Measurements (M4 Max, headless Chromium, `?scene=avatars&avatar=real`)

Hair triangles per head (LOD 0 / 1 / 2, measured in the game after the curl rework; `head.test.ts` holds every style at or
below the numbers before it, in brackets): cropped 3304 / 1344 / 512 [3316 / 1356 / 504, seed-dependent], curly-short 3568 / 1724 / 776 [5752 / 2148 / 904],
receding 2304 / 984 / 408 [same], long-tied 2948 / 1392 / 708 [same], bun 2512 / 982 / 506 [2546 / 996 / 604], braided-crown 3136 / 1192 / 784 [same],
trajanic-tower 3464 / 1634 / 674 [5794 / 2908 / 1368], veiled/vestal 1584 / 624 / 312 (+ veil) [same], beard short 2288 / 584 / 496, full 3404 / 872 / 632 [same]
(a beard is the priciest part of a head: LOD 0 only near the camera).
51 bodies (30-person crowd, lineup, player) from 9 m: 145 draws / 622 k triangles without heads, 194 / 681 k with.

## Known limits

- Hair is cards: no hair physics (a tail follows the head and neck bones only), no shadow casting from the cards.
- Faces are the two sculpts, varied only by paint and the rig's head scale. (Blinks, the jaw and the eyes' gaze
  came in wave 3, below.)
- Beards and hairlines: the cap fades through a density ramp (noise thresholded in hairMaterial.ts); card roots start inside the dense part of the cap so no flat card roots float over skin. A dark full beard still has a fairly hard outer silhouette along the jaw. Painted skin variants are trimmed FIFO beyond 96 (skin.ts); C2a's crowd cache should still key on look.
- `hairConfig.ts` holds the alpha-to-coverage switch so main.ts does not import hair code at boot.
- The helmets and veil are the wave-1 designs unchanged (a murmillo's visor is big on the real head).
- In the avatars scene the pale patches on the cheek are the 60 m sun shadow map (see avatar-real.md), not the paint.


## Wave 3 (C3b): faces alive, eyes, beards

**The paint was in the wrong place for most people (fixed).** Since wave 2 the head is measured on the body already
morphed to the rig, but `measureHead` still used the reference eye centres and `makeSkinPaint` subtracted the
REFERENCE head joint from in-rig heights. Everyone not 1.75 m (man) or 1.62 m (woman) had the lips, nose, brows and
hairline painted centimetres off: a short woman got the hair-root stipple over her whole upper face (the "dark mask"),
men their lip line on the chin. Now `measureHead(body, sex, rig)` carries the reference eyes into the rig, `HeadSurface`
has `kRef` (the head's scale against the reference, whatever it was measured on), and the paint is relative to the
rig's head joint in the reference head's metres. A test morphs both bodies to 1.45 and 1.92 m and checks the paint
lands within 4 mm of the reference.

Paint polish: the hair roots are a fine stipple over a few millimetres at the hairline (no blotches); forehead lines
are soft furrows; the nose is less red; the inside of the mouth is dark and matte (seen when the jaw opens).

**faceRig.ts** (measured once per body template, reference pose):
- `measureJaw`: the vertices below the mouth line (the line drops toward the jaw line beside the mouth, so the cheeks
  stay), the chin, the jaw's underside and the lower half of the mouth's inside, with their weights; the hinge in front
  of the ear canal (`jawHinge`).
- `measureLids`: rays from the eye's centre through the face's triangles give, across the eye (azimuth -70 to +70
  degrees), the elevations of the upper and lower lid edges (the male eye opens from about +18 to -35 degrees on its
  axis; corners closed).
- `beardJawAttributes`: the same jaw for beard cards (below the mouth line, in front of the ears; the moustache stays).

**Eyes** (real/skin.ts `eyeMaterial(iris, skin, lids, key)`, a `MeshPhysicalMaterial`):
- lids painted on the eyeball from the lid table: above the upper edge / below the lower one the ball is lid skin,
  so a blink lowers the upper edge to meet the lower one (which rises a little); the upper lid follows the eyes down;
- the shadow of the upper lid and lashes on the top of the ball, darker corners, a lash fringe along the upper edge
  (denser outward) and a faint lower one;
- the iris and pupil turn with the gaze (the lids stay with the head);
- a clear coat (the tear film) over a slightly rough sclera, a catchlight from the sky, matte lid skin.
Blink and gaze come from the avatar's parameter slot (real/deform.ts); a baked head piece (gore) keeps open eyes.

**Beards**: the cap and cards are laid on the face's own skin (the four nearest head vertices of the morphed body,
pushed out along their normals) instead of the head's polar table, which is the outermost silhouette and left the beard
a centimetre off the jaw like a slab. They ride the jaw (`aDef0` on the hair geometry; the hair material carries the
deformation).

**Hair**: the stipple at the cap's edge no longer leaves lone square specks on the forehead (the sparse end of the
fade is cut, the painted roots carry the edge). Curly-short curls lie closer to the scalp, smaller and denser.

Known limits: the lids are painted on the ball (the lid mesh itself does not move; at 0.5 m the closed lid is a smooth
skin-coloured bulge with the lashes where the lids meet, which reads right); the gaze is the same for both eyes (no
convergence); the Trajanic tower's curls (orbis comarum) are tighter snails now but still flat coils; a full beard's lower edge is still hard.

## Character polish (curls, hairlines, crowns)

What the owner saw: curly styles were rows of rolled "9"-shaped coils (the Trajanic diadem was 24 tube coils, a bun a
flat spiral disc), hairlines a stipple of square dots, and buns and tails showed a bare patch of scalp at the crown.

- **Crowns.** `measureHead` closed the top of the polar table with a hemisphere from 0.88, which cut under the real
  skull: the skin stood up to 20 mm outside the surface in the top rows, so every cap sank into the head there. Each top
  row is now capped by the farthest skin within its own band (the window of the row measure had inflated them into a
  flat disc). Skin is within 0.4 mm of the surface everywhere above 0.9 now.
- **Curls are texture, not geometry.** A curl is a card of the curl-clump region bulging off the cap (`curlCard`,
  8 triangles); curly-short is about 300 of them in two layers, the Trajanic diadem about 130 over a bed of lying ones.
  The curl texture holds 150 locks wound in loops over a soft rim, so a head of them reads as a dense mass with a soft
  silhouette. Curly-short fell from 5752 to 3568 triangles at LOD 0, the tower from 5794 to 3464.
- **Hairlines.** The fade region is continuous streaks along the hair (three scales of value noise) and the cap carries
  its density as a vertex attribute (`fade`), with u round the head and v up the meridian, so the texture is spatial
  (before, v was the density itself: every solid row sampled the same texel row, which drew the cap as thin lines up
  the meridian). The material keeps streaks above the density with a soft threshold. The same cap serves thinning: a
  receding crown shows scalp through streaks instead of a cap with a hole.
- **Knots and plaits.** `knot()` (buns, the nodus) is two rings of plait with the braid's bumps and a button; the
  plait texture is a three-bundle braid. Tubes run their v unwrapped (the texture repeats in v): the old per-vertex
  modulo smeared the texture backwards across one segment per repeat.
- **A shared-head bug.** `RealBody.makeHead` built the head from the cached entry's appearance, and `realKey` leaves
  hair, beard and eyes out, so two people with the same body key (sex, age, build, height to the mm, skin, garments,
  footwear, armour) got the first one's hair, and `setAppearance` with a new hair style changed nothing (the avatars
  test bed's `setAppearance` lineup was all one head). The head and the eyes now come from the avatar's own look.
- **Beards.** The cap's fading top band is shorter (4 cm full, 2.2 cm short) and denser, so the cheeks read as beard
  rather than bare streaks; the hanging cards and moustache are unchanged.

Known limits: curl cards are flat at the silhouette (a few read as flakes at 1 m), the full beard's hanging cards still
read as cut-outs at 1 m, braids are thin ropes rather than a wide plaited coronet, and the fade streaks are blotchy at
1 m on a close hairline.

