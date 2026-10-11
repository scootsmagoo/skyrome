# Memory audit, October 2026

PERF-mem crew. Goal: running the game must not leak or bloat memory, on a laptop that runs hot. Base commit `b8041fe` ("Plan: living city and polish (phase 1)"). All numbers are from one Apple M4 Max under Chromium (Playwright, headless, Metal), the Forum at 10:00, a forced GC before every sample. Counts are exact; megabytes are good to about 5 percent (population and streaming move the heap by up to 40 MB between two boots).

## Summary

- **Heap at the Forum: about 1 GB down to about 800 MB** (954 and 1020 MB before in two boots, 803 MB after in three). Renderer process 2173 to 1985 MB, GPU process 1068 to 1051 MB (`scripts/memory.mjs`, counting only its own browser's processes).
- **Geometry (perf.mjs, Forum): 253.1 to 226.8 MB; `city:batches` 115.9 to 90.4 MB.** Textures 930 to 935 and geometries 1150 to 1191 are unchanged (the counts are what is alive in the scene).
- **Four leaks found and fixed.** (1) Hair and headgear geometry orphaned by the cache that held it (about 45 a lap of teleports, never freed). (2) Spawned corpses never leaving (3 MB each, unbounded in one place). (3) `farBake`'s `onUpload` callback kept all 78 MB of the pre-merge parts alive (a V8 closure-context effect). (4) The city plan's scratch grids (35 MB) lived as long as the plan.
- **Run lengths differ.** Cycle phases run their default counts (fights now 50; a fights run under 40 cycles is reported inconclusive, not failed, because the corpse cap and population need about 30 cycles to settle). The leaks soak ran 30 minutes; the bot soak (`soak.mjs`) only 10. The interior, save/load, menu, day/night and Colosseum phases were run on this branch only, with no base-commit comparison.
- **30-minute soak (`scripts/leaks.mjs --phases soak --soak 30`): PASS.** Heap swings between 757 and 875 MB with the place the harness is at. Means of minutes 1 to 10, 11 to 20 and 21 to 30: 802, 822 and 823 MB (the first step is the avatar and hair caches filling), so about +20 MB then flat; the harness verdict is +40 MB from minute 5 to the end against the 100 MB limit.
- **Every cycle phase is flat** after the fixes (table below): 8 laps of teleports, 20 interior enters and exits, 20 save/loads, 50 menu rounds, 50 fights, 24 hour changes, 6 Colosseum games. Fights needed two harness corrections, see "Fights, re-checked".

## Where the heap goes

`performance.memory.usedJSHeapSize` at the Forum is 954 to 1020 MB, but only about 110 MB of it is JavaScript objects. The rest is **ArrayBuffer backing stores (about 810 MB)**: vertex arrays, textures kept on the CPU, the Rapier WASM memory, decoded audio. Tools to see this (all new, in `scripts/`):

- `heap-sites.mjs`: V8's sampling heap profiler from before boot, live memory by allocation site. It sees objects, not the big arrays.
- `heap-summary.mjs`: reads a `.heapsnapshot` (370 to 400 MB of JSON, so it scans the bytes itself). By type and name, with `--owners N` the shortest retainer chain of the largest ArrayBuffer backings (`Float32Array.buffer <- BufferAttribute.array <- ... <- BatchedMesh.geometry`), and `--diff other` for the growth between two snapshots.
- `leaks-probe.mjs`: runs teleport laps and censuses the scene by group; with `--track` it lists geometries the renderer uploaded that nothing frees, with the file and line that built them.

The big retained arrays at the Forum before this work (boot snapshot, backings of 1 MB and more):

| Retained by | MB | Kept? |
| --- | --- | --- |
| Rapier WASM linear memory (43.8k colliders) | 55 to 59 | needed, never shrinks |
| `BatchedMesh` geometry of the city and landmark pools (position, uv, normal, ...) | about 100 | needed while streaming |
| `farBake` pre-merge `parts`, held by a closure context | 78 | **freed** |
| Terrain ground layers (`albedo` 36, `surface` 9), CPU copy after upload | 45 | **freed** |
| City plan scratch grids (`lab`, `mark`, `depthGrid`, `bfsQueue`, 4 x 8.6) | 35 | **freed** |
| Procedural textures of materials not yet drawn (map, aoMap, normalMap, 28 x 1.6 MB each) | 53 | freed by their first draw (`releaseTextureAfterUpload`) |
| Inscription atlas pages still open for new panels (3 styles x 4 MB x 3 maps) | 28 | kept: a new page costs the same |
| Heightmap `heights`, `padMask`, `roadMask` (8.6 MB each) and `Terrain.data` a, b | 43 | needed (physics, reeds, terrain sampling) |
| Body morph arrays of the avatar cache (`RealBody.entry`: position, normal, tangent) | 41 | needed to build LODs lazily |
| Decoded audio samples | 24 | needed |
| Script source text of three.js and Rapier (dev server only) | 52 | dev only |

## Fixes

1. **Hair and headgear cache orphaned geometry** (`src/actors/avatar/real/head/index.ts`). `Cache.acquire` inserted the new entry and trimmed *before* taking its reference. With the map full of held entries (the crowd is about 140 heads, the cap 96) the newest entry was the only unheld one, so it was evicted and disposed on the spot, handed to the caller anyway, uploaded on first draw, and its later `release` found nothing. Each look past the cap leaked its hair geometry and the three.js state (`WebGLBindingStates` keeps the attribute objects) for good. About 45 per lap of 12 teleports; `renderer.info.memory.geometries` climbed 1560 to 2020 over 10 laps. Fix: take the reference first, then trim. `tests/head-cache.test.ts`.
2. **`farBake` kept its parts alive** (`src/world/landmarks/farBake.ts`). The `free` callback was a closure created inside `bakeLandmarkFar`; V8 gives all closures of one function one context, so the context kept `parts` (every baked piece, 78 MB at the Forum) alive for as long as the stand-in geometry lives. Fix: one module-level `freeArray` in `src/gfx/release.ts` (also used by `batches.ts`). The release.ts header now says why.
3. **City plan scratch** (`src/world/city/plan.ts`). The same context effect: the plan returns closures (`inDetail`, `corridor`) from the function that holds four 8.6 MB scratch grids. They are `let` now and replaced by an empty array before the plan returns.
4. **Terrain ground layers** (`src/world/terrain/groundTextures.ts`): the `DataArrayTexture`s are released after upload like every other CPU-side texture (45 MB).
5. **City batch normals as bytes** (`src/world/city/batches.ts`): `Batch.add/instance/addGeometry/shape` run `packNormals`, which saves 9 of 12 normal bytes per vertex in the CPU copy and on the GPU. City batches 115.9 to 90.4 MB, geometry total 253.1 to 226.8 MB (perf.mjs). Every geometry a batch takes must come through those calls so the batch's attribute types match (a unit test checks it).
6. **Corpse cap** (`src/combat/CombatSystem.ts`, `MAX_CORPSES = 12`). Spawned corpses stayed for 3 game days or until 160 m away. Each holds its own avatar, bones and gore pieces (about 3 MB). The farthest beyond 12 now leave, except corpses in view (within 45 m, in front of the camera), which stay up to `MAX_CORPSES_SEEN = 24` so none pops out in front of the player. Before: 20 fights at one spot, heap +72 MB, 61 more combatants, 65 more textures. After: flat.

### Fights, re-checked

A review re-ran the phase and it failed (10 cycles: geo +110, then heap +27 MB). Two causes, neither a leak in the game:

1. **Warm-up.** Three corpses a cycle, cap 12: the corpse count (and its 3 MB each) only plateaus after four cycles, and the harness warmed up two. Fights now warm up six.
2. **Guards.** `killall` in the city is murder; the crime system sends guards, and the wanted level climbs with every cycle (actors 15 to 35, plus their looks). The cycle now runs `pardon` first.
3. **Geometry counter drift.** `renderer.info.memory.geometries` still creeps in a living city. The control phase `idle` (nothing but waiting five seconds a cycle) shows +93 geometries over 50 cycles with a flat heap: NPCs walk into view and their meshes first upload. The look caches (`looks` in the table, hair + gear + body) stay flat at 265 to 280, and orphans stay 0 to 9. So outside the lap-sampled teleport phase `geo` is judged with a 20 % band.

After: 50 fights 853 to 882 MB (884 at cycle 25), actors flat, `looks` flat; 50 idle cycles 881 to 874 MB. Verdict PASS for both. New harness columns: `geoScene` (unique geometries in the scene), `looks` / `looksHeld` (cache entries and the ones a live actor holds).

Smaller changes: `headCacheStats`/`headCacheGeometries`/`realCacheGeometries` debug exports (the probe uses them to tell cached geometry from orphans).

## Cycle results

`node scripts/leaks.mjs` (first sample after warm-up to last, same harness before and after; before = base commit with the new harness copied in).

| Phase | Cycles | Before: heap, geometries | After: heap, geometries | Verdict after |
| --- | --- | --- | --- | --- |
| Teleports (12-place lap, sampled at the same place) | 48 / 96 | 971 to 999 MB, 1596 to 1766 (geo +170); a 10-lap run 774 to 827 MB, +380 | 768 to 758 MB (8 laps), 1560 to 1562 | flat |
| Interior enter/exit (Column stair) | 20 | flat | 827 to 822 MB | flat |
| Save, then load | 20 | flat | 828 to 831 MB | flat |
| Menus, map, inventory, dialogue | 50 | 1078 to 1092 MB | 831 to 849 MB | flat |
| Fights (spawn 3, killall, knock) | 20 | 1001 to 1073 MB, actors +61, textures +65, objects +2719 | 853 to 882 MB over 50 cycles (plateau from cycle 5), actors flat | flat, see "Fights, re-checked" |
| Day/night (sethour) | 24 | not run | 875 to 841 MB | flat |
| Colosseum games (munus) | 6 | not run | 781 to 782 MB | flat |
| Mixed soak, 30 min | 1 | not run | means per ten minutes 802, 822, 823 MB | PASS |

Tracked in every sample: JS heap, renderer geometries, textures and programs, materials and objects (scene walk), Rapier bodies and colliders, actors and NPCs, live AudioNodes (DevTools WebAudio events), DOM nodes (attached and not), event listeners, intervals and pending timeouts, and with `--orphans` the geometries nothing will free. Not leaks, but worth knowing:

- Audio nodes are created at about 3000 a fight cycle (synthesized hits) and the live count stays between 100 and 400: churn, no growth.
- Rapier colliders: 43.9k at the Forum, 45.4k after visiting the Column and back. The interior's colliders stay built, which is by design.
- The console keeps up to 400 log rows of DOM even when closed; the harness empties it so DOM counts mean something.

## What is left (not leaks)

- **The heap is mostly arrays.** The biggest remaining steady consumers are Rapier (about 58 MB), the batch pools' CPU copies (about 100 MB: needed while the city streams; `Batch.finish` frees them for pools that are done), the avatar body morph arrays (about 41 MB), and the open inscription atlas pages (28 MB). Ideas, not done: pack `padMask`/`roadMask` to bytes (about 13 MB, touches `Heightmap`), keep avatar morph arrays only until all three LODs exist, seal the atlas pages when streaming is quiet.
- **`renderer.info.memory.geometries` and `.textures` are counts of what was uploaded and not disposed,** not what is alive. A geometry that is dropped without `dispose()` stays in the count for ever and keeps three.js state; this audit's orphan tracker is how to find those. The equipment (shields, weapons) and a few NPC props leave about 10 undisposed geometries, constant, not growing.
- **Avatar caches are bigger than their caps while avatars hold them**: 140 live heads, 142 held body entries. The caps (`MAX_ENTRIES` 40, hair 96, gear 48) only bound the idle ones.
- Lazy textures: the procedural textures of materials nobody has looked at yet stay on the CPU (53 MB at boot) until the first draw. A long session uploads them all and frees them; forcing the uploads at boot would only move the cost to the loading screen.

## Using the tools

```
node scripts/leaks.mjs                         # every phase, about 15 minutes; exits 1 on growth or a page error
node scripts/leaks.mjs --phases teleport,fights --scale 0.5 --orphans
node scripts/leaks.mjs --phases soak --soak 30 # 30 minutes of mixed cycles
node scripts/leaks.mjs --phases fights --snapshot fights   # .shots/leaks/fights-{before,after}.heapsnapshot
node scripts/heap-summary.mjs a.heapsnapshot --owners 30 --min 0.25     # who holds the big arrays
node scripts/heap-summary.mjs a.heapsnapshot --diff b.heapsnapshot      # what grew between two
node scripts/heap-sites.mjs --top 30           # live objects by allocation site (and --snapshot file)
node scripts/leaks-probe.mjs --track --laps 4  # undisposed geometries by builder
node scripts/memory.mjs                        # JS heap and the browser's own RSS
```

A phase flags growth when the second half of its samples kept growing past 5 percent of the counter (heap: more than 1.5 MB a cycle), so streaming and the living world do not trip it. Teleports compare samples taken at the same place only. Never edit source while a run is in flight (Vite serves the new file to the next page load).

## Notes from review

- `packNormals` mutates the geometry it is given. Every caller of `Batch.add/addGeometry/instance/shape` hands the geometry over (the builder's geometry is disposed right after, or `prep` made a private one), so nothing keeps float normals; the contract is now written on those methods.
- Releasing CPU pixels (terrain layers, 45 MB) means a WebGL context loss cannot re-upload them. The game has no context-restore path for any of its released data (city batches included), so a lost context needs a page reload; noted in `groundTextures.ts`.
- Renderer `geometries` creeps in a live city (+190 over 50 fights, +90 over 50 idle cycles) while the scene's unique geometry count and orphan count stay flat. That counter is uploads minus explicit disposes, and NPCs walking into view upload their meshes for the first time; it is not alive memory, so the harness judges fights and idle by heap and look caches. Colliders creep the same way (+350 over 50 fights) as chunks and NPC bodies stream; the heap and body counts are flat, so it was not chased further.

## Phase 3 (October 2026): shrinking the steady memory

P3-MEM crew. Base commit `d47f573` ("Plan: phase 3"). Same machine and method as above: an M4 Max,
Chromium headless on Metal, the Forum (`at=rostra&hour=10`), a forced GC before every sample;
`scripts/memory.mjs --runs 3` (median of three boots) and a snapshot read with
`scripts/heap-summary.mjs --by-owner`. Several other agents shared the machine (load 15 to 65), which
moves timings a lot and memory hardly at all (the heap was 853 MB in all three baseline boots).

### Results

| Forum, after GC | Before | After |
| --- | ---: | ---: |
| JS heap, dev server (three boots, twice) | 853 MB (853, 853, 853) | **497–527 MB** (497, 527, 497; 527, 497, 527) |
| JS heap, production build (`--prod`, 2 boots) | 756 MB | **441 MB** |
| Geometry on the CPU, `memory.mjs` (scene, unique) | 210 MB | **161–163 MB** |
| Geometry, `perf.mjs --views forum` (after its four-way look) | 224 MB | **160 MB** |
| City batches: live / allocated vertices | 2.51 M / 3.21 M | 2.51 M / 2.77 M (the far batch exact) |
| Page process RSS / GPU process RSS | 2019 / 1022 MB | 1903 / 986 MB |
| `renderer.info.memory.textures` | 1027 | 1029 (see "Textures") |

The dev server's heap holds about 75 MB more than the production build: every module's source text
with its inline source map (three.js 11 MB, Rapier's compat build 10 MB with its WASM as base64).
The owner plays the production build. RSS falls less than the heap: the allocators keep some of the
freed pages for reuse.

Where the arrays went (native backings of 1 KB or more in the snapshot, by owner; the crowd differs
between two boots, so the avatar row is approximate):

| Owner | Before | After | What changed |
| --- | ---: | ---: | --- |
| Avatars: body caches, morphed bodies, heads, geometry in the scene | 144 MB | 65 MB | morph LRU, heads hold no body, attributes packed, shared eye attributes |
| Build-time caches (column parts, instance shapes, the batcher's copies, kit pieces, prop builders) | 58 MB | 0 | dropped when Rome stands |
| Builder `DataTexture` pixels (Trajan's materials, reliefs, friezes, granite, far amphitheatre, hair) | 53 MB | 4 MB | freed after upload; what is left waits for its first draw |
| City batches | 72 MB | 43 MB | far batch finished, smaller start |
| Audio PCM (bank, recordings) | 43 MB | 23 MB | 16-bit stash until first played |
| Open inscription atlas pages | 28 MB | 0 | pages on the GPU only |
| Compressed (KTX2) pixels kept after upload | 21 MB | 5 MB | body maps freed after upload |
| Heightmap road and pad masks | 17 MB | 0 | dropped after the build |
| Rapier's JS copies of collider shapes | 11 MB | 0 | `clearShapeCache` |
| Static water meshes | 8 MB | 4 MB | released after upload (the rest is not drawn yet) |
| Rapier WASM memory | 56 MB | 56 MB | needed |
| Script source text (dev server only) | 76 MB | 76 MB | not in the production build |
| **All native backings ≥ 1 KB** | **737 MB** | **424 MB** | |

### What changed

1. **Build caches** (`registerBuildCache` / `releaseBuildCaches` in `gfx/release.ts`, called at the
   end of `buildRome`). Column parts (`classical/column.ts`, 20 MB), MeshBuilder's prepared instance
   shapes (12 MB), the landmark kits' pieces (`trajan-kit`, `forum-kit`, `generic-*`, `palcirc/*`,
   `capfora/ornament`) are memo caches that only the build reads. `LandmarkBatcher.finish` drops its
   prepared copies (19 MB: the keys, the shared instance shapes, outlived the build). Props drop their
   builder once the model is made (`props.ts`), and a `MeshBuilder` that a long-lived closure still
   holds is emptied with the new `dispose()` (the Colosseum's zone hook kept its four builders; its
   instance LOD sets kept their level builders).
2. **Builder textures freed after upload.** `trajan-materials`, `relief`, `capfora/paint` (granite),
   `amphitheatreFar` and the hair texture now use `releaseTextureAfterUpload` like the library's
   procedural sets; the body's KTX2 normal and AO maps use the new `releaseCompressedAfterUpload`
   (shared with `materials.ts`). None of these textures is cloned with other sampling parameters or
   edited later (checked: no `clone()` of a material texture outside `materials.ts`, anisotropy is only
   set at creation, one renderer).
3. **Avatars** (`real/RealBody.ts`, `real/head/index.ts`, `real/pack.ts`). The morphed template
   (position, normal, tangent per LOD) lived on every cache entry (42 MB) plus the shell profiles keyed
   by it (10 MB); it is now an LRU of the 12 newest entries (making one again is a fraction of a
   millisecond and gives the same arrays). Worse, every head kept its person's LOD 0 body alive through
   `setLod`'s closure context (33 MB at the Forum): `buildHead` now takes a `bodyLater` getter and its
   closures no longer name `ctx`, and a hair build asks for the body only when it builds a beard (it
   used to evaluate it for every hair LOD). Cost, counted over 25 s of boot, a 360° pan and a walk at
   the Forum: 522 morphs made against 441 with an unbounded cache (+30 ms in all, about 0.02 ms a
   frame); before the beard guard it was 700 (+99 ms). Finished geometry is packed (`packSkinned`): skin weights, colours and
   UVs to normalized uint16, normals, tangents and hair strands to normalized int16, bone indices to
   uint8; an attribute with any value out of range stays float (a hair colour at 1.007 does). This
   halves those arrays on the CPU and on the GPU; the shaders read the same floats (WebGL normalizes on
   fetch, errors under 2·10⁻⁵). Packing is its own staged-build step (`stageMax.pack`, about half a
   millisecond for LOD 0 on a quiet machine; `Math.round` was several times slower in these loops than
   adding a half). The gore cuts index `.array` directly and now read through `floatsOf`. The eye
   attributes that do not depend on the person are one attribute per sex; an evicted entry takes them
   off its eye geometry before `dispose()`, which would otherwise delete their GL buffers under
   everyone else's eyes (three.js would not re-bind them: the attribute objects are unchanged).
4. **The far batch** (`world/city/index.ts`): massing and street ribbons are added at boot only and then
   only shown and hidden, so the batch is `finish`ed: shrunk to its live size and its arrays freed once
   uploaded (23 MB). The city's batches start at 2048 vertices instead of 8192: half of the 93 hold a
   few hundred to a few thousand vertices (8 MB of empty capacity, CPU and GPU).
5. **Inscription atlas pages on the GPU** (`arch/common/inscription.ts`, `setInscriptionRenderer` in
   main.ts). A page is texture storage without pixels (`source.dataReady = false`); each panel is
   rendered on its own, with its padding smeared, and copied into the page with
   `renderer.copyTextureToTexture`, which also rebuilds the mips. The three open pages were 28 MB, and
   every new sign used to re-upload its whole page (3 × 4 MB). Carved pages keep their AO/roughness in
   RG8 (no metal channel needed): half of that map on the GPU, about 30 MB at the Forum. Check: every
   page, map and mip level read back from the GPU (levels 0 and 3, 114 in all) hashed the same as the
   old CPU pages (`?lodoff=gpuatlas`); one later boot differed on one page in both modes alike (the
   order panels arrive in varies).
6. **Audio** (`audio/AudioEngine.ts`, `audio/pcm16.ts`). The worker pre-bakes every one-shot and the
   recordings are decoded at start-up; all of it then sat as float PCM (headless, no gesture yet) or
   became float AudioBuffers (in play): 43 MB. A pre-baked sound now waits in a stash as 16-bit PCM
   (CD depth: the rounding is 96 dB under full scale) and gets its AudioBuffer on first play, in well
   under a millisecond; a sound requested by a play is uploaded at once. The packing itself runs about
   a millisecond a frame (`packStash`): the recordings arrive together, and packing them in one go
   was a long task. At the Forum the stash holds
   about 20 MB; after a few seconds of play about 15 MB has turned into AudioBuffers.
7. **Smaller things.** The heightmap's road and pad masks (17 MB) are only read while the world is
   built (the terrain's data textures, the reeds) and are dropped after (`releaseBuildMasks`).
   `Physics.track` clears rapier.js's JS copy of each collider's shape (`clearShapeCache`: trimesh
   vertices and indices, heightfield heights, 11 MB; rapier rebuilds it from the WASM side if asked).
   The water surface, quays, canal and island facing are released after upload (`releaseStaticMeshes`).

### Textures

`renderer.info.memory.textures` stays about 1,030 at the Forum. There are no duplicates: every
material texture source is on the GPU once (248 GL textures for 305 material texture objects; clones
share). The count is structural: 239 matrix and 238 draw-list textures of the 258 BatchedMeshes (one
pair per batch however small; 137 of them hold 8 instances or fewer), about 150 shadow draw lists
(`fastCull`), 130 bone textures (one per skinned person), 248 material textures and a few render
targets. Halving it means merging the tiny batches (a draw-structure change: P3-GPU's) or a different
skinning path; not done here. Memory-wise the biggest textures are the inscription pages (21 at the
Forum, 1024² RGBA8 with mips: about 300 MB of GPU memory, now about 30 MB less) and the photo sets
(2K, already KTX2).

### Checks

- `npx tsc --noEmit -p .` clean; `npx vitest run`: 205 files, 2495 tests pass (new: `real/pack.test.ts`,
  `tests/audio-pcm16.test.ts`).
- Same-camera screenshots (four views × four directions, NPCs hidden, time paused, UI hidden) against
  the base build: differences stay within what two boots of the base build differ by (the player's
  idle pose, flags and leaves in the wind, shadow-map texel jitter); crops of inscriptions and reliefs
  are identical to the eye.
- Gore on packed bodies: an enemy cut three times at LOD 0 (arm, shin, head) with no error.
- Audio: the stash fills without a context, and after unlocking sounds play and move from the stash to
  AudioBuffers.
- Leaks (`scripts/leaks.mjs --orphans`, every phase): the heap is flat in every phase (teleport 526 →
  564 MB with the crowd at the lap's end, interior, save/load, menus, fights 632 → 642 MB over 50
  cycles, idle, day/night, Colosseum games). Flags that also show on the base build or come and go
  between runs: DOM nodes and listeners in teleport (the base: DOM +26) and idle (one late UI sample).
  Day/night flagged "audio buffers +1.3 MB": sounds playing for the first time leave the stash for
  AudioBuffers, which the harness counted as growth; it now judges buffers plus twice the stash, and
  a re-run of fights and day/night on the final code passes. One fights run on a machine at load 40
  to 100 kept spawned enemies alive past `killall` (actors 27 → 117); two later runs of the same code
  and one of the base build stayed at about 35 to 45 actors.
- 30-minute soak (`scripts/soak.mjs --minutes 30`): PASS, no crash, no page error, median heap 507 MB
  from minute 5 and 499 MB at minute 28 (−8 MB; limit +100).
- Golden path (`scripts/golden-path.mjs`): PASS, all four chapters of Act I in 13 minutes (the 22
  movement snags are MOVE's: the bank by (148, 118), the wall by (299, 164)...).
- `npm run check:controls`: all checks pass (Chromium and WebKit, three presets).
- Performance gate: `node scripts/perf-budget.mjs --repeat 2` PASS on the dev server (load 14): Forum
  CPU 9.4 ms mean / 14.1 p95, render submit 4.7 ms, 973 draws, 2.74 M triangles, 2 slow frames;
  Colosseum 6.6 / 11.6 / 3.7 ms; spawn 10.3 / 16.7 / 4.5 ms (the plan's baseline: Forum 10.2 / 14.4 /
  5.2 ms). Interleaved against the base on production builds (three rounds each, load 10 to 39,
  medians base → new): Forum CPU 17.0 → 12.0 ms, render submit 8.2 → 6.3 ms, slow frames 5 → 2;
  Colosseum 7.3 → 7.2 ms; spawn 11.4 → 14.6 ms (its quietest round 11.0 → 10.2). Draws and triangles
  are the same; the timings move with the load more than with the change. The quietest round passes
  the gate for both builds. (An earlier interleaved run on dev servers looked worse for the new build,
  mostly in boot time: the agents share one `node_modules/.vite` and its dependency cache was being
  re-optimized under it; the production builds avoid that.)

### Tools added or extended

- `scripts/memory.mjs --runs N --prod --json f`: the median of N boots, the production build, and per
  boot the geometry by group, texture classes and the city batches' live and allocated vertices.
- `scripts/heap-summary.mjs f --owners N --by-owner`: every backing of 1 KB or more under its nearest
  three.js owner and the named scene group above it (or the class or closure variable that holds it).
- `?lodoff=gpuatlas`: the old CPU-side inscription pages, for A/B runs.

### What is left

- **Rapier's WASM memory** (56 MB, 44 k colliders) never shrinks; fewer colliders is the only lever.
- **The city's streaming batches** (43 MB on the CPU, the same on the GPU) need their arrays while
  blocks stream in and out. Indexing them would keep about 61 % of the vertices (measured over the
  Forum's batches) plus 4-byte indices, about a fifth less, for a weld on every streamed commit; not
  done (CPU per commit on a laptop that runs hot).
- **Avatars** (about 50 MB at the Forum's crowd after packing): positions, the cloth and deform
  attributes (`cloth`, `trim`, `legs`, `aDef0/1`: ranges beyond [−1, 1] that half floats would
  round) and the cached LODs of people in the crowd.
- **Terrain and plan grids** (about 50 MB: the terrain's data layers and heights, the plan's heights,
  owners and classes) are read at run time by footsteps, the streamed ground cover and the minimap.
- **Lazy uploads**: meshes and textures nobody has drawn yet keep their arrays until their first draw
  (about 25 MB at the Forum: Trajan's near LODs, far stand-ins of the Forum's own landmarks, a
  procedural set). Uploading them early would only move the bytes to the GPU.
- **Textures**: see above; the count needs fewer, bigger batches.
