# UI module (`src/ui/`)

The HUD, every menu, dialogue, barter, containers, the book reader, the map, and the title and loading screens. All of it is plain DOM and CSS over the canvas, with no framework, styled in Cinzel and EB Garamond on dark bronze and parchment. Everything works with the keyboard alone, and everything also works with a trackpad: nothing depends on hover, and every hit target is at least about 40 px. Hovering a list row selects it only after the pointer really moves, so rows rebuilt under a resting cursor (sorting, buying) never steal the keyboard's selection.

See it with `npm run dev`, then open `?scene=ui`. The [dev scene](#dev-scene) section lists the screenshot URLs.

## Install and wire up

```ts
import { installUI, showTitle, showLoading } from './ui';

const ui = installUI(game, uiRoot);     // game.ui, a System at priority 900
ui.provide({                            // every source is optional
  vitals: () => game.player.sheet.vitals,
  character: () => characterViewFrom(game.player.sheet, { name, title, skills: SKILLS, perks: PERKS }),
  inventory: () => inventoryViewFrom(game.player.inventory, getItemDef, { onDrop: spawnDroppedItem, book: bookFor }),
  quests: () => questLogView,           // implements QuestLogView
  map: () => mapSource,                 // implements MapDataSource; return the SAME object every call (terrain is cached per source)
  saves: () => saveSlots,               // implements SaveSlotsView
  resolveTarget: (t) => ...,            // MarkerTarget → {x, z} (NPC position, location centre)
  itemName: (id) => getItemDef(id)?.name,
  currentLocation: () => locations.current()?.name ?? null,
  target: () => combat.targetView(),    // enemy bar
  boss: () => combat.bossView(),
  detection: () => stealth.detection(), // 0..1 for the sneak eye
  inCombat: () => combat.active,
  compassMarkers: () => combat.hostiles().map(...),
  fastTravel: (locationId) => travel.to(locationId),
  wait: (hours) => rest.wait(hours),    // default: game.time.advanceHours; return a reason string to refuse
  quitToTitle: () => ...,               // default: location.reload()
});
```

The UI only reads through these small read models, defined in `src/ui/types.ts`. Adapters for the engine contracts are in `src/ui/adapters.ts`:

| Engine | What it provides | Adapter |
| --- | --- | --- |
| `src/rpg` (`CharacterSheet`, `Inventory`) | `CharacterView`, `InventoryView` | `characterViewFrom()`, `inventoryViewFrom()`: Equip lets `Inventory.equip()` pick the slot and unequips from whichever slot holds the item; Read goes through `Inventory.use()` so skill books train and are marked read (text from the `book` option, else the item's own `text`) |
| `src/dialogue` | implements `DialogueView` (`npcName`, `line`, `choices`, `choose()`, `advance()`, `end()`, `onChange()`) and calls `game.ui.openDialogue(view)` | `skillCheckTag()` gives `[Rhetoric 40]` with success odds per the `SkillCheck` rule; `bribeTag()` gives `[25 denarii]` |
| `src/quests` | `QuestLogView` (quests with journal entries and objectives, `setTracked`, notes) | `questMarkersFrom(log, resolve)` for the map |
| `src/save` | `SaveSlotsView` (`list` / `save` / `load` / `remove`) | none needed |
| atlas and terrain | `MapDataSource` (bounds, `heightAt`, rivers, roads, walls, aqueducts, bridges, landmark footprints, labels, `locations()`, `player()`, `questMarkers()`), all in **game meters** | none yet: map atlas landmark `rotation` straight to `MapShape.rot` (the same compass-bearing convention) |
| barter, containers, books | `BarterView` (`commit(deal)` is atomic), `ContainerView`, `BookView` | `game.ui.openBarter / openContainer / openBook` |

`src/ui/mock.ts` and `src/ui/mockMap.ts` are complete working examples of every view, built on real Rome geography.

## Policies

- **Modal stack.** `game.ui.open(modal)` / `close()` / `back()` / `closeAll()`. While any modal is open, `game.input.enabled = false` and pointer lock is released. `ui:modal` is emitted on every open and close.
- **Pause.** Menus **and dialogue** set `game.paused`, so nobody can attack a player whose gameplay input is off. In a conversation Esc opens the pause menu over it (GDD §4.5: pause at any time, including in dialogue; Save is disabled there and in combat), and Tab, Backspace or the Goodbye choice leaves. Being hit (`ui:hit`) ends a conversation. This is a per-modal flag (`Modal.pauses`).
- **Messages under modals.** While a modal (or the title/loading screen) hides the HUD, notifications, banners, subtitles and hit arcs are frozen, so a 'Quest started' raised by a dialogue choice plays when the conversation ends. Ones already on screen get at least another 2 s.
- **Input hand-back.** When the last modal closes, input is re-enabled one frame later, and keys the UI consumed never reach core `Input` (`stopImmediatePropagation`). This way the E or Esc that closed a dialogue cannot also trigger a gameplay action.
- **Pointer lock.** Losing pointer lock unexpectedly (Esc while mouse-looking, switching apps) opens the pause menu. Clicking the canvas re-locks the pointer, and the UI swallows that click (a capture listener ahead of core `Input`) so it never also attacks. A one-line hint about mouse-look and the arrow keys appears twice per session.
- **Key releases** go to every open modal, not just the top one, so a key held on the map is released even if a confirm dialog opened over it.
- **Wait** (T) is refused in combat (`sources.inCombat`); closing it during the dim cancels, and no time passes.
- **Blockers.** `ui.block('loading' | 'title' | 'cutscene', on)` disables input and the hotkeys without a modal.

## Keys

| Key | Action |
| --- | --- |
| Esc | Pause menu, or close / go back (in a conversation: pause over it) |
| Tab | Character menu (Tab again closes); leaves a conversation |
| I / J / M / K | Inventory / Journal / Map / Skills (the same key again closes) |
| [ ] | Previous or next tab |
| T | Wait |
| hold O | Show the time and date (H swaps the camera shoulder, GDD §4.2) |

In menus: ↑↓ select, ←→ change column, category or value (Shift for bigger steps), Enter, Space or E activates, and the key shown on each button does the same thing. For example, X drops and S sorts in the inventory; T tracks and M shows the map in the journal; C confirms a barter; R takes everything from a container; F fast-travels on the map. Dialogue choices also take the number keys 1–9.

Core action bindings come from `game.input.bindings`. The UI-only keys (Wait, Clock) live in `settings.uiBindings`. Rebinding in Controls writes `input.setBindings()` and saves to `settings.bindings`, which are re-applied at startup.

## Events

The UI **listens** to these events (other modules need not import the UI):

- `location:discovered`: banner with the inscriptional Latin name, for example `FORVM · ROMANVM`
- `quest:started`, `quest:completed`, `quest:failed`: banners. `quest:stage` produces new objectives as notifications, and `quest:objective` (done) produces a completion note.
- `player:levelup`: banner. `skill:levelup`: notification.
- `item:added` and `item:removed` (given / quest): notifications. A `source` of `'silent' | 'barter' | 'container'` suppresses the notification.
- `crime:committed` (witnessed): warning.
- `ui:notify {text, kind}`, `ui:banner {...}`, `ui:subtitle {text, speaker}`, `ui:hit {x, z}`: emit these from anywhere.

The UI **emits** `ui:modal {open, id}`.

## Title and loading

```ts
const loading = showLoading(app, { bindings: game.input.bindings }); // works before Game exists
loading.progress(0.4, 'Raising the Forum of Trajan…');
await loading.done();

showTitle(game, {
  onNewGame: () => startNewGame(),
  onContinue: () => loadLatest(), canContinue: hasSave,
  orbitCenter: { x, y, z }, orbitRadius: 30, orbitHeight: 8, // a nice vista; the camera orbits slowly
});
```

The title is a modal over the live scene: the world animates while the camera orbits. New Game fades to black, runs the callback, puts the camera back behind the player and fades in.

## Settings added (declaration merging, all optional)

`compassLatin` (SEP · ORI · MER · OCC), `subtitles`, `hudBars` (`auto` | `always`), `crosshair`, `bindings`, `uiBindings`. The Settings screen applies every change live: `uiScale` sets the root font size, so the whole UI scales because all UI sizes are in rem. The size is limited to what fits the window (`uiFontPx()` in `settings.ts`: at least 60×34 rem, so 140% becomes about 132% on 1280×720) and the Settings row says so when it is limited. Layouts adapt with container queries on `.sr-ui` (`@container sr-ui (max-width: 70rem)` / `(max-height: 40rem)`); unlike media queries these measure in rem at the current interface size. The HUD's compass is `min(34rem, 40vw)` wide (`--cw`), the notes and clock wrap within the room beside it, and the top center stacks compass, enemy bar and banner instead of overlapping them. `lookSensitivity`, `invertY`, `renderScale` and `maxPixelRatio` go through `game.resize()`, `shadows` toggles shadow maps, `viewDistance` goes to `game.world.distanceScale`, and `showFps` toggles the debug overlay. Antialiasing needs a restart, and the screen says so.

## Look and files

- Tokens are defined in `ui-base.css` (`--sr-*`): ivory ink, gold and bronze lines, oxblood selection, parchment for the journal, map and books. Fonts are self-hosted in `public/fonts/` and credited in `docs/credits/ui.md`.
- Procedural art: icons (`icons.ts`, a 24-unit grid used both as inline SVG and as `Path2D` on the map canvas), laurel rules, wreath, SPQR crest and meander (`motifs.ts`), and parchment and grain textures (`textures.ts`).
- The map (`map/MapRenderer.ts`) draws on Canvas 2D on demand. Its terrain (about 160k height samples, ~200 ms) is built once per map source and cached, and is prebuilt behind the title or loading screen. Hill shading lit from the north-west plus contours from `heightAt` (marching squares in `map/terrain.ts`), the Tiber, cased roads, the Servian wall, aqueducts, footprints and collision-aware labels (English with Latin). Pins and quest markers are obstacles that labels avoid. The scale bar is in *passus*, written in Roman numerals.
- To add a screen, extend `BaseModal`, build into `this.el`, and use `NavList` for keyboard and pointer selection. Then `game.ui.open(new MyScreen())`.

Pure logic with unit tests: `format.ts`, `models.ts` (list navigation, inventory categories and sorting, barter deals), `nav.ts` (hover vs keyboard selection), `settings.ts` (interface scale limit), `hud/compassMath.ts`, `map/view.ts` (including held pan keys), `map/terrain.ts`, the adapters and the mocks. The tests are in `tests/ui-*.test.ts`.

## Dev scene

`?scene=ui` shows a small sunlit forum with the player, Decimus the baker (E to talk), his strongbox (owned, so taking from it is stealing) and a book on a table, with every source fed by mocks.

- `&open=pause|character|skills|inventory|journal|map|settings|controls|credits|save|load|dialogue|barter|container|book|letter|wait|confirm|title|loading` opens that screen.
- `&hud=demo` fills every HUD element.
- Dev keys while playing: 1 notification, 2 discovery, 3 quest start, 4 take a hit, 5 enemy bar, 6 boss bar, 7 bark, 8 level up, 9 title, 0 loading.
- `window.__uiMocks` exposes the mocks for `scripts/shot.mjs` eval steps.

## Not done yet

- The map has no fog of war: undiscovered landmarks are drawn, but only discovered pins are. Fast travel only calls the provided callback.
- There is no gamepad navigation yet. `NavList` would map to it directly.
- Saves need thumbnails from the save module, for example a 192×108 snapshot of the canvas.
