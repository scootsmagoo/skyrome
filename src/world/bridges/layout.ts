/**
 * Pure layout of a Tiber bridge along its axis (no Three.js): where the arches and piers go, how
 * high they spring, and the deck profile with its approach ramps. Everything is in GAME metres in
 * the bridge's own 1D frame: `u` runs along the axis from the atlas end A (u = 0) to end B
 * (u = length); heights are absolute game y.
 *
 * The deck is the lowest surface that clears every arch (extrados + fill) and the ground, with a
 * grade no steeper than `grade` (a "cone envelope" of the requirements), lightly smoothed. Where
 * it still stands above the ground at the atlas ends, ramps carry on beyond them until they meet
 * the street.
 */

export interface BridgeArchSpec {
  /** Clear spans of the arches (REAL metres), bank A to bank B. Empty for timber trestles. */
  spans: number[];
  /** Pier widths between arches (REAL metres), spans.length − 1 entries. */
  piers: number[];
  /** Rise / span of the (segmental) arches; 0.5 = semicircular. */
  riseRatio: number;
  /** Indices of piers pierced by a flood-relief arch. */
  reliefPiers?: number[];
}

export interface ArchLayout {
  /** Clear opening between the pier faces. */
  u0: number;
  u1: number;
  /** Springing line (pier top / impost). */
  spring: number;
  rise: number;
  /** Radius and centre height of the intrados circle. */
  radius: number;
  centreY: number;
  /** Voussoir ring depth. */
  ring: number;
}

export interface PierLayout {
  u0: number;
  u1: number;
  /** Foundation bottom (below the river bed). */
  bottom: number;
  relief: boolean;
}

export interface BridgeLayout {
  /** Arcade extent (outer faces of the end arches' springings). */
  arcade: [number, number];
  arches: ArchLayout[];
  piers: PierLayout[];
  /** Deck top profile, sorted by u, from the start of the A-side ramp to the end of the B-side ramp. */
  deck: [number, number][];
  /** Where the deck meets the ground (ramp feet), u. */
  start: number;
  end: number;
  /** The highest deck point. */
  crown: [number, number];
}

export interface LayoutInput {
  /** Bridge length between the atlas ends (game m). */
  length: number;
  /** Ground height (game y) at u — may be called outside [0, length]. */
  ground: (u: number) => number;
  waterY: number;
  /** Scale from real to game metres (WORLD_SCALE). */
  S: number;
  arches: BridgeArchSpec;
  /** Springing height above the water (game m). */
  springAbove?: number;
  /** Fill between the extrados and the deck at the crown (game m). */
  fill?: number;
  /** Max deck grade (rise / run). */
  grade?: number;
  /** For timber bridges: fixed deck height above the water. */
  deckAbove?: number;
}

/** Intrados height of an arch at u (or null outside its opening). */
export function intradosAt(a: ArchLayout, u: number): number | null {
  if (u < a.u0 || u > a.u1) return null;
  const c = (a.u0 + a.u1) / 2;
  const dx = u - c;
  return a.centreY + Math.sqrt(Math.max(0, a.radius * a.radius - dx * dx));
}

/** Extrados (top of the voussoir ring) at u, following a circle `ring` larger than the intrados. */
export function extradosAt(a: ArchLayout, u: number): number | null {
  const c = (a.u0 + a.u1) / 2;
  const R = a.radius + a.ring;
  const dx = u - c;
  if (Math.abs(dx) > R) return null;
  return a.centreY + Math.sqrt(Math.max(0, R * R - dx * dx));
}

/** Segmental arch from span and rise: radius and centre below the springing line. */
export function segmentalArch(span: number, rise: number): { radius: number; drop: number } {
  const radius = (span * span) / 4 / (2 * rise) + rise / 2;
  return { radius, drop: radius - rise };
}

/**
 * Fit the arcade to the channel: find the wet interval along the axis, centre the arcade on it
 * and scale the spans up if the wet channel is wider than the historical arcade.
 */
export function layoutBridge(inp: LayoutInput): BridgeLayout {
  const { length, ground, waterY, S } = inp;
  const step = 0.5;
  // Wet interval: ground below the water (+ a margin) inside [0, length].
  let w0 = Infinity;
  let w1 = -Infinity;
  for (let u = 0; u <= length; u += step) {
    if (ground(u) < waterY + 0.25) {
      w0 = Math.min(w0, u);
      w1 = Math.max(w1, u);
    }
  }
  if (!Number.isFinite(w0)) {
    w0 = length * 0.15;
    w1 = length * 0.85;
  }
  const spec = inp.arches;
  const arches: ArchLayout[] = [];
  const piers: PierLayout[] = [];
  const springAbove = inp.springAbove ?? 0.35;
  const spring = waterY + springAbove;
  const fill = inp.fill ?? 0.35;
  const bed = (u: number) => Math.min(ground(u), waterY - 0.5);
  let arcade: [number, number];
  const req: [number, number][] = [];

  if (spec.spans.length > 0) {
    let spans = spec.spans.map((s) => s * S);
    let pw = spec.piers.map((p) => p * S);
    let La = spans.reduce((a, b) => a + b, 0) + pw.reduce((a, b) => a + b, 0);
    const wet = w1 - w0 + 2;
    if (wet > La) {
      const k = wet / La;
      spans = spans.map((s) => s * k);
      pw = pw.map((p) => p * k);
      La = wet;
    }
    let a0 = (w0 + w1) / 2 - La / 2;
    // Keep the arcade inside the bridge where it fits (abutments on the banks).
    if (La <= length) a0 = Math.min(Math.max(a0, 0), length - La);
    arcade = [a0, a0 + La];
    let u = a0;
    spans.forEach((span, i) => {
      const rise = span * spec.riseRatio;
      const { radius, drop } = segmentalArch(span, rise);
      const ring = Math.max(0.45, span * 0.07);
      arches.push({ u0: u, u1: u + span, spring, rise, radius, centreY: spring - drop, ring });
      u += span;
      if (i < pw.length) {
        let lo = Infinity;
        for (let x = u; x <= u + pw[i]; x += 0.5) lo = Math.min(lo, bed(x));
        piers.push({ u0: u, u1: u + pw[i], bottom: lo - 0.6, relief: spec.reliefPiers?.includes(i) ?? false });
        u += pw[i];
      }
    });
    // Requirement points: every arch's extrados + fill, and one continuous gentle hump over the
    // whole arcade (no dips over the piers), falling ~3% towards its ends.
    let crownMax = -Infinity;
    for (const a of arches) {
      for (let x = a.u0 - a.ring; x <= a.u1 + a.ring; x += step) {
        const e = extradosAt(a, x);
        if (e !== null) req.push([x, e + fill]);
      }
      crownMax = Math.max(crownMax, a.centreY + a.radius + a.ring + fill);
    }
    const mid = (arcade[0] + arcade[1]) / 2;
    const halfLen = (arcade[1] - arcade[0]) / 2;
    const hump = 0.015 * halfLen;
    for (let x = arcade[0]; x <= arcade[1]; x += step) {
      const t = (x - mid) / halfLen;
      req.push([x, crownMax - hump * t * t]);
    }
  } else {
    // Timber trestle: a level deck over the whole wet channel.
    arcade = [w0 - 1, w1 + 1];
    const top = waterY + (inp.deckAbove ?? 2.8);
    for (let x = arcade[0]; x <= arcade[1]; x += step) req.push([x, top]);
  }

  // Deck: cone envelope of the requirements and the ground (bridge always clears the ground
  // between its ends), then smoothed and clamped back above the requirements.
  const grade = inp.grade ?? 0.18;
  for (let x = 0; x <= length; x += step) req.push([x, ground(x) + 0.25]);
  const env = (x: number) => {
    let h = -Infinity;
    for (const [rx, ry] of req) h = Math.max(h, ry - grade * Math.abs(x - rx));
    return h;
  };
  // March outward from the ends until the deck meets the ground.
  let start = 0;
  while (start > -80 && env(start) > ground(start) + 0.08) start -= step;
  let end = length;
  while (end < length + 80 && env(end) > ground(end) + 0.08) end += step;
  const raw: [number, number][] = [];
  for (let x = start; x <= end + 1e-6; x += step) raw.push([x, Math.max(env(x), ground(x) + 0.05)]);
  // Smooth over ~3 m (round the kinks of the cone envelope), then re-clamp.
  const win = 3;
  const deck: [number, number][] = raw.map(([x], i) => {
    let s = 0;
    let c = 0;
    for (let k = -win; k <= win; k++) {
      const p = raw[Math.min(raw.length - 1, Math.max(0, i + k))];
      s += p[1];
      c++;
    }
    return [x, s / c];
  });
  for (let i = 0; i < deck.length; i++) deck[i][1] = Math.max(deck[i][1], raw[i][1]);
  let crown: [number, number] = deck[0];
  for (const p of deck) if (p[1] > crown[1]) crown = p;
  return { arcade, arches, piers, deck, start, end, crown };
}

/** Deck height at u (linear interpolation in the profile; clamped at the ends). */
export function deckAt(deck: readonly [number, number][], u: number): number {
  if (u <= deck[0][0]) return deck[0][1];
  for (let i = 1; i < deck.length; i++) {
    if (u <= deck[i][0]) {
      const [x0, y0] = deck[i - 1];
      const [x1, y1] = deck[i];
      return y0 + ((y1 - y0) * (u - x0)) / (x1 - x0 || 1);
    }
  }
  return deck[deck.length - 1][1];
}

/** Steepest grade of the deck (rise / run) — for tests and walkability checks. */
export function maxGrade(deck: readonly [number, number][]): number {
  let g = 0;
  for (let i = 1; i < deck.length; i++) g = Math.max(g, Math.abs(deck[i][1] - deck[i - 1][1]) / Math.max(1e-6, deck[i][0] - deck[i - 1][0]));
  return g;
}

/**
 * Simplify a deck profile into straight runs (for ramp colliders and parapet segments): greedy,
 * keeping every point whose deviation from the chord exceeds `tol`.
 */
export function simplifyProfile(pts: readonly [number, number][], tol = 0.06): [number, number][] {
  if (pts.length <= 2) return pts.map((p) => [p[0], p[1]]);
  const out: [number, number][] = [[pts[0][0], pts[0][1]]];
  let a = 0;
  while (a < pts.length - 1) {
    let b = a + 1;
    for (let c = a + 2; c < pts.length; c++) {
      let ok = true;
      const [x0, y0] = pts[a];
      const [x1, y1] = pts[c];
      for (let k = a + 1; k < c; k++) {
        const t = (pts[k][0] - x0) / (x1 - x0 || 1);
        if (Math.abs(y0 + (y1 - y0) * t - pts[k][1]) > tol) {
          ok = false;
          break;
        }
      }
      if (!ok) break;
      b = c;
    }
    out.push([pts[b][0], pts[b][1]]);
    a = b;
  }
  return out;
}
