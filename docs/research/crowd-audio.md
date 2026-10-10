# Crowd audio: what was wrong, the options, what we chose

October 2026. The owner: "the constant chattering sound of people talking is kinda weird; I don't know what it can be replaced with, or if it should be."

## What actually played (before)

Three separate things, all made of the same synthetic formant voice (`utterance()` in `src/audio/sounds/vocal.ts`):

1. **`bed.crowd`** (loop `crowd`, `-11 dB`): 18 synthetic talkers babbling at 8-45 m, plus a murmur and grain texture, looping every 12 s. It played inside every `crowd` zone (Forum Romanum, Rostra, both basilicas, the imperial fora, the Subura at 0.6, the Circus at 0.35), at full level the moment you entered the zone, whatever the number of people actually there.
2. **`amb.chatter`** events from the same loop: one synthetic voice every 1.8 s on average (`rate 0.55`), at a random angle, 3-12 m from the listener. Nobody stood there. Another 0.3/s from the `market` loop.
3. **`bed.city`** (loop `city`, base level 0.8 everywhere, never below 0.35 at night): nine more talkers at 35-90 m plus a rumble.

The hour curve only brought the crowd down to 10 % at night; the zone ignored how many NPCs were around. The result: a wall of babble that was identical at noon and at 23:00, in a crowded forum and in an empty lane, and a voice every second or two with no body to go with it. Synthetic voices are fine buried in a bed of 40 others, but exposed and repeated close to the listener they sound like what they are.

Measured with `node scripts/sfx/chatter.mjs` (60 s in the real game; voices = `amb.chatter` + `amb.calls`):

| Place | People within 25 m | Voices / min | Master LUFS-I | Ambience bus RMS |
| --- | --- | --- | --- | --- |
| Forum 10:00 | 45-58 | **46** | -24.8 | -30.3 dBFS |
| Subura 10:00 | 9-16 | **26** (2-5 people within 12 m) | -27.8 | -33.4 |
| Subura 23:00 | 3-8 | **12** | -29.6 | -40.5 |

## What real cities sound like, and what reads well in games

- A real street is mostly *not* voices: feet on stone, cart wheels, a hammer, a hawker's call every half minute, a dog, water, birds, a child's shout. Voices you can follow come from a few people near you; beyond about 15 m speech smears into a low, formless hum, and only a dense crowd makes that hum loud.
- Games that feel alive (Assassin's Creed, Skyrim's cities, Red Dead) use **sparse, located voices** from the people you can see, a **soft low bed that exists only where crowds are dense**, and **silence between**. A constant mid-level babble is the cheap alternative and it is the one that fatigues.
- Night is nearly silent: crickets, an owl, a cart, now and then one pair.

## Options

| Option | For | Against |
| --- | --- | --- |
| A. Keep the babble bed, just quieter | one-line change | still constant, still unlocated, still identical day and night |
| B. CC0 "walla" recordings as the bed | real voices, convincing density | licence checks need Freesound / OpenGameArt downloads (Freesound needs a login for the file, the sandbox had no network path to verify provenance), a loop of real speech repeats audibly, I cannot listen to judge it, 1-3 MB each. Left as a later swap-in: the bed is one id (`bed.crowd`), the rest of the design does not change |
| C. A texture bed (speech-shaped noise, no syllables) driven by the real crowd size | no voice, so nothing weird; tiny; deterministic; quiet by construction | not a "recording": reads as a hum or surf |
| D. Located exchanges from real NPC pairs | the sound has a body you can walk toward; rare by construction; follows the NPC simulation; no content to license | needs the NPC state; still synthetic voices (but heard seldom, dull and slow, in short turns) |
| E. Non-voice life (steps, carts, hammers, birds, water) | most of what a city sounds like | exists already for steps, carts at night, hammers, birds, fountains |

## What we chose: C + D, with E already in place

1. **The hum follows the people.** `CrowdLife` (a System, 2 Hz) counts the NPCs within 25 m, smooths the count over about 4 s and sets the `crowd` layer: `crowdHum(n)` is 0 up to 3 people, about 0.2 for ten, 0.75 for 55. The existing hour curve multiplies it (siesta dip, 3 % at night). The Forum zones keep only their reverb; they no longer carry a layer. `bed.crowd` is now `humBed()`: nine speech-shaped noise bands (160-2200 Hz, tilted like speech, low-passed at 1.8 kHz) each swelling on its own 0.35-1.6 Hz rhythm, plus a few shuffling grains. Loop gain -16 dB (was -11) and the level is no longer 1.0 in the Forum but 0.75: the Forum hum is about 8 dB softer than before and has no voices inside it.
2. **`bed.city` lost its talkers.** Same `humBed` at 110-900 Hz and a low rumble, base level 0.8 to 0.6, loop gain -14 (was -12), fewer calls.
3. **Voices only from real pairs.** `amb.murmur` is a new one-shot: a 2-4 turn exchange of two dull, slow murmurs (3.2-4.4 syllables/s, low-passed at 1.7 kHz, 1.8-5 s long, 10 variants, ref 2.5 m, silent beyond 22 m). `CrowdLife` finds pairs in conversation (NPCs with a `converse` task, the brain's "chat with someone nearby"; and two idlers in the `talk` loop within 3.5 m, the people you can see gesturing), and plays it at the midpoint of one pair at a time: only pairs 2.5-14 m away, a pair must have been talking 1.2 s, each pair rests 35-80 s, and a pacer leaves 3.5-9 s of silence after any voice, stretched by `streetActivity(hour)` (about 5x at night, so a voice every minute or so, usually none).
4. **Hawkers.** Merchants 6-30 m away call (`amb.calls`) at the merchant's position, at most one every 14-34 s, with a per-merchant rest of 25-60 s. The market loop's random calls fell from 0.14/s to 0.03/s and the city's from 0.015 to 0.006.
5. `amb.chatter` is kept for the amphitheatre loop only (a roar of tens of thousands is the one place where wall-of-voices is right).

Code: `src/audio/CrowdLife.ts` (pure logic and the system), `src/audio/sounds/ambience.ts` (`humBed`, `bakeMurmur`, defs, loops), `src/audio/ambienceCurves.ts` (night floor 0.1 to 0.03), `src/game/audio.ts` (wiring). Tests: `tests/audio-crowdlife.test.ts`.

## Measurements (after)

`node scripts/sfx/chatter.mjs` (same method; voices = `amb.murmur` + `amb.calls`):

| Place | People within 25 m | Voices / min | Master LUFS-I | Ambience bus RMS |
| --- | --- | --- | --- | --- |
| Forum 10:00 | 51-61 | **10** (7 murmurs at pairs, 3 hawker calls) | -29.1 (was -24.8) | -36.4 (was -30.3) |
| Subura 10:00 | 10-11 | **2** (both hawker calls) | -31.5 (was -27.8) | -39.6 (was -33.4) |
| Subura 23:00 | 2-4 | **1** (a far call at 98 m) | -29.9 (was -29.6) | -41.7 (was -40.5) |
| Forum 23:00 | 9-10 | **0** | -29.8 | -41.9 |

Voices per minute fell 4.6x in the Forum, 13x in the Subura and 12x at night. The Forum is 4.3 dB quieter overall (LUFS), 6 dB quieter on the ambience bus; at night the master barely changes because crickets, owls and carts were already the content. Crowd hum levels (the `crowd` layer): Forum 0.71, Subura 0.18, night 0 to 0.005.

Voice detector (envelope power in the 3-8 Hz syllable band, share of 0.25-20 Hz; a flat texture is about 25 %, speech is far above it): new `bed.crowd` 22.6 %, new `bed.city` 17.9 %, the arena bed (still real babble) 62 %. Spectral centroids: crowd 350 Hz, city 190 Hz, murmurs 300-510 Hz.

## What I could not do

- **Listen.** Everything above is measured, not heard. Likely tuning points if it sounds off: the murmur's low-pass (`1700`) and `dull` (0.55-0.85) in `bakeMurmur` (dull and slow was chosen to hide the synthetic formants; centroids of 300-500 Hz may be too muffled), the hum's `amp` and gain, `crowdHum`'s shape, `ChatterPlanner` ranges and cool-downs.
- **Recorded walla.** Not fetched: no verified-licence source reachable from here. If the murmurs still sound artificial, the right next step is a few CC0 recordings of 2-3 people talking (Freesound CC0 search "conversation", "murmur", OpenGameArt), cut to 2-5 s clips, put through `scripts/sfx` into a `chatter` group, and swapped in for `bakeMurmur` the way the footsteps were; provenance in `public/audio/sfx/CREDITS.md`. Latin or not hardly matters at this level: speech is a dull murmur.

## Next steps

- Non-voice life that the NPC system could drive: handcart wheels for NPCs carrying loads, a child's shout when a `child` role runs, pigeons rising when the player runs through a square, a workshop's hammer at a real smithy station (the `workshop` loop is zone-based today).
- Market stalls: positional hawkers are only merchants; the station NPCs (stalls) could join `VENDOR_ROLES`.
