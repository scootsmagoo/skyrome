/**
 * The way from the player to a quest objective (pure, over injected services so it is testable):
 *
 * - Outside, along the streets: the street graph from the node nearest the player to the node
 *   nearest the objective (StreetRouter), with the nav grid (src/ai/life/navgrid.ts, built only
 *   near the player) for short hops and for the lead from the player onto the street network, so
 *   the route never starts through a wall to reach a node behind it.
 * - Through doors: places are the outside world (null) and the interior cells; doors join them.
 *   A breadth-first search over doors picks the chain, and each place gets its own leg: up to the
 *   door, then on from where the door lets you out.
 * - Inside a cell: the cell's own route (game.interiors.routeWorld), from the route point nearest
 *   the start to the one nearest the end.
 */
import { Polyline } from './polyline';
import type { StreetRouter } from './streetRouter';

export interface P3 {
  x: number;
  y: number;
  z: number;
}

/** The nav grid's part the planner uses (NavGrid fits). */
export interface GridLike {
  ready(x: number, z: number): boolean;
  lineWalkable(ax: number, az: number, bx: number, bz: number): boolean;
  findPath(ax: number, az: number, bx: number, bz: number, maxExpand?: number): { x: number; z: number }[] | null;
}

export interface DoorLink {
  id: string;
  /** The place the door is used from (null = outside), and the place it leads to. */
  from: string | null;
  to: string | null;
  /** Where its prompt is (world). */
  at: P3;
  /** Where it lets you out (world). */
  exit: P3;
}

export interface PlanWorld {
  router: StreetRouter | null;
  grid: GridLike | null;
  /** A cell's walking route in the world (entrance to far end). */
  cellRoute(cell: string): readonly P3[];
  doors(): readonly DoorLink[];
}

export interface Leg {
  /** The place this leg is walked in (null = outside). */
  cell: string | null;
  line: Polyline;
  /** The leg ends at this door (the next leg starts beyond it). */
  door: string | null;
}

/** 'streets': along the street graph or grid; 'direct': a straight line (nothing better known). */
export type PlanStatus = 'streets' | 'direct' | 'failed';

export interface Endpoint extends P3 {
  cell: string | null;
}

/** Search limits. */
export const PLAN = {
  /** Within this plan distance (m) with both ends on the built grid, the grid's own A* is used. */
  gridHop: 90,
  gridExpand: 7000,
  /** Street nodes within this (m) of an end may start or finish the route (the best one wins). */
  entryReach: 45,
  /** Walking off the street graph costs this times its straight length (it may cross a block). */
  offGraph: 1.35,
  /** With no node that near, the nearest one within this (m). */
  nodeReach: 220,
  /** Leading nodes the lead-in may skip (walking past them straight). */
  skipAhead: 14,
  /** Longest lead-in (m) along a straight walkable line. */
  leadMax: 80,
};

/**
 * Plan from `a` to `b` into `legs` (reusing their lines). Returns the worst status of the legs
 * ('failed' when the places are not joined by doors).
 */
export function planRoute(world: PlanWorld, a: Endpoint, b: Endpoint, legs: Leg[]): PlanStatus {
  const chain = doorChain(world.doors(), a.cell, b.cell);
  if (!chain) {
    legs.length = 0;
    return 'failed';
  }
  let status: PlanStatus = 'streets';
  let from: P3 = a;
  let place = a.cell;
  let used = 0;
  const legFor = (cell: string | null, door: string | null): Leg => {
    let leg = legs[used];
    if (!leg) legs[used] = leg = { cell, line: new Polyline(), door };
    leg.cell = cell;
    leg.door = door;
    leg.line.clear();
    used++;
    return leg;
  };
  for (const d of chain) {
    const leg = legFor(place, d.id);
    const s = place === null ? streetLeg(world, from, d.at, leg.line) : cellLeg(world, place, from, d.at, leg.line);
    if (s === 'direct') status = 'direct';
    from = d.exit;
    place = d.to;
  }
  const leg = legFor(place, null);
  const s = place === null ? streetLeg(world, from, b, leg.line) : cellLeg(world, place, from, b, leg.line);
  if (s === 'direct') status = 'direct';
  legs.length = used;
  return status;
}

/** Doors from place `from` to place `to`, fewest first (breadth-first), or null if not joined. */
export function doorChain(doors: readonly DoorLink[], from: string | null, to: string | null): DoorLink[] | null {
  if (from === to) return [];
  const key = (c: string | null) => c ?? '';
  const prev = new Map<string, DoorLink | null>([[key(from), null]]);
  const queue: (string | null)[] = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const d of doors) {
      if (d.from !== cur || prev.has(key(d.to))) continue;
      prev.set(key(d.to), d);
      if (d.to === to) {
        const out: DoorLink[] = [];
        for (let k: DoorLink | null | undefined = d; k; k = prev.get(key(k.from))) out.push(k);
        return out.reverse();
      }
      queue.push(d.to);
    }
  }
  return null;
}

/** Inside a cell: along its route from the point nearest `a` to the point nearest `b`. */
export function cellLeg(world: PlanWorld, cell: string, a: P3, b: P3, out: Polyline): PlanStatus {
  const r = world.cellRoute(cell);
  out.push(a.x, a.y, a.z);
  if (r.length) {
    const i = nearest3(r, a);
    const j = nearest3(r, b);
    if (i <= j) for (let k = i; k <= j; k++) out.push(r[k].x, r[k].y, r[k].z, 0.15);
    else for (let k = i; k >= j; k--) out.push(r[k].x, r[k].y, r[k].z, 0.15);
  }
  out.push(b.x, b.y, b.z, 0.15);
  return r.length ? 'streets' : 'direct';
}

/** The route point nearest a point in 3D (a stair's turns share their plan position). */
function nearest3(r: readonly P3[], p: P3): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < r.length; i++) {
    const d = (r[i].x - p.x) ** 2 + ((r[i].y - p.y) * 1.5) ** 2 + (r[i].z - p.z) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/** Outside: the grid for short hops, else the street graph with a walkable lead at each end. */
export function streetLeg(world: PlanWorld, a: P3, b: P3, out: Polyline): PlanStatus {
  const { router, grid } = world;
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  out.push(a.x, NaN, a.z);
  if (d < 1) {
    out.push(b.x, b.y, b.z);
    return 'streets';
  }
  const gridAt = (x: number, z: number) => !!grid && grid.ready(x, z);
  if (grid && d <= PLAN.gridHop && gridAt(a.x, a.z) && gridAt(b.x, b.z)) {
    if (grid.lineWalkable(a.x, a.z, b.x, b.z)) {
      out.push(b.x, b.y, b.z);
      return 'streets';
    }
    const p = grid.findPath(a.x, a.z, b.x, b.z, PLAN.gridExpand);
    if (p) {
      for (const q of p) out.push(q.x, NaN, q.z);
      out.push(b.x, b.y, b.z);
      return 'streets';
    }
  }
  let nodes = router && !router.empty ? router.routeBetween(a.x, a.z, b.x, b.z, PLAN.entryReach, PLAN.offGraph, PLAN.nodeReach) : null;
  if (router && !router.empty && !nodes) {
    // The objective's street is cut off from the player's (an island of the graph): go to the
    // nearest point of the player's network instead, and straight on from there.
    const na = router.nearest(a.x, a.z, PLAN.nodeReach);
    const nb = na >= 0 ? router.nearest(b.x, b.z, PLAN.nodeReach * 3, router.comp[na]) : -1;
    nodes = nb >= 0 ? router.route(na, nb) : null;
  }
  if (!router || !nodes || !nodes.length) {
    out.push(b.x, b.y, b.z);
    return 'direct';
  }
  const X = router.x;
  const Z = router.z;
  // Lead-in: walk straight past the first nodes when the grid says the line is clear (the nearest
  // node may sit behind the player, or across a wall); else back off any node that only makes the
  // route double back on itself.
  let first = 0;
  if (grid && gridAt(a.x, a.z)) {
    for (let k = Math.min(nodes.length - 1, PLAN.skipAhead); k > 0; k--) {
      const n = nodes[k];
      if (Math.hypot(X[n] - a.x, Z[n] - a.z) > PLAN.leadMax || !gridAt(X[n], Z[n])) continue;
      if (grid.lineWalkable(a.x, a.z, X[n], Z[n])) {
        first = k;
        break;
      }
    }
    if (first === 0 && !grid.lineWalkable(a.x, a.z, X[nodes[0]], Z[nodes[0]])) {
      const p = grid.findPath(a.x, a.z, X[nodes[0]], Z[nodes[0]], PLAN.gridExpand);
      if (p) for (let k = 0; k < p.length - 1; k++) out.push(p[k].x, NaN, p[k].z);
    }
  } else {
    while (first < nodes.length - 1 && doublesBack(a.x, a.z, X[nodes[first]], Z[nodes[first]], X[nodes[first + 1]], Z[nodes[first + 1]])) first++;
  }
  // Lead-out: the same at the far end (the objective's own grid is there only when it is near).
  let last = nodes.length - 1;
  if (grid && gridAt(b.x, b.z)) {
    for (let k = Math.max(first, nodes.length - 1 - PLAN.skipAhead); k < nodes.length - 1; k++) {
      const n = nodes[k];
      if (Math.hypot(X[n] - b.x, Z[n] - b.z) > PLAN.leadMax || !gridAt(X[n], Z[n])) continue;
      if (grid.lineWalkable(X[n], Z[n], b.x, b.z)) {
        last = k;
        break;
      }
    }
  } else {
    while (last > first && doublesBack(b.x, b.z, X[nodes[last]], Z[nodes[last]], X[nodes[last - 1]], Z[nodes[last - 1]])) last--;
  }
  for (let k = first; k <= last; k++) out.push(X[nodes[k]], NaN, Z[nodes[k]]);
  out.push(b.x, b.y, b.z);
  return 'streets';
}

/**
 * Would going p → n → m double back? True when p, standing by the street n → m (within `side` m
 * of it), is already past n toward m, so walking to n first is a detour.
 */
export function doublesBack(px: number, pz: number, nx: number, nz: number, mx: number, mz: number, side = 25): boolean {
  const ex = mx - nx;
  const ez = mz - nz;
  const l2 = ex * ex + ez * ez;
  if (l2 < 1e-6) return true;
  const t = ((px - nx) * ex + (pz - nz) * ez) / l2;
  if (t <= 0) return false;
  const tt = Math.min(1, t);
  return Math.hypot(nx + ex * tt - px, nz + ez * tt - pz) <= side;
}
