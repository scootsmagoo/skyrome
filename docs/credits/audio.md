# Audio credits

The audio module uses **no third-party samples or assets**. Every sound effect, ambience bed, impulse response and musical note is synthesized in code (`src/audio/`), so `public/audio/` is not used.

Techniques are standard and public-domain knowledge:
- Karplus–Strong plucked string synthesis (Karplus & Strong 1983; Jaffe & Smith 1983 extensions).
- Cascade formant synthesis after Klatt (1980), using average vowel formants from Hillenbrand et al. (1995).
- RBJ "Audio EQ Cookbook" biquad filters (Robert Bristow-Johnson).
- Paul Kellet's economy pink-noise filter.
- Minnaert resonance model for bubbles and water drops.
