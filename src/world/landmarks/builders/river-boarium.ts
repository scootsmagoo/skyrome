/**
 * Forum Boarium group: the Temple of Portunus (Ionic tetrastyle pseudoperipteral, stuccoed tufa
 * and travertine), the round marble Temple of Hercules Victor (20 Corinthian columns on a stepped
 * crepidoma), the Ara Maxima (a great tufa platform-altar) and the outfall of the Cloaca Maxima.
 */
import * as THREE from 'three';
import { T, TRS, mul } from '../../../arch/common/geom';
import { inscriptionPanel, paintedSign } from '../../../arch/common/inscription';
import { stairs, stepCount } from '../../../arch/common/stairs';
import { podium } from '../../../arch/classical/podium';
import { tholos } from '../../../arch/classical/tholos';
import { placeProp } from '../../../arch/props';
import type { LandmarkBuilder, LandmarkContext, Spot } from '../types';
import { altar, centredTemple, draw, heracles, riverEnv, spot } from './river-kit';

function templePortunus(ctx: LandmarkContext) {
  const { S } = ctx;
  const b = ctx.builder();
  const hi = ctx.detail === 'high';
  // Footprint ≈ 10.5 × 19 m real on a 2.3 m podium; Ionic columns ≈ 8.5 m. 4 × 7 pseudoperipteral:
  // a porch two columns deep, half-columns engaged on the flanks (5) and back (4).
  const P = 2.3 * S;
  const { L, front, dz } = centredTemple(ctx, b, {
    order: 'ionic',
    plan: 'pseudoperipteral',
    front: 4,
    sides: 7,
    pronaos: 2,
    width: 10.8 * S,
    podiumHeight: P,
    material: 'plaster_white',
    cellaMaterial: 'plaster_white',
    podiumMaterial: 'travertine',
    roofMaterial: 'roof_tile',
    fluted: true,
    detail: ctx.detail,
  });
  const d = draw(b);
  altar(d.at(0, 0, front - 2.6), 1.6, 1.05, 1.1, 'travertine');
  // A painted festival notice on the podium wing: the Portunalia, a.d. XVI Kal. Sept. (17 August).
  const wingX = L.stairs.x0 - (L.stairs.x0 - L.stylobate.x0) / 2;
  paintedSign(b, ['PORTVNALIA', 'A·D·XVI·K·SEPT'], 0.9, 0.5, T(wingX, P * 0.55, front - 0.02));
  if (hi) {
    // Votive keys hung on the porch: the god of keys and harbours.
    for (const sx of [-1, 1]) d.cyl('bronze', sx * 0.5, P + 1.6, L.cella.z0 + dz - 0.06, 0.03, 0.55, 6);
  }
  const spots: Spot[] = [
    spot('temple-portunus:altar', 'shrine', 0, 0, front - 4.0, 0),
    spot('temple-portunus:notice', 'inscription', wingX, 0, front - 1.0, 0),
    spot('temple-portunus:porch', 'vista', 0, P, L.stylobate.z0 + dz + 0.4, Math.PI),
    spot('temple-portunus:aedituus', 'npc', 0.6, P, L.cella.z0 + dz - 1.0, Math.PI),
  ];
  return { object: b.build(ctx.lm.id), colliders: b.colliders, spots };
}

function templeHerculesVictor(ctx: LandmarkContext) {
  const { S } = ctx;
  const b = ctx.builder();
  const hi = ctx.detail === 'high';
  // 20 Corinthian columns of Pentelic marble, 10.66 m tall (D ≈ 1 m), ring Ø 14.8 m, on a stepped
  // Greek crepidoma; round marble cella; low conical tiled roof. The door faces east (−z here).
  const D = 1.0 * S;
  const R = 7.4 * S - D / 2;
  const res = tholos(b, { columns: 20, radius: R, columnHeight: 10.66 * S, D, base: 'steps', baseHeight: 0.9, material: 'marble', cellaMaterial: 'marble', roofMaterial: 'roof_tile', pitchDeg: 21, detail: ctx.detail });
  const d = draw(b);
  const steps = Math.round(0.9 / 0.22);
  const rOut = res.outerRadius + (steps - 1) * 0.36;
  const zAltar = -rOut - 3.2;
  altar(d.at(0, 0, zAltar), 1.5, 1.0, 1.1, 'marble');
  inscriptionPanel(b, { lines: ['HERCVLI · VICTORI', 'SACRVM'], width: 1.3, height: 0.42, style: 'carved' }, T(0, 0.45, zAltar - 0.535), { depth: 0.02 });
  if (hi) {
    // Oil merchants' offerings: a few amphorae of oil leaning by the steps.
    for (const [x, rz] of [[-2.2, 0.2], [-2.7, -0.15], [2.4, 0.1]] as const) placeProp(d, 'amphora_globular', x, 0, -rOut - 0.5, rz, { variant: 0 });
  }
  const spots: Spot[] = [
    spot('temple-hercules-victor:altar', 'shrine', 0, 0, zAltar - 1.6, 0),
    spot('temple-hercules-victor:dedication', 'inscription', 0.6, 0, zAltar - 1.2, 0),
    spot('temple-hercules-victor:door', 'door', 0, res.baseHeight, -(R - 1.9 * D) - 0.6, Math.PI),
  ];
  return { object: b.build(ctx.lm.id), colliders: b.colliders, spots };
}

function araMaxima(ctx: LandmarkContext) {
  const { S, lm } = ctx;
  const b = ctx.builder();
  const hi = ctx.detail === 'high';
  const fp = lm.footprint as { w: number; d: number };
  const W = fp.w * S;
  const Dd = fp.d * S;
  // A massive tufa platform (rebuilt after the fire of 64) with a frontal flight towards the
  // Forum Boarium; the altar table, the bronze Hercules and the dedication stand on top.
  const H = 1.6;
  const { count, rise } = stepCount(H, 0.21);
  const run = 0.34;
  const stairW = W * 0.55;
  const z0 = -Dd / 2 + count * run; // platform front (stairs in front of it)
  const outline: [number, number][] = [
    [-W / 2, z0], [-stairW / 2, z0], [-stairW / 2, -Dd / 2], [stairW / 2, -Dd / 2], [stairW / 2, z0], [W / 2, z0], [W / 2, Dd / 2], [-W / 2, Dd / 2],
  ];
  // Cheek walls flank the flight: the outline steps forward around it.
  podium(b, { outline: [[-W / 2, z0], [W / 2, z0], [W / 2, Dd / 2], [-W / 2, Dd / 2]], height: H, material: 'tufa', topMaterial: 'paving_travertine', detail: ctx.detail });
  for (const sx of [-1, 1]) b.box('tufa', (W - stairW) / 2, H, count * run, T(sx * (stairW / 2 + (W - stairW) / 4), H / 2, (-Dd / 2 + z0) / 2), { collide: true });
  void outline;
  stairs(b, { width: stairW, rise, run, count, material: 'travertine' }, T(0, 0, -Dd / 2));
  const d = draw(b);
  // Foundation where the ground slopes away.
  let lo = 0;
  for (const [x, z] of [[-W / 2, -Dd / 2], [W / 2, -Dd / 2], [W / 2, Dd / 2], [-W / 2, Dd / 2], [0, 0]]) lo = Math.min(lo, ctx.groundAt(x, z));
  if (lo < -0.05) b.box('tufa', W + 0.1, -lo + 0.3, Dd + 0.1, T(0, lo / 2 - 0.15, 0), { collide: true });
  // Low marble balustrade round the platform top (open at the stairs).
  const bal = (x0: number, z0b: number, x1: number, z1: number) => d.span('travertine', x0, H, z0b, x1, H + 0.9, z1, { collide: true });
  bal(-W / 2, z0, -stairW / 2, z0 + 0.25);
  bal(stairW / 2, z0, W / 2, z0 + 0.25);
  bal(-W / 2, z0, -W / 2 + 0.25, Dd / 2);
  bal(W / 2 - 0.25, z0, W / 2, Dd / 2);
  bal(-W / 2, Dd / 2 - 0.25, W / 2, Dd / 2);
  // The altar itself: a great block of travertine with a fire, on a stepped base.
  const za = z0 + (Dd / 2 - z0) * 0.42;
  d.span('travertine', -2.6, H, za - 1.7, 2.6, H + 0.2, za + 1.7, { collide: true });
  altar(d.at(0, H + 0.2, za), 3.4, 2.0, 1.25, 'travertine');
  // Bronze Hercules (Triumphalis) on a pedestal behind the altar, facing the forum.
  const zs = Dd / 2 - 2.4;
  d.span('marble', -0.9, H, zs - 0.9, 0.9, H + 1.7, zs + 0.9, { collide: true });
  d.span('marble', -1.0, H + 1.6, zs - 1.0, 1.0, H + 1.78, zs + 1.0);
  inscriptionPanel(b, { lines: ['HERCVLI', 'INVICTO'], width: 1.3, height: 0.7, style: 'carved' }, T(0, H + 0.9, zs - 0.905), { depth: 0.02 });
  heracles(d.at(0, H + 1.78, zs), 'bronze', 1.3, hi);
  // Bronze tripods either side of the altar.
  for (const sx of [-1, 1]) {
    const t = d.at(sx * 3.6, H, za);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      t.rod('bronze', new THREE.Vector3(Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35), new THREE.Vector3(Math.cos(a) * 0.2, 1.3, Math.sin(a) * 0.2), 0.03, 5);
    }
    t.cyl('bronze', 0, 1.38, 0, 0.42, 0.18, 10, { rTop: 0.5 });
    if (hi) t.cyl('glow_fire', 0, 1.52, 0, 0.18, 0.18, 6, { rTop: 0.02 });
  }
  const spots: Spot[] = [
    spot('ara-maxima:altar', 'shrine', 0, H, za - 2.6, 0),
    spot('ara-maxima:dedication', 'inscription', 0.4, H, zs - 1.9, 0),
    spot('ara-maxima:priest', 'npc', 1.4, H, za + 0.4, Math.PI),
    spot('ara-maxima:steps', 'sit', -stairW / 2 + 0.6, rise * 3, -Dd / 2 + run * 3.5, Math.PI),
  ];
  void mul;
  void TRS;
  return { object: b.build(lm.id), colliders: b.colliders, spots };
}

export const builders: LandmarkBuilder[] = [
  { handles: ['temple-portunus'], build: templePortunus },
  { handles: ['temple-hercules-victor'], build: templeHerculesVictor },
  { handles: ['ara-maxima'], build: araMaxima },
];

void riverEnv;
