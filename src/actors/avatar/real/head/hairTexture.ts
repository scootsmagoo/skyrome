/**
 * The one procedural texture all hair shares, generated once from a seed (no canvas, so tests can run it).
 * 512 x 1024 RGBA, three regions side by side (u ranges in HAIR_UV):
 *
 *   strand  (u 0 .. 0.5)     a clump of about thirty wavy strands, solid at the root (v = 0) and
 *                            tapering to separate tips toward v = 1: alpha is the card's silhouette,
 *                            rgb a per-strand tone;
 *   plait   (u 0.5 .. 0.75)  opaque twisted ridges for plaits, curls and coils;
 *   fade    (u 0.75 .. 1)    a stipple whose density falls from solid (v = 0) to sparse (v = 1), for the
 *                            edges of the scalp cap and the beard so they thin out like real hair.
 */
import * as THREE from 'three';
import { Rng } from '../../../../core/Rng';

export const HAIR_TEX = { w: 512, h: 1024 } as const;
/** u ranges of the three regions (inset a little so mip levels do not bleed across). */
export const HAIR_UV = {
  strand: [0.012, 0.488],
  plait: [0.512, 0.738],
  fade: [0.762, 0.988],
} as const;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Pixel data (pure function of the seed). */
export function hairPixels(seed = 7): Uint8Array {
  const { w, h } = HAIR_TEX;
  const data = new Uint8Array(w * h * 4);
  const rng = new Rng(seed);
  const rw = w / 2;
  // --- strands
  const N = 42;
  const strands = Array.from({ length: N }, (_, i) => {
    const base = (i + rng.range(0.1, 0.9)) / N;
    return {
      x0: 0.06 + 0.88 * base,
      w0: rng.range(1.2, 2.3),
      end: rng.range(0.5, 1.0),
      amp: rng.range(0.004, 0.03),
      freq: rng.range(2.5, 7),
      phase: rng.range(0, 6.3),
      tone: rng.range(0.62, 1.0),
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
        const o = (y * w + x) * 4;
        const cur = data[o + 3] / 255;
        if (a < cur) continue;
        // A highlight ridge down the middle of each strand and a darker edge.
        const ridge = 0.85 + 0.15 * (1 - Math.min(1, d / half));
        const t = Math.min(1, s.tone * ridge * (0.82 + 0.3 * v)) * 255;
        data[o] = data[o + 1] = data[o + 2] = t;
        data[o + 3] = a * 255;
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
  // --- plait: twisted ridges (v along the plait, u around it)
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    for (let x = rw; x < rw + w / 4; x++) {
      const u = (x - rw) / (w / 4);
      const tw = Math.sin((v * 46 + u * 3.2) * Math.PI) * 0.5 + 0.5;
      const fine = Math.sin((u * 31 + v * 60 + Math.sin(v * 9) * 2) * Math.PI) * 0.5 + 0.5;
      const t = (0.42 + 0.5 * tw * (0.7 + 0.3 * fine)) * 255;
      const o = (y * w + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = t;
      data[o + 3] = 255;
    }
  }
  // --- fade: stipple whose density falls with v, streaked along v like hair
  const hash = (a: number, b: number) => {
    let n = Math.imul(a + 374761393, 668265263) ^ Math.imul(b + 1274126177, 2246822519);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const x3 = rw + w / 4;
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    for (let x = x3; x < w; x++) {
      const u = x - x3;
      // Streaks (columns of 3 px) times speckle.
      const col = hash(u, 11);
      // Cells 64 rows tall: finer rows would be averaged away by the mip chain (v runs over a few cm).
      const sp = hash(u, y >> 6);
      const n = 0.4 * col + 0.6 * sp;
      const keep = n > smooth(0.0, 0.92, v) * 0.95 + 0.02 ? 1 : 0;
      const o = (y * w + x) * 4;
      const t = (0.82 + 0.18 * hash(u >> 1, y >> 6)) * 255;
      data[o] = data[o + 1] = data[o + 2] = t;
      data[o + 3] = keep * 255;
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
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  t.name = 'hair-strands';
  tex = t;
  return t;
}
