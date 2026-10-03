/**
 * Procedural UI textures (canvas → blob URL → CSS custom property). Generated once at install:
 * tileable parchment (fibers, blotches, foxing) and a fine film grain for dark panels.
 */

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Tileable value noise on a `period`-cell lattice. */
function valueNoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf);
  const sy = yf * yf * (3 - 2 * yf);
  const m = (v: number) => ((v % period) + period) % period;
  const a = hash(m(xi), m(yi), seed);
  const b = hash(m(xi + 1), m(yi), seed);
  const c = hash(m(xi), m(yi + 1), seed);
  const d = hash(m(xi + 1), m(yi + 1), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x: number, y: number, size: number, baseCells: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let cells = baseCells;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise((x / size) * cells, (y / size) * cells, cells, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    cells *= 2;
  }
  return sum / norm;
}

function toUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve) => {
    if (canvas.toBlob) canvas.toBlob((b) => resolve(b ? URL.createObjectURL(b) : canvas.toDataURL()), 'image/png');
    else resolve(canvas.toDataURL());
  });
}

/** Warm parchment tile (multiply-friendly: mostly light with darker mottling and fibers). */
export function parchmentCanvas(size = 384, seed = 7): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  const base = [233, 220, 190];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const blot = fbm(x, y, size, 3, 4, seed); // large mottling
      const fine = fbm(x, y, size, 24, 2, seed + 101); // paper tooth
      // Fibers: stretched noise along x.
      const fiber = valueNoise((x / size) * 6, (y / size) * 96, 6, seed + 33) * valueNoise((x / size) * 12, (y / size) * 160, 12, seed + 34);
      let k = 1 - (blot - 0.5) * 0.16 - (fine - 0.5) * 0.07 - Math.max(0, fiber - 0.45) * 0.12;
      // Occasional foxing spots.
      const fox = fbm(x, y, size, 10, 3, seed + 77);
      if (fox > 0.68) k -= (fox - 0.68) * 0.5;
      const i = (y * size + x) * 4;
      img.data[i] = Math.min(255, base[0] * k);
      img.data[i + 1] = Math.min(255, base[1] * k * (1 - (1 - k) * 0.25));
      img.data[i + 2] = Math.min(255, base[2] * k * (1 - (1 - k) * 0.6));
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Transparent film grain for dark panels (subtle luminance noise). */
function grainCanvas(size = 192, seed = 3): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = hash(x, y, seed);
      const m = fbm(x, y, size, 4, 3, seed + 5);
      const i = (y * size + x) * 4;
      const v = n > 0.5 ? 255 : 0;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = Math.abs(n - 0.5) * 22 + m * 10;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

let installed: Promise<void> | null = null;
let parchment: HTMLCanvasElement | null = null;

/** Parchment canvas for the map renderer (pattern fill). */
export function parchmentTile(): HTMLCanvasElement {
  return (parchment ??= parchmentCanvas());
}

/** Generates the textures once and exposes them as CSS variables on :root. */
export function installTextures(): Promise<void> {
  if (installed) return installed;
  installed = (async () => {
    const root = document.documentElement.style;
    const [p, gr] = await Promise.all([toUrl(parchmentTile()), toUrl(grainCanvas())]);
    root.setProperty('--sr-tex-parchment', `url("${p}")`);
    root.setProperty('--sr-tex-grain', `url("${gr}")`);
  })();
  return installed;
}
