/**
 * Procedural relief textures rendered into height fields (pure, no DOM): the helical frieze of
 * an honorific column (soldiers, shields, trees, walls) and Egyptian hieroglyph columns for
 * obelisks. Each is turned into albedo + normal + roughness DataTextures in `reliefMaterial()`.
 */
import * as THREE from 'three';
import { fbm2D, heightToNormal, prng } from '../../gfx/textures/noise';

/** A float height field with a few raster primitives. Rows run up (row 0 = v 0). */
export class HeightField {
  readonly data: Float32Array;
  constructor(
    readonly w: number,
    readonly h: number,
    /** Wrap horizontally (seamless friezes). */
    readonly wrapX = false,
  ) {
    this.data = new Float32Array(w * h);
  }
  private put(x: number, y: number, v: number) {
    if (y < 0 || y >= this.h) return;
    if (x < 0 || x >= this.w) {
      if (!this.wrapX) return;
      x = ((x % this.w) + this.w) % this.w;
    }
    const i = y * this.w + x;
    if (v > this.data[i]) this.data[i] = v;
  }
  /** Filled ellipse with a rounded (domed) top. */
  ellipse(cx: number, cy: number, rx: number, ry: number, v = 1) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (d <= 1) this.put(x, y, v * (0.75 + 0.25 * Math.sqrt(1 - d)));
      }
  }
  rect(x0: number, y0: number, x1: number, y1: number, v = 1) {
    for (let y = Math.floor(Math.min(y0, y1)); y <= Math.ceil(Math.max(y0, y1)); y++) for (let x = Math.floor(Math.min(x0, x1)); x <= Math.ceil(Math.max(x0, x1)); x++) this.put(x, y, v);
  }
  line(x0: number, y0: number, x1: number, y1: number, width: number, v = 1) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(len));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.ellipse(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, width / 2, width / 2, v);
    }
  }
  /** Filled polygon (even-odd), e.g. tents, pediments, boats. */
  poly(pts: [number, number][], v = 1) {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++)
      for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i];
          const [xj, yj] = pts[j];
          if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) this.put(x, y, v);
      }
  }
  /** Box blur (softens edges into sculpted slopes). */
  blur(r: number) {
    if (r <= 0) return;
    const { w, h } = this;
    const tmp = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = 0;
        let c = 0;
        for (let k = -r; k <= r; k++) {
          let xx = x + k;
          if (xx < 0 || xx >= w) {
            if (!this.wrapX) continue;
            xx = ((xx % w) + w) % w;
          }
          s += this.data[y * w + xx];
          c++;
        }
        tmp[y * w + x] = s / c;
      }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = 0;
        let c = 0;
        for (let k = -r; k <= r; k++) {
          const yy = y + k;
          if (yy < 0 || yy >= h) continue;
          s += tmp[yy * w + x];
          c++;
        }
        this.data[y * w + x] = s / c;
      }
  }
}

/** A standing figure (legionary): legs, tunic, torso, head, shield and spear. Feet at (x, y). */
function soldier(f: HeightField, x: number, y: number, s: number, facing: 1 | -1, rnd: () => number) {
  const v = 0.8 + 0.2 * rnd();
  f.line(x - 0.06 * s, y, x - 0.03 * s, y + 0.42 * s, 0.07 * s, v);
  f.line(x + 0.06 * s, y, x + 0.04 * s, y + 0.42 * s, 0.07 * s, v);
  f.ellipse(x, y + 0.5 * s, 0.13 * s, 0.12 * s, v); // tunic
  f.ellipse(x, y + 0.68 * s, 0.11 * s, 0.16 * s, v); // torso / cuirass
  f.ellipse(x + 0.01 * facing * s, y + 0.9 * s, 0.07 * s, 0.075 * s, v); // head / helmet
  if (rnd() < 0.7) f.ellipse(x + 0.13 * facing * s, y + 0.62 * s, 0.11 * s, 0.17 * s, v * 1.05); // scutum
  if (rnd() < 0.6) f.line(x - 0.12 * facing * s, y + 0.15 * s, x - 0.05 * facing * s, y + 1.1 * s, 0.025 * s, v); // spear
  else f.line(x - 0.08 * facing * s, y + 0.62 * s, x - 0.25 * facing * s, y + 0.8 * s, 0.05 * s, v); // raised arm
}

function tree(f: HeightField, x: number, y: number, s: number) {
  f.line(x, y, x, y + 0.6 * s, 0.05 * s, 0.6);
  f.ellipse(x, y + 0.75 * s, 0.2 * s, 0.22 * s, 0.55);
  f.ellipse(x - 0.12 * s, y + 0.62 * s, 0.13 * s, 0.13 * s, 0.5);
  f.ellipse(x + 0.12 * s, y + 0.64 * s, 0.13 * s, 0.13 * s, 0.5);
}

function fortWall(f: HeightField, x: number, y: number, w: number, s: number) {
  f.rect(x, y, x + w, y + 0.55 * s, 0.45);
  for (let k = 0; k < w / (0.12 * s); k += 2) f.rect(x + k * 0.12 * s, y + 0.55 * s, x + (k + 1) * 0.12 * s, y + 0.65 * s, 0.45);
  // courses
  for (let r = 1; r < 4; r++) f.rect(x, y + r * 0.13 * s, x + w, y + r * 0.13 * s + 1, 0.35);
}

/**
 * One turn of a column frieze: `w` × `h` pixels, seamless horizontally, with a raised fillet
 * along the bottom edge (the spiral divider) and a crowd of figures, trees and walls.
 */
export function friezeBand(w: number, h: number, seed = 113): HeightField {
  const f = new HeightField(w, h, true);
  const rnd = prng(seed);
  const ground = h * 0.1;
  const s = h * 0.78;
  // spiral divider fillet
  f.rect(0, 0, w - 1, Math.max(2, h * 0.05), 1);
  let x = 0;
  while (x < w) {
    const r = rnd();
    if (r < 0.08) {
      const ww = s * (0.8 + rnd() * 0.8);
      fortWall(f, x, ground, ww, s);
      x += ww + s * 0.1;
    } else if (r < 0.16) {
      tree(f, x + s * 0.2, ground, s * 0.9);
      x += s * 0.45;
    } else {
      const facing = (rnd() < 0.7 ? 1 : -1) as 1 | -1;
      soldier(f, x + s * 0.15, ground + rnd() * h * 0.04, s * (0.85 + rnd() * 0.15), facing, rnd);
      x += s * (0.2 + rnd() * 0.12);
    }
  }
  f.blur(Math.max(1, Math.round(h / 90)));
  return f;
}

// ---------------------------------------------------------------- the column's narrative strip

type Facing = 1 | -1;

interface FigureOpts {
  facing: Facing;
  /** Relief height (nearer figures stand out more). */
  v?: number;
  shield?: boolean;
  spear?: boolean;
  arm?: 'up' | 'forward' | 'down' | 'carry' | 'raise';
  stride?: number;
  cloak?: boolean;
  /** Long toga/himation instead of tunic and bare legs. */
  toga?: boolean;
  /** Signum: a pole with discs and a hand on top. */
  standard?: boolean;
  /** A load carried on the shoulder (camp building). */
  load?: boolean;
}

/** A standing or walking figure in profile-ish relief. Feet at (x, y), `s` = figure height in px. */
function figure(f: HeightField, x: number, y: number, s: number, o: FigureOpts) {
  const v = o.v ?? 0.85;
  const fc = o.facing;
  const st = (o.stride ?? 0.07) * s;
  if (o.toga) {
    f.ellipse(x, y + 0.36 * s, 0.13 * s, 0.37 * s, v);
    f.line(x - 0.05 * s, y + 0.05 * s, x + 0.07 * s * fc, y + 0.05 * s, 0.06 * s, v);
  } else {
    f.line(x - st, y, x - 0.02 * s * fc, y + 0.42 * s, 0.065 * s, v);
    f.line(x + st, y, x + 0.02 * s * fc, y + 0.42 * s, 0.065 * s, v);
    f.ellipse(x, y + 0.49 * s, 0.13 * s, 0.1 * s, v);
  }
  f.ellipse(x, y + 0.67 * s, 0.11 * s, 0.17 * s, v);
  f.ellipse(x + 0.015 * s * fc, y + 0.9 * s, 0.065 * s, 0.072 * s, v);
  if (o.cloak) f.ellipse(x - 0.08 * s * fc, y + 0.62 * s, 0.07 * s, 0.22 * s, v * 0.96);
  const sh: [number, number] = [x + 0.05 * s * fc, y + 0.8 * s];
  switch (o.arm ?? 'down') {
    case 'up':
      f.line(sh[0], sh[1], x + 0.13 * s * fc, y + 1.08 * s, 0.05 * s, v);
      break;
    case 'raise':
      f.line(sh[0], sh[1], x + 0.24 * s * fc, y + 0.98 * s, 0.05 * s, v);
      break;
    case 'forward':
      f.line(sh[0], sh[1], x + 0.3 * s * fc, y + 0.74 * s, 0.05 * s, v);
      break;
    case 'carry':
      f.line(sh[0], sh[1], x + 0.06 * s * fc, y + 1.0 * s, 0.05 * s, v);
      break;
    default:
      f.line(sh[0], sh[1], x + 0.07 * s * fc, y + 0.52 * s, 0.05 * s, v);
  }
  if (o.load) f.rect(x - 0.12 * s, y + 0.98 * s, x + 0.16 * s, y + 1.1 * s, v * 0.95);
  if (o.shield) f.ellipse(x + 0.13 * s * fc, y + 0.6 * s, 0.1 * s, 0.18 * s, Math.min(1, v + 0.08));
  if (o.spear) f.line(x - 0.1 * s * fc, y + 0.05 * s, x - 0.05 * s * fc, y + 1.18 * s, 0.022 * s, v);
  if (o.standard) {
    const px = x - 0.1 * s * fc;
    f.line(px, y, px, y + 1.32 * s, 0.025 * s, v);
    for (let k = 0; k < 4; k++) f.ellipse(px, y + (0.78 + k * 0.11) * s, 0.04 * s, 0.035 * s, v);
    f.ellipse(px, y + 1.32 * s, 0.035 * s, 0.05 * s, v);
  }
}

/** A horse walking (one foreleg raised), optionally ridden. `s` = human figure height. */
function horse(f: HeightField, x: number, y: number, s: number, fc: Facing, rider: boolean, v = 0.8) {
  const by = y + 0.56 * s;
  f.ellipse(x, by, 0.4 * s, 0.15 * s, v);
  f.ellipse(x + 0.28 * s * fc, by + 0.02 * s, 0.15 * s, 0.17 * s, v);
  f.ellipse(x - 0.3 * s * fc, by + 0.02 * s, 0.16 * s, 0.16 * s, v);
  f.line(x + 0.34 * s * fc, by + 0.08 * s, x + 0.5 * s * fc, by + 0.38 * s, 0.13 * s, v);
  f.line(x + 0.5 * s * fc, by + 0.4 * s, x + 0.64 * s * fc, by + 0.2 * s, 0.085 * s, v);
  f.line(x + 0.48 * s * fc, by + 0.44 * s, x + 0.47 * s * fc, by + 0.52 * s, 0.03 * s, v);
  // legs: front pair (one raised), hind pair
  f.line(x + 0.3 * s * fc, by - 0.08 * s, x + 0.42 * s * fc, y + 0.28 * s, 0.05 * s, v);
  f.line(x + 0.42 * s * fc, y + 0.28 * s, x + 0.38 * s * fc, y + 0.14 * s, 0.045 * s, v);
  f.line(x + 0.22 * s * fc, by - 0.08 * s, x + 0.24 * s * fc, y, 0.05 * s, v);
  f.line(x - 0.26 * s * fc, by - 0.06 * s, x - 0.2 * s * fc, y, 0.055 * s, v);
  f.line(x - 0.36 * s * fc, by - 0.06 * s, x - 0.42 * s * fc, y, 0.055 * s, v);
  f.line(x - 0.42 * s * fc, by + 0.06 * s, x - 0.54 * s * fc, y + 0.22 * s, 0.05 * s, v);
  if (rider) {
    const rv = Math.min(1, v + 0.06);
    f.line(x + 0.02 * s * fc, by + 0.05 * s, x + 0.08 * s * fc, by - 0.2 * s, 0.06 * s, rv);
    f.ellipse(x - 0.02 * s * fc, by + 0.27 * s, 0.1 * s, 0.17 * s, rv);
    f.ellipse(x, by + 0.5 * s, 0.06 * s, 0.07 * s, rv);
    f.line(x + 0.04 * s * fc, by + 0.36 * s, x + 0.26 * s * fc, by + 0.5 * s, 0.045 * s, rv);
    f.line(x + 0.26 * s * fc, by + 0.75 * s, x + 0.2 * s * fc, by - 0.1 * s, 0.02 * s, rv);
    f.ellipse(x - 0.13 * s * fc, by + 0.22 * s, 0.07 * s, 0.13 * s, rv);
  }
}

/** A heavy beast for sacrifice (bull) or a pack animal; `horns` for the bull. */
function beast(f: HeightField, x: number, y: number, s: number, fc: Facing, size: number, horns: boolean, v = 0.8) {
  const k = s * size;
  const by = y + 0.42 * k;
  f.ellipse(x, by, 0.42 * k, 0.2 * k, v);
  f.ellipse(x + 0.4 * k * fc, by + 0.06 * k, 0.13 * k, 0.11 * k, v);
  for (const lx of [0.28, 0.2, -0.24, -0.32]) f.line(x + lx * k * fc, by - 0.1 * k, x + lx * k * fc, y, 0.07 * k, v);
  if (horns) f.line(x + 0.42 * k * fc, by + 0.15 * k, x + 0.5 * k * fc, by + 0.26 * k, 0.03 * k, v);
  f.line(x - 0.42 * k * fc, by + 0.05 * k, x - 0.5 * k * fc, y + 0.15 * k, 0.03 * k, v);
}

function tent(f: HeightField, x: number, y: number, s: number, v = 0.5) {
  f.poly([[x - 0.45 * s, y], [x + 0.45 * s, y], [x + 0.12 * s, y + 0.62 * s], [x - 0.12 * s, y + 0.62 * s]], v);
}

function hillBackground(f: HeightField, x0: number, x1: number, y: number, s: number, rnd: () => number) {
  for (let x = x0; x < x1; x += s * (0.4 + rnd() * 0.3)) f.ellipse(x, y + 0.2 * s, s * (0.35 + rnd() * 0.25), s * (0.2 + rnd() * 0.15), 0.32);
}

type Scene = (f: HeightField, x: number, y: number, s: number, rnd: () => number) => number;

/** The army on the march: standards, legionaries, a pack mule. */
const march: Scene = (f, x, y, s, rnd) => {
  const n = 6 + Math.floor(rnd() * 4);
  let cx = x + s * 0.3;
  for (let i = 0; i < n; i++) {
    if (i === 3) {
      beast(f, cx + s * 0.25, y, s, 1, 0.75, false, 0.72);
      f.rect(cx + s * 0.08, y + 0.42 * s, cx + s * 0.38, y + 0.57 * s, 0.75);
      cx += s * 0.7;
    }
    figure(f, cx, y + rnd() * 2, s * (0.92 + rnd() * 0.08), { facing: 1, shield: i % 4 !== 0, spear: i % 2 === 1, standard: i === 0, stride: 0.09, v: 0.78 + rnd() * 0.16 });
    cx += s * (0.27 + rnd() * 0.08);
  }
  return cx - x + s * 0.2;
};

/** A cavalry ala, staggered in depth. */
const cavalry: Scene = (f, x, y, s, rnd) => {
  const n = 3 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) horse(f, x + s * (0.75 + i * 0.75), y + (i % 2) * s * 0.05, s, 1, true, i % 2 ? 0.7 : 0.88);
  return s * (0.75 * n + 0.8);
};

/** Adlocutio: the emperor on a tribunal addressing the soldiers, standards raised. */
const adlocutio: Scene = (f, x, y, s, rnd) => {
  const tw = s * 0.8;
  const tx = x + s * 0.2;
  f.rect(tx, y, tx + tw, y + 0.22 * s, 0.7);
  figure(f, tx + tw * 0.35, y + 0.22 * s, s, { facing: 1, arm: 'raise', cloak: true, v: 0.95, stride: 0.03 });
  figure(f, tx + tw * 0.12, y + 0.22 * s, s * 0.95, { facing: 1, v: 0.7, cloak: true, stride: 0.02 });
  let cx = tx + tw + s * 0.35;
  const n = 5 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    figure(f, cx, y, s * 0.95, { facing: -1, arm: i % 3 === 1 ? 'up' : 'down', shield: i % 3 !== 1, standard: i === 2 || i === n - 1, v: 0.75 + rnd() * 0.2 });
    cx += s * 0.27;
  }
  return cx - x + s * 0.15;
};

/** Building a camp: a rising wall of ashlar, soldiers carrying blocks, tents behind. */
const camp: Scene = (f, x, y, s, rnd) => {
  const w = s * (1.8 + rnd() * 0.6);
  tent(f, x + s * 0.5, y + s * 0.1, s * 0.9);
  tent(f, x + w - s * 0.3, y + s * 0.12, s * 0.8);
  fortWall(f, x + s * 0.2, y, w * 0.6, s * 0.85);
  for (let i = 0; i < 4; i++) figure(f, x + s * (0.35 + i * 0.42), y, s * 0.92, { facing: (i % 2 ? -1 : 1) as Facing, arm: i === 1 ? 'up' : 'carry', load: i !== 1, stride: 0.06, v: 0.85 + rnd() * 0.12 });
  return w + s * 0.4;
};

/** River crossing on a bridge of boats, the river god rising from the water. */
const river: Scene = (f, x, y, s, rnd) => {
  const w = s * 3.2;
  // water: wavy lines along the bottom
  for (let k = 0; k < 3; k++)
    for (let xx = x; xx < x + w; xx += 3) f.ellipse(xx, y + s * (0.04 + k * 0.08) + Math.sin(xx * 0.15 + k) * s * 0.02, 2, 1.6, 0.4);
  // the river god: a large bearded head and shoulders emerging at the left
  f.ellipse(x + s * 0.35, y + s * 0.35, s * 0.22, s * 0.3, 0.75);
  f.ellipse(x + s * 0.4, y + s * 0.72, s * 0.13, s * 0.14, 0.8);
  f.ellipse(x + s * 0.43, y + s * 0.6, s * 0.1, s * 0.09, 0.78);
  // boats under a deck
  const bx0 = x + s * 0.8;
  const deck = y + s * 0.3;
  for (let bx = bx0; bx < x + w - s * 0.3; bx += s * 0.55) f.poly([[bx, deck], [bx + s * 0.42, deck], [bx + s * 0.34, y + s * 0.12], [bx + s * 0.08, y + s * 0.12]], 0.62);
  f.rect(bx0 - s * 0.05, deck, x + w - s * 0.2, deck + s * 0.05, 0.7);
  for (let cx = bx0 + s * 0.2; cx < x + w - s * 0.3; cx += s * 0.3) figure(f, cx, deck + s * 0.05, s * 0.85, { facing: 1, shield: true, spear: rnd() < 0.5, stride: 0.09, v: 0.82 + rnd() * 0.12 });
  return w;
};

/** Sacrifice (suovetaurilia): the veiled emperor at an altar, a flute player, bull, ram and pig. */
const sacrifice: Scene = (f, x, y, s, rnd) => {
  const ax = x + s * 0.8;
  f.rect(ax - s * 0.14, y, ax + s * 0.14, y + s * 0.42, 0.78);
  f.rect(ax - s * 0.18, y + s * 0.42, ax + s * 0.18, y + s * 0.48, 0.8);
  f.ellipse(ax, y + s * 0.53, s * 0.07, s * 0.05, 0.6);
  figure(f, ax - s * 0.32, y, s, { facing: 1, toga: true, arm: 'forward', v: 0.92 });
  figure(f, ax - s * 0.62, y, s * 0.95, { facing: 1, toga: true, v: 0.75 });
  // flute player (two pipes from the face)
  figure(f, ax + s * 0.42, y, s * 0.92, { facing: -1, v: 0.82 });
  f.line(ax + s * 0.39, y + s * 0.88, ax + s * 0.2, y + s * 0.74, s * 0.02, 0.82);
  // victimarius leading the bull, then ram and pig
  beast(f, ax + s * 1.25, y, s, -1, 1, true, 0.85);
  figure(f, ax + s * 0.95, y, s * 0.95, { facing: 1, arm: 'forward', v: 0.88, stride: 0.05 });
  beast(f, ax + s * 1.95, y, s, -1, 0.5, false, 0.8);
  beast(f, ax + s * 2.4, y, s, -1, 0.42, false, 0.8);
  void rnd;
  return s * 3.4;
};

/** Victory writing on a shield between two trophies (the column's centrepiece). */
const victory: Scene = (f, x, y, s) => {
  const cx = x + s * 1.1;
  for (const tx of [x + s * 0.3, x + s * 1.9]) {
    f.line(tx, y, tx, y + s * 1.05, s * 0.04, 0.7);
    f.ellipse(tx, y + s * 0.78, s * 0.12, s * 0.18, 0.8);
    f.line(tx - s * 0.2, y + s * 0.85, tx + s * 0.2, y + s * 0.85, s * 0.04, 0.75);
    f.ellipse(tx - s * 0.12, y + s * 0.5, s * 0.08, s * 0.14, 0.75);
  }
  f.ellipse(cx, y + s * 0.4, s * 0.14, s * 0.4, 0.9);
  f.ellipse(cx, y + s * 0.82, s * 0.07, s * 0.08, 0.92);
  // wings
  f.poly([[cx - s * 0.05, y + s * 0.75], [cx - s * 0.45, y + s * 1.05], [cx - s * 0.35, y + s * 0.6]], 0.7);
  f.poly([[cx + s * 0.05, y + s * 0.75], [cx + s * 0.45, y + s * 1.08], [cx + s * 0.35, y + s * 0.62]], 0.66);
  f.ellipse(cx + s * 0.22, y + s * 0.55, s * 0.13, s * 0.17, 0.95);
  return s * 2.2;
};

/**
 * The column's continuous narrative as one long strip (`w` × `h` px, seamless horizontally):
 * scenes follow one another, separated by trees in the Roman manner — the march, cavalry,
 * adlocutio, camp building, a river crossing, sacrifice and, once, Victory between trophies. A
 * raised fillet along the bottom rows is the spiral divider. Deterministic for a seed.
 */
export function friezeStrip(w: number, h: number, seed = 113): HeightField {
  const f = new HeightField(w, h, true);
  const rnd = prng(seed);
  const ground = h * 0.11;
  const s = h * 0.76;
  f.rect(0, 0, w - 1, Math.max(2, h * 0.05), 1);
  hillBackground(f, 0, w, ground, s, rnd);
  const order: Scene[] = [march, adlocutio, cavalry, camp, river, march, sacrifice, cavalry, victory, camp, march, adlocutio, river, cavalry, sacrifice];
  let x = s * 0.2;
  let i = 0;
  // Stop one scene short of the end so the wrap-around never cuts a figure in half.
  while (x < w - s * 4.6) {
    const sc = order[i % order.length];
    x += sc(f, x, ground, s, rnd);
    tree(f, x + s * 0.12, ground, s * (0.85 + rnd() * 0.2));
    x += s * 0.3;
    i++;
  }
  // Fill the remainder with marching legionaries up to the seam.
  while (x < w - s * 0.35) {
    figure(f, x + s * 0.15, ground, s * 0.94, { facing: 1, shield: true, spear: rnd() < 0.5, stride: 0.09, v: 0.8 + rnd() * 0.12 });
    x += s * 0.3;
  }
  f.blur(Math.max(1, Math.round(h / 80)));
  return f;
}

/** Hieroglyph columns for one obelisk face: 3 columns of carved signs (recessed = negative). */
export function hieroglyphFace(w: number, h: number, seed = 7): HeightField {
  const f = new HeightField(w, h);
  const rnd = prng(seed);
  const cols = 3;
  const cw = w / (cols + 0.6);
  for (let c = 0; c < cols; c++) {
    const cx = cw * (0.8 + c);
    // column frame lines
    f.rect(cx - cw * 0.45, 0, cx - cw * 0.45 + 1, h - 1, 0.6);
    let y = h - cw * 0.6;
    while (y > cw * 0.4) {
      const g = Math.floor(rnd() * 9);
      const sz = cw * 0.32;
      switch (g) {
        case 0:
          f.ellipse(cx, y, sz, sz); // sun disc
          break;
        case 1:
          f.ellipse(cx, y, sz * 1.1, sz * 0.45); // loaf / mouth
          break;
        case 2:
          f.line(cx, y - sz, cx, y + sz, sz * 0.25); // reed
          f.ellipse(cx + sz * 0.25, y + sz * 0.8, sz * 0.25, sz * 0.15);
          break;
        case 3:
          for (let k = -2; k <= 2; k++) f.line(cx + k * sz * 0.4, y - sz * 0.15 * (k % 2 ? 1 : -1), cx + (k + 1) * sz * 0.4, y + sz * 0.15 * (k % 2 ? 1 : -1), sz * 0.18); // water
          break;
        case 4:
          f.ellipse(cx, y, sz * 0.8, sz * 0.45); // bird body
          f.ellipse(cx + sz * 0.6, y + sz * 0.45, sz * 0.22, sz * 0.22); // head
          f.line(cx - sz * 0.2, y - sz * 0.4, cx - sz * 0.25, y - sz * 0.95, sz * 0.12); // legs
          f.line(cx + sz * 0.2, y - sz * 0.4, cx + sz * 0.2, y - sz * 0.95, sz * 0.12);
          break;
        case 5:
          f.rect(cx - sz, y - sz * 0.5, cx + sz, y + sz * 0.5); // pool
          break;
        case 6:
          f.ellipse(cx, y, sz * 0.9, sz * 0.5); // eye
          f.ellipse(cx, y, sz * 0.3, sz * 0.3, 0.4);
          break;
        case 7:
          f.line(cx - sz, y - sz * 0.4, cx + sz * 0.6, y - sz * 0.4, sz * 0.25); // arm
          f.line(cx + sz * 0.6, y - sz * 0.4, cx + sz * 0.6, y + sz * 0.6, sz * 0.25);
          break;
        default:
          f.ellipse(cx, y, sz * 0.5, sz); // owl/cartouche-ish
          f.ellipse(cx, y + sz * 0.7, sz * 0.4, sz * 0.35);
      }
      y -= sz * (2.6 + rnd() * 0.6);
    }
  }
  f.blur(1);
  for (let i = 0; i < f.data.length; i++) f.data[i] = -f.data[i];
  return f;
}

export interface ReliefLook {
  /** Ground colour (sRGB 0..255). */
  ground: [number, number, number];
  /** Colour of raised (or recessed) parts. */
  relief: [number, number, number];
  /** Speckle/vein noise amplitude (0..1). */
  noise?: number;
  /** Normal strength. */
  strength?: number;
  roughness?: number;
  /** Repeat the texture (frieze) or clamp (single face). */
  repeat?: boolean;
}

/** Turn a height field into a MeshStandardMaterial (albedo + normal + roughness/AO). */
export function reliefMaterial(f: HeightField, look: ReliefLook): THREE.MeshStandardMaterial {
  const { w, h, data } = f;
  const color = new Uint8ClampedArray(w * h * 4);
  const arm = new Uint8ClampedArray(w * h * 4);
  const n = fbm2D(5, 12, 4);
  const amp = look.noise ?? 0.08;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const v = Math.min(1, Math.abs(data[i]));
      const k = 1 + amp * (n(x / w, y / h) - 0.5) * 2;
      const j = i * 4;
      for (let c = 0; c < 3; c++) color[j + c] = (look.ground[c] + (look.relief[c] - look.ground[c]) * v) * k;
      color[j + 3] = 255;
      arm[j] = 255 * (1 - 0.35 * v * (data[i] < 0 ? 1 : 0.4));
      arm[j + 1] = 255 * (look.roughness ?? 0.6);
      arm[j + 2] = 0;
      arm[j + 3] = 255;
    }
  const normal = heightToNormal(data, w, h, look.strength ?? 3);
  const tex = (d: Uint8ClampedArray, srgb: boolean) => {
    const t = new THREE.DataTexture(d, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    t.wrapS = t.wrapT = look.repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  const armT = tex(arm, false);
  const mat = new THREE.MeshStandardMaterial({ map: tex(color, true), normalMap: tex(normal, false), roughnessMap: armT, aoMap: armT, roughness: 1, metalness: 0 });
  return mat;
}
