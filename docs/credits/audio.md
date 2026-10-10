# Audio credits

The audio module mixes **CC0 recordings** with sound synthesized in code (`src/audio/`):

- **Sound effects and ambience beds** (`public/audio/sfx/`): CC0 recordings from Kenney's packs and OpenGameArt, cut and packed by `scripts/sfx/build.mjs`. Sources, pages and licence text: `public/audio/sfx/CREDITS.md`.
- **Instruments** (`public/audio/music/`): a subset of the VSCO 2 Community Edition (CC0, Versilian Studios, Sam Gossner and Simon Dalzell). Credit, sources and the cutting recipe: `public/audio/music/CREDITS.md`.
- **Synthesis** stays for the sounds no recording fits (voices, bow and sling, the stingers, the fire, wind, city, cicada and cricket beds), as a stand-in while a recording loads or if one cannot be decoded, and for every impulse response.

The synthesis techniques are standard and public-domain knowledge:
- Karplus–Strong plucked string synthesis (Karplus & Strong 1983; Jaffe & Smith 1983 extensions).
- Cascade formant synthesis after Klatt (1980), using average vowel formants from Hillenbrand et al. (1995).
- RBJ "Audio EQ Cookbook" biquad filters (Robert Bristow-Johnson).
- Paul Kellet's economy pink-noise filter.
- Minnaert resonance model for bubbles and water drops.
