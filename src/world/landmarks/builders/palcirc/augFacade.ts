/**
 * The Domus Augustana's great curved facade over the Circus Maximus (palcirc crew), the view the
 * player has walking up the Circus valley at dawn (GDD §2.1).
 *
 * In the Augustana's local frame (facade toward −z, y = 0 = the lower-peristyle level on the pad):
 * a concave, segmental front whose chord lies on z = `front`, carried on a three-storey
 * substructure that rises from the street (tabernae in rusticated travertine arches, Ionic arched
 * windows, Corinthian pilasters, a marble cornice and a balustrade with gilded statues), crowned by
 * a two-storey colonnade of giallo antico and pavonazzetto columns in front of a curved gallery,
 * and framed by two tall pavilions with pediments. The terrain ramp at the pad's edge is hidden
 * inside the substructure, so the whole facade stands clear from the street.
 *
 * Domitianic palace exteriors were brick-faced concrete under stucco and marble ("white marble
 * outside", architecture.md §3.24); the colonnade's coloured marbles follow the palace's interiors.
 */
import * as THREE from 'three';
import { Draw } from '../../../../arch/fabric/draw';
import { column } from '../../../../arch/classical/column';
import { velum } from '../../../../arch/fabric/awnings';
import { buildPlaza } from '../../../../arch/fabric/streets';
import { placeProp, statueFigure } from '../../../../arch/props/props';
import { Rng } from '../../../../core/Rng';
import { MeshBuilder } from '../../../../gfx/MeshBuilder';
import type { LandmarkContext } from '../../types';
import type { Lamp } from './capenaParts';
import { facing, instanced } from './runtime';
import { archBandLite, archDoorWall, archWindowWall, rectHoleWall, ringSector } from './shapes';
import { Spots, gableRoof, groundRange, halfColumn } from './util';
import { openings } from './palace';

/** Plan of the facade (pure arithmetic, tested). */
export interface AugFacadePlan {
  front: number;
  /** Half chord of the concave front, its depth (sagitta), the circle's radius and centre z. */
  c: number;
  sag: number;
  R: number;
  zc: number;
  /** Angles (from +x toward +z) where the arc meets the chord. */
  a0: number;
  a1: number;
  /** Colonnade radius, gallery back-wall radius. */
  Rc: number;
  Rb: number;
  /** Pavilions on top of the substructure at |x| ∈ [pav, hw]. */
  pav: number;
  hw: number;
  /** Facade bay width on the arc. */
  bay: number;
  bays: { x: number; z: number; nx: number; nz: number; w: number; kind: 'arc' | 'wing' }[];
}

export function augFacadePlan(front = -80, hw = 21.6, c = 14.5, sag = 8): AugFacadePlan {
  const R = (c * c + sag * sag) / (2 * sag);
  const zc = front + sag - R;
  const a0 = Math.asin((front - zc) / R);
  const a1 = Math.PI - a0;
  const n = Math.max(3, Math.round((R * (a1 - a0)) / 4.4));
  const da = (a1 - a0) / n;
  const bays: AugFacadePlan['bays'] = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (i + 0.5) * da;
    const rc = R * Math.cos(da / 2);
    // The facade faces the circle's centre (it is concave): outward normal = toward the centre.
    bays.push({ x: rc * Math.cos(a), z: zc + rc * Math.sin(a), nx: -Math.cos(a), nz: -Math.sin(a), w: 2 * R * Math.sin(da / 2), kind: 'arc' });
  }
  const w = bays[0].w;
  for (const s of [-1, 1]) bays.push({ x: s * (c + w / 2), z: front, nx: 0, nz: -1, w, kind: 'wing' });
  return { front, c, sag, R, zc, a0, a1, Rc: R + 0.9, Rb: R + 4.5, pav: 16.3, hw, bay: w, bays };
}

/** z of the facade's outer face at x (the arc between ±c, the chord outside). */
export function augFaceZ(p: AugFacadePlan, x: number): number {
  if (Math.abs(x) >= p.c) return p.front;
  return p.zc + Math.sqrt(p.R * p.R - x * x);
}

const T = 1.2; // facade wall thickness
const ROOM_D = 3.8; // depth of the tabernae behind the arches
const ROOM_H = 4.3; // their vault crown

interface Storeys {
  H: number;
  hA: number;
  hB: number;
  hC: number;
}

/** One facade bay, three storeys, origin at the street in the bay frame (face z = 0 facing −z). */
function facadeBay(w: number, s: Storeys, hi: boolean): MeshBuilder {
  const b = new MeshBuilder();
  const d = new Draw(b);
  const { H, hA, hB, hC } = s;
  const spanA = 3.0;
  const springA = ROOM_H - spanA / 2;
  // ------------------------------------------------ storey A: rusticated travertine arcade
  d.geo(archDoorWall(w, hA - 0.9, spanA, springA, T, hi ? 8 : 5), 'travertine');
  d.geo(archBandLite(spanA / 2, spanA / 2 + 0.45, springA, 0.1, hi ? 8 : 5), 'travertine');
  d.box('travertine', 0, springA + spanA / 2 + 0.3, -0.13, 0.5, 0.75, 0.26);
  for (const sx of [-1, 1]) d.box('travertine', sx * (spanA / 2 + 0.3), springA - 0.1, -0.08, 0.7, 0.24, 0.16);
  if (hi) {
    // Channelled joints on the piers: proud courses every 0.55 m.
    for (let y = 0.55; y < springA - 0.2; y += 0.55) for (const sx of [-1, 1]) d.box('travertine', sx * (spanA / 2 + (w / 2 - spanA / 2) / 2), y, -0.05, w / 2 - spanA / 2 - 0.06, 0.4, 0.1);
  }
  // Tuscan pilaster on the bay edge, the entablature band over the arcade.
  d.box('travertine', -w / 2, (hA - 0.9) / 2, -0.12, 0.85, hA - 0.9, 0.24);
  d.box('travertine', -w / 2, 0.2, -0.16, 1.0, 0.4, 0.32);
  d.box('travertine', 0, hA - 0.6, -0.15, w + 0.02, 0.6, 0.3);
  d.box('travertine', 0, hA - 0.12, -0.3, w + 0.02, 0.24, 0.6);
  // ------------------------------------------------ storey B: arched windows between Ionic half-columns
  const yB = hA;
  const plinth = 0.9;
  d.box('travertine', 0, yB + plinth / 2, -0.06, w + 0.02, plinth, 0.12 + 0.0);
  d.box('plaster_white', 0, yB + plinth / 2, T / 2, w + 0.02, plinth, T);
  const spanB = 2.0;
  const topB = hB - 0.85;
  const springB = topB - plinth - spanB / 2 - 0.55;
  d.geo(archWindowWall(w, topB - plinth, spanB, 0.0001, springB, T, hi ? 8 : 5), 'plaster_white', 0, yB + plinth, 0);
  d.poly('black', [{ x: -spanB / 2, y: yB + plinth, z: 0.9 }, { x: -spanB / 2, y: yB + topB - 0.4, z: 0.9 }, { x: spanB / 2, y: yB + topB - 0.4, z: 0.9 }, { x: spanB / 2, y: yB + plinth, z: 0.9 }], { doubleSided: true });
  d.geo(archBandLite(spanB / 2, spanB / 2 + 0.22, yB + plinth + springB, 0.06, hi ? 8 : 5), 'marble');
  // Balustrade in the window.
  d.box('marble', 0, yB + plinth + 0.5, 0.25, spanB, 1.0, 0.2);
  // Ionic half-column on a pedestal at the bay edge.
  d.box('marble', -w / 2, yB + plinth / 2, -0.24, 0.8, plinth, 0.48);
  halfColumn(d, 'marble', -w / 2, yB + plinth, 0.52, topB - plinth, 'ionic');
  d.box('marble', 0, yB + topB + 0.25, -0.18, w + 0.02, 0.5, 0.36);
  d.box('marble', 0, yB + hB - 0.18, -0.34, w + 0.02, 0.36, 0.68);
  d.box('plaster_white', 0, yB + topB + 0.43, T / 2, w + 0.02, hB - topB - 0.43, T);
  // ------------------------------------------------ storey C: windows under hoods, Corinthian pilasters
  const yC = hA + hB;
  const topC = hC - 1.3;
  d.geo(rectHoleWall(w, topC, [[0, 1.0, 1.15, 2.0]], T), 'plaster_white', 0, yC, 0);
  d.poly('black', [{ x: -0.58, y: yC + 1.0, z: 0.85 }, { x: -0.58, y: yC + 3.0, z: 0.85 }, { x: 0.58, y: yC + 3.0, z: 0.85 }, { x: 0.58, y: yC + 1.0, z: 0.85 }], { doubleSided: true });
  d.box('marble', 0, yC + 0.94, -0.1, 1.5, 0.12, 0.2);
  d.box('marble', 0, yC + 3.18, -0.14, 1.6, 0.3, 0.28);
  if (hi) d.tris('marble', [-0.8, yC + 3.33, -0.12, 0.8, yC + 3.33, -0.12, 0, yC + 3.72, -0.12]);
  d.box('marble', -w / 2, yC + topC / 2, -0.08, 0.62, topC, 0.16);
  d.box('marble', -w / 2, yC + topC - 0.3, -0.12, 0.78, 0.6, 0.24);
  // Main cornice (frieze, dentil band, corona) and the balustrade on the terrace edge.
  d.box('marble', 0, yC + topC + 0.25, T / 2 - 0.05, w + 0.02, 0.5, T + 0.1);
  if (hi) d.box('marble', 0, yC + topC + 0.62, -0.18, w + 0.02, 0.24, 0.36);
  d.box('marble', 0, H - 0.25, (T - 0.9) / 2, w + 0.02, 0.5, T + 0.9);
  d.box('marble', 0, H + 0.06, -0.15, w + 0.02, 0.12, 0.5);
  d.box('marble', 0, H + 0.95, -0.12, w + 0.02, 0.14, 0.38);
  if (hi) for (let x = -w / 2 + 0.55; x < w / 2 - 0.3; x += 0.32) d.cyl('marble', x, H + 0.5, -0.12, 0.07, 0.78, 6, { rTop: 0.05 });
  else d.box('marble', 0, H + 0.5, -0.12, w, 0.78, 0.12);
  // Pedestal and a gilded statue over the pilaster.
  d.box('marble', -w / 2, H + 0.6, -0.12, 0.7, 1.2, 0.6);
  statueFigure(d.at(-w / 2, H + 1.2, -0.12, 0), 'gilded_bronze', new Rng(`augst-${w.toFixed(2)}`));
  return b;
}

/** Room behind a ground-storey arch (bay frame): side wall, back wall, vault, floor; fittings by kind. */
function tabernaRoom(w: number, kind: 'shop' | 'wine' | 'shutters' | 'blind'): MeshBuilder {
  const b = new MeshBuilder();
  const d = new Draw(b).noShadow();
  const z0 = T, z1 = T + ROOM_D;
  if (kind === 'blind') {
    // Service door in a brick screen (the palace's own storerooms).
    new Draw(b).geo(archDoorWall(3.1, ROOM_H + 0.02, 1.4, 1.75, 0.45, 6), 'travertine', 0, 0, 0.5);
    d.span('bronze', -0.7, 0, 0.6, 0.7, 2.45, 0.66);
    for (const y of [0.6, 1.3, 2.0]) d.span('gilded_bronze', -0.68, y, 0.58, 0.68, y + 0.05, 0.6);
    d.span('black', -0.71, 0, 0.8, 0.71, 2.45, 0.82);
    return b;
  }
  d.span('plaster_cream', -w / 2, 0, z0, -w / 2 + 0.5, ROOM_H, z1);
  d.span('plaster_red', -w / 2 - 0.01, 0, z0, -w / 2 + 0.51, 1.05, z1 - 0.01);
  d.poly('plaster_cream', [{ x: -w / 2, y: 0, z: z1 }, { x: -w / 2, y: ROOM_H, z: z1 }, { x: w / 2, y: ROOM_H, z: z1 }, { x: w / 2, y: 0, z: z1 }]);
  d.poly('plaster_red', [{ x: -w / 2, y: 0, z: z1 - 0.01 }, { x: -w / 2, y: 1.05, z: z1 - 0.01 }, { x: w / 2, y: 1.05, z: z1 - 0.01 }, { x: w / 2, y: 0, z: z1 - 0.01 }]);
  d.poly('concrete', [{ x: -w / 2, y: ROOM_H, z: z0 }, { x: w / 2, y: ROOM_H, z: z0 }, { x: w / 2, y: ROOM_H, z: z1 }, { x: -w / 2, y: ROOM_H, z: z1 }]);
  d.poly('cobbles', [{ x: -w / 2, y: 0.02, z: z0 - T }, { x: -w / 2, y: 0.02, z: z1 }, { x: w / 2, y: 0.02, z: z1 }, { x: w / 2, y: 0.02, z: z0 - T }]);
  if (kind === 'shop') {
    // Counter, shelves of red-gloss ware and lamps, a loft.
    d.span('plaster_red', 0.15, 0, z0 + 0.3, 1.45, 0.95, z0 + 0.8);
    d.span('plaster_red', 0.95, 0, z0 + 0.8, 1.45, 0.95, z0 + 1.8);
    d.span('marble', 0.1, 0.95, z0 + 0.25, 1.5, 1.02, z0 + 0.85);
    d.span('wood', -w / 2 + 0.6, 1.5, z1 - 0.45, w / 2 - 0.1, 1.56, z1 - 0.05);
    for (let i = 0; i < 6; i++) d.cyl('terracotta', -1.4 + i * 0.5, 1.68, z1 - 0.25, 0.12, 0.24, 7, { rTop: 0.16 });
    d.span('wood_dark', -w / 2 + 0.5, 2.6, z0 + 1.8, w / 2, 2.75, z1);
  } else if (kind === 'wine') {
    d.span('plaster_red', 0.1, 0, z0 + 0.3, 1.5, 0.95, z0 + 0.85);
    d.span('plaster_red', 1.0, 0, z0 + 0.85, 1.5, 0.95, z0 + 2.0);
    d.span('marble', 0.05, 0.95, z0 + 0.25, 1.55, 1.02, z0 + 0.9);
    for (const x of [0.45, 1.15]) d.cyl('black', x, 1.0, z0 + 0.57, 0.19, 0.05, 8);
    for (let i = 0; i < 5; i++) {
      d.cyl('terracotta', -1.5 + i * 0.6, 0.45, z1 - 0.4, 0.07, 0.75, 6, { rTop: 0.2, open: true });
      d.cyl('terracotta', -1.5 + i * 0.6, 0.95, z1 - 0.4, 0.2, 0.25, 6, { rTop: 0.05, open: true });
    }
  } else {
    for (let i = 0; i < 6; i++) d.span('wood', -1.45 + i * 0.4, 0, 0.92, -1.07 + i * 0.4, 2.9, 1.02);
    d.span('wood_dark', -1.5, 2.9, 0.9, 1.5, 3.05, 1.04);
    d.span('black', -1.5, 0, 1.12, 1.5, ROOM_H, 1.14);
  }
  return b;
}

export interface AugFacadeResult {
  plan: AugFacadePlan;
  /** Street level used at the facade's foot (local y). */
  base: number;
}

/**
 * Builds the facade into `b` (geometry and colliders) and `group` (instanced bays); fills the
 * substructure behind it up to the terrace level `low`; returns the plan for the palace behind.
 */
export function buildAugustanaFacade(
  ctx: LandmarkContext,
  b: MeshBuilder,
  d: Draw,
  group: THREE.Group,
  spots: Spots,
  lamps: Lamp[],
  o: { front: number; hw: number; low: number; up: number; H1: number; H2: number; back: number },
): AugFacadeResult {
  const hi = ctx.detail === 'high';
  const plan = augFacadePlan(o.front, o.hw);
  const { c, R, zc, a0, a1, Rc, Rb, pav, hw } = plan;
  // Street level at the foot of the facade (a step above the lowest ground along it).
  const gf = groundRange(ctx, -hw - 2, o.front - 3, hw + 2, o.front + plan.sag + 0.5, 2);
  // (At least 14 m of substructure, even on flat test ground.)
  const base = Math.min(gf.min + 0.12, o.low - 14);
  const H = o.low - base;
  const hA = Math.max(6.0, H * 0.36);
  const hB = Math.max(5.0, H * 0.32);
  const st: Storeys = { H, hA, hB, hC: H - hA - hB };
  const W = plan.bay;
  // ---------------------------------------------- instanced bays (three storeys) and their rooms
  const mats = plan.bays.map((bb) => facing(bb.x, base, bb.z, bb.nx, bb.nz, bb.w / W));
  group.add(instanced(facadeBay(W, st, hi), 'augustana-facade', mats));
  // Room use: the five central arches are let as tabernae; the ends are the palace's service doors.
  const nArc = plan.bays.filter((bb) => bb.kind === 'arc').length;
  const mid = (nArc - 1) / 2;
  // A room whose floor the hillside (the pad's terrain ramp behind the facade) would break
  // through is kept shuttered: its interior is never seen.
  const roomDry = (bb: AugFacadePlan['bays'][number]) => {
    const m = facing(bb.x, 0, bb.z, bb.nx, bb.nz);
    const p = new THREE.Vector3();
    for (const x of [-1.5, 0, 1.5]) {
      for (const z of [T + 0.6, T + 2.0, T + ROOM_D - 0.3]) {
        p.set(x, 0, z).applyMatrix4(m);
        if (ctx.groundAt(p.x, p.z) > base + 0.25) return false;
      }
    }
    return true;
  };
  const use = plan.bays.map((bb, i) => {
    if (bb.kind === 'wing') return 'blind' as const;
    const k = Math.abs(i - mid);
    if (k > 2.6) return 'blind' as const;
    const u = (['shop', 'wine', 'shutters', 'shop', 'wine'] as const)[i % 5];
    return u === 'shutters' || roomDry(bb) ? u : ('shutters' as const);
  });
  for (const kind of ['shop', 'wine', 'shutters', 'blind'] as const) {
    const ms = plan.bays.flatMap((bb, i) => (use[i] === kind ? [facing(bb.x, base, bb.z, bb.nx, bb.nz, bb.w / W)] : []));
    if (!ms.length || (!hi && kind !== 'blind')) continue;
    group.add(instanced(tabernaRoom(W, kind), `augustana-${kind}`, ms));
  }
  // Corner piers beyond the wing bays: rusticated travertine quoins, full height.
  for (const s of [-1, 1]) {
    const x0 = s * (c + W), x1 = s * hw;
    d.span('travertine', Math.min(x0, x1), base - 0.8, o.front, Math.max(x0, x1), o.low + 1.05, o.front + T + 0.4, { collide: true });
    for (let y = base + 0.6; y < o.low - 0.6; y += 0.6) d.span('travertine', Math.min(x0, x1) + 0.06, y, o.front - 0.06, Math.max(x0, x1) - 0.06, y + 0.45, o.front);
    d.span('marble', Math.min(x0, x1) - 0.1, o.low - 0.5, o.front - 0.45, Math.max(x0, x1) + 0.1, o.low, o.front + T);
  }
  // Plinth along the foot (it hides the terrain's small undulations) and the pavement.
  for (const bb of plan.bays) {
    const f = new Draw(b, facing(bb.x, base, bb.z, bb.nx, bb.nz));
    f.span('travertine', -bb.w / 2 - 0.02, -1.2, -0.25, bb.w / 2 + 0.02, 0.0, T);
  }
  // ---------------------------------------------- colliders: piers, room walls, the solid above and behind
  const q = new THREE.Quaternion();
  const boxIn = (bb: AugFacadePlan['bays'][number], x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
    const m = facing(bb.x, base, bb.z, bb.nx, bb.nz);
    const cpos = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2).applyMatrix4(m);
    q.setFromRotationMatrix(m);
    b.collider({ kind: 'box', center: cpos, half: new THREE.Vector3((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2), rotation: q.clone() });
  };
  plan.bays.forEach((bb, i) => {
    const w = bb.w;
    boxIn(bb, -w / 2, -1.5, 0, ROOM_H, 0, T);
    boxIn(bb, 1.5, w / 2, 0, ROOM_H, 0, T);
    // Everything above the arch: the facade wall and the substructure to the room depth.
    boxIn(bb, -w / 2, w / 2, ROOM_H, H, -0.2, T + ROOM_D + 0.5);
    boxIn(bb, -w / 2, w / 2, H, H + 1.05, -0.25, 0.2);
    if (use[i] === 'blind') boxIn(bb, -1.5, 1.5, 0, ROOM_H, 0.4, T + ROOM_D + 0.5);
    else {
      boxIn(bb, -w / 2, -w / 2 + 0.5, 0, ROOM_H, T, T + ROOM_D);
      boxIn(bb, -w / 2, w / 2, 0, ROOM_H, T + ROOM_D, T + ROOM_D + 0.5);
      if (use[i] === 'shutters') boxIn(bb, -1.5, 1.5, 0, 2.9, 0.9, 1.04);
      else {
        boxIn(bb, 0.05, 1.55, 0, 1.02, T + 0.25, T + 0.9);
        boxIn(bb, 0.95, 1.55, 0, 1.02, T + 0.9, T + 2.0);
      }
    }
  });
  // Solid substructure core behind the rooms, in slices across x (the face is curved).
  const back = o.back;
  for (let x = -hw; x < hw - 1e-6; x += 1.2) {
    const xa = x, xb = Math.min(hw, x + 1.2);
    const zf = Math.max(augFaceZ(plan, xa), augFaceZ(plan, xb));
    const z0 = zf + T + ROOM_D + 0.4;
    if (z0 < back) d.solid(xa, base - 1, z0, xb, o.low, back);
  }
  // Side faces of the substructure (brick, travertine coping), down the slope to the street.
  for (const s of [-1, 1]) {
    const x = s * hw;
    const xo = s < 0 ? x - 0.3 : x + 0.3;
    const lo = Math.min(x, xo), hiX = Math.max(x, xo);
    d.span('travertine', lo, base - 0.8, o.front, hiX, base + hA, back, { collide: true });
    d.span('plaster_white', lo, base + hA, o.front, hiX, o.low, back, { collide: true });
    for (const y of [base + hA - 0.5, base + hA + hB - 0.4]) d.span('travertine', lo - 0.12, y, o.front, hiX + 0.12, y + 0.4, back);
    d.span('marble', lo - 0.25, o.low - 0.5, o.front, hiX + 0.25, o.low, back);
    d.span('marble', lo - 0.05, o.low, o.front, hiX + 0.05, o.low + 1.0, back, { collide: true });
    openings(d, lo, o.front, hiX, back, s < 0 ? 'w' : 'e', base + hA + 1.4, 1.1, 2.0, 3.6, { margin: 2.6, frame: 'marble' });
    openings(d, lo, o.front, hiX, back, s < 0 ? 'w' : 'e', base + hA + hB + 1.0, 1.0, 1.7, 3.6, { margin: 2.6 });
  }
  // Paved forecourt between the street along the Circus and the facade's foot.
  const fc: [number, number][] = [[-30, o.front - 17.5], [30, o.front - 17.5], [30, o.front - 0.3], [hw + 0.3, o.front - 0.3], [c, o.front - 0.3]];
  for (let k = 1; k < 16; k++) {
    const x = c - (2 * c * k) / 16;
    fc.push([x, augFaceZ(plan, x) - 0.3]);
  }
  fc.push([-c, o.front - 0.3], [-hw - 0.3, o.front - 0.3], [-30, o.front - 0.3]);
  buildPlaza(b, fc, (x, z) => ctx.groundAt(x, z), { material: 'paving_travertine', lift: 0.1, skirt: 0.5 });
  // ---------------------------------------------- the terrace: floor, colonnade, gallery, roof
  const ex = new Draw(b, new THREE.Matrix4().makeTranslation(0, 0, zc));
  const seg = hi ? 28 : 16;
  ex.geo(ringSector(R - 0.4, Rb + 0.3, a0, a1, 0.3, seg), 'marble', 0, o.low - 0.3, 0);
  // Its own continuous collider: radial slabs over the whole sector, out under the back wall. (The
  // bays' boxes diverge behind the concave face and the core only starts past the rooms, which
  // left a wedge open at every bay seam.)
  const nF = 36;
  const fIn = R - 0.4, fOut = Rb + 0.8;
  const fHalf = fOut * Math.sin((a1 - a0) / nF / 2) + 0.05;
  for (let i = 0; i < nF; i++) {
    const a = a0 + ((a1 - a0) * (i + 0.5)) / nF;
    const rm = (fIn + fOut) / 2;
    ex.at(Math.cos(a) * rm, 0, Math.sin(a) * rm, Math.atan2(Math.cos(a), Math.sin(a))).solid(-fHalf, o.low - 1.2, -(fOut - fIn) / 2, fHalf, o.low, (fOut - fIn) / 2);
  }
  // Colonnade: giallo antico below, pavonazzetto above (kit columns, instanced).
  const nCol = Math.max(6, Math.round((Rc * (a1 - a0)) / 2.25));
  const colAt = (k: number) => a0 + ((a1 - a0) * k) / nCol;
  for (let k = 0; k <= nCol; k++) {
    const a = colAt(k);
    const x = Math.cos(a) * Rc, z = zc + Math.sin(a) * Rc;
    const rot = new THREE.Matrix4().makeRotationY(Math.atan2(Math.cos(a), Math.sin(a)));
    column(b, { order: 'corinthian', D: 0.56, height: o.H1, material: 'marble_giallo', detail: 'low', collide: true }, new THREE.Matrix4().makeTranslation(x, o.low, z).multiply(rot));
    column(b, { order: 'corinthian', D: 0.48, height: o.H2, material: 'marble_pavonazzetto', detail: 'low', collide: true }, new THREE.Matrix4().makeTranslation(x, o.up, z).multiply(rot));
  }
  // Entablatures (ring bands), the upper gallery floor and the attic with gilded statues.
  ex.geo(ringSector(Rc - 0.45, Rb, a0, a1, o.up - o.low - o.H1, seg), 'marble', 0, o.low + o.H1, 0);
  ex.geo(ringSector(Rc - 0.5, Rc + 0.5, a0, a1, 0.3, seg), 'marble', 0, o.up - 0.3, 0);
  ex.geo(ringSector(Rc - 0.45, Rc + 0.55, a0, a1, 0.75, seg), 'marble', 0, o.up + o.H2, 0);
  const attic = o.up + o.H2 + 0.75;
  ex.geo(ringSector(Rc - 0.35, Rc + 0.35, a0, a1, 0.9, seg), 'marble', 0, attic, 0);
  const sr = new Rng('augustana-attic');
  for (let k = 1; k < nCol; k += 2) {
    const a = colAt(k);
    const f = d.at(Math.cos(a) * Rc, attic + 0.9, zc + Math.sin(a) * Rc, Math.atan2(Math.cos(a), Math.sin(a)));
    statueFigure(f, 'gilded_bronze', sr);
  }
  // Purple hangings drawn across the top of the upper colonnade (the vela of the imperial rooms).
  const vel: number[] = [];
  for (let k = 0; k < nCol; k++) {
    const p0 = colAt(k), p1 = colAt(k + 1);
    const r = Rc - 0.32;
    const A = [Math.cos(p0) * r, o.up + o.H2 - 0.05, Math.sin(p0) * r];
    const B = [Math.cos(p1) * r, o.up + o.H2 - 0.05, Math.sin(p1) * r];
    const pm = (p0 + p1) / 2;
    const Cc = [Math.cos(pm) * r, o.up + o.H2 - 1.05, Math.sin(pm) * r];
    vel.push(...A, ...B, ...Cc, ...A, ...Cc, ...B);
  }
  ex.tris('fabric_purple', vel);
  // Curved back wall of the gallery (red, with doors and windows), and the lean-to roof.
  const bw0 = Math.acos(Math.min(1, pav / Rb));
  const bw1 = Math.PI - bw0;
  // (A doorway at the apex leads through to the lower peristyle.)
  const dA = 1.25 / Rb;
  const halfSeg = Math.max(4, Math.round(seg / 2));
  for (const [p0, p1] of [[bw0, Math.PI / 2 - dA], [Math.PI / 2 + dA, bw1]] as const) {
    ex.geo(ringSector(Rb, Rb + 0.5, p0, p1, attic + 0.9 - o.low, halfSeg), 'plaster_white', 0, o.low, 0);
    ex.geo(ringSector(Rb - 0.02, Rb, p0, p1, o.up - o.low, halfSeg), 'plaster_red', 0, o.low, 0);
  }
  ex.geo(ringSector(Rb, Rb + 0.5, Math.PI / 2 - dA, Math.PI / 2 + dA, attic + 0.9 - o.low - 3.4, 2), 'plaster_white', 0, o.low + 3.4, 0);
  ex.geo(ringSector(Rb - 0.02, Rb, bw0, bw1, o.H2 + 0.2, seg), 'plaster_red', 0, o.up, 0);
  ex.geo(ringSector(Rb - 0.12, Rb + 0.62, Math.PI / 2 - dA - 0.02, Math.PI / 2 + dA + 0.02, 0.35, 2), 'marble', 0, o.low + 3.4, 0);
  const nDoor = 7;
  for (let i = 0; i < nDoor; i++) {
    if (i === (nDoor - 1) / 2) continue;
    const a = bw0 + ((bw1 - bw0) * (i + 0.5)) / nDoor;
    const m = ex.at(Math.cos(a) * (Rb - 0.04), 0, Math.sin(a) * (Rb - 0.04), Math.atan2(Math.cos(a), Math.sin(a)) + Math.PI);
    m.span('black', -0.8, o.low, -0.02, 0.8, o.low + 3.4, 0);
    m.span('black', -0.65, o.up + 0.6, -0.02, 0.65, o.up + 3.0, 0);
  }
  // Back-wall colliders in segments, leaving the apex doorway open below its lintel.
  const nW = 16;
  for (let i = 0; i < nW; i++) {
    const p0 = bw0 + ((bw1 - bw0) * i) / nW, p1 = bw0 + ((bw1 - bw0) * (i + 1)) / nW;
    const pieces: [number, number][] = p1 <= Math.PI / 2 - dA || p0 >= Math.PI / 2 + dA ? [[p0, p1]] : [[p0, Math.PI / 2 - dA], [Math.PI / 2 + dA, p1]];
    for (const [q0, q1] of pieces) {
      if (q1 - q0 < 1e-3) continue;
      const a = (q0 + q1) / 2, half = (Rb * (q1 - q0)) / 2 + 0.08;
      const m = ex.at(Math.cos(a) * (Rb + 0.25), 0, Math.sin(a) * (Rb + 0.25), Math.atan2(Math.cos(a), Math.sin(a)));
      m.solid(-half, o.low, -0.3, half, attic + 0.9, 0.3);
    }
  }
  ex.at(0, 0, Rb + 0.25).solid(-1.3, o.low + 3.4, -0.3, 1.3, attic + 0.9, 0.3);
  const roofPts: number[] = [];
  const rr = (r: number, a: number, y: number) => [Math.cos(a) * r, y, Math.sin(a) * r];
  for (let i = 0; i < seg; i++) {
    const p0 = a0 + ((a1 - a0) * i) / seg, p1 = a0 + ((a1 - a0) * (i + 1)) / seg;
    const yo = attic + 0.5, yi = attic + 2.2;
    roofPts.push(...rr(Rc + 0.3, p0, yo), ...rr(Rb + 0.2, p1, yi), ...rr(Rc + 0.3, p1, yo));
    roofPts.push(...rr(Rc + 0.3, p0, yo), ...rr(Rb + 0.2, p0, yi), ...rr(Rb + 0.2, p1, yi));
  }
  ex.tris('roof_tile', roofPts);
  // ---------------------------------------------- pavilions framing the exedra
  const pTop = o.up + o.H2 + 4.4;
  for (const s of [-1, 1]) {
    const x0 = s * pav, x1 = s * hw;
    const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
    const pz0 = o.front - 0.2;
    d.span('plaster_white', xa, o.low, pz0, xb, pTop, back, { collide: true });
    for (const x of [xa - 0.06, xb - 0.6]) d.span('marble', x, o.low, pz0 - 0.06, x + 0.66, pTop - 0.6, pz0 + 0.6);
    d.span('marble', xa - 0.15, o.up - 0.3, pz0 - 0.15, xb + 0.15, o.up, back);
    d.span('marble', xa - 0.2, pTop - 0.6, pz0 - 0.25, xb + 0.2, pTop, back);
    openings(d, xa, pz0, xb, back, 'n', o.low + 1.0, 1.2, 2.6, 2.6, { frame: 'marble', margin: (xb - xa) / 2 });
    openings(d, xa, pz0, xb, back, 'n', o.up + 1.0, 1.1, 2.3, 2.6, { frame: 'marble', margin: (xb - xa) / 2 });
    openings(d, xa, pz0, xb, back, s < 0 ? 'w' : 'e', o.up + 1.2, 1.0, 2.0, 3.2, { margin: 2.5 });
    // Pediment toward the Circus, gilded acroteria, tiled roof along z.
    const top = gableRoof(d, xa, pz0, xb, back, pTop, { axis: 'z', pitch: 0.3, over: 0.35, gables: 'marble' });
    d.cyl('gilded_bronze', (xa + xb) / 2, top + 0.65, pz0 - 0.1, 0.24, 1.1, 8, { rTop: 0.07 });
    for (const x of [xa + 0.2, xb - 0.2]) d.ellipsoid('gilded_bronze', x, pTop + 0.35, pz0 - 0.15, 0.22, 0.35, 0.2, { seg: [7, 5] });
  }
  // ---------------------------------------------- street life: awnings, wares, lamps; spots
  plan.bays.forEach((bb, i) => {
    if (use[i] === 'blind') {
      if (bb.kind === 'wing') {
        const p = new THREE.Vector3(0, 0, -1.4).applyMatrix4(facing(bb.x, base, bb.z, bb.nx, bb.nz));
        spots.add(`augustana-service-door-${bb.x < 0 ? 'w' : 'e'}`, 'door', p.x, p.y, p.z, Math.atan2(-bb.nx, -bb.nz));
        spots.add(`augustana-praetorian-${bb.x < 0 ? 'w' : 'e'}`, 'npc', p.x + bb.nx * 0.2 + 1.6, p.y, p.z, Math.atan2(bb.nx, bb.nz));
      }
      return;
    }
    const f = new Draw(b, facing(bb.x, base, bb.z, bb.nx, bb.nz));
    if (hi && use[i] !== 'shutters') velum(f.at(0, 0, -0.3), 3.2, 1.6, 3.4, i % 2 ? ['fabric_white', 'fabric_red'] : ['fabric_white', 'fabric_ochre']);
    if (hi && use[i] === 'wine') {
      placeProp(f, 'amphora_stack', 1.6, 0, -1.3, 0.2, { variant: i % 3 });
      placeProp(f, 'stool', -1.3, 0, -1.0, 0.5, { variant: 2 });
    }
    if (hi && use[i] === 'shop') placeProp(f, 'table', -1.0, 0, -1.2, 0.1, { variant: 1 });
    const lp = new THREE.Vector3(0, 3.3, -0.5).applyMatrix4(facing(bb.x, base, bb.z, bb.nx, bb.nz));
    lamps.push({ position: lp, color: 0xffa54f, intensity: 6, distance: 8, flicker: 0.25, night: true, glow: 0.15 });
    const sp = new THREE.Vector3(0, 0, T + 1.3).applyMatrix4(facing(bb.x, base, bb.z, bb.nx, bb.nz));
    if (use[i] !== 'shutters') spots.add(`augustana-taberna-${i}`, 'vendor', sp.x, sp.y, sp.z, Math.atan2(bb.nx, bb.nz));
  });
  // Lamps along the gallery at night: the emperor's windows over the Circus.
  for (let k = 1; k < nCol; k += 3) {
    const a = colAt(k + 0.5);
    lamps.push({ position: new THREE.Vector3(Math.cos(a) * (Rc + 1.6), o.up + 2.6, zc + Math.sin(a) * (Rc + 1.6)), color: 0xffb46a, intensity: 5, distance: 9, flicker: 0.15, night: true, glow: 0.2 });
  }
  spots.add('augustana-vista-circus', 'vista', 0, o.low, zc + Rc + 1.6, Math.PI);
  // A marble bench against the gallery's back wall, between two doors, looking out over the Circus.
  const ab = bw0 + ((bw1 - bw0) * 5) / nDoor;
  const br = Rb - 0.35;
  const bench = ex.at(Math.cos(ab) * br, o.low, Math.sin(ab) * br, Math.atan2(Math.cos(ab), Math.sin(ab)));
  bench.span('marble', -1.0, 0, -0.25, 1.0, 0.45, 0.25, { collide: true });
  for (const sx of [-0.85, 0.85]) bench.span('marble', sx - 0.12, 0, -0.27, sx + 0.12, 0.38, 0.27);
  const bp = new THREE.Vector3(Math.cos(ab) * (br - 0.1), 0, zc + Math.sin(ab) * (br - 0.1));
  spots.add('augustana-exedra-seat', 'sit', bp.x, o.low + 0.45, bp.z, Math.atan2(-Math.cos(ab), -Math.sin(ab)));
  spots.add('augustana-facade-vista', 'vista', 0, base, o.front - 14, 0);
  return { plan, base };
}
