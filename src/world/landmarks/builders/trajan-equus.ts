/**
 * The Equus Traiani itself: Trajan on horseback in gilded bronze, the centrepiece of the square
 * (≈ 2.2 × life on its base). The horse walks towards the entrance with the right foreleg raised
 * (the scheme of the Marcus Aurelius on the Capitol, the only such bronze to survive); the emperor
 * in a muscle cuirass and paludamentum raises his right hand in the adlocutio gesture and holds
 * the reins in his left.
 *
 * Bodies are LOFTED (smooth elliptical sections swept along Catmull-Rom spines), at more
 * segments than the kit's generic statue so the silhouette stays smooth at hero scale. Life-size
 * units (a horse 1.6 m at the withers), the horse faces −z, origin on the base between the hooves.
 */
import * as THREE from 'three';
import type { MeshBuilder } from '../../../gfx/MeshBuilder';
import { mul } from '../../../arch/common/geom';
import type { Mat } from './trajan-kit';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function cr(vals: number[], s: number): number {
  const n = vals.length;
  const i = Math.min(n - 2, Math.max(0, Math.floor(s)));
  const t = s - i;
  const p0 = vals[Math.max(0, i - 1)];
  const p1 = vals[i];
  const p2 = vals[i + 1];
  const p3 = vals[Math.min(n - 1, i + 2)];
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
}

interface LoftOpts {
  /** Direction of the section's second radius (projected off the spine); default −z. */
  front?: THREE.Vector3;
  seg: number;
  sub: number;
  /** Radius multiplier by angle θ (π/2 = front) and position u ∈ [0, 1]. */
  shape?: (th: number, u: number) => number;
}

/**
 * Closed smooth tube through `path` with elliptical sections (rx across, rz towards `front`),
 * Catmull-Rom interpolated, wound outwards. The ends are closed by fans.
 */
export function loft(path: THREE.Vector3[], radii: [number, number][], o: LoftOpts): THREE.BufferGeometry {
  const n = path.length;
  const xs = path.map((p) => p.x);
  const ys = path.map((p) => p.y);
  const zs = path.map((p) => p.z);
  const rxs = radii.map((r) => r[0]);
  const rzs = radii.map((r) => r[1]);
  const front = (o.front ?? V(0, 0, -1)).clone().normalize();
  const rows = (n - 1) * o.sub + 1;
  const ring = o.seg;
  const pos: number[] = [];
  const centres: THREE.Vector3[] = [];
  const c = V(0, 0, 0);
  const t = V(0, 0, 0);
  const az = V(0, 0, 0);
  const ax = V(0, 0, 0);
  for (let r = 0; r < rows; r++) {
    const s = (r / (rows - 1)) * (n - 1);
    c.set(cr(xs, s), cr(ys, s), cr(zs, s));
    const e = 1e-3;
    const sa = Math.min(n - 1, s + e);
    const sb = Math.max(0, s - e);
    t.set(cr(xs, sa) - cr(xs, sb), cr(ys, sa) - cr(ys, sb), cr(zs, sa) - cr(zs, sb)).normalize();
    az.copy(front).addScaledVector(t, -front.dot(t));
    if (az.lengthSq() < 1e-6) az.set(1, 0, 0).addScaledVector(t, -t.x);
    az.normalize();
    ax.crossVectors(t, az).normalize();
    const rx = Math.max(1e-4, cr(rxs, s));
    const rz = Math.max(1e-4, cr(rzs, s));
    centres.push(c.clone());
    for (let k = 0; k < ring; k++) {
      const th = (k / ring) * Math.PI * 2;
      const m = o.shape ? o.shape(th, s / (n - 1)) : 1;
      pos.push(c.x + (ax.x * Math.cos(th) * rx + az.x * Math.sin(th) * rz) * m, c.y + (ax.y * Math.cos(th) * rx + az.y * Math.sin(th) * rz) * m, c.z + (ax.z * Math.cos(th) * rx + az.z * Math.sin(th) * rz) * m);
    }
  }
  // End-cap centres.
  const capA = pos.length / 3;
  pos.push(centres[0].x, centres[0].y, centres[0].z);
  const capB = capA + 1;
  const last = centres[centres.length - 1];
  pos.push(last.x, last.y, last.z);
  const idx: number[] = [];
  const at = (r: number, k: number) => r * ring + (k % ring);
  for (let r = 0; r < rows - 1; r++) {
    for (let k = 0; k < ring; k++) idx.push(at(r, k), at(r + 1, k), at(r + 1, k + 1), at(r, k), at(r + 1, k + 1), at(r, k + 1));
  }
  for (let k = 0; k < ring; k++) {
    idx.push(capA, at(0, k + 1), at(0, k));
    idx.push(capB, at(rows - 1, k), at(rows - 1, k + 1));
  }
  // Orientation: flip if the first side face points into the spine.
  const P = (i: number) => V(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  const r0 = Math.floor((rows - 1) / 2);
  const a = P(at(r0, 0));
  const nrm = P(at(r0 + 1, 0)).sub(a).cross(P(at(r0 + 1, 1)).sub(a));
  if (nrm.dot(a.clone().sub(centres[r0])) < 0) for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function blob(c: THREE.Vector3, rx: number, ry: number, rz: number, hi: boolean): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, hi ? 14 : 7, hi ? 10 : 5);
  g.scale(rx, ry, rz);
  g.translate(c.x, c.y, c.z);
  return g;
}

/** The horse (life size, facing −z, right foreleg raised). */
function horse(parts: THREE.BufferGeometry[], hi: boolean) {
  const S = (a: number, b: number) => ({ seg: hi ? a : Math.max(6, Math.round(a / 2)), sub: hi ? b : 1 });
  const up = V(0, 1, 0);
  // Body from the breast to the buttocks: deep chest, round barrel, powerful quarters.
  parts.push(
    loft(
      [V(0, 1.14, -0.93), V(0, 1.15, -0.87), V(0, 1.19, -0.75), V(0, 1.21, -0.56), V(0, 1.2, -0.28), V(0, 1.19, 0.05), V(0, 1.23, 0.38), V(0, 1.27, 0.66), V(0, 1.24, 0.86), V(0, 1.2, 0.93), V(0, 1.17, 0.965)],
      [[0.03, 0.04], [0.17, 0.22], [0.24, 0.31], [0.27, 0.36], [0.29, 0.38], [0.3, 0.38], [0.29, 0.36], [0.27, 0.33], [0.19, 0.23], [0.12, 0.15], [0.02, 0.03]],
      { front: up, ...S(26, 4), shape: (th) => 1 + 0.04 * Math.cos(2 * th) },
    ),
  );
  // Neck (arched, deep at the base) and the crest of the mane.
  const neckFront = V(0, 0.5, -1);
  parts.push(loft([V(0, 1.3, -0.6), V(0, 1.52, -0.88), V(0, 1.72, -1.1), V(0, 1.86, -1.23)], [[0.15, 0.3], [0.13, 0.23], [0.1, 0.16], [0.085, 0.11]], { front: neckFront, ...S(18, 4) }));
  parts.push(loft([V(0, 1.6, -0.55), V(0, 1.79, -0.79), V(0, 1.94, -1.04), V(0, 1.99, -1.18)], [[0.04, 0.08], [0.045, 0.08], [0.04, 0.065], [0.03, 0.04]], { front: V(0, 1, 1), ...S(8, 3), shape: (th, u) => 1 + (hi ? 0.15 * Math.sin(th * 3 + u * 22) : 0) }));
  // Head: a long wedge from the poll to the muzzle, with the jowl, ears and forelock.
  const headFront = V(0, 0.8, -0.6);
  parts.push(
    loft([V(0, 1.9, -1.21), V(0, 1.82, -1.34), V(0, 1.68, -1.47), V(0, 1.57, -1.57), V(0, 1.52, -1.625), V(0, 1.5, -1.65)], [[0.085, 0.11], [0.082, 0.12], [0.062, 0.086], [0.056, 0.072], [0.05, 0.062], [0.012, 0.014]], { front: headFront, ...S(16, 3) }),
  );
  for (const sx of [-1, 1]) {
    parts.push(blob(V(sx * 0.055, 1.76, -1.32), 0.04, 0.08, 0.09, hi)); // jowl
    parts.push(loft([V(sx * 0.045, 1.94, -1.2), V(sx * 0.06, 2.03, -1.19), V(sx * 0.068, 2.09, -1.18)], [[0.026, 0.018], [0.02, 0.014], [0.003, 0.003]], { front: V(0, 0, -1), ...S(6, 2) })); // ear
    parts.push(blob(V(sx * 0.032, 1.52, -1.635), 0.014, 0.016, 0.012, hi)); // nostril flare
  }
  parts.push(blob(V(0, 1.92, -1.27), 0.04, 0.03, 0.05, hi)); // forelock
  // Tail, carried a little away from the quarters.
  parts.push(loft([V(0, 1.34, 0.9), V(0, 1.27, 1.03), V(0, 1.0, 1.12), V(0, 0.72, 1.12), V(0, 0.55, 1.08)], [[0.06, 0.07], [0.06, 0.065], [0.065, 0.06], [0.075, 0.055], [0.03, 0.025]], { front: V(0, 0, 1), ...S(10, 3), shape: (th, u) => 1 + (hi ? 0.12 * Math.sin(th * 5 + u * 9) * u : 0) }));
  // Legs: shoulder/hip → elbow/stifle → knee/hock → fetlock → pastern → hoof.
  const legR: [number, number][] = [[0.1, 0.15], [0.1, 0.13], [0.062, 0.075], [0.05, 0.062], [0.044, 0.05], [0.06, 0.066]];
  const hindR: [number, number][] = [[0.13, 0.19], [0.12, 0.16], [0.06, 0.085], [0.05, 0.062], [0.044, 0.05], [0.06, 0.066]];
  const legs: [THREE.Vector3[], [number, number][]][] = [
    // fore right: raised, knee forward, hoof tucked
    [[V(0.12, 1.14, -0.64), V(0.17, 0.9, -0.71), V(0.17, 0.8, -0.97), V(0.17, 0.53, -0.95), V(0.17, 0.45, -0.89), V(0.17, 0.42, -0.85)], legR],
    // fore left: planted
    [[V(-0.12, 1.14, -0.62), V(-0.17, 0.86, -0.6), V(-0.17, 0.5, -0.62), V(-0.17, 0.17, -0.62), V(-0.17, 0.07, -0.66), V(-0.17, 0.0, -0.68)], legR],
    // hind right
    [[V(0.12, 1.2, 0.56), V(0.18, 0.88, 0.42), V(0.17, 0.55, 0.76), V(0.17, 0.17, 0.68), V(0.17, 0.07, 0.64), V(0.17, 0.0, 0.62)], hindR],
    // hind left: a little behind (the walk)
    [[V(-0.12, 1.2, 0.58), V(-0.18, 0.88, 0.48), V(-0.17, 0.55, 0.86), V(-0.17, 0.17, 0.8), V(-0.17, 0.07, 0.76), V(-0.17, 0.0, 0.75)], hindR],
  ];
  for (const [pts, r] of legs) parts.push(loft(pts, r, { front: V(0, 0, -1), ...S(12, 3) }));
  // Saddle cloth over the back, with a fringe line.
  parts.push(loft([V(0, 1.55, -0.32), V(0, 1.59, -0.02), V(0, 1.57, 0.26)], [[0.33, 0.045], [0.34, 0.05], [0.32, 0.045]], { front: up, ...S(16, 2), shape: (th) => (Math.sin(th) < 0 ? 0.3 : 1) }));
  // Reins' bit rings.
  for (const sx of [-1, 1]) parts.push(blob(V(sx * 0.055, 1.57, -1.55), 0.018, 0.018, 0.018, hi));
}

/** The emperor: cuirass, pteruges, cloak, adlocutio gesture. `seat` = the saddle point. */
function rider(parts: THREE.BufferGeometry[], hi: boolean) {
  const S = (a: number, b: number) => ({ seg: hi ? a : Math.max(6, Math.round(a / 2)), sub: hi ? b : 1 });
  // Legs astride: thigh, shin and booted foot (calcei), the toes a little down.
  for (const sx of [-1, 1]) {
    parts.push(loft([V(sx * 0.11, 1.68, -0.02), V(sx * 0.27, 1.5, -0.24), V(sx * 0.31, 1.4, -0.33)], [[0.09, 0.09], [0.072, 0.07], [0.058, 0.058]], { front: V(0, 1, 0), ...S(10, 2) }));
    parts.push(loft([V(sx * 0.31, 1.42, -0.33), V(sx * 0.32, 1.18, -0.24), V(sx * 0.31, 0.99, -0.17)], [[0.055, 0.058], [0.05, 0.055], [0.04, 0.045]], { front: V(0, 0, -1), ...S(10, 2) }));
    parts.push(loft([V(sx * 0.31, 0.99, -0.15), V(sx * 0.32, 0.95, -0.26), V(sx * 0.32, 0.92, -0.33)], [[0.045, 0.04], [0.04, 0.035], [0.03, 0.025]], { front: V(0, 1, 0), ...S(8, 2) }));
  }
  // Pelvis and the leather skirt of pteruges over the thighs.
  parts.push(blob(V(0, 1.7, -0.01), 0.17, 0.11, 0.14, hi));
  parts.push(loft([V(0, 1.8, 0), V(0, 1.7, -0.01), V(0, 1.6, -0.02)], [[0.18, 0.14], [0.23, 0.18], [0.27, 0.22]], { front: V(0, 0, -1), ...S(20, 2), shape: (th, u) => 1 + (hi ? 0.06 * u * Math.cos(th * 14) : 0) }));
  // Muscle cuirass with a low pectoral relief, belt (cingulum) and shoulder lappets.
  parts.push(
    loft([V(0, 1.78, 0), V(0, 1.9, -0.012), V(0, 2.04, -0.015), V(0, 2.15, -0.005), V(0, 2.21, 0)], [[0.165, 0.12], [0.17, 0.125], [0.2, 0.135], [0.19, 0.125], [0.1, 0.085]], {
      front: V(0, 0, -1),
      ...S(20, 3),
      shape: (th, u) => 1 + (hi ? 0.035 * Math.max(0, Math.sin(th)) * Math.max(0, Math.cos(2 * th)) * Math.sin(u * Math.PI) : 0),
    }),
  );
  parts.push(loft([V(0, 1.81, 0.0), V(0, 1.83, 0.0)], [[0.175, 0.13], [0.175, 0.13]], { front: V(0, 0, -1), ...S(20, 1) }));
  for (const sx of [-1, 1]) parts.push(blob(V(sx * 0.2, 2.13, 0.0), 0.075, 0.06, 0.075, hi));
  // Neck and head (the Trajanic portrait: a broad face, the hair combed forward in a fringe).
  parts.push(loft([V(0, 2.19, 0.0), V(0, 2.3, -0.01)], [[0.055, 0.055], [0.05, 0.05]], { front: V(0, 0, -1), ...S(10, 1) }));
  // An egg-shaped head (chin to crown), the hair cap with its fringe, the nose.
  parts.push(loft([V(0, 2.28, -0.035), V(0, 2.33, -0.03), V(0, 2.42, -0.02), V(0, 2.5, -0.01), V(0, 2.545, 0)], [[0.045, 0.05], [0.082, 0.09], [0.1, 0.11], [0.09, 0.1], [0.02, 0.02]], { front: V(0, 0, -1), ...S(14, 3) }));
  parts.push(blob(V(0, 2.455, 0.012), 0.104, 0.095, 0.108, hi));
  parts.push(blob(V(0, 2.4, -0.128), 0.015, 0.032, 0.02, hi)); // nose
  for (const sx of [-1, 1]) parts.push(blob(V(sx * 0.1, 2.4, -0.01), 0.02, 0.035, 0.025, hi)); // ears
  // Right arm raised in the adlocutio, palm open; left arm forward holding the reins.
  parts.push(loft([V(0.21, 2.13, 0), V(0.33, 2.12, -0.22), V(0.42, 2.2, -0.43), V(0.45, 2.24, -0.49)], [[0.058, 0.058], [0.05, 0.05], [0.038, 0.038], [0.034, 0.034]], { front: V(0, 1, 0), ...S(10, 2) }));
  parts.push(blob(V(0.465, 2.29, -0.53), 0.024, 0.07, 0.048, hi));
  parts.push(loft([V(-0.21, 2.13, 0), V(-0.27, 1.92, -0.1), V(-0.2, 1.8, -0.33)], [[0.058, 0.058], [0.05, 0.05], [0.036, 0.036]], { front: V(0, 0, -1), ...S(10, 2) }));
  parts.push(blob(V(-0.19, 1.79, -0.37), 0.04, 0.045, 0.05, hi));
  for (const sx of [-1, 1]) parts.push(loft([V(-0.19, 1.79, -0.38), V(sx * 0.03 - 0.06, 1.7, -0.9), V(sx * 0.055, 1.57, -1.55)], [[0.008, 0.008], [0.008, 0.008], [0.008, 0.008]], { front: V(0, 1, 0), seg: 4, sub: hi ? 3 : 1 }));
  // Paludamentum: pinned on the right shoulder, over the back and spilling across the quarters.
  parts.push(
    loft([V(0.05, 2.15, 0.08), V(0.0, 1.95, 0.24), V(-0.02, 1.68, 0.38), V(0.0, 1.5, 0.5), V(0.02, 1.34, 0.56)], [[0.2, 0.035], [0.26, 0.04], [0.3, 0.045], [0.34, 0.04], [0.3, 0.03]], {
      front: V(0, 1, 1),
      ...S(16, 3),
      shape: (th, u) => 1 + (hi ? 0.1 * Math.sin(th * 6 + u * 4) * u : 0),
    }),
  );
  parts.push(loft([V(0.2, 2.15, 0.02), V(0.24, 2.0, 0.08), V(0.25, 1.82, 0.1)], [[0.06, 0.03], [0.07, 0.035], [0.06, 0.03]], { front: V(1, 0, 0), ...S(8, 2) }));
}

/** The Equus Traiani group at `at` (origin on the base top, facing −z), `scale` × life. */
export function equusStatue(b: MeshBuilder, at: THREE.Matrix4, o: { scale?: number; detail?: 'high' | 'low'; material?: Mat } = {}) {
  const hi = (o.detail ?? 'high') === 'high';
  const parts: THREE.BufferGeometry[] = [];
  horse(parts, hi);
  rider(parts, hi);
  const s = o.scale ?? 2.2;
  const m = mul(at, new THREE.Matrix4().makeScale(s, s, s));
  for (const g of parts) b.add(g, o.material ?? 'gilded_bronze', m);
}
