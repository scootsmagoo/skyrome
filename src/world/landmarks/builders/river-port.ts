/**
 * The river front below the Capitol and the Palatine: the Forum Boarium (Rome's cattle market,
 * with its pens, butchers, hawkers and the bronze bull from Aegina), the quays of the Portus
 * Tiberinus (travertine quay wall, mooring stones, stairs to the water, treadwheel cranes,
 * storerooms and the towed river barges from Ostia) and the outfall of the Cloaca Maxima.
 */
import * as THREE from 'three';
import { T, extrudePolygon, type V2 } from '../../../arch/common/geom';
import { inscriptionPanel, paintedSign } from '../../../arch/common/inscription';
import { stairs, stepCount } from '../../../arch/common/stairs';
import { buildPlaza, treadwheelCrane } from '../../../arch/fabric';
import { placeProp } from '../../../arch/props';
import type { MaterialId } from '../../../gfx/materialIds';
import type { LandmarkBuilder, LandmarkContext, Spot } from '../types';
import { boat, bridgeCorridors, draw, fence, gableRoof, insideAny, neighbourFootprints, ox, riverEnv, roadCorridors, spot, V, type BoatKind } from './river-kit';

/** True when the heightmap already shapes stone quays (the terrain/water module's riverbanks). */
function terrainHasQuays(ctx: LandmarkContext): boolean {
  const hm = ctx.game.heightmap as unknown as { features?: { quays?: unknown[] } | null } | undefined;
  return !!hm?.features?.quays?.length;
}

// ------------------------------------------------------------------ Forum Boarium

function forumBoarium(ctx: LandmarkContext) {
  const { lm, rng } = ctx;
  const hi = ctx.detail === 'high';
  const b = ctx.builder();
  const env = riverEnv(ctx);
  const d = draw(b);
  const poly = (lm.footprint as { points: readonly (readonly [number, number])[] }).points.map(([x, z]) => env.local(x, z));
  const nb = neighbourFootprints(ctx, env, { grow: 1.2 });
  const roads = roadCorridors(ctx, env, 0.6);
  const bridges = bridgeCorridors(ctx, env, 45);
  const blocked = [...nb.map((n) => n.poly), ...roads, ...bridges];
  buildPlaza(b, poly, (x, z) => ctx.groundAt(x, z), { material: 'paving_travertine', exclude: blocked, collide: true, lift: 0.1, cell: 2 });
  const inPoly = (x: number, z: number) => insideAny(x, z, [poly]);
  const clear = (x: number, z: number, r: number) => {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (!inPoly(px, pz) || insideAny(px, pz, blocked)) return false;
    }
    return inPoly(x, z) && !insideAny(x, z, blocked);
  };
  // Things stand on the paving (lifted 0.1 m over the terrain).
  const g = (x: number, z: number) => ctx.groundAt(x, z) + 0.1;
  const spots: Spot[] = [];

  // ---- the bronze bull from Aegina on its base, near the middle of the square
  const bull = firstClear(clear, 3.5, [[4, 2], [8, 6], [0, 10], [10, -4], [-6, 8]]);
  if (bull) {
    const [bx, bz] = bull;
    const t = d.at(bx, g(bx, bz), bz, -0.6);
    t.span('marble', -1.6, 0, -2.4, 1.6, 0.3, 2.4, { collide: true });
    t.span('marble', -1.3, 0.3, -2.1, 1.3, 1.5, 2.1, { collide: true });
    t.span('marble', -1.45, 1.5, -2.25, 1.45, 1.66, 2.25);
    ox(t.at(0, 1.66, 0), 'bronze', rng, 'stand', hi);
    spots.push(spot('forum-boarium:bull', 'vista', bx + 3, g(bx, bz), bz + 2, Math.atan2(-3, -2)));
  }
  // ---- cattle pens (post-and-rail) with oxen, troughs and hay, toward the Circus side (south)
  const pens: [number, number][] = [];
  for (const c of [[16, 30], [3, 34], [-10, 30], [20, 16], [-14, 18], [-20, 6], [28, 30], [-24, 34], [30, 2]] as [number, number][]) {
    if (pens.length >= (hi ? 7 : 3)) break;
    if (clear(c[0], c[1], 6.5)) pens.push(c);
  }
  pens.forEach(([px, pz], i) => {
    const w = 9, dd = 7;
    const y = g(px, pz);
    const p = d.at(px, y, pz, (i % 2) * 0.12);
    fence(p, [[-w / 2, -dd / 2], [w / 2, -dd / 2], [w / 2, dd / 2], [-w / 2, dd / 2]], { closed: true, gap: 2.0, height: 1.3 });
    placeProp(p, 'trough', w / 2 - 1.2, 0, 0, Math.PI / 2, { variant: i % 3 });
    // Straw on the ground and a few head of cattle.
    p.span('dry_grass', -w / 2 + 0.3, 0.0, -dd / 2 + 0.3, w / 2 - 0.3, 0.04, dd / 2 - 0.3, { shadow: false });
    const nOx = hi ? 3 : 2;
    for (let k = 0; k < nOx; k++) {
      const ox0 = -w / 2 + 2 + k * ((w - 4) / Math.max(1, nOx - 1));
      const oz = rng.range(-1.6, 1.6);
      ox(p.at(ox0, 0.04, oz, rng.range(-1.2, 1.2)), rng.chance(0.5) ? 'plaster_cream' : rng.chance(0.5) ? 'wood' : 'plaster_ochre', rng, k % 2 ? 'graze' : 'stand', hi);
    }
    spots.push(spot(`forum-boarium:drover-${i}`, 'npc', px - w / 2 - 0.8, y, pz - dd / 2 + 1.0, Math.PI / 2));
    spots.push(spot(`forum-boarium:pen-${i}`, 'stall', px, y, pz - dd / 2 - 1.2, Math.PI));
  });
  // ---- butchers' tables (lanii) and hawkers' stalls along the north side
  const stalls = [[-14, -18], [-6, -22], [2, -22], [10, -20], [18, -14], [-20, -6], [-26, -14], [26, -6], [-2, -8], [14, -2], [-12, -4], [6, 14], [22, 8]] as [number, number][];
  let n = 0;
  for (const [sx, sz] of stalls) {
    if (n >= (hi ? 12 : 5) || !clear(sx, sz, 2.2)) continue;
    const y = g(sx, sz);
    const s = d.at(sx, y, sz, Math.atan2(-sx, -sz) + Math.PI);
    if (n % 2 === 0) {
      // Butcher: a heavy table, a chopping block, a rail of hanging joints.
      placeProp(s, 'table', 0, 0, 0, 0, { variant: 1 });
      placeProp(s, 'chopping_block', 1.2, 0, 0.3, 0.2, { variant: 0 });
      s.span('wood_dark', -1.2, 2.0, 0.55, 1.2, 2.08, 0.62);
      for (const x of [-0.9, -0.3, 0.4, 0.9]) {
        s.cyl('wood_dark', -1.15, 1.0, 0.58, 0.05, 2.0, 5);
        s.ellipsoid('plaster_red', x, 1.6, 0.58, 0.14, 0.32, 0.1, { seg: [8, 5] });
      }
      s.cyl('wood_dark', 1.15, 1.0, 0.58, 0.05, 2.0, 5);
      spots.push(spot(`forum-boarium:butcher-${n}`, 'vendor', sx, y, sz, Math.atan2(-sx, -sz)));
    } else {
      placeProp(s, n % 3 ? 'stall_fruit' : 'stall_pottery', 0, 0, 0, 0, { variant: n % 3 });
      spots.push(spot(`forum-boarium:hawker-${n}`, 'stall', sx, y, sz, Math.atan2(-sx, -sz)));
    }
    n++;
  }
  // ---- the sealed stone chamber where victims were once buried alive (a quest hook)
  const ch = firstClear(clear, 2.2, [[-8, 12], [-4, 20], [12, 4], [-16, 0]]);
  if (ch) {
    const [cx, cz] = ch;
    const y = g(cx, cz);
    const c = d.at(cx, y, cz, 0.3);
    c.span('peperino', -1.4, 0, -1.0, 1.4, 0.16, 1.0, { collide: true });
    c.span('tufa', -1.25, 0.16, -0.85, 1.25, 0.22, 0.85, { collide: true });
    c.cyl('iron', 0, 0.25, 0, 0.16, 0.04, 10, { open: true });
    spots.push(spot('forum-boarium:sealed-chamber', 'shrine', cx, y, cz - 1.8, 0));
  }
  // ---- a cattle dealer's strongbox by a stack of fodder sacks, and a bench
  const sb = firstClear(clear, 1.8, [[22, 4], [-22, 18], [14, -6]]);
  if (sb) {
    const s = d.at(sb[0], g(sb[0], sb[1]), sb[1]);
    placeProp(s, 'crate', 0, 0, 0, 0.3, { variant: 2 });
    for (let k = 0; k < 4; k++) placeProp(s, 'sack', 1.0 + (k % 2) * 0.6, (k > 1 ? 0.45 : 0), 0.2, k, { variant: k % 3, collide: k < 2 });
    placeProp(s, 'bench', -1.6, 0, 0.4, 0, { variant: 0 });
    spots.push(spot('forum-boarium:dealer-box', 'container', sb[0], g(sb[0], sb[1]), sb[1] - 1.0, 0));
    spots.push(spot('forum-boarium:bench', 'sit', sb[0] - 1.6, g(sb[0], sb[1]), sb[1] + 0.4, 0));
  }
  spots.push(spot('forum-boarium:centre', 'spawn', 0, g(0, 0), 0, 0));
  return { object: b.build(lm.id), colliders: b.colliders, spots, cullDistance: 900 };
}

function firstClear(clear: (x: number, z: number, r: number) => boolean, r: number, cands: [number, number][]): [number, number] | null {
  for (const c of cands) if (clear(c[0], c[1], r)) return c;
  return null;
}

// ------------------------------------------------------------------ Portus Tiberinus

function portusTiberinus(ctx: LandmarkContext) {
  const { S, lm, rng } = ctx;
  const hi = ctx.detail === 'high';
  const b = ctx.builder();
  const env = riverEnv(ctx);
  const d = draw(b);
  const fp = lm.footprint as { w: number; d: number };
  const W = fp.w * S;
  const Dd = fp.d * S;
  const quayTop = 10 * S - env.baseY; // quay surface 10 m ASL (research §5.3)
  const water = env.waterY;
  const bed = env.bedY;
  const own = !terrainHasQuays(ctx);
  const nb = neighbourFootprints(ctx, env, { grow: 2 });
  const bridges = bridgeCorridors(ctx, env, 30, 1.5);
  const blocked = [...nb.map((n) => n.poly), ...bridges];
  // Quay face: a straight line in the frame, just out in the water where the natural bank toes in.
  const faceZ = -1.6;
  const x0 = -W / 2 + 4, x1 = W / 2 - 4;
  const top = (x: number, z: number) => (own ? Math.max(ctx.groundAt(x, z), quayTop) : ctx.groundAt(x, z));
  const spots: Spot[] = [];
  if (own) {
    // Concrete fill behind a travertine face from below the bed to the quay top, a deck on top.
    const fillZ1 = Dd / 2 - 1;
    d.span('travertine', x0, bed - 0.6, faceZ - 0.9, x1, quayTop, faceZ, { collide: true });
    d.span('travertine', x0, quayTop - 0.02, faceZ - 1.05, x1, quayTop + 0.2, faceZ + 0.25); // coping
    d.span('concrete', x0, bed - 0.6, faceZ, x1, quayTop - 0.3, fillZ1 * 0.5, { collide: true });
    // Courses on the face (slightly proud bands every 0.6 m).
    if (hi) for (let y = Math.ceil(bed / 0.6) * 0.6; y < quayTop - 0.3; y += 0.6) d.span('travertine', x0, y, faceZ - 0.93, x1, y + 0.05, faceZ - 0.9, { shadow: false });
    const deck: V2[] = [[x0, faceZ], [x1, faceZ], [x1, fillZ1], [x0, fillZ1]];
    buildPlaza(b, deck, (x, z) => top(x, z), { material: 'paving_travertine', exclude: blocked, collide: true, lift: 0.02, cell: 3, skirt: 1.5 });
    // Return walls at both ends.
    for (const x of [x0, x1]) d.span('travertine', x - 0.5, bed - 0.6, faceZ - 0.9, x + 0.5, quayTop + 0.2, fillZ1 * 0.5, { collide: true });
  }
  // Mooring stones: pierced travertine blocks set in the face just above the water.
  for (let x = x0 + 4; x < x1 - 2; x += 7.5) {
    if (insideAny(x, faceZ - 0.5, blocked)) continue;
    d.box('travertine', x, water + 0.9, faceZ - 0.95, 0.7, 0.55, 0.22);
    d.cyl('black', x, water + 0.9, faceZ - 1.06, 0.12, 0.02, 8, { rx: Math.PI / 2, shadow: false });
  }
  // Paired stairs down to the water, along the face (1:1, 0.2 m risers).
  const qa = quayTop - (water + 0.35);
  const sc = stepCount(qa, 0.2);
  for (const xs of [-W * 0.22, W * 0.2]) {
    if (insideAny(xs, faceZ, blocked)) continue;
    const run = 0.32;
    const len = sc.count * run;
    // The flight runs down along +x outside the face, on a masonry spur with a landing at the bottom.
    const m = new THREE.Matrix4().makeRotationY(-Math.PI / 2).setPosition(xs + len, water + 0.35, faceZ - 0.9 - 0.75);
    stairs(b, { width: 1.5, rise: sc.rise, run, count: sc.count, material: 'travertine' }, m);
    d.span('travertine', xs - 2.2, bed - 0.6, faceZ - 2.4, xs, water + 0.35, faceZ - 0.9, { collide: true });
    d.span('travertine', xs, bed - 0.6, faceZ - 2.4, xs + len, water + 0.1, faceZ - 0.9);
    spots.push(spot(`portus-tiberinus:landing-${xs > 0 ? 'b' : 'a'}`, 'npc', xs - 1.1, water + 0.35, faceZ - 1.6, Math.PI));
  }
  // Treadwheel cranes on the quay edge, leaning out over the barges.
  const cranes = hi ? [-W * 0.32, -W * 0.05, W * 0.3] : [-W * 0.05];
  for (const cx of cranes) {
    if (insideAny(cx, 1.5, blocked)) continue;
    const cz = faceZ + 3.2;
    treadwheelCrane(d.at(cx, top(cx, cz), cz), 8.5, rng);
    spots.push(spot(`portus-tiberinus:crane-${Math.round(cx)}`, 'npc', cx + 1.8, top(cx, cz), cz + 2.0, Math.PI));
  }
  // Cargo on the quay: amphorae (Dressel 20 oil, Dressel 2–4 wine), sacks of grain, bricks, crates.
  const cargo: [string, number][] = [['amphora_stack', 0], ['sack', 1], ['crate', 2], ['amphora_rack', 0], ['dolium', 1], ['amphora_stack', 2]];
  for (let k = 0; k < (hi ? 14 : 6); k++) {
    const cx = x0 + 6 + k * ((x1 - x0 - 12) / (hi ? 13 : 5)) + rng.range(-1, 1);
    const cz = faceZ + rng.range(5.5, 8.5);
    if (insideAny(cx, cz, blocked)) continue;
    const [kind, v] = cargo[k % cargo.length];
    placeProp(d, kind as never, cx, top(cx, cz), cz, rng.range(0, 6), { variant: v });
    if (k % 3 === 0) spots.push(spot(`portus-tiberinus:cargo-${k}`, 'container', cx, top(cx, cz), cz - 1.2, 0));
  }
  // Storerooms (cellae) behind the quay: brick vaults opening onto it, in units of four cells
  // under their own gabled roofs (alternating heights), slit windows to the street behind.
  // (Back faces 0.3 m behind the quay deck's edge, so the deck's skirt stays inside the walls.)
  const sz1 = Dd / 2 - 0.7;
  const sz0 = sz1 - 6.5;
  const blocks = hi ? [[-W * 0.4, -W * 0.12], [W * 0.02, W * 0.38]] : [[-W * 0.4, W * 0.38]];
  for (const [ax, bx] of blocks) {
    if (insideAny((ax + bx) / 2, (sz0 + sz1) / 2, blocked)) continue;
    const y = Math.min(top(ax, sz0), top(bx, sz0));
    const nUnit = Math.max(1, Math.round((bx - ax) / 17));
    const uw = (bx - ax) / nUnit;
    for (let u = 0; u < nUnit; u++) {
      const ux0 = ax + u * uw;
      const ux1 = ux0 + uw;
      const h = u % 2 ? 5.2 : 4.4;
      d.span('brick', ux0, y - 1.0, sz0 + 0.6, ux1, y + h, sz1, { collide: true });
      // Brick pilasters at the unit ends and a travertine string course on the quay side.
      for (const x of [ux0, ux1]) d.span('brick', x - 0.35, y - 1.0, sz0 + 0.35, x + 0.35, y + h + 0.1, sz0 + 0.62);
      d.span('travertine', ux0, y + 3.3, sz0 + 0.45, ux1, y + 3.45, sz0 + 0.62);
      const nCell = 4;
      for (let k = 0; k < nCell; k++) {
        const cx = ux0 + ((k + 0.5) * uw) / nCell;
        d.span('black', cx - 1.2, y, sz0 + 0.58, cx + 1.2, y + 2.7, sz0 + 0.62, { shadow: false });
        d.span('travertine', cx - 1.4, y + 2.7, sz0 + 0.5, cx + 1.4, y + 2.95, sz0 + 0.7); // lintel
        if (hi) d.span('black', cx - 0.25, y + h - 1.6, sz1 - 0.02, cx + 0.25, y + h - 0.6, sz1 + 0.01, { shadow: false }); // slit window behind
        if (k % 2 === 0) spots.push(spot(`portus-tiberinus:cella-${Math.round(cx)}`, 'door', cx, y, sz0 - 0.3, Math.PI));
      }
      const m = new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition((ux0 + ux1) / 2, 0, (sz0 + sz1) / 2 + 0.3);
      gableRoof(b, -(sz1 - sz0) / 2 - 0.6, (sz1 - sz0) / 2 + 0.6, -uw / 2 - 0.15, uw / 2 + 0.15, y + h, 18, 'roof_tile', hi, m);
    }
    paintedSign(b, ['HORREA', 'VINVM·OLEVM·LATERES'], 2.2, 0.8, T(ax + uw / 2, y + 3.95, sz0 + 0.33));
  }
  // The harbour master's office (statio) by the stairs: a small travertine kiosk with a counter.
  const st = [W * 0.08, faceZ + 9.5] as const;
  if (!insideAny(st[0], st[1], blocked)) {
    const y = top(st[0], st[1]);
    d.span('plaster_cream', st[0] - 2, y, st[1] - 1.6, st[0] + 2, y + 3.2, st[1] + 1.6, { collide: true });
    d.span('roof_tile', st[0] - 2.3, y + 3.2, st[1] - 1.9, st[0] + 2.3, y + 3.4, st[1] + 1.9);
    d.span('black', st[0] - 1.2, y + 1.0, st[1] - 1.62, st[0] + 1.2, y + 2.3, st[1] - 1.58, { shadow: false });
    d.span('travertine', st[0] - 1.4, y, st[1] - 2.0, st[0] + 1.4, y + 1.0, st[1] - 1.6, { collide: true });
    inscriptionPanel(b, { lines: ['STATIO', 'PORTVS·TIBERINI'], width: 2.2, height: 0.5, style: 'painted', interpunct: false }, T(st[0], y + 2.65, st[1] - 1.62), { depth: 0.02 });
    spots.push(spot('portus-tiberinus:statio', 'vendor', st[0], y, st[1] - 2.6, 0));
    spots.push(spot('portus-tiberinus:notice', 'inscription', st[0] + 1.0, y, st[1] - 2.8, 0));
  }
  // Barges (naves caudicariae) and lighters moored along the face, bow upstream.
  const boats: [BoatKind, number][] = hi ? [['caudicaria', -W * 0.36], ['caudicaria', -W * 0.1], ['scapha', W * 0.06], ['caudicaria', W * 0.26], ['linter', W * 0.42]] : [['caudicaria', -W * 0.1], ['caudicaria', W * 0.26]];
  for (const [kind, bx] of boats) {
    const bz = faceZ - 0.9 - (kind === 'caudicaria' ? 2.6 : 1.5) - 0.3;
    if (insideAny(bx, bz, blocked)) continue;
    const bd = d.at(bx, water, bz, Math.PI / 2 + rng.range(-0.04, 0.04));
    boat(bd, kind, rng, hi);
    // Mooring line to the nearest stone.
    d.rod('fabric_ochre', V(bx - 5, water + 1.0, bz + 1.2), V(bx - 5.5, water + 0.9, faceZ - 1.0), 0.02, 3);
    spots.push(spot(`portus-tiberinus:boat-${Math.round(bx)}`, 'npc', bx, water + 0.6, bz, Math.PI / 2));
  }
  spots.push(spot('portus-tiberinus:quay', 'spawn', 0, top(0, faceZ + 4), faceZ + 4, Math.PI));
  return { object: b.build(lm.id), colliders: b.colliders, spots, cullDistance: 900 };
}

// ------------------------------------------------------------------ Cloaca Maxima outfall

function cloacaOutlet(ctx: LandmarkContext) {
  const { S, lm } = ctx;
  const hi = ctx.detail === 'high';
  const b = ctx.builder();
  const env = riverEnv(ctx);
  const d = draw(b);
  const water = env.waterY;
  const bed = env.bedY;
  const quayTop = 10 * S - env.baseY; // quay surface 10 m ASL
  const floor = 4.7 * S - env.baseY; // arch floor 4.7 m ASL: the mouth is half drowned
  const span = 4.5 * S;
  const r = span / 2;
  const spring = floor + 4.2 * S - r; // channel 4.2 m high
  const W = 7.5;
  // The outfall opens where the bank meets the water: find the waterline straight out from the
  // atlas point (the drain runs under the bank behind it).
  let zE = 0;
  while (zE > -30 && ctx.groundAt(0, zE) > water + 0.25) zE -= 0.25;
  zE += 0.4;
  const z0 = zE, z1 = zE + 3.2;
  const mat: MaterialId = 'tufa';
  const ringTop = spring + r + 3 * 0.5;
  const top = Math.max(quayTop, ringTop + 0.35, ctx.groundAt(0, z1) + 0.6);
  const hole: V2[] = [[-r, floor], [r, floor]];
  for (let i = 0; i <= 16; i++) {
    const a = (Math.PI * i) / 16;
    hole.push([Math.cos(a) * r, spring + Math.sin(a) * r]);
  }
  const slab = extrudePolygon([[-W, bed - 0.6], [W, bed - 0.6], [W, top], [-W, top]], z1 - z0, [hole]);
  slab.translate(0, 0, z1);
  b.add(slab, mat, T(0, 0, 0));
  d.solid(-W, bed - 0.6, z0, -r, top, z1);
  d.solid(r, bed - 0.6, z0, W, top, z1);
  d.solid(-r, spring + r, z0, r, top, z1);
  d.span('travertine', -W - 0.1, top, z0 - 0.15, W + 0.1, top + 0.22, z1 + 0.1); // coping
  // Earth fill over the channel behind the headwall, ramping down to the bank, between wing walls.
  const zBack = Math.max(z1 + 4, 3);
  const gBack = ctx.groundAt(0, zBack);
  const fillRun = zBack - z1;
  const ang = Math.atan2(top - gBack, fillRun);
  const len = Math.hypot(fillRun, top - gBack);
  const th = top - bed + 1;
  d.box('gravel', 0, (top + gBack) / 2 - Math.cos(ang) * th * 0.5, (z1 + zBack) / 2 - Math.sin(ang) * th * 0.5, W * 2, th, len + 0.1, { rx: ang, collide: true });
  for (const sx of [-1, 1]) {
    d.box(mat, sx * (W - 0.3), (top + gBack) / 2 + 0.3, (z1 + zBack) / 2, 0.6, 1.0, len, { rx: ang, collide: true });
    d.span(mat, sx * (W - 0.6), bed - 0.6, z1, sx * W, Math.max(top, gBack) - 0.2, zBack, {});
  }
  // Three concentric rings of voussoirs (Gabine stone and Grotta Oscura tufa), proud of the face.
  const ringT = 0.5;
  const rings: MaterialId[] = ['travertine', 'tufa', 'travertine'];
  rings.forEach((m, k) => {
    const ri = r + k * ringT;
    const ro = ri + ringT;
    const n = hi ? 13 : 7;
    for (let i = 0; i < n; i++) {
      const a0 = (Math.PI * i) / n;
      const a1 = (Math.PI * (i + 1)) / n;
      const am = (a0 + a1) / 2;
      const len = ((ri + ro) / 2) * (a1 - a0) - 0.03;
      d.box(m, (Math.cos(am) * (ri + ro)) / 2, spring + (Math.sin(am) * (ri + ro)) / 2, z0 - 0.08 + 0.03 * k, len, ringT - 0.02, 0.2, { rz: am - Math.PI / 2 });
    }
  });
  // The vault behind the mouth (the channel) disappears into darkness behind an iron grating.
  d.span(mat, -r - 0.3, floor - 0.2, z1, -r, spring + r, z1 + 3);
  d.span(mat, r, floor - 0.2, z1, r + 0.3, spring + r, z1 + 3);
  d.span('black', -r, floor, z1 + 2.6, r, spring + r, z1 + 2.7, { shadow: false });
  for (let x = -r + 0.25; x < r; x += 0.3) d.box('iron', x, (floor + spring + r) / 2, z1 + 1.8, 0.05, spring + r - floor, 0.05);
  d.span('iron', -r, spring + r * 0.6, z1 + 1.75, r, spring + r * 0.6 + 0.08, z1 + 1.85);
  d.solid(-r, floor - 0.2, z1 + 1.7, r, spring + r, z1 + 1.9);
  // Maintenance ledge inside the mouth (above normal water) and a stair down from the quay.
  const ledgeY = water + 0.3;
  d.span('travertine', -r, floor, z0 - 0.2, -r + 0.7, ledgeY, z1 + 1.6, { collide: true });
  const sc = stepCount(top - ledgeY, 0.2);
  const run = 0.3;
  // Flight along the face from the quay top (at x = −W) down toward the mouth, on a spur in the water.
  const m = new THREE.Matrix4().makeRotationY(-Math.PI / 2).setPosition(-r - 0.3, ledgeY, z0 - 0.8);
  stairs(b, { width: 1.3, rise: sc.rise, run, count: sc.count, material: 'travertine' }, m);
  d.span('travertine', -W, bed - 0.6, z0 - 1.5, -r, ledgeY, z0, { collide: true }); // landing spur
  d.span('travertine', -W, ledgeY, z0 - 1.6, -r, ledgeY + 0.9, z0 - 1.45, { collide: true }); // parapet of the landing
  const spots: Spot[] = [
    spot('cloaca-maxima-outlet:grate', 'door', -r + 0.35, ledgeY, z1 + 1.2, 0),
    spot('cloaca-maxima-outlet:quay', 'vista', -W + 1, top, z1 + 1.0, Math.PI),
  ];
  return { object: b.build(lm.id), colliders: b.colliders, spots };
}

export const builders: LandmarkBuilder[] = [
  { handles: ['forum-boarium'], build: forumBoarium },
  { handles: ['portus-tiberinus'], build: portusTiberinus },
  { handles: ['cloaca-maxima-outlet'], build: cloacaOutlet },
];
