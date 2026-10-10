# Sky, time of day, weather, lighting, shadows, post-processing, light pool

One call sets up the whole outdoor look:

```ts
import { installSky } from '../world/sky';
const sky = installSky(game);           // sky + sun/moon + fog + IBL + shadows + weather + rain
                                        // + game.lights (light pool) + game.post (post-processing)
sky.setWeather('rain', 30);             // blend to rain over 30 real seconds
const lamp = game.lights.request({ position, intensity: 14, distance: 12, flicker: true, night: true });
```

Don't add your own sun, hemisphere light, `scene.fog` or `scene.background` when the sky is installed
(`scenes/common.ts#basicLights` is for scenes without it).

Dev scene: `?scene=sky` (see the parameters at the top of `src/scenes/sky.ts`: `&hour=6.5`,
`&weather=rain`, `&timelapse=1`, `&shadows=low`, `&shadowmode=cascade`, `&post=0`, `&tonemap=agx`,
`&msaa=0`, `&view=golden`, `&torch=1`, `&lamps=300`, `&day=20`, `&auto=1`).

## Files

| File | What |
| --- | --- |
| `src/world/sky/astronomy.ts` | Julian-calendar ephemeris: solar declination, sun/moon direction, moon phase, sidereal star matrix, sunrise/sunset. Pure. |
| `src/world/sky/skyModel.ts` | Physically based atmosphere (Rayleigh + Mie + ozone, single scattering + multiple-scattering approximation), CPU twin of the GLSL. Pure. |
| `src/world/sky/lighting.ts` | Art direction: turns sun/moon + weather into key light, fill, fog, dome uniforms, exposure, lamp factor. Pure. |
| `src/world/sky/weather.ts` | Weather presets, smooth transitions, wetness, optional seeded climate (Markov chain). Pure. |
| `src/world/sky/skyShader.ts` | GLSL: atmosphere (generated from the TS constants), sky-view LUT bake, dome (LUT, sun, moon with phase, stars, Milky Way, clouds, horizon haze). |
| `src/world/sky/SkyDome.ts` | Dome mesh (drawn last among opaques at the far plane) and the two LUTs (sun, moon), re-baked only when their light moves ≥ 0.08° or the haze changes. |
| `src/world/sky/SkyEnvironment.ts` | IBL: sky → 128² cube → PMREM, throttled (≥ 0.4 s apart, only when the sky changed, at least every 20 s). |
| `src/world/sky/shadows.ts` | The single shadow-casting key light (sun by day, moon by night) and its shadow fitting. |
| `src/world/sky/fog.ts` | Global fog shader-chunk patch: exponential height fog with sun in-scattering for all built-in materials. |
| `src/world/sky/wet.ts` | Global wet-surface patch for Standard/Physical materials (darker, glossier when raining). |
| `src/world/sky/Rain.ts` | Rain streaks: one instanced draw call, GPU-animated, wrapped in world space around the camera. |
| `src/world/sky/stars.ts` | ~100 brightest stars (J2000, precessed to AD 113) as point sprites; galactic frame for the Milky Way. |
| `src/world/sky/SkySystem.ts` | The System that ties everything together each frame (priority 105, after the camera rig). |
| `src/world/lights/*` | Light pool: fixed PointLights + instanced glow sprites (`LightPool.ts`, `GlowSprites.ts`, pure `logic.ts`). |
| `src/gfx/post/*` | Post-processing pipeline (`PostFX.ts`, `shaders.ts`). |

## Time and the heavens

- `game.time.hour` is local **apparent solar** time (a sundial reading, as the Romans counted
  hours), so the sun's hour angle is 15°·(hour − 12). Dates are Julian-calendar (AD 113).
- 13 May AD 113 (the default start date): declination +17.9°, **sunrise 04:47, sunset 19:13**,
  civil dusk ends 19:44 (Rome 41.9° N, standard −0.833° altitude). Noon sun 66° high.
- Obliquity in AD 113 was 23.68° (today 23.44°); it is computed, not hard-coded.
- The moon's phase is the real one: a waxing gibbous moon (≈ 78 % lit) on 13 May AD 113, full on
  18 May, new around 2 June. Moonless nights are dark but playable (night fill + exposure).
- Stars rotate with sidereal time. The bright stars are at their AD 113 (precessed) positions; Polaris
  was ~12° from the pole then, so it visibly circles.

## Sky rendering

- **Model.** Physically based atmosphere (Hillaire 2020 parameters) instead of three's Preetham `Sky`:
  Preetham goes black 2° after sunset (no blue hour) and its `pow(…, 1.5)` hack makes the noon sky
  ~6× brighter than at 35° elevation, so it can't be calibrated against real lights. The GPU bakes a
  192×128 sky-view LUT per light (sun, moon) only when the light moves or the haze changes
  (< 0.1 ms per bake); the dome just samples it. The CPU evaluates the same integral for ~10
  directions to derive fog, cloud, fill and light colors, so everything matches the visible sky.
- Artistic layers on top: sky gain 3.6 (the eye sees a brighter sky than single scattering
  predicts), afterglow + Belt of Venus after sunset, milky "haze veil" for summer haze, horizon band
  that blends into exactly the scene's fog color.
- Clouds: two layers on the dome (domain-warped cumulus with self-shadowing toward the sun, silver
  lining, gray cores; cirrus streaks), coverage from the weather, slow drift; a full overcast deck
  keeps visible structure. Clouds and stars appear in the environment map automatically.
- Sun disc (HDR, feeds bloom), moon disc with correct phase shading, earthshine and maria, procedural
  faint stars (magnitudes 3.5–6.5, fainter ones drown first as the sky brightens), Milky Way band.

## Lighting

- **Key light**: one directional light, sun by day and moon by night (color from atmospheric
  transmittance: warm white at noon, orange at golden hour, cool blue by moonlight). It switches when
  both are ≈ 0 (sun 2° below the horizon), so there's never a pop. Only this light casts shadows.
- **Ambient**: image-based lighting from the sky (`scene.environment`, PMREM of the dome with the ground
  below the horizon), scaled by `sky.envScale` (0.6), plus a hemisphere fill (ground bounce, and the
  blue night fill). Metals, marble and water reflect the real sky, including clouds.
- **Fog**: exponential height fog (density halves every ~58 m of height), color = sky ~8° above the
  horizon (aerial-perspective blue), brightened toward the sun. Hearth smoke thickens it at dawn and
  dusk, and valleys get morning mist around sunrise.
- **Exposure**: partial eye adaptation (`exposure ∝ light^−0.42`, 0.55–2.5), smoothed over ~1 s.
  Computed analytically, so there's no GPU readback.
- `sky.lampFactor` (0 by day → 1 at night or under dark skies), `sky.daylight`, `sky.isNight`,
  `sky.sunDir`, `sky.moonDir`, `sky.ephemeris`, `sky.lighting`, `sky.weatherState`, `sky.weatherParams`.
- `sky.indoor` (0..1): set by an interiors module/trigger to dim the sky ambient, stop rain and
  wetness, and let the eye adapt to the gloom.

## Weather

States `clear | hazy | overcast | rain | storm`, `sky.setWeather(state, seconds)`. Parameters blend
smoothly (fog and haze geometrically). With `autoWeather` (default on in `installSky`), a seeded climate
for Roman late spring changes the weather every few game hours. Rain draws ~9000 GPU-animated streaks
near the camera, surfaces get wet (and dry slowly after), lamps come on early, and storms flash
lightning. Events:

- `weather:changed` `{ state, seconds }`
- `weather:thunder` `{ intensity, delay, direction }` (play the thunder after `delay` seconds)
- `sky:lamps` `{ lit }`

## Shadows

`settings.shadows`: `off | low | high` (applied live).

| Quality | Technique | Map | Coverage | Texel |
| --- | --- | --- | --- | --- |
| low | single map following the camera | 1024² | 110 m box | 10.7 cm |
| high (default) | single map following the camera | 2048² | 150 m box | 7.3 cm |
| `shadowmode=cascade` | three r186 native `SunLight`, 2 cascades | 2 × 2048² | 220 m | ≈ 7.7 cm near, ≈ 25 cm far |

The single map's box is pushed ~42 m ahead of the camera and **snapped to whole texels in light
space** (no shimmer when walking). The light **direction** moves in ~0.03° steps rather than every
frame, because a sub-texel jump is invisible and the grid stays stable in between.

**Single vs cascades (measured, dev scene, M4 Max, 1080p):** cascades cost +0.09–0.18 ms/frame, +29
draw calls and +150k shadow triangles here, and in a city that grows with the number of casters within
220 m (the far cascade sees about 4× the area). Near quality is the same. The win is shadows out to
220 m instead of ~100 m ahead. The default stays **single 2048** because the haze hides distant shadow
loss and the city will be draw-call bound. Cascades are one call away (`sky.shadows.setQuality('high',
'cascade')`) if the city budget allows. The older `examples/jsm/csm/CSM.js` was ruled out: it needs
`csm.setupMaterial()` on every material in every module, while r186's `SunLight` cascades are native
to the renderer.

## Light pool (`game.lights`)

```ts
const h = game.lights.request({ position, color?, intensity?: 12, distance?: 12, flicker?: true | 0..1,
                                night?: boolean, dayScale?: 0, priority?: 1, glow?: 0.3, glowIntensity?: 1 });
h.setPosition(p); h.setEnabled(false); h.setIntensity(i); h.setColor(c); h.level; h.alive; h.remove();
```

- Exactly `count` (8) PointLights live in the scene forever, at intensity 0 when unused. **Adding or
  removing lamps never recompiles shaders.**
- Every 0.1 s the nearest/most important requests get the real lights (score = distance² / priority²,
  with a 25 % hysteresis bonus for incumbents). Swaps fade out and in over ~0.17 s.
- Every request also draws an additive glow sprite (one instanced draw for all of them), which is the
  visible flame halo. Distant lamps keep a 1.6 px minimum size, so a lit city twinkles from the hills.
  Glows are fogged.
- `night: true` lamps follow `sky.lampFactor`, each with its own threshold, so they're lit one by one
  at dusk and go out one by one at dawn. Flicker uses three detuned sines (deterministic, shared by
  light and glow).
- **Always-burning fires** (no `night`: temple braziers, forges, kitchens) keep their flame glow by
  day (dimmed to `dayGlow` = 25 %), but their real light is scaled by `1 − (1 − dayScale)·daylight`.
  `dayScale` defaults to 0: a brazier lights nothing in sunlight (a 40 cd brazier used to out-shine
  the sun on marble 3 m away), and once it is below 5 % it gives up its pool slot. When the player
  is indoors (`sky.indoor`), daylight counts as 0 and fires are at full strength. Use `dayScale ≈ 1`
  for a fire in a dark interior that is rendered without `sky.indoor` being set.
- `remove()` fades the light's slot out over ~0.17 s (no pop). A removed handle is dead (`alive`
  false): its setters are ignored, so a carried torch whose updater runs once more can't move
  another lamp's glow. `remove()` twice is harmless. Covered by `tests/sky-lightpool.test.ts`.
- Measured: 382 requests (300 scattered lamps + scene lamps + a carried torch) take 0.62 ms/frame
  in total at 720p.

## Post-processing (`game.post`)

Custom and small (three's EffectComposer + UnrealBloom + OutputPass + SMAA would be 6+ full-screen
passes):

1. Scene → half-float HDR target (4× MSAA when `settings.antialias`).
2. Bloom: 5 × 13-tap downsamples (the first applies exposure, a soft threshold of 1.4 and Karis
   averaging, so the sun can't flicker) and 4 × 9-tap tent upsamples, all at half resolution and below.
   The upsamples are additive, so the post passes run with `renderer.autoClear = false` (every
   pass covers its whole target anyway): `mips[0]` = level 0 + up(level 1 + up(level 2 + …)), a
   tight core around the flame or sun with a wide skirt. Bloom strength 0.075 (÷ 5 levels) was
   re-checked against this chain at 0.04–0.1: around a brazier at night the bloom now carries ~3.5×
   the energy of the earlier (accidentally cleared) chain, peaked within ~30 px of the flame
   instead of a 1/32-resolution smear, which still reads as subtle, so it stays.
3. One composite pass: tone mapping, color grade (saturation, gentle S-curve, **warm highlights, cool
   shadows**), vignette, sRGB, dither (no banding in sky gradients).
4. FXAA only when MSAA is off (the composite then goes through an 8-bit target).

Disable with `settings.postfx = false` (or `game.post.enabled = false`). The renderer then tone-maps
directly with the same operator, and bloom/grade are skipped. `settings.bloom` toggles bloom alone.
For that path to match, every custom `ShaderMaterial` ends its fragment shader with
`#include <tonemapping_fragment>` and `#include <colorspace_fragment>` (no-ops into the HDR
target), as the dome, rain, stars and light glows do. The fog is applied before tone mapping in
both paths (`fog.ts`; three normally fogs after the sRGB encode, with an sRGB-encoded fog color),
so the haze looks the same with post on or off.

**Tone mapping: ACES** (default; `tonemap=agx|neutral` to compare). Compared in the dev scene at noon,
golden hour, dawn and night: ACES gives the crispest Mediterranean noon (deep blue sky, white marble,
warm travertine) and the richest torch-light contrast at night. AgX was softer and greyer (marble
turned pinkish-grey, the sky washed out), and Neutral oversaturated grass to olive. The grade is
pulled back (saturation 1.04, contrast 0.06) because ACES already adds contrast.

## Performance (dev scene: ~55 draw calls, ~370k triangles; Apple M4 Max)

Synchronous render throughput (`__skyBench`, scene + post, ms/frame):

| Config | Chromium 720p | Chromium 1080p | WebKit 720p | WebKit 1080p |
| --- | --- | --- | --- | --- |
| shadows off, post on | 0.55 | 0.98 | 0.54 | 0.98 |
| shadows low | 0.52 | 0.96 | 0.52 | 0.96 |
| shadows high (single 2048) | 0.54 | 0.98 | 0.54 | 1.00 |
| shadows cascade 2×2048 | 0.72 | 1.08 | 0.71 | 1.06 |
| post off | 0.40 | 0.60 | 0.41 | 0.58 |
| post on, bloom off | 0.47 | 0.87 | 0.46 | 0.89 |
| night, 8 point lights | 0.57 | 1.04 | 0.57 | 1.05 |
| rain | 0.58 | 1.04 | 0.62 | 1.06 |

So post costs ≈ 0.38 ms at 1080p (bloom ≈ 0.11 ms of that) and adds 10 draw calls. Re-measured
after the bloom-chain fix (noon, shadows high; chromium / webkit): post on 0.54–0.62 / 0.54–0.58 ms
at 720p and 0.99–1.07 / 0.98–1.02 ms at 1080p, bloom off 0.46 / 0.46 and 0.87 / 0.86, post off
0.37 / 0.37 and 0.59 / 0.65, so unchanged within noise. The real rAF loop
runs at a steady 60 fps (vsync) in both browsers at both sizes: p95 ≤ 18 ms, max ≤ 19 ms, including
timelapse (LUT re-bake every frame, environment refreshed ~3×/s). CPU is 0.6–1.6 ms/frame including
three's render submission; the CPU atmosphere is re-evaluated only when the sun moves ≥ 0.07° or the
weather changes (~0.3 ms each time).

## Integration notes

- `installSky(game)` must run during scene setup, before the first render: it patches three's fog and
  physical-lighting shader chunks once (`fog.ts`, `wet.ts`).
- Use `MeshStandardMaterial`/`MeshPhysicalMaterial` (shared via `gfx/materials`) to get IBL, fog and
  wetness. Custom `ShaderMaterial`s with `fog: true` should build their uniforms with
  `UniformsUtils.merge([UniformsLib.fog, …])` **after** `installSky`, which gives them the height/sun
  fog too. Otherwise they fall back to plain exponential fog. End every custom fragment shader
  with `#include <tonemapping_fragment>` + `#include <colorspace_fragment>` (see Post-processing).
- Fires in the light pool: `night: true` for street/shop lamps; leave it off for fires that burn
  all day, which then light nothing in sunlight (see `dayScale`).
- `Game.renderFrame` is the render hook (post-processing replaces it). `renderer.info` stats include
  the post passes.
- Interiors: set `game.sky.indoor = 1` inside buildings (and back to 0 outside).
- Save/load: `sky.weather.serialize()` / `restore()`; after a time skip call `sky.invalidate()` (big
  jumps of game time are detected automatically).

### R4b (2026-10): light, air and plants

- **Aerial perspective.** The fog already is height fog with in-scatter toward the sun; the extinction
  now runs per channel at (1.22, 1.0, 0.8) (was 1.1, 1.0, 0.9), so far blocks lose red first and tint
  toward the sky faster. Distant hills and insulae soften and cool without a flat grey veil.
- **Shade is not cyan.** `SKY_FILL_CONTRAST` (0.42, was a literal 0.6) keeps less of the sky's colour
  contrast in the diffuse fill, the environment bake (`uEnvMode` in `skyShader.ts`) blends the lower
  sky 60 % toward the sunlit ground colour (walls and ground, not clear sky, light the sides), and the
  grade's shadow tint is (0.96, 0.995, 1.04) with `shadowDesat` 0.42. This was the "bluish ramp": the
  basalt cobbles of the Pons Aemilius approach ramp (and every basalt street in shade) read blue-grey
  (shade RGB 87,99,110 became about 93,98,102).
- **Golden hour grade.** `PostFX.lateUpdate` leans the highlight tint toward honey and lifts saturation
  as the sun gets low (`goldenHour()` in `grade.ts`: stepped in twelfths so the LUT is re-baked about
  a dozen times over an evening, not every frame).
- **Night banding: checked, not present.** The composite's half-float grade LUT plus triangular
  dither leaves an 8x-stretched crop of the 22:00 sky as smooth noise with no steps (see the report's
  crops). Black specks in the middle of a glare (an inf or NaN from a half-float overflow reaching ACES)
  are stopped by `finite3()` in the composite and the bloom prefilter.
- Facade weathering and the foliage cards are in `docs/modules/fabric.md` and
  `src/gfx/textures/shaderPatch.ts` (SK_FACADE, planar wall noise).

## Known issues / next steps

- No rain occlusion: streaks and wetness ignore roofs unless `sky.indoor` is set. A top-down "rain
  depth" map would fix it.
- Shadow casters behind the camera beyond the box (~33 m behind) don't cast into view at very low sun.
  Cascades fix it if needed.
- Clouds are a 2D layer (no volumetric parallax, no cloud shadows on the ground yet; a light-space
  cloud-shadow term in the key light would be cheap).
- The light pool ranks lights in O(n·8) every 0.1 s. Fine for hundreds of lamps; for thousands,
  add a spatial grid.
- With post-processing off, additive sprites (light glows, stars) are added after tone mapping, so
  flame halos look a little larger and softer than with post on; the grade, vignette and bloom are
  post-only by design. The fog decode assumes an sRGB canvas (a Display-P3 canvas would skip the
  gamut matrix).
- Daylight dimming of always-burning fires uses the player's `sky.indoor`, not the fire's own
  location; a fire inside a building seen from outside at noon is dark unless it sets `dayScale`.
- The physically based moonlit sky is shown at 0.5× and night exposure is capped for gameplay;
  `MOON_ILLUMINANCE`, `NIGHT_FILL` and `EXPOSURE` in `lighting.ts` are the knobs.
