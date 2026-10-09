# M3 dead-end shots

Overhead views (42 m up, 1000x700 px shrunk to 800 px) centred on the middle of an extension.
"before" = `closeStubs: false`, "after" = default. Street index, centre (x, z), what it shows:

- a-st513 (39, 218): lane toward the Forum area, 24 m
- b-st885 (-118, -101): lane through a garden, 37 m; before it stops at the garden edge, after it is paved through to the cross street
- c-st630 (486, 189): diagonal lane near the Colosseum, 30 m
- d-st341 (334, 363): under the aqueduct arcade; the arch is hidden under the arcade deck from above
- e-st1664 (-351, -168): lane ending in a round court (lacus) beside a forum square

Reading the shots honestly: b, c and e clearly show the new lane. a (a tree now covers the spot) and d (under the arcade deck) do not show it from above; the audit test is the proof for those.

## Reconciled numbers (game plan, final settings: reach 18 m, island 36 m)

- Street-end stubs, whole plan: 792 -> 176. Core + 150 m: 167 -> 9.
- Graph degree-1 nodes in the core (excluding 12 m of the core edge, piazzas, plazas, landmark doors): 95 -> 20. Earlier reports of 24, 25 and 23 were earlier reach settings; 20 is the final count (road ends now look 120 m, others 60 m).
- The 20 are named in `graph.termini` as deliberate termini (reason `stairs` / `road` / `street`): roads that stop at a monument, a solid footprint or the Servian wall, and a stairway's foot at (-5, 264). Not bridged: plaza squares in footprints and Servian gate crossings (need roads.ts and design decisions; left for wave 2).
- planCity time (core plan, 2 runs each): closeStubs off 1020/904 ms, on 1162/785 ms: no measurable cost.
- Piazzas 533 -> 842 (courts + junction piazzas); perf.mjs forum worst 1292 draws / 4.20M tris (baseline 1295 / 4.09M), circus worst 1146 / 2.61M (baseline 1117 / 2.52M), gpu 6.9 / 5.0 ms: within noise.
