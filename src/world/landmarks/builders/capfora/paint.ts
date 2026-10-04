/**
 * Paint and relief materials for the Capitoline / Imperial Fora landmarks. Each is created once
 * and shared (MeshBuilder merges per material instance), so a tympanum painted Egyptian blue or
 * a frieze of Trajanic cupids costs one draw call per landmark, not per surface.
 *
 * Colours are the palette of GDD §16.1 / architecture.md §2.1 (sRGB albedo).
 */
import * as THREE from 'three';
import { HeightField, reliefMaterial } from '../../../../arch/common/relief';

const paints = new Map<string, THREE.MeshStandardMaterial>();

/** A flat painted surface (stucco/marble paint), cached by colour. */
export function paint(hex: string, roughness = 0.8, metalness = 0): THREE.MeshStandardMaterial {
  const key = `${hex}|${roughness}|${metalness}`;
  let m = paints.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness, metalness });
    m.name = `capfora:paint${hex}`;
    paints.set(key, m);
  }
  return m;
}

export const PAINT = {
  cinnabar: '#A3271F',
  redOchre: '#9A3A24',
  yellowOchre: '#CC9A35',
  blue: '#2D5DA1',
  green: '#6F8656',
  black: '#1F1D1B',
  ivory: '#EFE6D2',
  flesh: '#C99A78',
  laurel: '#4F6A35',
  rose: '#C2475A',
} as const;

let gilt: THREE.MeshStandardMaterial | undefined;

/**
 * Gilded bronze roof tiles (Jupiter Optimus Maximus): polished gold metal, plus a faint warm
 * emissive so the roof still reads as gold where it only reflects the sky or lies in shade, which is
 * how the Capitolium's roof "flashes over the whole city" from every street (art direction, GDD
 * §16.1). Flat colour on purpose: at roof scale the tile ribs carry the detail.
 */
export function giltRoof(): THREE.MeshStandardMaterial {
  if (!gilt) {
    gilt = new THREE.MeshStandardMaterial({ color: new THREE.Color('#D9AE48'), metalness: 1, roughness: 0.24, emissive: new THREE.Color('#7A5414'), emissiveIntensity: 0.55 });
    gilt.name = 'capfora:gilt-roof';
  }
  return gilt;
}

// ---------------------------------------------------------------- relief friezes

type Kind = 'cupids' | 'arachne' | 'weapons' | 'garland';
const reliefs = new Map<Kind, THREE.MeshStandardMaterial>();

/** Acanthus scroll running along the band: a wavy stem with spiral tendrils and leaves. */
function acanthus(f: HeightField, y0: number, h: number, period: number, v = 0.55) {
  const { w } = f;
  const amp = h * 0.18;
  const mid = y0 + h * 0.5;
  for (let x = 0; x < w; x += 1) {
    const y = mid + Math.sin((x / period) * Math.PI * 2) * amp;
    f.ellipse(x, y, h * 0.035, h * 0.035, v);
  }
  // Spiral tendrils at each crest and trough, with a rosette at the centre.
  for (let k = 0; k < w / (period / 2); k++) {
    const cx = (k + 0.25) * (period / 2);
    const up = k % 2 === 0 ? 1 : -1;
    const cy = mid + up * amp * 0.2;
    const r0 = h * 0.26;
    for (let a = 0; a < Math.PI * 3.2; a += 0.12) {
      const r = r0 * (1 - a / (Math.PI * 3.6));
      f.ellipse(cx + Math.cos(a) * r * up, cy - up * h * 0.05 + Math.sin(a) * r, h * 0.025, h * 0.025, v);
    }
    f.ellipse(cx, cy - up * h * 0.05, h * 0.06, h * 0.06, v + 0.15);
    // leaves sprouting from the stem
    for (const s of [-1, 1]) f.ellipse(cx + s * period * 0.12, mid - up * amp * 0.6, h * 0.1, h * 0.04, v * 0.9);
  }
}

/** A winged cupid (putto): plump body, head, wings, legs; facing ±1. */
function putto(f: HeightField, x: number, y: number, s: number, facing: number) {
  f.ellipse(x - facing * 0.12 * s, y + 0.62 * s, 0.22 * s, 0.12 * s, 0.7); // wing
  f.ellipse(x - facing * 0.2 * s, y + 0.72 * s, 0.14 * s, 0.08 * s, 0.65);
  f.ellipse(x, y + 0.45 * s, 0.14 * s, 0.19 * s, 1); // body
  f.ellipse(x + facing * 0.04 * s, y + 0.74 * s, 0.11 * s, 0.11 * s, 1); // head
  f.line(x - 0.05 * s, y + 0.3 * s, x - 0.14 * s, y + 0.02 * s, 0.08 * s, 0.95); // legs
  f.line(x + 0.05 * s, y + 0.3 * s, x + 0.16 * s, y + 0.06 * s, 0.08 * s, 0.95);
  f.line(x + facing * 0.08 * s, y + 0.55 * s, x + facing * 0.3 * s, y + 0.62 * s, 0.06 * s, 0.95); // arm
}

/** A standing draped woman (weaver / Minerva) with a loom or a spear. */
function woman(f: HeightField, x: number, y: number, s: number, prop: 'loom' | 'spear' | 'spindle') {
  f.ellipse(x, y + 0.32 * s, 0.17 * s, 0.33 * s, 0.9); // skirt (chiton)
  f.ellipse(x, y + 0.68 * s, 0.12 * s, 0.16 * s, 0.95); // torso
  f.ellipse(x, y + 0.9 * s, 0.07 * s, 0.08 * s, 1); // head
  if (prop === 'loom') {
    f.rect(x + 0.24 * s, y, x + 0.27 * s, y + 0.95 * s, 0.6);
    f.rect(x + 0.55 * s, y, x + 0.58 * s, y + 0.95 * s, 0.6);
    f.rect(x + 0.24 * s, y + 0.9 * s, x + 0.58 * s, y + 0.95 * s, 0.6);
    for (let k = 0; k < 6; k++) f.line(x + (0.29 + k * 0.05) * s, y + 0.15 * s, x + (0.29 + k * 0.05) * s, y + 0.88 * s, 0.012 * s, 0.4);
    f.line(x + 0.08 * s, y + 0.65 * s, x + 0.3 * s, y + 0.55 * s, 0.05 * s, 0.9);
  } else if (prop === 'spear') {
    f.line(x - 0.2 * s, y, x - 0.16 * s, y + 1.15 * s, 0.035 * s, 0.9);
    f.ellipse(x + 0.2 * s, y + 0.5 * s, 0.15 * s, 0.22 * s, 0.85); // shield
    f.ellipse(x, y + 0.98 * s, 0.09 * s, 0.05 * s, 1); // helmet crest
  } else {
    f.line(x + 0.08 * s, y + 0.62 * s, x + 0.22 * s, y + 0.82 * s, 0.05 * s, 0.9);
    f.line(x + 0.22 * s, y + 0.82 * s, x + 0.24 * s, y + 0.3 * s, 0.015 * s, 0.6);
  }
}

/** Arms and shields (trophies) for martial friezes. */
function arms(f: HeightField, x: number, y: number, s: number) {
  f.ellipse(x, y + 0.5 * s, 0.22 * s, 0.3 * s, 0.8); // oval shield
  f.ellipse(x, y + 0.5 * s, 0.05 * s, 0.05 * s, 1);
  f.line(x - 0.35 * s, y + 0.05 * s, x + 0.35 * s, y + 0.95 * s, 0.03 * s, 0.75); // spear
  f.ellipse(x + 0.42 * s, y + 0.75 * s, 0.1 * s, 0.11 * s, 0.85); // helmet
  f.rect(x - 0.48 * s, y + 0.2 * s, x - 0.38 * s, y + 0.55 * s, 0.7); // greave
}

function makeRelief(kind: Kind): THREE.MeshStandardMaterial {
  // One tile is 1024 × 128 px, repeated along the frieze; figures stand on a small ground line.
  const W = 1024;
  const H = 128;
  const f = new HeightField(W, H, true);
  f.rect(0, 0, W - 1, 4, 0.5);
  f.rect(0, H - 6, W - 1, H - 1, 0.5);
  if (kind === 'cupids') {
    // Trajanic cupids among acanthus (the frieze of the rebuilt temple of Venus Genetrix).
    acanthus(f, 6, H - 12, 256, 0.5);
    for (let i = 0; i < 4; i++) putto(f, 128 + i * 256, 10, H * 0.82, i % 2 ? -1 : 1);
  } else if (kind === 'arachne') {
    // Women spinning and weaving, Minerva punishing Arachne (Forum of Nerva colonnacce).
    const props: ('loom' | 'spear' | 'spindle')[] = ['spindle', 'loom', 'spear', 'spindle', 'loom', 'spindle'];
    props.forEach((p, i) => woman(f, 70 + i * 165, 8, H * 0.86, p));
  } else if (kind === 'weapons') {
    for (let i = 0; i < 5; i++) arms(f, 100 + i * 205, 10, H * 0.8);
    acanthus(f, H * 0.65, H * 0.3, 205, 0.35);
  } else {
    // Garlands hung from bucrania (ox skulls) with paterae between: altar/temple friezes.
    for (let i = 0; i < 4; i++) {
      const x = i * 256;
      f.ellipse(x, H * 0.7, 18, 22, 0.9);
      f.ellipse(x - 14, H * 0.82, 14, 6, 0.8);
      f.ellipse(x + 14, H * 0.82, 14, 6, 0.8);
      for (let k = 0; k <= 40; k++) {
        const t = k / 40;
        const gx = x + 20 + t * 216;
        const gy = H * 0.7 - Math.sin(t * Math.PI) * H * 0.35;
        f.ellipse(gx, gy, 9, 11, 0.75);
      }
      f.ellipse(x + 128, H * 0.68, 16, 16, 0.85);
    }
  }
  f.blur(2);
  const ground: [number, number, number] = kind === 'arachne' ? [205, 200, 188] : [236, 232, 222];
  const relief: [number, number, number] = kind === 'arachne' ? [236, 232, 222] : [248, 245, 238];
  return reliefMaterial(f, { ground, relief, noise: 0.05, strength: 4, roughness: 0.45, repeat: true });
}

/** Shared relief frieze material (`kind` picks the subject). One texture tile = 8 × 1 frieze heights. */
export function friezeRelief(kind: Kind): THREE.MeshStandardMaterial {
  let m = reliefs.get(kind);
  if (!m) {
    m = makeRelief(kind);
    m.name = `capfora:frieze-${kind}`;
    reliefs.set(kind, m);
  }
  return m;
}

// ---------------------------------------------------------------- relief panels

let minervaPanel: THREE.MeshStandardMaterial | undefined;

/**
 * Square relief panel of Minerva standing with spear and shield in a moulded frame (the attic
 * panels of the Forum of Nerva). UVs 0..1 over the panel face.
 */
export function minervaRelief(): THREE.MeshStandardMaterial {
  if (minervaPanel) return minervaPanel;
  const N = 256;
  const f = new HeightField(N, N, false);
  // Frame: raised border with an inner fillet.
  f.rect(0, 0, N - 1, 14, 0.8);
  f.rect(0, N - 15, N - 1, N - 1, 0.8);
  f.rect(0, 0, 14, N - 1, 0.8);
  f.rect(N - 15, 0, N - 1, N - 1, 0.8);
  f.rect(18, 18, N - 19, 22, 0.5);
  f.rect(18, N - 23, N - 19, N - 19, 0.5);
  // The goddess, frontal, helmeted, spear in the right hand, shield at her left.
  woman(f, N * 0.48, 26, N * 0.74, 'spear');
  f.ellipse(N * 0.48, 26 + N * 0.74 * 1.0, 10, 14, 0.9); // helmet crest
  f.blur(2);
  minervaPanel = reliefMaterial(f, { ground: [214, 208, 196], relief: [242, 238, 230], noise: 0.05, strength: 4, roughness: 0.5, repeat: false });
  minervaPanel.name = 'capfora:minerva-panel';
  return minervaPanel;
}

let granite: THREE.MeshStandardMaterial | undefined;

/** Red Aswan granite (unfluted shafts of the Templum Pacis porticoes): pink-red with dark specks. */
export function redGranite(): THREE.MeshStandardMaterial {
  if (granite) return granite;
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  let seed = 113;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < N * N; i++) {
    const r = rnd();
    let c: [number, number, number];
    if (r < 0.12) c = [38, 32, 34]; // biotite / hornblende
    else if (r < 0.3) c = [212, 196, 190]; // quartz, pale
    else if (r < 0.75) c = [178, 92, 82]; // pink feldspar
    else c = [150, 74, 68];
    const k = 0.9 + rnd() * 0.2;
    data[i * 4] = c[0] * k;
    data[i * 4 + 1] = c[1] * k;
    data[i * 4 + 2] = c[2] * k;
    data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(3, 3);
  t.needsUpdate = true;
  granite = new THREE.MeshStandardMaterial({ map: t, roughness: 0.35, metalness: 0 });
  granite.name = 'capfora:red-granite';
  return granite;
}

let cityPlan: THREE.MeshStandardMaterial | undefined;

/**
 * A marble plan of the city (Flavian, hypothetical: the surviving Severan Forma Urbis is ninety
 * years later): incised blocks of buildings, colonnades and the bend of the Tiber on slabs.
 */
export function cityPlanRelief(): THREE.MeshStandardMaterial {
  if (cityPlan) return cityPlan;
  const W = 512;
  const H = 384;
  const f = new HeightField(W, H, false);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  // Slab joints.
  for (let x = 0; x < W; x += 64) f.rect(x, 0, x + 1, H - 1, -0.5);
  for (let y = 0; y < H; y += 96) f.rect(0, y, W - 1, y + 1, -0.5);
  // The river: a broad incised band sweeping across the lower left.
  for (let i = 0; i <= 200; i++) {
    const t = i / 200;
    const x = t * W * 0.55;
    const y = H * (0.15 + 0.35 * Math.sin(t * 2.4));
    f.ellipse(x, y, 14, 14, -0.6);
  }
  // City blocks: incised outlines with inner rooms; colonnades as dotted lines.
  for (let k = 0; k < 140; k++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const w = 10 + rnd() * 40;
    const h = 8 + rnd() * 30;
    const v = -0.45;
    f.rect(x, y, x + w, y + 1, v);
    f.rect(x, y + h, x + w, y + h + 1, v);
    f.rect(x, y, x + 1, y + h, v);
    f.rect(x + w, y, x + w + 1, y + h + 1, v);
    if (rnd() < 0.3) for (let c = x + 3; c < x + w - 2; c += 4) f.ellipse(c, y + 4, 1, 1, -0.4);
  }
  f.blur(1);
  cityPlan = reliefMaterial(f, { ground: [226, 222, 214], relief: [150, 60, 50], noise: 0.06, strength: 3, roughness: 0.45, repeat: false });
  cityPlan.name = 'capfora:city-plan';
  return cityPlan;
}
