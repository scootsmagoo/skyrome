/**
 * Circus Maximus group (palcirc crew): the circus itself, the obelisk of Augustus on its spina,
 * the pulvinar, the Arch of Titus in the curved end, the Temple of Sol in the Aventine stands and
 * the Temple of Ceres, Liber and Libera by the starting gates.
 */
import * as THREE from 'three';
import type { LandmarkBuilder, LandmarkContext } from '../types';
import { CIRCUS, circusSection, ringPoint, totalStations } from './palcirc/circusLayout';
import { buildFacade, buildGallery, buildStandsAll, buildTrack, circusGaps } from './palcirc/circus';
import { buildCarceres, buildSpina, buildTrackLines, circusFar } from './palcirc/circusParts';
import { relById } from './palcirc/frames';
import { Draw } from '../../../arch/fabric/draw';
import { column } from '../../../arch/classical/column';
import { entablature, pediment } from '../../../arch/classical/entablature';
import { obelisk } from '../../../arch/classical/monuments';
import { seatedDeity } from '../../../arch/classical/statues';
import { temple } from '../../../arch/classical/temple';
import { triumphalArch } from '../../../arch/classical/arch';
import { inscriptionPanel, paintedSign } from '../../../arch/common/inscription';
import { LANDMARK_BY_ID } from '../../../data/atlas';
import type { LandmarkData } from '../types';
import { Spots, drawFor, footingRect, frameFrom } from './palcirc/util';

function circus(ctx: LandmarkContext) {
  const { b } = drawFor(ctx);
  const spots = new Spots();
  const detail = ctx.detail;
  const sec = circusSection();
  const gaps = circusGaps();
  const group = new THREE.Group();
  buildStandsAll(b, sec, gaps, detail);
  const facade = buildFacade(b, gaps, detail);
  group.add(facade.group);
  buildGallery(group, b, sec, gaps, detail);
  buildTrack(b, ctx);
  const ob = relById('circus-maximus', 'obelisk-circus-maximus');
  buildSpina(b, ob.z, spots, detail);
  buildTrackLines(b, ob.z);
  buildCarceres(b, spots, detail);
  // Spots: shops (vendors), seats, vistas, tunnel mouths.
  const shopKinds: Record<string, number> = {};
  for (const u of facade.uses) {
    if (u.kind !== 'taberna' && u.kind !== 'popina') continue;
    const n = (shopKinds[u.kind] = (shopKinds[u.kind] ?? 0) + 1);
    if (n % 6 !== 1) continue;
    // Vendor stands behind the counter, facing the street (outward).
    const x = u.bay.x - u.bay.nx * (CIRCUS.wall + 1.4);
    const z = u.bay.z - u.bay.nz * (CIRCUS.wall + 1.4);
    spots.add(`circus-${u.kind}-${n}`, 'vendor', x, 0, z, Math.atan2(u.bay.nx, u.bay.nz));
  }
  for (const t of gaps.tunnels) {
    const p = ringPoint(t.s, CIRCUS.halfW - CIRCUS.track + 2);
    spots.add(`circus-gate-${t.side > 0 ? 'p' : 'a'}${Math.round(t.z)}`, 'door', p.x, 0, p.z, Math.atan2(-p.nx, -p.nz));
  }
  // Senators' terrace and the marble rows facing the pulvinar / finish line.
  const total = totalStations();
  for (const [i, f] of [0.12, 0.3, 0.75, 0.88].entries()) {
    const s = total * f;
    const p = ringPoint(s, (sec.terrace[0] + sec.terrace[1]) / 2);
    spots.add(`circus-seat-${i}`, 'sit', p.x, sec.podium, p.z, Math.atan2(-p.nx, -p.nz));
    const r = sec.rows[3];
    const q = ringPoint(s + 4, (r.u0 + r.u1) / 2);
    spots.add(`circus-seat-row-${i}`, 'sit', q.x, r.y, q.z, Math.atan2(-q.nx, -q.nz));
  }
  // Vista from the top gallery on the Aventine side: the Palatine palace across the track.
  const gv = ringPoint(total - 160, sec.gallery.u0 + 0.6);
  spots.add('circus-vista-gallery', 'vista', gv.x, sec.gallery.y, gv.z, Math.atan2(-gv.nx, -gv.nz));
  spots.add('circus-npc-charioteer', 'npc', 8, 0, -170, Math.PI);
  spots.add('circus-npc-bookie', 'npc', -CIRCUS.halfW - 3, 0, -40, Math.PI / 2);
  group.add(b.build(ctx.lm.id));
  return { object: group, colliders: b.colliders, spots: spots.list, far: circusFar(), cullDistance: 1600 };
}

// ---------------------------------------------------------------- obelisk

function obeliskBuild(ctx: LandmarkContext) {
  const { b, d } = drawFor(ctx);
  const spots = new Spots();
  // The spina (built by the circus) passes under the obelisk: stand on its coping.
  const top = CIRCUS.spina.height + 0.15;
  const H = 23.7 * ctx.S;
  const base = H / 9.5;
  const pedestal = 2.4;
  d.span('marble', -2.4, 0, -4.4, 2.4, top, 4.4, { collide: true });
  obelisk(b, { height: H, base, pedestal, pedestalMaterial: 'marble', detail: ctx.detail }, new THREE.Matrix4().makeTranslation(0, top, 0));
  // Augustus' dedication to the Sun on both faces toward the tracks.
  const pw = base * 1.9;
  const lines = ['Imp Caesar Divi F', 'Augustus', 'Pontifex Maximus', 'Imp XII Cos XI Trib Pot XIV', 'Aegypto In Potestatem', 'Populi Romani Redacta', 'Soli Donum Dedit'];
  for (const sx of [-1, 1]) {
    const m = new THREE.Matrix4().makeTranslation(sx * (pw / 2 + 0.01), top + 0.5 + pedestal * 0.5, 0).multiply(new THREE.Matrix4().makeRotationY(sx > 0 ? -Math.PI / 2 : Math.PI / 2));
    inscriptionPanel(b, { lines, width: pw * 0.86, height: pedestal * 0.82, style: 'carved', sizes: [1, 1, 0.85, 0.75, 0.75, 0.75, 0.85], border: true }, m, { depth: 0.04 });
  }
  spots.add('obelisk-dedication', 'inscription', -CIRCUS.spina.width / 2 - 2.2, 0, 0, Math.PI / 2);
  return { object: b.build(ctx.lm.id), colliders: b.colliders, spots: spots.list, cullDistance: 2500 };
}

// ---------------------------------------------------------------- pulvinar

/** Draw frame in the circus's local coordinates for a landmark nested in it. */
function circusFrame(ctx: LandmarkContext) {
  return frameFrom(ctx, LANDMARK_BY_ID['circus-maximus'] as LandmarkData);
}

function pulvinarBuild(ctx: LandmarkContext) {
  const { b } = drawFor(ctx);
  const spots = new Spots();
  const F = circusFrame(ctx);
  const c = new Draw(b, F);
  const hi = ctx.detail === 'high';
  const sec = circusSection();
  const w1 = sec.walks[0];
  const gaps = circusGaps();
  const [z0, z1] = gaps.pulvinar;
  const zm = (z0 + z1) / 2;
  const xf = CIRCUS.track + w1.u1; // front face (balteus line)
  const xb = CIRCUS.halfW - CIRCUS.wall; // back = facade inner face
  const floor = w1.y1 + 0.8; // box floor, above the first rows of the upper tier
  // Solid substructure and the marble front of the box.
  c.span('brick', xf + 0.3, 0, z0, xb, floor, z1, { collide: true });
  c.span('marble', xf, w1.y - 0.05, z0, xf + 0.3, floor, z1, { collide: true });
  c.span('marble_giallo', xf, floor - 0.02, z0 + 0.3, xb, floor + 0.04, z1 - 0.3);
  // Side walls closing the slot, with a cornice.
  const colH = 5.4;
  const D = 0.62;
  const yE = floor + colH;
  for (const z of [z0, z1]) {
    const zz = z === z0 ? z0 : z1 - 0.45;
    c.span('marble', xf + 0.8, floor, zz, xb, yE, zz + 0.45, { collide: true });
  }
  // Back wall, painted deep red with gilded panels.
  c.span('plaster_red', xb - 0.4, floor, z0 + 0.45, xb, yE, z1 - 0.45);
  for (const z of [z0 + 3, zm, z1 - 3]) c.span('gilded_bronze', xb - 0.43, floor + 1.4, z - 1.0, xb - 0.4, floor + 3.6, z + 1.0);
  // Front colonnade: six Corinthian columns, balustrade between them.
  const n = 6;
  const span = z1 - z0 - 1.4;
  for (let i = 0; i < n; i++) {
    const z = z0 + 0.7 + (span * i) / (n - 1);
    column(b, { order: 'corinthian', D, height: colH, material: 'marble', detail: hi ? 'low' : 'low', collide: true }, F.clone().multiply(new THREE.Matrix4().makeTranslation(xf + 0.75, floor, z)));
    if (i < n - 1) c.span('bronze', xf + 0.68, floor, z + 0.45, xf + 0.82, floor + 1.0, z + span / (n - 1) - 0.45, { collide: true });
  }
  // Entablature round three sides and the pediment facing the track.
  const ent = (order: 'corinthian') => ({ order, columnHeight: colH, D, material: 'marble' as const, detail: ctx.detail });
  const ex = xf + 0.75 - D * 0.5;
  const pathPts = [new THREE.Vector3(xb, yE, z1), new THREE.Vector3(ex, yE, z1), new THREE.Vector3(ex, yE, z0), new THREE.Vector3(xb, yE, z0)];
  const er = entablature(b, pathPts, ent('corinthian'), { at: F, caps: true });
  const dims = er.dims;
  const yP = yE + dims.total;
  const pm = F.clone().multiply(new THREE.Matrix4().makeTranslation(ex, yP, zm)).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
  const pr = pediment(b, { order: 'corinthian', span: z1 - z0, cornice: dims.cornice, depth: 0.6, friezeX: er.friezeX, D, material: 'marble', detail: ctx.detail, relief: hi }, pm);
  // Gable roof (ridge across the slot, toward the track), gilded acroteria.
  c.span('marble', ex + 0.4, yE, z0, xb, yP, z1);
  const rise = pr.rise;
  const roofPts = (side: number) => {
    const ze = side < 0 ? z0 - 0.2 : z1 + 0.2;
    return [ex, yP, ze, xb, yP, ze, xb, yP + rise, zm, ex, yP, ze, xb, yP + rise, zm, ex, yP + rise, zm];
  };
  for (const side of [-1, 1]) {
    const pts = roofPts(side);
    if (side > 0) {
      // Reverse winding for the far slope.
      for (let i = 0; i < pts.length; i += 9) {
        const t = pts.slice(i + 3, i + 6);
        pts.splice(i + 3, 3, ...pts.slice(i + 6, i + 9));
        pts.splice(i + 6, 3, ...t);
      }
    }
    c.tris('roof_tile', pts);
  }
  for (const z of [z0, zm, z1]) c.cyl('gilded_bronze', ex - 0.1, yP + (z === zm ? rise : 0) + 0.5, z, 0.22, 1.0, 8, { rTop: 0.05 });
  // The couches of the gods (pulvinaria) under purple drapes, and the emperor's curule chair.
  c.span('wood_dark', xb - 2.6, floor, z0 + 1.2, xb - 1.0, floor + 0.55, z1 - 1.2);
  c.span('fabric_purple', xb - 2.65, floor + 0.55, z0 + 1.15, xb - 0.95, floor + 0.8, z1 - 1.15);
  for (const z of [zm - 4, zm, zm + 4]) seatedDeity(b, F.clone().multiply(new THREE.Matrix4().makeTranslation(xb - 1.8, floor + 0.8, z)).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)), { material: 'gilded_bronze', scale: 0.55, detail: 'low' });
  c.span('gilded_bronze', xf + 2.4, floor, zm - 0.4, xf + 3.0, floor + 0.5, zm + 0.4);
  c.span('fabric_purple', xf + 2.35, floor + 0.5, zm - 0.45, xf + 3.05, floor + 0.62, zm + 0.45);
  // Rear service stair inside (seen through the facade's blind bays) is closed: a door spot outside.
  const at = (x: number, y: number, z: number, h: number, id: string, kind: Parameters<Spots['add']>[1]) => {
    const p = new THREE.Vector3(x, y, z).applyMatrix4(F);
    spots.add(id, kind, p.x, p.y, p.z, h);
  };
  // Headings: the pulvinar's local frame is the circus frame turned by ~91°; looking toward −x (circus) ≈ local −z.
  at(xf + 2.7, floor, zm, Math.PI, 'pulvinar-emperor-seat', 'vista');
  at(xb - 2.0, floor, zm, Math.PI, 'pulvinar-gods-couch', 'shrine');
  at(xf - 0.8, w1.y, z0 + 0.8, Math.PI, 'pulvinar-guard-a', 'npc');
  at(xf - 0.8, w1.y, z1 - 0.8, Math.PI, 'pulvinar-guard-b', 'npc');
  at(CIRCUS.halfW + 1.5, 0, zm, 0, 'pulvinar-rear-door', 'door');
  return { object: b.build(ctx.lm.id), colliders: b.colliders, spots: spots.list, cullDistance: 1600 };
}

// ---------------------------------------------------------------- Arch of Titus (in the Circus)

function archTitusBuild(ctx: LandmarkContext) {
  const { b, d } = drawFor(ctx);
  const spots = new Spots();
  const W = (17 * ctx.S) / 3.96;
  const res = triumphalArch(
    b,
    {
      bays: 3,
      span: W,
      order: 'composite',
      material: 'marble',
      detail: ctx.detail,
      inscription: ['Senatus Populusque Romanus', 'Imp Tito Caesari Divi Vespasiani F Vespasiano Aug', 'Pontif Max Trib Pot X Imp XVII Cos VIII P P Principi Suo', 'Quod Gentem Iudaeorum Domuit Et Urbem Hierusolymam Delevit'],
      inscriptionStyle: 'bronze',
      quadriga: true,
      reliefs: true,
    },
  );
  // Paving through the passages and a threshold on both sides.
  d.span('paving_travertine', -res.width / 2 - 0.4, -0.3, -res.depth / 2 - 2.0, res.width / 2 + 0.4, 0.04, res.depth / 2 + 2.0);
  spots.add('arch-titus-circus-inscription', 'inscription', 0, 0, -res.depth / 2 - 6, 0);
  spots.add('arch-titus-circus-gate', 'door', 0, 0, -res.depth / 2 - 1.2, 0);
  return { object: b.build(ctx.lm.id), colliders: b.colliders, spots: spots.list, cullDistance: 1600 };
}

// ---------------------------------------------------------------- Temple of Sol (Aventine stands)

function solBuild(ctx: LandmarkContext) {
  const { b } = drawFor(ctx);
  const spots = new Spots();
  const F = circusFrame(ctx);
  const c = new Draw(b, F);
  const sec = circusSection();
  const w1 = sec.walks[0];
  const gaps = circusGaps();
  const [z0, z1] = gaps.sol;
  const zm = (z0 + z1) / 2;
  const xf = -(CIRCUS.track + w1.u1);
  const xb = -(CIRCUS.halfW - CIRCUS.wall);
  const floor = w1.y1 + 0.8;
  // Substructure and podium front with a stair from the walkway.
  c.span('brick', xb, 0, z0, xf - 0.3, floor, z1, { collide: true });
  c.span('marble', xf - 0.3, w1.y - 0.05, z0, xf, floor, z1, { collide: true });
  // Temple in its own frame facing +x (the track): local −z → circus +x.
  const tm = F.clone().multiply(new THREE.Matrix4().makeTranslation((xf + xb) / 2 - 0.2, floor, zm)).multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2));
  const width = z1 - z0 - 0.9;
  const L = temple(b, { order: 'ionic', plan: 'prostyle', front: 4, sides: 4, pronaos: 1, width, stairs: 'none', podiumHeight: 0.4, material: 'marble', cellaMaterial: 'plaster_ochre', roofMaterial: 'roof_tile', detail: 'low', pedimentRelief: false }, tm).layout;
  // Side walls closing the slot up to the cornice.
  const yTop = floor + 0.4 + L.H + L.entablature.height * 0.5;
  for (const z of [z0, z1 - 0.4]) c.span('marble', xb, floor, z, xf - 1.2, yTop, z + 0.4, { collide: true });
  // Gilded radiate Sol on the apex, an altar on the walkway below.
  const apex = new THREE.Vector3(0, 0.4 + L.totalHeight - 0.2, L.stylobate.z0 + 0.2).applyMatrix4(tm);
  const sun = new Draw(b, new THREE.Matrix4().makeTranslation(apex.x, apex.y, apex.z));
  sun.ellipsoid('gilded_bronze', 0, 0.55, 0, 0.32, 0.36, 0.3);
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / 8;
    sun.box('gilded_bronze', Math.cos(a) * 0.5, 0.55 + Math.sin(a) * 0.5 + 0.1, 0, 0.06, 0.38, 0.06, { rz: -a + Math.PI / 2 });
  }
  c.span('marble', xf + 0.35, w1.y, zm - 0.5, xf + 1.05, w1.y + 1.0, zm + 0.5, { collide: true });
  c.box('glow_fire', xf + 0.7, w1.y + 1.04, zm, 0.4, 0.06, 0.4);
  const at = (x: number, y: number, z: number, h: number, id: string, kind: Parameters<Spots['add']>[1]) => {
    const p = new THREE.Vector3(x, y, z).applyMatrix4(F);
    spots.add(id, kind, p.x, p.y, p.z, h);
  };
  at(xf + 1.8, w1.y, zm, 0, 'sol-altar', 'shrine');
  at(xf + 1.8, w1.y, zm + 2, 0, 'sol-finish-judge', 'npc');
  return { object: b.build(ctx.lm.id), colliders: b.colliders, spots: spots.list, cullDistance: 1200 };
}

// ---------------------------------------------------------------- Temple of Ceres, Liber and Libera

function ceresBuild(ctx: LandmarkContext) {
  const { b, d } = drawFor(ctx);
  const spots = new Spots();
  const w = 30 * ctx.S * 0.9;
  // An Etrusco-Italic temple: widely spaced Tuscan columns of stuccoed tufa, a deep porch, three
  // cellae, a broad tiled roof with painted terracotta revetments and statues (Damophilos and
  // Gorgasos decorated it, Pliny NH 35.154).
  const L = temple(b, {
    order: 'tuscan',
    plan: 'sine_postico',
    front: 4,
    sides: 5,
    pronaos: 2,
    width: w,
    intercolumniation: 'araeostyle',
    material: 'plaster_white',
    podiumMaterial: 'tufa',
    cellaMaterial: 'plaster_white',
    roofMaterial: 'roof_tile',
    doorMaterial: 'bronze',
    acroteria: 'none',
    pedimentRelief: false,
    detail: ctx.detail,
    pitchDeg: 18,
  }).layout;
  // Footing down to the ground on any slope.
  const g = footingRect(ctx, d, L.stylobate.x0, L.podiumFront, L.stylobate.x1, L.stylobate.z1);
  void g;
  // Painted terracotta frieze plaques and antefixes along the eaves; terracotta acroteria.
  const yE = L.podiumHeight + L.H;
  const e = L.entablature;
  for (const z of [e.z0 - 0.05]) d.span('stucco_painted', e.x0 - 0.05, yE + e.height * 0.35, z - 0.02, e.x1 + 0.05, yE + e.height * 0.75, z);
  for (const x of [e.x0 - 0.06, e.x1 + 0.02]) d.span('stucco_painted', x, yE + e.height * 0.35, e.z0, x + 0.04, yE + e.height * 0.75, e.z1);
  const apexY = L.totalHeight;
  d.ellipsoid('terracotta', 0, apexY + 0.6, e.z0 + 0.3, 0.35, 0.7, 0.3);
  for (const x of [e.x0 + 0.3, e.x1 - 0.3]) d.ellipsoid('terracotta', x, yE + e.height + 0.5, e.z0 + 0.3, 0.3, 0.55, 0.25);
  // Three cella doors (Ceres, Liber, Libera): two extra doors either side of the kit's central one.
  const cz = L.cella.z0 - 0.02;
  for (const x of [-(L.cella.x1 - L.cella.x0) / 3, (L.cella.x1 - L.cella.x0) / 3]) {
    d.span('bronze', x - 0.6, L.podiumHeight, cz - 0.04, x + 0.6, L.podiumHeight + 2.8, cz);
    d.span('plaster_white', x - 0.8, L.podiumHeight + 2.8, cz - 0.08, x + 0.8, L.podiumHeight + 3.1, cz);
  }
  // The aediles' notice board (album) on the podium wall, an altar and the archive chest.
  const front = L.podiumFront;
  paintedSign(b, ['Aediles Plebis Edicunt', 'Frumentum · Ludi Ceriales', 'A D XII K Mai'], 2.6, 1.0, new THREE.Matrix4().makeTranslation(L.stylobate.x0 + 1.8, L.podiumHeight * 0.45, front - 0.02));
  d.span('tufa', -0.8, 0, front - 4.0, 0.8, 1.0, front - 2.8, { collide: true });
  d.box('glow_fire', 0, 1.03, front - 3.4, 0.6, 0.05, 0.5);
  spots.add('temple-ceres-album', 'inscription', L.stylobate.x0 + 1.8, 0, front - 1.5, Math.PI);
  spots.add('temple-ceres-altar', 'shrine', 0, 0, front - 5.0, 0);
  spots.add('temple-ceres-archive', 'container', 0, L.podiumHeight, L.cella.z0 + 1.0, Math.PI);
  spots.add('temple-ceres-clerk', 'npc', L.stylobate.x0 + 2.5, 0, front - 2.5, Math.PI);
  return { object: b.build(ctx.lm.id), colliders: b.colliders, spots: spots.list, cullDistance: 1200 };
}

export const builders: LandmarkBuilder[] = [
  { handles: ['circus-maximus'], build: circus },
  { handles: ['obelisk-circus-maximus'], build: obeliskBuild },
  { handles: ['pulvinar'], build: pulvinarBuild },
  { handles: ['arch-titus-circus'], build: archTitusBuild },
  { handles: ['temple-sol-circus'], build: solBuild },
  { handles: ['temple-ceres'], build: ceresBuild },
];
