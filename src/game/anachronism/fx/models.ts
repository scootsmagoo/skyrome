/**
 * The guns' geometry, procedural and cached, in real-world metres. One frame for all of them, the
 * frame of the avatar's right-hand grip socket (HumanoidAvatar `gripR`): the origin is the centre
 * of the fist round the pistol grip, +Y is the grip's axis pointing up (toward the sights), +Z is
 * the way the barrel points, +X the side. A gun parented to that socket sits in the hand as made.
 * Built with the equipment toolkit so they share the avatar material: a gun is one draw call.
 */
import * as THREE from 'three';
import { RigidBuilder } from '../../../actors/equipment/geom';
import { PATTERN, type Surf } from '../../../actors/avatar/SkinBuilder';
import { srgb } from '../../../actors/avatar/build/common';
import type { GunId } from '../types';

export type Vec3 = readonly [number, number, number];

export interface GunModel {
  geometry: THREE.BufferGeometry;
  /** Where the bullet (or the rocket) leaves, in the gun's frame. */
  muzzle: Vec3;
  /** The back of the weapon (the RPG's back-blast leaves here). */
  rear: Vec3;
  /** Two-handed guns: where the left fist wraps, and which way its axis runs (along the barrel, or up a vertical grip). */
  support: { pos: Vec3; axis: 'barrel' | 'up' } | null;
  /** Where the shoulder takes the gun's weight relative to the pistol grip (for placing the grip from the shoulder), metres behind it. */
  stockLength: number;
  /** The (hip) pose of the right fist in the camera's frame (m: right, up, forward) and the aimed one. */
  fp: { hip: Vec3; aim: Vec3 };
  /** The right fist from the right shoulder in the third-person pose (m along right, up, aim). */
  tp: { hip: Vec3; aim: Vec3 };
  /** Roll of the grip axis away from the aim's up (radians), e.g. the pistol's slight rake. */
  rake: number;
}

const surf = (rough: number, metal: number): Surf => ({ rough, metal, pattern: PATTERN.none, emissive: 0 });
const STEEL = srgb('#3a3d41');
const STEEL_LIGHT = srgb('#8c9096');
const BLUED = srgb('#202327');
const POLYMER = srgb('#1a1b1d');
const WOOD = srgb('#7a4524');
const WOOD_DARK = srgb('#4b2c18');
const OLIVE = srgb('#4e5a3c');
const BLACK = srgb('#0e0e0f');
const S_STEEL = surf(0.38, 0.85);
const S_BLUED = surf(0.3, 0.9);
const S_POLY = surf(0.62, 0.05);
const S_WOOD = surf(0.52, 0);
const S_PAINT = surf(0.55, 0.2);

const _m = new THREE.Matrix4();
const _r = new THREE.Matrix4();
const _t = new THREE.Matrix4();

/** Small helper over RigidBuilder: boxes and cylinders placed by centre, with rotations. */
class Parts {
  readonly rb = new RigidBuilder();

  private place(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number): THREE.Matrix4 {
    _t.makeTranslation(cx, cy, cz);
    _r.makeRotationFromEuler(new THREE.Euler(rx, ry, rz));
    return _m.copy(_t).multiply(_r);
  }

  box(c: Vec3, h: Vec3, col: THREE.Color, s: Surf, rx = 0, ry = 0, rz = 0) {
    const g = new THREE.BoxGeometry(h[0] * 2, h[1] * 2, h[2] * 2);
    this.rb.b.addGeometry(g, this.place(c[0], c[1], c[2], rx, ry, rz), col, [0, 1], s);
    g.dispose();
  }

  /** A cylinder (or cone) along Z from z0 to z1, radius r0 at z0 and r1 at z1, centred at (x, y). */
  zcyl(x: number, y: number, z0: number, z1: number, r0: number, r1: number, col: THREE.Color, s: Surf, seg = 12) {
    const len = z1 - z0;
    // CylinderGeometry runs along Y with radiusTop at +Y; turn +Y into +Z (rotation about X by +90 degrees).
    const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, false);
    this.rb.b.addGeometry(g, this.place(x, y, (z0 + z1) / 2, Math.PI / 2, 0, 0), col, [0, 1], s);
    g.dispose();
  }

  sphere(c: Vec3, r: Vec3, col: THREE.Color, s: Surf, seg = 10) {
    const g = new THREE.SphereGeometry(1, seg, Math.max(4, seg / 2));
    _m.makeScale(r[0], r[1], r[2]).setPosition(c[0], c[1], c[2]);
    this.rb.b.addGeometry(g, _m, col, [0, 1], s);
    g.dispose();
  }

  /** A box whose long axis follows a path point to point (for curved things); returns nothing. */
  build(name: string) {
    return this.rb.build(name);
  }
}

/** Trigger guard and trigger, shared by the guns: z of the trigger, y of the guard bottom. */
function trigger(p: Parts, z: number, y: number, col = BLUED) {
  p.box([0, y + 0.012, z], [0.0035, 0.011, 0.0035], col, S_BLUED);
  p.box([0, y - 0.004, z + 0.012], [0.0045, 0.0028, 0.026], col, S_BLUED);
  p.box([0, y + 0.008, z + 0.036], [0.0045, 0.014, 0.0028], col, S_BLUED);
}

function pistol(): GunModel {
  const p = new Parts();
  // Polymer frame and raked grip, steel slide, sights, and a magazine foot.
  p.box([0, -0.034, -0.004], [0.0135, 0.062, 0.0215], POLYMER, S_POLY, 0.2);
  p.box([0, -0.096, -0.021], [0.015, 0.007, 0.0235], POLYMER, S_POLY, 0.2);
  p.box([0, 0.024, 0.065], [0.0125, 0.009, 0.075], POLYMER, S_POLY);
  p.box([0, 0.053, 0.044], [0.0135, 0.0185, 0.097], STEEL, S_STEEL);
  p.box([0, 0.0715, 0.044], [0.0095, 0.0025, 0.095], BLUED, S_BLUED);
  p.zcyl(0, 0.052, 0.135, 0.153, 0.0055, 0.0055, BLACK, S_STEEL, 8);
  p.box([0, 0.075, -0.04], [0.0045, 0.004, 0.004], BLACK, S_STEEL);
  p.box([0, 0.075, 0.128], [0.0018, 0.004, 0.003], BLACK, S_STEEL);
  for (let i = 0; i < 5; i++) p.box([0.0138, 0.053, -0.035 + i * 0.006], [0.0006, 0.013, 0.0016], BLACK, S_STEEL);
  trigger(p, 0.034, 0.003, POLYMER);
  return {
    geometry: p.build('gun:pistol'),
    muzzle: [0, 0.052, 0.153],
    rear: [0, 0.05, -0.05],
    support: null,
    stockLength: 0.05,
    fp: { hip: [0.2, -0.2, 0.42], aim: [0.07, -0.1, 0.5] },
    tp: { hip: [0.05, -0.34, 0.36], aim: [0.04, -0.12, 0.55] },
    rake: 0.2,
  };
}

function rifle(): GunModel {
  const p = new Parts();
  // AK lines: stamped receiver with a dust cover, a long wooden stock, handguard and a gas tube over
  // a barrel with a muzzle brake, and the banana magazine.
  p.box([0, -0.047, -0.016], [0.0145, 0.056, 0.02], WOOD_DARK, S_WOOD, 0.34);
  p.box([0, 0.046, 0.06], [0.0195, 0.032, 0.17], STEEL, S_STEEL);
  p.box([0, 0.0825, 0.085], [0.0175, 0.008, 0.145], BLUED, S_BLUED);
  p.box([0, 0.093, 0.2], [0.012, 0.007, 0.05], BLUED, S_BLUED);
  p.box([0, 0.1, -0.078], [0.004, 0.0075, 0.012], BLACK, S_STEEL);
  // The stock: wooden, sloping away from the receiver to a flat butt plate.
  p.box([0, 0.028, -0.275], [0.0165, 0.041, 0.17], WOOD, S_WOOD, -0.07);
  p.box([0, 0.0, -0.446], [0.0175, 0.057, 0.0075], BLACK, S_STEEL, -0.07);
  // Handguards and the gas tube above the barrel.
  p.zcyl(0, 0.04, 0.23, 0.5, 0.028, 0.026, WOOD, S_WOOD, 10);
  p.zcyl(0, 0.084, 0.27, 0.51, 0.011, 0.011, BLUED, S_BLUED, 8);
  p.box([0, 0.074, 0.514], [0.013, 0.017, 0.012], BLUED, S_BLUED);
  p.zcyl(0, 0.046, 0.5, 0.79, 0.0085, 0.0085, STEEL, S_STEEL, 10);
  p.zcyl(0, 0.046, 0.79, 0.84, 0.0125, 0.0125, BLACK, S_STEEL, 10);
  p.box([0, 0.075, 0.795], [0.0025, 0.013, 0.003], BLACK, S_STEEL);
  // The curved magazine, a few steps of an arc leaning forward.
  let mz = 0.115;
  let my = 0.02;
  for (let i = 0; i < 5; i++) {
    const psi = 0.12 + i * 0.17;
    const len = 0.052;
    const cz = mz + (Math.sin(psi) * len) / 2;
    const cy = my - (Math.cos(psi) * len) / 2;
    p.box([0, cy, cz], [0.0125, len / 2 + 0.002, 0.0215], i === 4 ? BLUED : STEEL, S_STEEL, -psi);
    mz += Math.sin(psi) * len;
    my -= Math.cos(psi) * len;
  }
  trigger(p, 0.03, -0.001);
  return {
    geometry: p.build('gun:rifle'),
    muzzle: [0, 0.046, 0.84],
    rear: [0, 0.03, -0.45],
    support: { pos: [0, 0.04, 0.27], axis: 'barrel' },
    stockLength: 0.43,
    fp: { hip: [0.2, -0.28, 0.34], aim: [0.03, -0.17, 0.3] },
    tp: { hip: [-0.04, -0.3, 0.3], aim: [-0.08, -0.14, 0.38] },
    rake: 0.34,
  };
}

function shotgun(): GunModel {
  const p = new Parts();
  // A pump gun: a blued barrel over a magazine tube, a wooden forend that slides, a wooden stock.
  p.box([0, -0.04, -0.012], [0.0145, 0.052, 0.02], WOOD_DARK, S_WOOD, 0.3);
  p.box([0, 0.043, 0.085], [0.0185, 0.031, 0.115], BLUED, S_BLUED);
  p.box([0.0188, 0.052, 0.07], [0.0008, 0.011, 0.03], BLACK, S_STEEL);
  p.box([0, 0.026, -0.3], [0.0165, 0.044, 0.19], WOOD, S_WOOD, -0.09);
  p.box([0, -0.005, -0.495], [0.0175, 0.057, 0.0075], BLACK, S_STEEL, -0.09);
  p.zcyl(0, 0.056, 0.2, 0.82, 0.0125, 0.0125, BLUED, S_BLUED, 12);
  p.zcyl(0, 0.026, 0.2, 0.7, 0.0105, 0.0105, STEEL, S_STEEL, 10);
  p.zcyl(0, 0.026, 0.33, 0.5, 0.027, 0.027, WOOD, S_WOOD, 12);
  p.zcyl(0, 0.056, 0.2, 0.82, 0.0035, 0.0035, STEEL_LIGHT, S_STEEL, 6);
  p.sphere([0, 0.071, 0.81], [0.003, 0.003, 0.003], STEEL_LIGHT, S_STEEL, 6);
  trigger(p, 0.032, -0.002);
  return {
    geometry: p.build('gun:shotgun'),
    muzzle: [0, 0.056, 0.82],
    rear: [0, 0.03, -0.5],
    support: { pos: [0, 0.026, 0.34], axis: 'barrel' },
    stockLength: 0.49,
    fp: { hip: [0.2, -0.28, 0.34], aim: [0.03, -0.17, 0.3] },
    tp: { hip: [-0.04, -0.3, 0.3], aim: [-0.08, -0.14, 0.38] },
    rake: 0.3,
  };
}

/** The PG-7 style warhead along +Z, drawn from z0 (its base) and returning z at its tip. */
function warhead(p: Parts, x: number, y: number, z0: number): number {
  p.zcyl(x, y, z0, z0 + 0.14, 0.0215, 0.0215, OLIVE, S_PAINT, 12);
  p.zcyl(x, y, z0 + 0.14, z0 + 0.2, 0.0215, 0.042, OLIVE, S_PAINT, 14);
  p.zcyl(x, y, z0 + 0.2, z0 + 0.3, 0.042, 0.042, OLIVE, S_PAINT, 16);
  p.zcyl(x, y, z0 + 0.3, z0 + 0.46, 0.042, 0.0065, OLIVE, S_PAINT, 16);
  p.zcyl(x, y, z0 + 0.46, z0 + 0.5, 0.0065, 0.0065, BLACK, S_STEEL, 8);
  p.zcyl(x, y, z0 + 0.255, z0 + 0.275, 0.0435, 0.0435, BLACK, S_PAINT, 16);
  return z0 + 0.5;
}

function rpg(): GunModel {
  const p = new Parts();
  const ty = 0.085;
  // Rear pistol grip and trigger group under the tube.
  p.box([0, -0.047, -0.016], [0.0145, 0.056, 0.02], WOOD_DARK, S_WOOD, 0.3);
  p.box([0, 0.018, 0.0], [0.016, 0.02, 0.04], STEEL, S_STEEL);
  trigger(p, 0.02, 0.0);
  // The launch tube: a steel tube with a flared exhaust, wooden heat shield, and a front handgrip.
  p.zcyl(0, ty, -0.17, -0.08, 0.038, 0.0235, STEEL, S_STEEL, 14);
  p.zcyl(0, ty, -0.08, 0.72, 0.0235, 0.0235, STEEL, S_STEEL, 14);
  p.zcyl(0, ty, 0.05, 0.5, 0.0315, 0.0315, WOOD, S_WOOD, 14);
  p.zcyl(0, ty, 0.46, 0.72, 0.0275, 0.0245, STEEL, S_STEEL, 14);
  p.box([0, 0.0, 0.3], [0.011, 0.055, 0.016], WOOD_DARK, S_WOOD);
  p.box([0, 0.04, 0.3], [0.013, 0.012, 0.022], STEEL, S_STEEL);
  // The optical sight bracketed on the left, and a rear sight.
  p.box([0.04, ty + 0.03, 0.14], [0.012, 0.02, 0.05], BLACK, S_POLY);
  p.box([0.03, ty + 0.012, 0.14], [0.012, 0.004, 0.02], STEEL, S_STEEL);
  p.box([0, ty + 0.043, 0.2], [0.0025, 0.012, 0.004], BLACK, S_STEEL);
  // The grenade in the muzzle.
  const tip = warhead(p, 0, ty, 0.64);
  return {
    geometry: p.build('gun:rpg'),
    muzzle: [0, ty, tip],
    rear: [0, ty, -0.18],
    support: { pos: [0, 0.0, 0.3], axis: 'up' },
    stockLength: 0.25,
    fp: { hip: [0.22, -0.26, 0.36], aim: [0.1, -0.14, 0.34] },
    tp: { hip: [-0.02, -0.26, 0.2], aim: [-0.06, -0.1, 0.3] },
    rake: 0.3,
  };
}

/** The rocket in flight: the warhead on its stabiliser, centred, nose along +Z (a little over half a metre). */
function rocketGeometry(): THREE.BufferGeometry {
  const p = new Parts();
  const tip = warhead(p, 0, 0, -0.3);
  // The stabiliser: a thin tail boom with four fins.
  p.zcyl(0, 0, -0.52, -0.3, 0.012, 0.0215, STEEL, S_STEEL, 8);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const c = Math.cos(a);
    const s = Math.sin(a);
    p.box([c * 0.03, s * 0.03, -0.5], [0.0035 + Math.abs(c) * 0.026, 0.0035 + Math.abs(s) * 0.026, 0.035], STEEL, S_STEEL, 0, 0, 0);
  }
  void tip;
  return p.build('gun:rocket');
}

const cache = new Map<string, GunModel>();

export function gunModel(id: GunId): GunModel {
  let m = cache.get(id);
  if (!m) {
    m = id === 'pistol' ? pistol() : id === 'rifle' ? rifle() : id === 'shotgun' ? shotgun() : rpg();
    cache.set(id, m);
  }
  return m;
}

let rocket: THREE.BufferGeometry | null = null;
export function rocketModel(): THREE.BufferGeometry {
  return (rocket ??= rocketGeometry());
}
/** Length of the rocket model's tail behind its centre (m): where the flame starts. */
export const ROCKET_TAIL = 0.52;
