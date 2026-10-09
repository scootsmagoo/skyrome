/**
 * Hair for the realistic heads: a thin scalp cap that thins out at the hairline (stipple fade region of the
 * hair texture), then cards, tubes and curls on top, per HairStyle. Everything is placed through the measured
 * HeadSurface (frame.ts), so it follows the skull of every body, and is skinned to the head bone (a tail
 * blends into the neck and chest). Deterministic per appearance (seeded by the caller).
 *
 * Detail by LOD (ctx.lod): 0 = full, 1 = about half the cards, 2 = the cap and a few cards.
 */
import * as THREE from 'three';
import type { HairStyle } from '../../../appearance';
import { Rng } from '../../../../core/Rng';
import { B } from '../../rig';
import type { HeadSurface } from './frame';
import { HairBuilder, type WeightsFn } from './cards';
import { HAIR_UV } from './hairTexture';

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export interface HairInput {
  H: HeadSurface;
  style: HairStyle;
  color: THREE.Color;
  rng: Rng;
  lod: 0 | 1 | 2;
  /** Under an open helmet only a short cap shows below the rim. */
  helmet: boolean;
  age: 'child' | 'young' | 'adult' | 'middle' | 'old';
}

/** Hairline height fraction around the head: a = angle from the front, 0 ... pi (the back). */
export function hairlineYf(style: HairStyle, a: number, H: HeadSurface): number {
  const earTop = (H.earTop - H.chin) / H.H;
  let front = 0.77;
  let temple = 0.73;
  let nape = 0.3;
  let aboveEar = earTop + 0.045;
  switch (style) {
    case 'cropped':
      front = 0.755;
      temple = 0.71;
      nape = 0.34;
      break;
    case 'receding':
      front = 0.9;
      temple = 0.85;
      nape = 0.36;
      aboveEar = earTop + 0.06;
      break;
    case 'curly-short':
      front = 0.77;
      temple = 0.72;
      nape = 0.34;
      break;
    case 'long-tied':
      front = 0.79;
      temple = 0.72;
      nape = 0.26;
      break;
    case 'bun':
    case 'braided-crown':
    case 'trajanic-tower':
      front = 0.8;
      temple = 0.71;
      nape = 0.4;
      break;
    case 'veiled':
    case 'vestal':
      front = 0.79;
      temple = 0.72;
      nape = 0.5;
      break;
    default:
      break;
  }
  const d = (a * 180) / Math.PI;
  const sideA = Math.max(aboveEar, temple - 0.02);
  if (d < 38) return lerp(front, temple, smooth(0, 38, d));
  if (d < 85) return lerp(temple, sideA, smooth(38, 85, d));
  if (d < 112) return sideA;
  // Behind the ear the hair drops to the nape.
  return lerp(sideA, nape, smooth(112, 150, d));
}

export function buildHair(inp: HairInput): { geometry: THREE.BufferGeometry; triangles: number } | null {
  const { H, style, rng, lod } = inp;
  if (style === 'bald') return null;
  const hs = H.hs;
  const b = new HairBuilder();
  const base = inp.color.clone().multiplyScalar(1.25);
  const lodK = lod === 0 ? 1 : lod === 1 ? 0.5 : 0.2;
  const M = lod === 0 ? 6 : lod === 1 ? 4 : 3;
  const helmet = inp.helmet;
  // Under a veil the hair stays flat: the cloth sits only ~11 mm off the scalp and sags between its rows.
  const veilMode = style === 'veiled' || style === 'vestal';
  const effStyle: HairStyle = helmet ? 'cropped' : style;

  const jitter = (k = 0.12) => base.clone().multiplyScalar(1 + (rng.next() * 2 - 1) * k);
  const hl = (th: number) => {
    const a = Math.abs(Math.atan2(Math.sin(th), Math.cos(th)));
    return hairlineYf(effStyle, a, H) + 0.006 * Math.sin(th * 37 + 1.3);
  };
  const P = (yf: number, th: number, off: number) => {
    const p = H.at(yf, th);
    if (off !== 0) p.addScaledVector(H.normalAt(yf, th), off);
    return p;
  };
  const capT = ({ cropped: 0.0055, 'curly-short': 0.009, receding: 0.004, 'long-tied': 0.006, bun: 0.005, 'braided-crown': 0.005, 'trajanic-tower': 0.006, veiled: 0.0035, vestal: 0.0035, bald: 0 } as Record<HairStyle, number>)[effStyle] * hs * (helmet ? 0.5 : 1);

  // ---------------------------------------------------------------- scalp cap
  {
    const NC = lod === 0 ? 56 : lod === 1 ? 36 : 24;
    // Rows packed into the stippled band above the hairline, so the ramp is not smeared over one big row.
    const bandD = lod === 0 ? [0, 0.004, 0.01, 0.019, 0.03, 0.04] : [0, 0.007, 0.02, 0.04];
    const nb = bandD.length;
    const R = nb + (lod === 0 ? 4 : lod === 1 ? 3 : 2);
    const base0 = b.vertexCount;
    const c = new THREE.Color();
    for (let j = 0; j < R; j++)
      for (let i = 0; i < NC; i++) {
        const th = (i / NC) * Math.PI * 2;
        const h0 = hl(th);
        const s = j / (R - 1);
        const yTop0 = h0 + (bandD[nb - 1] * hs) / H.H;
        const yf = j < nb ? h0 + (bandD[j] * hs) / H.H : lerp(yTop0, 0.99, Math.pow((j - nb + 1) / (R - nb), 1.2));
        const dH = (yf - h0) * H.H;
        const off = capT * (0.3 + 0.7 * smooth(0, 0.016, dH)) * (1 + 0.1 * Math.sin(th * 11 + yf * 30));
        const p = P(yf, th, off);
        const n = H.normalAt(yf, th);
        // Stipple density by distance above the hairline: solid by about 22 mm.
        const fade = 1 - smooth(0.0, 0.04 * hs, dH);
        // Mirrored across the face so u is continuous (no seam, no smearing between columns).
        const u = lerp(HAIR_UV.fade[0], HAIR_UV.fade[1], Math.abs((i / NC) * 2 - 1));
        c.copy(base).multiplyScalar((0.6 + 0.22 * (0.5 + 0.5 * Math.sin(th * 19 + yf * 41)) + 0.06 * s) * (1 + 0.45 * fade));
        const tan = H.at(yf - 0.02, th).sub(H.at(yf + 0.02, th)).normalize();
        b.vertex({ p, n, u, v: fade, c, t: tan });
      }
    for (let j = 0; j < R - 1; j++)
      for (let i = 0; i < NC; i++) {
        const a = base0 + j * NC + i;
        const bb = base0 + j * NC + ((i + 1) % NC);
        const cc = base0 + (j + 1) * NC + ((i + 1) % NC);
        const d = base0 + (j + 1) * NC + i;
        b.tri(a, bb, cc);
        b.tri(a, cc, d);
      }
    // Crown fan.
    const top = P(1, 0, capT);
    const ti = b.vertex({ p: top, n: new THREE.Vector3(0, 1, 0), u: HAIR_UV.fade[0] + 0.1, v: 0, c: base.clone().multiplyScalar(0.9), t: new THREE.Vector3(0, -1, 0) });
    for (let i = 0; i < NC; i++) b.tri(ti, base0 + (R - 1) * NC + ((i + 1) % NC), base0 + (R - 1) * NC + i);
  }

  // ---------------------------------------------------------------- card helpers
  type Route = (t: number) => { yf: number; th: number; off: number };
  const card = (route: Route, width: number, color: THREE.Color, opts: { points?: number; weights?: WeightsFn; lift?: number } = {}) => {
    const n = opts.points ?? M;
    const path: THREE.Vector3[] = [];
    const nrm: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const r = route(t);
      path.push(P(r.yf, r.th, r.off));
      nrm.push(H.normalAt(r.yf, r.th));
    }
    b.ribbon(path, (t) => width * (1 - 0.25 * t * t), (_t, i) => nrm[i], color, { weights: opts.weights, lift: opts.lift });
  };
  const count = (n: number) => Math.max(lod === 2 ? 6 : 10, Math.round(n * lodK));

  /** Hair lying down the head from (yf0, th0) to the hairline (plus `over`), straight down the meridian. */
  const meridianCards = (n: number, o: { yf0: [number, number]; thA: number; thB: number; width: number; over: number; swirl?: number; lift?: number }) => {
    for (let i = 0; i < count(n); i++) {
      const th0 = lerp(o.thA, o.thB, (i + rng.next() * 0.6) / count(n));
      const yfR = rng.range(o.yf0[0], o.yf0[1]);
      const yfE = Math.max(0.1, hl(th0) - o.over * (0.5 + rng.next()));
      const sw = (o.swirl ?? 0) * (rng.next() - 0.5);
      const w = o.width * rng.range(0.85, 1.25);
      const lift = o.lift ?? 0;
      card((t) => ({ yf: lerp(yfR, yfE, t), th: th0 + sw * t, off: capT * 0.8 + (0.0035 + 0.006 * lift) * hs * Math.sin(Math.min(1, t * 1.4) * Math.PI * 0.9) + 0.0015 * hs * t }), w, jitter());
    }
  };

  /** Short overlapping locks like shingles: they raise the hairline into a ragged edge and give the cap its volume. */
  const shingles = (n: number, o: { above: [number, number]; width: number; len: number; lift: number; thA?: number; thB?: number; skipFront?: number }) => {
    for (let i = 0; i < count(n); i++) {
      const th = lerp(o.thA ?? 0, o.thB ?? Math.PI * 2, (i + rng.next() * 0.9) / count(n));
      const a = Math.abs(Math.atan2(Math.sin(th), Math.cos(th)));
      if (o.skipFront && a < o.skipFront) continue;
      const yf0 = Math.min(0.97, hl(th) + rng.range(o.above[0], o.above[1]));
      const lenYf = (o.len * hs * rng.range(0.8, 1.3)) / H.H;
      const sw = rng.range(-0.08, 0.08);
      card((t) => ({ yf: yf0 - t * lenYf, th: th + sw * t, off: capT * 0.9 + 0.0012 * hs + o.lift * hs * t }), o.width * hs * rng.range(0.85, 1.25), jitter(0.18), { points: Math.min(M, 4) });
    }
  };

  // Curl: a ringlet, a ribbon wound on a short helix standing out of the scalp.
  const curl = (yf: number, th: number, size: number, color: THREE.Color, turns = 1.5) => {
    const p0 = P(yf, th, capT * 0.5);
    const nrm = H.normalAt(yf, th);
    const tanA = H.at(yf, th + 0.05).sub(H.at(yf, th - 0.05)).normalize();
    const tanB = new THREE.Vector3().crossVectors(nrm, tanA).normalize();
    const path: THREE.Vector3[] = [];
    const radial: THREE.Vector3[] = [];
    const steps = lod === 0 ? 11 : 7;
    const phase = rng.next() * 6.28;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const a = phase + t * turns * Math.PI * 2;
      const r = size * (0.62 + 0.38 * Math.sin(t * Math.PI * 0.9 + 0.3));
      const dir = tanA.clone().multiplyScalar(Math.cos(a)).addScaledVector(tanB, Math.sin(a));
      path.push(p0.clone().addScaledVector(nrm, size * (0.2 + 1.5 * t)).addScaledVector(dir, r));
      radial.push(dir.addScaledVector(nrm, 0.35).normalize());
    }
    b.ribbon(path, (t) => size * 1.05 * (1 - 0.55 * t), (_t, i) => radial[i], color, { lift: 0.3, shade: (t) => 0.7 + 0.45 * t });
  };

  /** Smoothed-back hair: from the front hairline over the sides to a gathering point at the back. */
  const flowCards = (n: number, o: { target: { yf: number; th: number }; width: number; sides?: boolean }) => {
    for (let i = 0; i < count(n); i++) {
      const u = (i + rng.next() * 0.7) / count(n);
      // Roots across the whole hairline, front centre (parted) to the back.
      const th0sign = u < 0.5 ? 1 : -1;
      const aRoot = lerp(0.06, o.sides === false ? 1.9 : 2.5, Math.abs(u * 2 - (u < 0.5 ? 0 : 1)));
      const th0 = th0sign * aRoot;
      // Roots a little above the hairline, scattered, so its edge is soft.
      const yf0 = Math.min(0.97, hl(th0) + rng.range(0.05, 0.17));
      const tth = th0sign * Math.PI + (th0sign > 0 ? -1 : 1) * rng.range(0, 0.18);
      card(
        (t) => {
          const s = smooth(0, 1, Math.pow(t, 0.85));
          const yf = lerp(yf0, o.target.yf, Math.pow(t, 1.25)) + 0.015 * Math.sin(t * Math.PI);
          return { yf, th: lerp(th0, tth, s), off: capT * 0.8 + (veilMode ? 0.0008 : 0.004) * hs * Math.sin(t * Math.PI) };
        },
        o.width * rng.range(0.85, 1.2),
        jitter(),
      );
    }
  };

  // ---------------------------------------------------------------- the styles
  switch (effStyle) {
    case 'cropped': {
      // Trajanic comb-forward: locks from the crown fall to the forehead (fringe), the sides and the nape.
      meridianCards(46, { yf0: [0.86, 0.995], thA: 0, thB: Math.PI * 2, width: 0.026 * hs, over: 0.012, swirl: 0.25, lift: 0.3 });
      shingles(96, { above: [0.0, 0.18], width: 0.016, len: 0.03, lift: 0.0055, skipFront: 0.5 });
      if (!helmet) {
        for (let i = 0; i < count(18); i++) {
          const th0 = lerp(-0.95, 0.95, (i + rng.next() * 0.5) / count(18));
          const yfR = rng.range(0.9, 0.97);
          const yfE = hl(th0) - 0.035 * rng.range(0.4, 1.2);
          const sw = rng.range(-0.15, 0.15);
          card((t) => ({ yf: lerp(yfR, yfE, t), th: th0 + sw * t, off: capT * 0.7 + 0.011 * hs * Math.sin(t * Math.PI * 0.8) * (1 - 0.3 * Math.abs(th0)) }), 0.024 * hs * rng.range(0.9, 1.2), jitter(0.15));
        }
      }
      break;
    }
    case 'receding': {
      meridianCards(26, { yf0: [0.84, 0.99], thA: 0.7, thB: Math.PI * 2 - 0.7, width: 0.026 * hs, over: 0.012, swirl: 0.2 });
      shingles(60, { above: [0.0, 0.14], width: 0.015, len: 0.03, lift: 0.005, thA: 0.8, thB: Math.PI * 2 - 0.8 });
      break;
    }
    case 'curly-short': {
      meridianCards(16, { yf0: [0.85, 0.99], thA: 0, thB: Math.PI * 2, width: 0.024 * hs, over: 0.01, swirl: 0.2 });
      shingles(40, { above: [0.0, 0.1], width: 0.014, len: 0.022, lift: 0.004 });
      const n = count(86);
      for (let i = 0; i < n; i++) {
        const th = rng.range(0, Math.PI * 2);
        const a = Math.abs(Math.atan2(Math.sin(th), Math.cos(th)));
        const y0 = hl(th) + 0.012;
        const yf = lerp(y0, 0.985, Math.pow(rng.next(), 0.8));
        if (a < 0.9 && yf < y0 + 0.03) continue;
        curl(yf, th, 0.0072 * hs * rng.range(0.85, 1.3), jitter(0.2));
      }
      break;
    }
    case 'long-tied': {
      // Hair drawn back into a tail at the nape.
      const tie = { yf: 0.34, th: Math.PI };
      flowCards(48, { target: tie, width: 0.03 * hs, sides: true });
      shingles(40, { above: [0.0, 0.1], width: 0.014, len: 0.026, lift: 0.0035, skipFront: 0.5, thA: 0.8, thB: Math.PI * 2 - 0.8 });
      const top = P(tie.yf, tie.th, 0.012 * hs);
      const len = 0.27 * hs;
      const tailW: WeightsFn = (t) => {
        const s = smooth(0.12, 0.85, t);
        return [B.head, 1 - s, B.neck, s * 0.6, B.chest, s * 0.4, 0, 0];
      };
      const nT = count(12);
      for (let i = 0; i < nT; i++) {
        const spread = (i / (nT - 1) - 0.5) * 0.045 * hs * 2;
        const sway = rng.range(-0.01, 0.01) * hs;
        const L = len * rng.range(0.82, 1.05);
        const path: THREE.Vector3[] = [];
        for (let k = 0; k < 7; k++) {
          const t = k / 6;
          path.push(new THREE.Vector3(top.x + spread * (0.6 + t * 0.7) + sway * Math.sin(t * 3), top.y - t * L + 0.008 * hs, top.z - 0.012 * hs - Math.sin(t * Math.PI) * 0.016 * hs - t * 0.03 * hs));
        }
        const nrm = new THREE.Vector3(0, 0, -1);
        b.ribbon(path, (t) => 0.026 * hs * (1 - 0.35 * t), () => nrm, jitter(0.15), { weights: tailW, lift: 0.2 });
      }
      // Core of the tail and the band that ties it.
      const core: THREE.Vector3[] = [];
      for (let k = 0; k < 8; k++) {
        const t = k / 7;
        core.push(new THREE.Vector3(top.x, top.y - t * len * 0.92, top.z - 0.012 * hs - Math.sin(t * Math.PI) * 0.014 * hs - t * 0.028 * hs));
      }
      b.tube(core, (t) => 0.015 * hs * (1 - 0.55 * t), 6, jitter(0.1).multiplyScalar(0.85), { weights: tailW, region: HAIR_UV.plait, vRepeat: 2 });
      const band: THREE.Vector3[] = [];
      for (let k = 0; k < 10; k++) {
        const a = (k / 9) * Math.PI * 2;
        band.push(new THREE.Vector3(top.x + Math.cos(a) * 0.017 * hs, top.y - 0.016 * hs, top.z - 0.012 * hs + Math.sin(a) * 0.017 * hs));
      }
      b.tube(band, () => 0.0042 * hs, 4, new THREE.Color(0x2c1c10), { region: HAIR_UV.plait });
      break;
    }
    case 'bun': {
      const tie = { yf: 0.44, th: Math.PI };
      flowCards(42, { target: tie, width: 0.028 * hs });
      coil(b, P(tie.yf, tie.th, 0.008 * hs), new THREE.Vector3(0, 0.15, -1).normalize(), new THREE.Vector3(0, 1, 0), 0.03 * hs, 2.4, 0.0125 * hs, base.clone().multiplyScalar(0.95), lod, 0, 6, 3.4);
      break;
    }
    case 'braided-crown': {
      // Parted in the middle, smoothed down to a plaited ring around the crown.
      const ringY = (th: number) => 0.8 + 0.015 * Math.cos(th);
      for (let i = 0; i < count(46); i++) {
        const th0 = (i + rng.next() * 0.6) * ((Math.PI * 2) / count(46));
        const yf0 = 0.985 + rng.range(-0.02, 0);
        const yf1 = Math.max(0.2, hl(th0) - 0.01);
        card((t) => ({ yf: lerp(yf0, yf1, t), th: th0 + 0.15 * Math.sin(th0) * t, off: capT * 0.8 + 0.003 * hs * Math.sin(t * Math.PI) }), 0.026 * hs * rng.range(0.9, 1.2), jitter());
      }
      for (let ring = 0; ring < 2; ring++) {
        const path: THREE.Vector3[] = [];
        const np = lod === 0 ? 48 : 28;
        for (let k = 0; k <= np; k++) {
          const th = (k / np) * Math.PI * 2;
          path.push(P(ringY(th) + ring * 0.04 - 0.01, th, (0.0058 + ring * 0.0025) * hs));
        }
        b.tube(path, () => 0.0066 * hs, lod === 0 ? 6 : 4, jitter(0.08).multiplyScalar(1.15), { region: HAIR_UV.plait, vRepeat: 18, shade: (t, a) => 0.75 + 0.35 * Math.sin(a + t * 40) });
      }
      break;
    }
    case 'trajanic-tower': {
      // Elaborate Flavian-Trajanic coiffure: hair swept back into a coil, and a tiered diadem of
      // coiled curls (orbis comarum) from temple to temple over the forehead.
      const tie = { yf: 0.7, th: Math.PI };
      flowCards(34, { target: tie, width: 0.027 * hs });
      coil(b, P(tie.yf, tie.th, 0.008 * hs), new THREE.Vector3(0, 0.3, -1).normalize(), new THREE.Vector3(0, 1, 0), 0.034 * hs, 2.6, 0.0125 * hs, base.clone().multiplyScalar(0.95), lod, 0, 6, 3.4);
      const rows = lod === 2 ? 1 : 3;
      for (let r = 0; r < rows; r++) {
        const nr = (lod === 0 ? 9 : 7) - r;
        for (let i = 0; i < nr; i++) {
          const t = (i + 0.5) / nr;
          const th = lerp(-1.3 + r * 0.12, 1.3 - r * 0.12, t);
          const yf = 0.81 + r * 0.058 + 0.012 * (1 - Math.pow(Math.abs(t - 0.5) * 2, 2));
          const R = (0.0108 - r * 0.0006) * hs;
          const nrm = H.normalAt(yf, th);
          const axis = nrm.clone().add(new THREE.Vector3(0, 0.5, 0)).normalize();
          const centre = P(yf, th, R * 0.75 + r * 0.004 * hs);
          coil(b, centre, axis, new THREE.Vector3(0, 1, 0), R, 1.5, 0.0048 * hs, base.clone().multiplyScalar(0.92 + 0.12 * rng.next()), lod, rng.range(0, 6.28), 3, 2.4, lod === 0 ? 9 : 7, lod === 0 ? 5 : 4);
        }
      }
      break;
    }
    case 'veiled':
    case 'vestal': {
      // Smoothed back under the veil; only the front of the hair shows at the brow.
      const tie = { yf: 0.5, th: Math.PI };
      flowCards(lod === 2 ? 10 : 26, { target: tie, width: 0.03 * hs, sides: false });
      break;
    }
    default:
      break;
  }

  const geometry = b.build();
  geometry.name = `real:hair:${effStyle}:${lod}`;
  return { geometry, triangles: b.triangleCount };
}

/**
 * A flat coil of plait (a bun, a knot, an "orbis comarum" curl): an Archimedean spiral in the plane
 * facing `axis`, winding in toward a dome. `up` orients the spiral's start.
 */
function coil(b: HairBuilder, centre: THREE.Vector3, axis: THREE.Vector3, up: THREE.Vector3, R: number, turns: number, tubeR: number, color: THREE.Color, lod: number, phase = 0, vRepeat = 5, dome = 1.1, perTurn = lod === 0 ? 22 : 14, segs = lod === 0 ? 6 : 4) {
  const side = new THREE.Vector3().crossVectors(up, axis).normalize();
  const upN = new THREE.Vector3().crossVectors(axis, side).normalize();
  const np = Math.round(perTurn * turns);
  const path: THREE.Vector3[] = [];
  for (let k = 0; k <= np; k++) {
    const t = k / np;
    const a = phase + t * turns * Math.PI * 2;
    const r = R * (1 - 0.82 * t);
    path.push(centre.clone().addScaledVector(side, Math.cos(a) * r).addScaledVector(upN, Math.sin(a) * r).addScaledVector(axis, tubeR * dome * Math.sin(Math.min(1, t) * Math.PI * 0.5)));
  }
  b.tube(path, (t) => tubeR * (0.85 + 0.3 * Math.sin(Math.min(1, t * 1.2) * Math.PI)) * (1 - 0.25 * t), segs, color, {
    region: HAIR_UV.plait,
    vRepeat,
    capEnd: true,
    shade: (t, a) => (0.9 - 0.25 * t) * (0.78 + 0.3 * Math.sin(a)),
  });
}
