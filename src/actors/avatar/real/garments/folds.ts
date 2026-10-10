/**
 * Cloth fold shapes, pure maths (no three.js): coherent drapery instead of fold noise.
 *
 * Cloth that hangs from a line falls in rounded ridges (pillar folds) between sharp valleys. A fold's
 * profile across its width is |sin|: round on top, a crease at the bottom. The folds are not ruler-straight:
 * their phase drifts slowly with height and sideways (some lean), and they grow deeper the further the
 * cloth falls from where it is held.
 */

/** Ridge height in [0, 1] for a phase in radians: 1 on the crest, 0 in the crease; period PI. */
export function ridge(phase: number): number {
  // Thick wool folds in rounded pillars: a blend of |sin| (a crease in the valley) and a pure sinusoid.
  return 0.55 * Math.abs(Math.sin(phase)) + 0.45 * (0.5 - 0.5 * Math.cos(2 * phase));
}

/** Smooth value noise in [-1, 1] (deterministic). */
export function vnoise(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const h = (n: number) => {
    const s = Math.sin((n + seed * 17.13) * 127.1) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}

/**
 * Fold phase around a skirt: `th` the angle round the body (radians), `t` how far down the hang (0 held,
 * 1 the hem), `n` the number of folds round the whole circumference. Returns the phase for `ridge`
 * (a crest every PI), drifting with height so the folds lean a little and merge or part as they fall.
 */
export function foldPhase(th: number, t: number, n: number, seed: number): number {
  const warp = 0.55 * vnoise(th * 1.1 + seed, seed) + 0.25 * t * Math.sin(th * 2 + seed * 2);
  return ((th + warp) * n) / 2 + seed;
}

/** Depth envelope of the folds with the hang: shallow at the waist, full toward the hem, uneven round the body. */
export function foldDepth(th: number, t: number, seed: number): number {
  const grow = 0.2 + 0.8 * t * t * (3 - 2 * t);
  return grow * (0.75 + 0.35 * vnoise(th * 1.7 + 3, seed));
}
