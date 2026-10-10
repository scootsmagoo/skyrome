/**
 * A route polyline in game metres (pure): x, y, z per point in one growable Float32Array, with
 * cumulative plan (xz) lengths for "how far along" queries. y is NaN where the height is unknown
 * (street legs; the in-world guide asks the nav grid when it places a mark).
 */

export interface Closest {
  /** Segment index (point i to i + 1). */
  seg: number;
  /** Position on the segment, 0..1. */
  t: number;
  /** Plan distance from the query point. */
  d: number;
  /** Distance along the line to the closest point. */
  along: number;
}

export interface PointOnLine {
  x: number;
  y: number;
  z: number;
  /** Unit plan direction of the segment there. */
  dx: number;
  dz: number;
}

export function closest(): Closest {
  return { seg: 0, t: 0, d: Infinity, along: 0 };
}

export class Polyline {
  pts: Float32Array;
  cum: Float32Array;
  n = 0;

  constructor(capacity = 64) {
    this.pts = new Float32Array(capacity * 3);
    this.cum = new Float32Array(capacity);
  }

  get length(): number {
    return this.n ? this.cum[this.n - 1] : 0;
  }

  clear(): this {
    this.n = 0;
    return this;
  }

  /** Append a point; one within `minGap` m (plan) of the last is merged into it. */
  push(x: number, y: number, z: number, minGap = 0.4): this {
    if (this.n > 0) {
      const k = (this.n - 1) * 3;
      if (Math.hypot(x - this.pts[k], z - this.pts[k + 2]) < minGap) {
        // Keep the later height when the earlier one was unknown.
        if (Number.isNaN(this.pts[k + 1])) this.pts[k + 1] = y;
        return this;
      }
    }
    if (this.n >= this.cum.length) this.grow();
    const k = this.n * 3;
    this.pts[k] = x;
    this.pts[k + 1] = y;
    this.pts[k + 2] = z;
    this.cum[this.n] = this.n ? this.cum[this.n - 1] + Math.hypot(x - this.pts[k - 3], z - this.pts[k - 1]) : 0;
    this.n++;
    return this;
  }

  private grow() {
    const p = new Float32Array(this.pts.length * 2);
    p.set(this.pts);
    const c = new Float32Array(this.cum.length * 2);
    c.set(this.cum);
    this.pts = p;
    this.cum = c;
  }

  x(i: number) {
    return this.pts[i * 3];
  }
  y(i: number) {
    return this.pts[i * 3 + 1];
  }
  z(i: number) {
    return this.pts[i * 3 + 2];
  }

  /**
   * The closest point to (x, z) on segments [from, to) (all by default). Writes and returns `out`.
   * A single point counts as a segment of length 0. With `y`, a height difference counts too where
   * the line knows its heights (`out.d` stays the plan distance): on a spiral stair every turn has
   * the same plan, and only the height tells your turn from the one above.
   */
  closest(x: number, z: number, out: Closest, from = 0, to = this.n - 1, y = NaN): Closest {
    out.d = Infinity;
    out.seg = 0;
    out.t = 0;
    out.along = 0;
    if (this.n === 0) return out;
    if (this.n === 1) {
      out.d = Math.hypot(x - this.pts[0], z - this.pts[2]);
      return out;
    }
    const a0 = Math.max(0, from);
    const a1 = Math.min(this.n - 1, to);
    const p = this.pts;
    let best = Infinity;
    for (let i = a0; i < a1; i++) {
      const ax = p[i * 3];
      const az = p[i * 3 + 2];
      const bx = p[i * 3 + 3];
      const bz = p[i * 3 + 5];
      const ex = bx - ax;
      const ez = bz - az;
      const l2 = ex * ex + ez * ez;
      const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2)) : 0;
      const qx = ax + ex * t - x;
      const qz = az + ez * t - z;
      let d2 = qx * qx + qz * qz;
      if (!Number.isNaN(y)) {
        const ya = p[i * 3 + 1];
        const yb = p[i * 3 + 4];
        // Height counts double: a turn of the stair above is farther than a step aside.
        if (!Number.isNaN(ya) && !Number.isNaN(yb)) d2 += (ya + (yb - ya) * t - y) ** 2 * 4;
      }
      if (d2 < best) {
        best = d2;
        out.seg = i;
        out.t = t;
      }
    }
    {
      const k = out.seg * 3;
      out.d = Math.hypot(p[k] + (p[k + 3] - p[k]) * out.t - x, p[k + 2] + (p[k + 5] - p[k + 2]) * out.t - z);
    }
    out.along = this.cum[out.seg] + (this.cum[out.seg + 1] - this.cum[out.seg]) * out.t;
    return out;
  }

  /** The point `along` metres down the line (clamped to its ends). Writes and returns `out`. */
  pointAt(along: number, out: PointOnLine): PointOnLine {
    const n = this.n;
    if (n === 0) {
      out.x = out.y = out.z = 0;
      out.dx = 0;
      out.dz = 1;
      return out;
    }
    if (n === 1 || along <= 0) return this.write(0, 0, out);
    if (along >= this.cum[n - 1]) return this.write(n - 2, 1, out);
    // Binary search for the segment.
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] <= along) lo = mid;
      else hi = mid;
    }
    const len = this.cum[lo + 1] - this.cum[lo];
    return this.write(lo, len > 1e-6 ? (along - this.cum[lo]) / len : 0, out);
  }

  private write(seg: number, t: number, out: PointOnLine): PointOnLine {
    const p = this.pts;
    const k = seg * 3;
    if (this.n === 1) {
      out.x = p[0];
      out.y = p[1];
      out.z = p[2];
      out.dx = 0;
      out.dz = 1;
      return out;
    }
    const ex = p[k + 3] - p[k];
    const ez = p[k + 5] - p[k + 2];
    out.x = p[k] + ex * t;
    out.z = p[k + 2] + ez * t;
    const ya = p[k + 1];
    const yb = p[k + 4];
    out.y = Number.isNaN(ya) ? yb : Number.isNaN(yb) ? ya : ya + (yb - ya) * t;
    const l = Math.hypot(ex, ez);
    out.dx = l > 1e-6 ? ex / l : 0;
    out.dz = l > 1e-6 ? ez / l : 1;
    return out;
  }

  /** Copy another line into this one. */
  copy(o: Polyline): this {
    this.clear();
    while (this.cum.length < o.n) this.grow();
    this.pts.set(o.pts.subarray(0, o.n * 3));
    this.cum.set(o.cum.subarray(0, o.n));
    this.n = o.n;
    return this;
  }
}
