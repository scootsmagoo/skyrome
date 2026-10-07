/**
 * The tombs of the Via Cornelia on the Vatican slope (vatican-necropolis). In 113 a roadside
 * cemetery of modest burials (the big brick mausolea are 2nd–3rd c.): grave stelae and cippi,
 * altar tombs, small house tombs with a door and a pediment, a few walled family plots, cypresses
 * and umbrella pines over them. Among the poor graves, one plain marker the Christians remember as
 * Peter's (the 'Tropaion' over it is c. 160 and NOT built yet).
 */
import type { LandmarkBuild, LandmarkBuilder, LandmarkContext, Spot } from '../types';
import { clearOf, dims, draw, finish, inscription, liftAll, obstacles, roadsNear, spot, tiledRoof, wallRun, type Detail } from './generic-common';
import type { Draw } from '../../../arch/fabric/draw';
import { tree } from './generic-world';

type Rng = { range(a: number, b: number): number; next(): number; chance(p: number): boolean };

/** A grave stele: a slab with a rounded or gabled top, set in the ground. */
function stele(d: Draw, rng: Rng) {
  const h = rng.range(0.8, 1.5);
  const mat = rng.chance(0.6) ? 'travertine' : 'marble';
  d.box(mat, 0, h / 2, 0, rng.range(0.45, 0.7), h, 0.14);
  if (rng.chance(0.5)) d.cyl(mat, 0, h, 0, 0.3, 0.14, 8, { rx: Math.PI / 2 });
}

/** A cippus or altar tomb: a squat block with a cornice and a little pulvinus roll on top. */
function altarTomb(d: Draw, rng: Rng) {
  const w = rng.range(0.8, 1.3), h = rng.range(1.0, 1.6);
  const mat = rng.chance(0.5) ? 'marble' : 'travertine';
  d.box(mat, 0, 0.12, 0, w + 0.25, 0.24, w + 0.25, { collide: true });
  d.box(mat, 0, 0.24 + h / 2, 0, w, h, w, { collide: true });
  d.box(mat, 0, 0.3 + h, 0, w + 0.18, 0.14, w + 0.18);
  for (const s of [-1, 1]) d.cyl(mat, (s * w) / 2.6, 0.48 + h, 0, 0.12, w * 0.9, 8, { rz: Math.PI / 2 });
}

/** A small house tomb: brick walls, a travertine door frame and plaque, a tiled gable roof. */
function houseTomb(d: Draw, rng: Rng, detail: Detail): number {
  const w = rng.range(3.0, 4.6), l = rng.range(3.4, 5.2), h = rng.range(2.6, 3.6);
  d.span('brick', -w / 2, -0.3, -l / 2, w / 2, h, l / 2, { collide: true });
  // Door and its frame on the road side (−z).
  d.span('travertine', -0.55, 0, -l / 2 - 0.08, 0.55, 1.75, -l / 2 + 0.02);
  d.span('wood_dark', -0.42, 0, -l / 2 - 0.1, 0.42, 1.6, -l / 2 - 0.04);
  d.box('marble', 0, 2.2, -l / 2 - 0.06, Math.min(w - 0.6, 1.6), 0.5, 0.06);
  d.span('travertine', -w / 2 - 0.05, h, -l / 2 - 0.05, w / 2 + 0.05, h + 0.18, l / 2 + 0.05);
  tiledRoof(d, 'gable', 0, 0, w + 0.3, l + 0.3, h + 0.18, detail, { axis: 'z', pitchDeg: 22, overhang: 0.15 });
  return Math.max(w, l);
}

/** A walled family plot with a few stelae inside. */
function plot(d: Draw, rng: Rng, detail: Detail): number {
  const w = rng.range(5, 8), l = rng.range(5, 8), h = rng.range(0.9, 1.4);
  const gap = 1.1;
  wallRun(d, -w / 2, -l / 2, -gap / 2, -l / 2, -0.2, h, 0.35, 'tufa');
  wallRun(d, gap / 2, -l / 2, w / 2, -l / 2, -0.2, h, 0.35, 'tufa');
  wallRun(d, w / 2, -l / 2, w / 2, l / 2, -0.2, h, 0.35, 'tufa');
  wallRun(d, w / 2, l / 2, -w / 2, l / 2, -0.2, h, 0.35, 'tufa');
  wallRun(d, -w / 2, l / 2, -w / 2, -l / 2, -0.2, h, 0.35, 'tufa');
  const n = detail === 'high' ? 4 : 2;
  for (let i = 0; i < n; i++) stele(d.at(rng.range(-w / 2 + 1, w / 2 - 1), 0, rng.range(-l / 2 + 1.2, l / 2 - 1), rng.range(-0.15, 0.15)), rng);
  return Math.max(w, l);
}

function buildNecropolis(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const d = draw(ctx);
  const rng = ctx.rng.fork('necropolis');
  const spots: Spot[] = [];
  const g = (x: number, z: number) => ctx.groundAt(x, z);
  const { w, d: dd } = dims(ctx);
  const free = clearOf(obstacles(ctx, 1.5));
  // Along the Via Cornelia (or the nearest road) through the footprint, on both sides.
  const roads = roadsNear(lm, ctx.S, 10);
  const segs = roads.length ? roads : [{ id: 'axis', ax: -w / 2, az: 0, bx: w / 2, bz: 0, half: 2 }];
  const placed: { x: number; z: number; r: number }[] = [];
  const fits = (x: number, z: number, r: number) => free(x, z, r) && !placed.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + r + 0.8);
  let peter = false;
  for (const s of segs) {
    const dx = s.bx - s.ax, dz = s.bz - s.az;
    const L = Math.hypot(dx, dz);
    if (L < 1) continue;
    const tx = dx / L, tz = dz / L;
    for (let t = 0; t < L; t += rng.range(4.5, 7.5)) {
      const cx = s.ax + tx * t, cz = s.az + tz * t;
      if (Math.abs(cx) > w / 2 + 12 || Math.abs(cz) > dd / 2 + 18) continue;
      for (const side of [-1, 1]) {
        const off = s.half + rng.range(2.5, 6);
        const x = cx - tz * off * side, z = cz + tx * off * side;
        // Face the road: the door side (−z local of the piece) toward it.
        const rot = Math.atan2(tz * side, -tx * side) + Math.PI / 2;
        const k = rng.next();
        const r = k < 0.22 ? 3 : k < 0.36 ? 4.5 : 1;
        if (!fits(x, z, r)) continue;
        const f = d.at(x, g(x, z), z, rot);
        if (k < 0.22) houseTomb(f, rng, detail);
        else if (k < 0.36) plot(f, rng, detail);
        else if (k < 0.62) altarTomb(f, rng);
        else {
          // A cluster of poor graves: stelae and amphora necks marking burials in the ground.
          for (let i = 0; i < 3; i++) stele(f.at(rng.range(-1.5, 1.5), 0, rng.range(-1.2, 1.2), rng.range(-0.3, 0.3)), rng);
          f.cyl('terracotta', rng.range(-1, 1), 0.25, rng.range(-1, 1), 0.12, 0.5, 6, { rTop: 0.06 });
        }
        placed.push({ x, z, r });
        if (!peter && k >= 0.62 && Math.abs(cx) < w / 6) {
          // The plain grave the Christians remember (no shrine over it yet in 113).
          peter = true;
          spots.push(spot(`${lm.id}:peter`, 'shrine', x, g(x, z), z, rot + Math.PI));
        }
      }
      // Cypresses and umbrella pines along the road.
      if (rng.chance(0.35)) {
        const side = rng.chance(0.5) ? 1 : -1;
        const off = s.half + rng.range(8, 12);
        const x = cx - tz * off * side, z = cz + tx * off * side;
        if (fits(x, z, 1.5)) {
          tree(ctx, d, rng.chance(0.6) ? 'cypress' : 'umbrella_pine', x, g(x, z), z, rng.range(9, 14));
          placed.push({ x, z, r: 1.5 });
        }
      }
    }
  }
  // A dedication plaque on the first house tomb is enough of a read: names on the doors.
  if (placed.length) inscription(d, ['D M', 'TI CLAVDIO FELICI', 'VIX ANN XXXV'], placed[0].x, g(placed[0].x, placed[0].z) + 1.0, placed[0].z, 0.9, 0.7);
  spots.push(spot(`${lm.id}:road`, 'vista', segs[0].ax * 0.5 + segs[0].bx * 0.5, g(0, 0), segs[0].az * 0.5 + segs[0].bz * 0.5, Math.atan2(segs[0].bx - segs[0].ax, segs[0].bz - segs[0].az)));
  return finish(lm.id, d, spots, undefined, 500);
}

export const builders: LandmarkBuilder[] = liftAll([{ handles: ['vatican-necropolis'], build: buildNecropolis }]);
