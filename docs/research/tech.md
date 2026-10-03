# SKYROME: Technical Architecture Research

> **Status:** v1, 2026-10-03. Written by the tech-research agent for the owner and the dev agents.
> **Scope:** engine choice, rendering (three.js r186), physics (Rapier 0.21), world streaming, characters and animation, NPC navigation, code architecture, UI, audio, testing, and a perf budget.
> **Versions checked on npm today:** `three` 0.186.1 (r186), `@types/three` 0.186.0, `@dimforge/rapier3d-compat` 0.21.0, `vite` 8.3.2, `typescript` 7.0.2, `vitest` 5.0.3, `@playwright/test` 1.63.0, `three-mesh-bvh` 0.9.15, `postprocessing` 6.39.5, `recast-navigation` 0.43.1, `navcat` 0.4.1.
> **How this was verified:**
> - API names were checked against the published tarballs (`.d.ts` files and source), not from memory.
> - Behavior and cost were measured with micro-benchmarks on the owner's own Mac (Apple **M4 Max**). They ran in Playwright's Chromium 153 (new headless, real Metal GPU) and Playwright's WebKit 26.6 (headless, real GPU, WebGPU on).
> - Methods and raw numbers are in [Appendix A](#appendix-a-benchmarks-run-for-this-document).
> - WebKit numbers stand in for Safari 26. They come from the same engine but not the same app. Re-check anything critical in real Safari.
>
> **Legend:** "**Measured**" means we ran it. "**Verified**" means we read it in the shipped source or types. Anything else is cited or flagged as an estimate.

---

## 0. Decisions at a glance

| Topic | Decision for now | Revisit when |
|---|---|---|
| Engine | **three.js r186 + TypeScript + Vite 8 + Rapier 0.21 (compat)**, in the browser | Vertical slice done (one Rome district playable). See §1.4 for the long-term gate. |
| Renderer | **`WebGLRenderer`** (not WebGPURenderer). Keep custom shader code isolated so a later port is cheap. | WebGPURenderer matches WebGL's per-draw CPU cost and fixes Safari compile stalls (§2.1). |
| Shadows | One **sun shadow map that follows the player**, snapped to texels, 2048², about 60–80 m half-extent. `PCFShadowMap` (PCFSoft is deprecated in r186). CSM as a "High" option later. | Shadow quality complaints at distance. |
| Tone mapping | **AgX** plus a sky-driven exposure. Neutral is the fallback if palette fidelity matters more. | Art-direction pass. |
| Draw-call strategy | Merge static geometry per chunk per material. Use `InstancedMesh` for repeated props, per chunk. Use HLOD meshes per 256 m region. `BatchedMesh` only where per-instance culling pays off. | Draw calls > 800 in profiling. |
| Physics | Rapier compat: `await RAPIER.init()`, no args. Heightfield per chunk. Primitive colliders for architecture. Ramps under stairs. KCC for the player and nearby actors only. | Never, unless we leave the web. |
| Streaming | 64 m chunks, 256 m HLOD regions, separate worldspaces per map. Deterministic per-chunk seeds. Workers generate typed arrays, and the main thread builds GPU and physics objects time-sliced. | When Ostia or Latium are added (floating origin). |
| Characters | Procedural skinned humanoids (one `SkinnedMesh` each). Code-authored clips. Upper and lower body layering by **track filtering**. Animation LOD. Optional CC0 clips on a matching skeleton (see `assets.md` §3.1). | When the art direction wants richer motion. |
| Navigation | **Hybrid.** A street graph for long-range routing and off-screen schedules, plus navmesh tiles near the player with a crowd. Library: **navcat** (pure TS) behind a `NavService` interface, with recast-navigation-js as fallback. | If navcat lacks something (e.g. dynamic obstacles). |
| Code architecture | Engine-agnostic `core/` (simulation, data, saves) with no `three` import. A small in-house entity/component store plus explicit systems. Fixed 60 Hz step with render interpolation. Typed TS content data. | Never (this is the portability insurance). |
| UI | DOM overlay (HTML/CSS, Preact). Canvas only for world-space bits. Self-hosted OFL fonts (Cinzel for titles). | — |
| Audio | Web Audio with buses and a voice pool. `equalpower` panning by default, HRTF only for a few nearby sources. Procedural SFX are pre-rendered with `OfflineAudioContext`. | — |
| Testing | Vitest (node) for logic and worldgen hashes. Playwright projects: `chromium` with `channel: 'chromium'` (real GPU) and `webkit`. Screenshot smoke tests with seeds. Perf tests run locally only. | — |
| Saves | IndexedDB slots plus export/import to a file. Call `navigator.storage.persist()`. Safari's 7-day storage eviction is a real risk (§7.5). | — |

---

## 1. Long-term engine evaluation

### 1.1 What no engine gives us

No engine available to us ships Skyrim's *RPG layer*: quests and stages, dialogue trees with conditions, factions, inventory and economy, NPC schedules, crime and bounty, a save system that records world deltas. Bethesda's Creation Engine has these, but it is not licensable (§1.3). The bulk of the work is the same in every engine: the RPG systems, content data, procedural Rome, and AI. The engine decides rendering ceiling, tooling, distribution, and **how well AI agents can work in it**. That last point matters most for this team.

> **Precedent.** *The Forgotten City* began in 2015 as a Skyrim mod set in a Roman city. It may be the "short, linear Rome mod" the owner remembers. To become a standalone commercial game (2021), it had to be **rebuilt from scratch in Unreal Engine 4**. Mod content never ports. Plan as if this project is the standalone game.

### 1.2 Comparison

Scores run from 1 (poor) to 5 (excellent) for *this* project: an AI-agent dev team, a newcomer owner on a Mac, procedural content, browser first.

| | three.js (+Rapier) | Babylon.js 9 | PlayCanvas | Godot 4.7 | Unreal 5.8 | Unity 6 | Creation Kit | OpenMW 0.51 |
|---|---|---|---|---|---|---|---|---|
| AI-agent friendliness (text assets, headless tests) | **5**: everything is TS code; Playwright drives it | 5: same, TS-native | 3: engine fine, editor is a cloud app | **4**: `.tscn`/`.tres`/`.gd` are text; `--headless`; GUT/gdUnit4 | 1: binary `.uasset`/Blueprints; heavy C++ builds | 3: C# text; YAML scenes full of GUIDs/fileIDs; batchmode tests | 1: binary ESP/ESM via GUI | 2: Lua is text; content is binary ESM records |
| Newcomer owner (just play/review) | **5**: open a URL | 5 | 5 | 4: install the editor | 2: 100+ GB, Windows-first ecosystem | 3 | 4 (needs Skyrim) | 3 |
| Procedural content in code | 5 | 5 | 4 | 4 | 3 (PCG framework, but C++/BP) | 4 | 1 | 2 |
| Distribution | Web now; Electron/Tauri for Steam | same | same | **Native desktop, consoles via porters**; web is WebGL2-only (no WebGPU), C# can't export to web | Native everything; **no web** (HTML5 removed in UE 4.24) | Native + web (large builds) | Mod only, non-commercial | Desktop; GPLv3 engine |
| Performance ceiling | 3 (WebGL2; we measured ~1 ms per ~800 draws) | 3–4 (WebGPU snapshot rendering) | 3 | 4 (Forward+/Vulkan/Metal on desktop) | **5** (Nanite/Lumen) | 4 | 4 (dated) | 3 |
| Path to "real" art later | 4: glTF + KTX2 + Blender | 4 | 4 | 4: glTF/Blender native import | 5 | 5 | 4 | 2 (NIF pipeline) |
| License | MIT | Apache-2.0 (Havok plugin MIT) | MIT engine; editor proprietary SaaS | MIT, free forever | Free; 5% royalty over $1M lifetime gross | Personal free < $200k revenue; Pro $2,310/seat/yr; Runtime Fee cancelled | Bethesda EULA: mods only, non-commercial, for owners of the game | **GPLv3** engine; game content can be any license |

Notes per engine:

- **three.js:** largest ecosystem and probably the most familiar to AI agents. It is a *renderer*, not an engine, so we bring physics (Rapier), navigation, audio, UI, and structure. That is fine for agents: everything is explicit code.
- **Babylon.js 9 (Mar 2026)** is the more "batteries-included" web engine:
  - cascaded shadows built in
  - Havok physics
  - a Recast navigation plugin
  - GUI and an inspector
  - mature WebGPU with *snapshot rendering* (render bundles for static scenes, a real CPU win)

  It is the strongest web alternative. We stay with three.js because it was chosen, it has more examples, and nothing here needs Babylon-only features. Re-evaluate only if we write a lot of engine plumbing that Babylon already has.
- **PlayCanvas:** the engine is good, but its workflow centers on a proprietary cloud editor. That works poorly for git-based agents.
- **Godot 4.7.2 (Aug 2026):**
  - Text scenes and resources, GDScript, real headless mode, a built-in navmesh server, Jolt physics built in since 4.4. MIT forever.
  - Its **web export** is the weak point. It is WebGL2 "Compatibility" renderer only (Godot does not support WebGPU yet). Godot 4.7 added wasm64 web builds; Safari's support for 64-bit wasm is unclear (flag).
  - Single-threaded web export works without COOP/COEP headers since 4.3. C# cannot export to web.
  - Best *native* fallback for an agent team.
- **Unreal Engine 5.8 (Jun 2026):**
  - Highest ceiling. *Oblivion Remastered* (Virtuos/Bethesda, Apr 2025) is **not** "Oblivion ported to UE5". The original Gamebryo-based engine still runs game logic, physics, scripts, and saves, and UE5 runs alongside it as the renderer and UI layer. That bespoke bridge required Bethesda's source code. It does not show that UE5 gives you a Bethesda-style RPG.
  - For us UE5 is a poor fit:
    - binary assets and Blueprints that agents can't diff or edit
    - huge installs
    - Mac as a second-class host
    - no browser target
  - Only consider it if the project ever gains a human art team and funding.
- **Unity 6:** C# is agent-friendly. Scenes and prefabs can be text YAML, but GUID cross-references make blind edits fragile. Web builds work but are heavy. The licensing trust damage from 2023 has partly healed: the Runtime Fee was cancelled in Sept 2024, and Personal is now free under $200k. It is a credible middle option, but no better than Godot for us.
- **Bethesda Creation Kit:** the EULA says mods are non-commercial and only for owners of the game. Example: *Enderal* is a free total conversion that still requires Skyrim. You can't ship a standalone game, and Creation Engine isn't licensed to third parties. **Not viable.**
- **OpenMW 0.51 (Jun 2026):**
  - Open TES3 engine. GPLv3. Lua scripting API, OpenMW-CS editor. Its FAQ says original standalone games are possible (see its "Example Suite").
  - Downsides: Morrowind-era data model and formats (binary ESM records, NIF meshes), Morrowind combat and cell conventions, GPL obligations on engine changes, and weak AI-agent ergonomics.
  - Interesting as a reference, wrong as a base.

### 1.3 Recommendation

**Now:** three.js r186 + TS + Vite 8 + Rapier, browser-first. It best fits the team (agents writing TS), the owner (click a link, play on the Mac), and procedural content (everything is code).

**Long term:** keep the browser build as the main line through a vertical slice. After that, decide at a gate (§1.4). The likely outcomes:

1. **Stay web and add desktop wrappers.** Ship to Steam via Electron, which bundles Chromium, so rendering matches Chrome. Tauri is lighter but uses WKWebView on macOS, the Safari engine. HTML5 games have shipped on Steam this way (e.g. *CrossCode* on NW.js). **Most likely.**
2. **Port to Godot 4.x** if we outgrow WebGL2: huge view distances, a real art team, or consoles. Portability rules (below) make this a renderer, physics, and UI rewrite, not a game rewrite.
3. Unreal only if it becomes a funded studio project.

**Portability rules (start now; they cost nothing):**
- `src/core/**` (simulation, quests, dialogue, AI decisions, economy, calendar, save format) must not import `three`, `@dimforge/*`, or DOM APIs. Enforce this with a lint rule or a Vitest import test.
- Content is typed data (§7.4). It can be dumped to JSON and loaded by any engine.
- Procedural generators output engine-neutral **mesh descriptors**: typed arrays plus material IDs plus collider primitives. Adapters turn them into three.js and Rapier objects. Later, the same generators can emit glTF (three's `GLTFExporter` addon) for Godot or Blender.

### 1.4 Gate criteria for leaving the browser (revisit after the vertical slice)

Leave only if **two or more** of these hold:

- We can't hold 60 fps in Safari on a base M-series Mac at the budget in §11, even after HLOD and instancing work.
- Content needs > 2–3 GB resident.
- A human artist joins and needs an editor workflow.
- Console or Steam Deck becomes a goal.
- WebGPU-specific features we need (GPU culling, compute crowds) are still blocked in three.js.

---

## 2. three.js r186 specifics

### 2.1 Which renderer: `WebGLRenderer` now (measured)

| Measurement (M4 Max, 1280×720, DPR 1) | WebGL, Chromium | WebGL, WebKit | WebGPU, Chromium | WebGPU, WebKit |
|---|---|---|---|---|
| 1,000 meshes, CPU time in `render()` | 1.2 ms | ~2 ms | 1.8 ms | 1.4 ms |
| 4,000 meshes + sun shadows (≈6,900 draws) | 4.5 ms | ~5 ms | 9.0 ms | 12.2 ms |
| `compileAsync`, 1,000 meshes (one shared material, cold program) | 0.17 s | 0.13 s | 0.24 s | **13.7 s** |
| `compileAsync`, 4,000 meshes (program already cached) | 0.02 s | 0.01 s | 0.10 s | **52.6 s** |

Findings:

- **WebGL has about half the per-draw CPU cost at scale**, in both browsers.
- **WebGPURenderer's `compileAsync` in WebKit took ~13 ms *per object*, so warm-up time grows with object count.** A plain first `render()` in WebKit was fine (~60 ms for 1,000 meshes). This may be a Playwright-WebKit quirk. Treat it as a red flag and re-test in real Safari before any switch.
- An open three.js issue (#33821, Jun 2026) separately reports WebGPURenderer material setup is 16–36× slower than WebGL with thousands of materials.

What r186 offers on each side:

- `three/webgpu` + TSL: `WebGPURenderer` auto-falls back to WebGL2. It also has `BundleGroup` (render bundles), `CSMShadowNode`, `SkyMesh`, and `RenderPipeline`. `PostProcessing` was renamed `RenderPipeline` in r183.
- **WebGPU in Safari 26** is on by default (WebKit, "Safari 26.0"). Our WebKit probe exposed a WebGPU adapter. It is unclear whether Safari 26 on *older* macOS versions also has it (flag).
- `WebGLRenderer` keeps gaining features (verified in r186 source):
  - `reversedDepthBuffer` via `EXT_clip_control`
  - `outputBufferType: HalfFloatType` plus `renderer.setEffects([...passes])`, a built-in HDR post chain that applies tone mapping and color-space output automatically
  - `setNodesHandler(new WebGLNodesHandler())` (`three/addons/tsl/WebGLNodesHandler.js`), which renders **TSL node materials on WebGL** as a migration bridge. It has limits: no VSM, MRT, or transmission.

**Decision:** `WebGLRenderer`. To keep migration cheap:

1. Use stock `MeshStandardMaterial`/`MeshLambertMaterial` wherever possible.
2. Put all `onBeforeCompile` patches in one module, `render/shaderPatches.ts` (height fog, wind sway, triplanar). Those are what a TSL port would rewrite.
3. Use the CSM addon only behind a `ShadowSystem` interface.

### 2.2 Renderer setup, color management, lights

```ts
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({
  antialias: true,                 // MSAA on the default framebuffer; cheapest decent AA
  powerPreference: 'high-performance',
  // outputBufferType: THREE.HalfFloatType,  // only if we adopt renderer.setEffects() post (§2.8)
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Retina at DPR 2 = 4x pixels; see §11
renderer.outputColorSpace = THREE.SRGBColorSpace;  // default since r152; listed for clarity
renderer.toneMapping = THREE.AgXToneMapping;       // r160+; NeutralToneMapping is r162+
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;      // PCFSoftShadowMap deprecated r186 (auto-falls back with a warning)
```

- **Color management (r152+):**
  - `ColorManagement.enabled = true` and the working space is linear-sRGB (verified).
  - Any texture holding *colors* needs `tex.colorSpace = THREE.SRGBColorSpace`. That covers albedo, emissive, UI canvases, and procedurally painted `CanvasTexture`/`DataTexture` albedo, because these default to `NoColorSpace`.
  - Normal, roughness, AO, and ARM maps stay `NoColorSpace`.
  - `new THREE.Color(0xd2b48c)` and `color.setHex()` treat input as sRGB and convert to linear for you. Raw `Float32Array` *vertex colors* are **linear**. Convert designer palettes with `color.setRGB(r, g, b, THREE.SRGBColorSpace)` before writing them into buffers, or the procedural city will look washed out.
- **Light units:** physically based since r155, and `useLegacyLights` was removed in r165.
  - Punctual light intensity is in candela. Old tutorials need about ×π.
  - Point and spot `decay` defaults to 2, and `distance = 0` means infinite range.
  - Rough starting values with AgX at exposure 1:
    - `DirectionalLight` (sun) intensity 2.5–3.5
    - `HemisphereLight` 0.6–1.2, sky tint warm-blue, ground tint ochre
    - torch or lamp `PointLight` 5–20 cd with `distance` 8–12 m (set `distance` to bound cost)
- **Light count changes recompile shaders.** The program cache key includes `numDirLights`, `numPointLights`, and so on (verified in `WebGLPrograms.js`). Adding or removing a torch light at runtime recompiles **every lit material**, which stalls for tens of ms. Keep a **fixed pool** (e.g. 4 point lights) that moves to the nearest lamps, and fake the rest with emissive and additive sprites.
- **Tone mapping choice:**
  - AgX handles bright Mediterranean sun and white marble without the orange or cyan hue shifts ACES gives saturated colors.
  - Neutral (Khronos PBR Neutral) keeps base colors closest to the palette in `architecture.md`.
  - Start with AgX, and expose a debug toggle.
- Use **`THREE.Timer`** for frame deltas, not `Clock`, which is deprecated since r183. Call `timer.update(timestamp)` once per frame, and `timer.connect(document)` to avoid huge deltas after a tab switch.

### 2.3 Sky, fog, environment light, depth range

- **Sky addon** (`three/addons/objects/Sky.js`, WebGL only; use `SkyMesh` for WebGPU):
  - Preetham model, driven by `sunPosition`.
  - r186 adds **procedural clouds**: uniforms `cloudScale`, `cloudSpeed`, `cloudCoverage`, `cloudDensity`, `cloudElevation`, `time`, plus `showSunDisc`.
  - r183 removed its gamma correction, so old screenshots look different. r186 removed the `up` uniform (always +Y).
  - Drive the sun from the game calendar at Rome's latitude, 41.9° N. Sun altitude and azimuth come from date and hour; the content docs own the Roman-hour mapping.
- **Environment lighting:** render the sky into PMREM (`PMREMGenerator.fromScene`) for `scene.environment`. Do it **only when the sun moves noticeably** (every few game minutes), not per frame. Heads-up: in r187 PMREM becomes cube-based, `CubeUVReflectionMapping` is removed, and materials will look slightly different.
- **Fog:** `THREE.Fog` (linear) or `FogExp2` works on all built-in materials and costs almost nothing. The Sky `ShaderMaterial` ignores fog, so set the fog color to the sky's horizon color each time-of-day update. Height fog or aerial perspective needs a shared `onBeforeCompile` patch (§2.1).
- **Depth range** (1st person needs a small near plane):
  - Use near 0.1 m in 1st person and 0.2 m in 3rd. Use far ≤ 4 km at WORLD_SCALE 0.6, which covers all of Rome.
  - Draw the 1st-person arms and weapon in a separate **viewmodel pass**: second scene, own camera, `clearDepth()` between passes. This prevents clipping into walls.
  - Avoid `logarithmicDepthBuffer` (it disables early-Z).
  - `reversedDepthBuffer: true` is available. `EXT_clip_control` was present in both Chromium and WebKit in our probe. It gives the most benefit when rendering into a float-depth target, so measure z-fighting first.

### 2.4 Shadows for a big outdoor city

Two viable designs:

1. **Single follow-camera sun shadow (recommended to start).**
   - One `DirectionalLight` with `shadow.mapSize = 2048`.
   - Orthographic shadow camera with ±60–80 m half-extent, centered on the player.
   - Snap the center to whole shadow texels in light space so shadows don't shimmer while walking.
   - Beyond the shadow range, use baked vertex AO plus fog. Our generators know where cornices, arcades, and porticoes are, so they can bake occlusion into vertex colors for free.
   - Set `castShadow` only on chunks within the shadow box (merged per chunk). Characters cast; tiny props don't.
   - `light.shadow.intensity` (r16x+) helps soften the look.
   - r186 `PCFShadowMap` is now a 5-tap Vogel-disk + interleaved-gradient-noise filter on a hardware comparison sampler (verified in `shadowmap_pars_fragment`). `shadow.radius` controls softness.
   - Measured: 2048² shadows roughly doubled draw calls for casters (1,000 meshes went from 809 to 1,730 calls).
2. **CSM addon** (`three/addons/csm/CSM.js`, WebGL only; `CSMShadowNode` for WebGPU):
   - API: `new CSM({ camera, parent: scene, cascades: 3, maxFar, mode: 'practical', shadowMapSize: 2048, lightDirection, lightIntensity })`, then `csm.setupMaterial(material)` on every receiving material and `csm.update()` each frame.
   - Each cascade is its own `DirectionalLight` with its own shadow pass. Caster draw calls multiply by the cascade count, and it patches materials via `onBeforeCompile`.
   - Use it as a "High" quality option on M-Pro/Max machines.

Other tricks:
- Per-light `shadow.autoUpdate = false` plus `shadow.needsUpdate = true` every N frames. Exists in r186 (verified). Works when the sun barely moves and only static casters matter.
- Split static and dynamic casters into two maps. That is an advanced follow-up.

### 2.5 Draw calls, instancing, batching, LOD, culling (measured costs in §A.1)

- **Merged static geometry** (`mergeGeometries(geometries, useGroups = false)` from `three/addons/utils/BufferGeometryUtils.js`):
  - One mesh per chunk per material (walls, roofs, paving, wood).
  - **Gotcha:** every input must have the same attribute set and index-ness, or it returns `null`. Normalize with `toNonIndexed()` or `mergeVertices()` and fill missing `uv`/`color`.
  - Use `toCreasedNormals(geo, angle)` for faceted masonry.
  - Per-chunk merging gives frustum culling at chunk granularity, which is the right granularity.
- **`InstancedMesh`** suits columns, amphorae, market stalls, trees, tiles, and crowds of rigid figures.
  - Measured: 50,000 boxes plus shadows cost 3 draw calls and **0.5–1 ms CPU**.
  - Culling is **all-or-nothing per InstancedMesh**. `frustumCulled` is true since r151, and the bounding sphere covers all instances, so call `computeBoundingSphere()` after edits. Make one InstancedMesh **per chunk per prototype**.
  - Per-instance color via `setColorAt`.
- **`BatchedMesh`**: many *different* geometries in one draw. API:
  - `new BatchedMesh(maxInstances, maxVerts, maxIndices, material)`
  - `addGeometry(geo)` returns a geometry ID; `addInstance(geometryId)` returns an instance ID
  - `setMatrixAt`, `setColorAt`, `setVisibleAt`, `optimize()`
  - The `addInstance` step has been required since r166.
  - It does **per-instance CPU frustum culling and sorting** every pass. Measured: 4,000 instances plus shadows cost ~2 ms CPU.
  - Safari supports `WEBGL_multi_draw` (caniuse; also confirmed in our WebKit probe).
  - Good for a chunk's unique props. Overkill for buildings already merged per chunk.
- **`LOD`** (`lod.addLevel(object, distance, hysteresis)`) for landmarks: 3–4 levels down to a skyline silhouette. Use for the amphitheatre, the Capitoline temple, the Column of Trajan, aqueduct arcades, and the Circus Maximus. Generic insulae use region HLOD instead (§4.6).
- **Frustum culling** is automatic per object. For animated `SkinnedMesh`, set a fixed generous `boundingSphere` once. **Don't** call `SkinnedMesh.computeBoundingSphere()` per frame: it CPU-skins every vertex (verified in source).
- **Shader-program discipline:** every unique combination of material type, defines (fog, shadows, vertexColors, map presence, light counts) is a separate program and a compile stall. Target **≤ 30 programs** (`renderer.info.programs.length`). Pre-warm with `renderer.compileAsync(scene, camera)`, which uses `KHR_parallel_shader_compile` (available in both Chromium and WebKit per our probe), during loading screens.

### 2.6 Textures

- **Memory math:** a 2048² RGBA8 texture with mips is about 21 MB of GPU memory, and 1024² is about 5.3 MB. BC7/ASTC 4×4 is 1 byte per pixel (about 5.6 MB for 2048² with mips).
- **KTX2/Basis:** Use `new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer)`, and copy `node_modules/three/examples/jsm/libs/basis/*` into `public/basis/`.
  - Both our WebGL probes reported **ASTC, BC (s3tc + bptc) and ETC** on Apple Silicon, so UASTC transcodes to high quality everywhere.
  - Encode at build time with KTX-Software (`ktx create`/`toktx`) or `basisu`.
  - `KTX2Loader.detectSupportAsync()` is deprecated since r181. Use `detectSupport()` after init.
- **Procedural textures made at runtime** (canvas or `DataTexture`) can't be GPU-compressed.
  - Keep them small (256–1024), tiling, and few.
  - Prefer **vertex colors + a few shared detail textures + triplanar mapping** for architecture.
  - Pack variations into `DataArrayTexture` layers (one sampler, one program).
- Third-party PBR sources and the ARM-map tip are in `assets.md` §1.

### 2.7 three-mesh-bvh (0.9.15, MIT, peer `three >= 0.159`)

Use **Rapier for gameplay queries**: line of sight, interaction rays, camera collision, melee hits. Its colliders already exist and its queries are fast (1,000 raycasts ≈ 1 ms, measured).

Use three-mesh-bvh where queries must hit *render* geometry:
- editor and debug picking
- decal placement on merged meshes
- raycasting `BatchedMesh` (`computeBatchedBoundsTree`)

Patch per mesh, not globally: `geometry.computeBoundsTree()` plus `mesh.raycast = acceleratedRaycast`. Set `raycaster.firstHitOnly = true`.

### 2.8 Post-processing that Safari can afford

Fullscreen passes scale with pixels. A Retina fullscreen at DPR 2 is about 5 megapixels per pass, and base M1/M2 GPUs have about 1/5 the GPU of the M4 Max we measured on.

Plan:
1. **Start with no composer:** MSAA via `antialias: true`, renderer tone mapping, and fog.
2. **Next: `postprocessing` (pmndrs) 6.39.5** (Zlib, peer `three >=0.168 <0.187`, so r186 is OK; check the range before upgrading to r187).
   - `EffectPass` **merges several effects into one fullscreen shader**, which is much cheaper than chaining three's `EffectComposer` passes.
   - Use: SMAA (if MSAA is off), mipmap-blur **bloom** (sun on marble, lamps at night), LUT color grading, vignette.
   - Set `renderer.toneMapping = NoToneMapping` and do tone mapping in the effect chain.
3. Alternative: r186's built-in `outputBufferType: HalfFloatType` + `renderer.setEffects([new UnrealBloomPass(...), new SMAAPass()])`. Tone mapping and output conversion happen automatically, and adding `OutputPass` triggers a warning. Lighter than `EffectComposer`, but `UnrealBloomPass` is not cheap.
4. **SSAO: not by default.** Bake AO into vertex colors at generation. If wanted later, use N8AO at half resolution (`n8ao` 2.0.1, ISC) as a "High" option. GTAO in r185 became "physically correct" (darker, wider reach). Full-resolution SSAO is likely 2–4 ms on base M-series. That is an estimate, so measure it.
5. FXAA is the cheapest AA when rendering to a non-MSAA target, but it blurs inscriptions and thin columns. Prefer MSAA or SMAA.

### 2.9 Breaking changes since ~r150 that matter to us

| Release | Change |
|---|---|
| r151 | `InstancedMesh.frustumCulled` true by default (call `computeBoundingSphere()` after instance edits). `Material.forceSinglePass` true. |
| r152 | **Color management on by default.** `outputEncoding` → `outputColorSpace`, `texture.encoding` → `texture.colorSpace`. UV sets `uv2` → `uv1`. Shader chunks `encodings_fragment` → `colorspace_fragment`. WebGL1 deprecated. |
| r155 | **Physically correct lights by default** (`useLegacyLights = false`; removed in r165). Old intensities need about ×π. |
| r160 | UMD builds removed (`build/three.js`, `three.min.js`); ES modules only. AgX tone mapping added. |
| r162 | `NeutralToneMapping` added. `WebGLMultipleRenderTargets` removed (use `count` on render targets). |
| r163 | **WebGL1 removed.** Stencil off by default (`stencil: true` if needed). `TextGeometry.height` → `depth`. `scene.environmentIntensity` added. |
| r166 | `BatchedMesh` needs `addInstance()` after `addGeometry()`. |
| r167/r171 | WebGPU and TSL import paths: `three/webgpu`, `three/tsl`. |
| r170 | `Material.type` is static. Mipmaps are always generated when `generateMipmaps` is true. |
| r175–176 | `SMAAPass` constructor lost width/height. `CapsuleGeometry(radius, height, …)` (was `length`). |
| r179 | `Timer` moved into core (`THREE.Timer`). `reverseDepthBuffer` → `reversedDepthBuffer`. |
| r180 | `RGBELoader` → `HDRLoader`. `RGBMLoader` removed. |
| r181 | PBR energy-conservation and indirect-specular changes (rough materials look brighter). WebGPU `renderAsync()`-style APIs deprecated in favor of `await renderer.init()`. |
| r183 | **`Clock` deprecated (use `Timer`).** `PostProcessing` → `RenderPipeline` (WebGPU). Sky gamma correction removed. |
| r184 | Background and environment rotation behaves like 3D objects. `FileLoader.load()` returns nothing (use callbacks or `loadAsync`). |
| r185 | `Object3D.updateWorldMatrix()` honors `matrixWorldNeedsUpdate`. GTAO changed. `inverseTransformDirection` GLSL deprecated. |
| r186 | **`PCFSoftShadowMap` deprecated** (falls back to the now-soft `PCFShadowMap`). `Source` → `TextureSource`. New `Object3D.dispose()` (call `super.dispose()` in subclasses). Sky/SkyMesh `up` uniform removed. `SimplifyModifier` rewritten on meshoptimizer and now async. `BufferGeometryUtils.toTrianglesDrawMode()` modifies in place. |
| r187 (dev, not on npm yet) | PMREM is cube-render-target based (`CubeUVReflectionMapping` removed). WebGL viewport/scissor no longer scales by pixel ratio when a render target is bound. Renderers use `WeakRef`/`FinalizationRegistry`. |

Source: the three.js [Migration Guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide). The r186 items were cross-checked in the npm tarball. Pin `three` and `@types/three` exactly in `package.json`, and upgrade deliberately, one revision at a time.

---

## 3. Physics and character control: Rapier 0.21

### 3.1 Install and init (Vite 8)

```ts
import RAPIER from '@dimforge/rapier3d-compat'; // `import * as RAPIER` also works
await RAPIER.init();  // 0.21-compat: init() takes NO arguments (verified in init.d.ts)
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }); // world.timestep defaults to 1/60
```

- The `-compat` build **inlines the wasm as base64**, so it needs **no Vite plugin**. Cost: `rapier.mjs` is 4.2 MB raw, **1.6 MB gzip**, 1.2 MB brotli (measured). The non-compat `@dimforge/rapier3d` needs wasm-ESM integration (`vite-plugin-wasm` + top-level await), which isn't worth it.
- **The old "using deprecated parameters for the initialization function" console warning is gone.** It was fixed in 0.20.0 (changelog: "The -compat packages now pass the embedded wasm module to init() as an object"). Our browser runs logged no warnings.
- 0.20 moved the compat files into `dist/`. Deep imports and pinned CDN URLs need the `dist/` segment; normal package imports are unaffected.
- Init took ~12 ms in both browsers (measured). It also runs in **Node** for Vitest (verified).
- Variants exist: `@dimforge/rapier3d-simd-compat` (wasm SIMD; Safari ≥ 16.4) and `-deterministic-compat` (cross-platform bit determinism, for replays). Since 0.15, default packages **don't** guarantee cross-platform determinism. Try `simd` later if physics shows up in profiles.
- Repo note: `dimforge/rapier.js` was archived in Jul 2026. The bindings now live in `dimforge/rapier` under `bindings/typescript/`, including the CHANGELOG.

### 3.2 Changes since 0.14 that matter

| Version | Change |
|---|---|
| 0.15 | `PidController` added. Package split into compat/simd/deterministic variants. `TriMeshFlags.FIX_INTERNAL_EDGES` decoupled from `ORIENTED`. |
| 0.18 | **New broad phase that also serves scene queries.** There is no separate query pipeline to update, and queries live on `World`. `World.timing*` profiler getters. |
| 0.19 | `invPrincipalInertiaSqrt` → `invPrincipalInertia`. Legacy PGS solver switches removed. |
| 0.20 | Compat files moved to `dist/`. `IntegrationParameters.minIslandSize` removed. Contact-manifold API changes. **Rewritten sleeping, sweep-based CCD on by default against fixed colliders, broad phase tuned for large mostly-static worlds** (good for us). Init warning fixed. |
| 0.21 (Sep 24 2026) | Soft bodies (ropes and cloth, maybe for banners and awnings later). `World` constructor and some low-level pipeline signatures gained a `SoftBodySet` argument. Only relevant if calling raw pipelines. `TriMeshFlags.FIX_INTERNAL_EDGES_TWO_SIDED`, `CompoundFlags.FIX_INTERNAL_EDGES`. |

### 3.3 Kinematic character controller (KCC) recipe

API verified in `control/character_controller.d.ts`:

```ts
// Player capsule: halfHeight 0.55 + radius 0.3 → 1.7 m tall; body origin = capsule center.
const body = world.createRigidBody(
  RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z));
const collider = world.createCollider(RAPIER.ColliderDesc.capsule(0.55, 0.3), body);

const kcc = world.createCharacterController(0.02);   // offset: small gap, must be > 0
kcc.setUp({ x: 0, y: 1, z: 0 });
kcc.setSlideEnabled(true);
kcc.setMaxSlopeClimbAngle(45 * Math.PI / 180);
kcc.setMinSlopeSlideAngle(35 * Math.PI / 180);
kcc.enableAutostep(0.3, 0.2, false);   // maxHeight, minWidth, includeDynamicBodies
kcc.enableSnapToGround(0.4);           // stick to downhill slopes and stairs
kcc.setApplyImpulsesToDynamicBodies(true);

// Every fixed step (dt = 1/60):
vy = grounded ? -2 : vy - 9.81 * dt;   // KCC has no gravity; we integrate it. Small push keeps contact.
kcc.computeColliderMovement(collider, { x: vx * dt, y: vy * dt, z: vz * dt },
  RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);  // optional groups/predicate args follow
const m = kcc.computedMovement();
grounded = kcc.computedGrounded();
const p = body.translation();
body.setNextKinematicTranslation({ x: p.x + m.x, y: p.y + m.y, z: p.z + m.z });
// …then world.step() (the body only moves on step)
```

Gotchas:
- The character's **own collider and parent body are excluded automatically**. The Rust binding sets `exclude_collider` and `exclude_rigid_body` (verified in `bindings/typescript/src/control/character_controller.rs`).
- Inspect hits with `numComputedCollisions()` / `computedCollision(i)`, which give `normal1`, `toi`, and `collider`, for example for "pushed against a wall".
- One KCC instance can serve many characters that share settings (we benchmarked it that way).
- **Stairs:** Roman temple steps are tall and podia are high. Don't rely on autostep. Give visual stairs an **invisible ramp collider**, as Bethesda games do. Use autostep (≤ 0.3 m) only for curbs and thresholds.
- **Measured cost:** ~25–30 µs per grounded character per step (101 characters = 2.3 ms in Chromium, 3.0 ms in WebKit).
  - Use the KCC only for the **player, companions, and NPCs in combat or near the player** (≤ 20–30).
  - Other NPCs follow navmesh paths and sample ground height. Use `navcat`/Detour heights, or a ray against the heightfield and colliders.

### 3.4 Heightfield colliders (verified by raycast)

`ColliderDesc.heightfield(nrows, ncols, heights: Float32Array, scale: Vector, flags?: HeightFieldFlags)`. Rules:

1. `nrows` and `ncols` are **numbers of cells (subdivisions), not vertices**. `heights.length` must be `(nrows + 1) * (ncols + 1)`. The Rust binding builds `DMatrix::from_vec(nrows + 1, ncols + 1, heights)`.
2. **Column-major:** `heights[col * (nrows + 1) + row]`. **Rows run along local +Z and columns along local +X.** The parry docs say so; we confirmed by raycasting a known asymmetric function, and the hit matched the "column = X" mapping exactly.
3. `scale` is the **total extent** `{ x: sizeX, y: heightMultiplier, z: sizeZ }`, not the cell size. The field is **centered** on the collider's translation (spans −size/2…+size/2).
4. Duplicate border vertices between adjacent chunks (no seams). Pass `HeightFieldFlags.FIX_INTERNAL_EDGES` to avoid "ghost bump" contacts.

Converting from a three.js grid:

```ts
// three's PlaneGeometry(sizeX, sizeZ, nx, nz).rotateX(-Math.PI / 2) orders vertices row-major:
// index = iz * (nx + 1) + ix, with iz increasing toward +Z (south) and ix toward +X (east).
function toRapierHeights(plane: Float32Array, nx: number, nz: number): Float32Array {
  const out = new Float32Array((nx + 1) * (nz + 1));
  for (let ix = 0; ix <= nx; ix++)
    for (let iz = 0; iz <= nz; iz++)
      out[ix * (nz + 1) + iz] = plane[iz * (nx + 1) + ix];   // transpose to column-major
  return out;
}
const hf = RAPIER.ColliderDesc
  .heightfield(nz /* rows = Z cells */, nx /* cols = X cells */, toRapierHeights(h, nx, nz),
               { x: sizeX, y: 1, z: sizeZ }, RAPIER.HeightFieldFlags.FIX_INTERNAL_EDGES)
  .setTranslation(chunkCenterX, 0, chunkCenterZ);
```

Creating a 257×257 field took ~1 ms (measured).

### 3.5 Buildings: primitives, compounds, or trimesh

- Generators know the shapes, so emit **primitive colliders**: `cuboid`/`roundCuboid` for walls, podia, and blocks; `cylinder` for columns (only where the player can reach them); ramps as rotated cuboids or convex hulls.
  - Measured: **5,000 cuboids created in 7–9 ms**, with a static-world `step()` of ~0.2 ms afterwards.
  - Rapier 0.20+ is tuned for large static worlds, so thousands of static colliders are fine.
- **Per-chunk ownership:** attach all of a chunk's colliders to **one `fixed` rigid body**. `world.removeRigidBody(body)` "removes this rigid-body as well as all its attached colliders" (verified doc comment), so unloading a chunk is one call.
- **Trimesh** suits irregular hand-made or imported meshes (rubble, the Tiber banks, imported glTF). A 51k-triangle trimesh took 9–16 ms to build (measured). Do it time-sliced, or prefer primitives. `TriMeshFlags.FIX_INTERNAL_EDGES` helps smooth sliding.
- `ColliderDesc.compound(shapes, positions, rotations)` and `convexDecomposition(...)` exist when one collider per building is wanted. The one-body-per-chunk approach is simpler.
- **Collision groups:** `InteractionGroups` is a 32-bit number, upper 16 bits = memberships and lower 16 = filter. Define named groups once in `physics/groups.ts` (WORLD, PLAYER, NPC, PROJECTILE, SENSOR, CAMERA_BLOCKER).

### 3.6 Sensors and queries

- **Triggers** (doors, district boundaries, quest areas):
  - Prefer **game-side spatial checks**: our own grid hash of AABBs or circles, tested against the player position each tick. They are deterministic, serializable, and need no physics events.
  - When physics sensors are needed, a fixed-body sensor can only detect a kinematic character if `setActiveCollisionTypes(ActiveCollisionTypes.DEFAULT | ActiveCollisionTypes.KINEMATIC_FIXED)` is set. Also set `setActiveEvents(ActiveEvents.COLLISION_EVENTS)` and drain with `eventQueue.drainCollisionEvents((h1, h2, started) => …)`.
- **Melee hits:** on the attack's active frames, run `world.intersectionsWithShape(pos, rot, new RAPIER.Capsule(...), cb, flags, groups)` or a `castShape` sweep along the blade arc, filtered to NPC/PLAYER groups.
  - Signature in 0.21: `castShape(shapePos, shapeRot, shapeVel, shape, targetDistance, maxToi, stopAtPenetration, filterFlags?, filterGroups?, excludeCollider?, excludeRigidBody?, filterPredicate?)` (verified).
- **Rays:** `world.castRay(new RAPIER.Ray(origin, dir), maxToi, solid, …)` returns `{ collider, timeOfImpact }`. Hit point = `origin + dir * timeOfImpact`. Measured at **~1 µs per ray**.
- **3rd-person camera collision:** sweep a small sphere (r = 0.2 m) from the head pivot toward the desired camera position with `castShape`, filtered to the CAMERA_BLOCKER group.

---

## 4. Open-world streaming

### 4.1 Worldspaces and float precision

- Rome is its own **worldspace**, with origin at the Miliarium Aureum. AD 113 Rome is ~5–6 km across, about 3–3.6 km at WORLD_SCALE 0.6. float32 precision at 3 km is about 0.25 mm, fine for both GPU and Rapier (f32).
- **Ostia/Portus, Latium, and provinces should be separate worldspaces** (separate maps, travel between them), like Skyrim's interior and exterior worldspaces. If one continuous map ever exceeds ~10 km from its origin, add a **floating origin**: when the player is > 2 km from the origin, shift every root object and Rapier body back. Keep a `worldOffset` for saves and logic.

### 4.2 Grid

| Unit | Size (rendered meters) | Holds |
|---|---|---|
| **Chunk** | **64 m** | Merged static meshes per material, `InstancedMesh` per prop type, one fixed Rapier body, navmesh tiles, spawn lists |
| **Region** | 256 m (4×4 chunks) | One **HLOD** mesh (≤ 1–3 draw calls) for distant viewing |
| Landmark | — | Hand-placed `LOD` objects visible city-wide (skyline anchors) |

Rings around the player (start values; tune with the budget in §11):
- **Ring 0** (3×3 chunks, about ±96 m): full detail, shadows, physics, navmesh, active NPCs.
- **Ring 1** (5×5 → 7×7 chunks, about ±225 m): merged medium LOD, no small props, no shadow casting, no physics except heightfield.
- **Beyond:** region HLODs out to the fog distance (~1.5–3 km), plus landmark LODs.

Use hysteresis (load at radius r, unload at r + 1) to avoid thrashing at boundaries. Skyrim's comparable setting was 5×5 exterior cells (~58 m each) loaded, plus distant LOD.

**Interiors** (baths, temples, domus, insulae, tabernae with depth) are **separate interior cells**, loaded behind a door with a short fade. This is a huge perf win, and it simplifies lighting (no sun shadows inside, a small fixed light pool).

### 4.3 Deterministic generation

- `chunkSeed = hash32(worldSeed, worldspaceId, cx, cz, generatorVersion)`. Use a 32-bit integer hash such as splitmix32 or murmur3-finalizer mixing via `Math.imul`. PRNG: `sfc32` or `mulberry32` per chunk and per sub-stream (buildings, props, people), so changing one generator doesn't reshuffle the others.
- **Never use `Math.random()` in generators** (lint ban).
- **Measured caveat:** `Math.sin`, `cos`, `exp`, `log`, and `atan2` are *implementation-approximated* in ECMA-262. In our test, **3–4% of `Math.sin` results differed by 1 ulp** between Chromium 153 (V8), WebKit 26.6 (JavaScriptCore), and Node 22. `sqrt` and `pow` matched. Consequences:
  - Don't make **discrete** decisions from transcendental math. "Is this building a tavern?" or "which side of a threshold?" must come from integer hashes or PRNG output. A 1-ulp difference must never flip a choice.
  - Continuous geometry may use `Math.sin`. Sub-millimeter differences are invisible.
  - Anything **baked at build time in Node** (navmesh tiles, HLOD) must be generated from the *same* data the browser uses. Never "regenerate and hope it matches". Or ship the baked artifact.
- Hand-authored historical landmarks are data, not RNG. The procedural fabric fills between them.
- Add a regression test: `hash(generateChunk(seed, 10, -3))` is stable per `generatorVersion`. Bump the version on intentional changes, and have saves record it (§7.5).

### 4.4 Async generation in Web Workers

- Create workers with `new Worker(new URL('./worldgen.worker.ts', import.meta.url), { type: 'module' })`. Vite bundles them; module workers work in Safari 15+.
- Pool size = `min(navigator.hardwareConcurrency - 1, 4)`. **Measured:** WebKit reported **8** cores on the 16-core M4 Max, Chromium reported 16.
- The worker returns **flat typed arrays** (positions, normals, uvs, colors, indices, per-material ranges), collider primitive lists, spawn tables, and navmesh tile bytes. Send them with `postMessage(msg, [buf1, buf2, …])` **transfer lists** (zero-copy).
  - Don't post class instances. Don't depend on `SharedArrayBuffer`: it needs COOP/COEP headers, which GitHub Pages can't set.
- **The main thread builds GPU and physics objects** (three objects and Rapier handles can't cross threads) through a **time-sliced job queue**: ≤ 2 ms per frame for geometry creation, `initTexture`, and collider creation. 5,000 cuboids is about 8 ms, so spread it over 4+ frames.
- Pre-compile materials while loading (`compileAsync`), so new chunks never introduce a new shader program mid-game.

### 4.5 Memory (Safari)

- Safari/WebKit enforces per-process memory limits and shows "This webpage is using significant memory". The thresholds are platform-dependent and not well documented (flag).
- Our own budgets (§11): JS heap ≤ ~0.75–1 GB, GPU textures ≤ ~384 MB, geometry ≤ ~256 MB.
- **WASM memory never shrinks.** Rapier's and Recast's linear memory keeps its high-water mark after you free objects. Reuse, avoid spikes, and don't create and destroy physics worlds per area.
- three.js doesn't free GPU memory on its own. On unload, call `geometry.dispose()`, `material.dispose()`, `texture.dispose()`, and (new in r186) `Object3D.dispose()` on objects with GPU resources. Watch `renderer.info.memory.{geometries,textures}` in a soak test, which should not grow while walking in circles.

### 4.6 HLOD and impostors

- Rome's fabric is boxy. **Simplified merged blocks beat billboards.** Each region HLOD is a low-poly merge of its buildings: footprint × height, roof planes, terracotta and ochre vertex colors, baked AO, one material.
  - Generate it in the worker from the same building descriptors.
  - Use meshoptimizer: the simplifier ships in `three/addons/libs/meshopt_simplifier.module.js`, and the r186 `SimplifyModifier` is meshopt-based and async.
- **Impostors** (camera-facing or octahedral billboards baked to an atlas) suit **trees** (umbrella pines, cypresses) and **crowds**, not buildings.
- **Landmarks** get dedicated far LODs so the skyline is always right: the Capitol, the Flavian Amphitheatre, the Column of Trajan, aqueduct arcades, and the Palatine palaces. The topography docs own positions.

---

## 5. Characters and animation

### 5.1 Procedural rigid-skinned humanoids (no artists needed)

1. **Skeleton:** about 20–30 `THREE.Bone`s built from a typed table `{ name, parent, offset }`. **Name bones to match the CC0 skeleton chosen in `assets.md` §3.1** (Mesh2Motion/Quaternius, Unreal-mannequin names such as `pelvis`, `spine_01`, `thigh_l`, `calf_l`). Then our procedural bodies can play those CC0 clips directly. Our skeleton can be a *subset*; tracks for missing bones are simply unbound. Bone names must be PropertyBinding-safe: no `.`, `[`, `]`, `:`, `/`.
2. **Body parts:** primitives (capsules, `LatheGeometry`, boxes, extruded profiles for tunica, toga, and lorica) generated in bind-pose model space. Give each vertex `skinIndex = [bone, …]` and `skinWeight = [1, 0, 0, 0]`. Blend two bones only near elbows, knees, and neck, by distance along the segment.
3. **Merge all parts** into one `BufferGeometry` (`mergeGeometries`) with **vertex colors** for clothing and skin (sRGB → linear conversion, §2.2). That makes **one `SkinnedMesh` and one draw call per NPC**, with **one shared material** for all NPCs.
4. `mesh.add(bones[0]); mesh.bind(new THREE.Skeleton(bones))`. `bind()` without a matrix uses the mesh's world matrix and computes inverses. Keep the rest pose when binding.
5. Variation without new shader programs comes from vertex color palettes, part swaps, and height/girth scaling of bone offsets. Share geometry across NPCs with the same body and outfit. Each NPC needs its own `Skeleton` (use `SkeletonUtils.clone` for glTF characters).
6. Give `mesh.boundingSphere` a fixed generous value (radius ~1.2 m) and keep `frustumCulled = true` (§2.5).

### 5.2 Code-authored clips

```ts
const q = (x: number, y = 0, z = 0) =>
  new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)).toArray();
const walk = new THREE.AnimationClip('walk', 1.0, [
  new THREE.QuaternionKeyframeTrack('thigh_l.quaternion', [0, 0.5, 1], [...q(0.45), ...q(-0.45), ...q(0.45)]),
  new THREE.QuaternionKeyframeTrack('thigh_r.quaternion', [0, 0.5, 1], [...q(-0.45), ...q(0.45), ...q(-0.45)]),
  new THREE.VectorKeyframeTrack('pelvis.position', [0, 0.25, 0.5, 0.75, 1],
    [0, .95, 0,  0, .98, 0,  0, .95, 0,  0, .98, 0,  0, .95, 0]),
]);
mixer.clipAction(walk).play();
```

- Track names are `boneName.property` and resolve by node name under the mixer root.
- Author clips in an `anims/` module as **keyframe tables in degrees**, with helpers for mirroring left and right and looping. This is easy for agents to read and tweak.
- `AnimationUtils.subclip()` and `AnimationUtils.makeClipAdditive()` exist (verified).

### 5.3 Layering: upper-body attack while walking

Verified in `PropertyMixer.js`:
- Actions in **normal** blend mode that touch the same bone are **weight-averaged**.
- If the total weight is < 1, the remainder blends toward the **bind-time original pose**.

So a second mixer or a "masked" action **does not override**: it averages, or blends toward the rest pose. The correct approach is **track filtering**:

```ts
const UPPER = new Set(['spine_01','spine_02','spine_03','neck_01','head',
  'clavicle_l','upperarm_l','lowerarm_l','hand_l','clavicle_r','upperarm_r','lowerarm_r','hand_r']);
function split(clip: THREE.AnimationClip) {
  const up = (t: THREE.KeyframeTrack) => UPPER.has(t.name.split('.')[0]);
  return {
    upper: new THREE.AnimationClip(clip.name + ':upper', clip.duration, clip.tracks.filter(up)),
    lower: new THREE.AnimationClip(clip.name + ':lower', clip.duration, clip.tracks.filter(t => !up(t))),
  };
}
// Locomotion = two synced actions (walk:lower + walk:upper).
// Attack: attackUpper.reset().play(); walkUpper.crossFadeTo(attackUpper, 0.12, false);
// The legs keep walking; when the swing ends, cross-fade back to walkUpper.
```

- **Additive layers** add on top of everything: `makeClipAdditive(clip)`, then `action.blendMode = THREE.AdditiveAnimationBlendMode`. Use them for hit flinches, breathing, and shield raise.
- Measured: 150 characters × 25 bones with 2 locomotion actions plus an upper layer cost 0.75–0.94 ms per frame; with an additive layer, 0.82–1.02 ms.

### 5.4 Root motion vs in-place

**In-place clips with code-driven movement.**
- The KCC or nav agent moves the capsule. The animation `timeScale` follows ground speed (`action.setEffectiveTimeScale(speed / clipStrideSpeed)`) to avoid foot sliding.
- Blend walk and run by speed (two weights summing to 1, synced with `syncWith`).
- Root motion only for special one-offs (vaults, lunging attacks), done by reading the clip's pelvis track. It isn't worth a general system.

### 5.5 Foot IK (optional, later)

- A two-bone analytic IK (law of cosines) on the legs plus a pelvis offset, applied **after** `mixer.update()` from a ground ray per foot. Only for characters within ~15 m.
- `three/addons/animation/CCDIKSolver.js` exists (built for MMD). Analytic two-bone IK is simpler and cheaper for legs.

### 5.6 Crowds: 50–150 animated NPCs

Measured (§A.3):
- `AnimationMixer.update` for **150 characters × 25 bones ≈ 0.44 ms** (1 action) to **~1 ms** (3 actions).
- Rendering 150 skinned meshes plus shadows ≈ **1.4–2 ms** of render CPU (301 draws).
- A 66-joint skeleton (fingers) will roughly ×2.5 the mixer cost.

Animation LOD:

| Distance | Mixer rate | Extras |
|---|---|---|
| < 20 m | every frame | IK, upper/lower layers, all tracks |
| 20–50 m | 30 Hz (accumulate dt) | drop finger and face tracks (filtered clip set) |
| 50–80 m | 10–15 Hz | no shadows |
| > 80 m | frozen pose or swap | `InstancedMesh` rigid figures or impostor billboards; for big crowds (Circus, Forum festivals), vertex-animation-texture (VAT) instanced figures later |

### 5.7 CC0 glTF option

- `assets.md` §3.1 recommends **Mesh2Motion's** Quaternius-derived CC0 bodies and 87 clips on a shared 66-joint skeleton. Quaternius's Universal Animation Library is CC0; the 45 "Standard" clips are free, and the Pro/Source tiers are paid but still CC0.
- Load with `GLTFLoader`, clone per NPC with `SkeletonUtils.clone`, and share `AnimationClip`s across mixers.
- If rest poses differ from ours, use `SkeletonUtils.retargetClip(target, source, clip, options)`, or better, fix the rest pose offline in Blender once.
- Mixamo clips are free to use but tied to Adobe's terms; CC0 avoids that question.

### 5.7a First and third person

- **Toggle:** the camera rig switches between a head pivot (1st) and a spring arm (3rd).
- **In 1st person,** hide the head mesh from the main camera but keep the full-body shadow.
  - Note: three's shadow pass **also** honors the *main camera's* layers. `WebGLShadowMap.renderObject` tests `object.layers.test(camera.layers)` (verified), so putting the head on a hidden layer also removes its shadow.
  - Instead, swap the head's material to `colorWrite = false, depthWrite = false` in 1st person. Or render a separate shadow-only proxy.
- Draw the 1st-person weapon and arms in the viewmodel pass (§2.3).
- 3rd-person camera collision: sphere cast (§3.6). Fade the player mesh when the camera is closer than ~0.6 m.

---

## 6. NPC navigation

### 6.1 Options measured

Test world: 512 × 512 m terrain plus 1,500 box "buildings", 50.8k triangles, cs = 0.3 m, ch = 0.2 m, 64-voxel tiles (19.2 m), 729 tiles. Node 22 on the M4 Max.

| | recast-navigation-js 0.43.1 (WASM, MIT) | navcat 0.4.1 (pure TS, MIT) |
|---|---|---|
| Whole tiled navmesh | 3.4–3.5 s (~4.8 ms per tile) | **2.6 s** (~3.6 ms per tile) |
| 200 long paths (with endpoint snapping) | 4.8 ms total | (not run) |
| Crowd, 150 agents | **0.14–0.21 ms per update** | has crowd (not measured) |
| Bundle size | ~230 KB gzip (wasm inlined) | ~96 KB gzip (before tree-shaking) |
| Memory model | WASM objects, **manual `destroy()`** needed | plain JS objects, **JSON-serializable** navmesh |
| Workers / Node | init per worker; works in Node | trivial |
| Maturity | wraps upstream Recast/Detour C++; TileCache for dynamic obstacles | young (pre-1.0); same author; README says recast-navigation-js "will continue to be maintained" |

Gotchas:
- **Recast config units are voxels, not meters** (verified in `RecastConfig` docs): `walkableHeight = ceil(1.8 / ch)`, `walkableClimb = floor(0.45 / ch)`, `walkableRadius = ceil(0.35 / cs)`. navcat's options take both `…Voxels` and `…World` fields, so set both consistently.
- recast `NavMeshQuery.defaultQueryHalfExtents` is small. Raise it (we used `{x: 4, y: 20, z: 4}`), or most path queries on a heightfield city fail to find a start polygon. Our first run found only 3 of 200 paths.

### 6.2 Recommendation (hybrid)

1. **Street graph** for long-range routes, schedules, and off-screen simulation. Build it from the topography team's street and vicus centerlines plus doors and fora as nodes. Run A* on a few thousand nodes in microseconds. Off-screen NPCs "teleport along the graph" by schedule, and no navmesh is needed far away.
2. **Navmesh tiles near the player** (Ring 0–1) for local movement, crowd avoidance in the Forum, and combat positioning.
   - Generate per chunk **in a worker** (~10–15 tiles per 64 m chunk ≈ 40–70 ms of worker time).
   - Or **bake at build time** in Node, from the same descriptors (§4.3), into per-chunk files that `addTile`/`removeTile` stream in.
3. **Library:** start with **navcat** behind a `NavService` interface:

   ```ts
   interface NavService {
     addChunk(...); removeChunk(...);
     findPath(a, b);
     closestPoint(p);
     crowd: { add(); remove(); requestMove(); update(dt) };
   }
   ```

   Pure TS is easier for agents (readable, debuggable, no manual memory management), JSON makes baking trivial, and generation was as fast as WASM here. Keep recast-navigation-js as the fallback if navcat lacks something, such as TileCache-style dynamic obstacles (carts, opened gates). Off-mesh connections (ladders, jumps down from podia) exist in both.
4. **Crowd** (Detour-style) only for agents within ~60 m. Beyond that, simple path following with separation steering.

---

## 7. Game architecture in TypeScript

### 7.1 Module layout (portability-first)

```
src/
  core/        # NO three / rapier / DOM imports. Pure simulation + data.
    ecs/       # entity store, component types, system scheduler
    time/      # GameClock, Roman calendar, schedules
    quests/ dialogue/ items/ factions/ ai/ economy/ save/
    worldgen/  # descriptors only (typed arrays, primitive lists); runs in workers and Node
  content/     # typed TS data: quests, dialogue, items, NPC templates, landmarks
  engine/      # adapters: render/ (three), physics/ (rapier), nav/, audio/, input/
  ui/          # DOM overlay (Preact)
  main.ts
```

### 7.2 Entities and systems vs ECS libraries

| Option | Notes |
|---|---|
| **In-house store (recommended)** | Components are plain typed objects in `Map<EntityId, T>` per component type. Systems run in an explicit, ordered list. Queries are cached sets per component signature. About 200 lines, fully typed, trivially serializable for saves, easy for agents to reason about. Hot paths (transforms of 150 NPCs, animation LOD) can use typed-array SoA inside the owning system. |
| koota (pmndrs, ISC, active Oct 2026) | Modern trait-based ECS. Worth a look if the in-house store grows too complex. |
| bitECS 0.4 (MPL-2.0, Dec 2025) | Fastest SoA ECS. Awkward for RPG data (strings, inventories, dialogue state). MPL is file-level copyleft. |
| miniplex 2.0 (MIT) | Nice API but unmaintained since Jul 2023. |
| becsy (MIT, active) | Multithreading ambitions, steeper learning curve. |

At our scale (hundreds to low thousands of active entities), clarity beats raw ECS throughput. Rendering, physics, and animation dominate the frame.

### 7.3 Events

- A typed event bus with a discriminated union `GameEvent = { type: 'itemPickedUp', … } | { type: 'npcKilled', … } | …`.
- Gameplay events are **queued and dispatched at fixed points in the tick** (after physics, before quest evaluation), not fired synchronously from inside systems. That keeps ordering deterministic and avoids re-entrancy bugs.
- UI subscribes through the same bus or through signals.

### 7.4 Data-driven content as typed TS

- `content/quests/*.ts` export objects checked with `satisfies QuestDef`.
- IDs are string-literal unions generated from the data (`type ItemId = keyof typeof ITEMS`).
- Conditions and effects are a **small typed DSL** (`{ op: 'hasItem', item: 'denarius', count: 5 }`), never `eval`'d strings.
- A Vitest content suite checks:
  - every referenced ID exists
  - every quest stage is reachable
  - every dialogue node ends
  - every NPC schedule location exists in the world data
- Agents get compile-time errors instead of runtime surprises. Later the same data can be dumped to JSON with a JSON Schema for modding or a port.

### 7.5 Save/load

- A save holds: `{ saveVersion, generatorVersion, worldSeed, gameTime, player, questStates, factionStates, entityDeltas }`.
  - `entityDeltas` maps stable IDs to changes (looted, moved, killed, door state). This is a Bethesda-style "change form" model over deterministic generation.
  - Stable IDs: hand-authored objects use string IDs. Procedural objects use `${worldspace}:${cx},${cz}:${generator}:${index}`.
- **IndexedDB** holds slots plus autosaves (structured clone, plenty of quota). **localStorage** only for settings. Add **Export/Import save file** (download or upload JSON) in the menu.
- **Safari risk:** Safari deletes script-writable storage, IndexedDB included, after **7 days of Safari use without visiting the site**. Home Screen web apps are exempt. Mitigations:
  - call `navigator.storage.persist()` (Safari 17+ honors it; a persistent origin is exempt from eviction)
  - nag-free reminders to export
  - eventually a desktop wrapper
- Migrations: `saveVersion` steps are pure functions with Vitest fixtures.

### 7.6 Main loop: fixed timestep with interpolation

```ts
const STEP = 1 / 60;
const timer = new THREE.Timer(); timer.connect(document);
let acc = 0;
renderer.setAnimationLoop((ts) => {
  timer.update(ts);
  const dt = Math.min(timer.getDelta(), 0.25);   // clamp after stalls / tab switches
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 5) { sim.snapshotPrevious(); sim.tick(STEP); acc -= STEP; n++; }
  if (n === 5) acc = 0;                           // drop time instead of spiraling
  view.interpolate(acc / STEP);                   // lerp/slerp prev→curr for rendered transforms + camera
  animation.update(dt);                           // render-rate with LOD throttling
  audio.update(); ui.update();
  renderer.render(scene, camera);
});
```

- `sim.tick` order: input → AI decisions (some at 10 Hz) → KCC moves → `world.step()` → event dispatch → quests and triggers → game clock.
- Design for variable refresh rates; 120 Hz ProMotion displays exist.
- **Measured caveat:** WebKit's `performance.now()` has **1 ms** resolution without cross-origin isolation (Chromium: 0.1 ms). `timer.getDelta()` will jitter in Safari, which fixed steps absorb. Average perf numbers over many frames.

### 7.7 Game time

- `GameClock` keeps continuous game seconds since a fixed epoch (e.g. 1 Jan 866 AUC, 00:00).
- Timescale is adjustable. Skyrim's default is 20 game seconds per real second.
- It supports pause and wait/sleep fast-forward, with a schedule catch-up done by jumping NPCs along the street graph.
- Derived values: calendar date, Roman hour (seasonal unequal hours; the content docs own the mapping), sun direction, sky, exposure, fog color, and lamp lighting at dusk.

### 7.8 Input (Mac trackpad)

- Map all input through an **action map** (`attack`, `block`, `use`, `toggleView`, …). Every mouse button action also gets a **keyboard binding** (e.g. attack = click or `J`, block = right-click/two-finger click or `K`, power attack = hold).
- Use Pointer Lock for mouselook. It needs a user gesture, and Esc exits. `unadjustedMovement` isn't available in Safari as far as we know.
- On trackpads, wheel events carry pinch gestures as `ctrlKey` + wheel. Use them for camera zoom.
- **Flag:** macOS may suppress trackpad *taps* while keys are held. Physical clicks are generally fine. That is another reason for keyboard alternatives.

---

## 8. UI

- **DOM overlay over the canvas** for HUD, menus, inventory, dialogue, journal, map, and settings.
  - Reasons: crisp text, CSS layout, accessibility and scaling, and **Playwright can assert on it**.
  - Use **Preact** (+ signals): React-compatible JSX at a few KB, and very familiar to agents.
  - Set `pointer-events: none` on the HUD layer, and enable it on interactive panels only.
- **In-canvas or world-space** only for nameplates, damage numbers, and interaction prompts. `CSS2DRenderer` (addon) places DOM nodes at 3D positions. It is cheap for ≤ ~30 labels; beyond that, use sprites or a canvas atlas.
- Pause the 3D render (or drop to 10 fps) under full-screen menus to save battery.
- **Fonts** (SIL OFL 1.1, self-hosted woff2 via `@fontsource/*` or files in `public/fonts`):
  - **Cinzel** (`@fontsource/cinzel` 5.3.0, OFL) for titles. It's modelled on Roman inscriptional capitals; the commercial "Trajan" face is Adobe-licensed, so avoid it.
  - Marcellus for UI headings.
  - EB Garamond or Cormorant Garamond for long-form text (books, journal).
  - A plain sans for numbers and small HUD text.
  - Self-hosting avoids a runtime dependency on Google Fonts and works offline. `assets.md` §5 has the font shortlist.

---

## 9. Audio

- **Web Audio graph:** sources → per-category **buses** (`GainNode`: music, ambience, sfx, voice, ui) → master → compressor → destination.
  - Create or resume the `AudioContext` on the first user gesture (Safari requires it).
  - Fade gains with `setTargetAtTime`.
- **Spatialization cost:**
  - The spec default `panningModel` is `'equalpower'` (cheap).
  - **three's `PositionalAudio` sets `'HRTF'`** (verified). HRTF runs a convolution per source.
  - Use our own small audio system with a **voice pool** (~24–32 voices, priority by distance and importance). `equalpower` everywhere, HRTF for ≤ 4–8 nearest sources at most.
  - Distance model `'inverse'` with `refDistance` about 2 m.
  - Update listener and panner positions at render rate with `setTargetAtTime`/ramps to avoid zipper noise.
- **Ambience** per district (Subura bustle, Forum crowd, Tiber wharves, Palatine quiet) as crossfaded loops, plus one-shots placed at sources: fountains, smithies, the Circus roar on race days.
- **Procedural SFX** (no sound designer), **pre-rendered once at load with `OfflineAudioContext`** into `AudioBuffer`s with seeded variations. Synthesizing live per event is costly and glitchy.

  | Sound | Recipe |
  |---|---|
  | Footsteps | Short filtered-noise bursts with an envelope; filter by surface (basalt paving, gravel, wood, marble) |
  | Sword clash | Noise transient plus a few inharmonic decaying partials (FM or detuned sines) |
  | Impacts | Noise through a falling lowpass |
  | Fire, braziers | Random impulses through a bandpass, plus a low rumble |
  | Water | Filtered noise plus random "bubble" sine chirps |
  | Crowd murmur | Several band-passed noise layers with slow amplitude modulation |
  | Music (diegetic) | **Karplus–Strong** plucked strings for lyre or cithara; aulos as a sawtooth or square with formant filters; tympanum, cymbala, and sistrum percussion |

  ZzFX (MIT, ~1 KB) is a quick prototyping option. CC0 recorded packs are listed in `assets.md` §4.
- AudioWorklet is available (Safari 14.1+) if a custom DSP node is ever needed.

---

## 10. Testing

### 10.1 Unit and logic tests: Vitest 5 (node environment)

- Covers quest and dialogue state machines, the content validation suite (§7.4), save round-trips and migrations, the PRNG and **worldgen golden hashes** per seed and generator version, calendar math, and the street-graph A*.
- three's math and geometry classes, **Rapier compat** (verified: runs in Node, and a ball settles at y = 1.000 after 180 steps), recast, and navcat all run in Node. Physics and navigation logic can be unit-tested headless.
- Vitest browser mode (`@vitest/browser-playwright` 5.0.3) is an option for WebGL-dependent units. Prefer pure-logic tests.

### 10.2 End-to-end: Playwright 1.63

Measured on this Mac:

| Launch | WebGL renderer | Fill test | Notes |
|---|---|---|---|
| Chromium default headless (`chromium-headless-shell`) | **SwiftShader (CPU)** | 88 ms per frame | Too slow for perf. Fine for "does it boot" in CI. |
| Chromium `channel: 'chromium'` (new headless) | **ANGLE Metal, Apple M4 Max** | 16.6 ms (vsync) | **Use this locally.** WebGPU adapter available; has `EXT_disjoint_timer_query_webgl2` (GPU timers). |
| Chromium headless-shell + `--use-angle=metal --enable-gpu --ignore-gpu-blocklist` | ANGLE Metal | 16.7 ms | Equivalent alternative. |
| WebKit headless | **Apple GPU** | 17 ms | WebGPU available. **No GPU timer-query extension** (so no GPU timing in Safari). |

```ts
// playwright.config.ts (sketch)
projects: [
  { name: 'chromium', use: { browserName: 'chromium', channel: 'chromium' } }, // real GPU on macOS
  { name: 'webkit',   use: { browserName: 'webkit' } },
],
// CI (Linux, no GPU): add launchOptions.args ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
// if WebGL context creation fails; keep perf specs local-only.
```

- **Test hooks:** in dev and test builds only (`import.meta.env.DEV` or `?test=1`), expose `window.__skyrome = { ready, seed(n), teleport(x, z), setTime(h), freeze(), stats() }`. Tests wait on `ready`: first frame drawn and Ring 0 loaded.
- **Screenshot smoke tests:** fixed seed, time of day, and camera, with `freeze()` stopping NPC animation, wind, and clouds. Use `expect(page).toHaveScreenshot({ maxDiffPixelRatio: 0.01 })`. Baselines are per browser and platform (Playwright adds `-darwin` and `-linux` suffixes), and GPUs differ, so never compare macOS shots to CI shots.
- **Perf tests (local only):**
  - Script a camera path (e.g. walk the Sacra Via, then pan over the Forum of Trajan).
  - Record p50/p95/p99 frame times via `requestAnimationFrame`, plus `renderer.info.render.{calls, triangles}` (includes shadow passes; `info.autoReset` default true), `renderer.info.memory`, and `renderer.info.programs.length`. `performance.memory` is Chromium only.
  - Assert against §11.
  - The owner's New York Map project learned the CI lesson already: GitHub runners have no GPU, and WebKit there runs at 2–3 fps.
- For GPU time in Safari, use a perf-mode-only `gl.readPixels(0, 0, 1, 1, …)` sync after `render()`, as our benchmark did. Never ship that.

---

## 11. Perf budget: 60 fps in Safari on an Apple-Silicon Mac

The **baseline machine is a base M1/M2 (8-core GPU)**, not the owner's M4 Max. The M4 Max has roughly 1.5–1.7× the single-thread CPU and about 5× the GPU of a base M1 (estimate). Our measured CPU costs were therefore doubled to set these targets.

| Budget item | Target | Hard cap | Basis |
|---|---|---|---|
| Main-thread work per frame (sim + physics + anim + render submit) | **≤ 10 ms** | 13 ms | Leave 3–6 ms of the 16.7 ms for GC, compositor, and audio |
| Draw calls, all passes (`info.render.calls`) | **≤ 800** | 1,500 | Measured WebKit ≈ 1 ms per ~800 calls on M4 Max, so ~2 ms on M1 |
| …main pass / shadow pass | ≤ 500 / ≤ 250 | | |
| Triangles drawn, all passes | ≤ 1.5 M | 3 M | 1.2 M instanced tris + shadows rendered in 3–5 ms *including* GPU sync on M4 Max; base GPUs are ~5× slower |
| Shadow maps | 1 × 2048² follow-cam (±60–80 m) | CSM 3 × 2048² or 4096² on "High" | §2.4 |
| Dynamic point/spot lights | 4 (fixed pool) | 8 | Count changes recompile shaders |
| Shader programs (`info.programs.length`) | ≤ 30 | 50 | Each new program = compile stall |
| Skinned NPCs animated | ≤ 40 full-rate, ≤ 150 total with anim LOD | 200 | Measured 150 × 25 bones ≈ 1 ms mixer + ~2 ms render on M4 Max |
| KCC-driven actors | ≤ 20 | 40 | Measured 25–30 µs each on M4 Max |
| Physics step | ≤ 1.5 ms | 3 ms | Static world step ~0.2 ms (measured) |
| AI, quests, schedules | ≤ 2 ms | 3 ms | Time-slice AI decisions at 10 Hz |
| Animation (mixers + IK) | ≤ 1.5 ms | 2.5 ms | §5.6 LOD |
| Chunk activation (GPU upload + colliders) | ≤ 2 ms per frame, time-sliced | | §4.4 |
| Pixel ratio | dynamic 1.0–1.5 | | Retina DPR 2 = 4× pixels |
| Post-processing GPU | ≤ 2 ms | 3 ms | MSAA or SMAA + bloom + LUT; no SSAO by default |
| GPU textures | ≤ 384 MB | 512 MB | 2048² RGBA8 + mips = 21 MB each |
| Geometry (GPU) | ≤ 256 MB | | |
| JS heap | ≤ 768 MB | 1.2 GB | Avoid per-frame allocations in hot loops (GC pauses) |
| WASM (Rapier + nav) | ≤ 256 MB | | Never shrinks |
| First-load download | ≤ 15 MB gzip | 25 MB | Rapier alone is 1.6 MB gzip; three ~130–400 KB gzip after tree-shaking (`three.core` + `three.module` = 406 KB gzip untree-shaken) |

Process: put a perf overlay in dev builds (stats panel from `three/addons/libs/stats.module.js` plus a custom readout of the rows above). Run a nightly local perf spec, and fail on regression > 10%.

---

## 12. Toolchain notes

- **TypeScript 7.0.2 is the native Go compiler** (released Jul 8 2026; 8–12× faster builds).
  - It **has no programmatic API** until 7.1. So `typescript-eslint` (peer `typescript >=4.8.4 <6.1.0`) and other tools that import the compiler need TS 6. Use the npm alias pattern from Microsoft's announcement: `"typescript": "npm:@typescript/typescript6@^6.0.2"` for tools and `"@typescript/native": "npm:typescript@^7.0.2"` for `tsc`. Or lint with `oxlint` (1.86), which doesn't need the TS API.
  - TS 7 defaults: `strict: true`, `module: esnext`, **`types: []`** (add `"types": ["vite/client"]`), `rootDir: "./"`.
  - TS 7 removes `moduleResolution: node`/`node10` (use `"bundler"`), `baseUrl`, and `target: es5`.
  - Vite doesn't type-check, so run `tsc --noEmit` in `npm run check`.
- **Vite 8.3 (Rolldown):**
  - Module workers via `new URL(…, import.meta.url)`.
  - The Rapier compat and recast `wasm-compat` builds inline their wasm, so no plugins.
  - Put KTX2 transcoder files and fonts in `public/`.
  - Node ≥ 20.19 / 22.12.
- **Vitest 5.0.3** peers `vite ^6.4 || ^7 || ^8` and needs Node ^22.12 or ≥ 24. The local Node is 22.17, which is OK.
- **Playwright 1.63:** WebKit 26.6 and Chromium 153 builds are already installed on this machine (`~/Library/Caches/ms-playwright`).
- **Licenses of picked libraries:** three (MIT), Rapier (Apache-2.0), postprocessing (Zlib), three-mesh-bvh (MIT), recast-navigation-js (MIT), navcat (MIT), n8ao (ISC), Cinzel (OFL-1.1). All are compatible with a closed or commercial game; keep notices in `CREDITS.md` (see `assets.md` Appendix B).

---

## Appendix A: benchmarks run for this document

**Setup:**
- Owner's Mac, Apple M4 Max (WebGL `UNMASKED_RENDERER`: "ANGLE Metal Renderer: Apple M4 Max").
- Playwright 1.63 Chromium 153.0.8010.12 (`channel: 'chromium'`, new headless) and WebKit 26.6, headless.
- Viewport 1280×720, DPR 1, `antialias: true`, AgX, `MeshStandardMaterial`, one hemisphere light plus one directional light, 2048² PCF shadow map, ground plane.
- "render CPU" = time inside `renderer.render()`. "+GPU sync" adds a 1-pixel `readPixels` to wait for the GPU.
- Medians over 40 frames. WebKit timings are quantized to 1 ms.
- The scripts are in the session scratchpad (not committed).

### A.1 three.js r186 `WebGLRenderer`

| Scenario | calls (C/W) | render CPU Chromium | render CPU WebKit | +GPU sync C / W |
|---|---|---|---|---|
| 500 boxes | 411 / 400 | 0.6 ms | ~1 ms | 1.8 / ~1 ms |
| 500 boxes + shadows | 875 / 867 | 0.7 | ~1 | 2.2 / ~2 |
| 1,000 boxes | 809 / 820 | 1.2 | ~2 | 2.7 / ~3 |
| 1,000 boxes + shadows | 1,730 / 1,736 | 2.0 | ~2 | 4.0 / ~3 |
| 2,000 boxes + shadows | 3,438 / 3,440 | 2.9 | ~3 | 5.0 / ~4 |
| 4,000 boxes | 3,242 / 3,182 | 2.8 | ~4 | 4.6 / ~5 |
| 4,000 boxes + shadows | 6,892 / 6,874 | 4.5 | ~5 | 7.0 / ~7 |
| 1,000 boxes, 1,000 unique materials | 820 / 828 | 1.9 | ~2 | 3.5 / ~3 |
| InstancedMesh 50,000 boxes + shadows (1.2 M tris) | 3 / 3 | 0.5 | ~1 | 4.6 / ~3 |
| BatchedMesh 4,000 instances, 4 geometries + shadows | 3 / 3 | 1.9 | ~2 | 6.6 / ~8 |
| 50 skinned (13 bones) + shadows, mixer 0.2 ms | 101 / 101 | 0.6 | ~1 | 2.5 / ~2 |
| 150 skinned (13 bones) + shadows, mixer 0.4 ms | 301 / 301 | 1.4 | ~2 | 4.4 / ~4 |

### A.2 three.js r186 `WebGPURenderer` (both browsers reported the WebGPU backend)

| Scenario | Chromium render CPU | WebKit render CPU | `compileAsync` Chromium | `compileAsync` WebKit |
|---|---|---|---|---|
| 1,000 boxes | 1.8 ms | 1.4 ms | 0.24 s | **13.7 s** |
| 1,000 + shadows | 2.6 | 3.1 | 0.25 s | 14.3 s |
| 2,000 + shadows | 5.1 | 5.5 | 0.06 s | 27.3 s |
| 4,000 + shadows | 9.0 | 12.2 | 0.10 s | **54.1 s** |

Without `compileAsync`, WebKit's first `render()` of 1,000 boxes took 58 ms (Chromium 39 ms). The stall is specific to async pipeline compilation.

For comparison, `WebGLRenderer.compileAsync` on the same 1,000-box scene with a cold program took 0.17 s in Chromium and 0.13 s in WebKit. With the program cached, 4,000 boxes took 18 ms and 9 ms. WebGL compile cost does not scale per object.

### A.3 Animation (`AnimationMixer.update` + `updateMatrixWorld`, ms per frame, 25-bone rig)

| | Chromium | WebKit |
|---|---|---|
| 50 characters, 1 action | 0.16 | 0.21 |
| 50, walk+run + upper-body layer | 0.32 | 0.27 |
| 150, 1 action | 0.44 | 0.44 |
| 150, walk+run + upper-body layer | 0.94 | 0.75 |
| 150, walk+run + additive layer | 1.02 | 0.82 |

### A.4 Rapier 0.21 compat

| | Chromium | WebKit |
|---|---|---|
| `RAPIER.init()` | 12 ms | 11–14 ms |
| Heightfield 256×256 cells (1,024 m) | 1.1 ms | 1 ms |
| Create 5,000 static cuboids | 6.6–7.5 ms | 8–9 ms |
| Create 51k-triangle trimesh | 8.8–9.3 ms | 14–16 ms |
| First `step()` after bulk insert | 4.1–4.4 ms | 8 ms |
| `step()`, static world (5,153 colliders) | 0.25 ms | 0.18 ms |
| KCC, 101 grounded capsules, per frame | **2.3 ms** | **3.0 ms** |
| `step()` with 50 dynamic + 101 kinematic bodies | 0.32 ms | 0.27 ms |
| 1,000 downward raycasts | 0.8 ms | ~1 ms |

Init produced no console warnings. The heightfield orientation check matched "column = X, row = Z, centered, scale = full extent".

### A.5 Navigation (Node 22)

| | Result |
|---|---|
| recast `init()` | 16 ms |
| Tiled navmesh, 729 tiles, 50.8k tris (recast-navigation-js) | 3.4–3.5 s |
| Same input (navcat 0.4.1) | 2.6 s |
| 200 long paths (recast) | 4.8 ms |
| Detour crowd, 150 agents, `update(1/60)` | 0.14–0.21 ms |

### A.6 Platform probes

| | Chromium 153 (Metal) | WebKit 26.6 |
|---|---|---|
| `MAX_TEXTURE_SIZE` | 16384 | 16384 |
| `WEBGL_multi_draw`, ASTC, S3TC, BPTC, ETC, `EXT_clip_control`, `KHR_parallel_shader_compile` | yes | yes |
| `EXT_disjoint_timer_query_webgl2` | yes | **no** |
| WebGPU adapter | yes (`metal-3`) | yes |
| OffscreenCanvas WebGL2 | yes | yes |
| `performance.now()` resolution (not cross-origin isolated) | 0.1 ms | **1 ms** |
| `navigator.hardwareConcurrency` | 16 | **8** |
| `Math.sin` bit-identical to the other engine | — | **no: ~4% of results differ by 1 ulp** (also vs Node 22) |

---

## Appendix B: sources

**three.js**
- three.js r186 npm tarball (`src/`, `examples/jsm/`), read directly
- [three.js Migration Guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)
- [three.js issue #33821](https://github.com/mrdoob/three.js/issues/33821) (WebGPURenderer material init)
- [three.js forum, donmccurdy on draw calls](https://discourse.threejs.org/t/understanding-about-webgpurenderer/86635/5)

**Rapier**
- Rapier 0.21 tarball (`dist/*.d.ts`, `rapier.mjs`)
- [rapier TypeScript bindings CHANGELOG](https://github.com/dimforge/rapier/tree/master/bindings/typescript)
- Bindings source: `bindings/typescript/src/geometry/shape.rs`, `src/control/character_controller.rs`
- [parry `heightfield3.rs`](https://github.com/dimforge/parry/blob/master/src/shape/heightfield3.rs)
- [Dimforge soft-bodies post (Sep 2026)](https://dimforge.com/blog/2026/09/25/advanced-soft-bodies-for-games-in-the-rapier-physics-engine/)

**Browsers and storage**
- [WebKit: Safari 26.0 features](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/) (WebGPU)
- [caniuse: WEBGL_multi_draw](https://caniuse.com/mdn-api_webgl_multi_draw)
- [WebKit Safari 17.0 features / storage policy](https://webkit.org/blog/14445/webkit-features-in-safari-17-0/)
- [MDN storage quotas and eviction](https://developer.mozilla.org/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)

**Navigation**
- [recast-navigation-js](https://github.com/isaac-mason/recast-navigation-js)
- [navcat](https://github.com/isaac-mason/navcat)

**Animation assets**
- [Quaternius Universal Animation Library](https://quaternius.itch.io/universal-animation-library) (CC0; 45 free clips, Pro/Source tiers)

**Engines**
- Godot: [releases](https://github.com/godotengine/godot/releases) (4.7.2 = Aug 2026), [Godot 4.7 notes](https://godotengine.org/releases/4.7/), [Exporting for the Web (4.5)](https://docs.godotengine.org/en/4.5/tutorials/export/exporting_for_web.html)
- Oblivion Remastered: [Wikipedia](https://en.wikipedia.org/wiki/The_Elder_Scrolls_IV:_Oblivion_Remastered), [UESP](https://en.uesp.net/wiki/Oblivion:Oblivion_Remastered)
- Unreal: [Unreal Engine license](https://www.unrealengine.com/license), [UE5 on Wikipedia](https://en.wikipedia.org/wiki/Unreal_Engine_5) (5.8 = Jun 2026)
- Unity: [Unity: canceling the Runtime Fee](https://unity.com/blog/unity-is-canceling-the-runtime-fee), [Unity pricing updates](https://unity.com/products/pricing-updates)
- Bethesda: [Creation Kit EULA (Steam)](https://store.steampowered.com//eula/1946180_eula_0)
- OpenMW: [FAQ](https://openmw.org/faq/), [releases](https://github.com/OpenMW/openmw/releases) (0.51.0 = Jun 2026)

**Toolchain**
- [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
- npm registry metadata for every version quoted above (queried 2026-10-03)
