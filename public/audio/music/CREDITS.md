# Music samples and set pieces: provenance

Everything here is derived by `tools/music/` from sources kept outside the repository in `.cache/` (gitignored). The derived files are mono AAC (`.m4a`) and MP3 (`.mp3`) at 24 kHz and 80 kbps, level-matched, trimmed, and (for sustained notes) cut to an attack plus a seamless, phase-aligned loop. `src/audio/music/vscoManifest.ts` is the generated list of them.

## Recorded instruments: VSCO 2 Community Edition (CC0)

- **Source:** https://github.com/sgossner/VSCO-2-CE (Versilian Studios LLC; recorded by Sam Gossner and Simon Dalzell, sample cutting by Elan Hickler/Soundemote). Homepage: http://vis.versilstudios.net/vsco-community.html
- **Licence:** the repository's `LICENSE` file is "CC0 1.0 Universal" (public domain dedication). Its `Readme.txt` adds the request quoted here: "You are permitted to use these samples for ANY purpose. We ask that you do not sell the samples directly, and encourage you to keep any work done on improving the sample set open and public. Please provide credit to Versilian Studios/Sam Gossner, and/or Ivy Audio/Simon Dalzell where applicable, and link to the VSCO: CE homepage." This file is that credit. The samples are not sold; the derived set is open in this repository.
- **Fetched** with `python3 tools/music/fetch-vsco.py` (a 56-file subset, 86 MB of 44.1 kHz WAV, from commit HEAD of 2026-10-09); **built** with `python3 tools/music/build-samples.py`.

| Group (ids) | Source files in the repository | Use |
|---|---|---|
| `harp-D2` ... `harp-G5` (13) | `Strings/Harp/KSHarp_<note>_mf.wav` | lyre and kithara |
| `oboe-*` (9) | `Woodwinds/Oboe/Sus/Oboe_Sus_<note>_v1_Main.wav` (softest velocity layer) | aulos |
| `flute-*` (8) | `Woodwinds/Flute/susNV/LDFlute_susNV_<note>_v1_1.wav` (no vibrato, softest layer) | syrinx (the collection has no alto flute or recorder; the flute is played in its low register) |
| `cello-*` (5) | `Strings/Cello Section/susvib/susvib_<note>_v1_1.wav` (cello section, sustained, vibrato, softest layer) | the soft low string pad under temple, tension and combat music, and under the set pieces |
| `doum-*` (5) | `VSCO 1 Percussion/drums/other/ethnic/giant/hand/EthnicLargeHand_hit_{pp_2,pp_3,mp_1..3,f_4}.wav` | the hand-played large drum (tympanum): the low stroke |
| `tek-*` (3) | `VSCO 1 Percussion/drums/other/ethnic/congo/muted/ethnic{High,Low}_hit_*.wav` | muted hand slaps: the high stroke |
| `ka-*` (3) | `VSCO 1 Percussion/varWood/tambourine_up_{2,3,6}.wav` | light tambourine taps: the third stroke |
| `tamb-*` (5) | `VSCO 1 Percussion/varWood/tambourine_{down_2..4,shake}.wav`, `Percussion/Tamb1-Shake_v1_rr1_Sum.wav` | the cymbala's accents (tambourine hits and shakes) |

(Names are the recording's labels; the pitch each is mapped to was measured, and the VSCO oboe, flute and cello labels are an octave below the sounding pitch.)

## Set pieces: public-domain MIDI from Wikimedia Commons

Both files are marked "Public domain" on Wikimedia Commons (extmetadata `LicenseShortName: Public domain`, `Copyrighted: False`), and the tunes themselves are ancient.

- **Epitaph of Seikilos** (1st century AD): https://upload.wikimedia.org/wikipedia/commons/6/6f/Seikilos.mid (File:Seikilos.mid). 37 notes, 6/8.
- **First Delphic Hymn to Apollo** (c. 128 BC): https://upload.wikimedia.org/wikipedia/commons/0/09/1st_delphic_hymn.mid (File:1st delphic hymn.mid, by User:Rnabet, own work). 110 notes (the file doubles each note on a second channel; the doubles are dropped).

Only the notes (pitch, start, length) are used; `tools/music/make-setpieces.py` writes them to `src/audio/music/setpieceData.ts`. Tuning, tempo, accompaniment and orchestration are the game's (src/audio/music/setpieces.ts).
