# Credits: sky, lighting and post-processing module

No third-party image, audio or model assets are used. All code is original unless listed here.

| What | Source | License | Author |
| --- | --- | --- | --- |
| `FXAAShader` (used as-is via `three/examples/jsm/shaders/FXAAShader.js`) | https://github.com/mrdoob/three.js/blob/r186/examples/jsm/shaders/FXAAShader.js | MIT | three.js authors (FXAA by NVIDIA / Timothy Lottes, port by Jasper Flick and Dave Hoskins) |
| `SunLight` / `SunLightShadow` (two-cascade shadows, used as-is via `three/examples/jsm/lights/SunLight.js`) | https://github.com/mrdoob/three.js/tree/r186/examples/jsm/lights | MIT | three.js authors |
| Atmosphere parameters (Rayleigh, Mie and ozone coefficients, scale heights) and the sky-view LUT approach | S. Hillaire, "A Scalable and Production Ready Sky and Atmosphere Rendering Technique", EGSR 2020, https://sebh.github.io/publications/ | Published research (formulas and constants only) | Sébastien Hillaire |
| Bloom down/upsample filters (13-tap, Karis average, tent upsample) | J. Jimenez, "Next Generation Post Processing in Call of Duty: Advanced Warfare", SIGGRAPH 2014 | Published research (technique only) | Jorge Jimenez |
| Hash functions (`hash12`, `hash33`) | "Hash without Sine", https://www.shadertoy.com/view/4djSRW | MIT | Dave Hoskins |
| Ephemeris formulas (Julian Day, solar longitude, lunar main terms, obliquity) | J. Meeus, *Astronomical Algorithms*, 2nd ed., 1998 | Formulas only | Jean Meeus |
| Bright-star J2000 positions, V magnitudes and B−V colors | Yale Bright Star Catalogue, 5th ed. (Hoffleit & Warren 1991), http://tdc-www.harvard.edu/catalogs/bsc5.html | Public domain data | D. Hoffleit, W. H. Warren Jr. |
| Galactic pole and centre coordinates (J2000) | IAU 1958 galactic coordinate system | Public domain data | IAU |
