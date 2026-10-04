/**
 * Small architectural and sculptural pieces for the Capitoline / Imperial Fora builders:
 * festoons (the garlands of the 12 May 113 rededication), relief frieze strips, caryatids and
 * Ammon shields (Forum of Augustus attic), altars, inscribed statue pedestals, coffers, opus
 * sectile floors, fountain basins. All write into a MeshBuilder in the caller's local frame.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { armoredEmperor, equestrian, seatedDeity, togate } from '../../../../arch/classical/statues';
import { ProfileBuilder, lathe, makeGeometry, mul, tube, type V2 } from '../../../../arch/common/geom';
import { inscriptionPanel, latinize, type InscriptionStyle } from '../../../../arch/common/inscription';
import type { MeshBuilder } from '../../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../../gfx/materialIds';
import { PAINT, paint } from './paint';

export type Detail = 'high' | 'low';
const I = () => new THREE.Matrix4();

/** Box centred at (cx, cy, cz) in frame `at`, optionally with a matching collider. */
export function box(b: MeshBuilder, mat: MaterialId | THREE.Material, cx: number, cy: number, cz: number, w: number, h: number, d: number, at?: THREE.Matrix4, collide = false, ry = 0) {
  if (w <= 0 || h <= 0 || d <= 0) return;
  const m = new THREE.Matrix4().makeRotationY(ry).setPosition(cx, cy, cz);
  b.box(mat, w, h, d, mul(at, m), { collide });
}

/** Axis-aligned box between two corners. */
export function span(b: MeshBuilder, mat: MaterialId | THREE.Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, at?: THREE.Matrix4, collide = false) {
  box(b, mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), at, collide);
}

/** Collider-only box. */
export function solid(b: MeshBuilder, cx: number, cy: number, cz: number, w: number, h: number, d: number, at?: THREE.Matrix4, ry = 0) {
  const m = mul(at, new THREE.Matrix4().makeRotationY(ry).setPosition(cx, cy, cz));
  const pos = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  m.decompose(pos, q, s);
  b.collider({ kind: 'box', center: pos, half: new THREE.Vector3(w / 2, h / 2, d / 2), rotation: q });
}

// ---------------------------------------------------------------- festoons

/**
 * A garland (festoon) hung between two points, sagging by `sag`: laurel and oak leaves bound
 * round a core, roses tucked in, red ribbons (taeniae) hanging from both ends.
 */
export function festoon(b: MeshBuilder, a: THREE.Vector3, c: THREE.Vector3, opts: { sag?: number; r?: number; detail?: Detail; at?: THREE.Matrix4; ribbons?: boolean } = {}) {
  const sag = opts.sag ?? a.distanceTo(c) * 0.22;
  const r = opts.r ?? 0.12;
  const hi = (opts.detail ?? 'high') === 'high';
  const n = hi ? 12 : 6;
  const path: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    path.push(a.clone().lerp(c, t).add(new THREE.Vector3(0, -4 * sag * t * (1 - t), 0)));
  }
  const g = tube(path, (i) => r * (0.55 + 0.45 * Math.sin((Math.PI * i) / n)), hi ? 6 : 4, true);
  b.add(g, paint(PAINT.laurel, 0.9), opts.at);
  if (hi) {
    // Roses along the swag.
    const rose = new THREE.IcosahedronGeometry(r * 0.55, 0);
    for (const t of [0.3, 0.5, 0.7]) {
      const p = a.clone().lerp(c, t).add(new THREE.Vector3(0, -4 * sag * t * (1 - t) - r * 0.2, 0));
      b.add(rose.clone().translate(p.x, p.y, p.z), paint(PAINT.rose, 0.8), opts.at);
    }
  }
  if (opts.ribbons ?? true) {
    for (const p of [a, c]) {
      const len = r * 6;
      const rib = new THREE.BoxGeometry(r * 0.35, len, 0.015);
      rib.translate(p.x, p.y - len / 2, p.z - r * 0.4);
      b.add(rib, 'fabric_red', opts.at, { castShadow: false });
    }
  }
}

// ---------------------------------------------------------------- frieze strip

/**
 * A relief strip in the plane z = 0 facing −z, from x0 to x1 and y0 to y0 + h, with UVs so the
 * relief texture repeats every `tile` metres along x and spans the full height.
 */
export function friezeStrip(b: MeshBuilder, mat: THREE.Material, x0: number, x1: number, y0: number, h: number, tile: number, at?: THREE.Matrix4) {
  const y1 = y0 + h;
  const u0 = 0;
  const u1 = (x1 - x0) / tile;
  const pos = [x0, y0, 0, x1, y1, 0, x1, y0, 0, x0, y0, 0, x0, y1, 0, x1, y1, 0];
  // Facing −z: viewed from −z, +x runs to the LEFT; mirror u so the relief reads correctly.
  const uv = [u1, 0, u0, 1, u0, 0, u1, 0, u1, 1, u0, 1];
  const nor = [0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1];
  b.add(makeGeometry(pos, nor, uv), mat, at, { uv: 'keep', castShadow: false });
}

// ---------------------------------------------------------------- caryatid and Ammon shield

/**
 * A caryatid (copy of an Erechtheion kore) of height H carrying the attic cornice on a basket
 * capital (polos). Faces −z, feet at y = 0.
 */
export function caryatid(b: MeshBuilder, H: number, at: THREE.Matrix4, opts: { detail?: Detail; material?: MaterialId } = {}) {
  const hi = (opts.detail ?? 'high') === 'high';
  const mat = opts.material ?? 'marble';
  const seg = hi ? 10 : 6;
  const k = H;
  // Drapery: chiton to the ground, girdled peplos over it.
  const prof = new ProfileBuilder(0, 0.0)
    .to(0.125 * k, 0)
    .to(0.12 * k, 0.32 * k)
    .to(0.112 * k, 0.5 * k)
    .to(0.1 * k, 0.58 * k)
    .to(0.118 * k, 0.66 * k)
    .to(0.112 * k, 0.74 * k)
    .to(0.1 * k, 0.79 * k)
    .to(0.035 * k, 0.81 * k)
    .to(0, 0.81 * k)
    .build();
  const body = lathe(prof, { segments: seg });
  body.scale(1, 1, 0.72);
  b.add(body, mat, at);
  if (hi) {
    // Vertical folds over the weight-bearing leg (the 'column flutes' of the kore).
    for (let i = 0; i < 7; i++) {
      const x = (-0.07 + i * 0.023) * k;
      const f = new THREE.CylinderGeometry(0.009 * k, 0.012 * k, 0.5 * k, 4);
      f.translate(x + 0.03 * k, 0.25 * k, -0.082 * k);
      b.add(f, mat, at);
    }
  }
  // Neck, head, hair, polos and abacus.
  const neck = new THREE.CylinderGeometry(0.03 * k, 0.034 * k, 0.06 * k, seg);
  neck.translate(0, 0.835 * k, 0);
  b.add(neck, mat, at);
  const head = new THREE.SphereGeometry(0.058 * k, seg, hi ? 8 : 5);
  head.scale(0.9, 1.1, 1);
  head.translate(0, 0.9 * k, -0.005 * k);
  b.add(head, mat, at);
  const hair = new THREE.SphereGeometry(0.05 * k, seg, 4);
  hair.scale(1, 1.4, 0.9);
  hair.translate(0, 0.82 * k, 0.05 * k);
  b.add(hair, mat, at);
  const polos = new THREE.CylinderGeometry(0.07 * k, 0.055 * k, 0.05 * k, seg);
  polos.translate(0, 0.97 * k, 0);
  b.add(polos, mat, at);
  const abacus = new THREE.BoxGeometry(0.2 * k, 0.03 * k, 0.2 * k);
  abacus.translate(0, 0.985 * k + 0.015 * k, 0);
  b.add(abacus, mat, at);
  // Arms hanging, one hand holding the folds.
  for (const sx of [-1, 1]) {
    const arm = new THREE.CylinderGeometry(0.022 * k, 0.03 * k, 0.32 * k, hi ? 6 : 4);
    arm.rotateZ(sx * 0.12);
    arm.translate(sx * 0.125 * k, 0.6 * k, 0);
    b.add(arm, mat, at);
  }
}

/** A clipeus: round shield medallion with a head of Jupiter Ammon (ram's horns), facing −z. */
export function clipeus(b: MeshBuilder, R: number, at: THREE.Matrix4, opts: { detail?: Detail; material?: MaterialId } = {}) {
  const hi = (opts.detail ?? 'high') === 'high';
  const mat = opts.material ?? 'marble';
  const seg = hi ? 20 : 10;
  const disc = new THREE.CylinderGeometry(R, R, 0.08 * R, seg);
  disc.rotateX(Math.PI / 2);
  disc.translate(0, 0, -0.04 * R);
  b.add(disc, mat, at);
  const rim = new THREE.TorusGeometry(R * 0.92, R * 0.07, 4, seg);
  rim.translate(0, 0, -0.1 * R);
  b.add(rim, mat, at);
  if (hi) {
    const tongue = new THREE.TorusGeometry(R * 0.72, R * 0.035, 3, seg);
    tongue.translate(0, 0, -0.09 * R);
    b.add(tongue, mat, at);
  }
  const head = new THREE.SphereGeometry(R * 0.36, hi ? 10 : 6, hi ? 8 : 4);
  head.scale(0.85, 1.05, 0.6);
  head.translate(0, -0.02 * R, -0.18 * R);
  b.add(head, mat, at);
  // Curled ram's horns at the temples, and a beard.
  for (const sx of [-1, 1]) {
    const horn = new THREE.TorusGeometry(R * 0.13, R * 0.05, 4, hi ? 10 : 6, Math.PI * 1.6);
    horn.translate(sx * R * 0.34, R * 0.12, -0.2 * R);
    b.add(horn, mat, at);
  }
  const beard = new THREE.SphereGeometry(R * 0.2, 6, 4);
  beard.scale(1, 1.2, 0.6);
  beard.translate(0, -R * 0.33, -0.2 * R);
  b.add(beard, mat, at);
}

// ---------------------------------------------------------------- altars, pedestals, statues

/**
 * A moulded altar: plinth, die, crown with bolsters (pulvini) at the sides and a fire tray.
 * Origin on the ground at the centre, long side along x.
 */
export function altar(b: MeshBuilder, w: number, d: number, h: number, at: THREE.Matrix4, opts: { material?: MaterialId; detail?: Detail; fire?: boolean; collide?: boolean } = {}) {
  const mat = opts.material ?? 'marble';
  box(b, mat, 0, h * 0.06, 0, w * 1.1, h * 0.12, d * 1.1, at, opts.collide ?? true);
  box(b, mat, 0, h * 0.5, 0, w, h * 0.78, d, at);
  box(b, mat, 0, h * 0.93, 0, w * 1.08, h * 0.1, d * 1.08, at);
  // Garland relief band on the die (painted green with red ribbons).
  box(b, paint(PAINT.laurel), 0, h * 0.62, -d / 2 - 0.01, w * 0.8, h * 0.08, 0.04, at);
  for (const sx of [-1, 1]) {
    const bol = new THREE.CylinderGeometry(h * 0.09, h * 0.09, d, (opts.detail ?? 'high') === 'high' ? 10 : 6);
    bol.rotateX(Math.PI / 2);
    bol.translate(sx * (w / 2 - h * 0.09), h + h * 0.07, 0);
    b.add(bol, mat, at);
  }
  if (opts.fire) {
    box(b, 'bronze', 0, h + 0.05, 0, w * 0.5, 0.08, d * 0.5, at);
    box(b, 'glow_fire', 0, h + 0.12, 0, w * 0.3, 0.06, d * 0.3, at);
  }
}

export type StatueKind = 'togate' | 'emperor' | 'equestrian' | 'seated' | 'general';

/**
 * A statue on an inscribed pedestal. The pedestal is `ph` tall; statue `scale` (1 = life size).
 * Faces −z. Collider on the pedestal.
 */
export function pedestalStatue(b: MeshBuilder, kind: StatueKind, at: THREE.Matrix4, opts: { scale?: number; ph?: number; material?: MaterialId; pedMaterial?: MaterialId; detail?: Detail } = {}) {
  const sc = opts.scale ?? 1;
  const ph = opts.ph ?? 1.6;
  const det = opts.detail ?? 'high';
  const pm = opts.pedMaterial ?? 'marble';
  const mat = opts.material ?? 'bronze';
  const pw = kind === 'equestrian' ? 1.2 * sc : 0.9 * sc;
  const pd = kind === 'equestrian' ? 2.9 * sc : 0.85 * sc;
  box(b, pm, 0, 0.1, 0, pw + 0.25, 0.2, pd + 0.25, at, true);
  box(b, pm, 0, ph / 2, 0, pw, ph - 0.2, pd, at, true);
  box(b, pm, 0, ph - 0.06, 0, pw + 0.18, 0.14, pd + 0.18, at);
  // Panel where the elogium is painted (red letters read as a darker band at distance).
  box(b, paint('#d9cdb8', 0.6), 0, ph * 0.55, -pd / 2 - 0.006, pw * 0.75, ph * 0.38, 0.01, at);
  const top = mul(at, new THREE.Matrix4().makeTranslation(0, ph, 0).multiply(new THREE.Matrix4().makeScale(sc, sc, sc)));
  const o = { material: mat, detail: det, plinth: false } as const;
  if (kind === 'togate') togate(b, top, o);
  else if (kind === 'emperor' || kind === 'general') armoredEmperor(b, top, { ...o, spear: kind === 'general' });
  else if (kind === 'equestrian') equestrian(b, top, { ...o, plinth: false });
  else seatedDeity(b, top, { ...o, throneMaterial: mat });
}

// ---------------------------------------------------------------- inscriptions

/**
 * An inscription panel (carved+rubricated, gilded bronze letters, or painted) and the latinized
 * text it shows. Panel centred on the origin of `at`, face at z = 0 facing −z.
 */
export function inscription(b: MeshBuilder, raw: string[], width: number, height: number, at: THREE.Matrix4, style: InscriptionStyle = 'carved', opts: { bodyMaterial?: MaterialId; ground?: string; ink?: string; depth?: number } = {}): string {
  // latinize() puts the interpuncts between words itself: drop any typed into the source text.
  const lines = raw.map((l) => l.replace(/\s*·\s*/g, ' ').trim());
  inscriptionPanel(b, { lines, width, height, style, ground: opts.ground, ink: opts.ink, border: style !== 'painted' }, at, { depth: opts.depth ?? 0.1, bodyMaterial: opts.bodyMaterial });
  return lines.map((l) => latinize(l)).join(' / ');
}

// ---------------------------------------------------------------- ceilings and floors

/**
 * Coffered ceiling: a grid of beams under the plane y (soffit facing down), painted Egyptian
 * blue panels with gilded rosettes. Rectangle x0..x1 × z0..z1.
 */
export function coffers(b: MeshBuilder, x0: number, x1: number, z0: number, z1: number, y: number, cell: number, at: THREE.Matrix4, detail: Detail = 'high') {
  const nx = Math.max(1, Math.round((x1 - x0) / cell));
  const nz = Math.max(1, Math.round((z1 - z0) / cell));
  const cx = (x1 - x0) / nx;
  const cz = (z1 - z0) / nz;
  const beam = Math.min(cx, cz) * 0.16;
  const deep = Math.min(cx, cz) * 0.14;
  span(b, paint(PAINT.blue, 0.85), x0, y - 0.02, z0, x1, y, z1, at);
  for (let i = 0; i <= nx; i++) span(b, 'marble', x0 + i * cx - beam / 2, y - deep, z0, x0 + i * cx + beam / 2, y - 0.01, z1, at);
  for (let j = 0; j <= nz; j++) span(b, 'marble', x0, y - deep, z0 + j * cz - beam / 2, x1, y - 0.01, z0 + j * cz + beam / 2, at);
  if (detail === 'high') {
    const ro = new THREE.CylinderGeometry(Math.min(cx, cz) * 0.14, Math.min(cx, cz) * 0.14, 0.03, 8);
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) b.add(ro.clone().translate(x0 + (i + 0.5) * cx, y - 0.035, z0 + (j + 0.5) * cz), 'gilded_bronze', at, { castShadow: false });
  }
}

/** Opus sectile floor: giallo antico ground with a grid of porphyry discs and pavonazzetto squares. */
export function sectileFloor(b: MeshBuilder, x0: number, x1: number, z0: number, z1: number, y: number, cell: number, at: THREE.Matrix4, detail: Detail = 'high') {
  span(b, 'marble_giallo', x0, y, z0, x1, y + 0.02, z1, at);
  if (detail !== 'high') return;
  const nx = Math.max(1, Math.round((x1 - x0) / cell));
  const nz = Math.max(1, Math.round((z1 - z0) / cell));
  const cx = (x1 - x0) / nx;
  const cz = (z1 - z0) / nz;
  const disc = new THREE.CylinderGeometry(Math.min(cx, cz) * 0.3, Math.min(cx, cz) * 0.3, 0.012, 14);
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const px = x0 + (i + 0.5) * cx;
      const pz = z0 + (j + 0.5) * cz;
      if ((i + j) % 2 === 0) b.add(disc.clone().translate(px, y + 0.026, pz), 'porphyry', at, { castShadow: false });
      else span(b, 'marble_pavonazzetto', px - cx * 0.36, y + 0.02, pz - cz * 0.36, px + cx * 0.36, y + 0.032, pz + cz * 0.36, at);
    }
}

// ---------------------------------------------------------------- water

/** A rectangular marble basin with a water surface, rim height h. Origin at the centre on the ground. */
export function basin(b: MeshBuilder, w: number, d: number, h: number, at: THREE.Matrix4, opts: { rim?: number; material?: MaterialId; collide?: boolean } = {}) {
  const t = opts.rim ?? 0.25;
  const mat = opts.material ?? 'marble';
  const c = opts.collide ?? true;
  span(b, mat, -w / 2, 0, -d / 2, w / 2, h, -d / 2 + t, at, c);
  span(b, mat, -w / 2, 0, d / 2 - t, w / 2, h, d / 2, at, c);
  span(b, mat, -w / 2, 0, -d / 2 + t, -w / 2 + t, h, d / 2 - t, at, c);
  span(b, mat, w / 2 - t, 0, -d / 2 + t, w / 2, h, d / 2 - t, at, c);
  span(b, mat, -w / 2 + t, 0, -d / 2 + t, w / 2 - t, 0.05, d / 2 - t, at);
  span(b, 'water', -w / 2 + t, 0, -d / 2 + t, w / 2 - t, h - 0.12, d / 2 - t, at);
}

/** A round basin (labrum) on a short foot. */
export function labrum(b: MeshBuilder, r: number, at: THREE.Matrix4, detail: Detail = 'high') {
  const seg = detail === 'high' ? 20 : 10;
  const prof: V2[] = [
    [0, 0],
    [r * 0.25, 0],
    [r * 0.18, 0.5],
    [r * 0.95, 0.75],
    [r, 0.9],
    [r * 0.9, 0.9],
    [0, 0.8],
  ];
  const p = new ProfileBuilder(prof[0][0], prof[0][1]);
  for (const [x, y] of prof.slice(1)) p.to(x, y);
  b.add(lathe(p.build(), { segments: seg }), 'marble', at);
  const w = new THREE.CylinderGeometry(r * 0.88, r * 0.88, 0.02, seg);
  w.translate(0, 0.86, 0);
  b.add(w, 'water', at, { castShadow: false });
}

export { I as identity };

// ---------------------------------------------------------------- terraces

/**
 * A flat paved terrace at height `y` over the polygon `poly` (local x,z), with retaining walls
 * down to the terrain along every edge (bottom follows `groundAt`, sampled per ~2.5 m stretch),
 * a moulded coping, a flat trimesh collider on top and box colliders for the walls.
 * `parapetEdges` (indices into `poly`, edge i runs poly[i] → poly[i+1]) get a parapet.
 */
export function terrace(
  b: MeshBuilder,
  poly: V2[],
  y: number,
  groundAt: (x: number, z: number) => number,
  opts: {
    material?: MaterialId;
    paving?: MaterialId;
    parapet?: number;
    parapetEdges?: number[];
    at?: THREE.Matrix4;
    thickness?: number;
    walls?: boolean;
    skipEdges?: number[];
    /** Buttress piers on the outer face of these edges, every `every` m (substructures on slopes). */
    buttress?: { edges: number[]; every: number; width?: number; depth?: number };
  } = {},
) {
  const mat = opts.material ?? 'tufa';
  const t = opts.thickness ?? 0.6;
  const at = opts.at;
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, z0] = poly[i];
    const [x1, z1] = poly[(i + 1) % poly.length];
    area += x0 * z1 - x1 * z0;
  }
  // Top paving: triangulate and emit with an upward normal.
  const tris = THREE.ShapeUtils.triangulateShape(poly.map(([x, z]) => new THREE.Vector2(x, z)), []);
  const pos: number[] = [];
  for (const [a, c, d] of tris) {
    const A = poly[a];
    const C = poly[c];
    const Dd = poly[d];
    const cross = (C[0] - A[0]) * (Dd[1] - A[1]) - (C[1] - A[1]) * (Dd[0] - A[0]);
    const seq = cross > 0 ? [A, Dd, C] : [A, C, Dd];
    for (const p of seq) pos.push(p[0], y, p[1]);
  }
  const top = makeGeometry(pos, new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)));
  b.add(top, opts.paving ?? 'paving_travertine', at);
  b.collider({ kind: 'trimesh', geometry: top.clone(), matrix: at?.clone() });
  if (opts.walls === false) return;
  const parapetEdges = new Set(opts.parapetEdges ?? []);
  const skip = new Set(opts.skipEdges ?? []);
  for (let i = 0; i < poly.length; i++) {
    if (skip.has(i)) continue;
    const [ax, az] = poly[i];
    const [cx, cz] = poly[(i + 1) % poly.length];
    const len = Math.hypot(cx - ax, cz - az);
    if (len < 0.05) continue;
    const ux = (cx - ax) / len;
    const uz = (cz - az) / len;
    // Outward normal: for positive area (x·z' − x'·z > 0) the outside is on the right of a→c in
    // a frame where +x is right and +z is "up" on paper, i.e. (uz, −ux) … flipped for negative area.
    const sgn = area >= 0 ? -1 : 1;
    const nx = sgn * uz;
    const nz = -sgn * ux;
    const ry = Math.atan2(-uz, ux);
    const n = Math.max(1, Math.ceil(len / 2.5));
    for (let k = 0; k < n; k++) {
      const s0 = (k / n) * len;
      const s1 = ((k + 1) / n) * len;
      let gmin = Infinity;
      for (const sv of [s0, (s0 + s1) / 2, s1]) for (const off of [0.2, t + 0.4]) gmin = Math.min(gmin, groundAt(ax + ux * sv + nx * off, az + uz * sv + nz * off));
      const bot = Math.min(y - 0.3, gmin - 0.4);
      const mx = ax + ux * ((s0 + s1) / 2) + nx * (t / 2);
      const mz = az + uz * ((s0 + s1) / 2) + nz * (t / 2);
      box(b, mat, mx, (bot + y) / 2, mz, s1 - s0 + 0.02, y - bot, t, at, true, ry);
    }
    box(b, 'travertine', ax + ux * (len / 2) + nx * (t / 2 + 0.05), y - 0.12, az + uz * (len / 2) + nz * (t / 2 + 0.05), len + t * 0.5, 0.24, t + 0.15, at, false, ry);
    if (opts.buttress?.edges.includes(i) && len > 2) {
      const bw = opts.buttress.width ?? 1.0;
      const bd = opts.buttress.depth ?? 0.55;
      const nb = Math.max(1, Math.round(len / opts.buttress.every));
      for (let k = 0; k <= nb; k++) {
        const sv = (k / nb) * len;
        const px = ax + ux * sv + nx * (t + bd / 2);
        const pz = az + uz * sv + nz * (t + bd / 2);
        const gb = Math.min(groundAt(px, pz), groundAt(px + nx * bd, pz + nz * bd)) - 0.4;
        if (y - 0.35 - gb < 0.8) continue;
        // Slightly battered: a wider foot, the pier's top sloping back under the coping.
        box(b, mat, px, (gb + y - 0.35) / 2, pz, bw, y - 0.35 - gb, bd, at, true, ry);
        box(b, 'travertine', px - nx * 0.05, y - 0.42, pz - nz * 0.05, bw + 0.1, 0.14, bd + 0.1, at, false, ry);
      }
    }
    if (opts.parapet && parapetEdges.has(i)) {
      const ph = opts.parapet;
      box(b, mat, ax + ux * (len / 2) + nx * (t / 2), y + ph / 2, az + uz * (len / 2) + nz * (t / 2), len + t, ph, t * 0.8, at, true, ry);
      box(b, 'travertine', ax + ux * (len / 2) + nx * (t / 2), y + ph + 0.05, az + uz * (len / 2) + nz * (t / 2), len + t + 0.1, 0.1, t, at, false, ry);
    }
  }
}

// ---------------------------------------------------------------- cheap statues

export type FigureKind = 'togate' | 'armored' | 'draped' | 'nude';

const figureCache = new Map<string, THREE.BufferGeometry>();

/**
 * A cheap life-size statue (≈ 250–600 triangles) for galleries of many figures: niches of the
 * summi viri, attic rows, votive statues crowding a precinct. Faces −z, feet at y = 0, 1.75 m
 * tall at scale 1 (plinth not included). Geometry is cached per kind and detail.
 */
export function figure(b: MeshBuilder, kind: FigureKind, at: THREE.Matrix4, opts: { scale?: number; material?: MaterialId | THREE.Material; detail?: Detail } = {}) {
  const hi = (opts.detail ?? 'high') === 'high';
  const key = `${kind}|${hi ? 1 : 0}`;
  let g = figureCache.get(key);
  if (!g) {
    g = makeFigure(kind, hi);
    figureCache.set(key, g);
  }
  const s = opts.scale ?? 1;
  b.add(g, opts.material ?? 'bronze', mul(at, new THREE.Matrix4().makeScale(s, s, s)));
}

function makeFigure(kind: FigureKind, hi: boolean): THREE.BufferGeometry {
  const seg = hi ? 10 : 6;
  const parts: THREE.BufferGeometry[] = [];
  const lathePart = (pts: [number, number][], sx = 1, sz = 0.75) => {
    const p = new ProfileBuilder(0, pts[0][1]);
    for (const [x, y] of pts) p.to(x, y);
    const g = lathe(p.build(), { segments: seg });
    g.scale(sx, 1, sz);
    parts.push(g);
  };
  const limb = (a: THREE.Vector3, c: THREE.Vector3, r: number) => {
    const len = a.distanceTo(c);
    const g = new THREE.CylinderGeometry(r, r * 0.85, len, hi ? 6 : 4);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), c.clone().sub(a).normalize()));
    g.translate(a.x, a.y, a.z);
    parts.push(g);
  };
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  if (kind === 'togate' || kind === 'draped') {
    const w = kind === 'draped' ? 0.92 : 1;
    lathePart([[0.01, 0], [0.26 * w, 0.02], [0.24 * w, 0.4], [0.22 * w, 0.85], [0.23 * w, 1.12], [0.235 * w, 1.32], [0.2 * w, 1.42], [0.1, 1.48], [0.01, 1.5]]);
    // Sinus fold of the toga / palla over the front.
    limb(V(-0.16, 1.38, -0.12), V(0.2, 0.9, -0.14), 0.05);
    limb(V(-0.21, 1.36, 0), V(-0.22, 0.95, -0.12), 0.065);
    limb(V(0.21, 1.36, 0), V(0.24, 1.0, -0.2), 0.055);
  } else if (kind === 'armored') {
    // Kilted cuirass: legs, skirt of pteryges, breastplate, paludamentum over the left shoulder.
    limb(V(-0.1, 0, -0.02), V(-0.09, 0.62, 0), 0.07);
    limb(V(0.1, 0, 0.04), V(0.09, 0.62, 0), 0.07);
    lathePart([[0.01, 0.55], [0.23, 0.56], [0.22, 0.75], [0.2, 0.9], [0.24, 1.25], [0.22, 1.38], [0.1, 1.45], [0.01, 1.48]], 1, 0.7);
    limb(V(-0.2, 1.38, 0.05), V(-0.24, 0.55, 0.12), 0.09);
    limb(V(0.21, 1.36, 0), V(0.3, 1.62, -0.1), 0.055);
    limb(V(-0.24, 1.34, 0), V(-0.26, 1.0, -0.15), 0.055);
    limb(V(-0.28, 0.0, -0.2), V(-0.28, 2.1, -0.2), 0.02);
  } else {
    // Heroic nude with a cloak: legs, torso, arms.
    limb(V(-0.1, 0, 0), V(-0.09, 0.85, 0), 0.075);
    limb(V(0.1, 0, 0.05), V(0.09, 0.85, 0), 0.075);
    lathePart([[0.01, 0.8], [0.17, 0.82], [0.15, 1.0], [0.19, 1.25], [0.22, 1.36], [0.1, 1.45], [0.01, 1.48]], 1, 0.62);
    limb(V(-0.21, 1.35, 0), V(-0.24, 0.85, -0.05), 0.05);
    limb(V(0.21, 1.35, 0), V(0.26, 0.9, -0.1), 0.05);
  }
  // Neck and head.
  limb(V(0, 1.45, 0), V(0, 1.55, -0.01), 0.055);
  const head = new THREE.SphereGeometry(0.11, seg, hi ? 6 : 4);
  head.scale(0.9, 1.08, 1);
  head.translate(0, 1.64, -0.02);
  parts.push(head);
  const merged = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)).map((p) => {
    for (const n of Object.keys(p.attributes)) if (n !== 'position' && n !== 'normal') p.deleteAttribute(n);
    return p;
  }));
  return merged ?? new THREE.BufferGeometry();
}

// ---------------------------------------------------------------- ground and blocks

/** A solid block from `y1` down to below the lowest ground in the rectangle (foundations on slopes). */
export function footing(b: MeshBuilder, mat: MaterialId, groundAt: (x: number, z: number) => number, x0: number, z0: number, x1: number, z1: number, y1: number, at?: THREE.Matrix4, collide = true) {
  let min = Infinity;
  const nx = Math.max(1, Math.ceil((x1 - x0) / 2));
  const nz = Math.max(1, Math.ceil((z1 - z0) / 2));
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) min = Math.min(min, groundAt(x0 + ((x1 - x0) * i) / nx, z0 + ((z1 - z0) * j) / nz));
  const y0 = Math.min(y1 - 0.2, min - 0.3);
  span(b, mat, x0, y0, z0, x1, y1, z1, at, collide);
  return y0;
}

/** Lowest ground over a local rectangle (sampled every ~2 m). */
export function groundMin(groundAt: (x: number, z: number) => number, x0: number, z0: number, x1: number, z1: number): number {
  let min = Infinity;
  const nx = Math.max(1, Math.ceil(Math.abs(x1 - x0) / 2));
  const nz = Math.max(1, Math.ceil(Math.abs(z1 - z0) / 2));
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) min = Math.min(min, groundAt(x0 + ((x1 - x0) * i) / nx, z0 + ((z1 - z0) * j) / nz));
  return min;
}

/** Cylinder between two heights at (x, z) (posts, column drums, poles). */
export function post(b: MeshBuilder, mat: MaterialId | THREE.Material, x: number, y0: number, z: number, h: number, r: number, at?: THREE.Matrix4, seg = 8, collide = false) {
  const g = new THREE.CylinderGeometry(r, r, h, seg);
  g.translate(x, y0 + h / 2, z);
  b.add(g, mat, at);
  if (collide) {
    const c = new THREE.Vector3(x, y0 + h / 2, z);
    if (at) c.applyMatrix4(at);
    b.collider({ kind: 'cylinder', center: c, halfHeight: h / 2, radius: r });
  }
}

/** A legionary standard (aquila on a pole with phalerae) — the recovered Parthian standards. */
export function standard(b: MeshBuilder, at: THREE.Matrix4, h = 2.6, detail: Detail = 'high') {
  post(b, 'wood_dark', 0, 0, 0, h, 0.025, at, 5);
  const n = detail === 'high' ? 4 : 2;
  for (let i = 0; i < n; i++) {
    const disc = new THREE.CylinderGeometry(0.09, 0.09, 0.02, 10);
    disc.rotateX(Math.PI / 2);
    disc.translate(0, h * (0.45 + i * 0.1), -0.03);
    b.add(disc, 'gilded_bronze', at);
  }
  // Eagle: body, spread wings, thunderbolt in the talons.
  const body = new THREE.SphereGeometry(0.09, 8, 6);
  body.scale(0.8, 1, 1.4);
  body.translate(0, h + 0.12, 0);
  b.add(body, 'gilded_bronze', at);
  for (const sx of [-1, 1]) {
    const wing = new THREE.BoxGeometry(0.3, 0.16, 0.02);
    wing.rotateZ(sx * 0.6);
    wing.translate(sx * 0.17, h + 0.25, 0);
    b.add(wing, 'gilded_bronze', at);
  }
  const bolt = new THREE.BoxGeometry(0.26, 0.04, 0.04);
  bolt.translate(0, h, 0);
  b.add(bolt, 'gilded_bronze', at);
}

/** A trophy (tropaeum): cuirass, helmet and shields hung on a post — spoils on the Capitol. */
export function trophy(b: MeshBuilder, at: THREE.Matrix4, mat: MaterialId = 'bronze') {
  post(b, 'wood_dark', 0, 0, 0, 2.6, 0.06, at, 6);
  box(b, mat, 0, 1.9, 0, 0.5, 0.6, 0.3, at);
  const helm = new THREE.SphereGeometry(0.16, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  helm.translate(0, 2.25, 0);
  b.add(helm, mat, at);
  const arm = new THREE.BoxGeometry(1.2, 0.07, 0.07);
  arm.translate(0, 2.05, 0);
  b.add(arm, 'wood_dark', at);
  for (const sx of [-1, 1]) {
    const sh = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 12);
    sh.rotateX(Math.PI / 2);
    sh.translate(sx * 0.55, 1.75, -0.06);
    b.add(sh, mat, at);
  }
}
