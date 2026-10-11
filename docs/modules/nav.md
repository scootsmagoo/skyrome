# Navigation: the quest route, the minimap and the markers (`src/nav/`, `src/ui/hud/minimap/`)

How the game shows the player the way: the compass and the gold chevron (the HUD), the round minimap in the bottom-left corner, the route along the streets on the minimap and the big map, and an optional trail on the ground.

- Code: `src/nav/` (the route: `streetRouter.ts`, `polyline.ts`, `plan.ts`, `QuestRoute.ts`, `RouteTrail.ts`), `src/ui/hud/minimap/` (`Minimap.ts`, `tiles.ts`, `minimapMath.ts`), `src/ui/hud/markerMath.ts` (the chevron's placement), `src/ui/map/base.ts` and `route.ts` (map layers shared by the big map and the minimap).
- Wiring: `src/game/wiring.ts` installs `game.questRoute` and the trail, and gives the map source the city plan and the route.
- Tests: `tests/ui-marker.test.ts` (the marker bug), `tests/nav-route.test.ts` (router, polyline, planner, replanning, the phase 4b ends, link checks and self-correction), `tests/city.network.test.ts` (no node without a link, centrepieces), `tests/ui-minimap.test.ts` (minimap geometry, map fabric). `npm run check:controls` has a `minimap toggle (B)` check.

## Settings and keys

Settings → Interface:

| Row | Setting | Default |
| --- | --- | --- |
| Minimap | `minimap` | on |
| Minimap turns | `minimapNorthUp` (With the view / North up) | with the view |
| Route on the maps | `routeOnMaps` (minimap and big map) | on |
| Route on the ground | `routeInWorld` | off |

B (the `minimap` action in `DEFAULT_BINDINGS`, rebindable in Controls → Actions & menus) shows or hides the minimap. The Hud reads `input.pressed('minimap')` in its update.

## The marker bug (fixed 2026-10-10)

The owner saw the quest marker ahead, ran toward it, the distance grew, and the marker flipped behind. Reproduced at `?part=ludus`: with Glaucus straight behind (compass 180°), the world chevron sat in the middle of the screen; steering onto it for 12 s took the distance from 471 to 518 m.

The cause: `QuestGuide` decided "behind the camera" from the projected depth (`v.project(cam).z > 1`). Since the reversed depth buffer (2026-10-08, `src/gfx/depth.ts`), a point behind the camera projects to z < 0, never above 1, so it was drawn mirrored through the centre of the screen: straight ahead. The compass, which works from bearings, was right all along.

The fix: `markerMath.ts` places the chevron from the camera-space position, which means the same in either depth convention. A target behind rides the left or right edge (the side to turn toward, with hysteresis when it is straight behind) and the chevron turns to point that way; an off-screen target in front slides to the edge in its direction. The compass's pinned quest marker keeps its end while the target is about straight behind (`pinnedSide`), so it no longer flips end to end with each step. `tests/ui-marker.test.ts` runs both depth conventions and a "follow the marker" loop that must close the distance. Distances are now 3D (a landing up a stair is not "1 m" away).

When the objective is in another place (inside an interior cell while you are outside, or outside while you are in one), the compass and the chevron lead to the door on the way first (the route's first leg ends at that door).

## The quest route (`game.questRoute`)

`QuestRoute` (a System, priority 905) follows the HUD's objective (`hud.objective`: the tracked quest's next required step) every 0.2 s.

- **Planning** (`plan.ts`): places are the outside world (null) and interior cells, joined by the cells' doors; a breadth-first search over doors picks the chain, and each place gets a leg ending at its door. Inside a cell a leg follows the cell's route (`game.interiors.routeWorld`). Outside:
  - within 90 m with both ends on the built nav grid (`game.population.grid`), the grid's own A* (a body-wide clear line first, `lineClear`);
  - otherwise the street graph (`game.streets`, about 8k nodes) with `StreetRouter.routeBetween`: A* on a binary heap over packed arrays that may start at any node within 45 m of the player and end at any node within 25 m of the objective (`EXIT_REACH`, phase 4b: a farther exit meant a long straight lead-out through whatever stood between), walking off the graph costing 1.35 × its length. So the route never runs back to the node nearest the player when a farther one is on the way. Once the objective's grid is built, an exit whose line to the objective the grid finds blocked costs 4 times as much to walk off from (1.5 times when the grid cannot judge it yet). Only nodes with a link, of the city's network (component 0), are entries or exits while one of them is within 220 m (`StreetRouter.ends`): a node nothing reaches, or a stray island behind a wall, never is. If the objective's street is cut off from the player's, it goes to the nearest node of the player's network;
  - **the route's own links where the grid is built** (the city's colliders stand there): a link the grid finds blocked is drawn round on the grid when the way round is at most 2.5 times its length plus 20 m (`roundLink`); with no such way it is cut for the session (`StreetRouter.cut`) and the route found again, up to 4 times (`walledLink`; a cut that leaves no route is put back);
  - the ends are trimmed with the grid: the lead-in walks straight past the first nodes where the grid says the line is clear for a body, else round what stands between on the grid; the lead-out likewise, and once the objective's grid is built the last stretch is the grid's own path (`findPath`), not a straight line.
- **When it replans**: a new objective (at once), a person objective moving more than 12 m, using a door (at once, even mid back-off), or straying more than 9 m from the route outside (3 m in a cell). At most once a second (2.5 s for a moving person). Since phase 4b it also corrects itself, outside: once when the grid round the objective is first built (`stats.gridReplans`), when a link ahead that the grid could not judge at planning time is built and blocked (checked once a second, `stats.linkReplans`), and when the player has pushed along the route for 3 s without gaining 0.75 m of it (`stats.stallReplans`); if they also barely moved (1.5 m), the street link they stand by is cut first (`stats.cuts`).
- **Heights** (`heights.ts`): a target with no height (a `point` or a place given as x, z only, or y = 0, which content writes for "on the ground") stands on the nav grid's floor there once it is built, else on the terrain (`standingY`): the quest marker resolvers (`wiring.ts`), the guide's waypoints (`guide.ts`) and the Hud's marker list (`collectMarkers`). Before, 17 targets sat at y = 0 under raised ground and the route never cleared on arrival. A `point` target (a job's post, a guide waypoint) also moves to the nearest walkable cell the player can reach within 6 m once the grid is built there (`walkableNear`): a post drawn just behind a warehouse wall is marked on the street side.
- **Where you are on it**: the closest point of the first leg, searched near the last one (a route can loop back); in a cell the feet height counts too, since every turn of a spiral stair has the same plan.
- **Back-off**: a plan with no street route (a straight line) or no way at all waits 2, 4, 8 … 30 s before the next try (failing searches are the expensive kind).
- **Cost**: a plan across the city is about 4 ms; checks between plans about 0.003 ms a frame (the link check once a second: one line test per link of the route not yet judged).
- With every route display off, it works out only the doors (straight legs, no searches), so the compass can still lead to a door.
- Data: `legs[]` (`{ cell, line: Polyline, door, nodes }`: `nodes` are the street-graph nodes a street leg walks), `along` (how far along the first leg the player is), `version` (bumped on change), `status` (`none | streets | direct | failed | arrived`), `stats`.
- The golden-path bot (`scripts/golden-bot.js`) walks `game.questRoute.legs[0]` as a player following the minimap would, and falls back to the plain nav path for a goal only after a stall on the drawn route (logged as a snag).

### The street graph the route walks (`src/world/city/network.ts`, `walks.ts`)

Built once when the city stands (stage 6 of `buildCity`), its links checked against the plan (blocks, the river, walls, solid landmarks, street furniture) and the static colliders (landmarks, bridges, quays). Phase 4b:
- **No node without a link.** A landmark door no straight link reaches is linked from its foot (`apron`: the farthest point straight out of the door, outward first, that a person walks to from the door's height). What is still alone, and every stray island of streets, is joined along a short path on the plan raster (`linkAlong`: Dijkstra on 1 m cells within 90 m to the nearest link of the network, string-pulled, every leg checked with the full probe; where Dijkstra runs out of its 12,000 expansions, which in open ground is a way round of about 60 m, an A* toward the network, bounded by the octile distance to the nearest goal cell, searches the same window). A node nothing joins is parked on the node it was linked to before a walled link was cut, or on the nearest linked node of the network within 90 m. `graph.joins` counts them.
- **Explicit walks** (`walks.ts`) through landmarks the links cannot find a way through, in the landmark's local frame (they follow it if the atlas moves it): the Forum of Trajan (gateway, square, basilica porch, nave, back door, Column court) and the others listed there.
- **Off the centrepieces.** A piazza's node stands on a ring 3.2 m from its centre, clear of its basin or shrine, its bench and its stall, on the side with a clear line to its street; nodes keep 1.5 m clear of a fountain's or a shrine's edge and a link over one bends round it; the compital altars of `content/install.ts` stand 2 m or more from every link (`clearOfLinks`).
- With no height known, the physics probe finds the floor from 2.5 m up (a raised square's paving, a low podium) instead of 0.6 m, where the ray started inside the slab and every node on it read as walled in.

### The trail on the ground (`RouteTrail.ts`)

Up to 18 flat gold chevrons every 3 m along the first leg, from 2.5 to 52 m ahead, pointing the way. They are fixed along the route (they don't slide as you walk) and fade in the shader by distance from the player (in from 2 to 5 m, out from 30 to 50 m, a slow pulse). Heights come from the nav grid's floor (`floorAt`) or the cell route. One instanced draw; the marks are placed five times a second or when the route changes. Off by default.

## The minimap (`src/ui/hud/minimap/`)

A disc in the bottom-left corner (`--mm: min(11rem, 27vh)`; the pietas bar moves over beside it and narrows on small windows so it never reaches the health bar), 80 m from centre to rim. B shows a small key hint at its corner.

- **Map**: tiles of 128 m rendered once with the big map's own layers (`drawMapBase` in `src/ui/map/base.ts`: terrain, water, the city's blocks and streets, footprints) in a darker palette (`FABRIC_MINI`), kept (16 tiles, least recently used go) and drawn turned and panned. At most one or two tiles render per redraw. Tiles overlap by a pixel so turned edges show no seams.
- **Turning**: with the view by default (the view's heading is up and the arrow points up), or north up (the arrow turns). It redraws 12 times a second, and at once on a turn sharper than 18°; between redraws the canvas is rotated with a CSS transform, so turning stays smooth.
- **On it**: the route (red, from where you stand), the objective (a gold chevron, pinned to the rim and pointing outward when farther), other open objectives (small), foes (red dots, from the combat crew's compass markers), discovered places, interior doors, tradespeople (named NPCs with services or a stall) and quest givers (people whose side quests you have not started), and a small N on the rim.
- **Inside an interior cell**: a dark plan of the cell: its walking line at your level (a stair's other turns faint), its doors, the route through it, the cell's name above the disc, scaled to the cell.
- **Cost** (Forum, `?part=castor`, A/B in one run): 0.05 ms CPU a frame standing, 0.09 ms turning all the time, 0.08 ms walking with the trail; a redraw is 0.3–0.4 ms; peaks of about 0.6 ms when a tile renders. `perf.mjs forum --dpr 2`: the `ui` system 0.34 ms with it, 0.30 without. With `game.profiling` on, `hud.minimap.stats` has `frameMs` and `peakMs`.

## The big map

`MapRenderer` now draws its static layers through `drawMapBase` (shared with the minimap). Zoomed in (from 0.42 px per metre, full from 0.75) it shows the city's own blocks, streets and squares (`MapDataSource.fabric()`, from the city plan in `src/game/mapSource.ts`: `fabricFromPlan`), and the atlas's thin street lines give way to them. The route (outside legs) is drawn when Route on the maps is on, with a "Your route" row in the legend. Paths are built once per data object and boxed, so a redraw only strokes what it can see.

## Not done yet

- The minimap has one zoom (no zooming out when sprinting or on a horse).
- Quest givers are inferred from `QuestDef.giver` of side quests not yet started; a quest whose start needs more than talking to its giver still marks the giver.
- The trail's heights come from the nav grid near the player; on a long flight of stairs far ahead it may float or sink a little until the grid there is built.
