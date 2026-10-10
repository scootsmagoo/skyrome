# Movement: standing, stepping, and NPCs that meet walls (MOVE crew, 2026-10)

Everything here lives in `src/actors/Actor.ts` (the kinematic capsule shared by the player and every NPC),
`src/core/traversal.ts` (the heights everyone agrees on), `src/player/Climb.ts` and, for NPCs,
`src/ai/life/*` and `src/npc/NpcManager.ts`.

## Standing on a hill

The character controller is configured to climb 50 degrees and to slide on anything over 40
(`Physics.createCharacter`), and `Actor.locomote` keeps the body pressed into the ground (`v.y = -2`).
Together they made a standing player creep, and a player who had run up a 25 to 45 degree slope and
let go slid back down at about a metre a second. A standing actor is now held still:

- no wish and a speed under 0.15 m/s, grounded: a horizontal move under 4 mm a step is dropped
  (depenetration noise);
- a move under 3 cm a step (the slide) is dropped when the floor under the feet is a slope of at most
  `SLOPE_WALK_MAX_DEG` (50 degrees, one ray, only asked of an actor that is sliding). A cliff still slides.

The first attempt, setting the controller's slide angle to 51 degrees, broke the spiral stairs and the
Vesta podium tests (their riser contacts report steep normals), so the controller's own values stay.
`tests/actor.slope.test.ts` runs the real `Actor` on ramps (10 to 45 degrees stay planted, 62 slides).

## Stepping over kerbs

`traversal.ts`: `STEP_ASSIST_MIN` 0.05 (was 0.09), `STEP_ASSIST_MAX` 0.3 (unchanged: a cavea's 0.4 m
seat rows stay a clamber, `tests/arch.stairs.test.ts`), `NAV_MAX_STEP` 0.3 (now its own constant: the
planner stays at 0.3 whatever the assist does), `CLIMB.minRise` 0.32 (was 0.42: no dead zone between the
assist and the clamber).

What was wrong: the step-up assist (`Actor.stepUp`) ran only after three steps in which the move came
out under 60 % of the push. Walking at a slant into a kerb, the controller slides the body along the
ledge's face at most of the push, so it never counted as stalled and the player ran along the kerb
instead of stepping onto it ("kerbs need a jump"). Now:

- stalled also means short along the push (under 85 %), or, for a glancing push (under 98 %), a
  wall-like contact (`wallNormal`, the controller's own collision list) opposing the push;
- the ledge is looked for along the push and, failing that, straight into the face that was touched;
- a failed look waits 8 steps (the rays cost, and a wall is not a ledge).

`tests/actor.stepover.test.ts` walks the real `Actor` into a lone ledge of 4 to 30 cm at walk (1.9),
run (4.4) and sprint (7.4 m/s), square, 30 and 60 degrees off; before: 4 of the 9 speed and angle cases left
some height unclimbed (walk at 30 degrees: 12 cm; walk at 60 degrees: everything from 8 cm; run at 60 degrees: 20 cm and up; sprint at 60 degrees: 30 cm), after: none.

`node scripts/stepwalk.mjs` is the in-game survey: it picks street-graph edges, scans lines across them
(and at 45 degrees) with rays for stretches with ledges, and walks them with the real controller (W
held, walk and run, both ways). It classifies a stalled walk by what is in front of the feet: `wall`
(all four rays hit at the same distance: the scanner's line was not clear), `embedded` (the start
is inside something) and `kerb` (low obstacle at the feet only). Only the last is a step failure.

## NPCs and walls

`node scripts/npcwalls.mjs` counts, with `NpcManager.wallCount`, the fixed steps in which a walking
full-sim NPC pushed into a static collider and barely moved, and the episodes (6 steps in a row), per
minute, with where and why (what the nav grid thought of the cell, the goal and the way to the next
corner). The finding: a few NPCs and a few places make most of them, an NPC rubbing one wall for
a whole minute because every plan led through it; half of the episodes had the next path corner walled
off from where the NPC stood.

Fixes (switched off for A/B runs with `?wallfix=0` (2, 3) and `?navlow=0` (1), `?navslope=0` (7)):

1. **Clearance starts at step height** (`physicsSampler.ts`). The cell test used a person-shaped capsule
   from 0.5 m up, so a 0.3 to 0.5 m barrier (a low wall, a trough, a stall counter, a fountain rim)
   read as open floor; it starts at `NAV_MAX_STEP + 0.05` now, and the link rays between cells (thin
   walls) at `NAV_MAX_STEP + 0.15` instead of 0.7.
2. **Learn walls from contact** (`NpcManager.learnWall`). A walking NPC that has hardly moved for a third of a
   second while the controller reports a static wall-like contact remembers the cell ahead as a wall of its own
   (`Mover.walls`, `src/ai/life/learnedWalls.ts`: up to 4, each for 30 s) and plans again; it backs off (1.5 s, 3 s,
   4.5 s, then the stuck ladder) and the count resets after 20 quiet seconds. Only that NPC's searches keep out of the
   cell (`NavGrid.avoid`, through `NavService.findPath(…, walls)`); the shared grid is not touched. Until 2026-10-10 the
   cell was marked blocked on the one shared grid (`NavGrid.block`) until its chunk was sampled again, so one NPC
   pushing into a crowd's edge, a stall or shutters in a doorway closed the doorway for everybody. Colliders that come
   and go are never learned: a station's dressing (stalls, shutters, carts, banners) carries the owner `STATION_PROP`
   (`stationDirector.ts`), and anything on a body that is not fixed counts as moving. The stuck ladder's last rung
   (`unstick`) remembers its wall the same way (it too used to block the shared grid). A station's own blocked cells
   are cleared when its dressing is taken in (`StationHost.unblock`). `tests/npc-learned-walls.test.ts`: one walker's
   wall in a doorway (a false alarm) leaves everybody else's path through it, and lapses.
3. **Re-plan when the way closes** (`Mover`). Every 0.4 s the mover checks the line to its next corner on
   the grid with `lineClear` (the test the path was made with, and the one the corner skip uses; it was `lineWalkable`
   until 2026-10-10); a wall in the way (a shove, a sidestep, a corner) re-plans, at most 3 times per goal and 1.5 s
   apart, unless the walker is still closing on that corner (0.25 m nearer than at the last look, or a new corner):
   the grid's body-wide test is stricter than the body, and a re-plan that changes nothing costs a search. In the AC-22
   crowd test over 40 seeds (40 walkers, 60 s): `lineWalkable` 5,356 searches, worst no-progress 3.62 s; plain
   `lineClear` 7,213 searches, worst 4.13 s; `lineClear` while not closing 5,911 searches, worst 3.10 s (one seed).
4. **Lines keep clear of walls** (`NavGrid.lineClear`). `lineWalkable` is the cell test along the line of centres; a
   body 0.6 m wide grazes a corner it passes. String-pulling, the straight-line shortcut in `NavService`, the
   mover's corner skipping and the bot's detours now use `lineClear` (the centre line and two lines 0.32 m to
   either side, starting and ending 0.5 m in so someone hugging a wall is not refused).
5. **Cells remember where a person fits** (`CellSample.off`). A cell whose centre is too tight but has room 0.3 m
   to one side used to count as walkable at its centre, so a path through it ran into the wall; the sampler now
   says which side, and paths pass through that point (`NavGrid.cellPoint`). The offset is stored in flag bits 5 to 7.
6. **Street nodes behind buildings** (`StreetNav.drop`, `NavService.findPath`). When the walk to a street node
   within 30 m is walled off from ground that is connected, the node is cut out of the NPCs' copy of the street graph and
   the route is made again (the city draws streets, the grid reads the colliders). The verdict comes from the flood's
   reachability labels, which are only trusted when every chunk within 24 m of both the walker and the node was finished
   before that flood started (`NavGrid.settled`): a chunk built after the flood reads as walled off though it may be
   open. A cut node comes back when the grid under it changes (`NavGrid.areaStamp`: a chunk's `seq` changes when it is
   built, dropped, or sampled again with a different result; `StreetNav.restoreCut`), not after a time, and a route
   never starts or ends on a node with no link (`StreetNav.path`). Until 2026-10-10 the cut lasted the session and could
   come from a chunk not yet built. `tests/npc-streets.drop.test.ts`.
7. **Steep terrain is no floor** (`physicsSampler.ts`, `NAV_MAX_SLOPE_DEG` 40 in `core/traversal.ts`, the controller's
   slide angle). A cell whose floor is bare terrain (within 5 cm of the heightmap) steeper than 40 degrees is not
   walkable for the planner. The grid let a rise of up to 0.85 m per cell through when the slope carries on (a flight
   of steps), and a smooth bank looks the same: the Palatine's bank above the Via Nova at about (148, 118) runs at 45 to
   60 degrees, and paths ran along and up its foot, where the body catches on ground too steep to climb. Stairs and
   ramps are colliders of their own (level treads), so only bare terrain counts. The slope comes from the heightmap 0.5 m
   either side of the cell centre (four lookups, only for terrain cells); it agrees with the heightfield's own normal in
   453 of the bank's 465 terrain cells, and a ray that returns the normal costs 2.2 µs against the floor ray's 1.4 µs.
   `tests/npc-sampler.slope.test.ts`. `?navslope=0` turns it off for A/B runs.

Measured (`scripts/npcwalls.mjs`, 60 s per zone after 12 s to fill, two runs each, fixes off with
`?wallfix=0&navlow=0` against on; the crowd is random, so single runs swing a lot):

| zone | episodes per minute, off | on | blocked share of walking steps, off | on |
|---|---|---|---|---|
| Forum | 92, 99 | 49, 13 | 3.7 %, 3.4 % | 1.6 %, 0.3 % |
| Subura (Argiletum) | 252, 56 | 10, 10 | 12.8 %, 4.3 % | 0.5 %, 0.3 % |
| Velabrum | 39, 64 | 22, 30 | 4.1 %, 6.8 % | 1.5 %, 1.3 % |

Still there: spots built against walls (an NPC arriving at a bench or a stall rubs the wall for a moment),
the puteal enclosure and statue bases in the Forum (the one NPC that kept walking into the corner at
about (38, 16) went from 45 episodes a minute to 14), and a crowd packed in a narrow street.

Stepwalk, before and after measured in the same page (`node scripts/stepwalk.mjs --n 60 --seed 3 --ab`: 60 crossings,
240 walks per variant, walk and run, both ways, each crossing walked with the step-up assist as it is and as it was,
`Actor.legacyStep`, interleaved; 2026-10-10 on the merged phase 1-2 city):

| | stalls | kerb | wall (the scanner's line ran into a rail or a wall) | embedded (started against geometry) | other |
|---|---|---|---|---|---|
| as it was | 43 | 4 | 21 | 16 | 2 |
| as it is | 41 | 2 | 23 | 16 | 0 |

The two kerb stalls left are one start (walk and run) at (319.7, 520.6) that never moves in either variant (something
0.4 m ahead of the feet at the start: a scanner miss); the ones that went are two slanted crossings of a 0.13 m lip
((-1305, -319) and (165, 448), 35 degrees off square) and two runs that slid along a lip at a slant. Steps were never the
bulk of the stalls; the oblique crossings the synthetic test found are what changed. (The earlier report's "28 before,
33 after" compared two runs on different days with no way to run the old controller; a replay on the old head gave
15. These numbers come from one page and one set of crossings.)

## The golden-path bot

`scripts/golden-bot.js` (the story bot) jammed in two ways that looked like obstacles: it followed a street node that sits
inside a wall (the Ludus gate's, 2 m from the wall) and it ping-ponged between two waypoints at a steep bank
(about (148, 118): the nav grid lets a path run along the foot of a bank where the body then catches).
It skips a waypoint the grid says is walled off, but reports it (`snag walled waypoint`, since 2026-10-10: it used to
skip quietly, which hid a street graph that leads into walls), uses `lineClear` for its detours, and has a loop
detector (the goal no nearer than 3 m from the best for 20 s counts as the same snag as a jam, 8 s without 1.5 m of
movement). `golden-path.mjs --trace` prints the position, the next waypoint and the distance to the goal every 5 s.

The three places the bot used to be helped through are fixed where they are, not in the bot (2026-10-10, MOVE-finish):

| place | what it was | fix |
|---|---|---|
| (148, 118) | the Palatine's bank above the Via Nova, 45 to 60 degrees: the grid took it for a flight of steps and paths ran along and up its foot | steep terrain is no floor for the planner (item 7 above) |
| (299, 164) | the playbill wall at the Meta Sudans (3.3 m high, 7.5 m long) stood 0.4 m into the Via Sacra's edge in the inside of its bend | moved round to 248 degrees and 14.2 m from the fountain: 2.7 m clear of both arms of the road (`colos-fountains.ts`) |
| (183, 113) | a street node in the walled court of the Porticus Margaritaria, the Clivus Palatinus's bend round Jupiter Stator, linked through the court's walls | the street graph cuts road links that run through walls (docs/modules/city.md) |

Golden path, the same afternoon, both runs side by side on the same machine (the bot's "stuck" is wall-clock, so load
counts): origin/main 12 snags, 12 teleports, among them all three places ((174, 130) heading for the node behind the
porticus, (297, 164) at the playbill wall, (147, 118) on the bank); this branch: none of the three in either run
(see the report for the full lists).

## Known gaps

- Walled road links the street graph keeps for want of a way round: the Argiletum's through the Forum of Nerva at
  (64, -25)-(84, -35) (the bot's snag at (67, -29) in every run, before and after), one in the Forum of Nerva's east end
  at (153, -75)-(172, -81), one in the Emporium and one across water at (-274, 219). The NPC planner cuts such a node
  when the walk finds it walled (`StreetNav.drop`); the city graph needs links through the buildings' real openings.
- The Clivus Palatinus's bend still runs through the Porticus Margaritaria in the plan (docs/modules/city.md: fixing it
  in `detourRoad` reshuffles every street in the city), so its pavement stops at the court's walls on both sides.
- A ledge of exactly 0.3 m (the Porticus Margaritaria's plinth edge round its court, 11.4 to 11.7 m) is at the planner's
  limit (`NAV_MAX_STEP` 0.3, heights stored as 32-bit floats: 0.3000002), so the grid reads the court as closed to the
  street outside; the body steps it (the assist takes up to 0.33 m).
- The stepwalk scanner still offers lines that run through thin rails and starts against geometry; `scripts/stepwalk.mjs`
  classifies the stalls (`kerb` is the only kind that is a step failure) but does not drop them.

## Cost

`NpcManager` at the Forum, 28 full-sim NPCs against 23, mean of ten 2 s samples after 20 s: locomote 1.25 ms against 1.35 ms (before),
steer 0.09 / 0.08, brain 0.11 / 0.08, whole step 1.46 / 1.52 ms: no measurable cost. A* searches in the first 35 s: 212 with 468 failures
against 2011 with 2235 failures before (the failing searches are the expensive kind; `lineClear` and the clearance fixes make far fewer plans fail).
