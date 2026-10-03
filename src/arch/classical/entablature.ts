/**
 * Entablatures, cornices and pediments.
 *
 * Profiles are 2D (x = outward from the architrave face, y = up from the architrave soffit) and
 * swept along a path that runs through the ARCHITRAVE FACE line. Walking a rectangle
 * (−x,−z) → (+x,−z) → (+x,+z) → (−x,+z) puts the mouldings on the outside (see geom.sweep).
 *
 * Dentils, modillions, triglyphs and mutules are separate small blocks laid along each straight
 * segment of the path, starting at the segment's first point (put corner column axes there).
 */
import * as THREE from 'three';
import type { MeshBuilder } from '../../gfx/MeshBuilder';
import type { MaterialId } from '../../gfx/materialIds';
import { ProfileBuilder, extrudePolygon, mul, sweep, type Profile, type V2 } from '../common/geom';
import { armoredEmperor, seatedDeity, togate } from './statues';
import { ORDER_PROPORTIONS, entablatureDims, pedimentRise, type Detail, type EntablatureDims, type Order } from './orders';

export interface EntablatureSpec {
  order: Order;
  /** Column height the entablature sits on (sets its proportions). */
  columnHeight: number;
  /** Lower column diameter (sizes dentils/modillions/triglyphs). */
  D: number;
  /** Depth of the architrave block behind its face (default: upper column diameter). */
  depth?: number;
  material?: MaterialId;
  /** Frieze surface material (e.g. 'porphyry'); default = material. */
  friezeMaterial?: MaterialId | THREE.Material;
  detail?: Detail;
  /** Crowning sima (gutter). Default true. */
  sima?: boolean;
  /** Axial column spacing along the path (Doric triglyph rhythm, modillion alignment). */
  axial?: number;
  /** Override the default proportions. */
  dims?: Partial<EntablatureDims>;
}

export interface EntablatureResult {
  dims: EntablatureDims;
  /** Frieze face offset from the architrave face (positive = outward). */
  friezeX: number;
  /** Depth of the entablature block behind the architrave face. */
  depth: number;
  /** Height of the cornice top above the path. */
  top: number;
  /** Horizontal reach of the cornice beyond the architrave face. */
  projection: number;
}

function resolveDims(spec: EntablatureSpec): EntablatureDims {
  const d = entablatureDims(spec.order, spec.columnHeight);
  const o = spec.dims ?? {};
  const out = { ...d, ...o };
  out.total = out.architrave + out.frieze + out.cornice;
  return out;
}

/** Architrave profile from the soffit up to the frieze face (x = 0 is the lowest fascia). */
function architraveProfile(p: ProfileBuilder, A: number, fasciae: number, detail: Detail) {
  const n = detail === 'high' ? 4 : 2;
  const crown = 0.18 * A;
  if (fasciae >= 3) {
    p.up(0.22 * A).out(0.025 * A).up(0.27 * A).out(0.025 * A).up(0.33 * A);
  } else if (fasciae === 2) {
    p.up(0.36 * A).out(0.03 * A).up(0.46 * A);
  } else {
    p.up(0.82 * A);
  }
  p.cymaReversa(0.06 * A, crown, n);
}

/**
 * Cornice profile from the frieze top. Tuscan/Doric: plain bed moulding + big corona;
 * Ionic: dentil band; Corinthian/Composite: dentils + modillion zone. Returns band heights
 * (relative to the cornice bottom) used to place the blocks.
 */
function corniceProfile(p: ProfileBuilder, Cn: number, order: Order, detail: Detail, sima: boolean) {
  const n = detail === 'high' ? 4 : 2;
  const props = ORDER_PROPORTIONS[order];
  const x0 = p.x;
  const y0 = p.y;
  const bands = { dentilY: 0, dentilH: 0, dentilX: 0, modY: 0, modH: 0, modX: 0, soffitY: 0, soffitX: 0 };
  if (props.modillions) {
    p.cymaReversa(0.06 * Cn, 0.09 * Cn, n);
    bands.dentilY = p.y - y0;
    bands.dentilX = p.x - x0;
    bands.dentilH = 0.17 * Cn;
    p.up(bands.dentilH).out(0.03 * Cn).ovolo(0.08 * Cn, 0.09 * Cn, n);
    bands.modY = p.y - y0;
    bands.modX = p.x - x0;
    bands.modH = 0.17 * Cn;
    p.up(bands.modH);
    p.out(0.42 * Cn);
    bands.soffitY = p.y - y0;
    bands.soffitX = p.x - x0;
    p.up(0.19 * Cn).cymaReversa(0.03 * Cn, 0.05 * Cn, n);
  } else if (props.dentils) {
    p.cymaReversa(0.06 * Cn, 0.1 * Cn, n);
    bands.dentilY = p.y - y0;
    bands.dentilX = p.x - x0;
    bands.dentilH = 0.22 * Cn;
    p.up(bands.dentilH).out(0.04 * Cn).ovolo(0.1 * Cn, 0.12 * Cn, n);
    p.out(0.38 * Cn);
    bands.soffitY = p.y - y0;
    bands.soffitX = p.x - x0;
    p.up(0.22 * Cn).cymaReversa(0.03 * Cn, 0.06 * Cn, n);
  } else {
    // Tuscan / Doric: bed ovolo, deep corona (Doric mutules hang under it).
    p.up(0.08 * Cn).ovolo(0.14 * Cn, 0.16 * Cn, n).up(0.06 * Cn);
    bands.modY = p.y - y0;
    p.out(0.5 * Cn);
    bands.soffitY = p.y - y0;
    bands.soffitX = p.x - x0;
    p.up(0.3 * Cn).cymaReversa(0.03 * Cn, 0.06 * Cn, n);
  }
  const rest = Cn - (p.y - y0);
  if (sima) {
    p.cymaRecta(0.16 * Cn, Math.max(0.05 * Cn, rest - 0.03 * Cn), n).up(0.03 * Cn);
  } else {
    p.up(Math.max(0.02 * Cn, rest));
  }
  return bands;
}

/** Full entablature profile (closed with a back face by the sweep). */
export function entablatureProfile(spec: EntablatureSpec): { profile: Profile; bands: ReturnType<typeof corniceProfile>; dims: EntablatureDims; depth: number; friezeX: number } {
  const dims = resolveDims(spec);
  const detail = spec.detail ?? 'high';
  const depth = spec.depth ?? spec.D * ORDER_PROPORTIONS[spec.order].topRatio;
  const p = new ProfileBuilder(-depth, 0).to(0, 0);
  architraveProfile(p, dims.architrave, ORDER_PROPORTIONS[spec.order].fasciae, detail);
  const friezeX = p.x - 0.03 * dims.architrave;
  p.in(0.03 * dims.architrave).up(dims.frieze);
  const bands = corniceProfile(p, dims.cornice, spec.order, detail, spec.sima ?? true);
  // Top surface back to the inside, the sweep's `back` option closes the profile.
  p.to(-depth, p.y);
  return { profile: p.build(), bands, dims, depth, friezeX };
}

/** Just the cornice (podium crowns, attics, wall tops) — starts at x = 0, y = 0. */
export function corniceOnlyProfile(order: Order, Cn: number, detail: Detail, depth: number, sima = true): { profile: Profile; bands: ReturnType<typeof corniceProfile> } {
  const p = new ProfileBuilder(-depth, 0).to(0, 0);
  const bands = corniceProfile(p, Cn, order, detail, sima);
  p.to(-depth, p.y);
  return { profile: p.build(), bands };
}

interface Segment {
  a: THREE.Vector3;
  b: THREE.Vector3;
  t: THREE.Vector3;
  n: THREE.Vector3;
  len: number;
}

function segments(path: THREE.Vector3[], closed: boolean, outward?: THREE.Vector3): Segment[] {
  const out: Segment[] = [];
  const nSeg = closed ? path.length : path.length - 1;
  for (let i = 0; i < nSeg; i++) {
    const a = path[i];
    const b = path[(i + 1) % path.length];
    const t = b.clone().sub(a);
    const len = t.length();
    t.normalize();
    const n = outward ? outward.clone() : new THREE.Vector3(t.z, 0, -t.x).normalize();
    out.push({ a, b, t, n, len });
  }
  return out;
}

const _m = new THREE.Matrix4();
const _basis = new THREE.Matrix4();

/** Matrix placing a local block (x along the path, y up, z = −outward... see below). */
function frameMatrix(s: Segment, along: number, outward: number, up: number): THREE.Matrix4 {
  // local x → tangent, local y → "up" of the frame (t × n), local z → −n (+z points back into the wall)
  const u = new THREE.Vector3().crossVectors(s.t, s.n).normalize();
  const p = s.a.clone().addScaledVector(s.t, along).addScaledVector(s.n, outward).addScaledVector(u, up);
  const back = s.n.clone().negate();
  _basis.makeBasis(s.t, u, back);
  return _m.copy(_basis).setPosition(p).clone();
}

/** Repeated blocks along each segment, skipping a margin at both ends. */
function along(s: Segment, spacing: number, margin: number, offset = 0): number[] {
  const out: number[] = [];
  const usable = s.len - 2 * margin;
  if (usable <= 0) return out;
  const n = Math.max(1, Math.floor(usable / spacing));
  const start = margin + (usable - (n - 1) * spacing) / 2 + offset;
  for (let i = 0; i < n; i++) out.push(start + i * spacing);
  return out;
}

/**
 * Sweep an entablature along `path` (architrave face line, y = column top) into `b`.
 * `closed` for a full perimeter.
 */
export function entablature(b: MeshBuilder, path: THREE.Vector3[], spec: EntablatureSpec, opts: { closed?: boolean; at?: THREE.Matrix4; caps?: boolean } = {}): EntablatureResult {
  const detail = spec.detail ?? 'high';
  const mat = spec.material ?? 'marble';
  const { profile, bands, dims, depth, friezeX } = entablatureProfile(spec);
  const m = opts.at;
  b.add(sweep(profile, path, { closed: opts.closed, back: true, caps: opts.caps ?? !opts.closed }), mat, m);
  const segs = segments(path, !!opts.closed);
  const A = dims.architrave;
  const F = dims.frieze;
  const Cn = dims.cornice;
  const cy = A + F; // cornice bottom
  const D = spec.D;
  // Frieze facing (optional different material, slightly proud of the frieze face).
  if (spec.friezeMaterial) {
    for (const s of segs) {
      const g = new THREE.BoxGeometry(s.len, F * 0.98, 0.01);
      g.translate(s.len / 2, F / 2, -0.005);
      b.add(g, spec.friezeMaterial, mulOpt(m, frameMatrix(s, 0, friezeX + 0.006, A)));
    }
  }
  if (detail === 'high') {
    const props = ORDER_PROPORTIONS[spec.order];
    // Dentils.
    if (props.dentils && bands.dentilH > 0) {
      const h = bands.dentilH;
      const w = h * 0.62;
      const gap = w * 0.5;
      const proj = h * 0.55;
      const dent = new THREE.BoxGeometry(w, h, proj + 0.02);
      for (const s of segs) {
        for (const x of along(s, w + gap, proj + w)) {
          const g = dent.clone().translate(0, h / 2, -proj / 2 + 0.01);
          b.add(g, mat, mulOpt(m, frameMatrix(s, x, friezeX + bands.dentilX, cy + bands.dentilY)));
        }
      }
    }
    // Modillions: scroll brackets under the corona soffit.
    if (props.modillions && bands.modH > 0) {
      const spacing = spec.axial ? spec.axial / Math.max(1, Math.round(spec.axial / (0.95 * D))) : 0.95 * D;
      const reach = bands.soffitX - bands.modX;
      const h = bands.modH;
      const w = spacing * 0.32;
      const side: V2[] = [
        [0, 0],
        [0, h],
        [reach, h],
        [reach, h * 0.55],
        [reach * 0.82, h * 0.3],
        [reach * 0.45, h * 0.32],
        [reach * 0.25, h * 0.12],
        [reach * 0.12, 0],
      ];
      // extrudePolygon: shape in XY (x = outward, y = up), depth along −Z → we rotate so the
      // depth runs along the path tangent.
      const mod = extrudePolygon(side, w);
      mod.translate(0, 0, w / 2);
      mod.rotateY(Math.PI / 2); // shape x (outward) → −z (local frame: −z is outward)
      for (const s of segs) {
        for (const x of along(s, spacing, w + reach * 0.5)) {
          b.add(mod, mat, mulOpt(m, frameMatrix(s, x, friezeX + bands.modX, cy + bands.modY)));
        }
      }
    }
    // Doric triglyphs (over each axis and midway) and mutules under the corona.
    if (props.triglyphs) {
      const tw = D / 2;
      const spacing = spec.axial ? spec.axial / 2 : 1.5 * D;
      const tri = new THREE.BoxGeometry(tw, F, 0.06 * D);
      const groove = new THREE.BoxGeometry(tw / 7, F * 0.86, 0.02 * D);
      const mutule = new THREE.BoxGeometry(tw, 0.05 * D, (bands.soffitX - 0.05 * D) * 0.9);
      for (const s of segs) {
        const n = Math.round(s.len / spacing);
        for (let i = 0; i <= n; i++) {
          const x = Math.min(s.len - tw / 2, Math.max(tw / 2, (i * s.len) / n));
          if (opts.closed && i === n) continue; // the next segment starts with this corner
          const fm = mulOpt(m, frameMatrix(s, x, friezeX, A));
          b.add(tri.clone().translate(0, F / 2, -0.03 * D), mat, fm);
          for (const gx of [-tw / 7, tw / 7]) b.add(groove.clone().translate(gx, F * 0.43, -0.065 * D), 'black', fm, { castShadow: false });
          b.add(mutule.clone().translate(0, -0.025 * D, -(bands.soffitX - 0.05 * D) * 0.45), mat, mulOpt(m, frameMatrix(s, x, friezeX + 0.05 * D, cy + bands.soffitY)));
        }
      }
    }
  }
  const projection = friezeX + bands.soffitX + 0.2 * Cn;
  return { dims, top: dims.total, projection, friezeX, depth };
}

function mulOpt(a: THREE.Matrix4 | undefined, b: THREE.Matrix4): THREE.Matrix4 {
  return a ? a.clone().multiply(b) : b;
}

// ---------------------------------------------------------------- pediment

export interface PedimentSpec {
  order: Order;
  /** Width between the architrave faces at the ends of the facade. */
  span: number;
  /** Cornice height of the entablature below (raking cornice uses the same). */
  cornice: number;
  /** Depth of the tympanum wall behind the frieze face. */
  depth: number;
  /** Distance of the frieze face behind the architrave face (from entablature()). */
  friezeX?: number;
  pitchDeg?: number;
  material?: MaterialId;
  tympanumMaterial?: MaterialId | THREE.Material;
  detail?: Detail;
  D: number;
  /** Sculpture group in the tympanum (a placeholder for the real pedimental sculpture). */
  relief?: boolean;
  reliefMaterial?: MaterialId;
}

export interface PedimentResult {
  rise: number;
  /** Apex height of the raking cornice top above the pediment base. */
  apex: number;
  /** Slope (radians). */
  pitch: number;
}

/**
 * Pediment in the plane z = 0 facing −z, base line at y = 0 (= top of the horizontal cornice),
 * centred on x = 0. Raking cornices with sima, a recessed tympanum and (high detail) raking
 * dentils/modillions.
 */
export function pediment(b: MeshBuilder, spec: PedimentSpec, at?: THREE.Matrix4): PedimentResult {
  const detail = spec.detail ?? 'high';
  const mat = spec.material ?? 'marble';
  const pitchDeg = spec.pitchDeg ?? 14;
  const pitch = (pitchDeg * Math.PI) / 180;
  const half = spec.span / 2;
  const rise = pedimentRise(spec.span, pitchDeg);
  const Cn = spec.cornice;
  const fx = spec.friezeX ?? 0.03 * Cn;
  // The raking cornice's baseline starts at the horizontal cornice's top-front, lowered by the
  // cornice height so its sima meets the eaves.
  const { profile, bands } = corniceOnlyProfile(spec.order, Cn, detail, spec.depth, true);
  const base = -Cn * 0.55; // tuck the raking base into the horizontal cornice
  const left = new THREE.Vector3(-half - Cn * 0.2, base, 0);
  const apex = new THREE.Vector3(0, base + (half + Cn * 0.2) * Math.tan(pitch), 0);
  const right = new THREE.Vector3(half + Cn * 0.2, base, 0);
  const shifted: Profile = { pts: profile.pts.map(([x, y]) => [x + fx, y] as V2), smooth: profile.smooth };
  b.add(sweep(shifted, [left, apex, right], { outward: new THREE.Vector3(0, 0, -1), back: true, caps: true }), mat, at);
  // Tympanum: triangle recessed to the frieze face, under the raking soffit.
  const tyH = apex.y - Cn * 0.1;
  const tyHalf = (tyH - base) / Math.tan(pitch);
  const tri = extrudePolygon(
    [
      [-tyHalf, base],
      [tyHalf, base],
      [0, tyH],
    ],
    spec.depth,
  );
  tri.translate(0, 0, fx + 0.02);
  // extrudePolygon occupies z ∈ [−depth, 0]; flip so the face is at −fx and the body goes back (+z).
  tri.rotateY(Math.PI);
  b.add(tri, spec.tympanumMaterial ?? mat, at);
  // Raking dentils/modillions.
  if (detail === 'high' && (ORDER_PROPORTIONS[spec.order].dentils || ORDER_PROPORTIONS[spec.order].modillions)) {
    const h = ORDER_PROPORTIONS[spec.order].modillions ? bands.modH : bands.dentilH;
    const y = ORDER_PROPORTIONS[spec.order].modillions ? bands.modY : bands.dentilY;
    const x = ORDER_PROPORTIONS[spec.order].modillions ? bands.modX : bands.dentilX;
    const w = ORDER_PROPORTIONS[spec.order].modillions ? spec.D * 0.3 : h * 0.62;
    const spacing = ORDER_PROPORTIONS[spec.order].modillions ? spec.D * 0.95 : w * 1.5;
    const reach = ORDER_PROPORTIONS[spec.order].modillions ? bands.soffitX - bands.modX : h * 0.55;
    const blk = new THREE.BoxGeometry(w, h, reach);
    for (const [a, c] of [
      [left, apex],
      [apex, right],
    ] as const) {
      const seg: Segment = { a, b: c, t: c.clone().sub(a).normalize(), n: new THREE.Vector3(0, 0, -1), len: a.distanceTo(c) };
      for (const s of along(seg, spacing, spacing * 0.8)) {
        const fm = frameMatrix(seg, s, fx + x, y);
        b.add(blk.clone().translate(0, h / 2, -reach / 2 + 0.01), mat, mulOpt(at, fm));
      }
    }
  }
  if (spec.relief) pedimentSculpture(b, { halfSpan: tyHalf, base: base + Cn * 0.55, top: tyH, z: -(fx + 0.02), material: spec.reliefMaterial ?? mat, detail }, at);
  return { rise, apex: apex.y + Cn / Math.cos(pitch), pitch };
}

/**
 * Pedimental sculpture in high relief: an enthroned deity under the apex, standing and
 * kneeling figures diminishing towards the corners, reclining figures in the angles. Figures
 * are flattened statues standing on the horizontal cornice (y = base) in front of the
 * tympanum face (z), facing −z.
 */
export function pedimentSculpture(b: MeshBuilder, o: { halfSpan: number; base: number; top: number; z: number; material: MaterialId; detail: Detail }, at?: THREE.Matrix4) {
  const m = at ?? new THREE.Matrix4();
  const H = o.top - o.base; // clear height under the apex
  const slope = H / o.halfSpan;
  const clear = (x: number) => Math.max(0, H - Math.abs(x) * slope) * 0.97;
  const depth = 0.22;
  const place = (x: number, figH: number, kind: 'seated' | 'standing' | 'kneeling' | 'reclining', facing: number) => {
    if (figH < 0.25) return;
    let sc: number;
    // forward on the cornice shelf so the group is seen from the ground below
    const local = new THREE.Matrix4().makeTranslation(x, o.base + 0.03, o.z - depth - 0.32);
    // flatten towards the wall, then turn the figure slightly towards the centre
    local.multiply(new THREE.Matrix4().makeScale(1, 1, 0.38)).multiply(new THREE.Matrix4().makeRotationY(facing));
    if (kind === 'seated') {
      sc = figH / 2.0;
      seatedDeity(b, mul(m, local), { material: o.material, scale: sc, detail: 'low', plinth: false, throneMaterial: o.material });
    } else if (kind === 'reclining') {
      // a togate figure laid along the cornice, head towards the centre
      sc = (figH / 0.42) * 0.25;
      const lie = new THREE.Matrix4().makeRotationZ(x < 0 ? -Math.PI / 2 + 0.12 : Math.PI / 2 - 0.12).setPosition(0, figH * 0.55, 0);
      togate(b, mul(mul(m, local), lie), { material: o.material, scale: sc, detail: 'low', plinth: false });
    } else if (kind === 'kneeling') {
      sc = figH / 1.25;
      armoredEmperor(b, mul(mul(m, local), new THREE.Matrix4().makeTranslation(0, -0.55 * sc, 0)), { material: o.material, scale: sc, detail: 'low', plinth: false, spear: false });
    } else {
      sc = figH / 1.95;
      togate(b, mul(m, local), { material: o.material, scale: sc, detail: 'low', plinth: false });
    }
  };
  place(0, clear(0) * 0.98, 'seated', 0);
  const slots = [0.22, 0.4, 0.56, 0.7, 0.86];
  slots.forEach((f, i) => {
    for (const sx of [-1, 1]) {
      const x = sx * f * o.halfSpan;
      const h = clear(x);
      const kind = i === slots.length - 1 ? 'reclining' : i >= 3 ? 'kneeling' : 'standing';
      place(x, kind === 'reclining' ? Math.min(h * 1.6, 0.9 * H) : h, kind, sx * -0.35);
    }
  });
}

// ---------------------------------------------------------------- acroteria

/** Palmette acroterion on a small plinth (corner and apex ornaments). Origin at its base. */
export function acroterion(b: MeshBuilder, size: number, material: MaterialId, at: THREE.Matrix4, detail: Detail = 'high') {
  const plinth = new THREE.BoxGeometry(size * 0.7, size * 0.25, size * 0.5);
  plinth.translate(0, size * 0.125, 0);
  b.add(plinth, material, at);
  // Fan of leaves (anthemion) as a flat extruded outline.
  const n = detail === 'high' ? 9 : 5;
  const pts: V2[] = [];
  for (let i = 0; i <= n * 2; i++) {
    const a = Math.PI * (0.08 + (0.84 * i) / (n * 2));
    const r = i % 2 === 0 ? size * 0.75 : size * 0.45;
    pts.push([Math.cos(a) * r, size * 0.25 + Math.sin(a) * r]);
  }
  pts.push([size * 0.08, size * 0.25]);
  pts.unshift([-size * 0.08, size * 0.25]);
  pts.reverse();
  const fan = extrudePolygon(pts.map(([x, y]) => [-x, y] as V2), size * 0.08);
  fan.translate(0, 0, size * 0.04);
  b.add(fan, material, at);
}
