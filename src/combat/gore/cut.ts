/**
 * Cutting an indexed triangle mesh along a plane (pure: arrays in, arrays out, so it runs in tests).
 *
 * Used by the severing of the realistic bodies (dismember.ts): every vertex has a signed distance
 * `g` to the cut plane; > 0 goes with the piece, <= 0 stays on the body. Triangles that straddle the
 * plane are split on it, so the cut is clean wherever it falls, and the rim comes back as closed
 * loops of the new vertices for the flesh caps. The new vertices are described by the edge they sit
 * on, so the caller interpolates whatever attributes it has (position, normal, UV, ...) and takes
 * the skin weights from the end it wants.
 */

export interface CutResult {
  /** Triangles that stay (indices into the original vertices, or n + k for new vertex k). */
  body: number[];
  /** Triangles that go (same index space). */
  piece: number[];
  /** New vertices: lerp(original a, original b, t); a is the piece-side end, b the body-side end. */
  extra: { a: number; b: number; t: number }[];
  /** The rim: closed loops of new-vertex ids (n + k), in the winding of the piece's boundary. */
  rim: number[][];
}

/**
 * Split `index` along the plane. `g.length` is the original vertex count n. With `position` (xyz per
 * vertex) the rim is chained through vertices at the same place (a UV seam duplicates vertices; the
 * loop would otherwise break there); each loop then lists one new vertex per place.
 */
export function cutMesh(index: ArrayLike<number>, g: ArrayLike<number>, position?: ArrayLike<number>): CutResult {
  const n = g.length;
  const out: CutResult = { body: [], piece: [], extra: [], rim: [] };
  const made = new Map<number, number>();
  const split = (a: number, b: number): number => {
    // a is the piece-side end (g > 0), b the body-side one (g <= 0)
    const key = a * n + b;
    let id = made.get(key);
    if (id === undefined) {
      id = n + out.extra.length;
      out.extra.push({ a, b, t: g[a] / (g[a] - g[b]) });
      made.set(key, id);
    }
    return id;
  };
  const next = new Map<number, number>();
  for (let i = 0; i + 2 < index.length; i += 3) {
    const v = [index[i], index[i + 1], index[i + 2]];
    const pos = v.map((x) => g[x] > 0);
    const count = (pos[0] ? 1 : 0) + (pos[1] ? 1 : 0) + (pos[2] ? 1 : 0);
    if (count === 0) {
      out.body.push(v[0], v[1], v[2]);
      continue;
    }
    if (count === 3) {
      out.piece.push(v[0], v[1], v[2]);
      continue;
    }
    if (count === 1) {
      // Rotate so the piece-side vertex is first: a (piece), b, c (body).
      const k = pos.indexOf(true);
      const a = v[k];
      const b = v[(k + 1) % 3];
      const c = v[(k + 2) % 3];
      const x = split(a, b);
      const y = split(a, c);
      out.piece.push(a, x, y);
      out.body.push(x, b, c, x, c, y);
      next.set(x, y);
    } else {
      // Rotate so the body-side vertex is first: a (body), b, c (piece).
      const k = pos.indexOf(false);
      const a = v[k];
      const b = v[(k + 1) % 3];
      const c = v[(k + 2) % 3];
      const x = split(b, a);
      const y = split(c, a);
      out.piece.push(x, b, c, x, c, y);
      out.body.push(a, x, y);
      next.set(y, x);
    }
  }
  // Weld new vertices by place (seams), then chain the segments into loops.
  if (position) {
    const canon = new Map<string, number>();
    const rep = new Map<number, number>();
    const q = (v: number) => Math.round(v * 1e5);
    out.extra.forEach((e, k) => {
      const x = position[e.a * 3] * (1 - e.t) + position[e.b * 3] * e.t;
      const y = position[e.a * 3 + 1] * (1 - e.t) + position[e.b * 3 + 1] * e.t;
      const z = position[e.a * 3 + 2] * (1 - e.t) + position[e.b * 3 + 2] * e.t;
      const key = `${q(x)},${q(y)},${q(z)}`;
      const first = canon.get(key);
      if (first === undefined) canon.set(key, n + k);
      rep.set(n + k, first ?? n + k);
    });
    const welded = new Map<number, number>();
    for (const [a, b] of next) {
      const ra = rep.get(a)!;
      const rb = rep.get(b)!;
      if (ra !== rb) welded.set(ra, rb);
    }
    next.clear();
    for (const [a, b] of welded) next.set(a, b);
  }
  const seen = new Set<number>();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop: number[] = [];
    let cur: number | undefined = start;
    while (cur !== undefined && !seen.has(cur)) {
      seen.add(cur);
      loop.push(cur);
      cur = next.get(cur);
    }
    if (loop.length >= 3) out.rim.push(loop);
  }
  return out;
}

/** Fan triangles closing a loop around a centre vertex `c` (indices `loop[i]`, winding as listed). */
export function capFan(loop: readonly number[], c: number, flip: boolean): number[] {
  const t: number[] = [];
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    if (flip) t.push(c, b, a);
    else t.push(c, a, b);
  }
  return t;
}
