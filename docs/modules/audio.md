# Audio module

Everything you hear in Skyrome is generated in code: footsteps, swords, voices, doors, birds, crowds, and the music. There are no sound files. Each sound is a small recipe (noise, filters, struck resonances, plucked strings, a formant voice) that is "baked" into audio once, the first time it is needed, and then played back cheaply through Web Audio.

- Code: `src/audio/` (engine, director, bank, DSP, sounds, music, debug tools)
- Test bench: `src/scenes/audio.ts`, opened with `?scene=audio`
- Tests: `tests/audio-*.test.ts`
- Third-party assets: none (see `docs/credits/audio.md`)

## How to listen (for the owner)

1. Run `npm run dev` and open <http://127.0.0.1:5173/?scene=audio>. Headphones are best; laptop speakers work too, since every sound has mid-range content.
2. **Click the world or press any key.** Browsers only allow sound after a gesture. The red "enable sound" banner disappears once audio is running.
3. Walk with WASD. Shift runs, C sneaks, Space jumps, and the arrow keys turn the camera. **Tab** shows or hides the sound board on the right.
4. Take the tour, which is laid out like a small Roman quarter:
   - **Plaza and fountain.** Circle the fountain and listen for it moving around your head and getting quieter as you walk away. The paving gives stone footsteps. A legionary in hobnailed boots and mail patrols here, so his steps and jingle are spatial too.
   - **Temple (north).** Two braziers crackle on either side of the steps. Climb into the porch between the columns: the reverb turns into a long stone hall, and the music changes to slow temple music (aulos over a drone). Walk out again and the music returns to normal.
   - **Forum (west).** Under the colonnade and among the market stalls you hear the crowd murmur, nearby chatter, vendors calling, coins, and a smith hammering at the far end.
   - **Garden (east).** By day you hear sparrows and swifts, and at midday the first cicadas of May. Walk into the pool for water footsteps and onto the boardwalk for wood. A gardener walks the boardwalk.
   - **Hill (south, up the gravel ramp).** As you climb, the city noise thins and the wind picks up.
5. Keys on the bench: **F** swings (and clashes if you are next to the legionary), **Q** blocks, **E** opens or closes a door, and **R** draws or sheathes the gladius.
6. The sound board offers:
   - **Music:** buttons for each state. `explore` follows the clock (day or night). Try `combat` and then `explore` to hear the crossfades.
   - **Mixer and time:** bus volumes, the **hour slider** (try 23:00 for crickets, scops owls and night carts), the month (cicadas need summer), and HRTF for headphones.
   - **One-shots play…:** choose "4 m left", "4 m right" or "25 m ahead" to hear panning, distance and air absorption.
   - **Ambience loops:** any loop on its own.
   - **Every sound by group.** Clicking one plays it and draws its **spectrogram** (a picture of the sound: time across, pitch up).
   - **Offline verification:** runs the same checks as the automated report.

### What to tell me
Anything that sounds silly, harsh, too loud or too quiet, or repetitive. Name the sound id shown under the spectrogram (for example `vox.pain.m`) or the music state. Each recipe can be tuned quickly.

## Using it from other modules

```ts
import { installAudio } from '../audio';

const audio = installAudio(game);                // once in scene setup; adds game.audio
audio.play('clash.metal', { position: hitPoint }); // spatial one-shot
audio.play('ui.click');                            // 2D
audio.ui('open');                                  // UI bus shorthand
const fire = audio.loop('fire', { position: brazier }); // → { setVolume, setPosition, stop(fade) }
audio.music.setState('explore');                   // or 'combat', 'tavern', 'temple', 'tension', 'silence', …
audio.music.setOverride('combat', 'combat', 10);   // layered requests: highest priority wins; null clears
audio.ambience.setBase({ city: 1, birds: 0.6, swifts: 0.7, wind: 0.5 });
audio.ambience.addZone({ center, radius: 30, layers: [{ id: 'crowd', volume: 1 }], reverb: 'forum' });
audio.ambience.addZone({ center: templePorch, radius: 6, layers: [], reverb: 'temple', music: 'temple' });
audio.footsteps.attach(actor, { surfaceAt: (x, y, z) => 'stone', gear: 'armor', voice: 'm' });
audio.setEnvironment('street');                     // reverb space (zones usually set it)
```

Modules that don't want to import audio can emit an event instead: `game.events.emit('sfx', { id: 'door.open', position })`.

`play(id, opts)` options: `position`, `volume`, `rate`, `detune` (cents), `variant`, `occlude` (muffle if world geometry is in the way, using a raycast), `delay`, `velocity` (fly-bys), `bus`, `hrtf`. It returns a handle (`stop`, `setPosition`) or `null` if the sound was culled (out of range, below about −62 dB, or voice-limited).

### Wiring suggestions for the integrator
| Module | Call |
| --- | --- |
| Player setup | `audio.footsteps.attach(game.player, { surfaceAt, spatial: false, voice: 'm', gear: 'cloth' })` |
| NPCs | `audio.footsteps.attach(npc, { surfaceAt, gear: npc.isSoldier ? 'armor' : 'cloth', voice: npc.sex })` (culled beyond 40 m) |
| Terrain / world | provide `surfaceAt(x, y, z) → 'stone' \| 'dirt' \| 'grass' \| 'wood' \| 'gravel' \| 'water'` from material ids (basalt, travertine and marble are stone; cobbles and gravel are gravel) |
| Combat | `swingIdForSpeed(tipSpeed)` → `swing.*`; impacts → `clash.metal` / `block.shield` / `block.metal` / `hit.flesh` / `hit.punch`; `vox.grunt.*` on attacks, `vox.pain.*` on hits, `vox.death.*` and `body.fall` on death; combat start/end → `music.setOverride('combat', 'combat' \| null, 10)`; enemies alerted → `setOverride('tension', 'tension', 5)` |
| Quests | `stinger.questStart`, `stinger.questComplete`, `stinger.questFail` |
| RPG | `stinger.levelUp`, `stinger.skill`, `coin.clink` (barter, loot), `item.pickup` |
| UI | `ui.hover`, `ui.click`, `ui.open`, `ui.close`, `ui.page`, `ui.error` |
| World / map | `stinger.discover` on a new location; zones for fora, markets, gardens, temples, baths (`hall`), tabernae (`room`, `music: 'tavern'`), the Cloaca (`cave`) |
| Interactables | `door.open/close`, `chest.open/close`, `lock.click/turn/break/open` |
| Props | `audio.loop('fire' \| 'fountain' \| 'river' \| 'workshop' \| 'temple-music', { position })`; loops far away are virtualised automatically and cost nothing |

Settings keys added by declaration merging (optional, with defaults): `ambienceVolume` (0.8), `voiceVolume` (0.9), `uiVolume` (0.75) and `audioHrtf` (false). The existing `masterVolume`, `musicVolume` and `sfxVolume` are wired too. Slider changes apply live.

## Architecture

```
          ┌──────────── AudioEngine (System, priority 105: after the camera) ─────────────┐
 play() ─►│ voice limiter → BufferSource → gain → [low-pass: air/occlusion] → Panner ─┐    │
 loop() ─►│ LoopInstance: bed buffer(s) + Poisson events; virtualised when inaudible ─┤    │
          │ AmbienceDirector: base + zones + hour/season + altitude → loop volumes    │    │
          │ FootstepSystem: FootstepDriver per actor → play('step.*')                 │    │
          │ MusicDirector: Performer(Composer + WebAudioRack) per state, crossfades   │    │
          │                                                                           ▼    │
          │  buses: music(+music hall reverb) · sfx · ambience · voice · ui ──► master ─► +10 dB ─► limiter ─► out
          │  sends ──► environment reverb (2 crossfading convolvers: open/street/forum/room/hall/temple/cave)
          └────────────────────────────────────────────────────────────────────────────────┘
 bank.ts: SoundDefs (sounds/*.ts) → bake (dsp/*, pure JS, deterministic) in a Web Worker → AudioBuffers
```

- **Context.** It is created lazily and resumed inside the first user gesture (pointerdown, mousedown, keydown, touchend, click, pointerlockchange). A silent buffer is started at the same moment for iOS. The context is suspended while the tab is hidden and resumed when it comes back. Before unlock, `play` is a no-op, while loops and music wait and start on unlock.
- **Listener.** It follows `game.camera` every frame using `linearRampToValueAtTime`. Older Safari builds without listener AudioParams fall back to `setPosition`/`setOrientation`.
- **Spatialization.** Each voice gets an equal-power PannerNode with the Web Audio "inverse" distance model (per-sound `ref`, `max`, `rolloff`), plus a fade to zero over the last 20 % before `max`. Distant sounds pass through an air-absorption low-pass (cutoff = 18 kHz / (1 + d/25)), and far sounds send more to the reverb. HRTF is optional (`settings.audioHrtf`).
- **Voice limiting.** Each sound has its own cap (`maxVoices`, where the newest wins and the oldest of that sound is stolen), and there is a global cap of 48: when it is full, the voice with the lowest priority × estimated gain is stolen, or the new voice is dropped if it matters less.
- **Loops.** A loop is a seamless bed (mono, or two decorrelated copies panned apart for width) plus recurring events (birds, owls in bouts, calls, carts driving past). Beds are virtualised, meaning their nodes are stopped, after 1 s of inaudibility and restarted at a random offset when audible again.
- **Baking.** Pure TypeScript DSP runs in a Web Worker (`bake.worker.ts`). The whole bank of 92 sounds and 329 variants bakes in about 0.7–1.0 s in total, but only on demand. The heaviest single sound (the crowd bed) takes about 100 ms in the worker and never blocks a frame: no long tasks were measured when walking into new zones. Small one-shots fall back to a synchronous bake (1–15 ms) on first use if they are not ready, and a set of common sounds is pre-baked at unlock. After upload the PCM is dropped, so each sound is stored once, in AudioBuffers at its own sample rate (16–32 kHz).
- **Levels.** One-shots are normalized to a short-term loudness of about −14 dBFS (50 ms RMS, peak ≤ −0.4 dBFS), and beds to −16 dBFS RMS. Each definition's `gainDb` sets its place in the mix. With default settings, measured output is about −25 dBFS RMS while exploring, about −16 dBFS RMS (peaks −3) in a full fight, and about −29 at night. The limiter only works in fights (about 1.6 dB of reduction).

## Sound catalogue (92 sounds, 329 variants)

- **Footsteps** (5 variants each, ±6 % rate and ±1.5 dB at random): `step.{stone,dirt,grass,wood,gravel,water}.{walk,run,sneak}` and `land.*`. A walking step is a heel strike then a toe roll, a running step is one hard contact plus a push-off scuff, and a sneaking step is a slow, soft roll. Stone gives a leather-sole slap, dirt a packed-earth "pat", grass a swish and crinkle, wood a hollow plank, gravel a granular crunch, and water a splash with Minnaert bubble chirps.
- **Combat:** `swing.slow`, `swing.medium` and `swing.fast` (`swingIdForSpeed`); `clash.metal` (bar modes with beating pairs); `block.shield` (scutum: wood, leather and a bronze rim); `block.metal`; `hit.flesh`; `hit.punch`; `body.fall`; `bow.twang`; `arrow.whoosh`; `arrow.impact.{wood,flesh,stone}` (the wood impact has a quivering shaft); `sling.whirl`; `sling.release` (a lead glans whizzing away); `weapon.draw` and `weapon.sheathe`.
- **Voice** (formant synthesis, male and female): `vox.grunt`, `vox.pain`, `vox.effort` and `vox.death`, each with `.m`/`.f`. They are short and breathy, with pitch contours, jitter and shimmer, and a creak at the end of the death cry.
- **Foley:** `cloth.rustle`, `armor.jingle` (mail rings and plate edges), `coin.clink` (denarii into a purse), `door.open` and `door.close` (stick-slip creak through wood resonances, latch and slam), `chest.open` and `chest.close`, `lock.click`, `lock.turn`, `lock.break`, `lock.open`, `item.pickup`.
- **UI** (wood and parchment, never beeps): `ui.hover`, `ui.click`, `ui.open`, `ui.close`, `ui.error`, `ui.page`.
- **Stingers:** `stinger.questStart`, `stinger.questComplete` and `stinger.questFail` (two cornicines playing natural harmonics of a B♭ cornu over a tympanum; the complete call opens into a triad of harmonics with a cymbal); `stinger.levelUp` (a kithara arpeggio into an open-fifth chord); `stinger.discover` (a syrinx motif over the lyre); `stinger.skill`.
- **Ambience beds** (seamless loops): `bed.fire`, `bed.fountain`, `bed.river`, `bed.wind` (gusts and whistles), `bed.crowd` (18 synthetic talkers babbling at 8–45 m plus murmur), `bed.city` (distant babble and rumble), `bed.cicadas` (pulsed *Cicada orni* and swelling *Lyristes*), `bed.crickets` (field-cricket chirps and the tree-cricket trill of Mediterranean nights).
- **Ambience events:** `amb.swifts` (a screaming party flying past), `amb.sparrow`, `amb.owl` (the scops owl's "tyoo"), `amb.owl.little` (the little owl, Athena's bird), `amb.dog`, `amb.hammer` (smith or mason), `amb.calls` (vendors' shouts), `amb.chatter`, `amb.cart` (an iron-tyred cart and a mule after dark), `amb.temple` (distant aulos and tympanum).
- **Loops** (for `loop()` and ambience layers): `fire`, `fountain`, `river`, `wind`, `crowd`, `market`, `city`, `cicadas`, `crickets`, `birds`, `swifts`, `owl`, `dogs`, `workshop`, `carts`, `temple-music`.

## Ambience director

A layer's level is the maximum of its scene base level and every zone's weight × volume. That level is then multiplied by:
- **Hour of day** (`ambienceCurves.ts`). Sparrows peak at dawn and chatter all day. Swifts are present in the morning and come in great parties at dusk. Cicadas need late morning to afternoon. Crickets and owls own the night. The crowd rises at dawn, dips for the midday siesta and thins after dark. Workshops keep working hours. **Carts rumble only at night**, because the Lex Iulia Municipalis banned most wheeled traffic in daylight.
- **Month.** In May (the game starts on 13 May AD 113) the swifts have arrived, cicadas are only beginning (0.3), and crickets and scops owls are present.
- **Altitude.** City layers thin to 30 % and the wind rises from 30 % to 100 % between `altitude.low` and `altitude.high` (default game y 12 → 34; the bench uses 2 → 15).
- **Zones** fade in over `fade` metres. A zone can also set the reverb space (`reverb`) and request a music state (`music`), and the strongest such zone wins. `timeless: true` ignores the clock, for interiors.

## Generative music

- **Instruments.** The lyre and kithara are Karplus–Strong plucked strings (pluck position, brightness, fractional-delay tuning, a decay calibrated to T60, and soundbox resonances), baked once per pitch. The aulos is two slightly detuned band-limited saws through reed and bore resonances, with tonguing, legato glides, a delayed vibrato and breath noise, played as one persistent voice driven by parameter automation. The syrinx is a near-sine with a breathy band and an attack chiff. The drone is the aulos' second pipe holding the final and its fifth. The tympanum is a frame drum with membrane modes (doum, tek and ka strokes, three baked variants each), and the cymbala are small bronze cymbals (ring or choke).
- **Modes**, Pythagorean-tuned (pure fifths), are Dorian, Phrygian, Mixolydian and Hypolydian (plagal: final F, range C–C), plus the Greek **chromatic genus** for tension and combat. The names follow the later church-mode convention, because that is what they mean to listeners today; the ancient Greek "Dorian" was our E-mode.
- **Composition** (`music/composer.ts`, pure and seeded). Each piece picks a mode, a final (sometimes transposed by a fourth or fifth), a tempo, a metre (4/4, 3/4 or 6/8), instruments, and two motifs, A and B. The plan runs intro · A (antecedent, half cadence on the co-final) · A′ (consequent, full cadence on the final) · B · A″ · outro. A phrase is a motif, a varied motif (sequence, rhythmic variation or inversion), a continuation toward the high point, and a stepwise cadence. Melodies move mostly by step and fill leaps back in, phrases arch in pitch and dynamics, and long notes get grace notes and turns. The accompaniment uses only the consonances Greek theory allowed (octave, fifth, fourth), as drones, arpeggios, strums, ostinati or heterophonic doubling.
- **States:**
  - `explore-day` (Dorian, Mixolydian or Hypolydian; aulos or syrinx with lyre and soft drum; pieces of 5–8 phrases with **14–38 s of silence** between them, as in Skyrim)
  - `explore-night` (sparse syrinx and lyre, 22–55 s silences)
  - `tension` (Phrygian or chromatic, drone, low ostinato, heartbeat drum)
  - `combat` (124–138 bpm, driving maqsum-like drums with fills, urgent ornamented aulos, kithara strums, cymbal accents, modulations every few sections)
  - `tavern` (6/8 dance, aulos and syrinx call and response, dance drums and finger cymbals)
  - `temple` (drone, slow aulos, processional drum, ringing cymbals)
  - `silence`
- **Scheduler.** Lookahead on the Web Audio clock: about 0.3 s ahead, pumped every frame and on a 50 ms timer, and events more than 50 ms late are dropped rather than burst out after a hitch. Crossfades: entering combat takes about 1.2 s out and 0.6 s in, leaving combat holds 1.8 s before the explore music fades in over 4 s, and other changes use the style's own fades. Each state has a fresh seed every time, so it never repeats exactly.
- **Cost.** A performer is a handful of persistent oscillators and filters plus about 2–12 buffer notes per second. Thirty seconds of combat music renders offline in about 1.1 s (about 27× real time) in Chromium.

## Verification (no ears needed)

- `npm test` runs `tests/audio-bank.test.ts`, which bakes **every variant of every sound** in Node and checks: not silent, no NaN, no clipping, small DC, a clean end (last 5 ms below 0.01), audible length within the expected range, spectral centroid within the expected range ("grass is brighter than dirt"), and beds that loop without a seam. `audio-dsp` covers filters, mode decay, **Karplus–Strong tuning within 8 cents**, formant pitch, loop crossfades, loudness normalization and reverb impulse responses. `audio-music` covers modes and Pythagorean ratios, the composer's determinism, that every note is in its mode, that full cadences land on the final, energy per state, silences in explore and none in combat, non-repetition (distinct 4-note shapes, mostly stepwise motion), and five minutes of every state. `audio-engine` covers mix rules, voice stealing, distance, ambience curves, the director's blending, FootstepDriver cadence, landings and silence, and scheduler lookahead, crossfades, overrides and hitch-skipping.
- **In the browser**, through real Web Audio offline:
  ```
  node scripts/shot.mjs --scene audio --verbose --steps '[{"eval":"return game.audio.verify().then(r => { console.log(r.table); return r.summary; })"}]'
  ```
  This renders every variant through a spatial chain and 30 s of each music state through the real instruments and the music reverb, then prints a table (length, peak, RMS, issues, and events per instrument) plus the HRTF vs equal-power cost. Latest result in Chromium **and WebKit**: 92 sounds and 329 variants with 0 failures; music events per 30 s were 122 explore-day, 22–44 explore-night, 118 tension, 346 combat, 446 tavern and 39 temple, with no NaN and no clipping.
- **Spectrograms:** `import('/src/audio/debug/gallery.ts').then(g => g.showGallery(['clash.metal', 'bed.crowd']))` or `g.showMusic(['combat', 'tavern'])` shows a grid. The board draws one for every sound you click.
- **Measured costs** (M4 Max):
  - Panning, 32 voices × 10 s offline: equal-power 70 ms, HRTF 293 ms. That is about 0.02 % vs 0.09 % of a core per voice, so HRTF is affordable but stays opt-in because it sounds odd on speakers.
  - Worst single bake: 120 ms for the crowd bed, done in the worker.
  - AudioBuffer memory: about 17 MB after a full tour of the bench.
  - Main-thread audio work per frame: under 0.2 ms.
  - Bench scene: 60 fps, about 100 draw calls.

## Files

| File | What |
| --- | --- |
| `index.ts` | `installAudio(game)`, re-exports |
| `AudioEngine.ts` | context, buses, reverb, listener, `play`, `loop`, voice limiting, occlusion, footsteps system, meter, stats |
| `Ambience.ts`, `ambienceCurves.ts` | ambience director; hour, season and altitude curves |
| `FootstepDriver.ts` | locomotion → steps, landings, push-off, gear |
| `mix.ts` | volume curve, distance law, air absorption, voice planning |
| `bank.ts`, `bake.worker.ts`, `WorkerBaker.ts` | sound registry, baking cache, worker baking |
| `dsp/` | `core` (RNG, filters, modes, envelopes, loops), `pluck` (Karplus–Strong), `voice` (formant synth), `instruments` (brass, syrinx, aulos, drum, cymbals), `reverb` (impulse responses), `analysis` (stats, FFT, pitch, seams, spectrogram) |
| `sounds/` | recipes: `footsteps`, `combat`, `vocal`, `foley`, `ui` (and stingers), `ambience` (beds, events, loop definitions) |
| `music/` | `theory`, `styles`, `composer`, `instruments` (Web Audio), `MusicDirector` (Performer, rack, director) |
| `debug/` | `SoundBoard`, `verify`, `spectrogram`, `gallery` |

## Known limitations / next steps
- The voices are deliberately wordless effort sounds. Spoken dialogue would need a separate system (recorded or TTS lines on the `voice` bus, with ducking).
- The surface lookup is the caller's job. The terrain and world modules should map their material ids to the six surfaces; marble could later get its own brighter variant.
- Occlusion is a single raycast (on/off muffling). Portals between interiors and exteriors would be the next step.
- The bench's visuals are a test set. Its sun does not follow the clock, because the sky module owns that.
