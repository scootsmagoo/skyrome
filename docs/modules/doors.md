# Doors (`src/world/doors/`)

Doors that open, close, lock and break. The service is `game.doors` (`DoorSystem.ts`), installed in
`src/game/boot.ts` before the world is built, so the city can hand over the doors of the first blocks
it details.

- Code: `DoorSystem.ts` (the service), `rules.ts` (pure lock and bash rules), `city.ts` (the city's lock policy), `install.ts`
- Tests: `tests/doors.test.ts`
- Related: `src/game/lockpick/` (the lockpicking minigame, `game.lockpick`), `src/world/interiors/generic.ts` (the rooms behind city doors)

## A door

A `DoorDef` is a doorway frame in the world: `matrix` has its origin at the middle of the threshold, in
the plane of the leaves, with x along the wall, y up and +z into the building (the leaves swing that
way). It has a `width`, a `height`, one or two `leaves`, a `style` (`studded` or `plank`), an optional
`lock`, an optional `owner` and an optional `leadsTo`.

- **Drawing.** The leaves are instances of two shared `InstancedMesh`es: planks (`wood_dark`) and bronze studs. A street of doors costs two draw calls, and a leaf only gets a new matrix while it swings.
- **Collision.** A shut door has a box collider across the doorway. It is removed as the door starts to open and put back once it has shut. A door never shuts on the player standing in it.
- **Where it goes.** Without `leadsTo` the door swings open in place: there is a room behind it in the world. With `leadsTo` (an interior cell, or a callback) it swings ajar and the player goes through in the fade, and it shuts behind them.

```ts
game.doors.add(def, group?);         // replaces a door with the same id
game.doors.attachGroup(group, defs); // a builder's doors at once (a city block's full level)
game.doors.detachGroup(group);
game.doors.open(id); game.doors.close(id); game.doors.isOpen(id);
game.doors.locked(id); game.doors.unlock(id, how?);  // 'key' | 'pick' | 'force' | 'script'
```

Events: `door:opened`, `door:closed`, `door:unlocked` (`{ id, how }`).

## Locks (`rules.ts`)

A `DoorLock` has a `tier` (`simplex`, `mediocris`, `difficilis`, `firma`: the thievery tiers), an
optional `key` item, optional `openHours` (`[6, 20]`: undone from 06:00 to 20:00, wrapping past
midnight) and `barred` (no key, pick or blow opens it from this side).

At a locked door, E does the best thing the player can:

1. With the key: it unlocks for good and opens.
2. With a `hamulus` (and the lockpicking system on): the minigame (`game.lockpick.start`). 'opened' unlocks it for good.
3. Otherwise a notice says what would open it, or when it opens for the day.

**Forcing.** A player's swing that hits no one (`combat:swing` with `hits === 0`) lands on the locked
door in front of them, within reach. A light blow does 9 damage and a power blow 26; the bolt breaks at
`DOOR_HP` (40 / 65 / 100 / 150 by tier), and a broken door no longer locks.

**Crime.** Picking or forcing a door with an `owner` books `effractio` against them when someone sees
(`population.witnesses`, 20 m), once per door.

**Saved.** Unlocked, broken and booked doors are saved under `doors`. Open or shut is not saved: doors
are shut after a load.

## The city's doors (`city.ts`)

The insula and domus builders leave a `DoorSlot` (`src/arch/fabric/types.ts`) at full detail instead
of drawing fixed leaves; `fill.ts` carries the slots into the world and the streamer hands a block's
doors to `game.doors` with its full level (`attachGroup('city:<block>')`) and takes them back when the
level goes. At mid detail the builders draw shut leaves, as before.

| Door | Lock | Owner | Behind it |
| --- | --- | --- | --- |
| An insula's stair door | `simplex`, open 05:00–21:00 | the landlord | the `insula-stair` kit: the stair and a flat |
| A house's front door | `mediocris`, `difficilis` or `firma` by wealth, open 06:00–17:00 | the household | the `domus` kit: fauces, atrium, bedrooms, tablinum |

Ids are `<block>:<lot>:<door>` (for example `b1478:lot6:stair0`), stable from one session to the next,
so the saved state finds its door again.
