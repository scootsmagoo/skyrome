/**
 * Props for the Forum of Trajan in May 113: statue bases, and the festive fittings put up for the
 * dedication of the Column (12 May): laurel garlands with ribbons, timber grandstands, the
 * ceremonial tribunal with its awning, an altar, incense tripods, banners and the clutter of the
 * last days of work (ladders, crates, a hand-cart).
 *
 * Everything here is HUMAN SCALE (1:1, game metres): seats 0.42 m, steps ≤ 0.2 m, rails 1 m.
 * Each helper writes into a MeshBuilder at the transform `at` (origin on the ground, front −z)
 * and adds simple box colliders where people stand or bump into things.
 */
import * as THREE from 'three';
import { armoredEmperor, togate } from '../../../arch/classical/statues';
import { ProfileBuilder, T, TRS, cylinderBetween, mul, sweep, tube } from '../../../arch/common/geom';
import { inscriptionPanel } from '../../../arch/common/inscription';
import type { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../gfx/materialIds';
import { boxMinMax, solidBox, type Mat } from './trajan-kit';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- statue bases

export interface StatueBaseSpec {
  /** Base footprint (game m) and height. */
  w: number;
  d: number;
  h: number;
  material?: MaterialId;
  /** Inscription on the front (−z) face. */
  lines?: string[];
  detail?: 'high' | 'low';
}

/** Moulded marble statue base (plinth, die, crown). Returns the top height. */
export function statueBase(b: MeshBuilder, at: THREE.Matrix4, s: StatueBaseSpec): number {
  const mat = s.material ?? 'marble';
  const n = s.detail === 'low' ? 1 : 2;
  const foot = Math.min(0.2, s.h * 0.15);
  const crownH = Math.min(0.22, s.h * 0.15);
  b.box(mat, s.w + 0.16, foot, s.d + 0.16, mul(at, T(0, foot / 2, 0)));
  b.box(mat, s.w, s.h - foot - crownH, s.d, mul(at, T(0, (s.h - crownH + foot) / 2, 0)));
  const sq = (hw: number, hd: number, y: number) => [V(-hw, y, -hd), V(hw, y, -hd), V(hw, y, hd), V(-hw, y, hd)];
  const crown = new ProfileBuilder(-0.02, 0).to(0, 0).cymaReversa(0.05, 0.08, n).out(0.03).up(crownH - 0.08).to(-0.02, crownH).build();
  b.add(sweep(crown, sq(s.w / 2, s.d / 2, s.h - crownH), { closed: true }), mat, at);
  b.box(mat, s.w + 0.06, 0.04, s.d + 0.06, mul(at, T(0, s.h - 0.02, 0)));
  solidBox(b, at, 0, s.h / 2, 0, s.w + 0.16, s.h, s.d + 0.16);
  if (s.lines?.length && s.detail !== 'low') {
    const pw = s.w * 0.8;
    const ph = Math.min((s.h - foot - crownH) * 0.7, pw * 0.75);
    inscriptionPanel(b, { lines: s.lines, width: pw, height: ph, style: 'carved', border: true }, mul(at, T(0, foot + (s.h - foot - crownH) * 0.55, -s.d / 2 - 0.012)), { depth: 0.02 });
  }
  return s.h;
}

export type StatueKind = 'togate' | 'armored';

/** A bronze honorific statue on its base. */
export function honorificStatue(b: MeshBuilder, at: THREE.Matrix4, kind: StatueKind, o: { scale?: number; base?: StatueBaseSpec; material?: MaterialId; detail?: 'high' | 'low' } = {}) {
  const base = o.base ?? { w: 1.1, d: 0.9, h: 1.5 };
  const top = statueBase(b, at, { ...base, detail: o.detail });
  const fn = kind === 'togate' ? togate : armoredEmperor;
  fn(b, mul(at, T(0, top, 0)), { material: o.material ?? 'bronze', scale: o.scale ?? 1.15, detail: o.detail ?? 'low', plinth: true });
}

// ---------------------------------------------------------------- garlands

/**
 * Laurel garland swag hung between two points (sagging `sag` m), with ribbon ends. `r` = garland
 * thickness. Leaves are suggested by a bumpy tube.
 */
export function garland(b: MeshBuilder, m: THREE.Matrix4, a: THREE.Vector3, c: THREE.Vector3, sag: number, r = 0.09, ribbons = true, segs = 9) {
  const path: THREE.Vector3[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = a.clone().lerp(c, t);
    p.y -= sag * 4 * t * (1 - t);
    path.push(p);
  }
  b.add(tube(path, (i) => r * (0.75 + 0.35 * Math.abs(Math.sin(i * 2.1)) + 0.4 * Math.sin((i / segs) * Math.PI)), 5), 'foliage_broad', m, { castShadow: false });
  if (!ribbons) return;
  for (const p of [a, c]) {
    b.add(cylinderBetween(p, p.clone().add(V(0.03, -0.55, 0)), 0.025, 0.035, 4), 'fabric_red', m, { castShadow: false });
    b.add(cylinderBetween(p, p.clone().add(V(-0.04, -0.45, 0.02)), 0.025, 0.03, 4), 'fabric_red', m, { castShadow: false });
  }
}

// ---------------------------------------------------------------- grandstand

export interface StandSpec {
  /** Length along x (game m). */
  length: number;
  tiers: number;
  /** Tier rise and depth (seat rows). */
  rise?: number;
  depth?: number;
  detail?: 'high' | 'low';
}

/**
 * Temporary timber grandstand (spectacula): rows of plank seats rising away from the front (−z),
 * on a trestle frame, with a walkable side stair (risers 0.2 m) at the +x end. Returns the seat
 * positions (local) for 'sit' spots: the front edge of each row at a few points.
 */
export function grandstand(b: MeshBuilder, at: THREE.Matrix4, s: StandSpec): { seats: THREE.Vector3[]; depth: number; height: number } {
  const rise = s.rise ?? 0.42;
  const dep = s.depth ?? 0.82;
  const L = s.length;
  const seats: THREE.Vector3[] = [];
  const hi = s.detail !== 'low';
  for (let i = 0; i < s.tiers; i++) {
    const y = (i + 1) * rise;
    const z0 = -s.tiers * dep / 2 + i * dep;
    // Seat plank + riser board.
    b.box('wood', L, 0.06, dep, mul(at, T(0, y - 0.03, z0 + dep / 2)));
    b.box('wood_dark', L, rise - 0.06, 0.04, mul(at, T(0, y - rise / 2 - 0.03, z0 + 0.02)), { castShadow: false });
    solidBox(b, at, 0, y / 2, z0 + dep / 2, L, y, dep);
    const n = Math.max(2, Math.floor(L / 1.4));
    for (let k = 0; k < n; k++) seats.push(V(-L / 2 + ((k + 0.5) * L) / n, y, z0 + 0.25));
  }
  const height = s.tiers * rise;
  const back = s.tiers * dep / 2;
  // Trestles under the back and the rear rail.
  if (hi) {
    for (let k = 0; k <= Math.ceil(L / 3); k++) {
      const x = -L / 2 + Math.min(L, k * 3);
      b.box('wood_dark', 0.12, height + 1.0, 0.12, mul(at, T(x, (height + 1.0) / 2, back - 0.06)));
      b.add(cylinderBetween(V(x, 0, -back + 0.1), V(x, height, back - 0.1), 0.05, 0.05, 4), 'wood_dark', at);
    }
  }
  b.box('wood_dark', L, 0.08, 0.08, mul(at, T(0, height + 0.95, back - 0.06)));
  solidBox(b, at, 0, height + 0.5, back - 0.06, L, 1.0, 0.12);
  // Side stair beside the +x end, climbing along +z: risers ≤ 0.2 m, treads ≥ 0.32 m (the flight
  // starts in front of the stand if the rows are too shallow for that).
  const nSteps = Math.ceil(height / 0.2 - 1e-6);
  const r = height / nSteps;
  const tread = Math.max(0.32, (2 * back) / nSteps);
  const z0 = back - nSteps * tread;
  const sx = L / 2 + 0.55;
  for (let k = 0; k < nSteps; k++) boxMinMax(b, 'wood', at, sx - 0.5, 0, z0 + k * tread, sx + 0.5, (k + 1) * r, z0 + (k + 1) * tread, { collide: true });
  return { seats, depth: s.tiers * dep, height };
}

// ---------------------------------------------------------------- tribunal

export interface TribunalSpec {
  w: number;
  d: number;
  h: number;
  detail?: 'high' | 'low';
}

/**
 * Ceremonial tribunal: a timber platform hung with purple and gold cloth, stairs up the front
 * (−z) in 0.2 m risers, a rail, two curule seats and an awning (velum) on four gilded posts.
 * Returns the local positions of the dignitaries' places and the top height.
 */
export function tribunal(b: MeshBuilder, at: THREE.Matrix4, s: TribunalSpec): { places: THREE.Vector3[]; top: number } {
  const { w, d, h } = s;
  const hi = s.detail !== 'low';
  b.box('wood', w, 0.1, d, mul(at, T(0, h - 0.05, 0)));
  boxMinMax(b, 'wood_dark', at, -w / 2 + 0.1, 0, -d / 2 + 0.1, w / 2 - 0.1, h - 0.1, d / 2 - 0.1, { collide: false });
  solidBox(b, at, 0, h / 2, 0, w, h, d);
  // Purple skirt with a gold band.
  for (const [x, z, sw, sd] of [
    [0, -d / 2 - 0.02, w + 0.04, 0.02],
    [0, d / 2 + 0.02, w + 0.04, 0.02],
    [-w / 2 - 0.02, 0, 0.02, d],
    [w / 2 + 0.02, 0, 0.02, d],
  ] as const) {
    b.box('fabric_purple', sw, h - 0.12, sd, mul(at, T(x, (h - 0.12) / 2, z)), { castShadow: false });
    b.box('gilded_bronze', sw + 0.01, 0.08, sd + 0.01, mul(at, T(x, h - 0.2, z)), { castShadow: false });
  }
  // Front stair (centre), risers ≤ 0.2 m.
  const n = Math.ceil(h / 0.2);
  const r = h / n;
  const sw = Math.min(3, w * 0.4);
  for (let k = 0; k < n; k++) boxMinMax(b, 'wood', at, -sw / 2, 0, -d / 2 - (n - k) * 0.32, sw / 2, (k + 1) * r, -d / 2, { collide: true });
  // Rail round the back and sides (open at the front stair).
  const railY = h + 1.0;
  const rail = (a: THREE.Vector3, c: THREE.Vector3) => {
    b.add(cylinderBetween(a, c, 0.035, 0.035, 5), 'gilded_bronze', at);
  };
  const corners = [V(-w / 2 + 0.1, railY, -d / 2 + 0.1), V(-w / 2 + 0.1, railY, d / 2 - 0.1), V(w / 2 - 0.1, railY, d / 2 - 0.1), V(w / 2 - 0.1, railY, -d / 2 + 0.1)];
  rail(corners[0], corners[1]);
  rail(corners[1], corners[2]);
  rail(corners[2], corners[3]);
  rail(corners[0], V(-sw / 2 - 0.2, railY, -d / 2 + 0.1));
  rail(corners[3], V(sw / 2 + 0.2, railY, -d / 2 + 0.1));
  solidBox(b, at, -w / 2 + 0.1, h + 0.5, 0, 0.1, 1.0, d);
  solidBox(b, at, w / 2 - 0.1, h + 0.5, 0, 0.1, 1.0, d);
  solidBox(b, at, 0, h + 0.5, d / 2 - 0.1, w, 1.0, 0.1);
  // Awning on four gilded posts.
  const postH = 3.4;
  for (const [x, z] of [
    [-w / 2 + 0.15, -d / 2 + 0.15],
    [w / 2 - 0.15, -d / 2 + 0.15],
    [-w / 2 + 0.15, d / 2 - 0.15],
    [w / 2 - 0.15, d / 2 - 0.15],
  ]) {
    b.add(cylinderBetween(V(x, h, z), V(x, h + postH, z), 0.06, 0.05, 6), 'gilded_bronze', at);
    solidBox(b, at, x, h + postH / 2, z, 0.14, postH, 0.14);
  }
  const awn = new THREE.BufferGeometry();
  const y0 = h + postH;
  const sagY = y0 - 0.25;
  awn.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        [-w / 2, y0, -d / 2], [w / 2, y0, -d / 2], [w / 2, sagY, 0],
        [-w / 2, y0, -d / 2], [w / 2, sagY, 0], [-w / 2, sagY, 0],
        [-w / 2, sagY, 0], [w / 2, sagY, 0], [w / 2, y0, d / 2],
        [-w / 2, sagY, 0], [w / 2, y0, d / 2], [-w / 2, y0, d / 2],
      ].flat(),
      3,
    ),
  );
  awn.computeVertexNormals();
  // Double-sided by adding the reversed copy.
  const back = awn.clone();
  const p = back.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i += 3) {
    const ax = p.getX(i), ay = p.getY(i), az = p.getZ(i);
    p.setXYZ(i, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
    p.setXYZ(i + 2, ax, ay, az);
  }
  back.computeVertexNormals();
  b.add(awn, 'fabric_purple', at);
  b.add(back, 'fabric_white', at, { castShadow: false });
  // Valance with gold fringe along the front.
  b.box('fabric_purple', w, 0.35, 0.02, mul(at, T(0, y0 - 0.17, -d / 2)));
  b.box('gilded_bronze', w, 0.05, 0.03, mul(at, T(0, y0 - 0.36, -d / 2)));
  // Curule seats (sellae curules): X-legs in ivory/gilt and a cushion.
  const places: THREE.Vector3[] = [];
  const seats = hi ? [-1.1, 1.1] : [];
  for (const x of seats) {
    const c = mul(at, T(x, h, d / 2 - 0.9));
    for (const sz of [-1, 1]) {
      b.add(cylinderBetween(V(-0.28, 0, sz * 0.2), V(0.28, 0.48, sz * 0.2), 0.025, 0.025, 4), 'gilded_bronze', c);
      b.add(cylinderBetween(V(0.28, 0, sz * 0.2), V(-0.28, 0.48, sz * 0.2), 0.025, 0.025, 4), 'gilded_bronze', c);
    }
    b.box('fabric_purple', 0.62, 0.06, 0.48, mul(c, T(0, 0.5, 0)));
  }
  places.push(V(-1.1, h, d / 2 - 0.9), V(1.1, h, d / 2 - 0.9), V(0, h, -d / 2 + 0.7));
  return { places, top: h };
}

// ---------------------------------------------------------------- altar, tripods, banners

/** Marble altar hung with garlands, with the sacred fire burning on top. Returns its top height. */
export function altar(b: MeshBuilder, at: THREE.Matrix4, o: { w?: number; d?: number; h?: number; fire?: boolean } = {}) {
  const w = o.w ?? 1.6;
  const d = o.d ?? 1.0;
  const h = o.h ?? 1.1;
  statueBase(b, at, { w, d, h, material: 'marble' });
  // Bolsters (pulvini) at the ends of the top.
  for (const sx of [-1, 1]) b.add(cylinderBetween(V(sx * (w / 2 - 0.1), h + 0.1, -d / 2), V(sx * (w / 2 - 0.1), h + 0.1, d / 2), 0.11, 0.11, 8), 'marble', at);
  // Garlands on the long faces, held by bucrania (ox skulls) at the corners.
  for (const sz of [-1, 1]) {
    const z = sz * (d / 2 + 0.05);
    garland(b, at, V(-w / 2 + 0.05, h * 0.78, z), V(w / 2 - 0.05, h * 0.78, z), 0.25, 0.05, true, 7);
    for (const sx of [-1, 1]) {
      const sk = new THREE.SphereGeometry(0.08, 6, 4);
      sk.scale(1, 1.3, 0.6);
      sk.translate(sx * (w / 2 - 0.05), h * 0.82, z);
      b.add(sk, 'marble', at);
    }
  }
  if (o.fire ?? true) {
    const f = new THREE.ConeGeometry(0.2, 0.45, 6);
    f.translate(0, h + 0.25, 0);
    b.add(f, 'glow_fire', at, { castShadow: false });
  }
  return h;
}

/** Bronze tripod with a brazier of glowing incense coals. */
export function tripod(b: MeshBuilder, at: THREE.Matrix4, h = 1.2) {
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    b.add(cylinderBetween(V(Math.sin(a) * 0.35, 0, Math.cos(a) * 0.35), V(Math.sin(a) * 0.2, h, Math.cos(a) * 0.2), 0.025, 0.02, 4), 'bronze', at);
  }
  const bowl = new THREE.CylinderGeometry(0.28, 0.16, 0.18, 10, 1, true);
  bowl.translate(0, h + 0.05, 0);
  b.add(bowl, 'bronze', at);
  const coals = new THREE.CylinderGeometry(0.25, 0.25, 0.04, 10);
  coals.translate(0, h + 0.1, 0);
  b.add(coals, 'glow_fire', at, { castShadow: false });
  solidBox(b, at, 0, h / 2, 0, 0.5, h, 0.5);
}

/** A vexillum: a pole with a crossbar and a hanging square banner (red with a gold fringe). */
export function banner(b: MeshBuilder, at: THREE.Matrix4, h = 5, cloth: MaterialId = 'fabric_red') {
  b.add(cylinderBetween(V(0, 0, 0), V(0, h, 0), 0.05, 0.04, 6), 'wood_dark', at);
  b.add(cylinderBetween(V(-0.6, h - 0.15, 0), V(0.6, h - 0.15, 0), 0.03, 0.03, 4), 'gilded_bronze', at);
  b.box(cloth, 1.1, 1.3, 0.02, mul(at, T(0, h - 0.85, 0)));
  b.box('gilded_bronze', 1.1, 0.06, 0.03, mul(at, T(0, h - 1.52, 0)));
  const knob = new THREE.SphereGeometry(0.09, 6, 4);
  knob.translate(0, h + 0.05, 0);
  b.add(knob, 'gilded_bronze', at);
  solidBox(b, at, 0, h / 2, 0, 0.12, h, 0.12);
}

/** Ladder leaning against a wall (foot at the origin, leaning towards +z by `lean`). */
export function ladder(b: MeshBuilder, at: THREE.Matrix4, h = 5, lean = 1.2) {
  for (const sx of [-1, 1]) b.add(cylinderBetween(V(sx * 0.25, 0, 0), V(sx * 0.25, h, lean), 0.035, 0.035, 4), 'wood', at);
  const n = Math.floor(h / 0.32);
  for (let k = 1; k < n; k++) {
    const t = k / n;
    b.add(cylinderBetween(V(-0.25, h * t, lean * t), V(0.25, h * t, lean * t), 0.02, 0.02, 4), 'wood', at);
  }
}

/** A small pile of crates and baskets, a stack of marble offcuts and a hand-cart. */
export function workClutter(b: MeshBuilder, at: THREE.Matrix4, seed = 1) {
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 4; i++) {
    const w = 0.5 + rnd() * 0.3;
    const x = (rnd() - 0.5) * 1.6;
    const z = (rnd() - 0.5) * 1.2;
    const y = i === 3 ? 0.55 : 0;
    b.box('wood', w, 0.5, w * 0.8, mul(at, TRS(x, y + 0.25, z, 0, rnd(), 0)), { collide: y === 0 });
  }
  const basket = new THREE.CylinderGeometry(0.28, 0.22, 0.4, 8);
  basket.translate(1.3, 0.2, 0.4);
  b.add(basket, 'wood_dark', at);
  // Marble offcuts.
  b.box('marble', 1.2, 0.3, 0.6, mul(at, TRS(-1.6, 0.15, -0.5, 0, 0.3, 0)), { collide: true });
  b.box('marble', 0.8, 0.25, 0.5, mul(at, TRS(-1.5, 0.42, -0.45, 0, 0.6, 0)));
  // Hand-cart: a box on two wheels with shafts.
  const cart = mul(at, TRS(0.4, 0, 1.8, 0, 0.4, 0));
  b.box('wood', 1.0, 0.35, 1.3, mul(cart, T(0, 0.65, 0)), { collide: true });
  for (const sx of [-1, 1]) {
    const wheel = new THREE.CylinderGeometry(0.42, 0.42, 0.08, 10);
    wheel.rotateZ(Math.PI / 2);
    wheel.translate(sx * 0.58, 0.42, 0);
    b.add(wheel, 'wood_dark', cart);
    b.add(cylinderBetween(V(sx * 0.35, 0.65, -0.6), V(sx * 0.3, 0.35, -1.8), 0.03, 0.03, 4), 'wood', cart);
  }
}

/** A rolled rug/carpet path laid on the paving (thin strip, no collider). */
export function carpet(b: MeshBuilder, at: THREE.Matrix4, w: number, l: number, mat: MaterialId = 'fabric_red') {
  b.box(mat, w, 0.012, l, mul(at, T(0, 0.006, 0)), { castShadow: false });
  b.box('fabric_ochre', 0.12, 0.014, l, mul(at, T(-w / 2 + 0.1, 0.007, 0)), { castShadow: false });
  b.box('fabric_ochre', 0.12, 0.014, l, mul(at, T(w / 2 - 0.1, 0.007, 0)), { castShadow: false });
}

/** Mat type re-export for builders that pass custom materials through. */
export type { Mat };
