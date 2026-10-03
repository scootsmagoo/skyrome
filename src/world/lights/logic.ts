/** Pure helpers for the light pool (unit tested). */

/**
 * Flame flicker multiplier in [1 − 0.6·amount, 1]. Deterministic in (t, seed); three detuned
 * sines read as a guttering flame without per-frame randomness. The glow shader uses the same
 * formula.
 */
export function flicker(t: number, seed: number, amount: number): number {
  if (amount <= 0) return 1;
  const n =
    0.5 * Math.sin(t * 9.1 + seed * 12.9) +
    0.3 * Math.sin(t * 23.7 + seed * 4.1) +
    0.2 * Math.sin(t * 41.3 + seed * 7.7 + Math.sin(t * 3.1 + seed));
  return 1 - Math.min(1, amount) * (0.5 + 0.5 * n) * 0.6;
}

/**
 * How lit a "night" lamp is for the sky's lamp factor (0 day → 1 night). Each lamp has its own
 * threshold from `seed` (0..1), so at dusk they come on one by one, as if a slave were going round
 * with a taper, and go out in the reverse order at dawn.
 */
export function lampLevel(lampFactor: number, seed: number): number {
  const th = 0.7 * seed;
  const t = Math.min(1, Math.max(0, (lampFactor - th) / 0.15));
  return t * t * (3 - 2 * t);
}

export interface Candidate {
  /** Squared distance to the viewer. */
  d2: number;
  /** Importance (≥ 0.01); doubles the effective reach at 2. */
  priority: number;
  /** Already holds a real light (gets a hysteresis bonus). */
  assigned: boolean;
  /** Eligible at all (lit, within range). */
  active: boolean;
}

/** Score: lower is better. Squared distance divided by priority², with a bonus for incumbents. */
export function lightScore(c: Candidate, hysteresis = 0.75): number {
  const p = Math.max(0.01, c.priority);
  return (c.d2 / (p * p)) * (c.assigned ? hysteresis : 1);
}

/**
 * Indices of the best `n` active candidates (unordered). O(m·n), fine for hundreds of lamps; the
 * pool only calls it a few times per second.
 */
export function selectLights(cands: readonly Candidate[], n: number, hysteresis = 0.75, out: number[] = []): number[] {
  out.length = 0;
  const scores: number[] = [];
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i];
    if (!c.active) continue;
    const s = lightScore(c, hysteresis);
    if (out.length < n) {
      out.push(i);
      scores.push(s);
      continue;
    }
    let worst = 0;
    for (let k = 1; k < n; k++) if (scores[k] > scores[worst]) worst = k;
    if (s < scores[worst]) {
      out[worst] = i;
      scores[worst] = s;
    }
  }
  return out;
}

/** Simple string/number hash → [0, 1). */
export function seed01(n: number): number {
  let h = (n * 0x9e3779b1) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
