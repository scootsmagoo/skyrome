/**
 * The quest route (`game.questRoute`): the way from the player to the tracked quest's next
 * objective, kept up to date for the minimap, the big map and the in-world guide.
 *
 * - The objective comes from the HUD (the same one the compass and the world chevron show).
 * - It plans with src/nav/plan.ts: streets outside, the nav grid near the player, cell routes
 *   inside interiors, and doors between them.
 * - It replans when the objective changes or moves (a person walking), when the player uses a
 *   door, or when the player strays from the route; at most once a second. A plan that finds no
 *   street route (a straight line) or no way at all backs off: 2, 4, 8 … 30 s before the next try.
 * - Nothing runs while every route display is off (Settings → Interface).
 */
import type { Game, System } from '../core/Game';
import type { MarkerTarget } from '../quests/types';
import { planRoute, type DoorLink, type Endpoint, type Leg, type P3, type PlanStatus, type PlanWorld } from './plan';
import { closest } from './polyline';
import { StreetRouter } from './streetRouter';

declare module '../core/Game' {
  interface Game {
    questRoute?: QuestRoute;
  }
}

/** What the route leads to (the HUD's objective). */
export interface RouteGoal {
  /** Identity of the objective: a new key replans at once. */
  key: string;
  x: number;
  y: number;
  z: number;
  target?: MarkerTarget;
}

export type RouteStatus = 'none' | 'streets' | 'direct' | 'failed' | 'arrived';

/** Tuning (game metres and seconds). */
export const ROUTE = {
  every: 0.2,
  /** Off the route by more than this (outside / in a cell) replans. */
  offRoute: 9,
  offRouteCell: 3,
  /** The objective moved this far from the route's end: replan (a person walking). */
  goalMoved: 12,
  /** Within this of the objective: arrived (the route hides). */
  arrive: 4,
  /** Least time between two plans. */
  minGap: 1,
  minGapMoving: 2.5,
  backoffMax: 30,
};

export class QuestRoute implements System {
  readonly name = 'questRoute';
  readonly priority = 905;
  /** The legs from the player to the objective: legs[0] is walked in the player's place. */
  readonly legs: Leg[] = [];
  /** Bumped whenever the legs change (displays cache on it). */
  version = 0;
  status: RouteStatus = 'none';
  /** How far along legs[0] the player stands (m): the displays draw from here on. */
  along = 0;
  /** Where the player is (null = outside, else the cell id), as of the last check. */
  place: string | null = null;
  readonly stats = { plans: 0, failures: 0, lastMs: 0, maxMs: 0 };

  /** Street routes wanted (else doors only). */
  private full = true;
  private router: StreetRouter | null = null;
  private routerSource: unknown = null;
  private timer = 0;
  private clock = 0;
  private nextPlanAt = 0;
  private failures = 0;
  private goalKey = '';
  private goal: Endpoint = { x: 0, y: 0, z: 0, cell: null };
  private seg = 0;
  private readonly c = closest();
  private readonly world: PlanWorld;

  constructor(
    private readonly game: Game,
    private readonly source: () => RouteGoal | null,
  ) {
    this.world = {
      router: null,
      grid: null,
      cellRoute: (cell) => this.game.interiors?.routeWorld(cell) ?? [],
      doors: () => this.doors(),
    };
  }

  /**
   * Any display wants the street route (the maps, the minimap or the trail on the ground). When
   * none does, only the doors are worked out (straight legs, no searches): the compass and the
   * chevron still lead to the door of an interior first.
   */
  get wanted(): boolean {
    const s = this.game.settings.data;
    return s.routeOnMaps !== false || s.routeInWorld === true;
  }

  /** Forget the route (it is planned again on the next check). */
  invalidate() {
    this.goalKey = '';
    this.nextPlanAt = 0;
    this.failures = 0;
  }

  update(dt: number) {
    this.clock += dt;
    this.timer += dt;
    if (this.timer < ROUTE.every) return;
    this.timer = 0;
    const full = this.wanted;
    if (full !== this.full) {
      this.full = full;
      this.invalidate();
    }
    const g = this.source();
    const p = this.game.player?.position;
    if (!g || !p) {
      this.clear('none');
      return;
    }
    const interiors = this.game.interiors;
    const place = interiors?.current() ?? null;
    const placeChanged = place !== this.place;
    this.place = place;
    // Through a door: the old legs are behind you, plan at once (even mid back-off).
    if (placeChanged) this.nextPlanAt = 0;
    const goalChanged = g.key !== this.goalKey;
    if (goalChanged) {
      this.goalKey = g.key;
      this.failures = 0;
      this.nextPlanAt = 0;
      this.goal.cell = goalCell(g.target) ?? interiors?.cellAt(g) ?? null;
    }
    const moved = Math.hypot(g.x - this.goal.x, g.z - this.goal.z) > ROUTE.goalMoved;
    if (goalChanged || moved) {
      this.goal.x = g.x;
      this.goal.y = g.y;
      this.goal.z = g.z;
    }
    // There: nothing left to show (the chevron fades out too).
    if (place === this.goal.cell && Math.hypot(g.x - p.x, g.z - p.z) < ROUTE.arrive && Math.abs(g.y - p.y) < 3) {
      this.clear('arrived');
      return;
    }
    // Where the player stands on the route, searching near the last spot (a route can loop back).
    let off = Infinity;
    const leg = this.legs[0];
    if (leg && leg.cell === place && leg.line.n) {
      // Feet height counts in a cell (a stair's turns share their plan); street legs have no heights.
      const y = place === null ? NaN : p.y;
      const c = leg.line.closest(p.x, p.z, this.c, this.seg - 2, this.seg + 40, y);
      if (c.d > 6) leg.line.closest(p.x, p.z, c, 0, leg.line.n - 1, y);
      this.seg = c.seg;
      this.along = c.along;
      off = c.d;
    }
    const strayed = full && off > (place === null ? ROUTE.offRoute : ROUTE.offRouteCell);
    const need = goalChanged || placeChanged || moved || strayed || !this.legs.length;
    if (!need || this.clock < this.nextPlanAt) return;
    this.plan(p, place, moved && !goalChanged);
  }

  private plan(p: P3, place: string | null, moving: boolean) {
    const t0 = performance.now();
    this.world.router = this.full ? this.streets() : null;
    this.world.grid = this.full ? (this.game.population?.grid ?? null) : null;
    let status: PlanStatus;
    try {
      status = planRoute(this.world, { x: p.x, y: p.y, z: p.z, cell: place }, this.goal, this.legs);
    } catch (err) {
      console.warn('[questRoute] plan failed', err);
      this.legs.length = 0;
      status = 'failed';
    }
    const ms = performance.now() - t0;
    this.stats.plans++;
    this.stats.lastMs = ms;
    this.stats.maxMs = Math.max(this.stats.maxMs, ms);
    this.seg = 0;
    this.along = 0;
    this.status = status;
    this.version++;
    if (status === 'streets' || (!this.full && status === 'direct')) {
      this.failures = 0;
      this.nextPlanAt = this.clock + (moving ? ROUTE.minGapMoving : ROUTE.minGap);
    } else {
      // No street route (a straight line) or no way at all: back off before trying again.
      this.failures++;
      this.stats.failures++;
      this.nextPlanAt = this.clock + Math.min(ROUTE.backoffMax, 2 ** this.failures);
    }
  }

  private clear(status: RouteStatus) {
    if (this.status === status && !this.legs.length) return;
    this.legs.length = 0;
    this.status = status;
    this.along = 0;
    this.seg = 0;
    this.version++;
    if (status === 'none') this.goalKey = '';
  }

  /** The street router over game.streets, rebuilt if the graph object changes. */
  private streets(): StreetRouter | null {
    const g = this.game.streets;
    if (!g) return null;
    if (g !== this.routerSource) {
      this.routerSource = g;
      this.router = new StreetRouter(g);
    }
    return this.router;
  }

  /** Every interior door as a link between places, in world coordinates. */
  private doors(): DoorLink[] {
    const it = this.game.interiors;
    if (!it) return [];
    const out: DoorLink[] = [];
    for (const def of it.all()) {
      for (const d of def.doors ?? []) {
        const at = typeof d.at === 'function' ? d.at(this.game) : d.at;
        const to = typeof d.to.position === 'function' ? d.to.position(this.game) : d.to.position;
        if (!at || !to) continue;
        const atW = d.from === null ? at : it.toWorld(d.from, at);
        const exitW = d.to.interior === null ? to : it.toWorld(d.to.interior, to);
        if (!atW || !exitW) continue;
        // A locked door is still the way (the quest opens it); the route leads to it.
        out.push({ id: d.id, from: d.from, to: d.to.interior, at: { x: atW.x, y: atW.y, z: atW.z }, exit: { x: exitW.x, y: exitW.y, z: exitW.z } });
      }
    }
    return out;
  }
}

/** The cell a marker names (`interior:<cell>:<spot>`), if any. */
export function goalCell(t: MarkerTarget | undefined): string | null {
  if (!t || t.kind !== 'location') return null;
  const m = /^interior:([^:]+):/.exec(t.id);
  return m ? m[1] : null;
}
