# Solid ground (phase 4): the map, the ground and the routes

The owner played the latest build (2026-10-10) and still found:
- **Floating kerbs**, and **buildings that look like they float** (their bases do not meet the ground).
- **Inconsistent ground textures**, and ground textures that **pop in** as you move.
- The **minimap route led into a wall** during the main quest; the only way on was no-clip (`tcl`).
- **Hills too steep**: some are hard to climb; they should be lower or gentler.

The goal: everywhere a player walks is rock solid. Nothing floats, nothing is buried, nothing snags, every surface looks continuous and settled at every distance, every route the game shows can actually be walked, and the hills can be climbed on foot.

## Phase 4a: the audit (read the whole map, measure, record)

Six auditors, one lens each. Each builds a reusable audit tool (a script under `scripts/audit/` or an extension of `scripts/crawl.mjs` / `src/dev/audit/geomAudit.ts`) and runs it over the whole playable city, then confirms the worst cases with screenshots. Every finding has game coordinates, the place's name, a screenshot, a measured value, the cause in the code where it can be found, a severity and a fix idea.

1. **Structures on the ground:** city buildings, landmarks, podia, walls, gates, aqueduct piers, stairs: bases above the ground (gaps, floating) or sunk too deep, on slopes and flats.
2. **Street-level fit:** kerbs, paving edges, aprons, plazas, steps, fountains, stalls and props: floating, buried, lips, gaps, z-fighting, kerbs that do not meet the road or the pavement.
3. **Surface look and pop-in:** ground materials and their transitions (terrain vs paving vs cobbles vs dirt), seams, tiling, mismatched scales and tints, texture pop-in (KTX2 loading, streaming, LOD and material swaps, mips), shadows and AO popping on the ground.
4. **Routes:** the minimap and quest route (src/nav), the street graph, the NavGrid and the golden-path bot: walk every route the game can show (every objective of every quest from realistic start points, and street-graph edges) with a real player capsule; record every place a route runs into a wall, a drop or a gap, or needs a jump.
5. **Collision against visuals:** invisible walls, missing colliders (fall-through, sinking), colliders taller or offset from what is drawn, stairs and ramps whose collision differs from their look, seams between collider pieces that catch the player.
6. **Terrain grades:** a slope map of everywhere the player can walk; which hills, streets and paths are too steep to climb or run up; how the terrain is made (src/world/terrain, the atlas elevations and WORLD_SCALE) and how to lower or soften it safely (what moves with it: landmarks, roads, water, interiors, spawn points, checkpoints).

A lead turns the findings into the phase 4b plan: the defects ranked, grouped by cause, crews with file ownership, acceptance checks that are scripts (so they become regression tests), and the order of work.

## Phase 4b: the fixes (after phase 3 is merged)
From the plan above.
