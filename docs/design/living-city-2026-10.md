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

## Phase 3 (2026-10-10): the second performance pass and cleanup

Phases 1 and 2 are live (37912a4, README 37ed3e0). Baseline on the developer's M4 Max (`node scripts/perf-budget.mjs`, High): Forum CPU 10.2 ms mean / 14.4 p95, render submit 5.2 ms, 975 draws, 2.74 M triangles; Colosseum 6.6 / 13.2 / 4.0 ms, 982 draws; spawn 9.7 / 15.4 / 4.6 ms, 1214 draws; boot 17–19 s. Memory: JS heap about 800 MB–1 GB in the Forum, geometry about 250 MB (city batches 117–152 MB), about 1,000 textures.

- **MOVE-finish** (Opus): finish the interrupted movement review round in its own worktree (the steep bank near (148, 118), the 3 m notice wall 0.5 m from the road near (299, 164), the street node behind a building near (183, 113)); golden path, step walker and controls must pass.
- **P3-MEM** (Opus): shrink the steady memory: city batch geometry (index types, `toNonIndexed` copies, attribute packing, CPU copies released per CLAUDE.md), duplicate and oversized textures, per-appearance materials (painted skin variants, hair), anything big that is never drawn. Targets: heap under 600 MB and geometry under 170 MB in the Forum, no visible change, no leak (`scripts/leaks.mjs`), 30-minute soak.
- **P3-GPU** (Opus): a cheaper frame for a laptop that runs hot: render submit (city batches, landmark batches, the shadow pass and its LOD), GPU time per pass, overdraw (hair, foliage, transparent layers), the Medium and Low tiers actually being light (measure each tier with `perf-budget.mjs`), and the cost of phase 2's world life. Targets: Forum render submit under 4 ms on High, GPU time down at least 20 %, Medium and Low measurably cheaper than High; then tighten `scripts/perf-budget.json` to the new numbers.
- **P3-CLEAN** (Sonnet): the soak bot survives the player dying; the duplicate NPC names (side-quest Lucrio and Sabinus vs the phase-1 NPCs); the console `sethour` resetting the date to 11 May; stale docs (`docs/credits/audio.md` and `docs/modules/audio.md` say there are no sound files; `docs/STORY.md` and `CLAUDE.md` on the plain link, which now starts in the Forum); the `defineJob.ts` comment citing the wrong STORY rule; the `piper` item text naming the Horrea Piperataria (a main-quest lead); the flaky controls "talk (E)" check (name the cause and fix it); the life design's recipe table vs the code.
