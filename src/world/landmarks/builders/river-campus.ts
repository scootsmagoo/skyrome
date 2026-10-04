/**
 * The southern Campus Martius by the river: the Temple of Apollo Sosianus (Corinthian hexastyle,
 * Luna marble), the Temple of Bellona with the War Column in front of it, the Portico of Octavia
 * (a double colonnade round the temples of Jupiter Stator and Juno Regina, with its propylon on
 * the Circus side and Lysippus' bronze horsemen) and the Circus Flaminius (an open square where
 * triumphs muster, with the arches of Germanicus and Drusus at its ends).
 */
import * as THREE from 'three';
import { T, mul, type V2 } from '../../../arch/common/geom';
import { inscriptionPanel } from '../../../arch/common/inscription';
import { stairs, stepCount } from '../../../arch/common/stairs';
import { column } from '../../../arch/classical/column';
import { entablature, pediment } from '../../../arch/classical/entablature';
import { equestrian } from '../../../arch/classical/statues';
import { triumphalArch } from '../../../arch/classical/arch';
import { entablatureDims } from '../../../arch/classical/orders';
import { buildPlaza } from '../../../arch/fabric';
import { placeProp } from '../../../arch/props';
import type { MaterialId } from '../../../gfx/materialIds';
import type { LandmarkBuilder, LandmarkContext, Spot } from '../types';
import { altar, centredTemple, draw, farBoxes, fittedTemple, friezeInscription, gableRoof, insideAny, neighbourFootprints, riverEnv, roadCorridors, simpleColonnade, spot } from './river-kit';
import { LampList, riverLife } from './river-life';

// ------------------------------------------------------------------ Apollo Sosianus

function templeApolloSosianus(ctx: LandmarkContext) {
  const { S, lm } = ctx;
  const b = ctx.builder();
  const gl = ctx.groundAt;
  const fp = lm.footprint as { w: number; d: number };
  // Rebuilt by C. Sosius from 34 BC: Corinthian hexastyle, half-columns round the cella, Luna marble
  // on a high podium. The kit's columns are evenly fluted (the real ones alternate wide and narrow).
  const { L, dz, front } = fittedTemple(ctx, b, {
    order: 'corinthian', plan: 'pseudoperipteral', front: 6, pronaos: 3, width: fp.w * S * 0.94, podiumHeight: 4.2 * S,
    material: 'marble', cellaMaterial: 'marble', podiumMaterial: 'travertine', roofMaterial: 'roof_tile', fluted: true,
    // M fidelity (GDD §12.1): high-detail columns would cost ~190k triangles here.
    detail: 'low',
  }, fp.d * S - 1.5);
  friezeInscription(b, L, dz, ['APOLLINI·MEDICO', 'C·SOSIVS·COS·FECIT'], 'bronze');
  const d = draw(b);
  // The steps come within a couple of metres of the Theatre of Marcellus, so the altar stands
  // beside the podium (east side), not in front of it.
  const xa = L.stylobate.x1 + 2.2;
  const za = front + 2.5;
  altar(d.at(xa, gl(xa, za), za, -Math.PI / 2), 1.6, 1.1, 1.1, 'marble');
  const spots: Spot[] = [
    spot('temple-apollo-sosianus:altar', 'shrine', xa + 1.6, gl(xa + 1.6, za), za, -Math.PI / 2),
    spot('temple-apollo-sosianus:dedication', 'inscription', 0, 0, front - 1.0, 0),
    spot('temple-apollo-sosianus:door', 'door', 0, L.podiumHeight, L.cella.z0 + dz - 0.8, Math.PI),
    spot('temple-apollo-sosianus:steps', 'vista', 0, L.podiumHeight, L.stylobate.z0 + dz + 0.4, 0),
  ];
  riverLife(ctx, spots, new LampList().add(xa, gl(xa, za) + 1.3, za, 'fire'));
  return { object: b.build(lm.id), colliders: b.colliders, spots };
}

// ------------------------------------------------------------------ Bellona + the War Column

function templeBellona(ctx: LandmarkContext) {
  const { S, lm } = ctx;
  const b = ctx.builder();
  const gl = ctx.groundAt;
  const fp = lm.footprint as { w: number; d: number };
  // Vowed by Ap. Claudius Caecus in 296 BC; the form is unknown [C]: an Ionic hexastyle prostyle
  // temple of stuccoed tufa on a podium, where the Senate receives envoys and victorious generals.
  const { L, dz, front } = fittedTemple(ctx, b, {
    order: 'ionic', plan: 'prostyle', front: 6, pronaos: 3, width: fp.w * S * 0.92, podiumHeight: 3.4 * S,
    material: 'plaster_white', cellaMaterial: 'plaster_cream', podiumMaterial: 'tufa', roofMaterial: 'roof_tile', fluted: true, detail: 'low',
  }, fp.d * S - 1.5);
  friezeInscription(b, L, dz, ['BELLONAE'], 'carved');
  const d = draw(b);
  const za = front - 1.8;
  altar(d.at(-2.2, gl(-2.2, za), za), 1.3, 0.9, 1.0, 'tufa');
  const spots: Spot[] = [
    spot('temple-bellona:altar', 'shrine', -2.2, gl(-2.2, za - 1.4), za - 1.4, 0),
    spot('temple-bellona:senate-door', 'door', 0, L.podiumHeight, L.cella.z0 + dz - 0.8, Math.PI),
    spot('temple-bellona:envoys', 'npc', 1.5, L.podiumHeight, L.stylobate.z0 + dz + 1.0, 0),
  ];
  riverLife(ctx, spots, new LampList().add(-2.2, gl(-2.2, za) + 1.2, za, 'fire'));
  return { object: b.build(lm.id), colliders: b.colliders, spots };
}

function columnaBellica(ctx: LandmarkContext) {
  const { lm } = ctx;
  const b = ctx.builder();
  const d = draw(b);
  // A short column on a base in a small railed plot that stands for enemy soil: the fetial hurls
  // a cornel-wood spear over it to declare war on a distant foe.
  d.span('travertine', -1.6, 0, -1.6, 1.6, 0.18, 1.6, { collide: true });
  d.span('peperino', -0.55, 0.18, -0.55, 0.55, 0.62, 0.55, { collide: true });
  d.cyl('peperino', 0, 0.66, 0, 0.36, 0.08, 12);
  d.cyl('peperino', 0, 0.7 + 0.7, 0, 0.3, 1.4, 12, { rTop: 0.27, collide: true });
  d.cyl('peperino', 0, 2.16, 0, 0.27, 0.12, 12, { rTop: 0.34 });
  d.span('peperino', -0.38, 2.22, -0.38, 0.38, 2.34, 0.38);
  // Low stone posts with a timber rail (the fetial's plot); open on the temple side.
  const posts: V2[] = [[-1.45, -1.45], [0, -1.45], [1.45, -1.45], [1.45, 0], [1.45, 1.45], [-1.45, 1.45], [-1.45, 0]];
  for (const [x, z] of posts) d.span('travertine', x - 0.1, 0.18, z - 0.1, x + 0.1, 0.95, z + 0.1, { collide: true });
  for (const [a, c] of [[0, 1], [1, 2], [2, 3], [3, 4], [5, 6], [6, 0]] as const) {
    const [x0, z0] = posts[a];
    const [x1, z1] = posts[c];
    d.rod('wood', new THREE.Vector3(x0, 0.82, z0), new THREE.Vector3(x1, 0.82, z1), 0.035, 5);
  }
  // The spear of the last declaration, laid against the base (cornel shaft, fire-hardened point).
  d.rod('wood_dark', new THREE.Vector3(-0.3, 0.2, 0.6), new THREE.Vector3(0.35, 1.9, 0.5), 0.025, 5);
  const spots: Spot[] = [
    spot('columna-bellica:fetial', 'shrine', 0, 0.18, 1.0, Math.PI),
    spot('columna-bellica:column', 'vista', 0, 0, -2.2, 0),
  ];
  riverLife(ctx, spots);
  return { object: b.build(lm.id), colliders: b.colliders, spots };
}

// ------------------------------------------------------------------ Porticus Octaviae

/** Real-metre trim of the atlas rectangle (119 × 132): its ESE front corner overlapped the theatre facade. */
const OCTAVIA_W = 115;
const OCTAVIA_D = 128;

function porticusOctaviae(ctx: LandmarkContext) {
  const { S, lm } = ctx;
  const hi = ctx.detail === 'high';
  const b = ctx.builder();
  const d = draw(b);
  const W = OCTAVIA_W * S;
  const Dp = OCTAVIA_D * S;
  const x0 = -W / 2, x1 = W / 2, z0 = -Dp / 2, z1 = Dp / 2;
  const depth = 5.6; // between the outer and inner rows
  const colH = 5.0;
  const D = 0.5;
  const spacing = 2.9;
  // Propylon on the front (−z) side, toward the Circus Flaminius.
  const pw = 11.6;
  const pd = depth + 5.2;
  const st = 0.36;

  // Stylobate floor of the colonnades (a ring).
  const ring = (inset: number) => [[x0 + inset, z0 + inset], [x1 - inset, z0 + inset], [x1 - inset, z1 - inset], [x0 + inset, z1 - inset]] as V2[];
  const outer = ring(-0.6);
  const inner = ring(depth + 0.9);
  for (const [a, c] of [[0, 1], [1, 2], [2, 3], [3, 0]] as const) {
    // Four strips: front/back full width, sides between them.
    const p = outer[a], q = outer[c];
    const ip = inner[a], iq = inner[c];
    const xs = [p[0], q[0], ip[0], iq[0]];
    const zs = [p[1], q[1], ip[1], iq[1]];
    d.span('paving_travertine', Math.min(...xs), 0, Math.min(...zs), Math.max(...xs), st, Math.max(...zs), { collide: true });
  }
  // Rows of columns: front side with kit columns (seen from the Circus), the rest cheap.
  const runs: { a: V2; c: V2; side: 'front' | 'other' }[] = [];
  const gap0 = -pw / 2 - 0.6, gap1 = pw / 2 + 0.6;
  runs.push({ a: [x0, z0], c: [gap0, z0], side: 'front' }, { a: [gap1, z0], c: [x1, z0], side: 'front' });
  runs.push({ a: [x1, z0], c: [x1, z1], side: 'other' }, { a: [x1, z1], c: [x0, z1], side: 'other' }, { a: [x0, z1], c: [x0, z0], side: 'other' });
  const innerRuns: { a: V2; c: V2 }[] = [
    { a: [x0 + depth, z0 + depth], c: [gap0, z0 + depth] },
    { a: [gap1, z0 + depth], c: [x1 - depth, z0 + depth] },
    { a: [x1 - depth, z0 + depth], c: [x1 - depth, z1 - depth] },
    { a: [x1 - depth, z1 - depth], c: [x0 + depth, z1 - depth] },
    { a: [x0 + depth, z1 - depth], c: [x0 + depth, z0 + depth] },
  ];
  for (const r of runs) {
    if (r.side === 'front') {
      const len = Math.hypot(r.c[0] - r.a[0], r.c[1] - r.a[1]);
      const n = Math.max(1, Math.round(len / spacing));
      for (let k = 0; k <= n; k++) {
        const x = r.a[0] + ((r.c[0] - r.a[0]) * k) / n;
        const z = r.a[1] + ((r.c[1] - r.a[1]) * k) / n;
        column(b, { order: 'corinthian', D, height: colH, material: 'marble', detail: 'low' }, T(x, st, z));
      }
      d.box('marble', (r.a[0] + r.c[0]) / 2, st + colH + 0.42, r.a[1], Math.abs(r.c[0] - r.a[0]) + 0.6, 0.84, 0.62);
    } else {
      simpleColonnade(d, [r.a, r.c], { y: st, height: colH, D, spacing, mat: 'marble', collide: true });
    }
  }
  for (const r of innerRuns) simpleColonnade(d, [r.a, r.c], { y: st, height: colH, D, spacing, mat: 'marble', collide: true });
  // Roofs: a gable over each run of the double colonnade (ridge along the run).
  const yE = st + colH + 0.84;
  const roofRun = (cx: number, cz: number, len: number, rotY: number) => {
    const m = new THREE.Matrix4().makeRotationY(rotY).setPosition(cx, 0, cz);
    gableRoof(b, -depth / 2 - 0.5, depth / 2 + 0.5, -len / 2, len / 2, yE, 20, 'roof_tile', hi, m);
    b.box('wood_dark', depth + 0.6, 0.12, len, mul(m, T(0, yE - 0.06, 0)), { castShadow: false });
  };
  const fz = z0 + depth / 2;
  roofRun((x0 + gap0) / 2, fz, gap0 - x0, Math.PI / 2);
  roofRun((gap1 + x1) / 2, fz, x1 - gap1, Math.PI / 2);
  roofRun(x0 + depth / 2, 0, Dp - 2 * depth - 1, 0);
  roofRun(x1 - depth / 2, 0, Dp - 2 * depth - 1, 0);
  roofRun(0, z1 - depth / 2, W + 1, Math.PI / 2);

  // ---- propylon: tetrastyle Corinthian porch projecting from the front, pedimented both ways
  const pH = 6.2;
  const pD = pH / 10;
  const pY = st + 0.6;
  const pz0 = z0 - (pd - depth) - 0.4; // outer column line
  const pz1 = z0 + depth; // inner column line (court side)
  // Platform and steps (1:1) down to the street.
  d.span('marble', -pw / 2 - 0.6, 0, pz0 - 0.9, pw / 2 + 0.6, pY, pz1 + 0.9, { collide: true });
  const sc = stepCount(pY, 0.2);
  stairs(b, { width: pw - 1.2, rise: sc.rise, run: 0.32, count: sc.count, material: 'marble' }, T(0, 0, pz0 - 0.9 - sc.count * 0.32));
  const pxs = [-1.5, -0.5, 0.5, 1.5].map((k) => k * (pw / 4.1));
  for (const x of pxs) {
    column(b, { order: 'corinthian', D: pD, height: pH, material: 'marble', fluted: true, detail: hi ? 'high' : 'low' }, T(x, pY, pz0));
    column(b, { order: 'corinthian', D: pD, height: pH, material: 'marble', fluted: true, detail: 'low' }, T(x, pY, pz1));
  }
  const ent = entablatureDims('corinthian', pH);
  const ex = pw / 2 - 0.2;
  const eRect = [new THREE.Vector3(-ex, pY + pH, pz0 - pD * 0.45), new THREE.Vector3(ex, pY + pH, pz0 - pD * 0.45), new THREE.Vector3(ex, pY + pH, pz1 + pD * 0.45), new THREE.Vector3(-ex, pY + pH, pz1 + pD * 0.45)];
  const er = entablature(b, eRect, { order: 'corinthian', columnHeight: pH, D: pD, material: 'marble', detail: ctx.detail, depth: pD * 1.2 }, { closed: true });
  for (const [z, rot] of [[pz0 - pD * 0.45, 0], [pz1 + pD * 0.45, Math.PI]] as const) {
    const m = new THREE.Matrix4().makeRotationY(rot).setPosition(0, pY + pH + ent.total, z);
    pediment(b, { order: 'corinthian', span: 2 * ex, cornice: ent.cornice, depth: 0.6, friezeX: er.friezeX, D: pD, material: 'marble', detail: rot === 0 ? ctx.detail : 'low', relief: hi && rot === 0 }, m);
  }
  const rise = Math.tan((14 * Math.PI) / 180) * ex;
  gableRoof(b, -ex, ex, pz0 - pD * 0.45, pz1 + pD * 0.45, pY + pH + ent.total + 0.05, 14, 'roof_tile', hi, new THREE.Matrix4());
  void rise;
  d.span('wood_dark', -ex, pY + pH + ent.total - 0.1, pz0, ex, pY + pH + ent.total, pz1, { shadow: false });

  // ---- the two temples, side by side, facing the propylon
  // Jupiter Stator (Hermodorus, 146 BC; the first marble temple in Rome): peripteral hexastyle.
  // Juno Regina: prostyle hexastyle. Juno to the WNW (+x), Jupiter to the ESE (−x) (atlas).
  const tz = 7;
  const jup = d.at(-9.2, 0, tz);
  const jb = ctx.builder();
  const jl = centredTemple({ ...ctx, groundAt: () => 0 }, jb, { order: 'ionic', plan: 'peripteral', front: 6, sides: 9, width: 10.4, podiumHeight: 1.8, material: 'marble', cellaMaterial: 'marble', podiumMaterial: 'travertine', roofMaterial: 'roof_tile', detail: 'low' });
  friezeInscription(jb, jl.L, jl.dz, ['IOVI·STATORI'], 'bronze');
  b.append(jb, jup.m);
  const juno = d.at(9.2, 0, tz);
  const nb = ctx.builder();
  const nl = centredTemple({ ...ctx, groundAt: () => 0 }, nb, { order: 'corinthian', plan: 'prostyle', front: 6, sides: 8, pronaos: 3, width: 10.4, podiumHeight: 1.8, material: 'marble', cellaMaterial: 'plaster_cream', podiumMaterial: 'travertine', roofMaterial: 'roof_tile', detail: 'low' });
  friezeInscription(nb, nl.L, nl.dz, ['IVNONI·REGINAE'], 'bronze');
  b.append(nb, juno.m);
  const altars: [number, number][] = [[-9.2, tz + jl.front - 1.6], [9.2, tz + nl.front - 1.6]];
  for (const [x, z] of altars) altar(d.at(x, 0, z), 1.4, 0.95, 1.05, 'marble');

  // ---- Lysippus' horsemen (the Granicus group brought by Metellus) on a long base before the temples
  const hz = (z0 + depth + tz + Math.min(jl.front, nl.front)) / 2 - 2;
  const nH = hi ? 5 : 3;
  const baseW = nH * 2.6 + 1;
  d.span('marble', -baseW / 2, 0, hz - 1.6, baseW / 2, 1.1, hz + 1.6, { collide: true });
  d.span('marble', -baseW / 2 - 0.1, 1.0, hz - 1.7, baseW / 2 + 0.1, 1.18, hz + 1.7);
  for (let k = 0; k < nH; k++) {
    const x = -baseW / 2 + 1.8 + k * 2.6;
    equestrian(b, new THREE.Matrix4().makeRotationY((k % 2 ? 0.25 : -0.15) + (k === Math.floor(nH / 2) ? 0 : 0)).setPosition(x, 1.18, hz), { material: 'bronze', detail: 'low', plinth: false });
  }
  inscriptionPanel(b, { lines: ['TVRMA·ALEXANDRI·OPVS·LYSIPPI', 'Q·METELLVS·MACEDONICVS·EX·MACEDONIA·ADVEXIT'], width: Math.min(baseW - 1, 9), height: 0.6, style: 'carved' }, T(0, 0.55, hz - 1.62), { depth: 0.02 });

  // ---- library and curia hall along the back, opening onto the court
  const lz0 = z1 - depth - 7.2;
  const lz1 = z1 - depth - 0.4;
  const lw = 26;
  d.span('plaster_cream', -lw / 2, 0, lz0 + 1.6, lw / 2, 7.0, lz1, { collide: true });
  d.span('travertine', -lw / 2 - 0.2, 0, lz0 + 1.6, lw / 2 + 0.2, 0.6, lz1 + 0.2);
  // Ridge along x: in a frame turned 90° about y, local z runs along world x.
  const hd = (lz1 - lz0 - 1.6) / 2 + 0.3;
  gableRoof(b, -hd, hd, -lw / 2 - 0.3, lw / 2 + 0.3, 7.0, 16, 'roof_tile', hi, new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(0, 0, (lz0 + 1.6 + lz1) / 2));
  simpleColonnade(d, [[-lw / 2 + 1, lz0], [lw / 2 - 1, lz0]], { y: 0.3, height: 5.2, D: 0.48, spacing: 3.0, mat: 'marble', collide: true });
  d.span('paving_travertine', -lw / 2, 0, lz0 - 0.6, lw / 2, 0.3, lz0 + 1.6, { collide: true });
  for (const [x, label] of [[-6, 'BIBLIOTHECA·GRAECA'], [6, 'BIBLIOTHECA·LATINA']] as const) {
    d.span('black', x - 1.1, 0.3, lz0 + 1.58, x + 1.1, 3.4, lz0 + 1.62, { shadow: false });
    inscriptionPanel(b, { lines: [label], width: 2.4, height: 0.32, style: 'carved' }, T(x, 3.75, lz0 + 1.57), { depth: 0.02 });
  }
  d.span('black', -1.4, 0.3, lz0 + 1.58, 1.4, 3.8, lz0 + 1.62, { shadow: false });

  // Court paving (beaten earth with gravel paths would be cheaper; marble-veined slabs read better).
  d.span('paving_travertine', x0 + depth + 1, 0, z0 + depth + 1, x1 - depth - 1, 0.04, z1 - depth - 1, { shadow: false });

  const spots: Spot[] = [
    spot('porticus-octaviae:propylon', 'door', 0, 0, pz0 - 3.2, 0),
    spot('porticus-octaviae:propylon-steps', 'vista', 0, pY, pz0 + 0.4, 0),
    spot('porticus-octaviae:horsemen', 'inscription', 0, 0, hz - 2.6, 0),
    spot('porticus-octaviae:jupiter-altar', 'shrine', -9.2, 0, altars[0][1] - 1.5, 0),
    spot('porticus-octaviae:juno-altar', 'shrine', 9.2, 0, altars[1][1] - 1.5, 0),
    // In the portico before the halls (columns every 3 m along lz0), facing the doors.
    spot('porticus-octaviae:library', 'door', -6, 0.3, lz0 + 1.0, 0),
    spot('porticus-octaviae:librarian', 'npc', 7.5, 0.3, lz0 + 0.9, Math.PI),
    spot('porticus-octaviae:curia', 'door', 0, 0.3, lz0 + 1.0, 0),
  ];
  for (let k = 0; k < 4; k++) spots.push(spot(`porticus-octaviae:bench-${k}`, 'sit', x0 + depth / 2, st, z0 + 14 + k * 12, Math.PI / 2));
  const far = farBoxes([
    { mat: 'marble', c: [0, 3.2, z0 + depth / 2], s: [W, 6.4, depth] },
    { mat: 'marble', c: [0, 3.2, z1 - depth / 2], s: [W, 6.4, depth] },
    { mat: 'marble', c: [x0 + depth / 2, 3.2, 0], s: [depth, 6.4, Dp] },
    { mat: 'marble', c: [x1 - depth / 2, 3.2, 0], s: [depth, 6.4, Dp] },
    { mat: 'marble', c: [-9.2, 5, tz], s: [10, 10, 16] },
    { mat: 'marble', c: [9.2, 5, tz], s: [10, 10, 16] },
  ], 'porticus-octaviae:far');
  riverLife(ctx, spots, new LampList().add(altars[0][0], 1.25, altars[0][1], 'fire').add(altars[1][0], 1.25, altars[1][1], 'fire'));
  return { object: b.build(lm.id), colliders: b.colliders, spots, far, cullDistance: 900 };
}

// ------------------------------------------------------------------ Circus Flaminius

function circusFlaminius(ctx: LandmarkContext) {
  const { S, lm, rng } = ctx;
  const hi = ctx.detail === 'high';
  const b = ctx.builder();
  const env = riverEnv(ctx);
  const d = draw(b);
  const fp = lm.footprint as { w: number; d: number };
  const W = fp.w * S;
  const L = fp.d * S;
  const gl = (x: number, z: number) => ctx.groundAt(x, z) + 0.12; // on the gravel / paving
  // Neighbours (temples standing in and around the square, the porticoes, the theatre) and streets stay clear.
  const nb = neighbourFootprints(ctx, env, { grow: 3 });
  const roads = roadCorridors(ctx, env, 0.6);
  const blocked = [...nb.map((n) => n.poly), ...roads];
  const area: V2[] = [[-W / 2, -L / 2], [W / 2, -L / 2], [W / 2, L / 2], [-W / 2, L / 2]];
  // A beaten gravel track down the middle (the Ludi Taurei are run here), paved margins.
  buildPlaza(b, [[-W / 2 + 7, -L / 2 + 4], [W / 2 - 7, -L / 2 + 4], [W / 2 - 7, L / 2 - 4], [-W / 2 + 7, L / 2 - 4]], (x, z) => ctx.groundAt(x, z), { material: 'gravel', exclude: blocked, collide: true, lift: 0.12, cell: 3 });
  for (const sx of [-1, 1]) {
    buildPlaza(b, [[sx * (W / 2 - 7), -L / 2 + 4], [sx * (W / 2 - 1), -L / 2 + 4], [sx * (W / 2 - 1), L / 2 - 4], [sx * (W / 2 - 7), L / 2 - 4]], (x, z) => ctx.groundAt(x, z), { material: 'paving_travertine', exclude: blocked, collide: true, lift: 0.14, cell: 3 });
  }
  void area;
  const clear = (x: number, z: number, r: number) => {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      if (insideAny(x + Math.cos(a) * r, z + Math.sin(a) * r, blocked)) return false;
    }
    return !insideAny(x, z, blocked);
  };
  const spots: Spot[] = [];
  // Turning posts (metae) for the races: three cones on a semicircular base, at both ends.
  for (const [k, z] of [[0, -L / 2 + 22], [1, L / 2 - 22]] as const) {
    if (!clear(0, z, 3)) continue;
    const m = d.at(0, gl(0, z), z);
    m.cyl('travertine', 0, 0.45, 0, 1.6, 0.9, 16, { collide: true });
    for (const x of [-0.9, 0, 0.9]) m.cyl('gilded_bronze', x, 0.9 + 1.4, 0, 0.32, 2.8, 10, { rTop: 0.04 });
    spots.push(spot(`circus-flaminius:meta-${k}`, 'vista', 0, gl(0, z + (k ? -4 : 4)), z + (k ? -4 : 4), k ? 0 : Math.PI));
  }
  // Honorific arches at the two ends of the square [C]: Germanicus (AD 19) and Drusus (AD 23).
  const arches = [
    { z: -L / 2 + 6, lines: ['SENATVS·POPVLVSQVE·ROMANVS', 'GERMANICO·CAESARI·TI·AVGVSTI·F'], quadriga: true, id: 'arch-germanicus' },
    { z: L / 2 - 6, lines: ['SENATVS·POPVLVSQVE·ROMANVS', 'DRVSO·CAESARI·TI·AVGVSTI·F'], quadriga: false, id: 'arch-drusus' },
  ];
  for (const a of arches) {
    let x: number | null = null;
    let z = a.z;
    for (const dzz of [0, 10, 20, 30, 40]) {
      z = a.z + (a.z < 0 ? dzz : -dzz);
      x = findClearX(clear, z, 6, W);
      if (x !== null) break;
    }
    if (x === null) continue;
    a.z = z;
    const y = gl(x, a.z);
    triumphalArch(b, { bays: 1, span: 3.4, order: 'corinthian', material: 'travertine', detail: hi ? 'low' : 'low', inscription: a.lines, inscriptionStyle: 'bronze', quadriga: a.quadriga && hi, reliefs: false }, T(x, y, a.z));
    spots.push(spot(`circus-flaminius:${a.id}`, 'inscription', x, y, a.z + (a.z < 0 ? -4 : 4), a.z < 0 ? 0 : Math.PI));
  }
  // Spoils on display before a triumph: a few stands of captured arms and a trophy, low benches.
  for (let k = 0; k < (hi ? 4 : 2); k++) {
    const z = -L / 4 + k * (L / 6);
    const x = (k % 2 ? 1 : -1) * (W / 2 - 4);
    if (!clear(x, z, 2)) continue;
    const t = d.at(x, gl(x, z), z, k % 2 ? -Math.PI / 2 : Math.PI / 2);
    t.span('wood', -0.08, 0, -0.08, 0.08, 2.6, 0.08, { collide: true });
    t.span('wood', -0.9, 1.9, -0.06, 0.9, 2.02, 0.06);
    t.ellipsoid('bronze', 0, 2.35, 0, 0.32, 0.4, 0.22, { seg: [8, 6] });
    t.cyl('bronze', 0.75, 1.5, 0.05, 0.42, 0.06, 12, { rx: Math.PI / 2 });
    t.cyl('bronze', -0.75, 1.5, 0.05, 0.42, 0.06, 12, { rx: Math.PI / 2 });
    placeProp(t, 'bench', 0, 0, -2.2, 0, { variant: k % 3 });
    // On the bench before the trophy (seat top 0.47 m), facing it.
    const sp = t.point(0, 0.47, -2.2);
    spots.push(spot(`circus-flaminius:spoils-${k}`, 'sit', sp.x, sp.y, sp.z, t.yaw));
  }
  // Statues on bases along both margins (the square is crowded with honorific monuments).
  for (const sx of [-1, 1]) {
    for (let k = 0; k < (hi ? 9 : 5); k++) {
      const z = -L / 2 + 30 + k * ((L - 60) / (hi ? 8 : 4));
      const x = sx * (W / 2 - 3.2);
      if (!clear(x, z, 1.6)) continue;
      placeProp(d, 'statue_pedestal', x, gl(x, z), z, sx > 0 ? -Math.PI / 2 : Math.PI / 2, { rng, variant: k % 3 });
    }
  }
  spots.push(spot('circus-flaminius:muster', 'spawn', 0, gl(0, -L / 2 + 30), -L / 2 + 30, 0));
  spots.push(spot('circus-flaminius:centre', 'npc', 0, gl(0, 0), 0, 0));
  riverLife(ctx, spots);
  return { object: b.build(lm.id), colliders: b.colliders, spots, cullDistance: 900 };
}

function findClearX(clear: (x: number, z: number, r: number) => boolean, z: number, r: number, W: number): number | null {
  for (const x of [0, -W * 0.15, W * 0.15, -W * 0.3, W * 0.3]) if (clear(x, z, r)) return x;
  return null;
}

export const builders: LandmarkBuilder[] = [
  { handles: ['temple-apollo-sosianus'], build: templeApolloSosianus },
  { handles: ['temple-bellona'], build: templeBellona },
  { handles: ['columna-bellica'], build: columnaBellica },
  { handles: ['porticus-octaviae'], build: porticusOctaviae },
  { handles: ['circus-flaminius'], build: circusFlaminius },
];

void ({} as MaterialId);
