/**
 * The one procedural texture all hair shares, generated once from a seed (no canvas, so tests can run it).
 * 1024 x 1024 RGBA, four regions side by side (u ranges in HAIR_UV):
 *
 *   strand  (u 0 .. 0.25)     a clump of about fifty wavy strands, solid at the root (v = 0) and tapering
 *                             to separate tips toward v = 1: alpha is the card's silhouette, rgb a per-strand
 *                             tone with a highlight ridge;
 *   curl    (u 0.25 .. 0.5)   a clump of tight curls: strands wound in small loops over a soft, rounded
 *                             silhouette. Curly hair and the Trajanic diadem are many small overlapping cards
 *                             of it, so a head reads as a dense mass of curls instead of geometric coils;
 *   plait   (u 0.5 .. 0.75)   an opaque braid: two bundles crossing over each other, ridged, with dark grooves
 *                             (v along the plait, u around the tube);
 *   fade    (u 0.75 .. 1)     streaks along v: continuous noise, long along the hair's direction and fine
 *                             across it. The material keeps the texels whose value is above the vertex's own
 *                             `fade` density, so a scalp cap thins out at the hairline (and a receding crown)
 *                             as fine wisps, not as a stipple of dots.
 */
import * as THREE from 'three';
import { Rng } from '../../../../core/Rng';
import { releaseTextureAfterUpload } from '../../../../gfx/release';

export const HAIR_TEX = { w: 1024, h: 1024 } as const;
/** u ranges of the regions (inset a little so mip levels do not bleed across). */
export const HAIR_UV = {
  strand: [0.006, 0.244],
  curl: [0.256, 0.494],
  plait: [0.506, 0.744],
  fade: [0.756, 0.994],
} as const;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function hash(a: number, b: number): number {
  let n = Math.imul(a + 374761393, 668265263) ^ Math.imul(b + 1274126177, 2246822519);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise on a lattice of (cx, cy) texels, seeded by `s`. */
function noise(x: number, y: number, cx: number, cy: number, s: number): number {
  const fx = x / cx;
  const fy = y / cy;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = smooth(0, 1, fx - ix);
  const ty = smooth(0, 1, fy - iy);
  const a = hash(ix + s, iy);
  const b = hash(ix + 1 + s, iy);
  const c = hash(ix + s, iy + 1);
  const d = hash(ix + 1 + s, iy + 1);
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

/** Pixel data (pure function of the seed). */
export function hairPixels(seed = 7): Uint8Array {
  const { w, h } = HAIR_TEX;
  const data = new Uint8Array(w * h * 4);
  const rng = new Rng(seed);
  const rw = w / 4;
  const put = (x: number, y: number, tone: number, a: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const o = (y * w + x) * 4;
    if (a * 255 < data[o + 3]) return;
    const t = Math.min(255, Math.max(0, tone * 255));
    data[o] = data[o + 1] = data[o + 2] = t;
    data[o + 3] = Math.min(255, a * 255);
  };

  // --- strands
  const N = 50;
  const strands = Array.from({ length: N }, (_, i) => {
    const base = (i + rng.range(0.1, 0.9)) / N;
    return {
      x0: 0.05 + 0.9 * base,
      w0: rng.range(0.9, 1.8),
      end: rng.range(0.5, 1.0),
      amp: rng.range(0.004, 0.03),
      freq: rng.range(2.5, 7),
      phase: rng.range(0, 6.3),
      tone: rng.range(0.55, 1.0),
      pull: rng.range(0.15, 0.55),
    };
  });
  strands.sort((a, b) => a.tone - b.tone);
  for (const s of strands) {
    for (let y = 0; y < h; y++) {
      const v = y / (h - 1);
      if (v > s.end) break;
      const xc = (0.5 + (s.x0 - 0.5) * (1 - s.pull * v) + s.amp * Math.sin(v * s.freq * 2 + s.phase) * (0.3 + v)) * rw;
      const taper = 1 - smooth(s.end - 0.32, s.end, v);
      const half = s.w0 * (0.45 + 0.55 * taper) * (1 - 0.35 * v) * taper;
      if (half < 0.3) continue;
      const x0 = Math.max(0, Math.floor(xc - half - 1));
      const x1 = Math.min(rw - 1, Math.ceil(xc + half + 1));
      for (let x = x0; x <= x1; x++) {
        const d = Math.abs(x + 0.5 - xc);
        const a = Math.min(1, Math.max(0, half + 0.5 - d));
        if (a <= 0) continue;
        // A highlight ridge down the middle of each strand and a darker edge.
        const ridge = 0.85 + 0.15 * (1 - Math.min(1, d / half));
        put(x, y, Math.min(1, s.tone * ridge * (0.82 + 0.3 * v)), a);
      }
    }
  }
  // Solid backing near the root so the card is not see-through where it joins the scalp.
  for (let y = 0; y < Math.floor(h * 0.05); y++) {
    const k = 1 - y / (h * 0.05);
    for (let x = 0; x < rw; x++) {
      const o = (y * w + x) * 4;
      const a = data[o + 3] / 255;
      if (a < k) {
        const t = (0.5 + 0.25 * Math.sin(x * 0.9)) * 255;
        data[o] = data[o + 1] = data[o + 2] = t;
        data[o + 3] = Math.max(a, k) * 255;
      }
    }
  }

  // --- curls: locks wound in small loops (each a chain of circles seen from the side), many overlapping,
  // over a round clump. A card of it is about 2 cm, so a lock is 8 to 14 texels wide and a loop 25 to 50 across.
  {
    const x0 = rw;
    const cx = rw * 0.5;
    const cy = h * 0.5;
    const NCURL = 150;
    const curls = Array.from({ length: NCURL }, () => ({
      ux: 0.5 + (rng.next() - 0.5) * 0.9 * Math.sqrt(rng.next()),
      uy: 0.5 + (rng.next() - 0.5) * 0.92 * Math.sqrt(rng.next()),
      R: rng.range(0.085, 0.19) * rw,
      drift: rng.range(0.02, 0.12) * rw,
      sq: rng.range(0.5, 0.95),
      turns: rng.range(1.2, 2.6),
      phase: rng.range(0, 6.3),
      tone: rng.range(0.42, 1.0),
      w0: rng.range(4, 7),
      dir: rng.range(0, 6.3),
    }));
    curls.sort((a, b) => a.tone - b.tone);
    for (const c of curls) {
      const steps = Math.round(c.turns * 120);
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        const th = c.phase + t * c.turns * Math.PI * 2;
        const dx = c.drift * (t - 0.5) * 2;
        const px = c.ux * rw + Math.cos(th) * c.R + dx * Math.cos(c.dir);
        const py = c.uy * h + Math.sin(th) * c.R * c.sq + dx * Math.sin(c.dir);
        // Lit on the top of each loop, dark where the lock turns under.
        const shade = 0.6 + 0.4 * Math.max(0, -Math.sin(th + 0.4));
        const half = c.w0 * (1 - 0.2 * t);
        const ix = Math.floor(px);
        const iy = Math.floor(py);
        const R = Math.ceil(half) + 1;
        for (let dy = -R; dy <= R; dy++)
          for (let dx2 = -R; dx2 <= R; dx2++) {
            const d = Math.hypot(ix + dx2 + 0.5 - px, iy + dy + 0.5 - py);
            const a = Math.min(1, Math.max(0, half + 0.5 - d));
            if (a <= 0) continue;
            // A highlight ridge along the lock, like the straight strands.
            const ridge = 0.8 + 0.2 * (1 - Math.min(1, d / half));
            put(x0 + ix + dx2, iy + dy, c.tone * shade * ridge, a);
          }
      }
    }
    // A soft, rounded silhouette: curls fade out toward the rim of the clump.
    for (let y = 0; y < h; y++)
      for (let x = 0; x < rw; x++) {
        const o = (y * w + x0 + x) * 4;
        if (!data[o + 3]) continue;
        const r = Math.hypot((x - cx) / (rw * 0.5), (y - cy) / (h * 0.5));
        const rim = 1 - smooth(0.7, 1.0, r + 0.14 * (noise(x, y, 24, 24, 5) - 0.5));
        data[o + 3] = data[o + 3] * rim;
        if (data[o + 3] < 8) data[o + 3] = 0;
      }
  }

  // --- plait: three bundles braided (v along the plait, u around it); the one nearest the eye shows.
  {
    const x0 = rw * 2;
    const n = 12; // crossings per unit v (tube callers repeat v)
    for (let y = 0; y < h; y++) {
      const v = y / (h - 1);
      const ph = v * n * Math.PI * 2;
      for (let x = 0; x < rw; x++) {
        const u = (x + 0.5) / rw;
        let best = -2;
        let tone = 0;
        for (let b = 0; b < 3; b++) {
          const pb = ph + (b * Math.PI * 2) / 3;
          const xc = 0.5 + 0.34 * Math.sin(pb);
          const d = (u - xc) / 0.25;
          if (Math.abs(d) >= 1) continue;
          const depth = Math.cos(pb); // toward the eye when positive
          if (depth <= best) continue;
          best = depth;
          const hgt = Math.sqrt(1 - d * d);
          // Fine strands along the bundle, slanting with it.
          const slant = Math.cos(pb) * 0.3 * n * 2;
          const fine = 0.5 + 0.5 * Math.sin((u * 52 - v * slant) * Math.PI);
          tone = (0.3 + 0.7 * Math.pow(hgt, 0.6)) * (0.84 + 0.16 * fine) * (0.62 + 0.38 * (depth * 0.5 + 0.5));
        }
        // Outside every bundle: the dark groove at the plait's sides.
        if (best < -1.5) tone = 0.28 + 0.1 * noise(x, y, 6, 6, 9);
        put(x0 + x, y, tone, 1);
      }
    }
  }

  // --- fade: streaks along v (the hair's direction), fine across u, continuous in both.
  {
    const x0 = rw * 3;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < rw; x++) {
        const u = x;
        const n1 = noise(u, y, 3, 48, 1); // fine wisps, long
        const n2 = noise(u, y, 7, 120, 2); // locks
        const n3 = noise(u, y, 1.5, 16, 3); // hair-fine break-up
        const n = 0.45 * n1 + 0.35 * n2 + 0.2 * n3;
        // Stretch toward the ends so thresholding the vertex density gives a full range of densities.
        const a = Math.min(1, Math.max(0, (n - 0.2) / 0.6));
        const tone = 0.7 + 0.3 * noise(u, y, 2, 90, 4);
        put(x0 + x, y, tone, a);
      }
  }
  return data;
}

let tex: THREE.DataTexture | null = null;

/** The shared hair texture (built on first use). */
export function hairTexture(): THREE.DataTexture {
  if (tex) return tex;
  const t = new THREE.DataTexture(hairPixels(), HAIR_TEX.w, HAIR_TEX.h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = THREE.ClampToEdgeWrapping;
  // Tubes run their v along the plait unwrapped (a modulo per vertex smeared the texture backwards across one
  // segment per repeat); the strand cards stop short of v = 1 so the tips never wrap to the solid root.
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  t.name = 'hair-strands';
  // One texture shared by every hair material, never edited: the pixels go once uploaded (gfx/release).
  tex = releaseTextureAfterUpload(t);
  return t;
}
