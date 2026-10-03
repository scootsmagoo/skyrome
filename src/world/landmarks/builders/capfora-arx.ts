/**
 * The Arx and the Asylum (the Capitoline's north summit and the saddle), and the hill's foot —
 * capfora crew: the Asylum grove, the Temple of Veiovis, the Temple of Juno Moneta with Juno's
 * sacred geese, the augurs' platform, the Insula of the Ara Coeli and the Tomb of Bibulus.
 */
import * as THREE from 'three';
import { capTemple } from './capfora/temple';
import { templeLayout } from '../../../arch/classical/temple';
import { column } from '../../../arch/classical/column';
import { podium } from '../../../arch/classical/podium';
import { T, TRS, mul } from '../../../arch/common/geom';
import { stairs, stepCount } from '../../../arch/common/stairs';
import { insula } from '../../../arch/fabric/insula';
import { Forest } from '../../../arch/vegetation/Forest';
import { vegetation } from '../../../arch/vegetation/system';
import type { TreeSpecies } from '../../../arch/vegetation/species';
import type { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../gfx/materialIds';
import type { LandmarkBuilder, LandmarkContext } from '../types';
import { makeLandmark, type Detail } from './capfora/build';
import { roofPrism, templeFar } from './capfora/far';
import { S, frameOf, spotAt, type CapSpot } from './capfora/frame';
import { altar, box, figure, footing, groundMin, inscription, post, span } from './capfora/ornament';
import { PAINT, friezeRelief, paint } from './capfora/paint';

// ------------------------------------------------------------------ trees (groves)

/**
 * Plant trees with the vegetation system (instanced, world space, its own LOD) and return trunk
 * colliders in local space. No-op without a running game (unit tests).
 */
function grove(ctx: LandmarkContext, b: MeshBuilder, trees: { sp: TreeSpecies; x: number; z: number; s?: number }[]) {
  const game = ctx.game as unknown as { addSystem?: unknown; scene?: THREE.Scene };
  for (const t of trees) {
    const r = t.sp === 'plane' ? 0.5 : t.sp === 'cypress' ? 0.22 : 0.22;
    const y = ctx.groundAt(t.x, t.z);
    b.collider({ kind: 'cylinder', center: new THREE.Vector3(t.x, y + 1.5, t.z), halfHeight: 1.5, radius: r * (t.s ?? 1) });
  }
  if (typeof game?.addSystem !== 'function' || !game.scene) return;
  const fr = frameOf(ctx.game, ctx.lm);
  const f = new Forest({ near: 140, far: 1600, seed: ctx.lm.id.length });
  const v = new THREE.Vector3();
  for (const t of trees) {
    v.set(t.x, ctx.groundAt(t.x, t.z) - 0.05, t.z).applyMatrix4(fr.matrix);
    f.add(t.sp, v.x, v.y, v.z, { scale: t.s });
  }
  f.group.name = `landmark:${ctx.lm.id}:grove`;
  game.scene.add(f.build());
  vegetation(ctx.game).addForest(f);
}

// ------------------------------------------------------------------ the Asylum

function buildAsylum(ctx: LandmarkContext, b: MeshBuilder, detail: Detail, spots: CapSpot[]) {
  const g = ctx.groundAt;
  const I = new THREE.Matrix4();
  // "Inter duos lucos": an open sacred area between two groves. A paved walk crosses it from the
  // Clivus (front) to the Arx stairs (back); an old altar stands in the middle, boundary stones at
  // the corners.
  const hw = (70 * S) / 2;
  const hd = (60 * S) / 2;
  const walkW = 3.2;
  for (let z = -hd; z < hd; z += 3) {
    const y = g(0, z + 1.5);
    span(b, 'paving_travertine', -walkW / 2, Math.min(y, g(0, z), g(0, z + 3)) - 0.3, z, walkW / 2, y + 0.06, z + 3, I, true);
  }
  // A round clearing of beaten earth and the altar of the god of the asylum.
  const ay = g(0, 0);
  span(b, 'dirt', -5, ay - 0.2, -5, 5, ay + 0.03, 5, I);
  altar(b, 1.6, 1.0, 1.05, T(0, ay + 0.03, 1.6), { detail, material: 'tufa', fire: false });
  spots.push(spotAt('altar', 'shrine', 0, ay, -0.6, 0, 1.6, { label: 'Altar of the Asylum (Veiovis, god of the refuge)' }));
  spots.push(spotAt('suppliant', 'npc', 2.2, ay, 1.2, 0, 1.6, { label: 'A runaway claiming the old right of asylum' }));
  for (const [x, z] of [
    [-hw + 1, -hd + 1],
    [hw - 1, -hd + 1],
    [hw - 1, hd - 1],
    [-hw + 1, hd - 1],
  ]) {
    const y = g(x, z);
    box(b, 'tufa', x, y + 0.45, z, 0.45, 1.1, 0.35, I, true);
  }
  // Benches under the trees.
  for (const sx of [-1, 1]) {
    const x = sx * 6.5;
    const y = g(x, -6);
    span(b, 'tufa', x - 1.2, y, -6.3, x + 1.2, y + 0.45, -5.8, I, true);
    if (sx < 0) spots.push(spotAt('bench', 'sit', x, y, -6.6, x, -12, { label: 'Bench in the grove' }));
  }
  // The two groves: laurel, holm-oak-like laurels, a few planes and cypresses at the edges.
  const rng = ctx.rng;
  const trees: { sp: TreeSpecies; x: number; z: number; s?: number }[] = [];
  for (const sx of [-1, 1]) {
    for (let i = 0; i < (detail === 'high' ? 11 : 7); i++) {
      const x = sx * rng.range(6.5, hw - 2);
      const z = rng.range(-hd + 2, hd - 2);
      const sp: TreeSpecies = i % 5 === 0 ? 'plane' : i % 4 === 1 ? 'cypress' : 'laurel';
      trees.push({ sp, x, z, s: rng.range(0.85, 1.15) });
    }
  }
  grove(ctx, b, trees);
  spots.push(spotAt('asylum', 'vista', 0, g(0, -hd + 2), -hd + 2, 0, hd, { label: 'The Asylum, between the two groves' }));
}

// ------------------------------------------------------------------ the Temple of Veiovis

function buildVeiovis(ctx: LandmarkContext, b: MeshBuilder, detail: Detail, spots: CapSpot[]) {
  const g = ctx.groundAt;
  const I = new THREE.Matrix4();
  // A transverse cella (wider than deep) on a podium, with a tetrastyle porch in front.
  const hw = (30 * S) / 2;
  const P = 2.4 * S;
  const cz0 = -1.0;
  const cz1 = (18 * S) / 2;
  const pw = 9.0; // porch width
  const pz0 = -(18 * S) / 2 + 0.2;
  const yb = Math.min(-0.3, groundMin(g, -hw, pz0 - 3, hw, cz1) - 0.3);
  // Podium: the cella block and the porch.
  podium(b, { outline: [[-hw, cz0 - 0.4], [hw, cz0 - 0.4], [hw, cz1], [-hw, cz1]], height: P, material: 'travertine', detail }, I);
  podium(b, { outline: [[-pw / 2, pz0 + 2.7], [pw / 2, pz0 + 2.7], [pw / 2, cz0 - 0.3], [-pw / 2, cz0 - 0.3]], height: P, material: 'travertine', detail }, I);
  span(b, 'travertine', -hw, yb, cz0 - 0.4, hw, 0.02, cz1, I, false);
  const { count, rise } = stepCount(P, 0.21);
  stairs(b, { width: pw - 1.6, rise, run: 0.34, count, material: 'travertine' }, T(0, 0, pz0 + 2.7 - count * 0.34));
  // Porch: four Corinthian columns of stuccoed tufa.
  const H = 5.4;
  const D = H / 10;
  for (let i = 0; i < 4; i++) column(b, { order: 'corinthian', D, height: H, material: 'plaster_white', trimMaterial: 'travertine', detail: 'low', fluted: true }, T(-pw / 2 + 0.8 + ((pw - 1.6) * i) / 3, P, pz0 + 3.3));
  // Cella walls (enterable through the bronze door), roof ridges crossing.
  const t = 0.6;
  const wh = H + 0.9;
  span(b, 'plaster_white', -hw + 0.3, P, cz0, -1.4, P + wh, cz0 + t, I, true);
  span(b, 'plaster_white', 1.4, P, cz0, hw - 0.3, P + wh, cz0 + t, I, true);
  span(b, 'plaster_white', -1.4, P + 3.6, cz0, 1.4, P + wh, cz0 + t, I);
  span(b, 'plaster_white', -hw + 0.3, P, cz1 - t, hw - 0.3, P + wh, cz1, I, true);
  for (const sx of [-1, 1]) span(b, 'plaster_white', sx > 0 ? hw - 0.3 - t : -hw + 0.3, P, cz0, sx > 0 ? hw - 0.3 : -hw + 0.3 + t, P + wh, cz1, I, true);
  span(b, 'mosaic', -hw + 0.3 + t, P, cz0 + t, hw - 0.3 - t, P + 0.03, cz1 - t, I);
  span(b, 'wood_dark', -hw + 0.3, P + wh, cz0, hw - 0.3, P + wh + 0.2, cz1, I);
  // Porch roof (ridge along z) and the cella's transverse roof (ridge along x).
  span(b, 'travertine', -pw / 2, P + H, pz0 + 2.8, pw / 2, P + H + 0.9, cz0 + 0.2, I);
  roofPrism(b, 'roof_tile', -pw / 2 - 0.3, pw / 2 + 0.3, pz0 + 2.6, cz0 + 0.5, P + H + 0.9, 1.3, I);
  {
    const shape = new THREE.Shape([new THREE.Vector2(-pw / 2 - 0.3, 0), new THREE.Vector2(pw / 2 + 0.3, 0), new THREE.Vector2(0, 1.3)]);
    const gg = new THREE.ShapeGeometry(shape);
    gg.rotateY(Math.PI);
    gg.translate(0, P + H + 0.9, pz0 + 2.58);
    b.add(gg, paint(PAINT.redOchre, 0.85), I);
  }
  const rg = new THREE.BoxGeometry(2 * hw, 0.2, 0.1);
  void rg;
  roofPrism(b, 'roof_tile', cz0 - 0.4, cz1 + 0.3, -hw - 0.3, hw + 0.3, P + wh + 0.2, 1.6, mul(I, new THREE.Matrix4().makeRotationY(-Math.PI / 2)));
  // Cult statue: young Veiovis with his arrows, the she-goat beside him.
  figure(b, 'nude', TRS(0, P, cz1 - 1.6, 0, 0, 0), { scale: 1.6, material: 'marble', detail });
  box(b, 'marble', 0.0, P + 0.15, cz1 - 1.6, 1.2, 0.3, 0.9, I, true);
  const goat = new THREE.SphereGeometry(0.32, 8, 6);
  goat.scale(1.5, 0.9, 0.8);
  goat.translate(1.1, P + 0.6, cz1 - 1.5);
  b.add(goat, 'marble', I);
  box(b, 'bronze', -0.5, P + 1.9, cz1 - 1.9, 0.04, 0.8, 0.04, I);
  spots.push(spotAt('cult-statue', 'shrine', 0, P, cz1 - 4.2, 0, cz1 - 1.6, { label: 'Veiovis, the young anti-Jupiter, with his arrows and the she-goat' }));
  spots.push(spotAt('porch', 'door', 0, P, cz0 - 1.0, 0, cz0 + 2, { label: 'Temple of Veiovis' }));
  void g;
}

// ------------------------------------------------------------------ Juno Moneta and the geese

const MONETA_SPEC = {
  order: 'tuscan' as const,
  plan: 'prostyle' as const,
  front: 4,
  sides: 5,
  width: 17 * S,
  intercolumniation: 'araeostyle' as const,
  podiumHeight: 2.6 * S,
  material: 'plaster_white' as MaterialId,
  podiumMaterial: 'tufa' as MaterialId,
  cellaMaterial: 'plaster_white' as MaterialId,
  pitchDeg: 18,
};

function buildMoneta(ctx: LandmarkContext, b: MeshBuilder, detail: Detail, spots: CapSpot[]) {
  const g = ctx.groundAt;
  const L = templeLayout({ ...MONETA_SPEC, detail });
  const dz = -(L.stairs.z0 + L.stylobate.z1) / 2;
  const at = T(0, 0.05, dz);
  footing(b, 'tufa', g, L.stylobate.x0, L.stairs.z0 + dz, L.stylobate.x1, L.stylobate.z1 + dz, 0.05, undefined, false);
  const res = capTemple(b, { ...MONETA_SPEC, detail, roofMaterial: 'roof_tile', antefix: 'terracotta', tympanum: paint(PAINT.redOchre, 0.85), interior: false, fluted: false }, at);
  const sf = res.stairFoot.z + dz;
  altar(b, 1.8, 1.1, 1.0, T(0, 0.05, sf - 2.6), { detail, material: 'tufa' });
  spots.push(spotAt('altar', 'shrine', 0, 0.05, sf - 4.0, 0, sf, { label: 'Altar of Juno Moneta, the Warner' }));
  // Juno's sacred geese, kept at public expense since they woke the garrison in 390 BC.
  const px = L.stylobate.x1 + 4.5;
  const pz = dz + 2;
  const pw = 6.5;
  const pd = 7;
  const gy = g(px, pz);
  span(b, 'dirt', px - pw / 2, gy - 0.2, pz - pd / 2, px + pw / 2, gy + 0.03, pz + pd / 2, undefined);
  // Wattle fence of posts and rails, a hut and a trough.
  for (const [x0, z0, x1, z1] of [
    [px - pw / 2, pz - pd / 2, px + pw / 2, pz - pd / 2],
    [px + pw / 2, pz - pd / 2, px + pw / 2, pz + pd / 2],
    [px + pw / 2, pz + pd / 2, px - pw / 2, pz + pd / 2],
    [px - pw / 2, pz + pd / 2, px - pw / 2, pz - pd / 2],
  ]) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(2, Math.round(len / 1.2));
    for (let i = 0; i <= n; i++) post(b, 'wood_dark', x0 + ((x1 - x0) * i) / n, gy, z0 + ((z1 - z0) * i) / n, 0.9, 0.05, undefined, 5);
    const m = new THREE.Matrix4().makeRotationY(Math.atan2(-(z1 - z0), x1 - x0)).setPosition((x0 + x1) / 2, gy + 0.55, (z0 + z1) / 2);
    b.box('wood', len, 0.5, 0.05, m, { collide: true });
  }
  span(b, 'wood', px + pw / 2 - 2.2, gy, pz + pd / 2 - 1.8, px + pw / 2 - 0.2, gy + 1.5, pz + pd / 2 - 0.2, undefined, true);
  roofPrism(b, 'roof_tile', px + pw / 2 - 2.4, px + pw / 2, pz + pd / 2 - 2.0, pz + pd / 2, gy + 1.5, 0.5);
  span(b, 'tufa', px - pw / 2 + 0.4, gy, pz - 0.6, px - pw / 2 + 0.9, gy + 0.35, pz + 1.4, undefined, true);
  span(b, 'water', px - pw / 2 + 0.45, gy + 0.3, pz - 0.55, px - pw / 2 + 0.85, gy + 0.32, pz + 1.35, undefined);
  const rng = ctx.rng;
  for (let i = 0; i < (detail === 'high' ? 11 : 6); i++) goose(b, TRS(px + rng.range(-pw / 2 + 0.6, pw / 2 - 0.6), gy + 0.03, pz + rng.range(-pd / 2 + 0.6, pd / 2 - 2.2), 0, rng.range(0, 6.28), 0), detail);
  spots.push(spotAt('geese', 'npc', px - pw / 2 - 1.0, gy, pz - pd / 2 - 0.6, px, pz, { label: 'Keeper of the sacred geese' }));
  spots.push(spotAt('goose-pen', 'shrine', px, gy, pz - pd / 2 - 1.2, px, pz, { label: "Juno's sacred geese (they saved the Capitol from the Gauls)" }));
  // The old mint beside the temple: minting moved to the Caelian under Domitian; a strongroom remains.
  const mx = L.stylobate.x0 - 5.5;
  footing(b, 'tufa', g, mx - 3.5, dz - 3, mx + 3.5, dz + 5, 0.05, undefined, true);
  span(b, 'brick', mx - 3.5, 0.05, dz - 3, mx + 3.5, 4.6, dz + 5, undefined, true);
  roofPrism(b, 'roof_tile', mx - 3.8, mx + 3.8, dz - 3.3, dz + 5.3, 4.6, 1.1);
  box(b, 'bronze', mx, 1.25, dz - 3.04, 1.4, 2.4, 0.08, undefined);
  const text = inscription(b, ['MONETA'], 2.2, 0.5, T(mx, 3.4, dz - 3.06), 'carved');
  spots.push(spotAt('old-mint', 'inscription', mx, 0.05, dz - 5, mx, dz - 3, { label: 'The old mint of Moneta', text, gloss: "Rome's coins were struck here beside Juno the Warner until Domitian moved the mint near the amphitheatre; 'money' and 'mint' both come from her name." }));
}

/** A white goose (≈ 50 triangles), facing −z, feet at y = 0. */
function goose(b: MeshBuilder, at: THREE.Matrix4, detail: Detail) {
  const seg = detail === 'high' ? 7 : 5;
  const body = new THREE.SphereGeometry(0.22, seg, 4);
  body.scale(0.85, 0.75, 1.35);
  body.translate(0, 0.32, 0.05);
  b.add(body, 'fabric_white', at);
  const neck = new THREE.CylinderGeometry(0.035, 0.05, 0.32, 5);
  neck.rotateX(0.35);
  neck.translate(0, 0.55, -0.22);
  b.add(neck, 'fabric_white', at);
  const head = new THREE.SphereGeometry(0.06, 5, 4);
  head.translate(0, 0.71, -0.29);
  b.add(head, 'fabric_white', at);
  const beak = new THREE.ConeGeometry(0.025, 0.1, 4);
  beak.rotateX(-Math.PI / 2);
  beak.translate(0, 0.7, -0.38);
  b.add(beak, paint('#E08A2A', 0.6), at);
  for (const sx of [-1, 1]) post(b, paint('#E08A2A', 0.6), sx * 0.07, 0, 0.05, 0.16, 0.015, at, 4);
}

function monetaFar(b: MeshBuilder) {
  const L = templeLayout(MONETA_SPEC);
  templeFar(b, L, T(0, 0.05, -(L.stairs.z0 + L.stylobate.z1) / 2), { podium: 'tufa', mat: 'plaster_white' });
}

// ------------------------------------------------------------------ the Auguraculum

function buildAuguraculum(ctx: LandmarkContext, b: MeshBuilder, detail: Detail, spots: CapSpot[]) {
  const g = ctx.groundAt;
  const h = (10 * S) / 2;
  // A square of turf raised a step, kerbed with tufa; the augur's hut (tabernaculum) and his stone
  // seat, facing east as the rite requires; a lituus-shaped finial on the hut.
  footing(b, 'tufa', g, -h, -h, h, h, 0.38, undefined, true);
  span(b, 'grass', -h + 0.25, 0.36, -h + 0.25, h - 0.25, 0.4, h - 0.25, undefined);
  const { count, rise } = stepCount(0.4, 0.2);
  stairs(b, { width: 1.6, rise, run: 0.34, count, material: 'tufa' }, T(0, 0, -h - count * 0.34));
  // Hut: timber posts, wattle walls, thatch-coloured tile roof.
  const hx = h - 1.6;
  const hz = h - 1.6;
  span(b, 'wood', hx - 1.1, 0.4, hz - 1.1, hx + 1.1, 2.4, hz + 1.1, undefined, true);
  span(b, 'black', hx - 0.45, 0.4, hz - 1.12, hx + 0.45, 2.0, hz - 1.1, undefined);
  roofPrism(b, 'dry_grass', hx - 1.4, hx + 1.4, hz - 1.4, hz + 1.4, 2.4, 0.9);
  // The augur's seat facing east (local frame: the platform faces south; east is −x here).
  span(b, 'tufa', -0.4, 0.4, -0.4, 0.4, 0.85, 0.4, undefined, true);
  span(b, 'tufa', 0.25, 0.85, -0.4, 0.4, 1.4, 0.4, undefined);
  spots.push(spotAt('augur-seat', 'sit', 0, 0.85, 0, -10, 0, { label: "The augur's seat" }));
  spots.push(spotAt('augur', 'npc', -1.2, 0.4, 1.2, -10, 0, { label: 'An augur watching the birds, lituus in hand' }));
  spots.push(spotAt('view-campus', 'vista', 0, 0.4, h - 0.6, 0, h + 40, { label: 'The view north over the Campus Martius', gloss: 'From the auguraculum the augurs mark out the sky and watch for the flight of birds.' }));
  void detail;
}

// ------------------------------------------------------------------ the Insula of the Ara Coeli

function buildInsula(ctx: LandmarkContext, b: MeshBuilder, detail: Detail, spots: CapSpot[]) {
  const g = ctx.groundAt;
  const W = 39 * S;
  const D = 32 * S;
  // Floor at the highest point of the street front, so the shops step down along the slope; the
  // back and the uphill side are built against the hill (party walls without windows).
  let floor = -Infinity;
  for (let x = -W / 2; x <= W / 2; x += 1) floor = Math.max(floor, g(x, -D / 2 + 0.5));
  floor = Math.max(0, floor);
  const out = insula({
    width: W,
    depth: D,
    storeys: 5,
    seed: 113,
    wealth: 0.35,
    finish: 'brick',
    balcony: 'partial',
    courtyard: true,
    roof: 'hip',
    groundAt: (x, z) => g(x, z) - floor,
    sides: { left: false, right: true, back: false },
    detail: detail === 'high' ? 'full' : 'low',
  });
  b.append(out.builder, T(0, floor, 0));
  for (const s of out.spots) {
    const p = s.position.clone().add(new THREE.Vector3(0, floor, 0));
    spots.push({ id: `insula-${s.id}`, kind: s.kind === 'shopDoor' ? 'vendor' : s.kind === 'houseDoor' ? 'door' : s.kind, position: p, heading: s.facing, label: s.tag });
  }
  spots.push(spotAt('street', 'spawn', 0, floor, -D / 2 - 2.5, 0, 0, { label: 'Insula at the foot of the Capitol' }));
}

// ------------------------------------------------------------------ the Tomb of Bibulus

function buildBibulus(ctx: LandmarkContext, b: MeshBuilder, detail: Detail, spots: CapSpot[]) {
  const g = ctx.groundAt;
  const I = new THREE.Matrix4();
  const w = 6 * S * 1.15;
  const d = 5 * S;
  const H = 9 * S;
  // Travertine facade on the street: a plain base carrying the inscription, an upper storey framed
  // by four Tuscan pilasters with a door-like aedicula in the middle, a frieze of garlands and
  // bucrania, a cornice. Behind: the burial chamber (closed).
  const yb = Math.min(-0.3, groundMin(g, -w / 2, -d / 2, w / 2, d / 2) - 0.3);
  const baseH = H * 0.42;
  span(b, 'travertine', -w / 2, yb, -d / 2, w / 2, baseH, d / 2, I, true);
  span(b, 'travertine', -w / 2 - 0.08, baseH - 0.15, -d / 2 - 0.08, w / 2 + 0.08, baseH, d / 2 + 0.08, I);
  span(b, 'travertine', -w / 2 + 0.05, baseH, -d / 2 + 0.05, w / 2 - 0.05, H - 0.7, d / 2 - 0.05, I, true);
  for (let i = 0; i < 4; i++) {
    const x = -w / 2 + 0.3 + ((w - 0.6) * i) / 3;
    // Tuscan pilasters: shaft strip, base and capital blocks proud of the wall.
    span(b, 'travertine', x - 0.17, baseH, -d / 2 - 0.08, x + 0.17, H - 0.75, -d / 2 + 0.06, I);
    span(b, 'travertine', x - 0.22, baseH, -d / 2 - 0.12, x + 0.22, baseH + 0.16, -d / 2 + 0.06, I);
    span(b, 'travertine', x - 0.24, H - 0.92, -d / 2 - 0.14, x + 0.24, H - 0.75, -d / 2 + 0.06, I);
  }
  // The aedicula (false door) in the middle bay.
  span(b, 'travertine', -0.6, baseH + 0.3, -d / 2 - 0.08, 0.6, baseH + 2.2, -d / 2 + 0.05, I);
  span(b, 'bronze', -0.42, baseH + 0.42, -d / 2 - 0.1, 0.42, baseH + 2.0, -d / 2 - 0.07, I);
  span(b, 'gilded_bronze', -0.03, baseH + 0.42, -d / 2 - 0.12, 0.03, baseH + 2.0, -d / 2 - 0.09, I);
  span(b, 'travertine', -0.8, baseH + 2.2, -d / 2 - 0.18, 0.8, baseH + 2.42, -d / 2 + 0.05, I);
  // Frieze and cornice.
  const fz = -d / 2 - 0.02;
  if (detail === 'high') {
    const fr = friezeRelief('garland');
    const geo = new THREE.PlaneGeometry(w, 0.45);
    geo.rotateY(Math.PI);
    geo.translate(0, H - 0.45, fz);
    b.add(geo, fr, I, { uv: 'keep', castShadow: false });
  }
  span(b, 'travertine', -w / 2 - 0.18, H - 0.2, -d / 2 - 0.2, w / 2 + 0.18, H, d / 2 + 0.05, I);
  span(b, 'travertine', -w / 2 - 0.05, H - 0.7, -d / 2 - 0.04, w / 2 + 0.05, H - 0.65, d / 2, I);
  // The inscription (CIL VI 1319).
  const lines = ['C POPLICIO L F BIBVLO AED PL HONORIS', 'VIRTVTISQVE CAVSSA SENATVS', 'CONSVLTO POPVLIQVE IVSSV LOCVS', 'MONVMENTO QVO IPSE POSTEREIQVE', 'EIVS INFERRENTVR PVBLICE DATVS EST'];
  const text = inscription(b, lines, w - 0.5, baseH * 0.62, T(0, baseH * 0.5, -d / 2 - 0.01), 'carved', { depth: 0.04 });
  spots.push(
    spotAt('inscription', 'inscription', 0, 0, -d / 2 - 2.2, 0, -d / 2, {
      label: 'The Tomb of Bibulus',
      text,
      gloss: 'To Gaius Poplicius Bibulus, son of Lucius, plebeian aedile, for his honour and virtue: by decree of the Senate and order of the People, a place for a monument, in which he and his descendants may be buried, was granted at public expense. (CIL VI 1319.)',
    }),
  );
  spots.push(spotAt('via-lata', 'vista', 2.5, 0, -d / 2 - 4, 6, -40, { label: 'Start of the Via Flaminia' }));
}

// ------------------------------------------------------------------ registration

export const builders: LandmarkBuilder[] = [
  { handles: ['asylum'], build: (ctx) => makeLandmark(ctx, (b, d, spots) => buildAsylum(ctx, b, d, spots), { cull: 600 }) },
  { handles: ['temple-veiovis'], build: (ctx) => makeLandmark(ctx, (b, d, spots) => buildVeiovis(ctx, b, d, spots), { far: ctx.detail === 'high', cull: 300 }) },
  { handles: ['temple-juno-moneta'], build: (ctx) => makeLandmark(ctx, (b, d, spots) => buildMoneta(ctx, b, d, spots), { far: ctx.detail === 'high' && monetaFar, cull: 300 }) },
  { handles: ['auguraculum'], build: (ctx) => makeLandmark(ctx, (b, d, spots) => buildAuguraculum(ctx, b, d, spots), { cull: 300 }) },
  { handles: ['insula-aracoeli'], build: (ctx) => makeLandmark(ctx, (b, d, spots) => buildInsula(ctx, b, d, spots), { far: ctx.detail === 'high', cull: 300 }) },
  { handles: ['tomb-bibulus'], build: (ctx) => makeLandmark(ctx, (b, d, spots) => buildBibulus(ctx, b, d, spots), { cull: 300 }) },
];
