# Performance audit: frame CPU, hitches, idle, boot, garbage (October 2026)

> **Status:** phase 1 of the living-city plan (`docs/design/living-city-2026-10.md`), crew PERF-cpu, 2026-10-10.
> **Machine:** the owner's M4 Max, Chromium headless with ANGLE/Metal (Playwright), 1280×720 unless noted.
> **Caveat:** several agents shared the CPU and GPU during these runs (load average 7 to 14). Absolute
> milliseconds are higher and noisier than on an idle machine. Every claim below rests on one of two kinds
> of comparison that survive the noise: **A/B switches inside one page** (a fix switched off and on in
> alternating rounds, `scripts/perf-probe.mjs`), or **interleaved runs** of the old build (commit `b8041fe`)
> and the new one, one after the other, twice per graphics tier. Counts (draw calls, texture uploads, GL
> calls, GCs) are exact.

## What the owner gets

- **The CPU does about a fifth to a third less work per frame** in the Forum, at the Colosseum and at the
  Porta Capena, on High and Medium. Render submit (the time to hand the frame to the GPU) fell by a third
  on High (Forum 9.9 → 6.8 ms) and by 40 % on Medium (6.7 → 4.1 ms). With the 60 fps cap that is idle time:
  the CPU sleeps instead of heating the laptop.
- **Far fewer hitches.** Frames over 33 ms during the standard look-around fell from 22 to 4–5 in the Forum
  (High). The 20 ms streaming and 25 ms character-build hitches are split over several frames.
- **Menus, the pause screen, dialogue and the console now cost almost nothing.** The paused world is redrawn
  only when the view moves (about 3 % of frames). The title and character creation run at 30 fps, and an
  unfocused window draws nothing.
- **Boot is 5 to 7 seconds shorter.** On a quiet machine it went from 20.3 s to about 14–15 s to the first frame. In
  interleaved runs on a busy machine, the landmark phase went from 18.7 to 11.1 s (medians).
- **A budget gate**, `node scripts/perf-budget.mjs`, so later crews see when they make the game heavier.

## Method and tools

| Script | What it does |
|---|---|
| `scripts/perf-probe.mjs` | Profiles every frame with hooks around three.js's own render steps: `scene.updateMatrixWorld`, the render-list walk, the shadow pass, the main draw and the post passes. It also gives draw calls per pass and render-list sizes. `--ab` alternates switches off and on in one page (built-ins hide each scene group, skip the shadow pass, and switch each fix back off). `--glcount` counts WebGL calls per frame. `--gpu [--gpu-post]` times each pass on the GPU. `--cpuprofile <ms> [--pan] [--match] [--callers]` takes a sampling CPU profile with self and inclusive time. |
| `scripts/perf-budget.mjs` | The gate (see the end). |
| `scripts/perf-gc.mjs` | Minor and major GCs per minute (a V8 trace) and bytes allocated per function (a sampling heap profile that keeps collected objects), while the view turns or the player walks (`--walk`). `--callers <fn>` shows who calls an allocator. |
| `scripts/perf-boot.mjs` | The loading screen's phases with timestamps, the first frames after ready, and `--profile`: a CPU profile of the whole boot. |
| `scripts/perf.mjs` | The existing survey, unchanged. |

## 1. Render submit: where 7.5–8.4 ms went

The breakdown before the fixes (Forum, High, `perf-probe`, three runs):

| Step | ms per frame |
|---|---:|
| `scene.updateMatrixWorld` (three.js walks the whole graph) | 1.5–1.7 |
| render-list walk (visibility, frustum culling, sorting, skeletons) | 1.2–1.3 |
| shadow pass (2.0 ms each, at 30 Hz) | 0.9–1.0 |
| main draw (state, uniforms, the draws themselves) | 3.7–4.3 |
| post (CPU side) | 0.1 |

The draw-call count barely moved (≈ 650 main + 240 shadow), so the cost was not the number of draws.
`--glcount` showed **10,847 WebGL calls a frame**. Among them were 392 `texSubImage2D` and 1,568
`texParameteri`, which are texture uploads. These are the findings, measured by hiding one group at a time
in the same page.

**a. Batched meshes re-uploaded their draw list every pass, even when empty.** There are about 260 batched
meshes: the city's `city:batches` and the landmarks' `lmbatch`, one per material. three.js's BatchedMesh, and
our `fastCull` copy of it, write each batch's draw list (the instance ids, an "indirect texture") in every
pass and flag it for upload. That made about 320 texture uploads a frame. A batch with nothing in view still
paid for a program switch, a material uniform upload and its bindings. Hiding `lmbatch` saved 2.1 ms of
render and hiding `city:batches` saved 1.0 ms: about 20 µs per batch draw, against about 3 µs for an
instanced mesh. **Fix** (`src/gfx/fastCull.ts`):
- Each pass now keeps its own list. The shadow pass gets a second indirect texture and its own start and
  count arrays, swapped in around its draw.
- A list is uploaded only when its sequence of instances changed. LOD swaps change only the starts and
  counts, which the multi-draw takes as plain arrays.
- The main pass is culled **before** three.js walks the scene (a hook on the scene's `onBeforeRender`). A
  batch with nothing in view is hidden for that walk and shown again for the shadow pass.

Texture uploads fell from 392 to about 50 a frame and GL calls from 10.8 k to 7.2 k. In one-page A/B tests,
the pre-cull is worth 0.8–1.0 ms of CPU and the per-pass lists 0.6–1.1 ms.

**b. The scene root forced every world matrix to be recomputed every frame.** `freeze.ts` had already frozen
the static meshes (`matrixAutoUpdate = false`), but the scene itself and every group kept updating
themselves. In three.js an object that recomposes its matrix forces the world matrix of everything below it.
So all ~7,000 objects were multiplied every frame anyway. **Fix:**
- `Game` freezes the scene root.
- `freeze.ts` now **seals** the static top-level groups. Meshes are frozen as before. Groups are frozen but
  watched: a snapshot comparison each frame recomposes a group that moved, so doors and pivots keep working.
- three.js's walk skips a sealed subtree entirely while nothing in it changed. Objects added later, or thawed
  with `thaw(obj)`, are walked on their own.

`updateMatrixWorld` went from 1.5–1.7 to 0.4–0.55 ms. In A/B tests, freezing the scene root is worth
1.0–1.3 ms of CPU and the sealed walks another 0.3–0.4 ms.

**c. The crowd.** Hiding the actors saves 2–3.5 ms of render: about 265 main draws (body, hair and cloth
shells for 80 people in view) and about 140 shadow draws. Inside the avatars, every bone quaternion write
made three.js rebuild the bone's Euler angles: a matrix built and decomposed per bone per pose, 0.3–0.4 ms a
frame. **Fix:** bones no longer sync their Euler (`createBones`; nothing reads `bone.rotation`). The draw
count itself is the avatar module's to reduce (see "Next").

Measured and dropped:
- **An opaque sort by shader program** (fewer program switches) was 0.16 ms *slower*: the extra sort cost
  more than the switches it saved.
- **Shared custom depth materials** for the batches made no difference that rose above the noise.

After the fixes (Forum, High, quiet moment): render 4.7–4.9 ms = `updateMatrixWorld` 0.4 + list walk 1.2–1.3
+ shadow 0.7–0.8 + main draw 2.3 + post 0.1.

**WebKit (Safari's engine)** gains the same. Switching each fix back off in one WebKit page costs, in render:
- freezing the scene root: +0.97 ms;
- sealed walks: +0.19 ms;
- pre-cull: +0.82 ms;
- per-pass lists: +0.94 ms.

WebKit is slower overall: render 9.2 ms in the Forum on the busy machine, with the list walk at 2.2 ms.

## 2. Hitches

**City streaming** (`src/world/city/streamer.ts`). Slow frames of 17–21 ms were led by `cityStreamer`. The
5 ms budget always ran one step, and one step was a whole unit: generating a big insula (up to about 15 ms of
procedural architecture) plus putting it into the batches. A street cell ran all its items at once (13–16 ms).
After a short first step, a second unit could start in the same frame. **Fix:**
- A unit now takes two steps (generate, then commit), and a cell runs its items in 3 ms slices.
- The loop starts another step only if that step's expected cost still fits the budget. It knows the
  expected cost from a running average per kind of step.
- The big steps run every other frame, and only when no other background work had the frame
  (`game.backgroundMs`, below).

The longest streaming step went from 18 to 14 ms, and one big step is never combined with another.

**Character builds** (`src/actors/avatar/real/RealBody.ts`). A person coming within 9 m switches to LOD 0,
which was built on the spot: 15–27 ms. The throttle counted its 5 ms gap from the *start* of a build, so a
20 ms build let the next one start in the same frame (30–40 ms frames). **Fix:**
- The next finer LOD is built ahead from 1.15 × its distance, in stages (paint, shells, assembly, rest), at
  most 3 ms a frame (`stepRealBuilds`, run by `ActorSystem`).
- A switch waits for that build down to 0.7 × the distance. The gap is now counted from the *end* of a build.
- The body paint (`paintBodySteps`) also yields every 2,048 vertices, and every 512 in its border-probing
  loop, so it no longer runs as one block.
- The assembly helpers got cheaper with the same output. `weldGroups` uses numeric keys instead of strings
  (a micro-benchmark on a body-sized vertex set: about 3–6 × faster, same groups). There is no `Math.hypot`
  and no per-triangle array in the normal passes.

The longest switch went from 27 to about 5 ms. At the Porta Capena, on a very busy machine (load 24), the
longest stage of any build went from 27 ms (the paint) to 13 ms: the cloth shells. The assembly takes 11 ms. In
that run, no frame's `actors` time went over 12 ms during the look-around; before, it reached 20–28 ms.

**Coordination.** `game.backgroundMs` adds up this frame's deferrable work. The streamer leaves its big
steps for the next frame when an avatar build already used this one.

Slow frames (over 33 ms) during the gate's look-around, interleaved runs:

| | High before | High after | Medium before | Medium after |
|---|---:|---:|---:|---:|
| Forum | 22 | 4.5 | 2.5 | 0 |
| Colosseum | 3 | 1 | 1 | 1 |
| Porta Capena | 14 | 4.5 | 4 | 2 |

## 3. Idle cost

Before:
- A paused world (pause menu, inventory, map, dialogue, console) was redrawn in full at 30 fps.
- The title and character creation ran at the full 60 fps.
- An unfocused window redrew twice a second, without post-processing.

After (`src/core/Game.ts`):
- **Paused:** a frame is drawn only when the camera moved (position, rotation, lens or canvas size), after
  `game.invalidate()` (every settings change calls it), or once a second. That is 3.3 % of paused frames
  (`game.drawStats`).
- **Title and creation:** 30 fps (`game.capFps('menu', 30)` on `flow:state`). The graphics governor ignores
  capped frames, so it does not lower the tier on the title.
- **Unfocused or hidden:** nothing is drawn, except once after a resize (a resize clears the canvas).
  Background tabs get no animation frames from the browser anyway.

`settings.maxFps` still caps everything, and `?fps=` overrides it for measuring.

## 4. Boot (20.3 → about 14–15 s to the first frame)

`perf-boot.mjs` before: about 1 s each to survey and lay the ground, **15.2 s for the landmarks**, 2.6 s for
the city, and 0.6 s for the rest. The profile of the landmark phase showed four fixable costs:

| Cost | Fix | Saved |
|---|---|---|
| `statues.ts` `crPoint`: 1.2 s of self time. It built three arrays per call, for millions of calls (every vertex of every lofted statue, four times for its normal). | Interpolate without arrays (same numbers). | ~1.2 s plus GC |
| `mergeVertices` (three.js, string keys): 1.2 s. Landmark near meshes were welded, then un-welded again by the batches. The builders' far meshes were welded, then thrown away by the far bake. | `build(name, { index: 'later' })`. `buildLandmarks` welds only what stays a mesh (`weldLater`). | ~1 s |
| `farBake.ts` `cluster`: string keys per vertex and per triangle. | Numeric keys (unit test: identical output). | ~0.4 s |
| `landmarkBatch.ts` `prep`, `farBake.ts` `addPart`: per-vertex accessors. | Plain array copies and inline matrix math. | ~0.3 s |
| The 11 procedural texture sets (fabric, travertine, stucco, bronze, and so on): ~1 s on the main thread. | Generated in a worker (`proc.worker.ts`) started with the renderer; all 11 arrive before they are needed. `?lodoff=procworker` turns it off. | ~1–2 s (A/B: landmark phase 14.1 → 12.1–12.4 s) |
| `heightToNormal` and gfx per-vertex loops called `Math.hypot` per pixel or vertex. | `Math.sqrt`. | ~0.3 s |

Interleaved boots of the old and new builds (three each, busy machine, medians): `startRome` 23.0 → 15.6 s, landmark
phase 18.7 → 11.1 s. Still there:
- inscription atlas text rendering (~1.8 s, `arch/common/inscription.ts`, canvas text);
- the heightmap (~0.9 s);
- shader compiles in the first frames (~0.7–1 s of `onFirstUse`; the first five frames take 30–100 ms).

`renderer.compileAsync` behind the loading screen was tried. It compiled 174 programs, not the 82 the game
uses, because it does not see the HDR pass's variants, and the first frames were no faster. It was reverted.

## 5. Allocation churn

`perf-gc.mjs`, Forum, 20 s of turning: **618–635 minor GCs a minute before** (0.6–0.8 ms each) and 24 major
GCs. The biggest allocator was **`Math.hypot`**, which allocates for its arguments. It was called per bone
quaternion (animation `qNlerp`), per foot IK step, per city block and cell in the streamer, and per landmark
piece in each shadow pass: about 1.16 GB a minute. **Fix:** `Math.sqrt` of the sum of squares in those paths.
The streamer's per-frame closures and `findIndex` were removed, and per-frame `Set` iteration in gfx became
arrays. After: **503 minor GCs a minute**, and `Math.hypot` fell to about 0.18 GB a minute.

Still there (not this crew's areas):
- avatar LOD builds: hair cards, garments, painting;
- three.js's uniform setters;
- Rapier's `removeRigidBody`, which walks **every** collider and allocates an array for each NPC that
  despawns (`unmapRemovedColliders`, 80–500 MB a minute as the crowd turns over).

## 6. Soak

`scripts/soak.mjs --minutes 8 --warmup 3 --home 90` passed: no errors, heap growth 44 MB (limit 100), 52–60 fps. The
same soak of the old build, run right after, failed on heap growth (119 MB) and dipped to 26–43 fps in some minutes.
Both builds show the renderer's geometry count creeping up over the minutes (old 1.8 k → 3.0 k, new 1.3 k → 2.3 k).
That is the PERF-mem crew's leak hunt.

## 7. GPU

Forum, High, 1280×720, after: about 10–11 ms of GPU a frame = scene ~7 + post-processing ~2.8–3.3 + shadow
map ~0.3–0.6 (1.2 ms a pass at 30 Hz). Switching single post passes off (AO, bloom, shafts, contact shadows)
did not stand out from the shared-GPU noise. On the owner's 1512×860 window at device pixel ratio 2 (render
pixel ratio capped at 1.5), the frame has 3.2 × the pixels, so the post chain matters more there. That is
worth a quiet-machine measurement (see "Next").

## 8. Before and after (interleaved, two runs each, means)

`node scripts/perf-budget.mjs --views forum,colosseum,spawn --no-idle`, base commit `b8041fe` against this
branch, alternating. CPU numbers are per frame with the cap lifted (`?fps=0`).

**High**

| View | CPU mean | CPU p95 | Render submit | Slow frames | Draws | Triangles | Boot |
|---|---|---|---|---|---|---|---|
| Forum | 16.1 → 12.7 ms (−21 %) | 23.4 → 20.8 (−11 %) | 9.9 → 6.8 (−31 %) | 22 → 4.5 | 915 → 920 | 2.60 → 2.59 M | 29.6 → 21.4 s |
| Colosseum | 10.9 → 7.3 (−32 %) | 18.0 → 15.1 (−16 %) | 7.7 → 4.4 (−44 %) | 3 → 1 | 987 → 969 | 2.06 → 2.04 M | 27.4 → 20.5 s |
| Porta Capena | 14.8 → 12.2 (−18 %) | 20.9 → 18.3 (−13 %) | 8.6 → 5.7 (−33 %) | 14 → 4.5 | 1219 → 1210 | 2.57 → 2.54 M | 25.8 → 21.2 s |

**Medium**

| View | CPU mean | CPU p95 | Render submit | Slow frames | Draws | Triangles | Boot |
|---|---|---|---|---|---|---|---|
| Forum | 10.7 → 7.6 ms (−29 %) | 13.7 → 9.3 (−32 %) | 6.7 → 4.1 (−40 %) | 2.5 → 0 | 863 → 867 | 2.37 → 2.38 M | 21.5 → 16.1 s |
| Colosseum | 8.6 → 6.9 (−19 %) | 14.1 → 11.4 (−19 %) | 5.9 → 4.1 (−30 %) | 1 → 1 | 986 → 971 | 1.95 → 1.94 M | 20.9 → 17.1 s |
| Porta Capena | 10.9 → 8.7 (−20 %) | 18.1 → 13.4 (−26 %) | 6.5 → 4.2 (−35 %) | 4 → 2 | 1109 → 1110 | 2.30 → 2.26 M | 22.3 → 18.5 s |

Draws and triangles are unchanged by design. The fixes make the same picture cheaper to submit; they do not
draw less.

## 9. The budget gate

`node scripts/perf-budget.mjs` boots the Forum, the Colosseum and the Porta Capena (the views in
`scripts/perf-budget.json` for the tier) and fails (exit code 1) if any of these is over its budget:
CPU mean and p95, render submit, draws, triangles, slow frames over 33 ms, or boot time. It also checks the
idle numbers: the share of paused frames that still draw (≤ 0.15) and the title's frame rate (≤ 32).
- `--graphics medium` checks the Medium budgets.
- `--repeat 2` keeps each timing's best of two runs. Use it on a busy machine.
- `--write-budget` resets the budgets from a run. Do this only for a change meant to cost more or less, and
  say so in the report.

The budgets are the means above (measured on a busy machine) with headroom: timings × 1.3, counts × 1.15, and
slow frames at least 6. A quiet machine passes easily. A change that, for example, brings back the old
per-pass texture uploads (+1 to 3 ms of render submit) fails it. On a very busy machine the timings and slow
frames run over budget even for this branch: a run at load average 24 put the Forum at 11 slow frames and the
boot at 30 s. The gate warns when the load average is over ¾ of the cores. Re-run then, with `--repeat 2`.

## Next (for the crews who own these)

- **Avatars** (the biggest remaining frame cost, about 3 ms of render plus 1.2–1.9 ms of update):
  - Use LOD 3 (one draw, no hair or shells) from about 40 m instead of 55 m.
  - Stop the avatars' shadows at about 20 m instead of 28 m (the blob shadow covers them to 45 m).
  - Split `buildShells` and `assembleBody` into steps, as `paintBodySteps` is. They are now the longest stages of
    a LOD 0 build (10–13 ms on a busy machine).
- **NPCs:**
  - `Actor.locomote` (Rapier's character controller, 60 Hz for every NPC) costs about 1.3 ms a frame. Far
    NPCs could step at a lower rate.
  - Pool NPC capsules instead of removing rigid bodies: Rapier's `removeRigidBody` is O(all colliders).
- **Boot:**
  - Cache the inscription atlas, or render it in a worker with OffscreenCanvas (~1.8 s).
  - Compile shaders against the HDR pass's real variants, which `compileAsync` alone does not do.
  - Build the heightmap in a worker (~0.9 s).
- **GPU:** measure the post chain at the owner's real resolution on a quiet machine. AO at quarter
  resolution, or fewer bloom levels on Medium, are the candidates.
- **The HUD:** `Hud.update` costs about 0.17 ms a frame.
