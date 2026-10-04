# NPC life module: crowds, schedules, navigation, barks, vignettes

Everyone in the streets of Rome who is not fighting you: the named people of the content bible on
their daily rounds, an ambient crowd of 30–100 citizens around the player by day who stream along
the streets and mill about the squares (fewer at night, plus lanterned vigiles and the night
carts), stations along the golden path (the vigiles' brazier and the cart stand at the Porta
Capena, stalls in the Circus valley and the Vicus Tuscus, money-changers in the Forum), barks with
subtitles, heads that turn as you pass, people who run from a fight (or stop to watch it), guards
who step in, and small scripted street scenes every 15–60 s.

- Code: `src/npc/**` (people, crowd, schedules, barks, vignettes, carts), `src/ai/life/**` (navigation
  and steering, pure and engine-free)
- Test bed: `?scene=crowd` (`src/scenes/crowd.ts`); in the game: `?scene=rome`, installed by the
  game flow (`src/game/optional.ts` finds `src/npc/install.ts`); `&npcs=0` turns it off,
  `&crowd=0|2`, `&vignettes=0`, `&stations=0`
- Tests: `tests/npc-*.test.ts` (schedules, budgets, districts, nav grid, street graph, steering and
  a 40–70-walker fake-world simulation for AC-22, barks, spots, the shoulder-through physics,
  lanes, stations and the gate crowd)
- Third-party assets or libraries: none

## Quick start

```ts
import { installNpcs } from '../npc/NpcManager';   // the game flow uses installPopulation (src/npc/install.ts)

const pop = installNpcs(game);          // game.population (a System, priority -5); idempotent
pop.positionOf('npc-cerdo');            // where a named NPC is (spawned or by schedule): quest markers
pop.near(game.player.position, 10);     // living NPCs nearby, nearest first
pop.alarm(x, z, 16, 'fight', attacker); // crowds flee or gawk, guards respond
pop.witnesses(crimePos);                // ids of NPCs who can see a point (crime)
pop.kill(npc);                          // essential ones are knocked down instead
pop.vignettes.start('scuffle');         // force a street scene (dev)
```

Options (`installNpcs(game, { ... })`): `crowd` (default on), `density` (multiplier, `?crowd=2` in
dev, `?crowd=0` off), `named`, `vignettes` (`?vignettes=0`), `carts`, `stations` (`?stations=0`),
`maxCrowd` (110), `navRadius` (80 m), `atlas` (use atlas districts, lanes, stations and landmark
forecourts; off in test beds), `district` (fixed crowd mix for test beds).

It follows the game flow: no barks or vignettes while the title, the creation screen or a loading
fade is up (`game.flow.state !== 'playing'`), and the place is filled afresh on `game:started`, on a
teleport (> 40 m in a frame) and on a time jump (> 30 game minutes: Wait, a loaded save).

It works with or without the other modules: it reads `game.npcs` (or loads `src/npc/content/*.ts`
itself), `game.locations`, `game.dialogue`, `game.ui`, `game.audio`, `game.lights`,
`game.standing` when they exist.

## What lives where

| File | What |
| --- | --- |
| `npc/Npc.ts` | `Npc extends Actor`: humanoid avatar (from `NpcDef.appearance` or a crowd role), brain slot, `Talk` interactable, look-at, carried prop and its light, simulation tier, soft/solid body |
| `npc/NpcManager.ts` | `installNpcs`, `game.population`: spawning, the simulation bubble, steering, crowd director, named NPCs, reactions, barks, talking, unsticking |
| `npc/brain.ts` | `NpcBrain`: schedule slot → task (goto, idle in a loop, wander, chat, follow, patrol, leave); reactions (flee, gawk, respond) |
| `npc/schedules.ts` | Roman hours ↔ clock, 19 archetype templates, resolution, `scheduleFor()` for content authors |
| `npc/crowd/roles.ts` | 23 crowd roles: looks, archetype, speed, props, escorts, bark table |
| `npc/crowd/budget.ts` | How many people by hour and district (AC-10), who is out (pure) |
| `npc/crowd/districts.ts` | Districts from the atlas lowlands and regions (and the Porta Capena), points of interest on landmark forecourts |
| `npc/crowd/atlasLanes.ts` | Lanes from the atlas roads plus the Porta Capena connector |
| `npc/crowd/stations.ts` | Station data (who stands where, when, with what dressing) and their geometry (pure) |
| `npc/stationDirector.ts` | Mans stations near the player: dressing (collider, fire light), members at their posts, off duty, cleared when far |
| `npc/install.ts` | `installPopulation(game)` for the game flow (`&npcs=0` to skip) |
| `npc/spots.ts` | Claimable activity spots: street spots, landmark forecourts, walls (lean spots, stand-in shops) |
| `npc/barks.ts` | Bark tables (with the content bible's §8.1 lines) and the `BarkDirector` (rationing) |
| `npc/vignettes/*` | Director and 14 vignettes |
| `npc/carts.ts` | Night carts with a mule and a drover |
| `npc/props.ts` | Amphora, basket, sack, tray, lantern, scroll, altar, pot and shards, dog, mule, cart; station dressing: brazier, food/cloth/pottery stalls, table, parked cart (merged per material, cached) |
| `npc/talkBridge.ts` | Fallback adapter from `game.dialogue` to the UI dialogue panel |
| `npc/hooks.ts` | Soft links to `game.combat` and `game.streets` (not declared here, so no merge collisions) |
| `ai/life/navgrid.ts` | Physics-sampled walkability grid around the player, A*, smoothing, reachability flood |
| `ai/life/physicsSampler.ts` | The Rapier sampler for the grid (one ray + one capsule overlap per 1 m cell) |
| `ai/life/streets.ts` | Tolerant adapter for the city crew's street graph, A*, spots |
| `ai/life/lanes.ts` | Street centrelines: closest point, keep-right offsets, sampling in a ring, the next leg along a street (junctions, dead ends) |
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
- **Lanes (until the street graph exists).** The atlas roads, converted to game metres, plus a
  connector from the Porta Capena to the head of the Circus valley, are the streets people use:
  60% of spawns (85% at night, 20% in the fora) are on a lane, heading along it; wanderers near a
  lane walk on along it 55% of the time (70% at night, 20% in the fora), 22–44 m a leg, keeping to
  the right of their direction (two streams, one each way), turning at junctions and dead ends;
  people going home walk off down the street away from the player; carts drive the clear stretch
  of the nearest lane. Wander targets near a lane score higher, and **open terrain steeper than
  0.3 is rejected** for spawns and wander targets (no crowds on the Palatine's grass), as are
  spots more than 7 m above or below the walker or unreachable from the player.
- **A\* only when it can succeed.** `NavService.findPath` skips the search when the goal is walled
  off from the start (the reachability labels): failing searches cost the most (in the Forum crowd
  path search fell from 199 ms to 13 ms per 13 s).
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
| `full` | < 26 m (hysteresis ±4), the nearest 28 who are moving | Character controller (KCC), steering, shove, full brain |
| `mid` | 26–62 m | Steering + kinematic gliding on the nav-grid floor (no KCC) |
| `cheap` | > 62 m | Kinematic path following only |

The KCC radius is small and capped (28 NPCs, people standing in an idle loop glide in place instead)
because a Rapier KCC call costs 0.05–0.15 ms per NPC in the browser on the Rome colliders. Animation LOD comes from `avatar/lod.ts` (every frame within 40 m, then 30/15/8 Hz;
`avatarLod.viewer` is set to the camera if nobody did), the low mesh beyond 35 m, and NPC shadows
are turned off beyond 50 m. Ambient people despawn out of view past ~82 m (always past 115 m). Unseen people are
recycled toward where the player looks: after 3 s when more than 12 m behind the camera, after 6 s
when more than 18 m off to the side, and walkers (not people settled at a spot or chatting) after
6 s out of view beyond 10 m once they are 14 s old; a senator and his train go together. New ones
spawn just outside the edges of the view (or behind something in it) and are sent into it, or step
out of doorways. Wander targets are scored toward the visible, unoccluded area: nobody is simulated just to
be unseen.

## Crowds (GDD §14.7, AC-10)

`crowdBudget(hour, sun, density)` follows the Roman day (the curve peaks at hours 2–6, dips at the
midday rest, thins after dusk). Districts set the density: the Forum 1.6 (~96 at its peak, packed
into a 42 m radius so 30–40 are on screen), the Subura 0.9, the Colosseum valley 0.85, the Velia
and the Velabrum 0.75, the Circus valley 0.7, the Porta Capena 0.6, elsewhere by region
(0.35–0.8). Outside the fora the crowd spreads over 56 m (50 m at night). `crowdTarget()` caps it:
at night the station people count toward the ≤ 25.

| Hour (13 May) | Forum budget | Night extras |
| --- | --- | --- |
| 09:00 | 96 citizens | — |
| 14:00 | 67 | — |
| 23:00 | 15 (cap: ≤ 25 people with the vigiles and station people) | 3 vigiles with lanterns, the vigiles' post by the Temple of Castor, up to 3 carts |

Who is out comes from the district mix × the phase of the day × each role's archetype schedule
(a shopkeeper at home is never spawned), with boosts near places (Vestals by the Atrium Vestae,
priests at temples, senators near the Curia) and a cap on escorted groups. Roles: citizen (m/f),
senator with clients and a slave, client (in a toga), matron with a slave, porter slave (amphora on
the back), merchant (tray), laborer, soldier of the Urban Cohorts, vigil (lantern), priest, Vestal
with an attendant, idler, beggar, child, elder, Greek/Syrian/Egyptian, reveler (torch), drover,
torch-bearer, farmer (in from the Campagna before dawn with a basket), traveller (with a bundle,
on the consular roads). Appearances come from 14 seeded variants per avatar role, so spawns hit the avatar
geometry cache (≈0.1 ms instead of 2–5 ms).

Night carts follow Caesar's law: none from sunrise to the 10th hour (carts still about at sunrise
leave as soon as nobody is looking). They take the street graph, else the clear stretch of a lane
through the player's area (the Via Appia, the Sacra Via…; before dawn at the Porta Capena, the road
out through the gate when the gate is passable), else a wide clear line or grid path; they stop for
the player, and the drover swears.

The **Porta Capena** (the new-game spawn) is a district of its own within 140 real m of the gate:
travellers, farmers, porters, muleteers; before dawn, only those and the night people are out.

## Stations (the golden path, GDD §17.2)

Small authored groups who are always at a place at certain phases of the day, with their dressing.
They spawn out of sight within 85 m of the station (at once after a teleport or a new game), stand
at their posts in their loops (pushed off, they walk back), walk off when the phase ends, and are
cleared beyond 115 m. They are outside the crowd budget (but count toward the night cap) and are
never recycled or borrowed by vignettes. Data in `crowd/stations.ts`: an anchor (an atlas landmark's
forecourt, a lane at a fraction of its length, or a real-metre point with a bearing), members
(role, offset `out`/`side`, loop, facing, prop, label, bark table) and dressing.

| Id | Where | When | Who |
| --- | --- | --- | --- |
| `st-capena-vigiles` | Inside the Porta Capena by the road | night, predawn | 3 vigiles: two at a brazier (fire light), one on watch with a lantern |
| `st-capena-carts` | The cart stand outside the gate (`capena-extra`) | all but night | 2 parked carts with unhitched mules and a lamp, 3 drovers (asleep, sitting, with a lantern) |
| `st-capena-farmers` | Outside the gate, north side | predawn, salutatio | 4 farmers with baskets and a produce stall |
| `st-capena-portitor` | Outside the gate, south side | day | the customs officer at his table, a trader, a porter |
| `st-capena-lecticarii` | The litter stand inside the gate | day, evening | 3 litter-bearers |
| `st-circus-popina` | Street below the Palatine, by the crossroads shrine | day, evening | cook-shop keeper, stall, 2 customers |
| `st-circus-sortilega` | The astrologers' arcade of the Circus | morning–evening | a fortune-teller and a client |
| `st-circus-figlinae` | Head of the Circus valley | day | a potter and his stall, a customer |
| `st-circus-vigiles` | Mid-valley | night, predawn | 2 vigiles at a brazier |
| `st-tuscus-vestarius` | Vicus Tuscus | day, evening | a silk-seller, cloth stall with an awning, a matron |
| `st-tuscus-velabrum` | Vicus Tuscus, Velabrum end | day | oil-seller, stall, porter, customer |
| `st-forum-argentarii` | Before the Basilica Aemilia | day | 2 money-changers at tables with customers |
| `st-forum-tabulae` | Basilica Julia steps | morning–afternoon | 3 idlers at a gaming board |
| `st-forum-vigiles` | By the Temple of Castor | night, predawn | 2 vigiles at a brazier |

Station positions keep the Via Appia, the gate passage, the cart stand on the road (mq-01's cart)
and the crossroads shrine clear (`tests/npc-stations.test.ts`).

## Schedules (GDD §14.7)

Templates are written in Roman hours (`{ hora: n }`, `{ vigilia: n }`) and compiled for the date
(13 May: sunrise 04:47, sunset 19:13, a hora ≈ 72 min). Archetypes: `rusticus` (farmer: in before
dawn, gone by the 8th hour), `viator` (traveller), `tabernarius` (shopkeeper),
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

Every 15–30 s by day (30–60 s at night; the first 6–12 s after arriving somewhere new), at most
two at once, each on its own cooldown, near the player and mostly in view. Performers are taken from the crowd (or spawned out of sight) and given
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
`dialogue:ended`, `dialogue:attack`, `crime:committed`, `ui:modal`, `game:started` (refill).

## Contracts with other crews

- **Combat** (`game.combat`, theirs): `engage(a, b)` and `isInCombat(a)`. Fighters are left to
  combat (the brain stops) and made solid. `game.population.kill(npc)` for deaths.
- **City** (`game.streets`, theirs): see the adapter above.
- **Game flow** (`src/game/`): installs the module through `src/npc/install.ts`; reads
  `game.population.positionOf(npcId)` for quest markers; `game.flow.state` silences barks and
  scenes outside play.
- **World**: lanes are the atlas roads until `game.streets` exists; when the Porta Capena gets a
  real passage, the last carts of the night drive out through it on their own.
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

"In view" is in the camera frustum; "unoccluded" also has a clear line from the camera to the head.
Forum shots look across the square from the Rostra, 15 s after turning.

| Where | People | In view / unoccluded | fps | CPU ms/frame (all systems) | NPC fixed step + update | Draw calls | Triangles |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Crowd scene, 09:30 | 65 + 2 named | 55 / 44 | 60 | 4.4 | 0.58 + 0.74 ms | 289 | 0.42 M |
| Rome, spawn (Porta Capena), 04:30 | 27 (10 at stations, 6 vigiles, 1 cart) | 22 / 11 | 60 | 2.9–3.4 | 0.32 + 0.17 ms | 234–611 | 0.4–1.3 M |
| Rome, Forum, 09:00 | 101–103 (7 at stations) | 41–42 / 30–32 | 60 | 5.3–5.8 | 1.0–1.2 + 0.06–0.16 ms | 415 | 0.93–0.96 M |
| Rome, Forum, 09:00 (WebKit) | 96 | 31 | 60 | 6.0 | 1.1 + 0.25 ms | 413 | 0.96 M |
| Rome, Forum, 14:00 | 73 | 20 / 14 | 60 | 4.3 | 1.0 + 0.03 ms | 355 | 0.77 M |
| Rome, Forum, 23:00 | 25 (5 vigiles, 11 lights, 2 carts) | 15 / 9 | 60 | 3.8 | 0.66 + 0.13 ms | 410 | 0.52 M |

AC-22 in the Forum crowd at 09:00 with the player walking through it: longest no-progress 0.52 s
over 30 s, no unsticks.

## Shared-file changes

- `src/actors/Actor.ts`: `locomote` passes the collider's own collision groups to
  `computeColliderMovement`, so a character controller respects collision filters (crowd NPCs whose
  capsule ignores the player no longer block the player). Behaviour for every existing collider is
  unchanged (they all keep the default filters).
- (`src/scenes/rome.ts` is no longer touched: the game flow installs the module.)

## Not done yet / next steps

- Litters with bearers (`vig-lectica`), the building-site crane (`vig-ruina`), velarium sailors and
  the Ludus drills are not built; the content bible lists them.
- Off-screen named NPCs don't "jump along the street graph": they are simply absent when the
  player is far and reappear at their schedule location.
- No interiors: going home means vanishing in a doorway.
- Carts have a box collider and stop for the player but not for NPCs (people steer around them).
- Bark audio is subtitles only (the audio module's voices are wordless).
- Lanes follow the atlas centrelines: where a builder puts something across a road, people path
  round it on the nav grid, but the stream is thinner there. The city crew's street graph will
  replace them.
- The Porta Capena is still a placeholder block, so the vigiles' brazier inside the gate is hidden
  from the spawn and carts can't drive through it yet.
- No crowd under the title camera (it circles the Colosseum valley while the player stands at the
  gate); the crowd fills around the player.
