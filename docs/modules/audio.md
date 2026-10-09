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
audio.music.setState('explore');                   // base music: day or night by the clock
audio.music.setOverride('combat', 'combat', 10);   // a fight; setOverride('combat', null) ends it
audio.music.setOverride('tension', 'tension', 5);  // enemies searching
audio.ambience.setBase({ city: 1, birds: 0.6, swifts: 0.7, wind: 0.5 });
audio.ambience.addZone({ center, radius: 30, layers: [{ id: 'crowd', volume: 1 }], reverb: 'forum' });
audio.ambience.addZone({ center: templePorch, radius: 6, layers: [], reverb: 'temple', music: 'temple' });
audio.footsteps.attach(actor, { surfaceAt: (x, y, z) => 'stone', gear: 'armor', voice: 'm' });
audio.setEnvironment('street');                     // reverb space (zones usually set it)
audio.prepareEnvironment('cave');                   // load a space that no zone uses, ahead of need
```

**Music requests** are layered and the highest priority wins: ambience zones (temples, tabernae) ask with priority 1, a combat override with 10, tension with 5. The base state from `setState` ranks below zones when it is `'explore'` or `'silence'` (so walking into a temple brings temple music), and at 2 for anything else, so `setState('combat')` or `setState('tavern')` is never swallowed by a zone. Fights should still use the `'combat'` override, so that ending one restores whatever was playing. Coming back to a state that is still fading out (out of a temple and straight back in) picks the performance up again instead of restarting it.

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
          │  buses: music(+hall reverb, ducked by big hits) · sfx · ambience · voice · ui ──► master
          │     ─► +7 dB ─► glue compressor (2.5:1) ─► limiter (20:1, 1 ms) ─► soft clipper ─► out
          │  sends ──► environment reverb (one convolver per space, crossfaded by gain only)
          └────────────────────────────────────────────────────────────────────────────────┘
 bank.ts: SoundDefs (sounds/*.ts) → bake (dsp/*, pure JS, deterministic) in a Web Worker → AudioBuffers
```

- **Context.** It is created lazily and resumed inside the first user gesture (pointerdown, mousedown, keydown, touchend, click, pointerlockchange). A silent buffer is started at the same moment for iOS. The context is suspended while the tab is hidden and resumed when it comes back. Before unlock, `play` is a no-op, while loops and music wait and start on unlock.
- **Listener.** It follows `game.camera` every frame using `linearRampToValueAtTime`. Older Safari builds without listener AudioParams fall back to `setPosition`/`setOrientation`. The listener is used for panning and distance only: zones and altitude are measured at the player (see the ambience director).
- **Reverb spaces.** Each space in use (open, street, forum, room, hall, temple, cave) gets its own ConvolverNode, loaded once and never reassigned. Changing space only ramps gains (1.5 s), and a faded-out space's input is disconnected so the browser stops running it. Loading a convolver costs the browser several milliseconds of main-thread time, so it is done as the impulse response arrives from the worker at start-up for every space that a zone (or `defaultReverb`) uses; another space costs that once, on first use, unless `prepareEnvironment` is called.
- **Spatialization.** Each voice gets an equal-power PannerNode with the Web Audio "inverse" distance model (per-sound `ref`, `max`, `rolloff`), plus a fade to zero over the last 20 % before `max`. Distant sounds pass through an air-absorption low-pass (cutoff = 18 kHz / (1 + d/25)), and far sounds send more to the reverb. HRTF is optional (`settings.audioHrtf`).
- **Voice limiting.** Each sound has its own cap (`maxVoices`, where the newest wins and the oldest of that sound is stolen), and there is a global cap of 48: when it is full, the voice with the lowest priority × estimated gain is stolen, or the new voice is dropped if it matters less.
- **Loops.** A loop is a seamless bed (mono, or two decorrelated copies panned apart for width) plus recurring events (birds, owls in bouts, calls, carts driving past). Beds are virtualised, meaning their nodes are stopped, after 1 s of inaudibility and restarted at a random offset when audible again.
- **Baking.** Pure TypeScript DSP runs in a Web Worker (`bake.worker.ts`): sounds, music samples and reverb impulse responses. The worker starts with the engine (no gesture needed) and pre-bakes **every one-shot** in the background, the commonest first, about 0.7–1.0 s of worker time, so the bank is ready by the time the player first clicks. Urgent requests (a loop's bed, music samples, a sound someone is about to play) jump the background queue, which feeds the worker one job at a time. Footsteps, ambience events and the `sfx` event never bake on the main thread: in the rare case a sound isn't ready (the first second after loading) it is skipped. Direct `play()` calls and critical sounds (`stinger.*`, `ui.*`) fall back to a synchronous bake. After upload the PCM is dropped, so each sound is stored once, in AudioBuffers at its own sample rate (16–32 kHz): about 21 MB for all one-shots plus the beds in use (about 24 MB on the bench). Without Worker support everything bakes on first use instead.
- **Ducking.** A loud hit or cry (estimated gain above 0.4 at the listener) dips the music bus by 4 dB for a quarter of a second, so impacts cut through without leaning on the master compressor.
- **Levels and output stage.** One-shots are normalized to a short-term loudness of about −14 dBFS (50 ms RMS, peak ≤ −0.4 dBFS), and beds to −16 dBFS RMS. Each definition's `gainDb` sets its place in the mix. The master goes through +7 dB of makeup, a glue compressor (threshold −16 dB, 2.5:1, 12 ms attack; browsers add their own automatic makeup of about 0.6 × its full-range reduction), a brick-wall limiter (−1.5 dB, 20:1, 1 ms) and a tanh soft clipper that is exactly linear below −3 dBFS and can never output more than −0.2 dBFS. Measured on the bench with default settings (Chromium / WebKit): exploring the plaza −22 dBFS RMS, peaks −6 dBFS, glue 0.8 dB; a sustained fight −18 dBFS RMS, peaks −4 dBFS, glue 1.5–1.8 dB; six point-blank impacts at once peak at −1.1 dBFS (glue 3.8 dB). Even with every slider at 100 % that burst peaks at −0.6 to −1.0 dBFS: no clipping.

## Recorded sounds (October 2026)

Most effects now come from CC0 recordings; the synthesised versions below remain as stand-ins while a recording loads, if one cannot be decoded, and for the sounds no recording fits (`vox.*`, `bow.twang`, `sling.*`, the three instrument stingers, `amb.*` events and the fire, wind, city, cicada and cricket beds).

- **Files.** `public/audio/sfx/<group>.m4a` (AAC, first choice) with an `.mp3` twin, and `manifest.json`. A group is a strip of clips separated by silence (`steps`, `combat`, `world`, `ui`, and one per bed). `public/audio/sfx/CREDITS.md` lists the sources with their licences and, for every sound, the files it is cut from.
- **Pipeline.** `scripts/sfx/spec.mjs` says what each sound is made of (source ranges, pitch, EQ, layers); `node scripts/sfx/build.mjs [--only steps]` renders it from the downloads in `.cache/sfx/` (gitignored; see the URLs in `CREDITS.md`) and rewrites the manifest; `node scripts/sfx/credits.mjs` rewrites the credits. `probe.mjs`, `sheet.mjs` and `surfaces.mjs` measure sources and built clips.
- **Runtime.** `samples.ts` (`SampleLibrary`) fetches the manifest at start-up and the four groups right after, decodes each with an `OfflineAudioContext`, cuts the clips and levels them with the same rules as a baked one-shot (so every `gainDb` still means what it says). `bank.ts` asks it first (`setSampleSource`): `requestBake` returns the recording or falls back to the worker's synthesis, and `getVariants` never stands the synthesis in for a recording that is still loading. `walk` and `run` share their footfalls (an alias), and the engine shares one AudioBuffer per array. `?samples=0` turns recordings off.
- **Surfaces.** `stone`, `marble` (bright: the travertine fora), `cobbles` (basalt roads), `dirt`, `grass`, `wood`, `gravel`, `sand`, `water`. `src/game/audio.ts` (`groundSurface`) reads the terrain's surface plus the travertine and basalt weights and installs itself as `audio.footsteps.surfaceAt`, which every walker without a lookup of its own uses (the citizens and combatants no longer step on stone everywhere). A driver looks the ground up only after moving about a meter and not at all beyond hearing distance.
- **Gear.** Armoured walkers add `gear.hobnail` on hard ground and mail jingles; others add `gear.leather` scuffs; jumps play `jump.push`.
- **Animation hook.** `FootstepDriver` sets `avatar.onFootContact` (side, gait, strength) when the avatar has none; from the first contact the speed cadence stands down, and it takes over again if contacts stop for 1.2 s.
- **Mix.** Settings has sliders for Ambience, Voices and Interface sounds as well as Master, Music and Effects. While a conversation is open (`dialogue:started`/`ended`) the ambience bus drops 7 dB, effects 4 dB and music 3 dB. Check the output with `node scripts/sfx/fight.mjs` (peak and RMS of a dense six-fighter brawl) and every sound's level and length with `node scripts/sfx/report.mjs`; `game.audio.stats()` reports the recorded count, the codec and the memory.

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
- **Zones** fade in over `fade` metres. A zone can also set the reverb space (`reverb`) and request a music state (`music`). `timeless: true` ignores the clock, for interiors.
- **Where it measures.** Zone weights and altitude are taken at `ambience.probe()`, which defaults to the player's feet (the listener when there is no player). The third-person camera swings 3–4 m around the player as you look about; that must not move you in or out of a temple.
- **Hysteresis.** The reverb space and the zone music are single choices, so each goes through a latch: a zone is taken when its weight rises above 0.6 and kept until it falls below 0.4, a new choice must hold for 1 s before it takes over, and between equally strong zones the smaller (nested) one wins. Standing on a zone's edge never flips the music or the reverb back and forth.

## Generative music

- **Instruments** (recorded; October 2026). The lyre and kithara are a **harp**, the aulos an **oboe** played softly, the syrinx a **flute** in its low register (the collection has no alto flute or recorder), the drone a **cello-section pad**, and the tympanum and cymbala a **large hand drum, muted congas and a tambourine**: all from the VSCO 2 Community Edition (CC0, `public/audio/music/CREDITS.md`), a 56-file subset cut to 51 mono samples (each as AAC and MP3; 2.5 MB on disk, 11 MB decoded at 24 kHz when all are loaded). Sustained notes loop a phase-aligned crossfaded steady part under an envelope (oboe attack 90 ms, flute 130 ms, slow releases) with a delayed vibrato; harp notes are pitch-shifted at most 2 semitones from the nearest recorded note (a recording every 3–4 semitones) and darkened by a low-pass for soft notes. The oboe and flute have a cut where their third harmonic bites (about 1.1 and 1.9 kHz) and a low-pass, and everything goes through the music bus's own tone (`MUSIC_TONE`: high-pass 90 Hz, −4 dB around 2.3 kHz, low-pass 4.4 kHz; the hall reverb's send is low-passed at 3.8 kHz). Nothing synthesised is heard unless a recording fails to load: then the old Karplus–Strong plucks, the sine syrinx and the baked drum strokes stand in (scaled to their old level) and no pad plays. The code that built them is in `tools/music/` (`fetch-vsco.py`, `build-samples.py`, `make-setpieces.py`); the generated lists are `music/vscoManifest.ts` and `music/setpieceData.ts`.
- **Modes**, Pythagorean-tuned (pure fifths), are Dorian, Phrygian, Mixolydian and Hypolydian (plagal: final F, range C–C), plus the Greek **chromatic genus** for tension and combat. The names follow the later church-mode convention, because that is what they mean to listeners today; the ancient Greek "Dorian" was our E-mode.
- **Composition** (`music/composer.ts`, pure and seeded). Each piece picks a mode, a final (sometimes transposed up or down a fourth, or up a tone, always from that finite set, so the pitches the lyre is asked for stay bounded however long the game runs), a tempo, a metre (4/4, 3/4 or 6/8), instruments, and two motifs, A and B. The plan runs intro · A (antecedent, half cadence on the co-final) · A′ (consequent, full cadence on the final) · B · A″ · outro. A phrase is a motif, a varied motif (sequence, rhythmic variation or inversion), a continuation toward the high point, and a stepwise cadence. Melodies move mostly by step and fill leaps back in, phrases arch in pitch and dynamics, and long notes get grace notes and turns. The accompaniment uses only the consonances Greek theory allowed (octave, fifth, fourth), as drones, arpeggios, strums, ostinati or heterophonic doubling.
- **States:**
  - `explore-day` (Dorian, Mixolydian or Hypolydian; oboe or flute with a sparse harp and now and then a soft hand drum; 4–6 phrases at 64–78 bpm, **35–90 s of silence** between pieces, about half the phrases left to the harp alone; no note above 0.62 velocity)
  - `explore-night` (50–120 s silences, a sparse harp with a flute now and then, velocity cap 0.5; about one piece in five is the Epitaph of Seikilos instead, followed by silence)
  - `tension` (Phrygian or chromatic, string pad, one harp string a beat, heartbeat hand drum, oboe in long rests)
  - `combat` (100–114 bpm, a steady hand drum with muted-conga and tambourine strokes, two harp chords a bar, a softer oboe; velocity cap 0.72; every few sections it modulates to another mode on a final a fourth or fifth away)
  - `tavern` (6/8 dance, oboe and flute call and response, hand-drum dance patterns and tambourine; cap 0.68)
  - `temple` (string pad, slow oboe with long rests, a drum stroke every other bar; on entering, 60 % of the time it opens with a **set piece**, and 30 % at each later section break)
  - `seikilos`, `delphic` (the set pieces on their own: tune on the harp, tune again with a flute doubling an octave up, a 40–80 s silence, and again; ask for them with `music.setOverride('lemuria', 'seikilos', 3)`, for the Lemuria night or the title)
  - `silence`
- **Scheduler.** Lookahead on the Web Audio clock: about 0.3 s ahead, pumped every frame and on a 50 ms timer, and events more than 50 ms late are dropped rather than burst out after a hitch. Crossfades: entering combat takes about 1.2 s out and 0.6 s in, leaving combat holds 1.8 s before the explore music fades in over 4 s, and other changes use the style's own fades. Each state has a fresh seed every time, so it never repeats exactly.
- **Samples.** Recordings load per group on first use (`music/vsco.ts`: harp, oboe, flute, cello, hand drum, congas, tambourine strokes; AAC first, MP3 where AAC cannot be decoded) and are kept: they decode at 24 kHz through an OfflineAudioContext of that rate, so nothing is resampled and each buffer is a third smaller than at 48 kHz (every group together is 11 MB; the music's budget is 16 MB). A performer generates each block one block ahead and asks its rack to `prepare` it, which starts any loads and reports whether every group the block needs has loaded or been given up on; a state's first block therefore waits for its groups the first time it plays (a few hundred KB each). A group that fails to load is marked failed and its instruments fall back to the synthesised voices. The old baked plucks and strokes still use `music/samples.ts` (a 16 MB LRU store), but only as that fallback; nothing is pre-baked when the music attaches any more. Offline renders must `await vsco.loadAll()` first (`debug/verify.ts` does).
- **Cost.** A performer is a handful of persistent filters plus about 1–8 buffer notes per second (a recorded note is a buffer source, a gain and, for the oboe and flute, a vibrato gain). Thirty seconds of music renders offline in about 1 s in Chromium.
- **Set pieces** (`music/setpieces.ts`, data in `setpieceData.ts`). The Epitaph of Seikilos and the First Delphic Hymn to Apollo, transcribed from public-domain MIDI files on Wikimedia Commons, tuned in Pythagorean ratios from the tonic (A3 and B3), played by the harp with its root and fifth under each bar and the string pad; the second pass adds the flute. They are blocks like any other, so crossfades, ducking and the music bus apply.
- **Levels.** Each instrument's gain (`LEVELS` in `MusicDirector.ts`) and each state's `level` and `velCap` (`styles.ts`) set the mix; `MUSIC_TRIM` in the engine is 1 (0 dB), so the Music slider is the whole story. Measured with the engine's own `meter()` (music only, default slider): about −28 to −31 dBFS RMS and peaks of −9 to −15 dBFS in every state; before, −21 dBFS RMS with peaks near −6 dBFS.

## Verification (no ears needed)

- `npm test` runs `tests/audio-bank.test.ts`, which bakes **every variant of every sound** in Node and checks: not silent, no NaN, no clipping, small DC, a clean end (last 5 ms below 0.01), audible length within the expected range, spectral centroid within the expected range ("grass is brighter than dirt"), and beds that loop without a seam. `audio-dsp` covers filters, mode decay, **Karplus–Strong tuning within 8 cents**, formant pitch, loop crossfades, loudness normalization and reverb impulse responses. `audio-music` covers modes and Pythagorean ratios, the composer's determinism, that every note is in its mode, that full cadences land on the final, energy per state, silences in explore and none in combat, non-repetition (distinct 4-note shapes, mostly stepwise motion), and five minutes of every state. `audio-music-samples` covers the sample manifest against the files and the 16 MB budget, the bank's pitch lookup and its failure fallback, the set pieces' notes and rendering, where they are played, and the velocity caps and the sparse explore states. `audio-engine` covers mix rules, voice stealing, distance, ambience curves, the director's blending, FootstepDriver cadence, landings and silence, and scheduler lookahead, crossfades, overrides and hitch-skipping. `audio-runtime` covers zone hysteresis and measuring at the player rather than the camera, music request priorities (a combat base state inside a temple zone), reviving a fading state, performers waiting for baked samples, the sample store's budget and eviction, the finite set of finals over three hours of music, and the output soft clipper.
- **In the browser**, through real Web Audio offline:
  ```
  node scripts/shot.mjs --scene audio --verbose --steps '[{"eval":"return game.audio.verify().then(r => { console.log(r.table); return r.summary; })"}]'
  ```
  This renders every variant through a spatial chain and 30 s of each music state through the real instruments and the music reverb, then prints a table (length, peak, RMS, issues, and events per instrument) plus the HRTF vs equal-power cost. Latest result in Chromium **and WebKit**: 92 sounds and 329 variants with 0 failures; music events per 30 s were 122 explore-day, 22–44 explore-night, 118 tension, 346 combat, 446 tavern and 39 temple, with no NaN and no clipping.
- **Music, measured** (no ears): `node tools/music/render-check.mjs --tag x --seconds 90` renders every state offline in Chromium through the real instruments, saves `.cache/render/x-<state>.wav` and prints peak, true peak, LUFS, RMS and where the power sits by band (`tools/music/analyze.py`; `--block` simulates the recordings failing to load). `node tools/music/live-meter.mjs` plays each state in the real engine with the other buses silenced and samples `game.audio.meter()`. `node tools/music/loop-check.mjs` checks the sustained samples' loops for seams.
- **Spectrograms:** `import('/src/audio/debug/gallery.ts').then(g => g.showGallery(['clash.metal', 'bed.crowd']))` or `g.showMusic(['combat', 'tavern'])` shows a grid. The board draws one for every sound you click.
- **Measured costs** (M4 Max):
  - Panning, 32 voices × 10 s offline: equal-power 70 ms, HRTF 293 ms. That is about 0.02 % vs 0.09 % of a core per voice, so HRTF is affordable but stays opt-in because it sounds odd on speakers.
  - Worst single bake: 120 ms for the crowd bed, done in the worker.
  - AudioBuffer memory: about 24 MB of sounds (the whole one-shot bank plus the beds in use) and up to the 16 MB budget for music samples (about 4–11 MB after visiting every state).
  - Main-thread audio work per frame (engine `update` + `lateUpdate`, walking the bench and switching music states): mean 0.10–0.15 ms in Chromium and WebKit. The worst frames are about 2 ms when a music state starts (its instruments' audio nodes are created) and, once per space, several ms if a reverb space that no zone declared is used for the first time (`prepareEnvironment` avoids it). No sound, music sample or impulse response is synthesized on the main thread in normal play; the first `play()` of any sound costs under 0.3 ms.
  - Bench scene: 60 fps, about 100 draw calls.

## Files

| File | What |
| --- | --- |
| `index.ts` | `installAudio(game)`, re-exports |
| `AudioEngine.ts` | context, buses, reverb, listener, `play`, `loop`, voice limiting, occlusion, footsteps system, meter, stats |
| `Ambience.ts`, `ambienceCurves.ts` | ambience director; hour, season and altitude curves |
| `FootstepDriver.ts` | locomotion → steps, landings, push-off, gear |
| `mix.ts` | volume curve, distance law, air absorption, voice planning |
| `bank.ts`, `bake.worker.ts`, `WorkerBaker.ts` | sound registry, baking cache, worker baking (sounds, music samples, impulse responses; urgent and background queues) |
| `dsp/` | `core` (RNG, filters, modes, envelopes, loops), `pluck` (Karplus–Strong), `voice` (formant synth), `instruments` (brass, syrinx, aulos, drum, cymbals), `reverb` (impulse responses), `analysis` (stats, FFT, pitch, seams, spectrogram) |
| `sounds/` | recipes: `footsteps`, `combat`, `vocal`, `foley`, `ui` (and stingers), `ambience` (beds, events, loop definitions) |
| `music/` | `theory`, `styles`, `composer`, `setpieces` and `setpieceData` (Seikilos and the Delphic hymn), `vsco` and `vscoManifest` (the recorded instruments' loader and list), `sampleSpec` and `samples` (the synthesised fallback's recipes and budgeted store), `instruments` (Web Audio), `MusicDirector` (Performer, rack, the music bus's tone, director) |
| `debug/` | `SoundBoard`, `verify`, `spectrogram`, `gallery` |

## Known limitations / next steps
- The voices are deliberately wordless effort sounds. Spoken dialogue would need a separate system (recorded or TTS lines on the `voice` bus, with ducking).
- The surface lookup reads the terrain's splat layers and whether the walker is above or below the ground; interiors, wooden floors and bridges are not told apart from stone yet (they would need a per-building floor material).
- Occlusion is a single raycast (on/off muffling). Portals between interiors and exteriors would be the next step.
- Every reverb space in use keeps a loaded ConvolverNode (a few MB each in the browser's FFT kernels for the long halls). That is fine for the handful a district uses; a whole city with many interiors should release spaces whose zones are far away.
- Creating a music state's instruments costs about 1–2 ms on the frame it starts. Pre-building the instruments of the likely next state would hide it if it ever matters.
- The bench's visuals are a test set. Its sun does not follow the clock, because the sky module owns that.
