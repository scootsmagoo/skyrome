/**
 * Bridge geometry in the bridge's own frame: x = u along the axis (A → B), y = absolute game
 * height, z = v across the deck (−z is the face on the left looking from A to B). The caller
 * places the frame on the map (see index.ts).
 *
 * Stone bridges: one extruded elevation (deck line on top, intrados arcs and piers below, ramps
 * and abutments down to the ground) gives the spandrels, piers and barrel soffits in one piece;
 * travertine arch rings, cutwaters, a string course and parapets are added on top. Timber
 * trestles (Pons Sublicius): pile bents, cap beams, stringers, planking and rails, pegged — no iron.
 */
import * as THREE from 'three';
import { extrudePolygon, type V2 } from '../../arch/common/geom';
import { inscriptionPanel } from '../../arch/common/inscription';
import { Draw } from '../../arch/fabric/draw';
import { placeProp } from '../../arch/props';
import type { MeshBuilder } from '../../gfx/MeshBuilder';
import type { MaterialId } from '../../gfx/materialIds';
import { deckAt, extradosAt, intradosAt, simplifyProfile, type BridgeLayout } from './layout';
import type { BridgeStyle } from './specs';

export interface BridgeBuildInput {
  layout: BridgeLayout;
  style: BridgeStyle;
  /** Walkable deck width between the parapets (game m). */
  width: number;
  ground: (u: number) => number;
  waterY: number;
  /** Atlas length between the ends (game m). */
  length: number;
  detail: 'high' | 'low';
}

const PARAPET_T = 0.38;
const PARAPET_H = 1.08;
const PAVE = 0.12;

/** Spots in the bridge frame. */
export interface BridgeSpotLocal {
  id: string;
  kind: string;
  u: number;
  y: number;
  v: number;
  /** Heading in the bridge frame (radians, model +Z convention). */
  heading: number;
}

/** A box between two profile points (u0, y0) → (u1, y1), tilted with the slope, spanning v0..v1, its top on the line. */
function slopedBox(d: Draw, mat: MaterialId, u0: number, y0: number, u1: number, y1: number, v0: number, v1: number, thick: number, o: { collide?: boolean; over?: number; visible?: boolean } = {}) {
  const len = Math.hypot(u1 - u0, y1 - y0) + (o.over ?? 0.04);
  const ang = Math.atan2(y1 - y0, u1 - u0);
  const cx = (u0 + u1) / 2 + Math.sin(ang) * thick * 0.5;
  const cy = (y0 + y1) / 2 - Math.cos(ang) * thick * 0.5;
  if (o.visible === false) {
    // Collider only (walking surfaces, rails): same transform as the box would have.
    const m = d.m.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, (v0 + v1) / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, ang)), new THREE.Vector3(1, 1, 1)));
    const pos = new THREE.Vector3();
    const q = new THREE.Quaternion();
    m.decompose(pos, q, new THREE.Vector3());
    d.b.collider({ kind: 'box', center: pos, half: new THREE.Vector3(len / 2, thick / 2, (v1 - v0) / 2), rotation: q });
    return;
  }
  d.box(mat, cx, cy, (v0 + v1) / 2, len, thick, v1 - v0, { rz: ang, collide: o.collide });
}

export function buildStoneBridge(b: MeshBuilder, frame: THREE.Matrix4, inp: BridgeBuildInput): BridgeSpotLocal[] {
  const { layout: L, style, width, ground, detail } = inp;
  const hi = detail === 'high';
  const d = new Draw(b, frame);
  const half = width / 2 + PARAPET_T;
  const deck = L.deck;
  const topOfBody = (u: number) => deckAt(deck, u) - PAVE;
  const step = hi ? 1 : 2;

  // ---- elevation outline (counter-clockwise does not matter: THREE.Shape normalises it)
  const outline: V2[] = [];
  for (let u = L.start; u < L.end; u += step) outline.push([u, topOfBody(u)]);
  outline.push([L.end, topOfBody(L.end)]);
  const footAt = (u: number) => Math.min(ground(u), inp.waterY) - 0.7;
  // Down the B end, then back along the bottom: abutment B, arches and piers, abutment A.
  const [a0, a1] = L.arcade;
  for (let u = L.end; u > a1 + 0.01; u -= step) outline.push([u, footAt(u)]);
  const arches = L.arches;
  const holes: V2[][] = [];
  if (arches.length) {
    outline.push([a1, footAt(a1)]);
    for (let i = arches.length - 1; i >= 0; i--) {
      const a = arches[i];
      outline.push([a.u1, a.spring]);
      const n = hi ? 24 : 12;
      for (let k = 1; k < n; k++) {
        const u = a.u1 - ((a.u1 - a.u0) * k) / n;
        outline.push([u, intradosAt(a, u) ?? a.spring]);
      }
      outline.push([a.u0, a.spring]);
      const p = L.piers[i - 1];
      if (p) {
        outline.push([p.u1, p.bottom]);
        outline.push([p.u0, p.bottom]);
        if (p.relief) holes.push(reliefHole(p.u0, p.u1, a.spring, Math.min(topOfBody(p.u0), topOfBody(p.u1))));
      }
    }
    outline.push([a0, footAt(a0)]);
  }
  for (let u = Math.min(a0, L.end) - step; u > L.start; u -= step) outline.push([u, footAt(u)]);
  outline.push([L.start, footAt(L.start)]);
  const body = extrudePolygon(dedupe(outline), half * 2, holes.filter((h) => h.length > 0));
  body.translate(0, 0, half);
  b.add(body, style.body, frame);

  // ---- arch rings (travertine voussoirs) on both faces, keystones
  for (const a of arches) {
    const ring = archRing(a.u0, a.u1, a.centreY, a.radius, a.ring, a.spring, hi ? 20 : 10);
    for (const side of [-1, 1]) {
      // extrudePolygon spans z ∈ [−0.07, 0]: shift it so it stands 6 cm proud of either face.
      const g = extrudePolygon(ring, 0.07);
      g.translate(0, 0, side > 0 ? half + 0.06 : -half + 0.01);
      b.add(g, style.trim, frame);
      if (hi) {
        const c = (a.u0 + a.u1) / 2;
        const top = a.centreY + a.radius;
        d.box(style.trim, c, top + a.ring * 0.45, side * (half + 0.06), Math.max(0.5, a.ring * 0.55), a.ring * 1.05, 0.14);
      }
      // Impost blocks at the springings.
      for (const u of [a.u0, a.u1]) d.box(style.trim, u, a.spring - 0.15, side * (half + 0.05), 1.0, 0.3, 0.12);
    }
  }

  // ---- piers: cutwaters both sides (pointed), capped with a sloping travertine hood
  for (const p of L.piers) {
    const pw = p.u1 - p.u0;
    const spring = arches[0]?.spring ?? inp.waterY + 0.4;
    const top = spring + 0.9;
    for (const side of [-1, 1]) {
      const reach = pw * 0.55;
      const tri: V2[] = side > 0
        ? [[p.u0, half], [p.u1, half], [(p.u0 + p.u1) / 2, half + reach]]
        : [[p.u0, -half], [(p.u0 + p.u1) / 2, -half - reach], [p.u1, -half]];
      const g = prismXZ(tri, p.bottom, top);
      b.add(g, style.body, frame);
      // Hood: a pyramid from the triangle up to the face.
      const apex = new THREE.Vector3((p.u0 + p.u1) / 2, top + reach * 0.55, side * half);
      const t3 = tri.map(([u, v]) => new THREE.Vector3(u, top, v));
      const pos: number[] = [];
      for (let k = 0; k < 3; k++) {
        const pa = t3[k];
        const pb = t3[(k + 1) % 3];
        pos.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z, apex.x, apex.y, apex.z);
      }
      d.tris(style.trim, flipTris(pos));
      d.solid(p.u0 + pw * 0.2, p.bottom, side * half, p.u1 - pw * 0.2, top, side * (half + reach * 0.6));
    }
    d.solid(p.u0, p.bottom, -half, p.u1, spring, half);
  }

  // ---- deck: paving, string course, parapets, colliders
  const runs = simplifyProfile(deck, 0.05);
  for (let i = 0; i < runs.length - 1; i++) {
    const [u0, y0] = runs[i];
    const [u1, y1] = runs[i + 1];
    slopedBox(d, 'paving_basalt', u0, y0, u1, y1, -width / 2, width / 2, PAVE + 0.02);
    // Walking surface collider (thick so fast players never tunnel), whole body width.
    slopedBox(d, 'paving_basalt', u0, y0, u1, y1, -half, half, 0.6, { collide: true, over: 0.3, visible: false });
    for (const side of [-1, 1]) {
      const v0 = side > 0 ? width / 2 : -half;
      const v1 = side > 0 ? half : -width / 2;
      // parapet slab + coping
      const py0 = y0 + PARAPET_H;
      const py1 = y1 + PARAPET_H;
      slopedBox(d, style.trim, u0, py0 - 0.12, u1, py1 - 0.12, v0, v1, PARAPET_H - 0.12, { collide: true });
      slopedBox(d, style.trim, u0, py0, u1, py1, v0 - 0.05, v1 + 0.05, 0.12);
      // string course (cornice) under the parapet on the face
      const sv0 = side > 0 ? half : -half - 0.14;
      const sv1 = side > 0 ? half + 0.14 : -half;
      slopedBox(d, style.trim, u0, y0 - 0.12, u1, y1 - 0.12, sv0, sv1, hi ? 0.32 : 0.26);
    }
  }
  // Solid sides under the ramps and abutments (so nobody walks into the bridge body).
  for (let i = 0; i < runs.length - 1; i++) {
    const [u0, y0] = runs[i];
    const [u1, y1] = runs[i + 1];
    if (u1 > a0 && u0 < a1) continue;
    const lo = Math.min(footAt(u0), footAt(u1));
    const top = Math.min(y0, y1) - 0.6;
    if (top - lo > 0.2) d.solid(u0, lo, -half, u1, top, half);
  }
  // End posts where the parapets stop.
  for (const [u, dir] of [[L.start, 1], [L.end, -1]] as const) {
    const y = deckAt(deck, u + dir * 0.3);
    for (const side of [-1, 1]) {
      d.box(style.trim, u + dir * 0.35, y + 0.65, side * (width / 2 + PARAPET_T / 2), 0.7, 1.3 + 0.1, PARAPET_T + 0.14, { collide: true });
      if (hi) d.box(style.trim, u + dir * 0.35, y + 1.36, side * (width / 2 + PARAPET_T / 2), 0.8, 0.12, PARAPET_T + 0.24);
    }
  }

  const spots: BridgeSpotLocal[] = [];
  const [cu, cy] = L.crown;
  spots.push({ id: 'crown', kind: 'vista', u: cu, y: cy, v: 0, heading: 0 });
  // ---- inscriptions on both faces above the arches, and on the parapet's inner face
  if (style.inscription) {
    const lines = style.inscription.lines;
    // Over the spandrels at both ends of the arcade, on both faces (four times, as on the bridge):
    // slide from the end arch's crown toward its abutment until the panel fits under the deck.
    const w = Math.min(7, (L.arcade[1] - L.arcade[0]) * 0.18);
    const h = 0.9;
    const freeAt = (u: number) => {
      let lo = -Infinity;
      for (const a of arches) {
        const e = extradosAt(a, u);
        if (e !== null) lo = Math.max(lo, e);
      }
      return { lo, hi: deckAt(deck, u) - 0.5 };
    };
    for (const [ai, dir] of [[0, -1], [arches.length - 1, 1]] as const) {
      const a = arches[ai];
      if (!a) continue;
      const c0 = (a.u0 + a.u1) / 2;
      for (let u = c0; Math.abs(u - c0) < (a.u1 - a.u0); u += dir * 0.25) {
        let lo = -Infinity, hiY = Infinity;
        for (let k = -2; k <= 2; k++) {
          const f = freeAt(u + (k * w) / 4);
          lo = Math.max(lo, f.lo);
          hiY = Math.min(hiY, f.hi);
        }
        if (hiY - lo < h + 0.25) continue;
        const y = hiY - h / 2 - 0.05;
        for (const side of [-1, 1]) {
          const m = new THREE.Matrix4().makeTranslation(u, y, side * (half + 0.02));
          if (side > 0) m.multiply(new THREE.Matrix4().makeRotationY(Math.PI));
          inscriptionPanel(b, { lines, width: w, height: h, style: 'carved', ground: '#e3dac6', border: true }, frame.clone().multiply(m), { depth: 0.05, bodyMaterial: style.trim });
        }
        break;
      }
    }
    if (style.inscription.parapet) {
      for (const side of [-1, 1]) {
        const u = cu + side * 3;
        const y = deckAt(deck, u) + 0.62;
        const m = new THREE.Matrix4().makeTranslation(u, y, side * (width / 2 - 0.01));
        if (side < 0) m.multiply(new THREE.Matrix4().makeRotationY(Math.PI));
        inscriptionPanel(b, { lines: side > 0 ? lines : style.inscription.parapet, width: 2.6, height: 0.6, style: 'carved', ground: '#e3dac6' }, frame.clone().multiply(m), { depth: 0.03, bodyMaterial: style.trim });
        spots.push({ id: `inscription-${side > 0 ? 'b' : 'a'}`, kind: 'inscription', u, y: deckAt(deck, u), v: side * (width / 2 - 0.9), heading: side > 0 ? 0 : Math.PI });
      }
    }
  }
  // ---- herms at the abutment ends [C] (the Pons Fabricius pair of four-faced herms)
  if (style.abutmentHerms && hi) {
    for (const u of [L.end - 1.4]) {
      for (const side of [-1, 1]) placeProp(d, 'herm', u, deckAt(deck, u), side * (width / 2 - 0.45), side > 0 ? Math.PI : 0, { variant: 1 });
    }
  }
  spots.push({ id: 'end-a', kind: 'spawn', u: L.start - 1.5, y: ground(L.start - 1.5), v: 0, heading: Math.PI / 2 });
  spots.push({ id: 'end-b', kind: 'spawn', u: L.end + 1.5, y: ground(L.end + 1.5), v: 0, heading: -Math.PI / 2 });
  return spots;
}

export function buildTimberBridge(b: MeshBuilder, frame: THREE.Matrix4, inp: BridgeBuildInput): BridgeSpotLocal[] {
  const { layout: L, width, ground, waterY, detail } = inp;
  const hi = detail === 'high';
  const d = new Draw(b, frame);
  const deck = L.deck;
  const half = width / 2;
  const runs = simplifyProfile(deck, 0.04);
  const plank = 0.14;
  // Deck planking (across), stringers under it, colliders.
  for (let i = 0; i < runs.length - 1; i++) {
    const [u0, y0] = runs[i];
    const [u1, y1] = runs[i + 1];
    slopedBox(d, 'wood', u0, y0, u1, y1, -half, half, plank);
    slopedBox(d, 'wood', u0, y0, u1, y1, -half, half, 0.6, { collide: true, over: 0.3, visible: false });
    for (const v of [-half + 0.25, -half * 0.35, half * 0.35, half - 0.25]) slopedBox(d, 'wood_dark', u0, y0 - plank, u1, y1 - plank, v - 0.15, v + 0.15, 0.42);
  }
  if (hi) {
    // Plank joints: thin dark strips across the deck every 0.9 m.
    for (let u = L.start + 0.45; u < L.end; u += 0.9) {
      const y = deckAt(deck, u) + 0.004;
      d.box('wood_dark', u, y, 0, 0.03, 0.01, width - 0.1);
    }
  }
  // Pile bents every ~4.5 m where the deck stands clear of the ground.
  const bay = 4.5;
  const piles = hi ? [-half - 0.1, -half * 0.35, half * 0.35, half + 0.1] : [-half, half];
  for (let u = L.start + 2; u <= L.end - 2; u += bay) {
    const y = deckAt(deck, u) - plank - 0.42;
    const g = Math.min(ground(u), waterY + 5);
    if (y - g < 0.6) continue;
    const foot = Math.min(g, waterY) - 0.8;
    for (const v of piles) {
      const batter = Math.abs(v) > half * 0.9 ? Math.sign(v) * 0.35 : 0;
      d.rod('wood_dark', new THREE.Vector3(u, foot, v + batter), new THREE.Vector3(u, y, v), 0.17, hi ? 7 : 5);
    }
    // Cap beam across the bent.
    d.box('wood_dark', u, y - 0.18, 0, 0.36, 0.36, width + 0.7);
    if (hi && y - foot > 2.5) {
      // X braces (pegged) across the bent, above the water.
      const yb = Math.max(foot + 0.5, waterY + 0.3);
      d.rod('wood', new THREE.Vector3(u + 0.12, yb, -half), new THREE.Vector3(u + 0.12, y - 0.35, half), 0.07, 5);
      d.rod('wood', new THREE.Vector3(u + 0.12, yb, half), new THREE.Vector3(u + 0.12, y - 0.35, -half), 0.07, 5);
    }
    d.solid(u - 0.2, foot, -half - 0.3, u + 0.2, y, half + 0.3);
  }
  // Rails: posts every 2.25 m, a hand rail and a mid rail, pegged.
  for (const side of [-1, 1]) {
    const v = side * (half - 0.08);
    for (let u = L.start + 0.3; u <= L.end - 0.3; u += 2.25) {
      const y = deckAt(deck, u);
      d.box('wood_dark', u, y + 0.55, v, 0.16, 1.1, 0.16);
    }
    for (let i = 0; i < runs.length - 1; i++) {
      const [u0, y0] = runs[i];
      const [u1, y1] = runs[i + 1];
      slopedBox(d, 'wood', u0, y0 + 1.1, u1, y1 + 1.1, v - 0.07, v + 0.07, 0.12);
      if (hi) slopedBox(d, 'wood', u0, y0 + 0.6, u1, y1 + 0.6, v - 0.05, v + 0.05, 0.08);
      // Collider: a wall to rail height.
      slopedBox(d, 'wood', u0, y0 + 1.1, u1, y1 + 1.1, v - 0.1, v + 0.1, 1.1, { collide: true, over: 0, visible: false });
    }
  }
  // Earth ramps under the ends where the deck meets the bank: a timber crib box filled with earth.
  const [cu, cy] = L.crown;
  return [
    { id: 'crown', kind: 'vista', u: cu, y: cy, v: 0, heading: 0 },
    // The Argei are thrown into the river from here on the Ides of May (the Vestals and pontiffs).
    { id: 'argei', kind: 'shrine', u: cu, y: cy, v: half - 0.6, heading: 0 },
    { id: 'end-a', kind: 'spawn', u: L.start - 1.5, y: ground(L.start - 1.5), v: 0, heading: Math.PI / 2 },
    { id: 'end-b', kind: 'spawn', u: L.end + 1.5, y: ground(L.end + 1.5), v: 0, heading: -Math.PI / 2 },
  ];
}

// ------------------------------------------------------------------ helpers

/** A flood-relief opening through a pier: round-headed, sized to the pier and the deck above. */
function reliefHole(u0: number, u1: number, spring: number, deckY: number): V2[] {
  const pw = u1 - u0;
  const w = Math.min(pw * 0.48, 3.2);
  const y0 = spring + 0.6;
  const avail = deckY - 0.9 - y0;
  if (avail < w * 0.9) return [];
  const legs = Math.min(avail - w / 2, w * 0.6);
  const c = (u0 + u1) / 2;
  const pts: V2[] = [[c - w / 2, y0], [c + w / 2, y0], [c + w / 2, y0 + legs]];
  const n = 10;
  for (let k = 1; k < n; k++) {
    const a = (Math.PI * k) / n;
    pts.push([c + (Math.cos(a) * w) / 2, y0 + legs + (Math.sin(a) * w) / 2]);
  }
  pts.push([c - w / 2, y0 + legs]);
  return pts;
}

/** Annular arch-ring outline (intrados radius r, depth t) between the springings of an opening. */
function archRing(u0: number, u1: number, cy: number, r: number, t: number, spring: number, n: number): V2[] {
  const c = (u0 + u1) / 2;
  const a0 = Math.asin(Math.min(1, Math.max(-1, (spring - cy) / r)));
  const outer: V2[] = [];
  const inner: V2[] = [];
  for (let k = 0; k <= n; k++) {
    const a = a0 + ((Math.PI - 2 * a0) * k) / n;
    inner.push([c + Math.cos(a) * r, cy + Math.sin(a) * r]);
    outer.push([c + Math.cos(a) * (r + t), cy + Math.sin(a) * (r + t)]);
  }
  return [...inner, ...outer.reverse()];
}

/** Vertical prism over a (u, v) outline from y0 to y1 in the bridge frame. */
function prismXZ(outline: V2[], y0: number, y1: number): THREE.BufferGeometry {
  // extrudePolygon: shape in XY extruded along −Z. Map (u, v) → (u, −v), then rotate −Z → +Y.
  const g = extrudePolygon(outline.map(([u, v]) => [u, -v] as V2), y1 - y0);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y1, 0);
  return g;
}

function flipTris(pos: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < pos.length; i += 9) out.push(pos[i], pos[i + 1], pos[i + 2], pos[i + 6], pos[i + 7], pos[i + 8], pos[i + 3], pos[i + 4], pos[i + 5]);
  return out;
}

function dedupe(pts: V2[]): V2[] {
  const out: V2[] = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (q && Math.abs(q[0] - p[0]) < 1e-4 && Math.abs(q[1] - p[1]) < 1e-4) continue;
    out.push(p);
  }
  return out;
}
