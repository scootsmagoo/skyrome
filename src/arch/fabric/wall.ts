/**
 * Walls with openings and the small architectural details around them (sills, lintels, relieving
 * arches, shutters, door frames).
 *
 * Wall frame convention: the wall runs along x, its OUTER face lies in the plane z = 0 facing −z,
 * and it extends to z = +t (inside). y is up from the building floor.
 */
import * as THREE from 'three';
import type { Rng } from '../../core/Rng';
import type { MaterialId } from '../../gfx/materialIds';
import type { Draw } from './draw';
import type { LocalGround } from './types';

export interface Opening {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Rise of an arched top (0 / undefined = flat lintel). Semicircular when rise = half width. */
  arch?: number;
  /** Far LOD (`Draw.flags.flat`): colour of the flat quad standing in for the opening (default 'black'). */
  fill?: MaterialId;
}

const ARC_SEG = 8;

/** Points of an opening outline (counter-clockwise in the wall's xy plane). */
export function openingOutline(o: Opening): THREE.Vector2[] {
  const pts = [new THREE.Vector2(o.x0, o.y0), new THREE.Vector2(o.x1, o.y0)];
  const rise = Math.min(o.arch ?? 0, (o.x1 - o.x0) / 2, o.y1 - o.y0 - 0.05);
  if (rise > 0.01) {
    const c = (o.x1 - o.x0) / 2;
    const R = (c * c + rise * rise) / (2 * rise);
    const cx = (o.x0 + o.x1) / 2, spring = o.y1 - rise, cy = spring + rise - R;
    const a0 = Math.atan2(spring - cy, c), a1 = Math.PI - a0;
    pts.push(new THREE.Vector2(o.x1, spring));
    for (let i = 1; i < ARC_SEG; i++) {
      const a = a0 + ((a1 - a0) * i) / ARC_SEG;
      pts.push(new THREE.Vector2(cx + Math.cos(a) * R, cy + Math.sin(a) * R));
    }
    pts.push(new THREE.Vector2(o.x0, spring));
  } else {
    pts.push(new THREE.Vector2(o.x1, o.y1), new THREE.Vector2(o.x0, o.y1));
  }
  return pts;
}

/** Keep only openings that sit strictly inside the wall and don't overlap each other. */
export function validOpenings(x0: number, x1: number, y0: number, y1: number, openings: Opening[], margin = 0.08): Opening[] {
  const out: Opening[] = [];
  for (const o of openings) {
    if (o.x1 - o.x0 < 0.1 || o.y1 - o.y0 < 0.1) continue;
    if (o.x0 < x0 + margin || o.x1 > x1 - margin || o.y0 < y0 + margin || o.y1 > y1 - margin) continue;
    if (out.some((p) => o.x0 < p.x1 + margin && o.x1 > p.x0 - margin && o.y0 < p.y1 + margin && o.y1 > p.y0 - margin)) continue;
    out.push(o);
  }
  return out;
}

/** The wall outline as a THREE.Shape with one hole per (valid) opening. */
export function wallShape(x0: number, x1: number, y0: number, y1: number, openings: Opening[]): THREE.Shape {
  const s = new THREE.Shape([new THREE.Vector2(x0, y0), new THREE.Vector2(x1, y0), new THREE.Vector2(x1, y1), new THREE.Vector2(x0, y1)]);
  for (const o of validOpenings(x0, x1, y0, y1, openings)) s.holes.push(new THREE.Path(openingOutline(o)));
  return s;
}

/**
 * A wall slab from x0..x1, y0..y1, thickness t (outer face at z = 0), pierced by `openings`.
 * Returns the openings actually cut (invalid ones are dropped).
 */
export function wall(d: Draw, mat: MaterialId, x0: number, x1: number, y0: number, y1: number, t: number, openings: Opening[] = [], uvScale?: number): Opening[] {
  const valid = validOpenings(x0, x1, y0, y1, openings);
  if (d.flags.flat) {
    // Far LOD: a plain slab with the openings painted on just in front of the outer face.
    d.span(mat, x0, y0, 0, x1, y1, t, { uvScale });
    for (const o of valid) d.poly(o.fill ?? 'black', openingOutline(o).reverse().map((p) => ({ x: p.x, y: p.y, z: -0.012 })));
    return valid;
  }
  if (!valid.length) {
    d.span(mat, x0, y0, 0, x1, y1, t, { uvScale });
    return valid;
  }
  const g = new THREE.ExtrudeGeometry(wallShape(x0, x1, y0, y1, valid), { depth: t, bevelEnabled: false, curveSegments: 1 });
  d.geo(g, mat, 0, 0, 0, { uvScale });
  g.dispose();
  return valid;
}

/** A thin band along the wall (string course / cornice / dado). `out` = protrusion beyond z = 0. */
export function band(d: Draw, mat: MaterialId, x0: number, x1: number, y: number, h: number, out: number, opts: { shadow?: boolean } = {}) {
  d.span(mat, x0, y, -out, x1, y + h, 0.02, { shadow: opts.shadow ?? false });
}

export interface SocleOpts {
  /** Painted dado (null = none). */
  dado?: MaterialId | null;
  /** Masonry socle over the exposed foundation where the ground lies below the floor (null = none). */
  socle?: MaterialId | null;
  /** Dado height (default 1.1 m). */
  h?: number;
  /** Floor level in this frame (default 0). */
  floor?: number;
  /** Openings to leave clear (only those reaching down into the dado zone matter). */
  skip?: Opening[];
  /** Segment length along the wall (default 1.2 m). */
  step?: number;
}

/**
 * Socle and painted dado along a wall face (wall frame), following the terrain in front of the
 * wall (`ground`, the building's local ground function, probed 0.3 m outside the face). Where the
 * ground falls clearly below the floor, a masonry socle covers the exposed foundation up to floor
 * level and the dado sits on it; elsewhere the dado starts at the ground and runs parallel to it.
 * So a domus on a slope gets a stone podium with a ~1.1 m red band above it, never a 3 m painted
 * band, and the plaster never runs down into the dirt. Cheap: one box per socle run and a
 * two-face strip (4 triangles per ~1 m) for the dado.
 */
export function socleAndDado(d: Draw, x0: number, x1: number, yMin: number, ground: LocalGround, o: SocleOpts = {}) {
  const h = o.h ?? 1.1, floor = o.floor ?? 0, step = o.step ?? (d.flags.flat ? 3 : 1.0);
  if (!o.dado && !o.socle) return;
  // Wall-x intervals between the low openings.
  const cuts = (o.skip ?? []).filter((p) => p.y0 < floor + h).map((p) => [p.x0, p.x1] as [number, number]).sort((a, b) => a[0] - b[0]);
  const spans: [number, number][] = [];
  let x = x0;
  for (const [a, b] of cuts) {
    if (a > x) spans.push([x, Math.min(a, x1)]);
    x = Math.max(x, b);
  }
  if (x < x1) spans.push([x, x1]);
  const y0 = d.point(0, 0, 0).y;
  const gAt = (lx: number) => {
    const p = d.point(lx, 0, -0.3);
    return ground(p.x, p.z) + p.y - y0;
  };
  for (const [a, b] of spans) {
    if (b - a < 0.04) continue;
    const n = Math.max(1, Math.round((b - a) / step));
    const xs = Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
    const gs = xs.map(gAt);
    const podium = gs.map((g) => !!o.socle && g < floor - 0.12);
    // Socle: one box per run of consecutive podium samples.
    if (o.socle) {
      for (let i = 0; i <= n; i++) {
        if (!podium[i]) continue;
        let j = i;
        while (j < n && podium[j + 1]) j++;
        const sa = i === 0 ? a : (xs[i - 1] + xs[i]) / 2, sb = j === n ? b : (xs[j] + xs[j + 1]) / 2;
        d.span(o.socle, sa, yMin, -0.03, sb, floor, 0.02);
        i = j;
      }
    }
    if (!o.dado) continue;
    // Dado: a band whose bottom follows the ground (or sits on the socle), reaching 15 cm below
    // it so no plaster shows at the foot. Front face at z = −0.015 plus a thin top face.
    const pos: number[] = [];
    const base = gs.map((g, i) => (podium[i] ? floor : g));
    // Front quad facing −z (the street side of the wall frame).
    const quad = (ax: number, ay0: number, ay1: number, bx: number, by0: number, by1: number, z: number) =>
      pos.push(ax, ay0, z, bx, by1, z, bx, by0, z, ax, ay0, z, ax, ay1, z, bx, by1, z);
    for (let i = 0; i < n; i++) {
      const xa = xs[i], xb = xs[i + 1];
      let ba = base[i], bb = base[i + 1];
      // A step where the band leaves / meets the socle.
      if (podium[i] !== podium[i + 1]) {
        const xm = (xa + xb) / 2;
        quad(xa, ba - 0.15, ba + h, xm, ba - 0.15, ba + h, -0.015);
        quad(xm, bb - 0.15, bb + h, xb, bb - 0.15, bb + h, -0.015);
        const lo = Math.min(ba, bb) + h, hi = Math.max(ba, bb) + h;
        const sx = ba > bb ? 1 : -1; // the step face looks toward the lower side
        pos.push(xm, lo, -0.015, xm, hi, -0.015, xm, hi, 0.01, xm, lo, -0.015, xm, hi, 0.01, xm, lo, 0.01);
        if (sx < 0) for (let k = pos.length - 18; k < pos.length; k += 9) for (let c = 0; c < 3; c++) [pos[k + 3 + c], pos[k + 6 + c]] = [pos[k + 6 + c], pos[k + 3 + c]];
        continue;
      }
      quad(xa, ba - 0.15, ba + h, xb, bb - 0.15, bb + h, -0.015);
      // Top face (normal up): (xa, top, front) → (xb, top, front) → (xb, top, back).
      pos.push(xa, ba + h, -0.015, xb, bb + h, 0.01, xb, bb + h, -0.015, xa, ba + h, -0.015, xa, ba + h, 0.01, xb, bb + h, 0.01);
    }
    // End faces.
    for (const [ex, eb, sgn] of [[a, base[0], -1], [b, base[n], 1]] as const) {
      const p0 = [ex, eb - 0.15, -0.015], p1 = [ex, eb + h, -0.015], p2 = [ex, eb + h, 0.01], p3 = [ex, eb - 0.15, 0.01];
      if (sgn < 0) pos.push(...p0, ...p2, ...p1, ...p0, ...p3, ...p2);
      else pos.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
    }
    d.tris(o.dado, pos);
  }
}

/** Curved band (relieving arch / archivolt) over an opening, protruding `out` from the face. */
export function archBand(d: Draw, mat: MaterialId, cx: number, spring: number, halfW: number, rise: number, thick: number, out: number) {
  const c = halfW, R = (c * c + rise * rise) / (2 * rise);
  const cy = spring + rise - R;
  const a0 = Math.atan2(spring - cy, c), a1 = Math.PI - a0;
  const shape = new THREE.Shape();
  const n = ARC_SEG;
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const p = new THREE.Vector2(cx + Math.cos(a) * (R + thick), cy + Math.sin(a) * (R + thick));
    if (i === 0) shape.moveTo(p.x, p.y);
    else shape.lineTo(p.x, p.y);
  }
  for (let i = n; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / n;
    shape.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: out + 0.02, bevelEnabled: false, curveSegments: 1 });
  d.geo(g, mat, 0, 0, -out, { shadow: false });
  g.dispose();
}

export interface WindowStyle {
  sill?: MaterialId | null;
  /** Flat lintel above the window. */
  lintel?: MaterialId | null;
  /** Brick flat/segmental arch above (used on brick facades). */
  relieving?: MaterialId | null;
  shutters?: 'open' | 'half' | 'closed' | null;
  shutterMat?: MaterialId;
  /** Wall thickness (for closed shutters set into the reveal). */
  t: number;
  /** Iron grille (ground-floor / storeroom windows). */
  grille?: boolean;
}

/** Sill, lintel / arch, shutters and grille for one window opening. */
export function windowDetails(d: Draw, o: Opening, s: WindowStyle) {
  const w = o.x1 - o.x0, h = o.y1 - o.y0, cx = (o.x0 + o.x1) / 2;
  if (s.sill) d.span(s.sill, o.x0 - 0.08, o.y0 - 0.09, -0.07, o.x1 + 0.08, o.y0 + 0.005, 0.12, { shadow: false });
  if (s.lintel) d.span(s.lintel, o.x0 - 0.12, o.y1, -0.025, o.x1 + 0.12, o.y1 + 0.2, 0.05, { shadow: false });
  if (s.relieving && !s.lintel) archBand(d, s.relieving, cx, o.y1 - 0.04, w / 2 + 0.1, Math.min(0.22, w * 0.18), 0.22, 0.025);
  const sm = s.shutterMat ?? 'wood_painted';
  if (s.shutters === 'closed') {
    // Two leaves set back in the reveal, with a vertical gap and horizontal battens.
    const z = s.t * 0.35;
    d.span(sm, o.x0 + 0.01, o.y0 + 0.01, z, cx - 0.01, o.y1 - (o.arch ? o.arch : 0) - 0.01, z + 0.04);
    d.span(sm, cx + 0.01, o.y0 + 0.01, z, o.x1 - 0.01, o.y1 - (o.arch ? o.arch : 0) - 0.01, z + 0.04);
    for (const fy of [0.2, 0.75]) d.span('wood_dark', o.x0 + 0.05, o.y0 + h * fy, z - 0.02, o.x1 - 0.05, o.y0 + h * fy + 0.06, z, { shadow: false });
  } else if (s.shutters === 'open' || s.shutters === 'half') {
    // Leaves hinged at the window edges, swung outward by φ (0 = closed, π = folded flat on the facade).
    const lw = w / 2, lh = (o.arch ? h - o.arch : h) - 0.04;
    const phi = s.shutters === 'open' ? Math.PI - 0.1 : 2.0;
    for (const side of [-1, 1]) {
      const hingeX = side < 0 ? o.x0 : o.x1;
      const dx = -side * Math.cos(phi), dz = -Math.sin(phi);
      const cx = hingeX + dx * (lw / 2), cz = -0.06 + dz * (lw / 2);
      const ry = side < 0 ? phi : Math.PI - phi;
      d.box(sm, cx, o.y0 + 0.02 + lh / 2, cz, lw, lh, 0.035, { ry });
    }
  }
  if (s.grille) {
    const bars = Math.max(2, Math.round(w / 0.16));
    for (let i = 1; i < bars; i++) {
      const x = o.x0 + (w * i) / bars;
      d.span('iron', x - 0.012, o.y0, s.t * 0.3, x + 0.012, o.y1 - (o.arch ?? 0) * 0.4, s.t * 0.3 + 0.024, { shadow: false });
    }
  }
}

/** Travertine door frame (jambs + lintel + threshold) around a door opening on the outer face. */
export function doorFrame(d: Draw, o: Opening, mat: MaterialId = 'travertine', opts: { cornice?: boolean; jamb?: number } = {}) {
  const j = opts.jamb ?? 0.16;
  d.span(mat, o.x0 - j, o.y0, -0.05, o.x0, o.y1, 0.04, { shadow: false });
  d.span(mat, o.x1, o.y0, -0.05, o.x1 + j, o.y1, 0.04, { shadow: false });
  d.span(mat, o.x0 - j - 0.04, o.y1, -0.06, o.x1 + j + 0.04, o.y1 + 0.24, 0.04, { shadow: false });
  if (opts.cornice) {
    d.span(mat, o.x0 - j - 0.14, o.y1 + 0.24, -0.2, o.x1 + j + 0.14, o.y1 + 0.34, 0.04);
    d.span(mat, o.x0 - j - 0.08, o.y1 + 0.34, -0.14, o.x1 + j + 0.08, o.y1 + 0.42, 0.04, { shadow: false });
  }
  // Threshold slab (with the groove of plank shutters implied).
  d.span(mat, o.x0 - 0.02, o.y0 - 0.06, -0.12, o.x1 + 0.02, o.y0 + 0.02, 0.5);
}

/** Pair of wooden door leaves set in the reveal; `open` 0..1 swings them inward. */
export function doorLeaves(d: Draw, o: Opening, t: number, open = 0, mat: MaterialId = 'wood_dark', studs = false) {
  const w = o.x1 - o.x0, h = o.y1 - o.y0 - (o.arch ?? 0);
  const lw = w / 2 - 0.01;
  const z = t * 0.5;
  for (const side of [-1, 1]) {
    const hx = side < 0 ? o.x0 + 0.01 : o.x1 - 0.01;
    const phi = open * 1.35; // swing inward (+z)
    const cx = hx - side * Math.cos(phi) * (lw / 2);
    const cz = z + Math.sin(phi) * (lw / 2);
    d.box(mat, cx, o.y0 + h / 2, cz, lw, h - 0.02, 0.06, { ry: side * phi });
    if (studs && open < 0.1) {
      for (const fy of [0.2, 0.5, 0.8]) d.box('bronze', cx, o.y0 + h * fy, z - 0.04, lw * 0.85, 0.05, 0.02, { shadow: false });
    }
  }
}

/** Vertical plank shutters closing a shop front (the Roman taberna closure). */
export function plankShutters(d: Draw, o: Opening, t: number, rng: Rng, withDoor = true) {
  const h = o.y1 - o.y0 - (o.arch ?? 0);
  const n = Math.max(3, Math.round((o.x1 - o.x0) / 0.32));
  const pw = (o.x1 - o.x0) / n;
  const z = t * 0.3;
  for (let i = 0; i < n; i++) {
    const x0 = o.x0 + i * pw;
    const mat: MaterialId = withDoor && i === n - 2 ? 'wood_dark' : rng.chance(0.2) ? 'wood_dark' : 'wood';
    d.span(mat, x0 + 0.008, o.y0 + 0.01, z + (i % 2) * 0.012, x0 + pw - 0.008, o.y0 + h - 0.02, z + 0.05 + (i % 2) * 0.012);
  }
  d.span('wood_dark', o.x0 + 0.03, o.y0 + h - 0.32, z - 0.03, o.x1 - 0.03, o.y0 + h - 0.24, z, { shadow: false });
  d.span('wood_dark', o.x0 + 0.03, o.y0 + 0.3, z - 0.03, o.x1 - 0.03, o.y0 + 0.38, z, { shadow: false });
}
