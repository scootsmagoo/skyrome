# Interior cells (`src/world/interiors/`)

Some spaces are bigger on the inside than the outside: a stair inside a column drum, a platform on top of it. Each one is an **interior cell**. A cell is built in its own local frame (metres, 1:1) and placed in the world at an origin far from the street, under or over the world. The player moves between the world and a cell through **doors**, which are ordinary interactions. Every move goes through the fade in the UI, so the teleport happens in the dark.

The Column of Trajan is the worked example. Its stair is `dun-columna` and its platform is `columna-summa`. Read `src/world/interiors/columna.ts` next to this page.

- Code: `src/world/interiors/` (`InteriorSystem.ts` is the service, `types.ts` the defs, `install.ts` the installer, `columna.ts` the Column's cells, `generic.ts` and `kits/` the cells behind city doors, `residents/` the people at home in them, `named.ts` and `named/` the named places' cells), plus `src/arch/common/spiral.ts` (the spiral stair helper)
- Tests: `tests/interiors.test.ts` (frames, the service on a fake game), `tests/columna.test.ts` (the Column's route, headroom, doors), `tests/arch.spiral.test.ts` (the stair helper, walked by the real Actor), `tests/named-interiors.test.ts` (the named cells' frames and routes, the door finder, the kits' chests, container placement), `tests/residents.test.ts` (who is home when, the waking rule, the places clear of the furniture, residents on a fake population)
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

## Generic cells behind city doors (`generic.ts`, `kits/`)

The city's ordinary doors (docs/modules/doors.md) lead into cells made from **kits**. The first time
the player goes through a door, `enterThroughDoor(game, door, kitId, { wealth })` registers a cell
`gen:<door id>`, built from the kit and a seed hashed from the door id, so the same door always leads
to the same rooms.

- **Placement.** The cell is sunk 160 m under its own door, plus 16 m per slot, so the cells of nearby doors never meet. Its rotation is the door's, so "into the building" carries on inside.
- **The way out.** The cell's one exit door puts the player back in the street, just in front of the door they came in by, facing out.
- **Budget.** At most four generic cells stay built. The oldest one the player is not in is dropped, with its geometry, colliders, lamps and doors, and is rebuilt the same from its seed later.
- **Saved.** The registrations are saved (`interiors-generic`), so a game saved inside a cell loads inside it.
- **View.** Generic cells are seen in first person, as the Column's stair is. The player's own view comes back outside.
- **Weathering.** The street weathering in the material shader (grime, moss, ivy, flaking) is off for walls more than 6 m below the ground, so cells look clean.

A kit (`InteriorKit`) has a pure, cheap `plan(seed, wealth)`, which gives the bounds, the entry, the
exit prompt and a route, and a `build(ctx)` that returns the object, colliders, spots, `lamps` (local
flames handed to the light pool on placement) and `doors` (door-system doors local to the cell, such as
a tenant's lockable door). Shared parts are in `kits/parts.ts`.

| Kit | Behind | What is inside |
| --- | --- | --- |
| `insula-stair` | an insula's stair door | a plastered passage, a flight to the landing with the tenants' doors, and one flat (bed, table, stools, brazier, shelf, a window, **the tenant's chest**) behind its own door, locked half the time (undone from 17:00 to 22:00, when the tenant is in) |
| `domus` | a house's front door | fauces, an atrium with the impluvium under the compluvium, bedrooms off both sides, the lararium, the tablinum (with **the master's strongbox**) and a triclinium |

**Chests in kits.** A kit's `build` can return `containers` (`KitContainer`: an id, the floor point, and the
`ContainerSpec` without its id and place). `chest(d, look, x, y, z, yaw)` in `kits/parts.ts` draws the box. When the cell is
placed, `generic.ts` asks the content module for each one (`game.content.addContainer(spec, worldPoint)`, `src/content/install.ts`),
with the id `<cell id>:<id>` (for example `gen:<door>:chest`). That id is also the key of what was taken and unlocked in the world
deltas, so a dropped cell that is rebuilt later shows the same chest in the same state. The prompts go with the cell
(`drop`). The tenant's chest (`cista-insulae`, owner `tenant:<seed>`, the same owner as the flat's door) is locked on a `simplex`
lock about half the time (an independent hash of the seed, so the flat's own layout does not change) and holds `chest.common`
(`chest.rich` above wealth 0.6). The master's strongbox (`arca-tabernae`, label "The master's strongbox", owner `household:<seed>`) is
`mediocris`, or `difficilis` above wealth 0.8, and holds `chest.common`, `strongbox` (above 0.45) or `chest.rich` (above 0.8).
Nobody is in a cell to see a theft, so a lockpick is the only cost.

## Residents (`residents/`)

Nobody used to be home in a generic cell, so theft and lock-picking there were never seen. Now some cells have people in them.

- **Who is home** (`residents/plan.ts`, pure). A kit's `residents(seed, wealth)` lists the people its rooms could hold (`ResidentSpot`: an id, a person, the chance the household has them at all, and the places they take: `bed`, `seat`, `post`, `bedside`). `whoIsHome(spots, seed, hour)` says who is there and what they are doing. The same door, seed and hour always give the same people. Each person has a number of their own from the seed, compared with the chance for the part of the day (`PROFILES`), so someone home by day is also home in the evening and at night. At most `RESIDENT_CAP` (3) at once.
  - `insula-stair`: the **tenant** (mostly home at night and in the evening, 20 % by day) sleeps in the bed in the corner, sits on a stool in the evening and stands by the door by day; sometimes a second person (`mate`, up and about, at the table in the evening, at the window by day). The flat's door, when locked, is undone 17:00 to 22:00 (`openHours`): locked by day (out) and at night (asleep), open when the tenant is in and receiving.
  - `domus`: a **doorkeeper** (`ianitor`; the richer the house, the likelier: `ianitorChance`) in the fauces by day and asleep on his straw mat (drawn only when the house keeps one) at night; the **master** (`dominus`) at his desk in the tablinum by day (next to the strongbox), in the atrium in the evening, in the first bedroom on the right at night; his wife (`domina`) in the atrium, in the first bedroom on the left at night.
  - Bedtime (21:30 to 23:00) and rising (04:30 to 06:30) are each person's own.
- **Spawning** (`residents/system.ts`). The people exist only while the player is in the cell: the def's `onEnter` calls `arriveResidents`, which spawns each one with `population.spawnResident(id, name, appearance, worldPoint, heading)` (a non-ambient `Npc` with the id `res:<cell id>:<spot>`, placed at an explicit world point because the cell is under the street: no nav grid or ray finds its floor) and poses it with `population.pose` (the 'sleep', 'sit' or 'stand' loop). `onExit` (and `drop`) call `leaveResidents`, which despawns them. A person killed stays dead for the session (`population.isKilled`). Every two seconds the people are brought in line with the hour (a person out of sight is swapped for the new hour's; one the player has spoken to or woken stays).
- **Crime.** A resident is an ordinary `Npc` of the population with `Npc.resident` set. A sleeper is not a witness (`population.witnesses` skips `resident.asleep`), an awake one turns to face the player in sight, so the container and door crime paths (`witnesses(pos, 20)`) count them; `NpcBrain.alarm` hands an alarm to `resident.alarm` (a fight wakes a sleeper; a witnessed crime makes an awake one cry out). The cry carries into the street at the door (`population.alarm`, throttled), where guards respond. A crime nobody saw is remembered for the visit (`pending`): a sleeper woken by a noise who then sees the thief reports it (`crime.commit` with the resident as witness). Leaving the cell forgets the pending crimes.
- **Waking** (`wakeChance`, pure). Noises wake sleepers by distance: `pick` (the screen is open: a roll at the start and every 3 s), `snap` (`lockpick:snap`), `force` (`door:unlocked`, how force), `bash` (a swing that hits no one), `rummage` (a furtum), `fight`/`shout` (alarms). The chance falls to zero at the noise's range; sneaking halves it; each sleeper has a lightness 0.6 to 1.4 from the seed. A woken sleeper sits up (a line), then gets out of bed beside it and stands. The prompt on a sleeper reads "Wake" and wakes them.
- **Talking.** The prompt replaces the default Talk (posed people are scripted): a greeting by day, a challenge at night ("What are you doing in my house?!"), lines by person in `plan.ts` (`lineFor`). No dialogue tree.
- **Cost.** At most three avatars, only while the player is inside, freed on leaving. Per-frame work is a system with an early return when no cell is active.
- **Not done.** The named shops' keepers stay in the street (their quests and dialogue expect them at their spots); the Ludus cells have no residents (the men stay in the court); residents do not fight back or flee, they shout.

## Named cells (`named.ts`, `named/`)

The places the design names have hand-built cells, in the manner of the Column's: `castor-loculi` (the deposit vaults in the podium
of the Temple of Castor), `ludus-cellae` (the Ludus Magnus' barracks), `popina-vici-tusci` (the Silver Pig), `taberna-armorum`
(Euhodus' arms shop) and `dun-taberna-collapsa` (the cellar of the burned taberna). `registerNamedInteriors(game)` (picked up by the
installer like the Column's) registers them, and the bankers' strongbox in the Basilica Paulli (below). Each cell is a `NamedCell`
(`named/common.ts`): bounds, entry, route, a way out, a `build`, and the place it belongs to. `namedDef` makes the `InteriorDef`
(first person inside, lamps and doors handed over in `afterPlace`, the exit door). The files:

| File | Cell | Way in | Inside |
| --- | --- | --- | --- |
| `castor.ts` | `castor-loculi` | the grated door in the podium's west flank: an interior door from the world at the Forum builder's `castor-strongroom` spot (the "Look inside" line was dropped from `FORUM_LOOKS`) | a barrel-vaulted passage with iron cages of deposits, three deposit chests (`ctn-loculi-1..3`, key `clavis-loculi` which nobody has, so the lockpick, `difficilis`), and the keeper's room with the desk, the scales and the shelves |
| `ludus.ts` | `ludus-cellae` | the third ground-floor cell door left of the mess hall on the court's back wall (`CELL_DOOR_ALONG` from the `ludus-cellae` spot; the spot itself stands before the mess hall's opening) | a passage between six cells, each with a bunk, a stool, tallies on the wall, **its own door** (`ludus-cellae:cell-<n>-<e|w>`, door system, owner `ludus-magnus`, `mediocris`, unlocked 05:00 to 21:00) and the locker (`ctn-cella-ludi-1..6`), a barred window at the end |
| `popina.ts` | `popina-vici-tusci` | a plank door found on the nearest plain wall to the spot (see below), open 05:00 to 02:00, `mediocris`, Chreste's | the shop room (counter with three dolia, hearth and cauldron, two tables, the price list), the store room (pallet, amphorae, `ctn-arca-porci`) |
| `arms.ts` | `taberna-armorum` | a studded door found likewise, open 06:00 to 19:00, `mediocris`, Euhodus' | the shop (counter and scales, swords and daggers on a board, shields, spears, two armour stands, `ctn-arca-armorum` behind the counter) and the forge behind it (fire, anvil, vat, a cot) |
| `collapsa.ts` | `dun-taberna-collapsa` | a cellar hatch in the paving a few metres from the burned taberna's spot (a `FrontSpec.hatch`) | the stair down, a ruined cellar (charred beams half fallen, rubble, the light well with a ladder up to the next court's `taberna-collapsa-puteus`), a side chamber with a scorched chest (`ctn-cista-combusta`) |

**Frames.** A named cell's frame has the world's axes (rotation 0) and its floor at y = 0; it sits `NAMED_SINK` (240 m) under its
place, plus 6 m per slot. A cell's origin is the anchor (the door's spot).

**Containers.** The content module (`src/content/install.ts`) places a container with `interior: true` only when the place
`<at>:interior` is registered; `registerNamed` registers it at the cell's floor point (radius 0.3 m, so walking in the street above
never "enters" it). The container is then at that point plus `(dx, dz)`, on the floor, with no probing of the street above and
no stand-in: the cell draws its chest (`drawChests(d, place)` reads the same specs, so the box and its prompt cannot disagree).
So `dx` and `dz` of those specs are metres in the cell's frame.

**The places that have no walls.** The Silver Pig, the arms shop and the burned taberna are places in the content (spots on the
streets), not buildings, and the city builds a block's colliders only near the player. So their doors are hung by `named/front.ts`
(`NamedFronts`, `game.namedFronts`): within about 26 m of the spot it casts rays from the spot for the nearest plain, face-on wall (flat across the door
and its jambs, high enough for the lintel, clear in front, level ground), hangs a stone porch and a plank door there with the door
system's lock, key, pick, blows and `effractio` against the owner, and takes it down when the player is more than 60 m away or the wall is
gone. The cell's exit puts the player before that door. A game saved inside a cell loads inside it and the door is hung (the street primed)
so the way out exists. A hatch is the same for ground with no wall. No wall found means no door (the cell is still there for the console).

**The Basilica Paulli.** `shops.ts`: the Basilica Aemilia's tabernae are real walk-in shops, so there is no cell; `ctn-arca-aemiliae`
is set at the iron-banded box the builder draws in the money-changer's shop nearest `tabernae-aemiliae` (`<place>:interior` is that
box's floor point).

**What stays as it was.** The quests keep to the street: the vendors, Chrysippus, Gratus and Mus stand at the places' street spots,
`castor-loculi` as a place is still the stretch of paving at the door, and Mus' strongbox and the satchel stay in the street (mq-02).
The people of the world stay at street level, so nobody is inside a cell to see: picking a chest in a cell is a crime nobody witnesses.

## Conventions

- **Frames are local.** Build in the cell's own metres, with the origin where the object's origin is meant to be. Nothing in a cell is placed in world coordinates.
- **Cells are hidden by default.** A cell that lives under or over the world sets `hiddenOutside` and is shown only while the player is inside.
- **Move the player only through the service.** Use `enter`, `leave` or a door. Never call `player.teleport()` into a cell from elsewhere, so the fade and the state changes always run.
- **Colliders go through `Physics`.** The service adds them with `addOrientedBox`, `addCylinder` and `addTrimesh` and removes them on `dispose`.
- **No state in the frame.** Quest and dialogue logic react to the events and to `isInside`, not to the object.
