/**
 * The Augustan monuments of the northern Campus Martius: the Mausoleum of Augustus, the Ara Pacis
 * and the Horologium (the obelisk-gnomon with its bronze meridian line).
 *
 * Mausoleum (§3.29): Ø ≈ 87–90 m, h ≈ 42–45 m; a travertine-faced drum ≈ 12 m high with a moulded
 * cornice, an earth mound planted with cypresses to the summit (Strabo 5.3.8), a central drum carrying
 * a colossal bronze Augustus; the door faces S between the two bronze pillars of the Res Gestae and
 * (FLAG, date uncertain) two pink granite obelisks of ≈ 14.7 m.
 * Ara Pacis: a Luna-marble enclosure 11.6 × 10.6 m with walls ≈ 4.6 m, doors W (main, with the
 * stair) and E; acanthus scrolls below, the imperial procession above on the long sides, Aeneas and
 * Tellus panels by the doors; the altar inside on steps. Painted (subtly: colours FLAG).
 * Horologium: Psammetichus II's red granite obelisk (21.8 m) on a pedestal with a bronze sphere,
 * the travertine pavement with the bronze meridian and Greek labels running N (re-laid under
 * Domitian).
 */
import * as THREE from 'three';
import { obelisk } from '../../../arch/classical/monuments';
import { armoredEmperor } from '../../../arch/classical/statues';
import { inscriptionPanel } from '../../../arch/common/inscription';
import { HeightField, reliefMaterial } from '../../../arch/common/relief';
import type { Draw } from '../../../arch/fabric/draw';
import type { LandmarkBuild, LandmarkBuilder, LandmarkContext, Spot } from '../types';
import {
  T, TRS, V, altar, broadTree, cypress, dims, draw, farDraw, finish, flight, flightLength, inscription, mul, plinth, spot, type Detail,
} from './generic-common';
import { tree } from './generic-world';

// ---------------------------------------------------------------- relief textures (cached)

let acanthusMat: THREE.MeshStandardMaterial | null = null;
let processionMat: THREE.MeshStandardMaterial | null = null;

/** Acanthus rinceaux: running spirals with leaf lobes and a central candelabrum stem. Seamless in x. */
export function acanthusField(w: number, h: number): HeightField {
  const f = new HeightField(w, h, true);
  const cell = h * 1.1;
  const n = Math.max(1, Math.round(w / cell));
  const cw = w / n;
  for (let i = 0; i < n; i++) {
    const cx = (i + 0.5) * cw, cy = h * 0.5;
    const dir = i % 2 ? 1 : -1;
    // Spiral tendril.
    let px = cx, py = cy;
    for (let k = 1; k <= 60; k++) {
      const a = k * 0.18 * dir;
      const r = (h * 0.42 * (60 - k)) / 60 + 2;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      f.line(px, py, x, y, Math.max(2, h * 0.035), 0.8);
      if (k % 9 === 0) f.ellipse(x + Math.cos(a + 1.2) * h * 0.06, y + Math.sin(a + 1.2) * h * 0.06, h * 0.06, h * 0.03, 0.9);
      px = x;
      py = y;
    }
    f.ellipse(cx, cy, h * 0.05, h * 0.05, 1);
    // Wave linking to the next cell.
    for (let k = 0; k < 20; k++) {
      const x0 = cx + (k / 20) * cw, x1 = cx + ((k + 1) / 20) * cw;
      f.line(x0, h * 0.5 + Math.sin((k / 20) * Math.PI * 2) * h * 0.38, x1, h * 0.5 + Math.sin(((k + 1) / 20) * Math.PI * 2) * h * 0.38, Math.max(2, h * 0.03), 0.6);
    }
  }
  f.rect(0, 0, w - 1, h * 0.04, 0.5);
  f.rect(0, h * 0.96, w - 1, h - 1, 0.5);
  f.blur(Math.max(1, Math.round(h / 100)));
  return f;
}

/** A procession of togate figures (adults, a few children), seamless in x. */
export function processionField(w: number, h: number, seed = 9): HeightField {
  const f = new HeightField(w, h, true);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  let x = 6;
  while (x < w - 6) {
    const child = rnd() < 0.12;
    const fh = h * (child ? 0.5 : 0.8 + rnd() * 0.1);
    const y0 = h * 0.06;
    const bw = fh * 0.17;
    // Toga: a tapering body with drapery folds, a head, a veiled or laurelled crown.
    for (let k = 0; k < 6; k++) f.line(x - bw * 0.7 + k * bw * 0.28, y0, x - bw * 0.35 + k * bw * 0.14, y0 + fh * 0.8, Math.max(2, bw * 0.3), 0.75 + (k % 2) * 0.15);
    f.ellipse(x, y0 + fh * 0.88, fh * 0.065, fh * 0.08, 1);
    if (rnd() < 0.4) f.line(x - fh * 0.08, y0 + fh * 0.9, x + fh * 0.08, y0 + fh * 0.9, 2, 0.7);
    // Arm across the chest (the sinus of the toga).
    f.line(x - bw * 0.6, y0 + fh * 0.62, x + bw * 0.5, y0 + fh * 0.5, Math.max(2, bw * 0.25), 0.95);
    x += fh * (child ? 0.16 : 0.22) + rnd() * h * 0.05;
  }
  f.rect(0, 0, w - 1, h * 0.05, 0.6);
  f.blur(Math.max(1, Math.round(h / 120)));
  return f;
}

function reliefs() {
  if (!acanthusMat) {
    acanthusMat = reliefMaterial(acanthusField(1024, 256), { ground: [168, 160, 146], relief: [248, 244, 234], noise: 0.05, strength: 7, roughness: 0.5, repeat: true });
    acanthusMat.name = 'ara-acanthus';
    // Painted ground behind the scrolls (subtle; the colours are conjectural).
    processionMat = reliefMaterial(processionField(1024, 200), { ground: [92, 118, 150], relief: [246, 240, 228], noise: 0.04, strength: 7, roughness: 0.5, repeat: true });
    processionMat.name = 'ara-procession';
  }
  return { acanthus: acanthusMat!, procession: processionMat! };
}

/** A relief quad on a wall face: x0..x1 × y0..y1 at z, facing −z (or +z with flip), UVs repeat per `rep` m. */
function reliefQuad(d: Draw, mat: THREE.Material, x0: number, x1: number, y0: number, y1: number, z: number, rep: number, flip = false) {
  const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * ((x1 - x0) / rep));
  if (!flip) g.rotateY(Math.PI);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, z);
  d.b.add(g, mat, d.m, { uv: 'keep', castShadow: false });
}

// ---------------------------------------------------------------- Mausoleum of Augustus

const RES_GESTAE = ['RERVM GESTARVM DIVI AVGVSTI', 'QVIBVS ORBEM TERRARVM', 'IMPERIO POPVLI ROMANI', 'SVBIECIT', 'ET INPENSARVM QVAS IN', 'REM PVBLICAM POPVLVMQVE', 'ROMANVM FECIT'];

function buildMausoleum(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const d = draw(ctx);
  const far = farDraw();
  const { w } = dims(ctx);
  const spots: Spot[] = [];
  const R = w / 2; // 27 m
  const S = ctx.S;
  const H = lm.height * S; // 25.2 m
  const drumH = 12 * S;
  const segs = detail === 'high' ? 64 : 32;
  const g = (x: number, z: number) => ctx.groundAt(x, z);
  // Plinth and the travertine drum with base moulding, a garland frieze band and the cornice.
  plinth(d, ctx, -R, -R, R, R, 0.02, 'travertine', false);
  d.cyl('travertine', 0, drumH / 2, 0, R, drumH, segs);
  d.cyl('travertine', 0, 0.35, 0, R + 0.35, 0.7, segs);
  d.cyl('marble', 0, drumH - 1.35, 0, R + 0.06, 0.9, segs);
  d.cyl('travertine', 0, drumH - 0.3, 0, R + 0.5, 0.6, segs);
  d.cyl('travertine', 0, drumH + 0.15, 0, R + 0.25, 0.3, segs);
  if (detail === 'high') {
    // Swags between bucrania on the frieze band.
    const n = 48;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = Math.cos(a) * (R + 0.12), z = Math.sin(a) * (R + 0.12);
      d.ellipsoid('marble', x, drumH - 1.2, z, 0.28, 0.22, 0.12, { ry: -a + Math.PI / 2, seg: [6, 4] });
      const a2 = ((i + 0.5) / n) * Math.PI * 2;
      d.geo(new THREE.TorusGeometry(1.0, 0.09, 4, 8, Math.PI), 'foliage_broad', Math.cos(a2) * (R + 0.14), drumH - 1.05, Math.sin(a2) * (R + 0.14), { rz: Math.PI, ry: -a2 + Math.PI / 2 });
    }
  }
  // Colliders: a ring of boxes for the drum (open at the door) and a solid core.
  const doorW = 2.8, doorH = 4.6, dromos = 7;
  const nc = 36;
  for (let i = 0; i < nc; i++) {
    const a0 = (i / nc) * Math.PI * 2, a1 = ((i + 1) / nc) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    if (Math.abs(Math.atan2(Math.sin(am + Math.PI / 2), Math.cos(am + Math.PI / 2))) < 0.09) continue;
    const r = R - 2.5;
    const f = d.at(Math.cos(am) * r, 0, Math.sin(am) * r, -am + Math.PI / 2);
    const chord = 2 * R * Math.sin(Math.PI / nc);
    f.solid(-chord / 2, -1, -2.5, chord / 2, drumH, 2.5);
  }
  d.solidCyl(0, drumH / 2, 0, R - dromos - 0.5, drumH);
  // The door and the dromos into the drum, closed by a bronze grille.
  const zf = -R;
  d.span('travertine', -doorW / 2 - 0.7, 0, zf - 0.35, -doorW / 2, doorH + 0.8, zf + 0.6);
  d.span('travertine', doorW / 2, 0, zf - 0.35, doorW / 2 + 0.7, doorH + 0.8, zf + 0.6);
  d.span('travertine', -doorW / 2 - 0.9, doorH, zf - 0.45, doorW / 2 + 0.9, doorH + 1.1, zf + 0.6);
  d.span('black', -doorW / 2, 0.02, zf + 0.62, doorW / 2, doorH, zf + dromos);
  d.span('paving_travertine', -doorW / 2, -0.2, zf - 0.4, doorW / 2, 0.03, zf + dromos);
  for (const sx of [-1, 1]) d.span('travertine', sx * doorW / 2, 0, zf, sx * (doorW / 2 + 0.6), doorH, zf + dromos, { collide: true });
  for (let k = 0; k < 9; k++) d.cyl('bronze', -doorW / 2 + 0.2 + k * ((doorW - 0.4) / 8), doorH / 2, zf + dromos - 0.4, 0.035, doorH, 5);
  d.span('bronze', -doorW / 2, doorH - 0.3, zf + dromos - 0.45, doorW / 2, doorH - 0.2, zf + dromos - 0.35);
  d.solid(-doorW / 2, 0, zf + dromos - 0.5, doorW / 2, doorH, zf + dromos - 0.3);
  inscription(d, ['IMP CAESAR DIVI F AVGVSTVS'], 0, doorH + 0.55, zf - 0.47, 3.6, 0.6);
  // The two bronze pillars with the Res Gestae, and the (FLAG) obelisks further out.
  for (const sx of [-1, 1]) {
    const x = sx * 4.2, z = zf - 1.6;
    d.box('travertine', x, 0.35, z, 1.9, 0.7, 1.9, { collide: true });
    d.box('bronze', x, 0.7 + 2.6, z, 1.5, 5.2, 1.5, { collide: true });
    d.box('bronze', x, 0.7 + 5.35, z, 1.7, 0.3, 1.7);
    inscriptionPanel(d.b, { lines: RES_GESTAE, width: 1.34, height: 4.4, style: 'bronze', sizes: [1, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8] }, mul(d.m, T(x, 0.7 + 2.6, z - 0.76)), { depth: 0.02, bodyMaterial: 'bronze' });
    obelisk(d.b, { height: 14.7 * S, hieroglyphs: false, detail, pedestal: 1.6 }, mul(d.m, T(sx * 9.5, 0, zf - 6)));
    far.box('plaster_ochre', sx * 9.5, 1.6 + 4.4, zf - 6, 0.9, 8.8, 0.9);
  }
  // Paved forecourt in front of the door, following the ground.
  for (let i = -3; i <= 3; i++) {
    for (let j = 0; j < 4; j++) {
      const x = i * 3.2, z = zf - 1.2 - j * 3.2 - 1.6;
      const y = g(x, z);
      d.span('paving_travertine', x - 1.6, y - 0.4, z - 1.6, x + 1.6, y + 0.04, z + 1.6);
    }
  }
  // The earth mound with its rings of cypresses, and the central drum carrying Augustus.
  const Rc = R * 0.34;
  const yTop = H - 5.6; // central drum top; the statue stands above
  const yMound = drumH + 0.3;
  const moundTop = yMound + (yTop - yMound) * 0.55;
  const prof: [number, number][] = [[R - 0.6, yMound], [R - 3.2, yMound + 0.6], [R * 0.72, yMound + (moundTop - yMound) * 0.45], [Rc + 2, moundTop], [Rc - 0.2, moundTop]];
  const lathe = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), segs);
  d.geo(lathe, 'grass');
  // A terrace wall partway up (the second ring wall of the concentric structure).
  const r2 = R * 0.72;
  d.cyl('travertine', 0, yMound + (moundTop - yMound) * 0.45 - 0.8, 0, r2, 1.8, segs, { open: true });
  const rings: [number, number, number][] = [[R - 4.2, yMound + 0.9, detail === 'high' ? 34 : 20], [(R * 0.72 + R - 4.2) / 2 - 1, yMound + (moundTop - yMound) * 0.3, detail === 'high' ? 28 : 16], [(Rc + 2 + r2) / 2, yMound + (moundTop - yMound) * 0.75, detail === 'high' ? 20 : 12]];
  for (const [r, y, n] of rings) {
    for (let i = 0; i < n; i++) {
      const a = ((i + (r % 1)) / n) * Math.PI * 2;
      cypress(d, Math.cos(a) * r, y - 0.2, Math.sin(a) * r, 9 + ((i * 7) % 5) * 0.6, detail);
    }
  }
  // Central drum: travertine with a cornice, the colossal bronze Augustus on a pedestal.
  d.cyl('travertine', 0, (moundTop + yTop) / 2 - 0.3, 0, Rc, yTop - moundTop + 0.6, segs);
  d.cyl('travertine', 0, yTop - 0.25, 0, Rc + 0.4, 0.5, segs);
  d.cyl('travertine', 0, yTop - 1.4, 0, Rc + 0.15, 0.3, segs);
  d.box('marble', 0, yTop + 0.6, 0, 2.6, 1.2, 2.6);
  armoredEmperor(d.b, mul(d.m, TRS(0, yTop + 1.2, 0, 0, 0, 0, 3.0)), { material: 'bronze', detail, plinth: false });
  // Sacred grove round the base (poplars/cypresses in a ring, the south approach left open).
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + 0.08;
    if (Math.sin(a) < -0.75) continue;
    const r = R + 7;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (i % 3 === 0) tree(ctx, d, 'umbrella_pine', x, g(x, z), z, 12);
    else tree(ctx, d, 'cypress', x, g(x, z), z, 12);
  }
  spots.push(
    spot(`${lm.id}:door`, 'door', 0, 0.03, zf + dromos - 1.2, 0),
    spot(`${lm.id}:resgestae`, 'inscription', -4.2, g(-4.2, zf - 3.2), zf - 3.2, 0),
    spot(`${lm.id}:resgestae2`, 'inscription', 4.2, g(4.2, zf - 3.2), zf - 3.2, 0),
    spot(`${lm.id}:custodian`, 'npc', 2.2, g(2.2, zf - 1), zf - 1, Math.PI),
    spot(`${lm.id}:forecourt`, 'vista', 0, g(0, zf - 12), zf - 12, 0),
    spot(`${lm.id}:offering`, 'shrine', -1.6, 0.03, zf - 0.8, 0),
  );
  // Far: the drum, a cone for the mound, the central drum.
  far.cyl('travertine', 0, drumH / 2, 0, R, drumH, 16);
  far.cyl('grass', 0, (yMound + moundTop) / 2, 0, R - 1, moundTop - yMound, 16, { rTop: Rc + 2 });
  far.cyl('travertine', 0, (moundTop + yTop) / 2, 0, Rc, yTop - moundTop, 12);
  far.box('bronze', 0, yTop + 2.5, 0, 1.2, 5, 1.2);
  return finish(lm.id, d, spots, far, 1000);
}

// ---------------------------------------------------------------- Ara Pacis

function buildAraPacis(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const d = draw(ctx);
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  const mats = reliefs();
  // Podium with the main flight on the front (west, local −z): the enclosure fills the rest.
  const P = 1.32; // 6 risers
  const stairL = flightLength(P);
  const z0 = -dd / 2 + stairL; // front face of the enclosure walls
  const x0 = -w / 2, x1 = w / 2, z1 = dd / 2;
  plinth(d, ctx, x0 - 0.4, -dd / 2, x1 + 0.4, z1 + 0.4, 0.02, 'travertine');
  d.span('marble', x0 - 0.3, 0, z0 - 0.3, x1 + 0.3, P, z1 + 0.3, { collide: true });
  flight(d, 0, -dd / 2, 3.4, 0, P, 'marble');
  const wallH = 4.6 * ctx.S + 0.6; // ≈ 3.4 m (a little above scale so the doorway clears 2.6 m)
  const t = 0.4;
  const doorW = 2.2, doorH = 2.7;
  const y0 = P;
  // Walls: front and back pierced by the doors; flanks solid. Colliders by spans.
  for (const z of [z0, z1 - t]) {
    d.span('marble', x0, y0, z, -doorW / 2, y0 + wallH, z + t, { collide: true });
    d.span('marble', doorW / 2, y0, z, x1, y0 + wallH, z + t, { collide: true });
    d.span('marble', -doorW / 2, y0 + doorH, z, doorW / 2, y0 + wallH, z + t);
  }
  for (const x of [x0, x1 - t]) d.span('marble', x, y0, z0, x + t, y0 + wallH, z1, { collide: true });
  // Pilasters at the corners and door jambs, a crowning cornice.
  for (const x of [x0, x1]) for (const z of [z0, z1]) d.box('marble', x, y0 + wallH / 2, z, 0.5, wallH, 0.5);
  d.span('marble', x0 - 0.25, y0 + wallH, z0 - 0.25, x1 + 0.25, y0 + wallH + 0.3, z1 + 0.25);
  d.span('stucco_painted', x0 - 0.26, y0 + wallH - 0.08, z0 - 0.26, x1 + 0.26, y0 + wallH, z1 + 0.26);
  // Reliefs: acanthus in the lower zone all round, the procession on the long sides, panels at the doors.
  const yA0 = y0 + 0.25, yA1 = y0 + wallH * 0.46, yP0 = yA1 + 0.12, yP1 = y0 + wallH - 0.2;
  const zF = z0 - 0.015, zB = z1 + 0.015;
  // Metres per texture repeat, keeping the textures' aspect (1024 × 256 and 1024 × 200 px).
  const repA = 4 * (yA1 - yA0), repP = 5.12 * (yP1 - yP0);
  for (const [a, b] of [[x0 + 0.25, -doorW / 2 - 0.05], [doorW / 2 + 0.05, x1 - 0.25]] as const) {
    reliefQuad(d, mats.acanthus, a, b, yA0, yA1, zF, repA);
    reliefQuad(d, mats.acanthus, a, b, yA0, yA1, zB, repA, true);
    // Aeneas sacrificing / Tellus with her twins: figured panels either side of each door.
    reliefQuad(d, mats.procession, a, b, yP0, yP1, zF, repP);
    reliefQuad(d, mats.procession, a, b, yP0, yP1, zB, repP, true);
  }
  // Long sides (the flanks): build in each side's own frame so the relief faces outward.
  for (const sx of [-1, 1]) {
    const f = d.at(sx * (w / 2 + 0.015), 0, (z0 + z1) / 2, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
    const L = z1 - z0 - 0.5;
    reliefQuad(f, mats.acanthus, -L / 2, L / 2, yA0, yA1, 0, repA);
    reliefQuad(f, mats.procession, -L / 2, L / 2, yP0, yP1, 0, repP);
  }
  // Meander band between the zones.
  d.span('stucco_painted', x0 - 0.03, yA1, z0 - 0.03, x1 + 0.03, yA1 + 0.12, z1 + 0.03);
  // Inside: garlands hung from bucrania, the altar on its stepped base.
  const ix0 = x0 + t, ix1 = x1 - t, iz0 = z0 + t, iz1 = z1 - t;
  d.span('marble', ix0, y0 - 0.05, iz0, ix1, y0 + 0.02, iz1);
  if (detail === 'high') {
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const z = iz0 + 0.5 + k * ((iz1 - iz0 - 1) / 3);
        d.geo(new THREE.TorusGeometry(0.45, 0.07, 4, 8, Math.PI), 'foliage_broad', sx * (ix1 - 0.05), y0 + wallH * 0.62, z, { rz: Math.PI, ry: Math.PI / 2 });
      }
    }
  }
  const az = (iz0 + iz1) / 2 + 0.3;
  d.span('marble', -1.7, y0, az - 1.2, 1.7, y0 + 0.22, az + 1.1, { collide: true });
  d.span('marble', -1.45, y0 + 0.22, az - 0.95, 1.45, y0 + 0.44, az + 1.0, { collide: true });
  altar(d, 0, y0 + 0.44, az + 0.2, 2.2, 1.1, 0.95, 'marble');
  spots.push(
    spot(`${lm.id}:reliefs`, 'inscription', -w / 2 - 1.2, 0.02, 0, Math.PI / 2),
    spot(`${lm.id}:stair`, 'door', 0, 0.02, -dd / 2 - 0.8, 0),
    spot(`${lm.id}:altar`, 'shrine', 0, y0, az - 1.8, 0),
    spot(`${lm.id}:priest`, 'npc', 0.8, y0, az - 1.4, Math.PI),
  );
  return finish(lm.id, d, spots);
}

// ---------------------------------------------------------------- Horologium Augusti

const ZODIAC = ['ΚΡΙΟΣ', 'ΤΑΥΡΟΣ', 'ΔΙΔΥΜΟΙ', 'ΚΑΡΚΙΝΟΣ', 'ΛΕΩΝ', 'ΠΑΡΘΕΝΟΣ'];

function buildHorologium(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const d = draw(ctx);
  const far = farDraw();
  const spots: Spot[] = [];
  const S = ctx.S;
  const shaft = 21.8 * S;
  const ped = lm.height * S - shaft - 1.0;
  const g = (x: number, z: number) => ctx.groundAt(x, z);
  plinth(d, ctx, -2.4, -2.4, 2.4, 2.4, 0.02, 'travertine');
  obelisk(d.b, { height: shaft, hieroglyphs: true, pedestal: ped, pedestalMaterial: 'travertine', detail, gildedTip: false }, d.m);
  d.ellipsoid('gilded_bronze', 0, ped + 0.5 + shaft + 0.45, 0, 0.5, 0.5, 0.5, { seg: [12, 8] });
  d.cyl('gilded_bronze', 0, ped + 0.5 + shaft + 0.02, 0, 0.06, 0.4, 6);
  inscription(d, ['IMP CAESAR DIVI F AVGVSTVS', 'PONTIFEX MAXIMVS', 'AEGVPTO IN POTESTATEM', 'POPVLI ROMANI REDACTA', 'SOLI DONVM DEDIT'], 0, ped * 0.55 + 0.3, -(shaft / 9.5) * 0.9 - 0.26, shaft / 9.5 * 1.4, ped * 0.5);
  // The meridian: a travertine pavement running north (local +z: the gnomon faces south), the bronze
  // line down its middle with day marks, and Greek month/zodiac labels in bronze letters.
  const L = 58; // ≈ 100 m real
  const pw = 9;
  const n = Math.round(L / 4);
  for (let i = 0; i < n; i++) {
    const z = 3 + (i + 0.5) * (L / n);
    const y = g(0, z);
    d.span('paving_travertine', -pw / 2, y - 0.4, z - L / n / 2, pw / 2, y + 0.05, z + L / n / 2);
    d.span('gilded_bronze', -0.06, y + 0.05, z - L / n / 2, 0.06, y + 0.065, z + L / n / 2);
    for (let k = 0; k < 4; k++) {
      const zz = z - L / n / 2 + (k + 0.5) * (L / n / 4);
      d.span('gilded_bronze', -0.7, y + 0.05, zz - 0.03, 0.7, y + 0.065, zz + 0.03);
    }
  }
  if (detail === 'high') {
    ZODIAC.forEach((name, i) => {
      const z = 8 + i * ((L - 10) / ZODIAC.length);
      const y = g(0, z) + 0.07;
      for (const sx of [-1, 1]) {
        inscriptionPanel(d.b, { lines: [name], width: 2.4, height: 0.5, style: 'bronze', ground: '#d3c8b0', interpunct: false }, mul(d.m, TRS(sx * 2.2, y, z, -Math.PI / 2, 0, 0)), { depth: 0.01, bodyMaterial: 'paving_travertine' });
      }
    });
  }
  spots.push(
    spot(`${lm.id}:inscription`, 'inscription', 0, 0.02, -3.6, 0),
    spot(`${lm.id}:meridian`, 'vista', 1.2, g(1.2, 20), 20, Math.PI),
    spot(`${lm.id}:astrologer`, 'npc', -2.8, g(-2.8, 12), 12, Math.PI / 2),
  );
  far.box('travertine', 0, ped / 2, 0, shaft / 6, ped, shaft / 6);
  far.cyl('plaster_ochre', 0, ped + shaft / 2, 0, shaft / 18, shaft, 4, { rTop: shaft / 28 });
  return finish(lm.id, d, spots, far, 800);
}

export const builders: LandmarkBuilder[] = [
  { handles: ['mausoleum-augustus'], build: buildMausoleum },
  { handles: ['ara-pacis'], build: buildAraPacis },
  { handles: ['horologium-augusti'], build: buildHorologium },
];

export { V, type Detail };
