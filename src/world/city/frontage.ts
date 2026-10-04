/**
 * Closing the street wall of the golden-path blocks (pure, no Three.js).
 *
 * The CityBlockFiller's lot plan leaves stretches of a block's frontage open where no lot type
 * fits (irregular outlines, shallow corners) and puts the odd small piazza on the street line. On
 * the way in from the Porta Capena that reads as an unfinished lot, so for corridor blocks:
 *
 *   - piazza lots become rows of shops (same footprint);
 *   - every open stretch of a front edge ≥ 4 m gets shop rows as deep as the block allows
 *     (5–10 m, ≤ 12 m wide each);
 *   - what still stays open (too shallow, too narrow) is closed with a compound wall on the
 *     property line, with a gate in the longer stretches.
 *
 * Alleys between lots stay open (they are the way into the yards).
 */
import { obbCorners, obbIntersectsPolygon, obbOverlap, pointInOBB, polygonContainsOBB, distToSegment, type OBB } from '../../arch/fabric/polygon';
import type { LotPlan } from '../../arch/fabric/blockFiller';
import type { Polygon, Vec2 } from '../../arch/fabric/types';
import type { PlanBlock } from './plan';

/** A compound wall on the property line, from a to b (game m), with a gate in the middle. */
export interface FrontWall {
  a: Vec2;
  b: Vec2;
  gate: boolean;
  seed: number;
}

const MIN_SHOP = 4;
const DEPTHS = [10, 8.5, 7, 6, 5];

/** Stretches of each front edge (arc length along the edge) that no lot fronts. */
export function frontGaps(blk: PlanBlock, lots: LotPlan[], edge: number): [number, number][] {
  const o = blk.outline;
  const a = o[edge], b = o[(edge + 1) % o.length];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 1) return [];
  const u: Vec2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], v: Vec2 = [-u[1], u[0]];
  const cover: [number, number][] = [];
  for (const l of lots) {
    let p0 = Infinity, p1 = -Infinity, q0 = Infinity, q1 = -Infinity;
    for (const c of obbCorners(l.obb)) {
      const pu = (c[0] - a[0]) * u[0] + (c[1] - a[1]) * u[1], pv = (c[0] - a[0]) * v[0] + (c[1] - a[1]) * v[1];
      p0 = Math.min(p0, pu); p1 = Math.max(p1, pu); q0 = Math.min(q0, pv); q1 = Math.max(q1, pv);
    }
    // Fronts this edge: its near side within 2 m of the property line.
    if (q0 > 2 || q1 < 0 || p1 < 0 || p0 > len) continue;
    cover.push([Math.max(0, p0), Math.min(len, p1)]);
  }
  cover.sort((x, y) => x[0] - y[0]);
  const gaps: [number, number][] = [];
  let s = 0;
  for (const [c0, c1] of cover) {
    if (c0 > s) gaps.push([s, c0]);
    s = Math.max(s, c1);
  }
  if (s < len) gaps.push([s, len]);
  return gaps.filter(([g0, g1]) => g1 - g0 > 0.6);
}

/** Corridor treatment of a block's lot plan (see the file comment). Returns new lots and walls. */
export function corridorFrontage(blk: PlanBlock, lots0: LotPlan[], seed: number): { lots: LotPlan[]; walls: FrontWall[] } {
  const outline = blk.outline as Polygon;
  const holes = blk.holes as Polygon[];
  const lots = lots0.map((l) => (l.kind === 'piazza' ? { ...l, kind: 'shops' as const } : l));
  const walls: FrontWall[] = [];
  let n = 0;
  const free = (o: OBB) =>
    polygonContainsOBB(outline, o, 0.05) && !lots.some((l) => l.kind !== 'alley' && obbOverlap(l.obb, o, 0.05)) && !holes.some((h) => obbIntersectsPolygon(o, h));
  for (const e of blk.frontEdges) {
    const a = outline[e], b = outline[(e + 1) % outline.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const u: Vec2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], v: Vec2 = [-u[1], u[0]];
    const rotationY = Math.atan2(v[0], v[1]);
    for (const [g0, g1] of frontGaps(blk, lots, e)) {
      const w = g1 - g0;
      const open: [number, number][] = [];
      if (w >= MIN_SHOP) {
        const pieces = Math.ceil(w / 12);
        const pw = w / pieces;
        for (let k = 0; k < pieces; k++) {
          const s0 = g0 + k * pw;
          let placed = false;
          for (const d of DEPTHS) {
            const o: OBB = { c: [a[0] + u[0] * (s0 + pw / 2) + v[0] * (d / 2), a[1] + u[1] * (s0 + pw / 2) + v[1] * (d / 2)], u, v, hu: pw / 2 - 0.03, hv: d / 2 };
            if (!free(o)) continue;
            lots.push({
              id: `${blk.id}:infill${n++}`, kind: 'shops', obb: o, edge: e, rotationY, width: pw - 0.06, depth: d,
              seed: (seed ^ Math.imul(n + 7, 0x9e3779b1)) >>> 0,
              party: { left: false, right: false, back: false }, street: { left: -1, right: -1 },
            });
            placed = true;
            break;
          }
          if (!placed) open.push([s0, s0 + pw]);
        }
      } else open.push([g0, g1]);
      for (const [s0, s1] of open) {
        // A short stretch is walled only between two buildings; at a corner it stays open (a stub
        // of wall standing alone at the end of a frontage reads as a pillar).
        const between = s0 > 0.3 && s1 < len - 0.3;
        if (s1 - s0 < 1.2 || (s1 - s0 < 3 && !between)) continue;
        const inset = 0.3;
        const p: Vec2 = [a[0] + u[0] * s0 + v[0] * inset, a[1] + u[1] * s0 + v[1] * inset];
        const q: Vec2 = [a[0] + u[0] * s1 + v[0] * inset, a[1] + u[1] * s1 + v[1] * inset];
        walls.push({ a: p, b: q, gate: s1 - s0 >= 5, seed: (seed ^ Math.imul(walls.length + 31, 0x85ebca6b)) >>> 0 });
      }
    }
  }
  partyWalls(lots, outline);
  return { lots, walls };
}

/**
 * Party walls and corner streets of every solid lot (the same rule as the filler's planLots: a
 * side is shared when a neighbouring building stands right against it; a free side on the block
 * outline faces a side street).
 */
export function partyWalls(lots: LotPlan[], outline: Polygon) {
  const solid = lots.filter((p) => p.kind !== 'alley' && p.kind !== 'piazza');
  for (const p of solid) {
    const probe = (lx: number, lz: number) => {
      const x = p.obb.c[0] + p.obb.u[0] * lx + p.obb.v[0] * lz, z = p.obb.c[1] + p.obb.u[1] * lx + p.obb.v[1] * lz;
      return solid.some((q) => q !== p && pointInOBB([x, z], q.obb, 0.05));
    };
    const hu = p.obb.hu, hv = p.obb.hv;
    p.party = {
      left: probe(-hu - 0.3, 0) || probe(-hu - 0.3, hv * 0.5) || probe(-hu - 0.3, -hv * 0.5),
      right: probe(hu + 0.3, 0) || probe(hu + 0.3, hv * 0.5) || probe(hu + 0.3, -hv * 0.5),
      back: probe(0, hv + 0.3) || probe(hu * 0.5, hv + 0.3) || probe(-hu * 0.5, hv + 0.3),
    };
    const sideEdge = (sx: number) => {
      const c: Vec2 = [p.obb.c[0] + p.obb.u[0] * sx * hu, p.obb.c[1] + p.obb.u[1] * sx * hu];
      let best = -1, bd = 1.2;
      for (let i = 0; i < outline.length; i++) {
        const d = distToSegment(c, outline[i], outline[(i + 1) % outline.length]);
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    };
    p.street = { left: p.party.left ? -1 : sideEdge(-1), right: p.party.right ? -1 : sideEdge(1) };
  }
}

/**
 * Share of a front edge's length that is closed (a lot or a compound wall fronts it), over all
 * the front edges of a block. Used by the tests.
 */
export function frontClosure(blk: PlanBlock, lots: LotPlan[], walls: FrontWall[]): number {
  let total = 0, open = 0;
  const outline = blk.outline;
  for (const e of blk.frontEdges) {
    const a = outline[e], b = outline[(e + 1) % outline.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    total += len;
    for (const [g0, g1] of frontGaps(blk, lots.filter((l) => l.kind !== 'piazza'), e)) {
      // Parts of the gap a wall closes.
      const u: Vec2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
      let closed = 0;
      for (const w of walls) {
        const p0 = (w.a[0] - a[0]) * u[0] + (w.a[1] - a[1]) * u[1], p1 = (w.b[0] - a[0]) * u[0] + (w.b[1] - a[1]) * u[1];
        const off = Math.abs((w.a[0] - a[0]) * -u[1] + (w.a[1] - a[1]) * u[0]);
        if (off > 1) continue;
        closed += Math.max(0, Math.min(g1, Math.max(p0, p1)) - Math.max(g0, Math.min(p0, p1)));
      }
      open += Math.max(0, g1 - g0 - closed);
    }
  }
  return total > 0 ? 1 - open / total : 1;
}
