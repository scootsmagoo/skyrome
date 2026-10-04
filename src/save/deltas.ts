/**
 * Entity deltas (game.deltas) — docs/GDD.md §14.13: what changed in the world since it was
 * generated, keyed on stable ids, saved as the `entityDeltas` section. Named NPCs and authored
 * objects use their content id; procedural objects use
 *   `${worldspace}:${cx},${cz}:${generator}:${index}`   (proceduralId()).
 * Common fields: `dead` (killed NPCs), `looted` (emptied containers), `taken` (picked-up props),
 * `open` (doors), plus anything a system wants to remember (`stack`, `state`…).
 */
import type { EventBus, GameEvents } from '../core/Events';
import '../quests/types';

export type Delta = Record<string, unknown>;

/** Stable id of a procedurally generated object (§14.13). */
export function proceduralId(worldspace: string, cx: number, cz: number, generator: string, index: number): string {
  return `${worldspace}:${cx},${cz}:${generator}:${index}`;
}

declare module '../core/Events' {
  interface GameEvents {
    /** A world delta changed (systems that spawned the entity can react). */
    'delta:changed': { id: string; delta: Delta | undefined };
  }
}

export class EntityDeltas {
  private readonly map = new Map<string, Delta>();

  constructor(private readonly events?: EventBus<GameEvents>) {
    // Killed actors stay dead across saves (§6.14: killed named NPCs are recorded as world deltas).
    // Combat also reports knockouts and flights (tags 'ko' / 'fled'): those people live on.
    events?.on('actor:killed', (e) => {
      if (e.tags?.includes('ko') || e.tags?.includes('fled')) return;
      this.merge(e.victimId, { dead: true });
    });
  }

  get(id: string): Readonly<Delta> | undefined {
    return this.map.get(id);
  }

  has(id: string) {
    return this.map.has(id);
  }

  /** Replace an entity's delta (undefined or {} removes it). */
  set(id: string, delta: Delta | undefined) {
    if (!delta || !Object.keys(delta).length) this.map.delete(id);
    else this.map.set(id, { ...delta });
    this.events?.emit('delta:changed', { id, delta: this.map.get(id) });
  }

  /** Merge fields into an entity's delta. */
  merge(id: string, patch: Delta) {
    this.set(id, { ...(this.map.get(id) ?? {}), ...patch });
  }

  remove(id: string) {
    this.set(id, undefined);
  }

  isDead(id: string): boolean {
    return this.map.get(id)?.dead === true;
  }

  markDead(id: string) {
    this.merge(id, { dead: true });
  }

  isLooted(id: string): boolean {
    return this.map.get(id)?.looted === true;
  }

  markLooted(id: string) {
    this.merge(id, { looted: true });
  }

  /** Every delta whose id starts with `prefix` (e.g. a worldspace or a cell). */
  entries(prefix = ''): [string, Readonly<Delta>][] {
    return [...this.map].filter(([k]) => k.startsWith(prefix));
  }

  get size() {
    return this.map.size;
  }

  serialize() {
    return Object.fromEntries(this.map);
  }

  restore(data: unknown) {
    this.map.clear();
    if (!data || typeof data !== 'object') return;
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) if (v && typeof v === 'object' && !Array.isArray(v)) this.map.set(k, { ...(v as Delta) });
  }
}
