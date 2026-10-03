/**
 * Small, dependency-free noise and image helpers for procedural textures. Everything here is
 * pure (no DOM), deterministic for a seed and TILEABLE: sampling at x and x + period gives the
 * same value, so the canvas textures built from it repeat without seams.
 */

/** Mulberry32: tiny seeded PRNG returning floats in [0, 1). */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fade = (t: number) => t * t * (3 - 2 * t);

/**
 * Tileable 2D value noise with an integer lattice of `px × py` cells.
 * Returns a sampler over [0, px) × [0, py) (wrapping outside), output in [0, 1].
 */
export function valueNoise2D(seed: number, px: number, py = px): (x: number, y: number) => number {
  const rnd = prng(seed);
  const pw = Math.max(1, Math.floor(px));
  const ph = Math.max(1, Math.floor(py));
  const grid = new Float32Array(pw * ph);
  for (let i = 0; i < grid.length; i++) grid[i] = rnd();
  return (x: number, y: number) => {
    const xf = Math.floor(x);
    const yf = Math.floor(y);
    const fx = fade(x - xf);
    const fy = fade(y - yf);
    const x0 = ((xf % pw) + pw) % pw;
    const y0 = ((yf % ph) + ph) % ph;
    const x1 = (x0 + 1) % pw;
    const y1 = (y0 + 1) % ph;
    const a = grid[y0 * pw + x0];
    const b = grid[y0 * pw + x1];
    const c = grid[y1 * pw + x0];
    const d = grid[y1 * pw + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

/**
 * Tileable fractal noise over the unit square: `u, v` in [0, 1) map to one full period.
 * `fx`/`fy` lattice cells across at the first octave (fy defaults to fx); each octave doubles
 * them. Output ≈ [0, 1].
 */
export function fbm2D(seed: number, fx: number, octaves = 4, gain = 0.5, fy = fx): (u: number, v: number) => number {
  const layers: { fx: number; fy: number; amp: number; n: (x: number, y: number) => number }[] = [];
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const lx = Math.max(1, Math.round(fx * 2 ** o));
    const ly = Math.max(1, Math.round(fy * 2 ** o));
    layers.push({ fx: lx, fy: ly, amp, n: valueNoise2D(seed + o * 1013, lx, ly) });
    total += amp;
    amp *= gain;
  }
  return (u: number, v: number) => {
    let s = 0;
    for (const l of layers) s += l.n(u * l.fx, v * l.fy) * l.amp;
    return s / total;
  };
}

/** Integer hash → [0, 1) (for per-cell random values). */
export function hash2(a: number, b: number, seed = 0): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(seed | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Fill a w×h float field from a function of normalised (u, v) in [0, 1); row 0 is v = 0. */
export function field(w: number, h: number, fn: (u: number, v: number, x: number, y: number) => number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = fn(x / w, y / h, x, y);
  return out;
}

/**
 * Tangent-space normal map (OpenGL convention: +X along u, +Y along v) from a height field that
 * wraps at its edges. Rows run UP the texture (row 0 is v = 0), which is how `DataTexture`
 * uploads data. `strength` scales the slopes (height units per pixel). Returns RGBA bytes.
 */
export function heightToNormal(height: Float32Array, w: number, h: number, strength = 2): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const ym = ((y - 1 + h) % h) * w;
    const yp = ((y + 1) % h) * w;
    for (let x = 0; x < w; x++) {
      const xm = (x - 1 + w) % w;
      const xp = (x + 1) % w;
      const dx = (height[y * w + xp] - height[y * w + xm]) * 0.5 * strength;
      const dy = (height[yp + x] - height[ym + x]) * 0.5 * strength;
      let nx = -dx;
      let ny = -dy;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (y * w + x) * 4;
      out[i] = (nx * 0.5 + 0.5) * 255;
      out[i + 1] = (ny * 0.5 + 0.5) * 255;
      out[i + 2] = (nz * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

/** Linear-space conversion helpers (for computing average albedo of generated maps). */
export const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export const linearToSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/** Hex 0xRRGGBB → [r, g, b] in 0..255. */
export function hexRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

/** Mix two RGB triples. */
export function mixRgb(a: readonly number[], b: readonly number[], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
