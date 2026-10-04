/**
 * A row of tabernae (shops) behind a forum portico, two storeys: wide shop doors on the ground
 * floor (some open, dressed by the fabric module's `shopInterior`, the rest shuttered), a
 * mezzanine/upper storey with windows, and a tiled roof. Human scale (1:1).
 *
 * Frame: the row runs along +x from 0 to `length`, the shop fronts face −z at z = 0, the rooms go
 * back to z = `depth`; y = 0 is the shop floor.
 */
import * as THREE from 'three';
import { Rng } from '../../../../core/Rng';
import { T, TRS, mul } from '../../../../arch/common/geom';
import { wall, type Opening } from '../../../../arch/common/walls';
import { Draw } from '../../../../arch/fabric/draw';
import { shopInterior, type ShopKind } from '../../../../arch/fabric/shops';
import type { MeshBuilder } from '../../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../../gfx/materialIds';
import { box, span } from './ornament';
import type { Detail } from './build';

export interface TabernaeSpec {
  length: number;
  depth: number;
  /** Target shop width (door + piers). */
  shopWidth?: number;
  storeyH?: number;
  storeys?: 1 | 2;
  material?: MaterialId;
  /** Shops shown open with an interior (by index), and their kinds. */
  open?: { index: number; kind: ShopKind }[];
  /** Bays that are through-passages to the street behind (by index). */
  passages?: number[];
  seed?: string;
  detail: Detail;
  /** Lowest ground below the floor (foundation). */
  groundMin?: number;
  roof?: boolean;
}

export interface TabernaeResult {
  /** Door centres (local, on the floor at the front face), with their kind if open. */
  shops: { x: number; open: boolean; kind?: ShopKind }[];
  height: number;
}

export function tabernae(b: MeshBuilder, spec: TabernaeSpec, at: THREE.Matrix4): TabernaeResult {
  const L = spec.length;
  const D = spec.depth;
  const sh = spec.storeyH ?? 3.6;
  const n = Math.max(1, Math.round(L / (spec.shopWidth ?? 4.4)));
  const w = L / n;
  const mat = spec.material ?? 'brick';
  const storeys = spec.storeys ?? 2;
  const H = sh * storeys + 0.6;
  const t = 0.6;
  const rng = new Rng(spec.seed ?? 'tabernae');
  const open = new Map((spec.open ?? []).map((o) => [o.index, o.kind]));
  const passages = new Set(spec.passages ?? []);
  const g0 = Math.min(0, spec.groundMin ?? 0) - 0.3;
  const hi = spec.detail === 'high';

  // Floor slab and foundation.
  span(b, 'travertine', 0, g0, 0, L, 0, D, at, true);
  // Front wall: shop doors below, windows above.
  const ops: Opening[] = [];
  const shops: TabernaeResult['shops'] = [];
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) * w;
    const isOpen = open.has(i) && hi;
    if (passages.has(i)) {
      ops.push({ kind: 'arch', x, width: Math.min(w - 1.0, 3.0), height: 3.2, sill: -g0 });
      if (storeys > 1) ops.push({ kind: 'window', x, width: 1.0, height: 1.1, sill: -g0 + sh + 0.9 });
      shops.push({ x, open: false });
      continue;
    }
    ops.push({ kind: 'door', x, width: Math.min(w - 1.0, 3.0), height: 2.9, leaves: 'none', frame: true, sill: -g0 });
    if (storeys > 1) ops.push({ kind: 'window', x, width: 1.0, height: 1.1, sill: -g0 + sh + 0.9 });
    shops.push({ x, open: isOpen, kind: open.get(i) });
  }
  wall(b, { length: L, height: H - g0, thickness: t, material: mat, frameMaterial: 'travertine', openings: ops, detail: spec.detail, collide: true }, mul(at, T(0, g0, t / 2)));
  // Back wall (with the passages' far arches), end walls, party walls between shops, upper floor.
  wall(
    b,
    { length: L, height: H - g0, thickness: t, material: mat, frameMaterial: 'travertine', openings: [...passages].map((i) => ({ kind: 'arch' as const, x: L - (i + 0.5) * w, width: Math.min(w - 1.0, 3.0), height: 3.2, sill: -g0 })), detail: spec.detail, collide: true },
    mul(at, TRS(L, g0, D - t / 2, 0, Math.PI, 0)),
  );
  span(b, mat, -t, g0, 0, 0, H, D, at, true);
  span(b, mat, L, g0, 0, L + t, H, D, at, true);
  for (let i = 1; i < n; i++) span(b, mat, i * w - 0.2, 0, t, i * w + 0.2, sh, D - t, at, true);
  span(b, 'wood_dark', 0, sh, t, L, sh + 0.25, D - t, at);
  // A travertine string course at the upper floor and a cornice.
  span(b, 'travertine', -t - 0.05, sh + 0.05, -0.12, L + t + 0.05, sh + 0.3, 0.1, at);
  span(b, 'travertine', -t - 0.1, H - 0.2, -0.3, L + t + 0.1, H, D + 0.1, at);
  if (spec.roof ?? true) {
    const rise = 1.6;
    const g = new THREE.BoxGeometry(L + 2 * t + 0.4, 0.2, Math.hypot(D + 0.6, rise));
    g.rotateX(-Math.atan2(rise, D + 0.6));
    g.translate(L / 2, H + rise / 2, D / 2);
    b.add(g, 'roof_tile', at);
    // Gable ends.
    for (const x of [-t, L + t]) {
      const tri = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(D, 0), new THREE.Vector2(D, rise)]);
      const gg = new THREE.ShapeGeometry(tri);
      gg.rotateY(-Math.PI / 2);
      gg.translate(x, H, 0);
      b.add(gg, mat, at);
    }
  }
  // Shop interiors: open ones dressed, the rest dark behind closed plank shutters; passages paved.
  for (const [i, s] of shops.entries()) {
    if (passages.has(i)) {
      const pw = Math.min(w - 1.0, 3.0) + 0.4;
      span(b, 'paving_basalt', s.x - pw / 2, -0.04, 0, s.x + pw / 2, 0.01, D, at);
      span(b, 'wood_dark', s.x - w / 2 + 0.2, sh - 0.05, t, s.x + w / 2 - 0.2, sh + 0.05, D - t, at);
      continue;
    }
    if (s.open && s.kind) {
      const d = new Draw(b, mul(at, T(s.x, 0, 0))).noShadow();
      shopInterior(d, s.kind, { w: w - 0.4, depth: D - t, h: sh - 0.05, t, wealth: 0.7 }, rng.fork(`shop${s.x}`));
    } else {
      // Shutters (vertical planks) in the doorway with a collider.
      const dw = Math.min(w - 1.0, 3.0);
      box(b, 'wood', s.x, 1.45, t * 0.5, dw, 2.9, 0.08, at, true);
      if (hi) for (let k = -2; k <= 2; k++) box(b, 'wood_dark', s.x + (k * dw) / 5.2, 1.45, t * 0.5 - 0.05, 0.03, 2.85, 0.03, at);
      box(b, 'black', s.x, sh / 2, D / 2, w - 0.6, sh - 0.2, D - 2 * t - 0.2, at);
    }
  }
  return { shops, height: H };
}
