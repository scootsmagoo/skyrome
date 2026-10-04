/**
 * The river front below the Capitol and the Palatine: the Forum Boarium (Rome's cattle market,
 * with porticoed shop rows round the square, pens and tethered oxen, butchers and hawkers, the
 * bronze bull from Aegina), the quays of the Portus Tiberinus (dressing the terrain module's stone
 * quay: treadwheel cranes, cargo, storerooms, the harbour office and the towed river barges from
 * Ostia moored at its mooring stones) and the outfall of the Cloaca Maxima (the sewer dungeon's
 * entrance: an arched outfall projecting from the quay, a ledge inside to the iron grating).
 */
import * as THREE from 'three';
import { T, extrudePolygon, type V2 } from '../../../arch/common/geom';
import { inscriptionPanel, paintedSign } from '../../../arch/common/inscription';
import { stairs, stepCount } from '../../../arch/common/stairs';
import { buildPlaza, insula, treadwheelCrane, type Draw } from '../../../arch/fabric';
import { placeProp } from '../../../arch/props';
import type { MaterialId } from '../../../gfx/materialIds';
import type { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { Rng } from '../../../core/Rng';
import type { LandmarkBuilder, LandmarkContext, Spot } from '../types';
import { boat, bridgeCorridors, draw, fence, gableRoof, insideAny, neighbourFootprints, quayEdge, quayFrame, riverEnv, roadCorridors, spot, V, type BoatKind, type QuayEdge, type QuayPoint, type RiverEnv } from './river-kit';
import { LampList, riverLife } from './river-life';
import { bovine, emitBronze, HideMesh, type Hide } from './river-sculpt';

const HIDES: Hide[] = ['white', 'white', 'grey', 'red', 'piebald', 'dun', 'white', 'grey'];

/** A live ox or cow (vertex-coloured hide) at a Draw frame point. */
function liveOx(hides: HideMesh, f: Draw, x: number, y: number, z: number, rotY: number, rng: Rng, hi: boolean, pose: 'stand' | 'graze' | 'lie' = 'stand') {
  const m = f.m.clone().multiply(new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y, z));
  const sex = rng.chance(0.3) ? 'cow' : 'ox';
  hides.add(bovine({ sex, pose, hi, scale: rng.range(0.92, 1.05), horns: rng.range(0.8, 1.15) }), m, HIDES[Math.floor(rng.next() * HIDES.length)], rng);
  // A body collider so nobody walks through the beast.
  f.sub(new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y, z)).solid(-0.36, pose === 'lie' ? 0 : 0.3, -0.95, 0.36, pose === 'lie' ? 0.8 : 1.4, 0.9);
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
  const taken: V2[][] = [];
  const inPoly = (x: number, z: number) => insideAny(x, z, [poly]);
  const clear = (x: number, z: number, r: number) => {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (!inPoly(px, pz) || insideAny(px, pz, blocked) || insideAny(px, pz, taken)) return false;
    }
    return inPoly(x, z) && !insideAny(x, z, blocked) && !insideAny(x, z, taken);
  };
  const take = (x: number, z: number, r: number) => taken.push([[x - r, z - r], [x + r, z - r], [x + r, z + r], [x - r, z + r]]);
  // Things stand on the paving (lifted 0.1 m over the terrain).
  const g = (x: number, z: number) => ctx.groundAt(x, z) + 0.1;
  const spots: Spot[] = [];
  const lamps = new LampList();
  const hides = new HideMesh();

  // ---- porticoed shop rows round the square (two-storey brick blocks, Neronian arcades)
  edgeRows(ctx, b, poly, blocked, taken, spots, lamps, hi);

  // ---- the bronze bull from Aegina on its base, near the middle of the square
  const bull = firstClear(clear, 3.5, [[4, 2], [8, 6], [0, 10], [10, -4], [-6, 8]]);
  if (bull) {
    const [bx, bz] = bull;
    const t = d.at(bx, g(bx, bz), bz, -0.6);
    t.span('marble', -1.6, 0, -2.4, 1.6, 0.3, 2.4, { collide: true });
    t.span('marble', -1.3, 0.3, -2.1, 1.3, 1.5, 2.1, { collide: true });
    t.span('marble', -1.45, 1.5, -2.25, 1.45, 1.66, 2.25);
    emitBronze(b, bovine({ sex: 'bull', hi, hero: hi, scale: 1.18, horns: 0.9 }), 'bronze', t.m.clone().multiply(T(0, 1.66, 0.05)));
    inscriptionPanel(b, { lines: ['BOS·AENEVS', 'EX·AEGINA'], width: 1.4, height: 0.4, style: 'carved' }, t.m.clone().multiply(T(0, 0.9, -2.105)), { depth: 0.02 });
    take(bx, bz, 3);
    const v = t.point(0, 0, -3.2);
    spots.push(spot('forum-boarium:bull', 'vista', v.x, g(v.x, v.z), v.z, t.yaw));
  }
  // ---- cattle pens (post-and-rail) with oxen, troughs and hay, toward the Circus side (south)
  const pens: [number, number][] = [];
  for (const c of [[16, 30], [3, 34], [-10, 30], [20, 16], [-14, 18], [-20, 6], [28, 30], [-24, 34], [30, 2]] as [number, number][]) {
    if (pens.length >= (hi ? 6 : 3)) break;
    if (clear(c[0], c[1], 6.5)) {
      pens.push(c);
      take(c[0], c[1], 5.6);
    }
  }
  pens.forEach(([px, pz], i) => {
    const w = 9, dd = 7;
    const y = g(px, pz);
    const p = d.at(px, y, pz, (i % 2) * 0.12);
    fence(p, [[-w / 2, -dd / 2], [w / 2, -dd / 2], [w / 2, dd / 2], [-w / 2, dd / 2]], { closed: true, gap: 2.0, height: 1.3 });
    placeProp(p, 'trough', w / 2 - 1.2, 0, 0, Math.PI / 2, { variant: i % 3 });
    // Straw on the ground, a hay heap, and a few head of cattle.
    p.span('dry_grass', -w / 2 + 0.3, 0.0, -dd / 2 + 0.3, w / 2 - 0.3, 0.04, dd / 2 - 0.3, { shadow: false });
    p.ellipsoid('dry_grass', -w / 2 + 1.3, 0.25, dd / 2 - 1.2, 0.9, 0.5, 0.7, { seg: [8, 5] });
    const nOx = hi ? 3 : 2;
    for (let k = 0; k < nOx; k++) {
      const ox0 = -w / 2 + 2.2 + k * ((w - 4.4) / Math.max(1, nOx - 1));
      const oz = rng.range(-1.2, 1.2);
      liveOx(hides, p, ox0, 0.04, oz, rng.range(-1.2, 1.2) + (k % 2 ? Math.PI : 0), rng, hi, k === 1 ? 'graze' : rng.chance(0.25) ? 'lie' : 'stand');
    }
    const dv = p.point(-w / 2 - 0.9, 0, -dd / 2 + 1.0);
    spots.push(spot(`forum-boarium:drover-${i}`, 'npc', dv.x, y, dv.z, p.yaw + Math.PI / 2));
    const gate = p.point(-w / 2 + 1.0, 0, -dd / 2 - 1.3);
    spots.push(spot(`forum-boarium:pen-${i}`, 'stall', gate.x, y, gate.z, p.yaw));
    // A torch on the gate post, lit at dusk (the pens are busy before dawn).
    if (i % 2 === 0) {
      p.cyl('wood_dark', -w / 2 - 0.25, 1.1, -dd / 2 - 0.25, 0.07, 2.2, 5);
      placeProp(p.at(-w / 2 - 0.25, 1.75, -dd / 2 - 0.32), 'torch_bracket', 0, 0, 0, 0, { collide: false });
      const tp = p.point(-w / 2 - 0.25, 2.2, -dd / 2 - 0.6);
      lamps.add(tp.x, tp.y, tp.z, 'torch');
    }
  });
  // ---- the aediles' notice by the pens (a readable board)
  const nbd = firstClear(clear, 1.2, [[8, 22], [-4, 24], [12, 38], [-18, 26], [24, 22]]);
  if (nbd) {
    const y = g(nbd[0], nbd[1]);
    d.span('wood_dark', nbd[0] - 0.06, y, nbd[1] - 0.06, nbd[0] + 0.06, y + 2.2, nbd[1] + 0.06, { collide: true });
    paintedSign(b, ['BOVES·VENALES', 'NVNDINIS'], 1.3, 0.7, T(nbd[0], y + 1.6, nbd[1] - 0.08));
    take(nbd[0], nbd[1], 0.8);
    spots.push(spot('forum-boarium:edict', 'inscription', nbd[0], y, nbd[1] - 1.2, 0));
  }
  // ---- tethering rails with oxen tied up, waiting for buyers
  for (const [rx, rz, ry] of [[-4, 12, 0.1], [14, 8, -0.2], [-16, 30, 0.3]] as [number, number, number][]) {
    if (!clear(rx, rz, 4.2)) continue;
    const y = g(rx, rz);
    const t = d.at(rx, y, rz, ry);
    for (const x of [-3, 0, 3]) t.cyl('wood_dark', x, 0.55, 0, 0.07, 1.1, 5, { collide: true });
    t.rod('wood', V(-3.1, 0.95, 0), V(3.1, 0.95, 0), 0.05, 5);
    for (const x of hi ? [-1.9, 1.3] : [-1.2]) {
      liveOx(hides, t, x, 0, 1.4, Math.PI + rng.range(-0.15, 0.15), rng, hi);
      t.rod('fabric_ochre', V(x, 0.95, 0.05), V(x, 1.0, 0.2), 0.015, 3, { shadow: false });
    }
    take(rx, rz, 3.6);
    const v = t.point(3.8, 0, -0.6);
    spots.push(spot(`forum-boarium:dealer-${Math.round(rx)}`, 'npc', v.x, y, v.z, t.yaw - Math.PI / 2));
  }
  // ---- a yoked pair with a cart of amphorae, and handcarts of fodder
  for (const [cx, cz, cr] of [[22, -8, 2.2], [-22, -12, -0.6]] as [number, number, number][]) {
    if (!clear(cx, cz, 4.5)) continue;
    const y = g(cx, cz);
    const t = d.at(cx, y, cz, cr);
    placeProp(t, 'cart', 0, 0, 1.6, 0, { variant: cx > 0 ? 0 : 1 });
    for (const sx of [-0.5, 0.5]) liveOx(hides, t, sx, 0, -0.75, 0, rng, hi);
    take(cx, cz, 4);
    const v = t.point(-1.6, 0, -1.2);
    spots.push(spot(`forum-boarium:carter-${cx > 0 ? 'a' : 'b'}`, 'npc', v.x, y, v.z, t.yaw + Math.PI / 2));
  }
  for (const [hx, hz] of [[-8, -2], [18, 22]] as [number, number][]) {
    if (!clear(hx, hz, 1.6)) continue;
    placeProp(d, 'handcart', hx, g(hx, hz), hz, rng.range(0, 6), { variant: 1 });
    take(hx, hz, 1.2);
  }
  // ---- butchers' tables (lanii) and hawkers' stalls in two market lanes
  const stalls: [number, number][] = [];
  for (const z of [-20, -13, -6]) for (let x = -30; x <= 32; x += 5.4) stalls.push([x + (z === -13 ? 2.7 : 0), z]);
  // A second market north of the street to the Pons Aemilius, and fodder sellers by the pens.
  for (const z of [-50, -57]) for (let x = -10; x <= 40; x += 5.4) stalls.push([x + (z === -57 ? 2.7 : 0), z]);
  for (let x = 14; x <= 36; x += 5.4) stalls.push([x, 4]);
  let n = 0;
  const maxStalls = hi ? 28 : 10;
  for (const [sx, sz] of stalls) {
    if (n >= maxStalls || !clear(sx, sz, 2.2)) continue;
    const y = g(sx, sz);
    // Stalls face the lanes: the north row faces the middle row across the lane, the middle
    // row faces back, the south row faces the open square.
    const face = sz === -13 || sz === -50 ? 0 : Math.PI;
    const s = d.at(sx, y, sz, face + (n % 3 === 0 ? 0.04 : -0.03));
    take(sx, sz, 1.9);
    if (n % 3 === 0) {
      // Butcher: a heavy table, a chopping block, a rail of hanging joints behind him, a brazier.
      placeProp(s, 'table', 0, 0, 0, 0, { variant: 1 });
      placeProp(s, 'chopping_block', 1.25, 0, 0.0, 0.2, { variant: 0 });
      s.span('wood_dark', -1.2, 2.0, 1.7, 1.2, 2.08, 1.77);
      for (const x of [-1.15, 1.15]) s.cyl('wood_dark', x, 1.0, 1.73, 0.05, 2.0, 5, { collide: true });
      for (const x of [-0.8, -0.25, 0.35, 0.85]) s.ellipsoid('plaster_red', x, 1.6, 1.73, 0.14, 0.32, 0.1, { seg: [8, 5] });
      placeProp(s, 'brazier', -1.55, 0, 0.9, 0);
      const bp = s.point(-1.55, 0.85, 0.9);
      lamps.add(bp.x, bp.y, bp.z, 'brazier');
      const v = s.point(0, 0, 1.0);
      spots.push(spot(`forum-boarium:butcher-${n}`, 'vendor', v.x, y, v.z, s.yaw + Math.PI));
    } else {
      placeProp(s, n % 3 === 1 ? 'stall_fruit' : n % 2 ? 'stall_cloth' : 'stall_pottery', 0, 0, 0, 0, { variant: n % 3 });
      if (n % 4 === 1) {
        // An oil lamp hung from the awning pole, lit at dusk.
        const lp = s.point(1.2, 2.0, -0.8);
        lamps.add(lp.x, lp.y, lp.z, 'lamp');
      }
      const v = s.point(0, 0, 1.15);
      spots.push(spot(`forum-boarium:hawker-${n}`, 'stall', v.x, y, v.z, s.yaw + Math.PI));
    }
    n++;
  }
  // ---- the sealed stone chamber where victims were once buried alive (a quest hook)
  const ch = firstClear(clear, 2.2, [[-8, 12], [-4, 20], [12, 4], [-16, 0], [-12, 40]]);
  if (ch) {
    const [cx, cz] = ch;
    const y = g(cx, cz);
    const c = d.at(cx, y, cz, 0.3);
    c.span('peperino', -1.4, 0, -1.0, 1.4, 0.16, 1.0, { collide: true });
    c.span('tufa', -1.25, 0.16, -0.85, 1.25, 0.22, 0.85, { collide: true });
    c.cyl('iron', 0, 0.25, 0, 0.16, 0.04, 10, { open: true });
    take(cx, cz, 1.8);
    const v = c.point(0, 0, -1.9);
    spots.push(spot('forum-boarium:sealed-chamber', 'shrine', v.x, y, v.z, c.yaw));
  }
  // ---- a cattle dealer's strongbox by a stack of fodder sacks, a bench, the dealers' board
  const sb = firstClear(clear, 3.0, [[22, 4], [-22, 18], [14, -6], [-26, 4], [26, 40], [-14, 40], [34, 14]]);
  if (sb) {
    const y = g(sb[0], sb[1]);
    const s = d.at(sb[0], y, sb[1]);
    placeProp(s, 'crate', 0, 0, 0, 0.3, { variant: 2 });
    for (let k = 0; k < 4; k++) placeProp(s, 'sack', 1.0 + (k % 2) * 0.6, k > 1 ? 0.45 : 0, 0.2, k, { variant: k % 3, collide: k < 2 });
    placeProp(s, 'bench', -1.6, 0, 0.4, 0, { variant: 0 });
    d.span('wood_dark', sb[0] + 2.54, y, sb[1] + 0.84, sb[0] + 2.66, y + 2.1, sb[1] + 0.96, { collide: true });
    paintedSign(b, ['NEGOTIATORES·BOARII', 'HERCVLI·DECVMAM'], 1.5, 0.6, T(sb[0] + 2.6, y + 1.55, sb[1] + 0.82));
    take(sb[0], sb[1], 3.0);
    spots.push(spot('forum-boarium:dealer-box', 'container', sb[0], y, sb[1] - 1.0, 0));
    spots.push(spot('forum-boarium:bench', 'sit', sb[0] - 1.6, y + 0.47, sb[1] + 0.4, Math.PI));
    spots.push(spot('forum-boarium:shrine-board', 'inscription', sb[0] + 2.6, y, sb[1] - 0.5, 0));
  }
  spots.push(spot('forum-boarium:centre', 'spawn', 0, g(0, 0), 0, 0));
  const object = b.build(lm.id);
  const herd = hides.build(`${lm.id}:cattle`);
  if (herd) object.add(herd);
  riverLife(ctx, spots, lamps);
  return { object, colliders: b.colliders, spots, cullDistance: 700 };
}

function firstClear(clear: (x: number, z: number, r: number) => boolean, r: number, cands: [number, number][]): [number, number] | null {
  for (const c of cands) if (clear(c[0], c[1], r)) return c;
  return null;
}

/**
 * Two-storey brick shop blocks with a street arcade (the fabric kit's insula with `portico`) along
 * the edges of the square that do not face the river, set inside the footprint wherever the
 * roads, bridges and neighbouring monuments leave a clear strip.
 */
function edgeRows(ctx: LandmarkContext, b: MeshBuilder, poly: V2[], blocked: V2[][], taken: V2[][], spots: Spot[], lamps: LampList, hi: boolean) {
  const n = poly.length;
  // Polygon orientation, so inward normals can be found per edge.
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i], c = poly[(i + 1) % n];
    area += a[0] * c[1] - c[0] * a[1];
  }
  const D = 11; // block depth (portico 3.2 + shops)
  let placed = 0;
  const maxBlocks = hi ? 6 : 4;
  for (let i = 0; i < n && placed < maxBlocks; i++) {
    const A = poly[i], B = poly[(i + 1) % n];
    const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const ux = (B[0] - A[0]) / len, uz = (B[1] - A[1]) / len;
    // Inward normal (left of the edge for a counter-clockwise polygon in x/z).
    const sgn = area > 0 ? 1 : -1;
    const nx = -uz * sgn, nz = ux * sgn;
    // Not along the river (outward normal toward the west): the temples face the water there.
    if (nx > 0.5) continue;
    let t = 4;
    while (t < len - 12 && placed < maxBlocks) {
      let done = false;
      for (const W of [24, 18, 13]) {
        if (t + W > len - 4) continue;
        const cx = A[0] + ux * (t + W / 2) + nx * (1.2 + D / 2);
        const cz = A[1] + uz * (t + W / 2) + nz * (1.2 + D / 2);
        const corners: V2[] = [];
        for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0], [0, 0]] as const)
          corners.push([cx + ux * (a * W) / 2 + nx * (c * D) / 2, cz + uz * (a * W) / 2 + nz * (c * D) / 2]);
        const ok = corners.every((p) => insideAny(p[0], p[1], [poly]) && !insideAny(p[0], p[1], blocked) && !insideAny(p[0], p[1], taken));
        if (!ok) continue;
        // Local frame of the block: x along the edge, front (−z) toward the square.
        const rot = Math.atan2(nx, nz) + Math.PI;
        const c = Math.cos(rot), s = Math.sin(rot);
        const toL = (bx: number, bz: number): V2 => [cx + bx * c + bz * s, cz - bx * s + bz * c];
        let floor = -Infinity;
        for (let k = 0; k <= 4; k++) {
          const [fx, fz] = toL(-W / 2 + (W * k) / 4, -D / 2);
          floor = Math.max(floor, ctx.groundAt(fx, fz) + 0.12);
        }
        const out = insula({
          width: W,
          depth: D,
          storeys: 2,
          seed: 113 + placed * 7 + i,
          wealth: 0.35,
          finish: placed % 2 ? 'plaster' : 'brick',
          plaster: 'plaster_ochre',
          portico: true,
          roof: 'gable',
          openShopChance: 0.85,
          groundAt: (lx, lz) => {
            const [wx, wz] = toL(lx, lz);
            return ctx.groundAt(wx, wz) - floor;
          },
          sides: { back: false },
          detail: hi ? 'full' : 'low',
        });
        const m = new THREE.Matrix4().makeRotationY(rot).setPosition(cx, floor, cz);
        b.append(out.builder, m);
        taken.push(corners.slice(0, 4));
        // Shopkeepers at their thresholds; a bronze lampstand at each end of the arcade.
        out.spots.forEach((sp, k) => {
          if (sp.kind !== 'shopDoor') return;
          const p = sp.position.clone().applyMatrix4(m);
          spots.push(spot(`forum-boarium:shop-${placed}-${k}`, 'vendor', p.x, p.y, p.z, sp.facing + rot));
        });
        for (const ex of [-W / 2 + 0.6, W / 2 - 0.6]) {
          const [lx, lz] = toL(ex, -D / 2 - 0.7);
          const ly = ctx.groundAt(lx, lz) + 0.1;
          placeProp(draw(b), 'lampstand', lx, ly, lz, 0, { collide: true });
          lamps.add(lx, ly + 1.45, lz, 'lamp');
        }
        placed++;
        t += W + 5;
        done = true;
        break;
      }
      if (!done) t += 3;
    }
  }
}

// ------------------------------------------------------------------ Portus Tiberinus

/** True when the heightmap already shapes stone quays (the terrain/water module's riverbanks). */
function ownQuayEdge(ctx: LandmarkContext, env: RiverEnv, faceZ: number, x0: number, x1: number, quayTop: number): QuayEdge {
  const S = ctx.S;
  const at = (s: number, inland = 0): QuayPoint => ({ x: s * S, z: faceZ - 0.9 + inland, tx: 1, tz: 0, nx: 0, nz: 1 });
  return {
    quay: null as never,
    river: null as never,
    s0: x0 / S,
    s1: x1 / S,
    top: quayTop,
    coping: quayTop + 0.2,
    water: env.waterY,
    bed: env.bedY,
    at,
    project: (x, z) => ({ s: x / S, inland: z - (faceZ - 0.9) }),
    moorings: [],
    stairs: [],
    gaps: [],
  };
}

function portusTiberinus(ctx: LandmarkContext) {
  const { S, lm, rng } = ctx;
  const hi = ctx.detail === 'high';
  const b = ctx.builder();
  const env = riverEnv(ctx);
  const d = draw(b);
  const fp = lm.footprint as { w: number; d: number };
  const W = fp.w * S;
  const Dd = fp.d * S;
  const nb = neighbourFootprints(ctx, env, { grow: 2 });
  const bridges = bridgeCorridors(ctx, env, 30, 1.5);
  const blocked = [...nb.map((n) => n.poly), ...bridges];
  const spots: Spot[] = [];
  const lamps = new LampList();
  const terrainQ = quayEdge(ctx, env);
  const quayTop = terrainQ?.top ?? 10 * S - env.baseY; // quay surface 10 m ASL (research §5.3)
  let q: QuayEdge;
  let sA: number, sB: number;
  if (terrainQ) {
    q = terrainQ;
    // The stretch of the terrain's quay that lies along this landmark's footprint.
    sA = Infinity;
    sB = -Infinity;
    for (let s = q.quay.s0; s <= q.quay.s1; s += 1) {
      const p = q.at(s);
      if (Math.abs(p.x) < W / 2 - 4 && Math.abs(p.z) < Dd / 2 + 15) {
        sA = Math.min(sA, s);
        sB = Math.max(sB, s);
      }
    }
    if (!Number.isFinite(sA)) {
      sA = q.s0;
      sB = q.s1;
    }
  } else {
    // No terrain quays: build our own straight quay wall and deck along the frame.
    const faceZ = -1.6;
    const x0 = -W / 2 + 4, x1 = W / 2 - 4;
    q = ownQuayEdge(ctx, env, faceZ, x0, x1, quayTop);
    sA = q.s0;
    sB = q.s1;
    ownQuay(ctx, b, d, q, faceZ, x0, x1, Dd, blocked, spots, hi);
  }
  const top = q.top;
  const water = q.water;
  const len = sB - sA;
  const at = (f: number, inland: number) => q.at(sA + len * f, inland);
  const nearStair = (s: number, r: number) => q.stairs.some((st) => Math.abs(s - st) < r) || q.gaps.some((g) => Math.abs(s - g.s) < g.half + r);
  const free = (p: QuayPoint) => !insideAny(p.x, p.z, blocked);

  // What stands on the quay, as chainage intervals (real m) × inland bands (game m), so the
  // office, cranes, cargo and the spawn never overlap.
  const occ: { a: number; b: number; i0: number; i1: number }[] = [];
  const isFree = (s: number, half: number, i0: number, i1: number) => !occ.some((o) => s + half / S > o.a && s - half / S < o.b && i1 > o.i0 && i0 < o.i1);
  const occupy = (s: number, half: number, i0: number, i1: number) => occ.push({ a: s - half / S, b: s + half / S, i0, i1 });

  // The harbour master's office (statio) by a stair: a small plastered kiosk with a counter.
  const stS = q.stairs.find((st) => st > sA && st < sB) ?? sA + len * 0.3;
  const stP = q.at(stS + 7 / S, 4.6);
  if (free(stP) && stS + 7 / S < sB) {
    occupy(stS + 7 / S, 3.4, 1.5, 7.0);
    const f = quayFrame(d, stP, top);
    f.span('plaster_cream', -2, 0, -1.6, 2, 3.2, 1.6, { collide: true });
    f.span('roof_tile', -2.3, 3.2, -1.9, 2.3, 3.4, 1.9);
    f.span('black', -1.2, 1.0, -1.62, 1.2, 2.3, -1.58, { shadow: false });
    f.span('travertine', -1.4, 0, -2.0, 1.4, 1.0, -1.6, { collide: true });
    inscriptionPanel(b, { lines: ['STATIO', 'PORTVS·TIBERINI'], width: 2.2, height: 0.5, style: 'painted', interpunct: false }, f.m.clone().multiply(T(0, 2.65, -1.62)), { depth: 0.02 });
    placeProp(f, 'brazier', 2.7, 0, -1.4, 0);
    const bp = f.point(2.7, 0.85, -1.4);
    lamps.add(bp.x, bp.y, bp.z, 'brazier');
    const v = f.point(0, 0, -2.6);
    spots.push(spot('portus-tiberinus:statio', 'vendor', v.x, top, v.z, f.yaw));
    const nv = f.point(-1.2, 0, -3.0);
    spots.push(spot('portus-tiberinus:notice', 'inscription', nv.x, top, nv.z, f.yaw));
  }
  // Treadwheel cranes on the quay, behind the coping, leaning out over the barges (the frame
  // reaches 3.2 m either side to the guy stakes and 9 m inland).
  const cranes: number[] = [];
  for (const fr of hi ? [0.12, 0.5, 0.88, 0.62, 0.3] : [0.5, 0.62]) {
    if (cranes.length >= (hi ? 3 : 1)) break;
    const s = sA + len * fr;
    if (nearStair(s, 10) || !free(q.at(s, 2)) || !isFree(s, 3.6, 0, 9.5)) continue;
    occupy(s, 3.6, 0, 9.5);
    cranes.push(s);
    const p = q.at(s, 1.7);
    const f = quayFrame(d, p, top);
    treadwheelCrane(f, 8.5, rng);
    const v = f.point(2.9, 0, 2.6);
    spots.push(spot(`portus-tiberinus:crane-${cranes.length - 1}`, 'npc', v.x, top, v.z, f.yaw - Math.PI / 2));
    // A night-watch torch on a post by the crane.
    f.cyl('wood_dark', -2.6, 1.1, 1.0, 0.07, 2.2, 5, { collide: true });
    placeProp(f.at(-2.6, 1.75, 0.93), 'torch_bracket', 0, 0, 0, 0, { collide: false });
    const tp = f.point(-2.6, 2.2, 0.65);
    lamps.add(tp.x, tp.y, tp.z, 'torch');
  }
  // Cargo on the quay: amphorae (Dressel 20 oil, Dressel 2–4 wine), sacks of grain, bricks, crates.
  const cargo: [string, number][] = [['amphora_stack', 0], ['sack', 1], ['crate', 2], ['amphora_rack', 0], ['dolium', 1], ['amphora_stack', 2]];
  const nCargo = hi ? 16 : 6;
  for (let k = 0; k < nCargo; k++) {
    const s = sA + len * (0.04 + (0.92 * k) / (nCargo - 1)) + rng.range(-1.5, 1.5);
    const inl = rng.range(3.4, 5.2);
    if (nearStair(s, 5) || !isFree(s, 1.4, 1.2, 6.4)) continue;
    const p = q.at(s, inl);
    if (!free(p)) continue;
    occupy(s, 1.2, 1.2, 6.4);
    const [kind, v] = cargo[k % cargo.length];
    placeProp(d, kind as never, p.x, top, p.z, rng.range(0, 6), { variant: v });
    if (k % 3 === 0) {
      const c = q.at(s, inl - 1.6);
      spots.push(spot(`portus-tiberinus:cargo-${k}`, 'container', c.x, top, c.z, Math.atan2(c.nx, c.nz)));
    }
  }
  // Storerooms (cellae) behind the quay, at least 7 m behind its edge: brick vaults opening onto it,
  // in units of four cells under their own gabled roofs (alternating heights), slit windows behind.
  const unitLen = 17;
  const nUnits = Math.max(1, Math.floor((len * S) / (unitLen + 0.6)));
  let unitIdx = 0;
  for (let u = 0; u < nUnits; u++) {
    const s = sA + ((u + 0.5) / nUnits) * len;
    const p = q.at(s, 7.0 + 6.5 / 2);
    if (!free(p) || !free(q.at(s - unitLen / 2 / S, 7)) || !free(q.at(s + unitLen / 2 / S, 7)) || !free(q.at(s, 14))) continue;
    const f = quayFrame(d, q.at(s, 7.0), top);
    storeUnit(b, f, unitLen, 6.5, unitIdx % 2 ? 5.2 : 4.4, hi, (cx) => {
      const v = f.point(cx, 0, -0.3);
      spots.push(spot(`portus-tiberinus:cella-${unitIdx}-${Math.round(cx)}`, 'door', v.x, top, v.z, f.yaw + Math.PI));
    });
    if (unitIdx === 0) {
      paintedSign(b, ['HORREA', 'VINVM·OLEVM·LATERES'], 2.2, 0.8, f.m.clone().multiply(T(-unitLen / 4, 3.95, -0.27)));
      const v = f.point(-unitLen / 4, 0, -1.6);
      spots.push(spot('portus-tiberinus:horrea', 'inscription', v.x, top, v.z, f.yaw));
    }
    unitIdx++;
  }
  // Stair landings of the quay (the water module builds the stairs): boatmen wait there.
  q.stairs.filter((st) => st > sA - 2 && st < sB + 2).forEach((st, i) => {
    const p = q.at(st, -1.0);
    spots.push(spot(`portus-tiberinus:landing-${String.fromCharCode(97 + i)}`, 'npc', p.x, water + 0.25, p.z, Math.atan2(p.nx, p.nz)));
  });
  // Barges (naves caudicariae) and lighters moored against the wall, bow upstream, lines to the
  // mooring stones in the face (or to the quay's own stones).
  const kinds: BoatKind[] = hi ? ['caudicaria', 'caudicaria', 'scapha', 'caudicaria', 'linter'] : ['caudicaria', 'caudicaria'];
  const moorings = q.moorings.filter((m) => m > sA && m < sB);
  const nBoats = kinds.length;
  for (let k = 0; k < nBoats; k++) {
    const kind = kinds[k];
    const L = kind === 'caudicaria' ? 15 : kind === 'scapha' ? 7 : 5;
    const B = kind === 'caudicaria' ? 4.4 : kind === 'scapha' ? 2.2 : 1.4;
    const s = sA + len * ((k + 0.5) / nBoats);
    if (nearStair(s, (L / 2 + 3) / S)) continue;
    const p = q.at(s, -(B / 2 + 0.45));
    if (!free(p)) continue;
    // Bow upstream: the boat's −z runs against the downstream tangent.
    const bd = d.at(p.x, water, p.z, Math.atan2(p.tx, p.tz) + rng.range(-0.03, 0.03));
    const deck = boat(bd, kind, rng, hi);
    // Mooring lines from bow and stern to the nearest stones (ring 1.1 m above the water).
    const kRing = (q.water + 1.1 - q.bed) / (q.top + 0.2 - 0.5 - q.bed);
    const ringIn = 0.3 * kRing - 0.46;
    for (const end of [-1, 1]) {
      const bowS = s + (end * (L / 2 - 1.2)) / S;
      const m = moorings.length ? moorings.reduce((a, c) => (Math.abs(c - bowS) < Math.abs(a - bowS) ? c : a)) : null;
      const cleat = bd.point(0, kind === 'caudicaria' ? 1.0 : 0.6, end * (L / 2 - 1.2));
      const tgt = m !== null && Math.abs(m - bowS) < 14 ? q.at(m, ringIn) : q.at(bowS, 0.6);
      const ty = m !== null && Math.abs(m - bowS) < 14 ? water + 1.1 : top + 0.25;
      d.rod('fabric_ochre', V(cleat.x, cleat.y, cleat.z), V(tgt.x, ty, tgt.z), 0.02, 3, { shadow: false });
    }
    const v = bd.point(0, 0, deck.standZ);
    spots.push(spot(`portus-tiberinus:boat-${k}`, 'npc', v.x, water + deck.floor, v.z, bd.yaw));
  }
  // The quay spawn (the landmark's centre lies in the river, so spawn on the quay top), on a
  // clear stretch near the middle.
  let fs = 0.5;
  for (const f of [0.5, 0.44, 0.56, 0.38, 0.62, 0.3, 0.7, 0.2, 0.8]) {
    if (isFree(sA + len * f, 1.2, 1.8, 4.2) && !nearStair(sA + len * f, 4)) {
      fs = f;
      break;
    }
  }
  const mid = at(fs, 3.0);
  spots.push(spot('portus-tiberinus:quay', 'spawn', mid.x, top, mid.z, Math.atan2(-mid.nx, -mid.nz)));
  riverLife(ctx, spots, lamps);
  return { object: b.build(lm.id), colliders: b.colliders, spots, cullDistance: 900 };
}

/** One storeroom unit: four brick-vaulted cellae under a gabled roof, front at local z = 0 (−z = the quay). */
function storeUnit(b: MeshBuilder, f: Draw, uw: number, depth: number, h: number, hi: boolean, onDoor: (cx: number) => void) {
  const x0 = -uw / 2, x1 = uw / 2;
  f.span('brick', x0, -1.2, 0.3, x1, h, depth, { collide: true });
  for (const x of [x0, x1]) f.span('brick', x - 0.35, -1.2, 0.05, x + 0.35, h + 0.1, 0.32);
  f.span('travertine', x0, 3.3, 0.15, x1, 3.45, 0.32);
  const nCell = 4;
  for (let k = 0; k < nCell; k++) {
    const cx = x0 + ((k + 0.5) * uw) / nCell;
    f.span('black', cx - 1.2, 0, 0.28, cx + 1.2, 2.7, 0.32, { shadow: false });
    f.span('travertine', cx - 1.4, 2.7, 0.2, cx + 1.4, 2.95, 0.4); // lintel
    if (hi) f.span('black', cx - 0.25, h - 1.6, depth - 0.02, cx + 0.25, h - 0.6, depth + 0.01, { shadow: false }); // slit window behind
    if (k % 2 === 0) onDoor(cx);
  }
  const m = f.m.clone().multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(0, 0, depth / 2 + 0.15));
  gableRoof(b, -depth / 2 - 0.6, depth / 2 + 0.6, -uw / 2 - 0.15, uw / 2 + 0.15, h, 18, 'roof_tile', hi, m);
}

/** Without terrain quays: a travertine-faced concrete quay with a deck, mooring stones and stairs. */
function ownQuay(ctx: LandmarkContext, b: MeshBuilder, d: Draw, q: QuayEdge, faceZ: number, x0: number, x1: number, Dd: number, blocked: V2[][], spots: Spot[], hi: boolean) {
  const { top: quayTop, water, bed } = q;
  const top = (x: number, z: number) => Math.max(ctx.groundAt(x, z), quayTop);
  const fillZ1 = Dd / 2 - 1;
  d.span('travertine', x0, bed - 0.6, faceZ - 0.9, x1, quayTop, faceZ, { collide: true });
  d.span('travertine', x0, quayTop - 0.02, faceZ - 1.05, x1, quayTop + 0.2, faceZ + 0.25);
  d.span('concrete', x0, bed - 0.6, faceZ, x1, quayTop - 0.3, fillZ1 * 0.5, { collide: true });
  if (hi) for (let y = Math.ceil(bed / 0.6) * 0.6; y < quayTop - 0.3; y += 0.6) d.span('travertine', x0, y, faceZ - 0.93, x1, y + 0.05, faceZ - 0.9, { shadow: false });
  const deck: V2[] = [[x0, faceZ], [x1, faceZ], [x1, fillZ1], [x0, fillZ1]];
  buildPlaza(b, deck, (x, z) => top(x, z), { material: 'paving_travertine', exclude: blocked, collide: true, lift: 0.02, cell: 3, skirt: 1.5 });
  for (const x of [x0, x1]) d.span('travertine', x - 0.5, bed - 0.6, faceZ - 0.9, x + 0.5, quayTop + 0.2, fillZ1 * 0.5, { collide: true });
  // Mooring stones in the face.
  for (let x = x0 + 4; x < x1 - 2; x += 7.5) {
    if (insideAny(x, faceZ - 0.5, blocked)) continue;
    d.box('travertine', x, water + 1.1, faceZ - 0.95, 0.7, 0.55, 0.22);
    d.cyl('black', x, water + 1.1, faceZ - 1.06, 0.12, 0.02, 8, { rx: Math.PI / 2, shadow: false });
    q.moorings.push(x / ctx.S);
  }
  // Paired stairs down to the water against the face (1:1, 0.2 m risers), on a landing pier.
  const W = x1 - x0;
  const sc = stepCount(quayTop - (water + 0.25), 0.2);
  for (const xs of [x0 + W * 0.28, x0 + W * 0.7]) {
    if (insideAny(xs, faceZ, blocked)) continue;
    const run = 0.32;
    d.span('travertine', xs - 1.2, bed - 0.6, faceZ - 2.9, xs + 1.2, water + 0.25, faceZ - 0.9, { collide: true });
    for (const dir of [-1, 1]) {
      const m = new THREE.Matrix4().makeRotationY(dir * Math.PI / 2).setPosition(xs + dir * 1.2, water + 0.25, faceZ - 1.9);
      stairs(b, { width: 2.0, rise: sc.rise, run, count: sc.count, material: 'travertine' }, m);
    }
    q.stairs.push(xs / ctx.S);
    void spots;
  }
}

// ------------------------------------------------------------------ Cloaca Maxima outfall

/**
 * The arched outfall of the Great Drain, projecting from the quay as a small vaulted bastion (the
 * water module leaves a gap in its quay wall here): three concentric rings of voussoirs in Gabine
 * stone and tufa round a half-drowned mouth, a vaulted channel inside with a maintenance ledge
 * just above the water leading back to the iron grating in the quay face (the sewer dungeon's
 * entrance), a stair down from the quay on a spur along the bastion's flank, and a walled
 * platform over the vault with a view down the river.
 *
 * Built in a "face frame": origin on the quay face at the outfall (river bed level), x along the
 * quay, +z inland, −z out over the river. The channel is wider and taller than 0.6 × the real
 * 4.5 × 4.2 m: a walk-in space keeps human scale (ledge headroom ≥ 2.1 m).
 */
function cloacaOutlet(ctx: LandmarkContext) {
  const { S, lm } = ctx;
  const hi = ctx.detail === 'high';
  const b = ctx.builder();
  const env = riverEnv(ctx);
  const water = env.waterY;
  const bed = env.bedY - 0.6;
  const q = quayEdge(ctx, env, 60);
  // The face point: the quay's gap for the outfall, or (no terrain quays) the waterline found by
  // walking out from the atlas point.
  let p: QuayPoint;
  let quayTop: number;
  let gapS: number | null = null;
  if (q) {
    gapS = q.gaps.length ? q.gaps.reduce((a, g) => (Math.abs(g.s - q.project(0, 0).s) < Math.abs(a.s - q.project(0, 0).s) ? g : a)).s : q.project(0, 0).s;
    p = q.at(gapS, 0);
    quayTop = q.top;
  } else {
    let zE = 0;
    while (zE > -30 && ctx.groundAt(0, zE) > water + 0.25) zE -= 0.25;
    p = { x: 0, z: zE, tx: 1, tz: 0, nx: 0, nz: 1 };
    quayTop = 10 * S - env.baseY;
  }
  const F = quayFrame(draw(b), p, 0);
  const Fm = F.m;
  const floor = 4.7 * S - env.baseY; // channel floor 4.7 m ASL: the mouth is half drowned
  const r = 1.9;
  const ledgeY = water + 0.08;
  const ledgeW = 1.3;
  const spring = ledgeY + 2.12 - Math.sqrt(r * r - (r - ledgeW / 2) ** 2);
  const crown = spring + r;
  // High enough to cover the water module's own voussoirs round its wall gap (they reach 0.66 m above the quay).
  const deckY = Math.max(crown + 0.36, quayTop + 0.75);
  const BW = 3.4; // covers the water module's wall gap (±3.2 m)
  const P = 4.2; // projection of the bastion from the face
  const zf = -P - 0.5; // front face plane
  const zb = -0.35; // back of the channel (the grating wall stands in front of the quay face)
  const Zin = 1.6; // the platform reaches back over the quay edge
  const mat: MaterialId = 'tufa';
  const channel: V2[] = [[-r, floor - 0.2], [r, floor - 0.2]];
  for (let i = 0; i <= 24; i++) {
    const a = (Math.PI * i) / 24;
    channel.push([Math.cos(a) * r, spring + Math.sin(a) * r]);
  }
  // ---- the bastion: one extruded block with the channel cut through it, then the solid part
  // over the quay edge behind the grating wall.
  const outer: V2[] = [[-BW, bed], [BW, bed], [BW, deckY], [-BW, deckY]];
  const block = extrudePolygon(outer, zb - zf, [channel]);
  block.translate(0, 0, zb);
  b.add(block, mat, Fm);
  F.solid(-BW, bed, zb, BW, deckY, Zin);
  F.solid(-BW, bed, zf, -r, deckY, zb);
  F.solid(r, bed, zf, BW, deckY, zb);
  F.solid(-r, crown, zf, r, deckY, zb);
  // The vault's haunches as stepped colliders (nobody jumps into the masonry).
  // Each box starts at the intrados' highest point over its width (its inner edge x0).
  for (const sx of [-1, 1]) for (const [x0, x1] of [[r - 0.45, r], [r - 0.9, r - 0.45]] as const) F.solid(sx * x0, spring + Math.sqrt(Math.max(0, r * r - x0 * x0)), zf, sx * x1, crown, zb);
  // Platform paving, a travertine string course, the parapet round the three river sides.
  F.span('paving_travertine', -BW - 0.05, deckY - 0.02, zf - 0.05, BW + 0.05, deckY + 0.04, Zin);
  F.span('travertine', -BW - 0.08, deckY - 0.45, zf - 0.08, BW + 0.08, deckY - 0.2, zb);
  const parH = 0.95;
  F.span('travertine', -BW, deckY, zf, BW, deckY + parH, zf + 0.45, { collide: true });
  for (const sx of [-1, 1]) F.span('travertine', sx > 0 ? BW - 0.45 : -BW, deckY, zf, sx > 0 ? BW : -BW + 0.45, deckY + parH, zb - 0.2, { collide: true });
  F.span('travertine', -BW - 0.04, deckY + parH, zf - 0.04, BW + 0.04, deckY + parH + 0.08, zf + 0.49);
  // Steps from the platform down to the quay behind.
  const up = stepCount(deckY - quayTop, 0.2);
  if (deckY - quayTop > 0.08) stairs(b, { width: 2 * BW - 1.2, rise: up.rise, run: 0.32, count: up.count, material: 'travertine' }, Fm.clone().multiply(new THREE.Matrix4().makeRotationY(Math.PI).setPosition(0, quayTop, Zin + up.count * 0.32)));
  // ---- three concentric rings of voussoirs (annular wedges, odd counts so a keystone crowns
  // each ring), standing proud of the front face
  const ringT = 0.36;
  // All three in Gabine stone (dark peperino) against the tufa face; their different projections
  // and the joints between them let each ring read on its own.
  const rings: MaterialId[] = ['peperino', 'peperino', 'peperino'];
  rings.forEach((m, k) => {
    const ri = r + k * ringT + 0.01;
    const ro = ri + ringT - 0.02;
    const nv = (hi ? 15 : 9) + 2 * k;
    const dep = 0.18 + 0.05 * (2 - k);
    for (let i = 0; i < nv; i++) {
      const a0 = (Math.PI * i) / nv + 0.006;
      const a1 = (Math.PI * (i + 1)) / nv - 0.006;
      const key = k === 2 && i === (nv - 1) / 2;
      const roK = key ? ro + 0.12 : ro;
      const pts: V2[] = [];
      const steps = hi ? 3 : 1;
      for (let j = 0; j <= steps; j++) {
        const a = a0 + ((a1 - a0) * j) / steps;
        pts.push([Math.cos(a) * ri, spring + Math.sin(a) * ri]);
      }
      for (let j = steps; j >= 0; j--) {
        const a = a0 + ((a1 - a0) * j) / steps;
        pts.push([Math.cos(a) * roK, spring + Math.sin(a) * roK]);
      }
      const g = extrudePolygon(pts, dep + (key ? 0.06 : 0));
      g.translate(0, 0, zf + 0.02);
      b.add(g, m, Fm);
    }
  });
  // Imposts at the springing.
  for (const sx of [-1, 1]) F.span('travertine', sx * r - (sx > 0 ? 0 : 0.5), spring - 0.22, zf - 0.12, sx * r + (sx > 0 ? 0.5 : 0), spring, zf + 0.02);
  // ---- inside: the grating wall in front of the quay face, the ledge, a lamp in a niche
  // The opening matches the water module's culvert mouth behind it (3 m wide, springing 1.4 m
  // over the floor), a little smaller so its own voussoirs stay hidden in the masonry.
  const rg = 1.42;
  const sg = floor + 1.4;
  const gate: V2[] = [[-rg, floor - 0.2], [rg, floor - 0.2]];
  for (let i = 0; i <= 16; i++) {
    const a = (Math.PI * i) / 16;
    gate.push([Math.cos(a) * rg, sg + Math.sin(a) * rg]);
  }
  const wallG = extrudePolygon(channel, 0.4, [gate]);
  wallG.translate(0, 0, zb);
  b.add(wallG, mat, Fm);
  // Behind the grating: a short dark culvert in the solid part over the quay edge.
  const recess = extrudePolygon(outer, 0.6, [gate]);
  recess.translate(0, 0, zb + 0.6);
  b.add(recess, mat, Fm);
  F.span(mat, -BW, bed, zb + 0.6, BW, deckY, Zin);
  F.solid(-r, floor - 0.2, zb - 0.4, r, crown, zb);
  const zg = zb - 0.22;
  for (let x = -rg + 0.18; x < rg - 0.05; x += 0.26) {
    const hTop = sg + Math.sqrt(Math.max(0, rg * rg - x * x));
    F.box('iron', x, (floor - 0.2 + hTop) / 2, zg, 0.045, hTop - floor + 0.2, 0.045);
  }
  for (const y of [ledgeY + 0.5, sg + 0.3]) F.span('iron', -rg, y, zg - 0.03, rg, y + 0.07, zg + 0.03);
  F.span('black', -rg, floor - 0.2, zb + 0.5, rg, sg + rg, zb + 0.56, { shadow: false });
  // ---- the stair from the quay down to the landing, on a spur along one flank (the side away
  // from the water module's mooring stones); the ledge runs along the same side of the channel
  let side = -1;
  if (q && gapS !== null) {
    const busy = (sx: number) => q.moorings.some((m) => {
      const mp = q.at(m, 0);
      const lx = (mp.x - p.x) * F.m.elements[0] + (mp.z - p.z) * F.m.elements[2];
      return sx * lx > BW - 0.6 && sx * lx < BW + 2.4;
    });
    if (busy(-1) && !busy(1)) side = 1;
  }
  const sx = side;
  // The ledge, from the grating out through the mouth to the landing, and its worn nosing.
  const xl0 = sx > 0 ? r - ledgeW : -r;
  const xl1 = xl0 + ledgeW;
  F.span('travertine', xl0, bed, zf - 1.5, xl1, ledgeY, zb - 0.4, { collide: true });
  const xn = sx > 0 ? xl0 : xl1;
  F.span('travertine', xn - 0.04, ledgeY - 0.12, zf - 1.5, xn + 0.04, ledgeY + 0.02, zb - 0.4);
  // An oil lamp in a niche by the grating (lit at dusk) — the sewer men's.
  const xw = sx * r;
  F.span('black', xw - 0.02, ledgeY + 1.35, zb - 1.3, xw + 0.02, ledgeY + 1.75, zb - 0.95, { shadow: false });
  const lamps = new LampList();
  const lp = F.point(xw - sx * 0.15, ledgeY + 1.5, zb - 1.1);
  lamps.add(lp.x, lp.y, lp.z, 'lamp');
  // Rings proud of the face near the springing: keep the landing's walkers off them.
  for (const s2 of [-1, 1]) F.solid(s2 > 0 ? r : -r - 1.15, spring - 0.25, zf - 0.32, s2 > 0 ? r + 1.15 : -r, spring + 1.4, zf);
  const sw = 1.35;
  const xo = sx * BW; // flank face
  const xs = sx * (BW + sw / 2); // stair centre line
  const coping = quayTop + 0.2;
  const sc = stepCount(coping - ledgeY, 0.2);
  const run = 0.3;
  const zTop = -0.35;
  const zBot = zTop - sc.count * run;
  // Flight down toward the river (−z): the stairs kit climbs +z, so start it at the bottom.
  stairs(b, { width: sw, rise: sc.rise, run, count: sc.count, material: 'travertine' }, Fm.clone().multiply(new THREE.Matrix4().setPosition(xs, ledgeY, zBot)));
  F.span('travertine', xs - sw / 2, coping - 0.4, zTop, xs + sw / 2, coping, 0.3, { collide: true }); // head of the flight over the face
  F.span('travertine', xs - sw / 2, bed, zBot, xs + sw / 2, ledgeY, zTop, { collide: true }); // spur under the flight
  // The landing at the foot, round the front corner to the ledge in the mouth.
  const xa = Math.min(xo, sx > 0 ? xl0 : xl1);
  const xb = Math.max(xo, sx > 0 ? xl0 : xl1);
  const zl0 = Math.min(zBot, zf - 1.5) - 0.1;
  F.span('travertine', sx > 0 ? xo : xs - sw / 2, bed, zl0, sx > 0 ? xs + sw / 2 : xo, ledgeY, zBot + 0.01, { collide: true });
  F.span('travertine', Math.min(xa, xb), bed, zl0, Math.max(xa, xb), ledgeY, zf + 0.01, { collide: true });
  // Parapets: along the flight's outer side (sloping) and round the landing's river edges.
  const xp = sx * (BW + sw + 0.12);
  const flight = Math.hypot(zTop - zBot, coping - ledgeY);
  const ang = Math.atan2(coping - ledgeY, zTop - zBot);
  F.box('travertine', xp, (coping + ledgeY) / 2 + 0.45, (zTop + zBot) / 2, 0.24, 1.3, flight, { rx: -ang, collide: true });
  F.span('travertine', Math.min(xp - 0.12, xa), ledgeY, zl0 - 0.24, Math.max(xp + 0.12, xb), ledgeY + 0.9, zl0, { collide: true });
  F.span('travertine', xp - 0.12, ledgeY, zl0, xp + 0.12, ledgeY + 0.9, zBot, { collide: true });
  const spots: Spot[] = [];
  const at = (x: number, y: number, z: number, h: number, id: string, kind: string) => {
    const v = F.point(x, y, z);
    spots.push(spot(id, kind, v.x, v.y, v.z, F.yaw + h));
  };
  // The grating spot: on the ledge's centre line, facing the grating (+z).
  const xl = (xl0 + xl1) / 2;
  at(xl, ledgeY, zb - 0.4 - 0.65, 0, 'cloaca-maxima-outlet:grate', 'door');
  at(0, deckY, zf + 1.4, Math.PI, 'cloaca-maxima-outlet:quay', 'vista');
  at(xs, ledgeY, zl0 + 0.6, Math.PI, 'cloaca-maxima-outlet:landing', 'npc');
  riverLife(ctx, spots, lamps);
  return { object: b.build(lm.id), colliders: b.colliders, spots };
}

export const builders: LandmarkBuilder[] = [
  { handles: ['forum-boarium'], build: forumBoarium },
  { handles: ['portus-tiberinus'], build: portusTiberinus },
  { handles: ['cloaca-maxima-outlet'], build: cloacaOutlet },
];
