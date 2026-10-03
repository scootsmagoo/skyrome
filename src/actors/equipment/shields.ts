/**
 * Shield geometry (cached by model + color + emblem). Conventions:
 *   - origin at the hand grip behind the boss; the handle runs along X;
 *   - +Z is the outward face (toward the enemy), +Y is up.
 * The front face is painted (base color, gilded emblem, bronze binding, iron/bronze boss); the
 * back shows leather-covered plywood so the shield reads right from the bearer's side too (first
 * person sees the back of the shield on the left).
 *
 * Emblems: 'thunderbolt' (Jupiter's winged thunderbolts, the classic legionary scutum),
 * 'scorpion' (associated with the Praetorian Guard), 'wreath' (laurel), 'spirals' (Dacian), 'none'.
 */
import * as THREE from 'three';
import type { ShieldModel } from '../appearance';
import { SURF, type Surf } from '../avatar/SkinBuilder';
import { srgb } from '../avatar/build/common';
import { RigidBuilder, polyArea, type Vec3 } from './geom';

const cache = new Map<string, THREE.BufferGeometry>();

interface Shape {
  /** Half extents. */
  w: number;
  h: number;
  /** Curvature: horizontal wrap radius (0 = flat) and vertical dome amount. */
  wrap: number;
  dome: number;
  /** Outline: 'rect' (rounded corners), 'oval', 'round'. */
  outline: 'rect' | 'oval' | 'round';
  /** Distance of the face in front of the grip. */
  face: number;
  boss: number;
  bronzeFace?: boolean;
}

const SHAPES: Record<Exclude<ShieldModel, 'none'>, Shape> = {
  scutum: { w: 0.33, h: 0.53, wrap: 0.42, dome: 0, outline: 'rect', face: 0.075, boss: 0.085 },
  'scutum-oval': { w: 0.32, h: 0.54, wrap: 0.75, dome: 0.05, outline: 'oval', face: 0.07, boss: 0.08 },
  parma: { w: 0.3, h: 0.3, wrap: 0, dome: 0.06, outline: 'round', face: 0.065, boss: 0.07, bronzeFace: true },
  parmula: { w: 0.27, h: 0.31, wrap: 0.38, dome: 0, outline: 'rect', face: 0.065, boss: 0 },
};

const GOLD = srgb('#d6aa48');
const BRONZE = srgb('#b08d4a');
const IRON = srgb('#8b9096');
const BACK = srgb('#5a4330');
const gildPaint: Surf = { rough: 0.42, metal: 0.55, pattern: 0, emissive: 0 };
/** Matte leather facing on the back (a glossy concave cylinder would catch a long sun streak). */
const BACK_SURF: Surf = { ...SURF.leather, rough: 0.95 };
const metal: Surf = { ...SURF.bronze, rough: 0.3 };

export function shieldGeometry(model: ShieldModel, color = '#8e2a1e', emblem = 'thunderbolt'): THREE.BufferGeometry | null {
  if (model === 'none') return null;
  const key = `${model}|${color}|${emblem}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const sh = SHAPES[model];
  const rb = new RigidBuilder();
  const face = sh.bronzeFace ? BRONZE : srgb(color);
  const faceSurf: Surf = sh.bronzeFace ? metal : { ...SURF.paint, rough: 0.62 };

  // Surface mapping: (u, v) in [-1, 1] → point on the curved face; d = offset along the normal.
  const P = (u: number, v: number, d = 0): Vec3 => {
    const x = u * sh.w;
    const y = v * sh.h;
    let z = sh.face;
    if (sh.wrap > 0) {
      const a = x / sh.wrap;
      const r = sh.wrap + d;
      return [Math.sin(a) * r, y, sh.face - sh.wrap + Math.cos(a) * r - sh.dome * (u * u + v * v) * 0.5];
    }
    z += d - sh.dome * (u * u + v * v);
    return [x, y, z];
  };
  const inside = (u: number, v: number) => {
    if (sh.outline === 'rect') return Math.abs(u) <= 1 && Math.abs(v) <= 1;
    return u * u + v * v <= 1;
  };
  // Outline boundary point for angle a (for oval/round) or rect param.
  const nu = sh.outline === 'rect' ? 14 : 18;
  const nv = sh.outline === 'rect' ? 18 : 18;
  const rows: number[] = [];
  for (let j = 0; j <= nv; j++) rows.push(-1 + (2 * j) / nv);
  const cols: number[] = [];
  for (let i = 0; i <= nu; i++) cols.push(-1 + (2 * i) / nu);
  const map = (u: number, v: number): [number, number] => {
    if (sh.outline === 'rect') {
      // Round the corners a little.
      const k = 0.94;
      return [u * (Math.abs(v) > k ? 1 - (Math.abs(v) - k) * 0.6 : 1), v];
    }
    // Squash the square grid into the disc.
    return [u * Math.sqrt(1 - (v * v) / 2), v * Math.sqrt(1 - (u * u) / 2)];
  };
  const faceColor = (u: number, v: number) => {
    // Subtle painted panel: darker near the rim, lighter in the middle.
    const r = Math.max(Math.abs(u), Math.abs(v));
    return face.clone().multiplyScalar(0.86 + 0.14 * (1 - r * r));
  };
  // Front face.
  const front = rb.b.grid(
    nu + 1,
    nv + 1,
    false,
    (i, j, v) => {
      const [u, w] = map(cols[i], rows[j]);
      const p = P(u, w, 0);
      v.x = p[0];
      v.y = p[1];
      v.z = p[2];
      const c = faceColor(u, w);
      v.r = c.r;
      v.g = c.g;
      v.b = c.b;
      v.s = faceSurf;
      v.w = [0, 1];
    },
    false,
  );
  orientLast(rb, nu, nv, P(0, 0, 0), [0, 0, 1], front, nu + 1);
  // Back face (leather-covered).
  const back = rb.b.grid(
    nu + 1,
    nv + 1,
    false,
    (i, j, v) => {
      const [u, w] = map(cols[i], rows[j]);
      const p = P(u, w, -0.018);
      v.x = p[0];
      v.y = p[1];
      v.z = p[2];
      const c = BACK.clone().multiplyScalar(0.9 + 0.1 * Math.sin(u * 9 + w * 4));
      v.r = c.r;
      v.g = c.g;
      v.b = c.b;
      v.s = BACK_SURF;
      v.w = [0, 1];
    },
    false,
  );
  orientLast(rb, nu, nv, P(0, 0, -0.018), [0, 0, -1], back, nu + 1);
  // Rim (binding) around the outline.
  const rim: [number, number][] = [];
  if (sh.outline === 'rect') {
    for (let i = 0; i <= nu; i++) rim.push(map(cols[i], -1));
    for (let j = 1; j <= nv; j++) rim.push(map(1, rows[j]));
    for (let i = nu - 1; i >= 0; i--) rim.push(map(cols[i], 1));
    for (let j = nv - 1; j >= 1; j--) rim.push(map(-1, rows[j]));
  } else {
    const n = 40;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      rim.push([Math.cos(a), Math.sin(a)]);
    }
  }
  rimBand(rb, rim, P, sh.outline === 'rect' ? IRON.clone().lerp(BRONZE, 0.7) : BRONZE);
  // Boss.
  if (sh.boss > 0) {
    if (model === 'scutum') rb.fan(square(0.095), 0, IRON, metal, 1, (x, y) => P(x / sh.w, y / sh.h, 0.004));
    const c = P(0, 0, 0);
    rb.ellipsoid([c[0], c[1], c[2] + 0.005], [sh.boss, sh.boss, sh.boss * 0.62], model === 'scutum' ? IRON.clone().multiplyScalar(1.05) : BRONZE, metal, 14, 7);
  }
  // Handle behind the boss (visible from the back).
  rb.box([0, 0, sh.face - 0.045], [0.07, 0.012, 0.012], BACK.clone().multiplyScalar(0.7), SURF.leather);
  // Emblem.
  if (!sh.bronzeFace) emblemShapes(emblem, sh).forEach(({ pts, col }) => rb.fan(ccw(pts), 0, col, col === GOLD ? gildPaint : SURF.paint, 1, (x, y) => P(x / sh.w, y / sh.h, 0.0025)));
  else {
    // Concentric raised rings on bronze parmae.
    for (const r of [0.6, 0.85]) ringBand(rb, r, P);
  }
  const g = rb.build(`shield:${key}`);
  cache.set(key, g);
  return g;
}

function ccw(pts: [number, number][]): [number, number][] {
  return polyArea(pts) < 0 ? [...pts].reverse() : pts;
}

function square(h: number): [number, number][] {
  return [
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
  ];
}

/** Make the last grid face the given direction (flip its winding if needed). */
function orientLast(rb: RigidBuilder, nu: number, nv: number, center: Vec3, dir: Vec3, _base: number, _cols: number) {
  // Compute the normal of the first triangle of the grid by building a probe: we know the grid
  // param runs +u along x and +v along y; the default winding (a, d, c) has normal = dv × du... so
  // for a face toward +z we need the flipped winding.
  const towardPlusZ = dir[2] > 0;
  // Default winding produces (+y) × (+x) = -z facing; flip when we want +z.
  if (towardPlusZ) rb.b.flipTail(nu * nv * 2);
  void center;
}

function rimBand(rb: RigidBuilder, outline: [number, number][], P: (u: number, v: number, d?: number) => Vec3, col: THREE.Color) {
  const ids: number[][] = [];
  const s: Surf = { ...SURF.bronze, rough: 0.35 };
  for (const [u, v] of outline) {
    const out = 1.02;
    ids.push([rb.vert(P(u * out, v * out, 0.006), col, s), rb.vert(P(u * out, v * out, -0.024), col, s), rb.vert(P(u * 0.985, v * 0.985, 0.006), col, s)]);
  }
  for (let i = 0; i < ids.length; i++) {
    const a = ids[i];
    const b = ids[(i + 1) % ids.length];
    // Front lip and outer edge, each emitted with both windings (a thin metal band seen from
    // either side; only one winding is front-facing at a time, so there is no z-fighting).
    rb.b.quad(a[2], b[2], b[0], a[0]);
    rb.b.quad(a[2], a[0], b[0], b[2]);
    rb.b.quad(a[0], b[0], b[1], a[1]);
    rb.b.quad(a[0], a[1], b[1], b[0]);
  }
}

function ringBand(rb: RigidBuilder, r: number, P: (u: number, v: number, d?: number) => Vec3) {
  const n = 36;
  const ids: number[][] = [];
  const col = srgb('#c9a35a');
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    ids.push([rb.vert(P(c * (r - 0.03), s * (r - 0.03), 0.003), col, SURF.bronze), rb.vert(P(c * r, s * r, 0.008), col, SURF.bronze), rb.vert(P(c * (r + 0.03), s * (r + 0.03), 0.003), col, SURF.bronze)]);
  }
  for (let i = 0; i < n; i++) {
    const a = ids[i];
    const b = ids[(i + 1) % n];
    rb.b.quad(a[0], b[0], b[1], a[1]);
    rb.b.quad(a[1], b[1], b[2], a[2]);
  }
}

/** Emblem polygons in shield-face meters (x across, y up), centered on the boss. */
function emblemShapes(emblem: string, sh: Shape): { pts: [number, number][]; col: THREE.Color }[] {
  const out: { pts: [number, number][]; col: THREE.Color }[] = [];
  const W = sh.w;
  const H = sh.h;
  const bolt = (x0: number, y0: number, x1: number, y1: number, width: number, zig = 3) => {
    // Zig-zag lightning bolt from (x0,y0) to (x1,y1) as a chain of parallelograms + arrow tip.
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const nx = -dy / len;
    const ny = dx / len;
    const pts: [number, number][] = [];
    for (let i = 0; i <= zig; i++) {
      const t = i / zig;
      const off = (i % 2 ? 1 : -1) * width * 1.2 * (i === 0 || i === zig ? 0 : 1);
      pts.push([x0 + dx * t + nx * off, y0 + dy * t + ny * off]);
    }
    for (let i = 0; i < zig; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      const w0 = width * (1 - i / zig) * 0.9 + width * 0.25;
      const w1 = width * (1 - (i + 1) / zig) * 0.9 + width * 0.25;
      out.push({
        pts: [
          [ax + nx * w0, ay + ny * w0],
          [bx + nx * w1, by + ny * w1],
          [bx - nx * w1, by - ny * w1],
          [ax - nx * w0, ay - ny * w0],
        ],
        col: GOLD,
      });
    }
    // Arrowhead.
    const [tx, ty] = pts[zig];
    const ux = dx / len;
    const uy = dy / len;
    out.push({ pts: [[tx + ux * width * 3, ty + uy * width * 3], [tx + nx * width * 1.6, ty + ny * width * 1.6], [tx - nx * width * 1.6, ty - ny * width * 1.6]], col: GOLD });
  };
  const leaf = (cx: number, cy: number, ang: number, len: number, wid: number, col = GOLD) => {
    const pts: [number, number][] = [];
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const lx = Math.cos(a) * len;
      const ly = Math.sin(a) * wid * (Math.cos(a) > 0 ? 1 : 0.7);
      pts.push([cx + lx * Math.cos(ang) - ly * Math.sin(ang), cy + lx * Math.sin(ang) + ly * Math.cos(ang)]);
    }
    out.push({ pts, col });
  };
  switch (emblem) {
    case 'thunderbolt': {
      // Central bolts up and down, diagonal bolts to the corners, wings spreading from the boss.
      bolt(0, 0.11, 0, H * 0.78, 0.012, 4);
      bolt(0, -0.11, 0, -H * 0.78, 0.012, 4);
      for (const sx of [1, -1])
        for (const sy of [1, -1]) bolt(sx * 0.09, sy * 0.09, sx * W * 0.75, sy * H * 0.72, 0.009, 3);
      for (const sx of [1, -1]) {
        for (let f = 0; f < 5; f++) {
          const ang = (sx > 0 ? 0 : Math.PI) + sx * (0.15 + f * 0.17);
          const len = 0.09 - f * 0.01;
          leaf(sx * (0.12 + len * 0.6 * Math.cos(0.15 + f * 0.17)), 0.02 + len * 0.6 * Math.sin(0.15 + f * 0.17) * 1, ang, len, 0.018);
        }
      }
      // Border frame.
      const fx = W * 0.9;
      const fy = H * 0.93;
      const t = 0.008;
      out.push({ pts: [[-fx, fy], [fx, fy], [fx, fy - t], [-fx, fy - t]], col: GOLD });
      out.push({ pts: [[-fx, -fy + t], [fx, -fy + t], [fx, -fy], [-fx, -fy]], col: GOLD });
      out.push({ pts: [[-fx, -fy], [-fx + t, -fy], [-fx + t, fy], [-fx, fy]], col: GOLD });
      out.push({ pts: [[fx - t, -fy], [fx, -fy], [fx, fy], [fx - t, fy]], col: GOLD });
      break;
    }
    case 'scorpion': {
      // Body segments up the shield, tail curling over, claws reaching down.
      const segs = [[0, 0.14, 0.035], [0, 0.2, 0.03], [0, 0.25, 0.026], [0.015, 0.3, 0.022], [0.04, 0.34, 0.02], [0.07, 0.36, 0.018], [0.1, 0.35, 0.016]];
      for (const [x, y, r] of segs) leaf(x, y, Math.PI / 2, r, r * 0.9);
      leaf(0.12, 0.32, -0.6, 0.03, 0.01);
      leaf(0, -0.14, Math.PI / 2, 0.05, 0.035);
      for (const sx of [1, -1]) {
        leaf(sx * 0.05, -0.22, -Math.PI / 2 + sx * 0.5, 0.06, 0.012);
        leaf(sx * 0.08, -0.3, -Math.PI / 2 - sx * 0.3, 0.03, 0.018);
        for (const k of [0, 1, 2]) leaf(sx * (0.05 + k * 0.01), -0.08 - k * 0.04, sx > 0 ? -0.4 : Math.PI + 0.4, 0.05, 0.006);
      }
      for (const sy of [1, -1]) bolt(-W * 0.6, sy * H * 0.75, W * 0.6, sy * H * 0.75, 0.006, 6);
      break;
    }
    case 'wreath': {
      const R = Math.min(W, H) * 0.62;
      const n = 22;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        leaf(Math.cos(a) * R, Math.sin(a) * R, a + Math.PI / 2 + 0.5, 0.032, 0.012, GOLD);
      }
      break;
    }
    case 'spirals': {
      for (const [cx, cy] of [[0, 0.3], [0, -0.3]] as const) {
        for (let i = 0; i < 26; i++) {
          const a = i * 0.5;
          const r = 0.02 + i * 0.0045;
          leaf(cx + Math.cos(a) * r, cy + Math.sin(a) * r, a + Math.PI / 2, 0.012, 0.006, srgb('#e3d7b8'));
        }
      }
      break;
    }
    default:
      break;
  }
  return out;
}

void (null as unknown as Vec3);
