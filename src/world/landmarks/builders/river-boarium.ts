/**
 * Forum Boarium group: the Temple of Portunus (Ionic tetrastyle pseudoperipteral, stuccoed tufa
 * and travertine), the round marble Temple of Hercules Victor (20 Corinthian columns on a stepped
 * crepidoma, the door intercolumniation widened so the player can walk in) and the Ara Maxima (a
 * great tufa platform-altar with the bronze Hercules).
 */
import * as THREE from 'three';
import { ProfileBuilder, T, TRS, lathe, mul } from '../../../arch/common/geom';
import { inscriptionPanel, paintedSign } from '../../../arch/common/inscription';
import { stairs, stepCount } from '../../../arch/common/stairs';
import { column } from '../../../arch/classical/column';
import { entablature } from '../../../arch/classical/entablature';
import { columnDims, type Detail } from '../../../arch/classical/orders';
import { podium } from '../../../arch/classical/podium';
import { placeProp } from '../../../arch/props';
import type { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../gfx/materialIds';
import type { LandmarkBuilder, LandmarkContext, Spot } from '../types';
import { altar, centredTemple, draw, spot } from './river-kit';
import { LampList, riverLife } from './river-life';
import { emitBronze, hercules } from './river-sculpt';

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
  const za = front - 2.6;
  altar(d.at(0, 0, za), 1.6, 1.05, 1.1, 'travertine');
  // A painted festival notice on the podium wing: the Portunalia, a.d. XVI Kal. Sept. (17 August).
  const wingX = L.stairs.x0 - (L.stairs.x0 - L.stylobate.x0) / 2;
  paintedSign(b, ['PORTVNALIA', 'A·D·XVI·K·SEPT'], 0.9, 0.5, T(wingX, P * 0.55, front - 0.02));
  if (hi) {
    // Votive keys hung on the porch: the god of keys and harbours.
    for (const sx of [-1, 1]) d.cyl('bronze', sx * 0.5, P + 1.6, L.cella.z0 + dz - 0.06, 0.03, 0.55, 6);
  }
  const spots: Spot[] = [
    spot('temple-portunus:altar', 'shrine', 0, 0, za - 1.4, 0),
    spot('temple-portunus:notice', 'inscription', wingX, 0, front - 1.0, 0),
    spot('temple-portunus:porch', 'vista', 0, P, L.stylobate.z0 + dz + 0.4, Math.PI),
    spot('temple-portunus:aedituus', 'npc', 0.6, P, L.cella.z0 + dz - 1.0, Math.PI),
  ];
  riverLife(ctx, spots, new LampList().add(0, 1.3, za, 'fire'));
  return { object: b.build(ctx.lm.id), colliders: b.colliders, spots };
}

interface RoundTempleSpec {
  columns: number;
  radius: number;
  columnHeight: number;
  D: number;
  baseHeight: number;
  /** Clear chord (m) between the shafts of the door intercolumniation (wider than the rest). */
  doorChord: number;
  material: MaterialId;
  roofMaterial: MaterialId;
  pitchDeg: number;
  detail: Detail;
}

/**
 * A tholos on a stepped crepidoma (after the classical kit's `tholos`, 'steps' base), with the
 * intercolumniation in front of the door (−z) widened to `doorChord` and the other bays closed up
 * evenly: at 0.6 scale twenty columns on a 4.1 m ring leave 0.6 m between shafts, too narrow for
 * anyone to pass. The ring still reads as twenty evenly spaced columns.
 */
function roundTemple(b: MeshBuilder, spec: RoundTempleSpec) {
  const order = 'corinthian';
  const n = spec.columns;
  const R = spec.radius;
  const H = spec.columnHeight;
  const D = spec.D;
  const dims = columnDims(order, D, H);
  const detail = spec.detail;
  const mat = spec.material;
  const segs = detail === 'high' ? n * 4 : n * 2;
  const outerR = R + dims.plinth / 2 + 0.35;
  // Crepidoma: concentric steps all round, each a stacked cylinder the player can climb.
  const { count, rise } = stepCount(spec.baseHeight, 0.22);
  const run = 0.36;
  for (let i = 0; i < count; i++) {
    const r = outerR + (count - 1 - i) * run;
    const last = i === count - 1;
    const prof = new ProfileBuilder(r, i * rise).up(rise).to(last ? r - 0.1 : 0, (i + 1) * rise - (last ? 0.03 : 0)).build();
    b.add(lathe(prof, { segments: segs }), mat);
    b.collider({ kind: 'cylinder', center: new THREE.Vector3(0, ((i + 1) * rise) / 2, 0), halfHeight: ((i + 1) * rise) / 2, radius: r });
  }
  const P = count * rise;
  b.add(lathe(new ProfileBuilder(outerR, P).to(0, P).build(), { segments: segs }), 'paving_travertine', undefined, { castShadow: false });
  // Columns: the door bay (centred on −z, a = π) spans `door` radians, the others share the rest.
  const door = 2 * Math.asin(Math.min(0.9, (spec.doorChord + D * 1.04) / (2 * R)));
  const step = (2 * Math.PI - door) / (n - 1);
  for (let k = 0; k < n; k++) {
    const a = Math.PI + door / 2 + k * step;
    column(b, { order, D, height: H, fluted: true, material: mat, detail }, TRS(R * Math.sin(a), P, R * Math.cos(a), 0, a, 0));
  }
  const yE = P + H;
  const entPath: THREE.Vector3[] = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    entPath.push(new THREE.Vector3((R + dims.d / 2) * Math.cos(a), yE, (R + dims.d / 2) * Math.sin(a)));
  }
  const ent = entablature(b, entPath, { order, columnHeight: H, D, material: mat, detail, axial: (2 * Math.PI * R) / n }, { closed: true });
  const yTop = yE + ent.dims.total;
  // Cella: cylindrical wall with the door towards −z; a lintel closes the wall over the door.
  const cellaR = R - Math.max(1.6, 1.9 * D);
  const wallT = Math.max(0.5, 0.7 * D);
  const wallH = H + ent.dims.architrave + ent.dims.frieze;
  const doorW = Math.min(cellaR * 0.75, H * 0.35);
  const doorH = Math.min(H * 0.72, doorW * 2.2);
  const half = Math.asin(Math.min(0.95, doorW / 2 / cellaR));
  const wallProf = new ProfileBuilder(cellaR, 0).up(wallH).in(wallT).to(cellaR - wallT, 0).build();
  b.add(lathe(wallProf, { segments: segs, theta0: Math.PI + half, theta1: Math.PI * 3 - half }), mat, T(0, P, 0));
  const lintel = new ProfileBuilder(cellaR, doorH).up(wallH - doorH).in(wallT).to(cellaR - wallT, doorH).build();
  b.add(lathe(lintel, { segments: 4, theta0: Math.PI - half, theta1: Math.PI + half }), mat, T(0, P, 0));
  for (const sx of [-1, 1]) {
    const jamb = new THREE.BoxGeometry(0.02, doorH, wallT);
    jamb.translate(0, doorH / 2, -(cellaR - wallT / 2));
    jamb.rotateY(sx * half);
    b.add(jamb, mat, T(0, P, 0));
  }
  const leaf = new THREE.BoxGeometry(doorW * 0.98, doorH, 0.1);
  leaf.translate(0, P + doorH / 2, -(cellaR - wallT * 0.55) * Math.cos(half));
  b.add(leaf, 'bronze');
  b.collider({ kind: 'cylinder', center: new THREE.Vector3(0, P + wallH / 2, 0), halfHeight: wallH / 2, radius: cellaR });
  // Ceiling ring, conical roof with tiles running down the slope, a gilded finial.
  const ceil = new ProfileBuilder(R + dims.d / 2 + 0.05, yE + ent.dims.architrave + ent.dims.frieze).to(0, yE + ent.dims.architrave + ent.dims.frieze).build();
  b.add(lathe({ pts: [...ceil.pts].reverse(), smooth: ceil.smooth }, { segments: segs }), 'wood_dark', undefined, { castShadow: false });
  const pitch = (spec.pitchDeg * Math.PI) / 180;
  const roofR = R + ent.projection + 0.15;
  const rr = roofR * Math.tan(pitch);
  const roofProf = new ProfileBuilder(0.02, yTop + rr).to(roofR, yTop - 0.05).build();
  b.add(lathe({ pts: [...roofProf.pts].reverse(), smooth: roofProf.smooth }, { segments: segs }), spec.roofMaterial, undefined);
  const under = new ProfileBuilder(roofR, yTop - 0.15).to(0.02, yTop + rr - 0.15).build();
  b.add(lathe({ pts: [...under.pts].reverse(), smooth: under.smooth }, { segments: segs }), 'wood_dark', undefined, { castShadow: false });
  const fin = new ProfileBuilder(0.0, yTop + rr - 0.05).to(0.35, yTop + rr - 0.05).up(0.12).to(0.12, yTop + rr + 0.3).ovolo(0.16, 0.25, 4).to(0, yTop + rr + 0.75).build();
  b.add(lathe(fin, { segments: 12 }), 'gilded_bronze');
  return { baseHeight: P, outerRadius: outerR, cellaR, steps: count, run, door };
}

function templeHerculesVictor(ctx: LandmarkContext) {
  const { S } = ctx;
  const b = ctx.builder();
  const hi = ctx.detail === 'high';
  // 20 Corinthian columns of Pentelic marble, 10.66 m tall (D ≈ 1 m), ring Ø 14.8 m, on a stepped
  // Greek crepidoma; round marble cella; low conical tiled roof. The door faces east (−z here).
  const D = 1.0 * S;
  const R = 7.4 * S - D / 2;
  const res = roundTemple(b, { columns: 20, radius: R, columnHeight: 10.66 * S, D, baseHeight: 0.9, doorChord: 1.3, material: 'marble', roofMaterial: 'roof_tile', pitchDeg: 21, detail: ctx.detail });
  const d = draw(b);
  const rOut = res.outerRadius + (res.steps - 1) * res.run;
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
    // In front of the cella door, inside the colonnade (reached through the widened door bay).
    spot('temple-hercules-victor:door', 'door', 0, res.baseHeight, -(res.cellaR + 0.6), 0),
  ];
  riverLife(ctx, spots, new LampList().add(0, 1.3, zAltar, 'fire'));
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
  podium(b, { outline: [[-W / 2, z0], [W / 2, z0], [W / 2, Dd / 2], [-W / 2, Dd / 2]], height: H, material: 'tufa', topMaterial: 'paving_travertine', detail: ctx.detail });
  // Cheek walls flank the flight.
  for (const sx of [-1, 1]) b.box('tufa', (W - stairW) / 2, H, count * run, T(sx * (stairW / 2 + (W - stairW) / 4), H / 2, (-Dd / 2 + z0) / 2), { collide: true });
  stairs(b, { width: stairW, rise, run, count, material: 'travertine' }, T(0, 0, -Dd / 2));
  const d = draw(b);
  // Foundation where the ground slopes away.
  let lo = 0;
  for (const [x, z] of [[-W / 2, -Dd / 2], [W / 2, -Dd / 2], [W / 2, Dd / 2], [-W / 2, Dd / 2], [0, 0]]) lo = Math.min(lo, ctx.groundAt(x, z));
  if (lo < -0.05) b.box('tufa', W + 0.1, -lo + 0.3, Dd + 0.1, T(0, lo / 2 - 0.15, 0), { collide: true });
  // Low balustrade round the platform top (open at the stairs).
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
  emitBronze(b, hercules(hi), 'bronze', mul(T(0, H + 1.78, zs), new THREE.Matrix4().makeScale(1.3, 1.3, 1.3)));
  // Bronze tripods either side of the altar, their fires burning day and night.
  const lamps = new LampList().add(0, H + 0.2 + 1.45, za, 'fire');
  for (const sx of [-1, 1]) {
    const t = d.at(sx * 3.6, H, za);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      t.rod('bronze', new THREE.Vector3(Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35), new THREE.Vector3(Math.cos(a) * 0.2, 1.3, Math.sin(a) * 0.2), 0.03, 5);
    }
    t.cyl('bronze', 0, 1.38, 0, 0.42, 0.18, 10, { rTop: 0.5 });
    t.cyl('glow_fire', 0, 1.52, 0, 0.18, 0.18, 6, { rTop: 0.02 });
    t.solidCyl(0, 0.75, 0, 0.45, 1.5);
    lamps.add(sx * 3.6, H + 1.6, za, 'brazier');
  }
  const spots: Spot[] = [
    spot('ara-maxima:altar', 'shrine', -1.0, H, za - 2.9, 0),
    spot('ara-maxima:dedication', 'inscription', 0.4, H, zs - 1.9, 0),
    // The priest stands before the altar (not in it), facing it.
    spot('ara-maxima:priest', 'npc', 1.0, H, za - 2.3, 0),
    // On the fourth step (tread top), facing the forum.
    spot('ara-maxima:steps', 'sit', -stairW / 2 + 0.6, rise * 4, -Dd / 2 + run * 3.5, Math.PI),
  ];
  riverLife(ctx, spots, lamps);
  return { object: b.build(lm.id), colliders: b.colliders, spots };
}

export const builders: LandmarkBuilder[] = [
  { handles: ['temple-portunus'], build: templePortunus },
  { handles: ['temple-hercules-victor'], build: templeHerculesVictor },
  { handles: ['ara-maxima'], build: araMaxima },
];
