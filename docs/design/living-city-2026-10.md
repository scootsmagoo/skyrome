# Living city and polish (October 2026, after the rework)

The owner's list after wave 3 (2026-10-10), in order of play:
- **Audio:** the constant crowd chatter sounds weird; replace it or rethink it.
- **Performance:** a dedicated audit of CPU, GPU and memory, with no leaks. The owner's laptop runs hot.
- **Quest markers:** a marker shows ahead; running toward it the distance grows, then it flips behind.
- **Movement:** the player slides when standing on hills; kerbs and barriers need a jump; NPCs walk into walls.
- **Navigation:** a toggleable minimap and a toggleable quest route, like GTA.
- **World building:** activities, shops, side quests and crafting, so Rome feels lived in.

## Phase 1 (now, in parallel)
- **PERF-cpu** (Opus): frame CPU and GPU, render submit (6.9 ms at the Forum: not the avatars; city batches, landmarks, shadow pass?), hitches (cityStreamer and actors spikes of 20–28 ms), idle cost (menus, pause, hidden tab), boot time, allocation churn. A budget gate script for future work.
- **PERF-mem** (Sonnet): leak hunt by cycles (teleports, interiors, save/load, menus, dialogue, fights, day/night) and a long soak; heap about 1 GB, geometry about 250 MB, textures about 930.
- **NAV** (Opus): the marker bug's root cause; a minimap; a quest route on the minimap and the map, and an optional route in the world; settings and key bindings.
- **MOVE** (Sonnet): takes over wave 3's M5a roads branch and makes the golden path pass with it; player slope sliding; step-over of kerbs and low barriers; NPC wall avoidance.
- **CHAT** (Sonnet): the crowd chatter: what it is, what to replace it with, and the replacement.
- **WORLD design** (scout, three designers, Opus synthesis; no code): `docs/design/world-life.md`, the plan for phase 2.

## Phase 2 (after review of the design)
World building by several crews, from `world-life.md`.

## Phase 3
A second performance pass over everything phase 2 adds.
