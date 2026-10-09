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
head.dispose()       // release the cached geometry
bindHead(head.objects, avatar.skeleton, avatar.root)   // add + bind (the eyes do the same)
```

Integration notes for the avatar (C2a):
- Objects are skinned to the head bone only (a ponytail blends into neck and chest), so collapsing the head
  bone in first person hides hair, beard and headgear with the head. Call `bindHead` after the body is applied.
- The painted face needs the body's LOD 0 material to be `skinMaterial(sex + ":0", app.skin, maps, head.skinPaint)`
  (one material per appearance, the shader program is shared). LOD 1 and 2 keep the unpainted material.
- Hair geometry is cached per (sex, style, colour, beard, age, head size, height, LOD) and reference counted;
  a unique head costs 2 to 5 ms to build.
- `setHairAlphaToCoverage(false)` for the tier without MSAA (main.ts calls it from the settings).
- `head/devScene.ts` shows the whole recipe (it loads LOD 0 of both bodies itself for the arrays).

## Pieces

| File | Purpose |
|---|---|
| `frame.ts` | `measureHead`: polar radius table (26 rows chin to crown x 36 azimuths) from the head-weighted vertices (weight on `head` >= 0.5) of the reference pose; ears removed by a per-row ellipse fit (`earOut`, `earTop`, `earBottom` kept); crown closed into a dome. `HeadSurface`: the table carried to a rig (uniform scale `rig.headH / ref.headH` about the head joint, as morph.ts does), with `at(yf, th)` (the old HeadFrame contract), `normalAt`, `radius`. |
| `hairTexture.ts` | One 512x1024 RGBA texture built once from a seed (no canvas): strand clump (alpha silhouette, per-strand tone), plait ridges, stipple fade. |
| `hairMaterial.ts` | One `MeshStandardMaterial` for all hair: vertex colour x strand texture, alpha test + alpha-to-coverage, Kajiya-Kay highlight (two lobes, per-strand shift) along a `strand` vertex attribute carried through the skin, a little forward scatter. |
| `cards.ts` | `HairBuilder`: ribbons (3 vertices across), tubes, per-vertex skin weights. |
| `hair.ts` | Per `HairStyle`: scalp cap thinning out at the hairline, then cards. `cropped` (comb-forward fringe, shingled sides), `curly-short` (ribbon ringlets), `receding`, `long-tied` (tail down the neck), `bun`, `braided-crown` (plaited rings), `trajanic-tower` (tiered coil diadem and back knot), `veiled`/`vestal` (front hair under the veil). Under an open helmet: a short cap. |
| `beard.ts` | `short` and `full`: cap over jaw, chin and cheeks (stipple edge), hanging cards (longer and below the chin when full), moustache. `stubble` is painted. |
| `gear.ts` | The existing `buildHelmet` (build/armor.ts, now exported) and `buildVeil` (build/head.ts, now exported) fitted through `legacyFrame(HeadSurface)`: ears pushed back in so bowls and cloth clear them. Plus the Vestal's infula and fillets. Output: one avatarMaterial mesh. |
| `paint.ts`, `paintShader.ts`, `real/skin.ts` | The painted face. The atlas has only baked normals and AO, so the face is painted from the bind-pose position: `q = (vRest - headJoint) / headScale` is the position in the reference head's frame, where brows (strand noise), lips (cupid's bow, mouth line), lid lines, lashes, crease, nostrils, nose-wing creases, blush, eye-socket shadow, stubble and beard-skin tone, age lines (forehead, crow's feet, nasolabial fold, eye bags, as albedo and a small bump) and the shadow of the hair roots above the hairline are drawn. `skThin` (ears, nose) adds light through thin skin in the direct-light hook. |

## Measurements (M4 Max, headless Chromium, `?scene=avatars&avatar=real`)

Hair triangles per head (LOD 0 / 1 / 2): cropped 3316 / 1356 / 456, curly-short 5224 / 1812 / 736, receding 2304 / 984 / 360,
long-tied 2948 / 1392 / 660, bun 2546 / 996 / 556, braided-crown ~3000 / 1300 / 850, trajanic-tower ~4000 / 2000 / 1000,
veiled/vestal 1584 / 624 / 264 (+ veil), beard short 1216 / 392 / 336, full 1960 / 584 / 416.
A body is 11000 / 4000 / 1200. One extra draw call per head (hair+beard) and one for a helmet or veil.
51 bodies (30-person crowd, lineup, player) from 9 m: 145 draws / 622 k triangles without heads, 194 / 681 k with.

## Known limits

- Hair is cards: no hair physics (a tail follows the head and neck bones only), no shadow casting from the cards.
- The painted face is procedural per pixel: no pupils-to-lid interaction (no blinking), the mouth stays slightly open
  as sculpted. Faces are the two sculpts, varied only by paint and the rig's head scale.
- Full beard: a cap with a 6 cm stipple ramp plus cards (reworked after review); hairline stipple still a little blocky. skinCache grows by one material per unique paint key (the program is shared): C2a's crowd cache should key on look.
- The helmets and veil are the wave-1 designs unchanged (a murmillo's visor is big on the real head).
- In the avatars scene the pale patches on the cheek are the 60 m sun shadow map (see avatar-real.md), not the paint.
