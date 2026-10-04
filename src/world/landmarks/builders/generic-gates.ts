/**
 * Category builder for the old city gates (portae) of the Servian wall, obsolete in 113 but still
 * standing as landmarks where the great roads leave the old city.
 *
 * A gate is a deep block of Grotta Oscura tufa ashlar (0.6 m courses of alternating headers and
 * stretchers, research §3.37) pierced by one, two or three arched passages, with stubs of the wall
 * running off to either side — ragged where houses have eaten into them — or, for the Augustan
 * rebuilds, a travertine face with a dedication. The notes add what each gate is known for: the
 * aqueduct arcade dripping over the Porta Capena ("madida Capena", Juvenal 3.11), a shunned right
 * passage (Porta Carmentalis). Every gate is lit by wall torches (the game starts before dawn at
 * the Porta Capena) and has a guard post and a customs table outside, with spots for the gameplay
 * team: the arrival point outside (`<id>:spawn-<name>`), the guard, the customs officer, a vendor.
 */
import * as THREE from 'three';
import { plainArch } from '../../../arch/classical/arch';
import type { Draw } from '../../../arch/fabric/draw';
import { placeProp } from '../../../arch/props';
import type { MaterialId } from '../../../gfx/materialIds';
import type { LandmarkBuild, LandmarkBuilder, LandmarkContext, Spot } from '../types';
import { ashlarFace, dims, draw, farDraw, finish, heightG, hintsOf, inscription, spot, tiledRoof, wallRun, type Detail } from './generic-common';
import { brazier, wallTorch } from './generic-world';

/** Pure: passages of a gate from its notes (triple / double / single). */
export function gatePassages(text: string): 1 | 2 | 3 {
  if (/only the central bay survives/.test(text)) return 1;
  if (/\btriple\b|trigemina/.test(text)) return 3;
  if (/\bdouble\b|two passages|twin/.test(text)) return 2;
  return 1;
}

function buildGate(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const h = hintsOf(lm);
  const rng = ctx.rng.fork('gate');
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  const travertine = h.has('augustan') || (h.has('travertine') && !h.has('tufa'));
  const mat: MaterialId = travertine ? 'travertine' : 'tufa';
  const n = gatePassages(h.text);
  // Monumental height is scaled, but the passages stay big enough for an ox-cart (1:1 rule).
  const H = Math.max(6.2, heightG(ctx, 6));
  const span = n === 1 ? clamp(w * 0.38, 3.2, 4.4) : clamp(w * 0.22, 2.8, 3.6);
  const crown = Math.min(H - 1.3, span / 2 + Math.max(3.0, span * 0.85));
  const xs = n === 1 ? [0] : n === 2 ? [-w * 0.22, w * 0.22] : [-w * 0.3, 0, w * 0.3];
  const depth = Math.max(3.2, dd);
  const z0 = -depth / 2, z1 = depth / 2;
  // Foundation: the gate stands on its own footing down to the lowest ground under it.
  let gmin = 0;
  for (const x of [-w / 2, 0, w / 2]) for (const z of [z0, z1]) gmin = Math.min(gmin, ctx.groundAt(x, z));
  d.span(mat, -w / 2, gmin - 0.6, z0, w / 2, 0.02, z1, { collide: true });
  // Piers between and beside the passages, and the solid masonry over the arches.
  const edges = [-w / 2, ...xs.flatMap((x) => [x - span / 2, x + span / 2]), w / 2];
  for (let i = 0; i < edges.length; i += 2) d.span(mat, edges[i], 0, z0, edges[i + 1], H, z1, { collide: true });
  for (const x of xs) {
    plainArch(d.b, { span, height: crown, pier: 0.01, depth: depth + 0.16, material: travertine ? 'travertine' : 'peperino', detail, cornice: false }, d.m.clone().multiply(new THREE.Matrix4().makeTranslation(x, 0, 0)));
    d.span(mat, x - span / 2, crown + span * 0.36, z0, x + span / 2, H, z1);
    d.span('paving_basalt', x - span / 2, -0.25, z0 - 0.4, x + span / 2, 0.03, z1 + 0.4);
    // Worn threshold kerbs and the pivot sockets of the long-gone doors.
    for (const sx of [-1, 1]) d.box('travertine', x + sx * (span / 2 - 0.12), 0.08, 0, 0.24, 0.16, depth * 0.9);
  }
  // Ashlar coursing on both faces (blocks proud of the core so the joints read as shadow lines).
  if (detail === 'high') {
    const holes = xs.map((x) => ({ x0: x - span / 2 - 0.05, x1: x + span / 2 + 0.05, y1: crown + span * 0.36 }));
    ashlarFace(d, -w / 2, w / 2, 0, H, z0, -1, mat, rng.fork('f'), holes);
    ashlarFace(d, -w / 2, w / 2, 0, H, z1, 1, mat, rng.fork('b'), holes);
  }
  if (travertine) {
    // Augustan rebuild: a cornice and the dedication on the attic.
    d.span('travertine', -w / 2 - 0.25, H - 0.55, z0 - 0.25, w / 2 + 0.25, H, z1 + 0.25);
    d.span('travertine', -w / 2 - 0.12, H - 0.85, z0 - 0.12, w / 2 + 0.12, H - 0.55, z1 + 0.12);
    inscription(d, ['IMP CAESAR DIVI F AVGVSTVS', 'PONTIFEX MAXIMVS'], 0, H - 1.7, z0 - 0.03, Math.min(w * 0.7, 9), 1.0);
  } else {
    // Parapet with merlons on the old fighting platform.
    for (const z of [z0 + 0.25, z1 - 0.25]) {
      const m = Math.max(3, Math.floor(w / 1.55));
      for (let i = 0; i < m; i++) d.box(mat, -w / 2 + (i + 0.5) * (w / m), H + 0.55, z, (w / m) * 0.58, 1.1, 0.5);
    }
  }
  // Stubs of the wall running off either side, following the ground, ragged where they stop.
  const stub = travertine ? 0 : clamp(w * 1.6, 9, 18);
  const t = Math.min(depth * 0.7, 3.0);
  for (const sx of [-1, 1]) {
    if (!stub) break;
    const segs = Math.round(stub / 2.4);
    for (let k = 0; k < segs; k++) {
      const xa = sx * (w / 2 + k * (stub / segs)), xb = sx * (w / 2 + (k + 1) * (stub / segs));
      const g0 = Math.min(ctx.groundAt(xa, 0), ctx.groundAt(xb, 0), ctx.groundAt(xa, t / 2), ctx.groundAt(xa, -t / 2));
      // The top steps down towards the broken end; the last two blocks are lower still.
      const top = H * (0.86 - 0.03 * k) - (k >= segs - 2 ? rng.range(0.6, 1.6) : 0);
      wallRun(d, xa, 0, xb, 0, g0 - 0.6, Math.max(g0 + 1.2, top), t, mat);
      if (detail === 'high') {
        ashlarFace(d, Math.min(xa, xb), Math.max(xa, xb), Math.max(g0, 0) , Math.max(g0 + 1.2, top) - 0.1, -t / 2, -1, mat, rng.fork(`s${sx}${k}`));
        ashlarFace(d, Math.min(xa, xb), Math.max(xa, xb), Math.max(g0, 0), Math.max(g0 + 1.2, top) - 0.1, t / 2, 1, mat, rng.fork(`t${sx}${k}`));
      }
    }
    // Fallen blocks at the broken end.
    for (let i = 0; i < 3; i++) {
      const x = sx * (w / 2 + stub + rng.range(0.5, 2.2)), z = rng.range(-2, 2);
      d.box(mat, x, ctx.groundAt(x, z) + 0.28, z, 1.2, 0.56, 0.6, { ry: rng.range(-0.6, 0.6), collide: true });
    }
  }
  far.span(mat, -w / 2, gmin - 0.5, z0, w / 2, H, z1);
  if (stub) for (const sx of [-1, 1]) far.span(mat, sx * w / 2, 0, -t / 2, sx * (w / 2 + stub), H * 0.75, t / 2);
  // The aqueduct arcade crossing over the gate, leaking ("dripping gate").
  if (h.has('aqueduct', 'dripping', 'madida')) aqueductOverGate(ctx, d, far, w, H, z1, detail, spots);
  // The shunned passage (Porta Carmentalis: the right-hand arch, seen from inside the city).
  if (n >= 2 && h.has('shunned', 'wicked', 'scelerata')) {
    const x = xs[0]; // inside the city (+z) the right hand is local −x
    spots.push(spot(`${lm.id}:scelerata`, 'shrine', x, 0, z1 + 1.5, Math.PI));
    d.box('travertine', x, 0.45, z1 + 1.0, 0.5, 0.9, 0.5, { collide: true }); // a little altar of aversion
  }
  // Torches on both faces, beside every passage.
  for (const x of xs) {
    for (const sx of [-1, 1]) {
      wallTorch(ctx, d, x + sx * (span / 2 + 0.55), 2.7, z0 - (detail === 'high' ? 0.05 : 0), 0);
      wallTorch(ctx, d, x + sx * (span / 2 + 0.55), 2.7, z1 + (detail === 'high' ? 0.05 : 0), Math.PI);
    }
  }
  guardPost(ctx, d, w, z0, spots);
  const name = lm.id.replace(/^porta-/, '');
  spots.push(
    spot(`${lm.id}:spawn-${name}`, 'spawn', xs[0] === 0 ? 0 : xs[Math.floor(n / 2)], ctx.groundAt(0, z0 - 12) + 0.05, z0 - 12, 0),
    spot(`${lm.id}:passage`, 'vista', xs[Math.floor(n / 2)], 0.03, z1 + 2, 0),
    spot(`${lm.id}:guard`, 'npc', xs[0] + span / 2 + 1.2, 0, z0 - 1.6, Math.PI),
    spot(`${lm.id}:guard2`, 'npc', xs[xs.length - 1] - span / 2 - 1.2, 0, z1 + 1.6, 0),
  );
  if (travertine) spots.push(spot(`${lm.id}:inscription`, 'inscription', 0, 0.03, z0 - 4, 0));
  return finish(lm.id, d, spots, far);
}

/**
 * Outside the gate, to the right of the road: a timber guard and customs booth (the toll on goods
 * entering the city) with a table, an amphora stack, a bench and a brazier, and a trough for the
 * draught animals.
 */
function guardPost(ctx: LandmarkContext, d: Draw, w: number, z0: number, spots: Spot[]) {
  const { lm } = ctx;
  const x = w / 2 + 2.6, z = z0 - 4.2;
  const f = d.at(x, ctx.groundAt(x, z), z, 0);
  // Booth: plank walls on three sides, open to the road (−x), shed roof.
  f.span('wood', 1.0, 0, -1.3, 1.12, 2.4, 1.3, { collide: true });
  f.span('wood', -1.0, 0, 1.2, 1.12, 2.4, 1.32, { collide: true });
  f.span('wood', -1.0, 0, -1.32, 1.12, 2.4, -1.2, { collide: true });
  for (const zz of [-1.26, 1.26]) f.cyl('wood_dark', -1.0, 1.2, zz, 0.07, 2.4, 5);
  tiledRoof(f, 'shed', 0, 0, 2.6, 3.0, 2.4, 'low', { pitchDeg: 12, axis: 'x' });
  placeProp(f, 'table', -0.2, 0, 0, Math.PI / 2, { variant: 0 });
  placeProp(f, 'stool', 0.5, 0, 0.1, -Math.PI / 2, { variant: 2 });
  placeProp(f, 'amphora_stack', 0.4, 0, 0.85, 0, { collide: false });
  placeProp(f, 'bench', -1.6, 0, 1.8, 0);
  brazier(ctx, f, -1.7, 0, -0.9, 0.95);
  spots.push(spot(`${lm.id}:customs`, 'vendor', x + 0.5, f.m.elements[13], z, -Math.PI / 2));
  spots.push(spot(`${lm.id}:bench`, 'sit', x - 1.6, f.m.elements[13], z + 1.8, Math.PI));
  // Trough across the road.
  const tx = -w / 2 - 2.4, tz = z0 - 3.4;
  placeProp(d, 'trough', tx, ctx.groundAt(tx, tz), tz, Math.PI / 2);
  // A hawker's stall a little further out.
  const sx = -w / 2 - 3.2, sz = z0 - 8.5;
  placeProp(d, 'stall', sx, ctx.groundAt(sx, sz), sz, Math.PI / 2, { rng: ctx.rng.fork('stall') });
  spots.push(spot(`${lm.id}:stall`, 'stall', sx + 1.2, ctx.groundAt(sx, sz), sz, Math.PI / 2));
}

/**
 * A stretch of aqueduct arcade crossing just inside the gate, higher than it, its channel leaking:
 * moss on the piers and the soffits, drips, and a puddle on the road (the Marcia branch over the
 * Porta Capena). Built with the gate because the leak is the gate's identity.
 */
function aqueductOverGate(ctx: LandmarkContext, d: Draw, far: Draw, w: number, H: number, zg: number, detail: Detail, spots: Spot[]) {
  const z = zg + 2.4;
  const pier = 1.3, thick = 1.6;
  // The bay over the road clears the widest gate passage with room to spare.
  const bay = Math.max(5.0, Math.min(w * 0.55, 6.4) + pier);
  const spring = H + 0.8;
  const r = (bay - pier) / 2;
  const top = spring + r + 1.0;
  const nb = 3; // bays each side of the central one
  for (let i = -nb; i <= nb + 1; i++) {
    const x = (i - 0.5) * bay;
    const g = Math.min(ctx.groundAt(x - pier / 2, z), ctx.groundAt(x + pier / 2, z));
    d.span('tufa', x - pier / 2, g - 0.5, z - thick / 2, x + pier / 2, spring, z + thick / 2, { collide: true });
    d.span('travertine', x - pier / 2 - 0.08, spring - 0.25, z - thick / 2 - 0.08, x + pier / 2 + 0.08, spring, z + thick / 2 + 0.08);
    if (detail === 'high') d.span('foliage_broad', x - pier / 2 - 0.03, g + 0.2, z - thick / 2 - 0.03, x - pier / 2 + 0.3, spring - 0.3, z - thick / 2 + 0.25);
  }
  for (let i = -nb; i <= nb; i++) {
    const x = i * bay;
    plainArch(d.b, { span: bay - pier, height: spring + r, pier: 0.01, depth: thick, material: 'tufa', detail, cornice: false }, d.m.clone().multiply(new THREE.Matrix4().makeTranslation(x, 0, z)));
    d.span('tufa', x - r, spring + r * 0.9, z - thick / 2, x + r, top, z + thick / 2);
  }
  const L = (nb + 0.5) * bay + pier / 2;
  // Channel (specus) with its stucco lining, cover slabs and a string course.
  d.span('travertine', -L - 0.1, top, z - thick / 2 - 0.12, L + 0.1, top + 0.25, z + thick / 2 + 0.12);
  d.span('concrete', -L, top + 0.25, z - thick / 2, L, top + 1.5, z - thick / 2 + 0.35);
  d.span('concrete', -L, top + 0.25, z + thick / 2 - 0.35, L, top + 1.5, z + thick / 2);
  d.span('peperino', -L, top + 1.5, z - thick / 2 - 0.05, L, top + 1.75, z + thick / 2 + 0.05);
  // The leak: moss streaks down the arch over the road, drips, a puddle and wet stones.
  d.span('foliage_broad', -1.2, spring - 1.5, z - thick / 2 - 0.04, 1.2, top + 0.3, z - thick / 2 - 0.01);
  if (detail === 'high') {
    for (let i = 0; i < 6; i++) {
      const x = ctx.rng.range(-1.6, 1.6), zz = z + ctx.rng.range(-0.5, 0.5);
      const len = ctx.rng.range(0.4, 1.6);
      d.cyl('water', x, spring + r - 0.2 - len / 2, zz, 0.015, len, 4, { rTop: 0.006 });
    }
  }
  d.cyl('water', 0.3, ctx.groundAt(0.3, z) + 0.035, z, 1.6, 0.02, 14);
  d.cyl('mud', 0.3, ctx.groundAt(0.3, z) + 0.02, z, 2.3, 0.02, 14);
  spots.push(spot(`${ctx.lm.id}:drip`, 'vista', 0, 0.03, z, 0));
  far.span('tufa', -L, 0, z - thick / 2, L, top + 1.75, z + thick / 2);
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export const builders: LandmarkBuilder[] = [{ handles: ['category:gate'], build: buildGate }];
