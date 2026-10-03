/**
 * Weapon and prop geometry (cached). Conventions, shared by every model:
 *   - origin at the center of the grip (where the fist closes);
 *   - +Y points out of the thumb side of the fist (the blade / spearhead / business end);
 *   - edges face ±Z, flats face ±X. The hand sockets map +Y to the thumb direction.
 * All parts use the shared avatar material via per-vertex color + surf (steel, bronze, wood...).
 */
import * as THREE from 'three';
import type { WeaponModel } from '../appearance';
import { SURF, type Surf } from '../avatar/SkinBuilder';
import { srgb } from '../avatar/build/common';
import { RigidBuilder, type Vec3 } from './geom';

export type PropModel = 'cup' | 'hammer' | 'broom' | 'scabbard-gladius' | 'scabbard-spatha';

const STEEL = srgb('#b7bcc2');
const STEEL_DARK = srgb('#7d838a');
const BRONZE = srgb('#b08d4a');
const WOOD = srgb('#7a5a3c');
const WOOD_DARK = srgb('#4e3826');
const BONE = srgb('#d8cbb0');
const LEATHER = srgb('#4a3324');
const ROPE = srgb('#a8916a');
const PITCH = srgb('#2b2420');

const steel: Surf = { ...SURF.iron, rough: 0.28, metal: 0.92 };
const wood: Surf = SURF.wood;

const cache = new Map<string, THREE.BufferGeometry>();

/** Diamond-section blade from y0 to y1 with half-width w(y) (edges along ±z) and a point. */
function blade(rb: RigidBuilder, y0: number, y1: number, tip: number, width: (t: number) => number, thick: number, bend = 0) {
  const rows: number[][] = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y = y0 + (y1 - y0) * t;
    rows.push([y, thick, width(t), 0, bend * t * t]);
  }
  // Point: taper to a tip.
  const pn = 3;
  for (let i = 1; i <= pn; i++) {
    const t = i / pn;
    const y = y1 + (tip - y1) * t;
    const w = width(1) * (1 - t) ** 0.9;
    rows.push([y, thick * (1 - t * 0.8), Math.max(0.0006, w), 0, bend * (1 + t * 0.3)]);
  }
  // Diamond cross-section: x = thickness at the ridge, z = edges.
  const diamond = (th: number): [number, number] => {
    const c = Math.cos(th);
    const s = Math.sin(th);
    return [Math.sign(c) * Math.abs(c) ** 1.6, Math.sign(s) * Math.abs(s) ** 0.7];
  };
  rb.lathe(rows, 4, (y, th) => (Math.abs(Math.sin(th)) > 0.9 ? STEEL : STEEL_DARK), steel, { shape: diamond });
}

function grip(rb: RigidBuilder, y0: number, y1: number, r: number, col: THREE.Color, ridges = 3) {
  const rows: number[][] = [];
  const n = ridges * 2 + 1;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    rows.push([y0 + (y1 - y0) * t, r * (i % 2 ? 1.12 : 0.95), r * (i % 2 ? 1.12 : 0.95)]);
  }
  rb.lathe(rows, 8, col, SURF.wood);
}

function shaft(rb: RigidBuilder, y0: number, y1: number, r0: number, r1: number, col = WOOD) {
  rb.lathe(
    [
      [y0, r0, r0],
      [(y0 + y1) / 2, (r0 + r1) / 2, (r0 + r1) / 2],
      [y1, r1, r1],
    ],
    7,
    (y, th) => col.clone().multiplyScalar(0.92 + 0.1 * Math.sin(th * 3 + y * 20)),
    wood,
  );
}

/** Leaf-shaped spear/javelin head along +Y from y0 (socket) to y1 (tip). */
function spearHead(rb: RigidBuilder, y0: number, len: number, w: number) {
  rb.lathe([[y0 - 0.02, 0.012, 0.012], [y0 + 0.03, 0.01, 0.01]], 6, STEEL_DARK, steel, { capBottom: true });
  blade(rb, y0 + 0.03, y0 + 0.03 + len * 0.55, y0 + 0.03 + len, (t) => w * Math.sin(0.35 + t * 2.0) * (t < 0.15 ? 0.6 + t * 2.6 : 1), 0.005);
}

export function weaponGeometry(model: WeaponModel): THREE.BufferGeometry | null {
  if (model === 'none') return null;
  const hit = cache.get(model);
  if (hit) return hit;
  const rb = new RigidBuilder();
  switch (model) {
    case 'gladius':
      // Pompeii type: parallel edges, short triangular point, bone grip with finger ridges, ball pommel.
      blade(rb, 0.075, 0.55, 0.64, () => 0.025, 0.0055);
      rb.ellipsoid([0, 0.06, 0], [0.024, 0.016, 0.042], BONE, SURF.leather, 10, 6);
      grip(rb, -0.045, 0.05, 0.0145, BONE);
      rb.ellipsoid([0, -0.07, 0], [0.027, 0.022, 0.03], BONE, SURF.leather, 10, 6);
      rb.ellipsoid([0, -0.094, 0], [0.006, 0.006, 0.006], BRONZE, SURF.bronze, 6, 4);
      break;
    case 'spatha':
      blade(rb, 0.07, 0.76, 0.84, (t) => 0.023 - t * 0.002, 0.005);
      rb.ellipsoid([0, 0.058, 0], [0.022, 0.014, 0.04], BONE, SURF.leather, 10, 6);
      grip(rb, -0.05, 0.048, 0.014, WOOD_DARK);
      rb.ellipsoid([0, -0.07, 0], [0.024, 0.02, 0.028], BONE, SURF.leather, 10, 6);
      break;
    case 'pugio':
      blade(rb, 0.05, 0.2, 0.27, (t) => 0.018 + 0.012 * Math.sin(t * Math.PI), 0.0045);
      rb.box([0, 0.042, 0], [0.008, 0.008, 0.032], STEEL_DARK, steel);
      grip(rb, -0.04, 0.035, 0.012, STEEL_DARK, 1);
      rb.box([0, -0.05, 0], [0.008, 0.012, 0.03], STEEL_DARK, steel);
      break;
    case 'sica':
      // Thracian curved blade, bent toward the edge side.
      blade(rb, 0.06, 0.3, 0.4, (t) => 0.018 - t * 0.004, 0.005, 0.08);
      rb.box([0, 0.048, 0], [0.01, 0.008, 0.03], BRONZE, SURF.bronze);
      grip(rb, -0.045, 0.04, 0.013, WOOD_DARK, 2);
      rb.ellipsoid([0, -0.058, 0], [0.018, 0.014, 0.02], BRONZE, SURF.bronze, 8, 5);
      break;
    case 'hasta':
      shaft(rb, -0.95, 1.18, 0.0145, 0.0135);
      spearHead(rb, 1.18, 0.26, 0.026);
      rb.lathe([[-1.02, 0.004, 0.004], [-0.95, 0.014, 0.014], [-0.92, 0.015, 0.015]], 6, STEEL_DARK, steel);
      break;
    case 'pilum':
      shaft(rb, -0.62, 0.68, 0.017, 0.016);
      rb.box([0, 0.72, 0], [0.022, 0.045, 0.022], WOOD_DARK, wood);
      rb.lathe([[0.76, 0.006, 0.006], [1.32, 0.0045, 0.0045]], 5, STEEL_DARK, steel);
      rb.lathe([[1.32, 0.009, 0.009], [1.4, 0.0005, 0.0005]], 4, STEEL, steel, { capTop: false });
      rb.lathe([[-0.68, 0.004, 0.004], [-0.62, 0.018, 0.018]], 6, STEEL_DARK, steel);
      break;
    case 'fustis':
      rb.lathe(
        [[-0.1, 0.018, 0.018], [0.15, 0.02, 0.02], [0.4, 0.026, 0.026], [0.58, 0.034, 0.032], [0.66, 0.03, 0.03], [0.69, 0.012, 0.012]],
        8,
        (y, th) => WOOD.clone().multiplyScalar(0.85 + 0.15 * Math.sin(th * 2 + y * 30)),
        wood,
      );
      rb.ellipsoid([0.02, 0.5, 0.01], [0.012, 0.018, 0.012], WOOD_DARK, wood, 6, 4);
      break;
    case 'trident': {
      shaft(rb, -0.62, 0.86, 0.015, 0.014);
      rb.box([0, 0.9, 0], [0.012, 0.012, 0.085], STEEL_DARK, steel);
      for (const z of [-0.075, 0, 0.075]) {
        const len = z === 0 ? 0.24 : 0.2;
        rb.lathe([[0.9, 0.006, 0.006, 0, z], [0.9 + len, 0.004, 0.004, 0, z], [0.9 + len + 0.035, 0.0005, 0.0005, 0, z]], 5, STEEL, steel, { capTop: false });
        rb.box([0, 0.9 + len - 0.01, z + (z >= 0 ? 0.008 : -0.008)], [0.002, 0.012, 0.006], STEEL, steel);
      }
      break;
    }
    case 'net': {
      // A gathered bunch of net hanging from the fist (along +Z, which points down the fingers).
      const rows: number[][] = [];
      const n = 7;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const r = 0.02 + 0.13 * Math.sin(Math.min(1, t * 1.2) * Math.PI * 0.5) * (1 - t * 0.35);
        rows.push([t * 0.5 - 0.02, r, r * 0.7, 0, 0]);
      }
      // Rope mesh: light cords on dark gaps.
      rb.lathe(rows, 16, (y, th) => (Math.abs(Math.sin(th * 10 + y * 45)) > 0.82 || Math.abs(Math.sin(th * 10 - y * 45)) > 0.82 ? ROPE : srgb('#2a2018')), SURF.linen);
      // Rotate so the bunch hangs along +Z (down the fingers).
      const g = rb.build('net');
      g.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
      cache.set(model, g);
      return g;
    }
    case 'bow': {
      // Composite recurve: limbs along ±Y, belly toward -Z (the archer), tips recurving forward.
      const limb = (sign: number) => {
        const rows: number[][] = [];
        const n = 8;
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          const y = sign * (0.05 + t * 0.53);
          const z = -0.11 * Math.sin(t * Math.PI * 0.75) + (t > 0.8 ? (t - 0.8) * 0.4 : 0);
          rows.push([y, 0.009 - t * 0.004, 0.016 - t * 0.008, 0, z]);
        }
        rb.lathe(sign > 0 ? rows : rows.reverse(), 5, (y) => (Math.abs(y) > 0.5 ? BONE : WOOD_DARK), SURF.leather);
      };
      limb(1);
      limb(-1);
      rb.lathe([[-0.07, 0.016, 0.02], [0.07, 0.016, 0.02]], 6, LEATHER, SURF.leather);
      // String.
      rb.lathe([[-0.57, 0.0015, 0.0015, 0, -0.035], [0.57, 0.0015, 0.0015, 0, -0.035]], 3, BONE, SURF.linen);
      break;
    }
    case 'sling': {
      const g2 = new RigidBuilder();
      g2.lathe([[0, 0.003, 0.003, -0.01, 0], [0.55, 0.003, 0.003, -0.02, 0]], 3, ROPE, SURF.linen);
      g2.lathe([[0, 0.003, 0.003, 0.01, 0], [0.55, 0.003, 0.003, 0.02, 0]], 3, ROPE, SURF.linen);
      g2.ellipsoid([0, 0.58, 0], [0.03, 0.04, 0.02], LEATHER, SURF.leather, 8, 5);
      const g = g2.build('sling');
      g.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
      cache.set(model, g);
      return g;
    }
    case 'torch':
      rb.lathe([[-0.16, 0.014, 0.014], [0.28, 0.016, 0.016]], 7, WOOD, wood);
      rb.lathe(
        [[0.26, 0.018, 0.018], [0.3, 0.03, 0.03], [0.36, 0.034, 0.034], [0.41, 0.028, 0.028], [0.43, 0.012, 0.012]],
        8,
        (y, th) => (Math.sin(y * 160 + th) > 0.2 ? PITCH : ROPE.clone().multiplyScalar(0.35)),
        { ...SURF.leather, emissive: 0 },
      );
      // Glowing embers at the top of the wrap.
      rb.ellipsoid([0, 0.425, 0], [0.024, 0.012, 0.024], srgb('#ff8a2a'), SURF.glow, 8, 4);
      break;
    case 'hammer':
      return propGeometry('hammer');
    case 'axe': {
      // Dolabra: axe blade on one side, pick on the other (vigiles, legionary pioneers).
      shaft(rb, -0.32, 0.48, 0.016, 0.017);
      rb.box([0, 0.47, 0], [0.018, 0.03, 0.03], STEEL_DARK, steel);
      const bladePts: [number, number][] = [
        [0.0, 0.025],
        [0.0, -0.025],
        [0.09, -0.06],
        [0.11, 0.0],
        [0.09, 0.06],
      ];
      for (const x of [0.006, -0.006]) rb.fan(bladePts.map(([a, b]) => [b, a] as [number, number]), 0, STEEL, steel, x > 0 ? 1 : -1, (u, v) => [x, 0.47 + u, 0.025 + v] as Vec3);
      rb.lathe([[0.47, 0.012, 0.012, 0, -0.03], [0.44, 0.006, 0.006, 0, -0.16]], 5, STEEL_DARK, steel, { shape: undefined });
      break;
    }
  }
  const g = rb.build(model);
  cache.set(model, g);
  return g;
}

export function propGeometry(model: PropModel): THREE.BufferGeometry {
  const key = `prop:${model}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const rb = new RigidBuilder();
  switch (model) {
    case 'cup':
      rb.lathe([[0.0, 0.022, 0.022, 0, 0.0], [0.012, 0.03, 0.03], [0.045, 0.04, 0.04], [0.05, 0.038, 0.038]], 10, srgb('#a85c38'), SURF.paint, { capTop: false });
      break;
    case 'hammer':
      shaft(rb, -0.1, 0.25, 0.013, 0.015);
      rb.box([0, 0.27, 0.01], [0.018, 0.02, 0.06], STEEL_DARK, steel);
      break;
    case 'broom':
      shaft(rb, -0.4, 0.95, 0.013, 0.013, WOOD);
      rb.lathe([[-0.42, 0.02, 0.02], [-0.5, 0.05, 0.03], [-0.7, 0.075, 0.035]], 8, srgb('#b59a5c'), SURF.linen);
      break;
    case 'scabbard-gladius':
    case 'scabbard-spatha': {
      const len = model === 'scabbard-gladius' ? 0.56 : 0.78;
      // Scabbard hanging blade-down from the belt: the mouth at the origin, extending along -Y.
      rb.lathe([[-len, 0.002, 0.012], [-len + 0.04, 0.012, 0.03], [-0.04, 0.012, 0.034], [0, 0.013, 0.036]], 6, (y) => (y > -0.05 || y < -len + 0.06 ? BRONZE : srgb('#5a3a26')), (y) => (y > -0.05 || y < -len + 0.06 ? SURF.bronze : SURF.leather), { shape: (th) => [Math.cos(th), Math.sin(th)] });
      for (const y of [-0.12, -0.3]) rb.box([0, y, 0], [0.015, 0.008, 0.038], BRONZE, SURF.bronze);
      break;
    }
  }
  const g = rb.build(key);
  cache.set(key, g);
  return g;
}

/** Flame mesh geometry for torches: three crossed quads with a per-quad seed for flicker. */
export function flameGeometry(): THREE.BufferGeometry {
  const hit = cache.get('flame');
  if (hit) return hit;
  const g = new THREE.BufferGeometry();
  const pos: number[] = [];
  const uv: number[] = [];
  const seed: number[] = [];
  const idx: number[] = [];
  const W = 0.07;
  const H = 0.26;
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI;
    const cx = Math.cos(a) * W;
    const cz = Math.sin(a) * W;
    const base = pos.length / 3;
    pos.push(-cx, 0, -cz, cx, 0, cz, cx, H, cz, -cx, H, -cz);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    seed.push(k, k, k, k);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('seed', new THREE.Float32BufferAttribute(seed, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  cache.set('flame', g);
  return g;
}
