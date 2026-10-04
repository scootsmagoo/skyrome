/**
 * The Arx and the Asylum (the Capitoline's north summit and the saddle), and the hill's foot —
 * capfora crew: the Asylum grove, the Temple of Veiovis, the Temple of Juno Moneta with Juno's
 * sacred geese, the augurs' platform, the Insula of the Ara Coeli and the Tomb of Bibulus.
 */
import * as THREE from 'three';
import { capTemple, smallTemple } from './capfora/temple';
import { templeLayout } from '../../../arch/classical/temple';
import { column } from '../../../arch/classical/column';
import { podium } from '../../../arch/classical/podium';
import { T, TRS, gridSurface, mul } from '../../../arch/common/geom';
import { stairs, stepCount } from '../../../arch/common/stairs';
import { insula } from '../../../arch/fabric/insula';
import { Draw } from '../../../arch/fabric/draw';
import { placeProp } from '../../../arch/props/props';
import type { TreeSpecies } from '../../../arch/vegetation/species';
import type { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../gfx/materialIds';
import type { LandmarkBuilder, LandmarkContext } from '../types';
import { makeLandmark, type Detail } from './capfora/build';
import { roofPrism, templeFar } from './capfora/far';
import { S, relMatrix, spotAt, type CapSpot } from './capfora/frame';
import { lampstand, plantTrees, torch, type TreeReq } from './capfora/life';
import { altar, box, figure, footing, groundMin, inscription, post, span, stairsToGround, terrace } from './capfora/ornament';
import { PAINT, friezeRelief, paint } from './capfora/paint';

// ------------------------------------------------------------------ ground cover

/**
 * A skin of `mat` draped over the terrain (lifted 4 cm) across a local rectangle: the landmark pads
 * are drawn as paving by the terrain, which is wrong for a grove or a garden.
 */
function groundSkin(b: MeshBuilder, g: (x: number, z: number) => number, mat: MaterialId, x0: number, z0: number, x1: number, z1: number, step = 2, lift = 0.04) {
  const nx = Math.max(1, Math.round((x1 - x0) / step));
  const nz = Math.max(1, Math.round((z1 - z0) / step));
  const xs = Array.from({ length: nx + 1 }, (_, i) => x0 + ((x1 - x0) * i) / nx);
  const zs = Array.from({ length: nz + 1 }, (_, j) => z0 + ((z1 - z0) * j) / nz);
  const geo = gridSurface(zs, xs, (z, x, out) => out.set(x, g(x, z) + lift, z));
  b.add(geo, mat, undefined, { castShadow: false });
}

// ------------------------------------------------------------------ the Asylum

function buildAsylum(ctx: LandmarkContext, b: MeshBuilder, detail: Detail, spots: CapSpot[]) {
  const g = ctx.groundAt;
  const I = new THREE.Matrix4();
  // "Inter duos lucos": the open sacred space between two groves on the saddle. A paved walk crosses
  // it from the Clivus side (front, towards the Tabularium) to the stairs up to the Arx (back); the
  // old altar of the god of the refuge stands in a clearing in the middle; each grove is fenced by a
  // low tufa wall with an opening onto the walk.
  const hw = (70 * S) / 2;
  const hd = (60 * S) / 2;
  const walkW = 3.2;
  groundSkin(b, g, 'grass', -hw, -hd, hw, hd, detail === 'high' ? 2 : 4);
  for (let z = -hd; z < hd; z += 3) {
    const y = g(0, z + 1.5);
    span(b, 'paving_travertine', -walkW / 2, Math.min(y, g(0, z), g(0, z + 3)) - 0.3, z, walkW / 2, y + 0.08, z + 3, I, true);
  }
  // Cross walk to the Capitolium (left, −x) and the Arx (right).
  for (let x = -hw; x < hw; x += 3) {
    if (Math.abs(x + 1.5) < walkW) continue;
    const y = g(x + 1.5, 0);
    span(b, 'gravel', x, y - 0.25, -1.2, x + 3, y + 0.07, 1.2, I);
  }
  // A round clearing of beaten earth and the altar of the god of the asylum.
  const ay = g(0, 0);
  {
    const disc = new THREE.CylinderGeometry(5.5, 5.5, 0.1, detail === 'high' ? 24 : 12);
    disc.translate(0, ay + 0.06, 0);
    b.add(disc, 'dirt', I, { castShadow: false });
  }
  altar(b, 1.6, 1.0, 1.05, T(0, ay + 0.1, 1.6), { detail, material: 'tufa', fire: false });
  spots.push(spotAt('altar', 'shrine', 0, ay, -0.6, 0, 1.6, { label: 'Altar of the Asylum (Veiovis, god of the refuge)' }));
  spots.push(spotAt('suppliant', 'npc', 2.2, ay, 1.2, 0, 1.6, { label: 'A runaway slave claiming the old right of asylum' }));
  spots.push(spotAt('priest', 'npc', -2.4, ay, 2.4, 0, 1.6, { label: 'Aedituus of Veiovis, sweeping the clearing' }));
  // An inscribed boundary stone at the walk: the sacred ground of the refuge.
  {
    const x = walkW / 2 + 0.9;
    const z = -hd + 2.5;
    const y = g(x, z);
    box(b, 'tufa', x, y + 0.55, z, 0.55, 1.1, 0.4, I, true);
    const text = inscription(b, ['INTER DVOS', 'LVCOS', 'ASYLVM'], 0.5, 0.5, T(x, y + 0.7, z - 0.21), 'carved', { depth: 0.02 });
    spots.push(
      spotAt('cippus', 'inscription', x, y, z - 1.6, x, z, {
        label: 'Boundary stone of the Asylum',
        text,
        gloss: 'Between the two groves: the Asylum. Romulus, they say, opened this place as a refuge for any fugitive, slave or free, to people his new city (Livy 1.8). The right of refuge is still claimed here, if rarely honoured.',
      }),
    );
  }
  // The Temple of Veiovis stands at the front of the Arx-side half (−x), its porch facing into the
  // Asylum: that grove starts behind a paved forecourt before the temple, which a path joins to
  // the walk.
  const vt = veiovisInAsylum(ctx);
  {
    const zf0 = vt.front;
    const zf1 = vt.front + 3.6;
    for (let x = vt.x0 + 1.5; x < -walkW / 2; x += 3) {
      const xe = Math.min(x + 3, -walkW / 2);
      const y = Math.max(g(x, zf0), g(xe, zf1), g(x, zf1), g(xe, zf0));
      span(b, 'paving_travertine', x, Math.min(g(x, zf0), g(xe, zf1)) - 0.3, zf0, xe, y + 0.06, zf1, I, true);
    }
  }
  // The two groves, each fenced by a low wall with a gap onto the walk: holm-oak-like laurels, olives,
  // a plane at the heart of each, cypresses along the fence.
  const rng = ctx.rng;
  const trees: TreeReq[] = [];
  for (const sx of [-1, 1]) {
    const x0 = sx < 0 ? -hw + 1.2 : walkW / 2 + 3.6;
    const x1 = sx < 0 ? -walkW / 2 - 3.6 : hw - 1.2;
    const z0 = sx < 0 ? Math.max(-hd + 1.5, vt.front + 4.6) : -hd + 1.5;
    const z1 = hd - 1.5;
    // Fence: low tufa wall on the three outer sides, the walk side open in the middle.
    const fy = (x: number, z: number) => g(x, z);
    const seg = (ax: number, az: number, cx: number, cz: number) => {
      const n = Math.max(1, Math.round(Math.hypot(cx - ax, cz - az) / 3));
      for (let k = 0; k < n; k++) {
        const pa = [ax + ((cx - ax) * k) / n, az + ((cz - az) * k) / n];
        const pc = [ax + ((cx - ax) * (k + 1)) / n, az + ((cz - az) * (k + 1)) / n];
        const y = Math.min(fy(pa[0], pa[1]), fy(pc[0], pc[1]));
        span(b, 'tufa', Math.min(pa[0], pc[0]) - 0.2, y - 0.3, Math.min(pa[1], pc[1]) - 0.2, Math.max(pa[0], pc[0]) + 0.2, y + 0.75, Math.max(pa[1], pc[1]) + 0.2, I, true);
      }
    };
    const xo = sx < 0 ? x0 : x1; // outer side
    const xi = sx < 0 ? x1 : x0; // walk side
    seg(xo, z0, xo, z1);
    seg(Math.min(xo, xi), z0, Math.max(xo, xi), z0);
    seg(Math.min(xo, xi), z1, Math.max(xo, xi), z1);
    if (z0 < -3.5) seg(xi, z0, xi, -2.5);
    seg(xi, Math.max(2.5, z0), xi, z1);
    const n = detail === 'high' ? 16 : 9;
    for (let i = 0; i < n; i++) {
      const x = rng.range(Math.min(x0, x1) + 1.5, Math.max(x0, x1) - 1.5);
      const z = rng.range(z0 + 1.5, z1 - 1.5);
      const sp: TreeSpecies = i === 0 ? 'plane' : i % 3 === 0 ? 'olive' : 'laurel';
      trees.push({ sp, x: i === 0 ? (x0 + x1) / 2 : x, z: i === 0 ? 0 : z, s: i === 0 ? 1.15 : rng.range(0.85, 1.2) });
    }
    for (let z = z0 + 2; z < z1 - 1; z += 4.5) trees.push({ sp: 'cypress', x: xo + (sx < 0 ? 1.0 : -1.0), z, s: rng.range(0.85, 1.1) });
  }
  plantTrees(ctx, b, trees);
  // Benches at the edge of the clearing.
  for (const sx of [-1, 1]) {
    const x = sx * 4.6;
    const y = g(x, -4.6);
    span(b, 'tufa', x - 1.2, y, -4.9, x + 1.2, y + 0.45, -4.4, I, true);
    spots.push(spotAt(`bench${sx < 0 ? 'W' : 'E'}`, 'sit', x, y, -5.2, x, -12, { label: 'Bench in the Asylum' }));
  }
  // Herms of old gods along the walk.
  for (const z of [-hd + 6, hd - 6]) for (const sx of [-1, 1]) placeProp(new Draw(b), 'herm', sx * (walkW / 2 + 0.5), g(sx * 2, z), z, sx < 0 ? Math.PI / 2 : -Math.PI / 2);
  spots.push(spotAt('asylum', 'vista', 0, g(0, -hd + 2), -hd + 2, 0, hd, { label: 'The Asylum, between the two groves' }));
  spots.push(spotAt('walk', 'spawn', 0, g(0, -hd + 3.5), -hd + 3.5, 0, 0, { label: 'The Asylum' }));
}

// ------------------------------------------------------------------ the Temple of Veiovis

/**
 * The Temple of Veiovis's footprint in the Asylum's frame: it stands behind the Tabularium, its
 * porch facing into the Asylum (the two frames are half a turn apart). `front` is the porch's
 * edge (+z in the Asylum frame), `x0`/`x1` its flanks.
 */
function veiovisInAsylum(ctx: Pick<LandmarkContext, 'game' | 'lm'>): { x0: number; x1: number; front: number; back: number } {
  const m = relMatrix(ctx, 'temple-veiovis');
  const hw = (30 * S) / 2;
  const hd = (18 * S) / 2;
  const a = new THREE.Vector3(-hw, 0, -hd).applyMatrix4(m);
  const c = new THREE.Vector3(hw, 0, hd).applyMatrix4(m);
  return { x0: Math.min(a.x, c.x), x1: Math.max(a.x, c.x), front: Math.max(a.z, c.z), back: Math.min(a.z, c.z) };
}

function buildVeiovis(ctx: LandmarkContext, b: MeshBuilder, detail: Detail, spots: CapSpot[]) {
  const g = ctx.groundAt;
  const I = new THREE.Matrix4();
  // A transverse cella (wider than deep) on a podium, with a tetrastyle porch in front, its steps
  // between the podium's wings. Sullan stuccoed tufa: white columns and walls over a red dado,
  // travertine trim.
  const hw = (30 * S) / 2;
  const hd = (18 * S) / 2;
  const P = 2.4 * S;
  const cz0 = 1.0; // cella front wall
  const cz1 = hd;
  const pw = 9.0; // porch width
  const pf = -2.6; // porch front (top of the steps)
  const t = 0.6;
  const yb = Math.min(-0.3, groundMin(g, -hw, -hd, hw, cz1) - 0.3);
  // Podium: the cella block and the porch.
  podium(b, { outline: [[-hw, cz0 - 0.4], [hw, cz0 - 0.4], [hw, cz1], [-hw, cz1]], height: P, material: 'travertine', detail }, I);
  podium(b, { outline: [[-pw / 2, pf], [pw / 2, pf], [pw / 2, cz0 - 0.3], [-pw / 2, cz0 - 0.3]], height: P, material: 'travertine', detail }, I);
  span(b, 'travertine', -hw, yb, cz0 - 0.4, hw, 0.02, cz1, I, false);
  span(b, 'travertine', -pw / 2, yb, pf, pw / 2, 0.02, cz0, I, false);
  const { count, rise } = stepCount(P, 0.21);
  stairs(b, { width: pw - 1.6, rise, run: 0.34, count, material: 'travertine' }, T(0, 0, pf - count * 0.34));
  for (const sx of [-1, 1]) span(b, 'travertine', sx * (pw / 2 - 0.8), 0, pf - count * 0.34, sx * pw / 2, P, pf, I, true);
  // Porch: four Corinthian columns, 2.6 m clear of the cella wall.
  const H = 5.4;
  const D = H / 10;
  const zc = pf + 0.6;
  for (let i = 0; i < 4; i++) column(b, { order: 'corinthian', D, height: H, material: 'plaster_white', trimMaterial: 'travertine', detail: 'low', fluted: true }, T(-pw / 2 + 0.8 + ((pw - 1.6) * i) / 3, P, zc));
  // Cella walls (enterable through the bronze door) with a red dado and travertine pilasters.
  const wh = H + 0.9;
  span(b, 'plaster_white', -hw + 0.3, P, cz0, -1.4, P + wh, cz0 + t, I, true);
  span(b, 'plaster_white', 1.4, P, cz0, hw - 0.3, P + wh, cz0 + t, I, true);
  span(b, 'plaster_white', -1.4, P + 3.6, cz0, 1.4, P + wh, cz0 + t, I);
  span(b, 'plaster_white', -hw + 0.3, P, cz1 - t, hw - 0.3, P + wh, cz1, I, true);
  for (const sx of [-1, 1]) span(b, 'plaster_white', sx > 0 ? hw - 0.3 - t : -hw + 0.3, P, cz0, sx > 0 ? hw - 0.3 : -hw + 0.3 + t, P + wh, cz1, I, true);
  for (const sx of [-1, 1]) span(b, 'plaster_red', sx < 0 ? -hw + 0.28 : 1.42, P, cz0 - 0.02, sx < 0 ? -1.42 : hw - 0.28, P + 1.0, cz0 + 0.02, I);
  span(b, 'bronze', -1.2, P, cz0 + t * 0.5 - 0.04, -0.15, P + 3.4, cz0 + t * 0.5 + 0.04, I);
  for (const x of [-hw + 0.3, -pw / 2 - 0.6, pw / 2 + 0.6, hw - 0.3]) span(b, 'travertine', x - 0.35, P, cz0 - 0.08, x + 0.35, P + wh, cz0 + 0.02, I);
  span(b, 'mosaic', -hw + 0.3 + t, P, cz0 + t, hw - 0.3 - t, P + 0.03, cz1 - t, I);
  span(b, 'wood_dark', -hw + 0.3, P + wh, cz0, hw - 0.3, P + wh + 0.2, cz1, I);
  // Entablature: architrave and a painted frieze along the cella front and over the porch.
  span(b, 'travertine', -hw + 0.2, P + wh - 0.7, cz0 - 0.12, hw - 0.2, P + wh + 0.25, cz0 + 0.02, I);
  span(b, paint(PAINT.redOchre, 0.85), -hw + 0.25, P + wh - 0.42, cz0 - 0.135, hw - 0.25, P + wh - 0.05, cz0 - 0.125, I);
  span(b, 'travertine', -pw / 2, P + H, pf + 0.1, pw / 2, P + H + 0.9, cz0 + 0.2, I);
  span(b, paint(PAINT.blue, 0.85), -pw / 2 + 0.05, P + H + 0.35, pf + 0.085, pw / 2 - 0.05, P + H + 0.75, pf + 0.095, I);
  // Porch roof (ridge along z, pediment in front) and the cella's transverse roof (ridge along x).
  roofPrism(b, 'roof_tile', -pw / 2 - 0.3, pw / 2 + 0.3, pf - 0.1, cz0 + 0.5, P + H + 0.9, 1.3, I);
  {
    const shape = new THREE.Shape([new THREE.Vector2(-pw / 2 - 0.3, 0), new THREE.Vector2(pw / 2 + 0.3, 0), new THREE.Vector2(0, 1.3)]);
    const gg = new THREE.ShapeGeometry(shape);
    gg.rotateY(Math.PI);
    gg.translate(0, P + H + 0.9, pf - 0.12);
    b.add(gg, paint(PAINT.redOchre, 0.85), I);
    // Terracotta acroteria at the apex and the corners of the pediment.
    for (const [x, y] of [[0, 1.3], [-pw / 2 - 0.2, 0.05], [pw / 2 + 0.2, 0.05]] as const) box(b, 'terracotta', x, P + H + 0.9 + y + 0.25, pf - 0.05, 0.35, 0.5, 0.2, I);
  }
  roofPrism(b, 'roof_tile', cz0 - 0.4, cz1 + 0.3, -hw - 0.3, hw + 0.3, P + wh + 0.2, 1.6, mul(I, new THREE.Matrix4().makeRotationY(-Math.PI / 2)));
  // Cult statue: young Veiovis with his arrows, the she-goat beside him.
  const zs = cz1 - t - 0.8;
  figure(b, 'nude', TRS(0, P + 0.3, zs, 0, 0, 0), { scale: 1.6, material: 'marble', detail });
  box(b, 'marble', 0.0, P + 0.15, zs, 1.2, 0.3, 0.9, I, true);
  const goat = new THREE.SphereGeometry(0.32, 8, 6);
  goat.scale(1.5, 0.9, 0.8);
  goat.translate(1.1, P + 0.6, zs + 0.1);
  b.add(goat, 'marble', I);
  box(b, 'bronze', -0.5, P + 2.2, zs - 0.3, 0.04, 0.8, 0.04, I);
  // The dedication of the Sullan rebuild on the architrave (the text is a reconstruction).
  const text = inscription(b, ['VEDIOVI · PATRI · SACRVM'], pw - 1.6, 0.4, T(0, P + H + 0.55, pf + 0.06), 'carved', { depth: 0.02 });
  spots.push(spotAt('cult-statue', 'shrine', 0, P, cz0 + t + 0.7, 0, zs, { label: 'Veiovis, the young anti-Jupiter, with his arrows and the she-goat' }));
  spots.push(spotAt('porch', 'door', 0, P, cz0 - 1.0, 0, cz0 + 2, { label: 'Temple of Veiovis' }));
  spots.push(
    spotAt('dedication', 'inscription', 0, g(0, pf - count * 0.34 - 2.4), pf - count * 0.34 - 2.4, 0, pf, {
      label: 'Temple of Veiovis',
      text,
      gloss: 'Sacred to Father Vediovis. The young god of the Asylum holds arrows, a she-goat at his side: some call him the Jupiter of the underworld, and offer him a goat in the rite of the dead. (Reconstructed text.)',
    }),
  );
  // On the forecourt the Asylum lays before the steps.
  spots.push(spotAt('forecourt', 'spawn', 1.2, g(1.2, pf - count * 0.34 - 2.0), pf - count * 0.34 - 2.0, 0, 0, { label: 'Before the Temple of Veiovis' }));
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
  arxPrecinct(ctx, b, detail, spots);
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

/**
 * The citadel round Juno Moneta: a paved terrace at the temple's level held up by the old tufa
 * walls of the Arx (buttressed over the slopes), with a parapet, a stair at the front down towards
 * the Asylum and a gate stair on the east side where the Gradus Monetae arrive. Inside: the small
 * Temple of Concordia vowed on the Arx in 218 BC, a lampstand at the temple door, cypresses.
 * Local frame of Juno Moneta (facade −z = S, +x = W towards the cliff).
 */
export const ARX = { x0: -18, x1: 13, z0: -17, z1: 18, gate: [-11.5, -6.5] as [number, number], stairHalf: 3.2 };

function arxPrecinct(ctx: LandmarkContext, b: MeshBuilder, detail: Detail, spots: CapSpot[]) {
  const g = ctx.groundAt;
  const I = new THREE.Matrix4();
  const A = ARX;
  const y = 0.02;
  terrace(
    b,
    [
      [A.x0, A.z0],
      [-A.stairHalf, A.z0],
      [A.stairHalf, A.z0],
      [A.x1, A.z0],
      [A.x1, A.z1],
      [A.x0, A.z1],
      [A.x0, A.gate[1]],
      [A.x0, A.gate[0]],
    ],
    y,
    g,
    { material: 'tufa', paving: 'paving_travertine', thickness: 0.9, skipEdges: [1, 6], parapet: 1.0, parapetEdges: [0, 2, 3, 4, 5, 7], buttress: { edges: [2, 3, 4], every: 5.5 } },
  );
  // Front stair towards the Asylum.
  {
    stairsToGround(b, g, y, 2 * A.stairHalf, T(0, 0, A.z0));
  }
  // Gate stair (east) for the Gradus Monetae coming up from the Forum side.
  {
    const zc = (A.gate[0] + A.gate[1]) / 2;
    stairsToGround(b, g, y, A.gate[1] - A.gate[0], TRS(A.x0, 0, zc, 0, Math.PI / 2, 0));
    // Gate piers with torches.
    for (const z of [A.gate[0] - 0.5, A.gate[1] + 0.5]) {
      span(b, 'tufa', A.x0 - 0.9, y, z - 0.5, A.x0 + 0.1, y + 3.0, z + 0.5, I, true);
      span(b, 'travertine', A.x0 - 1.0, y + 3.0, z - 0.6, A.x0 + 0.2, y + 3.25, z + 0.6, I);
      torch(ctx, b, A.x0 - 0.9, y + 1.9, z, Math.PI / 2);
    }
    spots.push(spotAt('gradus-monetae', 'spawn', A.x0 + 2, y, zc, 0, zc, { label: 'Top of the Steps of Moneta (Gradus Monetae)' }));
  }
  // The Temple of Concordia on the Arx (vowed 218 BC by L. Manlius, dedicated 216 BC).
  smallTemple(b, { w: 4.4, d: 6.2, P: 1.0, H: 3.9, n: 4, order: 'tuscan', mat: 'plaster_white', podium: 'tufa', roof: 'roof_tile', tympanum: paint(PAINT.yellowOchre, 0.85), detail }, TRS(-12.2, y, -10.5, 0, 0, 0));
  spots.push(spotAt('concordia', 'shrine', -12.2, y, -15.2, -12.2, -10.5, { label: 'Temple of Concord on the Arx (216 BC)' }));
  // Cypresses at the corners and a laurel by the temple.
  plantTrees(ctx, b, [
    { sp: 'cypress', x: A.x0 + 1.6, z: A.z1 - 1.6, y },
    { sp: 'cypress', x: A.x1 - 1.6, z: A.z1 - 1.6, y },
    { sp: 'cypress', x: A.x1 - 1.6, z: A.z0 + 1.8, y },
    { sp: 'laurel', x: -6.8, z: A.z1 - 3.5, y, s: 0.9 },
    { sp: 'cypress', x: A.x0 + 1.6, z: A.z0 + 1.8, y },
  ]);
  for (const sx of [-1, 1]) lampstand(ctx, b, sx * 2.6, y, A.z0 + 1.2);
  spots.push(spotAt('arx-wall', 'vista', A.x1 - 1.4, y, 2, A.x1 + 40, 2, { label: 'The wall of the Arx: the Campus Martius and the bend of the Tiber below' }));
  spots.push(spotAt('arx-guard', 'npc', A.x0 + 1.5, y, A.gate[1] + 1.8, A.x0 - 5, A.gate[1] + 1.8, { label: 'Public slave guarding the Arx gate' }));
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
  spots.push(spotAt('approach', 'spawn', 1.2, g(1.2, -h - 3), -h - 3, 0, 0, { label: 'The augurs\' platform' }));
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
  spots.push(spotAt('street', 'spawn', 0, g(0, -D / 2 - 2.5), -D / 2 - 2.5, 0, 0, { label: 'Insula at the foot of the Capitol' }));
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
  spots.push(spotAt('street', 'spawn', -1.5, g(-1.5, -d / 2 - 5), -d / 2 - 5, 0, -d / 2, { label: 'The Tomb of Bibulus' }));
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
