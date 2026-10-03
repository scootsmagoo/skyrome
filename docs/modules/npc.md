# NPC life module: crowds, schedules, navigation, barks, vignettes

Everyone in the streets of Rome who is not fighting you: the named people of the content bible on
their daily rounds, an ambient crowd of 30–75 citizens around the player by day (fewer at night,
plus lanterned vigiles and the night carts), barks with subtitles, heads that turn as you pass,
people who run from a fight (or stop to watch it), guards who step in, and small scripted street
scenes every 15–60 s.

- Code: `src/npc/**` (people, crowd, schedules, barks, vignettes, carts), `src/ai/life/**` (navigation
  and steering, pure and engine-free)
- Test bed: `?scene=crowd` (`src/scenes/crowd.ts`); in the game: `?scene=rome` (installed by default, `&npcs=0` turns it off)
- Tests: `tests/npc-*.test.ts` (schedules, budgets, districts, nav grid, street graph, steering and
  a 40–70-walker fake-world simulation for AC-22, barks, spots, the shoulder-through physics)

## Quick start

```ts
import { installNpcs } from '../npc/NpcManager';

const pop = installNpcs(game);          // game.population (a System, priority -5); idempotent
pop.near(game.player.position, 10);     // living NPCs nearby, nearest first
pop.alarm(x, z, 16, 'fight', attacker); // crowds flee or gawk, guards respond
pop.witnesses(crimePos);                // ids of NPCs who can see a point (crime)
pop.kill(npc);                          // essential ones are knocked down instead
pop.vignettes.start('scuffle');         // force a street scene (dev)
```

Options (`installNpcs(game, { ... })`): `crowd` (default on), `density` (multiplier, `?crowd=2` in
dev, `?crowd=0` off), `named`, `vignettes` (`?vignettes=0`), `carts`, `maxCrowd` (84),
`navRadius` (80 m), `atlas` (use atlas districts and landmark forecourts; off in test beds),
`district` (fixed crowd mix for test beds).

It works with or without the other modules: it reads `game.npcs` (or loads `src/npc/content/*.ts`
itself), `game.locations`, `game.dialogue`, `game.ui`, `game.audio`, `game.lights`,
`game.standing` when they exist.

## What lives where

| File | What |
| --- | --- |
| `npc/Npc.ts` | `Npc extends Actor`: humanoid avatar (from `NpcDef.appearance` or a crowd role), brain slot, `Talk` interactable, look-at, carried prop and its light, simulation tier, soft/solid body |
| `npc/NpcManager.ts` | `installNpcs`, `game.population`: spawning, the simulation bubble, steering, crowd director, named NPCs, reactions, barks, talking, unsticking |
| `npc/brain.ts` | `NpcBrain`: schedule slot → task (goto, idle in a loop, wander, chat, follow, patrol, leave); reactions (flee, gawk, respond) |
| `npc/schedules.ts` | Roman hours ↔ clock, 17 archetype templates, resolution, `scheduleFor()` for content authors |
| `npc/crowd/roles.ts` | 21 crowd roles: looks, archetype, speed, props, escorts, bark table |
| `npc/crowd/budget.ts` | How many people by hour and district (AC-10), who is out (pure) |
| `npc/crowd/districts.ts` | Districts from the atlas lowlands and regions, points of interest on landmark forecourts |
| `npc/spots.ts` | Claimable activity spots: street spots, landmark forecourts, walls (lean spots, stand-in shops) |
| `npc/barks.ts` | Bark tables (with the content bible's §8.1 lines) and the `BarkDirector` (rationing) |
| `npc/vignettes/*` | Director and 14 vignettes |
| `npc/carts.ts` | Night carts with a mule and a drover |
| `npc/props.ts` | Amphora, basket, sack, tray, lantern, scroll, altar, pot and shards, dog, mule, cart |
| `npc/talkBridge.ts` | Fallback adapter from `game.dialogue` to the UI dialogue panel |
| `npc/hooks.ts` | Soft links to `game.combat` and `game.streets` (not declared here, so no merge collisions) |
| `ai/life/navgrid.ts` | Physics-sampled walkability grid around the player, A*, smoothing, reachability flood |
| `ai/life/physicsSampler.ts` | The Rapier sampler for the grid (one ray + one capsule overlap per 1 m cell) |
| `ai/life/streets.ts` | Tolerant adapter for the city crew's street graph, A*, spots |
| `ai/life/nav.ts` | `NavService`: grid near, streets far, straight line otherwise; searches rationed per step |
| `ai/life/steering.ts` | Seek/arrive, separation, predictive avoidance (keep right), `StuckMonitor`, the stuck ladder |
| `ai/life/mover.ts` | Per-agent path following with the stuck ladder |

## Navigation (GDD §14.7b, tech.md §6)

- **Local nav grid instead of a navmesh library.** `NavGrid` samples the physics world in 1 m cells
  (16 × 16 chunks, nearest first, ~260 cells a frame, 9,000 on the first frame), 80 m around the
  player: a downward ray from 5.5 m above the terrain finds the floor (podia and steps yes, roofs
  and vaults no) and a capsule overlap between knee and head height says whether a person fits.
  Neighbouring cells connect when the step is ≤ 0.55 m. A* (8-connected, octile) plus string-pulling
  gives paths around columns, statue bases and podia, and up temple steps. Whatever the landmark
  and city crews build is navigable as soon as it has colliders; stale chunks are re-sampled in the
  background every ~30 s, and cells where someone got stuck are marked blocked. navcat was not
  needed: the grid answers in microseconds for the distances crowds walk and reads the same
  colliders the characters collide with.
- **Reachability.** An incremental flood from the player's cell labels where you can walk to;
  spawns, wander targets and snapped points only use reachable cells, so nobody appears on a roof,
  inside a closed precinct or on top of the Rostra.
- **Street graph.** `game.streets` (`{ nodes, edges, spots }`, owned by the city module) is read
  through a tolerant adapter (arrays or Maps, `{a,b}`/`{from,to}`/`[a,b]` edges, `position` or
  `x/z` nodes). Long routes go node to node; door spots are where people step out of and go home
  into; shop doors, stalls, workshops, benches, shrines and fountains become activity spots. Without
  it everything still works on the grid and the atlas forecourts.
- **Steering.** Separation (personal space), predictive avoidance with a right-hand bias, the
  player as a heavy neighbour (heavier with a drawn weapon), carts as big ones.
- **Shoulder-through.** Crowd NPCs' capsules collide with the world only, so they never block the
  player or wedge against each other; walking into someone shoves them aside (a stagger when
  sprinting, and often a bark: *"Cave! Watch where you're going!"*). Hostile and fighting NPCs are
  solid (`npc.setSolid(true)`). This needed a one-line change in `Actor.locomote` (see below).
- **No one stuck > 3 s (AC-22).** The `Mover` watches progress in 0.5 s windows and escalates:
  0.5 s side-step → 1 s re-plan → 1.75 s new goal → 2.5 s unstick (out of sight: hop to the next
  free cell on the path; in sight: stand and pick a new goal). The fake-world test runs 40 walkers
  for 60 s and 70 walkers for 30 s through doors, pillars and a dead end: max no-progress 1.55 s,
  zero unsticks, no one inside a wall.

## The simulation bubble

| Tier | Distance | What runs |
| --- | --- | --- |
| `full` | < 26 m (hysteresis ±4) | Character controller (KCC), steering, shove, full brain |
| `mid` | 26–62 m | Steering + kinematic gliding on the nav-grid floor (no KCC) |
| `cheap` | > 62 m | Kinematic path following only |

The KCC radius is small because a Rapier KCC call costs 0.05–0.15 ms per NPC in the browser on the
Rome colliders. Animation LOD comes from `avatar/lod.ts` (every frame within 40 m, then 30/15/8 Hz;
`avatarLod.viewer` is set to the camera if nobody did), the low mesh beyond 35 m, and NPC shadows
are turned off beyond 50 m. Ambient people despawn out of view past ~82 m (always past 115 m); people
left long unseen more than 24 m behind the camera are recycled toward where the player looks, and
new ones spawn out of sight, mostly just outside the edges of the view so they walk into it, or in
doorways. Wander targets are scored toward the visible, unoccluded area: nobody is simulated just to
be unseen.

## Crowds (GDD §14.7, AC-10)

`crowdBudget(hour, sun, density)` follows the Roman day (the curve peaks at hours 2–6, dips at the
midday rest, thins after dusk). Districts set the density: the Forum 1.25 (~75 at its peak), the
Subura 0.9, the Colosseum valley 0.85, the Velia 0.75, elsewhere by region (0.35–0.8).

| Hour (13 May) | Forum budget | Night extras |
| --- | --- | --- |
| 09:00 | 75 citizens | — |
| 14:00 | 51 | — |
| 23:00 | 15 (cap: ≤ 25 people with the vigiles) | 3 vigiles with lanterns, up to 3 carts |

Who is out comes from the district mix × the phase of the day × each role's archetype schedule
(a shopkeeper at home is never spawned), with boosts near places (Vestals by the Atrium Vestae,
priests at temples, senators near the Curia) and a cap on escorted groups. Roles: citizen (m/f),
senator with clients and a slave, client (in a toga), matron with a slave, porter slave (amphora on
the back), merchant (tray), laborer, soldier of the Urban Cohorts, vigil (lantern), priest, Vestal
with an attendant, idler, beggar, child, elder, Greek/Syrian/Egyptian, reveler (torch), drover,
torch-bearer. Appearances come from 14 seeded variants per avatar role, so spawns hit the avatar
geometry cache (≈0.1 ms instead of 2–5 ms).

Night carts follow Caesar's law: none from sunrise to the 10th hour. They take the street graph,
else an atlas road through the player's area (the Sacra Via…), else a wide clear line or grid path;
they stop for the player, and the drover swears.

## Schedules (GDD §14.7)

Templates are written in Roman hours (`{ hora: n }`, `{ vigilia: n }`) and compiled for the date
(13 May: sunrise 04:47, sunset 19:13, a hora ≈ 72 min). Archetypes: `tabernarius` (shopkeeper),
`faber` (worker), `patronus` (senator), `cliens`, `matrona`, `servus-baiulus` (porter),
`miles-urbanus` (soldier/guard), `vigil` (sleeps by day), `sacerdos` (priest), `vestalis`,
`otiosus` (idler at the gaming boards), `mendicus`, `plaustrarius` (night carter), `puer`,
`gladiator`, `grassator`, `civis`. Slots say `work`/`idle` at a place kind in an idle loop (sweep,
stand, sit, work, pray, guard, talk, sitGround, lean, sleep), `visit`, `wander`, `patrol`, `follow`
or `home` (walk to a door or out of sight and vanish).

Named NPCs use their own `NpcDef.schedule` (clock hours, location ids). Location ids resolve via
`game.locations`, then atlas landmarks (to the forecourt in front of the facade), then street spot
ids. Content authors can build a schedule from an archetype:

```ts
import { scheduleFor } from '../schedules';
schedule: scheduleFor('tabernarius', { work: 'popina-vici-tusci', home: 'insula-mariorum' }),
```

Named NPCs appear when the player is within ~100 m of where their schedule puts them (not while
`sleep`ing), walk between their places as the hours change, and go when the player is far; dead
ones stay dead (`npc:died`). `disposition: 'hostile'` ones are solid and, if `game.combat`
exists, engage the player within 12 m.

## Barks and subtitles (GDD §15.1, §4.5)

Every bark is a subtitle with the speaker's name (`ui:subtitle`). Kinds: greet (passing within
3 m; or *sordidus* / *lautus* remarks from `game.standing`), ambient chatter (an NPC near you every
7–16 s by day), vendor calls, shoved, weapon drawn near people, flee, crime, gawk, guard, and the
brush-off when there is no conversation. Tables: role lines, the content bible's district, class,
night and Lemuria lines (docs/CONTENT.md §8.1), and `NpcDef.barks` first for named NPCs. Rationing:
one bark every 8 s, each speaker every 28 s, no line repeated within the last 14; screams and guards
cut in after 0.8 s.

## Talking

Each NPC has a `Talk` interactable (label: name, detail: title; disabled while dead, hostile,
fighting or in a vignette). E stops them, turns them to you (talk loop, head on you) and calls
`game.dialogue.start(npcId, { name, dialogueId: def.dialogue })` — the NPC's own dialogue or the
`'*'` fallbacks. If nobody opens the UI panel for it within a frame, `talkBridge.ts` opens
`game.ui.openDialogue()` itself. No dialogue at all: a brush-off line as a subtitle. The NPC goes
back to life on `dialogue:ended` or when you walk 6 m away. `dialogue:attack` turns them hostile.

## Reactions

Five times a second: actors near the player that `game.combat.isInCombat()` says are fighting
alarm everyone within 16 m. Guards (soldiers, vigiles, `cohortes-urbanae`/`vigiles` faction NPCs)
run in, bark *"Halt! In the name of the Prefect!"* and call `game.combat.engage(guard, foe)` for the
fighter who isn't the player; the fragile (children, matrons, Vestals, priests, senators) flee;
others flee 25–40 m or, if curious, gawk from 8–13 m cheering. `crime:committed` (witnessed) and the
`npc:alarm` event do the same. A drawn weapon makes people step wide around you and complain.
The module never fights.

## Vignettes (GDD §12.3; docs/CONTENT.md §8.3.1)

Every 15–30 s by day (30–60 s at night), at most two at once, each on its own cooldown, near the
player and mostly in view. Performers are taken from the crowd (or spawned out of sight) and given
back when the scene ends; props and lights are cleaned up.

| Id | Scene | When |
| --- | --- | --- |
| `scuffle` | Two men trade Juvenal-grade insults, shove and punch; onlookers cheer; a soldier breaks it up (or one goes down) | any |
| `dog` | A dog steals a sausage from a seller and runs off; he gives chase (`vig-canis-botulus`) | day |
| `pot` | A pot thrown from a first-floor window shatters beside you (Juvenal 3.268–77; `vig-matella`) | any, by a wall |
| `thief` | *Fur!* A thief runs off through the crowd, the victim shouts, a soldier gives chase | day |
| `hawker` | A tray-seller calls his wares; a few people buy | day |
| `sacrifice` | Priest, altar fire, *favete linguis*, the victimarius, onlookers praying (`vig-sacrificium`) | day |
| `procession` | A senator with his clients crosses the square: *"Way for Gaius Calpurnius!"* | day |
| `crier` | The praeco (Cerdo, if he is about) announces games, lost property, the grain ships (`vig-praeco`) | day |
| `dice` | Idlers dice on the steps; *Venus!*; they scatter when Dento or a soldier walks by (`vig-aleatores`) | day |
| `drunk` | A reveler with a torch staggers about; the Juvenal bully line if you're near | night |
| `cena-return` | A rich man walks home from dinner between torch-bearing slaves (Juvenal 3.283–5) | night |
| `vigiles` | A vigil with a lantern: *"Water in the flats! Lamps out!"* (`vig-vigiles-lucerna`) | night |
| `fabae` | The Lemuria: a paterfamilias throws black beans for the dead (Ovid, *Fasti* 5) | Lemuria night |
| `umbra` | The ghost-glimpse: a figure in a brown paenula at the edge of vision, gone when looked at (`vig-lemuria-umbra`) | Lemuria night |

Night carts (`vig-plaustrum`) run as their own system. New vignettes: add a `VignetteDef` (plan +
generator script; see `vignettes/kit.ts`) to `vignettes/index.ts`.

## Events

Emitted: `npc:spawned`, `npc:despawned`, `npc:talk`, `npc:died`, `ui:subtitle`, `sfx`.
Listened to: `npc:alarm {x, z, radius?, kind?, aggressorId?}` (anyone may emit it),
`dialogue:ended`, `dialogue:attack`, `crime:committed`, `ui:modal`.

## Contracts with other crews

- **Combat** (`game.combat`, theirs): `engage(a, b)` and `isInCombat(a)`. Fighters are left to
  combat (the brain stops) and made solid. `game.population.kill(npc)` for deaths.
- **City** (`game.streets`, theirs): see the adapter above.
- **Content**: `src/npc/content/*.ts` default-exporting `NpcDef[]`; `NpcDef.barks`, `schedule`,
  `dialogue`, `essential`, `disposition`. Cerdo (`npc-cerdo`) and Dento (`npc-dento`) are used by
  the crier and dice scenes when present.

## Dev scene (`?scene=crowd`)

A walled plaza (temple on a podium with steps, a portico with steps, shops, a fountain, statue
bases, a street out), a fake street graph with spots, two named NPCs on schedules (Felix the baker,
Philo the aedituus), the RPG/dialogue engine, the UI and audio.

`&hour=<h>` · `&crowd=<mult|0>` · `&streets=0` · `&vignette=<id>` · `&vignettes=0` · `&audio=0` ·
`&rpg=0`. `window.__crowd`: `{ pop, start(id, x?, z?), teleport(x, z), stats() }`.

## Measured (M4 Max, Chrome via `scripts/shot.mjs`, 1280×720)

| Where | People | fps | CPU ms/frame (all systems) | NPC fixed step | Draw calls | Triangles |
| --- | --- | --- | --- | --- | --- | --- |
| Crowd scene, 09:30 | 60 + 2 named | 60 | 3.6–5.7 | 0.9–3.0 ms | 250–290 | 0.32–0.39 M |
| Rome, Rostra, 09:00 | 76 (47 in view, 33 unoccluded) | 60 | 5.5–5.7 | 1.2 ms | 651 | 2.2 M |
| Rome, Rostra, 14:00 | 52 (36 in view, 28 unoccluded) | 60 | 4.1 | 0.9 ms | 591 | 2.1 M |
| Rome, Rostra, 23:00 | 18 + 3 vigiles + carts | 60 | 2.3–2.5 | 0.2 ms | 556–587 | 1.9 M |

(Rome without NPCs: 487 draw calls, 1.74 M triangles, 1.7–2.1 ms CPU.)

## Shared-file changes

- `src/actors/Actor.ts`: `locomote` passes the collider's own collision groups to
  `computeColliderMovement`, so a character controller respects collision filters (crowd NPCs whose
  capsule ignores the player no longer block the player). Behaviour for every existing collider is
  unchanged (they all keep the default filters).
- `src/scenes/rome.ts`: `installNpcs(game)` after the sky (`&npcs=0` to skip).

## Not done yet / next steps

- Litters with bearers (`vig-lectica`), the building-site crane (`vig-ruina`), velarium sailors and
  the Ludus drills are not built; the content bible lists them.
- Off-screen named NPCs don't "jump along the street graph": they are simply absent when the
  player is far and reappear at their schedule location.
- No interiors: going home means vanishing in a doorway.
- Carts have a box collider and stop for the player but not for NPCs (people steer around them).
- Bark audio is subtitles only (the audio module's voices are wordless).
