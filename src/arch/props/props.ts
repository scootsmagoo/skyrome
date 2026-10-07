/**
 * Procedural props of daily Roman life. Every prop is built in its own local frame: origin on the
 * ground at the prop's centre (wall-mounted props: origin at the mounting point on the wall surface),
 * front facing −z, meters 1:1.
 *
 *   makeProp('amphora_tall', rng)            → { parts: [{ material, geometry }], colliders, ... }
 *   placeProp(draw, 'dolium', x, y, z, rotY)  → merges into a MeshBuilder (static city blocks)
 *   PropScatter                                → many instances (one InstancedMesh per kind+material)
 *
 * Variants: each kind has `PROP_VARIANTS` seeded variants; models are cached per (kind, variant).
 */
import * as THREE from 'three';
import { AUDIT, currentAuditSource } from '../../dev/audit/geomAudit';
import { Rng, hashString } from '../../core/Rng';
import { MeshBuilder, transformCollider, type ColliderSpec } from '../../gfx/MeshBuilder';
import type { MaterialId } from '../../gfx/materialIds';
import { Draw } from '../fabric/draw';
import { lathe, sackGeometry } from './shapes';

export const PROP_KINDS = [
  'amphora_globular', 'amphora_tall', 'amphora_stack', 'amphora_rack', 'dolium', 'crate', 'sack', 'basket',
  'cart', 'handcart', 'litter',
  'stall_fruit', 'stall_fish', 'stall_pottery', 'stall_cloth',
  'table', 'table_marble', 'bench', 'bench_masonry', 'stool', 'shelf',
  'brazier', 'oil_lamp', 'lampstand', 'torch_bracket',
  'altar', 'herm', 'milestone', 'statue_pedestal', 'puteal', 'trough', 'signboard',
  'anvil', 'forge', 'loom', 'grain_mill', 'oven', 'vat', 'waterspout', 'chopping_block',
] as const;

/** `stall` picks one of the four stall kinds at random. */
export type PropKind = (typeof PROP_KINDS)[number] | 'stall';

export const PROP_VARIANTS = 3;

export interface PropModel {
  kind: PropKind;
  variant: number;
  /** One merged geometry per material (local frame). Shared — do not dispose or mutate. */
  parts: { material: MaterialId; geometry: THREE.BufferGeometry; castShadow: boolean }[];
  colliders: ColliderSpec[];
  /** Local bounding box. */
  bounds: THREE.Box3;
}

type Builder = (d: Draw, r: Rng, variant: number) => void;

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ amphorae & storage

// Lathe profiles are kept to ~10 points and 6–8 segments: amphorae are repeated by the hundred in
// shop racks, stacks and carts, so each one stays around 130–180 triangles.
const DRESSEL20: [number, number][] = [
  [0, 0], [0.045, 0.02], [0.15, 0.09], [0.27, 0.2], [0.305, 0.34], [0.27, 0.5], [0.16, 0.6], [0.075, 0.66], [0.07, 0.72], [0.095, 0.77], [0.06, 0.78],
];
const DRESSEL2_4: [number, number][] = [
  [0, 0], [0.03, 0.03], [0.032, 0.14], [0.11, 0.3], [0.15, 0.45], [0.15, 0.62], [0.11, 0.72], [0.045, 0.77], [0.04, 0.95], [0.055, 0.99], [0.03, 1.0],
];
const DOLIUM: [number, number][] = [
  [0, 0], [0.25, 0], [0.45, 0.1], [0.6, 0.35], [0.65, 0.6], [0.6, 0.9], [0.48, 1.1], [0.36, 1.2], [0.42, 1.28], [0.3, 1.24],
];

export function amphoraGlobular(d: Draw) {
  d.geo(lathe('d20', DRESSEL20, 8), 'terracotta');
  for (const s of [-1, 1]) {
    d.rod('terracotta', V(s * 0.19, 0.57, 0), V(s * 0.215, 0.66, 0), 0.026, 4, { open: true });
    d.rod('terracotta', V(s * 0.215, 0.66, 0), V(s * 0.08, 0.7, 0), 0.026, 4, { open: true });
  }
}

export function amphoraTall(d: Draw) {
  d.geo(lathe('d24', DRESSEL2_4, 6), 'terracotta');
  for (const s of [-1, 1]) {
    d.rod('terracotta', V(s * 0.11, 0.72, 0), V(s * 0.1, 0.925, 0), 0.016, 3, { open: true });
    d.rod('terracotta', V(s * 0.1, 0.925, 0), V(s * 0.045, 0.935, 0), 0.016, 3, { open: true });
  }
}

const amphora_globular: Builder = (d) => {
  amphoraGlobular(d);
  d.solidCyl(0, 0.39, 0, 0.28, 0.78);
};
const amphora_tall: Builder = (d) => {
  amphoraTall(d);
  d.solidCyl(0, 0.5, 0, 0.14, 1.0);
};

/** An amphora lying along z (centred), for stacks and cart loads. */
function lyingAmphora(d: Draw, x: number, y: number, z: number, flip: boolean) {
  amphoraTall(d.at(x, y, z, flip ? Math.PI : 0).sub(new THREE.Matrix4().makeTranslation(0, 0, -0.5).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))));
}

/** Amphorae lying in a pyramid stack (3-2-1). */
const amphora_stack: Builder = (d) => {
  [3, 2, 1].forEach((n, row) => {
    for (let i = 0; i < n; i++) lyingAmphora(d, (i - (n - 1) / 2) * 0.31, 0.15 + row * 0.26, 0, (i + row) % 2 === 1);
  });
  d.solid(-0.5, 0, -0.55, 0.5, 0.75, 0.55);
};

const amphora_rack: Builder = (d, r) => {
  const w = 1.7;
  for (const x of [-w / 2, w / 2]) {
    d.span('wood_dark', x - 0.04, 0, -0.25, x + 0.04, 1.3, -0.17);
    d.span('wood_dark', x - 0.04, 0, 0.17, x + 0.04, 1.3, 0.25);
  }
  for (const y of [0.06, 0.62, 1.22]) for (const z of [-0.21, 0.21]) d.span('wood', -w / 2, y, z - 0.035, w / 2, y + 0.07, z + 0.035);
  for (const [y0, n] of [[0.1, 5], [0.66, 5]] as const) {
    for (let i = 0; i < n; i++) {
      if (r.chance(0.12)) continue;
      const x = -w / 2 + 0.2 + i * ((w - 0.4) / (n - 1));
      amphoraTall(d.sub(new THREE.Matrix4().makeRotationX(0.22).setPosition(x, y0, -0.05)));
    }
  }
  d.solid(-w / 2 - 0.05, 0, -0.3, w / 2 + 0.05, 1.3, 0.3);
};

const dolium: Builder = (d, r, v) => {
  const s = 0.85 + v * 0.1;
  d.geo(lathe('dolium', DOLIUM, 10), 'terracotta', 0, 0, 0, { sx: s, sy: s, sz: s });
  d.cyl('black', 0, 1.215 * s, 0, 0.31 * s, 0.01, 10, { shadow: false });
  if (r.chance(0.5)) d.cyl('wood', 0, 1.3 * s, 0, 0.44 * s, 0.04, 10); // wooden lid
  d.solidCyl(0, 0.65 * s, 0, 0.62 * s, 1.3 * s);
};

const crate: Builder = (d, r, v) => {
  const w = 0.6 + v * 0.08, h = 0.42, dd = 0.45;
  d.span('wood', -w / 2 + 0.02, 0.02, -dd / 2 + 0.02, w / 2 - 0.02, h - 0.02, dd / 2 - 0.02);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) d.span('wood_dark', sx * w / 2 - 0.025, 0, sz * dd / 2 - 0.025, sx * w / 2 + 0.025, h, sz * dd / 2 + 0.025);
  for (const y of [0.02, h / 2, h - 0.03]) {
    d.span('wood_dark', -w / 2, y - 0.02, -dd / 2 - 0.015, w / 2, y + 0.02, -dd / 2 + 0.01, { shadow: false });
    d.span('wood_dark', -w / 2, y - 0.02, dd / 2 - 0.01, w / 2, y + 0.02, dd / 2 + 0.015, { shadow: false });
  }
  if (v === 2) produce(d, 0, h - 0.02, 0, w - 0.1, dd - 0.1, r, 0.06);
  d.solid(-w / 2, 0, -dd / 2, w / 2, h, dd / 2);
};

const sack: Builder = (d, r, v) => {
  const mat: MaterialId = v === 1 ? 'fabric_white' : 'fabric_ochre';
  d.geo(sackGeometry(), mat, 0, 0, 0, { ry: r.range(0, Math.PI * 2), sy: 0.9 + v * 0.1 });
};

/** Wicker basket (< 200 triangles): a low lathe, a heap of produce or loaves, a bent handle. */
const basket: Builder = (d, r, v) => {
  d.geo(lathe('basket', [[0, 0.02], [0.18, 0], [0.25, 0.22], [0.235, 0.235], [0.2, 0.07], [0, 0.07]], 7), 'wood');
  if (v === 0) {
    // A mound with a few fruit standing out of it.
    const [mat] = r.pick(PRODUCE);
    d.ellipsoid(mat, 0, 0.17, 0, 0.19, 0.07, 0.19, { seg: [7, 3], shadow: false });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + r.range(0, 1);
      d.ellipsoid(mat, Math.cos(a) * 0.08, 0.22, Math.sin(a) * 0.08, 0.05, 0.045, 0.05, { seg: [5, 3], shadow: false });
    }
  } else if (v === 1) {
    for (let i = 0; i < 3; i++) d.ellipsoid('plaster_ochre', Math.cos(i * 2.1) * 0.08, 0.2, Math.sin(i * 2.1) * 0.08, 0.095, 0.042, 0.095, { seg: [6, 3] });
  }
  if (v !== 2) d.geo(handleGeo, 'wood_dark', 0, 0.23, 0, { shadow: false });
};
const handleGeo = new THREE.TorusGeometry(0.22, 0.012, 3, 6, Math.PI);

/** Produce colours (material) and fruit radius. */
const PRODUCE: [MaterialId, number][] = [['fabric_red', 0.05], ['marble_giallo', 0.05], ['fabric_purple', 0.035], ['foliage_olive', 0.08], ['plaster_ochre', 0.045]];

/** A heap of fruit / vegetables in a w×d area at height y (cheap low-poly spheres). */
export function produce(d: Draw, x: number, y: number, z: number, w: number, dd: number, r: Rng, size = 0.05, domed = false) {
  const [mat, rad0] = r.pick(PRODUCE);
  const rad = rad0 * (size / 0.05);
  const nx = Math.max(1, Math.floor(w / (rad * 2))), nz = Math.max(1, Math.floor(dd / (rad * 2)));
  for (let i = 0; i < nx; i++)
    for (let k = 0; k < nz; k++) {
      const px = x - w / 2 + rad + i * rad * 2 + r.range(-0.01, 0.01);
      const pz = z - dd / 2 + rad + k * rad * 2 + r.range(-0.01, 0.01);
      const cx = (i - (nx - 1) / 2) / Math.max(1, nx / 2), cz = (k - (nz - 1) / 2) / Math.max(1, nz / 2);
      const lift = domed ? Math.max(0, 1 - (cx * cx + cz * cz)) * rad * 1.6 : 0;
      d.ellipsoid(mat, px, y + rad * 0.8 + lift, pz, rad, rad * 0.9, rad, { seg: [5, 3], shadow: false });
    }
}

// ------------------------------------------------------------------ vehicles

function solidWheel(d: Draw, x: number, y: number, z: number, rad: number, thick: number) {
  d.cyl('wood_dark', x, y, z, rad, thick, 12, { rz: Math.PI / 2 });
  d.geo(new THREE.TorusGeometry(rad, 0.03, 3, 12), 'iron', x, y, z, { ry: Math.PI / 2, shadow: false });
  d.cyl('wood', x, y, z, 0.12, thick + 0.1, 6, { rz: Math.PI / 2 });
}

function spokedWheel(d: Draw, x: number, y: number, z: number, rad: number) {
  d.geo(new THREE.TorusGeometry(rad, 0.035, 3, 14), 'wood_dark', x, y, z, { ry: Math.PI / 2 });
  d.cyl('wood', x, y, z, 0.07, 0.16, 6, { rz: Math.PI / 2 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    d.rod('wood', V(x, y, z), V(x, y + Math.sin(a) * rad, z + Math.cos(a) * rad), 0.018, 3, { shadow: false, open: true });
  }
}

const cart: Builder = (d, r, v) => {
  const bedY = 0.95, bw = 1.3, bl = 2.1;
  solidWheel(d, -0.78, 0.55, 0.15, 0.55, 0.12);
  solidWheel(d, 0.78, 0.55, 0.15, 0.55, 0.12);
  d.cyl('wood_dark', 0, 0.55, 0.15, 0.06, 1.75, 6, { rz: Math.PI / 2 });
  d.span('wood', -bw / 2, bedY - 0.08, -bl / 2, bw / 2, bedY, bl / 2);
  for (const sx of [-1, 1]) {
    d.span('wood', sx * bw / 2 - 0.03, bedY, -bl / 2, sx * bw / 2 + 0.03, bedY + 0.32, bl / 2);
    for (const z of [-bl / 2 + 0.1, 0, bl / 2 - 0.1]) d.span('wood_dark', sx * bw / 2 - 0.05, bedY - 0.05, z - 0.04, sx * bw / 2 + 0.05, bedY + 0.36, z + 0.04, { shadow: false });
  }
  d.span('wood', -bw / 2, bedY, bl / 2 - 0.03, bw / 2, bedY + 0.25, bl / 2 + 0.03);
  // Pole (temo) and yoke toward −z.
  d.rod('wood_dark', V(0, bedY - 0.1, -bl / 2 + 0.3), V(0, 0.72, -bl / 2 - 2.3), 0.06, 6);
  d.span('wood_dark', -0.7, 0.68, -bl / 2 - 2.25, 0.7, 0.8, -bl / 2 - 2.1);
  // Load.
  if (v === 0) {
    for (let i = 0; i < 6; i++) lyingAmphora(d, -0.42 + (i % 3) * 0.42, bedY + 0.15, -0.5 + Math.floor(i / 3) * 1.0, i % 2 === 1);
  } else if (v === 1) {
    for (let i = 0; i < 7; i++) d.geo(sackGeometry(), r.chance(0.5) ? 'fabric_ochre' : 'fabric_white', r.range(-0.4, 0.4), bedY, r.range(-0.8, 0.8), { rx: Math.PI / 2 - 0.2, ry: r.range(0, 6.28), sy: 0.9 });
  }
  d.solid(-0.9, 0, -bl / 2, 0.9, bedY + 0.35, bl / 2);
};

const handcart: Builder = (d, r, v) => {
  const bedY = 0.62;
  spokedWheel(d, -0.42, 0.4, 0, 0.4);
  spokedWheel(d, 0.42, 0.4, 0, 0.4);
  d.cyl('iron', 0, 0.4, 0, 0.025, 0.95, 6, { rz: Math.PI / 2 });
  d.span('wood', -0.36, bedY - 0.05, -0.55, 0.36, bedY, 0.55);
  for (const sx of [-1, 1]) {
    d.span('wood', sx * 0.36 - 0.025, bedY, -0.55, sx * 0.36 + 0.025, bedY + 0.22, 0.55);
    d.rod('wood_dark', V(sx * 0.3, bedY - 0.05, 0.4), V(sx * 0.3, 0.85, 1.45), 0.03, 5);
  }
  d.rod('wood_dark', V(0, bedY - 0.05, -0.45), V(0, 0, -0.55), 0.03, 5);
  if (v === 0) {
    basket(d.at(-0.15, bedY, -0.2), r, 0);
    basket(d.at(0.15, bedY, 0.25), r, 1);
  } else if (v === 1) {
    for (let i = 0; i < 3; i++) d.geo(sackGeometry(), 'fabric_ochre', r.range(-0.15, 0.15), bedY, -0.3 + i * 0.3, { rx: Math.PI / 2, sy: 0.75 });
  }
  d.solid(-0.5, 0, -0.6, 0.5, 0.9, 0.6);
};

const litter: Builder = (d, r, v) => {
  const cloth: MaterialId = v === 0 ? 'fabric_purple' : v === 1 ? 'fabric_red' : 'fabric_blue';
  d.span('wood_painted', -0.45, 0.42, -1.05, 0.45, 0.62, 1.05);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) d.span('wood_dark', sx * 0.4 - 0.04, 0, sz * 0.95 - 0.04, sx * 0.4 + 0.04, 0.42, sz * 0.95 + 0.04);
  d.span('fabric_white', -0.42, 0.62, -1.0, 0.42, 0.76, 1.0);
  d.ellipsoid(cloth, 0, 0.82, 0.8, 0.32, 0.1, 0.16, { seg: [10, 6] });
  d.ellipsoid(cloth, 0.15, 0.8, 0.45, 0.14, 0.08, 0.12, { seg: [8, 5] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) d.cyl('wood_painted', sx * 0.43, 1.25, sz * 1.02, 0.03, 1.26, 6);
  d.span(cloth, -0.5, 1.86, -1.08, 0.5, 1.92, 1.08);
  d.span('gilded_bronze', -0.52, 1.82, -1.1, 0.52, 1.86, 1.1, { shadow: false });
  // Curtains gathered at the corners, one side half drawn.
  for (const sx of [-1, 1]) {
    d.span(cloth, sx * 0.46 - 0.01, 0.8, -1.05, sx * 0.46 + 0.01, 1.82, -0.75);
    d.span(cloth, sx * 0.46 - 0.01, 0.8, 0.7, sx * 0.46 + 0.01, 1.82, 1.05);
    if (sx > 0) d.span('fabric_white', sx * 0.46 - 0.008, 0.85, -0.75, sx * 0.46 + 0.008, 1.82, 0.7, { shadow: false });
  }
  for (const sx of [-1, 1]) d.rod('wood_dark', V(sx * 0.52, 0.55, -2.1), V(sx * 0.52, 0.55, 2.1), 0.035, 6);
  void r;
  d.solid(-0.55, 0, -1.1, 0.55, 1.95, 1.1);
};

// ------------------------------------------------------------------ market stalls

const STALL_STRIPES: [MaterialId, MaterialId][] = [['fabric_white', 'fabric_red'], ['fabric_white', 'fabric_blue'], ['fabric_ochre', 'fabric_red']];

/** Striped, slightly sagging awning between corners (local), stripes run front→back. */
export function stripedAwning(d: Draw, x0: number, x1: number, zf: number, zb: number, yf: number, yb: number, mats: [MaterialId, MaterialId], valance = true) {
  const n = Math.max(2, Math.round((x1 - x0) / 0.32));
  const sw = (x1 - x0) / n;
  const segs = 4;
  for (let i = 0; i < n; i++) {
    const a = x0 + i * sw, b = a + sw;
    const pos: number[] = [];
    for (let k = 0; k < segs; k++) {
      const t0 = k / segs, t1 = (k + 1) / segs;
      const sag = (t: number) => -Math.sin(t * Math.PI) * 0.06;
      const z0 = zf + (zb - zf) * t0, z1 = zf + (zb - zf) * t1;
      const y0 = yf + (yb - yf) * t0 + sag(t0), y1 = yf + (yb - yf) * t1 + sag(t1);
      // top face (double-sided via two windings)
      pos.push(a, y0, z0, b, y0, z0, b, y1, z1, a, y0, z0, b, y1, z1, a, y1, z1);
      pos.push(a, y0, z0, b, y1, z1, b, y0, z0, a, y0, z0, a, y1, z1, b, y1, z1);
    }
    if (valance) {
      // Scalloped front edge hanging down.
      const m = (a + b) / 2;
      pos.push(a, yf, zf, m, yf - 0.2, zf, b, yf, zf, a, yf, zf, b, yf, zf, m, yf - 0.2, zf);
    }
    d.tris(mats[i % 2], pos, { shadow: true });
  }
}

function stallFrame(d: Draw, r: Rng, v: number) {
  const w = 2.3, dd = 1.0, top = 0.85;
  d.span('wood', -w / 2, top - 0.05, -dd / 2, w / 2, top, dd / 2);
  d.span('wood_painted', -w / 2, 0.25, -dd / 2 - 0.02, w / 2, top - 0.05, -dd / 2 + 0.01);
  for (const sx of [-1, 1]) {
    d.span('wood_dark', sx * (w / 2 - 0.15) - 0.03, 0, -dd / 2 + 0.05, sx * (w / 2 - 0.15) + 0.03, top - 0.05, dd / 2 - 0.05);
    d.cyl('wood', sx * (w / 2 + 0.05), 1.15, -dd / 2 - 0.35, 0.04, 2.3, 6);
    d.cyl('wood', sx * (w / 2 + 0.05), 1.3, dd / 2 + 0.05, 0.04, 2.6, 6);
  }
  stripedAwning(d, -w / 2 - 0.1, w / 2 + 0.1, -dd / 2 - 0.45, dd / 2 + 0.1, 2.25, 2.62, STALL_STRIPES[v % STALL_STRIPES.length]);
  void r;
  d.solid(-w / 2 - 0.1, 0, -dd / 2 - 0.05, w / 2 + 0.1, top + 0.2, dd / 2 + 0.1);
}

const stall_fruit: Builder = (d, r, v) => {
  stallFrame(d, r, v);
  for (let i = 0; i < 4; i++) {
    const x = -0.85 + i * 0.57;
    d.span('wood', x - 0.25, 0.85, -0.38, x + 0.25, 0.93, 0.05);
    produce(d, x, 0.92, -0.16, 0.44, 0.36, r.fork(i), 0.05, true);
  }
  basket(d.at(-0.6, 0, -0.9), r, 0);
  basket(d.at(0.7, 0, -0.85), r, 0);
  crate(d.at(0.5, 0.85, 0.3), r, 2);
};

const stall_fish: Builder = (d, r, v) => {
  stallFrame(d, r, v);
  d.span('marble_veined', -1.05, 0.85, -0.45, 1.05, 0.9, 0.4);
  for (let i = 0; i < 12; i++) {
    const x = -0.9 + (i % 6) * 0.36, z = -0.25 + Math.floor(i / 6) * 0.35;
    const ry = r.range(-0.4, 0.4) + (i % 2 ? 0.1 : -0.1);
    const s = r.range(0.8, 1.3);
    d.ellipsoid('lead', x, 0.93, z, 0.14 * s, 0.03 * s, 0.045 * s, { ry, seg: [8, 4], shadow: false });
    d.box('lead', x + Math.cos(ry) * 0.16 * s, 0.93, z - Math.sin(ry) * 0.16 * s, 0.06 * s, 0.015, 0.08 * s, { ry, shadow: false });
  }
  d.cyl('wood', 0.75, 0.22, -0.85, 0.22, 0.44, 10, { rTop: 0.25 });
  d.cyl('water', 0.75, 0.4, -0.85, 0.235, 0.02, 10, { shadow: false });
};

export function jug(d: Draw, x: number, y: number, z: number, s = 1, mat: MaterialId = 'terracotta') {
  d.geo(lathe('jug', [[0, 0], [0.07, 0.02], [0.085, 0.11], [0.06, 0.2], [0.035, 0.24], [0.04, 0.28], [0, 0.28]], 7), mat, x, y, z, { sx: s, sy: s, sz: s, shadow: false });
}
export function bowl(d: Draw, x: number, y: number, z: number, s = 1, mat: MaterialId = 'plaster_red') {
  d.geo(lathe('bowl', [[0, 0], [0.06, 0.01], [0.12, 0.08], [0.105, 0.08], [0.05, 0.025], [0, 0.025]], 8), mat, x, y, z, { sx: s, sy: s, sz: s, shadow: false });
}
/** A stack of three nested bowls as one lathe (pottery stalls). */
export function bowlStack(d: Draw, x: number, y: number, z: number, s = 1, mat: MaterialId = 'plaster_red') {
  d.geo(lathe('bowls', [[0, 0], [0.06, 0.01], [0.115, 0.07], [0.11, 0.085], [0.12, 0.1], [0.115, 0.115], [0.125, 0.13], [0.11, 0.13], [0, 0.1]], 8), mat, x, y, z, { sx: s, sy: s, sz: s, shadow: false });
}

const stall_pottery: Builder = (d, r, v) => {
  stallFrame(d, r, v);
  for (let i = 0; i < 7; i++) jug(d, -0.95 + i * 0.3, 0.85, -0.25 + (i % 2) * 0.2, r.range(0.9, 1.4), r.chance(0.3) ? 'black' : 'terracotta');
  for (let i = 0; i < 6; i++) bowlStack(d, -0.9 + i * 0.36, 0.85, 0.22, 1, 'plaster_red');
  for (let i = 0; i < 3; i++) amphoraTall(d.at(-0.7 + i * 0.7, 0, 0.75).sub(new THREE.Matrix4().makeScale(0.7, 0.7, 0.7)));
};

const stall_cloth: Builder = (d, r, v) => {
  stallFrame(d, r, v);
  const mats: MaterialId[] = ['fabric_red', 'fabric_blue', 'fabric_ochre', 'fabric_purple', 'fabric_white'];
  for (let i = 0; i < 6; i++) {
    const x = -0.85 + (i % 3) * 0.6, z = -0.2 + Math.floor(i / 3) * 0.4;
    let y = 0.85;
    for (let k = 0; k < 3; k++) {
      const h = 0.07;
      d.box(r.pick(mats), x + r.range(-0.03, 0.03), y + h / 2, z, 0.5, h, 0.32, { ry: r.range(-0.05, 0.05), shadow: false });
      y += h;
    }
  }
  // Hanging lengths of cloth from a rail under the awning.
  d.rod('wood_dark', V(-1.2, 2.05, -0.75), V(1.2, 2.05, -0.75), 0.025, 5);
  for (let i = 0; i < 4; i++) d.span(r.pick(mats), -1.0 + i * 0.55, 1.15, -0.76, -0.6 + i * 0.55, 2.05, -0.74);
};

// ------------------------------------------------------------------ furniture

const table: Builder = (d, r, v) => {
  const w = 1.2 + v * 0.15, dd = 0.7;
  d.span('wood', -w / 2, 0.71, -dd / 2, w / 2, 0.76, dd / 2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) d.span('wood_dark', sx * (w / 2 - 0.08) - 0.03, 0, sz * (dd / 2 - 0.08) - 0.03, sx * (w / 2 - 0.08) + 0.03, 0.71, sz * (dd / 2 - 0.08) + 0.03);
  if (v === 1) { jug(d, -0.3, 0.76, 0); bowl(d, 0.2, 0.76, 0.1); }
  if (v === 2) oilLamp(d.at(0.35, 0.76, -0.1));
  void r;
  d.solid(-w / 2, 0, -dd / 2, w / 2, 0.76, dd / 2);
};

const table_marble: Builder = (d) => {
  d.span('marble', -0.75, 0.8, -0.4, 0.75, 0.86, 0.4);
  for (const sx of [-1, 1]) {
    d.span('marble', sx * 0.55 - 0.06, 0, -0.3, sx * 0.55 + 0.06, 0.8, 0.3);
    d.span('marble', sx * 0.55 - 0.09, 0, -0.34, sx * 0.55 + 0.09, 0.08, 0.34, { shadow: false });
  }
  d.solid(-0.75, 0, -0.4, 0.75, 0.86, 0.4);
};

const bench: Builder = (d, r, v) => {
  const w = 1.5 + v * 0.2;
  d.span('wood', -w / 2, 0.42, -0.17, w / 2, 0.47, 0.17);
  for (const x of [-w / 2 + 0.15, w / 2 - 0.15]) d.span('wood_dark', x - 0.03, 0, -0.14, x + 0.03, 0.42, 0.14);
  void r;
  d.solid(-w / 2, 0, -0.17, w / 2, 0.47, 0.17);
};

const bench_masonry: Builder = (d, r, v) => {
  const w = 1.8 + v * 0.3;
  d.span(v === 1 ? 'plaster_red' : 'plaster_white', -w / 2, 0, -0.22, w / 2, 0.42, 0.22);
  d.span('travertine', -w / 2 - 0.03, 0.42, -0.26, w / 2 + 0.03, 0.48, 0.24);
  void r;
  d.solid(-w / 2, 0, -0.25, w / 2, 0.48, 0.25);
};

const stool: Builder = (d, r, v) => {
  if (v === 2) {
    // Folding sella with X legs.
    d.span('fabric_red', -0.25, 0.45, -0.2, 0.25, 0.48, 0.2);
    for (const sz of [-1, 1]) {
      d.rod('bronze', V(-0.22, 0, sz * 0.18), V(0.22, 0.45, sz * 0.18), 0.018, 5);
      d.rod('bronze', V(0.22, 0, sz * 0.18), V(-0.22, 0.45, sz * 0.18), 0.018, 5);
    }
    return;
  }
  d.cyl('wood', 0, 0.44, 0, 0.18, 0.05, 10);
  for (let i = 0; i < 3 + v; i++) {
    const a = (i / (3 + v)) * Math.PI * 2;
    d.rod('wood_dark', V(Math.cos(a) * 0.12, 0.42, Math.sin(a) * 0.12), V(Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17), 0.02, 4);
  }
  void r;
};

const shelf: Builder = (d, r, v) => {
  const w = 1.4, h = 1.8, dd = 0.35;
  for (const x of [-w / 2, w / 2]) d.span('wood_dark', x - 0.03, 0, -dd / 2, x + 0.03, h, dd / 2);
  for (const y of [0.3, 0.85, 1.4]) {
    d.span('wood', -w / 2, y, -dd / 2, w / 2, y + 0.04, dd / 2);
    for (let i = 0; i < 4; i++) {
      const x = -w / 2 + 0.2 + i * 0.33;
      if (v === 0) jug(d, x, y + 0.04, 0, r.range(0.8, 1.3), r.chance(0.2) ? 'black' : 'terracotta');
      else if (v === 1) d.box(r.pick(['fabric_red', 'fabric_blue', 'fabric_ochre', 'fabric_white'] as MaterialId[]), x, y + 0.1, 0, 0.28, 0.12, 0.26, { shadow: false });
      else bowl(d, x, y + 0.04, 0, 1.1, r.chance(0.5) ? 'plaster_red' : 'terracotta');
    }
  }
  d.solid(-w / 2, 0, -dd / 2, w / 2, h, dd / 2);
};

// ------------------------------------------------------------------ fire & light

function oilLamp(d: Draw) {
  d.geo(lathe('lamp', [[0, 0], [0.035, 0], [0.045, 0.015], [0.04, 0.03], [0.012, 0.035], [0, 0.035]], 10), 'terracotta', 0, 0, 0, { shadow: false });
  d.box('terracotta', 0, 0.018, -0.055, 0.025, 0.018, 0.04, { shadow: false });
  d.cyl('glow_fire', 0, 0.05, -0.072, 0.008, 0.035, 5, { rTop: 0.001, shadow: false });
}

const oil_lamp: Builder = (d) => oilLamp(d);

const lampstand: Builder = (d) => {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    d.rod('bronze', V(0, 0.18, 0), V(Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2), 0.015, 4);
  }
  d.cyl('bronze', 0, 0.75, 0, 0.018, 1.2, 6, { rTop: 0.014 });
  d.cyl('bronze', 0, 1.36, 0, 0.09, 0.02, 10);
  oilLamp(d.at(0, 1.37, 0));
  d.solidCyl(0, 0.7, 0, 0.12, 1.4);
};

const brazier: Builder = (d) => {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3;
    d.rod('bronze', V(Math.cos(a) * 0.12, 0.62, Math.sin(a) * 0.12), V(Math.cos(a) * 0.26, 0.03, Math.sin(a) * 0.26), 0.018, 4);
    d.ellipsoid('bronze', Math.cos(a) * 0.26, 0.03, Math.sin(a) * 0.26, 0.04, 0.03, 0.04, { seg: [6, 4], shadow: false });
  }
  d.geo(lathe('brazier', [[0, 0], [0.1, 0], [0.3, 0.12], [0.33, 0.16], [0.3, 0.16], [0.1, 0.03], [0, 0.03]], 12), 'bronze', 0, 0.6, 0);
  d.ellipsoid('glow_fire', 0, 0.74, 0, 0.26, 0.05, 0.26, { seg: [10, 5], shadow: false });
  d.solidCyl(0, 0.4, 0, 0.3, 0.8);
};

const torch_bracket: Builder = (d) => {
  d.span('iron', -0.06, -0.12, -0.02, 0.06, 0.12, 0.0);
  d.rod('iron', V(0, 0, -0.01), V(0, 0.02, -0.22), 0.012, 4);
  d.geo(new THREE.TorusGeometry(0.04, 0.008, 4, 10), 'iron', 0, 0.02, -0.24, { rx: Math.PI / 2, shadow: false });
  d.rod('wood_dark', V(0, -0.25, -0.18), V(0, 0.3, -0.27), 0.025, 5);
  d.cyl('fabric_ochre', 0, 0.33, -0.275, 0.04, 0.12, 6, { rx: -0.16 });
  d.cyl('glow_fire', 0, 0.48, -0.3, 0.05, 0.22, 6, { rTop: 0.002, shadow: false });
};

// ------------------------------------------------------------------ monuments & street furniture

const altar: Builder = (d, r, v) => {
  const m: MaterialId = v === 0 ? 'travertine' : v === 1 ? 'marble' : 'tufa';
  d.span(m, -0.5, 0, -0.38, 0.5, 0.18, 0.38);
  d.span(m, -0.44, 0.18, -0.33, 0.44, 0.26, 0.33);
  d.span(m, -0.38, 0.26, -0.28, 0.38, 0.86, 0.28);
  d.span(m, -0.44, 0.86, -0.33, 0.44, 0.94, 0.33);
  d.span(m, -0.5, 0.94, -0.38, 0.5, 1.04, 0.38);
  for (const sx of [-1, 1]) d.cyl(m, sx * 0.4, 1.12, 0, 0.09, 0.74, 10, { rx: Math.PI / 2 });
  d.cyl(m, 0, 1.06, 0, 0.18, 0.06, 12);
  if (v !== 2) d.ellipsoid('glow_fire', 0, 1.09, 0, 0.13, 0.03, 0.13, { seg: [8, 4], shadow: false });
  // Garland relief.
  d.geo(new THREE.TorusGeometry(0.22, 0.035, 5, 10, Math.PI), 'foliage_olive', 0, 0.78, -0.29, { rz: Math.PI, shadow: false });
  void r;
  d.solid(-0.5, 0, -0.38, 0.5, 1.15, 0.38);
};

const herm: Builder = (d, r, v) => {
  const m: MaterialId = v === 1 ? 'marble_veined' : 'marble';
  d.span(m, -0.24, 0, -0.24, 0.24, 0.12, 0.24);
  d.span(m, -0.15, 0.12, -0.14, 0.15, 1.3, 0.14, { rx: 0 });
  d.span(m, -0.2, 1.24, -0.11, 0.2, 1.36, 0.11);
  d.cyl(m, 0, 1.42, 0, 0.06, 0.14, 8);
  d.ellipsoid(m, 0, 1.58, 0, 0.1, 0.13, 0.115, { seg: [10, 8] });
  d.ellipsoid(m, 0, 1.49, -0.06, 0.08, 0.09, 0.06, { seg: [8, 6] });
  void r;
  d.solid(-0.24, 0, -0.24, 0.24, 1.7, 0.24);
};

const milestone: Builder = (d, r, v) => {
  d.span('travertine', -0.32, 0, -0.32, 0.32, 0.35, 0.32);
  d.cyl(v === 1 ? 'marble' : 'travertine', 0, 1.15, 0, 0.26, 1.6, 14, { rTop: 0.24 });
  d.cyl('travertine', 0, 1.99, 0, 0.27, 0.08, 14);
  void r;
  d.solidCyl(0, 1.0, 0, 0.32, 2.0);
};

/** A generic draped statue (togate / palliate figure), ~1.8 m, standing on y = 0. */
export function statueFigure(d: Draw, mat: MaterialId, r: Rng) {
  d.geo(lathe('figure', [[0, 0], [0.24, 0], [0.25, 0.08], [0.21, 0.4], [0.18, 0.9], [0.2, 1.15], [0.23, 1.33], [0.2, 1.4], [0.07, 1.45], [0.06, 1.5], [0, 1.5]], 10), mat, 0, 0, 0, { sz: 0.75 });
  d.ellipsoid(mat, 0, 1.6, 0, 0.1, 0.125, 0.11, { seg: [10, 8] });
  d.box(mat, -0.05, 1.05, -0.02, 0.12, 0.85, 0.32, { rz: 0.5, shadow: false });
  // Raised right arm (adlocutio) and draped left arm.
  d.rod(mat, V(0.21, 1.32, 0), V(0.42, 1.55, -0.22), 0.05, 6);
  d.rod(mat, V(-0.22, 1.3, 0), V(-0.28, 0.95, -0.12), 0.06, 6);
  d.rod(mat, V(-0.28, 0.95, -0.12), V(-0.22, 0.85, -0.3), 0.05, 6);
  void r;
}

const statue_pedestal: Builder = (d, r, v) => {
  const m: MaterialId = v === 2 ? 'travertine' : 'marble_veined';
  d.span(m, -0.6, 0, -0.6, 0.6, 0.22, 0.6);
  d.span(m, -0.52, 0.22, -0.52, 0.52, 0.3, 0.52);
  d.span(m, -0.46, 0.3, -0.46, 0.46, 1.5, 0.46);
  d.span(m, -0.52, 1.5, -0.52, 0.52, 1.58, 0.52);
  d.span(m, -0.58, 1.58, -0.58, 0.58, 1.72, 0.58);
  d.span('marble', -0.3, 0.7, -0.47, 0.3, 1.1, -0.46, { shadow: false }); // inscription panel
  statueFigure(d.at(0, 1.72, 0), v === 0 ? 'bronze' : v === 1 ? 'marble' : 'gilded_bronze', r);
  d.solid(-0.6, 0, -0.6, 0.6, 1.72, 0.6);
};

const puteal: Builder = (d, r, v) => {
  const m: MaterialId = v === 1 ? 'marble' : 'travertine';
  d.geo(lathe('puteal', [[0.32, 0.86], [0.46, 0.86], [0.47, 0.8], [0.44, 0.76], [0.43, 0.14], [0.46, 0.1], [0.47, 0], [0.32, 0], [0.32, 0.86]], 18), m);
  d.cyl('black', 0, 0.5, 0, 0.33, 0.02, 14, { shadow: false });
  if (v === 2) {
    // Wooden frame with pulley.
    for (const s of [-1, 1]) d.span('wood_dark', s * 0.52 - 0.04, 0, -0.04, s * 0.52 + 0.04, 1.75, 0.04);
    d.span('wood_dark', -0.6, 1.7, -0.05, 0.6, 1.8, 0.05);
    d.cyl('wood', 0, 1.6, 0, 0.08, 0.06, 10, { rx: Math.PI / 2 });
    d.rod('fabric_ochre', V(0.08, 1.6, 0), V(0.08, 0.6, 0), 0.008, 4, { shadow: false });
  }
  void r;
  d.solidCyl(0, 0.43, 0, 0.47, 0.86);
};

const trough: Builder = (d, r, v) => {
  const m: MaterialId = v === 1 ? 'basalt' : 'travertine';
  const w = 1.6, dd = 0.6, h = 0.6, t = 0.1;
  d.span(m, -w / 2, 0, -dd / 2, w / 2, 0.12, dd / 2);
  d.span(m, -w / 2, 0, -dd / 2, w / 2, h, -dd / 2 + t);
  d.span(m, -w / 2, 0, dd / 2 - t, w / 2, h, dd / 2);
  d.span(m, -w / 2, 0, -dd / 2 + t, -w / 2 + t, h, dd / 2 - t);
  d.span(m, w / 2 - t, 0, -dd / 2 + t, w / 2, h, dd / 2 - t);
  d.span('water', -w / 2 + t, h - 0.08, -dd / 2 + t, w / 2 - t, h - 0.07, dd / 2 - t, { shadow: false });
  void r;
  d.solid(-w / 2, 0, -dd / 2, w / 2, h, dd / 2);
};

const signboard: Builder = (d, r, v) => {
  d.rod('iron', V(0, 0, 0), V(0, 0, -0.75), 0.015, 4);
  d.rod('iron', V(0, -0.25, 0), V(0, 0, -0.45), 0.012, 4);
  d.rod('iron', V(0, 0, -0.18), V(0, -0.12, -0.18), 0.006, 3, { shadow: false });
  d.rod('iron', V(0, 0, -0.7), V(0, -0.12, -0.7), 0.006, 3, { shadow: false });
  d.span('wood_painted', -0.03, -0.5, -0.8, 0.03, -0.12, -0.08);
  d.span(v === 0 ? 'plaster_white' : v === 1 ? 'plaster_ochre' : 'plaster_cream', -0.035, -0.45, -0.75, 0.035, -0.17, -0.13, { shadow: false });
  // Painted emblem: an amphora, a loaf or a ham.
  if (v === 0) d.ellipsoid('terracotta', 0, -0.31, -0.44, 0.045, 0.1, 0.06, { seg: [6, 5], shadow: false });
  else if (v === 1) d.cyl('plaster_ochre', 0, -0.31, -0.44, 0.09, 0.08, 8, { rz: Math.PI / 2, shadow: false });
  else d.ellipsoid('plaster_red', 0, -0.31, -0.44, 0.04, 0.09, 0.1, { seg: [6, 5], shadow: false });
  void r;
};

// ------------------------------------------------------------------ crafts

const anvil: Builder = (d) => {
  d.cyl('wood_dark', 0, 0.25, 0, 0.24, 0.5, 10);
  d.span('iron', -0.12, 0.5, -0.08, 0.12, 0.6, 0.08);
  d.span('iron', -0.2, 0.6, -0.1, 0.22, 0.72, 0.1);
  d.cyl('iron', -0.3, 0.68, 0, 0.07, 0.18, 6, { rTop: 0.005, rz: Math.PI / 2 });
  d.solidCyl(0, 0.36, 0, 0.28, 0.72);
};

const forge: Builder = (d) => {
  d.span('brick', -0.65, 0, -0.45, 0.65, 0.8, 0.45);
  d.span('brick', -0.75, 0, 0.45, 0.75, 1.9, 0.75);
  d.span('travertine', -0.7, 0.8, -0.5, 0.7, 0.86, 0.5);
  d.span('black', -0.4, 0.86, -0.25, 0.4, 0.87, 0.25, { shadow: false });
  d.ellipsoid('glow_fire', 0, 0.88, 0, 0.32, 0.07, 0.2, { seg: [10, 5], shadow: false });
  // Bellows.
  d.box('wood_dark', 0.85, 0.75, 0.1, 0.25, 0.12, 0.6, { rx: 0.12 });
  d.rod('iron', V(0.8, 0.8, -0.2), V(0.45, 0.88, -0.05), 0.02, 4);
  d.solid(-0.75, 0, -0.5, 1.0, 1.9, 0.75);
};

const loom: Builder = (d) => {
  const lean = -0.18;
  for (const s of [-1, 1]) d.box('wood', s * 0.7, 1.0, 0.09, 0.08, 2.05, 0.08, { rx: lean });
  d.cyl('wood_dark', 0, 1.9, 0.27, 0.05, 1.5, 8, { rz: Math.PI / 2 });
  d.box('fabric_white', 0, 1.3, 0.15, 1.3, 1.2, 0.01, { rx: lean });
  d.box('fabric_red', 0, 1.78, 0.25, 1.3, 0.22, 0.015, { rx: lean });
  d.cyl('wood_dark', 0, 1.0, 0.05, 0.025, 1.45, 6, { rz: Math.PI / 2 });
  for (let i = 0; i < 9; i++) d.cyl('terracotta', -0.6 + i * 0.15, 0.62, 0.0, 0.045, 0.1, 4, { rTop: 0.015 });
  d.solid(-0.8, 0, -0.1, 0.8, 2.0, 0.45);
};

const grain_mill: Builder = (d) => {
  d.cyl('tufa', 0, 0.2, 0, 0.95, 0.4, 16);
  d.cyl('travertine', 0, 0.42, 0, 0.8, 0.05, 16);
  d.cyl('basalt', 0, 0.8, 0, 0.42, 0.75, 12, { rTop: 0.06 });
  d.geo(lathe('catillus', [[0.48, 0], [0.42, 0.18], [0.27, 0.45], [0.27, 0.55], [0.42, 0.82], [0.48, 1.0], [0.4, 1.0], [0.22, 0.55], [0.22, 0.45], [0.4, 0.0], [0.48, 0]], 14), 'basalt', 0, 0.5, 0);
  d.span('wood_dark', -1.15, 0.97, -0.07, 1.15, 1.09, 0.07);
  d.span('wood_dark', -0.07, 0.97, -0.35, 0.07, 1.09, 0.35);
  d.solidCyl(0, 0.8, 0, 0.95, 1.6);
};

const oven: Builder = (d) => {
  d.span('brick', -1.1, 0, -0.9, 1.1, 2.0, 1.1);
  d.span('travertine', -0.75, 0.95, -1.15, 0.75, 1.03, -0.9);
  d.ellipsoid('brick', 0, 2.0, 0.1, 0.85, 0.45, 0.85, { seg: [12, 6] });
  d.span('brick', 0.6, 2.0, 0.6, 0.95, 2.9, 0.95);
  const mouth = d.at(0, 0, -0.905);
  const shape = new THREE.Shape();
  shape.moveTo(-0.38, 1.03); shape.lineTo(0.38, 1.03); shape.lineTo(0.38, 1.35);
  shape.absarc(0, 1.35, 0.38, 0, Math.PI, false); shape.lineTo(-0.38, 1.03);
  const g = new THREE.ShapeGeometry(shape, 6);
  g.rotateY(Math.PI);
  mouth.geo(g, 'black', 0, 0, -0.001, { shadow: false });
  g.dispose();
  d.ellipsoid('glow_fire', 0, 1.05, -0.7, 0.3, 0.04, 0.12, { seg: [8, 4], shadow: false });
  d.solid(-1.1, 0, -0.9, 1.1, 2.0, 1.1);
};

const vat: Builder = (d, r, v) => {
  const w = 1.2, dd = 0.95, h = 0.75 + v * 0.1, t = 0.12;
  const m: MaterialId = 'plaster_white';
  d.span(m, -w / 2, 0, -dd / 2, w / 2, 0.1, dd / 2);
  d.span(m, -w / 2, 0, -dd / 2, w / 2, h, -dd / 2 + t);
  d.span(m, -w / 2, 0, dd / 2 - t, w / 2, h, dd / 2);
  d.span(m, -w / 2, 0, -dd / 2 + t, -w / 2 + t, h, dd / 2 - t);
  d.span(m, w / 2 - t, 0, -dd / 2 + t, w / 2, h, dd / 2 - t);
  d.span('water', -w / 2 + t, h - 0.15, -dd / 2 + t, w / 2 - t, h - 0.14, dd / 2 - t, { shadow: false });
  void r;
  d.solid(-w / 2, 0, -dd / 2, w / 2, h, dd / 2);
};

const waterspout: Builder = (d) => {
  d.span('marble', -0.24, -0.3, -0.06, 0.24, 0.3, 0.0);
  d.ellipsoid('marble', 0, 0.02, -0.08, 0.12, 0.14, 0.06, { seg: [10, 8] });
  d.cyl('bronze', 0, -0.08, -0.15, 0.02, 0.16, 6, { rx: Math.PI / 2 });
  d.rod('water', V(0, -0.08, -0.23), V(0, -0.3, -0.3), 0.016, 5, { shadow: false });
  d.rod('water', V(0, -0.3, -0.3), V(0, -0.85, -0.32), 0.014, 5, { shadow: false });
};

const chopping_block: Builder = (d) => {
  d.cyl('wood_dark', 0, 0.38, 0, 0.3, 0.76, 12, { rTop: 0.28 });
  d.span('iron', -0.02, 0.76, -0.12, 0.02, 0.9, 0.08, { rx: 0.2 });
  d.span('wood', -0.02, 0.86, 0.06, 0.02, 0.9, 0.22, { shadow: false });
  d.solidCyl(0, 0.38, 0, 0.3, 0.76);
};

// ------------------------------------------------------------------ registry

const BUILDERS: Record<Exclude<PropKind, 'stall'>, Builder> = {
  amphora_globular, amphora_tall, amphora_stack, amphora_rack, dolium, crate, sack, basket,
  cart, handcart, litter,
  stall_fruit, stall_fish, stall_pottery, stall_cloth,
  table, table_marble, bench, bench_masonry, stool, shelf,
  brazier, oil_lamp, lampstand, torch_bracket,
  altar, herm, milestone, statue_pedestal, puteal, trough, signboard,
  anvil, forge, loom, grain_mill, oven, vat, waterspout, chopping_block,
};

const STALLS = ['stall_fruit', 'stall_fish', 'stall_pottery', 'stall_cloth'] as const;

function resolve(kind: PropKind, rng?: Rng, variant?: number): [Exclude<PropKind, 'stall'>, number] {
  const k = kind === 'stall' ? (rng ? rng.pick(STALLS) : 'stall_fruit') : kind;
  const v = variant ?? (rng ? rng.int(0, PROP_VARIANTS - 1) : 0);
  return [k, ((v % PROP_VARIANTS) + PROP_VARIANTS) % PROP_VARIANTS];
}

const builderCache = new Map<string, MeshBuilder>();
const modelCache = new Map<string, PropModel>();

/** The cached MeshBuilder for a prop (local frame). Do not add to it. */
export function propBuilder(kind: PropKind, rng?: Rng, variant?: number): MeshBuilder {
  const [k, v] = resolve(kind, rng, variant);
  const key = `${k}#${v}`;
  let b = builderCache.get(key);
  if (!b) {
    b = new MeshBuilder();
    BUILDERS[k](new Draw(b), new Rng(hashString(key)), v);
    builderCache.set(key, b);
  }
  return b;
}

/** Build (or fetch from cache) a prop model: merged geometry per material plus colliders. */
export function makeProp(kind: PropKind, rng?: Rng, variant?: number): PropModel {
  const [k, v] = resolve(kind, rng, variant);
  const key = `${k}#${v}`;
  let m = modelCache.get(key);
  if (!m) {
    const b = propBuilder(k, undefined, v);
    const group = b.build(key);
    const parts: PropModel['parts'] = [];
    const bounds = new THREE.Box3();
    for (const child of group.children) {
      const mesh = child as THREE.Mesh;
      const material = mesh.name.slice(mesh.name.lastIndexOf(':') + 1) as MaterialId;
      parts.push({ material, geometry: mesh.geometry, castShadow: mesh.castShadow });
      mesh.geometry.computeBoundingBox();
      bounds.union(mesh.geometry.boundingBox!);
    }
    m = { kind: k, variant: v, parts, colliders: b.colliders, bounds };
    modelCache.set(key, m);
  }
  return m;
}

export interface PlaceOpts {
  rng?: Rng;
  variant?: number;
  scale?: number;
  /** Include the prop's colliders (default true). */
  collide?: boolean;
  /** Extra tilt about X (e.g. amphorae leaning on a wall). */
  rx?: number;
}

/** Merge a prop into a Draw's MeshBuilder at local (x, y, z) with yaw `rotY`. */
export function placeProp(d: Draw, kind: PropKind, x: number, y: number, z: number, rotY = 0, o: PlaceOpts = {}) {
  const model = makeProp(kind, o.rng, o.variant);
  const m = d.m.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z)).multiply(new THREE.Matrix4().makeRotationY(rotY));
  if (o.rx) m.multiply(new THREE.Matrix4().makeRotationX(o.rx));
  if (o.scale && o.scale !== 1) m.multiply(new THREE.Matrix4().makeScale(o.scale, o.scale, o.scale));
  for (const p of model.parts) d.b.add(p.geometry, p.material, m, { uv: 'keep', castShadow: p.castShadow && d.flags.cast });
  if (AUDIT) d.b.auditProps.push({ kind, p: new THREE.Vector3().setFromMatrixPosition(m), src: currentAuditSource() });
  if (o.collide !== false) for (const c of model.colliders) d.b.collider(transformCollider(c, m));
}
