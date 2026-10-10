# Interior cells (`src/world/interiors/`)

Some spaces are bigger on the inside than the outside: a stair inside a column drum, a platform on top of it. Each one is an **interior cell**. A cell is built in its own local frame (metres, 1:1) and placed in the world at an origin far from the street, under or over the world. The player moves between the world and a cell through **doors**, which are ordinary interactions. Every move goes through the fade in the UI, so the teleport happens in the dark.

The Column of Trajan is the worked example. Its stair is `dun-columna` and its platform is `columna-summa`. Read `src/world/interiors/columna.ts` next to this page.

- Code: `src/world/interiors/` (`InteriorSystem.ts` is the service, `types.ts` the defs, `install.ts` the installer, `columna.ts` the Column's cells), plus `src/arch/common/spiral.ts` (the spiral stair helper)
- Tests: `tests/interiors.test.ts` (frames, the service on a fake game), `tests/columna.test.ts` (the Column's route, headroom, doors), `tests/arch.spiral.test.ts` (the stair helper, walked by the real Actor)
- Third-party assets or libraries: none

## Installing and registering

`installInteriors(game)` runs in `src/game/boot.ts` before the optional modules. It creates the service, sets `game.interiors` and calls every export named `register…Interiors` in the modules of this folder (found with `import.meta.glob`). A folder with no such modules installs an empty service.

Registering a def (`game.interiors.register(def)`) adds its outside doors as interactions at once. Nothing is built yet.

## The def (`InteriorDef`, `types.ts`)

| Field | Meaning |
| --- | --- |
| `id`, `name`, `latin` | The cell id (e.g. `dun-columna`), its name and its Latin name. |
| `origin(game)` | The world placement of the local origin `{x, y, z, rotY}`. Returns `null` until the world can say (for example, the landmark is not placed yet). |
| `build({ game, builder })` | Builds the cell in its local frame. Returns the object, the colliders (local) and the spots (local). Runs once, on first use. |
| `bounds` | A local axis-aligned box. The player is inside the cell while their feet are in it. The test is 3D. |
| `doors` | `InteriorDoor[]`, described below. |
| `route` | Ordered local waypoints from the entrance to the far end, for bots, tests and NPC helpers. |
| `hiddenOutside` | Default `true`. The object is hidden unless the player is inside. Cells live under or over the world, so they are hidden from it. |
| `indoor` | `sky.indoor` while inside. Default 1. Open-air cells use 0. |
| `onEnter(game)`, `onExit(game)` | Called when the player's feet enter or leave the cell. |
| `afterPlace(game, object)` | Called once the built object is in the world. Use it for lamps and sounds that need world positions. |

A door (`InteriorDoor`) has an `id`, a `label`, a `verb`, `at` (where the prompt sits, local to `from`, or world when `from` is `null`), `from` (the cell it is in, or `null` for the outside world), `reach` (default 1.8 m), `to` and an optional `locked(game)`. `to` names the destination: `{ interior, position, heading }`. If `interior` is `null`, the position is a world point and the heading is a world heading. Otherwise both are local to that cell. A locked door says why it is shut (a notice) and does not move the player.

The interaction id is `door:<door.id>`, so `dun-columna:in` becomes `door:dun-columna:in`. A door is usable only from its own `from` cell, or from the world when `from` is `null`.

## The service (`game.interiors`)

| Call | What it does |
| --- | --- |
| `register(def)` | Adds a def (once per id). Outside doors become interactions. |
| `get(id)` | The def, if registered. |
| `all()` | Every registered def (the quest route walks their doors: docs/modules/nav.md). |
| `ensure(id)` | Builds the cell once: object, colliders, inside doors, `afterPlace`. False if it cannot be built yet. Build errors are logged and the cell is skipped. |
| `dispose(id?)` | Removes a built cell (object, colliders, doors). With no id, removes all cells and the outside doors. |
| `current()` | The id of the cell whose bounds hold the player's feet, or `null`. |
| `cellAt(point)` | The id of the cell whose bounds hold a world point, or `null`. |
| `isInside(id)` | `current() === id`. |
| `toWorld(id, local)` | A local point in the world. Works before the cell is built. |
| `spot(id, spotId)` | A named spot in the world: `{ position, heading }`. Builds the cell if needed. |
| `routeWorld(id)` | The cell's route, in the world. |
| `resolve(markerId)` | The world point for a quest marker `interior:<cell>:<spot>`, or `null`. |
| `enter(id, local, heading)` | Fades out, builds the cell if needed, puts the player at `local`, then fades in. |
| `leave(world, heading)` | Fades out, puts the player at a world point, then fades in. |

The move calls use `game.player.teleport()`, as the rest of the game does. The service calls the UI's `fade()` first and waits for it. A `busy` flag refuses a second move while one is running.

### When things happen

- The service re-checks the player every 0.2 s (in `fixedUpdate`) and after `save:loaded`. A check builds the cell the player is in, if it is not built yet.
- When the cell changes, the service runs `onExit` on the old cell and `onEnter` on the new one. It sets `sky.indoor`, shows or hides the cells, calls `game.locations.discover(id)` and emits the events below.
- The check is 3D, so the same x and z at another height is outside the cell.

### Events

- `interior:entered` with `{ id }`: the player's feet entered the cell.
- `interior:exited` with `{ id }`: the player's feet left the cell.

Quests use these. The Column's quest, for example, starts its stair fights when `dun-columna` is entered during the climb stage.

### Quest markers

A marker id of the form `interior:<cell>:<spot>` (for example `interior:dun-columna:landing-1`) is resolved through `resolve()`. It points at a spot in the cell's world position, and it builds the cell if needed. The HUD wiring in `src/game/wiring.ts` resolves quest targets through this.

## Why the cells sit 120 m under the world

The Column's stair is built 120 m below the Column's axis (`SINK`), so its walls and floors are in a pocket of their own, far from any street or floor of the city. The cell's bounds, its colliders and its object do not touch the world, and the world's terrain and physics do not see it.

That placement has three consequences that the rest of the game has to respect.

- **The terrain safety net skips cells.** `src/world/terrain/safety.ts` puts a player who falls below the terrain back on the last solid ground. It does nothing while the player is in a cell (`interiors.current()` is not `null`), because a cell is below the floor on purpose.
- **Fights on another level do not reach the street.** Combat (`src/combat/CombatCore.ts`) ignores a foe more than `HEIGHT.melee` (1.6 m) above or below for blows, sweeps and the aim assist. It ignores a foe more than `HEIGHT.aware` (2.5 m) above or below for aggro and perception. So a fighter on another turn of the stair, or in a cell under the street, cannot strike or chase through the floor. The NPC system also ignores a fight more than 4 m away vertically when it raises the alarm: the crowd in the court does not react to a fight on the stair.
- **NPCs stay at street level.** Townsfolk wander only on street-level ground. A cell's spots are for quest characters that are staged there (Bitus on the platform, for example).

## Worked example: the Column (`columna.ts`)

Both cells are built from the Column's own frame (`src/world/landmarks/columnFrame.ts`: `columnLocalToWorld`, `columnRotation`, `COLUMN_LOCAL`).

### `dun-columna`: the stair under the court
- **Origin:** the Column's axis, 120 m under the court (`SINK`), hidden outside. The local door side is −z.
- **Build:** a vestibule with the bronze inner door, a small chamber to the −x side with an empty marble shelf, then the spiral stair: 185 risers of 0.19 m, 18 steps to a turn, with quarter-turn landings after steps 62 and 124. The well wall is cut for the vestibule mouth and 43 slit windows, and a cap sits over the top landing.
- **Spots:** `entry`, `chamber`, `landing-1`, `landing-2`, `top`.
- **Bounds:** x −3.2 to 2.0, y −0.5 to 39, z −4.0 to 2.0 (local).
- **Doors:**
  - `dun-columna:in`, the bronze door from the court (`from: null`). Locked until the flag `columna-open` is set. It says "The bronze door is shut and sealed with lead."
  - `dun-columna:out`, from the stair back to the court, facing away from the door.
  - `dun-columna:up`, the hatch at the top, to `columna-summa`.
- **Route:** the entry, the mouth, then one point per tread along the stair.
- **Camera:** on enter the player switches to first person (a stair a metre wide is no place for the over-the-shoulder camera). On exit the player's own view comes back, unless they changed it inside.

### `columna-summa`: the platform on the abacus
- **Origin:** the top of the abacus on the Column's axis, hidden outside, `indoor` 0 (open air).
- **Build:** a marble slab 5.2 m across, with a bronze rail (solid on all four sides), the drum (1.45 m high, 0.95 m radius) and the gilded emperor (1:1), with a small bronze door on the drum's −z face.
- **Spots:** `hatch` (where the stair comes out), `bitus` (the archer's place on the platform), `view`.
- **Bounds:** x and z −2.8 to 2.8, y −0.5 to 6.
- **Doors:** `columna-summa:down`, the bronze door back to the stair's top.
- **Column top:** while the player is on the platform, the Column's own top chunk (`column-trajan:lod:column-top`) is hidden, because the platform stands in for it. It comes back on exit. The scan runs at each enter and exit, so a rebuilt landmark is never left stale.

## Spiral stairs (`src/arch/common/spiral.ts`)

`spiralStairs(b, spec, at?)` builds a spiral stair round a newel into a `MeshBuilder` and returns its walking plan. The flight rises from y = 0 with the newel on the y axis. A point at angle `a` sits at `(sin a, y, cos a)`. Each tread is a wedge of three radial plates (visual and collider), and a landing is a flat sector at the height of the tread before it, so landings add no rise.

`SpiralSpec`:

| Field | Meaning |
| --- | --- |
| `count`, `rise` | The number of risers and the rise of each (m). The total rise is `count * rise`. |
| `stepsPerTurn` | Risers in one full turn. |
| `innerR`, `outerR` | The newel radius and the inner face of the well wall. The walking line is halfway between. |
| `startAngle`, `clockwise` | Where step 0 sits, and the turning direction (default: the angle grows as you climb). |
| `landings` | `{ after, turns }`: a flat landing after step `after` (0-based), `turns` of a turn long. |
| `material`, `newelMaterial`, `collide`, `newel` | Materials, collision, and the newel cylinder (default on, from 0 to the top + 2.4 m). |

`SpiralResult`:

- `height`, `steps` (centre angle and tread top of each step), `landings` (their arcs and heights), `walkR` (the walking radius) and `endAngle`.
- `pointAt(t, r?)`: the point on fractional tread `t` (y is the tread top).
- `route(every?, r?)`: the walking line as waypoints. Every `every`-th tread centre, plus points along each landing arc, so a walker never cuts across the newel. It always ends on the last tread.

### Headroom rule

Without landings, the plates above a walking point are one turn (`stepsPerTurn * rise`) away, so the headroom is `(stepsPerTurn − 1) * rise`. A landing of `turns` adds no rise over its arc, so the flight above it is only `(1 − turns) * stepsPerTurn` risers up. Keep

`((1 − turns) · stepsPerTurn − 1) · rise ≥ 2.3 m`

under every landing. A capsule spans about two treads, and the step-up needs room for the whole body over the next tread, so its real clearance is about one rise less than on the walking line.

The Column uses 18 steps a turn, a rise of 0.19 m and quarter-turn landings. That gives 2.38 m under a landing and 3.23 m elsewhere. `tests/arch.spiral.test.ts` walks the stair up and down with the real player capsule and with townsfolk, and checks at least 2.0 m of headroom along the walking line.

The Column's cell route keeps every tread instead of the spec's point every seven steps. Sixty-degree chords fall off the walking line for a 0.3 m capsule near step 75, so `tests/columna.test.ts` fails on the sparser route. The deviation is noted in `columna.ts`.

## Conventions

- **Frames are local.** Build in the cell's own metres, with the origin where the object's origin is meant to be. Nothing in a cell is placed in world coordinates.
- **Cells are hidden by default.** A cell that lives under or over the world sets `hiddenOutside` and is shown only while the player is inside.
- **Move the player only through the service.** Use `enter`, `leave` or a door. Never call `player.teleport()` into a cell from elsewhere, so the fade and the state changes always run.
- **Colliders go through `Physics`.** The service adds them with `addOrientedBox`, `addCylinder` and `addTrimesh` and removes them on `dispose`.
- **No state in the frame.** Quest and dialogue logic react to the events and to `isInside`, not to the object.
