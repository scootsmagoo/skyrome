# Mobile crash (iPhone Safari), October 2026

## Symptom
On an iPhone 15-class phone the loading bar ran twice and then the page went blank. That is iOS killing
the tab's WebContent process for memory: Safari reloads the page once, the second load dies the same
way, and Safari gives up. Chrome on iOS is WebKit too and behaves the same.

## Diagnosis
Nothing fails to parse or run on WebKit. A production build boots to `ready` in Playwright WebKit with
iPhone emulation, with no page errors. Samplers per program, WebGL extensions and the JS APIs used are all
within what iOS offers. The cause is memory at boot:

- During the landmark and city builds the JS heap climbs to about 1.1 GB with a forced GC (1.3 to
  1.5 GB without one). Most of it is ArrayBuffers: the landmark batches' vertex arrays (about 375 MB, 15.5M
  non-indexed vertices), procedural texture pixels, and Rapier's WASM memory (about 56 MB).
- The GPU estimate (from hooking `texStorage`, `bufferData` and `renderbufferStorage`) was about 1.15 GB.
  Of that, 712 MB was textures; the procedural 1024² sets were over half of it.
- BatchedMesh arrays upload on the first draw, so every CPU copy is alive until the first frame. This is
  why CPU and GPU peak together.
- An iPhone was rated High: its GPU calls itself "Apple GPU", and Safari has no `deviceMemory`.

Measurements are Chromium with SwiftShader, a production build, 393×852 at DPR 3, and the default `/`
boot. They are comparable between rows, not absolute.

| | CPU heap peak (GC'd) | CPU peak, no forced GC | GPU estimate | Combined peak (sampled) |
|---|---|---|---|---|
| Before | 1101 MB | 1448 MB | 1158 MB | 1599 MB |
| After the phone savers | 954 MB | 1310 MB | 757 MB | 1191 MB |

## What phones get now
- **The Low tier.** Auto picks Low on any phone (`isMobileDevice` in `src/core/graphics.ts`), with a
  pixel ratio of 2 at render scale 0.75. `?mobile=1` or `?mobile=0` forces the answer either way.
- **Memory savers** (`src/gfx/mobileLite.ts`; turn them off with `?lite=0`, pick them with
  `?lite=proc,ktx,...`). Later rounds added `flush`, `gens`, `detail`, `bodies` and `rapier` (see the
  status below). The first four, with approximate GPU savings that overlap:

  | Saver | What changes | Saved |
  |---|---|---|
  | `atlas` | Inscription atlas pages at 512 px | about 200 MB |
  | `ktx` | No top mip on the KTX2 photo sets | about 105 MB |
  | `proc` | Procedural sets box-filtered to half size | about 85 MB |
  | `ground` | Smaller terrain layer arrays | about 46 MB |

- **Readable failures** (`src/core/bootGuard.ts`):
  - an error before `ready` shows a banner instead of a blank page;
  - a lost WebGL context shows a Reload screen;
  - on a phone, a load that died before 20 s of play leaves a note the next load shows.

## Status, 12 October 2026 (evening)
Each round below was tried on the owner's iPhone 15 Pro.

| Round | Commit | Result on the phone |
|---|---|---|
| Low tier and lighter textures | 6659dd9 | Died as the loading bar finished |
| Upload during loading (`flush`) | 85d27cd | Once died at "Baths of Nero"; once showed the world for a moment |
| Batch generations and `detail` | 4f84f1e | Loads, plays about 16 s, dies (page memory, not context loss); once came back under the city after the crash |
| Portrait touch layout, play-time churn (`bodies`, `rapier`, crowd 0.3) | 9849ffe, a975e9a | Died 10 s into play; once during loading; once the view from under the city |
| Allocation-free polygon loops, core-sized world (`area`) | eae559a, 760de9f | Not tried yet |

**Play-time churn.** Measured with `node scripts/perf-gc.mjs --view forum --seconds 20 --walk --query "mobile=1"`.
Walking allocated about 9 GB a minute before these rounds and about 4.3 GB after the earlier phone flags. The
`bodies`, `rapier` and crowd changes bring it to about 2.5 GB a minute. Most of it was people's bodies being built
(`paintLeg`, `morphBody`, `paintTorso`, head cards).

**Under the city after a crash.** Not diagnosed. Phones now show the first errors after loading in a banner,
which should explain it next time.

## Measure phone memory in WebKit, not Chrome (13 October)
Chrome's numbers (V8) badly understated the iPhone. Run the phone path in Playwright's WebKit, which has
JavaScriptCore and WebKit's allocators like iOS. Sample the `WPEWebProcess` resident memory from `/proc`, and
split it by mapping in `/proc/<pid>/smaps`:

| Mapping | What it holds |
|---|---|
| `[anon:WKFastMalloc]` | WebKit's allocator: JS objects and arrays, WebCore |
| `[anon:JSGigacage]` | Typed-array backing stores |
| `[heap]` | glibc malloc. Here that is mostly the software GL driver, which on an iPhone lives in the separate GPU process and does not count |

Two things make WebKit on this machine differ from an iPhone:
- **The GC thinks it has 128 GB.** JavaScriptCore sizes its full-collection thresholds from the RAM it sees, so
  it piles up gigabytes of garbage. Launch it with `JSC_forceRAMSize=3221225472` to act like a phone.
- **`JSC_logGC=1`** logs every collection, with heap sizes.

With 3 GB forced, the phone path (eae559a, 760de9f) peaks at about 3.5 GB of process memory, about 1.2 GB of it
the software GL heap. That puts the iPhone page at roughly 1.4–2.3 GB.

| Run | Peak | Note |
|---|---|---|
| Savers off (`?lite=0`) | 4.3 GB | |
| No city (`?city=0`) | 3.2 GB | The city costs only about 0.3 GB |
| `?scene=sandbox` | 0.9 GB | |

Without the forced RAM, the same build peaks at 5–6 GB, mostly about 2 GB of JS garbage in `WKFastMalloc`. That
garbage is freed only some 10–20 s into play.

**Boot allocation.** A sampling heap profile with collected objects counts every allocation (CDP
`HeapProfiler.startSampling`, `includeObjectsCollectedByMajorGC` and `includeObjectsCollectedByMinorGC`).
- The boot allocated about 20 GB of short-lived JS objects.
- The worst sources were array destructuring in point-in-polygon loops: `const [x, z] = p` allocates an iterator.
- Fixing those (eae559a, same output) brought it to about 13 GB.
- The next ones are spread thin: the heightmap's per-cell `fn` (0.5 GB), three.js shader string `replace`s
  (0.4 GB), `mergeVertices` (0.4 GB) and geometry sweeps (0.7 GB).

## If phones still die
While loading (ranked by expected win):
1. **Upload each landmark batch as it is built, then free its arrays.** Done (`flush`, then `gens`: batches
   capped at 500k vertices are uploaded as they fill).
2. **Index the landmark batches.** Not done. `landmarkBatch.ts` `prep()` builds them non-indexed. Expected:
   about 180 MB less GPU memory and about the same less on the CPU.
3. **Pre-size the landmark batch capacity.** Done (presize, clamped to the generation cap).
4. **Start `loadRealBodies` after the city on phones.** Not done; bodies are about 65 MB live, and the
   measured peak difference was within noise.
5. **Load the priority-2 landmarks at low detail.** Done (`detail`).

At play time (the current crash), the next levers are:
1. **Pool or reuse the scratch typed arrays of a body build** (morph, paint, assemble), or raise the morph LRU from 12
   entries (about 70 looks are live). JavaScriptCore probably doesn't free that garbage in time.
2. **Spread the street-sheet and polygon work** (`emitSheet`, `pointInPolygon`, about 100 MB a minute) over frames.
3. **Rapier's `computeColliderMovement` wrapper** allocates about 125 MB a minute.
4. **Bisect on the phone with `?lite=`** to see which flags matter, for example
   `?lite=proc,ktx,atlas,ground,flush,gens,detail` against `?lite=1`.

## Checklist on a real iPhone
1. `?scene=sandbox` (about 150 MB): if this fails, the cause is WebGL or an API, not memory.
2. `?scene=city` (close to the full game, with no player or UI): if this dies, the city content is the
   limit.
3. `/` (phone defaults), then `/?lite=0` to see whether the savers matter.
4. Safari's Web Inspector, from a Mac, shows the console and the memory timeline. After a crash, the
   next load's banner says so.
