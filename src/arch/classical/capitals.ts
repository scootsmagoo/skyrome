/**
 * Capital geometry for the five orders. Each builder returns geometry pieces in a local frame
 * whose origin is the TOP OF THE SHAFT on the column axis (y up, front = −z), sized for a lower
 * diameter D. The "half" option keeps only the front half (z ≤ 0) for engaged columns.
 *
 * Corinthian/Composite capitals use layered acanthus "leaf bands": a continuous scalloped band
 * around the bell whose lobes cup inwards at the edges, carry a midrib, and curl out and down
 * at the tips (with back faces, since we mostly look UP at capitals).
 */
import * as THREE from 'three';
import { ProfileBuilder, extrudePolygon, gridSurface, lathe, linspace, tube, type V2 } from '../common/geom';
import type { Detail, Order } from './orders';

export interface Piece {
  geometry: THREE.BufferGeometry;
  /** 'keep' = the geometry carries world-scale UVs already; 'box' = let MeshBuilder project. */
  uv: 'keep' | 'box';
}

export interface CapitalOptions {
  D: number;
  /** Upper shaft diameter. */
  d: number;
  height: number;
  detail: Detail;
  /** Front half only (engaged columns). */
  half?: boolean;
}

const HALF_T0 = Math.PI / 2 - 0.25;
const HALF_T1 = Math.PI * 1.5 + 0.25;

function latheRange(half?: boolean) {
  return half ? { theta0: HALF_T0, theta1: HALF_T1 } : {};
}

/** Square (or half-square) block centred on the axis: abacus, plinth. */
function block(w: number, h: number, y0: number, half?: boolean, depth = w): Piece {
  const d = half ? depth / 2 + 0.02 * w : depth;
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, y0 + h / 2, half ? -d / 2 + 0.02 * w : 0);
  return { geometry: g, uv: 'box' };
}

// ---------------------------------------------------------------- Tuscan & Doric

export function tuscanCapital(o: CapitalOptions): Piece[] {
  const { D, d, half } = o;
  const r1 = d / 2;
  const seg = o.detail === 'high' ? 24 : 12;
  const neck = 0.165 * D;
  const p = new ProfileBuilder(r1, 0).up(neck).out(0.02 * D).up(0.03 * D).ovolo(0.5 * D - r1 - 0.02 * D, 0.135 * D).in(0.5 * D);
  const pieces: Piece[] = [{ geometry: lathe(p.build(), { segments: seg, ...latheRange(half) }), uv: 'box' }];
  pieces.push(block(D, 0.167 * D, neck + 0.165 * D, half));
  return pieces;
}

export function doricCapital(o: CapitalOptions): Piece[] {
  const { D, d, half } = o;
  const r1 = d / 2;
  const seg = o.detail === 'high' ? 24 : 12;
  const p = new ProfileBuilder(r1, 0).up(0.16 * D);
  if (o.detail === 'high') for (let i = 0; i < 3; i++) p.out(0.012 * D).up(0.012 * D);
  else p.out(0.036 * D).up(0.036 * D);
  p.ovolo(0.6 * D - p.x, 0.11 * D).in(0.6 * D);
  const top = p.y;
  const pieces: Piece[] = [{ geometry: lathe(p.build(), { segments: seg, ...latheRange(half) }), uv: 'box' }];
  pieces.push(block(1.2 * D, 0.13 * D, top, half));
  pieces.push(block(1.26 * D, 0.04 * D, top + 0.13 * D, half));
  return pieces;
}

// ---------------------------------------------------------------- Ionic

/**
 * Archimedean volute spiral in a plane. `centre` = eye, `R` outer radius, starting at the top
 * and turning `dir` (+1 = clockwise when viewed along −axisN, i.e. outwards first for a right
 * volute seen from the front). Returns 3D points; `right` and `up` span the plane.
 */
export function volutePath(centre: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3, R: number, turns: number, n: number, dir: 1 | -1): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const total = turns * Math.PI * 2;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = Math.PI / 2 - dir * t * total;
    const r = R * (1 - 0.82 * t);
    out.push(centre.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r));
  }
  return out;
}

/** A volute: a disc face with a raised spiral fillet and an eye, facing `normal`. */
function volute(centre: THREE.Vector3, normal: THREE.Vector3, R: number, D: number, dir: 1 | -1, detail: Detail): Piece[] {
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, normal).normalize();
  const pieces: Piece[] = [];
  // disc (cylinder along the normal)
  const thick = 0.05 * D;
  const disc = new THREE.CylinderGeometry(R, R, thick, detail === 'high' ? 20 : 10);
  disc.rotateX(Math.PI / 2);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  disc.applyQuaternion(q);
  disc.translate(centre.x - normal.x * thick * 0.5, centre.y, centre.z - normal.z * thick * 0.5);
  pieces.push({ geometry: disc, uv: 'box' });
  if (detail === 'high') {
    const face = centre.clone().addScaledVector(normal, 0.004 * D);
    const path = volutePath(face, right, up, R * 0.93, 2.6, 32, dir);
    pieces.push({ geometry: tube(path, (i) => 0.022 * D * (1 - (0.5 * i) / 32), 4), uv: 'box' });
    const eye = new THREE.SphereGeometry(0.035 * D, 6, 4);
    eye.translate(face.x, face.y, face.z);
    pieces.push({ geometry: eye, uv: 'box' });
  }
  return pieces;
}

export function ionicCapital(o: CapitalOptions): Piece[] {
  const { D, d, half, detail } = o;
  const r1 = d / 2;
  const hi = detail === 'high';
  const seg = hi ? 48 : 10;
  const pieces: Piece[] = [];
  // Echinus with egg-and-dart: an ovolo ring whose radius bulges into 24 eggs.
  const eh = 0.2 * D;
  const ew = 0.13 * D;
  const th = half ? linspace(HALF_T0, HALF_T1, seg / 2) : linspace(0, Math.PI * 2, seg);
  const ts = linspace(0, 1, hi ? 5 : 2);
  pieces.push({
    geometry: gridSurface(th, ts, (a, t, out) => {
      const base = r1 + ew * Math.sin((t * Math.PI) / 2) ** 0.8;
      const egg = hi ? 0.018 * D * Math.max(0, Math.cos(a * 12)) ** 2 * Math.sin(t * Math.PI) : 0;
      const r = base + egg;
      return out.set(r * Math.sin(a), t * eh, r * Math.cos(a));
    }),
    uv: 'box',
  });
  // Canalis (cushion) band between the volutes, and abacus.
  const yCan = 0.2 * D;
  const canH = 0.085 * D;
  const xe = 0.42 * D; // eye x
  const zf = 0.46 * D; // volute face z
  const can = new THREE.BoxGeometry(2 * xe, canH, half ? zf : 2 * zf);
  can.translate(0, yCan + canH / 2, half ? -zf / 2 : 0);
  pieces.push({ geometry: can, uv: 'box' });
  const abH = 0.075 * D;
  const abW = 1.06 * D;
  pieces.push(block(abW, abH, yCan + canH, half, 1.0 * D));
  // Volutes (front, and back unless half) with bolsters (pulvini) on the sides.
  const R = 0.25 * D;
  const eyeY = yCan + canH - R;
  for (const sx of [-1, 1] as const) {
    const zs = half ? [-1] : [-1, 1];
    for (const sz of zs) {
      const c = new THREE.Vector3(sx * xe, eyeY, sz * zf);
      const n = new THREE.Vector3(0, 0, sz);
      // Seen from the front (−z), the right volute turns clockwise (outwards first).
      const dir: 1 | -1 = (sx * sz > 0 ? 1 : -1) as 1 | -1;
      pieces.push(...volute(c, n, R, D, dir, detail));
    }
    // Bolster: a waisted roll along z (balteus), lathed around the volute eye axis.
    const len = half ? zf : 2 * zf;
    const prof = new ProfileBuilder(R * 0.98, 0)
      .to(R * 0.84, len * 0.3)
      .to(R * 0.72, len * 0.45)
      .to(R * 0.76, len * 0.46)
      .to(R * 0.76, len * 0.54)
      .to(R * 0.72, len * 0.55)
      .to(R * 0.84, len * 0.7)
      .to(R * 0.98, len)
      .build();
    const bol = lathe(prof, { segments: hi ? 14 : 6 });
    bol.rotateX(-Math.PI / 2); // lathe axis y → −z... then position
    bol.translate(sx * xe, eyeY, half ? 0 : zf);
    pieces.push({ geometry: bol, uv: 'box' });
  }
  return pieces;
}

// ---------------------------------------------------------------- Corinthian & Composite

export interface LeafRow {
  /** Bottom of the row. */
  y0: number;
  /** Leaf length (vertical extent before the curl). */
  height: number;
  /** Number of leaves around (full circle). */
  count: number;
  /** Angular offset of the first leaf centre. */
  phase: number;
  /** Outward reach of the curled tip. */
  curl: number;
  thickness: number;
}

/**
 * Acanthus leaf band wrapped around a bell of radius `bellR(y)`. Returns outer and inner
 * surfaces. θ samples define the resolution (8 per leaf looks good).
 */
export function leafBand(row: LeafRow, bellR: (y: number) => number, D: number, detail: Detail, half?: boolean): THREE.BufferGeometry[] {
  const hi = detail === 'high';
  const perLeaf = hi ? 6 : 2;
  const segs = row.count * perLeaf;
  const th = half ? linspace(HALF_T0, HALF_T1, Math.ceil(segs / 2)) : linspace(0, Math.PI * 2, segs);
  const ts = hi ? [0, 0.3, 0.52, 0.66, 0.78, 0.88, 1] : [0, 0.62, 1];
  // Back faces only where the tip curls away from the bell (we look up at capitals).
  const tsBack = hi ? [0.52, 0.66, 0.78, 0.88, 1] : [];
  const period = (Math.PI * 2) / row.count;
  const surface = (inner: boolean) => (a: number, t: number, out: THREE.Vector3) => {
    let s = (a - row.phase) / period + 0.5;
    s -= Math.floor(s);
    const c = 2 * s - 1; // −1..1 across a leaf, 0 at its centre
    const ac = Math.abs(c);
    // Leaf outline: broad, overlapping neighbours, three tip lobes and serrated sides.
    const lobes = hi ? 0.07 * Math.abs(Math.sin(c * Math.PI * 1.5)) + 0.03 * Math.abs(Math.sin(c * Math.PI * 4.5)) : 0;
    const len = row.height * (0.68 + 0.32 * (1 - ac * ac) ** 0.6 - lobes);
    const tc = 0.62; // curl starts
    let y: number;
    let r: number;
    const yb = row.y0;
    const lean = 0.35 * row.curl * t * t;
    if (t <= tc) {
      y = yb + len * t;
      r = bellR(y) + lean;
    } else {
      const e = (t - tc) / (1 - tc);
      const arcLen = len * (1 - tc);
      const alpha = e * 2.1; // radians of curl: the tip ends pointing out and down
      const rho = arcLen / 2.1;
      const yc = yb + len * tc;
      y = yc + rho * Math.sin(alpha);
      r = bellR(yc) + 0.35 * row.curl * tc * tc + row.curl * 0.75 * (1 - Math.cos(alpha)) + rho * 0.4 * Math.sin(alpha);
    }
    // Cupping (edges hug the bell), midrib and finger ridges.
    r -= 0.45 * row.curl * ac * ac * t;
    if (hi) r += 0.014 * D * Math.max(0, 1 - ac * 7) + 0.008 * D * Math.cos(c * Math.PI * 6) * t;
    r += row.thickness * (inner ? 0 : 1);
    return out.set(r * Math.sin(a), y, r * Math.cos(a));
  };
  const out = [gridSurface(th, ts, surface(false))];
  if (tsBack.length) out.push(gridSurface(th, tsBack, surface(true), { flip: true }));
  return out;
}

/** Corinthian abacus outline: square with concave sides and cut corners, side `w`. */
function abacusOutline(w: number, sag: number, cut: number, n = 6): V2[] {
  const h = w / 2;
  const pts: V2[] = [];
  // Walk the four sides; each concave side is an arc between cut corners.
  const corners: V2[] = [
    [h, h],
    [-h, h],
    [-h, -h],
    [h, -h],
  ];
  for (let k = 0; k < 4; k++) {
    const a = corners[k];
    const b = corners[(k + 1) % 4];
    const dir: V2 = [(b[0] - a[0]) / w, (b[1] - a[1]) / w];
    const inward: V2 = [-a[0] - b[0], -a[1] - b[1]];
    const il = Math.hypot(inward[0], inward[1]);
    const inv: V2 = [inward[0] / il, inward[1] / il];
    const p0: V2 = [a[0] + dir[0] * cut, a[1] + dir[1] * cut];
    const p1: V2 = [b[0] - dir[0] * cut, b[1] - dir[1] * cut];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const bulge = Math.sin(t * Math.PI) * sag;
      pts.push([p0[0] + (p1[0] - p0[0]) * t + inv[0] * bulge, p0[1] + (p1[1] - p0[1]) * t + inv[1] * bulge]);
    }
  }
  return pts;
}

function corinthianAbacus(o: CapitalOptions, y0: number, h: number): Piece[] {
  const { D, half } = o;
  const w = 1.42 * D;
  let outline = abacusOutline(w, 0.1 * D, 0.07 * D, o.detail === 'high' ? 6 : 2);
  if (half) outline = outline.map(([x, z]) => [x, Math.max(z, -0.02 * D)] as V2);
  // Outline is in (x, z); extrude upwards: build in XY then rotate so +Y(shape) → −Z… simpler: XY → XZ.
  const lower = extrudePolygon(
    outline.map(([x, z]) => [x, -z] as V2),
    h * 0.55,
  );
  // rotateX(−π/2) maps the extrusion z ∈ [−depth, 0] to y ∈ [−depth, 0]: lift by the depth.
  lower.rotateX(-Math.PI / 2);
  lower.translate(0, y0 + h * 0.55, 0);
  const upperOutline = abacusOutline(w * 1.02, 0.1 * D, 0.07 * D, o.detail === 'high' ? 6 : 2).map(([x, z]) => [x, half ? Math.max(z, -0.02 * D) : z] as V2);
  const upper = extrudePolygon(
    upperOutline.map(([x, z]) => [x, -z] as V2),
    h * 0.45,
  );
  upper.rotateX(-Math.PI / 2);
  upper.translate(0, y0 + h, 0);
  return [
    { geometry: lower, uv: 'box' },
    { geometry: upper, uv: 'box' },
  ];
}

export function corinthianCapital(o: CapitalOptions, composite = false): Piece[] {
  const { D, d, height: C, detail, half } = o;
  const hi = detail === 'high';
  const r1 = d / 2;
  const abH = C / 7;
  const bellH = C - abH;
  const rTop = 0.56 * D;
  const bellR = (y: number) => {
    const t = Math.min(1, Math.max(0, y / bellH));
    return r1 + (rTop - r1) * t ** 1.8;
  };
  const pieces: Piece[] = [];
  // Bell with a lip under the abacus.
  const bp = new ProfileBuilder(r1 * 0.98, 0);
  for (const t of hi ? [0.3, 0.6, 0.8, 0.95] : [0.95]) bp.to(bellR(t * bellH), t * bellH);
  bp.out(0.025 * D).up(0.05 * bellH).in(0.025 * D + rTop * 0.4);
  pieces.push({ geometry: lathe(bp.build(), { segments: hi ? 24 : 10, ...latheRange(half) }), uv: 'box' });
  // Two rows of eight acanthus leaves; the upper row sits on the axes, the lower between.
  const rows: LeafRow[] = composite
    ? [
        { y0: 0, height: bellH * 0.4, count: 8, phase: Math.PI / 8, curl: 0.13 * D, thickness: 0.035 * D },
        { y0: 0, height: bellH * 0.66, count: 8, phase: 0, curl: 0.15 * D, thickness: 0.02 * D },
      ]
    : [
        { y0: 0, height: bellH * 0.42, count: 8, phase: Math.PI / 8, curl: 0.14 * D, thickness: 0.035 * D },
        { y0: 0, height: bellH * 0.72, count: 8, phase: 0, curl: 0.16 * D, thickness: 0.02 * D },
      ];
  for (const row of rows) for (const g of leafBand(row, bellR, D, detail, half)) pieces.push({ geometry: g, uv: 'box' });

  const diagonals = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4].filter((a) => !half || Math.cos(a) < 0.1);
  const up = new THREE.Vector3(0, 1, 0);
  if (!composite) {
    // Corner volutes: tendrils from the caulicoli rising to the abacus horns, curling down.
    for (const a of diagonals) {
      const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      const R = 0.085 * D;
      const centre = dir.clone().multiplyScalar(0.74 * D).add(new THREE.Vector3(0, bellH - 0.1 * D, 0));
      const stalk: THREE.Vector3[] = [];
      const p0 = dir.clone().multiplyScalar(bellR(bellH * 0.62) + 0.02 * D).add(new THREE.Vector3(0, bellH * 0.62, 0));
      const p1 = centre.clone().add(new THREE.Vector3(0, R, 0));
      const ctrl = dir.clone().multiplyScalar(0.52 * D).add(new THREE.Vector3(0, bellH - 0.02 * D, 0));
      const segN = hi ? 6 : 2;
      for (let i = 0; i < segN; i++) {
        const t = i / segN;
        const q = new THREE.Vector3()
          .addScaledVector(p0, (1 - t) ** 2)
          .addScaledVector(ctrl, 2 * t * (1 - t))
          .addScaledVector(p1, t * t);
        stalk.push(q);
      }
      // Spiral turning outward then down (clockwise with `dir` to the right).
      const spiral = volutePath(centre, dir, up, R, hi ? 1.6 : 0.8, hi ? 16 : 4, 1);
      const path = [...stalk, ...spiral];
      pieces.push({ geometry: tube(path, (i) => 0.045 * D * (1 - (0.55 * i) / path.length), hi ? 5 : 3, hi), uv: 'box' });
    }
    if (hi) {
      // Inner helices meeting under the abacus flower on each face.
      const faces = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].filter((a) => !half || Math.cos(a) < -0.5);
      for (const f of faces) {
        const n = new THREE.Vector3(Math.sin(f), 0, Math.cos(f));
        const side = new THREE.Vector3(n.z, 0, -n.x);
        for (const s of [-1, 1]) {
          const centre = n.clone().multiplyScalar(rTop + 0.02 * D).addScaledVector(side, s * 0.1 * D).add(new THREE.Vector3(0, bellH - 0.13 * D, 0));
          const p0 = n.clone().multiplyScalar(bellR(bellH * 0.65) + 0.015 * D).addScaledVector(side, s * 0.2 * D).add(new THREE.Vector3(0, bellH * 0.65, 0));
          const spiral = volutePath(centre, side.clone().multiplyScalar(-s), up, 0.05 * D, 1.3, 10, 1);
          pieces.push({ geometry: tube([p0, ...spiral], 0.018 * D, 4, false), uv: 'box' });
        }
        // Abacus flower (fleuron).
        const fl = new THREE.SphereGeometry(0.07 * D, 6, 4);
        fl.scale(1, 1, 0.6);
        const fp = n.clone().multiplyScalar(0.66 * D).add(new THREE.Vector3(0, bellH + abH * 0.5, 0));
        fl.translate(fp.x, fp.y, fp.z);
        pieces.push({ geometry: fl, uv: 'box' });
      }
    }
  } else {
    // Composite: Ionic echinus ring with eggs, then four large diagonal volutes.
    const ey = bellH * 0.64;
    const eh = bellH * 0.16;
    const th = half ? linspace(HALF_T0, HALF_T1, hi ? 24 : 5) : linspace(0, Math.PI * 2, hi ? 48 : 10);
    pieces.push({
      geometry: gridSurface(th, linspace(0, 1, hi ? 4 : 1), (a, t, out) => {
        const r = bellR(ey + t * eh) + 0.07 * D * Math.sin(t * Math.PI) ** 0.7 + (hi ? 0.015 * D * Math.max(0, Math.cos(a * 12)) ** 2 * Math.sin(t * Math.PI) : 0);
        return out.set(r * Math.sin(a), ey + t * eh, r * Math.cos(a));
      }),
      uv: 'box',
    });
    // Canalis ring under the abacus joining the volutes.
    const can = new ProfileBuilder(bellR(bellH * 0.82), bellH * 0.82).torus(bellH * 0.12, 0.05 * D, hi ? 6 : 3).build();
    pieces.push({ geometry: lathe(can, { segments: hi ? 24 : 10, ...latheRange(half) }), uv: 'box' });
    for (const a of diagonals) {
      const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      const R = 0.2 * D;
      const centre = dir.clone().multiplyScalar(0.68 * D).add(new THREE.Vector3(0, bellH - 0.17 * D, 0));
      // Scamozzi-style diagonal volute: the scroll faces outward along the diagonal.
      pieces.push(...volute(centre, dir, R, D, 1, detail));
      const bol = new THREE.CylinderGeometry(R * 0.8, R * 0.7, 0.22 * D, hi ? 14 : 8);
      bol.rotateX(Math.PI / 2);
      bol.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir));
      const bc = centre.clone().addScaledVector(dir, -0.13 * D);
      bol.translate(bc.x, bc.y, bc.z);
      pieces.push({ geometry: bol, uv: 'box' });
    }
  }
  pieces.push(...corinthianAbacus(o, bellH, abH));
  return pieces;
}

export function capitalPieces(order: Order, o: CapitalOptions): Piece[] {
  switch (order) {
    case 'tuscan':
      return tuscanCapital(o);
    case 'doric':
      return doricCapital(o);
    case 'ionic':
      return ionicCapital(o);
    case 'corinthian':
      return corinthianCapital(o, false);
    case 'composite':
      return corinthianCapital(o, true);
  }
}
