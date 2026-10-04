/**
 * The service quarter east of the amphitheatre and the Esquiline brow above it.
 *
 * - castra-misenatium: barracks of the Misenum fleet detachment who rig the amphitheatre's
 *   awning — cells round a yard stacked with spare masts, spars, rope coils and canvas bales.
 * - moneta: the imperial mint — furnace halls, a strongroom, an anvil yard, guards.
 * - curiae-veteres: the archaic meeting place of the curiae at the NE foot of the Palatine,
 *   rebuilt after 64: a walled sacred precinct with an altar, a portico and dining rooms.
 * - porticus-liviae: Livia's double colonnade round a garden with fountains and the shrine of
 *   Concord, entered by a broad flight of steps from the Clivus Suburanus.
 * - domus-plinii: Pliny the Younger's shuttered town house (he is away in Bithynia).
 */
import * as THREE from 'three';
import { MeshBuilder } from '../../../gfx/MeshBuilder';
import { Draw, domus, roof } from '../../../arch/fabric';
import { hedge } from '../../../arch/vegetation';
import { temple } from '../../../arch/classical/temple';
import { column } from '../../../arch/classical/column';
import { placeProp } from '../../../arch/props';
import { Rng } from '../../../core/Rng';
import type { LandmarkBuild, LandmarkBuilder, LandmarkContext, Spot } from '../types';
import { frontSteps, lodInstances, plantTrees, risers, span, type TreeSpot } from './colos-kit';
import { courtyardBuilding } from './colos-court';
import { farCourt } from './colos-ludus';

const T = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);

/** Floor level for a footprint: 0 on flat pads, else the highest ground (+5 cm) so nothing is buried. */
function floorLevel(ctx: LandmarkContext, w: number, d: number): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i <= 6; i++)
    for (let j = 0; j <= 6; j++) {
      const g = ctx.groundAt(-w / 2 + (w * i) / 6, -d / 2 + (d * j) / 6);
      lo = Math.min(lo, g);
      hi = Math.max(hi, g);
    }
  return hi - lo < 0.25 ? 0 : Math.max(0, hi) + 0.05;
}

// ---------------------------------------------------------------- Castra Misenatium

function buildMisenatium(ctx: LandmarkContext): LandmarkBuild {
  const high = ctx.detail === 'high';
  const W = 100 * ctx.S;
  const D = 80 * ctx.S;
  const y0 = floorLevel(ctx, W, D);
  const res = courtyardBuilding({
    prefix: 'misenatium-',
    w: W,
    d: D,
    range: 4.2,
    storeys: 2,
    wallMat: 'brick',
    courtWallMat: 'plaster_cream',
    portico: { depth: 2.4, posts: 'timber', spacing: 3.2, gallery: true },
    gates: [{ side: 'front', width: 3.6, height: 3.0, arch: true, spot: 'gate' }],
    shops: [{ side: 'front', from: -W / 2 + 2, to: -3.5 }],
    rooms: [
      { id: 'optio', spotId: 'misenatium-optio', side: 'back', at: 0, width: 5.5, kind: 'office' },
      { id: 'ropes', spotId: 'misenatium-ropes', side: 'left', at: 0, width: 6, kind: 'store', spotKind: 'container' },
      { id: 'mess', side: 'right', at: 3, width: 6, kind: 'mess' },
      { id: 'shrine', side: 'right', at: -6, width: 3.4, kind: 'shrine' },
    ],
    floor: 'gravel',
    floorY: y0,
    groundAt: ctx.groundAt,
    detail: ctx.detail,
    seed: 'misenatium',
  });
  const b = res.b;
  const d = new Draw(b).at(0, y0, 0);
  const spots = [...res.spots];
  frontSteps(b, ctx.groundAt, 0, -D / 2, y0, 4.2);
  // The velarium yard: spare masts on trestles, spars, rope coils, canvas bales, a capstan.
  const cw = res.court.w;
  const cd = res.court.d;
  for (let i = 0; i < 6; i++) {
    const z = -cd / 2 + 2 + i * 0.5;
    d.rod('wood', { x: -cw / 2 + 2, y: 0.55 + (i % 2) * 0.28, z }, { x: cw / 2 - 2, y: 0.55 + (i % 2) * 0.28, z }, 0.13, 7);
  }
  for (const x of [-cw / 2 + 3, 0, cw / 2 - 3]) d.span('wood_dark', x - 0.15, 0, -cd / 2 + 1.6, x + 0.15, 0.5, -cd / 2 + 5.0, { collide: true });
  d.solid(-cw / 2 + 1.8, 0, -cd / 2 + 1.6, cw / 2 - 1.8, 1.0, -cd / 2 + 5.0);
  if (high) {
    const rng = new Rng('mis');
    for (let i = 0; i < 6; i++) {
      const x = -cw / 2 + 3 + i * 2.6;
      d.cyl('fabric_ochre', x, 0.35, cd / 4, 0.55, 0.7, 10, { rz: Math.PI / 2, collide: true });
      d.cyl('fabric_white', x + 1.3, 0.45, cd / 4 + 2.2, 0.45, 0.9, 10, { rz: Math.PI / 2 });
    }
    for (let i = 0; i < 4; i++) d.cyl('wood', cw / 2 - 3, 0.12 + i * 0.12, cd / 2 - 3 - i * 0.05, 0.9 - i * 0.12, 0.12, 12);
    // Capstan for test-hauling.
    d.cyl('wood_dark', 4, 0.6, 2, 0.35, 1.2, 8, { collide: true });
    d.rod('wood', { x: 2.5, y: 1.0, z: 2 }, { x: 5.5, y: 1.0, z: 2 }, 0.06, 5);
    d.rod('wood', { x: 4, y: 1.0, z: 0.5 }, { x: 4, y: 1.0, z: 3.5 }, 0.06, 5);
    placeProp(d, 'cart', -6, 0, 3, 0.4, { rng });
  }
  spots.push({ id: 'misenatium-yard', kind: 'npc', position: new THREE.Vector3(0, y0 + 0.05, 0), heading: Math.PI });
  return { object: b.build('castra-misenatium'), colliders: b.colliders, spots, far: farCourt(W, D, res.height, y0, 'brick'), cullDistance: 800 };
}

// ---------------------------------------------------------------- Moneta

function buildMoneta(ctx: LandmarkContext): LandmarkBuild {
  const high = ctx.detail === 'high';
  const W = 60 * ctx.S;
  const D = 40 * ctx.S;
  const y0 = floorLevel(ctx, W, D);
  const res = courtyardBuilding({
    prefix: 'moneta-',
    w: W,
    d: D,
    range: 5,
    storeys: 2,
    wallMat: 'brick',
    courtWallMat: 'plaster_cream',
    portico: null,
    gates: [{ side: 'front', width: 3.0, height: 2.6, arch: true, spot: 'gate' }],
    rooms: [
      { id: 'strongroom', spotId: 'moneta-strongroom', side: 'back', at: 0, width: 5, kind: 'store', spotKind: 'container' },
      { id: 'furnace-w', spotId: 'moneta-furnace-w', side: 'left', at: 0, width: 6, kind: 'forge' },
      { id: 'furnace-e', spotId: 'moneta-furnace-e', side: 'right', at: 0, width: 6, kind: 'forge' },
      { id: 'procurator', spotId: 'moneta-procurator', side: 'front', at: 7, width: 5, kind: 'office' },
    ],
    floor: 'paving_basalt',
    floorY: y0,
    groundAt: ctx.groundAt,
    detail: ctx.detail,
    seed: 'moneta',
    windows: false,
  });
  const b = res.b;
  const d = new Draw(b).at(0, y0, 0);
  const spots = [...res.spots];
  frontSteps(b, ctx.groundAt, 0, -D / 2, y0, 3.4);
  // The anvil yard: anvils where the struck coins are hammered between dies, quench troughs,
  // stacks of blanks (flans) in baskets, and smoke from the furnace halls.
  if (high) {
    const rng = new Rng('moneta');
    for (let i = 0; i < 4; i++) placeProp(d, 'anvil', -4.5 + i * 3, 0, 0.5, i * 0.4, { rng });
    placeProp(d, 'trough', -4, 0, -2.5, 0, { rng });
    placeProp(d, 'trough', 4, 0, -2.5, 0, { rng });
    for (let i = 0; i < 3; i++) placeProp(d, 'basket', 2 + i * 0.6, 0, 2.4, 0, { rng });
    for (const x of [-W / 2 + 3, W / 2 - 3]) d.span('black', x - 0.6, res.height, -0.6, x + 0.6, res.height + 1.6, 0.6);
  }
  spots.push({ id: 'moneta-guard', kind: 'npc', position: new THREE.Vector3(2.4, y0 + 0.05, -D / 2 - 1.2), heading: Math.PI });
  spots.push({ id: 'moneta-yard', kind: 'npc', position: new THREE.Vector3(0, y0 + 0.05, 1.5), heading: Math.PI });
  return { object: b.build('moneta'), colliders: b.colliders, spots, far: farCourt(W, D, res.height, y0, 'brick'), cullDistance: 700 };
}

// ---------------------------------------------------------------- Curiae Veteres

function buildCuriae(ctx: LandmarkContext): LandmarkBuild {
  const W = 55 * ctx.S;
  const D = 45 * ctx.S;
  const y0 = floorLevel(ctx, W, D);
  const res = courtyardBuilding({
    prefix: 'curiae-',
    w: W,
    d: D,
    range: 4.5,
    storeys: 1,
    storeyH: 4.2,
    wallMat: 'tufa',
    courtWallMat: 'plaster_white',
    trimMat: 'travertine',
    portico: { depth: 2.6, posts: 'columns', material: 'tufa', spacing: 3.0 },
    gates: [{ side: 'front', width: 2.8, height: 2.6, arch: false, spot: 'gate' }],
    rooms: [
      { id: 'dining', spotId: 'curiae-dining', side: 'back', at: -5, width: 7, kind: 'mess' },
      { id: 'shrine', spotId: 'curiae-shrine', side: 'back', at: 5, width: 4, kind: 'shrine' },
    ],
    floor: 'gravel',
    floorY: y0,
    groundAt: ctx.groundAt,
    detail: ctx.detail,
    seed: 'curiae',
    windows: false,
    cellDoors: false,
  });
  const b = res.b;
  const d = new Draw(b).at(0, y0, 0);
  const spots = [...res.spots];
  frontSteps(b, ctx.groundAt, 0, -D / 2, y0, 3.2);
  // The archaic altar of the curiae, a sacred tree and boundary cippi.
  d.span('tufa', -1.4, 0, -1.0, 1.4, 1.1, 1.0, { collide: true });
  d.span('travertine', -1.6, 1.1, -1.2, 1.6, 1.3, 1.2);
  const trees: TreeSpot[] = [{ species: 'laurel', x: 4.5, y: y0, z: 2.5, scale: 1.1 }, { species: 'fig', x: -5, y: y0, z: 3, scale: 0.9 }];
  const root = new THREE.Group();
  if (ctx.detail === 'high') for (const c of plantTrees(ctx.game, root, trees, 4)) b.collider(c);
  for (const [x, z] of [[-res.court.w / 2 + 0.6, -res.court.d / 2 + 0.6], [res.court.w / 2 - 0.6, -res.court.d / 2 + 0.6]] as const) d.span('travertine', x - 0.25, 0, z - 0.25, x + 0.25, 1.1, z + 0.25, { collide: true });
  spots.push({ id: 'curiae-altar', kind: 'shrine', position: new THREE.Vector3(0, y0 + 0.05, -2.2), heading: 0 });
  spots.push({ id: 'curiae-priest', kind: 'npc', position: new THREE.Vector3(2.2, y0 + 0.05, -1), heading: -Math.PI / 2 });
  root.add(b.build('curiae-veteres'));
  return { object: root, colliders: b.colliders, spots, cullDistance: 700 };
}

// ---------------------------------------------------------------- Porticus Liviae

function buildPorticusLiviae(ctx: LandmarkContext): LandmarkBuild {
  const b = new MeshBuilder();
  const root = new THREE.Group();
  const spots: Spot[] = [];
  const high = ctx.detail === 'high';
  const W = (115 * ctx.S) / 2; // 34.5
  const D = (75 * ctx.S) / 2; // 22.5
  const y0 = floorLevel(ctx, W * 2, D * 2);
  const d = new Draw(b).at(0, y0, 0);
  // Outer wall (plastered, with a travertine base), entrance on the front (−z) with steps.
  const wallH = 7.5;
  for (const [x0, z0, x1, z1] of [[-W, -D, -5, -D + 0.8], [5, -D, W, -D + 0.8], [-W, D - 0.8, W, D], [-W, -D, -W + 0.8, D], [W - 0.8, -D, W, D]] as const) {
    d.span('plaster_cream', x0, -0.5, z0, x1, wallH, z1, { collide: true });
    d.span('travertine', x0 - 0.05, -0.5, z0 - 0.05, x1 + 0.05, 0.9, z1 + 0.05);
  }
  // Propylon: four columns and a pediment over the entrance.
  for (const x of [-4.2, -1.4, 1.4, 4.2]) column(b, { order: 'corinthian', D: 0.6, height: 6.2, material: 'marble', detail: 'low', kind: 'free', collide: true }, T(x, y0, -D - 1.6));
  d.span('marble', -5.2, 6.2, -D - 2.3, 5.2, 7.2, -D + 0.8);
  roof(d.at(0, 0, -D - 0.7), { kind: 'gable', w: 10.6, d: 3.4, y: 7.2, axis: 'z', pitch: 0.26, ridges: high, wallMat: 'marble' });
  // The broad flight down to the Clivus Suburanus (20 m real wide).
  {
    const g = Math.min(ctx.groundAt(-6, -D - 6), ctx.groundAt(6, -D - 6), ctx.groundAt(0, -D - 6));
    const drop = y0 - g;
    if (drop > 0.15) {
      const { count, rise } = risers(drop, 0.2);
      const run = 0.34;
      const sw = 20 * ctx.S;
      const m = T(0, g, -D - 2.4 - count * run);
      for (let i = 0; i < count; i++) span(b, 'travertine', m, -sw / 2, -0.5, i * run, sw / 2, (i + 1) * rise, count * run + 0.1, true, false);
      spots.push({ id: 'liviae-steps', kind: 'spawn', position: new THREE.Vector3(0, g + 0.05, -D - 2.4 - count * run - 1.5), heading: 0 });
    }
    d.span('marble', -6, -0.5, -D - 2.4, 6, 0.02, -D + 0.8, { collide: true });
  }
  // Double colonnade round the garden (two rows of instanced columns), lean-to roof to the wall.
  const rows = [3.4, 7.0];
  const mats: THREE.Matrix4[] = [];
  const ch = 5.8;
  for (const inset of rows) {
    const x0 = -W + inset;
    const x1 = W - inset;
    const z0 = -D + inset;
    const z1 = D - inset;
    const edges: [number, number, number, number][] = [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]];
    for (const [ax, az, bx, bz] of edges) {
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(len / 3.6));
      for (let k = 0; k < n; k++) {
        const x = ax + ((bx - ax) * k) / n;
        const z = az + ((bz - az) * k) / n;
        if (Math.abs(x) < 3 && z < 0) continue;
        mats.push(T(x, y0, z));
        b.collider({ kind: 'cylinder', center: new THREE.Vector3(x, y0 + ch / 2, z), halfHeight: ch / 2, radius: 0.3 });
      }
      const yaw = Math.atan2(bx - ax, bz - az);
      const fr = new THREE.Matrix4().makeRotationY(yaw).setPosition(ax, y0, az);
      span(b, 'travertine', fr, -0.3, ch, -0.3, 0.3, ch + 0.55, len + 0.3);
    }
  }
  {
    const cn = new MeshBuilder();
    column(cn, { order: 'ionic', D: 0.56, height: ch, material: 'marble_pavonazzetto', trimMaterial: 'marble', detail: 'low', kind: 'free', collide: false });
    const cm = new MeshBuilder();
    cm.add(new THREE.CylinderGeometry(0.24, 0.28, ch * 0.92, 6), 'marble_pavonazzetto', T(0, ch * 0.46, 0));
    cm.add(new THREE.BoxGeometry(0.7, ch * 0.08, 0.7), 'marble', T(0, ch * 0.96, 0));
    lodInstances(ctx.game, root, { name: 'liviae-colonnade', matrices: mats, levels: [{ builder: cn, maxDist: 55 }, { builder: cm, maxDist: 700 }], cullBeyond: true });
  }
  // Roof over both aisles (sloping out to the wall) and the paved walks.
  roof(d, { kind: 'ring', w: W * 2, d: D * 2, y: ch + 0.6 + 0.9, pitch: 0.22, inner: { w: (W - 7.0) * 2, d: (D - 7.0) * 2, overhang: 0.4 }, ridgeAt: 0.05, ridges: high });
  d.span('paving_travertine', -W + 0.8, -0.1, -D + 0.8, W - 0.8, 0.04, D - 0.8);
  // Garden: lawn, clipped box borders, fountains, plane trees and laurels.
  const gx = W - 7.6;
  const gz = D - 7.6;
  d.span('grass', -gx, 0.0, -gz, gx, 0.07, gz);
  const trees: TreeSpot[] = [];
  if (high) {
    hedge(d, -gx + 0.3, -gz + 0.3, gx - 0.3, -gz + 0.9, 0.8, 3);
    hedge(d, -gx + 0.3, gz - 0.9, gx - 0.3, gz - 0.3, 0.8, 4);
    for (const x of [-gx + 4, -gx + 11, gx - 11, gx - 4]) for (const z of [-gz + 4, gz - 4]) trees.push({ species: x * z > 0 ? 'plane' : 'laurel', x, y: y0 + 0.07, z, scale: 0.85 });
    for (const c of plantTrees(ctx.game, root, trees, 17)) b.collider(c);
  }
  for (const x of [-12, 12]) {
    d.cyl('marble', x, 0.35, 0, 2.2, 0.6, 20, { collide: true });
    d.cyl('water', x, 0.62, 0, 2.0, 0.04, 20);
    d.cyl('marble', x, 0.9, 0, 0.3, 1.2, 8);
  }
  // The shrine of Concord (a small tetrastyle temple) on the garden's axis at the back.
  temple(b, { order: 'corinthian', plan: 'prostyle', front: 4, width: 7.2, podiumHeight: 1.3, detail: 'low', pedimentRelief: false, material: 'marble' }, T(0, y0 + 0.07, gz - 6.2));
  spots.push({ id: 'liviae-concord-shrine', kind: 'shrine', position: new THREE.Vector3(0, y0 + 0.1, gz - 14.5), heading: 0 });
  spots.push({ id: 'liviae-garden', kind: 'sit', position: new THREE.Vector3(-12, y0 + 0.66, 2.3), heading: 0 });
  spots.push({ id: 'liviae-entrance', kind: 'door', position: new THREE.Vector3(0, y0 + 0.05, -D - 1.0), heading: 0 });
  root.add(b.build('porticus-liviae'));
  return { object: root, colliders: b.colliders, spots, cullDistance: 900 };
}

// ---------------------------------------------------------------- Domus Plinii

function buildDomusPlinii(ctx: LandmarkContext): LandmarkBuild {
  const W = 40 * ctx.S;
  const D = 30 * ctx.S;
  const y0 = floorLevel(ctx, W, D);
  const out = domus({
    width: W,
    depth: D,
    seed: 113,
    wealth: 0.95,
    shops: false,
    upperFloor: true,
    groundAt: (x, z) => ctx.groundAt(x, z) - y0,
    detail: ctx.detail === 'high' ? 'full' : 'low',
    streetDressing: false,
  });
  const b = out.builder;
  const root = new THREE.Group();
  const obj = b.build('domus-plinii');
  obj.position.y = y0;
  root.add(obj);
  const spots: Spot[] = out.spots.map((s) => ({ id: `plinii-${s.id}`, kind: s.kind === 'houseDoor' ? 'door' : s.kind === 'tree' ? 'vista' : 'npc', position: s.position.clone().add(new THREE.Vector3(0, y0, 0)), heading: s.facing }));
  // The steward at the shut door; a bench by the entrance for callers.
  spots.push({ id: 'plinii-door', kind: 'door', position: new THREE.Vector3(0, y0 + 0.05, -D / 2 - 0.8), heading: 0 });
  spots.push({ id: 'plinii-steward', kind: 'npc', position: new THREE.Vector3(1.4, y0 + 0.05, -D / 2 - 0.6), heading: Math.PI });
  const colliders = b.colliders.map((c) => {
    if (c.kind === 'box') return { ...c, center: c.center.clone().add(new THREE.Vector3(0, y0, 0)) };
    if (c.kind === 'cylinder') return { ...c, center: c.center.clone().add(new THREE.Vector3(0, y0, 0)) };
    return { ...c, matrix: new THREE.Matrix4().makeTranslation(0, y0, 0).multiply(c.matrix ?? new THREE.Matrix4()) };
  });
  return { object: root, colliders, spots, cullDistance: 600 };
}

export const builders: LandmarkBuilder[] = [
  { handles: ['castra-misenatium'], build: buildMisenatium },
  { handles: ['moneta'], build: buildMoneta },
  { handles: ['curiae-veteres'], build: buildCuriae },
  { handles: ['porticus-liviae'], build: buildPorticusLiviae },
  { handles: ['domus-plinii'], build: buildDomusPlinii },
];
