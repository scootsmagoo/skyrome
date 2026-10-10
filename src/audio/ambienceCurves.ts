/**
 * When things are heard in Rome: time-of-day and seasonal curves per ambience layer, and how
 * the city bed thins and the wind rises as you climb the hills. Pure functions (unit tested).
 */

/**
 * Trapezoid over the 24 h clock: 0 before `a`, rising to 1 at `b`, 1 until `c`, falling to 0 at
 * `d`. Wraps past midnight when the hours are not increasing (e.g. 20 → 22 → 4 → 6).
 */
export function trapezoid(h: number, a: number, b: number, c: number, d: number): number {
  const wrap = (x: number) => ((x % 24) + 24) % 24;
  // Shift everything so `a` is 0, then work on an unwrapped line.
  const H = wrap(h - a);
  const B = wrap(b - a);
  const C = B + wrap(c - b);
  const D = C + wrap(d - c);
  if (H <= B) return B === 0 ? 1 : H / B;
  if (H <= C) return 1;
  if (H <= D) return D === C ? 0 : 1 - (H - C) / (D - C);
  return 0;
}

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Layer level by hour of day (0..24). Layers not listed are constant. */
export const DAY_CURVES: Record<string, (h: number) => number> = {
  // Sparrows chatter all day, loudest at dawn.
  birds: (h) => Math.max(trapezoid(h, 5, 6.5, 19, 20.5) * 0.7, trapezoid(h, 5, 6, 8, 10)),
  // Swifts scream in the morning and in great parties at dusk.
  swifts: (h) => Math.max(trapezoid(h, 5.5, 7, 9, 11) * 0.7, trapezoid(h, 16.5, 18.5, 20.5, 21.3), trapezoid(h, 6, 8, 18, 20) * 0.25),
  // Cicadas need heat: late morning to late afternoon.
  cicadas: (h) => trapezoid(h, 9.5, 12, 16.5, 19),
  // Crickets and owls own the night.
  crickets: (h) => trapezoid(h, 19.5, 21, 4, 5.5),
  owl: (h) => trapezoid(h, 20.5, 22, 3.5, 5),
  // The crowd hum: up at dawn, a lull at the midday siesta, near silence after dark (the NPC count
  // already thins too; see CrowdLife).
  crowd: (h) => Math.max(0.03, trapezoid(h, 5.5, 8, 19.5, 22.5) * (1 - 0.3 * trapezoid(h, 12.5, 13.5, 14.5, 15.5))),
  market: (h) => Math.max(trapezoid(h, 6, 8, 12.5, 14), trapezoid(h, 15, 16, 18.5, 20) * 0.5),
  city: (h) => 0.35 + 0.65 * trapezoid(h, 5.5, 7.5, 20, 22.5),
  // Wheeled traffic was banned in daylight (Lex Iulia Municipalis): carts rumble at night.
  carts: (h) => trapezoid(h, 19.5, 21, 4, 5.5),
  workshop: (h) => Math.max(trapezoid(h, 6.5, 7.5, 12, 13), trapezoid(h, 14.5, 15, 18, 19)),
  dogs: (h) => 0.5 + 0.5 * trapezoid(h, 20, 22, 4, 6),
  'temple-music': (h) => trapezoid(h, 7, 8, 17, 19),
};

/** Month-of-year presence (0 = January). Rome in May: swifts arrived, first cicadas. */
export const SEASONS: Record<string, readonly number[]> = {
  cicadas: [0, 0, 0, 0, 0.3, 0.85, 1, 1, 0.65, 0.15, 0, 0],
  crickets: [0, 0, 0.1, 0.3, 0.65, 0.9, 1, 1, 0.85, 0.4, 0.1, 0],
  swifts: [0, 0, 0, 0.5, 1, 1, 1, 0.6, 0.1, 0, 0, 0],
  owl: [0.3, 0.3, 0.4, 0.8, 1, 1, 1, 1, 0.9, 0.5, 0.3, 0.3],
  birds: [0.5, 0.55, 0.75, 0.9, 1, 1, 0.9, 0.85, 0.85, 0.7, 0.55, 0.5],
};

export function timeFactor(layer: string, hour: number, month: number): number {
  const day = DAY_CURVES[layer]?.(hour) ?? 1;
  const season = SEASONS[layer]?.[((month % 12) + 12) % 12] ?? 1;
  return day * season;
}

/** Layers that belong to the city's sound and thin out as you climb above it. */
export const CITY_LAYERS: ReadonlySet<string> = new Set(['crowd', 'market', 'city', 'carts', 'workshop', 'dogs']);

/**
 * Altitude: below `low` (game y) you are down among the streets; above `high` you are up on a
 * hilltop where the city becomes a distant murmur and the wind takes over.
 */
export function altitudeFactors(y: number, low = 12, high = 34): { city: number; wind: number } {
  const u = smoothstep(low, high, y);
  return { city: 1 - 0.7 * u, wind: 0.3 + 0.7 * u };
}

/** Weight of a zone at `dist` from its centre: 1 inside `radius`, fading to 0 over `fade`. */
export function zoneWeight(dist: number, radius: number, fade: number): number {
  if (dist <= radius) return 1;
  if (fade <= 0 || dist >= radius + fade) return 0;
  return 1 - smoothstep(0, 1, (dist - radius) / fade);
}

export interface LatchOption<T> {
  key: T;
  /** Zone weight 0..1 at the probe. */
  weight: number;
  /** Zone radius: between equally strong zones the smaller (nested, more specific) one wins. */
  radius: number;
}

/**
 * Chooses one zone for a single-valued setting (reverb space, music) with hysteresis, so standing on
 * a zone's edge never flips it back and forth:
 *  - a zone is taken above `enter`; the current one is kept until it falls below `leave`, unless
 *    another is clearly stronger (by `margin`) or equally strong and nested inside it;
 *  - a new choice must persist for `hold` seconds before it takes over (a zone that disappears is
 *    let go at once).
 */
export class ZoneLatch<T> {
  current: T | null = null;
  private candidate: T | null = null;
  private held = 0;

  constructor(
    readonly enter = 0.6,
    readonly leave = 0.4,
    readonly hold = 1,
    readonly margin = 0.15,
  ) {}

  update(options: readonly LatchOption<T>[], dt: number): T | null {
    const better = (a: LatchOption<T>, b: LatchOption<T>) => a.weight > b.weight + this.margin || (a.weight >= b.weight - 1e-6 && a.radius < b.radius);
    let best: LatchOption<T> | null = null;
    for (const o of options) if (o.weight > this.enter && (!best || better(o, best))) best = o;
    const cur = this.current === null ? null : (options.find((o) => o.key === this.current) ?? null);
    if (this.current !== null && !cur) {
      // The zone was removed: no reason to hold on to it.
      this.current = best?.key ?? null;
      this.candidate = null;
      this.held = 0;
      return this.current;
    }
    const want = cur && cur.weight >= this.leave && (!best || best === cur || !better(best, cur)) ? cur.key : (best?.key ?? null);
    if (want === this.current) {
      this.candidate = null;
      this.held = 0;
      return this.current;
    }
    if (want !== this.candidate) {
      this.candidate = want;
      this.held = 0;
    }
    this.held += dt;
    if (this.held >= this.hold) {
      this.current = want;
      this.candidate = null;
      this.held = 0;
    }
    return this.current;
  }
}
