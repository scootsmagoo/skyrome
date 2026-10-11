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
import { EXIT_REACH, type StreetRouter } from './streetRouter';

export interface P3 {
  x: number;
  y: number;
  z: number;
}

/** The nav grid's part the planner uses (NavGrid fits). */
export interface GridLike {
  ready(x: number, z: number): boolean;
  lineWalkable(ax: number, az: number, bx: number, bz: number): boolean;
  /** `lineWalkable` for a body (clear of walls to either side): the leads use it when the grid has it. */
  lineClear?(ax: number, az: number, bx: number, bz: number): boolean;
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
  /** The street-graph nodes the leg walks, in order (empty off the streets): a link the player finds walled is cut by them. */
  nodes?: number[];
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
  /** Street nodes within this (m) of the player may start the route (the best one wins). */
  entryReach: 45,
  /** …and within this (m) of the objective may finish it (a far exit is a long straight lead-out). */
  exitReach: EXIT_REACH,
  /** An exit whose line to the objective the built grid says is blocked costs this much more to walk off the graph. */
  exitBlocked: 4,
  /** …and one whose line the grid cannot judge yet (not built there). */
  exitUnknown: 1.5,
  /** Walking off the street graph costs this times its straight length (it may cross a block). */
  offGraph: 1.35,
  /** With no node that near, the nearest one within this (m). */
  nodeReach: 220,
  /** Leading nodes the lead-in may skip (walking past them straight). */
  skipAhead: 14,
  /** Longest lead-in (m) along a straight walkable line. */
  leadMax: 80,
  /**
   * The route's street links where the grid is built (the city's colliders stand there): a link up to `linkMax` m
   * whose line the grid finds blocked is drawn round on the grid when the way round is at most `roundFactor` times
   * its length plus `roundAdd` m (searched with `linkExpand` cells); with no such way it is cut for the session and
   * the route found again, at most `verifyRounds` times.
   */
  linkMax: 70,
  linkExpand: 2500,
  roundFactor: 2.5,
  roundAdd: 20,
  verifyRounds: 4,
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
    if (!leg) legs[used] = leg = { cell, line: new Polyline(), door, nodes: [] };
    leg.cell = cell;
    leg.door = door;
    leg.line.clear();
    (leg.nodes ??= []).length = 0;
    used++;
    return leg;
  };
  for (const d of chain) {
    const leg = legFor(place, d.id);
    const s = place === null ? streetLeg(world, from, d.at, leg.line, leg.nodes) : cellLeg(world, place, from, d.at, leg.line);
    if (s === 'direct') status = 'direct';
    from = d.exit;
    place = d.to;
  }
  const leg = legFor(place, null);
  const s = place === null ? streetLeg(world, from, b, leg.line, leg.nodes) : cellLeg(world, place, from, b, leg.line);
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
export function streetLeg(world: PlanWorld, a: P3, b: P3, out: Polyline, nodesOut?: number[]): PlanStatus {
  const { router, grid } = world;
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  out.push(a.x, NaN, a.z);
  if (d < 1) {
    out.push(b.x, b.y, b.z);
    return 'streets';
  }
  const gridAt = (x: number, z: number) => !!grid && grid.ready(x, z);
  if (grid && d <= PLAN.gridHop && gridAt(a.x, a.z) && gridAt(b.x, b.z)) {
    if (grid.lineClear ? grid.lineClear(a.x, a.z, b.x, b.z) : grid.lineWalkable(a.x, a.z, b.x, b.z)) {
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
  const clear = (ax: number, az: number, bx: number, bz: number) => (grid!.lineClear ? grid!.lineClear(ax, az, bx, bz) : grid!.lineWalkable(ax, az, bx, bz));
  // Exits are ranked by a clear line to the objective (the grid there, once built, knows the walls).
  const goalGrid = gridAt(b.x, b.z);
  const exitCost = goalGrid && router ? (k: number) => (!gridAt(router.x[k], router.z[k]) ? PLAN.exitUnknown : clear(router.x[k], router.z[k], b.x, b.z) ? 1 : PLAN.exitBlocked) : undefined;
  let nodes = router && !router.empty ? router.routeBetween(a.x, a.z, b.x, b.z, PLAN.entryReach, PLAN.offGraph, PLAN.nodeReach, 60000, { exitReach: PLAN.exitReach, exitCost }) : null;
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
  // The route's own links where the grid is built: one walled with no way round is cut and the route found again.
  if (grid) {
    for (let round = 0; round < PLAN.verifyRounds; round++) {
      const k = walledLink(grid, X, Z, nodes);
      if (k < 0) break;
      const [p, q] = [nodes[k], nodes[k + 1]];
      router.cut(p, q);
      const again = router.routeBetween(a.x, a.z, b.x, b.z, PLAN.entryReach, PLAN.offGraph, PLAN.nodeReach, 60000, { exitReach: PLAN.exitReach, exitCost });
      if (!again || !again.length) {
        // No other way: keep the link (the walk finds its way round, or the stall replan does).
        router.uncut(p, q);
        break;
      }
      nodes = again;
    }
  }
  // Lead-in: walk straight past the first nodes when the grid says the line is clear for a body (the nearest
  // node may sit behind the player, or across a wall); else round what stands between on the grid; else back
  // off any node that only makes the route double back on itself.
  let first = 0;
  if (grid && gridAt(a.x, a.z)) {
    for (let k = Math.min(nodes.length - 1, PLAN.skipAhead); k > 0; k--) {
      const n = nodes[k];
      if (Math.hypot(X[n] - a.x, Z[n] - a.z) > PLAN.leadMax || !gridAt(X[n], Z[n])) continue;
      if (clear(a.x, a.z, X[n], Z[n])) {
        first = k;
        break;
      }
    }
    if (first === 0 && gridAt(X[nodes[0]], Z[nodes[0]]) && !clear(a.x, a.z, X[nodes[0]], Z[nodes[0]])) {
      const p = grid.findPath(a.x, a.z, X[nodes[0]], Z[nodes[0]], PLAN.gridExpand);
      if (p) for (let k = 0; k < p.length - 1; k++) out.push(p[k].x, NaN, p[k].z);
    }
  } else {
    while (first < nodes.length - 1 && doublesBack(a.x, a.z, X[nodes[first]], Z[nodes[first]], X[nodes[first + 1]], Z[nodes[first + 1]])) first++;
  }
  // Lead-out: the same at the far end once the objective's grid is built (it is only near the player); the last
  // stretch is then drawn round what stands between on the grid, not straight through it.
  let last = nodes.length - 1;
  let tail: { x: number; z: number }[] | null = null;
  if (grid && goalGrid) {
    for (let k = Math.max(first, nodes.length - 1 - PLAN.skipAhead); k < nodes.length - 1; k++) {
      const n = nodes[k];
      if (Math.hypot(X[n] - b.x, Z[n] - b.z) > PLAN.leadMax || !gridAt(X[n], Z[n])) continue;
      if (clear(X[n], Z[n], b.x, b.z)) {
        last = k;
        break;
      }
    }
    const n = nodes[last];
    if (gridAt(X[n], Z[n]) && !clear(X[n], Z[n], b.x, b.z)) {
      const p = grid.findPath(X[n], Z[n], b.x, b.z, PLAN.gridExpand);
      if (p && p.length) tail = p;
    }
  } else {
    while (last > first && doublesBack(b.x, b.z, X[nodes[last]], Z[nodes[last]], X[nodes[last - 1]], Z[nodes[last - 1]])) last--;
  }
  for (let k = first; k <= last; k++) {
    // A link the grid finds blocked but with a short way round is drawn along that way.
    if (k > first && grid) {
      const r = roundLink(grid, X[nodes[k - 1]], Z[nodes[k - 1]], X[nodes[k]], Z[nodes[k]]);
      if (r) for (let j = 0; j < r.length - 1; j++) out.push(r[j].x, NaN, r[j].z);
    }
    out.push(X[nodes[k]], NaN, Z[nodes[k]]);
  }
  if (nodesOut) for (let k = first; k <= last; k++) nodesOut.push(nodes[k]);
  if (tail) for (let k = 0; k < tail.length - 1; k++) out.push(tail[k].x, NaN, tail[k].z);
  out.push(b.x, b.y, b.z);
  return 'streets';
}

/** A straight walk the grid finds clear for a body (`lineClear`, else the cell line `lineWalkable`). */
export function lineOk(grid: GridLike, ax: number, az: number, bx: number, bz: number): boolean {
  return grid.lineClear ? grid.lineClear(ax, az, bx, bz) : grid.lineWalkable(ax, az, bx, bz);
}

/**
 * A link the grid can judge: both ends and its middle built, not too long. (A node standing in a wall is judged too:
 * its line is blocked, and the way round starts from the open cell beside it, `findPath`; none, and the link is cut.)
 */
export function judged(grid: GridLike, ax: number, az: number, bx: number, bz: number): boolean {
  if (Math.hypot(bx - ax, bz - az) > PLAN.linkMax) return false;
  return grid.ready(ax, az) && grid.ready(bx, bz) && grid.ready((ax + bx) / 2, (az + bz) / 2);
}

/**
 * The way round a street link a–b on the grid when its straight line is blocked for a body and the way round is short
 * (`PLAN.roundFactor`); null when the line is clear, the grid cannot judge it, or there is no short way.
 */
export function roundLink(grid: GridLike, ax: number, az: number, bx: number, bz: number): { x: number; z: number }[] | null {
  if (!judged(grid, ax, az, bx, bz) || lineOk(grid, ax, az, bx, bz)) return null;
  const p = grid.findPath(ax, az, bx, bz, PLAN.linkExpand);
  if (!p || !p.length) return null;
  let len = 0;
  let px = ax, pz = az;
  for (const q of p) ((len += Math.hypot(q.x - px, q.z - pz)), (px = q.x), (pz = q.z));
  return len <= Math.hypot(bx - ax, bz - az) * PLAN.roundFactor + PLAN.roundAdd ? p : null;
}

/** The first link of `nodes` the grid finds walled with no short way round (`roundLink`), or −1. */
export function walledLink(grid: GridLike, X: ArrayLike<number>, Z: ArrayLike<number>, nodes: readonly number[]): number {
  for (let k = 0; k + 1 < nodes.length; k++) {
    const ax = X[nodes[k]], az = Z[nodes[k]], bx = X[nodes[k + 1]], bz = Z[nodes[k + 1]];
    if (!judged(grid, ax, az, bx, bz) || lineOk(grid, ax, az, bx, bz)) continue;
    if (!roundLink(grid, ax, az, bx, bz)) return k;
  }
  return -1;
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
