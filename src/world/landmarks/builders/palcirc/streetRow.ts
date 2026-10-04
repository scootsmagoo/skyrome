/**
 * A row of apartment blocks with shops along a street (palcirc crew), in a landmark's local frame:
 * the fabric's insula kit, fronting a straight property line, each block floored at the highest
 * point of its frontage, with a paved sidewalk in front, a lamp at the door of every other shop,
 * and the shop and house doors as spots. Used where this module's landmarks stand on a street the
 * city filler does not reach (the Lupercal's corner of the Vicus Tuscus). It also hands back each
 * block's frame, stair door and shop fronts (`PlacedLot`), so a caller can give a block a name
 * (the content's insulae) and dress it.
 */
import * as THREE from 'three';
import { Draw } from '../../../../arch/fabric/draw';
import { insula, type BayKind } from '../../../../arch/fabric/insula';
import { buildPlaza } from '../../../../arch/fabric/streets';
import type { MeshBuilder } from '../../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../../gfx/materialIds';
import type { LandmarkContext } from '../../types';
import type { Lamp } from './capenaParts';
import type { Spots } from './util';

export interface RowLot {
  /** Frontage length and depth (m), storeys, finish, explicit ground-floor bays (unique shop kinds). */
  len: number;
  depth: number;
  storeys: number;
  finish: 'brick' | 'plaster';
  plaster?: MaterialId;
  portico?: boolean;
  bays?: BayKind[];
  /** Every shop of the ground floor is open (enterable, with a front the spots can name). */
  open?: boolean;
  /** Gap (an alley) after this lot. */
  gap?: number;
}

/** A block of the row as built: its frame (landmark-local), size, and the doors on the street. */
export interface PlacedLot {
  index: number;
  /** Block frame (origin at the middle of its floor; local −z toward the street) and size. */
  m: THREE.Matrix4;
  width: number;
  depth: number;
  height: number;
  /** Frontage span along the property line (m from `a`). */
  t0: number;
  t1: number;
  /** The stair door (landmark-local spot, street level, facing the street), when there is one. */
  stair?: { p: THREE.Vector3; heading: number };
  /** The open shops' fronts, in order along the frontage. */
  shops: { tag: string; p: THREE.Vector3; heading: number }[];
  /** Street-level point on the frontage: `u` 0..1 along the block, `off` metres out from the property line (landmark-local). */
  front(u: number, off: number): THREE.Vector3;
}

export interface RowSpec {
  /** Property line from `a` to `c` (local x, z); the blocks stand on the side of `n` (unit normal away from the street). */
  a: [number, number];
  c: [number, number];
  n: [number, number];
  lots: RowLot[];
  /** Paved sidewalk in front of the blocks (m). */
  sidewalk: number;
  seed: number;
  idPrefix: string;
}

/** Lot rectangles (pure): centre of each frontage along the line, in order. */
export function rowLots(spec: Pick<RowSpec, 'a' | 'c' | 'lots'>): { lot: RowLot; t0: number; t1: number }[] {
  const L = Math.hypot(spec.c[0] - spec.a[0], spec.c[1] - spec.a[1]);
  const out: { lot: RowLot; t0: number; t1: number }[] = [];
  let t = 0;
  for (const lot of spec.lots) {
    if (t + lot.len > L + 1e-6) break;
    out.push({ lot, t0: t, t1: t + lot.len });
    t += lot.len + (lot.gap ?? 2.5);
  }
  return out;
}

export function streetRow(ctx: LandmarkContext, b: MeshBuilder, spots: Spots, lamps: Lamp[], spec: RowSpec) {
  const g = (x: number, z: number) => ctx.groundAt(x, z);
  const hi = ctx.detail === 'high';
  const L = Math.hypot(spec.c[0] - spec.a[0], spec.c[1] - spec.a[1]);
  const tx = (spec.c[0] - spec.a[0]) / L, tz = (spec.c[1] - spec.a[1]) / L;
  const [nx, nz] = spec.n;
  const at = (t: number, o: number): [number, number] => [spec.a[0] + tx * t + nx * o, spec.a[1] + tz * t + nz * o];
  // Insula frame: front (−z) toward the street, local +z along n, local +x = (cos θ, −sin θ).
  const rot = Math.atan2(nx, nz);
  const lots = rowLots(spec);
  const used = lots.length ? lots[lots.length - 1].t1 : 0;
  const placed: PlacedLot[] = [];
  // The sidewalk: a paved strip along the whole row, a step above the street.
  if (used > 0) {
    const sw: [number, number][] = [at(-0.5, 0.02), at(used + 0.5, 0.02), at(used + 0.5, -spec.sidewalk), at(-0.5, -spec.sidewalk)];
    buildPlaza(b, sw, g, { material: 'cobbles', lift: 0.16, skirt: 0.3, cell: 2.5 });
  }
  for (const [i, { lot, t0, t1 }] of lots.entries()) {
    const w = t1 - t0;
    const [fx, fz] = at((t0 + t1) / 2, 0);
    const cx = fx + nx * (lot.depth / 2 + 0.05), cz = fz + nz * (lot.depth / 2 + 0.05);
    // Floor: the highest point of the frontage (sidewalk level), so no shop sinks into the slope.
    let floor = -Infinity;
    for (let k = 0; k <= 6; k++) {
      const [x, z] = at(t0 + (w * k) / 6, -0.3);
      floor = Math.max(floor, g(x, z) + 0.18);
    }
    const c = Math.cos(rot), s = Math.sin(rot);
    const toLocal = (ix: number, iz: number) => [cx + ix * c + iz * s, cz - ix * s + iz * c] as const;
    const out = insula({
      width: w,
      depth: lot.depth,
      storeys: lot.storeys,
      seed: spec.seed + i * 17,
      wealth: 0.35,
      finish: lot.finish,
      plaster: lot.plaster,
      portico: lot.portico,
      bays: lot.bays,
      balcony: i % 2 ? 'partial' : 'none',
      openShopChance: lot.open ? 1 : 0.6,
      roof: 'hip',
      sides: { left: true, right: true, back: false },
      groundAt: (ix, iz) => {
        const [x, z] = toLocal(ix, iz);
        return g(x, z) - floor;
      },
      detail: hi ? 'full' : 'mid',
    });
    const m = new THREE.Matrix4().makeTranslation(cx, floor, cz).multiply(new THREE.Matrix4().makeRotationY(rot));
    b.append(out.builder, m);
    if (!hi) new Draw(b, m).solid(-w / 2, -1.5, -lot.depth / 2, w / 2, out.height, lot.depth / 2);
    const pl: PlacedLot = {
      index: i, m, width: w, depth: lot.depth, height: out.height, t0, t1, shops: [],
      front: (u, off) => {
        const [x, z] = at(t0 + w * u, -off);
        return new THREE.Vector3(x, g(x, z), z);
      },
    };
    for (const sp of out.spots) {
      const p = sp.position.clone().applyMatrix4(m);
      const heading = sp.facing + rot;
      if (sp.kind === 'shopDoor' && sp.tag && sp.tag !== 'stair') {
        spots.add(`${spec.idPrefix}-shop-${i}-${sp.tag}`, sp.tag === 'thermopolium' ? 'vendor' : 'stall', p.x, p.y, p.z, heading);
        pl.shops.push({ tag: sp.tag, p, heading });
      } else if (sp.kind === 'houseDoor' || sp.tag === 'stair') {
        spots.add(`${spec.idPrefix}-door-${i}`, 'door', p.x, p.y, p.z, heading);
        if (sp.tag === 'stair') pl.stair ??= { p, heading };
      }
    }
    placed.push(pl);
    const [lx, lz] = at(t0 + w * 0.3, -0.35);
    lamps.push({ position: new THREE.Vector3(lx, floor + 2.75, lz), color: 0xffa54f, intensity: 5, distance: 7, flicker: 0.25, night: true, glow: 0.14 });
  }
  return { used, at, rot, lots: placed };
}
