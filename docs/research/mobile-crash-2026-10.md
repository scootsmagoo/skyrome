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
  `?lite=proc,ktx,atlas,ground`). Approximate GPU savings, which overlap:

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

## If phones still die
These are ranked by expected win. None is done yet.
1. **Upload each landmark batch as it is built, then free its arrays.** This is the only change that really
   lowers the CPU peak. Three.js has no public "upload now" call, so it needs a safe way to force one.
2. **Index the landmark batches.** `landmarkBatch.ts` `prep()` builds them non-indexed. Expected: about
   180 MB less GPU memory and about the same less on the CPU.
3. **Pre-size the landmark batch capacity.** Regrowth at 1.6× per step leaves 100 to 300 MB of garbage
   while loading.
4. **Start `loadRealBodies` after the city on phones.** Bodies are about 65 MB live.
5. **Load the priority-2 landmarks at low detail.** Saves about 60 MB GPU, but it is visible.

## Checklist on a real iPhone
1. `?scene=sandbox` (about 150 MB): if this fails, the cause is WebGL or an API, not memory.
2. `?scene=city` (close to the full game, with no player or UI): if this dies, the city content is the
   limit.
3. `/` (phone defaults), then `/?lite=0` to see whether the savers matter.
4. Safari's Web Inspector, from a Mac, shows the console and the memory timeline. After a crash, the
   next load's banner says so.
