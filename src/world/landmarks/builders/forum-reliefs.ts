/**
 * Relief panels of the Forum, drawn into height fields (src/arch/common/relief.ts) and turned
 * into albedo + normal materials: the two passage reliefs of the Arch of Titus (the spoils of
 * Jerusalem; Titus in his quadriga), the apotheosis eagle of its vault, the sacrificial
 * instruments of the Temple of Vespasian's frieze, Curtius leaping into the chasm, and the
 * Dioscuri. One shared material per panel (cached), so far and near versions reuse it.
 *
 * Panels are sculpted for a flat plane: x to the right, y up (row 0 = bottom).
 */
import * as THREE from 'three';
import { HeightField, reliefMaterial } from '../../../arch/common/relief';
import type { MeshBuilder } from '../../../gfx/MeshBuilder';

type F = HeightField;

const cache = new Map<string, THREE.MeshStandardMaterial>();

function cached(key: string, make: () => THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  let m = cache.get(key);
  if (!m) {
    m = make();
    m.name = `forum-relief:${key}`;
    cache.set(key, m);
  }
  return m;
}

/** Deterministic noise for small variations. */
function rnd(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * A flat relief panel `w` × `h` centred on the origin of `at`, facing −z, with its own UVs
 * (the texture repeated `repeatU` times across, for friezes).
 */
export function panel(b: MeshBuilder, mat: THREE.Material, w: number, h: number, at: THREE.Matrix4, repeatU = 1) {
  const g = new THREE.PlaneGeometry(w, h);
  g.rotateY(Math.PI);
  if (repeatU !== 1) {
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * repeatU);
  }
  b.add(g, mat, at, { uv: 'keep', castShadow: false });
}

// ---------------------------------------------------------------- figures

/** A walking man in a short tunic, wreathed (feet at x, y; height s; facing ±1). */
function walker(f: F, x: number, y: number, s: number, facing: 1 | -1, v = 0.85, arms: 'up' | 'down' | 'pole' = 'down') {
  const k = facing;
  f.line(x - 0.05 * s * k, y, x, y + 0.42 * s, 0.07 * s, v); // back leg
  f.line(x + 0.1 * s * k, y, x + 0.03 * s * k, y + 0.42 * s, 0.07 * s, v); // front leg
  f.ellipse(x, y + 0.52 * s, 0.13 * s, 0.13 * s, v); // tunic skirt
  f.ellipse(x + 0.01 * s * k, y + 0.7 * s, 0.1 * s, 0.17 * s, v); // torso
  f.ellipse(x + 0.03 * s * k, y + 0.92 * s, 0.065 * s, 0.075 * s, v); // head
  f.line(x - 0.03 * s * k, y + 0.97 * s, x + 0.08 * s * k, y + 0.97 * s, 0.025 * s, v * 1.05); // laurel wreath
  if (arms === 'up') {
    f.line(x, y + 0.82 * s, x + 0.06 * s * k, y + 1.08 * s, 0.045 * s, v);
  } else if (arms === 'pole') {
    f.line(x + 0.02 * s * k, y + 0.8 * s, x + 0.14 * s * k, y + 0.84 * s, 0.045 * s, v);
  } else {
    f.line(x, y + 0.82 * s, x + 0.08 * s * k, y + 0.56 * s, 0.045 * s, v);
  }
}

/** The seven-branched lampstand (menorah) on its stepped octagonal base; centre-bottom at (x, y). */
function menorah(f: F, x: number, y: number, s: number, v = 1) {
  f.rect(x - 0.32 * s, y, x + 0.32 * s, y + 0.1 * s, v * 0.95);
  f.rect(x - 0.24 * s, y + 0.1 * s, x + 0.24 * s, y + 0.2 * s, v * 0.95);
  f.rect(x - 0.16 * s, y + 0.2 * s, x + 0.16 * s, y + 0.28 * s, v * 0.95);
  const top = y + s;
  f.line(x, y + 0.28 * s, x, top, 0.05 * s, v);
  // three nested arms each side, semicircular, ending at the same height
  for (let i = 1; i <= 3; i++) {
    const r = 0.13 * s * i;
    const cy = top - r * 1.05;
    const n = 14;
    for (let k = 0; k < n; k++) {
      const a0 = Math.PI + (Math.PI * k) / n;
      const a1 = Math.PI + (Math.PI * (k + 1)) / n;
      f.line(x + Math.cos(a0) * r, cy + Math.sin(a0) * r * 1.05, x + Math.cos(a1) * r, cy + Math.sin(a1) * r * 1.05, 0.04 * s, v);
    }
    // the arms rise vertically at the outer ends
    f.line(x - r, cy, x - r, top, 0.04 * s, v);
    f.line(x + r, cy, x + r, top, 0.04 * s, v);
  }
  for (let i = -3; i <= 3; i++) f.ellipse(x + i * 0.13 * s, top + 0.02 * s, 0.03 * s, 0.025 * s, v); // lamps
  // knobs (bulbs and flowers) on the shaft
  for (let j = 0; j < 4; j++) f.ellipse(x, y + (0.38 + j * 0.17) * s, 0.04 * s, 0.03 * s, v);
}

/** A horse in profile (facing +1 = right), hooves at y, withers height s. */
function horseFig(f: F, x: number, y: number, s: number, facing: 1 | -1, v = 0.9, prance = false) {
  const k = facing;
  f.ellipse(x, y + 0.72 * s, 0.42 * s, 0.2 * s, v); // barrel
  f.line(x + 0.32 * s * k, y + 0.8 * s, x + 0.52 * s * k, y + 1.12 * s, 0.17 * s, v); // neck
  f.line(x + 0.52 * s * k, y + 1.12 * s, x + 0.7 * s * k, y + 0.98 * s, 0.11 * s, v); // head
  // legs
  const fl = prance ? [x + 0.3 * s * k, y + 0.62 * s, x + 0.52 * s * k, y + 0.45 * s] : [x + 0.3 * s * k, y + 0.6 * s, x + 0.34 * s * k, y];
  f.line(fl[0], fl[1], fl[2], fl[3], 0.06 * s, v);
  f.line(x + 0.22 * s * k, y + 0.6 * s, x + 0.26 * s * k, y, 0.06 * s, v);
  f.line(x - 0.3 * s * k, y + 0.62 * s, x - 0.38 * s * k, y, 0.065 * s, v);
  f.line(x - 0.22 * s * k, y + 0.62 * s, x - 0.18 * s * k, y, 0.06 * s, v);
  f.line(x - 0.4 * s * k, y + 0.8 * s, x - 0.52 * s * k, y + 0.4 * s, 0.05 * s, v * 0.9); // tail
}

/** Lictor carrying the fasces on the shoulder. */
function lictor(f: F, x: number, y: number, s: number, facing: 1 | -1, v = 0.8) {
  walker(f, x, y, s, facing, v, 'pole');
  f.line(x - 0.05 * s * facing, y + 0.62 * s, x + 0.18 * s * facing, y + 1.12 * s, 0.05 * s, v * 1.05);
}

// ---------------------------------------------------------------- panels

/** Arch of Titus, south passage relief: the spoils of the Temple carried towards a triumphal arch. */
export function spoilsMaterial(): THREE.MeshStandardMaterial {
  return cached('spoils', () => {
    const w = 1024;
    const h = 400;
    const f = new HeightField(w, h);
    const r = rnd(70);
    const g = 26;
    const s = 300;
    f.rect(0, 0, w, g, 0.35);
    // the arch at the right end (the Porta Triumphalis), seen obliquely
    f.rect(w - 120, g, w - 20, g + 300, 0.55);
    f.rect(w - 100, g, w - 40, g + 190, 0.2);
    f.ellipse(w - 70, g + 190, 30, 30, 0.2);
    f.rect(w - 130, g + 300, w - 10, g + 330, 0.6);
    // bearers, wreathed, moving right
    for (let i = 0; i < 9; i++) {
      const x = 40 + i * 92 + r() * 18;
      walker(f, x, g, s * (0.92 + r() * 0.08), 1, 0.7 + r() * 0.15, i % 3 === 0 ? 'up' : 'pole');
    }
    // the menorah on its bier (ferculum) with carrying poles
    f.rect(330, g + 175, 560, g + 188, 0.95);
    menorah(f, 445, g + 188, 180, 1);
    // the table of the showbread, the silver trumpets crossed over it
    f.rect(130, g + 205, 260, g + 214, 0.95);
    f.rect(140, g + 214, 250, g + 262, 0.9);
    f.line(140, g + 270, 250, g + 300, 7, 1);
    f.line(140, g + 300, 250, g + 270, 7, 1);
    f.ellipse(140, g + 285, 9, 14, 1);
    f.ellipse(250, g + 285, 9, 14, 1);
    // placards (tituli) on poles
    for (const x of [640, 760]) {
      f.line(x, g + 150, x, g + 330, 5, 0.85);
      f.rect(x - 34, g + 300, x + 34, g + 350, 0.9);
    }
    f.blur(2);
    return reliefMaterial(f, { ground: [212, 204, 190], relief: [242, 238, 230], strength: 4.5, roughness: 0.55, noise: 0.06 });
  });
}

/** Arch of Titus, north passage relief: Titus in the quadriga crowned by Victory, Roma at the horses' heads. */
export function triumphMaterial(): THREE.MeshStandardMaterial {
  return cached('triumph', () => {
    const w = 1024;
    const h = 400;
    const f = new HeightField(w, h);
    const g = 26;
    f.rect(0, 0, w, g, 0.35);
    // lictors behind (left, low relief) and in front
    for (let i = 0; i < 4; i++) lictor(f, 40 + i * 60, g, 280, 1, 0.55);
    for (let i = 0; i < 3; i++) lictor(f, 820 + i * 66, g, 280, 1, 0.55);
    // four horses abreast (staggered), led to the right
    for (let i = 0; i < 4; i++) horseFig(f, 540 + i * 40, g + i * 4, 210, 1, 0.75 + i * 0.07, i === 3);
    // the chariot box with its wheel
    f.rect(330, g + 70, 470, g + 190, 0.95);
    f.ellipse(400, g + 70, 62, 62, 0.85);
    f.ellipse(400, g + 70, 22, 22, 1);
    // Titus standing in the chariot, laureate, holding a sceptre
    f.ellipse(410, g + 230, 34, 60, 1);
    f.ellipse(412, g + 305, 22, 24, 1);
    f.line(440, g + 200, 470, g + 330, 6, 1);
    // Victory behind him, winged, holding a wreath over his head
    f.ellipse(350, g + 250, 28, 70, 0.8);
    f.ellipse(352, g + 330, 18, 20, 0.8);
    f.line(330, g + 270, 260, g + 360, 40, 0.75);
    f.line(365, g + 300, 405, g + 340, 8, 0.85);
    f.ellipse(410, g + 342, 20, 8, 0.95);
    // Roma (helmeted) leading the horses
    walker(f, 740, g, 300, -1, 0.8, 'up');
    f.ellipse(752, g + 296, 20, 14, 0.9);
    f.blur(2);
    return reliefMaterial(f, { ground: [212, 204, 190], relief: [242, 238, 230], strength: 4.5, roughness: 0.55, noise: 0.06 });
  });
}

/** Square vault panel: the eagle carrying Titus to heaven. */
export function apotheosisMaterial(): THREE.MeshStandardMaterial {
  return cached('apotheosis', () => {
    const n = 256;
    const f = new HeightField(n, n);
    f.rect(0, 0, n, 10, 0.6);
    f.rect(0, n - 10, n, n, 0.6);
    f.rect(0, 0, 10, n, 0.6);
    f.rect(n - 10, 0, n, n, 0.6);
    // eagle, wings spread
    f.ellipse(128, 110, 26, 40, 0.9);
    f.line(128, 120, 40, 175, 22, 0.85);
    f.line(128, 120, 216, 175, 22, 0.85);
    f.line(60, 165, 30, 120, 14, 0.8);
    f.line(196, 165, 226, 120, 14, 0.8);
    f.ellipse(128, 158, 12, 14, 0.9);
    // the emperor seated on its back
    f.ellipse(128, 80, 20, 30, 1);
    f.ellipse(128, 58, 10, 11, 1);
    f.blur(2);
    return reliefMaterial(f, { ground: [200, 192, 178], relief: [240, 236, 226], strength: 4, roughness: 0.6 });
  });
}

/** Repeating frieze of sacrificial instruments and ox skulls (Temple of Vespasian). */
export function sacrificeFriezeMaterial(): THREE.MeshStandardMaterial {
  return cached('sacrifice', () => {
    const w = 1024;
    const h = 160;
    const f = new HeightField(w, h, true);
    const unit = w / 4;
    for (let i = 0; i < 4; i++) {
      const x = i * unit;
      // bucranium with fillets
      f.ellipse(x + 30, 80, 18, 30, 0.95);
      f.line(x + 14, 102, x + 2, 128, 6, 0.9);
      f.line(x + 46, 102, x + 58, 128, 6, 0.9);
      f.line(x + 20, 60, x + 16, 25, 4, 0.7);
      f.line(x + 40, 60, x + 44, 25, 4, 0.7);
      // galerus (priest's cap with spike)
      f.ellipse(x + 90, 70, 20, 16, 0.9);
      f.line(x + 90, 84, x + 90, 120, 4, 0.9);
      // aspergillum, urceus (jug), patera, knife and axe
      f.line(x + 128, 40, x + 128, 115, 4, 0.85);
      f.ellipse(x + 128, 122, 9, 9, 0.9);
      f.ellipse(x + 165, 70, 15, 26, 0.95);
      f.line(x + 165, 96, x + 172, 112, 5, 0.9);
      f.ellipse(x + 205, 80, 22, 22, 0.8);
      f.ellipse(x + 205, 80, 8, 8, 1);
      f.line(x + 235, 40, x + 245, 120, 5, 0.9);
      f.rect(x + 238, 100, x + 252, 120, 0.9);
    }
    f.blur(1);
    return reliefMaterial(f, { ground: [222, 216, 204], relief: [244, 240, 232], strength: 3.5, roughness: 0.55, repeat: true });
  });
}

/** Marcus Curtius on horseback leaping into the chasm. */
export function curtiusMaterial(): THREE.MeshStandardMaterial {
  return cached('curtius', () => {
    const w = 512;
    const h = 384;
    const f = new HeightField(w, h);
    // rocks and reeds of the chasm
    for (let i = 0; i < 8; i++) f.ellipse(30 + i * 62, 30, 40, 30, 0.55);
    f.line(420, 60, 440, 160, 4, 0.5);
    f.line(450, 60, 470, 150, 4, 0.5);
    horseFig(f, 230, 90, 210, -1, 0.95, true);
    // the rider in armour, shield on his arm
    f.ellipse(240, 300, 26, 44, 1);
    f.ellipse(236, 352, 16, 17, 1);
    f.ellipse(210, 290, 26, 30, 0.95);
    f.line(260, 320, 300, 362, 7, 1);
    f.blur(2);
    return reliefMaterial(f, { ground: [210, 202, 188], relief: [240, 236, 228], strength: 4, roughness: 0.6 });
  });
}
