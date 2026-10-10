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

Fixes (each can be switched off for A/B with `?wallfix=0` and `?navlow=0`):

1. **Clearance starts at step height** (`physicsSampler.ts`). The cell test used a person-shaped capsule
   from 0.5 m up, so a 0.3 to 0.5 m barrier (a low wall, a trough, a stall counter, a fountain rim)
   read as open floor; it starts at `NAV_MAX_STEP + 0.05` now, and the link rays between cells (thin
   walls) at `NAV_MAX_STEP + 0.15` instead of 0.7.
2. **Learn walls from contact** (`NpcManager.learnWall`). A walking NPC that has hardly moved for a third of a
   second while the controller reports a static wall-like contact marks the cell ahead blocked in the grid and plans
   again; it backs off (1.5 s, 3 s, 4.5 s, then the stuck ladder) and the count resets after 20 quiet seconds.
3. **Re-plan when the way closes** (`Mover`). Every 0.4 s the mover checks the line to its next corner on
   the grid; a wall in the way (a shove, a sidestep, a corner) re-plans, at most 3 times per goal and 1.5 s apart.
4. **Street nodes behind buildings** (`StreetNav.drop`, `NavService.findPath`). When the walk to a street node
   within 30 m is walled off from ground that is connected, the node is cut out of the street graph and the route is made
   again (the city draws streets, the grid reads the colliders).

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

Stepwalk (240 walks, 60 street samples, seed 3, walk and run, both directions): stalls 28 before, 33
after, but nearly all of them are the scanner's, not steps: of 28 before, 11 were walls, 11 starts inside
something, 4 kerbs and 2 slanted walls; after, 16 walls, 13 embedded starts, 2 kerbs, 2 slanted. Real
kerb stalls in the streets were rare to begin with (about 2 % of walks); the oblique-approach failures
the synthetic test found are what the player met on diagonal crossings.

## Known gaps

- Street links that do not exist: the golden-path bot's "stuck" snags at (176, 127), (190, 116) and
  (299, 163) are a street node at (183, 113) behind a building; the grid's flood says it is unreachable
  (`reachable` false) and a path with any budget fails, while the street graph has an edge into it. The
  NPC planner now cuts such a node out (`StreetNav.drop`), the bot's plain "walk to the next waypoint" does not.
  The city crew should check why that edge exists (`docs/modules/city.md`, the reach test).
- The stepwalk scanner reports lines that run through thin rails and starts that are inside geometry as stalls;
  `scripts/stepwalk.mjs` classifies them but does not drop them.
