/**
 * Building sites: timber scaffolding lashed around a structure, and the great treadwheel crane
 * (magna rota / polyspastos) that lifted column drums and cornice blocks — as on the Pantheon
 * rebuilding site.
 */
import * as THREE from 'three';
import type { Rng } from '../../core/Rng';
import type { Draw } from './draw';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * Scaffold along a facade: x ∈ [x0, x1], standing 0.25–1.4 m in front (−z) of the face at z = 0,
 * up to height `h`, with plank decks every 2 m and diagonal bracing.
 */
export function scaffolding(d: Draw, x0: number, x1: number, h: number, rng: Rng) {
  const zIn = -0.25, zOut = -1.4;
  const n = Math.max(1, Math.round((x1 - x0) / 2.2));
  const levels = Math.max(1, Math.floor(h / 2.0));
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    for (const z of [zIn, zOut]) d.cyl('wood', x, h / 2, z, 0.07, h, 6, { rTop: 0.055 });
  }
  for (let l = 1; l <= levels; l++) {
    const y = l * 2.0;
    for (const z of [zIn, zOut]) d.rod('wood', V(x0, y, z), V(x1, y, z), 0.05, 5, { shadow: false });
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      d.rod('wood_dark', V(x, y + 0.08, zIn + 0.2), V(x, y + 0.08, zOut - 0.15), 0.045, 5, { shadow: false });
    }
    // Plank deck (a few planks missing here and there).
    for (let k = 0; k < 4; k++) {
      if (rng.chance(0.08)) continue;
      const z = zIn - 0.15 - k * 0.27;
      d.span('wood', x0 - 0.2, y + 0.13, z - 0.12, x1 + 0.2, y + 0.17, z + 0.12, { shadow: false });
    }
    // Lashing knots and a stray basket or block.
    if (rng.chance(0.4)) d.span('tufa', x0 + rng.range(0.5, x1 - x0 - 0.5), y + 0.17, zIn - 0.7, x0 + rng.range(0.5, x1 - x0 - 0.5) + 0.5, y + 0.45, zIn - 0.4);
  }
  // Diagonal bracing on the outer plane.
  for (let i = 0; i < n; i++) {
    const a = x0 + ((x1 - x0) * i) / n, b = x0 + ((x1 - x0) * (i + 1)) / n;
    for (let l = 0; l < levels; l++) {
      const y0 = l * 2.0, y1 = (l + 1) * 2.0;
      if ((i + l) % 2) d.rod('wood', V(a, y0, zOut - 0.08), V(b, y1, zOut - 0.08), 0.04, 4, { shadow: false });
      else d.rod('wood', V(b, y0, zOut - 0.08), V(a, y1, zOut - 0.08), 0.04, 4, { shadow: false });
    }
  }
  // Ladder.
  const lx = x0 + 0.6;
  for (const s of [-0.22, 0.22]) d.rod('wood', V(lx + s, 0, zOut - 0.6), V(lx + s, Math.min(h, 4.2), zOut - 0.2), 0.03, 4);
  for (let y = 0.3; y < Math.min(h, 4.2); y += 0.32) d.rod('wood_dark', V(lx - 0.22, y, zOut - 0.6 + (y / 4.2) * 0.4), V(lx + 0.22, y, zOut - 0.6 + (y / 4.2) * 0.4), 0.02, 4, { shadow: false });
  d.solid(x0 - 0.1, 0, zOut - 0.2, x1 + 0.1, h, zIn + 0.05);
}

/**
 * Treadwheel crane: an A-frame jib leaning forward (−z) over the load, a treadwheel ~4 m across at
 * its foot, ropes through a pulley block to a hanging stone, and guy ropes to stakes.
 * Origin: foot of the jib on the ground; total height ≈ `h`.
 */
export function treadwheelCrane(d: Draw, h: number, rng: Rng) {
  const lean = 0.28; // radians toward −z
  const top = V(0, h * Math.cos(lean), -h * Math.sin(lean));
  const feet = [V(-1.6, 0, 0.3), V(1.6, 0, 0.3)];
  // Base sill beams.
  d.span('wood_dark', -2.2, 0, 0.05, 2.2, 0.3, 0.55);
  d.span('wood_dark', -0.15, 0, -1.5, 0.15, 0.3, 4.6);
  for (const f of feet) d.rod('wood', f, top, 0.16, 7, { rTop: 0.11 });
  // Cross ties up the A-frame.
  for (const t of [0.3, 0.55, 0.78]) {
    const a = feet[0].clone().lerp(top, t), b = feet[1].clone().lerp(top, t);
    d.rod('wood_dark', a, b, 0.07, 5);
  }
  // Pulley block at the top and the rope to the load.
  d.span('wood_dark', -0.25, top.y - 0.35, top.z - 0.2, 0.25, top.y + 0.1, top.z + 0.2);
  d.cyl('wood', 0, top.y - 0.3, top.z - 0.05, 0.18, 0.12, 10, { rz: Math.PI / 2 });
  const loadY = rng.range(2.5, Math.max(3, h * 0.45));
  const hook = V(0, loadY + 0.9, top.z - 0.05);
  d.rod('fabric_ochre', V(0, top.y - 0.45, top.z - 0.15), hook, 0.022, 4, { shadow: false });
  d.rod('fabric_ochre', V(0, top.y - 0.45, top.z + 0.05), V(0, 2.2, 2.6), 0.022, 4, { shadow: false });
  d.span('iron', -0.1, loadY + 0.55, top.z - 0.15, 0.1, loadY + 0.9, top.z + 0.05);
  d.span('travertine', -0.7, loadY - 0.1, top.z - 0.45, 0.7, loadY + 0.55, top.z + 0.35);
  // Treadwheel (two rims, spokes, treads) on its axle behind the jib.
  const wz = 2.6, wr = 2.1, wy = wr + 0.35;
  for (const x of [-0.75, 0.75]) {
    d.geo(new THREE.TorusGeometry(wr, 0.07, 5, 28), 'wood', x, wy, wz, { ry: Math.PI / 2 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      d.rod('wood_dark', V(x, wy, wz), V(x, wy + Math.sin(a) * wr, wz + Math.cos(a) * wr), 0.05, 4, { shadow: false });
    }
  }
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const p = V(0, wy + Math.sin(a) * wr, wz + Math.cos(a) * wr);
    d.box('wood', 0, p.y, p.z, 1.55, 0.05, 0.22, { rx: -a, shadow: false });
  }
  d.cyl('wood_dark', 0, wy, wz, 0.18, 2.1, 10, { rz: Math.PI / 2 });
  for (const x of [-1.15, 1.15]) {
    d.rod('wood_dark', V(x, 0, wz - 1.2), V(x, wy, wz), 0.1, 5);
    d.rod('wood_dark', V(x, 0, wz + 1.2), V(x, wy, wz), 0.1, 5);
  }
  // Guy ropes from the jib head back to stakes.
  for (const s of [-1, 1]) {
    const stake = V(s * 3.2, 0, 7.5);
    d.rod('fabric_ochre', top, stake, 0.018, 3, { shadow: false });
    d.cyl('wood_dark', stake.x, 0.25, stake.z, 0.06, 0.5, 5);
  }
  d.solidCyl(0, wy, wz, wr + 0.1, wy * 2);
  for (const f of feet) d.solidCyl(f.x, 1.5, f.z, 0.25, 3);
}
