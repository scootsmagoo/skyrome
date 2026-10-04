# Game flow and integration (`src/game/`)

This module turns the parts into a game. It boots Rome behind a loading screen, shows the title over the live city, runs character creation, and puts you at the Porta Capena at 04:30 on 11 May AD 113 (GDD §2.1). It also wires every service into the HUD and menus, and owns saving and loading, the calendar, the control presets and the input lab.

- Code: `src/game/` (flow, creation, wiring, adapters, calendar, presets), `src/scenes/rome.ts`, `src/scenes/inputlab.ts`, plus the input and camera additions in `src/core/Input.ts` and `src/player/`
- Tests: `tests/flow-*.test.ts` (input, presets, character, calendar, world/map, adapters)
- Third-party assets or libraries: none

## How to try it (for the owner)

1. `npm run dev`, then open <http://127.0.0.1:5173/?scene=rome> (Rome is the default scene).
2. The first time, the game asks **How do you play?** Pick **Trackpad** on a MacBook (it is preselected on a Mac). You can change it later in Esc → Settings → Controls.
3. On the title, choose **New Game**. In character creation, ↑↓ moves between sections and ←→ changes the choice. Pick an origin (four are playable, six are shown locked until v0.2), a sex (dress follows it), a name (Enter to type it, R suggests a Roman one) and one of three looks. Your character turns on a turntable on the right. Choose **Enter Rome**.
4. You stand just inside the Porta Capena before dawn, looking down the Circus valley at the Palatine. A banner gives the place and date (`ROMA`, a.d. V Id. Mai.), then `PORTA · CAPENA` and `MONS · CAELIVS`. The sky brightens behind you within about 20 seconds. The journal has **Into the City** (*Ad Forum*): follow the diamond on the compass up the Circus valley, through the Velabrum and the Vicus Tuscus to the Golden Milestone, with a discovery banner every few seconds on the way. Three toasts name the first keys.
5. Try **P** to quicksave and **L** to quickload (it asks first), **T** to wait, **V** for first person, **H** to swap the camera shoulder, and **N** to walk. **Esc** pauses; the pause menu has Quicksave and Quickload buttons too.
6. Open <http://127.0.0.1:5173/?scene=inputlab> on your Mac to check the trackpad: it logs every key, click, scroll and pinch and ticks off the checks of AC-24.

## URL parameters (`?scene=rome`)

| Parameter | Effect |
|---|---|
| `&quick=1` | Skip the menus: the default character (a Subura-born plebeian) at the Porta Capena |
| `&at=<landmark id>` | Skip the menus and spawn by that atlas landmark (crews looking at their buildings). Add `&menu=1` to get the title anyway |
| `&hour=<0-24>` | Start hour in quick mode |
| `&origin=<id>&sex=female&name=…` | The quick-start character |
| `&extent=city` | Build every landmark, not just the core |

## The flow

`game.flow` (`GameFlow`) is a small state machine: `boot → title → creation → spawning → playing`, with `'flow:state'` on every change and `'game:started' { kind: 'new' | 'load' | 'quick' }` when you get control.

1. **Boot** (`boot.ts#startRome`). The UI module's loading screen shows while `buildRome` runs. Then the sky, the player (the procedural humanoid), `installRpg` (`newGame: false`), the atlas locations, the audio, the flow and the UI wiring are installed, and any combat or NPC module present at build time is installed through `optional.ts`.
2. **Title** (the UI module's `showTitle`) over the city at 06:06, the camera circling the Colosseum valley. **Continue** loads the latest save, **Load** opens the save list. On first launch the control-preset picker opens over it.
3. **Creation** (`CreationScreen`) over the city; `CreationStage` frames your avatar on a turntable at the spawn point, lit by the sun, in the free space right of the panel. The avatar wears the origin's kit (formal dress stays in the pack). Esc returns to the title.
4. **Start**: a fade, the loading screen ("Leaving the Via Appia…"), `startNewGame` with the origin, sex and creation extra, time 04:30 on 11 May, the spawn, and `mq-01-madida-capena` started and tracked if that quest exists. The spawn uses the Porta Capena builder's `spawn-capena` spot when it exists. Until the gate has a passage (today it is a solid block), the player stands 10 m inside it, facing the guide's first waypoint (`SPAWN_LOOK_AT`), with the Palatine ahead and the dawn behind. A failure anywhere in here (another crew's quest content, say) never strands you on the loading screen: the quest start is guarded on its own, and if the new game state itself fails you are back on the title with a message.
   - **The opening dawn** (`DAWN_RAMP`): at timeScale 20 the sun would take 75 real seconds to rise, so a new game runs time 5× faster until about 05:05, easing out over the last game minutes. The date and the 04:30 start are unchanged, saves keep timeScale 20, and the ramp stops in combat. Set `flow.dawnRamp = false` for a scene that wants the dark.
   - **Arrival**: a `ROMA` banner with the Roman and modern date as you get control (new game and quick start without `&at=`).
   - **The first steps** (`guide.ts`, `game.flow.guide`): while no quest leads the way, a flow-owned journal entry, **Into the City** (*Ad Forum*), tracks the GDD §17.2 route as four objectives (the Circus valley; the street under the Palatine; the Vicus Tuscus through the Velabrum; the Golden Milestone). Its waypoints were walked in the built city; each clears within 12 m (shortcuts count), and the compass diamond and the map marker point at the next. It steps aside (untracked) while another quest is tracked and retires for good once a `main` quest runs. Saved as the `guide` section. On a new game, three toasts name the first keys with their live bindings.
5. **Play**. Quicksave (F5/P) needs no confirmation; quickload (F9/L, or the pause menu) always asks. Saving is blocked outside `playing`. Death (`vitals.dead`) waits 3 s, then offers the latest save or the title (the combat module can take this over with `game.combat.handlesDeath = true`).

**Measured (M4 Max, headless):** page load to title 6.7 s in Chromium and 9.0 s in WebKit; pressing **Enter Rome** to having control 1.2 s in both (AC-01 asks for under 20 s). The quick start is ready in about 7 s.

## What is wired where

| Piece | How |
|---|---|
| HUD bars | `sheet.vitals` (hidden outside play) |
| Compass | tracked quest objectives through `game.quests.resolveTarget` (resolvers for `location` and `npc` ids: registered places, placed landmarks, atlas centres, actors, `game.population.positionOf`, an NPC's home), the first-steps guide's next waypoint, plus discovered and nearby places from the map source |
| Discovery banner (AC-12) | every atlas landmark is a `LocationDef` (`locations.ts`: name, Latin name, map marker, footprint radius, discoverable unless underground), and so are the named hills (*Mons Palatinus*, *Mons Caelius*…) and the two valleys of the golden path (*Vallis Murcia*, *Velabrum*), without map markers. Places are discovered **on sight** (`discovery.ts`, `DiscoverySpotter`): tier-1 landmarks from 30 m beyond their footprint, tier 2 from 15 m, tier 3 from 6 m, 20 m more for palaces, temples, circuses, arenas, gates, fora, baths, theatres and arches; gates from at least 22 m; hills from their foot (slope + 50 m from the plateau edge). At most one discovery every 5 s, nearest first, so banners don't queue. The walk from the gate to the Forum finds a place every 5–15 s at a sprint (`tests/flow-world.test.ts` checks the gaps). The location radius itself (entered, the current place) stays the footprint; polygons (the Subura) use their inscribed circle, not the circumscribed one that covered the whole Forum. |
| Names | atlas names carry research notes. Player-facing names (banner, compass, the pause clock's place, saves) drop every parenthetical (`displayName`: `The Subura (district anchor)` → `The Subura`); the Latin line keeps the first alternative and drops notes (`displayLatin`: `Asylum / Inter duos lucos` → `Asylum`, `(Vatican necropolis)` → none). Map labels keep descriptive glosses (`Domus Augustana (private palace)`) but not notes (`mapName`). |
| Map | `AtlasMapSource` (`mapSource.ts`): terrain heights, the Tiber, roads, the Servian wall, aqueducts, bridges, every landmark footprint, hill labels, discovered pins, the player and quest markers. Places you cannot find (underground) are neither listed nor counted (205 places today). |
| Journal | `questLogFrom(game.quests)`; letters and notes from the inventory |
| Character / Skills / Inventory | the UI module's `characterViewFrom` / `inventoryViewFrom` over `player.sheet` and `player.inventory` |
| Saves | `saveSlotsFrom(game.save)`; files carry the character's name; extra sections `character` and `calendar` |
| Dialogue | anyone calling `game.dialogue.start(npcId)` gets the dialogue panel (`dialogueViewFrom`) |
| Notifications | `rpg:notify` toasts, minus what the HUD already shows as banners |
| Wait (T) | `rpg/rest.ts#wait` (refused in combat or while trespassing; asks for an autosave) |
| Avatar | `PlayerLook`: clothes, armor, helmet and shoes rebuild the mesh when they change (not mid-action or in combat); weapons, shields and torches swap in place; feeds the camera pitch to the arms |
| Audio | `installAudio`; the player's footsteps from `terrain.surfaceAt` through the terrain module's own `footstepSound` (mud → dirt, gravel and sand → gravel), with anything above the ground as stone; crowd, market and fountain zones on the fora and markets, river zones along the Tiber (crickets, owls and night carts come from the hour curves); music `explore`, with `combat` and `tension` overrides from `game.combat.active` / `alerted` (or `vitals.inCombat`) |
| Roman hours | `setDaylight` (UI `format.ts`) gets the day's real sunrise and sunset (sun centre on the horizon, as the sky draws it: 04:54–19:06 on 11 May), so the HUD clock, the pause menu and the Wait dialog count twelve horae of daylight and four vigiliae of night from them, not from 06:00/18:00 |
| Calendar (§14.10) | `game.calendar`: the shown date holds on the eve of the next main-quest anchor (11 May until `mq-04-columna`), festivals count only on their first elapsed day (the Lemuria shuts the temples on day one only); `game.time.formatRoman()` shows it; `rpg.hooks` (temples closed, Mercuralia discount, Augustalia vows) follow it |

## Controls (GDD §4.2–§4.3)

New actions in `DEFAULT_BINDINGS`: `dodge` (Option), `parry` (unbound), `lockOn` (X), `yield` (Y), `invoke` (Z), `quickWheel` (G), `hotbar1`–`hotbar8` (1–8), `wait` (T), `shoulderSwap` (H). `walkToggle` moved to **N**, quicksave and quickload gained **P** and **L**. The UI's hold-to-show-the-clock key moved from H to **O**.

`src/core/Input.ts` also now:
- swallows the click that captures the pointer, so it never attacks (AC-24);
- steps the zoom through `WheelAccumulator`: a step once 60 px have accumulated, then nothing until the wheel has been quiet for 250 ms. A continued scroll re-arms 250 ms after the step only when a delta is at least 80% of the stream's *peak* and looks like a new push (a line/page notch, an event 50 ms or more after the previous one, or a delta rising again). A trackpad flick (ramp-up, plateau, decaying momentum) is one step; a mouse wheel rolled on keeps stepping;
- leaves Cmd shortcuts to the browser (Cmd+R, Cmd+L, Cmd+F… are never actions and never prevented; Ctrl+key too unless Ctrl is bound), and releasing Cmd releases every key, because macOS sends no keyup for keys let go while Cmd is down;
- turns a pinch (Chrome's ctrl+wheel, Safari's gesture events) into camera zoom and never lets the page zoom;
- treats Caps Lock, if you bind it, as one toggle per press on every platform (`capsLockToggled`);
- eases arrow-key look in over 0.25 s at 150°/s yaw and 90°/s pitch, and can smooth pointer look (`lookSmoothing`);
- ignores mouse buttons listed in `ignoredCodes` (the Trackpad preset's "clicks don't attack").

`src/player/`: H swaps the shoulder (a 0.25 s slide); first person rides the avatar's head bone with 0.05 s of smoothing and stays 0.25 m off walls; scrolling into first person only in the Mouse preset; toggle sprint (ends when you stop) and hold-to-sneak options; auto-recenter (after 1.5 s of moving forward or forward-diagonally without look input, the camera swings behind you at up to 0.5 rad/s; the move keys stay mapped to where the camera was when the swing started, so W+D keeps a straight line instead of circling; standing still, looking, changing keys or anything else turning the camera resets it).

**Presets** (`settings.ts`, applied by `GameFlow.applyControls`):

| Setting | Mouse | Trackpad | Keyboard only |
|---|---|---|---|
| Clicks attack / block | yes | no (opt in) | no |
| Look sensitivity · smoothing | 1.0 · 0 | 1.6 · 0.08 s | 1.0 · 0 |
| Block · sprint | hold · hold | toggle · toggle | toggle · toggle |
| Scroll fully in → first person | yes | no (V) | no (V) |
| Auto-recenter | off | on | on |
| Lock-on · aim assist | manual · off | suggest · light | auto · strong |

Settings keys added (all optional): `controlPreset`, `presetPicked`, `presetApplied`, `difficulty` (`tiro` / `normalis` / `difficilis`), `sprintToggle`, `sneakHold`, `clickAttacks`, `zoomToFirstPerson`, `autoRecenter`, `lookSmoothing`, `powerHoldS`, `lockOnMode`, `aimAssist`. They appear in Settings under Gameplay and Controls. `settingsFixups` keeps the screen honest: a preset not yet written into the rows (a first launch, a new choice in the Preset row, the Controls "Defaults") writes every row it owns, including the core-defaulted look sensitivity and block mode; a row reset to unset takes the preset's value; difficulty defaults to Normalis. The player's own changes after that stay.

## For the other crews

- **Combat:** read `settings.data.difficulty`, `blockToggle`, `powerHoldS`, `lockOnMode`, `aimAssist`. Export `installCombat(game)` from `src/combat/index.ts` (or `install.ts`) and the flow installs it; set `game.combat = { active, alerted, targetView(), bossView(), compassMarkers(), handlesDeath? }` and the HUD and music follow. The bindings for `dodge`, `parry`, `lockOn`, `yield`, `invoke`, `quickWheel` and the hotbar are yours to consume. After `'player:avatar'` re-read `game.player.avatar` (new clothes replace the avatar object).
- **NPC life:** export `installPopulation(game)` (or `installNpcs` / `installNpcLife`) from `src/npc/population/index.ts`, `src/npc/install.ts` or `src/npc/life/index.ts`. Give `game.population.positionOf(npcId)` so quest markers find NPCs that aren't spawned. Call `game.dialogue.start(npcId)` to talk: the panel opens by itself.
- **Content:** quests and dialogue drop into their content folders as before. `mq-01-madida-capena` starts and is tracked on a new game, and the first-steps guide then retires. Marker targets may name a location, an atlas landmark id, an NPC, or a point. The guide's route (`GUIDE_STEPS`) is the corridor where the first NPCs and mq-01 should land.
- **World:** give the Porta Capena a passage and expose a spot with id `spawn-capena` (on the Via Appia outside it, facing the city): the spawn moves there by itself.

## Shared files touched

`src/core/Input.ts` (bindings and input handling, owned here), `src/player/CameraRig.ts` and `PlayerController.ts` (owned here), `src/ui/menus/ControlsScreen.ts` (labels and groups for the new actions), `src/ui/menus/PauseMenu.ts` (an exported `PAUSE_EXTRA_ITEMS` hook), `src/ui/menus/SettingsScreen.ts` (exported `SETTINGS_SECTIONS`), `src/ui/settings.ts` (clock key H → O), `src/ui/UIManager.ts` (honors `silent` item events, so the starting kit doesn't flood the notifications; ignores Cmd+key; the discovery banner falls back to the registry's Latin name for places without a map marker), `src/ui/format.ts` (`setDaylight`, and `romanHour` counts from the day's sunrise and sunset).

## Not done yet

- The hotbar, quick wheel and patron invocation have keys but no behaviour here (combat and RPG crews).
- Save thumbnails, export/import buttons in the save screen, and "Wait until…" for the calendar anchors.
- The title vista and the creation stage use whatever the world crews have built; the Porta Capena is still a placeholder block, so the spawn stands inside it.
- No NPCs or interactables along the first corridor yet (NPC and content crews); the guide and the discovery banners are what there is to follow.
- Character creation offers presets only (the GDD's full appearance sliders are a Should).
