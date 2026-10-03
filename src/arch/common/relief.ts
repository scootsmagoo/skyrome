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
