/**
 * Weather states, their look parameters, smooth transitions and an optional automatic climate
 * (pure logic; the SkySystem turns parameters into light, fog, clouds and rain).
 *
 * Rome in late spring and summer: mostly clear or hazy, the odd grey morning, short heavy showers
 * and the occasional thunderstorm (which the Romans read as Jupiter's word).
 */
import { Rng } from '../../core/Rng';

export const WEATHER_STATES = ['clear', 'hazy', 'overcast', 'rain', 'storm'] as const;
export type WeatherState = (typeof WEATHER_STATES)[number];

export interface WeatherParams {
  /** Cumulus cover 0..1 (1 = solid overcast deck). */
  cloudCover: number;
  /** High thin cirrus 0..1. */
  cirrus: number;
  /** Rain-cloud darkening 0..1. */
  cloudDark: number;
  /** Aerosol (Mie) density multiplier: 1 ≈ optical depth 0.005 (pristine); 3.5 clear summer air; 16 milky haze. */
  haze: number;
  /** Ground-level fog extinction (1/m): clear summer air ≈ 0.0012. */
  fog: number;
  /** Multiplier on direct sun/moon light. */
  sun: number;
  /** Shadow darkness 0..1. */
  shadow: number;
  /** Rain amount 0..1.5 (streak density). */
  rain: number;
  /** Wind (m/s) drifting clouds and slanting rain. */
  wind: number;
  /** Lightning flashes per real minute. */
  lightning: number;
  /** Color-grade saturation multiplier. */
  saturation: number;
}

export const WEATHER_PRESETS: Record<WeatherState, WeatherParams> = {
  clear: { cloudCover: 0.22, cirrus: 0.35, cloudDark: 0, haze: 3.5, fog: 0.0011, sun: 1, shadow: 1, rain: 0, wind: 3, lightning: 0, saturation: 1 },
  hazy: { cloudCover: 0.1, cirrus: 0.4, cloudDark: 0, haze: 16, fog: 0.003, sun: 0.82, shadow: 0.85, rain: 0, wind: 1.5, lightning: 0, saturation: 0.92 },
  overcast: { cloudCover: 0.97, cirrus: 0, cloudDark: 0.25, haze: 10, fog: 0.0024, sun: 0.12, shadow: 0.25, rain: 0, wind: 5, lightning: 0, saturation: 0.8 },
  rain: { cloudCover: 1, cirrus: 0, cloudDark: 0.6, haze: 14, fog: 0.0055, sun: 0.04, shadow: 0.1, rain: 1, wind: 7, lightning: 0, saturation: 0.72 },
  storm: { cloudCover: 1, cirrus: 0, cloudDark: 0.85, haze: 18, fog: 0.0075, sun: 0.02, shadow: 0.05, rain: 1.5, wind: 12, lightning: 3, saturation: 0.65 },
};

const KEYS = Object.keys(WEATHER_PRESETS.clear) as (keyof WeatherParams)[];

export function copyWeather(src: WeatherParams, out: WeatherParams = { ...src }): WeatherParams {
  for (const k of KEYS) out[k] = src[k];
  return out;
}

/** Linear blend of two parameter sets (fog and haze blend geometrically so visibility changes evenly). */
export function blendWeather(a: WeatherParams, b: WeatherParams, t: number, out: WeatherParams = { ...a }): WeatherParams {
  for (const k of KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  out.fog = Math.exp(Math.log(a.fog) + (Math.log(b.fog) - Math.log(a.fog)) * t);
  out.haze = Math.exp(Math.log(a.haze) + (Math.log(b.haze) - Math.log(a.haze)) * t);
  return out;
}

/** Markov chain for the automatic climate: probabilities of the NEXT state. */
export const CLIMATE: Record<WeatherState, [WeatherState, number][]> = {
  clear: [['clear', 0.55], ['hazy', 0.3], ['overcast', 0.12], ['rain', 0.03]],
  hazy: [['clear', 0.45], ['hazy', 0.3], ['overcast', 0.2], ['storm', 0.05]],
  overcast: [['clear', 0.3], ['hazy', 0.15], ['overcast', 0.15], ['rain', 0.32], ['storm', 0.08]],
  rain: [['overcast', 0.55], ['clear', 0.3], ['rain', 0.1], ['storm', 0.05]],
  storm: [['rain', 0.6], ['overcast', 0.4]],
};

/** Mean duration (game hours) of each state in the automatic climate. */
export const CLIMATE_HOURS: Record<WeatherState, number> = { clear: 9, hazy: 6, overcast: 4, rain: 1.5, storm: 1 };

const smooth = (t: number) => t * t * (3 - 2 * t);

export class WeatherController {
  /** The state being transitioned to (or settled in). */
  state: WeatherState;
  private from: WeatherParams;
  private to: WeatherParams;
  private t = 1;
  private duration = 0;
  /** Current blended parameters (read every frame). */
  readonly params: WeatherParams;
  /** Surface wetness 0..1, lags behind rain (wets in ~a minute, dries over several). */
  wetness = 0;
  /** Automatic climate: picks a new state when the current one has lasted long enough. */
  auto = false;
  private autoHoursLeft = 0;
  private rng: Rng;

  constructor(initial: WeatherState = 'clear', seed = 113) {
    this.state = initial;
    this.from = copyWeather(WEATHER_PRESETS[initial]);
    this.to = copyWeather(WEATHER_PRESETS[initial]);
    this.params = copyWeather(WEATHER_PRESETS[initial]);
    this.rng = new Rng(seed);
    this.autoHoursLeft = this.rollDuration(initial);
  }

  /** Start a transition from the CURRENT look to `state` over `seconds` (0 = instant). */
  set(state: WeatherState, seconds = 30) {
    this.from = copyWeather(this.params);
    this.to = copyWeather(WEATHER_PRESETS[state]);
    this.state = state;
    this.duration = Math.max(0, seconds);
    this.t = this.duration === 0 ? 1 : 0;
    if (this.t === 1) copyWeather(this.to, this.params);
    this.autoHoursLeft = this.rollDuration(state);
  }

  /** True while blending between two states. */
  get transitioning() {
    return this.t < 1;
  }

  /** Transition progress 0..1. */
  get progress() {
    return this.t;
  }

  /**
   * Advance by `dt` real seconds and `gameHours` of game time. Returns the new state if the
   * automatic climate changed it this step.
   */
  update(dt: number, gameHours = 0): WeatherState | null {
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / Math.max(1e-6, this.duration));
      blendWeather(this.from, this.to, smooth(this.t), this.params);
    }
    const p = this.params;
    const wetTarget = Math.min(1, p.rain);
    const rate = wetTarget > this.wetness ? 1 / 45 : 1 / 240;
    this.wetness += Math.sign(wetTarget - this.wetness) * Math.min(Math.abs(wetTarget - this.wetness), rate * dt);

    if (!this.auto) return null;
    this.autoHoursLeft -= gameHours;
    if (this.autoHoursLeft > 0 || this.t < 1) return null;
    const next = this.rng.weighted(CLIMATE[this.state]);
    if (next === this.state) {
      this.autoHoursLeft = this.rollDuration(next);
      return null;
    }
    // Transitions take 20–40 real seconds (several game minutes at the default time scale).
    this.set(next, 20 + this.rng.next() * 20);
    return next;
  }

  private rollDuration(s: WeatherState) {
    return CLIMATE_HOURS[s] * (0.5 + this.rng.next());
  }

  serialize() {
    return { state: this.state, wetness: this.wetness, auto: this.auto };
  }

  restore(s: { state: WeatherState; wetness?: number; auto?: boolean }) {
    this.set(s.state, 0);
    this.wetness = s.wetness ?? 0;
    if (s.auto !== undefined) this.auto = s.auto;
  }
}
