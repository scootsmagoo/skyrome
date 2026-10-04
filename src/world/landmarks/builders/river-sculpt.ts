/**
 * Lofted animals and figures for the river district: oxen and cows for the cattle market (live,
 * in vertex-coloured hides), the bronze bull from Aegina, and the bronze Hercules of the Ara
 * Maxima. Same method as the classical kit's statues (src/arch/classical/statues.ts): smooth
 * elliptical sections swept along spines and limbs, so silhouettes read as animals and cast
 * bronze rather than stacked blobs.
 *
 * Frames: origin on the ground under the body, facing −z, 1:1 metres.
 *  - `bovine(pose, opts)` returns `Part`s (geometry + a role: hide, horn, hoof, muzzle, switch).
 *  - `emitBronze()` merges parts into a MeshBuilder with one material (statues).
 *  - `HideMesh` collects live animals of one landmark into ONE vertex-coloured mesh (one draw call,
 *    one shared material for every landmark): white, grey, red, dun and piebald hides.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { gridSurface, linspace, tube } from '../../../arch/common/geom';
import type { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../gfx/materialIds';
import type { Rng } from '../../../core/Rng';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export type PartRole = 'hide' | 'horn' | 'hoof' | 'muzzle' | 'switch';

export interface Part {
  geometry: THREE.BufferGeometry;
  role: PartRole;
}

// ------------------------------------------------------------------ loft

function crValue(vals: number[], s: number): number {
  const n = vals.length;
  const i = Math.min(n - 2, Math.max(0, Math.floor(s)));
  const t = s - i;
  const p0 = vals[Math.max(0, i - 1)];
  const p1 = vals[i];
  const p2 = vals[i + 1];
  const p3 = vals[Math.min(n - 1, i + 2)];
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

interface LoftOpts {
  /** Direction of the second radius (rz); default up (+y). */
  front?: THREE.Vector3;
  seg?: number;
  sub?: number;
  /** Radius multiplier per section angle θ (π/2 = `front`) and position u ∈ [0, 1]. */
  shape?: (theta: number, u: number) => number;
}

/**
 * Smooth closed tube through `path` (Catmull-Rom) with elliptical sections (rx across, rz toward
 * `front`), radii interpolated along the path. Ends are closed by shrinking the end radii.
 */
export function loft(path: THREE.Vector3[], radii: [number, number][], o: LoftOpts = {}): THREE.BufferGeometry {
  const n = path.length;
  const seg = o.seg ?? 10;
  const sub = o.sub ?? 2;
  const xs = path.map((p) => p.x), ys = path.map((p) => p.y), zs = path.map((p) => p.z);
  const rxs = radii.map((r) => r[0]), rzs = radii.map((r) => r[1]);
  const front = (o.front ?? V(0, 1, 0)).clone().normalize();
  const c = new THREE.Vector3();
  const c2 = new THREE.Vector3();
  const t = new THREE.Vector3();
  const az = new THREE.Vector3();
  const ax = new THREE.Vector3();
  const at = (s: number, out: THREE.Vector3) => out.set(crValue(xs, s), crValue(ys, s), crValue(zs, s));
  const P = (th: number, s: number, out: THREE.Vector3) => {
    at(s, c);
    at(Math.min(n - 1, s + 1e-3), t);
    at(Math.max(0, s - 1e-3), c2);
    t.sub(c2).normalize();
    az.copy(front).addScaledVector(t, -front.dot(t));
    if (az.lengthSq() < 1e-6) az.set(1, 0, 0).addScaledVector(t, -t.x);
    az.normalize();
    ax.crossVectors(t, az).normalize();
    const k = o.shape ? o.shape(th, s / (n - 1)) : 1;
    // Close the ends: the first and last sections shrink to a point.
    const end = s <= 1e-6 || s >= n - 1 - 1e-6 ? 0.02 : 1;
    const rx = Math.max(1e-4, crValue(rxs, s)) * k * end;
    const rz = Math.max(1e-4, crValue(rzs, s)) * k * end;
    return out.copy(c).addScaledVector(ax, Math.cos(th) * rx).addScaledVector(az, Math.sin(th) * rz);
  };
  const ths = linspace(0, Math.PI * 2, seg);
  const ss = linspace(0, n - 1, (n - 1) * sub);
  // Orientation: ∂θ × ∂s must point away from the spine.
  const mid = (n - 1) / 2;
  const p0 = P(0.3, mid, new THREE.Vector3());
  const pa = P(0.3 + 1e-3, mid, new THREE.Vector3()).sub(p0);
  const pb = P(0.3, mid + 1e-3, new THREE.Vector3()).sub(p0);
  at(mid, c2);
  const flip = new THREE.Vector3().crossVectors(pa, pb).dot(p0.clone().sub(c2)) < 0;
  return gridSurface(ths, ss, P, { flip });
}

function blob(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, hi: boolean): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, hi ? 12 : 7, hi ? 8 : 5);
  g.scale(rx, ry, rz);
  g.translate(cx, cy, cz);
  return g;
}

// ------------------------------------------------------------------ cattle

export interface BovineOptions {
  /** 'bull' is heavier in the neck and shoulders with shorter horns. */
  sex?: 'ox' | 'cow' | 'bull';
  pose?: 'stand' | 'graze' | 'lie';
  hi?: boolean;
  /** Overall scale (1 ≈ 1.4 m at the withers). */
  scale?: number;
  /** Horn spread multiplier. */
  horns?: number;
  /** Finer sections (a bronze statue seen close up). */
  hero?: boolean;
}

/** An ox, cow or bull in lofted parts (feet on y = 0, facing −z). */
export function bovine(o: BovineOptions = {}): Part[] {
  const hi = o.hi ?? true;
  const bull = o.sex === 'bull';
  const cow = o.sex === 'cow';
  const k = o.scale ?? 1;
  const lie = o.pose === 'lie';
  const graze = o.pose === 'graze';
  const drop = lie ? 0.62 : 0; // lying: the body rests on the folded legs
  const seg = o.hero ? 20 : hi ? 12 : 8;
  const sub = o.hero ? 4 : hi ? 2 : 1;
  const legK = bull ? 1.22 : 1;
  const out: Part[] = [];
  const P = (x: number, y: number, z: number) => V(x * k, (y - drop) * k, z * k);
  const add = (g: THREE.BufferGeometry, role: PartRole = 'hide') => out.push({ geometry: g, role });
  const w = cow ? 0.9 : 1;
  // Body from the brisket to the pin bones: deep chest, slung barrel, square hindquarters.
  add(
    loft(
      [P(0, 1.0, -0.82), P(0, 1.06, -0.6), P(0, 1.02, -0.2), P(0, 1.0, 0.22), P(0, 1.05, 0.55), P(0, 1.08, 0.74), P(0, 1.04, 0.86)],
      [
        [0.15 * k, 0.2 * k],
        [(bull ? 0.32 : 0.28) * w * k, (bull ? 0.4 : 0.36) * k],
        [0.34 * w * k, 0.4 * k],
        [0.33 * w * k, 0.39 * k],
        [0.29 * w * k, 0.33 * k],
        [0.24 * w * k, 0.27 * k],
        [0.1 * k, 0.12 * k],
      ],
      // Flatter back and flanks than an ellipse; the belly hangs a little.
      { seg, sub, shape: (th) => 1 + 0.06 * Math.cos(2 * th) - 0.04 * Math.sin(th) },
    ),
  );
  // Withers hump (more on the bull).
  add(loft([P(0, 1.26, -0.72), P(0, 1.33, -0.55), P(0, 1.3, -0.32)], [[0.1 * k, 0.06 * k], [(bull ? 0.2 : 0.14) * k, (bull ? 0.12 : 0.07) * k], [0.1 * k, 0.05 * k]], { seg: hi ? 10 : 6, sub: 1 }));
  // Neck and head (lowered when grazing), the dewlap hanging under the throat.
  const hy = graze ? 0.32 : lie ? 1.12 : 1.16;
  const hz = graze ? -1.38 : -1.24;
  const neck = graze ? [P(0, 1.16, -0.62), P(0, 0.92, -0.98), P(0, 0.6, -1.18), P(0, hy + 0.18, hz + 0.1)] : [P(0, 1.18, -0.62), P(0, 1.18, -0.9), P(0, 1.18, -1.06), P(0, hy + 0.03, hz + 0.1)];
  add(loft(neck, [[(bull ? 0.25 : 0.2) * w * k, (bull ? 0.3 : 0.26) * k], [(bull ? 0.21 : 0.16) * w * k, (bull ? 0.24 : 0.2) * k], [0.14 * k, 0.16 * k], [0.12 * k, 0.13 * k]], { seg: hi ? 12 : 7, sub }));
  const dew = graze ? [P(0, 0.88, -0.86), P(0, 0.64, -1.02), P(0, 0.5, -1.12)] : [P(0, 0.9, -0.84), P(0, 0.86, -1.0), P(0, 0.98, -1.12)];
  add(loft(dew, [[0.05 * k, 0.12 * k], [0.045 * k, 0.16 * k], [0.03 * k, 0.07 * k]], { front: graze ? V(0, 0.2, 1) : V(0, -1, 0), seg: hi ? 8 : 5, sub: 1 }));
  // Head: a wedge from the poll to the muzzle, broad flat forehead.
  const head = graze
    ? [P(0, hy + 0.2, hz + 0.08), P(0, hy + 0.12, hz - 0.02), P(0, hy - 0.02, hz - 0.1), P(0, hy - 0.16, hz - 0.13), P(0, hy - 0.24, hz - 0.13)]
    : [P(0, hy + 0.06, hz + 0.08), P(0, hy, hz - 0.04), P(0, hy - 0.12, hz - 0.17), P(0, hy - 0.24, hz - 0.25), P(0, hy - 0.3, hz - 0.28)];
  add(loft(head, [[0.12 * k, 0.1 * k], [0.12 * k, 0.11 * k], [0.095 * k, 0.085 * k], [0.08 * k, 0.07 * k], [0.06 * k, 0.05 * k]], { front: graze ? V(0, 0, -1) : V(0, 0.6, -1), seg: hi ? 12 : 7, sub }));
  const mz = head[head.length - 1];
  add(blob(mz.x, mz.y, mz.z, 0.085 * k, 0.065 * k, 0.06 * k, hi), 'muzzle');
  // Horns: from the poll out sideways, curving up and forward (lyre), cream with dark tips.
  const hs = (o.horns ?? 1) * (bull ? 0.75 : cow ? 0.85 : 1);
  const poll = head[0];
  for (const sx of [-1, 1]) {
    // Out sideways first, then sweeping up and forward (the lyre of Italian grey cattle).
    const path = [
      V(poll.x + sx * 0.08 * k, poll.y + 0.02 * k, poll.z),
      V(poll.x + sx * 0.21 * k * hs, poll.y + 0.04 * k, poll.z - 0.02 * k),
      V(poll.x + sx * 0.33 * k * hs, poll.y + 0.09 * k * hs, poll.z - 0.08 * k * hs),
      V(poll.x + sx * 0.4 * k * hs, poll.y + 0.18 * k * hs, poll.z - 0.17 * k * hs),
      V(poll.x + sx * 0.4 * k * hs, poll.y + 0.27 * k * hs, poll.z - 0.24 * k * hs),
    ];
    add(tube(path, (i) => (0.045 - i * 0.009) * k * (bull ? 1.25 : 1), o.hero ? 8 : hi ? 6 : 4), 'horn');
    // Ear, flat and drooping sideways under the horn.
    add(loft([V(poll.x + sx * 0.1 * k, poll.y - 0.04 * k, poll.z + 0.03 * k), V(poll.x + sx * 0.2 * k, poll.y - 0.08 * k, poll.z + 0.04 * k), V(poll.x + sx * 0.27 * k, poll.y - 0.1 * k, poll.z + 0.04 * k)], [[0.035 * k, 0.012 * k], [0.05 * k, 0.014 * k], [0.02 * k, 0.01 * k]], { front: V(0, 0, 1), seg: 6, sub: 1 }));
  }
  // Legs: shoulder / elbow / knee / fetlock / hoof (front) and hip / stifle / hock / fetlock / hoof.
  const legR: [number, number][] = [[0.13, 0.16], [0.085, 0.1], [0.055, 0.06], [0.045, 0.05], [0.055, 0.06]];
  const hindR: [number, number][] = [[0.15, 0.19], [0.1, 0.13], [0.058, 0.07], [0.045, 0.05], [0.055, 0.06]];
  const legs: [THREE.Vector3[], [number, number][]][] = [];
  if (lie) {
    // Folded under the body: forelegs tucked, hind legs to one side.
    for (const sx of [-1, 1]) legs.push([[P(sx * 0.17, 0.95, -0.6), P(sx * 0.2, 0.72, -0.62), P(sx * 0.2, 0.66, -0.36), P(sx * 0.18, 0.66, -0.2), P(sx * 0.17, 0.66, -0.12)], legR]);
    legs.push([[P(0.18, 0.98, 0.56), P(0.32, 0.74, 0.4), P(0.36, 0.66, 0.74), P(0.3, 0.66, 0.42), P(0.28, 0.66, 0.3)], hindR]);
    legs.push([[P(-0.18, 0.98, 0.56), P(-0.3, 0.72, 0.42), P(-0.34, 0.66, 0.1), P(-0.3, 0.66, -0.08), P(-0.28, 0.66, -0.16)], hindR]);
  } else {
    for (const sx of [-1, 1]) {
      const f = graze ? -0.04 : 0;
      legs.push([[P(sx * 0.17, 0.95, -0.6), P(sx * 0.18, 0.7, -0.62 + f), P(sx * 0.17, 0.42, -0.6 + f), P(sx * 0.17, 0.12, -0.6 + f), P(sx * 0.17, 0.03, -0.63 + f)], legR]);
      legs.push([[P(sx * 0.18, 0.98, 0.58), P(sx * 0.2, 0.72, 0.5), P(sx * 0.17, 0.44, 0.71), P(sx * 0.17, 0.12, 0.66), P(sx * 0.17, 0.03, 0.63)], hindR]);
    }
  }
  for (const [path, r] of legs) {
    add(loft(path, r.map(([a, b]) => [a * k * legK, b * k * legK] as [number, number]), { front: V(0, 0, -1), seg: o.hero ? 12 : hi ? 8 : 5, sub: o.hero ? 2 : 1 }));
    const h = path[path.length - 1];
    add(blob(h.x, h.y + 0.01 * k, h.z - 0.01 * k, 0.06 * k, 0.045 * k, 0.07 * k, false), 'hoof');
  }
  // Tail with its switch.
  const tl = lie ? [P(0, 1.06, 0.86), P(0.1, 0.9, 0.95), P(0.25, 0.7, 0.9), P(0.36, 0.64, 0.7)] : [P(0, 1.08, 0.86), P(0, 0.96, 0.92), P(0, 0.62, 0.93), P(0.02, 0.36, 0.9)];
  add(tube(tl, (i) => (0.035 - i * 0.006) * k, hi ? 5 : 4));
  const tip = tl[tl.length - 1];
  add(blob(tip.x, tip.y - 0.06 * k, tip.z, 0.05 * k, 0.11 * k, 0.05 * k, false), 'switch');
  return out;
}

// ------------------------------------------------------------------ a nude hero (Hercules)

/**
 * A standing nude Hercules at life size × `scale`: weight on the right leg, the left hand on a
 * knotted club standing on the ground, the lion skin over the left forearm, the right hand behind
 * the back (the apples of the Hesperides), a bearded head. Feet on y = 0, facing −z.
 */
export function hercules(hi = true): THREE.BufferGeometry[] {
  const seg = hi ? 14 : 7;
  const sub = hi ? 3 : 1;
  const out: THREE.BufferGeometry[] = [];
  const F = V(0, 0, -1);
  // Contrapposto: the weight on the right leg, the right hip up, the shoulders tilted against it.
  const hipTilt = 0.03;
  // Torso: hips to the base of the neck — heavy chest and shoulders, narrow waist (Farnese type).
  out.push(
    loft([V(0.01, 0.93, 0.01), V(0.01, 1.04, 0), V(0, 1.17, -0.01), V(-0.005, 1.3, -0.015), V(-0.01, 1.43, -0.01), V(-0.01, 1.54, 0.0), V(-0.005, 1.63, 0.01)], [[0.19, 0.13], [0.185, 0.125], [0.16, 0.12], [0.2, 0.13], [0.25, 0.14], [0.25, 0.125], [0.1, 0.08]], {
      front: F,
      seg: hi ? 18 : 8,
      sub,
      // Pectorals and the abdomen as relief on the front, the back a little flatter.
      shape: (th, u) => 1 + (hi ? 0.06 * Math.max(0, Math.sin(th)) * Math.max(0, Math.sin(u * Math.PI * 5)) : 0) - 0.04 * Math.max(0, -Math.sin(th)),
    }),
  );
  // Deltoids, pectoral masses, gluteals.
  for (const sx of [-1, 1]) {
    out.push(blob(sx * 0.235, 1.52 + sx * 0.012, 0.0, 0.1, 0.1, 0.095, hi));
    out.push(blob(sx * 0.1, 1.42, -0.085, 0.1, 0.07, 0.055, hi));
    out.push(blob(sx * 0.09, 0.95 + sx * hipTilt, 0.075, 0.105, 0.11, 0.085, hi));
  }
  // Neck (thick), the head with beard and curls.
  out.push(loft([V(-0.005, 1.6, 0.01), V(0, 1.68, 0.0), V(0, 1.74, -0.005)], [[0.085, 0.08], [0.075, 0.072], [0.068, 0.066]], { front: F, seg, sub: 1 }));
  out.push(blob(0, 1.82, -0.01, 0.1, 0.12, 0.11, hi));
  out.push(blob(0, 1.735, -0.075, 0.085, 0.075, 0.06, hi)); // beard
  out.push(blob(0, 1.875, 0.005, 0.108, 0.085, 0.112, hi)); // curls
  out.push(blob(0, 1.81, -0.115, 0.022, 0.035, 0.03, false)); // nose
  // Legs: the right straight and weight-bearing, the left relaxed with the knee forward.
  const legR: [number, number][] = [[0.125, 0.12], [0.105, 0.105], [0.068, 0.072], [0.075, 0.082], [0.045, 0.047]];
  out.push(loft([V(0.1, 0.97 + hipTilt, 0.0), V(0.11, 0.75, -0.01), V(0.115, 0.52, -0.02), V(0.115, 0.33, 0.0), V(0.115, 0.08, 0.02)], legR, { front: F, seg, sub }));
  out.push(loft([V(-0.1, 0.97 - hipTilt, 0.0), V(-0.125, 0.75, -0.045), V(-0.145, 0.53, -0.075), V(-0.165, 0.33, -0.02), V(-0.185, 0.09, 0.05)], legR, { front: F, seg, sub }));
  for (const [x, z] of [[0.115, -0.04], [-0.185, 0.0]]) out.push(blob(x, 0.04, z, 0.06, 0.042, 0.125, hi));
  // Right arm hanging, the hand behind the hip (the apples of the Hesperides).
  const armR: [number, number][] = [[0.085, 0.085], [0.072, 0.075], [0.058, 0.06], [0.06, 0.055], [0.04, 0.035]];
  out.push(loft([V(0.245, 1.5, 0.0), V(0.285, 1.36, 0.02), V(0.3, 1.22, 0.04), V(0.29, 1.1, 0.08), V(0.25, 0.98, 0.13)], armR, { front: V(1, 0, 0), seg, sub }));
  out.push(blob(0.24, 0.94, 0.15, 0.045, 0.065, 0.04, hi));
  // Left arm down and forward, the hand on the club head; the lion skin over the forearm.
  out.push(loft([V(-0.245, 1.5, 0.0), V(-0.29, 1.36, -0.02), V(-0.32, 1.22, -0.06), V(-0.34, 1.12, -0.12), V(-0.35, 1.04, -0.18)], armR, { front: V(-1, 0, 0), seg, sub }));
  out.push(blob(-0.35, 1.02, -0.21, 0.05, 0.045, 0.055, hi));
  // The club: knotted olive wood swelling to the head under the hand.
  out.push(loft([V(-0.38, 0.0, -0.26), V(-0.375, 0.35, -0.25), V(-0.37, 0.7, -0.235), V(-0.36, 0.99, -0.22)], [[0.04, 0.04], [0.05, 0.05], [0.068, 0.068], [0.085, 0.085]], { seg: hi ? 10 : 6, sub, shape: (th, u) => 1 + (hi ? 0.14 * Math.sin(th * 3 + u * 9) : 0) }));
  // The lion skin hanging in heavy folds from the forearm to the knee, the lion's head at its foot.
  out.push(loft([V(-0.33, 1.16, -0.06), V(-0.39, 0.97, -0.08), V(-0.41, 0.77, -0.07), V(-0.4, 0.58, -0.05)], [[0.12, 0.045], [0.15, 0.05], [0.13, 0.045], [0.07, 0.035]], { front: V(1, 0, 0), seg: hi ? 12 : 6, sub, shape: (th) => 1 + (hi ? 0.12 * Math.sin(th * 5) : 0) }));
  out.push(blob(-0.4, 0.55, -0.05, 0.075, 0.085, 0.065, hi));
  return out;
}

/** Merge statue geometry into a MeshBuilder with one material, through `at` (scale included). */
export function emitBronze(b: MeshBuilder, parts: (THREE.BufferGeometry | Part)[], mat: MaterialId, at: THREE.Matrix4) {
  for (const p of parts) b.add('geometry' in p ? p.geometry : p, mat, at);
}

// ------------------------------------------------------------------ live hides

export type Hide = 'white' | 'grey' | 'red' | 'dun' | 'piebald' | 'black';

const HIDE: Record<Hide, number> = {
  white: 0xcdc6b8,
  grey: 0x989288,
  red: 0x8a4a2a,
  dun: 0xb48a5a,
  piebald: 0xd6d0c4,
  black: 0x2c2724,
};

let hideMaterial: THREE.MeshStandardMaterial | null = null;

/** The one shared material of every hide mesh (vertex colours, matte). */
export function hideMat(): THREE.MeshStandardMaterial {
  hideMaterial ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0, name: 'river-hide' });
  return hideMaterial;
}

function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth 3D value noise in [0, 1). */
function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  let r = 0;
  for (let dz = 0; dz < 2; dz++)
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) r += hash3(xi + dx, yi + dy, zi + dz) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
  return r;
}

/**
 * Live animals of one landmark merged into one vertex-coloured mesh. Add each animal with its
 * matrix (landmark-local) and hide; `build()` returns the mesh (or null if empty).
 */
export class HideMesh {
  private geos: THREE.BufferGeometry[] = [];

  add(parts: Part[], at: THREE.Matrix4, hide: Hide, rng: Rng) {
    const base = new THREE.Color(HIDE[hide]);
    const patch = new THREE.Color(rng.chance(0.5) ? 0x5a3420 : 0x2e2824);
    const dark = new THREE.Color(0x2a2420);
    const horn = new THREE.Color(0xd9ccb0);
    const seed = rng.range(0, 100);
    // Slight per-animal tint so a herd is not uniform.
    const tint = rng.range(0.92, 1.05);
    const c = new THREE.Color();
    const p = new THREE.Vector3();
    for (const part of parts) {
      const g = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
      g.deleteAttribute('uv');
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      const col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i);
        if (part.role === 'horn') c.copy(horn).lerp(dark, Math.min(1, Math.max(0, (Math.abs(p.x) - 0.24) * 6)));
        else if (part.role === 'hoof' || part.role === 'switch') c.copy(dark);
        else if (part.role === 'muzzle') c.copy(hide === 'red' || hide === 'dun' ? new THREE.Color(0x4a3428) : dark);
        else {
          c.copy(base).multiplyScalar(tint);
          if (hide === 'piebald' && noise3(p.x * 2.6 + seed, p.y * 2.6, p.z * 2.6) > 0.56) c.copy(patch);
          // White and grey oxen darken on the neck, shoulders and lower legs (Maremmana type).
          if (hide === 'white' || hide === 'grey') {
            const sh = Math.max(0, 1 - Math.abs(p.z + 0.75) * 2.2) * Math.max(0, (p.y - 0.8) * 2);
            c.lerp(new THREE.Color(0x77726a), Math.min(0.45, sh * 0.5 + Math.max(0, 0.35 - p.y) * 1.2));
          } else c.lerp(dark, Math.max(0, 0.3 - p.y) * 1.5);
          // Darker underneath (soft occlusion).
          c.multiplyScalar(0.8 + 0.2 * Math.min(1, Math.max(0, (p.y - 0.55) * 2)));
        }
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.applyMatrix4(at);
      this.geos.push(g);
    }
  }

  get isEmpty() {
    return this.geos.length === 0;
  }

  build(name: string): THREE.Mesh | null {
    if (!this.geos.length) return null;
    const merged = mergeGeometries(this.geos.map((g) => (g.getAttribute('normal') ? g : (g.computeVertexNormals(), g))))!;
    for (const g of this.geos) g.dispose();
    this.geos = [];
    merged.computeBoundingSphere();
    const m = new THREE.Mesh(merged, hideMat());
    m.name = name;
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
}
