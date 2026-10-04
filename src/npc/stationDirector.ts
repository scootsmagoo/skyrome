/**
 * Mans the stations (crowd/stations.ts) near the player: puts out each one's set dressing (with its
 * collider and fire light) and spawns its people at their posts; sends them off when the station's
 * hours end and clears everything when the player is far away.
 *
 * People appear at a post that is out of sight, or in plain view while it is still far away
 * (≥ 45 m, a few pixels tall), so a stall up an open street is staffed long before the player gets
 * there. Closer and in view, they walk in from somewhere out of sight nearby instead.
 */
import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { RAPIER } from '../core/Physics';
import type { DayPhase } from './crowd/budget';
import { activeStations, memberHeading, STATIONS, stationAnchor, stationPoint, type StationDef, type StationDressing, type StationMember } from './crowd/stations';
import { STATION_SEEN_SPAWN } from './crowd/spawnRules';
import type { Npc } from './Npc';
import { makeBrazier, makeParkedCart, makeStall, makeTable } from './props';

export interface StationHost {
  readonly game: Game;
  readonly player: THREE.Vector3 | null;
  readonly phase: DayPhase;
  /** Is a point in view and unoccluded? */
  isSeen(x: number, y: number, z: number): boolean;
  floorY(x: number, z: number): number | null;
  /**
   * Spawn a station member for its post at (x, z): standing there, or at `from` (out of sight
   * nearby), from where it walks to the post.
   */
  spawnMember(def: StationDef, m: StationMember, x: number, z: number, heading: number, from?: { x: number; z: number }): Npc | null;
  /** A walkable, reachable point within `rMin`–`rMax` of (x, z) that the camera can't see (or null). */
  hiddenNear?(x: number, z: number, rMin: number, rMax: number): { x: number; z: number } | null;
  /** Send a member home (walk off, despawn) or remove it at once. */
  dismiss(npc: Npc, now: boolean): void;
  alive(npc: Npc): boolean;
  /** Mark nav-grid cells under dressing as blocked. */
  block(x: number, z: number, r: number): void;
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
  active: boolean;
}

export class StationDirector {
  enabled = true;
  readonly manned = new Map<string, Manned>();
  private t = 0;
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
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.5;
    const pl = this.host.player;
    if (!pl || !this.enabled) return;
    const active = new Set(activeStations(pl.x, pl.z, this.host.phase, SPAWN_R, this.defs).map((d) => d.id));
    // Man the active ones.
    for (const def of this.defs) {
      if (!active.has(def.id)) continue;
      let m = this.manned.get(def.id);
      if (!m) {
        m = { def, members: def.members.map(() => null), dressing: [], active: true };
        this.manned.set(def.id, m);
        this.dress(m);
      }
      m.active = true;
      this.fill(m);
    }
    // Close the others: off duty (walk away) or far (clear).
    for (const [id, m] of [...this.manned]) {
      const a = stationAnchor(m.def);
      const far = !a || Math.hypot(a.x - pl.x, a.z - pl.z) > CLEAR_R;
      const onDuty = m.def.when.includes(this.host.phase);
      if (far) {
        for (const n of m.members) if (n && this.host.alive(n)) this.host.dismiss(n, true);
        this.undress(m);
        this.manned.delete(id);
      } else if (!onDuty && m.active) {
        m.active = false;
        for (const n of m.members) if (n && this.host.alive(n)) this.host.dismiss(n, false);
        m.members.fill(null);
      } else if (!onDuty && !m.active) {
        // Off duty: take the dressing in once nobody sees it.
        if (m.dressing.length && !m.dressing.some((d) => this.host.isSeen(d.object.position.x, d.object.position.y + 0.8, d.object.position.z))) {
          this.undress(m);
          this.manned.delete(id);
        }
      }
    }
    this.eager = false;
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
      const p = stationPoint(a, mem.out, mem.side);
      const y = this.host.floorY(p.x, p.z);
      if (y === null) return;
      const heading = memberHeading(a, m.def, mem);
      const far = !pl || Math.hypot(p.x - pl.x, p.z - pl.z) >= STATION_SEEN_SPAWN;
      if (this.eager || far || !this.host.isSeen(p.x, y + 1.2, p.z)) {
        m.members[i] = this.host.spawnMember(m.def, mem, p.x, p.z, heading);
        return;
      }
      if (from === undefined) from = this.host.hiddenNear?.(p.x, p.z, 6, 24) ?? null;
      if (from) m.members[i] = this.host.spawnMember(m.def, mem, p.x, p.z, heading, from);
    });
  }

  private dress(m: Manned) {
    const a = stationAnchor(m.def);
    if (!a || !m.def.dressing) return;
    for (const d of m.def.dressing) {
      const placed = this.place(d, a);
      if (placed) m.dressing.push(placed);
    }
  }

  private place(d: StationDressing, a: { x: number; z: number; ox: number; oz: number }): Placed | null {
    const h = this.host;
    const g = h.game;
    const p = stationPoint(a, d.out, d.side);
    const y = h.floorY(p.x, p.z);
    if (y === null) return null;
    const yaw = Math.atan2(a.ox, a.oz) + (d.turn ?? 0);
    let object: THREE.Object3D;
    let light: Placed['light'] = null;
    let animate: Placed['animate'];
    /** Where a light goes, in the piece's local space (after placement). */
    let lamp: { at: THREE.Object3D; req: Omit<Parameters<NonNullable<Game['lights']>['request']>[0], 'position'> } | null = null;
    // Collider half extents (x across, z along the piece's +Z) and height.
    let half = { x: 0.3, y: 0.5, z: 0.3 };
    switch (d.kind) {
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
        object = makeStall(d.kind === 'stall-food' ? 'food' : d.kind === 'stall-cloth' ? 'cloth' : 'pots');
        half = { x: 0.95, y: 0.45, z: 0.45 };
        // An oil lamp on the stall, lit in the dark hours.
        lamp = { at: lampAt(object, 0.55, 1.0, -0.2), req: { intensity: 4, distance: 6.5, flicker: 0.3, night: true, glow: 0.12 } };
        break;
      case 'table':
        object = makeTable();
        half = { x: 0.58, y: 0.4, z: 0.32 };
        break;
      case 'cart': {
        const c = makeParkedCart(Math.abs(d.side) % 2 < 1 ? 'marble' : 'amphorae');
        object = c.group;
        half = { x: 0.75, y: 0.75, z: 1.6 };
        let ph = Math.abs(d.out * 7.3 + d.side * 3.1);
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
    const colliders = [g.physics.addBox({ x: p.x, y: y + half.y, z: p.z }, half, yaw)];
    h.block(p.x, p.z, Math.max(half.x, half.z) + 0.2);
    return { object, colliders, light, animate };
  }

  private undress(m: Manned) {
    for (const d of m.dressing) {
      d.object.removeFromParent();
      for (const c of d.colliders) this.host.game.physics.removeCollider(c);
      d.light?.remove();
    }
    m.dressing.length = 0;
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
