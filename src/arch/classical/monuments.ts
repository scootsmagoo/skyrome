/**
 * Free-standing monuments: Egyptian obelisks (brought to Rome by Augustus — the Circus Maximus
 * and the Campus Martius sundial) and the honorific column with a helical frieze (Trajan's
 * Column, dedicated in May AD 113: 100 Roman feet of column on a pedestal, 23 turns of frieze,
 * the emperor's statue on top).
 *
 * Frames: on the ground at the centre; the obelisk's inscribed face, the column's door and
 * inscription face −z.
 */
import * as THREE from 'three';
import type { MeshBuilder } from '../../gfx/MeshBuilder';
import type { MaterialId } from '../../gfx/materialIds';
import { ProfileBuilder, T, gridSurface, lathe, linspace, mul, sweep, tube, type V2 } from '../common/geom';
import { inscriptionPanel } from '../common/inscription';
import { friezeStrip, hieroglyphFace, reliefMaterial } from '../common/relief';
import { stairs, stepCount } from '../common/stairs';
import { wall } from '../common/walls';
import { doricCapital } from './capitals';
import { entasisRadius, type Detail } from './orders';
import { armoredEmperor } from './statues';

// ---------------------------------------------------------------- obelisk

export interface ObeliskSpec {
  /** Shaft height including the pyramidion (Montecitorio: 21.8 m real). */
  height: number;
  /** Base width of the shaft (default height / 9.5). */
  base?: number;
  hieroglyphs?: boolean;
  /** Bronze-capped pyramidion (default true). */
  gildedTip?: boolean;
  /** Pedestal height (default 0.22 × height). */
  pedestal?: number;
  pedestalMaterial?: MaterialId;
  detail?: Detail;
}

let obeliskMaterial: THREE.MeshStandardMaterial | null = null;

/** Red Aswan granite with carved hieroglyph columns. */
function graniteGlyphs(): THREE.MeshStandardMaterial {
  if (!obeliskMaterial) {
    obeliskMaterial = reliefMaterial(hieroglyphFace(128, 1024, 30), { ground: [176, 112, 102], relief: [120, 76, 70], noise: 0.18, strength: 2.4, roughness: 0.55 });
    obeliskMaterial.name = 'obelisk-granite';
  }
  return obeliskMaterial;
}

export function obelisk(b: MeshBuilder, spec: ObeliskSpec, at?: THREE.Matrix4) {
  const m = at ?? new THREE.Matrix4();
  const H = spec.height;
  const w0 = spec.base ?? H / 9.5;
  const w1 = w0 * 0.68;
  const tipH = w1 * 0.9;
  const shaftH = H - tipH;
  const P = spec.pedestal ?? 0.22 * H;
  const pmat = spec.pedestalMaterial ?? 'marble';
  const detail = spec.detail ?? 'high';
  // Pedestal: a moulded block on two steps.
  const { count, rise } = stepCount(0.5, 0.25);
  const pw = w0 * 1.9;
  for (let i = 0; i < count; i++) {
    const s = pw + (count - i) * 0.7;
    b.box(pmat, s, rise, s, mul(m, T(0, i * rise + rise / 2, 0)), { collide: true });
  }
  const y0 = count * rise;
  b.box(pmat, pw, P, pw, mul(m, T(0, y0 + P / 2, 0)), { collide: true });
  const n = detail === 'high' ? 3 : 1;
  const sq = (hw: number, y: number) => [new THREE.Vector3(-hw, y, -hw), new THREE.Vector3(hw, y, -hw), new THREE.Vector3(hw, y, hw), new THREE.Vector3(-hw, y, hw)];
  const base = new ProfileBuilder(-0.02, 0).to(0.12, 0).up(0.15).cymaReversa(-0.1, 0.14, n).to(-0.02, 0.29).build();
  b.add(sweep(base, sq(pw / 2, y0), { closed: true }), pmat, m);
  const crown = new ProfileBuilder(-0.02, -0.3).to(0, -0.3).cymaReversa(0.08, 0.12, n).up(0.04).out(0.06).up(0.1).to(-0.02, 0).build();
  b.add(sweep(crown, sq(pw / 2, y0 + P), { closed: true }), pmat, m);
  // Shaft: four tapered faces with hieroglyphs (UVs 0..1 per face), then the pyramidion.
  const ys = y0 + P;
  const faceMat: THREE.Material | MaterialId = (spec.hieroglyphs ?? true) && typeof document !== 'undefined' ? graniteGlyphs() : 'porphyry';
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const rot = (x: number, z: number): [number, number] => [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];
    // face toward −z before rotation: bottom edge at z = −w0/2, top at z = −w1/2
    const A = [...rot(-w0 / 2, -w0 / 2)];
    const B = [...rot(w0 / 2, -w0 / 2)];
    const C = [...rot(w1 / 2, -w1 / 2)];
    const D = [...rot(-w1 / 2, -w1 / 2)];
    const slope = (w0 - w1) / 2 / shaftH;
    const nn = new THREE.Vector3(0, slope, -1).normalize();
    const [nx, nz] = rot(nn.x, nn.z);
    // Viewed from outside (−z), +x is on the viewer's left: wind A(−x) → D → C → B so it faces out.
    const quad: [number[], number, number, number][] = [
      [A, ys, 1, 0],
      [D, ys + shaftH, 1, 1],
      [C, ys + shaftH, 0, 1],
      [A, ys, 1, 0],
      [C, ys + shaftH, 0, 1],
      [B, ys, 0, 0],
    ];
    for (const [p, y, u, v] of quad) {
      pos.push(p[0], y, p[1]);
      nor.push(nx, nn.y, nz);
      uv.push(u, v);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  b.add(g, faceMat, m, { uv: 'keep' });
  const tip = new THREE.ConeGeometry((w1 / 2) * Math.SQRT2, tipH, 4, 1);
  tip.rotateY(Math.PI / 4);
  tip.translate(0, ys + shaftH + tipH / 2, 0);
  b.add(tip, spec.gildedTip === false ? 'porphyry' : 'gilded_bronze', m);
  return { height: ys + H };
}

// ---------------------------------------------------------------- honorific column

export interface HonorificColumnSpec {
  /** Column height (base + shaft + capital). Trajan's Column: 29.78 m (100 Roman feet). */
  height: number;
  /** Lower shaft diameter (Trajan: 3.69 m). Default height / 8.1. */
  D?: number;
  /** Number of frieze turns (Trajan: 23). 0 = plain shaft. */
  turns?: number;
  material?: MaterialId;
  /** Pedestal inscription lines. */
  inscription?: string[];
  statue?: boolean;
  detail?: Detail;
}

const TRAJAN = ['Senatus Populusque Romanus', 'Imp Caesari Divi Nervae F Nervae', 'Traiano Aug Germ Dacico Pontif', 'Maximo Trib Pot XVII Imp VI Cos VI P P', 'Ad Declarandum Quantae Altitudinis', 'Mons et Locus Tantis Operibus Sit Egestus'];

let friezeMats: { near: THREE.MeshStandardMaterial; far: THREE.MeshStandardMaterial } | null = null;

export function honorificColumn(b: MeshBuilder, spec: HonorificColumnSpec, at?: THREE.Matrix4) {
  const m = at ?? new THREE.Matrix4();
  const Hc = spec.height;
  const D = spec.D ?? Hc / 8.1;
  const mat = spec.material ?? 'marble';
  const detail = spec.detail ?? 'high';
  const hi = detail === 'high';
  const segs = hi ? 48 : 16;
  // Pedestal: a cube ≈ 1.5 D wide and 1.45 D high on a plinth, with a door and the inscription.
  const pw = D * 1.5;
  const ph = D * 1.45;
  const n = hi ? 3 : 1;
  const sq = (hw: number, y: number) => [new THREE.Vector3(-hw, y, -hw), new THREE.Vector3(hw, y, -hw), new THREE.Vector3(hw, y, hw), new THREE.Vector3(-hw, y, hw)];
  const plinthH = 0.3;
  b.box(mat, pw + 0.5, plinthH, pw + 0.5, mul(m, T(0, plinthH / 2, 0)), { collide: true });
  // Front wall with a door; other three faces solid.
  const doorW = Math.min(1.4, pw * 0.22);
  const doorH = Math.min(2.4, ph * 0.42);
  wall(b, { length: pw, height: ph, thickness: 0.6, material: mat, openings: [{ kind: 'door', x: pw / 2, width: doorW, height: doorH, leaves: 'closed', leafMaterial: 'bronze' }], detail, collide: true }, mul(m, T(-pw / 2, plinthH, -pw / 2 + 0.3)));
  b.box(mat, pw, ph, pw - 0.6, mul(m, T(0, plinthH + ph / 2, 0.3)), { collide: true });
  const base = new ProfileBuilder(-0.02, 0).to(0.16, 0).up(0.2).torus(0.16, 0.06, n).in(0.06).cymaReversa(-0.08, 0.14, n).to(-0.02, 0.5).build();
  b.add(sweep(base, sq(pw / 2, plinthH), { closed: true }), mat, m);
  const crown = new ProfileBuilder(-0.02, -0.45).to(0, -0.45).cymaReversa(0.08, 0.14, n).up(0.05).out(0.1).up(0.18).ovolo(0.08, 0.08, n).to(-0.02, 0).build();
  b.add(sweep(crown, sq(pw / 2, plinthH + ph), { closed: true }), mat, m);
  // Inscription tablet above the door.
  inscriptionPanel(b, { lines: spec.inscription ?? TRAJAN, width: pw * 0.62, height: ph * 0.36, style: 'carved', sizes: [1, 0.82, 0.82, 0.82, 0.82, 0.82], border: true, monumental: true }, mul(m, T(0, plinthH + doorH + 0.35 + ph * 0.18 + 0.15, -pw / 2 - 0.03)), { depth: 0.08 });
  // Eagles at the corners of the pedestal top (stylised blocks).
  const y0 = plinthH + ph;
  if (hi) {
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const e = new THREE.SphereGeometry(0.22, 8, 6);
        e.scale(1, 1.2, 0.8);
        e.translate(sx * (pw / 2 - 0.25), y0 + 0.25, sz * (pw / 2 - 0.25));
        b.add(e, mat, m);
      }
  }
  // Column base: a large laurel torus over a plinth.
  const baseH = 0.36 * D;
  const tp = new ProfileBuilder(0.68 * D, y0).up(0.08 * D).torus(0.2 * D, 0.12 * D, hi ? 8 : 3).in(0.06 * D).up(0.03 * D).to(0.5 * D, y0 + baseH).build();
  b.add(lathe(tp, { segments: segs }), mat, m);
  if (hi) {
    // laurel leaves: little bumps around the torus
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const l = new THREE.SphereGeometry(0.07 * D, 5, 4);
      l.scale(0.5, 1, 0.35);
      l.rotateZ(0.6);
      l.rotateY(a);
      l.translate(Math.sin(a) * 0.8 * D, y0 + 0.18 * D, Math.cos(a) * 0.8 * D);
      b.add(l, mat, m);
    }
  }
  // Shaft with the helical frieze.
  const capH = 0.42 * D;
  const ys = y0 + baseH;
  const shaftH = Hc - baseH - capH;
  const turns = spec.turns ?? 23;
  const topRatio = 0.87;
  // The frieze is one long strip (friezeStrip) wound round the shaft. The shaft is built in
  // helical bands (s = band coordinate, a = angle) so each band's UVs run continuously along
  // the helix: u advances 1/STRIP_TURNS per turn, a non-integer, so scenes never stack up in
  // vertical lines and the 4096 px strip only comes round again 3.37 turns later.
  const STRIP_TURNS = 3.37;
  let farMat: THREE.Material | MaterialId = mat;
  let nearMat: THREE.Material | MaterialId = mat;
  if (turns > 0 && typeof document !== 'undefined') {
    if (!friezeMats) {
      // Darker ground between figures (ancient reliefs were also painted) and deep relief.
      const far = reliefMaterial(friezeStrip(4096, 128, 113), { ground: [192, 184, 168], relief: [242, 236, 224], noise: 0.06, strength: 6, roughness: 0.55, repeat: true });
      far.name = 'column-frieze';
      // The lowest turns are seen close up from the street: carve them deeper still.
      const near = far.clone();
      near.normalScale.setScalar(1.6);
      near.name = 'column-frieze-near';
      friezeMats = { near, far };
    }
    farMat = friezeMats.far;
    nearMat = friezeMats.near;
  }
  const nA = hi ? 64 : 20;
  const ths = linspace(0, Math.PI * 2, nA);
  const tAt = (a: number, sb: number) => Math.min(1, Math.max(0, (sb + a / (Math.PI * 2)) / Math.max(1, turns)));
  const P = (a: number, sb: number, out: THREE.Vector3, lift = 0) => {
    const t = tAt(a, sb);
    const r = entasisRadius(D, topRatio, t) + lift;
    return out.set(r * Math.sin(a), ys + t * shaftH, r * Math.cos(a));
  };
  if (turns > 0) {
    const sub = linspace(0, 1, hi ? 3 : 1);
    for (let n = -1; n < turns; n++) {
      const band = gridSurface(ths, sub.map((k) => n + k), (a, sb, out) => P(a, sb, out), { uv: (a, sb) => [(n + a / (Math.PI * 2)) / STRIP_TURNS, sb - n] });
      // Radial normals: the clamped rows at the shaft's ends would otherwise get degenerate ones.
      const pos = band.getAttribute('position');
      const nor = band.getAttribute('normal');
      for (let i = 0; i < pos.count; i++) {
        const l = Math.hypot(pos.getX(i), pos.getZ(i)) || 1;
        nor.setXYZ(i, pos.getX(i) / l, 0, pos.getZ(i) / l);
      }
      const near = (Math.max(0, n) / turns) * shaftH < 4.5;
      b.add(band, near ? nearMat : farMat, m, { uv: 'keep' });
    }
    if (hi) {
      // The raised fillet dividing the bands, one continuous helix.
      const path: THREE.Vector3[] = [];
      const steps = Math.ceil(turns * 48);
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * turns * Math.PI * 2;
        path.push(P(a % (Math.PI * 2), Math.floor(a / (Math.PI * 2)), new THREE.Vector3(), D * 0.004));
      }
      b.add(tube(path, D * 0.009, 4, false), mat, m);
    }
  } else {
    const shaft = gridSurface(ths, linspace(0, 1, hi ? 12 : 4), (a, t, out) => {
      const r = entasisRadius(D, topRatio, t);
      return out.set(r * Math.sin(a), ys + t * shaftH, r * Math.cos(a));
    });
    b.add(shaft, mat, m);
  }
  // Doric capital (echinus + abacus) and the cylindrical statue base with its small dome.
  const yc = ys + shaftH;
  for (const p of doricCapital({ D, d: D * topRatio, height: capH, detail })) {
    p.geometry.translate(0, yc, 0);
    b.add(p.geometry, mat, m);
  }
  const yTop = yc + capH;
  const sb = new ProfileBuilder(0.45 * D, yTop).up(0.08 * D).in(0.05 * D).up(0.3 * D).out(0.05 * D).up(0.06 * D).ovolo(0.04 * D, 0.08 * D, 3).to(0, yTop + 0.52 * D).build();
  b.add(lathe(sb, { segments: segs }), mat, m);
  let height = yTop + 0.52 * D;
  if (spec.statue ?? true) {
    const sc = (D * 1.25) / 1.85;
    armoredEmperor(b, mul(m, T(0, height, 0)), { material: 'gilded_bronze', scale: sc, detail, plinth: false, spear: true });
    height += 2.05 * sc;
  }
  // Collider for the shaft.
  const c = new THREE.Vector3(0, ys + shaftH / 2, 0).applyMatrix4(m);
  b.collider({ kind: 'cylinder', center: c, halfHeight: shaftH / 2, radius: D / 2 });
  return { height };
}

export type { V2 };
