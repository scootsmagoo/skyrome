/**
 * Category builder for the imperial fora (and the garden-forum of the Templum Pacis): the paved
 * court, its colonnades, and whatever the notes describe — exedrae / hemicycles projecting past the
 * side walls, caryatid or captive attics over the porticoes, a peperino firewall at the back, rows
 * of tabernae, an equestrian statue, the garden court with water channels and the apsed aedes.
 *
 * The temple (or basilica) that closes a forum is its own landmark built inside this footprint, so
 * the court leaves every child landmark's footprint free (colonnades are clipped round them).
 * Local frame: the entrance at −z, the temple end at +z.
 */
import * as THREE_ from 'three';
import { porticus } from '../../../arch/classical/porticus';
import { plainArch } from '../../../arch/classical/arch';
import type { Draw } from '../../../arch/fabric/draw';
import { placeProp } from '../../../arch/props';
import type { MaterialId } from '../../../gfx/materialIds';
import type { LandmarkBuild, LandmarkBuilder, LandmarkContext, Spot } from '../types';
import {
  T, V, children, clearOf, dims, draw, farDraw, finish, hintsOf, inscription, insidePoly, mul, obstacles, piercedWall, plinth, pool, spot, statueOnPedestal,
  tiledRoof, wallRun, type Detail, type V3,
} from './generic-common';
import { liteColonnade } from './generic-civic-lib';
import { localOf } from './generic-venues';
import { wallTorch } from './generic-world';

/** Pure: the pieces of a polyline (sampled every `step`) where `ok(x, z)` holds. */
export function clipPath(path: V3[], ok: (x: number, z: number) => boolean, step = 1): V3[][] {
  const out: V3[][] = [];
  let cur: V3[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const n = Math.max(1, Math.ceil(a.distanceTo(b) / step));
    for (let k = i === 0 ? 0 : 1; k <= n; k++) {
      const p = a.clone().lerp(b, k / n);
      if (ok(p.x, p.z)) cur.push(p);
      else if (cur.length) {
        out.push(cur);
        cur = [];
      }
    }
  }
  if (cur.length) out.push(cur);
  // Keep the corner points only (straight runs) and drop stubs shorter than two bays.
  return out
    .map((pts) => pts.filter((p, j) => j === 0 || j === pts.length - 1 || Math.abs((pts[j + 1].x - p.x) * (p.z - pts[j - 1].z) - (pts[j + 1].z - p.z) * (p.x - pts[j - 1].x)) > 1e-6))
    .filter((pts) => pts.length >= 2 && pts[0].distanceTo(pts[pts.length - 1]) > 6);
}

interface ColSpec {
  columnHeight: number;
  depth: number;
  material: MaterialId;
  wallMaterial: MaterialId;
  order: 'corinthian' | 'ionic' | 'composite';
  detail: Detail;
  kit: boolean;
}

/** A colonnade run (kit porticus for close-up quality, lite columns when the budget says so). */
function colonnade(d: Draw, path: V3[], c: ColSpec, back: 'wall' | 'none' = 'wall') {
  if (c.kit) {
    porticus(d.b, path, { order: c.order, columnHeight: c.columnHeight, depth: c.depth, back, material: c.material, wallMaterial: c.wallMaterial, floorMaterial: 'paving_travertine', detail: 'low', columnDetail: 'low', stylobate: 0.3 }, d.m);
  } else {
    liteColonnade(d, path, { columnHeight: c.columnHeight, spacing: c.columnHeight * 0.42, depth: c.depth, back, material: c.material, wallMaterial: c.wallMaterial, detail: c.detail, order: c.order });
  }
}

function buildForum(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const h = hintsOf(lm);
  const rng = ctx.rng.fork('forum');
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  const H = Math.max(8, lm.height * ctx.S);
  const garden = h.has('garden', 'rose beds');
  const obs = obstacles(ctx, 2.5);
  const free = clearOf(obs);
  // Court paving on a footing that follows the lowest ground.
  plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.06, 'travertine');
  d.span(garden ? 'gravel' : 'paving_travertine', -w / 2 + 0.3, 0.06, -dd / 2 + 0.3, w / 2 - 0.3, 0.1, dd / 2 - 0.3);
  // Colonnades along both long sides, facing the court.
  const colH = Math.min(9.5, Math.max(5, (lm.height > 20 ? 15 : lm.height) * ctx.S * 0.75));
  const depth = Math.min(9, Math.max(4.5, w * 0.1));
  const double = h.has('double colonnade', 'double colonnades', 'two rows');
  const material: MaterialId = h.has('pavonazzetto') ? 'marble_pavonazzetto' : h.has('red granite', 'granite') ? 'porphyry' : h.has('giallo') ? 'marble_giallo' : 'marble';
  const wallMaterial: MaterialId = h.has('peperino') ? 'peperino' : 'plaster_cream';
  const totalLen = 2 * dd * (double ? 2 : 1) + (garden ? 2 * w : 0);
  const c: ColSpec = { columnHeight: colH, depth: double ? depth / 2 : depth, material, wallMaterial, order: h.has('composite') ? 'composite' : 'corinthian', detail, kit: detail === 'high' && totalLen < 340 };
  const xw = w / 2 - 0.6; // inner face of the side walls
  const ok = (x: number, z: number) => free(x, z, 1.2);
  const z0 = -dd / 2 + 1.0, z1 = dd / 2 - 1.0;
  for (const sx of [-1, 1]) {
    const xa = sx * (xw - depth);
    // Path runs so its right-hand normal points into the court (−sx).
    const path = sx < 0 ? [V(xa, 0.1, z1), V(xa, 0.1, z0)] : [V(xa, 0.1, z0), V(xa, 0.1, z1)];
    for (const run of clipPath(path, ok)) colonnade(d, run, c);
    if (double) {
      const xb = sx * (xw - depth / 2);
      const p2 = sx < 0 ? [V(xb, 0.1, z1), V(xb, 0.1, z0)] : [V(xb, 0.1, z0), V(xb, 0.1, z1)];
      for (const run of clipPath(p2, ok)) colonnade(d, run, { ...c, kit: false }, 'none');
    }
    // Attic over the colonnade: caryatids / captives on a plain attic, as statues in a row.
    if (h.has('caryatid', 'attic', 'captive', 'dacian')) {
      const yA = colH + 0.3 + colH * 0.22;
      const ah = Math.min(3.6, colH * 0.42);
      const xf = xa + sx * 0.6;
      d.span('marble', xf - 0.4, yA, z0, xf + 0.4, yA + ah, z1);
      d.span('marble', xf - 0.55, yA + ah, z0, xf + 0.55, yA + ah + 0.3, z1);
      if (detail === 'high') {
        const n = Math.floor((z1 - z0) / 3.2);
        for (let i = 0; i < n; i++) {
          const z = z0 + (i + 0.5) * ((z1 - z0) / n);
          if (!ok(xa, z)) continue;
          statueOnPedestal(d, 'togate', xf - sx * 0.55, yA, z, sx < 0 ? -Math.PI / 2 : Math.PI / 2, ah / 1.95, h.has('dacian', 'captive') ? 'marble_pavonazzetto' : 'marble', 'low', 0.05, 'marble');
        }
      }
    }
    // Statues of the great men in front of the colonnade (on bases, a few metres apart).
    if (detail === 'high' && h.has('statues', 'great men', 'summi')) {
      const n = Math.floor((z1 - z0) / 7);
      for (let i = 0; i < n; i++) {
        const z = z0 + (i + 0.5) * ((z1 - z0) / n), x = xa - sx * 1.6;
        if (!ok(x, z)) continue;
        statueOnPedestal(d, i % 4 === 1 ? 'emperor' : 'togate', x, 0.1, z, sx < 0 ? -Math.PI / 2 : Math.PI / 2, 1.0, i % 3 ? 'bronze' : 'marble', 'low', 1.4);
        if (i % 3 === 0) spots.push(spot(`${lm.id}:elogium${sx}${i}`, 'inscription', x - sx * 1.2, 0.1, z, sx < 0 ? Math.PI / 2 : -Math.PI / 2));
      }
    }
  }
  // Exedrae projecting past the long sides in the back half.
  if (h.has('exedra', 'exedrae', 'hemicycle', 'hemicycles')) {
    const R = Math.min(dd * 0.17, 14 * ctx.S + 6);
    const zc = dd * 0.12;
    for (const sx of [-1, 1]) {
      const segs = detail === 'high' ? 14 : 8;
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI, a1 = ((i + 1) / segs) * Math.PI;
        const p0 = [sx * (w / 2 + Math.sin(a0) * R), zc - Math.cos(a0) * R], p1 = [sx * (w / 2 + Math.sin(a1) * R), zc - Math.cos(a1) * R];
        wallRun(d, p0[0], p0[1], p1[0], p1[1], -0.5, H * 0.85, 1.0, wallMaterial);
        // Niche with a statue on each wall panel.
        if (detail === 'high' && i % 2 === 1) {
          const am = (a0 + a1) / 2;
          const nx = sx * (w / 2 + Math.sin(am) * (R - 0.8)), nz = zc - Math.cos(am) * (R - 0.8);
          statueOnPedestal(d, 'togate', nx, 0.1, nz, Math.atan2(-(sx * Math.sin(am)), Math.cos(am)) + Math.PI, 1.1, 'marble', 'low', 1.2);
        }
      }
      d.geo(halfDisc(R), 'paving_travertine', sx * w / 2, 0.08, zc, { ry: sx < 0 ? Math.PI : 0 });
      tiledRoof(d, 'shed', sx * (w / 2 + R * 0.5), zc, R, 2 * R, H * 0.85, 'low', { axis: 'z', pitchDeg: 10 });
      spots.push(spot(`${lm.id}:exedra${sx}`, 'vista', sx * (w / 2 + R * 0.3), 0.1, zc, sx < 0 ? Math.PI / 2 : -Math.PI / 2));
      far.span(wallMaterial, sx * w / 2, 0, zc - R, sx * (w / 2 + R), H * 0.85, zc + R);
    }
  }
  // Back: a firewall (Forum of Augustus) or nothing (the temple / basilica closes it).
  if (h.has('firewall', 'fire wall')) {
    const t = 2.0;
    wallRun(d, -w / 2 - 1, dd / 2 + t / 2, w / 2 + 1, dd / 2 + t / 2, -0.8, H, t, 'peperino');
    for (let i = 0; i <= 8; i++) d.span('peperino', -w / 2 + (i * w) / 8 - 0.5, 0, dd / 2 - 0.25, -w / 2 + (i * w) / 8 + 0.5, H - 0.6, dd / 2);
    // Ashlar bands (travertine string courses) — the wall's horizontal rhythm.
    for (const y of [H * 0.33, H * 0.66]) d.span('travertine', -w / 2 - 1, y, dd / 2 - 0.05, w / 2 + 1, y + 0.4, dd / 2 + t + 0.05);
    far.span('peperino', -w / 2, 0, dd / 2, w / 2, H, dd / 2 + t);
  }
  // Side walls (outer), full length; tabernae opening outward if the notes mention shops.
  const shops = h.has('tabernae', 'shops');
  const sideH = colH * 1.45 + 1.5;
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 - 0.3);
    const ops = shops ? Array.from({ length: Math.floor((dd - 4) / 5) }, (_, i) => ({ x: 2 + (i + 0.5) * ((dd - 4) / Math.floor((dd - 4) / 5)), w: 2.6, h: 3.2, fill: 'black' as MaterialId })) : [];
    if (sx < 0) piercedWall(d, x, dd / 2, x, -dd / 2, 0.06, sideH, 0.6, wallMaterial, ops);
    else piercedWall(d, x, -dd / 2, x, dd / 2, 0.06, sideH, 0.6, wallMaterial, ops);
    far.span(wallMaterial, x - 0.3, 0, -dd / 2, x + 0.3, sideH, dd / 2);
  }
  // Front wall with the entrance (unless a separate gateway landmark stands there).
  const gatewayChild = children(lm).some((l) => l.category === 'arch');
  const gateW = Math.min(12, w * 0.22);
  const zf = -dd / 2 + 0.3;
  if (!gatewayChild) {
    wallRun(d, -w / 2, zf, -gateW / 2, zf, -0.5, sideH, 0.6, wallMaterial);
    wallRun(d, gateW / 2, zf, w / 2, zf, -0.5, sideH, 0.6, wallMaterial);
    plainArch(d.b, { span: gateW * 0.5, height: Math.min(sideH - 1.2, gateW * 0.75), pier: gateW * 0.25, depth: 1.4, material: 'marble', detail }, mul(d.m, T(0, 0.06, zf)));
    inscription(d, [lm.latin.split('/')[0].trim()], 0, Math.min(sideH - 1.2, gateW * 0.75) + gateW * 0.12, zf - 0.75, gateW * 0.7, 0.7);
    for (const sx of [-1, 1]) wallTorch(ctx, d, sx * (gateW / 2 + 0.4), 3.0, zf - 0.72, 0);
    far.span(wallMaterial, -w / 2, 0, zf - 0.3, w / 2, sideH, zf + 0.3);
  }
  // Garden-forum: water channels and rose beds in rows; the apsed aedes in the middle of the back.
  if (garden) {
    const bx = w / 2 - depth - 3, bz = dd / 2 - 4;
    const rows = 4;
    for (let i = 0; i < rows; i++) {
      const x = -bx + ((i + 0.5) * (2 * bx)) / rows;
      for (let k = 0; k < 2; k++) {
        const za = -bz * 0.85 + k * bz * 0.95, zb = za + bz * 0.75;
        if (!free(x, (za + zb) / 2, 2)) continue;
        d.span('foliage_broad', x - 1.6, 0.1, za, x + 1.6, 0.7, zb);
        if (detail === 'high') for (let r = 0; r < 6; r++) d.ellipsoid('fabric_red', x + rng.range(-1.4, 1.4), 0.74, za + rng.range(0.4, zb - za - 0.4), 0.18, 0.1, 0.18, { seg: [5, 3] });
        d.span('water', x + 2.0, 0.02, za, x + 2.6, 0.07, zb);
        d.span('marble', x + 1.85, 0.06, za, x + 2.0, 0.22, zb);
        d.span('marble', x + 2.6, 0.06, za, x + 2.75, 0.22, zb);
      }
    }
    // Colonnade across the front and back too (a full quadriporticus) and the aedes.
    const zb = dd / 2 - 1.0 - depth, zfr = -dd / 2 + 1.0 + depth;
    for (const run of clipPath([V(-xw + depth, 0.1, zfr), V(xw - depth, 0.1, zfr)], ok)) colonnade(d, run, { ...c, kit: false });
    const aw = Math.min(w * 0.3, 22);
    for (const run of clipPath([V(xw - depth, 0.1, zb), V(aw / 2 + 1, 0.1, zb)], ok)) colonnade(d, run, { ...c, kit: false });
    for (const run of clipPath([V(-aw / 2 - 1, 0.1, zb), V(-xw + depth, 0.1, zb)], ok)) colonnade(d, run, { ...c, kit: false });
    if (h.has('aedes', 'apsed', 'hall')) {
      const ad = Math.min(dd * 0.18, 18);
      const za = dd / 2 - 1 - ad;
      piercedWall(d, aw / 2, dd / 2 - 0.5, -aw / 2, dd / 2 - 0.5, 0.06, H, 1.2, 'brick');
      piercedWall(d, aw / 2, za, aw / 2, dd / 2 - 0.5, 0.06, H, 1.2, 'brick');
      piercedWall(d, -aw / 2, dd / 2 - 0.5, -aw / 2, za, 0.06, H, 1.2, 'brick');
      for (let i = 0; i < 6; i++) colonnadeColumn(d, -aw / 2 + 1 + (i * (aw - 2)) / 5, za, H * 0.62, material);
      d.span('marble', -aw / 2 - 0.3, H * 0.62 + 0.1, za - 0.8, aw / 2 + 0.3, H * 0.62 + 1.3, za + 0.8);
      tiledRoof(d, 'gable', 0, (za + dd / 2) / 2, aw + 1, dd / 2 - za + 1, H, 'low', { axis: 'z', pitchDeg: 16 });
      statueOnPedestal(d, 'seated', 0, 0.1, dd / 2 - 3, Math.PI, 2.2, 'gilded_bronze', detail, 1.8);
      spots.push(spot(`${lm.id}:aedes`, 'shrine', 0, 0.1, za - 2, 0), spot(`${lm.id}:spoils`, 'inscription', aw * 0.25, 0.1, dd / 2 - 4, Math.PI));
      far.span('brick', -aw / 2, 0, za, aw / 2, H, dd / 2);
    }
  }
  // An equestrian statue in the court if the notes name one and no landmark stands for it.
  if (h.has('equus', 'equestrian') && !children(lm).some((l) => /equus|equestrian/.test(l.id))) {
    const z = -dd * 0.15;
    if (free(0, z, 3)) {
      statueOnPedestal(d, 'equestrian', 0, 0.1, z, Math.PI, 1.5, 'gilded_bronze', detail, 3.2);
      spots.push(spot(`${lm.id}:equus`, 'inscription', 0, 0.1, z - 4, 0));
    }
  }
  // A fountain basin and benches in the court for life; pigeons are the city's job.
  if (!garden) {
    for (const [x, z] of [[-w * 0.18, -dd * 0.3], [w * 0.18, -dd * 0.3]] as const) {
      if (free(x, z, 3)) {
        pool(d, x, 0.1, z, 3.6, 2.2, 'marble', 0.5, 0.3);
        spots.push(spot(`${lm.id}:basin${x > 0 ? 'e' : 'w'}`, 'sit', x, 0.1, z - 1.8, 0));
      }
    }
    for (const sx of [-1, 1]) {
      const x = sx * (xw - depth - 1.2), z = -dd * 0.05;
      if (free(x, z, 1)) placeProp(d, 'bench_masonry', x, 0.1, z, sx < 0 ? Math.PI / 2 : -Math.PI / 2);
    }
  }
  // Child footprints are left bare of paving props; mark the court centre and the entrance.
  for (const ch of children(lm)) {
    const p = localOf(ctx, ch);
    if (insidePoly(p.x, p.z, [[-w / 2, -dd / 2], [w / 2, -dd / 2], [w / 2, dd / 2], [-w / 2, dd / 2]])) spots.push(spot(`${lm.id}:near-${ch.id}`, 'vista', p.x, 0.1, Math.max(-dd / 2 + 2, p.z - 12), 0));
  }
  spots.push(spot(`${lm.id}:entrance`, 'door', 0, 0.1, -dd / 2 - 1.5, 0), spot(`${lm.id}:centre`, 'vista', 0, 0.1, -dd * 0.25, 0), spot(`${lm.id}:steps`, 'sit', xw - depth - 0.5, 0.25, 0, -Math.PI / 2));
  far.span(garden ? 'grass' : 'paving_travertine', -w / 2, 0, -dd / 2, w / 2, 0.1, dd / 2);
  return finish(lm.id, d, spots, far);
}

function colonnadeColumn(d: Draw, x: number, z: number, H: number, mat: MaterialId) {
  d.cyl(mat, x, 0.1 + H / 2, z, H / 22, H, 10, { rTop: H / 26, collide: true });
  d.box('marble', x, 0.1 + H - 0.25, z, H / 9, 0.5, H / 9);
  d.cyl('marble', x, 0.25, z, H / 16, 0.3, 10);
}

function halfDisc(R: number) {
  // A flat half disc (paving of an exedra) on the +x side of its centre, top face up.
  const n = 16;
  const pos: number[] = [];
  for (let i = 0; i < n; i++) {
    const a0 = -Math.PI / 2 + (i / n) * Math.PI, a1 = -Math.PI / 2 + ((i + 1) / n) * Math.PI;
    pos.push(0, 0, 0, Math.cos(a1) * R, 0, Math.sin(a1) * R, Math.cos(a0) * R, 0, Math.sin(a0) * R);
  }
  const g = new THREE_.BufferGeometry();
  g.setAttribute('position', new THREE_.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}


export const builders: LandmarkBuilder[] = [{ handles: ['category:forum'], build: buildForum }];
