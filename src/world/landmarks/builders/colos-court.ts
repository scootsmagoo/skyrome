/**
 * Courtyard buildings for the Colosseum valley and the Caelian (gladiator schools, barracks, the
 * mint, the watch station, the old curiae): ranges of rooms round a court, an optional portico with
 * an upper gallery, a tiled ring roof sloping into the court, gates through the ranges, tabernae
 * on the street fronts and a few enterable rooms (armoury, infirmary, office…) with their props.
 *
 * Local frame as for every landmark: footprint w × d centred on the origin, front facing −z,
 * floor at y = `floorY` (raise it on slopes; a plinth then runs down to the terrain).
 * Human-scale throughout (storeys 3.2 m, doors 1.0 × 2.1 m, shop openings 2.4 m).
 */
import * as THREE from 'three';
import { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../gfx/materialIds';
import { Draw, doorLeaves, plankShutters, roof, wall, type Opening } from '../../../arch/fabric';
import { placeProp } from '../../../arch/props';
import { column } from '../../../arch/classical/column';
import { Rng } from '../../../core/Rng';
import type { LandmarkBuilder, Spot } from '../types';
import { lampAt, type LampSpec } from './colos-kit';

export const builders: LandmarkBuilder[] = [];

export type Side = 'front' | 'right' | 'back' | 'left';

export interface CourtGate {
  side: Side;
  /** Offset of the gate centre along the side from its middle (m, left→right seen from outside). */
  at?: number;
  width: number;
  height: number;
  arch?: boolean;
  /** Spot id for the gate (kind 'door'). */
  spot?: string;
  /** Travertine frame and a little cornice round the outer opening. */
  frame?: boolean;
}

export type RoomKind = 'armory' | 'medicus' | 'office' | 'workshop' | 'store' | 'shrine' | 'mess' | 'forge' | 'cell';

export interface CourtRoom {
  id: string;
  side: Side;
  at: number;
  width: number;
  kind: RoomKind;
  /** Spot kind exposed at the room (default by kind). */
  spotKind?: string;
  /** Spot id (default: prefix + id). */
  spotId?: string;
}

export interface CourtSpec {
  w: number;
  d: number;
  /** Depth of the ranges of rooms (outer wall face to court wall face). */
  range: number;
  storeys: number;
  storeyH?: number;
  wallMat?: MaterialId;
  courtWallMat?: MaterialId;
  trimMat?: MaterialId;
  portico?: { depth: number; posts?: 'columns' | 'piers' | 'timber'; spacing?: number; material?: MaterialId; gallery?: boolean } | null;
  gates?: CourtGate[];
  /** Shop rows on an outer side between offsets [from, to] along the side. */
  shops?: { side: Side; from: number; to: number }[];
  rooms?: CourtRoom[];
  floor?: MaterialId;
  floorY?: number;
  groundAt?: (x: number, z: number) => number;
  detail?: 'high' | 'low';
  seed?: string | number;
  /** Small windows on the upper storeys of the outer walls (default true). */
  windows?: boolean;
  /** Cell doors on the court walls (default true). */
  cellDoors?: boolean;
  roofPitch?: number;
  /** Outer wall thickness (default 0.6). */
  wallT?: number;
  /** Plinth where the terrain falls away (default: the wall material for brick, else the trim). */
  plinthMat?: MaterialId;
  /** Skip the court floor (the caller paves it). */
  noFloor?: boolean;
  /** Torch brackets either side of every gate on the street front (default true). */
  gateTorches?: boolean;
  /** Prefix for spot ids. */
  prefix: string;
}

export interface CourtResult {
  b: MeshBuilder;
  spots: Spot[];
  /** Flames (gate torches, forges, lamps) in the building's local frame, for `addLamps`. */
  lamps: LampSpec[];
  /** Open court rect (inside the portico), its floor level and the court-wall rect. */
  court: { w: number; d: number; y: number };
  inner: { w: number; d: number };
  height: number;
  rooms: Record<string, { center: THREE.Vector3; heading: number }>;
}

const SIDES: Side[] = ['front', 'right', 'back', 'left'];

/**
 * Frame of a side (fabric wall convention): local +x runs along the side seen from OUTSIDE
 * (left → right), the outer face is at z = 0 facing −z (outward), thickness goes +z (inward).
 * `half` = half size of the rect along x, `halfOther` along z.
 */
export function sideFrame(d: Draw, side: Side, hw: number, hd: number): { f: Draw; len: number } {
  switch (side) {
    case 'front':
      return { f: d.at(-hw, 0, -hd, 0), len: hw * 2 };
    case 'right':
      return { f: d.at(hw, 0, -hd, -Math.PI / 2), len: hd * 2 };
    case 'back':
      return { f: d.at(hw, 0, hd, Math.PI), len: hw * 2 };
    case 'left':
      return { f: d.at(-hw, 0, hd, Math.PI / 2), len: hd * 2 };
  }
}

/** Same as sideFrame but facing INTO the rect (court walls): outer face looks towards the centre. */
function innerSideFrame(d: Draw, side: Side, hw: number, hd: number): { f: Draw; len: number } {
  switch (side) {
    case 'front':
      return { f: d.at(hw, 0, -hd, Math.PI), len: hw * 2 };
    case 'right':
      return { f: d.at(hw, 0, hd, Math.PI / 2), len: hd * 2 };
    case 'back':
      return { f: d.at(-hw, 0, hd, 0), len: hw * 2 };
    case 'left':
      return { f: d.at(-hw, 0, -hd, -Math.PI / 2), len: hd * 2 };
  }
}

/** Heading (radians, +Z model convention) looking OUT of a side. */
export function outHeading(side: Side): number {
  return { front: Math.PI, right: Math.PI / 2, back: 0, left: -Math.PI / 2 }[side];
}

export function courtyardBuilding(spec: CourtSpec): CourtResult {
  const b = new MeshBuilder();
  const low = spec.detail === 'low';
  const d0 = new Draw(b);
  const d = low ? d0.flatWalls() : d0;
  const rng = new Rng(spec.seed ?? spec.prefix);
  const spots: Spot[] = [];
  const lamps: LampSpec[] = [];
  const rooms: CourtResult['rooms'] = {};
  const sh = spec.storeyH ?? 3.2;
  const H = spec.storeys * sh;
  const y0 = spec.floorY ?? 0;
  const W = spec.w;
  const D = spec.d;
  const R = spec.range;
  const P = spec.portico?.depth ?? 0;
  const t = spec.wallT ?? 0.6;
  const ti = 0.45;
  const wallMat = spec.wallMat ?? 'brick';
  const cwMat = spec.courtWallMat ?? 'plaster_cream';
  const trim = spec.trimMat ?? 'travertine';
  const wi = W - 2 * R;
  const di = D - 2 * R;
  const wc = wi - 2 * P;
  const dc = di - 2 * P;
  const ground = spec.groundAt ?? (() => 0);
  const gates = spec.gates ?? [];
  const roomsSpec = spec.rooms ?? [];

  // ---- plinth down to the terrain where it falls away
  let gmin = Infinity;
  for (let i = 0; i <= 8; i++) {
    for (const [x, z] of [[-W / 2 + (W * i) / 8, -D / 2], [-W / 2 + (W * i) / 8, D / 2], [-W / 2, -D / 2 + (D * i) / 8], [W / 2, -D / 2 + (D * i) / 8]] as const) gmin = Math.min(gmin, ground(x, z));
  }
  if (gmin < y0 - 0.05) {
    const pb = gmin - 0.4;
    const pm = spec.plinthMat ?? (wallMat === 'brick' ? 'brick' : trim);
    for (const side of SIDES) {
      const { f, len } = sideFrame(d0, side, W / 2, D / 2);
      f.span(pm, -0.05, pb, -0.06, len + 0.05, y0 + 0.02, t + 0.4, { collide: true });
      // A travertine string course marks the floor level over a tall plinth.
      if (y0 - pb > 1.2 && !low) f.span(trim, -0.1, y0 - 0.16, -0.12, len + 0.1, y0 + 0.02, 0.02);
    }
    // Platform collider under the floor.
    b.collider({ kind: 'box', center: new THREE.Vector3(0, (pb + y0) / 2 - 0.01, 0), half: new THREE.Vector3(W / 2, (y0 - pb) / 2, D / 2) });
  }

  // ---- outer walls with gates, shops and windows
  for (const side of SIDES) {
    const { f, len } = sideFrame(d, side, W / 2, D / 2);
    const fy = f.at(0, y0, 0);
    const ops: Opening[] = [];
    const ground0: [number, number][] = [];
    for (const g of gates.filter((g) => g.side === side)) {
      const c = len / 2 + (g.at ?? 0);
      const o: Opening = { x0: c - g.width / 2, x1: c + g.width / 2, y0: 0, y1: g.height + (g.arch ? g.width / 2 : 0), arch: g.arch ? g.width / 2 : 0, fill: 'black' };
      ops.push(o);
      ground0.push([o.x0, o.x1]);
    }
    for (const s of (spec.shops ?? []).filter((s) => s.side === side)) {
      const from = len / 2 + s.from;
      const to = len / 2 + s.to;
      const n = Math.max(1, Math.floor((to - from) / 3.7));
      const pitch = (to - from) / n;
      for (let i = 0; i < n; i++) {
        const c = from + pitch * (i + 0.5);
        if (ground0.some(([a, z]) => c + 1.4 > a && c - 1.4 < z)) continue;
        // No tabernae where an enterable room stands behind the wall (its furniture fills the depth).
        if (roomsSpec.some((r) => r.side === side && Math.abs(c - (len / 2 + r.at)) < r.width / 2 + 1.4)) continue;
        const o: Opening = { x0: c - 1.2, x1: c + 1.2, y0: 0, y1: 2.6, fill: 'wood' };
        ops.push(o);
        ground0.push([o.x0, o.x1]);
        if (!low) {
          // Dark shop interior behind and plank shutters (some open).
          fy.span('black', o.x0, 0, t + 0.9, o.x1, 2.6, t + 1.0, { collide: true });
          fy.span('wood', o.x0, 0.0, t, o.x1, 0.06, t + 0.9);
          if (rng.chance(0.55)) plankShutters(fy, o, t, rng, true);
          else fy.span('wood_dark', o.x0 - 0.05, 2.6, -0.02, o.x1 + 0.05, 2.75, 0.05);
        } else {
          fy.span('black', o.x0, 0, t * 0.6, o.x1, 2.6, t * 0.7, { collide: true });
        }
      }
    }
    if (spec.windows ?? true) {
      for (let s = 1; s < spec.storeys; s++) {
        const n = Math.floor(len / 3.4);
        for (let i = 0; i < n; i++) {
          const c = ((i + 0.5) * len) / n;
          if (ops.some((o) => o.y1 > s * sh - 0.3 && c > o.x0 - 0.8 && c < o.x1 + 0.8)) continue;
          ops.push({ x0: c - 0.35, x1: c + 0.35, y0: s * sh + 1.0, y1: s * sh + 1.9, fill: 'black' });
        }
      }
    }
    stripWall(fy, wallMat, 0, len, -0.4, H, t, ops);
    if (!low) {
      // Window backs (dark) so the openings read; string course and cornice.
      for (const o of ops) if (o.y0 > 0.5) fy.span('black', o.x0, o.y0, t - 0.05, o.x1, o.y1, t);
      fy.span(trim, -0.06, sh - 0.05, -0.08, len + 0.06, sh + 0.12, 0.02);
      fy.span(trim, -0.1, H - 0.18, -0.16, len + 0.1, H + 0.02, 0.02);
    }
    // Gate frames.
    for (const g of gates.filter((g) => g.side === side)) {
      if (!(g.frame ?? true) || low) continue;
      const c = len / 2 + (g.at ?? 0);
      fy.span(trim, c - g.width / 2 - 0.35, 0, -0.12, c - g.width / 2, g.height + 0.1, 0.02);
      fy.span(trim, c + g.width / 2, 0, -0.12, c + g.width / 2 + 0.35, g.height + 0.1, 0.02);
      fy.span(trim, c - g.width / 2 - 0.5, g.height + (g.arch ? g.width / 2 : 0) + 0.05, -0.18, c + g.width / 2 + 0.5, g.height + (g.arch ? g.width / 2 : 0) + 0.4, 0.02);
    }
    // Colliders: wall pieces between ground-level openings.
    const cuts = ground0.sort((a, z) => a[0] - z[0]);
    let x = 0;
    for (const [a, z] of cuts) {
      if (a > x + 0.05) fy.solid(x, 0, 0, a, H, t);
      fy.solid(a, 4.6, 0, z, H, t);
      x = z;
    }
    if (len > x + 0.05) fy.solid(x, 0, 0, len, H, t);
  }

  // ---- court walls (cell fronts) with doors, gate passages and room openings
  const roomOpen: Record<Side, [number, number][]> = { front: [], right: [], back: [], left: [] };
  for (const side of SIDES) {
    const { f, len } = innerSideFrame(d, side, wi / 2, di / 2);
    const fy = f.at(0, y0, 0);
    // Positions along the INNER frame run the other way to the outer frame: x_in = len - (len_out-based offset).
    const toInner = (offFromMiddle: number) => len / 2 - offFromMiddle;
    const ops: Opening[] = [];
    const open: [number, number][] = [];
    for (const g of gates.filter((g) => g.side === side)) {
      const c = toInner(g.at ?? 0);
      ops.push({ x0: c - g.width / 2, x1: c + g.width / 2, y0: 0, y1: g.height + (g.arch ? g.width / 2 : 0), arch: g.arch ? g.width / 2 : 0 });
      open.push([c - g.width / 2, c + g.width / 2]);
    }
    for (const r of roomsSpec.filter((r) => r.side === side)) {
      const c = toInner(r.at);
      ops.push({ x0: c - 0.8, x1: c + 0.8, y0: 0, y1: 2.4 });
      open.push([c - 0.8, c + 0.8]);
      roomOpen[side].push([c - r.width / 2, c + r.width / 2]);
    }
    const doorsAt: { o: Opening; storey: number }[] = [];
    if (spec.cellDoors ?? true) {
      for (let s = 0; s < spec.storeys; s++) {
        const n = Math.floor(len / 3.2);
        for (let i = 0; i < n; i++) {
          const c = ((i + 0.5) * len) / n;
          if (ops.some((o) => o.y0 <= s * sh + 0.1 && o.y1 > s * sh && c > o.x0 - 0.9 && c < o.x1 + 0.9)) continue;
          if (roomOpen[side].some(([a, z]) => c > a - 0.6 && c < z + 0.6) && s === 0) continue;
          const o: Opening = { x0: c - 0.5, x1: c + 0.5, y0: s * sh, y1: s * sh + 2.1 };
          ops.push(o);
          doorsAt.push({ o, storey: s });
        }
      }
    }
    stripWall(fy, cwMat, 0, len, -0.4, H, ti, ops);
    if (!low) {
      for (const { o } of doorsAt) {
        // Mostly shut timber doors; a few ajar onto a dark cell.
        const ajar = rng.chance(0.2);
        doorLeaves(fy, o, ti, ajar ? 0.6 : 0, 'wood_dark');
        fy.span('black', o.x0, o.y0, ti + 0.6, o.x1, o.y1, ti + 0.65);
        fy.span(trim, o.x0 - 0.06, o.y0 - 0.02, -0.03, o.x1 + 0.06, o.y0 + 0.03, ti);
      }
      // Red dado on the ground storey.
      fy.span('plaster_red', 0, 0.02, -0.015, len, 1.0, 0.0, {});
    }
    // Colliders along the court wall at ground level, open only at gates and rooms.
    const cuts = open.sort((a, z) => a[0] - z[0]);
    let x = 0;
    for (const [a, z] of cuts) {
      if (a > x + 0.05) fy.solid(x, 0, 0, a, H, ti);
      x = z;
    }
    if (len > x + 0.05) fy.solid(x, 0, 0, len, H, ti);
  }

  // ---- gate passages through the ranges
  for (const g of gates) {
    const { f, len } = sideFrame(d0, g.side, W / 2, D / 2);
    const c = len / 2 + (g.at ?? 0);
    const fy = f.at(0, y0, 0);
    const hw = g.width / 2;
    const top = g.height + (g.arch ? hw : 0);
    for (const sx of [-1, 1]) fy.span(cwMat, c + sx * hw, 0, t, c + sx * (hw + 0.3), top + 0.2, R, { collide: true });
    fy.span('concrete', c - hw - 0.3, top, t, c + hw + 0.3, top + 0.3, R);
    fy.span('paving_travertine', c - hw, 0, -0.6, c + hw, 0.04, R + P);
    if (!low && g.side === 'front' && (spec.gateTorches ?? true)) {
      // Torch brackets on the street face either side of the gate (lit from dusk).
      for (const sx of [-1, 1]) {
        const xT = c + sx * (hw + 0.85);
        placeProp(fy, 'torch_bracket', xT, 2.7, 0, 0, { rng, collide: false });
        lamps.push({ at: fy.point(xT, 3.2, -0.32), kind: 'torch' });
      }
    }
    if (g.spot) {
      // On the threshold (the top tread where the building stands on a plinth with steps).
      const p = fy.point(c, 0.05, -0.16);
      spots.push({ id: `${spec.prefix}${g.spot}`, kind: 'door', position: p, heading: outHeading(g.side) + Math.PI });
    }
  }

  // ---- rooms (enterable): cross walls, ceiling, floor, props
  for (const r of roomsSpec) {
    const { f, len } = sideFrame(d0, r.side, W / 2, D / 2);
    const c = len / 2 + r.at;
    const fy = f.at(0, y0, 0);
    const x0 = c - r.width / 2;
    const x1 = c + r.width / 2;
    for (const xx of [x0, x1]) fy.span(cwMat, xx - 0.15, 0, t, xx + 0.15, sh, R, { collide: true });
    fy.span('wood_dark', x0, sh - 0.25, t, x1, sh, R);
    fy.span(r.kind === 'shrine' ? 'mosaic' : 'paving_travertine', x0, 0, t, x1, 0.03, R);
    // Plaster on the back wall, standing 2 cm proud of the masonry (a shared face flickers), and the
    // red dado 1 cm proud of the plaster.
    fy.span(r.kind === 'medicus' ? 'plaster_white' : 'plaster_cream', x0 + 0.15, 0.03, t, x1 - 0.15, sh - 0.25, t + 0.02);
    fy.span('plaster_red', x0 + 0.15, 0.03, t + 0.02, x1 - 0.15, 1.0, t + 0.03);
    const mid = (t + R) / 2;
    const deep = t + 0.45;
    const P2 = (x: number, z: number) => fy.point(x, 0.05, z);
    const head = outHeading(r.side) + Math.PI; // looking into the court
    if (!low) {
      furnishRoom(fy, r.kind, x0, x1, t, R, rng);
      // Flames: the forge fire burns all day; shrine and infirmary lamps are small.
      const back = t + 0.35;
      if (r.kind === 'forge') lamps.push({ at: fy.point(x0 + 1.0, 1.08, back + 0.6), kind: 'hearth', intensity: 18, distance: 10 });
      else if (r.kind === 'shrine') lamps.push({ at: fy.point(c, 1.4, back + 0.2), kind: 'hearth', intensity: 5, distance: 5, glow: 0.1 });
      else if (r.kind === 'medicus') lamps.push({ at: fy.point(c + 0.4, 0.88, back + 0.9), kind: 'lamp', glow: 0.1 });
      else if (r.kind === 'office' || r.kind === 'mess') lamps.push({ at: fy.point(c + 0.35, 0.85, back + 1.2), kind: 'lamp', glow: 0.1 });
    }
    const kindMap: Record<RoomKind, string> = { armory: 'container', medicus: 'npc', office: 'npc', workshop: 'npc', store: 'container', shrine: 'shrine', mess: 'sit', forge: 'npc', cell: 'container' };
    // Containers face the shelves; people stand where the furniture leaves room (see roomStand).
    const spotKind = r.spotKind ?? kindMap[r.kind];
    const person = spotKind === 'npc' || spotKind === 'vendor';
    const [sx, sz] = roomStand(r.kind, c, r.width, deep, mid, person);
    const pos = P2(sx, sz);
    spots.push({ id: r.spotId ?? `${spec.prefix}${r.id}`, kind: spotKind, position: pos, heading: (r.kind === 'armory' || r.kind === 'store') && !person ? head + Math.PI : head });
    rooms[r.id] = { center: P2(c, mid), heading: head };
  }

  // ---- portico (+ gallery) and the court floor
  if (spec.portico && P > 0) {
    const pmat = spec.portico.material ?? 'travertine';
    const posts = spec.portico.posts ?? 'piers';
    const sp = spec.portico.spacing ?? 3.2;
    for (const side of SIDES) {
      const { f, len } = innerSideFrame(d0, side, wc / 2, dc / 2);
      const fy = f.at(0, y0, 0);
      const n = Math.max(1, Math.round(len / sp));
      for (let i = 0; i <= n; i++) {
        if (i === n) continue; // corner post belongs to the next side
        const x = (len * i) / n;
        const ph = sh - 0.4;
        if (posts === 'columns' && !low) {
          column(b, { order: 'tuscan', D: 0.42, height: ph, material: pmat, detail: 'low', kind: 'free', collide: false }, fy.m.clone().multiply(new THREE.Matrix4().makeTranslation(x, 0, 0)));
          fy.solidCyl(x, ph / 2, 0, 0.24, ph);
        } else if (posts === 'timber') {
          fy.box('wood', x, ph / 2, 0, 0.24, ph, 0.24, { collide: true });
        } else {
          fy.box(pmat, x, ph / 2, 0, 0.55, ph, 0.55, { collide: true });
        }
        if (spec.portico.gallery && spec.storeys > 1) {
          fy.box('wood', x, sh + (H - sh) / 2, 0, 0.2, H - sh, 0.2);
        }
      }
      // Beam over the posts and the gallery floor / portico ceiling.
      fy.span(spec.portico.gallery ? 'wood_dark' : pmat, -0.3, sh - 0.4, -0.3, len + 0.3, sh, 0.3);
      fy.span('wood', -0.3, sh - 0.12, 0.3, len + 0.3, sh, P + 0.05);
      // Portico floor.
      fy.span('paving_travertine', -0.3, 0, -0.3, len + 0.3, 0.06, P + 0.05);
      if (spec.portico.gallery && spec.storeys > 1 && !low) {
        // Gallery railing (timber) and the top beam under the eaves.
        fy.span('wood', 0, sh + 0.95, -0.06, len, sh + 1.05, 0.06);
        for (let x = 0.6; x < len; x += 0.6) fy.span('wood', x - 0.03, sh, -0.03, x + 0.03, sh + 0.95, 0.03);
        fy.span('wood_dark', -0.3, H - 0.25, -0.15, len + 0.3, H, 0.15);
      }
    }
  }
  if (!spec.noFloor) d0.span(spec.floor ?? 'dirt', -wc / 2, y0 - 0.1, -dc / 2, wc / 2, y0 + 0.04, dc / 2);

  // ---- ring roof over ranges and portico
  roof(d0.at(0, 0, 0), {
    kind: 'ring',
    w: W,
    d: D,
    y: y0 + H,
    pitch: spec.roofPitch ?? (20 * Math.PI) / 180,
    overhang: 0.45,
    inner: { w: wc, d: dc, overhang: 0.35 },
    ridgeAt: R / (R + P) * 0.85,
    ridges: !low,
  });

  spots.push({ id: `${spec.prefix}court`, kind: 'spawn', position: new THREE.Vector3(0, y0 + 0.05, 0), heading: 0 });
  return { b, spots, lamps, court: { w: wc, d: dc, y: y0 }, inner: { w: wi, d: di }, height: H, rooms };
}

/**
 * A wall from x0..x1, y0..y1, thickness t (outer face z = 0, fabric wall frame) with openings,
 * decomposed into boxes (vertical strips between every opening edge), plus extruded heads over
 * arched openings. Robust where a shape-with-holes triangulation fails on many aligned openings.
 * On a flat-walls (far LOD) frame it defers to the fabric `wall()` (slab + painted openings).
 */
export function stripWall(d: Draw, mat: MaterialId, x0: number, x1: number, y0: number, y1: number, t: number, ops: Opening[]) {
  if (d.flags.flat) {
    wall(d, mat, x0, x1, y0, y1, t, ops);
    return;
  }
  const valid = ops.filter((o) => o.x1 - o.x0 > 0.05 && o.x0 >= x0 && o.x1 <= x1 && o.y1 <= y1);
  const xs = new Set<number>([x0, x1]);
  for (const o of valid) {
    xs.add(o.x0);
    xs.add(o.x1);
  }
  const cuts = [...xs].sort((a, b) => a - b);
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i];
    const b = cuts[i + 1];
    if (b - a < 1e-3) continue;
    const xm = (a + b) / 2;
    const holes = valid.filter((o) => o.x0 <= xm && o.x1 >= xm).map((o) => [o.y0, o.y1] as [number, number]).sort((p, q) => p[0] - q[0]);
    let y = y0;
    for (const [h0, h1] of holes) {
      if (h0 > y + 1e-3) d.span(mat, a, y, 0, b, h0, t);
      y = Math.max(y, h1);
    }
    if (y1 > y + 1e-3) d.span(mat, a, y, 0, b, y1, t);
  }
  // Arched heads: fill between the springing and the crown outside the semicircle.
  for (const o of valid) {
    const rise = Math.min(o.arch ?? 0, (o.x1 - o.x0) / 2);
    if (rise < 0.01) continue;
    const r = (o.x1 - o.x0) / 2;
    const cx = (o.x0 + o.x1) / 2;
    const spring = o.y1 - rise;
    const pts: THREE.Vector2[] = [new THREE.Vector2(o.x0, spring)];
    const n = 8;
    for (let k = 1; k < n; k++) {
      const ang = Math.PI - (Math.PI * k) / n;
      pts.push(new THREE.Vector2(cx + Math.cos(ang) * r, spring + Math.sin(ang) * rise));
    }
    pts.push(new THREE.Vector2(o.x1, spring), new THREE.Vector2(o.x1, o.y1), new THREE.Vector2(o.x0, o.y1));
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: t, bevelEnabled: false });
    d.geo(g, mat, 0, 0, 0);
    g.dispose();
  }
}

/**
 * Where a spot goes in a furnished room (side frame: x along the wall, z inward from the outer
 * wall's inner face `t`; `back` = t + 0.35, the court opening is at the far end). Offices: a person
 * stands behind the desk facing the door, a container is the strongbox. Infirmary: between the bed
 * and the instrument table. Forge and workshop: in the open floor beside the anvil / bench. A store
 * or armoury keeps its container at the shelves and puts a person in the open floor.
 */
function roomStand(kind: RoomKind, c: number, width: number, deep: number, mid: number, person: boolean): [number, number] {
  const back = deep - 0.1; // t + 0.35
  switch (kind) {
    case 'armory':
    case 'store':
      return person ? [c, back + 1.9] : [c, deep + 0.4];
    case 'office':
      return person ? [c, back + 0.4] : [c + width / 2 - 0.65, back + 1.1];
    case 'medicus':
      return [c - 0.9, back + 1.9];
    case 'forge':
      return [c - 0.2, back + 2.4];
    case 'workshop':
      return [c, back + 2.2];
    default:
      return [c, mid];
  }
}

/** Props for an enterable room, in its side frame (x0..x1 along the wall, z from t inward to R). */
function furnishRoom(f: Draw, kind: RoomKind, x0: number, x1: number, t: number, R: number, rng: Rng) {
  const back = t + 0.35;
  const cx = (x0 + x1) / 2;
  switch (kind) {
    case 'armory': {
      // Racks of practice swords (rudes), shields on pegs, a chest of helmets.
      for (const x of [x0 + 0.8, cx, x1 - 0.8]) {
        f.span('wood', x - 0.55, 0, back - 0.15, x + 0.55, 0.08, back + 0.15);
        f.span('wood', x - 0.55, 1.4, back - 0.1, x + 0.55, 1.46, back + 0.1);
        for (let i = 0; i < 6; i++) f.span('wood_dark', x - 0.45 + i * 0.18, 0.08, back - 0.02, x - 0.43 + i * 0.18, 1.5, back + 0.02);
      }
      for (let i = 0; i < 4; i++) {
        const x = x0 + 0.7 + i * ((x1 - x0 - 1.4) / 3);
        f.box(i % 2 ? 'fabric_red' : 'wood_painted', x, 1.9, t + 0.06, 0.62, 0.95, 0.06);
        f.box('bronze', x, 1.9, t + 0.1, 0.12, 0.12, 0.05);
      }
      placeProp(f, 'crate', cx + 0.9, 0, R - 0.9, 0.3, { rng });
      placeProp(f, 'crate', cx - 1.0, 0, R - 0.8, -0.2, { rng });
      break;
    }
    case 'medicus': {
      // Bed, table with instruments and jars, shelves with ointment pots.
      f.span('wood', x0 + 0.3, 0, back, x0 + 1.2, 0.55, back + 2.0, { collide: true });
      f.span('fabric_white', x0 + 0.32, 0.55, back + 0.02, x0 + 1.18, 0.62, back + 1.98);
      placeProp(f, 'table', cx + 0.4, 0, back + 0.9, 0, { rng });
      placeProp(f, 'shelf', x1 - 0.6, 0, back + 0.1, 0, { rng });
      placeProp(f, 'amphora_tall', x1 - 0.5, 0, R - 0.6, 0, { rng });
      placeProp(f, 'oil_lamp', cx + 0.4, 0.8, back + 0.9, 0, { rng, collide: false });
      break;
    }
    case 'office': {
      placeProp(f, 'table', cx, 0, back + 1.2, 0, { rng });
      placeProp(f, 'oil_lamp', cx + 0.35, 0.77, back + 1.2, 0, { rng, collide: false });
      placeProp(f, 'stool', cx, 0, back + 2.0, Math.PI, { rng, variant: 2 });
      placeProp(f, 'shelf', x0 + 0.6, 0, back + 0.1, 0, { rng });
      f.span('iron', x1 - 1.0, 0, back, x1 - 0.3, 0.6, back + 0.5, { collide: true });
      f.span('bronze', x1 - 0.95, 0.6, back + 0.05, x1 - 0.35, 0.64, back + 0.45);
      break;
    }
    case 'forge': {
      placeProp(f, 'forge', x0 + 1.0, 0, back + 0.6, 0, { rng });
      placeProp(f, 'anvil', cx + 0.3, 0, back + 1.6, 0.4, { rng });
      placeProp(f, 'trough', x1 - 0.8, 0, back + 0.5, 0, { rng });
      break;
    }
    case 'workshop': {
      placeProp(f, 'table', cx, 0, back + 1.0, 0, { rng });
      placeProp(f, 'crate', x0 + 0.7, 0, back + 0.5, 0, { rng });
      placeProp(f, 'basket', x1 - 0.6, 0, back + 0.4, 0, { rng });
      break;
    }
    case 'store':
      placeProp(f, 'amphora_rack', cx, 0, back + 0.4, 0, { rng });
      placeProp(f, 'sack', x0 + 0.6, 0, R - 0.7, 0, { rng });
      placeProp(f, 'dolium', x1 - 0.7, 0, R - 0.8, 0, { rng });
      break;
    case 'shrine':
      placeProp(f, 'altar', cx, 0, back + 1.4, 0, { rng });
      f.span('marble', cx - 0.6, 0, back - 0.1, cx + 0.6, 1.2, back + 0.4, { collide: true });
      f.span('plaster_red', cx - 0.7, 1.2, back - 0.12, cx + 0.7, 2.4, back - 0.1);
      placeProp(f, 'oil_lamp', cx, 1.2, back + 0.2, 0, { rng, collide: false });
      break;
    case 'mess':
      placeProp(f, 'table', cx, 0, back + 1.2, 0, { rng });
      placeProp(f, 'oil_lamp', cx + 0.35, 0.77, back + 1.2, 0, { rng, collide: false });
      placeProp(f, 'bench', cx, 0, back + 0.5, 0, { rng });
      placeProp(f, 'bench', cx, 0, back + 1.9, Math.PI, { rng });
      placeProp(f, 'amphora_tall', x0 + 0.5, 0, back + 0.2, 0, { rng });
      break;
    case 'cell':
      f.span('wood', x0 + 0.2, 0, back, x0 + 1.0, 0.45, back + 1.9, { collide: true });
      placeProp(f, 'basket', x1 - 0.5, 0, back + 0.3, 0, { rng });
      break;
  }
}

/** A wooden training post (palus), 1.9 m, in a ring of trampled sand. */
export function palus(d: Draw, x: number, y: number, z: number) {
  d.cyl('wood', x, y + 0.95, z, 0.13, 1.9, 8, { collide: true });
  d.cyl('wood_dark', x, y + 1.85, z, 0.14, 0.1, 8);
  d.cyl('sand', x, y + 0.01, z, 0.9, 0.04, 10);
}

/** A rack of practice weapons standing in the open (yard furniture). */
export function weaponRack(d: Draw, x: number, y: number, z: number, rotY = 0) {
  const f = d.at(x, y, z, rotY);
  f.span('wood', -0.7, 0, -0.12, 0.7, 0.08, 0.12, { collide: true });
  f.span('wood', -0.7, 1.3, -0.08, 0.7, 1.36, 0.08);
  for (const sx of [-0.68, 0.68]) f.span('wood_dark', sx - 0.04, 0, -0.04, sx + 0.04, 1.4, 0.04);
  for (let i = 0; i < 7; i++) f.span(i % 3 ? 'wood_dark' : 'iron', -0.55 + i * 0.18, 0.08, -0.02, -0.53 + i * 0.18, 1.45, 0.02);
}
