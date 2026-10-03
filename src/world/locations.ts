/**
 * Named locations (game.locations): registry plus a system that checks the player's position
 * about four times a second and emits
 *   'location:entered'    once per entry (re-entering after leaving fires again)
 *   'location:exited'     on leaving (with a small margin so standing on the edge doesn't flicker)
 *   'location:discovered' the first time a discoverable location is entered (or discover() is called)
 * Distances are horizontal (xz). Locations come from the atlas (landmark ids) and content.
 */
import type { EventBus, GameEvents } from '../core/Events';
import type { System } from '../core/Game';
import type { LocationDef } from '../npc/types';
import '../rpg/events';

declare module '../core/Game' {
  interface Game {
    locations: LocationRegistry;
  }
}

declare module '../core/Events' {
  interface GameEvents {
    'location:exited': { locationId: string };
  }
}

type Pos = { x: number; y?: number; z: number };

export interface LocationRegistryOptions {
  events?: EventBus<GameEvents>;
  /** Where the player is (feet). Default: nothing, so no events until set. */
  position?: () => Pos | null | undefined;
  /** Seconds between checks. */
  interval?: number;
}

export class LocationRegistry implements System {
  readonly name = 'locations';
  readonly priority = 120;
  interval: number;
  positionSource: () => Pos | null | undefined;
  private readonly defs = new Map<string, LocationDef>();
  private readonly inside = new Set<string>();
  private readonly discovered = new Set<string>();
  private readonly visited = new Set<string>();
  private acc = 0;
  /** After a load the first check records where the player is without firing events. */
  private silentNext = false;
  private readonly events?: EventBus<GameEvents>;

  constructor(opts: LocationRegistryOptions = {}) {
    this.events = opts.events;
    this.positionSource = opts.position ?? (() => null);
    this.interval = opts.interval ?? 0.25;
  }

  // ---------------------------------------------------------------- registry

  add(defs: LocationDef | readonly LocationDef[]) {
    for (const d of Array.isArray(defs) ? defs : [defs as LocationDef]) {
      if (!(d.radius > 0)) console.warn(`[locations] "${d.id}" has no radius`);
      this.defs.set(d.id, d);
    }
  }

  remove(id: string) {
    this.defs.delete(id);
    this.inside.delete(id);
  }

  get(id: string): LocationDef | undefined {
    return this.defs.get(id);
  }

  all(): LocationDef[] {
    return [...this.defs.values()];
  }

  children(parentId: string): LocationDef[] {
    return this.all().filter((d) => d.parent === parentId);
  }

  /** Nearest location (by distance to its center) matching the filter. */
  nearest(pos: Pos, filter?: (d: LocationDef) => boolean): { def: LocationDef; distance: number } | null {
    let best: { def: LocationDef; distance: number } | null = null;
    for (const d of this.defs.values()) {
      if (filter && !filter(d)) continue;
      const distance = Math.hypot(d.position.x - pos.x, d.position.z - pos.z);
      if (!best || distance < best.distance) best = { def: d, distance };
    }
    return best;
  }

  /** Locations whose radius contains the point, innermost (smallest) first. */
  containing(pos: Pos): LocationDef[] {
    return this.all()
      .filter((d) => Math.hypot(d.position.x - pos.x, d.position.z - pos.z) <= d.radius)
      .sort((a, b) => a.radius - b.radius);
  }

  /** The innermost location the player is in, as of the last check. */
  current(): LocationDef | undefined {
    let best: LocationDef | undefined;
    for (const id of this.inside) {
      const d = this.defs.get(id);
      if (d && (!best || d.radius < best.radius)) best = d;
    }
    return best;
  }

  isInside(id: string) {
    return this.inside.has(id);
  }

  // ---------------------------------------------------------------- discovery

  isDiscovered(id: string) {
    return this.discovered.has(id);
  }

  hasVisited(id: string) {
    return this.visited.has(id);
  }

  discoveredList(): LocationDef[] {
    return [...this.discovered].map((id) => this.defs.get(id)).filter((d): d is LocationDef => !!d);
  }

  /** Reveal a location on the map (books, directions from NPCs) or on first entry. */
  discover(id: string): boolean {
    const d = this.defs.get(id);
    if (!d || this.discovered.has(id)) return false;
    this.discovered.add(id);
    this.events?.emit('location:discovered', { locationId: id, name: d.name });
    this.events?.emit('rpg:notify', { text: `Discovered: ${d.name}`, kind: 'location' });
    return true;
  }

  // ---------------------------------------------------------------- system

  update(dt: number) {
    this.acc += dt;
    if (this.acc < this.interval) return;
    this.acc = 0;
    this.check();
  }

  /** Check a position now (default: the position source). */
  check(pos: Pos | null | undefined = this.positionSource()) {
    if (!pos) return;
    const silent = this.silentNext;
    this.silentNext = false;
    // Exits first, with a margin.
    for (const id of [...this.inside]) {
      const d = this.defs.get(id);
      const margin = d ? Math.max(1, d.radius * 0.05) : 0;
      if (!d || Math.hypot(d.position.x - pos.x, d.position.z - pos.z) > d.radius + margin) {
        this.inside.delete(id);
        if (!silent) this.events?.emit('location:exited', { locationId: id });
      }
    }
    // Entries, outermost first so a district is entered before the building inside it.
    for (const d of this.containing(pos).reverse()) {
      if (this.inside.has(d.id)) continue;
      this.inside.add(d.id);
      this.visited.add(d.id);
      if (silent) {
        if (d.discoverable) this.discovered.add(d.id);
        continue;
      }
      this.events?.emit('location:entered', { locationId: d.id });
      if (d.discoverable) this.discover(d.id);
    }
  }

  // ---------------------------------------------------------------- persistence

  serialize() {
    return { discovered: [...this.discovered], visited: [...this.visited] };
  }

  restore(data: unknown) {
    const d = (data ?? {}) as { discovered?: string[]; visited?: string[] };
    this.discovered.clear();
    this.visited.clear();
    this.inside.clear();
    for (const id of Array.isArray(d.discovered) ? d.discovered : []) if (typeof id === 'string') this.discovered.add(id);
    for (const id of Array.isArray(d.visited) ? d.visited : []) if (typeof id === 'string') this.visited.add(id);
    this.silentNext = true;
    this.acc = this.interval;
  }
}
