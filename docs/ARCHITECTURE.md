# Skyrome architecture

Skyrome is a browser game written in TypeScript. It renders with Three.js r186 (`WebGLRenderer`), gets physics and character controllers from Rapier 0.21 (`@dimforge/rapier3d-compat`, which is WASM), and builds with Vite 8. All content is procedural: geometry, characters, animation and audio come from code, and the only exceptions are textures and fonts, which are downloaded from CC0 or OFL sources.

## Why the browser (for now)
- **Agents can build it.** Every asset is text (TypeScript), so AI agents can write, review and test all of it. A headless browser renders on the real GPU, which means each change can be checked with screenshots (`scripts/shot.mjs`).
- **There is nothing to install.** The owner opens a URL. GitHub Pages hosting works the same way as the owner's other projects.
- **The game logic can be ported.** Quests, dialogue, items, the atlas and RPG rules are plain data and logic with no Three.js dependency. If the project later moves to Godot or Unreal, those parts carry over and only rendering, physics and animation get rewritten. `docs/research/tech.md` compares the engines in detail.

## Frame loop (`src/core/Game.ts`)
Each rendered frame runs these steps in order:
1. `fixedUpdate(1/60)`, repeated N times. This covers movement, AI decisions and combat timing.
2. `physics.step` after each fixed update.
3. `update(dt, alpha)`, which handles animation, interpolation and logic driven by input edges.
4. `lateUpdate(dt)`, which places the camera, culls distant objects and updates the HUD.
5. Render.

Systems are sorted by `priority`. Some fixed points:

| Priority | System |
| --- | --- |
| -10 | PlayerController |
| 50 | ActorSystem (visual interpolation) |
| 95 | WorldRegistry (culling) |
| 100 | CameraRig |
| 110 | Interactions |
| 1000 | DebugOverlay |

## Extension points (so parallel work doesn't collide)

| Need | How |
| --- | --- |
| A new service on the game | `declare module '../core/Game' { interface Game { x: X } }`, then assign it during setup |
| A new event | Augment `GameEvents` in `src/core/Events.ts` from your own module |
| A new scene or test bed | Add `src/scenes/<name>.ts` default-exporting a `SceneDef`; open it with `?scene=<name>` |
| Quests | Add `src/quests/content/*.ts` default-exporting `defineQuest({...})` |
| Dialogue | Add `src/dialogue/content/*.ts` default-exporting `defineDialogue({...})` |
| NPCs | Add `src/npc/content/*.ts` default-exporting `NpcDef[]` |
| Static world content | Use `MeshBuilder`, then `placeAndRegister(game, id, group, colliders, pos, rotY)` |
| Something the player can use | `game.interactions.add({...})` |

## Module map

| Directory | Owns |
| --- | --- |
| `src/core/` | Game loop, input, physics wrapper, events, clock (Roman calendar), RNG, settings, math conventions |
| `src/player/` | Player actor, controller (speeds, jump, sneak), first/third-person camera rig |
| `src/actors/` | `Actor` (kinematic capsule plus visual), `ActorSystem`, appearance spec, avatar contracts (`AvatarView`, `CombatAvatar`); `avatar/` holds the procedural skinned humanoid and code-authored animation |
| `src/gfx/` | Material ids and library, `MeshBuilder` (merges per material and collects colliders), UV projection, post-processing |
| `src/arch/` | Procedural architecture: `classical/` (orders, temples, arches, arcades, basilicas, porticoes, domes), `fabric/` (insulae, domus, shops, city-block filler), `props/`, `vegetation/` |
| `src/world/` | Coordinate conversion (`coords.ts`), world registry and culling, terrain, water, sky and lighting, landmarks, city layout |
| `src/world/interiors/` | Interior cells: spaces bigger on the inside (the Column's stair and platform), built under or over the world and entered through doors with a fade (see `docs/modules/interiors.md`) |
| `src/data/` | `atlas.ts`, Rome c. AD 113 in real meters (see `docs/ATLAS.md`) |
| `src/rpg/` | Vitals, character sheet (skills, perks, levels), items, inventory, factions, crime, barter, loot |
| `src/quests/`, `src/dialogue/`, `src/npc/` | Engines plus content folders |
| `src/save/` | Save slots and the `Saveable` registry |
| `src/ui/` | DOM HUD (compass, bars, prompts), menus, dialogue, map, title and loading screens |
| `src/audio/` | Web Audio engine, procedural sound effects and ambience, generative music |
| `src/game/` | Game flow and integration: boot, title, character creation, spawn, wiring services into the UI, saves, calendar, control presets (see `docs/modules/flow.md`) |
| `src/scenes/` | `rome` (the game) plus dev test beds (`sandbox`, `avatars`, `arch`, `fabric`, `sky`, `ui`, `audio`, `inputlab`) |

## Coordinates
Coordinates are in meters, with +x east, +y up and +z south. The atlas stores real meters with the Miliarium Aureum as the origin. The game multiplies those by `WORLD_SCALE = 0.6` horizontally and vertically, so the city is compressed but slopes keep their real angles. Human-scale details stay 1:1. Characters face +Z in local space. See `src/core/math.ts` for the details.

## Performance budget (60 fps, M-series Mac, Safari and Chrome)
- Fewer than about 1500 draw calls and fewer than about 3M triangles in view.
- One shadow-casting directional light whose shadow camera follows the player.
- Shared materials only. Static geometry is merged per material per landmark or city block, and repeated props use instancing.
- Distance culling through `WorldRegistry`. Distant NPCs update their animation at a lower rate.
- Every scene can be measured with `node scripts/shot.mjs --scene X`, which prints `stats.drawCalls`, `triangles` and `fps`.
