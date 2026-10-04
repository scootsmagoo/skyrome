/**
 * Street life along the Vicus Tuscus between the Forum and the Velabrum (and anywhere a Forum
 * landmark has to face a street): a row of tabernae built against a blank warehouse flank, paved
 * aprons from shop fronts to the kerb, a paved court before a temple, street lamps lit at dusk and
 * a few people at their trades.
 *
 *  - `tabernaeRow`: lean-to shops (walk-in rooms with the fabric kit's trade fittings, party walls,
 *    a fascia with painted signs, striped awnings over some, a tiled shed roof) on a common raised
 *    floor, vendor spots inside;
 *  - `apron` / `court`: travertine paving that stays out of the Forum's own paving;
 *  - `streetLamps`: bronze lampstands (and fires for the light pool) along a local polyline.
 *
 * The city module owns the rest of the streets: it should keep out of the paved aprons this
 * module lays (see docs/modules/forum.md).
 */
import * as THREE from 'three';
import type { Draw } from '../../../arch/fabric/draw';
import { shopInterior, type ShopKind } from '../../../arch/fabric/shops';
import { paintedSign } from '../../../arch/common/inscription';
import { placeProp, stripedAwning } from '../../../arch/props';
import type { MaterialId } from '../../../gfx/materialIds';
import { FORUM_PLAZA } from './forum-data';
import { ROADS } from '../../../data/atlas';
import { addFire, atlasToLocal, foundation, pave, pointOnPolyline, projectOnPolyline, type Part, type V2 } from './forum-kit';
import { lampstand } from './forum-life';
import { shedRoof } from './forum-temple';

export type BayKind = ShopKind | 'closed';

/** What the fascia of each trade says (Latin shop signs). */
const SIGNS: Record<ShopKind, string[]> = {
  thermopolium: ['Thermopolium'],
  bakery: ['Pistrinum'],
  fullonica: ['Fullonica'],
  cobbler: ['Sutor'],
  butcher: ['Lanius'],
  wine: ['Vinum', 'Caupona'],
  smithy: ['Faber'],
  barber: ['Tonstrina'],
  moneychanger: ['Argentarius'],
  general: ['Taberna'],
  pottery: ['Figlinae'],
  textile: ['Vestiarius'],
};

const AWNINGS: [MaterialId, MaterialId][] = [
  ['fabric_white', 'fabric_red'],
  ['fabric_white', 'fabric_blue'],
  ['fabric_ochre', 'fabric_red'],
];

export interface TabernaeOpts {
  /** Spot id prefix: vendor spots `<id>-<i>` stand inside the shops. */
  id: string;
  /** Row frame: origin on the shop-front line at the row's start, −z outward (to the street), +z toward the wall. */
  frame: Draw;
  /** Width of a bay, depth of the shops (m). */
  bay: number;
  depth: number;
  kinds: BayKind[];
  /** Ceiling height over the shop floor (default 3.3). */
  h?: number;
  /** Floor above the ground by this much (default: a hand above the sidewalk's crepido). */
  step?: number;
  /** Party-wall material (default brick). */
  wall?: MaterialId;
  /** Party walls (0..kinds.length) that carry a torch bracket, lit at dusk. */
  torches?: number[];
}

const _v = new THREE.Vector3();

/** A frame point (x along the row, z toward the wall) in the landmark's local frame. */
function toLocal(frame: Draw, x: number, y: number, z: number): THREE.Vector3 {
  return _v.set(x, y, z).applyMatrix4(frame.m).clone();
}

/**
 * Lean-to tabernae against a wall: one shop per bay on a common raised floor, shops of the fabric
 * kit's kinds (or shuttered), party walls between them, a fascia with the trade's painted sign, an
 * awning over every third, and a shed roof over the whole row. The wall itself is the landmark's
 * (the back of each room). Returns the floor height of the row (frame y of its shop floors).
 */
export function tabernaeRow(p: Part, o: TabernaeOpts): number {
  const { b, hi } = p;
  const h = o.h ?? 3.3;
  const n = o.kinds.length;
  const len = n * o.bay;
  const wallMat = o.wall ?? 'brick';
  const rng = p.ctx.rng.fork(`tabernae:${o.id}`);
  // the floor: a step above the highest ground under the row, on a solid foundation
  const corners: V2[] = [
    [0, -0.4],
    [len, -0.4],
    [len, o.depth],
    [0, o.depth],
  ].map(([x, z]) => {
    const v = toLocal(o.frame, x, 0, z);
    return [v.x, v.z] as V2;
  });
  let gmax = -Infinity;
  for (const [x, z] of corners) gmax = Math.max(gmax, p.ctx.groundAt(x, z));
  for (let i = 0; i <= n; i++) {
    const v = toLocal(o.frame, i * o.bay, 0, o.depth * 0.5);
    gmax = Math.max(gmax, p.ctx.groundAt(v.x, v.z));
  }
  const fy = gmax + (o.step ?? CREPIDO + 0.06);
  foundation(p, corners, fy, 'travertine', true);
  const fr = o.frame.at(0, fy - o.frame.m.elements[13], 0);
  // party walls (the thin side walls of each room hide inside them) and the fascia beam
  for (let i = 0; i <= n; i++) {
    const x = i * o.bay;
    const edge = i === 0 || i === n;
    const w = edge ? 0.45 : 0.6;
    const xc = edge ? (i === 0 ? w / 2 : x - w / 2) : x;
    fr.box(wallMat, xc, (h + 0.5) / 2, o.depth / 2 - 0.1, w, h + 0.5, o.depth + 0.2, { collide: p.main });
  }
  // torches on the party walls
  for (const i of o.torches ?? []) {
    const x = Math.min(len - 0.3, Math.max(0.3, i * o.bay));
    if (hi) placeProp(fr, 'torch_bracket', x, 2.35, -0.02, 0, { collide: false });
    const v = toLocal(fr, x, 2.9, -0.35);
    addFire(p, v.x, v.y, v.z, { night: true, intensity: 7, distance: 8, glow: 0.3 });
  }
  // beam, cornice and roof over the row
  fr.box('wood_dark', len / 2, h - 0.12, -0.05, len, 0.5, 0.3, { shadow: false });
  fr.box('travertine', len / 2, h + 0.4, -0.12, len + 0.5, 0.14, 0.5);
  shedRoof(b, -0.25, len + 0.25, o.depth + 0.1, -0.5, h + 1.15, h + 0.35, 'roof_tile', fr.m);
  fr.box('plaster_cream', len / 2, h + 0.7, o.depth + 0.0, len, 1.0, 0.2);
  for (let i = 0; i < n; i++) {
    const kind = o.kinds[i];
    const cx = (i + 0.5) * o.bay;
    const w = o.bay - 0.6;
    const bf = fr.at(cx, 0, 0);
    if (kind === 'closed') {
      // shuttered: planks and a door leaf, a lamp niche over it
      bf.span('wood_dark', -w / 2, 0, 0.02, w / 2, h - 0.3, 0.12, { collide: p.main });
      for (let k = 0; k < 5; k++) bf.box('wood', -w / 2 + (k + 0.5) * (w / 5), (h - 0.3) / 2, 0.0, 0.05, h - 0.4, 0.04, { shadow: false });
      continue;
    }
    shopInterior(bf.noShadow(), kind, { w, depth: o.depth, h, t: 0.15, wealth: 0.3 }, rng.fork(i));
    // the room's back and side walls hold the player in; the front stays open
    if (p.main) bf.solid(-w / 2 - 0.2, 0, o.depth - 0.02, w / 2 + 0.2, h, o.depth + 0.3);
    // the fascia sign, and an awning over some of the shops
    if (hi) {
      const sign = SIGNS[kind];
      paintedSign(b, sign, Math.min(1.9, w * 0.6), 0.34, bf.m.clone().multiply(new THREE.Matrix4().makeTranslation(0, h - 0.12, -0.24)), { ink: '#9A3A24' });
      if (i % 3 === 1) stripedAwning(bf, -w / 2, w / 2, -1.5, 0.05, h - 0.55, h - 0.1, AWNINGS[((i / 3) | 0) % AWNINGS.length]);
    }
    const v = toLocal(bf, 0, 0, o.depth * 0.5);
    p.spot(`${o.id}-${i}`, 'vendor', v.x, v.y, v.z, headingOut(o.frame));
  }
  return fy;
}

/** Heading (model +Z forward) of a person facing out of a row frame (its −z). */
function headingOut(frame: Draw): number {
  const out = new THREE.Vector3(0, 0, -1).transformDirection(frame.m);
  return Math.atan2(out.x, out.z);
}

// ---------------------------------------------------------------- paving

/** The Forum's own paving as a local polygon: street paving keeps out of it. */
function plazaLocal(p: Part): V2[] {
  return FORUM_PLAZA.map(([x, z]) => atlasToLocal(p.ctx, x, z));
}

/**
 * Pave a local polygon (travertine slabs on the terrain) leaving the Forum's own paving alone. The
 * polygon is sampled every `cell` metres, so it follows the ground.
 */
export function court(p: Part, poly: V2[], o: { lift?: number; cell?: number; material?: MaterialId } = {}) {
  pave(p, poly, { material: o.material ?? 'paving_travertine', lift: o.lift ?? CREPIDO, cell: o.cell ?? (p.hi ? 2.5 : 6), exclude: [plazaLocal(p)] });
}

/**
 * Height of a street sidewalk or a precinct court above the ground: the crepido stood a step above
 * the roadway (Pompeii's are 0.3 m). It also reads as built-over to the terrain dressing, which
 * keeps grass and trees off it (thin paving, under 0.25 m, would let them grow through).
 */
export const CREPIDO = 0.3;

/**
 * A paved sidewalk along one side of an atlas road between two atlas points (real metres): a low
 * travertine kerb along the roadway's edge and travertine slabs `width` real metres wide beyond it.
 * `side` +1 is the left of the road as its points are listed, −1 the right. Keeps out of the
 * Forum's own paving.
 */
export function sidewalk(p: Part, roadId: string, side: 1 | -1, from: readonly [number, number], to: readonly [number, number], width: number) {
  const road = ROADS.find((r) => r.id === roadId);
  if (!road) return;
  const s0 = projectOnPolyline(road.points, from);
  const s1 = projectOnPolyline(road.points, to);
  const [sa, sb] = s0 < s1 ? [s0, s1] : [s1, s0];
  const n = Math.max(2, Math.ceil((sb - sa) / 5));
  const hwr = road.width / 2;
  const kerb = 0.25;
  const inner: V2[] = [];
  const outer: V2[] = [];
  for (let i = 0; i <= n; i++) {
    const { p: c, d } = pointOnPolyline(road.points, sa + ((sb - sa) * i) / n);
    const nx = d[1] * side;
    const nz = -d[0] * side;
    inner.push(atlasToLocal(p.ctx, c[0] + nx * (hwr + kerb), c[1] + nz * (hwr + kerb)));
    outer.push(atlasToLocal(p.ctx, c[0] + nx * (hwr + kerb + width), c[1] + nz * (hwr + kerb + width)));
  }
  court(p, [...inner, ...outer.reverse()]);
}

// ---------------------------------------------------------------- lamps

/** Lampstands (lit at dusk) every `every` metres along a local polyline from a to b, offset sideways. */
export function streetLamps(p: Part, a: V2, b: V2, every: number, side = 0) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.round(len / every));
  const ux = (b[0] - a[0]) / (len || 1);
  const uz = (b[1] - a[1]) / (len || 1);
  for (let i = 0; i <= n; i++) {
    const x = a[0] + ux * len * (i / n) - uz * side;
    const z = a[1] + uz * len * (i / n) + ux * side;
    lampstand(p, new THREE.Vector3(x, p.ctx.groundAt(x, z) + 0.06, z));
  }
}

/** A bench against a wall with a seat spot, facing out. */
export function benchSpot(p: Part, id: string, x: number, z: number, y: number, facing: number) {
  placeProp(p.d, 'bench_masonry', x, y, z, -facing + Math.PI, { variant: 0, collide: p.main });
  p.spot(id, 'sit', x, y + 0.45, z, facing);
}

/** A lampstand on the ground (plus `lift`) at local (x, z), lit at dusk. */
export function lampAt(p: Part, x: number, z: number, lift = 0.06) {
  lampstand(p, new THREE.Vector3(x, p.ctx.groundAt(x, z) + lift, z));
}
