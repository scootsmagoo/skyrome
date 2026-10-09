/**
 * Beards for the realistic heads (men only; stubble is painted in skin.ts, not built here): a thin beard
 * cap over the jaw, chin and cheeks that stipples out at its edge, cards that hang from it, and a moustache
 * of cards sweeping from the philtrum to the corners of the mouth. `full` is longer and goes below the chin.
 */
import * as THREE from 'three';
import { Rng } from '../../../../core/Rng';
import type { BeardStyle } from '../../../appearance';
import type { HeadSurface } from './frame';
import { HairBuilder } from './cards';
import { HAIR_UV } from './hairTexture';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Mouth line and lip heights as fractions of the head (see frame.ts mouthY). */
export const MOUTH = { line: 0.245, upperLip: 0.285, lowerLip: 0.205 } as const;

/** Top edge (height fraction) of the beard at azimuth magnitude a (0 chin front ... 1.45 sideburn). */
function beardTop(a: number): number {
  if (a < 0.3) return 0.178;
  if (a < 0.62) return lerp(0.178, 0.4, smooth(0.3, 0.62, a));
  return lerp(0.4, 0.62, smooth(0.62, 1.45, a));
}

export function buildBeard(H: HeadSurface, style: BeardStyle, color: THREE.Color, rng: Rng, lod: 0 | 1 | 2): { geometry: THREE.BufferGeometry; triangles: number } | null {
  if (style === 'none' || style === 'stubble') return null;
  const hs = H.hs;
  const full = style === 'full';
  const b = new HairBuilder();
  const base = color.clone().multiplyScalar(1.4);
  const lodK = lod === 0 ? 1 : lod === 1 ? 0.5 : 0.25;
  const jitter = (k = 0.12) => base.clone().multiplyScalar(1 + (rng.next() * 2 - 1) * k);
  const thick = (full ? 0.0095 : 0.006) * hs;
  const below = (full ? 0.05 : 0.0) * hs;
  const A = 1.45;

  const P = (yf: number, th: number, off: number) => {
    if (yf >= 0) return H.at(yf, th).addScaledVector(H.normalAt(yf, th), off);
    // Below the chin the beard hangs on, jutting forward a little.
    const p = H.at(0, th).addScaledVector(H.normalAt(0.02, th), off);
    p.y += yf * H.H;
    p.z += -yf * H.H * 0.3 * Math.max(0, Math.cos(th));
    return p;
  };

  // Cap.
  {
    const NC = lod === 0 ? 33 : 21;
    const R = lod === 0 ? 11 : 6;
    const b0 = b.vertexCount;
    const c = new THREE.Color();
    for (let j = 0; j < R; j++)
      for (let i = 0; i < NC; i++) {
        const th = lerp(-A, A, i / (NC - 1));
        const a = Math.abs(th);
        const top = beardTop(a);
        const s = j / (R - 1);
        // Down to the chin line, then below it at the front.
        const bottom = -below * (1 - smooth(0.2, 0.9, a)) / H.H;
        const yf = lerp(top, bottom, Math.pow(s, 1.4));
        const dTop = (top - yf) * H.H;
        const edge = smooth(0, 0.014, dTop) * smooth(A, A - 0.25, a);
        const p = P(yf, th, thick * (0.25 + 0.75 * edge));
        const fade = 1 - smooth(0.0, 0.012, dTop);
        const fa = smooth(A - 0.05, A, a) * 0.8;
        c.copy(base).multiplyScalar(0.75 + 0.2 * Math.sin(th * 13 + yf * 40) * 0.5 + 0.1);
        b.vertex({ p, n: H.normalAt(Math.max(0.02, yf), th), u: lerp(HAIR_UV.fade[0], HAIR_UV.fade[1], (i * 0.37) % 1), v: Math.max(fade, fa), c, t: new THREE.Vector3(0, -1, 0) });
      }
    for (let j = 0; j < R - 1; j++)
      for (let i = 0; i < NC - 1; i++) {
        const a = b0 + j * NC + i;
        const bb = a + 1;
        const cc = b0 + (j + 1) * NC + i + 1;
        const d = b0 + (j + 1) * NC + i;
        b.tri(a, bb, cc);
        b.tri(a, cc, d);
      }
  }

  // Cards hanging off the cap.
  const nCards = Math.round((full ? 110 : 44) * lodK);
  for (let i = 0; i < nCards; i++) {
    const th = lerp(-A * 0.95, A * 0.95, (i + rng.next() * 0.8) / nCards);
    const a = Math.abs(th);
    const top = beardTop(a);
    const yf0 = lerp(top + 0.02, 0.02, Math.pow(rng.next(), 0.7));
    const front = 1 - smooth(0.2, 1.1, a);
    const len = (full ? 0.016 + 0.08 * front * rng.range(0.7, 1.1) + 0.024 * (1 - front) : 0.01 + 0.008 * rng.next()) * hs;
    const lenYf = len / H.H;
    const w = (full ? 0.021 : 0.016) * hs * rng.range(0.85, 1.2);
    const path: THREE.Vector3[] = [];
    const nrm: THREE.Vector3[] = [];
    const M = lod === 0 ? 5 : 3;
    for (let k = 0; k < M; k++) {
      const t = k / (M - 1);
      const yf = yf0 - t * lenYf;
      path.push(P(yf, th, thick * 0.6 + t * (full ? 0.0075 : 0.0025) * hs));
      nrm.push(H.normalAt(Math.max(0.03, yf), th));
    }
    b.ribbon(path, (t) => w * (1 - 0.35 * t), (_t, k) => nrm[k], jitter(0.15), { lift: 0.2 });
  }

  // Moustache: from the philtrum out and down to the corner of the mouth.
  const nM = Math.max(3, Math.round((full ? 8 : 5) * lodK));
  for (const side of [1, -1]) {
    for (let k = 0; k < nM; k++) {
      const th0 = side * (0.012 + 0.085 * (k / nM));
      const yTop = MOUTH.upperLip + 0.045 - 0.012 * (k / nM);
      const yEnd = MOUTH.line + 0.0 + 0.004 * k;
      const spread = (full ? 0.34 : 0.24) + 0.04 * rng.next();
      const w = (full ? 0.011 : 0.0085) * hs;
      const path: THREE.Vector3[] = [];
      const nrm: THREE.Vector3[] = [];
      for (let q = 0; q < 4; q++) {
        const t = q / 3;
        const th = th0 + side * spread * t * t * 0.85 + side * 0.02 * t;
        const yf = lerp(yTop, yEnd, Math.pow(t, 0.8));
        path.push(P(yf, th, 0.0028 * hs + 0.0045 * hs * Math.sin(t * Math.PI * 0.9)));
        nrm.push(H.normalAt(yf, th));
      }
      b.ribbon(path, (t) => w * (1 - 0.3 * t), (_t, q) => nrm[q], jitter(0.12), { lift: 0.25 });
    }
  }

  const geometry = b.build();
  geometry.name = `real:beard:${style}:${lod}`;
  return { geometry, triangles: b.triangleCount };
}
