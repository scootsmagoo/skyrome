/**
 * Columns of the five orders: plinth, base (Attic or Tuscan), shaft with Vitruvian entasis and
 * optional fluting, and capital. Variants: free-standing, engaged (half) column and pilaster.
 *
 * Local frame: origin on the ground at the column axis, y up. Engaged columns and pilasters
 * stand against a wall in the plane z = 0 and project towards −z (the facade side).
 * Geometry is cached per spec and drawn instanced (MeshBuilder.instance): a colonnade of 30
 * columns holds one column's vertices and draws in one call per material.
 */
import * as THREE from 'three';
import type { MeshBuilder } from '../../gfx/MeshBuilder';
import type { MaterialId } from '../../gfx/materialIds';
import { UV_METERS } from '../../gfx/textures/catalog';
import { ProfileBuilder, gridSurface, lathe, linspace, mul, sweep, T, type Profile } from '../common/geom';
import { capitalPieces, type Piece } from './capitals';
import { ORDER_PROPORTIONS, columnDims, entasisRadius, type ColumnDims, type Detail, type Order } from './orders';

export type ColumnKind = 'free' | 'engaged' | 'pilaster';

export interface ColumnSpec {
  order: Order;
  /** Lower shaft diameter (m). */
  D: number;
  /** Total height base + shaft + capital (m). Default: canonical for the order. */
  height?: number;
  fluted?: boolean;
  /** Shaft material (default 'marble'). */
  material?: MaterialId;
  /** Base and capital material (default: same as the shaft). */
  trimMaterial?: MaterialId;
  detail?: Detail;
  kind?: ColumnKind;
  /** Square plinth under the base (default true). */
  plinth?: boolean;
  /** Moulded base (default true; false = Greek Doric straight onto the stylobate). */
  base?: boolean;
  /** Add colliders (default: true for free columns, false otherwise). */
  collide?: boolean;
}

export interface ColumnResult {
  dims: ColumnDims;
  /** Height of the capital top (= dims.height). */
  top: number;
}

const HALF_T0 = Math.PI / 2 - 0.25;
const HALF_T1 = Math.PI * 1.5 + 0.25;

// ---------------------------------------------------------------- bases

/** Attic base profile above the plinth: torus, scotia between fillets, torus, apophyge into the shaft. */
function atticBaseProfile(D: number, y0: number, detail: Detail): Profile {
  if (detail === 'low') {
    return new ProfileBuilder(0.6 * D, y0).torus(0.11 * D, 0.08 * D, 2).in(0.04 * D).up(0.13 * D).torus(0.075 * D, 0.06 * D, 2).to(0.5 * D, y0 + 0.341 * D).build();
  }
  const n = 5;
  const p = new ProfileBuilder(0.6 * D, y0)
    .torus(0.11 * D, 0.09 * D, n)
    .in(0.025 * D)
    .up(0.018 * D)
    .scotia(0.06 * D, 0.045 * D, n)
    .up(0.018 * D)
    .in(0.025 * D)
    .torus(0.075 * D, 0.07 * D, n)
    .in(0.025 * D)
    .up(0.02 * D)
    .to(0.5 * D, y0 + 0.341 * D);
  return p.build();
}

function tuscanBaseProfile(D: number, y0: number, detail: Detail): Profile {
  const n = detail === 'high' ? 6 : 2;
  return new ProfileBuilder(0.6 * D, y0).torus(0.2 * D, 0.1 * D, n).in(0.07 * D).up(0.03 * D).to(0.5 * D, y0 + 0.25 * D).build();
}

// ---------------------------------------------------------------- shaft

interface ShaftOptions {
  D: number;
  topRatio: number;
  y0: number;
  y1: number;
  flutes: number;
  fluted: boolean;
  detail: Detail;
  half: boolean;
  /** Doric flutes meet in sharp arrises; Ionic/Corinthian have fillets between them. */
  arris: boolean;
}

/** Angular samples for a fluted shaft: fillet edges land exactly on samples. */
function fluteAngles(n: number, filletFrac: number, perGroove: number, t0: number, t1: number): number[] {
  const P = (Math.PI * 2) / n;
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const base = k * P;
    out.push(base);
    const g0 = (filletFrac / 2) * P;
    const g1 = (1 - filletFrac / 2) * P;
    for (let i = 0; i <= perGroove; i++) out.push(base + g0 + ((g1 - g0) * i) / perGroove);
  }
  out.push(Math.PI * 2);
  const uniq = [...new Set(out.map((a) => +a.toFixed(9)))].sort((a, b) => a - b);
  if (t0 === 0 && t1 === Math.PI * 2) return uniq;
  return [t0, ...uniq.filter((a) => a > t0 && a < t1), t1];
}

function shaftGeometry(o: ShaftOptions): THREE.BufferGeometry {
  const { D, y0, y1 } = o;
  const L = y1 - y0;
  const hi = o.detail === 'high';
  const t0 = o.half ? HALF_T0 : 0;
  const t1 = o.half ? HALF_T1 : Math.PI * 2;
  const fluted = o.fluted && o.flutes > 0 && hi;
  const fillet = o.arris ? 0 : 0.24;
  const angles = fluted ? fluteAngles(o.flutes, fillet, 3, t0, t1) : linspace(t0, t1, hi ? (o.half ? 14 : 28) : o.half ? 6 : 12);
  const fade = Math.min(0.2, (0.35 * D) / L);
  const rows = fluted
    ? [0, fade * 0.5, fade, 1 / 3, 0.56, 0.78, 1 - fade, 1 - fade * 0.5, 1]
    : hi
      ? [0, 1 / 3, 0.56, 0.78, 1]
      : [0, 0.5, 1];
  const P = (Math.PI * 2) / o.flutes;
  const grooveW = (1 - fillet) * P;
  const depth0 = (o.arris ? 0.22 : 0.42) * grooveW * (D / 2); // radial depth at the bottom
  const groove = (a: number) => {
    let s = a / P;
    s -= Math.floor(s);
    const g = (s - fillet / 2) / (1 - fillet);
    if (g <= 0 || g >= 1) return 0;
    return Math.sqrt(Math.max(0, 1 - (2 * g - 1) ** 2));
  };
  const flutesFade = (t: number) => {
    const a = Math.min(1, t / fade);
    const b = Math.min(1, (1 - t) / fade);
    return Math.sqrt(Math.max(0, 1 - (1 - a) ** 2)) * Math.sqrt(Math.max(0, 1 - (1 - b) ** 2));
  };
  const R = (a: number, t: number) => {
    const r = entasisRadius(D, o.topRatio, t);
    return fluted ? r - depth0 * (r / (D / 2)) * groove(a) * flutesFade(t) : r;
  };
  return gridSurface(
    angles,
    rows,
    (a, t, out) => {
      const r = R(a, t);
      return out.set(r * Math.sin(a), y0 + t * L, r * Math.cos(a));
    },
    { uv: (a, t) => [(a * D * 0.5) / UV_METERS, (y0 + t * L) / UV_METERS] },
  );
}

/** Astragal, fillet and apophyge at the top of the shaft (y1 = capital bottom). */
function shaftTopProfile(d: number, D: number, y1: number, detail: Detail): Profile {
  const n = detail === 'high' ? 4 : 1;
  const r1 = d / 2;
  return new ProfileBuilder(r1, y1 - 0.115 * D)
    .cavetto(0.02 * D, 0.035 * D, n)
    .up(0.012 * D)
    .torus(0.06 * D, 0.032 * D, n)
    .to(r1 * 0.98, y1 + 0.002 * D)
    .build();
}

// ---------------------------------------------------------------- assembly + cache

interface ColumnParts {
  shaft: Piece[];
  trim: Piece[];
  dims: ColumnDims;
}

const cache = new Map<string, ColumnParts>();

function buildParts(spec: Required<Pick<ColumnSpec, 'order' | 'D' | 'detail' | 'kind' | 'plinth' | 'base' | 'fluted'>> & { height?: number }): ColumnParts {
  const { order, D, detail, kind } = spec;
  const p = ORDER_PROPORTIONS[order];
  const dims = columnDims(order, D, spec.height);
  const half = kind === 'engaged';
  const shaft: Piece[] = [];
  const trim: Piece[] = [];
  const range = half ? { theta0: HALF_T0, theta1: HALF_T1 } : {};
  const segs = detail === 'high' ? 24 : 10;
  const y0 = dims.base;
  const y1 = dims.height - dims.capital;

  if (kind === 'pilaster') return buildPilaster(spec, dims);

  // Plinth and base.
  const plinthH = order === 'tuscan' ? 0.25 * D : D / 6;
  if (spec.base) {
    if (spec.plinth) {
      const w = dims.plinth;
      if (order === 'tuscan') {
        const g = lathe(new ProfileBuilder(w / 2, 0).up(plinthH).in(w / 2).build(), { segments: segs, ...range, capBottom: false });
        trim.push({ geometry: g, uv: 'box' });
      } else {
        const g = new THREE.BoxGeometry(w, plinthH, half ? w / 2 + 0.02 * D : w);
        g.translate(0, plinthH / 2, half ? -(w / 2 + 0.02 * D) / 2 + 0.02 * D : 0);
        trim.push({ geometry: g, uv: 'box' });
      }
    }
    const baseY = spec.plinth ? plinthH : 0;
    const prof = order === 'tuscan' ? tuscanBaseProfile(D, baseY, detail) : atticBaseProfile(D, baseY, detail);
    trim.push({ geometry: lathe(prof, { segments: segs, ...range }), uv: 'box' });
  }
  // Shaft, overlapping the base and astragal slightly so no seam can open.
  const sy0 = spec.base ? y0 - 0.01 * D : 0;
  const sy1 = y1 - 0.1 * D;
  shaft.push({
    geometry: shaftGeometry({ D, topRatio: p.topRatio, y0: sy0, y1: sy1, flutes: p.flutes, fluted: spec.fluted, detail, half, arris: order === 'doric' }),
    uv: 'keep',
  });
  // The shaft geometry runs entasis over sy0..sy1; the top lathe picks up at the upper radius.
  const topProf = shaftTopProfile(dims.d * (entasisRadius(D, p.topRatio, 1) / (dims.d / 2)), D, y1, detail);
  shaft.push({ geometry: lathe(topProf, { segments: segs, ...range }), uv: 'box' });
  // Capital.
  for (const piece of capitalPieces(order, { D, d: dims.d, height: dims.capital, detail, half })) {
    piece.geometry.translate(0, y1, 0);
    trim.push(piece);
  }
  return { shaft, trim, dims };
}

/** Pilaster: a flat pier projecting D/6 from the wall, with swept base and a flattened capital. */
function buildPilaster(spec: { order: Order; D: number; detail: Detail; plinth: boolean; base: boolean }, dims: ColumnDims): ColumnParts {
  const { order, D, detail } = spec;
  const proj = D / 6;
  const w = D;
  const shaft: Piece[] = [];
  const trim: Piece[] = [];
  const y0 = dims.base;
  const y1 = dims.height - dims.capital;
  // U-shaped path around the pilaster face (wall at z = 0, face at z = −proj).
  const uPath = (hw: number, depth: number) => [new THREE.Vector3(-hw, 0, 0), new THREE.Vector3(-hw, 0, -depth), new THREE.Vector3(hw, 0, -depth), new THREE.Vector3(hw, 0, 0)];
  if (spec.base) {
    const plinthH = D / 6;
    const pl = new THREE.BoxGeometry(w * 1.3, plinthH, proj + 0.2 * D);
    pl.translate(0, plinthH / 2, -(proj + 0.2 * D) / 2);
    trim.push({ geometry: pl, uv: 'box' });
    // Base mouldings swept around the face: offsets relative to the shaft face.
    const prof = atticBaseProfile(D, plinthH, detail);
    const rel: Profile = { pts: prof.pts.map(([x, y]) => [x - 0.5 * D, y] as [number, number]), smooth: prof.smooth };
    const g = sweep(rel, uPath(w / 2, proj).map((v) => v.clone()), { caps: true });
    trim.push({ geometry: g, uv: 'box' });
  }
  const sh = new THREE.BoxGeometry(w, y1 - y0 + 0.02, proj);
  sh.translate(0, (y0 + y1) / 2, -proj / 2);
  shaft.push({ geometry: sh, uv: 'box' });
  // Capital: a swept bell/echinus profile plus, for Corinthian types, two rows of leaf lobes.
  const C = dims.capital;
  const hi = detail === 'high';
  if (order === 'corinthian' || order === 'composite') {
    const bellH = C * (6 / 7);
    const bell = new ProfileBuilder(0, 0).to(0.06 * D, bellH * 0.9).out(0.02 * D).up(0.1 * bellH).in(0.08 * D).build();
    trim.push({ geometry: sweep(bell, uPath(w / 2, proj).map((v) => v.add(new THREE.Vector3(0, y1, 0))), { caps: true }), uv: 'box' });
    // Leaves on the face: 3 per row, flat-backed lobes curling out at the top.
    const rows = [
      { h: bellH * 0.42, n: 3, off: 0.5, curl: 0.12 * D },
      { h: bellH * 0.72, n: 2, off: 0, curl: 0.14 * D },
    ];
    for (const row of rows) {
      const lw = w / row.n;
      for (let i = 0; i < row.n; i++) {
        const cx = -w / 2 + lw * (i + 0.5 - row.off * 0) + (row.off ? 0 : 0);
        const xs = linspace(-0.5, 0.5, hi ? 6 : 2);
        const ts = hi ? [0, 0.3, 0.55, 0.7, 0.82, 0.92, 1] : [0, 0.6, 1];
        const leaf = gridSurface(xs, ts, (s, t, out) => {
          const len = row.h * (0.55 + 0.45 * (1 - 4 * s * s) ** 0.7);
          const tc = 0.6;
          let y = len * t;
          let z = -proj - 0.015 * D - (t > tc ? row.curl * ((t - tc) / (1 - tc)) ** 1.5 : 0);
          if (t > tc) y = len * tc + (len * (1 - tc) * Math.sin(((t - tc) / (1 - tc)) * 1.8)) / 1.8;
          z += 0.3 * row.curl * 4 * s * s * t;
          return out.set(cx + s * lw * 0.95, y1 + y, z);
        });
        trim.push({ geometry: leaf, uv: 'box' });
      }
    }
    const ab = new THREE.BoxGeometry(w * 1.25, C / 7, proj + 0.25 * D);
    ab.translate(0, y1 + bellH + C / 14, -(proj + 0.25 * D) / 2);
    trim.push({ geometry: ab, uv: 'box' });
  } else {
    const n = hi ? 6 : 2;
    const prof =
      order === 'ionic'
        ? new ProfileBuilder(0, 0).ovolo(0.08 * D, 0.2 * D, n).up(0.09 * D).out(0.04 * D).up(0.07 * D).in(0.12 * D).build()
        : new ProfileBuilder(0, 0).up(0.16 * D).out(0.03 * D).up(0.03 * D).ovolo(0.09 * D, 0.11 * D, n).out(0.02 * D).up(C - 0.3 * D).in(0.14 * D).build();
    trim.push({ geometry: sweep(prof, uPath(w / 2, proj).map((v) => v.add(new THREE.Vector3(0, y1, 0))), { caps: true }), uv: 'box' });
    if (order === 'ionic') {
      for (const sx of [-1, 1]) {
        const disc = new THREE.CylinderGeometry(0.2 * D, 0.2 * D, 0.06 * D, hi ? 16 : 8);
        disc.rotateX(Math.PI / 2);
        disc.translate(sx * 0.48 * D, y1 + 0.12 * D, -proj - 0.05 * D);
        trim.push({ geometry: disc, uv: 'box' });
      }
    }
  }
  return { shaft, trim, dims };
}

/** Build a column into `b` at transform `at` (origin = ground at the axis). */
export function column(b: MeshBuilder, spec: ColumnSpec, at?: THREE.Matrix4): ColumnResult {
  const detail = spec.detail ?? 'high';
  const kind = spec.kind ?? 'free';
  const fluted = spec.fluted ?? false;
  const base = spec.base ?? true;
  const plinth = spec.plinth ?? true;
  const key = [spec.order, spec.D.toFixed(3), (spec.height ?? 0).toFixed(3), detail, kind, fluted, base, plinth].join('|');
  let parts = cache.get(key);
  if (!parts) {
    parts = buildParts({ order: spec.order, D: spec.D, height: spec.height, detail, kind, fluted, base, plinth });
    cache.set(key, parts);
  }
  const mat = spec.material ?? 'marble';
  const trim = spec.trimMaterial ?? mat;
  const m = at ?? new THREE.Matrix4();
  // Instanced: one geometry per column spec and material for the whole program, however many
  // columns stand in however many buildings.
  const p0 = parts;
  b.instance(`column|${key}|${mat}|${trim}`, () => [...p0.shaft.map((p) => ({ geometry: p.geometry, material: mat, uv: p.uv })), ...p0.trim.map((p) => ({ geometry: p.geometry, material: trim, uv: p.uv }))], m);
  if (spec.collide ?? kind === 'free') {
    const { dims } = parts;
    const c = new THREE.Vector3(0, dims.height / 2, 0).applyMatrix4(m);
    b.collider({ kind: 'cylinder', center: c, halfHeight: dims.height / 2, radius: dims.D * 0.52 });
    if (base && plinth) {
      const ph = spec.order === 'tuscan' ? 0.25 * spec.D : spec.D / 6;
      const pc = mul(m, T(0, ph / 2, 0));
      const pos = new THREE.Vector3();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3();
      pc.decompose(pos, q, s);
      b.collider({ kind: 'box', center: pos, half: new THREE.Vector3(parts.dims.plinth / 2, ph / 2, parts.dims.plinth / 2), rotation: q });
    }
  }
  return { dims: parts.dims, top: parts.dims.height };
}

/** Clear cached column geometry (e.g. between dev-scene rebuilds). */
export function clearColumnCache() {
  cache.clear();
}
