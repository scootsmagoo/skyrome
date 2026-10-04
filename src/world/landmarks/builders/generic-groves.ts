/**
 * Sacred groves (luci) with their springs, for the garden and shrine category builders: real trees
 * (planes, laurels, holm-oak stand-ins and cypresses), a spring basin dressed as a nymphaeum in the
 * tufa, a small aedicula and an altar with its fire, dirt paths beaten from the road — and, where
 * the notes say the grove is let out to people (the Camenae outside the Porta Capena, Juvenal 3.13),
 * a camp of their shelters: plank and cloth lean-tos, baskets and hay, a cooking fire, a washing
 * line, a basket-weaver's bench.
 */
import type { Draw } from '../../../arch/fabric/draw';
import { placeProp } from '../../../arch/props';
import type { MaterialId } from '../../../gfx/materialIds';
import type { LandmarkBuilder, LandmarkContext, Spot } from '../types';
import { V, altar, clearOf, inscription, obstacles, pool, spot, statueOnPedestal, type Hints } from './generic-common';
import { aedicula } from './generic-sacred';
import { brazier, lamp, plant } from './generic-world';

export const builders: LandmarkBuilder[] = [];

/** A spring basin in a tufa grotto front: three niches, a spout, a marble-lined pool (Juvenal's complaint). */
export function springNymphaeum(d: Draw, ctx: LandmarkContext, x: number, z: number, rotY: number, spots: Spot[], tag = 'spring') {
  const y = ctx.groundAt(x, z);
  const f = d.at(x, y, z, rotY);
  // Rock face behind (a low tufa outcrop the spring comes out of).
  f.box('rock', 0, 1.2, 3.1, 9.5, 3.4, 2.4, { collide: true });
  f.ellipsoid('rock', -4.2, 0.6, 2.6, 2.2, 2.0, 1.8, { seg: [8, 5] });
  f.ellipsoid('rock', 4.4, 0.4, 2.8, 2.0, 1.7, 1.6, { seg: [8, 5] });
  // Dressed front: tufa ashlar with three round-headed niches, the middle one with the spout.
  f.span('tufa', -3.6, -0.3, 1.7, 3.6, 2.9, 2.2, { collide: true });
  for (const k of [-1, 0, 1]) {
    f.span('black', k * 2.2 - 0.55, 0.7, 1.68, k * 2.2 + 0.55, 2.0, 1.7);
    f.cyl('black', k * 2.2, 2.0, 1.69, 0.55, 0.02, 10, { rx: Math.PI / 2 });
  }
  f.span('travertine', -3.8, 2.9, 1.6, 3.8, 3.15, 2.3);
  f.cyl('bronze', 0, 1.0, 1.55, 0.06, 0.3, 6, { rx: Math.PI / 2 });
  f.cyl('water', 0, 0.62, 1.32, 0.03, 0.62, 4);
  // Basin.
  pool(f, 0, 0, 0.2, 6.4, 2.6, 'marble', 0.45, 0.5);
  for (const sx of [-1, 1]) statueOnPedestal(f, 'togate', sx * 2.2, 0.7, 1.75, 0, 0.45, 'marble', 'low', 0.08, 'marble');
  inscription(f, ['EGERIAE ET CAMENIS'], 0, 2.55, 1.66, 3.2, 0.4);
  spots.push(spot(`${ctx.lm.id}:${tag}`, 'shrine', f.point(0, 0, -1.7).x, y, f.point(0, 0, -1.7).z, rotY));
}

/**
 * A grove of real trees over w × dd round a clearing, avoiding other landmarks; returns the
 * clearing radius. Planes and laurels with a few cypresses and pines.
 */
export function groveTrees(d: Draw, ctx: LandmarkContext, w: number, dd: number, clearing: number, count: number) {
  const free = clearOf(obstacles(ctx, 3));
  const rng = ctx.rng.fork('trees');
  let n = 0;
  for (let i = 0; i < count * 3 && n < count; i++) {
    const x = rng.range(-w / 2 + 2, w / 2 - 2), z = rng.range(-dd / 2 + 2, dd / 2 - 2);
    if (Math.hypot(x, z) < clearing || !free(x, z, 3)) continue;
    const r = rng.next();
    const sp = r < 0.45 ? 'plane' : r < 0.75 ? 'laurel' : r < 0.9 ? 'cypress' : 'umbrella_pine';
    plant(ctx, d, sp, x, ctx.groundAt(x, z), z, sp === 'laurel' ? rng.range(0.9, 1.3) : rng.range(0.85, 1.1));
    n++;
  }
  return n;
}

/** Let-out grove: shelters, hay and baskets, a cooking fire, a washing line, a weaver's bench. */
export function groveCamp(d: Draw, ctx: LandmarkContext, cx: number, cz: number, spots: Spot[]) {
  const rng = ctx.rng.fork('camp');
  const free = clearOf(obstacles(ctx, 2));
  const id = ctx.lm.id;
  const shelters: [number, number, number][] = [];
  for (let i = 0; i < 14 && shelters.length < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const r = rng.range(6.5, 10);
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (!free(x, z, 2.5)) continue;
    shelters.push([x, z, Math.atan2(cx - x, cz - z) + Math.PI]);
  }
  const cloth: MaterialId[] = ['fabric_white', 'fabric_ochre', 'fabric_blue', 'fabric_red'];
  shelters.forEach(([x, z, rot], i) => {
    const y = ctx.groundAt(x, z);
    const f = d.at(x, y, z, rot);
    // Lean-to: two posts and a ridge pole, a sloping cloth or plank roof down to the ground at the back,
    // wattle side screens, a reed mat and a hay bed inside.
    for (const sx of [-1, 1]) f.cyl('wood_dark', sx * 1.3, 0.85, -0.9, 0.05, 1.7, 5, { collide: true });
    f.rod('wood_dark', V(-1.4, 1.7, -0.9), V(1.4, 1.7, -0.9), 0.05, 5);
    const roof = i % 3 === 0 ? 'wood' : cloth[i % cloth.length];
    f.box(roof, 0, 0.95, 0.15, 2.9, 0.04, 2.35, { rx: -0.66 });
    for (const sx of [-1, 1]) f.poly('wood', [V(sx * 1.35, 0, -0.9), V(sx * 1.35, 1.7, -0.9), V(sx * 1.35, 0, 1.0)], { doubleSided: true });
    f.box('dry_grass', 0.2, 0.12, 0.25, 1.6, 0.24, 1.0);
    f.box('fabric_ochre', -0.6, 0.02, -0.4, 1.0, 0.03, 0.8);
    placeProp(f, 'basket', 1.0, 0, -1.2, rng.range(0, 3), { collide: false, rng });
    if (i % 2 === 0) placeProp(f, 'basket', -0.9, 0, -1.3, rng.range(0, 3), { collide: false, rng, scale: 0.8 });
    if (i % 3 === 1) placeProp(f, 'amphora_globular', 1.1, 0, 0.6, 0, { collide: false, rng });
    spots.push(spot(`${id}:shelter${i}`, 'npc', f.point(0, 0, -1.8).x, y, f.point(0, 0, -1.8).z, rot + Math.PI));
  });
  // Hay bundles (the furniture Juvenal sneers at: a basket and hay) stacked by the path.
  for (let i = 0; i < 5; i++) {
    const x = cx + rng.range(-4, 4), z = cz + rng.range(3, 5);
    if (!free(x, z, 1)) continue;
    d.ellipsoid('dry_grass', x, ctx.groundAt(x, z) + 0.3, z, 0.7, 0.42, 0.5, { ry: rng.range(0, 3), seg: [7, 4] });
  }
  // Cooking fire ringed with stones, a pot on a tripod.
  const fy = ctx.groundAt(cx, cz);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    d.ellipsoid('peperino', cx + Math.cos(a) * 0.55, fy + 0.08, cz + Math.sin(a) * 0.55, 0.16, 0.12, 0.14, { seg: [5, 3] });
  }
  d.cyl('wood_dark', cx, fy + 0.06, cz, 0.35, 0.1, 6);
  d.cyl('glow_fire', cx, fy + 0.25, cz, 0.28, 0.4, 6, { rTop: 0.02 });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    d.rod('iron', V(cx + Math.cos(a) * 0.6, fy, cz + Math.sin(a) * 0.6), V(cx, fy + 1.1, cz), 0.015, 3);
  }
  d.cyl('bronze', cx, fy + 0.7, cz, 0.2, 0.25, 8, { rTop: 0.16 });
  lamp(ctx, d, cx, fy + 0.6, cz, { kind: 'fire', intensity: 22, distance: 12, flicker: 0.6, glow: 0.5, priority: 1.3 });
  spots.push(spot(`${id}:fire`, 'sit', cx + 1.4, fy, cz, -Math.PI / 2));
  // Washing line between two trees' worth of posts.
  const lx = cx - 5, lz = cz - 3;
  if (free(lx, lz, 3)) {
    const ly = ctx.groundAt(lx, lz);
    for (const sx of [-2.2, 2.2]) d.cyl('wood_dark', lx + sx, ly + 0.9, lz, 0.04, 1.8, 4);
    d.rod('fabric_white', V(lx - 2.2, ly + 1.75, lz), V(lx + 2.2, ly + 1.75, lz), 0.008, 3);
    for (let k = 0; k < 4; k++) d.box(cloth[(k + 1) % cloth.length], lx - 1.6 + k * 1.05, ly + 1.35, lz, 0.8, 0.8, 0.02);
  }
  // Basket-weaver's bench with withies and finished baskets for sale.
  const bx = cx + 4.5, bz = cz - 3.5;
  if (free(bx, bz, 2)) {
    const by = ctx.groundAt(bx, bz);
    placeProp(d, 'bench', bx, by, bz, Math.PI / 2);
    for (let k = 0; k < 4; k++) placeProp(d, 'basket', bx + 0.9, by, bz - 0.9 + k * 0.6, k, { collide: false, rng });
    d.box('wood', bx - 0.8, by + 0.1, bz, 0.1, 0.1, 1.6, { rz: 0.1 });
    spots.push(spot(`${id}:weaver`, 'vendor', bx - 0.4, by, bz, -Math.PI / 2), spot(`${id}:baskets`, 'container', bx + 0.9, by, bz, -Math.PI / 2));
  }
}

/** A complete sacred grove: trees, the spring nymphaeum, the aedicula, an altar with a fire, maybe the camp. */
export function sacredGrove(d: Draw, ctx: LandmarkContext, w: number, dd: number, h: Hints, spots: Spot[]) {
  const id = ctx.lm.id;
  const g = (x: number, z: number) => ctx.groundAt(x, z);
  const free = clearOf(obstacles(ctx, 2));
  // The spring at the back of the clearing, facing the road side (−z).
  const sz = Math.min(dd * 0.18, 8);
  springNymphaeum(d, ctx, 0, sz, 0, spots);
  // Aedicula of the Camenae to the side, the altar in front of it with its fire.
  const ax = -Math.min(w * 0.18, 9);
  aedicula(d, ax, g(ax, sz - 1), sz - 1, 2.8, 'plaster_white', ctx.detail);
  const az = sz - 5;
  altar(d, ax, g(ax, az), az, 1.2, 0.8, 0.9, 'travertine');
  brazier(ctx, d, ax + 1.6, g(ax + 1.6, az), az, 0.9);
  spots.push(spot(`${id}:altar`, 'shrine', ax, g(ax, az - 1.6), az - 1.6, 0));
  // A beaten path from the road edge (−z) to the spring.
  for (let k = 0; k < 8; k++) {
    const z = -dd / 2 + ((k + 0.5) * (dd / 2 + sz - 2.5)) / 8;
    const x = Math.sin(k * 0.8) * 1.2;
    if (!free(x, z, 1.2)) continue;
    d.box('dirt', x, g(x, z) - 0.12, z, 2.2, 0.3, (dd / 2 + sz) / 8 + 0.4, { ry: Math.cos(k * 0.8) * 0.15 });
  }
  const camp = h.has('rented', 'families', 'let out', 'poor');
  groveTrees(d, ctx, w, dd, camp ? 15 : 10, Math.min(44, Math.max(12, Math.round((w * dd) / 110))));
  if (camp) groveCamp(d, ctx, Math.min(w * 0.22, 12), -Math.min(dd * 0.12, 5), spots);
  spots.push(spot(`${id}:entrance`, 'vista', 0, g(0, -dd / 2 + 1), -dd / 2 + 1, 0));
}
