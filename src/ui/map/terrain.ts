/**
 * Map terrain rendering helpers (pure): a sampled height grid, Lambert hill shading lit from the
 * north-west (the cartographic convention) and marching-squares contour segments.
 */

export interface HeightGrid {
  /** Samples per row/column. */
  w: number;
  h: number;
  /** Row-major heights (h rows of w samples). */
  data: Float32Array;
  /** World position of sample (0,0) and spacing in game meters. */
  x0: number;
  z0: number;
  cell: number;
}

export function sampleHeights(
  heightAt: (x: number, z: number) => number,
  x0: number,
  z0: number,
  w: number,
  h: number,
  cell: number,
): HeightGrid {
  const data = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) data[j * w + i] = heightAt(x0 + i * cell, z0 + j * cell);
  return { w, h, data, x0, z0, cell };
}

/**
 * Shade per sample in 0..1 (1 = facing the light). Light comes from `azimuth` (compass degrees)
 * at `altitude` degrees. `exaggeration` scales slopes (Rome's hills are gentle).
 */
export function hillshade(g: HeightGrid, azimuth = 315, altitude = 40, exaggeration = 3): Float32Array {
  const out = new Float32Array(g.w * g.h);
  const az = (azimuth * Math.PI) / 180;
  const alt = (altitude * Math.PI) / 180;
  // Light vector in (x east, y up, z south).
  const lx = Math.sin(az) * Math.cos(alt);
  const lz = -Math.cos(az) * Math.cos(alt);
  const ly = Math.sin(alt);
  const at = (i: number, j: number) =>
    g.data[Math.min(g.h - 1, Math.max(0, j)) * g.w + Math.min(g.w - 1, Math.max(0, i))];
  for (let j = 0; j < g.h; j++) {
    for (let i = 0; i < g.w; i++) {
      const dx = ((at(i + 1, j) - at(i - 1, j)) / (2 * g.cell)) * exaggeration;
      const dz = ((at(i, j + 1) - at(i, j - 1)) / (2 * g.cell)) * exaggeration;
      // Normal of y = f(x, z): (−dx, 1, −dz)
      const len = Math.hypot(dx, 1, dz);
      const d = (-dx * lx + ly - dz * lz) / len;
      out[j * g.w + i] = Math.max(0, Math.min(1, d));
    }
  }
  return out;
}

/** Flat ground shade for reference: hillshade value of a level surface. */
export function flatShade(altitude = 40): number {
  return Math.sin((altitude * Math.PI) / 180);
}

/**
 * Contour line segments at `level` via marching squares, in world coordinates:
 * [x1, z1, x2, z2, x1, z1, ...] flattened.
 */
export function contourSegments(g: HeightGrid, level: number): number[] {
  const out: number[] = [];
  const { w, h, data, x0, z0, cell } = g;
  const interp = (a: number, b: number) => (a === b ? 0.5 : (level - a) / (b - a));
  for (let j = 0; j < h - 1; j++) {
    for (let i = 0; i < w - 1; i++) {
      const tl = data[j * w + i];
      const tr = data[j * w + i + 1];
      const br = data[(j + 1) * w + i + 1];
      const bl = data[(j + 1) * w + i];
      const code = (tl > level ? 8 : 0) | (tr > level ? 4 : 0) | (br > level ? 2 : 0) | (bl > level ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const x = x0 + i * cell;
      const z = z0 + j * cell;
      // Edge points: top, right, bottom, left.
      const top = () => [x + interp(tl, tr) * cell, z];
      const right = () => [x + cell, z + interp(tr, br) * cell];
      const bottom = () => [x + interp(bl, br) * cell, z + cell];
      const left = () => [x, z + interp(tl, bl) * cell];
      const seg = (a: number[], b: number[]) => out.push(a[0], a[1], b[0], b[1]);
      switch (code) {
        case 1: case 14: seg(left(), bottom()); break;
        case 2: case 13: seg(bottom(), right()); break;
        case 3: case 12: seg(left(), right()); break;
        case 4: case 11: seg(top(), right()); break;
        case 6: case 9: seg(top(), bottom()); break;
        case 7: case 8: seg(left(), top()); break;
        case 5: seg(left(), top()); seg(bottom(), right()); break;
        case 10: seg(top(), right()); seg(left(), bottom()); break;
      }
    }
  }
  return out;
}

/** Min/max of the grid. */
export function heightRange(g: HeightGrid): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of g.data) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo, hi];
}
