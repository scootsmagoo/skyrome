/**
 * Road regrading (phase 4b, GROUND part 2; docs/design/solid-ground.md §3 item 3): the smallest
 * cut and fill that keeps a road's profile under a grade. Moved here from the W6 grades audit
 * (`src/dev/audit/grades.ts` `regrade`, which keeps its own copy for the audit's what-ifs) so the
 * terrain can use it without importing dev code. Pure, no Three.js.
 */

/**
 * The smallest change to a profile that keeps every grade under `maxGrade` (Chebyshev-optimal):
 * the mean of its largest G-Lipschitz minorant and smallest G-Lipschitz majorant. `s` is the
 * distance along the line (increasing), `y` the heights. Returns the new heights and the deepest
 * cut / highest fill. Any units, as long as `s` and `y` share them (the grade is a ratio).
 */
export function regrade(s: ArrayLike<number>, y: ArrayLike<number>, maxGrade: number): { y: Float64Array; cut: number; fill: number } {
  const n = y.length;
  const lo = Float64Array.from(y as ArrayLike<number>), hi = Float64Array.from(y as ArrayLike<number>);
  for (let i = 1; i < n; i++) {
    const d = (s[i] - s[i - 1]) * maxGrade;
    lo[i] = Math.min(lo[i], lo[i - 1] + d);
    hi[i] = Math.max(hi[i], hi[i - 1] - d);
  }
  for (let i = n - 2; i >= 0; i--) {
    const d = (s[i + 1] - s[i]) * maxGrade;
    lo[i] = Math.min(lo[i], lo[i + 1] + d);
    hi[i] = Math.max(hi[i], hi[i + 1] - d);
  }
  const out = new Float64Array(n);
  let cut = 0, fill = 0;
  for (let i = 0; i < n; i++) {
    out[i] = (lo[i] + hi[i]) / 2;
    const d = out[i] - y[i];
    if (-d > cut) cut = -d;
    if (d > fill) fill = d;
  }
  return { y: out, cut, fill };
}

/** The steepest |rise / run| between consecutive samples of a profile. */
export function maxGrade(s: ArrayLike<number>, y: ArrayLike<number>): number {
  let m = 0;
  for (let i = 1; i < y.length; i++) {
    const run = s[i] - s[i - 1];
    if (run > 1e-9) m = Math.max(m, Math.abs(y[i] - y[i - 1]) / run);
  }
  return m;
}
