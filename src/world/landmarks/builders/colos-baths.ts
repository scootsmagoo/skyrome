/**
 * Baths on the Oppian.
 *
 * - baths-trajan (H): Apollodorus' Thermae Traiani, dedicated June 109 over the buried wing of the
 *   Golden House. A walled garden (peribolos, porticoed on three sides) with the bath block set
 *   against its NE side: entrance porch, open-air natatio with a two-storey columnar screen, the
 *   ENTERABLE frigidarium (three groin-vaulted bays on eight grey granite columns, thermal windows,
 *   cold plunge pools in the end apses), tepidarium, the caldarium projecting SW with glazed apses
 *   for the afternoon sun, two porticoed palaestrae and brick ranges. In the garden: libraries in
 *   the SW corners and the great theatre-like hemicycle projecting SW on substructures over the
 *   Domus Aurea, its rows facing the baths.
 * - baths-titus: the smaller Flavian baths on the Oppian brow, with the wide flight of steps
 *   down to the amphitheatre plaza.
 * - sette-sale: the cistern of the Baths of Trajan — nine parallel vaulted chambers over a lower
 *   storey, the east wall curved.
 * - domus-aurea-buried: only the way in — a broken arch at the foot of the hemicycle substructure.
 */
import * as THREE from 'three';
import * as atlas from '../../../data/atlas';
import { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../gfx/materialIds';
import { Draw, doorLeaves, roof } from '../../../arch/fabric';
import { ProfileBuilder, gridSurface, linspace } from '../../../arch/common/geom';
import { column } from '../../../arch/classical/column';
import { apse } from '../../../arch/classical/vaults';
import { armoredEmperor, togate } from '../../../arch/classical/statues';
import { inscriptionPanel } from '../../../arch/common/inscription';
import { placeProp } from '../../../arch/props';
import { Rng } from '../../../core/Rng';
import { bearingToRotationY } from '../../../core/math';
import type { LandmarkBuild, LandmarkBuilder, LandmarkContext, Spot } from '../types';
import { Oval, addLamps, addReadables, lampAt, smokePlume, flight, lodInstances, ovalBand, ovalSweep, plantTrees, risers, solid, span, type LampSpec, type TreeSpot } from './colos-kit';
import { stripWall } from './colos-court';
import type { Opening } from '../../../arch/fabric';

const I = () => new THREE.Matrix4();

// ---------------------------------------------------------------- building blocks

/**
 * A closed brick range (rooms we don't enter): walls with arched window rows on the chosen faces
 * (real holes with a dark core behind), flat roof terrace with a parapet, colliders.
 * Faces: 'n' (−z), 's' (+z), 'w' (−x), 'e' (+x).
 */
function range(d: Draw, x0: number, z0: number, x1: number, z1: number, h: number, faces: string, opts: { mat?: MaterialId; rows?: number; low?: boolean; roof?: 'flat' | 'hip' } = {}) {
  const mat = opts.mat ?? 'brick';
  const t = 0.4;
  const rows = opts.rows ?? Math.max(1, Math.floor(h / 5.5));
  const W = x1 - x0;
  const Dp = z1 - z0;
  // Dark core (seen through the windows) and the walls.
  d.span('black', x0 + t, 0, z0 + t, x1 - t, h - 0.3, z1 - t);
  const face = (f: Draw, len: number, windows: boolean) => {
    const ops: Opening[] = [];
    if (windows && !opts.low) {
      const n = Math.max(1, Math.floor(len / 4.2));
      for (let r = 0; r < rows; r++) {
        const yb = 1.6 + r * (h / rows);
        const wh = Math.min(3.2, h / rows - 1.6);
        for (let i = 0; i < n; i++) {
          const c = ((i + 0.5) * len) / n;
          ops.push({ x0: c - 0.8, x1: c + 0.8, y0: yb, y1: yb + wh, arch: 0.8 });
        }
      }
    }
    stripWall(f, mat, 0, len, 0, h, t, ops);
    if (windows && opts.low) {
      const n = Math.max(1, Math.floor(len / 4.2));
      for (let r = 0; r < rows; r++) {
        const yb = 1.6 + r * (h / rows);
        for (let i = 0; i < n; i++) {
          const c = ((i + 0.5) * len) / n;
          f.span('black', c - 0.8, yb, -0.02, c + 0.8, yb + Math.min(3.2, h / rows - 1.6), 0.0);
        }
      }
    }
  };
  face(d.at(x0, 0, z0, 0), W, faces.includes('n'));
  face(d.at(x1, 0, z0, -Math.PI / 2), Dp, faces.includes('e'));
  face(d.at(x1, 0, z1, Math.PI), W, faces.includes('s'));
  face(d.at(x0, 0, z1, Math.PI / 2), Dp, faces.includes('w'));
  if ((opts.roof ?? 'flat') === 'flat') {
    d.span('concrete', x0, h - 0.3, z0, x1, h, z1);
    d.span(mat, x0, h, z0, x1, h + 0.9, z0 + 0.3);
    d.span(mat, x0, h, z1 - 0.3, x1, h + 0.9, z1);
    d.span(mat, x0, h, z0, x0 + 0.3, h + 0.9, z1);
    d.span(mat, x1 - 0.3, h, z0, x1, h + 0.9, z1);
    d.span('travertine', x0 - 0.1, h - 0.4, z0 - 0.1, x1 + 0.1, h - 0.25, z1 + 0.1);
  } else {
    d.span('concrete', x0, h - 0.3, z0, x1, h, z1);
    roof(d.at((x0 + x1) / 2, 0, (z0 + z1) / 2), { kind: 'hip', w: W, d: Dp, y: h, ridges: !opts.low });
  }
  d.solid(x0, 0, z0, x1, h, z1);
}

/** Groin vault over a rectangular bay (x0..x1, z0..z1), springing at ys, intrados facing down. */
function groinVault(b: MeshBuilder, mat: MaterialId, m: THREE.Matrix4, x0: number, x1: number, z0: number, z1: number, ys: number, n = 14) {
  const hx = (x1 - x0) / 2;
  const hz = (z1 - z0) / 2;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const rise = Math.min(hx, hz);
  const as = linspace(-1, 1, n);
  const g = gridSurface(as, as, (u, v, out) => {
    const k = Math.min(u * u, v * v);
    return out.set(cx + u * hx, ys + rise * Math.sqrt(Math.max(0, 1 - k)), cz + v * hz);
  }, { flip: false });
  b.add(g, mat, m, { castShadow: false });
}

/** A statue niche with a statue (kit figures) on a base. Frame faces −z (the room). */
function niche(b: MeshBuilder, m: THREE.Matrix4, v: number, mat: MaterialId = 'marble') {
  const d = new Draw(b, m);
  d.span('plaster_red', -0.9, 0.0, 0.0, 0.9, 3.4, 0.05);
  d.span('marble', -0.6, 0.0, -0.5, 0.6, 0.9, 0.1, { collide: true });
  const sm = m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.9, -0.2));
  if (v % 2) armoredEmperor(b, sm, { material: mat, detail: 'low', scale: 1.05 });
  else togate(b, sm, { material: mat, detail: 'low', scale: 1.05 });
}

/** Instanced colonnade of free columns along a polyline (LOD near / mid), merged beam on top. */
function colonnade(ctx: LandmarkContext, root: THREE.Object3D, b: MeshBuilder, pts: THREE.Vector3[], spacing: number, h: number, D: number, mat: MaterialId, name: string, opts: { roof?: { depth: number; side: 1 | -1 } } = {}) {
  const mats: THREE.Matrix4[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const c = pts[i + 1];
    const len = a.distanceTo(c);
    const n = Math.max(1, Math.round(len / spacing));
    for (let k = 0; k < n; k++) {
      const p = a.clone().lerp(c, k / n);
      mats.push(new THREE.Matrix4().makeTranslation(p.x, p.y, p.z));
      b.collider({ kind: 'cylinder', center: new THREE.Vector3(p.x, p.y + h / 2, p.z), halfHeight: h / 2, radius: D * 0.55 });
    }
  }
  const last = pts[pts.length - 1];
  if (!pts[0].equals(last)) {
    mats.push(new THREE.Matrix4().makeTranslation(last.x, last.y, last.z));
    b.collider({ kind: 'cylinder', center: new THREE.Vector3(last.x, last.y + h / 2, last.z), halfHeight: h / 2, radius: D * 0.55 });
  }
  const near = new MeshBuilder();
  column(near, { order: 'ionic', D, height: h, material: mat, trimMaterial: 'marble', detail: 'low', kind: 'free', collide: false });
  const midB = new MeshBuilder();
  midB.add(new THREE.CylinderGeometry(D * 0.42, D * 0.5, h * 0.9, 6), mat, new THREE.Matrix4().makeTranslation(0, h * 0.47, 0));
  midB.add(new THREE.BoxGeometry(D * 1.3, h * 0.1, D * 1.3), 'marble', new THREE.Matrix4().makeTranslation(0, h * 0.95, 0));
  lodInstances(ctx.game, root, { name, matrices: mats, levels: [{ builder: near, maxDist: 55 }, { builder: midB, maxDist: 700 }], cullBeyond: true });
  // Beam and (optional) lean-to roof towards the side.
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const c = pts[i + 1];
    const dir = c.clone().sub(a);
    const len = dir.length();
    const yaw = Math.atan2(dir.x, dir.z);
    const fr = new THREE.Matrix4().makeRotationY(yaw).setPosition(a.x, a.y, a.z);
    span(b, 'travertine', fr, -0.4, h, -0.3, 0.4, h + 0.7, len + 0.3);
    if (opts.roof) {
      const s = opts.roof.side;
      const rd = opts.roof.depth;
      const rm = fr.clone().multiply(new THREE.Matrix4().makeTranslation((s * rd) / 2, h + 0.7 + 0.6, len / 2)).multiply(new THREE.Matrix4().makeRotationZ(s * 0.2));
      b.box('roof_tile', rd + 0.8, 0.15, len + 0.6, rm);
      span(b, 'wood_dark', fr, s < 0 ? -rd : 0, h + 0.6, -0.2, s < 0 ? 0 : rd, h + 0.7, len + 0.2, false, false);
    }
  }
}

// ---------------------------------------------------------------- Baths of Trajan

function buildBathsTrajan(ctx: LandmarkContext): LandmarkBuild {
  const b = new MeshBuilder();
  const d = new Draw(b);
  const root = new THREE.Group();
  const spots: Spot[] = [];
  const lamps: LampSpec[] = [];
  const high = ctx.detail === 'high';
  const low = !high;
  const S = ctx.S;
  const EW = (310 * S) / 2; // 93
  const ED = (220 * S) / 2; // 66
  const wallH = 9;
  const wallT = 1.2;
  // ---- enclosure wall with inner porticoes (left, right, back)
  const hemiR = 48;
  const hemiOpen = 30;
  for (const [x0, z0, x1, z1] of [
    [-EW, -ED, -57, -ED + wallT],
    [57, -ED, EW, -ED + wallT],
    [-EW, -ED, -EW + wallT, ED],
    [EW - wallT, -ED, EW, ED],
    [-EW, ED - wallT, -hemiOpen, ED],
    [hemiOpen, ED - wallT, EW, ED],
  ] as const) {
    d.span('brick', x0, -1.5, z0, x1, wallH, z1, { collide: true });
    d.span('travertine', x0 - 0.1, wallH, z0 - 0.1, x1 + 0.1, wallH + 0.25, z1 + 0.1);
  }
  // Side gates in the enclosure (east and west).
  for (const sx of [-1, 1]) {
    d.span('black', sx * (EW + 0.01), 0, -2.2, sx * (EW - wallT - 0.01), 5.5, 2.2);
    d.span('travertine', sx * (EW + 0.15), 5.5, -3, sx * (EW - wallT), 6.2, 3);
  }
  // Porticoes along the inside of the enclosure (instanced columns).
  const pd = 6;
  const ph = 6.2;
  colonnade(ctx, root, b, [new THREE.Vector3(-EW + wallT + pd, 0, -ED + wallT + 2), new THREE.Vector3(-EW + wallT + pd, 0, ED - wallT - pd)], 4.2, ph, 0.62, 'marble_veined', 'trajan-portico-w', { roof: { depth: pd, side: -1 } });
  colonnade(ctx, root, b, [new THREE.Vector3(EW - wallT - pd, 0, ED - wallT - pd), new THREE.Vector3(EW - wallT - pd, 0, -ED + wallT + 2)], 4.2, ph, 0.62, 'marble_veined', 'trajan-portico-e', { roof: { depth: pd, side: -1 } });
  for (const [xa, xb] of [[-EW + wallT + pd, -hemiOpen - 2], [hemiOpen + 2, EW - wallT - pd]] as const) {
    colonnade(ctx, root, b, [new THREE.Vector3(xb, 0, ED - wallT - pd), new THREE.Vector3(xa, 0, ED - wallT - pd)], 4.2, ph, 0.62, 'marble_veined', `trajan-portico-s${xa < 0 ? 'w' : 'e'}`, { roof: { depth: pd, side: 1 } });
  }
  // Portico floors.
  d.span('paving_travertine', -EW + wallT, -0.1, -ED + wallT, -EW + wallT + pd + 0.6, 0.06, ED - wallT);
  d.span('paving_travertine', EW - wallT - pd - 0.6, -0.1, -ED + wallT, EW - wallT, 0.06, ED - wallT);
  d.span('paving_travertine', -EW + wallT, -0.1, ED - wallT - pd - 0.6, -hemiOpen, 0.06, ED - wallT);
  d.span('paving_travertine', hemiOpen, -0.1, ED - wallT - pd - 0.6, EW - wallT, 0.06, ED - wallT);
  // ---- garden (xystus): lawn, gravel walks, fountains, trees
  const zBlockBack = 6;
  d.span('grass', -EW + wallT, -0.2, zBlockBack, EW - wallT, 0.02, ED - wallT);
  d.span('grass', -EW + wallT, -0.2, -ED + wallT, -57, 0.02, zBlockBack);
  d.span('grass', 57, -0.2, -ED + wallT, EW - wallT, 0.02, zBlockBack);
  d.span('gravel', -EW + wallT + pd + 0.6, -0.2, zBlockBack + 3, EW - wallT - pd - 0.6, 0.04, zBlockBack + 7);
  d.span('gravel', -2.5, -0.2, zBlockBack + 7, 2.5, 0.04, ED - wallT);
  for (const sx of [-1, 1]) d.span('gravel', sx * 66 - 2.5, -0.2, -ED + wallT + 2, sx * 66 + 2.5, 0.04, ED - wallT - pd - 0.6);
  const trees: TreeSpot[] = [];
  for (let z = zBlockBack + 12; z < ED - wallT - pd - 3; z += 9) {
    for (const x of [-52, -40, -28, 28, 40, 52]) trees.push({ species: 'plane', x, y: 0, z, scale: 0.9 });
  }
  for (const sx of [-1, 1]) for (let z = -ED + 10; z < zBlockBack; z += 8) trees.push({ species: 'cypress', x: sx * 61, y: 0, z, scale: 1 });
  for (const sx of [-1, 1]) for (let z = -ED + 14; z < zBlockBack - 4; z += 16) trees.push({ species: 'umbrella_pine', x: sx * 76, y: 0, z, scale: 1.1 });
  if (high) for (const c of plantTrees(ctx.game, root, trees, 9)) b.collider(c);
  // Garden fountains (basins with a jet).
  for (const [fx, fz] of [[-40, zBlockBack + 30], [40, zBlockBack + 30], [0, zBlockBack + 18]] as const) {
    d.cyl('marble', fx, 0.3, fz, 3.0, 0.6, 24, { collide: true });
    d.cyl('water', fx, 0.55, fz, 2.75, 0.05, 24);
    d.cyl('marble', fx, 1.0, fz, 0.35, 1.6, 10);
    d.rod('water', { x: fx, y: 1.8, z: fz }, { x: fx, y: 2.6, z: fz }, 0.05, 5);
  }
  // ---- libraries (exedrae) in the SW corners
  for (const sx of [-1, 1]) {
    const lx = sx * (EW - 18);
    apse(b, { radius: 9, height: 10, thickness: 1.2, material: 'brick', domeMaterial: 'concrete', niches: high ? 9 : 0, detail: 'low', collide: true }, new THREE.Matrix4().makeTranslation(lx, 0, ED - wallT));
    d.span('paving_travertine', lx - 9, -0.1, ED - wallT - 2, lx + 9, 0.08, ED + 6);
    // Book cupboards (armaria) in two tiers along the curve are the niches; a desk and a statue.
    if (high) {
      placeProp(d, 'table_marble', lx, 0.08, ED + 2.5, 0, { rng: new Rng('lib' + sx) });
      spots.push({ id: `trajan-library-${sx < 0 ? 'w' : 'e'}`, kind: 'container', position: new THREE.Vector3(lx, 0.1, ED + 1.5), heading: Math.PI });
    }
  }
  // ---- the great hemicycle on substructures, rows facing the baths
  buildHemicycle(ctx, b, d, root, spots, ED, hemiR, hemiOpen, high);
  // ---- the bath block
  buildTrajanBlock(ctx, b, d, root, spots, lamps, high, low);
  spots.push({ id: 'trajan-garden', kind: 'vista', position: new THREE.Vector3(0, 0.05, zBlockBack + 12), heading: Math.PI });
  root.add(b.build('baths-trajan'));
  addLamps(ctx.game, root, lamps);
  return { object: root, colliders: b.colliders, spots, far: farBaths(EW, ED), cullDistance: 2000 };
}

function buildHemicycle(ctx: LandmarkContext, b: MeshBuilder, d: Draw, root: THREE.Group, spots: Spot[], ED: number, R: number, open: number, high: boolean) {
  // Frame: origin on the back wall line (z = ED), the half-disc bulging +z.
  const two = Math.PI * 2;
  const m = new THREE.Matrix4().makeTranslation(0, 0, ED);
  const oval = new Oval(open, open); // circle of radius `open` (the floor); rows at offsets from it
  const t0 = 0;
  const t1 = Math.PI; // +z half (t from 0 at +x to π at −x through +z)
  const rows = 14;
  const rise = 0.42;
  const depth = 0.85; // wide rows: these are for strolling and lectures as much as for shows
  const walk = 2.0;
  const topWalk = 3.0;
  const reach = walk + rows * depth + topWalk;
  const wallT = R - open - reach;
  const top = rows * rise;
  const g = (lx: number, lz: number) => ctx.groundAt(lx, lz + ED);
  // Floor: half-disc paved, solid deck (trimesh).
  const col: THREE.BufferGeometry[] = [];
  {
    const shape = new THREE.Shape();
    shape.moveTo(open, 0);
    for (let i = 1; i <= 48; i++) {
      const a = (i / 48) * Math.PI;
      shape.lineTo(Math.cos(a) * open, -Math.sin(a) * open);
    }
    shape.lineTo(open, 0);
    const fg = new THREE.ShapeGeometry(shape, 1);
    fg.rotateX(-Math.PI / 2);
    fg.translate(0, 0.06, 0);
    b.add(fg, 'paving_travertine', m, { castShadow: false });
    col.push(fg.toNonIndexed().applyMatrix4(m));
  }
  const add = (prof: ReturnType<ProfileBuilder['build']>, mat: MaterialId) => {
    const geo = ovalSweep(oval, prof, t0, t1, 48);
    b.add(geo, mat, m);
    col.push(geo.clone().applyMatrix4(m));
  };
  add(new ProfileBuilder(walk, 0.06).to(0, 0.06).build(), 'paving_travertine');
  let y = 0.06;
  for (let r = 0; r < rows; r++) {
    const x0 = walk + r * depth;
    add(new ProfileBuilder(x0, y + rise).to(x0, y).build(), 'travertine');
    y += rise;
    add(new ProfileBuilder(x0 + depth, y).to(x0, y).build(), r % 3 === 2 ? 'marble' : 'travertine');
  }
  add(new ProfileBuilder(reach, y).to(walk + rows * depth, y).build(), 'paving_travertine');
  {
    let total = 0;
    for (const gg of col) total += gg.getAttribute('position').count;
    const arr = new Float32Array(total * 3);
    let o = 0;
    for (const gg of col) {
      const p = gg.getAttribute('position').array as Float32Array;
      arr.set(p, o);
      o += p.length;
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    b.collider({ kind: 'trimesh', geometry: cg });
  }
  // Aisles (half steps).
  for (const a of [0.35, 0.8, 1.25, 1.57, 1.9, 2.35, 2.8]) {
    const fr = oval.radialFrame(a, 0).premultiply(m);
    let yy = 0.06;
    for (let r = 0; r < rows; r++) {
      const x0 = walk + r * depth;
      span(b, 'travertine', fr, -0.55, yy, -x0, 0.55, yy + rise / 2, -(x0 - depth / 2), true, false);
      yy += rise;
    }
  }
  // Outer wall: from the terrain up to the parapet, with buttress piers and blind arches; a
  // dark broken arch at the apex leads into the buried palace (domus-aurea-buried).
  const n = 40;
  const xw = reach;
  for (let i = 0; i < n; i++) {
    const ta = t0 + ((t1 - t0) * i) / n;
    const tb = t0 + ((t1 - t0) * (i + 1)) / n;
    const { m: cm, len } = oval.chordFrame(ta, tb, xw + wallT / 2);
    const fr = m.clone().multiply(cm);
    const mid = (ta + tb) / 2;
    const [px, pz] = oval.point(mid, xw + wallT);
    const gy = Math.min(0, g(px, pz)) - 0.5;
    span(b, 'brick', fr, -0.05, gy, -wallT / 2, len + 0.05, top + 1.1, wallT / 2, true);
    span(b, 'travertine', fr, -0.1, top + 1.1, -wallT / 2 - 0.1, len + 0.1, top + 1.3, wallT / 2 + 0.1, false, false);
    // Buttress at each chord start (outside) where the wall is tall.
    if (gy < -3) span(b, 'brick', fr, -0.6, gy, -wallT / 2 - 1.6, 0.6, Math.min(top, -1), -wallT / 2, true);
    // Blind arcade on the tall outer face.
    if (gy < -4 && high) {
      span(b, 'black', fr, len / 2 - 1.2, gy + 1.0, -wallT / 2 - 0.02, len / 2 + 1.2, Math.min(top - 2, gy + 7), -wallT / 2 + 0.25, false, false);
    }
  }
  // Rooms in the substructure reached from the top walk? No: the deck is solid; the floor of the
  // hemicycle sits on fill and vaults, and the old palace lies below.
  const apex = oval.point(Math.PI / 2, xw + wallT);
  spots.push({ id: 'trajan-hemicycle-vista', kind: 'vista', position: new THREE.Vector3(0, top + 0.1, ED + open + walk + rows * depth + 1.0), heading: Math.PI });
  spots.push({ id: 'trajan-hemicycle-stage', kind: 'npc', position: new THREE.Vector3(0, 0.1, ED + 6), heading: 0 });
  void apex;
  void two;
  void root;
  void d;
}

function buildTrajanBlock(ctx: LandmarkContext, b: MeshBuilder, d: Draw, root: THREE.Group, spots: Spot[], lamps: LampSpec[], high: boolean, low: boolean) {
  const ED = 66;
  const zF = -ED; // block front (also the enclosure front)
  // ---- entrance porch and the front ranges
  range(d, -57, zF, -26, zF + 10, 12, 'nw', { low });
  range(d, 26, zF, 57, zF + 10, 12, 'ne', { low });
  // Front wall of the natatio court with the main door, and the porch.
  for (const [x0, x1] of [[-26, -2.5], [2.5, 26]] as const) d.span('brick', x0, 0, zF, x1, 12, zF + 1.5, { collide: true });
  d.span('brick', -2.5, 6.5, zF, 2.5, 12, zF + 1.5);
  d.span('travertine', -26.2, 11.6, zF - 0.2, 26.2, 12.2, zF + 1.6);
  for (const x of [-6, -2.2, 2.2, 6]) column(b, { order: 'corinthian', D: 0.8, height: 7.6, material: 'marble', detail: 'low', kind: 'free', collide: true }, new THREE.Matrix4().makeTranslation(x, 0.3, zF - 4));
  d.span('marble', -7.2, 0, zF - 5.2, 7.2, 0.3, zF, { collide: true });
  d.span('marble', -7, 7.9, zF - 4.8, 7, 9.3, zF + 0.2);
  const ped = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-7.4, 0), new THREE.Vector2(7.4, 0), new THREE.Vector2(0, 1.9)]), { depth: 5.2, bevelEnabled: false });
  d.geo(ped, 'marble', 0, 9.3, zF - 5.0);
  roof(d.at(0, 0, zF - 2.4), { kind: 'gable', w: 15, d: 5.4, y: 9.35, axis: 'z', pitch: 0.25, ridges: false });
  if (high && typeof document !== 'undefined') {
    // Reconstructed formula (no text survives): Trajan's titulature of 109 — trib. pot. XIII,
    // imp. VI, cos. V; NOT "Optimus" (granted 114).
    inscriptionPanel(b, { lines: ['Imp Caesar Divi Nervae F Nerva Traianus Aug', 'Germ Dacicus Pont Max Trib Pot XIII Imp VI', 'Cos V P P Thermas Fecit'], width: 12.5, height: 1.15, style: 'bronze', sizes: [1, 0.85, 0.85] }, new THREE.Matrix4().makeTranslation(0, 8.6, zF - 4.85), { depth: 0.03 });
  }
  spots.push({ id: 'trajan-inscription', kind: 'inscription', position: new THREE.Vector3(0, Math.max(0, ctx.groundAt(0, zF - 9)) + 0.05, zF - 9), heading: 0 });
  addReadables(ctx.game, root, [
    {
      id: 'trajan-inscription',
      at: new THREE.Vector3(0, 8.6, zF - 4.9),
      reach: 10,
      title: 'Baths of Trajan',
      text: 'IMP · CAESAR · DIVI · NERVAE · F · NERVA · TRAIANVS · AVG / GERM · DACICVS · PONT · MAX · TRIB · POT · XIII · IMP · VI / COS · V · P · P · THERMAS · FECIT\n\n*The Emperor Caesar Nerva Trajan Augustus, son of the deified Nerva, conqueror of the Germans and the Dacians, chief priest, in the thirteenth year of his tribunician power, six times hailed imperator, five times consul, father of his country, built these baths.*\n\nDedicated four years ago, in June of the year 109, over the buried wing of Nero\'s Golden House. Entry costs a quadrans, the smallest coin there is.',
    },
  ]);
  spots.push({ id: 'trajan-entrance', kind: 'door', position: new THREE.Vector3(0, 0.35, zF - 1), heading: 0 });
  spots.push({ id: 'trajan-doorkeeper', kind: 'npc', position: new THREE.Vector3(3.2, 0.35, zF - 1.5), heading: Math.PI });
  // Torches on the wall either side of the door, lit through the night.
  for (const sx of [-1, 1]) {
    placeProp(d, 'torch_bracket', sx * 4.2, 3.4, zF, 0, { rng: new Rng('trajan-torch'), collide: false });
    lamps.push(lampAt('torch', sx * 4.2, 3.9, zF - 0.32));
  }
  // ---- natatio (open-air pool) court
  const nz0 = zF + 1.5;
  const nz1 = -46;
  d.span('marble', -26, -0.1, nz0, 26, 0.06, nz1, { collide: false });
  // Pool rim and water; the water is blocked (no swimming in v0).
  d.span('marble', -22, 0, nz0 + 3, 22, 0.55, nz0 + 3.4, { collide: true });
  d.span('marble', -22, 0, nz1 - 3.4, 22, 0.55, nz1 - 3, { collide: true });
  d.span('marble', -22, 0, nz0 + 3, -21.6, 0.55, nz1 - 3, { collide: true });
  d.span('marble', 21.6, 0, nz0 + 3, 22, 0.55, nz1 - 3, { collide: true });
  d.span('water', -21.6, 0.3, nz0 + 3.4, 21.6, 0.32, nz1 - 3.4);
  d.solid(-21.6, 0, nz0 + 3.4, 21.6, 0.55, nz1 - 3.4);
  // Side walls of the natatio court (screens with niches).
  for (const sx of [-1, 1]) {
    d.span('brick', sx * 26, 0, nz0, sx * 27.5, 12, nz1, { collide: true });
    for (let z = nz0 + 3; z < nz1 - 2; z += 4) d.span('marble', sx * 25.95, 0.5, z, sx * 26.0, 4.5, z + 2.2);
  }
  // The frigidarium's facade towards the pool: two storeys of columns in front of the wall.
  if (high) {
    for (let k = 0; k <= 12; k++) {
      const x = -24 + k * 4;
      for (let s = 0; s < 2; s++) {
        column(b, { order: s ? 'corinthian' : 'composite', D: 0.55, height: 5.2, material: s ? 'marble' : 'marble_giallo', trimMaterial: 'marble', detail: 'low', kind: 'free', collide: s === 0 }, new THREE.Matrix4().makeTranslation(x, 0.06 + s * 6.0, nz1 - 1.2));
      }
    }
    d.span('marble', -24.6, 5.26, nz1 - 1.6, 24.6, 6.06, nz1 + 0.1);
    d.span('marble', -24.6, 11.26, nz1 - 1.6, 24.6, 12.0, nz1 + 0.1);
    for (let k = 0; k < 12; k++) if (k % 3 !== 1) niche(b, new THREE.Matrix4().makeTranslation(-22 + k * 4, 6.06, nz1 - 0.05), k);
  }
  spots.push({ id: 'trajan-natatio', kind: 'vista', position: new THREE.Vector3(0, 0.1, nz0 + 1.5), heading: 0 });
  // ---- the frigidarium (enterable)
  frigidarium(ctx, b, d, root, spots, lamps, high);
  // ---- tepidarium, caldarium
  range(d, -8 - 1.5, -27, 8 + 1.5, -17, 13, '', { low, roof: 'hip' });
  caldarium(b, d, high, low);
  // ---- palaestrae (porticoed courts) and the ranges round them
  for (const sx of [-1, 1]) {
    const xa = sx * 36;
    const xb = sx * 55.5;
    const za = -56;
    const zb = -14;
    d.span('sand', Math.min(xa, xb), -0.1, za, Math.max(xa, xb), 0.05, zb);
    const cx = (xa + xb) / 2;
    const cw = Math.abs(xb - xa) - 6;
    const cd = zb - za - 6;
    const pts = [
      new THREE.Vector3(cx - cw / 2, 0, za + 3),
      new THREE.Vector3(cx + cw / 2, 0, za + 3),
      new THREE.Vector3(cx + cw / 2, 0, za + 3 + cd),
      new THREE.Vector3(cx - cw / 2, 0, za + 3 + cd),
      new THREE.Vector3(cx - cw / 2, 0, za + 3 + 0.01),
    ];
    colonnade(ctx, root, b, pts, 3.6, 5.5, 0.55, 'marble', `trajan-palaestra-${sx}`);
    // Outer wall of the palaestra (with windows) and the ranges between it and the halls.
    range(d, Math.min(sx * 55.5, sx * 57), -56, Math.max(sx * 55.5, sx * 57), -14, 11, sx < 0 ? 'w' : 'e', { low, rows: 1 });
    range(d, Math.min(sx * 27.5, sx * 36), -56, Math.max(sx * 27.5, sx * 36), -44.5, 12, '', { low });
    range(d, Math.min(sx * 34, sx * 36), -44.5, Math.max(sx * 34, sx * 36), -28.5, 12, '', { low });
    range(d, Math.min(sx * 15, sx * 36), -28.5, Math.max(sx * 15, sx * 36), -14, 12, '', { low });
    range(d, Math.min(sx * 9.5, sx * 15), -27, Math.max(sx * 9.5, sx * 15), -17, 12, '', { low });
    spots.push({ id: `trajan-palaestra-${sx < 0 ? 'w' : 'e'}`, kind: 'npc', position: new THREE.Vector3(cx, 0.1, (za + zb) / 2), heading: 0 });
    if (high) {
      placeProp(d, 'bench', cx - cw / 2 + 2, 0.05, (za + zb) / 2, Math.PI / 2, { rng: new Rng('pal' + sx) });
      placeProp(d, 'herm', cx + cw / 2 - 2, 0.05, (za + zb) / 2, -Math.PI / 2, { rng: new Rng('palh' + sx) });
    }
  }
  // Back ranges flanking the caldarium (windows to the garden).
  for (const sx of [-1, 1]) {
    range(d, Math.min(sx * 15, sx * 57), -14, Math.max(sx * 15, sx * 57), 6, 14, sx < 0 ? 'sw' : 'se', { low, rows: 2 });
  }
  // The furnaces (praefurnia) on the service side: stoking vents below, flue stacks above the back
  // ranges, and their smoke drifting over the garden all day.
  for (const sx of [-1, 1]) {
    d.span('black', sx * 16.5, 0, 5.98, sx * 18, 1.6, 6.05);
    d.span('glow_fire', sx * 16.7, 0.15, 6.0, sx * 17.8, 0.7, 6.06);
    lamps.push(lampAt('hearth', sx * 17.25, 0.6, 6.7, { intensity: 14, distance: 8 }));
    d.span('brick', sx * 17.25 - 0.7, 13.5, 3.6, sx * 17.25 + 0.7, 16.4, 5.0);
    d.span('black', sx * 17.25 - 0.45, 16.3, 3.85, sx * 17.25 + 0.45, 16.42, 4.75);
    if (high) smokePlume(ctx.game, root, new THREE.Vector3(sx * 17.25, 16.4, 4.3), { seed: sx > 0 ? 3 : 7, height: 30 });
  }
}

/** The frigidarium: three groin-vaulted bays on eight granite columns, enterable. */
function frigidarium(ctx: LandmarkContext, b: MeshBuilder, d: Draw, root: THREE.Group, spots: Spot[], lamps: LampSpec[], high: boolean) {
  const x0 = -24;
  const x1 = 24;
  const z0 = -44.5;
  const z1 = -28.5;
  const t = 1.5;
  const ys = 13.2; // springing
  const bay = 16;
  const crown = ys + bay / 2;
  const doorH = 6.0;
  const I4 = new THREE.Matrix4();
  // Floor: giallo antico field with porphyry and pavonazzetto roundels (opus sectile).
  d.span('marble_giallo', x0, -0.1, z0, x1, 0.08, z1);
  if (high) for (let i = 0; i < 3; i++) d.cyl('porphyry', -16 + i * 16, 0.085, (z0 + z1) / 2, 2.2, 0.01, 24);
  // Long walls (front with three doors to the natatio, back with one to the tepidarium).
  const longWall = (z: number, side: number, doors: [number, number][]) => {
    let x = x0 - t;
    const zz0 = side < 0 ? z - t : z;
    const zz1 = side < 0 ? z : z + t;
    const fz = side < 0 ? z + 0.02 : z - 0.02;
    const zi0 = Math.min(fz, z);
    const zi1 = Math.max(fz, z);
    const revet = (xa: number, xb: number, yb = 0.08) => {
      // Revetment inside: grey marble dado, white stucco above (doors left clear).
      if (yb < 3.0) d.span('marble_veined', Math.max(xa, x0), yb, zi0, Math.min(xb, x1), 3.0, zi1);
      d.span('plaster_white', Math.max(xa, x0), Math.max(3.0, yb), zi0, Math.min(xb, x1), ys, zi1);
    };
    for (const [a, c] of doors) {
      d.span('brick', x, 0, zz0, a, ys, zz1, { collide: true });
      d.span('brick', a, doorH, zz0, c, ys, zz1);
      d.span('marble', a - 0.3, 0, side < 0 ? z - 0.02 : z - t - 0.02, c + 0.3, doorH + 0.4, side < 0 ? z - t + 0.02 : z + 0.02);
      revet(x, a);
      revet(a, c, doorH + 0.4);
      x = c;
    }
    d.span('brick', x, 0, zz0, x1 + t, ys, zz1, { collide: true });
    revet(x, x1 + t);
  };
  longWall(z0, -1, [[-17.5, -14.5], [-2.0, 2.0], [14.5, 17.5]]);
  longWall(z1, 1, [[-1.6, 1.6]]);
  // End walls with big arches into the plunge-pool apses.
  for (const sx of [-1, 1]) {
    const xe = sx * x1;
    const xo = xe + sx * t;
    d.span('brick', Math.min(xe, xo), 0, z0 - t, Math.max(xe, xo), ys, z0 + 3.5, { collide: true });
    d.span('brick', Math.min(xe, xo), 0, z1 - 3.5, Math.max(xe, xo), ys, z1 + t, { collide: true });
    d.span('brick', Math.min(xe, xo), 10.5, z0 + 3.5, Math.max(xe, xo), ys, z1 - 3.5);
    // Plunge pool room beyond: apsed, with water and a rim.
    const px0 = xo;
    const px1 = xo + sx * 7;
    d.span('brick', Math.min(px0, px1), 0, z0 + 2, Math.max(px0, px1), 11, z0 + 3.5, { collide: true });
    d.span('brick', Math.min(px0, px1), 0, z1 - 3.5, Math.max(px0, px1), 11, z1 - 2, { collide: true });
    d.span('brick', Math.min(px1, px1 + sx * 1.5), 0, z0 + 2, Math.max(px1, px1 + sx * 1.5), 11, z1 - 2, { collide: true });
    d.span('concrete', Math.min(px0, px1 + sx * 1.5), 10.5, z0 + 2, Math.max(px0, px1 + sx * 1.5), 11.2, z1 - 2);
    d.span('marble', Math.min(px0, px1), 0, z0 + 3.5, Math.max(px0, px1), 0.7, z1 - 3.5);
    d.span('water', Math.min(px0 + sx * 0.4, px1), 0.7, z0 + 3.9, Math.max(px0 + sx * 0.4, px1), 0.72, z1 - 3.9);
    d.solid(Math.min(px0, px1), 0, z0 + 3.5, Math.max(px0, px1), 1.4, z1 - 3.5);
    // Upper end lunette (thermal window) and the window into the pool room roof light.
    lunette(b, new THREE.Matrix4().makeTranslation(xe + (sx * t) / 2, ys, (z0 + z1) / 2).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)), bay / 2, t, bay / 2 + 1.1);
  }
  // Lunettes over each bay on the long walls (thermal windows with two mullions).
  for (let k = 0; k < 3; k++) {
    const cx = x0 + bay / 2 + k * bay;
    for (const [z, sz] of [[z0 - t / 2, -1], [z1 + t / 2, 1]] as const) {
      void sz;
      lunette(b, new THREE.Matrix4().makeTranslation(cx, ys, z), bay / 2, t, bay / 2 + 1.1);
    }
  }
  // Groin vaults (painted white with a blue-green band) over the three bays.
  for (let k = 0; k < 3; k++) groinVault(b, 'plaster_white', I4, x0 + k * bay, x0 + (k + 1) * bay, z0, z1, ys, high ? 18 : 8);
  // Transverse ribs between bays and impost cornice.
  for (const x of [-8, 8]) {
    const rib = new ProfileBuilder(0, 0).build();
    void rib;
    const arcPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 16; i++) {
      const a = Math.PI - (Math.PI * i) / 16;
      arcPts.push(new THREE.Vector3(x, ys + Math.sin(a) * (bay / 2), (z0 + z1) / 2 + Math.cos(a) * (bay / 2)));
    }
    for (let i = 0; i < arcPts.length - 1; i++) {
      const a = arcPts[i];
      const c = arcPts[i + 1];
      const mid = a.clone().add(c).multiplyScalar(0.5);
      const len = a.distanceTo(c);
      const ang = Math.atan2(c.y - a.y, c.z - a.z);
      const m = new THREE.Matrix4().makeTranslation(mid.x, mid.y, mid.z).multiply(new THREE.Matrix4().makeRotationX(-ang));
      b.box('marble', 1.2, 0.5, len + 0.05, m, { castShadow: false });
    }
  }
  d.span('marble', x0, ys - 0.6, z0, x1, ys, z0 + 0.5);
  d.span('marble', x0, ys - 0.6, z1 - 0.5, x1, ys, z1);
  // Eight grey granite columns with white marble capitals and impost blocks, at the bay corners
  // (instanced: full detail near, simpler beyond 45 m).
  const colH = 12.0;
  const cmats: THREE.Matrix4[] = [];
  for (const x of [x0 + 1.1, -8, 8, x1 - 1.1]) {
    for (const z of [z0 + 1.2, z1 - 1.2]) {
      cmats.push(new THREE.Matrix4().makeTranslation(x, 0.08, z));
      b.collider({ kind: 'cylinder', center: new THREE.Vector3(x, colH / 2, z), halfHeight: colH / 2, radius: 0.65 });
      d.span('marble', x - 1.0, colH + 0.08, z - 1.0, x + 1.0, ys, z + 1.0);
    }
  }
  const cHi = new MeshBuilder();
  column(cHi, { order: 'corinthian', D: 1.15, height: colH, material: 'marble_veined', trimMaterial: 'marble', detail: 'high', kind: 'free', collide: false });
  const cLo = new MeshBuilder();
  column(cLo, { order: 'corinthian', D: 1.15, height: colH, material: 'marble_veined', trimMaterial: 'marble', detail: 'low', kind: 'free', collide: false });
  lodInstances(ctx.game, root, { name: 'trajan-frigidarium-columns', matrices: cmats, levels: [...(high ? [{ builder: cHi, maxDist: 45 }] : []), { builder: cLo, maxDist: 400 }], cullBeyond: true });
  // A great labrum (round basin on a pedestal) in the middle and statues in niches.
  d.cyl('marble', 0, 0.6, (z0 + z1) / 2, 0.6, 1.1, 12, { collide: true });
  d.cyl('porphyry', 0, 1.25, (z0 + z1) / 2, 2.0, 0.3, 24, { rTop: 2.2 });
  d.cyl('water', 0, 1.36, (z0 + z1) / 2, 1.9, 0.03, 24);
  if (high) {
    let v = 0;
    for (const x of [-20, -12, -4, 4, 12, 20]) {
      if (Math.abs(x) === 4) continue;
      niche(b, new THREE.Matrix4().makeTranslation(x, 0.08, z1 - 0.05), v++, 'marble');
    }
    // Benches along the walls.
    for (const x of [-20, -12, 12, 20]) d.span('marble', x - 2, 0.08, z0 + 0.1, x + 2, 0.5, z0 + 0.6, { collide: true });
  }
  // Roof: gable of tiles over the vaults.
  roof(d.at(0, 0, (z0 + z1) / 2), { kind: 'gable', w: x1 - x0 + 2 * t, d: z1 - z0 + 2 * t, y: crown + 1.1, axis: 'x', wallMat: 'brick', wallT: 0.6, ridges: high });
  // Cornice under the eaves.
  d.span('travertine', x0 - t - 0.2, crown + 0.85, z0 - t - 0.2, x1 + t + 0.2, crown + 1.1, z0 - t + 0.4);
  d.span('travertine', x0 - t - 0.2, crown + 0.85, z1 + t - 0.4, x1 + t + 0.2, crown + 1.1, z1 + t + 0.2);
  // Lampstands: four along the back wall between the statues, two by the benches at the front.
  {
    const lrng = new Rng('trajan-frigidarium');
    for (const [lx, lz] of [[-16, z1 - 1.5], [-4, z1 - 1.5], [4, z1 - 1.5], [16, z1 - 1.5], [-12, z0 + 1.6], [12, z0 + 1.6]] as const) {
      if (high) placeProp(d, 'lampstand', lx, 0.08, lz, 0, { rng: lrng });
      lamps.push(lampAt('lamp', lx, 1.54, lz, { distance: 12, intensity: 10 }));
    }
  }
  spots.push({ id: 'trajan-frigidarium', kind: 'vista', position: new THREE.Vector3(0, 0.12, (z0 + z1) / 2 - 4), heading: 0 });
  spots.push({ id: 'trajan-bath-attendant', kind: 'npc', position: new THREE.Vector3(-14, 0.12, z1 - 2.5), heading: Math.PI });
  spots.push({ id: 'trajan-strongbox', kind: 'container', position: new THREE.Vector3(20, 0.12, z1 - 1.6), heading: 0 });
  void ctx;
  void root;
}

/**
 * Thermal window in a lunette of radius r: the wall from the springing up to `fillTo` with a
 * semicircular opening (radius 0.82 r) divided by two mullions. Local xy plane, z thickness.
 */
function lunette(b: MeshBuilder, m: THREE.Matrix4, r: number, t: number, fillTo = r) {
  const ri = r * 0.82;
  const shape = new THREE.Shape([new THREE.Vector2(-r, 0), new THREE.Vector2(r, 0), new THREE.Vector2(r, fillTo), new THREE.Vector2(-r, fillTo)]);
  const hole: THREE.Vector2[] = [];
  const n = 16;
  for (let i = 0; i <= n; i++) {
    const a = (Math.PI * i) / n;
    hole.push(new THREE.Vector2(Math.cos(a) * ri, 0.3 + Math.sin(a) * ri));
  }
  shape.holes.push(new THREE.Path(hole));
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -t / 2);
  b.add(g, 'brick', m);
  for (const x of [-ri / 3, ri / 3]) {
    const hgt = Math.sqrt(ri * ri - x * x);
    b.box('brick', 0.6, hgt, t * 0.8, m.clone().multiply(new THREE.Matrix4().makeTranslation(x, 0.3 + hgt / 2, 0)));
  }
  b.box('travertine', ri * 2, 0.3, t + 0.2, m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.15, 0)));
}

/** Caldarium: hall with three glazed apses towards the SW garden, barrel roof. Not enterable. */
function caldarium(b: MeshBuilder, d: Draw, high: boolean, low: boolean) {
  const x0 = -15;
  const x1 = 15;
  const z0 = -17;
  const z1 = 3;
  const H = 15;
  d.span('brick', x0, 0, z0, x1, H, z1, { collide: true });
  d.span('travertine', x0 - 0.2, H - 0.4, z0 - 0.2, x1 + 0.2, H, z1 + 0.2);
  // Barrel roof (tiles) along x.
  const rp = new THREE.Shape();
  const n = 12;
  rp.moveTo(-(z1 - z0) / 2 - 0.4, 0);
  for (let i = 0; i <= n; i++) {
    const a = Math.PI - (Math.PI * i) / n;
    rp.lineTo(Math.cos(a) * ((z1 - z0) / 2 + 0.4), Math.sin(a) * 6.5);
  }
  const rg = new THREE.ExtrudeGeometry(rp, { depth: x1 - x0 + 0.6, bevelEnabled: false });
  rg.rotateY(Math.PI / 2);
  rg.translate(x0 - 0.3, H, (z0 + z1) / 2);
  b.add(rg, 'roof_tile');
  // Apses with tall glazed windows in two tiers (glass reads dark from outside).
  for (const [cx, r] of [[0, 7], [-10, 4.2], [10, 4.2]] as const) {
    const segs = high ? 16 : 8;
    const ap = new THREE.CylinderGeometry(r, r, H - 1, segs, 1, false, Math.PI / 2, Math.PI);
    ap.rotateY(Math.PI);
    ap.translate(cx, (H - 1) / 2, z1);
    b.add(ap, 'brick');
    const cap = new THREE.SphereGeometry(r + 0.3, segs, 4, 0, Math.PI, 0, Math.PI / 2);
    cap.translate(cx, H - 1, z1);
    b.add(cap, 'roof_tile');
    b.collider({ kind: 'cylinder', center: new THREE.Vector3(cx, H / 2, z1), halfHeight: H / 2, radius: r * 0.85 });
    if (!low) {
      const wn = Math.round(r * 0.9);
      for (let i = 0; i < wn; i++) {
        const a = (Math.PI * (i + 0.5)) / wn;
        const wx = cx - Math.cos(a) * (r + 0.02);
        const wz = z1 + Math.sin(a) * (r + 0.02);
        const yaw = Math.atan2(wx - cx, wz - z1);
        for (const [yb, wh] of [[2.0, 4.2], [7.6, 4.2]] as const) {
          const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(wx, yb + wh / 2, wz);
          b.box('black', 1.5, wh, 0.06, m, { castShadow: false });
          b.box('bronze', 1.6, 0.08, 0.1, m.clone().multiply(new THREE.Matrix4().makeTranslation(0, wh / 2, 0)), { castShadow: false });
          b.box('bronze', 0.06, wh, 0.1, m, { castShadow: false });
        }
      }
    }
  }
  // Furnace smoke vents at the foot of the side apses (service corridor).
  void d;
}

function farBaths(EW: number, ED: number): THREE.Object3D {
  const b = new MeshBuilder();
  const d = new Draw(b);
  d.span('brick', -EW, -1, -ED, EW, 9, -ED + 1.2);
  d.span('brick', -EW, -1, ED - 1.2, EW, 9, ED);
  d.span('brick', -EW, -1, -ED, -EW + 1.2, 9, ED);
  d.span('brick', EW - 1.2, -1, -ED, EW, 9, ED);
  d.span('grass', -EW, -0.2, -ED, EW, 0.05, ED);
  d.span('brick', -57, 0, -66, 57, 12, 6);
  d.span('brick', -25, 0, -46, 25, 22, -27);
  d.span('roof_tile', -32, 22, -47, 32, 25, -26);
  d.span('brick', -15, 0, -17, 15, 18, 10);
  const g = b.build('far');
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = false;
  });
  return g;
}

// ---------------------------------------------------------------- Baths of Titus

/** Floor level of the porch, vestibule and great hall: one 0.2 m step up from the paved forecourt. */
const TITUS_FL = 0.2;

/** Statue niche on a wall: frame at (x, y, z), `wallYaw` turns its −z (the room side) to face into the room. */
function wallNiche(b: MeshBuilder, x: number, y: number, z: number, wallYaw: number, v: number) {
  niche(b, new THREE.Matrix4().makeRotationY(wallYaw).setPosition(x, y, z), v);
}

/**
 * The vestibule of the Baths of Titus: a doorway through the brick front wall (marble frame, the
 * leaves open inwards) into a groin-vaulted entrance hall 12 × 7 m with a mosaic floor, benches,
 * the attendant's counter, statue niches and lampstands, and a wide passage on into the great hall.
 * Local frame as the landmark; the front wall's outer face is at z = −hd.
 */
function titusVestibule(ctx: LandmarkContext, b: MeshBuilder, d: Draw, spots: Spot[], lamps: LampSpec[], hd: number, high: boolean) {
  const FL = TITUS_FL;
  const zf = -hd; // outer face of the front wall
  const zIn = zf + 1.0; // inner face
  const zBack = zf + 8; // face of the back wall (towards the vestibule)
  const topW = 8.4; // wall tops under the attic block
  const ys = 4.6; // springing of the vault
  const rng = new Rng('titus-vestibule');
  // Front wall with the door (3.6 × 5.6 m with a round head) and two small barred windows.
  const fw = d.at(-6, 0, zf, 0);
  const door = { x0: 4.2, x1: 7.8, y0: FL, y1: 5.6, arch: 1.8 };
  const winL = { x0: 1.3, x1: 2.7, y0: 1.7, y1: 4.4, arch: 0.7 };
  const winR = { x0: 9.3, x1: 10.7, y0: 1.7, y1: 4.4, arch: 0.7 };
  stripWall(fw, 'brick', 0, 12, 0, topW, 1.0, [door, winL, winR]);
  fw.solid(0, 0, 0, 4.2, topW, 1.0);
  fw.solid(7.8, 0, 0, 12, topW, 1.0);
  fw.solid(4.2, 5.6, 0, 7.8, topW, 1.0);
  // Marble frame (jambs, lintel, cornice) round the door; bronze grilles in the windows.
  fw.span('marble', 3.8, 0, -0.1, 4.2, 5.6 + 0.5, 0.25);
  fw.span('marble', 7.8, 0, -0.1, 8.2, 5.6 + 0.5, 0.25);
  fw.span('marble', 3.8, 5.6 + 0.5, -0.14, 8.2, 5.6 + 0.8, 0.3);
  for (const w of [winL, winR]) {
    const cx = (w.x0 + w.x1) / 2;
    for (let i = -2; i <= 2; i++) fw.span('bronze', cx + i * 0.26 - 0.02, w.y0, 0.3, cx + i * 0.26 + 0.02, w.y1 - 0.2, 0.34);
  }
  doorLeaves(fw, door, 1.0, 0.85, 'wood_dark', true);
  fw.span('marble', 3.9, 0, -0.9, 8.1, FL, 0.0); // threshold step into the porch
  // Floor: black-and-white mosaic; the walls revetted in grey marble below, white stucco above.
  d.span('mosaic', -6, -0.1, zIn, 6, FL, zBack, { collide: true });
  for (const sx of [-1, 1]) {
    const xw = sx * 6;
    d.span('marble_veined', Math.min(xw, xw - sx * 0.06), FL, zIn, Math.max(xw, xw - sx * 0.06), 2.6, zBack);
    d.span('plaster_cream', Math.min(xw, xw - sx * 0.05), 2.6, zIn, Math.max(xw, xw - sx * 0.05), topW, zBack);
  }
  // Front wall, inner face: dado and stucco round the door and windows (never across them).
  for (const sx of [-1, 1]) {
    const seg = (xa: number, xb: number, y0: number, y1: number, mat: MaterialId) => d.span(mat, Math.min(sx * xa, sx * xb), y0, zIn, Math.max(sx * xa, sx * xb), y1, zIn + 0.06);
    seg(6, 1.8, FL, 1.7, 'marble_veined');
    seg(6, 4.7, 1.7, topW, 'plaster_cream');
    seg(4.7, 3.3, 4.4, topW, 'plaster_cream');
    seg(3.3, 1.8, 1.7, topW, 'plaster_cream');
  }
  d.span('plaster_cream', -1.8, 5.6, zIn, 1.8, topW, zIn + 0.06);
  // Groin vault over the room and the attic above it.
  groinVault(b, 'plaster_white', new THREE.Matrix4(), -6, 6, zIn, zBack, ys + FL, high ? 16 : 8);
  d.span('brick', -6, topW, zf, 6, 11, zf + 9);
  d.span('travertine', -6, topW - 0.05, zf - 0.15, 6, topW + 0.2, zf + 0.0);
  // Back wall (towards the hall), pierced by the passage (5 m wide, round head).
  const bw = d.at(-6, 0, zBack, 0);
  const pass = { x0: 3.5, x1: 8.5, y0: FL, y1: 7.5, arch: 2.5 };
  stripWall(bw, 'brick', 0, 12, 0, topW, 1.0, [pass]);
  bw.solid(0, 0, 0, 3.5, topW, 1.0);
  bw.solid(8.5, 0, 0, 12, topW, 1.0);
  bw.solid(3.5, 7.5, 0, 8.5, topW, 1.0);
  bw.span('marble_veined', 0, FL, -0.06, 3.5, 2.6, 0);
  bw.span('marble_veined', 8.5, FL, -0.06, 12, 2.6, 0);
  bw.span('plaster_cream', 0, 2.6, -0.05, 3.5, topW, 0);
  bw.span('plaster_cream', 8.5, 2.6, -0.05, 12, topW, 0);
  bw.span('marble', 3.2, FL, -0.12, 3.5, 7.5 + 0.4, 0.2);
  bw.span('marble', 8.5, FL, -0.12, 8.8, 7.5 + 0.4, 0.2);
  // Furniture: an attendant's counter at the door end (the quadrans is paid here), stone benches
  // along the side walls, statue niches flanking the passage, towel shelves, lampstands.
  d.span('marble', -5.4, FL, zIn + 1.05, -2.6, FL + 0.95, zIn + 1.7, { collide: true });
  d.span('travertine', -5.5, FL + 0.95, zIn + 1.0, -2.5, FL + 1.03, zIn + 1.78);
  placeProp(d, 'shelf', -5.1, FL, zIn + 0.12, 0, { rng });
  for (const sx of [-1, 1]) d.span('marble', sx > 0 ? 5.3 : -5.9, FL, zIn + 2.6, sx > 0 ? 5.9 : -5.3, FL + 0.48, zBack - 1.0, { collide: true });
  if (high) {
    for (const sx of [-1, 1]) wallNiche(b, sx * 4.9, FL, zBack - 0.06, 0, sx > 0 ? 1 : 2);
    for (const sx of [-1, 1]) placeProp(d, 'lampstand', sx * 4.4, FL, zIn + 3.1, 0, { rng });
  }
  for (const sx of [-1, 1]) lamps.push(lampAt('hearth', sx * 4.4, FL + 1.46, zIn + 3.1, { distance: 10 }));
  // Spots: the attendant behind the counter facing the room; the vestibule itself as a place to wait.
  spots.push({ id: 'titus-attendant', kind: 'npc', position: new THREE.Vector3(-4.0, FL + 0.05, zIn + 0.5), heading: 0 });
  spots.push({ id: 'titus-vestibule', kind: 'vista', position: new THREE.Vector3(0, FL + 0.05, zIn + 2.2), heading: 0 });
  void ctx;
}

/**
 * The great hall of the Baths of Titus (the frigidarium): 20 × 31 m under two groin vaults 16 m high,
 * thermal windows in the side walls, statues in niches, a porphyry labrum on the axis. Walls and
 * floor are real; the end wall towards the caldarium is closed (the hot rooms stay shut).
 */
function titusHall(ctx: LandmarkContext, b: MeshBuilder, d: Draw, spots: Spot[], lamps: LampSpec[], hd: number, high: boolean) {
  const FL = TITUS_FL;
  const x0 = -10;
  const x1 = 10;
  const z0 = -hd + 10; // inner face of the front wall (−26)
  const z1 = 5;
  const zm = (z0 + z1) / 2;
  const hz = (z1 - z0) / 4; // half a bay
  const ys = 8.0 + FL; // springing
  const top = 17;
  const rng = new Rng('titus-hall');
  // Floor of giallo antico with porphyry roundels.
  d.span('marble_giallo', x0, -0.1, z0, x1, FL, z1, { collide: true });
  if (high) for (const z of [z0 + 4.5, z1 - 4.5]) d.cyl('porphyry', 0, FL + 0.006, z, 2.2, 0.012, 24);
  // Front wall (from the vestibule, x ±11, 1 m thick) with the passage; the back wall is solid.
  const fw = d.at(-11, 0, z0 - 1.0, 0);
  const pass = { x0: 8.5, x1: 13.5, y0: FL, y1: 7.5, arch: 2.5 };
  stripWall(fw, 'brick', 0, 22, 0, top, 1.0, [pass]);
  fw.solid(0, 0, 0, 8.5, top, 1.0);
  fw.solid(13.5, 0, 0, 22, top, 1.0);
  fw.solid(8.5, 7.5, 0, 13.5, top, 1.0);
  d.span('brick', -11, 0, z1, 11, top, z1 + 1.0, { collide: true });
  // Side walls: solid to the springing (revetted inside), then a lunette with a big thermal window per bay.
  for (const sx of [-1, 1]) {
    const xi = sx * 10;
    const xo = sx * 11;
    d.span('brick', Math.min(xi, xo), 0, z0, Math.max(xi, xo), ys, z1, { collide: true });
    d.span('marble_veined', Math.min(xi, xi - sx * 0.06), FL, z0, Math.max(xi, xi - sx * 0.06), 3.4, z1);
    d.span('plaster_white', Math.min(xi, xi - sx * 0.05), 3.4, z0, Math.max(xi, xi - sx * 0.05), ys, z1);
    for (const zc of [z0 + hz, z1 - hz]) {
      lunette(b, new THREE.Matrix4().makeTranslation((xi + xo) / 2, ys, zc).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)), hz, 1.0, top - 0.3 - ys);
    }
  }
  // End walls: revetted and stuccoed up to the vault (the passage in the front wall stays clear).
  for (const [xa, xb] of [[x0, -2.5], [2.5, x1]] as const) {
    d.span('marble_veined', xa, FL, z0, xb, 3.4, z0 + 0.06);
    d.span('plaster_white', xa, 3.4, z0, xb, top - 0.3, z0 + 0.05);
  }
  d.span('plaster_white', -2.5, 7.5, z0, 2.5, top - 0.3, z0 + 0.05);
  d.span('marble_veined', x0, FL, z1 - 0.06, x1, 3.4, z1);
  d.span('plaster_white', x0, 3.4, z1 - 0.05, x1, top - 0.3, z1);
  // Two groin vaults, the transverse rib between them and wall piers under it.
  groinVault(b, 'plaster_white', new THREE.Matrix4(), x0, x1, z0, zm, ys, high ? 18 : 8);
  groinVault(b, 'plaster_white', new THREE.Matrix4(), x0, x1, zm, z1, ys, high ? 18 : 8);
  {
    const hx = (x1 - x0) / 2;
    const ry = hz; // vault rise over a bay (min half-extent)
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 18; i++) {
      const a = Math.PI - (Math.PI * i) / 18;
      pts.push(new THREE.Vector3(Math.cos(a) * hx, ys + Math.sin(a) * ry, zm));
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      const mid = p.clone().add(q).multiplyScalar(0.5);
      const ang = Math.atan2(q.y - p.y, q.x - p.x);
      const m = new THREE.Matrix4().makeTranslation(mid.x, mid.y, mid.z).multiply(new THREE.Matrix4().makeRotationZ(ang));
      b.box('marble', p.distanceTo(q) + 0.05, 0.5, 1.2, m, { castShadow: false });
    }
  }
  for (const sx of [-1, 1]) {
    const xa = sx * 10;
    const xb = sx * 9.2;
    d.span('brick', Math.min(xa, xb), FL, zm - 0.7, Math.max(xa, xb), ys, zm + 0.7, { collide: true });
    d.span('marble', Math.min(xa, xb) - 0.05, ys - 0.5, zm - 0.9, Math.max(xa, xb) + 0.05, ys, zm + 0.9);
  }
  // Roof: a concrete slab under a tiled hip roof (the old closed block's roof, now over a real room).
  d.span('concrete', -11, top - 0.3, z0 - 1.0, 11, top, z1 + 1.0);
  roof(d.at(0, 0, (z0 - 1.0 + z1 + 1.0) / 2), { kind: 'hip', w: 22, d: z1 - z0 + 2.0, y: top, ridges: high });
  // Labrum on the axis: marble pedestal, porphyry basin, water.
  d.cyl('marble', 0, FL + 0.55, zm, 0.6, 1.1, 12, { collide: true });
  d.cyl('porphyry', 0, FL + 1.25, zm, 2.0, 0.3, 24, { rTop: 2.2, collide: true });
  d.cyl('water', 0, FL + 1.36, zm, 1.9, 0.03, 24);
  if (high) {
    // Statues in niches along the walls (togati and an armoured Titus), benches between them,
    // lampstands, and the bath's strongbox.
    let v = 0;
    for (const z of [z0 + 4.2, z0 + 9.8, z1 - 9.8, z1 - 4.2]) {
      wallNiche(b, x0 + 0.04, FL, z, -Math.PI / 2, v++);
      wallNiche(b, x1 - 0.04, FL, z, Math.PI / 2, v++);
    }
    for (const x of [-6, 0, 6]) wallNiche(b, x, FL, z1 - 0.04, 0, v++);
    for (const sx of [-1, 1]) for (const zc of [z0 + hz, z1 - hz]) {
      const xa = sx * 9.95;
      const xb = sx * 9.35;
      d.span('marble', Math.min(xa, xb), FL, zc - 1.8, Math.max(xa, xb), FL + 0.46, zc + 1.8, { collide: true });
    }
    for (const sx of [-1, 1]) for (const z of [z0 + 3, z1 - 3]) placeProp(d, 'lampstand', sx * 8.7, FL, z, 0, { rng });
  }
  for (const sx of [-1, 1]) for (const z of [z0 + 3, z1 - 3]) lamps.push(lampAt('lamp', sx * 8.7, FL + 1.46, z, { distance: 11, intensity: 9 }));
  // The strongbox (iron-bound, the takings of the baths) against the back wall, east of the axis.
  d.span('iron', 7.4 - 0.65, FL, z1 - 0.7, 7.4 + 0.65, FL + 0.62, z1 - 0.2, { collide: true });
  d.span('bronze', 7.4 - 0.6, FL + 0.62, z1 - 0.68, 7.4 + 0.6, FL + 0.67, z1 - 0.22);
  spots.push({ id: 'titus-frigidarium', kind: 'vista', position: new THREE.Vector3(0, FL + 0.05, zm - 5.5), heading: 0 });
  spots.push({ id: 'titus-bath-attendant', kind: 'npc', position: new THREE.Vector3(-5.5, FL + 0.05, zm + 3.5), heading: Math.PI });
  spots.push({ id: 'titus-strongbox', kind: 'container', position: new THREE.Vector3(7.4, FL + 0.05, z1 - 1.5), heading: Math.PI });
  void ctx;
}

function buildBathsTitus(ctx: LandmarkContext): LandmarkBuild {
  const b = new MeshBuilder();
  const d = new Draw(b);
  const root = new THREE.Group();
  const spots: Spot[] = [];
  const lamps: LampSpec[] = [];
  const high = ctx.detail === 'high';
  const low = !high;
  const W = 105 * ctx.S; // 63
  const D = 120 * ctx.S; // 72
  const hw = W / 2;
  const hd = D / 2;
  // Platform terrace edge to the south: retaining wall down to the slope with blind arches.
  for (let i = 0; i < 12; i++) {
    const xa = -hw + (W * i) / 12;
    const xb = -hw + (W * (i + 1)) / 12;
    const gy = Math.min(ctx.groundAt((xa + xb) / 2, hd + 0.5), ctx.groundAt(xa, hd + 0.5), ctx.groundAt(xb, hd + 0.5)) - 0.5;
    d.span('brick', xa, gy, hd - 0.2, xb, 0.9, hd + 1.4, { collide: true });
    if (gy < -3 && !low) d.span('black', xa + 0.8, gy + 0.6, hd + 1.38, xb - 0.8, Math.min(-0.8, gy + 5), hd + 1.42);
  }
  // Front (north) entrance facade, ranges, a central frigidarium hall with lunettes, caldarium S.
  range(d, -hw, -hd, -6, -hd + 9, 11, 'nw', { low });
  range(d, 6, -hd, hw, -hd + 9, 11, 'ne', { low });
  // The way in: a real doorway through the front wall into the vestibule, a passage on into the
  // great hall (frigidarium). The forecourt is flat (landmarkPads), paved to the porch.
  const FL = TITUS_FL;
  // (The Baths of Trajan's platform rises 6 m just east of here, so the paving stays west of x = 5.)
  d.span('paving_travertine', -18, -0.06, -hd - 14, 5, 0.03, -hd - 4);
  titusVestibule(ctx, b, d, spots, lamps, hd, high);
  for (const x of [-4.5, -1.5, 1.5, 4.5]) column(b, { order: 'corinthian', D: 0.65, height: 5.8, material: 'marble', detail: 'low', kind: 'free', collide: true }, new THREE.Matrix4().makeTranslation(x, FL, -hd - 3));
  d.span('marble', -5.5, 0, -hd - 4, 5.5, FL, -hd, { collide: true });
  d.span('marble', -5.3, 6.0, -hd - 3.7, 5.3, 7.1, -hd);
  // Pediment and tiled roof over the porch, the dedication on the frieze. Reconstructed formula
  // (no text survives): Titus' titulature of late AD 80, the year the baths opened with the
  // amphitheatre — trib. pot. X, imp. XVII, cos. VIII.
  const pedT = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-5.5, 0), new THREE.Vector2(5.5, 0), new THREE.Vector2(0, 1.5)]), { depth: 3.9, bevelEnabled: false });
  d.geo(pedT, 'marble', 0, 7.1, -hd - 3.75);
  roof(d.at(0, 0, -hd - 1.8), { kind: 'gable', w: 11.4, d: 4.2, y: 7.15, axis: 'z', pitch: 0.27, ridges: false });
  if (high && typeof document !== 'undefined') {
    inscriptionPanel(b, { lines: ['Imp Titus Caesar Divi F Vespasianus Aug', 'Pont Max Trib Pot X Imp XVII Cos VIII P P', 'Thermas Fecit'], width: 9.6, height: 0.82, style: 'bronze', sizes: [1, 0.85, 0.9] }, new THREE.Matrix4().makeTranslation(0, 6.55, -hd - 3.72), { depth: 0.02 });
  }
  spots.push({ id: 'titus-inscription', kind: 'inscription', position: new THREE.Vector3(0, 0.05, -hd - 8), heading: 0 });
  addReadables(ctx.game, root, [
    {
      id: 'titus-inscription',
      at: new THREE.Vector3(0, 6.55, -hd - 3.75),
      reach: 8,
      title: 'Baths of Titus',
      text: 'IMP · TITVS · CAESAR · DIVI · F · VESPASIANVS · AVG / PONT · MAX · TRIB · POT · X · IMP · XVII · COS · VIII · P · P / THERMAS · FECIT\n\n*The Emperor Titus Caesar Vespasian Augustus, son of the deified Vespasian, chief priest, in the tenth year of his tribunician power, seventeen times hailed imperator, eight times consul, father of his country, built these baths.*\n\nBuilt in a hurry for the year the amphitheatre opened, thirty-three years ago; the broad steps on the far side run straight down to its plaza. Trajan\'s new baths up the hill have stolen most of the custom.',
    },
  ]);
  // Palaestrae either side (open courts with colonnades), ranges at the sides.
  for (const sx of [-1, 1]) {
    const xa = sx * 11;
    const xb = sx * (hw - 5);
    d.span('sand', Math.min(xa, xb), -0.1, -hd + 9, Math.max(xa, xb), 0.05, 6);
    range(d, Math.min(sx * (hw - 5), sx * hw), -hd + 9, Math.max(sx * (hw - 5), sx * hw), hd - 2, 10, sx < 0 ? 'w' : 'e', { low });
    const cx = (xa + xb) / 2;
    const cw = Math.abs(xb - xa) - 4;
    colonnade(ctx, root, b, [new THREE.Vector3(cx - cw / 2, 0, -hd + 11), new THREE.Vector3(cx + cw / 2, 0, -hd + 11), new THREE.Vector3(cx + cw / 2, 0, 4), new THREE.Vector3(cx - cw / 2, 0, 4), new THREE.Vector3(cx - cw / 2, 0, -hd + 11.01)], 3.4, 4.8, 0.48, 'marble', `titus-palaestra-${sx}`);
  }
  // Central hall (frigidarium) and the caldarium projecting south with windows to the plaza.
  titusHall(ctx, b, d, spots, lamps, hd, high);
  range(d, -9, 6, 9, hd - 2, 14, 's', { low, roof: 'hip', rows: 2 });
  for (const sx of [-1, 1]) range(d, Math.min(sx * 9, sx * (hw - 5)), 6, Math.max(sx * 9, sx * (hw - 5)), hd - 2, 9, 's', { low });
  // The wide flight of steps down to the amphitheatre plaza (S, centred).
  const drop = -Math.min(...[-4, 0, 4].map((x) => ctx.groundAt(x, hd + 17)));
  const sw = 12;
  if (drop > 0.5) {
    const { count, rise } = risers(drop, 0.2);
    const run = 0.32;
    const m = new THREE.Matrix4().makeRotationY(Math.PI).setPosition(0, -drop, hd + 1.4 + count * run);
    // Flight climbs towards −z (north) from the plaza: frame rotated π, foot at the far end.
    for (let i = 0; i < count; i++) {
      span(b, 'travertine', m, -sw / 2, -1.5, i * run, sw / 2, (i + 1) * rise, (i + 1) * run, true, false);
    }
    for (const sx of [-1, 1]) {
      const ang = Math.atan2(drop, count * run);
      const pm = m.clone().multiply(new THREE.Matrix4().makeTranslation(sx * (sw / 2 + 0.3), drop / 2 + 0.5, (count * run) / 2)).multiply(new THREE.Matrix4().makeRotationX(-ang));
      b.box('brick', 0.6, 1.2 + drop * 0.15, Math.hypot(drop, count * run) + 0.4, pm, { collide: true });
    }
    const zf = hd + 1.4 + count * run + 1.5;
    spots.push({ id: 'titus-stairs-foot', kind: 'spawn', position: new THREE.Vector3(0, Math.max(-drop, ctx.groundAt(0, zf)) + 0.05, zf), heading: Math.PI });
  }
  // The door spot is the threshold on the porch (the leaves open inwards); the attendant who
  // takes the quadrans stands behind his counter in the vestibule (see titusVestibule).
  spots.push({ id: 'titus-entrance', kind: 'door', position: new THREE.Vector3(0, FL + 0.05, -hd - 1.2), heading: 0 });
  spots.push({ id: 'titus-vista', kind: 'vista', position: new THREE.Vector3(0, 0.95, hd + 0.4), heading: Math.PI * 0.85 });
  // A furnace stack behind the caldarium, smoking.
  d.span('brick', 5.3, 13.5, hd - 6.2, 6.7, 16.2, hd - 4.8);
  if (high) smokePlume(ctx.game, root, new THREE.Vector3(6, 16.2, hd - 5.5), { seed: 5, height: 24, count: 28 });
  // Torches either side of the door: the baths keep their porch lit through the night.
  for (const sx of [-1, 1]) {
    placeProp(d, 'torch_bracket', sx * 2.75, 3.0, -hd, 0, { rng: new Rng('titus-torch'), collide: false });
    lamps.push(lampAt('torch', sx * 2.75, 3.5, -hd - 0.35));
  }
  root.add(b.build('baths-titus'));
  addLamps(ctx.game, root, lamps);
  return { object: root, colliders: b.colliders, spots, cullDistance: 1600 };
}

// ---------------------------------------------------------------- Sette Sale

function buildSetteSale(ctx: LandmarkContext): LandmarkBuild {
  const b = new MeshBuilder();
  const spots: Spot[] = [];
  const W = 40 * ctx.S; // 24
  const D = 60 * ctx.S; // 36
  let hi = -Infinity;
  let lo = Infinity;
  for (let i = 0; i <= 4; i++)
    for (let j = 0; j <= 4; j++) {
      const g = ctx.groundAt(-W / 2 + (W * i) / 4, -D / 2 + (D * j) / 4);
      hi = Math.max(hi, g);
      lo = Math.min(lo, g);
    }
  // The cistern floor sits on a lower storey (rooms with doors) where the ground falls away.
  const lower = 3.6;
  const y0 = Math.max(hi, lo + lower);
  const d = new Draw(b).at(0, 0, 0);
  const n = 9;
  const cw = W / n;
  const H = 5.4; // chamber height to the crown
  // Lower storey: brick walls with arched doors on the outer faces.
  d.span('brick', -W / 2, lo - 0.5, -D / 2, W / 2, y0, D / 2, { collide: true });
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + cw * (i + 0.5);
    if (y0 - lo > 2.6) d.span('black', x - 0.7, lo, -D / 2 - 0.02, x + 0.7, Math.min(y0 - 0.3, lo + 2.6), -D / 2 + 0.1);
  }
  // Upper storey: nine parallel vaulted chambers (N–S) with offset doorways in the cross walls.
  for (let i = 0; i <= n; i++) {
    const x = -W / 2 + cw * i;
    d.span('brick', x - 0.35, y0, -D / 2, x + 0.35, y0 + H * 0.62, D / 2, { collide: true });
  }
  d.span('brick', -W / 2, y0, -D / 2, W / 2, y0 + H * 0.62, -D / 2 + 0.7, { collide: true });
  // Curved east wall: a polygonal bulge with niches.
  const bulge = 4;
  for (let k = 0; k < 8; k++) {
    const a0 = -Math.PI / 2 + (Math.PI * k) / 8;
    const a1 = -Math.PI / 2 + (Math.PI * (k + 1)) / 8;
    const p0 = new THREE.Vector3(W / 2 + Math.cos(a0) * bulge, 0, Math.sin(a0) * (D / 2));
    const p1 = new THREE.Vector3(W / 2 + Math.cos(a1) * bulge, 0, Math.sin(a1) * (D / 2));
    const len = p0.distanceTo(p1);
    const yaw = Math.atan2(p1.x - p0.x, p1.z - p0.z);
    const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(p0.x, 0, p0.z);
    span(b, 'brick', m, -0.7, lo - 0.5, 0, 0.0, y0 + H * 0.62, len, true);
    if (k % 2 === 1) span(b, 'black', m, -0.72, y0 + 0.8, len / 2 - 0.6, -0.68, y0 + 2.6, len / 2 + 0.6, false, false);
  }
  d.span('brick', W / 2, lo - 0.5, -D / 2, W / 2 + bulge * 0.7, y0 + H * 0.62, D / 2);
  // Barrel vaults over each chamber (concrete, cocciopesto-lined inside) and the roof terrace.
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + cw * (i + 0.5);
    const shape = new THREE.Shape();
    const r = cw / 2;
    shape.moveTo(-r, 0);
    for (let k = 0; k <= 10; k++) {
      const a = Math.PI - (Math.PI * k) / 10;
      shape.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.9);
    }
    shape.lineTo(r + 0.01, 0);
    const g = new THREE.ExtrudeGeometry(shape, { depth: D, bevelEnabled: false });
    g.translate(0, 0, -D / 2);
    d.geo(g, 'concrete', x, y0 + H * 0.62, 0);
  }
  d.span('concrete', -W / 2, y0 + H * 0.62, -D / 2, W / 2, y0 + H * 0.62 + 0.15, D / 2);
  // Water inside (seen from the hatches) and the access hatches on top.
  d.solid(-W / 2, y0 + H * 0.62, -D / 2, W / 2, y0 + H * 0.62 + cw / 2 * 0.9, D / 2);
  for (const i of [1, 4, 7]) {
    const x = -W / 2 + cw * (i + 0.5);
    d.span('travertine', x - 0.7, y0 + H * 0.62 + cw * 0.45, -2, x + 0.7, y0 + H * 0.62 + cw * 0.45 + 0.3, 2, { collide: true });
    d.span('black', x - 0.45, y0 + H * 0.62 + cw * 0.45 + 0.3, -1.5, x + 0.45, y0 + H * 0.62 + cw * 0.45 + 0.31, 1.5);
  }
  // A stair up the west side to the roof terrace (maintenance access).
  const climb = y0 + H * 0.62 + cw * 0.45 - lo;
  const { count, rise } = risers(Math.max(0.4, climb), 0.2);
  const m = new THREE.Matrix4().setPosition(-W / 2 - 0.9, lo, D / 2 - 0.5);
  const fm = m.clone().multiply(new THREE.Matrix4().makeRotationY(Math.PI));
  flight(b, 'travertine', fm, 0, 1.4, 0, 0, rise, 0.32, count, true);
  spots.push({ id: 'sette-sale-hatch', kind: 'door', position: new THREE.Vector3(-W / 2 + cw * 4.5, y0 + H * 0.62 + cw * 0.45 + 0.33, -2.6), heading: Math.PI });
  spots.push({ id: 'sette-sale-door', kind: 'door', position: new THREE.Vector3(-W / 2 + cw * 4.5, Math.max(lo, ctx.groundAt(-W / 2 + cw * 4.5, -D / 2 - 1.2)) + 0.05, -D / 2 - 1.2), heading: 0 });
  spots.push({ id: 'sette-sale-roof', kind: 'vista', position: new THREE.Vector3(-W / 2 + cw * 2.5, y0 + H * 0.62 + cw * 0.45 + 0.05, 6), heading: Math.PI });
  return { object: b.build('sette-sale'), colliders: b.colliders, spots, cullDistance: 900 };
}

// ---------------------------------------------------------------- Domus Aurea (buried)

/** World (game) position of a point given in another landmark's local frame. */
function otherLocalToWorld(id: string, lx: number, lz: number, S: number): [number, number] {
  const lm = atlas.LANDMARK_BY_ID[id];
  const gx = lm.center[0] * S;
  const gz = lm.center[1] * S;
  const r = bearingToRotationY(lm.rotation);
  return [gx + lx * Math.cos(r) + lz * Math.sin(r), gz - lx * Math.sin(r) + lz * Math.cos(r)];
}

function worldToLocal(ctx: LandmarkContext, wx: number, wz: number): [number, number] {
  const gx = ctx.lm.center[0] * ctx.S;
  const gz = ctx.lm.center[1] * ctx.S;
  const r = bearingToRotationY(ctx.lm.rotation);
  const dx = wx - gx;
  const dz = wz - gz;
  // Inverse of x' = x cos r + z sin r, z' = −x sin r + z cos r.
  return [dx * Math.cos(r) - dz * Math.sin(r), dx * Math.sin(r) + dz * Math.cos(r)];
}

function buildDomusAurea(ctx: LandmarkContext): LandmarkBuild {
  const b = new MeshBuilder();
  const spots: Spot[] = [];
  // The way in: at the foot of the hemicycle of the Baths of Trajan (its apex), where the fill
  // has slumped and an old arcade of the palace gapes.
  const EDt = (220 * ctx.S) / 2;
  const [wx, wz] = otherLocalToWorld('baths-trajan', 0, EDt + 48 + 3.5, ctx.S);
  const [lx, lz] = worldToLocal(ctx, wx, wz);
  const [ox, oz] = otherLocalToWorld('baths-trajan', 0, EDt + 60, ctx.S);
  const [lox, loz] = worldToLocal(ctx, ox, oz);
  const yaw = Math.atan2(lox - lx, loz - lz); // facing out of the hemicycle
  const gy = ctx.groundAt(lx, lz);
  const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(lx, gy, lz);
  const d = new Draw(b, m);
  // Frame (+z outward from the hemicycle wall): broken brick arch, dark passage, rubble.
  d.span('brick', -2.6, -0.3, -3.0, -1.3, 3.6, 0.2, { collide: true });
  d.span('brick', 1.3, -0.3, -3.0, 2.6, 3.0, 0.2, { collide: true });
  d.span('brick', -2.6, 3.0, -3.0, 0.6, 4.0, 0.2);
  d.span('black', -1.3, -0.2, -3.2, 1.3, 3.0, -2.9, { collide: true });
  d.span('concrete', -1.3, -0.2, -2.9, 1.3, 0.02, 0.2);
  const rng = new Rng('domus-aurea');
  for (let i = 0; i < 9; i++) {
    const x = rng.range(-2.2, 2.4);
    const z = rng.range(-0.5, 2.5);
    const s = rng.range(0.25, 0.7);
    d.box(rng.chance(0.5) ? 'brick' : 'concrete', x, s / 2 - 0.1, z, s * 1.4, s, s, { ry: rng.range(0, 3), rx: rng.range(-0.3, 0.3) });
  }
  // A fresco fragment glimpsed inside (the gilded vaults of Nero).
  d.span('stucco_painted', -1.2, 1.4, -2.88, 1.2, 2.6, -2.86);
  spots.push({ id: 'domus-aurea-entrance', kind: 'door', position: new THREE.Vector3(0, 0.05, 1.2).applyMatrix4(m), heading: yaw + Math.PI });
  return { object: b.build('domus-aurea-buried'), colliders: b.colliders, spots, cullDistance: 500 };
}

export const builders: LandmarkBuilder[] = [
  { handles: ['baths-trajan'], build: buildBathsTrajan },
  { handles: ['baths-titus'], build: buildBathsTitus },
  { handles: ['sette-sale'], build: buildSetteSale },
  { handles: ['domus-aurea-buried'], build: buildDomusAurea },
];
