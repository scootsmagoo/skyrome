# Audio audit (October 2026, wave 3 / A4)

Nobody can listen in a headless run, so everything here is measured. Two tools produce the numbers and can be re-run:

- `node --experimental-strip-types scripts/sfx/audit.mjs [--md out.md]`: every shipped recording (all clips of `public/audio/sfx/*`), cut and finished exactly as the game does (`samples.ts` `finishSample`, after the tone in `src/audio/sampleTone.ts`). `scripts/sfx/dsp.mjs` holds the measurement DSP.
- `node scripts/sfx/mixcheck.mjs [--only forum-day,subura-night,combat,temple,crossfade]`: boots the real game, records 30 s of the master bus (and each bus's dry feed) through `game.audio.capture()`, and reports loudness and spectra.

Columns of the clip table: **LUFS** is K-weighted (ITU-R BS.1770) loudness of the loudest 200 ms of the finished clip (400 ms for beds), mean over the variants with min..max; **gain** is the sound's `gainDb`; **eff** is LUFS + gain, the level the sound really has in the mix; **centroid** is the spectral centroid (60 Hz to 16 kHz); **HF** is the share of energy above 5 kHz (a harshness proxy); **peak** and **true pk** are after finishing (before `gainDb`); **edge** is the worst start/end discontinuity of a clip as a fraction of its peak in the strip (click risk; the engine also fades edges); **clip** counts strip samples at or above 0.999.

## What the first pass found

| finding | measured | action |
|---|---|---|
| Surfaces hiss | grass 3914 Hz centroid and 29 % of energy above 5 kHz; sand 3230 Hz / 21 %; water 3201 Hz / 23 %; marble 3037 Hz / 16 %; gravel and cobbles up to 28 % in single clips. The street stone set: 2281 Hz / 8 %. | per-surface tone in `sampleTone.ts` (high shelf and low-pass), see the table below |
| Surfaces uneven in level | walking, effective LUFS (400 ms window): stone -32.1, marble -30.4, cobbles -32.6, gravel -34.0, water -33.4, sand -36.2, dirt -36.4, wood -37.0, grass -40.9: grass 9 dB under the street | `SURFACE_GAIN` re-derived, all within 1.5 dB of the street set |
| Wading never played | the terrain has no water layer, so the `water` footstep set was never chosen anywhere in the game | `isWading()` in `src/game/audio.ts`: shallow river bed (0.04-1.1 m deep) now plays `step.water.*` |
| Harsh metal and treble-only foley | `clash.metal` 8040 Hz centroid and 87 % above 5 kHz (the ring of a bell, with +1.4 dB true peak); `coin.clink` 7173 Hz / 69 %; `lock.turn` 5805 Hz / 64 %; `lock.open` 5926 Hz / 70 %; `ui.page` 6002 Hz / 58 %; `weapon.draw` 5033 Hz / 55 %; `armor.jingle` 5258 Hz / 46 %; `item.pickup` 4315 Hz / 39 %; `ui.hover`/`ui.click` 4.6 / 3.8 kHz; swings up to 67 % in single clips | tone for the weakest ten and a handful more (below) |
| Interface sounds too quiet | effective level -40 to -51 against -29 for a footstep (`ui.hover` -51, `ui.click` -42) | `ui.*` gains raised 3 to 5 dB; `lock.click` and `armor.jingle` +3 dB |
| Music synthesis | only two `createOscillator` calls: the vibrato LFO of the recorded reeds (never audible) and the sine "syrinx" stand-in that played whenever the flute or oboe recordings were not loaded | stand-in deleted, the LFO is a looped one-cycle buffer: no oscillator is created anywhere in the music (test) |
| Clicks and clipping | edge values are at most 0.03 of the peak for every one-shot (beds are loops, not cut); one clipped sample in the strips (`clash.metal`) | already fine; the tone removes the clipped peak |

## Tone applied (`src/audio/sampleTone.ts`), measured before and after

Walking sets; centroid in Hz, HF = share above 5 kHz, eff = effective LUFS (200 ms window after the change; the 400 ms figures in the first-pass table above are not comparable).

| set | centroid before | centroid after | HF before | HF after |
|---|---|---|---|---|
| stone (street) | 2281 | 2094 | 7.7 % | 4.8 % |
| marble | 3037 | 2339 | 16.4 % | 5.4 % |
| cobbles | 2301 | 1841 | 9.5 % (max clip 27.8) | 3.1 % (max 8.1) |
| grass | 3914 | 1909 | 29.4 % | 4.6 % |
| gravel | 2632 | 1869 | 12.7 % | 3.0 % |
| sand | 3230 | 2028 | 20.6 % | 3.7 % |
| water | 3201 | 1873 | 22.7 % | 3.0 % |
| dirt, wood | 404, 270 | unchanged | 0.3 %, 0.2 % | unchanged |

Effective walking loudness after the new `SURFACE_GAIN` (K-weighted, loudest 200 ms): stone -29.3, marble -29.4, cobbles -29.5, gravel -29.6, dirt -30.3, grass -30.3, sand -30.3, water -30.2, wood -30.5 LUFS. Sneaking and landing keep their old offsets from walking.

The weakest ten sound effects (by HF share, centroid and level), all toned and re-levelled: `clash.metal` (8040 Hz / 87 % to 3976 Hz / 23 %), `coin.clink` (7173 / 69 % to 3556 / 16 %), `lock.turn` (5805 / 64 % to 3184 / 23 %), `lock.open` (5926 / 70 % to 2374 / 16 %), `ui.page` (6002 / 58 % to 2557 / 9 %), `weapon.draw` (5033 / 55 % to 2888 / 21 %), `armor.jingle` (5258 / 46 % to 2526 / 19 %), `item.pickup` (4315 / 39 % to 2536 / 16 %), `swing.slow` (2745 / 26 % to 594 / 3 %), `arrow.whoosh` (3623 / 33 % to 2031 / 9 %); plus `swing.medium`, `arrow.impact.stone`, `chest.close`, `lock.click`, `ui.hover`, `ui.click`, `gear.hobnail`, `amb.birdcall`.

Not done: replacing any recording with a new CC0 one. The download cache (`.cache/sfx/`) is not part of the repository and every weak sound was fixable with tone; the sources and URLs are in `public/audio/sfx/CREDITS.md` if a later pass wants to re-cut them with `scripts/sfx/build.mjs` (the tone then stays on top of the rebuilt clips).

## The mix at four places (30 s of the master bus, headless Chromium, default settings)

LUFS-I integrated, gated; levels are of the final output after glue, limiter and soft clipper. Bus feeds are the dry RMS of each bus before the master (music against ambience is the point).

| scenario | music state / reverb | LUFS-I | LUFS-M max | LRA | peak dBFS | true pk | centroid Hz | >5 kHz % |
|---|---|---|---|---|---|---|---|---|
| forum-day | explore-day / forum | -24.5 | -23.3 | 0.5 | -6.3 | -10.3 | 620 | 0.1 |
| subura-night | seikilos / street | -29.4 | -27.3 | 1.7 | -14.2 | -15.2 | 1475 | 0.3 |
| combat | combat / forum | -23.0 | -18.9 | 2.6 | -4.4 | -4.7 | 499 | 0.3 |
| temple | temple / temple | -28.7 | -26.7 | 1.6 | -13.0 | -13.2 | 548 | 0.2 |
| crossfade | explore-day / forum | -24.6 | -23.0 | 1.2 | -8.8 | -9.4 | 608 | 0.1 |

Bus feeds (RMS dBFS, dry, before the master):

| scenario | music | sfx | ambience | voice | ui |
|---|---|---|---|---|---|
| forum-day | -40.0 | -43.6 | -30.4 | -180.0 | -180.0 |
| subura-night | -40.5 | -58.5 | -40.5 | -73.6 | -180.0 |
| combat | -37.9 | -34.1 | -31.2 | -41.3 | -180.0 |
| temple | -41.5 | -47.5 | -35.0 | -180.0 | -180.0 |
| crossfade | -39.6 | -46.0 | -30.4 | -180.0 | -180.0 |

Octave-band share of output energy (%):

| scenario | 45-90 | 90-180 | 180-355 | 355-710 | 710-1400 | 1400-2800 | 2800-5600 | 5600-11200 | 11200-20000 |
|---|---|---|---|---|---|---|---|---|---|
| forum-day | 2.4 | 4.6 | 15.4 | 38.4 | 21.9 | 3.2 | 0.5 | 0.0 | 0.0 |
| subura-night | 1.4 | 15.8 | 32.6 | 10.0 | 3.9 | 1.7 | 24.0 | 0.3 | 0.0 |
| combat | 7.1 | 12.0 | 26.2 | 28.5 | 12.4 | 2.1 | 0.8 | 0.2 | 0.0 |
| temple | 4.3 | 8.3 | 20.7 | 20.8 | 13.4 | 2.0 | 0.8 | 0.1 | 0.0 |
| crossfade | 2.3 | 5.5 | 14.3 | 40.1 | 20.5 | 3.0 | 0.5 | 0.1 | 0.0 |

Crossfade (music bus, 250 ms RMS steps): explore to combat 12.5 dB (at 11.3 s), combat to explore 7.0 dB (at 20.3 s), largest anywhere 12.5 dB (at 11.3 s). Level by second: -43.1 -40.6 -34.7 -40.6 -42.3 -41 -38.8 -39.9 -43.8 -40.5 -43.7 -50 -39.8 -39.2 -40.4 -39.1 -40.9 -37.8 -38.7 -34.6 -35.7 -42.2 -54.4 -49.7 -43.6 -46.1 -41.3 -41.1 -41.7 -37.5

Reading it:

- **Music sits 8 to 10 dB under the ambience** in the Forum, the Subura at night and the temple (-40 against -30, -40.5 against -40.6 at night when the ambience thins, -41.5 against -35), and combat music is only 2 dB louder than explore music (-37.9 against -40.0 dBFS RMS), and 4 dB under the sfx bus in a fight (-34.1). Whole-mix loudness: Forum -24.5 LUFS, combat -23.0, temple -28.7, Subura night -29.4. Peaks stay between -4.4 and -14.2 dBFS, nothing is limited hard (LRA 0.5 to 2.6). A fight is 1.5 LU louder than the Forum, not a jump.
- **Crossfades.** The director fades the old cue out in 1.2 s into combat and the new one in within 2 s; measured on the music bus (explore at 0-10 s, combat from 10 s, explore again from 20 s) the 250 ms level never falls to silence at a switch. The largest step in the switch windows is 12.5 dB (11.3 s, when the combat cue's first phrase enters) and 7.0 dB (20.3 s) going back, the same size as a single harp note arriving in a quiet passage; nothing is cut. The deep dip at 22 to 24 s is the silence the explore cue keeps between pieces.
- **The mix was boxy.** Before the ambience-bus dip the Forum put 50 % of its output energy in the single octave 355-710 Hz (crowd and city beds) and nothing above 2.8 kHz except crickets at night (22.8 % at 2.8-5.6 kHz). A -3.5 dB dip at 480 Hz (Q 0.7) on the ambience bus brings the Forum to 38 % in that octave (and 3.2 % in 1.4-2.8 kHz against 2.3 %), at the cost of 2 dB of overall loudness (-22.6 to -24.5 LUFS). The recordings themselves have almost no energy above 5 kHz (the crowd and city beds are 24 kHz material), so the mix is dark rather than harsh. A real fix needs brighter beds (`bed.crowd`, `bed.city`): a next step.
- Footsteps are not in these captures (the player stands still); the footstep numbers come from the clip table.

## Footsteps, set chosen by place (in the game)

`game.audio.footsteps.surfaceAt(x, y, z)` read at named places with `scripts/shot.mjs` evals (terrain surface, then what the walker hears): Forum paving (Rostra) paved to **marble**; temple cellae, Pantheon, Baths of Agrippa, Saepta, Ara Pacis **marble**; Cattle Market paved to marble; Colosseum arena **sand**; its seating ring **grass**; Subura lane **dirt** off the road, **cobbles** on the basalt streets; Circus Maximus **gravel**; Campus Martius grid (78x78 cells around the Pantheon): 1778 grass, 434 marble, 209 dirt, 90 gravel, 33 cobbles, 49 water; Pons Sublicius (timber) **wood**, every masonry bridge **cobbles**; the Tiber shallows within 40 m of the centreline: 5962 of 5962 shallow cells **water** (the set never played before this change); the Column of Trajan's stair interior **stone** (`columna-summa`, the viewing gallery, marble). Walking in the live game with `audio.play` logged produced `step.marble`, `step.cobbles`, `step.grass`, `step.dirt`, `step.water` and `step.wood` calls (NPCs included).

## Every clip (final, after tone and gains)

### steps

| sound | n | dur s | LUFS (min..max) | gain | eff | centroid Hz (min..max) | HF>5k % (max) | peak | true pk | edge | clip |
|---|---|---|---|---|---|---|---|---|---|---|---|
| step.stone.walk | 10 | 0.32-0.40 | -17.3 (-24.0..-15.1) | -12.0 | -29.3 | 2094 (1677..2499) | 4.8 (8.4) | -0.4 | -0.4 | 0.002 | 0 |
| step.stone.sneak | 8 | 0.33-0.42 | -17.9 (-23.3..-15.6) | -17.0 | -34.9 | 1623 (1379..1908) | 1.1 (1.9) | -0.4 | -0.4 | 0.001 | 0 |
| land.stone | 6 | 0.47-0.48 | -16.9 (-18.1..-14.9) | -6.0 | -22.9 | 1394 (989..1718) | 1.8 (3.0) | -0.5 | -0.5 | 0.002 | 2 |
| step.marble.walk | 10 | 0.29-0.38 | -16.9 (-24.1..-15.0) | -12.5 | -29.4 | 2339 (1909..2660) | 5.4 (7.4) | -0.4 | -0.4 | 0.003 | 0 |
| step.marble.sneak | 8 | 0.31-0.40 | -17.5 (-23.4..-15.4) | -17.5 | -35.0 | 1874 (1694..2124) | 1.7 (2.4) | -0.4 | -0.3 | 0.001 | 0 |
| land.marble | 6 | 0.48-0.48 | -16.8 (-18.1..-14.5) | -6.5 | -23.3 | 1541 (1074..1827) | 2.9 (3.7) | -0.4 | -0.4 | 0.005 | 0 |
| step.cobbles.walk | 8 | 0.30-0.42 | -18.0 (-23.6..-15.2) | -11.5 | -29.5 | 1841 (1560..2084) | 3.1 (8.1) | -0.4 | -0.3 | 0.003 | 0 |
| step.cobbles.sneak | 8 | 0.30-0.44 | -18.0 (-22.9..-15.3) | -16.5 | -34.5 | 1507 (1350..1719) | 1.6 (7.2) | -0.4 | -0.4 | 0.003 | 0 |
| land.cobbles | 6 | 0.48-0.49 | -17.5 (-19.6..-15.1) | -5.5 | -23.0 | 1141 (496..1461) | 1.1 (1.4) | -1.1 | -1.1 | 0.001 | 0 |
| step.dirt.walk | 10 | 0.23-0.28 | -20.3 (-21.8..-18.5) | -10.0 | -30.3 | 404 (310..568) | 0.3 (0.5) | -0.4 | -0.4 | 0.006 | 0 |
| step.dirt.sneak | 8 | 0.23-0.30 | -20.4 (-22.3..-19.4) | -15.0 | -35.4 | 340 (283..470) | 0.0 (0.1) | -0.4 | -0.4 | 0.001 | 0 |
| land.dirt | 6 | 0.48-0.48 | -19.7 (-20.3..-18.9) | -4.0 | -23.7 | 281 (256..302) | 0.1 (0.2) | -2.2 | -2.2 | 0.000 | 0 |
| step.grass.walk | 10 | 0.42-0.51 | -23.8 (-24.5..-22.6) | -6.5 | -30.3 | 1909 (1050..2462) | 4.6 (7.3) | -0.4 | -0.4 | 0.002 | 0 |
| step.grass.sneak | 8 | 0.42-0.50 | -21.5 (-22.1..-21.0) | -11.5 | -33.0 | 1484 (714..2087) | 3.5 (6.1) | -0.4 | -0.4 | 0.005 | 0 |
| land.grass | 6 | 0.47-0.48 | -21.6 (-21.8..-21.4) | -0.5 | -22.1 | 238 (200..312) | 0.3 (0.4) | -3.3 | -3.3 | 0.014 | 0 |
| step.wood.walk | 12 | 0.13-0.36 | -22.0 (-25.5..-19.3) | -8.5 | -30.5 | 270 (101..537) | 0.2 (1.3) | -0.4 | -0.3 | 0.002 | 0 |
| step.wood.sneak | 8 | 0.09-0.38 | -21.4 (-22.1..-20.4) | -13.5 | -34.9 | 183 (94..339) | 0.0 (0.0) | -1.2 | -1.2 | 0.004 | 0 |
| land.wood | 6 | 0.48-0.48 | -21.3 (-22.5..-17.8) | -2.5 | -23.8 | 171 (95..283) | 0.0 (0.0) | -4.3 | -4.3 | 0.002 | 0 |
| step.gravel.walk | 10 | 0.29-0.55 | -18.6 (-23.8..-15.2) | -11.0 | -29.6 | 1869 (1499..2357) | 3.0 (5.5) | -0.4 | -0.2 | 0.002 | 0 |
| step.gravel.sneak | 8 | 0.31-0.60 | -19.2 (-23.4..-15.9) | -16.0 | -35.2 | 1437 (1183..1911) | 0.6 (1.4) | -0.4 | -0.3 | 0.002 | 0 |
| land.gravel | 6 | 0.48-0.49 | -19.0 (-20.2..-16.2) | -5.0 | -24.0 | 879 (752..1107) | 0.9 (1.8) | -1.6 | -1.4 | 0.018 | 0 |
| step.sand.walk | 11 | 0.31-0.48 | -18.8 (-22.2..-17.1) | -11.5 | -30.3 | 2028 (1592..2404) | 3.7 (6.0) | -0.4 | -0.3 | 0.003 | 0 |
| step.sand.sneak | 8 | 0.33-0.49 | -18.8 (-22.0..-16.4) | -16.5 | -35.3 | 1688 (1284..1917) | 0.9 (1.8) | -0.4 | -0.3 | 0.000 | 0 |
| land.sand | 6 | 0.48-0.49 | -19.7 (-20.4..-19.0) | -5.5 | -25.2 | 814 (473..1138) | 0.8 (1.5) | -4.1 | -4.0 | 0.006 | 0 |
| step.water.walk | 8 | 0.28-0.52 | -18.2 (-21.5..-16.6) | -12.0 | -30.2 | 1873 (1338..2086) | 3.0 (4.8) | -0.4 | -0.3 | 0.002 | 0 |
| step.water.sneak | 8 | 0.28-0.52 | -18.3 (-21.8..-16.9) | -17.0 | -35.3 | 1506 (1114..1730) | 0.7 (1.1) | -0.4 | -0.4 | 0.001 | 0 |
| land.water | 6 | 0.48-0.49 | -17.8 (-18.7..-17.0) | -6.0 | -23.8 | 1038 (778..1238) | 1.5 (2.3) | -2.2 | -2.1 | 0.001 | 0 |
| gear.hobnail | 6 | 0.23-0.29 | -18.9 (-19.6..-17.2) | -14.0 | -32.9 | 464 (419..537) | 0.5 (0.8) | -1.5 | -1.5 | 0.003 | 0 |
| gear.leather | 8 | 0.20-0.37 | -19.6 (-21.4..-17.7) | -16.0 | -35.6 | 499 (205..703) | 1.1 (2.8) | -0.5 | -0.5 | 0.012 | 0 |
| jump.push | 3 | 0.26-0.43 | -21.0 (-22.8..-19.9) | -10.0 | -31.0 | 336 (291..410) | 0.1 (0.1) | -0.4 | -0.4 | 0.000 | 0 |

### combat

| sound | n | dur s | LUFS (min..max) | gain | eff | centroid Hz (min..max) | HF>5k % (max) | peak | true pk | edge | clip |
|---|---|---|---|---|---|---|---|---|---|---|---|
| swing.fast | 8 | 0.09-0.13 | -20.6 (-20.8..-20.5) | - | - | 476 (270..641) | 0.1 (0.4) | -1.1 | -1.1 | 0.000 | 0 |
| swing.medium | 8 | 0.14-0.60 | -20.5 (-20.9..-19.9) | - | - | 377 (176..643) | 1.0 (4.0) | -0.7 | -0.7 | 0.000 | 0 |
| swing.slow | 7 | 0.16-0.88 | -19.7 (-20.8..-17.6) | - | - | 594 (164..1465) | 2.7 (8.5) | -2.5 | -2.5 | 0.000 | 0 |
| clash.metal | 15 | 0.33-0.95 | -17.7 (-20.2..-15.4) | -6.0 | -23.7 | 3976 (3360..4655) | 22.6 (49.3) | -0.4 | 0.2 | 0.003 | 1 |
| block.shield | 5 | 0.45-0.61 | -22.2 (-22.9..-21.8) | -4.0 | -26.2 | 173 (134..196) | 0.2 (0.2) | -2.2 | -2.2 | 0.014 | 0 |
| block.metal | 5 | 0.38-0.60 | -21.4 (-21.7..-21.1) | -6.0 | -27.4 | 578 (493..780) | 0.2 (0.4) | -0.4 | -0.1 | 0.006 | 0 |
| hit.flesh | 6 | 0.53-0.63 | -20.8 (-21.4..-20.2) | -4.0 | -24.8 | 157 (117..298) | 0.0 (0.0) | -4.0 | -4.0 | 0.002 | 0 |
| hit.punch | 5 | 0.31-0.38 | -21.0 (-21.4..-20.7) | -5.0 | -26.0 | 259 (228..288) | 0.0 (0.0) | -5.9 | -5.9 | 0.001 | 0 |
| body.fall | 5 | 0.65-0.73 | -22.2 (-23.1..-21.7) | -3.0 | -25.2 | 78 (73..85) | 0.0 (0.0) | -5.4 | -5.4 | 0.015 | 0 |
| arrow.whoosh | 6 | 0.10-0.49 | -20.1 (-22.3..-17.7) | -8.0 | -28.1 | 2031 (528..3756) | 8.8 (21.4) | -0.4 | 0.6 | 0.000 | 0 |
| arrow.impact.wood | 5 | 0.17-0.30 | -23.7 (-24.9..-22.7) | -6.0 | -29.7 | 424 (391..490) | 0.0 (0.0) | -0.4 | -0.4 | 0.005 | 0 |
| arrow.impact.flesh | 5 | 0.30-0.38 | -22.3 (-22.5..-22.1) | -6.0 | -28.3 | 160 (151..186) | 0.0 (0.0) | -5.6 | -5.6 | 0.001 | 0 |
| arrow.impact.stone | 5 | 0.13-0.36 | -23.1 (-24.3..-20.9) | -8.0 | -31.1 | 2399 (788..3792) | 6.5 (14.4) | -0.4 | -0.4 | 0.001 | 0 |
| weapon.draw | 8 | 0.30-0.46 | -17.2 (-24.9..-13.0) | -10.0 | -27.2 | 2888 (467..4850) | 20.7 (50.8) | -0.4 | -0.4 | 0.001 | 0 |
| weapon.sheathe | 5 | 0.21-0.77 | -21.6 (-22.4..-20.9) | -10.0 | -31.6 | 298 (232..378) | 0.2 (0.3) | -0.4 | -0.4 | 0.000 | 0 |

### world

| sound | n | dur s | LUFS (min..max) | gain | eff | centroid Hz (min..max) | HF>5k % (max) | peak | true pk | edge | clip |
|---|---|---|---|---|---|---|---|---|---|---|---|
| cloth.rustle | 6 | 0.31-0.52 | -18.4 (-20.2..-17.2) | -16.0 | -34.4 | 733 (474..1139) | 1.3 (4.9) | -0.4 | -0.2 | 0.001 | 0 |
| armor.jingle | 6 | 0.17-0.47 | -20.9 (-28.6..-16.9) | -13.0 | -33.9 | 2526 (625..5535) | 18.7 (60.2) | -0.4 | -0.2 | 0.002 | 0 |
| coin.clink | 5 | 0.32-0.89 | -17.9 (-20.1..-15.3) | -10.0 | -27.9 | 3556 (2802..4289) | 15.5 (24.8) | -0.4 | 0.1 | 0.001 | 0 |
| door.open | 4 | 0.70-1.39 | -16.7 (-18.0..-14.5) | -6.0 | -22.7 | 1457 (602..2063) | 5.9 (9.6) | -0.4 | -0.4 | 0.000 | 0 |
| door.close | 4 | 0.48-0.71 | -17.8 (-19.0..-16.9) | -5.0 | -22.8 | 1358 (518..2020) | 5.0 (11.2) | -4.3 | -4.3 | 0.000 | 0 |
| chest.open | 4 | 0.30-0.78 | -18.8 (-21.3..-16.9) | -7.0 | -25.8 | 1815 (1117..2260) | 4.6 (14.3) | -0.4 | -0.4 | 0.000 | 0 |
| chest.close | 4 | 0.24-0.35 | -21.3 (-22.7..-18.5) | -6.0 | -27.3 | 411 (178..521) | 3.0 (4.2) | -2.4 | -2.4 | 0.008 | 0 |
| lock.click | 6 | 0.09-0.22 | -22.8 (-27.2..-18.9) | -9.0 | -31.8 | 2103 (952..3441) | 8.4 (36.2) | -0.4 | -0.1 | 0.004 | 0 |
| lock.turn | 3 | 0.17-0.31 | -19.0 (-22.0..-16.9) | -12.0 | -31.0 | 3184 (1608..4051) | 23.0 (40.8) | -0.4 | 0.2 | 0.001 | 0 |
| lock.break | 3 | 0.21-0.29 | -19.3 (-23.5..-17.1) | -10.0 | -29.3 | 2141 (729..2997) | 0.0 (0.0) | -0.4 | -0.4 | 0.010 | 0 |
| lock.open | 2 | 0.22-0.52 | -21.0 (-21.6..-20.4) | -8.0 | -29.0 | 2374 (2235..2513) | 16.1 (16.8) | -0.4 | 0.1 | 0.001 | 0 |
| item.pickup | 3 | 0.24-0.28 | -20.2 (-22.0..-19.2) | -12.0 | -32.2 | 2536 (490..6059) | 16.2 (47.4) | -0.4 | -0.2 | 0.000 | 0 |

### ui

| sound | n | dur s | LUFS (min..max) | gain | eff | centroid Hz (min..max) | HF>5k % (max) | peak | true pk | edge | clip |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ui.hover | 3 | 0.04-0.10 | -22.2 (-25.5..-18.9) | -22.0 | -44.2 | 2201 (1668..3169) | 4.2 (7.2) | -0.4 | -0.3 | 0.005 | 0 |
| ui.click | 4 | 0.08-0.09 | -21.9 (-27.4..-17.8) | -13.0 | -34.9 | 1726 (849..2677) | 5.0 (17.4) | -0.4 | 0.1 | 0.026 | 0 |
| ui.open | 3 | 0.16-0.24 | -21.1 (-22.0..-19.8) | -12.0 | -33.1 | 1060 (966..1195) | 6.2 (10.4) | -0.4 | -0.4 | 0.000 | 0 |
| ui.close | 2 | 0.25-0.31 | -19.8 (-20.2..-19.4) | -13.0 | -32.8 | 588 (507..669) | 2.6 (3.2) | -0.9 | -0.9 | 0.001 | 0 |
| ui.error | 3 | 0.15-0.24 | -20.0 (-21.0..-18.1) | -11.0 | -31.0 | 661 (232..1213) | 2.3 (5.2) | -1.7 | -1.7 | 0.013 | 0 |
| ui.page | 3 | 0.24-0.52 | -21.9 (-25.1..-15.9) | -12.0 | -33.9 | 2557 (2142..2984) | 9.2 (13.3) | -0.4 | -0.3 | 0.000 | 0 |

### bed-arena

| sound | n | dur s | LUFS (min..max) | gain | eff | centroid Hz (min..max) | HF>5k % (max) | peak | true pk | edge | clip |
|---|---|---|---|---|---|---|---|---|---|---|---|
| bed.arena | 1 | 26.18-26.18 | -9.8 (-9.8..-9.8) | - | - | 925 (925..925) | 1.8 (1.8) | -2.1 | -2.1 | 0.158 | 0 |

### bed-crowd

| sound | n | dur s | LUFS (min..max) | gain | eff | centroid Hz (min..max) | HF>5k % (max) | peak | true pk | edge | clip |
|---|---|---|---|---|---|---|---|---|---|---|---|
| bed.crowd | 1 | 22.04-22.04 | -10.2 (-10.2..-10.2) | - | - | 648 (648..648) | 0.0 (0.0) | -2.1 | -2.1 | 0.089 | 0 |

### bed-birds

| sound | n | dur s | LUFS (min..max) | gain | eff | centroid Hz (min..max) | HF>5k % (max) | peak | true pk | edge | clip |
|---|---|---|---|---|---|---|---|---|---|---|---|
| bed.birds | 1 | 28.69-28.69 | -13.5 (-13.5..-13.5) | - | - | 4034 (4034..4034) | 20.3 (20.3) | -2.2 | -2.2 | 0.002 | 0 |
| amb.birdcall | 16 | 0.35-1.56 | -14.4 (-16.3..-12.0) | -13.0 | -27.4 | 3314 (2430..4322) | 7.2 (25.1) | -1.6 | -1.4 | 0.029 | 0 |

### bed-fountain

| sound | n | dur s | LUFS (min..max) | gain | eff | centroid Hz (min..max) | HF>5k % (max) | peak | true pk | edge | clip |
|---|---|---|---|---|---|---|---|---|---|---|---|
| bed.fountain | 1 | 5.17-5.17 | -14.8 (-14.8..-14.8) | - | - | 1297 (1297..1297) | 8.8 (8.8) | -1.4 | -1.4 | 0.093 | 0 |

### bed-river

| sound | n | dur s | LUFS (min..max) | gain | eff | centroid Hz (min..max) | HF>5k % (max) | peak | true pk | edge | clip |
|---|---|---|---|---|---|---|---|---|---|---|---|
| bed.river | 1 | 8.51-8.51 | -18.7 (-18.7..-18.7) | - | - | 663 (663..663) | 0.5 (0.5) | -1.8 | -1.8 | 0.099 | 0 |

