/**
 * Mans the stations (crowd/stations.ts) near the player: puts out each one's set dressing (with its
 * collider and fire light) and spawns its people at their posts; sends them off when the station's
 * hours end and clears everything when the player is far away.
 *
 * People appear at a post that is out of sight, or in plain view while it is still far away
 * (≥ 45 m, a few pixels tall), so a stall up an open street is staffed long before the player gets
 * there. Closer and in view, they walk in from somewhere out of sight nearby instead.
 *
 * Shops with a keeper (src/life, docs/modules/life.md): the host names the keeper who stands at a
 * member's post (`keeperFor`), a station whose keeper is dead stays shut (`shut`), and while a
 * keeper's station is off duty with the player about its stall stays out and the shutters go up
 * (`closedDressing`). Market-day stations are manned only on the nundinae (`marketDay`).
 */
import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { RAPIER } from '../core/Physics';
import type { DayPhase } from './crowd/budget';
import { activeStations, memberHeading, STATIONS, stationAnchor, stationPoint, type StationDef, type StationDressing, type StationMember } from './crowd/stations';
import { STATION_SEEN_SPAWN } from './crowd/spawnRules';
import type { Npc } from './Npc';
import { makeAltar, makeAmphorae, makeAnvil, makeBanner, makeBench, makeBrazier, makeCounter, makeMill, makeOven, makeParkedCart, makeScrollTable, makeShutters, makeStall, makeStool, makeTable, makeVats } from './props';

export interface StationHost {
  readonly game: Game;
  readonly player: THREE.Vector3 | null;
  readonly phase: DayPhase;
  /** Is a point in view and unoccluded? */
  isSeen(x: number, y: number, z: number): boolean;
  floorY(x: number, z: number): number | null;
  /**
   * Spawn a station member for its post at (x, z): standing there, or at `from` (out of sight
   * nearby), from where it walks to the post. With `keeper`, that named NPC (src/life) stands there
   * instead of an ambient member.
   */
  spawnMember(def: StationDef, m: StationMember, x: number, z: number, heading: number, from?: { x: number; z: number }, keeper?: string | null): Npc | null;
  /** The named keeper who stands at this member's post (src/life), or null for an ambient member. */
  keeperFor?(def: StationDef, member: number): string | null;
  /** Shut although its hours say open (src/life: its keeper is dead). */
  shut?(def: StationDef): boolean;
  /**
   * The dressing put up while a keeper's station is off duty and the player is near (src/life: the
   * shutters); the station's own dressing stays out with it. Null for an ordinary station, whose
   * dressing is taken in once nobody sees it.
   */
  closedDressing?(def: StationDef): readonly StationDressing[] | null;
  /** A market day (the nundinae): `marketDay` stations are manned only then. */
  marketDay?(): boolean;
  /** A walkable, reachable point within `rMin`–`rMax` of (x, z) that the camera can't see (or null). */
  hiddenNear?(x: number, z: number, rMin: number, rMax: number): { x: number; z: number } | null;
  /** Where someone coming to work here sets out from: a house door nearby (or null). */
  commuteFrom?(x: number, z: number): { x: number; z: number } | null;
  /** Send a member home (walk off, despawn) or remove it at once. */
  dismiss(npc: Npc, now: boolean): void;
  alive(npc: Npc): boolean;
  /** Mark nav-grid cells under dressing as blocked. */
  block(x: number, z: number, r: number): void;
  /**
   * Where a post really goes: the point itself when it is open ground, else the nearest open
   * ground within `r` (null: none, the post is skipped; undefined: the nav grid isn't loaded there
   * yet, ask again later). Authored offsets along a street can land in a shopfront.
   */
  settle?(x: number, z: number, r: number): { x: number; z: number } | null | undefined;
}

/** An empty marker in a piece of dressing's local space (where its lamp burns). */
function lampAt(object: THREE.Object3D, x: number, y: number, z: number): THREE.Object3D {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  object.add(o);
  return o;
}

/** People and dressing appear within this distance of a station (m). */
const SPAWN_R = 85;
/** …and are cleared beyond this one. */
const CLEAR_R = 115;

interface Placed {
  object: THREE.Object3D;
  colliders: RAPIER.Collider[];
  light: { remove(): void } | null;
  animate?: (dt: number) => void;
}

interface Manned {
  def: StationDef;
  members: (Npc | null)[];
  dressing: Placed[];
  /** A keeper's station off duty: the shutters (closedDressing) are up. */
  closed: Placed[];
  shut: boolean;
  active: boolean;
  /** Settled member posts (null: no open ground there, never staffed). */
  posts: ({ x: number; z: number } | null)[];
  /** Opened by the clock with the player about: the staff walk in to work (until this time). */
  commuteUntil: number;
}

export class StationDirector {
  enabled = true;
  readonly manned = new Map<string, Manned>();
  private t = 0;
  private clock = 0;
  private lastPhase: DayPhase | null = null;
  /** Spawn even in view (first fill after a teleport or the boot). */
  private eager = true;

  constructor(
    private readonly host: StationHost,
    readonly defs: readonly StationDef[] = STATIONS,
  ) {}

  /** Fill stations at once next time, even in view (teleport, new game). */
  reset() {
    this.clear();
    this.eager = true;
    this.t = 0;
  }

  update(dt: number) {
    for (const m of this.manned.values()) for (const d of m.dressing) d.animate?.(dt);
    this.clock += dt;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.5;
    const pl = this.host.player;
    if (!pl || !this.enabled) return;
    // The hour turned: stations opening now are staffed by people arriving for work.
    const turned = this.lastPhase !== null && this.lastPhase !== this.host.phase && !this.eager;
    this.lastPhase = this.host.phase;
    const active = new Set(activeStations(pl.x, pl.z, this.host.phase, SPAWN_R, this.defs).filter((d) => this.onDuty(d)).map((d) => d.id));
    // Man the active ones; a keeper's shut station nearby keeps its stall, shuttered.
    for (const def of this.defs) {
      if (active.has(def.id)) {
        const m = this.ensure(def, turned);
        if (!m) continue;
        if (m.shut) {
          // Opening time: the shutters come down and the keeper walks in to work.
          this.unshut(m);
          if (turned) m.commuteUntil = this.clock + 90;
        }
        m.active = true;
        this.fill(m);
      } else if (this.keeperPost(def, pl, SPAWN_R)) {
        const m = this.ensure(def, false);
        if (m && !m.active && !m.shut) this.shutUp(m);
      }
    }
    // Close the others: off duty (walk away) or far (clear).
    for (const [id, m] of [...this.manned]) {
      const a = stationAnchor(m.def);
      const far = !a || Math.hypot(a.x - pl.x, a.z - pl.z) > CLEAR_R;
      const onDuty = this.onDuty(m.def);
      if (far) {
        for (const n of m.members) if (n && this.host.alive(n)) this.host.dismiss(n, true);
        this.undress(m);
        this.manned.delete(id);
      } else if (!onDuty && m.active) {
        m.active = false;
        for (const n of m.members) if (n && this.host.alive(n)) this.host.dismiss(n, false);
        m.members.fill(null);
        if (this.keeperPost(m.def, pl, CLEAR_R)) this.shutUp(m);
      } else if (!onDuty && !m.active) {
        // A keeper's post keeps its stall and shutters while the player is about.
        if (m.shut) continue;
        // Off duty: take the dressing in once nobody sees it.
        if (m.dressing.length && !m.dressing.some((d) => this.host.isSeen(d.object.position.x, d.object.position.y + 0.8, d.object.position.z))) {
          this.undress(m);
          this.manned.delete(id);
        }
      }
    }
    this.eager = false;
  }

  /** Open now: its hours, its market day, and not shut for good. */
  private onDuty(def: StationDef): boolean {
    if (!def.when.includes(this.host.phase)) return false;
    if (def.marketDay && !this.host.marketDay?.()) return false;
    return !this.host.shut?.(def);
  }

  /** A keeper's station (closedDressing not null) within `r` of the player. */
  private keeperPost(def: StationDef, pl: { x: number; z: number }, r: number): boolean {
    if (!this.host.closedDressing || this.host.closedDressing(def) == null) return false;
    const a = stationAnchor(def);
    return !!a && Math.hypot(a.x - pl.x, a.z - pl.z) <= r;
  }

  /** The station's record, created (posts settled, dressing out) on first use; null until its ground is loaded. */
  private ensure(def: StationDef, turned: boolean): Manned | null {
    let m = this.manned.get(def.id);
    if (m) return m;
    const a = stationAnchor(def);
    if (!a) return null;
    const settle = this.host.settle;
    // Posts are settled before the dressing blocks its own ground.
    if (settle && settle(a.x, a.z, 0) === undefined) return null;
    const posts = def.members.map((mem) => {
      const p = stationPoint(a, mem.out, mem.side);
      return settle ? (settle(p.x, p.z, 2.2) ?? null) : p;
    });
    m = { def, members: def.members.map(() => null), dressing: [], closed: [], shut: false, active: false, posts, commuteUntil: turned ? this.clock + 90 : 0 };
    this.manned.set(def.id, m);
    this.dress(m);
    return m;
  }

  /** Put the shutters up (the keeper has gone home, or is dead). */
  private shutUp(m: Manned) {
    m.shut = true;
    const a = stationAnchor(m.def);
    if (!a) return;
    for (const d of this.host.closedDressing?.(m.def) ?? []) {
      const placed = this.place(d, a);
      if (placed) m.closed.push(placed);
    }
  }

  /** Take the shutters down: the station opens. */
  private unshut(m: Manned) {
    m.shut = false;
    this.unplace(m.closed);
  }

  /**
   * Spawn missing members: at the post when it is out of sight or still far away (or on the eager
   * fill after a teleport); near and in view, walking in from out of sight (one hidden point per
   * station and update, shared by its members).
   */
  private fill(m: Manned) {
    const a = stationAnchor(m.def);
    if (!a) return;
    const pl = this.host.player;
    let from: { x: number; z: number } | null | undefined;
    m.def.members.forEach((mem, i) => {
      const cur = m.members[i];
      if (cur && this.host.alive(cur)) return;
      m.members[i] = null;
      const p = m.posts[i];
      if (!p) return;
      const y = this.host.floorY(p.x, p.z);
      if (y === null) return;
      const heading = memberHeading(a, m.def, mem);
      const keeper = this.host.keeperFor?.(m.def, i) ?? null;
      // Opening time: they come along the street from home, seen or not.
      if (this.clock < m.commuteUntil && pl && Math.hypot(p.x - pl.x, p.z - pl.z) < 75) {
        const c = this.host.commuteFrom?.(p.x, p.z);
        if (c) {
          m.members[i] = this.host.spawnMember(m.def, mem, p.x, p.z, heading, c, keeper);
          return;
        }
      }
      const far = !pl || Math.hypot(p.x - pl.x, p.z - pl.z) >= STATION_SEEN_SPAWN;
      if (this.eager || far || !this.host.isSeen(p.x, y + 1.2, p.z)) {
        m.members[i] = this.host.spawnMember(m.def, mem, p.x, p.z, heading, undefined, keeper);
        return;
      }
      if (from === undefined) from = this.host.hiddenNear?.(p.x, p.z, 6, 24) ?? null;
      if (from) m.members[i] = this.host.spawnMember(m.def, mem, p.x, p.z, heading, from, keeper);
    });
  }

  private dress(m: Manned) {
    const a = stationAnchor(m.def);
    if (!a) return;
    for (const d of m.def.dressing ?? []) {
      const placed = this.place(d, a);
      if (placed) m.dressing.push(placed);
    }
    // Stools under the seated (the sit loop's seat is ~0.3 m behind the post).
    m.def.members.forEach((mem, i) => {
      const p = m.posts[i];
      if (!mem.seat || !p) return;
      const h = memberHeading(a, m.def, mem);
      const placed = this.placeAt('stool', p.x - Math.sin(h) * 0.3, p.z - Math.cos(h) * 0.3, h, false);
      if (placed) m.dressing.push(placed);
    });
  }

  private place(d: StationDressing, a: { x: number; z: number; ox: number; oz: number }): Placed | null {
    const want = stationPoint(a, d.out, d.side);
    const p = this.host.settle ? this.host.settle(want.x, want.z, 1.6) : want;
    if (!p) return null;
    return this.placeAt(d.kind, p.x, p.z, Math.atan2(a.ox, a.oz) + (d.turn ?? 0), true, d.out * 7.3 + d.side * 3.1);
  }

  private placeAt(kind: StationDressing['kind'], x: number, z: number, yaw: number, blocks = true, seed = 0): Placed | null {
    const h = this.host;
    const g = h.game;
    const p = { x, z };
    const y = h.floorY(p.x, p.z);
    if (y === null) return null;
    let object: THREE.Object3D;
    let light: Placed['light'] = null;
    let animate: Placed['animate'];
    /** Where a light goes, in the piece's local space (after placement). */
    let lamp: { at: THREE.Object3D; req: Omit<Parameters<NonNullable<Game['lights']>['request']>[0], 'position'> } | null = null;
    // Collider half extents (x across, z along the piece's +Z) and height.
    let half = { x: 0.3, y: 0.5, z: 0.3 };
    switch (kind) {
      case 'brazier': {
        const b = makeBrazier();
        object = b.group;
        half = { x: 0.32, y: 0.5, z: 0.32 };
        lamp = { at: b.flame, req: { intensity: 14, distance: 13, flicker: true, priority: 1.6, glow: 0.45 } };
        break;
      }
      case 'stall-food':
      case 'stall-cloth':
      case 'stall-pots':
        object = makeStall(kind === 'stall-food' ? 'food' : kind === 'stall-cloth' ? 'cloth' : 'pots');
        half = { x: 0.95, y: 0.45, z: 0.45 };
        // An oil lamp on the stall, lit in the dark hours.
        lamp = { at: lampAt(object, 0.55, 1.0, -0.2), req: { intensity: 4, distance: 6.5, flicker: 0.3, night: true, glow: 0.12 } };
        break;
      case 'table':
        object = makeTable();
        half = { x: 0.58, y: 0.4, z: 0.32 };
        break;
      case 'counter':
        object = makeCounter();
        half = { x: 1.1, y: 0.5, z: 0.4 };
        lamp = { at: lampAt(object, -0.8, 1.15, -0.25), req: { intensity: 4, distance: 7, flicker: 0.3, night: true, glow: 0.15 } };
        break;
      case 'amphorae':
        object = makeAmphorae();
        half = { x: 0.95, y: 0.5, z: 0.3 };
        break;
      case 'scrolls':
        object = makeScrollTable();
        half = { x: 0.58, y: 0.4, z: 0.32 };
        break;
      case 'bench':
        object = makeBench();
        half = { x: 0.85, y: 0.25, z: 0.2 };
        break;
      case 'stool':
        object = makeStool();
        half = { x: 0.2, y: 0.25, z: 0.2 };
        break;
      case 'vats':
        object = makeVats();
        half = { x: 1.5, y: 0.3, z: 0.5 };
        break;
      case 'anvil':
        object = makeAnvil();
        half = { x: 0.35, y: 0.35, z: 0.25 };
        break;
      case 'oven': {
        const o = makeOven();
        object = o.group;
        half = { x: 0.8, y: 0.75, z: 0.75 };
        lamp = { at: o.fire, req: { intensity: 9, distance: 9, flicker: true, priority: 1.2, glow: 0.3 } };
        break;
      }
      case 'mill': {
        const mill = makeMill();
        object = mill.group;
        half = { x: 0.8, y: 0.6, z: 0.8 };
        animate = mill.animate;
        break;
      }
      case 'altar': {
        const a = makeAltar();
        object = a.group;
        half = { x: 0.5, y: 0.45, z: 0.4 };
        lamp = { at: a.flame, req: { intensity: 8, distance: 9, flicker: true, priority: 1.2, glow: 0.35 } };
        break;
      }
      case 'shutters':
        object = makeShutters();
        half = { x: 1.15, y: 0.85, z: 0.15 };
        break;
      case 'banner':
        object = makeBanner();
        half = { x: 0.2, y: 1.5, z: 0.2 };
        break;
      case 'cart': {
        const c = makeParkedCart(Math.abs(seed) % 2 < 1 ? 'marble' : 'amphorae');
        object = c.group;
        half = { x: 0.75, y: 0.75, z: 1.6 };
        let ph = Math.abs(seed);
        animate = (dt) => {
          ph += dt;
          // The mule shifts its weight and flicks its tail now and then.
          c.mule.animate(dt, Math.max(0, Math.sin(ph * 0.4)) * 0.15);
        };
        lamp = { at: c.lamp, req: { intensity: 4, distance: 7, flicker: 0.3, night: true, glow: 0.2 } };
        break;
      }
    }
    object.position.set(p.x, y, p.z);
    object.rotation.y = yaw;
    g.scene.add(object);
    if (lamp && g.lights) {
      object.updateMatrixWorld(true);
      light = g.lights.request({ position: lamp.at.getWorldPosition(new THREE.Vector3()), ...lamp.req });
    }
    // A seat stays clear of physics (its sitter stands where the collider would be).
    const colliders = blocks ? [g.physics.addBox({ x: p.x, y: y + half.y, z: p.z }, half, yaw)] : [];
    if (blocks) h.block(p.x, p.z, Math.max(half.x, half.z) + 0.2);
    return { object, colliders, light, animate };
  }

  private undress(m: Manned) {
    this.unplace(m.dressing);
    this.unplace(m.closed);
    m.shut = false;
  }

  private unplace(list: Placed[]) {
    for (const d of list) {
      d.object.removeFromParent();
      for (const c of d.colliders) this.host.game.physics.removeCollider(c);
      d.light?.remove();
    }
    list.length = 0;
  }

  clear() {
    for (const m of this.manned.values()) {
      for (const n of m.members) if (n && this.host.alive(n)) this.host.dismiss(n, true);
      this.undress(m);
    }
    this.manned.clear();
  }

  /** Station members currently in the world. */
  get count(): number {
    let n = 0;
    for (const m of this.manned.values()) for (const x of m.members) if (x && this.host.alive(x)) n++;
    return n;
  }
}
