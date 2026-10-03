/**
 * Cloaks.
 *  - lacerna: light cloak pinned at the right shoulder, falling down the back to the knees;
 *  - sagum: heavier military cloak, pinned on the right shoulder, to mid-thigh;
 *  - paenula: closed, hooded poncho (bell from the shoulders to mid-thigh; the hood bunches at the nape).
 * Capes hang from the shoulders; their lower back follows the thighs a little so running legs
 * don't poke through, and the paenula's sides lift with the upper arms.
 */
import * as THREE from 'three';
import { B } from '../rig';
import { SURF, mixW, type Weights } from '../SkinBuilder';
import { lerp, noise1, shade, smooth, srgb, type Ctx } from './common';
import { torsoPoint, type Levels, type TorsoProfile } from './body';
import { ellipsoid } from './garments';

export function buildCloak(ctx: Ctx, L: Levels, prof: TorsoProfile) {
  const c = ctx.outfit.cloak;
  if (!c) return;
  if (c.kind === 'paenula') buildPaenula(ctx, L, prof, c.color);
  else buildCape(ctx, L, prof, c.color, c.kind === 'sagum');
}

/** Largest back depth of the torso between y and the shoulders (the cape hangs clear of it). */
function backClear(ctx: Ctx, prof: TorsoProfile, L: Levels, y: number) {
  let m = 0;
  for (let k = 0; k <= 6; k++) {
    const yy = lerp(y, L.shoulder, k / 6);
    const sec = prof.at(Math.max(yy, L.crotch));
    m = Math.max(m, sec.bb - sec.zc);
  }
  return m;
}

function buildCape(ctx: Ctx, L: Levels, prof: TorsoProfile, color: THREE.Color, sagum: boolean) {
  const { b } = ctx;
  const s = L.s;
  const cols = ctx.hi ? 14 : 8;
  const rows = ctx.hi ? 8 : 5;
  const top = L.shTop + 0.008 * s;
  const hem = sagum ? L.knee + 0.14 * s : L.knee - 0.04 * s;
  const seed = ctx.rng.next() * 10;
  const T = (sagum ? 0.02 : 0.015) * s;
  // Columns sweep around the back from the left shoulder (a = -1) to the right shoulder (a = +1).
  const point = (a: number, t: number) => {
    const y = lerp(top, hem, t);
    // Over the shoulders the cape comes forward; lower down it hangs behind the body.
    const spanTop = 1.95;
    const spanBottom = 1.05 + 0.35 * t;
    const span = lerp(spanTop, spanBottom, smooth(0, 0.35, t));
    const th = -Math.PI / 2 - a * span; // back center at -π/2 (−z)
    let x: number;
    let z: number;
    if (t < 0.12) {
      const [px, pz] = torsoPoint(ctx, prof, L, y, th);
      const zc = prof.at(y).zc;
      const r = Math.hypot(px, pz - zc);
      const k = (r + T + 0.008 * s) / r;
      x = px * k;
      z = zc + (pz - zc) * k;
    } else {
      // Hanging: a flattened U behind the body, flaring toward the hem.
      const halfW = prof.at(L.shoulder - 0.05 * s).a * 1.02 + 0.03 * s * t;
      const depth = backClear(ctx, prof, L, y) + 0.03 * s + 0.07 * s * t;
      x = Math.sin(-a * span * 0.9) * halfW * 1.05;
      z = -Math.cos(a * span * 0.9 * 0.8) * depth + Math.abs(Math.sin(a * span)) * 0.03 * s;
      // Blend from the shoulder-hugging rows.
      if (t < 0.3) {
        const [px, pz] = torsoPoint(ctx, prof, L, y, th);
        const zc = prof.at(y).zc;
        const r = Math.hypot(px, pz - zc);
        const k = (r + T + 0.01 * s) / r;
        const w = smooth(0.12, 0.3, t);
        x = lerp(px * k, x, w);
        z = lerp(zc + (pz - zc) * k, z, w);
      }
    }
    // Vertical folds, deeper toward the hem.
    const fold = Math.sin(a * 9 + seed + noise1(a * 3, seed) * 1.5);
    const amp = 0.012 * s * smooth(0.15, 1, t);
    const nx = x;
    const nz = z;
    const l = Math.hypot(nx, nz) || 1;
    x += (nx / l) * amp * fold;
    z += (nz / l) * amp * fold;
    return { x, y: y - (t === 1 ? 0.01 * s * noise1(a * 5, seed) : 0), z, fold };
  };
  const weights = (a: number, t: number, x: number): Weights => {
    let w: Weights = [B.chest, 1];
    if (t < 0.15) {
      const sideK = smooth(0.45, 0.95, Math.abs(a));
      w = mixW(w, [B[a > 0 ? 'shoulderR' : 'shoulderL'], 1], sideK * 0.7);
    } else {
      w = mixW([B.chest, 1], [B.spine, 1], smooth(0.15, 0.45, t));
      w = mixW(w, [B.hips, 1], smooth(0.4, 0.75, t));
      const legK = smooth(0.55, 1, t) * 0.35;
      if (legK > 0) w = mixW(w, x > 0 ? [B.thighL, 1] : [B.thighR, 1], legK);
    }
    return w;
  };
  const inner = shade(color, 0.55);
  for (const pass of [0, 1]) {
    b.grid(
      cols,
      rows,
      false,
      (i, j, v) => {
        const a = -1 + (2 * i) / (cols - 1);
        const t = j / (rows - 1);
        const p = point(a, t);
        const back = pass === 1;
        v.x = p.x;
        v.y = p.y;
        v.z = p.z;
        if (back) {
          // Inner side sits a few millimetres inside.
          const l = Math.hypot(p.x, p.z) || 1;
          v.x -= (p.x / l) * 0.004 * s;
          v.z -= (p.z / l) * 0.004 * s;
        }
        const cc = back ? inner : shade(color, 0.86 + 0.14 * (p.fold * 0.5 + 0.5));
        if (!back && (j === rows - 1 || i === 0 || i === cols - 1)) cc.multiplyScalar(0.85);
        v.r = cc.r;
        v.g = cc.g;
        v.b = cc.b;
        v.s = SURF.wool;
        v.w = weights(a, t, p.x);
      },
      'auto',
      (j) => {
        const t = j / (rows - 1);
        const y = lerp(top, hem, t);
        return [0, y, prof.at(Math.max(y, L.crotch)).zc + 0.02];
      },
    );
    if (pass === 1) b.flipTail((cols - 1) * (rows - 1) * 2);
  }
  // Fibula on the right shoulder.
  const f = torsoPoint(ctx, prof, L, L.shTop - 0.005 * s, Math.PI / 2 + 0.75);
  ellipsoid(ctx, new THREE.Vector3(f[0] - 0.01 * s, L.shTop - 0.01 * s, f[1] + 0.02 * s), 0.016 * s, 0.016 * s, 0.008 * s, srgb('#c9a24f'), [B.chest, 0.6, B.shoulderR, 0.4], SURF.bronze);
}

function buildPaenula(ctx: Ctx, L: Levels, prof: TorsoProfile, color: THREE.Color) {
  const { b } = ctx;
  const s = L.s;
  const cols = ctx.hi ? 20 : 10;
  const rows = ctx.hi ? 7 : 4;
  const top = L.shTop - 0.004 * s;
  const hem = L.hip - 0.14 * s;
  const seed = ctx.rng.next() * 10;
  const shoulderW = prof.at(L.shoulder - 0.02 * s).a + 0.06 * s;
  const point = (th: number, t: number) => {
    const y = lerp(top, hem, t);
    const [px, pz] = torsoPoint(ctx, prof, L, Math.max(y, L.crotch), th);
    const zc = prof.at(Math.max(y, L.crotch)).zc;
    // A bell: hugs the shoulders, then falls straight and flares over the arms and hips.
    const sx = Math.cos(th);
    const sz = Math.sin(th);
    const bellA = Math.max(shoulderW, prof.at(L.hip).a + 0.05 * s) + 0.04 * s * t;
    const bellD = prof.at(L.chest).bf + 0.025 * s + 0.03 * s * t;
    const bx = sx * bellA;
    const bz = zc + sz * (sz > 0 ? bellD : backClear(ctx, prof, L, y) + 0.025 * s + 0.03 * s * t);
    const r = Math.hypot(px, pz - zc) || 1;
    const k = (r + 0.018 * s) / r;
    const w = smooth(0.0, 0.3, t);
    let x = lerp(px * k, bx, w);
    let z = lerp(zc + (pz - zc) * k, bz, w);
    const fold = Math.sin(th * 10 + seed + noise1(th * 2, seed));
    const amp = 0.008 * s * t;
    const l = Math.hypot(x, z - zc) || 1;
    x += (x / l) * amp * fold;
    z += ((z - zc) / l) * amp * fold;
    return { x, y, z, fold };
  };
  b.grid(
    cols,
    rows,
    true,
    (i, j, v) => {
      const th = (i / cols) * Math.PI * 2;
      const t = j / (rows - 1);
      const p = point(th, t);
      // Front seam.
      const seam = Math.abs(Math.cos(th)) < 0.06 && Math.sin(th) > 0;
      const cc = seam ? shade(color, 0.6) : shade(color, 0.86 + 0.14 * (p.fold * 0.5 + 0.5));
      if (j === rows - 1) cc.multiplyScalar(0.85);
      v.x = p.x;
      v.y = p.y;
      v.z = p.z;
      v.r = cc.r;
      v.g = cc.g;
      v.b = cc.b;
      v.s = SURF.wool;
      // Sides ride the upper arms so arm swings lift the cloak instead of piercing it.
      const side = Math.abs(Math.cos(th));
      let w: Weights = mixW([B.chest, 1], [B.spine, 1], smooth(0.3, 1, t) * 0.6);
      if (side > 0.5) w = mixW(w, [B[Math.cos(th) > 0 ? 'upperArmL' : 'upperArmR'], 1], smooth(0.5, 0.95, side) * lerp(0.15, 0.6, t));
      v.w = w;
    },
    'auto',
    (j) => {
      const y = lerp(top, hem, j / (rows - 1));
      return [0, y, prof.at(Math.max(y, L.crotch)).zc];
    },
  );
  // Inner hem band so the bell isn't hollow from below.
  b.grid(
    cols,
    2,
    true,
    (i, j, v) => {
      const th = (i / cols) * Math.PI * 2;
      const p = point(th, j === 0 ? 1 : 0.75);
      v.x = p.x * 0.985;
      v.y = p.y;
      v.z = p.z * 0.985;
      const cc = shade(color, 0.5);
      v.r = cc.r;
      v.g = cc.g;
      v.b = cc.b;
      v.s = SURF.wool;
      v.w = [B.chest, 0.4, B.spine, 0.6];
    },
    'auto',
    (j) => [0, lerp(hem, hem + 0.1, j), 0],
  );
  b.flipTail(cols * 2);
  // Hood bunched behind the neck.
  ellipsoid(ctx, new THREE.Vector3(0, L.trap + 0.01 * s, prof.at(L.trap).zc - prof.at(L.trap).bb - 0.03 * s), 0.07 * s, 0.045 * s, 0.04 * s, shade(color, 0.9), [B.chest, 0.6, B.neck, 0.4], SURF.wool, 0.08);
}
