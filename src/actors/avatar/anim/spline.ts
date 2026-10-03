/**
 * Monotone cubic Hermite interpolation (Fritsch–Carlson). Used to bake key poses into dense clips:
 * motion flows smoothly through keys that continue in the same direction, stops at keys where it
 * reverses (natural extremes), and never overshoots a key (so joint limits hold between keys).
 */

export interface CurveOptions {
  /** Treat the curve as periodic with this period (keys must lie in [0, period]). */
  period?: number;
  /** Indices of keys that should have zero velocity (holds, accents). */
  holds?: ReadonlySet<number>;
}

export class MonotoneCurve {
  private t: number[];
  private y: number[];
  private m: number[];
  private period?: number;

  constructor(times: readonly number[], values: readonly number[], opts: CurveOptions = {}) {
    if (times.length !== values.length || times.length === 0) throw new Error('MonotoneCurve: bad input');
    let t = [...times];
    let y = [...values];
    this.period = opts.period;
    const holds = opts.holds;
    let offset = 0;
    if (opts.period !== undefined && t.length > 1) {
      // Pad with wrapped neighbours so tangents at the ends are periodic.
      const P = opts.period;
      const n = t.length;
      const lastIsDup = Math.abs(t[n - 1] - t[0] - P) < 1e-6;
      const core = lastIsDup ? n - 1 : n;
      const tt: number[] = [t[core - 1] - P];
      const yy: number[] = [y[core - 1]];
      for (let i = 0; i < core; i++) {
        tt.push(t[i]);
        yy.push(y[i]);
      }
      tt.push(t[0] + P, t[1 % core] + P * (1 % core === 0 ? 2 : 1));
      yy.push(y[0], y[1 % core]);
      t = tt;
      y = yy;
      offset = 1;
    }
    const n = t.length;
    const d: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      const dt = t[i + 1] - t[i];
      d.push(dt > 1e-9 ? (y[i + 1] - y[i]) / dt : 0);
    }
    const m = new Array<number>(n).fill(0);
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    // Non-periodic ends start and stop at rest.
    m[0] = opts.period !== undefined ? d[0] : 0;
    m[n - 1] = opts.period !== undefined ? d[n - 2] : 0;
    if (holds) for (const h of holds) if (h + offset < n) m[h + offset] = 0;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) {
        m[i] = 0;
        m[i + 1] = 0;
        continue;
      }
      const a = m[i] / d[i];
      const b = m[i + 1] / d[i];
      const s = a * a + b * b;
      if (s > 9) {
        const tau = 3 / Math.sqrt(s);
        m[i] = tau * a * d[i];
        m[i + 1] = tau * b * d[i];
      }
    }
    this.t = t;
    this.y = y;
    this.m = m;
  }

  eval(x: number): number {
    const { t, y, m } = this;
    if (this.period !== undefined) {
      const P = this.period;
      x = ((x % P) + P) % P;
    }
    const n = t.length;
    if (n === 1) return y[0];
    if (x <= t[0]) return y[0];
    if (x >= t[n - 1]) return y[n - 1];
    // Binary search for the segment.
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (t[mid] <= x) lo = mid;
      else hi = mid;
    }
    const h = t[hi] - t[lo];
    if (h <= 1e-9) return y[hi];
    const s = (x - t[lo]) / h;
    const s2 = s * s;
    const s3 = s2 * s;
    return (
      (2 * s3 - 3 * s2 + 1) * y[lo] + (s3 - 2 * s2 + s) * h * m[lo] + (-2 * s3 + 3 * s2) * y[hi] + (s3 - s2) * h * m[hi]
    );
  }
}

/** Smooth 0→1 ramps used by procedural animation. */
export const smooth01 = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
export const ease = {
  in: (x: number) => x * x,
  out: (x: number) => 1 - (1 - x) * (1 - x),
  inOut: smooth01,
};
