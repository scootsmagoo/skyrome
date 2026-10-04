/**
 * The Caelian above the Colosseum valley.
 *
 * - temple-divus-claudius: the vast terrace (Claudianum) with its travertine-arcaded west
 *   substructure, brick buttressed north wall, the tiered nymphaeum on the east face (Nero's
 *   cascade, now fed by the Arcus Neroniani), garden rows inside porticoes and the hexastyle
 *   prostyle Corinthian temple facing WSW towards the Palatine. A backdrop from the arena.
 *   The terrace is carried out over the pad's blend slope on an apron so the retaining walls
 *   show their real height.
 * - arch-dolabella: the plain travertine arch of AD 10 (CIL VI 1384), now carrying Nero's
 *   aqueduct channel on its back.
 * - castra-peregrina: walled camp of the frumentarii and soldiers on detached duty: barrack
 *   blocks, a principia round a court with its shrine.
 * - macellum-magnum: Nero's provisions market — a two-storey domed tholos in a court of shops.
 * - statio-vigiles-v: the station of the Fifth Cohort of the watch (Regions I–II).
 */
import * as THREE from 'three';
import { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../gfx/materialIds';
import { Draw, roof } from '../../../arch/fabric';
import { hedge } from '../../../arch/vegetation';
import { temple } from '../../../arch/classical/temple';
import { archway, plainArch } from '../../../arch/classical/arch';
import { column } from '../../../arch/classical/column';
import { dome } from '../../../arch/classical/vaults';
import { inscriptionPanel } from '../../../arch/common/inscription';
import { placeProp } from '../../../arch/props';
import { Rng } from '../../../core/Rng';
import type { LandmarkBuild, LandmarkBuilder, LandmarkContext, Spot } from '../types';
import { addReadables, flight, lodInstances, plantTrees, risers, span, type TreeSpot } from './colos-kit';
import { courtyardBuilding, palus } from './colos-court';
import { waterSheetMaterial } from './colos-fountains';

const T = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);

/** Lowest terrain (relative) along a segment, sampled. */
function minGround(ctx: LandmarkContext, x0: number, z0: number, x1: number, z1: number, n = 6): number {
  let m = Infinity;
  for (let i = 0; i <= n; i++) m = Math.min(m, ctx.groundAt(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n));
  return m;
}

// ---------------------------------------------------------------- Temple of Divus Claudius

function buildClaudianum(ctx: LandmarkContext): LandmarkBuild {
  const b = new MeshBuilder();
  const d = new Draw(b);
  const root = new THREE.Group();
  const spots: Spot[] = [];
  const high = ctx.detail === 'high';
  const W = (200 * ctx.S) / 2; // 60 (x half)
  const Dd = (180 * ctx.S) / 2; // 54 (z half)
  const apron = 9; // carried out over the pad's blend slope
  const X0 = -W - apron;
  const X1 = W + apron;
  const Z0 = -Dd - apron;
  const Z1 = Dd + apron;
  // Terrace deck (paved apron + garden) and its colliders.
  d.span('paving_travertine', X0, -0.6, Z0, X1, 0.05, Z1);
  b.collider({ kind: 'box', center: new THREE.Vector3(0, -0.3, 0), half: new THREE.Vector3((X1 - X0) / 2, 0.35, (Z1 - Z0) / 2) });
  // ---- retaining walls
  const wallTop = 1.15;
  // West (front, −z): two storeys of rusticated travertine arcades (Claudian rustication).
  {
    const n = Math.round((X1 - X0) / 4.6);
    const bw = (X1 - X0) / n;
    for (let i = 0; i < n; i++) {
      const xa = X0 + i * bw;
      const xb = xa + bw;
      const gy = minGround(ctx, xa, Z0 - 0.5, xb, Z0 - 0.5, 3) - 0.6;
      const h = -gy;
      // Pier, arch head and the blocks with deep joints (rustication) as offset slabs; the bays
      // behind the grand stair stop at deck level (the stair lands there).
      const atStair = xa < 5.2 && xb > -5.2;
      span(b, 'travertine', T(0, 0, 0), xa, gy, Z0 - 0.2, xb, atStair ? 0.05 : wallTop, Z0 + 1.6, true);
      if (atStair) continue;
      if (h > 2.6) {
        const aw = bw * 0.56;
        const ah = Math.min(h - 0.8, 7);
        const cx = (xa + xb) / 2;
        d.span('black', cx - aw / 2, gy + 0.4, Z0 - 0.21, cx + aw / 2, gy + 0.4 + ah - aw / 2, Z0 - 0.15);
        d.cyl('black', cx, gy + 0.4 + ah - aw / 2, Z0 - 0.18, aw / 2, 0.06, 10, { rx: Math.PI / 2 });
        if (high) {
          for (let k = 0; k < Math.floor(h / 0.9); k++) {
            const yk = gy + k * 0.9;
            d.span('travertine', xa + 0.05, yk + 0.06, Z0 - 0.32, cx - aw / 2 - 0.05, yk + 0.84, Z0 - 0.2);
            d.span('travertine', cx + aw / 2 + 0.05, yk + 0.06, Z0 - 0.32, xb - 0.05, yk + 0.84, Z0 - 0.2);
          }
        }
      }
    }
    for (const [xa, xb] of [[X0 - 0.2, -5.2], [5.2, X1 + 0.2]] as const) d.span('travertine', xa, wallTop - 0.1, Z0 - 0.4, xb, wallTop + 0.1, Z0 + 1.6);
  }
  // North (+x) and south (−x): brick with buttresses; east (+z): the nymphaeum.
  for (const sx of [-1, 1]) {
    const x = sx > 0 ? X1 : X0;
    const n = Math.round((Z1 - Z0) / 6);
    for (let i = 0; i < n; i++) {
      const za = Z0 + ((Z1 - Z0) * i) / n;
      const zb = Z0 + ((Z1 - Z0) * (i + 1)) / n;
      const gy = minGround(ctx, x + sx * 0.5, za, x + sx * 0.5, zb, 3) - 0.6;
      span(b, 'brick', T(0, 0, 0), Math.min(x, x - sx * 1.4), gy, za, Math.max(x, x - sx * 1.4), wallTop, zb, true);
      if (gy < -2) span(b, 'brick', T(0, 0, 0), Math.min(x, x + sx * 1.6), gy, za - 0.9, Math.max(x, x + sx * 1.6), -0.6, za + 0.9, true);
    }
  }
  {
    // Nymphaeum: three tiers of alternating apsidal and rectangular niches with water sheets.
    const n = Math.round((X1 - X0) / 5.2);
    const bw = (X1 - X0) / n;
    const sheet = waterSheetMaterial();
    for (let i = 0; i < n; i++) {
      const xa = X0 + i * bw;
      const xb = xa + bw;
      const gy = minGround(ctx, xa, Z1 + 0.5, xb, Z1 + 0.5, 3) - 0.6;
      span(b, 'brick', T(0, 0, 0), xa, gy, Z1 - 1.6, xb, wallTop, Z1 + 0.2, true);
      const cx = (xa + xb) / 2;
      const h = -gy;
      const tiers = Math.max(1, Math.min(3, Math.floor(h / 2.4)));
      for (let k = 0; k < tiers; k++) {
        const y0 = gy + 0.9 + k * 2.4;
        const ww = i % 2 ? 1.6 : 2.2;
        d.span(i % 2 ? 'marble' : 'plaster_cream', cx - ww / 2 - 0.25, y0 - 0.15, Z1 + 0.2, cx + ww / 2 + 0.25, y0 + 1.9, Z1 + 0.32);
        d.span('black', cx - ww / 2, y0, Z1 + 0.3, cx + ww / 2, y0 + 1.6, Z1 + 0.34);
        if (high) {
          // A sheet of water falling from the niche lip.
          const g = new THREE.PlaneGeometry(ww * 0.8, 2.3);
          g.translate(cx, y0 - 0.2, Z1 + 0.42);
          b.add(g, sheet, undefined, { castShadow: false, uv: 'box' });
        }
      }
      // Basin at the foot.
      d.span('marble', xa, gy + 0.6, Z1 + 0.2, xb, gy + 1.05, Z1 + 2.4, { collide: true });
      d.span('water', xa + 0.2, gy + 0.95, Z1 + 0.4, xb - 0.2, gy + 0.97, Z1 + 2.2);
    }
    d.span('travertine', X0 - 0.2, wallTop - 0.1, Z1 - 1.6, X1 + 0.2, wallTop + 0.1, Z1 + 0.4);
  }
  // Parapet colliders round the deck.
  d.solid(X0, 0, Z0 - 0.4, -5.2, wallTop + 0.1, Z0 + 0.2);
  d.solid(5.2, 0, Z0 - 0.4, X1, wallTop + 0.1, Z0 + 0.2);
  d.solid(X0, 0, Z1 - 0.2, X1, wallTop + 0.1, Z1 + 0.4);
  // Grand stair up the middle of the west front from the lower ground.
  {
    const drop = -minGround(ctx, -4, Z0 - 12, 4, Z0 - 12, 3);
    if (drop > 0.4) {
      const { count, rise } = risers(drop, 0.2);
      const run = 0.32;
      const sw = 10;
      // Climbs towards +z, foot outside the wall.
      const m = T(0, -drop, Z0 - count * run - 0.2);
      for (let i = 0; i < count; i++) span(b, 'travertine', m, -sw / 2, -1.2, i * run, sw / 2, (i + 1) * rise, (i + 1) * run, true, false);
      for (const sx of [-1, 1]) span(b, 'travertine', m, sx * (sw / 2), -1.2, 0, sx * (sw / 2 + 0.8), drop + 1.1, count * run + 0.3, true);
      // Gap in the parapet.
      d.span('paving_travertine', -sw / 2, -0.05, Z0 - 0.45, sw / 2, 0.06, Z0 + 1.6);
      spots.push({ id: 'claudium-stairs', kind: 'spawn', position: new THREE.Vector3(0, -drop + 0.05, Z0 - count * run - 2), heading: 0 });
    }
  }
  // ---- porticoes round the garden (instanced columns) and the garden rows
  const pIn = 4;
  const pts = [
    new THREE.Vector3(-W + pIn, 0, -Dd + pIn),
    new THREE.Vector3(W - pIn, 0, -Dd + pIn),
    new THREE.Vector3(W - pIn, 0, Dd - pIn),
    new THREE.Vector3(-W + pIn, 0, Dd - pIn),
    new THREE.Vector3(-W + pIn, 0, -Dd + pIn + 0.01),
  ];
  {
    const mats: THREE.Matrix4[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const c = pts[i + 1];
      const n = Math.max(1, Math.round(a.distanceTo(c) / 4.4));
      for (let k = 0; k < n; k++) {
        const p = a.clone().lerp(c, k / n);
        if (Math.abs(p.x) < 7 && p.z < 0) continue; // gap for the temple's axis
        mats.push(T(p.x, 0.05, p.z));
        b.collider({ kind: 'cylinder', center: new THREE.Vector3(p.x, 3, p.z), halfHeight: 3, radius: 0.35 });
      }
      const len = a.distanceTo(c);
      const yaw = Math.atan2(c.x - a.x, c.z - a.z);
      const fr = new THREE.Matrix4().makeRotationY(yaw).setPosition(a.x, 0, a.z);
      span(b, 'travertine', fr, -0.35, 5.6, -0.3, 0.35, 6.2, len + 0.3);
      const rm = fr.clone().multiply(T(2.2, 6.5, len / 2)).multiply(new THREE.Matrix4().makeRotationZ(0.18));
      b.box('roof_tile', 4.8, 0.14, len + 0.6, rm);
      span(b, 'wood_dark', fr, 0, 6.1, -0.2, 4.4, 6.2, len + 0.2, false, false);
    }
    const cn = new MeshBuilder();
    column(cn, { order: 'ionic', D: 0.6, height: 5.6, material: 'marble', detail: 'low', kind: 'free', collide: false });
    const cm = new MeshBuilder();
    cm.add(new THREE.CylinderGeometry(0.27, 0.3, 5.2, 6), 'marble', T(0, 2.6, 0));
    cm.add(new THREE.BoxGeometry(0.75, 0.4, 0.75), 'marble', T(0, 5.4, 0));
    lodInstances(ctx.game, root, { name: 'claudium-portico', matrices: mats, levels: [{ builder: cn, maxDist: 60 }, { builder: cm, maxDist: 900 }], cullBeyond: true });
    // Back wall of the porticoes (garden enclosure), low, plastered.
    for (const [x0, z0, x1, z1] of [[-W, -Dd, W, -Dd + 0.5], [-W, Dd - 0.5, W, Dd], [-W, -Dd, -W + 0.5, Dd], [W - 0.5, -Dd, W, Dd]] as const) {
      if (z0 === -Dd && z1 === -Dd + 0.5) {
        d.span('plaster_cream', x0, 0, z0, -7, 6.6, z1, { collide: true });
        d.span('plaster_cream', 7, 0, z0, x1, 6.6, z1, { collide: true });
        d.span('plaster_cream', -7, 5.0, z0, 7, 6.6, z1);
      } else d.span('plaster_cream', x0, 0, z0, x1, 6.6, z1, { collide: true });
    }
  }
  // Garden: rows of clipped shrubs (as on the Marble Plan) between gravel walks, and trees.
  d.span('grass', -W + pIn + 1, 0.0, -Dd + pIn + 1, W - pIn - 1, 0.07, Dd - pIn - 1);
  const trees: TreeSpot[] = [];
  if (high) {
    for (let x = -W + pIn + 4; x <= W - pIn - 4; x += 5) {
      for (const [za, zb] of [[-Dd + pIn + 3, -24], [24, Dd - pIn - 3]] as const) hedge(d, x - 0.6, za, x + 0.6, zb, 1.1, Math.round(x));
    }
    for (let z = -20; z <= 20; z += 8) for (const x of [-W + 9, -W + 16, W - 16, W - 9]) trees.push({ species: 'laurel', x, y: 0.05, z, scale: 0.9 });
    for (const c of plantTrees(ctx.game, root, trees, 21)) b.collider(c);
  }
  // ---- the temple (hexastyle prostyle Corinthian, facing −z) on the terrace's axis
  temple(b, { order: 'corinthian', plan: 'prostyle', front: 6, width: 40 * ctx.S, columnHeight: 11, podiumHeight: 2.6, detail: 'low', pedimentRelief: false, material: 'marble', roofMaterial: 'roof_tile' }, T(0, 0.05, 2));
  d.span('gravel', -6, 0.0, -Dd, 6, 0.08, -24);
  // Altar in front.
  d.span('marble', -2.4, 0.05, -31, 2.4, 1.2, -28.8, { collide: true });
  d.span('marble', -2.6, 1.2, -31.2, 2.6, 1.45, -28.6);
  spots.push({ id: 'claudium-altar', kind: 'shrine', position: new THREE.Vector3(0, 0.1, -33), heading: 0 });
  spots.push({ id: 'claudium-priest', kind: 'npc', position: new THREE.Vector3(3.5, 0.1, -30), heading: -Math.PI / 2 });
  spots.push({ id: 'claudium-vista', kind: 'vista', position: new THREE.Vector3(-W + 6, 0.1, -Dd - 4), heading: Math.PI });
  spots.push({ id: 'claudium-nymphaeum', kind: 'vista', position: new THREE.Vector3(0, 0.1, Dd + 6), heading: 0 });
  root.add(b.build('temple-divus-claudius'));
  return { object: root, colliders: b.colliders, spots, cullDistance: 1800 };
}

// ---------------------------------------------------------------- Arch of Dolabella and Silanus

function buildDolabella(ctx: LandmarkContext): LandmarkBuild {
  const b = new MeshBuilder();
  const d = new Draw(b);
  const span0 = 2.4; // opening (≈ 4 m real)
  const res = plainArch(b, { span: span0, height: 4.2, pier: 1.2, depth: 3.0, material: 'travertine', detail: ctx.detail === 'high' ? 'high' : 'low', cornice: true });
  // Attic with the consuls' inscription (CIL VI 1384) on the face.
  const top = res.height;
  d.span('travertine', -res.width / 2, top, -1.5, res.width / 2, top + 1.0, 1.5);
  if (ctx.detail === 'high' && typeof document !== 'undefined') {
    inscriptionPanel(
      b,
      { lines: ['P Cornelius P F Dolabella', 'C Iunius C F Silanus Flamen Martial', 'Cos Ex S C', 'Faciundum Curaverunt Idemque Probaver'], width: res.width - 0.4, height: 0.85, style: 'carved', sizes: [1, 0.85, 0.85, 0.8] },
      T(0, top + 0.5, -1.52),
      { depth: 0.02 },
    );
  }
  // Nero's aqueduct channel on its back (brick specus with a cocciopesto-lined channel under a
  // slab cover), running across the arch, and the first brick arch of the Arcus Neroniani on each
  // side (the arcade itself continues along the Caelian as part of the city's aqueducts).
  const yS = top + 1.0;
  const spanA = 3.4;
  const pierA = 1.5;
  const inner = 0.75;
  const reach = res.width / 2 + inner + spanA + pierA;
  d.span('brick', -reach, yS, -1.1, reach, yS + 1.5, 1.1);
  d.span('concrete', -reach - 0.1, yS + 1.5, -1.2, reach + 0.1, yS + 1.75, 1.2);
  d.span('travertine', -reach - 0.12, yS - 0.12, -1.22, reach + 0.12, yS, 1.22);
  for (const sx of [-1, 1]) {
    // Ground under the side arch: the piers go down to the terrain.
    const cx = sx * (res.width / 2 + inner + spanA / 2);
    const g = Math.min(ctx.groundAt(cx, 0), ctx.groundAt(sx * reach, 0), 0);
    archway(b, { span: spanA, springing: yS - 0.6 - spanA / 2 - g, pier: inner, depth: 2.2, top: yS - g, material: 'brick', trim: 'brick', detail: ctx.detail === 'high' ? 'high' : 'low', leftPier: sx > 0, rightPier: sx < 0 }, T(cx, g, 0));
    // The next pier, where the arcade carries on along the Caelian.
    const xa = sx * (res.width / 2 + inner + spanA);
    const xb = sx * reach;
    d.span('brick', Math.min(xa, xb), g - 0.3, -1.1, Math.max(xa, xb), yS, 1.1, { collide: true });
  }
  const spots: Spot[] = [
    { id: 'dolabella-inscription', kind: 'inscription', position: new THREE.Vector3(0, 0.05, -5), heading: 0 },
    { id: 'dolabella-gate', kind: 'door', position: new THREE.Vector3(0, 0.05, 0), heading: 0 },
  ];
  const object = b.build('arch-dolabella');
  addReadables(ctx.game, object, [
    {
      id: 'dolabella-inscription',
      at: new THREE.Vector3(0, top + 0.5, -1.55),
      reach: 6,
      title: 'Arch of Dolabella',
      text: 'P · CORNELIVS · P · F · DOLABELLA / C · IVNIVS · C · F · SILANVS · FLAMEN · MARTIAL / COS / EX · S · C / FACIVNDVM · CVRAVERVNT · IDEMQVE · PROBAVER\n\n*Publius Cornelius Dolabella, son of Publius, and Gaius Junius Silanus, son of Gaius, priest of Mars, consuls, saw to its building by decree of the Senate and likewise approved it.*\n\nThe consuls of the year 10 rebuilt the old Caelian gate in travertine. Nero later laid his aqueduct across its back; water runs over the heads of the people walking through.',
    },
  ]);
  return { object, colliders: b.colliders, spots, cullDistance: 900 };
}

// ---------------------------------------------------------------- Castra Peregrina

function buildPeregrina(ctx: LandmarkContext): LandmarkBuild {
  const b = new MeshBuilder();
  const d = new Draw(b);
  const spots: Spot[] = [];
  const high = ctx.detail === 'high';
  const W = (150 * ctx.S) / 2; // 45
  const D = (120 * ctx.S) / 2; // 36
  const H = 5.5;
  // Enclosure wall (brick-faced, travertine coping), towers with tiled roofs at the corners, arched
  // gates front and back with the camp's name over the front one.
  for (const [x0, z0, x1, z1] of [[-W, -D, -3, -D + 1], [3, -D, W, -D + 1], [-W, D - 1, -3, D], [3, D - 1, W, D], [-W, -D, -W + 1, D], [W - 1, -D, W, D]] as const) {
    const gy = Math.min(minGround(ctx, x0, z0, x1, z0, 4), minGround(ctx, x0, z1, x1, z1, 4)) - 0.4;
    d.span('brick', x0, gy, z0, x1, H, z1, { collide: true });
    d.span('travertine', x0 - 0.1, H, z0 - 0.1, x1 + 0.1, H + 0.25, z1 + 0.1);
  }
  for (const sz of [-1, 1]) {
    const gy = Math.min(ctx.groundAt(0, sz * D), 0);
    archway(b, { span: 4.0, springing: 2.9 - gy, pier: 1.0, depth: 1.4, top: H + 0.9 - gy, material: 'brick', trim: 'travertine', detail: high ? 'high' : 'low' }, T(0, gy, sz * (D - 0.5)));
    d.span('travertine', -3.2, H + 0.9, sz * (D - 0.5) - 0.8, 3.2, H + 1.2, sz * (D - 0.5) + 0.8);
    spots.push({ id: `peregrina-gate-${sz < 0 ? 'front' : 'back'}`, kind: 'door', position: new THREE.Vector3(0, 0.05, sz * (D + 1.5)), heading: sz < 0 ? 0 : Math.PI });
  }
  if (high && typeof document !== 'undefined') {
    inscriptionPanel(b, { lines: ['Castra Peregrina'], width: 3.6, height: 0.5, style: 'carved' }, T(0, H + 0.35, -D - 0.22), { depth: 0.02 });
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const cx = sx * W;
      const cz = sz * D;
      const gy = Math.min(ctx.groundAt(cx, cz), 0) - 0.5;
      d.span('brick', cx - 2.5, gy, cz - 2.5, cx + 2.5, H + 2.6, cz + 2.5, { collide: true });
      d.span('travertine', cx - 2.6, H + 2.6, cz - 2.6, cx + 2.6, H + 2.8, cz + 2.6);
      roof(d.at(cx, 0, cz), { kind: 'hip', w: 5.6, d: 5.6, y: H + 2.8, ridges: high });
      if (high) {
        for (const [ox, oz, ry] of [[0, -2.51, 0], [0, 2.51, Math.PI], [-2.51, 0, Math.PI / 2], [2.51, 0, -Math.PI / 2]] as const) {
          d.at(cx + ox, 0, cz + oz, ry).span('black', -0.25, H + 1.2, -0.02, 0.25, H + 2.1, 0.02);
        }
      }
    }
  }
  d.span('gravel', -W + 1, -0.1, -D + 1, W - 1, 0.04, D - 1);
  // Barrack blocks (contubernia: a front room and a sleeping room each), tiled roofs.
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const z0 = -D + 5 + k * 10;
      const x0 = sx * 8;
      const x1 = sx * (W - 5);
      const xa = Math.min(x0, x1);
      const xb = Math.max(x0, x1);
      d.span('plaster_cream', xa, 0, z0, xb, 3.4, z0 + 6, { collide: true });
      d.span('plaster_red', xa - 0.01, 0.02, z0 - 0.01, xb + 0.01, 0.9, z0 + 6.01);
      roof(d.at((xa + xb) / 2, 0, z0 + 3), { kind: 'gable', w: xb - xa, d: 6, y: 3.4, axis: 'x', ridges: high });
      // Doors along the street side.
      for (let x = xa + 2; x < xb - 1; x += 4) d.span('wood_dark', x - 0.5, 0.0, z0 - 0.02, x + 0.5, 2.1, z0 + 0.03);
    }
  }
  // Principia: a courtyard building with a portico and the shrine of the standards.
  const pr = courtyardBuilding({
    prefix: 'peregrina-',
    w: 26,
    d: 22,
    range: 4,
    storeys: 1,
    storeyH: 4,
    wallMat: 'plaster_cream',
    courtWallMat: 'plaster_white',
    portico: { depth: 2.4, posts: 'columns', material: 'travertine', spacing: 3.0 },
    gates: [{ side: 'front', width: 2.8, height: 2.6, arch: true, spot: 'principia-gate' }],
    rooms: [
      { id: 'principia', spotId: 'peregrina-principia', side: 'back', at: 0, width: 6, kind: 'shrine', spotKind: 'shrine' },
      { id: 'tablets', spotId: 'peregrina-tablets', side: 'left', at: 0, width: 5, kind: 'office', spotKind: 'container' },
      { id: 'commander', spotId: 'peregrina-commander', side: 'right', at: 0, width: 5, kind: 'office' },
    ],
    floor: 'paving_travertine',
    detail: ctx.detail,
    seed: 'peregrina',
    windows: false,
  });
  b.append(pr.b, T(0, 0, D - 15));
  for (const s of pr.spots) {
    s.position.add(new THREE.Vector3(0, 0, D - 15));
    spots.push(s);
  }
  if (high) {
    palus(d, -16, 0, -6);
    palus(d, 16, 0, -6);
    placeProp(d, 'cart', 10, 0, -D + 3.5, 0.2, { rng: new Rng('per') });
  }
  return { object: b.build('castra-peregrina'), colliders: b.colliders, spots, cullDistance: 900 };
}

// ---------------------------------------------------------------- Macellum Magnum

function buildMacellum(ctx: LandmarkContext): LandmarkBuild {
  const high = ctx.detail === 'high';
  const W = 80 * ctx.S; // 48
  const res = courtyardBuilding({
    prefix: 'macellum-',
    w: W,
    d: W,
    range: 4.5,
    storeys: 2,
    wallMat: 'brick',
    courtWallMat: 'plaster_cream',
    portico: { depth: 3.0, posts: 'columns', material: 'travertine', spacing: 3.3, gallery: true },
    gates: [
      { side: 'front', width: 3.6, height: 3.0, arch: true, spot: 'gate' },
      { side: 'back', width: 3.0, height: 2.6, arch: true, spot: 'back-gate' },
    ],
    shops: [
      { side: 'front', from: -W / 2 + 2, to: -3.5 },
      { side: 'front', from: 3.5, to: W / 2 - 2 },
      { side: 'left', from: -W / 2 + 2, to: W / 2 - 2 },
      { side: 'right', from: -W / 2 + 2, to: W / 2 - 2 },
    ],
    floor: 'paving_travertine',
    detail: ctx.detail,
    seed: 'macellum',
    cellDoors: false,
  });
  const b = res.b;
  const d = new Draw(b);
  const spots = [...res.spots];
  // Court-side shop fronts: open counters all round under the portico.
  // The tholos: a two-storey domed rotunda with a fish basin (Nero's coin type).
  const R = 6.2;
  const n = 12;
  const h1 = 5.0;
  const h2 = 3.6;
  d.cyl('marble', 0, 0.25, 0, R + 1.2, 0.5, 32, { collide: true });
  for (let s = 0; s < 2; s++) {
    const y = s === 0 ? 0.5 : 0.5 + h1 + 0.8;
    const ch = s === 0 ? h1 : h2;
    const r = s === 0 ? R : R - 1.0;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      column(b, { order: s === 0 ? 'corinthian' : 'ionic', D: s === 0 ? 0.52 : 0.4, height: ch, material: 'marble', detail: 'low', kind: 'free', collide: s === 0 }, T(Math.sin(a) * r, y, Math.cos(a) * r));
    }
    d.cyl('marble', 0, y + ch + 0.4, 0, r + 0.5, 0.8, 32);
  }
  // Inner drum (cella) and the dome.
  d.cyl('plaster_cream', 0, 0.5 + (h1 + 0.8 + h2) / 2, 0, R - 2.2, h1 + 0.8 + h2, 24);
  dome(b, { radius: R - 0.2, coffers: false, steps: 2, material: 'plaster_white', outerMaterial: 'roof_tile', detail: 'low' }, T(0, 0.5 + h1 + 0.8 + h2 + 0.8, 0));
  d.cyl('gilded_bronze', 0, 0.5 + h1 + 0.8 + h2 + 0.8 + R - 0.2 + 0.4, 0, 0.35, 0.9, 10);
  // Fish basin round the tholos and market stalls in the court.
  d.cyl('travertine', 0, 0.35, 0, R + 1.6, 0.05, 32);
  if (high) {
    const rng = new Rng('macellum');
    const ring = 12.5;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.15;
      placeProp(d, 'stall', Math.sin(a) * ring, 0.05, Math.cos(a) * ring, a + Math.PI, { rng });
      spots.push({ id: `macellum-stall-${i + 1}`, kind: 'stall', position: new THREE.Vector3(Math.sin(a) * (ring + 1.2), 0.05, Math.cos(a) * (ring + 1.2)), heading: a + Math.PI });
    }
    for (const [x, z] of [[-15, -15], [15, 15], [-15, 15]] as const) placeProp(d, 'amphora_stack', x, 0.05, z, 0, { rng });
  }
  spots.push({ id: 'macellum-tholos', kind: 'vista', position: new THREE.Vector3(0, 0.55, R + 0.6), heading: Math.PI });
  spots.push({ id: 'macellum-aedile', kind: 'npc', position: new THREE.Vector3(2, 0.55, -R - 0.8), heading: Math.PI });
  return { object: b.build('macellum-magnum'), colliders: b.colliders, spots, cullDistance: 1000 };
}

// ---------------------------------------------------------------- Statio vigilum V

function buildVigiles(ctx: LandmarkContext): LandmarkBuild {
  const high = ctx.detail === 'high';
  const res = courtyardBuilding({
    prefix: 'vigiles-',
    w: 45 * ctx.S,
    d: 30 * ctx.S,
    range: 3.5,
    storeys: 2,
    wallMat: 'brick',
    courtWallMat: 'plaster_cream',
    portico: { depth: 1.8, posts: 'piers', material: 'brick', spacing: 3.0, gallery: true },
    gates: [{ side: 'front', width: 3.4, height: 2.8, arch: true, spot: 'gate' }],
    rooms: [
      { id: 'tribune', spotId: 'vigiles-tribune', side: 'back', at: 0, width: 5.5, kind: 'office' },
      { id: 'equipment', spotId: 'vigiles-equipment', side: 'left', at: 0, width: 4.5, kind: 'store', spotKind: 'container' },
      { id: 'shrine', spotId: 'vigiles-shrine', side: 'right', at: 0, width: 3.4, kind: 'shrine' },
    ],
    floor: 'paving_basalt',
    detail: ctx.detail,
    seed: 'vigiles',
  });
  const b = res.b;
  const d = new Draw(b);
  const spots = [...res.spots];
  // Fire-fighting kit in the court: buckets (baskets), a siphon pump on a cart, ladders, a cistern.
  d.span('travertine', -2.2, 0, -0.9, 2.2, 0.9, 0.9, { collide: true });
  d.span('water', -2.0, 0.75, -0.7, 2.0, 0.77, 0.7);
  if (high) {
    const rng = new Rng('vig');
    placeProp(d, 'cart', 5.0, 0.05, 1.2, Math.PI / 2, { rng });
    for (let i = 0; i < 6; i++) placeProp(d, 'basket', -4.5 + i * 0.5, 0.05, -res.court.d / 2 + 0.8, 0, { rng, collide: false });
    for (const x of [-6, 6]) {
      // Ladders leaning on the portico posts.
      const lm = new THREE.Matrix4().makeTranslation(x, 0, res.court.d / 2 - 0.6).multiply(new THREE.Matrix4().makeRotationX(-0.25));
      span(b, 'wood', lm, -0.3, 0, -0.03, -0.24, 4.2, 0.03, false, false);
      span(b, 'wood', lm, 0.24, 0, -0.03, 0.3, 4.2, 0.03, false, false);
      for (let k = 1; k < 13; k++) span(b, 'wood', lm, -0.27, k * 0.32, -0.02, 0.27, k * 0.32 + 0.04, 0.02, false, false);
    }
    void flight;
  }
  spots.push({ id: 'vigiles-sentry', kind: 'npc', position: new THREE.Vector3(2.6, 0.05, -(30 * ctx.S) / 2 - 1.2), heading: Math.PI });
  return { object: b.build('statio-vigiles-v'), colliders: b.colliders, spots, cullDistance: 700 };
}

export const builders: LandmarkBuilder[] = [
  { handles: ['temple-divus-claudius'], build: buildClaudianum },
  { handles: ['arch-dolabella'], build: buildDolabella },
  { handles: ['castra-peregrina'], build: buildPeregrina },
  { handles: ['macellum-magnum'], build: buildMacellum },
  { handles: ['statio-vigiles-v'], build: buildVigiles },
];

export type { MaterialId };
