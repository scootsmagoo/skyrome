/**
 * The city's block filler, one piece at a time: the same buildings as the kit's `fillBlock`
 * (src/arch/fabric/blockFiller.ts; same lots, seeds and generators) but produced as a sequence of
 * small units — the yard, each lot, the yard dressing, each back insula, the compound walls, the
 * torches — each in its own MeshBuilder. The streamer adds one unit to the batches per step, so a
 * block never costs one 20–60 ms frame: no unit takes more than a few milliseconds.
 *
 * It works from the block's layout (massing.ts `layoutBlock`), whose lot list may differ from the
 * kit's own plan on the golden path (frontage.ts infill), so the far massing, the detail levels and
 * the torches always agree.
 *
 * Kept in step with `fillBlock` by hand: if the kit's filler changes, port the change here.
 */
import * as THREE from 'three';
import { Rng } from '../../core/Rng';
import { MeshBuilder } from '../../gfx/MeshBuilder';
import type { MaterialId } from '../../gfx/materialIds';
import { groundIn, placeProp } from '../../arch/props/props';
import { blockOutline, type LotPlan } from '../../arch/fabric/blockFiller';
import { Draw } from '../../arch/fabric/draw';
import { domus } from '../../arch/fabric/domus';
import { lacus } from '../../arch/fabric/fountain';
import { registerSpray } from './spray';
import { horrea } from '../../arch/fabric/horrea';
import { insula, MAX_BUILDING_HEIGHT } from '../../arch/fabric/insula';
import { nearPolygon, obbCorners, pointInOBB, pointInPolygon, polygonBounds } from '../../arch/fabric/polygon';
import { compitalShrine } from '../../arch/fabric/shrines';
import { buildPlaza } from '../../arch/fabric/streets';
import type { BuildingOutput, Detail, HeightFn, Polygon, Spot, SpotKind } from '../../arch/fabric/types';
import type { FrontWall } from './frontage';
import type { BlockLayout } from './massing';
import { FLOOR_LIFT } from './datum';
import type { PlanBlock } from './plan';
import { drawTorches } from './life';

/** One piece of a block level. `torches`: its flames use the torch material (life.ts). */
export interface FillUnit {
  builder: MeshBuilder;
  spots: Spot[];
  torches?: boolean;
}

/**
 * The units of one detail level of a block, in build order. 'mid' and 'low' carry no colliders;
 * 'low' has no yard dressing, compound-wall gates or torches.
 */
export function* fillUnits(blk: PlanBlock, layout: BlockLayout, detail: Detail, H: HeightFn): Generator<FillUnit, void, void> {
  const opts = layout.opts;
  const polygon = blk.outline as Polygon;
  const poly = blockOutline(polygon, 0);
  const plans = layout.lots;
  const rng = new Rng((opts.seed ?? 1) ^ 0x5bd1e995);
  const wealth = opts.wealth ?? 0.4, density = opts.density ?? 0.7;
  const low = detail === 'low', full = detail === 'full';
  const dress = opts.streetDressing ?? true;
  const sw = opts.sidewalkHeight;
  const sidewalkOf = (e: number) => (Array.isArray(sw) ? sw[e] ?? 0.3 : sw ?? 0.3);
  const avoid = opts.avoid ?? [];
  const unit = (b: MeshBuilder, spots: Spot[] = []): FillUnit => {
    if (!full) b.colliders.length = 0;
    return { builder: b, spots };
  };

  // Yard surface under everything (buildings stand on top of it), leaving the avoid areas bare.
  if (opts.yard !== null) {
    const b = new MeshBuilder();
    buildPlaza(b, poly, H, { material: opts.yard ?? 'dirt', lift: 0.03, cell: low ? 6 : 3, skirt: 0.2, collide: false, exclude: avoid });
    yield unit(b);
  }

  for (const p of plans) {
    if (p.kind === 'alley') continue;
    const b = new MeshBuilder();
    const spots: Spot[] = [];
    const { obb } = p;
    const toWorld = (lx: number, lz: number): [number, number] => [obb.c[0] + obb.u[0] * lx + obb.v[0] * lz, obb.c[1] + obb.u[1] * lx + obb.v[1] * lz];
    const s = sidewalkOf(p.edge);
    let floorY = -Infinity;
    for (let i = 0; i <= 4; i++) {
      const [x, z] = toWorld(-obb.hu + (2 * obb.hu * i) / 4, -obb.hv - 0.4);
      floorY = Math.max(floorY, H(x, z) + s + FLOOR_LIFT);
    }
    const groundAt = (lx: number, lz: number) => {
      const [x, z] = toWorld(lx, lz);
      const raise = lz < -obb.hv + 0.01 ? s : lx < -obb.hu + 0.01 && p.street.left >= 0 ? sidewalkOf(p.street.left) : lx > obb.hu - 0.01 && p.street.right >= 0 ? sidewalkOf(p.street.right) : 0;
      return H(x, z) + FLOOR_LIFT + raise - floorY;
    };
    const m = new THREE.Matrix4().makeTranslation(obb.c[0], floorY, obb.c[1]).multiply(new THREE.Matrix4().makeRotationY(p.rotationY));
    const sides = { left: !p.party.left, right: !p.party.right, back: !p.party.back };
    const sideShops = { left: p.street.left >= 0, right: p.street.right >= 0 };
    const lrng = new Rng(p.seed);
    let out: BuildingOutput | null = null;
    if (p.kind === 'insula') {
      const maxS = opts.maxStoreys ?? 6;
      const storeys = Math.min(maxS, Math.round(2.6 + density * 2.2 + (1 - wealth) * 1.2 + lrng.range(-0.6, 0.8)));
      out = insula({
        width: p.width, depth: p.depth, seed: p.seed, wealth: Math.min(1, Math.max(0, wealth + lrng.range(-0.15, 0.15))),
        storeys: Math.max(3, storeys), courtyard: p.width >= 18 && p.depth >= 17 && lrng.chance(0.55),
        portico: wealth > 0.3 && p.depth > 13 && lrng.chance(0.25), groundAt, sides, sideShops, streetDressing: dress, maxHeight: MAX_BUILDING_HEIGHT, detail,
      });
    } else if (p.kind === 'shops') {
      out = insula({ width: p.width, depth: p.depth, seed: p.seed, wealth, storeys: 2, groundAt, sides, sideShops, balcony: lrng.chance(0.4) ? 'full' : 'none', roof: 'gable', streetDressing: dress, detail });
    } else if (p.kind === 'domus') {
      out = domus({ width: p.width, depth: p.depth, seed: p.seed, wealth: Math.max(0.5, wealth), groundAt, sides, streetDressing: dress, detail });
    } else if (p.kind === 'horrea') {
      out = horrea({ width: p.width, depth: p.depth, seed: p.seed, groundAt, detail });
    } else if (p.kind === 'piazza') {
      piazza(b, p, H, lrng, spots, s, !full);
    }
    if (out) {
      b.append(out.builder, m);
      for (const sp of out.spots) spots.push({ ...sp, id: `${p.id}:${sp.id}`, position: sp.position.clone().applyMatrix4(m), facing: sp.facing + p.rotationY });
    }
    yield unit(b, spots);
  }

  if (full) {
    const b = new MeshBuilder();
    const spots: Spot[] = [];
    yardDressing(b, poly, plans, avoid, H, rng, spots, opts.id ?? '');
    yield unit(b, spots);
  }

  // The back insulae of the block's interior (one unit each).
  for (const bl of layout.back) {
    const b = new MeshBuilder();
    const { c, u, v } = bl.obb;
    const groundAt = (lx: number, lz: number) => H(c[0] + u[0] * lx + v[0] * lz, c[1] + u[1] * lx + v[1] * lz) - bl.floorY;
    const ins = insula({
      width: bl.width, depth: bl.depth, seed: bl.seed, storeys: bl.storeys, wealth: blk.wealth, groundAt,
      sides: { left: true, right: true, back: true }, streetDressing: false, detail, maxHeight: MAX_BUILDING_HEIGHT,
    });
    b.append(ins.builder, new THREE.Matrix4().makeTranslation(c[0], bl.floorY, c[1]).multiply(new THREE.Matrix4().makeRotationY(bl.rotationY)));
    yield unit(b);
  }

  if (layout.walls.length) {
    const b = new MeshBuilder();
    for (const w of layout.walls) compoundWall(new Draw(b), w, H, blk.wealth, !low);
    yield unit(b);
  }

  if (!low && layout.torches.length) {
    const b = new MeshBuilder();
    drawTorches(b, layout.torches);
    yield { builder: b, spots: [], torches: true };
  }
}

/**
 * A compound wall on the property line (2.6 m, plastered or brick, tile coping), stepped down a
 * slope in ≤ 3 m panels, with a timber gate in the middle of the longer stretches.
 */
export function compoundWall(d: Draw, w: FrontWall, H: HeightFn, wealth: number, gate: boolean) {
  const rng = new Rng(w.seed);
  const mat: MaterialId = rng.chance(0.45 - 0.2 * wealth) ? 'brick' : rng.pick(['plaster_cream', 'plaster_ochre', 'plaster_white'] as const);
  const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1];
  const len = Math.hypot(dx, dz);
  if (len < 0.5) return;
  const rot = Math.atan2(dx, dz) - Math.PI / 2; // local +x along the wall
  const th = 0.45, hgt = 2.6;
  const gw = w.gate && gate ? 2.4 : 0;
  const g0 = (len - gw) / 2, g1 = g0 + gw;
  const pieces: [number, number][] = gw ? [[0, g0], [g1, len]] : [[0, len]];
  const at = (s: number): [number, number] => [w.a[0] + (dx * s) / len, w.a[1] + (dz * s) / len];
  for (const [s0, s1] of pieces) {
    const n = Math.max(1, Math.ceil((s1 - s0) / 3));
    for (let k = 0; k < n; k++) {
      const a0 = s0 + ((s1 - s0) * k) / n, a1 = s0 + ((s1 - s0) * (k + 1)) / n;
      if (a1 - a0 < 0.05) continue;
      const [x0, z0] = at(a0), [x1, z1] = at(a1);
      const lo = Math.min(H(x0, z0), H(x1, z1)) - 0.35, hi = Math.max(H(x0, z0), H(x1, z1));
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, L = a1 - a0;
      const top = hi + hgt;
      const f = d.at(mx, 0, mz, rot);
      f.box(mat, 0, (lo + top) / 2, 0, L + 0.02, top - lo, th);
      f.box('roof_tile', 0, top + 0.06, 0, L + 0.06, 0.12, th + 0.16);
      f.solid(-L / 2, lo, -th / 2, L / 2, top, th / 2);
    }
  }
  if (gw) {
    const [gx, gz] = at(len / 2);
    const y = H(gx, gz);
    const f = d.at(gx, y, gz, rot);
    // Posts, lintel with a little tiled hood, and the two leaves of the gate (closed).
    for (const sx of [-1, 1]) f.box('travertine', sx * (gw / 2 + 0.12), 1.4, 0, 0.3, 2.8, th + 0.1);
    f.box('travertine', 0, 2.88, 0, gw + 0.6, 0.24, th + 0.1);
    f.box('roof_tile', 0, 3.08, 0, gw + 0.9, 0.16, th + 0.5);
    f.box('wood_dark', -gw / 4, 1.2, 0, gw / 2 - 0.04, 2.4, 0.09);
    f.box('wood_dark', gw / 4, 1.2, 0, gw / 2 - 0.04, 2.4, 0.09);
    f.box('iron', 0, 1.15, -0.06, 0.08, 0.08, 0.04);
    f.solid(-gw / 2, 0, -0.08, gw / 2, 2.4, 0.08);
  }
}

/** Small square in a gap of the frontage (the kit's `piazza`, kept identical). */
function piazza(b: MeshBuilder, p: LotPlan, H: HeightFn, rng: Rng, spots: Spot[], sw: number, noProps = false) {
  const corners = obbCorners(p.obb);
  buildPlaza(b, corners, (x, z) => H(x, z) + sw * 0.5, { material: rng.chance(0.5) ? 'paving_travertine' : 'cobbles', lift: 0.05 });
  const c = p.obb.c;
  const y = H(c[0], c[1]) + sw * 0.5 + 0.05;
  const d = new Draw(b, new THREE.Matrix4().makeTranslation(c[0], y, c[1]).multiply(new THREE.Matrix4().makeRotationY(p.rotationY)));
  const add = (kind: SpotKind, lx: number, lz: number, facing: number, tag?: string) =>
    spots.push({ id: `${p.id}:${kind}${spots.length}`, kind, position: d.point(lx, 0, lz), facing: facing + p.rotationY, tag });
  if (rng.chance(0.55)) {
    // The jet lands 0.7 m in front of the spout pillar, at the water line (lacus frame is turned by π).
    const jet = d.point(0, 0.74, p.obb.hv * 0.25 - 0.7);
    registerSpray(p.id, jet.x, jet.y, jet.z);
    for (const s of lacus(d.at(0, 0, p.obb.hv * 0.25, Math.PI), rng)) add('fountain', -s.x, p.obb.hv * 0.25 - s.z, s.facing + Math.PI);
  } else {
    compitalShrine(d.at(0, 0, p.obb.hv * 0.4, Math.PI), rng);
    add('shrine', 0, p.obb.hv * 0.4 - 1.8, 0, 'compitum');
  }
  const gnd = groundIn(d, (x, z) => H(x, z) + sw * 0.5 + 0.05);
  for (const s of [-1, 1]) {
    if (!rng.chance(0.7) || noProps) continue;
    const lx = s * (p.obb.hu - 1.2);
    placeProp(d, 'bench_masonry', lx, gnd(lx, 0), 0, s * Math.PI / 2, { variant: 0, ground: gnd });
    add('bench', lx - s * 0.5, 0, -s * Math.PI / 2);
  }
  for (const s of [-1, 1]) if (rng.chance(0.6)) add('tree', s * (p.obb.hu - 1.5), p.obb.hv - 1.5, 0, rng.pick(['pine', 'plane', 'cypress']));
  add('stall', 0, -p.obb.hv + 2.0, Math.PI, 'market');
}

/** Wells, stacked amphorae, carts and trees in the leftover yard space (the kit's `yardDressing`). */
function yardDressing(b: MeshBuilder, poly: Polygon, plans: LotPlan[], avoid: Polygon[], H: HeightFn, rng: Rng, spots: Spot[], prefix: string) {
  const { minX, minZ, maxX, maxZ } = polygonBounds(poly);
  const solid = plans.filter((p) => p.kind !== 'alley');
  const free = (x: number, z: number, r: number) =>
    pointInPolygon([x, z], poly) &&
    !solid.some((p) => pointInOBB([x, z], p.obb, r)) &&
    [[r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dz]) => pointInPolygon([x + dx, z + dz], poly)) &&
    !avoid.some((av) => nearPolygon([x, z], av, r));
  const d = new Draw(b);
  let n = 0;
  const area = (maxX - minX) * (maxZ - minZ);
  const tries = Math.min(400, Math.floor(area / 15));
  const kinds = ['puteal', 'amphora_stack', 'cart', 'crate', 'tree', 'tree', 'dolium', 'handcart', 'trough'] as const;
  for (let i = 0; i < tries && n < area / 120; i++) {
    const x = rng.range(minX, maxX), z = rng.range(minZ, maxZ);
    const k = rng.pick(kinds);
    const r = k === 'cart' ? 3 : k === 'tree' ? 2.5 : 1.4;
    if (!free(x, z, r)) continue;
    const y = H(x, z) + 0.03;
    if (k === 'tree') spots.push({ id: `${prefix}yard:tree${n}`, kind: 'tree', position: new THREE.Vector3(x, y, z), facing: 0, tag: rng.pick(['fig', 'olive', 'laurel', 'pine', 'cypress']) });
    else {
      placeProp(d, k, x, y, z, rng.range(0, Math.PI * 2), { rng, ground: H });
      if (k === 'puteal') spots.push({ id: `${prefix}yard:well${n}`, kind: 'well', position: new THREE.Vector3(x + 0.9, y, z), facing: -Math.PI / 2 });
    }
    n++;
  }
}
