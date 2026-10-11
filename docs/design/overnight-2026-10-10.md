# Overnight log, 10–11 October 2026

The owner went to bed with phase 3 finishing and phase 4 (solid ground) planned. Models tonight: Opus and Sonnet only (no Fable).

## Evening (before the check-ins)
- **Fable swapped out** of the phase 4a audit at the owner's request: each auditor's partial work was committed as a handover and the audit resumed on Opus/Sonnet (wf_f5af273a-c00).
- **Phase 4a audit finished**: six lenses (structures, street fit, surfaces, routes, collision, grades), 73 findings, 12 blockers. The lead's phase 4b plan is appended to `docs/design/solid-ground.md` (3b13cf3). The owner's no-clip spot was the mq-04 route running 61 m through the Basilica Ulpia (every Forum of Trajan street node was edgeless).
- **G0** (Sonnet) started: the audit tools merged into one gate (`scripts/audit/gate.mjs`, `gates.json`) with before shots.
- **Phase 3 finished** (wf_09aa96f4-81e): MOVE-finish, P3-MEM and P3-GPU passed review; P3-CLEAN's last open item (the date after `sethour`) is the calendar's deliberate story clamp (the HUD date holds on the eve of the next story anchor), left as designed. Integration in worktree `p3-int`: merged MOVE-finish, P3-CLEAN, P3-MEM, P3-GPU and char-fable (Fable's hair and cloth); resolved `buildHead` so it keeps all three fixes (the avatar's own look, the hair's start LOD, the morphed-body handover). tsc clean, vitest 2,519 passed.
- **Seen, not caused by the merge:** a tunic in the avatars lineup wears large brown "soiled" blotches (also on main). Character polish follow-up.
- **G0 done** (branch p4-g0, e6006d6): the six audit branches merged; `scripts/audit/gate.mjs --tier fast` passes on today's build in 8.7 min (46 fast metrics, 120 in all, gates = today, crew targets recorded); 72 cameras in `scripts/audit/cams.json`; 153 before shots in `docs/research/solid-ground/before/`; load guard (`scripts/audit/lock.mjs`, load ≤ 16, two browser slots). Story-place numbers today: 1,684 way cells over 38°, 21 atlas roads over 25 %, 1,934 lip cells ≥ 30 cm, 842k double-paving cells, 154 edgeless street nodes, 1 FAIL / 9 BLOCKED objective routes, terrain physics vs drawn diagonal matching 0 %.
- **Phase 3 gates on the merge, all PASS:** check:controls (all), golden path (all four chapters, 740 s), perf-budget (High): Forum CPU 7.8 ms mean / 11.9 p95 (was 10.2 / 14.4), render submit 3.5 ms (was 5.2), 911 draws, 2.52 M triangles; Colosseum 5.6 / 12.5 / 3.0 ms; spawn 8.2 / 13.8 / 3.3 ms; paused draw share 0.033, title 30 fps. Pushed to main.
- **phase4b branch** = main (phase 3, ccc5d7d) + G0, merge 751ab61 (conflicts in `release.ts` and `colos-kit.ts`: both sides kept). tsc clean, vitest 2,553 passed.
- **G1a (one ground, Opus)** started in worktree `p4-g1a`; the fast audit gate is re-measuring the phase4b base meanwhile.
